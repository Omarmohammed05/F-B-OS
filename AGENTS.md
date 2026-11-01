# AGENTS.md — Sufra OS

Phases 0–9: foundation, menu management, the recipe builder, the POS, the orders
board, the customer book, real reports, the team roster, a live dashboard, the
store settings surface, loyalty stamp cards with Google Wallet passes, the stock
ledger (automatic deduction on served tickets) and the security hardening pass
(rate limits, audit trail, idempotent tickets, opaque guest handles) are all
working features. Every navigation destination now has a real page, so the old
`ModulePage` placeholder and `lib/modules.ts` are gone — a URL that matches no
route renders `NotFound`. `SECURITY.md` maps the hardening plan item by item and
states what is still outstanding (staff sign-in and roles, above all).

## Run and verify

The app is behind a sign-in, so every `/api` call below needs a session cookie.
Sign in once with the seeded demo admin (`admin` / `sufra1234`, see the last
section) and reuse the jar:

```bash
curl -s -c /tmp/jar -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"sufra1234"}'
curl -s -b /tmp/jar localhost:3000/api/dashboard | head -c 200
```

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
curl -s localhost:3000/api/branches | head -c 200         # locations + active one
curl -s localhost:3000/api/settings | head -c 200         # store profile + tables
curl -s localhost:3000/api/loyalty | head -c 200          # program + member cards
curl -s localhost:3000/api/ingredients | head -c 300      # stock balances + ledger
docker compose -f docker-compose.base44.yml exec web npx tsc --noEmit
docker compose -f docker-compose.base44.yml exec web npm run build
docker compose -f docker-compose.base44.yml exec -T api python -m pytest tests -q
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
- Every dashboard figure is computed from real orders (see Phase 4). The only
  seeded value it still reads is `daily_metrics.total_tables` — the store's table
  count, which the POS table picker shares. Item imagery is emoji on a neutral
  tile; there are no product photos.
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
- The POS board and the dashboard both read the same `orders` rows (see Phase 4);
  nothing on the dashboard is illustrative any more.
- An order's timestamp column is **`orders.placed_at`** (there is no
  `created_at` on `orders`); ad-hoc `psql` queries that assume `created_at` fail
  with `column "created_at" does not exist` in the `db` logs. Other tables
  (`audit_logs`, `stock_movements`, `customers`) do use `created_at`.
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
  list** — add it there as well as in `models.py`. Add both in the same save:
  `uvicorn --reload` restarts on the `models.py` edit alone, so the request made
  before the `db.py` edit lands logs one `column ... does not exist` 500 in the
  `db` logs until the next reload applies the `ALTER`. That window is a reload
  artefact, not a schema bug — check `\d orders` and the endpoint before chasing it.
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

## Phase 4: live dashboard

- `GET /api/dashboard` is built in `apps/api/app/dashboard.py` from `orders` and
  `order_items`; `main.py` only adds the setup block. The payload shape is
  unchanged, so the dashboard components did not need to know.
- Window is the **last 7 days** (the chip under the title says so):
  `revenue` is a zero-filled day series of net sales (`subtotal`) for
  non-cancelled orders, `total_orders` and `popular` use the same window, and
  `payments` is the collected gross (`total`) by method for that window.
  `sales_change` is the percentage change of the window against the 7 days
  before it (0 when the earlier window is empty).
- Live counts ignore the window: `pending_orders` / `in_progress_orders` count
  `new` / `preparing` tickets, and `available_tables` is
  `daily_metrics.total_tables` minus the distinct tables held by open dine-in
  tickets.
- `popular` counts orders containing the item and sums line revenue, capped at
  five and sorted by revenue. `activity` is one row per item line of the eight
  newest tickets, capped at eight rows.
- `activity.table_name` is language-neutral (`#12`, or `—` when the ticket has no
  table), because the column renders the raw string in both languages. Several
  activity rows can share one order number, so the React key is
  `number-index` — keying on `number` alone warns about duplicate keys.
- The Phase-0 seed tables `revenue_points`, `popular_items`, `activity_rows`,
  `payment_splits` and the `daily_metrics` KPI columns are no longer read by the
  API. They are left in place so existing databases keep working; drop them only
  together with their models and seed block.
- Verify against `/api/dashboard` rather than fixed numbers: compare the KPI
  cells and the activity table with the JSON, since the values follow the
  tickets in the database.

## Phase 5: store settings

