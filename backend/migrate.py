"""
Database migration script using Alembic.
"""
import asyncio
from database import init_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate():
    """Run database migrations."""
    logger.info("Starting database migration...")
    logger.info("Creating all tables...")

    # Import all models to ensure they are registered
    from models import (
        User, StudentProfile, ConversationSession, Message,
        Resource, LearningProgress, AsyncTask
    )

    await init_db()
    logger.info("Database migration completed successfully!")
    logger.info("Tables created:")
    logger.info("  - users")
    logger.info("  - student_profiles")
    logger.info("  - conversation_sessions")
    logger.info("  - messages")
    logger.info("  - resources")
    logger.info("  - learning_progress")
    logger.info("  - async_tasks")


if __name__ == "__main__":
    asyncio.run(migrate())
