"""Sign-in, sign-out, the session's own profile and the tour handshake."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..models import Staff, Tenant

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


def _secure_cookie(request: Request) -> bool:
    """Behind the preview proxy the browser is on https even when uvicorn is not."""
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip() == "https"


def _open_session(
    response: Response, request: Request, db: Session, staff: Staff
) -> dict:
    """Mint the session and hand the browser the cookie that carries it."""
    token = auth.open_session(db, staff)
    response.set_cookie(
        auth.COOKIE_NAME,
        token,
        max_age=auth.SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=_secure_cookie(request),
        path="/",
    )
    return auth.user_payload(staff)


def _demo_member(db: Session) -> Staff | None:
    """The read-only visitor the seed creates, when this database has one."""
    return (
        db.query(Staff)
        .filter(Staff.is_demo.is_(True), Staff.is_active.is_(True))
        .order_by(Staff.id)
        .first()
    )


@router.post("/login")
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # The account name alone says which restaurant it opens — that is why names
    # are unique across the platform (see routes/team._new_credentials).
    candidates = (
        db.query(Staff)
        .filter(
            Staff.username != "",
            func.lower(Staff.username) == payload.username.strip().lower(),
        )
        .all()
    )
    matches = [
        row
        for row in candidates
        if row.password_hash
        and auth.check_password(payload.password, row.password_hash)
    ]
    # One message for a wrong name and a wrong password: no account fishing.
    if not matches:
        raise HTTPException(status_code=401, detail="Wrong username or password.")
    if len(matches) > 1:
        raise HTTPException(
            status_code=409,
            detail="This username belongs to more than one restaurant.",
        )
    staff = matches[0]
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="This account is switched off.")
    # A restaurant the owner blocked or archived keeps its rows but nobody in
    # it can sign in, whatever their own account says.
    if auth.restaurant_closed(db.get(Tenant, staff.tenant_id)):
        raise HTTPException(
            status_code=403, detail="This restaurant's access is suspended."
        )

    return _open_session(response, request, db, staff)


@router.get("/demo")
def demo_available(db: Session = Depends(get_db)):
    """Whether this deployment has a sample store to show. No session needed."""
    return {"available": _demo_member(db) is not None}


@router.post("/demo")
def start_demo(
    request: Request, response: Response, db: Session = Depends(get_db)
):
    """Sign a visitor into the demo store, read-only (see `auth.SessionGate`)."""
    staff = _demo_member(db)
    if staff is None or auth.restaurant_closed(db.get(Tenant, staff.tenant_id)):
        raise HTTPException(
            status_code=404, detail="The demo store is not available here."
        )
    return _open_session(response, request, db, staff)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    auth.close_session(db, request.cookies.get(auth.COOKIE_NAME, ""))
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: Staff = Depends(auth.current_user)):
    return auth.user_payload(user)


@router.post("/onboarding")
def finish_onboarding(
    user: Staff = Depends(auth.current_user), db: Session = Depends(get_db)
):
    """Stamp the tour as seen, so it opens once instead of on every sign-in."""
    if user.onboarded_at is None:
        user.onboarded_at = datetime.now()
        db.commit()
    return auth.user_payload(user)
