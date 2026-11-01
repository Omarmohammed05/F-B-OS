# Sufra OS

Smart F&B micro-ERP for Egyptian restaurants and cafés. This repository contains
**Phases 0–6** — an Arabic-first (RTL), calm Apple-style application shell with
language/dark-mode switching and the store setup flow, plus working **menu
management**, the **recipe builder**, the **POS and orders board**, the
**customer book**, **reports** computed from real orders, the **team roster**,
a **live dashboard**, a **settings** surface that edits the store itself and
**loyalty stamp cards** with points and tiers.

## What works

- **Dashboard** (`/`) — KPIs, the 7-day revenue chart, popular items, recent
  activity and the payment split are all computed from real orders; open tickets
  drive the pending / in-progress counts and the available-table figure.
- **Menu** (`/menu`) — bilingual categories and products, prices, emoji tiles,
  availability switches, search and category filters, create/edit/delete.
- **Recipe builder** (`/menu/:id/recipe`) — link ingredients and quantities to a
  product; plate cost, margin and food-cost % update live and are recalculated
  from the ingredient catalog every time. Products without a recipe are flagged.
- **Ingredients** (`/inventory`) — raw materials with unit, cost per unit and
  on-hand quantity; these costs drive every recipe. Used ingredients can't be
  deleted until removed from their recipes.
- **POS & orders** (`/pos`, `/orders`) — build a ticket, send it to the kitchen,
  then move it new → preparing → served on the live board.
- **Customers** (`/customers`) — guest profiles with visits, lifetime spend and
  order history. A ticket with a guest name adds that guest automatically.
- **Reports** (`/reports`) — net sales, orders, average ticket, food cost and
  margin for the last 7 or 30 days, top products, channel and payment splits,
  and a CSV export.
- **Team** (`/team`) — staff with roles (owner, manager, cashier, kitchen) and an
  active toggle; the store always keeps one active owner.
- **Settings** (`/settings`) — the store's own record: name in both languages,
  accent color, currency, tax rate and how many tables the POS offers. Every
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
`/api/customers`, `/api/loyalty`, `/api/reports`, `/api/reports/export.csv`,
`/api/team`, `/api/settings` (interactive docs at http://localhost:8000/docs).

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

```bash
docker compose -f docker-compose.base44.yml ps      # service health
docker compose -f docker-compose.base44.yml logs -f api
```

## Languages and theme

Arabic (RTL) is the default; English is one click away from the top bar or the
sidebar footer. The choice and the light/dark preference are stored in
`localStorage` (`fbos.lang`, `fbos.theme`). The accent color comes from the tenant
record (`tenants.accent_color`, default `#0A84FF`).
