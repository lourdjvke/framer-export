# Visage

A web design editor where users import projects from Framer or local HTML files, inspect and edit elements visually, and push to GitHub — all with a point-based economy backed by Firebase.

## Run & Operate

- `pnpm --filter @workspace/framer-export run dev` — run the frontend (Vite, port from `PORT`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React 18, Vite, Tailwind CSS v4, Framer Motion, shadcn/ui, wouter
- Auth & DB: Firebase Auth + Firebase Realtime Database (RTDB) — no Firestore
- API server: Express 5, Drizzle ORM + PostgreSQL (api-server only)
- GitHub integration: GitHub REST API via user PAT

## Where things live

- `artifacts/framer-export/` — main frontend SPA
  - `src/pages/home.tsx` — main editor page (auth flow + editor UI)
  - `src/components/auth/` — AuthOverlay, GithubCredentialsModal
  - `src/components/editor/` — ElementInspector, TemplateGallery, GithubSync, ProjectNameModal
  - `src/contexts/AuthContext.tsx` — Firebase auth context
  - `src/lib/firebase.ts` — Firebase app init
  - `src/lib/points.ts` — RTDB point ledger + GitHub credential storage
- `artifacts/api-server/` — Express API (scraper, proxy pool)
- `lib/` — shared packages (db, api-spec, api-zod, api-client-react)

## Firebase config

Project: `visage-a1d96` | RTDB: `visage-a1d96-default-rtdb.firebaseio.com`
Auth providers: Google, GitHub, Email/Password

## Point economy

| Action | Cost |
|---|---|
| Account creation | +5 pts |
| Import from Framer | −4 pts |
| Push to GitHub | −1 pt |
| Unlock template | −10 pts |
| Min balance to enter Preview mode | 2 pts (gate, no deduction) |

## Architecture decisions

- Firebase RTDB only — no Firestore or Firebase Storage per spec
- GitHub credentials (username + PAT) stored in RTDB under `users/{uid}/github`
- Element inspector works by injecting mouse listeners into the preview iframe's contentDocument
- Points are watched in real-time via `onValue` and displayed in the top nav

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The `DATABASE_URL` env var is only needed by `api-server` (Drizzle/Postgres) — the frontend uses Firebase exclusively
- GitHub PAT must have `repo` scope for the push feature to work
- Preview mode requires ≥2 points (gate check, not a deduction)
- Cursor tool is disabled until a project is loaded in the canvas
