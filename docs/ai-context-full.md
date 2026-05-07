# AI Context Full - Mini-OpenClaw 完整技术文档

## 1. 项目概述

### 1.1 项目定位
Mini-OpenClaw 是一个基于大语言模型的智能教育助手系统，核心功能包括：
- 个性化学习对话
- 动态学生画像（6维度）
- 智能资源生成（讲解文档、习题、思维导图、阅读清单等）
- 知识图谱驱动的课程导航
- 多Agent协作的内容创作

### 1.2 技术选型理由
- **FastAPI**: 高性能异步框架，原生支持SSE流式响应
- **LangChain/LangGraph**: 成熟的Agent编排框架，工具调用稳定
- **DeepAgents**: 自研中间件系统，解决文件权限、技能加载、子Agent管理
- **PostgreSQL**: 关系型数据强一致性，支持JSONB半结构化存储
- **Redis**: 高速缓存，适合会话上下文的热数据
- **Neo4j**: 图数据库，天然适合知识图谱查询

---

## 2. 架构设计

### 2.1 整体架构图
```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ ChatView │  │ Sidebar  │  │ Inspector│  │  Login   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API Layer                                            │  │
│  │  /api/chat  /api/auth  /api/sessions  /api/files    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AgentManager (agent.py)                             │  │
│  │  - 初始化模型 (ChatOpenAI)                            │  │
│  │  - 管理工具列表                                        │  │
│  │  - 流式事件转换                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DeepAgents Framework                                 │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │  │
│  │  │  Memory    │ │  Skills    │ │ Subagents  │       │  │
│  │  │ Middleware │ │ Middleware │ │ Middleware │       │  │
│  │  └────────────┘ └────────────┘ └────────────┘       │  │
│  │  ┌────────────┐ ┌────────────┐                       │  │
│  │  │Permissions │ │ Filesystem │                       │  │
│  │  │ Middleware │ │  Backend   │                       │  │
│  │  └────────────┘ └────────────┘                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Data Layer                                           │  │
│  │  - HybridSessionManager (Redis + PostgreSQL)         │  │
│  │  - SQLAlchemy Models (7 tables)                      │  │
│  │  - JWT Authentication                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Storage & Services                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │  Neo4j   │  │ JuiceFS  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 请求流程（以聊天为例）
1. **前端发起**: `POST /api/chat` (SSE stream)
2. **认证**: JWT Token → `get_current_user` → 获取 user_id
3. **加载会话**: HybridSessionManager 从 Redis 读取上下文，缺失则从 PostgreSQL 恢复
4. **构建消息**: 历史消息 + 当前消息 → LangChain Message 列表
5. **Agent执行**: 
   - MemoryMiddleware 注入 `/memory/MEMORY.md`
   - SkillsMiddleware 扫描 `/skills/*/SKILL.md`
   - PermissionsMiddleware 检查文件操作权限
   - SubAgentMiddleware 准备6个子Agent
6. **流式输出**: 
   - `token` 事件 → 文本片段
   - `tool_start` → 工具调用开始
   - `tool_end` → 工具调用结束
   - `done` → 流结束
7. **保存**: 消息写入 Redis (热数据) + PostgreSQL (持久化)

---

## 3. 数据库设计详解

### 3.1 表结构与关系
```sql
users (用户表)
  ├── id (PK)
  ├── username, email, hashed_password
  ├── major, grade, student_id
  └── created_at, updated_at, last_login

student_profiles (学生画像表)
  ├── id (PK)
  ├── user_id (FK → users.id, UNIQUE)
  ├── learning_style (JSONB)      # 视觉/听觉/动手, 示例/理论驱动
  ├── knowledge_level (JSONB)     # {topic: mastery_score}
  ├── interest_preference (JSONB) # 兴趣标签权重
  ├── cognitive_ability (JSONB)   # 抽象思维/逻辑推理能力
  ├── learning_behavior (JSONB)   # 学习时长/频率/卡点
  ├── emotional_state (JSONB)     # 焦虑/自信/疲劳状态
  ├── profile_summary (TEXT)
  └── version, last_updated

conversation_sessions (会话表)
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── session_id (UNIQUE, 业务ID)
  ├── title, status (active/archived/deleted)
  ├── context_summary (TEXT)      # 压缩后的上下文摘要
  ├── metadata (JSONB)            # 扩展字段
  └── created_at, updated_at

messages (消息表)
  ├── id (PK)
  ├── session_id (FK → conversation_sessions.id)
  ├── role (user/assistant/system)
  ├── content (TEXT)
  ├── tool_calls (JSONB)          # [{name, args, output, id}]
  ├── metadata (JSONB)
  └── created_at

resources (资源表)
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── resource_type (lecture/exercise/mindmap/video/ppt)
  ├── title, description
  ├── file_path (云存储路径)
  ├── file_size, mime_type
  ├── metadata (JSONB)            # 生成参数、版本等
  ├── status (generating/completed/failed)
  └── created_at, updated_at

learning_progress (学习进度表)
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── topic (主题名称)
  ├── mastery_level (0.0-1.0)
  ├── practice_count, correct_count
  ├── last_interaction
  └── created_at, updated_at

async_tasks (异步任务表)
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── task_type (generate_video/generate_ppt/index_knowledge)
  ├── status (pending/running/completed/failed)
  ├── progress (0-100)
  ├── result (JSONB)
  ├── error_message (TEXT)
  └── created_at, updated_at, completed_at
```

### 3.2 JSONB字段设计示例

**student_profiles.learning_style**:
```json
{
  "sensory_preference": "visual",  // visual/auditory/kinesthetic
  "learning_approach": "example_driven",  // example_driven/theory_driven
  "pace": "moderate",  // slow/moderate/fast
  "depth_preference": "practical"  // practical/theoretical
}
```

**student_profiles.knowledge_level**:
```json
{
  "反向传播": 0.35,
  "卷积神经网络": 0.62,
  "注意力机制": 0.18
}
```

**messages.tool_calls**:
```json
[
  {
    "id": "call_abc123",
    "name": "read_file",
    "args": {"path": "workspace/USER.md"},
    "output": "# 学生画像\n专业: 计算机科学..."
  }
]
```

---

## 4. DeepAgents框架深度解析

### 4.1 核心概念
DeepAgents 是自研的Agent中间件系统，解决以下问题：
1. **文件系统隔离**: 多用户环境下的路径权限控制
2. **技能动态加载**: 从 SKILL.md 自动生成工具描述
3. **子Agent管理**: 专业化子Agent的编排与通信
4. **记忆注入**: 自动加载长期记忆文件到上下文

### 4.2 Middleware执行顺序
```python
create_deep_agent(
    model=model,
    tools=tools,
    system_prompt=system_prompt,
    backend=backend,           # 1. FilesystemBackend/JuiceFSBackend
    memory=memory_sources,     # 2. MemoryMiddleware
    skills=skills_sources,     # 3. SkillsMiddleware
    subagents=subagents,       # 4. SubAgentMiddleware
    permissions=permissions,   # 5. PermissionsMiddleware
)
```

执行链: **Permissions → Filesystem → Memory → Skills → Subagents → Model**

### 4.3 FilesystemBackend 虚拟路径映射
```python
# virtual_mode=True: POSIX路径 → 物理路径
FilesystemBackend(root_dir="/path/to/backend", virtual_mode=True)

# Agent视角的路径:
"/workspace/generated/2026-04-27/backpropagation/lecture.md"

# 实际物理路径:
"/path/to/backend/workspace/generated/2026-04-27/backpropagation/lecture.md"
```

### 4.4 JuiceFSBackend 多用户隔离
```python
JuiceFSBackend(
    user_id=123,
    mount_point="/mnt/juicefs",
    fallback_dir="/path/to/backend",
    virtual_mode=True
)

# Agent视角: /workspace/file.txt
# 实际路径: /mnt/juicefs/users/123/workspace/file.txt
```

### 4.5 SkillsMiddleware 工作原理
1. 扫描 `/skills/*/SKILL.md`
2. 解析 frontmatter: `name`, `description`, `allowed-tools`
3. 生成虚拟工具: `invoke_skill_<name>`
4. 工具被调用时 → 创建SubAgent → 读取SKILL.md内容作为系统提示 → 执行

### 4.6 SubAgentMiddleware 子Agent配置
```python
# workspace/roles/lecture_writer.md
"""
你是讲解文档生成专家。
你的任务是根据学生画像和知识图谱，生成结构化的教学文档。
必须遵循以下步骤...
"""

