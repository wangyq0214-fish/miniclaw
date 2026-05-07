# Backend Tests

## 目录结构

tests/
├── __init__.py
├── test_redis_session.py      # Redis 会话管理器测试
├── test_hybrid_session.py     # 混合存储管理器测试
└── README.md                   # 本文件

## 运行测试

### 运行单个测试文件

python tests/test_redis_session.py
python tests/test_hybrid_session.py

### 使用 pytest 运行所有测试

pip install pytest
pytest tests/
pytest tests/ -v

## 前置条件

1. PostgreSQL 服务已启动（localhost:5432）
2. Redis 服务已启动（localhost:6379）
3. 数据库已初始化（运行 migrate.py）
4. 已安装所有依赖（pip install -r requirements.txt）
