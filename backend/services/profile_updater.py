"""
Profile Updater Service

Uses LLM to analyze learning data and update student profile.
Reads history, mistakes, memory and generates a comprehensive profile.

Usage:
    from services.profile_updater import update_profile_from_data
    await update_profile_from_data(user_id)
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import settings

logger = logging.getLogger(__name__)

PROFILE_ROLE_PROMPT = None


def _read_json_file(path: Path) -> Any:
    """Safely read JSON file."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Failed to read {path}: {e}")
        return None


def _write_json_file(path: Path, data: Any) -> None:
    """Write JSON file."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to write {path}: {e}")


def _load_role_prompt() -> str:
    """Load profile generator role prompt."""
    global PROFILE_ROLE_PROMPT
    if PROFILE_ROLE_PROMPT is not None:
        return PROFILE_ROLE_PROMPT

    prompt_path = Path(__file__).parent.parent / "workspace" / "roles" / "profile_generator.md"
    if prompt_path.exists():
        PROFILE_ROLE_PROMPT = prompt_path.read_text(encoding="utf-8")
    else:
        logger.warning(f"Profile role prompt not found at {prompt_path}")
        PROFILE_ROLE_PROMPT = ""
    return PROFILE_ROLE_PROMPT


def _collect_learning_data(memory_dir: Path, workspace_dir: Path) -> Dict[str, Any]:
    """Collect all learning data for profile generation."""
    # Read history
    history = _read_json_file(memory_dir / "history.json") or []

    # Read mistakes
    mistakes = _read_json_file(memory_dir / "mistakes.json") or []

    # Read memory highlights
    memory_file = memory_dir / "memory.md"
    memory_highlights = []
    if memory_file.exists():
        try:
            content = memory_file.read_text(encoding="utf-8")
            sections = content.split("\n## ")
            for section in sections[1:]:
                if section.strip():
                    memory_highlights.append(section.strip())
        except Exception as e:
            logger.warning(f"Failed to read memory.md: {e}")

    # Read existing profile for knowledge graph
    existing_profile = _read_json_file(workspace_dir / "profile.json")

    # Build data slice
    data = {
        "memory_highlights": memory_highlights[:10],
        "recent_conversations": history[-20:],
        "mistakes": mistakes[-20:],
        "learning_stats": {
            "total_conversations": len(history),
            "total_mistakes": len(mistakes),
            "topics_covered": list(set(m.get("topic", "") for m in history if m.get("topic")))[:20],
        }
    }

    # Include existing knowledge graph for incremental update
    if existing_profile and existing_profile.get("knowledge_graph"):
        data["existing_graph"] = existing_profile["knowledge_graph"]

    return data


def _parse_llm_response(content: str) -> Optional[Dict[str, Any]]:
    """Parse LLM response to extract JSON."""
    # Try direct JSON parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try extracting from code blocks
    if "```" in content:
        parts = content.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                try:
                    return json.loads(part)
                except json.JSONDecodeError:
                    continue

    # Try finding JSON object
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        json_str = content[start:end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    return None


def _build_profile(llm_data: Dict[str, Any], existing_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Build profile from LLM output, merging with existing data."""
    # Default template
    default = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dimensions": {
            "knowledge_foundation": {"score": 50, "concepts": [], "summary": "数据不足"},
            "cognitive_style": {"score": 50, "style": "待观察", "traits": []},
            "error_patterns": {"score": 50, "patterns": [], "summary": "数据不足"},
            "learning_rhythm": {"score": 50, "pace": "待观察", "traits": []},
            "affective_state": {"score": 50, "mood": "待观察", "traits": []},
            "goal_progress": {"score": 50, "short_term": "", "long_term": "", "progress": ""}
        },
        "knowledge_graph": {"nodes": [], "edges": []},
        "overall_score": 50,
        "insight_text": "",
        "action_item": "",
        "highlight_tags": [],
        "needs_onboarding": False
    }

    # Start with existing profile or default
    profile = existing_profile or default

    # Update dimensions
    if "dimensions" in llm_data:
        for key in profile["dimensions"]:
            if key in llm_data["dimensions"]:
                llm_dim = llm_data["dimensions"][key]
                # Ensure score is in range
                if "score" in llm_dim:
                    llm_dim["score"] = max(0, min(100, int(llm_dim["score"])))
                profile["dimensions"][key].update(llm_dim)

    # Update knowledge graph (incremental merge)
    if "knowledge_graph" in llm_data:
        kg = profile["knowledge_graph"]
        existing_nodes = {n["id"]: n for n in kg.get("nodes", [])}
        existing_edges = {(e["source"], e["target"]): e for e in kg.get("edges", [])}

        for node in llm_data["knowledge_graph"].get("nodes", []):
            node_id = node.get("id")
            if node_id:
                if node_id in existing_nodes:
                    # Gradual mastery update
                    old = existing_nodes[node_id].get("mastery", 0.5)
                    new = node.get("mastery", old)
                    node["mastery"] = round(old * 0.7 + new * 0.3, 2)
                existing_nodes[node_id] = node

        for edge in llm_data["knowledge_graph"].get("edges", []):
            key = (edge.get("source"), edge.get("target"))
            if key[0] and key[1] and key not in existing_edges:
                existing_edges[key] = edge

        profile["knowledge_graph"] = {
            "nodes": list(existing_nodes.values()),
            "edges": list(existing_edges.values())
        }

    # Update simple fields
    if "overall_score" in llm_data:
        profile["overall_score"] = max(0, min(100, int(llm_data["overall_score"])))
    if "insight_text" in llm_data:
        profile["insight_text"] = llm_data["insight_text"]
    if "action_item" in llm_data:
        profile["action_item"] = llm_data["action_item"]
    if "highlight_tags" in llm_data:
        profile["highlight_tags"] = llm_data["highlight_tags"]

    profile["generated_at"] = datetime.now(timezone.utc).isoformat()
    profile["needs_onboarding"] = False

    return profile


