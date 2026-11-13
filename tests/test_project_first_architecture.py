from pathlib import Path

import pytest

from apps.api.app import db


@pytest.fixture()
def isolated_atelier_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "atelier-project-first.db")
    db.init_db()
    return db


def test_native_project_workspaces_isolate_scenes_and_preserve_revisions(isolated_atelier_db):
    store = isolated_atelier_db
    scene_id = "proj_demo_4x5m"
    revision_count_before = len(store.get_project_revisions(scene_id))

    project_a = store.initialize_native_project_link(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Căn hộ Japandi 80 m²",
        "Thiết kế căn hộ 80 m², 2 phòng ngủ, phong cách Japandi.",
        "issue-a",
    )
    project_b = store.initialize_native_project_link(
        "22222222-2222-2222-2222-222222222222",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Nhà phố Modern",
        "Thiết kế nhà phố phong cách Modern.",
        "issue-b",
    )
    assert project_a.scenes == []
    assert project_b.scenes == []

    room_a = store.create_atelier_room(project_a.native_project_id, "Phòng khách", "living")
    linked = store.link_scene_to_native_project(
        project_a.native_project_id,
        scene_id,
        room_id=room_a.room_id,
        provenance="legacy",
    )
    assert linked.native_project_id == project_a.native_project_id
    assert linked.room_id == room_a.room_id
    assert [scene.scene_id for scene in store.get_native_project_workspace(project_a.native_project_id).scenes] == [scene_id]
    assert store.get_native_project_workspace(project_b.native_project_id).scenes == []

    with pytest.raises(ValueError, match="Room does not belong"):
        store.link_scene_to_native_project(
            project_b.native_project_id,
            scene_id,
            room_id=room_a.room_id,
        )

    store.link_scene_to_native_project(project_b.native_project_id, scene_id, provenance="legacy")
    assert store.get_native_project_workspace(project_a.native_project_id).scenes == []
    assert [scene.scene_id for scene in store.get_native_project_workspace(project_b.native_project_id).scenes] == [scene_id]
    assert len(store.get_project_revisions(scene_id)) == revision_count_before


def test_initialization_is_idempotent_and_legacy_audit_is_non_destructive(isolated_atelier_db):
    store = isolated_atelier_db
    native_id = "33333333-3333-3333-3333-333333333333"
    first = store.initialize_native_project_link(
        native_id,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Căn hộ Japandi",
        "Brief đầu tiên",
        "issue-1",
    )
    second = store.initialize_native_project_link(
        native_id,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "Căn hộ Japandi 80 m²",
        "Brief đầu tiên",
        "issue-1",
    )
    assert second.native_project_id == first.native_project_id
    assert second.project_name == "Căn hộ Japandi 80 m²"

    revisions_before = len(store.get_project_revisions("proj_demo_4x5m"))
    audit = store.audit_legacy_scenes()
    assert audit["total_scenes"] >= 1
    assert audit["unassigned_scenes"] >= 1
    assert "proj_demo_4x5m" in audit["unknown_provenance_scene_ids"]
    assert len(store.get_project_revisions("proj_demo_4x5m")) == revisions_before

    with pytest.raises(ValueError, match="another company"):
        store.initialize_native_project_link(
            native_id,
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "Sai company",
        )


def test_fixture_projects_can_be_excluded_without_deleting_data(isolated_atelier_db):
    store = isolated_atelier_db
    baseline = store.get_project("proj_demo_4x5m")
    assert baseline is not None

    fixture = baseline.model_copy(deep=True)
    fixture.project_id = "proj_e2e_filter_test"
    fixture.name = "Căn hộ 2 Khu Thảo Điền E2E (verification)"
    store.save_project(fixture, author="Test", reason="Fixture classification", bump_revision=False)

    acceptance = baseline.model_copy(deep=True)
    acceptance.project_id = "proj_acceptance_filter_test"
    acceptance.name = "Căn Hộ Japandi — Real Acceptance"
    store.save_project(acceptance, author="Test", reason="Fixture classification", bump_revision=False)

    all_ids = {project.project_id for project in store.list_projects(include_fixtures=True)}
    visible_ids = {project.project_id for project in store.list_projects(include_fixtures=False)}

    assert {fixture.project_id, acceptance.project_id}.issubset(all_ids)
    assert fixture.project_id not in visible_ids
    assert acceptance.project_id not in visible_ids
    assert "proj_demo_4x5m" in visible_ids
    assert store.get_project(fixture.project_id) is not None