# 代码中注册
SubAgent(
    name="lecture_writer",
    system_prompt=Path("workspace/roles/lecture_writer.md").read_text(),
    model=main_model,  # 继承主Agent的模型
    tools=main_tools   # 继承主Agent的工具
)
```

---

## 5. 工具系统详解

### 5.1 工具列表与用途
| 工具名 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| read_file | 读取文件 | path | 文件内容 |
| write_file | 写入文件 | path, content, mode | 成功/失败 |
| get_entity_graph | 查询知识图谱 | entity_name | incoming/outgoing关系 |
| get_course_structure | 获取课程结构 | course_name | 章节树 |
| search_knowledge_base | 全文搜索 | query | 相关文档片段 |
| fetch_url | 抓取网页 | url | 网页内容 |
| python_repl | 执行Python | code | 执行结果 |
| terminal | 执行Shell | command | 命令输出 |
| image_to_base64 | 图片编码 | image_path | base64字符串 |
| knowledge_search | 向量检索 | query, top_k | 相似文档 |

### 5.2 工具权限控制
```python
FilesystemPermission(
    operations=["read", "write"],
    paths=["/workspace/**"],
    mode="allow"  # allow/deny
)

# 规则优先级: deny > allow
# 示例: 允许读任何地方，但只能写workspace
[
    FilesystemPermission(operations=["read"], paths=["/**"]),
    FilesystemPermission(operations=["write"], paths=["/workspace/**"]),
    FilesystemPermission(operations=["write"], paths=["/**"], mode="deny"),
]
```

---

## 6. 会话管理策略

### 6.1 HybridSessionManager 架构
```python
class HybridSessionManager:
    def __init__(self, redis_manager, db_session, user_id):
        self.redis = redis_manager      # 热数据
        self.db = db_session            # 持久化
        self.user_id = user_id
    
    async def get_history(self, session_id):
        # 1. 尝试从Redis读取
        messages = await self.redis.get_messages(session_id)
        if messages:
            return messages
        
        # 2. Redis缺失，从PostgreSQL恢复
        messages = await self._load_from_db(session_id)
        
        # 3. 回写Redis
        await self.redis.set_messages(session_id, messages)
        return messages
    
    async def add_message(self, session_id, message):
        # 双写: Redis + PostgreSQL
        await self.redis.append_message(session_id, message)
        await self._save_to_db(session_id, message)
