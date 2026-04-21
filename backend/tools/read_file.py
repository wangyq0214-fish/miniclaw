"""
File Reader Tool - Safe File Access

Features:
- 10000 character output truncation
- Path traversal protection
- Directory whitelist
- Sensitive file blocking
- Encoding fallback
"""
from pathlib import Path
from typing import Optional, List
from langchain_core.tools import BaseTool
from pydantic import Field
from config import settings, get_project_root
import logging

logger = logging.getLogger(__name__)


class SafeReadFileTool(BaseTool):
    """Safe file reading tool with root directory restriction."""

    name: str = "read_file"
    description: str = """Read the contents of a file from the local filesystem.
    Use this to read configuration files, skill definitions, memory files, etc.
    The tool is restricted to allowed directories for security.

    Args:
        path: Relative path to the file (e.g., 'memory/MEMORY.md', 'skills/get-weather/SKILL.md')

    Returns:
        File contents as string
    """

    root_dir: Optional[str] = Field(default=None)
    max_output_chars: int = Field(default=10000)

    # Allowed directory prefixes (relative to project root)
    allowed_prefixes: List[str] = Field(default_factory=lambda: [
        "workspace/",
        "memory/",
        "skills/",
        "knowledge/",
        "sessions/",
    ])

    # Sensitive files to block
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

    def _truncate_output(self, output: str) -> str:
        """Truncate output to max characters."""
        if len(output) > self.max_output_chars:
            return output[:self.max_output_chars] + "\n\n...[content truncated]"
        return output

    def _is_path_allowed(self, relative_path: str) -> tuple:
        """
        Check if path is allowed.

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
            return False, f"Access to '{filename}' is blocked for security"

        # Check allowed prefixes
        is_allowed = any(relative_path.startswith(prefix) for prefix in self.allowed_prefixes)

        if not is_allowed:
            allowed_dirs = ", ".join(self.allowed_prefixes)
            return False, f"Path must be in allowed directories: {allowed_dirs}"

        return True, "OK"

    def _run(self, path: str, run_manager=None) -> str:
        """Read file contents with security checks."""
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

            # Check if file exists
            if not resolved_path.exists():
                return f"Error: File not found: {path}"

            if not resolved_path.is_file():
                return f"Error: '{path}' is not a file"

            # Read file
            try:
                with open(resolved_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Truncate if needed
                content = self._truncate_output(content)

                return content

            except UnicodeDecodeError:
                # Fallback encoding
                try:
                    with open(resolved_path, 'r', encoding='latin-1') as f:
                        content = f.read()

                    content = self._truncate_output(content)
                    return content

                except Exception as e:
                    return f"Error: Cannot read file (encoding issue): {str(e)}"

            except PermissionError:
                return f"Error: Permission denied reading file: {path}"

            except Exception as e:
                return f"Error reading file: {str(e)}"

        except Exception as e:
            logger.error(f"Error in read_file tool: {str(e)}")
            return f"Error: {str(e)}"


def create_read_file_tool(root_dir: Optional[str] = None) -> SafeReadFileTool:
    """
    Create a safe file reading tool.

    Args:
        root_dir: Restrict file access to this directory (defaults to project root)

    Returns:
        SafeReadFileTool instance
    """
    if root_dir is None:
        root_dir = str(get_project_root())

    return SafeReadFileTool(root_dir=root_dir)
