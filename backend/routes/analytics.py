from datetime import datetime, timedelta, timezone

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

import analytics as an
from access import visible_meetings, visible_tasks
from auth_middleware import require_role
from firebase_config import db

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _iso(value):
    return value.isoformat() if hasattr(value, 'isoformat') else value


@router.get("/team")
def team_performance(window: int = Query(an.WINDOW_DEFAULT, ge=3, le=50), user: dict = Depends(require_role('pm', 'manager'))):
    """
    Delivery stats per person plus early-warning alerts.
    Owners see everyone; managers see their own team (and only work they are allowed to see).
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    members = [{'uid': d.id, **d.to_dict()} for d in db.collection('users').where('companyId', '==', user['companyId']).stream()]
    names = {m['uid']: m.get('name', '') for m in members}
    if user['role'] == 'manager':
        workers = [m for m in members if m.get('managerId') == user['uid']]
    else:
        workers = [m for m in members if m.get('role') in ('employee', 'manager')]

    meeting_snaps = visible_meetings(user)
    meeting_docs = {s.id: {'id': s.id, **s.to_dict()} for s in meeting_snaps}
    current, previous = an.split_windows(list(meeting_docs.values()), window)
    current_ids, previous_ids = {m['id'] for m in current}, {m['id'] for m in previous}
    n = len(current)

    tasks = [{'id': s.id, **s.to_dict()} for s in visible_tasks(user)]

    def belongs_to(task, member):
        if task.get('owner_uid'):
            return task['owner_uid'] == member['uid']
        return (task.get('assigned_to') or '').lower() == (member.get('name') or '').strip().lower()  # pre-owner_uid tasks

    result_members, all_alerts = [], []
    for member in workers:
        mine = [t for t in tasks if belongs_to(t, member)]
        win = [t for t in mine if t.get('meeting_id') in current_ids]
        prev = [t for t in mine if t.get('meeting_id') in previous_ids]
        win_stats, prev_stats, total = an.stats(win, today, now), an.stats(prev, today, now), an.stats(mine, today, now)
        overdue_dates = [an.deadline_of(t) for t in mine if an.is_overdue(t, today) and an.deadline_of(t)]
        alerts = an.member_alerts(member.get('name', ''), win_stats, prev_stats, total, n, min(overdue_dates) if overdue_dates else None)
        dated = sorted(win, key=lambda t: meeting_docs[t['meeting_id']].get('date') or now)
        open_tasks = sorted((t for t in mine if not an.is_done(t)), key=lambda t: str(an.deadline_of(t) or '9999'))
        trend = (None if win_stats['rate'] is None or prev_stats['rate'] is None
                 else round(win_stats['rate'] - prev_stats['rate'], 2))
        result_members.append({
            'uid': member['uid'], 'name': member.get('name', ''), 'role': member.get('role'), 'jobTitle': member.get('jobTitle', ''),
            'managerId': member.get('managerId'), 'managerName': names.get(member.get('managerId'), ''),
            'window': win_stats, 'allTime': total, 'trend': trend,
            'status': an.member_status(alerts, win_stats['assigned']),
            'oldestOverdue': an.oldest_overdue(mine, today),
            'alerts': alerts,
            'dots': [an.task_dot(t, today) for t in dated],
            'openTasks': [{
                'id': t['id'], 'title': t.get('title'), 'status': t.get('status'), 'meetingId': t.get('meeting_id'),
                'deadline': _iso(an.deadline_of(t)), 'overdue': an.is_overdue(t, today),
            } for t in open_tasks[:6]],
        })
        all_alerts += [{**a, 'uid': member['uid'], 'name': member.get('name', '')} for a in alerts]

    order = {'at_risk': 0, 'attention': 1, 'on_track': 2, 'no_tasks': 3}
    result_members.sort(key=lambda m: (order[m['status']], (m['window']['rate'] if m['window']['rate'] is not None else 2), m['name'].lower()))
    all_alerts.sort(key=lambda a: an.SEVERITY_ORDER[a['severity']])

    in_window = [t for t in tasks if t.get('meeting_id') in current_ids]
    summary = an.stats(in_window, today, now)
    pending_review = [t for t in tasks if t.get('needs_review') and t.get('validated') == 'pending']

    per_meeting = []
    for m in current:
        mt = [t for t in tasks if t.get('meeting_id') == m['id']]
        findings = [f for f in (m.get('audit') or {}).get('findings', []) if f.get('severity') != 'info']
        per_meeting.append({
            'id': m['id'], 'title': m.get('title'), 'date': _iso(m.get('date')), 'tasks': len(mt),
            'done': sum(an.is_done(t) for t in mt), 'flagged': sum(1 for t in mt if t.get('needs_review') and t.get('validated') == 'pending'),
            'auditFindings': len(findings),
        })

    soon = today + timedelta(days=an.UPCOMING_DAYS)
    upcoming = sorted(
        ({'id': t['id'], 'title': t.get('title'), 'owner': t.get('assigned_to'), 'deadline': _iso(an.deadline_of(t)), 'meetingId': t.get('meeting_id')}
         for t in tasks if not an.is_done(t) and an.deadline_of(t) and today <= an.deadline_of(t) <= soon),
        key=lambda t: t['deadline'])[:10]

    risks = [{'meetingId': m['id'], 'meetingTitle': m.get('title'), 'title': r.get('title'), 'description': r.get('description')}
             for m in current for r in (m.get('risks') or [])][:10]

    return {
        'window': window, 'meetingsInWindow': n,
        'summary': {
            **{k: summary[k] for k in ('assigned', 'done', 'open', 'overdue', 'escalated')},
            'completionRate': summary['rate'], 'onTimeRate': summary['onTimeRate'],
            'members': len(result_members), 'atRisk': sum(m['status'] == 'at_risk' for m in result_members),
            'needAttention': sum(m['status'] == 'attention' for m in result_members),
            'pendingApproval': len(pending_review),
            'processing': sum(1 for m in meeting_docs.values() if m.get('status') == 'processing'),
            'failed': sum(1 for m in meeting_docs.values() if m.get('status') == 'failed'),
        },
        'alerts': all_alerts,
        'members': result_members,
        'weekly': an.weekly_series(tasks, today),
        'meetings': per_meeting,
        'upcoming': upcoming,
        'risks': risks,
        'pendingApproval': [{'id': t['id'], 'title': t.get('title'), 'owner': t.get('assigned_to'), 'reason': t.get('review_reason'),
                             'meetingId': t.get('meeting_id'), 'confidence': t.get('confidence'),
                             'quote': t.get('evidence_quote'), 'deadline': _iso(an.deadline_of(t))} for t in pending_review[:10]],
    }


EXPORT_COLUMNS = ['meeting', 'meeting_date', 'task', 'assignee', 'deadline', 'status', 'progress', 'approval',
                  'approved_by', 'acceptance', 'confidence', 'source', 'created', 'completed', 'evidence_quote']


@router.get("/export")
def export_audit_log(user: dict = Depends(require_role('pm', 'manager'))):
    """CSV of every task the caller can see, with approval and acceptance history, for reporting."""
    meetings = {s.id: s.to_dict() for s in visible_meetings(user)}
    rows = []
    for snap in visible_tasks(user):
        t = snap.to_dict()
        m = meetings.get(t.get('meeting_id'), {})
        rows.append({
            'meeting': m.get('title', ''), 'meeting_date': _iso(m.get('date')) or '', 'task': t.get('title', ''),
            'assignee': t.get('assigned_to', ''), 'deadline': t.get('deadline_date') or t.get('deadline', ''),
            'status': t.get('status', ''), 'progress': t.get('progress', ''), 'approval': t.get('validated', ''),
            'approved_by': t.get('validatedBy', ''), 'acceptance': t.get('acceptance', ''),
            'confidence': t.get('confidence') if t.get('confidence') is not None else '', 'source': t.get('source', 'ai'),
            'created': _iso(t.get('createdAt')) or '', 'completed': _iso(t.get('completedAt')) or '',
            'evidence_quote': t.get('evidence_quote', ''),
        })
    rows.sort(key=lambda r: (r['meeting_date'], r['meeting'], r['task']), reverse=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXPORT_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv',
                             headers={'Content-Disposition': 'attachment; filename="meetingos-audit-log.csv"'})
