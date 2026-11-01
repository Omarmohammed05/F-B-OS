"""Branches: adding a location, listing them, and switching the active one.

Switching is a write to the store's own row, so every test puts the original
selection back. Branches are created with unique names and deleted by id.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api pytest tests -q
"""

import uuid

import pytest
from sqlalchemy import func, text

from app.models import AuditLog, Branch, Order, Tenant


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def store(db):
    """The seeded store, plus its original branch selection to restore."""
    tenant = db.query(Tenant).first()
    original = tenant.active_branch_id
    # Switching logs a `branch.activate` row even for the store's own branch, so
    # the trail this test writes is removed by watermark, not by id.
    mark = db.query(func.max(AuditLog.id)).scalar() or 0
    yield {"id": tenant.id, "branch_id": original}
    db.expire_all()
    row = db.query(Tenant).filter(Tenant.id == tenant.id).first()
    row.active_branch_id = original
    db.execute(text("DELETE FROM audit_logs WHERE id > :mark"), {"mark": mark})
    db.commit()


def drop_branch(db, branch_id: int) -> None:
    db.execute(
        text("DELETE FROM audit_logs WHERE entity = 'branch' AND entity_id = :id"),
        {"id": branch_id},
    )
    db.execute(text("DELETE FROM branches WHERE id = :id"), {"id": branch_id})
    db.commit()


def drop_order(db, order_id: int) -> None:
    db.execute(text("DELETE FROM stock_movements WHERE order_id = :id"), {"id": order_id})
    db.execute(text("DELETE FROM order_items WHERE order_id = :id"), {"id": order_id})
    db.execute(text("DELETE FROM audit_logs WHERE entity_id = :id"), {"id": order_id})
    db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
    db.commit()


def add_branch(client) -> dict:
    name_en = scratch("Branch")
    response = client.post(
        "/api/branches",
        json={"name_ar": scratch("فرع"), "name_en": name_en},
    )
    assert response.status_code == 201
    return next(
        branch for branch in response.json()["branches"] if branch["name_en"] == name_en
    )


# -------------------------------------------------------- listing & seeding


def test_store_always_has_a_branch_to_work_in(client):
    payload = client.get("/api/branches").json()
    assert payload["branches"], "the seed gives the store its first location"
    assert payload["active_id"] in [branch["id"] for branch in payload["branches"]]

    # The dashboard carries the same list, so the switcher needs no second call.
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["active_id"] == payload["active_id"]
    assert [b["id"] for b in dashboard["branches"]] == [
        b["id"] for b in payload["branches"]
    ]


# -------------------------------------------------- creating and switching


def test_branch_can_be_added_listed_and_switched(client, db, store):
    branch = add_branch(client)
    try:
        listed = client.get("/api/branches").json()
        assert branch["id"] in [row["id"] for row in listed["branches"]]
        # Choosing a branch is not implied by adding one.
        assert listed["active_id"] == store["branch_id"]

        switched = client.post(f"/api/branches/{branch['id']}/activate")
        assert switched.status_code == 200
        assert switched.json()["active_id"] == branch["id"]
        db.expire_all()
        assert db.get(Tenant, store["id"]).active_branch_id == branch["id"]

        # A new location starts with an empty board, not another branch's tickets.
        assert client.get("/api/orders").json()["orders"] == []
        assert client.get("/api/dashboard").json()["activity"] == []

        # ...and switching back brings the store's own tickets back.
        client.post(f"/api/branches/{store['branch_id']}/activate")
        assert client.get("/api/orders").json()["orders"]
    finally:
        client.post(f"/api/branches/{store['branch_id']}/activate")
        drop_branch(db, branch["id"])


def test_a_ticket_is_rung_up_in_the_active_branch(client, db, store):
    branch = add_branch(client)
    product = client.get("/api/pos").json()["products"][0]
    order_id = 0
    try:
        client.post(f"/api/branches/{branch['id']}/activate")
        created = client.post(
            "/api/orders",
            json={
                "channel": "takeaway",
                "items": [{"product_id": product["id"], "qty": 1}],
            },
        )
        assert created.status_code == 201
        order_id = created.json()["id"]
        db.expire_all()
        assert db.get(Order, order_id).branch_id == branch["id"]

        # The orders board is scoped the same way, so the branch shows its own.
        board = client.get("/api/orders").json()["orders"]
        assert order_id in [order["id"] for order in board]
    finally:
        client.post(f"/api/branches/{store['branch_id']}/activate")
        if order_id:
            drop_order(db, order_id)
        drop_branch(db, branch["id"])


# ------------------------------------------------------------- validation


def test_branch_needs_two_names_and_no_duplicates(client, db):
    existing = client.get("/api/branches").json()["branches"][0]
    duplicate = client.post(
        "/api/branches",
        json={"name_ar": scratch("فرع"), "name_en": existing["name_en"].upper()},
    )
    assert duplicate.status_code == 409

    blank = client.post("/api/branches", json={"name_ar": "   ", "name_en": "X"})
    assert blank.status_code == 422

    only_english = client.post("/api/branches", json={"name_en": "Only English"})
    assert only_english.status_code == 422

    assert (
        db.query(Branch).filter(Branch.name_en == "Only English").count() == 0
    )


# -------------------------------------------------------- tenant isolation


def test_another_stores_branch_is_invisible_and_cannot_be_activated(client, db, store):
    other = Tenant(name_ar=scratch("متجر"), name_en=scratch("Store"))
    db.add(other)
    db.flush()
    foreign = Branch(tenant_id=other.id, name_ar="فرع", name_en=scratch("Elsewhere"))
    db.add(foreign)
    db.commit()
    try:
        listed = client.get("/api/branches").json()["branches"]
        assert foreign.id not in [branch["id"] for branch in listed]

        # A branch id from another store answers like one that never existed.
        assert client.post(f"/api/branches/{foreign.id}/activate").status_code == 404
        db.expire_all()
        assert db.get(Tenant, store["id"]).active_branch_id == store["branch_id"]
    finally:
        db.execute(text("DELETE FROM branches WHERE id = :id"), {"id": foreign.id})
        db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": other.id})
        db.commit()
