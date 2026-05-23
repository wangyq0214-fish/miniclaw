"""
Test script to debug why LLM returns empty response for title generation
"""
import asyncio
import os
import sys
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

async def test_title_generation():
    # Load from .env
    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.getenv("OPENAI_API_KEY")
    api_base = os.getenv("OPENAI_API_BASE")
    model = os.getenv("OPENAI_MODEL")

    print(f"Testing with:")
    print(f"  Model: {model}")
    print(f"  Base URL: {api_base}")
    print(f"  API Key: {api_key[:20]}..." if api_key else "  API Key: None")
    print()

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=api_base,
        temperature=0.3,
        max_tokens=5000
    )

    test_cases = [
        ("你好", "Test 1: Simple greeting"),
        ("请帮我解释一下什么是机器学习", "Test 2: Technical question"),
        ("我想学习Python编程，应该从哪里开始？", "Test 3: Long question"),
        ("今天天气怎么样？", "Test 4: Weather question"),
        ("能帮我写一个快速排序的代码吗？", "Test 5: Code request"),
        ("""评价简历【Mini-OpenClaw - AI智能学习助手系统】
GitHub：https://github.com/wangyq0214-fish/mini-OpenClaw
技术栈：Next.js 14, FastAPI, DeepAgents, DeepSeek LLM, LlamaIndex, Neo4j, PostgreSQL, Redis
时间：2026.04 -- 至今

• 开发轻量级、全透明的AI Agent教育辅助系统，采用文件驱动架构（Markdown/JSON替代向量数据库）
• 基于DeepAgents框架构建Agent系统，支持指令式技能调用与Agent操作全程可视化
• 实现SSE流式智能对话系统，支持多轮上下文压缩与会话管理，响应延迟<200ms，支持10+轮连续对话
• 构建Neo4j知识图谱系统，结合AntV G6实现实体关系交互式可视化，支持1000+实体节点与3000+关系边
• 实现RAG混合检索（向量+BM25），支持文件级语义检索，检索准确率达85%+
• 开发11个内置技能：讲座生成、习题、闪卡、思维导图、阅读清单、学习评估、学生画像更新等，内容生成效率提升60%
• 实现6维学生画像（JSONB）与学习进度跟踪，构建完整教育场景闭环
• 集成TTS语音生成、在线代码/文件编辑功能，系统支持50+并发用户""", "Test 6: Resume evaluation (long text)"),
    ]

    for message, label in test_cases:
        print("=" * 60)
        print(label)
        print(f"Input: {message}")
        print("=" * 60)
        try:
            response = await llm.ainvoke([
                HumanMessage(content=f"为以下内容生成一个10字以内的标题（只输出标题，不要解释）：{message}")
            ])
            title = response.content.strip()
            print(f"Response: '{title}'")
            print(f"Length: {len(title)}")

            # Show reasoning tokens if available
            if hasattr(response, 'response_metadata'):
                usage = response.response_metadata.get('token_usage', {})
                reasoning = usage.get('completion_tokens_details', {}).get('reasoning_tokens', 0)
                if reasoning:
                    print(f"Reasoning tokens: {reasoning}")
        except Exception as e:
            print(f"Error: {e}")
        print()

    # Original tests
    print("=" * 60)
    print("Original Test 1: With SystemMessage")
    print("=" * 60)
    try:
        response = await llm.ainvoke([
            SystemMessage(content="请根据用户的输入，提取一个简短、概括性的会话标题。要求：1. 必须在 10 个字以内；2. 不要包含标点符号；3. 直接输出纯文本标题，不要包含'好的'、'标题是'等任何前缀或解释性废话。"),
            HumanMessage(content="你好")
        ])
        print(f"Response: '{response.content}'")
        print(f"Length: {len(response.content)}")
        print(f"Type: {type(response.content)}")
    except Exception as e:
        print(f"Error: {e}")

    print()

    # Test 2: Simpler prompt
    print("=" * 60)
    print("Test 2: Simpler prompt")
    print("=" * 60)
    try:
        response = await llm.ainvoke([
            SystemMessage(content="用5个字以内概括用户的消息"),
            HumanMessage(content="你好")
        ])
        print(f"Response: '{response.content}'")
        print(f"Length: {len(response.content)}")
    except Exception as e:
        print(f"Error: {e}")

    print()

    # Test 3: Direct question
    print("=" * 60)
    print("Test 3: Direct question")
    print("=" * 60)
    try:
        response = await llm.ainvoke([
            HumanMessage(content="请用5个字概括：你好")
        ])
        print(f"Response: '{response.content}'")
        print(f"Length: {len(response.content)}")
    except Exception as e:
        print(f"Error: {e}")

    print()

    # Test 4: Normal conversation
    print("=" * 60)
    print("Test 4: Normal conversation")
    print("=" * 60)
    try:
        response = await llm.ainvoke([
            HumanMessage(content="你好，请介绍一下你自己")
        ])
        print(f"Response (full): '{response.content}'")
        print(f"Response (repr): {repr(response.content)}")
        print(f"Length: {len(response.content)}")
        print(f"Response object: {response}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_title_generation())
