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
curl -s localhost:3000/api/checklists | head -c 200       # today's checklist board
curl -s localhost:3000/api/attendance | head -c 200       # who is on the floor today
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
  `POST /api/orders` (`{channel, table_no?, customer_id?, customer_name?,
  delivery_address?, payment_method?, note?, items: [{product_id, qty}]}`, 201
  with the created order),
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
- The POS customer control reads the guest book (`GET /api/customers`, loaded
  beside the catalog on `/pos`): the counter picks a saved guest, or
  `pos.newCustomer` reveals a name field for a walk-in, which `POST /api/orders`
  resolves case-insensitively and creates when it is new — so every ticket with a
  name still feeds the book. `customer_id` wins over `customer_name` when both
  arrive.
- `orders.delivery_address` (additive, `db.py` + `models.py`) is set only when the
  channel is `delivery`; every other ticket stores `''`. The POS shows the field
  for delivery only and refuses to send without one (`pos.needAddress`), and
  `OrderDetailSheet` prints it above the payment row. Nothing else reads it — the
  board, reports and CSV are unchanged.
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
- Team: `GET/POST /api/team`, `PATCH/DELETE /api/team/{id}`. A restaurant's people
  are admin / manager / cashier / kitchen; `owner` is the platform role above them
  (see *The platform owner, restaurants and income*). The last active admin of a
  restaurant and the last active platform owner cannot be demoted, deactivated or
  deleted (**409**) — the UI shows that message instead.
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
- Tests live in `apps/api/tests/` and run in the api container (`python -m pytest
  tests -q`, 38 checks — the `python -m` form is the one that resolves the `app`
  package; bare `pytest` fails with `ModuleNotFoundError: No module named 'app'`).
  They use the app's own database, so each one creates uniquely named
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


## Checklists (per person, per day)

- Two new tables, so plain `create_all` covers them — there is no
  `ADDITIVE_COLUMNS` entry: `checklist_tasks` (the store's standing list, with
  `role` scoping an item to one position and `''` meaning everybody) and
  `checklist_checks` (one row per member, task and day).
- **A tick exists only while the box is ticked**: ticking inserts a row,
  unticking deletes it, so "not done" needs no second meaning and the table stays
  small. `UniqueConstraint(tenant_id, task_id, staff_id, work_date)` makes a double
  tap idempotent — `POST /api/checklists/checks` is safe to repeat either way.
- `done_by` records who ticked it (the member, or the manager on shift).
- Who may do what: anyone signed in reads the board; a member may tick **only
  their own** list; `SUPERVISOR_ROLES` (manager, admin, owner) may tick anyone's;
  item create/edit/delete needs `auth.require_admin`. This is the first place a
  role narrows what an operational endpoint does (see `SECURITY.md` §3.3).
- The platform `owner` is **not** on a restaurant's checklist
  (`BOARD_ROLES` excludes it); an inactive member disappears from the day board
  but still appears in a week/month report they had ticks in, so a past week never
  changes. Checklists are store-wide, not branch-scoped: they follow the person.
- An item with ticks cannot be deleted (**409**); switch it off (`is_active`)
  instead, which removes it from new lists and keeps the record. `has_checks` in
  the payload drives the disabled delete in the sheet — same pattern as an
  ingredient with stock history.
- Report math: `expected = (active items that apply to the role) × (days of the
  period that have actually happened)`, so a month opened on the 3rd is not
  "failing" 27 future days. A future day carries `expected: 0` and renders as an
  empty dashed cell. `percent` is the rounded share of done over expected.
