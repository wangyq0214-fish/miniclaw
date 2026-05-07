"""
会话管理 API v2 - 使用混合存储策略 (Redis + PostgreSQL)
"""
import logging
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, get_redis
from memory.redis_session import RedisSessionManager
from memory.hybrid_session import HybridSessionManager
from schemas.sessions import (
    SessionCreate, SessionResponse, SessionListResponse,
    MessageResponse, MessageListResponse
)
from models.complete_models import User
from auth.security import get_current_user
from pydantic import BaseModel

class RenameRequest(BaseModel):
    title: str

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions_v2"])

async def get_hybrid_manager(
    db: AsyncSession = Depends(get_db),
    redis_client = Depends(get_redis)
) -> HybridSessionManager:
    redis_manager = RedisSessionManager(redis_client, ttl_days=7)
    return HybridSessionManager(redis_manager, db)

@router.post("/create", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_user),
    manager: HybridSessionManager = Depends(get_hybrid_manager)
):
    session_id = f"session_{uuid.uuid4().hex[:16]}"
    metadata = {
        "title": session_data.title or "新对话",
        "tags": session_data.tags,
        "related_resources": session_data.related_resources
    }
    success = await manager.create_session(session_id=session_id, user_id=current_user.id, metadata=metadata)
    if not success:
        raise HTTPException(status_code=500, detail="创建会话失败")
    session = await manager.get_session(session_id)
    return SessionResponse(
        session_id=session["session_id"],
        title=session["metadata"].get("title", "新对话"),
        status="active",
        message_count=0,
        created_at=datetime.fromisoformat(session["created_at"]),
        updated_at=None,
        last_message_at=None,
        tags=session["metadata"].get("tags")
    )

@router.get("/list", response_model=SessionListResponse)
async def list_sessions(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    manager: HybridSessionManager = Depends(get_hybrid_manager)
):
    offset = (page - 1) * page_size
    sessions = await manager.get_user_sessions(user_id=current_user.id, limit=page_size, offset=offset)
    session_responses = [
        SessionResponse(
            session_id=s["session_id"],
            title=s["title"],
            status=s["status"],
            message_count=0,
            created_at=datetime.fromisoformat(s["created_at"]),
            updated_at=datetime.fromisoformat(s["updated_at"]) if s.get("updated_at") else None,
            last_message_at=None,
            tags=s["metadata"].get("tags") if s.get("metadata") else None
        )
        for s in sessions
    ]
    return SessionListResponse(sessions=session_responses, total=len(session_responses), page=page, page_size=page_size)

@router.put("/{session_id}")
async def rename_session(
    session_id: str,
    request: RenameRequest,
    current_user: User = Depends(get_current_user),
    manager: HybridSessionManager = Depends(get_hybrid_manager)
):
    """重命名会话"""
    session = await manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此会话")

    # 更新标题
    metadata = session.get("metadata", {})
    metadata["title"] = request.title
    success = await manager.update_session_metadata(session_id, metadata)

    if not success:
        raise HTTPException(status_code=500, detail="更新会话失败")

    return {
        "success": True,
        "session_id": session_id,
        "title": request.title
    }

@router.get("/{session_id}")
async def get_session_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    manager: HybridSessionManager = Depends(get_hybrid_manager)
):
    """获取会话详情和消息"""
    session = await manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此会话")

    messages = await manager.get_messages(session_id)
    return {
        "session_id": session["session_id"],
        "title": session["metadata"].get("title", "新对话"),
        "created_at": session["created_at"],
        "updated_at": session.get("updated_at"),
        "messages": messages,
        "compressed_context": None
    }

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    manager: HybridSessionManager = Depends(get_hybrid_manager)
):
    session = await manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此会话")
    success = await manager.delete_session(session_id, current_user.id)
    if not success:
        raise HTTPException(status_code=500, detail="删除会话失败")
    return None
