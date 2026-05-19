# 数据库表结构设计文档

## 概述

本系统采用 PostgreSQL + Redis 的混合架构：
- **PostgreSQL**: 存储结构化数据和用户画像（利用 JSONB 特性）
- **Redis**: 管理会话上下文和异步任务队列
- **云存储 (OSS/S3)**: 存储多模态资源（视频、PPT、动画等）

---

## 表结构详细设计

### 1. 用户相关表

#### 1.1 users（用户表）

存储用户基本信息和学生身份信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(100) | UNIQUE, NOT NULL | 邮箱 |
| hashed_password | VARCHAR(255) | NOT NULL | 加密密码 |
| full_name | VARCHAR(100) | | 全名 |
| major | VARCHAR(100) | | 专业 |
| grade | VARCHAR(20) | | 年级 |
| student_id | VARCHAR(50) | UNIQUE | 学号 |
| is_active | BOOLEAN | DEFAULT TRUE | 是否激活 |
| is_superuser | BOOLEAN | DEFAULT FALSE | 是否超级用户 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE NOW() | 更新时间 |
| last_login | TIMESTAMP | | 最后登录时间 |

**索引**:
- `idx_users_username` ON username
- `idx_users_email` ON email
- `idx_users_student_id` ON student_id

---

#### 1.2 student_profiles（学生画像表）

存储 6 个维度的动态画像，使用 JSONB 实现灵活的画像演进。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 画像ID |
| user_id | INTEGER | FOREIGN KEY, UNIQUE | 用户ID |
| learning_style | JSONB | | 学习风格画像 |
| knowledge_level | JSONB | | 知识水平画像 |
| interest_preference | JSONB | | 兴趣偏好画像 |
| cognitive_ability | JSONB | | 认知能力画像 |
| learning_behavior | JSONB | | 学习行为画像 |
| emotional_state | JSONB | | 情绪状态画像 |
| profile_summary | TEXT | | 画像摘要 |
| version | INTEGER | DEFAULT 1 | 画像版本号 |
| last_updated | TIMESTAMP | DEFAULT NOW() | 最后更新时间 |

**JSONB 字段示例**:

```json
{
  "learning_style": {
    "visual": 0.7,
    "auditory": 0.5,
    "kinesthetic": 0.3,
    "preferred_pace": "moderate",
    "learning_time": ["morning", "evening"]
  },
  "knowledge_level": {
    "mathematics": {"level": "advanced", "score": 85},
    "physics": {"level": "intermediate", "score": 72},
    "programming": {"level": "beginner", "score": 60}
  },
  "interest_preference": {
    "topics": ["AI", "machine_learning", "data_science"],
    "resource_types": ["video", "interactive"],
    "difficulty_preference": "challenging"
  }
}
```

**索引**:
- `idx_student_profiles_user_id` ON user_id
- GIN 索引用于 JSONB 字段查询

---

### 2. 会话管理表

#### 2.1 conversation_sessions（对话会话表）

存储会话元数据，实际对话上下文存储在 Redis。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 会话ID |
| user_id | INTEGER | FOREIGN KEY | 用户ID |
| session_id | VARCHAR(100) | UNIQUE, NOT NULL | 会话唯一标识 |
| title | VARCHAR(200) | | 会话标题 |
| status | ENUM | DEFAULT 'active' | 会话状态 |
| context_key | VARCHAR(200) | | Redis 上下文 key |
| message_count | INTEGER | DEFAULT 0 | 消息数量 |
| related_resources | JSONB | | 关联资源ID列表 |
| tags | JSONB | | 会话标签 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE NOW() | 更新时间 |
| last_message_at | TIMESTAMP | | 最后消息时间 |

**状态枚举**: `active`, `paused`, `completed`, `archived`

**Redis 存储结构**:
```
session:{session_id}:context = {
  "messages": [...],
  "window_buffer": [...],
  "metadata": {...}
}
TTL: 7 days
```

---

#### 2.2 messages（消息记录表）

存储历史消息记录。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 消息ID |
| session_id | INTEGER | FOREIGN KEY | 会话ID |
| role | ENUM | NOT NULL | 消息角色 |
| content | TEXT | NOT NULL | 消息内容 |
| metadata | JSONB | | 消息元数据 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**角色枚举**: `user`, `assistant`, `system`

**元数据示例**:
```json
{
  "model": "gpt-4",
  "tokens": 150,
  "temperature": 0.7,
  "response_time": 1.2
}
```

---

### 3. 资源管理表

#### 3.1 resources（资源索引表）

记录生成的多模态资源元数据。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 资源ID |
| user_id | INTEGER | FOREIGN KEY | 用户ID |
| name | VARCHAR(200) | NOT NULL | 资源名称 |
| resource_type | ENUM | NOT NULL | 资源类型 |
| status | ENUM | DEFAULT 'pending' | 资源状态 |
| storage_url | VARCHAR(500) | | 云存储 URL |
| cdn_url | VARCHAR(500) | | CDN 加速 URL |
| file_size | INTEGER | | 文件大小（字节）|
| duration | INTEGER | | 时长（秒）|
| knowledge_points | JSONB | | 关联知识点 |
| tags | JSONB | | 标签 |
| description | TEXT | | 资源描述 |
| generation_params | JSONB | | 生成参数 |
| task_id | VARCHAR(100) | | 异步任务ID |
| view_count | INTEGER | DEFAULT 0 | 查看次数 |
| download_count | INTEGER | DEFAULT 0 | 下载次数 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE NOW() | 更新时间 |
| completed_at | TIMESTAMP | | 完成时间 |

