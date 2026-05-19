"""
Mindmap API - Knowledge reading system endpoints

Provides /expand_node for deep-diving into a concept.
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth.security import get_current_user
from models.complete_models import User

logger = logging.getLogger(__name__)

router = APIRouter()


class ExpandNodeRequest(BaseModel):
    node_title: str
    context: str = ""


class ExtraContent(BaseModel):
    explanation: str = ""
    examples: List[str] = []
    applications: List[str] = []


class ExpandNodeResponse(BaseModel):
    extra: ExtraContent


def _get_llm():
    """Lazy-init LLM for node expansion."""
    from langchain_openai import ChatOpenAI
    from config import settings
    return ChatOpenAI(
        model=settings.openai_model,
        base_url=settings.openai_api_base,
        api_key=settings.openai_api_key,
        temperature=0.3,
    )


def _strip_json_fences(text: str) -> str:
    """Strip markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


@router.post("/mindmap/expand", response_model=ExpandNodeResponse)
async def expand_node(
    request: ExpandNodeRequest,
    current_user: User = Depends(get_current_user),
):
    """Expand a mindmap node with detailed explanations."""
    node_title = request.node_title.strip()
    if not node_title:
        raise HTTPException(status_code=400, detail="node_title is required")

    # Remove mastery markers for cleaner LLM input
    clean_title = node_title.replace("✅", "").replace("🔶", "").replace("❓", "").strip()

    context_hint = ""
    if request.context:
        context_hint = f"\n\n该节点已有的背景信息：\n{request.context}\n请在此基础上深入拓展，不要重复已有内容。"

    prompt = f"""请对知识节点「{clean_title}」进行深入解释，帮助学生真正理解这个概念。

要求：
- explanation：用 2~3 句话深入解释这个概念的本质、原理或意义（≤ 80字），要超越表面定义
- examples：2~3 个具体、生动的例子或类比，帮助理解（每条 ≤ 20字）
- applications：2~3 个真实的应用场景或实际用途（每条 ≤ 20字）
- 输出纯 JSON，不要 markdown 代码块

输出格式：
{{"explanation": "深入解释文字", "examples": ["具体例子1", "具体例子2"], "applications": ["应用场景1", "应用场景2"]}}
{context_hint}"""

    try:
        llm = _get_llm()
        response = await llm.ainvoke(prompt)
        raw = response.content.strip()
        raw = _strip_json_fences(raw)

        data = json.loads(raw)
        extra = ExtraContent(
            explanation=data.get("explanation", ""),
            examples=data.get("examples", []),
            applications=data.get("applications", []),
        )
        return ExpandNodeResponse(extra=extra)

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {raw}")
        raise HTTPException(status_code=500, detail=f"LLM output is not valid JSON: {e}")
    except Exception as e:
        logger.error(f"expand_node error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
