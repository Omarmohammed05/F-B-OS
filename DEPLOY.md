# Deploying Sufra OS to Vercel from scratch

One Vercel project with two **services**, plus one Postgres database. The root
`vercel.json` declares both services and the public paths that reach them:

| Service | Root directory | Framework | What it is | Public paths |
| --- | --- | --- | --- | --- |
| `sufra-api` | `apps/api` | `fastapi` | the whole FastAPI app (`app/main.py`) | `/api/*`, `/docs`, `/openapi.json` |
| `sufra-web` | `apps/web` | `vite` | the SPA (`npm run build` → `dist`) | every other path |

A service is internal until a top-level rewrite publishes it, and the rewrites
are what put both on the project's one domain. The browser therefore
only ever talks to one origin, and that single origin is what keeps the session
cookie working — there is no separate API domain to point anywhere.

There are **no service bindings**, and none are needed. A binding exists so
server-side code can call another service privately, and it is only readable from
a function at runtime. `sufra-web` is a static Vite build with no functions, and
`sufra-api` calls nothing: the SPA's `/api/...` calls are relative
(`apps/web/src/lib/api.ts`), so they go out to the same origin and the top-level
`rewrites` hand them to `sufra-api`, which receives the original path
(`/api/dashboard` stays `/api/dashboard`). Add a `bindings` entry on `sufra-web`
only if server-side web code ever has to reach the API.

You need: this repository on GitHub, a Vercel account, a Postgres database, and
either Docker or Python 3 once (step 3 creates your owner account).

---

## 1. Database

Create a Postgres database on Neon, Supabase, RDS or any managed provider, and
copy its **pooled** connection string in SQLAlchemy form:

```
postgresql+psycopg2://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

- Keep the `+psycopg2` driver part and `?sslmode=require`; managed providers
  need TLS.
- Percent-encode characters such as `@`, `:` or `#` in the password, otherwise
  the URL is parsed wrongly and the API returns 500 on every route.

Nothing else is needed here: the schema is created by the seed in step 3 and,
idempotently, by the API's cold start.

---

## 2. The project

1. Vercel → **Add New → Project** → import this repository.
2. **Root Directory**: the repository root — the directory that holds
   `vercel.json`. Vercel reads the `services` block from it and builds each
   service on its own: `sufra-api` with the FastAPI preset from `apps/api`
   (`requirements.txt`, entrypoint `app.main:app`), `sufra-web` with the Vite
   preset from `apps/web` (`npm run build` → `dist`). Do not point the root
   directory at `apps/api` or `apps/web`; that would drop the other service and
   the routing with it.
3. **Environment Variables** (add each to *Production* and *Preview* — they reach
   `sufra-api`, which is their only reader):

   | Name | Value | Required |
   | --- | --- | --- |
   | `DATABASE_URL` | the connection string from step 1 | yes |
   | `GOOGLE_WALLET_ISSUER_ID` | Google Wallet issuer id | no |
   | `GOOGLE_WALLET_SERVICE_ACCOUNT` | the service-account key JSON, pasted whole | no |

4. **Deploy**. One domain covers everything, e.g.
   `https://sufra-<hash>.vercel.app`: `/api/*` on it is the API.

Check it before going further:

```bash
curl https://<project-domain>/api/health          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://<project-domain>/docs   # 200
```

If those fail with 500, the `DATABASE_URL` is wrong — fix it in
**Settings → Environment Variables** and redeploy.

---

## 3. Create your owner account (the sign-in for the whole app)

There is one account type above the restaurants: **role `owner`, the platform
owner**. It opens restaurants, sets what the software costs each one, records the
money it collects, blocks or removes a restaurant, and hands each restaurant over
to its own admin. Restaurant people never see those screens.

The account is created by running the seed once against your new database. The
seed creates the tables, the first store row and that one owner — and, because
`SEED_DEMO_DATA` is not set, **no demo menu, guests, tickets or roster**.

### With Docker (no Python needed)

From the repository root, with your own values:

```bash
docker run --rm \
  -e DATABASE_URL='postgresql+psycopg2://USER:PASSWORD@HOST/DBNAME?sslmode=require' \
  -e SUFRA_OWNER_USERNAME=owner \
  -e SUFRA_OWNER_PASSWORD='a long password you will keep' \
  -v "$PWD/apps/api":/app -w /app python:3.12-slim \
  sh -c 'pip install -q -r requirements.txt && python -m app.seed'
```

### With a local Python 3

```bash
cd apps/api
pip install -r requirements.txt
DATABASE_URL='postgresql+psycopg2://...' \
  SUFRA_OWNER_USERNAME=owner \
  SUFRA_OWNER_PASSWORD='a long password you will keep' \
  python -m app.seed
```

A successful run prints:

```
seed: ok (schema, store and owner only)
```

What that leaves in a fresh database (checked against a clean database):

| Table | Rows |
| --- | --- |
| `tenants` | 1 — the platform's first store (rename it in **Settings**) |
| `staff` | 1 — the owner, `role = owner` |
| `products`, `orders`, `customers`, stock, roster | 0 |

Notes:

- **Both variables are required.** Without `SUFRA_OWNER_PASSWORD` the seed prints
  `seed: no owner created` and writes no account.
- `SUFRA_OWNER_USERNAME` defaults to `admin` when empty.
- Re-running is safe: it creates an owner only when none exists, and never
  duplicates data.
- These two are **seed-time only**. Setting them as Vercel environment variables
  does nothing — the running API never reads them.
