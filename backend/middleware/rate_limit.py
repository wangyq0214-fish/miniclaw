"""
Rate limiting middleware using Redis sliding window.

Uses a Redis sorted set (ZSET) to track request timestamps per user.
Each request adds the current timestamp as a member; expired entries
are pruned to enforce a rolling window.
"""
import time
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from database import get_redis
from auth.security import get_current_user
from models import User

logger = logging.getLogger(__name__)


class RateLimiter:
    """Sliding-window rate limiter backed by Redis ZSET."""

    def __init__(self, key_prefix: str, max_requests: int, window_seconds: int):
        self.key_prefix = key_prefix
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def check(self, redis: Redis, user_id: int) -> dict:
        """
        Check and record a request for the given user.

        Returns dict with rate-limit headers.
        Raises HTTPException 429 if the limit is exceeded.
        """
        key = f"{self.key_prefix}:{user_id}"
        now = time.time()
        window_start = now - self.window_seconds

        pipe = redis.pipeline()
        # Remove entries outside the current window
        pipe.zremrangebyscore(key, 0, window_start)
        # Count remaining entries in the window
        pipe.zcard(key)
        # Add the current request timestamp
        pipe.zadd(key, {str(now): now})
        # Set TTL so keys don't linger forever
        pipe.expire(key, self.window_seconds)
        results = await pipe.execute()

        current_count = results[1]  # result of ZCARD

        if current_count >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请求过于频繁，请稍后再试（限制：{self.max_requests}次/{self.window_seconds}秒）",
            )

        return {
            "X-RateLimit-Limit": str(self.max_requests),
            "X-RateLimit-Remaining": str(self.max_requests - current_count - 1),
            "X-RateLimit-Reset": str(int(now + self.window_seconds)),
        }


# Pre-configured limiters
_chat_limiter = RateLimiter(
    key_prefix="rate_limit:chat",
    max_requests=10,
    window_seconds=60,
)

_subagent_limiter = RateLimiter(
    key_prefix="rate_limit:subagent",
    max_requests=5,
    window_seconds=60,
)


async def rate_limit_chat(
    request: Request,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """FastAPI dependency: rate-limit chat endpoint to 10 req/min per user."""
    headers = await _chat_limiter.check(redis, current_user.id)
    request.state.rate_limit_headers = headers


async def rate_limit_subagent(
    request: Request,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """FastAPI dependency: rate-limit subagent endpoint to 5 req/min per user."""
    headers = await _subagent_limiter.check(redis, current_user.id)
    request.state.rate_limit_headers = headers
