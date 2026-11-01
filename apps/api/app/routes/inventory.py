from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import current_tenant
from ..models import Ingredient, RecipeLine, StockMovement, Tenant
from ..security import client_host
from ..stock import is_low, recent_movements, record

router = APIRouter(prefix="/api/ingredients", tags=["inventory"])

Unit = Literal["g", "ml", "pc"]


def usage_counts(db: Session, tenant_id: int) -> dict[int, int]:
    rows = (
        db.query(
            RecipeLine.ingredient_id,
            func.count(func.distinct(RecipeLine.product_id)),
        )
        .filter(RecipeLine.tenant_id == tenant_id)
        .group_by(RecipeLine.ingredient_id)
        .all()
    )
    return {ingredient_id: count for ingredient_id, count in rows}


def ingested_ingredients(db: Session, tenant_id: int) -> set[int]:
    """Ingredients that already have stock history (deleting them is refused)."""
    rows = (
        db.query(StockMovement.ingredient_id)
        .filter(StockMovement.tenant_id == tenant_id)
        .distinct()
        .all()
    )
    return {ingredient_id for (ingredient_id,) in rows}


def serialize_inventory(db: Session, tenant: Tenant) -> dict:
    counts = usage_counts(db, tenant.id)
    stocked = ingested_ingredients(db, tenant.id)
    rows = (
        db.query(Ingredient)
        .filter_by(tenant_id=tenant.id)
        .order_by(Ingredient.id)
        .all()
    )
    return {
        "ingredients": [
            {
                "id": row.id,
                "name_ar": row.name_ar,
                "name_en": row.name_en,
                "unit": row.unit,
                "unit_cost": row.unit_cost,
                "stock_qty": row.stock_qty,
                "par_level": row.par_level,
                "is_low": is_low(row),
                "recipes_using": counts.get(row.id, 0),
                "has_movements": row.id in stocked,
            }
            for row in rows
        ],
        "movements": recent_movements(db, tenant),
    }


def get_ingredient(db: Session, tenant: Tenant, ingredient_id: int) -> Ingredient:
    ingredient = (
        db.query(Ingredient)
        .filter(
            Ingredient.tenant_id == tenant.id,
            Ingredient.id == ingredient_id,
        )
        .first()
    )
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ingredient


class IngredientIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    unit: Unit = "g"
    unit_cost: float = Field(ge=0)
    stock_qty: float = Field(ge=0)
    par_level: float = Field(default=0, ge=0)


class IngredientPatch(BaseModel):
    name_ar: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    unit: Unit | None = None
    unit_cost: float | None = Field(default=None, ge=0)
    stock_qty: float | None = Field(default=None, ge=0)
    par_level: float | None = Field(default=None, ge=0)


class MovementIn(BaseModel):
    """A delivery (`purchase`) or shrinkage (`waste`), always a positive amount."""

    qty: float = Field(gt=0, le=100000)
    reason: Literal["purchase", "waste"]
    note: str = Field(default="", max_length=120)


@router.get("")
def list_ingredients(db: Session = Depends(get_db)):
    return serialize_inventory(db, current_tenant(db))


@router.post("", status_code=201)
def create_ingredient(payload: IngredientIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    db.add(Ingredient(tenant_id=tenant.id, **payload.model_dump()))
    db.commit()
    return serialize_inventory(db, tenant)


@router.patch("/{ingredient_id}")
def update_ingredient(
    ingredient_id: int,
    patch: IngredientPatch,
    request: Request,
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    ingredient = get_ingredient(db, tenant, ingredient_id)
    changes = patch.model_dump(exclude_unset=True)
    # A manual stock edit is still a ledger entry, so the balance stays explained.
    new_stock = changes.pop("stock_qty", None)
    for field, value in changes.items():
        setattr(ingredient, field, value)
    if new_stock is not None and new_stock != ingredient.stock_qty:
        record(
            db,
            ingredient,
            new_stock - ingredient.stock_qty,
            "adjustment",
            note="manual edit",
        )
    if new_stock is not None or "unit_cost" in changes:
        # Stock corrections and cost edits are the two ways a plate quietly
        # changes value, so both leave a trace.
        audit.log(
            db,
            tenant.id,
            "ingredient.edit",
            "ingredient",
            ingredient.id,
            f"{ingredient.name_en}: "
            + ", ".join(f"{field}={value}" for field, value in changes.items()),
            actor=client_host(request),
        )
    db.commit()
    return serialize_inventory(db, tenant)


@router.post("/{ingredient_id}/movements", status_code=201)
def create_movement(
    ingredient_id: int,
    payload: MovementIn,
    request: Request,
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    ingredient = get_ingredient(db, tenant, ingredient_id)
    if payload.reason == "waste" and payload.qty > ingredient.stock_qty:
        raise HTTPException(
            status_code=409,
            detail="There is not that much on hand to write off.",
        )
    delta = payload.qty if payload.reason == "purchase" else -payload.qty
    record(db, ingredient, delta, payload.reason, note=payload.note)
    # The ledger row explains the balance; the trail explains who moved it.
    audit.log(
        db,
        tenant.id,
        f"stock.{payload.reason}",
        "ingredient",
        ingredient.id,
        f"{ingredient.name_en} {delta:+.3f} {ingredient.unit} {payload.note}".strip(),
        actor=client_host(request),
    )
    db.commit()
    return serialize_inventory(db, tenant)


@router.delete("/{ingredient_id}")
def delete_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    ingredient = get_ingredient(db, tenant, ingredient_id)
    used = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.tenant_id == tenant.id,
            RecipeLine.ingredient_id == ingredient.id,
        )
        .count()
    )
    if used:
        raise HTTPException(
            status_code=409,
            detail="This ingredient is used in a recipe. Remove it there first.",
        )
    if ingredient.id in ingested_ingredients(db, tenant.id):
        raise HTTPException(
            status_code=409,
            detail="This ingredient has stock history and cannot be deleted.",
        )
    db.delete(ingredient)
    db.commit()
    return serialize_inventory(db, tenant)
