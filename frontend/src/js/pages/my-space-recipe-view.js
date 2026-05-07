/**
 * my-space-recipe-view.js — Recipe read-only view page controller (Phase 3.5).
 *
 * URL: /my-space/recipes/:id/view?spaceId=<id>
 *
 * Features:
 *   - Read-only display of recipe (cover, meta, description, ingredients, steps)
 *   - Ingredient + step checkboxes backed by localStorage
 *   - Progress count (X / N) per section
 *   - Checked rows get strikethrough class
 *   - "체크 초기화" button clears localStorage + resets UI
 *   - "편집" button → edit page
 *   - "← 목록" button → recipe list
 *
 * Zero innerHTML / outerHTML. All DOM via createElement / textContent.
 * Depends on: getMe (auth.js), recipes (recipes.js), el (components.js)
 */

'use strict';

// ---------------------------------------------------------------------------
// URL param parsing
// ---------------------------------------------------------------------------
const _viewPathMatch = window.location.pathname.match(/\/my-space\/recipes\/(\d+)\/view/);
const _viewRecipeId = _viewPathMatch ? parseInt(_viewPathMatch[1], 10) : null;
const _viewSearchParams = new URLSearchParams(window.location.search);
const _viewSpaceId = parseInt(_viewSearchParams.get('spaceId'), 10);

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/**
 * @param {number} spaceId
 * @param {number} recipeId
 * @returns {string}
 */
function progressKey(spaceId, recipeId) {
  return `recipe-progress-${spaceId}-${recipeId}`;
}

/**
 * @param {number} spaceId
 * @param {number} recipeId
 * @returns {{ ingredients: Object, steps: Object }}
 */
function loadProgress(spaceId, recipeId) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(spaceId, recipeId))) || { ingredients: {}, steps: {} };
  } catch (_) {
    return { ingredients: {}, steps: {} };
  }
}

/**
 * @param {number} spaceId
 * @param {number} recipeId
 * @param {{ ingredients: Object, steps: Object }} p
 */
function saveProgress(spaceId, recipeId, p) {
  localStorage.setItem(progressKey(spaceId, recipeId), JSON.stringify(p));
}

/**
 * @param {number} spaceId
 * @param {number} recipeId
 */
function clearProgress(spaceId, recipeId) {
  localStorage.removeItem(progressKey(spaceId, recipeId));
}

/**
 * Detect legacy index-based progress (keys are number-like strings) and remap
 * to id-based keys using the recipe's current ingredients/steps positions.
 * One-shot: returns migrated progress and persists it back to localStorage.
 *
 * @param {{ ingredients: Object, steps: Object }} progress
 * @param {Array} ingredients - recipe.ingredients with .id stamped by backend
 * @param {Array} steps - recipe.steps with .id stamped by backend
 * @param {number} spaceId
 * @param {number} recipeId
 * @returns {{ ingredients: Object, steps: Object }}
 */
