"""The roster, and the user accounts on top of it.

Anyone signed in can read their own restaurant's roster; only that restaurant's
`admin` can add, edit or remove people. The platform `owner` sits above them:
they may open any restaurant's roster, and they are the only one who can hand out
the platform role itself. Account names are unique across the whole platform,
because the sign-in screen has no restaurant picker — the account itself says
which store it opens.
"""

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import get_db
from ..deps import active_branch_id, current_tenant
from ..models import AuthSession, Branch, Staff, Tenant

router = APIRouter(prefix="/api/team", tags=["team"])

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


def serialize_staff(row: Staff, branches: dict[int, Branch] | None = None) -> dict:
    branch = (branches or {}).get(row.branch_id)
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
        # The location this person works in; 0 is store-wide (admin and owner).
        "branch_id": row.branch_id,
        "branch_ar": branch.name_ar if branch else "",
        "branch_en": branch.name_en if branch else "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_team(db: Session, tenant: Tenant, branch_id: int | None = None) -> dict:
    query = db.query(Staff).filter(Staff.tenant_id == tenant.id)
    if branch_id:
        # A location's own people, plus the store-level roles that sit above
        # every branch (branch 0: the restaurant admin and the platform owner).
        query = query.filter(
            or_(Staff.branch_id == branch_id, Staff.branch_id == 0)
        )
    rows = query.order_by(Staff.is_active.desc(), Staff.id).all()
    branches = {
        row.id: row
        for row in db.query(Branch).filter(Branch.tenant_id == tenant.id).all()
    }
    return {
        "staff": [serialize_staff(row, branches) for row in rows],
        "restaurant": serialize_restaurant(tenant),
        "summary": {
            "total": len(rows),
            "active": sum(1 for row in rows if row.is_active),
            "roles": {
                role: sum(1 for row in rows if row.role == role) for role in ROLES
            },
        },
    }


def team_payload(
    db: Session, user: Staff, tenant: Tenant, branch_id: int | None = None
) -> dict:
    """One restaurant's roster, plus the picker only the platform owner needs."""
    payload = serialize_team(db, tenant, branch_id)
    if user.role == "owner":
        payload["restaurants"] = [
            serialize_restaurant(row)
            for row in db.query(Tenant)
            .filter(Tenant.is_deleted.is_(False))
            .order_by(Tenant.id)
        ]
    return payload


def resolve_restaurant(
    db: Session, user: Staff, restaurant_id: int | None
) -> Tenant:
    """The restaurant being managed; everyone but the owner stays in their own."""
    own = current_tenant(db)
    if not restaurant_id or restaurant_id == own.id:
        return own
    if user.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the platform owner can reach another restaurant.",
        )
    tenant = db.get(Tenant, restaurant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return tenant


def resolve_branch(db: Session, tenant: Tenant, branch_id: int) -> Branch | None:
    """A branch of this store; 0 is the store itself and needs no row."""
    if not branch_id:
        return None
    branch = (
        db.query(Branch)
        .filter(Branch.tenant_id == tenant.id, Branch.id == branch_id)
        .first()
    )
    if branch is None:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


def get_staff(db: Session, user: Staff, staff_id: int) -> Staff:
    """A member of the caller's own restaurant; the owner may reach any."""
    own = current_tenant(db)
    row = db.get(Staff, staff_id)
    if row is None or (row.tenant_id != own.id and user.role != "owner"):
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


def active_platform_owners(db: Session, exclude_id: int = 0) -> int:
    """Platform ownership is shared across restaurants, so it is counted globally."""
    query = db.query(func.count(Staff.id)).filter(
        Staff.role == "owner", Staff.is_active.is_(True)
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
    # The location the person works in. Empty means the store's active branch;
    # admin and owner are store-wide (0) whatever is sent.
    branch_id: int | None = None


class StaffPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    role: StaffRole | None = None
    is_active: bool | None = None
    # Setting a password on a member who already has a username resets it.
    password: str | None = Field(default=None, max_length=200)
    # Moving somebody to another location.
    branch_id: int | None = None


def new_credentials(db: Session, username: str, password: str):
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
    branch_id: int | None = None,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = resolve_restaurant(db, user, restaurant_id)
    return team_payload(db, user, tenant, branch_id)


@router.post("", status_code=201)
def create_staff(
    payload: StaffIn,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = resolve_restaurant(db, user, payload.restaurant_id)
    values = payload.model_dump()
    values.pop("restaurant_id")
    branch_id = values.pop("branch_id")
    username = values.pop("username").strip()
    password = values.pop("password")

    # The platform role sits above every restaurant, so only the owner hands it
    # out — and an owner without a sign-in would be locked out of their own app.
    if values["role"] == "owner":
        if user.role != "owner":
            raise HTTPException(
                status_code=403,
                detail="Only the platform owner can hand out that role.",
            )
        if not (username and password):
            raise HTTPException(
                status_code=422,
                detail="An owner account needs a username and a password.",
            )

    if username or password:
        if not (username and password):
            raise HTTPException(
                status_code=422,
                detail="A user account needs both a username and a password.",
            )
        values["username"], values["password_hash"] = new_credentials(
            db, username, password
        )

    # Every operational role works in a location; the store-level ones sit above
    # them and stay store-wide so they appear in each branch's roster.
    if values["role"] in ("admin", "owner"):
        values["branch_id"] = 0
    else:
        resolve_branch(db, tenant, branch_id or 0)
        values["branch_id"] = branch_id or active_branch_id(db, tenant)

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
    # The platform owner's own account is above a restaurant admin's reach.
    if row.role == "owner" and user.role != "owner":
        raise HTTPException(
            status_code=403, detail="Only the platform owner can change that account."
        )
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
        or changes.get("role", row.role) not in ("admin", "owner")
    ):
        raise HTTPException(
            status_code=409, detail="You cannot remove your own access."
        )

    # Handing out the platform role is the owner's call alone.
    if changes.get("role") == "owner" and user.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the platform owner can hand out that role.",
        )

    # A restaurant must always keep one active admin, otherwise nobody there can
    # open the roster or the store profile.
    losing_admin = row.role == "admin" and row.is_active and (
        changes.get("role", row.role) != "admin" or changes.get("is_active") is False
    )
    if losing_admin and active_with_role(db, tenant, "admin", row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active admin."
        )

    # And the platform always keeps one active owner.
    losing_owner = row.role == "owner" and row.is_active and (
        changes.get("role", row.role) != "owner" or changes.get("is_active") is False
    )
    if losing_owner and active_platform_owners(db, row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The platform needs at least one active owner."
        )

    # Which location the member works in follows their role: a manager, cashier
    # or kitchen member belongs to a branch, while the admin sits above them all.
    if changes.get("branch_id"):
        resolve_branch(db, tenant, changes["branch_id"])
    if changes.get("role", row.role) in ("admin", "owner"):
        changes["branch_id"] = 0
    else:
        changes["branch_id"] = (
            changes.get("branch_id") or row.branch_id or active_branch_id(db, tenant)
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
    if row.role == "owner" and user.role != "owner":
        raise HTTPException(
            status_code=403, detail="Only the platform owner can change that account."
        )
    if row.id == user.id:
        raise HTTPException(
            status_code=409, detail="You cannot delete your own account."
        )
    if row.role == "admin" and row.is_active and active_with_role(db, tenant, "admin", row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active admin."
        )
    if row.role == "owner" and row.is_active and active_platform_owners(db, row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The platform needs at least one active owner."
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
