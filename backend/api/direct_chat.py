"""
Direct LLM Chat - Simple streaming endpoint without agent/tools.
Used for lightweight tasks like exercise explanation tutoring.
"""
import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings
from models.complete_models import User
from auth.security import get_current_user
from middleware.rate_limit import rate_limit_chat

logger = logging.getLogger(__name__)
router = APIRouter()


class DirectChatRequest(BaseModel):
    messages: list  # [{"role": "system"|"user"|"assistant", "content": "..."}]
    temperature: float = 0.7
    max_tokens: int = 2048


async def stream_direct_llm(
    messages: list,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Stream LLM response directly without agent/tools."""
    import httpx

    model = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key or "sk-dummy",
        base_url=settings.openai_api_base,
        temperature=temperature,
        max_tokens=max_tokens,
        extra_body={"think": False, "enable_thinking": False},
        request_timeout=httpx.Timeout(timeout=120.0, connect=10.0),
    )

    lc_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_messages.append(HumanMessage(content=content))  # fallback
        else:
            lc_messages.append(HumanMessage(content=content))

    try:
        async for chunk in model.astream(lc_messages):
            if chunk.content:
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.content}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.error(f"Direct LLM error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/direct-chat")
async def direct_chat(
    request: DirectChatRequest,
    current_user: User = Depends(get_current_user),
    _rate_limit=Depends(rate_limit_chat),
):
    """Simple streaming LLM chat without agent/tools."""
    return StreamingResponse(
        stream_direct_llm(
            messages=request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
