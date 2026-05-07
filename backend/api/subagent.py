"""
Sub-Agent Direct Invoke API

Provides a direct endpoint for invoking specific sub-agents
without going through the main orchestrator. Supports tool calling
(read_file, write_file, entity_graph, etc.) with a full tool loop.
"""
import json
import logging
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, AIMessageChunk, ToolMessage

from config import settings, get_project_root, get_user_workspace_dir
from models.complete_models import User
from auth.security import get_current_user
from agent import agent_manager
from tools import get_all_tools
from api.tts import enhance_animation
from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)
router = APIRouter()

# Resolve directories
BACKEND_DIR = Path(__file__).parent.parent
ROLES_DIR = BACKEND_DIR / "workspace" / "roles"

# Cache role prompts in memory
_role_cache: dict[str, str] = {}


def _load_role_prompt(name: str) -> str:
    if name in _role_cache:
        return _role_cache[name]
    role_file = ROLES_DIR / f"{name}.md"
    if not role_file.exists():
        return ""
    prompt = role_file.read_text(encoding="utf-8")
    _role_cache[name] = prompt
    return prompt


def _create_fs_tools(backend) -> list:
    """Create filesystem tools that directly use the backend (no middleware needed)."""
    from pydantic import Field
    from typing import Annotated
    from tools.utils import inject_date

    def write_file(
        file_path: Annotated[str, "Absolute path where the file should be created"],
        content: Annotated[str, "The text content to write to the file"],
    ) -> str:
        res = backend.write(inject_date(file_path.lstrip("/")), content)
        if res.error:
            return res.error
        return f"Updated file {res.path}"

    async def awrite_file(
        file_path: Annotated[str, "Absolute path where the file should be created"],
        content: Annotated[str, "The text content to write to the file"],
    ) -> str:
        res = await backend.awrite(inject_date(file_path.lstrip("/")), content)
        if res.error:
            return res.error
        return f"Updated file {res.path}"

    def read_file(
        file_path: Annotated[str, "Absolute path to the file to read"],
        offset: Annotated[int, "Line number to start reading from"] = 0,
        limit: Annotated[int, "Maximum number of lines to read"] = 2000,
    ) -> str:
        res = backend.read(file_path, offset=offset, limit=limit)
        if res.error:
            return res.error
        if res.file_data:
            if isinstance(res.file_data, dict):
                return res.file_data.get("content", "")
            elif hasattr(res.file_data, "content"):
                return res.file_data.content
        return ""

    async def aread_file(
        file_path: Annotated[str, "Absolute path to the file to read"],
        offset: Annotated[int, "Line number to start reading from"] = 0,
        limit: Annotated[int, "Maximum number of lines to read"] = 2000,
    ) -> str:
        res = await backend.aread(file_path, offset=offset, limit=limit)
        if res.error:
            return res.error
        if res.file_data:
            if isinstance(res.file_data, dict):
                return res.file_data.get("content", "")
            elif hasattr(res.file_data, "content"):
                return res.file_data.content
        return ""

    return [
        StructuredTool.from_function(
            name="write_file",
            description="Write content to a file. Creates parent directories if needed.",
            func=write_file,
            coroutine=awrite_file,
        ),
        StructuredTool.from_function(
            name="read_file",
            description="Read a file from the filesystem.",
            func=read_file,
            coroutine=aread_file,
        ),
    ]


class SubAgentRequest(BaseModel):
    subagent: str
    message: str
    stream: bool = True


# Max tool-call rounds to prevent infinite loops
MAX_TOOL_ROUNDS = 8
# If write_file has been called AND we have enough text, stop after tool execution
MIN_TEXT_BEFORE_EARLY_STOP = 200


