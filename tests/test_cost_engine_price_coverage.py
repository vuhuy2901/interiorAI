"""Regression tests for honest handling of unpriced furniture in estimates."""
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app import db
from app.services.cost_engine import calculate_project_estimate


def test_unpriced_furniture_is_reported_as_unknown_not_free():
    project = db.build_japandi_master_bedroom_project()
    unknown = project.furniture_instances[0].model_copy(
        update={"id": "bench_unpriced", "name": "Bench chưa chốt giá", "price_vnd": 0, "source_url": None}
    )
    project.furniture_instances.append(unknown)

    estimate = calculate_project_estimate(project)
    line = next(item for item in estimate.lines if item.id == "line_furn_bench_unpriced")

    assert line.price_status == "unknown"
    assert line.source_label == "CHƯA CÓ GIÁ"
    assert "không phải là đồ miễn phí" in line.formula_explanation
    assert estimate.unpriced_item_ids == ["bench_unpriced"]
    assert estimate.unpriced_line_count == 1
    assert estimate.total_is_complete is False
    assert estimate.budget_status == "incomplete"
    assert "bench_unpriced" in estimate.disclaimer


def test_estimate_is_complete_when_all_furniture_has_a_price():
    estimate = calculate_project_estimate(db.build_japandi_master_bedroom_project())

    assert estimate.unpriced_item_ids == []
    assert estimate.unpriced_line_count == 0
    assert estimate.total_is_complete is True
    assert estimate.price_coverage_percent == 100.0
    assert estimate.budget_status in {"within_budget", "over_budget"}
