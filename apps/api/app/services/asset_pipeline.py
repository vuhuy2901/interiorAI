"""Licensed 3D asset discovery, validation, normalization, and registry.

This module deliberately separates discovery from import. Search results never become
scene assets until their source/license metadata and runtime GLB have been validated.
"""
from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import html
import ipaddress
import json
import mimetypes
import re
import shutil
import socket
import struct
import urllib.parse
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, Iterable, List, Literal, Optional

from pydantic import BaseModel, Field

from app.models.contracts import AssetMetadata, MaterialSlotDefinition


ROOT_DIR = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT_DIR / "data" / "assets"
ASSET_LIBRARY_DIR = ASSET_ROOT / "library"
ASSET_CACHE_DIR = ASSET_ROOT / "cache"
USER_AGENT = "ATELIER-AI-Student-Project/1.0 (+local academic asset browser)"
MAX_ASSET_BYTES = 300 * 1024 * 1024
ALLOWED_DOWNLOAD_HOSTS = {
    "api.polyhaven.com",
    "dl.polyhaven.org",
    "ambientcg.com",
    "api.sketchfab.com",
}

# FurniMesh is intentionally a public-HTML, on-demand source.  The adapter
# never treats a crawl/index as the runtime source of truth and never follows
# arbitrary URLs supplied by an agent.
FURNIMESH_PAGE_HOSTS = {"furnimesh.com", "www.furnimesh.com"}
FURNIMESH_ASSET_HOSTS = {"storage.googleapis.com"}
FURNIMESH_ASSET_PREFIX = "/furnimesh-3d/"
FURNIMESH_PAGE_LIMIT = 5
FURNIMESH_MAX_HTML_BYTES = 4 * 1024 * 1024


class AssetPipelineError(RuntimeError):
    pass


class FurniMeshError(AssetPipelineError):
    """A safe, user-facing FurniMesh source or compatibility error."""


class FurniMeshCandidate(BaseModel):
    model_id: str
    name: str
    description: str = ""
    thumbnail_url: Optional[str] = None
    detail_url: str
    category: Optional[str] = None
    available_formats: List[str] = Field(default_factory=list)
    glb_url: Optional[str] = None
    source: Literal["furnimesh"] = "furnimesh"
    technical: Dict[str, Any] = Field(default_factory=dict)


class _FurniMeshNoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _reject_private_hostname(hostname: str) -> None:
    """Reject private/loopback/link-local DNS answers before outbound IO."""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise FurniMeshError(f"Không phân giải được hostname FurniMesh: {hostname}") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise FurniMeshError("URL FurniMesh trỏ tới địa chỉ mạng nội bộ hoặc bị hạn chế")


def validate_furnimesh_url(url: str, *, asset: bool = False) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    allowed_hosts = FURNIMESH_ASSET_HOSTS if asset else FURNIMESH_PAGE_HOSTS
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts or parsed.username or parsed.password:
        raise FurniMeshError(f"URL FurniMesh không nằm trong allowlist: {url}")
    if asset and not parsed.path.startswith(FURNIMESH_ASSET_PREFIX):
        raise FurniMeshError("Asset URL FurniMesh nằm ngoài prefix lưu trữ công khai")
    _reject_private_hostname(parsed.hostname)
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, ""))


class _FurniMeshHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, str]] = []
        self.images: list[str] = []
        self._href: Optional[str] = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        values = dict(attrs)
        if tag == "a" and values.get("href"):
            self._href = values["href"]
            self._text = []
        if tag == "img":
            source = values.get("src") or values.get("data-src")
            if source:
                self.images.append(source)

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            text_value = " ".join(" ".join(self._text).split())
            self.links.append({"href": self._href, "text": html.unescape(text_value)})
            self._href = None
            self._text = []


def _furnimesh_absolute_url(value: str, base: str) -> str:
    return urllib.parse.urljoin(base, html.unescape(value.strip()))


