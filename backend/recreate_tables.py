"""
Drop and recreate immersive lecture tables
"""
import asyncio
import asyncpg
from config import get_database_url


async def recreate_tables():
    db_url = get_database_url()
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

    conn = await asyncpg.connect(db_url)

    try:
        # Drop existing tables
        await conn.execute('DROP TABLE IF EXISTS immersive_lecture_progress CASCADE')
        print('Dropped immersive_lecture_progress table')

        await conn.execute('DROP TABLE IF EXISTS immersive_lecture_content CASCADE')
        print('Dropped immersive_lecture_content table')

        # Read and execute migration SQL
        with open('migrations/add_immersive_lecture_tables.sql', 'r', encoding='utf-8') as f:
            sql = f.read()

        await conn.execute(sql)
        print('Recreated tables with constraints')

    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(recreate_tables())
