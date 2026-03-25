# Vantage Repository Context (2026-03-23)

This file supersedes ARCHITECTURE.md and README.md for implementation reality.

## Current System Snapshot

- Backend: FastAPI + CosmosDB repository layer + Retriever/Planner/Executor agents.
- Frontend: Next.js App Router with goal creation, goal dashboard, planning, settings, embeddings, and chat UI.
- Auth: MVP header-based identity via `X-User-Id` in backend dependency (`demo-user-001` default).
- Planning model: Global, collision-aware replanning is the effective scheduling behavior.
- Calendar sync: Mock calendar works locally; Graph sync path exists for real credentials.

## 1) Bugs To Solve (Verified)

1. Missing auth header in ingest stream request (frontend)
- Where: `frontend/src/lib/api.ts` (`triggerIngestStream`)
- Issue: Uses `fetch` directly without setting `X-User-Id`, unlike `apiFetch`.
- Impact: `/api/retriever/ingest-stream` can fail auth while other API calls succeed.

2. Insecure identity model enables user spoofing (backend)
- Where: `backend/api/dependencies.py`
- Issue: `get_current_user_id` trusts arbitrary `X-User-Id` header and defaults to `demo-user-001`.
- Impact: Any client can impersonate another user by changing the header.

3. Retriever cannot run without LLM key despite docs claiming local heuristic behavior
- Where: `backend/agents/retriever/estimator.py`
- Issue: `estimate_hours` raises if no LLM key; no fallback path in estimator.
- Impact: Retriever pipeline hard-fails in no-key local dev scenarios.

4. Web supplementation is placeholder only
- Where: `backend/agents/retriever/web_supplement.py`
- Issue: Generates synthetic refs with `url=None` and no search integration.
- Impact: "supplementation" does not add real sources.

5. Timezone preference not applied by planner scheduling
- Where: `backend/shared/models/user.py`, `backend/agents/planner/availability.py`
- Issue: User profile stores `timezone`, but availability/scheduling uses UTC dates/times.
- Impact: Plans can be shifted from the user’s intended local day/time.

6. Scenario suggestion and intake flows are LLM-hard-dependent
- Where: `backend/api/routers/goals.py`, `backend/shared/ai/llm.py`
- Issue: No graceful fallback if LLM settings are missing/invalid.
- Impact: Scenario UX can fail entirely in local/MVP environments.

7. Query field name injection risk in repository filters
- Where: `backend/shared/db/repositories.py`
- Issue: `find_many` interpolates filter keys directly into Cosmos SQL field paths.
- Impact: Unexpected field names can produce unsafe or invalid queries.

## 2) Broken Or Incomplete Features (Verified)

1. No frontend file-upload flow for goal materials
- Backend endpoint exists: `POST /api/goals/{goal_id}/upload` in `backend/api/routers/goals.py`.
- Frontend has no file input/upload call path.
- User-visible gap: "upload materials" is not actually usable in UI.

2. Real web supplementation is not implemented
- The feature is exposed in pipeline behavior, but returns placeholder references only.

3. Per-goal generate endpoint triggers global replan side effects
- Where: `backend/api/routers/plans.py` -> `run_planner(...)` -> `replan_all_goals(...)` in `backend/agents/planner/agent.py`.
- User-visible mismatch: calling generate for one goal can reshuffle all active goals.

4. Local-no-LLM retriever experience is effectively broken
- Extractor has non-LLM fallback, but estimator is strict LLM-only, so end-to-end ingest still fails.

5. Frontend typing mismatch risk for optional/null resource URLs
- Backend `ResourceRef.url` is nullable.
- Frontend `ResourceRef.url` is typed as non-null string in `frontend/src/lib/api.ts`.
- Can create runtime assumptions/issues when supplement refs carry null URLs.

## 3) Architecture Improvements

1. Replace header-based auth with JWT validation
- Integrate Entra ID JWT verification in FastAPI dependency layer.
- Remove default identity fallback in non-dev environments.

2. Add idempotency and concurrency controls
- Use idempotency keys on mutating endpoints (`generate`, `replan-all`, `sync`, block status).
- Add optimistic concurrency (etag/version) around plan updates.

3. Split planner APIs by intent
- Keep one endpoint for global conflict-aware replanning.
- Add explicit "single-goal isolated preview" endpoint if that behavior is needed.
- Document side effects clearly in API contracts.

4. Introduce capability/fallback strategy for LLM-dependent features
- Add feature flags and deterministic fallback implementations for:
  - hour estimation
  - scenario suggestions/intake
  - optional explanations
- Make behavior explicit in config and health endpoints.

5. Enforce repository query safety
- Whitelist allowed filter fields per repository.
- Avoid interpolating arbitrary key names into query strings.

6. Make timezone first-class in planning
- Convert user preferred windows and constraints into UTC once per plan run.
- Preserve local-time rendering metadata for frontend.

7. Improve event-driven architecture boundaries
- Planner/retriever/executor are currently callable from API directly and via bus.
- Define clear command/event contracts, retry policy, and dead-letter strategy.

8. Add integration test layer around critical flows
- Current tests are mostly unit-level and backend-focused; frontend has no tests.
- Add API integration tests for goal->ingest->plan->sync and status-triggered replan.

## 4) New Features To Add (High Value)

1. Material Upload UX
- Drag/drop file upload on goal detail page.
- Show upload progress, file management, and parse readiness state.

2. Plan Diff / Replan Preview
- Before committing replan, show "kept / moved / added / removed" blocks.
- Helps trust and reduces surprise from global replans.

3. True Resource Discovery
- Implement real web search connector with citation quality scoring.
- Keep user opt-out (`prefer_user_materials_only`) as hard guardrail.

4. Calendar Conflict & Two-way Sync
- Fetch existing calendar events and avoid collisions.
- Optional pull-back status updates from calendar outcomes.

5. Notification Layer
- SSE/WebSocket updates for ingest and planning status.
- Toasts/reminders for upcoming blocks and drift alerts.

6. Goal Templates and Guided Onboarding
- Template library for common goals (exam prep, fitness, language, project).
- Reduces cold-start friction.

7. Collaboration (optional tier)
- Shared goals, coach/mentor view, and review comments on plans/topics.

8. Observability and Cost Controls
- Track per-request token usage, latency, and retries.
- Add cost budget limits and per-user throttling.

9. Frontend test suite bootstrap
- Add Playwright smoke tests and basic component/integration tests.
- Cover goal creation, ingest, plan generation, and status transitions.

## Evidence Notes

This context file is derived from direct source inspection across backend routers/agents/models/repositories and frontend app/lib code, not from deprecated docs.
