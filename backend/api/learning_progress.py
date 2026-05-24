"""
Learning Progress API

Endpoints for persisting learning map progress (actions + results).
Uses the existing LearningProgress model with content_type='learning_map'.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.complete_models import LearningProgress, User
from auth.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response Models ──

class SaveProgressRequest(BaseModel):
    node_id: str
    action: str  # 'learn' | 'quiz' | 'flashcard'
    phase: str   # 'idle' | 'generating' | 'ready' | 'completed'
    score: Optional[float] = None
    total: Optional[int] = None
    correct: Optional[int] = None
    file_path: Optional[str] = None
    node_title: Optional[str] = None


class ProgressItem(BaseModel):
    node_id: str
    action: str
    phase: str
    score: Optional[float] = None
    total: Optional[int] = None
    correct: Optional[int] = None
    file_path: Optional[str] = None
    completed_at: Optional[str] = None


class LoadProgressResponse(BaseModel):
    items: List[ProgressItem]


# ── Endpoints ──

@router.get("/learning-progress", response_model=LoadProgressResponse)
async def load_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Load all learning map progress for the current user."""
    stmt = select(LearningProgress).where(
        and_(
            LearningProgress.user_id == current_user.id,
            LearningProgress.content_type == "learning_map",
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    items = []
    for row in rows:
        meta = row.progress_metadata or {}
        items.append(ProgressItem(
            node_id=meta.get("node_id", row.content_id.split(":")[0]),
            action=meta.get("action", row.content_id.split(":")[1] if ":" in row.content_id else ""),
            phase="completed" if row.is_completed else meta.get("phase", "idle"),
            score=row.score,
            total=meta.get("total"),
            correct=meta.get("correct"),
            file_path=meta.get("file_path"),
            completed_at=row.completed_at.isoformat() if row.completed_at else None,
        ))

    return LoadProgressResponse(items=items)


@router.post("/learning-progress")
async def save_progress(
    req: SaveProgressRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save or update progress for a specific node-action pair."""
    content_id = f"{req.node_id}:{req.action}"

    # Find existing row
    stmt = select(LearningProgress).where(
        and_(
            LearningProgress.user_id == current_user.id,
            LearningProgress.content_type == "learning_map",
            LearningProgress.content_id == content_id,
        )
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    is_completed = req.phase == "completed"
    now = datetime.now(timezone.utc)

    if row:
        # Update existing
        row.progress_percentage = req.score if req.score is not None else row.progress_percentage
        row.is_completed = is_completed
        row.score = req.score if req.score is not None else row.score
        row.progress_metadata = {
            **(row.progress_metadata or {}),
            "node_id": req.node_id,
            "action": req.action,
            "phase": req.phase,
            "total": req.total,
            "correct": req.correct,
            "file_path": req.file_path,
        }
        if is_completed and not row.completed_at:
            row.completed_at = now
        row.last_accessed_at = now
    else:
        # Create new
        row = LearningProgress(
            user_id=current_user.id,
            content_type="learning_map",
            content_id=content_id,
            content_name=req.node_title or req.node_id,
            progress_percentage=req.score or 0.0,
            is_completed=is_completed,
            score=req.score,
            progress_metadata={
                "node_id": req.node_id,
                "action": req.action,
                "phase": req.phase,
                "total": req.total,
                "correct": req.correct,
                "file_path": req.file_path,
            },
            completed_at=now if is_completed else None,
        )
        db.add(row)

    # get_db auto-commits

    # Trigger profile update after quiz or flashcard completion
    if is_completed and req.action in ("quiz", "flashcard"):
        try:
            import asyncio
            from services.profile_updater import update_profile_after_event
            asyncio.create_task(update_profile_after_event(
                user_id=current_user.id,
                event_type=f"{req.action}_complete",
                event_data={
                    "node_id": req.node_id,
                    "score": req.score,
                    "total": req.total,
                    "correct": req.correct,
                }
            ))
        except Exception as e:
            logger.warning(f"Failed to trigger profile update: {e}")

    return {"ok": True}
