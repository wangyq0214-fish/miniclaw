---
name: evaluate-learning
description: Produce a multi-dimensional learning evaluation report from profile history, interaction logs, and test records, then emit a structured learning_plan.md that downstream resource generation consumes. Use when the student explicitly asks 评估 / 学习报告 / 我学得怎么样 / 我进步了吗 / 诊断.
allowed-tools: read_file write_file get_entity_graph get_course_structure
---

# 学习效果评估技能(Learning Evaluation)

> **重要**:本文件是一份**指令(instruction)**,**不是**可调用 tool。主代理自己读到本文件后,用下方列出的 `read_file / write_file / get_entity_graph / get_course_structure` 四个**工具**按步骤完成。**禁止**把 `evaluate-learning` 当 tool 名调用 —— 会报 "not a valid tool" 错误。

## 目的

miniclaw 已有「画像维护」「即时答疑」「资源生成」三条独立链路。本技能是**汇总评估层**:把既有数据(画像演化史 + 日志 + 测验记录 + 画像快照)综合成**多维度评估报告**,并把结论结构化写入 `workspace/learning_plan.md`,让后续「资源生成协同协议」按计划派发,形成「练 → 评 → 调 → 再练」闭环。

## 触发条件

由 `workspace/AGENTS.md` 的 **学习效果评估协议(LEARNING EVALUATION PROTOCOL)** 定义。本技能只执行,**仅在学生显式请求时触发**(不做自动周期/warm-up 触发)。

## 数据源(全 4 个,Step 1-4 依次读)

| 来源 | 提供什么 |
|---|---|
| `workspace/USER.md` | 8 维画像当前快照 + `confidence_overall` |
| `memory/profile_history.md` | mastery 变化轨迹 / 易错点增删记录(append-only diff) |
| `memory/logs/*.md`(最近 3 天) | 交互日志,用于参与度 / 情感状态评估 |
| `knowledge/generated/*/exercises.json` | 测验题目 + 学生画像 before 值 |

## 执行步骤(严格按顺序,每步用实际 tool)

### Step 1:读当前画像

**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

提取:
- 维度 1-2:专业 / 年级 / 短期目标 / 长期目标(用于目标达成评估)
- 维度 3:已掌握 / 部分掌握 / 未学三档的所有概念名 + mastery 值(用于覆盖度、轨迹对比)
- 维度 4:认知风格(用于资源派发建议的画像对齐项)
- 维度 5:易错点混淆对 / 反复卡点(用于易错点收敛评估)
- 维度 7:情感态度(配合 logs 里的词频做情感评估)
- `confidence_overall`(报告 frontmatter 的 `before` 值)

### Step 2:读画像演化史

**tool**: `read_file` · **input**: `{"path": "memory/profile_history.md"}`

- 若**文件不存在**(FileNotFoundError):标记 `data_completeness: low`,跳过本 step,其余步骤继续。
- 若存在:按 diff 块切分(每块以 `## <日期> <时间> — trigger:` 开头),按日期倒序取最近 14 天的所有 diff。
- 对每个概念整理 mastery 时间序列:`{topic: [(date, old_mastery, new_mastery, evidence), ...]}`,供 Step 6 轨迹分析用。

### Step 3:读近 3 天交互日志(受控采样,避免 token 爆炸)

列出 `memory/logs/` 下文件。**只**读最近 **3** 个(按文件名日期倒序)。每个文件:

**tool**: `read_file` · **input**: `{"path": "memory/logs/<YYYY-MM-DD>.md"}`

从每个日志里统计:
- session 数 / 会话总轮数
- 学生主动提问("?"结尾或含"为什么/怎么/什么是"的 user 消息)数
- 出现的畏难词("好难""不懂""放弃""看不进去")频次 → 情感维度
- 出现的兴奋词("哦原来""懂了""明白""有意思")频次 → 情感维度
- 被生成的资源类型(看 `write_file knowledge/generated/...` 的路径)

**若 logs 目录为空或最近 3 天无文件**:`data_completeness` 至少降级为 `partial`。

### Step 4:读测验记录(可选,尽力而为)

尝试按日期倒序读最近 3 天里 `knowledge/generated/<date>/<topic-slug>/exercises.json`。路径从 Step 3 logs 里的 write_file 记录反查得到;若 logs 里没提到过 exercises,跳过本步。