function migrateProgress(progress, ingredients, steps, spaceId, recipeId) {
  const isIndexBased = (obj) => {
    const keys = Object.keys(obj || {});
    return keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
  };
  let changed = false;
  let nextIng = progress.ingredients || {};
  let nextSteps = progress.steps || {};

  if (isIndexBased(nextIng)) {
    const remapped = {};
    for (const [k, v] of Object.entries(nextIng)) {
      const idx = parseInt(k, 10);
      const item = ingredients[idx];
      if (item && item.id) remapped[item.id] = v;
    }
    nextIng = remapped;
    changed = true;
  }
  if (isIndexBased(nextSteps)) {
    const remapped = {};
    for (const [k, v] of Object.entries(nextSteps)) {
      const idx = parseInt(k, 10);
      const item = steps[idx];
      if (item && item.id) remapped[item.id] = v;
    }
    nextSteps = remapped;
    changed = true;
  }

  const migrated = { ingredients: nextIng, steps: nextSteps };
  if (changed) {
    saveProgress(spaceId, recipeId, migrated);
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// Progress badge update
// ---------------------------------------------------------------------------

/**
 * Recount checked boxes in a section container and update progress badge text.
 * @param {HTMLElement} container — the list container holding check-rows
 * @param {HTMLElement} badge — the .ms-recipe-view__progress span
 */
function updateProgressBadge(container, badge) {
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const total = checkboxes.length;
  let checked = 0;
  checkboxes.forEach((cb) => {
    if (cb.checked) checked++;
  });
  badge.textContent = `${checked} / ${total}`;
}

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

/**
 * Extract YouTube video ID from various URL formats:
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 * Returns null if not a valid YouTube URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null;
    }
    if (u.hostname.endsWith('youtube.com')) {
      return u.searchParams.get('v') || u.pathname.replace('/embed/', '').split('?')[0] || null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Build meta badge element.
 * @param {string} text
 * @param {string} className
 * @returns {HTMLElement}
 */
function makeBadge(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

const _VIEW_DIFFICULTY_LABELS = { easy: '쉬움', medium: '보통', hard: '어려움' };

/**
 * Build the checklist for ingredients or steps.
 * @param {'ingredients'|'steps'} kind
 * @param {Array} items
 * @param {Object} progressSection — { idx: bool, ... }
 * @param {Function} onToggle — called with (idx, checked)
 * @returns {{ listEl: HTMLElement, badge: HTMLElement }}
 */
function buildChecklist(kind, items, progressSection, onToggle) {
  const listEl = document.createElement('div');
  listEl.className = 'ms-recipe-view__check-list';

  const badge = document.createElement('span');
  badge.className = 'ms-recipe-view__progress';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = item.id || String(i); // fallback when backend hasn't stamped yet
    const isChecked = Boolean(progressSection[itemId]);

    const label = document.createElement('label');
    label.className = `ms-recipe-view__check-row${isChecked ? ' ms-recipe-view__check-row--done' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ms-recipe-view__checkbox';
    checkbox.checked = isChecked;
    checkbox.dataset.entryId = itemId;
    checkbox.setAttribute('aria-label', kind === 'ingredients'
      ? `재료 ${i + 1} 체크`
      : `단계 ${i + 1} 체크`);

    checkbox.addEventListener('change', () => {
      label.classList.toggle('ms-recipe-view__check-row--done', checkbox.checked);
      onToggle(itemId, checkbox.checked);
      updateProgressBadge(listEl, badge);
    });

    label.appendChild(checkbox);

    if (kind === 'ingredients') {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ms-recipe-view__item-name';
      nameSpan.textContent = item.name || '';
      label.appendChild(nameSpan);

      if (item.amount) {
        const amountSpan = document.createElement('span');
        amountSpan.className = 'ms-recipe-view__amount';
        amountSpan.textContent = `(${item.amount})`;
        label.appendChild(amountSpan);
      }
    } else {
      // steps
      const orderSpan = document.createElement('span');
      orderSpan.className = 'ms-recipe-view__step-order';
      orderSpan.textContent = `${i + 1}.`;
      label.appendChild(orderSpan);

      const textSpan = document.createElement('span');
      textSpan.className = 'ms-recipe-view__step-text';
      textSpan.textContent = item.text || '';
      label.appendChild(textSpan);
    }

    listEl.appendChild(label);
  }

  // Compute initial badge
  const total = items.length;
  const checked = items.filter((item, i) => {
    const itemId = item.id || String(i);
    return Boolean(progressSection[itemId]);
  }).length;
  badge.textContent = `${checked} / ${total}`;

  return { listEl, badge };
}

/**
 * Build a section (재료 or 조리 단계) with header + progress + checklist.
 * @param {string} title
 * @param {'ingredients'|'steps'} kind
 * @param {Array} items
 * @param {Object} progressSection
 * @param {Function} onToggle
 * @returns {{ sectionEl: HTMLElement, badge: HTMLElement, listEl: HTMLElement }}
 */
function buildSection(title, kind, items, progressSection, onToggle) {
  const sectionEl = document.createElement('div');
  sectionEl.className = 'ms-recipe-view__section';

  const headerEl = document.createElement('div');
  headerEl.className = 'ms-recipe-view__section-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'ms-recipe-view__section-title';
  titleEl.textContent = title;
  headerEl.appendChild(titleEl);

  const { listEl, badge } = buildChecklist(kind, items, progressSection, onToggle);
  headerEl.appendChild(badge);

  sectionEl.appendChild(headerEl);
  sectionEl.appendChild(listEl);

  return { sectionEl, badge, listEl };
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/**
 * Render the full recipe view into #ms-main.
 * @param {Object} recipe
 */
function renderView(recipe) {
  const main = document.getElementById('ms-main');
  if (!main) return;
  main.textContent = '';

  const recipeId = _viewRecipeId;
  const spaceId = _viewSpaceId;

  const ingredientsForMigration = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const stepsForMigration = Array.isArray(recipe.steps) ? recipe.steps : [];
  const progress = migrateProgress(
    loadProgress(spaceId, recipeId),
    ingredientsForMigration,
    stepsForMigration,
    spaceId,
    recipeId,
  );

  const wrapper = document.createElement('div');
  wrapper.className = 'ms-recipe-view';

  // --- Header row ---
  const headerEl = document.createElement('div');
  headerEl.className = 'ms-recipe-view__header';

  const backBtn = document.createElement('a');
  backBtn.className = 'ms-recipe-view__back-btn btn-text';
  backBtn.href = `/my-space/recipes?spaceId=${spaceId}`;
  backBtn.textContent = '← 목록';
  headerEl.appendChild(backBtn);

  const titleEl = document.createElement('h1');
  titleEl.className = 'ms-recipe-view__title';
  titleEl.textContent = recipe.name || '';
  headerEl.appendChild(titleEl);

  const editBtn = document.createElement('a');
  editBtn.className = 'ms-recipe-view__edit-btn btn-text';
  editBtn.href = `/my-space/recipes/${recipeId}?spaceId=${spaceId}`;
  editBtn.textContent = '편집';
  headerEl.appendChild(editBtn);

  wrapper.appendChild(headerEl);

  // --- Meta row ---
  const metaEl = document.createElement('div');
  metaEl.className = 'ms-recipe-view__meta';

  if (recipe.category) {
    metaEl.appendChild(makeBadge(recipe.category, 'ms-recipe-view__category-badge'));
  }

  if (recipe.difficulty) {
    const diffLabel = _VIEW_DIFFICULTY_LABELS[recipe.difficulty] || recipe.difficulty;
    metaEl.appendChild(makeBadge(diffLabel, `ms-recipe-view__difficulty ms-recipe-view__difficulty--${recipe.difficulty}`));
  }

  if (recipe.cookTimeMin !== null && recipe.cookTimeMin !== undefined) {
    metaEl.appendChild(makeBadge(`${recipe.cookTimeMin}분`, 'ms-recipe-view__time'));
  }

  if (recipe.servings !== null && recipe.servings !== undefined) {
    metaEl.appendChild(makeBadge(`${recipe.servings}인분`, 'ms-recipe-view__servings'));
  }

  wrapper.appendChild(metaEl);

  // --- Cover image ---
  if (recipe.coverImage) {
    const img = document.createElement('img');
    img.className = 'ms-recipe-view__cover';
    img.src = recipe.coverImage;
    img.alt = recipe.name || '레시피 커버';
    img.loading = 'lazy';
    wrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'ms-recipe-view__cover-placeholder';
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = '🍳';
    placeholder.appendChild(emojiSpan);
    wrapper.appendChild(placeholder);
  }

  // --- Description ---
  if (recipe.description) {
    const descEl = document.createElement('p');
    descEl.className = 'ms-recipe-view__description';
    descEl.textContent = recipe.description;
    wrapper.appendChild(descEl);
  }

  // --- YouTube embed ---
  const videoId = extractYouTubeId(recipe.videoUrl);
  if (videoId) {
    const videoWrap = document.createElement('div');
    videoWrap.className = 'ms-recipe-view__video';

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}`;
    iframe.title = `${recipe.name || '레시피'} 영상`;
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('loading', 'lazy');
    videoWrap.appendChild(iframe);
    wrapper.appendChild(videoWrap);
  }

  // --- Ingredients section ---
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (ingredients.length > 0) {
    const { sectionEl: ingSectionEl, badge: ingBadge, listEl: ingListEl } = buildSection(
      '재료',
      'ingredients',
      ingredients,
      progress.ingredients || {},
      (entryId, checked) => {
        const p = loadProgress(spaceId, recipeId);
        const updated = {
          ...p,
          ingredients: { ...(p.ingredients || {}), [entryId]: checked },
        };
        saveProgress(spaceId, recipeId, updated);
      },
    );
    wrapper.appendChild(ingSectionEl);
    // Store refs for reset
    wrapper.dataset.hasIngredients = '1';
  }

  // --- Steps section ---
  const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const steps = rawSteps.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (steps.length > 0) {
    const { sectionEl: stepSectionEl, badge: stepBadge, listEl: stepListEl } = buildSection(
      '조리 단계',
      'steps',
      steps,
      progress.steps || {},
      (entryId, checked) => {
        const p = loadProgress(spaceId, recipeId);
        const updated = {
          ...p,
          steps: { ...(p.steps || {}), [entryId]: checked },
        };
        saveProgress(spaceId, recipeId, updated);
      },
    );
    wrapper.appendChild(stepSectionEl);
  }

  // --- Reset button ---
  const resetRow = document.createElement('div');
  resetRow.className = 'ms-recipe-view__reset-row';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ms-recipe-view__reset-btn btn-text';
  resetBtn.textContent = '체크 초기화';
  resetBtn.addEventListener('click', () => {
    if (!window.confirm('모든 체크를 초기화할까요?')) return;
    clearProgress(spaceId, recipeId);
    // Reset all checkboxes in page
    const allCheckboxes = wrapper.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach((cb) => {
      cb.checked = false;
      const row = cb.closest('.ms-recipe-view__check-row');
      if (row) row.classList.remove('ms-recipe-view__check-row--done');
    });
    // Reset all progress badges
    const allBadges = wrapper.querySelectorAll('.ms-recipe-view__progress');
    allBadges.forEach((badge) => {
      const section = badge.closest('.ms-recipe-view__section');
      if (section) {
        const list = section.querySelector('.ms-recipe-view__check-list');
        if (list) {
          const total = list.querySelectorAll('input[type="checkbox"]').length;
          badge.textContent = `0 / ${total}`;
        }
      }
    });
  });

  resetRow.appendChild(resetBtn);
  wrapper.appendChild(resetRow);

  main.appendChild(wrapper);
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

/**
 * Render a 404 / error message with a back link.
 * @param {string} msg
 */
function renderError(msg) {
  const main = document.getElementById('ms-main');
  if (!main) return;
  main.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ms-recipe-view ms-recipe-view--error';
  wrapper.style.padding = '40px 20px';

  const msgEl = document.createElement('p');
  msgEl.className = 'ms-error';
  msgEl.textContent = msg;
  wrapper.appendChild(msgEl);

  const backLink = document.createElement('a');
  backLink.className = 'btn-text';
  backLink.href = `/my-space/recipes?spaceId=${_viewSpaceId}`;
  backLink.textContent = '← 목록으로 돌아가기';
  wrapper.appendChild(backLink);

  main.appendChild(wrapper);
}

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

  if (!_viewRecipeId || isNaN(_viewRecipeId)) {
    renderError('레시피 ID가 올바르지 않습니다.');
    return;
  }

  if (!_viewSpaceId || isNaN(_viewSpaceId)) {
    renderError('spaceId가 없습니다. URL에 ?spaceId=<id>를 포함해주세요.');
    return;
  }

  let recipe;
  try {
    recipe = await recipes.get(_viewSpaceId, _viewRecipeId);
  } catch (err) {
    if (err && err.status === 404) {
      renderError('레시피를 찾을 수 없습니다.');
    } else {
      renderError('레시피를 불러오지 못했습니다: ' + (err.error || err.message || '알 수 없는 오류'));
    }
    return;
  }

  if (!recipe) {
    renderError('레시피를 찾을 수 없습니다.');
    return;
  }

  renderView(recipe);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
