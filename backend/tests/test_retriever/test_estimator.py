"""Test structured topic estimation."""

from types import SimpleNamespace

import pytest

from agents.retriever import estimator


class _FakeModel:
    def __init__(self, response_text: str):
        self._response_text = response_text

    def generate_content(self, prompt, generation_config=None):
        return SimpleNamespace(text=self._response_text)


  def test_estimation_prompt_formats_literal_json_example():
    formatted = estimator.ESTIMATION_PROMPT.format(
      total_chars=1234,
      approx_pages=1,
      video_mentions=0,
      sample_excerpt='"example"',
      topics_json='[{"title": "Topic A"}]',
    )

    assert '"topics": [' in formatted
    assert '{"title": "Topic A"}' in formatted


@pytest.mark.asyncio
async def test_structured_estimation(monkeypatch):
    topics = [
        {"title": "Introduction to Python", "description": "", "prereq_titles": []},
        {"title": "Advanced Algorithms", "description": "", "prereq_titles": []},
        {"title": "Building a Project", "description": "", "prereq_titles": []},
    ]
    raw_texts = ["x" * 30_000]

    fake_response = """
    {
      "topics": [
        {
          "title": "Introduction to Python",
          "estimated_hours": 1.0,
          "min_hours": 0.5,
          "max_hours": 2.0,
          "difficulty": "beginner",
          "scope": "narrow",
          "topic_type": "concept",
          "confidence": 0.8,
          "reasoning": "intro topic"
        },
        {
          "title": "Advanced Algorithms",
          "estimated_hours": 6.0,
          "min_hours": 4.0,
          "max_hours": 10.0,
          "difficulty": "advanced",
          "scope": "broad",
          "topic_type": "concept",
          "confidence": 0.7,
          "reasoning": "large advanced topic"
        },
        {
          "title": "Building a Project",
          "estimated_hours": 8.0,
          "min_hours": 5.0,
          "max_hours": 14.0,
          "difficulty": "intermediate",
          "scope": "broad",
          "topic_type": "project",
          "confidence": 0.75,
          "reasoning": "project work"
        }
      ]
    }
    """

    async def _fake_get_cached(key):
      return None

    async def _fake_set_cached(key, response):
        return None

    monkeypatch.setattr(estimator, "get_cached", _fake_get_cached)
    monkeypatch.setattr(estimator, "set_cached", _fake_set_cached)
    monkeypatch.setattr(estimator.genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(estimator.genai, "GenerativeModel", lambda model_name: _FakeModel(fake_response))
    monkeypatch.setattr(estimator, "get_settings", lambda: SimpleNamespace(gemini_api_key="test-key", gemini_model="fake-model"))

    result = await estimator.estimate_hours(topics, raw_texts)

    assert len(result) == 3
    intro = next(t for t in result if t["title"] == "Introduction to Python")
    project = next(t for t in result if t["title"] == "Building a Project")
    advanced = next(t for t in result if t["title"] == "Advanced Algorithms")

    assert intro["est_hours"] < project["est_hours"]
    assert advanced["est_hours"] >= 4.0
    assert project["topic_type"] == "project"
    assert all("estimation_confidence" in t for t in result)


@pytest.mark.asyncio
async def test_estimator_requires_all_topics(monkeypatch):
    topics = [
        {"title": "Quick Topic", "description": "", "prereq_titles": []},
    ]
    raw_texts = ["short"]
    fake_response = '{"topics": []}'

    async def _fake_get_cached(key):
      return None

    async def _fake_set_cached(key, response):
        return None

    monkeypatch.setattr(estimator, "get_cached", _fake_get_cached)
    monkeypatch.setattr(estimator, "set_cached", _fake_set_cached)
    monkeypatch.setattr(estimator.genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(estimator.genai, "GenerativeModel", lambda model_name: _FakeModel(fake_response))
    monkeypatch.setattr(estimator, "get_settings", lambda: SimpleNamespace(gemini_api_key="test-key", gemini_model="fake-model"))

    with pytest.raises(ValueError, match="missing topics"):
        await estimator.estimate_hours(topics, raw_texts)
