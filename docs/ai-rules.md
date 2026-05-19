# AI Engineering Rules - Mini-OpenClaw

## 1. 代码质量规则

### 1.1 函数复杂度
- **规则**: 单个函数不超过 50 行（不含注释和空行）
- **Why**: 超过50行的函数难以理解和测试，违反单一职责原则
- **How to apply**: 
  - 使用 `wc -l` 检查函数行数
  - 超过限制时拆分为多个子函数
  - 复杂逻辑提取为独立函数

### 1.2 函数参数
- **规则**: 函数参数不超过 5 个
- **Why**: 过多参数表明函数职责不清晰，难以调用和测试
- **How to apply**:
  - 超过5个参数时使用 Pydantic Model 封装
  - 相关参数组合成配置对象
  - 示例: `def process(config: ProcessConfig)` 而非 `def process(a, b, c, d, e, f)`

### 1.3 嵌套深度
- **规则**: 代码嵌套不超过 3 层
- **Why**: 深层嵌套降低可读性，增加认知负担
- **How to apply**:
  - 使用早返回（early return）减少嵌套
  - 提取条件判断为独立函数
  - 使用卫语句（guard clauses）

```python
# ❌ 错误示例
def process(data):
    if data:
        if data.valid:
            if data.ready:
                return data.value
    return None

# ✅ 正确示例
def process(data):
    if not data:
        return None
    if not data.valid:
        return None
    if not data.ready:
        return None
    return data.value
```

---

## 2. 架构规则

### 2.1 分层隔离
- **规则**: API层不直接访问数据库，必须通过Service层
- **Why**: 分层隔离提高可测试性，便于替换实现
- **How to apply**:
  ```
  API层 (api/*.py) → Service层 (services/*.py) → Data层 (models/*.py)
  ```
  - API层只处理HTTP请求/响应
  - Service层包含业务逻辑
  - Data层只负责数据持久化

### 2.2 依赖注入
- **规则**: 使用 FastAPI Depends 进行依赖注入，禁止全局变量
- **Why**: 全局变量导致测试困难，状态不可控
- **How to apply**:
```python
# ❌ 错误
db_session = create_session()  # 全局变量

@router.get("/users")
def get_users():
    return db_session.query(User).all()

# ✅ 正确
@router.get("/users")
def get_users(db: AsyncSession = Depends(get_db)):
    return await db.execute(select(User)).scalars().all()
```

### 2.3 配置管理
- **规则**: 所有配置必须通过环境变量或 config.py，禁止硬编码
- **Why**: 硬编码导致环境切换困难，安全风险高
- **How to apply**:
  - 使用 Pydantic Settings
  - 敏感信息（密钥、密码）必须从环境变量读取
  - 提供 .env.example 模板

---

## 3. 数据库规则

### 3.1 查询优化
- **规则**: N+1查询必须使用 joinedload/selectinload 优化
- **Why**: N+1查询导致数据库压力倍增
- **How to apply**:
```python
# ❌ 错误: N+1查询
users = await db.execute(select(User)).scalars().all()
for user in users:
    profile = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id)).scalar()

# ✅ 正确: 使用joinedload
users = await db.execute(
    select(User).options(joinedload(User.profile))
).scalars().all()
```

### 3.2 事务管理
- **规则**: 多表操作必须使用事务，确保原子性
- **Why**: 避免数据不一致
- **How to apply**:
```python
async with db.begin():
    user = User(username="test")
    db.add(user)
    await db.flush()  # 获取user.id
    
    profile = StudentProfile(user_id=user.id)
    db.add(profile)
    # commit自动执行
```

### 3.3 索引规范
- **规则**: 外键、查询条件字段必须建立索引
- **Why**: 无索引导致全表扫描，性能急剧下降
- **How to apply**:
  - 外键自动索引: `ForeignKey(..., index=True)`
  - 查询字段: `Column(..., index=True)`
  - 复合索引: `Index('idx_name', 'col1', 'col2')`

---

## 4. 异步编程规则

### 4.1 异步一致性
- **规则**: 异步函数调用链必须全程 async/await，禁止混用同步
- **Why**: 混用导致事件循环阻塞，性能下降
- **How to apply**:
```python
# ❌ 错误: 异步函数中调用同步IO
async def get_user(user_id: int):
    data = open("file.txt").read()  # 阻塞IO
    return data

# ✅ 正确: 使用异步IO
async def get_user(user_id: int):
    async with aiofiles.open("file.txt") as f:
        data = await f.read()
    return data
```

