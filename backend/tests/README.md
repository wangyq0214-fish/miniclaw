# tests 目录说明

所有测试脚本放在这里。

## 运行方式

```bash
cd backend
venv/Scripts/python.exe tests/test_e2e.py
```

## 文件列表

| 文件 | 说明 |
|------|------|
| `test_e2e.py` | 端到端集成测试（健康检查、模型 API、deepagents astream、/api/chat SSE、Session 管理） |
