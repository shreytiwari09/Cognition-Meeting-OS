"""Team performance: per-person delivery stats and early-warning alerts.

Everything here is a pure function of task and meeting dicts, so the thresholds are easy to test and tune.
The central question: "of the work this person was given in the last N meetings, how much is actually done?"
"""
from datetime import date, datetime, timedelta, timezone

WINDOW_DEFAULT = 10
MIN_TASKS_FOR_RATE = 3         # too few tasks to judge a completion rate
BEHIND_WARNING, BEHIND_CRITICAL = 0.70, 0.50
DECLINE_POINTS = 0.20          # drop vs the previous window that counts as declining
OVERDUE_WARNING, OVERDUE_CRITICAL = 2, 4
STALE_DAYS, STALE_WARNING = 14, 2
OVERLOADED_OPEN = 8
UPCOMING_DAYS = 7
SEVERITY_ORDER = {'critical': 0, 'warning': 1, 'info': 2}


def _day(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def deadline_of(task: dict) -> date | None:
    return _day(task.get('deadline_date')) or _day(task.get('deadline'))


def is_done(task: dict) -> bool:
    return task.get('status') == 'done'


def is_overdue(task: dict, today: date) -> bool:
    if is_done(task):
        return False
    due = deadline_of(task)
    return task.get('status') == 'overdue' or bool(due and due < today)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_stale(task: dict, now: datetime) -> bool:
    """Open for a long time with nobody touching it."""
    if is_done(task):
        return False
    touched = task.get('statusUpdatedAt') or task.get('createdAt')
    return isinstance(touched, datetime) and _aware(touched) < now - timedelta(days=STALE_DAYS)


def pct(value: float | None) -> str:
    return f"{round(value * 100)}%"


def stats(tasks: list[dict], today: date, now: datetime) -> dict:
    assigned = len(tasks)
    done = sum(is_done(t) for t in tasks)
    on_time = judged = 0
    for t in tasks:
        due, finished = deadline_of(t), t.get('completedAt')
        if is_done(t) and due and isinstance(finished, datetime):
            judged += 1
            on_time += _day(finished) <= due
    return {
        'assigned': assigned,
        'done': done,
        'open': assigned - done,
        'overdue': sum(is_overdue(t, today) for t in tasks),
        'escalated': sum(t.get('status') == 'escalated' for t in tasks),
        'stale': sum(is_stale(t, now) for t in tasks),
        'rate': done / assigned if assigned else None,
        'onTimeRate': on_time / judged if judged else None,
    }


def member_alerts(name: str, window: dict, prior: dict, all_time: dict, n_meetings: int, oldest_overdue: date | None) -> list[dict]:
    """Early-warning signals for one person, most serious first."""
    first = name.split()[0].title() if name else 'This person'
    alerts = []

    def add(severity, kind, message):
        alerts.append({'severity': severity, 'kind': kind, 'message': message})

    if window['assigned'] >= MIN_TASKS_FOR_RATE and window['rate'] < BEHIND_WARNING:
        not_done = window['open']
        tail = f", {window['overdue']} of them overdue" if window['overdue'] else ''
        add('critical' if window['rate'] < BEHIND_CRITICAL else 'warning', 'behind',
            f"{first} completed {window['done']} of {window['assigned']} tasks from the last {n_meetings} meetings "
            f"({pct(window['rate'])}): {not_done} not done{tail}.")

    overdue = all_time['overdue']
    if overdue >= OVERDUE_WARNING:
        since = f" (oldest was due {oldest_overdue.strftime('%b %d')})" if oldest_overdue else ''
        add('critical' if overdue >= OVERDUE_CRITICAL else 'warning', 'overdue', f"{first} has {overdue} overdue tasks{since}.")

    if (prior['assigned'] >= MIN_TASKS_FOR_RATE and window['assigned'] >= MIN_TASKS_FOR_RATE
            and round(prior['rate'] - window['rate'], 4) >= DECLINE_POINTS):
        add('warning', 'declining',
            f"{first}'s completion dropped from {pct(prior['rate'])} to {pct(window['rate'])} compared with the previous {n_meetings} meetings.")

    if all_time['stale'] >= STALE_WARNING:
        add('warning', 'stale', f"{first} has {all_time['stale']} open tasks with no update in {STALE_DAYS}+ days.")

    if all_time['open'] >= OVERLOADED_OPEN:
        add('info', 'overloaded', f"{first} has {all_time['open']} open tasks, which is a heavy load.")

    if all_time['escalated']:
        add('info', 'escalated', f"{first} has {all_time['escalated']} escalated task{'s' if all_time['escalated'] != 1 else ''}.")

    alerts.sort(key=lambda a: SEVERITY_ORDER[a['severity']])
    return alerts


def member_status(alerts: list[dict], assigned: int) -> str:
    if not assigned:
        return 'no_tasks'
    if any(a['severity'] == 'critical' for a in alerts):
        return 'at_risk'
    if any(a['severity'] == 'warning' for a in alerts):
        return 'attention'
    return 'on_track'


def task_dot(task: dict, today: date) -> str:
    return 'done' if is_done(task) else 'overdue' if is_overdue(task, today) else 'open'


def split_windows(meetings: list[dict], n: int) -> tuple[list[dict], list[dict]]:
    """The latest n finished meetings, and the n before them (to spot a decline)."""
    finished = sorted((m for m in meetings if m.get('status') == 'completed'),
                      key=lambda m: _aware(m['date']) if isinstance(m.get('date'), datetime) else datetime.min.replace(tzinfo=timezone.utc),
                      reverse=True)
    return finished[:n], finished[n:2 * n]


def _created(task: dict):
    return task.get('createdAt') if isinstance(task.get('createdAt'), datetime) else None


def weekly_series(tasks: list[dict], today: date, weeks: int = 6) -> list[dict]:
    """Tasks created vs completed per week (Monday-based), oldest first."""
    this_monday = today - timedelta(days=today.weekday())
    out = []
    for i in range(weeks - 1, -1, -1):
        start = this_monday - timedelta(weeks=i)
        end = start + timedelta(days=7)
        in_week = lambda d: d is not None and start <= _day(d) < end
        out.append({
            'week': start.isoformat(),
            'created': sum(in_week(_created(t)) for t in tasks),
            'completed': sum(in_week(t.get('completedAt') if isinstance(t.get('completedAt'), datetime) else None) for t in tasks),
        })
    return out


def oldest_overdue(tasks: list[dict], today: date) -> dict | None:
    late = [(deadline_of(t), t) for t in tasks if is_overdue(t, today) and deadline_of(t)]
    if not late:
        return None
    due, task = min(late, key=lambda x: x[0])
    return {'title': task.get('title', ''), 'daysLate': (today - due).days, 'meetingId': task.get('meeting_id')}
