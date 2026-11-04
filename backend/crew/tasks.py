from crewai import Task
from crew.agents import (
    get_extraction_agent,
    get_assignment_agent,
    get_validation_agent,
    get_followup_agent,
    get_confidence_agent,
    get_audit_agent,
    get_summary_agent,
)
from crew.pipeline import ungrounded_indexes
from crew.schemas import (
    ExtractionResult, AssignmentResult, ReviewResult, FollowUpPlan, ConfidenceNotes, AuditReport,
)

# Gemini Flash has a ~1M token context window; cap input to keep latency and cost predictable
MAX_TRANSCRIPT_CHARS = 100000

INDEX_NOTE = "Refer to each item by its `index`: its 0-based position in the extraction agent's `items` list."


def truncate_transcript(transcript: str) -> str:
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        return transcript[:MAX_TRANSCRIPT_CHARS] + "\n...[truncated for processing]"
    return transcript


def format_people(people: list) -> str:
    return "\n".join(f"- {p['name']} ({p.get('role', 'employee')})" for p in people) or "- (none provided)"


def parse_output(output, model):
    """CrewAI only converts to output_pydantic *after* guardrails pass, so guardrails parse the raw text."""
    if isinstance(output.pydantic, model):
        return output.pydantic
    raw = output.raw
    return model.model_validate_json(raw[raw.find('{'):raw.rfind('}') + 1])


def grounding_guardrail(transcript: str):
    """Reject extractions whose evidence quotes are mostly not in the transcript, so the agent retries."""
    def check(output):
        try:
            result = parse_output(output, ExtractionResult)
        except ValueError as e:
            return False, f"Output must be a single JSON object matching the ExtractionResult schema: {e}"
        bad = ungrounded_indexes(result.items, transcript)
        if result.items and len(bad) / len(result.items) > 0.3:
            titles = ", ".join(f"#{i} '{result.items[i].title}'" for i in bad)
            return False, (f"These items have an evidence_quote that does not appear in the transcript: {titles}. "
                           "Copy the exact spoken words as evidence_quote, or drop items nobody actually said.")
        # Returning JSON text makes CrewAI populate output.pydantic from it
        return True, result.model_dump_json()
    return check


def build_summary_task(transcript: str, people: list, context=None, extra_facts: str = "") -> Task:
    return Task(
        description=f"""
        Generate a comprehensive Minutes of Meeting (MoM) document.

        ORIGINAL TRANSCRIPT:
        {transcript}

        PARTICIPANTS:
        {format_people(people)}
        {extra_facts}

        Create a well-structured MoM with exactly these 5 sections, using the exact section headers shown:

        ## Executive Summary
        Write 2-3 sentences summarizing what this meeting was about, who attended, and the overall outcome.

        ## Key Decisions
        List each important decision that was made during the meeting as a bullet point.
        If no explicit decisions were made, write "No formal decisions were recorded in this meeting."

        ## Action Items
        One bullet per task: task name, assigned person, deadline, and priority (High/Medium/Low from context).

        ## Risks & Concerns
        List any risks, blockers, or concerns raised during the meeting.
        If none, write "No risks were identified."

        ## Next Steps
        Write 2-4 bullet points about what happens after this meeting — follow-up meetings,
        review dates, escalation timelines, etc.

        Only state facts supported by the transcript. Return ONLY the MoM markdown, not JSON.
        """,
        expected_output="A complete Minutes of Meeting document with Executive Summary, Key Decisions, Action Items, Risks & Concerns, and Next Steps sections",
        agent=get_summary_agent(),
        context=context,
    )


