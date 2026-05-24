"""Shell execute tool with virtual path resolution.

Provides an `execute` tool that resolves virtual paths (e.g. /skills/...)
to physical paths before running shell commands. This allows the agent to
execute scripts referenced via virtual paths from the skills system.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Optional

from langchain_core.tools import tool


def create_execute_tool(path_mappings: list[tuple[str, str]] | None = None, cwd: str | None = None):
    """Create an execute tool with virtual path resolution.

    Args:
        path_mappings: List of (virtual_prefix, physical_root) tuples.
            Virtual paths in commands are replaced with physical paths.
        cwd: Working directory for shell commands. Defaults to os.getcwd().

    Returns:
        A LangChain tool for executing shell commands.
    """
    # Build mapping list sorted by prefix length (longest first)
    mappings: list[tuple[str, str]] = []
    if path_mappings:
        mappings = sorted(path_mappings, key=lambda x: len(x[0]), reverse=True)
    _cwd = cwd or os.getcwd()

    def _resolve_paths(command: str) -> str:
        """Replace virtual paths in command with physical paths.

        Handles paths in shell commands AND inside Python strings
        (e.g. exec(open('/workspace/...').read())).
        """
        if not mappings:
            return command

        # Path chars: word chars, /, ., -, + (stops at quotes, parens, spaces)
        PATH_CHARS = r"[\w/\.\-+]"

        def _replace(match: re.Match) -> str:
            full = match.group(0)
            # Detect surrounding quotes so we can preserve them
            leading_q = ""
            trailing_q = ""
            vpath = full
            if vpath and vpath[0] in "\"'`":
                leading_q = vpath[0]
                vpath = vpath[1:]
            if vpath and vpath[-1] in "\"'`":
                trailing_q = vpath[-1]
                vpath = vpath[:-1]

            for virt_prefix, phys_root in mappings:
                vp = virt_prefix.rstrip("/")
                if vpath == vp or vpath.startswith(vp + "/"):
                    relative_part = vpath[len(vp):]
                    if relative_part:
                        physical = phys_root.rstrip("/\\") + "/" + relative_part.lstrip("/")
                    else:
                        physical = phys_root
                    return leading_q + physical.replace("\\", "/") + trailing_q
            return full

        prefixes = [p.rstrip("/").lstrip("/") for p, _ in mappings if p.startswith("/")]
        if not prefixes:
            return command
        # Match optional-quote + /prefix/path + optional-quote
        # Negative lookbehind prevents matching /workspace/ inside D:/.../1/workspace/
        Q = r"[\"'`]"
        prefix_alt = "|".join(re.escape(p) for p in prefixes)
        pattern = r"(?<!\w)" + Q + r"?/(?:" + prefix_alt + r")(?:" + PATH_CHARS + r"+)?" + Q + r"?"
        return re.sub(pattern, _replace, command)

    def _ensure_dir(path: str):
        """Ensure the parent directory of a path exists."""
        d = os.path.dirname(path)
        if d and not os.path.exists(d):
            os.makedirs(d, exist_ok=True)

    @tool
    def execute(command: str, timeout: Optional[int] = 120) -> str:
        """Execute a shell command. Use this to run Python scripts, install packages, or perform system operations.

        Virtual paths like /skills/... and /workspace/... are automatically resolved to physical paths.

        Args:
            command: Shell command to execute.
            timeout: Timeout in seconds (default 120).

        Returns:
            Combined stdout and stderr output.
        """
        resolved = _resolve_paths(command)

        # Ensure output directories exist for resolved file paths
        for ext in (".py", ".pptx", ".md", ".json"):
            for m in re.finditer(r"['\"]([A-Za-z]:[^'\"]+" + re.escape(ext) + r")['\"]", resolved):
                _ensure_dir(m.group(1))

        try:
            result = subprocess.run(
                resolved,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=_cwd,
            )
            output_parts = []
            if result.stdout:
                output_parts.append(result.stdout)
            if result.stderr:
                output_parts.append(f"[stderr] {result.stderr.strip()}")
            output = "\n".join(output_parts) if output_parts else "<no output>"
            if result.returncode != 0:
                output = f"{output.rstrip()}\nExit code: {result.returncode}"
            # Truncate very long output
            if len(output) > 50000:
                output = output[:50000] + "\n... (truncated)"
            return output
        except subprocess.TimeoutExpired:
            return f"Error: Command timed out after {timeout} seconds."
        except Exception as e:
            return f"Error executing command: {e}"

    return execute
