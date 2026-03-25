"""Quiz attempt model for persisting quiz results."""

import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class QuizOptionModel(BaseModel):
    label: str
    text: str


class QuizQuestionModel(BaseModel):
    question_id: int
    question: str
    options: list[QuizOptionModel]
    correct_answer: str
    explanation: str
    topic_title: str
    difficulty: str


class QuizAttempt(BaseModel):
    """A completed quiz attempt stored in Cosmos DB."""
    quiz_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str  # The schedule date the quiz was generated for
    topics: list[str]
    questions: list[QuizQuestionModel]
    answers: dict[str, str]  # question_id (str) -> user's answer label
    score_correct: int
    score_total: int
    score_pct: int
    completed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