### 4.2 并发控制
- **规则**: 并发任务数必须限制，使用 asyncio.Semaphore
- **Why**: 无限并发导致资源耗尽
- **How to apply**:
```python
semaphore = asyncio.Semaphore(10)  # 最多10个并发

async def process_item(item):
    async with semaphore:
        return await heavy_task(item)

results = await asyncio.gather(*[process_item(i) for i in items])
```

---

## 5. 错误处理规则

### 5.1 异常分层
- **规则**: 业务异常使用自定义异常，系统异常使用标准异常
- **Why**: 区分异常类型便于统一处理
- **How to apply**:
```python
# 定义业务异常
class UserNotFoundError(Exception):
    pass

class InsufficientPermissionError(Exception):
    pass

# API层统一处理
@app.exception_handler(UserNotFoundError)
async def user_not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"error": str(exc)})
```

### 5.2 错误日志
- **规则**: 所有异常必须记录日志，包含上下文信息
- **Why**: 便于问题排查
- **How to apply**:
```python
try:
    result = await process_data(user_id, data)
except Exception as e:
    logger.error(
        f"Process failed for user {user_id}",
        exc_info=True,  # 包含堆栈
        extra={"user_id": user_id, "data_size": len(data)}
    )
    raise
```

### 5.3 优雅降级
- **规则**: 外部依赖失败时必须有降级方案
- **Why**: 提高系统可用性
- **How to apply**:
```python
async def get_entity_graph(entity_name: str):
    try:
        return await neo4j_client.query(entity_name)
    except Neo4jConnectionError:
        logger.warning("Neo4j unavailable, fallback to search")
        return await search_knowledge_base(entity_name)
```

---

## 6. 安全规则

### 6.1 密码安全
- **规则**: 密码必须使用 bcrypt 加密，cost >= 12
- **Why**: 防止彩虹表攻击
- **How to apply**:
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_context.hash(password)  # 自动使用cost=12
```

### 6.2 SQL注入防护
- **规则**: 禁止字符串拼接SQL，必须使用参数化查询
- **Why**: 防止SQL注入
- **How to apply**:
```python
# ❌ 错误
query = f"SELECT * FROM users WHERE username = '{username}'"

# ✅ 正确
query = select(User).where(User.username == username)
```

### 6.3 路径遍历防护
- **规则**: 文件路径必须验证，禁止 `../`
- **Why**: 防止访问系统文件
- **How to apply**:
```python
def safe_path(base_dir: Path, user_path: str) -> Path:
    full_path = (base_dir / user_path).resolve()
    if not str(full_path).startswith(str(base_dir.resolve())):
        raise ValueError("Path traversal detected")
    return full_path
```

---

## 7. 测试规则

### 7.1 测试覆盖率
- **规则**: 核心业务逻辑测试覆盖率 >= 80%
- **Why**: 保证代码质量，防止回归
- **How to apply**:
  - 使用 pytest-cov 检查覆盖率
  - 每个Service函数必须有单元测试
  - 关键API必须有集成测试

### 7.2 Mock外部依赖
- **规则**: 单元测试必须Mock数据库、Redis、LLM等外部依赖
- **Why**: 测试速度快，结果可控
- **How to apply**:
```python
@pytest.fixture
def mock_db():
    return AsyncMock(spec=AsyncSession)

async def test_get_user(mock_db):
    mock_db.execute.return_value.scalar.return_value = User(id=1)
    result = await get_user(1, mock_db)
    assert result.id == 1
```

### 7.3 测试隔离
- **规则**: 每个测试用例必须独立，不依赖执行顺序
- **Why**: 避免测试间相互影响
- **How to apply**:
  - 使用 fixture 初始化数据
  - 测试后清理数据
  - 避免共享全局状态

---

## 8. 性能规则

### 8.1 数据库连接池
- **规则**: 使用连接池，避免频繁创建连接
- **Why**: 连接创建开销大
- **How to apply**:
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,        # 常驻连接
    max_overflow=20,     # 最大溢出
    pool_pre_ping=True   # 连接健康检查
)
```

### 8.2 缓存策略
- **规则**: 热数据必须缓存，TTL根据更新频率设置
- **Why**: 减少数据库压力
- **How to apply**:
  - 用户Token: TTL 30分钟
  - 会话上下文: TTL 7天
  - 学生画像: TTL 1小时

### 8.3 批量操作
- **规则**: 批量插入/更新使用 bulk_insert_mappings
- **Why**: 减少数据库往返次数
- **How to apply**:
```python
# ❌ 错误: 逐条插入
for item in items:
    db.add(User(**item))
    await db.commit()

# ✅ 正确: 批量插入
await db.execute(insert(User), items)
await db.commit()
```

