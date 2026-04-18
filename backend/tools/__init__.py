"""
Mini-OpenClaw Tools Package

All tools inherit from LangChain BaseTool and provide:
- Safe execution with timeouts
- Output truncation to prevent token overflow
- Security measures (path restrictions, command blacklists)
"""
from typing import List
from pathlib import Path

from langchain_core.tools import BaseTool

from .terminal import create_terminal_tool, SafeShellTool
from .python_repl import create_python_repl_tool, SafePythonREPLTool
from .fetch_url import create_fetch_url_tool, CleanedFetchTool
from .read_file import create_read_file_tool, SafeReadFileTool
from .write_file import create_write_file_tool, SafeWriteFileTool
from .knowledge import create_knowledge_search_tool, Neo4jKnowledgeTool
from .course_structure import create_course_structure_tool, CourseStructureTool
from .entity_graph import create_entity_graph_tool, EntityGraphTool

__all__ = [
    "create_terminal_tool",
    "create_python_repl_tool",
    "create_fetch_url_tool",
    "create_read_file_tool",
    "create_write_file_tool",
    "create_knowledge_search_tool",
    "create_course_structure_tool",
    "create_entity_graph_tool",
    "get_all_tools",
    "get_custom_tools",
    "SafeShellTool",
    "SafePythonREPLTool",
    "CleanedFetchTool",
    "SafeReadFileTool",
    "SafeWriteFileTool",
    "Neo4jKnowledgeTool",
    "CourseStructureTool",
    "EntityGraphTool",
]


def get_all_tools(base_dir: Path = None) -> List[BaseTool]:
    return [
        create_terminal_tool(root_dir=str(base_dir) if base_dir else None),
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_read_file_tool(root_dir=str(base_dir) if base_dir else None),
        create_write_file_tool(root_dir=str(base_dir) if base_dir else None),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
    ]


def get_custom_tools(base_dir: Path = None) -> List[BaseTool]:
    return [
        create_terminal_tool(root_dir=str(base_dir) if base_dir else None),
        create_python_repl_tool(),
        create_fetch_url_tool(),
        create_knowledge_search_tool(base_dir=base_dir),
        create_course_structure_tool(),
        create_entity_graph_tool(),
    ]
