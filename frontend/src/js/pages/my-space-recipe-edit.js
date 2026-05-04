/**
 * my-space-recipe-edit.js — Recipe create/edit page controller (Screen 05).
 *
 * URL patterns:
 *   /my-space/recipes/new?spaceId=<id>    → POST (create) then PATCH (autosave)
 *   /my-space/recipes/<id>?spaceId=<id>   → GET (load) + PATCH (autosave)
 *
 * No innerHTML. All dynamic DOM via createElement/textContent.
 * Autosave: 500ms debounce on any field change, 3-retry exponential backoff.
 * Reuses createAutosaver from autosave.js (global via script tag).
 */

'use strict';

// ---------------------------------------------------------------------------
// Parse URL params
// ---------------------------------------------------------------------------
const searchParams = new URLSearchParams(window.location.search);
const spaceId = parseInt(searchParams.get('spaceId'), 10);

const pathMatch = window.location.pathname.match(/\/my-space\/recipes\/(\d+)/);
const recipeId = pathMatch ? parseInt(pathMatch[1], 10) : null;
const isNew = !recipeId;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentRecipeId = recipeId;
let selectedDifficulty = 'easy';
let autosaver = null;

// DOM refs (populated in buildForm)
let nameInput = null;
let categorySelect = null;
let cookTimeInput = null;
let servingsInput = null;
let descriptionTextarea = null;
let ingredientsContainer = null;
let stepsContainer = null;

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

  buildForm();
  setupBackButton();

  if (!isNew) {
    await loadRecipe();
  } else {
    // Start with 1 empty ingredient row and 1 empty step row
    addIngredientRow(null);
    addStepRow(null);
  }

  setupAutosave();
}

// ---------------------------------------------------------------------------
// Build the form DOM
// ---------------------------------------------------------------------------
function buildForm() {
  const main = document.getElementById('recipe-edit-main');
  if (!main) return;
  main.textContent = '';

  // Recipe name
  const nameField = makeField('레시피 이름 *');
  nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'recipe-name';
  nameInput.placeholder = '레시피 이름을 입력하세요';
  nameInput.maxLength = 80;
  nameField.appendChild(nameInput);
  main.appendChild(nameField);

  // Category
  const catField = makeField('카테고리');
  categorySelect = document.createElement('select');
  categorySelect.id = 'recipe-category';
  const cats = ['한식', '양식', '디저트', '기타'];
  for (const cat of cats) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  }
  catField.appendChild(categorySelect);
  main.appendChild(catField);

  // Difficulty
  const diffField = makeField('난이도');
  const diffGroup = document.createElement('div');
  diffGroup.className = 'difficulty-group';
  diffGroup.id = 'difficulty-group';

  const diffOptions = [
    { value: 'easy', label: '쉬움' },
    { value: 'medium', label: '보통' },
    { value: 'hard', label: '어려움' },
  ];

  for (const opt of diffOptions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `difficulty-btn${opt.value === selectedDifficulty ? ' difficulty-btn--active' : ''}`;
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      selectedDifficulty = opt.value;
      diffGroup.querySelectorAll('.difficulty-btn').forEach((b) => {
        b.classList.toggle('difficulty-btn--active', b.dataset.value === opt.value);
      });
      if (autosaver) autosaver.schedule();
    });
    diffGroup.appendChild(btn);
  }
  diffField.appendChild(diffGroup);
  main.appendChild(diffField);

  // Cook time + Servings
  const metaRow = document.createElement('div');
  metaRow.className = 'recipe-meta-row';

  const cookField = makeField('조리 시간 (분)');
  cookTimeInput = document.createElement('input');
  cookTimeInput.type = 'number';
  cookTimeInput.id = 'recipe-cook-time';
  cookTimeInput.placeholder = '예: 30';
  cookTimeInput.min = '0';
  cookTimeInput.max = '6000';
  cookField.appendChild(cookTimeInput);
  metaRow.appendChild(cookField);

  const servingsField = makeField('인분');
  servingsInput = document.createElement('input');
  servingsInput.type = 'number';
  servingsInput.id = 'recipe-servings';
  servingsInput.placeholder = '예: 2';
  servingsInput.min = '1';
  servingsInput.max = '99';
  servingsField.appendChild(servingsInput);
  metaRow.appendChild(servingsField);

  main.appendChild(metaRow);

  // Description
  const descField = makeField('설명 (선택)');
  descriptionTextarea = document.createElement('textarea');
  descriptionTextarea.id = 'recipe-description';
  descriptionTextarea.placeholder = '레시피에 대한 간단한 설명…';
  descriptionTextarea.rows = 3;
  descField.appendChild(descriptionTextarea);
  main.appendChild(descField);

  // Ingredients section
  const ingSection = document.createElement('div');
  ingSection.className = 'recipe-section';

  const ingHeader = document.createElement('div');
  ingHeader.className = 'recipe-section__header';

  const ingLabel = document.createElement('span');
  ingLabel.className = 'recipe-section__label';
  ingLabel.textContent = '재료';
  ingHeader.appendChild(ingLabel);

  const addIngBtn = document.createElement('button');
  addIngBtn.type = 'button';
  addIngBtn.className = 'btn btn-secondary btn-sm';
  addIngBtn.textContent = '+ 재료 추가';
  addIngBtn.addEventListener('click', () => {
    addIngredientRow(null);
    if (autosaver) autosaver.schedule();
  });
  ingHeader.appendChild(addIngBtn);

  ingSection.appendChild(ingHeader);

  ingredientsContainer = document.createElement('div');
  ingredientsContainer.id = 'ingredients-container';
  ingSection.appendChild(ingredientsContainer);

  main.appendChild(ingSection);

  // Steps section
  const stepsSection = document.createElement('div');
  stepsSection.className = 'recipe-section';

  const stepsHeader = document.createElement('div');
  stepsHeader.className = 'recipe-section__header';

  const stepsLabel = document.createElement('span');
  stepsLabel.className = 'recipe-section__label';
  stepsLabel.textContent = '조리 순서';
  stepsHeader.appendChild(stepsLabel);

  const addStepBtn = document.createElement('button');
  addStepBtn.type = 'button';
  addStepBtn.className = 'btn btn-secondary btn-sm';
  addStepBtn.textContent = '+ 단계 추가';
  addStepBtn.addEventListener('click', () => {
    addStepRow(null);
    if (autosaver) autosaver.schedule();
  });
  stepsHeader.appendChild(addStepBtn);

  stepsSection.appendChild(stepsHeader);

  stepsContainer = document.createElement('div');
  stepsContainer.id = 'steps-container';
  stepsSection.appendChild(stepsContainer);

  main.appendChild(stepsSection);
}

