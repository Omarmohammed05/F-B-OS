# SECURITY.md — Sufra OS

The hardening plan, applied to **this** stack. The plan is written for a
Base44 entity app; this repository is a FastAPI + Postgres + React monorepo, so
RLS/FLS, entity update rules, the platform security scan and the entity-level
`filter()` operators simply do not exist here. What follows maps every item to
**done**, **not applicable (why)** or **outstanding**, so the release gate is a
fact rather than a hope.

Run the suite before every release:

```bash
docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
```

## The one structural difference

The restaurant behind a request is taken from **the session, never from the
request body or query string**: `auth.SessionGate` stamps the signed-in member's
`tenant_id` into a context variable and `deps.current_tenant` reads it, so a
caller cannot ask for another store's data and no read/write schema exposes a
`tenant_id`. The documented exceptions are platform-owner-only and explicit:
reading another restaurant's roster (`GET /api/team?restaurant_id=…`), creating an
account in it (`POST /api/team` with `restaurant_id`), and the whole
`/api/restaurants` + `/api/income` surface — all answer **403** for anyone who is
not an `owner`, and every write is re-resolved server-side. The
tests prove ids from a second store in the same database answer exactly like ids
that do not exist.

**Staff sign-in exists** (`apps/api/app/auth.py`): every `/api` route except the
health probe and the login/logout pair answers **401** without a live session
cookie, so the app is no longer open to anyone who can reach it. What is still
missing is *authorization inside* an authenticated session — a cashier sees the
same costs, margins and guest book an owner does, because roles only gate account
management today (see the gate table).

## P0 — before launch

| Plan item | Status |
|---|---|
| 3.1 Tenant isolation: every table carries `tenant_id`, every query filters on it | **Done.** 35 `tenant_id ==` filters; `tests/test_security.py::test_another_stores_products_are_invisible_and_untouchable` and `::test_cannot_order_another_stores_product` cover read, write and order paths. |
| 3.1 `tenant_id` never trusted from the client | **Done.** No request schema has a `tenant_id` field; Pydantic drops unknown keys. |
| 3.1 Every id is checked against the caller's store | **Done.** `get_order`, `get_product`, `get_category`, `get_ingredient`, `get_customer`, `get_staff`, `get_card` all filter by tenant and raise 404. |
| 3.1 Guest-facing handles are random, not sequential | **Done.** `customers.qr_token` (128-bit hex) replaces the customer row id in the Wallet barcode and `accountId`; `db.py` backfills existing guests on boot. |
| 3.2 Field-level security (hide cost/profit/cash from cashiers) | **Outstanding** — roles exist, but no payload is trimmed by role yet: a signed-in cashier sees the same costs, margins and guest book as an owner. |
| 3.2 Ledger, audit trail and derived loyalty numbers are not writable | **Done.** `stock.py` is the only writer of `stock_qty`; there are no update/delete routes on movements or audit rows (`test_ledger_and_trail_have_no_write_routes`); points are derived per request, never stored. |
| 3.3 Explicit field allow-lists (no mass assignment) | **Done.** Every write takes a Pydantic model with named fields; no endpoint spreads a request body into a model. Role/access changes go through `PATCH /api/team/{id}` only. |
| 3.3 Function-level authorization (`requireRole`) | **Done for accounts and the platform surface, outstanding elsewhere.** `POST/PATCH/DELETE /api/team`, `PATCH /api/settings` and `POST /api/branches` require the restaurant `admin` (or the platform `owner`, who outranks them); `auth.require_owner` alone gates `/api/restaurants` (create, edit, block, remove) and `/api/income` (list, record and delete payments). Both roles are tested: 403 for everyone else. A member cannot remove their own account or leave a restaurant without an active admin / the platform without an active owner. Account names stay unique across restaurants (sign-in resolves the restaurant from the account), which is why the "keep one active" guards run against the member's own restaurant. Every other endpoint only requires *a* session; per-role restrictions on money, stock and settings are the remaining work. The checklist is the first operational surface with a per-role rule: a member may tick only their own list, a manager (and the admin or owner above them) may tick anyone's, and only an admin edits the checklist items themselves. |
| 3.4 Money computed server-side | **Done.** The order payload has no price or total; the server loads products and the store's tax rate, and `test_order_totals_are_recomputed_not_taken_from_the_client` sends forged `price`/`total` and proves they are ignored. |
| 3.4 Validation: qty 1–99, no negative money | **Done.** `qty` is `gt=0, le=99`; prices, costs and stock are `ge=0`; `test_order_rejects_bad_quantities`. |
| 3.4 Idempotency key | **Done.** `Idempotency-Key` header, unique per store (`ux_orders_idempotency`); a retry returns the original ticket, a race is caught by the unique index. |
| 3.5 Secrets only in the vault | **Done.** `GOOGLE_WALLET_ISSUER_ID` and `GOOGLE_WALLET_SERVICE_ACCOUNT` arrive through `/run/base44/app.env`; nothing in the repo or the browser. |
| 3.5 Wallet tokens signed server-side; ids derived, never client-supplied | **Done.** `wallet.save_url` builds the object from the card record. |
| 3.5 Never log secrets or full tokens | **Done.** Startup logs only `wallet.problem()` (a field name, never a value). |
| 3.6 Integration calls only from the backend | **Done by construction.** The only outbound integrations are Google Wallet calls in `wallet.py`; there is no LLM, email or upload surface. |

