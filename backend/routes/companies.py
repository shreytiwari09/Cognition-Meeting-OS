from typing import Literal

from fastapi import APIRouter, HTTPException, Depends, Request
from firebase_admin import firestore as admin_firestore
from pydantic import BaseModel, Field
from firebase_config import db
from auth_middleware import (
    get_current_profile, require_role, get_user_profile, invalidate_user, VALID_ROLES,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timezone, timedelta
import secrets, string

router = APIRouter(prefix="/companies", tags=["companies"])
limiter = Limiter(key_func=get_remote_address)

INVITE_ALPHABET = string.ascii_uppercase + string.digits
INVITE_TTL = timedelta(days=7)
INVITE_MAX_USES = 50


class PersonDetails(BaseModel):
    """What we ask everyone during onboarding."""
    full_name: str = Field(min_length=2, max_length=80)
    job_title: str = Field(min_length=2, max_length=80)
    phone: str = Field('', max_length=30)


class CompanyCreate(PersonDetails):
    """Registering a company: the owner's details plus the company's."""
    name: str = Field(min_length=2, max_length=100)
    industry: str = Field(min_length=2, max_length=60)
    size: Literal['1-10', '11-50', '51-200', '201-1000', '1000+']
    country: str = Field(min_length=2, max_length=60)
    website: str = Field('', max_length=200)


class CompanyJoin(PersonDetails):
    invite_code: str = Field(min_length=4, max_length=12)
    department: str = Field('', max_length=60)

class InviteCreate(BaseModel):
    role: Literal['manager', 'employee'] = 'employee'
    manager_id: str | None = None   # owners may place an invited employee in a manager's team

class RoleUpdate(BaseModel):
    role: str

class ManagerAssign(BaseModel):
    manager_id: str | None = None


def _gen_invite_code():
    """8-character uppercase alphanumeric invite code."""
    return ''.join(secrets.choice(INVITE_ALPHABET) for _ in range(8))


def _now():
    return datetime.now(timezone.utc)


def _require_no_company(profile: dict):
    if profile.get('companyId'):
        raise HTTPException(status_code=409, detail="You already belong to a company")


def _expired(doc: dict) -> bool:
    expires_at = doc.get('expiresAt')
    return bool(expires_at and expires_at < _now())


def _person_fields(data: PersonDetails) -> dict:
    fields = {'name': data.full_name.strip(), 'jobTitle': data.job_title.strip(), 'phone': data.phone.strip()}
    department = getattr(data, 'department', '').strip()
    if department:
        fields['department'] = department
    return fields


def _resolve_invite(code: str):
    """(company_id, role, manager_id, invite_ref or None) for a usable code; raises a friendly error otherwise."""
    code = code.strip().upper()
    invite_ref = db.collection('invites').document(code)
    invite_doc = invite_ref.get()
    if invite_doc.exists:
        invite = invite_doc.to_dict()
        if _expired(invite):
            raise HTTPException(status_code=400, detail="This invite has expired. Ask for a new code.")
        if invite.get('uses', 0) >= invite.get('maxUses', INVITE_MAX_USES):
            raise HTTPException(status_code=400, detail="This invite has been used up. Ask for a new code.")
        manager_id = None
        if invite['role'] == 'employee' and invite.get('managerId'):
            try:
                _require_company_manager(invite['managerId'], invite['companyId'])
                manager_id = invite['managerId']
            except HTTPException:
                pass  # the manager left or was demoted: join unassigned
        return invite['companyId'], invite['role'], manager_id, invite_ref
    # Legacy company-wide code from before role-aware invites: joins as an unassigned employee
    docs = list(db.collection('companies').where('inviteCode', '==', code).limit(1).stream())
    if not docs:
        raise HTTPException(status_code=404, detail="That invite code doesn't exist. Check it and try again.")
    if _expired(docs[0].to_dict()):
        raise HTTPException(status_code=400, detail="This invite has expired. Ask for a new code.")
    return docs[0].id, 'employee', None, None


def _company_members(company_id: str) -> list[dict]:
    return [{'uid': d.id, **d.to_dict()} for d in db.collection('users').where('companyId', '==', company_id).stream()]


def _unassign_reports(manager_uid: str, company_id: str):
    """When a manager is removed or demoted, their team goes back to 'no manager'."""
    for d in db.collection('users').where('managerId', '==', manager_uid).stream():
        if d.to_dict().get('companyId') == company_id:
            db.collection('users').document(d.id).update({'managerId': admin_firestore.DELETE_FIELD})
            invalidate_user(d.id)


def _require_company_manager(manager_id: str, company_id: str) -> dict:
    profile = get_user_profile(manager_id)
    if profile.get('companyId') != company_id or profile.get('role') != 'manager':
        raise HTTPException(status_code=400, detail="That user is not a manager in your company")
    return profile


# ── Register / join (membership is only ever written by the backend) ───────────

@router.post("")
@limiter.limit("5/minute")
def create_company(request: Request, data: CompanyCreate, profile: dict = Depends(get_current_profile)):
    """Register a company. The registrant becomes its Owner (stored role: pm)."""
    _require_no_company(profile)

    company_ref = db.collection('companies').document(f"co_{secrets.token_hex(6)}")
    company_ref.set({
        'name': data.name.strip(),
        'industry': data.industry.strip(),
        'size': data.size,
        'country': data.country.strip(),
        'website': data.website.strip(),
        'createdBy': profile['uid'],
        'createdAt': _now(),
    })
    db.collection('users').document(profile['uid']).update({
        **_person_fields(data), 'companyId': company_ref.id, 'role': 'pm', 'updatedAt': _now(),
    })
    invalidate_user(profile['uid'])

    return {"companyId": company_ref.id, "companyName": data.name.strip(), "role": "pm"}


@router.get("/invite-preview")
@limiter.limit("20/minute")
def preview_invite(request: Request, code: str, profile: dict = Depends(get_current_profile)):
    """Before joining: which company, which role and which team does this code lead to?"""
    _require_no_company(profile)
    if not 4 <= len(code.strip()) <= 12:
        raise HTTPException(status_code=400, detail="Invite codes are 8 letters and numbers.")
    company_id, role, manager_id, _ = _resolve_invite(code)
    company = db.collection('companies').document(company_id).get().to_dict() or {}
    manager_name = None
    if manager_id:
        manager_name = (db.collection('users').document(manager_id).get().to_dict() or {}).get('name')
    return {'companyName': company.get('name', ''), 'role': role, 'managerName': manager_name}


@router.post("/join")
@limiter.limit("5/minute")
def join_company(request: Request, data: CompanyJoin, profile: dict = Depends(get_current_profile)):
    """Join with an invite code. The invite decides the role and, for employees, the team."""
    _require_no_company(profile)
    company_id, role, manager_id, invite_ref = _resolve_invite(data.invite_code)

    updates = {**_person_fields(data), 'companyId': company_id, 'role': role, 'updatedAt': _now()}
    if manager_id:
        updates['managerId'] = manager_id
    db.collection('users').document(profile['uid']).update(updates)
    if invite_ref:
        invite_ref.update({'uses': admin_firestore.Increment(1)})
    invalidate_user(profile['uid'])
    company = db.collection('companies').document(company_id).get().to_dict() or {}
    return {"companyId": company_id, "companyName": company.get('name', ''), "role": role}


# ── Invites ────────────────────────────────────────────────────────────────────

@router.post("/invites")
@limiter.limit("30/minute")
def create_invite(request: Request, data: InviteCreate, user: dict = Depends(require_role('pm', 'manager'))):
    """Owners invite managers (or employees into a chosen team). Managers invite employees into their own team."""
    manager_id = None
    if user['role'] == 'manager':
        if data.role != 'employee':
            raise HTTPException(status_code=403, detail="Managers can only invite team members")
        manager_id = user['uid']
    elif data.role == 'employee' and data.manager_id:
        _require_company_manager(data.manager_id, user['companyId'])
        manager_id = data.manager_id

    for _ in range(5):
        code = _gen_invite_code()
        if not db.collection('invites').document(code).get().exists:
            break
    expires_at = _now() + INVITE_TTL
    db.collection('invites').document(code).set({
        'companyId': user['companyId'], 'role': data.role, 'managerId': manager_id,
        'createdBy': user['uid'], 'createdAt': _now(), 'expiresAt': expires_at,
        'uses': 0, 'maxUses': INVITE_MAX_USES,
    })
    return {"code": code, "role": data.role, "managerId": manager_id, "expiresAt": expires_at.isoformat(), "uses": 0}


@router.get("/invites")
def list_invites(user: dict = Depends(require_role('pm', 'manager'))):
    """Owners see every active invite; managers see their own."""
    docs = db.collection('invites').where('companyId', '==', user['companyId']).stream()
    result = []
    for d in docs:
        inv = d.to_dict()
        if user['role'] == 'manager' and inv.get('createdBy') != user['uid']:
            continue
        if _expired(inv) or inv.get('uses', 0) >= inv.get('maxUses', INVITE_MAX_USES):
            continue
        result.append({
            "code": d.id, "role": inv['role'], "managerId": inv.get('managerId'),
            "expiresAt": inv['expiresAt'].isoformat(), "uses": inv.get('uses', 0),
        })
    result.sort(key=lambda i: i['expiresAt'], reverse=True)
    return result


@router.delete("/invites/{code}")
def revoke_invite(code: str, user: dict = Depends(require_role('pm', 'manager'))):
    ref = db.collection('invites').document(code.upper())
    doc = ref.get()
    if not doc.exists or doc.to_dict().get('companyId') != user['companyId']:
        raise HTTPException(status_code=404, detail="Invite not found")
    if user['role'] == 'manager' and doc.to_dict().get('createdBy') != user['uid']:
        raise HTTPException(status_code=403, detail="You can only revoke your own invites")
    ref.delete()
    return {"message": "Invite revoked"}


# ── Team ───────────────────────────────────────────────────────────────────────

@router.get("/team")
def get_company_team(user: dict = Depends(require_role('pm', 'manager'))):
    """Owners see everyone. Managers see themselves and their own team."""
    members = _company_members(user['companyId'])
    names = {m['uid']: m.get('name', '') for m in members}
    if user['role'] == 'manager':
        members = [m for m in members if m['uid'] == user['uid'] or m.get('managerId') == user['uid']]

    team = []
    for m in members:
        created_at = m.get('createdAt')
        team.append({
            "uid": m['uid'],
            "name": m.get("name", ""),
            "email": m.get("email", ""),
            "role": m.get("role", ""),
            "jobTitle": m.get("jobTitle", ""),
            "department": m.get("department", ""),
            "managerId": m.get("managerId"),
            "managerName": names.get(m.get("managerId"), ""),
            "createdAt": created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at) if created_at else None,
        })

    # Owners first, then managers, then employees; alphabetical within each group
    role_order = {'pm': 0, 'manager': 1, 'employee': 2}
    team.sort(key=lambda u: (role_order.get(u['role'], 99), u['name'].lower()))
    return team


