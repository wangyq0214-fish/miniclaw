"""
Redis Session Manager - 会话上下文存储到 Redis
"""
import json
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import redis.asyncio as redis

logger = logging.getLogger(__name__)


class RedisSessionManager:
    """Redis 会话管理器 - 热数据存储"""

    def __init__(self, redis_client: redis.Redis, ttl_days: int = 7):
        """
        初始化 Redis 会话管理器

        Args:
            redis_client: Redis 客户端
            ttl_days: 会话过期时间（天）
        """
        self.redis = redis_client
        self.ttl_seconds = ttl_days * 24 * 60 * 60
        logger.info(f"RedisSessionManager initialized with TTL: {ttl_days} days")

    def _session_key(self, session_id: str) -> str:
        """生成会话 Redis key"""
        return f"session:{session_id}:context"

    def _user_sessions_key(self, user_id: int) -> str:
        """生成用户会话列表 key"""
        return f"user:{user_id}:sessions"

    async def create_session(
        self,
        session_id: str,
        user_id: int,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        创建新会话

        Args:
            session_id: 会话ID
            user_id: 用户ID
            metadata: 会话元数据

        Returns:
            是否创建成功
        """
        try:
            session_data = {
                "session_id": session_id,
                "user_id": user_id,
                "messages": [],
                "window_buffer": [],
                "metadata": metadata or {},
                "created_at": datetime.utcnow().isoformat(),
                "last_message_at": None,
            }

            # 存储会话数据
            key = self._session_key(session_id)
            await self.redis.setex(
                key,
                self.ttl_seconds,
                json.dumps(session_data, ensure_ascii=False)
            )

            # 添加到用户会话列表
            user_key = self._user_sessions_key(user_id)
            await self.redis.sadd(user_key, session_id)
            await self.redis.expire(user_key, self.ttl_seconds)

            logger.info(f"Created session {session_id} for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Error creating session {session_id}: {str(e)}")
            return False

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        获取会话数据

        Args:
            session_id: 会话ID

        Returns:
            会话数据字典，不存在返回 None
        """
        try:
            key = self._session_key(session_id)
            data = await self.redis.get(key)

            if data:
                return json.loads(data)
            return None

        except Exception as e:
            logger.error(f"Error getting session {session_id}: {str(e)}")
            return None

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        添加消息到会话

        Args:
            session_id: 会话ID
            role: 消息角色 (user/assistant/system)
            content: 消息内容
            metadata: 消息元数据

        Returns:
            是否添加成功
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                logger.warning(f"Session {session_id} not found")
                return False

            # 创建消息对象
            message = {
                "role": role,
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
                "metadata": metadata or {}
            }

            # 添加到消息列表
            session["messages"].append(message)
            session["last_message_at"] = message["timestamp"]

            # 更新滑动窗口（保留最近 50 条消息）
            window_size = 50
            if len(session["messages"]) > window_size:
                session["window_buffer"] = session["messages"][-window_size:]
            else:
                session["window_buffer"] = session["messages"]

            # 保存回 Redis
            key = self._session_key(session_id)
            await self.redis.setex(
                key,
                self.ttl_seconds,
                json.dumps(session, ensure_ascii=False)
            )

            logger.debug(f"Added message to session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error adding message to session {session_id}: {str(e)}")
            return False

    async def get_messages(
        self,
        session_id: str,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        获取会话消息

        Args:
            session_id: 会话ID
            limit: 返回消息数量限制
            offset: 偏移量

        Returns:
            消息列表
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                return []

            messages = session.get("messages", [])

            # 应用分页
            if limit:
                return messages[offset:offset + limit]
            return messages[offset:]

        except Exception as e:
            logger.error(f"Error getting messages for session {session_id}: {str(e)}")
            return []

    async def get_window_buffer(self, session_id: str) -> List[Dict[str, Any]]:
        """
        获取会话的滑动窗口缓冲区

        Args:
            session_id: 会话ID

        Returns:
            窗口缓冲区消息列表
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                return []

            return session.get("window_buffer", [])

        except Exception as e:
            logger.error(f"Error getting window buffer for session {session_id}: {str(e)}")
            return []

    async def delete_session(self, session_id: str, user_id: int) -> bool:
        """
        删除会话

        Args:
            session_id: 会话ID
            user_id: 用户ID

        Returns:
            是否删除成功
        """
        try:
            # 删除会话数据
            key = self._session_key(session_id)
            await self.redis.delete(key)

            # 从用户会话列表中移除
            user_key = self._user_sessions_key(user_id)
            await self.redis.srem(user_key, session_id)

            logger.info(f"Deleted session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {str(e)}")
            return False

    async def get_user_sessions(self, user_id: int) -> List[str]:
        """
        获取用户的所有会话ID

        Args:
            user_id: 用户ID

        Returns:
            会话ID列表
        """
        try:
            user_key = self._user_sessions_key(user_id)
            sessions = await self.redis.smembers(user_key)
            return list(sessions)

        except Exception as e:
            logger.error(f"Error getting sessions for user {user_id}: {str(e)}")
            return []

    async def update_metadata(
        self,
        session_id: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        更新会话元数据

        Args:
            session_id: 会话ID
            metadata: 新的元数据

        Returns:
            是否更新成功
        """
        try:
            session = await self.get_session(session_id)
            if not session:
                return False

            session["metadata"].update(metadata)

            # 保存回 Redis
            key = self._session_key(session_id)
            await self.redis.setex(
                key,
                self.ttl_seconds,
                json.dumps(session, ensure_ascii=False)
            )

            logger.debug(f"Updated metadata for session {session_id}")
            return True

        except Exception as e:
            logger.error(f"Error updating metadata for session {session_id}: {str(e)}")
            return False

    async def refresh_ttl(self, session_id: str) -> bool:
        """
        刷新会话 TTL

        Args:
            session_id: 会话ID

        Returns:
            是否刷新成功
        """
        try:
            key = self._session_key(session_id)
            await self.redis.expire(key, self.ttl_seconds)
            return True

        except Exception as e:
            logger.error(f"Error refreshing TTL for session {session_id}: {str(e)}")
            return False

    async def session_exists(self, session_id: str) -> bool:
        """
        检查会话是否存在

        Args:
            session_id: 会话ID

        Returns:
            是否存在
        """
        try:
            key = self._session_key(session_id)
            return await self.redis.exists(key) > 0

        except Exception as e:
            logger.error(f"Error checking session existence {session_id}: {str(e)}")
            return False
