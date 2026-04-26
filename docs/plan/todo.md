# ai-agent-hub — TODO

## Milestone 1: Agent Extensibility

- [ ] Add `renderActions()` method to `BaseAgent` — return default run button HTML — so `main.js` can call `agent.renderActions()` instead of branching on `a.name === 'jira'`
- [ ] Move Jira-specific `renderJiraActions()` into a `JiraAgent.renderActions()` override
- [ ] Add a second agent as proof-of-concept (e.g., GitHub issue creator or Notion page creator)
- [ ] Add per-agent settings schema to `BaseAgent` — declarative list of required settings keys — so the UI can show agent-specific setup warnings

## Milestone 2: Observability & Logging

- [ ] Replace console.log/warn with a structured logger (e.g., `pino`) in the backend
- [ ] Add request logging middleware (method, path, status, duration) to `index.js`
- [ ] Add agent execution audit log table in Prisma schema — store agent name, userId, timestamp, success/failure
- [ ] Expose `/api/agents/:name/history` endpoint returning recent runs for the current user

## Milestone 3: Testing Completeness

- [ ] Add integration tests for `POST /api/upload` — image, PDF, text, oversized file
- [ ] Add integration tests for `POST /api/agents/jira/preview` with Ollama mocked
- [ ] Add integration tests for `POST /api/agents/jira/run` with Jira API mocked
- [ ] Achieve 80%+ test coverage on backend routes

## Milestone 4: Multi-Agent UX

- [ ] Agent panel: add inline "settings not configured" warning with link to /settings when required settings are missing
- [ ] Add agent search/filter in sidebar when more than 5 agents are registered
- [ ] Dashboard: show recent execution results per agent (last run status + timestamp)

## Milestone 5: Infrastructure

- [ ] Add `NODE_ENV=production` to backend service in docker-compose.yml
- [ ] Add `depends_on: condition: service_healthy` once healthchecks are added (Milestone Tasks)
- [ ] Configure Dependabot for `backend/` and `qa/` npm packages with weekly cadence
- [ ] Add `docker-compose.override.yml` for local development (expose backend port, disable tunnel)

## Milestone 6: Long-term / Nice-to-have

- [ ] Multi-user access control — admin role, user management UI
- [ ] Per-user rate limiting on agent runs to prevent Ollama overload
- [ ] Support streaming Ollama responses (SSE) for long-running agents
- [ ] Agent marketplace / registry page showing all available agents and their required settings
