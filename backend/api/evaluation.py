"""
Learning Effectiveness Evaluation & Ability Analysis API

Provides:
- Event logging (fire-and-forget from frontend)
- Dashboard data with AI-powered multi-dimensional analysis
- Historical evaluation reports
"""
import json
import logging
from datetime import datetime, timedelta, date, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sql_func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from database import get_db
from config import settings
from models.complete_models import LearningEvent, EvaluationReport, User
from auth.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Role prompt cache
_role_prompt: Optional[str] = None


def _load_role_prompt() -> str:
    global _role_prompt
    if _role_prompt is not None:
        return _role_prompt
    from pathlib import Path
    role_file = Path(__file__).parent.parent / "workspace" / "roles" / "evaluation_analyst.md"
    if role_file.exists():
        _role_prompt = role_file.read_text(encoding="utf-8")
    else:
        _role_prompt = ""
    return _role_prompt


# ── Request / Response Models ──

class LogEventRequest(BaseModel):
    event_type: str
    event_data: Dict[str, Any]
    session_id: Optional[str] = None


class LogEventsBatchRequest(BaseModel):
    events: List[LogEventRequest]


class RadarScores(BaseModel):
    memory: float = 0.0
    logic: float = 0.0
    application: float = 0.0
    innovation: float = 0.0
    breadth: float = 0.0


class TrendPoint(BaseModel):
    date: str
    score: float


class DashboardResponse(BaseModel):
    radar_scores: RadarScores
    trend_scores: List[TrendPoint]
    summary_score: float
    effective_hours: float
    mastered_points: int
    insight_text: str
    highlight_tags: List[str]
    action_item: str
    report_date: str
    cached: bool = False


class HistoryResponse(BaseModel):
    reports: List[Dict[str, Any]]


# ── Event Logging Endpoints ──

