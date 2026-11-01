"""Append-only trail for the actions that move money, stock or access.

One row per action, written in the same transaction as the change it describes
(no commit here: the caller commits, so the trail can never disagree with the
data). Nothing in the API updates or deletes these rows — a correction is a new
row, exactly like the stock ledger.
"""

from sqlalchemy.orm import Session

from .models import AuditLog


def log(
    db: Session,
    tenant_id: int,
    action: str,
    entity: str = "",
    entity_id: int = 0,
    detail: str = "",
    actor: str = "",
) -> AuditLog:
    row = AuditLog(
        tenant_id=tenant_id,
        action=action[:40],
        entity=entity[:40],
        entity_id=entity_id,
        detail=str(detail)[:300],
        actor=actor[:60],
    )
    db.add(row)
    return row


def serialize(rows: list[AuditLog]) -> list[dict]:
    return [
        {
            "id": row.id,
            "action": row.action,
            "entity": row.entity,
            "entity_id": row.entity_id,
            "detail": row.detail,
            "actor": row.actor,
            "at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
