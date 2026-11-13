import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;")
    tables = [r[0] for r in cur.fetchall()]
    print("Tables in public schema:")
    for t in tables:
        print(f"  - {t}")

    # Search for interaction id b37d60f5-9c46-4e86-a585-69f712a5dc67
    target_id = 'b37d60f5-9c46-4e86-a585-69f712a5dc67'
    for t in tables:
        try:
            cur.execute(f"SELECT * FROM \"{t}\" WHERE id::text = '{target_id}';")
            rows = cur.fetchall()
            if rows:
                print(f"\nFound target in table: {t}")
                colnames = [desc[0] for desc in cur.description]
                for col, val in zip(colnames, rows[0]):
                    print(f"  {col}: {val}")
        except Exception:
            conn.rollback()
            continue
conn.close()
