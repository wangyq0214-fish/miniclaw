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
from .shell_execute import create_execute_tool

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


def get_all_tools(base_dir: Path = None, user_id: Optional[int] = None, backend=None, path_mappings=None, cwd=None) -> List[BaseTool]:
    """Get custom tools for the agent.

    Note: read_file, write_file, edit_file, ls, glob, grep are provided
    by DeepAgents FilesystemMiddleware automatically. The execute tool is
    provided here with virtual path resolution support.

    Args:
        base_dir: Base directory for tools
        user_id: User ID for access control
        backend: Backend instance for file operations
        path_mappings: List of (virtual_prefix, physical_root) tuples for execute tool
        cwd: Working directory for execute tool (user workspace path)
    """
    return [
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
        create_execute_tool(path_mappings=path_mappings, cwd=cwd),
    ]


def get_custom_tools(base_dir: Path = None, user_id: Optional[int] = None) -> List[BaseTool]:
    return [
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
    ]
