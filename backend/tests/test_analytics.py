"""Team performance: completion over the last N meetings and early-warning alerts."""
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import access
import analytics as an
import auth_middleware
from main import app
from routes import analytics as analytics_routes
from tests.fake_firestore import FakeDb

NOW = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
TODAY = NOW.date()


def task(status='pending', deadline=None, meeting='m0', **kw):
    return {'status': status, 'deadline_date': deadline, 'meeting_id': meeting, 'createdAt': NOW, **kw}


# ── Pure rules ────────────────────────────────────────────────────────────────

def test_the_six_out_of_ten_case_raises_a_warning():
    tasks = [task('done') for _ in range(6)] + [task() for _ in range(4)]
    window = an.stats(tasks, TODAY, NOW)
    assert (window['assigned'], window['done'], window['open'], window['rate']) == (10, 6, 4, 0.6)
    alerts = an.member_alerts('anika rao', window, an.stats([], TODAY, NOW), window, 10, None)
    assert alerts[0]['kind'] == 'behind' and alerts[0]['severity'] == 'warning'
    assert alerts[0]['message'] == 'Anika completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done.'
    assert an.member_status(alerts, 10) == 'attention'


def test_under_half_done_is_critical_and_mentions_overdue():
    tasks = [task('done'), task('done')] + [task(deadline='2026-09-20') for _ in range(3)] + [task()]
    window = an.stats(tasks, TODAY, NOW)
    alerts = an.member_alerts('Rahul', window, an.stats([], TODAY, NOW), window, 5, date(2026, 9, 20))
    behind = next(a for a in alerts if a['kind'] == 'behind')
    assert behind['severity'] == 'critical' and '3 of them overdue' in behind['message']
    overdue = next(a for a in alerts if a['kind'] == 'overdue')
    assert overdue['severity'] == 'warning' and 'Sep 20' in overdue['message']
    assert an.member_status(alerts, 6) == 'at_risk'


def test_too_few_tasks_are_not_judged():
    window = an.stats([task(), task()], TODAY, NOW)
    assert an.member_alerts('Dev', window, an.stats([], TODAY, NOW), window, 2, None) == []
    assert an.member_status([], 2) == 'on_track'
    assert an.member_status([], 0) == 'no_tasks'


def test_decline_versus_the_previous_window():
    prior = an.stats([task('done')] * 4 + [task()], TODAY, NOW)              # 80%
    window = an.stats([task('done')] * 3 + [task()] * 2, TODAY, NOW)         # 60%
    kinds = {a['kind'] for a in an.member_alerts('Sam', window, prior, window, 5, None)}
    assert {'declining', 'behind'} <= kinds
    prior = an.stats([task('done')] * 7 + [task()] * 3, TODAY, NOW)         # 70% → 50%: float-safe
    window = an.stats([task('done')] * 5 + [task()] * 5, TODAY, NOW)
    assert 'declining' in {a['kind'] for a in an.member_alerts('Sam', window, prior, window, 10, None)}


def test_stale_overloaded_and_escalated_signals():
    old = NOW - timedelta(days=20)
    tasks = [task(statusUpdatedAt=old), task(createdAt=old)] + [task() for _ in range(6)] + [task('escalated')]
    total = an.stats(tasks, TODAY, NOW)
    kinds = {a['kind']: a['severity'] for a in an.member_alerts('Lee', an.stats([], TODAY, NOW), an.stats([], TODAY, NOW), total, 10, None)}
    assert kinds == {'stale': 'warning', 'overloaded': 'info', 'escalated': 'info'}


def test_on_time_rate_uses_completion_date():
    tasks = [task('done', '2026-09-25', completedAt=datetime(2026, 9, 24, tzinfo=timezone.utc)),
             task('done', '2026-09-25', completedAt=datetime(2026, 9, 28, tzinfo=timezone.utc)),
             task('done')]  # no deadline: not judged
    assert an.stats(tasks, TODAY, NOW)['onTimeRate'] == 0.5


def test_overdue_and_done_tasks():
    assert an.is_overdue(task(deadline='2026-09-30'), TODAY)
    assert not an.is_overdue(task(deadline='2026-10-01'), TODAY)
    assert not an.is_overdue(task('done', '2026-09-01'), TODAY)
    assert an.is_overdue(task('overdue'), TODAY)


def test_windows_take_the_latest_finished_meetings():
    meetings = [{'id': f'm{i}', 'status': 'completed', 'date': NOW - timedelta(days=i)} for i in range(25)]
    meetings.append({'id': 'busy', 'status': 'processing', 'date': NOW})
    current, previous = an.split_windows(meetings, 10)
    assert [m['id'] for m in current] == [f'm{i}' for i in range(10)]
    assert [m['id'] for m in previous] == [f'm{i}' for i in range(10, 20)]


