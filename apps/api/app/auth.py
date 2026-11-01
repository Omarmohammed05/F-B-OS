"""Staff sign-in: password hashing, sessions and the gate in front of ``/api``.

Passwords are PBKDF2-SHA256 from the standard library — no extra dependency and
no reversible storage. A session is a random token in an HttpOnly cookie; only
its SHA-256 fingerprint is stored, so a copy of the database cannot be replayed
as a sign-in. The middleware here is the single place that decides whether a
request reaches the API at all, so a new endpoint is protected by default.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .db import SessionLocal, get_db
from .models import AuthSession, Staff

COOKIE_NAME = "sufra_session"
SESSION_DAYS = 7
_ITERATIONS = 240_000

# Reachable without a session: the liveness probe and the two endpoints that
# create or clear one.
PUBLIC_PATHS = ("/api/health", "/api/auth/login", "/api/auth/logout")


# ------------------------------------------------------------------ passwords


def hash_password(password: str) -> str:
    """`pbkdf2_sha256$iterations$salt$digest`, the only format we accept back."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), _ITERATIONS
    )
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate.hex(), digest)


# ------------------------------------------------------------------- sessions


def _fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def open_session(db: Session, staff: Staff) -> str:
    """Mint a session for a signed-in member and return the cookie token."""
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            tenant_id=staff.tenant_id,
            staff_id=staff.id,
            token_hash=_fingerprint(token),
            expires_at=datetime.now() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()
    return token


def session_staff(db: Session, token: str) -> Staff | None:
    """The member behind a cookie token, or None when it is stale/inactive."""
    if not token:
        return None
    row = (
        db.query(AuthSession)
        .filter(AuthSession.token_hash == _fingerprint(token))
        .first()
    )
    if row is None:
        return None
    if row.expires_at is not None and row.expires_at < datetime.now():
        db.delete(row)
        db.commit()
        return None
    staff = db.get(Staff, row.staff_id)
    if staff is None or not staff.is_active:
        return None
    return staff


def close_session(db: Session, token: str) -> None:
    if not token:
        return
    db.query(AuthSession).filter(
        AuthSession.token_hash == _fingerprint(token)
    ).delete()
    db.commit()


def user_payload(staff: Staff) -> dict:
    """What the browser knows about the session: never the password hash."""
    return {
        "id": staff.id,
        "name": staff.name,
        "username": staff.username,
        "phone": staff.phone,
        "role": staff.role,
        "is_active": staff.is_active,
        # The tour opens on the first sign-in and can be reopened from the menu.
        "needs_onboarding": staff.onboarded_at is None,
    }


# ----------------------------------------------------------------------- gate


class SessionGate(BaseHTTPMiddleware):
    """401 every `/api` call that does not carry a live session cookie."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            not path.startswith("/api")
            or path in PUBLIC_PATHS
            or request.method == "OPTIONS"
        ):
            return await call_next(request)

        token = request.cookies.get(COOKIE_NAME, "")
        db = SessionLocal()
        try:
            staff = session_staff(db, token)
        finally:
            db.close()

        if staff is None:
            return JSONResponse(
                {"detail": "Sign in to continue."}, status_code=401
            )

        # The dependency below re-reads the row on the request's own session.
        request.state.staff_id = staff.id
        request.state.session_token = token
        return await call_next(request)


# ---------------------------------------------------------------- dependencies


def current_user(request: Request, db: Session = Depends(get_db)) -> Staff:
    """The signed-in member. The middleware has already validated the cookie."""
    staff_id = getattr(request.state, "staff_id", 0)
    staff = db.get(Staff, staff_id) if staff_id else None
    if staff is None or not staff.is_active:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return staff


def require_admin(user: Staff = Depends(current_user)) -> Staff:
    """Accounts are created by admins only — that role exists for this."""
    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only an admin can manage user accounts.",
        )
    return user