- `GET /api/settings` and `PATCH /api/settings` edit the single `tenants` row plus
  `daily_metrics.total_tables`. There is no settings table and no new schema —
  the page writes to records every other module already reads.
- Fields: `name_ar`, `name_en`, `accent_color` (`#rrggbb`), `currency` (3 upper-case
  letters), `tax_rate` (0–100) and `table_count` (0–200). Invalid values are
  rejected by Pydantic (**422**), so the page validates the same ranges first.
- `table_count` cannot drop below the number of distinct tables held by **open**
  dine-in tickets (`new`/`preparing`) — that returns **409**. The dashboard derives
  `available_tables` from this count, so a smaller number would report a negative
  floor. `service.open_tables` in the payload drives the hint under the field.
- Every value the page writes is read live elsewhere: the name feeds the sidebar
  and top bar (`/api/dashboard` tenant), the accent re-applies to `--accent` right
  after a save, the currency reaches every `formatCurrency` call, the tax rate is
  used by the **next** order (stored orders keep the tax they were charged) and
  the table count feeds the POS picker and the dashboard available count.
- UI route: `/settings` (`SettingsPage.tsx`) — profile, accent swatches, currency,
  tax and tables in three cards with a sticky save bar (Save / Discard plus the
  unsaved, saved and 409 states).
- The accent swatches are the six presets in `SettingsPage.tsx`. A tenant whose hex
  is not in that list still renders (no swatch selected) and saves it back
  unchanged; there is no free-form color input.
- Verify by saving and reading back: change the table count and accent, save,
  confirm `--accent` and the sidebar name, then walk the same form back to the
  original values. Leave the tenant row exactly as the seed wrote it.

## Phase 6: loyalty stamp cards

- Tables: `loyalty_programs` (one row per store) and `loyalty_cards` (one row per
  enrolled guest). Both are new tables, so plain `create_all` covers them; there
  is no `ADDITIVE_COLUMNS` entry. `python -m app.seed` creates the program row and
  enrolls four of the five seeded guests (Omar Khaled stays un-enrolled so the
  enroll control is visible).
- **Points are derived, never stored**: `round(lifetime net total of the guest's
  non-cancelled orders × program.points_per_currency)`. Editing the points rate or
  a ticket immediately changes every card, exactly like the guest stats on
  `/customers`. Only `stamps` and `rewards_redeemed` are transactional state.
- Tiers come from lifetime points (`apps/api/app/loyalty.py`): bronze < 200,
  silver 200–499, gold ≥ 500. `next_tier` says how many points are still missing;
  it is `null` at gold.
- `apps/api/app/loyalty.py` is the domain module (tiers, program lookup, stamp
  award, payload) and imports models only on purpose: `routes/orders.py` imports
  `award_stamp` from it, and importing a router there would close a cycle
  (`customers → orders`). `routes/loyalty.py` only holds the HTTP endpoints.
- A ticket that moves to **served** adds one stamp to its guest's card when the
  guest is enrolled and the program is active; a full card stops at the target and
  waits for a redemption. Stamping is the visit, so it happens on `served` only —
  a cancelled ticket never awards anything.
- Endpoints: `GET /api/loyalty`, `POST /api/loyalty/cards` (`{customer_id}`, 409 if
  already enrolled, 404 for an unknown guest), `DELETE /api/loyalty/cards/{id}`,
  `POST /api/loyalty/cards/{id}/stamp` (409 when the card is already full),
  `POST /api/loyalty/cards/{id}/redeem` (409 when it is not full; resets stamps to
  0 and increments `rewards_redeemed`) and `PATCH /api/loyalty/program`
  (`stamps_target` 2–20, `points_per_currency` 0–10, `reward_ar`, `reward_en`,
  `is_active`; Pydantic returns **422** outside the ranges).
- Lowering `stamps_target` clamps every card's stamps to the new target, so no
  card can hold more stamps than a reward needs. Deleting a customer deletes their
  card (a card without an owner is not rendered by the payload either).
- UI route: `/loyalty` (`LoyaltyPage.tsx`) — summary strip, the wallet card
  preview (`components/loyalty/WalletCard.tsx`, tinted with `--accent`), tier
  counts, an enroll control and the member table with stamp / redeem / remove
  actions, plus the program form. The header toggle pauses the program, which only
  stops automatic stamps from served tickets.
