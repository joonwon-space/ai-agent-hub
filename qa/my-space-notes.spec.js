/**
 * my-space-notes.spec.js — Phase 2 happy path E2E for FreeformNote flow.
 *
 * Covers:
 *   - Login → My Space → 자유 형식 template card → space "메모장" → create
 *   - Dashboard → "+ 새로 작성" → edit page
 *   - Title "테스트 노트" + rich markdown body
 *   - Preview renders: h1, strong, em, code, ul/li elements correctly
 *   - Wait 700ms → "저장됨 ✓" indicator
 *   - Pin toggle → return to list → pinned section has the note
 *   - XSS regression: <script> injection → plain text only (window.__pwned undefined)
 *   - Link sanitization: javascript: URL → no <a> rendered, text "click" visible
 *   - Console errors and pageerrors must be 0 throughout
 *
 * Auth strategy:
 *   QA_EMAIL/QA_PASSWORD env vars override; otherwise falls back to
 *   a test-local user registered through /api/auth/register.
 *
 * DO NOT modify qa/my-space.spec.js (Phase 1) or qa/my-space-recipes.spec.js (Phase 1.5).
 */

const { test, expect, request } = require('@playwright/test');

const QA_EMAIL    = process.env.QA_EMAIL    || 'smoke-notes1@test.local';
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

