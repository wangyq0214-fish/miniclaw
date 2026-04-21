"""
Resource-generation subagents.

Six role-specialized subagents that collaborate under the main agent (orchestrator)
to produce multi-modal learning materials for a student. Each subagent's
`system_prompt` is loaded from `workspace/roles/<name>.md` — so role identity is
fully file-driven. Execution protocol for each role lives in a matching
`skills/<generate_*>/SKILL.md` that the subagent reads on entry.

Design:
- Main agent = orchestrator (uses built-in `task` tool to dispatch these)
- 6 subagents cover: lecture, mindmap, exercises, reading list, media, code cases
- model / tools are inherited from the main agent (deepagents graph.py fills defaults)
- English `name` keeps `task(subagent_type="...")` argument stable across models
"""
from __future__ import annotations

import logging
from pathlib import Path
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
        "the student's mastery and cognitive style. Use when the student asks for "
        "讲解 / 文档 / 教程 / 介绍某概念.",
    ),
    (
        "mindmap_designer",
        "Generate a Mermaid mindmap + dependency graph that visualizes the hierarchy "
        "and prerequisites of a topic, with per-node mastery markers. Use when the "
        "student asks for 思维导图 / 概念图 / 知识梳理 / 一张图看懂.",
    ),
    (
        "exercise_composer",
        "Generate 5-8 mixed-type exercises (choice/true-false/short/coding) with "
        "difficulty distribution matched to student mastery, plus structured JSON "
        "for downstream consumption. Use when the student asks for 题 / 练习 / 测验 / 自测.",
    ),
    (
        "reading_curator",
        "Search and curate 5-8 external reading materials (project KB + web via "
        "tavily-search) with summary, difficulty tier, and personalized recommendation "
        "reason. Use when the student asks for 拓展阅读 / 资料 / 参考 / 推荐书单.",
    ),
    (
        "media_director",
        "Generate a Markdown teaching storyboard (5-8 scenes with narration and "
        "visuals). When the request explicitly mentions 视频/动画/MP4/animation, also "
        "produce a manim Python script and attempt MP4 render (graceful fallback on "
        "failure). Use when the student asks for 视频 / 动画 / 演示 / 讲给我看.",
    ),
    (
        "code_case_builder",
        "Generate 2-4 runnable leveled code cases (Python) with smoke tests, "
        "requirements.txt, and a learning-order README. Use when the student asks "
        "for 代码 / 实现 / 示例 / demo / 动手.",
    ),
]


def _load_role_prompt(name: str, workspace_dir: Path) -> str:
    """Load a subagent's `system_prompt` from workspace/roles/<name>.md.

    Returns empty string if the file is missing — caller treats that as "skip this role".
    """
    p = workspace_dir / "roles" / f"{name}.md"
    if not p.exists():
        logger.warning("Role prompt missing: %s — skipping this subagent", p)
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("Failed to read role prompt %s: %s", p, e)
        return ""


def build_resource_subagents(workspace_dir: Path) -> list[dict[str, Any]]:
    """Build `SubAgent` specs for the 6 resource-generation roles.

    Each returned spec is a dict matching deepagents.middleware.subagents.SubAgent.
    `model` and `tools` are intentionally omitted — `create_deep_agent` fills in
    the main agent's values as defaults (graph.py lines 492-534).

    Args:
        workspace_dir: absolute path to `backend/workspace/`

    Returns:
        List of SubAgent dicts, one per role whose role file exists.
    """
    specs: list[dict[str, Any]] = []
    for name, description in RESOURCE_ROLES:
        prompt = _load_role_prompt(name, workspace_dir)
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
