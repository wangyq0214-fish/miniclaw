"""
Student Profile API

Provides:
- POST /api/profile/generate — Get or create student profile from JSON file
- POST /api/profile/update — Update specific fields in profile
- POST /api/profile/init — Cold-start initialization with basic info
- POST /api/profile/mistakes — Append mistake to mistakes.json
- GET /api/profile/avatar — Get current user's avatar
- POST /api/profile/avatar — Upload/update current user's avatar
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings, get_user_memory_dir, get_user_workspace_dir
from models.complete_models import LearningEvent, User
from auth.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_profile_path(user_id: int) -> Path:
    """Get the profile JSON file path for a user."""
    workspace_dir = get_user_workspace_dir(user_id)
    return workspace_dir / "profile.json"


def _create_default_profile() -> Dict[str, Any]:
    """Create a default empty profile."""
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dimensions": {
            "knowledge_foundation": {
                "score": 50,
                "concepts": [],
                "summary": "数据不足，待观察"
            },
            "cognitive_style": {
                "score": 50,
                "style": "待观察",
                "traits": []
            },
            "error_patterns": {
                "score": 50,
                "patterns": [],
                "summary": "数据不足，待观察"
            },
            "learning_rhythm": {
                "score": 50,
                "pace": "待观察",
                "traits": []
            },
            "affective_state": {
                "score": 50,
                "mood": "待观察",
                "traits": []
            },
            "goal_progress": {
                "score": 50,
                "short_term": "待设定",
                "long_term": "待设定",
                "progress": "待观察"
            }
        },
        "knowledge_graph": {
            "nodes": [],
            "edges": []
        },
        "overall_score": 50,
        "insight_text": "暂无学习数据，请先开始对话或完成测验后再来查看画像。",
        "action_item": "开始一次对话或完成一次测验，系统将自动为你生成学习画像。",
        "highlight_tags": ["暂无数据"],
        "needs_onboarding": True
    }


def _load_or_create_profile(user_id: int) -> Dict[str, Any]:
    """Load profile from JSON file, or create default if not exists."""
    profile_path = _get_profile_path(user_id)
    if profile_path.exists():
        try:
            return json.loads(profile_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to read profile.json for user {user_id}: {e}")
    return _create_default_profile()


def _save_profile(user_id: int, profile: Dict[str, Any]) -> None:
    """Save profile to JSON file."""
    profile_path = _get_profile_path(user_id)
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Request / Response Models ──

class GenerateProfileRequest(BaseModel):
    force_refresh: bool = False


class InitProfileRequest(BaseModel):
    major: str
    goal: str
    grade: Optional[str] = None


class AppendMistakeRequest(BaseModel):
    question_text: str
    topic: str
    user_answer: str
    correct_answer: str
    error_type: str = "unknown"


class UpdateProfileRequest(BaseModel):
    """Partial update request - only include fields you want to update."""
    dimensions: Optional[Dict[str, Any]] = None
    knowledge_graph: Optional[Dict[str, Any]] = None
    overall_score: Optional[float] = None
    insight_text: Optional[str] = None
    action_item: Optional[str] = None
    highlight_tags: Optional[List[str]] = None
    needs_onboarding: Optional[bool] = None


class DimensionDetail(BaseModel):
    score: float
    concepts: Optional[List[Dict[str, Any]]] = None
    summary: Optional[str] = None
    style: Optional[str] = None
    traits: Optional[List[str]] = None
    patterns: Optional[List[Dict[str, Any]]] = None
    pace: Optional[str] = None
    mood: Optional[str] = None
    short_term: Optional[str] = None
    long_term: Optional[str] = None
    progress: Optional[str] = None


class KnowledgeGraphNode(BaseModel):
    id: str
    mastery: float
    category: str = "基础"


class KnowledgeGraphEdge(BaseModel):
    source: str
    target: str
    relation: str = "相关"


class KnowledgeGraph(BaseModel):
    nodes: List[KnowledgeGraphNode] = []
    edges: List[KnowledgeGraphEdge] = []


class StudentProfile(BaseModel):
    schema_version: str = "2.0"
    generated_at: str
    dimensions: Dict[str, DimensionDetail]
    knowledge_graph: KnowledgeGraph = KnowledgeGraph()
    overall_score: float
    insight_text: str
    action_item: str
    highlight_tags: List[str]
    needs_onboarding: bool = False


# ── Profile Endpoints ──


@router.post("/profile/generate", response_model=StudentProfile)
async def generate_profile(
    request: GenerateProfileRequest = GenerateProfileRequest(),
    current_user: User = Depends(get_current_user),
):
    """
    Get or create student profile from JSON file.
    - If profile.json exists, return it
    - If not, create default profile and save
    - If force_refresh=True, auto-update profile from learning data
    """
    user_id = current_user.id

    if request.force_refresh:
        # Auto-update profile from learning data
        from services.profile_updater import update_profile_from_data
        memory_dir = get_user_memory_dir(user_id)
        workspace_dir = get_user_workspace_dir(user_id)
        profile = await update_profile_from_data(user_id, memory_dir, workspace_dir)
        return StudentProfile(**profile)

    profile = _load_or_create_profile(user_id)
    return StudentProfile(**profile)


@router.post("/profile/auto-update")
async def auto_update_profile(
    current_user: User = Depends(get_current_user),
):
    """
    Trigger profile update via subagent with learning data injected.
    """
    from api.subagent import invoke_subagent, SubAgentRequest

    user_id = current_user.id
    memory_dir = get_user_memory_dir(user_id)
    workspace_dir = get_user_workspace_dir(user_id)

    # Read learning data
    def read_json(path):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except:
                pass
        return None

    history = read_json(memory_dir / "history.json") or []
    mistakes = read_json(memory_dir / "mistakes.json") or []
    profile = read_json(workspace_dir / "profile.json") or {}

    # Read memory.md highlights
    memory_file = memory_dir / "memory.md"
    memory_text = ""
    if memory_file.exists():
        try:
            memory_text = memory_file.read_text(encoding="utf-8")[:2000]
        except:
            pass

    # Build message with all data injected
    message = f"""请根据以下学习数据更新画像，然后用 write_file 写入 workspace/profile.json。

