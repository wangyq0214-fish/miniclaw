"""
Files API - File management endpoints

Features:
- Read/write files in allowed directories
- Path whitelist security
- Memory index rebuild on MEMORY.md save
- Skills listing
"""
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import get_project_root

logger = logging.getLogger(__name__)

router = APIRouter()


class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileReadResponse(BaseModel):
    content: str
    path: str
    exists: bool


class FileListResponse(BaseModel):
    files: list
    directory: str


class SkillInfo(BaseModel):
    name: str
    description: str
    location: str


class SkillsListResponse(BaseModel):
    skills: List[SkillInfo]


# Allowed directory prefixes (relative to project root)
ALLOWED_PREFIXES = [
    "workspace/",
    "memory/",
    "skills/",
    "knowledge/",
    "knowledge/source/",
]

# Blocked sensitive files
BLOCKED_FILES = [
    ".env",
    ".env.local",
    ".env.production",
    "credentials.json",
    "secrets.json",
]


def resolve_path(relative_path: str) -> Path:
    """Resolve a relative path to an absolute path within project root."""
    project_root = get_project_root()

    # Handle different path formats
    if relative_path.startswith("./"):
        relative_path = relative_path[2:]
    elif relative_path.startswith("/"):
        relative_path = relative_path[1:]

    return project_root / relative_path


def validate_path(path: Path, relative_path: str) -> tuple:
    """
    Validate that the path is allowed.

    Returns:
        (valid: bool, reason: str)
    """
    try:
        project_root = get_project_root().resolve()
        resolved = path.resolve()

        # Check path traversal
        if not str(resolved).startswith(str(project_root)):
            return False, "Path outside project root"

        # Normalize relative path
        rel = relative_path.replace("\\", "/")
        if rel.startswith("./"):
            rel = rel[2:]

        # Check blocked files
        filename = Path(rel).name
        if filename in BLOCKED_FILES:
            return False, f"Access to '{filename}' is blocked"

        # Check allowed prefixes
        is_allowed = any(rel.startswith(prefix) for prefix in ALLOWED_PREFIXES)
        if not is_allowed:
            return False, f"Path must be in: {', '.join(ALLOWED_PREFIXES)}"

        return True, "OK"

    except Exception as e:
        return False, str(e)


@router.get("/files", response_model=FileReadResponse)
async def read_file(path: str = Query(..., description="Relative path to the file")):
    """Read a file from the project directory."""
    file_path = resolve_path(path)

    valid, reason = validate_path(file_path, path)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    if not file_path.exists():
        return FileReadResponse(
            content="",
            path=path,
            exists=False
        )

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        return FileReadResponse(
            content=content,
            path=path,
            exists=True
        )
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not a text file")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        logger.error(f"Error reading file {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files")
async def write_file(request: FileWriteRequest):
    """
    Write content to a file in the project directory.

    Triggers memory index rebuild if writing to MEMORY.md.
    """
    file_path = resolve_path(request.path)

    valid, reason = validate_path(file_path, request.path)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    try:
        # Create parent directories if needed
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)

        # Check if this is MEMORY.md - trigger index rebuild
        normalized_path = request.path.replace("\\", "/")
        if normalized_path.endswith("memory/MEMORY.md") or normalized_path == "MEMORY.md":
            try:
                from graph.memory_indexer import memory_indexer
                memory_indexer.rebuild_index()
                logger.info("Memory index rebuilt after MEMORY.md save")
            except Exception as e:
                logger.error(f"Error rebuilding memory index: {str(e)}")

        return {
            "success": True,
            "path": request.path,
            "message": "File saved successfully"
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        logger.error(f"Error writing file {request.path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def should_include_resource(path: Path, relative_path: str) -> bool:
    """Check if a resource should be included in the resource library."""
    name = path.name.lower()
    rel = str(relative_path).replace("\\", "/").lower()

    # Always include user.md and memory.md from memory folder
    if rel.startswith("memory/") and name in ["user.md", "memory.md"]:
        return True

    # Include agent-generated resources from workspace
    if rel.startswith("workspace/"):
        # Exclude system/config files
        if name.startswith(".") or name in ["readme.md", "claude.md"]:
            return False
        return True

    # Include knowledge source files (only .md files, exclude images)
    if rel.startswith("knowledge/source/"):
        if name.startswith("."):
            return False
        # Only include markdown files
        if path.suffix.lower() in ['.md', '.markdown']:
            return True
        return False

    return False


def categorize_resource(relative_path: str) -> Optional[str]:
    """Categorize a resource file based on its name or path."""
    name = Path(relative_path).name.lower()
    rel = str(relative_path).replace("\\", "/").lower()

    # Memory files
    if name in ["user.md", "memory.md"]:
        return "记忆"

    # Knowledge source files
    if rel.startswith("knowledge/source/"):
        return "知识库"

    # Categorize by keywords in filename
    if any(kw in name for kw in ["lecture", "课程", "讲义"]):
        return "课程讲义"
    elif any(kw in name for kw in ["exercise", "练习", "习题"]):
        return "练习题"
    elif any(kw in name for kw in ["mindmap", "思维导图", "导图"]):
        return "思维导图"
    elif any(kw in name for kw in ["reading", "阅读", "书单"]):
        return "阅读材料"
    elif any(kw in name for kw in ["script", "脚本", "视频"]):
        return "视频脚本"
    elif any(kw in name for kw in ["case", "案例"]):
        return "代码案例"

    return "其他资源"


@router.get("/files/list", response_model=FileListResponse)
async def list_files(directory: str = Query("", description="Relative path to the directory")):
    """List files in a directory, with filtering for resource library."""
    dir_path = resolve_path(directory)

    try:
        project_root = get_project_root().resolve()
        resolved = dir_path.resolve()

        if not str(resolved).startswith(str(project_root)):
            raise HTTPException(status_code=403, detail="Access denied: path outside project root")
    except Exception:
        raise HTTPException(status_code=403, detail="Access denied")

    if not dir_path.exists():
        raise HTTPException(status_code=404, detail="Directory not found")

    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    try:
        files = []
        for item in dir_path.iterdir():
            relative = item.relative_to(get_project_root())
            rel_str = str(relative).replace("\\", "/")

            # Filter resources for workspace, memory, and knowledge/source directories
            if directory in ["workspace", "memory", "knowledge/source"]:
                if not should_include_resource(item, relative):
                    continue

            file_info = {
                "name": item.name,
                "path": rel_str,
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else 0
            }

            # Add category for files
            if item.is_file():
                category = categorize_resource(rel_str)
                if category:
                    file_info["category"] = category

            files.append(file_info)

        return FileListResponse(
            files=files,
            directory=directory
        )
    except Exception as e:
        logger.error(f"Error listing directory {directory}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills", response_model=SkillsListResponse)
async def list_skills():
    """
    List all available skills.

    Scans the skills directory for SKILL.md files with frontmatter.
    """
    from skills import create_skills_manager

    try:
        manager = create_skills_manager()

        skills = [
            SkillInfo(
                name=skill.name,
                description=skill.description,
                location=skill.location
            )
            for skill in manager.skills
        ]

        return SkillsListResponse(skills=skills)

    except Exception as e:
        logger.error(f"Error listing skills: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
