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
from .deps import COST_ROLES, set_request_role, set_request_tenant
from .models import AuthSession, Staff, Tenant

COOKIE_NAME = "sufra_session"
SESSION_DAYS = 7
_ITERATIONS = 240_000

# Reachable without a session: the liveness probe, the two endpoints that create
# or clear one, and the activation link a new restaurant's admin opens before
# they have an account.
PUBLIC_PATHS = (
    "/api/health",
    "/api/auth/login",
    "/api/auth/logout",
    # "Try the demo" is a sign-in that needs no password.
    "/api/auth/demo",
)
PUBLIC_PREFIXES = ("/api/invites/", "/api/public/")

# A demo session reads everything and writes nothing. Signing out is the one
# exception, otherwise the visitor could not leave.
DEMO_WRITE_PATHS = ("/api/auth/logout",)
DEMO_READ_ONLY = "This is the demo store — it is read-only. Open your own store to make changes."

# Who may manage accounts, the store profile and the menu of people's access:
# a restaurant's own admin, and the platform owner above them.
ADMIN_ROLES = ("admin", "owner")


def restaurant_closed(tenant) -> bool:
    """A restaurant the owner blocked, or removed while keeping its history."""
    return tenant is None or tenant.is_blocked or tenant.is_deleted


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
        # The UI says so in the top bar, so nobody hunts for a save button.
        "is_demo": staff.is_demo,
    }


# ----------------------------------------------------------------------- gate


class SessionGate(BaseHTTPMiddleware):
    """401 every `/api` call that does not carry a live session cookie."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if (
            not path.startswith("/api")
            or path in PUBLIC_PATHS
            or path.startswith(PUBLIC_PREFIXES)
            or request.method == "OPTIONS"
        ):
            return await call_next(request)

        token = request.cookies.get(COOKIE_NAME, "")
        db = SessionLocal()
        try:
            staff = session_staff(db, token)
            closed = staff is not None and restaurant_closed(
                db.get(Tenant, staff.tenant_id)
            )
        finally:
            db.close()

        if staff is None:
            return JSONResponse(
                {"detail": "Sign in to continue."}, status_code=401
            )
        if closed:
            return JSONResponse(
                {"detail": "This restaurant's access is suspended."}, status_code=403
            )
        # A demo session walks the whole app but changes nothing: the refusal
        # happens here, before any handler can touch a row.
        if (
            staff.is_demo
            and request.method not in ("GET", "HEAD", "OPTIONS")
            and path not in DEMO_WRITE_PATHS
        ):
            return JSONResponse(
                {"detail": DEMO_READ_ONLY},
                status_code=403,
                # A language-independent flag: the web app explains the refusal
                # in the visitor's own language.
                headers={"X-Demo-Read-Only": "1"},
            )

        # The dependency below re-reads the row on the request's own session.
        request.state.staff_id = staff.id
        request.state.session_token = token
        # Every `/api` handler then reads this member's own restaurant, so two
        # restaurants signing in on the same API never see each other's data.
        set_request_tenant(staff.tenant_id)
        # ...and what that member is allowed to see on the payload (no cost for
        # the till, see `deps.sees_cost`).
        set_request_role(staff.role)
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
    """A restaurant's admin — or the platform owner, who outranks them.

    Staff roles (manager, cashier, kitchen) are operational only: they ring up
    tickets and never touch accounts or the store profile.
    """
    if user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only an admin can manage accounts and the store profile.",
        )
    return user


def guard_cost(user: Staff) -> None:
    """403 unless the member may move money — a price or a unit cost.

    A cashier rings up tickets and a kitchen moves stock; neither sets what a
    plate costs. These are the same roles a payload shows cost and margin to
    (`deps.sees_cost`), so a hidden field is never written blind.
    """
    if user.role not in COST_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only a manager or an admin can change prices and costs.",
        )


def require_cost(user: Staff = Depends(current_user)) -> Staff:
    """`guard_cost` as a dependency, for endpoints that are money end to end."""
    guard_cost(user)
    return user


def require_owner(user: Staff = Depends(current_user)) -> Staff:
    """Restaurants themselves belong to the platform owner alone."""
    if user.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the platform owner can manage restaurants.",
        )
    return user
