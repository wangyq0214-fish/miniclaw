"""
Sources API - Per-user source management for Notes view

Stores source metadata as a JSON array in:
  data/users/{user_id}/workspace/knowledge/sources.json

File content is stored in Tencent Cloud COS.
"""
import json
import logging
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from qcloud_cos import CosConfig, CosS3Client

from config import settings, get_user_workspace_dir
from auth.security import get_current_user
from models.complete_models import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── COS Client ──

def _get_cos_client() -> CosS3Client:
    """Create a COS client from settings."""
    cos_config = CosConfig(
        Region=settings.cos_region,
        SecretId=settings.cos_secret_id,
        SecretKey=settings.cos_secret_key,
    )
    return CosS3Client(cos_config)


def _cos_key(user_id: int, source_id: str, filename: str) -> str:
    """Build the COS object key for a user's source file."""
    return f"users/{user_id}/sources/{source_id}/{filename}"


# ── Models ──

class SourceItem(BaseModel):
    id: str
    title: str
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None  # 'text', 'file', 'website'


class SourceCreateRequest(BaseModel):
    title: str
    content: Optional[str] = None
    file_type: Optional[str] = 'text'


class SourceListResponse(BaseModel):
    sources: List[SourceItem]


# ── Helpers ──

def _sources_path(user_id: int) -> Path:
    return get_user_workspace_dir(user_id) / "knowledge" / "sources.json"


def _load_sources(user_id: int) -> List[dict]:
    path = _sources_path(user_id)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _save_sources(user_id: int, sources: List[dict]) -> None:
    path = _sources_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Endpoints ──

@router.get("/sources", response_model=SourceListResponse)
async def list_sources(current_user: User = Depends(get_current_user)):
    """List all sources for the current user."""
    sources = _load_sources(current_user.id)
    return SourceListResponse(sources=[SourceItem(**s) for s in sources])


@router.post("/sources", response_model=SourceItem)
async def create_source(
    request: SourceCreateRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a text/website source (no file upload)."""
    new_source = {
        "id": f"src-{int(time.time() * 1000)}",
        "title": request.title,
        "content": request.content,
        "file_type": request.file_type or "text",
    }
    sources = _load_sources(current_user.id)
    sources.insert(0, new_source)
    _save_sources(current_user.id, sources)
    return SourceItem(**new_source)


@router.post("/sources/upload", response_model=SourceItem)
async def upload_source_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file source to COS and save metadata."""
    source_id = f"src-{int(time.time() * 1000)}"
    filename = file.filename or "unnamed"
    key = _cos_key(current_user.id, source_id, filename)

    # Read file content
    content = await file.read()

    # Upload to COS
    try:
        client = _get_cos_client()
        client.put_object(
            Bucket=settings.cos_bucket,
            Body=content,
            Key=key,
            ContentType=file.content_type or "application/octet-stream",
        )
        logger.info(f"Uploaded file to COS: {key} ({len(content)} bytes)")
    except Exception as e:
        logger.error(f"COS upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"文件上传失败: {e}")

    # Build metadata
    new_source = {
        "id": source_id,
        "title": filename,
        "content": None,
        "file_url": key,  # store COS key, generate signed URL on read
        "file_type": "file",
    }
    sources = _load_sources(current_user.id)
    sources.insert(0, new_source)
    _save_sources(current_user.id, sources)

    return SourceItem(**new_source)


@router.get("/sources/{source_id}/download")
async def download_source_file(
    source_id: str,
    current_user: User = Depends(get_current_user),
):
    """Generate a signed URL for downloading a source file."""
    sources = _load_sources(current_user.id)
    source = next((s for s in sources if s.get("id") == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if not source.get("file_url"):
        raise HTTPException(status_code=400, detail="Source has no file")

    try:
        client = _get_cos_client()
        signed_url = client.get_presigned_url(
            Method="GET",
            Bucket=settings.cos_bucket,
            Key=source["file_url"],
            Expired=300,  # 5 minutes
        )
        return RedirectResponse(url=signed_url)
    except Exception as e:
        logger.error(f"COS signed URL failed: {e}")
        raise HTTPException(status_code=500, detail=f"生成下载链接失败: {e}")


@router.get("/sources/{source_id}/content")
async def get_source_content(
    source_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return file content directly from COS (avoids CORS issues)."""
    sources = _load_sources(current_user.id)
    source = next((s for s in sources if s.get("id") == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Text/website sources: content is in metadata
    if source.get("file_type") in ("text", "website"):
        return {"content": source.get("content", ""), "type": "text"}

    # File sources: fetch from COS
    if not source.get("file_url"):
        raise HTTPException(status_code=400, detail="Source has no file")

    try:
        client = _get_cos_client()
        response = client.get_object(
            Bucket=settings.cos_bucket,
            Key=source["file_url"],
        )
        raw = response["Body"].get_raw_stream().read()
        filename = source.get("title", "file").lower()

        # PDF: extract text
        if filename.endswith(".pdf"):
            try:
                from pdfminer.high_level import extract_text
                import io
                text = extract_text(io.BytesIO(raw))
                return {"content": text.strip(), "type": "text"}
            except Exception as e:
                logger.warning(f"PDF extraction failed: {e}")
                return {"content": "", "type": "text"}

        # Try decoding as text
        try:
            content = raw.decode("utf-8")
            return {"content": content, "type": "text"}
        except UnicodeDecodeError:
            # Binary file - return as base64
            import base64
            content = base64.b64encode(raw).decode("ascii")
            return {"content": content, "type": "binary", "filename": source.get("title", "file")}
    except Exception as e:
        logger.error(f"COS read failed: {e}")
        raise HTTPException(status_code=500, detail=f"读取文件失败: {e}")


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a source and its file from COS."""
    sources = _load_sources(current_user.id)
    source = next((s for s in sources if s.get("id") == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Delete file from COS if exists
    if source.get("file_url"):
        try:
            client = _get_cos_client()
            client.delete_object(
                Bucket=settings.cos_bucket,
                Key=source["file_url"],
            )
            logger.info(f"Deleted COS object: {source['file_url']}")
        except Exception as e:
            logger.warning(f"COS delete failed (continuing): {e}")

    new_sources = [s for s in sources if s.get("id") != source_id]
    _save_sources(current_user.id, new_sources)
    return {"ok": True}
