# Windows 本地启动数据库服务

## PostgreSQL 安装和启动

### 1. 下载安装 PostgreSQL

下载地址: https://www.postgresql.org/download/windows/

推荐版本: PostgreSQL 15 或更高

### 2. 安装步骤

1. 运行安装程序
2. 设置密码（默认用户 postgres）
3. 端口保持默认 5432
4. 完成安装

### 3. 创建数据库

打开 pgAdmin 或使用命令行：

```bash
# 使用 psql 命令行
psql -U postgres

# 创建数据库
CREATE DATABASE miniclaw;

# 退出
\q
```

或者使用 PowerShell：

```powershell
# 设置环境变量（临时）
$env:PGPASSWORD="postgres"

# 创建数据库
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE miniclaw;"
```

### 4. 验证连接

```bash
psql -U postgres -d miniclaw -c "SELECT version();"
```

---

## Redis 安装和启动

### 方法 1: 使用 Memurai (Windows Redis 替代品)

1. 下载 Memurai: https://www.memurai.com/get-memurai
2. 安装后自动作为 Windows 服务运行
3. 默认端口 6379

### 方法 2: 使用 WSL2 + Redis

```bash
# 在 WSL2 中安装 Redis
sudo apt update
sudo apt install redis-server

# 启动 Redis
sudo service redis-server start

# 验证
redis-cli ping
```

### 方法 3: 使用 Docker Desktop

```bash
# 启动 Redis 容器
docker run -d --name redis -p 6379:6379 redis:7

# 验证
docker exec -it redis redis-cli ping
```

---

## 快速启动脚本

### PostgreSQL 服务管理 (PowerShell)

```powershell
# 启动 PostgreSQL 服务
net start postgresql-x64-15

# 停止 PostgreSQL 服务
net stop postgresql-x64-15

# 查看服务状态
Get-Service postgresql-x64-15
```

### Redis 服务管理 (PowerShell)

```powershell
# 如果使用 Memurai
net start Memurai

# 停止
net stop Memurai
```

---

## 环境变量配置

修改 `.env` 文件：

```env
# PostgreSQL (本地)
DATABASE_URL=postgresql+asyncpg://postgres:你的密码@localhost:5432/miniclaw

# Redis (本地)
REDIS_URL=redis://localhost:6379/0

# JWT 密钥
SECRET_KEY=生成一个随机字符串
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

---

## 验证服务

### 测试 PostgreSQL 连接

```python
# test_db.py
import asyncio
import asyncpg

async def test_postgres():
    conn = await asyncpg.connect(
        user='postgres',
        password='你的密码',
        database='miniclaw',
        host='localhost',
        port=5432
    )
    version = await conn.fetchval('SELECT version()')
    print(f"PostgreSQL: {version}")
    await conn.close()

asyncio.run(test_postgres())
```

### 测试 Redis 连接

```python
# test_redis.py
import redis

r = redis.Redis(host='localhost', port=6379, db=0)
r.set('test', 'hello')
print(f"Redis: {r.get('test')}")
```

---

## 常见问题

### PostgreSQL 端口被占用

```powershell
# 查看端口占用
netstat -ano | findstr :5432

# 修改 PostgreSQL 端口
# 编辑: C:\Program Files\PostgreSQL\15\data\postgresql.conf
# 修改: port = 5433
```

### Redis 连接失败

检查防火墙设置，确保 6379 端口开放。

---

## 推荐配置（生产环境）

1. PostgreSQL 设置密码认证
2. Redis 启用密码保护
3. 定期备份数据库
4. 监控服务状态
