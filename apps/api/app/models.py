from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func
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
