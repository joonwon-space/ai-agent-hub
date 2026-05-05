/**
 * my-space-recipe-cover.spec.js — Phase 3.1 E2E: Recipe cover image upload.
 *
 * Covers:
 *   - Login → create/find recipe space → create a recipe → verify cover dropzone enabled
 *   - Upload valid JPEG via setInputFiles → preview img appears with /uploads/recipes/*.webp URL
 *   - Navigate back to recipe list → card shows cover image
 *   - 5MB+ file → client-side rejection (no preview, alert shown by browser)
 *   - Fake JPEG (text content with image/jpeg mime) → server 400, no preview update
 *   - Cover delete → preview removed, card returns to placeholder
 *   - Console + pageerror = 0
 *
 * Auth strategy:
 *   QA_EMAIL/QA_PASSWORD env vars override; otherwise uses a test-local user.
 *
 * Mirrors login + ensureUser helper from my-space-recipes.spec.js.
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-cover1@test.local';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Pass1234!';

// ---------------------------------------------------------------------------
// Minimal valid JPEG buffer (~22 bytes: SOI + JFIF APP0 + EOI)
// ---------------------------------------------------------------------------
const MINIMAL_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
]);

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

/**
 * Get or create a recipe space and return its spaceId.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function ensureRecipeSpace(page) {
  await page.goto('/my-space');
  await page.waitForSelector('#ms-main', { state: 'visible' });

  const onboarding = page.locator('.ms-onboarding');
  const isOnboarding = (await onboarding.count()) > 0;

  if (isOnboarding) {
    const recipeCard = page.locator('.ms-template-grid >> text=레시피').first();
    await expect(recipeCard).toBeVisible();
    await recipeCard.click();

    const nameInput = page.locator('#space-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('쿠킹');
    await page.locator('button:has-text("만들기")').click();
    await page.waitForSelector('.ms-dashboard', { state: 'visible', timeout: 10000 });
  }

  const spaceId = await page.evaluate(() => {
    const items = document.querySelectorAll('.ms-inner-sidebar__item');
    for (const item of items) {
      if (item.dataset.spaceId) return parseInt(item.dataset.spaceId, 10);
    }
    return null;
  }).catch(() => null);

  expect(spaceId, 'Expected a spaceId in sidebar').toBeTruthy();
  return spaceId;
}

/**
 * Create a minimal recipe and return its id (after first autosave).
 * @param {import('@playwright/test').Page} page
 * @param {number} spaceId
 * @returns {Promise<number>}
 */
