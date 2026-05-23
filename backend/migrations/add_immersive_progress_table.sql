-- Migration: Add immersive_lecture_progress table
-- Created: 2026-05-21
-- Description: Store user progress in immersive classroom mode

CREATE TABLE IF NOT EXISTS immersive_lecture_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    course_id VARCHAR(100) NOT NULL,
    chapter_id INTEGER NOT NULL,
    current_section INTEGER DEFAULT 0,
    total_sections INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id, chapter_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_immersive_progress_user
ON immersive_lecture_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_immersive_progress_course
ON immersive_lecture_progress(user_id, course_id, chapter_id);

-- Add trigger to update updated_at timestamp
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
