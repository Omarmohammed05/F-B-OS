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

Then open http://localhost:3000. First boot runs `migrate` (creates tables and,
because the compose file sets `SEED_DEMO_DATA=1`, seeds the demo store
"Qahwa House" / "بيت القهوة").

You land on the sign-in page. The seed creates one owner account so the first
login works — **`admin` / `sufra1234`**, the development pair
`docker-compose.base44.yml` passes in `SUFRA_OWNER_USERNAME` /
`SUFRA_OWNER_PASSWORD`. Those are the only credentials in the repo; the code
itself has none. Change the password from the Team page before real use, and add
the rest of the team from there (only an admin can create users).

```bash
docker compose -f docker-compose.base44.yml ps      # service health
docker compose -f docker-compose.base44.yml logs -f api
```

## Deploy to Vercel

One Vercel project with two **services** from this repository — the API and the
SPA — sharing one Postgres database. The root `vercel.json` declares them and
routes `/api/*` and `/docs` to the `sufra-api` service and every other path to
the `sufra-web` service, so the browser stays on a single origin and the session
cookie keeps working.

The full from-scratch runbook — the services, every environment variable, the
owner account and troubleshooting — is in [`DEPLOY.md`](DEPLOY.md).

1. **Database.** Create a Postgres database (Neon, Supabase, RDS) and copy its
   pooled connection string in SQLAlchemy form:
   `postgresql+psycopg2://USER:PASSWORD@HOST/DB?sslmode=require`.

2. **The project.** Import this repository with the **repository root** as the
   Root Directory. The root `vercel.json` declares both services — `sufra-api`
   (`apps/api`, framework `fastapi`) and `sufra-web` (`apps/web`, framework
   `vite`) — plus the top-level rewrites that publish them. Environment
   variables (set on the project; `sufra-api` is their only reader):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the pooled connection string above |
   | `GOOGLE_WALLET_ISSUER_ID` | optional — Google Wallet issuer id |
   | `GOOGLE_WALLET_SERVICE_ACCOUNT` | optional — the whole service-account key JSON |

3. **First owner account.** The demo store is development only (`SEED_DEMO_DATA`
   is unset in production), so a fresh database starts empty except for the owner.
   Run the seed once against it:

   ```bash
   cd apps/api
   pip install -r requirements.txt
   DATABASE_URL='postgresql+psycopg2://...' \
     SUFRA_OWNER_USERNAME=owner SUFRA_OWNER_PASSWORD='a long password' \
     python -m app.seed
   ```

   It creates the tables, the store row and that one owner sign-in. Sign in, set
   the store name, currency and tax rate on **Settings**, then add the team from
   **Team** (the owner creates a restaurant's admin, an admin adds everyone else).
   Without `SUFRA_OWNER_PASSWORD` the seed creates no account.

4. **Deploy** (`vercel --prod`, or push and let the Git integration build). The
   API function re-runs `create_all`/`ensure_columns` on a cold start, which is
   idempotent; rate-limit counters live in the function instance, so a large team
   would move them to Redis (see `SECURITY.md`).

The sign-in page lists no test accounts: every account is created by the owner or
an admin from **Team**.

## Security

`SECURITY.md` maps the hardening plan onto this stack item by item. In short:
every query is scoped by the store the API resolves from the database, money is
always recomputed server-side, `POST /api/orders` accepts an `Idempotency-Key`,
business flows carry their own rate limits (429 + `Retry-After`), and the actions
that move money, stock or access leave append-only `audit_logs` rows
(`GET /api/audit`). Cost, margin and food cost never reach a cashier's or a
kitchen's payload, and only a manager or an admin may move a price. Manager PINs
and blind close are the outstanding items before a real restaurant goes live.

```bash
docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
```

## Languages and theme

Arabic (RTL) is the default; English is one click away from the top bar or the
sidebar footer. The choice and the light/dark preference are stored in
`localStorage` (`fbos.lang`, `fbos.theme`). The accent color comes from the tenant
record (`tenants.accent_color`, default `#0A84FF`).