async def update_profile_from_data(user_id: int, memory_dir: Path, workspace_dir: Path) -> Dict[str, Any]:
    """
    Update student profile using LLM to analyze learning data.

    This function:
    1. Collects all learning data (history, mistakes, memory)
    2. Sends to LLM with profile generator prompt
    3. Parses LLM response and updates profile.json
    """
    # Load role prompt
    role_prompt = _load_role_prompt()
    if not role_prompt:
        logger.error("Profile role prompt not found")
        return _read_json_file(workspace_dir / "profile.json") or {}

    # Collect learning data
    data = _collect_learning_data(memory_dir, workspace_dir)

    # Check if there's enough data
    has_data = (
        len(data.get("recent_conversations", [])) > 0
        or len(data.get("mistakes", [])) > 0
        or len(data.get("memory_highlights", [])) > 0
    )

    if not has_data:
        logger.info(f"No learning data found for user {user_id}, returning existing profile")
        return _read_json_file(workspace_dir / "profile.json") or {}

    # Load existing profile
    existing_profile = _read_json_file(workspace_dir / "profile.json")

    # Call LLM
    try:
        model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=0.3,
            max_tokens=2000,
            request_timeout=120,
        )

        user_message = json.dumps(data, ensure_ascii=False, indent=2)
        messages = [
            SystemMessage(content=role_prompt),
            HumanMessage(content=user_message),
        ]

        logger.info(f"Calling LLM to generate profile for user {user_id}")
        response = await model.ainvoke(messages)
        content = response.content.strip()

        if not content:
            logger.warning("LLM returned empty response")
            return existing_profile or {}

        # Parse response
        llm_data = _parse_llm_response(content)
        if not llm_data:
            logger.warning("Failed to parse LLM response as JSON")
            logger.debug(f"LLM response: {content[:500]}")
            return existing_profile or {}

        # Build profile
        profile = _build_profile(llm_data, existing_profile)

        # Save profile
        _write_json_file(workspace_dir / "profile.json", profile)

        logger.info(f"Profile updated for user {user_id}: overall_score={profile['overall_score']}")
        return profile

    except Exception as e:
        logger.error(f"LLM profile generation failed for user {user_id}: {e}")
        return existing_profile or {}


async def update_profile_after_event(user_id: int, event_type: str, event_data: Dict[str, Any]) -> None:
    """
    Update profile after a learning event.

    Called after quiz completion, flashcard review, etc.
    """
    from config import get_user_memory_dir, get_user_workspace_dir

    memory_dir = get_user_memory_dir(user_id)
    workspace_dir = get_user_workspace_dir(user_id)

    await update_profile_from_data(user_id, memory_dir, workspace_dir)
