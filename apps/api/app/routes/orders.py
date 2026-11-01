from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import get_db
from ..deps import active_branch_id, current_tenant
from ..loyalty import award_stamp
from ..models import Customer, Order, OrderItem, Product, Staff, Tenant
from ..security import client_host, ensure_token
from ..stock import deduct_for_order

router = APIRouter(prefix="/api/orders", tags=["orders"])

OrderStatus = Literal["new", "preparing", "served", "cancelled"]
Channel = Literal["dine_in", "takeaway", "delivery"]
Payment = Literal["cash", "card", "wallet"]

# Only these moves are accepted; a served or cancelled ticket is final.
NEXT_STATUS: dict[str, set[str]] = {
    "new": {"preparing", "cancelled"},
    "preparing": {"served", "cancelled"},
    "served": set(),
    "cancelled": set(),
}


def order_items(db: Session, order_ids: list[int]) -> dict[int, list[OrderItem]]:
    grouped: dict[int, list[OrderItem]] = defaultdict(list)
    if not order_ids:
        return grouped
    rows = (
        db.query(OrderItem)
        .filter(OrderItem.order_id.in_(order_ids))
        .order_by(OrderItem.id)
        .all()
    )
    for row in rows:
        grouped[row.order_id].append(row)
    return grouped


def serialize_order(order: Order, items: list[OrderItem]) -> dict:
    return {
        "id": order.id,
        "number": order.number,
        "channel": order.channel,
        "table_no": order.table_no,
        "customer_id": order.customer_id,
        "customer_name": order.customer_name,
        "delivery_address": order.delivery_address,
        "status": order.status,
        "payment_method": order.payment_method,
        "subtotal": order.subtotal,
        "tax": order.tax,
        "total": order.total,
        "note": order.note,
        # Empty on a live ticket; a void keeps who approved it and why.
        "void_reason": order.void_reason,
        "voided_by": order.voided_by,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "item_count": sum(item.qty for item in items),
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "name_ar": item.name_ar,
                "name_en": item.name_en,
                "emoji": item.emoji,
                "unit_price": item.unit_price,
                "qty": item.qty,
                "line_total": round(item.unit_price * item.qty, 2),
            }
            for item in items
        ],
    }


def get_order(db: Session, tenant: Tenant, order_id: int) -> Order:
    order = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id, Order.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def serialize_one(db: Session, order: Order) -> dict:
    return serialize_order(order, order_items(db, [order.id]).get(order.id, []))


def resolve_customer(
    db: Session, tenant: Tenant, customer_id: int, name: str
) -> Customer | None:
    """A named guest becomes a customer profile, so tickets build the CRM."""
    if customer_id:
        customer = (
            db.query(Customer)
            .filter(Customer.tenant_id == tenant.id, Customer.id == customer_id)
            .first()
        )
        if customer is None:
            raise HTTPException(
                status_code=400, detail="This customer no longer exists."
            )
        return customer

    cleaned = name.strip()
    if not cleaned:
        return None
    customer = (
        db.query(Customer)
        .filter(
            Customer.tenant_id == tenant.id,
            func.lower(Customer.name) == cleaned.lower(),
        )
        .first()
    )
    if customer is None:
        customer = Customer(tenant_id=tenant.id, name=cleaned)
        ensure_token(customer)
        db.add(customer)
        db.flush()
    return customer


# ----------------------------------------------------------------- payloads


class OrderItemIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0, le=99)


class OrderIn(BaseModel):
    channel: Channel = "dine_in"
    table_no: int | None = Field(default=None, ge=1, le=999)
    customer_id: int = Field(default=0, ge=0)
    customer_name: str = Field(default="", max_length=120)
    # Only kept on delivery tickets; every other channel stores an empty string.
    delivery_address: str = Field(default="", max_length=200)
    payment_method: Payment | None = None
    note: str = Field(default="", max_length=240)
    items: list[OrderItemIn] = Field(min_length=1)


class OrderPatch(BaseModel):
    status: OrderStatus
    # Only read on a void, where the reason is kept with the approver's name.
    reason: str = Field(default="", max_length=200)


# ----------------------------------------------------------------- endpoints


@router.get("")
def list_orders(db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    orders = (
        db.query(Order)
        .filter_by(tenant_id=tenant.id, branch_id=active_branch_id(db, tenant))
        .order_by(Order.placed_at.desc(), Order.id.desc())
        .limit(200)
        .all()
    )
    grouped = order_items(db, [order.id for order in orders])
    return {"orders": [serialize_order(order, grouped[order.id]) for order in orders]}


def existing_for_key(db: Session, tenant: Tenant, key: str) -> Order | None:
    """The ticket a retried send already created, so a repeat never doubles it."""
    if not key:
        return None
    order = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id, Order.idempotency_key == key)
        .first()
    )
    if order is not None:
        return order
    return None


def quantities_of(lines: list[OrderItemIn]) -> dict[int, int]:
    """One running quantity per product, so two lines of the same plate merge."""
    quantities: dict[int, int] = defaultdict(int)
    for line in lines:
        quantities[line.product_id] += line.qty
    return quantities


