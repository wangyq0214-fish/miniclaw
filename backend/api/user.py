"""
User Profile API
Provides endpoints for user profile management
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from auth.security import get_current_user
from models import User
import os
import yaml

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

            if '## 1. 基础信息' in line:
                current_section = 'basic'
            elif '## 2. 学习目标' in line:
                current_section = 'goals'
            elif '## 4. 认知风格' in line:
                current_section = 'cognitive'
            elif line.startswith('##'):
                current_section = None

            if current_section == 'basic':
                if line.startswith('- 姓名 / 昵称:'):
                    name = line.split(':', 1)[1].strip()
                    if name and name != '未知':
                        basic_info['name'] = name
                elif line.startswith('- 专业:'):
                    major = line.split(':', 1)[1].strip()
                    if major and major != '未知':
                        basic_info['major'] = major
                elif line.startswith('- 年级 / 学段:'):
                    grade = line.split(':', 1)[1].strip()
                    if grade and grade != '未知':
                        basic_info['grade'] = grade
                elif line.startswith('- 所在学校:'):
                    school = line.split(':', 1)[1].strip()
                    if school and school != '未知':
                        basic_info['school'] = school

            elif current_section == 'goals':
                if line.startswith('- 短期目标'):
                    goal = line.split(':', 1)[1].strip() if ':' in line else ''
                    if goal and goal != '未知':
                        learning_goals['short_term'] = goal
                elif line.startswith('- 长期目标'):
                    goal = line.split(':', 1)[1].strip() if ':' in line else ''
                    if goal and goal != '未知':
                        learning_goals['long_term'] = goal

            elif current_section == 'cognitive':
                if line.startswith('- 示例驱动 vs 理论驱动:'):
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
    """Update USER.md file with new profile information"""
    if not os.path.exists(file_path):
        # Create default USER.md if not exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("""---
schema_version: 1.0
last_updated: null
confidence_overall: 0.0
---

# 学生画像(Student Profile)

## 1. 基础信息(Basic Info)
- 姓名 / 昵称:未知
- 专业:未知
- 年级 / 学段:未知
- 所在学校:未知
- last_updated: null
- confidence: 0.0

## 2. 学习目标(Learning Goals)
- 短期目标(1-4 周):未知
- 长期目标(学期级):未知
- last_updated: null
- confidence: 0.0

## 4. 认知风格(Cognitive Style)
- 示例驱动 vs 理论驱动:未知
- last_updated: null
- confidence: 0.0
""")

    # Read current content
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    new_lines = []

    for line in lines:
        new_line = line

        # Update basic info
        if profile.basic_info:
            if line.strip().startswith('- 姓名 / 昵称:') and profile.basic_info.name:
                new_line = f"- 姓名 / 昵称:{profile.basic_info.name}"
            elif line.strip().startswith('- 专业:') and profile.basic_info.major:
                new_line = f"- 专业:{profile.basic_info.major}"
            elif line.strip().startswith('- 年级 / 学段:') and profile.basic_info.grade:
                new_line = f"- 年级 / 学段:{profile.basic_info.grade}"
            elif line.strip().startswith('- 所在学校:') and profile.basic_info.school:
                new_line = f"- 所在学校:{profile.basic_info.school}"

        # Update learning goals
        if profile.learning_goals:
            if line.strip().startswith('- 短期目标') and profile.learning_goals.short_term:
                new_line = f"- 短期目标(1-4 周):{profile.learning_goals.short_term}"
            elif line.strip().startswith('- 长期目标') and profile.learning_goals.long_term:
                new_line = f"- 长期目标(学期级):{profile.learning_goals.long_term}"

        # Update cognitive style
        if profile.cognitive_style:
            if line.strip().startswith('- 示例驱动 vs 理论驱动:') and profile.cognitive_style.preference:
                new_line = f"- 示例驱动 vs 理论驱动:{profile.cognitive_style.preference}"

        new_lines.append(new_line)

    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))


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

        # Update username in database if provided
        if profile.username and profile.username != current_user.username:
            # TODO: Update username in database
            pass

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")
