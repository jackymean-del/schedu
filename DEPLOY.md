# Deploying the schedU backend (for real per-user data)

The frontend (Vercel) proxies `/api/*` to the Go backend (`vercel.json`). Until
that backend is live and reachable, the app falls back to local demo data and
**every account sees the same content**. This guide gets the backend running so
each signed-in Clerk user has their own server-stored data.

Recommended host: **Railway** — runs the Postgres database and the Go service on
one platform, builds straight from `backend/Dockerfile`, and gives a public URL.

---

## 1. Create the database (Railway Postgres)

1. railway.app → **New Project** → **Provision Postgres**.
2. Open the Postgres service → **Variables** → copy `DATABASE_URL`
   (looks like `postgresql://postgres:…@…railway.app:5432/railway`).

## 2. Apply the migrations (one time)

From the repo root, with `psql` installed (Postgres client) and the URL above:

```bash
DATABASE_URL='postgresql://…railway.app:5432/railway' ./scripts/apply-migrations.sh
```

No local `psql`? Use Railway's Postgres **Data/Query** tab and paste each file
in `database/migrations/` in order (001 → 006).

## 3. Deploy the Go service

1. Railway project → **New** → **Deploy from GitHub repo** → pick this repo.
2. Service **Settings → Root Directory:** `backend`  (so it builds `backend/Dockerfile`).
3. Service **Variables:**

   | Variable           | Value                                                        |
   |--------------------|--------------------------------------------------------------|
   | `DATABASE_URL`     | Reference the Postgres service's `DATABASE_URL`              |
   | `CLERK_SECRET_KEY` | Your Clerk **Secret** key (`sk_test_…` / `sk_live_…`)        |
   | `ALLOWED_ORIGINS`  | `https://schedu.bhusku.com`                                  |
   | `PORT`             | `8080` (Railway may inject its own — the app honors `PORT`)  |

   > The **secret** key is backend-only — never put it in the frontend or Vercel.
   > It must be from the **same Clerk instance** as the frontend's publishable key.

4. Deploy. When it's healthy, copy the service's **public URL**
   (e.g. `https://smart-sched-production.up.railway.app`).

## 4. Point the frontend at the backend

Two options:

- **Quick:** edit `vercel.json` → change the `/api/:path*` rewrite `destination`
  to `https://<your-railway-url>/api/:path*`, commit, redeploy Vercel.
- **Clean (custom domain):** in Railway add the custom domain
  `api.schedu.bhusku.com` to the service and create the DNS record it shows.
  Then `vercel.json`'s existing `https://api.schedu.bhusku.com/api/:path*` works
  unchanged.

## 5. Verify

```bash
# Unauthenticated request should now return 401 (not a DNS error / 000):
curl -s -o /dev/null -w "%{http_code}\n" https://<backend>/api/v1/timetables
```

401 = backend live and Clerk auth active. 000/“could not resolve” = not reachable yet.

---

## After it's live

The backend already exposes per-user, Clerk-authenticated endpoints
(`/api/v1/timetables`, `/me`, `org-config`, curriculum). The remaining work is
**frontend integration** — switching timetable load/save from localStorage to
`timetableApi` in `frontend/src/api/client.ts` (the Clerk token is already wired
in). That lands in a follow-up once this backend URL returns 401 above.

## Local development (optional)

`docker compose up --build -d` runs Postgres + the API locally (see `Makefile`:
`make up`, `make migrate`, `make logs`). Set `SKIP_AUTH=true` to bypass Clerk in
local dev.
