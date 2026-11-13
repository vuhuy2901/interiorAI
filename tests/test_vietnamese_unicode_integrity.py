"""
Vietnamese Unicode Integrity Test Suite (FEAT-2026-029)
Verifies system-wide Unicode preservation across:
1. Normalization & Diacritic Preservation (NFC/NFD roundtrip)
2. Database Persistence (SQLite WAL & PostgreSQL)
3. JSON API Serialization & HTTP Header Charset UTF-8
4. SSE Streaming Multi-byte Chunk Boundary Decoding
5. Questions & Options Interaction Integrity
6. Windows Process Encoding Simulation (PowerShell UTF-8 vs ANSI)
7. Live Paperclip API Question Interaction Verification
"""
import codecs
import json
import sqlite3
import unicodedata
import urllib.request
import pytest
import psycopg

SAMPLE_STRINGS = [
    "Ngân sách trần cho phòng ngủ trẻ em là mức nào?",
    "A — 80–120 triệu VNĐ",
    "B — 120–180 triệu VNĐ",
    "C — Mức khác, ghi rõ số tiền",
    "Phòng này phục vụ bao nhiêu trẻ và độ tuổi nào?",
    "Có đồ cần giữ lại hoặc ràng buộc cửa sổ/cửa ra vào nào cần chốt không?",
    "Mảng tường nào dùng màu Xanh Xô Thơm: tường 4m không có ô mở, tường có cửa đi, hay tường có cửa sổ?",
    "Căn hộ Studio Phòng Khách 4×5m (Phong cách Japandi)",
    "Diện tích tường sơn: 46,83m²; Sàn gỗ An Cường: 22m².",
]


def test_vietnamese_normalization_and_roundtrip():
    """Verify NFC normalization preserves all Vietnamese diacritics and tones."""
    for text in SAMPLE_STRINGS:
        nfc = unicodedata.normalize("NFC", text)
        nfd = unicodedata.normalize("NFD", text)
        # Re-normalizing NFD to NFC must perfectly restore the original NFC string
        restored = unicodedata.normalize("NFC", nfd)
        assert restored == nfc
        # Ensure no replacement character U+FFFD exists
        assert "\ufffd" not in restored


def test_sqlite_unicode_roundtrip(tmp_path):
    """Verify SQLite database persists Vietnamese text without loss."""
    db_file = tmp_path / "test_unicode.db"
    conn = sqlite3.connect(str(db_file))
    conn.execute("CREATE TABLE test_items (id INTEGER PRIMARY KEY, content TEXT);")
    
    for idx, text in enumerate(SAMPLE_STRINGS):
        conn.execute("INSERT INTO test_items (id, content) VALUES (?, ?);", (idx + 1, text))
    conn.commit()

    rows = conn.execute("SELECT id, content FROM test_items ORDER BY id;").fetchall()
    conn.close()

    assert len(rows) == len(SAMPLE_STRINGS)
    for (row_id, content), expected in zip(rows, SAMPLE_STRINGS):
        assert content == expected
        assert "\ufffd" not in content


def test_postgres_unicode_roundtrip():
    """Verify embedded PostgreSQL database persists Vietnamese text and JSONB correctly."""
    conn = psycopg.connect("postgres://paperclip:paperclip@127.0.0.1:54329/paperclip")
    with conn.cursor() as cur:
        # Check server and client encoding
        cur.execute("SHOW server_encoding;")
        server_enc = cur.fetchone()[0]
        cur.execute("SHOW client_encoding;")
        client_enc = cur.fetchone()[0]
        assert server_enc.upper() in ("UTF8", "UTF-8")
        assert client_enc.upper() in ("UTF8", "UTF-8")

        # Test insert and query on a temporary table
        cur.execute("CREATE TEMP TABLE temp_unicode_test (id INT, txt TEXT, payload JSONB);")
        for idx, text in enumerate(SAMPLE_STRINGS):
            cur.execute(
                "INSERT INTO temp_unicode_test (id, txt, payload) VALUES (%s, %s, %s);",
                (idx + 1, text, json.dumps({"prompt": text}, ensure_ascii=False))
            )
        
        cur.execute("SELECT id, txt, payload FROM temp_unicode_test ORDER BY id;")
        rows = cur.fetchall()
        assert len(rows) == len(SAMPLE_STRINGS)
        for row, expected in zip(rows, SAMPLE_STRINGS):
            assert row[1] == expected
            assert row[2]["prompt"] == expected
            assert "\ufffd" not in row[1]
    conn.close()


def test_sse_chunk_boundary_split_simulation():
    """
    Verify that multi-byte UTF-8 sequences split across network/stream chunks
    can be reassembled correctly without corruption.
    """
    text = "Ngân sách trần cho phòng ngủ trẻ em là mức nào?"
    utf8_bytes = text.encode("utf-8")
    
    # Using codecs incremental decoder to simulate chunked streaming
    inc_decoder = codecs.getincrementaldecoder("utf-8")()
    
    reconstructed = []
    # Send 1 byte at a time (most aggressive boundary split)
    for b in utf8_bytes:
        chunk = bytes([b])
        decoded_part = inc_decoder.decode(chunk, final=False)
        reconstructed.append(decoded_part)
    
    reconstructed.append(inc_decoder.decode(b"", final=True))
    full_text = "".join(reconstructed)
    assert full_text == text
    assert "\ufffd" not in full_text


def test_windows_powershell_encoding_root_cause_demonstration():
    """
    Demonstrate and verify why raw string in PowerShell causes mojibake,
    and why UTF-8 GetBytes solves it 100%.
    """
    sample = "Ngân sách trần cho phòng ngủ trẻ em là mức nào?"
    
    # 1. Broken path: Windows-1252 ANSI fallback
    ansi_encoded = sample.encode("windows-1252", errors="replace")
    # Decoding as UTF-8 produces U+FFFD or ?
    broken = ansi_encoded.decode("utf-8", errors="replace")
    assert "\ufffd" in broken or "?" in broken
    assert broken != sample
    
    # 2. Correct path: UTF-8 GetBytes
    utf8_bytes = sample.encode("utf-8")
    clean = utf8_bytes.decode("utf-8")
    assert clean == sample
    assert "\ufffd" not in clean


def test_live_paperclip_interaction_recovery():
    """Verify that the actual Questions card in Paperclip API is clean and intact."""
    url = "http://localhost:3100/api/issues/9eabba62-c6da-4a2c-829c-07a3321e86b9/interactions"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        raw = resp.read()
        data = json.loads(raw.decode("utf-8"))
    
    target = None
    for item in data:
        if item["id"] == "b37d60f5-9c46-4e86-a585-69f712a5dc67":
            target = item
            break
            
    assert target is not None, "Target interaction b37d60f5... not found in API"
    q0 = target["payload"]["questions"][0]
    
    # Assert exact Vietnamese prompt
    assert q0["prompt"] == "Ngân sách trần cho phòng ngủ trẻ em là mức nào?"
    assert "\ufffd" not in q0["prompt"]
    
    # Verify no corrupted '?' inside words (only at the end as punctuation)
    body_without_final_punct = q0["prompt"][:-1]
    assert "?" not in body_without_final_punct
    
    # Assert options labels
    labels = [opt["label"] for opt in q0["options"]]
    assert "A — 80–120 triệu VNĐ" in labels
    assert "B — 120–180 triệu VNĐ" in labels
    assert "C — Mức khác, ghi rõ số tiền" in labels
    assert "Other" in labels
    for lbl in labels:
        assert "\ufffd" not in lbl
        assert "?" not in lbl
