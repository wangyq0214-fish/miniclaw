# API Layer 模块

## 职责
FastAPI路由层，处理HTTP请求/响应，参数验证，认证授权。

## 目录结构
```
backend/api/
├── __init__.py          # 导出所有router
├── auth.py              # 认证API (登录/注册/登出)
├── chat.py              # 聊天API (SSE流式对话)
├── sessions_v2.py       # 会话管理API
├── files.py             # 文件操作API
├── courses.py           # 课程资源API
├── tokens.py            # Token统计API
├── compress.py          # 会话压缩API
└── config_api.py        # 配置管理API
```

## 核心API

### 1. 认证API (`auth.py`)
```python
POST /api/auth/register    # 用户注册
POST /api/auth/login       # 用户登录
POST /api/auth/logout      # 用户登出
GET  /api/auth/me          # 获取当前用户信息
```

**关键实现**:
- 密码: bcrypt加密 (cost=12)
- Token: JWT (30分钟过期) + Redis缓存
- 依赖注入: `get_current_user` 验证Token

### 2. 聊天API (`chat.py`)
```python
POST /api/chat             # SSE流式对话
```

**流程**:
1. 验证用户身份 (`get_current_user`)
2. 加载会话历史 (`HybridSessionManager`)
3. 调用 `AgentManager.astream()`
4. 流式返回事件: token/tool_start/tool_end/done
5. 保存消息到 Redis + PostgreSQL

**事件格式**:
```json
{"type": "token", "content": "文本片段"}
{"type": "tool_start", "tool": "read_file", "input": {...}, "id": "call_123"}
{"type": "tool_end", "tool": "read_file", "output": "...", "id": "call_123"}
{"type": "done"}
{"type": "error", "error": "错误信息"}
```

### 3. 会话管理API (`sessions_v2.py`)
```python
GET    /api/sessions              # 获取用户会话列表
POST   /api/sessions              # 创建新会话
GET    /api/sessions/{session_id} # 获取会话详情
DELETE /api/sessions/{session_id} # 删除会话
PUT    /api/sessions/{session_id}/title  # 更新会话标题
```

### 4. 文件操作API (`files.py`)
```python
GET  /api/files/list               # 列出文件
GET  /api/files/read               # 读取文件
POST /api/files/write              # 写入文件
POST /api/files/delete             # 删除文件
```

### 5. 课程资源API (`courses.py`)
```python
GET /api/courses/structure         # 获取课程结构树
GET /api/courses/content           # 获取课程内容
```

## 设计原则

### 1. 依赖注入
```python
@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    ...
```

### 2. Pydantic验证
```python
class ChatRequest(BaseModel):
    message: str
    session_id: str = "main_session"
    stream: bool = True
```

### 3. 统一错误处理
```python
try:
    result = await process()
except UserNotFoundError:
    raise HTTPException(404, "User not found")
except Exception as e:
    logger.error(f"Error: {e}", exc_info=True)
    raise HTTPException(500, "Internal server error")
```

## 认证流程

### JWT Token生成
```python
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
```

### Token验证
```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db)
) -> User:
    # 1. 解码JWT
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user_id = payload.get("sub")
    
    # 2. 从Redis查询
    cached_user_id = await redis.get(f"token:{token}")
    if not cached_user_id:
        raise HTTPException(401, "Token expired")
    
    # 3. 从数据库加载User
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    
    return user
```

## SSE流式响应

### StreamingResponse封装
```python
async def stream_chat_response(...) -> AsyncGenerator[str, None]:
    async for event in agent_manager.astream(...):
        yield f"data: {json.dumps(event)}\n\n"

return StreamingResponse(
    stream_chat_response(...),
    media_type="text/event-stream"
)
```

## 性能优化

### 1. 异步IO
- 所有数据库操作使用 `AsyncSession`
- Redis操作使用 `redis.asyncio`
- 文件IO使用 `aiofiles`

### 2. 连接池
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20
)
```

### 3. 缓存策略
- Token缓存: Redis (TTL 30分钟)
- 会话上下文: Redis (TTL 7天)
- 用户信息: 请求级缓存

## 安全措施

### 1. CORS配置
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. 输入验证
- Pydantic自动验证类型
- 路径参数验证防止注入
- 文件路径验证防止遍历

### 3. 速率限制
- TODO: 添加 slowapi 中间件
- 限制每IP请求频率

## 测试策略

### 单元测试
```python
@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    response = await client.post("/api/auth/login", json={
        "username": "test",
        "password": "password"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
```

### 集成测试
- 使用 TestClient 模拟HTTP请求
- Mock数据库和Redis
- 验证完整请求流程

## 常见问题

### Q1: SSE连接断开
- 检查前端EventSource配置
- 检查Nginx超时设置
- 添加心跳机制

### Q2: Token过期处理
- 前端捕获401错误
- 自动跳转登录页
- 刷新Token机制

### Q3: 并发请求冲突
- 使用数据库事务
- 乐观锁处理并发更新
- Redis分布式锁
