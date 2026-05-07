/**
 * my-space-diary-edit.js — Diary create/edit page controller (Screen 03).
 *
 * URL patterns:
 *   /my-space/diary/new?spaceId=<id>   → POST (create)
 *   /my-space/diary/<id>?spaceId=<id>  → PATCH (edit)
 *
 * No innerHTML. All dynamic DOM via createElement/textContent.
 * Autosave: 500ms debounce on body textarea changes, 3-retry exponential backoff.
 */

'use strict';

// ---------------------------------------------------------------------------
// Parse URL params
// ---------------------------------------------------------------------------
const searchParams = new URLSearchParams(window.location.search);
const spaceId = parseInt(searchParams.get('spaceId'), 10);

const pathMatch = window.location.pathname.match(/\/my-space\/diary\/(\d+)/);
const entryId = pathMatch ? parseInt(pathMatch[1], 10) : null;
const isNew = !entryId;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentEntryId = entryId; // null for new, set after first save
let selectedMood = null;
let autosaver = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  // Auth guard
  let me;
  try {
    me = await getMe();
  } catch (_) {
    // treat as unauthenticated
  }
  if (!me) {
    window.location.href = '/login';
    return;
  }

  document.body.style.visibility = 'visible';

  if (!spaceId || isNaN(spaceId)) {
    showGlobalError('spaceId가 없습니다. URL에 ?spaceId=<id>를 포함해주세요.');
    return;
  }

  // If editing existing, load the entry
  if (!isNew) {
    await loadEntry();
  } else {
    // Default date = today
    const dateInput = document.getElementById('entry-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  setupMoodButtons();
  setupAiPanel();
  setupAutosave();
  setupBackButton();
}

// ---------------------------------------------------------------------------
// Load existing entry
// ---------------------------------------------------------------------------
async function loadEntry() {
  try {
    const entry = await diary.get(spaceId, currentEntryId);
    populateForm(entry);
  } catch (err) {
    showGlobalError('일기를 불러오지 못했습니다: ' + (err.error || err.message));
  }
}

function populateForm(entry) {
  const dateInput = document.getElementById('entry-date');
  const titleInput = document.getElementById('entry-title');
  const bodyTextarea = document.getElementById('entry-body');

  if (dateInput && entry.entryDate) {
    // entryDate may be an ISO string or Date — normalize to yyyy-MM-dd
    dateInput.value = new Date(entry.entryDate).toISOString().slice(0, 10);
  }
  if (titleInput) titleInput.value = entry.title || '';
  if (bodyTextarea) bodyTextarea.value = entry.body || '';

  if (entry.mood) {
    selectedMood = entry.mood;
    updateMoodButtons();
  }
}

// ---------------------------------------------------------------------------
// AI assist panel
// ---------------------------------------------------------------------------
function setupAiPanel() {
  const main = document.getElementById('diary-edit-main');
  if (!main) return;

  const { el } = createDiaryAiPanel((fields) => {
    const titleInput = document.getElementById('entry-title');
    const bodyTextarea = document.getElementById('entry-body');

    if (titleInput && fields.title) titleInput.value = fields.title;

    if (fields.mood) {
      selectedMood = fields.mood;
      updateMoodButtons();
    }

    if (bodyTextarea && fields.body) bodyTextarea.value = fields.body;

    if (autosaver) autosaver.schedule();
  });

  main.insertBefore(el, main.firstChild);
}

// ---------------------------------------------------------------------------
// Mood button setup
// ---------------------------------------------------------------------------
const MOODS = [
  { value: 'happy', emoji: '😊', label: '행복' },
  { value: 'sad',   emoji: '😔', label: '슬픔' },
  { value: 'angry', emoji: '😤', label: '화남' },
  { value: 'tired', emoji: '😴', label: '피곤' },
];

function setupMoodButtons() {
  const container = document.getElementById('mood-buttons');
  if (!container) return;

  container.textContent = '';

  for (const mood of MOODS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood-btn';
    btn.dataset.mood = mood.value;
    btn.setAttribute('aria-label', mood.label);
    btn.setAttribute('title', mood.label);

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'mood-btn__emoji';
    emojiSpan.textContent = mood.emoji;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'mood-btn__label';
    labelSpan.textContent = mood.label;

    btn.appendChild(emojiSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener('click', () => {
      // Toggle: clicking same mood deselects
      selectedMood = selectedMood === mood.value ? null : mood.value;
      updateMoodButtons();
    });

    container.appendChild(btn);
  }
}

function updateMoodButtons() {
  const buttons = document.querySelectorAll('.mood-btn');
  buttons.forEach((btn) => {
    btn.classList.toggle('mood-btn--active', btn.dataset.mood === selectedMood);
    btn.setAttribute('aria-pressed', btn.dataset.mood === selectedMood ? 'true' : 'false');
  });
}

// ---------------------------------------------------------------------------
// Autosave setup
// ---------------------------------------------------------------------------
function setupAutosave() {
  const bodyTextarea = document.getElementById('entry-body');
  const titleInput = document.getElementById('entry-title');
  const dateInput = document.getElementById('entry-date');

  autosaver = createAutosaver({
    saveFn: saveEntry,
    onState: updateSaveIndicator,
  });

  // Trigger autosave on any form field change
  const triggerSave = () => autosaver.schedule();

  if (bodyTextarea) bodyTextarea.addEventListener('input', triggerSave);
  if (titleInput) titleInput.addEventListener('input', triggerSave);
  if (dateInput) dateInput.addEventListener('change', triggerSave);

  // B-1 잔존: flush any pending debounced save on page unload so the
  // last 250ms of typing isn't lost on F5/tab-close. pagehide is more
  // reliable than beforeunload on mobile (Safari/iOS).
  const flushOnLeave = () => {
    if (autosaver && typeof autosaver.flush === 'function') autosaver.flush();
  };
  window.addEventListener('beforeunload', flushOnLeave);
  window.addEventListener('pagehide', flushOnLeave);
}

// ---------------------------------------------------------------------------
// Save entry (POST on first save, PATCH after)
// ---------------------------------------------------------------------------
async function saveEntry() {
  const dateInput = document.getElementById('entry-date');
  const titleInput = document.getElementById('entry-title');
  const bodyTextarea = document.getElementById('entry-body');

  const payload = {
    entryDate: dateInput ? dateInput.value : new Date().toISOString().slice(0, 10),
    mood: selectedMood || undefined,
    title: titleInput ? titleInput.value.trim() : '',
    body: bodyTextarea ? bodyTextarea.value : '',
  };

  // B-1: if user typed body but no title, fall back to entryDate so the record
  // gets created and survives F5. Empty form (no title AND no body) stays idle.
  if (!payload.title) {
    if (!payload.body || !payload.body.trim()) {
      updateSaveIndicator('idle');
      return;
    }
    payload.title = payload.entryDate || new Date().toISOString().slice(0, 10);
  }

  if (isNew && !currentEntryId) {
    // First save → POST
    const created = await diary.create(spaceId, payload);
    currentEntryId = created.id;
    // Update URL without reload — F5 now reloads /diary/<id> with content
    const newUrl = `/my-space/diary/${currentEntryId}?spaceId=${spaceId}`;
    window.history.replaceState({}, '', newUrl);
  } else {
    // Subsequent saves → PATCH
    const patchPayload = {};
    if (payload.entryDate) patchPayload.entryDate = payload.entryDate;
    if (payload.mood !== undefined) patchPayload.mood = payload.mood;
    if (payload.title) patchPayload.title = payload.title;
    if (payload.body !== undefined) patchPayload.body = payload.body;
    await diary.update(spaceId, currentEntryId, patchPayload);
  }
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------
function updateSaveIndicator(state) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  indicator.textContent = '';

  const messages = {
    idle:    '',
    pending: '입력 중…',  // P-1
    saving:  '저장 중…',
    saved:   '저장됨 ✓',
    error:   '저장 실패 — 재시도 중',
  };

  const classes = {
    idle:    '',
    pending: 'save-indicator--pending',
    saving:  'save-indicator--saving',
    saved:   'save-indicator--saved',
    error:   'save-indicator--error',
  };

  indicator.className = 'save-indicator';
  if (classes[state]) indicator.classList.add(classes[state]);
  indicator.textContent = messages[state] || '';
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------
function setupBackButton() {
  const backBtn = document.getElementById('btn-back');
  if (!backBtn) return;
  backBtn.addEventListener('click', () => {
    window.location.href = `/my-space`;
  });
}

// ---------------------------------------------------------------------------
// Global error display
// ---------------------------------------------------------------------------
function showGlobalError(msg) {
  const main = document.getElementById('diary-edit-main');
  if (!main) return;
  main.textContent = '';
  const errEl = document.createElement('div');
  errEl.className = 'ms-error';
  errEl.textContent = msg;
  main.appendChild(errEl);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
