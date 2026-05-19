 # AI Agent 后端开发 — 面试题库（完整版）

> 岗位：基于大语言模型的 AI Agent 开发
> 项目：Mini-OpenClaw — 全栈 AI Agent 教育辅助系统
> 技术栈：Python / FastAPI / LangChain / LangGraph / Neo4j / PostgreSQL / Redis / Next.js

---

## 一、项目介绍类

### Q1：请介绍一下你的项目

Mini-OpenClaw 是一个基于大语言模型的 AI Agent 教育辅助系统，帮助大学生通过对话式交互学习深度学习等课程。

核心架构：
- **后端**：Python + FastAPI，用 LangChain/LangGraph 构建 Agent 执行引擎，Neo4j 做知识图谱，PostgreSQL 做持久化，Redis 做缓存
- **前端**：Next.js + React + TypeScript，AntV G6 做知识图谱可视化
- **AI 能力**：多智能体协作（1 主 Agent + 6 子 Agent）、RAG 混合检索（向量 + BM25 + 实体关系）、SSE 流式对话、意图分类快速路由、文件驱动的记忆和技能系统

特色是"文件驱动架构"——Agent 的身份、记忆、技能全部用 Markdown 文件管理，可审计、易调试、非工程师也能修改 Agent 行为。

---

### Q2：项目的整体架构是怎样的？

三层架构：

```
浏览器 → Next.js (port 3000) → FastAPI (port 8002) → 数据层
                                    ├── PostgreSQL（用户、会话、消息、评估）
                                    ├── Redis（会话缓存、限流）
                                    ├── Neo4j（知识图谱：1000+ 实体，2000+ 关系）
                                    └── 文件系统（Agent 记忆、技能、角色定义）
```

Next.js 通过 `next.config.ts` 的 rewrites 代理 `/api/:path*` 到后端，浏览器只访问 3000 端口。

后端核心模块：
- `agent.py` — AgentManager 单例，封装 LangGraph Agent，SSE 流式输出
- `api/chat.py` — 聊天端点，完整请求处理链路
- `router/` — 意图分类 + 快速路由
- `memory/` — System prompt 组装、三级会话管理
- `deepagents/` — 内嵌 Agent 框架，middleware 管道
- `tools/` — 5 个自定义 LangChain Tool
- `agents/` — 6 个专业子 Agent 定义

---

### Q3：你在这个项目中负责什么？

全栈开发，从架构设计到代码实现独立完成：
1. Agent 核心引擎：LangGraph 状态图组装、middleware 管道、Tool Calling
2. 多智能体系统：主 Agent 编排 + 6 个子 Agent 的定义和调度
3. RAG 检索系统：Neo4j 知识图谱构建、多策略混合检索
4. 后端服务：16 个 API 模块、JWT 认证、会话管理、评估系统
5. 前端界面：SSE 流式聊天、知识图谱可视化、学习效果 Dashboard

---

## 二、AI Agent 核心类

### Q4：Agent 的执行流程是怎样的？

用户发送消息后的完整链路：

1. **认证** — JWT 校验用户身份
2. **加载会话** — HybridSessionManager 从 Redis/PG 加载历史消息
3. **意图分类** — 两阶段：规则匹配（正则，0ms）→ LLM 兜底（~50ms）
4. **路由分发**：
   - `simple_qa` → FastResponder 直接调 LLM（<500ms）
   - `subagent_task` → 直接分发到对应子 Agent
   - `knowledge_query` → RAG 检索 + LLM
   - `complex_task` → 完整 Agent 链路（带工具调用）
5. **Agent 执行**（完整链路）：
   - 初始化 Agent（per-user 文件系统隔离）
   - 组装 system prompt（SOUL + IDENTITY + USER + AGENTS + MEMORY）
   - 加载工具（自定义 + DeepAgents 内置）
   - LangGraph 状态图执行（推理 → 工具调用 → 推理循环）
6. **流式输出** — SSE 事件推送到前端（token/tool_start/tool_end/status/error）
7. **持久化** — 消息双写到 Redis + PG

---

### Q5：多智能体是怎么协作的？

**主 Agent 编排 + 专业子 Agent** 模式。

主 Agent 负责理解用户意图、管理对话上下文、决定是否调用子 Agent。

6 个专业子 Agent：

