"""
Session Compression API

Provides AI-powered summarization of conversation history.
"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from memory import session_manager
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class CompressRequest(BaseModel):
    """Request for session compression."""
    min_messages: int = 4  # Minimum messages required
    ratio: float = 0.5  # Ratio of messages to compress


class CompressResponse(BaseModel):
    """Response for session compression."""
    archived_count: int
    remaining_count: int
    summary: str


async def generate_summary(messages: list) -> str:
    """
    Generate a summary of the messages using LLM.

    Args:
        messages: List of message dicts to summarize

    Returns:
        Generated summary text (<=500 chars in Chinese)
    """
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage

        # Build summary prompt
        conversation_text = "\n".join([
            f"{msg.get('role', 'user')}: {msg.get('content', '')}"
            for msg in messages
        ])

        system_prompt = """你是一个对话总结专家。请将以下对话历史总结为一个简洁的中文摘要（不超过500字）。

要求：
1. 提取关键信息和决策
2. 保留重要的上下文
3. 使用自然流畅的中文
4. 不要遗漏重要细节"""

        # Create LLM
        llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=0.3,
            max_tokens=500
        )

        # Generate summary
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"对话历史：\n\n{conversation_text}")
        ])

        return response.content[:500]  # Ensure max 500 chars

    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        return f"[压缩摘要生成失败: {str(e)}]"


@router.post("/sessions/{session_id}/compress", response_model=CompressResponse)
async def compress_session(session_id: str, request: CompressRequest = None):
    """
    Compress session history by summarizing older messages.

    Args:
        session_id: Session to compress
        request: Compression parameters (optional)

    Returns:
        archived_count: Number of messages archived
        remaining_count: Number of messages remaining
        summary: Generated summary text
    """
    if request is None:
        request = CompressRequest()

    try:
        # Get session
        session = session_manager.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        messages = session.get("messages", [])

        # Check minimum messages
        if len(messages) < request.min_messages:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough messages to compress. Need at least {request.min_messages}, have {len(messages)}"
            )

        # Calculate messages to archive
        archive_count = max(
            request.min_messages,
            int(len(messages) * request.ratio)
        )

        # Get messages to archive
        to_archive = messages[:archive_count]

        # Generate summary
        summary = await generate_summary(to_archive)

        # Compress history
        updated_session = session_manager.compress_history(
            session_id=session_id,
            summary=summary,
            n=archive_count
        )

        remaining_count = len(updated_session.get("messages", []))

        logger.info(f"Compressed session {session_id}: archived {archive_count}, remaining {remaining_count}")

        return CompressResponse(
            archived_count=archive_count,
            remaining_count=remaining_count,
            summary=summary
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error compressing session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
