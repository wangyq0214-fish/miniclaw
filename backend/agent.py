"""
Mini-OpenClaw Agent Module

Agent using DeepAgents framework with streaming support.
"""
import asyncio
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
from deepagents.middleware.subagents import _subagent_event_queue
from agents.resource_agents import build_resource_subagents
from storage.sync_backend import SyncFilesystemBackend

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
        memory_indexer,
        user_id: Optional[int] = None
    ):
        """Initialize the agent with tools and dependencies.

        Args:
            base_dir: Base directory for agent files (used as fallback)
            tools: List of tools available to agent
            session_manager: Session manager instance
            prompt_builder: Prompt builder instance
            memory_indexer: Memory indexer instance
            user_id: User ID for per-user path isolation (optional)
        """
        self.base_dir = base_dir
        self.tools = tools or []
        self.session_manager = session_manager
        self.prompt_builder = prompt_builder
        self.memory_indexer = memory_indexer
        self.user_id = user_id

        # Initialize model
        self._model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key or "sk-dummy",
            base_url=settings.openai_api_base,
            temperature=0.7,
            extra_body={"think": False},  # disable qwen3 thinking mode for faster streaming
        )

        logger.info(f"AgentManager initialized with model {settings.openai_model} at {settings.openai_api_base}")

        # Build shared resource paths
        from config import get_skills_dir, get_workspace_dir, get_knowledge_dir
        shared_resources = {
            "/skills/": get_skills_dir(),
            "/roles/": get_workspace_dir() / "roles",
            "/knowledge/": get_knowledge_dir(),
        }

        # Initialize filesystem backend with per-user isolation
        if user_id is not None:
            # Local mode with per-user directories
            from config import get_user_memory_dir, get_user_workspace_dir, get_user_sessions_dir

            user_memory_dir = get_user_memory_dir(user_id)
            user_workspace_dir = get_user_workspace_dir(user_id)

            # Build path mappings for user-specific + shared resources
            path_mappings = {
                "/memory/": user_memory_dir,
                "/workspace/": user_workspace_dir,
                **shared_resources,
            }

            self._backend = SyncFilesystemBackend(
                root_dir=str(user_workspace_dir),
                virtual_mode=True,
                path_mappings=path_mappings,
            )
            logger.info(f"Using FilesystemBackend for user {user_id}")
        else:
            # Legacy mode: no user isolation, use base_dir
            self._backend = FilesystemBackend(
                root_dir=str(self.base_dir),
                virtual_mode=True,
            )
            logger.info(f"Using FilesystemBackend with root_dir={self.base_dir}")

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
            # Always use virtual path - backend will resolve to correct user directory
            memory_sources = ["/memory/MEMORY.md"]

            # Resolve skills sources (SkillsMiddleware reads from virtual POSIX paths)
            skills_sources = ["/skills/"]

            # Build resource-generation subagents (5 specialized roles) — system_prompts
            # are loaded from /roles/*.md via backend, model/tools inherit from main agent
            resource_subagents = build_resource_subagents(self._backend) if self._backend else []

            # Create agent
            agent = create_deep_agent(
                model=self._model,
                tools=self.tools,
                system_prompt=system_prompt,
                backend=self._backend,
                memory=memory_sources if memory_sources else None,
                skills=skills_sources,
                subagents=resource_subagents if resource_subagents else None,
                permissions=[
                    # Default workspace: full read+write
                    FilesystemPermission(operations=["read", "write"], paths=["/workspace/**"]),
                    # Memory files: agent can update long-term memory
                    FilesystemPermission(operations=["read", "write"], paths=["/memory/**"]),
                    # Knowledge dir: subagents write generated resources here
                    FilesystemPermission(operations=["read", "write"], paths=["/knowledge/**"]),
                    # Allow read anywhere else (agent can browse project files)
                    FilesystemPermission(operations=["read"], paths=["/**"]),
                    # Deny write outside workspace / memory / knowledge
                    FilesystemPermission(operations=["write"], paths=["/**"], mode="deny"),
                ],
            )

            # Stream events and convert to Mini-OpenClaw format
            async for event in self._stream_and_convert(agent, messages):
                yield event

        except Exception as e:
            logger.error(f"Error in astream: {str(e)}", exc_info=True)
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
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

    # Tool name → Chinese status description for user-facing progress display
    TOOL_STATUS_MAP: Dict[str, str] = {
        "update_student_profile": "正在更新学习档案",
        "read_file": "正在查阅资料",
        "write_file": "正在保存内容",
        "edit_file": "正在修改内容",
        "generate_lecture": "正在生成讲义",
        "generate_exercises": "正在出练习题",
        "evaluate_learning": "正在评估学习",
        "generate_mindmap": "正在生成思维导图",
        "generate_code_case": "正在生成代码案例",
        "generate_reading_list": "正在生成阅读清单",
        "answer_question": "正在解答问题",
        "task": "正在调度子代理",
        "get_entity_graph": "正在查询知识图谱",
    }

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
        # Track write_file calls to media-scripts HTML for TTS post-processing
        pending_media_html: Dict[str, str] = {}  # tool_call_id -> virtual path
        # emitted_tool_ends: set of tool_call_ids already emitted (dedup guard)
        emitted_tool_ends: set = set()
        # Track whether we've emitted initial status
        emitted_initial_status = False
        # Track whether we've emitted first token status
        emitted_first_token_status = False

        # Set up subagent event queue for streaming subagent-internal events
        subagent_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        token = _subagent_event_queue.set(subagent_queue)

        def drain_subagent_queue():
            """Yield all subagent events currently in the queue."""
            while not subagent_queue.empty():
                try:
                    yield subagent_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

        try:
            async for event in agent.astream(
                {"messages": messages},
                stream_mode=["messages", "updates"],
            ):
                # Drain any subagent events queued by a running task tool
                for sub_ev in drain_subagent_queue():
                    yield sub_ev

                if not isinstance(event, tuple):
                    continue

                mode, data = event

                if mode == "messages":
                    chunk = data[0] if isinstance(data, tuple) else data

                    if isinstance(chunk, AIMessageChunk):
                        # Text token
                        if chunk.content:
                            if not emitted_first_token_status:
                                emitted_first_token_status = True
                                yield {"type": "status", "message": "正在组织语言"}
                            yield {"type": "token", "content": chunk.content}
                        # tool_call_chunks: just track names/ids for fallback; tool_start comes from updates

                elif mode == "updates" and isinstance(data, dict):
                    # "model" update — emit tool_start with complete args
                    model_update = data.get("model")
                    if isinstance(model_update, dict):
                        # Emit initial status on first model update (agent started thinking)
                        if not emitted_initial_status:
                            emitted_initial_status = True
                            yield {"type": "status", "message": "正在分析你的问题"}
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
                                    # Emit status describing what the tool does
                                    if tool_name == "task" and isinstance(tool_args, dict):
                                        agent_type = tool_args.get("subagent_type", "")
                                        status_msg = f"正在调度子代理: {agent_type}" if agent_type else "正在调度子代理"
                                    else:
                                        status_msg = self.TOOL_STATUS_MAP.get(
                                            tool_name, f"正在调用 {tool_name}"
                                        )
                                    yield {"type": "status", "message": status_msg}
                                    # Track write_file to media-scripts HTML for TTS post-processing
                                    if tool_name == "write_file" and isinstance(tool_args, dict):
                                        vp = tool_args.get("file_path", "") or tool_args.get("path", "")
                                        logger.info("TTS track: tool_name=%s, file_path=%s", tool_name, vp)
                                        if vp.endswith(".html") and "media-scripts" in vp:
                                            pending_media_html[tool_id] = vp
                                            logger.info("TTS: tracked media-scripts HTML: %s", vp)

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
                                yield {"type": "status", "message": "正在继续"}

            # Final drain — catch any subagent events from the last task call
            for sub_ev in drain_subagent_queue():
                yield sub_ev

            # TTS post-processing: enhance any HTML animations written to media-scripts
            logger.info("TTS check: pending_media_html=%s, user_id=%s", list(pending_media_html.keys()), self.user_id)
            if pending_media_html and self.user_id:
                from api.tts import enhance_animation
                from tools.utils import inject_date
                from config import get_user_workspace_dir

                user_ws = get_user_workspace_dir(self.user_id)
                for tc_id, virtual_path in pending_media_html.items():
                    try:
                        raw_rel = virtual_path.lstrip("/").replace("workspace/", "", 1)
                        dated = inject_date(virtual_path.lstrip("/")).replace("workspace/", "", 1)
                        actual_path = user_ws / dated if (user_ws / dated).exists() else user_ws / raw_rel
                        logger.info("TTS: virtual_path=%s, resolved=%s, exists=%s", virtual_path, actual_path, actual_path.exists())

                        if not actual_path.exists():
                            logger.warning("TTS: file not found: %s", actual_path)
                            continue

                        yield {"type": "tool_start", "tool": "enhance_animation", "input": {"path": virtual_path}, "id": f"tts_{tc_id}"}
                        yield {"type": "status", "message": "正在生成动画语音"}

                        html_content = actual_path.read_text(encoding="utf-8")
                        html_filename = actual_path.name
                        audio_dir = actual_path.parent / Path(html_filename).stem
                        enhanced = await enhance_animation(html_content, html_filename, audio_dir, user_id=self.user_id)

                        if enhanced != html_content:
                            actual_path.write_text(enhanced, encoding="utf-8")
                            yield {"type": "tool_end", "tool": "enhance_animation", "output": f"动画增强完成: {html_filename}", "id": f"tts_{tc_id}"}
                        else:
                            yield {"type": "tool_end", "tool": "enhance_animation", "output": "无字幕或增强跳过", "id": f"tts_{tc_id}"}
                    except Exception as e:
                        logger.error("TTS post-processing failed for %s: %s", virtual_path, e)
                        yield {"type": "tool_end", "tool": "enhance_animation", "output": f"TTS error: {e}", "id": f"tts_{tc_id}"}

            # Stream complete
            yield {"type": "done"}

        except Exception as e:
            logger.error(f"Error in stream conversion: {e}", exc_info=True)
            yield {"type": "error", "error": str(e)}
        finally:
            _subagent_event_queue.reset(token)


# Global singleton instance
agent_manager = AgentManager()
