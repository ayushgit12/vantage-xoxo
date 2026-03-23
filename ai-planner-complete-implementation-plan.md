# AI-Enhanced Global Planner: Complete Implementation Plan

Last updated: 2026-03-23
Scope: Keep global replan as the single planning mode, and upgrade planner quality using AI-assisted scoring and parameter tuning while preserving deterministic final scheduling.

## Implementation Principles

1. Deterministic scheduler remains final authority.
2. AI proposes parameters, scores, and explanations only.
3. Every AI output must be schema-validated and have fallback defaults.
4. Planning must still run when AI is unavailable.
5. All new behavior must be measurable via telemetry.

## Target Outcomes

1. Better schedule realism (planned time matches actual user behavior).
2. Better global prioritization across goals during replan.
3. Lower plan disruption while maintaining feasibility.
4. Clear user-facing plan explanations and risk warnings.

## Step-by-Step Build Plan

## Step 1: Define new planner AI contracts and settings

Objective
- Introduce strict data contracts for AI inputs/outputs and config flags.

Tasks
1. Add new planner AI settings in backend/shared/config.py:
- planner_ai_enabled: bool
- planner_ai_model: str
- planner_ai_timeout_ms: int
- planner_ai_min_confidence: float
- planner_ai_cache_ttl_seconds: int
- planner_ai_explanations_enabled: bool

2. Add new models in backend/shared/models/plan.py or a new file backend/shared/models/planner_ai.py:
- PlannerAIInput
- PlannerAIRecommendation
- PlannerQualityScore
- PlannerRiskFlags
- PlannerExplanation

3. Add enum/constants for fallback reason codes:
- AI_UNAVAILABLE
- AI_LOW_CONFIDENCE
- AI_INVALID_OUTPUT
- AI_TIMEOUT

Definition of done
- New settings load from env.
- Pydantic models validate successfully.
- No behavior change yet.

## Step 2: Add planner AI service wrapper (with caching + fallback)

Objective
- Build one service that calls LLM once per replan context and returns validated recommendations.

Tasks
1. Create backend/agents/planner/ai_advisor.py with:
- build_planner_ai_input(...)
- get_planner_recommendation(...)
- validate_and_clamp_recommendation(...)
- fallback_recommendation(...)

2. Reuse backend/shared/ai/llm.py for model call.
3. Add cache get/set using existing shared.cache helpers keyed by:
- user profile snapshot
- active goals summary
- completion telemetry summary
- window_days

4. Clamp recommendations to safe bounds (example):
- daily_capacity_multiplier between 0.5 and 1.2
- block_duration_target in {30, 45, 60, 90}
- max_disruption_budget between 0 and 0.5

Definition of done
- Service returns a valid recommendation even when AI fails.
- Logs include reason when fallback is used.

## Step 3: Add planner quality scorer module

Objective
- Score generated plans before they are accepted as final.

Tasks
1. Create backend/agents/planner/quality_scorer.py:
- score_feasibility(plan, availability)
- score_load_balance(plan)
- score_fragmentation(plan)
- score_deadline_risk(plan, goals, knowledge)
- compute_quality_score(...)

2. Output PlannerQualityScore with:
- overall_score (0-100)
- sub-scores
- warning list
- pass/fail threshold

3. Keep scorer deterministic.

Definition of done
- Every generated plan can be scored.
- Score object serializes and is testable.

## Step 4: Add completion telemetry summarizer for calibration signals

Objective
- Convert historical block outcomes into compact AI-ready signals.

Tasks
1. Create backend/agents/planner/calibration.py:
- summarize_user_execution_patterns(user_id)
- compute_topic_overrun_factors(...)
- compute_day_of_week_capacity_profile(...)

2. Build from existing plans + block statuses:
- done ratio
- partial ratio
- missed ratio
- average overrun/underrun proxy
- best day/time windows

3. Expose helper output to ai_advisor input builder.

Definition of done
- Summarizer returns stable, bounded numeric metrics.

## Step 5: Integrate AI recommendations into macro allocator inputs

Objective
- Use AI recommendations to improve hours distribution and urgency ordering.

Tasks
1. Extend backend/agents/planner/macro_allocator.py input signature to accept:
- urgency_boost_per_topic
- estimated_effort_adjustment_per_topic

2. Apply adjustments with clamps so total hours remain sane.
3. Preserve prerequisite ordering guarantees.

Definition of done
- Macro allocations reflect AI tuning when enabled.
- Allocator still works with no AI adjustments.

## Step 6: Integrate AI recommendations into micro scheduler behavior

Objective
- Improve block sizing and daily spread using AI suggestions.

Tasks
1. Extend backend/agents/planner/micro_scheduler.py to accept:
- preferred_block_durations_by_topic
- daily_capacity_profile
- max_disruption_budget (for replan mode)

2. Keep slot quantization deterministic.
3. Maintain max_topics_per_day and hard constraints.

Definition of done
- Micro scheduler uses tuned durations and capacity profile when provided.
- Behavior remains deterministic for same inputs.

## Step 7: Add disruption-aware global replan policy

Objective
- Keep global replan but reduce unnecessary movement of future blocks.

Tasks
1. Extend backend/agents/planner/replan.py with:
- disruption_index(existing_plan, new_plan)
- enforce_disruption_budget(existing_plan, new_plan, budget)

