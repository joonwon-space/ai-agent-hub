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

// Cover state
let currentCoverUrl = null;
let coverDropzone = null;
let coverFileInput = null;

// DOM refs (populated in buildForm)
let nameInput = null;
let categorySelect = null;
let cookTimeInput = null;
let servingsInput = null;
let descriptionTextarea = null;
let videoUrlInput = null;
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
  setupViewModeLink();

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
// AI assist callback — populate form fields from extracted data
// ---------------------------------------------------------------------------
function applyAiFields(fields) {
  if (nameInput && fields.name) nameInput.value = fields.name;
  if (categorySelect && fields.category) categorySelect.value = fields.category;

  if (fields.difficulty) {
    selectedDifficulty = fields.difficulty;
    const diffGroup = document.getElementById('difficulty-group');
    if (diffGroup) {
      diffGroup.querySelectorAll('.difficulty-btn').forEach((btn) => {
        btn.classList.toggle('difficulty-btn--active', btn.dataset.value === fields.difficulty);
      });
    }
  }

  if (cookTimeInput && fields.cookTimeMin != null) cookTimeInput.value = String(fields.cookTimeMin);
  if (servingsInput && fields.servings != null) servingsInput.value = String(fields.servings);
  if (descriptionTextarea) descriptionTextarea.value = fields.description || '';
  if (videoUrlInput && fields.videoUrl) videoUrlInput.value = fields.videoUrl;

  if (ingredientsContainer && Array.isArray(fields.ingredients)) {
    ingredientsContainer.textContent = '';
    if (fields.ingredients.length === 0) {
      addIngredientRow(null);
    } else {
      for (const item of fields.ingredients) addIngredientRow(item);
    }
  }

  if (stepsContainer && Array.isArray(fields.steps)) {
    stepsContainer.textContent = '';
    if (fields.steps.length === 0) {
      addStepRow(null);
    } else {
      for (const item of fields.steps) addStepRow(item);
    }
  }

  if (autosaver) autosaver.schedule();
}

// ---------------------------------------------------------------------------
// Build the form DOM
// ---------------------------------------------------------------------------
function buildForm() {
  const main = document.getElementById('recipe-edit-main');
  if (!main) return;
  main.textContent = '';

  // AI assist panel
  const { el: aiPanelEl } = createRecipeAiPanel(applyAiFields);
  main.appendChild(aiPanelEl);

  // Cover image dropzone (at top of form)
  const coverSection = buildCoverDropzone();
  main.appendChild(coverSection);

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

  // YouTube URL
  const videoField = makeField('유튜브 영상 URL (선택)');
  videoUrlInput = document.createElement('input');
  videoUrlInput.type = 'url';
  videoUrlInput.id = 'recipe-video-url';
  videoUrlInput.placeholder = 'https://youtu.be/... 또는 https://www.youtube.com/watch?v=...';
  videoField.appendChild(videoUrlInput);
  main.appendChild(videoField);

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
// Cover dropzone
// ---------------------------------------------------------------------------

/**
 * Build the cover image dropzone section.
 * Returns a container element; also sets module-level coverDropzone / coverFileInput refs.
 * @returns {HTMLElement}
 */
function buildCoverDropzone() {
  const wrapper = document.createElement('div');
  wrapper.id = 'cover-section';

  const label = document.createElement('label');
  label.className = 'recipe-edit-field__label';
  label.textContent = '커버 이미지';
  wrapper.appendChild(label);

  coverDropzone = document.createElement('div');
  coverDropzone.id = 'cover-dropzone';
  coverDropzone.className = 'ms-recipe-cover-dropzone';
  coverDropzone.setAttribute('role', 'button');
  coverDropzone.setAttribute('tabindex', '0');
  coverDropzone.setAttribute('aria-label', '커버 이미지 업로드');

  // Hidden file input
  coverFileInput = document.createElement('input');
  coverFileInput.type = 'file';
  coverFileInput.accept = 'image/jpeg,image/png,image/webp';
  coverFileInput.style.display = 'none';
  coverFileInput.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(coverFileInput);

  // Render initial idle state (no cover)
  renderCoverIdle();

  // Click to open file picker
  coverDropzone.addEventListener('click', () => {
    if (!currentRecipeId) {
      showCoverNotice();
      return;
    }
    coverFileInput.click();
  });

  // Keyboard support
  coverDropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      coverDropzone.click();
    }
  });

  // Drag-and-drop
  coverDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    coverDropzone.classList.add('ms-recipe-cover-dropzone--dragover');
  });
  coverDropzone.addEventListener('dragleave', () => {
    coverDropzone.classList.remove('ms-recipe-cover-dropzone--dragover');
  });
  coverDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    coverDropzone.classList.remove('ms-recipe-cover-dropzone--dragover');
    if (!currentRecipeId) {
      showCoverNotice();
      return;
    }
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      handleCoverFile(files[0]);
    }
  });

  // File input change
  coverFileInput.addEventListener('change', () => {
    if (coverFileInput.files && coverFileInput.files.length > 0) {
      handleCoverFile(coverFileInput.files[0]);
      // Reset so same file can be re-selected
      coverFileInput.value = '';
    }
  });

  wrapper.appendChild(coverDropzone);
  return wrapper;
}

