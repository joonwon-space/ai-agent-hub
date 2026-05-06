/**
 * Live-site visual QA — https://ai.joonwon.dev
 * Read-only inspection. No code modifications.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://ai.joonwon.dev';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'live-qa');

const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800  },
];

// Pages discovered during the crawl will be added here
const PAGES_TO_CHECK = [
  { path: '/',         label: 'main'   },
];

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// ─── Discover navigation links on the main page ─────────────────────────────
test('discover navigation links', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

  const networkErrors = [];
  page.on('requestfailed', req => networkErrors.push({ url: req.url(), failure: req.failure() }));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Collect all internal hrefs
  const links = await page.evaluate((base) => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(href => href && (href.startsWith('/') || href.startsWith(base)))
      .map(href => href.startsWith('/') ? href : new URL(href).pathname)
      .filter((v, i, arr) => arr.indexOf(v) === i); // unique
  }, BASE_URL);

  console.log('Discovered links:', JSON.stringify(links));

  // Save console errors
  const errors = consoleMessages.filter(m => m.type === 'error');
  const warnings = consoleMessages.filter(m => m.type === 'warning');
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'console-messages.json'),
    JSON.stringify({ errors, warnings, networkErrors }, null, 2)
  );

  await context.close();
});

// ─── Per-page / per-viewport screenshots + overflow check ───────────────────
for (const vp of VIEWPORTS) {
  test(`screenshot — main @ ${vp.name} (${vp.width}px)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Full-page screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `main-${vp.name}.png`),
      fullPage: true,
    });

    // Check for horizontal overflow
    const overflowInfo = await page.evaluate(() => {
      const bodyScrollWidth = document.body.scrollWidth;
      const windowWidth = window.innerWidth;
      const overflowElements = [];
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > windowWidth + 5) {
          overflowElements.push({
            tag: el.tagName,
            class: el.className.toString().slice(0, 80),
            id: el.id,
            right: Math.round(rect.right),
            windowWidth,
          });
        }
      });
      return { bodyScrollWidth, windowWidth, overflowElements: overflowElements.slice(0, 20) };
    });

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, `main-${vp.name}-overflow.json`),
      JSON.stringify(overflowInfo, null, 2)
    );

    // Touch target check on mobile
    if (vp.name === 'mobile') {
      const smallTargets = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach(el => {
          const rect = el.getBoundingClientRect();
          if ((rect.width < 44 || rect.height < 44) && rect.width > 0 && rect.height > 0) {
            results.push({
              tag: el.tagName,
              text: (el.textContent || '').trim().slice(0, 60),
              ariaLabel: el.getAttribute('aria-label'),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        });
        return results.slice(0, 30);
      });
      fs.writeFileSync(
        path.join(SCREENSHOT_DIR, `main-${vp.name}-small-targets.json`),
        JSON.stringify(smallTargets, null, 2)
      );
    }

    // Accessibility quick check
    const a11yIssues = await page.evaluate(() => {
      const issues = [];
      // Images without alt
      document.querySelectorAll('img').forEach(img => {
        if (!img.getAttribute('alt') && img.getAttribute('alt') !== '') {
          issues.push({ type: 'img-no-alt', src: img.getAttribute('src') });
        }
      });
      // Buttons without accessible name
      document.querySelectorAll('button').forEach(btn => {
        const name = (btn.textContent || '').trim() || btn.getAttribute('aria-label') || btn.getAttribute('title');
        if (!name) issues.push({ type: 'button-no-name', html: btn.outerHTML.slice(0, 100) });
      });
      // Links without accessible name
      document.querySelectorAll('a').forEach(a => {
        const name = (a.textContent || '').trim() || a.getAttribute('aria-label');
        if (!name) issues.push({ type: 'link-no-name', href: a.getAttribute('href') });
      });
      return issues.slice(0, 30);
    });
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, `main-${vp.name}-a11y.json`),
      JSON.stringify(a11yIssues, null, 2)
    );

    fs.appendFileSync(
      path.join(SCREENSHOT_DIR, `main-${vp.name}-console-errors.json`),
      JSON.stringify(consoleErrors, null, 2)
    );

    await context.close();
  });
}

// ─── Dark mode detection ─────────────────────────────────────────────────────
test('dark mode check @ desktop', async ({ browser }) => {
  // System dark mode preference
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'main-desktop-dark-system.png'),
    fullPage: true,
  });

  // Also try toggling a dark class manually
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'main-desktop-dark-class.png'),
    fullPage: true,
  });

  await context.close();
});

// ─── Additional discovered pages ────────────────────────────────────────────
// We capture /login and /agents proactively even before crawl completes
const CANDIDATE_PATHS = ['/login', '/agents', '/dashboard', '/settings', '/register', '/signup'];

for (const pagePath of CANDIDATE_PATHS) {
  test(`screenshot — ${pagePath} @ desktop`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    let statusCode = 0;
    page.on('response', res => {
      if (res.url() === `${BASE_URL}${pagePath}` || res.url() === `${BASE_URL}${pagePath}/`) {
        statusCode = res.status();
      }
    });

    try {
      await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'networkidle', timeout: 20000 });

      const currentUrl = page.url();
      const screenshotPath = path.join(SCREENSHOT_DIR, `${pagePath.replace(/\//g, '_') || 'root'}-desktop.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      fs.writeFileSync(
        path.join(SCREENSHOT_DIR, `${pagePath.replace(/\//g, '_')}-info.json`),
        JSON.stringify({ path: pagePath, finalUrl: currentUrl, statusCode }, null, 2)
      );
    } catch (e) {
      fs.writeFileSync(
        path.join(SCREENSHOT_DIR, `${pagePath.replace(/\//g, '_')}-error.json`),
        JSON.stringify({ path: pagePath, error: e.message }, null, 2)
      );
    }

    await context.close();
  });

  // Mobile viewport for candidate pages
  test(`screenshot — ${pagePath} @ mobile`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${pagePath.replace(/\//g, '_') || 'root'}-mobile.png`),
        fullPage: true,
      });
    } catch (e) { /* page might not exist */ }
    await context.close();
  });
}
