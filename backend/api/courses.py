"""
Courses API - Course content management and rendering

Features:
- List all available courses
- Get course structure and chapters
- Render course content to frontend
"""
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_project_root

logger = logging.getLogger(__name__)

router = APIRouter()


class ChapterInfo(BaseModel):
    chapter_id: int
    title: str
    file: str
    content: Optional[str] = None


class CourseInfo(BaseModel):
    course_id: str
    course_name: str
    course_name_en: Optional[str] = None
    description: Optional[str] = None
    chapters: List[ChapterInfo]
    total_chapters: int


class CoursesListResponse(BaseModel):
    courses: List[CourseInfo]


def scan_course_directory(course_path: Path) -> Optional[CourseInfo]:
    """
    Scan a course directory and extract course information.

    Args:
        course_path: Path to the course directory

    Returns:
        CourseInfo object or None if invalid
    """
    if not course_path.is_dir():
        return None

    course_name = course_path.name
    course_id = course_name.lower().replace(" ", "-")

    # Find all chapter markdown files
    chapter_files = sorted(course_path.glob("chapter*.md"))

    if not chapter_files:
        logger.warning(f"No chapter files found in {course_path}")
        return None

    chapters = []
    for chapter_file in chapter_files:
        # Extract chapter number from filename (e.g., chapter1.md -> 1)
        try:
            chapter_num = int(chapter_file.stem.replace("chapter", ""))
        except ValueError:
            logger.warning(f"Invalid chapter filename: {chapter_file.name}")
            continue

        # Read first line as chapter title
        try:
            with open(chapter_file, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                # Remove markdown heading markers
                title = first_line.lstrip('#').strip()
        except Exception as e:
            logger.error(f"Error reading {chapter_file}: {e}")
            title = f"第 {chapter_num} 章"

        chapters.append(ChapterInfo(
            chapter_id=chapter_num,
            title=title,
            file=chapter_file.name
        ))

    # Sort chapters by chapter_id
    chapters.sort(key=lambda x: x.chapter_id)

    return CourseInfo(
        course_id=course_id,
        course_name=course_name,
        description=f"{course_name}课程，共{len(chapters)}章",
        chapters=chapters,
        total_chapters=len(chapters)
    )


@router.get("/courses", response_model=CoursesListResponse)
async def list_courses():
    """
    List all available courses from knowledge/source directory.

    Scans subdirectories in knowledge/source/ and returns course information.
    """
    try:
        project_root = get_project_root()
        source_dir = project_root / "knowledge" / "source"

        if not source_dir.exists():
            logger.warning(f"Source directory not found: {source_dir}")
            return CoursesListResponse(courses=[])

        courses = []

        # Scan all subdirectories
        for course_dir in source_dir.iterdir():
            if not course_dir.is_dir():
                continue

            # Skip hidden directories
            if course_dir.name.startswith('.'):
                continue

            course_info = scan_course_directory(course_dir)
            if course_info:
                courses.append(course_info)

        logger.info(f"Found {len(courses)} courses")
        return CoursesListResponse(courses=courses)

    except Exception as e:
        logger.error(f"Error listing courses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/courses/{course_id}", response_model=CourseInfo)
async def get_course(course_id: str):
    """
    Get detailed information about a specific course.

    Args:
        course_id: Course identifier (e.g., "深度学习")
    """
    try:
        project_root = get_project_root()
        source_dir = project_root / "knowledge" / "source"

        # Find course directory (case-insensitive match)
        course_dir = None
        for dir_path in source_dir.iterdir():
            if dir_path.is_dir() and dir_path.name.lower().replace(" ", "-") == course_id.lower():
                course_dir = dir_path
                break

        if not course_dir:
            raise HTTPException(status_code=404, detail=f"Course not found: {course_id}")

        course_info = scan_course_directory(course_dir)
        if not course_info:
            raise HTTPException(status_code=404, detail=f"Invalid course directory: {course_id}")

        return course_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting course {course_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/courses/{course_id}/chapters/{chapter_id}")
async def get_chapter_content(course_id: str, chapter_id: int):
    """
    Get the content of a specific chapter.

    Args:
        course_id: Course identifier
        chapter_id: Chapter number

    Returns:
        Chapter content in markdown format
    """
    try:
        project_root = get_project_root()
        source_dir = project_root / "knowledge" / "source"

        # Find course directory
        course_dir = None
        for dir_path in source_dir.iterdir():
            if dir_path.is_dir() and dir_path.name.lower().replace(" ", "-") == course_id.lower():
                course_dir = dir_path
                break

        if not course_dir:
            raise HTTPException(status_code=404, detail=f"Course not found: {course_id}")

        # Find chapter file
        chapter_file = course_dir / f"chapter{chapter_id}.md"

        if not chapter_file.exists():
            raise HTTPException(status_code=404, detail=f"Chapter {chapter_id} not found")

        # Read chapter content
        with open(chapter_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract title from first line
        lines = content.split('\n')
        title = lines[0].lstrip('#').strip() if lines else f"第 {chapter_id} 章"

        return {
            "chapter_id": chapter_id,
            "title": title,
            "content": content,
            "file": chapter_file.name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chapter {course_id}/{chapter_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
