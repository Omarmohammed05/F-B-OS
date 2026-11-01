"""Field-level hiding by role (SECURITY.md §3.2).

The till rings up tickets; what a plate costs, what the margin is and what the
food cost left behind are the manager's numbers. `deps.sees_cost()` reads the
role `auth.SessionGate` stamps on the request, so a cashier's payloads simply do
not carry those keys — and a price cannot be moved either.

The seed ships no per-role sign-ins (a production store starts with the owner
alone), so this suite makes a cashier and a manager of its own and removes them
with their sessions afterwards. The write probes send values that are already
stored, so a rejected request is the only thing that could have altered a row.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import hash_password
from app.db import SessionLocal
from app.main import app
from app.models import Staff
from app.seed import OWNER_PASSWORD

PASSWORD = OWNER_PASSWORD

# A caller address of its own, so these sign-ins never spend the 10-a-minute
# budget the other suites' logins share.
LOGIN_HEADERS = {"x-forwarded-for": "198.51.100.23"}

COST_KEYS = ("cost", "margin", "margin_pct")


@pytest.fixture(scope="module")
def accounts():
    """One scratch account per role, removed again when the module is done."""
    db = SessionLocal()
    tenant_id = db.execute(text("SELECT id FROM tenants ORDER BY id LIMIT 1")).scalar()
    made = []
    try:
        for role in ("cashier", "manager"):
            row = Staff(
                tenant_id=tenant_id,
                name=f"Role check {role}",
                phone="",
                role=role,
                is_active=True,
                username=f"role-{role}-{uuid.uuid4().hex[:8]}",
                password_hash=hash_password(PASSWORD),
            )
            db.add(row)
            db.flush()
            made.append(row)
        db.commit()
        yield {row.role: row for row in made}
    finally:
        for row in made:
            db.execute(
                text("DELETE FROM auth_sessions WHERE staff_id = :id"), {"id": row.id}
            )
            db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": row.id})
        db.commit()
        db.close()


def signed_in(username: str) -> TestClient:
    """A client of its own per role; `close()` removes the session row again."""
    client = TestClient(app)
    client.__enter__()
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": PASSWORD},
        headers=LOGIN_HEADERS,
    )
    assert response.status_code == 200, response.text
    return client


def close(client: TestClient) -> None:
    client.post("/api/auth/logout")
    client.__exit__(None, None, None)


def test_a_cashier_payload_carries_no_cost(accounts):
    client = signed_in(accounts["cashier"].username)
    try:
        menu = client.get("/api/menu")
        assert menu.status_code == 200, menu.text
        body = menu.json()
        assert body["products"], "the seeded store has products"
        for product in body["products"]:
            for key in COST_KEYS:
                assert key not in product, f"cashier saw {key}"
        assert "avg_margin_pct" not in body["summary"]

        inventory = client.get("/api/ingredients").json()
        assert inventory["ingredients"]
        for ingredient in inventory["ingredients"]:
            assert "unit_cost" not in ingredient

        report = client.get("/api/reports?days=7").json()
        for key in ("food_cost", "gross_margin", "gross_margin_pct", "food_cost_pct"):
            assert key not in report["totals"]
        for point in report["series"]:
            assert "food_cost" not in point
        # Sales are still the cashier's own work, so they stay on the payload.
        assert "revenue" in report["totals"]
    finally:
        close(client)


def test_a_cashier_cannot_move_a_price(accounts):
    client = signed_in(accounts["cashier"].username)
    try:
        product = client.get("/api/menu").json()["products"][0]
        moved = client.patch(
            f"/api/menu/products/{product['id']}",
            json={"price": product["price"] + 1},
        )
        assert moved.status_code == 403, moved.text

        # Availability is operational, so the same account keeps that control:
        # the payload carries no new price, only the state it already has.
        kept = client.patch(
            f"/api/menu/products/{product['id']}",
            json={"price": product["price"], "is_available": product["is_available"]},
        )
        assert kept.status_code == 200, kept.text
        assert kept.json()["products"][0]["price"] == product["price"]

        created = client.post(
            "/api/menu/products",
            json={
                "category_id": product["category_id"],
                "name_ar": "منتج اختبار",
                "name_en": "Role test product",
                "emoji": "🍽️",
                "price": 10,
            },
        )
        assert created.status_code == 403, created.text
    finally:
        close(client)


def test_a_manager_still_sees_the_money(accounts):
    client = signed_in(accounts["manager"].username)
    try:
        product = client.get("/api/menu").json()["products"][0]
        for key in COST_KEYS:
            assert key in product
        report = client.get("/api/reports?days=7").json()
        assert "food_cost" in report["totals"]
        # ...and may move a price back to the value it already has, which is the
        # one write this check needs to prove the guard is role-based.
        same = client.patch(
            f"/api/menu/products/{product['id']}", json={"price": product["price"]}
        )
        assert same.status_code == 200, same.text
    finally:
        close(client)
