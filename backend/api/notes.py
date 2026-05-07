"""
Notes API - Per-user note persistence for Notes view

Stores notes as a JSON array in:
  data/users/{user_id}/workspace/notes.json
"""
import json
import logging
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import get_user_workspace_dir
from auth.security import get_current_user
from models.complete_models import User
from storage.cos_sync import upload_notes_async, fetch_notes

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ──

class NoteItem(BaseModel):
    id: str
    title: str
    content: str
    source_id: Optional[str] = None
    created_at: str


class NoteCreateRequest(BaseModel):
    title: str
    content: str
    source_id: Optional[str] = None


class NoteListResponse(BaseModel):
    notes: List[NoteItem]


# ── Helpers ──

def _notes_path(user_id: int) -> Path:
    return get_user_workspace_dir(user_id) / "notes.json"


def _load_notes(user_id: int) -> List[dict]:
    path = _notes_path(user_id)
    if not path.exists():
        # Try loading from COS
        cos_content = fetch_notes(user_id)
        if cos_content:
            try:
                notes = json.loads(cos_content)
                # Cache locally
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(cos_content, encoding="utf-8")
                return notes
            except (json.JSONDecodeError, OSError):
                pass
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _save_notes(user_id: int, notes: List[dict]) -> None:
    path = _notes_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(notes, ensure_ascii=False, indent=2)
    path.write_text(content, encoding="utf-8")
    # Sync to COS in background
    upload_notes_async(user_id, content)


# ── Endpoints ──

@router.get("/notes", response_model=NoteListResponse)
async def list_notes(current_user: User = Depends(get_current_user)):
    notes = _load_notes(current_user.id)
    return NoteListResponse(notes=[NoteItem(**n) for n in notes])


@router.post("/notes", response_model=NoteItem)
async def create_note(
    request: NoteCreateRequest,
    current_user: User = Depends(get_current_user),
):
    new_note = {
        "id": f"note-{int(time.time() * 1000)}",
        "title": request.title,
        "content": request.content,
        "source_id": request.source_id,
        "created_at": time.strftime("%Y/%m/%d %H:%M"),
    }
    notes = _load_notes(current_user.id)
    notes.insert(0, new_note)
    _save_notes(current_user.id, notes)
    return NoteItem(**new_note)


@router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
):
    notes = _load_notes(current_user.id)
    new_notes = [n for n in notes if n.get("id") != note_id]
    if len(new_notes) == len(notes):
        raise HTTPException(status_code=404, detail="Note not found")
    _save_notes(current_user.id, new_notes)
    return {"ok": True}
