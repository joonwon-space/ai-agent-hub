/**
 * my-space-recipes.spec.js — Phase 1.5 happy path E2E for Recipe flow.
 *
 * Covers:
 *   - Login → create a recipe space → navigate to recipe list
 *   - "+ 새 레시피" → fill form (name, category, difficulty, 2 ingredients, 2 steps)
 *   - Wait 700ms → "저장됨 ✓" indicator appears
 *   - Back to list → new recipe card is visible
 *   - Console + pageerror = 0 throughout
 *
 * Auth strategy:
 *   QA_EMAIL/QA_PASSWORD env vars override; otherwise falls back to
 *   a test-local user registered through /api/auth/register.
 *
 * DO NOT modify qa/my-space.spec.js (Phase 1).
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-recipes1@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

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

test.describe('My Space — Phase 1.5 Recipe happy path', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL || 'http://localhost');
  });

  test('login → create recipe space → add recipe → autosave → list shows card', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = attachErrorCollectors(page);

    // 1. Login
    await loginUI(page);

    // 2. Navigate to /my-space
    await page.goto('/my-space');
    await page.waitForSelector('#ms-main', { state: 'visible' });

    // 3. Handle onboarding or dashboard
    const onboarding = page.locator('.ms-onboarding');
    const dashboard   = page.locator('.ms-dashboard');
    const isOnboarding = await onboarding.count() > 0;

    if (isOnboarding) {
      // Select recipe template
      const recipeCard = page.locator('.ms-template-grid >> text=레시피').first();
      await expect(recipeCard).toBeVisible();
      await recipeCard.click();

      // Name the space
      const nameInput = page.locator('#space-name-input');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('나의 레시피 공간');
      await page.locator('button:has-text("만들기")').click();

      // Wait for dashboard to load (page reloads)
      await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 10000 });
    } else {
      // Dashboard present — check if we have a recipe-type space
      // If dashboard shows a diary space, we still proceed by navigating directly
      await expect(dashboard).toBeVisible();
    }

    // 4. Navigate directly to recipe list for the first space
    // Find spaceId from the current page URL or from the dashboard sidebar
    // As a fallback, call API to get spaces
    const spaceIdFromSidebar = await page.evaluate(() => {
      const btn = document.querySelector('.ms-inner-sidebar__item');
      return btn ? btn.dataset.spaceId : null;
    }).catch(() => null);

    // Try to find the recipe space from the page
    let recipeSpaceId = spaceIdFromSidebar;

    // If no sidebar button found, navigate to /my-space and find the created space
    if (!recipeSpaceId) {
      await page.goto('/my-space');
      await page.waitForSelector('.ms-dashboard, .ms-onboarding', { timeout: 8000 });
    }

    // Get spaceId from the sidebar button data attribute
    const spaceId = await page.evaluate(() => {
      const items = document.querySelectorAll('.ms-inner-sidebar__item');
      for (const item of items) {
        // prefer recipe template space but any will do
        if (item.dataset.spaceId) return parseInt(item.dataset.spaceId, 10);
      }
      return null;
    }).catch(() => null);

    expect(spaceId, 'Expected to find a spaceId in dashboard sidebar').toBeTruthy();

    // 5. Navigate to recipe list
    await page.goto(`/my-space/recipes?spaceId=${spaceId}`);
    await page.waitForSelector('#recipes-main', { state: 'visible', timeout: 10000 });

    // 6. Click "+ 새 레시피"
    const newRecipeBtn = page.locator('#btn-new-recipe');
    await expect(newRecipeBtn).toBeVisible();
    await newRecipeBtn.click();

    // 7. Fill the recipe edit form
    await page.waitForURL(`**/my-space/recipes/new**`);
    await page.waitForSelector('#recipe-edit-main', { state: 'visible', timeout: 8000 });

    const stamp = `E2E-recipe-${Date.now()}`;

    // Fill name
    const nameInp = page.locator('#recipe-name');
    await expect(nameInp).toBeVisible();
    await nameInp.fill(stamp);

    // Category — already defaults to 한식, but let's confirm
    const catSelect = page.locator('#recipe-category');
    await expect(catSelect).toBeVisible();

    // Select difficulty — click '보통' button
    const mediumBtn = page.locator('.difficulty-btn[data-value="medium"]');
    await expect(mediumBtn).toBeVisible();
    await mediumBtn.click();

    // Add 2 ingredients (1 is pre-populated, add 1 more)
    const ingContainer = page.locator('#ingredients-container');
    await expect(ingContainer).toBeVisible();

    // Fill first ingredient row
    const firstIngName = ingContainer.locator('.ingredient-row__name').first();
    const firstIngAmount = ingContainer.locator('.ingredient-row__amount').first();
    await firstIngName.fill('된장');
    await firstIngAmount.fill('2큰술');

    // Add second ingredient
    const addIngBtn = page.locator('button:has-text("+ 재료 추가")');
    await addIngBtn.click();
    await page.waitForTimeout(100); // Let DOM update

    const allIngNames = ingContainer.locator('.ingredient-row__name');
    const allIngAmounts = ingContainer.locator('.ingredient-row__amount');
    const ingCount = await allIngNames.count();
    expect(ingCount).toBeGreaterThanOrEqual(2);
    await allIngNames.nth(1).fill('두부');
    await allIngAmounts.nth(1).fill('1/2모');

    // Add 2 steps (1 is pre-populated, add 1 more)
    const stepsContainer = page.locator('#steps-container');
    await expect(stepsContainer).toBeVisible();

    const firstStepText = stepsContainer.locator('.step-row__text').first();
    await firstStepText.fill('물을 냄비에 붓고 끓인다.');

    const addStepBtn = page.locator('button:has-text("+ 단계 추가")');
    await addStepBtn.click();
    await page.waitForTimeout(100);

    const allStepTexts = stepsContainer.locator('.step-row__text');
    const stepCount = await allStepTexts.count();
    expect(stepCount).toBeGreaterThanOrEqual(2);
    await allStepTexts.nth(1).fill('된장을 풀고 두부를 넣는다.');

    // 8. Trigger autosave by changing a field (already triggered on fill)
    // Wait 700ms grace period for autosave debounce
    await page.waitForTimeout(700);

    // 9. Wait for "저장됨 ✓" indicator
    const indicator = page.locator('#save-indicator');
    await expect(indicator).toHaveText(/저장됨/, { timeout: 8000 });

    // 10. URL should update to /my-space/recipes/<id> after first save
    await expect.poll(
      () => page.url(),
      { message: 'URL should update to /my-space/recipes/<id> after first save', timeout: 6000 },
    ).toMatch(/\/my-space\/recipes\/\d+/);

    // 11. Back to recipe list → card visible
    const backBtn = page.locator('#btn-back');
    await backBtn.click();
    await page.waitForURL(`**/my-space/recipes**`);
    await page.waitForSelector('#recipe-grid-container', { state: 'visible', timeout: 8000 });

    // Recipe card with our stamp should be visible
    const grid = page.locator('.recipe-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator(`text=${stamp}`)).toBeVisible();

    // 12. Screenshot
    await page.screenshot({
      path: `screenshots/my-space-recipes-happy-path-${testInfo.workerIndex}.png`,
      fullPage: true,
    });

    // 13. Assert no errors
    assertNoErrors(errors, 'Recipe happy path');
  });
});
