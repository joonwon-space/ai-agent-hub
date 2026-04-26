# ai-agent-hub — Architecture Analysis

_Last updated: 2026-04-27_

---

## Completeness

| Area | Status | Notes |
|------|--------|-------|
| Auth (session + bcrypt) | Complete | FOUC-safe, session stored in PostgreSQL |
| Settings (encrypted at rest) | Complete | AES-256-GCM, masked in GET response |
| Jira agent (preview + run) | Complete | Ollama LLM extraction, file attachment support |
| File upload (image/PDF/text) | Complete | Memory storage, 10 MB limit |
| Theme system (dark/light) | Complete | localStorage persistence, FOUC prevention |
| Docker Compose stack | Complete | db + backend + frontend + cloudflared |
| CI/CD (deploy, audit, build check) | Complete | 3 GitHub Actions workflows |
| E2E tests (Playwright) | Partial | Only theme toggle tested; auth flow, agent run, settings untested |
| Unit/integration tests | Missing | No test files in backend/ |
| Error handling middleware | Missing | No Express global error handler in index.js |
| Rate limiting | Missing | No rate limiting on auth or agent endpoints |
| Input validation library | Missing | Ad-hoc manual checks only |
| Logging | Missing | Only console.log/console.warn |

---

## Strengths

- **Startup validation**: SESSION_SECRET and ENCRYPTION_KEY are checked before the server starts — fail-fast prevents silent misconfigurations.
- **Encryption at rest**: Sensitive settings encrypted with AES-256-GCM. Masked on read so the raw value never reaches the browser.
- **Agent extensibility**: agentLoader.js auto-discovers agents at startup; inputSchema drives generic UI rendering.
- **Security defaults**: Backend and DB ports unexposed externally. Session cookies are httpOnly and secure in production.
- **FOUC prevention**: Inline script applies theme before first paint on all pages.
- **Migration safety**: Prisma migrations applied at container startup (migrate deploy).
- **No vulnerabilities**: npm audit reports 0 vulnerabilities.

---

## Weaknesses

### High Priority

- **No Express global error handler**: Async errors in auth.js routes (login, me) are not wrapped in try/catch — unexpected Prisma errors return unformatted 500s or hang.
- **No rate limiting**: /api/auth/login and /api/auth/register accept unlimited requests — brute-force attacks are trivially possible.
- **No backend unit/integration tests**: Zero test coverage on auth, settings encryption, and agent execution.
- **Session fixation risk**: login and register do not call req.session.regenerate() after elevating privilege.

### Medium Priority

- **CSS duplication**: login.html, signup.html, and settings.html embed full inline CSS with duplicated design tokens. Palette changes require edits in 4+ files.
- **main.js agent-name hardcode**: renderAgentPanel branches on a.name === 'jira' — new agents with custom preview flows need manual if-branches.
- **No axios timeout in ollama.js**: Slow Ollama responses hang the request indefinitely.
- **Ollama JSON parse resilience**: If Ollama wraps JSON in markdown fences the regex may silently fail.

### Low Priority

- **No healthcheck in docker-compose**: Services have no container-level health checks.
- **agentLoader re-registration risk**: loadAgents() does not clear the registry before re-scanning.
- **theme.js double-apply**: Both the FOUC inline script and theme.js call applyTheme() on dashboard page load.

---

## Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Auth brute-force (no rate limit) | High | High | Add express-rate-limit on auth login/register |
| Unhandled Prisma errors crash server | High | Medium | Add global Express error handler |
| Session fixation after login | High | Low | Call req.session.regenerate() after login |
| Ollama timeout hangs request | Medium | Medium | Add axios timeout in ollama.js |
| No test coverage leading to regressions | Medium | High | Add Jest + Supertest integration tests |
| CSS drift between auth pages | Low | High | Extract shared CSS to src/css/auth.css |
| Agent re-registration on hot reload | Low | Low | Guard loadAgents() with registry clear |
