"""
Video serving endpoint for generated Manim videos.

Supports both global workspace and per-user workspace paths.
When auth token is provided, serves from the user's workspace.
"""
import os
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select

from database import async_session_maker
from models import User

logger = logging.getLogger(__name__)

router = APIRouter()

PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(Path(__file__).parent.parent)))
GLOBAL_WORKSPACE = PROJECT_ROOT / "workspace"


async def _resolve_user_workspace(authorization: Optional[str]) -> Path:
    """Resolve user workspace from Authorization header. Falls back to global workspace."""
    if not authorization or not authorization.startswith("Bearer "):
        return GLOBAL_WORKSPACE

    try:
        from auth.security import decode_access_token
        token = authorization[7:]
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            username = payload["sub"]
            async with async_session_maker() as db:
                result = await db.execute(select(User).where(User.username == username))
                user = result.scalar_one_or_none()
                if user:
                    from config import get_user_workspace_dir
                    user_workspace = get_user_workspace_dir(user.id)
                    if user_workspace.exists():
                        return user_workspace
    except Exception as e:
        logger.debug(f"Auth resolution failed, using global workspace: {e}")

    return GLOBAL_WORKSPACE


@router.get("/videos/{file_path:path}")
async def serve_video(file_path: str, request: Request):
    """Serve a generated video file.

    If Authorization header is present, resolve path from user's workspace.
    Otherwise, resolve from global workspace.
    """
    authorization = request.headers.get("authorization")
    workspace_dir = await _resolve_user_workspace(authorization)

    # Resolve the full path
    full_path = (workspace_dir / file_path).resolve()

    # Security: ensure the path is within workspace
    if not str(full_path).startswith(str(workspace_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    # If not found in user workspace, try global workspace as fallback
    if not full_path.exists() and workspace_dir != GLOBAL_WORKSPACE:
        fallback_path = (GLOBAL_WORKSPACE / file_path).resolve()
        if str(fallback_path).startswith(str(GLOBAL_WORKSPACE.resolve())) and fallback_path.exists():
            full_path = fallback_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    if not full_path.suffix.lower() in (".mp4", ".webm", ".ogg"):
        raise HTTPException(status_code=400, detail="Not a video file")

    return FileResponse(
        path=str(full_path),
        media_type="video/mp4",
        filename=full_path.name,
    )