## P1 — before the second customer

### 3.7 App-level rate limits (`app/security.py`)

| Flow | Budget | Status |
|---|---|---|
| Password guessing (`POST /api/auth/login`) | 10 / minute per caller | Done — 429 + `Retry-After` |
| Wallet save link (`GET /api/loyalty/cards/{id}/wallet-link`) | 5 / hour **per card** | Done — 429 + `Retry-After` |
| CSV export (`GET /api/reports/export.csv`) | 5 / hour per caller | Done, tested |
| Order creation (`POST /api/orders`) | 120 / minute per caller | Done |
| Any mutation (`POST/PATCH/PUT/DELETE`) | 300 / minute per caller | Done |
| Manager PIN verify, public QR order, phone lookup, WhatsApp sends, uploads | — | **Not applicable**: none of those endpoints exist |

Counters live in the API process, so a multi-worker or multi-host deployment needs
a shared store (Redis) — one line to swap in `Hardening._reject`. Behind the Vite
proxy every caller shares one source address, so budgets are effectively per store
until staff sign-in gives each session its own identity.

### 3.8 Injection

- **Operator injection** — not reachable: filters are built server-side from typed
  primitives and SQLAlchemy parameterises every statement. Objects/arrays where a
  string is expected are rejected by Pydantic (`test_operator_style_payloads_never_reach_the_query`).
- **XSS** — React escapes all text; there is no `dangerouslySetInnerHTML` or
  `innerHTML` on user data in `apps/web` (grepped).
- **CSV/Excel injection** — the only export writes dates and numbers; no user text
  reaches a spreadsheet cell. Revisit when a guest/orders export is added.
- **Uploads, SSRF, prompt injection** — not applicable: no uploads, no
  user-supplied URLs are fetched, no LLM surface.

### 3.9 Webhooks

**Not applicable** — there is no WhatsApp/webhook endpoint in this app.

### 3.10 Google Wallet

| Item | Status |
|---|---|
| Key is vault-only, least privilege | Done (service account in the vault) |
| Only card fields in the pass (name, points, stamps, reward) — no phone or email | Done; barcode carries the opaque `qr_token` |
| Save link requires ownership of the card | **Partial.** Minting a link now needs a signed-in session and is limited to 5/hour per card, but any signed-in member can ask for any card's link — the link belongs to the guest who saves it, and per-role scoping is still missing. |
| Rate limited | Done (5/hour per card) |
| Wallet is never the source of truth | Done — points are derived from orders, pushes are best effort |
| Demo mode until Google approves publishing | Noted in AGENTS.md (Phase 7) |

