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
 * Auth strategy:
 *   - Single API login in beforeAll → shared browser context + page.
 *   - All tests reuse sharedPage (no per-test login → avoids rate limit).
 *   - Mirrors pattern used in my-space-search.spec.js.
 */

const { test, expect } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-recipe-view@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attachErrorCollectors(page) {
  const errors = { console: [], pageerror: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.console.push(msg.text());
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
// Shared state
// ---------------------------------------------------------------------------
let sharedPage;
let recipeSpaceId = null;
let createdRecipeId = null;
const sharedErrors = { console: [], pageerror: [] };

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------
test.describe('My Space — Phase 3.5 Recipe view + checklist', () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser, baseURL }) => {
    const base = baseURL || 'http://localhost';

    // Create shared browser context
    const ctx = await browser.newContext({ baseURL: base });
    sharedPage = await ctx.newPage();

    // Track errors on shared page
    sharedPage.on('console', (msg) => {
      if (msg.type() === 'error') sharedErrors.console.push(msg.text());
    });
    sharedPage.on('pageerror', (err) => {
      sharedErrors.pageerror.push(err.message);
    });

    // Register user (idempotent)
    await sharedPage.request.post('/api/auth/register', {
      data: { email: QA_EMAIL, password: QA_PASSWORD },
      failOnStatusCode: false,
    });

    // Login via API (shares cookies with page — avoids rate limit on UI form)
    const loginRes = await sharedPage.request.post('/api/auth/login', {
      data: { email: QA_EMAIL, password: QA_PASSWORD },
      failOnStatusCode: false,
    });
    if (loginRes.status() === 429) {
      await sharedPage.waitForTimeout(62_000);
      await sharedPage.request.post('/api/auth/login', {
        data: { email: QA_EMAIL, password: QA_PASSWORD },
        failOnStatusCode: true,
      });
    }

    // Go to /my-space
    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-main', { state: 'visible', timeout: 15000 });

    // Create recipe space if in onboarding
    const onboardingCount = await sharedPage.locator('.ms-onboarding').count();
    if (onboardingCount > 0) {
      const recipeCard = sharedPage.locator('.ms-template-grid >> text=레시피').first();
      await recipeCard.click();
      await sharedPage.locator('#space-name-input').fill('뷰 테스트 레시피 공간');
      await sharedPage.locator('button:has-text("만들기")').click();
      await sharedPage.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 12000 });
    }

    // Get spaceId
    recipeSpaceId = await sharedPage.evaluate(() => {
      const item = document.querySelector('.ms-inner-sidebar__item');
      return item ? parseInt(item.dataset.spaceId, 10) : null;
    });
    expect(recipeSpaceId, 'Expected to find a space ID').toBeTruthy();

    // Navigate to recipe list
    await sharedPage.goto(`/my-space/recipes?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('#recipes-main', { state: 'visible', timeout: 10000 });

    // Create new recipe
    await sharedPage.locator('#btn-new-recipe').click();
    await sharedPage.waitForURL('**/my-space/recipes/new**');
    await sharedPage.waitForSelector('#recipe-edit-main', { state: 'visible', timeout: 8000 });

    await sharedPage.locator('#recipe-name').fill('검증용 김치찌개');

    // 3 ingredients
    const ingContainer = sharedPage.locator('#ingredients-container');
    await ingContainer.locator('.ingredient-row__name').first().fill('김치');
    await ingContainer.locator('.ingredient-row__amount').first().fill('200g');

    await sharedPage.locator('button:has-text("+ 재료 추가")').click();
    await sharedPage.waitForTimeout(80);
    await ingContainer.locator('.ingredient-row__name').nth(1).fill('두부');
    await ingContainer.locator('.ingredient-row__amount').nth(1).fill('1/2모');

    await sharedPage.locator('button:has-text("+ 재료 추가")').click();
    await sharedPage.waitForTimeout(80);
    await ingContainer.locator('.ingredient-row__name').nth(2).fill('돼지고기');
    await ingContainer.locator('.ingredient-row__amount').nth(2).fill('150g');

    // 3 steps
    const stepsContainer = sharedPage.locator('#steps-container');
    await stepsContainer.locator('.step-row__text').first().fill('냄비에 물을 끓인다.');

    await sharedPage.locator('button:has-text("+ 단계 추가")').click();
    await sharedPage.waitForTimeout(80);
    await stepsContainer.locator('.step-row__text').nth(1).fill('김치와 돼지고기를 넣는다.');

    await sharedPage.locator('button:has-text("+ 단계 추가")').click();
    await sharedPage.waitForTimeout(80);
    await stepsContainer.locator('.step-row__text').nth(2).fill('두부를 넣고 5분 더 끓인다.');

    // Autosave
    await sharedPage.waitForTimeout(700);
    await expect(sharedPage.locator('#save-indicator')).toHaveText(/저장됨/, { timeout: 8000 });

    await expect.poll(() => sharedPage.url(), { timeout: 8000 }).toMatch(/\/my-space\/recipes\/\d+/);
    const url = sharedPage.url();
    const match = url.match(/\/my-space\/recipes\/(\d+)/);
    createdRecipeId = match ? parseInt(match[1], 10) : null;
    expect(createdRecipeId, 'Expected createdRecipeId after autosave').toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Test 1: card click → view URL
  // -------------------------------------------------------------------------
  test('card click navigates to /view URL', async () => {
    const errors = { console: [], pageerror: [] };

    await sharedPage.goto(`/my-space/recipes?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('#recipe-grid-container', { state: 'visible', timeout: 10000 });

    const firstCard = sharedPage.locator('.recipe-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await sharedPage.waitForURL((url) => url.pathname.includes('/view'), { timeout: 8000 });
    expect(sharedPage.url()).toMatch(/\/my-space\/recipes\/\d+\/view\?spaceId=/);

    assertNoErrors(sharedErrors, 'Test 1: card click → view URL');
  });

  // -------------------------------------------------------------------------
  // Test 2: view page shows recipe name, 3 ingredient checkboxes, 3 step checkboxes
  // -------------------------------------------------------------------------
  test('view page shows recipe name and all checkboxes', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    await expect(sharedPage.locator('.ms-recipe-view__title')).toHaveText('검증용 김치찌개');

    const ingCheckboxes = sharedPage.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await expect(ingCheckboxes).toHaveCount(3);

    const stepCheckboxes = sharedPage.locator('.ms-recipe-view__section').nth(1).locator('input[type="checkbox"]');
    await expect(stepCheckboxes).toHaveCount(3);

    assertNoErrors(sharedErrors, 'Test 2: view page content');
  });

  // -------------------------------------------------------------------------
  // Test 3: check 2 ingredients → progress "2 / 3"
  // -------------------------------------------------------------------------
  test('checking 2 ingredients updates progress to "2 / 3"', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Clear stale progress
    await sharedPage.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await sharedPage.reload();
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const ingSectionCheckboxes = sharedPage.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();

    const ingProgressBadge = sharedPage.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('2 / 3');

    assertNoErrors(sharedErrors, 'Test 3: ingredient progress');
  });

  // -------------------------------------------------------------------------
  // Test 4: reload → checkboxes 1+2 still checked (localStorage persistence)
  // -------------------------------------------------------------------------
  test('progress persists after page reload (localStorage)', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Clear first
    await sharedPage.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await sharedPage.reload();
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const ingSectionCheckboxes = sharedPage.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();

    // Reload
    await sharedPage.reload();
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const afterReloadCheckboxes = sharedPage.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await expect(afterReloadCheckboxes.nth(0)).toBeChecked();
    await expect(afterReloadCheckboxes.nth(1)).toBeChecked();
    await expect(afterReloadCheckboxes.nth(2)).not.toBeChecked();

    const ingProgressBadge = sharedPage.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('2 / 3');

    assertNoErrors(sharedErrors, 'Test 4: localStorage persistence');
  });

  // -------------------------------------------------------------------------
  // Test 5: check all 3 steps → progress "3 / 3" + strikethrough class
  // -------------------------------------------------------------------------
  test('checking all steps shows 3/3 progress and strikethrough', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    await sharedPage.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await sharedPage.reload();
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const stepSectionCheckboxes = sharedPage.locator('.ms-recipe-view__section').nth(1).locator('input[type="checkbox"]');
    await stepSectionCheckboxes.nth(0).click();
    await stepSectionCheckboxes.nth(1).click();
    await stepSectionCheckboxes.nth(2).click();

    const stepProgressBadge = sharedPage.locator('.ms-recipe-view__section').nth(1).locator('.ms-recipe-view__progress');
    await expect(stepProgressBadge).toHaveText('3 / 3');

    const stepRows = sharedPage.locator('.ms-recipe-view__section').nth(1).locator('.ms-recipe-view__check-row');
    await expect(stepRows.nth(0)).toHaveClass(/ms-recipe-view__check-row--done/);
    await expect(stepRows.nth(1)).toHaveClass(/ms-recipe-view__check-row--done/);
    await expect(stepRows.nth(2)).toHaveClass(/ms-recipe-view__check-row--done/);

    assertNoErrors(sharedErrors, 'Test 5: all steps checked');
  });

  // -------------------------------------------------------------------------
  // Test 6: click reset → confirm → all unchecked, progress "0 / 3"
  // -------------------------------------------------------------------------
  test('reset button clears all checkboxes and progress', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    // Ensure at least some are checked
    await sharedPage.evaluate((key) => localStorage.removeItem(key), `recipe-progress-${recipeSpaceId}-${createdRecipeId}`);
    await sharedPage.reload();
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const ingSectionCheckboxes = sharedPage.locator('.ms-recipe-view__section').first().locator('input[type="checkbox"]');
    await ingSectionCheckboxes.nth(0).click();
    await ingSectionCheckboxes.nth(1).click();
    await ingSectionCheckboxes.nth(2).click();

    // Auto-accept the confirm dialog
    sharedPage.once('dialog', (dialog) => dialog.accept());

    await sharedPage.locator('.ms-recipe-view__reset-btn').click();

    await expect(ingSectionCheckboxes.nth(0)).not.toBeChecked();
    await expect(ingSectionCheckboxes.nth(1)).not.toBeChecked();
    await expect(ingSectionCheckboxes.nth(2)).not.toBeChecked();

    const ingProgressBadge = sharedPage.locator('.ms-recipe-view__section').first().locator('.ms-recipe-view__progress');
    await expect(ingProgressBadge).toHaveText('0 / 3');

    assertNoErrors(sharedErrors, 'Test 6: reset button');
  });

  // -------------------------------------------------------------------------
  // Test 7: "편집" button → edit page URL
  // -------------------------------------------------------------------------
  test('"편집" button navigates to edit page', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const editBtn = sharedPage.locator('.ms-recipe-view__edit-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await sharedPage.waitForURL((url) => !url.pathname.includes('/view'), { timeout: 8000 });
    expect(sharedPage.url()).toMatch(new RegExp(`/my-space/recipes/${createdRecipeId}\\?spaceId=`));

    assertNoErrors(sharedErrors, 'Test 7: edit button navigation');
  });

  // -------------------------------------------------------------------------
  // Test 8: "← 목록" button → recipe list
  // -------------------------------------------------------------------------
  test('"← 목록" button navigates to recipe list', async () => {
    await sharedPage.goto(`/my-space/recipes/${createdRecipeId}/view?spaceId=${recipeSpaceId}`);
    await sharedPage.waitForSelector('.ms-recipe-view', { state: 'visible', timeout: 10000 });

    const backBtn = sharedPage.locator('.ms-recipe-view__back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    await sharedPage.waitForURL((url) => url.pathname === '/my-space/recipes', { timeout: 8000 });
    expect(sharedPage.url()).toContain('/my-space/recipes');

    assertNoErrors(sharedErrors, 'Test 8: back button navigation');
  });
});
