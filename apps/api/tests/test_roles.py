"""Field-level hiding by role (SECURITY.md §3.2).

The till rings up tickets; what a plate costs, what the margin is and what the
food cost left behind are the manager's numbers. `deps.sees_cost()` reads the
role `auth.SessionGate` stamps on the request, so a cashier's payloads simply do
not carry those keys — and a price cannot be moved either.

Every check signs in with the seeded demo accounts (AGENTS.md) and changes
nothing: the write probes send values that are already stored, so a rejected
request is the only thing that could have altered a row.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.seed import ADMIN_PASSWORD, DEMO_LOGINS

CASHIER = next(username for _, username, role in DEMO_LOGINS if role == "cashier")
MANAGER = next(username for _, username, role in DEMO_LOGINS if role == "manager")

# A caller address of its own, so these sign-ins never spend the 10-a-minute
# budget the other suites' logins share.
LOGIN_HEADERS = {"x-forwarded-for": "198.51.100.23"}

COST_KEYS = ("cost", "margin", "margin_pct")


def signed_in(username: str) -> TestClient:
    """A client of its own per role; `close()` removes the session row again."""
    client = TestClient(app)
    client.__enter__()
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": ADMIN_PASSWORD},
        headers=LOGIN_HEADERS,
    )
    assert response.status_code == 200, response.text
    return client


def close(client: TestClient) -> None:
    client.post("/api/auth/logout")
    client.__exit__(None, None, None)


def test_a_cashier_payload_carries_no_cost():
    client = signed_in(CASHIER)
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


def test_a_cashier_cannot_move_a_price():
    client = signed_in(CASHIER)
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


def test_a_manager_still_sees_the_money():
    client = signed_in(MANAGER)
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
