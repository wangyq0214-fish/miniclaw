# Agent & DeepAgents 模块

## 职责
Agent编排与执行，基于DeepAgents框架实现工具调用、技能加载、子Agent管理。

## 核心文件
```
backend/
├── agent.py                    # AgentManager主类
└── deepagents/                 # 自研Agent框架
    ├── __init__.py
    ├── graph.py                # create_deep_agent入口
    ├── backends/               # 文件系统后端
    │   ├── filesystem.py       # 本地文件系统
    │   ├── juicefs.py          # 多用户隔离存储
    │   └── protocol.py         # Backend协议
    └── middleware/             # 中间件系统
        ├── memory.py           # 记忆注入
        ├── skills.py           # 技能加载
        ├── subagents.py        # 子Agent管理
        ├── permissions.py      # 权限控制
        └── filesystem.py       # 文件系统中间件
```

## AgentManager核心实现

### 初始化
```python
class AgentManager:
    async def initialize(
        self,
        base_dir: Path,
        tools: List[BaseTool],
        session_manager,
        prompt_builder,
        memory_indexer,
        user_id: Optional[int] = None
    ):
        # 1. 初始化模型
        self._model = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=0.7
        )
        
        # 2. 选择Backend
        if settings.juicefs_enabled and user_id:
            self._backend = JuiceFSBackend(
                user_id=user_id,
                mount_point=settings.juicefs_mount_point,
                virtual_mode=True
            )
        else:
            self._backend = FilesystemBackend(
                root_dir=str(base_dir),
                virtual_mode=True
            )
```

### 流式执行
```python
async def astream(
    self,
    message: str,
    history: List[Dict],
    system_prompt: str,
    session_id: str
) -> AsyncGenerator[Dict, None]:
    # 1. 构建消息列表
    messages = self._build_messages(message, history)
    
    # 2. 创建Agent
    agent = create_deep_agent(
        model=self._model,
        tools=self.tools,
        system_prompt=system_prompt,
        backend=self._backend,
        memory=["/memory/MEMORY.md"],
        skills=["/skills/"],
        subagents=resource_subagents,
        permissions=[...]
    )
    
    # 3. 流式输出
    async for event in agent.astream({"messages": messages}):
        yield self._convert_event(event)
```

## DeepAgents中间件链

### 执行顺序
```
请求 → PermissionsMiddleware → FilesystemMiddleware → MemoryMiddleware 
     → SkillsMiddleware → SubAgentMiddleware → Model → 响应
```

### 1. MemoryMiddleware
**功能**: 自动注入长期记忆文件到上下文

```python
# 配置
memory=["/memory/MEMORY.md"]

# 行为
# 1. 读取 /memory/MEMORY.md
# 2. 注入到 system_prompt 末尾
# 3. 支持多个记忆文件
```

**使用场景**:
- 用户偏好记忆
- 历史对话摘要
- 项目上下文

### 2. SkillsMiddleware
**功能**: 从SKILL.md动态生成工具

```python
# 配置
skills=["/skills/"]

# 行为
# 1. 扫描 /skills/*/SKILL.md
# 2. 解析 frontmatter (name, description, allowed-tools)
# 3. 生成虚拟工具 invoke_skill_<name>
# 4. 工具被调用时创建SubAgent执行
```

**SKILL.md格式**:
```markdown
---
name: generate-lecture
description: 生成讲解文档
allowed-tools: read_file write_file get_entity_graph
---

# 执行步骤
### Step 1: 读学生画像
tool: read_file
input: {"path": "workspace/USER.md"}
...
```

### 3. SubAgentMiddleware
**功能**: 管理专业化子Agent

```python
# 配置
subagents=[
    SubAgent(
        name="lecture_writer",
        system_prompt=Path("workspace/roles/lecture_writer.md"),
        model=main_model,
        tools=main_tools
    )
]

# 调用方式
# 主Agent: "请生成反向传播的讲解"
# → 识别意图 → 调用 invoke_skill_generate_lecture
# → SkillsMiddleware创建SubAgent
# → SubAgent读取SKILL.md执行步骤
```

**子Agent列表**:
1. lecture_writer - 讲解文档生成
2. exercise_generator - 习题生成
3. mindmap_creator - 思维导图生成
4. reading_curator - 阅读清单生成
5. code_case_writer - 代码案例生成
6. HTML 动画由主 agent 直接生成（读 SKILL.md 后用 write_file）

### 4. PermissionsMiddleware
**功能**: 文件系统权限控制

```python
permissions=[
    # 允许读写workspace
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/workspace/**"]
    ),
    # 允许读写memory
    FilesystemPermission(
        operations=["read", "write"],
        paths=["/memory/**"]
    ),
    # 允许读任何地方
    FilesystemPermission(
        operations=["read"],
        paths=["/**"]
    ),
    # 拒绝写其他地方
    FilesystemPermission(
        operations=["write"],
        paths=["/**"],
        mode="deny"
    )
]
```

**规则优先级**: deny > allow

### 5. FilesystemMiddleware
**功能**: 虚拟文件系统映射

```python
# virtual_mode=True
# Agent视角: /workspace/file.txt
# 物理路径: /path/to/backend/workspace/file.txt

# 工具调用
read_file(path="/workspace/USER.md")
# → Backend.read("/workspace/USER.md")
# → 映射到物理路径
# → 返回内容
```

## Backend系统

