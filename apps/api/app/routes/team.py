"""The roster, and the user accounts on top of it.

Anyone signed in can read their own restaurant's roster; only an `admin` can add,
edit or remove people. An admin also works across restaurants: they choose which
restaurant an account belongs to, and can open a new restaurant that has none
yet. Account names are unique across the whole platform, because the sign-in
screen has no restaurant picker — the account itself says which store it opens.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import get_db
from ..deps import current_tenant
from ..models import AuthSession, Staff, Tenant

router = APIRouter(prefix="/api/team", tags=["team"])
restaurant_router = APIRouter(prefix="/api/restaurants", tags=["restaurants"])

StaffRole = Literal["admin", "owner", "manager", "cashier", "kitchen"]
ROLES = ("admin", "owner", "manager", "cashier", "kitchen")

USERNAME_PATTERN = re.compile(r"^[a-z0-9._-]{3,60}$")
MIN_PASSWORD = 8


def serialize_restaurant(tenant: Tenant) -> dict:
    return {
        "id": tenant.id,
        "name_ar": tenant.name_ar,
        "name_en": tenant.name_en,
    }


def serialize_staff(row: Staff) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "role": row.role,
        "username": row.username,
        "has_login": bool(row.username and row.password_hash),
        "onboarded": row.onboarded_at is not None,
        "is_active": row.is_active,
        "restaurant_id": row.tenant_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_team(db: Session, tenant: Tenant) -> dict:
    rows = (
        db.query(Staff)
        .filter_by(tenant_id=tenant.id)
        .order_by(Staff.is_active.desc(), Staff.id)
        .all()
    )
    return {
        "staff": [serialize_staff(row) for row in rows],
        "restaurant": serialize_restaurant(tenant),
        "summary": {
            "total": len(rows),
            "active": sum(1 for row in rows if row.is_active),
            "roles": {
                role: sum(1 for row in rows if row.role == role) for role in ROLES
            },
        },
    }


def team_payload(db: Session, user: Staff, tenant: Tenant) -> dict:
    """One restaurant's roster, plus the picker only an admin needs."""
    payload = serialize_team(db, tenant)
    if user.role == "admin":
        payload["restaurants"] = [
            serialize_restaurant(row) for row in db.query(Tenant).order_by(Tenant.id)
        ]
    return payload


