"""
Mini-OpenClaw Backend - Entry Point

FastAPI application with:
- SSE streaming chat
- Session management
- File operations
- Token statistics
- RAG memory indexing
"""
import os
import sys
import logging
from pathlib import Path
from typing import AsyncGenerator
from contextlib import asynccontextmanager

# Add backend to path for imports
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
# Suppress noisy third-party loggers
logging.getLogger("python_multipart").setLevel(logging.WARNING)
logging.getLogger("passlib").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("neo4j").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Project paths
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", str(backend_dir)))
MEMORY_DIR = PROJECT_ROOT / "memory"
LOGS_DIR = MEMORY_DIR / "logs"
SESSIONS_DIR = PROJECT_ROOT / "sessions"
SKILLS_DIR = PROJECT_ROOT / "skills"
WORKSPACE_DIR = PROJECT_ROOT / "workspace"
KNOWLEDGE_DIR = PROJECT_ROOT / "knowledge"
STORAGE_DIR = PROJECT_ROOT / "storage"

# Ensure directories exist
for dir_path in [MEMORY_DIR, LOGS_DIR, SESSIONS_DIR, SKILLS_DIR, WORKSPACE_DIR, KNOWLEDGE_DIR, STORAGE_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)


async def initialize_agent():
    """
    Initialize the agent manager with tools.

    Note: This is a global initialization without user context.
    Per-request initialization with user_id happens in chat endpoint.
    """
    from agent import agent_manager
    from tools import get_custom_tools
    from memory import session_manager, system_prompt_builder
    from database import init_db, init_redis

    try:
        # Initialize database and Redis
        await init_db()
        await init_redis()
        logger.info("Database and Redis initialized")

        # Get tools (excluding deepagents built-in file tools to avoid duplicates)
        # Note: user_id will be passed per-request in chat endpoint
        tools = get_custom_tools(base_dir=PROJECT_ROOT)

        # Initialize agent without user_id (global initialization)
        # Per-request initialization with user_id happens in chat endpoint
        await agent_manager.initialize(
            base_dir=PROJECT_ROOT,
            tools=tools,
            session_manager=session_manager,
            prompt_builder=system_prompt_builder,
            memory_indexer=None,
            user_id=None  # No user context at startup
        )

        logger.info(f"Agent initialized with {len(tools)} tools")

    except Exception as e:
        logger.error(f"Error initializing agent: {str(e)}")


def build_memory_index():
    """
    Build memory index for RAG.
    (Now handled by deepagents MemoryMiddleware)
    """
    logger.info("Memory index handling moved to deepagents")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Startup:
    1. Initialize AgentManager (skills injected at runtime by deepagents SkillsMiddleware)
    2. Build memory index

    Shutdown:
    - Cleanup resources
    """
    logger.info("Starting Mini-OpenClaw...")

    # Startup
    await initialize_agent()

    logger.info("Mini-OpenClaw started successfully")

    yield

    # Shutdown
    from database import close_redis
    await close_redis()
    logger.info("Shutting down Mini-OpenClaw...")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Mini-OpenClaw API",
    description="A lightweight AI Agent system with file-first memory",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoints
@app.get("/")
async def root():
    return {
        "name": "Mini-OpenClaw",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


# Import and include routers
from api import (
    chat_router,
    files_router,
    tokens_router,
    compress_router,
    config_router,
    courses_router,
    auth_router
)
from api.sessions_v2 import router as sessions_v2_router
from api.user import router as user_router
from api.videos import router as videos_router
from api.mindmap import router as mindmap_router
from api.knowledge_graph import router as knowledge_graph_router
from api.subagent import router as subagent_router
from api.tts import router as tts_router
from api.sources import router as sources_router
from api.notes import router as notes_router

app.include_router(chat_router, prefix="/api", tags=["chat"])
app.include_router(sessions_v2_router, tags=["sessions_v2"])
app.include_router(files_router, prefix="/api", tags=["files"])
app.include_router(tokens_router, prefix="/api", tags=["tokens"])
app.include_router(compress_router, prefix="/api", tags=["compress"])
app.include_router(config_router, prefix="/api", tags=["config"])
app.include_router(courses_router, prefix="/api", tags=["courses"])
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(user_router, prefix="/api/user", tags=["user"])
app.include_router(videos_router, prefix="/api", tags=["videos"])
app.include_router(mindmap_router, prefix="/api", tags=["mindmap"])
app.include_router(knowledge_graph_router, prefix="/api", tags=["knowledge_graph"])
app.include_router(subagent_router, prefix="/api", tags=["subagent"])
app.include_router(tts_router, prefix="/api/tts", tags=["tts"])
app.include_router(sources_router, prefix="/api", tags=["sources"])
app.include_router(notes_router, prefix="/api", tags=["notes"])

# Mount static files for knowledge assets (images, etc.)
# Images should be stored in knowledge/assets/ folder
app.mount("/static/knowledge", StaticFiles(directory=str(KNOWLEDGE_DIR)), name="knowledge")


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8002))

    logger.info(f"Starting Mini-OpenClaw on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
