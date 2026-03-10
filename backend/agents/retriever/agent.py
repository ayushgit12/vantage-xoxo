"""Retriever Agent — orchestrates parsing, extraction, estimation, and knowledge building.

Uses Semantic Kernel for agent orchestration.
LLM is used for topic/milestone extraction and structured topic time estimation.
"""

import logging
import time
from typing import Callable, Awaitable, Optional
from uuid import uuid4

from shared.config import get_settings
from shared.models import GoalKnowledge, AgentLog
from shared.db.repositories import goals_repo, knowledge_repo, logs_repo
from shared.bus.service_bus import send_message
from shared.telemetry.tracing import get_tracer

from agents.retriever.parsers import parse_all_materials
from agents.retriever.chunker import chunk_text
from agents.retriever.extractor import extract_topics_and_milestones
from agents.retriever.estimator import estimate_hours
from agents.retriever.web_supplement import supplement_if_needed
from agents.retriever.knowledge_builder import build_knowledge
from shared.models.goal import GoalType

logger = logging.getLogger(__name__)
tracer = get_tracer("retriever")

ProgressCallback = Optional[Callable[[int, str], Awaitable[None]]]


async def run_retriever(
    goal_id: str,
    user_id: str,
    on_progress: ProgressCallback = None,
) -> GoalKnowledge:
    """Full retriever pipeline for a goal."""
    trace_id = str(uuid4())
    t0 = time.monotonic()

    async def _progress(step: int, label: str) -> None:
        if on_progress:
            await on_progress(step, label)

    with tracer.start_as_current_span("retriever.run", attributes={"goal_id": goal_id}):
        # 1. Load goal
        await _progress(0, "Loading goal…")
        goal_doc = await goals_repo.find_by_id(goal_id)
        if not goal_doc:
            raise ValueError(f"Goal {goal_id} not found")

        if goal_doc.get("goal_type") == GoalType.HABIT:
            raise ValueError("Retriever is not applicable to habit goals")

        # 2. Parse all materials (files + URLs)
        await _progress(1, "Parsing materials & URLs…")
        raw_texts, resource_refs = await parse_all_materials(
            goal_doc.get("uploaded_file_ids", []),
            goal_doc.get("material_urls", []),
        )

        # 3. Chunk text for LLM processing
        await _progress(2, "Chunking text for analysis…")
        chunks = chunk_text(raw_texts)

        # 4. Extract topics and milestones via LLM
        await _progress(3, "Extracting topics via LLM…")
        extracted = await extract_topics_and_milestones(
            chunks=chunks,
            goal_title=goal_doc["title"],
            goal_category=goal_doc.get("category", "other"),
        )

        # 5. Estimate hours per topic via structured Gemini output
        await _progress(4, "Estimating hours per topic…")
        topics_with_hours = await estimate_hours(extracted["topics"], raw_texts)

        # 6. Supplement with web resources if needed
        await _progress(5, "Supplementing with web resources…")
        settings = get_settings()
        if not goal_doc.get("prefer_user_materials_only", False):
            topics_with_hours, extra_refs = await supplement_if_needed(
                topics=topics_with_hours,
                goal_title=goal_doc["title"],
                confidence=extracted.get("confidence", 0.5),
            )
            resource_refs.extend(extra_refs)

        # 7. Build final GoalKnowledge
        await _progress(6, "Building knowledge graph…")
        knowledge = build_knowledge(
            goal_id=goal_id,
            topics=topics_with_hours,
            milestones=extracted.get("milestones", []),
            resource_refs=resource_refs,
            confidence=extracted.get("confidence", 0.5),
        )

        # 8. Persist
        await _progress(7, "Persisting to database…")
        await knowledge_repo.upsert(goal_id, knowledge.model_dump(mode="json"), id_field="goal_id")
        await goals_repo.update(goal_id, {"knowledge_id": knowledge.knowledge_id})

        # 9. Log & Trigger planner
        await _progress(8, "Triggering planner agent…")
        duration_ms = int((time.monotonic() - t0) * 1000)
        log = AgentLog(
            agent_name="retriever",
            trace_id=trace_id,
            decision_summary=f"Extracted {len(knowledge.topics)} topics, {knowledge.estimated_total_hours:.1f}h total",
            duration_ms=duration_ms,
        )
        await logs_repo.insert(log.model_dump(mode="json"))

        await send_message(
            settings.service_bus_queue_planner,
            {"goal_id": goal_id, "user_id": user_id, "window_days": 7},
        )

        logger.info(
            "Retriever completed for goal %s: %d topics, %.1fh total (trace=%s)",
            goal_id, len(knowledge.topics), knowledge.estimated_total_hours, trace_id,
        )
        return knowledge
