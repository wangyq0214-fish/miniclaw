"""
测试 HybridSessionManager - 混合存储策略
"""
import asyncio
import sys
from pathlib import Path

# 添加 backend 到路径
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from memory.redis_session import RedisSessionManager
from memory.hybrid_session import HybridSessionManager
from database import init_redis, get_redis, get_db
from sqlalchemy import select
from models.complete_models import ConversationSession, Message


async def test_hybrid_session():
    """测试混合会话管理器"""
    print("=" * 60)
    print("测试 HybridSessionManager - 混合存储策略")
    print("=" * 60)
    print()

    # 初始化 Redis
    await init_redis()
    redis_client = await get_redis()
    redis_manager = RedisSessionManager(redis_client, ttl_days=7)

    # 获取数据库会话
    async for db_session in get_db():
        manager = HybridSessionManager(
            redis_manager=redis_manager,
            db_session=db_session
        )

        # 测试数据
        session_id = "test_hybrid_001"
        user_id = 1

        try:
            # 0. 清理旧数据
            print("0. 清理旧数据...")
            await manager.delete_session(session_id, user_id)
            print("   清理完成")
            print()

            # 1. 创建会话 (双写: Redis + PostgreSQL)
            print("1. 创建会话 (双写: Redis + PostgreSQL)...")
            success = await manager.create_session(
                session_id=session_id,
                user_id=user_id,
                metadata={"title": "混合存储测试", "tags": ["test", "hybrid"]}
            )
            print(f"   创建结果: {'成功' if success else '失败'}")
            print()

            # 验证 Redis
            redis_session = await redis_manager.get_session(session_id)
            print(f"   Redis 验证: {'存在' if redis_session else '不存在'}")

            # 验证 PostgreSQL
            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await db_session.execute(stmt)
            db_session_obj = result.scalar_one_or_none()
            print(f"   PostgreSQL 验证: {'存在' if db_session_obj else '不存在'}")
            print()

            # 2. 添加消息 (双写)
            print("2. 添加消息 (双写: Redis + PostgreSQL)...")
            await manager.add_message(session_id, "user", "你好，这是混合存储测试")
            await manager.add_message(session_id, "assistant", "你好！我已收到消息")
            print("   已添加 2 条消息")
            print()

            # 验证 Redis 消息
            redis_messages = await redis_manager.get_messages(session_id)
            print(f"   Redis 消息数: {len(redis_messages)}")

            # 验证 PostgreSQL 消息
            msg_stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            session_result = await db_session.execute(msg_stmt)
            db_session_obj = session_result.scalar_one_or_none()

            if db_session_obj:
                msg_stmt2 = select(Message).where(Message.session_id == db_session_obj.id)
                msg_result = await db_session.execute(msg_stmt2)
                db_messages = msg_result.scalars().all()
                print(f"   PostgreSQL 消息数: {len(db_messages)}")
            else:
                print(f"   PostgreSQL 消息数: 0 (会话不存在)")
            print()

            # 3. 获取消息 (优先从 Redis)
            print("3. 获取消息 (优先从 Redis)...")
            messages = await manager.get_messages(session_id, from_cache=True)
            print(f"   获取到 {len(messages)} 条消息")
            for i, msg in enumerate(messages, 1):
                print(f"   [{i}] {msg['role']}: {msg['content'][:30]}...")
            print()

            # 4. 测试缓存未命中 (从 PostgreSQL 读取)
            print("4. 测试缓存未命中 (从 PostgreSQL 读取)...")
            messages_db = await manager.get_messages(session_id, from_cache=False)
            print(f"   从数据库获取到 {len(messages_db)} 条消息")
            print()

            # 5. 归档会话到 JSON
            print("5. 归档会话到 JSON...")
            archive_success = await manager.archive_session(session_id)
            print(f"   归档结果: {'成功' if archive_success else '失败'}")
            if archive_success:
                archive_file = Path("data/sessions_archive") / f"{session_id}.json"
                print(f"   归档文件: {archive_file}")
                print(f"   文件存在: {'是' if archive_file.exists() else '否'}")
            print()

            # 6. 获取用户会话列表
            print("6. 获取用户会话列表...")
            user_sessions = await manager.get_user_sessions(user_id)
            print(f"   用户 {user_id} 的会话数: {len(user_sessions)}")
            for sess in user_sessions:
                print(f"   - {sess['session_id']}: {sess['title']}")
            print()

            # 7. 删除会话 (双删: Redis + PostgreSQL)
            print("7. 删除会话 (双删: Redis + PostgreSQL)...")
            await manager.delete_session(session_id, user_id)
            print("   删除成功")
            print()

            # 验证删除
            redis_exists = await redis_manager.session_exists(session_id)
            print(f"   Redis 验证: {'仍存在' if redis_exists else '已删除'}")

            stmt = select(ConversationSession).where(
                ConversationSession.session_id == session_id
            )
            result = await db_session.execute(stmt)
            db_exists = result.scalar_one_or_none()
            print(f"   PostgreSQL 验证: {'仍存在' if db_exists else '已删除'}")
            print()

            print("=" * 60)
            print("所有测试通过")
            print("=" * 60)

        except Exception as e:
            print(f"\n测试失败: {str(e)}")
            import traceback
            traceback.print_exc()

        finally:
            await redis_client.aclose()
            break


if __name__ == "__main__":
    asyncio.run(test_hybrid_session())
