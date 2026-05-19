"""
调试工具调用事件结构 v2 — 只用 messages 模式，打印所有 chunk 类型
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, ".")

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage, AIMessage

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

BACKEND_ROOT = str(Path(__file__).parent.parent)

model = ChatOpenAI(
    model="qvq-max-2025-03-25",
    api_key="sk-f210e0041b6a45bd97adc7d42ddb9df0",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    temperature=0,
)

backend = FilesystemBackend(root_dir=BACKEND_ROOT, virtual_mode=False)

TEST_PROMPT = "用 ls 工具列出当前目录下的文件，然后告诉我有哪些文件。"


async def main():
    agent = create_deep_agent(
        model=model,
        tools=[],
        system_prompt="You are a helpful assistant.",
        backend=backend,
    )

    print("\n=== messages-only 模式事件 ===\n")
    event_index = 0

    async for event in agent.astream(
        {"messages": [HumanMessage(content=TEST_PROMPT)]},
        stream_mode="messages",   # 只用 messages 模式
    ):
        event_index += 1
        if event_index > 200:
            print("  [截断：已打印 200 条 event]")
            break

        # messages 模式：event 是 (chunk, metadata) 二元组
        if isinstance(event, tuple):
            chunk, meta = event
        else:
            chunk = event

        if isinstance(chunk, AIMessageChunk):
            if chunk.tool_call_chunks:
                for tc in chunk.tool_call_chunks:
                    print(f"[{event_index}] AIMessageChunk.tool_call_chunk: id={tc.get('id')!r} name={tc.get('name')!r} args={repr(str(tc.get('args',''))[:60])}")
            if chunk.content:
                print(f"[{event_index}] AIMessageChunk.content: {repr(chunk.content[:80])}")
        elif isinstance(chunk, AIMessage):
            tc = getattr(chunk, "tool_calls", None)
            print(f"[{event_index}] AIMessage: content={repr(str(chunk.content)[:60])} tool_calls={tc}")
        elif isinstance(chunk, ToolMessage):
            print(f"[{event_index}] ToolMessage: tool_call_id={chunk.tool_call_id!r} content={repr(str(chunk.content)[:100])}")
        else:
            print(f"[{event_index}] {type(chunk).__name__}: {repr(str(chunk)[:120])}")

    print(f"\n=== 完成，共 {event_index} 条 event ===")


if __name__ == "__main__":
    asyncio.run(main())

