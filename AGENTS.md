# AGENTS.md — F&B OS

Phase 1: foundation, menu management and the recipe builder are real, working
features. POS, orders, customers, loyalty, reports, team and settings are still
placeholder surfaces (`ModulePage`) — do not present them as working.

## Run and verify

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml ps            # db, api, web must be healthy
curl -s localhost:3000/api/dashboard | head -c 200        # proxied API through the web origin
curl -s localhost:3000/api/menu | head -c 200             # menu + computed recipe cost
curl -s localhost:3000/api/ingredients | head -c 200      # ingredient catalog
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
  the next migrate run. Re-running the seed after a deploy is safe:
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
