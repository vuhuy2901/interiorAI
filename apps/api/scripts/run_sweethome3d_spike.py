from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API_ROOT = ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.services.sweethome3d_bridge import (  # noqa: E402
    SweetHome3DConverter,
    SweetHome3DMcpClient,
    load_project_from_api,
    render_and_export,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the read-only Sweet Home 3D renderer spike")
    parser.add_argument("project_ids", nargs="+", help="Existing Studio project IDs")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "exports" / "sweethome3d-spike")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--quality", choices=("low", "medium", "high"), default="high")
    args = parser.parse_args()

    client = SweetHome3DMcpClient(timeout=900)
    summary: dict[str, object] = {"server": client.server_info, "projects": []}
    for project_id in args.project_ids:
        project = load_project_from_api(project_id)
        project_dir = args.output / project_id
        conversion = SweetHome3DConverter(client).convert(project, clear=True)
        artifacts = render_and_export(
            client, conversion, project_dir, width=args.width, height=args.height, quality=args.quality
        )
        obj_zip = Path(artifacts["obj_zip_path"])
        obj_dir = project_dir / "obj"
        obj_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(obj_zip) as archive:
            archive.extractall(obj_dir)
        evidence_paths = [Path(artifacts["sh3d_path"]), obj_zip]
        evidence_paths.extend(Path(item["path"]) for item in artifacts["renders"])
        conversion.manifest["artifacts"] = {
            **artifacts,
            "obj_directory": str(obj_dir),
            "sha256": {str(path): sha256(path) for path in evidence_paths if path.exists()},
        }
        manifest_path = project_dir / "manifest.json"
        manifest_path.write_text(json.dumps(conversion.manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        summary["projects"].append(conversion.manifest)
        print(json.dumps({"project_id": project_id, "manifest": str(manifest_path), **artifacts}, ensure_ascii=False))

    summary_path = args.output / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": str(summary_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

