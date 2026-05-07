"""
验证数据库表结构
"""
import asyncio
import asyncpg
from config import settings


async def verify_tables():
    """验证数据库表结构"""
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(db_url)

    print("=" * 60)
    print("数据库表结构验证")
    print("=" * 60)
    print()

    # 获取所有表
    tables = await conn.fetch("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    """)

    print(f"共找到 {len(tables)} 个表:")
    print()

    for table in tables:
        table_name = table['table_name']
        print(f"表: {table_name}")
        print("-" * 60)

        # 获取表的列信息
        columns = await conn.fetch("""
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        """, table_name)

        for col in columns:
            nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
            default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
            print(f"  {col['column_name']:30} {col['data_type']:20} {nullable:10}{default}")

        print()

    # 获取外键关系
    print("=" * 60)
    print("外键关系")
    print("=" * 60)
    print()

    fkeys = await conn.fetch("""
        SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name
    """)

    for fk in fkeys:
        print(f"{fk['table_name']}.{fk['column_name']} -> {fk['foreign_table_name']}.{fk['foreign_column_name']}")

    await conn.close()
    print()
    print("=" * 60)
    print("验证完成！")


if __name__ == "__main__":
    asyncio.run(verify_tables())
