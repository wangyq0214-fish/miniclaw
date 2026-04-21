---
name: generate-lecture
description: Generate a structured markdown lecture document for a specific concept, calibrated to the student's mastery and cognitive style. Use when a student asks for a 讲解 / 教程 / 文档 / 介绍 of a concept.
allowed-tools: read_file write_file get_entity_graph get_course_structure search_knowledge_base
---

# 讲解文档生成技能

> **重要**:本文件是一份**指令**,不是可调用 tool。被 lecture_writer 子代理 read_file 读取后,按下方步骤用工具执行。

## 执行步骤

### Step 1:读学生画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

提取:
- 专业、年级(作为文档前言的"读者画像")
- 目标主题的 mastery(决定深度档位)
- 认知风格(示例 vs 理论、视觉 vs 文本)
- 易错点(每节点后特别提示这些)

### Step 2:查知识图谱
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<task 里的主题>"}`

拿到:
- outgoing → 本文档的下游应用章节建议
- incoming → 本文档开头的"前置要求"列表
- locations → 在课程里的位置(可引用章节号)

若 task 描述里提到多个子主题,对每个都查。若 Neo4j 不通(返回 "Cannot connect"),降级用 `search_knowledge_base(query=主题)` 从项目 knowledge 里找相关段落。

### Step 3:按模板写正文

模板骨架(全部为 Markdown,内部可嵌 LaTeX `$...$`):

```markdown
---
topic: <主题>
topic_slug: <slug>
target_mastery: <0-1>
student_style: <示例驱动|理论驱动>
generated_at: <ISO>
generated_by: lecture_writer
prerequisites: [<from entity_graph incoming>]
---

# <主题>

> 本文档为 <专业 / 年级> 学生量身定制,当前你的该主题掌握度约 <mastery>,本文目标把你带到 <目标 mastery>。

## 1. 为什么要学这个?(动机)
<用 1 个真实场景 / 痛点引出,≤ 200 字>

## 2. 定义(你只需要记住这一句话)
<最精炼定义,不超过 2 行>

## 3. 直觉(用类比 / 示例)
<按学生认知风格给 1-2 个类比,示例驱动学生多给例子,理论驱动学生多给数学直觉>

## 4. 机理(稍微展开)
- **核心公式 / 步骤**:<带简短推导或伪代码>
- **每一步在做什么**:<逐步解释>
- **为什么这样行得通**:<揭示关键洞察>

## 5. 举例走通一个具体案例
<一个完整案例,能从头算到尾,数字最好简单>

## 6. 边界与误区(针对易错点)
- ⚠️ <从学生画像维度 5 取的混淆点 / 卡点,每个一行说明>
- ⚠️ <通用易错点>

## 7. 小结
<3-5 条 bullet point>

## 8. 下一步建议
- **深入学习**:<指向 generate-exercises 出的题 / generate-reading-list 的资料>
- **后续主题**:<从 entity_graph outgoing 取,说明学这个主题能解锁什么>
```

### Step 4:长度校准

| 学生该主题 mastery | 档位 | 长度 |
|---|---|---|
| < 0.4 | 入门 | ≤ 1500 字 |
| 0.4 - 0.8 | 中阶 | 2000 - 3500 字 |
| ≥ 0.8 | 高阶 | 3000 - 5000 字 |

超出上限截断末尾,加 "...[阅读完整版请继续 task reading_curator 找进阶材料]"。

### Step 5:落盘
**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<YYYY-MM-DD>/<topic-slug>/lecture.md",
  "mode": "write",
  "content": "<完整文档>"
}
```

其中 `<YYYY-MM-DD>` = 执行日期,`<topic-slug>` = 小写英文/拼音短横线形式(backpropagation、convolutional-layer、gradient-descent)。

## 质量约束(硬性)

- 必须有 YAML frontmatter(topic/topic_slug/target_mastery/generated_at/generated_by)
- 必须引用学生画像的具体维度值(如 "针对你'偏示例驱动'的特点")
- 必须对齐该主题 mastery 档位
- 所有术语首次出现中文 + 英文括注
- 不能编造论文引用(需要引用就让 reading_curator 去找)
- 不能越权写到 `knowledge/generated/` 之外

## 示例调用(子代理视角)

收到 task:"生成反向传播的讲解,学生 mastery=0.3 偏示例"

1. read_file workspace/USER.md → 确认画像
2. get_entity_graph(entity_name="反向传播") → 得到 incoming=["链式法则","偏导数"], outgoing=["梯度消失","BPTT"]
3. 按入门档模板写 ≤ 1500 字,多给示例类比
4. write_file knowledge/generated/2026-04-19/backpropagation/lecture.md
5. 回报 "已生成 lecture.md(1200 字,7 节,含 2 个示例)"
