# Sufra OS

Smart F&B micro-ERP for Egyptian restaurants and cafés. This repository contains
**Phases 0–8** — an Arabic-first (RTL), calm Apple-style application shell with
language/dark-mode switching and the store setup flow, plus working **menu
management**, the **recipe builder**, the **POS and orders board**, the
**customer book**, **reports** computed from real orders, the **team roster**,
a **live dashboard**, a **settings** surface that edits the store itself,
**loyalty stamp cards** with points, tiers and Google Wallet passes, a
**stock ledger** that deducts ingredients when a ticket is served, daily
**checklists** and an **attendance clock**. It installs on a phone or a counter
tablet as a PWA.

## What works

- **Dashboard** (`/`) — KPIs, the 7-day revenue chart, popular items, recent
  activity and the payment split are all computed from real orders; open tickets
  drive the pending / in-progress counts and the available-table figure.
- **Menu** (`/menu`) — bilingual categories and products, prices, emoji tiles,
  availability switches, search and category filters, create/edit/delete.
- **Recipe builder** (`/menu/:id/recipe`) — link ingredients and quantities to a
  product; plate cost, margin and food-cost % update live and are recalculated
  from the ingredient catalog every time. Products without a recipe are flagged.
- **Ingredients** (`/inventory`) — raw materials with unit, cost per unit,
  on-hand quantity and a par level; these costs drive every recipe. A served
  ticket deducts the recipe ingredients it used, deliveries and waste are recorded
  by hand, and the stock ledger shows every change with its reason. Used
  ingredients can't be deleted until removed from their recipes.
- **POS & orders** (`/pos`, `/orders`) — build a ticket, send it to the kitchen,
  then move it new → preparing → served on the live board.
- **Customers** (`/customers`) — guest profiles with visits, lifetime spend and
  order history. A ticket with a guest name adds that guest automatically.
- **Reports** (`/reports`) — net sales, orders, average ticket, food cost and
  margin for the last 7 or 30 days, top products, channel and payment splits,
  and a CSV export.
- **Sign-in and the tour** (`/login`, `/onboarding`) — the whole app sits behind a
  staff account. The first sign-in opens a seven-step tour of what the app does,
  and it can be reopened from the account menu.
- **Team** (`/team`) — staff with roles (admin, owner, manager, cashier, kitchen)
  and an active toggle; the store always keeps one active owner and one active
  admin. Only an admin can add people, give them a username and password, or change
  a role — an admin may create any role, including another admin.
- **Attendance** (`/attendance`) — clock in when the shift starts and out when it
  ends. The day board shows who is on the floor, their arrival and departure, and
  the hours worked; a manager can punch a teammate in or out from the counter
  tablet. Looking at an earlier day shows that day's board. An admin sets the
  shift start and its grace period in Settings, and every late minute after that
  is deducted from the salary at a rate the admin chooses — the board shows each
  person's lateness and the day's total deduction. A manager or an admin is never
  deducted, only the staff they run the shift with. Because people work different
  shifts, the **Month** tab gives each person their own start time and grace
  window (a manager or admin sets them right in the table), and it collects the
  whole month in one place: days worked, hours, late days and the money taken off.
- **Installable app** — the web app ships a manifest and a service worker, so it
  can be added to a phone or tablet's home screen and opens full screen. Losing
  the connection shows the app's own offline page instead of the browser's.
- **Settings** (`/settings`) — the store's own record: name in both languages,
  accent color, currency, tax rate, how many tables the POS offers, and the
  attendance rule (shift start, grace minutes, deduction per late minute). Every
  change is written straight to the records the rest of the app reads.
- **Google Wallet** — a member's card can be saved to the guest's phone with the
  "Add to Google Wallet" button, and stamps/points are pushed onto the saved pass
  whenever the card changes. It stays hidden until
  `GOOGLE_WALLET_ISSUER_ID` and `GOOGLE_WALLET_SERVICE_ACCOUNT` (the service
  account key JSON) are set; see AGENTS.md for the demo-mode caveats.
- **Loyalty** (`/loyalty`) — stamp cards for the guests in your book: stamp a
  card at the counter (served tickets stamp automatically), hand over the reward
  when it is full, and read points and tiers that follow real lifetime spend.

API: `/api/menu`, `/api/menu/categories`, `/api/menu/products`,
`/api/menu/products/{id}/recipe`, `/api/ingredients`, `/api/pos`, `/api/orders`,
`/api/customers`, `/api/loyalty`, `/api/ingredients/{id}/movements`,
`/api/reports`, `/api/reports/export.csv`, `/api/team`, `/api/settings`,
`/api/checklists`, `/api/attendance`, `/api/audit` (interactive docs at
http://localhost:8000/docs).

Every route except `/api/health` needs a session; `POST /api/auth/login`,
`POST /api/auth/logout`, `GET /api/auth/me` and `POST /api/auth/onboarding` are
the session's own endpoints.

## Stack

| Part | Tech | Dev URL |
|---|---|---|
| `apps/web` | React 18 + Vite + TypeScript + Tailwind | http://localhost:3000 |
| `apps/api` | FastAPI + SQLAlchemy | http://localhost:8000 (`/docs`) |
| `db` | PostgreSQL 16 | internal |

The browser talks to `/api/*` on the web origin; Vite proxies it to the API, so
there is a single origin (no CORS needed for the app itself).

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

Then open http://localhost:3000. First boot runs `migrate` (creates tables and
seeds the demo store "Qahwa House" / "بيت القهوة").

You land on the sign-in page. The seed creates one admin account so the first
login works — **`admin` / `sufra1234`** — and the first sign-in shows the product
tour. Change that password from the Team page before real use, and add the rest of
the team from there (only an admin can create users).

```bash
docker compose -f docker-compose.base44.yml ps      # service health
docker compose -f docker-compose.base44.yml logs -f api
```

## Security

`SECURITY.md` maps the hardening plan onto this stack item by item. In short:
every query is scoped by the store the API resolves from the database, money is
always recomputed server-side, `POST /api/orders` accepts an `Idempotency-Key`,
business flows carry their own rate limits (429 + `Retry-After`), and the actions
that move money, stock or access leave append-only `audit_logs` rows
(`GET /api/audit`). Staff sign-in and roles are the outstanding item before a real
restaurant goes live.

```bash
docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
```

## Languages and theme

Arabic (RTL) is the default; English is one click away from the top bar or the
sidebar footer. The choice and the light/dark preference are stored in
`localStorage` (`fbos.lang`, `fbos.theme`). The accent color comes from the tenant
record (`tenants.accent_color`, default `#0A84FF`).
