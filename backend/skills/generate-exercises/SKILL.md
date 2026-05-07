---
name: generate-exercises
description: Generate 5-8 targeted practice exercises as JSON (choice + true/false only) with per-option explanations, calibrated to the student's mastery and error patterns. Use when the student asks for 题 / 练习 / 测验 / 自测.
allowed-tools: read_file write_file get_entity_graph search_knowledge_base
---

# 练习题生成技能

> 指令文件,非 tool。被 `exercise_composer` 子代理读取执行。

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
- mastery → 决定难度分布
- 易错点(混淆对、反复卡点)→ 针对性设计 distractor
- 举例风格 → 应用题场景选学生兴趣领域

难度分布表:

| mastery | 简单 | 中等 | 难 |
|---|---|---|---|
| < 0.3 | 70% | 30% | 0% |
| 0.3-0.6 | 40% | 50% | 10% |
| 0.6-0.8 | 20% | 50% | 30% |
| > 0.8 | 10% | 30% | 60% |

### Step 2:获取实体信息（优先从 description 获取）

**如果 description 中已包含 entity_graph 结果（邻近实体、相关概念） → 直接使用。**
**如果 description 中没有 → 用 `get_entity_graph` 查询。**

outgoing 的邻近实体是选择题干扰项的黄金来源(学生容易把它们和主题混淆)。

### Step 3:查已有题库避免重复
**tool**: `read_file` · **input**: `{"path": "workspace/generated/exercises/<中文主题名>.json"}`

若已有同名文件,读出所有题干做去重(题干相似度 > 80% 判重)。若文件不存在(错误),说明是首次生成,跳过去重。

### Step 4:出 5-8 道题（仅选择题 + 判断题）

只出以下 **2 种题型**,禁止出简答题、计算题等其他题型:

#### 选择题(single_choice)
- 题干 1-3 行
- 4 个选项(A/B/C/D),干扰项至少 1 个取自易错点混淆对

#### 判断题(true_false)
- 1 行陈述
- 专门用来检测学生画像里的易错点 / 常见误解
- 解析里必须指出「为什么错」vs「正确表述」

### Step 5:写盘

**tool**: `write_file` · **input**:
```json
{
  "path": "workspace/generated/exercises/<中文主题名>.json",
  "mode": "write",
  "content": "<完整的 JSON>"
}
```

**文件名以中文为主**，专业术语可用英文，如 `循环神经网络.json`、`RNN基础.json`。系统会自动在文件名前注入日期。

**重要**: 输出 JSON 文件（非 Markdown），前端直接 `JSON.parse` 渲染。系统会自动在文件名前注入日期（如 `2026-05-04-rnn.json`），无需手动添加日期前缀。

**JSON 模板 — 必须严格遵循此结构，前端依赖此格式解析**:

```json
{
  "topic": "反向传播",
  "total": 2,
  "difficulty_distribution": {"基础": 2, "中等": 0, "困难": 0},
  "generated_at": "<系统提示中的当前日期>T10:30:00",
  "generated_by": "exercise_composer",
  "covered_topics": ["反向传播", "链式法则", "梯度下降"],
  "recommended_topics": ["优化算法", "计算图", "自动微分"],
  "questions": [
    {
      "question_id": "q1",
      "question_text_md": "反向传播算法的核心数学工具是？",
      "difficulty": "基础",
      "options": [
        {
          "id": "A",
          "is_correct": true,
          "text_md": "链式法则",
          "explanation_md": "反向传播通过链式法则把损失对各层参数的偏导逐层递推回去，这是深度学习训练的数学基石。"
        },
        {
          "id": "B",
          "is_correct": false,
          "text_md": "乘法法则",
          "explanation_md": "乘法法则是链式法则的一个子情况，但它只处理两个函数相乘的导数。反向传播涉及的是复合函数的求导，必须用链式法则。"
        },
        {
          "id": "C",
          "is_correct": false,
          "text_md": "分部积分",
          "explanation_md": "分部积分是积分学中的方法，用于求两个函数乘积的积分。反向传播是微分过程，和积分无关。"
        },
        {
          "id": "D",
          "is_correct": false,
          "text_md": "泰勒展开",
          "explanation_md": "泰勒展开用于用多项式逼近函数值，常见于数值分析。反向传播不需要逼近，而是精确计算偏导数。"
        }
      ]
    },
    {
      "question_id": "q2",
      "question_text_md": "梯度下降和反向传播是同一个概念",
      "difficulty": "基础",
      "options": [
        {
          "id": "A",
          "is_correct": false,
          "text_md": "正确",
          "explanation_md": "反向传播负责计算梯度，梯度下降负责用梯度更新参数。一个是「算」，一个是「用」，两者配合但本质不同。"
        },
        {
          "id": "B",
          "is_correct": true,
          "text_md": "错误",
          "explanation_md": "反向传播是计算梯度的算法，梯度下降是利用梯度更新参数的优化方法。两者配合使用，但不是同一个概念。"
        }
      ]
    }
  ]
}
```

### 解析撰写铁律

**每个选项必须有独立的 `explanation_md`，严禁所有选项共用同一段解析。**

- 正确选项 (`is_correct: true`)：正面阐述为什么正确，核心原理是什么
- 错误选项 (`is_correct: false`)：一针见血指出这个选项荒谬在哪里、容易和什么概念混淆，或者它其实描述了另一个什么知识点。**禁止**只重复正确答案

## 硬性要求

- 题目数 5-8 道,仅限选择题和判断题 2 种题型
- 难度分布必须匹配学生 mastery
- **每个选项都必须有独立的 `explanation_md`**（共用解析 = 废题）
- 选择题必须有 4 个选项
- 至少 1 道专门测学生画像里的易错点
- 输出 JSON 文件（非 Markdown）
- **`covered_topics`**: 从本次出题内容中提取 3-6 个核心知识点词条（简短名词，非完整题干），反映本次测验实际覆盖的考点
- **`recommended_topics`**: 基于本次考点的邻近知识、前置知识或进阶方向，推荐 3-5 个学生下一步应学习的主题
- **数学公式必须用 LaTeX 语法**：行内公式用 `$...$`，独立公式用 `$$...$$`。例如：`$h_t = \phi(W_{hh} \cdot h_{t-1} + W_{xh} \cdot x_t + b_h)$`。禁止用纯文本下标或 Unicode 符号替代 LaTeX

## 禁止

- 禁止出上次 exercises.json 里的原题(Step 3 去重)
- 禁止超出学生 mastery 上限 2 档以上(例如 mastery=0.3 出一堆 hard 题)
- 禁止 question_text_md 超过 5 行(过长题干学生不读)
- 禁止答案含糊
- 禁止生成 Markdown 文件（只生成 JSON）
- 禁止生成简答题、计算题、编程题等非选择/判断题型
- 禁止所有选项共用同一段解析
- **禁止在 JSON 字符串中使用 ASCII 双引号表示中文引号（必须用「」）**
