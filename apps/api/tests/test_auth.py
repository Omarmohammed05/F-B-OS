"""Sign-in, the gate in front of /api, and who may create a user.

The checks use the seeded admin account and a scratch account of their own that
they delete again, together with its sessions and audit rows.
"""

import uuid

from sqlalchemy import text

from app.db import SessionLocal
from app.models import AuthSession, Staff
from conftest import ADMIN


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------- the gate


def test_every_api_route_needs_a_session(anonymous):
    assert anonymous.get("/api/health").status_code == 200
    for path in ("/api/menu", "/api/orders", "/api/dashboard", "/api/team"):
        response = anonymous.get(path)
        assert response.status_code == 401, path
        assert response.headers["x-content-type-options"] == "nosniff"


def test_wrong_password_is_refused(anonymous):
    response = anonymous.post(
        "/api/auth/login", json={"username": ADMIN["username"], "password": "nope"}
    )
    assert response.status_code == 401
    # The message never says whether the name or the password was wrong.
    assert "password" in response.json()["detail"].lower()
    assert "sufra_session" not in anonymous.cookies


def test_sign_in_me_and_sign_out(anonymous):
    signed_in = anonymous.post("/api/auth/login", json=ADMIN)
    assert signed_in.status_code == 200
    body = signed_in.json()
    assert body["username"] == ADMIN["username"]
    # The seeded account is the platform owner (AGENTS.md).
    assert body["role"] == "owner"
    assert "password_hash" not in body

    me = anonymous.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == body["id"]

    assert anonymous.post("/api/auth/logout").status_code == 200
    assert anonymous.get("/api/auth/me").status_code == 401
    assert anonymous.get("/api/menu").status_code == 401


def test_the_tour_is_marked_once(client, anonymous):
    """Finishing the tour is persisted, and signing in again keeps it finished."""
    username = scratch("tour")
    user_id = _create_user(client, username, "sufra1234")
    try:
        login = {"username": username, "password": "sufra1234"}
        assert anonymous.post("/api/auth/login", json=login).status_code == 200
        # A brand-new account sees the tour first.
        assert anonymous.get("/api/auth/me").json()["needs_onboarding"] is True
        finished = anonymous.post("/api/auth/onboarding")
        assert finished.status_code == 200
        assert finished.json()["needs_onboarding"] is False
        assert anonymous.get("/api/auth/me").json()["needs_onboarding"] is False
    finally:
        _drop_user(client, user_id)


# ------------------------------------------------------------ creating users


def _create_user(client, username: str, password: str) -> int:
    response = client.post(
        "/api/team",
        json={
            "name": f"QA {username}",
            "role": "cashier",
            "username": username,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    return next(
        row["id"] for row in response.json()["staff"] if row["username"] == username
    )


def _drop_user(client, staff_id: int) -> None:
    if staff_id:
        client.delete(f"/api/team/{staff_id}")
    db = SessionLocal()
    try:
        db.execute(
            text("DELETE FROM auth_sessions WHERE staff_id = :id"), {"id": staff_id}
        )
        db.execute(
            text("DELETE FROM audit_logs WHERE entity = 'staff' AND entity_id = :id"),
            {"id": staff_id},
        )
        db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": staff_id})
        db.commit()
    finally:
        db.close()


def test_only_an_admin_creates_users(client, anonymous):
    username = scratch("cashier")
    user_id = _create_user(client, username, "sufra1234")
    try:
        # The new account is a real sign-in, but it cannot hand out accounts.
        assert (
            anonymous.post(
                "/api/auth/login", json={"username": username, "password": "sufra1234"}
            ).status_code
            == 200
        )
        assert anonymous.get("/api/team").status_code == 200
        refused = anonymous.post("/api/team", json={"name": "Nope", "role": "cashier"})
        assert refused.status_code == 403
        assert anonymous.delete(f"/api/team/{user_id}").status_code == 403
    finally:
        _drop_user(client, user_id)


def test_admin_can_create_any_role(client):
    user_id = 0
    name = scratch("Second Admin")
    try:
        response = client.post(
            "/api/team",
            json={
                "name": name,
                "role": "admin",
                "username": scratch("admin2"),
                "password": "sufra1234",
            },
        )
        assert response.status_code == 201
        created = next(row for row in response.json()["staff"] if row["name"] == name)
        user_id = created["id"]
        assert created["role"] == "admin"
        assert created["has_login"] is True
    finally:
        _drop_user(client, user_id)


def test_a_username_is_never_reused(client):
    username = scratch("dup")
    user_id = _create_user(client, username, "sufra1234")
    try:
        duplicate = client.post(
            "/api/team",
            json={
                "name": "Copy",
                "role": "cashier",
                "username": username,
                "password": "sufra1234",
            },
        )
        assert duplicate.status_code == 409
        short = client.post(
            "/api/team",
            json={
                "name": "Short",
                "role": "cashier",
                "username": scratch("short"),
                "password": "123",
            },
        )
        assert short.status_code == 422
        half = client.post(
            "/api/team",
            json={"name": "Half", "role": "cashier", "username": scratch("half")},
        )
        assert half.status_code == 422
    finally:
        _drop_user(client, user_id)


def test_a_deleted_user_cannot_use_their_session(client, anonymous, db):
    username = scratch("gone")
    user_id = _create_user(client, username, "sufra1234")
    try:
        assert (
            anonymous.post(
                "/api/auth/login", json={"username": username, "password": "sufra1234"}
            ).status_code
            == 200
        )
        assert anonymous.get("/api/auth/me").status_code == 200
        assert client.delete(f"/api/team/{user_id}").status_code == 200
        assert anonymous.get("/api/auth/me").status_code == 401
        assert db.query(AuthSession).filter(AuthSession.staff_id == user_id).count() == 0
        assert db.query(Staff).filter(Staff.id == user_id).count() == 0
    finally:
        _drop_user(client, user_id)
