# Banner图和Demo GIF创建指南

## Banner图创建

### 设计要求
- **尺寸**: 1280x640px (2:1比例)
- **格式**: PNG
- **背景**: 渐变色或深色背景
- **内容**: 项目名称 + 一句话介绍 + 核心图标

### 推荐工具
1. **Figma** (免费): https://figma.com
2. **Canva** (免费): https://canva.com
3. **Adobe Photoshop**: 专业设计工具

### 设计模板
```
┌─────────────────────────────────────────┐
│                                         │
│   🎓 Mini-OpenClaw                      │
│                                         │
│   AI Agent 教育辅助系统                   │
│   文件驱动 · 全程可视化 · 11种技能         │
│                                         │
│   [DeepAgents] [LlamaIndex] [Neo4j]    │
│                                         │
└─────────────────────────────────────────┘
```

### 配色建议
- 主色: #3B82F6 (蓝色)
- 辅色: #8B5CF6 (紫色)
- 背景: #1E293B (深灰)

## Demo GIF创建

### 录制要求
- **时长**: 10-15秒
- **尺寸**: 1280x720px
- **帧率**: 30fps
- **格式**: GIF

### 录制工具
1. **OBS Studio** (免费): https://obsproject.com
2. **ScreenToGif** (免费): https://screentogif.com
3. **LICEcap** (免费): https://cockos.com/licecap

### 录制内容建议
```
场景1: SSE流式对话 (3-4秒)
- 展示AI实时生成文本
- 显示流式输出效果

场景2: 知识图谱可视化 (3-4秒)
- 展示节点展开动画
- 显示关系连线

场景3: 思维导图生成 (3-4秒)
- 展示AI生成思维导图
- 显示层级展开

场景4: 学习分析面板 (2-3秒)
- 展示学生画像
- 显示6维能力分析
```

### GIF优化
- 使用 https://ezgif.com 压缩GIF
- 目标大小: <5MB
- 保持清晰度

## 文件命名

创建完成后，将文件放入 `docs/` 目录：

```
docs/
├── banner.png          # Banner图
├── demo.gif            # Demo GIF
└── screenshots/
    ├── chat.png
    ├── graph.png
    ├── mindmap.png
    └── analytics.png
```

## README更新

添加到README.md顶部：

```markdown
# Mini-OpenClaw

![Banner](docs/banner.png)

**一个轻量级、全透明的 AI Agent 教育辅助系统**

![Demo](docs/demo.gif)
```