@router.get("/info")
def get_company_info(user: dict = Depends(require_role('pm', 'manager'))):
    company_doc = db.collection('companies').document(user['companyId']).get()
    if not company_doc.exists:
        raise HTTPException(status_code=404, detail="Company not found")
    members = _company_members(user['companyId'])
    if user['role'] == 'manager':
        members = [m for m in members if m.get('managerId') == user['uid']]
    return {
        "companyId": user['companyId'],
        "name": company_doc.to_dict().get("name", ""),
        "memberCount": len(members),
        "managerCount": sum(1 for m in members if m.get('role') == 'manager'),
    }


@router.patch("/team/{target_uid}/role")
def update_member_role(target_uid: str, data: RoleUpdate, user: dict = Depends(require_role('pm'))):
    """Owner only. Owners cannot be changed by anyone, so a company is never left without one."""
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(VALID_ROLES)}")
    if target_uid == user['uid']:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    target = get_user_profile(target_uid)
    if target.get('companyId') != user['companyId']:
        raise HTTPException(status_code=404, detail="User not found in your company")
    if target.get('role') == 'pm':
        raise HTTPException(status_code=403, detail="Owners cannot be changed")

    updates = {'role': data.role, 'updatedAt': _now()}
    if data.role != 'employee':
        updates['managerId'] = admin_firestore.DELETE_FIELD  # only employees have a manager
    db.collection('users').document(target_uid).update(updates)
    if target.get('role') == 'manager' and data.role != 'manager':
        _unassign_reports(target_uid, user['companyId'])
    invalidate_user(target_uid)
    return {"uid": target_uid, "role": data.role}


