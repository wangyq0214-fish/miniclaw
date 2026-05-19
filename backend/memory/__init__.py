"""
Memory Management System

Provides:
- SystemPromptBuilder: Assembles system prompt from multiple markdown files
- SessionManager: Handles conversation session persistence
- MemoryManager: Manages long-term MEMORY.md storage
"""
import os
import json
import logging
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

from config import get_memory_dir, get_sessions_dir, get_workspace_dir, get_project_root, settings

logger = logging.getLogger(__name__)


class SystemPromptBuilder:
    """Builds the system prompt by concatenating multiple components."""

    MAX_TOKENS = 8000
    MAX_FILE_CHARS = 20000

    def __init__(self):
        self.workspace_dir = get_workspace_dir()
        self.project_root = get_project_root()

    def _read_file(self, filepath: Path) -> str:
        """Read a file with truncation support."""
        if not filepath.exists():
            return ""

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Truncate if too long
            if len(content) > self.MAX_FILE_CHARS:
                content = content[:self.MAX_FILE_CHARS] + "\n\n...[truncated]"

            return content
        except Exception as e:
            logger.error(f"Error reading {filepath}: {str(e)}")
            return ""

    def build(self, rag_mode: bool = False) -> str:
        """
        Build the complete system prompt by concatenating:
        1. SOUL.md (core identity)
        2. IDENTITY.md (self-awareness)
        3. USER.md (user profile)
        4. AGENTS.md (behavior guidelines)
        5. MEMORY.md (long-term memory, skipped in RAG mode)

        Note: Skills are injected by deepagents SkillsMiddleware at runtime.

        Args:
            rag_mode: If True, skip MEMORY.md and add RAG guidance
        """
        components = []

        # 0. Current date — agent 必须知道真实日期，否则会写错文件名
        today = datetime.now().strftime("%Y-%m-%d")
        components.append(f"<!-- Current Date -->\n当前日期: {today}。所有需要日期的文件名和内容必须使用此日期，禁止编造其他日期。")

        # 1. Skills Snapshot — skills 由 deepagents SkillsMiddleware 在运行时注入 system prompt，
        # SystemPromptBuilder 不再重复注入，避免干扰 agent 的 progressive disclosure 机制。

        # 2. SOUL.md - Core identity
        soul = self._read_file(self.workspace_dir / "SOUL.md")
        if soul:
            components.append(f"<!-- Soul -->\n{soul}")

        # 3. IDENTITY.md - Self-awareness
        identity = self._read_file(self.workspace_dir / "IDENTITY.md")
        if identity:
            components.append(f"<!-- Identity -->\n{identity}")

        # 4. USER.md - User profile
        user = self._read_file(self.workspace_dir / "USER.md")
        if user:
            components.append(f"<!-- User Profile -->\n{user}")

        # 5. AGENTS.md - Behavior guidelines
        agents = self._read_file(self.workspace_dir / "AGENTS.md")
        if agents:
            components.append(f"<!-- Agents Guide -->\n{agents}")

        # 6. MEMORY.md - Long-term memory (skipped in RAG mode)
        if rag_mode:
            components.append("<!-- Long-term Memory -->\n[记忆检索已启用。相关记忆将通过检索动态注入。]")
        else:
            memory = self._read_file(self.workspace_dir.parent / "memory" / "MEMORY.md")
            if memory:
                components.append(f"<!-- Long-term Memory -->\n{memory}")

        return "\n\n".join(components)


