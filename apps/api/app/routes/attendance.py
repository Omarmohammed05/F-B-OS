"""Who is on the floor: one arrival, one departure, one row each.

`attendance_shifts` holds a row per arrival. A check-in opens one, a check-out
closes it, and the day's hours are the sum of the rows — so a split shift needs
no special case and a double tap on check-in finds the open row and changes
nothing (what a shared counter tablet needs). Nothing is ever rewritten except
the closing timestamp of the row that was opened.

Anyone signed in punches their own clock. A manager, an admin or the owner may
punch for somebody on the same team, exactly like the checklist board.

Lateness is derived per request from `tenants.shift_start` + the grace window:
the day's first arrival past that moment is late, and every late minute costs
`late_deduction_rate`. Nothing is stored, so editing the rule reprices the day.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import audit, auth
from ..db import get_db
from ..deps import current_tenant
from ..models import AttendanceShift, Staff, Tenant

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

# The platform owner runs the platform, not a restaurant's shift.
SHIFT_ROLES = ("admin", "manager", "cashier", "kitchen")
# Who may punch a teammate in or out.
SUPERVISOR_ROLES = ("admin", "owner", "manager")


def parse_day(value: str | None) -> date:
    if not value:
        return date.today()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=422, detail="A date is YYYY-MM-DD."
        ) from None


def minutes_of(rows: list[AttendanceShift], now: datetime) -> int:
    """Minutes worked: every closed row, plus the one still open."""
    total = 0
    for row in rows:
        end = row.checked_out_at or now
        total += max(0, int((end - row.checked_in_at).total_seconds() // 60))
    return total


def rules_of(tenant: Tenant) -> dict:
    """The store's lateness rule: when the shift starts and what a minute costs."""
    return {
        "shift_start": tenant.shift_start,
        "grace_minutes": tenant.shift_grace_minutes,
        "deduction_per_minute": tenant.late_deduction_rate,
        "currency": tenant.currency,
    }