对每个 exercises.json:

**tool**: `read_file` · **input**: `{"path": "knowledge/generated/<date>/<topic-slug>/exercises.json"}`

提取:
- `topic`、`student_mastery_before`、`difficulty_mix`
- `questions[].tests_error_pattern`(这些是当时设计来测易错点的题 → 配合 profile_history 看是否消除了)

**关键说明**:`exercises.json` 本身**不含**学生的实际答题对错。正确率证据要从 `profile_history.md` 里 trigger="测试题完成 session_xxx" 的 diff 反推(那里记录了 mastery 怎么动的)。**匹配不上就标注"客观正确率未知,只能定性"**。

### Step 5:查课程结构(覆盖度分母)

**tool**: `get_course_structure` · **input**: `{"chapter_id": null}`(或不传,拿全课程)

- 返回成功:统计课程总概念数 `N_course`;配合 Step 1 USER.md 维度 3 的"已掌握"条数 `N_mastered` 算 `coverage_ratio = N_mastered / N_course`
- Neo4j 不通("Cannot connect" 或抛错):降级 —— `coverage_ratio = null`,只报绝对数 `N_mastered`,`data_completeness` 降级为 `partial`

### Step 6:多维分析(不调 tool,主代理综合 Step 1-5 的数据)

对**六个维度**分别评估。**每个维度的每条结论必须引用至少一条证据**(profile_history 的日期 + 原文片段,或 logs 行,或 exercises 题号)。

| 维度 | 怎么评 | 关键输出字段 |
|---|---|---|
| **1. 掌握度轨迹** | 用 Step 2 的 `{topic: [(date, old, new, ev)]}`,每个主题算 `delta_mastery = last.new - first.old`;标 `trend`:`rising \| flat \| falling` | 表 + Mermaid `graph LR` |
| **2. 覆盖度** | Step 5 的 `coverage_ratio` + USER.md 维度 3 的三档计数;"优先空白区"=和维度 2 短期目标语义关联的未学概念(可用 `get_entity_graph` 对目标主题查派生节点做关联) | 百分比 + `gap_topics` 列表 |
| **3. 易错点收敛** | 对 USER.md 维度 5 的每个混淆对,看 profile_history 最近 14 天内是否仍被触发("概念混淆"trigger);`converged` vs `persistent` | 两份列表 + 计数 |
| **4. 参与度** | Step 3 统计的 `sessions_per_week`、`questions_per_session`、资源利用率(生成的资源 vs 学生消费迹象 —— 如对生成的 lecture 是否提过 follow-up) | 数值指标 |
| **5. 情感状态** | USER.md 维度 7 + Step 3 词频(畏难 vs 兴奋比值);`confidence_trend`:`rising \| flat \| falling` | 一段质性描述 |
| **6. 目标达成** | USER.md 维度 2 的短期/长期目标 vs 覆盖度 + 涉及主题 mastery;贴 `on_track \| behind \| at_risk` | 状态 + 1-2 句诊断 |

### Step 7:写评估报告

**tool**: `write_file` · **input**:
```json
{
  "path": "memory/evaluation/<YYYY-MM-DD>.md",
  "mode": "write",
  "content": "<完整报告>"
}
```

`<YYYY-MM-DD>` = 执行当日。**同一天多次评估**会覆盖同日文件 —— 这是预期,保证每天最多一份最新报告。

报告模板(严格按此骨架,可按学生情况微调措辞,但节标题和 frontmatter 必须一致):

