"""Idempotent schema creation + illustrative Phase 0 seed data."""

from datetime import date, datetime, timedelta

from .db import Base, SessionLocal, engine
from .models import (
    ActivityRow,
    DailyMetric,
    PaymentSplit,
    PopularItem,
    RevenuePoint,
    SetupTask,
    Tenant,
)

TENANT = dict(
    name_ar="بيت القهوة",
    name_en="Qahwa House",
    accent_color="#0A84FF",
    plan="Control",
    currency="EGP",
    tax_rate=14.0,
    default_language="ar",
)

SETUP_TASKS = [
    (
        "store_details",
        "بيانات المتجر",
        "Store details",
        "الاسم والشعار واللون الأساسي للمتجر.",
        "Name, logo and the store accent color.",
        True,
    ),
    (
        "branch",
        "الفرع والعنوان",
        "Branch & address",
        "أضف الفرع الأول وساعات العمل والضرائب.",
        "Add your first branch, opening hours and tax rate.",
        True,
    ),
    (
        "menu",
        "المنيو والأقسام",
        "Menu & categories",
        "أنشئ الأقسام والمنتجات والأسعار بالعربية والإنجليزية.",
        "Create categories, products and prices in Arabic and English.",
        True,
    ),
    (
        "recipes",
        "الوصفات والتكلفة",
        "Recipes & food cost",
        "اربط كل منتج بمكوناته لحساب تكلفة الطبق تلقائيًا.",
        "Link each product to its ingredients to track plate cost.",
        True,
    ),
    (
        "tables",
        "الطاولات وأكواد QR",
        "Tables & QR codes",
        "رتّب الطاولات واطبع ستاندات QR للطلب الذاتي.",
        "Lay out tables and print QR stands for self-ordering.",
        True,
    ),
    (
        "team",
        "فريق العمل والأدوار",
        "Team & roles",
        "أضف الكاشير والمطبخ وحدد صلاحيات كل دور.",
        "Invite cashiers and kitchen staff, then set their roles.",
        True,
    ),
    (
        "whatsapp",
        "تقارير واتساب",
        "WhatsApp reports",
        "استلم تقرير إغلاق اليوم على واتساب.",
        "Receive the end-of-day report on WhatsApp.",
        False,
    ),
]

POPULAR = [
    ("قهوة تركي", "Turkish Coffee", "☕", 129, 1935.0),
    ("لاتيه", "Latte", "🥛", 118, 2714.0),
    ("شاي بالنعناع", "Mint Tea", "🍵", 96, 1152.0),
    ("تشيز كيك", "Cheesecake", "🍰", 89, 1335.0),
]

ACTIVITY = [
    ("#1042", "لاتيه", "Latte", 42.0, "طاولة 4", 2, "preparing", 4),
    ("#1041", "تشيز كيك", "Cheesecake", 38.0, "تيك أواي", 1, "served", 9),
    ("#1040", "قهوة تركي", "Turkish Coffee", 28.0, "طاولة 2", 3, "served", 14),
    ("#1039", "عصير مانجو", "Mango Juice", 35.0, "طاولة 7", 1, "cancelled", 21),
    ("#1038", "كرواسون", "Croissant", 26.0, "تيك أواي", 2, "served", 27),
]

PAYMENTS = [
    ("كاش", "Cash", 5400.0),
    ("بطاقة", "Card", 2800.0),
    ("محفظة إلكترونية", "E-wallet", 1231.42),
]

REVENUE = [6120.0, 7480.0, 5960.0, 8340.0, 7015.0, 9120.0, 9431.42]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).first()
        if tenant is None:
            tenant = Tenant(**TENANT)
            db.add(tenant)
            db.flush()

        if db.query(SetupTask).filter_by(tenant_id=tenant.id).count() == 0:
            for sort, (key, ar, en, sum_ar, sum_en, done) in enumerate(SETUP_TASKS):
                db.add(
                    SetupTask(
                        tenant_id=tenant.id,
                        key=key,
                        sort=sort,
                        title_ar=ar,
                        title_en=en,
                        summary_ar=sum_ar,
                        summary_en=sum_en,
                        is_done=done,
                    )
                )

        if db.query(DailyMetric).filter_by(tenant_id=tenant.id).count() == 0:
            db.add(
                DailyMetric(
                    tenant_id=tenant.id,
                    pending_orders=12,
                    in_progress_orders=5,
                    total_orders=148,
                    available_tables=17,
                    total_tables=30,
                    sales_today=9431.42,
                    sales_change=5.6,
                )
            )

        if db.query(PopularItem).filter_by(tenant_id=tenant.id).count() == 0:
            for sort, (ar, en, emoji, orders, revenue) in enumerate(POPULAR):
                db.add(
                    PopularItem(
                        tenant_id=tenant.id,
                        sort=sort,
                        name_ar=ar,
                        name_en=en,
                        emoji=emoji,
                        orders=orders,
                        revenue=revenue,
                    )
                )

        if db.query(ActivityRow).filter_by(tenant_id=tenant.id).count() == 0:
            now = datetime.now()
            for number, item_ar, item_en, price, table, qty, status, mins in ACTIVITY:
                db.add(
                    ActivityRow(
                        tenant_id=tenant.id,
                        number=number,
                        item_ar=item_ar,
                        item_en=item_en,
                        unit_price=price,
                        table_name=table,
                        qty=qty,
                        status=status,
                        placed_at=now - timedelta(minutes=mins),
                    )
                )

        if db.query(PaymentSplit).filter_by(tenant_id=tenant.id).count() == 0:
            for ar, en, amount in PAYMENTS:
                db.add(
                    PaymentSplit(
                        tenant_id=tenant.id, method_ar=ar, method_en=en, amount=amount
                    )
                )

        if db.query(RevenuePoint).filter_by(tenant_id=tenant.id).count() == 0:
            today = date.today()
            for offset, amount in enumerate(REVENUE):
                db.add(
                    RevenuePoint(
                        tenant_id=tenant.id,
                        day=today - timedelta(days=len(REVENUE) - 1 - offset),
                        amount=amount,
                    )
                )

        db.commit()
        print("seed: ok")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
