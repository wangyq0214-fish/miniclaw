"""
Database models for immersive lecture
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text
from sqlalchemy.sql import func
from database import Base


class ImmersiveLectureContent(Base):
    """Generated lecture content with speech"""
    __tablename__ = "immersive_lecture_content"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(String(100), nullable=False)
    chapter_id = Column(Integer, nullable=False)
    content_hash = Column(String(64), nullable=False)  # MD5 of source markdown
    blocks = Column(JSON, nullable=False)  # Array of content blocks
    total_sections = Column(Integer, default=0)
    total_blocks = Column(Integer, default=0)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())


class ImmersiveLectureProgress(Base):
    """User learning progress in immersive classroom"""
    __tablename__ = "immersive_lecture_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    course_id = Column(String(100), nullable=False)
    chapter_id = Column(Integer, nullable=False)
    page_index = Column(Integer, nullable=False)  # Which page within the chapter
    current_block_index = Column(Integer, default=0)
    current_section = Column(Integer, default=0)
    total_sections = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    last_accessed = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