- **Lost the owner password?** Delete the row and seed again:
  `DELETE FROM staff WHERE role = 'owner';`, then run the seed command above. Its
  old sessions stop working immediately.

---

## 4. How the two services are routed

Everything lives in the root `vercel.json`; there is no second project and no
deployment host to fill in:

```jsonc
"rewrites": [
  { "source": "/api/(.*)",      "destination": { "service": "sufra-api" } },
  { "source": "/docs",          "destination": { "service": "sufra-api" } },
  { "source": "/openapi.json",  "destination": { "service": "sufra-api" } },
  { "source": "/(.*)",          "destination": { "service": "sufra-web" } }
]
```

- Most specific first, catch-all last. `/api/(.*)` includes the public guest
  menu (`/api/public/...`) and the activation links (`/api/invites/...`).
- `/docs` needs `/openapi.json` beside it, or Swagger UI loads its own spec from
  `sufra-web` and shows an empty page.
- The `sufra-web` service carries its own fallback rewrite
  (`"/(.*)" → "/index.html"`), because every page of the SPA is a client route:
  a deep link such as `/orders` or `/m/<token>` has no file behind it.
- `vercel dev` (or `vercel dev -L`, no login) runs both services locally with
  the same rewrites, so this can be tested before deploying.

---

## 5. First sign-in, then hand over the restaurant

1. Open `https://<project-domain>/login` and sign in with the owner you created.
   You land on **Platform** — the owner's home: restaurants, income, overview.
2. **Settings** — set the store name in Arabic and English, accent colour,
   currency, tax rate and table count. The seeded row carries placeholder values
   (`Qahwa House`, EGP, 14%).
3. **Restaurants → New restaurant** — give the Arabic and English name and the
   software price. **Leave the admin username and password empty** to hand the
   restaurant over by activation link: the app mints a one-time link you copy and
   send to whoever runs that restaurant.
4. The holder opens `/activate/<token>`, picks their own name, username and
   password, and becomes that restaurant's **admin**. The link is single use; if
   it goes astray, open the restaurant and mint a fresh one.
5. The admin adds everyone else from **Team** (only an admin can create users).
6. The guest QR menu per branch lives at **QR menu** (`/qr-menu`) — print it for
   the tables. Guests scan, order and follow their ticket with no account.

---

## Environment variables — the complete list

| Name | Service | Required | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | `sufra-api` | **yes** | every request; SQLAlchemy form |
| `GOOGLE_WALLET_ISSUER_ID` | `sufra-api` | no | Google Wallet passes; the loyalty page hides the button when it is missing |
| `GOOGLE_WALLET_SERVICE_ACCOUNT` | `sufra-api` | no | the service-account key JSON (raw JSON, base64 or JSON wrapped in quotes all work) |
| `GOOGLE_WALLET_LOGO_URL` | `sufra-api` | no | overrides the pass logo; defaults to a hosted asset |
| `SEED_DEMO_DATA` | — | never in production | demo menu, guests, tickets, roster; `1` only in the sandbox |
| `SUFRA_OWNER_USERNAME` / `SUFRA_OWNER_PASSWORD` | — | seed-time only | the owner account in step 3 |

`sufra-web` needs no variables: it is a static build whose only backend call is
`/api/*` on its own origin.

---

## Verify the deployment

```bash
# The API service is up, through the project domain
curl https://<project-domain>/api/health

# The gate is on — 401 without a session
curl -s -o /dev/null -w '%{http_code}\n' https://<project-domain>/api/dashboard

# The SPA is served by the web service (and its fallback reaches /orders)
curl -s -o /dev/null -w '%{http_code}\n' https://<project-domain>/
curl -s -o /dev/null -w '%{http_code}\n' https://<project-domain>/orders
curl -s https://<project-domain>/api/auth/me          # 401 until you sign in
```

Then in the browser: sign in as the owner, reload (the session must survive the
reload), open **Restaurants**, and open a guest QR link in a private window (it
must load with no account).

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Every route 500, `/api/health` too | `DATABASE_URL` wrong: missing `+psycopg2`, missing `?sslmode=require`, or an unencoded character in the password |
| Sign-in succeeds, then you bounce back to `/login` | `/api/*` is not reaching `sufra-api` on the page's own origin — check the top-level rewrites in `vercel.json` (most specific first, catch-all `/(.*)` last) |
| A deep link such as `/orders` 404s | `sufra-web`'s `"/(.*)" → "/index.html"` fallback rewrite is missing |
| `/api/health` 404s but the build succeeded | Project Settings → Root Directory is not the repository root, so `vercel.json` and one of the services were never read |
| `column "..." does not exist` after an update | a new model column needs `ADDITIVE_COLUMNS` in `apps/api/app/db.py` **and** a redeploy; the API applies it on cold start |
| 429 on sign-in or orders | per-flow rate limits (`SECURITY.md`); the budget is per function instance — wait and retry |
| First request takes a few seconds | serverless cold start; the function re-applies the idempotent schema check on boot |
| Google Wallet button missing | one of the two Wallet variables is unset; the API logs which one at startup |
| Restaurant cannot be removed | the platform owner's own store is the last one open — open another restaurant first |

## What this deployment does not do yet

- Rate-limit counters live in the function instance, so a burst spread across
  instances is not shared. A busy restaurant group would move them to Redis
  (`SECURITY.md`).
- No background workers or scheduled jobs: everything is request-scoped.
- Cold starts are 1–5 s; the function's 30 s ceiling matters only for very large
  CSV exports.
