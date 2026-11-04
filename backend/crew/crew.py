from datetime import datetime
from typing import Callable

from crewai import Crew, Process
from crew.tasks import get_crew_tasks, get_review_tasks
from crew.pipeline import assemble, automated_audit_checks, apply_confidence_notes, apply_audit
from crew.schemas import (
    ExtractionResult, AssignmentResult, ReviewResult, FollowUpPlan, ConfidenceNotes, AuditReport,
)


def describe_step(output) -> str:
    """One-line, human-readable audit entry for a finished agent step."""
    result = output.pydantic
    if isinstance(result, ExtractionResult):
        counts = {t: sum(1 for i in result.items if i.type == t) for t in ('task', 'decision', 'risk')}
        return f"Extracted {counts['task']} tasks, {counts['decision']} decisions and {counts['risk']} risks, each with a transcript quote."
    if isinstance(result, AssignmentResult):
        return f"Assigned owners for {len(result.assignments)} tasks."
    if isinstance(result, ReviewResult):
        flagged = sum(1 for r in result.reviews if r.needs_review)
        return f"Reviewed {len(result.reviews)} items against the transcript; flagged {flagged} for PM review."
    if isinstance(result, FollowUpPlan):
        return f"Planned follow-ups and escalation paths for {len(result.followups)} tasks."
    if isinstance(result, ConfidenceNotes):
        return f"Explained the confidence score of {len(result.notes)} tasks."
    if isinstance(result, AuditReport):
        return f"Audit finished: {len(result.findings)} findings. {result.summary}"
    return "Generated the Minutes of Meeting."


def _output(task, model=None):
    """A finished task's structured output (or None if the task never completed)."""
    out = getattr(task, 'output', None)
    if out is None:
        return None
    return out.pydantic if model else out


def run_meeting_crew(meeting_id: str, transcript: str, participants: list, team: list,
                     meeting_date: datetime, on_step: Callable[[str, str], None] | None = None) -> dict:
    """
    Crew 1 (extract, assign, validate, follow-up) → Python assembly → Crew 2 (confidence, audit, summary).
    Raises if Crew 1 fails. If Crew 2 fails part-way, the result keeps everything completed so far
    and lists what went wrong under `warnings`.
    """
    callback = (lambda out: on_step(out.agent, describe_step(out))) if on_step else None

    # ── Crew 1: understand the meeting ────────────────────────────────────────
    tasks, people = get_crew_tasks(transcript, participants, team)
    extract, assign, validate, followup = tasks
    Crew(agents=[t.agent for t in tasks], tasks=tasks, process=Process.sequential,
         verbose=True, task_callback=callback).kickoff()

    extraction = _output(extract, ExtractionResult)
    if not isinstance(extraction, ExtractionResult):
        raise ValueError("Extraction agent did not return structured output")

    # ── Python: dates, owners, scores, drop/flag decisions ────────────────────
    review = _output(validate, ReviewResult)
    result = assemble(
        meeting_id=meeting_id,
        extraction=extraction,
        assignments=getattr(_output(assign, AssignmentResult), 'assignments', []),
        reviews=getattr(review, 'reviews', []),
        followups=getattr(_output(followup, FollowUpPlan), 'followups', []),
        team=team,
        meeting_date=meeting_date,
        transcript=transcript,
    )
    result['validation_summary'] = getattr(review, 'validation_summary', '')
    result.update(mom='', warnings=[])

    # ── Crew 2: explain, audit and summarize the assembled result ─────────────
    automated = automated_audit_checks(result['tasks'], meeting_date)
    review_tasks = get_review_tasks(result, transcript, people, automated)
    try:
        Crew(agents=[t.agent for t in review_tasks], tasks=review_tasks, process=Process.sequential,
             verbose=True, task_callback=callback).kickoff()
    except Exception as e:
        result['warnings'].append(
            f"Confidence/audit/summary step did not finish ({str(e)[:300]}). Tasks were saved; "
            "use 'Regenerate' to create the Minutes of Meeting."
        )

    by_model = {ConfidenceNotes: None, AuditReport: None}
    for t in review_tasks:
        for model in by_model:
            if isinstance(_output(t, model), model):
                by_model[model] = _output(t, model)
    notes, report = by_model[ConfidenceNotes], by_model[AuditReport]
    summary_out = _output(review_tasks[-1])
    if summary_out is not None and summary_out.raw.strip():
        result['mom'] = summary_out.raw.strip()

    if notes:
        apply_confidence_notes(result['tasks'], notes.notes)
    agent_findings = [{**f.model_dump(), 'source': 'agent'} for f in report.findings] if report else []
    findings = automated + agent_findings
    for f in findings:  # the UI loads tasks in a different order, so carry the title with the finding
        i = f.get('task_index')
        f['task_title'] = result['tasks'][i]['title'] if i is not None and 0 <= i < len(result['tasks']) else None
    apply_audit(result['tasks'], findings)
    result['audit'] = {
        'summary': report.summary if report else ('Audit agent did not run.' if result['tasks'] else ''),
        'findings': findings,
        'passed': not any(f['severity'] != 'info' for f in findings),
        'completed': report is not None,
    }
    result['flagged_count'] = sum(1 for t in result['tasks'] if t['needs_review'])
    return result
