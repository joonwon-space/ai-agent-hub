/**
 * my-space-a11y.spec.js — Accessibility audit spec for Phase 3.4.
 *
 * Covers 5 core pages × 3 viewports × 2 themes = 30 audit calls.
 * Fails on critical/serious axe violations (WCAG 2.0/2.1 A/AA).
 * Moderate/minor violations are collected and written to qa/a11y-report.md.
 *
 * Pages tested:
 *   1. /login
 *   2. /my-space (onboarding — fresh user / no spaces)
 *   3. /my-space (dashboard — after creating a diary space)
 *   4. /my-space/diary/new?spaceId=X
 *   5. /my-space/notes/new?spaceId=X
 *
 * Viewports: desktop 1280×800, tablet 768×1024, mobile 360×740
 * Themes: dark (default), light
 */

const { test, expect, request } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { auditA11y } = require('./a11y');

// ---------------------------------------------------------------------------
// Auth helpers (same pattern as existing specs)
// ---------------------------------------------------------------------------

const A11Y_EMAIL    = process.env.A11Y_EMAIL    || process.env.QA_EMAIL    || 'a11y1@test.local';
const A11Y_PASSWORD = process.env.A11Y_PASSWORD || process.env.QA_PASSWORD || 'Pass1234!';

async function ensureUser(baseURL) {
  const ctx = await request.newContext({ baseURL });
  await ctx.post('/api/auth/register', {
    data: { email: A11Y_EMAIL, password: A11Y_PASSWORD },
    failOnStatusCode: false,
  });
  await ctx.dispose();
}

async function loginUI(page, baseURL) {
  await page.goto('/login');
  await page.waitForSelector('#email', { state: 'visible' });
  await page.fill('#email', A11Y_EMAIL);
  await page.fill('#password', A11Y_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 }),
    page.click('#submit-btn'),
  ]);
}

// ---------------------------------------------------------------------------
// Theme helper
// ---------------------------------------------------------------------------

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('aah-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  // Small wait for any CSS transitions to settle
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// Viewport definitions
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { label: '1280', width: 1280, height: 800 },
  { label: '768',  width: 768,  height: 1024 },
  { label: '360',  width: 360,  height: 740 },
];

const THEMES = ['dark', 'light'];

// ---------------------------------------------------------------------------
// Violation collector (for report)
// ---------------------------------------------------------------------------

const allViolations = []; // { page, viewport, theme, violations[] }

function collectModerateMinor(pageLabel, viewportLabel, theme, violations) {
  const filtered = violations.filter(
    (v) => !['critical', 'serious'].includes(v.impact),
  );
  if (filtered.length > 0) {
    allViolations.push({ page: pageLabel, viewport: viewportLabel, theme, violations: filtered });
  }
}

// ---------------------------------------------------------------------------
// Report writer (runs after all tests)
// ---------------------------------------------------------------------------

test.afterAll(async () => {
  const reportPath = path.join(__dirname, 'a11y-report.md');
  const lines = [
    '# Phase 3.4 a11y Report',
    '',
    `_Generated: ${new Date().toISOString().slice(0, 10)}_`,
    '',
  ];

  const moderate = allViolations.flatMap((entry) =>
    entry.violations
      .filter((v) => v.impact === 'moderate')
      .map(
        (v) =>
          `- [${entry.page}-${entry.viewport}-${entry.theme}] ${v.id}: ${v.help} (${v.nodes.length})`,
      ),
  );

  const minor = allViolations.flatMap((entry) =>
    entry.violations
      .filter((v) => v.impact === 'minor')
      .map(
        (v) =>
          `- [${entry.page}-${entry.viewport}-${entry.theme}] ${v.id}: ${v.help} (${v.nodes.length})`,
      ),
  );

  lines.push('## moderate violations');
  if (moderate.length === 0) {
    lines.push('_none_');
  } else {
    lines.push(...moderate);
  }

  lines.push('');
  lines.push('## minor violations');
  if (minor.length === 0) {
    lines.push('_none_');
  } else {
    lines.push(...minor);
  }

  lines.push('');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
});

// ---------------------------------------------------------------------------
// Helper: run audit for a page across all viewport × theme combos
// ---------------------------------------------------------------------------

