"""The platform owner's side of the app: the restaurants themselves.

Only the owner reaches these endpoints (`auth.require_owner`): they open a
restaurant, set what the software costs it, block it, remove it while choosing
what happens to its history, and record the money they collected from it.

That money is the owner's income — what the software was sold for — and it is
kept apart from the restaurant's own ticket revenue, which stays on Reports.
"""

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import Base, get_db
from ..deps import current_tenant
from ..models import (
    AuditLog,
    AuthSession,
    Order,
    RestaurantInvite,
    SoftwarePayment,
    Staff,
    Tenant,
)
from ..security import new_token
from .team import MIN_PASSWORD, USERNAME_PATTERN, new_credentials

router = APIRouter(prefix="/api", tags=["platform"])

ROLE_ADMIN = "admin"

# The one thing that still stops a block or a removal: the platform account has
# nowhere to sit, so closing the last open restaurant would close the platform
# with it.
NO_OTHER_HOME = (
    "Open another restaurant first: the platform account sits in this one and "
    "needs somewhere to live."
)

# What the owner's overview calls "recent activity" — the restaurant lifecycle
# and the money collected for the software, never a restaurant's own tickets.
PLATFORM_ACTIONS = (
    "restaurant.create",
    "restaurant.update",
    "restaurant.block",
    "restaurant.unblock",
    "restaurant.delete",
    "restaurant.invite",
    "restaurant.activate",
    "software.payment",
    "software.payment.delete",
)


def month_start(today: date | None = None) -> date:
    today = today or date.today()
    return today.replace(day=1)


def shift_month(month: date, delta: int) -> date:
    index = month.year * 12 + month.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


def admin_of(db: Session, tenant_id: int) -> Staff | None:
    return (
        db.query(Staff)
        .filter(
            Staff.tenant_id == tenant_id,
            Staff.role == ROLE_ADMIN,
            Staff.username != "",
        )
        .order_by(Staff.id)
        .first()
    )


def latest_invite(db: Session, tenant_id: int) -> RestaurantInvite | None:
    return (
        db.query(RestaurantInvite)
        .filter(RestaurantInvite.tenant_id == tenant_id)
        .order_by(RestaurantInvite.id.desc())
        .first()
    )


def mint_invite(db: Session, tenant: Tenant, actor: str) -> RestaurantInvite:
    """A fresh activation link, and the only live one for that restaurant."""
    db.query(RestaurantInvite).filter(
        RestaurantInvite.tenant_id == tenant.id,
        RestaurantInvite.used_at.is_(None),
    ).delete(synchronize_session=False)
    row = RestaurantInvite(
        tenant_id=tenant.id, token=new_token(), created_by=actor
    )
    db.add(row)
    db.flush()
    return row


def serialize_admin(row: Staff | None) -> dict | None:
    if row is None:
        return None
    return {"id": row.id, "name": row.name, "username": row.username}


def serialize_restaurant(db: Session, tenant: Tenant, month: date) -> dict:
    sales = (
        db.query(func.coalesce(func.sum(Order.subtotal), 0.0))
        .filter(
            Order.tenant_id == tenant.id,
            Order.status != "cancelled",
            Order.placed_at >= datetime.combine(month, time.min),
        )
        .scalar()
        or 0.0
    )
    paid_month = (
        db.query(func.coalesce(func.sum(SoftwarePayment.amount), 0.0))
        .filter(
            SoftwarePayment.tenant_id == tenant.id,
            SoftwarePayment.paid_on >= month,
        )
        .scalar()
        or 0.0
    )
    paid_total = (
        db.query(func.coalesce(func.sum(SoftwarePayment.amount), 0.0))
        .filter(SoftwarePayment.tenant_id == tenant.id)
        .scalar()
        or 0.0
    )
    # A restaurant without an admin is one waiting for its holder to activate.
    # The live token is what the owner copies and sends.
    invite = latest_invite(db, tenant.id)
    return {
        "id": tenant.id,
        "name_ar": tenant.name_ar,
        "name_en": tenant.name_en,
        "currency": tenant.currency,
        "software_price": tenant.software_price,
        "is_blocked": tenant.is_blocked,
        "is_deleted": tenant.is_deleted,
        "admin": serialize_admin(admin_of(db, tenant.id)),
        "invite_token": invite.token if invite and invite.used_at is None else "",
        "staff_count": db.query(func.count(Staff.id))
        .filter(Staff.tenant_id == tenant.id)
        .scalar()
        or 0,
        # The restaurant's own trade this month, next to what it paid for the
        # software: two different numbers the owner should never add up.
        "sales_month": round(float(sales), 2),
        "income_month": round(float(paid_month), 2),
        "income_total": round(float(paid_total), 2),
    }


