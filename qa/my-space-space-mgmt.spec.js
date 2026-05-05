/**
 * my-space-space-mgmt.spec.js — Phase 3.3 E2E for Space rename/delete/new flow.
 *
 * Covers:
 *   - Login → land on /my-space → onboarding visible
 *   - Create diary space "내 일기"
 *   - Hover first space → click ✏️ → inline rename → "리네임된 일기" → Enter → sidebar updated
 *   - Click "+ 새 공간" → onboarding inline (no reload — URL stays /my-space)
 *   - Create recipe space "내 레시피"
 *   - Hover first space → click 🗑️ → modal appears
 *   - Wrong name in modal → delete button disabled
 *   - Correct name → delete button enabled → confirm → space removed from sidebar
 *   - Delete last space → URL stays /my-space → onboarding template grid visible
 *   - Console errors and pageerrors = 0
 *
 * Auth strategy: QA_EMAIL_MGMT / QA_PASSWORD env vars override; otherwise
 * registers a fresh test-local user via /api/auth/register.
 *
 * Mirrors qa/my-space-recipes.spec.js patterns (loginUI + attachErrorCollectors).
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL_MGMT    || `smoke-mgmt-${Date.now()}@test.local`;
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

test.describe('My Space — Phase 3.3 space rename/delete/new flow', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL || 'http://localhost');
  });

  test('full space management flow: create, rename, delete via modal', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = attachErrorCollectors(page);

    // 1. Login
    await loginUI(page);

    // 2. Navigate to /my-space
    await page.goto('/my-space');
    await page.waitForSelector('#ms-main', { state: 'visible' });

    // 3. Onboarding should be visible (fresh user, no spaces)
    const onboarding = page.locator('.ms-onboarding');
    await expect(onboarding).toBeVisible({ timeout: 8000 });

    // 4. Click 일기장 card → fill name "내 일기" → 만들기 → dashboard
    const diaryCard = page.locator('.ms-template-grid >> text=일기장').first();
    await expect(diaryCard).toBeVisible();
    await diaryCard.click();

    const nameInput = page.locator('#space-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('내 일기');
    await page.locator('button:has-text("만들기")').click();

    // Wait for dashboard (no page reload — inline navigation)
    await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 10000 });

    // 5. Hover first space → click ✏️ → input visible → fill "리네임된 일기" → Enter → sidebar updated
    const firstSpaceItem = page.locator('.ms-inner-sidebar__item').first();
    await firstSpaceItem.hover();

    const renameBtn = firstSpaceItem.locator('button[aria-label="rename"], button:has-text("✏️")').first();
    await expect(renameBtn).toBeVisible({ timeout: 5000 });
    await renameBtn.click();

    const renameInput = page.locator('.ms-inner-sidebar__rename-input');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('리네임된 일기');
    await renameInput.press('Enter');

    // Assert sidebar shows new name
    await expect(page.locator('.ms-inner-sidebar').locator('text=리네임된 일기')).toBeVisible({ timeout: 5000 });

    // 6. Click "+ 새 공간" → onboarding inline — URL stays /my-space, no reload
    const newSpaceBtn = page.locator('button:has-text("+ 새 공간")');
    await expect(newSpaceBtn).toBeVisible();

    // Record current URL to verify no navigation
    const urlBefore = page.url();
    await newSpaceBtn.click();

    // Assert URL still ends with /my-space (no reload, inline)
    await expect.poll(() => page.url()).toMatch(/\/my-space$/);
    expect(page.url()).toBe(urlBefore);

    // Onboarding grid should be visible inline
    await expect(page.locator('.ms-onboarding')).toBeVisible({ timeout: 5000 });

    // sessionStorage should NOT have ms-force-onboarding (old hack removed)
    const ssFlag = await page.evaluate(() => sessionStorage.getItem('ms-force-onboarding'));
    expect(ssFlag).toBeNull();

    // 7. Pick recipe template → name "내 레시피" → create → dashboard, recipe space active
    const recipeCard = page.locator('.ms-template-grid >> text=레시피').first();
    await expect(recipeCard).toBeVisible();
    await recipeCard.click();

    const recipeNameInput = page.locator('#space-name-input');
    await expect(recipeNameInput).toBeVisible();
    await recipeNameInput.fill('내 레시피');
    await page.locator('button:has-text("만들기")').click();

    // Dashboard with recipe space active (no reload)
    await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 10000 });

    // Sidebar should now show both spaces
    const sidebarItems = page.locator('.ms-inner-sidebar__item');
    await expect(sidebarItems).toHaveCount(2, { timeout: 5000 });

    // 8. Hover first space (리네임된 일기) → click 🗑️ → modal appears
    const firstItem = page.locator('.ms-inner-sidebar__item').first();
    await firstItem.hover();

    const deleteBtn = firstItem.locator('button[aria-label="delete"], button:has-text("🗑️")').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Modal should appear
    const modal = page.locator('.ms-modal-backdrop');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('.ms-modal-card')).toBeVisible();

    // 9. Type wrong name in modal input → delete button still disabled
    const modalInput = modal.locator('.ms-modal-card__input');
    await expect(modalInput).toBeVisible();
    await modalInput.fill('잘못된 이름');

    const confirmDeleteBtn = modal.locator('.btn-danger');
    await expect(confirmDeleteBtn).toBeDisabled();

    // 10. Type correct name "리네임된 일기" → delete button enabled → click → space removed
    await modalInput.fill('리네임된 일기');
    await expect(confirmDeleteBtn).toBeEnabled({ timeout: 3000 });
    await confirmDeleteBtn.click();

    // Modal should be gone
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Sidebar should now have only 1 space
    await expect(sidebarItems).toHaveCount(1, { timeout: 5000 });

    // 11. Hover remaining space → 🗑️ → type "내 레시피" → confirm → onboarding visible
    const lastItem = page.locator('.ms-inner-sidebar__item').first();
    await lastItem.hover();

    const lastDeleteBtn = lastItem.locator('button[aria-label="delete"], button:has-text("🗑️")').first();
    await expect(lastDeleteBtn).toBeVisible({ timeout: 5000 });
    await lastDeleteBtn.click();

    const modal2 = page.locator('.ms-modal-backdrop');
    await expect(modal2).toBeVisible({ timeout: 5000 });

    const modal2Input = modal2.locator('.ms-modal-card__input');
    await modal2Input.fill('내 레시피');

    const modal2DeleteBtn = modal2.locator('.btn-danger');
    await expect(modal2DeleteBtn).toBeEnabled({ timeout: 3000 });
    await modal2DeleteBtn.click();

    // URL stays on /my-space
    await expect.poll(() => page.url()).toMatch(/\/my-space$/);

    // Onboarding template grid now visible (no spaces left)
    await expect(page.locator('.ms-onboarding')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.ms-template-grid')).toBeVisible();

    // 12. Screenshot
    await page.screenshot({
      path: `screenshots/my-space-space-mgmt-${testInfo.workerIndex}.png`,
      fullPage: true,
    });

    // 13. Assert no errors throughout
    assertNoErrors(errors, 'Space management flow');
  });
});
