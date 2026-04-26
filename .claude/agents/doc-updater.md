---
name: doc-updater
description: Sync README.md and docs/ with current codebase state. Extracts ground truth from code first, diffs against docs, then updates only what changed. Never relies on AI memory.
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Documentation Updater

**Core principle**: Extract facts from code first → diff against docs → update only what's wrong.
Never rely on AI memory. Always verify from source before writing anything.

---

## Phase 1: Extract Ground Truth from Code

Run ALL of the following before reading any docs.

### 1a. Backend API routes

Get all Express routes from route files:
```bash
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" backend/src/routes/*.js | \
  sed 's|backend/src/routes/||; s|\.js:[0-9]*:router\.| |; s|('\''|'\'' |; s|'\''.*||'
```

Read `backend/src/index.js` to confirm router mount prefixes (e.g. `/api/agents`, `/api/auth`).

Build a complete canonical route list:
```
METHOD  /full/path                       FILE
GET     /api/agents                      routes/agents.js
POST    /api/agents/:name/preview        routes/agents.js
...
```

### 1b. Agent list

```bash
ls backend/src/agents/*.js | grep -v base.js
```

For each agent, read the file to get: name, description, inputSchema fields.

### 1c. Frontend pages

```bash
ls frontend/pages/*.html frontend/public/*.html 2>/dev/null
```

For each page, note the URL path it serves (from nginx.conf) and its purpose.

### 1d. Environment variables

```bash
cat .env.example
```

### 1e. Docker services

```bash
grep "^  [a-z]" docker-compose.yml | grep -v "#"
```

### 1f. Recent git changes

```bash
git log --oneline -20
```

Note every commit that adds/removes/renames a feature, endpoint, or agent.

---

## Phase 2: Read Existing Docs

Read these files in full (skip with a note if missing):

- `README.md` — main project doc
- `docs/architecture/overview.md` (if exists)
- `docs/architecture/api-reference.md` (if exists)

---

## Phase 3: Build Explicit Diffs

For each doc, produce two lists before touching anything:

### API diff (for README.md and api-reference.md)

**Missing from docs** (route exists in code, not in docs):
```
+ POST /api/settings
+ GET  /api/auth/setup-required
```

**Stale in docs** (route in docs, not in code):
```
- GET /api/some-removed-route
```

### Agent diff

**Missing from docs** (agent file exists, not documented):
```
+ someAgent.js → name, description
```

**Stale in docs** (documented but file removed):
```
- oldAgent
```

### Env var diff

**Missing from docs** (in .env.example, not in README):
```
+ ENCRYPTION_KEY
```

**Stale in docs** (in README, not in .env.example):
```
- OLD_VAR
```

If all diffs are empty → docs are in sync, skip to Phase 6.

---

## Phase 4: Update README.md

Apply only what the diff found. Do NOT rewrite sections that are still accurate.

### Project structure tree

Sync the directory tree with actual filesystem:
```bash
find backend/src frontend/src frontend/pages -type f | sort
```

Add missing files/dirs, remove entries that no longer exist.

### Environment variables table

Sync with `.env.example`. For each var: description, how to generate (if applicable).

### API route list (if present in README)

Sync with canonical route list from Phase 1. Update method, path, and brief description.

### Agents section

Sync with agent files. For each agent: name, description, inputSchema summary.

### Network diagram / architecture section

Update only if:
- New Docker services were added
- Service communication paths changed

---

## Phase 5: Update or Create `docs/architecture/api-reference.md`

If the file exists: apply diff from Phase 3 (add missing, remove stale).

If the file does NOT exist, create it:

```markdown
# API Reference

Base URL: `/api`
Auth: Session cookie required on all endpoints except `/api/auth/*`

---

## Auth (`/api/auth`)

### GET /api/auth/setup-required
- **Auth**: None
- **Response**: `{ setupRequired: boolean }`

### POST /api/auth/register
- **Auth**: None (only works when no users exist)
- **Request**: `{ email: string, password: string (min 8) }`
- **Response**: `{ id, email }`

...
```

Read each route handler before writing request/response shapes — do not guess.

---

## Phase 6: Commit

```bash
git add README.md docs/
git commit -m "docs: sync documentation with current codebase state"
```

---

## Phase 7: Output Report

```
## Ground Truth (extracted from code)
- Backend routes: N total
- Agents: N total
- Frontend pages: N total
- Docker services: N total

## Diffs Applied
### README.md
  Added routes: ...
  Added agents: ...
  Updated env vars: ...

### docs/architecture/api-reference.md
  Created / Updated N sections

## Unchanged (verified accurate)
- (list sections that were already correct)

## Committed
  docs: sync documentation with current codebase state
```
