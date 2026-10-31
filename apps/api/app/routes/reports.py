"""Sales, food cost and margin reports computed from real orders."""

import csv
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_tenant
from ..models import Order, OrderItem, Tenant
from .menu import recipe_costs

router = APIRouter(prefix="/api/reports", tags=["reports"])

CHANNELS = ("dine_in", "takeaway", "delivery")
PAYMENTS = ("cash", "card", "wallet")


def build_report(db: Session, tenant: Tenant, days: int) -> dict:
    start_day = date.today() - timedelta(days=days - 1)
    start = datetime.combine(start_day, time.min)
    orders = (
        db.query(Order)
        .filter(Order.tenant_id == tenant.id, Order.placed_at >= start)
        .all()
    )
    order_ids = [order.id for order in orders]
    items = (
        db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all()
        if order_ids
        else []
    )
    costs, _ = recipe_costs(db, tenant.id)

    items_by_order: dict[int, list[OrderItem]] = defaultdict(list)
    for item in items:
        items_by_order[item.order_id].append(item)

    # One bucket per calendar day so quiet days still show up on the chart.
    series = {
        (start_day + timedelta(days=offset)).isoformat(): {
            "day": (start_day + timedelta(days=offset)).isoformat(),
            "orders": 0,
            "revenue": 0.0,
            "food_cost": 0.0,
        }
        for offset in range(days)
    }
    product_rows: dict[int, dict] = {}
    channels = {
        channel: {"channel": channel, "orders": 0, "revenue": 0.0} for channel in CHANNELS
    }
    payments = {
        payment: {"payment_method": payment, "orders": 0, "revenue": 0.0}
        for payment in PAYMENTS
    }

    totals = {
        "orders": 0,
        "items": 0,
        "revenue": 0.0,
        "tax": 0.0,
        "total": 0.0,
        "food_cost": 0.0,
        "cancelled_orders": 0,
        "cancelled_value": 0.0,
    }

    for order in orders:
        if order.status == "cancelled":
            totals["cancelled_orders"] += 1
            totals["cancelled_value"] += order.total
            continue

        placed = order.placed_at or datetime.now()
        bucket = series.get(placed.date().isoformat())
        food_cost = sum(
            item.qty * costs.get(item.product_id, 0.0)
            for item in items_by_order[order.id]
        )

        totals["orders"] += 1
        totals["revenue"] += order.subtotal
        totals["tax"] += order.tax
        totals["total"] += order.total
        totals["food_cost"] += food_cost

        if bucket is not None:
            bucket["orders"] += 1
            bucket["revenue"] += order.subtotal
            bucket["food_cost"] += food_cost

        channels[order.channel]["orders"] += 1
        channels[order.channel]["revenue"] += order.subtotal
        if order.payment_method in payments:
            payments[order.payment_method]["orders"] += 1
            payments[order.payment_method]["revenue"] += order.subtotal

        for item in items_by_order[order.id]:
            totals["items"] += item.qty
            row = product_rows.setdefault(
                item.product_id,
                {
                    "product_id": item.product_id,
                    "name_ar": item.name_ar,
                    "name_en": item.name_en,
                    "emoji": item.emoji,
                    "qty": 0,
                    "revenue": 0.0,
                },
            )
            row["qty"] += item.qty
            row["revenue"] += item.unit_price * item.qty

    revenue = round(totals["revenue"], 2)
    food_cost = round(totals["food_cost"], 2)
    gross_margin = round(revenue - food_cost, 2)
    totals.update(
        {
            "revenue": revenue,
            "tax": round(totals["tax"], 2),
            "total": round(totals["total"], 2),
            "food_cost": food_cost,
            "gross_margin": gross_margin,
            "gross_margin_pct": round(gross_margin / revenue * 100, 1) if revenue else 0.0,
            "food_cost_pct": round(food_cost / revenue * 100, 1) if revenue else 0.0,
            "avg_ticket": round(totals["total"] / totals["orders"], 2)
            if totals["orders"]
            else 0.0,
            "cancelled_value": round(totals["cancelled_value"], 2),
        }
    )

    for bucket in series.values():
        bucket["revenue"] = round(bucket["revenue"], 2)
        bucket["food_cost"] = round(bucket["food_cost"], 2)

    top_products = sorted(
        product_rows.values(), key=lambda row: row["revenue"], reverse=True
    )[:5]
    for row in top_products:
        row["revenue"] = round(row["revenue"], 2)

    return {
        "days": days,
        "start": start_day.isoformat(),
        "series": list(series.values()),
        "totals": totals,
        "top_products": top_products,
        "channels": [
            {**row, "revenue": round(row["revenue"], 2)}
            for row in channels.values()
        ],
        "payments": [
            {**row, "revenue": round(row["revenue"], 2)}
            for row in payments.values()
        ],
    }


@router.get("")
def get_report(
    days: int = Query(default=7, ge=1, le=90), db: Session = Depends(get_db)
):
    return build_report(db, current_tenant(db), days)


@router.get("/export.csv")
def export_report(
    days: int = Query(default=7, ge=1, le=90), db: Session = Depends(get_db)
):
    report = build_report(db, current_tenant(db), days)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["date", "orders", "revenue", "food_cost", "gross_margin", "tax"])
    for row in report["series"]:
        writer.writerow(
            [
                row["day"],
                row["orders"],
                f"{row['revenue']:.2f}",
                f"{row['food_cost']:.2f}",
                f"{row['revenue'] - row['food_cost']:.2f}",
                "",
            ]
        )
    totals = report["totals"]
    writer.writerow(
        [
            "total",
            totals["orders"],
            f"{totals['revenue']:.2f}",
            f"{totals['food_cost']:.2f}",
            f"{totals['gross_margin']:.2f}",
            f"{totals['tax']:.2f}",
        ]
    )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="sales-{days}d.csv"'
        },
    )
