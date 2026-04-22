# 课程内容渲染功能

## 概述

已实现将 `backend/knowledge/source/` 下的课程内容自动渲染到前端的功能。

## 目录结构

```
backend/knowledge/source/
└── 深度学习/
    ├── chapter1.md
    ├── chapter2.md
    ├── chapter3.md
    ├── ...
    └── chapter12.md
```

## API 端点

### 1. 获取所有课程列表
```
GET /api/courses
```

**响应示例：**
```json
{
  "courses": [
    {
      "course_id": "深度学习",
      "course_name": "深度学习",
      "description": "深度学习课程，共12章",
      "chapters": [
        {
          "chapter_id": 1,
          "title": "第 1 章 深度学习与开发环境",
          "file": "chapter1.md"
        },
        ...
      ],
      "total_chapters": 12
    }
  ]
}
```

### 2. 获取特定课程信息
```
GET /api/courses/{course_id}
```

**示例：**
```
GET /api/courses/深度学习
```

### 3. 获取章节内容
```
GET /api/courses/{course_id}/chapters/{chapter_id}
```

**示例：**
```
GET /api/courses/深度学习/chapters/1
```

**响应示例：**
```json
{
  "chapter_id": 1,
  "title": "第 1 章 深度学习与开发环境",
  "content": "# 第 1 章 深度学习与开发环境\n\n非专业人士对人工智能的印象...",
  "file": "chapter1.md"
}
```

## 添加新课程

### 步骤

1. 在 `backend/knowledge/source/` 下创建新的课程目录：
   ```bash
   mkdir backend/knowledge/source/机器学习
   ```

2. 添加章节文件（必须以 `chapter` 开头，后跟数字）：
   ```bash
   backend/knowledge/source/机器学习/
   ├── chapter1.md
   ├── chapter2.md
   └── chapter3.md
   ```

3. 章节文件格式：
   ```markdown
   # 第 1 章 章节标题
   
   章节内容...
   ```

4. 重启后端服务，新课程会自动被扫描并渲染到前端

## 前端集成

前端可以通过以下方式集成课程内容：

### 1. 获取课程列表
```typescript
const response = await fetch('/api/courses');
const data = await response.json();
console.log(data.courses);
```

### 2. 显示课程目录
```typescript
const response = await fetch('/api/courses/深度学习');
const course = await response.json();
course.chapters.forEach(chapter => {
  console.log(`${chapter.chapter_id}. ${chapter.title}`);
});
```

### 3. 渲染章节内容
```typescript
const response = await fetch('/api/courses/深度学习/chapters/1');
const chapter = await response.json();
// 使用 markdown 渲染器渲染 chapter.content
```

## 特性

- ✅ 自动扫描 `knowledge/source/` 下的所有课程目录
- ✅ 自动提取章节标题（从 markdown 第一行）
- ✅ 按章节编号自动排序
- ✅ 支持多课程管理
- ✅ RESTful API 设计
- ✅ 完整的错误处理

## 文件说明

- `backend/api/courses.py` - 课程 API 实现
- `backend/api/__init__.py` - API 路由注册
- `backend/app.py` - 主应用，包含课程路由

## 测试

启动后端后，访问：
- http://localhost:8002/api/courses - 查看所有课程
- http://localhost:8002/api/courses/深度学习 - 查看深度学习课程
- http://localhost:8002/api/courses/深度学习/chapters/1 - 查看第1章内容

## 注意事项

1. 章节文件必须以 `chapter` 开头，后跟数字（如 `chapter1.md`）
2. 第一行应该是 markdown 标题（`# 标题`），会被自动提取为章节标题
3. 课程目录名会被用作 `course_id` 和 `course_name`
4. 支持中文目录名和文件名
