"""Deterministic post-processing of agent output.

Anything that has a correct answer (dates, scores, name lookups, grounding checks)
is computed here in plain Python instead of being delegated to an LLM.
"""
import calendar
import difflib
import hashlib
import re
from collections import Counter
from datetime import datetime, timedelta

import dateparser
from dateparser.search import search_dates

UNSPECIFIED = {'', 'not specified', 'none', 'n/a', 'tbd', 'unknown'}

_DATE_SETTINGS_BASE = {'PREFER_DATES_FROM': 'future', 'RETURN_AS_TIMEZONE_AWARE': False}


# ── Grounding ──────────────────────────────────────────────────────────────────

def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (text or '').lower())


def quote_in_transcript(quote: str, transcript: str, threshold: float = 0.8) -> bool:
    """True if `quote` appears in the transcript, allowing for small wording/punctuation drift."""
    q = _words(quote)
    if len(q) < 2:
        return False
    t = _words(transcript)
    if ' '.join(q) in ' '.join(t):
        return True
    # Best overlap of the quote's words with any same-sized window of the transcript
    n, needed = len(q), set(q)
    best = 0
    for i in range(0, max(1, len(t) - n + 1)):
        best = max(best, len(needed & set(t[i:i + n])))
        if best / len(needed) >= threshold:
            return True
    return False


def ungrounded_indexes(items, transcript: str) -> list[int]:
    return [i for i, item in enumerate(items) if not quote_in_transcript(item.evidence_quote, transcript)]


# ── Deadlines ──────────────────────────────────────────────────────────────────

def resolve_deadline(text: str, meeting_date: datetime) -> str | None:
    """Turn a spoken deadline ('by Friday', 'end of month') into an ISO date relative to the meeting date."""
    t = (text or '').strip().lower()
    if t in UNSPECIFIED:
        return None
    base = meeting_date.replace(tzinfo=None)

    if re.search(r'\b(eod|end of (the )?day|today|tonight)\b', t):
        return base.date().isoformat()
    if re.search(r'\bend of (the )?week\b', t):
        return (base + timedelta(days=(4 - base.weekday()) % 7)).date().isoformat()
    if re.search(r'\bend of (the )?month\b', t):
        last = calendar.monthrange(base.year, base.month)[1]
        return base.replace(day=last).date().isoformat()

    settings = {**_DATE_SETTINGS_BASE, 'RELATIVE_BASE': base}
    parsed = dateparser.parse(t, settings=settings)
    if not parsed:
        found = search_dates(t, settings=settings)
        parsed = found[0][1] if found else None
    return parsed.date().isoformat() if parsed else None


# ── Owners ─────────────────────────────────────────────────────────────────────

def resolve_owner(name: str, team: list[dict]) -> dict | None:
    """Match an agent-provided name to a company member: exact full name, then a unique first name."""
    n = (name or '').strip().lower()
    if n in UNSPECIFIED or n == 'unassigned':
        return None
    exact = [m for m in team if (m.get('name') or '').strip().lower() == n]
    if len(exact) == 1:
        return exact[0]
    first = n.split()[0]
    by_first = [m for m in team if (m.get('name') or '').strip().lower().split()[:1] == [first]]
    return by_first[0] if len(by_first) == 1 else None


# ── Confidence ─────────────────────────────────────────────────────────────────

def confidence_breakdown(*, title: str, description: str, owner_resolved: bool, owner_named: bool,
                         deadline_resolved: bool, grounded: bool, owner_stated: bool = True) -> dict[str, int]:
    """Transparent rubric: up to 25 points each for clarity, owner, deadline and evidence.
    Owner: 25 if the meeting named a real team member, 15 if the AI had to infer one, 10 if a name
    was given that isn't on the team, 0 if there is none."""
    if len(title.split()) >= 3 and len(description.split()) >= 5:
        clarity = 25
    elif len(title.split()) >= 2:
        clarity = 15
    else:
        clarity = 0
    return {
        'clarity': clarity,
        'owner': (25 if owner_stated else 15) if owner_resolved else 10 if owner_named else 0,
        'deadline': 25 if deadline_resolved else 0,
        'evidence': 25 if grounded else 0,
    }


def confidence_score(**kwargs) -> int:
    return sum(confidence_breakdown(**kwargs).values())


def task_doc_id(meeting_id: str, title: str) -> str:
    """Stable ID so re-running a meeting overwrites its tasks instead of duplicating them."""
    return hashlib.sha1(f"{meeting_id}:{title.strip().lower()}".encode()).hexdigest()[:12]


# ── Assembly ───────────────────────────────────────────────────────────────────

