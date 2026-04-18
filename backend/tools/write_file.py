"""
File Write Tool - Safe file writing for Agent

Features:
- Directory restriction (only allowed paths)
- Sensitive file blocking
- Append mode for MEMORY.md
- Auto-create directories
"""
import os
import logging
from pathlib import Path
from typing import Optional, List, Literal
from langchain_core.tools import BaseTool
from pydantic import Field

from config import settings, get_project_root

logger = logging.getLogger(__name__)


class SafeWriteFileTool(BaseTool):
    """Safe file writing tool with directory restrictions."""

    name: str = "write_file"
    description: str = """Write content to a file in the project directory.
    Use this tool to update MEMORY.md with important information, or write to other allowed files.

    Args:
        path: Relative path to the file (e.g., 'memory/MEMORY.md')
        content: Content to write to the file
        mode: 'write' to overwrite, 'append' to add to existing content (default: 'write')

    Returns:
        Success or error message
    """

    root_dir: Optional[str] = Field(default=None)
    max_content_chars: int = Field(default=50000)

    # Allowed directory prefixes (relative to project root)
    allowed_prefixes: List[str] = Field(default_factory=lambda: [
        "memory/",
        "workspace/",
        "knowledge/",
    ])

    # Blocked sensitive files
    blocked_files: List[str] = Field(default_factory=lambda: [
        ".env",
        ".env.local",
        ".env.production",
        "credentials.json",
        "secrets.json",
        "api_keys.json",
        "private.key",
        "id_rsa",
    ])

    def __init__(self, **data):
        super().__init__(**data)
        if self.root_dir is None:
            self.root_dir = str(get_project_root())

    def _truncate_content(self, content: str) -> str:
        """Truncate content if too long."""
        if len(content) > self.max_content_chars:
            return content[:self.max_content_chars] + "\n\n...[content truncated]"
        return content

    def _is_path_allowed(self, relative_path: str) -> tuple:
        """
        Check if path is allowed for writing.

        Returns:
            (allowed: bool, reason: str)
        """
        # Normalize path
        relative_path = relative_path.replace("\\", "/")
        if relative_path.startswith("./"):
            relative_path = relative_path[2:]
        if relative_path.startswith("/"):
            relative_path = relative_path[1:]

        # Check for path traversal
        if ".." in relative_path:
            return False, "Path traversal not allowed"

        # Check for blocked files
        filename = Path(relative_path).name
        if filename in self.blocked_files:
            return False, f"Writing to '{filename}' is blocked for security"

        # Check allowed prefixes
        is_allowed = any(relative_path.startswith(prefix) for prefix in self.allowed_prefixes)

        if not is_allowed:
            allowed_dirs = ", ".join(self.allowed_prefixes)
            return False, f"Path must be in allowed directories: {allowed_dirs}"

        return True, "OK"

    def _run(
        self,
        path: str,
        content: str,
        mode: Literal["write", "append"] = "write",
        run_manager=None
    ) -> str:
        """Write to file with security checks."""
        try:
            project_root = Path(self.root_dir) if self.root_dir else get_project_root()

            # Normalize path
            relative_path = path.replace("\\", "/")
            if relative_path.startswith("./"):
                relative_path = relative_path[2:]

            # Security check
            allowed, reason = self._is_path_allowed(relative_path)
            if not allowed:
                return f"Error: {reason}"

            # Build full path
            file_path = project_root / relative_path

            # Resolve and verify within root
            try:
                resolved_path = file_path.resolve()
                resolved_root = project_root.resolve()

                if not str(resolved_path).startswith(str(resolved_root)):
                    return "Error: Access denied. Path is outside project root."
            except Exception as e:
                return f"Error: Invalid path: {str(e)}"

            # Truncate content if needed
            content = self._truncate_content(content)

            # Create parent directories if needed
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # Write or append
            try:
                if mode == "append":
                    # Read existing content if any
                    existing = ""
                    if file_path.exists():
                        with open(file_path, 'r', encoding='utf-8') as f:
                            existing = f.read()

                    # Append with separator if existing content
                    if existing and not existing.endswith("\n"):
                        content = "\n\n" + content

                    with open(file_path, 'a', encoding='utf-8') as f:
                        f.write(content)

                    return f"Successfully appended to {path}"
                else:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)

                    return f"Successfully wrote to {path}"

            except PermissionError:
                return f"Error: Permission denied writing to {path}"

            except Exception as e:
                return f"Error writing file: {str(e)}"

        except Exception as e:
            logger.error(f"Error in write_file tool: {str(e)}")
            return f"Error: {str(e)}"


def create_write_file_tool(root_dir: Optional[str] = None) -> SafeWriteFileTool:
    """
    Create a safe file writing tool.

    Args:
        root_dir: Restrict file access to this directory (defaults to project root)

    Returns:
        SafeWriteFileTool instance
    """
    if root_dir is None:
        root_dir = str(get_project_root())

    return SafeWriteFileTool(root_dir=root_dir)
