/**
 * my-space.js — My Space landing/dashboard page controller.
 *
 * Behavior:
 *   - On load: call mySpace.list()
 *   - Empty → render onboarding (3 template cards)
 *   - Non-empty → render dashboard (inner sidebar + template-aware pane)
 *
 * Template branching (Phase 2):
 *   diary    → diary list (existing Phase 1 behavior)
 *   recipe   → top-3 recent recipe cards + "새로 작성" link (Phase 1.5)
 *   freeform → top-3 pinned/recent notes + "새로 작성" link (Phase 2)
 *
 * Phase 3.3 changes:
 *   - Each sidebar space item has inline ✏️ rename + 🗑️ delete actions on hover
 *   - ✏️ inline rename: Enter/blur save, Esc cancel, API update with optimistic update
 *   - 🗑️ delete: window.deleteSpaceModal.show() → cascade delete
 *   - "+ 새 공간" button: directly calls renderOnboarding() — no page reload
 *   - handleTemplateSelect creates space and returns to dashboard inline
 *
 * No innerHTML. All DOM built with createElement/textContent via components.js helpers.
 * recipes.js and notes.js are loaded via <script> tags, providing globals.
 * deleteSpaceModal.js is loaded before this file, providing window.deleteSpaceModal.
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let spaces = [];
let activeSpaceId = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  // Auth guard: redirect to login if not authenticated
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

  try {
    spaces = await mySpace.list();
  } catch (err) {
    showError('공간 목록을 불러오지 못했습니다: ' + (err.error || err.message));
    return;
  }

  if (!spaces || spaces.length === 0) {
    renderOnboarding();
  } else {
    activeSpaceId = spaces[0].id;
    renderDashboard();
  }
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
function showError(msg) {
  const main = document.getElementById('ms-main');
  if (!main) return;
  main.textContent = '';
  const errEl = el('div', { className: 'ms-error', textContent: msg });
  main.appendChild(errEl);
}

// ---------------------------------------------------------------------------
// Onboarding (Screen 01)
// ---------------------------------------------------------------------------
function renderOnboarding() {
  const main = document.getElementById('ms-main');
  main.textContent = '';

  const container = el('div', { className: 'ms-onboarding' });

  const heading = el('h1', { className: 'ms-onboarding__title', textContent: 'My Space에 오신 것을 환영합니다' });
  const sub = el('p', { className: 'ms-onboarding__sub', textContent: '어떤 공간을 시작할까요? 템플릿을 선택하세요.' });

  container.appendChild(heading);
  container.appendChild(sub);

  const grid = el('div', { className: 'ms-template-grid' });

  const templates = [
    {
      template: 'diary',
      label: '일기장',
      description: '매일의 생각과 감정을 기록하세요.',
      emoji: '📔',
    },
    {
      template: 'recipe',
      label: '레시피',
      description: '나만의 요리 레시피를 정리하세요.',
      emoji: '🍳',
    },
    {
      template: 'freeform',
      label: '자유 형식',
      description: '마크다운 노트로 무엇이든 기록하세요.',
      emoji: '📝',
    },
    {
      template: 'jira',
      label: 'Jira 워크스페이스',
      description: 'AI 가 작업 개요를 분석해 Jira 이슈를 자동 생성합니다.',
      emoji: '🎫',
    },
  ];

  for (const tpl of templates) {
    const card = renderTemplateCard({
      ...tpl,
      onClick: () => handleTemplateSelect(tpl.template, tpl.label),
    });
    grid.appendChild(card);
  }

  container.appendChild(grid);
  main.appendChild(container);
}

/**
 * Handle template card click — show inline name form then create space.
 * Phase 3.3: inline state update replaces prior page-reload pattern.
 */
function handleTemplateSelect(template, templateLabel) {
  const main = document.getElementById('ms-main');
  main.textContent = '';

  const form = el('div', { className: 'ms-new-space-form' });

  const heading = el('h2', {
    className: 'ms-new-space-form__title',
    textContent: `${templateLabel} 공간 만들기`,
  });

  const label = el('label', {
    className: 'ms-new-space-form__label',
    textContent: '공간 이름',
    attrs: { for: 'space-name-input' },
  });

  const input = el('input', {
    id: 'space-name-input',
    className: 'ms-new-space-form__input',
    attrs: { type: 'text', placeholder: '예: 내 일기장', maxlength: '80', autofocus: '' },
  });

  const errMsg = el('div', { className: 'ms-new-space-form__error' });

  const btnRow = el('div', { className: 'ms-new-space-form__btn-row' });

  const backBtn = el('button', {
    className: 'btn btn-secondary',
    textContent: '뒤로',
    attrs: { type: 'button' },
    onClick: renderOnboarding,
  });

  const createBtn = el('button', {
    className: 'btn btn-primary',
    textContent: '만들기',
    attrs: { type: 'button' },
    onClick: async () => {
      const name = input.value.trim();
      if (!name) {
        errMsg.textContent = '공간 이름을 입력해주세요.';
        return;
      }
      createBtn.disabled = true;
      createBtn.textContent = '생성 중…';
      errMsg.textContent = '';

      try {
        const newSpace = await mySpace.create({ name, template });
        spaces = await mySpace.list();
        activeSpaceId = newSpace.id;
        renderDashboard();
      } catch (err) {
        const details = err.details || {};
        const msg = details.name || details.template || err.error || '공간 생성에 실패했습니다.';
        errMsg.textContent = msg;
        createBtn.disabled = false;
        createBtn.textContent = '만들기';
      }
    },
  });

  btnRow.appendChild(backBtn);
  btnRow.appendChild(createBtn);

  form.appendChild(heading);
  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(errMsg);
  form.appendChild(btnRow);

  main.appendChild(form);

  // Focus the input
  setTimeout(() => input.focus(), 0);
}

