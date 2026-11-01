"""Activation links: how a new restaurant's admin takes the store over.

The platform owner opens a restaurant and hands it over with a link, so nobody
types a password on somebody else's behalf. The link is public (its holder has
no account yet), one use only, and the account it creates is that restaurant's
admin — inside its own store and nowhere else.

Every row here is created with a unique name and removed again, so the seeded
platform goes back to 1 tenant / 6 staff / 0 invites.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
"""

import uuid

from sqlalchemy import text

from app.db import SessionLocal
from app.deps import set_request_tenant
from app.models import Staff, Tenant

# Its own caller address, so this suite never spends another one's budget.
CALLER = {"x-forwarded-for": "203.0.113.11"}


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def drop_restaurant(db, staff_id: int, tenant_id: int) -> None:
    """The account, its sessions, the link, the audit rows and the restaurant."""
    if staff_id:
        db.execute(
            text("DELETE FROM auth_sessions WHERE staff_id = :id"), {"id": staff_id}
        )
        db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": staff_id})
    if tenant_id:
        db.execute(
            text("DELETE FROM restaurant_invites WHERE tenant_id = :id"),
            {"id": tenant_id},
        )
        db.execute(
            text("DELETE FROM audit_logs WHERE tenant_id = :id"), {"id": tenant_id}
        )
        db.execute(
            text(
                "DELETE FROM audit_logs WHERE entity = 'tenant' AND entity_id = :id"
            ),
            {"id": tenant_id},
        )
        db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
    db.commit()


def test_a_new_restaurant_is_handed_over_with_a_link(client, anonymous):
    name = scratch("Handover")
    username = scratch("holder")
    tenant_id = 0
    staff_id = 0
    db = SessionLocal()
    try:
        created = client.post(
            "/api/restaurants",
            json={"name_ar": name, "name_en": name, "software_price": 750},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        restaurant = next(row for row in body["restaurants"] if row["name_en"] == name)
        tenant_id = restaurant["id"]
        # The create says which row it made, and that row carries the link.
        assert body["created_id"] == tenant_id
        assert restaurant["admin"] is None
        token = restaurant["invite_token"]
        assert len(token) == 32

        # The link opens in a browser with no session at all.
        preview = anonymous.get(f"/api/invites/{token}")
        assert preview.status_code == 200, preview.text
        assert preview.json()["restaurant_en"] == name
        assert preview.json()["is_used"] is False

        # Accepting it creates the restaurant's admin and signs them in.
        accepted = anonymous.post(
            f"/api/invites/{token}",
            json={
                "name": "Holder Admin",
                "username": username,
                "password": "sufra1234",
            },
            headers=CALLER,
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["role"] == "admin"
        staff_id = accepted.json()["id"]
        # That admin is inside its own restaurant from the first request, and
        # has no way to reach the platform.
        assert anonymous.get("/api/settings").json()["store"]["name_en"] == name
        assert anonymous.get("/api/restaurants").status_code == 403

        # The link is spent: reading it says so, accepting it creates nothing.
        assert anonymous.get(f"/api/invites/{token}").json()["is_used"] is True
        reused = anonymous.post(
            f"/api/invites/{token}",
            json={"username": scratch("second"), "password": "sufra1234"},
            headers=CALLER,
        )
        assert reused.status_code == 409

        # The list now names the admin, and holds no live link for that store.
        listed = client.get("/api/restaurants").json()["restaurants"]
        row = next(item for item in listed if item["id"] == tenant_id)
        assert row["admin"]["username"] == username
        assert row["invite_token"] == ""
        # A restaurant that already has an admin gets no second link.
        assert client.post(f"/api/restaurants/{tenant_id}/invite").status_code == 409
    finally:
        # Sign-in resolves the caller's restaurant into a context variable on a
        # shared thread, so put it back before the next test runs.
        set_request_tenant(None)
        db.expire_all()
        drop_restaurant(db, staff_id, tenant_id)
        assert db.query(Tenant).count() == 1
        assert db.query(Staff).filter(Staff.username == username).count() == 0
        db.close()


def test_a_fresh_link_replaces_the_old_one(client):
    """Re-sending the handover kills the previous link instead of leaving two."""
    name = scratch("Relink")
    created = client.post("/api/restaurants", json={"name_ar": name, "name_en": name})
    assert created.status_code == 201, created.text
    row = next(
        item for item in created.json()["restaurants"] if item["name_en"] == name
    )
    tenant_id = row["id"]
    old = row["invite_token"]
    db = SessionLocal()
    try:
        refreshed = client.post(f"/api/restaurants/{tenant_id}/invite")
        assert refreshed.status_code == 200, refreshed.text
        row = next(
            item
            for item in refreshed.json()["restaurants"]
            if item["id"] == tenant_id
        )
        assert row["invite_token"] and row["invite_token"] != old
        # The superseded link is gone for good.
        assert client.get(f"/api/invites/{old}").status_code == 404
        assert client.get(f"/api/invites/{row['invite_token']}").status_code == 200
    finally:
        set_request_tenant(None)
        db.expire_all()
        drop_restaurant(db, 0, tenant_id)
        db.close()
