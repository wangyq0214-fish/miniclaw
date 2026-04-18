"""
Token Statistics API

Provides token counting for sessions and files using tiktoken.
"""
import logging
from typing import List
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from memory import system_prompt_builder, session_manager
from config import get_project_root

logger = logging.getLogger(__name__)

router = APIRouter()

# Use tiktoken for token counting
try:
    import tiktoken
    _encoding = tiktoken.get_encoding("cl100k_base")
except ImportError:
    logger.warning("tiktoken not installed, using approximate token counting")
    _encoding = None


def count_tokens(text: str) -> int:
    """
    Count tokens in text using tiktoken.

    Falls back to approximate counting if tiktoken is not available.
    """
    if _encoding:
        return len(_encoding.encode(text))

    # Approximate: ~4 characters per token for English
    return len(text) // 4


class TokenStatsResponse(BaseModel):
    """Token statistics for a session."""
    system_tokens: int
    message_tokens: int
    total_tokens: int


class FileTokenRequest(BaseModel):
    """Request for batch file token counting."""
    paths: List[str]


class FileTokenResult(BaseModel):
    """Token count for a single file."""
    path: str
    tokens: int
    exists: bool


class FileTokenResponse(BaseModel):
    """Response for batch file token counting."""
    files: List[FileTokenResult]


@router.get("/tokens/session/{session_id}", response_model=TokenStatsResponse)
async def get_session_tokens(session_id: str):
    """
    Get token statistics for a session.

    Returns:
        - system_tokens: Tokens in system prompt
        - message_tokens: Tokens in conversation history
        - total_tokens: Combined total
    """
    try:
        # Get session
        session = session_manager.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        # Build system prompt and count tokens
        system_prompt = system_prompt_builder.build()
        system_tokens = count_tokens(system_prompt)

        # Count message tokens
        messages = session.get("messages", [])
        message_tokens = 0

        for msg in messages:
            content = msg.get("content", "")
            message_tokens += count_tokens(content)

            # Include tool calls if present
            tool_calls = msg.get("tool_calls", [])
            for tc in tool_calls:
                if isinstance(tc, dict):
                    message_tokens += count_tokens(str(tc))

        # Include compressed context
        compressed_context = session.get("compressed_context", "")
        if compressed_context:
            message_tokens += count_tokens(compressed_context)

        return TokenStatsResponse(
            system_tokens=system_tokens,
            message_tokens=message_tokens,
            total_tokens=system_tokens + message_tokens
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error counting tokens for session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tokens/files", response_model=FileTokenResponse)
async def count_file_tokens(request: FileTokenRequest):
    """
    Count tokens in multiple files.

    Args:
        paths: List of file paths (relative to project root)

    Returns:
        Token count for each file
    """
    try:
        project_root = get_project_root()
        results = []

        for path in request.paths:
            try:
                # Resolve path
                file_path = project_root / path

                if not file_path.exists():
                    results.append(FileTokenResult(
                        path=path,
                        tokens=0,
                        exists=False
                    ))
                    continue

                if not file_path.is_file():
                    results.append(FileTokenResult(
                        path=path,
                        tokens=0,
                        exists=False
                    ))
                    continue

                # Read and count
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                tokens = count_tokens(content)

                results.append(FileTokenResult(
                    path=path,
                    tokens=tokens,
                    exists=True
                ))

            except Exception as e:
                logger.error(f"Error counting tokens for file {path}: {str(e)}")
                results.append(FileTokenResult(
                    path=path,
                    tokens=0,
                    exists=False
                ))

        return FileTokenResponse(files=results)

    except Exception as e:
        logger.error(f"Error in count_file_tokens: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
