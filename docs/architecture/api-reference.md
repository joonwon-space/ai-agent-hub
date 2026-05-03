# API Reference

Base URL: `/api`

All endpoints except `/api/auth/setup-required`, `/api/auth/register`, and `/api/auth/login` require an active session cookie set by a successful login or register call.

---

## Auth (`/api/auth`)

### GET /api/auth/setup-required

Checks whether any user account exists yet. Used by the frontend to decide whether to show the register form or the login form on first visit.

- **Auth**: None
- **Response**: `{ setupRequired: boolean }`

---

### POST /api/auth/register

Creates the first (and only) user account. Returns 403 if any account already exists.

- **Auth**: None
- **Request**: `{ email: string, password: string }`
  - `password` must be at least 8 characters
- **Response 200**: `{ id: string, email: string }`
- **Response 400**: missing fields or password too short
- **Response 403**: account already exists
- **Response 409**: email already in use

---

### POST /api/auth/login

Authenticates with email and password and sets a session cookie.

- **Auth**: None
- **Request**: `{ email: string, password: string }`
- **Response 200**: `{ id: string, email: string }`
- **Response 400**: missing fields
- **Response 401**: wrong credentials

---

### POST /api/auth/logout

Destroys the current session and clears the session cookie.

- **Auth**: Session cookie (ignored gracefully if not present)
- **Request**: empty body
- **Response**: `{ ok: true }`

---

### GET /api/auth/me

Returns the currently authenticated user.

- **Auth**: Session cookie required
- **Response 200**: `{ id: string, email: string }`
- **Response 401**: not authenticated or user not found

---

## Agents (`/api/agents`)

All agent endpoints require authentication.

### GET /api/agents

Lists all loaded agents.

- **Auth**: Required
- **Response**: Array of `{ name: string, description: string, inputSchema: InputField[] }`

`InputField` shape:
```json
{ "key": "string", "label": "string", "type": "textarea|file|text", "placeholder": "string", "accept": "string (optional)", "required": "boolean (optional)" }
```

---

### POST /api/agents/:name/preview

Runs the preview step for an agent (e.g., extracts fields without creating anything).

- **Auth**: Required
- **Path param**: `name` — agent name (e.g., `jira`)
- **Request**: agent-specific body (see per-agent schemas below)
- **Response 200**: agent-specific preview result
- **Response 404**: `{ error: string }` — agent not found
- **Response 500**: `{ error: string }` — agent execution error

---

### POST /api/agents/:name/run

Executes an agent and produces a result (e.g., creates a Jira issue).

- **Auth**: Required
- **Path param**: `name` — agent name
- **Request**: agent-specific body (see per-agent schemas below)
- **Response 200**: agent-specific result
- **Response 404**: `{ error: string }` — agent not found
- **Response 500**: `{ error: string }` — agent execution error

---

## Upload (`/api/upload`)

### POST /api/upload

Accepts a multipart file upload and returns the file's content in a normalized form. Supports images (returned as base64), PDFs (text extracted), and plain text files.

- **Auth**: Required
- **Request**: `multipart/form-data` with a single field `file` (max 10 MB)
- **Response for images**: `{ type: "image", mimeType, filename, content: "<base64>" }`
- **Response for PDFs**: `{ type: "pdf", mimeType, filename, content: "<extracted text>" }`
- **Response for text**: `{ type: "text", mimeType, filename, content: "<utf-8 string>" }`
- **Response 400**: no file provided
- **Response 500**: file processing error

---

## Settings (`/api/settings`)

All settings are stored per-user. Values whose keys match `/token|secret|password/i` or are in the known sensitive set (`jira_api_token`) are encrypted at rest with AES-256-GCM before being stored. Sensitive values are returned masked (last 4 characters visible).

### GET /api/settings

Returns all settings for the authenticated user.

- **Auth**: Required
- **Response**: `{ [key: string]: string }` — sensitive values are masked

---

### PUT /api/settings

