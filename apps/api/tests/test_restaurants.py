"""Restaurants an admin opens, and the accounts that belong to them.

An admin is a platform-level role: they pick which restaurant a new account
belongs to, so one person can run several restaurants. Sign-in has no store
picker, so account names are unique across all of them.

Every row this test writes is created with a unique name and removed again, so
the seeded store is left at 1 tenant / 6 staff.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api pytest tests -q
"""

import uuid

from sqlalchemy import text

from app.db import SessionLocal
from app.models import Staff, Tenant

# A caller address of its own, so the sign-in budget of the other suites is
# never spent here.
CALLER = {"x-forwarded-for": "203.0.113.9"}


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def drop_restaurant(db, staff_id: int, tenant_id: int) -> None:
    """Remove the account, its sessions, the audit rows and the restaurant."""
    if staff_id:
        db.execute(
            text("DELETE FROM auth_sessions WHERE staff_id = :id"), {"id": staff_id}
        )
        db.execute(
            text("DELETE FROM audit_logs WHERE entity = 'staff' AND entity_id = :id"),
            {"id": staff_id},
        )
        db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": staff_id})
    if tenant_id:
        db.execute(
            text("DELETE FROM audit_logs WHERE tenant_id = :id"), {"id": tenant_id}
        )
        db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
    db.commit()


def test_an_admin_opens_a_restaurant_and_creates_its_account(client, anonymous):
    name = scratch("Bistro")
    username = scratch("owner")
    tenant_id = 0
    staff_id = 0
    db = SessionLocal()
    try:
        created = client.post(
            "/api/restaurants", json={"name_ar": name, "name_en": name}
        )
        assert created.status_code == 201, created.text
        restaurant = created.json()["created"]
        tenant_id = restaurant["id"]
        # The picker the page renders lists every restaurant, the new one last.
        listed = [row["id"] for row in created.json()["restaurants"]]
        assert tenant_id in listed and listed == sorted(listed)

        # A restaurant starts with an empty roster.
        empty = client.get(f"/api/team?restaurant_id={tenant_id}")
        assert empty.status_code == 200
        assert empty.json()["staff"] == []
        assert empty.json()["restaurant"]["id"] == tenant_id

        made = client.post(
            "/api/team",
            json={
                "name": "Bistro Owner",
                "role": "owner",
                "username": username,
                "password": "sufra1234",
                "restaurant_id": tenant_id,
            },
        )
        assert made.status_code == 201, made.text
        staff_id = next(
            row["id"] for row in made.json()["staff"] if row["username"] == username
        )
        assert made.json()["restaurant"]["id"] == tenant_id
        assert made.json()["summary"]["total"] == 1

        # The account signs in on its own and lands in its own restaurant.
        signed_in = anonymous.post(
            "/api/auth/login",
            json={"username": username, "password": "sufra1234"},
            headers=CALLER,
        )
        assert signed_in.status_code == 200, signed_in.text
        assert anonymous.get("/api/settings").json()["store"]["name_en"] == name
        own_team = anonymous.get("/api/team").json()
        assert [row["username"] for row in own_team["staff"]] == [username]
        # ... and it stays inside that restaurant.
        assert "restaurants" not in own_team
        home_id = client.get("/api/team").json()["restaurant"]["id"]
        assert anonymous.get(f"/api/team?restaurant_id={home_id}").status_code == 403
        assert anonymous.get("/api/restaurants").status_code == 403

        # Two restaurants cannot share a username: sign-in has no store picker.
        clash = client.post(
            "/api/team",
            json={
                "name": "Clash",
                "role": "cashier",
                "username": username,
                "password": "sufra1234",
            },
        )
        assert clash.status_code == 409
    finally:
        db.expire_all()
        drop_restaurant(db, staff_id, tenant_id)
        assert db.query(Tenant).count() == 1
        assert db.query(Staff).filter(Staff.username == username).count() == 0
        db.close()


def test_a_restaurant_needs_its_own_name(client):
    blank = client.post("/api/restaurants", json={"name_ar": "  ", "name_en": "X"})
    assert blank.status_code == 422
    name = scratch("Twin")
    created = client.post("/api/restaurants", json={"name_ar": name, "name_en": name})
    assert created.status_code == 201
    tenant_id = created.json()["created"]["id"]
    db = SessionLocal()
    try:
        twin = client.post(
            "/api/restaurants", json={"name_ar": name, "name_en": name}
        )
        assert twin.status_code == 409
    finally:
        db.expire_all()
        drop_restaurant(db, 0, tenant_id)
        db.close()
