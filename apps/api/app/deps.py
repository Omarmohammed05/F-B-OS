from contextvars import ContextVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Branch, Tenant

# The restaurant the caller signed in for. `auth.SessionGate` fills it on every
# authenticated request; outside a request (seed, tests) it stays empty and
# `current_tenant` falls back to the seeded store.
_request_tenant: ContextVar[int | None] = ContextVar("request_tenant", default=None)

# Who may see what a plate costs and move a price: the manager on shift and the
# people above them. The till and the pass ring up tickets; they do not need the
# margin (SECURITY.md §3.2).
COST_ROLES = ("owner", "admin", "manager")

# The role that signed in, stamped by `auth.SessionGate` like the tenant above.
_request_role: ContextVar[str | None] = ContextVar("request_role", default=None)


def set_request_tenant(tenant_id: int | None) -> None:
    _request_tenant.set(tenant_id)


def set_request_role(role: str | None) -> None:
    _request_role.set(role)


def sees_cost() -> bool:
    """False on a cashier's or kitchen's request: no cost, margin or food cost.

    The serializers ask this instead of every route threading a flag through, so
    a money field cannot be hidden on one page and leak on another. Outside a
    request (seed, tests, scripts) there is no role and the money is visible —
    the same fallback `current_tenant` uses.
    """
    role = _request_role.get()
    return role is None or role in COST_ROLES


def current_tenant(db: Session) -> Tenant:
    """The restaurant behind the session, so two stores never share a screen."""
    tenant_id = _request_tenant.get()
    tenant = db.get(Tenant, tenant_id) if tenant_id else None
    if tenant is None:
        tenant = db.query(Tenant).order_by(Tenant.id).first()
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
