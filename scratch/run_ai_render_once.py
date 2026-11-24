import json
import sys
import time

sys.path.insert(0, r"c:\QLDAPM-final\interiorAI\apps\api")
sys.stdout.reconfigure(encoding="utf-8")
from app.db import get_project  # noqa: E402
from app.services import codex_render as cr  # noqa: E402
from app.services.render_brief import build_render_brief  # noqa: E402

pid = "proj_kid_bedroom"
b = build_render_brief(get_project(pid))
print(b["markdown"])
print("MISSING", b["missing_decisions"], b["brief_hash"])
t = time.time()
job = cr.create_job(pid, camera="eye_level", start_thread=False)
print("JOB", job["job_id"], job["status"])
done = cr.process_job(job["job_id"]) if job["status"] == "QUEUED" else job
print(json.dumps(cr.public_job(done), ensure_ascii=False, indent=1))
print("output_file", done.get("output_file"), "total", round(time.time() - t, 1))