def get_crew_tasks(transcript: str, participants: list, team: list):
    transcript = truncate_transcript(transcript)
    # Everyone the agents may assign work to: company members plus anyone named in the upload
    known = {p['name'].strip().lower(): p for p in participants}
    known.update({m['name'].strip().lower(): m for m in team if m.get('name')})
    people = list(known.values())

    extraction_agent = get_extraction_agent()
    assignment_agent = get_assignment_agent()
    validation_agent = get_validation_agent()
    followup_agent   = get_followup_agent()

    extract = Task(
        description=f"""
        Analyze this meeting transcript and extract ALL tasks, decisions, and risks.

        TRANSCRIPT:
        {transcript}

        PEOPLE:
        {format_people(people)}

        For every item provide:
        - type: "task" (someone committed or was asked to do something), "decision", or "risk"
        - title: short, specific name
        - description: what needs to be done / what was decided / what the risk is
        - owner_name: person responsible as named in the meeting, or "unknown"
        - deadline_text: the deadline exactly as said (e.g. "by Friday"), or "not specified"
        - evidence_quote: the exact words from the transcript that support the item (copy, don't paraphrase)
        - speaker: who said the evidence quote, if known
        - severity (risks only): "high", "medium" or "low", based on impact on deadlines, customers or money
        - mitigation (risks only): one concrete step that would reduce the risk (from the meeting if mentioned, otherwise your suggestion)

        Do not invent items that were not discussed.
        """,
        expected_output="All tasks, decisions and risks from the meeting, each with a verbatim evidence quote",
        agent=extraction_agent,
        output_pydantic=ExtractionResult,
        guardrail=grounding_guardrail(transcript),
        guardrail_max_retries=2,
    )

    assign = Task(
        description=f"""
        Assign every item of type "task" from the extraction step to one person.

        TEAM AND PARTICIPANTS (use these exact names):
        {format_people(people)}

        Rules:
        1. If a person volunteered or was asked to do the task, assign it to them
        2. Otherwise assign coordination/review tasks to a PM, and technical/execution tasks to an employee
        3. Use "unassigned" only if nobody on the list could reasonably own it
        4. Skip decisions and risks

        {INDEX_NOTE}
        """,
        expected_output="One assignment per task item, with index, assigned_to and a short reason",
        agent=assignment_agent,
        context=[extract],
        output_pydantic=AssignmentResult,
    )

    validate = Task(
        description=f"""
        Review every extracted item (tasks, decisions and risks) and its assignment against the transcript.

        TRANSCRIPT:
        {transcript}

        For each item decide:
        - grounded: false if the transcript does not actually support it
        - needs_review: true if it is vague, the owner is doubtful, or it is not grounded
        - review_reason: one short sentence for the PM when needs_review is true

        Also write validation_summary: 2-3 sentences for the PM on what needs attention and why.

        {INDEX_NOTE}
        """,
        expected_output="One review per item plus a short validation summary for the PM",
        agent=validation_agent,
        context=[extract, assign],
        output_pydantic=ReviewResult,
    )

    followup = Task(
        description=f"""
        Plan follow-ups for every item of type "task".

        PEOPLE:
        {format_people(people)}

        For each task:
        - followup_days: days after the meeting to check in (sooner for urgent or near-deadline work)
        - escalate_to: who is notified if the owner doesn't respond (a PM or manager by name, or "Manager")

        {INDEX_NOTE}
        """,
        expected_output="One follow-up plan per task with index, followup_days and escalate_to",
        agent=followup_agent,
        context=[extract, assign, validate],
        output_pydantic=FollowUpPlan,
    )

    return [extract, assign, validate, followup], people


# ── Crew 2: runs on the assembled result, so it sees real owners, ISO dates and scores ─────────

def lost_points(breakdown: dict) -> str:
    lost = [f"{k} ({v}/25)" for k, v in breakdown.items() if v < 25]
    return ", ".join(lost) if lost else "none"


def format_task_lines(tasks: list) -> str:
    lines = []
    for i, t in enumerate(tasks):
        b = t.get('confidence_breakdown', {})
        lines.append(
            f"#{i} | {t['title']} | owner: {t['assigned_to']}{'' if t.get('owner_uid') else ' (not a company member)'}"
            f" | deadline: {t.get('deadline_date') or 'none'} (said: \"{t.get('deadline_text', '')}\")"
            f" | score {int(t['confidence'])}/100 [clarity {b.get('clarity', 0)}, owner {b.get('owner', 0)}, "
            f"deadline {b.get('deadline', 0)}, evidence {b.get('evidence', 0)}] lost points on: {lost_points(b)}"
            f" | flagged: {'yes - ' + t['review_reason'] if t.get('needs_review') else 'no'}"
            f" | quote: \"{t.get('evidence_quote', '')}\""
        )
    return "\n".join(lines) or "(no tasks)"