Upserts one or more settings for the authenticated user. Pass an empty string for a key to delete it.

- **Auth**: Required
- **Request**: `{ [key: string]: string }`
- **Response**: `{ ok: true }`
- **Response 400**: body is not an object

---

## My Space (`/api/my-space`)

All My Space endpoints require authentication. Owner-check enforced on every sub-resource: if `spaceId` does not belong to `req.user.id`, the response is **404** (info-leak prevention; not 403).

### GET /api/my-space

List all spaces belonging to the authenticated user.

- **Auth**: Required
- **Response**: Array of Space objects (empty array if none)

---

### POST /api/my-space

Create a new Space.

- **Auth**: Required
- **Request**: `{ name: string, template: 'diary' | 'recipe' | 'freeform' }`
  - `name`: 1–80 characters
  - `template`: must be one of the three enum values
- **Response 201**: Space object
- **Response 400**: `{ error: 'Validation failed', details: { field: reason } }`

---

### PATCH /api/my-space/:id

Update a Space's name.

- **Auth**: Required
- **Path param**: `id` — Space ID (must be owned by the current user)
- **Request**: `{ name?: string }`
- **Response 200**: Updated Space object
- **Response 404**: Space not found or not owned

---

### DELETE /api/my-space/:id

Delete a Space and all its contents (cascade).

- **Auth**: Required
- **Response 200**: `{ ok: true }`
- **Response 404**: Space not found or not owned

---

### GET /api/my-space/:spaceId/diary

List diary entries for a Space. Sorted by `entryDate desc`. Supports cursor-based pagination.

- **Auth**: Required
- **Query params**: `limit` (default 20, max 100), `cursor` (last entry id for next page)
- **Response**: Array of DiaryEntry objects

---

### POST /api/my-space/:spaceId/diary

Create a new diary entry.

- **Auth**: Required
- **Request**: `{ entryDate: string (yyyy-MM-dd), mood?: 'happy'|'sad'|'angry'|'tired', title: string, body: string }`
  - `entryDate`: ISO date, not more than 365 days in the future
  - `title`: 1–120 characters
  - `body`: 0–50,000 characters
- **Response 201**: DiaryEntry object
- **Response 404**: Space not found or not owned
- **Response 400**: `{ error: 'Validation failed', details: { field: reason } }`

---

### GET /api/my-space/:spaceId/diary/:id

Get a single diary entry.

- **Auth**: Required
- **Response 200**: DiaryEntry object
- **Response 404**: Space or entry not found

---

### PATCH /api/my-space/:spaceId/diary/:id

Partial update of a diary entry (called by the autosave mechanism).

- **Auth**: Required
- **Request**: Any subset of `{ entryDate, mood, title, body }` (same validation rules as POST)
- **Response 200**: Updated DiaryEntry object
- **Response 404**: Space or entry not found
- **Response 400**: Validation failed

---

### DELETE /api/my-space/:spaceId/diary/:id

Delete a diary entry.

- **Auth**: Required
- **Response 200**: `{ ok: true }`
- **Response 404**: Space or entry not found

---

## Per-Agent Input Schemas

### jira

Used with `POST /api/agents/jira/preview` and `POST /api/agents/jira/run`.

| Key | Label | Type | Required |
|-----|-------|------|----------|
| `overview` | 작업 개요 | `textarea` | Yes (or provide `fileData`) |
| `file` | 파일 첨부 | `file` (image/*, .pdf, .txt, .md) | No |

**Preview response**: `{ fields: { summary, description, issuetype, priority } }`

**Run request** (after preview): include `fields` from the preview response alongside `overview` to skip re-extraction.

**Run response**: `{ issueKey: string, issueUrl: string, fields: object }`

Required settings (stored via `/api/settings`):
- `jira_base_url` — e.g., `https://yourorg.atlassian.net`
- `jira_email` — Atlassian account email
- `jira_api_token` — Atlassian API token (encrypted at rest)
- `jira_project_key` — Jira project key, e.g., `PROJ`
