from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Branch, Tenant


def current_tenant(db: Session) -> Tenant:
    """Single-store workspace: every request resolves the seeded tenant."""
    tenant = db.query(Tenant).first()
    if tenant is None:
        raise HTTPException(status_code=503, detail="Tenant not seeded")
    return tenant


def active_branch(db: Session, tenant: Tenant) -> Branch | None:
    """The location the counter is working in, never another store's branch."""
    if tenant.active_branch_id:
        branch = (
            db.query(Branch)
            .filter(
                Branch.tenant_id == tenant.id, Branch.id == tenant.active_branch_id
            )
            .first()
        )
        if branch is not None:
            return branch
    return (
        db.query(Branch)
        .filter(Branch.tenant_id == tenant.id)
        .order_by(Branch.id)
        .first()
    )


def active_branch_id(db: Session, tenant: Tenant) -> int:
    """Branch that scopes tickets, the dashboard and reports.

    0 means the store has no branch rows at all (before the seed runs); tickets
    then all sit at 0 too, so filtering by it still matches every ticket.
    """
    branch = active_branch(db, tenant)
    return branch.id if branch else 0
