# Database & Models 模块

## 职责
数据持久化层，包括PostgreSQL连接管理、ORM模型定义、Redis缓存。

## 核心文件
```
backend/
├── database.py              # 数据库连接配置
├── models/
│   ├── __init__.py
│   └── complete_models.py   # 7张表的ORM定义
└── schemas/                 # Pydantic验证模型
    └── *.py
```

## 数据库配置 (database.py)

### PostgreSQL连接
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/miniclaw"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,              # 生产环境关闭SQL日志
    pool_pre_ping=True,      # 连接健康检查
    pool_size=10,            # 常驻连接数
    max_overflow=20          # 最大溢出连接
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False   # 提交后对象仍可访问
)
```

### Redis连接
```python
import redis.asyncio as redis

REDIS_URL = "redis://localhost:6379/0"

redis_client: redis.Redis = None

async def init_redis():
    global redis_client
    redis_client = await redis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )
```

### 依赖注入
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def get_redis() -> redis.Redis:
    return redis_client
```

## ORM模型设计

### 1. User (用户表)
```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100))
    
    # 学生信息
    major = Column(String(100))
    grade = Column(String(20))
    student_id = Column(String(50), unique=True)
    
    # 状态
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # 关系
    profile = relationship("StudentProfile", back_populates="user", uselist=False)
    sessions = relationship("ConversationSession", back_populates="user")
    resources = relationship("Resource", back_populates="user")
    learning_progress = relationship("LearningProgress", back_populates="user")
```

**索引策略**:
- username, email: 唯一索引（登录查询）
- id: 主键索引（外键关联）

### 2. StudentProfile (学生画像表)
```python
class StudentProfile(Base):
    __tablename__ = "student_profiles"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # 6维度画像 (JSONB)
    learning_style = Column(JSONB)      # 学习风格
    knowledge_level = Column(JSONB)     # 知识水平
    interest_preference = Column(JSONB) # 兴趣偏好
    cognitive_ability = Column(JSONB)   # 认知能力
    learning_behavior = Column(JSONB)   # 学习行为
    emotional_state = Column(JSONB)     # 情绪状态
    
    profile_summary = Column(Text)      # 画像摘要
    version = Column(Integer, default=1)
    last_updated = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="profile")
```

**JSONB字段示例**:
```json
{
  "learning_style": {
    "sensory_preference": "visual",
    "learning_approach": "example_driven",
    "pace": "moderate"
  },
  "knowledge_level": {
    "反向传播": 0.35,
    "卷积神经网络": 0.62
  }
}
```

### 3. ConversationSession (会话表)
```python
class SessionStatus(enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"

class ConversationSession(Base):
    __tablename__ = "conversation_sessions"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    
    title = Column(String(200))
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.ACTIVE)
    context_summary = Column(Text)      # 压缩后的上下文摘要
    metadata = Column(JSONB)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
```

**索引策略**:
- session_id: 唯一索引（会话查询）
- user_id + created_at: 复合索引（用户会话列表）

### 4. Message (消息表)
```python
class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("conversation_sessions.id"), nullable=False)
    
    role = Column(String(20), nullable=False)  # user/assistant/system
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB)                 # 工具调用记录
    metadata = Column(JSONB)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    session = relationship("ConversationSession", back_populates="messages")
```

**tool_calls格式**:
```json
[
  {
    "id": "call_abc123",
    "name": "read_file",
    "args": {"path": "workspace/USER.md"},
    "output": "# 学生画像..."
  }
]
```

### 5. Resource (资源表)
```python
class ResourceType(enum.Enum):
    LECTURE = "lecture"
    EXERCISE = "exercise"
    MINDMAP = "mindmap"
    VIDEO = "video"
    PPT = "ppt"
    ANIMATION = "animation"

class ResourceStatus(enum.Enum):
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

class Resource(Base):
    __tablename__ = "resources"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    resource_type = Column(SQLEnum(ResourceType), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    
    file_path = Column(String(500))     # 云存储路径
    file_size = Column(Integer)
    mime_type = Column(String(100))
    
    metadata = Column(JSONB)            # 生成参数、版本等
    status = Column(SQLEnum(ResourceStatus), default=ResourceStatus.GENERATING)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", back_populates="resources")
```

