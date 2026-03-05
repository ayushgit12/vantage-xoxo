# Vantage Project Structure

```
vantage/
├── ARCHITECTURE.md
├── README.md
├── docker-compose.yml                # Local dev: all services
├── .env.example                      # Environment variables template
├── .gitignore
│
├── infra/                            # Azure IaC (Bicep)
│   ├── main.bicep                    # Top-level deployment
│   ├── modules/
│   │   ├── cosmos.bicep
│   │   ├── container-apps.bicep
│   │   ├── service-bus.bicep
│   │   ├── storage.bicep
│   │   ├── openai.bicep
│   │   └── app-insights.bicep
│   └── parameters.json
│
├── backend/                          # Python monorepo (all services)
│   ├── pyproject.toml
│   ├── Dockerfile
│   │
│   ├── shared/                       # Shared code across all services
│   │   ├── __init__.py
│   │   ├── models/                   # Pydantic data models
│   │   │   ├── __init__.py
│   │   │   ├── goal.py
│   │   │   ├── knowledge.py
│   │   │   ├── plan.py
│   │   │   ├── user.py
│   │   │   ├── constraint.py
│   │   │   └── agent_log.py
│   │   ├── db/                       # Database layer
│   │   │   ├── __init__.py
│   │   │   ├── cosmos_client.py
│   │   │   └── repositories.py
│   │   ├── bus/                      # Service Bus messaging
│   │   │   ├── __init__.py
│   │   │   └── service_bus.py
│   │   ├── cache/                    # LLM response cache
│   │   │   ├── __init__.py
│   │   │   └── cache.py
│   │   ├── telemetry/                # OpenTelemetry + App Insights
│   │   │   ├── __init__.py
│   │   │   └── tracing.py
│   │   └── config.py                 # Settings from env vars
│   │
│   ├── api/                          # FastAPI gateway
│   │   ├── __init__.py
│   │   ├── main.py                   # App entry point
│   │   ├── dependencies.py           # Auth, DB injection
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── goals.py              # /api/goals
│   │       ├── retriever.py          # /api/retriever
│   │       ├── plans.py              # /api/plans
│   │       ├── blocks.py             # /api/blocks
│   │       ├── sync.py               # /api/sync
│   │       └── telemetry.py          # /api/telemetry
│   │
│   ├── agents/                       # Agent implementations
│   │   ├── __init__.py
│   │   ├── retriever/
│   │   │   ├── __init__.py
│   │   │   ├── agent.py              # RetrieverAgent (Semantic Kernel)
│   │   │   ├── parsers/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── pdf_parser.py
│   │   │   │   ├── html_parser.py
│   │   │   │   ├── youtube_parser.py
│   │   │   │   ├── github_parser.py
│   │   │   │   └── text_parser.py
│   │   │   ├── chunker.py            # Text chunking
│   │   │   ├── extractor.py          # Topic/milestone extraction (LLM)
│   │   │   ├── estimator.py          # Hour estimation (rule-based)
│   │   │   ├── web_supplement.py     # Web search + merge
│   │   │   └── knowledge_builder.py  # Assemble GoalKnowledge
│   │   │
│   │   ├── planner/
│   │   │   ├── __init__.py
│   │   │   ├── agent.py              # PlannerAgent (Semantic Kernel)
│   │   │   ├── availability.py       # Build availability matrix
│   │   │   ├── macro_allocator.py    # Distribute hours across timeline
│   │   │   ├── micro_scheduler.py    # Deterministic block scheduling
│   │   │   ├── replan.py             # Partial replan logic
│   │   │   └── explainer.py          # Plan explanation (optional LLM)
│   │   │
│   │   └── executor/
│   │       ├── __init__.py
│   │       ├── agent.py              # ExecutorAgent (Semantic Kernel)
│   │       ├── calendar_sync.py      # Microsoft Graph integration
│   │       ├── mock_calendar.py      # Mock for demos
│   │       ├── reminders.py          # Reminder/summary logic
│   │       └── status_tracker.py     # Block status management
│   │
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_models.py
│       ├── test_retriever/
│       │   ├── test_parsers.py
│       │   ├── test_estimator.py
│       │   └── test_knowledge_builder.py
│       ├── test_planner/
│       │   ├── test_availability.py
│       │   ├── test_macro_allocator.py
│       │   ├── test_micro_scheduler.py
│       │   └── test_determinism.py
│       ├── test_executor/
│       │   └── test_calendar_sync.py
│       └── test_api/
│           ├── test_goals.py
│           └── test_plans.py
│
└── frontend/                         # Next.js 14 app
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── Dockerfile
    │
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx              # Dashboard
    │   │   ├── goals/
    │   │   │   ├── page.tsx          # Goal list
    │   │   │   ├── new/
    │   │   │   │   └── page.tsx      # Create goal
    │   │   │   └── [id]/
    │   │   │       ├── page.tsx      # Goal detail + knowledge
    │   │   │       └── plan/
    │   │   │           └── page.tsx  # Plan view
    │   │   └── settings/
    │   │       └── page.tsx          # Time constraints / profile
    │   │
    │   ├── components/
    │   │   ├── ui/                   # shadcn/ui components
    │   │   ├── goal-form.tsx
    │   │   ├── file-upload.tsx
    │   │   ├── availability-grid.tsx
    │   │   ├── plan-timeline.tsx
    │   │   ├── block-card.tsx
    │   │   ├── replan-diff.tsx
    │   │   └── knowledge-view.tsx
    │   │
    │   ├── lib/
    │   │   ├── api.ts               # API client
    │   │   └── types.ts             # TypeScript types matching backend models
    │   │
    │   └── hooks/
    │       ├── use-goals.ts
    │       ├── use-plan.ts
    │       └── use-availability.ts
    │
    └── public/
```
