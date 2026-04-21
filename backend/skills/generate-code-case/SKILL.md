---
name: generate-code-case
description: Generate 2-4 runnable, leveled code cases (Python) that demonstrate a concept with smoke-tested examples, requirements.txt, and a learning-order README. Use when the student asks for 代码 / 实现 / 示例 / demo / 动手.
allowed-tools: read_file write_file python_repl get_entity_graph
---

# 代码实操案例生成技能

> 指令文件,非 tool。被 `code_case_builder` 子代理读取执行。

## 执行步骤

### Step 1:读画像
**tool**: `read_file` · **input**: `{"path": "workspace/USER.md"}`

关注:
- 维度 1:专业(决定示例领域 — CS → 算法/系统,EE → 信号处理,金融 → 量化,生物 → 生信)
- 维度 3:Python 相关实体的 mastery(决定代码风格 — 新手多注释,老手可简洁)
- 维度 8:举例风格(偏代码实例 → 多写案例)

### Step 2:查概念依赖
**tool**: `get_entity_graph` · **input**: `{"entity_name": "<主题>"}`

拿到核心子步骤(如反向传播的核心子步骤:前向传播、损失计算、梯度计算、参数更新)→ 作为案例切分的骨架。

### Step 3:规划案例

默认 2-4 个案例,按难度递进:

| 案例 | 目标 | 依赖 |
|---|---|---|
| **01_minimal** | 最小可运行,用标准库 / numpy | 无额外依赖 |
| **02_typical** | 加数据 + 可视化(matplotlib) | numpy, matplotlib |
| **03_advanced**(可选) | 用主流库(PyTorch/TF)+ 性能考量 | torch |
| **04_applied**(可选) | 解决学生专业相关的具体问题 | 按需 |

入门学生(Python mastery < 0.5):只做 01 + 02。
熟练学生(Python mastery ≥ 0.7):做 01-03 或 01-04。

### Step 4:逐个写 .py 文件

每个 .py 的标准模板:

```python
"""
<主题> - Case NN: <case title>

目标: <一句话说本案例演示什么>
先修: <列出要先会的概念/库>
难度: <⭐ / ⭐⭐ / ⭐⭐⭐>
预计用时: <N 分钟>

运行:
    python <this_file.py>
"""
import numpy as np
np.random.seed(42)  # 可复现


# === 1. 数据准备 ===
def make_data():
    """构造一个简单的数据集,便于手算对照"""
    X = np.array([...])
    y = np.array([...])
    return X, y


# === 2. 核心实现 ===
def forward(x, W, b):
    """前向传播(带详细注释,每步为什么)"""
    # ...
    return ...


def backward(x, y_pred, y_true, W):
    """反向传播:计算梯度"""
    # 步骤 A: 计算损失对输出的偏导
    # ...
    return dW


# === 3. 验证 / 可视化 ===
def main():
    X, y = make_data()
    W = np.random.randn(2, 1) * 0.01
    b = 0.0

    for step in range(10):
        y_pred = forward(X, W, b)
        dW = backward(X, y_pred, y, W)
        W -= 0.01 * dW
        loss = ((y_pred - y) ** 2).mean()
        print(f"step {step}: loss={loss:.4f}")

    print("最终权重:", W.ravel())


if __name__ == "__main__":
    main()
```

**写盘**(对每个 case 一次):
**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<date>/<topic-slug>/code_cases/<NN>_<short_name>.py",
  "mode": "write",
  "content": "<代码>"
}
```

### Step 5:smoke test 关键片段(仅测 import + 核心调用)

**tool**: `python_repl` · **input**:
```python
import sys, importlib.util
spec = importlib.util.spec_from_file_location(
    "m", "knowledge/generated/<date>/<topic-slug>/code_cases/01_minimal.py"
)
m = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(m)
    # 如果有 main(),测试 main() 不抛异常(但如果 main 会跑太久,只测关键函数)
    if hasattr(m, "forward"):
        import numpy as np
        x = np.random.randn(3, 2)
        W = np.random.randn(2, 1)
        b = 0.0
        y = m.forward(x, W, b)
        print("forward smoke:", y.shape)
    print("OK")
except Exception as e:
    print("FAIL:", e)
```

原则:**快进快出**,只确认 import + 关键函数调用。不跑完整训练循环。

### Step 6:写 requirements.txt

**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<date>/<topic-slug>/code_cases/requirements.txt",
  "mode": "write",
  "content": "numpy>=1.20\nmatplotlib>=3.5\n# torch>=2.0  # 仅 case 03 需要"
}
```

只列实际 import 过的库。进阶 case 的库用注释说明。

### Step 7:写 README.md

**tool**: `write_file` · **input**:
```json
{
  "path": "knowledge/generated/<date>/<topic-slug>/code_cases/README.md",
  "mode": "write",
  "content": "<README>"
}
```

模板:
```markdown
---
topic: <主题>
topic_slug: <slug>
case_count: <N>
smoke_test_status: pass | partial | fail
student_python_mastery: <值>
generated_at: <ISO>
generated_by: code_case_builder
---

# <主题> · 代码案例

## 建议学习顺序
1. `01_minimal.py` — 最小可运行,手算对照
2. `02_typical.py` — 加数据 + matplotlib 可视化
3. `03_torch.py`(可选) — 用 PyTorch 实现,对比手写差异

## 环境准备
\`\`\`bash
pip install -r requirements.txt
\`\`\`

## smoke-test 报告
- `01_minimal.py`: ✅ 通过
- `02_typical.py`: ✅ 通过
- `03_torch.py`: ⚠️ 需 torch,未测(跳过)

## 每个案例要点
- **01**: 用 numpy 手写一次,帮你从底层理解梯度怎么流
- **02**: 加 matplotlib 看 loss 曲线;若你是视觉型学习者,这个最有感觉
- **03**: 同样任务用 torch.nn.Linear 一行搞定,对比手写的冗余度

## 常见坑
- <基于学生画像维度 5 易错点预判的坑,例如"注意矩阵维度对齐,反向传播时梯度形状要和参数形状一致">
```

## 硬性要求

- **case 01 必须 smoke-test 过**(没过就在 README 标 fail,不能造假)
- 每个 .py ≤ 200 行
- 随机性必须 set seed
- 不调 os.system / subprocess / 网络 / 项目外路径
- 每个文件都要有 `if __name__ == "__main__":` 入口
- 关键步骤中文注释

## 禁止

- 禁止交付未 smoke-test 的代码
- 禁止在代码里 `pip install`(只能声明在 requirements.txt)
- 禁止写和学生专业不搭的示例(CS 学生给生物例子不合适)
- 禁止案例跑不通却在 README 标 pass
