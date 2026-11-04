import pytest
from fastapi.testclient import TestClient

import auth_middleware
from main import app


def as_user(profile):
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: profile


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


PERSON = {'full_name': 'Nina New', 'job_title': 'Designer'}
COMPANY = {**PERSON, 'name': 'Globex', 'industry': 'Software', 'size': '11-50', 'country': 'India'}

client = TestClient(app)
EMPLOYEE = {'uid': 'e1', 'name': 'Anika Rao', 'role': 'employee', 'companyId': 'co_1'}
MANAGER = {'uid': 'm1', 'name': 'Dev Patel', 'role': 'manager', 'companyId': 'co_1'}
NO_COMPANY = {'uid': 'n1', 'name': 'New User'}


@pytest.mark.parametrize('method,path,body', [
    ('post', '/tasks/t1/validate', {'validated': 'approved'}),
    ('post', '/meetings/upload-transcript', {'participants': [], 'transcript': 'x' * 50}),
    ('post', '/meetings/m1/regenerate-summary', None),
    ('post', '/companies/invites', {'role': 'employee'}),
    ('get', '/companies/invites', None),
    ('patch', '/companies/team/u2/manager', {'manager_id': None}),
    ('get', '/companies/team', None),
    ('patch', '/companies/team/u2/role', {'role': 'pm'}),
])
def test_employee_is_forbidden_from_privileged_endpoints(method, path, body):
    as_user(EMPLOYEE)
    response = getattr(client, method)(path, **({'json': body} if body else {}))
    assert response.status_code == 403


def test_manager_cannot_change_roles_or_validate():
    as_user(MANAGER)
    assert client.patch('/companies/team/u2/role', json={'role': 'pm'}).status_code == 403
    assert client.post('/tasks/t1/validate', json={'validated': 'approved'}).status_code == 403


def test_user_without_company_cannot_read_company_data():
    as_user(NO_COMPANY)
    assert client.get('/tasks/').status_code == 403
    assert client.get('/meetings/').status_code == 403


def test_member_cannot_create_or_join_another_company():
    as_user(EMPLOYEE)
    assert client.post('/companies', json={**COMPANY, 'name': 'Evil Corp'}).status_code == 409
    assert client.post('/companies/join', json={**PERSON, 'invite_code': 'ABC123'}).status_code == 409


def test_missing_token_is_rejected():
    assert client.get('/tasks/').status_code in (401, 403)
