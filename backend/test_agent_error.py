"""Test agent initialization to find user_id error"""
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agent import agent_manager
from config import get_project_root
from tools import get_all_tools
from memory import system_prompt_builder

async def test_agent():
    try:
        # Initialize agent with user_id
        user_id = 9
        tools = get_all_tools(base_dir=get_project_root(), user_id=user_id)

        await agent_manager.initialize(
            base_dir=get_project_root(),
            tools=tools,
            session_manager=None,
            prompt_builder=system_prompt_builder,
            memory_indexer=None,
            user_id=user_id
        )

        print("Agent initialized successfully")

        # Try to stream
        system_prompt = system_prompt_builder.build(rag_mode=False)

        async for event in agent_manager.astream(
            message="你好",
            history=[],
            system_prompt=system_prompt,
            session_id="test_session"
        ):
            print(f"Event: {event}")
            if event.get("type") == "error":
                print(f"Error occurred: {event.get('error')}")
                break

    except Exception as e:
        import traceback
        print(f"Exception: {e}")
        print(f"Traceback:\n{traceback.format_exc()}")

if __name__ == "__main__":
    asyncio.run(test_agent())