async function auditAcrossViewportsAndThemes(page, navigateFn, pageLabel) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const theme of THEMES) {
      await navigateFn(page);
      await setTheme(page, theme);

      const label = `${pageLabel}-${vp.label}-${theme}`;
      const result = await auditA11y(page, label);
      collectModerateMinor(pageLabel, vp.label, theme, result.violations);
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('My Space — a11y audit (Phase 3.4)', () => {
  test.beforeAll(async ({ baseURL }) => {
    await ensureUser(baseURL || 'http://localhost');
  });

  // Run tests serially to keep state predictable
  test.describe.configure({ mode: 'serial' });

  // -------------------------------------------------------------------------
  // 1. Login page
  // -------------------------------------------------------------------------
  test.describe('Page: /login', () => {
    test('audit across 3 viewports × 2 themes', async ({ page }) => {
      test.setTimeout(120_000);

      await auditAcrossViewportsAndThemes(
        page,
        async (p) => {
          await p.goto('/login');
          await p.waitForSelector('#email', { state: 'visible' });
        },
        'login',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. /my-space onboarding (no spaces created yet)
  //    We use a dedicated onboarding user to guarantee fresh state.
  // -------------------------------------------------------------------------
  test.describe('Page: /my-space (onboarding)', () => {
    const ONBOARD_EMAIL    = process.env.ONBOARD_EMAIL    || 'a11y-onboard@test.local';
    const ONBOARD_PASSWORD = process.env.ONBOARD_PASSWORD || 'Pass1234!';

    test.beforeAll(async ({ baseURL }) => {
      const ctx = await request.newContext({ baseURL });
      await ctx.post('/api/auth/register', {
        data: { email: ONBOARD_EMAIL, password: ONBOARD_PASSWORD },
        failOnStatusCode: false,
      });
      await ctx.dispose();
    });

    test('audit across 3 viewports × 2 themes', async ({ page }) => {
      test.setTimeout(120_000);

      // Log in as the onboarding user
      await page.goto('/login');
      await page.waitForSelector('#email', { state: 'visible' });
      await page.fill('#email', ONBOARD_EMAIL);
      await page.fill('#password', ONBOARD_PASSWORD);
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 }),
        page.click('#submit-btn'),
      ]);

      await auditAcrossViewportsAndThemes(
        page,
        async (p) => {
          await p.goto('/my-space');
          // Wait for onboarding template cards to appear
          await p.waitForSelector('.ms-onboarding, .ms-template-grid, #ms-main', {
            timeout: 15000,
          });
          await p.waitForTimeout(500);
        },
        'my-space-onboarding',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3–5. Dashboard + diary/new + notes/new — use shared a11y user
  //      who creates a diary space once.
  // -------------------------------------------------------------------------
  test.describe('Pages: dashboard + diary/new + notes/new', () => {
    let diarySpaceId = null;
    let freeformSpaceId = null;

    test.beforeAll(async ({ baseURL, page }) => {
      await loginUI(page, baseURL);

      // Navigate to my-space and create a diary space if needed
      await page.goto('/my-space');
      await page.waitForSelector('#ms-main', { timeout: 15000 });
      await page.waitForTimeout(800);

      const pageContent = await page.content();

      // Check if we're on onboarding (no spaces yet) or dashboard
      if (pageContent.includes('ms-template-grid') || pageContent.includes('ms-onboarding')) {
        // Click diary template card
        const diaryCard = page.locator('.template-card--diary, [data-type="diary"]').first();
        if (await diaryCard.isVisible()) {
          await diaryCard.click();
          await page.waitForTimeout(500);
          // Fill in space name
          const nameInput = page.locator('.ms-new-space-form__input, input[placeholder*="이름"], input[type="text"]').first();
          if (await nameInput.isVisible()) {
            await nameInput.fill('A11Y Test Space');
            await nameInput.press('Enter');
            await page.waitForTimeout(1000);
          }
        }
      }

      // Get spaceId from URL or from sidebar
      const url = page.url();
      const match = url.match(/spaceId=([^&]+)/);
      if (match) {
        diarySpaceId = match[1];
      } else {
        // Try to get it from the sidebar item
        const sidebarItem = page.locator('.ms-inner-sidebar__item').first();
        if (await sidebarItem.isVisible()) {
          await sidebarItem.click();
          await page.waitForTimeout(500);
          const newUrl = page.url();
          const m = newUrl.match(/spaceId=([^&]+)/);
          if (m) diarySpaceId = m[1];
        }
      }

      // Try to also set up a freeform space for notes
      // For simplicity, use the same spaceId or try the freeform template
      freeformSpaceId = diarySpaceId;
    });

    // -----------------------------------------------------------------------
    // 3. Dashboard page
    // -----------------------------------------------------------------------
    test('dashboard: audit across 3 viewports × 2 themes', async ({ page }) => {
      test.setTimeout(120_000);

      await loginUI(page);

      await auditAcrossViewportsAndThemes(
        page,
        async (p) => {
          await p.goto('/my-space');
          await p.waitForSelector('#ms-main', { timeout: 15000 });
          await p.waitForTimeout(600);
        },
        'my-space-dashboard',
      );
    });

    // -----------------------------------------------------------------------
    // 4. Diary new entry page
    // -----------------------------------------------------------------------
    test('diary/new: audit across 3 viewports × 2 themes', async ({ page }) => {
      test.setTimeout(120_000);

      await loginUI(page);

      const spaceId = diarySpaceId;

      await auditAcrossViewportsAndThemes(
        page,
        async (p) => {
          if (spaceId) {
            await p.goto(`/my-space/diary/new?spaceId=${spaceId}`);
          } else {
            await p.goto('/my-space/diary/new');
          }
          await p.waitForSelector('.diary-edit-topbar, #diary-edit-main, body', {
            timeout: 15000,
          });
          await p.waitForTimeout(400);
        },
        'diary-new',
      );
    });

    // -----------------------------------------------------------------------
    // 5. Notes new entry page
    // -----------------------------------------------------------------------
    test('notes/new: audit across 3 viewports × 2 themes', async ({ page }) => {
      test.setTimeout(120_000);

      await loginUI(page);

      const spaceId = freeformSpaceId;

      await auditAcrossViewportsAndThemes(
        page,
        async (p) => {
          if (spaceId) {
            await p.goto(`/my-space/notes/new?spaceId=${spaceId}`);
          } else {
            await p.goto('/my-space/notes/new');
          }
          await p.waitForSelector('.note-edit-topbar, .note-edit-main, body', {
            timeout: 15000,
          });
          await p.waitForTimeout(400);
        },
        'notes-new',
      );
    });
  });
});
