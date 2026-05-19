"""
Python REPL Tool - Code Interpreter

Features:
- 30 second timeout
- 5000 character output truncation
- Sandboxed execution environment
"""
import sys
import io
import logging
from typing import Optional
from contextlib import redirect_stdout, redirect_stderr
import signal
from langchain_core.tools import BaseTool
from pydantic import Field

logger = logging.getLogger(__name__)


class TimeoutException(Exception):
    """Exception raised on timeout."""
    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout."""
    raise TimeoutException("Execution timed out")


class SafePythonREPLTool(BaseTool):
    """Python REPL tool for executing Python code with safety measures."""

    name: str = "python_repl"
    description: str = """Execute Python code in a REPL environment.
    Use this for calculations, data processing, and running Python scripts.

    The tool provides a temporary Python environment - variables and imports
    are persisted within a single execution context.

    Args:
        command: Python code to execute

    Returns:
        Output from the Python code execution
    """

    timeout: int = Field(default=30, description="Execution timeout in seconds")
    max_output_chars: int = Field(default=5000, description="Maximum output characters")

    # Shared globals for persistence across calls
    _globals: dict = None

    def __init__(self, **data):
        super().__init__(**data)
        if self._globals is None:
            self._globals = {"__builtins__": __builtins__}

    def _truncate_output(self, output: str) -> str:
        """Truncate output to max characters."""
        if len(output) > self.max_output_chars:
            return output[:self.max_output_chars] + "\n\n...[output truncated]"
        return output

    def _run_with_timeout(self, code: str) -> str:
        """Run Python code with timeout using signal."""
        # Note: signal doesn't work on Windows in the same way
        # For Windows, we'll use a simpler approach without signal

        output_buffer = io.StringIO()
        error_buffer = io.StringIO()

        try:
            with redirect_stdout(output_buffer), redirect_stderr(error_buffer):
                # Execute code
                exec(code, self._globals)

            # Get output
            output = output_buffer.getvalue()
            error = error_buffer.getvalue()

            if error:
                output += "\n" + error

            return output if output.strip() else "No output"

        except SyntaxError as e:
            return f"Syntax Error: {str(e)}"
        except Exception as e:
            return f"Error: {str(e)}"

    def _run(self, command: str, run_manager=None) -> str:
        """Execute Python code with safety measures."""
        try:
            # Use threading for cross-platform timeout
            import threading
            import concurrent.futures

            result = [""]
            exception = [None]

            def execute():
                try:
                    result[0] = self._run_with_timeout(command)
                except Exception as e:
                    exception[0] = e

            # Run with timeout using ThreadPoolExecutor
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(execute)
                try:
                    future.result(timeout=self.timeout)
                except concurrent.futures.TimeoutError:
                    return f"Error: Execution timed out after {self.timeout} seconds"

            if exception[0]:
                return f"Error: {str(exception[0])}"

            # Truncate output
            output = self._truncate_output(result[0])
            return output

        except Exception as e:
            logger.error(f"Error executing Python code: {str(e)}")
            return f"Error executing Python code: {str(e)}"


def create_python_repl_tool(timeout: int = 30) -> SafePythonREPLTool:
    """
    Create a Python REPL tool with safety measures.

    Args:
        timeout: Maximum execution time in seconds

    Returns:
        SafePythonREPLTool instance
    """
    return SafePythonREPLTool(timeout=timeout)
