"""
Files API - File management endpoints

Features:
- Read/write files in allowed directories
- Per-user path isolation
- Memory index rebuild on MEMORY.md save
- Skills listing
"""
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import (
    get_project_root,
    get_user_memory_dir,
    get_user_workspace_dir,
    get_skills_dir,
    get_workspace_dir,
    get_knowledge_dir,
)
from auth.security import get_current_user
from models.complete_models import User

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


def resolve_path(relative_path: str, user_id: int) -> Path:
    """Resolve a relative path to an absolute path with user isolation."""
    # Handle different path formats
    if relative_path.startswith("./"):
        relative_path = relative_path[2:]
    elif relative_path.startswith("/"):
        relative_path = relative_path[1:]

    # Normalize path separators
    relative_path = relative_path.replace("\\", "/")

    # Map virtual paths to physical paths
    if relative_path.startswith("workspace/") or relative_path == "workspace":
        # User-specific workspace
        base = get_user_workspace_dir(user_id)
        sub_path = relative_path[10:] if len(relative_path) > 10 else ""
        return base / sub_path if sub_path else base

    elif relative_path.startswith("memory/") or relative_path == "memory":
        # User-specific memory
        base = get_user_memory_dir(user_id)
        sub_path = relative_path[7:] if len(relative_path) > 7 else ""
        return base / sub_path if sub_path else base

    elif relative_path.startswith("knowledge/source/") or relative_path == "knowledge/source":
        # Shared knowledge source
        base = get_knowledge_dir() / "source"
        sub_path = relative_path[17:] if len(relative_path) > 17 else ""
        return base / sub_path if sub_path else base

    elif relative_path.startswith("knowledge/"):
        # Other knowledge paths (shared)
        base = get_knowledge_dir()
        sub_path = relative_path[10:] if len(relative_path) > 10 else ""
        return base / sub_path if sub_path else base

    elif relative_path.startswith("skills/"):
        # Shared skills (read-only)
        base = get_skills_dir()
        sub_path = relative_path[7:] if len(relative_path) > 7 else ""
        return base / sub_path if sub_path else base

    else:
        # Fallback to project root (legacy)
        return get_project_root() / relative_path


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
async def read_file(
    path: str = Query(..., description="Relative path to the file"),
    current_user: User = Depends(get_current_user)
):
    """Read a file from the project directory."""
    file_path = resolve_path(path, current_user.id)

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


@router.get("/files/download")
async def download_file(
    path: str = Query(..., description="Relative path to the file"),
    current_user: User = Depends(get_current_user)
):
    """Download a file from the project directory."""
    file_path = resolve_path(path, current_user.id)

    valid, reason = validate_path(file_path, path)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/octet-stream",
    )


