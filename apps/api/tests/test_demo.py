"""The demo store: a session that reads everything and writes nothing.

The "try the demo" button on the sign-in page opens a real session over the
sample restaurant (`staff.is_demo`), and `auth.SessionGate` refuses every write
that session attempts. These checks cover the availability probe, the sign-in
itself, one read that must work and one write that must not, and signing out —
the one mutation a demo visitor is allowed.

Each test logs out again, so no demo session rows are left behind.
"""

DEMO_CALLER = {"x-forwarded-for": "198.51.100.9"}


def test_the_demo_is_offered_when_a_sample_store_exists(anonymous):
    response = anonymous.get("/api/auth/demo")
    assert response.status_code == 200, response.text
    assert response.json() == {"available": True}


def test_the_demo_opens_a_read_only_session(anonymous):
    started = anonymous.post("/api/auth/demo", headers=DEMO_CALLER)
    assert started.status_code == 200, started.text
    payload = started.json()
    assert payload["is_demo"] is True
    # The tour is part of the demo and its "finished" stamp is a write, so the
    # seeded visitor arrives already past it.
    assert payload["needs_onboarding"] is False

    # Reading works exactly like any signed-in member's.
    assert anonymous.get("/api/dashboard").status_code == 200
    assert anonymous.get("/api/menu").status_code == 200
    assert anonymous.get("/api/orders").status_code == 200

    # A write is refused before a handler sees it, whichever endpoint it is.
    settings = anonymous.patch("/api/settings", json={"table_count": 3})
    assert settings.status_code == 403
    assert "read-only" in settings.json()["detail"]

    guest = anonymous.post("/api/customers", json={"name": "Demo Visitor Row"})
    assert guest.status_code == 403

    # Signing out is the one exception, or the visitor could not leave.
    assert anonymous.post("/api/auth/logout").status_code == 200
    assert anonymous.get("/api/dashboard").status_code == 401
