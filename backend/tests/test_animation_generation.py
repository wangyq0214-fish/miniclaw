"""
Test script for HTML animation generation.

Tests the media_director subagent to generate interactive HTML animations.
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from agent import AgentManager
from tools import get_all_tools
from memory import session_manager, system_prompt_builder
from config import get_project_root


async def test_animation_generation():
    """Test HTML animation generation via media_director."""
    print("=" * 60)
    print("Testing HTML Animation Generation")
    print("=" * 60)

    # Initialize agent manager
    agent_manager = AgentManager()

    base_dir = get_project_root()
    tools = get_all_tools(base_dir=base_dir, user_id=1)

    await agent_manager.initialize(
        base_dir=base_dir,
        tools=tools,
        session_manager=session_manager,
        prompt_builder=system_prompt_builder,
        memory_indexer=None,
        user_id=1
    )

    # Build system prompt
    system_prompt = system_prompt_builder.build(rag_mode=False)

    # Test message requesting animation
    test_message = "生成反向传播算法的动画，要能调整学习率参数"

    print(f"\nUser Message: {test_message}\n")
    print("Agent Response:\n")

    # Stream response
    full_response = ""
    async for event in agent_manager.astream(
        message=test_message,
        history=[],
        system_prompt=system_prompt,
        session_id="test_animation"
    ):
        event_type = event.get("type")

        if event_type == "token":
            token = event.get("content", "")
            print(token, end="", flush=True)
            full_response += token

        elif event_type == "tool_start":
            tool_name = event.get("tool", "unknown")
            print(f"\n\n[Tool Call] {tool_name}", flush=True)

        elif event_type == "tool_end":
            tool_name = event.get("tool", "unknown")
            result = event.get("result", "")
            print(f"[Tool Result] {tool_name}: {result[:100]}...", flush=True)

        elif event_type == "error":
            error = event.get("error", "Unknown error")
            print(f"\nError: {error}", flush=True)

    print("\n\n" + "=" * 60)
    print("Test Complete")
    print("=" * 60)

    # Check if HTML animation was generated
    if "```html-animation" in full_response:
        print("[SUCCESS] HTML animation code block detected!")

        # Extract and save the HTML
        start_idx = full_response.find("```html-animation")
        end_idx = full_response.find("```", start_idx + 17)

        if start_idx != -1 and end_idx != -1:
            html_code = full_response[start_idx + 17:end_idx].strip()

            # Save to file for manual testing
            output_file = base_dir / "workspace" / "generated" / "test_animation.html"
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_text(html_code, encoding="utf-8")

            print(f"[SUCCESS] HTML animation saved to: {output_file}")
            print(f"Open in browser to test: file:///{output_file}")
    else:
        print("[WARNING] No HTML animation code block found in response")
        print("The agent may have generated a storyboard only (default mode)")


if __name__ == "__main__":
    asyncio.run(test_animation_generation())
