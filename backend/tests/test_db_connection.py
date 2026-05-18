"""
快速验证数据库连接
"""
import asyncio
import sys


async def test_postgres():
    """测试 PostgreSQL 连接"""
    try:
        import asyncpg
        from config import settings

        # 解析连接字符串
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

        print("测试 PostgreSQL 连接...")
        conn = await asyncpg.connect(db_url)
        version = await conn.fetchval('SELECT version()')
        print(f"[OK] PostgreSQL 连接成功")
        print(f"  版本: {version.split(',')[0]}")
        await conn.close()
        return True
    except Exception as e:
        print(f"[FAIL] PostgreSQL 连接失败: {str(e)}")
        return False


async def test_redis():
    """测试 Redis 连接"""
    try:
        import redis.asyncio as redis
        from config import settings

        print("\n测试 Redis 连接...")
        client = await redis.from_url(settings.redis_url)
        await client.set('test_key', 'test_value')
        value = await client.get('test_key')
        await client.delete('test_key')
        await client.close()

        print(f"[OK] Redis 连接成功")
        print(f"  读写测试: OK")
        return True
    except Exception as e:
        print(f"[FAIL] Redis 连接失败: {str(e)}")
        return False


async def main():
    """运行所有测试"""
    print("=" * 50)
    print("数据库连接测试")
    print("=" * 50)
    print()

    pg_ok = await test_postgres()
    redis_ok = await test_redis()

    print()
    print("=" * 50)
    if pg_ok and redis_ok:
        print("[OK] 所有数据库连接正常")
        print()
        print("下一步: 运行 'python migrate.py' 初始化数据库表")
        sys.exit(0)
    else:
        print("[FAIL] 部分数据库连接失败，请检查配置")
        print()
        print("提示:")
        if not pg_ok:
            print("  - 确保 PostgreSQL 服务已启动")
            print("  - 检查 .env 中的 DATABASE_URL 配置")
        if not redis_ok:
            print("  - 确保 Redis 服务已启动")
            print("  - 检查 .env 中的 REDIS_URL 配置")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
