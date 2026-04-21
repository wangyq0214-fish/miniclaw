"""
Agent Skills System

Provides a `SkillsManager` that scans the skills directory and parses each
SKILL.md's frontmatter. Used by the `/api/skills` endpoint to list available
skills for the frontend. Skill content is injected into the system prompt
by deepagents SkillsMiddleware at runtime — this module does not generate
a static SKILLS_SNAPSHOT.md anymore.
"""
import os
import re
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime
import frontmatter

from config import get_skills_dir, get_workspace_dir

logger = logging.getLogger(__name__)


class Skill:
    """Represents a single skill."""

    def __init__(self, name: str, description: str, location: str, tool: str = None, metadata: Dict[str, Any] = None):
        self.name = name
        self.description = description
        self.location = location  # Relative path
        self.tool = tool  # Tool to use for this skill
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "name": self.name,
            "description": self.description,
            "location": self.location
        }
        if self.tool:
            result["tool"] = self.tool
        return result


class SkillsManager:
    """Manages the loading and execution of Agent Skills."""

    def __init__(self, skills_dir: Optional[str] = None):
        self.skills_dir = Path(skills_dir) if skills_dir else get_skills_dir()
        self.skills: List[Skill] = []
        self._load_skills()

    def _load_skills(self):
        """Scan skills directory and load all skills."""
        self.skills = []

        if not self.skills_dir.exists():
            logger.warning(f"Skills directory does not exist: {self.skills_dir}")
            return

        # Scan for SKILL.md files in subdirectories
        for skill_dir in self.skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue

            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue

            try:
                # Parse frontmatter
                with open(skill_md, 'r', encoding='utf-8') as f:
                    post = frontmatter.load(f)

                name = post.metadata.get('name', skill_dir.name)
                description = post.metadata.get('description', '')
                tool = post.metadata.get('tool', None)  # Tool to use for this skill

                # Calculate relative location
                location = f"./backend/skills/{skill_dir.name}/SKILL.md"

                skill = Skill(
                    name=name,
                    description=description,
                    location=location,
                    tool=tool,
                    metadata=post.metadata
                )

                self.skills.append(skill)
                logger.info(f"Loaded skill: {name}" + (f" (tool: {tool})" if tool else ""))

            except Exception as e:
                logger.error(f"Error loading skill from {skill_md}: {str(e)}")

    def reload(self):
        """Reload all skills."""
        self._load_skills()

    def get_skill_by_name(self, name: str) -> Optional[Skill]:
        """Get a skill by name."""
        for skill in self.skills:
            if skill.name == name:
                return skill
        return None


# Global singleton instance
_skills_manager_instance: Optional[SkillsManager] = None


def get_skills_manager() -> SkillsManager:
    """Get the global SkillsManager instance (singleton)."""
    global _skills_manager_instance
    if _skills_manager_instance is None:
        _skills_manager_instance = SkillsManager()
    return _skills_manager_instance


def create_skills_manager() -> SkillsManager:
    """Create and return a SkillsManager instance."""
    return get_skills_manager()