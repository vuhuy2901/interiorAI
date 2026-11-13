import json
import os
import sys
from pathlib import Path
import urllib.request
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

COMPANY_ID = "b2e1c8a5-c3c9-412c-99cb-63180c4015dc"
SKILL_SLUG = "atelier-ai-window-opening-recognition"


def test_skill_markdown_file_and_frontmatter():
    skill_path = (
        ROOT_DIR
        / "paperclip"
        / "packages"
        / "skills-catalog"
        / "catalog"
        / "bundled"
        / "interior-design"
        / SKILL_SLUG
        / "SKILL.md"
    )
    assert skill_path.exists(), f"SKILL.md does not exist at {skill_path}"
    content = skill_path.read_text(encoding="utf-8")
    assert "name: atelier-ai-window-opening-recognition" in content
    assert "version: 1.0.0" in content
    assert "language: vi" in content
    assert "## 1. Mục tiêu" in content
    assert "## 2. Thứ tự xử lý dữ liệu" in content
    assert "## 3. Nhận diện đối tượng theo ngữ cảnh, không theo chữ" in content
    assert "## 4. Hiệu chuẩn tỷ lệ và đo kích thước" in content
    assert "## 5. Quy trình bắt buộc cho agent" in content
    assert "## 6. Hợp đồng kết quả tối thiểu" in content
    assert "## 7. Bài kiểm thử tham chiếu: ảnh REGA người dùng cung cấp" in content
    assert "## 8. Checklist chấp nhận tính năng" in content
    assert "## 9. Phân công triển khai nếu ATELIER AI chạy trong hệ thống đa-agent" in content


def test_catalog_json_entry():
    catalog_path = (
        ROOT_DIR
        / "paperclip"
        / "packages"
        / "skills-catalog"
        / "generated"
        / "catalog.json"
    )
    assert catalog_path.exists(), "catalog.json does not exist"
    data = json.loads(catalog_path.read_text(encoding="utf-8"))
    skills = data.get("skills", [])
    assert len(skills) >= 42, f"Expected at least 42 skills in catalog, got {len(skills)}"
    
    matching = [s for s in skills if s.get("slug") == SKILL_SLUG]
    assert len(matching) == 1, f"Expected 1 entry for {SKILL_SLUG}, found {len(matching)}"
    entry = matching[0]
    assert entry["category"] == "interior-design"
    assert entry["kind"] == "bundled"
    assert entry["entrypoint"] == "SKILL.md"
    assert entry["contentHash"].startswith("sha256:")
    assert len(entry["files"]) >= 1


def test_live_paperclip_company_skills():
    url = f"http://127.0.0.1:3100/api/companies/{COMPANY_ID}/skills"
    try:
        with urllib.request.urlopen(url, timeout=5) as res:
            assert res.status == 200
            skills = json.loads(res.read().decode("utf-8"))
            slugs = [s.get("slug") for s in skills]
            assert SKILL_SLUG in slugs, f"{SKILL_SLUG} not found in live company skills"
    except Exception as e:
        pytest.fail(f"Failed to query live company skills: {e}")


def test_agent_skill_assignment_live():
    url = f"http://127.0.0.1:3100/api/companies/{COMPANY_ID}/agents"
    try:
        with urllib.request.urlopen(url, timeout=5) as res:
            assert res.status == 200
            agents = json.loads(res.read().decode("utf-8"))
            target_agents = {
                "Floor Plan Specialist",
                "Geometry & BIM Specialist",
                "QA & Validation Specialist",
                "Chief Architect (Kiến Trúc Sư Trưởng)",
            }
            found_count = 0
            for a in agents:
                name = a.get("name")
                if name in target_agents:
                    assigned = a.get("metadata", {}).get("assignedSkills", [])
                    assert SKILL_SLUG in assigned, f"{name} does not have {SKILL_SLUG} assigned"
                    found_count += 1
            assert found_count == len(target_agents), f"Expected {len(target_agents)} agents, checked {found_count}"
    except Exception as e:
        pytest.fail(f"Failed to verify live agent assignments: {e}")


def test_python_agent_prompts_registry():
    from app.services.agent_prompts import ADVANCED_INTERIOR_DESIGN_SKILLS
    assert SKILL_SLUG in ADVANCED_INTERIOR_DESIGN_SKILLS
    spec = ADVANCED_INTERIOR_DESIGN_SKILLS[SKILL_SLUG]
    assert spec["slug"] == SKILL_SLUG
    assert "Nhận Diện Cửa Sổ" in spec["name_vi"]
    assert "agent_floorplan" in spec["primary_agents"]
    assert "agent_geometry" in spec["primary_agents"]
