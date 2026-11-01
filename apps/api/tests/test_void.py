"""The manager's PIN, and what it signs: a void (SECURITY.md §P2).

On a shared till the session is whoever is standing there, so a ticket is
cancelled only against a manager's PIN. `POST /api/auth/pin` answers a one-time
token, and the void that carries it keeps the approver's name and the reason —
one approval, one ticket. The PIN is not a sign-in: it opens nothing by itself.

The suite makes its own manager with a PIN and its own tickets, and removes both.
Run it inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
"""

import uuid

import pytest
from sqlalchemy import text

from app.auth import hash_password
from app.models import Staff

PIN = "4821"
# A caller address of its own: the PIN endpoint has its own 10-a-minute budget.
PIN_HEADERS = {"x-forwarded-for": "198.51.100.44"}

def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"

def store_id(db) -> int:
    return db.execute(text("SELECT id FROM tenants ORDER BY id LIMIT 1")).scalar()

@pytest.fixture()
def manager(db):
    """A manager of the seeded store who holds a PIN, removed afterwards."""
    row = Staff(
        tenant_id=store_id(db),
        name=scratch("Pin check manager"),
        phone="",
        role="manager",
        is_active=True,
        pin_hash=hash_password(PIN),
    )
    db.add(row)
    db.commit()
    yield row
    db.execute(text("DELETE FROM pin_grants WHERE staff_id = :id"), {"id": row.id})
    db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": row.id})
    db.commit()

def make_ticket(client) -> int:
    """A takeaway ticket of our own, so nothing seeded is voided."""
    product = client.get("/api/pos").json()["products"][0]
    created = client.post(
        "/api/orders",
        json={
            "channel": "takeaway",
            "items": [{"product_id": product["id"], "qty": 1}],
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]

def drop_ticket(db, order_id: int) -> None:
    db.execute(text("DELETE FROM order_items WHERE order_id = :id"), {"id": order_id})
    db.execute(
        text("DELETE FROM audit_logs WHERE entity_id = :id AND entity = 'order'"),
        {"id": order_id},
    )
    db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
    db.commit()

def test_a_void_needs_a_manager_pin(client, db, manager):
    first = make_ticket(client)
    second = make_ticket(client)
    try:
        # The till's own session is not enough: somebody has to sign for it.
        refused = client.patch(f"/api/orders/{first}", json={"status": "cancelled"})
        assert refused.status_code == 403, refused.text
        assert "PIN" in refused.json()["detail"]

        wrong = client.post("/api/auth/pin", json={"pin": "0000"}, headers=PIN_HEADERS)
        assert wrong.status_code == 401, wrong.text

        approved = client.post(
            "/api/auth/pin", json={"pin": PIN}, headers=PIN_HEADERS
        )
        assert approved.status_code == 200, approved.text
        grant = approved.json()
        assert grant["name"] == manager.name
        assert grant["role"] == "manager"

        voided = client.patch(
            f"/api/orders/{first}",
            json={"status": "cancelled", "reason": "guest left"},
            headers={"x-approval": grant["token"]},
        )
        assert voided.status_code == 200, voided.text
        body = voided.json()
        assert body["status"] == "cancelled"
        # The ticket itself remembers who signed and why.
        assert body["voided_by"] == manager.name
        assert body["void_reason"] == "guest left"

        # One slip, one ticket: the same approval cannot void another.
        reused = client.patch(
            f"/api/orders/{second}",
            json={"status": "cancelled"},
            headers={"x-approval": grant["token"]},
        )
        assert reused.status_code == 403, reused.text

        trail = db.execute(
            text(
                "SELECT detail, actor FROM audit_logs"
                " WHERE entity = 'order' AND entity_id = :id AND action = 'order.cancelled'"
            ),
            {"id": first},
        ).first()
        assert trail is not None
        assert manager.name in trail.detail
        # The trail names the person who signed, not just the tablet's address.
        assert trail.actor
    finally:
        drop_ticket(db, first)
        drop_ticket(db, second)

def test_a_pin_belongs_to_a_manager_only(client, db):
    cashier = Staff(
        tenant_id=store_id(db),
        name=scratch("Pin check cashier"),
        phone="",
        role="cashier",
        is_active=True,
    )
    db.add(cashier)
    db.commit()
    try:
        refused = client.patch(f"/api/team/{cashier.id}", json={"pin": "1234"})
        assert refused.status_code == 422, refused.text
        assert "PIN" in refused.json()["detail"]

        # A manager can take one, and clear it again.
        made = client.patch(
            f"/api/team/{cashier.id}", json={"role": "manager", "pin": "1234"}
        )
        assert made.status_code == 200, made.text
        row = next(
            member for member in made.json()["staff"] if member["id"] == cashier.id
        )
        assert row["has_pin"] is True

        cleared = client.patch(f"/api/team/{cashier.id}", json={"pin": ""})
        assert cleared.status_code == 200, cleared.text
        row = next(
            member for member in cleared.json()["staff"] if member["id"] == cashier.id
        )
        assert row["has_pin"] is False
    finally:
        db.execute(
            text("DELETE FROM audit_logs WHERE entity_id = :id AND entity = 'staff'"),
            {"id": cashier.id},
        )
        db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": cashier.id})
        db.commit()
