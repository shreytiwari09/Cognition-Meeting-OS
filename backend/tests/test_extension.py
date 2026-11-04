"""The Chrome extension's revocable token: connect, use, revoke, and losing access."""
import pytest
from fastapi.testclient import TestClient

import access
import auth_middleware
from main import app
from routes import extension, meetings
from tests.fake_firestore import FakeDb

CO = 'co_1'
MGR = {'uid': 'mgr', 'name': 'Alan Alpha', 'role': 'manager', 'companyId': CO}
EMP = {'uid': 'emp', 'name': 'Anika Rao', 'role': 'employee', 'companyId': CO, 'managerId': 'mgr'}
MEETING = {'title': 'Standup', 'participants': [{'name': 'Anika Rao'}], 'transcript': 'Anika Rao: I will ship the page by Friday.'}


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    fake = FakeDb({f"users/{u['uid']}": {k: v for k, v in u.items() if k != 'uid'} for u in (MGR, EMP)}
                  | {f'companies/{CO}': {'name': 'Acme'}})
    for module in (extension, meetings, access, auth_middleware):
        monkeypatch.setattr(module, 'db', fake)
    monkeypatch.setattr(meetings, 'process_with_crew', lambda *a, **k: None)
    monkeypatch.setattr(extension.limiter, 'enabled', False)
    yield fake
    app.dependency_overrides.clear()


client = TestClient(app)


def as_user(user):
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: user


def connect():
    as_user(MGR)
    token = client.post('/extension/token').json()['token']
    app.dependency_overrides.clear()          # the extension itself has no Firebase session
    return {'Authorization': f'Bearer {token}'}


def test_connect_returns_a_token_that_is_stored_only_as_a_hash(fake_db):
    as_user(MGR)
    body = client.post('/extension/token').json()
    assert body['token'].startswith('mos_ext_') and body['companyName'] == 'Acme' and body['role'] == 'manager'
    stored = [k for k in fake_db.data if k.startswith('extensionTokens/')]
    assert len(stored) == 1 and body['token'] not in stored[0]
    assert client.get('/extension/status').json()['connected'] is True


def test_the_extension_can_identify_itself_and_upload(fake_db):
    headers = connect()
    assert client.get('/extension/me', headers=headers).json() == {'name': 'Alan Alpha', 'role': 'manager', 'companyName': 'Acme'}
    r = client.post('/extension/meetings', json=MEETING, headers=headers)
    assert r.status_code == 200
    saved = fake_db.data[f"meetings/{r.json()['meeting_id']}"]
    assert saved['source'] == 'extension' and saved['teamManagerId'] == 'mgr' and saved['memberUids'] == ['emp']


def test_bad_or_missing_tokens_are_rejected():
    assert client.get('/extension/me').status_code == 401
    assert client.get('/extension/me', headers={'Authorization': 'Bearer mos_ext_nope'}).status_code == 401
    assert client.post('/extension/meetings', json=MEETING, headers={'Authorization': 'Bearer firebase-id-token'}).status_code == 401


def test_reconnecting_replaces_the_old_token_and_disconnect_revokes(fake_db):
    old = connect()
    new = connect()
    assert client.get('/extension/me', headers=old).status_code == 401
    assert client.get('/extension/me', headers=new).status_code == 200
    as_user(MGR)
    assert client.delete('/extension/token').json() == {'revoked': 1}
    app.dependency_overrides.clear()
    assert client.get('/extension/me', headers=new).status_code == 401


def test_token_dies_when_the_user_loses_upload_rights(fake_db):
    headers = connect()
    fake_db.data['users/mgr']['role'] = 'employee'
    assert client.post('/extension/meetings', json=MEETING, headers=headers).status_code == 401
    assert not [k for k in fake_db.data if k.startswith('extensionTokens/')]


def test_employees_cannot_connect_an_extension():
    as_user(EMP)
    assert client.post('/extension/token').status_code == 403


def test_the_extension_can_disconnect_itself():
    headers = connect()
    assert client.delete('/extension/me', headers=headers).json() == {'revoked': 1}
    assert client.get('/extension/me', headers=headers).status_code == 401
