---
name: video-search
description: 搜索 Bilibili 视频资源并推荐给用户
tool: execute
---

# 视频搜索技能

当用户询问学习资源、视频讲解、教程推荐、想找视频学习时，使用此技能搜索 Bilibili 视频。

## 使用方法

执行搜索脚本：

```bash
python skills/video-search/scripts/video_search.py --query "搜索关键词" --max-results 5
```

## 参数说明

- `--query`：搜索关键词（中文或英文）
- `--max-results`：返回结果数量，默认 5

## 输出格式

脚本输出 Markdown 格式的视频列表，每个视频包含：
- 标题（带 B 站链接）
- 作者、播放量、时长

## 使用场景

- 用户说"推荐一些 XX 视频"
- 用户说"有没有 XX 的视频教程"
- 用户说"我想看视频学习 XX"
- 用户询问某个概念的视频讲解

## 注意事项

- 搜索关键词尽量简洁，2-4 个字效果最佳
- 可以根据用户的学习画像调整搜索关键词
- 推荐 3-5 个视频即可，不要太多
