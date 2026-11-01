"""Shared fixtures for the security suite.

The tests run against the app's own database (there is no separate staging copy
in the sandbox), so every test creates its own rows with unique names and removes
exactly those rows again. Nothing seeded is edited or deleted.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.main import app

# A caller address of its own, so rate-limit tests never spend the budget of the
# real app or of another test. The limiter keys on X-Forwarded-For when the proxy
# sets it, which is exactly what this header imitates.
RATE_LIMIT_CALLER = {"x-forwarded-for": "203.0.113.7"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