// ---------------------------------------------------------------------------
// Field factory helper
// ---------------------------------------------------------------------------
function makeField(labelText) {
  const field = document.createElement('div');
  field.className = 'recipe-edit-field';

  const label = document.createElement('label');
  label.textContent = labelText;
  field.appendChild(label);

  return field;
}

// ---------------------------------------------------------------------------
// Ingredient / Step row management
// ---------------------------------------------------------------------------
function addIngredientRow(item) {
  if (!ingredientsContainer) return;
  const index = ingredientsContainer.children.length;
  const row = renderIngredientRow(item, index, (rowEl) => {
    rowEl.remove();
    reindexIngredients();
    if (autosaver) autosaver.schedule();
  });
  // Wire autosave on input
  row.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      if (autosaver) autosaver.schedule();
    });
  });
  ingredientsContainer.appendChild(row);
}

function reindexIngredients() {
  if (!ingredientsContainer) return;
  const rows = ingredientsContainer.querySelectorAll('.ingredient-row');
  rows.forEach((row, idx) => {
    row.dataset.index = String(idx);
    const nameInp = row.querySelector('.ingredient-row__name');
    const amountInp = row.querySelector('.ingredient-row__amount');
    const removeBtn = row.querySelector('.ingredient-row__remove');
    if (nameInp) nameInp.setAttribute('aria-label', `재료 ${idx + 1} 이름`);
    if (amountInp) amountInp.setAttribute('aria-label', `재료 ${idx + 1} 양`);
    if (removeBtn) removeBtn.setAttribute('aria-label', `재료 ${idx + 1} 삭제`);
  });
}

function addStepRow(item) {
  if (!stepsContainer) return;
  const index = stepsContainer.children.length;
  const row = renderStepRow(item, index, (rowEl) => {
    rowEl.remove();
    reindexSteps();
    if (autosaver) autosaver.schedule();
  });
  // Wire autosave on textarea
  const textarea = row.querySelector('.step-row__text');
  if (textarea) {
    textarea.addEventListener('input', () => {
      if (autosaver) autosaver.schedule();
    });
  }
  stepsContainer.appendChild(row);
}

function reindexSteps() {
  if (!stepsContainer) return;
  const rows = stepsContainer.querySelectorAll('.step-row');
  rows.forEach((row, idx) => {
    row.dataset.index = String(idx);
    const orderBadge = row.querySelector('.step-row__order');
    if (orderBadge) orderBadge.textContent = String(idx + 1);
    const textarea = row.querySelector('.step-row__text');
    if (textarea) textarea.setAttribute('aria-label', `단계 ${idx + 1} 내용`);
    const removeBtn = row.querySelector('.step-row__remove');
    if (removeBtn) removeBtn.setAttribute('aria-label', `단계 ${idx + 1} 삭제`);
  });
}

