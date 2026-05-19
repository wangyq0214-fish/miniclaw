---
name: tavily-search
description: "Web search via Tavily API. NOT a tool — invoke by running a script with the `execute` tool (or `terminal` tool). Use when the user asks to search the web, look up sources, or find links."
---

# Tavily Search

> **重要：这是一个 Skill，不是工具。不要直接调用 `tavily-search` 作为工具名。**
> 正确用法是：用 `execute`（或 `terminal`）工具运行下方的 Python 脚本。

## 调用方式

用 `execute` 工具执行以下命令（工作目录为 PROJECT_ROOT，即 `backend/`）：

```
execute: python skills/tavily-search/scripts/tavily_search.py --query "<查询词>" --max-results 5 --format md
```

## Requirements

- API Key 通过以下方式提供（任选其一）：
  - 环境变量 `TAVILY_API_KEY`，或
  - `backend/.env` 中写入 `TAVILY_API_KEY=...`

## 命令示例

```bash
# Markdown 格式（推荐，易读）
python skills/tavily-search/scripts/tavily_search.py --query "..." --max-results 5 --format md

# 带简短摘要
python skills/tavily-search/scripts/tavily_search.py --query "..." --max-results 5 --include-answer --format md

# JSON 格式（title/url/snippet）
python skills/tavily-search/scripts/tavily_search.py --query "..." --max-results 5 --format brave

# 原始 JSON
python skills/tavily-search/scripts/tavily_search.py --query "..." --max-results 5
```

## Output

### md（推荐）
- 人类可读的 Markdown 列表，含标题、URL、摘要

### brave
- JSON：`query`, optional `answer`, `results: [{title,url,snippet}]`

### raw（默认）
- JSON：`query`, optional `answer`, `results: [{title,url,content}]`

## Notes

- `max-results` 默认保持 3–5，减少 token 消耗。
- 优先返回 URL + 摘要；只在必要时才 fetch 完整页面。
