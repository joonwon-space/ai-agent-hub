/**
 * recipes.js — API wrapper + DOM helpers for Recipe pages.
 *
 * Depends on authFetch (global from auth.js script tag) and
 * el() / helpers from components.js (global via script tag).
 *
 * IMPORTANT: Zero innerHTML usage. All DOM via createElement/textContent.
 */

'use strict';

const RECIPE_BASE = '/api/my-space';

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
// Recipe API operations
// ---------------------------------------------------------------------------

/**
 * Recipe namespace — mirrors diary/mySpace namespaces in api.js.
 */
const recipes = {
  /**
   * List recipes for a space, optionally filtered by category.
   * @param {number} spaceId
   * @param {{ category?: string }} [opts]
   * @returns {Promise<Array>}
   */
  list(spaceId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.category && opts.category !== '전체') {
      params.set('category', opts.category);
    }
    const qs = params.toString() ? `?${params}` : '';
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes${qs}`);
  },

  /**
   * Create a recipe in a space.
   * @param {number} spaceId
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  create(spaceId, payload) {
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get a single recipe.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  get(spaceId, id) {
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes/${id}`);
  },

  /**
   * Update (partial) a recipe. Used by autosave.
   * @param {number} spaceId
   * @param {number} id
   * @param {Object} patch
   * @returns {Promise<Object>}
   */
  update(spaceId, id, patch) {
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Delete a recipe.
   * @param {number} spaceId
   * @param {number} id
   * @returns {Promise<Object>}
   */
  remove(spaceId, id) {
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes/${id}`, { method: 'DELETE' });
  },

  /**
   * Upload a cover image for a recipe.
   * Uses raw fetch with FormData (no Content-Type header — browser sets multipart boundary).
   * @param {number} spaceId
   * @param {number} recipeId
   * @param {File} file
   * @returns {Promise<{ url: string }>}
   */
  async uploadCover(spaceId, recipeId, file) {
    const formData = new FormData();
    formData.append('cover', file);

    const res = await fetch(`${RECIPE_BASE}/${spaceId}/recipes/${recipeId}/cover`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res) return null;
    if (!res.ok) {
      throw await parseError(res);
    }
    return res.json();
  },

  /**
   * Delete the cover image of a recipe.
   * @param {number} spaceId
   * @param {number} recipeId
   * @returns {Promise<{ ok: boolean }>}
   */
  deleteCover(spaceId, recipeId) {
    return apiFetch(`${RECIPE_BASE}/${spaceId}/recipes/${recipeId}/cover`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS = { easy: '쉬움', medium: '보통', hard: '어려움' };

/**
 * Render a recipe card element.
 * @param {Object} recipe
 * @param {Function} onClick
 * @returns {HTMLElement}
 */
function renderRecipeCard(recipe, onClick) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.dataset.id = String(recipe.id);
  card.addEventListener('click', onClick);

  // Cover image or placeholder (prepended before name)
  if (recipe.coverImage) {
    const coverImg = document.createElement('img');
    coverImg.className = 'ms-recipe-card__cover';
    coverImg.src = recipe.coverImage;
    coverImg.alt = recipe.name || '';
    coverImg.loading = 'lazy';
    card.appendChild(coverImg);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'ms-recipe-card__cover-placeholder';
    const emoji = document.createElement('span');
    emoji.textContent = '🍳'; // 🍳
    placeholder.appendChild(emoji);
    card.appendChild(placeholder);
  }

  // Name
  const nameEl = document.createElement('div');
  nameEl.className = 'recipe-card__name';
  nameEl.textContent = recipe.name || '';
  card.appendChild(nameEl);

  // Meta row: category badge + difficulty + time
  const meta = document.createElement('div');
  meta.className = 'recipe-card__meta';

  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'recipe-card__category-badge';
  categoryBadge.textContent = recipe.category || '';
  meta.appendChild(categoryBadge);

  if (recipe.difficulty) {
    const diffEl = document.createElement('span');
    diffEl.className = `recipe-card__difficulty recipe-card__difficulty--${recipe.difficulty}`;
    diffEl.textContent = DIFFICULTY_LABELS[recipe.difficulty] || recipe.difficulty;
    meta.appendChild(diffEl);
  }

  if (recipe.cookTimeMin !== null && recipe.cookTimeMin !== undefined) {
    const timeEl = document.createElement('span');
    timeEl.className = 'recipe-card__time';
    timeEl.textContent = `${recipe.cookTimeMin}분`;
    meta.appendChild(timeEl);
  }

  if (recipe.servings !== null && recipe.servings !== undefined) {
    const servingsEl = document.createElement('span');
    servingsEl.className = 'recipe-card__servings';
    servingsEl.textContent = `${recipe.servings}인분`;
    meta.appendChild(servingsEl);
  }

  card.appendChild(meta);
  return card;
}

/**
 * Render an ingredient form row (name + amount inputs + remove button).
 * @param {{ name?: string, amount?: string }} item
 * @param {number} index
 * @param {Function} onRemove callback when row is removed
 * @returns {HTMLElement}
 */
function renderIngredientRow(item, index, onRemove) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.dataset.index = String(index);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'ingredient-row__name';
  nameInput.placeholder = '재료명 (예: 된장)';
  nameInput.maxLength = 80;
  nameInput.value = (item && item.name) ? item.name : '';
  nameInput.setAttribute('aria-label', `재료 ${index + 1} 이름`);
  row.appendChild(nameInput);

  const amountInput = document.createElement('input');
  amountInput.type = 'text';
  amountInput.className = 'ingredient-row__amount';
  amountInput.placeholder = '양 (예: 2큰술)';
  amountInput.maxLength = 40;
  amountInput.value = (item && item.amount) ? item.amount : '';
  amountInput.setAttribute('aria-label', `재료 ${index + 1} 양`);
  row.appendChild(amountInput);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ingredient-row__remove btn-text';
  removeBtn.textContent = '삭제';
  removeBtn.setAttribute('aria-label', `재료 ${index + 1} 삭제`);
  removeBtn.addEventListener('click', () => {
    if (typeof onRemove === 'function') onRemove(row, index);
  });
  row.appendChild(removeBtn);

  return row;
}

/**
 * Render a step form row (order badge + textarea + remove button).
 * @param {{ order?: number, text?: string }} item
 * @param {number} index
 * @param {Function} onRemove callback when row is removed
 * @returns {HTMLElement}
 */
function renderStepRow(item, index, onRemove) {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.dataset.index = String(index);

  const orderBadge = document.createElement('span');
  orderBadge.className = 'step-row__order';
  orderBadge.textContent = String((item && item.order) ? item.order : index + 1);
  row.appendChild(orderBadge);

  const textarea = document.createElement('textarea');
  textarea.className = 'step-row__text';
  textarea.placeholder = '조리 방법을 입력하세요…';
  textarea.maxLength = 1000;
  textarea.rows = 2;
  textarea.value = (item && item.text) ? item.text : '';
  textarea.setAttribute('aria-label', `단계 ${index + 1} 내용`);
  row.appendChild(textarea);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'step-row__remove btn-text';
  removeBtn.textContent = '삭제';
  removeBtn.setAttribute('aria-label', `단계 ${index + 1} 삭제`);
  removeBtn.addEventListener('click', () => {
    if (typeof onRemove === 'function') onRemove(row, index);
  });
  row.appendChild(removeBtn);

  return row;
}

/**
 * Collect ingredient data from the DOM container.
 * @param {HTMLElement} container
 * @returns {Array<{ name: string, amount: string }>}
 */
function collectIngredients(container) {
  const rows = container.querySelectorAll('.ingredient-row');
  return Array.from(rows).map((row) => ({
    name: row.querySelector('.ingredient-row__name').value.trim(),
    amount: row.querySelector('.ingredient-row__amount').value.trim(),
  })).filter((item) => item.name.length > 0);
}

/**
 * Collect step data from the DOM container.
 * @param {HTMLElement} container
 * @returns {Array<{ order: number, text: string }>}
 */
function collectSteps(container) {
  const rows = container.querySelectorAll('.step-row');
  return Array.from(rows).map((row, idx) => ({
    order: idx + 1,
    text: row.querySelector('.step-row__text').value.trim(),
  })).filter((item) => item.text.length > 0);
}
