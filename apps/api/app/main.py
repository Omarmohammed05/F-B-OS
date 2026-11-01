import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import auth, wallet
from .dashboard import build_dashboard
from .db import Base, engine, ensure_columns, get_db
from .deps import current_tenant
from .models import SetupTask, Tenant
from .routes import audit as audit_routes
from .routes import auth as auth_routes
from .routes import branches as branch_routes
from .routes import checklists as checklist_routes
from .routes import customers as customer_routes
from .routes import inventory as inventory_routes
from .routes import loyalty as loyalty_routes
from .routes import menu as menu_routes
from .routes import notifications as notification_routes
from .routes import orders as order_routes
from .routes import platform as platform_routes
from .routes import pos as pos_routes
from .routes import reports as report_routes
from .routes import settings as setting_routes
from .routes import team as team_routes
from .security import Hardening

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # create_all is idempotent: it keeps the schema in step with models.py when
    # uvicorn --reload restarts the API after a model edit, before the one-shot
    # `migrate` service (seed) has had a chance to run.
    Base.metadata.create_all(bind=engine)
    ensure_columns()
    # The loyalty page hides the Wallet button when this is off, so say why here
    # instead of leaving a missing button unexplained.
    if not wallet.enabled():
        logging.getLogger("uvicorn.error").warning(
            "Google Wallet passes are off: %s", wallet.problem()
        )
    yield


app = FastAPI(title="Sufra OS API", version="0.1.0", lifespan=lifespan)

allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
suffix = os.environ.get("BASE44_PUBLIC_HOST_SUFFIX")
if suffix:
    allowed_origins.append(f"https://3000-{suffix}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(auth.SessionGate)

# Added last, so it is the outermost layer: a 401 from the gate is rate-limited
# and carries the security headers like every other reply.
app.add_middleware(Hardening)

app.include_router(auth_routes.router)
app.include_router(menu_routes.router)
app.include_router(inventory_routes.router)
app.include_router(pos_routes.router)
app.include_router(order_routes.router)
app.include_router(customer_routes.router)
app.include_router(loyalty_routes.router)
app.include_router(report_routes.router)
app.include_router(team_routes.router)
app.include_router(platform_routes.router)
app.include_router(setting_routes.router)
app.include_router(audit_routes.router)
app.include_router(notification_routes.router)
app.include_router(branch_routes.router)
app.include_router(checklist_routes.router)


def serialize_setup(db: Session, tenant: Tenant) -> dict:
    tasks = (
        db.query(SetupTask)
        .filter(SetupTask.tenant_id == tenant.id)
        .order_by(SetupTask.sort)
        .all()
    )
    completed = sum(1 for task in tasks if task.is_done)
    return {
        "completed": completed,
        "total": len(tasks),
        "tasks": [
            {
                "key": task.key,
                "title_ar": task.title_ar,
                "title_en": task.title_en,
                "summary_ar": task.summary_ar,
                "summary_en": task.summary_en,
                "is_done": task.is_done,
            }
            for task in tasks
        ],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    # The sidebar switcher reads the branch list from the same payload, so a
    # store with one branch and a store with five load exactly alike.
    return {
        **build_dashboard(db, tenant),
        **branch_routes.branches_payload(db, tenant),
        "setup": serialize_setup(db, tenant),
    }


@app.get("/api/setup")
def setup(db: Session = Depends(get_db)):
    return serialize_setup(db, current_tenant(db))


class SetupPatch(BaseModel):
    is_done: bool


@app.patch("/api/setup/{task_key}")
def update_setup(task_key: str, patch: SetupPatch, db: Session = Depends(get_db)):
    tenant = current_tenant(db)
    task = (
        db.query(SetupTask)
        .filter(SetupTask.tenant_id == tenant.id, SetupTask.key == task_key)
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Setup task not found")
    task.is_done = patch.is_done
    db.commit()
    return serialize_setup(db, tenant)
