"""NLP Intake Agent — converts free-form user scenarios into strict goal objects.

This module is intentionally LLM-first and strict:
- No heuristic goal-type detection
- No silent fallback defaults for missing required fields
- Manual overrides are applied explicitly after model inference
"""

import json
import logging
import re
from datetime import datetime, timezone

from shared.config import get_settings
from shared.ai import run_prompt_via_graph
from shared.models.goal import GoalCreate, GoalType, GoalCategory, GoalPriority
from shared.models.intake import ManualGoalOverrides
from shared.models.user import TimeWindow

logger = logging.getLogger(__name__)

INTAKE_PROMPT = """You are an expert goal planning assistant. Parse the following user scenario into structured goal data.

Today's date: {today}

User scenario: "{prompt}"

Return a JSON object with these exact top-level fields:

{{
  "goal": {{
    "title": "short title, 5-8 words",
    "description": "one-sentence summary of user intent",
    "goal_type": "habit" or "learning" or "project",
    "category": "fitness" or "course" or "skill" or "hobby" or "project" or "internship" or "other",
    "priority": "high" or "medium" or "low",
    "deadline": "YYYY-MM-DD format only, e.g. 2026-06-01. For ongoing habits use 1 year from today.",
    "target_weekly_effort": <number of hours per week or null>,
    "preferred_schedule": {{
      "days": [0,1,2,3,4,5,6],
      "start_hour": <integer 0-23>,
      "end_hour": <integer 0-23>,
      "duration_min": <integer, minutes per session>
    }},
    "restricted_slots": [
      {{
        "days": [0,1,2,3,4,5,6],
        "start_hour": <integer 0-23>,
        "end_hour": <integer 0-23>
      }}
    ],
    "prefer_user_materials_only": false,
    "material_urls": []
  }},
  "confidence": <float 0.0 to 1.0>,
  "assumptions": ["list of assumptions you made"],
  "warnings": ["list of potential issues"]
}}

Rules:
- goal_type MUST be "habit" for recurring physical/mental activities (gym, pushups, meditation, running, reading daily).
- goal_type MUST be "learning" for studying, courses, interview prep, reading technical material.
- goal_type MUST be "project" for building/shipping deliverables.
- preferred_schedule is REQUIRED for habit goals. For learning/project it can be null.
- restricted_slots is an array of time windows when the user does NOT want this goal scheduled. Use an empty array [] if not mentioned.
- deadline MUST be YYYY-MM-DD format. For habits with no explicit end, use 1 year from today.
- All enum values must be lowercase.
- Respond with valid JSON only. No markdown fences, no explanation.
"""


def _require(data: dict, key: str):
    if key not in data:
        raise ValueError(f"Intake JSON missing required field: {key}")
    return data[key]


def _normalize_enum_value(value: str) -> str:
    """Normalize enum-like model strings such as 'High' or 'PROJECT'."""
    return str(value).strip().lower().replace(" ", "_")


