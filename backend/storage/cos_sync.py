"""
COS Sync Module - Notes and source files on COS.

Strategy:
- Notes → COS (notes.json synced on save/load)
- Source files → COS (handled by sources.py directly)
- Everything else (generated resources, memory, etc.) → local only

COS key structure:
  users/{user_id}/notes.json
  users/{user_id}/sources/{source_id}/{filename}
"""
import logging
import threading
from pathlib import Path

from qcloud_cos import CosConfig, CosS3Client

from config import settings

logger = logging.getLogger(__name__)

# Thread pool for background operations
_executor = None
_executor_lock = threading.Lock()


def _get_executor():
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                from concurrent.futures import ThreadPoolExecutor
                _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cos-sync")
    return _executor


def _get_cos_client() -> CosS3Client:
    cos_config = CosConfig(
        Region=settings.cos_region,
        SecretId=settings.cos_secret_id,
        SecretKey=settings.cos_secret_key,
    )
    return CosS3Client(cos_config)


# ── Upload to COS ──

def upload_bytes(user_id: int, cos_key: str, content: bytes) -> bool:
    """Upload raw bytes directly to COS."""
    try:
        client = _get_cos_client()
        client.put_object(Bucket=settings.cos_bucket, Body=content, Key=cos_key)
        logger.debug(f"COS upload: {cos_key} ({len(content)} bytes)")
        return True
    except Exception as e:
        logger.warning(f"COS upload failed for {cos_key}: {e}")
        return False


def upload_bytes_async(user_id: int, cos_key: str, content: bytes):
    _get_executor().submit(upload_bytes, user_id, cos_key, content)


# ── Download from COS ──

def download_file(user_id: int, cos_key: str, local_path: Path) -> bool:
    try:
        client = _get_cos_client()
        response = client.get_object(Bucket=settings.cos_bucket, Key=cos_key)
        content = response["Body"].get_raw_stream().read()
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(content)
        return True
    except Exception as e:
        logger.warning(f"COS download failed for {cos_key}: {e}")
        return False


def fetch_file_content(user_id: int, cos_key: str) -> bytes | None:
    """Fetch file content from COS as bytes (no local write)."""
    try:
        client = _get_cos_client()
        response = client.get_object(Bucket=settings.cos_bucket, Key=cos_key)
        return response["Body"].get_raw_stream().read()
    except Exception as e:
        logger.warning(f"COS fetch failed for {cos_key}: {e}")
        return None


# ── Notes sync ──

def upload_notes(user_id: int, content: str):
    """Upload notes.json to COS."""
    cos_key = f"users/{user_id}/notes.json"
    upload_bytes(user_id, cos_key, content.encode("utf-8"))


def upload_notes_async(user_id: int, content: str):
    """Upload notes.json to COS in background."""
    _get_executor().submit(upload_notes, user_id, content)


def fetch_notes(user_id: int) -> str | None:
    """Fetch notes.json from COS."""
    cos_key = f"users/{user_id}/notes.json"
    content = fetch_file_content(user_id, cos_key)
    if content is not None:
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return None
    return None