- Endpoints: `GET /api/checklists?date=YYYY-MM-DD` (the day board: members, their
  items, plus the whole task list with `has_checks`),
  `POST /api/checklists/checks` (`{task_id, staff_id, date?, done}`, answers the
  whole day payload — 403 when a non-supervisor ticks someone else, 400 when the
  item is not on that person's list), `GET /api/checklists/report?period=week|month&anchor=…`,
  `GET/POST /api/checklists/tasks`, `PATCH/DELETE /api/checklists/tasks/{id}`.
  A bad `date`/`period` is **422**; an unknown task or member is **404**.
- UI route: `/checklists` (`pages/ChecklistPage.tsx`) sits in the Operations nav
  group — a Day / Week / Month segmented control with prev/next and a date input,
  the completion card, then either the per-person cards
  (`components/checklists/DayBoard.tsx`, a 44px box per item) or the day-by-day
  report (`components/checklists/PeriodReport.tsx`). Only an admin sees
  **إدارة البنود**, which opens `components/checklists/ChecklistItemsSheet.tsx`
  (add, edit, switch off, delete). Closing the sheet rereads the day so the new
  items reach every list.
- The seed adds the nine demo items in `CHECKLIST_TASKS` only when the store has
  none; a restaurant created from `/restaurants` starts with an empty checklist and
  the page's empty state, which is expected.
- Verify by hand: tick one box on your own card (`1/4`, the summary percent
  rises), untick it (back to the baseline), switch to Week and Month and read the
  per-day strips, then — as an admin — add a scratch item, see it appear, and
  remove it again. Leave 9 items and 0 ticks behind.

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
  `auth.require_admin` adds the role check and `auth.require_owner` the platform
  one. `require_admin` accepts a restaurant's `admin` **or** the platform `owner`
  (who outranks them); staff roles are operational only. A cashier or manager gets
  **403** from `POST/PATCH/DELETE /api/team`, `PATCH /api/settings` and
  `POST /api/branches`, and just reads the roster. An admin can create any role
  except `owner`, but a restaurant always keeps one active admin, the platform
  keeps one active owner (**409**), and nobody can switch off or delete their own
  account (**409**). Only the owner reaches `/api/restaurants` and `/api/income`.
- `staff.username` / `staff.password_hash` / `staff.onboarded_at` are additive
  columns in `db.py`, plus `ux_staff_username` (unique per store where the username
  is not empty). A roster entry with an empty username has no sign-in — that is why
  the switched-off Mariam Saleh stays name-only, and `has_login` is what the UI
  reads. A username is 3–60 `[a-z0-9._-]`; a password needs 8 characters.
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
- One demo sign-in per role ships with the seed, all with the password
  **`sufra1234`**:

  | Role | Username | What it opens |
  | --- | --- | --- |
  | Platform owner | `admin` | `/restaurants`, `/income`, plus every restaurant's admin surfaces |
  | Restaurant admin | `storeadmin` | `/team`, `/settings`, branches, the whole store |
  | Manager | `manager` | operations only; team/settings edits answer 403 |
  | Cashier | `cashier` | operations only |
  | Kitchen | `kitchen` | operations only |

  `admin` comes from `seed.ADMIN_USERNAME` / `ADMIN_PASSWORD` and is created on
  every boot for whichever store has none. The other four come from
  `seed.DEMO_LOGINS`: the seed fills the username and password into the matching
  roster row **only while that username is free and the row has none**, so a
  renamed or re-passworded account survives a restart. `pages/LoginPage.tsx` lists
  them as tap-to-fill buttons (`DEMO_ACCOUNTS`, `login.demoAccounts`). They are
  development defaults: replace the passwords from the Team page
  (`PATCH /api/team/{id}` accepts `password` for a member that already has a
  username) before real use.
- Verifying by hand: signed out, `/` and `/team` bounce to `/login`; a wrong
  password shows one message; `admin` lands on `/onboarding`, then on the dashboard;
  `/team` → **إضافة عضو** with a username and password creates a real account that
  shows `@username` in the roster, and removing that member removes the account.
  Leave the roster at its seeded six.

## The platform owner, restaurants and income

- The tenant a request reads is **the signed-in member's restaurant**, not the
  first row. `auth.SessionGate` calls `deps.set_request_tenant(staff.tenant_id)`
  and `deps.current_tenant(db)` reads that context variable (falling back to the
  lowest-id tenant outside a request: seed, tests, scripts). Adding a tenant
  therefore never changes what an existing session sees, and a new restaurant's
  people land in their own empty store.
- Two levels of authority. `owner` is the **platform** role — whoever runs Sufra
  OS: only it reaches `/api/restaurants` and `/api/income` (guarded by
  `auth.require_owner` in `routes/platform.py`). `admin` is a **restaurant** role:
  its own roster, profile and locations. `auth.require_admin` guards team, settings
  and branches and also accepts the owner, who outranks them; manager, cashier and
  kitchen only read. The owner can open any restaurant's roster:
  `GET /api/team?restaurant_id=N` and `POST /api/team` `{restaurant_id}` answer
  **403** for everyone else, and `GET /api/team` carries the `restaurants` picker
  for the owner alone. `PATCH`/`DELETE /api/team/{id}` resolve the member's own
  restaurant for the "keep one active admin / one active owner" guards.
- Restaurant lifecycle is `/api/restaurants` (owner only): `GET` lists every one
  with the summary counts, `monthly_price` and this month's income;
  `POST` `{name_ar, name_en, software_price?, admin_name?, admin_username?,
  admin_password?}` opens one (**409** when the English name is taken) and can
  create its first admin in the same step; `PATCH /{id}` edits the names and
  `software_price`; `POST /{id}/block` `{blocked}` and `DELETE /{id}?keep_data=…`
  both answer **409** on the owner's own restaurant. Blocking drops every session
  in that restaurant, so nobody there stays signed in; `keep_data=true` archives it
  (rows kept for the books) and `false` erases it with every row carrying its
  `tenant_id`. A new restaurant starts with no branch, menu, guests or setup tasks
  — every page already renders that state — and copies `currency`, `tax_rate` and
  `default_language` from the owner's own store so the till charges tax correctly
  from the first ticket.
- Software money is kept apart from ticket money: `tenants.software_price` is the
  monthly bill and `software_payments` rows are what was actually collected
  (`POST /api/restaurants/{id}/payments` `{amount, paid_on?, note?}`,
  `DELETE /api/restaurants/{id}/payments/{payment_id}`). `GET /api/income?months=6`
  returns one bucket per month, newest first, plus
  `summary.this_month|total|monthly_price`. Nothing here reads `orders`; a
  restaurant's own sales stay on its own `/api/reports`.
- Account names are unique **across all restaurants** (`_new_credentials` queries
  without a tenant filter): the sign-in screen has no store picker, so
  `POST /api/auth/login` finds the account by name and the account says which
  restaurant it opens. The `ux_staff_username` index is still per store; the
  cross-store rule lives in the endpoint.
- UI: `/restaurants` (`pages/RestaurantsPage.tsx`) is the owner's list — stat
  cards, one row per restaurant with its status chip, software price, this month's
  software income and ticket sales — plus edit
  (`components/platform/RestaurantDialog.tsx`), block, and remove
  (`DeleteRestaurantDialog.tsx`, which asks archive-or-erase). `/income`
  (`pages/IncomePage.tsx`) is the owner's own books, one card per month, and
  `components/platform/PaymentDialog.tsx` records a payment. Both routes sit in the
  **Platform** nav group, which `lib/nav.ts` marks `ownerOnly` and `Sidebar`
  filters on `isOwner`; `components/OwnerOnly.tsx` keeps a typed URL from rendering
  an empty page (the API answers 403 anyway). `/team` is the restaurant admin's
  place now: it lists the roster and hides every control unless
  `canManageStore(role)` (admin or owner) — it no longer creates restaurants.
- The payment amount fields are `step="any"`: a real transfer is often not a round
  number, and `step={50}` made the browser refuse a 4,321 payment with its own
  English validity tooltip before the form was ever submitted.
- Verify with a scratch restaurant of your own: create it from `/restaurants`
  (optionally with its first admin), record a payment for it on `/income` and see
  the month's card, block and unblock it, then remove it with erase
  (`keep_data=false`), which deletes the rows it created. Tests:
  `apps/api/tests/test_restaurants.py` create their own staff, sessions, audit rows
  and tenant and remove them again.

## Attendance (who is on the floor)

- One new table, so plain `create_all` covers it — there is no `ADDITIVE_COLUMNS`
  entry: `attendance_shifts` (one row per arrival). A check-in opens a row, a
  check-out fills `checked_out_at`, and the day's minutes are the sum of the rows
  plus the one still open. There is **no unique constraint**: a split shift is a
  second row, and the idempotency that a counter tablet needs lives in the
  endpoint (a check-in finds the open row and returns without writing).
- `work_date` is the calendar day the shift belongs to (server date), so a board
  reads one day without replaying timestamps. A row left open on a past day shows
  as `noCheckout` (`status: "in"` with `is_today: false`), which is the honest
  signal that somebody forgot to punch out — nothing auto-closes it.
- Who may do what: anyone signed in punches **their own** clock; `SUPERVISOR_ROLES`
  (manager, admin, owner) may punch a teammate in or out (the shared tablet), and
  a non-supervisor asking for somebody else gets **403**. The platform `owner` is
  not on the board at all (`SHIFT_ROLES`), so `me` is `null` for that account and
  the page says so instead of offering a button. A switched-off member is 409.
- Endpoints: `GET /api/attendance?date=YYYY-MM-DD` (the day board: `me`, `members`
  with status / first arrival / last departure / minutes / `shifts`, and a
  `summary`), `POST /api/attendance/check-in` and `POST /api/attendance/check-out`
  (`{staff_id?, date?}`, both answer the whole day payload). A second check-out
  with nothing open is **409**; a bad date is **422**. Punches write
  `attendance.in` / `attendance.out` audit rows next to the change.
- UI route: `/attendance` (`pages/AttendancePage.tsx`, Operations nav) — a date
  navigator, the viewer's own `AttendancePunch` card (one 56px target, its live
  duration ticks every 30s from `open_since` — never re-derived from `minutes`,
  which already counts the open row), a three-cell summary, then
  `components/attendance/AttendanceBoard.tsx`. The hero is only rendered for
  today; another day shows its board and the "punches are only taken for today"
  note. Board row actions appear only for a supervisor, and never on their own row.
