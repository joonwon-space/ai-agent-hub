/**
 * my-space-recipes.js — Recipe list page controller (Screen 04).
 *
 * URL: /my-space/recipes?spaceId=<id>[&category=<cat>]
 *
 * Features:
 *   - Category tabs: 전체 / 한식 / 양식 / 디저트 / 기타 (URL state sync)
 *   - Card grid: name + category badge + difficulty + time + servings
 *   - "+ 새 레시피" → /my-space/recipes/new?spaceId=<id>
 *   - Empty state
 *
 * No innerHTML. All DOM via createElement/textContent (recipes.js / components.js helpers).
 */

'use strict';

// ---------------------------------------------------------------------------
// Parse URL params
// ---------------------------------------------------------------------------
const searchParams = new URLSearchParams(window.location.search);
const spaceId = parseInt(searchParams.get('spaceId'), 10);

const CATEGORIES = ['전체', '한식', '양식', '디저트', '기타'];
let activeCategory = searchParams.get('category') || '전체';

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
    showError('spaceId가 없습니다. URL에 ?spaceId=<id>를 포함해주세요.');
    return;
  }

  setupBackButton();
  renderPage();
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------
function setupBackButton() {
  const btn = document.getElementById('btn-back');
  if (!btn) return;
  btn.addEventListener('click', () => {
    window.location.href = '/my-space';
  });
}

// ---------------------------------------------------------------------------
// Render full page
// ---------------------------------------------------------------------------
async function renderPage() {
  const main = document.getElementById('recipes-main');
  if (!main) return;
  main.textContent = '';

  // Page header
  const header = document.createElement('div');
  header.className = 'recipes-page-header';

  const title = document.createElement('h1');
  title.className = 'recipes-page-title';
  title.textContent = '레시피';
  header.appendChild(title);

  const newBtn = document.createElement('a');
  newBtn.className = 'btn btn-primary btn-sm';
  newBtn.textContent = '+ 새 레시피';
  newBtn.href = `/my-space/recipes/new?spaceId=${spaceId}`;
  newBtn.id = 'btn-new-recipe';
  header.appendChild(newBtn);

  main.appendChild(header);

  // Category tabs
  const tabs = renderCategoryTabs();
  main.appendChild(tabs);

  // Recipe grid container
  const gridContainer = document.createElement('div');
  gridContainer.id = 'recipe-grid-container';
  main.appendChild(gridContainer);

  // Load and render recipes
  await loadRecipes(gridContainer);
}

// ---------------------------------------------------------------------------
// Category tabs
// ---------------------------------------------------------------------------
function renderCategoryTabs() {
  const nav = document.createElement('nav');
  nav.className = 'recipe-tabs';
  nav.setAttribute('aria-label', '레시피 카테고리');

  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `recipe-tab${cat === activeCategory ? ' recipe-tab--active' : ''}`;
    btn.textContent = cat;
    btn.dataset.category = cat;
    btn.setAttribute('aria-pressed', cat === activeCategory ? 'true' : 'false');

    btn.addEventListener('click', () => {
      activeCategory = cat;

      // Update URL without reload
      const url = new URL(window.location.href);
      if (cat === '전체') {
        url.searchParams.delete('category');
      } else {
        url.searchParams.set('category', cat);
      }
      window.history.replaceState({}, '', url.toString());

      // Update tab active states
      nav.querySelectorAll('.recipe-tab').forEach((t) => {
        const isActive = t.dataset.category === cat;
        t.classList.toggle('recipe-tab--active', isActive);
        t.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      // Reload grid
      const gridContainer = document.getElementById('recipe-grid-container');
      if (gridContainer) {
        loadRecipes(gridContainer);
      }
    });

    nav.appendChild(btn);
  }

  return nav;
}

// ---------------------------------------------------------------------------
// Load recipes and render grid
// ---------------------------------------------------------------------------
async function loadRecipes(container) {
  container.textContent = '';

  let recipeList = [];
  try {
    const opts = activeCategory !== '전체' ? { category: activeCategory } : {};
    recipeList = await recipes.list(spaceId, opts);
  } catch (err) {
    const errEl = document.createElement('div');
    errEl.className = 'ms-error';
    errEl.style.padding = '20px';
    errEl.textContent = '레시피를 불러오지 못했습니다: ' + (err.error || err.message);
    container.appendChild(errEl);
    return;
  }

  if (!recipeList || recipeList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recipe-empty';

    const icon = document.createElement('div');
    icon.className = 'recipe-empty__icon';
    icon.textContent = '🍳';
    empty.appendChild(icon);

    const text = document.createElement('div');
    text.className = 'recipe-empty__text';
    text.textContent = activeCategory === '전체'
      ? '아직 레시피가 없습니다. 첫 번째 레시피를 추가해보세요!'
      : `"${activeCategory}" 카테고리의 레시피가 없습니다.`;
    empty.appendChild(text);

    container.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'recipe-grid';

  for (const recipe of recipeList) {
    const card = renderRecipeCard(recipe, () => {
      window.location.href = `/my-space/recipes/${recipe.id}/view?spaceId=${spaceId}`;
    });
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
function showError(msg) {
  const main = document.getElementById('recipes-main');
  if (!main) return;
  main.textContent = '';
  const errEl = document.createElement('div');
  errEl.className = 'ms-error';
  errEl.style.padding = '20px';
  errEl.textContent = msg;
  main.appendChild(errEl);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
