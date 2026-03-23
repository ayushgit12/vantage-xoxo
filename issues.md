# Vantage Issues List

Last updated: 2026-03-23
Source: context audit in context.md

## A) Bugs To Solve (Verified)

1. Missing auth header in ingest stream request (frontend)
- Location: frontend/src/lib/api.ts (triggerIngestStream)
- Problem: direct fetch call does not set X-User-Id like shared apiFetch.
- Impact: ingest stream auth can fail while other API calls pass.

2. Insecure identity model enables user spoofing (backend)
- Location: backend/api/dependencies.py
- Problem: get_current_user_id trusts arbitrary X-User-Id and defaults to demo-user-001.
- Impact: user impersonation risk across all user-scoped endpoints.

3. Retriever fails without LLM key
- Location: backend/agents/retriever/estimator.py
- Problem: estimate_hours throws when key is missing; no fallback path.
- Impact: retriever pipeline breaks in local/no-key setups.

4. Web supplementation is placeholder only
- Location: backend/agents/retriever/web_supplement.py
- Problem: creates synthetic refs and null URLs, no real search provider.
- Impact: supplementation feature gives non-actionable results.

5. Timezone preference is not applied in planning
- Location: backend/shared/models/user.py, backend/agents/planner/availability.py
- Problem: timezone is stored but scheduling logic runs in UTC behavior.
- Impact: plans may be shifted relative to user local time.

6. Scenario intake/suggestions are hard LLM-dependent
- Location: backend/api/routers/goals.py, backend/shared/ai/llm.py
- Problem: no graceful fallback path when LLM config is missing/invalid.
- Impact: scenario creation UX can fail completely.

7. Query key interpolation risk in repository filters
- Location: backend/shared/db/repositories.py
- Problem: find_many injects filter key names directly into query field paths.
- Impact: unsafe/invalid query construction risk.

## B) Broken Or Incomplete Features (Verified)

1. No frontend file upload flow for goal materials
- Backend endpoint exists: POST /api/goals/{goal_id}/upload in backend/api/routers/goals.py
- Frontend gap: no file input/upload UI path.
- User impact: material upload is not usable from UI.

2. Real web supplementation not implemented
- Current behavior only returns placeholder references.
- User impact: no true discovery or citation-quality links.

3. Per-goal generate endpoint triggers global replan side effects
- Location: backend/api/routers/plans.py -> run_planner -> replan_all_goals in backend/agents/planner/agent.py
- User impact: generating one goal can reshuffle all active goal schedules.

4. Local no-LLM retriever experience is effectively broken
- Extractor has fallback, estimator does not.
- User impact: ingest still fails end-to-end without LLM.

5. Frontend typing mismatch for nullable resource URL
- Backend: ResourceRef.url can be null.
- Frontend: typed as non-null string in frontend/src/lib/api.ts.
- User impact: runtime assumptions can break when supplement refs carry null URL.

## C) Priority Suggestion

P0
- Auth spoofing via X-User-Id trust
- Missing ingest stream auth header

P1
- Retriever hard dependency on LLM key
- Timezone not applied in planner
- Global replan side effect on single-goal generate

P2
- Placeholder web supplementation
- Frontend upload flow missing
- Frontend nullable URL typing mismatch
- Repository query key safety hardening