### 6. LearningProgress (学习进度表)
```python
class LearningProgress(Base):
    __tablename__ = "learning_progress"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    topic = Column(String(200), nullable=False)
    mastery_level = Column(Float, default=0.0)  # 0.0-1.0
    
    practice_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    
    last_interaction = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", back_populates="learning_progress")
```

**索引策略**:
- user_id + topic: 复合唯一索引（防止重复记录）

### 7. AsyncTask (异步任务表)
```python
class TaskType(enum.Enum):
    GENERATE_VIDEO = "generate_video"
    GENERATE_PPT = "generate_ppt"
    INDEX_KNOWLEDGE = "index_knowledge"

class TaskStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class AsyncTask(Base):
    __tablename__ = "async_tasks"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    task_type = Column(SQLEnum(TaskType), nullable=False)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING)
    progress = Column(Integer, default=0)  # 0-100
    
    result = Column(JSONB)
    error_message = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True))
```

## 查询优化

### 1. 避免N+1查询
```python
# ❌ 错误: N+1查询
users = await db.execute(select(User)).scalars().all()
for user in users:
    profile = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == user.id)
    ).scalar()

# ✅ 正确: 使用joinedload
from sqlalchemy.orm import joinedload

users = await db.execute(
    select(User).options(joinedload(User.profile))
).scalars().all()

# 访问profile无需额外查询
for user in users:
    print(user.profile.learning_style)
```

### 2. 分页查询
```python
async def get_sessions(user_id: int, page: int, page_size: int):
    offset = (page - 1) * page_size
    
    result = await db.execute(
        select(ConversationSession)
        .where(ConversationSession.user_id == user_id)
        .order_by(ConversationSession.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return result.scalars().all()
```

### 3. 批量插入
```python
# ❌ 错误: 逐条插入
for item in items:
    db.add(Message(**item))
    await db.commit()

# ✅ 正确: 批量插入
await db.execute(insert(Message), items)
await db.commit()
```

## 事务管理

### 原子操作
```python
async def create_user_with_profile(user_data, profile_data):
    async with db.begin():
        # 创建用户
        user = User(**user_data)
        db.add(user)
        await db.flush()  # 获取user.id
        
        # 创建画像
        profile = StudentProfile(user_id=user.id, **profile_data)
        db.add(profile)
        
        # 自动commit
    return user
```

### 错误回滚
```python
try:
    async with db.begin():
        # 多个操作
        db.add(obj1)
        db.add(obj2)
        # 如果出错，自动rollback
except Exception as e:
    logger.error(f"Transaction failed: {e}")
    raise
```

## Redis缓存策略

### Token缓存
```python
# 存储Token
await redis_client.setex(
    f"token:{token}",
    1800,  # 30分钟
    user_id
)

# 验证Token
user_id = await redis_client.get(f"token:{token}")
```

### 会话上下文缓存
```python
# 存储会话消息
await redis_client.setex(
    f"session:{session_id}:messages",
    604800,  # 7天
    json.dumps(messages)
)

# 读取会话消息
data = await redis_client.get(f"session:{session_id}:messages")
messages = json.loads(data) if data else []
```

## 数据库迁移

### Alembic配置
```bash
# 生成迁移脚本
alembic revision --autogenerate -m "Add new table"

# 执行迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```

### 手动迁移脚本
```python
# backend/migrate.py
async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables created")
```

## 性能监控

### 慢查询日志
```python
# 开启SQL日志
engine = create_async_engine(
    DATABASE_URL,
    echo=True  # 打印所有SQL
)
```

### 连接池监控
```python
# 查看连接池状态
print(f"Pool size: {engine.pool.size()}")
print(f"Checked out: {engine.pool.checkedout()}")
print(f"Overflow: {engine.pool.overflow()}")
```

## 常见问题

### Q1: 连接池耗尽
- 检查是否正确关闭session
- 增加pool_size和max_overflow
- 使用连接池监控

### Q2: JSONB查询慢
- 为JSONB字段创建GIN索引
- 使用PostgreSQL的JSONB操作符

### Q3: 事务死锁
- 减少事务持有时间
- 统一锁顺序
- 使用乐观锁