| 子 Agent | 职责 | 输出格式 |
|---|---|---|
| lecture_writer | 生成深度讲义 | Markdown |
| mindmap_designer | 生成思维导图 | JSON |
| exercise_composer | 生成练习题 | JSON（选择+判断） |
| flashcard_composer | 生成闪卡 | JSON |
| reading_curator | 推荐阅读材料 | Markdown |
| code_case_builder | 生成代码案例 | Python |

协作机制：
1. 主 Agent 通过 `task` tool 将任务分发给子 Agent
2. 每个子 Agent 有独立 system prompt，从 `/roles/<name>.md` 加载
3. 子 Agent 内部工具调用事件通过 `_subagent_event_queue`（ContextVar）流回主 Agent 的 SSE 流
4. 子 Agent 执行完成后，结果返回主 Agent 继续处理

扩展方式：新增子 Agent 只需写一个 `.md` 文件 + 在 `resource_agents.py` 注册 + 在意图分类器加关键词映射，不改主 Agent 代码。

---

### Q6：什么是文件驱动架构？为什么这样设计？

**定义**：Agent 的所有配置——身份（IDENTITY.md）、人格（SOUL.md）、行为规范（AGENTS.md）、长期记忆（MEMORY.md）、技能定义（SKILL.md）——全部用 Markdown 文件存储，通过 middleware 在运行时注入 system prompt。

**为什么不用数据库或向量数据库？**
1. **可审计** — 直接打开文件看 Agent 完整行为定义
2. **易调试** — 修改 Agent 行为只需编辑文本文件，无需重启服务
3. **版本控制** — Markdown 文件可以用 Git 管理
4. **低门槛** — 非工程师（如教育专家）也能修改 Agent 教学风格
5. **可组合** — 不同用户有不同记忆文件，实现个性化

**实现**：DeepAgents 的 FilesystemBackend 提供虚拟 POSIX 文件系统，路径映射实现用户隔离（`/memory/` → 用户专属目录），MemoryMiddleware 在每次执行前加载文件注入 prompt。

---

### Q7：意图分类是怎么做的？为什么这样设计？

**两阶段分类**：

第一阶段：规则匹配（~0ms）
- 正则匹配关键词："思维导图" → subagent_task(mindmap_designer)，"讲义" → subagent_task(lecture_writer)，简单问候 → simple_qa

第二阶段：LLM 兜底（~50ms）
- 规则匹配不到时，调用一次 LLM（单条消息，无历史），用中文 system prompt 分类为四种意图之一

**为什么这样设计？**
- 80% 请求走规则匹配，延迟为 0
- 只有 20% 模糊请求需 LLM 分类
- 相比每次都走完整 Agent 链路（2-3s），整体延迟降低 60%+，LLM 调用量大幅减少

四种意图类型：

| 类型 | 处理方式 | 延迟 |
|---|---|---|
| simple_qa | FastResponder 直接调 LLM | <500ms |
| subagent_task | 直接分发子 Agent | 2-5s |
| knowledge_query | RAG 检索 + LLM | 1-3s |
| complex_task | 完整 Agent（带工具）| 2-10s |

---

### Q8：RAG 检索是怎么实现的？

**多策略混合检索**，在 Neo4j 上执行：

1. **全文索引检索** — 对 Chunk.content 做全文搜索
2. **实体名匹配** — Entity → APPEARS_IN → 关联 Chunk
3. **实体关系遍历** — Entity → RELATES_TO → 相关 Entity → APPEARS_IN → Chunk
4. **向量相似度检索** — 用 qwen3-embedding:8b（自部署）生成 embedding，余弦相似度搜索

结果处理：四路合并、去重、按综合得分排序，附带面包屑上下文（Course > Chapter > Section）。

**为什么用混合检索而非纯向量？**
- 向量检索擅长语义匹配，但对精确术语可能漏掉
- 全文检索擅长关键词匹配，但不理解同义词
- 实体关系可发现隐含关联（问"梯度消失"也能找到"BatchNorm"相关内容）
- 多策略互补，提高召回率

---

### Q9：System Prompt 是怎么组装的？

由 SystemPromptBuilder 按固定顺序组装：
1. **当前日期** — 注入真实日期，防止 LLM 日期幻觉
2. **SOUL.md** — Agent 人格（友好、专业、严谨、自适应语调）
3. **IDENTITY.md** — Agent 身份（名字、风格）
4. **USER.md** — 用户画像（学生信息、学习偏好）
5. **AGENTS.md** — 行为规范（~20KB 详细指令）
6. **MEMORY.md** — 长期记忆（Agent 自主维护）

