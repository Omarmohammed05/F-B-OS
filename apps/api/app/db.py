import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg2://fbos:fbos@db:5432/fbos"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


class Base(DeclarativeBase):
    pass


# create_all only creates missing tables; it never adds a column to a table that
# already exists. Additive columns are listed here so an existing database (and
# every sandbox branch) picks them up without Alembic.
ADDITIVE_COLUMNS = [
    ("orders", "customer_id", "INTEGER NOT NULL DEFAULT 0"),
    # Phase 8: restock threshold on the stock ledger cache.
    ("ingredients", "par_level", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
    # Phase 9: non-guessable guest handle for anything guest-facing.
    ("customers", "qr_token", "VARCHAR(32) NOT NULL DEFAULT ''"),
    # Phase 9: one ticket per retry, so a flaky tablet never sends twice.
    ("orders", "idempotency_key", "VARCHAR(64) NOT NULL DEFAULT ''"),
    # Branches: the location the counter is working in, and the branch each
    # ticket was rung up in.
    ("tenants", "active_branch_id", "INTEGER NOT NULL DEFAULT 0"),
    ("orders", "branch_id", "INTEGER NOT NULL DEFAULT 0"),
    # Sign-in: a username turns a roster entry into a user account, and the
    # tour flag keeps the first-run tutorial to one visit.
    ("staff", "username", "VARCHAR(60) NOT NULL DEFAULT ''"),
    ("staff", "password_hash", "VARCHAR(200) NOT NULL DEFAULT ''"),
    ("staff", "onboarded_at", "TIMESTAMP NULL"),
    # Platform ownership: what the owner charges a restaurant, and the two
    # switches that cut a restaurant off or archive it.
    ("tenants", "software_price", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
    ("tenants", "is_blocked", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("tenants", "is_deleted", "BOOLEAN NOT NULL DEFAULT FALSE"),
]

ADDITIVE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders (customer_id)",
    "CREATE INDEX IF NOT EXISTS ix_customers_qr_token ON customers (qr_token)",
    # A key is unique per store, and only when one was sent at all.
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_idempotency"
    " ON orders (tenant_id, idempotency_key) WHERE idempotency_key <> ''",
    "CREATE INDEX IF NOT EXISTS ix_orders_branch_id ON orders (branch_id)",
    # One account name per store; roster entries without a login are exempt.
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_username"
    " ON staff (tenant_id, username) WHERE username <> ''",
]

# A ticket rung up before branches existed belongs to the store's first branch,
# so switching branch never hides the history the store already has.
BRANCH_BACKFILL = """
    UPDATE orders SET branch_id = (
        SELECT MIN(b.id) FROM branches b WHERE b.tenant_id = orders.tenant_id
    )
    WHERE branch_id = 0
      AND EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = orders.tenant_id)
"""

# Data steps that only touch rows the app itself left blank, so they are safe to
# run on every boot. Guests created before the column existed get the same
# non-guessable handle a new one gets.
BACKFILLS = [
    "UPDATE customers SET qr_token = md5(random()::text || id::text)"
    " WHERE qr_token = ''",
]

# The roles were redefined when the platform owner arrived: `admin` used to be
# the platform-level role and `owner` ran a single store. Now `owner` runs the
# platform and `admin` runs one restaurant, so the two swap. The first statement
# only fires while no account holds the platform role (an owner always has a
# sign-in), so a second boot never undoes the swap.
ROLE_MIGRATION = [
    "UPDATE staff SET role = 'admin' WHERE role = 'owner'"
    " AND NOT EXISTS"
    " (SELECT 1 FROM staff s WHERE s.role = 'owner' AND s.username <> '')",
    "UPDATE staff SET role = 'owner' WHERE id = ("
    " SELECT MIN(id) FROM staff WHERE role = 'admin' AND username <> '')"
    " AND NOT EXISTS (SELECT 1 FROM staff WHERE role = 'owner')",
]


def ensure_columns() -> None:
    """Idempotent, additive-only schema step. Safe to run on every boot."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in ADDITIVE_COLUMNS:
            if table not in tables:
                continue
            existing = {row["name"] for row in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        for statement in ADDITIVE_INDEXES:
            conn.execute(text(statement))
        if "customers" in tables:
            for statement in BACKFILLS:
                conn.execute(text(statement))
        if "orders" in tables and "branches" in tables:
            conn.execute(text(BRANCH_BACKFILL))
        if "staff" in tables:
            for statement in ROLE_MIGRATION:
                conn.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
