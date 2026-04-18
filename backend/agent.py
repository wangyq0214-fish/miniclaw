"""
Mini-OpenClaw Agent Module

Agent using DeepAgents framework with streaming support.
"""
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
from pathlib import Path

from langchain_core.tools import BaseTool
from langchain_core.messages import HumanMessage, AIMessage, AIMessageChunk, ToolMessage
from langchain_openai import ChatOpenAI

from config import settings
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from deepagents.middleware.permissions import FilesystemPermission

logger = logging.getLogger(__name__)


class AgentManager:
    """Agent manager using DeepAgents framework."""

    def __init__(self):
        self.tools: List[BaseTool] = []
        self.rag_mode = False
        self.base_dir: Optional[Path] = None
        self.session_manager = None
        self.prompt_builder = None
        self.memory_indexer = None
        self._model = None
        self._backend = None

    async def initialize(
        self,
        base_dir: Path,
        tools: List[BaseTool],
        session_manager,
        prompt_builder,
        memory_indexer
    ):
        """Initialize the agent with tools and dependencies."""
        self.base_dir = base_dir
        self.tools = tools or []
        self.session_manager = session_manager
        self.prompt_builder = prompt_builder
        self.memory_indexer = memory_indexer

        # Initialize model
        self._model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key or "sk-dummy",
            base_url=settings.openai_api_base,
            temperature=0.7,
            extra_body={"think": False},  # disable qwen3 thinking mode for faster streaming
        )

        logger.info(f"AgentManager initialized with model {settings.openai_model} at {settings.openai_api_base}")

        # Initialize filesystem backend rooted at base_dir
        # virtual_mode=True: maps POSIX "/" to root_dir, required for SkillsMiddleware path resolution
        self._backend = FilesystemBackend(
            root_dir=str(self.base_dir),
            virtual_mode=True,
        )

    def set_rag_mode(self, rag_mode: bool):
        """Enable or disable RAG mode."""
        self.rag_mode = rag_mode
        logger.info(f"RAG mode set to: {rag_mode}")

    async def astream(
        self,
        message: str,
        history: List[Dict[str, Any]],
        system_prompt: str,
        session_id: str
    ) -> AsyncGenerator[Dict[str, None], None]:
        """Stream chat response using DeepAgents."""
        try:
            # Handle RAG mode
            if self.rag_mode and self.memory_indexer:
                retrieval_results = self.memory_indexer.retrieve(message)
                if retrieval_results:
                    yield {
                        "type": "retrieval",
                        "query": message,
                        "results": retrieval_results
                    }

            # Build messages list
            messages = self._build_messages(message, history)

            # Resolve memory sources (MEMORY.md injected via MemoryMiddleware)
            memory_sources = []
            if self.base_dir:
                memory_file = self.base_dir / "memory" / "MEMORY.md"
                if memory_file.exists():
                    memory_sources.append("/memory/MEMORY.md")  # virtual POSIX path

            # Resolve skills sources (SkillsMiddleware reads from virtual POSIX paths)
            skills_sources = None
            if self.base_dir:
                skills_dir = self.base_dir / "skills"
                if skills_dir.exists():
                    skills_sources = ["/skills/"]

            # Create agent
            agent = create_deep_agent(
                model=self._model,
                tools=self.tools,
                system_prompt=system_prompt,
                backend=self._backend,
                memory=memory_sources if memory_sources else None,
                skills=skills_sources,
                permissions=[
                    # Default workspace: full read+write
                    FilesystemPermission(operations=["read", "write"], paths=["/workspace/**"]),
                    # Memory files: agent can update long-term memory
                    FilesystemPermission(operations=["read", "write"], paths=["/memory/**"]),
                    # Allow read anywhere else (agent can browse project files)
                    FilesystemPermission(operations=["read"], paths=["/**"]),
                    # Deny write outside workspace and memory
                    FilesystemPermission(operations=["write"], paths=["/**"], mode="deny"),
                ],
            )

            # Stream events and convert to Mini-OpenClaw format
            async for event in self._stream_and_convert(agent, messages):
                yield event

        except Exception as e:
            logger.error(f"Error in astream: {str(e)}", exc_info=True)
            yield {"type": "error", "error": str(e)}

    def _build_messages(
        self,
        message: str,
        history: List[Dict[str, Any]]
    ) -> List:
        """Build LangChain message list from history."""
        messages = []

        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                # Handle tool_calls if present
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    # Convert stored format {"tool":..,"input":..,"output":..,"id":..}
                    # to LangChain format  {"name":..,"args":..,"id":..,"type":"tool_call"}
                    lc_tool_calls = []
                    for tc in tool_calls:
                        lc_tool_calls.append({
                            "name": tc.get("name") or tc.get("tool", "unknown"),
                            "args": tc.get("args") or tc.get("input") or {},
                            "id": tc.get("id", ""),
                            "type": "tool_call",
                        })
                    messages.append(AIMessage(content=content, tool_calls=lc_tool_calls))
                    # Add ToolMessage for each tool result
                    for tc in tool_calls:
                        messages.append(ToolMessage(
                            content=str(tc.get("output", "")),
                            tool_call_id=tc.get("id", ""),
                        ))
                else:
                    messages.append(AIMessage(content=content))

        # Add current message
        messages.append(HumanMessage(content=message))

        return messages

    async def _stream_and_convert(
        self,
        agent,
        messages: List
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream from DeepAgents and convert events to Mini-OpenClaw format.

        Observed event structure (from live debugging):
        - stream_mode=["messages","updates"]
        - messages mode: (mode, (chunk, metadata))
          - AIMessageChunk: .content for tokens, .tool_call_chunks for tool call streaming
          - ToolMessage: .tool_call_id, .content — also appears in updates "tools" key (duplicate)
        - updates mode: (mode, dict)
          - "model" key → dict{"messages": [AIMessage(tool_calls=[...])]} — use this for tool_start
          - "tools" key → dict{"messages": [ToolMessage(...)]} — use this for tool_end (canonical)
          ToolMessage appears in BOTH messages-mode and tools-update; emit only from updates to avoid duplicates.
        """
        # confirmed_tool_calls: id -> name (set when "model" update arrives with tool_calls)
        confirmed_tool_calls: Dict[str, str] = {}
        # emitted_tool_ends: set of tool_call_ids already emitted (dedup guard)
        emitted_tool_ends: set = set()

        try:
            async for event in agent.astream(
                {"messages": messages},
                stream_mode=["messages", "updates"],
            ):
                if not isinstance(event, tuple):
                    continue

                mode, data = event

                if mode == "messages":
                    chunk = data[0] if isinstance(data, tuple) else data

                    if isinstance(chunk, AIMessageChunk):
                        # Text token
                        if chunk.content:
                            yield {"type": "token", "content": chunk.content}
                        # tool_call_chunks: just track names/ids for fallback; tool_start comes from updates

                elif mode == "updates" and isinstance(data, dict):
                    # "model" update — emit tool_start with complete args
                    model_update = data.get("model")
                    if isinstance(model_update, dict):
                        try:
                            msgs = list(model_update.get("messages", []))
                        except TypeError:
                            msgs = []
                        for msg in msgs:
                            tcs = getattr(msg, "tool_calls", None)
                            if tcs:
                                for tc in tcs:
                                    tool_id = tc.get("id", "")
                                    tool_name = tc.get("name", "unknown")
                                    tool_args = tc.get("args", {})
                                    confirmed_tool_calls[tool_id] = tool_name
                                    yield {
                                        "type": "tool_start",
                                        "tool": tool_name,
                                        "input": tool_args if isinstance(tool_args, dict) else {},
                                        "id": tool_id,
                                    }

                    # "tools" update — emit tool_end (canonical, avoids duplicate from messages mode)
                    tools_update = data.get("tools")
                    if isinstance(tools_update, dict):
                        try:
                            msgs = list(tools_update.get("messages", []))
                        except TypeError:
                            msgs = []
                        for msg in msgs:
                            if isinstance(msg, ToolMessage):
                                if msg.tool_call_id in emitted_tool_ends:
                                    continue
                                emitted_tool_ends.add(msg.tool_call_id)
                                tool_name = confirmed_tool_calls.pop(msg.tool_call_id, "unknown")
                                yield {
                                    "type": "tool_end",
                                    "tool": tool_name,
                                    "output": msg.content,
                                    "id": msg.tool_call_id,
                                }

            # Stream complete
            yield {"type": "done"}

        except Exception as e:
            logger.error(f"Error in stream conversion: {e}", exc_info=True)
            yield {"type": "error", "error": str(e)}


# Global singleton instance
agent_manager = AgentManager()