def _parse_deadline(value) -> datetime:
    """Parse LLM deadline value from ISO datetime/date or unix timestamp."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)

    if not isinstance(value, str):
        raise ValueError("Intake field 'deadline' must be a datetime/date string or unix timestamp")

    raw = value.strip()
    if not raw:
        raise ValueError("Intake field 'deadline' cannot be empty")

    # Accept date-only values by defaulting to start-of-day UTC.
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        raw = f"{raw}T00:00:00+00:00"
    else:
        raw = raw.replace("Z", "+00:00")

    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("Intake field 'deadline' must be ISO datetime/date or unix timestamp") from exc

    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_goal_create(goal_data: dict, deadline_override: datetime | None = None) -> GoalCreate:
    title = _require(goal_data, "title")
    description = goal_data.get("description", title)
    goal_type = GoalType(_normalize_enum_value(_require(goal_data, "goal_type")))
    category = GoalCategory(_normalize_enum_value(goal_data.get("category", "other")))
    priority = GoalPriority(_normalize_enum_value(goal_data.get("priority", "medium")))

    # Deadline: use override first, then parse model output
    deadline_raw = goal_data.get("deadline")
    if deadline_override is not None:
        deadline = deadline_override
    elif deadline_raw is not None:
        deadline = _parse_deadline(deadline_raw)
    else:
        raise ValueError("Intake JSON missing required field: deadline")

    # Schedule: parse if present
    preferred_schedule = None
    sched_data = goal_data.get("preferred_schedule")
    if sched_data is not None and isinstance(sched_data, dict):
        preferred_schedule = TimeWindow(
            start_hour=int(sched_data.get("start_hour", 7)),
            end_hour=int(sched_data.get("end_hour", 8)),
            days=list(sched_data.get("days", list(range(7)))),
            duration_min=int(sched_data.get("duration_min", 30)),
        )

    # Optional fields with safe defaults
    prefer_user_materials_only = bool(goal_data.get("prefer_user_materials_only", False))
    material_urls_raw = goal_data.get("material_urls", [])
    material_urls = material_urls_raw if isinstance(material_urls_raw, list) else []

    # Restricted time slots
    restricted_slots: list[TimeWindow] = []
    raw_restricted = goal_data.get("restricted_slots", [])
    if isinstance(raw_restricted, list):
        for rs in raw_restricted:
            if isinstance(rs, dict):
                restricted_slots.append(TimeWindow(
                    start_hour=int(rs.get("start_hour", 0)),
                    end_hour=int(rs.get("end_hour", 0)),
                    days=list(rs.get("days", list(range(7)))),
                ))

    return GoalCreate(
        title=title,
        description=description,
        goal_type=goal_type,
        category=category,
        priority=priority,
        deadline=deadline,
        target_weekly_effort=goal_data.get("target_weekly_effort"),
        preferred_schedule=preferred_schedule,
        restricted_slots=restricted_slots,
        prefer_user_materials_only=prefer_user_materials_only,
        material_urls=material_urls,
    )


def _apply_manual_overrides(goal: GoalCreate, overrides: ManualGoalOverrides) -> GoalCreate:
    data = goal.model_dump()
    manual = overrides.model_dump(exclude_none=True)
    data.update(manual)
    return GoalCreate(**data)


def _ensure_habit_schedule(goal: GoalCreate) -> GoalCreate:
    """Ensure habit goals always have a schedule, even if model output omitted it."""
    if goal.goal_type != GoalType.HABIT or goal.preferred_schedule is not None:
        return goal

    data = goal.model_dump()
    data["preferred_schedule"] = TimeWindow(
        start_hour=7,
        end_hour=8,
        days=list(range(7)),
        duration_min=30,
    )
    return GoalCreate(**data)


async def parse_goal_from_prompt(
    prompt: str,
    deadline_override: datetime | None = None,
) -> tuple[GoalCreate, dict]:
    """Use LLM to parse scenario text into strict GoalCreate + metadata."""
    settings = get_settings()

    active_key = settings.llm_api_key or settings.azure_openai_api_key
    if not active_key or active_key == "your-llm-api-key-here":
        raise ValueError("LLM API key not configured for intake parsing")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    full_prompt = INTAKE_PROMPT.format(prompt=prompt, today=today)

    logger.info("[INTAKE] Parsing prompt: %s", prompt[:100])

    try:
        result_text = run_prompt_via_graph(
            full_prompt,
            temperature=0.0,
            json_mode=True,
        )
    except Exception as e:
        logger.error("[INTAKE] LLM API error: %s", e, exc_info=True)
        raise ValueError("Intake model call failed") from e

    result_text = result_text.strip()
    # Strip markdown fences if present
    result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
    result_text = re.sub(r"\n?```\s*$", "", result_text)
    result_text = result_text.strip()

    logger.info("[INTAKE] LLM raw response: %s", result_text[:300])

    try:
        data = json.loads(result_text)
    except json.JSONDecodeError as e:
        logger.error("[INTAKE] Invalid JSON from model. Raw text: %s", result_text[:500])
        raise ValueError(f"Intake agent returned invalid JSON: {e}") from e

    goal_data = data.get("goal")
    if not goal_data or not isinstance(goal_data, dict):
        logger.error("[INTAKE] Model response missing 'goal' object. Keys: %s Data: %s", list(data.keys()), str(data)[:500])
        raise ValueError("Intake model response missing 'goal' object")

    try:
        goal_create = _parse_goal_create(goal_data, deadline_override=deadline_override)
    except (ValueError, KeyError, TypeError) as parse_err:
        logger.error(
            "[INTAKE] Failed to parse goal fields. Error: %s. Goal data: %s",
            parse_err, json.dumps(goal_data, default=str)[:500],
        )
        raise ValueError(f"Intake parse error: {parse_err}") from parse_err

    confidence_raw = data.get("confidence", 0.7)
    try:
        confidence = max(0.0, min(1.0, float(confidence_raw)))
    except (ValueError, TypeError):
        confidence = 0.5

    assumptions = data.get("assumptions", [])
    if not isinstance(assumptions, list):
        assumptions = []
    warnings = data.get("warnings", [])
    if not isinstance(warnings, list):
        warnings = []

    logger.info(
        "[INTAKE] Parsed: title=%s type=%s category=%s schedule=%s",
        goal_create.title, goal_create.goal_type, goal_create.category,
        (
            f"{goal_create.preferred_schedule.start_hour}:00 on {goal_create.preferred_schedule.days}"
            if goal_create.preferred_schedule
            else "none"
        ),
    )

    meta = {
        "inferred_goal_type": goal_create.goal_type,
        "confidence": round(confidence, 2),
        "assumptions": [str(a) for a in assumptions],
        "warnings": [str(w) for w in warnings],
    }
    return goal_create, meta


async def parse_scenario_to_goal(
    scenario_text: str,
    overrides: ManualGoalOverrides | None = None,
) -> tuple[GoalCreate, dict]:
    """Build a structured goal from raw scenario text with optional manual overrides.

    Priority order: manual overrides > model inference.
    """
    inferred_goal, meta = await parse_goal_from_prompt(
        scenario_text,
        deadline_override=overrides.deadline if overrides else None,
    )
    resolved = _ensure_habit_schedule(inferred_goal)
    if overrides is not None:
        resolved = _apply_manual_overrides(resolved, overrides)
        resolved = _ensure_habit_schedule(resolved)
        meta["assumptions"] = [*meta.get("assumptions", []), "Applied manual overrides over inferred fields"]
    return resolved, meta
