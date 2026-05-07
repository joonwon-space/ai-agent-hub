/**
 * my-space-note-edit.js — Note edit/create page controller.
 *
 * URLs:
 *   /my-space/notes/new?spaceId=<id>  → create mode (POST then PATCH for autosave)
 *   /my-space/notes/:id?spaceId=<id>  → edit mode (PATCH for autosave)
 *
 * Layout: 50/50 split — left textarea editor / right preview div.
 * Autosave: reuses autosave.js createAutosaver (debounce 500ms, 3-attempt backoff).
 * Preview: on every textarea input → render(text) → replace right-pane children.
 *
 * IMPORTANT: Zero innerHTML usage. All DOM via createElement/textContent.
 * Preview cleared via while (div.firstChild) div.removeChild(div.firstChild).
 *
 * Dependencies (loaded via script tags):
 *   - auth.js        → requireAuth, logout
 *   - autosave.js    → createAutosaver
 *   - notes.js       → notes.get, notes.create, notes.update
 *   - markdown.js    → render (returns DocumentFragment)
 *   - components.js  → el (optional)
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentNote = null; // null when in create mode, object when editing
let currentSpaceId = null;
let saver = null;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function init() {
  if (typeof requireAuth === 'function') {
    const user = await requireAuth();
    if (!user) return; // redirected to /login
  }

  const params = new URLSearchParams(window.location.search);
  const spaceId = Number(params.get('spaceId'));
  const pathParts = window.location.pathname.split('/');
  // /my-space/notes/new OR /my-space/notes/:id
  const lastSegment = pathParts[pathParts.length - 1];
  const isNew = lastSegment === 'new' || !lastSegment || isNaN(Number(lastSegment));
  const noteId = isNew ? null : Number(lastSegment);

  if (!spaceId || isNaN(spaceId)) {
    document.body.style.visibility = 'visible';
    const main = document.getElementById('note-edit-main');
    if (main) {
      const err = document.createElement('div');
      err.className = 'ms-error';
      err.style.padding = '24px';
      err.textContent = 'spaceId 파라미터가 필요합니다.';
      main.appendChild(err);
    }
    return;
  }

  currentSpaceId = spaceId;

  // Load existing note
  if (!isNew && noteId) {
    try {
      currentNote = await notes.get(spaceId, noteId);
    } catch (err) {
      document.body.style.visibility = 'visible';
      const main = document.getElementById('note-edit-main');
      if (main) {
        const errEl = document.createElement('div');
        errEl.className = 'ms-error';
        errEl.style.padding = '24px';
        errEl.textContent = '노트를 불러오지 못했습니다: ' + ((err && err.error) || (err && err.message) || '');
        main.appendChild(errEl);
      }
      return;
    }
  }

  buildLayout();
  document.body.style.visibility = 'visible';
})();

// ---------------------------------------------------------------------------
// Build split layout
// ---------------------------------------------------------------------------

function buildLayout() {
  const main = document.getElementById('note-edit-main');
  if (!main) return;

  // Editor pane (left)
  const editorPane = document.createElement('div');
  editorPane.className = 'note-edit-pane';

  const editorLabel = document.createElement('div');
  editorLabel.className = 'note-edit-pane__label';
  editorLabel.textContent = '편집';
  editorPane.appendChild(editorLabel);

  const textarea = document.createElement('textarea');
  textarea.id = 'note-editor';
  textarea.className = 'note-editor';
  textarea.placeholder = '마크다운으로 작성하세요…\n\n# 헤더\n**굵게** *기울임* `코드`\n\n- 목록 항목';
  textarea.spellcheck = false;
  textarea.autocomplete = 'off';
  if (currentNote) textarea.value = currentNote.body || '';
  editorPane.appendChild(textarea);

  // Preview pane (right)
  const previewPane = document.createElement('div');
  previewPane.className = 'note-edit-pane';

  const previewLabel = document.createElement('div');
  previewLabel.className = 'note-edit-pane__label';
  previewLabel.textContent = '미리보기';
  previewPane.appendChild(previewLabel);

  const preview = document.createElement('div');
  preview.id = 'note-preview';
  preview.className = 'note-preview preview';
  previewPane.appendChild(preview);

  main.appendChild(editorPane);
  main.appendChild(previewPane);

  // Initialize title and pin UI from existing note
  const titleInput = document.getElementById('note-title-input');
  if (titleInput && currentNote) {
    titleInput.value = currentNote.title || '';
  }

  const pinBtn = document.getElementById('btn-pin');
  if (pinBtn) {
    const pinned = currentNote ? Boolean(currentNote.pinned) : false;
    updatePinButton(pinBtn, pinned);
    pinBtn.addEventListener('click', () => {
      const currentPinned = pinBtn.getAttribute('aria-pressed') === 'true';
      const newPinned = !currentPinned;
      updatePinButton(pinBtn, newPinned);
      if (saver) saver.schedule();
    });
  }

  // Back button
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = `/my-space/notes?spaceId=${currentSpaceId}`;
    });
  }

  // Save indicator
  const saveIndicator = document.getElementById('save-indicator');

  // Autosaver
  saver = createAutosaver({
    saveFn: () => saveNote(titleInput, textarea, pinBtn),
    // B-6 / P-4: keep the className in sync with the state so the
    // save-indicator pill (P-2) actually changes color. Previously only
    // textContent was updated, so '저장 실패' rendered in the same muted
    // grey as idle — users could miss errors entirely.
    onState: (state) => {
      if (!saveIndicator) return;
      const messages = {
        idle:   '',
        saving: '저장 중…',
        saved:  '저장됨 ✓',
        error:  '저장 실패 — 재시도 중',
      };
      const classes = {
        saving: 'save-indicator--saving',
        saved:  'save-indicator--saved',
        error:  'save-indicator--error',
      };
      saveIndicator.className = 'save-indicator';
      if (classes[state]) saveIndicator.classList.add(classes[state]);
      saveIndicator.textContent = messages[state] || '';
    },
  });

  // Render initial preview
  if (currentNote && currentNote.body) {
    updatePreview(preview, currentNote.body);
  }

  // Wire textarea input: update preview + schedule autosave
  textarea.addEventListener('input', () => {
    updatePreview(preview, textarea.value);
    saver.schedule();
  });

  // Also autosave on title change
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      saver.schedule();
    });
  }

  // B-1 잔존: flush on page unload so last debounce window survives.
  // pagehide is more reliable than beforeunload on Safari/iOS.
  const flushOnLeave = () => { if (saver) saver.flush(); };
  window.addEventListener('beforeunload', flushOnLeave);
  window.addEventListener('pagehide', flushOnLeave);
}

// ---------------------------------------------------------------------------
// Preview update (uses markdown.render — no innerHTML)
// ---------------------------------------------------------------------------

function updatePreview(previewEl, text) {
  // Clear children safely — never use innerHTML = ''
  while (previewEl.firstChild) {
    previewEl.removeChild(previewEl.firstChild);
  }
  if (typeof render !== 'function') return;
  const fragment = render(text);
  previewEl.appendChild(fragment);
}

// ---------------------------------------------------------------------------
// Save logic
// ---------------------------------------------------------------------------

async function saveNote(titleInput, textarea, pinBtn) {
  let title = titleInput ? titleInput.value.trim() : '';
  const body = textarea ? textarea.value : '';
  const pinned = pinBtn ? pinBtn.getAttribute('aria-pressed') === 'true' : false;

  // B-1: if user typed body but no title, fall back to a date stamp so the
  // record gets created and survives F5. Empty form stays unsaved (no-op).
  if (!title) {
    if (!body || !body.trim()) return;
    title = '메모 — ' + new Date().toISOString().slice(0, 10);
  }

  if (currentNote) {
    // Edit mode — PATCH
    const updated = await notes.update(currentSpaceId, currentNote.id, { title, body, pinned });
    currentNote = updated;
  } else {
    // Create mode — POST, then switch to edit mode
    const created = await notes.create(currentSpaceId, { title, body, pinned });
    currentNote = created;
    // Update URL to edit mode without reload
    const newUrl = `/my-space/notes/${created.id}?spaceId=${currentSpaceId}`;
    window.history.replaceState({}, '', newUrl);
  }
}

// ---------------------------------------------------------------------------
// Pin button UI
// ---------------------------------------------------------------------------

function updatePinButton(btn, pinned) {
  btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  if (pinned) {
    btn.classList.add('note-pin-toggle--active');
    btn.textContent = '📌 고정됨';
  } else {
    btn.classList.remove('note-pin-toggle--active');
    btn.textContent = '📌 고정';
  }
}
