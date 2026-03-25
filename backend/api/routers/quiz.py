"""Quiz generation endpoint — creates MCQ quizzes from day's scheduled topics."""

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_user_id
from shared.db.repositories import goals_repo, knowledge_repo, plans_repo, quiz_attempts_repo
from shared.ai import run_prompt_via_graph
from shared.models.quiz import QuizAttempt

logger = logging.getLogger(__name__)
router = APIRouter()


class QuizRequest(BaseModel):
    date: str  # ISO date string like "2026-03-25"
    num_questions: int = 12  # 10-15 range


class QuizOption(BaseModel):
    label: str  # "A", "B", "C", "D"
    text: str


class QuizQuestion(BaseModel):
    question_id: int
    question: str
    options: list[QuizOption]
    correct_answer: str  # "A", "B", "C", or "D"
    explanation: str
    topic_title: str
    difficulty: str  # "easy", "medium", "hard"


class QuizResponse(BaseModel):
    date: str
    topics: list[str]
    questions: list[QuizQuestion]
    total_questions: int


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(
    body: QuizRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a quiz based on topics scheduled for a given date."""
    # Clamp question count
    num_questions = max(10, min(15, body.num_questions))

    # Fetch all user goals with active plans
    all_goals = await goals_repo.find_many({"user_id": user_id})
    if not all_goals:
        raise HTTPException(status_code=404, detail="No goals found")

    # Collect all plan blocks for the target date
    target_date = body.date  # "YYYY-MM-DD"
    day_topic_ids: set[str] = set()
    day_blocks: list[dict] = []

    for goal in all_goals:
        if goal.get("status") != "active" or not goal.get("active_plan_id"):
            continue
        plan_doc = await plans_repo.find_by_id(
            goal["active_plan_id"], id_field="plan_id"
        )
        if not plan_doc:
            continue
        for block in plan_doc.get("micro_blocks", []):
            block_date = block.get("start_dt", "")[:10]
            if block_date == target_date:
                day_topic_ids.add(block.get("topic_id", ""))
                day_blocks.append(block)

    if not day_topic_ids:
        raise HTTPException(
            status_code=400,
            detail="No topics scheduled for this date. Select a date with scheduled blocks.",
        )

    # Fetch knowledge for topics
    topic_details: list[dict] = []
    for goal in all_goals:
        gid = goal.get("goal_id", "")
        k_doc = await knowledge_repo.find_by_id(gid, id_field="goal_id")
        if not k_doc:
            continue
        for topic in k_doc.get("topics", []):
            if topic.get("topic_id") in day_topic_ids:
                topic_details.append({
                    "topic_id": topic["topic_id"],
                    "title": topic.get("title", ""),
                    "description": topic.get("description", ""),
                    "goal_title": goal.get("title", ""),
                })

    if not topic_details:
        raise HTTPException(
            status_code=400,
            detail="Could not find topic details for scheduled blocks.",
        )

    # Build context for the LLM
    topic_context = "\n".join(
        f"- Topic: {t['title']} (Goal: {t['goal_title']})\n  Description: {t['description']}"
        for t in topic_details
    )
    topic_titles = [t["title"] for t in topic_details]

    prompt = (
        "You are a quiz generator for an educational study planner.\n"
        "Generate a multiple-choice quiz based on the following topics that a student is studying today.\n\n"
        f"Topics:\n{topic_context}\n\n"
        f"Generate exactly {num_questions} multiple-choice questions.\n\n"
        "Rules:\n"
        "- Each question must have exactly 4 options labeled A, B, C, D\n"
        "- Questions should cover the topic descriptions and key concepts\n"
        "- Mix difficulty levels: ~30% easy, ~50% medium, ~20% hard\n"
        "- Questions should test understanding, not just memorization\n"
        "- Include conceptual, application, and analysis questions\n"
        "- The correct answer should be distributed across A, B, C, D (not always A)\n"
        "- Provide a brief explanation (1-2 sentences) for each correct answer\n"
        "- Reference the topic title for each question\n\n"
        "Return strict JSON only:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question_id": 1,\n'
        '      "question": "...",\n'
        '      "options": [\n'
        '        {"label": "A", "text": "..."},\n'
        '        {"label": "B", "text": "..."},\n'
        '        {"label": "C", "text": "..."},\n'
        '        {"label": "D", "text": "..."}\n'
        "      ],\n"
        '      "correct_answer": "B",\n'
        '      "explanation": "...",\n'
        '      "topic_title": "...",\n'
        '      "difficulty": "medium"\n'
        "    }\n"
        "  ]\n"
        "}\n"
    )

    try:
        result_text = run_prompt_via_graph(
            prompt,
            temperature=0.4,
            json_mode=True,
            model="gpt-4.1",
        ).strip()
        # Strip markdown code fences if present
        result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
        result_text = re.sub(r"\n?```\s*$", "", result_text).strip()
        payload = json.loads(result_text)
    except Exception as exc:
        logger.exception("Quiz generation failed")
        raise HTTPException(
            status_code=500, detail="Failed to generate quiz. Please try again."
        ) from exc

    raw_questions = payload.get("questions", [])
    questions: list[QuizQuestion] = []
    for i, q in enumerate(raw_questions):
        try:
            options = [
                QuizOption(label=opt["label"], text=opt["text"])
                for opt in q.get("options", [])
            ]
            questions.append(
                QuizQuestion(
                    question_id=i + 1,
                    question=q.get("question", ""),
                    options=options,
                    correct_answer=q.get("correct_answer", "A"),
                    explanation=q.get("explanation", ""),
                    topic_title=q.get("topic_title", topic_titles[0] if topic_titles else ""),
                    difficulty=q.get("difficulty", "medium"),
                )
            )
        except Exception:
            continue

    if not questions:
        raise HTTPException(
            status_code=500, detail="Quiz generation produced no valid questions."
        )

    return QuizResponse(
        date=target_date,
        topics=topic_titles,
        questions=questions,
        total_questions=len(questions),
    )


class SaveQuizRequest(BaseModel):
    """Request body to save a completed quiz attempt."""
    date: str
    topics: list[str]
    questions: list[QuizQuestion]
    answers: dict[str, str]  # question_id (as str) -> answer label
    score_correct: int
    score_total: int
    score_pct: int


@router.post("/save")
async def save_quiz_attempt(
    body: SaveQuizRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Save a completed quiz attempt to the database."""
    from shared.models.quiz import QuizQuestionModel, QuizOptionModel

    attempt = QuizAttempt(
        user_id=user_id,
        date=body.date,
        topics=body.topics,
        questions=[
            QuizQuestionModel(
                question_id=q.question_id,
                question=q.question,
                options=[QuizOptionModel(label=o.label, text=o.text) for o in q.options],
                correct_answer=q.correct_answer,
                explanation=q.explanation,
                topic_title=q.topic_title,
                difficulty=q.difficulty,
            )
            for q in body.questions
        ],
        answers=body.answers,
        score_correct=body.score_correct,
        score_total=body.score_total,
        score_pct=body.score_pct,
    )
    await quiz_attempts_repo.insert(attempt.model_dump(mode="json"))
    return {"quiz_id": attempt.quiz_id, "status": "saved"}


@router.get("/history")
async def list_quiz_history(
    user_id: str = Depends(get_current_user_id),
):
    """Return all quiz attempts for the user, newest first."""
    docs = await quiz_attempts_repo.find_many({"user_id": user_id}, limit=200)
    # Sort by completed_at descending
    docs.sort(key=lambda d: d.get("completed_at", ""), reverse=True)
    return docs


@router.get("/history/{quiz_id}")
async def get_quiz_attempt(
    quiz_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return a single quiz attempt by ID."""
    doc = await quiz_attempts_repo.find_by_id(quiz_id, id_field="quiz_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return doc
