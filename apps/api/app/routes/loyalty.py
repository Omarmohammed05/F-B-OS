from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import wallet
from ..db import get_db
from ..deps import current_tenant
from ..loyalty import card_points, get_program, push_wallet, serialize_loyalty
from ..models import Customer, LoyaltyCard, Tenant

router = APIRouter(prefix="/api/loyalty", tags=["loyalty"])


def get_card(db: Session, tenant: Tenant, card_id: int) -> LoyaltyCard:
    card = (
        db.query(LoyaltyCard)
        .filter(LoyaltyCard.tenant_id == tenant.id, LoyaltyCard.id == card_id)
        .first()
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Loyalty card not found")
    return card


class CardIn(BaseModel):
    customer_id: int


class ProgramPatch(BaseModel):
    is_active: bool | None = None
    stamps_target: int | None = Field(default=None, ge=2, le=20)
    points_per_currency: float | None = Field(default=None, ge=0, le=10)
    reward_ar: str | None = Field(default=None, min_length=1, max_length=80)
    reward_en: str | None = Field(default=None, min_length=1, max_length=80)


@router.get("")
def get_loyalty(db: Session = Depends(get_db)):
    return serialize_loyalty(db, current_tenant(db))


@router.post("/cards", status_code=201)
def enroll_card(payload: CardIn, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    customer = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.id == payload.customer_id)
        .first()
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    existing = (
        db.query(LoyaltyCard)
        .filter(
            LoyaltyCard.tenant_id == tenant.id,
            LoyaltyCard.customer_id == customer.id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="This guest already has a loyalty card."
        )
    db.add(LoyaltyCard(tenant_id=tenant.id, customer_id=customer.id))
    db.commit()
    return serialize_loyalty(db, tenant)


@router.delete("/cards/{card_id}")
def remove_card(card_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    card = get_card(db, tenant, card_id)
    db.delete(card)
    db.commit()
    return serialize_loyalty(db, tenant)


@router.post("/cards/{card_id}/stamp")
def stamp_card(card_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    card = get_card(db, tenant, card_id)
    program = get_program(db, tenant)
    if card.stamps >= program.stamps_target:
        raise HTTPException(
            status_code=409, detail="This card is full. Redeem the reward first."
        )
    card.stamps += 1
    card.last_stamp_at = datetime.now()
    db.commit()
    push_wallet(db, tenant, card)
    return serialize_loyalty(db, tenant)


@router.post("/cards/{card_id}/redeem")
def redeem_card(card_id: int, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    card = get_card(db, tenant, card_id)
    program = get_program(db, tenant)
    if card.stamps < program.stamps_target:
        raise HTTPException(status_code=409, detail="This card is not full yet.")
    card.stamps = 0
    card.rewards_redeemed += 1
    db.commit()
    push_wallet(db, tenant, card)
    return serialize_loyalty(db, tenant)


@router.get("/cards/{card_id}/wallet-link")
def wallet_link(card_id: int, db: Session = Depends(get_db)):
    """Signed "Add to Google Wallet" link for one member card.

    The class is created on first use and the object rides inside the signed
    token, so the guest's save works without anything pre-existing on Google.
    """
    tenant = current_tenant(db)
    cfg = wallet.config()
    if cfg is None:
        raise HTTPException(
            status_code=503,
            detail="Google Wallet is not set up yet.",
        )
    card = get_card(db, tenant, card_id)
    customer = db.query(Customer).filter_by(id=card.customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    program = get_program(db, tenant)
    try:
        wallet.ensure_class(
            cfg, tenant.name_ar or tenant.name_en, tenant.accent_color
        )
        url = wallet.save_url(
            cfg,
            card_id=card.id,
            customer_id=customer.id,
            customer_name=customer.name,
            points=card_points(db, tenant.id, program, customer.id),
            stamps=card.stamps,
            target=program.stamps_target,
            reward=program.reward_ar,
        )
    except wallet.WalletError as error:
        raise HTTPException(status_code=502, detail=str(error))
    return {"save_url": url}


@router.patch("/program")
def update_program(patch: ProgramPatch, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    program = get_program(db, tenant)
    changes = patch.model_dump(exclude_unset=True, exclude_none=True)

    for field, value in changes.items():
        setattr(program, field, value)

    # A smaller target can leave a card holding more stamps than it needs.
    if "stamps_target" in changes:
        for card in db.query(LoyaltyCard).filter_by(tenant_id=tenant.id).all():
            card.stamps = min(card.stamps, program.stamps_target)

    db.commit()
    return serialize_loyalty(db, tenant)
