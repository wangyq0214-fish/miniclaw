# AI Context - Mini-OpenClaw

## 项目定位
AI教育助手系统，基于LangChain/LangGraph的多Agent架构，支持个性化学习资源生成。

## 核心技术栈
**后端**: FastAPI + Python 3.12 + PostgreSQL + Redis  
**前端**: Next.js 16 + React 19 + TypeScript  
**AI框架**: LangChain 0.3 + LangGraph 0.2 + DeepAgents (自研)  
**数据库**: PostgreSQL (用户/会话) + Redis (Token缓存) + Neo4j (知识图谱)

## 架构分层
```
frontend/          # Next.js UI
backend/
  ├── api/         # FastAPI路由 (chat, auth, sessions, files)
  ├── agent.py     # AgentManager (DeepAgents封装)
  ├── deepagents/  # 自研Agent框架 (middleware + backends)
  ├── models/      # SQLAlchemy ORM (7张表)
  ├── tools/       # LangChain工具 (10个)
  ├── skills/      # Agent技能 (10个SKILL.md)
  ├── memory/      # 会话管理 (HybridSessionManager)
  ├── workspace/   # Agent工作区 (generated/, roles/)
  └── knowledge/   # 课程资源库
```

## 数据库设计 (7表)
1. **users** - 用户基本信息 (username, email, hashed_password)
2. **student_profiles** - 6维度画像 (JSONB: learning_style, knowledge_level, interest_preference, cognitive_ability, learning_behavior, emotional_state)
3. **conversation_sessions** - 会话元数据 (title, status, context_summary)
4. **messages** - 消息记录 (role, content, tool_calls JSONB)
5. **resources** - 资源索引 (type, file_path, metadata JSONB)
6. **learning_progress** - 学习进度 (topic, mastery_level, last_interaction)
7. **async_tasks** - 异步任务 (task_type, status, result JSONB)

## DeepAgents框架核心
- **FilesystemBackend**: 虚拟文件系统 (POSIX路径映射)
- **JuiceFSBackend**: 多用户隔离存储
- **MemoryMiddleware**: 自动注入 /memory/MEMORY.md
- **SkillsMiddleware**: 动态加载 /skills/*/SKILL.md
- **SubAgentMiddleware**: 6个资源生成子Agent (lecture_writer, exercise_generator等)
- **PermissionsMiddleware**: 路径级读写控制

## 关键工具 (10个)
read_file, write_file, get_entity_graph, get_course_structure, search_knowledge_base, fetch_url, python_repl, terminal, image_to_base64, knowledge_search

## 会话管理策略
- **Redis**: 热会话上下文 (TTL 7天)
- **PostgreSQL**: 持久化消息历史
- **HybridSessionManager**: 自动同步 Redis ↔ DB
- **自动压缩**: 20条消息触发，压缩50%旧消息

## 认证流程
JWT Token (30分钟过期) → Redis缓存 → 每个API用 `get_current_user` 依赖注入

## Agent执行流程
1. 用户消息 → `/api/chat` (SSE流式)
2. HybridSessionManager加载历史
3. AgentManager.astream() → DeepAgents
4. Middleware链: Memory → Skills → Permissions → Subagents
5. 流式输出: token / tool_start / tool_end / done
6. 保存到 Redis + PostgreSQL

## 资源生成流程
用户请求 → 主Agent识别意图 → 调用Skill → 触发SubAgent → 读USER.md画像 → 查Neo4j图谱 → 按模板生成 → 写入workspace/generated/

## 环境变量关键配置
- OPENAI_API_BASE / OPENAI_API_KEY / OPENAI_MODEL
- DATABASE_URL (PostgreSQL)
- REDIS_URL
- NEO4J_URI / NEO4J_PASSWORD
- SECRET_KEY (JWT)
- JUICEFS_ENABLED / JUICEFS_MOUNT_POINT

## 目录约定
- `/workspace/generated/YYYY-MM-DD/<topic>/` - Agent生成内容
- `/workspace/roles/*.md` - SubAgent系统提示
- `/knowledge/source/` - 课程源文件
- `/memory/` - 长期记忆文件
- `/skills/*/SKILL.md` - 技能定义

## 当前状态
✅ 基础架构完成 (数据库、认证、Agent框架)  
🚧 待开发: 学生画像API、资源生成API、异步任务队列
