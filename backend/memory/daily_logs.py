"""
Daily Logs Manager - Automatic daily logging for Agent interactions

Features:
- Auto-creates log file per day (memory/logs/YYYY-MM-DD.md)
- Append-only logging for each interaction
- Structured format with timestamps
"""
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging

from config import get_memory_dir

logger = logging.getLogger(__name__)


class DailyLogsManager:
    """
    Manages daily log files for Agent interactions.

    Log files are stored in memory/logs/ directory with format:
    - Filename: YYYY-MM-DD.md
    - Format: Markdown with timestamps and structured sections
    """

    def __init__(self, memory_dir: Optional[Path] = None):
        self.memory_dir = Path(memory_dir) if memory_dir else get_memory_dir()
        self.logs_dir = self.memory_dir / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def _get_log_path(self, date: Optional[datetime] = None) -> Path:
        """Get the log file path for a specific date."""
        if date is None:
            date = datetime.now()
        filename = date.strftime("%Y-%m-%d.md")
        return self.logs_dir / filename

    def _format_tool_calls(self, tool_calls: Optional[List[Dict]]) -> str:
        """Format tool calls for logging."""
        if not tool_calls:
            return ""

        lines = ["#### 工具调用"]
        for tc in tool_calls:
            tool_name = tc.get("tool", "unknown")
            tool_input = tc.get("input", {})
            tool_output = tc.get("output", "")

            # Truncate long output
            if len(str(tool_output)) > 500:
                tool_output = str(tool_output)[:500] + "...[truncated]"

            lines.append(f"- **{tool_name}**")
            if tool_input:
                lines.append(f"  - 输入: `{tool_input}`")
            lines.append(f"  - 输出: {tool_output}")

        return "\n".join(lines)

    def log_interaction(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
        tool_calls: Optional[List[Dict]] = None,
        retrieval_results: Optional[List[Dict]] = None
    ) -> bool:
        """
        Log an interaction to the daily log file.

        Args:
            session_id: Session identifier
            user_message: User's message
            assistant_message: Assistant's response
            tool_calls: List of tool call records
            retrieval_results: RAG retrieval results (if any)

        Returns:
            True if logged successfully
        """
        try:
            log_path = self._get_log_path()
            timestamp = datetime.now().strftime("%H:%M:%S")

            # Build log entry
            lines = [
                "",
                f"### [{timestamp}] 会话: {session_id}",
                "",
                "**用户**:",
                f"> {user_message}",
                ""
            ]

            # Add retrieval results if present
            if retrieval_results:
                lines.append("**记忆检索**:")
                for r in retrieval_results[:3]:  # Limit to top 3
                    score = r.get("score", 0)
                    text = r.get("text", "")[:200]
                    lines.append(f"- ({score:.2f}) {text}...")
                lines.append("")

            # Add assistant response
            lines.append("**助手**:")
            lines.append(assistant_message)

            # Add tool calls if present
            if tool_calls:
                lines.append("")
                lines.append(self._format_tool_calls(tool_calls))

            lines.append("")
            lines.append("---")  # Separator

            # Append to log file
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write("\n".join(lines))

            logger.debug(f"Logged interaction to {log_path}")
            return True

        except Exception as e:
            logger.error(f"Error logging interaction: {str(e)}")
            return False

    def log_event(
        self,
        event_type: str,
        message: str,
        session_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Log a system event.

        Args:
            event_type: Type of event (e.g., 'session_start', 'session_end', 'error')
            message: Event message
            session_id: Optional session identifier
            details: Optional additional details

        Returns:
            True if logged successfully
        """
        try:
            log_path = self._get_log_path()
            timestamp = datetime.now().strftime("%H:%M:%S")

            lines = [
                "",
                f"### [{timestamp}] 事件: {event_type}",
            ]

            if session_id:
                lines.append(f"会话: {session_id}")

            lines.append(f"消息: {message}")

            if details:
                lines.append("详情:")
                for key, value in details.items():
                    lines.append(f"  - {key}: {value}")

            lines.append("---")

            with open(log_path, 'a', encoding='utf-8') as f:
                f.write("\n".join(lines))

            return True

        except Exception as e:
            logger.error(f"Error logging event: {str(e)}")
            return False

    def get_log_content(self, date: Optional[datetime] = None) -> str:
        """
        Get the content of a log file for a specific date.

        Args:
            date: Date to get log for (default: today)

        Returns:
            Log file content or empty string if not found
        """
        log_path = self._get_log_path(date)

        if not log_path.exists():
            return ""

        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading log: {str(e)}")
            return ""

    def list_logs(self, limit: int = 30) -> List[Dict[str, Any]]:
        """
        List available log files.

        Args:
            limit: Maximum number of logs to return

        Returns:
            List of log file info dicts
        """
        logs = []

        try:
            for log_file in sorted(self.logs_dir.glob("*.md"), reverse=True)[:limit]:
                # Parse date from filename
                date_str = log_file.stem
                try:
                    date = datetime.strptime(date_str, "%Y-%m-%d")
                    logs.append({
                        "date": date_str,
                        "path": str(log_file.relative_to(self.memory_dir)),
                        "size": log_file.stat().st_size
                    })
                except ValueError:
                    continue
        except Exception as e:
            logger.error(f"Error listing logs: {str(e)}")

        return logs

    def initialize_daily_log(self, date: Optional[datetime] = None) -> bool:
        """
        Initialize a new daily log file with header.

        Args:
            date: Date for the log (default: today)

        Returns:
            True if initialized successfully
        """
        log_path = self._get_log_path(date)

        if log_path.exists():
            return True

        try:
            date_str = (date or datetime.now()).strftime("%Y年%m月%d日")
            weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
            weekday_str = weekday[(date or datetime.now()).weekday()]

            header = f"""# Mini-OpenClaw 每日日志

日期: {date_str} ({weekday_str})

---

"""
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write(header)

            logger.info(f"Created daily log: {log_path}")
            return True

        except Exception as e:
            logger.error(f"Error initializing daily log: {str(e)}")
            return False


# Global instance
daily_logs_manager = DailyLogsManager()