### FilesystemBackend
**本地文件系统**:
```python
FilesystemBackend(
    root_dir="/path/to/backend",
    virtual_mode=True
)

# 路径映射
# /workspace/file.txt → /path/to/backend/workspace/file.txt
# /memory/MEMORY.md → /path/to/backend/memory/MEMORY.md
```

### JuiceFSBackend
**多用户隔离存储**:
```python
JuiceFSBackend(
    user_id=123,
    mount_point="/mnt/juicefs",
    fallback_dir="/path/to/backend",
    virtual_mode=True
)

# 路径映射
# /workspace/file.txt → /mnt/juicefs/users/123/workspace/file.txt
# 用户间完全隔离
```

**优势**:
- 云端存储，数据持久化
- 用户间隔离，安全性高
- 自动fallback到本地

## 事件流转换

### LangGraph事件 → Mini-OpenClaw事件
```python
async def _stream_and_convert(agent, messages):
    async for event in agent.astream(
        {"messages": messages},
        stream_mode=["messages", "updates"]
    ):
        mode, data = event
        
        if mode == "messages":
            chunk = data[0]
            if isinstance(chunk, AIMessageChunk):
                # 文本token
                if chunk.content:
                    yield {"type": "token", "content": chunk.content}
        
        elif mode == "updates":
            # 工具调用开始
            if "model" in data:
                for msg in data["model"]["messages"]:
                    for tc in msg.tool_calls:
                        yield {
                            "type": "tool_start",
                            "tool": tc["name"],
                            "input": tc["args"],
                            "id": tc["id"]
                        }
            
            # 工具调用结束
            if "tools" in data:
                for msg in data["tools"]["messages"]:
                    yield {
                        "type": "tool_end",
                        "tool": confirmed_tool_calls[msg.tool_call_id],
                        "output": msg.content,
                        "id": msg.tool_call_id
                    }
```

## 工具系统集成

### 工具注册
```python
from tools import get_custom_tools

tools = get_custom_tools(base_dir=PROJECT_ROOT)
# 返回: [read_file, write_file, get_entity_graph, ...]

await agent_manager.initialize(
    base_dir=PROJECT_ROOT,
    tools=tools,
    ...
)
```

### 工具调用流程
```
1. Agent决策调用工具
2. PermissionsMiddleware检查权限
3. FilesystemMiddleware映射路径
4. Backend执行实际操作
5. 返回结果给Agent
6. Agent继续推理
```

## 性能优化

### 1. 流式输出
- 每个token立即yield，降低首字延迟
- 工具调用实时反馈进度

### 2. 并发控制
```python
# 限制并发工具调用
semaphore = asyncio.Semaphore(5)

async def call_tool(tool, args):
    async with semaphore:
        return await tool.ainvoke(args)
```

### 3. 缓存策略
- 技能定义缓存（SKILL.md）
- 系统提示缓存
- 文件内容缓存（短期）

## 错误处理

### 1. 工具执行失败
```python
try:
    result = await tool.ainvoke(args)
except Exception as e:
    logger.error(f"Tool {tool.name} failed: {e}")
    yield {
        "type": "tool_end",
        "tool": tool.name,
        "output": f"Error: {str(e)}",
        "id": tool_call_id
    }
```

### 2. Backend不可用
```python
if settings.juicefs_enabled:
    try:
        backend = JuiceFSBackend(...)
    except JuiceFSError:
        logger.warning("JuiceFS unavailable, fallback to local")
        backend = FilesystemBackend(...)
```

### 3. 权限拒绝
```python
# PermissionsMiddleware自动拦截
# 返回错误信息给Agent
# Agent可以调整策略重试
```

## 测试策略

### 单元测试
```python
@pytest.mark.asyncio
async def test_agent_stream():
    agent_manager = AgentManager()
    await agent_manager.initialize(...)
    
    events = []
    async for event in agent_manager.astream("测试消息", [], "系统提示", "session_1"):
        events.append(event)
    
    assert any(e["type"] == "token" for e in events)
    assert events[-1]["type"] == "done"
```

### 集成测试
```python
async def test_skill_execution():
    # 测试技能调用完整流程
    response = await agent_manager.astream(
        "生成反向传播的讲解",
        [],
        system_prompt,
        "test_session"
    )
    
    # 验证生成的文件
    assert Path("workspace/generated/.../lecture.md").exists()
```

## 扩展指南

### 添加新Backend
```python
from deepagents.backends.protocol import Backend

class S3Backend(Backend):
    async def read(self, path: str) -> str:
        # 从S3读取
        ...
    
    async def write(self, path: str, content: str):
        # 写入S3
        ...
```

### 添加新Middleware
```python
from deepagents.middleware import Middleware

class LoggingMiddleware(Middleware):
    async def __call__(self, state, next_middleware):
        logger.info(f"Before: {state}")
        result = await next_middleware(state)
        logger.info(f"After: {result}")
        return result
```

## 常见问题

### Q1: 技能不被调用
- 检查SKILL.md的description是否清晰
- 检查allowed-tools是否包含所需工具
- 检查系统提示是否引导Agent使用技能

### Q2: 文件路径错误
- 确认virtual_mode=True
- 使用POSIX路径（/workspace/...）
- 检查PermissionsMiddleware配置

### Q3: SubAgent执行失败
- 检查workspace/roles/下的系统提示文件
- 确认SubAgent继承了正确的工具
- 查看日志中的详细错误信息