@router.post("/subagent/invoke")
async def invoke_subagent(
    request: SubAgentRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Directly invoke a sub-agent by name, bypassing the orchestrator.
    Supports tool calling (read_file, write_file, etc.) with a full loop.
    """
    role_prompt = _load_role_prompt(request.subagent)
    if not role_prompt:
        return {"error": f"Unknown subagent: {request.subagent}"}

    # Reuse agent_manager's backend and model (inherits from main agent)
    await agent_manager.initialize(
        base_dir=get_project_root(),
        tools=[],
        session_manager=None,
        prompt_builder=None,
        memory_indexer=None,
        user_id=current_user.id,
    )
    tools = get_all_tools(base_dir=get_project_root(), user_id=current_user.id, backend=agent_manager._backend)
    # Add filesystem tools (write_file, read_file) so subagent can write to user workspace
    fs_tools = _create_fs_tools(agent_manager._backend)
    tools = fs_tools + tools
    tool_map = {t.name: t for t in tools}

    # Bind tools to the model (agent_manager._model is raw, no tools bound)
    model = agent_manager._model.bind_tools(tools)

    messages = [
        SystemMessage(content=role_prompt),
        HumanMessage(content=request.message),
    ]

    if request.stream:
        async def generate():
            full_text = ""
            written_html_files: list[str] = []  # Track HTML files for TTS post-processing
            try:
                for round_num in range(MAX_TOOL_ROUNDS):
                    # Stream LLM response
                    ai_message: Optional[AIMessage] = None
                    async for chunk in model.astream(messages):
                        if isinstance(chunk, AIMessageChunk):
                            # Accumulate the full message
                            if ai_message is None:
                                ai_message = chunk
                            else:
                                ai_message = ai_message + chunk
                            # Stream text tokens to client
                            text = chunk.content or ""
                            if text:
                                full_text += text
                                yield f"data: {json.dumps({'type': 'token', 'content': text}, ensure_ascii=False)}\n\n"

                    if ai_message is None:
                        break

                    # Add AI message to history
                    messages.append(ai_message)

                    # Check for tool calls
                    tool_calls = ai_message.tool_calls or []
                    if not tool_calls:
                        # No tool calls — LLM is done
                        break

                    # Execute each tool call
                    files_written_this_round = 0
                    for tc in tool_calls:
                        tool_name = tc.get("name", "")
                        tool_args = tc.get("args", {})
                        tool_id = tc.get("id", "")

                        # Skip duplicate write_file calls in the same round
                        if tool_name == "write_file":
                            files_written_this_round += 1
                            if files_written_this_round > 1:
                                yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'output': 'Skipped: already wrote a file this round', 'id': tool_id}, ensure_ascii=False)}\n\n"
                                messages.append(ToolMessage(content="Skipped: already wrote a file this round. Do NOT call write_file again.", tool_call_id=tool_id))
                                continue

                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'input': tool_args, 'id': tool_id}, ensure_ascii=False)}\n\n"

                        # Execute tool
                        tool = tool_map.get(tool_name)
                        if tool:
                            try:
                                result = await tool.ainvoke(tool_args) if hasattr(tool, 'ainvoke') else tool.invoke(tool_args)
                                output = str(result)[:15000]  # Truncate to prevent token overflow
                            except Exception as e:
                                output = f"Tool error: {e}"
                        else:
                            output = f"Unknown tool: {tool_name}"

                        yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'output': output[:500], 'id': tool_id}, ensure_ascii=False)}\n\n"

                        # Track HTML files written to media-scripts for TTS post-processing
                        if tool_name == "write_file":
                            written_path = tool_args.get("file_path", "") or tool_args.get("path", "")
                            if written_path.endswith(".html") and "media-scripts" in written_path:
                                written_html_files.append(written_path)

                        # Add tool result to messages
                        messages.append(ToolMessage(content=output, tool_call_id=tool_id))

                    # Early stop: if write_file succeeded and we have enough text,
                    # the generation is done — no need to loop further.
                    wrote_file = any(
                        tc.get("name") == "write_file" for tc in tool_calls
                    )
                    if wrote_file and len(full_text) >= MIN_TEXT_BEFORE_EARLY_STOP:
                        logger.info(
                            "Early stop after write_file, text length: %d", len(full_text)
                        )
                        break

                logger.info("Subagent completed, total text length: %d", len(full_text))

                # TTS post-processing: generate audio for written HTML animations
                for virtual_path in written_html_files:
                    try:
                        # Resolve virtual path to actual filesystem path
                        # write_file auto-injects date prefix, so apply same logic
                        from tools.utils import inject_date
                        resolved_path_str = inject_date(virtual_path.lstrip("/"))
                        user_ws = get_user_workspace_dir(current_user.id)
                        actual_path = user_ws / resolved_path_str.replace("workspace/", "", 1)

                        if not actual_path.exists():
                            logger.warning("TTS: file not found: %s", actual_path)
                            continue

                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': 'enhance_animation', 'input': {'path': virtual_path}}, ensure_ascii=False)}\n\n"
                        html_content = actual_path.read_text(encoding="utf-8")
                        html_filename = actual_path.name
                        audio_dir = actual_path.parent / Path(html_filename).stem
                        enhanced = await enhance_animation(html_content, html_filename, audio_dir, user_id=current_user.id)
                        if enhanced != html_content:
                            actual_path.write_text(enhanced, encoding="utf-8")
                            yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'enhance_animation', 'output': f'Animation enhanced: timing + audio for {html_filename}'}, ensure_ascii=False)}\n\n"
                        else:
                            yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'enhance_animation', 'output': 'No subtitles found or enhancement skipped'}, ensure_ascii=False)}\n\n"
                    except Exception as e:
                        logger.error("TTS post-processing failed for %s: %s", virtual_path, e)
                        yield f"data: {json.dumps({'type': 'tool_end', 'tool': 'tts_generate', 'output': f'TTS error: {e}'}, ensure_ascii=False)}\n\n"

                yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

            except GeneratorExit:
                logger.warning("Subagent stream closed by client, text length: %d", len(full_text))
            except Exception as e:
                logger.error("Subagent stream error: %s", e, exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        # Non-streaming: run full tool loop
        for round_num in range(MAX_TOOL_ROUNDS):
            response = await model.ainvoke(messages)
            messages.append(response)

            tool_calls = response.tool_calls or []
            if not tool_calls:
                break

            for tc in tool_calls:
                tool_name = tc.get("name", "")
                tool_args = tc.get("args", {})
                tool_id = tc.get("id", "")

                tool = tool_map.get(tool_name)
                if tool:
                    try:
                        result = await tool.ainvoke(tool_args) if hasattr(tool, 'ainvoke') else tool.invoke(tool_args)
                        output = str(result)[:15000]
                    except Exception as e:
                        output = f"Tool error: {e}"
                else:
                    output = f"Unknown tool: {tool_name}"

                messages.append(ToolMessage(content=output, tool_call_id=tool_id))

        # Return final AI response content
        final = messages[-1]
        return {"content": final.content if isinstance(final, AIMessage) else str(final)}