- The seed adds today's demo shifts (`Hassan` and `Dina` still on the floor,
  `Youssef` already left) only when the store has no attendance rows at all, so a
  restart never duplicates a punch.

## Lateness and the salary deduction

- Three additive `tenants` columns (`db.py` **and** `models.py`): `shift_start`
  (`"HH:MM"`, empty means the rule is off), `shift_grace_minutes` (0–180) and
  `late_deduction_rate` (money per late minute). The seed writes `08:00` / 5 / 2
  for a fresh store so the demo arrivals (08:05, 08:30, 08:15) show the feature;
  an existing store keeps whatever it has until an admin saves the card.
- The rule is **edited in `/settings`** (`PATCH /api/settings`, so
  `auth.require_admin` — a manager or cashier gets 403) in the *الحضور وخصم
  التأخير* card, and read back on `/attendance` by everyone.
- Lateness is **derived per request, never stored**: `late_minutes` is the day's
  first arrival past the person's shift start + grace, so a split shift is late
  once, and `deduction = late_minutes × late_deduction_rate`. `GET /api/attendance`
  carries `rules` plus `late_minutes`/`deduction` per member and
  `late_count`/`late_minutes`/`deduction` in `summary`. Editing the rule reprices
  past days too — that is the point of deriving it, and the reason nothing needs
  a migration when the rate changes.
