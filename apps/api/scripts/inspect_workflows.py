import psycopg
import json

conn = psycopg.connect('postgres://paperclip:paperclip@127.0.0.1:54329/paperclip')
with conn.cursor() as cur:
    cur.execute("SELECT id, name, definition FROM workflows WHERE definition::text LIKE '%\ufffd%';")
    rows = cur.fetchall()
    print("Workflows with U+FFFD:", len(rows))
    for r_id, name, defn in rows:
        print(f"ID: {r_id}, Name: {name}")
        d_str = json.dumps(defn, ensure_ascii=False)
        # find where \ufffd is
        for idx in range(len(d_str)):
            if d_str[idx] == '\ufffd':
                print(f"  Context around idx {idx}: {d_str[max(0, idx-50):min(len(d_str), idx+50)]}")
conn.close()
