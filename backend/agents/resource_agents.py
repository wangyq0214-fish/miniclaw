"""
Resource-generation subagents.

Six role-specialized subagents that collaborate under the main agent (orchestrator)
to produce multi-modal learning materials for a student. Each subagent's
`system_prompt` is loaded from `/roles/<name>.md` via backend — so role identity is
fully file-driven.

Design:
- Main agent = orchestrator (uses built-in `task` tool to dispatch these)
- 6 subagents cover: lecture, mindmap, exercises, reading list, code cases, HTML animation
- model / tools are inherited from the main agent (deepagents graph.py fills defaults)
- English `name` keeps `task(subagent_type="...")` argument stable across models
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# (subagent_type, description-shown-to-orchestrator)
# Description is what the main agent sees in the `task` tool's available-agents
# listing — so it must spell out when to use this subagent.
RESOURCE_ROLES: list[tuple[str, str]] = [
    (
        "lecture_writer",
        "Generate an in-depth lecture document (Markdown) for a specific concept, "
        "with motivation/definition/intuition/mechanism/example/pitfalls. Calibrated to "
        "the student's mastery and cognitive style. "
        "Saves to workspace/generated/lectures/<中文主题名>.md (no leading slash). "
        "Use when the student asks for 讲解 / 文档 / 教程 / 介绍某概念.",
    ),
    (
        "mindmap_designer",
        "Generate an interactive knowledge tree as JSON for the MindmapCard "
        "visualization. Each node has title/summary/details/children. "
        "Saves to workspace/generated/mindmaps/<中文主题名>.json (no leading slash, system auto-injects date prefix). "
        "Use when the student asks for 思维导图 / 概念图 / 知识梳理 / 一张图看懂.",
    ),
    (
        "exercise_composer",
        "Generate 5-8 exercises as JSON (choice + true/false only). CRITICAL JSON RULES: "
        "(1) each option gets its own explanation_md, (2) Chinese quotes must use 「」 "
        "corner brackets, NEVER ASCII double quotes inside JSON strings. "
        "Saves to workspace/generated/exercises/<中文主题名>.json (no leading slash). "
        "Use when the student asks for 题 / 练习 / 测验 / 自测.",
    ),
    (
        "flashcard_composer",
        "Generate 10-20 flashcards as JSON for spaced repetition learning. Each card "
        "has front (question, ≤30 chars), back (answer, ≤150 chars), difficulty, category, "
        "and tags. "
        "Saves to workspace/generated/flashcards/<中文主题名>.json (no leading slash, system auto-injects date prefix). "
        "Use when the student asks for 抽认卡 / 闪卡 / 记忆卡 / 复习卡 / 知识卡片.",
    ),
    (
        "reading_curator",
        "Search and curate 5-8 external reading materials (project KB + web via "
        "tavily-search) with summary, difficulty tier, and personalized recommendation "
        "reason. "
        "Saves to workspace/generated/reading-lists/<中文主题名>.md (no leading slash). "
        "Use when the student asks for 拓展阅读 / 资料 / 参考 / 推荐书单.",
    ),
    (
        "code_case_builder",
        "Generate 2-4 runnable leveled code cases (Python) with smoke tests, "
        "requirements.txt, and a learning-order README. "
        "Saves to workspace/generated/code-cases/<中文主题名>/ (no leading slash). "
        "Use when the student asks for 代码 / 实现 / 示例 / demo / 动手.",
    ),
    (
        "media_script_writer",
        "Generate a self-contained HTML animation (CSS+JS inline, 16:9 canvas) "
        "with scene-by-scene visual elements and timed narration subtitles. "
        "Does NOT search knowledge base - uses only the task description. "
        "Saves to workspace/generated/media-scripts/<中文主题名>.html (no leading slash, system auto-injects date prefix). "
        "Use when the student asks for 动画 / 视频 / 动画脚本 / 可视化讲解.",
    ),
    (
        "learning_map_planner",
        "Convert a learning plan Markdown into a structured learning map JSON "
        "for the LearningMap visualization. Parses days/phases/topics from the "
        "plan and generates a hierarchical node tree with sequential unlock logic. "
        "Saves to workspace/learning_map.json. "
        "Use when the student asks for 学习地图 / 学习路线 / 学习计划可视化 / 生成地图.",
    ),
]


def _load_role_prompt(name: str, backend) -> str:
    """Load a subagent's `system_prompt` from /roles/<name>.md via backend.

    Returns empty string if the file is missing — caller treats that as "skip this role".

    Args:
        name: Role name (e.g., "lecture_writer")
        backend: Backend instance to use for file operations
    """
    role_path = f"/roles/{name}.md"
    try:
        result = backend.read(role_path)
        if result.error:
            logger.warning("Role prompt missing: %s — skipping this subagent", role_path)
            return ""

        # Handle file_data as dict or object
        if result.file_data:
            if isinstance(result.file_data, dict):
                return result.file_data.get('content', '')
            elif hasattr(result.file_data, 'content'):
                return result.file_data.content

        return ""
    except Exception as e:
        logger.error("Failed to read role prompt %s: %s", role_path, e)
        return ""


def build_resource_subagents(backend) -> list[dict[str, Any]]:
    """Build `SubAgent` specs for the 5 resource-generation roles.

    Each returned spec is a dict matching deepagents.middleware.subagents.SubAgent.
    `model` and `tools` are intentionally omitted — `create_deep_agent` fills in
    the main agent's values as defaults (graph.py lines 492-534).

    Args:
        backend: Backend instance to use for loading role prompts

    Returns:
        List of SubAgent dicts, one per role whose role file exists.
    """
    specs: list[dict[str, Any]] = []
    for name, description in RESOURCE_ROLES:
        prompt = _load_role_prompt(name, backend)
        if not prompt:
            continue
        specs.append(
            {
                "name": name,
                "description": description,
                "system_prompt": prompt,
            }
        )
    logger.info("Built %d resource subagents: %s", len(specs), [s["name"] for s in specs])
    return specs
