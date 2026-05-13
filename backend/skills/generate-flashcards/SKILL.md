---
name: generate-flashcards
description: Generate 10-20 flashcards as JSON for spaced repetition learning. Each card has front (question, ≤30 chars), back (answer, ≤150 chars), difficulty, category, and tags. Use when the student asks for 抽认卡 / 闪卡 / 记忆卡 / 复习卡.
allowed-tools: read_file write_file get_entity_graph search_knowledge_base
---

# 抽认卡生成技能

> 指令文件,非 tool。被 `flashcard_composer` 子代理读取执行。

## ⚠️ JSON 生死线（最高优先级，违反即文件报废）

你输出的必须是**合法 JSON**。以下是已知会导致 JSON 解析失败的错误：

| 错误写法 | 正确写法 | 说明 |
|---------|---------|------|
| `"这是"引号"问题"` | `"这是「引号」问题"` | JSON 字符串内的中文引号**必须**用「」角括号 |
| `"这是\"转义\"引号"` | `"这是「转义」引号"` | 虽然转义不报错，但角括号更安全、更易读 |
| 单行超过 2000 字符 | 适当换行 | 超长行可能导致序列化问题 |

**绝对禁止**在 JSON 字符串值中使用 ASCII 双引号 `"` 来表示中文引号。这是导致前端 JSON.parse 报错的第一大原因。

## 执行步骤

### Step 1:获取画像信息（优先从 description 获取）

主 agent 通常已在 task description 中提供了以下信息：
- 主题、mastery 值、易错点、认知风格、entity_graph 结果

**如果 description 中已包含这些信息 → 直接使用，不要重复 read_file/get_entity_graph。**
**如果 description 中缺少关键信息（如 mastery、易错点） → 用 read_file 读 `workspace/USER.md` 补全。**

提取:
- mastery → 决定卡片深度和难度分布
- 易错点(混淆对、反复卡点)→ 针对性制作强化卡片
- 举例风格 → 卡片背面用偏好的领域举例

难度分布表:

| mastery | 基础 | 中等 | 困难 |
|---|---|---|---|
| < 0.3 | 60% | 30% | 10% |
| 0.3-0.6 | 30% | 50% | 20% |
| 0.6-0.8 | 15% | 45% | 40% |
| > 0.8 | 10% | 30% | 60% |

### Step 2:获取实体信息（优先从 description 获取）

**如果 description 中已包含 entity_graph 结果（邻近实体、相关概念） → 直接使用。**
**如果 description 中没有 → 用 `get_entity_graph` 查询。**

邻近实体可以帮助制作对比卡片和关联卡片。

### Step 3:查已有卡片库避免重复
**tool**: `read_file` · **input**: `{"path": "workspace/generated/flashcards/<中文主题名>.json"}`

若已有同名文件,读出所有卡片正面做去重(相似度 > 80% 判重)。若文件不存在(错误),说明是首次生成,跳过去重。

### Step 4:生成 10-20 张卡片

#### 卡片设计原则

**原子化**: 每张卡片只包含一个知识点
- 正面：明确的问题或概念提示（≤30字）
- 背面：简洁准确的答案（≤150字）

**渐进式**: 从基础概念到进阶概念
- 前置知识的卡片排在前面

**记忆友好**: 使用类比、口诀、对比等记忆技巧

#### 卡片类型

1. **概念卡**: front 问"什么是X"，back 给出定义
2. **原理卡**: front 问"X的原理是什么"，back 解释核心机制
3. **对比卡**: front 问"X和Y的区别"，back 列出关键差异
4. **应用卡**: front 问"X的应用场景"，back 给出具体例子
5. **公式卡**: front 问"X的公式"，back 给出公式和含义

#### category 字段值

- `概念`: 定义、术语解释
- `原理`: 机制、算法、工作原理
- `对比`: 两个或多个概念的区别
- `应用`: 应用场景、使用方法
- `公式`: 数学公式、表达式

### Step 5:写盘

**tool**: `write_file` · **input**:
```json
{
  "path": "workspace/generated/flashcards/<中文主题名>.json",
  "mode": "write",
  "content": "<完整的 JSON>"
}
```

**文件名以中文为主**，专业术语可用英文，如 `循环神经网络.json`、`RNN基础.json`。系统会自动在文件名前注入日期。

**重要**: 输出 JSON 文件（非 Markdown），前端直接 `JSON.parse` 渲染。

**JSON 模板 — 必须严格遵循此结构，前端依赖此格式解析**:

```json
{
  "topic": "反向传播",
  "total": 3,
  "difficulty_distribution": {"基础": 1, "中等": 1, "困难": 1},
  "generated_at": "<系统提示中的当前日期>T10:30:00",
  "generated_by": "flashcard_composer",
  "covered_topics": ["反向传播", "链式法则", "梯度下降"],
  "recommended_topics": ["优化算法", "计算图", "自动微分"],
  "cards": [
    {
      "id": "fc1",
      "front": "什么是反向传播？",
      "back": "反向传播是训练神经网络的核心算法，通过链式法则从输出层向输入层逐层计算损失函数对各参数的偏导数（梯度），为参数更新提供方向。",
      "difficulty": "基础",
      "category": "概念",
      "tags": ["反向传播", "神经网络"]
    },
    {
      "id": "fc2",
      "front": "反向传播的数学基础？",
      "back": "反向传播基于链式法则（Chain Rule）。对于复合函数 $f(g(x))$，其导数为 $f'(g(x)) \cdot g'(x)$。神经网络中，损失对每层参数的梯度通过从后往前逐层应用链式法则得到。",
      "difficulty": "中等",
      "category": "原理",
      "tags": ["链式法则", "数学基础"]
    },
    {
      "id": "fc3",
      "front": "梯度消失与梯度爆炸的区别？",
      "back": "梯度消失：深层网络梯度逐层衰减趋近0，前层参数几乎不更新。梯度爆炸：梯度逐层放大，参数更新过大导致不稳定。两者都源于链式法则的连乘效应。解决方案：残差连接、BatchNorm、梯度裁剪等。",
      "difficulty": "困难",
      "category": "对比",
      "tags": ["梯度消失", "梯度爆炸"]
    }
  ]
}
```

## 硬性要求

- 卡片数 10-20 张
- 正面字数 ≤ 30 字
- 背面字数 ≤ 150 字
- 难度分布必须匹配学生 mastery
- 每张卡片必须是独立的、可单独理解的知识点
- 输出 JSON 文件（非 Markdown）
- **`covered_topics`**: 从本次生成内容中提取 3-6 个核心知识点词条
- **`recommended_topics`**: 基于本次考点推荐 3-5 个学生下一步应学习的主题
- **数学公式必须用 LaTeX 语法**：行内公式用 `$...$`，独立公式用 `$$...$$`

## 禁止

- 禁止生成与已有卡片重复的内容（Step 3 去重）
- 禁止正面超过30字或背面超过150字
- 禁止一张卡片包含多个知识点
- 禁止生成 Markdown 文件（只生成 JSON）
- 禁止在 JSON 字符串中使用 ASCII 双引号表示中文引号（必须用「」）
- 禁止省略 `covered_topics` 或 `recommended_topics` 字段
- 禁止生成过于宽泛或模糊的卡片（如"介绍一下X"）
