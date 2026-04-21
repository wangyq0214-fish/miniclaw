---
name: get-weather
description: 获取指定城市的实时天气信息
tool: fetch_url
tags:
  - weather
  - api
---

# Get Weather Skill

**调用 fetch_url 工具获取天气数据。**

## 工具调用

使用 `fetch_url` 工具访问天气 API:

```
tool: fetch_url
url: https://wttr.in/{city}?format=j1
```

将 `{city}` 替换为城市名（使用拼音或英文，如 Beijing、Shanghai）。

## 示例

用户: "北京天气"
调用: `fetch_url(url="https://wttr.in/Beijing?format=j1")`

返回 JSON 后，解析并报告温度、湿度、天气状况。