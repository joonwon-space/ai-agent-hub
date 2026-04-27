# ai-agent-hub — Tasks

## Current work

### Security (High Priority)
- [x] Add `express-rate-limit` on `POST /api/auth/login` and `POST /api/auth/register` — 5 req/min per IP
- [x] Add `req.session.regenerate()` call after successful login and register to prevent session fixation
- [x] Add Express global error handler in `backend/src/index.js` — catch unhandled async errors, log + return `{ error: 'Internal server error' }` 500

### Reliability
- [x] Add `timeout` option (30s) to axios call in `backend/src/services/ollama.js` — prevent indefinite hang on slow Ollama
- [x] Add JSON parse error recovery in `ollama.js` — strip markdown code fences before regex match
- [x] Add `healthcheck` to `docker-compose.yml` for backend service (curl `/api/auth/setup-required`) and db (pg_isready)

### Testing
- [x] Add Jest + Supertest dev dependency to `backend/` and configure test script in `package.json`
- [x] Write integration test for `POST /api/auth/register` — happy path, duplicate email, short password
- [x] Write integration test for `POST /api/auth/login` — happy path, wrong password, missing fields
- [x] Write integration test for `GET|PUT /api/settings` — upsert, encrypt, mask, delete
- [x] Extend Playwright E2E spec (`qa/visual-qa.spec.js`) with login flow test
- [x] Extend Playwright E2E spec with settings save + load test

### Code Quality
- [x] Extract shared auth page CSS into `frontend/src/css/auth.css` and link from login.html, signup.html, and settings.html
- [ ] Add `loadAgents()` registry-clear guard in `agentLoader.js` — call `registry.clear()` before re-scan to prevent double-registration on hot reload
- [ ] Add try/catch wrappers around `POST /api/auth/login` and `GET /api/auth/me` Prisma calls in `backend/src/routes/auth.js`
