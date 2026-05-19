# Tools & Skills 模块

## 职责
LangChain工具定义和Agent技能系统，提供文件操作、知识检索、代码执行等能力。

## 目录结构
```
backend/
├── tools/                  # LangChain工具
│   ├── __init__.py
│   ├── read_file.py        # 文件读取
│   ├── write_file.py       # 文件写入
│   ├── entity_graph.py     # 知识图谱查询
│   ├── course_structure.py # 课程结构
│   ├── knowledge.py        # 知识库搜索
│   ├── fetch_url.py        # 网页抓取
│   ├── python_repl.py      # Python执行
│   ├── terminal.py         # Shell命令
│   └── image_to_base64.py  # 图片编码
└── skills/                 # Agent技能
    ├── generate-lecture/
    │   └── SKILL.md
    ├── generate-exercises/
    │   └── SKILL.md
    ├── generate-mindmap/
    │   └── SKILL.md
    ├── generate-reading-list/
    │   └── SKILL.md
    ├── generate-code-case/
    │   └── SKILL.md
    ├── generate-media-script/
    │   └── SKILL.md
    ├── answer-question/
    │   └── SKILL.md
    ├── evaluate-learning/
    │   └── SKILL.md
    ├── update-student-profile/
    │   └── SKILL.md
    └── tavily-search/
        └── SKILL.md
```

## 工具系统

### 1. read_file (文件读取)
```python
from langchain_core.tools import tool

@tool
def read_file(path: str) -> str:
    """
    读取文件内容
    
    Args:
        path: 文件路径（相对于base_dir）
    
    Returns:
        文件内容字符串
    """
    try:
        full_path = base_dir / path
        if not full_path.exists():
            return f"Error: File not found: {path}"
        
        # 安全检查：防止路径遍历
        if not str(full_path.resolve()).startswith(str(base_dir.resolve())):
            return f"Error: Access denied: {path}"
        
        return full_path.read_text(encoding='utf-8')
    except Exception as e:
        return f"Error reading file: {str(e)}"
```

### 2. write_file (文件写入)
```python
@tool
def write_file(path: str, content: str, mode: str = "write") -> str:
    """
    写入文件
    
    Args:
        path: 文件路径
        content: 文件内容
        mode: 写入模式 (write/append)
    
    Returns:
        操作结果
    """
    try:
        full_path = base_dir / path
        
        # 安全检查
        if not str(full_path.resolve()).startswith(str(base_dir.resolve())):
            return f"Error: Access denied: {path}"
        
        # 创建父目录
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        if mode == "append":
            with open(full_path, 'a', encoding='utf-8') as f:
                f.write(content)
        else:
            full_path.write_text(content, encoding='utf-8')
        
        return f"Success: File written to {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"
```

### 3. get_entity_graph (知识图谱查询)
```python
@tool
def get_entity_graph(entity_name: str) -> str:
    """
    查询知识图谱中的实体关系
    
    Args:
        entity_name: 实体名称（如"反向传播"）
    
    Returns:
        JSON格式的关系数据
    """
    try:
        from neo4j import GraphDatabase
        
        driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password)
        )
        
        with driver.session() as session:
            # 查询incoming关系（前置知识）
            incoming = session.run("""
                MATCH (target:Entity {name: $name})<-[r]-(source:Entity)
                RETURN source.name as name, type(r) as relation
                LIMIT 10
            """, name=entity_name).data()
            
            # 查询outgoing关系（后续主题）
            outgoing = session.run("""
                MATCH (source:Entity {name: $name})-[r]->(target:Entity)
                RETURN target.name as name, type(r) as relation
                LIMIT 10
            """, name=entity_name).data()
            
            return json.dumps({
                "entity": entity_name,
                "incoming": incoming,  # 前置知识
                "outgoing": outgoing   # 后续主题
            }, ensure_ascii=False)
    
    except Exception as e:
        logger.warning(f"Neo4j query failed: {e}")
        return json.dumps({"error": str(e)})
```

### 4. search_knowledge_base (知识库搜索)
```python
@tool
def search_knowledge_base(query: str, top_k: int = 5) -> str:
    """
    全文搜索知识库
    
    Args:
        query: 搜索关键词
        top_k: 返回结果数量
    
    Returns:
        相关文档片段
    """
    try:
        from llama_index.core import VectorStoreIndex
        
        # 加载索引
        index = VectorStoreIndex.from_persist_dir(
            str(base_dir / "storage" / "memory_index")
        )
        
        # 查询
        retriever = index.as_retriever(similarity_top_k=top_k)
        results = retriever.retrieve(query)
        
        # 格式化结果
        formatted = []
        for i, result in enumerate(results, 1):
            formatted.append(f"[{i}] {result.text}\n(来源: {result.metadata.get('source', 'unknown')})")
        
        return "\n\n".join(formatted)
    
    except Exception as e:
        return f"Error searching knowledge base: {str(e)}"
```

