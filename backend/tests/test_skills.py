"""
测试 SkillsMiddleware + FilesystemBackend(virtual_mode=True) 的 skills 加载

用法:
    cd backend
    venv/Scripts/python.exe tests/test_skills.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, ".")

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessageChunk

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from tools import get_custom_tools

BACKEND_ROOT = str(Path(__file__).parent.parent.resolve())

model = ChatOpenAI(
    model="qwen-plus-2025-07-28",
    api_key="sk-f210e0041b6a45bd97adc7d42ddb9df0",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    temperature=0,
)


async def main():
    backend = FilesystemBackend(root_dir=BACKEND_ROOT, virtual_mode=True)
    tools = get_custom_tools(base_dir=Path(BACKEND_ROOT))

    # 先验证 skills 目录在 backend 内可见
    ls_result = await backend.als("/skills/")
    print(f"[skills dir] entries: {[e['path'] for e in ls_result.entries]}")

    skill_result = await backend.aread("/skills/get_weather/SKILL.md")
    if skill_result.error:
        print(f"[SKILL.md] ERROR: {skill_result.error}")
    else:
        print(f"[SKILL.md] OK, len={len(str(skill_result.file_data))}")

    # 创建带 skills 的 agent
    agent = create_deep_agent(
        model=model,
        tools=tools,
        system_prompt="You are a helpful assistant.",
        backend=backend,
        skills=["/skills/"],
    )

    print("\n--- 询问 agent 有哪些技能 ---")
    full = []
    async for event in agent.astream(
        {"messages": [HumanMessage(content="你有哪些技能？请列出所有可用的 skills。")]},
        stream_mode=["messages", "updates"],
    ):
        if isinstance(event, tuple):
            mode, data = event
            if mode == "messages":
                chunk = data[0] if isinstance(data, tuple) else data
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    full.append(chunk.content)
                    sys.stdout.buffer.write(chunk.content.encode("utf-8"))
                    sys.stdout.buffer.flush()

    sys.stdout.buffer.write(b"\n\n--- done ---\n")
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    asyncio.run(main())
