# ai-agent-hub — Architecture Overview

_Last updated: 2026-05-03_

## Summary

Personal AI agent hub. A self-hosted Node.js + Express backend paired with a vanilla JS / Nginx frontend, running as Docker Compose services behind a Cloudflare tunnel. Ships one agent (Jira issue auto-creation via Ollama LLM) and a personal space feature (My Space — diary, recipe, freeform note workspaces).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 20, Express 4 |
| Database | PostgreSQL 16 (via Prisma 5) |
| Session store | `connect-pg-simple` (PostgreSQL-backed) |
| Auth | Session cookies (httpOnly, secure in prod) + bcrypt |
| Encryption | AES-256-GCM (`crypto` stdlib) |
| LLM | Ollama (local, `gemma4:e4b` default) |
| File parsing | `multer` (memory storage) + `pdf-parse` |
| Frontend | Vanilla JS, nginx:alpine |
| Reverse proxy | nginx (serves static files, proxies `/api/*` to backend) |
| Tunnel | Cloudflare cloudflared |
| CI/CD | GitHub Actions (3 workflows) |
| E2E testing | Playwright (`qa/` directory) |
| Package manager | npm |

---

## Project Structure

```
ai-agent-hub/
├── backend/
│   ├── src/
│   │   ├── index.js              # Entry point (port 3000, internal only)
│   │   ├── agentLoader.js        # Auto-discovers and registers agents at startup
│   │   ├── routes/
│   │   │   ├── agents.js         # GET /api/agents, POST /api/agents/:name/preview|run
│   │   │   ├── auth.js           # Auth CRUD (register, login, logout, me, setup-required)
│   │   │   ├── mySpace.js        # Space + Diary CRUD (GET|POST|PATCH|DELETE /api/my-space/*)
│   │   │   ├── settings.js       # GET|PUT /api/settings (per-user, encrypted sensitive values)
│   │   │   └── upload.js         # POST /api/upload (image/PDF/text parsing)
│   │   ├── services/
│   │   │   ├── db.js             # Prisma singleton (global caching in dev)
│   │   │   ├── mySpaceValidation.js # Pure validation helpers for My Space routes (PRD §5)
│   │   │   └── ollama.js         # extractWithOllama() — calls Ollama /api/generate
│   │   ├── agents/
│   │   │   ├── base.js           # BaseAgent class (name, description, inputSchema, run, preview)
│   │   │   └── jiraAgent.js      # Jira issue auto-creation agent
│   │   ├── middleware/
│   │   │   └── auth.js           # requireAuth middleware (session → DB lookup → req.user)
│   │   └── utils/
│   │       └── crypto.js         # AES-256-GCM encrypt/decrypt (key validated at startup)
│   ├── prisma/
│   │   ├── schema.prisma         # User, UserSetting, Session, Space, DiaryEntry, Recipe, FreeformNote
│   │   └── migrations/           # 20260426055925_init, 20260503000000_add_my_space
│   └── Dockerfile                # node:20-alpine, runs prisma migrate deploy on start
├── frontend/
│   ├── public/
│   │   └── index.html            # Main dashboard (FOUC prevention, agent list + panel + Personal section)
│   ├── pages/
│   │   ├── login.html            # Login page (self-contained CSS, FOUC prevention)
│   │   ├── my-space.html         # My Space landing / onboarding / dashboard
│   │   ├── my-space-diary-edit.html # Diary create/edit (Screen 03)
│   │   ├── signup.html           # Signup page
│   │   └── settings.html         # Jira settings page
│   ├── src/
│   │   ├── css/
│   │   │   ├── main.css          # App-wide design tokens (dark/light, Dodger Blue + Lime Green)
│   │   │   ├── my-space-tokens.css # Diary (amber) + Recipe (green) accent tokens
│   │   │   └── my-space.css      # My Space page styles (onboarding, dashboard, diary edit, .badge-new)
│   │   └── js/
│   │       ├── auth.js           # login, logout, register, getMe, setupRequired, authFetch
│   │       ├── api.js            # fetchAgents, uploadFile, previewAgent, runAgent
│   │       ├── main.js           # Dashboard init, sidebar (Agents + Personal), agent panel
│   │       ├── theme.js          # localStorage dark/light toggle
│   │       ├── agents/jira.js    # Jira-specific preview/confirm UI
│   │       ├── my-space/
│   │       │   ├── api.js        # mySpace.* + diary.* wrappers (authFetch)
│   │       │   ├── autosave.js   # 500ms debounce + 3x exponential-backoff retry
│   │       │   └── components.js # el(), renderTemplateCard(), renderDiaryCard() (zero innerHTML)
│   │       └── pages/
│   │           ├── login.js      # Login form logic + setup-required redirect
│   │           ├── my-space.js   # Onboarding / dashboard controller
│   │           ├── my-space-diary-edit.js # Diary create/edit controller with autosave
│   │           ├── signup.js     # Signup form logic (password confirmation)
│   │           └── settings.js   # Settings form load/save
│   ├── nginx.conf                # Static serving + /api/* proxy, no-cache headers
│   └── Dockerfile                # nginx:alpine, copies static files
├── qa/
│   ├── visual-qa.spec.js         # Playwright E2E tests (theme toggle, persist, login page)
│   └── playwright.config.js
├── docs/
│   └── architecture/
│       ├── overview.md           # (this file)
│       ├── analysis.md
│       └── api-reference.md      # Full API reference (all routes + agent schemas)
├── .github/
│   └── workflows/
│       ├── deploy.yml            # Push-to-main → self-hosted deploy, health checks
│       ├── backend.yml           # Backend CI: npm audit --audit-level=high (path-filtered)
│       └── docker-build.yml      # PR Docker build verification (no push)
├── docker-compose.yml            # db + backend + frontend + cloudflared
└── .env.example                  # DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, OLLAMA_*, CLOUDFLARE_*
```

