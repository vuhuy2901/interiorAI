#!/usr/bin/env python3
"""
FurniMesh MCP Server (Model Context Protocol stdio)
Exposes 4 tools for AI Agents (Pascal, Claude, Antigravity):
1. search_furniture
2. download_model
3. list_categories
4. get_model
"""

import sys
import os
import json
import sqlite3
import urllib.request
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data", "furnimesh")
DB_PATH = os.path.join(DATA_DIR, "catalog.db")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")
DOWNLOADS_DIR = os.path.join(DATA_DIR, "downloads")

# Basic Vietnamese to English keywords mapping for interior design
VI_TO_EN_MAP = {
    "sofa": "sofa",
    "ghe": "chair",
    "ghế": "chair",
    "ban": "table",
    "bàn": "table",
    "giuong": "bed",
    "giường": "bed",
    "den": "lamp",
    "đèn": "lamp",
    "tu": "cabinet",
    "tủ": "cabinet",
    "ke": "shelf",
    "kệ": "shelf",
    "guong": "mirror",
    "gương": "mirror",
    "xam": "grey",
    "xám": "grey",
    "trang": "white",
    "trắng": "white",
    "den_mau": "black",
    "đen": "black",
    "go": "wood",
    "gỗ": "wood",
    "da": "leather",
    "nhung": "velvet",
    "vai": "fabric",
    "vải": "fabric",
    "hien_dai": "modern",
    "hiện đại": "modern",
    "don_gian": "minimalist",
    "đơn giản": "minimalist",
    "tron": "round",
    "tròn": "round",
}

def translate_query(query: str) -> str:
    words = query.lower().split()
    translated = []
    for w in words:
        clean = re.sub(r'[^a-zA-Z0-9\u00C0-\u1EF9]', '', w)
        if clean in VI_TO_EN_MAP:
            translated.append(VI_TO_EN_MAP[clean])
        else:
            translated.append(w)
    return " ".join(translated)

def get_db():
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Catalog database not found at {DB_PATH}. Run crawler.py first.")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ----------------- Tool Implementations -----------------

def tool_search_furniture(query: str, category: str = None, limit: int = 10) -> list:
    limit = max(1, min(int(limit or 10), 50))
    query_str = (query or "").strip()
    translated_q = translate_query(query_str) if query_str else ""
    
    conn = get_db()
    cur = conn.cursor()
    results = []
    seen_ids = set()

    # 1. Try FTS search with translated and raw keywords
    search_terms = list(dict.fromkeys([t for t in (query_str.split() + translated_q.split()) if len(t) > 1]))
    if search_terms:
        fts_query = " OR ".join([f'"{term}"*' for term in search_terms])
        sql = """
            SELECT m.id, m.slug, m.name, m.parent_category, m.sub_category, m.thumbnail_url, m.glb_url, m.obj_url, m.description
            FROM models m
            JOIN models_fts f ON m.rowid = f.rowid
            WHERE models_fts MATCH ?
        """
        params = [fts_query]
        if category:
            sql += " AND (m.parent_category = ? OR m.sub_category = ?)"
            params.extend([category.lower(), category.lower()])
        sql += f" ORDER BY m.download_count DESC, m.view_count DESC LIMIT {limit}"
        
        try:
            cur.execute(sql, params)
            for row in cur.fetchall():
                if row["id"] not in seen_ids:
                    seen_ids.add(row["id"])
                    results.append({
                        "id": row["id"],
                        "name": row["name"],
                        "category": row["parent_category"],
                        "sub_category": row["sub_category"],
                        "thumbnail": row["thumbnail_url"],
                        "glb_url": row["glb_url"],
                        "obj_url": row["obj_url"],
                        "description": (row["description"] or "")[:150] + "...",
                    })
        except Exception:
            pass

    # 2. Fallback / supplement with LIKE query if results < limit
    if len(results) < limit:
        needed = limit - len(results)
        like_sql = """
            SELECT id, slug, name, parent_category, sub_category, thumbnail_url, glb_url, obj_url, description
            FROM models
            WHERE 1=1
        """
        like_params = []
        if category:
            like_sql += " AND (parent_category = ? OR sub_category = ?)"
            like_params.extend([category.lower(), category.lower()])
        if query_str:
            like_sql += " AND (name LIKE ? OR description LIKE ?)"
            pattern = f"%{translated_q or query_str}%"
            like_params.extend([pattern, pattern])
        
        like_sql += f" ORDER BY download_count DESC LIMIT {needed}"
        cur.execute(like_sql, like_params)
        for row in cur.fetchall():
            if row["id"] not in seen_ids:
                seen_ids.add(row["id"])
                results.append({
                    "id": row["id"],
                    "name": row["name"],
                    "category": row["parent_category"],
                    "sub_category": row["sub_category"],
                    "thumbnail": row["thumbnail_url"],
                    "glb_url": row["glb_url"],
                    "obj_url": row["obj_url"],
                    "description": (row["description"] or "")[:150] + "...",
                })

    conn.close()
    return results

def tool_download_model(glb_url: str, output_path: str = None) -> dict:
    if not glb_url:
        return {"success": False, "error": "glb_url is required"}

    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    if not output_path:
        filename = glb_url.rstrip("/").split("/")[-1]
        if not filename.endswith(".glb"):
            filename += ".glb"
        output_path = os.path.join(DOWNLOADS_DIR, filename)

    output_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(output_dir, exist_ok=True)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
    }
    req = urllib.request.Request(glb_url, headers=headers)
    
    with urllib.request.urlopen(req, timeout=60) as resp:
        content = resp.read()
        with open(output_path, "wb") as f:
            f.write(content)

    file_size = os.path.getsize(output_path)
    return {
        "success": True,
        "file_size": file_size,
        "file_size_mb": round(file_size / (1024 * 1024), 2),
        "local_path": os.path.abspath(output_path)
    }

