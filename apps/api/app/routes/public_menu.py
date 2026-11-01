"""The guest side of the menu: what a QR code on the table opens.

A guest scans the stand, reads the branch's menu and sends the order to the
kitchen. The ticket lands in the same board the counter uses, so the restaurant
keeps one queue for every channel.

Nothing here needs a sign-in — the branch token in the link is the only
credential, and it only ever reaches one branch's menu. Two things are therefore
deliberate: the payload carries no cost, margin or guest data, and the ordering
endpoint has its own rate budget (see `security.RULES`).
"""

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import table_count
from ..models import Branch, MenuCategory, Order, OrderItem, Product, Tenant
from .orders import OrderItemIn, place_order

router = APIRouter(prefix="/api/public", tags=["public"])

# What the ticket says about where it came from, next to the guest's own note.
SOURCE = "QR menu"

# The kitchen's clock, as a guest reads it: a short ticket beats a plate count, a
# long one is pushed out, and nothing promises more than half an hour. The figure
# is derived from the ticket, never stored — the counter still decides when the
# food is actually ready.
PREP_BASE_MINUTES = 6
PREP_MINUTES_PER_PLATE = 2
PREP_MAX_MINUTES = 30


def estimate_minutes(plate_count: int) -> int:
    """How long this ticket should take, from the plates it carries."""
    return min(
        PREP_MAX_MINUTES,
        PREP_BASE_MINUTES + PREP_MINUTES_PER_PLATE * max(1, plate_count),
    )


def minutes_left(order: Order, plate_count: int) -> int:
    """Minutes still on the clock; 0 once the ticket is served or cancelled.

    `orders.placed_at` is a naive column filled by the database's own `now()`,
    which runs in UTC here, so the elapsed time is measured the same way.
    """
    if order.status in ("served", "cancelled"):
        return 0
    estimate = estimate_minutes(plate_count)
    if order.placed_at is None:
        return estimate
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    elapsed = (now - order.placed_at).total_seconds() / 60
    return max(0, round(estimate - elapsed))


class PublicOrderIn(BaseModel):
    table_no: int | None = Field(default=None, ge=1, le=999)
    guest_name: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=180)
    items: list[OrderItemIn] = Field(min_length=1)


def open_branch(db: Session, token: str) -> tuple[Branch, Tenant]:
    """The branch behind a menu link, or 404 — a closed store reads the same."""
    branch = (
        db.query(Branch)
        .filter(Branch.menu_token == token.strip(), Branch.is_active.is_(True))
        .first()
    )
    tenant = db.get(Tenant, branch.tenant_id) if branch else None
    if branch is None or tenant is None or tenant.is_blocked or tenant.is_deleted:
        raise HTTPException(status_code=404, detail="This menu link is not active.")
    return branch, tenant


@router.get("/menu/{token}")
def public_menu(token: str, db: Session = Depends(get_db)):
    branch, tenant = open_branch(db, token)
    categories = (
        db.query(MenuCategory)
        .filter(MenuCategory.tenant_id == tenant.id, MenuCategory.is_active.is_(True))
        .order_by(MenuCategory.sort, MenuCategory.id)
        .all()
    )
    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant.id, Product.is_available.is_(True))
        .order_by(Product.sort, Product.id)
        .all()
    )
    return {
        "store": {
            "name_ar": tenant.name_ar,
            "name_en": tenant.name_en,
            "currency": tenant.currency,
            "tax_rate": tenant.tax_rate,
            "default_language": tenant.default_language,
            "accent_color": tenant.accent_color,
        },
        "branch": {
            "id": branch.id,
            "name_ar": branch.name_ar,
            "name_en": branch.name_en,
            "address": branch.address,
        },
        # A guest paying at the counter never sees a cost, a margin or a recipe.
        "categories": [
            {
                "id": category.id,
                "name_ar": category.name_ar,
                "name_en": category.name_en,
                "emoji": category.emoji,
            }
            for category in categories
        ],
        "products": [
            {
                "id": product.id,
                "category_id": product.category_id,
                "name_ar": product.name_ar,
                "name_en": product.name_en,
                "emoji": product.emoji,
                "price": product.price,
            }
            for product in products
        ],
    }


@router.get("/menu/{token}/orders/{number}")
def public_order_status(token: str, number: str, db: Session = Depends(get_db)):
    """Where a guest's own ticket is now that the kitchen has it.

    Numbers are sequential and the token is printed on the table, so this answers
    only what a status board shows: the state, the plate count and the total. No
    guest name, no table history, nothing that identifies anyone.
    """
    branch, tenant = open_branch(db, token)
    cleaned = number.strip().lstrip("#")
    if not cleaned:
        raise HTTPException(status_code=404, detail="No order with that number.")

    order = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.branch_id == branch.id,
            Order.number == cleaned,
        )
        .order_by(Order.id.desc())
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="No order with that number.")

    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == order.id)
        .order_by(OrderItem.id)
        .all()
    )
    plates = sum(item.qty for item in items)
    return {
        "number": order.number,
        "status": order.status,
        "channel": order.channel,
        "table_no": order.table_no,
        "currency": tenant.currency,
        "total": order.total,
        "item_count": plates,
        # The guest's own clock: how long this ticket should take and how much
        # of it is left, so the menu and the tracking page tell one story.
        "eta_minutes": estimate_minutes(plates),
        "minutes_left": minutes_left(order, plates),
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "items": [
            {
                "name_ar": item.name_ar,
                "name_en": item.name_en,
                "emoji": item.emoji,
                "qty": item.qty,
            }
            for item in items
        ],
    }


@router.post("/menu/{token}/orders", status_code=201)
def public_order(
    token: str, payload: PublicOrderIn, db: Session = Depends(get_db)
):
    """A guest's ticket: at a table when the stand carries one, else to collect."""
    branch, tenant = open_branch(db, token)

    if payload.table_no and payload.table_no > table_count(db, tenant):
        raise HTTPException(status_code=422, detail="That table does not exist.")

    quantities: dict[int, int] = defaultdict(int)
    for line in payload.items:
        quantities[line.product_id] += line.qty

    note = payload.note.strip()
    order, items = place_order(
        db,
        tenant,
        branch_id=branch.id,
        channel="dine_in" if payload.table_no else "takeaway",
        table_no=payload.table_no,
        quantities=quantities,
        customer_name=payload.guest_name,
        # The ticket carries where it came from, next to the guest's own note,
        # so the counter can tell a self-ordered one from its own.
        note=f"{SOURCE} · {note}" if note else SOURCE,
    )
    plates = sum(item.qty for item in items)
    return {
        "number": order.number,
        "channel": order.channel,
        "table_no": order.table_no,
        "total": order.total,
        "item_count": plates,
        # The receipt prints the wait the guest can watch on the menu bar.
        "eta_minutes": estimate_minutes(plates),
    }