---

## Network Architecture

```
[Browser] → frontend:80 (nginx)
               ├── static files (HTML, CSS, JS)
               └── /api/* → backend:3000 (internal only)
                               ├── db:5432 (PostgreSQL, internal only)
                               └── host.docker.internal:11434 (Ollama on host)
```

The `backend` and `db` containers expose no external ports. All external traffic goes through nginx, optionally exposed via Cloudflare tunnel.

---

## API Surface

### Auth (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/setup-required` | None | Check if first-time setup needed |
| POST | `/api/auth/register` | None | Create user account (no limit enforced) |
| POST | `/api/auth/login` | None | Login, set session cookie |
| POST | `/api/auth/logout` | Session | Destroy session |
| GET | `/api/auth/me` | Session | Return current user |

### Agents (`/api/agents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | Required | List all loaded agents |
| POST | `/api/agents/:name/preview` | Required | Run agent preview step |
| POST | `/api/agents/:name/run` | Required | Execute agent |

### Upload (`/api/upload`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload` | Required | Upload file (image/PDF/text), get normalized content |

### Settings (`/api/settings`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | Required | Get all user settings (sensitive values masked) |
| PUT | `/api/settings` | Required | Upsert settings (empty string = delete) |

### My Space (`/api/my-space`)

All routes require session auth. Owner-mismatch → 404 (not 403) to prevent info-leak.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/my-space` | Required | List user's spaces |
| POST | `/api/my-space` | Required | Create space (`name`, `template`) |
| PATCH | `/api/my-space/:id` | Required | Rename space |
| DELETE | `/api/my-space/:id` | Required | Delete space (cascade) |
| GET | `/api/my-space/:spaceId/diary` | Required | List diary entries (cursor pagination) |
| POST | `/api/my-space/:spaceId/diary` | Required | Create diary entry |
| GET | `/api/my-space/:spaceId/diary/:id` | Required | Get single diary entry |
| PATCH | `/api/my-space/:spaceId/diary/:id` | Required | Update diary entry (autosave) |
| DELETE | `/api/my-space/:spaceId/diary/:id` | Required | Delete diary entry |

---

## Data Models

### User
- `id` Int PK autoincrement
- `email` String unique
- `passwordHash` String
- `createdAt` DateTime

### UserSetting
- `userId` + `key` unique composite
- `value` String
- `encrypted` Boolean (AES-256-GCM at rest)

### Session
- `sid` PK, `sess` JSON, `expire` DateTime
- Created by `connect-pg-simple` / `createTableIfMissing: false` (must exist from migration)

### Space _(added Phase 1)_
- `id` Int PK autoincrement
- `userId` Int FK → User (cascade delete)
- `name` String — user-chosen title (1–80 chars)
- `template` String — `'diary' | 'recipe' | 'freeform'`
- `createdAt`, `updatedAt` DateTime
- Index: `userId`

### DiaryEntry _(added Phase 1)_
- `id` Int PK autoincrement
- `spaceId` Int FK → Space (cascade delete)
- `entryDate` Date (yyyy-MM-dd, user-selected)
- `mood` String? — `'happy' | 'sad' | 'angry' | 'tired' | null`
- `title` String (1–120 chars)
- `body` Text (0–50,000 chars, markdown or plain)
- `createdAt`, `updatedAt` DateTime
- Index: `(spaceId, entryDate)`

### Recipe _(model added Phase 1; API endpoints deferred to Phase 1.5)_
- `id` Int PK autoincrement
- `spaceId` Int FK → Space (cascade delete)
- `name`, `category`, `difficulty` String
- `cookTimeMin`, `servings` Int?
- `description` Text?
- `ingredients` JSON — `[{ name, amount }]`
- `steps` JSON — `[{ order, text }]`
- `coverImage` String? (base64 or URL)
- `createdAt`, `updatedAt` DateTime
- Index: `(spaceId, category)`

### FreeformNote _(model added Phase 1; API endpoints deferred to Phase 2)_
- `id` Int PK autoincrement
- `spaceId` Int FK → Space (cascade delete)
- `title` String, `body` Text (markdown)
- `pinned` Boolean default false
- `createdAt`, `updatedAt` DateTime
- Index: `spaceId`

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session signing key (required at startup) |
| `ENCRYPTION_KEY` | 64 hex chars for AES-256-GCM (required at startup) |
| `OLLAMA_HOST` | Ollama base URL (default: `http://host.docker.internal:11434`) |
| `OLLAMA_MODEL` | Model name (default: `gemma4:e4b`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel token |
| `PORT` | Backend port (default: 3000) |
| `CORS_ORIGIN` | Allowed CORS origin (default: `http://localhost`) |

---

## Agent System

Agents live in `backend/src/agents/` as classes extending `BaseAgent`. At startup, `agentLoader.js` scans the directory, instantiates each agent, and registers it by `name`. The `inputSchema` array drives the frontend form rendering generically — `jira`-specific preview/confirm flow is handled by `frontend/src/js/agents/jira.js`.

Adding a new agent requires only:
1. Create `backend/src/agents/myAgent.js` extending `BaseAgent`
2. Implement `run(input, context)` (and optionally `preview(input, context)`)
3. If the agent has a custom multi-step UI, add `frontend/src/js/agents/my.js`

---

## CI/CD

- **deploy.yml**: On push to `main`, runs on self-hosted macOS runner. Writes `.env` from secret, unlocks macOS Keychain, builds Docker images in parallel, brings up services, polls health endpoints.
- **backend.yml**: On every push/PR touching `backend/**`, runs `npm audit --audit-level=high`.
- **docker-build.yml**: On PRs to `main`, verifies both Docker images build successfully (no push).