def tool_list_categories() -> dict:
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT parent_category, sub_category, COUNT(*) as count
        FROM models
        WHERE parent_category != ''
        GROUP BY parent_category, sub_category
        ORDER BY parent_category, count DESC
    """)
    rows = cur.fetchall()
    
    categories = {}
    for r in rows:
        cat = r["parent_category"]
        sub = r["sub_category"]
        cnt = r["count"]
        if cat not in categories:
            categories[cat] = {"total_models": 0, "subcategories": {}}
        categories[cat]["total_models"] += cnt
        if sub:
            categories[cat]["subcategories"][sub] = cnt

    conn.close()
    return {
        "total_categories": len(categories),
        "categories": categories
    }

def tool_get_model(model_id: str) -> dict:
    if not model_id:
        return {"error": "model_id is required"}

    conn = get_db()
    cur = conn.cursor()
    
    # Try exact id match, then slug match, then suffix match
    cur.execute("SELECT * FROM models WHERE id = ?", (model_id,))
    row = cur.fetchone()
    if not row:
        cur.execute("SELECT * FROM models WHERE slug = ? OR slug LIKE ?", (model_id, f"%{model_id}%"))
        row = cur.fetchone()

    conn.close()
    if not row:
        return {"error": f"Model with ID/slug '{model_id}' not found."}

    raw = json.loads(row["raw_json"]) if row["raw_json"] else {}
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "description": row["description"],
        "parent_category": row["parent_category"],
        "sub_category": row["sub_category"],
        "thumbnail_url": row["thumbnail_url"],
        "glb_url": row["glb_url"],
        "obj_url": row["obj_url"],
        "skp_url": row["skp_url"],
        "blend_url": row["blend_url"],
        "has_textures": bool(row["has_textures"]),
        "view_count": row["view_count"],
        "download_count": row["download_count"],
        "like_count": row["like_count"],
        "preview_renders": raw.get("previewRenders", {})
    }

# ----------------- MCP Protocol Engine -----------------

TOOLS_MANIFEST = [
    {
        "name": "search_furniture",
        "description": "Tìm kiếm các mô hình 3D đồ nội thất từ thư viện FurniMesh theo tên, mô tả hoặc danh mục. Trả về danh sách model gồm ID, tên, thumbnail, GLB direct URL và OBJ URL.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Từ khóa tìm kiếm (VD: 'modern sofa', 'sofa màu xám', 'round dining table', 'armchair')"
                },
                "category": {
                    "type": "string",
                    "description": "Lọc theo danh mục (VD: 'sofas', 'seating', 'tables', 'beds', 'lighting', 'storage', 'decor')"
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Số lượng kết quả tối đa (mặc định: 10, tối đa: 50)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "download_model",
        "description": "Tải file 3D (.glb) của mô hình từ FurniMesh về thư mục cục bộ cho máy trạm hoặc Pascal Studio.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "glb_url": {
                    "type": "string",
                    "description": "Đường dẫn direct download file GLB (từ storage.googleapis.com/...)"
                },
                "output_path": {
                    "type": "string",
                    "description": "Đường dẫn lưu file trên máy trạm (VD: './data/furnimesh/downloads/sofa.glb'). Nếu bỏ trống sẽ tự đặt tên theo file gốc."
                }
            },
            "required": ["glb_url"]
        }
    },
    {
        "name": "list_categories",
        "description": "Liệt kê danh sách các danh mục và danh mục con đồ nội thất có trong thư viện FurniMesh kèm số lượng model.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_model",
        "description": "Lấy toàn bộ thông tin chi tiết (metadata, render góc nhìn clay/normal/shaded, link OBJ/SKP/BLEND) của một mô hình theo ID hoặc Slug.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "ID hoặc slug của model (VD: 'cmw1z24ds0nf8w269e4ukk68h' hoặc 'ukk68h')"
                }
            },
            "required": ["id"]
        }
    }
]

def handle_call_tool(name: str, arguments: dict):
    if name == "search_furniture":
        return tool_search_furniture(
            query=arguments.get("query", ""),
            category=arguments.get("category"),
            limit=arguments.get("limit", 10)
        )
    elif name == "download_model":
        return tool_download_model(
            glb_url=arguments.get("glb_url", ""),
            output_path=arguments.get("output_path")
        )
    elif name == "list_categories":
        return tool_list_categories()
    elif name == "get_model":
        return tool_get_model(
            model_id=arguments.get("id", "")
        )
    else:
        raise ValueError(f"Unknown tool: {name}")

def serve_stdio():
    sys.stderr.write("FurniMesh MCP Server running on stdio...\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "furnimesh-mcp-server",
                        "version": "1.0.0"
                    }
                }
            }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        elif method == "notifications/initialized":
            pass

        elif method == "tools/list":
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": TOOLS_MANIFEST
                }
            }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        elif method == "tools/call":
            tool_name = params.get("name")
            args = params.get("arguments", {})
            try:
                result_data = handle_call_tool(tool_name, args)
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result_data, ensure_ascii=False, indent=2)
                            }
                        ]
                    }
                }
            except Exception as e:
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32603,
                        "message": str(e)
                    }
                }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        elif method == "ping":
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {}}) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    serve_stdio()
