"""
User Profile API
Provides endpoints for user profile management
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from auth.security import get_current_user
from models import User
from config import get_user_memory_dir
import os
import yaml
from datetime import datetime, timezone

router = APIRouter()


class BasicInfo(BaseModel):
    name: Optional[str] = None
    major: Optional[str] = None
    grade: Optional[str] = None
    school: Optional[str] = None


class LearningGoals(BaseModel):
    short_term: Optional[str] = None
    long_term: Optional[str] = None


class CognitiveStyle(BaseModel):
    preference: Optional[str] = None


class UserProfileResponse(BaseModel):
    username: str
    email: str
    basic_info: Optional[BasicInfo] = None
    learning_goals: Optional[LearningGoals] = None
    cognitive_style: Optional[CognitiveStyle] = None
    learning_plan: Optional[str] = None


class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    basic_info: Optional[BasicInfo] = None
    learning_goals: Optional[LearningGoals] = None
    cognitive_style: Optional[CognitiveStyle] = None


def parse_user_md(file_path: str) -> Dict[str, Any]:
    """Parse USER.md file and extract user information"""
    if not os.path.exists(file_path):
        return {}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract basic info
        basic_info = {}
        learning_goals = {}
        cognitive_style = {}

        lines = content.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()

            if '## 基本信息' in line or '## 1. 基础信息' in line:
                current_section = 'basic'
            elif '## 学习目标' in line or '## 2. 学习目标' in line:
                current_section = 'goals'
            elif '## 学习偏好' in line or '## 4. 认知风格' in line:
                current_section = 'cognitive'
            elif line.startswith('##'):
                current_section = None

            if current_section == 'basic':
                if line.startswith('- 姓名') and ':' in line:
                    name = line.split(':', 1)[1].strip()
                    if name and name != '未知':
                        basic_info['name'] = name
                elif line.startswith('- 专业') and ':' in line:
                    major = line.split(':', 1)[1].strip()
                    if major and major != '未知':
                        basic_info['major'] = major
                elif line.startswith('- 年级') and ':' in line:
                    grade = line.split(':', 1)[1].strip()
                    if grade and grade != '未知':
                        basic_info['grade'] = grade
                elif line.startswith('- 学校') and ':' in line:
                    school = line.split(':', 1)[1].strip()
                    if school and school != '未知':
                        basic_info['school'] = school

            elif current_section == 'goals':
                if line.startswith('- 短期目标') and ':' in line:
                    goal = line.split(':', 1)[1].strip()
                    if goal and goal != '未知':
                        learning_goals['short_term'] = goal
                elif line.startswith('- 长期目标') and ':' in line:
                    goal = line.split(':', 1)[1].strip()
                    if goal and goal != '未知':
                        learning_goals['long_term'] = goal

            elif current_section == 'cognitive':
                if line.startswith('- 偏好') and ':' in line:
                    pref = line.split(':', 1)[1].strip()
                    if pref and pref != '未知':
                        cognitive_style['preference'] = pref

        return {
            'basic_info': basic_info if basic_info else None,
            'learning_goals': learning_goals if learning_goals else None,
            'cognitive_style': cognitive_style if cognitive_style else None,
        }
    except Exception as e:
        print(f"Error parsing USER.md: {e}")
        return {}


def update_user_md(file_path: str, profile: UserProfileUpdate):
    """Update USER.md file with new profile information (overwrite)."""
    # Read existing to merge with new values
    existing = {}
    if os.path.exists(file_path):
        existing = parse_user_md(file_path)

    # Merge: new values override existing
    basic = existing.get('basic_info') or {}
    if profile.basic_info:
        for field in ['name', 'major', 'grade', 'school']:
            val = getattr(profile.basic_info, field, None)
            if val:
                basic[field] = val

    goals = existing.get('learning_goals') or {}
    if profile.learning_goals:
        for field in ['short_term', 'long_term']:
            val = getattr(profile.learning_goals, field, None)
            if val:
                goals[field] = val

    cog = existing.get('cognitive_style') or {}
    if profile.cognitive_style and profile.cognitive_style.preference:
        cog['preference'] = profile.cognitive_style.preference

    # Write clean format
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    content = "# 用户信息\n\n"
    content += "## 基本信息\n"
    content += f"- 姓名：{basic.get('name', '未知')}\n"
    content += f"- 专业：{basic.get('major', '未知')}\n"
    content += f"- 年级：{basic.get('grade', '未知')}\n"
    content += f"- 学校：{basic.get('school', '未知')}\n"
    content += "\n## 学习目标\n"
    content += f"- 短期目标：{goals.get('short_term', '未知')}\n"
    content += f"- 长期目标：{goals.get('long_term', '未知')}\n"
    content += "\n## 学习偏好\n"
    content += f"- 偏好：{cog.get('preference', '未知')}\n"

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


@router.get("/profile", response_model=UserProfileResponse)
async def get_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    user_workspace = f"data/users/{current_user.id}/workspace"
    user_md_path = os.path.join(user_workspace, "USER.md")
    learning_plan_path = os.path.join(user_workspace, "learning_plan.md")

    # Parse USER.md
    profile_data = parse_user_md(user_md_path)

    # Read learning plan
    learning_plan = None
    if os.path.exists(learning_plan_path):
        try:
            with open(learning_plan_path, 'r', encoding='utf-8') as f:
                learning_plan = f.read()
        except Exception:
            pass

    return UserProfileResponse(
        username=current_user.username,
        email=current_user.email,
        basic_info=BasicInfo(**profile_data.get('basic_info', {})) if profile_data.get('basic_info') else None,
        learning_goals=LearningGoals(**profile_data.get('learning_goals', {})) if profile_data.get('learning_goals') else None,
        cognitive_style=CognitiveStyle(**profile_data.get('cognitive_style', {})) if profile_data.get('cognitive_style') else None,
        learning_plan=learning_plan,
    )


def _sync_to_memory(user_id: int, profile: UserProfileUpdate):
    """Write changed fields to memory.md, replacing the last settings entry."""
    import re as _re
    try:
        memory_dir = get_user_memory_dir(user_id)
        memory_dir.mkdir(parents=True, exist_ok=True)
        memory_file = memory_dir / "memory.md"

        parts = []
        if profile.basic_info:
            bi = profile.basic_info
            if bi.name:
                parts.append(f"姓名：{bi.name}")
            if bi.major:
                parts.append(f"专业：{bi.major}")
            if bi.grade:
                parts.append(f"年级：{bi.grade}")
            if bi.school:
                parts.append(f"学校：{bi.school}")
        if profile.learning_goals:
            lg = profile.learning_goals
            if lg.short_term:
                parts.append(f"短期目标：{lg.short_term}")
            if lg.long_term:
                parts.append(f"长期目标：{lg.long_term}")
        if profile.cognitive_style and profile.cognitive_style.preference:
            parts.append(f"学习偏好：{profile.cognitive_style.preference}")

        if not parts:
            return

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        new_entry = f"\n## {now} — 用户设置更新\n" + "\n".join(f"- {p}" for p in parts) + "\n"

        existing = ""
        if memory_file.exists():
            existing = memory_file.read_text(encoding="utf-8")

        # Replace last "用户设置更新" section, or append if none exists
        pattern = r'\n## [^\n]*— 用户设置更新\n(?:.*?)(?=\n## |\Z)'
        if existing and _re.search(pattern, existing, re.DOTALL):
            content = _re.sub(pattern, new_entry.rstrip(), existing, count=1, flags=_re.DOTALL)
        else:
            content = existing + new_entry if existing else f"# 学习记忆\n{new_entry}"

        memory_file.write_text(content, encoding="utf-8")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to sync profile to memory.md: {e}")


@router.put("/profile")
async def update_user_profile(
    profile: UserProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update current user profile"""
    user_workspace = f"data/users/{current_user.id}/workspace"
    user_md_path = os.path.join(user_workspace, "USER.md")

    try:
        # Update USER.md
        update_user_md(user_md_path, profile)

        # Sync to memory.md for profile generation
        _sync_to_memory(current_user.id, profile)

        # Update username in database if provided
        if profile.username and profile.username != current_user.username:
            # TODO: Update username in database
            pass

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")
