"""Plan explainer — optional LLM-generated explanation of planner decisions.

This is the ONLY optional LLM call in the planner.
If no Azure OpenAI key, returns a simple template-based explanation.
"""

import logging
from shared.models import Plan, GoalKnowledge
from shared.config import get_settings
from shared.cache.cache import get_cached, set_cached

logger = logging.getLogger(__name__)


async def explain_plan(plan: Plan, knowledge: GoalKnowledge) -> str:
    """Generate a human-readable explanation of the plan."""
    settings = get_settings()

    # Template-based explanation (always works)
    num_blocks = len(plan.micro_blocks)
    total_min = sum(b.duration_min for b in plan.micro_blocks)
    topics = {b.topic_id for b in plan.micro_blocks}

    explanation = (
        f"Plan covers {num_blocks} study blocks totaling {total_min // 60}h {total_min % 60}m "
        f"across {len(topics)} topics over {plan.plan_window_days} days. "
    )

    if knowledge.topics:
        first_topic = knowledge.topics[0].title
        explanation += f"Starting with: {first_topic}. "

    explanation += "Blocks are scheduled in your preferred time windows, respecting all constraints."

    # Optionally enhance with LLM
    if settings.azure_openai_api_key:
        cache_key = {"op": "explain_plan", "plan_id": plan.plan_id}
        cached = await get_cached(cache_key)
        if cached:
            return cached.get("explanation", explanation)

        try:
            from openai import AsyncAzureOpenAI

            client = AsyncAzureOpenAI(
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
            )
            resp = await client.chat.completions.create(
                model=settings.azure_openai_deployment,
                messages=[
                    {"role": "system", "content": "You explain study plans concisely in 2-3 sentences."},
                    {"role": "user", "content": f"Explain this plan: {explanation}"},
                ],
                temperature=0.0,
                max_tokens=200,
            )
            llm_explanation = resp.choices[0].message.content
            await set_cached(cache_key, {"explanation": llm_explanation})
            return llm_explanation
        except Exception as e:
            logger.warning("LLM explanation failed, using template: %s", e)

    return explanation
