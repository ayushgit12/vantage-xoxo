"""Test hour estimation heuristics."""

from agents.retriever.estimator import estimate_hours


def test_basic_estimation():
    topics = [
        {"title": "Introduction to Python", "description": ""},
        {"title": "Advanced Algorithms", "description": ""},
        {"title": "Building a Project", "description": ""},
    ]
    raw_texts = ["x" * 30_000]  # ~1 hour of reading

    result = estimate_hours(topics, raw_texts)

    assert len(result) == 3
    assert all("est_hours" in t for t in result)

    # "Introduction" topic should have lower hours
    intro = next(t for t in result if "Introduction" in t["title"])
    project = next(t for t in result if "Project" in t["title"])
    assert intro["est_hours"] < project["est_hours"]


def test_minimum_hours():
    topics = [{"title": "Quick Topic", "description": ""}]
    raw_texts = ["short"]  # very little content

    result = estimate_hours(topics, raw_texts)
    assert result[0]["est_hours"] >= 0.5  # minimum
