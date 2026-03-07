from datetime import datetime, timezone
from pydantic import BaseModel, Field
from uuid import uuid4


class ResourceRef(BaseModel):
    ref_id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    url: str | None = None
    file_id: str | None = None
    source_type: str  # "pdf", "url", "youtube", "github", "web_supplement"
    description: str = ""
    transcript: str = ""  # full transcript text for youtube videos


class Topic(BaseModel):
    topic_id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str = ""
    est_hours: float
    prereq_ids: list[str] = Field(default_factory=list)
    resource_refs: list[str] = Field(default_factory=list)  # ref_ids


class Milestone(BaseModel):
    milestone_id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str = ""
    topic_ids: list[str] = Field(default_factory=list)
    target_date: datetime | None = None


class GoalKnowledge(BaseModel):
    knowledge_id: str = Field(default_factory=lambda: str(uuid4()))
    goal_id: str
    topics: list[Topic] = Field(default_factory=list)
    milestones: list[Milestone] = Field(default_factory=list)
    estimated_total_hours: float = 0.0
    resource_refs: list[ResourceRef] = Field(default_factory=list)
    confidence_score: float = 0.0  # 0.0 to 1.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
