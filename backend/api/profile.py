"""
Student Profile API

Provides:
- POST /api/profile/generate — Generate 6-dimension student profile from learning data
- POST /api/profile/init — Cold-start initialization with basic info
- POST /api/profile/mistakes — Append mistake to mistakes.json
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from database import get_db
from config import settings, get_user_memory_dir, get_user_workspace_dir
from models.complete_models import LearningEvent, User
from auth.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Role prompt cache
_profile_role_prompt: Optional[str] = None

PROFILE_CACHE_TTL = timedelta(hours=12)
MAX_RECENT_CONVERSATIONS = 20
MAX_MEMORY_HIGHLIGHTS = 20
MAX_MISTAKE_ENTRIES = 50  # Sliding window for mistakes.json


def _load_profile_role_prompt() -> str:
    global _profile_role_prompt
    if _profile_role_prompt is not None:
        return _profile_role_prompt
    role_file = Path(__file__).parent.parent / "workspace" / "roles" / "profile_generator.md"
    if role_file.exists():
        _profile_role_prompt = role_file.read_text(encoding="utf-8")
    else:
        _profile_role_prompt = ""
    return _profile_role_prompt


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


# ── Profile Generation Endpoint ──


async def _regenerate_profile(user_id: int, db: AsyncSession):
    """Background task: read data sources, call LLM, save cache."""
    try:
        memory_dir = get_user_memory_dir(user_id)
        workspace_dir = get_user_workspace_dir(user_id)
        cache_file = workspace_dir / "profile_cache.json"

        memory_highlights = _read_memory_highlights(memory_dir)
        recent_conversations = _read_history(memory_dir)
        mistakes = _read_mistakes(memory_dir)
        learning_stats = await _compute_learning_stats(db, user_id)

        has_data = (
            len(memory_highlights) > 0
            or len(recent_conversations) > 0
            or len(mistakes) > 0
            or learning_stats.get("total_quizzes", 0) > 0
        )
        if not has_data:
            return

        data_slice = {
            "memory_highlights": memory_highlights[:MAX_MEMORY_HIGHLIGHTS],
            "recent_conversations": recent_conversations[:MAX_RECENT_CONVERSATIONS],
            "mistakes": mistakes[:20],
            "learning_stats": learning_stats,
        }

        mastery_file = memory_dir / "mastery.json"
        if mastery_file.exists():
            try:
                existing_mastery = json.loads(mastery_file.read_text(encoding="utf-8"))
                data_slice["existing_graph"] = existing_mastery
            except (json.JSONDecodeError, Exception):
                pass

        profile_json = await _generate_via_llm(data_slice)
        if profile_json is None:
            logger.warning(f"Background profile generation failed for user {user_id}")
            return

        profile = _build_profile(profile_json)

        # Save cache
        try:
            cache_data = profile.model_dump()
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(cache_data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to cache profile: {e}")

        # Save mastery.json
        try:
            mastery_data = {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "nodes": [n.model_dump() for n in profile.knowledge_graph.nodes],
                "edges": [e.model_dump() for e in profile.knowledge_graph.edges],
            }
            mastery_file.write_text(json.dumps(mastery_data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to save mastery.json: {e}")

        logger.info(f"Background profile regeneration completed for user {user_id}")
    except Exception as e:
        logger.error(f"Background profile regeneration error for user {user_id}: {e}")


@router.post("/profile/generate", response_model=StudentProfile)
async def generate_profile(
    request: GenerateProfileRequest = GenerateProfileRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a 6-dimension student profile from learning data sources.

    Strategy:
    - Cache fresh → return immediately
    - Cache stale → return stale + trigger async regeneration
    - No cache (cold start) → generate synchronously
    - force_refresh → regenerate synchronously
    """
    user_id = current_user.id
    memory_dir = get_user_memory_dir(user_id)
    workspace_dir = get_user_workspace_dir(user_id)
    cache_file = workspace_dir / "profile_cache.json"

    # Check cache
    if not request.force_refresh and cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            cached_time = datetime.fromisoformat(cached.get("generated_at", ""))
            age = datetime.now(timezone.utc) - cached_time

            if age < PROFILE_CACHE_TTL:
                # Cache is fresh, return directly
                return StudentProfile(**cached)

            # Cache is stale — return stale data and regenerate in background
            logger.info(f"Profile cache stale (age={age}), triggering background refresh for user {user_id}")
            asyncio.create_task(_regenerate_profile(user_id, db))
            return StudentProfile(**cached)
        except (json.JSONDecodeError, ValueError):
            pass  # Cache invalid, fall through to synchronous generation

    # No cache exists (cold start) or force_refresh — generate synchronously
    memory_highlights = _read_memory_highlights(memory_dir)
    recent_conversations = _read_history(memory_dir)
    mistakes = _read_mistakes(memory_dir)
    learning_stats = await _compute_learning_stats(db, user_id)

    has_data = (
        len(memory_highlights) > 0
        or len(recent_conversations) > 0
        or len(mistakes) > 0
        or learning_stats.get("total_quizzes", 0) > 0
    )

    if not has_data:
        return StudentProfile(
            generated_at=datetime.now(timezone.utc).isoformat(),
            dimensions=_empty_dimensions(),
            overall_score=0,
            insight_text="暂无学习数据，请先开始对话或完成测验后再来查看画像。",
            action_item="开始一次对话或完成一次测验，系统将自动为你生成学习画像。",
            highlight_tags=["暂无数据"],
            needs_onboarding=True,
        )

    data_slice = {
        "memory_highlights": memory_highlights[:MAX_MEMORY_HIGHLIGHTS],
        "recent_conversations": recent_conversations[:MAX_RECENT_CONVERSATIONS],
        "mistakes": mistakes[:20],
        "learning_stats": learning_stats,
    }

    mastery_file = memory_dir / "mastery.json"
    if mastery_file.exists():
        try:
            existing_mastery = json.loads(mastery_file.read_text(encoding="utf-8"))
            data_slice["existing_graph"] = existing_mastery
        except (json.JSONDecodeError, Exception):
            pass

    profile_json = await _generate_via_llm(data_slice)

    if profile_json is None:
        # LLM failed — try returning stale cache if available
        if cache_file.exists():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                return StudentProfile(**cached)
            except (json.JSONDecodeError, ValueError):
                pass
        return StudentProfile(
            generated_at=datetime.now(timezone.utc).isoformat(),
            dimensions=_empty_dimensions(),
            overall_score=0,
            insight_text="画像生成暂时不可用，请稍后再试。",
            action_item="请稍后重试",
            highlight_tags=["生成失败"],
        )

    profile = _build_profile(profile_json)

    # Save cache
    try:
        cache_data = profile.model_dump()
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(cache_data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to cache profile: {e}")

    # Save mastery.json
    try:
        mastery_file = memory_dir / "mastery.json"
        mastery_data = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "nodes": [n.model_dump() for n in profile.knowledge_graph.nodes],
            "edges": [e.model_dump() for e in profile.knowledge_graph.edges],
        }
        mastery_file.write_text(json.dumps(mastery_data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to save mastery.json: {e}")

    return profile


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

    # Invalidate cache
    cache_file = get_user_workspace_dir(user_id) / "profile_cache.json"
    if cache_file.exists():
        cache_file.unlink()

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

    # Sliding window: keep last MAX_MISTAKE_ENTRIES
    if len(mistakes) > MAX_MISTAKE_ENTRIES:
        mistakes = mistakes[-MAX_MISTAKE_ENTRIES:]

    mistakes_file.write_text(
        json.dumps(mistakes, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    return {"ok": True}


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


async def _compute_learning_stats(db: AsyncSession, user_id: int) -> Dict[str, Any]:
    """Compute learning statistics from LearningEvent table."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        result = await db.execute(
            select(LearningEvent).where(
                and_(
                    LearningEvent.user_id == user_id,
                    LearningEvent.created_at >= cutoff,
                )
            )
        )
        events = result.scalars().all()

        quiz_count = 0
        total_score = 0
        topics = set()
        days = set()

        for e in events:
            data = e.event_data or {}
            if e.event_type == "quiz_complete":
                quiz_count += 1
                if data.get("total", 0) > 0:
                    total_score += data.get("score", 0) / data["total"] * 100
                if data.get("topic"):
                    topics.add(data["topic"])
            elif e.event_type == "flashcard_review":
                if data.get("category"):
                    topics.add(data["category"])
            if e.created_at:
                days.add(e.created_at.strftime("%Y-%m-%d"))

        return {
            "total_quizzes": quiz_count,
            "avg_score": round(total_score / quiz_count, 1) if quiz_count > 0 else 0,
            "topics_covered": list(topics)[:20],
            "study_days": len(days),
        }
    except Exception as e:
        logger.warning(f"Failed to compute learning stats: {e}")
        return {"total_quizzes": 0, "avg_score": 0, "topics_covered": [], "study_days": 0}


async def _generate_via_llm(data_slice: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Generate student profile JSON via LLM."""
    role_prompt = _load_profile_role_prompt()
    if not role_prompt:
        logger.error("Profile generator role prompt not found")
        return None

    model = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base,
        temperature=0.3,
        max_tokens=2000,
    )

    user_message = json.dumps(data_slice, ensure_ascii=False, indent=2)
    messages = [
        SystemMessage(content=role_prompt),
        HumanMessage(content=user_message),
    ]

    # Retry up to 2 times on failure
    for attempt in range(3):
        try:
            response = await model.ainvoke(messages)
            content = response.content.strip()

            if not content:
                logger.warning(f"Empty LLM response (attempt {attempt + 1})")
                continue

            # Debug: log raw response (first 1000 chars)
            logger.debug(f"LLM response (attempt {attempt + 1}): {content[:1000]}...")

            # Try to extract JSON from markdown code blocks first
            if "```" in content:
                parts = content.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if not part.startswith('{'):
                        continue
                    fixed = _fix_json_string(part)
                    try:
                        result = json.loads(fixed)
                        logger.info(f"Successfully parsed JSON from code block (attempt {attempt + 1})")
                        return result
                    except json.JSONDecodeError:
                        continue

            # Try to parse the entire content as JSON
            try:
                result = json.loads(content)
                logger.info(f"Successfully parsed JSON from full content (attempt {attempt + 1})")
                return result
            except json.JSONDecodeError:
                pass

            # Try to find JSON object in the content
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1 and end > start:
                json_str = content[start:end + 1]
                # Fix common LLM JSON issues
                json_str = _fix_json_string(json_str)
                try:
                    result = json.loads(json_str)
                    logger.info(f"Successfully parsed JSON after fixes (attempt {attempt + 1})")
                    return result
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse extracted JSON (attempt {attempt + 1}): {e}")
                    logger.debug(f"Extracted JSON: {json_str[:500]}...")

            logger.warning(f"No valid JSON found in LLM response (attempt {attempt + 1})")

        except Exception as e:
            logger.warning(f"LLM call failed (attempt {attempt + 1}): {e}")

    logger.error("LLM profile generation failed after 3 attempts")
    return None


def _fix_json_string(s: str) -> str:
    """Fix common JSON formatting issues from LLM output."""
    # Remove single-line comments (// ...)
    s = re.sub(r'//[^\n]*', '', s)

    # Remove trailing commas before } or ]
    s = re.sub(r',\s*([}\]])', r'\1', s)

    # Fix single quotes to double quotes (but not within strings)
    # This is a simplified approach - works for most cases
    s = s.replace("'", '"')

    # Fix common issues with boolean/null values
    s = s.replace(': True', ': true').replace(': False', ': false').replace(': None', ': null')

    # Fix Python-style True/False/None in values
    s = re.sub(r'\bTrue\b', 'true', s)
    s = re.sub(r'\bFalse\b', 'false', s)
    s = re.sub(r'\bNone\b', 'null', s)

    # Fix missing commas between JSON elements
    # Pattern: ] or } or " followed by [ or { or " on same/next line (missing comma)
    s = re.sub(r'(\]|\}|"[^"]*")\s*(\[[\s\n])', r'\1,\2', s)
    s = re.sub(r'(\]|\}|"[^"]*")\s*(\{)', r'\1,\2', s)
    # Missing comma between string value and next key: "value" "key": → "value", "key":
    s = re.sub(r'("[^"]*")\s+("(?:[^"]*)"\s*:)', r'\1, \2', s)
    # Missing comma between number and next key/element
    s = re.sub(r'(\d+(?:\.\d+)?)\s+("(?:[^"]*)"\s*:)', r'\1, \2', s)
    # Missing comma between true/false/null and next element
    s = re.sub(r'\b(true|false|null)\s+(\[|\{|")', r'\1, \2', s)
    # Missing comma between ] or } and number
    s = re.sub(r'(\]|\})\s+(\d)', r'\1, \2', s)

    # Remove trailing text after the last }
    last_brace = s.rfind('}')
    if last_brace != -1 and last_brace < len(s) - 1:
        # Check if there's significant text after the last }
        trailing = s[last_brace + 1:].strip()
        if trailing and not trailing.startswith(','):
            s = s[:last_brace + 1]

    return s


def _build_profile(profile_json: Dict[str, Any]) -> StudentProfile:
    """Build StudentProfile from LLM output with validation."""
    dimensions = {}
    dim_keys = [
        "knowledge_foundation", "cognitive_style", "error_patterns",
        "learning_rhythm", "affective_state", "goal_progress"
    ]

    for key in dim_keys:
        dim_data = profile_json.get("dimensions", {}).get(key, {})
        # Ensure score is in range
        score = dim_data.get("score", 50)
        score = max(0, min(100, score))
        dim_data["score"] = score
        dimensions[key] = DimensionDetail(**dim_data)

    # Build knowledge graph
    kg_data = profile_json.get("knowledge_graph", {})
    knowledge_graph = KnowledgeGraph(
        nodes=[KnowledgeGraphNode(**n) for n in kg_data.get("nodes", [])],
        edges=[KnowledgeGraphEdge(**e) for e in kg_data.get("edges", [])],
    )

    # Validate overall_score
    overall = profile_json.get("overall_score", 50)
    overall = max(0, min(100, overall))

    return StudentProfile(
        generated_at=datetime.now(timezone.utc).isoformat(),
        dimensions=dimensions,
        knowledge_graph=knowledge_graph,
        overall_score=overall,
        insight_text=profile_json.get("insight_text", ""),
        action_item=profile_json.get("action_item", ""),
        highlight_tags=profile_json.get("highlight_tags", []),
    )


def _empty_dimensions() -> Dict[str, DimensionDetail]:
    """Return empty dimensions for cold start."""
    return {
        "knowledge_foundation": DimensionDetail(score=0, concepts=[], summary="暂无数据"),
        "cognitive_style": DimensionDetail(score=0, style="待观察", traits=[]),
        "error_patterns": DimensionDetail(score=0, patterns=[], summary="暂无数据"),
        "learning_rhythm": DimensionDetail(score=0, pace="待观察", traits=[]),
        "affective_state": DimensionDetail(score=0, mood="待观察", traits=[]),
        "goal_progress": DimensionDetail(score=0, short_term="", long_term="", progress="暂无数据"),
    }
