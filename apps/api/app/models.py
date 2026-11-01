from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    accent_color: Mapped[str] = mapped_column(String(9), default="#0A84FF")
    plan: Mapped[str] = mapped_column(String(40), default="Control")
    currency: Mapped[str] = mapped_column(String(8), default="EGP")
    tax_rate: Mapped[float] = mapped_column(Float, default=14.0)
    default_language: Mapped[str] = mapped_column(String(2), default="ar")
    # The location the counter is working in. 0 means "no branch picked yet",
    # and `deps.active_branch` falls back to the store's first branch.
    active_branch_id: Mapped[int] = mapped_column(Integer, default=0)
    # What the platform owner charges this restaurant for the software. Owner
    # income, never restaurant sales — see `SoftwarePayment` for what was paid.
    software_price: Mapped[float] = mapped_column(Float, default=0)
    # Blocking cuts the restaurant off (no sign-in) but keeps every row.
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set when the owner removes a restaurant but keeps its history for the books.
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    # When the shift starts ("HH:MM", empty when no rule is set), how long a
    # late arrival is forgiven, and what one late minute costs the salary.
    shift_start: Mapped[str] = mapped_column(String(5), default="")
    shift_grace_minutes: Mapped[int] = mapped_column(Integer, default=10)
    late_deduction_rate: Mapped[float] = mapped_column(Float, default=0)


class Branch(Base):
    """A location of the store. Tickets belong to the branch they were rung up in."""

    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    address: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # The public handle behind this branch's QR menu link. Anyone holding it can
    # read the menu and send an order, so it is random instead of an id.
    menu_token: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SetupTask(Base):
    __tablename__ = "setup_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    key: Mapped[str] = mapped_column(String(60))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    title_ar: Mapped[str] = mapped_column(String(160))
    title_en: Mapped[str] = mapped_column(String(160))
    summary_ar: Mapped[str] = mapped_column(String(300), default="")
    summary_en: Mapped[str] = mapped_column(String(300), default="")
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    pending_orders: Mapped[int] = mapped_column(Integer, default=0)
    in_progress_orders: Mapped[int] = mapped_column(Integer, default=0)
    total_orders: Mapped[int] = mapped_column(Integer, default=0)
    available_tables: Mapped[int] = mapped_column(Integer, default=0)
    total_tables: Mapped[int] = mapped_column(Integer, default=0)
    sales_today: Mapped[float] = mapped_column(Float, default=0)
    sales_change: Mapped[float] = mapped_column(Float, default=0)


class RevenuePoint(Base):
    __tablename__ = "revenue_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)


class PopularItem(Base):
    __tablename__ = "popular_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="☕")
    orders: Mapped[int] = mapped_column(Integer, default=0)
    revenue: Mapped[float] = mapped_column(Float, default=0)


class ActivityRow(Base):
    __tablename__ = "activity_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    number: Mapped[str] = mapped_column(String(20))
    item_ar: Mapped[str] = mapped_column(String(120))
    item_en: Mapped[str] = mapped_column(String(120))
    unit_price: Mapped[float] = mapped_column(Float)
    table_name: Mapped[str] = mapped_column(String(40))
    qty: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20))
    placed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PaymentSplit(Base):
    __tablename__ = "payment_splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    method_ar: Mapped[str] = mapped_column(String(60))
    method_en: Mapped[str] = mapped_column(String(60))
    amount: Mapped[float] = mapped_column(Float, default=0)


class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="🍽️")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("menu_categories.id"), index=True
    )
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="🍽️")
    price: Mapped[float] = mapped_column(Float, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(8), default="g")
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    # Cached balance: `stock_movements` is the history that explains it.
    stock_qty: Mapped[float] = mapped_column(Float, default=0)
    # Restock threshold. 0 means "only warn when the shelf is empty".
    par_level: Mapped[float] = mapped_column(Float, default=0)


class RecipeLine(Base):
    __tablename__ = "recipe_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id"), index=True
    )
    qty: Mapped[float] = mapped_column(Float, default=0)


