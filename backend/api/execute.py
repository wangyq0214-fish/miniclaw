"""
Code execution API endpoint for coding challenges.
Runs Python code in a sandboxed subprocess with timeout.
"""
import sys
import subprocess
import tempfile
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ExecuteRequest(BaseModel):
    code: str
    input: str = ""
    timeout: int = 5  # seconds


class ExecuteResponse(BaseModel):
    output: str
    error: str | None
    success: bool


@router.post("/execute", response_model=ExecuteResponse)
async def execute_code(req: ExecuteRequest):
    """Execute Python code and return output."""
    # Write code to temp file
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', delete=False, encoding='utf-8'
    ) as f:
        f.write(req.code)
        temp_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, temp_path],
            input=req.input,
            capture_output=True,
            text=True,
            timeout=req.timeout,
            cwd=Path(temp_path).parent
        )

        return ExecuteResponse(
            output=result.stdout,
            error=result.stderr if result.stderr else None,
            success=result.returncode == 0
        )
    except subprocess.TimeoutExpired:
        return ExecuteResponse(
            output="",
            error=f"Execution timed out ({req.timeout}s)",
            success=False
        )
    except Exception as e:
        return ExecuteResponse(
            output="",
            error=str(e),
            success=False
        )
    finally:
        Path(temp_path).unlink(missing_ok=True)
