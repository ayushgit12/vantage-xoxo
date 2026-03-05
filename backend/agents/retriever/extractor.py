"""Topic and milestone extraction using Azure OpenAI.

This is the PRIMARY LLM use in the entire system.
Results are cached by content hash to avoid duplicate calls.
"""

import json
import logging
from openai import AsyncAzureOpenAI

from shared.config import get_settings
from shared.cache.cache import get_cached, set_cached

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

Respond with valid JSON only:
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


async def extract_topics_and_milestones(
    chunks: list[str],
    goal_title: str,
    goal_category: str,
) -> dict:
    """Use Azure OpenAI to extract topics and milestones from text chunks."""

    # Build cache key from content
    cache_key = {
        "op": "extract_topics",
        "goal_title": goal_title,
        "chunks_hash": hash(tuple(chunks)),
    }

    cached = await get_cached(cache_key)
    if cached:
        logger.info("Using cached extraction for %s", goal_title)
        return cached

    settings = get_settings()

    # If no OpenAI key, fall back to simple heuristic extraction
    if not settings.azure_openai_api_key:
        logger.warning("No Azure OpenAI key; using heuristic extraction")
        return _heuristic_extraction(chunks, goal_title)

    client = AsyncAzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )

    chunks_text = "\n\n---CHUNK---\n\n".join(chunks[:10])  # Limit to 10 chunks

    response = await client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": "You extract structured learning data from text. Respond only with valid JSON."},
            {"role": "user", "content": EXTRACTION_PROMPT.format(
                goal_title=goal_title,
                goal_category=goal_category,
                chunks_text=chunks_text,
            )},
        ],
        temperature=0.0,  # Deterministic
        max_tokens=4000,
        response_format={"type": "json_object"},
    )

    result_text = response.choices[0].message.content
    result = json.loads(result_text)

    await set_cached(cache_key, result)
    logger.info("Extracted %d topics for %s via LLM", len(result.get("topics", [])), goal_title)
    return result


def _heuristic_extraction(chunks: list[str], goal_title: str) -> dict:
    """Fallback: extract topics from headings and structure."""
    topics = []
    seen = set()
    combined = "\n".join(chunks)

    for line in combined.split("\n"):
        line = line.strip()
        # Look for markdown headings or numbered items
        if line.startswith("#") or (len(line) > 3 and line[0].isdigit() and "." in line[:4]):
            title = line.lstrip("#").lstrip("0123456789.").strip()
            if title and title not in seen and len(title) < 100:
                seen.add(title)
                topics.append({
                    "title": title,
                    "description": "",
                    "prereq_titles": [],
                })

    # If no headings found, create a single topic from the goal
    if not topics:
        topics.append({
            "title": goal_title,
            "description": "Complete goal material",
            "prereq_titles": [],
        })

    return {
        "topics": topics,
        "milestones": [{"title": f"Complete {goal_title}", "description": "Finish all topics", "topic_titles": [t["title"] for t in topics]}],
        "confidence": 0.3,  # Low confidence for heuristic
    }
