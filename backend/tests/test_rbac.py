"""Owner → Manager → Team: who can invite, see and manage what."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import access
import auth_middleware
from main import app
from routes import companies, meetings, tasks
from tests.fake_firestore import FakeDb

NOW = datetime.now(timezone.utc)
CO = 'co_1'

OWNER = {'uid': 'owner', 'name': 'Olivia Owner', 'role': 'pm', 'companyId': CO}
MGR_A = {'uid': 'mgrA', 'name': 'Alan Alpha', 'role': 'manager', 'companyId': CO}
MGR_B = {'uid': 'mgrB', 'name': 'Bea Beta', 'role': 'manager', 'companyId': CO}
EMP_A = {'uid': 'empA', 'name': 'Anika Rao', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrA'}
EMP_B = {'uid': 'empB', 'name': 'Rahul Verma', 'role': 'employee', 'companyId': CO, 'managerId': 'mgrB'}
NEWBIE = {'uid': 'new', 'name': 'Nina New', 'email': 'nina@example.com'}
OUTSIDER = {'uid': 'out', 'name': 'Eve Else', 'role': 'pm', 'companyId': 'co_2'}


def seed():
    data = {f"users/{u['uid']}": {k: v for k, v in u.items() if k != 'uid'}
            for u in (OWNER, MGR_A, MGR_B, EMP_A, EMP_B, NEWBIE, OUTSIDER)}
    data[f'companies/{CO}'] = {'name': 'Acme', 'createdBy': 'owner'}
    base = dict(companyId=CO, status='completed', title='Sync', department='IT', date=NOW, transcript='SECRET TRANSCRIPT',
                mom='## Executive Summary\nHi', decisions=[{'title': 'd'}], risks=[], audit={'summary': 'x', 'findings': []})
    data['meetings/mA'] = {**base, 'teamManagerId': 'mgrA', 'uploadedBy': 'mgrA', 'memberUids': ['empA']}
    data['meetings/mB'] = {**base, 'teamManagerId': 'mgrB', 'uploadedBy': 'mgrB', 'memberUids': ['empB']}
    data['meetings/mAll'] = {**base, 'teamManagerId': None, 'uploadedBy': 'owner', 'memberUids': []}
    data['meetings/mOld'] = {**base, 'uploadedBy': 'owner', 'memberUids': []}  # created before teams existed
    data['meetings/mA/logs/l1'] = {'agent': 'System', 'action': 'secret log', 'timestamp': NOW}
    data['meetings/mA/participants/p1'] = {'name': 'Anika Rao', 'role': 'employee'}
    data['tasks/tA1'] = dict(companyId=CO, meeting_id='mA', title='A task', assigned_to='anika rao', owner_uid='empA',
                             teamManagerId='mgrA', status='pending', validated='pending')
    data['tasks/tA2'] = dict(companyId=CO, meeting_id='mA', title='A other', assigned_to='alan alpha', owner_uid='mgrA',
                             teamManagerId='mgrA', status='pending', validated='pending')
    data['tasks/tB1'] = dict(companyId=CO, meeting_id='mB', title='B task', assigned_to='rahul verma', owner_uid='empB',
                             teamManagerId='mgrB', status='pending', validated='pending')
    return data


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    fake = FakeDb(seed())
    for module in (companies, meetings, tasks, access, auth_middleware):
        monkeypatch.setattr(module, 'db', fake)
    monkeypatch.setattr(meetings, 'process_with_crew', lambda *a, **k: None)
    monkeypatch.setattr(companies.limiter, 'enabled', False)  # the 5/minute join limit would trip across tests
    yield fake
    app.dependency_overrides.clear()


PERSON = {'full_name': 'Nina New', 'job_title': 'Designer'}
COMPANY = {**PERSON, 'name': 'Globex', 'industry': 'Software', 'size': '11-50', 'country': 'India'}

client = TestClient(app)


def as_user(user):
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: user


def users(db, uid):
    return db.data[f'users/{uid}']


# ── Registration and invites ──────────────────────────────────────────────────

def test_registering_a_company_makes_you_its_owner(fake_db):
    as_user({**NEWBIE})
    r = client.post('/companies', json=COMPANY)
    assert r.status_code == 200 and r.json()['role'] == 'pm'
    assert users(fake_db, 'new')['role'] == 'pm' and users(fake_db, 'new')['companyId'] == r.json()['companyId']
    assert 'inviteCode' not in fake_db.data[f"companies/{r.json()['companyId']}"]


def test_owner_invites_managers_and_managers_invite_their_team(fake_db):
    as_user(OWNER)
    manager_invite = client.post('/companies/invites', json={'role': 'manager'}).json()
    assert manager_invite['role'] == 'manager' and manager_invite['managerId'] is None

    as_user(MGR_A)
    employee_invite = client.post('/companies/invites', json={'role': 'employee'}).json()
    assert employee_invite['managerId'] == 'mgrA'          # always their own team
    assert client.post('/companies/invites', json={'role': 'manager'}).status_code == 403
    assert [i['code'] for i in client.get('/companies/invites').json()] == [employee_invite['code']]  # only their own


def test_joining_with_a_manager_invite_makes_you_a_manager(fake_db):
    as_user(OWNER)
    code = client.post('/companies/invites', json={'role': 'manager'}).json()['code']
    as_user({**NEWBIE})
    r = client.post('/companies/join', json={**PERSON, 'invite_code': code})
    assert r.status_code == 200 and r.json()['role'] == 'manager'
    assert 'managerId' not in users(fake_db, 'new')
    assert fake_db.data[f'invites/{code}']['uses'] == 1


def test_joining_a_team_invite_places_you_in_that_managers_team(fake_db):
    as_user(MGR_A)
    code = client.post('/companies/invites', json={'role': 'employee'}).json()['code']
    as_user({**NEWBIE})
    assert client.post('/companies/join', json={**PERSON, 'invite_code': code.lower()}).json()['role'] == 'employee'
    assert users(fake_db, 'new')['managerId'] == 'mgrA'


def test_team_invite_still_works_if_the_manager_left(fake_db):
    as_user(MGR_A)
    code = client.post('/companies/invites', json={'role': 'employee'}).json()['code']
    users(fake_db, 'mgrA')['role'] = 'employee'
    as_user({**NEWBIE})
    assert client.post('/companies/join', json={**PERSON, 'invite_code': code}).status_code == 200
    assert 'managerId' not in users(fake_db, 'new')


def test_bad_invites_are_rejected(fake_db):
    fake_db.data['invites/OLD1'] = {'companyId': CO, 'role': 'employee', 'managerId': None, 'uses': 0, 'maxUses': 5,
                                   'expiresAt': NOW - timedelta(days=1)}
    fake_db.data['invites/FULL'] = {'companyId': CO, 'role': 'employee', 'managerId': None, 'uses': 5, 'maxUses': 5,
                                    'expiresAt': NOW + timedelta(days=1)}
    as_user({**NEWBIE})
    assert client.post('/companies/join', json={**PERSON, 'invite_code': 'OLD1'}).status_code == 400
    assert client.post('/companies/join', json={**PERSON, 'invite_code': 'FULL'}).status_code == 400
    assert client.post('/companies/join', json={**PERSON, 'invite_code': 'NOPE1234'}).status_code == 404


def test_legacy_company_code_joins_as_unassigned_employee(fake_db):
    fake_db.data[f'companies/{CO}']['inviteCode'] = 'LEGACY'
    as_user({**NEWBIE})
    r = client.post('/companies/join', json={**PERSON, 'invite_code': 'LEGACY'})
    assert r.status_code == 200 and r.json()['role'] == 'employee'


def test_revoking_invites(fake_db):
    as_user(MGR_A)
    code = client.post('/companies/invites', json={'role': 'employee'}).json()['code']
    as_user(MGR_B)
    assert client.delete(f'/companies/invites/{code}').status_code == 403
    as_user(OWNER)
    assert client.delete(f'/companies/invites/{code}').status_code == 200
    assert f'invites/{code}' not in fake_db.data


# ── Team management ───────────────────────────────────────────────────────────

def test_managers_only_see_their_own_team(fake_db):
    as_user(MGR_A)
    assert {m['uid'] for m in client.get('/companies/team').json()} == {'mgrA', 'empA'}
    as_user(OWNER)
    assert {m['uid'] for m in client.get('/companies/team').json()} == {'owner', 'mgrA', 'mgrB', 'empA', 'empB'}


def test_only_owners_change_roles_and_owners_are_untouchable(fake_db):
    as_user(OWNER)
    assert client.patch('/companies/team/empA/role', json={'role': 'manager'}).status_code == 200
    assert users(fake_db, 'empA')['role'] == 'manager' and 'managerId' not in users(fake_db, 'empA')
    users(fake_db, 'mgrB')['role'] = 'pm'
    assert client.patch('/companies/team/mgrB/role', json={'role': 'employee'}).status_code == 403
    as_user(MGR_A)
    assert client.patch('/companies/team/empB/role', json={'role': 'manager'}).status_code == 403


def test_demoting_a_manager_releases_their_team(fake_db):
    as_user(OWNER)
    client.patch('/companies/team/mgrA/role', json={'role': 'employee'})
    assert 'managerId' not in users(fake_db, 'empA')


def test_owner_moves_employees_between_teams(fake_db):
    as_user(OWNER)
    assert client.patch('/companies/team/empA/manager', json={'manager_id': 'mgrB'}).status_code == 200
    assert users(fake_db, 'empA')['managerId'] == 'mgrB'
    assert client.patch('/companies/team/empA/manager', json={'manager_id': 'empB'}).status_code == 400  # not a manager
    assert client.patch('/companies/team/mgrB/manager', json={'manager_id': 'mgrA'}).status_code == 400  # not an employee
    as_user(MGR_A)
    assert client.patch('/companies/team/empB/manager', json={'manager_id': 'mgrA'}).status_code == 403


def test_removal_rules(fake_db):
    as_user(MGR_A)
    assert client.delete('/companies/team/empB').status_code == 403     # someone else's team
    assert client.delete('/companies/team/mgrB').status_code == 403
    assert client.delete('/companies/team/owner').status_code == 403
    assert client.delete('/companies/team/empA').status_code == 200     # their own report
    assert 'companyId' not in users(fake_db, 'empA')
    as_user(OWNER)
    assert client.delete('/companies/team/mgrB').status_code == 200
    assert 'managerId' not in users(fake_db, 'empB')                    # team released
    users(fake_db, 'mgrA')['role'] = 'pm'
    assert client.delete('/companies/team/mgrA').status_code == 403     # owners cannot be removed


# ── Meetings: who sees what ───────────────────────────────────────────────────

def ids(response):
    return {m['id'] for m in response.json()}


def test_meeting_lists_are_scoped_by_role(fake_db):
    as_user(OWNER)
    assert ids(client.get('/meetings/')) == {'mA', 'mB', 'mAll', 'mOld'}
    as_user(MGR_A)
    assert ids(client.get('/meetings/')) == {'mA', 'mOld'}          # own team + pre-teams meetings
    as_user(EMP_A)
    listed = client.get('/meetings/').json()
    assert {m['id'] for m in listed} == {'mA'}
    assert listed[0]['decision_count'] == 1 and listed[0]['risk_count'] == 0 and listed[0]['highlight'] is None
    as_user(EMP_B)
    assert ids(client.get('/meetings/')) == {'mB'}


def test_employee_gets_a_redacted_view_with_only_their_tasks(fake_db):
    as_user(EMP_A)
    r = client.get('/meetings/mA')
    body = r.json()
    assert r.status_code == 200 and body['view'] == 'member'
    assert body['transcript'] is None and body['logs'] == [] and body['audit'] is None
    assert body['mom'].startswith('## Executive') and body['decisions']
    assert [t['id'] for t in body['tasks']] == ['tA1']             # not their manager's task


def test_employee_cannot_open_other_meetings_logs_or_chat(fake_db):
    as_user(EMP_A)
    assert client.get('/meetings/mB').status_code == 403
    assert client.get('/meetings/mAll').status_code == 403
    assert client.get('/meetings/mA/logs').status_code == 403
    assert client.post('/meetings/mA/chat', json={'message': 'what was said?'}).status_code == 403
    assert client.post('/meetings/mA/regenerate-summary').status_code == 403


def test_manager_has_full_access_to_their_team_only(fake_db):
    as_user(MGR_A)
    body = client.get('/meetings/mA').json()
    assert body['view'] == 'full' and body['transcript'] == 'SECRET TRANSCRIPT' and body['audit']
    assert {t['id'] for t in body['tasks']} == {'tA1', 'tA2'}
    assert client.get('/meetings/mA/logs').status_code == 200
    assert client.get('/meetings/mB').status_code == 403
    assert client.get('/meetings/mAll').status_code == 403


def test_manager_who_attended_another_teams_meeting_is_only_a_participant(fake_db):
    fake_db.data['meetings/mB']['memberUids'].append('mgrA')
    as_user(MGR_A)
    body = client.get('/meetings/mB').json()
    assert body['view'] == 'member' and body['transcript'] is None


def test_owner_sees_everything_and_other_companies_nothing(fake_db):
    as_user(OWNER)
    assert client.get('/meetings/mB').json()['view'] == 'full'
    as_user(OUTSIDER)
    assert client.get('/meetings/mA').status_code == 403


def test_uploads_are_assigned_to_the_right_team(fake_db):
    body = {'title': 'Weekly', 'participants': [{'name': 'Anika Rao'}, {'name': 'Someone Unknown'}], 'transcript': 'x' * 40}
    as_user(MGR_A)
    meeting_id = client.post('/meetings/upload-transcript', json={**body, 'team_manager_id': 'mgrB'}).json()['meeting_id']
    saved = fake_db.data[f'meetings/{meeting_id}']
    assert saved['teamManagerId'] == 'mgrA'                          # a manager cannot upload into another team
    assert saved['memberUids'] == ['empA']                           # participants matched to real members

    as_user(OWNER)
    meeting_id = client.post('/meetings/upload-transcript', json={**body, 'team_manager_id': 'mgrB'}).json()['meeting_id']
    assert fake_db.data[f'meetings/{meeting_id}']['teamManagerId'] == 'mgrB'
    assert client.post('/meetings/upload-transcript', json={**body, 'team_manager_id': 'empA'}).status_code == 400
    as_user(EMP_A)
    assert client.post('/meetings/upload-transcript', json=body).status_code == 403


# ── Tasks ─────────────────────────────────────────────────────────────────────

def test_task_lists_are_scoped(fake_db):
    def task_ids(user):
        as_user(user)
        return {t['id'] for t in client.get('/tasks/').json()}
    assert task_ids(OWNER) == {'tA1', 'tA2', 'tB1'}
    assert task_ids(MGR_A) == {'tA1', 'tA2'}
    assert task_ids(EMP_A) == {'tA1'}
    assert task_ids(EMP_B) == {'tB1'}


def test_managers_approve_only_their_teams_tasks(fake_db):
    as_user(MGR_A)
    assert client.post('/tasks/tA1/validate', json={'validated': 'approved'}).status_code == 200
    assert fake_db.data['tasks/tA1']['validated'] == 'approved'
    assert client.post('/tasks/tB1/validate', json={'validated': 'approved'}).status_code == 403
    as_user(OWNER)
    assert client.post('/tasks/tB1/validate', json={'validated': 'rejected'}).status_code == 200
    as_user(EMP_A)
    assert client.post('/tasks/tA1/validate', json={'validated': 'approved'}).status_code == 403


def test_status_updates_follow_ownership_and_team(fake_db):
    as_user(EMP_A)
    assert client.patch('/tasks/tA1/status', json={'status': 'done'}).status_code == 200
    assert client.patch('/tasks/tA2/status', json={'status': 'done'}).status_code == 403   # manager's task
    assert client.patch('/tasks/tB1/status', json={'status': 'done'}).status_code == 403   # other team
    as_user(MGR_A)
    assert client.patch('/tasks/tA1/status', json={'status': 'escalated'}).status_code == 200
    assert client.patch('/tasks/tB1/status', json={'status': 'done'}).status_code == 403


# ── The access rules on their own ─────────────────────────────────────────────

def test_meeting_view_rules():
    me = {**MGR_A}
    assert access.meeting_view(me, {'companyId': 'other'}) is None
    assert access.meeting_view(me, {'companyId': CO, 'teamManagerId': 'mgrB', 'memberUids': []}) is None
    assert access.meeting_view(me, {'companyId': CO}) == access.FULL                 # legacy
    assert access.meeting_view(me, {'companyId': CO, 'teamManagerId': None, 'memberUids': []}) is None  # owner-only
    assert access.meeting_view(me, {'companyId': CO, 'teamManagerId': None, 'uploadedBy': 'mgrA'}) == access.FULL


# ── Onboarding details and invite preview ─────────────────────────────────────

def test_registration_stores_owner_and_company_details(fake_db):
    as_user({**NEWBIE})
    body = {**COMPANY, 'full_name': 'Nina Newton', 'job_title': 'CEO', 'phone': '+91 98765 43210', 'website': 'globex.io'}
    company_id = client.post('/companies', json=body).json()['companyId']
    user = users(fake_db, 'new')
    assert (user['name'], user['jobTitle'], user['phone'], user['role']) == ('Nina Newton', 'CEO', '+91 98765 43210', 'pm')
    company = fake_db.data[f'companies/{company_id}']
    assert (company['industry'], company['size'], company['country'], company['website']) == ('Software', '11-50', 'India', 'globex.io')


def test_registration_requires_full_details():
    as_user({**NEWBIE})
    assert client.post('/companies', json={'name': 'Globex'}).status_code == 422
    assert client.post('/companies', json={**COMPANY, 'size': 'huge'}).status_code == 422
    assert client.post('/companies/join', json={'invite_code': 'ABCD1234'}).status_code == 422


def test_preview_shows_company_role_and_team_without_joining(fake_db):
    as_user(MGR_A)
    code = client.post('/companies/invites', json={'role': 'employee'}).json()['code']
    as_user({**NEWBIE})
    assert client.get('/companies/invite-preview', params={'code': code.lower()}).json() == \
        {'companyName': 'Acme', 'role': 'employee', 'managerName': 'Alan Alpha'}
    assert 'companyId' not in users(fake_db, 'new')                 # previewing doesn't join
    assert fake_db.data[f'invites/{code}']['uses'] == 0
    assert client.get('/companies/invite-preview', params={'code': 'NOPE1234'}).status_code == 404


def test_joining_stores_the_persons_details(fake_db):
    as_user(OWNER)
    code = client.post('/companies/invites', json={'role': 'manager'}).json()['code']
    as_user({**NEWBIE})
    body = {'invite_code': code, 'full_name': 'Nina Newton', 'job_title': 'Engineering Manager', 'department': 'Platform'}
    assert client.post('/companies/join', json=body).json()['role'] == 'manager'
    user = users(fake_db, 'new')
    assert (user['name'], user['jobTitle'], user['department']) == ('Nina Newton', 'Engineering Manager', 'Platform')
    as_user(OWNER)
    joined = next(m for m in client.get('/companies/team').json() if m['uid'] == 'new')
    assert joined['jobTitle'] == 'Engineering Manager' and joined['department'] == 'Platform'


def test_members_cannot_preview_invites():
    as_user(EMP_A)
    assert client.get('/companies/invite-preview', params={'code': 'ABCD1234'}).status_code == 409
