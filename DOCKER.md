# Running SmartSched with Docker

The whole stack — React frontend, Go API, PostgreSQL, and the Python curriculum
services — runs from one `docker compose` command. This is the easiest way to
run the app locally end-to-end (including the contact form and timetable
sharing, which need the database).

## 1. Install Docker

- **Windows / macOS:** install **Docker Desktop** → https://www.docker.com/products/docker-desktop/
  After installing, launch Docker Desktop and wait until it reports "running".
- **Linux:** install Docker Engine + the Compose plugin
  (https://docs.docker.com/engine/install/).

Verify it's available:

```bash
docker --version
docker compose version
```

## 2. Start everything

From the project root:

```bash
docker compose up --build
```

This builds and starts all services. The database automatically runs every
migration in `database/migrations/*.sql` (plus the curriculum schema) the first
time it initializes.

| Service          | URL                              | Notes                                  |
| ---------------- | -------------------------------- | -------------------------------------- |
| Frontend (nginx) | http://localhost:3000            | Serves the SPA; proxies `/api` → API   |
| Go API           | http://localhost:8080            | `GET /health` → `{"status":"ok"}`      |
| PostgreSQL       | localhost:5432                   | db `smartsched`, user `smartsched`     |
| pdf-extractor    | http://localhost:5001            | Python service                         |
| syllabus-parser  | http://localhost:5002            | Python service                         |

In Compose the API runs with `SKIP_AUTH=true`, so you can exercise authenticated
endpoints locally without logging in.

Stop with `Ctrl+C`, or run detached with `docker compose up --build -d`.

## 3. Try the timetable share + contact endpoints

```bash
# Health
curl http://localhost:8080/health

# Contact form (public)
curl -X POST http://localhost:8080/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@school.edu","message":"Hi!"}'

# Create a PUBLIC share (SKIP_AUTH lets this through without a real token)
curl -X POST http://localhost:8080/api/v1/timetables/share \
  -H "Content-Type: application/json" -H "Authorization: Bearer dev" \
  -d '{"title":"Demo","visibility":"public","payload":{"title":"Demo","days":["MON"],"periods":[{"id":"p1","name":"P1","isBreak":false}],"sections":[{"name":"8A","grid":{"MON":{"p1":{"subject":"Maths"}}}}]}}'
# → {"token":"…","visibility":"public"}   then open http://localhost:3000/share/<token>

# Create an EMAIL-RESTRICTED share
curl -X POST http://localhost:8080/api/v1/timetables/share \
  -H "Content-Type: application/json" -H "Authorization: Bearer dev" \
  -d '{"title":"Private","visibility":"restricted","emails":["head@school.edu"],"payload":{"title":"Private","days":["MON"],"periods":[],"sections":[]}}'
# Viewer at /share/<token> will ask for an email; only head@school.edu unlocks it.
```

## 4. Applying migrations to an existing database

Postgres only auto-runs migrations on the **first** init of an empty volume. If
you already have a `postgres_data` volume from an earlier run, apply newer
migrations (e.g. `003_contact_messages`, `004_shared_timetables`) without
wiping data:

```powershell
# Windows (PowerShell) — db service must be running
./scripts/db-migrate.ps1
```

```bash
# macOS / Linux
make migrate
```

All migrations use `IF NOT EXISTS`, so this is safe to re-run.

## 5. Reset the database

To wipe the database and re-run every migration from scratch:

```bash
docker compose down -v   # removes the postgres_data volume
docker compose up --build
```

## 6. Faster frontend dev (hot reload)

For UI work, run only the backend + database in Docker and the frontend with
Vite's hot reload on the host:

```bash
docker compose up -d db api          # backend + database
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

Vite proxies `/api` to `localhost:8080`, and the API's CORS already allows
`http://localhost:5173`.

## Production note

The marketing site / SPA is deployed separately (Vercel static build of
`frontend/`). For the contact form and share links to work in production, the
deployed frontend must be able to reach the Go API. This is wired via a Vercel
rewrite in `vercel.json`:

```jsonc
"rewrites": [
  { "source": "/api/:path*", "destination": "https://api.schedu.bhusku.com/api/:path*" },
  { "source": "/(.*)",       "destination": "/index.html" }
]
```

**Action required:** change `https://api.schedu.bhusku.com` to wherever your Go
API is actually hosted (Fly.io, Railway, Render, a VPS, etc.). The `/api`
rewrite must come **before** the SPA catch-all. Until the API is deployed and
this host is correct, the contact form and share links fall back gracefully
(email fallback / "link not found"). Locally, everything is wired through the
nginx `/api` proxy instead.
