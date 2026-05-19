"""
DeepAgents 多平台流式响应测试

直接在本文件内配置不同平台的模型，逐一测试 deepagents 的 astream 事件流。

用法：
    cd backend
    venv/Scripts/python.exe tests/test_stream_platforms.py
"""

import asyncio
import sys
import time
from dataclasses import dataclass
from typing import Optional

sys.path.insert(0, ".")

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessageChunk

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from pathlib import Path

# ─── 模型配置（在这里添加 / 修改平台）────────────────────────────────────────

@dataclass
class ModelConfig:
    name: str           # 显示名称
    api_base: str
    api_key: str
    model: str
    extra_body: Optional[dict] = None   # 额外请求参数，如 {"think": False}


MODELS = [
    ModelConfig(
        name="DashScope / QVQ-Max",
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="sk-f210e0041b6a45bd97adc7d42ddb9df0",
        model="qvq-max-2025-03-25",
    ),
    # ── 取消注释以添加更多平台 ──────────────────────────────────────────────
    # ModelConfig(
    #     name="Ollama / qwen3-coder:30b",
    #     api_base="http://36.141.78.166:18869/v1",
    #     api_key="sk-dummy",
    #     model="qwen3-coder:30b",
    #     extra_body={"think": False},
    # ),
    # ModelConfig(
    #     name="DeepSeek / deepseek-chat",
    #     api_base="https://api.deepseek.com",
    #     api_key="your-deepseek-key",
    #     model="deepseek-chat",
    # ),
    # ModelConfig(
    #     name="OpenAI / gpt-4o-mini",
    #     api_base="https://api.openai.com/v1",
    #     api_key="your-openai-key",
    #     model="gpt-4o-mini",
    # ),
]

# ─── 测试参数 ─────────────────────────────────────────────────────────────────

TEST_PROMPT = "你好，用一句话介绍你自己。"
BACKEND_ROOT = str(Path(__file__).parent.parent)   # backend/

# ─── 核心测试逻辑 ─────────────────────────────────────────────────────────────

async def test_model(cfg: ModelConfig) -> bool:
    print(f"\n{'─' * 60}")
    print(f"  模型: {cfg.name}")
    print(f"  base_url: {cfg.api_base}")
    print(f"  model: {cfg.model}")
    print(f"{'─' * 60}")

    # 构建 ChatOpenAI
    kwargs: dict = dict(
        model=cfg.model,
        api_key=cfg.api_key,
        base_url=cfg.api_base,
        temperature=0.7,
    )
    if cfg.extra_body:
        kwargs["extra_body"] = cfg.extra_body

    model = ChatOpenAI(**kwargs)

    # 构建 FilesystemBackend
    backend = FilesystemBackend(root_dir=BACKEND_ROOT, virtual_mode=False)

    # 构建 DeepAgent
    agent = create_deep_agent(
        model=model,
        tools=[],
        system_prompt="You are a helpful assistant. Reply concisely.",
        backend=backend,
    )

    # 发起流式请求
    t0 = time.time()
    tokens: list[str] = []
    first_token_time: Optional[float] = None
    tool_events: list[str] = []

    try:
        async for event in agent.astream(
            {"messages": [HumanMessage(content=TEST_PROMPT)]},
            stream_mode=["messages", "updates"],
        ):
            elapsed = time.time() - t0

            if isinstance(event, tuple):
                mode, data = event
                # messages 模式：(chunk, metadata) 二元组
                chunk = data[0] if isinstance(data, tuple) else data

                if isinstance(chunk, AIMessageChunk):
                    if chunk.content:
                        if first_token_time is None:
                            first_token_time = elapsed
                            print(f"  首 token  @ {elapsed:.2f}s : {repr(chunk.content[:40])}")
                        tokens.append(chunk.content)

                    # 工具调用 chunk
                    if chunk.tool_call_chunks:
                        for tc in chunk.tool_call_chunks:
                            if tc.get("name"):
                                tool_events.append(tc["name"])

            elif isinstance(event, dict):
                pass  # updates 模式的中间状态，无需打印

        elapsed_total = time.time() - t0
        full_text = "".join(tokens)

        print(f"\n  完整回复 ({len(tokens)} chunks, {elapsed_total:.2f}s 总耗时):")
        print(f"  {repr(full_text[:200])}")

        if tool_events:
            print(f"  工具调用: {tool_events}")

        if tokens:
            print(f"\n  [PASS] {cfg.name} — 流式正常，首 token {first_token_time:.2f}s")
            return True
        else:
            print(f"\n  [FAIL] {cfg.name} — 未收到任何 token（耗时 {elapsed_total:.2f}s）")
            return False

    except Exception as e:
        elapsed_total = time.time() - t0
        print(f"\n  [FAIL] {cfg.name} — 异常（{elapsed_total:.2f}s）: {e}")
        return False


async def main():
    print("\n" + "=" * 60)
    print("  DeepAgents 多平台流式响应测试")
    print("=" * 60)

    results: list[tuple[str, bool]] = []
    for cfg in MODELS:
        passed = await test_model(cfg)
        results.append((cfg.name, passed))

    # 汇总
    print("\n" + "=" * 60)
    print("  测试汇总")
    print("=" * 60)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}]  {name}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
