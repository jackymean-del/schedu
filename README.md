# SmartSched v3 — AI Timetable Generator

## Tech Stack (May 2026)

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19.1 | UI framework (Server Components, useTransition, Actions) |
| **TypeScript** | 5.8 | Type safety across the whole codebase |
| **Vite** | 6.3 (Rolldown) | Build tool — 10× faster than Webpack |
| **Tailwind CSS** | v4.1 | Utility CSS — no config file needed with Vite plugin |
| **shadcn/ui** | latest | Accessible component primitives (Radix UI based) |
| **TanStack Query** | v5 | Server state, caching, loading states |
| **TanStack Router** | v1 | Type-safe file-based routing |
| **Zustand** | v5 | Client state management |
| **Zod** | v3 | Runtime validation + TypeScript inference |
| **Lucide React** | latest | Icon library |
| **xlsx** | 0.18 | Excel export |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| **Go** | 1.26.3 | API server (Green Tea GC, better generics) |
| **Fiber** | v3 | Fast HTTP framework |
| **pgx** | v5 | PostgreSQL driver (no ORM overhead) |
| **JWT** | v5 | Token auth |

### Database
| Technology | Version | Purpose |
|---|---|---|
| **PostgreSQL** | 17 | Primary database |
| **Drizzle ORM** | 0.45 | TypeScript schema + migrations |
| **Drizzle Kit** | latest | Migration tooling |

### Infrastructure
| Tool | Purpose |
|---|---|
| **Docker** + **Docker Compose** | Local dev + production containers |
| **Vercel** | Frontend hosting (zero config) |
| **Fly.io / Railway** | Backend hosting |
| **Neon / Supabase** | Managed PostgreSQL |
| **GitHub Actions** | CI/CD pipeline |

---

## Quick Start

### Open in browser (zero setup)
The old `frontend/index.html` still works — open it directly in any browser.

### Modern dev setup
```bash
# Prerequisites: Node 22 LTS, Go 1.26
git clone https://github.com/jackymean-del/smart-sched.git
cd smart-sched

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173

# Backend (new terminal)
cd backend
cp ../.env.example .env   # fill in DATABASE_URL
SKIP_AUTH=true go run ./cmd/server   # http://localhost:8080
```

### Full stack with Docker
```bash
cp .env.example .env
docker compose up
# Frontend: http://localhost:3000
# API:      http://localhost:8080/health
```

---

## Project Structure
```
smart-sched/
├── frontend/                    React 19 + Vite 6 + Tailwind v4
│   ├── src/
│   │   ├── main.tsx             App entry + TanStack Router
│   │   ├── index.css            Tailwind v4 (just @import "tailwindcss")
│   │   ├── types/index.ts       All TypeScript types + Zod schemas
│   │   ├── store/               Zustand stores
│   │   ├── lib/
│   │   │   ├── aiEngine.ts      AI timetable generation
│   │   │   ├── orgData.ts       Country + org config data
│   │   │   └── utils.ts         Helpers
│   │   ├── api/client.ts        Axios API client
│   │   ├── components/          Reusable UI (shadcn/ui based)
│   │   ├── pages/               TanStack Router pages
│   │   └── hooks/               Custom React hooks
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                     Go 1.26 + Fiber v3
│   ├── cmd/server/main.go       Server entry
│   ├── internal/
│   │   ├── db/                  pgx connection pool
│   │   ├── handlers/            REST handlers
│   │   └── middleware/          JWT auth
│   ├── go.mod
│   └── Dockerfile
│
├── database/
│   ├── schema.ts                Drizzle ORM schema
│   ├── drizzle.config.ts
│   └── migrations/
│       └── 001_initial.sql      PostgreSQL 17 schema
│
├── docker-compose.yml
├── vercel.json
└── .env.example
```

## Repo: https://github.com/jackymean-del/smart-sched
