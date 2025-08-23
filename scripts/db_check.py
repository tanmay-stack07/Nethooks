import os
import sys
from dotenv import load_dotenv
import mysql.connector


def main():
    print("--- DB Connectivity Check ---")
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
        print("Create or update your .env file first (see .env.example)")
        sys.exit(1)

    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user, password=password, database=db,
            connection_timeout=5
        )
        cur = conn.cursor()
        cur.execute("SELECT VERSION()")
        version = cur.fetchone()[0]
        print(f"Connected. MySQL version: {version}")
        # quick sanity list of existing tables
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
        print(f"Tables in '{db}': {tables}")
        cur.close(); conn.close()
        print("OK: DB connectivity verified.")
    except mysql.connector.Error as e:
        print(f"MySQL error: {e}")
        sys.exit(2)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(3)


if __name__ == "__main__":
    main()
