/**
 * my-space-search.spec.js — Phase 3.2 unified search E2E.
 *
 * Covers:
 *   - Search bar visible at /my-space top
 *   - Korean keyword "스프" → diary 1, recipe 1, note 0
 *   - English keyword "spring" → diary 1, recipe 0, note 1
 *   - Clear search → results hidden, dashboard restored
 *   - No results → "검색 결과 없음" message visible
 *   - Cross-user isolation: USER_B sees empty results for USER_A keyword
 *   - Console + pageerror = 0
 *
 * Auth strategy:
 *   - Login via page.request (Playwright built-in) — shares cookies with page.
 *   - One login per user, no UI form — avoids rate-limit on repeated runs.
 *   - USER_A shares a single browser context across all USER_A tests.
 *   - USER_B gets its own isolated context for the isolation test.
 *
 * Run with: npx playwright test my-space-search.spec.js --workers=1
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-search1@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

const QA_EMAIL_B    = 'smoke-search-b1@test.local';
const QA_PASSWORD_B = 'Pass1234!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Register user via API (idempotent — ignores 4xx if already exists).
 */
async function ensureUser(apiCtx, email, password) {
  await apiCtx.post('/api/auth/register', {
    data: { email, password },
    failOnStatusCode: false,
  });
}

/**
 * Login via page.request — shares cookies with the page context.
 * This is one API call per login, not rate-limited by the UI form path.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
async function loginViaApi(page, email, password) {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password },
    failOnStatusCode: false,
  });
  // If rate limited, wait and retry once
  if (res.status() === 429) {
    await page.waitForTimeout(62_000); // wait for rate-limit window to clear
    await page.request.post('/api/auth/login', {
      data: { email, password },
    });
  }
}

/**
 * Seed data via page.evaluate (uses page's cookie session).
 */
