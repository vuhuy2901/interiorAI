import json
from pathlib import Path

from app.db import get_project, now_iso, save_project
from app.models.contracts import ExternalSceneAsset


project_id = "proj_bedroom_japandi_4x4m"
project = get_project(project_id)
if project is None:
    raise SystemExit(f"Project not found: {project_id}")

backup_dir = Path(__file__).resolve().parents[1] / "data" / "backups" / "external_scene_import"
backup_dir.mkdir(parents=True, exist_ok=True)
backup_path = backup_dir / f"{project_id}_before_the_interior_14_rev{project.revision}.json"
if not backup_path.exists():
    backup_path.write_text(project.model_dump_json(indent=2), encoding="utf-8")

project.external_scene = ExternalSceneAsset(
    asset_id="the_interior_14_spacious",
    name="The interior (14) is spacious.",
    file_url="/api/v1/scene-assets/the_interior_14_spacious/file",
    source_path=r"C:\Users\DELL\Downloads\the_interior_14_is_spacious..glb",
    source_url="https://sketchfab.com/3d-models/the-interior-14-is-spacious-79262bfc39d54fd2a0edc9d80fafdb6d",
    author="dasy444",
    license="SKETCHFAB Standard",
    sha256="19f20e2f8e8ab4e6fdbb41458db5bd970679f3f0013df4ba772bb7724c8a913f",
    root_transform={
        "translation": [0.0, 0.0, 0.0],
        "rotation_euler_deg": [0.0, 0.0, 0.0],
        "scale": [1.0, 1.0, 1.0],
    },
    bounds_min_m=[-7.7302598953, -6.1216177940, -1.8828712702],
    bounds_max_m=[12.3812465668, 6.4628591537, 7.0853290558],
    bounds_size_m=[20.1115064621, 12.5844769478, 8.9682003260],
    node_count=147,
    mesh_count=77,
    material_count=22,
    texture_count=23,
    camera_count=0,
    light_count=0,
    audit_url="/api/v1/scene-assets/the_interior_14_spacious/audit",
    imported_at=now_iso(),
)
project.name = "The Interior 14 — Spacious (GLB Source Scene)"
project.description = (
    "Whole-scene GLB imported 1:1 from the supplied source. The external scene is authoritative; "
    "legacy Pascal room geometry remains only in revision history for restoration."
)
saved = save_project(
    project,
    author="Whole-scene GLB Import",
    reason="Thay cảnh hiện tại bằng the_interior_14_is_spacious..glb; giữ nguyên hierarchy, vật liệu và tỷ lệ nguồn",
    bump_revision=True,
)
print(json.dumps({
    "project_id": saved.project_id,
    "revision": saved.revision,
    "external_scene": saved.external_scene.model_dump(),
    "backup": str(backup_path),
}, indent=2, ensure_ascii=False))