```

### 6.2 自动压缩机制
```python
# config.py
auto_compress_enabled = True
auto_compress_threshold = 20  # 消息数阈值
auto_compress_ratio = 0.5     # 压缩比例

# 触发条件: len(messages) >= 20
# 压缩策略: 保留最新10条，压缩前10条为摘要
# 摘要生成: LLM总结 → 存入 conversation_sessions.context_summary
```

---

## 7. 技能系统详解

### 7.1 技能定义规范 (SKILL.md)
```markdown
---
name: generate-lecture
description: 生成结构化讲解文档
allowed-tools: read_file write_file get_entity_graph
---

# 讲解文档生成技能

## 执行步骤
### Step 1: 读学生画像
tool: read_file
input: {"path": "workspace/USER.md"}

### Step 2: 查知识图谱
tool: get_entity_graph
input: {"entity_name": "<主题>"}

### Step 3: 按模板写正文
...

## 质量约束
- 必须有YAML frontmatter
- 必须引用学生画像
- 不能编造引用
```

### 7.2 现有技能列表
1. **answer-question**: 回答学生问题
2. **evaluate-learning**: 评估学习效果
3. **generate-code-case**: 生成代码案例
4. **generate-exercises**: 生成习题
5. **generate-lecture**: 生成讲解文档
6. **generate-media-script**: 生成视频脚本
7. **generate-mindmap**: 生成思维导图
8. **generate-reading-list**: 生成阅读清单
9. **get-weather**: 获取天气（示例）
10. **update-student-profile**: 更新学生画像

---

## 8. 资源生成流程

### 8.1 完整流程图
```
用户: "给我讲讲反向传播"
  ↓
