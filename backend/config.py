"""
Mini-OpenClaw Configuration Module
"""
import logging
import os
from pathlib import Path
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # OpenAI API Configuration
    openai_api_base: str = Field(
        default="https://api.openai.com/v1",
        description="Base URL for OpenAI-compatible API"
    )
    openai_api_key: str = Field(
        default="",
        description="API key for OpenAI-compatible service"
    )
    openai_model: str = Field(
        default="gpt-4o-mini",
        description="Model to use for agent"
    )

    # Embedding Model Configuration
    embedding_api_base: str = Field(
        default="",
        description="Base URL for embedding API (defaults to openai_api_base)"
    )
    embedding_api_key: str = Field(
        default="",
        description="API key for embedding service (defaults to openai_api_key)"
    )
    embedding_model: str = Field(
        default="",
        description="Model to use for embeddings (defaults to openai_model if not set)"
    )

    # Reranker Model Configuration
    rerank_api_base: str = Field(
        default="",
        description="Base URL for reranker API (defaults to openai_api_base)"
    )
    rerank_api_key: str = Field(
        default="",
        description="API key for reranker service (defaults to openai_api_key)"
    )
    rerank_model: str = Field(
        default="",
        description="Model to use for reranking"
    )

    # Server Configuration
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8002, description="Server port")

    # Project Paths
    project_root: Path = Field(
        default=Path("./backend"),
        description="Project root directory"
    )

    # Memory Configuration
    max_memory_tokens: int = Field(
        default=8000,
        description="Maximum tokens for memory context"
    )

    # Auto Compression Configuration
    auto_compress_enabled: bool = Field(
        default=True,
        description="Enable automatic session compression"
    )
    auto_compress_threshold: int = Field(
        default=20,
        description="Number of messages to trigger auto compression"
    )
    auto_compress_ratio: float = Field(
        default=0.5,
        description="Ratio of messages to compress when threshold reached"
    )

    # Tool Configuration
    enable_tool_calling: bool = Field(
        default=True,
        description="Enable tool calling (set to false for LLMs that don't support function calling)"
    )

    # Embedding Configuration
    enable_embedding_index: bool = Field(
        default=True,
        description="Enable embedding index for memory (set to false if embedding model is not compatible)"
    )

    # Tool Configuration
    shell_tool_root_dir: Optional[str] = Field(
        default=None,
        description="Root directory for shell tool (sandbox)"
    )
    enable_dangerous_shell_commands: bool = Field(
        default=False,
        description="Enable dangerous shell commands (rm -rf, etc.)"
    )

    # DeepSeek API Configuration (used by deepagents)
    deepseek_api_base: str = Field(
        default="https://api.deepseek.com",
        description="Base URL for DeepSeek API"
    )
    deepseek_api_key: str = Field(
        default="",
        description="API key for DeepSeek"
    )
    deepseek_model: str = Field(
        default="deepseek-chat",
        description="Model to use for DeepSeek"
    )

    # Neo4j Configuration
    neo4j_uri: str = Field(
        default="bolt://localhost:7687",
        description="Neo4j connection URI"
    )
    neo4j_user: str = Field(
        default="neo4j",
        description="Neo4j username"
    )
    neo4j_password: str = Field(
        default="",
        description="Neo4j password"
    )
    neo4j_database: str = Field(
        default="neo4j",
        description="Neo4j database name"
    )
    neo4j_fulltext_index: str = Field(
        default="chunkFullTextIndex",
        description="Name of the fulltext index on Chunk nodes"
    )
    neo4j_vector_index: str = Field(
        default="chunkVectorIndex",
        description="Name of the vector index on Chunk nodes (for future use)"
    )

    # PostgreSQL Configuration
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/miniclaw",
        description="PostgreSQL database URL"
    )

    # Redis Configuration
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL"
    )

    # JWT Configuration
    secret_key: str = Field(
        default="your-secret-key-change-in-production",
        description="Secret key for JWT token generation"
    )
    access_token_expire_minutes: int = Field(
        default=30,
        description="JWT token expiration time in minutes"
    )

    # Direct Embedding Endpoint Configuration
    embedding_direct_url: str = Field(
        default="http://36.141.78.166:18869/v1/embeddings",
        description="Direct HTTP URL for embedding endpoint (bypasses OpenAI SDK)"
    )
    embedding_direct_model: str = Field(
        default="qwen3-embedding:8b",
        description="Model name for direct embedding endpoint"
    )
    embedding_max_retries: int = Field(
        default=3,
        description="Max retry attempts for embedding API calls"
    )
    embedding_retry_delay: float = Field(
        default=1.0,
        description="Seconds to wait between embedding retries"
    )

    # Tencent Cloud COS Configuration
    cos_secret_id: str = Field(
        default="",
        description="Tencent Cloud COS SecretId"
    )
    cos_secret_key: str = Field(
        default="",
        description="Tencent Cloud COS SecretKey"
    )
    cos_bucket: str = Field(
        default="",
        description="COS bucket name (e.g. miniclaw-files-1421625382)"
    )
    cos_region: str = Field(
        default="ap-guangzhou",
        description="COS region (e.g. ap-guangzhou)"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra fields from .env


# Global settings instance
settings = Settings()

# Path helpers
def get_project_root() -> Path:
    """Get project root path."""
    return settings.project_root


def get_memory_dir() -> Path:
    """Get memory directory path."""
    return get_project_root() / "memory"


def get_sessions_dir() -> Path:
    """Get sessions directory path."""
    return get_project_root() / "sessions"


def get_skills_dir() -> Path:
    """Get skills directory path."""
    return get_project_root() / "skills"


def get_workspace_dir() -> Path:
    """Get workspace directory path."""
    return get_project_root() / "workspace"


def get_knowledge_dir() -> Path:
    """Get knowledge directory path."""
    return get_project_root() / "knowledge"


def get_storage_dir() -> Path:
    """Get storage directory path."""
    return get_project_root() / "storage"


# User-specific path helpers
def get_user_memory_dir(user_id: int) -> Path:
    """Get user memory directory path."""
    return get_project_root() / "data" / "users" / str(user_id) / "memory"


def get_user_workspace_dir(user_id: int) -> Path:
    """Get user workspace directory path."""
    return get_project_root() / "data" / "users" / str(user_id) / "workspace"


def get_user_sessions_dir(user_id: int) -> Path:
    """Get user sessions archive directory path."""
    return get_project_root() / "data" / "users" / str(user_id) / "sessions"