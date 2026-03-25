"""Planner Agent — macro allocation + deterministic micro scheduling.

NO LLM in the core scheduling loop.
Everything is rule-driven with seeded tie-breakers.

Supports global replan: all goals are scheduled together in priority order
so no two goals ever overlap.
"""

import logging
import copy
import time
from datetime import datetime, timezone
from uuid import uuid4

from shared.config import get_settings
from shared.models import Plan, GoalKnowledge, AgentLog
from shared.models.goal import GoalType, GoalStatus
from shared.models.user import UserProfile
from shared.db.repositories import (
    goals_repo, knowledge_repo, plans_repo, users_repo,
    constraints_repo, logs_repo,
)
from shared.bus.service_bus import send_message
from shared.telemetry.tracing import get_tracer

from agents.planner.availability import build_availability_matrix, AvailabilityMatrix
from agents.planner.ai_advisor import build_planner_ai_input, get_planner_recommendation
from agents.planner.calibration import summarize_user_execution_patterns
from agents.planner.quality_scorer import compute_quality_score
from agents.planner.replan import disruption_index
from agents.planner.explainer_ai import generate_plan_explanation
from agents.planner.macro_allocator import compute_macro_allocations
from agents.planner.micro_scheduler import schedule_micro_blocks, MAX_DAILY_MINUTES
from agents.planner.habit_scheduler import schedule_habit_blocks

logger = logging.getLogger(__name__)
tracer = get_tracer("planner")

DEFAULT_SEED = 42
PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}


def _is_schedulable_goal(goal_doc: dict) -> bool:
    """Only active goals should claim future schedule capacity.

    Paused, completed, and archived goals are excluded from scheduling.
    """
    return goal_doc.get("status", GoalStatus.ACTIVE.value) == GoalStatus.ACTIVE.value


async def run_planner(
    goal_id: str,
    user_id: str,
    window_days: int = 7,
    replan: bool = False,
    trigger_block_id: str | None = None,
) -> Plan:
    """Plan a single goal, then global-replan all goals to avoid overlaps."""

    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc:
        raise ValueError(f"Goal {goal_id} not found")

    if goal_doc.get("goal_type") == GoalType.HABIT:
        return await _plan_single_habit_goal(goal_doc, user_id, window_days)

    # First ensure this goal has knowledge
    knowledge_doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not knowledge_doc:
        raise ValueError(f"No GoalKnowledge for goal {goal_id}")

    # Run global replan for ALL goals (this goal included)
    plans = await replan_all_goals(user_id, window_days=window_days)

    # Return the plan for the requested goal
    for p in plans:
        if p.goal_id == goal_id:
            return p

    raise ValueError(f"Plan for goal {goal_id} was not generated")


