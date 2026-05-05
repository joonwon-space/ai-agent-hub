/**
 * my-space.spec.js — Phase 1 happy path E2E for /my-space.
 *
 * Covers:
 *   - Sidebar Personal/My Space entry from home (regression: jira agent links still clickable)
 *   - Empty-state onboarding (template card → name → POST)
 *   - Diary editor → autosave → "저장됨 ✓" indicator
 *   - List refresh shows the new entry
 *
 * Console + page errors are captured throughout and asserted to be empty.
 *
 * Auth strategy:
 *   - QA_EMAIL/QA_PASSWORD env vars override; otherwise falls back to a
 *     test-local user we register through the public /api/auth/register
 *     endpoint. This keeps the spec self-contained on a fresh DB.
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke1@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

async function ensureUser(baseURL) {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/auth/register', {
    data: { email: QA_EMAIL, password: QA_PASSWORD },
    failOnStatusCode: false,
  });
  // 200/201 = created. 4xx (e.g., already-exists) is fine — login will still work.
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
  const errors = { console: [], pageerror: [], requestfailed: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.console.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.pageerror.push(err.message);
  });
  page.on('requestfailed', (req) => {
    // ignore favicon and chrome extension noise
    const url = req.url();
    if (url.includes('favicon') || url.startsWith('chrome-extension://')) return;
    errors.requestfailed.push(`${req.failure()?.errorText || ''} ${req.method()} ${url}`);
  });
  return errors;
}

function assertNoErrors(errors, label) {
  const all = [
    ...errors.console.map((m) => `[console] ${m}`),
    ...errors.pageerror.map((m) => `[pageerror] ${m}`),
    ...errors.requestfailed.map((m) => `[netfail] ${m}`),
  ];
  expect(all, `${label} — expected zero console/page/network errors`).toEqual([]);
}

test.describe('My Space — Phase 1 happy path', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL || 'http://localhost');
  });

  test('sidebar entry from home → My Space onboarding flow → diary autosave → list', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    // 1. Login → land directly on /my-space (Jira-as-template integration)
    await loginUI(page);
    await expect(page).toHaveURL(/\/my-space\/?$/);
    await page.waitForSelector('#ms-main', { state: 'visible' });

    // 5. Either onboarding (no spaces) or dashboard (already has space)
    const onboarding = page.locator('.ms-onboarding');
    const dashboard = page.locator('.ms-dashboard');
    const isOnboarding = await onboarding.count() > 0;
    const isDashboard  = await dashboard.count() > 0;
    expect(isOnboarding || isDashboard, 'expected onboarding OR dashboard view').toBeTruthy();

    if (isOnboarding) {
      // Pick the diary template
      const diaryCard = page.locator('.ms-template-grid >> text=일기장').first();
      await expect(diaryCard).toBeVisible();
      await diaryCard.click();

      // Name input → submit
      const nameInput = page.locator('#space-name-input');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('내 일기');
      await page.locator('button:has-text("만들기")').click();

      // Page reloads; wait for dashboard
      await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 10000 });
    }

    // 6. From dashboard, click "+ 새로 작성"
    const newBtn = page.locator('a.btn-primary:has-text("새로 작성")');
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await page.waitForURL('**/my-space/diary/new**');

    // 7. Fill diary form
    await page.waitForSelector('#entry-body', { state: 'visible' });
    const titleInput = page.locator('#entry-title');
    const bodyArea = page.locator('#entry-body');

    const stamp = `playwright-${Date.now()}`;
    const diaryTitle = `E2E ${stamp}`;
    await titleInput.fill(diaryTitle);
    // Trigger autosave on title and body
    await bodyArea.fill(`hello from ${stamp}`);

    // 8. Wait for the autosave indicator to land on "저장됨 ✓"
    const indicator = page.locator('#save-indicator');
    await expect(indicator).toHaveText(/저장됨/, { timeout: 8000 });

    // Wait the briefing-specified 700ms grace after final input
    await page.waitForTimeout(700);

    // Confirm the URL was updated to the persisted entry id (POST → PATCH transition)
    await expect.poll(
      () => page.url(),
      { message: 'URL should update to /my-space/diary/<id> after first save', timeout: 6000 },
    ).toMatch(/\/my-space\/diary\/\d+/);

    // 9. Back to /my-space → list contains our title
    await page.locator('#btn-back').click();
    await page.waitForURL('**/my-space');
    await page.waitForSelector('.ms-diary-list, .ms-empty', { state: 'visible' });

    const list = page.locator('.ms-diary-list');
    await expect(list).toBeVisible();
    await expect(list.locator(`text=${diaryTitle}`)).toBeVisible();

    // 10. Screenshot for the report
    await page.screenshot({
      path: `screenshots/my-space-happy-path-${testInfo.workerIndex}.png`,
      fullPage: true,
    });

    // 11. Assert no console/page/network errors anywhere in the flow
    assertNoErrors(errors, 'My Space happy path');
  });

  test('home regression — / redirects to /my-space and outer agent sidebar is gone', async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await loginUI(page);
    // After Jira-as-template integration: login lands on /my-space directly.
    await expect(page).toHaveURL(/\/my-space\/?$/);
    // Outer global sidebar (#sidebar with agent-list) was removed.
    const outerSidebar = await page.locator('aside#sidebar').count();
    expect(outerSidebar, 'outer #sidebar must be removed from /my-space').toBe(0);
    // / should 302 to /my-space
    const resp = await page.context().request.get('/', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toMatch(/\/my-space/);
    assertNoErrors(errors, 'Home redirect regression');
  });
});