def assemble(*, meeting_id: str, extraction, assignments, reviews, followups,
             team: list[dict], meeting_date: datetime, transcript: str) -> dict:
    """Merge every agent's output (joined by item index) into task docs, decisions and risks."""
    by_index = lambda rows: {r.index: r for r in (rows or [])}
    assign_of, review_of, follow_of = by_index(assignments), by_index(reviews), by_index(followups)

    tasks, decisions, risks, dropped = [], [], [], 0
    for i, item in enumerate(extraction.items):
        review = review_of.get(i)
        grounded = quote_in_transcript(item.evidence_quote, transcript)
        # Drop only when both the verifier agent and the deterministic check agree it's made up
        if not grounded and review is not None and not review.grounded:
            dropped += 1
            continue

        review_reason = review.review_reason if review else ''
        flagged = bool(review and review.needs_review) or not grounded
        if not grounded and not review_reason:
            review_reason = 'Evidence quote not found in transcript'

        if item.type != 'task':
            entry = {
                'title': item.title, 'description': item.description,
                'evidence_quote': item.evidence_quote, 'speaker': item.speaker,
                'needs_review': flagged, 'review_reason': review_reason,
            }
            if item.type == 'risk':
                entry.update(severity=item.severity or 'medium', mitigation=item.mitigation)
            (decisions if item.type == 'decision' else risks).append(entry)
            continue

        assignment = assign_of.get(i)
        assigned_name = assignment.assigned_to if assignment else item.owner_name
        member = resolve_owner(assigned_name, team) or resolve_owner(item.owner_name, team)
        deadline_date = resolve_deadline(item.deadline_text, meeting_date)
        owner_named = (assigned_name or '').strip().lower() not in UNSPECIFIED | {'unassigned'}
        breakdown = confidence_breakdown(
            title=item.title, description=item.description,
            owner_resolved=member is not None, owner_named=owner_named,
            owner_stated=resolve_owner(item.owner_name, team) is not None,
            deadline_resolved=deadline_date is not None, grounded=grounded,
        )
        confidence = sum(breakdown.values())
        if member is None:
            flagged = True
            review_reason = review_reason or 'Owner is not a member of the company'

        follow = follow_of.get(i)
        tasks.append({
            'id': task_doc_id(meeting_id, item.title),
            'meeting_id': meeting_id,
            'title': item.title,
            'description': item.description,
            'assigned_to': (member['name'] if member else assigned_name or 'unassigned').strip().lower(),
            'owner_uid': member['uid'] if member else None,
            'deadline': deadline_date or item.deadline_text,
            'deadline_text': item.deadline_text,
            'deadline_date': deadline_date,
            'status': 'pending',
            'confidence': float(confidence),
            'confidence_breakdown': breakdown,
            'validated': 'pending',
            'needs_review': flagged or confidence < 50,
            'review_reason': review_reason,
            'followup_days': follow.followup_days if follow else None,
            'escalate_to': follow.escalate_to if follow else None,
            'escalated_to': None,
            'evidence_quote': item.evidence_quote,
            'speaker': item.speaker,
        })

    return {
        'tasks': tasks,
        'decisions': decisions,
        'risks': risks,
        'dropped_count': dropped,
        'flagged_count': sum(1 for t in tasks if t['needs_review']),
    }


# ── Audit ──────────────────────────────────────────────────────────────────────

def automated_audit_checks(tasks: list[dict], meeting_date: datetime) -> list[dict]:
    """Cheap, exact checks that run before the audit agent, which then only looks for what needs judgement."""
    findings = []
    held_on = meeting_date.date().isoformat()

    for i, t in enumerate(tasks):
        if t.get('deadline_date') and t['deadline_date'] < held_on:
            findings.append({'severity': 'warning', 'category': 'deadline', 'task_index': i, 'source': 'automated',
                             'message': f"Deadline {t['deadline_date']} is before the meeting date ({held_on})."})

    for i, t in enumerate(tasks):
        for j in range(i):
            ratio = difflib.SequenceMatcher(None, t['title'].lower(), tasks[j]['title'].lower()).ratio()
            if ratio >= 0.85:
                findings.append({'severity': 'warning', 'category': 'duplicate', 'task_index': i, 'source': 'automated',
                                 'message': f"Looks like a duplicate of task #{j} ('{tasks[j]['title']}')."})
                break

    per_owner = Counter(t['owner_uid'] for t in tasks if t.get('owner_uid'))
    for uid, count in per_owner.items():
        if count > 5:
            first = next(i for i, t in enumerate(tasks) if t.get('owner_uid') == uid)
            findings.append({'severity': 'info', 'category': 'ownership', 'task_index': first, 'source': 'automated',
                             'message': f"{tasks[first]['assigned_to'].title()} has been given {count} tasks from this meeting."})
    return findings


def apply_confidence_notes(tasks: list[dict], notes) -> None:
    for n in notes or []:
        if 0 <= n.index < len(tasks):
            tasks[n.index]['confidence_note'] = n.explanation.strip()
            tasks[n.index]['confidence_next_step'] = n.next_step.strip()


def apply_audit(tasks: list[dict], findings: list[dict]) -> None:
    """Warnings and criticals send the affected task back to the PM, with the reason attached."""
    for f in findings:
        i = f.get('task_index')
        if f['severity'] == 'info' or i is None or not 0 <= i < len(tasks):
            continue
        task = tasks[i]
        task['needs_review'] = True
        reason = task.get('review_reason', '')
        if f['message'] not in reason:
            task['review_reason'] = f"{reason} · {f['message']}".strip(' ·')
