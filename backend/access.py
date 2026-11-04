"""Who may see and manage what.

Hierarchy: Owner (role `pm`) → Managers → their team (employees whose `managerId` is that manager).

- Owners see and manage everything in the company.
- Managers fully see and manage their own team's meetings and tasks (plus anything created before
  teams existed). A meeting they merely attended is visible, but only as a participant.
- Employees see only meetings they were part of or have a task in, and only their own tasks.
  They get the minutes, decisions and risks, never the transcript, audit trail or other people's tasks.

Meetings carry `teamManagerId` (the team they belong to, or None for company-wide) and `memberUids`
(participants plus task owners). Tasks carry `teamManagerId` copied from their meeting.
The functions below are pure so the rules are easy to test; the two `*_tasks` helpers read Firestore.
"""
from firebase_config import db

FULL, MEMBER = 'full', 'member'


def meeting_view(user: dict, meeting: dict) -> str | None:
    """'full', 'member' or None (no access)."""
    if meeting.get('companyId') != user['companyId']:
        return None
    uid, role = user['uid'], user['role']
    if role == 'pm':
        return FULL
    if role == 'manager':
        legacy = 'teamManagerId' not in meeting  # created before teams existed: stays company-wide for managers
        if legacy or meeting.get('teamManagerId') == uid or meeting.get('uploadedBy') == uid:
            return FULL
    if uid in (meeting.get('memberUids') or []):
        return MEMBER
    return None


def is_assignee(task: dict, user: dict) -> bool:
    if task.get('owner_uid'):
        return task['owner_uid'] == user['uid']
    # Tasks created before owner_uid existed are matched by name
    return (task.get('assigned_to') or '').lower() == (user.get('name') or '').strip().lower()


def can_manage_task(user: dict, task: dict, reports: set[str]) -> bool:
    """Approve/reject/edit and change any status: owners, and managers for their own team."""
    if task.get('companyId') != user['companyId']:
        return False
    if user['role'] == 'pm':
        return True
    if user['role'] == 'manager':
        legacy = 'teamManagerId' not in task
        return legacy or task.get('teamManagerId') == user['uid'] or task.get('owner_uid') in reports
    return False


def can_view_task(user: dict, task: dict, reports: set[str]) -> bool:
    return can_manage_task(user, task, reports) or (
        task.get('companyId') == user['companyId'] and is_assignee(task, user))


def visible_meetings(user: dict) -> list:
    """Firestore meeting snapshots the user may see (any view level)."""
    meetings = db.collection('meetings')
    if user['role'] == 'employee':
        snaps = meetings.where('memberUids', 'array_contains', user['uid']).stream()
    else:
        snaps = meetings.where('companyId', '==', user['companyId']).stream()
    return [s for s in snaps if meeting_view(user, s.to_dict())]


def direct_report_uids(user: dict) -> set[str]:
    if user['role'] != 'manager':
        return set()
    docs = db.collection('users').where('managerId', '==', user['uid']).stream()
    return {d.id for d in docs if d.to_dict().get('companyId') == user['companyId']}


def visible_tasks(user: dict) -> list:
    """Firestore task snapshots the user may see."""
    reports = direct_report_uids(user)
    snaps = db.collection('tasks').where('companyId', '==', user['companyId']).stream()
    return [s for s in snaps if can_view_task(user, s.to_dict(), reports)]
