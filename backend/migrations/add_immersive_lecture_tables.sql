-- Migration: Add immersive_lecture_content table
-- Created: 2026-05-21
-- Description: Store generated lecture content with speech for caching

-- 讲解内容表
CREATE TABLE IF NOT EXISTS immersive_lecture_content (
    id SERIAL PRIMARY KEY,
    course_id VARCHAR(100) NOT NULL,
    chapter_id INTEGER NOT NULL,
    content_hash VARCHAR(64) NOT NULL,  -- MD5 hash of source markdown
    blocks JSONB NOT NULL,  -- Array of content blocks with speech
    total_sections INTEGER DEFAULT 0,
    total_blocks INTEGER DEFAULT 0,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, chapter_id, content_hash)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_lecture_content_course_chapter
ON immersive_lecture_content(course_id, chapter_id);

-- 用户学习进度表（之前的设计）
CREATE TABLE IF NOT EXISTS immersive_lecture_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    course_id VARCHAR(100) NOT NULL,
    chapter_id INTEGER NOT NULL,
    page_index INTEGER NOT NULL,  -- Which page within the chapter
    current_block_index INTEGER DEFAULT 0,
    current_section INTEGER DEFAULT 0,
    total_sections INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id, chapter_id, page_index)
);

CREATE INDEX IF NOT EXISTS idx_immersive_progress_user
ON immersive_lecture_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_immersive_progress_course
ON immersive_lecture_progress(user_id, course_id, chapter_id, page_index);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_immersive_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_immersive_progress_timestamp
BEFORE UPDATE ON immersive_lecture_progress
FOR EACH ROW
EXECUTE FUNCTION update_immersive_progress_timestamp();