async function seedViaPage(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(err)}`);
      }
      return res.json();
    },
    { method, path, body },
  );
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

// ---------------------------------------------------------------------------
// State shared across USER_A tests
// ---------------------------------------------------------------------------
let sharedPage;
let diarySpaceId;
let recipeSpaceId;
let noteSpaceId;

// ---------------------------------------------------------------------------
// USER_A test suite — shared browser context
// ---------------------------------------------------------------------------
test.describe('My Space — Phase 3.2 Unified Search (USER_A)', () => {
  test.setTimeout(120_000);

  test.beforeAll(async ({ browser, baseURL }) => {
    const base = baseURL || 'http://localhost';

    // Create persistent browser context for USER_A
    const ctx = await browser.newContext({ baseURL: base });
    sharedPage = await ctx.newPage();

    // Register USER_A (idempotent)
    await sharedPage.request.post('/api/auth/register', {
      data: { email: QA_EMAIL, password: QA_PASSWORD },
      failOnStatusCode: false,
    });

    // Login via API (shares cookies with page — no UI form)
    await loginViaApi(sharedPage, QA_EMAIL, QA_PASSWORD);

    // Navigate to /my-space to confirm session works
    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-main', { state: 'visible', timeout: 15_000 });

    // Seed diary space + entry
    const diarySpace = await seedViaPage(sharedPage, 'POST', '/api/my-space', {
      name: 'E2E-search-diary-' + Date.now(),
      template: 'diary',
    });
    diarySpaceId = diarySpace.id;
    await seedViaPage(sharedPage, 'POST', `/api/my-space/${diarySpaceId}/diary`, {
      title: '스프린트 회고',
      body: '오늘 sprint 마무리했다.',
      entryDate: new Date().toISOString().slice(0, 10),
      mood: 'happy',
    });

    // Seed recipe space + recipe
    const recipeSpace = await seedViaPage(sharedPage, 'POST', '/api/my-space', {
      name: 'E2E-search-recipe-' + Date.now(),
      template: 'recipe',
    });
    recipeSpaceId = recipeSpace.id;
    await seedViaPage(sharedPage, 'POST', `/api/my-space/${recipeSpaceId}/recipes`, {
      name: '스프링 채소 샐러드',
      category: '양식',
      difficulty: 'easy',
      description: '스프링 시즌 채소로 만드는 샐러드',
      ingredients: [{ name: '양상추', amount: '1개' }],
      steps: [{ order: 1, text: '채소를 씻는다.' }],
    });

    // Seed freeform note space + note
    const noteSpace = await seedViaPage(sharedPage, 'POST', '/api/my-space', {
      name: 'E2E-search-note-' + Date.now(),
      template: 'freeform',
    });
    noteSpaceId = noteSpace.id;
    await seedViaPage(sharedPage, 'POST', `/api/my-space/${noteSpaceId}/notes`, {
      title: '마크다운 메모',
      body: '**spring** 정리 내용입니다.',
      pinned: false,
    });
  });

  test.afterAll(async () => {
    if (sharedPage) await sharedPage.context().close();
  });

  // -------------------------------------------------------------------------
  // Test 1: Search bar + Korean "스프" → diary matches, recipe matches, note no match
  // -------------------------------------------------------------------------
  test('Korean keyword "스프" → diary 1+, recipe 1+, note 0; click recipe navigates', async () => {
    const errors = attachErrorCollectors(sharedPage);

    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-search-input', { state: 'visible' });

    const searchInput = sharedPage.locator('#ms-search-input');
    await searchInput.fill('스프');
    await sharedPage.waitForTimeout(500);

    const resultsPanel = sharedPage.locator('#ms-search-results');
    await expect(resultsPanel).toBeVisible();

    // Diary group header should be visible (at least 1 result)
    const diaryHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '일기' });
    await expect(diaryHeader).toBeVisible();

    // Recipe group header should be visible (at least 1 result)
    const recipeHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '레시피' });
    await expect(recipeHeader).toBeVisible();

    // Note group should NOT be visible (note body has "spring" not "스프")
    const noteHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '노트' });
    await expect(noteHeader).not.toBeVisible();

    // Click the recipe card for our seeded recipe
    const recipeCard = resultsPanel.locator('.ms-search-card').filter({ hasText: '스프링 채소 샐러드' }).first();
    await expect(recipeCard).toBeVisible();
    await recipeCard.click();

    await sharedPage.waitForURL((url) => url.pathname.includes('/my-space/recipes/'), { timeout: 10_000 });
    expect(sharedPage.url()).toMatch(/\/my-space\/recipes\/\d+/);

    assertNoErrors(errors, 'Korean keyword search');
  });

  // -------------------------------------------------------------------------
  // Test 2: English "spring" → note matches, recipe does not (Korean name)
  // -------------------------------------------------------------------------
  test('English keyword "spring" → note visible; recipe not visible (Korean name)', async () => {
    const errors = attachErrorCollectors(sharedPage);

    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-search-input', { state: 'visible' });

    const searchInput = sharedPage.locator('#ms-search-input');
    await searchInput.fill('spring');
    await sharedPage.waitForTimeout(500);

    const resultsPanel = sharedPage.locator('#ms-search-results');
    await expect(resultsPanel).toBeVisible();

    // Note body has "**spring** 정리" → should match
    const noteHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '노트' });
    await expect(noteHeader).toBeVisible();

    // Recipe name "스프링 채소 샐러드" is Korean — no ASCII "spring" match
    const recipeHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '레시피' });
    await expect(recipeHeader).not.toBeVisible();

    assertNoErrors(errors, 'English keyword search');
  });

  // -------------------------------------------------------------------------
  // Test 3: Clear search → results hidden, main content visible
  // -------------------------------------------------------------------------
  test('Clear search → results panel hidden, main content visible', async () => {
    const errors = attachErrorCollectors(sharedPage);

    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-search-input', { state: 'visible' });

    const searchInput = sharedPage.locator('#ms-search-input');
    const resultsPanel = sharedPage.locator('#ms-search-results');
    const mainContent = sharedPage.locator('#ms-main-content');

    await searchInput.fill('스프');
    await sharedPage.waitForTimeout(500);
    await expect(resultsPanel).toBeVisible();
    await expect(mainContent).toBeHidden();

    // Clear
    await searchInput.fill('');
    await sharedPage.waitForTimeout(100);

    await expect(resultsPanel).toBeHidden();
    await expect(mainContent).toBeVisible();

    assertNoErrors(errors, 'Clear search');
  });

  // -------------------------------------------------------------------------
  // Test 4: No results → "검색 결과 없음"
  // -------------------------------------------------------------------------
  test('No matching results → "검색 결과 없음" message visible', async () => {
    const errors = attachErrorCollectors(sharedPage);

    await sharedPage.goto('/my-space');
    await sharedPage.waitForSelector('#ms-search-input', { state: 'visible' });

    const searchInput = sharedPage.locator('#ms-search-input');
    await searchInput.fill('absolutely-nothing-zzzz');
    await sharedPage.waitForTimeout(500);

    const resultsPanel = sharedPage.locator('#ms-search-results');
    await expect(resultsPanel).toBeVisible();

    const emptyMsg = resultsPanel.locator('.ms-search-empty');
    await expect(emptyMsg).toBeVisible();
    await expect(emptyMsg).toContainText('검색 결과 없음');

    assertNoErrors(errors, 'No results');
  });
});

// ---------------------------------------------------------------------------
// Cross-user isolation — separate describe with USER_B fresh page
// ---------------------------------------------------------------------------
test.describe('My Space — Phase 3.2 Unified Search (cross-user isolation)', () => {
  test.setTimeout(60_000);

  test('USER_B searches "스프" → empty results (no cross-user data leak)', async ({ page }) => {
    const errors = attachErrorCollectors(page);

    // Register USER_B (idempotent)
    await page.request.post('/api/auth/register', {
      data: { email: QA_EMAIL_B, password: QA_PASSWORD_B },
      failOnStatusCode: false,
    });

    // Login as USER_B via API (1 request, no UI form)
    await loginViaApi(page, QA_EMAIL_B, QA_PASSWORD_B);

    await page.goto('/my-space');
    await page.waitForSelector('#ms-search-input', { state: 'visible', timeout: 15_000 });

    const searchInput = page.locator('#ms-search-input');
    await searchInput.fill('스프');
    await page.waitForTimeout(500);

    const resultsPanel = page.locator('#ms-search-results');
    await expect(resultsPanel).toBeVisible();

    // USER_B has no content → should show empty message
    const emptyMsg = resultsPanel.locator('.ms-search-empty');
    await expect(emptyMsg).toBeVisible();
    await expect(emptyMsg).toContainText('검색 결과 없음');

    // No group headers from USER_A's data
    const diaryHeader = resultsPanel.locator('.ms-search-group__header', { hasText: '일기' });
    await expect(diaryHeader).not.toBeVisible();

    assertNoErrors(errors, 'Cross-user isolation');
  });
});
