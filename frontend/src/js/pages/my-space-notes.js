/**
 * my-space-notes.js — Note list page controller.
 *
 * URL: /my-space/notes?spaceId=<id>
 *
 * Layout:
 *   - Pinned section (label "📌 고정") — pinned notes only
 *   - All notes section (label "전체 노트") — all remaining notes
 *   - "+ 새 노트" button → /my-space/notes/new?spaceId=<id>
 *
 * IMPORTANT: Zero innerHTML usage. All DOM via createElement/textContent.
 *
 * Dependencies (loaded via script tags):
 *   - auth.js     → authFetch, requireAuth, logout
 *   - notes.js    → notes.list, notes.update, renderNoteCard
 *   - components.js → el (optional)
 */

'use strict';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function init() {
  if (typeof requireAuth === 'function') {
    const user = await requireAuth();
    if (!user) return; // redirected to /login
  }

  document.body.style.visibility = 'visible';

  const params = new URLSearchParams(window.location.search);
  const spaceId = params.get('spaceId');
  const main = document.getElementById('notes-main');

  if (!spaceId || isNaN(Number(spaceId))) {
    renderError(main, 'spaceId 파라미터가 필요합니다. My Space로 돌아가세요.');
    return;
  }

  // Back button
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = '/my-space';
    });
  }

  await renderNoteList(main, Number(spaceId));
})();

// ---------------------------------------------------------------------------
// Render note list
// ---------------------------------------------------------------------------

async function renderNoteList(container, spaceId) {
  // Clear and show loading
  while (container.firstChild) container.removeChild(container.firstChild);

  const layout = document.createElement('div');
  layout.className = 'note-list-main';

  // Header
  const header = document.createElement('div');
  header.className = 'note-list-header';

  const title = document.createElement('h1');
  title.className = 'note-list-header__title';
  title.textContent = '노트';
  header.appendChild(title);

  const newBtn = document.createElement('a');
  newBtn.className = 'btn btn-primary btn-sm';
  newBtn.href = `/my-space/notes/new?spaceId=${spaceId}`;
  newBtn.textContent = '+ 새 노트';
  header.appendChild(newBtn);

  layout.appendChild(header);

  // Load notes
  let allNotes = [];
  try {
    allNotes = await notes.list(spaceId, { limit: 20 });
  } catch (err) {
    const errEl = document.createElement('div');
    errEl.className = 'ms-error';
    errEl.textContent = '노트를 불러오지 못했습니다: ' + ((err && err.error) || (err && err.message) || '알 수 없는 오류');
    layout.appendChild(errEl);
    container.appendChild(layout);
    return;
  }

  if (!allNotes) allNotes = [];

  const pinned = allNotes.filter((n) => n.pinned);
  const regular = allNotes.filter((n) => !n.pinned);

  // Pin toggle handler
  async function handleTogglePin(note) {
    try {
      await notes.update(spaceId, note.id, { pinned: !note.pinned });
      await renderNoteList(container, spaceId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('핀 토글 실패:', err);
    }
  }

  // Click handler
  function handleClick(note) {
    window.location.href = `/my-space/notes/${note.id}?spaceId=${spaceId}`;
  }

  // Pinned section
  if (pinned.length > 0) {
    const section = buildSection('📌 고정', pinned, spaceId, handleClick, handleTogglePin);
    layout.appendChild(section);
  }

  // All notes section
  const allLabel = pinned.length > 0 ? '전체 노트' : '노트';
  const allSection = buildSection(allLabel, regular, spaceId, handleClick, handleTogglePin);
  layout.appendChild(allSection);

  container.appendChild(layout);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSection(label, noteList, spaceId, handleClick, handleTogglePin) {
  const section = document.createElement('div');
  section.className = 'note-section';

  const labelEl = document.createElement('div');
  labelEl.className = 'note-section__label';
  labelEl.textContent = label;
  section.appendChild(labelEl);

  if (noteList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'note-empty';
    empty.textContent = '아직 노트가 없습니다.';
    section.appendChild(empty);
    return section;
  }

  for (const note of noteList) {
    const card = renderNoteCard(note, {
      onClick: () => handleClick(note),
      onTogglePin: () => handleTogglePin(note),
    });
    section.appendChild(card);
  }

  return section;
}

function renderError(container, message) {
  while (container.firstChild) container.removeChild(container.firstChild);
  const errEl = document.createElement('div');
  errEl.className = 'ms-error';
  errEl.style.padding = '24px';
  errEl.textContent = message;
  container.appendChild(errEl);
  document.body.style.visibility = 'visible';
}
