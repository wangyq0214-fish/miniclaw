"""
Mini-OpenClaw API Package

Provides REST API endpoints for:
- Chat: SSE streaming conversation
- Sessions: Session management (v2 with Redis + PostgreSQL)
- Files: File operations
- Tokens: Token statistics
- Compress: Session compression
- Config: Runtime configuration
- Courses: Course content management
"""
from .chat import router as chat_router
from .files import router as files_router
from .tokens import router as tokens_router
from .compress import router as compress_router
from .config_api import router as config_router
from .courses import router as courses_router
from .auth import router as auth_router

__all__ = [
    "chat_router",
    "files_router",
    "tokens_router",
    "compress_router",
    "config_router",
    "courses_router",
    "auth_router",
]
