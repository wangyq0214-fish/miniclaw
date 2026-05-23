"""
Run database migration for immersive lecture tables
"""
import asyncio
import asyncpg
from config import get_database_url


async def run_migration():
    # Parse database URL
    db_url = get_database_url()
    print(f'Database URL: {db_url}')

    # postgresql+asyncpg://user:pass@host:port/dbname
    # Remove the +asyncpg part
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

    # Connect to database
    conn = await asyncpg.connect(db_url)

    try:
        # Read migration SQL
        with open('migrations/add_immersive_lecture_tables.sql', 'r', encoding='utf-8') as f:
            sql = f.read()

        # Execute migration
        await conn.execute(sql)
        print('Database migration completed successfully')

    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(run_migration())
