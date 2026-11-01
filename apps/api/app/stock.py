"""Stock ledger: an ingredient's on-hand amount only changes through movements.

`ingredients.stock_qty` is a cached balance; `stock_movements` is the history
that explains it — a delivery, waste, a manual correction, or the recipe
ingredients a served ticket consumed. Reading the balance is therefore cheap and
the audit trail is never rewritten.

This module imports models only, so `routes/orders.py` can deduct stock when a
ticket is served without importing another router (which would close a cycle).
"""

from collections import defaultdict

from sqlalchemy.orm import Session

from .models import Ingredient, RecipeLine, StockMovement, Tenant

REASONS = ("sale", "purchase", "waste", "adjustment")


def is_low(ingredient: Ingredient) -> bool:
    """A par level of 0 only flags an empty shelf."""
    return ingredient.stock_qty <= ingredient.par_level


def record(
    db: Session,
    ingredient: Ingredient,
    delta: float,
    reason: str,
    order_id: int = 0,
    note: str = "",
) -> StockMovement:
    """Append a movement and move the cached balance with it. No commit."""
    movement = StockMovement(
        tenant_id=ingredient.tenant_id,
        ingredient_id=ingredient.id,
        delta=round(delta, 3),
        reason=reason,
        order_id=order_id,
        note=note.strip()[:120],
    )
    ingredient.stock_qty = round(ingredient.stock_qty + delta, 3)
    db.add(movement)
    return movement


def deduct_for_order(db: Session, tenant: Tenant, order, items) -> int:
    """Write one negative `sale` movement per ingredient the ticket consumed.

    Products without a recipe consume nothing, so a menu of ready-made items
    never blocks a ticket. Returns how many ingredients were touched.
    """
    if not items:
        return 0
    already = (
        db.query(StockMovement.id)
        .filter(
            StockMovement.tenant_id == tenant.id,
            StockMovement.order_id == order.id,
            StockMovement.reason == "sale",
        )
        .first()
    )
    if already:
        return 0

    quantities: dict[int, int] = defaultdict(int)
    for item in items:
        if item.product_id:
            quantities[item.product_id] += item.qty
    if not quantities:
        return 0

    consumed: dict[int, float] = defaultdict(float)
    lines = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.tenant_id == tenant.id,
            RecipeLine.product_id.in_(quantities.keys()),
        )
        .all()
    )
    for line in lines:
        consumed[line.ingredient_id] += line.qty * quantities[line.product_id]

    ingredients = {
        row.id: row
        for row in db.query(Ingredient)
        .filter(
            Ingredient.tenant_id == tenant.id,
            Ingredient.id.in_(list(consumed.keys())),
        )
        .all()
    }
    touched = 0
    for ingredient_id, qty in consumed.items():
        ingredient = ingredients.get(ingredient_id)
        if ingredient is None or qty <= 0:
            continue
        record(
            db,
            ingredient,
            -qty,
            "sale",
            order_id=order.id,
            note=f"#{order.number}",
        )
        touched += 1
    return touched


def recent_movements(db: Session, tenant: Tenant, limit: int = 40) -> list[dict]:
    """Newest ledger rows, with the ingredient's names for the ledger table."""
    rows = (
        db.query(StockMovement, Ingredient)
        .outerjoin(Ingredient, Ingredient.id == StockMovement.ingredient_id)
        .filter(StockMovement.tenant_id == tenant.id)
        .order_by(StockMovement.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": movement.id,
            "ingredient_id": movement.ingredient_id,
            "name_ar": ingredient.name_ar if ingredient else "",
            "name_en": ingredient.name_en if ingredient else "",
            "unit": ingredient.unit if ingredient else "",
            "delta": movement.delta,
            "reason": movement.reason,
            "order_id": movement.order_id,
            "note": movement.note,
            "created_at": (
                movement.created_at.isoformat() if movement.created_at else None
            ),
        }
        for movement, ingredient in rows
    ]
