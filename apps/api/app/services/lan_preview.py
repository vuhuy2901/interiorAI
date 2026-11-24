"""FEAT-2026-165 — Local LAN 3D preview: share records, package builder, LAN detection, QR.

Admin functions here are only exposed on the loopback API. The limited public
surface lives in app/preview_app.py and only calls verify_token/package paths.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.db import DATA_DIR, get_conn, get_project, get_project_revisions
from app.services.asset_pipeline import ASSET_LIBRARY_DIR, ASSET_ROOT, get_asset_metadata
from app.services.cost_engine import load_materials_catalog
from app.services.material_system import get_material

DEFAULT_PREVIEW_PORT = 3200
PREVIEW_ROOT = DATA_DIR / "preview"
SERVICE_NAME = "atelier-preview"
ASSET_NAME_RE = re.compile(r"^[a-f0-9]{16}\.glb$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-]{20,64}$")
PACKAGE_WARN_BYTES = 40 * 1024 * 1024
VIRTUAL_RE = re.compile(
    r"vmware|virtualbox|hyper-v|vethernet|vpn|tap-|tap |tailscale|zerotier|wsl|docker|loopback|bluetooth|npcap|wintun|wireguard",
    re.I,
)


class PublishBlocked(Exception):
    def __init__(self, code: str, message: str, missing_assets: Optional[List[Dict[str, Any]]] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.missing_assets = missing_assets or []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_schema() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS preview_shares (
            publication_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            token_ref TEXT NOT NULL,
            status TEXT NOT NULL,
            package_dir TEXT NOT NULL,
            lan_ip TEXT,
            port INTEGER NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            asset_count INTEGER NOT NULL DEFAULT 0,
            warnings_json TEXT NOT NULL DEFAULT '[]',
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_preview_shares_project ON preview_shares(project_id)")
    conn.commit()
    conn.close()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- LAN detection

def _is_private_v4(ip: str) -> bool:
    try:
        a, b, *_ = [int(x) for x in ip.split(".")]
    except ValueError:
        return False
    return a == 10 or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168)


def _usable_v4(ip: str) -> bool:
    return bool(re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", ip)) and not ip.startswith(("127.", "169.254.", "0.", "224.")) and ip != "255.255.255.255"


def _powershell_interfaces() -> List[Dict[str, Any]]:
    script = (
        "Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4Address } | "
        "ForEach-Object { [pscustomobject]@{ alias=$_.InterfaceAlias; desc=$_.InterfaceDescription; "
        "ip=($_.IPv4Address | Select-Object -First 1).IPAddress; gw=[bool]$_.IPv4DefaultGateway } } | ConvertTo-Json -Compress"
    )
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
        if not out:
            return []
        data = json.loads(out)
        return data if isinstance(data, list) else [data]
    except Exception:
        return []


def detect_lan_candidates() -> List[Dict[str, Any]]:
    found: Dict[str, Dict[str, Any]] = {}
    for item in _powershell_interfaces():
        ip = str(item.get("ip") or "")
        if not _usable_v4(ip):
            continue
        name = f"{item.get('alias') or ''} {item.get('desc') or ''}".strip()
        found[ip] = {"ip": ip, "adapter": name or "unknown", "virtual": bool(VIRTUAL_RE.search(name)),
                     "has_gateway": bool(item.get("gw")), "private": _is_private_v4(ip)}
    if not found:
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            probe.connect(("192.0.2.1", 9))  # no packet is sent; selects the default-route interface
            ip = probe.getsockname()[0]
            probe.close()
            if _usable_v4(ip):
                found[ip] = {"ip": ip, "adapter": "default route", "virtual": False, "has_gateway": True, "private": _is_private_v4(ip)}
        except OSError:
            pass
        try:
            for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
                if _usable_v4(ip) and ip not in found:
                    found[ip] = {"ip": ip, "adapter": "hostname", "virtual": False, "has_gateway": False, "private": _is_private_v4(ip)}
        except OSError:
            pass
    cands = list(found.values())
    cands.sort(key=lambda c: (c["virtual"], not c["has_gateway"], not c["private"]))
    recommended_set = False
    for c in cands:
        ok = not c["virtual"] and c["has_gateway"] and c["private"]
        c["recommended"] = ok and not recommended_set
        recommended_set = recommended_set or c["recommended"]
    return cands


def validate_lan_ip(ip: str, candidates: List[Dict[str, Any]]) -> str:
    ip = (ip or "").strip()
    if not _usable_v4(ip):
        raise PublishBlocked("invalid_lan_ip", "Địa chỉ IP không hợp lệ hoặc là localhost/loopback; link cho điện thoại cần IP LAN.")
    if ip not in {c["ip"] for c in candidates}:
        raise PublishBlocked("lan_ip_not_local", f"IP {ip} không thuộc card mạng đang hoạt động của máy này.")
    return ip


# ---------------------------------------------------------------- preview server

def _port_listening(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def _health(port: int, host: str = "127.0.0.1") -> Optional[Dict[str, Any]]:
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/__health", timeout=2) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def server_status(port: int = DEFAULT_PREVIEW_PORT) -> Dict[str, Any]:
    if not _port_listening(port):
        return {"running": False, "port": port, "bind": "0.0.0.0", "error": None}
    info = _health(port)
    if info and info.get("service") == SERVICE_NAME:
        return {"running": True, "port": port, "bind": info.get("bind", "0.0.0.0"), "error": None}
    return {"running": False, "port": port, "bind": "0.0.0.0",
            "error": f"Cổng {port} đang bị chương trình khác chiếm. Hãy chọn cổng khác."}


def ensure_preview_server(port: int = DEFAULT_PREVIEW_PORT) -> Dict[str, Any]:
    status = server_status(port)
    if status["running"] or status["error"]:
        return status
    api_dir = Path(__file__).resolve().parents[2]
    log_dir = DATA_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    out = open(log_dir / "preview-stdout.log", "ab")
    err = open(log_dir / "preview-stderr.log", "ab")
    flags = 0x00000008 | 0x00000200 if os.name == "nt" else 0  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.preview_app:app", "--app-dir", str(api_dir),
         "--host", "0.0.0.0", "--port", str(port), "--log-level", "warning"],
        cwd=str(api_dir), stdout=out, stderr=err, stdin=subprocess.DEVNULL, creationflags=flags,
    )
    import time
    for _ in range(40):
        time.sleep(0.25)
        status = server_status(port)
        if status["running"]:
            return status
    status["error"] = status.get("error") or "Không khởi động được server preview (xem data/logs/preview-stderr.log)."
    return status


# ---------------------------------------------------------------- package building

def _paint(catalog: Dict[str, Any], mid: str) -> Dict[str, Any]:
    for p in catalog.get("paints", []):
        if p.get("id") == mid:
            return p
    return {}


def _floor_info(project: Any, catalog: Dict[str, Any]) -> Dict[str, Any]:
    room = project.rooms[0] if project.rooms else None
    override = (project.surface_material_overrides or {}).get("floor")
    if override:
        definition = get_material(override.material_id)
        if definition:
            pbr = definition.pbr.model_dump()
            scale = override.texture_scale or definition.physical_scale
            return {
                "color": override.tint or definition.tint or pbr.get("base_color") or "#DFD6C7",
                "roughness": float(override.pbr.get("roughness", pbr.get("roughness", 0.36))),
                "tile_width_mm": scale.width_mm or 800, "tile_length_mm": scale.height_mm or 800,
                "grout_width_mm": scale.grout_width_mm, "grout_color": scale.grout_color,
            }
    tile = next((t for t in catalog.get("tiles_and_flooring", []) if room and t.get("id") == room.floor_material_id), None)
    if tile:
        return {"color": tile.get("hex_color", "#C8A986"), "roughness": tile.get("roughness", 0.48),
                "tile_width_mm": tile.get("tile_width_mm", 600), "tile_length_mm": tile.get("tile_length_mm", 600),
                "grout_width_mm": tile.get("grout_width_mm", 3), "grout_color": tile.get("grout_color", "#B8B1A6")}
    return {"color": "#C8A986", "roughness": 0.48, "tile_width_mm": 190, "tile_length_mm": 1200,
            "grout_width_mm": 2, "grout_color": "#B8B1A6"}


def _resolve_glb(f: Any) -> Tuple[Optional[Path], Optional[str]]:
    """Return (local_path, problem). (None, None) means the furniture has no 3D asset reference."""
    if f.asset_id:
        safe = "".join(c for c in f.asset_id if c.isalnum() or c in "_-")
        path = (ASSET_LIBRARY_DIR / safe / "normalized.glb").resolve()
        if safe == f.asset_id and ASSET_LIBRARY_DIR.resolve() in path.parents and path.is_file():
            return path, None
        return None, "asset_missing_locally"
    if f.normalized_glb:
        raw = f.normalized_glb
        if re.match(r"^https?://", raw):
            return None, "remote_only"
        cand = (ASSET_ROOT / raw.lstrip("/\\")).resolve() if not Path(raw).is_absolute() else Path(raw).resolve()
        if ASSET_ROOT.resolve() in cand.parents and cand.is_file():
            return cand, None
        return None, "asset_missing_locally"
    return None, None


def build_package(project: Any, dest: Path) -> Dict[str, Any]:
    if project.external_scene and project.external_scene.file_url:
        raise PublishBlocked("external_scene_unsupported",
                             "Scene này dùng GLB toàn cảnh bên ngoài; bản preview LAN chưa hỗ trợ loại scene này.")
    if not project.walls and not project.rooms:
        raise PublishBlocked("scene_empty", "Scene chưa có tường hoặc phòng để xuất.")

    catalog = load_materials_catalog()
    assets_dir = dest / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    warnings: List[str] = []
    missing: List[Dict[str, Any]] = []
    copied: Dict[str, str] = {}
    furniture: List[Dict[str, Any]] = []

    for f in project.furniture_instances:
        path, problem = _resolve_glb(f)
        if problem:
            missing.append({"furniture_id": f.id, "name": f.name, "asset_id": f.asset_id, "reason": problem})
            continue
        glb_rel = None
        if path:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
            name = f"{digest}.glb"
            if name not in copied:
                shutil.copyfile(path, assets_dir / name)
                copied[name] = str(path)
            glb_rel = f"assets/{name}"
        else:
            warnings.append(f"'{f.name}' không có mô hình 3D, viewer hiển thị khối đại diện.")
        meta = get_asset_metadata(f.asset_id) if f.asset_id else None
        material_names = [o.material_id for o in (f.material_overrides or {}).values()]
        furniture.append({
            "id": f.id, "name": f.name, "category": f.category,
            "x_mm": f.x_mm, "y_mm": f.y_mm, "z_mm": f.z_mm,
            "width_mm": f.width_mm, "depth_mm": f.depth_mm, "height_mm": f.height_mm,
            "rotation_deg": f.rotation_deg, "color_hex": f.color_hex,
            "sizing_policy": f.sizing_policy, "parametric_axes": list(f.parametric_axes or []),
            "glb": glb_rel,
            "material": ", ".join(material_names) if material_names else None,
            "vendor": f.vendor, "source_url": f.source_url,
            "description": None,
            "dimensions_known": bool(f.width_mm and f.depth_mm and f.height_mm),
            "provenance": ({"author": meta.author, "license": meta.license} if meta else None),
        })
        if meta and not meta.license:
            warnings.append(f"Asset '{f.name}' chưa có thông tin giấy phép.")

    if missing:
        shutil.rmtree(dest, ignore_errors=True)
        names = ", ".join(m["name"] for m in missing)
        raise PublishBlocked("missing_assets",
                             f"Không thể đóng gói offline: thiếu bản GLB cục bộ cho {names}. Không thay bằng mô hình giả.",
                             missing)

    room = project.rooms[0] if project.rooms else None
    poly = room.polygon_mm if room else [[0, 0], [4000, 0], [4000, 5000], [0, 5000]]
    ceiling = room.ceiling_height_mm if room else 2800
    walls = []
    for w in project.walls:
        p = _paint(catalog, w.face_a_material_id)
        walls.append({"id": w.id, "start_mm": w.start_mm, "end_mm": w.end_mm, "thickness_mm": w.thickness_mm,
                      "height_mm": w.height_mm, "color": p.get("hex_color", "#F5F2EB"), "roughness": p.get("roughness", 0.82)})
    openings = [{"id": o.id, "kind": "door", "wall_id": o.wall_id, "t": o.t, "width_mm": o.width_mm,
                 "height_mm": o.height_mm, "sill_height_mm": o.sill_height_mm} for o in project.openings]
    openings += [{"id": o.id, "kind": "window", "wall_id": o.wall_id, "t": o.t, "width_mm": o.width_mm,
                  "height_mm": o.height_mm, "sill_height_mm": o.sill_height_mm} for o in project.windows]

    pts = list(poly) + [pt for w in project.walls for pt in (w.start_mm, w.end_mm)]
    min_x, max_x = min(p[0] for p in pts), max(p[0] for p in pts)
    min_y, max_y = min(p[1] for p in pts), max(p[1] for p in pts)
    top = max([ceiling] + [w.height_mm for w in project.walls] + [f["z_mm"] + f["height_mm"] for f in furniture])
    cx, cz = (min_x + max_x) / 2000, (min_y + max_y) / 2000
    span = max(max_x - min_x, max_y - min_y) / 1000
    presets = [
        {"name": "Tổng quan", "position_m": [cx + span * 0.9, span * 0.9 + 1.5, cz + span * 1.1], "target_m": [cx, 0.8, cz]},
        {"name": "Từ trên xuống", "position_m": [cx, span * 1.8 + 2, cz + 0.01], "target_m": [cx, 0, cz]},
    ]
    manifest = {
        "schema": 1, "project": {"id": project.project_id, "name": project.name},
        "revision": project.revision, "published_at": _now(), "units": "mm",
        "room": {"id": room.id if room else "room_main", "name": room.name if room else project.name,
                 "polygon_mm": poly, "ceiling_height_mm": ceiling, "floor": _floor_info(project, catalog)},
        "rooms": [{"id": r.id, "name": r.name, "room_type": r.room_type, "polygon_mm": r.polygon_mm} for r in project.rooms],
        "walls": walls, "openings": openings, "furniture": furniture,
        "bounds_mm": {"min": [min_x, min_y, 0], "max": [max_x, max_y, top]},
        "camera_presets": presets,
        "warnings": warnings,
    }
    size = sum(p.stat().st_size for p in assets_dir.glob("*.glb"))
    if size > PACKAGE_WARN_BYTES:
        warnings.append(f"Package GLB lớn ({size // (1024 * 1024)} MB); điện thoại cấu hình thấp có thể tải chậm hoặc thiếu bộ nhớ.")
    manifest["package"] = {"size_bytes": size, "asset_count": len(copied)}
    (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return {"size_bytes": size, "asset_count": len(copied), "warnings": warnings}


# ---------------------------------------------------------------- share management

def _row_to_share(row: Any, host: Optional[str] = None) -> Dict[str, Any]:
    ip = host or row["lan_ip"]
    url = f"http://{ip}:{row['port']}/preview/{row['token_ref']}" if row["status"] == "active" and ip else None
    return {
        "publication_id": row["publication_id"], "project_id": row["project_id"], "scene_id": row["scene_id"],
        "status": row["status"], "revision": row["revision"], "url": url, "lan_ip": row["lan_ip"], "port": row["port"],
        "created_at": row["created_at"], "updated_at": row["updated_at"], "expires_at": row["expires_at"],
        "package": {"size_bytes": row["size_bytes"], "asset_count": row["asset_count"]},
        "warnings": json.loads(row["warnings_json"] or "[]"),
    }


def get_network_info(port: int = DEFAULT_PREVIEW_PORT) -> Dict[str, Any]:
    cands = detect_lan_candidates()
    rec = next((c for c in cands if c["recommended"]), None)
    return {
        "server": server_status(port), "candidates": cands,
        "selected_ip": rec["ip"] if rec else (cands[0]["ip"] if len(cands) == 1 else None),
        "ambiguous": rec is None and len(cands) > 1,
        "firewall_hint": (f"Nếu điện thoại không mở được link, cho phép cổng TCP {port} trong Windows Defender Firewall "
                          f"(Private network). Ứng dụng KHÔNG tự sửa firewall. Ví dụ (PowerShell quản trị): "
                          f"New-NetFirewallRule -DisplayName 'Atelier Preview' -Direction Inbound -Protocol TCP -LocalPort {port} -Profile Private -Action Allow"),
    }


def _choose_ip(requested: Optional[str]) -> str:
    cands = detect_lan_candidates()
    if not cands:
        raise PublishBlocked("no_lan_ip", "Không tìm thấy IP LAN. Hãy kết nối Wi-Fi/Ethernet rồi thử lại.")
    if requested:
        return validate_lan_ip(requested, cands)
    rec = next((c for c in cands if c["recommended"]), None)
    if rec:
        return rec["ip"]
    if len(cands) == 1:
        return cands[0]["ip"]
    raise PublishBlocked("ambiguous_lan_ip", "Có nhiều card mạng phù hợp; hãy chọn IP LAN thủ công.")


def create_share(project_id: str, lan_ip: Optional[str] = None, port: int = DEFAULT_PREVIEW_PORT,
                 expires_hours: Optional[int] = None) -> Dict[str, Any]:
    ensure_schema()
    project = get_project(project_id)
    if not project:
        raise PublishBlocked("project_not_found", "Không tìm thấy dự án.")
    if not get_project_revisions(project_id):
        raise PublishBlocked("scene_not_saved", "Scene chưa được lưu. Hãy lưu scene trước khi xuất link.")
    ip = _choose_ip(lan_ip)
    status = ensure_preview_server(port)
    if not status["running"]:
        busy = bool(status.get("error")) and "chiếm" in status["error"]
        raise PublishBlocked("port_busy" if busy else "preview_server_down", status.get("error") or "Server preview chưa chạy.")

    pub_id = f"pub_{uuid.uuid4().hex[:12]}"
    dest = PREVIEW_ROOT / pub_id
    info = build_package(project, dest)
    manifest_path = dest / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["publication_id"] = pub_id
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    token = secrets.token_urlsafe(24)
    now = _now()
    exp = (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat() if expires_hours else None
    conn = get_conn()
    conn.execute(
        "INSERT INTO preview_shares (publication_id, project_id, scene_id, revision, token_hash, token_ref, status, package_dir, "
        "lan_ip, port, size_bytes, asset_count, warnings_json, expires_at, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (pub_id, project_id, (project.rooms[0].id if project.rooms else project_id), project.revision, hash_token(token), token,
         "active", pub_id, ip, port, info["size_bytes"], info["asset_count"], json.dumps(info["warnings"], ensure_ascii=False),
         exp, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM preview_shares WHERE publication_id = ?", (pub_id,)).fetchone()
    conn.close()
    return _row_to_share(row)


def get_share(publication_id: str) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = get_conn()
    row = conn.execute("SELECT * FROM preview_shares WHERE publication_id = ?", (publication_id,)).fetchone()
    conn.close()
    return _row_to_share(row) if row else None


def list_shares(project_id: str) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = get_conn()
    rows = conn.execute("SELECT * FROM preview_shares WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()
    conn.close()
    return [_row_to_share(r) for r in rows]


def refresh_share(publication_id: str, lan_ip: Optional[str] = None) -> Dict[str, Any]:
    ensure_schema()
    conn = get_conn()
    row = conn.execute("SELECT * FROM preview_shares WHERE publication_id = ?", (publication_id,)).fetchone()
    conn.close()
    if not row:
        raise PublishBlocked("share_not_found", "Không tìm thấy bản chia sẻ.")
    if row["status"] != "active":
        raise PublishBlocked("share_revoked", "Bản chia sẻ đã bị thu hồi; hãy tạo link mới.")
    project = get_project(row["project_id"])
    if not project:
        raise PublishBlocked("project_not_found", "Không tìm thấy dự án.")
    ip = _choose_ip(lan_ip) if lan_ip else row["lan_ip"]
    tmp = PREVIEW_ROOT / f"{publication_id}.new"
    shutil.rmtree(tmp, ignore_errors=True)
    info = build_package(project, tmp)
    manifest_path = tmp / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["publication_id"] = publication_id
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    live = PREVIEW_ROOT / row["package_dir"]
    old = PREVIEW_ROOT / f"{publication_id}.old"
    shutil.rmtree(old, ignore_errors=True)
    if live.exists():
        live.rename(old)
    tmp.rename(live)
    shutil.rmtree(old, ignore_errors=True)
    conn = get_conn()
    conn.execute(
        "UPDATE preview_shares SET revision=?, lan_ip=?, size_bytes=?, asset_count=?, warnings_json=?, updated_at=? WHERE publication_id=?",
        (project.revision, ip, info["size_bytes"], info["asset_count"], json.dumps(info["warnings"], ensure_ascii=False), _now(), publication_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM preview_shares WHERE publication_id = ?", (publication_id,)).fetchone()
    conn.close()
    return _row_to_share(row)


def revoke_share(publication_id: str) -> bool:
    ensure_schema()
    conn = get_conn()
    cur = conn.execute("UPDATE preview_shares SET status='revoked', updated_at=? WHERE publication_id=?", (_now(), publication_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Return the active share row for a token, else None. Called on every preview request."""
    if not TOKEN_RE.match(token or ""):
        return None
    ensure_schema()
    conn = get_conn()
    row = conn.execute("SELECT * FROM preview_shares WHERE token_hash = ?", (hash_token(token),)).fetchone()
    conn.close()
    if not row or row["status"] != "active":
        return None
    if row["expires_at"] and row["expires_at"] < _now():
        return None
    return dict(row)


