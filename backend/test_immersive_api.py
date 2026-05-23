"""
Test immersive lecture API
"""
import asyncio
import httpx


async def test_generate():
    url = "http://localhost:8002/api/immersive-lecture/generate"

    test_markdown = """## 深度学习基础

深度学习是机器学习的一个重要分支。

### 神经网络

神经网络由多层神经元组成。

$$y = \sigma(Wx + b)$$

其中 W 是权重矩阵。
"""

    payload = {
        "course_id": "深度学习",
        "chapter_id": 1,
        "page_index": 0,
        "user_id": 2,
        "markdown_content": test_markdown
    }

    print("Testing immersive lecture generation...")
    print(f"Payload: {payload}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, json=payload) as response:
            print(f"Status: {response.status_code}")

            if response.status_code == 200:
                print("\nStreaming response:")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        print(line)
            else:
                text = await response.aread()
                print(f"Error: {text.decode()}")


if __name__ == "__main__":
    asyncio.run(test_generate())
