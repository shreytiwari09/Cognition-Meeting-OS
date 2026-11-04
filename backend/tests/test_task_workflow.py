"""Manual tasks, acceptance by the assignee, reassignment, progress, notifications, export and new analytics."""
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import access
import analytics as an
import auth_middleware
from crew.pipeline import assemble
from crew.schemas import ExtractedItem, ExtractionResult
from main import app
from routes import analytics as analytics_routes, meetings, tasks
from tests.fake_firestore import FakeDb

NOW = datetime.now(timezone.utc)
CO = 'co_1'
OWNER = {'uid': 'owner', 'name': 'Olivia Owner', 'role': 'pm', 'companyId': CO}
MGR = {'uid': 'mgrA', 'name': 'Alan Alpha', 'role': 'manager', 'companyId': CO}
ANIKA = {'uid': 'anika', 'name': 'Anika Rao', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrA', 'jobTitle': 'Frontend Developer'}
RAHUL = {'uid': 'rahul', 'name': 'Rahul Verma', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrA'}


def seed():
    data = {f"users/{u['uid']}": {k: v for k, v in u.items() if k != 'uid'} for u in (OWNER, MGR, ANIKA, RAHUL)}
    data['meetings/m1'] = {'companyId': CO, 'status': 'completed', 'teamManagerId': 'mgrA', 'uploadedBy': 'mgrA', 'title': 'Sync',
                           'date': NOW, 'transcript': 'x', 'memberUids': ['anika'], 'flagged_count': 1}
    data['tasks/t1'] = {'companyId': CO, 'teamManagerId': 'mgrA', 'meeting_id': 'm1', 'title': 'Ship page', 'owner_uid': 'anika',
                        'assigned_to': 'anika rao', 'status': 'pending', 'validated': 'pending', 'needs_review': True,
                        'acceptance': 'pending', 'createdAt': NOW, 'confidence': 80.0}
    return data


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    fake = FakeDb(seed())
    for module in (meetings, tasks, access, auth_middleware, analytics_routes):
        monkeypatch.setattr(module, 'db', fake)
    yield fake
    app.dependency_overrides.clear()


client = TestClient(app)


def as_user(user):
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: user


def task(fake, tid='t1'):
    return fake.data[f'tasks/{tid}']


# ── Adding tasks by hand ──────────────────────────────────────────────────────

def test_manager_adds_a_task_that_the_assignee_must_accept(fake_db):
    as_user(MGR)
    r = client.post('/meetings/m1/tasks', json={'title': 'Write release notes', 'assignee': 'Rahul Verma', 'deadline': '2026-12-01'})
    assert r.status_code == 200
    t = task(fake_db, r.json()['id'])
    assert (t['owner_uid'], t['validated'], t['acceptance'], t['source'], t['deadline_date']) == ('rahul', 'approved', 'pending', 'manual', '2026-12-01')
    assert 'rahul' in fake_db.data['meetings/m1']['memberUids']
    assert client.post('/meetings/m1/tasks', json={'title': 'Write release notes', 'assignee': 'rahul'}).status_code == 409
    assert client.post('/meetings/m1/tasks', json={'title': 'Something else', 'assignee': 'Nobody Here'}).status_code == 400


def test_employees_cannot_add_tasks():
    as_user(ANIKA)
    assert client.post('/meetings/m1/tasks', json={'title': 'My own idea', 'assignee': 'anika'}).status_code == 403


def test_meeting_detail_includes_assignee_job_title():
    as_user(MGR)
    t = client.get('/meetings/m1').json()['tasks'][0]
    assert t['assignee_title'] == 'Frontend Developer' and isinstance(t['createdAt'], str)


# ── Acceptance ────────────────────────────────────────────────────────────────

def test_assignee_accepts(fake_db):
    as_user(ANIKA)
    assert client.patch('/tasks/t1/acceptance', json={'accept': True}).json()['acceptance'] == 'accepted'
    assert task(fake_db)['acceptance'] == 'accepted'


def test_declining_needs_a_reason_and_goes_back_to_the_manager(fake_db):
    as_user(ANIKA)
    assert client.patch('/tasks/t1/acceptance', json={'accept': False}).status_code == 400
    assert client.patch('/tasks/t1/acceptance', json={'accept': False, 'reason': 'I am on leave next week'}).status_code == 200
    t = task(fake_db)
    assert t['acceptance'] == 'declined' and t['needs_review'] and 'on leave' in t['review_reason']
    as_user(MGR)
    kinds = [i['kind'] for i in client.get('/notifications').json()['items']]
    assert 'declined' in kinds


def test_only_the_assignee_decides_acceptance():
    as_user(RAHUL)
    assert client.patch('/tasks/t1/acceptance', json={'accept': True}).status_code == 403
    as_user(MGR)
    assert client.patch('/tasks/t1/acceptance', json={'accept': True}).status_code == 403


def test_marking_done_implies_acceptance(fake_db):
    as_user(ANIKA)
    client.patch('/tasks/t1/status', json={'status': 'done'})
    assert task(fake_db)['acceptance'] == 'accepted'


# ── Reassigning and approving ─────────────────────────────────────────────────

def test_reassign_resets_acceptance_for_the_new_owner(fake_db):
    task(fake_db)['acceptance'] = 'declined'
    as_user(MGR)
    r = client.patch('/tasks/t1/assign', json={'assignee': 'Rahul Verma'})
    assert r.status_code == 200
    t = task(fake_db)
    assert (t['owner_uid'], t['acceptance'], t['needs_review']) == ('rahul', 'pending', False)
    assert 'rahul' in fake_db.data['meetings/m1']['memberUids']
    as_user(ANIKA)
    assert client.patch('/tasks/t1/assign', json={'assignee': 'anika'}).status_code == 403


def test_approval_records_who_approved(fake_db):
    as_user(MGR)
    client.post('/tasks/t1/validate', json={'validated': 'approved'})
    assert task(fake_db)['validatedBy'] == 'Alan Alpha'


# ── Progress ──────────────────────────────────────────────────────────────────

def test_progress_updates_status_and_history(fake_db):
    as_user(ANIKA)
    assert client.patch('/tasks/t1/progress', json={'progress': 40, 'note': 'Design done'}).json()['status'] == 'in_progress'
    t = task(fake_db)
    assert t['progress'] == 40 and t['updates'][-1]['note'] == 'Design done' and t['acceptance'] == 'accepted'
    client.patch('/tasks/t1/progress', json={'progress': 100})
    assert task(fake_db)['status'] == 'done' and task(fake_db)['completedAt']
    as_user(RAHUL)
    assert client.patch('/tasks/t1/progress', json={'progress': 10}).status_code == 403
    assert client.patch('/tasks/t1/progress', json={'progress': 140}).status_code == 422


# ── Notifications, export, analytics ─────────────────────────────────────────

def test_notifications_for_employee_and_manager():
    as_user(ANIKA)
    assert [i['kind'] for i in client.get('/notifications').json()['items']] == ['accept']
    as_user(MGR)
    kinds = {i['kind'] for i in client.get('/notifications').json()['items']}
    assert {'review', 'meeting'} <= kinds


def test_export_csv_lists_visible_tasks():
    as_user(MGR)
    r = client.get('/analytics/export')
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/csv')
    lines = r.text.strip().splitlines()
    assert lines[0].startswith('meeting,meeting_date,task,assignee') and 'Ship page' in lines[1]
    as_user(ANIKA)
    assert client.get('/analytics/export').status_code == 403


def test_weekly_series_and_oldest_overdue():
    today = date(2026, 10, 7)   # a Wednesday
    monday = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
    ts = [{'createdAt': monday, 'completedAt': monday + timedelta(days=1)},
          {'createdAt': monday - timedelta(days=7)},
          {'createdAt': monday - timedelta(days=60)}]
    weeks = an.weekly_series(ts, today)
    assert len(weeks) == 6 and weeks[-1] == {'week': '2026-10-05', 'created': 1, 'completed': 1}
    assert weeks[-2]['created'] == 1
    late = an.oldest_overdue([{'title': 'A', 'deadline_date': '2026-10-01', 'status': 'pending'},
                              {'title': 'B', 'deadline_date': '2026-09-20', 'status': 'pending'}], today)
    assert late == {'title': 'B', 'daysLate': 17, 'meetingId': None}


def test_upload_stores_people_and_estimates_duration(fake_db, monkeypatch):
    monkeypatch.setattr(meetings, 'process_with_crew', lambda *a, **k: None)
    as_user(MGR)
    body = {'title': 'Plan', 'participants': [{'name': 'Anika Rao'}, {'name': 'Guest Person'}], 'transcript': 'word ' * 700}
    mid = client.post('/meetings/upload-transcript', json=body).json()['meeting_id']
    m = fake_db.data[f'meetings/{mid}']
    assert m['participantNames'] == ['Anika Rao', 'Guest Person'] and m['durationMinutes'] == 5 and m['durationEstimated']
    mid = client.post('/meetings/upload-transcript', json={**body, 'duration_minutes': 42}).json()['meeting_id']
    assert fake_db.data[f'meetings/{mid}']['durationMinutes'] == 42
    listed = next(x for x in client.get('/meetings/').json() if x['id'] == mid)
    assert listed['duration_minutes'] == 42 and listed['participant_names'] == ['Anika Rao', 'Guest Person']


def test_risks_carry_severity_and_mitigation():
    risk = ExtractedItem(type='risk', title='Sandbox flaky', description='may slip', evidence_quote='the sandbox has been flaky lately',
                         severity='high', mitigation='Use recorded fixtures')
    vague = risk.model_copy(update={'severity': None, 'mitigation': '', 'title': 'Other'})
    result = assemble(meeting_id='m', extraction=ExtractionResult(items=[risk, vague]), assignments=[], reviews=[], followups=[],
                      team=[], meeting_date=NOW, transcript='the sandbox has been flaky lately')
    assert [(r['severity'], r['mitigation']) for r in result['risks']] == [('high', 'Use recorded fixtures'), ('medium', '')]
