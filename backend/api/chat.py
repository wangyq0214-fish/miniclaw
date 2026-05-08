"""
Chat API - SSE Streaming Conversation Endpoint

Core endpoint for AI chat with tool calling and RAG support.
"""
import json
import logging
from typing import AsyncGenerator, Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from memory import system_prompt_builder, session_manager
from memory.hybrid_session import HybridSessionManager
from memory.redis_session import RedisSessionManager
from database import get_db, get_redis
from agent import agent_manager
from tools import get_all_tools
from models.complete_models import User
from auth.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_hybrid_manager(
    db: AsyncSession = Depends(get_db),
    redis_client = Depends(get_redis),
    current_user: User = Depends(get_current_user)
) -> HybridSessionManager:
    redis_manager = RedisSessionManager(redis_client, ttl_days=7)
    return HybridSessionManager(redis_manager, db, user_id=current_user.id)


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
    session_id: str,
    user_id: int,
    hybrid_manager: HybridSessionManager
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
    logger.info(f"stream_chat_response called with user_id={user_id}, session_id={session_id}")
    try:
        # Check if session exists, if not create it
        session = await hybrid_manager.get_session(session_id)
        if not session:
            # Create new session in HybridSessionManager
            await hybrid_manager.create_session(
                session_id=session_id,
                user_id=user_id,
                metadata={"title": "新对话"}
            )

        # Get messages for checking if first message
        existing_messages = await hybrid_manager.get_messages(session_id)
        is_first_message = len(existing_messages) == 0

        # Get history for agent from HybridSessionManager
        history = await hybrid_manager.load_session_for_agent(session_id)

        # Load RAG mode from config
        try:
            from api.config_api import _load_config
            config = _load_config()
            rag_mode = config.get("rag_mode", False)
        except:
            rag_mode = False

        agent_manager.set_rag_mode(rag_mode)

        # Re-initialize agent with user context for this request
        from config import get_project_root
        from tools import get_all_tools
        from memory import session_manager as mem_session_manager, system_prompt_builder

        # Initialize agent first to create backend
        await agent_manager.initialize(
            base_dir=get_project_root(),
            tools=[],  # Will be set after backend is ready
            session_manager=mem_session_manager,
            prompt_builder=system_prompt_builder,
            memory_indexer=None,
            user_id=user_id
        )

        # Now create tools with backend
        tools = get_all_tools(base_dir=get_project_root(), user_id=user_id, backend=agent_manager._backend)
        agent_manager.tools = tools

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

            elif event_type == "status":
                # Agent status update (thinking, processing, etc.)
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

                # Save user message to HybridSessionManager (Redis + PostgreSQL)
                await hybrid_manager.add_message(
                    session_id=session_id,
                    role="user",
                    content=message
                )

                # Save assistant segments
                for segment in segments:
                    # Save to HybridSessionManager
                    await hybrid_manager.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=segment.get("content", ""),
                        metadata={"tool_calls": segment.get("tool_calls")} if segment.get("tool_calls") else None
                    )

                # TODO: Implement auto compression for HybridSessionManager
                # HybridSessionManager currently lacks a compress_session method

                # Send done event
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                # Generate title for first message
                if is_first_message:
                    title = await generate_title(message, session_id)
                    # Update title in HybridSessionManager
                    await hybrid_manager.update_session_metadata(
                        session_id=session_id,
                        metadata={"title": title}
                    )
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
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    hybrid_manager: HybridSessionManager = Depends(get_hybrid_manager)
):
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
            stream_chat_response(request.message, request.session_id, current_user.id, hybrid_manager),
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
            # Check if session exists, if not create it
            session = await hybrid_manager.get_session(request.session_id)
            if not session:
                await hybrid_manager.create_session(
                    session_id=request.session_id,
                    user_id=current_user.id,
                    metadata={"title": "新对话"}
                )

            existing_messages = await hybrid_manager.get_messages(request.session_id)
            is_first_message = len(existing_messages) == 0

            # Get history from HybridSessionManager
            history = await hybrid_manager.load_session_for_agent(request.session_id)

            # Build system prompt
            system_prompt = system_prompt_builder.build()

            # Collect all events
            full_content = ""
            tool_calls = []

            logger.info(f"Starting agent stream for session {request.session_id}")
            async for event in agent_manager.astream(
                message=request.message,
                history=history,
                system_prompt=system_prompt,
                session_id=request.session_id
            ):
                logger.debug(f"Received event: {event.get('type')}")
                if event.get("type") == "token":
                    full_content += event.get("content", "")
                elif event.get("type") == "tool_end":
                    tool_calls.append({
                        "tool": event.get("tool"),
                        "output": event.get("output")
                    })

            logger.info(f"Agent stream completed. Content length: {len(full_content)}")

            # Save messages to HybridSessionManager only
            await hybrid_manager.add_message(
                session_id=request.session_id,
                role="user",
                content=request.message
            )
            await hybrid_manager.add_message(
                session_id=request.session_id,
                role="assistant",
                content=full_content,
                metadata={"tool_calls": tool_calls} if tool_calls else None
            )

            # Generate title if first message
            if is_first_message:
                title = await generate_title(request.message, request.session_id)
                await hybrid_manager.update_session_metadata(
                    session_id=request.session_id,
                    metadata={"title": title}
                )

            return ChatResponse(
                message=full_content,
                session_id=request.session_id,
                thoughts=tool_calls if tool_calls else None
            )

        except Exception as e:
            logger.error(f"Error in chat: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
