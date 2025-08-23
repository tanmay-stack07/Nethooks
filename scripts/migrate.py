import os
import sys
from glob import glob
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'migrations')


def run_sql_file(conn, path):
    print(f"Applying: {os.path.basename(path)}")
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    # Remove SQL comments to avoid splitting on semicolons that appear inside comments
    # Handles: -- line comments and /* block comments */
    import re
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.S)
    sql = re.sub(r'--.*$', '', sql, flags=re.M)
    # Now it is safe enough for our simple migrations to split on semicolons
    statements = [s.strip() for s in sql.split(';') if s.strip()]
    for stmt in statements:
        conn.execute(text(stmt))


def main():
    print("--- Running Migrations ---")
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Missing env var: DATABASE_URL")
        print("Set DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME")
        sys.exit(1)

    engine = create_engine(database_url, pool_pre_ping=True)
    with engine.begin() as conn:  # transactional
        files = sorted(glob(os.path.join(MIGRATIONS_DIR, '*.sql')))
        if not files:
            print("No .sql files found in migrations/")
            return
        for path in files:
            run_sql_file(conn, path)
    print("Migrations applied successfully.")


if __name__ == "__main__":
    main()