## P2 — hardening and operations

| Item | Status |
|---|---|
| Redemption is one transaction, one reward | Done (`POST /cards/{id}/redeem` 409 unless full) |
| Points/stamps reverse on refund/void | **Outstanding** — there is no refund or payment capture yet; a cancelled ticket awards nothing, which is the closest existing guarantee |
| Discount / void / price edit behind a manager PIN | **Outstanding** — needs roles and a PIN |
| Audit trail for money, stock and access actions | **Done.** `audit_logs` (append-only) records `order.served`, `order.cancelled`, `stock.purchase|waste`, `ingredient.edit`, `product.price`, `staff.access`, `staff.delete`, `settings.update`, `branch.create`, `branch.activate`, `loyalty.stamp|redeem|remove|program`; read it at `GET /api/audit` |
| Alerts to the owner (voids, variance, failures) | **Outstanding** — needs notifications and roles |
| Staff sign-in, PIN hashing, lockout, session lifetime | **Done for passwords; PINs are not used.** PBKDF2-SHA256 (240k iterations), per-store unique usernames, one 401 message for a wrong name or password, `auth_sessions` stores only a SHA-256 fingerprint of the cookie token, 7-day sessions, sessions deleted with the member, sign-in limited to 10/minute. Account lockout after repeated failures is not implemented — the rate limit is the only brake. |
| Security headers | **Partial.** `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store`, `X-Frame-Options` on every API reply. **CSP is not set here**: the SPA is served by the Vite dev server, so a strict policy must be added at the reverse proxy/CDN in front of a production build |
| Personal data (guest phone numbers) | Collected for receipts and the guest book; deleting the customer clears it and keeps the order snapshot. **Before scaling**, confirm Egypt's PDPL obligations and add a documented deletion request path |
| Backups / restore rehearsal | **Outstanding** — no scheduled export exists yet |
| Dependency review | `requirements.txt` and the npm lockfile are pinned; no automated scan runs in the sandbox |

## Tests (`apps/api/tests/`)

20 checks, all passing, all cleaning up after themselves:

- security headers, rate limit (429 + `Retry-After`)
- money recomputed from the menu, not the client
- quantity/table/operator-injection rejections
- cross-store read, write and order attempts
- idempotent retry vs. two distinct tickets
- serving deducts stock exactly once, second serve is 409, audit row written
- append-only ledger and trail have no write routes
- guest handle is 32 hex characters and the pass barcode uses it

Not covered, and honest about it: role-based walkthroughs (§4.3), the k6 load test
and reconciliation (§4), OWASP ZAP, and anything under §3.11–3.13 that needs
sign-in, shifts or payments — none of which exist in this build.

## Release gate

| Gate | Status |
|---|---|
| Tenant isolation tests: 0 failures | ✅ |
| Mass-assignment and function-level tests | ⚠️ mass assignment ✅; function-level **blocked on roles** |
| Order tamper, idempotency and concurrency tests | ✅ (concurrency covered by the unique index, not by a load test) |
| Blind close | N/A — no shifts yet |
| Rate limits verified (PIN, public order, loyalty, export) | ⚠️ loyalty + export ✅, tested; PIN/public order do not exist |
| Webhook signature tests | N/A |
| No secrets in frontend, entities or logs | ✅ |
| Security scan clean | ⚠️ no scanner available in the sandbox; headers and dependencies reviewed by hand |
| Backup export tested, restore rehearsed | ❌ outstanding |
| Owner alerts | ❌ outstanding (needs roles + notifications) |

**Verdict: harden-what-exists is done; going live needs staff sign-in with roles
and a PIN, then the P2 items that depend on it.**
