from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from firebase_config import db
from cachetools import TTLCache
import logging

security = HTTPBearer()

VALID_ROLES = ('pm', 'manager', 'employee')

# Cache uid -> profile for 5 minutes to avoid hitting Firestore on every request.
# Call invalidate_user() whenever the backend changes a user's role or company.
profile_cache = TTLCache(maxsize=1000, ttl=300)


def invalidate_user(uid: str):
    profile_cache.pop(uid, None)


def get_current_user_uid(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Verifies the Firebase Auth ID Token and returns the user's UID.
    Use this dependency for endpoints that require authentication but not necessarily a company.
    """
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token['uid']
    except Exception as e:
        logging.error(f"Auth token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")


def get_user_profile(uid: str) -> dict:
    """Fetch a user profile from Firestore by UID (uncached)."""
    doc = db.collection('users').document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=403, detail="User profile not found")
    return {'uid': uid, **doc.to_dict()}


def get_current_profile(uid: str = Depends(get_current_user_uid)) -> dict:
    """Returns the caller's profile, whether or not they belong to a company."""
    if uid in profile_cache:
        return profile_cache[uid]
    try:
        profile = get_user_profile(uid)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to fetch user profile for uid {uid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while verifying authorization")
    profile_cache[uid] = profile
    return profile


def get_current_user(profile: dict = Depends(get_current_profile)) -> dict:
    """
    Returns {uid, companyId, role, name, ...} for a user who belongs to a company.
    Use this dependency for endpoints that require company membership.
    """
    if not profile.get('companyId'):
        raise HTTPException(status_code=403, detail="User does not belong to any company")
    if profile.get('role') not in VALID_ROLES:
        raise HTTPException(status_code=403, detail="User has no valid role")
    return profile


def get_current_company_id(user: dict = Depends(get_current_user)) -> str:
    return user['companyId']


def require_role(*roles: str):
    """Dependency factory: 403 unless the caller's role is one of `roles`."""
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user.get('role') not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to access this resource")
        return user
    return dependency
