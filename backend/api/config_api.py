"""
Configuration API

Manages runtime configuration like RAG mode.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_project_root

logger = logging.getLogger(__name__)

router = APIRouter()

# Config file path
CONFIG_FILE = "config.json"


class RagModeResponse(BaseModel):
    """RAG mode status response."""
    enabled: bool


class RagModeRequest(BaseModel):
    """Request to toggle RAG mode."""
    enabled: bool


def _get_config_path() -> Path:
    """Get the config file path."""
    return get_project_root() / CONFIG_FILE


def _load_config() -> Dict[str, Any]:
    """Load configuration from file."""
    config_path = _get_config_path()

    if not config_path.exists():
        return {"rag_mode": False}

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading config: {str(e)}")
        return {"rag_mode": False}


def _save_config(config: Dict[str, Any]) -> bool:
    """Save configuration to file."""
    config_path = _get_config_path()

    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving config: {str(e)}")
        return False


@router.get("/config/rag-mode", response_model=RagModeResponse)
async def get_rag_mode():
    """
    Get the current RAG mode status.

    RAG mode enables memory retrieval from MEMORY.md using vector search.
    """
    try:
        config = _load_config()
        return RagModeResponse(enabled=config.get("rag_mode", False))
    except Exception as e:
        logger.error(f"Error getting RAG mode: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/rag-mode", response_model=RagModeResponse)
async def set_rag_mode(request: RagModeRequest):
    """
    Toggle RAG mode on or off.

    Args:
        request: Contains 'enabled' boolean

    Returns:
        Updated RAG mode status
    """
    try:
        config = _load_config()
        config["rag_mode"] = request.enabled

        if not _save_config(config):
            raise HTTPException(status_code=500, detail="Failed to save configuration")

        logger.info(f"RAG mode set to: {request.enabled}")

        return RagModeResponse(enabled=request.enabled)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting RAG mode: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_all_config():
    """
    Get all configuration settings.
    """
    try:
        config = _load_config()
        return config
    except Exception as e:
        logger.error(f"Error getting config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ReloadSkillsResponse(BaseModel):
    """Response for skills reload."""
    success: bool
    skills_count: int
    skills: list


@router.post("/config/reload-skills", response_model=ReloadSkillsResponse)
async def reload_skills():
    """
    Hot reload all skills from the skills directory.

    Call this endpoint after adding new skills to make them available
    without restarting the server.

    Returns:
        Number of skills loaded after reload
    """
    try:
        from skills import get_skills_manager

        manager = get_skills_manager()
        manager.reload()

        skills_list = [skill.to_dict() for skill in manager.skills]

        logger.info(f"Skills reloaded: {len(manager.skills)} skills")

        return ReloadSkillsResponse(
            success=True,
            skills_count=len(manager.skills),
            skills=skills_list
        )
    except Exception as e:
        logger.error(f"Error reloading skills: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
