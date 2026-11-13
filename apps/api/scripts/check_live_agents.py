import psycopg

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, name, title FROM agents WHERE name LIKE '%\ufffd%' OR title LIKE '%\ufffd%';")
    rows = cur.fetchall()
    print("Corrupted live agents count:", len(rows))
    for r in rows:
        print(f"  {r[0]}: {r[1]} - {r[2]}")
conn.close()