def _fetch_furnimesh_html(url: str, *, timeout: int = 20) -> tuple[str, str]:
    safe_url = validate_furnimesh_url(url)
    opener = urllib.request.build_opener(_FurniMeshNoRedirect())
    try:
        current_url = safe_url
        for _ in range(4):
            request = urllib.request.Request(current_url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
            try:
                response = opener.open(request, timeout=timeout)
            except urllib.error.HTTPError as redirect:
                if redirect.code < 300 or redirect.code >= 400:
                    raise
                location = redirect.headers.get("Location")
                if not location:
                    raise FurniMeshError("Trang FurniMesh redirect thiếu Location")
                current_url = validate_furnimesh_url(urllib.parse.urljoin(current_url, location))
                continue
            with response:
                final_url = validate_furnimesh_url(response.geturl())
                payload = response.read(FURNIMESH_MAX_HTML_BYTES + 1)
                if len(payload) > FURNIMESH_MAX_HTML_BYTES:
                    raise FurniMeshError("Trang FurniMesh vượt giới hạn kích thước metadata")
                return payload.decode("utf-8", errors="replace"), final_url
        raise FurniMeshError("Trang FurniMesh vượt quá số lần redirect cho phép")
    except FurniMeshError:
        raise
    except Exception as exc:
        raise FurniMeshError(f"Không thể đọc trang FurniMesh: {exc}") from exc


def _slug(value: str) -> str:
    return "-".join(part for part in re.split(r"[^a-z0-9]+", value.lower()) if part)


def _extract_model_id(detail_url: str) -> str:
    parts = [part for part in urllib.parse.urlparse(detail_url).path.split("/") if part]
    return parts[-1] if parts else detail_url


def parse_furnimesh_listing_html(html_text: str, *, base_url: str = "https://furnimesh.com/library/") -> list[FurniMeshCandidate]:
    parser = _FurniMeshHtmlParser()
    parser.feed(html_text)
    detail_links: dict[str, dict[str, str]] = {}
    for link in parser.links:
        absolute = _furnimesh_absolute_url(link["href"], base_url)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.hostname not in FURNIMESH_PAGE_HOSTS or not parsed.path.startswith("/library/"):
            continue
        path_parts = [part for part in parsed.path.split("/") if part]
        if len(path_parts) < 4 or "/format/glb/" in parsed.path or path_parts[-1] in {"", "sofas", "chairs", "beds", "tables", "chair", "table", "bed", "armchair", "dining-table", "coffee-table"}:
            continue
        # Download links are stored on the corresponding detail page.  The
        # listing itself remains cheap and only returns a candidate shell.
        key = absolute.rstrip("/")
        detail_links.setdefault(key, {"detail_url": key, "name": link["text"] or _extract_model_id(key)})
    candidates: list[FurniMeshCandidate] = []
    for item in detail_links.values():
        candidates.append(FurniMeshCandidate(model_id=_extract_model_id(item["detail_url"]), name=item["name"], detail_url=item["detail_url"]))
    return candidates


def _text_between(text: str, start: str, end: str = "") -> str:
    start_index = text.lower().find(start.lower())
    if start_index < 0:
        return ""
    value = text[start_index + len(start):]
    if end:
        value = value[:value.lower().find(end.lower())] if end.lower() in value.lower() else value
    return " ".join(re.sub(r"<[^>]+>", " ", value).split())


def get_furnimesh_details(*, model_id: Optional[str] = None, detail_url: Optional[str] = None) -> FurniMeshCandidate:
    if detail_url:
        target = validate_furnimesh_url(detail_url)
    elif model_id and model_id.startswith("https://"):
        target = validate_furnimesh_url(model_id)
    elif model_id and re.fullmatch(r"[a-z0-9][a-z0-9-]{2,160}", model_id):
        # A bare slug is accepted only as a bounded detail path; no arbitrary
        # host/path is inferred from agent input.
        target = validate_furnimesh_url(f"https://furnimesh.com/library/{model_id}/")
    else:
        raise FurniMeshError("Cần model_id hợp lệ hoặc detail_url FurniMesh công khai")
    source, final_url = _fetch_furnimesh_html(target)
    parser = _FurniMeshHtmlParser()
    parser.feed(source)
    links = [_furnimesh_absolute_url(item["href"], final_url) for item in parser.links]
    glb_candidates = [url for url in links if urllib.parse.urlparse(url).hostname in FURNIMESH_ASSET_HOSTS and url.lower().split("?", 1)[0].endswith(".glb")]
    title_match = re.search(r"<h1[^>]*>(.*?)</h1>", source, re.I | re.S)
    title = " ".join(re.sub(r"<[^>]+>", " ", title_match.group(1)).split()) if title_match else _extract_model_id(final_url)
    image = next((url for url in parser.images if url.startswith(("https://", "/")) and "logo" not in url.lower()), None)
    thumb = _furnimesh_absolute_url(image, final_url) if image else None
    extent_match = re.search(r"Model extent.*?([0-9.]+\s*[×x]\s*[0-9.]+\s*[×x]\s*[0-9.]+).*?scene units", source, re.I | re.S)
    poly_match = re.search(r"Polycount.*?([0-9][0-9,]*)", source, re.I | re.S)
    size_match = re.search(r"GLB\s*([0-9.]+\s*(?:MB|GB))", source, re.I)
    # Prefer the visible definition-list field. A broad `Category...>` match can
    # accidentally capture the surrounding JSON-LD script instead of the UI value.
    category_match = re.search(
        r"<dt[^>]*>\s*Category\s*</dt>\s*<dd[^>]*>(.*?)</dd>",
        source,
        re.I | re.S,
    )
    category = (
        " ".join(re.sub(r"<[^>]+>", " ", category_match.group(1)).split())
        if category_match
        else None
    )
    if not category:
        json_category = re.search(r'"category"\s*:\s*"([^"]+)"', source, re.I)
        category = html.unescape(json_category.group(1)).strip() if json_category else None
    description = re.sub(r"^About this model\s*", "", _text_between(source, "About this model", "Key features"), flags=re.I)
    return FurniMeshCandidate(
        model_id=_extract_model_id(final_url), name=title, description=description,
        thumbnail_url=thumb, detail_url=final_url, category=category,
        available_formats=[fmt for fmt in ("GLB", "OBJ", "SKP", "BLEND") if re.search(rf"\b{fmt}\b", source, re.I)],
        glb_url=validate_furnimesh_url(glb_candidates[0], asset=True) if glb_candidates else None,
        technical={"scene_extent": extent_match.group(1) if extent_match else None, "polycount": int(poly_match.group(1).replace(",", "")) if poly_match else None, "glb_file_size": size_match.group(1) if size_match else None, "dimensions_source": "scene_units" if extent_match else None},
    )


def search_furnimesh(query: str = "", category: Optional[str] = None, style: Optional[str] = None, color: Optional[str] = None, limit: int = 12, page: int = 1) -> list[FurniMeshCandidate]:
    limit = max(1, min(int(limit), 50))
    page = max(1, min(int(page), FURNIMESH_PAGE_LIMIT))
    category_path = _slug(category or "")
    path = f"/library/format/glb/{category_path}/" if category_path else "/library/format/glb/"
    url = f"https://furnimesh.com{path}?page={page}"
    source, final_url = _fetch_furnimesh_html(url)
    terms = [_slug(term) for term in (query, style, color) if term and _slug(term)]
    shells: list[FurniMeshCandidate] = []
    for candidate in parse_furnimesh_listing_html(source, base_url=final_url):
        haystack = _slug(f"{candidate.name} {candidate.description} {candidate.category or ''}")
        if terms and not all(term in haystack for term in terms):
            continue
        shells.append(candidate)
        if len(shells) >= min(limit * 2, 50):
            break
    # Listing HTML is intentionally cheap, but the public contract promises
    # useful thumbnails/formats/GLB metadata. Enrich only a bounded result
    # window with limited concurrency; this is not a catalog sync.
    enriched: list[Optional[FurniMeshCandidate]] = [None] * len(shells)
    with ThreadPoolExecutor(max_workers=min(4, len(shells) or 1)) as pool:
        futures = {pool.submit(get_furnimesh_details, detail_url=item.detail_url): index for index, item in enumerate(shells)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                enriched[index] = future.result()
            except FurniMeshError:
                enriched[index] = shells[index]
    results: list[FurniMeshCandidate] = []
    for candidate in enriched:
        if candidate is None:
            continue
        haystack = _slug(f"{candidate.name} {candidate.description} {candidate.category or ''}")
        if terms and not all(term in haystack for term in terms):
            continue
        results.append(candidate)
        if len(results) >= limit:
            break
    return results


def get_furnimesh_glb_url(*, model_id: Optional[str] = None, detail_url: Optional[str] = None) -> dict[str, Any]:
    details = get_furnimesh_details(model_id=model_id, detail_url=detail_url)
    if not details.glb_url:
        raise FurniMeshError("Model FurniMesh không công bố GLB công khai")
    return {"model_id": details.model_id, "glb_url": validate_furnimesh_url(details.glb_url, asset=True), "source_url": details.detail_url, "verified": True}


def preview_furnimesh(*, model_id: Optional[str] = None, detail_url: Optional[str] = None) -> dict[str, Any]:
    details = get_furnimesh_details(model_id=model_id, detail_url=detail_url)
    return {"model_id": details.model_id, "model_url": details.glb_url, "thumbnail_url": details.thumbnail_url, "metadata": details.model_dump(mode="json")}


def check_furnimesh_asset_compatibility(*, model_id: Optional[str] = None, detail_url: Optional[str] = None, max_bytes: int = MAX_ASSET_BYTES) -> dict[str, Any]:
    result = get_furnimesh_glb_url(model_id=model_id, detail_url=detail_url)
    url = result["glb_url"]
    try:
        opener = urllib.request.build_opener(_FurniMeshNoRedirect())
        current_url = url
        for _ in range(4):
            request = urllib.request.Request(current_url, headers={"User-Agent": USER_AGENT, "Accept": "model/gltf-binary"}, method="HEAD")
            try:
                response = opener.open(request, timeout=20)
            except urllib.error.HTTPError as redirect:
                if redirect.code < 300 or redirect.code >= 400:
                    raise
                location = redirect.headers.get("Location")
                if not location:
                    raise FurniMeshError("GLB redirect thiếu Location")
                current_url = validate_furnimesh_url(urllib.parse.urljoin(current_url, location), asset=True)
                continue
            with response:
                final_url = validate_furnimesh_url(response.geturl(), asset=True)
                content_length = response.headers.get("Content-Length")
                size = int(content_length) if content_length and content_length.isdigit() else None
                if size is not None and size > max_bytes:
                    return {**result, "compatible": False, "reason": "file_too_large", "file_size_bytes": size}
                content_type = (response.headers.get("Content-Type") or "").lower()
                return {**result, "compatible": True, "file_size_bytes": size, "content_type": content_type, "redirected_url": final_url, "analysis": "remote-header-only; GLB geometry analysis deferred until selected asset is provided"}
        raise FurniMeshError("GLB vượt quá số lần redirect cho phép")
    except Exception as exc:
        raise FurniMeshError(f"Không thể kiểm tra GLB FurniMesh: {exc}") from exc


class AssetCandidate(BaseModel):
    source: Literal["poly_haven", "ambientcg", "sketchfab", "user", "project_library"]
    source_asset_id: str
    name: str
    category: str = "unknown"
    description: str = ""
    source_url: str
    author: Optional[str] = None
    license: Optional[str] = None
    license_url: Optional[str] = None
    attribution_required: bool = False
    dimensions_mm: List[float] = Field(default_factory=list)
    polycount: Optional[int] = None
    vertex_count: Optional[int] = None
    preview_url: Optional[str] = None
    source_format: Optional[str] = None
    downloadable: bool = False
    requires_user_oauth: bool = False
    score: float = 0.0
    tags: List[str] = Field(default_factory=list)
    technical: Dict[str, Any] = Field(default_factory=dict)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json_get(url: str, *, token: Optional[str] = None, timeout: int = 25) -> Any:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_DOWNLOAD_HOSTS:
        raise AssetPipelineError(f"Nguồn API không được phép: {parsed.hostname or url}")
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise AssetPipelineError(f"Không thể đọc dữ liệu asset từ {parsed.hostname}: {exc}") from exc


def search_poly_haven(query: str, limit: int = 3) -> List[AssetCandidate]:
    limit = max(1, min(limit, 12))
    params = urllib.parse.urlencode({"q": query.strip().lower(), "t": "models", "limit": limit})
    search = _safe_json_get(f"https://api.polyhaven.com/search?{params}")
    candidates: List[AssetCandidate] = []
    for ranked in search.get("results", [])[:limit]:
        slug = ranked.get("slug")
        if not slug:
            continue
        info = _safe_json_get(f"https://api.polyhaven.com/info/{urllib.parse.quote(slug)}")
        candidates.append(
            AssetCandidate(
                source="poly_haven",
                source_asset_id=slug,
                name=info.get("name") or slug,
                category=info.get("category") or ", ".join(info.get("categories", [])) or "model",
                description=info.get("description") or "",
                source_url=f"https://polyhaven.com/a/{slug}",
                author=", ".join((info.get("authors") or {}).keys()) or "Poly Haven contributors",
                license="CC0-1.0",
                license_url="https://creativecommons.org/publicdomain/zero/1.0/",
                attribution_required=False,
                dimensions_mm=[float(v) for v in info.get("dimensions", [])],
                polycount=info.get("polycount"),
                preview_url=info.get("thumbnail_url"),
                source_format="gltf",
                downloadable=True,
                score=float(ranked.get("score") or 0.0),
                tags=list(info.get("tags") or []),
                technical={"files_hash": info.get("files_hash"), "download_count": info.get("download_count")},
            )
        )
    return candidates


def search_ambientcg(query: str, limit: int = 3, asset_type: str = "material") -> List[AssetCandidate]:
    limit = max(1, min(limit, 12))
    if asset_type not in {"material", "3d-model", "hdri"}:
        raise AssetPipelineError("ambientCG chỉ hỗ trợ material, 3d-model hoặc hdri trong adapter này")
    include = "type,title,url,tags,dimensions,downloads,previews,thumbnails,shortDescription"
    params = urllib.parse.urlencode({"type": asset_type, "q": query, "limit": limit, "include": include})
    payload = _safe_json_get(f"https://ambientcg.com/api/v3/assets?{params}")
    candidates: List[AssetCandidate] = []
    for item in payload.get("assets", [])[:limit]:
        asset_id = item.get("assetId") or item.get("id") or item.get("asset_id")
        if not asset_id:
            continue
        previews = item.get("previews") or []
        preview_url = previews[0].get("url") if previews and isinstance(previews[0], dict) else None
        candidates.append(
            AssetCandidate(
                source="ambientcg",
                source_asset_id=asset_id,
                name=item.get("title") or asset_id,
                category=item.get("type") or asset_type,
                description=item.get("shortDescription") or "",
                source_url=item.get("url") or f"https://ambientcg.com/a/{asset_id}",
                author="ambientCG",
                license="CC0-1.0",
                license_url="https://creativecommons.org/publicdomain/zero/1.0/",
                attribution_required=False,
                dimensions_mm=list(item.get("dimensions") or []),
                preview_url=preview_url,
                source_format="zip/pbr" if asset_type == "material" else "source package",
                downloadable=bool(item.get("downloads")),
                tags=list(item.get("tags") or []),
                technical={"downloads": item.get("downloads") or []},
            )
        )
    return candidates


def search_sketchfab(query: str, limit: int = 3) -> List[AssetCandidate]:
    limit = max(1, min(limit, 12))
    params = urllib.parse.urlencode(
        {"type": "models", "q": query, "downloadable": "true", "count": limit}
    )
    payload = _safe_json_get(f"https://api.sketchfab.com/v3/search?{params}")
    candidates: List[AssetCandidate] = []
    for item in payload.get("results", [])[:limit]:
        uid = item.get("uid")
        if not uid:
            continue
        thumbnails = (item.get("thumbnails") or {}).get("images") or []
        preview = max(thumbnails, key=lambda image: image.get("width", 0), default={}).get("url")
        user = item.get("user") or {}
        license_info = item.get("license") or {}
        archives = item.get("archives") or {}
        candidates.append(
            AssetCandidate(
                source="sketchfab",
                source_asset_id=uid,
                name=item.get("name") or uid,
                category=", ".join(c.get("name", "") for c in item.get("categories", [])) or "model",
                description=item.get("description") or "",
                source_url=item.get("viewerUrl") or f"https://sketchfab.com/models/{uid}",
                author=user.get("displayName") or user.get("username"),
                license=license_info.get("label"),
                license_url="https://sketchfab.com/licenses",
                attribution_required=True,
                polycount=item.get("faceCount"),
                vertex_count=item.get("vertexCount"),
                preview_url=preview,
                source_format="glb" if archives.get("glb") else "gltf",
                downloadable=bool(item.get("isDownloadable")),
                requires_user_oauth=True,
                tags=[tag.get("name", "") for tag in item.get("tags", []) if tag.get("name")],
                technical={"archives": archives, "user_profile": user.get("profileUrl")},
            )
        )
    return candidates


def search_assets(
    query: str,
    source: Literal["poly_haven", "ambientcg", "sketchfab"],
    limit: int = 3,
    asset_type: str = "3d-model",
) -> List[AssetCandidate]:
    if not query.strip():
        raise AssetPipelineError("Từ khóa tìm asset không được để trống")
    if source == "poly_haven":
        return search_poly_haven(query, limit)
    if source == "ambientcg":
        return search_ambientcg(query, limit, asset_type)
    return search_sketchfab(query, limit)


def _download_file(url: str, destination: Path, expected_md5: Optional[str] = None) -> Path:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_DOWNLOAD_HOSTS:
        raise AssetPipelineError(f"URL tải asset không được phép: {parsed.hostname or url}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.md5()  # Source APIs publish MD5 for transfer-integrity verification.
    total = 0
    temp_path = destination.with_suffix(destination.suffix + ".part")
    try:
        with urllib.request.urlopen(request, timeout=60) as response, temp_path.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_ASSET_BYTES:
                    raise AssetPipelineError("Asset vượt giới hạn 300 MB của pipeline hiện tại")
                digest.update(chunk)
                output.write(chunk)
        if expected_md5 and digest.hexdigest().lower() != expected_md5.lower():
            raise AssetPipelineError(f"Checksum MD5 không khớp cho {destination.name}")
        temp_path.replace(destination)
        return destination
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def _read_uri_bytes(base_dir: Path, uri: str) -> tuple[bytes, Optional[str]]:
    if uri.startswith("data:"):
        header, encoded = uri.split(",", 1)
        mime = header[5:].split(";", 1)[0] or None
        return base64.b64decode(encoded), mime
    path = (base_dir / urllib.parse.unquote(uri)).resolve()
    if base_dir.resolve() not in path.parents and path != base_dir.resolve():
        raise AssetPipelineError(f"Đường dẫn glTF vượt khỏi thư mục asset: {uri}")
    if not path.is_file():
        raise AssetPipelineError(f"Thiếu file tham chiếu trong glTF: {uri}")
    return path.read_bytes(), mimetypes.guess_type(path.name)[0]


def pack_gltf_to_glb(gltf_path: Path, output_glb: Path) -> Path:
    document = json.loads(gltf_path.read_text(encoding="utf-8"))
    if str((document.get("asset") or {}).get("version")) != "2.0":
        raise AssetPipelineError("Chỉ hỗ trợ glTF 2.0")

    base_dir = gltf_path.parent
    binary = bytearray()
    buffer_offsets: Dict[int, int] = {}
    for index, buffer_info in enumerate(document.get("buffers", [])):
        uri = buffer_info.get("uri")
        if not uri:
            raise AssetPipelineError("glTF nguồn không có URI buffer ngoài")
        while len(binary) % 4:
            binary.append(0)
        buffer_offsets[index] = len(binary)
        payload, _ = _read_uri_bytes(base_dir, uri)
        binary.extend(payload)

    for view in document.get("bufferViews", []):
        original_buffer = int(view.get("buffer", 0))
        view["byteOffset"] = buffer_offsets.get(original_buffer, 0) + int(view.get("byteOffset", 0))
        view["buffer"] = 0

    for image in document.get("images", []):
        uri = image.pop("uri", None)
        if not uri:
            continue
        while len(binary) % 4:
            binary.append(0)
        payload, detected_mime = _read_uri_bytes(base_dir, uri)
        view_index = len(document.setdefault("bufferViews", []))
        document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(payload)})
        binary.extend(payload)
        image["bufferView"] = view_index
        image["mimeType"] = image.get("mimeType") or detected_mime or "application/octet-stream"

    while len(binary) % 4:
        binary.append(0)
    document["buffers"] = [{"byteLength": len(binary)}]

    json_bytes = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4:
        json_bytes += b" "
    total_length = 12 + 8 + len(json_bytes) + (8 + len(binary) if binary else 0)
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    with output_glb.open("wb") as output:
        output.write(struct.pack("<4sII", b"glTF", 2, total_length))
        output.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        output.write(json_bytes)
        if binary:
            output.write(struct.pack("<I4s", len(binary), b"BIN\x00"))
            output.write(binary)
    return output_glb


def validate_glb(path: Path) -> Dict[str, Any]:
    issues: List[str] = []
    if not path.is_file():
        return {"valid": False, "issues": ["Không tìm thấy file GLB"]}
    size = path.stat().st_size
    if size < 20:
        return {"valid": False, "issues": ["File quá nhỏ để là GLB hợp lệ"]}
    with path.open("rb") as stream:
        try:
            magic, version, declared_length = struct.unpack("<4sII", stream.read(12))
        except struct.error:
            return {"valid": False, "issues": ["GLB header bị cắt ngắn"]}
        if magic != b"glTF":
            issues.append("Magic header không phải glTF")
        if version != 2:
            issues.append(f"Phiên bản GLB không được hỗ trợ: {version}")
        if declared_length != size:
            issues.append(f"Độ dài khai báo {declared_length} khác kích thước file {size}")
        try:
            json_length, json_type = struct.unpack("<I4s", stream.read(8))
        except struct.error:
            return {"valid": False, "issues": issues + ["GLB JSON chunk header bị cắt ngắn"]}
        if json_type != b"JSON":
            issues.append("Chunk đầu tiên không phải JSON")
            document: Dict[str, Any] = {}
        else:
            try:
                document = json.loads(stream.read(json_length).decode("utf-8").rstrip(" \t\r\n\x00"))
            except Exception as exc:
                issues.append(f"JSON chunk không đọc được: {exc}")
                document = {}

    asset_version = str((document.get("asset") or {}).get("version", ""))
    if asset_version != "2.0":
        issues.append("asset.version phải là 2.0")
    meshes = document.get("meshes") or []
    primitives = sum(len(mesh.get("primitives") or []) for mesh in meshes)
    if not meshes or primitives == 0:
        issues.append("GLB không chứa mesh primitive")
    materials = document.get("materials") or []
    accessors = document.get("accessors") or []
    position_accessors = []
    for mesh in meshes:
        for primitive in mesh.get("primitives") or []:
            position_index = (primitive.get("attributes") or {}).get("POSITION")
            if isinstance(position_index, int) and position_index < len(accessors):
                position_accessors.append(accessors[position_index])
    dimensions_mm: List[float] = []
    if position_accessors:
        mins = [min(float(acc.get("min", [0, 0, 0])[axis]) for acc in position_accessors) for axis in range(3)]
        maxs = [max(float(acc.get("max", [0, 0, 0])[axis]) for acc in position_accessors) for axis in range(3)]
        dimensions_mm = [round((maxs[0] - mins[0]) * 1000, 3), round((maxs[2] - mins[2]) * 1000, 3), round((maxs[1] - mins[1]) * 1000, 3)]

    return {
        "valid": not issues,
        "issues": issues,
        "file_size_bytes": size,
        "mesh_count": len(meshes),
        "primitive_count": primitives,
        "material_count": len(materials),
        "texture_count": len(document.get("textures") or []),
        "image_count": len(document.get("images") or []),
        "material_names": [material.get("name") or f"material_{index}" for index, material in enumerate(materials)],
        "dimensions_mm": dimensions_mm,
        "generator": (document.get("asset") or {}).get("generator"),
    }


def _geometry_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_asset_metadata(metadata: AssetMetadata, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    temp = directory / "metadata.json.tmp"
    temp.write_text(metadata.model_dump_json(indent=2), encoding="utf-8")
    temp.replace(directory / "metadata.json")


def _infer_semantic_part(name: str, total_slots: int) -> Optional[str]:
    if total_slots == 1:
        return "whole_asset"
    lowered = name.lower()
    if any(k in lowered for k in ("leg", "legs", "wood_leg")):
        return "wood_legs"
    if "wood" in lowered:
        return "wood"
    if any(k in lowered for k in ("base", "feet", "frame", "metal")):
        return "frame_base"
    if "fringe" in lowered:
        return "trim_fringe"
    if any(k in lowered for k in ("fabric", "pillow", "cushion", "upholstery", "velvet", "linen")):
        return "fabric"
    return "part"


def _build_material_slots_from_glb(glb_path: Path, fallback_names: List[str]) -> List[MaterialSlotDefinition]:
    from app.services.material_system import inspect_glb_material_structure

    try:
        audit = inspect_glb_material_structure(glb_path)
        active_names: List[str] = []
        for slot in audit.get("slots", []):
            sname = slot.get("source_material_name")
            if sname and sname != "UNASSIGNED" and sname not in active_names:
                active_names.append(sname)
        ordered_names = active_names if active_names else fallback_names
    except Exception:
        ordered_names = fallback_names

    total = len(ordered_names)
    return [
        MaterialSlotDefinition(
            slot_id=f"MAT_{index:02d}_{''.join(c if c.isalnum() else '_' for c in name).strip('_').upper() or 'MATERIAL'}",
            source_material_name=name,
            semantic_part=_infer_semantic_part(name, total),
            editable=True,
        )
        for index, name in enumerate(ordered_names)
    ]


def import_poly_haven_hdri(
    slug: str = "photo_studio_loft_hall",
    resolution: Literal["1k", "2k"] = "1k",
) -> Dict[str, Any]:
    safe_slug = "".join(char for char in slug if char.isalnum() or char in {"_", "-"})
    if not safe_slug or safe_slug != slug:
        raise AssetPipelineError("Poly Haven HDRI slug không hợp lệ")
    hdri_dir = ASSET_ROOT / "hdri" / f"{safe_slug}_{resolution}"
    hdr_path = hdri_dir / f"{safe_slug}_{resolution}.hdr"
    meta_path = hdri_dir / "metadata.json"
    if hdr_path.is_file() and meta_path.is_file():
        return json.loads(meta_path.read_text(encoding="utf-8"))

    info = _safe_json_get(f"https://api.polyhaven.com/info/{safe_slug}")
    files = _safe_json_get(f"https://api.polyhaven.com/files/{safe_slug}")
    hdr_entry = (((files.get("hdri") or {}).get(resolution) or {}).get("hdr"))
    if not hdr_entry:
        raise AssetPipelineError(f"HDRI {safe_slug} không có định dạng .hdr {resolution}")
    _download_file(hdr_entry["url"], hdr_path, hdr_entry.get("md5"))
    meta = {
        "hdri_id": f"hdri_ph_{safe_slug}_{resolution}",
        "slug": safe_slug,
        "resolution": resolution,
        "name": info.get("name") or safe_slug,
        "source": "poly_haven",
        "source_url": f"https://polyhaven.com/a/{safe_slug}",
        "author": ", ".join((info.get("authors") or {}).keys()) or "Poly Haven contributors",
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "file_path": str(hdr_path),
        "runtime_url": f"/api/v1/assets/hdri/{safe_slug}_{resolution}.hdr",
        "sha256": _geometry_sha256(hdr_path),
        "file_size_bytes": hdr_path.stat().st_size,
        "created_at": _utc_now(),
    }
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return meta


def import_poly_haven_model(
    slug: str,
    resolution: Literal["1k", "2k", "4k"] = "1k",
    category: str = "furniture",
    scene_object_id: Optional[str] = None,
) -> AssetMetadata:
    safe_slug = "".join(char for char in slug if char.isalnum() or char in {"_", "-"})
    if safe_slug != slug or not safe_slug:
        raise AssetPipelineError("Poly Haven asset slug không hợp lệ")
    info = _safe_json_get(f"https://api.polyhaven.com/info/{safe_slug}")
    files = _safe_json_get(f"https://api.polyhaven.com/files/{safe_slug}")
    gltf_entry = (((files.get("gltf") or {}).get(resolution) or {}).get("gltf"))
    if not gltf_entry:
        raise AssetPipelineError(f"Asset không có gói glTF {resolution}")

    cache_dir = ASSET_CACHE_DIR / "poly_haven" / safe_slug / resolution
    cache_dir.mkdir(parents=True, exist_ok=True)
    gltf_name = Path(urllib.parse.urlparse(gltf_entry["url"]).path).name
    gltf_path = _download_file(gltf_entry["url"], cache_dir / gltf_name, gltf_entry.get("md5"))
    for relative_name, include in (gltf_entry.get("include") or {}).items():
        _download_file(include["url"], cache_dir / relative_name, include.get("md5"))

    asset_id = f"asset_ph_{safe_slug.lower()}_{resolution}"
    asset_dir = ASSET_LIBRARY_DIR / asset_id
    normalized_path = asset_dir / "normalized.glb"
    pack_gltf_to_glb(gltf_path, normalized_path)
    validation = validate_glb(normalized_path)
    material_slots = _build_material_slots_from_glb(normalized_path, validation.get("material_names") or [])
    metadata = AssetMetadata(
        asset_id=asset_id,
        scene_object_id=scene_object_id,
        category=category,
        name=info.get("name") or safe_slug,
        source_type="poly_haven",
        source_url=f"https://polyhaven.com/a/{safe_slug}",
        author=", ".join((info.get("authors") or {}).keys()) or "Poly Haven contributors",
        license="CC0-1.0",
        license_url="https://creativecommons.org/publicdomain/zero/1.0/",
        attribution_required=False,
        source_format="gltf",
        normalized_glb=f"/api/v1/assets/{asset_id}/file",
        dimensions_mm=validation.get("dimensions_mm") or [float(v) for v in info.get("dimensions", [])],
        material_slots=material_slots,
        texture_refs=[image for image in (gltf_entry.get("include") or {}) if image.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))],
        geometry_hash=_geometry_sha256(normalized_path),
        validation_status="VALID" if validation["valid"] else "INVALID",
        validation_issues=validation["issues"],
        created_at=_utc_now(),
    )
    _write_asset_metadata(metadata, asset_dir)
    return metadata


