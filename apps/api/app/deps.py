from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Tenant


def current_tenant(db: Session) -> Tenant:
    """Single-store workspace: every request resolves the seeded tenant."""
    tenant = db.query(Tenant).first()
    if tenant is None:
        raise HTTPException(status_code=503, detail="Tenant not seeded")
    return tenant
