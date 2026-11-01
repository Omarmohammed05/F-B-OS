"""The QR menu: what a guest's phone sees and sends, with no session at all.

The branch token in the link is the whole credential, so these tests check that
it reaches exactly one branch's menu, that the payload carries no cost, that a
guest's ticket lands on the counter's board, and that a bad link answers 404.

Every row a test writes is removed again: the ticket (with its items) and the
guest profile the order created, matched by a unique name.
"""

import uuid

from sqlalchemy import text

from app.db import SessionLocal
from app.models import Branch


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def menu_token() -> str:
    """The seeded store's own branch, which is the one the QR stands print."""
    db = SessionLocal()
    try:
        branch = db.query(Branch).order_by(Branch.id).first()
        return branch.menu_token
    finally:
        db.close()


def drop_ticket(order_id: int, guest: str) -> None:
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM order_items WHERE order_id = :id"), {"id": order_id})
        db.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
        db.execute(text("DELETE FROM customers WHERE name = :name"), {"name": guest})
        db.commit()
    finally:
        db.close()


def test_a_menu_link_opens_the_menu_without_a_session(anonymous):
    response = anonymous.get(f"/api/public/menu/{menu_token()}")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["store"]["name_en"]
    assert payload["products"], "the seeded store has a menu"
    # A guest never sees a cost, a margin or a recipe.
    product = payload["products"][0]
    assert "price" in product
    assert "cost" not in product and "margin" not in product


def test_an_unknown_link_is_404(anonymous):
    unknown = anonymous.get("/api/public/menu/" + "0" * 32)
    assert unknown.status_code == 404
    # A token of another shape never matches a branch either.
    assert anonymous.get("/api/public/menu/1234").status_code == 404


def test_a_guest_orders_from_their_table(anonymous, client):
    token = menu_token()
    menu = anonymous.get(f"/api/public/menu/{token}").json()
    product_id = menu["products"][0]["id"]
    guest = scratch("QR Guest")

    placed = anonymous.post(
        f"/api/public/menu/{token}/orders",
        json={
            "table_no": 5,
            "guest_name": guest,
            "note": "no sugar",
            "items": [{"product_id": product_id, "qty": 2}],
        },
    )
    assert placed.status_code == 201, placed.text
    receipt = placed.json()
    order_id = 0
    try:
        assert receipt["channel"] == "dine_in"
        assert receipt["table_no"] == 5
        assert receipt["item_count"] == 2
        assert receipt["total"] > 0

        # The counter sees the same ticket on its own board, as a new one.
        board = client.get("/api/orders").json()["orders"]
        mine = next(row for row in board if row["number"] == receipt["number"])
        order_id = mine["id"]
        assert mine["status"] == "new"
        assert mine["table_no"] == 5
        assert mine["note"].startswith("QR menu")
        assert mine["note"].endswith("no sugar")
        assert mine["customer_name"] == guest
    finally:
        drop_ticket(order_id, guest)


def test_a_guest_without_a_table_gets_a_takeaway_ticket(anonymous):
    token = menu_token()
    product_id = anonymous.get(f"/api/public/menu/{token}").json()["products"][0]["id"]
    guest = scratch("QR Walk-in")
    placed = anonymous.post(
        f"/api/public/menu/{token}/orders",
        json={"guest_name": guest, "items": [{"product_id": product_id, "qty": 1}]},
    )
    assert placed.status_code == 201, placed.text
    receipt = placed.json()
    order_id = 0
    try:
        assert receipt["channel"] == "takeaway"
        assert receipt["table_no"] is None
    finally:
        if receipt.get("number"):
            db = SessionLocal()
            try:
                row = db.execute(
                    text("SELECT id FROM orders WHERE number = :n ORDER BY id DESC"),
                    {"n": receipt["number"]},
                ).first()
                order_id = row.id if row else 0
            finally:
                db.close()
        drop_ticket(order_id, guest)


def test_a_guest_follows_their_ticket_by_its_number(anonymous):
    token = menu_token()
    product_id = anonymous.get(f"/api/public/menu/{token}").json()["products"][0]["id"]
    guest = scratch("QR Tracker")
    placed = anonymous.post(
        f"/api/public/menu/{token}/orders",
        json={
            "table_no": 4,
            "guest_name": guest,
            "items": [{"product_id": product_id, "qty": 3}],
        },
    )
    assert placed.status_code == 201, placed.text
    number = placed.json()["number"]

    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT id FROM orders WHERE number = :n ORDER BY id DESC"),
            {"n": number},
        ).first()
        order_id = row.id if row else 0
    finally:
        db.close()

    try:
        tracked = anonymous.get(f"/api/public/menu/{token}/orders/{number}")
        assert tracked.status_code == 200, tracked.text
        ticket = tracked.json()
        assert ticket["number"] == number
        assert ticket["status"] == "new"
        assert ticket["table_no"] == 4
        assert ticket["item_count"] == 3
        assert ticket["currency"]
        assert ticket["items"], "the guest sees their own plates"
        # A number is not an identity: nothing about the guest travels.
        assert "customer_name" not in ticket
        assert "customer_id" not in ticket
        assert "delivery_address" not in ticket

        # A number this branch never rang up is a miss, not somebody's ticket.
        assert anonymous.get(f"/api/public/menu/{token}/orders/999999").status_code == 404
    finally:
        drop_ticket(order_id, guest)


def test_a_stale_product_is_refused(anonymous):
    token = menu_token()
    refused = anonymous.post(
        f"/api/public/menu/{token}/orders",
        json={"items": [{"product_id": 999_999, "qty": 1}]},
    )
    assert refused.status_code == 400


def test_a_table_beyond_the_floor_is_refused(anonymous):
    token = menu_token()
    product_id = anonymous.get(f"/api/public/menu/{token}").json()["products"][0]["id"]
    refused = anonymous.post(
        f"/api/public/menu/{token}/orders",
        json={"table_no": 999, "items": [{"product_id": product_id, "qty": 1}]},
    )
    assert refused.status_code == 422
