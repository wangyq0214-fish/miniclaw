"""
Mini-OpenClaw 端到端测试脚本

测试项：
1. 后端健康检查
2. 模型 API 可达性
3. deepagents astream 事件流
4. /api/chat SSE 流式接口
5. Session 管理接口

用法：
    cd backend
    venv/Scripts/python.exe test_e2e.py
"""
import asyncio
import sys
import time
import json
import httpx

sys.path.insert(0, ".")


# ─── 配置 ────────────────────────────────────────────────────────────────────

BACKEND_URL = "http://localhost:8002"
TEST_SESSION = "e2e_test_session"
TEST_MESSAGE = "请回复数字 42，不要有其他内容"

# ─── 工具函数 ─────────────────────────────────────────────────────────────────

def ok(label: str, detail: str = ""):
    suffix = f"  ({detail})" if detail else ""
    print(f"  [PASS] {label}{suffix}")

def fail(label: str, detail: str = ""):
    suffix = f"  ({detail})" if detail else ""
    print(f"  [FAIL] {label}{suffix}")

def section(title: str):
    print(f"\n{'─' * 50}")
    print(f"  {title}")
    print(f"{'─' * 50}")


# ─── 测试 1：后端健康检查 ──────────────────────────────────────────────────────

def test_health():
    section("1. 后端健康检查")
    try:
        r = httpx.get(f"{BACKEND_URL}/health", timeout=5)
        if r.status_code == 200 and r.json().get("status") == "healthy":
            ok("GET /health", "status=healthy")
        else:
            fail("GET /health", f"status={r.status_code} body={r.text[:80]}")
    except Exception as e:
        fail("GET /health", str(e))


# ─── 测试 2：模型 API 可达性 ───────────────────────────────────────────────────

def test_model_api():
    section("2. 模型 API 可达性")
    from config import settings

    print(f"     API base : {settings.openai_api_base}")
    print(f"     Model    : {settings.openai_model}")

    try:
        r = httpx.get(f"{settings.openai_api_base}/models", timeout=10)
        models = [m["id"] for m in r.json().get("data", [])]
        ok("GET /v1/models", f"{len(models)} models available")
    except Exception as e:
        fail("GET /v1/models", str(e))
        return

    try:
        t0 = time.time()
        r = httpx.post(
            f"{settings.openai_api_base}/chat/completions",
            json={
                "model": settings.openai_model,
                "messages": [{"role": "user", "content": "1+1=?"}],
                "stream": False,
                "max_tokens": 10,
                "think": False,
            },
            headers={"Authorization": f"Bearer {settings.openai_api_key or 'sk-dummy'}"},
            timeout=30,
        )
        elapsed = time.time() - t0
        content = r.json()["choices"][0]["message"]["content"]
        ok("POST /v1/chat/completions (non-stream)", f"{elapsed:.1f}s  reply={repr(content[:40])}")
    except Exception as e:
        fail("POST /v1/chat/completions", str(e))


# ─── 测试 3：deepagents astream 事件流 ────────────────────────────────────────

async def test_deepagents_stream():
    section("3. deepagents astream 事件流")
    from deepagents import create_deep_agent
    from deepagents.backends.filesystem import FilesystemBackend
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, AIMessageChunk
    from config import settings
    from pathlib import Path

    model = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key or "sk-dummy",
        base_url=settings.openai_api_base,
        temperature=0.7,
        extra_body={"think": False},
    )
    backend = FilesystemBackend(
        root_dir=str(Path(".").resolve()),
        virtual_mode=False,
    )
    agent = create_deep_agent(
        model=model,
        tools=[],
        system_prompt="You are helpful. Reply concisely.",
        backend=backend,
    )

    t0 = time.time()
    tokens = []
    event_types = []
    try:
        async for event in agent.astream(
            {"messages": [HumanMessage(content="say hello")]},
            stream_mode=["messages", "updates"],
        ):
            if isinstance(event, tuple):
                mode, data = event
                chunk = data[0] if isinstance(data, tuple) else data
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    tokens.append(chunk.content)
                    event_types.append("token")

        elapsed = time.time() - t0
        full_text = "".join(tokens)
        if tokens:
            ok("astream produces tokens", f"{elapsed:.1f}s  text={repr(full_text[:60])}")
        else:
            fail("astream produces tokens", f"no tokens in {elapsed:.1f}s")
    except Exception as e:
        fail("astream", str(e))


# ─── 测试 4：/api/chat SSE 流式接口 ───────────────────────────────────────────

async def test_chat_sse():
    section("4. /api/chat SSE 流式接口")
    events = []
    token_text = ""
    t0 = time.time()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{BACKEND_URL}/api/chat",
                json={"message": TEST_MESSAGE, "session_id": TEST_SESSION, "stream": True},
                headers={"Content-Type": "application/json"},
            ) as resp:
                if resp.status_code != 200:
                    fail("/api/chat SSE", f"HTTP {resp.status_code}")
                    return

                buffer = ""
                async for chunk in resp.aiter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop()
                    for line in lines:
                        if line.startswith("data: "):
                            try:
                                data = json.loads(line[6:])
                                etype = data.get("type")
                                events.append(etype)
                                if etype == "token":
                                    token_text += data.get("content", "")
                                if etype == "done":
                                    break
                            except json.JSONDecodeError:
                                pass

        elapsed = time.time() - t0
        if "token" in events:
            ok("SSE token events received", f"{elapsed:.1f}s  text={repr(token_text[:60])}")
        else:
            fail("SSE token events", f"events seen: {events}")

        if "done" in events:
            ok("SSE done event received")
        else:
            fail("SSE done event", f"events seen: {events}")

    except Exception as e:
        fail("/api/chat SSE", str(e))


# ─── 测试 5：Session 管理接口 ─────────────────────────────────────────────────

def test_sessions():
    section("5. Session 管理接口")
    try:
        r = httpx.get(f"{BACKEND_URL}/api/sessions", timeout=5)
        sessions = r.json().get("sessions", [])
        ok("GET /api/sessions", f"{len(sessions)} sessions")
    except Exception as e:
        fail("GET /api/sessions", str(e))

    try:
        r = httpx.get(f"{BACKEND_URL}/api/sessions/{TEST_SESSION}", timeout=5)
        if r.status_code == 200:
            msgs = r.json().get("messages", [])
            ok(f"GET /api/sessions/{TEST_SESSION}", f"{len(msgs)} messages")
        else:
            fail(f"GET /api/sessions/{TEST_SESSION}", f"HTTP {r.status_code}")
    except Exception as e:
        fail(f"GET /api/sessions/{TEST_SESSION}", str(e))


# ─── 主入口 ───────────────────────────────────────────────────────────────────

async def main():
    print("\n" + "=" * 50)
    print("  Mini-OpenClaw E2E Test")
    print("=" * 50)

    test_health()
    test_model_api()
    await test_deepagents_stream()
    await test_chat_sse()
    test_sessions()

    print("\n" + "=" * 50)
    print("  Done.")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