/**
 * Render the dropzone in idle (no cover) state.
 */
function renderCoverIdle() {
  if (!coverDropzone) return;
  coverDropzone.textContent = '';
  coverDropzone.className = 'ms-recipe-cover-dropzone';

  const icon = document.createElement('span');
  icon.className = 'ms-recipe-cover-dropzone__icon';
  icon.textContent = '📷';
  coverDropzone.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'ms-recipe-cover-dropzone__text';
  text.textContent = '커버 이미지 업로드 / 클릭 또는 드래그 (JPEG/PNG/WebP, 5MB 이하)';
  coverDropzone.appendChild(text);
}

/**
 * Render the dropzone with an existing cover image preview.
 * @param {string} url
 */
function renderCoverPreview(url) {
  if (!coverDropzone) return;
  coverDropzone.textContent = '';
  coverDropzone.className = 'ms-recipe-cover-dropzone ms-recipe-cover-dropzone--has-image';

  const img = document.createElement('img');
  img.className = 'ms-recipe-cover-preview';
  img.src = url;
  img.alt = '레시피 커버 이미지';
  coverDropzone.appendChild(img);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ms-recipe-cover-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.setAttribute('aria-label', '커버 이미지 삭제');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger dropzone click
    handleCoverDelete();
  });
  coverDropzone.appendChild(removeBtn);
}

/**
 * Render spinner during upload.
 */
function renderCoverSpinner() {
  if (!coverDropzone) return;
  coverDropzone.textContent = '';
  coverDropzone.className = 'ms-recipe-cover-dropzone ms-recipe-cover-dropzone--uploading';

  const spinner = document.createElement('span');
  spinner.className = 'ms-recipe-cover-dropzone__spinner';
  spinner.textContent = '업로드 중…';
  coverDropzone.appendChild(spinner);
}

/**
 * Show notice that cover upload requires a saved recipe.
 */
function showCoverNotice() {
  const notice = document.getElementById('cover-notice');
  if (notice) return; // Already shown

  const n = document.createElement('p');
  n.id = 'cover-notice';
  n.className = 'ms-recipe-cover-notice';
  n.textContent = '레시피 저장 후 커버를 추가할 수 있습니다.';

  const section = document.getElementById('cover-section');
  if (section) section.appendChild(n);

  // Auto-remove after 3s
  setTimeout(() => {
    const el = document.getElementById('cover-notice');
    if (el) el.remove();
  }, 3000);
}

/**
 * Client-side validation then upload a cover file.
 * @param {File} file
 */
async function handleCoverFile(file) {
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;

  if (!ALLOWED.includes(file.type)) {
    alert('JPEG, PNG, WebP 파일만 업로드 가능합니다.');
    return;
  }
  if (file.size > MAX_BYTES) {
    alert('파일 크기는 5MB 이하여야 합니다.');
    return;
  }

  renderCoverSpinner();

  try {
    const result = await recipes.uploadCover(spaceId, currentRecipeId, file);
    if (result && result.url) {
      currentCoverUrl = result.url;
      renderCoverPreview(currentCoverUrl);
    } else {
      renderCoverIdle();
    }
  } catch (err) {
    renderCoverIdle();
    alert('커버 업로드 실패: ' + (err.error || err.message || '알 수 없는 오류'));
  }
}

/**
 * Confirm and delete the current cover image.
 */
