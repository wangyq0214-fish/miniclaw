---
name: generate-reading-list
description: Search and curate 5-8 external reading materials (papers, blogs, videos, docs) with summary, difficulty tier, and personalized recommendation reason. Use when the student asks for 拓展阅读 / 资料 / 参考 / 推荐书单.
allowed-tools: read_file write_file search_knowledge_base fetch_url terminal
---

# 拓展阅读列表生成技能

> 指令文件,非 tool。被 `reading_curator` 子代理读取执行。

## 执行步骤

### Step 1:读画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

提取:
- 维度 2:驱动动机(保研 → 偏学术;就业 → 偏工程博客;兴趣 → 通识科普)
- 维度 4:视觉偏好(视觉型 → 视频/可视化博客优先)
- 维度 8:语言偏好(中英文比例)

### Step 2:检索组合(按序尝试,前者够用可停)

#### 2.1 先搜项目知识库
**tool**: `search_knowledge_base` · **input**: `{"query": "<主题>"}`

若返回 2 条以上相关段落,把对应章节 /chunk 纳入推荐列表,标注 `source: 项目知识库`。

#### 2.2 再用 tavily-search 技能
tavily-search 不是 tool,要通过 `terminal` 运行脚本:

**tool**: `terminal` · **input**: `{"command": "python skills/tavily-search/scripts/tavily_search.py --query \"<主题> tutorial OR paper\" --max-results 5 --format md"}`

典型查询变体(按学生画像选):
- 保研学生:`<主题> paper arxiv` 或 `<主题> survey 2024`
- 就业学生:`<主题> best practices tutorial blog`
- 视觉型:`<主题> visualization interactive`
- 中文学生:`<主题> 教程` 或 `<主题> 博客`

#### 2.3 必要时 fetch_url 确认质量
**tool**: `fetch_url` · **input**: `{"url": "<candidate>"}`

对可疑来源(不知名博客)抓一下前 2000 字看内容质量,低质丢弃。

### Step 3:按维度打分 + 筛选

每条候选打 3 分:
- **权威性**(作者是否可信、来源是否知名):0-3
- **难度匹配度**(对学生 mastery 友好):0-3
- **互补性**(和其他候选是否重复/互补):0-3

取总分 Top 5-8,保证:
- **难度分层**:至少 1 条 ⭐ 入门,2 条 ⭐⭐ 中阶,1 条 ⭐⭐⭐ 进阶
- **类型多样**:至少 1 条视频/可视化(给视觉偏好兜底)
- **来源多样**:至少 1 条来自项目 `knowledge/`(鼓励先用手头资源)
- **语言匹配**:按学生画像 language_mix 调整

### Step 4:写 reading_list.md

**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<YYYY-MM-DD>/<topic-slug>/reading_list.md",
  "mode": "write",
  "content": "<完整 markdown>"
}
```

## 文件模板

```markdown
---
topic: <主题>
topic_slug: <slug>
total_items: <N>
difficulty_distribution: {beginner: X, intermediate: Y, advanced: Z}
language_mix: {zh: <int>, en: <int>}
source_mix: {knowledge_base: <int>, paper: <int>, blog: <int>, video: <int>, doc: <int>}
generated_at: <ISO>
generated_by: reading_curator
---

# <主题> · 拓展阅读清单

> 基于你的画像筛选(保研方向 + 视觉偏好),涵盖入门到进阶。

## 入门(⭐)

### 1. [3Blue1Brown · 神经网络与反向传播](https://www.bilibili.com/video/BV...)
- **类型**: 视频
- **来源**: B 站 · 3Blue1Brown 汉化版
- **难度**: ⭐ 入门
- **时长**: 约 18 分钟
- **语言**: 中英字幕
- **摘要**: 用几何动画直观展示反向传播如何把误差"推回去"。是学反向传播最推荐的入门视频。
- **为什么推荐给你**: 你画像里标注"偏示例驱动 + 视觉偏好",这个视频几乎无公式、全程动画,非常契合。

## 中阶(⭐⭐)

### 2. [...](URL)
...

## 进阶(⭐⭐⭐)

### 5. [Backpropagation Through Time](https://arxiv.org/abs/...)
- **类型**: 论文
- **来源**: arXiv
- **难度**: ⭐⭐⭐ 进阶
- **时长**: 约 30 页
- **语言**: 英文
- **摘要**: ...
- **为什么推荐给你**: 你目标"保研",这是 RNN 训练的经典 paper,保研面试常考。

## 阅读路径建议
1. 先看 #1 建立直觉(1 天)
2. 再刷 #2、#3 动手实践(2-3 天)
3. 最后啃 #5 冲刺深度(1 周)
```

## 硬性要求

- 总数 5-8 条
- 至少 1 条 ⭐、2 条 ⭐⭐、1 条 ⭐⭐⭐(分层硬要求)
- 至少 1 条视频/可视化类型
- 至少 1 条来自 `search_knowledge_base` 的项目知识库(若知识库有则必选)
- 每条必须有"为什么推荐给你"一节,引用学生画像的具体维度

## 禁止

- 禁止编造 URL — 所有链接都必须来自 search_knowledge_base / tavily / fetch_url 验证过的来源
- 禁止推荐付费墙后的资源(除非学生明确说能访问)
- 禁止直接复制 tavily 输出不二次加工
- 禁止少于 5 条或超过 10 条
- 禁止推荐 > 3 年前的过期 deep learning / AI 资源(除非是经典论文)
