"""Security checks from the hardening plan, adapted to this REST API.

Base44-entity specifics — RLS, field-level security, entity update rules — have no
counterpart here: this is FastAPI + Postgres and every query is scoped by the
tenant the API resolves from the database, never from the request body. What *is*
testable is the HTTP surface: server-side money, tenant scoping of ids, validation,
idempotency, ledger immutability, the audit trail and the app-level rate limits.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api pytest -q

Every test creates rows with a unique name and deletes exactly those rows again.
"""

import uuid

import pytest
from sqlalchemy import text

from app.main import app
from app.models import (
    AuditLog,
    Customer,
    Ingredient,
    MenuCategory,
    Order,
    OrderItem,
    Product,
    RecipeLine,
    StockMovement,
    Tenant,
)
from app.wallet import _object_payload
from conftest import RATE_LIMIT_CALLER


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def first_category(client) -> int:
    return client.get("/api/menu").json()["categories"][0]["id"]


def first_sellable(client) -> dict:
    products = client.get("/api/pos").json()["products"]
    assert products, "the seeded menu should have something to sell"
    return products[0]


def drop_order(db, order_id: int) -> None:
    """Remove a test ticket and everything the flow wrote around it."""
    db.execute(
        text("DELETE FROM stock_movements WHERE order_id = :id"), {"id": order_id}
    )
    db.execute(text("DELETE FROM order_items WHERE order_id = :id"), {"id": order_id})
    db.execute(text("DELETE FROM audit_logs WHERE entity_id = :id"), {"id": order_id})
    db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
    db.commit()


# ------------------------------------------------------------------ headers


def test_security_headers_on_api(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    # Tenant data is personal data: no shared cache, and never framed.
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-frame-options"] == "DENY"


# ------------------------------------------------------- money is server-side


def test_order_totals_are_recomputed_not_taken_from_the_client(client, db):
    product = first_sellable(client)
    created = client.post(
        "/api/orders",
        json={
            "channel": "takeaway",
            # Every one of these is a lie the server must ignore.
            "total": 1,
            "subtotal": 1,
            "tax": 0,
            "items": [{"product_id": product["id"], "qty": 2, "price": 1, "unit_price": 1}],
        },
    )
    assert created.status_code == 201
    order = created.json()
    try:
        expected = round(product["price"] * 2, 2)
        assert order["subtotal"] == pytest.approx(expected)
        assert order["total"] > 1
        assert order["items"][0]["unit_price"] == pytest.approx(product["price"])
    finally:
        drop_order(db, order["id"])


@pytest.mark.parametrize("qty", [0, -1, 100, 1.5, None, {"$ne": 1}])
def test_order_rejects_bad_quantities(client, qty):
    product = first_sellable(client)
    response = client.post(
        "/api/orders",
        json={"channel": "takeaway", "items": [{"product_id": product["id"], "qty": qty}]},
    )
    assert response.status_code == 422


def test_dine_in_without_a_table_is_refused(client):
    product = first_sellable(client)
    response = client.post(
        "/api/orders",
        json={"channel": "dine_in", "items": [{"product_id": product["id"], "qty": 1}]},
    )
    assert response.status_code == 400


@pytest.mark.parametrize("name", [{"$ne": None}, ["a", "b"], 5])
def test_operator_style_payloads_never_reach_the_query(client, name):
    product = first_sellable(client)
    response = client.post(
        "/api/orders",
        json={
            "channel": "takeaway",
            "customer_name": name,
            "items": [{"product_id": product["id"], "qty": 1}],
        },
    )
    assert response.status_code == 422


# ----------------------------------------------------------- tenant scoping


@pytest.fixture()
def other_tenant(db):
    """A second store in the same database, removed again afterwards."""
    tenant = Tenant(name_ar=scratch("متجر"), name_en=scratch("Store"))
    db.add(tenant)
    db.flush()
    category = MenuCategory(tenant_id=tenant.id, name_ar="قسم", name_en="Cat")
    db.add(category)
    db.flush()
    product = Product(
        tenant_id=tenant.id,
        category_id=category.id,
        name_ar="منتج",
        name_en="Elsewhere",
        price=10,
    )
    db.add(product)
    db.commit()
    yield {"tenant_id": tenant.id, "product_id": product.id, "category_id": category.id}
    db.execute(text("DELETE FROM products WHERE id = :id"), {"id": product.id})
    db.execute(text("DELETE FROM menu_categories WHERE id = :id"), {"id": category.id})
    db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant.id})
    db.commit()