技能不在 SystemPromptBuilder 中注入，由 SkillsMiddleware 运行时按需注入（渐进式披露）。

---

### Q10：什么是渐进式披露（Progressive Disclosure）？

**问题**：12 个技能，每个描述 500 token，全注入 prompt 占 6000 token，浪费且干扰。

**解决**：
1. prompt 中只列出技能名称和一句话描述（~50 token/个）
2. Agent 根据用户意图决定使用哪个技能
3. 决定后，SkillsMiddleware 才加载完整 SKILL.md 内容（含分步指令、允许工具列表等）

**效果**：prompt 中技能信息从 6000 token 降到 ~600 token，Agent 决策更聚焦。

---

### Q11：指令式技能系统从用户输入到技能执行的完整链路是什么？

```
用户输入 → SkillsManager 解析 → 技能匹配 → System Prompt 注入 → LLM 决策 → 工具调用 → 结果返回
```

详细流程：
1. **技能定义**：每个技能一个目录，包含 `SKILL.md`，frontmatter 定义名称、描述、所需工具
2. **技能加载**：SkillsManager 启动时扫描 skills 目录，解析所有 SKILL.md 的 frontmatter
3. **技能注入**：SkillsMiddleware 运行时将匹配的技能内容注入 system prompt
4. **LLM 决策**：根据注入的技能描述判断调用哪个技能，生成工具调用
5. **执行返回**：工具执行结果通过 SSE 流式返回前端

多技能冲突：依赖 LLM 上下文理解能力，在 prompt 中列出所有可用技能描述，由模型自主选择。

---

### Q12："Agent 操作全程可视化"是怎么实现的？

将 Agent 内部状态实时暴露给前端：

- **SSE 流式推送**：后端通过 StreamingResponse 将每一步操作（思考、工具调用、工具返回）以 SSE 事件推送
- **事件类型**：文本片段（text）、工具调用开始（tool_start）、工具调用结束（tool_end）、子代理状态（subagent_status）等
- **前端渲染**：根据事件类型渲染不同 UI 组件（思考气泡、工具调用卡片、结果展示等）

工具调用链展示：
- 每次工具调用携带工具名称、输入参数、执行结果
- SubAgent 操作通过事件队列同步到主 Agent 的 SSE 流
- 前端展示完整调用树，包括并行执行的 SubAgent

---

## 三、LangChain / LangGraph 类

### Q13：LangChain 和 LangGraph 有什么区别？为什么选 LangGraph？

**LangChain**：组件库，提供 LLM、Prompt、Tool、Memory 等标准化组件，Chain 是线性 LCEL 管道，适合简单 RAG 和单轮对话。

**LangGraph**：状态图框架，用图（节点+边）描述 Agent 执行流程，支持循环（推理→调用工具→再推理），内置 checkpoint 支持暂停/恢复。

**选 LangGraph 的原因**：
1. Agent 需要循环推理，LangGraph 状态图天然支持
2. 需要精细控制每步（工具调用前后的 hook），节点可插入 middleware
3. 未来需要 human-in-the-loop，LangGraph 内置支持
4. 需要流式输出中间状态，event stream 支持

---

### Q14：Tool Calling 是怎么实现的？

用 LangChain 的 `@tool` 装饰器定义工具：

```python
@tool
def knowledge_search(query: str, max_results: int = 5) -> str:
    """搜索知识库，查找与查询相关的课程内容"""
    # Neo4j 多策略检索
    ...
```

执行流程：
1. 用户消息 + 工具定义一起发给 LLM
2. LLM 返回 tool_call（工具名 + 参数）
3. LangGraph 自动执行对应工具
4. 工具结果作为 tool 角色消息追加到对话
5. LLM 再次推理（可能再调工具，循环直到给出最终回答）

5 个自定义工具：knowledge_search（Neo4j 检索）、python_repl（执行代码）、fetch_url（抓取网页）、course_structure（课程结构）、entity_graph（实体关系图）。

---

### Q15：Middleware 管道是怎么设计的？

类似 Express.js/Django 的 middleware 模式，每个 middleware 可以：在 Agent 执行前注入内容、注册额外工具、修改请求/响应、拦截执行。

组装顺序（create_deep_agent 中）：
```
TodoListMiddleware → SkillsMiddleware → FilesystemMiddleware →
SubAgentMiddleware → SummarizationMiddleware → PatchToolCallsMiddleware →
MemoryMiddleware → PermissionMiddleware
```

