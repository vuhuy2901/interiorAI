"""Restore only the two FEAT-133 scenes and their bindings; never overwrite rows."""
import argparse
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
target = root / "data" / "atelier.db"
backup = root / "data" / "atelier.db.backup_before_final_purge"
scene_ids = ("proj_ef7d0089", "proj_5fc49943")
native_id = "0b8cecc9-ccb2-4cb5-892b-de5d2cbfdcfd"
with sqlite3.connect(f"file:{backup.as_posix()}?mode=ro", uri=True) as source:
    source.row_factory = sqlite3.Row
    native = source.execute("SELECT * FROM native_project_links WHERE native_project_id=?", (native_id,)).fetchone()
    scenes = source.execute("SELECT project_id FROM projects WHERE project_id IN (?,?)", scene_ids).fetchall()
    if native is None or len(scenes) != 2:
        raise SystemExit("Exact recovery source is missing; no data was changed")
    result = {"native": dict(native), "scene_ids": list(scene_ids), "applied": args.apply, "inserted": {}}
    if args.apply:
        with sqlite3.connect(target) as destination:
            # Preserve a current-state backup before the additive transaction.
            safety = root / "data" / "atelier.before-feature133-recovery.db"
            if not safety.exists():
                with sqlite3.connect(safety) as copy:
                    destination.backup(copy)
            destination.execute("PRAGMA foreign_keys=ON")
            destination.execute("BEGIN IMMEDIATE")
            tables = [row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            priority = {name: index for index, name in enumerate(["projects", "native_project_links", "atelier_rooms", "native_project_scenes", "issue_scene_links"])}
            for table in sorted(tables, key=lambda name: priority.get(name, 100)):
                if not table.replace("_", "").isalnum():
                    continue
                columns = [row[1] for row in source.execute(f'PRAGMA table_info("{table}")')]
                if "project_id" in columns:
                    field, values = "project_id", scene_ids
                elif "native_project_id" in columns:
                    field, values = "native_project_id", (native_id,)
                elif "scene_id" in columns:
                    field, values = "scene_id", scene_ids
                else:
                    continue
                placeholders = ",".join("?" for _ in values)
                rows = source.execute(f'SELECT * FROM "{table}" WHERE "{field}" IN ({placeholders})', values).fetchall()
                before = destination.total_changes
                quoted = ",".join(f'"{column}"' for column in columns)
                for row in rows:
                    destination.execute(f'INSERT OR IGNORE INTO "{table}" ({quoted}) VALUES ({",".join("?" for _ in columns)})', tuple(row))
                if destination.total_changes != before:
                    result["inserted"][table] = destination.total_changes - before
            destination.commit()
    print(json.dumps(result, ensure_ascii=True))