def package_path(row: Dict[str, Any]) -> Path:
    return (PREVIEW_ROOT / row["package_dir"]).resolve()


# ---------------------------------------------------------------- QR + diagnostics

def qr_svg(url: str) -> bytes:
    try:
        import segno
    except ImportError as exc:
        raise PublishBlocked("qr_unavailable", "Thiếu thư viện QR. Chạy: python -m pip install segno") from exc
    import io
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=6, border=2, dark="#0F766E")
    return buf.getvalue()


def diagnostics(publication_id: str) -> Dict[str, Any]:
    share = get_share(publication_id)
    if not share:
        raise PublishBlocked("share_not_found", "Không tìm thấy bản chia sẻ.")
    port, ip = share["port"], share["lan_ip"]
    status = server_status(port)
    cands = detect_lan_candidates()
    ip_present = any(c["ip"] == ip for c in cands)
    lan_bind = _port_listening(port, ip) if ip and ip_present else False
    pkg_ok = (PREVIEW_ROOT / publication_id / "manifest.json").is_file()
    checks = [
        {"id": "server", "label": "Server preview đang chạy", "ok": status["running"], "detail": status.get("error") or f"cổng {port}"},
        {"id": "lan_ip", "label": "IP LAN còn hoạt động", "ok": ip_present, "detail": ip or "chưa có"},
        {"id": "binding", "label": "Cổng lắng nghe trên IP LAN (kiểm từ chính máy này)", "ok": lan_bind,
         "detail": "Chỉ chứng minh server bind đúng card mạng, KHÔNG chứng minh điện thoại truy cập được."},
        {"id": "publication", "label": "Package đã publish", "ok": pkg_ok and share["status"] == "active",
         "detail": f"revision {share['revision']}, trạng thái {share['status']}"},
        {"id": "firewall", "label": "Windows Firewall cho phép cổng vào", "ok": None,
         "detail": "Không thể xác minh tự động từ máy này. Xem hướng dẫn bên dưới."},
        {"id": "network", "label": "Điện thoại cùng mạng Wi-Fi/LAN", "ok": None, "detail": "Cần bạn tự xác nhận trên điện thoại."},
    ]
    return {
        "checks": checks, "lan_reachable": "not_verified",
        "troubleshooting": [
            "Điện thoại và máy tính phải dùng cùng một mạng Wi-Fi/LAN (không dùng mạng khách/guest cách ly thiết bị).",
            "Tắt dữ liệu di động/VPN trên điện thoại rồi quét lại QR.",
            f"Nếu vẫn lỗi: cho phép cổng TCP {port} cho mạng Private trong Windows Defender Firewall.",
            "Nếu máy có nhiều card mạng (VPN, VMware, WSL), chọn đúng IP của card Wi-Fi/Ethernet.",
            "Thử mở link bằng trình duyệt trên một máy khác trong cùng mạng để kiểm tra.",
        ],
    }
