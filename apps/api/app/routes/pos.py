from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_tenant, table_count
from .menu import serialize_menu

router = APIRouter(prefix="/api/pos", tags=["pos"])


@router.get("")
def pos_catalog(db: Session = Depends(get_db)):
    """Only what a cashier can actually sell: active categories, available items."""
    tenant = current_tenant(db)
    menu = serialize_menu(db, tenant)

    categories = [category for category in menu["categories"] if category["is_active"]]
    active_ids = {category["id"] for category in categories}
    products = [
        product
        for product in menu["products"]
        if product["is_available"] and product["category_id"] in active_ids
    ]

    return {
        "categories": categories,
        "products": products,
        "tax_rate": tenant.tax_rate,
        "table_count": table_count(db, tenant),
    }