class SessionManager:
    """Manages conversation sessions with JSON file persistence."""

    def __init__(self, sessions_dir: Optional[str] = None):
        self.sessions_dir = Path(sessions_dir) if sessions_dir else get_sessions_dir()
        self.archive_dir = self.sessions_dir / "archive"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

    def _get_session_path(self, session_id: str) -> Path:
        """Get the path for a session file."""
        # Sanitize session_id
        safe_id = "".join(c for c in session_id if c.isalnum() or c in "-_")
        return self.sessions_dir / f"{safe_id}.json"

    def _read_file(self, session_path: Path) -> Dict[str, Any]:
        """Read session file with v1 format migration."""
        if not session_path.exists():
            return {}

        try:
            with open(session_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # v1 format migration: array-only format
            if isinstance(data, list):
                logger.info(f"Migrating v1 session format: {session_path.name}")
                data = {
                    "title": session_path.stem,
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "messages": data
                }
                # Save migrated format
                with open(session_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

            return data
        except Exception as e:
            logger.error(f"Error reading session {session_path}: {str(e)}")
            return {}

    def create_session(self, session_id: str, title: str = None) -> Dict[str, Any]:
        """Create a new session."""
        session_path = self._get_session_path(session_id)

        session = {
            "session_id": session_id,
            "title": title or session_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "compressed_context": "",
            "messages": []
        }

        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(session, f, ensure_ascii=False, indent=2)

        return session

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a session by ID."""
        session_path = self._get_session_path(session_id)

        if not session_path.exists():
            return None

        return self._read_file(session_path)

    def get_or_create_session(self, session_id: str) -> Dict[str, Any]:
        """Get or create a session."""
        session = self.get_session(session_id)
        if session is None:
            session = self.create_session(session_id)
        return session

    def load_session(self, session_id: str) -> List[Dict]:
        """
        Load raw message array from session.

        Args:
            session_id: Session identifier

        Returns:
            List of message dicts
        """
        session = self.get_session(session_id)
        if session is None:
            return []
        return session.get("messages", [])

    def load_session_for_agent(self, session_id: str) -> List[Dict]:
        """
        Load session messages optimized for LLM consumption.

        - Merges consecutive assistant messages (LLM requires strict alternation)
        - Injects compressed_context as virtual assistant message

        Args:
            session_id: Session identifier

        Returns:
            Optimized list of message dicts
        """
        session = self.get_session(session_id)
        if session is None:
            return []

        messages = session.get("messages", [])
        compressed_context = session.get("compressed_context", "")

        # Build optimized message list
        optimized = []
        prev_role = None

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")

            # Merge consecutive assistant messages
            if role == "assistant" and prev_role == "assistant":
                if optimized:
                    # Append to previous assistant message
                    optimized[-1]["content"] += "\n" + content
                    # Merge tool_calls if present
                    if "tool_calls" in msg:
                        if "tool_calls" not in optimized[-1]:
                            optimized[-1]["tool_calls"] = []
                        optimized[-1]["tool_calls"].extend(msg["tool_calls"])
            else:
                optimized.append(msg.copy())

            prev_role = role

        # Inject compressed context at head
        if compressed_context:
            optimized.insert(0, {
                "role": "assistant",
                "content": f"[以下是之前对话的摘要]\n{compressed_context}"
            })

        return optimized

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """Add a message to a session."""
        session = self.get_or_create_session(session_id)

        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }

        if tool_calls:
            message["tool_calls"] = tool_calls

        session["messages"].append(message)
        session["updated_at"] = datetime.now().isoformat()

        # Save session
        session_path = self._get_session_path(session_id)
        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(session, f, ensure_ascii=False, indent=2)

        return session

    def update_title(self, session_id: str, title: str) -> bool:
        """Update session title."""
        session = self.get_session(session_id)
        if session is None:
            return False

        session["title"] = title
        session["updated_at"] = datetime.now().isoformat()

        session_path = self._get_session_path(session_id)
        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(session, f, ensure_ascii=False, indent=2)

        return True

    def compress_history(self, session_id: str, summary: str, n: int) -> Dict[str, Any]:
        """
        Archive first N messages and write summary.

        Args:
            session_id: Session identifier
            summary: Generated summary text
            n: Number of messages to archive

        Returns:
            Updated session dict
        """
        session = self.get_session(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found")

        messages = session.get("messages", [])
        if len(messages) < n:
            raise ValueError(f"Not enough messages to archive: {len(messages)} < {n}")

        # Archive messages
        archived = messages[:n]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_filename = f"{session_id}_{timestamp}.json"
        archive_path = self.archive_dir / archive_filename

        with open(archive_path, 'w', encoding='utf-8') as f:
            json.dump({
                "session_id": session_id,
                "archived_at": datetime.now().isoformat(),
                "message_count": len(archived),
                "messages": archived
            }, f, ensure_ascii=False, indent=2)

        logger.info(f"Archived {len(archived)} messages to {archive_path}")

        # Update session
        session["messages"] = messages[n:]
        session["updated_at"] = datetime.now().isoformat()

        # Append to compressed_context (multiple compressions separated by ---)
        existing_context = session.get("compressed_context", "")
        if existing_context:
            session["compressed_context"] = existing_context + "\n\n---\n\n" + summary
        else:
            session["compressed_context"] = summary

        # Save session
        session_path = self._get_session_path(session_id)
        with open(session_path, 'w', encoding='utf-8') as f:
            json.dump(session, f, ensure_ascii=False, indent=2)

        return session

    def get_compressed_context(self, session_id: str) -> str:
        """Get the compressed context for a session."""
        session = self.get_session(session_id)
        if session is None:
            return ""
        return session.get("compressed_context", "")

    def list_sessions(self) -> List[Dict[str, Any]]:
        """List all sessions."""
        sessions = []

        for session_file in self.sessions_dir.glob("*.json"):
            try:
                session = self._read_file(session_file)
                sessions.append({
                    "session_id": session.get("session_id", session_file.stem),
                    "title": session.get("title", session_file.stem),
                    "created_at": session.get("created_at", ""),
                    "updated_at": session.get("updated_at", ""),
                    "message_count": len(session.get("messages", []))
                })
            except Exception as e:
                logger.error(f"Error loading session {session_file}: {str(e)}")

        # Sort by updated_at descending
        sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

        return sessions

    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        session_path = self._get_session_path(session_id)

        if session_path.exists():
            session_path.unlink()
            return True

        return False


class MemoryManager:
    """Manages long-term memory (MEMORY.md)."""

    def __init__(self, memory_dir: Optional[str] = None):
        self.memory_dir = Path(memory_dir) if memory_dir else get_memory_dir()
        self.memory_dir.mkdir(parents=True, exist_ok=True)

    @property
    def memory_file(self) -> Path:
        return self.memory_dir / "MEMORY.md"

    def read_memory(self) -> str:
        """Read the current memory content."""
        if not self.memory_file.exists():
            return ""

        try:
            with open(self.memory_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading memory: {str(e)}")
            return ""

    def write_memory(self, content: str) -> bool:
        """Write to the memory file."""
        try:
            with open(self.memory_file, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            logger.error(f"Error writing memory: {str(e)}")
            return False

    def append_memory(self, content: str) -> bool:
        """Append content to memory."""
        current = self.read_memory()
        new_content = current + "\n\n" + content
        return self.write_memory(new_content)


# Create default instances
system_prompt_builder = SystemPromptBuilder()
session_manager = SessionManager()
memory_manager = MemoryManager()

# Import Daily Logs Manager
from .daily_logs import DailyLogsManager, daily_logs_manager

# Import Redis and Hybrid Session Managers
from .redis_session import RedisSessionManager
from .hybrid_session import HybridSessionManager

__all__ = [
    "SystemPromptBuilder",
    "SessionManager",
    "MemoryManager",
    "DailyLogsManager",
    "RedisSessionManager",
    "HybridSessionManager",
    "system_prompt_builder",
    "session_manager",
    "memory_manager",
    "daily_logs_manager",
]