**为什么用 middleware 而不是硬编码？**
1. 可插拔：按需启用/禁用某个 middleware
2. 可组合：不同场景组装不同 middleware 链
3. 单一职责：每个 middleware 只关注一件事
4. 易测试：可单独测试每个 middleware

---

### Q16：Prompt 优化有哪些技巧？

1. **角色分离**：SOUL（人格）/ IDENTITY（身份）/ AGENTS（行为）分开管理
2. **渐进式披露**：Skill 按需加载，减少 token 浪费
3. **上下文注入**：注入当前日期（防幻觉）、用户画像（个性化）
4. **结构化输出**：要求 LLM 返回 JSON schema，用 Pydantic 校验
5. **Few-shot 示例**：在意图分类 prompt 中给出分类示例
6. **中文 Prompt**：意图分类用中文 system prompt 匹配中文输入
7. **约束指令**：在 AGENTS.md 中明确什么能做、什么不能做

---

### Q17：DeepAgents 框架和 LangChain/LangGraph 的关系是什么？做了哪些定制？

DeepAgents 是基于 LangChain/LangGraph 构建的上层框架：
- **底层依赖**：langgraph.graph.state.CompiledStateGraph、langchain.agents.create_agent
- **封装层**：create_deep_agent 统一入口，集成规划、文件系统、子代理、摘要等 middleware

**为什么二次开发而非直接用 LangGraph？**
- DeepAgents 提供文件系统抽象（FilesystemBackend）和权限控制，直接用 LangGraph 需自己实现
- 子代理编排已内置，包括异步子代理和事件队列
- 技能系统（SKILL.md 驱动的指令式调用）LangGraph 原生不支持

定制方向：接入教育场景工具（TTS、知识图谱、学生画像等），SSE 流式输出适配。

---

## 四、后端技术类

### Q18：FastAPI 和 Flask/Django 的区别？为什么选 FastAPI？

| 特性 | FastAPI | Flask | Django |
|---|---|---|---|
| 异步支持 | 原生 async/await | 需扩展 | 3.0+ 支持 |
| 类型校验 | Pydantic 自动校验 | 需手动 | DRF 序列化 |
| API 文档 | 自动生成 OpenAPI | 需扩展 | DRF 自动生成 |
| 性能 | 接近 Node.js/Go | 一般 | 一般 |
| SSE 支持 | 原生 StreamingResponse | 需扩展 | 需扩展 |

选 FastAPI 的原因：原生异步（Agent 调 LLM 是 IO 密集型）、SSE 天然支持、Pydantic 自动校验减少 boilerplate、自动生成 Swagger 文档方便调试。

---

### Q19：Redis 在项目中是怎么用的？

三个用途：

1. **会话热缓存** — HybridSessionManager 第一层存储。消息先写 Redis（TTL 24h），再异步写 PG。读取先查 Redis，miss 再查 PG 并回填。热会话延迟 <1ms。
2. **限流** — rate_limit_chat 中间件，用 Redis INCR + EXPIRE 实现滑动窗口限流。
3. **可扩展** — 未来可用 Redis Pub/Sub 做跨实例消息广播。

---

### Q20：PostgreSQL 在项目中怎么用的？数据模型怎么设计？

9 个核心模型：

| 模型 | 用途 | 关键字段 |
|---|---|---|
| User | 用户 | username, hashed_password, email |
| StudentProfile | 学生画像 | 6 个 JSONB 维度 |
| ConversationSession | 会话 | user_id, title, created_at |
| Message | 消息 | session_id, role, content, tool_calls |
| Resource | 资源 | user_id, type, path, metadata |
| LearningProgress | 学习进度 | user_id, course_id, progress |
| AsyncTask | 异步任务 | status, result |
| LearningEvent | 学习事件 | user_id, event_type, metadata |
| EvaluationReport | 评估报告 | user_id, scores, insights |

学生画像 6 个 JSONB 维度：学习风格、知识水平、兴趣偏好、认知能力、学习行为、情绪状态。

**为什么用 JSONB 而不是单独建表？** 画像维度频繁变化，JSONB 更灵活，可用 PostgreSQL JSONB 操作符查询，避免过度范式化。

---

### Q21：HybridSessionManager 的三级存储策略是什么？

```
Redis (热缓存) → PostgreSQL (持久化) → JSON 文件 (归档)
```