async function loginViaUI(page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', QA_EMAIL);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/my-space', { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Main happy path
// ---------------------------------------------------------------------------

test.describe('My Space — Phase 2 FreeformNote', () => {
  let consoleErrors = [];
  let pageErrors = [];

  test.beforeEach(async ({ page, baseURL }) => {
    consoleErrors = [];
    pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    await ensureUser(baseURL);
    await loginViaUI(page);
  });

  test('full note flow: create space → write note → preview → autosave → pin → list', async ({ page }) => {
    // -----------------------------------------------------------------------
    // Step 1: Create a freeform space named "메모장"
    // -----------------------------------------------------------------------
    await page.waitForSelector('#ms-main', { timeout: 8000 });

    // Look for the freeform (자유 형식) template card
    const freeformCard = page.locator('.template-card', { hasText: '자유 형식' });
    await expect(freeformCard).toBeVisible({ timeout: 5000 });
    await freeformCard.click();

    // Fill space name
    const nameInput = page.locator('#space-name-input');
    await nameInput.fill('메모장');

    // Confirm creation
    const createBtn = page.locator('button', { hasText: '만들기' }).or(
      page.locator('button[type="submit"]')
    );
    await createBtn.click();

    // Wait for dashboard to load with new space
    await page.waitForSelector('.ms-pane__header', { timeout: 8000 });

    // -----------------------------------------------------------------------
    // Step 2: Click "+ 새로 작성" from dashboard (or navigate via button)
    // -----------------------------------------------------------------------
    const newNoteBtn = page.locator('a', { hasText: '+ 새로 작성' });
    await expect(newNoteBtn).toBeVisible({ timeout: 5000 });
    await newNoteBtn.click();

    // Should navigate to note edit page
    await page.waitForURL('**/my-space/notes/**', { timeout: 8000 });

    // -----------------------------------------------------------------------
    // Step 3: Fill title and body
    // -----------------------------------------------------------------------
    await page.fill('#note-title-input', '테스트 노트');

    const markdownBody = [
      '# 헤더',
      '',
      '**굵게** *기울임* `코드`',
      '',
      '- 항목1',
      '- 항목2',
    ].join('\n');

    const textarea = page.locator('#note-editor');
    await textarea.fill(markdownBody);

    // -----------------------------------------------------------------------
    // Step 4: Wait for preview to update and assert DOM structure
    // -----------------------------------------------------------------------
    const preview = page.locator('.preview, #note-preview');

    await expect(preview.locator('h1')).toContainText('헤더', { timeout: 3000 });
    await expect(preview.locator('strong')).toContainText('굵게');
    await expect(preview.locator('em')).toContainText('기울임');
    await expect(preview.locator('code')).toContainText('코드');
    await expect(preview.locator('ul > li').first()).toContainText('항목1');
    await expect(preview.locator('ul > li').nth(1)).toContainText('항목2');

    // -----------------------------------------------------------------------
    // Step 5: Wait for autosave (700ms debounce + save)
    // -----------------------------------------------------------------------
    await page.waitForTimeout(700);
    const saveIndicator = page.locator('#save-indicator');
    await expect(saveIndicator).toContainText('저장됨', { timeout: 5000 });

    // -----------------------------------------------------------------------
    // Step 6: Pin toggle
    // -----------------------------------------------------------------------
    const pinBtn = page.locator('#btn-pin');
    await expect(pinBtn).toBeVisible();
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');

    // -----------------------------------------------------------------------
    // Step 7: Navigate back to note list and verify pinned section has note
    // -----------------------------------------------------------------------
    const params = new URL(page.url()).searchParams;
    const spaceId = params.get('spaceId');
    await page.goto(`/my-space/notes?spaceId=${spaceId}`);
    await page.waitForSelector('.note-section', { timeout: 8000 });

    const pinnedSection = page.locator('.note-section', { hasText: '📌 고정' });
    await expect(pinnedSection).toBeVisible({ timeout: 5000 });
    await expect(pinnedSection.locator('.note-card')).toContainText('테스트 노트');

    // -----------------------------------------------------------------------
    // Step 8: Assert no console/pageerrors so far
    // -----------------------------------------------------------------------
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // XSS regression: <script> injection
  // -------------------------------------------------------------------------
  test('XSS regression: script tag renders as plain text, window.__pwned undefined', async ({ page }) => {
    await page.waitForSelector('#ms-main', { timeout: 8000 });

    // Create a freeform space (or reuse existing if already created)
    const freeformCard = page.locator('.template-card', { hasText: '자유 형식' });
    const dashboardExists = await page.locator('.ms-pane__header').isVisible().catch(() => false);

    if (!dashboardExists) {
      await expect(freeformCard).toBeVisible({ timeout: 5000 });
      await freeformCard.click();
      const nameInput = page.locator('#space-name-input');
      await nameInput.fill('XSS 테스트');
      const createBtn = page.locator('button', { hasText: '만들기' }).or(
        page.locator('button[type="submit"]')
      );
      await createBtn.click();
      await page.waitForSelector('.ms-pane__header', { timeout: 8000 });
    }

    // Navigate to new note
    const newNoteLink = page.locator('a', { hasText: '+ 새로 작성' });
    await expect(newNoteLink).toBeVisible({ timeout: 5000 });
    await newNoteLink.click();
    await page.waitForURL('**/my-space/notes/**', { timeout: 8000 });

    // Fill title
    await page.fill('#note-title-input', 'XSS 테스트');

    // Inject script tag in body
    const textarea = page.locator('#note-editor');
    await textarea.fill('<script>window.__pwned=1</script>');

    // Wait for preview update
    await page.waitForTimeout(200);

    // Assert __pwned is NOT set (XSS blocked)
    const pwned = await page.evaluate(() => window.__pwned);
    expect(pwned).toBeUndefined();

    // Assert the text appears as plain text in preview, not as DOM script element
    const preview = page.locator('.preview, #note-preview');
    const scriptElements = preview.locator('script');
    await expect(scriptElements).toHaveCount(0);

    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Link sanitization regression: javascript: URL → no <a>
  // -------------------------------------------------------------------------
  test('link sanitization: javascript: URL renders text only, no <a> element', async ({ page }) => {
    await page.waitForSelector('#ms-main', { timeout: 8000 });

    // Ensure we have a dashboard with freeform space
    const dashboardExists = await page.locator('.ms-pane__header').isVisible().catch(() => false);
    if (!dashboardExists) {
      const freeformCard = page.locator('.template-card', { hasText: '자유 형식' });
      await expect(freeformCard).toBeVisible({ timeout: 5000 });
      await freeformCard.click();
      const nameInput = page.locator('#space-name-input');
      await nameInput.fill('링크 테스트');
      const createBtn = page.locator('button', { hasText: '만들기' }).or(
        page.locator('button[type="submit"]')
      );
      await createBtn.click();
      await page.waitForSelector('.ms-pane__header', { timeout: 8000 });
    }

    // Navigate to new note
    const newNoteLink = page.locator('a', { hasText: '+ 새로 작성' });
    await expect(newNoteLink).toBeVisible({ timeout: 5000 });
    await newNoteLink.click();
    await page.waitForURL('**/my-space/notes/**', { timeout: 8000 });

    await page.fill('#note-title-input', '링크 테스트');

    const textarea = page.locator('#note-editor');
    await textarea.fill('[click](javascript:alert(1))');

    // Wait for preview update
    await page.waitForTimeout(200);

    const preview = page.locator('.preview, #note-preview');

    // Assert no <a> elements in preview
    const anchorCount = await preview.locator('a').count();
    expect(anchorCount).toBe(0);

    // Assert "click" text is visible as plain text
    await expect(preview).toContainText('click');

    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });
});