// ---------------------------------------------------------------------------
// Dashboard (Screen 02)
// ---------------------------------------------------------------------------

/**
 * Handle delete confirmation from modal.
 * Removes space from state, switches active or falls back to onboarding.
 *
 * @param {Object} space — the space that was confirmed for deletion
 * @param {HTMLElement} pane — the main content pane element
 */
async function handleDelete(space, pane) {
  try {
    await mySpace.remove(space.id);
  } catch (err) {
    alert('공간 삭제에 실패했습니다: ' + (err.error || err.message));
    return;
  }

  spaces = spaces.filter((s) => s.id !== space.id);

  if (activeSpaceId === space.id) {
    activeSpaceId = spaces[0] ? spaces[0].id : null;
  }

  if (spaces.length === 0) {
    renderOnboarding();
  } else {
    renderDashboard();
  }
}

/**
 * Build a single sidebar space item with name display + hover actions (✏️ 🗑️).
 *
 * @param {Object} space — the space object
 * @param {HTMLElement} sidebar — the sidebar container (for active-state toggling)
 * @param {HTMLElement} pane — the content pane
 * @returns {HTMLElement}
 */
function buildSidebarItem(space, sidebar, pane) {
  const isActive = space.id === activeSpaceId;

  const wrapper = el('div', {
    className: `ms-inner-sidebar__item${isActive ? ' ms-inner-sidebar__item--active' : ''}`,
    attrs: { 'data-space-id': String(space.id) },
  });

  // Name display — click to activate space
  const nameDisplay = el('button', {
    className: 'ms-inner-sidebar__item-name',
    textContent: space.name,
    attrs: { type: 'button', title: space.name },
    onClick: () => {
      activeSpaceId = space.id;
      renderPaneForSpace(pane, space);
      // Update active state across all items
      sidebar.querySelectorAll('.ms-inner-sidebar__item').forEach((item) => {
        item.classList.toggle(
          'ms-inner-sidebar__item--active',
          item.dataset.spaceId === String(space.id),
        );
      });
    },
  });

  // Actions wrapper (✏️ + 🗑️) — hidden until hover via CSS
  const actions = el('div', { className: 'ms-inner-sidebar__item-actions' });

  // Rename button
  const renameBtn = el('button', {
    className: 'ms-inner-sidebar__action-btn',
    textContent: '✏️',
    attrs: { type: 'button', 'aria-label': 'rename', title: '이름 변경' },
    onClick: (e) => {
      e.stopPropagation();
      startInlineRename(space, wrapper, nameDisplay, pane);
    },
  });

  // Delete button
  const deleteBtn = el('button', {
    className: 'ms-inner-sidebar__action-btn',
    textContent: '🗑️',
    attrs: { type: 'button', 'aria-label': 'delete', title: '공간 삭제' },
    onClick: (e) => {
      e.stopPropagation();
      if (!window.deleteSpaceModal) {
        alert('Modal module not loaded');
        return;
      }
      window.deleteSpaceModal.show({
        space,
        onConfirm: (confirmedSpace) => handleDelete(confirmedSpace, pane),
      });
    },
  });

  actions.appendChild(renameBtn);
  actions.appendChild(deleteBtn);

  wrapper.appendChild(nameDisplay);
  wrapper.appendChild(actions);

  return wrapper;
}

/**
 * Start inline rename flow for a sidebar item.
 * Replaces nameDisplay with an input; confirms on Enter/blur, cancels on Esc.
 *
 * @param {Object} space — the space being renamed (mutated on success)
 * @param {HTMLElement} wrapper — the sidebar item wrapper div
 * @param {HTMLElement} nameDisplay — the current name button element
 * @param {HTMLElement} pane — the content pane (for header update reference)
 */
