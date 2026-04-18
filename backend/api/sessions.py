"""
Sessions API - Session management endpoints

Provides:
- List, create, delete sessions
- Get session messages and history
- Rename session
- Generate title with AI
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from memory import session_manager, system_prompt_builder

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionInfo(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class SessionDetail(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    messages: list
    compressed_context: Optional[str] = None


class SessionListResponse(BaseModel):
    sessions: List[SessionInfo]


class RenameRequest(BaseModel):
    title: str


class TitleResponse(BaseModel):
    session_id: str
    title: str


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions():
    """Get all sessions sorted by update time (most recent first)."""
    try:
        sessions = session_manager.list_sessions()
        return SessionListResponse(
            sessions=[SessionInfo(**s) for s in sessions]
        )
    except Exception as e:
        logger.error(f"Error listing sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str):
    """Get a specific session with its messages. Creates new session if not found."""
    session = session_manager.get_or_create_session(session_id)

    return SessionDetail(
        session_id=session.get("session_id", session_id),
        title=session.get("title", session_id),
        created_at=session.get("created_at", ""),
        updated_at=session.get("updated_at", ""),
        messages=session.get("messages", []),
        compressed_context=session.get("compressed_context")
    )


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, include_system: bool = False):
    """
    Get session messages. Creates new session if not found.

    Args:
        session_id: Session identifier
        include_system: Include system prompt in response

    Returns:
        Messages list with optional system prompt
    """
    session = session_manager.get_or_create_session(session_id)

    messages = session.get("messages", [])

    if include_system:
        system_prompt = system_prompt_builder.build()
        return {
            "session_id": session_id,
            "system_prompt": system_prompt,
            "messages": messages
        }

    return {
        "session_id": session_id,
        "messages": messages
    }


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str):
    """
    Get conversation history (optimized for display, no system prompt).

    Includes tool_calls in messages if present. Creates new session if not found.
    """
    session = session_manager.get_or_create_session(session_id)

    messages = session.get("messages", [])

    return {
        "session_id": session_id,
        "title": session.get("title", session_id),
        "messages": messages,
        "compressed_context": session.get("compressed_context")
    }


@router.post("/sessions/new")
async def create_new_session(session_id: str = None, title: str = None):
    """
    Create a new session.

    Args:
        session_id: Optional custom session ID (auto-generated if not provided)
        title: Optional session title
    """
    import uuid

    if session_id is None:
        session_id = f"session_{uuid.uuid4().hex[:8]}"

    # Check if session already exists
    existing = session_manager.get_session(session_id)
    if existing is not None:
        raise HTTPException(status_code=400, detail="Session already exists")

    session = session_manager.create_session(session_id, title=title)

    return {
        "success": True,
        "session_id": session_id,
        "title": session.get("title", session_id),
        "created_at": session.get("created_at")
    }


@router.put("/sessions/{session_id}")
async def rename_session(session_id: str, request: RenameRequest):
    """
    Rename a session.

    Args:
        session_id: Session identifier
        request: New title
    """
    success = session_manager.update_title(session_id, request.title)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "success": True,
        "session_id": session_id,
        "title": request.title
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    success = session_manager.delete_session(session_id)

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "success": True,
        "message": f"Session {session_id} deleted"
    }


@router.post("/sessions/{session_id}/generate-title", response_model=TitleResponse)
async def generate_session_title(session_id: str):
    """
    Generate an AI title for the session based on first message.

    Uses the first user message to generate a short Chinese title.
    """
    from config import settings

    session = session_manager.get_session(session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = session.get("messages", [])

    if not messages:
        raise HTTPException(status_code=400, detail="Session has no messages")

    # Find first user message
    first_user_message = None
    for msg in messages:
        if msg.get("role") == "user":
            first_user_message = msg.get("content", "")
            break

    if not first_user_message:
        raise HTTPException(status_code=400, detail="No user message found")

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
            HumanMessage(content=first_user_message)
        ])

        title = response.content.strip()[:10]

        # Update session title
        session_manager.update_title(session_id, title)

        return TitleResponse(session_id=session_id, title=title)

    except Exception as e:
        logger.error(f"Error generating title: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