主Agent识别意图 → 调用 invoke_skill_generate_lecture
  ↓
SkillsMiddleware 创建 lecture_writer SubAgent
  ↓
SubAgent 读取 /skills/generate-lecture/SKILL.md
  ↓
执行步骤:
  1. read_file("workspace/USER.md") → 获取画像
  2. get_entity_graph("反向传播") → 获取前置/后续主题
  3. 按模板生成Markdown
  4. write_file("workspace/generated/2026-04-27/backpropagation/lecture.md")
  ↓
返回主Agent → 告知用户 "已生成讲解文档"
  ↓
前端Inspector组件 → 读取生成的文件 → 渲染展示
```

### 8.2 生成内容规范
- **路径**: `workspace/generated/YYYY-MM-DD/<topic-slug>/<type>.md`
- **Frontmatter**: 必须包含 topic, generated_at, generated_by
- **长度控制**: 根据学生mastery调整 (入门≤1500字, 中阶2000-3500字, 高阶3000-5000字)
- **个性化**: 必须引用学生画像的具体维度

---

## 9. 认证与授权

### 9.1 JWT Token流程
```python
# 登录
POST /api/auth/login
  → 验证密码 (bcrypt)
  → 生成JWT Token (30分钟过期)
  → 存入Redis (key: "token:{token}", value: user_id)
  → 返回 {access_token, token_type}

# 请求验证
Header: Authorization: Bearer <token>
  → get_current_user 依赖注入
  → 从Redis查询 user_id
  → 从PostgreSQL加载User对象
  → 注入到路由函数
```

### 9.2 权限模型
- **用户级**: 每个用户只能访问自己的会话/资源
- **文件级**: Agent只能写 workspace/memory/knowledge，其他只读
- **API级**: 管理员接口需要 is_superuser=True

---

## 10. 性能优化策略

### 10.1 数据库优化
- **索引**: username, email, session_id, user_id + created_at
- **连接池**: pool_size=10, max_overflow=20
- **异步IO**: asyncpg + AsyncSession

### 10.2 缓存策略
- **Redis TTL**: Token 30分钟, 会话上下文 7天
- **LRU淘汰**: maxmemory-policy allkeys-lru

### 10.3 流式响应
- **SSE**: Server-Sent Events，单向推送
- **分块传输**: 每个token立即发送，降低首字延迟
- **背压控制**: asyncio队列缓冲

---

## 11. 错误处理

### 11.1 分层错误处理
```python
# API层
@router.post("/chat")
async def chat(request: ChatRequest):
    try:
        return StreamingResponse(stream_chat_response(...))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(500, "Internal server error")

# Agent层
async def astream(...):
    try:
        async for event in agent.astream(...):
            yield event
    except Exception as e:
        yield {"type": "error", "error": str(e)}

# 工具层
def read_file(path: str):
    try:
        return Path(path).read_text()
    except FileNotFoundError:
        return f"Error: File not found: {path}"
```

### 11.2 常见错误与解决
- **数据库连接失败**: 检查 DATABASE_URL, 确保PostgreSQL运行
- **Redis连接失败**: 检查 REDIS_URL, 会话管理降级到纯DB模式
- **Neo4j不可用**: get_entity_graph 降级到 search_knowledge_base
- **JuiceFS挂载失败**: 自动fallback到本地文件系统

---

## 12. 部署架构

### 12.1 开发环境
```bash
# 后端
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8002

