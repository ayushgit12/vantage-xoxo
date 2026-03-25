"""Deterministic planner quality scoring.

Scoring is intentionally heuristic and reproducible. It does not call LLMs.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from shared.models import Plan, PlannerQualityScore


def _ensure_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _score_feasibility(plan: Plan) -> float:
    blocks = sorted(plan.micro_blocks, key=lambda b: b.start_dt)
    if not blocks:
        return 0.0

    overlaps = 0
    for i in range(1, len(blocks)):
        prev = blocks[i - 1]
        current = blocks[i]
        prev_end = prev.start_dt.timestamp() + (prev.duration_min * 60)
        if prev_end > current.start_dt.timestamp():
            overlaps += 1

    ratio = overlaps / max(1, len(blocks) - 1)
    return max(0.0, 100.0 - (ratio * 100.0))


def _score_load_balance(plan: Plan) -> float:
    if not plan.micro_blocks:
        return 0.0

    minutes_by_day: dict[str, int] = defaultdict(int)
    for b in plan.micro_blocks:
        key = b.start_dt.date().isoformat()
        minutes_by_day[key] += b.duration_min

    values = list(minutes_by_day.values())
    avg = sum(values) / len(values)
    if avg <= 0:
        return 0.0

    # Coefficient-like spread penalty; lower spread is better.
    variance = sum((v - avg) ** 2 for v in values) / len(values)
    spread = (variance ** 0.5) / avg
    return max(0.0, min(100.0, 100.0 - (spread * 50.0)))


def _score_fragmentation(plan: Plan) -> float:
    if not plan.micro_blocks:
        return 0.0

    short_blocks = sum(1 for b in plan.micro_blocks if b.duration_min <= 30)
    ratio = short_blocks / len(plan.micro_blocks)
    return max(0.0, 100.0 - (ratio * 100.0))


def _score_deadline_risk(plan: Plan, deadline: datetime | None = None) -> float:
    if not plan.micro_blocks:
        return 0.0

    if deadline is None:
        # If no deadline is supplied we return neutral confidence.
        return 70.0

    deadline = _ensure_utc_aware(deadline)

    latest_block = max(plan.micro_blocks, key=lambda b: b.start_dt)
    latest_start = _ensure_utc_aware(latest_block.start_dt)
    seconds_until_deadline = (deadline - latest_start).total_seconds()

    if seconds_until_deadline < 0:
        return 0.0
    if seconds_until_deadline < 24 * 3600:
        return 40.0
    if seconds_until_deadline < 3 * 24 * 3600:
        return 60.0
    if seconds_until_deadline < 7 * 24 * 3600:
        return 80.0
    return 95.0


def compute_quality_score(
    plan: Plan,
    *,
    deadline: datetime | str | None = None,
) -> PlannerQualityScore:
    parsed_deadline: datetime | None = None
    if isinstance(deadline, str):
        parsed_deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    elif isinstance(deadline, datetime):
        parsed_deadline = deadline

    if parsed_deadline and parsed_deadline.tzinfo is None:
        parsed_deadline = parsed_deadline.replace(tzinfo=timezone.utc)

    feasibility = _score_feasibility(plan)
    load_balance = _score_load_balance(plan)
    fragmentation = _score_fragmentation(plan)
    deadline_risk = _score_deadline_risk(plan, parsed_deadline)

    overall = (
        (0.35 * feasibility)
        + (0.25 * load_balance)
        + (0.15 * fragmentation)
        + (0.25 * deadline_risk)
    )

    warnings: list[str] = []
    if feasibility < 90:
        warnings.append("Potential overlap or packing pressure detected")
    if load_balance < 60:
        warnings.append("Daily load is uneven")
    if fragmentation < 60:
        warnings.append("Too many short context-switching blocks")
    if deadline_risk < 60:
        warnings.append("Schedule is close to deadline risk boundary")

    return PlannerQualityScore(
        overall_score=round(max(0.0, min(100.0, overall)), 2),
        feasibility_score=round(feasibility, 2),
        load_balance_score=round(load_balance, 2),
        fragmentation_score=round(fragmentation, 2),
        deadline_risk_score=round(deadline_risk, 2),
        warnings=warnings,
    )