async def _plan_single_habit_goal(goal_doc: dict, user_id: str, window_days: int) -> Plan:
    """Create recurring blocks for habit goals without retriever/macro allocation.

    Carries forward done/partial/missed blocks from the previous plan so that
    the user's past checkmarks are never lost.
    """
    from shared.models.goal import Goal

    goal = Goal(**goal_doc)
    now = datetime.now(timezone.utc)

    # Habit goals still need collision-aware placement against existing plans.
    user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
    user = UserProfile(**user_doc) if user_doc else UserProfile(user_id=user_id)
    constraint_docs = await constraints_repo.find_many({"user_id": user_id})
    availability = build_availability_matrix(
        user=user,
        constraints=constraint_docs,
        window_days=window_days,
    )

    all_goals = await goals_repo.find_many({"user_id": user_id})
    for existing_goal in all_goals:
        if not _is_schedulable_goal(existing_goal):
            continue
        if existing_goal.get("goal_id") == goal.goal_id:
            continue

        existing_plan_id = existing_goal.get("active_plan_id")
        if not existing_plan_id:
            continue

        existing_plan = await plans_repo.find_by_id(existing_plan_id, id_field="plan_id")
        if not existing_plan:
            continue

        for block in existing_plan.get("micro_blocks", []):
            if block.get("status") == "cancelled":
                continue

            bstart = block.get("start_dt")
            if isinstance(bstart, str):
                bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
            if isinstance(bstart, datetime) and bstart.tzinfo is None:
                bstart = bstart.replace(tzinfo=timezone.utc)
            if not bstart:
                continue

            duration_min = int(block.get("duration_min", 0) or 0)
            if duration_min <= 0:
                continue

            availability.block_slot_range(
                bstart.date(), bstart.hour, bstart.minute, duration_min
            )

    # --- A2 FIX: Carry forward past blocks from existing habit plan ---
    carried_blocks: list[MicroBlock] = []
    existing_plan_id = goal_doc.get("active_plan_id")
    if existing_plan_id:
        old_plan_doc = await plans_repo.find_by_id(existing_plan_id, id_field="plan_id")
        if old_plan_doc:
            for b in old_plan_doc.get("micro_blocks", []):
                bstart = b.get("start_dt")
                if isinstance(bstart, str):
                    bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
                elif isinstance(bstart, datetime) and bstart.tzinfo is None:
                    bstart = bstart.replace(tzinfo=timezone.utc)
                if not bstart:
                    continue
                # Carry forward only completed/partially completed blocks
                if bstart < now:
                    status = b.get("status", "scheduled")
                    if status in ("done", "partial"):
                        carried_blocks.append(MicroBlock(**b))

    blocks = schedule_habit_blocks(
        goal=goal,
        window_days=window_days,
        availability=availability,
        avoid_overlaps=True,
    )

    # Determine version from existing plan
    version = 1
    if existing_plan_id:
        old_plan_doc = await plans_repo.find_by_id(existing_plan_id, id_field="plan_id")
        if old_plan_doc:
            version = old_plan_doc.get("version", 1) + 1

    plan = Plan(
        user_id=user_id,
        goal_id=goal.goal_id,
        plan_window_days=window_days,
        seed=DEFAULT_SEED,
        macro_allocations=[],
        micro_blocks=[],
        version=version,
        explanation=(
            "Recurring habit schedule generated from preferred schedule "
            "with overlap avoidance against existing goal blocks"
        ),
    )

    # Assign plan_id to all NEW blocks
    for block in blocks:
        block.plan_id = plan.plan_id
    # Also reassign plan_id on carried blocks so they belong to the new plan
    for block in carried_blocks:
        block.plan_id = plan.plan_id
    plan.micro_blocks = carried_blocks + blocks

    await plans_repo.upsert(plan.plan_id, plan.model_dump(mode="json"), id_field="plan_id")
    if existing_plan_id and existing_plan_id != plan.plan_id:
        try:
            await plans_repo.delete(existing_plan_id, id_field="plan_id")
        except Exception:
            pass
    await goals_repo.update(goal.goal_id, {"active_plan_id": plan.plan_id})
    logger.info(
        "Habit plan generated for %s with %d new + %d carried blocks",
        goal.goal_id, len(blocks), len(carried_blocks),
    )
    return plan


