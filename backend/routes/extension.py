"""The Chrome extension's own credentials.

Instead of borrowing a short-lived Firebase ID token from an open web-app tab, a signed-in owner or manager
connects the extension once from the web app. That creates a long-lived, revocable token that can do only
a few things: identify its owner, transcribe call audio, upload a meeting transcript, and be revoked.
Only a SHA-256 hash is stored.
"""
from datetime import datetime, timezone
import hashlib
import secrets

from cachetools import TTLCache
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth_middleware import get_user_profile, require_role
from firebase_config import db
from routes.meetings import TranscriptUpload, start_meeting
import transcription

router = APIRouter(prefix="/extension", tags=["extension"])
limiter = Limiter(key_func=get_remote_address)

TOKEN_PREFIX = "mos_ext_"
STAFF = ('pm', 'manager')
MAX_AUDIO_BYTES = 15 * 1024 * 1024        # a 90 s chunk of compressed audio is well under 1 MB
_team_names = TTLCache(maxsize=256, ttl=600)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc)


def _revoke_all(uid: str) -> int:
    docs = list(db.collection('extensionTokens').where('uid', '==', uid).stream())
    for d in docs:
        db.collection('extensionTokens').document(d.id).delete()
    return len(docs)


def get_extension_user(authorization: str | None = Header(None)) -> dict:
    """Resolve `Authorization: Bearer mos_ext_...` to a *current* profile (role/company re-checked every call)."""
    token = (authorization or '').removeprefix('Bearer ').strip()
    if not token.startswith(TOKEN_PREFIX):
        raise HTTPException(status_code=401, detail="Extension is not connected")
    ref = db.collection('extensionTokens').document(_hash(token))
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=401, detail="Extension token was revoked. Connect the extension again.")
    record = doc.to_dict()
    try:
        profile = get_user_profile(record['uid'])
    except HTTPException:
        raise HTTPException(status_code=401, detail="Account no longer exists. Connect the extension again.")
    if profile.get('companyId') != record.get('companyId') or profile.get('role') not in STAFF:
        ref.delete()  # left the company or lost upload rights: the token dies with that
        raise HTTPException(status_code=401, detail="You no longer have access to upload meetings. Connect again.")
    ref.update({'lastUsedAt': _now()})
    return profile


@router.post("/token")
@limiter.limit("10/minute")
def connect_extension(request: Request, user: dict = Depends(require_role(*STAFF))):
    """Create the extension's token (replacing any previous one). The raw token is returned only here."""
    _revoke_all(user['uid'])
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    db.collection('extensionTokens').document(_hash(token)).set({
        'uid': user['uid'], 'companyId': user['companyId'], 'createdAt': _now(), 'lastUsedAt': None,
    })
    company = db.collection('companies').document(user['companyId']).get().to_dict() or {}
    return {'token': token, 'name': user.get('name', ''), 'role': user['role'], 'companyName': company.get('name', '')}


@router.get("/status")
def extension_status(user: dict = Depends(require_role(*STAFF))):
    """For the web app: is an extension connected for this account?"""
    docs = [d.to_dict() for d in db.collection('extensionTokens').where('uid', '==', user['uid']).stream()]
    if not docs:
        return {'connected': False}
    last = docs[0].get('lastUsedAt')
    return {'connected': True, 'connectedAt': docs[0]['createdAt'].isoformat(),
            'lastUsedAt': last.isoformat() if hasattr(last, 'isoformat') else None}


@router.delete("/token")
def disconnect_extension(user: dict = Depends(require_role(*STAFF))):
    return {'revoked': _revoke_all(user['uid'])}


@router.get("/me")
def whoami(user: dict = Depends(get_extension_user)):
    company = db.collection('companies').document(user['companyId']).get().to_dict() or {}
    return {'name': user.get('name', ''), 'role': user['role'], 'companyName': company.get('name', '')}


@router.delete("/me")
def disconnect_from_extension(user: dict = Depends(get_extension_user)):
    """The extension's own "Disconnect" button."""
    return {'revoked': _revoke_all(user['uid'])}


@router.post("/meetings")
@limiter.limit("30/hour")
def upload_from_extension(request: Request, data: TranscriptUpload, background_tasks: BackgroundTasks,
                          user: dict = Depends(get_extension_user)):
    return start_meeting(data, background_tasks, user, source='extension')


def _company_context(company_id: str) -> tuple[str, list[str]]:
    """Company name and member names, used as Whisper's spelling hints (cached for 10 minutes)."""
    if company_id not in _team_names:
        company = db.collection('companies').document(company_id).get().to_dict() or {}
        names = [d.to_dict().get('name', '') for d in db.collection('users').where('companyId', '==', company_id).stream()]
        _team_names[company_id] = (company.get('name', ''), sorted({n.strip() for n in names if n and n.strip()})[:40])
    return _team_names[company_id]


@router.post("/transcribe")
@limiter.limit("120/hour")
async def transcribe_chunk(request: Request, audio: UploadFile = File(...), title: str = Form(''),
                           user: dict = Depends(get_extension_user)):
    """Transcribe one chunk of call audio with Whisper. The audio is not stored."""
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio chunk is too large")
    company, names = _company_context(user['companyId'])
    prompt = transcription.build_prompt(company, names, title.strip()[:120])
    try:
        segments = await run_in_threadpool(transcription.transcribe, data, audio.filename or 'chunk.webm', audio.content_type or 'audio/webm', prompt)
    except transcription.TranscriptionUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {'segments': transcription.correct_names(segments, names)}
