"""The store's locations, and which one the counter is working in.

A branch is a plain row under the tenant: tickets carry its id, so the orders
board, the dashboard, reports and the bell scope themselves to the active branch.
The menu, stock and the guest book stay store-wide on purpose — one kitchen, one
guest per person, however many doors the store has.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import get_db
from ..deps import active_branch, current_tenant
from ..models import Branch, Staff, Tenant

router = APIRouter(prefix="/api/branches", tags=["branches"])


def serialize_branch(branch: Branch) -> dict:
    return {
        "id": branch.id,
        "name_ar": branch.name_ar,
        "name_en": branch.name_en,
        "address": branch.address,
        "phone": branch.phone,
        "is_active": branch.is_active,
    }


def branches_payload(db: Session, tenant: Tenant) -> dict:
    """Every branch of the store plus the one that is currently selected."""
    rows = (
        db.query(Branch)
        .filter(Branch.tenant_id == tenant.id)
        .order_by(Branch.id)
        .all()
    )
    active = active_branch(db, tenant)
    return {
        "branches": [serialize_branch(row) for row in rows],
        "active_id": active.id if active else 0,
    }


class BranchIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)


def find_branch(db: Session, tenant: Tenant, branch_id: int) -> Branch:
    branch = (
        db.query(Branch)
        .filter(Branch.tenant_id == tenant.id, Branch.id == branch_id)
        .first()
    )
    if branch is None:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


@router.get("")
def list_branches(db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    return branches_payload(db, tenant)


@router.post("", status_code=201)
def create_branch(
    payload: BranchIn,
    # Locations are restaurant information: staff add no doors of their own.
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    name_ar = payload.name_ar.strip()
    name_en = payload.name_en.strip()
    if not name_ar or not name_en:
        raise HTTPException(
            status_code=422, detail="A branch needs a name in both languages."
        )

    # Two locations with the same name cannot be told apart in the switcher.
    duplicate = (
        db.query(Branch)
        .filter(
            Branch.tenant_id == tenant.id,
            func.lower(Branch.name_en) == name_en.lower(),
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409, detail="A branch with this name already exists."
        )

    branch = Branch(
        tenant_id=tenant.id,
        name_ar=name_ar,
        name_en=name_en,
        address=payload.address.strip(),
        phone=payload.phone.strip(),
    )
    db.add(branch)
    db.flush()
    audit.log(
        db,
        tenant.id,
        "branch.create",
        "branch",
        branch.id,
        name_en,
        actor=user.name,
    )
    # The store's very first branch is where its existing tickets already are.
    if not tenant.active_branch_id:
        tenant.active_branch_id = branch.id
    db.commit()
    db.refresh(branch)
    return branches_payload(db, tenant)


@router.post("/{branch_id}/activate")
def activate_branch(
    branch_id: int,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    # Resolved under the tenant, so a branch id from another store is a 404.
    branch = find_branch(db, tenant, branch_id)
    tenant.active_branch_id = branch.id
    audit.log(
        db,
        tenant.id,
        "branch.activate",
        "branch",
        branch.id,
        branch.name_en,
        actor=user.name,
    )
    db.commit()
    return branches_payload(db, tenant)