def place_order(
    db: Session,
    tenant: Tenant,
    *,
    branch_id: int,
    channel: str,
    table_no: int | None,
    quantities: dict[int, int],
    customer_id: int = 0,
    customer_name: str = "",
    delivery_address: str = "",
    payment_method: str | None = None,
    note: str = "",
    idempotency_key: str = "",
) -> tuple[Order, list[OrderItem]]:
    """Write one ticket, priced from the menu and the store's tax rate.

    The counter and the guest's QR menu both land here, so a ticket is built in
    exactly one place: whatever a channel adds, it never invents its own prices
    and never skips the availability check.
    """
    if channel == "dine_in" and table_no is None:
        raise HTTPException(status_code=400, detail="Choose a table for dine-in orders.")

    products = {
        product.id: product
        for product in db.query(Product)
        .filter(Product.tenant_id == tenant.id, Product.id.in_(quantities.keys()))
        .all()
    }
    missing = [pid for pid in quantities if pid not in products]
    if missing:
        raise HTTPException(
            status_code=400, detail="Some products are no longer on the menu."
        )
    unavailable = [product.name_en for product in products.values() if not product.is_available]
    if unavailable:
        raise HTTPException(
            status_code=409,
            detail=f"Not available right now: {', '.join(unavailable)}.",
        )

    customer = resolve_customer(db, tenant, customer_id, customer_name)

    highest = db.query(func.max(Order.id)).filter_by(tenant_id=tenant.id).scalar()
    order = Order(
        tenant_id=tenant.id,
        number=str(1001 + (highest or 0)),
        # Rung up in the branch the ticket belongs to.
        branch_id=branch_id,
        customer_id=customer.id if customer else 0,
        channel=channel,
        table_no=table_no if channel == "dine_in" else None,
        customer_name=customer.name if customer else "",
        delivery_address=delivery_address.strip() if channel == "delivery" else "",
        status="new",
        payment_method=payment_method,
        note=note.strip(),
        idempotency_key=idempotency_key,
    )

    subtotal = 0.0
    items: list[OrderItem] = []
    for product_id, qty in quantities.items():
        product = products[product_id]
        subtotal += product.price * qty
        items.append(
            OrderItem(
                tenant_id=tenant.id,
                product_id=product.id,
                name_ar=product.name_ar,
                name_en=product.name_en,
                emoji=product.emoji,
                unit_price=product.price,
                qty=qty,
            )
        )

    order.subtotal = round(subtotal, 2)
    order.tax = round(subtotal * tenant.tax_rate / 100, 2)
    order.total = round(order.subtotal + order.tax, 2)

    db.add(order)
    try:
        db.flush()
        for item in items:
            item.order_id = order.id
            db.add(item)
        db.commit()
    except IntegrityError:
        # Two identical sends raced: the unique key kept one, so return that one.
        db.rollback()
        winner = existing_for_key(db, tenant, idempotency_key)
        if winner is None:
            raise
        return winner, order_items(db, [winner.id]).get(winner.id, [])
    db.refresh(order)

    return order, items


@router.post("", status_code=201)
def create_order(
    payload: OrderIn, request: Request, db: Session = Depends(get_db)
):
    tenant = current_tenant(db)

    # A tablet that loses its reply and retries presents the same key: answer
    # with the ticket it already has instead of charging the guest twice.
    idem_key = (request.headers.get("idempotency-key") or "").strip()
    if len(idem_key) > 64:
        raise HTTPException(status_code=400, detail="Idempotency-Key is too long.")
    repeated = existing_for_key(db, tenant, idem_key)
    if repeated is not None:
        return serialize_one(db, repeated)

    order, items = place_order(
        db,
        tenant,
        branch_id=active_branch_id(db, tenant),
        channel=payload.channel,
        table_no=payload.table_no,
        quantities=quantities_of(payload.items),
        customer_id=payload.customer_id,
        customer_name=payload.customer_name,
        delivery_address=payload.delivery_address,
        payment_method=payload.payment_method,
        note=payload.note,
        idempotency_key=idem_key,
    )
    return serialize_order(order, items)


@router.patch("/{order_id}")
def update_order(
    order_id: int,
    patch: OrderPatch,
    request: Request,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    order = get_order(db, tenant, order_id)

    if patch.status not in NEXT_STATUS.get(order.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"An order that is {order.status} cannot move to {patch.status}.",
        )

    # A void takes money off the day's sales, so it is signed. The token comes
    # from `POST /api/auth/pin` — a manager's PIN, checked against the roster —
    # and is spent here, so one approval voids exactly one ticket. The till's own
    # session is whoever is standing at it, which is why the role is not enough.
    approver = None
    if patch.status == "cancelled":
        approver = auth.take_grant(
            db, tenant.id, request.headers.get("x-approval", "")
        )
        if approver is None:
            raise HTTPException(
                status_code=403,
                detail="A manager's PIN is needed to void a ticket.",
            )
        order.void_reason = patch.reason.strip()
        order.voided_by = approver.name

    previous = order.status
    order.status = patch.status
    # A void or a serve is exactly what a fraud review asks about later.
    detail = f"#{order.number} {previous} → {patch.status}, total {order.total:.2f}"
    if approver is not None:
        detail += f", approved by {approver.name}"
        if order.void_reason:
            detail += f" ({order.void_reason})"
    audit.log(
        db,
        tenant.id,
        f"order.{patch.status}",
        "order",
        order.id,
        detail,
        actor=user.name or client_host(request),
    )
    if order.status == "served":
        # A served ticket is the visit a loyalty card counts, and the sale that
        # consumes the recipe ingredients on the guest's plate.
        award_stamp(db, tenant, order.customer_id)
        deduct_for_order(
            db, tenant, order, order_items(db, [order.id]).get(order.id, [])
        )
    db.commit()
    db.refresh(order)
    return serialize_one(db, order)
