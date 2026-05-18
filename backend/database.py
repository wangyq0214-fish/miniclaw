"""
Database configuration and connection management.
"""
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from typing import AsyncGenerator
import os
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL Configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/miniclaw"
)

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# SQLAlchemy setup
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

# Redis client
redis_client: redis.Redis = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database sessions.
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_redis() -> redis.Redis:
    """
    Get Redis client instance.
    """
    return redis_client


async def init_db():
    """
    Initialize database tables and add missing columns.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns that may be missing from older table versions
        await _add_missing_columns(conn)


async def _add_missing_columns(conn):
    """Add columns introduced after initial table creation and migrate data."""
    from sqlalchemy import text
    migrations = [
        ("evaluation_reports", "effective_seconds", "INTEGER"),
    ]
    for table, column, col_type in migrations:
        try:
            await conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
            ))
        except Exception:
            pass  # Column may already exist or dialect doesn't support IF NOT EXISTS
    # Migrate old effective_hours -> effective_seconds
    try:
        await conn.execute(text(
            "UPDATE evaluation_reports SET effective_seconds = ROUND(effective_hours * 3600) "
            "WHERE effective_seconds IS NULL AND effective_hours IS NOT NULL"
        ))
    except Exception:
        pass


async def init_redis():
    """
    Initialize Redis connection.
    """
    global redis_client
    redis_client = await redis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )


async def close_redis():
    """
    Close Redis connection.
    """
    if redis_client:
        await redis_client.close()
