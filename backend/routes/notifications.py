"""What needs the signed-in person's attention, for the bell in the top bar.

Items are computed on the fly from tasks and meetings (no separate notifications store). Each has a stable id and
a timestamp, so the web app can count what's new since the person last opened the bell.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

import analytics as an
from access import can_manage_task, direct_report_uids, is_assignee, visible_meetings, visible_tasks
from auth_middleware import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])
MAX_ITEMS = 30


def _iso(value):
    return value.isoformat() if hasattr(value, 'isoformat') else value


@router.get("")
def my_notifications(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today = now.date()
    items = []
    snaps = visible_tasks(user)
    reports = direct_report_uids(user)
    staff = user['role'] in ('pm', 'manager')

    for snap in snaps:
        t, tid = snap.to_dict(), snap.id
        link = f"/meeting/{t.get('meeting_id')}"
        at = _iso(t.get('statusUpdatedAt') or t.get('declinedAt') or t.get('createdAt'))
        mine = is_assignee(t, user)
        if mine and t.get('acceptance') == 'pending' and t.get('status') != 'done':
            items.append({'id': f'accept:{tid}', 'kind': 'accept', 'severity': 'info', 'at': _iso(t.get('createdAt')), 'link': '/employee',
                          'title': 'New task for you', 'body': f"“{t.get('title', '')}” is waiting for you to accept it."})
        if mine and an.is_overdue(t, today):
            items.append({'id': f'overdue:{tid}', 'kind': 'overdue', 'severity': 'critical', 'at': at, 'link': '/employee',
                          'title': 'Overdue task', 'body': f"“{t.get('title', '')}” was due {an.deadline_of(t).strftime('%b %d') if an.deadline_of(t) else 'earlier'}."})
        elif mine and t.get('status') != 'done':
            due = an.deadline_of(t)
            if due and 0 <= (due - today).days <= 2:
                items.append({'id': f'due:{tid}:{due}', 'kind': 'due', 'severity': 'warning', 'at': _iso(datetime.combine(due - timedelta(days=2), datetime.min.time(), timezone.utc)),
                              'link': '/employee', 'title': 'Due soon', 'body': f"“{t.get('title', '')}” is due {'today' if due == today else due.strftime('%b %d')}."})
        if staff and can_manage_task(user, t, reports):
            if t.get('acceptance') == 'declined':
                items.append({'id': f'declined:{tid}', 'kind': 'declined', 'severity': 'critical', 'at': _iso(t.get('declinedAt')), 'link': link,
                              'title': 'Task declined', 'body': t.get('review_reason') or f"“{t.get('title', '')}” was declined."})
            elif t.get('needs_review') and t.get('validated') == 'pending':
                items.append({'id': f'review:{tid}', 'kind': 'review', 'severity': 'warning', 'at': _iso(t.get('createdAt')), 'link': link,
                              'title': 'Needs your approval', 'body': f"“{t.get('title', '')}”: {t.get('review_reason') or 'flagged by the agents'}"})

    if staff:
        week_ago = now - timedelta(days=7)
        for snap in visible_meetings(user):
            m = snap.to_dict()
            when = m.get('date')
            if not isinstance(when, datetime) or when < week_ago:
                continue
            if m.get('status') == 'completed':
                items.append({'id': f'meeting:{snap.id}', 'kind': 'meeting', 'severity': 'info', 'at': _iso(when), 'link': f'/meeting/{snap.id}',
                              'title': 'Meeting processed', 'body': f"“{m.get('title', '')}” is ready: {m.get('flagged_count', 0)} task(s) to review."})
            elif m.get('status') == 'failed':
                items.append({'id': f'failed:{snap.id}', 'kind': 'failed', 'severity': 'critical', 'at': _iso(when), 'link': f'/meeting/{snap.id}',
                              'title': 'Processing failed', 'body': f"“{m.get('title', '')}” could not be processed. Open it to see why."})

    items.sort(key=lambda i: i.get('at') or '', reverse=True)
    return {'items': items[:MAX_ITEMS], 'total': len(items)}
