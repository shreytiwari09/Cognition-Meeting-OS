from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore as admin_firestore
from access import can_manage_task, can_view_task, direct_report_uids, is_assignee, visible_tasks
from auth_middleware import get_current_user, require_role
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime, timezone
from firebase_config import db
from dateutil import parser as dparser
from crew.pipeline import resolve_deadline, resolve_owner
import uuid

router = APIRouter(prefix="/tasks", tags=["tasks"])

TaskStatus = Literal['pending', 'in_progress', 'done', 'overdue', 'escalated']


class TaskValidation(BaseModel):
    validated: Literal['approved', 'rejected', 'pending']
    edited_title: Optional[str] = None
    edited_assigned_to: Optional[str] = None
    edited_deadline: Optional[str] = None

class TaskStatusUpdate(BaseModel):
    status: TaskStatus
    escalated_to: Optional[str] = None

class ProgressUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)
    note: str = Field('', max_length=500)

class Reassign(BaseModel):
    assignee: str = Field(min_length=1, max_length=80)   # a team member's name (or uid)

class AcceptanceDecision(BaseModel):
    accept: bool
    reason: str = Field('', max_length=300)


def _log(meeting_id: str, agent: str, action: str):
    if not meeting_id:
        return
    db.collection('meetings').document(meeting_id).collection('logs').document(uuid.uuid4().hex[:8]).set({
        'agent': agent,
        'action': action,
        'timestamp': datetime.now(timezone.utc),
    })


def _get_task(task_id: str, user: dict, *, manage: bool):
    """The task, if the caller may see it (or, with manage=True, manage it); 403 otherwise."""
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
    task = task_doc.to_dict()
    reports = direct_report_uids(user)
    allowed = can_manage_task(user, task, reports) if manage else can_view_task(user, task, reports)
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")
    return task_ref, task


def _serialize(doc) -> dict:
    data = doc.to_dict()
    for key, value in list(data.items()):
        if hasattr(value, 'isoformat'):
            data[key] = value.isoformat()
    for update in data.get('updates') or []:
        if hasattr(update.get('at'), 'isoformat'):
            update['at'] = update['at'].isoformat()
    return {'id': doc.id, **data}


def _company_member(company_id: str, name_or_uid: str):
    team = [{'uid': d.id, **d.to_dict()} for d in db.collection('users').where('companyId', '==', company_id).stream()]
    return next((m for m in team if m['uid'] == name_or_uid), None) or resolve_owner(name_or_uid, team)


def _now():
    return datetime.now(timezone.utc)


@router.get("/")
def get_all_tasks(user: dict = Depends(get_current_user)):
    """Owners see every company task, managers their team's, employees only their own."""
    return [_serialize(t) for t in visible_tasks(user)]


@router.get("/mine")
def get_my_tasks(user: dict = Depends(get_current_user)):
    tasks = db.collection('tasks').where('companyId', '==', user['companyId']).stream()
    return [_serialize(t) for t in tasks if is_assignee(t.to_dict(), user)]


def _deadline_date(task: dict):
    if task.get('deadline_date'):
        return datetime.fromisoformat(task['deadline_date']).date()
    # Legacy tasks only have free-text deadlines
    deadline_str = task.get('deadline') or ''
    if deadline_str.upper() in ('TBD', 'N/A', 'NONE', 'NOT SPECIFIED', ''):
        return None
    try:
        return dparser.parse(deadline_str, fuzzy=True).date()
    except (ValueError, OverflowError):
        return None


