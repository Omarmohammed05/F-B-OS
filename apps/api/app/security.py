"""App-level abuse control and response hardening.

Business flows carry their own budgets here, because a platform- or proxy-level
limit cannot know that minting a Wallet save link costs a Google round trip while
a counter tablet legitimately sends tickets in bursts.

The counters live in this process. A single-container deployment is fine; running
several API workers or hosts would need a shared store (Redis) so every worker
sees the same budget — see SECURITY.md.
"""

from __future__ import annotations

import re
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


def new_token() -> str:
    """128 bits of randomness as 32 hex characters.

    Used where a public, non-guessable handle is needed instead of a sequential
    primary key (the loyalty pass barcode).
    """
    return secrets.token_hex(16)


def ensure_token(customer) -> str:
    """The guest's opaque public handle, minted for a new profile.

    `ensure_columns()` backfills it for rows created before the column existed,
    so an existing store never carries an empty handle.
    """
    if not customer.qr_token:
        customer.qr_token = new_token()
    return customer.qr_token


def client_host(request: Request) -> str:
    """Best-effort caller address, for rate limits and the audit trail."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:60]
    return (request.client.host if request.client else "")[:60]


@dataclass(frozen=True)
class Rule:
    """One budget: `limit` requests per `window` seconds."""

    methods: tuple[str, ...]
    pattern: str
    limit: int
    window: int
    # Key the budget on the card in the path instead of the caller address, so a
    # single guest's save link cannot be farmed from many addresses.
    by_card: bool = False


# Specific budgets first: the first matching rule wins.
RULES: tuple[Rule, ...] = (
    # Guessing a password is the one flow where ten tries a minute is plenty.
    Rule(("POST",), r"^/api/auth/login$", 10, 60),
    # Setting a password through an activation link is a sign-in in all but name.
    Rule(("POST",), r"^/api/invites/[0-9a-f]{32}$", 10, 60),
    Rule(("GET",), r"^/api/loyalty/cards/(?P<card>\d+)/wallet-link$", 5, 3600, by_card=True),
    Rule(("GET",), r"^/api/reports/export\.csv$", 5, 3600),
    Rule(("POST",), r"^/api/orders$", 120, 60),
    Rule(("POST", "PATCH", "PUT", "DELETE"), r"^/api/", 300, 60),
)

_COMPILED = tuple((rule, re.compile(rule.pattern)) for rule in RULES)


class RateLimited(JSONResponse):
    def __init__(self, retry_after: int):
        super().__init__(
            {"detail": "Too many requests. Try again shortly."},
            status_code=429,
            headers={"Retry-After": str(retry_after)},
        )


class Hardening(BaseHTTPMiddleware):
    """Rate limits on business flows plus the security headers on every reply."""

    def __init__(self, app):
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _matched(self, request: Request):
        for rule, rx in _COMPILED:
            if request.method not in rule.methods:
                continue
            match = rx.match(request.url.path)
            if match:
                return rule, match
        return None, None

    def _reject(self, request: Request) -> Response | None:
        rule, match = self._matched(request)
        if rule is None:
            return None
        identity = match.group("card") if rule.by_card else client_host(request)
        key = f"{rule.pattern}:{identity}"
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > rule.window:
            hits.popleft()
        if len(hits) >= rule.limit:
            return RateLimited(rule.window)
        hits.append(now)
        return None

    async def dispatch(self, request: Request, call_next):
        rejected = self._reject(request)
        if rejected is not None:
            return rejected
        response = await call_next(request)
        return harden(response, request.url.path)


def harden(response: Response, path: str) -> Response:
    """Headers that cost nothing and close whole classes of browser bugs."""
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if path.startswith("/api"):
        # Tenant data is personal data: never let a proxy or the browser keep it.
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Frame-Options", "DENY")
    return response
