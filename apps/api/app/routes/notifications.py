"""The bell in the top bar: what needs the counter's attention right now.

Every row here is derived per request from tables the other modules already own,
so an alert clears the moment the work behind it is done — nothing is stored and
nothing has to be dismissed.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import active_branch_id, current_tenant
from ..loyalty import get_program
from ..models import Ingredient, LoyaltyCard, Order

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _alert(key: str, href: str, count: int, ar: str, en: str) -> dict:
    return {
        "key": key,
        "href": href,
        "count": count,
        "title_ar": ar,
        "title_en": en,
    }


@router.get("")
def notifications(db: Session = Depends(get_db)):
    tenant = current_tenant(db)

    waiting = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.branch_id == active_branch_id(db, tenant),
            Order.status == "new",
        )
        .count()
    )
    low = (
        db.query(Ingredient)
        .filter(
            Ingredient.tenant_id == tenant.id,
            Ingredient.stock_qty <= Ingredient.par_level,
        )
        .count()
    )
    program = get_program(db, tenant)
    ready = (
        db.query(LoyaltyCard)
        .filter(
            LoyaltyCard.tenant_id == tenant.id,
            LoyaltyCard.stamps >= program.stamps_target,
        )
        .count()
    )

    alerts = [
        _alert(
            "orders",
            "/orders",
            waiting,
            "طلبات جديدة بانتظار البدء",
            "New tickets waiting to start",
        ),
        _alert(
            "stock",
            "/inventory",
            low,
            "مكوّنات عند الحد الأدنى",
            "Ingredients at or below par",
        ),
        _alert(
            "rewards",
            "/loyalty",
            ready,
            "مكافآت جاهزة للاستبدال",
            "Rewards ready to redeem",
        ),
    ]
    items = [alert for alert in alerts if alert["count"] > 0]
    return {"count": len(items), "items": items}