def restaurants_payload(db: Session, owner: Staff) -> dict:
    month = month_start()
    rows = [
        serialize_restaurant(db, tenant, month)
        for tenant in db.query(Tenant).order_by(Tenant.id)
    ]
    live = [row for row in rows if not row["is_deleted"]]
    return {
        "restaurants": rows,
        "summary": {
            "total": len(live),
            "active": sum(
                1 for row in live if not row["is_blocked"] and not row["is_deleted"]
            ),
            "blocked": sum(1 for row in live if row["is_blocked"]),
            "archived": sum(1 for row in rows if row["is_deleted"]),
            # What the owner bills every restaurant in a month.
            "monthly_price": round(sum(row["software_price"] for row in live), 2),
            "income_month": round(sum(row["income_month"] for row in live), 2),
            "income_total": round(sum(row["income_total"] for row in rows), 2),
        },
        "currency": current_tenant(db).currency,
        "month": month.isoformat()[:7],
        "owner_tenant_id": owner.tenant_id,
    }


def income_payload(db: Session, months: int) -> dict:
    """The owner's own income, month by month, with the entries behind it."""
    month = month_start()
    first = shift_month(month, -(months - 1))
    payments = (
        db.query(SoftwarePayment, Tenant)
        .join(Tenant, Tenant.id == SoftwarePayment.tenant_id)
        .filter(SoftwarePayment.paid_on >= first)
        .order_by(SoftwarePayment.paid_on.desc(), SoftwarePayment.id.desc())
        .all()
    )
    buckets: dict[str, list[dict]] = {}
    for payment, tenant in payments:
        key = payment.paid_on.isoformat()[:7]
        buckets.setdefault(key, []).append(
            {
                "id": payment.id,
                "restaurant_id": tenant.id,
                "name_ar": tenant.name_ar,
                "name_en": tenant.name_en,
                "amount": round(payment.amount, 2),
                "paid_on": payment.paid_on.isoformat(),
                "note": payment.note,
            }
        )
    series = []
    for offset in range(months):
        key = shift_month(first, offset).isoformat()[:7]
        entries = buckets.get(key, [])
        series.append(
            {
                "month": key,
                "total": round(sum(entry["amount"] for entry in entries), 2),
                "count": len(entries),
                "entries": entries,
            }
        )
    series.reverse()
    total = (
        db.query(func.coalesce(func.sum(SoftwarePayment.amount), 0.0)).scalar() or 0.0
    )
    billed = (
        db.query(func.coalesce(func.sum(Tenant.software_price), 0.0))
        .filter(Tenant.is_deleted.is_(False))
        .scalar()
        or 0.0
    )
    return {
        "months": series,
        "currency": current_tenant(db).currency,
        "summary": {
            "this_month": series[0]["total"] if series else 0,
            "total": round(float(total), 2),
            "monthly_price": round(float(billed), 2),
        },
    }


class RestaurantIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)
    software_price: float = Field(default=0, ge=0, le=1_000_000)
    # Optional first restaurant admin, created with the restaurant so the
    # restaurant can be handed over in one step.
    admin_name: str = Field(default="", max_length=120)
    admin_username: str = Field(default="", max_length=60)
    admin_password: str = Field(default="", max_length=200)


