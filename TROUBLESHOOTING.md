# 学习计划生成问题排查指南

## 问题描述
智能体生成了学习计划内容，但没有写入 `backend/workspace/learning_plan.md` 文件。

## 根本原因
`evaluate-learning` 技能要求智能体按照 Step 8 调用 `write_file` 工具，但智能体可能：
1. 只生成了文本但没有调用工具
2. 工具调用被权限系统拦截
3. 数据不足导致跳过了写入步骤

## 排查步骤

### 1. 检查必要目录是否存在
```bash
ls -la backend/workspace/
ls -la backend/memory/evaluation/
ls -la backend/knowledge/generated/
```

所有目录都应该存在。如果不存在，运行：
```bash
mkdir -p backend/workspace backend/memory/evaluation backend/knowledge/generated
```

### 2. 检查 USER.md 是否有数据
```bash
cat backend/workspace/USER.md
```

如果所有字段都是"未知"，智能体可能因为数据不足而无法生成有意义的学习计划。

### 3. 检查 write_file 工具是否正常
测试工具是否能写入文件：
```bash
# 通过智能体测试
# 发送消息："请使用 write_file 工具在 workspace/test.md 写入 'Hello World'"
```

### 4. 检查智能体日志
查看后端日志，看是否有工具调用失败的记录：
```bash
# 如果有日志文件
tail -f backend/logs/*.log
```

### 5. 检查权限配置
查看 `backend/agent.py` 中的权限设置，确保 workspace 目录有写权限。

## 临时解决方案

如果智能体生成了学习计划文本但没有保存，你可以：

1. **手动创建文件**：将智能体生成的内容复制到 `backend/workspace/learning_plan.md`

2. **明确要求智能体保存**：
   ```
   请使用 write_file 工具将刚才生成的学习计划保存到 workspace/learning_plan.md
   ```

3. **检查技能执行**：
   ```
   请按照 backend/skills/evaluate-learning/SKILL.md 的 Step 8 执行，
   使用 write_file 工具将学习计划写入 workspace/learning_plan.md
   ```

## 长期解决方案

### 1. 增强技能指令的明确性
在 `backend/skills/evaluate-learning/SKILL.md` 的 Step 8 中，可以添加更明确的指令：

```markdown
### Step 8:写/覆盖学习计划（必须执行）

**重要**：本步骤是必须的，不能跳过。即使数据不完整，也要生成一个基础版本的学习计划。

**tool**: `write_file` · **input**:
...
```

### 2. 添加验证步骤
在 Step 9 之前添加验证：

```markdown
### Step 8.5: 验证文件写入
使用 `read_file` 工具读取 `workspace/learning_plan.md`，确认文件已成功写入。
如果读取失败，重新执行 Step 8。
```

### 3. 改进错误处理
在智能体代码中添加工具调用失败的重试逻辑。

## 测试验证

创建测试文件验证 write_file 工具正常工作：
```bash
# 已验证：工具可以正常写入
ls -la backend/workspace/learning_plan.md
# 输出：-rw-r--r-- 1 wayuj 197609 334 Apr 22 17:30 backend/workspace/learning_plan.md
```

## 相关文件
- 技能定义：`backend/skills/evaluate-learning/SKILL.md`
- 工具实现：`backend/tools/write_file.py`
- 智能体配置：`backend/agent.py`
- 用户画像：`backend/workspace/USER.md`
