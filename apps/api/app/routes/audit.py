"""Read-only view of the audit trail (newest first)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..deps import current_tenant
from ..models import AuditLog

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def list_audit(
    limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)
):
    """The trail is append-only: there is no way to edit or delete a row here."""
    tenant = current_tenant(db)
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == tenant.id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    return {"entries": audit.serialize(rows)}
