---
name: update-profile
description: 根据学习数据更新用户画像
tool: update_profile
---

# 更新学习画像

你的任务是根据学生的学习数据，更新 `workspace/profile.json` 文件。

## 执行步骤

1. 读取以下文件获取学习数据：
   - `memory/history.json` - 对话历史
   - `memory/mistakes.json` - 错题记录
   - `memory/memory.md` - 学习记忆

2. 读取当前画像：`workspace/profile.json`

3. 根据学习数据更新画像：
   - **知识基础**：从对话中提取掌握的概念，更新 mastery 值
   - **易错点**：从 mistakes.json 分析错误模式
   - **学习节奏**：根据对话频率判断
   - **知识图谱**：新增或更新节点和边

4. 将更新后的画像写回 `workspace/profile.json`

## 更新规则

- mastery 值范围 0-0.95，答对 +0.1，答错 -0.1
- 新概念初始 mastery 0.3
- 保持增量更新，不要大幅跳变
- score 范围 0-100
- 所有文本用中文
