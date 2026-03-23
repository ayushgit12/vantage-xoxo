"""Ryuk chatbot — RAG-powered Q&A over the user's goals, topics & schedule."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import numpy as np

from api.dependencies import get_current_user_id
from agents.retriever.embeddings import embed_texts, compute_similarity
from shared.ai import stream_chat_via_langchain
from shared.config import get_settings
from shared.db.repositories import goals_repo, knowledge_repo, plans_repo

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = """You are Ryuk, a helpful study assistant for the Vantage goal planner app.
You ONLY answer questions using the context provided below. If the answer is not in the context, say you don't have that information.
Be concise, friendly, and helpful. Use the schedule and topic data to give specific dates, times, and actionable info.
When mentioning dates/times format them in a human-readable way.
Do not make up information that is not in the context.

--- CONTEXT ---
{context}
--- END CONTEXT ---

Current time: {now}
"""


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # [{role: "user"|"assistant", content: str}]


def _build_context(goals: list[dict], knowledge_docs: list, plan_docs: list) -> str:
    """Build a text context from the user's goals, topics, and schedule."""
    parts: list[str] = []

    for goal in goals:
        gid = goal.get("goal_id", "")
        title = goal.get("title", "Untitled")
        status = goal.get("status", "unknown")
        deadline = goal.get("deadline", "")
        desc = goal.get("description", "")
        parts.append(f"## Goal: {title}\nStatus: {status} | Deadline: {deadline}\nDescription: {desc}\n")

        # Topics from knowledge
        k_doc = next((k for k in knowledge_docs if k and k.get("goal_id") == gid), None)
        if k_doc:
            topics = k_doc.get("topics", [])
            if topics:
                parts.append("Topics for this goal:")
                for t in topics:
                    parts.append(
                        f"  - {t.get('title', '?')} ({t.get('est_hours', '?')}h): {t.get('description', '')}"
                    )

        # Schedule blocks from plans
        plan = next((p for p in plan_docs if p and p.get("goal_id") == gid), None)
        if plan:
            blocks = plan.get("micro_blocks", [])
            if blocks:
                parts.append("Scheduled study blocks:")
                # Build a topic_id -> title map
                topic_map: dict[str, str] = {}
                if k_doc:
                    for t in k_doc.get("topics", []):
                        topic_map[t.get("topic_id", "")] = t.get("title", "")
                for b in blocks:
                    topic_title = topic_map.get(b.get("topic_id", ""), b.get("notes", "study"))
                    start = b.get("start_dt", "")
                    duration = b.get("duration_min", 30)
                    block_status = b.get("status", "scheduled")
                    parts.append(
                        f"  - {topic_title}: {start} ({duration}min) [{block_status}]"
                    )
        parts.append("")

    return "\n".join(parts)


def _find_relevant_topics(query: str, all_texts: list[str], top_k: int = 10) -> list[int]:
    """Return indices of the most relevant texts to the query using embedding similarity."""
    if not all_texts:
        return []
    query_emb = embed_texts([query])
    text_embs = embed_texts(all_texts)
    # Cosine similarity
    norms_q = np.linalg.norm(query_emb, axis=1, keepdims=True)
    norms_t = np.linalg.norm(text_embs, axis=1, keepdims=True)
    norms_q = np.where(norms_q == 0, 1, norms_q)
    norms_t = np.where(norms_t == 0, 1, norms_t)
    sims = ((query_emb / norms_q) @ (text_embs / norms_t).T)[0]
    top_indices = np.argsort(sims)[::-1][:top_k]
    return [int(i) for i in top_indices if sims[i] > 0.15]


@router.post("/message")
async def chat_message(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Stream a chat response from Ryuk using RAG over the user's data."""
    settings = get_settings()
    if not (settings.llm_api_key or settings.azure_openai_api_key):
        async def no_llm_response():
            yield (
                "I can help once LLM configuration is available. "
                "For now, please set an API key and try again."
            )

        return StreamingResponse(no_llm_response(), media_type="text/plain")

    # Fetch all user data
    all_goals = await goals_repo.find_many({"user_id": user_id})
    if not all_goals:
        async def no_goals_response():
            yield (
                "You do not have goals yet. Create a goal first, "
                "then I can help with planning, study blocks, and progress."
            )

        return StreamingResponse(no_goals_response(), media_type="text/plain")

    knowledge_docs = []
    plan_docs = []
    for goal in all_goals:
        gid = goal.get("goal_id", "")
        k_doc = await knowledge_repo.find_by_id(gid, id_field="goal_id")
        knowledge_docs.append(k_doc)
        plan_doc = await plans_repo.find_by_id(gid, id_field="goal_id")
        plan_docs.append(plan_doc)

    # Build full context
    context = _build_context(all_goals, knowledge_docs, plan_docs)

    # Build system prompt
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y %I:%M %p UTC")
    system = SYSTEM_PROMPT.format(context=context, now=now)

    async def stream_response():
        try:
            for delta in stream_chat_via_langchain(
                system_prompt=system,
                history=body.history,
                user_message=body.message,
                temperature=0.2,
            ):
                yield delta
        except Exception as e:
            logger.error("LLM streaming error: %s", e)
            yield f"\n[Error: {e}]"

    return StreamingResponse(stream_response(), media_type="text/plain")
