# Vantage — Universal Goal Orchestrator

Three cooperating AI agents (Retriever, Planner, Executor) working in harmony to create complete study/project plans with deadlines and reminders.

## Quick Start (Local Development)

```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with your Azure OpenAI key (optional — works without it using heuristics)

# 2. Start all services
docker compose up --build

# 3. Open
# Frontend: http://localhost:3000
# API:      http://localhost:8000/docs  (Swagger UI)
```

## Architecture

```
Frontend (Next.js) → API Gateway (FastAPI) → Service Bus → Agent Workers
                                                              ├── Retriever (parses materials, extracts GoalKnowledge)
                                                              ├── Planner   (deterministic scheduling)
                                                              └── Executor  (calendar sync)
```

**All state lives in Cosmos DB (MongoDB API). Files in Azure Blob Storage.**

## LLM Usage

| Component | Uses LLM? | Details |
|---|---|---|
| Retriever: topic extraction | YES | Azure OpenAI GPT-4o-mini, cached |
| Retriever: hour estimation | NO | Rule-based heuristics |
| Planner: scheduling | NO | Deterministic algorithm, seeded |
| Planner: explanation | Optional | Cached |
| Executor | NO | Pure API calls |

## Project Structure

```
backend/
  api/          FastAPI gateway + routers
  agents/
    retriever/  Parsers, chunker, extractor (LLM), estimator, knowledge builder
    planner/    Availability matrix, macro allocator, micro scheduler, replan
    executor/   Calendar sync (Graph + mock), reminders, status tracker
  shared/       Models, DB, bus, cache, telemetry, config
  tests/        pytest tests

frontend/
  src/app/      Next.js App Router pages
  src/lib/      API client + types
  src/components/ UI components

infra/          Azure Bicep templates
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/goals` | Create goal with materials/URLs |
| GET | `/api/goals` | List user's goals |
| GET | `/api/goals/{id}` | Goal detail |
| POST | `/api/goals/{id}/upload` | Upload file for goal |
| POST | `/api/retriever/ingest?goal_id=` | Trigger retriever agent |
| GET | `/api/retriever/knowledge/{goal_id}` | View GoalKnowledge |
| POST | `/api/plans/generate?goal_id=&window=7` | Generate plan |
| GET | `/api/plans/{plan_id}` | View plan |
| POST | `/api/blocks/{block_id}/status` | Update block (done/missed) → triggers replan |
| POST | `/api/sync/calendar/{plan_id}` | Sync to Microsoft Calendar |
| GET | `/api/telemetry/trace/{trace_id}` | View agent trace |

## 4-Day Implementation Execution Plan

### Day 1 — Foundations (You Are Here After Scaffolding)

**Azure Setup:**
```bash
# Login
az login

# Create resource group
az group create --name vantage-rg --location eastus

# Deploy infrastructure
az deployment group create \
  --resource-group vantage-rg \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json

# Create ACR
az acr create --resource-group vantage-rg --name vantageacrdev --sku Basic

# Register Azure AD app (for Graph API later)
az ad app create --display-name "Vantage" --web-redirect-uris "http://localhost:8000/auth/callback"
```

**What to verify:**
- [ ] `docker compose up` starts all services
- [ ] `POST /api/goals` creates a goal and returns it
- [ ] `GET /api/goals` lists goals
- [ ] Frontend loads at :3000 and goal creation form works

### Day 2 — Retriever Agent

**Tasks:**
1. Test PDF upload → blob storage → text extraction
2. Test URL parsing (HTML, YouTube, GitHub)
3. Test chunker produces manageable chunks
4. Test LLM extraction (with Azure OpenAI key) OR heuristic fallback
5. Test hour estimator produces reasonable numbers
6. Verify end-to-end: upload syllabus → GoalKnowledge with topics/hours

**What to verify:**
- [ ] Upload a syllabus PDF → see extracted topics with hour estimates
- [ ] Add a YouTube playlist URL → see it in resource refs
- [ ] With `prefer_user_materials_only=true` → no web supplementation
- [ ] GoalKnowledge visible on frontend goal detail page

### Day 3 — Planner Agent

**Tasks:**
1. Set up availability grid with sleep + constraints
2. Test macro allocator distributes hours respecting deadlines/dependencies
3. Test micro scheduler places blocks in available slots
4. Test determinism: same inputs → same output (run 3x, compare)
5. Test partial replan: mark block missed → only next 7 days change
6. Connect plan view in frontend

**What to verify:**
- [ ] Generate 7-day plan → blocks appear in available slots only
- [ ] No blocks during sleep hours (11pm-7am default)
- [ ] Same inputs produce identical plan 3 times
- [ ] Mark a block missed → partial replan triggers
- [ ] Plan view in frontend shows blocks grouped by day

### Day 4 — Executor + Polish + Demo

**Tasks:**
1. Test mock calendar sync (assigns event IDs)
2. If Graph API consent configured: test real calendar sync
3. Add status toggle buttons in frontend
4. Test replan diff preview
5. Verify Application Insights traces appear
6. Record E2E demo

**E2E Demo Script:**
1. Create goal "Learn ML" with deadline 3 months away
2. Upload a syllabus PDF + YouTube playlist URL
3. Trigger retriever → see GoalKnowledge (topics, hours)
4. Generate 7-day plan → see blocks in timeline
5. Sync to calendar → mock events created
6. Mark 2 blocks done, 1 missed
7. See partial replan → new blocks replace missed one
8. Check Application Insights for planner traces

**What to verify:**
- [ ] Full E2E flow works without errors
- [ ] Calendar sync creates mock events
- [ ] Replan diff shows added/removed blocks
- [ ] Traces visible in telemetry endpoint

## Running Tests

```bash
cd backend
pip install -e ".[dev]"
pytest tests/ -v
```

## Deploying to Azure

```bash
# Build and push images
az acr login --name vantageacrdev
docker build -t vantageacrdev.azurecr.io/vantage-backend:latest ./backend
docker build -t vantageacrdev.azurecr.io/vantage-frontend:latest ./frontend
docker push vantageacrdev.azurecr.io/vantage-backend:latest
docker push vantageacrdev.azurecr.io/vantage-frontend:latest

# Deploy infra (if not already done)
az deployment group create \
  --resource-group vantage-rg \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.json
```

## Key Design Decisions

1. **Deterministic Planner**: No LLM in scheduling. Seeded `random.Random(42)` for tie-breaking. Identical inputs → identical output.
2. **LLM Only for Understanding**: Azure OpenAI used only in Retriever for topic extraction from unstructured text. All responses cached by content hash.
3. **Idempotent Executor**: `external_event_id` on each MicroBlock prevents duplicate calendar events. Patch existing events on replan.
4. **Partial Replan Only**: Never touch past blocks. Only reschedule next K days (default 7). Macro changes require user consent.
5. **User Controls Discovery**: `prefer_user_materials_only` flag prevents unwanted web supplementation.
6. **Local Dev Without Azure**: Docker Compose with MongoDB and Azurite. Service Bus falls back to in-process async queues. Calendar uses mock.