def register_user_glb(
    source_path: Path,
    *,
    name: str,
    category: str,
    author: str,
    license_name: str,
    source_url: Optional[str] = None,
    scene_object_id: Optional[str] = None,
) -> AssetMetadata:
    if source_path.suffix.lower() != ".glb":
        raise AssetPipelineError("User Asset Library hiện chỉ nhận GLB runtime; không đổi đuôi file giả lập")
    validation = validate_glb(source_path)
    if not validation["valid"]:
        raise AssetPipelineError("GLB không hợp lệ: " + "; ".join(validation["issues"]))
    if not author.strip() or not license_name.strip():
        raise AssetPipelineError("Cần khai báo tác giả/chủ sở hữu và giấy phép sử dụng")
    geometry_hash = _geometry_sha256(source_path)
    asset_id = f"asset_user_{geometry_hash[:16]}"
    asset_dir = ASSET_LIBRARY_DIR / asset_id
    normalized_path = asset_dir / "normalized.glb"
    asset_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, normalized_path)
    metadata = AssetMetadata(
        asset_id=asset_id,
        scene_object_id=scene_object_id,
        category=category,
        name=name,
        source_type="user",
        source_url=source_url,
        author=author,
        license=license_name,
        source_format="glb",
        normalized_glb=f"/api/v1/assets/{asset_id}/file",
        dimensions_mm=validation.get("dimensions_mm") or [],
        material_slots=_build_material_slots_from_glb(normalized_path, validation.get("material_names") or []),
        geometry_hash=geometry_hash,
        validation_status="VALID",
        created_at=_utc_now(),
    )
    _write_asset_metadata(metadata, asset_dir)
    return metadata


def get_asset_metadata(asset_id: str) -> Optional[AssetMetadata]:
    safe_asset_id = "".join(char for char in asset_id if char.isalnum() or char in {"_", "-"})
    if not safe_asset_id or safe_asset_id != asset_id:
        return None
    path = ASSET_LIBRARY_DIR / asset_id / "metadata.json"
    if not path.is_file():
        return None
    return AssetMetadata.model_validate_json(path.read_text(encoding="utf-8"))


def list_registered_assets() -> List[AssetMetadata]:
    if not ASSET_LIBRARY_DIR.exists():
        return []
    assets: List[AssetMetadata] = []
    for path in sorted(ASSET_LIBRARY_DIR.glob("*/metadata.json")):
        try:
            assets.append(AssetMetadata.model_validate_json(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return assets


def asset_license_report() -> Dict[str, Any]:
    assets = list_registered_assets()
    incomplete = [
        asset.asset_id
        for asset in assets
        if not asset.source_url or not asset.author or not asset.license
    ]
    return {
        "generated_at": _utc_now(),
        "total_assets": len(assets),
        "complete_assets": len(assets) - len(incomplete),
        "incomplete_assets": incomplete,
        "status": "PASS" if not incomplete else "NEEDS_REVIEW",
    }

