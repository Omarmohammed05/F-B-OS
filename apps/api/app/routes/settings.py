from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_tenant
from ..models import DailyMetric, Order, Tenant

router = APIRouter(prefix="/api/settings", tags=["settings"])

OPEN_STATUSES = ("new", "preparing")


def open_dine_in_tables(db: Session, tenant: Tenant) -> int:
    """Tables currently holding a dine-in ticket, so they cannot be cut away."""
    return (
        db.query(func.count(func.distinct(Order.table_no)))
        .filter(
            Order.tenant_id == tenant.id,
            Order.channel == "dine_in",
            Order.status.in_(OPEN_STATUSES),
        )
        .scalar()
        or 0
    )


def serialize_settings(db: Session, tenant: Tenant) -> dict:
    metrics = db.query(DailyMetric).filter_by(tenant_id=tenant.id).first()
    return {
        "store": {
            "name_ar": tenant.name_ar,
            "name_en": tenant.name_en,
            "accent_color": tenant.accent_color,
            "currency": tenant.currency,
            "tax_rate": tenant.tax_rate,
            "plan": tenant.plan,
        },
        "service": {
            "table_count": metrics.total_tables if metrics else 0,
            "open_tables": open_dine_in_tables(db, tenant),
        },
    }


class SettingsIn(BaseModel):
    name_ar: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    table_count: int | None = Field(default=None, ge=0, le=200)


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    return serialize_settings(db, current_tenant(db))


@router.patch("")
def update_settings(patch: SettingsIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    changes = patch.model_dump(exclude_unset=True, exclude_none=True)

    # The dashboard derives available tables from this count, so shrinking it
    # below what open tickets hold would report a negative floor.
    if "table_count" in changes:
        busy = open_dine_in_tables(db, tenant)
        if changes["table_count"] < busy:
            raise HTTPException(
                status_code=409,
                detail=f"{busy} tables still hold open tickets.",
            )

    for field in ("name_ar", "name_en", "accent_color", "currency", "tax_rate"):
        if field in changes:
            setattr(tenant, field, changes[field])

    if "table_count" in changes:
        metrics = db.query(DailyMetric).filter_by(tenant_id=tenant.id).first()
        if metrics is None:
            db.add(
                DailyMetric(tenant_id=tenant.id, total_tables=changes["table_count"])
            )
        else:
            metrics.total_tables = changes["table_count"]

    db.commit()
    return serialize_settings(db, tenant)