```markdown
---
report_date: <YYYY-MM-DD>
period_covered: <start_date> ~ <end_date>
student: <专业 / 年级>
confidence_overall_before: <值>
confidence_overall_now: <值>
topics_evaluated: <N>
data_completeness: full | partial | low
evaluator: learning_evaluator
---

# <学生描述> · 学习效果评估 · <日期>

## 总览
<3 句话:进步点 / 卡壳点 / 下一步焦点>

## 1. 掌握度轨迹(Mastery Trajectory)

\`\`\`mermaid
graph LR
  A0[反向传播 0.3] -->|+0.4, rising| A1[反向传播 0.7 ✅]
  B0[梯度消失 0.2] -->|+0.1, flat| B1[梯度消失 0.3 🔶]
\`\`\`

- **反向传播**:0.3 → 0.7(证据:profile_history 2026-04-14 "答对第 5 题 + 能说清链式法则")
- **梯度消失**:0.2 → 0.3(证据不足,建议下轮测验重点覆盖)

## 2. 覆盖度(Coverage)
- 已掌握 ≥ 0.6:3 / 24 章概念(12.5%)
- 部分掌握 0.3-0.6:5 / 24(20.8%)
- 空白 < 0.3:16 / 24(66.7%)
- **优先空白区**(与短期目标「4 周掌握反向传播基础」关联):「BPTT」「Dropout」

## 3. 易错点收敛
- ✅ 已收敛:「链式法则 vs 乘法法则」(profile_history 最近 14 天无复发)
- ⚠️ 仍存在:「反向传播 vs 梯度下降」(profile_history 内 2 次复发,最近一次 2026-04-17)

## 4. 参与度
- 近 3 天 sessions:4 次,平均 23 分钟
- 主动提问占比:70%(高)
- 资源利用:生成了 2 个 topic 的 lecture + 1 轮 exercises

## 5. 情感状态
- 自信度:上升(维度 7 confidence 0.3 → 0.5,logs 里畏难词频次下降)
- 畏难点:数学推导仍说"看不进去",建议调整为视觉优先
- 挫折阈值:连续错 2 题即求助,符合既有画像

## 6. 目标达成
- 短期目标(4 周掌握反向传播基础):✅ on_track(快于计划)
- 长期目标(学期内通关深度学习):⚠️ behind(覆盖度 12.5%,距 50% 里程碑还远)

## 推荐调整(动态策略)
1. **节奏**:每日 session 从 23 min 提到 30-45 min
2. **主题优先级**:反向传播已毕业,主攻「BPTT」「Dropout」
3. **资源组合**:示例 + 视觉驱动 → `media_director` / `code_case_builder` 权重调高,`reading_curator` 权重调低
4. **易错点专项**:专测「反向传播 vs 梯度下降」区分度的 5 道题

## 下一步
1. 生成「BPTT」的学习包(按 learning_plan 指示,定制资源组合)
2. 做一轮反向传播易错点专测
3. 1 周后再评估一次

> 本报告已同步更新 `workspace/learning_plan.md`,后续「给我学习材料」会基于计划派发。
```

### Step 8:写/覆盖学习计划

**tool**: `write_file` · **input**:
```json
{
  "path": "workspace/learning_plan.md",
  "mode": "write",
  "content": "<完整计划>"
}
```

**设计原则**:
- 只保留最新版,`mode` **必须**是 `write`(每次覆盖)
- `valid_until` = 报告日期 + 7 天
- 主题名**必须**在 USER.md 维度 3 的已学/部分/未学三档中出现过,**或**通过 `get_entity_graph(entity_name=<主题>)` 验证过 Neo4j 里有对应节点(避免生造)

计划模板:

```markdown
---
generated_at: <ISO, 用当前时间>
source_evaluation: memory/evaluation/<YYYY-MM-DD>.md
valid_until: <YYYY-MM-DD + 7 days>
confidence_overall: <值>
planner: learning_evaluator
---

# <学生描述> 学习计划 · <日期>

## 当前阶段
<1 句概括学生位置,例:"已掌握反向传播基础,正在向 RNN 方向过渡">

## 本周优先主题(按优先级降序)

### 1. BPTT
- **mastery 起点 → 本周目标**: ~0.0 → 0.5
- **推荐资源组合**: `lecture_writer` + `media_director`(storyboard 模式)+ `code_case_builder`
- **深度档**: 入门档(≤ 1500 字讲解 + 2 个最小代码案例)
- **画像对齐**: 示例驱动 + 视觉 → 故事板权重高;数学推导简化

### 2. Dropout
- **mastery 起点 → 本周目标**: ~0.0 → 0.5
- **推荐资源组合**: `lecture_writer` + `exercise_composer`
- **深度档**: 入门档
- **易错点预警**: 常和「正则化 L2」混淆,exercises 出一道对比题

## 暂缓主题
- **Adam 优化器** — 先把 BPTT 和 Dropout 巩固了再说

## 节奏建议
- 每日 session 时长:30-45 分钟
- 练习频次:每 2 个主题后 1 轮 exercises

## 资源派发建议(给 orchestrator 的硬提示)
当学生发"给我 X 的学习材料 / 学习包"请求时,orchestrator 在「资源生成协同协议」Step 1.5 读到本文件后按下面决策:
- X 若在「本周优先主题」→ 按该主题列出的「推荐资源组合」派发,**其他子代理省略**
- X 在「暂缓主题」→ 只派 `lecture_writer`(避免干扰优先级)
- X 未列出 → 按原协议默认全量 6 子代理
- 始终把「深度档」「画像对齐」作为 task description 的一部分传给子代理
```

