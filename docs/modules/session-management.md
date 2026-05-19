# Session Management 模块

## 职责
会话生命周期管理，包括Redis热数据缓存、PostgreSQL持久化、自动压缩。

## 核心文件
```
backend/memory/
├── __init__.py
├── hybrid_session.py      # HybridSessionManager (Redis + DB)
├── redis_session.py       # RedisSessionManager
└── system_prompt.py       # SystemPromptBuilder
```

## 架构设计

### 三层存储策略
```
┌─────────────────────────────────────────┐
│  Redis (热数据)                          │
│  - 最近20条消息                          │
│  - TTL: 7天                              │
│  - 快速读写                              │
└─────────────────────────────────────────┘
                 ↕ 同步
┌─────────────────────────────────────────┐
│  PostgreSQL (持久化)                     │
│  - 完整消息历史                          │
│  - 永久存储                              │
│  - 支持复杂查询                          │
└─────────────────────────────────────────┘
                 ↕ 归档
┌─────────────────────────────────────────┐
│  JuiceFS (冷数据)                        │
│  - 压缩后的会话快照                      │
│  - 用户文件存储                          │
└─────────────────────────────────────────┘
```

## HybridSessionManager

### 核心实现
```python
class HybridSessionManager:
    def __init__(
        self,
        redis_manager: RedisSessionManager,
        db_session: AsyncSession,
        user_id: int
    ):
        self.redis = redis_manager
        self.db = db_session
        self.user_id = user_id
    
    async def get_history(
        self,
        session_id: str,
        limit: int = 50
    ) -> List[Dict]:
        """
        获取会话历史（优先Redis，缺失则从DB恢复）
        """
        # 1. 尝试从Redis读取
        messages = await self.redis.get_messages(session_id)
        if messages:
            return messages[-limit:]
        
        # 2. Redis缺失，从PostgreSQL加载
        messages = await self._load_from_db(session_id, limit)
        
        # 3. 回写Redis（预热缓存）
        if messages:
            await self.redis.set_messages(session_id, messages)
        
        return messages
    
    async def add_message(
        self,
        session_id: str,
        message: Dict
    ):
        """
        添加消息（双写Redis + DB）
        """
        # 1. 写入Redis（热数据）
        await self.redis.append_message(session_id, message)
        
        # 2. 写入PostgreSQL（持久化）
        await self._save_to_db(session_id, message)
        
        # 3. 检查是否需要压缩
        if settings.auto_compress_enabled:
            count = await self.redis.get_message_count(session_id)
            if count >= settings.auto_compress_threshold:
                await self._auto_compress(session_id)
```

### 从数据库加载
```python
async def _load_from_db(
    self,
    session_id: str,
    limit: int
) -> List[Dict]:
    # 1. 查询会话
    result = await self.db.execute(
        select(ConversationSession)
        .where(ConversationSession.session_id == session_id)
        .where(ConversationSession.user_id == self.user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return []
    
    # 2. 查询消息（最近N条）
    result = await self.db.execute(
        select(Message)
        .where(Message.session_id == session.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    
    # 3. 转换为字典格式
    return [
        {
            "role": msg.role,
            "content": msg.content,
            "tool_calls": msg.tool_calls,
            "created_at": msg.created_at.isoformat()
        }
        for msg in reversed(messages)
    ]
```

## RedisSessionManager

### 数据结构
```
Redis Key设计:
- session:{session_id}:messages     # List: 消息列表
- session:{session_id}:metadata     # Hash: 会话元数据
- session:{session_id}:lock         # String: 分布式锁
```

### 核心方法
```python
class RedisSessionManager:
    def __init__(self, redis_client: Redis, ttl_days: int = 7):
        self.redis = redis_client
        self.ttl = ttl_days * 86400  # 转换为秒
    
    async def get_messages(self, session_id: str) -> List[Dict]:
        """获取消息列表"""
        key = f"session:{session_id}:messages"
        data = await self.redis.lrange(key, 0, -1)
        return [json.loads(msg) for msg in data]
    
    async def append_message(self, session_id: str, message: Dict):
        """追加消息"""
        key = f"session:{session_id}:messages"
        await self.redis.rpush(key, json.dumps(message))
        await self.redis.expire(key, self.ttl)
    
    async def set_messages(self, session_id: str, messages: List[Dict]):
        """批量设置消息（覆盖）"""
        key = f"session:{session_id}:messages"
        pipe = self.redis.pipeline()
        pipe.delete(key)
        for msg in messages:
            pipe.rpush(key, json.dumps(msg))
        pipe.expire(key, self.ttl)
        await pipe.execute()
```

## 自动压缩机制

### 触发条件
```python
# config.py
auto_compress_enabled = True
auto_compress_threshold = 20      # 消息数阈值
auto_compress_ratio = 0.5         # 压缩比例
```

### 压缩流程
```python
async def _auto_compress(self, session_id: str):
    """
    自动压缩会话历史
    
    策略:
    1. 保留最新 50% 消息
    2. 压缩旧消息为摘要
    3. 更新 context_summary
    """
    # 1. 获取所有消息
    messages = await self.redis.get_messages(session_id)
    if len(messages) < settings.auto_compress_threshold:
        return
    
    # 2. 计算分割点
    split_point = int(len(messages) * settings.auto_compress_ratio)
    old_messages = messages[:split_point]
    new_messages = messages[split_point:]
    
    # 3. 压缩旧消息
    summary = await self._compress_messages(old_messages)
    
    # 4. 更新数据库
    await self._update_context_summary(session_id, summary)
    
    # 5. 更新Redis（只保留新消息）
    await self.redis.set_messages(session_id, new_messages)
```

## 性能优化

### 1. 批量操作
```python
# ❌ 错误: 逐条查询
for session_id in session_ids:
    messages = await get_history(session_id)

# ✅ 正确: 批量查询
result = await db.execute(
    select(Message)
    .where(Message.session_id.in_(session_ids))
)
```

### 2. 连接复用
```python
# Redis连接池
redis_client = await redis.from_url(
    REDIS_URL,
    max_connections=50
)
```

### 3. 缓存预热
```python
# 用户登录时预加载最近会话
async def preload_recent_sessions(user_id: int):
    sessions = await get_recent_sessions(user_id, limit=5)
    for session in sessions:
        messages = await load_from_db(session.session_id)
        await redis_manager.set_messages(session.session_id, messages)
```

## 常见问题

### Q1: Redis数据丢失
- 检查TTL设置是否合理
- 确保双写到PostgreSQL
- 定期备份Redis数据

### Q2: 压缩后上下文断裂
- 调整压缩比例（保留更多消息）
- 优化压缩提示词
- 在摘要中保留关键实体

### Q3: 并发写入冲突
- 使用分布式锁
- 实现乐观锁（版本号）
- 队列化写入操作
