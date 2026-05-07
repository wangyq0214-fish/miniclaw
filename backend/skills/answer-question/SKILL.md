---
name: answer-question
description: Answer a student's specific question with profile-aware, multi-modal explanation. Use when the student asks X是什么/为什么/区别/举例/画图, not when they request full learning resource packs.
allowed-tools: read_file get_entity_graph search_knowledge_base
---

# 即时答疑技能

> 指令文件，非 tool。被主代理在「即时答疑协议」中通过 `read_file` 读取执行。

## 执行步骤

### Step 1: 读画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

提取：专业、年级、该主题 mastery、认知风格（视觉/示例/理论）、易错点。

### Step 2: 读知识图谱
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>"}`

获取相关概念、前置依赖、邻近实体（用于类比和区分）。

### Step 3: 搜索知识库
**tool**: `search_knowledge_base` · **input**: `{"query": "<学生的问题>"}`

查找是否有已有的讲义、笔记、代码案例可以引用。

### Step 4: 组织回答

根据学生认知风格选择回答方式：

| 认知风格 | 回答策略 |
|---------|---------|
| 视觉偏好 | 多用类比、图示描述、Mermaid 图（如请求） |
| 示例驱动 | 先给例子再抽象，代码优先 |
| 理论优先 | 先定义再推导，公式 + 证明 |

### Step 5: 回答

直接在对话中回复，**不写文件**。回答要求：
- 画像锚定：根据 mastery 调整深度（mastery < 0.3 用大白话，> 0.6 可以用术语）
- 有证据：引用 entity_graph 或 knowledge_base 的内容
- 无强证据时在首行标注 `⚠️ 无强证据，以下为通用解释`

### Step 6: 可选 — 触发画像更新

如果回答过程中暴露了新的 mastery 变化或易错点，告知主代理按「学生画像更新协议」处理。

## 禁止

- 禁止写 `answer.md` 等文件（答疑走对话流，不落盘）
- 禁止无画像锚定直接答（必须先读 USER.md）
- 禁止在所有回答中硬塞 Mermaid/LaTeX/代码块（按需使用）
- 禁止简单问题也派子代理（能一句话答的别拉长）
