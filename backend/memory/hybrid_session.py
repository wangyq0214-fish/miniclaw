"""
Hybrid Session Manager - 混合存储策略
Redis (热数据) + PostgreSQL (持久化) + JSON (归档)
"""
import json
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from .redis_session import RedisSessionManager
from models.complete_models import ConversationSession, Message, User, SessionStatus, MessageRole

logger = logging.getLogger(__name__)


class HybridSessionManager:
    """混合会话管理器 - Redis + PostgreSQL + JSON"""

    def __init__(
        self,
        redis_manager: RedisSessionManager,
        db_session: AsyncSession,
        archive_dir: Optional[Path] = None,
        user_id: Optional[int] = None
    ):
        """
        初始化混合会话管理器

        Args:
            redis_manager: Redis 会话管理器
            db_session: 数据库会话
            archive_dir: JSON 归档目录（如果为 None，将根据 user_id 自动确定）
            user_id: 用户 ID（用于 JuiceFS 用户隔离）
        """
        self.redis = redis_manager
        self.db = db_session
        self.user_id = user_id

        # 如果提供了 archive_dir，使用它；否则根据 user_id 确定路径
        if archive_dir:
            self.archive_dir = archive_dir
        elif user_id is not None:
            from config import get_user_sessions_dir
            self.archive_dir = get_user_sessions_dir(user_id)
        else:
            self.archive_dir = Path("data/sessions_archive")

        self.archive_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"HybridSessionManager initialized (user_id={user_id}, archive_dir={self.archive_dir})")

    async def create_session(
        self,
        session_id: str,
        user_id: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        创建新会话 (双写: Redis + PostgreSQL)

        Args:
            session_id: 会话ID
            user_id: 用户ID
            metadata: 会话元数据

        Returns:
            是否创建成功
        """
        try:
            # 1. 写入 Redis (立即)
            redis_success = await self.redis.create_session(
                session_id=session_id,
                user_id=user_id,
                metadata=metadata
            )

            if not redis_success:
                logger.error(f"Failed to create session in Redis: {session_id}")
                return False

            # 2. 写入 PostgreSQL (异步)
            db_session = ConversationSession(
                session_id=session_id,
                user_id=user_id,
                title=metadata.get("title", "新对话") if metadata else "新对话",
                status=SessionStatus.ACTIVE,
                tags=metadata.get("tags") if metadata else None,
                related_resources=metadata.get("related_resources") if metadata else None
            )
            self.db.add(db_session)
            await self.db.commit()

            logger.info(f"Created session {session_id} in both Redis and PostgreSQL")
            return True

        except Exception as e:
            logger.error(f"Error creating session {session_id}: {str(e)}")
            await self.db.rollback()
            # 回滚 Redis
            await self.redis.delete_session(session_id, user_id)
            return False

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        添加消息 (双写: Redis + PostgreSQL)

        Args:
            session_id: 会话ID
            role: 消息角色
            content: 消息内容
            metadata: 消息元数据

        Returns:
            是否添加成功
        """
        try:
            # 1. 写入 Redis (立即)
            redis_success = await self.redis.add_message(
                session_id=session_id,
                role=role,
                content=content,
                metadata=metadata
            )

            if not redis_success:
                logger.error(f"Failed to add message to Redis: {session_id}")
                return False

            # 2. 获取会话的数据库ID
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await self.db.execute(stmt)
            db_session_obj = result.scalar_one_or_none()

            if not db_session_obj:
                logger.error(f"Session not found in database: {session_id}")
                return False

            # 3. 写入 PostgreSQL (异步)
            # 转换 role 字符串为枚举
            role_enum = MessageRole.USER if role == "user" else (
                MessageRole.ASSISTANT if role == "assistant" else MessageRole.SYSTEM
            )

            db_message = Message(
                session_id=db_session_obj.id,  # 使用数据库ID，不是session_id字符串
                role=role_enum,
                content=content,
                message_metadata=metadata or {}
            )
            self.db.add(db_message)

            # 4. 更新会话的最后消息时间
            db_session_obj.updated_at = datetime.utcnow()
            db_session_obj.last_message_at = datetime.utcnow()
            db_session_obj.message_count = (db_session_obj.message_count or 0) + 1

            await self.db.commit()

            logger.debug(f"Added message to session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error adding message to session {session_id}: {str(e)}")
            await self.db.rollback()
            return False

    async def get_messages(
        self,
        session_id: str,
        limit: Optional[int] = None,
        offset: int = 0,
        from_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        获取会话消息 (优先从 Redis 读取)

        Args:
            session_id: 会话ID
            limit: 返回消息数量限制
            offset: 偏移量
            from_cache: 是否优先从缓存读取

        Returns:
            消息列表
        """
        try:
            # 1. 优先从 Redis 读取
            if from_cache:
                messages = await self.redis.get_messages(
                    session_id=session_id,
                    limit=limit,
                    offset=offset
                )
                if messages:
                    logger.debug(f"Retrieved {len(messages)} messages from Redis")
                    return messages

            # 2. Redis 未命中，从 PostgreSQL 读取
            logger.debug(f"Cache miss, reading from PostgreSQL: {session_id}")

            # 先获取会话的数据库ID
            session_stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            session_result = await self.db.execute(session_stmt)
            db_session_obj = session_result.scalar_one_or_none()

            if not db_session_obj:
                logger.warning(f"Session not found: {session_id}")
                return []

            # 使用数据库ID查询消息
            stmt = select(Message).where(
                Message.session_id == db_session_obj.id
            ).order_by(Message.created_at.asc())

            if limit:
                stmt = stmt.limit(limit).offset(offset)

            result = await self.db.execute(stmt)
            db_messages = result.scalars().all()

            # 转换为字典格式
            messages = [
                {
                    "role": msg.role.value if hasattr(msg.role, 'value') else msg.role,
                    "content": msg.content,
                    "timestamp": msg.created_at.isoformat(),
                    "metadata": msg.message_metadata or {}
                }
                for msg in db_messages
            ]

            return messages

        except Exception as e:
            logger.error(f"Error getting messages for session {session_id}: {str(e)}")
            return []

    async def get_session(
        self,
        session_id: str,
        from_cache: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        获取会话数据 (优先从 Redis 读取)

        Args:
            session_id: 会话ID
            from_cache: 是否优先从缓存读取

        Returns:
            会话数据字典
        """
        try:
            # 1. 优先从 Redis 读取
            if from_cache:
                session = await self.redis.get_session(session_id)
                if session:
                    return session

            # 2. Redis 未命中，从 PostgreSQL 读取
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await self.db.execute(stmt)
            db_session = result.scalar_one_or_none()

            if not db_session:
                return None

            # 转换为字典格式
            session_data = {
                "session_id": db_session.session_id,
                "user_id": db_session.user_id,
                "title": db_session.title,
                "status": db_session.status.value if hasattr(db_session.status, 'value') else db_session.status,
                "created_at": db_session.created_at.isoformat(),
                "updated_at": db_session.updated_at.isoformat() if db_session.updated_at else None,
                "metadata": {
                    "tags": db_session.tags,
                    "related_resources": db_session.related_resources
                }
            }

            return session_data

        except Exception as e:
            logger.error(f"Error getting session {session_id}: {str(e)}")
            return None

    async def update_session_metadata(
        self,
        session_id: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        更新会话元数据 (双写: Redis + PostgreSQL)

        Args:
            session_id: 会话ID
            metadata: 新的元数据

        Returns:
            是否更新成功
        """
        try:
            # 1. 更新 Redis
            await self.redis.update_metadata(session_id, metadata)

            # 2. 更新 PostgreSQL
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await self.db.execute(stmt)
            db_session = result.scalar_one_or_none()

            if db_session:
                db_session.title = metadata.get("title", db_session.title)
                db_session.tags = metadata.get("tags", db_session.tags)
                db_session.related_resources = metadata.get("related_resources", db_session.related_resources)
                db_session.updated_at = datetime.utcnow()
                await self.db.commit()

            logger.info(f"Updated metadata for session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error updating metadata for session {session_id}: {str(e)}")
            await self.db.rollback()
            return False

    async def delete_session(self, session_id: str, user_id: int) -> bool:
        """
        删除会话 (双删: Redis + PostgreSQL)

        Args:
            session_id: 会话ID
            user_id: 用户ID

        Returns:
            是否删除成功
        """
        try:
            # 1. 删除 Redis
            await self.redis.delete_session(session_id, user_id)

            # 2. 获取会话的数据库ID
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id,
                ConversationSession.user_id == user_id
            )
            result = await self.db.execute(stmt)
            db_session_obj = result.scalar_one_or_none()

            if db_session_obj:
                # 先删除关联的消息
                delete_messages_stmt = delete(Message).where(
                    Message.session_id == db_session_obj.id
                )
                await self.db.execute(delete_messages_stmt)

                # 再删除会话
                delete_session_stmt = delete(ConversationSession).where(
                    ConversationSession.id == db_session_obj.id
                )
                await self.db.execute(delete_session_stmt)
                await self.db.commit()

            logger.info(f"Deleted session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {str(e)}")
            await self.db.rollback()
            return False

    async def archive_session(self, session_id: str) -> bool:
        """
        归档会话到 JSON 文件

        Args:
            session_id: 会话ID

        Returns:
            是否归档成功
        """
        try:
            # 1. 从 PostgreSQL 读取完整会话数据
            session = await self.get_session(session_id, from_cache=False)
            if not session:
                logger.warning(f"Session not found for archiving: {session_id}")
                return False

            messages = await self.get_messages(session_id, from_cache=False)

            # 2. 构建归档数据
            archive_data = {
                "session": session,
                "messages": messages,
                "archived_at": datetime.utcnow().isoformat()
            }

            # 3. 写入 JSON 文件
            archive_file = self.archive_dir / f"{session_id}.json"
            with open(archive_file, "w", encoding="utf-8") as f:
                json.dump(archive_data, f, ensure_ascii=False, indent=2)

            logger.info(f"Archived session {session_id} to {archive_file}")
            return True

        except Exception as e:
            logger.error(f"Error archiving session {session_id}: {str(e)}")
            return False

    async def get_user_sessions(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        获取用户的所有会话 (从 PostgreSQL)

        Args:
            user_id: 用户ID
            limit: 返回数量限制
            offset: 偏移量

        Returns:
            会话列表
        """
        try:
            stmt = select(ConversationSession).where(
                ConversationSession.user_id == user_id
            ).order_by(
                ConversationSession.updated_at.desc()
            ).limit(limit).offset(offset)

            result = await self.db.execute(stmt)
            sessions = result.scalars().all()

            return [
                {
                    "session_id": s.session_id,
                    "title": s.title,
                    "status": s.status.value if hasattr(s.status, 'value') else s.status,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                    "metadata": {
                        "tags": s.tags,
                        "related_resources": s.related_resources
                    }
                }
                for s in sessions
            ]

        except Exception as e:
            logger.error(f"Error getting sessions for user {user_id}: {str(e)}")
            return []

    async def load_session_for_agent(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Load session messages optimized for LLM consumption.

        - Merges consecutive assistant messages (LLM requires strict alternation)
        - Injects compressed_context as virtual assistant message

        Args:
            session_id: Session identifier

        Returns:
            Optimized list of message dicts
        """
        try:
            # Get messages from cache or database
            messages = await self.get_messages(session_id)

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
                        metadata = msg.get("metadata", {})
                        if "tool_calls" in metadata:
                            if "tool_calls" not in optimized[-1]:
                                optimized[-1]["tool_calls"] = []
                            optimized[-1]["tool_calls"].extend(metadata["tool_calls"])
                else:
                    # Add tool_calls from metadata if present
                    msg_copy = msg.copy()
                    metadata = msg.get("metadata", {})
                    if "tool_calls" in metadata:
                        msg_copy["tool_calls"] = metadata["tool_calls"]
                    optimized.append(msg_copy)

                prev_role = role

            return optimized

        except Exception as e:
            logger.error(f"Error loading session for agent {session_id}: {str(e)}")
            return []

    async def sync_to_db(self, session_id: str) -> bool:
        """
        将 Redis 中的会话同步到 PostgreSQL

        Args:
            session_id: 会话ID

        Returns:
            是否同步成功
        """
        try:
            # 1. 从 Redis 读取
            session_data = await self.redis.get_session(session_id)
            if not session_data:
                logger.warning(f"Session not found in Redis: {session_id}")
                return False

            # 2. 检查 PostgreSQL 是否存在
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await self.db.execute(stmt)
            db_session = result.scalar_one_or_none()

            if not db_session:
                logger.warning(f"Session not found in PostgreSQL: {session_id}")
                return False

            # 3. 同步消息
            redis_messages = session_data.get("messages", [])
            for msg in redis_messages:
                # 检查消息是否已存在
                msg_stmt = select(Message).where(
                    Message.session_id == session_id,
                    Message.content == msg["content"],
                    Message.role == msg["role"]
                )
                msg_result = await self.db.execute(msg_stmt)
                existing_msg = msg_result.scalar_one_or_none()

                if not existing_msg:
                    # 添加新消息
                    db_message = Message(
                        session_id=session_id,
                        user_id=session_data["user_id"],
                        role=msg["role"],
                        content=msg["content"],
                        message_metadata=msg.get("metadata", {})
                    )
                    self.db.add(db_message)

            await self.db.commit()
            logger.info(f"Synced session {session_id} to PostgreSQL")
            return True

        except Exception as e:
            logger.error(f"Error syncing session {session_id}: {str(e)}")
            await self.db.rollback()
            return False
