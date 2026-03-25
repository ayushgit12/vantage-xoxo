# Planner Complete Remake Execution Plan

Last updated: 2026-03-23
Owner: Backend + Frontend planning workflow
Goal: Rebuild planner behavior so schedules are reliable, explainable, and truly rolling (7-day horizon with stable history handling).

## 1) Why Remake

Current pain points to eliminate:
- Plans can collapse into 1 day despite a 7-day window.
- Single-goal generate can reshuffle other goals unexpectedly.
- No guaranteed rolling horizon refresh after day 7.
- Past block lifecycle (review/check/uncheck history window) is not explicit.
- Retriever/planner pipelines are too fragile when AI/services fail.

## 2) Success Criteria

The remake is complete when all are true:
1. A 7-day window produces multi-day spread unless constraints truly force concentration.
2. Planner keeps a rolling horizon automatically (daily extension policy).
3. Per-goal planning does not cause hidden global side effects.
4. Past 3-4 day block review/update rules are explicit and implemented.
5. Planner output includes diagnostics (quality/risk/fallback reasons).
6. E2E tests validate generate, replan, rollover, and status transitions.
7. AI trend module is verified as fully wired, and dynamic capacity logic is proven active in production planner paths.

## 3) Scope

In scope:
- Planner core modules: macro allocation, micro scheduling, global replan orchestration.
- Replan and disruption policy.
- Rolling horizon service/job.
- API contracts for generate/replan/status.
- Frontend planner diagnostics and history review UX.
- Tests + telemetry.

Out of scope:
- Complete auth redesign (keep current auth model for this phase).
- Full retriever redesign (only reliability hardening needed for planner dependency).

## 4) Target Architecture

### Planning modes
- Goal-scoped generate: plans one goal only, no global reshuffle.
- Global replan: explicit operation, schedules all active goals together.
- Rolling refresh: daily background process extends horizon to next 7 days.

### Time windows
- Future horizon: strict 7-day rolling window.
- Recent history window: explicit 4-day lookback for task review.

### State policy
- Keep done/partial immutable for analytics unless explicit override.
- Allow missed -> scheduled transition by replan action.
- Preserve history blocks for audit and UI review.

### Dynamic capacity policy (replace hard 2h/day cap)
- Remove static hard cap usage as the default planner limit.
- Compute per-day dynamic cap from:
  - user.daily_capacity_hours
  - weekday capacity profile (execution history)
  - active goal count pressure
  - recent burnout signal (high missed ratio)
- Clamp dynamic cap to safe bounds (example):
  - min: 60 minutes/day
  - max: min(user.daily_capacity_hours * 60, 8h/day absolute safety cap)
- Keep deterministic output by making cap computation pure and seed-independent.

Current wiring status (as of now):
- Implemented:
  - calibration signals generation (day profile + overrun factors)
  - AI recommendation contract and fallback path
  - urgency/disruption/block-duration tuning in planner flow
- Not fully implemented:
  - hardcoded 120-min/day limit still present in scheduler path
  - AI daily capacity multiplier is not yet the dominant/authoritative capacity control

### Infeasibility policy
- If estimated remaining effort cannot fit before deadline:
  1. Return explicit infeasible status and deficit hours.
  2. Generate best-effort schedule for available capacity.
  3. Surface remediation options: extend deadline, increase weekly effort, allow disruption budget increase, or mark as backlog.
- Never silently return an apparently successful plan with near-zero blocks.

## 5) Phase Plan

## Phase 0 - Baseline and Instrumentation

Deliverables:
- Add planner debug logs for: eligible topics, allocated hours, unscheduled minutes, day spread.
- Add API response fields for diagnostics.
- Capture baseline metrics on current behavior.
- Add infeasibility diagnostics:
  - required_hours_before_deadline
  - feasible_hours_before_deadline
  - deficit_hours
  - infeasible_flag

Acceptance:
- Can explain any generated plan from logs + response metadata.

## Phase 1 - Macro Allocator Remake

Deliverables:
- Remove early-stop behavior that prematurely exits allocation.
- Ensure budget is consumed while needs remain.
- Add spread guard: allocate across multiple topics before saturation.
- Add deterministic tests for allocation completeness and spread.

Acceptance:
- For representative goals, allocated hours cover expected window budget.
- No single-topic lock unless prerequisites strictly force it.

## Phase 2 - Micro Scheduler Remake

Deliverables:
- Replace fixed 2h/day hard cap with dynamic per-day capacity policy.
- Enforce daily/topic spread constraints with deterministic tie-breaks.
- Add fairness and anti-clumping logic.
- Add tests for multi-day placement under normal availability.
- Add tests for high-pressure scenarios (many goals + near deadlines) to ensure controlled degradation.

Acceptance:
- Most plans distribute across 3+ days when availability allows.
- Scheduler returns explicit infeasible metadata when capacity is insufficient.

