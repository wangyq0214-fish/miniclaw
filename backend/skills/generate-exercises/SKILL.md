---
name: generate-exercises
description: Generate 5-8 targeted practice exercises (mixed types) calibrated to the student's mastery and error patterns. Output both human-readable Markdown and structured JSON. Use when the student asks for 题 / 练习 / 测验 / 自测.
allowed-tools: read_file write_file get_entity_graph search_knowledge_base
---

# 练习题生成技能

> 指令文件,非 tool。被 `exercise_composer` 子代理读取执行。

## 执行步骤

### Step 1:读画像 + 锁定难度
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

提取:
- 维度 3:目标主题 mastery → 决定难度分布
- 维度 5:易错点(混淆对、反复卡点)→ 针对性设计 distractor
- 维度 8:举例风格 → 应用题场景选学生兴趣领域

难度分布表:

| mastery | 简单 | 中等 | 难 |
|---|---|---|---|
| < 0.3 | 70% | 30% | 0% |
| 0.3-0.6 | 40% | 50% | 10% |
| 0.6-0.8 | 20% | 50% | 30% |
| > 0.8 | 10% | 30% | 60% |

### Step 2:查实体 + 找 distractor 素材
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>"}`

outgoing 的邻近实体是选择题干扰项的黄金来源(学生容易把它们和主题混淆)。

### Step 3:查已有题库避免重复
**tool**: `read_file` · **input**: `{"path": "knowledge/generated/<YYYY-MM-DD>/<topic-slug>/exercises.json"}`

若今日已有,读出所有 stem 做去重(题干相似度 > 80% 判重)。若文件不存在(错误),说明是首次生成,跳过去重。

### Step 4:按题型混合出 5-8 道

至少 **3 种题型** 混合:

#### 选择题(single_choice)
- 题干 1-3 行
- 4 个选项(A/B/C/D),干扰项至少 1 个取自易错点混淆对
- 标注 `tests_error_pattern`(如"链式法则 vs 乘法法则")

#### 判断题(true_false)
- 1 行陈述
- 专门用来检测学生画像里的易错点 / 常见误解
- 解析里必须指出"为什么错" vs "正确表述"

#### 简答题(short_answer)
- 问"解释 / 比较 / 举例 / 推导简短步骤"
- 给 sample_answer(标准答案要点),不要求逐字匹配

#### 计算题(computation) — 主题涉及公式时
- 给具体数值
- 标准答案 + 关键步骤解析

#### 编程题(coding) — 主题可编程演示时
- 给函数签名和输入输出说明
- 给 sample_solution(Python)

### Step 5:双格式落盘

**exercises.json**(结构化,供前端 / 批改系统消费):
```json
{
  "topic": "反向传播",
  "topic_slug": "backpropagation",
  "student_mastery_before": 0.3,
  "difficulty_mix": {"easy": 4, "medium": 2, "hard": 0},
  "generated_at": "<ISO>",
  "generated_by": "exercise_composer",
  "questions": [
    {
      "id": 1,
      "type": "single_choice",
      "difficulty": "easy",
      "concept_entities": ["链式法则"],
      "stem": "反向传播算法的核心数学工具是?",
      "options": {"A": "链式法则", "B": "乘法法则", "C": "分部积分", "D": "泰勒展开"},
      "answer": "A",
      "explanation": "反向传播通过链式法则把损失对各层参数的偏导递推回去。乘法法则是链式法则的一个子情况,但不是核心工具。",
      "tests_error_pattern": "链式法则 vs 乘法法则混淆"
    },
    {
      "id": 2,
      "type": "true_false",
      "difficulty": "easy",
      "concept_entities": ["梯度下降","反向传播"],
      "stem": "反向传播就是梯度下降",
      "answer": false,
      "explanation": "反向传播是计算梯度的算法;梯度下降是利用梯度更新参数的优化方法。两者是配合使用的,不是同一个东西。",
      "tests_error_pattern": "梯度下降 vs 反向传播混淆"
    }
  ]
}
```

**tool**: `write_file` · 两次调用:
1. `{"path": "knowledge/generated/<date>/<topic-slug>/exercises.json", "mode": "write", "content": "<JSON 字符串>"}`
2. `{"path": "knowledge/generated/<date>/<topic-slug>/exercises.md", "mode": "write", "content": "<从 JSON 派生的人读 Markdown>"}`

**exercises.md** 模板:
```markdown
---
topic: <主题>
total: 5
difficulty: {easy: 3, medium: 2, hard: 0}
generated_at: <ISO>
generated_by: exercise_composer
---

# <主题> · 练习(5 道)

> 难度基于你当前 mastery=0.3 定制,重点覆盖你的易错点「链式法则 vs 乘法法则」。

## 第 1 题(选择 · 简单)
反向传播算法的核心数学工具是?
- A. 链式法则
- B. 乘法法则
- C. 分部积分
- D. 泰勒展开

<details>
<summary>点击查看答案与解析</summary>

**答案**: A

**解析**: ...

**考点**: 链式法则混淆
</details>

---

## 第 2 题 ...
```

## 硬性要求

- 题目数 5-8 道,题型至少 3 种
- 难度分布必须匹配学生 mastery
- **每道题都必须有 explanation**(没解析的题是废题)
- 选择题必须有 4 个选项
- 至少 1 道专门测学生画像里的易错点(tests_error_pattern 非空)
- concept_entities 字段值必须能在 Neo4j 里找到

## 禁止

- 禁止出上次 exercises.json 里的原题(Step 3 去重)
- 禁止超出学生 mastery 上限 2 档以上(例如 mastery=0.3 出一堆 hard 题)
- 禁止 stem 超过 5 行(过长题干学生不读)
- 禁止答案含糊("大概是 A 吧")