### 5. python_repl (Python执行)
```python
@tool
def python_repl(code: str) -> str:
    """
    执行Python代码
    
    Args:
        code: Python代码字符串
    
    Returns:
        执行结果或错误信息
    """
    try:
        # 安全沙箱
        allowed_modules = ['math', 'json', 'datetime', 'random']
        
        # 创建受限环境
        safe_globals = {
            '__builtins__': {
                'print': print,
                'len': len,
                'range': range,
                'sum': sum,
                'max': max,
                'min': min,
            }
        }
        
        # 执行代码
        exec_globals = safe_globals.copy()
        exec(code, exec_globals)
        
        # 捕获输出
        if 'result' in exec_globals:
            return str(exec_globals['result'])
        else:
            return "Code executed successfully (no result variable)"
    
    except Exception as e:
        return f"Error executing code: {str(e)}"
```

### 6. fetch_url (网页抓取)
```python
@tool
def fetch_url(url: str) -> str:
    """
    抓取网页内容
    
    Args:
        url: 网页URL
    
    Returns:
        网页文本内容
    """
    try:
        import httpx
        from bs4 import BeautifulSoup
        
        response = httpx.get(url, timeout=10)
        response.raise_for_status()
        
        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 移除脚本和样式
        for script in soup(['script', 'style']):
            script.decompose()
        
        # 提取文本
        text = soup.get_text()
        
        # 清理空白
        lines = [line.strip() for line in text.splitlines()]
        text = '\n'.join(line for line in lines if line)
        
        return text[:5000]  # 限制长度
    
    except Exception as e:
        return f"Error fetching URL: {str(e)}"
```

## 技能系统

### SKILL.md格式规范
```markdown
---
name: skill-name
description: 技能描述（Agent用于判断何时调用）
allowed-tools: tool1 tool2 tool3
---

# 技能标题

> 重要说明

## 执行步骤

### Step 1: 步骤名称
**tool**: tool_name
**input**: {"param": "value"}

说明文字...

### Step 2: 步骤名称
...

## 质量约束
- 约束1
- 约束2

## 示例调用
...
```

### 技能列表

#### 1. generate-lecture (讲解文档生成)
**功能**: 根据学生画像生成个性化讲解文档

**执行流程**:
1. 读取学生画像 (`workspace/USER.md`)
2. 查询知识图谱 (`get_entity_graph`)
3. 按模板生成Markdown
4. 写入文件 (`workspace/generated/YYYY-MM-DD/<topic>/lecture.md`)

**输出格式**:
```markdown
---
topic: 反向传播
target_mastery: 0.6
student_style: 示例驱动
---

# 反向传播

> 本文档为计算机科学专业学生定制...

## 1. 为什么要学这个?
...
```

#### 2. generate-exercises (习题生成)
**功能**: 生成针对性练习题

**题型**:
- 选择题
- 填空题
- 简答题
- 编程题

**难度分级**:
- 基础 (mastery < 0.4)
- 中等 (0.4 - 0.7)
- 困难 (> 0.7)

#### 3. generate-mindmap (思维导图生成)
**功能**: 生成Markmap格式思维导图

**输出格式**:
```markdown
# 深度学习

## 基础概念
- 神经网络
- 激活函数
- 损失函数

## 训练技巧
- 反向传播
- 梯度下降
- 正则化
```

#### 4. generate-reading-list (阅读清单生成)
**功能**: 推荐学习资料

**资料类型**:
- 教材章节
- 论文
- 博客文章
- 视频教程

#### 5. generate-code-case (代码案例生成)
**功能**: 生成可运行的代码示例

**语言支持**:
- Python
- JavaScript
- Java
- C++

#### 6. answer-question (问题回答)
**功能**: 回答学生提问

**策略**:
1. 检索知识库
2. 查询图谱关系
3. 结合学生画像
4. 生成个性化回答

#### 7. evaluate-learning (学习评估)
**功能**: 评估学习效果

**评估维度**:
- 知识掌握度
- 练习正确率
- 学习时长
- 进步速度

#### 8. update-student-profile (画像更新)
**功能**: 更新学生画像

**更新触发**:
- 完成练习
- 提出问题
- 学习新主题
- 行为模式变化

## 工具注册

