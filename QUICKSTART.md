# Mini-OpenClaw 快速启动指南

## 当前状态

✅ 数据库表结构已完成
✅ 用户认证系统已完成
✅ PostgreSQL + Redis 已配置

---

## 快速启动

### 1. 启动数据库服务

确保 PostgreSQL 和 Redis 正在运行：

```bash
# 检查 PostgreSQL
psql -U postgres -d miniclaw -c "SELECT version();"

# 检查 Redis
redis-cli ping
```

### 2. 激活虚拟环境

```bash
cd backend
.\venv\Scripts\activate  # Windows
```

### 3. 启动应用

```bash
python app.py
```

应用将在 http://localhost:8002 启动

### 4. 测试 API

访问 Swagger 文档：http://localhost:8002/docs

---

## 测试认证功能

### 方法 1: 使用测试脚本

```bash
python test_auth.py
```

### 方法 2: 使用 curl

```bash
# 注册用户
curl -X POST http://localhost:8002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "student001",
    "email": "student001@example.com",
    "password": "password123",
    "full_name": "张三"
  }'

# 登录
curl -X POST http://localhost:8002/api/auth/login \
  -d "username=student001&password=password123"

# 获取用户信息（需要替换 token）
curl http://localhost:8002/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 方法 3: 使用 Swagger UI

1. 访问 http://localhost:8002/docs
2. 点击 `/api/auth/register` 展开
3. 点击 "Try it out"
4. 填写用户信息并执行

---

## 下一步开发

### 推荐顺序

1. **学生画像 API**（高优先级）
   - 创建 `backend/api/profiles.py`
   - 实现画像 CRUD 接口
   - 集成到 app.py

2. **会话管理 API**（高优先级）
   - 创建 `backend/api/sessions_v2.py`
   - 实现会话和消息管理
   - Redis 上下文存储

3. **大模型集成**（高优先级）
   - 配置 OpenAI/通义千问
   - 实现对话接口
   - 集成 RAG 检索

---

## 项目结构

```
backend/
├── api/                    # API 路由
│   ├── auth.py            # ✅ 认证接口
│   ├── profiles.py        # ⏳ 待开发：画像接口
│   ├── sessions_v2.py     # ⏳ 待开发：会话接口
│   ├── resources_api.py   # ⏳ 待开发：资源接口
│   └── progress.py        # ⏳ 待开发：进度接口
├── models/                 # 数据模型
│   ├── complete_models.py # ✅ 所有表模型
│   └── __init__.py        # ✅ 模型导出
├── schemas/                # Pydantic 模型
│   ├── auth.py            # ✅ 认证 Schema
│   └── profiles.py        # ⏳ 待开发
├── auth/                   # 认证模块
│   ├── security.py        # ✅ JWT/密码加密
│   └── __init__.py
├── database.py            # ✅ 数据库配置
├── config.py              # ✅ 配置管理
├── app.py                 # ✅ 应用入口
├── migrate.py             # ✅ 数据库迁移
└── requirements.txt       # ✅ 依赖包
```

---

## 常用命令

```bash
# 测试数据库连接
python test_db_connection.py

# 验证表结构
python verify_tables.py

# 重新创建表
python migrate.py

# 启动应用
python app.py

# 测试认证
python test_auth.py
```

---

## 开发建议

### 创建新 API 的步骤

1. **定义 Schema**（`schemas/xxx.py`）
   ```python
   from pydantic import BaseModel
   
   class ProfileCreate(BaseModel):
       user_id: int
       learning_style: dict
   ```

2. **创建 API 路由**（`api/xxx.py`）
   ```python
   from fastapi import APIRouter, Depends
   from auth.security import get_current_active_user
   
   router = APIRouter()
   
   @router.post("/profiles/create")
   async def create_profile(
       profile_data: ProfileCreate,
       current_user = Depends(get_current_active_user)
   ):
       # 实现逻辑
       pass
   ```

3. **注册路由**（`app.py`）
   ```python
   from api.profiles import router as profiles_router
   app.include_router(profiles_router, prefix="/api", tags=["profiles"])
   ```

---

## 调试技巧

### 查看数据库数据

```bash
# 连接数据库
psql -U postgres -d miniclaw

# 查看用户
SELECT * FROM users;

# 查看画像
SELECT * FROM student_profiles;

# 查看会话
SELECT * FROM conversation_sessions;
```

### 查看 Redis 数据

```bash
redis-cli

# 查看所有 key
KEYS *

# 查看 token
GET token:student001

# 查看会话上下文
GET session:xxx:context
```

---

## 故障排查

### 问题 1: 数据库连接失败

```bash
# 检查 PostgreSQL 服务
Get-Service postgresql-x64-*

# 检查 .env 配置
DATABASE_URL=postgresql+asyncpg://postgres:你的密码@localhost:5432/miniclaw
```

### 问题 2: Redis 连接失败

```bash
# 检查 Redis 服务
redis-cli ping

# 检查 .env 配置
REDIS_URL=redis://localhost:6379/0
```

### 问题 3: 导入错误

```bash
# 确保在虚拟环境中
.\venv\Scripts\activate

# 重新安装依赖
pip install -r requirements.txt
```

---

## 文档资源

- **数据库设计**: `DATABASE_DESIGN.md`
- **表结构说明**: `DATABASE_SETUP_COMPLETE.md`
- **认证系统**: `README_AUTH.md`
- **任务列表**: `TODO.md`
- **API 文档**: http://localhost:8002/docs

---

## 联系和支持

遇到问题？
1. 查看文档
2. 检查日志
3. 验证配置
4. 测试连接

祝开发顺利！🚀
