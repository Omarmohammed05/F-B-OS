# F&B OS

Smart F&B micro-ERP for Egyptian restaurants and cafés. This repository contains
**Phases 0–1** — an Arabic-first (RTL), calm Apple-style application shell with
language/dark-mode switching, the store setup flow, an illustrative operations
dashboard, and working **menu management** plus the **recipe builder** on top of
an ingredient catalog. Later modules (POS, orders, customers, loyalty, reports,
team) remain navigation destinations with explicit "coming soon" surfaces.

## What works

- **Menu** (`/menu`) — bilingual categories and products, prices, emoji tiles,
  availability switches, search and category filters, create/edit/delete.
- **Recipe builder** (`/menu/:id/recipe`) — link ingredients and quantities to a
  product; plate cost, margin and food-cost % update live and are recalculated
  from the ingredient catalog every time. Products without a recipe are flagged.
- **Ingredients** (`/inventory`) — raw materials with unit, cost per unit and
  on-hand quantity; these costs drive every recipe. Used ingredients can't be
  deleted until removed from their recipes.

API: `/api/menu`, `/api/menu/categories`, `/api/menu/products`,
`/api/menu/products/{id}/recipe`, `/api/ingredients` (interactive docs at
http://localhost:8000/docs).

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