## 对话历史（最近20条）
{json.dumps(history[-20:], ensure_ascii=False, indent=2)}

## 错题记录
{json.dumps(mistakes[-20:], ensure_ascii=False, indent=2)}

## 学习记忆
{memory_text[:1000]}

## 当前画像
{json.dumps(profile, ensure_ascii=False, indent=2)}

请分析以上数据，更新画像后写入 workspace/profile.json。"""

    request = SubAgentRequest(
        subagent="profile_generator",
        message=message,
        stream=True
    )

    return await invoke_subagent(request, current_user)


@router.post("/profile/update", response_model=StudentProfile)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Partially update student profile.
    Only provided fields will be updated, others remain unchanged.
    """
    user_id = current_user.id
    profile = _load_or_create_profile(user_id)

    # Update dimensions (merge, not replace)
    if request.dimensions is not None:
        for key, value in request.dimensions.items():
            if key in profile.get("dimensions", {}):
                profile["dimensions"][key].update(value)
            else:
                profile["dimensions"][key] = value

    # Update knowledge graph (merge nodes/edges)
    if request.knowledge_graph is not None:
        kg = profile.get("knowledge_graph", {"nodes": [], "edges": []})
        if "nodes" in request.knowledge_graph:
            existing_nodes = {n["id"]: n for n in kg.get("nodes", [])}
            for node in request.knowledge_graph["nodes"]:
                existing_nodes[node["id"]] = node
            kg["nodes"] = list(existing_nodes.values())
        if "edges" in request.knowledge_graph:
            existing_edges = kg.get("edges", [])
            existing_keys = {(e["source"], e["target"]) for e in existing_edges}
            for edge in request.knowledge_graph["edges"]:
                key = (edge["source"], edge["target"])
                if key not in existing_keys:
                    existing_edges.append(edge)
                    existing_keys.add(key)
            kg["edges"] = existing_edges
        profile["knowledge_graph"] = kg

    # Update simple fields
    if request.overall_score is not None:
        profile["overall_score"] = max(0, min(100, request.overall_score))
    if request.insight_text is not None:
        profile["insight_text"] = request.insight_text
    if request.action_item is not None:
        profile["action_item"] = request.action_item
    if request.highlight_tags is not None:
        profile["highlight_tags"] = request.highlight_tags
    if request.needs_onboarding is not None:
        profile["needs_onboarding"] = request.needs_onboarding

    # Update timestamp
    profile["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Save
    _save_profile(user_id, profile)

    return StudentProfile(**profile)


# ── Cold Start Initialization Endpoint ──

@router.post("/profile/init")
async def init_profile(
    request: InitProfileRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Initialize profile with cold-start data (major, goal, grade).
    Writes to memory/memory.md as the first entry.
    """
    user_id = current_user.id
    memory_dir = get_user_memory_dir(user_id)
    memory_dir.mkdir(parents=True, exist_ok=True)
    memory_file = memory_dir / "memory.md"

    # Build initial entry
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    entry = f"\n## {now} — 冷启动初始化\n"
    entry += f"- 专业：{request.major}\n"
    entry += f"- 学习目标：{request.goal}\n"
    if request.grade:
        entry += f"- 年级：{request.grade}\n"

    # Append to memory.md
    existing = ""
    if memory_file.exists():
        existing = memory_file.read_text(encoding="utf-8")

    content = existing + entry if existing else f"# 学习记忆\n{entry}"
    memory_file.write_text(content, encoding="utf-8")

    # Update profile with onboarding info
    profile = _load_or_create_profile(user_id)
    profile["needs_onboarding"] = False
    profile["dimensions"]["goal_progress"]["long_term"] = request.goal
    _save_profile(user_id, profile)

    return {"ok": True}


# ── Append Mistake Endpoint ──

@router.post("/profile/mistakes")
async def append_mistake(
    request: AppendMistakeRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Append a mistake record to memory/mistakes.json.
    Called by frontend when user answers a quiz question incorrectly.
    """
    user_id = current_user.id
    memory_dir = get_user_memory_dir(user_id)
    memory_dir.mkdir(parents=True, exist_ok=True)
    mistakes_file = memory_dir / "mistakes.json"

    # Read existing
    mistakes = []
    if mistakes_file.exists():
        try:
            mistakes = json.loads(mistakes_file.read_text(encoding="utf-8"))
            if not isinstance(mistakes, list):
                mistakes = []
        except (json.JSONDecodeError, Exception):
            mistakes = []

    # Build record
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question_text": request.question_text[:200],
        "topic": request.topic,
        "user_answer": request.user_answer,
        "correct_answer": request.correct_answer,
        "error_type": request.error_type,
    }

    mistakes.append(record)

    # Sliding window: keep last 100 entries
    if len(mistakes) > 100:
        mistakes = mistakes[-100:]

    mistakes_file.write_text(
        json.dumps(mistakes, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    return {"ok": True}


# ── Avatar Endpoints ──

class AvatarUploadRequest(BaseModel):
    avatar_data: str  # Base64 encoded image
    avatar_type: str  # MIME type, e.g., 'image/png'


@router.get("/profile/avatar")
async def get_avatar(
    current_user: User = Depends(get_current_user),
):
    """Get current user's avatar."""
    if not current_user.avatar_data:
        return {"avatar_data": None, "avatar_type": None}

    return {
        "avatar_data": current_user.avatar_data,
        "avatar_type": current_user.avatar_type
    }


@router.post("/profile/avatar")
async def upload_avatar(
    request: AvatarUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload/update current user's avatar."""
    # Validate base64 data
    if not request.avatar_data.startswith('data:image/'):
        # Add data URI prefix if missing
        if ',' in request.avatar_data:
            request.avatar_data = f"data:{request.avatar_type};base64,{request.avatar_data.split(',')[-1]}"

    # Update user avatar
    current_user.avatar_data = request.avatar_data
    current_user.avatar_type = request.avatar_type
    await db.commit()

    return {"ok": True, "message": "Avatar updated successfully"}


@router.delete("/profile/avatar")
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete current user's avatar."""
    current_user.avatar_data = None
    current_user.avatar_type = None
    await db.commit()

    return {"ok": True, "message": "Avatar deleted successfully"}


# ── Internal Helpers ──

def _read_memory_highlights(memory_dir: Path) -> List[str]:
    """Read and parse memory.md into a list of highlight entries."""
    memory_file = memory_dir / "memory.md"
    if not memory_file.exists():
        return []
    try:
        content = memory_file.read_text(encoding="utf-8")
        # Split by ## headings, skip the first (# title)
        sections = content.split("\n## ")
        highlights = []
        for section in sections[1:]:  # Skip title
            lines = section.strip().split("\n")
            if lines:
                highlights.append(section.strip())
        return highlights
    except Exception as e:
        logger.warning(f"Failed to read memory.md: {e}")
        return []


def _read_history(memory_dir: Path) -> List[Dict[str, Any]]:
    """Read history.json and return recent conversation records."""
    history_file = memory_dir / "history.json"
    if not history_file.exists():
        return []
    try:
        data = json.loads(history_file.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Failed to read history.json: {e}")
        return []


def _read_mistakes(memory_dir: Path) -> List[Dict[str, Any]]:
    """Read mistakes.json into structured mistake records."""
    mistakes_file = memory_dir / "mistakes.json"
    if not mistakes_file.exists():
        return []
    try:
        data = json.loads(mistakes_file.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Failed to read mistakes.json: {e}")
        return []
