"""Loyalty domain logic: the stamp program, member cards and derived tiers.

Points are never stored — they are the guest's lifetime net spend scaled by the
program's points rate, so editing the rate or a ticket shows up on the card
straight away. Only stamps and redemptions are transactional state.

This module imports models only, so `routes/orders.py` can award a stamp on a
served ticket without importing another router (and creating a cycle).
"""

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import wallet
from .models import Customer, LoyaltyCard, LoyaltyProgram, Order, Tenant

# Lifetime points needed for each tier, highest first.
TIERS: tuple[tuple[str, int], ...] = (
    ("gold", 500),
    ("silver", 200),
    ("bronze", 0),
)


def tier_for(points: int) -> str:
    for name, floor in TIERS:
        if points >= floor:
            return name
    return "bronze"


def next_tier_for(points: int) -> dict | None:
    """The next tier up and how many points are missing; None at the top."""
    for name, floor in reversed(TIERS):
        if points < floor:
            return {"tier": name, "points": floor - points}
    return None


def get_program(db: Session, tenant: Tenant) -> LoyaltyProgram:
    """The store's single program row, created with the model defaults once."""
    program = db.query(LoyaltyProgram).filter_by(tenant_id=tenant.id).first()
    if program is None:
        program = LoyaltyProgram(tenant_id=tenant.id)
        db.add(program)
        db.commit()
        db.refresh(program)
    return program


def guest_stats(db: Session, tenant_id: int) -> dict[int, dict]:
    """Visits and net spend per guest, derived from their non-cancelled tickets."""
    rows = (
        db.query(
            Order.customer_id,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total), 0.0),
        )
        .filter(
            Order.tenant_id == tenant_id,
            Order.customer_id > 0,
            Order.status != "cancelled",
        )
        .group_by(Order.customer_id)
        .all()
    )
    return {
        customer_id: {"visits": visits, "spend": round(spend, 2)}
        for customer_id, visits, spend in rows
    }


def card_points(db: Session, tenant_id: int, program: LoyaltyProgram, customer_id: int) -> int:
    """One guest's derived points, without loading every other guest."""
    spend = db.query(func.coalesce(func.sum(Order.total), 0.0)).filter(
        Order.tenant_id == tenant_id,
        Order.customer_id == customer_id,
        Order.status != "cancelled",
    ).scalar() or 0.0
    return int(round(float(spend) * program.points_per_currency))


def push_wallet(db: Session, tenant: Tenant, card: LoyaltyCard) -> None:
    """Mirror a card onto the guest's saved Google Wallet pass, best effort.

    A Wallet outage or a guest who never saved the pass must never fail a stamp
    at the counter, so every failure here is swallowed.
    """
    cfg = wallet.config()
    if cfg is None:
        return
    customer = db.query(Customer).filter_by(id=card.customer_id).first()
    if customer is None:
        return
    program = get_program(db, tenant)
    try:
        wallet.push_object(
            cfg,
            card_id=card.id,
            customer_id=customer.id,
            customer_name=customer.name,
            points=card_points(db, tenant.id, program, customer.id),
            stamps=card.stamps,
            target=program.stamps_target,
            reward=program.reward_ar,
        )
    except wallet.WalletError:
        return


def award_stamp(db: Session, tenant: Tenant, customer_id: int) -> LoyaltyCard | None:
    """A served ticket advances an enrolled guest's card, when it is not full."""
    if not customer_id:
        return None
    program = db.query(LoyaltyProgram).filter_by(tenant_id=tenant.id).first()
    if program is None or not program.is_active:
        return None
    card = (
        db.query(LoyaltyCard)
        .filter(
            LoyaltyCard.tenant_id == tenant.id,
            LoyaltyCard.customer_id == customer_id,
        )
        .first()
    )
    if card is None or card.stamps >= program.stamps_target:
        return None
    card.stamps += 1
    card.last_stamp_at = datetime.now()
    push_wallet(db, tenant, card)
    return card


def serialize_program(program: LoyaltyProgram) -> dict:
    return {
        "is_active": program.is_active,
        "stamps_target": program.stamps_target,
        "points_per_currency": program.points_per_currency,
        "reward_ar": program.reward_ar,
        "reward_en": program.reward_en,
    }


def serialize_loyalty(db: Session, tenant: Tenant) -> dict:
    program = get_program(db, tenant)
    stats = guest_stats(db, tenant.id)
    customers = {
        row.id: row for row in db.query(Customer).filter_by(tenant_id=tenant.id).all()
    }
    cards = (
        db.query(LoyaltyCard)
        .filter(LoyaltyCard.tenant_id == tenant.id)
        .order_by(LoyaltyCard.id)
        .all()
    )

    members = []
    for card in cards:
        customer = customers.get(card.customer_id)
        if customer is None:
            continue  # an enrolled guest was deleted; the card lost its owner
        stat = stats.get(customer.id, {})
        spend = stat.get("spend", 0.0)
        points = int(round(spend * program.points_per_currency))
        members.append(
            {
                "id": card.id,
                "customer_id": customer.id,
                "name": customer.name,
                "phone": customer.phone,
                "stamps": card.stamps,
                "stamps_target": program.stamps_target,
                "points": points,
                "tier": tier_for(points),
                "next_tier": next_tier_for(points),
                "rewards_redeemed": card.rewards_redeemed,
                "reward_ready": card.stamps >= program.stamps_target,
                "visits": stat.get("visits", 0),
                "spend": spend,
                "joined_at": card.joined_at.isoformat() if card.joined_at else None,
                "last_stamp_at": (
                    card.last_stamp_at.isoformat() if card.last_stamp_at else None
                ),
            }
        )
    members.sort(key=lambda row: (-row["points"], row["name"]))

    enrolled = {row["customer_id"] for row in members}
    available = [
        {"id": customer.id, "name": customer.name, "phone": customer.phone}
        for customer in sorted(customers.values(), key=lambda row: row.name)
        if customer.id not in enrolled
    ]

    return {
        "program": serialize_program(program),
        "cards": members,
        "available": available,
        "wallet": {"enabled": wallet.enabled()},
        "summary": {
            "members": len(members),
            "stamps_in_progress": sum(row["stamps"] for row in members),
            "rewards_ready": sum(1 for row in members if row["reward_ready"]),
            "rewards_redeemed": sum(row["rewards_redeemed"] for row in members),
            "points": sum(row["points"] for row in members),
            "tiers": {
                name: sum(1 for row in members if row["tier"] == name)
                for name, _ in TIERS
            },
        },
    }
