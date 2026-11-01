"""Attendance: clocking in, clocking out and the day board.

Every test works on a scratch member it creates and removes again (their
sessions, shifts, audit rows and the person), so the seeded store is untouched.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
"""

import uuid
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, text

from app.auth import hash_password
from app.main import app
from app.models import AuditLog, Staff, Tenant
from app.seed import ADMIN_PASSWORD


def scratch(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def find(payload: dict, staff_id: int) -> dict:
    return next(row for row in payload["members"] if row["id"] == staff_id)


@pytest.fixture()
def attendee(db):
    """A cashier of our own, with a sign-in, plus the audit watermark to clear."""
    tenant = db.query(Tenant).first()
    mark = db.query(func.max(AuditLog.id)).scalar() or 0
    row = Staff(
        tenant_id=tenant.id,
        name=scratch("Attendee"),
        phone="",
        role="cashier",
        is_active=True,
        username=scratch("attendee").lower(),
        password_hash=hash_password(ADMIN_PASSWORD),
    )
    db.add(row)
    db.commit()
    yield row
    db.execute(
        text("DELETE FROM attendance_shifts WHERE staff_id = :id"), {"id": row.id}
    )
    db.execute(
        text("DELETE FROM auth_sessions WHERE staff_id = :id"), {"id": row.id}
    )
    db.execute(text("DELETE FROM audit_logs WHERE id > :mark"), {"mark": mark})
    db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": row.id})
    db.commit()


@pytest.fixture()
def own_session(attendee):
    """The scratch member's own cookie, for the permission checks."""
    with TestClient(app) as test_client:
        signed_in = test_client.post(
            "/api/auth/login",
            json={"username": attendee.username, "password": ADMIN_PASSWORD},
        )
        assert signed_in.status_code == 200, signed_in.text
        yield test_client


def test_day_board_reads_the_roster(client):
    board = client.get("/api/attendance")
    assert board.status_code == 200
    body = board.json()
    assert body["date"] == date.today().isoformat()
    assert body["is_today"] is True
    assert body["members"], "the seeded roster should be on the board"
    assert set(body["summary"]) == {"on_shift", "checked_in", "minutes", "members"}
    assert body["summary"]["on_shift"] <= body["summary"]["members"]
    # The platform owner runs the platform, not a shift.
    assert body["me"] is None
    assert all(row["role"] != "owner" for row in body["members"])


def test_check_in_is_idempotent_and_check_out_closes(client, attendee):
    first = client.post("/api/attendance/check-in", json={"staff_id": attendee.id})
    assert first.status_code == 200, first.text
    opened = find(first.json(), attendee.id)
    assert opened["status"] == "in"
    assert opened["checked_in_at"] and opened["open_since"]
    assert opened["shifts"] == 1

    # A double tap on the counter tablet must not open a second shift.
    again = find(
        client.post(
            "/api/attendance/check-in", json={"staff_id": attendee.id}
        ).json(),
        attendee.id,
    )
    assert again["shifts"] == 1
    assert again["checked_in_at"] == opened["checked_in_at"]

    left = client.post("/api/attendance/check-out", json={"staff_id": attendee.id})
    assert left.status_code == 200, left.text
    closed = find(left.json(), attendee.id)
    assert closed["status"] == "out"
    assert closed["checked_out_at"] and closed["open_since"] is None
    assert closed["minutes"] >= 0

    # Nothing is open any more, so a second departure is a conflict, not a write.
    assert (
        client.post(
            "/api/attendance/check-out", json={"staff_id": attendee.id}
        ).status_code
        == 409
    )


def test_a_shift_can_be_split(client, attendee):
    client.post("/api/attendance/check-in", json={"staff_id": attendee.id})
    client.post("/api/attendance/check-out", json={"staff_id": attendee.id})
    second = client.post(
        "/api/attendance/check-in", json={"staff_id": attendee.id}
    ).json()
    row = find(second, attendee.id)
    assert row["shifts"] == 2
    assert row["status"] == "in"
    # The first arrival stays the day's start even after coming back.
    assert datetime.fromisoformat(row["checked_in_at"]) < datetime.fromisoformat(
        row["open_since"]
    )


def test_staff_clock_themselves_but_not_a_teammate(own_session, attendee):
    board = own_session.get("/api/attendance").json()
    teammate = next(
        row
        for row in board["members"]
        if row["id"] != attendee.id and row["status"] != "in"
    )
    denied = own_session.post(
        "/api/attendance/check-in", json={"staff_id": teammate["id"]}
    )
    assert denied.status_code == 403

    own = own_session.post("/api/attendance/check-in", json={})
    assert own.status_code == 200, own.text
    assert find(own.json(), attendee.id)["status"] == "in"
    # The refused punch wrote nothing for the teammate.
    assert find(own.json(), teammate["id"])["status"] != "in"


def test_bad_date_is_rejected(client):
    assert client.get("/api/attendance?date=2026-13-40").status_code == 422


def test_attendance_needs_a_session(anonymous):
    assert anonymous.get("/api/attendance").status_code == 401