@router.get("/files/pptx")
async def read_pptx(
    path: str = Query(..., description="Relative path to the PPTX file"),
    current_user: User = Depends(get_current_user)
):
    """Read a PPTX file and return slide data for browser rendering."""
    file_path = resolve_path(path, current_user.id)

    valid, reason = validate_path(file_path, path)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if not file_path.suffix.lower() in ('.pptx', '.ppt'):
        raise HTTPException(status_code=400, detail="Not a PPT file")

    try:
        from pptx import Presentation
        from pptx.util import Emu
        from pptx.enum.shapes import MSO_SHAPE_TYPE
        from pptx.dml.color import RGBColor
        import base64
        import io

        def _safe_color(color_obj) -> str | None:
            """Safely extract hex color from a color object."""
            try:
                if color_obj and color_obj.type is not None:
                    return f"#{color_obj.rgb}"
            except Exception:
                pass
            return None

        def _extract_fill(fill) -> dict | None:
            """Extract fill info from a shape's fill object."""
            try:
                if fill.type is not None:
                    from pptx.enum.dml import MSO_FILL_TYPE
                    if fill.type == MSO_FILL_TYPE.SOLID:
                        c = _safe_color(fill.fore_color)
                        if c:
                            return {"type": "solid", "color": c}
                    elif fill.type == MSO_FILL_TYPE.GRADIENT:
                        colors = []
                        for stop in fill.gradient_stops:
                            c = _safe_color(stop.color)
                            if c:
                                colors.append(c)
                        if colors:
                            return {"type": "gradient", "colors": colors}
            except Exception:
                pass
            return None

        def _extract_line(line) -> dict | None:
            """Extract border/outline info."""
            try:
                if line.fill.type is not None:
                    c = _safe_color(line.color)
                    w = int(line.width) if line.width else None
                    return {"color": c, "width": w}
            except Exception:
                pass
            return None

        def _extract_image(shape) -> str | None:
            """Extract embedded image as base64 data URI."""
            try:
                if hasattr(shape, "image") and shape.image:
                    blob = shape.image.blob
                    content_type = shape.image.content_type or "image/png"
                    b64 = base64.b64encode(blob).decode("ascii")
                    return f"data:{content_type};base64,{b64}"
            except Exception:
                pass
            return None

        prs = Presentation(str(file_path))
        slide_w = prs.slide_width
        slide_h = prs.slide_height

        slides = []
        for idx, slide in enumerate(prs.slides):
            # Extract slide background
            bg = None
            try:
                bg_fill = slide.background.fill
                if bg_fill.type is not None:
                    bg = _extract_fill(bg_fill)
            except Exception:
                pass

            shapes = []
            for shape in slide.shapes:
                s = {
                    "left": shape.left,
                    "top": shape.top,
                    "width": shape.width,
                    "height": shape.height,
                    "type": str(shape.shape_type),
                }

                # Shape fill (background color of the shape)
                try:
                    if hasattr(shape, "fill"):
                        fill_info = _extract_fill(shape.fill)
                        if fill_info:
                            s["fill"] = fill_info
                except Exception:
                    pass

                # Shape outline/border
                try:
                    if hasattr(shape, "line"):
                        line_info = _extract_line(shape.line)
                        if line_info:
                            s["line"] = line_info
                except Exception:
                    pass

                # Image
                img_data = _extract_image(shape)
                if img_data:
                    s["imageSrc"] = img_data

                # Text
                if shape.has_text_frame:
                    paragraphs = []
                    for para in shape.text_frame.paragraphs:
                        runs = []
                        for run in para.runs:
                            r = {"text": run.text}
                            if run.font.size:
                                r["size"] = run.font.size.pt
                            if run.font.bold:
                                r["bold"] = True
                            if run.font.italic:
                                r["italic"] = True
                            if run.font.underline:
                                r["underline"] = True
                            c = _safe_color(run.font.color)
                            if c:
                                r["color"] = c
                            if run.font.name:
                                r["font"] = run.font.name
                            runs.append(r)
                        paragraphs.append({
                            "runs": runs,
                            "alignment": str(para.alignment) if para.alignment else None,
                        })
                    s["paragraphs"] = paragraphs
                    s["text"] = shape.text_frame.text

                shapes.append(s)

            # Extract notes
            notes_text = ""
            if slide.has_notes_slide:
                notes_frame = slide.notes_slide.notes_text_frame
                if notes_frame:
                    notes_text = notes_frame.text

            slides.append({
                "index": idx,
                "background": bg,
                "shapes": shapes,
                "notes": notes_text,
            })

        return {
            "slideWidth": slide_w,
            "slideHeight": slide_h,
            "slides": slides,
        }
    except Exception as e:
        logger.error(f"Error reading PPTX {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files")
async def write_file(
    request: FileWriteRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Write content to a file in the project directory.

    Triggers memory index rebuild if writing to MEMORY.md.
    """
    file_path = resolve_path(request.path, current_user.id)

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
        if name.startswith(".") or name.startswith("~$") or name in ["readme.md", "claude.md"]:
            return False
        # Exclude .py scripts in presentations (auto-deleted after execution, but skip if still present)
        if rel.startswith("workspace/generated/presentations/") and name.endswith(".py"):
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
    elif any(kw in name for kw in ["ppt", "演示", "presentation"]):
        return "PPT"

    return "其他资源"


@router.delete("/files")
async def delete_file(
    path: str = Query(..., description="Relative path to the file or directory"),
    current_user: User = Depends(get_current_user)
):
    """Delete a file or directory in the project directory."""
    import shutil

    file_path = resolve_path(path, current_user.id)

    valid, reason = validate_path(file_path, path)
    if not valid:
        raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File or directory not found")

    try:
        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()

        return {"success": True, "path": path, "message": "Deleted successfully"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        logger.error(f"Error deleting {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/list", response_model=FileListResponse)
async def list_files(
    directory: str = Query("", description="Relative path to the directory"),
    recursive: bool = Query(False, description="Recursively list files in subdirectories"),
    current_user: User = Depends(get_current_user)
):
    """List files in a directory, with filtering for resource library."""
    dir_path = resolve_path(directory, current_user.id)

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

        # Non-recursive: only list direct children (show directory structure)
        for item in dir_path.iterdir():
            # Calculate relative path based on the virtual path prefix
            if directory.startswith("workspace"):
                base = get_user_workspace_dir(current_user.id)
                relative = item.relative_to(base)
                rel_str = f"workspace/{relative}".replace("\\", "/")
            elif directory.startswith("memory"):
                base = get_user_memory_dir(current_user.id)
                relative = item.relative_to(base)
                rel_str = f"memory/{relative}".replace("\\", "/")
            elif directory.startswith("knowledge/source"):
                base = get_knowledge_dir() / "source"
                relative = item.relative_to(base)
                rel_str = f"knowledge/source/{relative}".replace("\\", "/")
            elif directory.startswith("knowledge"):
                base = get_knowledge_dir()
                relative = item.relative_to(base)
                rel_str = f"knowledge/{relative}".replace("\\", "/")
            else:
                relative = item.relative_to(get_project_root())
                rel_str = str(relative).replace("\\", "/")

            # For files, apply filtering
            if item.is_file():
                if directory.startswith("workspace") or directory in ["memory", "knowledge/source"] or directory.startswith("knowledge/source/"):
                    if not should_include_resource(item, rel_str):
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