@router.post("/evaluation/log-event")
async def log_event(
    request: LogEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a single learning event (fire-and-forget)."""
    event = LearningEvent(
        user_id=current_user.id,
        event_type=request.event_type,
        event_data=request.event_data,
        session_id=request.session_id,
    )
    db.add(event)
    return {"ok": True}


@router.post("/evaluation/log-events")
async def log_events_batch(
    request: LogEventsBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a batch of learning events."""
    for item in request.events:
        event = LearningEvent(
            user_id=current_user.id,
            event_type=item.event_type,
            event_data=item.event_data,
            session_id=item.session_id,
        )
        db.add(event)
    return {"ok": True, "count": len(request.events)}


# ── Dashboard Endpoint ──

@router.get("/evaluation/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    days: int = Query(7, ge=1, le=90),
    force_refresh: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get dashboard data. Returns cached report if fresh (< 1 hour),
    otherwise triggers AI analysis and caches the result.
    """
    today = date.today()

    # Check for cached report
    if not force_refresh:
        cached = await _get_cached_report(db, current_user.id, today)
        if cached:
            return _report_to_response(cached, cached=True)

    # Fetch learning events for the period
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(LearningEvent).where(
            and_(
                LearningEvent.user_id == current_user.id,
                LearningEvent.created_at >= cutoff,
            )
        ).order_by(LearningEvent.created_at.asc())
    )
    events = result.scalars().all()

    # Compute objective stats
    event_dicts = [
        {
            "event_type": e.event_type,
            "event_data": e.event_data,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]

    effective_hours = _compute_effective_hours(event_dicts)
    mastered_points = _compute_mastered_points(event_dicts)
    trend_scores = _compute_trend_scores(event_dicts, days)

    # Compute dimension scores (Layer 2 - deterministic)
    radar = _compute_dimension_scores(event_dicts)

    # Generate AI insight (Layer 3 - LLM)
    insight_text, highlight_tags, action_item = await _generate_ai_insight(
        event_dicts, radar, trend_scores, effective_hours, mastered_points
    )

    # Compute summary score (weighted average of radar)
    summary_score = round(
        radar["memory"] * 0.2
        + radar["logic"] * 0.25
        + radar["application"] * 0.25
        + radar["innovation"] * 0.15
        + radar["breadth"] * 0.15,
        1,
    )

    # Cache the report
    report = EvaluationReport(
        user_id=current_user.id,
        report_date=today,
        period_days=days,
        radar_scores=radar,
        trend_scores=trend_scores,
        summary_score=summary_score,
        effective_hours=effective_hours,
        mastered_points=mastered_points,
        insight_text=insight_text,
        highlight_tags=highlight_tags,
        action_item=action_item,
        raw_input={"event_count": len(event_dicts), "days": days},
    )

    # Upsert: delete existing for today, then insert
    existing = await _get_cached_report(db, current_user.id, today)
    if existing:
        await db.delete(existing)
    db.add(report)

    return _report_to_response(report, cached=False)


@router.get("/evaluation/history", response_model=HistoryResponse)
async def get_history(
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get historical evaluation reports."""
    result = await db.execute(
        select(EvaluationReport)
        .where(EvaluationReport.user_id == current_user.id)
        .order_by(EvaluationReport.report_date.desc())
        .limit(limit)
    )
    reports = result.scalars().all()

    return HistoryResponse(
        reports=[
            {
                "report_date": r.report_date.isoformat(),
                "summary_score": r.summary_score,
                "radar_scores": r.radar_scores,
                "effective_hours": r.effective_hours,
                "mastered_points": r.mastered_points,
                "insight_text": r.insight_text,
                "highlight_tags": r.highlight_tags,
                "action_item": r.action_item,
            }
            for r in reports
        ]
    )


# ── Internal Helpers ──

async def _get_cached_report(
    db: AsyncSession, user_id: int, report_date: date
) -> Optional[EvaluationReport]:
    """Get cached evaluation report if it exists and is fresh (< 1 hour old)."""
    result = await db.execute(
        select(EvaluationReport).where(
            and_(
                EvaluationReport.user_id == user_id,
                EvaluationReport.report_date == report_date,
            )
        )
    )
    report = result.scalar_one_or_none()
    if report and report.created_at:
        age = datetime.now(timezone.utc) - report.created_at
        if age < timedelta(hours=1):
            return report
    return report  # Return even if stale so we can delete it


def _report_to_response(report: EvaluationReport, cached: bool) -> DashboardResponse:
    return DashboardResponse(
        radar_scores=RadarScores(**(report.radar_scores or {})),
        trend_scores=[TrendPoint(**t) for t in (report.trend_scores or [])],
        summary_score=report.summary_score or 0.0,
        effective_hours=report.effective_hours or 0.0,
        mastered_points=report.mastered_points or 0,
        insight_text=report.insight_text or "",
        highlight_tags=report.highlight_tags or [],
        action_item=report.action_item or "",
        report_date=report.report_date.isoformat() if report.report_date else date.today().isoformat(),
        cached=cached,
    )


def _compute_effective_hours(events: List[dict]) -> float:
    """Estimate effective learning hours from events."""
    total_seconds = 0
    for e in events:
        data = e.get("event_data", {})
        if e["event_type"] in ("quiz_complete", "flashcard_review"):
            total_seconds += data.get("duration", 60)  # default 60s per activity
        elif e["event_type"] == "chat_message":
            total_seconds += 30  # ~30s per message exchange
        elif e["event_type"] == "page_visit":
            total_seconds += data.get("duration", 10)
    return round(total_seconds / 3600, 1)


def _compute_mastered_points(events: List[dict]) -> int:
    """Count unique mastered knowledge points."""
    mastered = set()
    for e in events:
        data = e.get("event_data", {})
        if e["event_type"] == "quiz_answer" and data.get("is_correct"):
            mastered.add(data.get("topic", "unknown"))
        elif e["event_type"] == "flashcard_review" and data.get("mastered"):
            mastered.add(data.get("category", data.get("card_id", "unknown")))
    return len(mastered)


def _compute_trend_scores(events: List[dict], days: int) -> List[dict]:
    """Compute daily composite scores for the trend chart."""
    # Group quiz events by date
    daily_scores: Dict[str, List[float]] = {}
    for e in events:
        if e["event_type"] == "quiz_complete":
            data = e.get("event_data", {})
            created = e.get("created_at", "")
            day = created[:10] if created else ""
            score = data.get("score", 0)
            total = data.get("total", 1)
            if day and total > 0:
                daily_scores.setdefault(day, []).append(score / total * 100)

    # Build trend data for the last N days
    result = []
    today = date.today()
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        day_str = d.isoformat()
        scores = daily_scores.get(day_str, [])
        avg = round(sum(scores) / len(scores), 1) if scores else None
        result.append({
            "date": d.strftime("%m-%d"),
            "score": avg if avg is not None else 0,
        })
    return result


def _compute_dimension_scores(events: List[dict]) -> dict:
    """
    Compute 5-dimension radar scores (0-100) from learning events.

    Dimensions:
    - memory: Flashcard mastery rate
    - logic: Quiz consecutive error rate, hint usage, difficulty progression
    - application: Cross-topic quiz performance
    - breadth: Topic/source diversity
    - innovation: Chat question complexity (heuristic)
    """
    scores = {
        "memory": 50.0,
        "logic": 50.0,
        "application": 50.0,
        "innovation": 50.0,
        "breadth": 50.0,
    }

    # ── Memory: flashcard mastery ──
    flashcard_events = [e for e in events if e["event_type"] == "flashcard_review"]
    if flashcard_events:
        mastered = sum(1 for e in flashcard_events if e["event_data"].get("mastered"))
        scores["memory"] = min(100, round(mastered / len(flashcard_events) * 100, 1))

    # ── Logic: quiz performance with difficulty weighting ──
    quiz_answers = [e for e in events if e["event_type"] == "quiz_answer"]
    if quiz_answers:
        difficulty_weight = {"easy": 1, "medium": 1.5, "hard": 2.0}
        weighted_correct = 0
        weighted_total = 0
        for a in quiz_answers:
            d = a["event_data"]
            w = difficulty_weight.get(d.get("difficulty", "medium"), 1.5)
            weighted_total += w
            if d.get("is_correct"):
                weighted_correct += w
        scores["logic"] = min(100, round(weighted_correct / weighted_total * 100, 1)) if weighted_total > 0 else 50

    # ── Application: cross-topic quiz performance ──
    quiz_completes = [e for e in events if e["event_type"] == "quiz_complete"]
    if quiz_completes:
        topic_scores: Dict[str, List[float]] = {}
        for qc in quiz_completes:
            d = qc["event_data"]
            topic = d.get("topic", "unknown")
            score_pct = d["score"] / d["total"] * 100 if d.get("total", 0) > 0 else 0
            topic_scores.setdefault(topic, []).append(score_pct)
        # More topics covered = better application
        topic_count_factor = min(1.0, len(topic_scores) / 5)
        avg_score = sum(sum(s) / len(s) for s in topic_scores.values()) / len(topic_scores)
        scores["application"] = min(100, round(avg_score * topic_count_factor + 50 * (1 - topic_count_factor), 1))

    # ── Breadth: unique topics ──
    all_topics = set()
    for e in events:
        d = e.get("event_data", {})
        if "topic" in d:
            all_topics.add(d["topic"])
        if "category" in d:
            all_topics.add(d["category"])
        if "covered_topics" in d:
            all_topics.update(d["covered_topics"])
    scores["breadth"] = min(100, round(len(all_topics) * 12, 1))  # ~8 topics = 100

    # ── Innovation: chat message analysis (heuristic) ──
    chat_events = [e for e in events if e["event_type"] == "chat_message"]
    if chat_events:
        # Heuristic: longer messages with question marks suggest deeper thinking
        avg_length = sum(e["event_data"].get("message_length", 0) for e in chat_events) / len(chat_events)
        question_ratio = sum(1 for e in chat_events if "?" in e["event_data"].get("preview", "")) / len(chat_events)
        scores["innovation"] = min(100, round(avg_length * 0.05 + question_ratio * 60, 1))

    return scores


async def _generate_ai_insight(
    events: List[dict],
    radar: dict,
    trend: List[dict],
    effective_hours: float,
    mastered_points: int,
) -> tuple:
    """Generate AI insight text, highlight tags, and action item via LLM."""
    role_prompt = _load_role_prompt()
    if not role_prompt:
        return (
            "暂无足够数据生成洞察，请多做练习和测验后再来查看。",
            ["数据不足"],
            "完成至少一次测验和闪卡复习",
        )

    # Build event summary for the agent
    event_summary = {
        "total_events": len(events),
        "event_types": {},
        "radar_scores": radar,
        "trend_scores": trend,
        "effective_hours": effective_hours,
        "mastered_points": mastered_points,
    }
    for e in events:
        t = e["event_type"]
        event_summary["event_types"][t] = event_summary["event_types"].get(t, 0) + 1

    # Extract top weak topics
    quiz_answers = [e for e in events if e["event_type"] == "quiz_answer"]
    wrong_topics: Dict[str, int] = {}
    for a in quiz_answers:
        if not a["event_data"].get("is_correct"):
            topic = a["event_data"].get("topic", "unknown")
            wrong_topics[topic] = wrong_topics.get(topic, 0) + 1
    event_summary["weak_topics"] = sorted(wrong_topics.items(), key=lambda x: -x[1])[:5]

    user_message = json.dumps(event_summary, ensure_ascii=False, indent=2)

    try:
        model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=0.7,
            max_tokens=800,
        )
        messages = [
            SystemMessage(content=role_prompt),
            HumanMessage(content=user_message),
        ]
        response = await model.ainvoke(messages)
        content = response.content.strip()

        # Parse JSON from response (handle markdown code blocks)
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        result = json.loads(content)
        return (
            result.get("insight_text", ""),
            result.get("highlight_tags", []),
            result.get("action_item", ""),
        )
    except Exception as e:
        logger.warning(f"AI insight generation failed: {e}")
        # Fallback: deterministic insight
        strongest = max(radar, key=radar.get)
        weakest = min(radar, key=radar.get)
        dimension_names = {
            "memory": "基础记忆",
            "logic": "逻辑推演",
            "application": "综合应用",
            "innovation": "创新思维",
            "breadth": "知识广度",
        }
        return (
            f"根据最近的学习数据，你在{dimension_names.get(strongest, strongest)}方面表现最为突出，"
            f"建议在{dimension_names.get(weakest, weakest)}方面加强练习。",
            [dimension_names.get(strongest, strongest), f"需加强{dimension_names.get(weakest, weakest)}"],
            f"重点练习{dimension_names.get(weakest, weakest)}相关内容",
        )