async def replan_all_goals(
    user_id: str,
    window_days: int = 7,
) -> list[Plan]:
    """Schedule ALL active goals together in priority order.

    This is the core scheduling entrypoint. It:
    1. Builds one shared availability matrix
    2. Sorts goals by priority (high first)
    3. Schedules each goal in order, blocking slots as it goes
    4. Preserves already-done blocks from existing plans
    """
    trace_id = str(uuid4())
    t0 = time.monotonic()

    with tracer.start_as_current_span("planner.replan_all", attributes={"user_id": user_id}):
        # 1. Load user profile
        user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
        user = UserProfile(**user_doc) if user_doc else UserProfile(user_id=user_id)

        # 2. Load time constraints
        constraint_docs = await constraints_repo.find_many({"user_id": user_id})

        # 3. Build shared availability matrix
        availability = build_availability_matrix(
            user=user,
            constraints=constraint_docs,
            window_days=window_days,
        )

        # 4. Load all goals with knowledge, sorted by priority
        all_goals = await goals_repo.find_many({"user_id": user_id})
        goals_with_knowledge = []
        for g in all_goals:
            if not _is_schedulable_goal(g):
                continue
            k_doc = await knowledge_repo.find_by_id(g["goal_id"], id_field="goal_id")
            if k_doc:
                goals_with_knowledge.append((g, GoalKnowledge(**k_doc)))

        # Sort: high priority first, then by deadline (earlier first)
        goals_with_knowledge.sort(key=lambda gk: (
            -PRIORITY_WEIGHT.get(gk[0].get("priority", "medium"), 2),
            gk[0].get("deadline", "9999"),
        ))

        logger.info(
            "Global replan: %d goals with knowledge for user %s",
            len(goals_with_knowledge), user_id,
        )

        # 4b. Compute AI recommendation with safe fallback. This does not yet
        # alter deterministic scheduling decisions; it is prepared for later steps.
        total_topics = sum(len(k.topics) for _, k in goals_with_knowledge)
        calibration = await summarize_user_execution_patterns(user_id)
        planner_input = build_planner_ai_input(
            user_id=user_id,
            window_days=window_days,
            active_goals_count=len(goals_with_knowledge),
            active_topics_count=total_topics,
            recent_done_ratio=float(calibration.get("recent_done_ratio", 0.0) or 0.0),
            recent_partial_ratio=float(calibration.get("recent_partial_ratio", 0.0) or 0.0),
            recent_missed_ratio=float(calibration.get("recent_missed_ratio", 0.0) or 0.0),
            day_capacity_profile=calibration.get("day_capacity_profile", {}),
            topic_overrun_factors=calibration.get("topic_overrun_factors", {}),
        )
        ai_rec, ai_fallback_reason = await get_planner_recommendation(planner_input)

        # 5. Collect done blocks from existing plans (preserve past work)
        now = datetime.now(timezone.utc)
        done_blocks_by_goal: dict[str, list] = {}
        for goal_doc, _ in goals_with_knowledge:
            plan_id = goal_doc.get("active_plan_id")
            if not plan_id:
                continue
            plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
            if not plan_doc:
                continue
            past_blocks = []
            for b in plan_doc.get("micro_blocks", []):
                bstart = b.get("start_dt")
                if isinstance(bstart, str):
                    bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
                if isinstance(bstart, datetime) and bstart.tzinfo is None:
                    bstart = bstart.replace(tzinfo=timezone.utc)

                status = b.get("status", "scheduled")
                # A1 FIX: Preserve ONLY done and partial blocks.
                # Missed blocks correspond to unfinished work; they are dropped from the plan record.
                # Because they are dropped, they grant no progress credit, and the macro-allocator
                # will naturally reschedule their topic hours into the available capacity.
                is_past = bstart and bstart < now
                if status in ("done", "partial"):
                    past_blocks.append(b)

                # Block time slots for done/partial so future goals don't overlap.
                if status in ("done", "partial") and bstart:
                    dur = b.get("duration_min", 60)
                    availability.block_slot_range(
                        bstart.date(), bstart.hour, bstart.minute, dur
                    )
            done_blocks_by_goal[goal_doc["goal_id"]] = past_blocks

        # 5b. Block all active habit-goal blocks so learning sessions never overlap them.
        # Habit goals are excluded from goals_with_knowledge (no GoalKnowledge doc),
        # but their blocks occupy real wall-clock time.
        for g in all_goals:
            if g.get("goal_type") != GoalType.HABIT:
                continue
            if not _is_schedulable_goal(g):
                continue
            h_plan_id = g.get("active_plan_id")
            if not h_plan_id:
                continue
            h_plan_doc = await plans_repo.find_by_id(h_plan_id, id_field="plan_id")
            if not h_plan_doc:
                continue
            for b in h_plan_doc.get("micro_blocks", []):
                bstart = b.get("start_dt")
                if isinstance(bstart, str):
                    bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
                if isinstance(bstart, datetime) and bstart.tzinfo is None:
                    bstart = bstart.replace(tzinfo=timezone.utc)
                if bstart:
                    availability.block_slot_range(
                        bstart.date(), bstart.hour, bstart.minute, b.get("duration_min", 60)
                    )

        # 6. Schedule each goal in priority order, sharing the availability
        plans: list[Plan] = []
        quality_scores: list[float] = []
        disruption_scores: list[float] = []
        retry_count = 0
        settings = get_settings()

        for goal_doc, knowledge in goals_with_knowledge:
            goal_id = goal_doc["goal_id"]

            # Compute done/partial minutes per topic from preserved blocks.
            # done   = full credit.  partial = half credit (consistent with frontend).
            done_minutes_for_goal: dict[str, int] = {}
            for b in done_blocks_by_goal.get(goal_id, []):
                tid = b.get("topic_id", "")
                if not tid:
                    continue
                dur = b.get("duration_min", 0)
                if b.get("status") == "done":
                    done_minutes_for_goal[tid] = done_minutes_for_goal.get(tid, 0) + dur
                elif b.get("status") == "partial":
                    done_minutes_for_goal[tid] = done_minutes_for_goal.get(tid, 0) + dur // 2

            # Macro allocation — window-scoped, deducts already-done effort.
            goal_urgency_boost = float(ai_rec.urgency_boost_per_goal.get(goal_id, 0.0) or 0.0)
            urgency_boost_by_topic = {
                topic.topic_id: goal_urgency_boost for topic in knowledge.topics
            }
            effort_adjustment_by_topic = {
                topic.topic_id: float(calibration.get("topic_overrun_factors", {}).get(topic.topic_id, 1.0) or 1.0)
                for topic in knowledge.topics
            }

            macro = compute_macro_allocations(
                knowledge=knowledge,
                deadline=goal_doc["deadline"],
                target_weekly_effort=goal_doc.get("target_weekly_effort"),
                window_days=window_days,
                done_minutes_per_topic=done_minutes_for_goal,
                effort_adjustment_per_topic=effort_adjustment_by_topic,
                urgency_boost_per_topic=urgency_boost_by_topic,
            )

            # Temporarily block this goal's restricted time slots
            restricted_slots = goal_doc.get("restricted_slots", [])
            temp_blocked: list = []
            for rs in restricted_slots:
                days = rs.get("days", list(range(7)))
                temp_blocked.extend(
                    availability.temporarily_block_recurring(
                        days, rs.get("start_hour", 0), rs.get("end_hour", 0)
                    )
                )

            # Schedule into remaining available slots
            # Keep daily load bounded so new plans are spread across multiple days
            # instead of being packed into a single long day.
            per_day_cap = min(int(user.daily_capacity_hours * 60), MAX_DAILY_MINUTES)
            preferred_duration_by_topic = (
                {topic.topic_id: ai_rec.preferred_block_minutes for topic in knowledge.topics}
                if ai_rec.preferred_block_minutes is not None
                else {}
            )

            base_availability = copy.deepcopy(availability)
            primary_micro_blocks = schedule_micro_blocks(
                knowledge=knowledge,
                macro_allocations=macro,
                availability=base_availability,
                seed=DEFAULT_SEED,
                max_topics_per_day=user.max_topics_per_day,
                max_daily_minutes=per_day_cap,
                preferred_block_durations_by_topic=preferred_duration_by_topic,
                daily_capacity_profile=calibration.get("day_capacity_profile", {}),
                max_disruption_budget=ai_rec.max_disruption_budget,
            )

            # Quality gate: if quality is low, retry once with conservative knobs.
            done_blocks = done_blocks_by_goal.get(goal_id, [])
            from shared.models import MicroBlock
            done_block_models = [MicroBlock(**b) for b in done_blocks]

            primary_candidate_plan = Plan(
                user_id=user_id,
                goal_id=goal_id,
                plan_window_days=window_days,
                seed=DEFAULT_SEED,
                macro_allocations=macro,
                micro_blocks=done_block_models + primary_micro_blocks,
                total_estimated_hours=knowledge.estimated_total_hours,
            )
            primary_quality = compute_quality_score(primary_candidate_plan, deadline=goal_doc.get("deadline"))

            retry_triggered = False
            micro_blocks = primary_micro_blocks
            quality = primary_quality
            if primary_quality.overall_score < 65.0:
                retry_triggered = True
                retry_count += 1
                conservative_availability = copy.deepcopy(availability)
                conservative_micro_blocks = schedule_micro_blocks(
                    knowledge=knowledge,
                    macro_allocations=macro,
                    availability=conservative_availability,
                    seed=DEFAULT_SEED,
                    max_topics_per_day=max(1, user.max_topics_per_day - 1),
                    max_daily_minutes=max(30, int(per_day_cap * 0.85)),
                    preferred_block_durations_by_topic={
                        topic.topic_id: 30 for topic in knowledge.topics
                    },
                    daily_capacity_profile={},
                    max_disruption_budget=ai_rec.max_disruption_budget,
                )
                conservative_candidate_plan = Plan(
                    user_id=user_id,
                    goal_id=goal_id,
                    plan_window_days=window_days,
                    seed=DEFAULT_SEED,
                    macro_allocations=macro,
                    micro_blocks=done_block_models + conservative_micro_blocks,
                    total_estimated_hours=knowledge.estimated_total_hours,
                )
                conservative_quality = compute_quality_score(
                    conservative_candidate_plan,
                    deadline=goal_doc.get("deadline"),
                )
                if conservative_quality.overall_score >= primary_quality.overall_score:
                    micro_blocks = conservative_micro_blocks
                    quality = conservative_quality

            # Restore temporarily blocked restricted slots so other goals can use them
            AvailabilityMatrix.restore_slots(temp_blocked)

            # Block the just-scheduled slots so the next goal can't use them.
            # Use slot-precise blocking (not integer-hour) to avoid wasting :30 slots.
            for block in micro_blocks:
                availability.block_slot_range(
                    block.start_dt.date(), block.start_dt.hour, block.start_dt.minute, block.duration_min
                )

            all_blocks = done_block_models + micro_blocks

            # Determine version
            existing_plan_id = goal_doc.get("active_plan_id")
            version = 1
            old_plan = None
            if existing_plan_id:
                old_plan = await plans_repo.find_by_id(existing_plan_id, id_field="plan_id")
                if old_plan:
                    version = old_plan.get("version", 1) + 1

            disruption_value = 0.0
            if old_plan:
                try:
                    disruption_value = disruption_index(Plan(**old_plan), micro_blocks)
                except Exception:
                    disruption_value = 0.0
            disruption_scores.append(disruption_value)

            explanation = await generate_plan_explanation(
                goal_title=goal_doc.get("title", goal_id),
                quality=quality,
                disruption_index=disruption_value,
                ai_recommendation=ai_rec,
                used_fallback=bool(ai_fallback_reason),
            )

            plan = Plan(
                user_id=user_id,
                goal_id=goal_id,
                plan_window_days=window_days,
                seed=DEFAULT_SEED,
                macro_allocations=macro,
                micro_blocks=all_blocks,
                explanation=explanation,
                version=version,
                # Snapshot knowledge total so the frontend can compute meaningful
                # overall progress without a separate knowledge fetch.
                total_estimated_hours=knowledge.estimated_total_hours,
                quality_score=quality.model_dump(mode="json"),
                risk_flags={
                    "overload_risk": quality.load_balance_score < 60,
                    "deadline_risk": quality.deadline_risk_score < 60,
                    "fragmentation_risk": quality.fragmentation_score < 60,
                    "low_confidence_inputs": bool(ai_fallback_reason),
                },
                ai_recommendation_snapshot=ai_rec.model_dump(mode="json"),
                fallback_reason=ai_fallback_reason,
                disruption_index=round(disruption_value, 4),
                used_fallback=bool(ai_fallback_reason),
                retry_triggered=retry_triggered,
            )
            quality_scores.append(quality.overall_score)

            # Persist
            await plans_repo.upsert(plan.plan_id, plan.model_dump(mode="json"), id_field="plan_id")
            old_plan_id = goal_doc.get("active_plan_id")
            if old_plan_id and old_plan_id != plan.plan_id:
                try:
                    await plans_repo.delete(old_plan_id, id_field="plan_id")
                except Exception:
                    pass
            await goals_repo.update(goal_id, {"active_plan_id": plan.plan_id})
            plans.append(plan)

            logger.info(
                "Scheduled goal %s (%s priority): %d new + %d done blocks; quality=%.2f; disruption=%.3f; retry=%s",
                goal_id, goal_doc.get("priority", "medium"),
                len(micro_blocks), len(done_blocks), quality.overall_score, disruption_value, retry_triggered,
            )

        # 7. Log
        duration_ms = int((time.monotonic() - t0) * 1000)
        total_blocks = sum(len(p.micro_blocks) for p in plans)
        ai_mode = "fallback" if ai_fallback_reason else "model"
        avg_quality = (sum(quality_scores) / len(quality_scores)) if quality_scores else 0.0
        avg_disruption = (sum(disruption_scores) / len(disruption_scores)) if disruption_scores else 0.0
        log = AgentLog(
            agent_name="planner",
            trace_id=trace_id,
            decision_summary=(
                f"Global replan: {len(plans)} goals, {total_blocks} blocks over {window_days} days; "
                f"planner_ai={ai_mode}; ai_confidence={ai_rec.confidence:.2f}; "
                f"fallback_reason={ai_fallback_reason or 'none'}; avg_quality_score={avg_quality:.2f}; "
                f"avg_disruption_index={avg_disruption:.3f}; planner.retry.triggered={retry_count}"
            ),
            duration_ms=duration_ms,
        )
        await logs_repo.insert(log.model_dump(mode="json"))

        logger.info(
            "Global replan completed: %d goals, %d total blocks (trace=%s)",
            len(plans), total_blocks, trace_id,
        )
        return plans
