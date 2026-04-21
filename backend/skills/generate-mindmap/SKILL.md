---
name: generate-mindmap
description: Generate a Mermaid mindmap/graph that visualizes the hierarchical and dependency structure of a topic. Use when a student asks for 思维导图 / 概念图 / 知识梳理 / 一张图看懂.
allowed-tools: read_file write_file get_entity_graph get_course_structure
---

# 思维导图生成技能

> **重要**:不是 tool,是给 `mindmap_designer` 子代理读的指令。

## 执行步骤

### Step 1:读学生画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

关注:
- 维度 4(广度 vs 深度):广度偏好 → 多分支浅层;深度偏好 → 少分支深层
- 维度 3(已掌握实体):这些节点标 ✅,未学的标 ❓

### Step 2:查实体关系
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>", "depth": 2}`

用 depth=2 拿更广的语义邻域。若需要课程级别层次,追加 `get_course_structure`。

### Step 3:把关系映射成 Mermaid

**主干导图(mindmap)** — 展现层级:
```
mindmap
  root((<主题>))
    <subtopic 1>
      <leaf 1.1>
      <leaf 1.2>
    <subtopic 2>
      <leaf 2.1>
```

**依赖图(flowchart TD / graph TD)** — 展现前置关系:
```
graph TD
  A[链式法则] --> B[反向传播]
  C[偏导数] --> B
  B --> D[梯度消失]
  B --> E[BPTT]
```

### Step 4:选择图类型的启发式

| 场景 | 推荐语法 |
|---|---|
| 主题有明确的"上位-下位"分类 | `mindmap` |
| 主题有前置/派生依赖关系 | `graph TD` 或 `flowchart LR` |
| 要展示概念之间的关联(无明显方向) | `graph LR` |
| 时间序 / 算法流程 | `flowchart LR` |

一份 mindmap.md **可以同时包含多个 Mermaid 块**(推荐:1 个主干 + 1 个依赖图)。

### Step 5:添加学习状态标记

把节点名加后缀:
- 学生 mastery ≥ 0.6 的实体:`反向传播 ✅`
- mastery 0.3-0.6:`反向传播 🔶`
- mastery < 0.3 或未在画像里:`反向传播 ❓`

这让学生一眼看到自己的知识图谱"版图"。

### Step 6:落盘

**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<YYYY-MM-DD>/<topic-slug>/mindmap.md",
  "mode": "write",
  "content": "<完整 markdown>"
}
```

## 文件完整模板

```markdown
---
topic: <主题中文>
topic_slug: <slug>
node_count: <N>
max_depth: <M>
chart_count: <K>
generated_at: <ISO>
generated_by: mindmap_designer
---

# <主题> 思维导图

> 本图基于你的学习画像定制:✅ = 你已掌握 · 🔶 = 部分掌握 · ❓ = 待学

## 概念层级(主干)
\`\`\`mermaid
mindmap
  root((<主题>))
    分支1
      子节点1.1 ✅
      子节点1.2 🔶
    分支2
      子节点2.1 ❓
\`\`\`

## 依赖关系
\`\`\`mermaid
graph TD
  Pre1[前置概念 ✅] --> Main[<主题> 🔶]
  Pre2[前置概念 ❓] --> Main
  Main --> Down1[派生应用]
\`\`\`

## 阅读建议
- **先读**:标 ❓ 的前置节点(这些挡住了你理解主题)
- **巩固**:标 🔶 的节点(有一定基础,需要练习)
- **衔接**:标 ✅ 的派生节点(可以往下扩展)
```

## 硬性要求

- **节点总数**:8-30(超出请精简叶节点)
- **最大深度**:2-4 层
- **节点名**:≤ 10 字,术语保留英文
- **至少 1 个 Mermaid 代码块**,推荐 2 个(主干 + 依赖图)
- **YAML frontmatter 必填**所有字段

## 禁止

- 禁止只写文字不写 Mermaid 代码块(本技能的产出就是代码 + 少量说明)
- 禁止节点超过 30 个(信息过载)
- 禁止无 get_entity_graph 证据凭空编造关系