- Verify: stamp a card (stamps +1, `stamps_in_progress` +1), redeem a full card
  (stamps back to 0, `rewards_redeemed` +1), enroll an available guest, then remove
  that card again so the seeded set is left as it was. The seeded numbers are the
  baseline to walk back to.

## Phase 7: Google Wallet passes

- `apps/api/app/wallet.py` talks to the Google Wallet REST API with plain
  `urllib` + `PyJWT` (the only new dependency, `PyJWT[crypto]`): a signed
  `savetowallet` JWT for the "add to wallet" link and `PATCH` calls to keep a
  saved pass in sync. It imports nothing from the app, so `loyalty.py` can import
  it without the router cycle.
- Pass naming is derived, never stored: the class is
  `{issuer}.sufra_loyalty` and a member's object is `{issuer}.card_{card.id}`.
  There is no `wallet_object_id` column and no schema change.
- `GET /api/loyalty/cards/{id}/wallet-link` returns `{save_url}` and creates the
  class on first use (`ensure_class`). It answers **503** when the integration is
  not configured and **502** when Google rejects the call. The object travels
  inside the JWT, so the guest's first save needs nothing pre-created on Google's
  side.
- **A draft class cannot take objects.** Google answers `Wallet Object Class {...}
  not approved` and the guest's Google screen shows only "Something went wrong",
  so `ensure_class` submits the class (`reviewStatus` → `UNDER_REVIEW`) right after
  creating it and Google approves a test-mode issuer immediately (`approved`).
  Google also refuses a design `PATCH` on an approved class: it answers `Invalid
  review status "APPROVED". Use "UNDER_REVIEW" instead.`, so a PATCH always carries
  `reviewStatus: UNDER_REVIEW` and the class goes through review again (instantly
  for a test-mode issuer). `ensure_class` therefore compares the current class with
  the design it wants (`_design_is_current`) and only re-submits when a field —
  colours, names, logo, hero image, image modules — actually changed; a matching
  class settles into the single read. Diagnose with a direct `POST
  /loyaltyObject` against the API: its body carries Google's real reason.
- `push_wallet` mirrors stamps/redemption/points onto an already-saved pass; it is
  best effort and swallows every `WalletError`, so a Google outage never fails a
  stamp at the counter. A 404 from `PATCH` just means the guest never saved it.
- The feature is **disabled until both `GOOGLE_WALLET_ISSUER_ID` and
  `GOOGLE_WALLET_SERVICE_ACCOUNT` (the whole key JSON) are present**; the app boots
  and loyalty works unchanged without them, and `/api/loyalty` reports
  `wallet.enabled` so the button hides itself.
- Secrets reach the `api` service through `env_file: /run/base44/app.env` (listed
  after `environment:`). Do not move them into `environment:` — that would
  permanently outrank the dashboard value.
- `GOOGLE_WALLET_SERVICE_ACCOUNT` accepts the key JSON itself, the same JSON as one
  base64 line (an env file cannot mangle a single line), or a value the env file
  wrapped in quotes. The service account's **email address** — or any other value
  that is not the key file — leaves the feature off. `wallet.problem()` says which
  piece is missing and the API logs it once at startup (uvicorn.error), so a hidden
  Wallet button always has a reason in `docker compose -f docker-compose.base44.yml
  logs api`.
- `programLogo` must be a public HTTPS image, because Google fetches it itself.
  `LOGO_URL` in `wallet.py` is the permanent platform asset-library copy (the
  Khatim Seal: an 8-point cream `#F4F0E4` star of interlocking gold `#A68748`
  ribbons on espresso `#1D1B16`, square), and `GOOGLE_WALLET_LOGO_URL` overrides
  it. Older installs may still have `apps/web/public/sufra-wallet-badge.png`, which
  nothing reads now; the in-app `WalletCard` draws the same asset URL so the two
  faces match. An override is only needed when the logo moves somewhere else.
- Pass styling is premium gold: `GOLD` (`#A8842F`) is the class field and the dark
  badge sits on it; the object modules are Arabic (`نقاط`, `الأختام`, `المكافأة`).
- Pattern art is two more public images, generated once with a throwaway pure-Python
  (stdlib `zlib` + a tiny PNG writer) script — no Pillow in the image:
  `apps/web/public/sufra-wallet-hero.png` (1032×336
  espresso band of khatim stars, rings and a halftone field, Google's recommended
  hero size) rides on the class as `heroImage`, and
  `sufra-wallet-pattern.png` (660×660 ornament tile) as the single
  `imageModulesData` entry shown in the pass details. Both URLs come from
  `_asset_url`, so they follow `BASE44_PUBLIC_HOST_SUFFIX` and never need a hardcoded
  host.
  `components/loyalty/WalletCard.tsx` mirrors that palette so the in-app card and
  the Google pass match. Arabic labels are never letter-spaced — tracking breaks
  the joined script — so the small label style switches on `lang`.
