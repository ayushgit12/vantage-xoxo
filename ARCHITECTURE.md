# Vantage — Universal Goal Orchestrator

## Architecture Overview

### System Components
1. **API Gateway** (FastAPI) — Single entry point, auth, routing
2. **Retriever Agent** — Ingests materials, extracts GoalKnowledge
3. **Planner Agent** — Macro allocation + deterministic micro scheduling
4. **Executor Agent** — Calendar sync, reminders, status tracking
5. **Frontend** (Next.js) — Goal creation, availability, plan view

### Data Flow
```
User → API Gateway → Retriever (produces GoalKnowledge)
                   → Planner (produces Plan + MicroBlocks)
                   → Executor (syncs calendar, tracks progress)
```

### LLM Usage (Azure OpenAI GPT-4.1, cached)
- Retriever: topic/milestone extraction from chunked text
- Retriever: web supplementation (max 3 sources, only if confidence < 0.6)
- Planner explanation (optional)
- Everything else: deterministic Python code

### Infrastructure (Azure)
- Azure Container Apps (3 agent containers + 1 API + 1 frontend)
- Azure Cosmos DB (MongoDB API) for all state
- Azure Blob Storage for uploaded files
- Azure Service Bus for agent-to-agent messaging
- Azure Application Insights + OpenTelemetry for tracing
- Azure OpenAI for LLM calls
- Microsoft Graph for calendar writes
- Azure AD (Entra ID) for authentication

### Key Design Decisions
1. **Deterministic planner**: No LLM in scheduling. Seeded tie-breakers.
2. **Cache everything**: LLM responses cached by content hash.
3. **Idempotent executor**: external_event_id prevents duplicate events.
4. **Partial replan only**: Never touch past blocks, only next K days.
5. **User controls discovery**: prefer_user_materials_only flag.
