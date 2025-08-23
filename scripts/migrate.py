import os
import sys
from glob import glob
from dotenv import load_dotenv
import mysql.connector

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'migrations')


def run_sql_file(cursor, path):
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
        cursor.execute(stmt)


def main():
    print("--- Running Migrations ---")
    load_dotenv()

    host = os.getenv("MYSQL_HOST")
    port = int(os.getenv("MYSQL_PORT") or 3306)
    user = os.getenv("MYSQL_USER")
    password = os.getenv("MYSQL_PASSWORD")
    db = os.getenv("MYSQL_DB")

    missing = [k for k, v in {
        'MYSQL_HOST': host,
        'MYSQL_PORT': port,
        'MYSQL_USER': user,
        'MYSQL_PASSWORD': password,
        'MYSQL_DB': db,
    }.items() if v in (None, '')]
    if missing:
        print(f"Missing env vars: {', '.join(missing)}")
        sys.exit(1)

    conn = mysql.connector.connect(host=host, port=port, user=user, password=password, database=db)
    cursor = conn.cursor()
    try:
        files = sorted(glob(os.path.join(MIGRATIONS_DIR, '*.sql')))
        if not files:
            print("No .sql files found in migrations/")
            return
        for path in files:
            run_sql_file(cursor, path)
        conn.commit()
        print("Migrations applied successfully.")
    finally:
        cursor.close(); conn.close()


if __name__ == "__main__":
    main()
