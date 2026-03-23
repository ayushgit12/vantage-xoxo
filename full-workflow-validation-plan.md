# Full Workflow Validation Plan

Last updated: 2026-03-23

## Goal
Build a real (non-dummy) workflow test and validation pipeline that verifies end-to-end behavior with real services.

## Scope
In scope:
- Real workflow execution (goal -> retriever -> planner -> block updates -> replan -> telemetry -> Ryuk chat)
- Real DB + real LLM path
- Deterministic guard tests for regression safety
- Quality validation checks on outputs
- One-command runner for full validation

Out of scope:
- UI redesign
- Non-critical refactors
- Broad architecture changes unrelated to validation

## Minimal Architecture
1. Fast regression layer (existing deterministic integration tests)
2. Live E2E layer (real DB + real LLM)
3. Live scenario matrix layer (2 to 4 goals per scenario)
4. Quality gate layer (schema + semantic checks)
5. Insights layer (LLM analysis of run artifacts, advisory only)

## Step-by-Step Plan

### Step 1: Freeze Fast Baseline
- Keep current deterministic workflow tests as mandatory guardrail.
- Purpose: catch logic regressions quickly and reliably.

Deliverable:
- Existing fast workflow test remains required in all runs.

### Step 2: Add Live E2E Workflow Test
- Add one new live test file for real service validation.
- Use real repo/router path (no monkeypatch for retriever/planner behavior under test).
- Execute a scenario matrix with 2 to 4 goals each run:
  - scenario A: 2 learning goals with distinct deadlines
  - scenario B: 3 goals with mixed status updates (done/partial/missed)
  - scenario C: 4 goals with global replan and telemetry integrity checks
  - each scenario runs create goal -> ingest retriever -> generate plan -> update statuses -> replan-all -> telemetry

Deliverable:
- `backend/tests/test_workflow_live_e2e.py`

### Step 3: Enforce Always-On Live Execution
- Live E2E is always part of the validation flow.
- If required DB/LLM config is missing, the run fails immediately with explicit error messages.
- No feature flag gating for live E2E execution.

Deliverable:
- mandatory preflight config validation in the runner

### Step 4: Add Ryuk Chatbot Validation
- Add real functional tests for Ryuk chatbot behavior using workflow context produced in the same run.
- Validate:
  - chat endpoint responds successfully
  - responses are grounded in goal/plan context
  - answers include schedule/topic data when asked
  - invalid/no-context cases return safe responses

Deliverable:
- `backend/tests/test_ryuk_live_e2e.py`

### Step 5: Add Output Quality Validation
- Add explicit checks for result quality, not just endpoint success.
- Validate:
  - non-empty topics
  - estimated hours > 0
  - plan metadata present (`quality_score`, `disruption_index`, `used_fallback`, `retry_triggered`)
  - telemetry fields populated
  - state transition rules enforced
  - Ryuk response quality gates (non-empty, relevant to asked context)

Deliverable:
- `backend/tests/validation/workflow_quality_checks.py`

### Step 6: Add Single Runner Script
- One script executes the full validation workflow in order:
  1. fast baseline tests
  2. live E2E scenario matrix tests (2 to 4 goals)
  3. Ryuk live E2E tests
  4. quality checks
  5. insights report generation

Deliverable:
- `backend/scripts/run_full_validation.py`

### Step 7: Keep Insights Advisory
- Always generate insights report from test outputs.
- Do not use insights to determine pass/fail.

Deliverable:
- integrated use of `backend/scripts/llm_test_insights.py` in runner

## Pass/Fail Rules
Hard fail:
- baseline test failures
- live E2E scenario matrix failures
- Ryuk live E2E failures
- quality check failures
- missing required DB/LLM configuration

Report-only:
- LLM insights generation errors

## Execution
Single mode only:
- baseline tests + live E2E scenario matrix + Ryuk E2E + quality checks + insights

## Acceptance Criteria
1. Validation run executes real end-to-end scenarios with 2 to 4 goals without monkeypatching critical LLM/DB paths.
2. Ryuk chatbot functionality is validated in the same run with context-grounded assertions.
3. Quality checks fail on malformed/empty/low-signal workflow or chatbot outputs.
4. One command runs the complete workflow and emits a single report set.