def test_another_stores_products_are_invisible_and_untouchable(client, other_tenant):
    menu = client.get("/api/menu").json()
    assert other_tenant["product_id"] not in [row["id"] for row in menu["products"]]

    # Ids from another store answer exactly like ids that do not exist.
    assert (
        client.patch(
            f"/api/menu/products/{other_tenant['product_id']}", json={"price": 1}
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/menu/products/{other_tenant['product_id']}").status_code
        == 404
    )
    assert (
        client.get(f"/api/menu/products/{other_tenant['product_id']}/recipe").status_code
        == 404
    )


def test_cannot_order_another_stores_product(client, other_tenant):
    response = client.post(
        "/api/orders",
        json={
            "channel": "takeaway",
            "items": [{"product_id": other_tenant["product_id"], "qty": 1}],
        },
    )
    assert response.status_code == 400


# ------------------------------------------------------------- idempotency


def test_a_retried_send_returns_the_same_ticket(client, db):
    product = first_sellable(client)
    key = scratch("idem")
    body = {"channel": "takeaway", "items": [{"product_id": product["id"], "qty": 1}]}

    first = client.post("/api/orders", json=body, headers={"Idempotency-Key": key})
    second = client.post("/api/orders", json=body, headers={"Idempotency-Key": key})
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    try:
        assert db.query(Order).filter(Order.idempotency_key == key).count() == 1
    finally:
        drop_order(db, first.json()["id"])


def test_two_different_keys_make_two_tickets(client, db):
    product = first_sellable(client)
    body = {"channel": "takeaway", "items": [{"product_id": product["id"], "qty": 1}]}
    first = client.post("/api/orders", json=body, headers={"Idempotency-Key": scratch("k")})
    second = client.post("/api/orders", json=body, headers={"Idempotency-Key": scratch("k")})
    try:
        assert first.json()["id"] != second.json()["id"]
    finally:
        drop_order(db, first.json()["id"])
        drop_order(db, second.json()["id"])


# ------------------------------------------- serving a ticket moves stock once


def test_serving_deducts_once_and_leaves_a_trail(client, db):
    ingredient = Ingredient(
        tenant_id=db.query(Tenant).first().id,
        name_ar="مكون",
        name_en=scratch("TestBeans"),
        unit="g",
        unit_cost=1.0,
        stock_qty=1000,
    )
    db.add(ingredient)
    db.flush()
    product = Product(
        tenant_id=ingredient.tenant_id,
        category_id=first_category(client),
        name_ar="صنف",
        name_en=scratch("TestPlate"),
        price=50,
    )
    db.add(product)
    db.flush()
    db.add(
        RecipeLine(
            tenant_id=ingredient.tenant_id,
            product_id=product.id,
            ingredient_id=ingredient.id,
            qty=2,
        )
    )
    db.commit()

    created = client.post(
        "/api/orders",
        json={"channel": "takeaway", "items": [{"product_id": product.id, "qty": 1}]},
    ).json()
    order_id = created["id"]
    try:
        # New tickets go to the kitchen before they are served.
        assert client.patch(f"/api/orders/{order_id}", json={"status": "preparing"}).status_code == 200
        assert client.patch(f"/api/orders/{order_id}", json={"status": "served"}).status_code == 200
        db.expire_all()
        assert db.get(Ingredient, ingredient.id).stock_qty == pytest.approx(998)

        # A served ticket is final: a second serve cannot deduct again.
        assert client.patch(f"/api/orders/{order_id}", json={"status": "served"}).status_code == 409
        db.expire_all()
        assert db.get(Ingredient, ingredient.id).stock_qty == pytest.approx(998)
        assert (
            db.query(StockMovement)
            .filter(StockMovement.order_id == order_id, StockMovement.reason == "sale")
            .count()
            == 1
        )

        trail = client.get("/api/audit").json()["entries"]
        assert any(
            entry["action"] == "order.served" and entry["entity_id"] == order_id
            for entry in trail
        )
    finally:
        drop_order(db, order_id)
        db.execute(text("DELETE FROM recipe_lines WHERE product_id = :id"), {"id": product.id})
        db.execute(
            text("DELETE FROM stock_movements WHERE ingredient_id = :id"),
            {"id": ingredient.id},
        )
        db.execute(text("DELETE FROM products WHERE id = :id"), {"id": product.id})
        db.execute(text("DELETE FROM ingredients WHERE id = :id"), {"id": ingredient.id})
        db.commit()


def test_ledger_and_trail_have_no_write_routes():
    """Append-only is a property of the routing table, not of a convention."""
    guarded = ("/movements", "/api/audit")
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = set(getattr(route, "methods", set()) or set())
        if any(path.startswith(prefix) for prefix in guarded) or path.endswith("/movements"):
            assert methods <= {"GET", "POST"}, f"{path} accepts {methods}"


# ------------------------------------------------------------- guest handles


def test_customer_gets_an_opaque_handle_and_passes_carry_it(client, db):
    name = scratch("QA Guest")
    client.post("/api/customers", json={"name": name})
    row = db.query(Customer).filter(Customer.name == name).first()
    try:
        assert row is not None
        assert len(row.qr_token) == 32
        int(row.qr_token, 16)  # hex, so nothing but randomness gets in

        payload = _object_payload(
            {"issuer": "3388000000022000000"},
            card_id=7,
            customer_token=row.qr_token,
            customer_name=row.name,
            points=10,
            stamps=2,
            target=8,
            reward="قهوة مجانية",
        )
        # The printed barcode must not be the guest's row id.
        assert payload["barcode"]["value"] == f"sufra-{row.qr_token}"
        assert payload["barcode"]["value"] != f"sufra-{row.id}"
        # Nor any padded or hex spelling of it: the handle is pure randomness.
        # Not a substring check — a short id like "21" occurs by chance inside a
        # random 32-hex token about one run in nine.
        assert row.qr_token not in {str(row.id), f"{row.id:032d}", f"{row.id:032x}"}
        assert payload["accountId"] == row.qr_token
        # A pass is a public object: no phone number, no email.
        assert "phone" not in str(payload).lower()
        assert "@" not in str(payload)
    finally:
        db.execute(text("DELETE FROM customers WHERE name = :name"), {"name": name})
        db.commit()


# ------------------------------------------------------------- rate limits


def test_export_is_rate_limited(client):
    """The books leave in a spreadsheet; past five an hour is an accident."""
    codes = [
        client.get("/api/reports/export.csv?days=7", headers=RATE_LIMIT_CALLER).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [200] * 5
    assert codes[-1] == 429

    blocked = client.get("/api/reports/export.csv?days=7", headers=RATE_LIMIT_CALLER)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "3600"
    assert "Too many requests" in blocked.json()["detail"]
