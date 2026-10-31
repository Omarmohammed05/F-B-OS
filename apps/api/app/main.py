import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .deps import current_tenant
from .models import (
    ActivityRow,
    DailyMetric,
    PaymentSplit,
    PopularItem,
    RevenuePoint,
    SetupTask,
    Tenant,
)
from .routes import inventory as inventory_routes
from .routes import menu as menu_routes

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # create_all is idempotent: it keeps the schema in step with models.py when
    # uvicorn --reload restarts the API after a model edit, before the one-shot
    # `migrate` service (seed) has had a chance to run.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="F&B OS API", version="0.1.0", lifespan=lifespan)

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


app.include_router(menu_routes.router)
app.include_router(inventory_routes.router)


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


def serialize_dashboard(db: Session, tenant: Tenant) -> dict:
    metrics = db.query(DailyMetric).filter_by(tenant_id=tenant.id).first()
    revenue = (
        db.query(RevenuePoint)
        .filter_by(tenant_id=tenant.id)
        .order_by(RevenuePoint.day)
        .all()
    )
    popular = (
        db.query(PopularItem)
        .filter_by(tenant_id=tenant.id)
        .order_by(PopularItem.sort)
        .all()
    )
    activity = (
        db.query(ActivityRow)
        .filter_by(tenant_id=tenant.id)
        .order_by(ActivityRow.placed_at.desc())
        .all()
    )
    payments = (
        db.query(PaymentSplit)
        .filter_by(tenant_id=tenant.id)
        .order_by(PaymentSplit.id)
        .all()
    )

    return {
        "tenant": {
            "name_ar": tenant.name_ar,
            "name_en": tenant.name_en,
            "accent_color": tenant.accent_color,
            "plan": tenant.plan,
            "currency": tenant.currency,
            "default_language": tenant.default_language,
        },
        "metrics": {
            "pending_orders": metrics.pending_orders if metrics else 0,
            "in_progress_orders": metrics.in_progress_orders if metrics else 0,
            "total_orders": metrics.total_orders if metrics else 0,
            "available_tables": metrics.available_tables if metrics else 0,
            "total_tables": metrics.total_tables if metrics else 0,
            "sales_today": metrics.sales_today if metrics else 0,
            "sales_change": metrics.sales_change if metrics else 0,
        },
        "revenue": [{"day": p.day.isoformat(), "amount": p.amount} for p in revenue],
        "popular": [
            {
                "name_ar": p.name_ar,
                "name_en": p.name_en,
                "emoji": p.emoji,
                "orders": p.orders,
                "revenue": p.revenue,
            }
            for p in popular
        ],
        "activity": [
            {
                "number": a.number,
                "item_ar": a.item_ar,
                "item_en": a.item_en,
                "unit_price": a.unit_price,
                "table_name": a.table_name,
                "qty": a.qty,
                "status": a.status,
                "placed_at": a.placed_at.isoformat() if a.placed_at else None,
            }
            for a in activity
        ],
        "payments": [
            {"method_ar": p.method_ar, "method_en": p.method_en, "amount": p.amount}
            for p in payments
        ],
        "setup": serialize_setup(db, tenant),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return serialize_dashboard(db, current_tenant(db))


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
