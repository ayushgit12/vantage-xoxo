"""Topic and milestone extraction using LLM + SentenceTransformers.

- SentenceTransformers: clusters chunks into semantic groups (topics)
- LLM: generates structured topic/milestone descriptions
Results are cached by content hash to avoid duplicate API calls.
"""

import json
import logging
from shared.ai import run_prompt_via_graph

from shared.config import get_settings
from shared.cache.cache import get_cached, set_cached
from agents.retriever.embeddings import cluster_chunks, find_topic_labels

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are an expert curriculum analyzer. Given the following text chunks from learning materials for a goal, extract:

1. **Topics**: A list of distinct topics/concepts to learn, each with:
   - title: short descriptive name
   - description: 1-2 sentence description
   - prereq_titles: list of other topic titles that should be learned first

2. **Milestones**: Logical checkpoints in the learning journey, each with:
   - title: milestone name
   - description: what the learner should be able to do
   - topic_titles: which topics this milestone covers

3. **Confidence**: A score from 0.0 to 1.0 indicating how well the materials cover the goal.

Goal: {goal_title} (Category: {goal_category})

Respond with valid JSON only (no markdown, no code blocks):
{{
  "topics": [
    {{"title": "...", "description": "...", "prereq_titles": ["..."]}}
  ],
  "milestones": [
    {{"title": "...", "description": "...", "topic_titles": ["..."]}}
  ],
  "confidence": 0.8
}}

Material chunks:
{chunks_text}
"""

GOAL_ONLY_PROMPT = """You are an expert curriculum designer. A user wants to achieve the following goal but has not provided any study materials. Break this goal into a structured learning plan.

Goal: {goal_title} (Category: {goal_category})

Create 4-8 topics that cover the key areas needed to achieve this goal, ordered from foundational to advanced. Include milestones.

Respond with valid JSON only (no markdown, no code blocks):
{{
  "topics": [
    {{"title": "...", "description": "...", "prereq_titles": ["..."]}}
  ],
  "milestones": [
    {{"title": "...", "description": "...", "topic_titles": ["..."]}}
  ],
  "confidence": 0.5
}}
"""


async def extract_topics_and_milestones(
    chunks: list[str],
    goal_title: str,
    goal_category: str,
) -> dict:
    """Extract topics and milestones using SentenceTransformers + LLM."""

    # Filter out empty/whitespace-only chunks
    chunks = [c for c in chunks if c.strip()]

    # Build cache key from content
    cache_key = {
        "op": "extract_topics",
        "goal_title": goal_title,
        "chunks_hash": hash(tuple(chunks)) if chunks else hash(goal_title),
    }

    cached = await get_cached(cache_key)
    if cached:
        logger.info("Using cached extraction for %s", goal_title)
        return cached

    settings = get_settings()

    # If no material chunks, generate topics from goal title alone
    has_material = bool(chunks)

    if has_material:
        # Step 1: Use SentenceTransformers to cluster chunks into topic groups
        logger.info("Clustering %d chunks with SentenceTransformers", len(chunks))
        clusters = cluster_chunks(chunks, threshold=0.65)
        topic_hints = find_topic_labels(chunks, clusters)
        logger.info("Found %d topic clusters via embeddings", len(clusters))
    else:
        logger.info("No materials provided; will generate topics from goal title")
        clusters = []
        topic_hints = []

    # Step 2: If no LLM key, use embedding-based heuristic extraction
    active_key = settings.llm_api_key or settings.azure_openai_api_key
    if not active_key or active_key == "your-llm-api-key-here":
        logger.warning("No LLM API key; using SentenceTransformers-only extraction")
        return _embedding_extraction(chunks, clusters, topic_hints, goal_title)

    # Step 3: Use LLM to generate structured extraction

    if has_material:
        chunks_text = "\n\n---CHUNK---\n\n".join(chunks[:10])
        prompt = EXTRACTION_PROMPT.format(
            goal_title=goal_title,
            goal_category=goal_category,
            chunks_text=chunks_text,
        )
    else:
        prompt = GOAL_ONLY_PROMPT.format(
            goal_title=goal_title,
            goal_category=goal_category,
        )

    # --- DEBUG ---
    logger.info("[DEBUG] LLM model: %s", settings.llm_model)
    logger.info("[DEBUG] Prompt length: %d chars", len(prompt))
    logger.info("[DEBUG] Has material: %s, Chunks count: %d", has_material, len(chunks))

    try:
        result_text = run_prompt_via_graph(
            prompt,
            temperature=0.0,
            json_mode=True,
        )
    except Exception as e:
        logger.error("[DEBUG] LLM API call failed: %s", e, exc_info=True)
        raise

    result_text = result_text.strip()
    logger.info("[DEBUG] LLM raw response length: %d chars", len(result_text))
    logger.info("[DEBUG] LLM raw response (first 500 chars):\n%s", result_text[:500])

    # Strip markdown code fences if present
    import re
    result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
    result_text = re.sub(r"\n?```\s*$", "", result_text)
    result_text = result_text.strip()

    try:
        result = json.loads(result_text)
    except json.JSONDecodeError as e:
        logger.error("[DEBUG] JSON parse error: %s", e)
        logger.error("[DEBUG] Full raw response:\n%s", result_text)
        raise ValueError(f"LLM returned invalid JSON: {e}") from e

    await set_cached(cache_key, result)
    logger.info("Extracted %d topics for %s via LLM", len(result.get("topics", [])), goal_title)
    return result


def _embedding_extraction(
    chunks: list[str],
    clusters: list[list[int]],
    topic_hints: list[str],
    goal_title: str,
) -> dict:
    """Fallback: build topics from SentenceTransformers clusters without LLM."""
    topics = []
    for i, (cluster, hint) in enumerate(zip(clusters, topic_hints)):
        title = hint.lstrip("#").lstrip("0123456789.").strip()[:80]
        if not title:
            title = f"Topic {i + 1}"
        topics.append({
            "title": title,
            "description": f"Covers {len(cluster)} section(s) of material",
            "prereq_titles": [topics[i - 1]["title"]] if i > 0 else [],
        })

    if not topics:
        topics.append({
            "title": goal_title,
            "description": "Complete goal material",
            "prereq_titles": [],
        })

    return {
        "topics": topics,
        "milestones": [
            {
                "title": f"Complete {goal_title}",
                "description": "Finish all topics",
                "topic_titles": [t["title"] for t in topics],
            }
        ],
        "confidence": 0.4,
    }


def _heuristic_extraction(chunks: list[str], goal_title: str) -> dict:
    """Legacy fallback: extract topics from headings and structure."""
    topics = []
    seen = set()
    combined = "\n".join(chunks)

    for line in combined.split("\n"):
        line = line.strip()
        if line.startswith("#") or (len(line) > 3 and line[0].isdigit() and "." in line[:4]):
            title = line.lstrip("#").lstrip("0123456789.").strip()
            if title and title not in seen and len(title) < 100:
                seen.add(title)
                topics.append({
                    "title": title,
                    "description": "",
                    "prereq_titles": [],
                })

    if not topics:
        topics.append({
            "title": goal_title,
            "description": "Complete goal material",
            "prereq_titles": [],
        })

    return {
        "topics": topics,
        "milestones": [{"title": f"Complete {goal_title}", "description": "Finish all topics", "topic_titles": [t["title"] for t in topics]}],
        "confidence": 0.3,
    }