@router.post("/check-overdue")
def check_overdue(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    pending = db.collection('tasks').where('companyId', '==', user['companyId']).where('status', 'in', ['pending', 'in_progress']).stream()
    updated = 0
    for snap in pending:
        deadline = _deadline_date(snap.to_dict())
        if deadline and deadline < today:
            db.collection('tasks').document(snap.id).update({'status': 'overdue'})
            updated += 1
    return {"updated": updated}


@router.post("/{task_id}/validate")
def validate_task(task_id: str, data: TaskValidation, user: dict = Depends(require_role('pm', 'manager'))):
    """Owners approve any task; managers approve their own team's."""
    task_ref, task = _get_task(task_id, user, manage=True)

    updates = {'validated': data.validated, 'needs_review': False, 'validatedBy': user.get('name', ''), 'validatedAt': _now()}
    if data.edited_title:
        updates['title'] = data.edited_title
    if data.edited_assigned_to:
        team = [{'uid': d.id, **d.to_dict()} for d in db.collection('users').where('companyId', '==', user['companyId']).stream()]
        member = resolve_owner(data.edited_assigned_to, team)
        updates['assigned_to'] = (member['name'] if member else data.edited_assigned_to).strip().lower()
        updates['owner_uid'] = member['uid'] if member else None
        if updates['owner_uid'] != task.get('owner_uid'):
            updates['acceptance'] = 'pending'   # the new owner has to accept it
    if data.edited_deadline:
        meeting = db.collection('meetings').document(task.get('meeting_id', '')).get() if task.get('meeting_id') else None
        base = (meeting.to_dict().get('date') if meeting and meeting.exists else None) or datetime.now(timezone.utc)
        updates['deadline_text'] = data.edited_deadline
        updates['deadline_date'] = resolve_deadline(data.edited_deadline, base)
        updates['deadline'] = updates['deadline_date'] or data.edited_deadline

    task_ref.update(updates)

    title = updates.get('title', task.get('title', ''))
    _log(task.get('meeting_id'), f"{user.get('name') or 'Reviewer'} (Human)", f"Task '{title}' {data.validated}")

    return {'task_id': task_id, 'validated': data.validated, 'status': 'updated'}


@router.patch("/{task_id}/status")
def update_task_status(task_id: str, data: TaskStatusUpdate, user: dict = Depends(get_current_user)):
    task_ref, task = _get_task(task_id, user, manage=False)
    if not (is_assignee(task, user) or can_manage_task(user, task, direct_report_uids(user))):
        raise HTTPException(status_code=403, detail="You can only update your own tasks or your team's")

    now = datetime.now(timezone.utc)
    updates = {
        **({'acceptance': 'accepted', 'acceptedAt': now} if data.status == 'done' and task.get('acceptance') == 'pending' and is_assignee(task, user) else {}),
        'status': data.status,
        'statusUpdatedAt': now,
        'completedAt': now if data.status == 'done' else admin_firestore.DELETE_FIELD,
    }
    if data.escalated_to:
        updates['escalated_to'] = data.escalated_to

    task_ref.update(updates)
    _log(task.get('meeting_id'), 'System', f"Task '{task.get('title', '')}' status changed to '{data.status}' by {user.get('name', 'a user')}")

    return {'task_id': task_id, 'status': data.status}


@router.patch("/{task_id}/progress")
def update_progress(task_id: str, data: ProgressUpdate, user: dict = Depends(get_current_user)):
    """The assignee (or their manager) reports progress with an optional note."""
    task_ref, task = _get_task(task_id, user, manage=False)
    if not (is_assignee(task, user) or can_manage_task(user, task, direct_report_uids(user))):
        raise HTTPException(status_code=403, detail="Only the assignee or their manager can update progress")
    entry = {'by': user.get('name', ''), 'at': _now(), 'progress': data.progress, 'note': data.note.strip()}
    updates = {
        'progress': data.progress, 'progressNote': data.note.strip(), 'statusUpdatedAt': entry['at'],
        'updates': (task.get('updates') or [])[-19:] + [entry],
    }
    if data.progress == 100 and task.get('status') != 'done':
        updates.update(status='done', completedAt=entry['at'])
    elif data.progress > 0 and task.get('status') == 'pending':
        updates['status'] = 'in_progress'
    if task.get('acceptance') == 'pending' and is_assignee(task, user):
        updates.update(acceptance='accepted', acceptedAt=entry['at'])
    task_ref.update(updates)
    _log(task.get('meeting_id'), 'System', f"{user.get('name', 'Someone')} set '{task.get('title', '')}' to {data.progress}%"
                                           + (f": {data.note.strip()}" if data.note.strip() else ''))
    return {'task_id': task_id, 'progress': data.progress, 'status': updates.get('status', task.get('status'))}


@router.patch("/{task_id}/assign")
def reassign_task(task_id: str, data: Reassign, user: dict = Depends(require_role('pm', 'manager'))):
    """Owners and the team's manager hand a task to someone else. The new owner has to accept it."""
    task_ref, task = _get_task(task_id, user, manage=True)
    member = _company_member(user['companyId'], data.assignee.strip())
    if not member:
        raise HTTPException(status_code=400, detail="Pick someone from your company")
    if member['uid'] == task.get('owner_uid'):
        return {'task_id': task_id, 'owner_uid': member['uid'], 'unchanged': True}
    task_ref.update({
        'owner_uid': member['uid'], 'assigned_to': member.get('name', '').strip().lower(),
        'acceptance': 'pending', 'declineReason': admin_firestore.DELETE_FIELD,
        'needs_review': False, 'statusUpdatedAt': _now(),
    })
    if task.get('meeting_id'):
        db.collection('meetings').document(task['meeting_id']).update({'memberUids': admin_firestore.ArrayUnion([member['uid']])})
    _log(task.get('meeting_id'), f"{user.get('name') or 'Reviewer'} (Human)", f"Task '{task.get('title', '')}' reassigned to {member.get('name')}")
    return {'task_id': task_id, 'owner_uid': member['uid'], 'assigned_to': member.get('name')}


@router.patch("/{task_id}/acceptance")
def decide_acceptance(task_id: str, data: AcceptanceDecision, user: dict = Depends(get_current_user)):
    """The assignee accepts a task, or declines it with a reason (which sends it back to their manager)."""
    task_ref, task = _get_task(task_id, user, manage=False)
    if not is_assignee(task, user):
        raise HTTPException(status_code=403, detail="Only the person the task is assigned to can accept or decline it")
    if data.accept:
        task_ref.update({'acceptance': 'accepted', 'acceptedAt': _now(), 'declineReason': admin_firestore.DELETE_FIELD})
        _log(task.get('meeting_id'), f"{user.get('name', 'Assignee')} (Human)", f"Accepted task '{task.get('title', '')}'")
        return {'task_id': task_id, 'acceptance': 'accepted'}
    reason = data.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="Tell your manager why you're declining")
    task_ref.update({
        'acceptance': 'declined', 'declineReason': reason, 'declinedAt': _now(),
        'needs_review': True, 'review_reason': f"Declined by {user.get('name', 'the assignee')}: {reason}",
    })
    _log(task.get('meeting_id'), f"{user.get('name', 'Assignee')} (Human)", f"Declined task '{task.get('title', '')}': {reason}")
    return {'task_id': task_id, 'acceptance': 'declined'}
