"""Structured outputs exchanged between the CrewAI agents and the backend.

Later agents annotate items by `index` instead of re-emitting the whole list,
so an LLM can never silently drop or rewrite fields produced earlier.
"""
from typing import Literal
from pydantic import BaseModel, Field


class ExtractedItem(BaseModel):
    type: Literal["task", "decision", "risk"]
    title: str = Field(description="Short, specific name, e.g. 'Ship pricing page redesign'")
    description: str = ""
    owner_name: str = Field("unknown", description="Person responsible, as named in the transcript, or 'unknown'")
    deadline_text: str = Field("not specified", description="Deadline exactly as said, e.g. 'by Friday', or 'not specified'")
    evidence_quote: str = Field(description="Verbatim words from the transcript that support this item")
    speaker: str = ""
    severity: Literal["high", "medium", "low"] | None = Field(None, description="Risks only: how bad it would be if it happened")
    mitigation: str = Field("", description="Risks only: one concrete step that would reduce the risk")


class ExtractionResult(BaseModel):
    items: list[ExtractedItem]


class Assignment(BaseModel):
    index: int
    assigned_to: str = Field(description="Exact name from the team/participant list, or 'unassigned'")
    reason: str = ""


class AssignmentResult(BaseModel):
    assignments: list[Assignment]


class Review(BaseModel):
    index: int
    grounded: bool = Field(description="False if the transcript does not actually support this item")
    needs_review: bool
    review_reason: str = ""


class ReviewResult(BaseModel):
    reviews: list[Review]
    validation_summary: str


class FollowUp(BaseModel):
    index: int
    followup_days: int = Field(ge=0, le=90)
    escalate_to: str


class FollowUpPlan(BaseModel):
    followups: list[FollowUp]


class ConfidenceNote(BaseModel):
    index: int = Field(description="The task's # number as shown in the task list")
    explanation: str = Field(description="One sentence (max 25 words) on why the task scored what it did, naming what is missing")
    next_step: str = Field("", description="One concrete action that would raise the score, e.g. 'Ask Rahul for a deadline'. Empty if the score is 100")


class ConfidenceNotes(BaseModel):
    notes: list[ConfidenceNote]


class AuditFinding(BaseModel):
    severity: Literal["info", "warning", "critical"]
    category: Literal["conflict", "duplicate", "missing_follow_up", "deadline", "ownership", "unsupported", "other"]
    task_index: int | None = Field(None, description="The task's # number, or null if the finding is about the meeting as a whole")
    message: str = Field(description="One or two sentences a PM can act on")


class AuditReport(BaseModel):
    findings: list[AuditFinding]
    summary: str = Field(description="One sentence verdict on whether the result is safe to hand to the team")