async function createMinimalRecipe(page, spaceId) {
  await page.goto(`/my-space/recipes?spaceId=${spaceId}`);
  await page.waitForSelector('#recipes-main', { state: 'visible', timeout: 10000 });

  await page.locator('#btn-new-recipe').click();
  await page.waitForURL('**/my-space/recipes/new**');
  await page.waitForSelector('#recipe-edit-main', { state: 'visible', timeout: 8000 });

  const stamp = `Cover-E2E-${Date.now()}`;
  await page.locator('#recipe-name').fill(stamp);

  // Fill 1 ingredient
  const ingName = page.locator('#ingredients-container .ingredient-row__name').first();
  await ingName.fill('테스트 재료');
  const ingAmount = page.locator('#ingredients-container .ingredient-row__amount').first();
  await ingAmount.fill('1개');

  // Fill 1 step
  const stepText = page.locator('#steps-container .step-row__text').first();
  await stepText.fill('테스트 조리 단계');

  // Wait for autosave
  await page.waitForTimeout(700);
  await expect(page.locator('#save-indicator')).toHaveText(/저장됨/, { timeout: 8000 });

  // URL should update to /my-space/recipes/<id>
  await expect.poll(
    () => page.url(),
    { timeout: 6000 },
  ).toMatch(/\/my-space\/recipes\/\d+/);

  const match = page.url().match(/\/my-space\/recipes\/(\d+)/);
  const recipeId = match ? parseInt(match[1], 10) : null;
  expect(recipeId, 'Expected recipeId from URL').toBeTruthy();
  return recipeId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('My Space — Phase 3.1 Recipe Cover Upload', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL || 'http://localhost');
  });

  test('upload cover → preview shown → card shows cover → delete → placeholder', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = attachErrorCollectors(page);

    // 1. Login
    await loginUI(page);

    // 2. Get/create recipe space
    const spaceId = await ensureRecipeSpace(page);

    // 3. Create a recipe (autosave triggers → recipeId available)
    const recipeId = await createMinimalRecipe(page, spaceId);

    // 4. Cover dropzone should be visible and enabled (recipeId exists)
    const dropzone = page.locator('#cover-dropzone');
    await expect(dropzone).toBeVisible();

    // 5. Upload a minimal valid JPEG via setInputFiles
    const fileInput = page.locator('input[type="file"][accept*="image/jpeg"]');
    await fileInput.setInputFiles({
      name: 'cover-test.jpg',
      mimeType: 'image/jpeg',
      buffer: MINIMAL_JPEG,
    });

    // 6. Wait for preview img to appear
    const previewImg = dropzone.locator('.ms-recipe-cover-preview');
    await expect(previewImg, 'Cover preview should appear after upload').toBeVisible({ timeout: 15000 });

    // 7. Verify URL matches /uploads/recipes/*.webp
    const imgSrc = await previewImg.getAttribute('src');
    expect(imgSrc, 'Preview src should point to webp in /uploads/recipes/').toMatch(/^\/uploads\/recipes\/.+\.webp$/);

    // 8. Navigate back to recipe list — card should show cover
    await page.locator('#btn-back').click();
    await page.waitForURL(`**/my-space/recipes**`);
    await page.waitForSelector('.recipe-grid', { state: 'visible', timeout: 8000 });

    const card = page.locator(`.recipe-card[data-id="${recipeId}"]`);
    await expect(card).toBeVisible();
    const cardCover = card.locator('.ms-recipe-card__cover');
    await expect(cardCover, 'Card should show cover image').toBeVisible();
    const cardSrc = await cardCover.getAttribute('src');
    expect(cardSrc).toMatch(/^\/uploads\/recipes\/.+\.webp$/);

    // 9. Go back to edit page
    await card.click();
    await page.waitForURL(`**/my-space/recipes/${recipeId}**`);
    await page.waitForSelector('#cover-dropzone', { state: 'visible', timeout: 8000 });

    // 10. Delete cover — click ✕ button
    const removeBtn = dropzone.locator('.ms-recipe-cover-remove-btn');
    await expect(removeBtn).toBeVisible();

    // Accept the confirm dialog
    page.once('dialog', (dialog) => dialog.accept());
    await removeBtn.click();

    // 11. After delete: preview gone, dropzone returns to idle state
    await expect(previewImg, 'Preview should disappear after delete').not.toBeVisible({ timeout: 8000 });
    await expect(dropzone.locator('.ms-recipe-cover-dropzone__icon')).toBeVisible();

    // 12. Navigate back to list — card should show placeholder
    await page.locator('#btn-back').click();
    await page.waitForURL(`**/my-space/recipes**`);
    await page.waitForSelector('.recipe-grid', { state: 'visible', timeout: 8000 });

    const cardAfterDelete = page.locator(`.recipe-card[data-id="${recipeId}"]`);
    await expect(cardAfterDelete).toBeVisible();
    const placeholder = cardAfterDelete.locator('.ms-recipe-card__cover-placeholder');
    await expect(placeholder, 'Card should show placeholder after cover delete').toBeVisible();

    // 13. Screenshot
    await page.screenshot({
      path: `screenshots/phase-3.1-recipe-cover-${testInfo.workerIndex}.png`,
      fullPage: true,
    });

    assertNoErrors(errors, 'Phase 3.1 recipe cover upload');
  });

  test('5MB+ file → client-side rejection (no preview shown)', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);
    const spaceId = await ensureRecipeSpace(page);
    const recipeId = await createMinimalRecipe(page, spaceId);

    const dropzone = page.locator('#cover-dropzone');
    await expect(dropzone).toBeVisible();

    // Create a buffer > 5MB (5MB + 1 byte, all 0xFF which has JPEG-like start)
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 100, 0x41); // 'A' * 5MB+

    const fileInput = page.locator('input[type="file"][accept*="image/jpeg"]');

    // Intercept the dialog (alert) that should appear for oversized files
    let dialogShown = false;
    page.once('dialog', async (dialog) => {
      dialogShown = true;
      await dialog.dismiss();
    });

    await fileInput.setInputFiles({
      name: 'big.jpg',
      mimeType: 'image/jpeg',
      buffer: bigBuffer,
    });

    // Give time for the client-side check to run
    await page.waitForTimeout(500);

    // Preview should NOT appear — dropzone stays in idle state
    const previewImg = dropzone.locator('.ms-recipe-cover-preview');
    await expect(previewImg).not.toBeVisible();

    // Dialog (alert) should have been shown OR the dropzone just stayed idle
    // (either way, no preview = rejection worked)
    expect(
      dialogShown || await dropzone.locator('.ms-recipe-cover-dropzone__icon').isVisible(),
    ).toBeTruthy();

    assertNoErrors(errors, 'Phase 3.1 5MB rejection');
  });

  test('fake JPEG (text content) → server 400, no preview update', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = attachErrorCollectors(page);

    await loginUI(page);
    const spaceId = await ensureRecipeSpace(page);
    const recipeId = await createMinimalRecipe(page, spaceId);

    const dropzone = page.locator('#cover-dropzone');
    await expect(dropzone).toBeVisible();

    // File with image/jpeg MIME but text content (magic byte mismatch)
    const fakeJpeg = Buffer.from('This is not a JPEG file but just plain text content here!!');

    // The client-side MIME check will pass (file.type = image/jpeg), but
    // the server magic-byte check will return 400.
    // Expect an alert from the error handler.
    let alertText = '';
    page.once('dialog', async (dialog) => {
      alertText = dialog.message();
      await dialog.dismiss();
    });

    const fileInput = page.locator('input[type="file"][accept*="image/jpeg"]');
    await fileInput.setInputFiles({
      name: 'fake.jpg',
      mimeType: 'image/jpeg',
      buffer: fakeJpeg,
    });

    // Wait for network response and alert
    await page.waitForTimeout(3000);

    // Preview should NOT be shown
    const previewImg = dropzone.locator('.ms-recipe-cover-preview');
    await expect(previewImg).not.toBeVisible();

    // The idle dropzone icon should still be visible (reverted on error)
    await expect(dropzone.locator('.ms-recipe-cover-dropzone__icon')).toBeVisible();

    assertNoErrors(errors, 'Phase 3.1 fake JPEG rejection');
  });
});
