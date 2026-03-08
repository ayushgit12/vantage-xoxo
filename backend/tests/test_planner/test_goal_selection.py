from agents.planner.agent import _is_schedulable_goal


def test_only_active_goals_are_schedulable():
    assert _is_schedulable_goal({"status": "active"}) is True
    assert _is_schedulable_goal({"status": "paused"}) is False
    assert _is_schedulable_goal({"status": "completed"}) is False
    assert _is_schedulable_goal({"status": "archived"}) is False


def test_missing_status_defaults_to_schedulable_for_legacy_docs():
    assert _is_schedulable_goal({}) is True