async function handleCoverDelete() {
  if (!currentRecipeId || !currentCoverUrl) {
    renderCoverIdle();
    currentCoverUrl = null;
    return;
  }

  const confirmed = window.confirm('커버 이미지를 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    await recipes.deleteCover(spaceId, currentRecipeId);
    currentCoverUrl = null;
    renderCoverIdle();
  } catch (err) {
    alert('커버 삭제 실패: ' + (err.error || err.message || '알 수 없는 오류'));
  }
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
  // Populate cover dropzone
  if (recipe.coverImage) {
    currentCoverUrl = recipe.coverImage;
    renderCoverPreview(currentCoverUrl);
  } else {
    currentCoverUrl = null;
    renderCoverIdle();
  }

  if (nameInput) nameInput.value = recipe.name || '';
  if (categorySelect) categorySelect.value = recipe.category || '한식';
  if (cookTimeInput && recipe.cookTimeMin !== null && recipe.cookTimeMin !== undefined) {
    cookTimeInput.value = String(recipe.cookTimeMin);
  }
  if (servingsInput && recipe.servings !== null && recipe.servings !== undefined) {
    servingsInput.value = String(recipe.servings);
  }
  if (descriptionTextarea) descriptionTextarea.value = recipe.description || '';
  if (videoUrlInput) videoUrlInput.value = recipe.videoUrl || '';

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
  if (videoUrlInput) videoUrlInput.addEventListener('input', triggerSave);

  // B-1 잔존: flush pending save on page unload so the last debounce
  // window doesn't drop typed content.
  const flushOnLeave = () => {
    if (autosaver && typeof autosaver.flush === 'function') autosaver.flush();
  };
  window.addEventListener('beforeunload', flushOnLeave);
  window.addEventListener('pagehide', flushOnLeave);
}

// ---------------------------------------------------------------------------
// Save recipe (POST on first save, PATCH after)
// ---------------------------------------------------------------------------
async function saveRecipe() {
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    // B-1: recipes need a real name (date fallback would be useless), so
    // surface a clearer warning instead of a silent idle that can be
    // confused with "saved" status
    updateSaveIndicator('needs-name');
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
    videoUrl: videoUrlInput ? (videoUrlInput.value.trim() || null) : null,
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
    // B-5: now that an id exists, refresh the view-mode link so the user
    // can immediately jump to /view without reloading the page.
    updateViewModeLink();
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
    idle:    '',
    pending: '입력 중…',  // P-1
    saving:  '저장 중…',
    saved:   '저장됨 ✓',
    error:   '저장 실패 — 재시도 중',
    'needs-name': '레시피 이름을 입력하면 저장됩니다',
  };

  const classes = {
    idle:    '',
    pending: 'save-indicator--pending',
    saving:  'save-indicator--saving',
    saved:   'save-indicator--saved',
    error:   'save-indicator--error',
    'needs-name': 'save-indicator--needs-name',
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
// View mode link (보기 모드) — shown in topbar right when editing existing recipe
// ---------------------------------------------------------------------------
function setupViewModeLink() {
  const rightBar = document.querySelector('.recipe-edit-topbar__right');
  if (!rightBar) return;

  const link = document.createElement('a');
  link.id = 'btn-view-mode';
  link.className = 'ms-recipe-edit__view-link btn-text';
  link.textContent = '보기 모드';

  // Insert before the first child (theme toggle), after save indicator
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    rightBar.insertBefore(link, themeToggle);
  } else {
    rightBar.appendChild(link);
  }

  // B-5: apply enabled/disabled state via the same path used after first
  // autosave — keeps the "before first save" and "after first save"
  // codepaths in sync.
  updateViewModeLink();
}

// B-5: recompute the view-mode link state. Called on initial setup and
// again from saveRecipe() right after history.replaceState updates the URL
// to /my-space/recipes/<id>. Without this, the link stays aria-disabled
// for the lifetime of the page after first save.
function updateViewModeLink() {
  const link = document.getElementById('btn-view-mode');
  if (!link) return;
  if (currentRecipeId) {
    link.href = `/my-space/recipes/${currentRecipeId}/view?spaceId=${spaceId}`;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('tabindex');
    link.title = '';
    link.classList.remove('ms-recipe-edit__view-link--disabled');
  } else {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('tabindex', '-1');
    link.title = '저장 후 사용 가능';
    link.classList.add('ms-recipe-edit__view-link--disabled');
  }
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