# 前端
cd frontend
npm install
npm run dev  # 默认 http://localhost:3000
```

### 12.2 生产环境建议
- **Web服务器**: Nginx反向代理
- **进程管理**: Supervisor / systemd
- **数据库**: PostgreSQL主从复制
- **缓存**: Redis Sentinel高可用
- **文件存储**: JuiceFS + 对象存储 (S3/OSS)
- **监控**: Prometheus + Grafana
- **日志**: ELK Stack

---

## 13. 扩展点

### 13.1 新增技能
1. 在 `backend/skills/<skill-name>/` 创建目录
2. 编写 `SKILL.md` (参考现有技能)
3. 在 `workspace/roles/` 创建对应的 `<skill-name>.md` 系统提示
4. 重启服务，SkillsMiddleware自动加载

### 13.2 新增工具
1. 在 `backend/tools/` 创建 `<tool-name>.py`
2. 定义 LangChain Tool:
```python
from langchain_core.tools import tool

@tool
def my_tool(arg1: str, arg2: int) -> str:
    """工具描述"""
    return "result"
```
3. 在 `tools/__init__.py` 导出
4. 在 `agent.py` 的 `get_custom_tools` 中注册

### 13.3 新增SubAgent
1. 在 `workspace/roles/` 创建 `<agent-name>.md`
2. 在 `agents/resource_agents.py` 注册:
```python
SubAgent(
    name="<agent-name>",
    system_prompt=roles_dir / "<agent-name>.md",
    model=model,
    tools=tools
)
```

---

## 14. 测试策略

### 14.1 单元测试
- `backend/tests/test_*.py`
- 使用 pytest + pytest-asyncio
- Mock外部依赖 (数据库、Redis、LLM)

### 14.2 集成测试
- `test_db_connection.py`: 数据库连接
- `test_auth.py`: 认证流程
- `test_hybrid_session.py`: 会话管理
- `test_juicefs.py`: 文件系统

### 14.3 端到端测试
- 前端 Playwright / Cypress
- 模拟完整对话流程

---

## 15. 安全考虑

### 15.1 认证安全
- 密码: bcrypt加密 (cost=12)
- Token: JWT签名 + Redis黑名单
- HTTPS: 生产环境强制

### 15.2 输入验证
- Pydantic模型验证所有API输入
- SQL注入: SQLAlchemy ORM参数化查询
- XSS: 前端Markdown渲染使用 rehype-sanitize

### 15.3 文件系统安全
- 路径遍历防护: 禁止 `../`
- 权限控制: PermissionsMiddleware白名单
- 用户隔离: JuiceFSBackend按user_id隔离

---

## 16. 监控指标

### 16.1 关键指标
- **请求延迟**: P50/P95/P99
- **Token生成速度**: tokens/second
- **数据库连接池**: active/idle connections
- **Redis命中率**: hit_rate
- **错误率**: 5xx/4xx比例

### 16.2 日志规范
```python
logger.info(f"User {user_id} started session {session_id}")
logger.warning(f"Redis unavailable, fallback to DB")
logger.error(f"Tool execution failed: {tool_name}", exc_info=True)
```

---

## 17. 常见问题排查

### Q1: Agent不调用工具
- 检查 `enable_tool_calling` 配置
- 检查工具描述是否清晰
- 检查模型是否支持function calling

### Q2: 会话历史丢失
- 检查Redis连接
- 检查 `HybridSessionManager` 是否正确初始化
- 查看 `conversation_sessions` 表

### Q3: 生成内容不符合预期
- 检查学生画像是否正确加载
- 检查SKILL.md步骤是否清晰
- 检查SubAgent的系统提示

### Q4: 文件权限错误
- 检查 `FilesystemPermission` 配置
- 检查路径是否在允许范围内
- 检查 `virtual_mode` 是否启用

---

## 18. 未来规划

### 18.1 短期 (1-2个月)
- [ ] 完成学生画像API
- [ ] 实现异步任务队列 (Celery)
- [ ] 视频/PPT生成集成
- [ ] 云存储集成 (OSS/S3)

### 18.2 中期 (3-6个月)
- [ ] 多模态支持 (图片理解、语音输入)
- [ ] 实时协作编辑
- [ ] 移动端适配
- [ ] 知识图谱可视化

### 18.3 长期 (6-12个月)
- [ ] 联邦学习 (隐私保护)
- [ ] 自适应学习路径推荐
- [ ] 教师管理后台
- [ ] 开放API平台
