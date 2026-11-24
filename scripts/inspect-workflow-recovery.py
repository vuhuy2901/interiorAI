"""Read-only inspection of the exact backups involved in FEAT-133 recovery."""
import gzip
import json
import re
import sqlite3
from pathlib import Path

backup = Path(r"C:\Users\DELL\.paperclip\instances\default\data\backups\paperclip-20261119-005335.sql.gz")
table = ""
columns = []
found = []
matches = []
with gzip.open(backup, "rt", encoding="utf-8") as stream:
    for line in stream:
        if "5294a477-565b-44c6-879d-40408a3d0202" in line:
            if '"public"."issues"' in line:
                matches.append({"table": "issues", "prefix": line[:95]})
        if line.startswith("COPY "):
            table = line.split(" ")[1]
            columns = re.findall(r'"([^"]+)"', line.split("(", 1)[1].split(")", 1)[0])
        elif line.rstrip() == r"\.":
            table = ""
        elif table.endswith('"issues"') and "5294a477-565b-44c6-879d-40408a3d0202" in line:
            row = dict(zip(columns, line.rstrip("\n").split("\t")))
            found.append({key: row.get(key) for key in ("id", "identifier", "title", "status", "project_id")})
print(json.dumps({"postgres_source": found, "matches": matches[:6]}, ensure_ascii=True))
sqlite_backup = Path(r"C:\QLDAPM-final\data\atelier.db.backup_before_final_purge")
with sqlite3.connect(f"file:{sqlite_backup.as_posix()}?mode=ro", uri=True) as connection:
    connection.row_factory = sqlite3.Row
    rows = connection.execute("SELECT project_id,name FROM projects WHERE project_id IN (?,?)", ("proj_ef7d0089", "proj_5fc49943")).fetchall()
    native = connection.execute("SELECT native_project_id,project_name FROM native_project_links WHERE native_project_id=?", ("0b8cecc9-ccb2-4cb5-892b-de5d2cbfdcfd",)).fetchall()
    print(json.dumps({"sqlite_scenes": [dict(row) for row in rows], "native": [dict(row) for row in native]}, ensure_ascii=True))