- Verifying: without the real key use a throwaway RSA key, point
  `GOOGLE_WALLET_SERVICE_ACCOUNT` at it and check the minted token with
  `jwt.decode(..., audience="google")` — that proves the claims, object id and
  signature. Class creation and the actual save need the real key plus a Google
  account on the issuer's test-account list; in demo mode any other account is
  refused by Google, not by this app.

## Phase 8: the stock ledger

- `stock_movements` is a new table (plain `create_all`), so the only additive
  column this phase added is `ingredients.par_level` — it is in
  `ADDITIVE_COLUMNS` in `apps/api/app/db.py` **and** in `models.py`. An existing
  database keeps the rows it has, so seeded ingredients arrive with `par_level`
  0 until someone sets one; the seed values only apply to a fresh store.
- `ingredients.stock_qty` stays the cached balance. It only ever moves through
  `record()` in `apps/api/app/stock.py`, which writes one immutable
  `stock_movements` row and adjusts the cache by the same delta. Nothing else may
  write `stock_qty` — the API never sets it directly.
- Reasons: `sale` (a served ticket), `purchase` (delivery), `waste` (shrinkage)
  and `adjustment` (a manual stock edit in the ingredient sheet). Because a
  direct `PATCH /api/ingredients/{id}` with `stock_qty` records an `adjustment`,
  the ledger always explains the balance and no history is rewritten.
- A ticket that moves to **served** writes one negative `sale` movement per
  ingredient its recipe consumes (`deduct_for_order`, called next to
  `award_stamp`). Products without a recipe consume nothing, the movement carries
  the ticket number in `note`, and `order_id` is a plain integer with no foreign
  key so deleting a ticket never rewrites stock history.
- Deduction is idempotent per order (it skips when a `sale` row already exists for
  that `order_id`), and only `served` deducts — `cancelled` never awards or
  deducts. Stock may go negative: a plate that was served really did consume the
  ingredients, even when the delivery was never recorded.
- `is_low` is `stock_qty <= par_level`, so a par level of 0 only flags an empty
  shelf. It is derived per request, never stored.
- Endpoints: `POST /api/ingredients/{id}/movements` (`{qty > 0, reason:
  purchase|waste, note?}`, 201 with the whole inventory payload; writing off more
  than is on hand returns **409**). `GET /api/ingredients` now carries `par_level`,
  `is_low`, `has_movements` per ingredient plus the newest 40 `movements` with
  ingredient names, so the page renders the ledger from the same response.
- An ingredient with stock history cannot be deleted (**409**), like one used in a
  recipe; `has_movements` drives the lock in the UI. Test with a scratch
  ingredient and remove its `stock_movements` rows before deleting it.
- UI: `/inventory` gained the low-stock chip, a per-row movement action
  (`components/inventory/StockMoveDialog.tsx`, delivery or waste) and the stock
  ledger card. The ingredient sheet gained the par-level field. Row action labels
  include the ingredient name so each is individually reachable.

## Phase 9: security hardening

- `SECURITY.md` is the checklist the plan asks for: every item marked done, not
  applicable (with the reason) or outstanding. Keep it current — the release gate
  at its end is the honest answer to "are we safe to launch".
- **Sign-in exists (see the last section); roles do not gate fields yet.**
  `deps.current_tenant` still resolves the store from the database, never from the
  request, so no endpoint can be pointed at another store's data. Every `/api`
  route now needs a session, but a cashier sees the same costs, margins and guest
  book an owner does: per-role field hiding, PINs and blind close are the
  remaining items.
- `apps/api/app/security.py` holds two things: the `Hardening` middleware (rate
  limits + response headers) and the small helpers `new_token()` (128-bit hex
  handle) and `client_host()`. Budgets are a tuple of `Rule`s; the first matching
  rule wins, so keep the specific ones above the catch-all. Counters are per
  process — several workers would need Redis.
