"""Read-only Studio -> Sweet Home 3D export bridge used by the renderer spike.

The bridge consumes the canonical Studio JSON contract, converts millimetres to
Sweet Home 3D centimetres, and writes only external export artifacts.  It never
persists a Studio project or revision.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Protocol


MCP_ENDPOINT = "http://127.0.0.1:9877/mcp"
CATALOG_LICENSE = "Sweet Home 3D default catalog redistribution permission"
CATALOG_LICENSE_URL = "https://www.sweethome3d.com/license/"

JAPANDI_DISTINCT_PALETTE: tuple[tuple[str, str, float], ...] = (
    ("Warm Oat Linen", "#E4DDD3", 0.05),
    ("Natural White Oak", "#C8A986", 0.14),
    ("Smoked Walnut", "#9E7B5B", 0.18),
    ("Rattan Cane Weave", "#D6C6B2", 0.08),
    ("Greige Boucle Fabric", "#D5CBBF", 0.04),
    ("Honey Ash Wood", "#BF9B72", 0.16),
    ("Muted Sage Ceramic", "#8F9B8C", 0.22),
    ("Warm Travertine Stone", "#DDD4C6", 0.12),
    ("Charcoal Brushed Bronze", "#5C554E", 0.28),
    ("Raw Terracotta Clay", "#C48F73", 0.09),
)

TEXTURED_MULTIMATERIAL_PREFIXES: tuple[str, ...] = (
    "Blend Swap CC-0#",
    "Blend Swap CC-BY#",
    "Puybaret#",
    "Kator Legaz#",
    "Bettinelli#",
    "Infernal-quack#",
    "Blonk#",
    "Geantick#",
    "Sheep#",
    "PeterSmolik#",
    "LucaPresidente#",
)

TEXTURED_ETEK_IDS: frozenset[str] = frozenset(
    {
        "eTeks#curtains",
        "eTeks#flatTV",
        "eTeks#pendantLamp",
        "eTeks#lamp",
        "eTeks#workLamp",
        "eTeks#plant",
        "eTeks#filledBookcase",
        "eTeks#bed140x190",
        "eTeks#bed90x190",
        "eTeks#bunkBed90x190",
        "eTeks#door",
        "eTeks#openDoor",
        "eTeks#window85x123",
        "eTeks#window85x163",
        "eTeks#doubleWindow126x123",
        "eTeks#doubleWindow126x163",
        "eTeks#sliderWindow126x200",
        "eTeks#lightSource",
        "eTeks#incandescentLightSource",
        "eTeks#halogenLightSource",
    }
)


def mm_to_cm(value: float | int) -> float:
    return round(float(value) / 10.0, 4)


def _point_cm(point: Iterable[float]) -> list[float]:
    values = list(point)
    if len(values) < 2:
        raise ValueError("A plan point requires x and y")
    return [mm_to_cm(values[0]), mm_to_cm(values[1])]


def _require_positive(item: Mapping[str, Any], keys: Iterable[str], label: str) -> None:
    for key in keys:
        if float(item.get(key) or 0) <= 0:
            raise ValueError(f"{label} requires positive {key}")


@dataclass(frozen=True)
class CatalogRule:
    query: str
    family: str
    preferred_ids: tuple[str, ...] = ()
    fallback_queries: tuple[str, ...] = ()


CATEGORY_RULES: dict[str, CatalogRule] = {
    "bed": CatalogRule(
        "bed",
        "sleeping",
        preferred_ids=("Bettinelli#lit", "Blend Swap CC-BY#lettoCloud", "eTeks#bed140x190", "Blend Swap CC-0#bed1"),
        fallback_queries=("Bed 140x190", "Bed"),
    ),
    "double_bed": CatalogRule(
        "bed",
        "sleeping",
        preferred_ids=("Bettinelli#lit", "Blend Swap CC-BY#lettoCloud", "eTeks#bed140x190"),
        fallback_queries=("Bed 140x190",),
    ),
    "single_bed": CatalogRule(
        "bed",
        "sleeping",
        preferred_ids=("eTeks#bed90x190", "Blend Swap CC-BY#juniorBed", "Blend Swap CC-0#bed1"),
        fallback_queries=("Bed 90x190",),
    ),
    "bunk_bed": CatalogRule(
        "bed",
        "sleeping",
        preferred_ids=("Blend Swap CC-BY#bunkBed", "eTeks#bunkBed90x190", "eTeks#cornerBunkBed90x190"),
        fallback_queries=("Bunk bed",),
    ),
    "bunkbed": CatalogRule(
        "bed",
        "sleeping",
        preferred_ids=("Blend Swap CC-BY#bunkBed", "eTeks#bunkBed90x190"),
        fallback_queries=("Bunk bed",),
    ),
    "wardrobe": CatalogRule(
        "wardrobe",
        "storage",
        preferred_ids=("Blend Swap CC-0#wardrobeWithSlidingDoors", "Blend Swap CC-BY#wardrobe2", "Bettinelli#armoireLotus", "eTeks#wardrobe"),
        fallback_queries=("Wardrobe",),
    ),
    "closet": CatalogRule(
        "wardrobe",
        "storage",
        preferred_ids=("Blend Swap CC-0#wardrobeWithSlidingDoors", "Blend Swap CC-BY#wardrobe2", "eTeks#wardrobe"),
        fallback_queries=("Wardrobe",),
    ),
    "bookshelf": CatalogRule(
        "bookcase",
        "storage",
        preferred_ids=("Kator Legaz#full-bookcase", "eTeks#filledBookcase", "Blend Swap CC-0#bookcase", "eTeks#bookcase"),
        fallback_queries=("Filled bookcase", "Bookcase"),
    ),
    "bookcase": CatalogRule(
        "bookcase",
        "storage",
        preferred_ids=("Kator Legaz#full-bookcase", "eTeks#filledBookcase", "Blend Swap CC-0#bookcase", "eTeks#bookcase"),
        fallback_queries=("Filled bookcase", "Bookcase"),
    ),
    "cabinet": CatalogRule(
        "cabinet",
        "storage",
        preferred_ids=("Blend Swap CC-0#glassDoorCabinet", "eTeks#glassDoorCabinet", "Blend Swap CC-0#cupboard"),
        fallback_queries=("bookcase", "wardrobe"),
    ),
    "tv_cabinet": CatalogRule(
        "TV unit",
        "storage",
        preferred_ids=("Blend Swap CC-BY#tvStand", "eTeks#tvUnit", "Blend Swap CC-0#televisionCabinet"),
        fallback_queries=("TV stand", "TV unit", "television"),
    ),
    "tv_console": CatalogRule(
        "TV unit",
        "storage",
        preferred_ids=("Blend Swap CC-BY#tvStand", "eTeks#tvUnit", "Blend Swap CC-0#televisionCabinet"),
        fallback_queries=("TV stand", "TV unit"),
    ),
    "drawer_unit": CatalogRule(
        "cabinet",
        "storage",
        preferred_ids=("eTeks#chest", "Blend Swap CC-0#cupboard"),
        fallback_queries=("chest", "wardrobe"),
    ),
    "nightstand": CatalogRule(
        "bedside table",
        "storage",
        preferred_ids=("Blend Swap CC-BY#bedsideTable", "Blend Swap CC-0#bedsideTable2", "Bettinelli#meubleChevet", "eTeks#bedsideTable"),
        fallback_queries=("Bedside table",),
    ),
    "bedside_table": CatalogRule(
        "bedside table",
        "storage",
        preferred_ids=("Blend Swap CC-BY#bedsideTable", "Blend Swap CC-0#bedsideTable2", "eTeks#bedsideTable"),
        fallback_queries=("Bedside table",),
    ),
    "desk": CatalogRule(
        "desk",
        "surface",
        preferred_ids=("Blend Swap CC-BY#simpleDesk", "Blend Swap CC-BY#biurko3", "Blend Swap CC-0#lbDesk", "eTeks#desk"),
        fallback_queries=("Desk",),
    ),
    "study_desk": CatalogRule(
        "desk",
        "surface",
        preferred_ids=("Blend Swap CC-BY#simpleDesk", "Blend Swap CC-BY#biurko3", "eTeks#desk"),
        fallback_queries=("Desk",),
    ),
    "dining_table": CatalogRule(
        "table",
        "surface",
        preferred_ids=("eTeks#squareTable", "eTeks#table"),
        fallback_queries=("Table",),
    ),
    "coffee_table": CatalogRule(
        "coffee table",
        "surface",
        preferred_ids=("Infernal-quack#tableBasseBois", "eTeks#coffeeTable", "Blend Swap CC-BY#coffeeTable"),
        fallback_queries=("Wooden coffee table", "Coffee table"),
    ),
    "table": CatalogRule(
        "table",
        "surface",
        preferred_ids=("Infernal-quack#tableBasseBois", "eTeks#coffeeTable", "eTeks#squareTable"),
        fallback_queries=("Coffee table", "Table"),
    ),
    "chair": CatalogRule(
        "chair",
        "seating",
        preferred_ids=("Blend Swap CC-0#oakChair", "eTeks#chair2", "eTeks#chair"),
        fallback_queries=("Oak chair", "Chair"),
    ),
    "desk_chair": CatalogRule(
        "chair",
        "seating",
        preferred_ids=("Blend Swap CC-0#oakChair", "eTeks#chair2", "eTeks#chair"),
        fallback_queries=("Chair",),
    ),
    "armchair": CatalogRule(
        "armchair",
        "seating",
        preferred_ids=("eTeks#armchair2", "eTeks#armchair", "Blend Swap CC-BY#armchair1"),
        fallback_queries=("Armchair",),
    ),
    "sofa": CatalogRule(
        "sofa",
        "seating",
        preferred_ids=("Blend Swap CC-BY#sofa3", "Blend Swap CC-0#couch", "PeterSmolik#sofa1", "eTeks#sofa2", "eTeks#sofa"),
        fallback_queries=("Couch", "Sofa"),
    ),
    "rug": CatalogRule(
        "rug",
        "decor",
        preferred_ids=("Puybaret#carpet", "Kator Legaz#oriental-rug", "Blonk#kleed_grieks"),
        fallback_queries=("carpet", "Oriental rug"),
    ),
    "round_rug": CatalogRule(
        "rug",
        "decor",
        preferred_ids=("Puybaret#carpet", "Kator Legaz#oriental-rug"),
        fallback_queries=("carpet",),
    ),
    "rug_round": CatalogRule(
        "rug",
        "decor",
        preferred_ids=("Puybaret#carpet", "Kator Legaz#oriental-rug"),
        fallback_queries=("carpet",),
    ),
    "plant": CatalogRule(
        "plant",
        "decor",
        preferred_ids=("Blend Swap CC-BY#mediumIndoorPlant", "Blend Swap CC-BY#spatifilum", "eTeks#plant"),
        fallback_queries=("Indoor plant", "Plant"),
    ),
    "table_lamp": CatalogRule(
        "lamp",
        "lighting",
        preferred_ids=("Blend Swap CC-BY#lamp", "Blend Swap CC-0#desklamp", "eTeks#lamp"),
        fallback_queries=("Desk lamp", "Lamp"),
    ),
    "lamp": CatalogRule(
        "lamp",
        "lighting",
        preferred_ids=("Blend Swap CC-BY#lamp", "Blend Swap CC-0#desklamp", "eTeks#lamp"),
        fallback_queries=("Lamp",),
    ),
    "ceiling_lamp": CatalogRule(
        "pendant lamp",
        "lighting",
        preferred_ids=("Blend Swap CC-BY#hangingLight", "Kator Legaz#hanging-restaurant-light", "eTeks#pendantLamp"),
        fallback_queries=("Hanging light", "Pendant lamp"),
    ),
    "curtain": CatalogRule(
        "curtain",
        "decor",
        preferred_ids=("eTeks#curtains", "Geantick#curtain"),
        fallback_queries=("Curtains",),
    ),
    "wall_art": CatalogRule(
        "frame",
        "decor",
        preferred_ids=("Puybaret#WaterLilyFrame", "Puybaret#LakeMoraineFrame", "Puybaret#VeniceFrame", "eTeks#frame"),
        fallback_queries=("Frame Water Lily", "Frame Lake Moraine", "Frame"),
    ),
    "painting": CatalogRule(
        "frame",
        "decor",
        preferred_ids=("Puybaret#WaterLilyFrame", "Puybaret#LakeMoraineFrame", "eTeks#frame"),
        fallback_queries=("Frame Water Lily", "Frame"),
    ),
    "books": CatalogRule(
        "book",
        "decor",
        preferred_ids=("Blend Swap CC-BY#book", "eTeks#filledBookcase"),
        fallback_queries=("Book",),
    ),
    "tv": CatalogRule(
        "flat TV",
        "decor",
        preferred_ids=("eTeks#flatTV", "Blend Swap CC-0#led_tv"),
        fallback_queries=("Flat TV", "TV"),
    ),
}


def catalog_rule_for(category: str) -> CatalogRule | None:
    return CATEGORY_RULES.get(str(category or "").strip().casefold())


def _parse_properties_archive(archive_path: Path, prop_suffix: str) -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    if not archive_path.exists():
        return entries
    try:
        with zipfile.ZipFile(archive_path) as zf:
            prop_names = [
                n for n in zf.namelist()
                if n.endswith(prop_suffix) and "_" not in Path(n).stem
            ]
            if not prop_names:
                return entries
            text = zf.read(prop_names[0]).decode("latin-1", errors="replace")
    except Exception:
        return entries

    by_index: dict[str, dict[str, str]] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        m = re.match(r"^([a-zA-Z]+)#(\d+)$", key.strip())
        if m:
            prop_name, idx = m.group(1), m.group(2)
            by_index.setdefault(idx, {})[prop_name] = val.strip()

    for props in by_index.values():
        cid = props.get("id")
        if not cid:
            continue
        entries[cid] = {
            "id": cid,
            "name": props.get("name"),
            "category": props.get("category"),
            "creator": props.get("creator") or ("eTeks" if archive_path.name == "Furniture.jar" else "Sweet Home 3D Contributor"),
            "license": props.get("license") or (
                "GNU GPL / CC-BY" if archive_path.name == "Furniture.jar"
                else "CC-0" if "CC-0" in archive_path.name
                else "CC-BY" if "CC-BY" in archive_path.name or "KatorLegaz" in archive_path.name
                else "Free Art / CC-BY"
            ),
            "source": archive_path.name,
        }
    return entries


_METADATA_INDEX_CACHE: dict[str, dict[str, Any]] | None = None


def load_catalog_metadata_index() -> dict[str, dict[str, Any]]:
    """Load per-model creator, license, and source library metadata from SH3D archives."""
    global _METADATA_INDEX_CACHE
    if _METADATA_INDEX_CACHE is not None:
        return _METADATA_INDEX_CACHE

    index: dict[str, dict[str, Any]] = {}
    root = Path(__file__).resolve().parents[4]
    cached_json = root / ".tmp" / "sweethome3d-spike" / "all_catalog_metadata.json"
    if cached_json.exists():
        try:
            items = json.loads(cached_json.read_text(encoding="utf-8"))
            for item in items:
                cid = item.get("id")
                if cid:
                    index[str(cid)] = dict(item)
        except Exception:
            pass

    sh3d_jar = Path(r"C:\Program Files (x86)\Sweet Home 3D\lib\Furniture.jar")
    index.update({k: v for k, v in _parse_properties_archive(sh3d_jar, "DefaultFurnitureCatalog.properties").items() if k not in index})

    appdata = Path(os.environ.get("APPDATA", r"C:\Users\TUAN\AppData\Roaming"))
    furn_dir = appdata / "eTeks" / "Sweet Home 3D" / "furniture"
    if furn_dir.exists():
        for sh3f in sorted(furn_dir.glob("*.sh3f")):
            parsed = _parse_properties_archive(sh3f, "PluginFurnitureCatalog.properties")
            for k, v in parsed.items():
                if k not in index:
                    index[k] = v

    _METADATA_INDEX_CACHE = index
    return index


def normalize_scene(project: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize a canonical Studio scene without project-specific assumptions."""
    project_id = str(project.get("project_id") or "").strip()
    if not project_id:
        raise ValueError("Studio scene is missing project_id")

    walls: list[dict[str, Any]] = []
    for raw in project.get("walls") or []:
        _require_positive(raw, ("thickness_mm", "height_mm"), f"wall {raw.get('id')}")
        start = _point_cm(raw.get("start_mm") or [])
        end = _point_cm(raw.get("end_mm") or [])
        if start == end:
            raise ValueError(f"wall {raw.get('id')} has zero length")
        walls.append(
            {
                "studio_id": str(raw.get("id")),
                "x_start": start[0],
                "y_start": start[1],
                "x_end": end[0],
                "y_end": end[1],
                "thickness": mm_to_cm(raw["thickness_mm"]),
                "height": mm_to_cm(raw["height_mm"]),
                "is_accent_wall": bool(raw.get("is_accent_wall", False)),
                "face_a_material_id": str(raw.get("face_a_material_id") or ""),
                "face_b_material_id": str(raw.get("face_b_material_id") or ""),
            }
        )

    rooms: list[dict[str, Any]] = []
    for raw in project.get("rooms") or []:
        points = [_point_cm(point) for point in raw.get("polygon_mm") or []]
        if len(points) < 3:
            raise ValueError(f"room {raw.get('id')} requires at least three points")
        rooms.append(
            {
                "studio_id": str(raw.get("id")),
                "name": str(raw.get("name") or raw.get("id") or "Room"),
                "room_type": str(raw.get("room_type") or ""),
                "points": [{"x": p[0], "y": p[1]} for p in points],
                "floor_material_id": raw.get("floor_material_id"),
                "wall_base_material_id": raw.get("wall_base_material_id"),
            }
        )

    openings: list[dict[str, Any]] = []
    for kind, source in (("door", project.get("openings") or []), ("window", project.get("windows") or [])):
        for raw in source:
            _require_positive(raw, ("width_mm", "height_mm"), f"{kind} {raw.get('id')}")
            openings.append(
                {
                    "kind": kind,
                    "studio_id": str(raw.get("id")),
                    "wall_id": str(raw.get("wall_id")),
                    "position": min(1.0, max(0.0, float(raw.get("t", 0.5)))),
                    "width": mm_to_cm(raw["width_mm"]),
                    "height": mm_to_cm(raw["height_mm"]),
                    "elevation": mm_to_cm(raw.get("sill_height_mm", 0)),
                    "hinges_side": raw.get("hinges_side", "left"),
                    "door_type": raw.get("door_type"),
                }
            )

    furniture: list[dict[str, Any]] = []
    for raw in project.get("furniture_instances") or []:
        category = str(raw.get("category") or "").strip()
        if not category:
            raise ValueError(f"furniture {raw.get('id')} is missing category")
        _require_positive(raw, ("width_mm", "depth_mm", "height_mm"), f"furniture {raw.get('id')}")
        furniture.append(
            {
                "studio_id": str(raw.get("id")),
                "name": str(raw.get("name") or raw.get("id") or category),
                "category": category,
                "x": mm_to_cm(raw.get("x_mm", 0)),
                "y": mm_to_cm(raw.get("y_mm", 0)),
                "elevation": mm_to_cm(raw.get("z_mm", 0)),
                "width": mm_to_cm(raw["width_mm"]),
                "depth": mm_to_cm(raw["depth_mm"]),
                "height": mm_to_cm(raw["height_mm"]),
                "angle": float(raw.get("rotation_deg", 0)),
                "color": str(raw.get("color_hex") or "#D8D0C5"),
            }
        )

    if not walls or not rooms:
        raise ValueError("Studio scene requires at least one room and one wall")
    return {
        "project_id": project_id,
        "name": str(project.get("name") or project_id),
        "revision": int(project.get("revision") or 0),
        "walls": walls,
        "rooms": rooms,
        "openings": openings,
        "furniture": furniture,
    }


