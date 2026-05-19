---
schema_version: 1.0
last_updated: null
confidence_overall: 0.0
---

# 学生画像(Student Profile)

> 本文件由 `update_student_profile` 技能自动维护,每次更新同步追加到 `memory/profile_history.md`。
> 所有"知识基础"维度的实体名应与 Neo4j `Entity.name` 保持一致(必要时用 `get_entity_graph` 工具校对)。
> 初始状态所有字段为未知/空,Agent 根据对话证据按触发协议(见 AGENTS.md)增量填充。

## 1. 基础信息(Basic Info)
- 姓名 / 昵称:未知
- 专业:未知
- 年级 / 学段:未知
- 所在学校:未知
- 先修课程:未知
- 当前学习课程:未知
- last_updated: null
- confidence: 0.0

## 2. 学习目标(Learning Goals)
- 短期目标(1-4 周):未知
- 长期目标(学期级):未知
- 关键时间节点:(如考试、课程设计截止)未知
- 驱动动机:未知
- last_updated: null
- confidence: 0.0

## 3. 知识基础(Knowledge Foundation)
锚定 Neo4j `Entity` 节点的 name。每项格式:`概念名 — mastery(0-1) — 证据`。
- 已掌握(mastery ≥ 0.8):
  - (空)
- 部分掌握(0.4-0.8):
  - (空)
- 未学 / 薄弱(< 0.4):
  - (空)
- last_updated: null
- confidence: 0.0

## 4. 认知风格(Cognitive Style)
- 示例驱动 vs 理论驱动:未知
- 视觉(图/思维导图)vs 文本:未知
- 广度(横向跳跃)vs 深度(深挖单点):未知
- 抽象程度耐受:未知(能否接受纯公式 / 需要配合示例)
- last_updated: null
- confidence: 0.0

## 5. 易错点偏好(Error Patterns)
- 易混淆概念对:
  - (空)
- 反复卡点:
  - (空)
- 错题分类占比:概念型 — / 计算型 — / 应用型 —
- last_updated: null
- confidence: 0.0

## 6. 学习节奏(Learning Pace)
- 平均 session 时长:未知
- 提问频率:未知(高 / 中 / 低)
- 单概念停留时长:未知
- 主动探索 vs 被动接受:未知
- last_updated: null
- confidence: 0.0

## 7. 情感态度(Affective State)
- 自信度分布:未知(按主题分;如"数学推导 — 低、代码实现 — 中")
- 畏难点:未知
- 兴趣点:未知
- 挫折阈值:未知(连续答错几次会表达沮丧)
- last_updated: null
- confidence: 0.0

## 8. 交互偏好(Interaction Preferences)
- 回答长度偏好:未知(简短 / 中等 / 详细)
- 举例风格:未知(代码实例 / 数学推导 / 生活类比)
- 语言:未知(中文 / 英文 / 混合)
- 格式偏好:未知(bullet / 表格 / 长段落)
- last_updated: null
- confidence: 0.0

---

## 画像演化说明
每次更新由 `update_student_profile` 技能触发。
完整的变更轨迹保存在 `memory/profile_history.md`(append-only),本文件只保存最新快照。
