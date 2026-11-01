"""Activation links: how a new restaurant's first admin takes over its store.

The platform owner opens a restaurant and sends the link to whoever runs it.
The holder opens it, sets their own name, username and password, and that
account is the restaurant's admin — so nobody has to invent a password for
somebody else and hand it over.

These two endpoints are public on purpose (the holder has no account yet, and
`auth.PUBLIC_PREFIXES` lets them through the gate). Everything they can reach
afterwards is scoped to the restaurant the new account belongs to.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from .. import audit, auth
from ..db import get_db
from ..models import RestaurantInvite, Staff, Tenant
from .auth import _secure_cookie
from .team import new_credentials

router = APIRouter(prefix="/api/invites", tags=["invites"])

ROLE_ADMIN = "admin"


class InviteAccept(BaseModel):
    name: str = Field(default="", max_length=120)
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=1, max_length=200)


def load_invite(db: Session, token: str) -> tuple[RestaurantInvite, Tenant]:
    row = (
        db.query(RestaurantInvite)
        .filter(RestaurantInvite.token == token.strip())
        .first()
    )
    tenant = db.get(Tenant, row.tenant_id) if row is not None else None
    # An erased restaurant takes its link with it; a wrong token says nothing.
    if row is None or tenant is None or tenant.is_deleted:
        raise HTTPException(
            status_code=404, detail="This activation link is not valid."
        )
    return row, tenant


@router.get("/{token}")
def invite_info(token: str, db: Session = Depends(get_db)):
    """What the activation page shows before the account exists."""
    row, tenant = load_invite(db, token)
    return {
        "restaurant_ar": tenant.name_ar,
        "restaurant_en": tenant.name_en,
        "is_used": row.used_at is not None,
        "is_blocked": tenant.is_blocked,
    }


@router.post("/{token}")
def accept_invite(
    token: str,
    payload: InviteAccept,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create the restaurant's admin from the link and sign them in.

    The link is one use only: it is closed in the same transaction that creates
    the account, so a forwarded link cannot open a second admin.
    """
    row, tenant = load_invite(db, token)
    if row.used_at is not None:
        raise HTTPException(
            status_code=409, detail="This activation link has already been used."
        )
    if tenant.is_blocked:
        raise HTTPException(
            status_code=403, detail="This restaurant's access is suspended."
        )

    # Same rules as any other account: a 3–60 character name nobody else has,
    # and a password the store's admin could not type for them.
    username, password_hash = new_credentials(db, payload.username, payload.password)
    staff = Staff(
        tenant_id=tenant.id,
        name=payload.name.strip() or username,
        role=ROLE_ADMIN,
        is_active=True,
        username=username,
        password_hash=password_hash,
    )
    db.add(staff)
    db.flush()
    row.used_at = datetime.now()
    audit.log(
        db,
        tenant.id,
        "restaurant.activate",
        "staff",
        staff.id,
        f"admin {username} activated the restaurant",
        actor=username,
    )
    db.commit()

    # The holder is signed in straight away: the activation is the account.
    response = JSONResponse(auth.user_payload(staff))
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.open_session(db, staff),
        max_age=auth.SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=_secure_cookie(request),
        path="/",
    )
    return response
