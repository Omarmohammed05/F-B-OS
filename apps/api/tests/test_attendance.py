"""Attendance: clocking in, clocking out and the day board.

Every test works on a scratch member it creates and removes again (their
sessions, shifts, audit rows and the person), so the seeded store is untouched.

Run inside the api container:

    docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
"""

import uuid
from datetime import date, datetime, timedelta

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
    assert set(body["summary"]) == {
        "on_shift",
        "checked_in",
        "minutes",
        "members",
        "late_count",
        "late_minutes",
        "deduction",
    }
    assert set(body["rules"]) == {
        "shift_start",
        "grace_minutes",
        "deduction_per_minute",
        "currency",
    }
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


def test_late_minutes_cut_the_salary(client, attendee):
    """The rule is the store's: a late arrival is priced per minute, derived."""
    saved_rule = client.get("/api/settings").json()["attendance"]
    arrival = find(
        client.post("/api/attendance/check-in", json={"staff_id": attendee.id}).json(),
        attendee.id,
    )
    arrived = datetime.fromisoformat(arrival["checked_in_at"])
    # Half an hour before this arrival, five minutes of grace, two pounds a
    # minute: twenty-five late minutes and fifty off the salary.
    start = arrived - timedelta(minutes=30)
    if start.date() != arrived.date():
        pytest.skip("the check-in is too close to midnight for this rule")

    try:
        saved = client.patch(
            "/api/settings",
            json={
                "shift_start": start.strftime("%H:%M"),
                "grace_minutes": 5,
                "deduction_per_minute": 2,
            },
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["attendance"]["shift_start"] == start.strftime("%H:%M")

        board = client.get("/api/attendance").json()
        row = find(board, attendee.id)
        assert row["late_minutes"] == 25
        assert row["deduction"] == 50
        assert board["summary"]["late_count"] >= 1
        assert board["summary"]["deduction"] >= 50

        # Inside the grace window nobody is late at all.
        late_rule = client.patch(
            "/api/settings",
            json={"shift_start": arrived.strftime("%H:%M"), "grace_minutes": 30},
        )
        assert late_rule.status_code == 200, late_rule.text
        assert find(client.get("/api/attendance").json(), attendee.id)[
            "late_minutes"
        ] == 0
    finally:
        client.patch("/api/settings", json=saved_rule)


def test_bad_date_is_rejected(client):
    assert client.get("/api/attendance?date=2026-13-40").status_code == 422


def test_attendance_needs_a_session(anonymous):
    assert anonymous.get("/api/attendance").status_code == 401


@pytest.fixture()
def manager(db):
    """A manager of our own: on the board, but never fined for being late."""
    tenant = db.query(Tenant).first()
    mark = db.query(func.max(AuditLog.id)).scalar() or 0
    row = Staff(
        tenant_id=tenant.id,
        name=scratch("Manager"),
        phone="",
        role="manager",
        is_active=True,
    )
    db.add(row)
    db.commit()
    yield row
    db.execute(
        text("DELETE FROM attendance_shifts WHERE staff_id = :id"), {"id": row.id}
    )
    db.execute(text("DELETE FROM audit_logs WHERE id > :mark"), {"mark": mark})
    db.execute(text("DELETE FROM staff WHERE id = :id"), {"id": row.id})
    db.commit()


def test_a_manager_is_never_deducted(client, manager):
    """The store's rule prices the lateness, but a supervisor is not fined."""
    saved_rule = client.get("/api/settings").json()["attendance"]
    arrival = find(
        client.post("/api/attendance/check-in", json={"staff_id": manager.id}).json(),
        manager.id,
    )
    arrived = datetime.fromisoformat(arrival["checked_in_at"])
    start = arrived - timedelta(minutes=30)
    if start.date() != arrived.date():
        pytest.skip("the check-in is too close to midnight for this rule")

    try:
        client.patch(
            "/api/settings",
            json={
                "shift_start": start.strftime("%H:%M"),
                "grace_minutes": 5,
                "deduction_per_minute": 2,
            },
        )
        row = find(client.get("/api/attendance").json(), manager.id)
        assert row["exempt"] is True
        assert row["late_minutes"] == 25
        assert row["deduction"] == 0
    finally:
        client.patch("/api/settings", json=saved_rule)


def test_a_person_has_their_own_shift_time(client, attendee):
    """Their own start and grace win over the store's, and can be cleared."""
    saved_rule = client.get("/api/settings").json()["attendance"]
    arrival = find(
        client.post("/api/attendance/check-in", json={"staff_id": attendee.id}).json(),
        attendee.id,
    )
    arrived = datetime.fromisoformat(arrival["checked_in_at"])
    start = arrived - timedelta(minutes=30)
    if start.date() != arrived.date():
        pytest.skip("the check-in is too close to midnight for this rule")
    month = arrived.date().isoformat()[:7]
    own = f"/api/attendance/rules/{attendee.id}"

    try:
        client.patch(
            "/api/settings",
            json={
                "shift_start": start.strftime("%H:%M"),
                "grace_minutes": 5,
                "deduction_per_minute": 2,
            },
        )
        assert find(client.get("/api/attendance").json(), attendee.id)["deduction"] == 50

        # Their own later start, with no grace: nothing late, nothing deducted.
        saved = client.patch(
            own,
            json={
                "shift_start": arrived.strftime("%H:%M"),
                "grace_minutes": 0,
                "month": month,
            },
        )
        assert saved.status_code == 200, saved.text
        row = find(saved.json(), attendee.id)
        assert row["shift_start"] == arrived.strftime("%H:%M")
        assert row["grace_minutes"] == 0
        assert row["late_minutes"] == 0 and row["deduction"] == 0
        assert find(client.get("/api/attendance").json(), attendee.id)[
            "late_minutes"
        ] == 0

        # Emptying both hands them back to the store's rule.
        cleared = client.patch(own, json={"shift_start": "", "grace_minutes": None})
        assert cleared.status_code == 200, cleared.text
        assert find(client.get("/api/attendance").json(), attendee.id)["deduction"] == 50
    finally:
        client.patch(own, json={"shift_start": "", "grace_minutes": None})
        client.patch("/api/settings", json=saved_rule)

    # A window that cannot exist is refused rather than stored.
    assert client.patch(own, json={"grace_minutes": 500}).status_code == 422
    assert client.patch(own, json={"shift_start": "25:00"}).status_code == 422


def test_only_a_supervisor_sets_a_shift_time(own_session, attendee):
    denied = own_session.patch(
        f"/api/attendance/rules/{attendee.id}", json={"shift_start": "09:00"}
    )
    assert denied.status_code == 403


def test_the_month_collects_every_person(client, attendee):
    client.post("/api/attendance/check-in", json={"staff_id": attendee.id})
    month = date.today().isoformat()[:7]
    payload = client.get(f"/api/attendance/month?month={month}").json()
    assert payload["month"] == month
    assert set(payload["summary"]) == {
        "members",
        "days",
        "minutes",
        "late_days",
        "late_minutes",
        "deduction",
    }
    row = find(payload, attendee.id)
    assert row["days"] == 1 and row["shifts"] == 1 and row["minutes"] >= 0
    assert payload["summary"]["days"] >= 1
    # A month nobody could have worked yet is empty, not an error.
    assert client.get("/api/attendance/month?month=1999-01").json()["summary"][
        "days"
    ] == 0
    assert client.get("/api/attendance/month?month=2026-13").status_code == 422
