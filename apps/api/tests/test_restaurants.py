"""Restaurants the platform owner opens, and the admin each one gets.

`owner` is the platform role: it opens restaurants, bills them, blocks and
removes them, and it is the only role that can hand out the platform role
itself. `admin` runs one restaurant and cannot reach any other. Sign-in has no
store picker, so account names are unique across all of them.

Every row this test writes is created with a unique name and removed again, so
the seeded platform is left at 1 tenant / 6 staff / 0 software payments.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api pytest tests -q
"""

import uuid
from datetime import date

from sqlalchemy import text

from app.db import SessionLocal
from app.deps import set_request_tenant
from app.models import SoftwarePayment, Staff, Tenant

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
            text("DELETE FROM software_payments WHERE tenant_id = :id"),
            {"id": tenant_id},
        )
        db.execute(
            text("DELETE FROM audit_logs WHERE tenant_id = :id"), {"id": tenant_id}
        )
        # Every restaurant action is logged against the restaurant itself, even
        # when the tenant row is already gone (a removal logs on the owner's).
        db.execute(
            text(
                "DELETE FROM audit_logs WHERE entity = 'tenant' AND entity_id = :id"
            ),
            {"id": tenant_id},
        )
        db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
    db.commit()


def test_the_owner_opens_a_restaurant_and_gives_it_an_admin(client, anonymous):
    name = scratch("Bistro")
    username = scratch("bistro")
    tenant_id = 0
    staff_id = 0
    db = SessionLocal()
    try:
        created = client.post(
            "/api/restaurants",
            json={
                "name_ar": name,
                "name_en": name,
                "software_price": 900,
                "admin_name": "Bistro Admin",
                "admin_username": username,
                "admin_password": "sufra1234",
            },
        )
        assert created.status_code == 201, created.text
        restaurant = next(
            row for row in created.json()["restaurants"] if row["name_en"] == name
        )
        tenant_id = restaurant["id"]
        assert restaurant["software_price"] == 900
        assert restaurant["admin"]["username"] == username
        # The picker lists every restaurant, the new one last.
        listed = [row["id"] for row in created.json()["restaurants"]]
        assert tenant_id in listed and listed == sorted(listed)

        # The restaurant's admin signs in on its own and stays inside it.
        signed_in = anonymous.post(
            "/api/auth/login",
            json={"username": username, "password": "sufra1234"},
            headers=CALLER,
        )
        assert signed_in.status_code == 200, signed_in.text
        assert anonymous.get("/api/settings").json()["store"]["name_en"] == name
        own_team = anonymous.get("/api/team").json()
        assert own_team["staff"][0]["username"] == username
        # ... with no way to reach the platform: no picker, no restaurants.
        assert "restaurants" not in own_team
        assert anonymous.get("/api/restaurants").status_code == 403
        assert anonymous.get("/api/income").status_code == 403
        home_id = client.get("/api/team").json()["restaurant"]["id"]
        assert anonymous.get(f"/api/team?restaurant_id={home_id}").status_code == 403
        # An admin cannot hand out the platform role either.
        promoted = anonymous.post(
            "/api/team",
            json={
                "name": "Wannabe",
                "role": "owner",
                "username": scratch("wannabe"),
                "password": "sufra1234",
            },
        )
        assert promoted.status_code == 403
        # A restaurant admin may still run its own store profile.
        assert (
            anonymous.patch("/api/settings", json={"tax_rate": 14}).status_code == 200
        )

        staff_id = own_team["staff"][0]["id"]

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
        # Sign-in resolves the request's restaurant into a context variable; the
        # tests share one thread, so put it back after a restaurant of our own.
        set_request_tenant(None)
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
    tenant_id = next(
        row["id"] for row in created.json()["restaurants"] if row["name_en"] == name
    )
    db = SessionLocal()
    try:
        twin = client.post(
            "/api/restaurants", json={"name_ar": name, "name_en": name}
        )
        assert twin.status_code == 409
    finally:
        set_request_tenant(None)
        db.expire_all()
        drop_restaurant(db, 0, tenant_id)
        db.close()


