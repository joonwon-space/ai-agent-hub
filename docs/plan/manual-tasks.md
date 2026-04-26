# ai-agent-hub — Manual Tasks

These items require human action outside the codebase (secrets, external services, infrastructure).

## Environment Setup

- [ ] Generate SESSION_SECRET: `openssl rand -hex 32` and set in production .env and GitHub secret `BACKEND_ENV_FILE`
- [ ] Generate ENCRYPTION_KEY: `openssl rand -hex 32` and set in production .env and GitHub secret `BACKEND_ENV_FILE`
- [ ] Set CLOUDFLARE_TUNNEL_TOKEN in production .env and GitHub secret

## Ollama

- [ ] Ensure Ollama is running on the host with `gemma4:e4b` (or configured model) pulled: `ollama pull gemma4:e4b`
- [ ] Verify `host.docker.internal` resolves correctly on the deployment host (Linux may need extra_hosts entry)

## GitHub Actions

- [ ] Confirm `BACKEND_ENV_FILE` secret is set in GitHub repository settings (used by deploy.yml)
- [ ] Confirm `KEYCHAIN_PASSWORD` secret is set (used by deploy.yml macOS Keychain unlock)
- [ ] Confirm self-hosted runner is registered with the `deploy` label

## Jira

- [ ] Each user must obtain a Jira API token from Atlassian account security settings and enter it via /settings
- [ ] Confirm the Jira project key is correct and the API token has permission to create issues in that project