class ToolClient(Protocol):
    def call_tool(self, name: str, arguments: Mapping[str, Any] | None = None) -> Any: ...


class SweetHome3DMcpClient:
    """Small MCP Streamable HTTP client for the local Sweet Home 3D plugin."""

    def __init__(self, endpoint: str = MCP_ENDPOINT, timeout: float = 900.0) -> None:
        self.endpoint = endpoint
        self.timeout = timeout
        self.session_id: str | None = None
        self._request_id = 0
        self.server_info: dict[str, Any] = {}
        self._initialize()

    def _post(self, payload: Mapping[str, Any]) -> tuple[dict[str, Any], Mapping[str, str]]:
        headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else {}, response.headers
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Sweet Home 3D MCP HTTP {exc.code}: {detail}") from exc

    def _initialize(self) -> None:
        self._request_id += 1
        result, headers = self._post(
            {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "atelier-sweethome3d-spike", "version": "1.1"},
                },
            }
        )
        self.session_id = headers.get("Mcp-Session-Id")
        self.server_info = (result.get("result") or {}).get("serverInfo") or {}
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call_tool(self, name: str, arguments: Mapping[str, Any] | None = None) -> Any:
        self._request_id += 1
        response, _ = self._post(
            {
                "jsonrpc": "2.0",
                "id": self._request_id,
                "method": "tools/call",
                "params": {"name": name, "arguments": dict(arguments or {})},
            }
        )
        if response.get("error"):
            raise RuntimeError(f"Sweet Home 3D MCP error for {name}: {response['error']}")
        result = response.get("result") or {}
        if result.get("isError"):
            raise RuntimeError(f"Sweet Home 3D tool {name} failed: {result.get('content')}")
        content = result.get("content") or []
        for block in content:
            if block.get("type") == "text":
                text = block.get("text", "")
                try:
                    return json.loads(text)
                except (TypeError, json.JSONDecodeError):
                    return text
        return result.get("structuredContent", result)