- **写入（双写）**：消息先写 Redis（设 TTL），异步写 PG，失败降级到 JSON
- **读取（缓存穿透）**：先查 Redis → miss 查 PG → 回填 Redis → PG miss 查 JSON
- **最终一致**：双写保证 Redis 和 PG 最终一致

**为什么这样设计？** 热会话在 Redis 读写极快，冷会话在 PG 可靠持久化，极端情况降级到 JSON 不丢数据。

---

### Q22：JWT 认证是怎么实现的？

**注册**：用户提交用户名+密码 → bcrypt 哈希后存 PG → 返回成功。

**登录**：提交用户名+密码 → PG 取用户 bcrypt 校验 → 生成 JWT token（含 user_id，设过期时间）→ 返回 token。

**认证**：前端存 token 到 localStorage → 每次请求 `Authorization: Bearer <token>` → FastAPI 的 `get_current_user` 依赖项解码校验 → 无效/过期返回 401。

**为什么用 JWT 而不是 Session？** 无状态（不需服务端存 session）、跨服务（微服务拆分时各服务只验签名）、前端友好（存 localStorage，不需 cookie）。

---

### Q23：消息队列在项目中怎么用的？

没有用 Kafka/RabbitMQ 等传统消息队列，但有类似异步处理模式：

1. **学习事件 fire-and-forget** — `POST /api/evaluation/events` 异步处理，前端发送后不等结果
2. **SSE 事件流** — 本质是轻量级"消息队列"，Agent 工具调用事件通过 SSE 推送前端
3. **子 Agent 事件队列** — ContextVar 中的 asyncio.Queue 用于事件传递

扩展方案：Redis Pub/Sub 做跨实例事件广播，Celery + Redis 做异步任务队列。

---

### Q24：Docker 在项目中怎么用的？

```yaml
# docker-compose.yml
services:
  frontend:  # Next.js (port 3000)
  backend:   # FastAPI (port 8002)
  postgres:  # PostgreSQL (port 5432)
  redis:     # Redis (port 6379)
  neo4j:     # Neo4j (port 7474/7687)
```

关键配置：环境变量通过 `.env` 注入（Pydantic Settings 读取）、数据卷挂载持久化、同一 Docker 网络服务名互访、每个服务配 healthcheck。

---

### Q25：多轮上下文压缩策略是什么？

从 `api/compress.py` 和 `deepagents/middleware/summarization.py` 可见：

- **触发时机**：对话轮数超阈值（如 10 轮）或 token 数接近模型上下文窗口限制
- **压缩方式**：调用 LLM 对历史对话生成精简摘要
- **保留内容**：最近 3-5 轮完整对话 + 更早轮次的摘要

关键信息不丢失保障：
- 压缩 prompt 要求保留"用户核心需求、关键决策、未完成任务"
- 压缩后摘要保留原始消息引用，必要时可回溯
- 学生画像等结构化信息独立存储，不受压缩影响

---

### Q26："响应延迟 < 200ms"怎么达成的？瓶颈在哪？

区分两个指标：
- **首 Token 延迟（TTFT）**：从发送消息到收到第一个 SSE 事件，这是 <200ms 指标
- **完整响应延迟**：数秒级别，取决于回复长度

达成 <200ms TTFT 的措施：
1. **SSE 流式输出** — 不等完整回复，逐 token 推送
2. **禁用 Thinking Mode** — `extra_body={"think": False}` 减少首 token 前等待
3. **Redis 热数据** — 会话上下文 <1ms 读取
4. **异步架构** — FastAPI 不阻塞事件循环

瓶颈：LLM API 网络往返（50-150ms）、模型首 token 推理时间。

---

### Q27：接口限流是怎么实现的？

从 `middleware/rate_limit.py` 可见：

- **限流粒度**：按用户（JWT 中 user_id）+ 按 IP（辅助）
- **算法**：滑动窗口，Redis INCR + EXPIRE 原子计数
- **配置**：普通接口 60 次/分钟，Chat 接口 20 次/分钟（LLM 调用成本高）
- **响应**：HTTP 429，响应头含 X-RateLimit-Remaining 和 X-RateLimit-Reset

---

### Q28：6 维学生画像包含哪 6 个维度？数据怎么采集和更新？