def format_insight_lines(items: list) -> str:
    return "\n".join(f"- {i['title']}: {i['description']} (\"{i['evidence_quote']}\")" for i in items) or "(none)"


def indexed_guardrail(model, list_attr: str, task_count: int):
    """Reject output that references task numbers that do not exist."""
    def check(output):
        try:
            result = parse_output(output, model)
        except ValueError as e:
            return False, f"Output must be a single JSON object matching the {model.__name__} schema: {e}"
        key = "index" if model is ConfidenceNotes else "task_index"
        bad = [getattr(x, key) for x in getattr(result, list_attr)
               if getattr(x, key) is not None and not 0 <= getattr(x, key) < task_count]
        if bad:
            return False, f"Task numbers {bad} do not exist. Valid task numbers are 0 to {task_count - 1}."
        return True, result.model_dump_json()
    return check


def get_review_tasks(result: dict, transcript: str, people: list, automated_findings: list):
    transcript = truncate_transcript(transcript)
    tasks = result['tasks']
    task_lines = format_task_lines(tasks)

    confidence = Task(
        description=f"""
        Explain the confidence score of every task below. The scores are already computed; do NOT change or
        restate them as new numbers.

        TASKS (number | title | owner | deadline | score with breakdown | flag | quote):
        {task_lines}

        Rules:
        - The score measures only how completely the task was specified (clarity, owner, deadline, evidence).
          It says nothing about whether the task is a good idea, so never call a task "fine" or "approved".
        - Explain ONLY the components listed after "lost points on". A component that got 25/25 is not
          missing, so never describe it as missing. Owner points of 15 mean the AI had to infer the owner
          because the meeting did not name one.

        For each task write:
        - explanation: one sentence (max 25 words) saying why it scored this way. Name the components that lost
          points and why (e.g. "No deadline was given, so it lost 25 points"); if none lost points, say it was
          fully specified.
        - next_step: the single most useful action to raise the score (e.g. "Ask Rahul for a deadline"),
          or an empty string when the score is 100.

        Refer to each task by its # number.
        """,
        expected_output="One short explanation and next step per task",
        agent=get_confidence_agent(),
        output_pydantic=ConfidenceNotes,
        guardrail=indexed_guardrail(ConfidenceNotes, "notes", len(tasks)),
        guardrail_max_retries=2,
    ) if tasks else None

    found = "\n".join(f"- #{f['task_index']}: {f['message']}" for f in automated_findings) or "(none)"
    audit = Task(
        description=f"""
        Audit the final result of this meeting before it is handed to the team.

        TRANSCRIPT:
        {transcript}

        TASKS (number | title | owner | deadline | score | flag | quote):
        {task_lines}

        DECISIONS:
        {format_insight_lines(result['decisions'])}

        RISKS:
        {format_insight_lines(result['risks'])}

        ALREADY FOUND BY AUTOMATED CHECKS (do not repeat these):
        {found}

        Look for problems that need judgement:
        - conflict: a task contradicts a decision, or two tasks contradict each other
        - duplicate: two tasks that are really the same work (in different words)
        - missing_follow_up: a decision or risk that needs action but has no task
        - deadline: a deadline that clashes with something said in the meeting
        - ownership: someone assigned work they said they could not do, or nobody sensible owns it
        - unsupported: a task, decision or risk the transcript does not really back up

        Report ONLY real problems. For each give a severity (info, warning or critical), the task # it concerns
        (or null when it is about the meeting as a whole) and a message a PM can act on. If everything is
        consistent, return no findings. Always finish with a one-sentence summary verdict.
        """,
        expected_output="A list of audit findings (possibly empty) and a one-sentence summary verdict",
        agent=get_audit_agent(),
        output_pydantic=AuditReport,
        guardrail=indexed_guardrail(AuditReport, "findings", len(tasks)),
        guardrail_max_retries=2,
    )

    summarize = build_summary_task(
        transcript, people,
        extra_facts=f"""
        FINAL DATA (use this as the source of truth for owners and deadlines):
        TASKS:
        {task_lines}

        DECISIONS:
        {format_insight_lines(result['decisions'])}

        RISKS:
        {format_insight_lines(result['risks'])}
        """,
    )
    return [t for t in (confidence, audit, summarize) if t is not None]
