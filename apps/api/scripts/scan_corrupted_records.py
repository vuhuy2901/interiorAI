import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
corrupted_found = []

with conn.cursor() as cur:
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
    tables = [r[0] for r in cur.fetchall()]
    
    for t in tables:
        # Check text or json columns
        cur.execute(f"""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = '{t}' 
              AND (data_type LIKE '%char%' OR data_type LIKE '%text%' OR data_type LIKE '%json%');
        """)
        cols = cur.fetchall()
        for col_name, dtype in cols:
            try:
                # Search for \uFFFD
                query = f"SELECT id, \"{col_name}\"::text FROM \"{t}\" WHERE \"{col_name}\"::text LIKE '%\\uFFFD%' OR \"{col_name}\"::text LIKE '%\ufffd%';"
                cur.execute(query)
                rows = cur.fetchall()
                for row_id, val in rows:
                    corrupted_found.append({
                        "table": t,
                        "column": col_name,
                        "id": row_id,
                        "sample": val[:200]
                    })
            except Exception as e:
                conn.rollback()
                continue

print(f"Total corrupted items found with U+FFFD: {len(corrupted_found)}")
for item in corrupted_found:
    print(f"- Table: {item['table']}, Col: {item['column']}, ID: {item['id']}")
    print(f"  Sample: {item['sample']}")
conn.close()
