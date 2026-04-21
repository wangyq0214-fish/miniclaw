---
name: update-student-profile
description: 基于最近对话抽取特征，更新 workspace/USER.md 的 8 维学生画像（基础信息/学习目标/知识基础/认知风格/易错点/学习节奏/情感态度/交互偏好），并追加演化记录到 memory/profile_history.md
allowed-tools: read_file write_file get_entity_graph
metadata:
  domain: education
  category: profile
---

# 学生画像更新技能

> **重要**:本文件是一份**指令(instruction)**,不是一个可调用的工具。触发时,Agent 应先用 `read_file` 工具读到本文件,然后用下面列出的 `read_file / write_file / get_entity_graph` 三个**工具**按步骤完成。禁止把 `update-student-profile` 这个名字当 tool 名去调用,那会报 "not a valid tool"。

## 目的

在对话中自主抽取学生特征，增量维护一份结构化的 8 维学生画像。画像供后续技能（generate-exercises、export_learning_plan、generate-mindmap 等）做个性化决策。

## 触发条件

由 `workspace/AGENTS.md` 的 **学生画像更新协议** 定义（专业/目标表述、答题、概念混淆、测试完成、显式命令等）。本技能只负责执行，不负责判断是否触发——触发判断在 AGENTS.md 里。

## 执行步骤（严格按顺序，每一步都用实际的 tool）

### Step 1：读当前画像
**tool**: `read_file`
**input**: `{"path": "workspace/USER.md"}`
取到现有 8 维快照（含 YAML frontmatter）。禁止凭记忆操作。

### Step 2：识别触发上下文与证据
回顾最近 3-10 轮对话，定位本次触发的**证据**：
- 用户的具体表述（引用原文或轮次序号）
- 做错的题目内容（如果是测试题触发）
- 被混淆的概念对

**原则**：无证据不更新。每个字段的变更都要能答得出"因为用户在 X 轮说了 Y"。

### Step 3：按 8 维对照抽取

对每个维度判断是否有新证据，有则抽取：

| 维度 | 抽取内容 |
|---|---|
| 1. 基础信息 | 专业 / 年级 / 学校 / 先修课程 等显式事实 |
| 2. 学习目标 | 短期目标、长期目标、时间节点、动机 |
| 3. 知识基础 | 每个涉及实体的 `mastery`（0-1 浮点）；实体名以 Neo4j `Entity.name` 为准，可用 `get_entity_graph` 工具(input `{"entity_name": "..."}`)校对拼写/同义词 |
| 4. 认知风格 | 示例/理论、视觉/文本、广度/深度、抽象耐受 |
| 5. 易错点 | 新增混淆对、反复卡点、错题分类计数 |
| 6. 学习节奏 | 提问频率、停留深度、探索主动性 |
| 7. 情感态度 | 自信度（按主题细分）、畏难点、兴趣点、挫折阈值 |
| 8. 交互偏好 | 长度、举例风格、语言、格式 |

**mastery 判定参考（维度 3）：**
- 正确回答 / 主动讲解清楚：+0.2 ~ +0.3
- 模糊回答 / 需要提示：0.4-0.6 区间
- 答错 / 概念混淆：-0.2 ~ -0.3，下限 0.1
- 新概念首次出现：初值 0.3（未学/薄弱）

**confidence 判定：** 单次证据 0.3-0.5；多次一致证据 0.6-0.8；与用户多次确认 0.8-1.0。

### Step 4：算 diff 合并
- 没有新证据的维度：**完全保留旧值**（包括旧的 last_updated 和 confidence）
- 有新证据的字段：更新值、更新该维度的 `last_updated` 为当前时间、更新该维度 `confidence`
- 更新顶部 `last_updated`（YAML frontmatter 里的）
- 重算 `confidence_overall`：8 个维度 confidence 的平均

### Step 5：写回 USER.md
**tool**: `write_file`
**input**:
```json
{
  "path": "workspace/USER.md",
  "mode": "write",
  "content": "<完整 8 维画像文本>"
}
```

**必须保留完整结构**：YAML frontmatter + 8 个二级标题节 + 说明尾部。即使某个维度没变也要原样写回。mode 必须是 `write` 不是 `append`。

### Step 6：追加演化日志
**tool**: `write_file`
**input**:
```json
{
  "path": "memory/profile_history.md",
  "mode": "append",
  "content": "<本次变更 diff>"
}
```

content 格式示例：
```
## 2026-04-19 10:30 — trigger: 测试题完成（session_xxx）
- 维度 3（知识基础）：
  - 反向传播：mastery 0.3 → 0.6（证据：第 5 题答对 + 能说清链式法则）
  - 新增 `卷积层`：mastery 0.4（证据：第 3 题部分正确）
- 维度 5（易错点）：
  - 新增混淆对：`感受野` ↔ `卷积核大小`（证据：第 2 题选错）
- confidence_overall: 0.42 → 0.51
```

**首次调用** profile_history.md 不存在，`write_file` 的 `append` 模式会自动创建，不需要预建。

### Step 7：告知用户
用**一句话**向用户汇报改了哪些维度，保持透明。例如：

> "已更新你的画像：知识基础（反向传播掌握度 0.3→0.6）、易错点（记录了感受野和卷积核大小的混淆）。"

不要罗列全部字段，只挑本次有变化的。

## 关键约束

1. **不要把 skill 名当 tool 名调用**:本技能的 Agent Skills 条目虽然叫 `update-student-profile`,但它不是 tool。你能调的 tool 只有 frontmatter 里 `allowed-tools` 列出的那三个(read_file / write_file / get_entity_graph)。如果你写出 `update-student-profile(...)` 的调用,会直接报 "not a valid tool" 错误 —— 一定要用 read_file 读到本文件,然后按步骤用真实 tool 执行。
2. **先 read 再 write**：每次都从磁盘读最新版本，防止覆盖他人（或用户在 Monaco 编辑器里）的并行修改。
3. **证据强制**：没证据的字段一个都不许改。
4. **敏感信息拦截**：身份证、手机号、密码、家庭住址等 → 拒绝写入，并告诉用户"这类信息我不会保存"。
5. **实体名校对**：维度 3 的每个概念名，如果是新加的、或拼写不确定，调一次 `get_entity_graph` 工具(input `{"entity_name": "<名>"}`)确认 Neo4j 里的规范名；返回 "No entity relationships found" 就按用户原话暂存（打 confidence 低分）。
6. **confidence 保守**：宁可低估不高估，避免让画像看起来比实际更"确定"。
7. **不删**：维度下面的条目一旦记录就不要因为几轮没提起就删除，只降 confidence。

## 示例执行

**用户上下文**：
> 用户："我是计算机大三的，想学深度学习，准备保研"

**Agent 执行**：

1. 用 `read_file` 工具(path=`workspace/USER.md`) → 得到初始空模板
2. 识别证据：触发场景 1（专业 + 年级）+ 场景 2（目标 + 动机）
3. 抽取：
   - 维度 1：专业=计算机科学与技术、年级=大三
   - 维度 2：长期目标=掌握深度学习、驱动动机=保研
4. 合并：其他维度保持空；维度 1、2 的 last_updated 置为当前时间，confidence=0.7（直接表述）
5. 用 `write_file` 工具(path=`workspace/USER.md`, mode=`write`, content=<完整新画像>)
6. 用 `write_file` 工具(path=`memory/profile_history.md`, mode=`append`, content=<diff 记录>)
7. 回复用户："记下来啦:你是计科大三学生,学习目标是深度学习,保研方向。后面我会按这个背景来给你讲解。"
