"""
Chat API - SSE Streaming Conversation Endpoint

Core endpoint for AI chat with tool calling and RAG support.
"""
import json
import logging
from typing import AsyncGenerator, Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from memory import system_prompt_builder, session_manager
from agent import agent_manager
from tools import get_all_tools

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str = "main_session"
    stream: bool = True


class ChatResponse(BaseModel):
    message: str
    session_id: str
    thoughts: Optional[List[dict]] = None


async def generate_title(message: str, session_id: str) -> str:
    """
    Generate a short Chinese title for the conversation.

    Args:
        message: First user message
        session_id: Session identifier

    Returns:
        Title string (<=10 chars)
    """
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=0.3,
            max_tokens=20
        )

        response = await llm.ainvoke([
            SystemMessage(content="为以下对话生成一个简短的中文标题（不超过10个字），只返回标题文本，不要加引号："),
            HumanMessage(content=message)
        ])

        title = response.content.strip()[:10]
        return title

    except Exception as e:
        logger.error(f"Error generating title: {str(e)}")
        return session_id[:10]


async def stream_chat_response(
    message: str,
    session_id: str
) -> AsyncGenerator[str, None]:
    """
    Stream chat response using AgentManager.

    Yields SSE events:
    - retrieval: RAG search results
    - token: Streaming tokens
    - tool_start: Tool call started
    - tool_end: Tool call finished
    - new_response: New response segment after tool
    - done: Response complete
    - title: Auto-generated title (first message only)
    - error: Error occurred
    """
    try:
        # Get or create session
        session = session_manager.get_or_create_session(session_id)

        # Check if first message (for title generation)
        existing_messages = session.get("messages", [])
        is_first_message = len(existing_messages) == 0

        # Get history for agent (optimized format)
        history = session_manager.load_session_for_agent(session_id)

        # Load RAG mode from config
        try:
            from api.config_api import _load_config
            config = _load_config()
            rag_mode = config.get("rag_mode", False)
        except:
            rag_mode = False

        agent_manager.set_rag_mode(rag_mode)

        # Build system prompt
        system_prompt = system_prompt_builder.build(rag_mode=rag_mode)

        # Track segments for multi-tool responses
        segments = []
        current_segment = {"content": "", "tool_calls": []}
        full_content = ""
        retrieval_results = None  # Track RAG retrieval results

        # Stream from agent
        async for event in agent_manager.astream(
            message=message,
            history=history,
            system_prompt=system_prompt,
            session_id=session_id
        ):
            event_type = event.get("type")

            if event_type == "retrieval":
                # RAG retrieval results
                retrieval_results = event.get("results", [])
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            elif event_type == "token":
                # Streaming token
                full_content += event.get("content", "")
                current_segment["content"] += event.get("content", "")
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            elif event_type == "tool_start":
                # Tool call started
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            elif event_type == "tool_end":
                # Tool call finished
                tool_call = {
                    "tool": event.get("tool"),
                    "input": event.get("input", {}),
                    "output": event.get("output"),
                    "id": event.get("id")
                }
                current_segment["tool_calls"].append(tool_call)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            elif event_type == "new_response":
                # Save current segment if it has content
                if current_segment["content"] or current_segment["tool_calls"]:
                    segments.append(current_segment.copy())

                # Start new segment
                current_segment = {"content": "", "tool_calls": []}
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            elif event_type == "done":
                # Save final segment
                if current_segment["content"] or current_segment["tool_calls"]:
                    segments.append(current_segment)

                # Save user message
                session_manager.add_message(session_id, "user", message)

                # Save assistant segments
                for segment in segments:
                    session_manager.add_message(
                        session_id,
                        "assistant",
                        segment.get("content", ""),
                        tool_calls=segment.get("tool_calls") if segment.get("tool_calls") else None
                    )

                # Auto compression check
                if settings.auto_compress_enabled:
                    try:
                        updated_session = session_manager.get_session(session_id)
                        message_count = len(updated_session.get("messages", []))

                        if message_count >= settings.auto_compress_threshold:
                            logger.info(f"Auto compressing session {session_id}: {message_count} messages")

                            # Calculate archive count
                            archive_count = max(4, int(message_count * settings.auto_compress_ratio))

                            # Get messages to archive
                            messages_to_archive = updated_session.get("messages", [])[:archive_count]

                            # Generate summary
                            from api.compress import generate_summary
                            summary = await generate_summary(messages_to_archive)

                            # Compress
                            session_manager.compress_history(
                                session_id=session_id,
                                summary=summary,
                                n=archive_count
                            )

                            logger.info(f"Auto compressed {archive_count} messages from session {session_id}")

                    except Exception as e:
                        logger.warning(f"Auto compression failed: {str(e)}")

                # Send done event
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                # Generate title for first message
                if is_first_message:
                    title = await generate_title(message, session_id)
                    session_manager.update_title(session_id, title)
                    title_event = {
                        "type": "title",
                        "session_id": session_id,
                        "title": title
                    }
                    yield f"data: {json.dumps(title_event, ensure_ascii=False)}\n\n"

            elif event_type == "error":
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Error in chat stream: {str(e)}")
        error_event = {
            "type": "error",
            "error": str(e)
        }
        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Send a message and get a streaming response.

    Request body:
    - message: User message text
    - session_id: Session identifier (default: main_session)
    - stream: Enable SSE streaming (default: true)

    Returns:
    - SSE stream with events: retrieval, token, tool_start, tool_end, new_response, done, title, error
    - Or JSON response if stream=false
    """
    if request.stream:
        return StreamingResponse(
            stream_chat_response(request.message, request.session_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        # Non-streaming response
        try:
            # Get session
            session = session_manager.get_or_create_session(request.session_id)
            existing_messages = session.get("messages", [])
            is_first_message = len(existing_messages) == 0

            # Get history
            history = session_manager.load_session_for_agent(request.session_id)

            # Build system prompt
            system_prompt = system_prompt_builder.build()

            # Collect all events
            full_content = ""
            tool_calls = []

            async for event in agent_manager.astream(
                message=request.message,
                history=history,
                system_prompt=system_prompt,
                session_id=request.session_id
            ):
                if event.get("type") == "token":
                    full_content += event.get("content", "")
                elif event.get("type") == "tool_end":
                    tool_calls.append({
                        "tool": event.get("tool"),
                        "output": event.get("output")
                    })

            # Save messages
            session_manager.add_message(request.session_id, "user", request.message)
            session_manager.add_message(request.session_id, "assistant", full_content)

            # Generate title if first message
            if is_first_message:
                title = await generate_title(request.message, request.session_id)
                session_manager.update_title(request.session_id, title)

            return ChatResponse(
                message=full_content,
                session_id=request.session_id,
                thoughts=tool_calls if tool_calls else None
            )

        except Exception as e:
            logger.error(f"Error in chat: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