| 维度 | 含义 | 数据来源 |
|---|---|---|
| 知识掌握度 | 各知识点掌握程度 | 习题正确率、闪卡复习表现 |
| 学习风格 | 偏好方式（视觉/听觉/阅读）| 交互行为分析 |
| 认知水平 | 认知发展阶段 | Bloom 分类法评估 |
| 学习进度 | 课程完成度 | 模块完成情况 |
| 兴趣偏好 | 感兴趣的主题 | 主动提问主题分布 |
| 薄弱环节 | 需加强的知识点 | 错题分析、低掌握度知识点 |

采集：显式（习题作答、闪卡反馈）、隐式（交互行为日志）、LLM 推断（对话分析认知水平）。

更新：实时增量更新 + 每天批量重算 + 新用户冷启动默认画像。

---

## 五、Python 基础类

### Q29：asyncio 和多线程的区别？项目中怎么用的？

| 特性 | asyncio | 多线程 |
|---|---|---|
| 并发模型 | 协作式（单线程事件循环）| 抢占式（OS 调度）|
| 适用场景 | IO 密集型 | CPU 密集型 |
| 切换方式 | await 主动让出 | OS 强制切换 |
| 共享状态 | 无需锁（单线程）| 需要锁 |
| 开销 | 极低（~KB/协程）| 较高（~MB/线程）|

项目使用：FastAPI 全异步、asyncpg/aioredis 异步驱动、agent_manager.astream() 异步流式调用、LangGraph 异步节点执行。Agent 主要是 IO 等待（LLM API、数据库），asyncio 更高效。

---

### Q30：ContextVar 是什么？项目中怎么用的？

`contextvars.ContextVar` 是 Python 3.7+ 的上下文变量，在同一个异步上下文中共享数据，无需显式传参。

**关键用途**：子 Agent 事件透传。主 Agent 调用子 Agent 时，子 Agent 内部的工具调用事件需要流回主 Agent 的 SSE 流。通过 ContextVar，子 Agent 的工具执行函数可直接访问主 Agent 设置的事件队列，不需要层层传递参数。

**为什么不用全局变量？** 全局变量在并发请求间互相干扰，ContextVar 是 per-context 的，每个请求独立，asyncio 每个 task 有独立 context。

---

### Q31：Pydantic 在项目中怎么用的？

1. **配置管理** — Settings(BaseSettings) 自动加载环境变量、类型校验、默认值
2. **API 请求/响应模型** — FastAPI 路由类型注解，自动生成 OpenAPI 文档、自动校验
3. **SSE 事件类型** — TypedDict 定义事件结构
4. **LLM 输出校验** — 结构化输出时校验 LLM 返回的 JSON

---

### Q32：装饰器、生成器、上下文管理器在项目中怎么用的？

**装饰器**：`@tool`（LangChain 工具定义）、`@app.get/post`（FastAPI 路由）、`@retry`（LLM 调用重试）

**生成器**：SSE 流式输出 `async def stream_response() -> AsyncGenerator[str, None]`、LangGraph 事件流 `async for event in agent.astream_events()`

**上下文管理器**：数据库会话 `async with session_factory() as session`、Redis 连接 `async with redis.client() as conn`

---

## 六、系统设计类

### Q33：SSE vs WebSocket，为什么选 SSE？

| 特性 | SSE | WebSocket |
|---|---|---|
| 方向 | 单向（服务端→客户端）| 双向 |
| 协议 | HTTP | 独立协议（ws://）|
| 重连 | 浏览器自动重连 | 需手动实现 |
| 兼容性 | 所有 HTTP 基础设施 | 需代理支持 |
| 实现复杂度 | 低 | 高 |

选 SSE 原因：聊天场景本质是单向推送、HTTP 兼容（CDN/负载均衡/反向代理原生支持）、EventSource API 自动重连、实现简单（StreamingResponse 就够）。

---

### Q34：SSE 流式输出的实现细节？如何处理断连重连和背压？

**实现**：`text/event-stream` 协议，每个事件 `data: {json}\n\n`，事件类型包括 text、tool_start、tool_end、error、done。

**断连重连**：
- 服务端：连接断开时收到 CancelledError，触发清理
- 客户端：EventSource 自动重连，通过 Last-Event-ID 从断点恢复

**背压处理**：
- 问题：LLM 生成速度 > 客户端消费速度 → 内存积压
- 解决：asyncio.Queue 缓冲，设最大长度；队列满时等客户端消费再继续；长时间不消费则主动断开

---

### Q35：如何保证系统的可扩展性？

