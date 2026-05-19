# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

Mini-OpenClaw 是一个轻量级、全透明的 AI Agent 教育辅助系统，采用文件驱动架构，Agent 操作全程可视化。

## 技术栈

**后端** (Python 3.10+):
- FastAPI + Uvicorn (ASGI 服务器)
- DeepAgents 框架（自定义 Agent 编排）
- LlamaIndex (RAG: 向量 + BM25 混合检索)
- PostgreSQL (用户数据，通过 SQLAlchemy + asyncpg 异步访问)
- Redis (缓存、限流)
- Neo4j (知识图谱)

**前端** (Node.js 18+):
- Next.js 14 (App Router)
- React 19, TypeScript 5
- Tailwind CSS 4, shadcn/ui
- AntV G6 (知识图谱可视化)
- Monaco Editor, Zustand (状态管理)

## 开发命令

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app:app --port 8002 --host 0.0.0.0 --reload

# 前端
cd frontend
npm install
npm run dev          # 启动于 http://localhost:3000
npm run lint         # ESLint 检查
npm run build        # 生产构建
```

## 架构

### 后端结构

- `app.py` - FastAPI 入口，生命周期管理，路由注册
- `agent.py` - AgentManager，使用 DeepAgents 框架，支持流式输出
- `config.py` - Pydantic Settings，所有配置来自 `.env` 文件
- `database.py` - SQLAlchemy 异步引擎 + Redis 客户端初始化
- `deepagents/` - 自定义 DeepAgents 框架，中间件架构：
  - `middleware/` - 技能、记忆、权限、摘要、子代理
  - `backends/` - 文件系统、沙箱、复合存储后端
- `skills/` - Agent 技能目录，每个技能包含 `SKILL.md` 前置元数据
- `api/` - FastAPI 路由（chat, sessions, knowledge_graph, notes 等）
- `tools/` - 自定义 LangChain 工具（knowledge, entity_graph, python_repl）

### 前端结构

- `src/app/` - Next.js App Router 页面
- `src/components/` - React 组件，按功能组织：
  - `chat/` - ChatView, MarkdownRenderer, CodeBlock, ComposerInput
  - `graph/` - KnowledgeGraph (AntV G6), GraphDetailPanel
  - `inspector/` - 右侧面板：ContentCard, MindmapCard, WorkspaceBrowser
  - `dashboard/` - 学习分析：RadarChart, TrendLineChart, StatCards
  - `exercise/` - QuizList, FlashcardViewer, MistakeBook
  - `notes/` - NotesView 富文本编辑
- `src/lib/store.tsx` - 状态管理（React Context + useReducer）
- `src/lib/api.ts` - 后端 API 客户端，支持 SSE 流式请求

### 数据流

1. 用户输入 → 前端 (SSE 流) → 后端 `/api/chat`
2. Agent 规划器 → RAG 检索 (LlamaIndex) → 知识注入 (Neo4j)
3. LLM 生成 (DeepSeek API, SSE 流式输出) → 工具执行 (11 个技能)
4. 响应流式返回前端 → 可视化 (AntV G6)

### 关键模式

- **文件驱动架构**: 技能定义为 `SKILL.md` 文件，包含 YAML 前置元数据，运行时解析
- **用户隔离**: `backend/data/users/{user_id}/` 存储记忆、工作区、会话
- **SSE 流式传输**: 所有对话使用 Server-Sent Events 实现实时响应
- **中间件管道**: DeepAgents 使用可组合中间件（技能、记忆、权限、摘要）

## 环境配置

在 `backend/.env` 中配置：
- `OPENAI_API_KEY`, `OPENAI_API_BASE`, `OPENAI_MODEL` - LLM 配置
- `DATABASE_URL` - PostgreSQL 连接
- `REDIS_URL` - Redis 连接
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` - Neo4j 图数据库
- `SECRET_KEY` - JWT 认证密钥

## 技能系统

技能位于 `backend/skills/` 目录，每个技能包含 `SKILL.md` 文件：
```yaml
---
name: skill-name
description: 技能描述
tool: tool-name  # 可选：指定使用的工具
---
```

11 个内置技能：answer-question, evaluate-learning, generate-exercises, generate-flashcards, generate-lecture, generate-mindmap, generate-media-script, generate-reading-list, get-weather, tavily-search, update-student-profile

## 测试

```bash
cd backend
pytest tests/                    # 所有测试
pytest tests/test_e2e.py         # 端到端测试
pytest tests/test_knowledge.py   # 知识/RAG 测试
pytest tests/test_skills.py      # 技能测试
```

## 重要说明

- 前端使用 Next.js 16，有破坏性变更 - 编写代码前请查看 `node_modules/next/dist/docs/`
- 后端运行端口为 8002（非 8000）
- Neo4j 是可选的 - 基础聊天功能无需 Neo4j
- 用户数据按用户存储在 `backend/data/users/{id}/`
- 除 sessions_v2 外，所有 API 端点以 `/api/` 为前缀
