"""The store's opening and closing checklist, one list per member per day.

A task is store configuration (`checklist_tasks`): an admin writes the list and a
`role` scopes an item to the people it applies to. A tick is a `checklist_checks`
row that exists only while the box is ticked, so "not done" needs no second
meaning and a double tap cannot write twice.

Anyone signed in reads the day board and ticks their own boxes; a manager, an
admin or the owner may tick for somebody else. The week and month report — who
finished their list and on which days — is that manager's view. Everything is
store-wide: a checklist follows the person, not the branch they stood in.
"""

import calendar
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..deps import current_tenant
from ..models import ChecklistCheck, ChecklistTask, Staff, Tenant

router = APIRouter(prefix="/api/checklists", tags=["checklists"])

TaskRole = Literal["", "admin", "manager", "cashier", "kitchen"]
# Who may tick somebody else's box, and who counts as "the manager" here.
SUPERVISOR_ROLES = ("admin", "owner", "manager")
# The platform owner runs the platform, not a restaurant's shift.
BOARD_ROLES = ("admin", "manager", "cashier", "kitchen")


def parse_day(value: str | None) -> date:
    if not value:
        return date.today()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=422, detail="A date is YYYY-MM-DD."
        ) from None


def board(db: Session, tenant: Tenant) -> list[Staff]:
    """Active people whose shift carries a checklist."""
    return (
        db.query(Staff)
        .filter(
            Staff.tenant_id == tenant.id,
            Staff.role.in_(BOARD_ROLES),
            Staff.is_active.is_(True),
        )
        .order_by(Staff.id)
        .all()
    )


def applies(task: ChecklistTask, role: str) -> bool:
    return not task.role or task.role == role


def checked_tasks(db: Session, tenant: Tenant) -> dict[int, int]:
    """How many ticks each task already carries, so history is never deleted."""
    rows = (
        db.query(ChecklistCheck.task_id, func.count(ChecklistCheck.id))
        .filter(ChecklistCheck.tenant_id == tenant.id)
        .group_by(ChecklistCheck.task_id)
        .all()
    )
    return {task_id: count for task_id, count in rows}


def serialize_task(row: ChecklistTask, checks: dict[int, int]) -> dict:
    return {
        "id": row.id,
        "title_ar": row.title_ar,
        "title_en": row.title_en,
        "role": row.role,
        "sort": row.sort,
        "is_active": row.is_active,
        "has_checks": checks.get(row.id, 0) > 0,
    }


def task_rows(db: Session, tenant: Tenant) -> list[ChecklistTask]:
    return (
        db.query(ChecklistTask)
        .filter(ChecklistTask.tenant_id == tenant.id)
        .order_by(ChecklistTask.sort, ChecklistTask.id)
        .all()
    )


def tasks_payload(db: Session, tenant: Tenant) -> dict:
    checks = checked_tasks(db, tenant)
    return {
        "tasks": [serialize_task(row, checks) for row in task_rows(db, tenant)]
    }


def day_payload(db: Session, tenant: Tenant, work_date: date) -> dict:
    checks = checked_tasks(db, tenant)
    tasks = [row for row in task_rows(db, tenant) if row.is_active]
    ticked = {
        (row.task_id, row.staff_id)
        for row in db.query(ChecklistCheck)
        .filter(
            ChecklistCheck.tenant_id == tenant.id,
            ChecklistCheck.work_date == work_date,
        )
        .all()
    }

    members = []
    done_total = 0
    task_total = 0
    for member in board(db, tenant):
        own = [task for task in tasks if applies(task, member.role)]
        items = [
            {"task_id": task.id, "done": (task.id, member.id) in ticked}
            for task in own
        ]
        done = sum(1 for item in items if item["done"])
        done_total += done
        task_total += len(items)
        members.append(
            {
                "id": member.id,
                "name": member.name,
                "role": member.role,
                "done": done,
                "total": len(items),
                "items": items,
            }
        )

    return {
        "date": work_date.isoformat(),
        "tasks": [serialize_task(row, checks) for row in task_rows(db, tenant)],
        "members": members,
        "summary": {
            "done": done_total,
            "total": task_total,
            "members": len(members),
            "complete": sum(
                1 for row in members if row["total"] and row["done"] == row["total"]
            ),
        },
    }


def period_bounds(period: str, anchor: date) -> tuple[date, date]:
    if period == "day":
        return anchor, anchor
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        first = anchor.replace(day=1)
        last_day = calendar.monthrange(first.year, first.month)[1]
        return first, first.replace(day=last_day)
    raise HTTPException(status_code=422, detail="A period is day, week or month.")


