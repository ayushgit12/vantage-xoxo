"""Vantage API Gateway — FastAPI entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from shared.config import get_settings
from shared.db.cosmos_client import close_database
from shared.telemetry.tracing import init_tracing

from api.routers import goals, retriever, plans, blocks, sync, telemetry, users, constraints, embeddings, chat, quiz

logger = logging.getLogger(__name__)


import asyncio
from agents.planner.sweeper import sweep_all_users

async def run_daily_sweeper():
    while True:
        try:
            logger.info("Starting background daily sweeper...")
            await sweep_all_users()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in background sweeper: %s", e)
        # Sleep for 24 hours
        await asyncio.sleep(86400)

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_tracing("vantage-api")
    logger.info("Vantage API starting (env=%s)", settings.environment)
    
    # Start the continuous background sweeper
    sweeper_task = asyncio.create_task(run_daily_sweeper())
    
    yield
    
    sweeper_task.cancel()
    await close_database()
    logger.info("Vantage API shut down")


app = FastAPI(
    title="Vantage API",
    description="Universal Goal Orchestrator",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(goals.router, prefix="/api/goals", tags=["Goals"])
app.include_router(retriever.router, prefix="/api/retriever", tags=["Retriever"])
app.include_router(plans.router, prefix="/api/plans", tags=["Plans"])
app.include_router(blocks.router, prefix="/api/blocks", tags=["Blocks"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["Telemetry"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(constraints.router, prefix="/api/constraints", tags=["Constraints"])
app.include_router(embeddings.router, prefix="/api/embeddings", tags=["Embeddings"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["Quiz"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "vantage-api"}
