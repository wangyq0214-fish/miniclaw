"""
Mini-OpenClaw Tools Package

Custom tools that extend the DeepAgents framework built-in tools.

The DeepAgents FilesystemMiddleware provides: ls, read_file, write_file, edit_file, glob, grep, execute.
This package provides additional domain-specific tools: python_repl, fetch_url, knowledge_search, course_structure, entity_graph.
"""
from typing import List, Optional
from pathlib import Path

from langchain_core.tools import BaseTool

from .python_repl import create_python_repl_tool, SafePythonREPLTool
from .fetch_url import create_fetch_url_tool, CleanedFetchTool
from .knowledge import create_knowledge_search_tool, Neo4jKnowledgeTool
from .course_structure import create_course_structure_tool, CourseStructureTool
from .entity_graph import create_entity_graph_tool, EntityGraphTool

__all__ = [
    "create_python_repl_tool",
    "create_fetch_url_tool",
    "create_knowledge_search_tool",
    "create_course_structure_tool",
    "create_entity_graph_tool",
    "get_all_tools",
    "get_custom_tools",
    "SafePythonREPLTool",
    "CleanedFetchTool",
    "Neo4jKnowledgeTool",
    "CourseStructureTool",
    "EntityGraphTool",
]


def get_all_tools(base_dir: Path = None, user_id: Optional[int] = None, backend=None) -> List[BaseTool]:
    """Get custom tools for the agent.

    Note: read_file, write_file, edit_file, ls, glob, grep, execute are provided
    by DeepAgents FilesystemMiddleware automatically. These custom tools extend
    the agent with domain-specific capabilities.

    Args:
        base_dir: Base directory for tools
        user_id: User ID for access control
        backend: Backend instance for file operations
    """
    return [
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
    ]


def get_custom_tools(base_dir: Path = None, user_id: Optional[int] = None) -> List[BaseTool]:
    return [
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
    ]
