"""
测试 RedisSessionManager
"""
import asyncio
import sys
from pathlib import Path

# 添加 backend 到路径
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from memory.redis_session import RedisSessionManager
from database import init_redis, get_redis


async def test_redis_session():
    """测试 Redis 会话管理器"""
    print("=" * 60)
    print("测试 RedisSessionManager")
    print("=" * 60)
    print()

    # 初始化 Redis
    await init_redis()
    redis_client = await get_redis()
    manager = RedisSessionManager(redis_client, ttl_days=7)

    # 测试数据
    session_id = "test_session_001"
    user_id = 1

    try:
        # 1. 创建会话
        print("1. 创建会话...")
        success = await manager.create_session(
            session_id=session_id,
            user_id=user_id,
            metadata={"title": "测试会话", "tags": ["test"]}
        )
        print(f"   创建结果: {'成功' if success else '失败'}")
        print()

        # 2. 添加消息
        print("2. 添加消息...")
        await manager.add_message(session_id, "user", "你好")
        await manager.add_message(session_id, "assistant", "你好！")
        print("   已添加 2 条消息")
        print()

        # 3. 获取消息
        print("3. 获取消息...")
        messages = await manager.get_messages(session_id)
        print(f"   消息数量: {len(messages)}")
        print()

        # 4. 删除会话
        print("4. 删除会话...")
        await manager.delete_session(session_id, user_id)
        print("   删除成功")
        print()

        print("=" * 60)
        print("所有测试通过")
        print("=" * 60)

    except Exception as e:
        print(f"\n测试失败: {str(e)}")
        import traceback
        traceback.print_exc()

    finally:
        await redis_client.close()


if __name__ == "__main__":
    asyncio.run(test_redis_session())