def late_minutes_of(rows: list[AttendanceShift], rules: dict) -> int:
    """Minutes past shift start + grace, measured on the day's first arrival.

    A split shift is late once — the second arrival of the day does not count
    again — and no rule, no arrival or an arrival inside the grace window is 0.
    """
    start = rules["shift_start"]
    if not start or not rows:
        return 0
    hour, minute = (int(part) for part in start.split(":"))
    first = min(row.checked_in_at for row in rows)
    due = first.replace(hour=hour, minute=minute, second=0, microsecond=0)
    due += timedelta(minutes=max(0, rules["grace_minutes"]))
    return max(0, int((first - due).total_seconds() // 60))


def serialize_member(
    member: Staff, rows: list[AttendanceShift], now: datetime, rules: dict
) -> dict:
    rows = sorted(rows, key=lambda row: row.checked_in_at)
    opened = next((row for row in rows if row.checked_out_at is None), None)
    closed = [row for row in rows if row.checked_out_at is not None]
    late = late_minutes_of(rows, rules)
    return {
        "id": member.id,
        "name": member.name,
        "role": member.role,
        "is_active": member.is_active,
        "status": "in" if opened else ("out" if rows else "none"),
        # The first arrival and the most recent departure of the day.
        "checked_in_at": rows[0].checked_in_at.isoformat() if rows else None,
        "checked_out_at": (
            closed[-1].checked_out_at.isoformat() if closed else None
        ),
        # Set only while a row is still open, so the page can tick elapsed time.
        "open_since": opened.checked_in_at.isoformat() if opened else None,
        "minutes": minutes_of(rows, now),
        "shifts": len(rows),
        # Lateness today and what it takes off the salary, both derived.
        "late_minutes": late,
        "deduction": round(late * rules["deduction_per_minute"], 2),
    }


def day_payload(db: Session, tenant: Tenant, work_date: date, viewer: Staff) -> dict:
    now = datetime.now()
    people = (
        db.query(Staff)
        .filter(
            Staff.tenant_id == tenant.id,
            Staff.role.in_(SHIFT_ROLES),
            Staff.is_active.is_(True),
        )
        .order_by(Staff.id)
        .all()
    )
    by_staff: dict[int, list[AttendanceShift]] = {}
    touched = set()
    for row in (
        db.query(AttendanceShift)
        .filter(
            AttendanceShift.tenant_id == tenant.id,
            AttendanceShift.work_date == work_date,
        )
        .all()
    ):
        by_staff.setdefault(row.staff_id, []).append(row)
        touched.add(row.staff_id)

    # Someone switched off after they worked that day stays on the board, so a
    # past day never changes underneath the manager reading it.
    known = {member.id: member for member in people}
    for staff_id in touched - set(known):
        gone = (
            db.query(Staff)
            .filter(Staff.tenant_id == tenant.id, Staff.id == staff_id)
            .first()
        )
        if gone is not None:
            known[staff_id] = gone

    rules = rules_of(tenant)
    members = [
        serialize_member(member, by_staff.get(member.id, []), now, rules)
        for member in sorted(known.values(), key=lambda row: row.id)
    ]

    return {
        "date": work_date.isoformat(),
        "is_today": work_date == date.today(),
        "rules": rules,
        "me": next((row for row in members if row["id"] == viewer.id), None),
        "members": members,
        "summary": {
            "on_shift": sum(1 for row in members if row["status"] == "in"),
            "checked_in": sum(1 for row in members if row["status"] != "none"),
            "minutes": sum(row["minutes"] for row in members),
            "members": len(members),
            "late_count": sum(1 for row in members if row["late_minutes"] > 0),
            "late_minutes": sum(row["late_minutes"] for row in members),
            "deduction": round(sum(row["deduction"] for row in members), 2),
        },
    }


def punch_target(
    db: Session, tenant: Tenant, user: Staff, staff_id: int | None
) -> Staff:
    """The member a punch is for: the caller, or a teammate they supervise."""
    if staff_id in (None, 0, user.id):
        member = user
    else:
        member = (
            db.query(Staff)
            .filter(Staff.tenant_id == tenant.id, Staff.id == staff_id)
            .first()
        )
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    if member.role not in SHIFT_ROLES:
        raise HTTPException(
            status_code=400, detail="This account does not clock in."
        )
    if user.role not in SUPERVISOR_ROLES and member.id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only clock yourself in."
        )
    if not member.is_active:
        raise HTTPException(
            status_code=409, detail="This account is switched off."
        )
    return member


class Punch(BaseModel):
    staff_id: int | None = None
    date: str | None = None


@router.get("")
def day_board(
    date_: str | None = Query(None, alias="date"),
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    return day_payload(db, tenant, parse_day(date_), user)


@router.post("/check-in")
def check_in(
    payload: Punch,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    member = punch_target(db, tenant, user, payload.staff_id)
    work_date = parse_day(payload.date)
    opened = (
        db.query(AttendanceShift)
        .filter(
            AttendanceShift.tenant_id == tenant.id,
            AttendanceShift.staff_id == member.id,
            AttendanceShift.work_date == work_date,
            AttendanceShift.checked_out_at.is_(None),
        )
        .first()
    )
    if opened is None:
        db.add(
            AttendanceShift(
                tenant_id=tenant.id,
                staff_id=member.id,
                work_date=work_date,
                checked_in_at=datetime.now(),
                opened_by=user.id,
            )
        )
        db.flush()
        audit.log(
            db,
            tenant.id,
            "attendance.in",
            "staff",
            member.id,
            f"{member.name} — {work_date.isoformat()}",
            actor=user.name,
        )
        db.commit()
    return day_payload(db, tenant, work_date, user)


@router.post("/check-out")
def check_out(
    payload: Punch,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    member = punch_target(db, tenant, user, payload.staff_id)
    work_date = parse_day(payload.date)
    opened = (
        db.query(AttendanceShift)
        .filter(
            AttendanceShift.tenant_id == tenant.id,
            AttendanceShift.staff_id == member.id,
            AttendanceShift.work_date == work_date,
            AttendanceShift.checked_out_at.is_(None),
        )
        .first()
    )
    if opened is None:
        raise HTTPException(
            status_code=409, detail="This person is not clocked in."
        )
    opened.checked_out_at = datetime.now()
    opened.closed_by = user.id
    audit.log(
        db,
        tenant.id,
        "attendance.out",
        "staff",
        member.id,
        f"{member.name} — {work_date.isoformat()}",
        actor=user.name,
    )
    db.commit()
    return day_payload(db, tenant, work_date, user)
