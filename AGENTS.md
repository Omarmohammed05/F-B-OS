# AGENTS.md — F&B OS

Phase 3: foundation, menu management, the recipe builder, the POS, the orders
board, the customer book, real reports and the team roster are working features.
Loyalty and settings are still placeholder surfaces (`ModulePage`) — do not
present them as working.

## Run and verify

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml ps            # db, api, web must be healthy
curl -s localhost:3000/api/dashboard | head -c 200        # proxied API through the web origin
curl -s localhost:3000/api/menu | head -c 200             # menu + computed recipe cost
curl -s localhost:3000/api/ingredients | head -c 200      # ingredient catalog
curl -s localhost:3000/api/pos | head -c 200              # what the POS can sell
curl -s localhost:3000/api/orders | head -c 200           # live tickets
curl -s localhost:3000/api/customers | head -c 200        # guest book + derived stats
curl -s "localhost:3000/api/reports?days=7" | head -c 200 # sales / food cost
curl -s localhost:3000/api/team | head -c 200             # staff roster
docker compose -f docker-compose.base44.yml exec web npx tsc --noEmit
docker compose -f docker-compose.base44.yml exec web npm run build
```

There are no host language runtimes — run every node/python command inside its
service.

## Non-obvious setup facts

- `web` serves Vite on 5173, published as host **3000** (the preview entry point).
  The browser only talks to `/api/*` on that same origin; Vite proxies it to
  `http://api:8000`, so the app itself needs no CORS. The API is also published
  on host 8000 (`/docs`) for direct inspection.
- `migrate` is a one-shot service (`python -m app.seed`) that runs after Postgres
  is healthy; `api` waits for it with `service_completed_successfully`. The seed
  only inserts when a table is empty, so restarts never duplicate data — but it
  also never *updates* seeded rows. To change demo numbers, edit
  `apps/api/app/seed.py` and drop the `pgdata` volume.
- Web dependencies install at container start (`npm ci` into the named volume
  `web_node_modules`). After editing `apps/web/package.json`, regenerate the
  lockfile outside the repo:

  ```bash
  cd apps/web && docker run --rm -v "$PWD":/app -w /app node:22-alpine \
    npm install --package-lock-only
  ```

  `npm ci` fails if the lockfile and manifest disagree.
- Vite accepts the preview host through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`
  (passed bare in compose), plus a `.${BASE44_SANDBOX_HOST_DOMAIN}` allowlist in
  `vite.config.ts` that applies **only** when `BASE44_PREVIEW_MODE === "1"`.
  Unset, Vite's default host checks apply.
- Accent color is tenant data (`tenants.accent_color`, default `#0A84FF`), applied
  to `--accent` at runtime after `/api/dashboard` loads. Language and theme live in
  `localStorage` (`fbos.lang`, `fbos.theme`); Arabic RTL is the default.
- Dashboard numbers, revenue series, popular items and recent orders are seeded
  illustrative data in `apps/api/app/seed.py` — not real analytics. Item imagery
  is emoji on a neutral tile; there are no product photos in Phase 0.
- Setup progress is real persisted state (`setup_tasks`, `PATCH /api/setup/{key}`).
  Seeded with 6 of 7 done so the "finish setup" flow is visible on first load.

## Phase 1: menu, ingredients and recipes

- Tables: `menu_categories`, `products`, `ingredients`, `recipe_lines`. There is
  no Alembic — `migrate` runs `Base.metadata.create_all`, so new tables appear on
  the next migrate run. The API also runs the same idempotent `create_all` in its
  startup lifespan, so a `uvicorn --reload` restart after a model edit never
  serves a 500 for a not-yet-created table. Re-running the seed after a deploy is safe:
  `docker compose -f docker-compose.base44.yml exec -T api python -m app.seed`.
- Menu + ingredient seed data is matched by **English name**, so a partially
  seeded database is completed without duplicates. Seeded rows are still never
  updated; drop the `pgdata` volume to re-seed from scratch.
- A product's cost is always derived: `sum(recipe_lines.qty × ingredients.unit_cost)`
  (EGP per stored unit), never stored. `margin = price − cost`; `margin_pct` is
  the gross margin share of price.
- Endpoints: `GET/POST/PATCH/DELETE /api/menu/categories[/{id}]`,
  `.../api/menu/products[/{id}]`, `GET|PUT /api/menu/products/{id}/recipe`,
  `GET/POST/PATCH/DELETE /api/ingredients[/{id}]`. Category mutations return the
  whole menu payload; recipe PUT replaces all lines for the product.
- Deleting a category that still has products, or an ingredient used by a recipe,
  returns **409**. The UI disables those actions instead of relying on the error.
- UI routes: `/menu` (categories + products + availability), `/menu/:productId/recipe`
  (recipe builder with live cost/margin), `/inventory` (ingredient catalog).
- To exercise the write paths without touching seeded rows: create a product and
  a category, edit them, build its recipe, then delete the product and category.
  Deleting the product removes its recipe lines.

## Phase 2: POS and orders

- Tables: `orders`, `order_items`. The seed adds eight demo tickets (#1001–#1008)
  across new / preparing / served / cancelled, only when `orders` is empty.
- Money is stored on the order (`subtotal`, `tax`, `total`), and each line
  snapshots the product name, emoji and unit price, so menu edits never rewrite
  history. `order_items.product_id` is a plain integer with **no** foreign key,
  which keeps deleting a product safe.
- Tax is computed server-side from `tenants.tax_rate` (14%):
  `total = subtotal + subtotal × rate`. The client never sends a price or a total.
- `number` is `1001 + max(orders.id)`: unique without a database sequence.
- Accepted status moves: `new → preparing | cancelled`,
  `preparing → served | cancelled`. `served` and `cancelled` are final; anything
  else returns **409**.
- Endpoints: `GET /api/orders` (newest first, 200 cap),
  `POST /api/orders` (`{channel, table_no?, customer_name?, payment_method?,
  note?, items: [{product_id, qty}]}`, 201 with the created order),
  `PATCH /api/orders/{id}` (`{status}`), `GET /api/pos` (active categories +
  available products, `tax_rate`, `table_count`). POST rejects dine-in without a
  table (400), unknown products (400) and unavailable products (409).
- The POS table picker is simply 1…`table_count`, where `table_count` comes from
  `daily_metrics.total_tables` — illustrative seed data, not a real table map.
  There is no shift, split payment or stock deduction on sale yet.
- UI routes: `/pos` (grid + cart, channel, table/customer, payment, send) and
  `/orders` (new / preparing / served columns plus a cancelled list, detail sheet
  with the same status actions, 20s silent refresh).
- The dashboard KPIs and recent activity are still the illustrative seed rows —
  they do not read from `orders`. Only the orders board shows real tickets.
- Exercise the write paths with your own ticket: place one in the POS, move it
  new → preparing → served on the board, then delete that order (its items first)
  if it was only a test.

## Phase 3: customers, reports and the team

- Tables: `customers`, `staff`, plus `orders.customer_id`. That column is a plain
  integer defaulting to **0** (no foreign key), so deleting a guest never rewrites
  or breaks an order; deleting a customer only clears the link and the order keeps
  its own `customer_name` snapshot.
- `create_all` never adds a column to a table that already exists, so additive
  columns live in `ADDITIVE_COLUMNS` in `apps/api/app/db.py` and are applied by
  `ensure_columns()` (called from the API lifespan and from the seed). **A new
  column on an existing table only reaches an existing database through that
  list** — add it there as well as in `models.py`.
- The POS never sends a customer id: `POST /api/orders` resolves a named guest by
  case-insensitive name and creates the profile when it is new, so every ticket
  with a name feeds the guest book. `customer_id` can still be passed explicitly.
- Guest stats (`visits`, `spend`, `last_visit`) are derived per request from
  non-cancelled orders — nothing is stored on `customers`. Seeded guests: Mona,
  Ahmed, Sara, Omar Khaled, Nour Ibrahim; the seed also links existing demo tickets
  whose `customer_name` matches one of them.
- Endpoints: `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/{id}`
  (detail returns the guest plus their last 50 orders).
- Reports are computed from real orders only (the dashboard KPIs are still seed
  rows): `GET /api/reports?days=7|30` and `GET /api/reports/export.csv?days=7`.
  Cancelled tickets are excluded from every figure except the cancelled count.
  `revenue` is net of tax (`subtotal`); `tax` and `total` are reported separately.
  Food cost is the **current** recipe cost x quantity sold, so editing an
  ingredient's unit cost changes historical food cost but not historical revenue.
  `top_products`, `channels` and `payments` are revenue-sorted and capped at five
  products.
- Team: `GET/POST /api/team`, `PATCH/DELETE /api/team/{id}`. Roles are
  owner / manager / cashier / kitchen. The last active owner cannot be demoted,
  deactivated or deleted (**409**) — the UI shows that message instead.
- UI routes: `/customers` (searchable book, detail sheet with order history),
  `/reports` (7/30-day range, chart, margin, top products, channel/payment splits,
  CSV download) and `/team` (roster with role chips and an active toggle).
- The 30-day report passes `labelEvery` to `RevenueChart` so six day labels are
  spread across the width instead of one truncated label per bar; the dashboard
  keeps the default (every point).
- Exercise the write paths with your own rows: add a customer, open its sheet,
  rename it, delete it; add a staff member, toggle them inactive, delete them.
  Both are removed through the UI in the verification flow - leave none behind.