// ---------------------------------------------------------------------------
// Load existing recipe
// ---------------------------------------------------------------------------
async function loadRecipe() {
  try {
    const recipe = await recipes.get(spaceId, currentRecipeId);
    populateForm(recipe);
  } catch (err) {
    showGlobalError('레시피를 불러오지 못했습니다: ' + (err.error || err.message));
  }
}

function populateForm(recipe) {
  if (nameInput) nameInput.value = recipe.name || '';
  if (categorySelect) categorySelect.value = recipe.category || '한식';
  if (cookTimeInput && recipe.cookTimeMin !== null && recipe.cookTimeMin !== undefined) {
    cookTimeInput.value = String(recipe.cookTimeMin);
  }
  if (servingsInput && recipe.servings !== null && recipe.servings !== undefined) {
    servingsInput.value = String(recipe.servings);
  }
  if (descriptionTextarea) descriptionTextarea.value = recipe.description || '';

  // Set difficulty
  if (recipe.difficulty) {
    selectedDifficulty = recipe.difficulty;
    const diffGroup = document.getElementById('difficulty-group');
    if (diffGroup) {
      diffGroup.querySelectorAll('.difficulty-btn').forEach((btn) => {
        btn.classList.toggle('difficulty-btn--active', btn.dataset.value === recipe.difficulty);
      });
    }
  }

  // Populate ingredient rows
  if (ingredientsContainer) {
    ingredientsContainer.textContent = '';
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    if (ingredients.length === 0) {
      addIngredientRow(null);
    } else {
      for (const item of ingredients) {
        addIngredientRow(item);
      }
    }
  }

  // Populate step rows
  if (stepsContainer) {
    stepsContainer.textContent = '';
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    if (steps.length === 0) {
      addStepRow(null);
    } else {
      for (const item of steps) {
        addStepRow(item);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Autosave setup
// ---------------------------------------------------------------------------
function setupAutosave() {
  autosaver = createAutosaver({
    saveFn: saveRecipe,
    onState: updateSaveIndicator,
  });

  const triggerSave = () => autosaver.schedule();

  // Wire up all form fields
  if (nameInput) nameInput.addEventListener('input', triggerSave);
  if (categorySelect) categorySelect.addEventListener('change', triggerSave);
  if (cookTimeInput) cookTimeInput.addEventListener('input', triggerSave);
  if (servingsInput) servingsInput.addEventListener('input', triggerSave);
  if (descriptionTextarea) descriptionTextarea.addEventListener('input', triggerSave);
}

// ---------------------------------------------------------------------------
// Save recipe (POST on first save, PATCH after)
// ---------------------------------------------------------------------------
async function saveRecipe() {
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    // Don't autosave without a name
    updateSaveIndicator('idle');
    return;
  }

  const cookTimeRaw = cookTimeInput ? parseInt(cookTimeInput.value, 10) : NaN;
  const servingsRaw = servingsInput ? parseInt(servingsInput.value, 10) : NaN;

  const payload = {
    name,
    category: categorySelect ? categorySelect.value : '한식',
    difficulty: selectedDifficulty,
    cookTimeMin: isNaN(cookTimeRaw) ? null : cookTimeRaw,
    servings: isNaN(servingsRaw) ? null : servingsRaw,
    description: descriptionTextarea ? (descriptionTextarea.value || null) : null,
    ingredients: collectIngredients(ingredientsContainer),
    steps: collectSteps(stepsContainer),
  };

  if (isNew && !currentRecipeId) {
    // First save → POST
    const created = await recipes.create(spaceId, payload);
    currentRecipeId = created.id;
    // Update URL without reload
    const newUrl = `/my-space/recipes/${currentRecipeId}?spaceId=${spaceId}`;
    window.history.replaceState({}, '', newUrl);
  } else {
    // Subsequent saves → PATCH
    await recipes.update(spaceId, currentRecipeId, payload);
  }
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------
function updateSaveIndicator(state) {
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  const messages = {
    idle:   '',
    saving: '저장 중…',
    saved:  '저장됨 ✓',
    error:  '저장 실패 — 재시도 중',
  };

  const classes = {
    idle:   '',
    saving: 'save-indicator--saving',
    saved:  'save-indicator--saved',
    error:  'save-indicator--error',
  };

  indicator.className = 'save-indicator';
  if (classes[state]) indicator.classList.add(classes[state]);
  indicator.textContent = messages[state] || '';
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------
function setupBackButton() {
  const btn = document.getElementById('btn-back');
  if (!btn) return;
  btn.addEventListener('click', () => {
    window.location.href = `/my-space/recipes?spaceId=${spaceId}`;
  });
}

// ---------------------------------------------------------------------------
// Global error display
// ---------------------------------------------------------------------------
function showGlobalError(msg) {
  const main = document.getElementById('recipe-edit-main');
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