- Rate limits: 5/hour per card on `wallet-link`, 5/hour per caller on the CSV
  export, 120/min on `POST /api/orders`, 300/min on any other mutation. They answer
  **429** with `Retry-After`. Behind the Vite proxy every caller shares one source
  address, so budgets are effectively per store until sign-in exists.
- `apps/api/app/audit.py` writes `audit_logs` rows (append-only, read at
  `GET /api/audit`) in the same transaction as the change they describe: order
  served/cancelled, stock purchase/waste, ingredient edit, product price,
  staff access/delete, settings update, loyalty stamp/redeem/remove/program. The
  `actor` column carries the caller's address until sign-in can name a person.
  Add a `log()` call next to any new action that moves money, stock or access.
- `POST /api/orders` honours an optional `Idempotency-Key` header (≤64 chars):
  the same key returns the ticket it already made, and
  `ux_orders_idempotency` (unique on `tenant_id, idempotency_key` where the key is
  not empty) settles a race. The POS does not send one yet; a tablet that retries
  is the reason the endpoint accepts it.
- Guests carry `customers.qr_token`, a 32-hex handle minted at creation and
  backfilled for existing rows by `BACKFILLS` in `db.py` (runs on every boot, only
  touches empty values). The Wallet barcode and `accountId` use it instead of the
  customer id, and a pass carries no phone number or email.
- Tests live in `apps/api/tests/` and run in the api container (`pytest tests -q`,
  33 checks). They use the app's own database, so each one creates uniquely named
  rows and deletes exactly those again — the seeded store must be back at 8 orders,
  5 guests, 6 staff, 10 products, 12 ingredients, 1 tenant, 0 audit rows, 0
  movements after a run. Check with the counts in `psql` if a test ever fails
  halfway. The `client` fixture signs in with the seeded admin, `anonymous` is the
  same app with no cookie; `test_auth.py` removes the accounts it creates along
  with their sessions and audit rows.
- `pytest` and `httpx` are in `requirements.txt`, so the api image needs a rebuild
  after a dependency change: `docker compose -f docker-compose.base44.yml up -d
  --build api`.
- Security headers are set by the middleware, except **CSP**: the SPA is served by
  the Vite dev server, so a strict policy belongs in front of a production build
  (reverse proxy or CDN), not in `vite.config.ts` where it would fight HMR.


## Branches (locations)

- `branches` holds one row per location; `tenants.active_branch_id` is the one the
  counter is working in, and `orders.branch_id` (plain integer, like `customer_id`)
  records where a ticket was rung up. `create_all` creates `branches`; the two
  columns are in `ADDITIVE_COLUMNS`, and `db.BRANCH_BACKFILL` (boot) plus the tail
  of `seed.py` move pre-branch tickets onto the store's first location, so
  switching never hides history.
- `deps.active_branch` resolves the selection **inside the tenant** (a branch id
  from another store is a 404, never a switch) and falls back to the store's first
  branch. `deps.active_branch_id` is what scoped queries filter on: 0 means "no
  branch rows yet" (before the seed), and every ticket is 0 then, so filtering
  still matches all of them.
- Scoped by branch: `GET/POST /api/orders`, the dashboard, `GET /api/reports`
  (and the CSV export, which shares `build_report`) and the "new tickets" alert.
  Store-wide on purpose: menu, stock ledger, guest book, the loyalty program and
  cards (one guest, many doors) and the settings table count.
- Endpoints: `GET /api/branches` (`{branches, active_id}`), `POST /api/branches`
  (`{name_ar, name_en, address?, phone?}` → 201, **409** when the English name
  already exists in the store, **422** when a name is blank after trimming) and
  `POST /api/branches/{id}/activate`. Adding does not switch; the very first branch
  a store gets becomes active. `/api/dashboard` carries `branches` and `active_id`
  too, so the switcher needs no second request.
- UI: `components/BranchMenu.tsx` sits at the top of the sidebar — the trigger
  shows the store name over the active branch, the menu lists every branch
  (`menuitemradio`, checked = active) and a real **إضافة فرع** button (44px, accent
  colour, not disabled) opening a `Sheet` form. Switching calls
  `window.location.reload()`: the orders board, POS and reports read branch-scoped
  tickets on mount, so the app restarts on the chosen location rather than
  half-updating.
- Tests: `apps/api/tests/test_branches.py` (5 checks) put `tenants.active_branch_id`
  back, and delete the branch plus the `branch.*` audit rows they wrote — switching
  logs an `audit_logs` row even for the store's own branch, so cleanup is by id
  watermark. Baseline after a run: 1 branch, 8 orders, 0 audit rows.


