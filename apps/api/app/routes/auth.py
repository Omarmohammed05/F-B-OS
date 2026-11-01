"""Sign-in, sign-out, the session's own profile and the tour handshake."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..deps import current_tenant
from ..models import Staff

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


def _secure_cookie(request: Request) -> bool:
    """Behind the preview proxy the browser is on https even when uvicorn is not."""
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip() == "https"


@router.post("/login")
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    staff = (
        db.query(Staff)
        .filter(
            Staff.tenant_id == tenant.id,
            func.lower(Staff.username) == payload.username.strip().lower(),
        )
        .first()
    )
    # One message for a wrong name and a wrong password: no account fishing.
    if (
        staff is None
        or not staff.password_hash
        or not auth.check_password(payload.password, staff.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Wrong username or password.")
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="This account is switched off.")

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
