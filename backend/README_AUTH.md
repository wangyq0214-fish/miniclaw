# 用户认证系统

## 技术栈

- **数据库**: PostgreSQL (用户数据持久化)
- **缓存**: Redis (Token 存储和会话管理)
- **认证**: JWT (JSON Web Token)
- **密码加密**: bcrypt

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并修改配置：

```bash
cp .env.example .env
```

关键配置项：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `REDIS_URL`: Redis 连接字符串
- `SECRET_KEY`: JWT 密钥（生产环境必须修改）
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Token 过期时间（默认 30 分钟）

### 3. 启动数据库服务

**PostgreSQL**:
```bash
# Docker 方式
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=miniclaw \
  -p 5432:5432 \
  postgres:15
```

**Redis**:
```bash
# Docker 方式
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7
```

### 4. 启动应用

```bash
python app.py
```

应用会自动创建数据库表。

## API 接口

### 注册用户

```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "full_name": "Test User"
}
```

### 登录

```bash
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=testuser&password=password123
```

返回：
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 获取当前用户信息

```bash
GET /api/auth/me
Authorization: Bearer <access_token>
```

### 登出

```bash
POST /api/auth/logout
Authorization: Bearer <access_token>
```

## 数据库表结构

### users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| username | String(50) | 用户名（唯一） |
| email | String(100) | 邮箱（唯一） |
| hashed_password | String(255) | 加密后的密码 |
| full_name | String(100) | 全名 |
| is_active | Boolean | 是否激活 |
| is_superuser | Boolean | 是否超级用户 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

## 安全特性

1. **密码加密**: 使用 bcrypt 算法加密存储
2. **JWT Token**: 无状态认证，支持分布式部署
3. **Token 过期**: 自动过期机制，防止长期有效
4. **Redis 缓存**: Token 黑名单机制，支持强制登出
5. **HTTPS**: 生产环境建议启用 HTTPS

## 测试

使用 curl 测试：

```bash
# 注册
curl -X POST http://localhost:8002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"123456"}'

# 登录
curl -X POST http://localhost:8002/api/auth/login \
  -d "username=test&password=123456"

# 获取用户信息
curl http://localhost:8002/api/auth/me \
  -H "Authorization: Bearer <your_token>"
```

## 生产环境注意事项

1. 修改 `SECRET_KEY` 为强随机字符串
2. 使用 HTTPS 协议
3. 配置 PostgreSQL 和 Redis 的持久化
4. 设置合理的 Token 过期时间
5. 启用数据库备份
6. 配置防火墙规则
