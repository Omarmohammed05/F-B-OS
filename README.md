# F&B OS

Smart F&B micro-ERP for Egyptian restaurants and cafés. This repository contains
**Phase 0: the foundation** — an Arabic-first (RTL), calm Apple-style application
shell with language/dark-mode switching, the store setup flow, and an illustrative
operations dashboard. Later modules (POS, menu, inventory, loyalty, reports) are
navigation destinations with explicit "coming soon" surfaces, not working features.

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
