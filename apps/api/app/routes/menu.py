from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import current_tenant
from ..models import Ingredient, MenuCategory, Product, RecipeLine, Tenant
from ..security import client_host

router = APIRouter(prefix="/api/menu", tags=["menu"])


# ---------------------------------------------------------------- serializers


def recipe_costs(db: Session, tenant_id: int):
    rows = (
        db.query(RecipeLine, Ingredient)
        .join(Ingredient, RecipeLine.ingredient_id == Ingredient.id)
        .filter(RecipeLine.tenant_id == tenant_id)
        .all()
    )
    costs: dict[int, float] = defaultdict(float)
    counts: dict[int, int] = defaultdict(int)
    for line, ingredient in rows:
        costs[line.product_id] += line.qty * ingredient.unit_cost
        counts[line.product_id] += 1
    return costs, counts


def serialize_product(product: Product, costs: dict[int, float], counts: dict[int, int]) -> dict:
    cost = round(costs.get(product.id, 0.0), 2)
    margin = round(product.price - cost, 2)
    return {
        "id": product.id,
        "category_id": product.category_id,
        "name_ar": product.name_ar,
        "name_en": product.name_en,
        "emoji": product.emoji,
        "price": product.price,
        "is_available": product.is_available,
        "sort": product.sort,
        "cost": cost,
        "margin": margin,
        "margin_pct": round(margin / product.price * 100, 1) if product.price else 0.0,
        "recipe_lines": counts.get(product.id, 0),
    }


def serialize_menu(db: Session, tenant: Tenant) -> dict:
    categories = (
        db.query(MenuCategory)
        .filter_by(tenant_id=tenant.id)
        .order_by(MenuCategory.sort, MenuCategory.id)
        .all()
    )
    products = (
        db.query(Product)
        .filter_by(tenant_id=tenant.id)
        .order_by(Product.sort, Product.id)
        .all()
    )
    costs, counts = recipe_costs(db, tenant.id)
    product_rows = [serialize_product(p, costs, counts) for p in products]
    priced = [row for row in product_rows if row["price"] > 0]

    return {
        "categories": [
            {
                "id": category.id,
                "name_ar": category.name_ar,
                "name_en": category.name_en,
                "emoji": category.emoji,
                "is_active": category.is_active,
                "product_count": sum(
                    1 for product in products if product.category_id == category.id
                ),
            }
            for category in categories
        ],
        "products": product_rows,
        "summary": {
            "product_count": len(products),
            "category_count": len(categories),
            "without_recipe": sum(1 for row in product_rows if not row["recipe_lines"]),
            "avg_margin_pct": round(
                sum(row["margin_pct"] for row in priced) / len(priced), 1
            )
            if priced
            else 0.0,
        },
    }


def serialize_recipe(db: Session, tenant: Tenant, product: Product) -> dict:
    rows = (
        db.query(RecipeLine, Ingredient)
        .join(Ingredient, RecipeLine.ingredient_id == Ingredient.id)
        .filter(
            RecipeLine.tenant_id == tenant.id,
            RecipeLine.product_id == product.id,
        )
        .order_by(RecipeLine.id)
        .all()
    )
    lines = []
    for line, ingredient in rows:
        lines.append(
            {
                "ingredient_id": ingredient.id,
                "name_ar": ingredient.name_ar,
                "name_en": ingredient.name_en,
                "unit": ingredient.unit,
                "unit_cost": ingredient.unit_cost,
                "qty": line.qty,
                "line_cost": round(line.qty * ingredient.unit_cost, 2),
            }
        )
    cost = round(sum(row["line_cost"] for row in lines), 2)
    price = product.price
    return {
        "product": {
            "id": product.id,
            "category_id": product.category_id,
            "name_ar": product.name_ar,
            "name_en": product.name_en,
            "emoji": product.emoji,
            "price": price,
            "is_available": product.is_available,
        },
        "lines": lines,
        "totals": {
            "cost": cost,
            "price": price,
            "margin": round(price - cost, 2),
            "food_cost_pct": round(cost / price * 100, 1) if price else 0.0,
        },
    }