def test_the_owner_bills_a_restaurant_and_sees_the_month(client):
    """A payment is owner income, and it lands in the month it was paid in."""
    name = scratch("Ledger")
    created = client.post(
        "/api/restaurants",
        json={"name_ar": name, "name_en": name, "software_price": 500},
    )
    assert created.status_code == 201, created.text
    tenant_id = next(
        row["id"] for row in created.json()["restaurants"] if row["name_en"] == name
    )
    # A payment lands in the month of its own date; the window is the current
    # month and the five before it.
    today = date.today()
    key = today.isoformat()[:7]
    first_id = 0
    purged = False
    db = SessionLocal()
    try:
        paid = client.post(
            f"/api/restaurants/{tenant_id}/payments",
            json={"amount": 500, "paid_on": today.isoformat(), "note": "This month"},
        )
        assert paid.status_code == 201, paid.text
        current = next(row for row in paid.json()["months"] if row["month"] == key)
        assert current["total"] == 500
        entry = next(
            row for row in current["entries"] if row["restaurant_id"] == tenant_id
        )
        first_id = entry["id"]
        assert entry["name_en"] == name

        # The restaurant list carries what it paid next to what it sold.
        listed = client.get("/api/restaurants").json()["restaurants"]
        row = next(item for item in listed if item["id"] == tenant_id)
        assert row["software_price"] == 500
        assert row["income_total"] == 500

        # Blocking cuts its people off without touching a single row.
        blocked = client.post(f"/api/restaurants/{tenant_id}/block", json={"blocked": True})
        assert blocked.status_code == 200
        assert next(
            item for item in blocked.json()["restaurants"] if item["id"] == tenant_id
        )["is_blocked"] is True
        unblocked = client.post(
            f"/api/restaurants/{tenant_id}/block", json={"blocked": False}
        )
        assert unblocked.status_code == 200

        removed = client.delete(
            f"/api/restaurants/{tenant_id}/payments/{first_id}"
        )
        assert removed.status_code == 200
        current = next(row for row in removed.json()["months"] if row["month"] == key)
        assert all(row["restaurant_id"] != tenant_id for row in current["entries"])

        # Removing it with its history erases the restaurant and its rows.
        gone = client.delete(f"/api/restaurants/{tenant_id}?keep_data=false")
        assert gone.status_code == 200, gone.text
        purged = True
        assert name not in [row["name_en"] for row in gone.json()["restaurants"]]
    finally:
        # Whatever the assertions left behind, the platform goes back to its
        # seeded shape before the session closes.
        set_request_tenant(None)
        db.expire_all()
        if purged:
            # The removal itself logs on the owner's restaurant.
            db.execute(
                text(
                    "DELETE FROM audit_logs"
                    " WHERE entity = 'tenant' AND entity_id = :id"
                ),
                {"id": tenant_id},
            )
            db.commit()
        elif tenant_id:
            drop_restaurant(db, 0, tenant_id)
        assert db.query(SoftwarePayment).count() == 0
        assert db.query(Tenant).count() == 1
        db.close()


def test_archiving_keeps_the_history(client):
    """The owner chooses: keep the rows for the books, or erase them."""
    name = scratch("Archive")
    created = client.post("/api/restaurants", json={"name_ar": name, "name_en": name})
    tenant_id = next(
        row["id"] for row in created.json()["restaurants"] if row["name_en"] == name
    )
    db = SessionLocal()
    try:
        archived = client.delete(f"/api/restaurants/{tenant_id}?keep_data=true")
        assert archived.status_code == 200, archived.text
        row = next(
            item for item in archived.json()["restaurants"] if item["id"] == tenant_id
        )
        assert row["is_deleted"] is True and row["is_blocked"] is True
    finally:
        set_request_tenant(None)
        db.expire_all()
        assert db.query(Tenant).filter_by(id=tenant_id).count() == 1
        drop_restaurant(db, 0, tenant_id)
        db.close()


def test_the_platform_keeps_its_owner(client):
    """The last owner cannot be demoted: nobody would be able to run the platform."""
    owner = client.get("/api/auth/me").json()
    demoted = client.patch(f"/api/team/{owner['id']}", json={"role": "admin"})
    assert demoted.status_code == 409
    removed = client.delete(f"/api/team/{owner['id']}")
    assert removed.status_code == 409