## Phase 2.5 - AI Trend Wiring Verification

Deliverables:
- Verify calibration -> advisor -> allocator/scheduler path is actually active in production code paths.
- Add explicit verification checklist:
  - AI day profile influences final day_cap
  - AI daily_capacity_multiplier changes scheduled output in deterministic tests
  - Removing hardcoded 120-min cap does not break spread/fairness
- Add telemetry fields for AI influence:
  - ai_enabled
  - ai_confidence
  - fallback_reason
  - capacity_profile_applied
  - urgency_boost_applied
- Add telemetry fields for dynamic cap:
  - base_daily_capacity_minutes
  - effective_daily_capacity_minutes
  - capacity_multiplier_applied
- Add kill-switch behavior tests (AI disabled should still produce stable plan).

Acceptance:
- AI trend signals are observable and auditable per plan run.
- Planner remains fully functional with AI unavailable.

## Phase 3 - Replan Strategy Separation

Deliverables:
- Split APIs/logic for:
  - goal-scoped generate
  - global replan
- Remove hidden global side effects from goal generate.
- Keep disruption-aware global replan policy.

Acceptance:
- Generating Goal A does not alter Goal B unless global replan endpoint is called.

## Phase 4 - Rolling Horizon Engine

Deliverables:
- Add scheduled background job (daily) to maintain 7-day horizon.
- If horizon < 7 days, auto-generate next range.
- Idempotent execution and lock protection.

Acceptance:
- Horizon is continuously maintained without manual actions.

## Phase 5 - History Window and Status Rules

Deliverables:
- Implement explicit recent-history window (4 days).
- Define allowed status edits for past blocks.
- Preserve historical blocks and surface in APIs.

Acceptance:
- User can review and update recent past blocks per policy.

## Phase 6 - Reliability/Fallback Hardening

Deliverables:
- Add fallback for retriever estimator when LLM/key unavailable.
- Keep planner executable with deterministic defaults.
- Harden ingest/planner error propagation to UI.
- Add fallback defaults for trend-based dynamic capacity when calibration data is sparse.

Acceptance:
- Planner pipeline remains functional in no-LLM local mode.

## Phase 7 - Frontend Planner UX Update

Deliverables:
- Show planner diagnostics (quality score, fallback reason, risk flags).
- Add past-window review panel (last 4 days).
- Keep schedule + retriever one-screen split with robust state messaging.

Acceptance:
- UI explains why a plan looks a certain way and what action to take.

## Phase 8 - Validation and Release

Deliverables:
- Unit tests for allocator/scheduler/replan.
- Integration tests for rolling horizon and status updates.
- E2E workflow tests for create -> ingest -> plan -> execute -> replan -> rollover.
- Migration notes and rollback plan.

Acceptance:
- Test suite green and baseline metrics improved.

## 6) Proposed File Touch Map

Backend likely files:
- backend/agents/planner/macro_allocator.py
- backend/agents/planner/micro_scheduler.py
- backend/agents/planner/agent.py
- backend/agents/planner/replan.py
- backend/api/routers/plans.py
- backend/api/routers/blocks.py
- backend/agents/retriever/estimator.py
- backend/shared/models/plan.py

Frontend likely files:
- frontend/src/lib/api.ts
- frontend/src/app/goals/[id]/page.tsx
- frontend/src/app/goals/[id]/plan/page.tsx
- frontend/src/app/goals/page.tsx

Tests likely files:
- backend/tests/test_planner/*
- backend/tests/test_api/*
- backend/tests/validation/*

## 7) Execution Order (Start Here)

Sprint 1 (highest impact):
1. Phase 1 allocator remake
2. Phase 2 scheduler cap/spread remake
3. Phase 2.5 AI trend wiring verification
4. Phase 3 API/logic separation for goal-generate vs global-replan

Sprint 2:
1. Phase 4 rolling horizon engine
2. Phase 5 history window + status policy
3. Phase 6 reliability hardening

Sprint 3:
1. Phase 7 frontend diagnostics and history UX
2. Phase 8 validation, performance checks, release

## 8) Risks and Mitigations

Risk: Regression in deterministic behavior.
- Mitigation: Seeded scheduling tests and snapshot comparisons.

Risk: Replan creates unstable user experience.
- Mitigation: Disruption budget and explicit global replan trigger.

Risk: Rolling job race conditions.
- Mitigation: Locking, idempotency keys, and safe retries.

## 9) Definition of Done (Final)

- Planner produces stable, multi-day 7-day schedules.
- Rolling horizon works automatically.
- Past 4-day review/update behavior is clear and implemented.
- Generate and replan responsibilities are cleanly separated.
- UI shows diagnostics and actionable planner state.
- Infeasible goals are explicitly reported with remediation options.
- Tests validate all critical paths.
