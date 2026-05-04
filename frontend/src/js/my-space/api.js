/**
 * api.js — Thin wrapper around authFetch for My Space API endpoints.
 *
 * All functions return parsed JSON on success.
 * On non-2xx: rejects with { status, error, details? }.
 *
 * Depends on authFetch from /src/js/auth.js (loaded as a global script tag).
 */

'use strict';

const MY_SPACE_BASE = '/api/my-space';

/**
 * Parse a non-2xx response into a rejection payload.
 */
async function parseError(res) {
  let body = {};
  try {
    body = await res.json();
  } catch (_) {
    // ignore parse error
  }
  const err = new Error(body.error || `HTTP ${res.status}`);
  err.status = res.status;
  err.error = body.error || `HTTP ${res.status}`;
  err.details = body.details;
  return err;
}

/**
 * Perform an authenticated fetch and parse JSON.
 * authFetch redirects to /login on 401 automatically.
 */
async function apiFetch(url, options = {}) {
  const res = await authFetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  // authFetch returns null on 401 (redirect already triggered)
  if (!res) return null;
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Space operations
// ---------------------------------------------------------------------------
const mySpace = {
  /**
   * List current user's spaces.
   * @returns {Promise<Array>}
   */
  list() {
    return apiFetch(MY_SPACE_BASE);
  },

  /**
   * Create a new space.
   * @param {{ name: string, template: string }} payload
   * @returns {Promise<Object>}
   */
  create({ name, template }) {
    return apiFetch(MY_SPACE_BASE, {
      method: 'POST',
      body: JSON.stringify({ name, template }),
    });
  },

  /**
   * Update space name.
   * @param {number} id
   * @param {{ name?: string }} patch
   * @returns {Promise<Object>}
   */
  update(id, patch) {
    return apiFetch(`${MY_SPACE_BASE}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Delete a space.
   * @param {number} id
   * @returns {Promise<Object>}
   */
  remove(id) {
    return apiFetch(`${MY_SPACE_BASE}/${id}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Diary operations
// ---------------------------------------------------------------------------
const diary = {
  /**
   * List diary entries for a space with cursor pagination.
   * @param {number} spaceId
   * @param {{ limit?: number, cursor?: number }} [opts]
   * @returns {Promise<Array>}
   */
  list(spaceId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', String(opts.cursor));
    const qs = params.toString() ? `?${params}` : '';
    return apiFetch(`${MY_SPACE_BASE}/${spaceId}/diary${qs}`);
  },

  /**
   * Create a diary entry.
   * @param {number} spaceId
   * @param {{ entryDate: string, mood?: string, title: string, body: string }} payload
   * @returns {Promise<Object>}
   */
  create(spaceId, payload) {
    return apiFetch(`${MY_SPACE_BASE}/${spaceId}/diary`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get a single diary entry.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  get(spaceId, id) {
    return apiFetch(`${MY_SPACE_BASE}/${spaceId}/diary/${id}`);
  },

  /**
   * Update (partial) a diary entry. Used by autosave.
   * @param {number} spaceId
   * @param {number} id
   * @param {Partial<{ entryDate: string, mood: string, title: string, body: string }>} patch
   * @returns {Promise<Object>}
   */
  update(spaceId, id, patch) {
    return apiFetch(`${MY_SPACE_BASE}/${spaceId}/diary/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Delete a diary entry.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  remove(spaceId, id) {
    return apiFetch(`${MY_SPACE_BASE}/${spaceId}/diary/${id}`, { method: 'DELETE' });
  },
};