class Customer(Base):
    """A guest profile. Orders keep a plain customer_id so deleting is safe."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), default="")
    # Opaque public handle (32 hex characters). Anything that leaves the building
    # — a Wallet barcode, a guest-facing card link — carries this, never the id.
    qr_token: Mapped[str] = mapped_column(String(32), default="", index=True)
    email: Mapped[str] = mapped_column(String(160), default="")
    notes: Mapped[str] = mapped_column(String(240), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Staff(Base):
    """A team member. A row with a username and password can sign in."""

    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    # The location this person works in. 0 is the store itself, which is what an
    # admin and the platform owner are: they sit above every branch.
    branch_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), default="")
    # owner (the platform, across restaurants) / admin (one restaurant) /
    # manager / cashier / kitchen. Staff never manage accounts or the store
    # profile; that is the admin's and the owner's job.
    role: Mapped[str] = mapped_column(String(16), default="cashier")
    # Empty for a roster entry that has no sign-in (the seed still has those).
    username: Mapped[str] = mapped_column(String(60), default="", index=True)
    password_hash: Mapped[str] = mapped_column(String(200), default="")
    # Set when the first sign-in tour is finished or skipped.
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # The "try the demo" visitor: a live session over the sample store whose
    # writes the API refuses, so a prospect can walk every screen safely.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    # This person's own shift time, for the ones who do not start with the
    # store: an empty start (or empty grace) means "use the store's rule".
    shift_start: Mapped[str] = mapped_column(String(5), default="")
    shift_grace_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SoftwarePayment(Base):
    """One payment the platform owner collected from a restaurant.

    This is the owner's own income (what the software was sold for), completely
    apart from the restaurant's ticket sales. Monthly income is the sum of the
    rows whose `paid_on` falls in that month.
    """

    __tablename__ = "software_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    paid_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String(160), default="")
    created_by: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RestaurantInvite(Base):
    """A one-time activation link for a restaurant's first admin.

    The platform owner opens the restaurant and hands the link to whoever runs
    it; the holder sets their own name, username and password there, and that
    account becomes the restaurant's admin. `used_at` is what closes the link,
    so a forwarded link stops working after the store has been taken over.
    """

    __tablename__ = "restaurant_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuthSession(Base):
    """One signed-in browser. Only the token's fingerprint is stored."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Order(Base):
    """A POS order. Column names (status/channel/payment) are the contract."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    number: Mapped[str] = mapped_column(String(12))
    customer_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    # Plain integer like customer_id: deleting a branch never rewrites history.
    branch_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    channel: Mapped[str] = mapped_column(String(16), default="dine_in")
    table_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer_name: Mapped[str] = mapped_column(String(120), default="")
    # Where a delivery ticket goes; empty on every other channel.
    delivery_address: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(16), default="new")
    payment_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    note: Mapped[str] = mapped_column(String(240), default="")
    # Empty unless the caller sent an Idempotency-Key; unique per store when set.
    idempotency_key: Mapped[str] = mapped_column(String(64), default="", index=True)
    placed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditLog(Base):
    """Append-only: who did what to money, stock or access, and when.

    Nothing in the API updates or deletes a row here. `actor` is the caller's
    address until staff sign-in exists, then the authenticated staff member.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(40), default="")
    entity_id: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[str] = mapped_column(String(300), default="")
    actor: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class OrderItem(Base):
    """Name and price are snapshotted so editing the menu never rewrites history."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[int] = mapped_column(Integer, default=0)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="🍽️")
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    qty: Mapped[int] = mapped_column(Integer, default=1)


class StockMovement(Base):
    """Immutable ledger row: every change to an ingredient's on-hand amount.

    `order_id` is a plain integer (no foreign key) like `order_items.product_id`,
    so deleting a ticket never rewrites the stock history.
    """

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id"), index=True
    )
    delta: Mapped[float] = mapped_column(Float, default=0)
    reason: Mapped[str] = mapped_column(String(16), default="adjustment")
    order_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    note: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LoyaltyProgram(Base):
    """One row per store: the stamp card rules every member card follows."""

    __tablename__ = "loyalty_programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    stamps_target: Mapped[int] = mapped_column(Integer, default=8)
    points_per_currency: Mapped[float] = mapped_column(Float, default=2.0)
    reward_ar: Mapped[str] = mapped_column(String(80), default="قهوة مجانية")
    reward_en: Mapped[str] = mapped_column(String(80), default="Free coffee")


class LoyaltyCard(Base):
    """Enrolment and stamp progress; points are derived from the guest's tickets."""

    __tablename__ = "loyalty_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    customer_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    stamps: Mapped[int] = mapped_column(Integer, default=0)
    rewards_redeemed: Mapped[int] = mapped_column(Integer, default=0)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_stamp_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChecklistTask(Base):
    """A standing item on the store's daily checklist.

    `role` scopes the item to one position (count the drawer is not the
    kitchen's job); an empty role puts it on everybody's list.
    """

    __tablename__ = "checklist_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    title_ar: Mapped[str] = mapped_column(String(160))
    title_en: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(16), default="")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChecklistCheck(Base):
    """One member's tick on one task for one day.

    A row exists only while the box is ticked — unticking deletes it — so the
    table stays small and "not done" needs no second meaning. The unique
    constraint keeps a double tap from writing two rows.
    """

    __tablename__ = "checklist_checks"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "task_id", "staff_id", "work_date", name="ux_checklist_checks"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("checklist_tasks.id"), index=True
    )
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    # Who ticked it: the member themselves, or the manager on shift.
    done_by: Mapped[int] = mapped_column(Integer, default=0)
    done_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AttendanceShift(Base):
    """One arrival and the departure that closes it.

    A row is opened by a check-in and closed by a check-out, so a day's hours are
    the sum of its rows and a split shift needs no special case: check out, and
    the next arrival opens a second row. `checked_out_at` stays empty while the
    person is on the floor.
    """

    __tablename__ = "attendance_shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), index=True)
    # The calendar day the shift belongs to, so a past day reads as one board.
    work_date: Mapped[date] = mapped_column(Date, index=True)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Who tapped: the member themselves, or the manager at the counter tablet.
    opened_by: Mapped[int] = mapped_column(Integer, default=0)
    closed_by: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