@router.patch("/team/{target_uid}/manager")
def assign_manager(target_uid: str, data: ManagerAssign, user: dict = Depends(require_role('pm'))):
    """Owner only: move an employee into a manager's team (or out of any team)."""
    target = get_user_profile(target_uid)
    if target.get('companyId') != user['companyId']:
        raise HTTPException(status_code=404, detail="User not found in your company")
    if target.get('role') != 'employee':
        raise HTTPException(status_code=400, detail="Only employees belong to a manager's team")
    if data.manager_id:
        _require_company_manager(data.manager_id, user['companyId'])
    db.collection('users').document(target_uid).update({
        'managerId': data.manager_id or admin_firestore.DELETE_FIELD, 'updatedAt': _now(),
    })
    invalidate_user(target_uid)
    return {"uid": target_uid, "managerId": data.manager_id}


@router.delete("/team/{target_uid}")
def remove_team_member(target_uid: str, user: dict = Depends(require_role('pm', 'manager'))):
    """
    Owners can remove managers and employees. Managers can remove only people in their own team.
    Owners can never be removed.
    """
    if target_uid == user['uid']:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    target = get_user_profile(target_uid)
    if target.get('companyId') != user['companyId']:
        raise HTTPException(status_code=404, detail="User not found in your company")
    if target.get('role') == 'pm':
        raise HTTPException(status_code=403, detail="Owners cannot be removed")
    if user['role'] == 'manager' and not (target.get('role') == 'employee' and target.get('managerId') == user['uid']):
        raise HTTPException(status_code=403, detail="Managers can only remove people in their own team")

    # Delete the membership fields so the user can join another company later
    db.collection('users').document(target_uid).update({
        "companyId": admin_firestore.DELETE_FIELD,
        "role": admin_firestore.DELETE_FIELD,
        "managerId": admin_firestore.DELETE_FIELD,
    })
    if target.get('role') == 'manager':
        _unassign_reports(target_uid, user['companyId'])
    invalidate_user(target_uid)

    return {"message": "User removed from company successfully"}
