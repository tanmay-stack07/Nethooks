import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def main():
    print("--- DB Connectivity Check ---")
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Missing env var: DATABASE_URL")
        print("Set DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME")
        sys.exit(1)

    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version()"))
            print(f"Connected. Postgres version: {version.scalar()}")
            # quick sanity list of existing tables
            rows = conn.execute(text("""
                SELECT tablename FROM pg_catalog.pg_tables
                WHERE schemaname NOT IN ('pg_catalog','information_schema')
                ORDER BY tablename
            """)).fetchall()
            tables = [r[0] for r in rows]
            dbname = conn.execute(text("SELECT current_database()")).scalar()
            print(f"Tables in '{dbname}': {tables}")
        print("OK: DB connectivity verified.")
    except Exception as e:
        print(f"DB error: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