**资源类型枚举**: `video`, `ppt`, `pdf`, `image`, `audio`, `document`, `animation`, `other`

**状态枚举**: `pending`, `generating`, `completed`, `failed`

**存储路径规范**:
```
/users/{user_id}/projects/{project_id}/{resource_type}/{resource_id}.{ext}
```

---

### 4. 学习进度表

#### 4.1 learning_progress（学习进度表）

跟踪用户的学习进度和表现。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 进度ID |
| user_id | INTEGER | FOREIGN KEY | 用户ID |
| content_type | VARCHAR(50) | NOT NULL | 内容类型 |
| content_id | VARCHAR(100) | NOT NULL | 内容ID |
| content_name | VARCHAR(200) | | 内容名称 |
| progress_percentage | FLOAT | DEFAULT 0.0 | 完成百分比 |
| is_completed | BOOLEAN | DEFAULT FALSE | 是否完成 |
| time_spent | INTEGER | DEFAULT 0 | 学习时长（秒）|
| attempt_count | INTEGER | DEFAULT 0 | 尝试次数 |
| score | FLOAT | | 得分 |
| metadata | JSONB | | 其他学习数据 |
| started_at | TIMESTAMP | DEFAULT NOW() | 开始时间 |
| last_accessed_at | TIMESTAMP | ON UPDATE NOW() | 最后访问时间 |
| completed_at | TIMESTAMP | | 完成时间 |

**内容类型**: `course`, `chapter`, `lesson`, `exercise`, `quiz`

---

### 5. 异步任务表

#### 5.1 async_tasks（异步任务表）

跟踪长时间运行的任务（如视频生成、PPT 生成）。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 任务ID |
| user_id | INTEGER | FOREIGN KEY | 用户ID |
| task_id | VARCHAR(100) | UNIQUE, NOT NULL | 任务唯一标识 |
| task_type | VARCHAR(50) | NOT NULL | 任务类型 |
| status | ENUM | DEFAULT 'pending' | 任务状态 |
| params | JSONB | | 任务参数 |
| result | JSONB | | 任务结果 |
| error_message | TEXT | | 错误信息 |
| progress | FLOAT | DEFAULT 0.0 | 任务进度 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| started_at | TIMESTAMP | | 开始时间 |
| completed_at | TIMESTAMP | | 完成时间 |

**状态枚举**: `pending`, `running`, `completed`, `failed`, `cancelled`

**任务类型**: `video_generation`, `ppt_generation`, `animation_generation`, `resource_processing`

**Redis 队列结构**:
```
task_queue:pending = [task_id1, task_id2, ...]
task:{task_id}:status = "running"
task:{task_id}:progress = 45.5
```

---

## 关系图

```
users (1) ----< (1) student_profiles
  |
  |----< (N) conversation_sessions
  |              |
  |              |----< (N) messages
  |
  |----< (N) resources
  |
  |----< (N) learning_progress
  |
  |----< (N) async_tasks
```

---

## 索引策略

### 主要索引

1. **用户查询**:
   - `idx_users_username` (username)
   - `idx_users_email` (email)

2. **会话查询**:
   - `idx_sessions_user_id` (user_id)
   - `idx_sessions_session_id` (session_id)
   - `idx_sessions_status` (status)

3. **资源查询**:
   - `idx_resources_user_id` (user_id)
   - `idx_resources_type` (resource_type)
   - `idx_resources_status` (status)

4. **JSONB 查询**:
   - GIN 索引用于 JSONB 字段的多维度查询

### 复合索引

```sql
CREATE INDEX idx_resources_user_type ON resources(user_id, resource_type);
CREATE INDEX idx_progress_user_content ON learning_progress(user_id, content_type, content_id);
CREATE INDEX idx_messages_session_created ON messages(session_id, created_at DESC);
```

---

## 数据迁移和版本管理

使用 Alembic 进行数据库迁移：

```bash
# 创建迁移
alembic revision --autogenerate -m "Initial tables"

# 执行迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```

---

## 性能优化建议

1. **分区策略**: 对 messages 表按时间分区
2. **归档策略**: 定期归档旧会话和消息
3. **缓存策略**: 热点数据缓存到 Redis
4. **CDN 加速**: 所有资源启用 CDN
5. **连接池**: 配置合理的数据库连接池大小

---

## 安全考虑

1. **敏感数据加密**: 密码使用 bcrypt 加密
2. **JSONB 注入防护**: 使用参数化查询
3. **访问控制**: 基于用户 ID 的行级安全
4. **审计日志**: 记录关键操作
5. **备份策略**: 每日全量备份 + 实时增量备份