### tools/__init__.py
```python
from langchain_core.tools import BaseTool
from typing import List
from pathlib import Path

def get_custom_tools(base_dir: Path) -> List[BaseTool]:
    """
    获取所有自定义工具
    """
    from .read_file import read_file
    from .write_file import write_file
    from .entity_graph import get_entity_graph
    from .course_structure import get_course_structure
    from .knowledge import search_knowledge_base
    from .fetch_url import fetch_url
    from .python_repl import python_repl
    from .terminal import terminal
    from .image_to_base64 import image_to_base64
    
    return [
        read_file,
        write_file,
        get_entity_graph,
        get_course_structure,
        search_knowledge_base,
        fetch_url,
        python_repl,
        terminal,
        image_to_base64,
    ]

def get_all_tools(base_dir: Path) -> List[BaseTool]:
    """
    获取所有工具（包括DeepAgents内置工具）
    """
    custom_tools = get_custom_tools(base_dir)
    # DeepAgents会自动添加文件系统工具
    return custom_tools
```

## 安全机制

### 1. 路径验证
```python
def validate_path(base_dir: Path, user_path: str) -> Path:
    """
    验证路径安全性
    """
    full_path = (base_dir / user_path).resolve()
    
    # 防止路径遍历
    if not str(full_path).startswith(str(base_dir.resolve())):
        raise ValueError(f"Path traversal detected: {user_path}")
    
    return full_path
```

### 2. 代码沙箱
```python
# 限制可用模块
ALLOWED_MODULES = ['math', 'json', 'datetime', 'random']

# 限制危险函数
BLOCKED_BUILTINS = ['eval', 'exec', 'compile', '__import__', 'open']

# 超时控制
import signal
signal.alarm(5)  # 5秒超时
```

### 3. 资源限制
```python
# 限制输出长度
MAX_OUTPUT_LENGTH = 10000

# 限制文件大小
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# 限制并发工具调用
MAX_CONCURRENT_TOOLS = 5
```

## 性能优化

### 1. 工具结果缓存
```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_entity_graph_cached(entity_name: str) -> str:
    return get_entity_graph(entity_name)
```

### 2. 异步工具
```python
from langchain_core.tools import tool

@tool
async def async_fetch_url(url: str) -> str:
    """异步网页抓取"""
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.text
```

### 3. 批量操作
```python
@tool
def batch_read_files(paths: List[str]) -> Dict[str, str]:
    """批量读取文件"""
    results = {}
    for path in paths:
        try:
            results[path] = read_file(path)
        except Exception as e:
            results[path] = f"Error: {str(e)}"
    return results
```

## 测试策略

### 单元测试
```python
def test_read_file():
    # 创建测试文件
    test_file = base_dir / "test.txt"
    test_file.write_text("test content")
    
    # 测试读取
    result = read_file("test.txt")
    assert result == "test content"
    
    # 清理
    test_file.unlink()

def test_path_traversal():
    # 测试路径遍历攻击
    result = read_file("../../../etc/passwd")
    assert "Error: Access denied" in result
```

### 集成测试
```python
async def test_skill_execution():
    # 测试技能完整流程
    agent = create_agent_with_skills()
    
    response = await agent.ainvoke(
        "生成反向传播的讲解文档"
    )
    
    # 验证生成的文件
    lecture_file = base_dir / "workspace/generated/.../lecture.md"
    assert lecture_file.exists()
    
    content = lecture_file.read_text()
    assert "反向传播" in content
    assert "---" in content  # 检查frontmatter
```

## 扩展指南

### 添加新工具
```python
# 1. 创建工具文件 tools/new_tool.py
from langchain_core.tools import tool

@tool
def new_tool(param: str) -> str:
    """工具描述"""
    # 实现逻辑
    return result

# 2. 在 tools/__init__.py 中注册
from .new_tool import new_tool

def get_custom_tools(base_dir: Path):
    return [
        # ... 其他工具
        new_tool,
    ]
```

### 添加新技能
```bash
# 1. 创建技能目录
mkdir backend/skills/new-skill

# 2. 编写SKILL.md
cat > backend/skills/new-skill/SKILL.md << 'EOF'
---
name: new-skill
description: 技能描述
allowed-tools: read_file write_file
---

# 技能标题

## 执行步骤
...
EOF

# 3. 创建SubAgent系统提示
cat > backend/workspace/roles/new_skill_agent.md << 'EOF'
你是XXX专家...
EOF

# 4. 重启服务，SkillsMiddleware自动加载
```

## 常见问题

### Q1: 工具调用失败
- 检查工具描述是否清晰
- 检查参数类型是否正确
- 查看日志中的详细错误

### Q2: 技能不被触发
- 检查SKILL.md的description
- 确认allowed-tools包含所需工具
- 优化系统提示引导Agent

### Q3: 路径权限错误
- 检查PermissionsMiddleware配置
- 确认路径在允许范围内
- 使用虚拟路径（/workspace/...）