1. Middleware 管道可插拔 — 新功能加 middleware，不改现有代码
2. 子 Agent 独立定义 — 新增只需 .md 文件 + 一行注册
3. 虚拟文件系统隔离 — 路径映射实现多租户
4. 三级存储分层 — 热/温/冷数据自动分流
5. 意图分类路由 — 新增意图只需加规则/示例
6. API 版本化 — sessions_v2 与 sessions 共存，平滑迁移
7. 前端代理层 — Next.js proxy 解耦前后端

---

### Q36：如何处理高并发？

1. 快速路由减少 LLM 调用 — 80% 简单请求走规则匹配
2. Redis 缓存热数据 — 减少 PG 查询
3. 全异步 IO — asyncio 单线程处理大量并发
4. 限流中间件 — 防止单用户占过多资源
5. 流式输出 — 用户感知延迟低（首 token <200ms）
6. SSE 连接复用 — 每会话一长连接，减少握手开销

---

### Q37：如果要支持 1000 并发用户，你怎么优化？

**Agent 层**：LLM 调用是瓶颈 → 引入请求队列 + 异步批量处理；缓存高频问答；意图分类已优化 80% 不走 LLM。

**存储层**：Redis 集群水平扩展；PG 读写分离；Neo4j 分片。

**接入层**：Nginx 负载均衡多 FastAPI 实例；SSE 连接池 + 超时回收；CDN 静态资源。

---

### Q38：如果 LLM 返回结果质量不好，怎么排查和优化？

**排查**：
1. 看 system prompt — 是否清晰、完整、无歧义
2. 看对话历史 — 是否有干扰信息
3. 看工具调用 — RAG 检索结果是否相关
4. 看温度参数 — 是否过高导致随机性大

**优化**：
1. Prompt 优化 — 更明确指令、few-shot、输出格式约束
2. RAG 优化 — 调整检索权重、增加 reranking、优化 chunk 切分
3. 模型选择 — 简单任务小模型（快+便宜），复杂任务大模型
4. 后处理 — Pydantic 校验输出，不合格重试
5. 人工反馈 — 收集 thumbs up/down 用于 prompt 迭代

---

## 七、算法与数据结构类

### Q39：项目中用到了哪些数据结构和算法？

1. **图（Graph）** — 知识图谱存 Neo4j，BFS/最短路径做关系查询
2. **队列（Queue）** — asyncio.Queue 子 Agent 事件传递
3. **字典/哈希表** — 意图分类规则映射、SSE 事件类型分发
4. **正则表达式** — 意图分类第一阶段规则匹配
5. **排序算法** — RAG 检索结果按综合得分排序
6. **去重算法** — RAG 多路结果合并去重
7. **缓存策略** — LRU（Redis TTL）+ 三级存储分层

---

## 八、前沿技术类

### Q40：对 Agent 推理、多智能体协作的前沿技术有什么了解？

1. **ReAct（Reasoning + Acting）** — LLM 先推理再行动，我项目基于此模式
2. **Reflexion** — Agent 自我反思，从错误中学习，可在子 Agent 中加 self-critique 步骤
3. **AutoGen / CrewAI** — 微软/开源多 Agent 框架，支持 Agent 间对话
4. **Tool Learning** — 让 Agent 自动学习新工具用法
5. **Planning** — Plan-and-Solve 模式，先制定计划再执行
6. **Memory Consolidation** — 长期记忆的自动整理和遗忘机制

项目实践：ReAct 模式、多 Agent 协作、文件驱动记忆、渐进式技能披露。

---

### Q41：你对 Claude API 了解多少？

- 了解 Claude Messages API（与 OpenAI 格式类似）
- 项目用 DeepSeek API 是 OpenAI 兼容格式，切到 Claude 只需改 base_url 和 api_key
- 了解 Claude 的 system prompt 设计、tool_use 功能、extended thinking
- 了解 Anthropic SDK（anthropic Python 包）

---

## 九、场景题 / 开放题

### Q42：项目中遇到的最大技术挑战是什么？怎么解决的？

**方向一：上下文压缩与信息保持的平衡**
- 挑战：10+ 轮对话后压缩上下文同时保留关键信息
- 解决：基于 LLM 的智能摘要策略 + 学生画像等结构化信息作为持久记忆

**方向二：多 Agent 协作的一致性**
- 挑战：多个 SubAgent 并行执行时保证最终结果一致性
- 解决：事件队列机制，主 Agent 作为协调者汇总和去重子任务结果