def resolve_restaurant(
    db: Session, user: Staff, restaurant_id: int | None
) -> Tenant:
    """The restaurant an admin is working on; everyone else stays in their own."""
    own = current_tenant(db)
    if not restaurant_id or restaurant_id == own.id:
        return own
    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only an admin can manage another restaurant.",
        )
    tenant = db.get(Tenant, restaurant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return tenant


def get_staff(db: Session, user: Staff, staff_id: int) -> Staff:
    """A member of the caller's own restaurant, or of any restaurant for an admin."""
    own = current_tenant(db)
    row = db.get(Staff, staff_id)
    if row is None or (row.tenant_id != own.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Team member not found")
    return row


def active_with_role(db: Session, tenant: Tenant, role: str, exclude_id: int = 0) -> int:
    query = db.query(func.count(Staff.id)).filter(
        Staff.tenant_id == tenant.id,
        Staff.role == role,
        Staff.is_active.is_(True),
    )
    if exclude_id:
        query = query.filter(Staff.id != exclude_id)
    return query.scalar() or 0


class StaffIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    role: StaffRole = "cashier"
    is_active: bool = True
    # Both empty for a roster-only name; both set to hand out a sign-in.
    username: str = Field(default="", max_length=60)
    password: str = Field(default="", max_length=200)
    # Which restaurant the account belongs to. Ignored for a non-admin, who can
    # only add to their own store.
    restaurant_id: int | None = None


class StaffPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    role: StaffRole | None = None
    is_active: bool | None = None
    # Setting a password on a member who already has a username resets it.
    password: str | None = Field(default=None, max_length=200)


def _new_credentials(db: Session, username: str, password: str):
    name = username.strip().lower()
    if not USERNAME_PATTERN.match(name):
        raise HTTPException(
            status_code=422,
            detail="A username is 3–60 letters, numbers, dots, dashes or underscores.",
        )
    if len(password) < MIN_PASSWORD:
        raise HTTPException(
            status_code=422,
            detail=f"A password needs at least {MIN_PASSWORD} characters.",
        )
    # Unique across restaurants: sign-in resolves the account by name alone.
    taken = (
        db.query(Staff)
        .filter(Staff.username != "", func.lower(Staff.username) == name)
        .first()
    )
    if taken is not None:
        raise HTTPException(status_code=409, detail="That username is already in use.")
    return name, auth.hash_password(password)


@router.get("")
def list_team(
    restaurant_id: int | None = None,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    return team_payload(db, user, resolve_restaurant(db, user, restaurant_id))


@router.post("", status_code=201)
def create_staff(
    payload: StaffIn,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = resolve_restaurant(db, user, payload.restaurant_id)
    values = payload.model_dump()
    values.pop("restaurant_id")
    username = values.pop("username").strip()
    password = values.pop("password")

    if username or password:
        if not (username and password):
            raise HTTPException(
                status_code=422,
                detail="A user account needs both a username and a password.",
            )
        values["username"], values["password_hash"] = _new_credentials(
            db, username, password
        )

    row = Staff(tenant_id=tenant.id, **values)
    db.add(row)
    db.flush()
    audit.log(
        db,
        tenant.id,
        "staff.create",
        "staff",
        row.id,
        f"{row.name} ({row.role})"
        + (f" with login {row.username}" if row.username else ""),
        actor=user.name,
    )
    db.commit()
    return team_payload(db, user, tenant)


@router.patch("/{staff_id}")
def update_staff(
    staff_id: int,
    patch: StaffPatch,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    row = get_staff(db, user, staff_id)
    # The owner/admin safety net belongs to the store the member works in, which
    # is not necessarily the store the admin signed in to.
    tenant = db.get(Tenant, row.tenant_id)
    changes = patch.model_dump(exclude_unset=True)
    password = changes.pop("password", None)

    if password is not None:
        if not row.username:
            raise HTTPException(
                status_code=422,
                detail="Give this member a username before setting a password.",
            )
        if len(password) < MIN_PASSWORD:
            raise HTTPException(
                status_code=422,
                detail=f"A password needs at least {MIN_PASSWORD} characters.",
            )
        row.password_hash = auth.hash_password(password)

    if row.id == user.id and (
        changes.get("is_active") is False
        or changes.get("role", "admin") != "admin"
    ):
        raise HTTPException(
            status_code=409, detail="You cannot remove your own admin access."
        )

    # A store must always keep one active owner, otherwise nobody can run it.
    losing_owner = row.role == "owner" and row.is_active and (
        changes.get("role", row.role) != "owner" or changes.get("is_active") is False
    )
    if losing_owner and active_with_role(db, tenant, "owner", row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active owner."
        )

    # Same rule for the role that hands out accounts.
    if row.role == "admin" and active_with_role(db, tenant, "admin", row.id) == 0:
        losing_admin = changes.get("role", row.role) != "admin" or (
            changes.get("is_active") is False
        )
        if losing_admin:
            raise HTTPException(
                status_code=409, detail="The store needs at least one active admin."
            )

    for field, value in changes.items():
        setattr(row, field, value)

    access_change = {"role", "is_active"} & changes.keys()
    if access_change or password is not None:
        # Who can open the till is the access question a review asks first.
        detail = ", ".join(f"{field}={changes[field]}" for field in sorted(access_change))
        if password is not None:
            detail = f"{detail}, password=reset" if detail else "password=reset"
        audit.log(
            db,
            tenant.id,
            "staff.access",
            "staff",
            row.id,
            f"{row.name}: {detail}",
            actor=user.name,
        )
    db.commit()
    return team_payload(db, user, tenant)


@router.delete("/{staff_id}")
def delete_staff(
    staff_id: int,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    row = get_staff(db, user, staff_id)
    tenant = db.get(Tenant, row.tenant_id)
    if row.id == user.id:
        raise HTTPException(
            status_code=409, detail="You cannot delete your own account."
        )
    if row.role == "owner" and row.is_active and active_with_role(db, tenant, "owner", row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active owner."
        )
    if row.role == "admin" and row.is_active and active_with_role(db, tenant, "admin", row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active admin."
        )
    audit.log(
        db,
        tenant.id,
        "staff.delete",
        "staff",
        row.id,
        f"{row.name} ({row.role}) removed",
        actor=user.name,
    )
    # Their sessions go with the account.
    db.query(AuthSession).filter(AuthSession.staff_id == row.id).delete()
    db.delete(row)
    db.commit()
    return team_payload(db, user, tenant)


class RestaurantIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)


@restaurant_router.get("")
def list_restaurants(
    user: Staff = Depends(auth.require_admin), db: Session = Depends(get_db)
):
    return {
        "restaurants": [
            serialize_restaurant(row) for row in db.query(Tenant).order_by(Tenant.id)
        ]
    }


@restaurant_router.post("", status_code=201)
def create_restaurant(
    payload: RestaurantIn,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    name_ar = payload.name_ar.strip()
    name_en = payload.name_en.strip()
    if not (name_ar and name_en):
        raise HTTPException(
            status_code=422,
            detail="A restaurant needs a name in both languages.",
        )
    taken = (
        db.query(Tenant)
        .filter(func.lower(Tenant.name_en) == name_en.lower())
        .first()
    )
    if taken is not None:
        raise HTTPException(
            status_code=409, detail="A restaurant with that name already exists."
        )

    # A new restaurant starts empty, but it rings up money the same way the
    # admin's own store does, so the till never charges an unset tax rate.
    home = current_tenant(db)
    row = Tenant(
        name_ar=name_ar,
        name_en=name_en,
        currency=home.currency,
        tax_rate=home.tax_rate,
        default_language=home.default_language,
    )
    db.add(row)
    db.flush()
    audit.log(db, row.id, "restaurant.create", "tenant", row.id, row.name_en, actor=user.name)
    db.commit()
    return {
        "restaurants": [
            serialize_restaurant(other)
            for other in db.query(Tenant).order_by(Tenant.id)
        ],
        "created": serialize_restaurant(row),
    }
