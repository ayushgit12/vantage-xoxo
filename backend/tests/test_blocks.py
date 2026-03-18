"""Tests for block status update helpers."""

from api.routers.blocks import _apply_block_status
from shared.models import BlockStatus


def test_apply_block_status_updates_matching_block():
    plan_doc = {
        "plan_id": "p1",
        "micro_blocks": [
            {"block_id": "b1", "status": "scheduled"},
            {"block_id": "b2", "status": "scheduled"},
        ],
    }

    changed = _apply_block_status(plan_doc, "b2", BlockStatus.DONE)

    assert changed is True
    assert plan_doc["micro_blocks"][1]["status"] == BlockStatus.DONE


def test_apply_block_status_returns_false_when_missing():
    plan_doc = {"plan_id": "p1", "micro_blocks": [{"block_id": "b1", "status": "scheduled"}]}

    changed = _apply_block_status(plan_doc, "missing", BlockStatus.MISSED)

    assert changed is False
    assert plan_doc["micro_blocks"][0]["status"] == "scheduled"