@router.get("")
def day_board(
    date_: str | None = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    return day_payload(db, tenant, parse_day(date_))


@router.get("/report")
def checklist_report(
    period: str = Query("week"),
    anchor: str | None = None,
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    start, end = period_bounds(period, parse_day(anchor))
    days = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    # Only days that have happened: a month report opened on the 3rd is not
    # failing because 27 days are still ahead.
    counted = [day for day in days if day <= date.today()]
    window_end = counted[-1] if counted else start - timedelta(days=1)

    tasks = [row for row in task_rows(db, tenant) if row.is_active]
    ticks = (
        db.query(ChecklistCheck)
        .filter(
            ChecklistCheck.tenant_id == tenant.id,
            ChecklistCheck.work_date >= start,
            ChecklistCheck.work_date <= window_end,
        )
        .all()
    )

    per_day: dict[tuple[int, date], int] = {}
    staff_ids = set()
    for row in ticks:
        per_day[(row.staff_id, row.work_date)] = (
            per_day.get((row.staff_id, row.work_date), 0) + 1
        )
        staff_ids.add(row.staff_id)

    # Anyone with a tick in the window stays on the report even after they were
    # switched off, so a past week never changes.
    people = {
        row.id: row
        for row in db.query(Staff).filter(
            Staff.tenant_id == tenant.id, Staff.role.in_(BOARD_ROLES)
        )
        .all()
        if row.is_active or row.id in staff_ids
    }

    members = []
    done_total = 0
    expected_total = 0
    for member in sorted(people.values(), key=lambda row: row.id):
        own = [task for task in tasks if applies(task, member.role)]
        series = [
            {
                "date": day.isoformat(),
                "done": per_day.get((member.id, day), 0),
                # A day still ahead has no expectation yet.
                "expected": len(own) if day <= window_end else 0,
            }
            for day in days
        ]
        done = sum(point["done"] for point in series)
        expected = len(own) * len(counted)
        done_total += done
        expected_total += expected
        members.append(
            {
                "id": member.id,
                "name": member.name,
                "role": member.role,
                "is_active": member.is_active,
                "done": done,
                "expected": expected,
                "percent": round(done * 100 / expected) if expected else 0,
                "days": series,
            }
        )

    return {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "counted_days": len(counted),
        "tasks_total": len(tasks),
        "days": [day.isoformat() for day in days],
        "members": members,
        "summary": {
            "done": done_total,
            "expected": expected_total,
            "percent": round(done_total * 100 / expected_total)
            if expected_total
            else 0,
        },
    }


class CheckIn(BaseModel):
    task_id: int
    staff_id: int
    date: str | None = None
    done: bool = True


@router.post("/checks")
def tick_check(
    payload: CheckIn,
    user: Staff = Depends(auth.current_user),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    work_date = parse_day(payload.date)
    task = (
        db.query(ChecklistTask)
        .filter(
            ChecklistTask.tenant_id == tenant.id, ChecklistTask.id == payload.task_id
        )
        .first()
    )
    if task is None or not task.is_active:
        raise HTTPException(status_code=404, detail="Checklist task not found")
    member = (
        db.query(Staff)
        .filter(
            Staff.tenant_id == tenant.id,
            Staff.id == payload.staff_id,
            Staff.role.in_(BOARD_ROLES),
        )
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    if user.role not in SUPERVISOR_ROLES and member.id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only tick your own checklist."
        )
    if not applies(task, member.role):
        raise HTTPException(
            status_code=400, detail="That task is not on this person's list."
        )

    existing = (
        db.query(ChecklistCheck)
        .filter(
            ChecklistCheck.tenant_id == tenant.id,
            ChecklistCheck.task_id == task.id,
            ChecklistCheck.staff_id == member.id,
            ChecklistCheck.work_date == work_date,
        )
        .first()
    )
    if payload.done and existing is None:
        db.add(
            ChecklistCheck(
                tenant_id=tenant.id,
                task_id=task.id,
                staff_id=member.id,
                work_date=work_date,
                done_by=user.id,
            )
        )
    elif not payload.done and existing is not None:
        db.delete(existing)
    db.commit()
    return day_payload(db, tenant, work_date)


class TaskIn(BaseModel):
    title_ar: str = Field(default="", max_length=160)
    title_en: str = Field(default="", max_length=160)
    role: TaskRole = ""
    sort: int = 0
    is_active: bool = True


class TaskPatch(BaseModel):
    title_ar: str | None = Field(default=None, max_length=160)
    title_en: str | None = Field(default=None, max_length=160)
    role: TaskRole | None = None
    sort: int | None = None
    is_active: bool | None = None


def clean_titles(title_ar: str, title_en: str) -> tuple[str, str]:
    ar, en = title_ar.strip(), title_en.strip()
    if not ar or not en:
        raise HTTPException(
            status_code=422, detail="A task needs a title in both languages."
        )
    return ar, en


def find_task(db: Session, tenant: Tenant, task_id: int) -> ChecklistTask:
    row = (
        db.query(ChecklistTask)
        .filter(ChecklistTask.tenant_id == tenant.id, ChecklistTask.id == task_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Checklist task not found")
    return row


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    return tasks_payload(db, current_tenant(db))


@router.post("/tasks", status_code=201)
def create_task(
    payload: TaskIn,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    title_ar, title_en = clean_titles(payload.title_ar, payload.title_en)
    row = ChecklistTask(
        tenant_id=tenant.id,
        title_ar=title_ar,
        title_en=title_en,
        role=payload.role,
        sort=payload.sort,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    return tasks_payload(db, tenant)


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskPatch,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    row = find_task(db, tenant, task_id)
    changes = payload.model_dump(exclude_unset=True)
    if "title_ar" in changes or "title_en" in changes:
        changes["title_ar"], changes["title_en"] = clean_titles(
            changes.get("title_ar", row.title_ar),
            changes.get("title_en", row.title_en),
        )
    for field, value in changes.items():
        setattr(row, field, value)
    db.commit()
    return tasks_payload(db, tenant)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    user: Staff = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    tenant = current_tenant(db)
    row = find_task(db, tenant, task_id)
    # A ticked task is part of a past day's record; switch it off instead.
    if checked_tasks(db, tenant).get(row.id, 0):
        raise HTTPException(
            status_code=409,
            detail="This task already has ticks. Switch it off instead of deleting it.",
        )
    db.delete(row)
    db.commit()
    return tasks_payload(db, tenant)