def get_product(db: Session, tenant: Tenant, product_id: int) -> Product:
    product = (
        db.query(Product)
        .filter(Product.tenant_id == tenant.id, Product.id == product_id)
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def get_category(db: Session, tenant: Tenant, category_id: int) -> MenuCategory:
    category = (
        db.query(MenuCategory)
        .filter(
            MenuCategory.tenant_id == tenant.id,
            MenuCategory.id == category_id,
        )
        .first()
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


# ------------------------------------------------------------------- schemas


class CategoryIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    emoji: str = Field(default="🍽️", max_length=8)
    is_active: bool = True


class CategoryPatch(BaseModel):
    name_ar: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    emoji: str | None = Field(default=None, max_length=8)
    is_active: bool | None = None


class ProductIn(BaseModel):
    category_id: int
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    emoji: str = Field(default="🍽️", max_length=8)
    price: float = Field(ge=0)
    is_available: bool = True


class ProductPatch(BaseModel):
    category_id: int | None = None
    name_ar: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    emoji: str | None = Field(default=None, max_length=8)
    price: float | None = Field(default=None, ge=0)
    is_available: bool | None = None


class RecipeLineIn(BaseModel):
    ingredient_id: int
    qty: float = Field(gt=0)


class RecipeIn(BaseModel):
    lines: list[RecipeLineIn] = Field(default_factory=list)


# ----------------------------------------------------------------- endpoints


@router.get("")
def get_menu(db: Session = Depends(get_db)):
    return serialize_menu(db, current_tenant(db))


@router.post("/categories", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    highest = (
        db.query(func.max(MenuCategory.sort)).filter_by(tenant_id=tenant.id).scalar()
    )
    category = MenuCategory(
        tenant_id=tenant.id,
        sort=(highest or 0) + 1,
        **payload.model_dump(),
    )
    db.add(category)
    db.commit()
    return serialize_menu(db, tenant)


@router.patch("/categories/{category_id}")
def update_category(
    category_id: int, patch: CategoryPatch, db: Session = Depends(get_db)
):
    tenant = current_tenant(db)
    category = get_category(db, tenant, category_id)
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    return serialize_menu(db, tenant)


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    category = get_category(db, tenant, category_id)
    product_count = (
        db.query(Product)
        .filter(Product.tenant_id == tenant.id, Product.category_id == category.id)
        .count()
    )
    if product_count:
        raise HTTPException(
            status_code=409,
            detail="Move or delete the products in this category first.",
        )
    db.delete(category)
    db.commit()
    return serialize_menu(db, tenant)


@router.post("/products", status_code=201)
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    get_category(db, tenant, payload.category_id)
    highest = db.query(func.max(Product.sort)).filter_by(tenant_id=tenant.id).scalar()
    product = Product(
        tenant_id=tenant.id,
        sort=(highest or 0) + 1,
        **payload.model_dump(),
    )
    db.add(product)
    db.commit()
    return serialize_menu(db, tenant)


@router.patch("/products/{product_id}")
def update_product(
    product_id: int,
    patch: ProductPatch,
    request: Request,
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    product = get_product(db, tenant, product_id)
    changes = patch.model_dump(exclude_unset=True)
    if "category_id" in changes:
        get_category(db, tenant, changes["category_id"])
    if "price" in changes and changes["price"] != product.price:
        # A price move is the classic till fraud, so it always leaves a trace.
        audit.log(
            db,
            tenant.id,
            "product.price",
            "product",
            product.id,
            f"{product.name_en}: {product.price:.2f} → {changes['price']:.2f}",
            actor=client_host(request),
        )
    for field, value in changes.items():
        setattr(product, field, value)
    db.commit()
    return serialize_menu(db, tenant)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    product = get_product(db, tenant, product_id)
    db.query(RecipeLine).filter(
        RecipeLine.tenant_id == tenant.id,
        RecipeLine.product_id == product.id,
    ).delete()
    db.delete(product)
    db.commit()
    return serialize_menu(db, tenant)


@router.get("/products/{product_id}/recipe")
def get_recipe(product_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    return serialize_recipe(db, tenant, get_product(db, tenant, product_id))


@router.put("/products/{product_id}/recipe")
def save_recipe(
    product_id: int, payload: RecipeIn, db: Session = Depends(get_db)
):
    tenant = current_tenant(db)
    product = get_product(db, tenant, product_id)

    quantities: dict[int, float] = defaultdict(float)
    for line in payload.lines:
        quantities[line.ingredient_id] += line.qty
    if quantities:
        known = {
            row[0]
            for row in db.query(Ingredient.id)
            .filter(
                Ingredient.tenant_id == tenant.id,
                Ingredient.id.in_(quantities.keys()),
            )
            .all()
        }
        missing = set(quantities) - known
        if missing:
            raise HTTPException(status_code=404, detail="Ingredient not found")

    db.query(RecipeLine).filter(
        RecipeLine.tenant_id == tenant.id,
        RecipeLine.product_id == product.id,
    ).delete()
    for ingredient_id, qty in quantities.items():
        db.add(
            RecipeLine(
                tenant_id=tenant.id,
                product_id=product.id,
                ingredient_id=ingredient_id,
                qty=qty,
            )
        )
    db.commit()
    return serialize_recipe(db, tenant, product)