---

## 9. 文档规则

### 9.1 函数文档
- **规则**: 公共函数必须有 docstring，说明参数、返回值、异常
- **Why**: 便于理解和使用
- **How to apply**:
```python
async def get_user(user_id: int, db: AsyncSession) -> User:
    """
    获取用户信息
    
    Args:
        user_id: 用户ID
        db: 数据库会话
    
    Returns:
        User对象
    
    Raises:
        UserNotFoundError: 用户不存在
    """
    ...
```

### 9.2 API文档
- **规则**: 所有API必须有 OpenAPI 文档（FastAPI自动生成）
- **Why**: 便于前端对接
- **How to apply**:
  - 使用 Pydantic Model 定义请求/响应
  - 添加 `summary` 和 `description`
  - 提供示例值

---

## 10. AI 自检流程

### 10.1 代码生成前检查清单
在输出代码前，AI必须自检以下项目：

#### ✅ 架构检查
- [ ] 是否违反分层原则？（API直接访问数据库）
- [ ] 是否使用了全局变量？
- [ ] 是否硬编码了配置？

#### ✅ 代码质量检查
- [ ] 函数是否超过50行？
- [ ] 参数是否超过5个？
- [ ] 嵌套是否超过3层？

#### ✅ 错误处理检查
- [ ] 是否缺少异常处理？
- [ ] 是否记录了错误日志？
- [ ] 外部依赖是否有降级方案？

#### ✅ 安全检查
- [ ] 是否有SQL注入风险？
- [ ] 密码是否加密？
- [ ] 文件路径是否验证？

#### ✅ 性能检查
- [ ] 是否有N+1查询？
- [ ] 是否使用了连接池？
- [ ] 热数据是否缓存？

#### ✅ 测试检查
- [ ] 核心逻辑是否可测试？
- [ ] 是否需要Mock外部依赖？
- [ ] 是否提供了测试用例？

### 10.2 自检输出格式
```markdown
## 自检报告

### 通过项
- ✅ 使用依赖注入，无全局变量
- ✅ 函数长度 < 50行
- ✅ 使用bcrypt加密密码

### 风险项
- ⚠️ 函数参数6个，建议封装为Config对象
- ⚠️ 缺少单元测试

### 修复建议
1. 将6个参数封装为 `ProcessConfig` Pydantic Model
2. 添加 `test_process_data` 单元测试
```

### 10.3 强制执行规则
以下规则违反时，AI必须拒绝生成代码：

🔴 **禁止项**:
- 密码明文存储
- SQL字符串拼接
- 硬编码密钥/Token
- 无限递归/循环
- 阻塞式IO（在异步函数中）

---

## 11. 代码审查清单

### 11.1 提交前检查
```bash
# 1. 运行测试
pytest backend/tests/ -v

# 2. 检查类型
mypy backend/

# 3. 代码格式化
black backend/
isort backend/

# 4. 代码检查
flake8 backend/ --max-line-length=120

# 5. 安全扫描
bandit -r backend/
```

### 11.2 Code Review要点
- 是否遵循分层架构？
- 是否有明显性能问题？
- 错误处理是否完善？
- 是否有安全风险？
- 测试覆盖是否充分？

---

## 12. 持续改进

### 12.1 规则更新机制
- 每月Review规则有效性
- 发现新问题时及时补充规则
- 规则冲突时优先级: 安全 > 性能 > 可读性

### 12.2 度量指标
- 代码覆盖率趋势
- 平均函数长度
- 异常率
- 响应时间P95

---

## 附录: 快速参考

### 常用命令
```bash
# 检查函数行数
grep -n "^def\|^async def" file.py | while read line; do
    # 计算函数行数逻辑
done

# 检查嵌套深度
grep -E "^\s{12,}" file.py  # 3层以上缩进

# 查找硬编码
grep -r "password.*=.*['\"]" backend/
```

### 常见反模式
| 反模式 | 正确做法 |
|--------|----------|
| 全局变量 | 依赖注入 |
| 字符串拼接SQL | 参数化查询 |
| 同步IO | 异步IO |
| 无异常处理 | try-except + 日志 |
| 硬编码配置 | 环境变量 |
| N+1查询 | joinedload |
| 无限并发 | Semaphore限流 |


###
用户规则需要牢记
1.项目环境 venv/Scripts
2.所有测试都需放在tests下并且与真是文件中对应，例如是测试models下的
代码，就在tests文件夹下创建models文件夹在创建test的py文件
3.不要擅自创建md文档，只有我需要时才会命令你创建
