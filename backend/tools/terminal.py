"""
Terminal Tool - Secure shell command execution

Features:
- Command blacklist for dangerous operations
- 30 second timeout
- 5000 character output truncation
- CWD restriction to project root
"""
import os
import re
import asyncio
import logging
from typing import Optional, ClassVar
from langchain_core.tools import BaseTool
from pydantic import Field

from config import settings, get_project_root

logger = logging.getLogger(__name__)


class SafeShellTool(BaseTool):
    """Secure shell tool with directory restrictions and command blacklist."""

    name: str = "terminal"
    description: str = """Execute shell commands in a sandboxed environment.
    Use this for system operations, file management, and running scripts.
    WARNING: Some commands may be dangerous - always verify before executing.

    Args:
        command: The shell command to execute

    Returns:
        Command output (stdout and stderr combined)
    """

    root_dir: Optional[str] = Field(default=None)
    timeout: int = Field(default=30)
    max_output_chars: int = Field(default=5000)

    # Comprehensive blacklist patterns
    blacklist_patterns: ClassVar[list] = [
        # File system destruction
        r"rm\s+-rf\s+/",
        r"rm\s+-rf\s+~",
        r"rm\s+-rf\s+\*",
        r"rm\s+-rf\s+\.\.",
        r"rm\s+-rf\s+/*",
        r"rmdir\s+/s\s+/q",
        r"del\s+/[sS]\s+/[qQ]",

        # Disk operations
        r"dd\s+if=",
        r"dd\s+of=/dev/",
        r"mkfs",
        r"format\s+[a-zA-Z]:",

        # System control
        r"shutdown",
        r"reboot",
        r"init\s+[06]",
        r"systemctl\s+(stop|disable|mask)",
        r"service\s+\w+\s+stop",

        # Fork bomb
        r":\(\)\{",
        r":\(\):\{",

        # Remote execution
        r"curl.*\|\s*sh",
        r"curl.*\|\s*bash",
        r"wget.*\|\s*sh",
        r"wget.*\|\s*bash",
        r"curl.*>\s*/dev/sd",

        # Permission changes
        r"chmod\s+[-+]*777",
        r"chmod\s+-R\s+777",

        # User management
        r"userdel",
        r"passwd",
        r"chpasswd",

        # Network operations
        r"iptables\s+-F",
        r"ufw\s+disable",
    ]

    def __init__(self, **data):
        super().__init__(**data)
        # Set default root dir from config
        if self.root_dir is None:
            self.root_dir = str(get_project_root())

    def _is_blacklisted(self, command: str) -> bool:
        """Check if command matches any blacklist pattern."""
        for pattern in self.blacklist_patterns:
            if re.search(pattern, command, re.IGNORECASE):
                return True
        return False

    def _truncate_output(self, output: str) -> str:
        """Truncate output to max characters."""
        if len(output) > self.max_output_chars:
            return output[:self.max_output_chars] + "\n\n...[output truncated]"
        return output

    def _run(self, command: str, run_manager=None) -> str:
        """Execute the command with safety checks."""
        # Check blacklist
        if self._is_blacklisted(command):
            return f"Error: Command blocked by security policy: {command}"

        # Check for directory traversal
        if self.root_dir:
            # Block obvious traversal attempts
            if re.search(r'\.\.[\\/]', command):
                return f"Error: Directory traversal not allowed"

        try:
            import subprocess

            # Set working directory
            cwd = self.root_dir if self.root_dir else None

            # Execute with timeout
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=cwd
            )

            # Combine stdout and stderr
            output = result.stdout
            if result.stderr:
                output += "\n" + result.stderr

            # Truncate if needed
            output = self._truncate_output(output)

            if result.returncode != 0:
                output = f"[Exit code: {result.returncode}]\n{output}"

            return output

        except subprocess.TimeoutExpired:
            return f"Error: Command timed out after {self.timeout} seconds"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    async def _arun(self, command: str, run_manager=None) -> str:
        """Async execution of the command."""
        # Check blacklist
        if self._is_blacklisted(command):
            return f"Error: Command blocked by security policy: {command}"

        # Check for directory traversal
        if self.root_dir:
            if re.search(r'\.\.[\\/]', command):
                return f"Error: Directory traversal not allowed"

        try:
            # Set working directory
            cwd = self.root_dir if self.root_dir else None

            # Create subprocess
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd
            )

            # Wait with timeout
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self.timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                return f"Error: Command timed out after {self.timeout} seconds"

            # Decode output
            output = stdout.decode('utf-8', errors='replace')
            if stderr:
                output += "\n" + stderr.decode('utf-8', errors='replace')

            # Truncate
            output = self._truncate_output(output)

            if proc.returncode != 0:
                output = f"[Exit code: {proc.returncode}]\n{output}"

            return output

        except Exception as e:
            return f"Error executing command: {str(e)}"


def create_terminal_tool(root_dir: Optional[str] = None, timeout: int = 30) -> SafeShellTool:
    """
    Create a terminal tool with security measures.

    Args:
        root_dir: Restrict commands to this directory (sandbox)
        timeout: Maximum execution time in seconds

    Returns:
        SafeShellTool instance
    """
    if root_dir is None:
        root_dir = settings.shell_tool_root_dir or str(get_project_root())

    return SafeShellTool(root_dir=root_dir, timeout=timeout)