**方向三：SSE 流式输出的稳定性**
- 挑战：长时间 Agent 任务中 SSE 连接容易超时断开
- 解决：心跳机制和断点续传，客户端断连后从断点继续接收

回答用 STAR 法则（Situation-Task-Action-Result），量化结果。

---

### Q43：如果重新做这个项目，你会改变哪些技术选型？

**可改进**：
1. 向量数据库 — 一开始就引入 pgvector 作为向量检索层，保持文件为 source of truth
2. 可观测性 — 引入 LangSmith/LangFuse 做 Agent 调用链追踪和监控
3. 测试覆盖 — 加强前端测试和 E2E 测试

**不应改变**（体现判断力）：
- DeepAgents 框架：教育场景下提供良好抽象
- SSE 流式输出：比 WebSocket 更适合单向推送
- 混合存储策略：Redis + PG + JSON 分层设计合理

---

### Q44："内容生成效率提升 60%"是怎么量化衡量的？

**对比基准**：人工编写 vs AI 辅助生成同等质量内容的时间。

| 内容类型 | 人工耗时 | AI 辅助耗时 | 效率提升 |
|---|---|---|---|
| 讲座生成 | ~2 小时 | ~40 分钟 | 67% |
| 习题集 | ~1.5 小时 | ~30 分钟 | 67% |
| 闪卡 | ~1 小时 | ~20 分钟 | 67% |
| 思维导图 | ~45 分钟 | ~15 分钟 | 67% |

60% 是各类型加权平均。AI 辅助耗时已包含人工审核微调时间。

---

## 十、岗位匹配度补充

### Q45：你熟悉 Spring Boot 吗？

主力是 Python/FastAPI，但核心思想相通：
- 依赖注入 → FastAPI 的 Depends()
- AOP/中间件 → middleware 管道
- 自动配置 → Pydantic Settings + env 文件
- ORM → SQLAlchemy（对应 MyBatis/JPA）
- REST Controller → FastAPI Router（对应 @RestController）

架构模式相同，可快速上手 Spring Boot。

---

### Q46：你熟悉 MySQL/Redis/Docker 吗？

- **PostgreSQL**（项目用的）和 MySQL 都是关系型数据库，SQL 基本一致，PostgreSQL 的 JSONB 更强
- **Redis** — 项目中做会话缓存和限流，熟悉常用命令和数据结构
- **Docker** — docker-compose 编排 5 个服务，熟悉 Dockerfile、数据卷、网络配置

---

## 十一、STAR 故事库（面试讲故事用）

### 故事 1：多智能体协作架构

- **S**：需要支持讲义、思维导图、练习题等多种内容生成
- **T**：设计可扩展的多 Agent 系统
- **A**：主 Agent + 6 专业子 Agent，通过 task tool 分发，ContextVar 实现事件透传
- **R**：新增子 Agent 只需 .md 文件 + 注册，零改动主链路

### 故事 2：意图分类快速路由

- **S**：所有请求走完整 Agent 链路，延迟高、成本高
- **T**：优化简单问题响应速度
- **A**：规则匹配（80%，0ms）+ LLM 兜底（20%，~50ms），四路分流
- **R**：简单问题响应从 2-3s 降到 <500ms，LLM 调用量减少 60%+

### 故事 3：文件驱动架构

- **S**：Agent 记忆、身份、技能需可审计、易调试
- **T**：设计透明的 Agent 配置体系
- **A**：所有配置用 Markdown/JSON，通过 middleware 注入 system prompt
- **R**：非工程师也能修改 Agent 行为，问题排查直接看文件

---

## 十二、反问面试官

1. 这个岗位主要负责的 Agent 场景是什么？（研发提效的具体方向）
2. 团队目前的 Agent 架构是什么样的？用的什么框架？
3. 多智能体协作在实际业务中是怎么落地的？
4. 对这个岗位的期望是偏 Agent 开发还是偏平台/工具开发？
5. 团队对 LLM 的选型策略是什么？（闭源 vs 开源，多模型切换？）

---

## 十三、应答技巧总结

1. **STAR 法则**：Situation → Task → Action → Result
2. **量化思维**：用数字说话（延迟、准确率、效率提升）
3. **Trade-off 思维**：每个技术决策都有利弊，展示权衡理解
4. **深入原理**：不停留在"用了什么"，要能解释"为什么用"和"怎么实现的"
5. **诚实坦然**：不确定的地方说"这部分我没深入参与，但我的理解是..."