2. In backend/agents/planner/agent.py:
- Compare candidate plan disruption vs budget.
- If over budget, run one constrained retry with conservative settings.

3. Preserve hard constraints and feasibility as top priority.

Definition of done
- Replans minimize movement while keeping constraints valid.
- Disruption metrics logged per goal and globally.

## Step 8: Add plan quality gate + retry policy in planner orchestrator

Objective
- Reject weak plans and auto-retry once with safer deterministic knobs.

Tasks
1. In backend/agents/planner/agent.py after schedule generation:
- compute quality score
- if below threshold: retry once with safer parameters

2. Safer retry defaults:
- smaller block duration
- lower daily capacity target
- stricter topic spread

3. Keep max retry count = 1 to avoid loops.

Definition of done
- Planner returns higher-quality plans more consistently.
- Retry path is observable in logs.

## Step 9: Persist AI and quality metadata on plan records

Objective
- Make plans debuggable and explainable post-generation.

Tasks
1. Extend Plan model in backend/shared/models/plan.py:
- quality_score
- risk_flags
- ai_recommendation_snapshot
- fallback_reason
- disruption_index

2. Ensure backward compatibility by keeping fields optional.

Definition of done
- New metadata saved in plans container.
- Existing old plans still parse correctly.

## Step 10: Add planner explanation generator

Objective
- Produce concise, user-friendly explanation of global replan outcomes.

Tasks
1. Create backend/agents/planner/explainer_ai.py:
- generate_plan_explanation(input_summary)
- fallback_explanation(...)

2. Populate Plan.explanation with:
- top reasons for schedule shape
- key tradeoffs
- warnings if deadline risk is high

3. Guard with planner_ai_explanations_enabled.

Definition of done
- Every plan has a meaningful explanation string.

## Step 11: Update API responses for planner transparency

Objective
- Expose quality and risk information to frontend/clients.

Tasks
1. Update backend/api/routers/plans.py responses for:
- POST /api/plans/generate
- POST /api/plans/replan-all
- GET /api/plans/{plan_id}
- GET /api/plans/goal/{goal_id}

2. Include:
- quality_score
- warnings
- disruption_index
- used_fallback flag

Definition of done
- API returns new metadata without breaking existing fields.

## Step 12: Add tests (unit + integration)

Objective
- Ensure safety, determinism, and fallback reliability.

Tasks
1. Unit tests:
- ai_advisor validation and clamp behavior
- quality_scorer score calculations
- disruption budget enforcement
- fallback when AI unavailable

2. Integration tests:
- global replan with AI enabled
- global replan with AI disabled
- quality-gate retry path
- API response includes new metadata

3. Determinism tests:
- with same mocked AI recommendation and same inputs, outputs match.

Definition of done
- Test suite passes locally in backend/tests.

## Step 13: Add telemetry and monitoring

Objective
- Measure whether quality actually improves.

Tasks
1. Add telemetry events in planner agent:
- planner.ai.used
- planner.ai.fallback_reason
- planner.quality.score
- planner.replan.disruption_index
- planner.retry.triggered

2. Add trace attributes for key values.

Definition of done
- Metrics are visible in telemetry endpoint/logs.

## Step 14: Documentation updates

Objective
- Ensure team can maintain and operate new planner behavior.

Tasks
1. Update context.md with AI-enhanced planner flow.
2. Add section in README for planner AI flags and fallback behavior.
3. Document expected API fields in planner endpoints.

Definition of done
- Docs match implementation and troubleshooting path.

## Execution Checklist (in order)

1. Step 1 contracts/settings
2. Step 2 AI advisor service
3. Step 3 quality scorer
4. Step 4 calibration summarizer
5. Step 5 macro integration
6. Step 6 micro integration
7. Step 7 disruption-aware replan
8. Step 8 quality gate + retry
9. Step 9 persist metadata
10. Step 10 explanation generator
11. Step 11 API metadata exposure
12. Step 12 tests
13. Step 13 telemetry
14. Step 14 docs

## Non-Negotiable Safeguards

1. Planner must still run fully without AI.
2. AI output must never directly place blocks.
3. Hard constraints always override AI recommendations.
4. Retry count must stay bounded.
5. Determinism must remain for identical deterministic inputs.

## Success Criteria

1. Quality score average increases by >= 20 percent over baseline.
2. Replan disruption index decreases by >= 25 percent.
3. Missed block rate decreases by >= 15 percent.
4. No regression in planner endpoint reliability.
5. Fallback path succeeds in 100 percent of AI-failure scenarios.

## Implementation Status (Live)

Completed
1. Step 1 contracts/settings
2. Step 2 AI advisor service
3. Step 3 quality scorer
4. Step 4 calibration summarizer
5. Step 5 macro integration
6. Step 6 micro integration
7. Step 7 disruption tracking + budget helpers
8. Step 8 quality gate + deterministic retry
9. Step 9 plan metadata persistence
10. Step 10 explanation generator
11. Step 11 API metadata exposure

Implemented test coverage
1. Planner AI advisor behavior
2. Calibration summarizer
3. Macro adjustment and urgency boost
4. Preferred block duration scheduling
5. Disruption index behavior
6. Explanation fallback formatter
7. Plan metadata model serialization

Still to run operationally
1. Full backend pytest run in environment
2. Telemetry dashboard wiring outside API/log layer
3. Frontend UI enrichment beyond current stats page cards
