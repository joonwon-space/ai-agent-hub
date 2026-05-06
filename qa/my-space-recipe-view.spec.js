/**
 * my-space-recipe-view.spec.js — Phase 3.5 E2E: Recipe read-only view + checklist.
 *
 * Covers:
 *   - Login → create recipe space → create recipe with 3 ingredients + 3 steps
 *   - Card click navigates to /view URL (not edit)
 *   - View page shows recipe name, ingredients, steps with checkboxes
 *   - Check 2 ingredients → progress "2 / 3"
 *   - Reload → checkboxes still checked (localStorage persistence)
 *   - Check all 3 steps → progress "3 / 3" + strikethrough class
 *   - Click reset → confirm → all unchecked, progress "0 / 3"
 *   - "편집" button → edit page URL
 *   - "← 목록" button → list URL
 *   - Console + pageerror = 0
 *
 * Auth: uses a unique test user so it doesn't conflict with other specs.
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-recipe-view@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureUser(baseURL) {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/auth/register', {
    data: { email: QA_EMAIL, password: QA_PASSWORD },
    failOnStatusCode: false,
  });
  await ctx.dispose();
  return res.status();
}

async function loginUI(page) {
  await page.goto('/login');
  await page.waitForSelector('#email', { state: 'visible' });
  await page.fill('#email', QA_EMAIL);
  await page.fill('#password', QA_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 }),
    page.click('#submit-btn'),
  ]);
}

function attachErrorCollectors(page) {
  const errors = { console: [], pageerror: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter expected 400s from cover upload spec interactions
      if (text.includes('400') && text.includes('/cover')) return;
      errors.console.push(text);
    }
  });
  page.on('pageerror', (err) => {
    errors.pageerror.push(err.message);
  });
  return errors;
}

function assertNoErrors(errors, label) {
  const all = [
    ...errors.console.map((m) => `[console] ${m}`),
    ...errors.pageerror.map((m) => `[pageerror] ${m}`),
  ];
  expect(all, `${label} — expected zero console/page errors`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Shared state across tests (populated in beforeAll)
// ---------------------------------------------------------------------------
let recipeSpaceId = null;
let createdRecipeId = null;

// ---------------------------------------------------------------------------
// Setup: create user, login, create recipe space + recipe
// ---------------------------------------------------------------------------
test.describe('My Space — Phase 3.5 Recipe view + checklist', () => {
  test.beforeAll(async ({ baseURL, browser }) => {
    await ensureUser(baseURL || 'http://localhost');

    // Create a recipe with 3 ingredients and 3 steps via the UI
    const page = await browser.newPage();
    await loginUI(page);

    // Go to my-space and find/create a recipe space
    await page.goto('/my-space');
    await page.waitForSelector('#ms-main', { state: 'visible', timeout: 15000 });

    // Determine if onboarding or dashboard
    const onboardingCount = await page.locator('.ms-onboarding').count();

    if (onboardingCount > 0) {
      // Create recipe space
      const recipeCard = page.locator('.ms-template-grid >> text=레시피').first();
      await recipeCard.click();
      const nameInput = page.locator('#space-name-input');
      await nameInput.fill('뷰 테스트 레시피 공간');
      await page.locator('button:has-text("만들기")').click();
      await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 12000 });
    }

    // Get spaceId from sidebar
    recipeSpaceId = await page.evaluate(() => {
      const item = document.querySelector('.ms-inner-sidebar__item');
      return item ? parseInt(item.dataset.spaceId, 10) : null;
    });

    expect(recipeSpaceId, 'Expected to find a space ID').toBeTruthy();

    // Navigate to recipe list
    await page.goto(`/my-space/recipes?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('#recipes-main', { state: 'visible', timeout: 10000 });

    // Create new recipe
    await page.locator('#btn-new-recipe').click();
    await page.waitForURL('**/my-space/recipes/new**');
    await page.waitForSelector('#recipe-edit-main', { state: 'visible', timeout: 8000 });

    // Fill recipe name
    await page.locator('#recipe-name').fill('검증용 김치찌개');

    // Set category to 한식 (default)
    // Category is already 한식

    // Add 3 ingredients
    const ingContainer = page.locator('#ingredients-container');
    await ingContainer.locator('.ingredient-row__name').first().fill('김치');
    await ingContainer.locator('.ingredient-row__amount').first().fill('200g');

    await page.locator('button:has-text("+ 재료 추가")').click();
    await page.waitForTimeout(80);
    await ingContainer.locator('.ingredient-row__name').nth(1).fill('두부');
    await ingContainer.locator('.ingredient-row__amount').nth(1).fill('1/2모');

    await page.locator('button:has-text("+ 재료 추가")').click();
    await page.waitForTimeout(80);
    await ingContainer.locator('.ingredient-row__name').nth(2).fill('돼지고기');
    await ingContainer.locator('.ingredient-row__amount').nth(2).fill('150g');

    // Add 3 steps
    const stepsContainer = page.locator('#steps-container');
    await stepsContainer.locator('.step-row__text').first().fill('냄비에 물을 끓인다.');

    await page.locator('button:has-text("+ 단계 추가")').click();
    await page.waitForTimeout(80);
    await stepsContainer.locator('.step-row__text').nth(1).fill('김치와 돼지고기를 넣는다.');

    await page.locator('button:has-text("+ 단계 추가")').click();
    await page.waitForTimeout(80);
    await stepsContainer.locator('.step-row__text').nth(2).fill('두부를 넣고 5분 더 끓인다.');

    // Wait for autosave
    await page.waitForTimeout(700);
    await expect(page.locator('#save-indicator')).toHaveText(/저장됨/, { timeout: 8000 });

    // Extract recipeId from URL
    await expect.poll(() => page.url(), { timeout: 8000 }).toMatch(/\/my-space\/recipes\/\d+/);
    const url = page.url();
    const match = url.match(/\/my-space\/recipes\/(\d+)/);
    createdRecipeId = match ? parseInt(match[1], 10) : null;
    expect(createdRecipeId, 'Expected createdRecipeId to be set after save').toBeTruthy();

    await page.close();
  });

  // -------------------------------------------------------------------------
  // Test 1: card click → view URL
  // -------------------------------------------------------------------------
  test('card click navigates to /view URL', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('#recipe-grid-container', { state: 'visible', timeout: 10000 });

    // Click the first recipe card
    const firstCard = page.locator('.recipe-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // Should navigate to /view URL
    await page.waitForURL((url) => url.pathname.includes('/view'), { timeout: 8000 });
    expect(page.url()).toMatch(/\/my-space\/recipes\/\d+\/view\?spaceId=/);

    assertNoErrors(errors, 'Test 1: card click → view URL');
  });

  // -------------------------------------------------------------------------
  // Test 2: view page shows recipe name, 3 ingredient checkboxes, 3 step checkboxes
  // -------------------------------------------------------------------------
  test('view page shows recipe name and all checkboxes', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Recipe name h1
    const title = page.locator('.ms-recipe-view__title');
    await expect(title).toHaveText('검증용 김치찌개');

    // 3 ingredient checkboxes
    const ingCheckboxes = page.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await expect(ingCheckboxes).toHaveCount(3);

    // 3 step checkboxes
    const stepCheckboxes = page.locator('.ms-recipe-view__section').nth(1).locator('input[type="checkbox"]');
    await expect(stepCheckboxes).toHaveCount(3);

    assertNoErrors(errors, 'Test 2: view page content');
  });

  // -------------------------------------------------------------------------
  // Test 3: check 2 ingredients → progress "2 / 3"
  // -------------------------------------------------------------------------
  test('checking 2 ingredients updates progress to "2 / 3"', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Clear any previous progress via localStorage
    await page.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await page.reload();
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const ingSectionCheckboxes = page.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');

    // Check first 2
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();

    // Progress badge in ingredient section header
    const ingProgressBadge = page.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('2 / 3');

    assertNoErrors(errors, 'Test 3: ingredient progress');
  });

  // -------------------------------------------------------------------------
  // Test 4: reload → checkboxes 1+2 still checked (localStorage persistence)
  // -------------------------------------------------------------------------
  test('progress persists after page reload (localStorage)', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Reset first
    await page.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await page.reload();
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const ingSectionCheckboxes = page.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');

    // Check first 2
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();

    // Reload page
    await page.reload();
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const afterReloadCheckboxes = page.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');

    // First 2 should still be checked
    await expect(afterReloadCheckboxes.nth(0)).toBeChecked();
    await expect(afterReloadCheckboxes.nth(1)).toBeChecked();
    await expect(afterReloadCheckboxes.nth(2)).not.toBeChecked();

    // Progress badge should show 2 / 3
    const ingProgressBadge = page.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('2 / 3');

    assertNoErrors(errors, 'Test 4: localStorage persistence');
  });

  // -------------------------------------------------------------------------
  // Test 5: check all 3 steps → progress "3 / 3" + strikethrough class
  // -------------------------------------------------------------------------
  test('checking all steps shows 3/3 progress and strikethrough', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Reset first to ensure clean state
    await page.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await page.reload();
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const stepSectionCheckboxes = page.locator('.ms-recipe-view__section').nth(1).locator('input[type="checkbox"]');

    // Check all 3
    await stepSectionCheckboxes.nth(0).click();
    await stepSectionCheckboxes.nth(1).click();
    await stepSectionCheckboxes.nth(2).click();

    // Progress badge should be 3 / 3
    const stepProgressBadge = page.locator('.ms-recipe-view__section').nth(1).locator('.ms-recipe-view__progress');
    await expect(stepProgressBadge).toHaveText('3 / 3');

    // All step rows should have strikethrough class
    const stepRows = page.locator('.ms-recipe-view__section').nth(1).locator('.ms-recipe-view__check-row');
    await expect(stepRows.nth(0)).toHaveClass(/ms-recipe-view__check-row--done/);
    await expect(stepRows.nth(1)).toHaveClass(/ms-recipe-view__check-row--done/);
    await expect(stepRows.nth(2)).toHaveClass(/ms-recipe-view__check-row--done/);

    assertNoErrors(errors, 'Test 5: all steps checked');
  });

  // -------------------------------------------------------------------------
  // Test 6: click reset → confirm → all unchecked, progress "0 / 3"
  // -------------------------------------------------------------------------
  test('reset button clears all checkboxes and progress', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Set some checkboxes first
    const ingSectionCheckboxes = page.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();
    await ingSectionCheckboxes.nth(2).click();

    // Auto-accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());

    // Click reset
    await page.locator('.ms-recipe-view__reset-btn').click();

    // All ingredient checkboxes should be unchecked
    await expect(ingSectionCheckboxes.nth(0)).not.toBeChecked();
    await expect(ingSectionCheckboxes.nth(1)).not.toBeChecked();
    await expect(ingSectionCheckboxes.nth(2)).not.toBeChecked();

    // Ingredient progress badge should be 0 / 3
    const ingProgressBadge = page.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('0 / 3');

    assertNoErrors(errors, 'Test 6: reset button');
  });

  // -------------------------------------------------------------------------
  // Test 7: "편집" button → edit page URL
  // -------------------------------------------------------------------------
  test('"편집" button navigates to edit page', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const editBtn = page.locator('.ms-recipe-view__edit-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // URL should match edit pattern (no /view)
    await page.waitForURL((url) => !url.pathname.includes('/view'), { timeout: 8000 });
    expect(page.url()).toMatch(new RegExp(`/my-space/recipes/${createdRecipeId}\\?spaceId=`));

    assertNoErrors(errors, 'Test 7: edit button navigation');
  });

  // -------------------------------------------------------------------------
  // Test 8: "← 목록" button → recipe list
  // -------------------------------------------------------------------------
  test('"← 목록" button navigates to recipe list', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);

    await page.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await page.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const backBtn = page.locator('.ms-recipe-view__back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    await page.waitForURL((url) => url.pathname === '/my-space/recipes', { timeout: 8000 });
    expect(page.url()).toContain('/my-space/recipes');

    assertNoErrors(errors, 'Test 8: back button navigation');
  });
});