## The top bar bell

- `NotificationsMenu.tsx` replaces the old dead bell button: it opens a panel fed
  by `GET /api/notifications` (`routes/notifications.py`), loads once on mount so
  the accent dot is honest, and reloads on every open. Escape and an outside click
  close it; a row navigates to the page that fixes it.
- The payload is derived per request — nothing is stored and nothing is dismissed:
  `new` tickets → `/orders`, `stock_qty <= par_level` → `/inventory`, and loyalty
  cards holding `stamps_target` stamps → `/loyalty`. An empty `items` list renders
  `top.notifications.empty`; counts are formatted with `formatNumber(lang, …)`, so
  keep that argument order (`lib/format.ts` takes the language first).
- The three counts are the seeded baseline in a demo store: 0 new tickets, 0 low
  ingredients, 0 ready rewards, so the panel legitimately reads "nothing needs you".
  Place a ticket or stamp a card to see a row; delete that row again afterwards.


## Sign-in, the tour and admin users

- **Every `/api` route needs a session.** `auth.SessionGate` (added in `main.py`
  *before* `Hardening`, so `Hardening` stays outermost and a 401 still carries the
  security headers and counts against the rate limit) answers **401** for anything
  under `/api` without a live cookie. Public: `/api/health`,
  `/api/auth/login`, `/api/auth/logout`, and `OPTIONS`. A new endpoint is protected
  by default — no per-route decorator to forget.
- The session is a random token in the `sufra_session` cookie (`HttpOnly`,
  `SameSite=Lax`, `Secure` when the proxy forwards `https`). Only its SHA-256
  fingerprint is stored, in `auth_sessions`; a database copy cannot be replayed as
  a sign-in. Sessions last 7 days, and deleting a member deletes theirs.
- Passwords are PBKDF2-SHA256 (`auth.hash_password` / `check_password`), 240k
  iterations, stdlib only — no new dependency. `POST /api/auth/login` answers the
  same 401 message for an unknown name and a wrong password, and is rate limited to
  **10 a minute per caller** (`security.RULES`).
- `auth.current_user` is the dependency for "any signed-in member";
  `auth.require_admin` adds the role check. Only `admin` may create, edit or delete
  accounts — a cashier or manager gets **403** from `POST/PATCH/DELETE /api/team`
  and just reads the roster. An admin can create *any* role, including another
  admin, but the store always keeps one active admin and one active owner (**409**),
  and nobody can switch off or delete their own admin account (**409**).
- `staff.username` / `staff.password_hash` / `staff.onboarded_at` are additive
  columns in `db.py`, plus `ux_staff_username` (unique per store where the username
  is not empty). A roster entry with an empty username has no sign-in — that is how
  the five seeded people stay name-only, and `has_login` is what the UI reads.
  A username is 3–60 `[a-z0-9._-]`; a password needs 8 characters.
- The tour is **server state, not a browser flag**: `onboarded_at` is `NULL` until
  `POST /api/auth/onboarding`. `user_payload.needs_onboarding` drives
  `components/RequireAuth.tsx`, which redirects a first sign-in to `/onboarding`
  before anything else. Finishing or skipping both call the same handler, and the
  account menu's **Product tour** row reopens it at any time.
- Frontend: `lib/auth.tsx` holds the signed-in member (`AuthProvider` wraps the
  routes in `App.tsx`); the session cookie itself is never readable from JS.
  `pages/LoginPage.tsx` and `pages/OnboardingPage.tsx` render **outside** the shell,
  and `AppDataProvider` now sits inside `RequireAuth`, so no dashboard request is
  made before there is a session. `/team` hides the create/edit controls unless the
  viewer is an admin (`team.adminOnly` explains why).
- The seeded demo account is **`admin` / `sufra1234`** (`seed.ADMIN_USERNAME` /
  `ADMIN_PASSWORD`), created on every boot for whichever store has none. It is a
  development default: replace the password from the Team page (`PATCH /api/team/{id}`
  accepts `password` for a member that already has a username) before real use.
- Verifying by hand: signed out, `/` and `/team` bounce to `/login`; a wrong
  password shows one message; `admin` lands on `/onboarding`, then on the dashboard;
  `/team` → **إضافة عضو** with a username and password creates a real account that
  shows `@username` in the roster, and removing that member removes the account.
  Leave the roster at its seeded six.
