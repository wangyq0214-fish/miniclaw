---
name: generate-mindmap
description: Generate an interactive knowledge tree as JSON. Use when a student asks for 思维导图 / 概念图 / 知识梳理 / 一张图看懂.
allowed-tools: read_file write_file get_entity_graph get_course_structure
---

# 思维导图生成技能

> **重要**: 输出 JSON 树结构，每个节点带知识解释，不是 Mermaid。

## 🚨 硬性路径约束（最高优先级）

写盘路径**必须**为（注意：不要加 `/` 前缀，直接以 `workspace` 开头）：
```
workspace/generated/mindmaps/<中文主题名>.json
```

示例：`workspace/generated/mindmaps/循环神经网络.json`、`workspace/generated/mindmaps/反向传播.json`

**禁止写到任何其他路径**，包括：
- `/workspace/generated/mindmaps/<主题>.json` ❌（多加了 `/`）
- `/generated/mindmaps/<主题>.json` ❌
- `workspace/<主题>.json` ❌
- `workspace/mindmaps/<主题>.json` ❌
- 任何不以 `workspace/generated/mindmaps/` 开头的路径 ❌

**注意**：write_file 工具会提示需要"绝对路径"，但这里必须用 `workspace/...` 格式（不加前导 `/`），系统会自动处理路径。

## 执行步骤

### Step 1: 读学生画像
**优先从 task description 中获取画像信息**（mastery、易错点、认知风格等）。如果 description 中缺少关键信息，才用 `read_file` 读 `workspace/USER.md` 补全。

关注:
- 维度 4（广度 vs 深度）：广度偏好 → 多分支浅层；深度偏好 → 少分支深层
- 维度 3（已掌握实体）：这些节点标 ✅，未学的标 ❓

### Step 2: 查实体关系
**优先从 task description 中获取实体信息**。如果 description 中没有，才用 `get_entity_graph` 查询。
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>", "depth": 2}`

### Step 3: 组织 JSON 树

将实体关系组织为树形结构，**每个节点必须有知识解释**：
- **根节点** = 当前主题
- **一级子节点** = 核心分支
- **二级子节点** = 具体概念
- **三级子节点** = 细节（可选）

### Step 4: 层级约束

| 规则 | 要求 |
|---|---|
| 最大层级 | ≤ 3 层 |
| 每层节点数 | ≤ 5 个 |
| 节点名字数 | ≤ 10 字 |
| summary 字数 | ≤ 20 字 |
| details 每条字数 | ≤ 15 字 |
| details 条数 | 2~4 条 |
| 总节点数 | 8-25 个 |

### Step 5: 添加学习状态标记

- mastery ≥ 0.6：`反向传播 ✅`
- mastery 0.3-0.6：`反向传播 🔶`
- mastery < 0.3：`反向传播 ❓`

### Step 6: 落盘

**tool**: `write_file` · **input**:
```json
{
  "path": "workspace/generated/mindmaps/<中文主题名>.json",
  "mode": "write",
  "content": "<完整 JSON，含信封>"
}
```

**日期规则**: 文件名和 `generated_at` 字段必须使用系统提示中的「当前日期」，禁止照抄下方模板中的示例日期。

信封格式：
```json
{
  "title": "<主题中文>",
  "topic_slug": "<slug>",
  "node_count": 15,
  "max_depth": 3,
  "generated_at": "<系统提示中的当前日期>T12:00:00Z",
  "generated_by": "mindmap_designer",
  "tree": { "<根节点>" }
}
```

## 节点字段说明

```json
{
  "title": "卷积层 ✅",          // ≤ 10字，带状态标记
  "summary": "通过卷积核提取局部特征的网络层",  // ≤ 20字，一句话解释
  "details": [                    // 2~4条，每条 ≤ 15字
    "滑动卷积核扫描输入",
    "共享权重减少参数",
    "保留空间结构信息"
  ],
  "children": [],                 // 子节点数组
  "extra": null                   // 初始为null，用户点"深入理解"后填充
}
```

## 硬性要求

- **每个节点**必须有 title、summary、details 三个字段
- summary 要说清"这个概念是什么"
- details 要列出"关键要点"
- 输出格式：JSON（不是 Markdown，不是 Mermaid）
- 文件后缀：`.json`

## 禁止

- 禁止输出 Mermaid 代码块或 Markdown 格式
- 禁止节点缺少 summary 或 details
- 禁止无 get_entity_graph 证据凭空编造关系
