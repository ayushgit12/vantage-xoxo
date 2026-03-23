# Quality Improvement Playbook

Last updated: 2026-03-23

## Goal

Improve outcome quality across three areas:
1. User workflow quality (clarity, trust, conversion)
2. Planner quality (realism, stability, personalization)
3. Retriever quality (coverage, accuracy, usefulness)

## 1) User Workflow Improvements

1. Add a guided onboarding flow
- Ask 5 key questions at goal creation: deadline strictness, weekly capacity, preferred study windows, materials available, and success definition.
- Pre-fill defaults from profile and previous goals.
- Outcome: better inputs, fewer invalid plans.

2. Add a two-step goal confirmation
- Step 1: Goal draft with assumptions shown.
- Step 2: User approves or edits assumptions before ingestion/planning.
- Outcome: fewer wrong goal interpretations.

3. Add quality gates before plan generation
- Block generation if required fields are missing or contradictory.
- Show actionable fix prompts, not generic errors.
- Outcome: reduced failure loops.

4. Add explainability panel on every generated plan
- Show why blocks were scheduled at specific times.
- Show which constraints affected each decision.
- Outcome: higher user trust and fewer manual edits.

5. Add a replan preview screen
- Show added, moved, removed, and unchanged blocks before applying replan.
- Allow user to pin critical blocks before applying.
- Outcome: less schedule shock.

6. Add quick-feedback capture after each major action
- Ask one-click feedback after ingest and after plan generation.
- Capture labels: unclear, too hard, too easy, wrong order, wrong timing.
- Outcome: continuous product-learning loop.

7. Add proactive reminders and drift alerts
- Notify when user falls behind and suggest one-tap catch-up strategies.
- Outcome: higher completion rate.

## 2) Planner Quality Improvements

1. Introduce planner quality objectives
- Objective A: schedule feasibility.
- Objective B: stability between replans.
- Objective C: progress velocity toward deadline.
- Outcome: explicit optimization targets.

2. Add hard and soft constraints explicitly
- Hard constraints: sleep, fixed commitments, blocked windows.
- Soft constraints: preferred windows, topic spacing, cognitive load limits.
- Outcome: plans respect non-negotiables while remaining flexible.

3. Add a plan scoring layer
- Compute feasibility score, overload score, fragmentation score, and deadline risk score.
- Reject or warn on low-score plans.
- Outcome: bad plans are caught before user sees them.

4. Improve replan stability policy
- Preserve as many future blocks as possible.
- Limit max moved blocks per replan window.
- Use change budget policy for minimal disruption.
- Outcome: predictable schedules.

5. Add adaptive block sizing
- Use shorter blocks when confidence is low or user misses frequently.
- Use longer deep-work blocks for advanced topics and high confidence.
- Outcome: higher completion probability.

6. Add topic sequencing intelligence
- Enforce prerequisite order with cycle detection.
- Add spaced reinforcement for difficult topics.
- Alternate high-load and low-load sessions.
- Outcome: better learning retention and less burnout.

7. Add per-user calibration
- Learn actual completion rates and overrun patterns.
- Auto-adjust future block duration and weekly effort recommendations.
- Outcome: plans become realistic for each user.

8. Add planning simulation before commit
- Simulate next 7 to 14 days and surface risk hotspots.
- Offer one-click alternatives: conservative, balanced, aggressive.
- Outcome: user chooses confidence profile.

## 3) Retriever Quality Improvements

1. Add source quality ranking
- Score sources by relevance, authority, freshness, and signal quality.
- Prefer trusted domains and high-quality user materials.
- Outcome: better topic extraction inputs.

2. Improve chunking strategy
- Use semantic chunking with overlap and section-aware boundaries.
- Keep metadata for source, heading, and position.
- Outcome: fewer context breaks and better extraction fidelity.

3. Add extraction consistency checks
- Validate that topics map to actual evidence spans.
- Detect duplicates and low-information topics.
- Enforce min quality thresholds before publishing knowledge.
- Outcome: cleaner knowledge graph.

4. Add hybrid retrieval and reranking
- Combine lexical + embedding retrieval.
- Add reranker model for final context set.
- Outcome: higher precision for relevant content.

5. Add confidence calibration
- Distinguish model confidence from evidence confidence.
- If confidence is low, request user confirmation before planning.
- Outcome: fewer false assumptions.

6. Add robust fallback path when LLM is unavailable
- Use deterministic heuristic extraction + conservative hour estimates.
- Mark output quality level visibly in UI.
- Outcome: graceful degradation instead of hard failure.

7. Add incremental ingestion
- Reprocess only changed materials and impacted topics.
- Preserve stable topic IDs and provenance.
- Outcome: faster updates and less plan churn.

8. Add citation-first output format
- Every topic should include top evidence snippets and source links.
- Outcome: transparent, debuggable retriever outputs.

## 4) Measurement Framework

Track these quality KPIs weekly:

1. Workflow KPIs
- Goal creation completion rate
- Time-to-first-plan
- Replan acceptance rate
- User trust score after plan review

2. Planner KPIs
- Plan feasibility pass rate
- Replan disruption index (percent blocks moved)
- On-time block completion rate
- Deadline miss probability by cohort

3. Retriever KPIs
- Topic precision and recall from audit samples
- Source usefulness rating
- Low-confidence output rate
- No-LLM fallback success rate

4. Business KPIs
- Weekly active users
- 7-day and 30-day retention
- Goal completion rate
- Support tickets per 100 users

## 5) 30-60-90 Day Rollout

First 30 days
1. Implement workflow quality gates and plan explanation panel.
2. Add planner scoring and cycle detection.
3. Add retriever fallback path and confidence labels.

Day 31 to 60
1. Launch replan preview with pinning.
2. Add hybrid retrieval and reranking.
3. Add adaptive block sizing and stability budget.

Day 61 to 90
1. Add per-user calibration loops.
2. Add incremental ingestion and provenance graph.
3. Run A/B experiments on conservative vs balanced planning modes.

## 6) Immediate Quick Wins

1. Fix ingest-stream auth header parity with standard API calls.
2. Add nullable-safe typing for resource URLs in frontend models.
3. Add clear low-confidence warning state before plan generation.
4. Add plan scoring telemetry event for every generate and replan.
5. Add a simple plan diff view before applying replan.
