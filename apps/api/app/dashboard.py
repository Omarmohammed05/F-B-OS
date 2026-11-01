"""Dashboard payload computed from real orders (no seeded figures)."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from .models import DailyMetric, Order, OrderItem, Tenant

WINDOW_DAYS = 7
ACTIVITY_ROWS = 8
TOP_ITEMS = 5

PAYMENT_LABELS = {
    "cash": ("كاش", "Cash"),
    "card": ("بطاقة", "Card"),
    "wallet": ("محفظة إلكترونية", "E-wallet"),
}


def _start_of(day: date) -> datetime:
    return datetime.combine(day, time.min)


def _table_name(order: Order) -> str:
    """Language-neutral so the activity table reads the same in ar and en."""
    if order.channel == "dine_in" and order.table_no:
        return f"#{order.table_no}"
    return "—"


def build_dashboard(db: Session, tenant: Tenant) -> dict:
    today = date.today()
    current_start = _start_of(today - timedelta(days=WINDOW_DAYS - 1))
    previous_start = _start_of(today - timedelta(days=WINDOW_DAYS * 2 - 1))

    recent = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id, Order.placed_at >= previous_start)
        .order_by(Order.placed_at.asc())
        .all()
    )
    live = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.status.in_(("new", "preparing")),
        )
        .all()
    )

    recent_ids = [order.id for order in recent]
    items_by_order: dict[int, list[OrderItem]] = defaultdict(list)
    if recent_ids:
        for item in db.query(OrderItem).filter(OrderItem.order_id.in_(recent_ids)).all():
            items_by_order[item.order_id].append(item)

    # One bucket per calendar day of the current window, zero-filled.
    series = {
        (today - timedelta(days=WINDOW_DAYS - 1 - offset)).isoformat(): 0.0
        for offset in range(WINDOW_DAYS)
    }
    sales_current = 0.0
    sales_previous = 0.0
    sales_today = 0.0
    orders_window = 0
    payments: dict[str, float] = defaultdict(float)
    product_rows: dict[int, dict] = {}

    for order in recent:
        if order.status == "cancelled":
            continue
        placed = order.placed_at or datetime.now()
        if placed < current_start:
            sales_previous += order.subtotal
            continue

        key = placed.date().isoformat()
        series[key] = series.get(key, 0.0) + order.subtotal
        sales_current += order.subtotal
        orders_window += 1
        if placed.date() == today:
            sales_today += order.subtotal
        payments[order.payment_method or "cash"] += order.total

        for item in items_by_order[order.id]:
            row = product_rows.setdefault(
                item.product_id,
                {
                    "name_ar": item.name_ar,
                    "name_en": item.name_en,
                    "emoji": item.emoji,
                    "orders": 0,
                    "revenue": 0.0,
                },
            )
            row["orders"] += 1
            row["revenue"] += item.unit_price * item.qty

    popular = sorted(
        product_rows.values(), key=lambda row: row["revenue"], reverse=True
    )[:TOP_ITEMS]
    for row in popular:
        row["revenue"] = round(row["revenue"], 2)

    newest = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id)
        .order_by(Order.placed_at.desc(), Order.id.desc())
        .limit(ACTIVITY_ROWS)
        .all()
    )
    newest_ids = [order.id for order in newest]
    newest_items: dict[int, list[OrderItem]] = defaultdict(list)
    if newest_ids:
        for item in (
            db.query(OrderItem)
            .filter(OrderItem.order_id.in_(newest_ids))
            .order_by(OrderItem.id.asc())
            .all()
        ):
            newest_items[item.order_id].append(item)

    activity = []
    for order in newest:
        for item in newest_items[order.id]:
            if len(activity) >= ACTIVITY_ROWS:
                break
            activity.append(
                {
                    "number": f"#{order.number}",
                    "item_ar": item.name_ar,
                    "item_en": item.name_en,
                    "unit_price": item.unit_price,
                    "table_name": _table_name(order),
                    "qty": item.qty,
                    "status": order.status,
                    "placed_at": order.placed_at.isoformat() if order.placed_at else None,
                }
            )

    metric_row = db.query(DailyMetric).filter_by(tenant_id=tenant.id).first()
    total_tables = metric_row.total_tables if metric_row else 0
    occupied = {
        order.table_no
        for order in live
        if order.channel == "dine_in" and order.table_no
    }

    change = (
        round((sales_current - sales_previous) / sales_previous * 100, 1)
        if sales_previous
        else 0.0
    )

    return {
        "tenant": {
            "name_ar": tenant.name_ar,
            "name_en": tenant.name_en,
            "accent_color": tenant.accent_color,
            "plan": tenant.plan,
            "currency": tenant.currency,
            "default_language": tenant.default_language,
        },
        "metrics": {
            "pending_orders": sum(1 for order in live if order.status == "new"),
            "in_progress_orders": sum(
                1 for order in live if order.status == "preparing"
            ),
            "total_orders": orders_window,
            "available_tables": max(total_tables - len(occupied), 0),
            "total_tables": total_tables,
            "sales_today": round(sales_today, 2),
            "sales_change": change,
        },
        "revenue": [
            {"day": day, "amount": round(amount, 2)}
            for day, amount in sorted(series.items())
        ],
        "popular": [
            {
                "name_ar": row["name_ar"],
                "name_en": row["name_en"],
                "emoji": row["emoji"],
                "orders": row["orders"],
                "revenue": row["revenue"],
            }
            for row in popular
        ],
        "activity": activity,
        "payments": [
            {
                "method_ar": PAYMENT_LABELS.get(method, (method, method))[0],
                "method_en": PAYMENT_LABELS.get(method, (method, method))[1],
                "amount": round(amount, 2),
            }
            for method, amount in sorted(
                payments.items(), key=lambda pair: pair[1], reverse=True
            )
        ],
    }
