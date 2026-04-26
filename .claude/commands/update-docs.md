---
description: Sync README.md with current codebase state. Extracts ground truth from code first, diffs against README.md, then updates only what changed.
---

# Update Docs

Use the **doc-updater** agent for this task.

Delegate all work to the `doc-updater` agent now.

## What this command does

1. **Extracts ground truth from code** using bash/glob/grep — never relies on AI memory:
   - All backend API routes from `backend/src/routes/*.js`
   - All agents from `backend/src/agents/`
   - All frontend pages from `frontend/pages/` and `frontend/public/`
   - Environment variables from `.env.example`
   - Docker services from `docker-compose.yml`
   - Recent git changes (`git log --oneline -20`)

2. **Reads existing `README.md`**

3. **Builds an explicit diff** — two lists per section:
   - Items in code but missing from README → add
   - Items in README but not in code → remove

4. **Updates `README.md`** based on the diff — does not rewrite sections that are already accurate

5. **Commits** the README.md changes

## What this command does NOT touch

- Source code — documentation only
- `docs/` directory — only `README.md` is in scope
- `.env` (actual secrets file)

## When to run

- After implementing a significant feature or milestone
- When README.md feels stale or out of sync with reality
- Before a code review
- After adding a new agent
