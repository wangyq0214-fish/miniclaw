# README - Mini-OpenClaw Documentation

## 文档索引

本文档体系为AI辅助开发设计，提供高密度技术信息和可执行工程规则。

---

## 📋 快速导航

### 核心文档
- **[ai-context.md](ai-context.md)** - 精简版AI上下文（100行以内，必读）
- **[ai-context-full.md](ai-context-full.md)** - 完整技术文档（深度参考）
- **[ai-rules.md](ai-rules.md)** - 工程规则与AI自检流程（强制执行）

### 模块文档
- **[api-layer.md](modules/api-layer.md)** - FastAPI路由层
- **[database-models.md](modules/database-models.md)** - 数据库设计与ORM
- **[agent-deepagents.md](modules/agent-deepagents.md)** - Agent框架与中间件
- **[session-management.md](modules/session-management.md)** - 会话管理与缓存
- **[tools-skills.md](modules/tools-skills.md)** - 工具与技能系统
- **[frontend.md](modules/frontend.md)** - Next.js前端架构

---

## 🎯 使用指南

### 对于AI助手
1. **首次接触项目**: 阅读 `ai-context.md`（5分钟快速理解）
2. **深入开发**: 参考 `ai-context-full.md` 和对应模块文档
3. **代码生成前**: 执行 `ai-rules.md` 中的自检流程
4. **遇到问题**: 查阅对应模块文档的"常见问题"章节

### 对于开发者
1. **项目概览**: 从 `ai-context.md` 开始
2. **架构理解**: 阅读 `ai-context-full.md` 第2章
3. **模块开发**: 参考对应的 `modules/*.md`
4. **代码审查**: 使用 `ai-rules.md` 作为检查清单

---

## 📊 项目概览

### 技术栈
```
后端: FastAPI + Python 3.12 + PostgreSQL + Redis + Neo4j
前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS
AI框架: LangChain 0.3 + LangGraph 0.2 + DeepAgents (自研)
```

### 核心功能
- ✅ 用户认证（JWT + Redis）
- ✅ 流式对话（SSE）
- ✅ 会话管理（Redis + PostgreSQL双写）
- ✅ Agent编排（DeepAgents中间件）
- ✅ 技能系统（动态加载SKILL.md）
- ✅ 工具调用（10个LangChain工具）
- 🚧 学生画像API
- 🚧 资源生成API
- 🚧 异步任务队列

### 数据库设计（7张表）
1. **users** - 用户基本信息
2. **student_profiles** - 6维度学生画像（JSONB）
3. **conversation_sessions** - 会话元数据
4. **messages** - 消息记录
5. **resources** - 资源索引
6. **learning_progress** - 学习进度
7. **async_tasks** - 异步任务

---

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                     │
│  ChatView | Sidebar | Inspector | Login                     │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API Layer: /chat /auth /sessions /files            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AgentManager + DeepAgents Framework                 │  │
│  │  Memory | Skills | Subagents | Permissions          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  HybridSessionManager (Redis + PostgreSQL)           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL | Redis | Neo4j | JuiceFS                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 开发规范

### 代码质量
- 函数长度 ≤ 50行
- 参数数量 ≤ 5个
- 嵌套深度 ≤ 3层
- 测试覆盖率 ≥ 80%

### 架构原则
- API层不直接访问数据库
- 使用依赖注入，禁止全局变量
- 配置通过环境变量，禁止硬编码
- 异步函数全程async/await

### 安全要求
- 密码bcrypt加密（cost≥12）
- SQL参数化查询
- 文件路径验证（防止遍历）
- JWT Token + Redis缓存

### 性能优化
- 避免N+1查询（使用joinedload）
- 使用连接池（pool_size=10）
- 热数据缓存（Redis TTL）
- 批量操作（bulk_insert）

---

## 📝 AI自检流程

在生成代码前，AI必须检查：

### ✅ 架构检查
- [ ] 是否违反分层原则？
- [ ] 是否使用了全局变量？
- [ ] 是否硬编码了配置？

### ✅ 代码质量检查
- [ ] 函数是否超过50行？
- [ ] 参数是否超过5个？
- [ ] 嵌套是否超过3层？

### ✅ 错误处理检查
- [ ] 是否缺少异常处理？
- [ ] 是否记录了错误日志？
- [ ] 外部依赖是否有降级方案？

### ✅ 安全检查
- [ ] 是否有SQL注入风险？
- [ ] 密码是否加密？
- [ ] 文件路径是否验证？

### ✅ 性能检查
- [ ] 是否有N+1查询？
- [ ] 是否使用了连接池？
- [ ] 热数据是否缓存？

### ✅ 测试检查
- [ ] 核心逻辑是否可测试？
- [ ] 是否需要Mock外部依赖？
- [ ] 是否提供了测试用例？

---

## 🚀 快速启动

### 后端
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入配置

# 初始化数据库
python migrate.py

# 启动服务
uvicorn app:app --host 0.0.0.0 --port 8002
```

### 前端
```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### 数据库
```bash
# PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15

# Redis
docker run -d -p 6379:6379 redis:7

# Neo4j (可选)
docker run -d -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5
```

---

## 📚 扩展阅读

### 项目根目录文档
- `PROJECT_SUMMARY.md` - 项目进度总结
- `TODO.md` - 任务列表（60+任务）
- `QUICKSTART.md` - 快速启动指南
- `DATABASE_DESIGN.md` - 数据库设计文档

### 后端文档
- `backend/README_AUTH.md` - 认证系统文档
- `backend/DATABASE_SETUP_COMPLETE.md` - 数据库配置完成
- `backend/JUICEFS_INTEGRATION_COMPLETE.md` - JuiceFS集成文档

### 测试文档
- `backend/tests/README.md` - 测试指南

---

## 🐛 故障排查

### 常见问题速查

#### 数据库连接失败
```bash
# 检查PostgreSQL
psql -U postgres -h localhost -p 5432

# 检查Redis
redis-cli ping
```

#### Agent不调用工具
- 检查 `enable_tool_calling` 配置
- 检查工具描述是否清晰
- 查看日志中的详细错误

#### 会话历史丢失
- 检查Redis连接
- 查看 `conversation_sessions` 表
- 确认 `HybridSessionManager` 初始化

#### 文件权限错误
- 检查 `FilesystemPermission` 配置
- 确认路径在允许范围内
- 使用虚拟路径（/workspace/...）

---

## 📞 联系方式

- **项目仓库**: [GitHub链接]
- **问题反馈**: [Issues链接]
- **技术讨论**: [Discord/Slack链接]

---

## 📄 许可证

[许可证类型]

---

## 🔄 文档更新日志

- **2026-04-27**: 初始版本，完成核心文档体系
  - ai-context.md (精简版)
  - ai-context-full.md (完整版)
  - ai-rules.md (工程规则)
  - 6个模块文档

---

**注意**: 本文档体系专为AI辅助开发设计，强调高密度信息和可执行规则。人类开发者可从 `ai-context.md` 开始阅读，逐步深入。