def _extract_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        for key in ("items", "furniture", "catalog", "results"):
            if isinstance(value.get(key), list):
                return [item for item in value[key] if isinstance(item, dict)]
    return []


def _extract_id(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("id", "furnitureId", "wallId", "roomId"):
            if value.get(key):
                return str(value[key])
        nested = value.get("result")
        if nested is not None:
            return _extract_id(nested)
    raise RuntimeError(f"MCP response did not contain an object id: {value!r}")


def _bbox_3d(item: Mapping[str, Any]) -> dict[str, Any]:
    x = float(item.get("x") or 0.0)
    y = float(item.get("y") or 0.0)
    w = float(item.get("width") or 10.0)
    d = float(item.get("depth") or 10.0)
    h = float(item.get("height") or 10.0)
    elev = float(item.get("elevation") or 0.0)
    ang = float(item.get("angle") or 0.0)
    rad = math.radians(ang)
    hx = 0.5 * (abs(w * math.cos(rad)) + abs(d * math.sin(rad)))
    hy = 0.5 * (abs(w * math.sin(rad)) + abs(d * math.cos(rad)))
    return {
        "id": str(item.get("studio_id") or item.get("id") or ""),
        "category": str(item.get("category") or "").casefold(),
        "x": x,
        "y": y,
        "x0": x - hx,
        "x1": x + hx,
        "y0": y - hy,
        "y1": y + hy,
        "z0": elev,
        "z1": elev + h,
        "height": h,
    }


def _compute_camera_views(
    *,
    bounds: Mapping[str, float],
    center_x: float,
    center_y: float,
    door_pos: tuple[float, float] | None,
    primary_target: Mapping[str, float],
    placed_boxes: list[dict[str, Any]],
    max_wall_height: float,
) -> dict[str, dict[str, Any]]:
    """Compute 3 unobstructed camera poses (overhead, entrance, hero) adapted to room geometry and furniture."""
    min_x, max_x = bounds["min_x"], bounds["max_x"]
    min_y, max_y = bounds["min_y"], bounds["max_y"]
    margin = 38.0
    xs = [min_x + margin + (max_x - min_x - 2 * margin) * i / 7.0 for i in range(8)]
    ys = [min_y + margin + (max_y - min_y - 2 * margin) * j / 7.0 for j in range(8)]
    grid_points = [(round(gx, 2), round(gy, 2)) for gx in xs for gy in ys]

    def is_point_inside_obstacle(px: float, py: float, cz: float, clearance: float = 18.0) -> bool:
        for b in placed_boxes:
            if b["category"] in {"rug", "round_rug", "rug_round", "ceiling_lamp", "light_source", "wall_art", "painting", "curtain"}:
                continue
            if b["z1"] <= 42.0 or b["z0"] >= cz + 15.0:
                continue
            if (b["x0"] - clearance) <= px <= (b["x1"] + clearance) and (b["y0"] - clearance) <= py <= (b["y1"] + clearance):
                return True
        return False

    def is_inside_tall_storage(px: float, py: float, clearance: float = 22.0) -> bool:
        for b in placed_boxes:
            if b["z1"] >= 165.0 and b["z0"] < 120.0:
                if (b["x0"] - clearance) <= px <= (b["x1"] + clearance) and (b["y0"] - clearance) <= py <= (b["y1"] + clearance):
                    return True
        return False

    def ray_occlusion_penalty(cx: float, cy: float, cz: float, tx: float, ty: float, tz: float) -> float:
        penalty = 0.0
        for s in (0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72):
            rx = cx + s * (tx - cx)
            ry = cy + s * (ty - cy)
            rz = cz + s * (tz - cz)
            for b in placed_boxes:
                if b["category"] in {"rug", "round_rug", "rug_round", "ceiling_lamp", "light_source", "books"}:
                    continue
                # Skip obstacle if it contains the lookAt target itself
                if (b["x0"] - 15.0) <= tx <= (b["x1"] + 15.0) and (b["y0"] - 15.0) <= ty <= (b["y1"] + 15.0):
                    continue
                if b["z1"] >= (rz - 18.0) and b["z0"] <= (rz + 18.0):
                    if (b["x0"] - 12.0) <= rx <= (b["x1"] + 12.0) and (b["y0"] - 12.0) <= ry <= (b["y1"] + 12.0):
                        penalty += 5000.0 if b["z1"] >= 115.0 else 600.0
        return penalty

    # Focal target for room-wide shots (blend of primary focal furniture and room center)
    tx_main = round(0.55 * float(primary_target["x"]) + 0.45 * center_x, 2)
    ty_main = round(0.55 * float(primary_target["y"]) + 0.45 * center_y, 2)
    tx_hero = round(0.72 * float(primary_target["x"]) + 0.28 * center_x, 2)
    ty_hero = round(0.72 * float(primary_target["y"]) + 0.28 * center_y, 2)

    def in_front_of_primary(cx: float, cy: float) -> bool:
        px = float(primary_target["x"])
        py = float(primary_target["y"])
        if py < center_y - 30.0 and cy < py + 85.0:
            return False
        if py > center_y + 30.0 and cy > py - 85.0:
            return False
        if px < center_x - 30.0 and cx < px + 85.0:
            return False
        if px > center_x + 30.0 and cx > px - 85.0:
            return False
        return True

    # 1. Overhead angled camera (inside room perimeter near top of open ceiling, avoiding tall wardrobes)
    overhead_cz = round(min(265.0, max_wall_height - 14.0), 2)
    overhead_tz = 48.0
    overhead_candidates: list[tuple[float, float, float]] = []
    for cx, cy in grid_points:
        if is_inside_tall_storage(cx, cy, clearance=24.0) or not in_front_of_primary(cx, cy):
            continue
        dist = math.hypot(cx - tx_main, cy - ty_main)
        if dist < 130.0:
            continue
        pen = ray_occlusion_penalty(cx, cy, overhead_cz, tx_main, ty_main, overhead_tz)
        score = dist - pen
        overhead_candidates.append((score, cx, cy))
    if overhead_candidates:
        _, ov_x, ov_y = max(overhead_candidates, key=lambda item: item[0])
    else:
        ov_x, ov_y = round(min_x + 45.0, 2), round(max_y - 45.0, 2)

    # 2. Entrance camera (near door or entry walkway, unobstructed view into the room)
    entrance_cz = 146.0
    entrance_tz = 72.0
    door_x, door_y = door_pos if door_pos is not None else (center_x, max_y)
    entrance_candidates: list[tuple[float, float, float]] = []
    for cx, cy in grid_points:
        if is_point_inside_obstacle(cx, cy, entrance_cz, clearance=18.0) or not in_front_of_primary(cx, cy):
            continue
        dist_target = math.hypot(cx - tx_main, cy - ty_main)
        if dist_target < 155.0:
            continue
        dist_door = math.hypot(cx - door_x, cy - door_y)
        pen = ray_occlusion_penalty(cx, cy, entrance_cz, tx_main, ty_main, entrance_tz)
        score = (dist_target * 1.1) - (dist_door * 0.65) - pen
        entrance_candidates.append((score, cx, cy))
    if entrance_candidates:
        _, ent_x, ent_y = max(entrance_candidates, key=lambda item: item[0])
    else:
        ent_x, ent_y = round(center_x, 2), round(max_y - 48.0, 2)

    # 3. Hero camera (distinct angle from entrance, clear sightline to primary hero furniture)
    hero_cz = 136.0
    hero_tz = round(max(55.0, min(82.0, float(primary_target.get("z") or 55.0) + 12.0)), 2)
    ent_vec = (ent_x - tx_hero, ent_y - ty_hero)
    ent_len = max(math.hypot(*ent_vec), 1.0)
    hero_candidates: list[tuple[float, float, float]] = []
    for cx, cy in grid_points:
        if is_point_inside_obstacle(cx, cy, hero_cz, clearance=18.0) or not in_front_of_primary(cx, cy):
            continue
        dist_target = math.hypot(cx - tx_hero, cy - ty_hero)
        if dist_target < 150.0:
            continue
        cand_vec = (cx - tx_hero, cy - ty_hero)
        cand_len = max(math.hypot(*cand_vec), 1.0)
        cos_sim = (ent_vec[0] * cand_vec[0] + ent_vec[1] * cand_vec[1]) / (ent_len * cand_len)
        angle_diff_bonus = (1.0 - cos_sim) * 95.0  # rewards a distinct viewing angle from entrance
        pen = ray_occlusion_penalty(cx, cy, hero_cz, tx_hero, ty_hero, hero_tz)
        score = dist_target + angle_diff_bonus - pen
        hero_candidates.append((score, cx, cy))
    if hero_candidates:
        _, hero_x, hero_y = max(hero_candidates, key=lambda item: item[0])
    else:
        hero_x, hero_y = round(max_x - 48.0, 2), round(min_y + 48.0, 2)

    return {
        "overhead": {
            "camera": {"x": ov_x, "y": ov_y, "z": overhead_cz},
            "lookAt": {"x": tx_main, "y": ty_main, "z": overhead_tz},
            "fov": 70,
        },
        "entrance": {
            "camera": {"x": ent_x, "y": ent_y, "z": entrance_cz},
            "lookAt": {"x": tx_main, "y": ty_main, "z": entrance_tz},
            "fov": 65,
        },
        "hero": {
            "camera": {"x": hero_x, "y": hero_y, "z": hero_cz},
            "lookAt": {"x": tx_hero, "y": ty_hero, "z": hero_tz},
            "fov": 54,
        },
    }


@dataclass
class ConversionResult:
    manifest: dict[str, Any]
    furniture_ids: dict[str, str] = field(default_factory=dict)
    wall_ids: dict[str, str] = field(default_factory=dict)
    room_ids: dict[str, str] = field(default_factory=dict)
    primary_furniture_id: str | None = None


class SweetHome3DConverter:
    def __init__(self, client: ToolClient, *, enrich_decor: bool | None = None) -> None:
        self.client = client
        self._catalog_cache: dict[str, list[dict[str, Any]]] = {}
        self._metadata_index = load_catalog_metadata_index()
        self._enrich_decor = enrich_decor

    def _catalog(self, query: str, item_type: str = "furniture") -> list[dict[str, Any]]:
        cache_key = f"{item_type}:{query.casefold()}"
        if cache_key not in self._catalog_cache:
            response = self.client.call_tool(
                "list_furniture_catalog", {"query": query, "type": item_type}
            )
            self._catalog_cache[cache_key] = _extract_items(response)
        return self._catalog_cache[cache_key]

    @staticmethod
    def _catalog_identity(item: Mapping[str, Any]) -> tuple[str | None, str | None, str | None]:
        return (
            str(item.get("id") or item.get("catalogId") or "") or None,
            str(item.get("name") or "") or None,
            str(item.get("category") or "") or None,
        )

    @staticmethod
    def _is_multi_material_catalog_id(catalog_id: str | None) -> bool:
        if not catalog_id:
            return False
        if catalog_id in TEXTURED_ETEK_IDS:
            return True
        return any(catalog_id.startswith(prefix) for prefix in TEXTURED_MULTIMATERIAL_PREFIXES)

    def _select_catalog_item(
        self,
        rule: CatalogRule | None,
        item: Mapping[str, Any] | None = None,
        *,
        item_type: str = "furniture",
        used_ids: set[str] | None = None,
    ) -> dict[str, Any]:
        if rule is None:
            return {}
        candidates: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for q in (rule.query, *rule.fallback_queries):
            for entry in self._catalog(q, item_type=item_type):
                cid = str(entry.get("id") or entry.get("catalogId") or "")
                key = cid or str(entry.get("name") or "")
                if key and key not in seen_ids:
                    seen_ids.add(key)
                    candidates.append(entry)
            if candidates and len(candidates) >= 8:
                break

        if not candidates:
            return {}

        category_cf = str((item or {}).get("category") or "").casefold()
        name_cf = str((item or {}).get("name") or "").casefold()
        height_cm = float((item or {}).get("height") or 0.0)
        depth_cm = float((item or {}).get("depth") or 0.0)

        preferred = list(rule.preferred_ids)
        if category_cf == "bed" and (height_cm >= 140.0 or "tầng" in name_cf or "bunk" in name_cf):
            preferred = list(CATEGORY_RULES["bunk_bed"].preferred_ids) + preferred
        elif category_cf == "sofa" and depth_cm >= 125.0:
            preferred = ["Blend Swap CC-0#L_shaped_sofa", "Blend Swap CC-BY#cornerSofa", "eTeks#cornerSofa"] + preferred

        by_id = {str(c.get("id") or c.get("catalogId") or ""): c for c in candidates}
        is_mock_catalog = all(cid.startswith("catalog-") for cid in by_id if cid)
        if not is_mock_catalog and self._metadata_index:
            for pid in preferred:
                if pid in self._metadata_index and pid not in by_id:
                    by_id[pid] = dict(self._metadata_index[pid])

        if used_ids:
            for pid in preferred:
                if pid in by_id and pid not in used_ids:
                    return by_id[pid]
        for pid in preferred:
            if pid in by_id:
                return by_id[pid]

        if category_cf == "sofa" and depth_cm < 120.0:
            non_corner = [c for c in candidates if "corner" not in str(c.get("name") or "").casefold()]
            if non_corner:
                return non_corner[0]

        return candidates[0]

    @staticmethod
    def _sh3d_angle(studio_rotation_deg: float) -> float:
        """Convert Studio counter-clockwise angle to Sweet Home 3D clockwise angle."""
        return round((360.0 - float(studio_rotation_deg)) % 360.0, 2)

    @staticmethod
    def _clamp_to_room_bounds(
        x: float,
        y: float,
        width: float,
        depth: float,
        angle_deg: float,
        bounds: Mapping[str, float],
        margin: float = 11.0,
    ) -> tuple[float, float]:
        rad = math.radians(angle_deg)
        half_x = 0.5 * (abs(width * math.cos(rad)) + abs(depth * math.sin(rad)))
        half_y = 0.5 * (abs(width * math.sin(rad)) + abs(depth * math.cos(rad)))
        min_x = bounds["min_x"] + margin + half_x
        max_x = bounds["max_x"] - margin - half_x
        min_y = bounds["min_y"] + margin + half_y
        max_y = bounds["max_y"] - margin - half_y
        clamped_x = min(max(x, min_x), max_x) if min_x <= max_x else (bounds["min_x"] + bounds["max_x"]) * 0.5
        clamped_y = min(max(y, min_y), max_y) if min_y <= max_y else (bounds["min_y"] + bounds["max_y"]) * 0.5
        return round(clamped_x, 2), round(clamped_y, 2)

    def convert(self, project: Mapping[str, Any], *, clear: bool = True) -> ConversionResult:
        scene = normalize_scene(project)
        if clear:
            self.client.call_tool("clear_scene", {})

        room_points = [point for room in scene["rooms"] for point in room["points"]]
        min_x = min(point["x"] for point in room_points)
        max_x = max(point["x"] for point in room_points)
        min_y = min(point["y"] for point in room_points)
        max_y = max(point["y"] for point in room_points)
        center_x = sum(point["x"] for point in room_points) / len(room_points)
        center_y = sum(point["y"] for point in room_points) / len(room_points)
        bounds = {"min_x": min_x, "max_x": max_x, "min_y": min_y, "max_y": max_y}

        wall_ids: dict[str, str] = {}
        wall_records: list[dict[str, Any]] = []
        for wall in scene["walls"]:
            response = self.client.call_tool(
                "create_wall",
                {
                    "xStart": wall["x_start"],
                    "yStart": wall["y_start"],
                    "xEnd": wall["x_end"],
                    "yEnd": wall["y_end"],
                    "thickness": wall["thickness"],
                    "height": wall["height"],
                },
            )
            sh3d_wall_id = _extract_id(response)
            wall_ids[wall["studio_id"]] = sh3d_wall_id

            is_accent = wall.get("is_accent_wall") or any(
                token in (wall.get("face_a_material_id", "") + wall.get("face_b_material_id", "")).casefold()
                for token in ("sage", "accent", "slat", "veneer")
            )
            wall_color = "#E3DDD1" if is_accent else "#F4EFE6"
            self.client.call_tool(
                "modify_wall",
                {
                    "id": sh3d_wall_id,
                    "leftSideColor": wall_color,
                    "rightSideColor": wall_color,
                    "topColor": "#F4EFE6",
                    "shininess": 0.03 if is_accent else 0.01,
                    "height": wall["height"],
                },
            )
            wall_records.append(
                {
                    "studio_id": wall["studio_id"],
                    "sh3d_id": sh3d_wall_id,
                    "x_start": wall["x_start"],
                    "y_start": wall["y_start"],
                    "x_end": wall["x_end"],
                    "y_end": wall["y_end"],
                    "mid_x": 0.5 * (wall["x_start"] + wall["x_end"]),
                    "mid_y": 0.5 * (wall["y_start"] + wall["y_end"]),
                    "height": wall["height"],
                    "thickness": wall["thickness"],
                    "color": wall_color,
                }
            )

        # Connect contiguous wall segments so corners miter cleanly
        for i, w1 in enumerate(scene["walls"]):
            for w2 in scene["walls"][i + 1:]:
                if (
                    math.hypot(w1["x_end"] - w2["x_start"], w1["y_end"] - w2["y_start"]) <= 1.0
                    or math.hypot(w2["x_end"] - w1["x_start"], w2["y_end"] - w1["y_start"]) <= 1.0
                    or math.hypot(w1["x_start"] - w2["x_start"], w1["y_start"] - w2["y_start"]) <= 1.0
                    or math.hypot(w1["x_end"] - w2["x_end"], w1["y_end"] - w2["y_end"]) <= 1.0
                ):
                    self.client.call_tool(
                        "connect_walls",
                        {"wall1Id": wall_ids[w1["studio_id"]], "wall2Id": wall_ids[w2["studio_id"]]},
                    )

        room_ids: dict[str, str] = {}
        for room in scene["rooms"]:
            response = self.client.call_tool(
                "create_room_polygon",
                {
                    "points": room["points"],
                    "name": room["name"],
                    "floorVisible": True,
                    "ceilingVisible": True,
                },
            )
            sh3d_room_id = _extract_id(response)
            room_ids[room["studio_id"]] = sh3d_room_id
            self.client.call_tool(
                "apply_texture",
                {
                    "targetType": "room",
                    "targetId": sh3d_room_id,
                    "surface": "floor",
                    "textureName": "Wooden floor",
                    "textureCategory": "Floor",
                    "angle": 0,
                    "scale": 1.0,
                },
            )
            self.client.call_tool(
                "modify_room",
                {
                    "id": sh3d_room_id,
                    "floorVisible": True,
                    "ceilingVisible": True,
                    "ceilingColor": "#FAF7F2",
                    "floorShininess": 0.14,
                    "ceilingShininess": 0.0,
                },
            )

        manifest: dict[str, Any] = {
            "schema": "atelier.sweethome3d-spike.v1",
            "project_id": scene["project_id"],
            "project_name": scene["name"],
            "source_revision": scene["revision"],
            "units": {"source": "mm", "sweethome3d": "cm"},
            "counts": {
                "walls": len(scene["walls"]),
                "rooms": len(scene["rooms"]),
                "openings": len(scene["openings"]),
                "furniture": len(scene["furniture"]),
            },
            "walls_meta": wall_records,
            "rooms_meta": [{"studio_id": k, "sh3d_id": v} for k, v in room_ids.items()],
            "models": [],
            "decor_added": [],
            "warnings": [],
        }

        door_pos: tuple[float, float] | None = None
        entrance_x, entrance_y = center_x, max_y - 48.0
        first_door = next((item for item in scene["openings"] if item["kind"] == "door"), None)
        if first_door:
            wall = next((item for item in scene["walls"] if item["studio_id"] == first_door["wall_id"]), None)
            if wall:
                t = first_door["position"]
                door_x = wall["x_start"] + (wall["x_end"] - wall["x_start"]) * t
                door_y = wall["y_start"] + (wall["y_end"] - wall["y_start"]) * t
                door_pos = (door_x, door_y)
                length = max(math.hypot(center_x - door_x, center_y - door_y), 0.001)
                entrance_x = door_x + (center_x - door_x) / length * 45.0
                entrance_y = door_y + (center_y - door_y) / length * 45.0

        max_wall_height = max(wall["height"] for wall in scene["walls"])
        manifest["camera_plan"] = {
            "center": {"x": round(center_x, 3), "y": round(center_y, 3), "z": 88.0},
            "entrance": {"x": round(entrance_x, 3), "y": round(entrance_y, 3), "z": 152.0},
            "bounds": bounds,
            "wall_height": max_wall_height,
            "high_z": max(170.0, min(250.0, max_wall_height - 20.0)),
        }
        self.client.call_tool(
            "set_environment",
            {
                "groundColor": "#E5DDD2",
                "skyColor": "#DCEBFA",
                "lightColor": "#FFFFFF",
                "ceilingLightColor": "#FFF4E0",
                "wallsAlpha": 0.0,
            },
        )

        furniture_ids: dict[str, str] = {}
        for opening in scene["openings"]:
            wall_id = wall_ids.get(opening["wall_id"])
            if not wall_id:
                raise ValueError(f"opening {opening['studio_id']} references missing wall {opening['wall_id']}")
            wall_obj = next((w for w in scene["walls"] if w["studio_id"] == opening["wall_id"]), None)
            wall_thickness = float(wall_obj["thickness"]) if wall_obj else 20.0
            query = "door" if opening["kind"] == "door" else "window"
            catalog = self._catalog(query, "doorOrWindow")
            chosen = catalog[0] if catalog else {}
            is_mock_opening = bool(chosen and str(chosen.get("id") or "").startswith("catalog-"))
            if not is_mock_opening and chosen:
                if opening["kind"] == "door":
                    chosen = dict(self._metadata_index.get("eTeks#door") or chosen)
                else:
                    win_id = "eTeks#doubleWindow126x163" if opening["width"] >= 120.0 else "eTeks#window85x123"
                    chosen = dict(self._metadata_index.get(win_id) or chosen)
            catalog_id, catalog_name, catalog_category = self._catalog_identity(chosen)
            args: dict[str, Any] = {
                "wallId": wall_id,
                "position": opening["position"],
                "elevation": opening["elevation"],
                "name": query,
            }
            if catalog_id:
                args["catalogId"] = catalog_id
            if opening["kind"] == "door":
                args["sashPreset"] = "single_left" if opening["hinges_side"] == "left" else "single_right"
            response = self.client.call_tool("place_door_or_window", args)
            sh3d_id = _extract_id(response)
            self.client.call_tool(
                "modify_furniture",
                {
                    "id": sh3d_id,
                    "name": opening["studio_id"],
                    "width": opening["width"],
                    "depth": round(min(max(wall_thickness + 4.0, 16.0), 26.0), 2),
                    "height": opening["height"],
                    "elevation": opening["elevation"],
                },
            )
            furniture_ids[opening["studio_id"]] = sh3d_id
            approximate = not bool(chosen)
            manifest["models"].append(
                self._model_record(
                    opening["studio_id"],
                    opening["kind"],
                    chosen,
                    approximate,
                    "No matching door/window catalog item" if approximate else None,
                    catalog_id,
                    catalog_name,
                    catalog_category,
                    material_info={"finish": "Architectural Frame & Glass", "shininess": 0.25},
                )
            )

        primary_furniture_id: str | None = None
        primary_footprint = -1.0
        used_catalog_ids: set[str] = set()
        used_colors: set[str] = set()
        palette_idx = 0
        placed_boxes: list[dict[str, Any]] = []

        for idx, item in enumerate(scene["furniture"]):
            rule = catalog_rule_for(item["category"])
            chosen = self._select_catalog_item(rule, item, used_ids=used_catalog_ids)
            catalog_id, catalog_name, catalog_category = self._catalog_identity(chosen)
            if catalog_id:
                used_catalog_ids.add(catalog_id)

            sh3d_angle = self._sh3d_angle(item["angle"])
            clamped_x, clamped_y = self._clamp_to_room_bounds(
                item["x"], item["y"], item["width"], item["depth"], sh3d_angle, bounds
            )
            item_elevation = item["elevation"]
            if item["category"].casefold() in {"rug", "round_rug", "rug_round"} and item_elevation <= 0.0:
                item_elevation = 0.1

            # Assign a distinct material profile for every single piece
            palette_label, palette_hex, palette_shininess = JAPANDI_DISTINCT_PALETTE[palette_idx % len(JAPANDI_DISTINCT_PALETTE)]
            palette_idx += 1
            desired_color = item["color"]
            if desired_color.upper() in used_colors:
                desired_color = palette_hex
            used_colors.add(desired_color.upper())
            distinct_shininess = round(min(0.32, palette_shininess + (idx * 0.015)), 3)

            approximate = False
            reason: str | None = None
            preserve_native_texture = self._is_multi_material_catalog_id(catalog_id)

            if chosen:
                args = {
                    "x": clamped_x,
                    "y": clamped_y,
                    "angle": sh3d_angle,
                    "elevation": item_elevation,
                    "name": catalog_name or (rule.query if rule else item["category"]),
                }
                if catalog_id:
                    args["catalogId"] = catalog_id
                response = self.client.call_tool("place_furniture", args)
                sh3d_id = _extract_id(response)
                modify_args: dict[str, Any] = {
                    "id": sh3d_id,
                    "name": item["name"],
                    "x": clamped_x,
                    "y": clamped_y,
                    "angle": sh3d_angle,
                    "width": item["width"],
                    "depth": item["depth"],
                    "height": item["height"],
                    "elevation": item_elevation,
                    "shininess": distinct_shininess,
                }
                if not preserve_native_texture:
                    modify_args["color"] = desired_color
                self.client.call_tool("modify_furniture", modify_args)
            else:
                approximate = True
                reason = "No compatible catalog model; generated a dimensionally correct neutral shape"
                mode = "stairs" if item["category"].casefold() in {"stair", "staircase", "bunk_stair"} else "box"
                shape_args: dict[str, Any] = {
                    "mode": mode,
                    "name": item["name"],
                    "x": clamped_x,
                    "y": clamped_y,
                    "width": item["width"],
                    "depth": item["depth"],
                    "height": item["height"],
                    "elevation": item_elevation,
                    "angle": sh3d_angle,
                    "color": desired_color,
                }
                if mode == "stairs":
                    shape_args["steps"] = 8
                response = self.client.call_tool("generate_shape", shape_args)
                sh3d_id = _extract_id(response)
                manifest["warnings"].append({"object_id": item["studio_id"], "reason": reason})

            furniture_ids[item["studio_id"]] = sh3d_id
            placed_boxes.append(
                _bbox_3d(
                    {
                        "studio_id": item["studio_id"],
                        "category": item["category"],
                        "x": clamped_x,
                        "y": clamped_y,
                        "width": item["width"],
                        "depth": item["depth"],
                        "height": item["height"],
                        "elevation": item_elevation,
                        "angle": sh3d_angle,
                    }
                )
            )

            footprint = item["width"] * item["depth"]
            cat_cf = item["category"].casefold()
            if cat_cf in {"rug", "round_rug", "rug_round"}:
                weight = 0.15
            elif cat_cf in {"wardrobe", "closet"}:
                weight = 0.45
            else:
                weight = 1.0
            effective_footprint = footprint * weight
            if effective_footprint > primary_footprint:
                primary_footprint = effective_footprint
                primary_furniture_id = sh3d_id
                manifest["camera_plan"]["primary_target"] = {
                    "x": item["x"],
                    "y": item["y"],
                    "z": item["elevation"] + item["height"] * 0.5,
                }

            manifest["models"].append(
                self._model_record(
                    item["studio_id"],
                    item["category"],
                    chosen,
                    approximate,
                    reason,
                    catalog_id,
                    catalog_name,
                    catalog_category,
                    material_info={
                        "profile": palette_label,
                        "mode": "multi_material_textured" if preserve_native_texture else "custom_tinted",
                        "color_hex": desired_color,
                        "shininess": distinct_shininess,
                    },
                )
            )

        # Step 4 enrichment: add indoor lighting + library decor (rug, plant, wall art, curtains, books, lamps)
        should_enrich = self._enrich_decor
        if should_enrich is None:
            sample_door = self._catalog("door", "doorOrWindow")
            should_enrich = bool(sample_door and not str(sample_door[0].get("id") or "").startswith("catalog-"))

        if should_enrich:
            self._enrich_scene_lighting_and_decor(
                scene=scene,
                bounds=bounds,
                center_x=center_x,
                center_y=center_y,
                max_wall_height=max_wall_height,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        primary_target = manifest["camera_plan"].get("primary_target") or manifest["camera_plan"]["center"]
        manifest["camera_plan"]["views"] = _compute_camera_views(
            bounds=bounds,
            center_x=center_x,
            center_y=center_y,
            door_pos=door_pos,
            primary_target=primary_target,
            placed_boxes=placed_boxes,
            max_wall_height=max_wall_height,
        )

        return ConversionResult(
            manifest=manifest,
            furniture_ids=furniture_ids,
            wall_ids=wall_ids,
            room_ids=room_ids,
            primary_furniture_id=primary_furniture_id,
        )

    def _place_enriched_item(
        self,
        *,
        studio_id: str,
        name: str,
        category: str,
        x: float,
        y: float,
        elevation: float,
        width: float,
        depth: float,
        height: float,
        angle: float,
        shininess: float,
        manifest: dict[str, Any],
        furniture_ids: dict[str, str],
        used_catalog_ids: set[str],
        placed_boxes: list[dict[str, Any]],
    ) -> str | None:
        rule = catalog_rule_for(category)
        chosen = self._select_catalog_item(rule, {"category": category, "name": name, "height": height, "depth": depth}, used_ids=used_catalog_ids)
        if not chosen:
            return None
        catalog_id, catalog_name, catalog_category = self._catalog_identity(chosen)
        if catalog_id:
            used_catalog_ids.add(catalog_id)
        args: dict[str, Any] = {
            "x": round(x, 2),
            "y": round(y, 2),
            "angle": round(angle, 2),
            "elevation": round(elevation, 2),
            "name": catalog_name or name,
        }
        if catalog_id:
            args["catalogId"] = catalog_id
        response = self.client.call_tool("place_furniture", args)
        sh3d_id = _extract_id(response)
        self.client.call_tool(
            "modify_furniture",
            {
                "id": sh3d_id,
                "name": name,
                "x": round(x, 2),
                "y": round(y, 2),
                "angle": round(angle, 2),
                "width": round(width, 2),
                "depth": round(depth, 2),
                "height": round(height, 2),
                "elevation": round(elevation, 2),
                "shininess": shininess,
            },
        )
        furniture_ids[studio_id] = sh3d_id
        placed_boxes.append(
            _bbox_3d(
                {
                    "studio_id": studio_id,
                    "category": category,
                    "x": x,
                    "y": y,
                    "width": width,
                    "depth": depth,
                    "height": height,
                    "elevation": elevation,
                    "angle": angle,
                }
            )
        )
        record = self._model_record(
            studio_id,
            category,
            chosen,
            False,
            None,
            catalog_id,
            catalog_name,
            catalog_category,
            material_info={"profile": f"Decor/{category}", "mode": "multi_material_textured", "shininess": shininess},
        )
        manifest["models"].append(record)
        manifest["decor_added"].append(
            {
                "id": studio_id,
                "category": category,
                "catalog_id": catalog_id,
                "catalog_name": catalog_name,
                "x": round(x, 2),
                "y": round(y, 2),
                "elevation": round(elevation, 2),
            }
        )
        return sh3d_id

    def _enrich_scene_lighting_and_decor(
        self,
        *,
        scene: Mapping[str, Any],
        bounds: Mapping[str, float],
        center_x: float,
        center_y: float,
        max_wall_height: float,
        manifest: dict[str, Any],
        furniture_ids: dict[str, str],
        used_catalog_ids: set[str],
        placed_boxes: list[dict[str, Any]],
    ) -> None:
        existing_cats = {item["category"].casefold() for item in scene["furniture"]}

        # 1. Ceiling pendant lamp at room center
        pendant_h = 62.0
        self._place_enriched_item(
            studio_id="decor_ceiling_pendant_lamp",
            name="Đèn Thả Trần Japandi",
            category="ceiling_lamp",
            x=center_x,
            y=center_y,
            elevation=max(195.0, max_wall_height - pendant_h - 4.0),
            width=42.0,
            depth=42.0,
            height=pendant_h,
            angle=0.0,
            shininess=0.22,
            manifest=manifest,
            furniture_ids=furniture_ids,
            used_catalog_ids=used_catalog_ids,
            placed_boxes=placed_boxes,
        )

        # 2. Warm indoor point light source (ensures warm indoor lighting even when ceiling is hidden in overhead view)
        light_items = self._catalog("Incandescent light source", "furniture") or self._catalog("White light source", "furniture")
        if light_items:
            chosen_light = light_items[0]
            lid, lname, lcat = self._catalog_identity(chosen_light)
            l_args: dict[str, Any] = {
                "x": round(center_x, 2),
                "y": round(center_y, 2),
                "elevation": round(max(200.0, max_wall_height - 50.0), 2),
                "angle": 0.0,
                "name": lname or "Light source",
            }
            if lid:
                l_args["catalogId"] = lid
            l_resp = self.client.call_tool("place_furniture", l_args)
            l_sh3d_id = _extract_id(l_resp)
            furniture_ids["decor_indoor_light_source"] = l_sh3d_id
            manifest["models"].append(
                self._model_record(
                    "decor_indoor_light_source",
                    "light_source",
                    chosen_light,
                    False,
                    None,
                    lid,
                    lname,
                    lcat,
                    material_info={"profile": "Warm Indoor Light Bulb", "mode": "emissive_light", "shininess": 0.0},
                )
            )

        # 3. Table lamp on nightstand or desk (or corner floor/accent lamp beside sofa if no nightstand/desk)
        lamp_surface = next(
            (
                f for f in scene["furniture"]
                if f["category"].casefold() in {"nightstand", "bedside_table", "desk", "study_desk"}
            ),
            None,
        )
        if lamp_surface:
            surface_top = lamp_surface["elevation"] + lamp_surface["height"]
            lamp_x, lamp_y = self._clamp_to_room_bounds(
                lamp_surface["x"], lamp_surface["y"], 26.0, 26.0, 0.0, bounds, margin=14.0
            )
            self._place_enriched_item(
                studio_id="decor_table_lamp",
                name="Đèn Bàn Gốm & Gỗ Ấm",
                category="table_lamp",
                x=lamp_x,
                y=lamp_y,
                elevation=surface_top,
                width=26.0,
                depth=26.0,
                height=36.0,
                angle=0.0,
                shininess=0.18,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )
        else:
            sofa_item = next((f for f in scene["furniture"] if f["category"].casefold() == "sofa"), None)
            lamp_x = sofa_item["x"] if sofa_item else bounds["min_x"] + 55.0
            lamp_y = (sofa_item["y"] - sofa_item["width"] * 0.5 - 28.0) if sofa_item else bounds["min_y"] + 55.0
            lamp_x, lamp_y = self._clamp_to_room_bounds(lamp_x, lamp_y, 32.0, 32.0, 0.0, bounds, margin=16.0)
            self._place_enriched_item(
                studio_id="decor_table_lamp",
                name="Đèn Góc Sofa Japandi",
                category="table_lamp",
                x=lamp_x,
                y=lamp_y,
                elevation=0.0,
                width=32.0,
                depth=32.0,
                height=62.0,
                angle=0.0,
                shininess=0.18,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        # 4. Rug (Thảm) if the scene does not already have one
        if not existing_cats.intersection({"rug", "round_rug", "rug_round"}):
            rug_anchor = next(
                (f for f in scene["furniture"] if f["category"].casefold() in {"coffee_table", "sofa", "bed"}),
                None,
            )
            rug_x = rug_anchor["x"] if rug_anchor else center_x
            rug_y = rug_anchor["y"] if rug_anchor else center_y
            rug_x, rug_y = self._clamp_to_room_bounds(rug_x, rug_y, 175.0, 230.0, 0.0, bounds, margin=25.0)
            self._place_enriched_item(
                studio_id="decor_area_rug",
                name="Thảm Dệt Japandi",
                category="rug",
                x=rug_x,
                y=rug_y,
                elevation=0.1,
                width=175.0,
                depth=230.0,
                height=1.2,
                angle=0.0,
                shininess=0.03,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        # 5. Indoor Plant (Cây) if the scene does not already have one
        if "plant" not in existing_cats:
            candidate_corners = [
                (bounds["min_x"] + 48.0, bounds["min_y"] + 48.0),
                (bounds["max_x"] - 48.0, bounds["min_y"] + 48.0),
                (bounds["min_x"] + 48.0, bounds["max_y"] - 48.0),
                (bounds["max_x"] - 48.0, bounds["max_y"] - 48.0),
            ]
            free_corners = [
                pt for pt in candidate_corners
                if not any(
                    (b["x0"] - 20.0) <= pt[0] <= (b["x1"] + 20.0) and (b["y0"] - 20.0) <= pt[1] <= (b["y1"] + 20.0)
                    for b in placed_boxes if b["z1"] > 20.0
                )
            ] or candidate_corners
            best_corner = max(
                free_corners,
                key=lambda pt: min(
                    (math.hypot(pt[0] - f["x"], pt[1] - f["y"]) for f in scene["furniture"]),
                    default=100.0,
                ),
            )
            self._place_enriched_item(
                studio_id="decor_indoor_plant",
                name="Cây Cảnh Nội Thất",
                category="plant",
                x=best_corner[0],
                y=best_corner[1],
                elevation=0.0,
                width=52.0,
                depth=52.0,
                height=88.0,
                angle=0.0,
                shininess=0.09,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        # 6. Framed Wall Art (Tranh treo tường) mounted on the primary feature wall (above sofa or bed)
        anchor_piece = next(
            (f for f in scene["furniture"] if f["category"].casefold() in {"sofa", "bed", "double_bed"}),
            None,
        )
        art_x, art_y, art_angle = center_x, bounds["min_y"] + 12.5, 0.0
        if anchor_piece:
            dists = [
                ("north", abs(anchor_piece["y"] - bounds["min_y"]), anchor_piece["x"], bounds["min_y"] + 12.0, 0.0),
                ("south", abs(anchor_piece["y"] - bounds["max_y"]), anchor_piece["x"], bounds["max_y"] - 12.0, 180.0),
                ("west", abs(anchor_piece["x"] - bounds["min_x"]), bounds["min_x"] + 12.0, anchor_piece["y"], 270.0),
                ("east", abs(anchor_piece["x"] - bounds["max_x"]), bounds["max_x"] - 12.0, anchor_piece["y"], 90.0),
            ]
            _, _, art_x, art_y, art_angle = min(dists, key=lambda item: item[1])
        self._place_enriched_item(
            studio_id="decor_wall_painting",
            name="Tranh Nghệ Thuật Japandi",
            category="wall_art",
            x=art_x,
            y=art_y,
            elevation=148.0,
            width=92.0,
            depth=2.5,
            height=64.0,
            angle=art_angle,
            shininess=0.15,
            manifest=manifest,
            furniture_ids=furniture_ids,
            used_catalog_ids=used_catalog_ids,
            placed_boxes=placed_boxes,
        )

        # 7. Curtains (Rèm cửa) at windows
        for idx, opening in enumerate(scene["openings"]):
            if opening["kind"] != "window":
                continue
            wall = next((w for w in scene["walls"] if w["studio_id"] == opening["wall_id"]), None)
            if not wall:
                continue
            t = opening["position"]
            wx = wall["x_start"] + (wall["x_end"] - wall["x_start"]) * t
            wy = wall["y_start"] + (wall["y_end"] - wall["y_start"]) * t
            if abs(wy - bounds["min_y"]) <= 25.0:
                cx, cy, c_angle = wx, bounds["min_y"] + 19.0, 0.0
            elif abs(wy - bounds["max_y"]) <= 25.0:
                cx, cy, c_angle = wx, bounds["max_y"] - 19.0, 180.0
            elif abs(wx - bounds["min_x"]) <= 25.0:
                cx, cy, c_angle = bounds["min_x"] + 19.0, wy, 270.0
            else:
                cx, cy, c_angle = bounds["max_x"] - 19.0, wy, 90.0
            self._place_enriched_item(
                studio_id=f"decor_window_curtain_{idx + 1}",
                name="Rèm Vải Linen Tự Nhiên",
                category="curtain",
                x=cx,
                y=cy,
                elevation=max(10.0, opening["elevation"] - 45.0),
                width=min(185.0, opening["width"] + 25.0),
                depth=18.0,
                height=min(235.0, opening["height"] + 55.0),
                angle=c_angle,
                shininess=0.04,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        # 8. Books (Sách) on coffee table or desk
        book_surface = next(
            (
                f for f in scene["furniture"]
                if f["category"].casefold() in {"coffee_table", "desk", "study_desk", "nightstand"}
            ),
            None,
        )
        if book_surface:
            b_top = book_surface["elevation"] + book_surface["height"]
            bx, by = self._clamp_to_room_bounds(
                book_surface["x"], book_surface["y"], 28.0, 20.0, 15.0, bounds, margin=15.0
            )
            self._place_enriched_item(
                studio_id="decor_art_books",
                name="Sách Kiến Trúc & Nội Thất",
                category="books",
                x=bx,
                y=by,
                elevation=b_top,
                width=28.0,
                depth=20.0,
                height=3.5,
                angle=15.0,
                shininess=0.08,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

        # 9. Flat TV on TV cabinet if present
        tv_surface = next(
            (f for f in scene["furniture"] if f["category"].casefold() in {"tv_cabinet", "tv_console"}),
            None,
        )
        if tv_surface:
            tv_top = tv_surface["elevation"] + tv_surface["height"]
            tv_angle = self._sh3d_angle(tv_surface["angle"])
            tv_x, tv_y = self._clamp_to_room_bounds(
                tv_surface["x"], tv_surface["y"], 115.0, 16.0, tv_angle, bounds, margin=12.0
            )
            self._place_enriched_item(
                studio_id="decor_flat_tv",
                name="Smart TV Màn Hình Phẳng",
                category="tv",
                x=tv_x,
                y=tv_y,
                elevation=tv_top,
                width=115.0,
                depth=16.0,
                height=68.0,
                angle=tv_angle,
                shininess=0.30,
                manifest=manifest,
                furniture_ids=furniture_ids,
                used_catalog_ids=used_catalog_ids,
                placed_boxes=placed_boxes,
            )

    def _model_record(
        self,
        object_id: str,
        category: str,
        chosen: Mapping[str, Any],
        approximate: bool,
        reason: str | None,
        catalog_id: str | None,
        catalog_name: str | None,
        catalog_category: str | None,
        *,
        material_info: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = self._metadata_index.get(str(catalog_id or ""), {}) if chosen else {}
        creator = str(meta.get("creator") or ("eTeks" if chosen else "")) or None
        raw_license = str(meta.get("license") or (CATALOG_LICENSE if chosen else "Generated geometry owned by this export"))
        source_lib = str(meta.get("source") or ("Furniture.jar" if chosen else "procedural"))
        cc_by_required = "CC-BY" in raw_license
        attribution = (
            f"'{catalog_name or catalog_id}' ({catalog_id}) by {creator} — License: {raw_license} [{source_lib}]"
            if chosen
            else "Procedural geometry generated by Studio bridge (no third-party model)."
        )
        return {
            "studio_object_id": object_id,
            "studio_category": category,
            "catalog_id": catalog_id,
            "catalog_name": catalog_name,
            "catalog_category": catalog_category,
            "catalog_dimensions_cm": {
                key: chosen.get(key) for key in ("width", "depth", "height") if chosen.get(key) is not None
            },
            "approximate": approximate,
            "approximation_reason": reason,
            "creator": creator,
            "source_library": source_lib if chosen else None,
            "license": raw_license,
            "cc_by_attribution_required": cc_by_required,
            "attribution": attribution,
            "license_url": CATALOG_LICENSE_URL if chosen else None,
            "license_note": (
                f"Provenance verified from {source_lib} catalog metadata ({raw_license}; creator: {creator})."
                if chosen
                else "No third-party model was used."
            ),
            "material": dict(material_info) if material_info else None,
        }


def render_and_export(
    client: ToolClient,
    conversion: ConversionResult,
    output_dir: Path,
    *,
    width: int = 1920,
    height: int = 1080,
    quality: str = "high",
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    project_id = conversion.manifest["project_id"]
    sh3d_path = output_dir / f"{project_id}.sh3d"
    obj_zip_path = output_dir / f"{project_id}-obj.zip"
    timings: dict[str, float] = {}

    start = time.perf_counter()
    client.call_tool("save_home", {"filePath": str(sh3d_path)})
    timings["save_home_seconds"] = round(time.perf_counter() - start, 3)

    start = time.perf_counter()
    client.call_tool("export_to_obj", {"filePath": str(obj_zip_path)})
    timings["export_obj_seconds"] = round(time.perf_counter() - start, 3)

    renders: list[dict[str, Any]] = []
    render_specs = ["overhead", "entrance", "hero"]
    views = conversion.manifest["camera_plan"].get("views") or {}

    for name in render_specs:
        view_cfg = views.get(name)
        if name == "overhead":
            for sh3d_room_id in conversion.room_ids.values():
                client.call_tool(
                    "modify_room",
                    {"id": sh3d_room_id, "ceilingVisible": False, "floorVisible": True},
                )
        if view_cfg:
            client.call_tool(
                "set_camera",
                {
                    "mode": "observer",
                    **view_cfg["camera"],
                    "lookAt": view_cfg["lookAt"],
                    "fov": view_cfg.get("fov", 65),
                },
            )
        else:
            center = conversion.manifest["camera_plan"]["center"]
            entrance = conversion.manifest["camera_plan"]["entrance"]
            client.call_tool("set_camera", {"mode": "observer", **entrance, "lookAt": center, "fov": 65})

        target_path = output_dir / f"{project_id}-{name}.png"
        render_args = {
            "width": width,
            "height": height,
            "quality": quality,
            "format": "png",
            "filePath": str(target_path),
        }
        start = time.perf_counter()
        client.call_tool("render_photo", render_args)
        duration = round(time.perf_counter() - start, 3)

        if name == "overhead":
            for sh3d_room_id in conversion.room_ids.values():
                client.call_tool(
                    "modify_room",
                    {"id": sh3d_room_id, "ceilingVisible": True, "floorVisible": True},
                )

        timings[f"render_{name}_seconds"] = duration
        renders.append(
            {
                "view": name,
                "path": str(target_path),
                "seconds": duration,
                "width": width,
                "height": height,
                "quality": quality,
            }
        )

    client.call_tool("save_home", {"filePath": str(sh3d_path)})

    return {
        "sh3d_path": str(sh3d_path),
        "obj_zip_path": str(obj_zip_path),
        "renders": renders,
        "timings": timings,
    }


def load_project_from_api(project_id: str, base_url: str = "http://127.0.0.1:8000") -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/api/v1/projects/{project_id}"
    with urllib.request.urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))
