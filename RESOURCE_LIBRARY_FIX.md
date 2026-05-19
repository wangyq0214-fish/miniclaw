# 资源库显示课程内容修复

## 问题描述

前端资源库无法显示 `knowledge/source` 下的课程章节文件。

## 原因分析

1. 课程文件已经从 `knowledge/source/chapter*.md` 移动到 `knowledge/source/深度学习/chapter*.md`
2. 后端 `/api/files/list` 接口默认只列出目录的直接子项，不递归子目录
3. 前端 `WorkspaceBrowser` 组件调用 API 时只获取了根目录的文件，没有获取子目录中的文件

## 解决方案

### 后端修改

修改 `backend/api/files.py` 中的 `list_files` 函数：

1. **添加 `recursive` 参数**：允许递归列出子目录中的文件
2. **自动递归 knowledge/source**：当请求 `knowledge/source` 目录时，自动启用递归模式
3. **递归深度限制**：限制递归深度为 10 层，防止无限递归

### 关键代码

```python
@router.get("/files/list", response_model=FileListResponse)
async def list_files(
    directory: str = Query("", description="Relative path to the directory"),
    recursive: bool = Query(False, description="Recursively list files in subdirectories")
):
    # For knowledge/source, always use recursive mode to get all course files
    if directory == "knowledge/source":
        recursive = True
    
    def collect_files(current_path: Path, depth: int = 0):
        """Recursively collect files from directory."""
        for item in current_path.iterdir():
            # ... 递归收集文件
            if item.is_dir() and recursive and depth < 10:
                collect_files(item, depth + 1)
```

## 效果

修改后，前端资源库将能够：

1. ✅ 显示 `knowledge/source/深度学习/` 下的所有章节文件
2. ✅ 自动分类为"知识库"类别
3. ✅ 支持点击查看章节内容
4. ✅ 未来添加新课程时自动显示

## 测试步骤

1. 启动后端服务
2. 访问前端资源库
3. 检查"知识库"分类下是否显示了 12 个章节文件：
   - chapter1.md - 第 1 章 深度学习与开发环境
   - chapter2.md - 第 2 章 神经网络基础
   - ...
   - chapter12.md - 第 12 章 深度学习前沿

## 相关文件

- `backend/api/files.py` - 文件列表 API（已修改）
- `frontend/src/components/inspector/WorkspaceBrowser.tsx` - 资源浏览器组件
- `backend/knowledge/source/深度学习/` - 课程章节文件目录

## 注意事项

1. 递归模式仅对 `knowledge/source` 自动启用
2. 其他目录（`workspace`, `memory`）仍使用非递归模式
3. 递归深度限制为 10 层，足够处理正常的目录结构
4. 文件过滤逻辑保持不变，只显示 `.md` 文件

## 后续优化建议

1. 可以在前端显示文件的完整路径或所属课程
2. 可以按课程分组显示章节
3. 可以添加课程封面图或描述
