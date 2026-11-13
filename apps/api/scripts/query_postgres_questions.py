import psycopg
import json

for db_name in ["paperclip", "postgres"]:
    try:
        conn = psycopg.connect(f"postgresql://postgres@127.0.0.1:54329/{db_name}")
        print(f"Connected to DB: {db_name}")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [r[0] for r in cur.fetchall()]
            print(f"Tables in {db_name}: {tables}")
            
            if "issue_thread_interactions" in tables:
                cur.execute("""
                    SELECT id, issue_id, kind, status, title, payload, created_at
                    FROM issue_thread_interactions
                    ORDER BY created_at DESC
                    LIMIT 10
                """)
                rows = cur.fetchall()
                print(f"Found {len(rows)} interactions:")
                for r in rows:
                    print("-" * 50)
                    print(f"ID: {r[0]}, Issue: {r[1]}, Kind: {r[2]}, Status: {r[3]}")
                    print(f"Title: {r[4]}")
                    payload_str = json.dumps(r[5], ensure_ascii=False, indent=2) if isinstance(r[5], (dict, list)) else str(r[5])
                    print(f"Payload:\n{payload_str}")
            
            # Check issue comments
            if "issue_comments" in tables:
                cur.execute("""
                    SELECT id, issue_id, body, created_at
                    FROM issue_comments
                    ORDER BY created_at DESC
                    LIMIT 5
                """)
                crows = cur.fetchall()
                print(f"\nRecent comments ({len(crows)}):")
                for c in crows:
                    print(f"Comment {c[0]} on {c[1]}: {c[2][:150]}...")

        conn.close()
        break
    except Exception as e:
        print(f"Failed to connect to {db_name}: {e}")
