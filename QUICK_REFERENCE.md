# 快速参考：生成内容目录结构

## 目录位置
```
backend/workspace/generated/
```

## 内容类型及路径模板

| 类型 | 路径模板 | 技能 | 文件格式 |
|------|---------|------|---------|
| 讲解文档 | `lectures/<date>/<topic>/lecture.md` | generate-lecture | Markdown |
| 练习题 | `exercises/<date>/<topic>/exercises.{json,md}` | generate-exercises | JSON + Markdown |
| 代码案例 | `code-cases/<date>/<topic>/*.py` | generate-code-case | Python + README |
| 视频脚本 | `media-scripts/<date>/<topic>/script.md` | generate-media-script | Markdown |
| 思维导图 | `mindmaps/<date>/<topic>/mindmap.mermaid` | generate-mindmap | Mermaid |
| 阅读清单 | `reading-lists/<date>/<topic>/reading-list.md` | generate-reading-list | Markdown |
| 学习评估 | `evaluations/<date>.md` | evaluate-learning | Markdown |

## 命名规范

### 日期格式
- `YYYY-MM-DD` (例如：2026-04-22)

### 主题 Slug
- 小写字母 + 连字符
- 英文或拼音
- 例如：`backpropagation`, `gradient-descent`, `dl-history`

## 常用命令

### 查看所有生成内容
```bash
find backend/workspace/generated -type f
```

### 按日期查找
```bash
find backend/workspace/generated -path "*/2026-04-22/*"
```

### 按主题查找
```bash
find backend/workspace/generated -path "*/backpropagation/*"
```

### 按类型查找
```bash
# 所有练习题
find backend/workspace/generated/exercises -name "*.json"

# 所有讲解文档
find backend/workspace/generated/lectures -name "*.md"

# 所有代码案例
find backend/workspace/generated/code-cases -name "*.py"
```

### 清理旧内容（30天前）
```bash
find backend/workspace/generated -type f -mtime +30 -delete
```

## 工具权限

`write_file` 工具允许写入的目录：
- `memory/`
- `workspace/`
- `knowledge/`

## 当前内容

```
backend/workspace/generated/
├── README.md
├── exercises/
│   └── 2024-06-20/
│       └── dl_history/
│           ├── exercises.json
│           └── exercises.md
├── lectures/          (空)
├── code-cases/        (空)
├── media-scripts/     (空)
├── mindmaps/          (空)
├── reading-lists/     (空)
└── evaluations/       (空)
```

## 相关文档

- 完整说明：`backend/workspace/generated/README.md`
- 迁移记录：`MIGRATION.md`
- 迁移总结：`MIGRATION_SUMMARY.md`
- 问题排查：`TROUBLESHOOTING.md`
