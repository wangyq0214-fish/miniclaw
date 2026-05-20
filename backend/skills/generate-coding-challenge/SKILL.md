---
name: generate-coding-challenge
description: Generate a coding challenge as JSON with problem description, boilerplate code, and test cases. Use when the student asks for 编程题 / 刷题 / 代码练习 / coding challenge.
allowed-tools: read_file write_file
---

# 编程挑战生成技能

## 硬性路径约束

写盘路径**必须**为：
```
workspace/generated/code-cases/<中文主题名>.json
```

示例：`workspace/generated/code-cases/冒泡排序.json`

## JSON 模板（必须严格遵循）

```json
{
  "title": "冒泡排序基础",
  "difficulty": "Easy",
  "description": "请实现一个标准的**冒泡排序**算法。\n\n给定一个整数列表 `arr`，请对其进行升序排序并返回新列表。\n\n**示例 1：**\n```\n输入: [5, 2, 9, 1, 5, 6]\n输出: [1, 2, 5, 5, 6, 9]\n```\n\n**示例 2：**\n```\n输入: [1, 2, 3]\n输出: [1, 2, 3]\n```\n\n**要求：**\n- 使用冒泡排序算法\n- 时间复杂度: O(n²)",
  "boilerplate": "def bubble_sort(arr):\n    # 请在此处编写你的代码\n    pass",
  "testCases": [
    { "input": "[5, 2, 9, 1, 5, 6]", "expected": "[1, 2, 5, 5, 6, 9]", "isHidden": false },
    { "input": "[1, 2, 3]", "expected": "[1, 2, 3]", "isHidden": false },
    { "input": "[]", "expected": "[]", "isHidden": true }
  ]
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 题目标题 |
| `difficulty` | string | `"Easy"` / `"Medium"` / `"Hard"` |
| `description` | string | Markdown 格式题目描述，**必须包含示例输入输出** |
| `boilerplate` | string | 预填代码，含函数签名和 `pass` |
| `testCases` | array | 测试用例数组 |
| `testCases[].input` | string | JSON 格式的输入，如 `"[1,2,3]"` |
| `testCases[].expected` | string | JSON 格式的期望输出，如 `"[1,2,3]"` |
| `testCases[].isHidden` | boolean | 是否隐藏（前端默认折叠） |

## 执行步骤

### Step 1: 确定题目

根据学生当前学习内容或请求的主题，选择一个适合的编程题目。

### Step 2: 设计题目

- 根据 mastery 决定难度（Easy/Medium/Hard）
- 设计清晰的函数签名
- 编写 2-3 个可见测试用例 + 1-2 个隐藏边界用例

### Step 3: 写盘

```json
{
  "path": "workspace/generated/code-cases/<中文主题名>.json",
  "mode": "write",
  "content": "<完整 JSON>"
}
```

## 硬性要求

- `description` 必须包含至少 1 个示例输入输出
- `boilerplate` 必须包含函数签名和 `pass`
- `input` 和 `expected` 必须是合法 JSON 字符串
- 至少 3 个测试用例（含 1 个隐藏用例）
- 输出 JSON 文件，禁止 Markdown