function startInlineRename(space, wrapper, nameDisplay, pane) {
  const originalName = space.name;

  const input = el('input', {
    className: 'ms-inner-sidebar__rename-input',
    attrs: {
      type: 'text',
      maxlength: '80',
      value: originalName,
    },
  });
  input.value = originalName;

  // Replace name display with input
  wrapper.replaceChild(input, nameDisplay);
  input.focus();
  input.select();

  let committed = false;

  async function commit() {
    if (committed) return;
    const newName = input.value.trim();

    // No change — revert
    if (newName === originalName || !newName) {
      committed = true;
      wrapper.replaceChild(nameDisplay, input);
      return;
    }

    committed = true;

    try {
      const updated = await mySpace.update(space.id, { name: newName });
      // Update state immutably
      spaces = spaces.map((s) => (s.id === space.id ? { ...s, name: updated.name } : s));
      space.name = updated.name;
      nameDisplay.textContent = updated.name;
      nameDisplay.title = updated.name;
    } catch (err) {
      // Show error state then revert
      input.classList.add('ms-inner-sidebar__rename-input--error');
      alert('이름 변경에 실패했습니다: ' + (err.error || err.message));
      setTimeout(() => {
        input.value = originalName;
        if (wrapper.contains(input)) {
          wrapper.replaceChild(nameDisplay, input);
        }
      }, 1500);
      return;
    }

    wrapper.replaceChild(nameDisplay, input);
  }

  function cancel() {
    if (committed) return;
    committed = true;
    input.value = originalName;
    wrapper.replaceChild(nameDisplay, input);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', () => {
    // Small delay to allow button clicks to register before blur fires
    setTimeout(() => commit(), 150);
  });
}

async function renderDashboard() {
  const main = document.getElementById('ms-main');
  main.textContent = '';

  const layout = el('div', { className: 'ms-dashboard' });

  // Inner sidebar
  const sidebar = el('aside', { className: 'ms-inner-sidebar' });
  const sidebarLabel = el('div', { className: 'ms-inner-sidebar__label', textContent: '내 공간' });
  sidebar.appendChild(sidebarLabel);

  // Main content pane — created before items so buildSidebarItem can reference it
  const pane = el('div', { className: 'ms-pane' });

  for (const space of spaces) {
    const item = buildSidebarItem(space, sidebar, pane);
    sidebar.appendChild(item);
  }

  // "+ 새 공간" button — inline onboarding, no page reload
  const newSpaceBtn = el('button', {
    className: 'ms-inner-sidebar__new',
    textContent: '+ 새 공간',
    attrs: { type: 'button' },
    onClick: () => {
      renderOnboarding();
    },
  });
  sidebar.appendChild(newSpaceBtn);

  layout.appendChild(sidebar);
  layout.appendChild(pane);
  main.appendChild(layout);

  // Load content pane based on active space template
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  await renderPaneForSpace(pane, activeSpace);
}

/**
 * Dispatch pane rendering based on the space's template.
 * @param {HTMLElement} pane
 * @param {Object|undefined} space
 */
async function renderPaneForSpace(pane, space) {
  if (!space) {
    await renderDiaryList(pane, activeSpaceId);
    return;
  }

  switch (space.template) {
    case 'diary':
      await renderDiaryList(pane, space.id);
      break;
    case 'recipe':
      await renderRecipePreview(pane, space.id);
      break;
    case 'freeform':
      await renderFreeformNotePreview(pane, space.id);
      break;
    case 'jira':
      await renderJiraPane(pane, space.id);
      break;
    default:
      await renderDiaryList(pane, space.id);
  }
}

/**
 * Recipe preview pane: top-3 recent recipes + "새로 작성" link.
 * @param {HTMLElement} pane
 * @param {number} spaceId
 */
async function renderRecipePreview(pane, spaceId) {
  pane.textContent = '';

  // Header row
  const header = el('div', { className: 'ms-pane__header' });
  const title = el('h2', { className: 'ms-pane__title', textContent: '레시피' });
  const newBtn = el('a', {
    className: 'btn btn-primary btn-sm',
    textContent: '+ 새로 작성',
    attrs: { href: `/my-space/recipes/new?spaceId=${spaceId}` },
  });
  const listBtn = el('a', {
    className: 'btn btn-secondary btn-sm',
    textContent: '모두 보기',
    attrs: { href: `/my-space/recipes?spaceId=${spaceId}`, style: 'margin-right:8px;' },
  });
  header.appendChild(title);
  header.appendChild(listBtn);
  header.appendChild(newBtn);
  pane.appendChild(header);

  // Load top-3 recent recipes
  let recipeList = [];
  try {
    // recipes global comes from recipes.js loaded via script tag
    recipeList = await recipes.list(spaceId);
  } catch (err) {
    const errEl = el('div', {
      className: 'ms-error',
      textContent: '레시피를 불러오지 못했습니다: ' + (err.error || err.message),
    });
    pane.appendChild(errEl);
    return;
  }

  if (!recipeList || recipeList.length === 0) {
    const empty = el('div', {
      className: 'ms-empty',
      textContent: '아직 레시피가 없습니다. 첫 번째 레시피를 추가해보세요!',
    });
    pane.appendChild(empty);
    return;
  }

  // Show top-3
  const preview = recipeList.slice(0, 3);
  const grid = el('div', { className: 'recipe-grid' });

  for (const recipe of preview) {
    const card = renderRecipeCard(recipe, () => {
      window.location.href = `/my-space/recipes/${recipe.id}?spaceId=${spaceId}`;
    });
    grid.appendChild(card);
  }

  pane.appendChild(grid);
}

