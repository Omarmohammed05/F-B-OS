from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_tenant
from ..models import Customer, LoyaltyCard, Order, Tenant
from ..security import ensure_token
from .orders import order_items, serialize_order

router = APIRouter(prefix="/api/customers", tags=["customers"])


def stats_by_customer(db: Session, tenant_id: int) -> dict[int, dict]:
    rows = (
        db.query(
            Order.customer_id,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total), 0.0),
            func.max(Order.placed_at),
        )
        .filter(
            Order.tenant_id == tenant_id,
            Order.customer_id > 0,
            Order.status != "cancelled",
        )
        .group_by(Order.customer_id)
        .all()
    )
    return {
        customer_id: {
            "visits": visits,
            "spend": round(spend, 2),
            "last_visit": last_visit.isoformat() if last_visit else None,
        }
        for customer_id, visits, spend, last_visit in rows
    }


def serialize_customer(row: Customer, stats: dict | None) -> dict:
    stats = stats or {}
    return {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "email": row.email,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "visits": stats.get("visits", 0),
        "spend": stats.get("spend", 0.0),
        "last_visit": stats.get("last_visit"),
    }


def serialize_customers(db: Session, tenant: Tenant) -> dict:
    stats = stats_by_customer(db, tenant.id)
    rows = (
        db.query(Customer)
        .filter_by(tenant_id=tenant.id)
        .order_by(Customer.name)
        .all()
    )
    customers = [serialize_customer(row, stats.get(row.id)) for row in rows]
    return {
        "customers": customers,
        "summary": {
            "total": len(customers),
            "repeat": sum(1 for row in customers if row["visits"] > 1),
            "lifetime_spend": round(sum(row["spend"] for row in customers), 2),
        },
    }


def get_customer(db: Session, tenant: Tenant, customer_id: int) -> Customer:
    row = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.id == customer_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return row


class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=240)


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=240)


@router.get("")
def list_customers(db: Session = Depends(get_db)):
    return serialize_customers(db, current_tenant(db))


@router.post("", status_code=201)
def create_customer(payload: CustomerIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    row = Customer(tenant_id=tenant.id, **payload.model_dump())
    ensure_token(row)
    db.add(row)
    db.commit()
    return serialize_customers(db, tenant)


@router.get("/{customer_id}")
def customer_detail(customer_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    row = get_customer(db, tenant, customer_id)
    stats = stats_by_customer(db, tenant.id).get(row.id)
    orders = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id, Order.customer_id == row.id)
        .order_by(Order.placed_at.desc(), Order.id.desc())
        .limit(50)
        .all()
    )
    grouped = order_items(db, [order.id for order in orders])
    return {
        "customer": serialize_customer(row, stats),
        "orders": [
            serialize_order(order, grouped[order.id]) for order in orders
        ],
    }


@router.patch("/{customer_id}")
def update_customer(
    customer_id: int, patch: CustomerPatch, db: Session = Depends(get_db)
):
    tenant = current_tenant(db)
    row = get_customer(db, tenant, customer_id)
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    return serialize_customers(db, tenant)


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    row = get_customer(db, tenant, customer_id)
    # Orders keep their own name snapshot; only the link is cleared.
    db.query(Order).filter(
        Order.tenant_id == tenant.id, Order.customer_id == row.id
    ).update({Order.customer_id: 0})
    # A loyalty card has no owner once its guest is gone.
    db.query(LoyaltyCard).filter(
        LoyaltyCard.tenant_id == tenant.id, LoyaltyCard.customer_id == row.id
    ).delete()
    db.delete(row)
    db.commit()
    return serialize_customers(db, tenant)