- **A person may have their own window.** Two additive `staff` columns
  (`db.py` **and** `models.py`): `shift_start` (`"HH:MM"`, empty = the store's) and
  `shift_grace_minutes` (`NULL` = the store's). `member_rules()` in
  `routes/attendance.py` resolves them, so every lateness figure — the day board
  and the month totals alike — is measured against that person's own time.
  `PATCH /api/attendance/rules/{staff_id}` sets both (`""` / `null` clears them
  back to the store's rule, an impossible value is **422**) and answers the whole
  month payload. `require_supervisor` guards it: **a manager may set a shift time**
  (that is shift planning) while `PATCH /api/settings` stays admin-only.
- **Supervisors are never fined.** `EXEMPT_ROLES` (`admin`, `manager`) clock in
  like everyone else and their lateness is still counted, but `deduction_of()`
  returns 0 for them; the payload carries `exempt` so the UI can say
  `بدون خصم` instead of an amount. Owner has no board row at all.
- `GET /api/attendance/month?month=YYYY-MM` (default: this month) is the monthly
  table: per person `days`, `shifts`, `minutes`, `late_days`, `late_minutes`,
  `deduction` plus their own `shift_start`/`grace_minutes`, and the same sums in
  `summary`. A bad month is **422**. Minutes of a row still open are counted up
  to now, exactly like the day board.
- UI: the `/attendance` header has a **اليوم / الشهر** segmented control (same
  markup as the checklist views). The month side is
  `components/attendance/AttendanceMonthTable.tsx` — it fetches its own month,
  keeps per-row drafts, shows a ✓ save button only while a row is dirty, and saves
  the row back through the rules endpoint. Anyone may read it; `canEdit` is
  `canSupervise(role)`. On a narrow screen the table scrolls sideways inside its
  card (`min-w-[760px]`), never the page.
- UI: `components/attendance/LateRuleBar.tsx` sits under the three-cell summary
  (rule, "خصم التأخير اليوم", late count; an admin with no rule yet gets the
  "اضبطه من الإعدادات" link), and each late row in `AttendanceBoard` prints
  `متأخر N د · خصم X`. The settings card is three fields — shift start
  (`type="time"`, empty switches it off), grace minutes and the rate per minute.
- Tests: `tests/test_attendance.py::test_late_minutes_cut_the_salary` checks in a
  scratch member, sets the rule relative to that arrival (30 min before, 5 min
  grace, 2/min → 25 late minutes and 50 off), asserts the board repriced and the
  grace window zeroes it, then patches the store's previous rule back.
- Tests: `apps/api/tests/test_attendance.py` (11 checks) create a scratch cashier
  (and a scratch manager) and remove their shifts, sessions, audit rows (by id
  watermark) and the person again. Baseline after a run: the seeded shifts,
  nothing else. The two rule tests move `PATCH /api/settings` to a time relative
  to their own arrival and patch the saved rule back in a `finally`; the
  personal-window test clears both columns again in the same way.

## Installable app (PWA)

- `apps/web/public/manifest.webmanifest` + `icons/` (espresso tile with the gold
  khatim seal — `icon-192`, `icon-512`, `icon-maskable-512` keeps the seal inside
  the safe zone, `apple-touch-icon` 180) + `public/sw.js`, registered from
  `src/main.tsx` on `load`. `index.html` carries the manifest link, `theme-color`
  `#17130f` (the same espresso), the Apple standalone tags and the description.
- The icons are committed PNGs produced once by a throwaway pure-Node script
  (stdlib `zlib`, a tiny PNG writer — there is no Pillow or canvas in the images).
  Regenerate them the same way rather than adding a build dependency.
- `sw.js` is deliberately small: it precaches the offline page, the manifest and
  the icons; a **navigation** goes to the network and falls back to
  `public/offline.html`; production `/assets/*` (fingerprinted) are cached
  cache-first; `/api/*` is **never** cached, because a ticket, a guest or a punch
  must be the server's answer. The Vite dev server serves nothing under
  `/assets/`, so dev/HMR is untouched by that rule.
- A cross-origin iframe (the Base44 preview pane) may refuse service-worker
  registration; `main.tsx` swallows that rejection on purpose. The app then works
  exactly as a plain web app and the banner/install prompt belongs to the app's
  own origin. Verify the wiring from the page itself:
  `fetch('/manifest.webmanifest')`, `fetch('/sw.js')`, an `Image` load of
  `/icons/icon-512.png` (512×512) and the `link[rel=manifest]` / `meta[theme-color]`
  tags — that is what an install prompt reads. There is no build step and no new
  dependency.