### Step 9:透明回复学生

用**一段话**告诉学生:写了哪份报告、更新了哪份计划、2-3 条主要结论、1 条下一步建议。示例:

> "学习效果评估已完成,报告写到 `memory/evaluation/2026-04-19.md`。核心结论三条:① 反向传播 mastery 0.3 → 0.7 达标 ✅ ② 覆盖度 12.5% 偏低,距长期目标差得远 ③「反向传播 vs 梯度下降」易错点仍在复发,需专项。同时已更新 `workspace/learning_plan.md`,下周主攻 BPTT + Dropout,你下次说『给我 BPTT 的学习材料』我会按计划定制派发(讲解 + 故事板 + 代码案例三件套)。"

---

## 硬性要求

1. **Step 1、2 必读**:画像快照 + 演化史是评估的地基
2. **证据强制**:每个维度结论至少 1 条证据引用(profile_history 日期 / logs 行 / exercises 题号)—— 不能凭感觉打分
3. **诚实标注数据完整度**:frontmatter `data_completeness` 按 Step 2-4 的实际读到情况填 `full / partial / low`
4. **计划有效期必填**:`valid_until` = 报告日期 + 7 天,不得省略
5. **计划主题必须有出处**:出现在 learning_plan 的主题,要么在 USER.md 维度 3 已记录,要么通过 `get_entity_graph` 验证过

## 禁止

- **禁止**把 `evaluate-learning` 当 tool 名调用(skill ≠ tool)
- **禁止**跳过证据 —— 不能写"你进步很大"这类空话
- **禁止**在 `learning_plan.md` 里凭空编造主题 —— 画像 / Neo4j 找不到的主题不许推荐
- **禁止**读超过 3 天 logs(token 控制,避免爆长上下文)
- **禁止**把评估结论写回 `workspace/USER.md` —— 那是 `update-student-profile` 技能的职责;本技能**只读**画像,**写**报告 + 计划两个目标文件
- **禁止**在同一次执行里调用 `write_file` 超过 2 次(1 次写报告 + 1 次写计划,不额外落盘)

## 示例执行

**学生消息**:
> "评估一下我的学习进度,我学得怎么样?"

**主代理执行**:

1. `read_file` 工具(path=`workspace/USER.md`)→ 拿 8 维画像:计科大三,confidence_overall=0.45,反向传播 mastery=0.7,梯度消失 mastery=0.3,易错点有「反向传播 vs 梯度下降」混淆对。
2. `read_file` 工具(path=`memory/profile_history.md`)→ 按 diff 切分,得到反向传播 mastery 轨迹 `[(2026-04-14, 0.3, 0.3, 首次), (2026-04-17, 0.3, 0.6, 答对第5题), (2026-04-19, 0.6, 0.7, 主动讲解清楚)]`。
3. `read_file` 工具(path=`memory/logs/2026-04-19.md / 2026-04-18.md / 2026-04-17.md`)→ 统计 sessions=4、主动提问 12 次、畏难词 3 次、兴奋词 8 次。
4. 从 logs 里看到 `knowledge/generated/2026-04-17/backpropagation/exercises.json` 被写过 → `read_file` 它 → 拿题目结构。
5. `get_course_structure` 工具(chapter_id=null)→ 总概念数 24。
6. 综合分析:生成 6 维评估内容。
7. `write_file` 工具(path=`memory/evaluation/2026-04-19.md`, mode=write, content=<报告>)。
8. `write_file` 工具(path=`workspace/learning_plan.md`, mode=write, content=<计划,优先主题=BPTT+Dropout,资源组合按画像定制>)。
9. 回复学生:"评估已完成,报告 memory/evaluation/2026-04-19.md..."(按 Step 9 模板)