# ── Endpoint ──────────────────────────────────────────────────────────────────

CO = 'co_1'
OWNER = {'uid': 'owner', 'name': 'Olivia Owner', 'role': 'pm', 'companyId': CO}
MGR = {'uid': 'mgrA', 'name': 'Alan Alpha', 'role': 'manager', 'companyId': CO}
OTHER_MGR = {'uid': 'mgrB', 'name': 'Bea Beta', 'role': 'manager', 'companyId': CO}
ANIKA = {'uid': 'anika', 'name': 'Anika Rao', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrA'}
RAHUL = {'uid': 'rahul', 'name': 'Rahul Verma', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrA'}
BEN = {'uid': 'ben', 'name': 'Ben Other', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrB'}


def seed():
    data = {f"users/{u['uid']}": {k: v for k, v in u.items() if k != 'uid'} for u in (OWNER, MGR, OTHER_MGR, ANIKA, RAHUL, BEN)}
    for i in range(10):  # 10 meetings of team A, newest first by date
        data[f'meetings/a{i}'] = {'companyId': CO, 'status': 'completed', 'teamManagerId': 'mgrA', 'uploadedBy': 'mgrA',
                                  'date': NOW - timedelta(days=i), 'title': f'Standup {i}', 'memberUids': ['anika', 'rahul'],
                                  'risks': [{'title': 'Vendor delay', 'description': 'may slip'}] if i == 0 else []}
        # Anika: one task per meeting, 6 done. Rahul: all done.
        data[f'tasks/an{i}'] = {'companyId': CO, 'teamManagerId': 'mgrA', 'meeting_id': f'a{i}', 'title': f'Anika {i}',
                                'owner_uid': 'anika', 'assigned_to': 'anika rao', 'status': 'done' if i < 6 else 'pending',
                                'deadline_date': '2026-09-01' if i >= 8 else None, 'validated': 'approved', 'createdAt': NOW}
        data[f'tasks/ra{i}'] = {'companyId': CO, 'teamManagerId': 'mgrA', 'meeting_id': f'a{i}', 'title': f'Rahul {i}',
                                'owner_uid': 'rahul', 'assigned_to': 'rahul verma', 'status': 'done', 'validated': 'approved', 'createdAt': NOW}
    data['meetings/b0'] = {'companyId': CO, 'status': 'completed', 'teamManagerId': 'mgrB', 'date': NOW, 'title': 'B sync', 'memberUids': ['ben']}
    data['tasks/b0'] = {'companyId': CO, 'teamManagerId': 'mgrB', 'meeting_id': 'b0', 'title': 'Ben task', 'owner_uid': 'ben',
                        'status': 'pending', 'needs_review': True, 'validated': 'pending', 'createdAt': NOW}
    return data


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    fake = FakeDb(seed())
    for module in (access, auth_middleware, analytics_routes):
        monkeypatch.setattr(module, 'db', fake)
    yield fake
    app.dependency_overrides.clear()


client = TestClient(app)


def as_user(user):
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: user


def test_manager_sees_their_team_with_the_lagging_worker_first():
    as_user(MGR)
    body = client.get('/analytics/team').json()
    assert [m['uid'] for m in body['members']] == ['anika', 'rahul']
    anika = body['members'][0]
    assert anika['window']['assigned'] == 10 and anika['window']['done'] == 6
    assert anika['status'] == 'attention' and anika['alerts'][0]['kind'] == 'behind'
    assert len(anika['dots']) == 10 and anika['dots'].count('done') == 6 and anika['dots'].count('overdue') == 2
    assert body['members'][1]['status'] == 'on_track'
    assert body['alerts'][0]['name'] == 'Anika Rao'
    assert body['summary']['completionRate'] == 0.8 and body['meetingsInWindow'] == 10
    assert body['risks'][0]['title'] == 'Vendor delay'
    assert all(t['owner'] != 'ben' for t in body['pendingApproval'])   # nothing from another team


def test_owner_sees_everyone_including_managers():
    as_user(OWNER)
    body = client.get('/analytics/team').json()
    assert {m['uid'] for m in body['members']} == {'anika', 'rahul', 'ben', 'mgrA', 'mgrB'}
    assert body['summary']['pendingApproval'] == 1


def test_window_size_is_adjustable_and_validated():
    as_user(MGR)
    anika = client.get('/analytics/team?window=5').json()['members']
    assert {m['uid']: m['window']['assigned'] for m in anika} == {'rahul': 5, 'anika': 5}
    assert client.get('/analytics/team?window=1').status_code == 422


def test_employees_cannot_see_team_analytics():
    as_user(ANIKA)
    assert client.get('/analytics/team').status_code == 403