class RestaurantPatch(BaseModel):
    name_ar: str | None = Field(default=None, min_length=1, max_length=120)
    name_en: str | None = Field(default=None, min_length=1, max_length=120)
    software_price: float | None = Field(default=None, ge=0, le=1_000_000)


class BlockIn(BaseModel):
    blocked: bool = True


class PaymentIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    paid_on: date | None = None
    note: str = Field(default="", max_length=160)


def get_restaurant(db: Session, restaurant_id: int) -> Tenant:
    tenant = db.get(Tenant, restaurant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return tenant


def unique_name(db: Session, name_en: str, exclude_id: int = 0) -> None:
    query = db.query(Tenant).filter(func.lower(Tenant.name_en) == name_en.lower())
    if exclude_id:
        query = query.filter(Tenant.id != exclude_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=409, detail="A restaurant with that name already exists."
        )


def live_restaurants(db: Session, exclude_id: int = 0):
    """Every restaurant that is still open, oldest first."""
    query = db.query(Tenant).filter(
        Tenant.is_deleted.is_(False), Tenant.is_blocked.is_(False)
    )
    if exclude_id:
        query = query.filter(Tenant.id != exclude_id)
    return query.order_by(Tenant.id)


def move_home(db: Session, user: Staff, leaving_id: int) -> bool:
    """Move the platform account out of a restaurant that is about to close.

    The owner's account is a staff row inside one restaurant, so closing that
    restaurant would close the account with it — that is the only reason the
    store a sign-in came from used to be untouchable. When another open
    restaurant is left, the account and its sessions move there first, which
    lets the owner remove every restaurant on the list.
    """
    if user.tenant_id != leaving_id:
        return True
    target = live_restaurants(db, leaving_id).first()
    if target is None:
        return False
    user.tenant_id = target.id
    # The session's autoflush is off and a removal deletes rows with raw SQL, so
    # the moved staff row has to reach the database before anything purges it.
    db.flush()
    db.query(AuthSession).filter(AuthSession.staff_id == user.id).update(
        {"tenant_id": target.id}, synchronize_session=False
    )
    return True


@router.get("/restaurants")
def list_restaurants(
    user: Staff = Depends(auth.require_owner), db: Session = Depends(get_db)
):
    return restaurants_payload(db, user)


@router.post("/restaurants", status_code=201)
def create_restaurant(
    payload: RestaurantIn,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    name_ar = payload.name_ar.strip()
    name_en = payload.name_en.strip()
    if not (name_ar and name_en):
        raise HTTPException(
            status_code=422,
            detail="A restaurant needs a name in both languages.",
        )
    unique_name(db, name_en)

    username = payload.admin_username.strip()
    password = payload.admin_password
    if bool(username) != bool(password):
        raise HTTPException(
            status_code=422,
            detail="A restaurant admin needs both a username and a password.",
        )
    if username and not USERNAME_PATTERN.match(username.lower()):
        raise HTTPException(
            status_code=422,
            detail="A username is 3–60 letters, numbers, dots, dashes or underscores.",
        )

    # A new restaurant starts empty, but it rings up money the same way the
    # owner's own store does, so the till never charges an unset tax rate.
    home = current_tenant(db)
    row = Tenant(
        name_ar=name_ar,
        name_en=name_en,
        currency=home.currency,
        tax_rate=home.tax_rate,
        default_language=home.default_language,
        software_price=payload.software_price,
    )
    db.add(row)
    db.flush()

    if username:
        name, password_hash = new_credentials(db, username, password)
        db.add(
            Staff(
                tenant_id=row.id,
                name=payload.admin_name.strip() or name,
                role=ROLE_ADMIN,
                is_active=True,
                username=name,
                password_hash=password_hash,
            )
        )
    else:
        # No account was made here, so the restaurant is handed over through an
        # activation link instead: its holder sets their own password.
        mint_invite(db, row, user.name)
    audit.log(
        db,
        row.id,
        "restaurant.create",
        "tenant",
        row.id,
        f"{row.name_en} at {row.software_price:g}"
        + (f", admin {username.lower()}" if username else ", activation link"),
        actor=user.name,
    )
    db.commit()
    payload = restaurants_payload(db, user)
    # The web answers "create" by showing that new restaurant's link, so say
    # which row it is instead of guessing from the name.
    payload["created_id"] = row.id
    return payload


@router.patch("/restaurants/{restaurant_id}")
def update_restaurant(
    restaurant_id: int,
    patch: RestaurantPatch,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = get_restaurant(db, restaurant_id)
    changes = patch.model_dump(exclude_unset=True)
    if "name_ar" in changes:
        changes["name_ar"] = changes["name_ar"].strip()
    if "name_en" in changes:
        changes["name_en"] = changes["name_en"].strip()
        if not changes["name_en"]:
            raise HTTPException(
                status_code=422, detail="A restaurant needs a name in both languages."
            )
        unique_name(db, changes["name_en"], row.id)
    for field, value in changes.items():
        setattr(row, field, value)
    if changes:
        audit.log(
            db,
            row.id,
            "restaurant.update",
            "tenant",
            row.id,
            ", ".join(f"{field}={value}" for field, value in sorted(changes.items())),
            actor=user.name,
        )
    db.commit()
    return restaurants_payload(db, user)


@router.post("/restaurants/{restaurant_id}/block")
def block_restaurant(
    restaurant_id: int,
    payload: BlockIn,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = get_restaurant(db, restaurant_id)
    if payload.blocked and not move_home(db, user, row.id):
        raise HTTPException(status_code=409, detail=NO_OTHER_HOME)
    row.is_blocked = payload.blocked
    if payload.blocked:
        # A blocked restaurant is off the air at once: nobody in it keeps a
        # session open even if the tab is already signed in.
        db.query(AuthSession).filter(AuthSession.tenant_id == row.id).delete()
    audit.log(
        db,
        row.id,
        "restaurant.block" if payload.blocked else "restaurant.unblock",
        "tenant",
        row.id,
        row.name_en,
        actor=user.name,
    )
    db.commit()
    return restaurants_payload(db, user)


@router.post("/restaurants/{restaurant_id}/invite")
def invite_restaurant(
    restaurant_id: int,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    """A fresh activation link for a restaurant that has no admin yet."""
    row = get_restaurant(db, restaurant_id)
    if admin_of(db, row.id) is not None:
        raise HTTPException(
            status_code=409,
            detail="This restaurant already has an admin.",
        )
    mint_invite(db, row, user.name)
    audit.log(
        db,
        row.id,
        "restaurant.invite",
        "tenant",
        row.id,
        f"activation link for {row.name_en}",
        actor=user.name,
    )
    db.commit()
    return restaurants_payload(db, user)


def purge_restaurant(db: Session, tenant: Tenant) -> dict:
    """Delete the restaurant and every row that belongs to it, children first."""
    removed: dict[str, int] = {}
    # A session belongs to a restaurant and to whoever signed in. When the
    # platform account moved between restaurants the two no longer have to
    # agree, and a session left behind by one of this restaurant's accounts
    # would block deleting that account below.
    staff_ids = [
        row.id for row in db.query(Staff.id).filter(Staff.tenant_id == tenant.id)
    ]
    sessions = AuthSession.tenant_id == tenant.id
    if staff_ids:
        sessions = or_(sessions, AuthSession.staff_id.in_(staff_ids))
    count = (
        db.query(AuthSession).filter(sessions).delete(synchronize_session=False)
    )
    if count:
        removed["auth_sessions"] = count
    for table in reversed(Base.metadata.sorted_tables):
        if table.name == "tenants" or "tenant_id" not in table.c:
            continue
        count = db.execute(
            table.delete().where(table.c.tenant_id == tenant.id)
        ).rowcount
        if count:
            removed[table.name] = count
    db.delete(tenant)
    return removed


@router.delete("/restaurants/{restaurant_id}")
def delete_restaurant(
    restaurant_id: int,
    keep_data: bool = Query(
        default=True,
        description="Keep the restaurant's history for the books, or erase it.",
    ),
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    """Remove a restaurant, with the owner's explicit choice about its history.

    `keep_data=true` archives it: every row stays for the books, the restaurant
    drops out of the app and nobody in it can sign in. `keep_data=false` erases
    the restaurant and all of its rows.
    """
    row = get_restaurant(db, restaurant_id)
    if not move_home(db, user, row.id):
        raise HTTPException(status_code=409, detail=NO_OTHER_HOME)
    if keep_data:
        row.is_deleted = True
        row.is_blocked = True
        db.query(AuthSession).filter(AuthSession.tenant_id == row.id).delete()
        detail = f"{row.name_en}: archived, history kept"
        removed: dict[str, int] = {}
    else:
        removed = purge_restaurant(db, row)
        detail = f"{row.name_en}: deleted with its history"

    # The audit row lives on the owner's own restaurant: the tenant it describes
    # may no longer exist.
    audit.log(
        db,
        user.tenant_id,
        "restaurant.delete",
        "tenant",
        restaurant_id,
        detail,
        actor=user.name,
    )
    db.commit()
    payload = restaurants_payload(db, user)
    payload["removed"] = removed
    return payload


@router.post("/restaurants/{restaurant_id}/payments", status_code=201)
def record_payment(
    restaurant_id: int,
    payload: PaymentIn,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = get_restaurant(db, restaurant_id)
    paid_on = payload.paid_on or date.today()
    db.add(
        SoftwarePayment(
            tenant_id=row.id,
            amount=round(payload.amount, 2),
            paid_on=paid_on,
            note=payload.note.strip(),
            created_by=user.name,
        )
    )
    audit.log(
        db,
        row.id,
        "software.payment",
        "tenant",
        row.id,
        f"{payload.amount:g} on {paid_on.isoformat()}",
        actor=user.name,
    )
    db.commit()
    return income_payload(db, 6)


@router.delete("/restaurants/{restaurant_id}/payments/{payment_id}")
def delete_payment(
    restaurant_id: int,
    payment_id: int,
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = get_restaurant(db, restaurant_id)
    payment = (
        db.query(SoftwarePayment)
        .filter(
            SoftwarePayment.id == payment_id,
            SoftwarePayment.tenant_id == row.id,
        )
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    audit.log(
        db,
        row.id,
        "software.payment.delete",
        "tenant",
        row.id,
        f"{payment.amount:g} on {payment.paid_on.isoformat()}",
        actor=user.name,
    )
    db.delete(payment)
    db.commit()
    return income_payload(db, 6)


@router.get("/platform/overview")
def overview(
    user: Staff = Depends(auth.require_owner), db: Session = Depends(get_db)
):
    """The owner's home screen: what needs a decision today.

    Two lists the restaurants table cannot answer at a glance — restaurants
    nobody has activated yet, and restaurants that have paid nothing this month
    — plus the newest entries of the platform's own trail.
    """
    payload = restaurants_payload(db, user)
    rows = payload["restaurants"]
    live = [row for row in rows if not row["is_deleted"]]

    # The platform account's own seat is not a customer waiting for a handover.
    pending = [
        row
        for row in live
        if row["admin"] is None and row["id"] != payload["owner_tenant_id"]
    ]
    unpaid = [
        row
        for row in live
        if not row["is_blocked"] and row["software_price"] > 0 and row["income_month"] <= 0
    ]
    activity = (
        db.query(AuditLog)
        .filter(AuditLog.action.in_(PLATFORM_ACTIONS))
        .order_by(AuditLog.id.desc())
        .limit(8)
        .all()
    )
    return {
        "summary": {
            **payload["summary"],
            "pending": len(pending),
            "unpaid": len(unpaid),
            "unpaid_amount": round(sum(row["software_price"] for row in unpaid), 2),
        },
        "pending": pending,
        "unpaid": unpaid,
        "activity": audit.serialize(activity),
        "currency": payload["currency"],
        "month": payload["month"],
        "owner_tenant_id": payload["owner_tenant_id"],
    }


@router.get("/income")
def income(
    months: int = Query(default=6, ge=1, le=24),
    user: Staff = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    return income_payload(db, months)
