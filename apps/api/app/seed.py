"""Idempotent schema creation + illustrative Phase 0 seed data."""

from datetime import date, datetime, timedelta

from .db import Base, SessionLocal, engine
from .models import (
    ActivityRow,
    DailyMetric,
    Ingredient,
    MenuCategory,
    Order,
    OrderItem,
    PaymentSplit,
    PopularItem,
    Product,
    RecipeLine,
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

# Phase 1: menu, ingredients and recipes. Costs are EGP per stored unit.
CATEGORIES = [
    ("قهوة ساخنة", "Hot Coffee", "☕"),
    ("مشروبات باردة", "Cold Drinks", "🧊"),
    ("حلويات", "Desserts", "🍰"),
    ("سندوتشات", "Sandwiches", "🥪"),
]

INGREDIENTS = [
    ("حبوب قهوة", "Coffee beans", "g", 0.45, 5000),
    ("حليب", "Milk", "ml", 0.038, 24000),
    ("سكر", "Sugar", "g", 0.022, 12000),
    ("صوص شوكولاتة", "Chocolate sauce", "ml", 0.12, 3000),
    ("كريمة خفق", "Whipping cream", "ml", 0.09, 4000),
    ("دقيق", "Flour", "g", 0.012, 15000),
    ("جبن كريمي", "Cream cheese", "g", 0.14, 4000),
    ("زبدة", "Butter", "g", 0.14, 3000),
    ("خبز توست", "Toast bread", "pc", 3.5, 120),
    ("جبن شيدر", "Cheddar cheese", "g", 0.24, 2500),
    ("طماطم", "Tomato", "g", 0.02, 5000),
    ("كوب ورقي", "Paper cup", "pc", 1.2, 800),
]

PRODUCTS = [
    ("Hot Coffee", "إسبريسو", "Espresso", "☕", 40.0, True, {"Coffee beans": 18, "Paper cup": 1}),
    ("Hot Coffee", "قهوة تركي", "Turkish Coffee", "☕", 35.0, True, {"Coffee beans": 10, "Sugar": 8, "Paper cup": 1}),
    ("Hot Coffee", "لاتيه", "Latte", "🥛", 55.0, True, {"Coffee beans": 18, "Milk": 200, "Paper cup": 1}),
    ("Hot Coffee", "كابتشينو", "Cappuccino", "☕", 50.0, True, {"Coffee beans": 18, "Milk": 120, "Paper cup": 1}),
    ("Cold Drinks", "آيس لاتيه", "Iced Latte", "🧊", 62.0, True, {"Coffee beans": 18, "Milk": 180, "Paper cup": 1}),
    ("Cold Drinks", "موكا مثلجة", "Iced Mocha", "🧋", 70.0, True, {"Coffee beans": 18, "Milk": 150, "Chocolate sauce": 30, "Whipping cream": 20, "Paper cup": 1}),
    ("Desserts", "تشيز كيك", "Cheesecake", "🍰", 65.0, True, {"Cream cheese": 90, "Sugar": 25, "Butter": 20, "Flour": 15}),
    ("Desserts", "كرواسون", "Croissant", "🥐", 30.0, True, {}),
    ("Sandwiches", "سندوتش جبن", "Cheese Sandwich", "🥪", 55.0, True, {"Toast bread": 2, "Cheddar cheese": 40, "Tomato": 30}),
    ("Sandwiches", "سندوتش فراخ", "Chicken Sandwich", "🍗", 65.0, False, {}),
]


# (channel, table, customer, status, payment, minutes ago, [(product_en, qty)])
DEMO_ORDERS = [
    ("dine_in", 7, "", "preparing", "cash", 24, [("Latte", 2), ("Cheesecake", 1)]),
    ("takeaway", None, "Mona", "new", "card", 6, [("Cappuccino", 1), ("Croissant", 2)]),
    (
        "delivery",
        None,
        "Ahmed",
        "new",
        "wallet",
        3,
        [("Iced Latte", 1), ("Cheese Sandwich", 1)],
    ),
    ("dine_in", 3, "", "served", "card", 55, [("Espresso", 2)]),
    ("dine_in", 12, "", "preparing", "cash", 14, [("Turkish Coffee", 2), ("Croissant", 1)]),
    ("takeaway", None, "", "served", "cash", 80, [("Latte", 1)]),
    ("dine_in", 5, "", "cancelled", None, 120, [("Cheesecake", 1)]),
    (
        "delivery",
        None,
        "Sara",
        "served",
        "card",
        95,
        [("Cappuccino", 2), ("Cheesecake", 1)],
    ),
]


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

        # Menu, ingredients and recipes are matched by English name so a
        # partial seed can be completed without duplicating rows.
        category_ids = {
            row.name_en: row.id
            for row in db.query(MenuCategory).filter_by(tenant_id=tenant.id).all()
        }
        for sort, (name_ar, name_en, emoji) in enumerate(CATEGORIES):
            if name_en in category_ids:
                continue
            category = MenuCategory(
                tenant_id=tenant.id,
                name_ar=name_ar,
                name_en=name_en,
                emoji=emoji,
                sort=sort,
            )
            db.add(category)
            db.flush()
            category_ids[name_en] = category.id

        ingredient_ids = {
            row.name_en: row.id
            for row in db.query(Ingredient).filter_by(tenant_id=tenant.id).all()
        }
        for name_ar, name_en, unit, unit_cost, stock_qty in INGREDIENTS:
            if name_en in ingredient_ids:
                continue
            ingredient = Ingredient(
                tenant_id=tenant.id,
                name_ar=name_ar,
                name_en=name_en,
                unit=unit,
                unit_cost=unit_cost,
                stock_qty=stock_qty,
            )
            db.add(ingredient)
            db.flush()
            ingredient_ids[name_en] = ingredient.id

        product_ids = {
            row.name_en: row.id
            for row in db.query(Product).filter_by(tenant_id=tenant.id).all()
        }
        for sort, (category_en, name_ar, name_en, emoji, price, available, _) in enumerate(
            PRODUCTS
        ):
            if name_en in product_ids:
                continue
            product = Product(
                tenant_id=tenant.id,
                category_id=category_ids[category_en],
                name_ar=name_ar,
                name_en=name_en,
                emoji=emoji,
                price=price,
                is_available=available,
                sort=sort,
            )
            db.add(product)
            db.flush()
            product_ids[name_en] = product.id

        products_with_recipe = {
            product_id
            for (product_id,) in db.query(RecipeLine.product_id)
            .filter(RecipeLine.tenant_id == tenant.id)
            .distinct()
            .all()
        }
        for _, _, name_en, _, _, _, recipe in PRODUCTS:
            product_id = product_ids[name_en]
            if not recipe or product_id in products_with_recipe:
                continue
            for ingredient_en, qty in recipe.items():
                db.add(
                    RecipeLine(
                        tenant_id=tenant.id,
                        product_id=product_id,
                        ingredient_id=ingredient_ids[ingredient_en],
                        qty=qty,
                    )
                )

        if db.query(Order).filter_by(tenant_id=tenant.id).count() == 0:
            catalog = {
                row.name_en: row
                for row in db.query(Product).filter_by(tenant_id=tenant.id).all()
            }
            now = datetime.now()
            for index, (
                channel,
                table_no,
                customer,
                status,
                payment,
                minutes,
                lines,
            ) in enumerate(DEMO_ORDERS):
                order = Order(
                    tenant_id=tenant.id,
                    number=str(1001 + index),
                    channel=channel,
                    table_no=table_no,
                    customer_name=customer,
                    status=status,
                    payment_method=payment,
                    placed_at=now - timedelta(minutes=minutes),
                )
                subtotal = 0.0
                items = []
                for name_en, qty in lines:
                    product = catalog[name_en]
                    subtotal += product.price * qty
                    items.append(
                        OrderItem(
                            tenant_id=tenant.id,
                            product_id=product.id,
                            name_ar=product.name_ar,
                            name_en=product.name_en,
                            emoji=product.emoji,
                            unit_price=product.price,
                            qty=qty,
                        )
                    )
                order.subtotal = round(subtotal, 2)
                order.tax = round(subtotal * tenant.tax_rate / 100, 2)
                order.total = round(order.subtotal + order.tax, 2)
                db.add(order)
                db.flush()
                for item in items:
                    item.order_id = order.id
                    db.add(item)

        db.commit()
        print("seed: ok")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