/**
 * Freeform note preview pane: top-3 pinned/recent notes + navigation links.
 * notes.js is loaded via <script> tag, providing the notes global and renderNoteCard.
 * @param {HTMLElement} pane
 * @param {number} spaceId
 */
async function renderFreeformNotePreview(pane, spaceId) {
  pane.textContent = '';

  // Header row
  const header = el('div', { className: 'ms-pane__header' });
  const title = el('h2', { className: 'ms-pane__title', textContent: '노트' });
  const newBtn = el('a', {
    className: 'btn btn-primary btn-sm',
    textContent: '+ 새로 작성',
    attrs: { href: `/my-space/notes/new?spaceId=${spaceId}` },
  });
  const listBtn = el('a', {
    className: 'btn btn-secondary btn-sm',
    textContent: '모두 보기',
    attrs: { href: `/my-space/notes?spaceId=${spaceId}`, style: 'margin-right:8px;' },
  });
  header.appendChild(title);
  header.appendChild(listBtn);
  header.appendChild(newBtn);
  pane.appendChild(header);

  // Load top-3 notes (pinned first via API ordering)
  let noteList = [];
  try {
    // notes global comes from notes.js loaded via script tag
    noteList = await notes.list(spaceId, { limit: 20 });
  } catch (err) {
    const errEl = el('div', {
      className: 'ms-error',
      textContent: '노트를 불러오지 못했습니다: ' + (err.error || err.message),
    });
    pane.appendChild(errEl);
    return;
  }

  if (!noteList || noteList.length === 0) {
    const empty = el('div', {
      className: 'ms-empty',
      textContent: '아직 노트가 없습니다. 첫 번째 노트를 작성해보세요!',
    });
    pane.appendChild(empty);
    return;
  }

  // Show top-3 (pinned first, then recent — already ordered by API)
  const preview = noteList.slice(0, 3);
  const grid = el('div', { className: 'note-preview-grid' });

  for (const note of preview) {
    const card = renderNoteCard(note, {
      onClick: () => {
        window.location.href = `/my-space/notes/${note.id}?spaceId=${spaceId}`;
      },
      onTogglePin: async () => {
        try {
          await notes.update(spaceId, note.id, { pinned: !note.pinned });
          await renderFreeformNotePreview(pane, spaceId);
        } catch (_err) {
          // ignore pin toggle errors on dashboard
        }
      },
    });
    grid.appendChild(card);
  }

  pane.appendChild(grid);
}

async function renderDiaryList(pane, spaceId) {
  pane.textContent = '';

  // Header row
  const header = el('div', { className: 'ms-pane__header' });
  const title = el('h2', { className: 'ms-pane__title', textContent: '일기' });
  const newBtn = el('a', {
    className: 'btn btn-primary btn-sm',
    textContent: '+ 새로 작성',
    attrs: { href: `/my-space/diary/new?spaceId=${spaceId}` },
  });
  header.appendChild(title);
  header.appendChild(newBtn);
  pane.appendChild(header);

  // Load entries
  let entries = [];
  try {
    entries = await diary.list(spaceId, { limit: 20 });
  } catch (err) {
    const errEl = el('div', {
      className: 'ms-error',
      textContent: '일기 목록을 불러오지 못했습니다: ' + (err.error || err.message),
    });
    pane.appendChild(errEl);
    return;
  }

  if (!entries || entries.length === 0) {
    const empty = el('div', { className: 'ms-empty', textContent: '아직 작성한 일기가 없습니다. 첫 번째 일기를 써보세요!' });
    pane.appendChild(empty);
    return;
  }

  const list = el('div', { className: 'ms-diary-list' });
  for (const entry of entries) {
    const card = renderDiaryCard({
      entry,
      onClick: () => {
        window.location.href = `/my-space/diary/${entry.id}?spaceId=${spaceId}`;
      },
    });
    list.appendChild(card);
  }
  pane.appendChild(list);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
