#!/usr/bin/env python3
"""
FurniMesh 3D Furniture Library Crawler
Extracts hand-curated 3D furniture models from furnimesh.com into:
- data/furnimesh/index.json (full catalog)
- data/furnimesh/by-category/<category>.json
- data/furnimesh/catalog.db (SQLite with Full-Text Search FTS5)
"""

import os
import sys
import time
import json
import sqlite3
import argparse
import urllib.request
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "furnimesh")
BY_CAT_DIR = os.path.join(OUTPUT_DIR, "by-category")
INDEX_FILE = os.path.join(OUTPUT_DIR, "index.json")
DB_FILE = os.path.join(OUTPUT_DIR, "catalog.db")
CHECKPOINT_FILE = os.path.join(OUTPUT_DIR, "checkpoint.json")

def init_db(db_path: str):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            slug TEXT,
            name TEXT,
            description TEXT,
            parent_category TEXT,
            sub_category TEXT,
            thumbnail_url TEXT,
            glb_url TEXT,
            obj_url TEXT,
            skp_url TEXT,
            blend_url TEXT,
            has_textures INTEGER,
            view_count INTEGER,
            download_count INTEGER,
            like_count INTEGER,
            raw_json TEXT
        )
    """)
    # Full-text search index
    cur.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
            id UNINDEXED,
            name,
            description,
            parent_category,
            sub_category,
            content='models',
            content_rowid='rowid'
        )
    """)
    # Triggers to keep FTS in sync
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS models_ai AFTER INSERT ON models BEGIN
            INSERT INTO models_fts(rowid, id, name, description, parent_category, sub_category)
            VALUES (new.rowid, new.id, new.name, new.description, new.parent_category, new.sub_category);
        END;
    """)
    conn.commit()
    return conn

def parse_models_from_html(html: str):
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.DOTALL)
    if not chunks:
        return []
    full_stream = "".join(chunks).replace('\\"', '"').replace('\\\\', '\\')
    
    idx = full_stream.find('"initialCards":')
    if idx == -1:
        return []
    
    start = idx + len('"initialCards":')
    decoder = json.JSONDecoder()
    try:
        cards, _ = decoder.raw_decode(full_stream, start)
        return cards
    except Exception as e:
        print(f"  [Warning] JSON decode failed for initialCards: {e}")
        return []

def normalize_model(item: dict) -> dict:
    mid = item.get("id") or ""
    # In FurniMesh Next.js stream, 'category' is usually the human title e.g. "Curved Upholstered Sofa"
    name = item.get("category") or item.get("slug") or mid
    parent_cat = (item.get("parentCategory") or "").lower()
    sub_cat = (item.get("subcategorySlug") or item.get("subcategory") or "").lower()
    thumb = item.get("mainImage")
    if not thumb and item.get("originalUrls"):
        thumb = item["originalUrls"][0]

    return {
        "id": mid,
        "slug": item.get("slug", ""),
        "name": name,
        "description": item.get("description", ""),
        "parent_category": parent_cat,
        "sub_category": sub_cat,
        "thumbnail_url": thumb or "",
        "glb_url": item.get("glb3D") or "",
        "obj_url": item.get("obj3D") or "",
        "skp_url": item.get("skp3D") or "",
        "blend_url": item.get("blend3D") or "",
        "has_textures": bool(item.get("hasTextures", True)),
        "view_count": int(item.get("viewCount") or 0),
        "download_count": int(item.get("downloadCount") or 0),
        "like_count": int(item.get("likeCount") or 0),
        "preview_renders": item.get("previewRenders", {}),
    }

def fetch_page(page_num: int, base_path: str = "/library/", timeout: int = 20):
    url = f"https://furnimesh.com{base_path}?page={page_num}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", errors="ignore")

def crawl(max_pages: int = 50, start_page: int = 1, delay: float = 0.5, category_path: str = "/library/"):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(BY_CAT_DIR, exist_ok=True)
    conn = init_db(DB_FILE)
    cur = conn.cursor()

    existing_models = {}
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for m in data:
                    existing_models[m["id"]] = m
            print(f"[Init] Loaded {len(existing_models)} existing models from {INDEX_FILE}")
        except Exception:
            pass

    page = start_page
    consecutive_empty = 0
    total_added = 0

    print(f"[Crawl] Starting crawl on {category_path} (from page {page} to {max_pages if max_pages > 0 else 'END'})...")

    while True:
        if max_pages > 0 and page > max_pages:
            print(f"[Crawl] Reached page limit {max_pages}. Stopping.")
            break

        print(f"Fetching page {page}...", end=" ", flush=True)
        try:
            html = fetch_page(page, base_path=category_path)
            raw_cards = parse_models_from_html(html)
            if not raw_cards:
                print("No models found on page.")
                consecutive_empty += 1
                if consecutive_empty >= 3:
                    print("[Crawl] 3 consecutive empty pages. Crawl completed.")
                    break
                page += 1
                time.sleep(delay)
                continue

            consecutive_empty = 0
            page_added = 0
            for raw in raw_cards:
                norm = normalize_model(raw)
                if not norm["id"]:
                    continue
                mid = norm["id"]
                is_new = mid not in existing_models
                existing_models[mid] = norm
                if is_new:
                    page_added += 1
                    # Insert into SQLite
                    cur.execute("""
                        INSERT OR REPLACE INTO models (
                            id, slug, name, description, parent_category, sub_category,
                            thumbnail_url, glb_url, obj_url, skp_url, blend_url,
                            has_textures, view_count, download_count, like_count, raw_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        norm["id"], norm["slug"], norm["name"], norm["description"],
                        norm["parent_category"], norm["sub_category"], norm["thumbnail_url"],
                        norm["glb_url"], norm["obj_url"], norm["skp_url"], norm["blend_url"],
                        1 if norm["has_textures"] else 0, norm["view_count"], norm["download_count"],
                        norm["like_count"], json.dumps(raw, ensure_ascii=False)
                    ))

            conn.commit()
            total_added += page_added
            print(f"Extracted {len(raw_cards)} models ({page_added} new). Total indexed: {len(existing_models)}")

            # Save checkpoint every 5 pages
            if page % 5 == 0:
                save_index_and_categories(existing_models)

            page += 1
            time.sleep(delay)

        except Exception as e:
            print(f"\n[Error on page {page}]: {e}")
            time.sleep(delay * 2)
            page += 1

    # Final save
    save_index_and_categories(existing_models)
    conn.close()
    print(f"\n[Done] Crawl finished. Total catalog size: {len(existing_models)} models. Database saved to {DB_FILE}")

def save_index_and_categories(models_dict: dict):
    model_list = list(models_dict.values())
    # Save full index
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(model_list, f, ensure_ascii=False, indent=2)

    # Save by category
    by_cat = {}
    for m in model_list:
        cat = m.get("parent_category") or "uncategorized"
        by_cat.setdefault(cat, []).append(m)

    for cat, items in by_cat.items():
        cat_file = os.path.join(BY_CAT_DIR, f"{cat}.json")
        with open(cat_file, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)

def main():
    parser = argparse.ArgumentParser(description="FurniMesh 3D Model Crawler")
    parser.add_argument("--max-pages", type=int, default=10, help="Maximum number of pages to crawl (default: 10, set 0 for all)")
    parser.add_argument("--start-page", type=int, default=1, help="Starting page number (default: 1)")
    parser.add_argument("--delay", type=float, default=0.4, help="Delay in seconds between requests (default: 0.4)")
    parser.add_argument("--category", type=str, default="/library/", help="Base category path, e.g. /library/ or /library/sofas/sofa/")
    args = parser.parse_args()

    crawl(max_pages=args.max_pages, start_page=args.start_page, delay=args.delay, category_path=args.category)

if __name__ == "__main__":
    main()
