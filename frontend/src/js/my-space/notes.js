/**
 * notes.js — API wrapper + DOM helpers for FreeformNote pages.
 *
 * Depends on authFetch (global from auth.js script tag) and
 * el() / helpers from components.js (global via script tag).
 *
 * IMPORTANT: Zero innerHTML usage. All DOM via createElement/textContent.
 */

'use strict';

const NOTE_BASE = '/api/my-space';

// ---------------------------------------------------------------------------
// Internal fetch helper (reuses authFetch global from auth.js)
// ---------------------------------------------------------------------------

/**
 * Parse a non-2xx response into a rejection error.
 * @param {Response} res
 * @returns {Promise<Error>}
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
 * Authenticated fetch with JSON content-type.
 * authFetch is provided as a global via auth.js script tag.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function apiFetch(url, options = {}) {
  const res = await authFetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res) return null; // authFetch returns null on 401 (redirect already triggered)
  if (!res.ok) {
    throw await parseError(res);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Note API operations
// ---------------------------------------------------------------------------

/**
 * Note namespace — mirrors diary/recipe namespaces.
 */
const notes = {
  /**
   * List notes for a space (sorted pinned desc, updatedAt desc).
   * @param {number} spaceId
   * @param {{ limit?: number, cursor?: number }} [opts]
   * @returns {Promise<Array>}
   */
  list(spaceId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', String(opts.cursor));
    const qs = params.toString() ? `?${params}` : '';
    return apiFetch(`${NOTE_BASE}/${spaceId}/notes${qs}`);
  },

  /**
   * Create a note in a space.
   * @param {number} spaceId
   * @param {{ title: string, body?: string, pinned?: boolean }} payload
   * @returns {Promise<Object>}
   */
  create(spaceId, payload) {
    return apiFetch(`${NOTE_BASE}/${spaceId}/notes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get a single note.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  get(spaceId, id) {
    return apiFetch(`${NOTE_BASE}/${spaceId}/notes/${id}`);
  },

  /**
   * Update (partial) a note. Used by autosave and pin toggle.
   * @param {number} spaceId
   * @param {number} id
   * @param {{ title?: string, body?: string, pinned?: boolean }} patch
   * @returns {Promise<Object>}
   */
  update(spaceId, id, patch) {
    return apiFetch(`${NOTE_BASE}/${spaceId}/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Delete a note.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  remove(spaceId, id) {
    return apiFetch(`${NOTE_BASE}/${spaceId}/notes/${id}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Format a date for display (locale-aware).
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Render a note card element.
 *
 * @param {Object} note - Note data object
 * @param {{ onClick?: Function, onTogglePin?: Function }} [handlers]
 * @returns {HTMLElement}
 */
function renderNoteCard(note, handlers = {}) {
  const { onClick, onTogglePin } = handlers;

  const card = document.createElement('div');
  card.className = 'note-card' + (note.pinned ? ' note-card--pinned' : '');
  card.dataset.id = String(note.id);

  // Click anywhere on card (except pin button) → navigate
  card.addEventListener('click', (e) => {
    if (e.target.closest('.note-card__pin-btn')) return;
    if (typeof onClick === 'function') onClick(note);
  });

  // Top row: title + pin button
  const topRow = document.createElement('div');
  topRow.className = 'note-card__top';

  const titleEl = document.createElement('div');
  titleEl.className = 'note-card__title';
  titleEl.textContent = note.title || '(제목 없음)';
  topRow.appendChild(titleEl);

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'note-card__pin-btn' + (note.pinned ? ' note-card__pin-btn--active' : '');
  pinBtn.title = note.pinned ? '고정 해제' : '고정';
  pinBtn.setAttribute('aria-pressed', note.pinned ? 'true' : 'false');
  pinBtn.textContent = '📌';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof onTogglePin === 'function') onTogglePin(note);
  });
  topRow.appendChild(pinBtn);

  card.appendChild(topRow);

  // Body preview: first 200 chars
  if (note.body) {
    const preview = document.createElement('div');
    preview.className = 'note-card__preview';
    const previewText = note.body.length > 200 ? note.body.slice(0, 200) + '…' : note.body;
    preview.textContent = previewText;
    card.appendChild(preview);
  }

  // Footer: updatedAt
  const footer = document.createElement('div');
  footer.className = 'note-card__footer';
  const dateEl = document.createElement('span');
  dateEl.className = 'note-card__date';
  dateEl.textContent = formatDate(note.updatedAt);
  footer.appendChild(dateEl);
  card.appendChild(footer);

  return card;
}
