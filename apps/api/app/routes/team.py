from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_tenant
from ..models import Staff, Tenant

router = APIRouter(prefix="/api/team", tags=["team"])

StaffRole = Literal["owner", "manager", "cashier", "kitchen"]


def serialize_staff(row: Staff) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "role": row.role,
        "is_active": row.is_active,
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
        "summary": {
            "total": len(rows),
            "active": sum(1 for row in rows if row.is_active),
            "roles": {
                role: sum(1 for row in rows if row.role == role)
                for role in ("owner", "manager", "cashier", "kitchen")
            },
        },
    }


def get_staff(db: Session, tenant: Tenant, staff_id: int) -> Staff:
    row = (
        db.query(Staff)
        .filter(Staff.tenant_id == tenant.id, Staff.id == staff_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    return row


def active_owners(db: Session, tenant: Tenant, exclude_id: int = 0) -> int:
    query = db.query(func.count(Staff.id)).filter(
        Staff.tenant_id == tenant.id,
        Staff.role == "owner",
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


class StaffPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    role: StaffRole | None = None
    is_active: bool | None = None


@router.get("")
def list_team(db: Session = Depends(get_db)):
    return serialize_team(db, current_tenant(db))


@router.post("", status_code=201)
def create_staff(payload: StaffIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    db.add(Staff(tenant_id=tenant.id, **payload.model_dump()))
    db.commit()
    return serialize_team(db, tenant)


@router.patch("/{staff_id}")
def update_staff(staff_id: int, patch: StaffPatch, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    row = get_staff(db, tenant, staff_id)
    changes = patch.model_dump(exclude_unset=True)

    # A store must always keep one active owner, otherwise nobody can run it.
    losing_owner = row.role == "owner" and row.is_active and (
        changes.get("role", row.role) != "owner" or changes.get("is_active") is False
    )
    if losing_owner and active_owners(db, tenant, exclude_id=row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active owner."
        )

    for field, value in changes.items():
        setattr(row, field, value)
    db.commit()
    return serialize_team(db, tenant)


@router.delete("/{staff_id}")
def delete_staff(staff_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    row = get_staff(db, tenant, staff_id)
    if row.role == "owner" and row.is_active and active_owners(db, tenant, row.id) == 0:
        raise HTTPException(
            status_code=409, detail="The store needs at least one active owner."
        )
    db.delete(row)
    db.commit()
    return serialize_team(db, tenant)
