/**
 * Visual QA runner for https://ai.joonwon.dev
 * Checks: /login, /signup, / (redirect chain)
 * Viewports: 375, 768, 1280
 * Themes: dark, light
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://ai.joonwon.dev';
const OUT_DIR = path.join(__dirname);
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];
const PAGES = ['/login', '/signup', '/'];

const results = {};

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('aah-theme', t);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(t);
  }, theme);
  await page.waitForTimeout(300);
}

async function checkOverflow(page, viewportWidth) {
  return page.evaluate((vw) => {
    const overflowing = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1) {
        overflowing.push({
          tag: el.tagName,
          class: el.className,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    });
    return overflowing.slice(0, 10);
  }, viewportWidth);
}

async function measureElement(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
      borderColor: style.borderColor,
      border: style.border,
    };
  }, selector);
}

async function getAriaLabel(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      ariaLabel: el.getAttribute('aria-label'),
      id: el.id,
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
    };
  }, selector);
}

async function getNetworkRequests(page) {
  // collect all requests via page.on; this function returns collected ones
  return page.evaluate(() => {
    // Can't get from evaluate – captured via listener
    return window.__networkLog || [];
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
  });

  // Capture network requests
  const networkLog = [];
  context.on('response', (response) => {
    networkLog.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  });

  const consoleLog = [];

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleLog.push({ type: msg.type(), text: msg.text() });
    }
  });

  // ─────────────────────────────────────────────
  // 1. Test redirect chain: / → /my-space → /login
  // ─────────────────────────────────────────────
  console.log('\n=== Testing redirect chain: / ===');
  networkLog.length = 0;
  await page.setViewportSize({ width: 1280, height: 800 });
  const redirectChain = [];
  page.on('response', (r) => {
    if (r.status() >= 300 && r.status() < 400) {
      redirectChain.push({ from: r.url(), status: r.status(), location: r.headers()['location'] });
    }
  });
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 15000 });
  const finalUrl = page.url();
  console.log('Final URL after /:', finalUrl);
  results.redirectChain = { finalUrl, redirects: redirectChain };

  // ─────────────────────────────────────────────
  // 2. Per-page, per-viewport, per-theme checks
  // ─────────────────────────────────────────────
  const pages = ['/login', '/signup'];

  for (const pagePath of pages) {
    results[pagePath] = {};
    console.log(`\n=== Page: ${pagePath} ===`);

    for (const vp of VIEWPORTS) {
      results[pagePath][vp.name] = {};
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const theme of ['dark', 'light']) {
        console.log(`  [${vp.name} ${theme}]`);

        networkLog.length = 0;
        consoleLog.length = 0;

        // Navigate fresh each time to capture network
        await page.goto(BASE_URL + pagePath, { waitUntil: 'networkidle', timeout: 15000 });
        await setTheme(page, theme);

        // Screenshot
        const screenshotPath = path.join(OUT_DIR, `${pagePath.replace('/', '')}-${vp.name}-${theme}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`    Screenshot: ${path.basename(screenshotPath)}`);

        // W-2: overflow check
        const overflowItems = await checkOverflow(page, vp.width);

        // W-3: theme button size
        const themeBtn = await measureElement(page, '.theme-btn');

        // W-4: footer link sizes
        const footerLink = await measureElement(page, '.footer a');
        const allFooterLinks = await page.evaluate(() => {
          const links = document.querySelectorAll('.footer a');
          return Array.from(links).map(a => {
            const r = a.getBoundingClientRect();
            const s = window.getComputedStyle(a);
            return {
              text: a.textContent.trim(),
              width: Math.round(r.width),
              height: Math.round(r.height),
              paddingTop: s.paddingTop,
              paddingBottom: s.paddingBottom,
              display: s.display,
            };
          });
        });

        // W-5: input border
        const emailInput = await measureElement(page, 'input[type="email"], input[name="email"]');

        // W-1: footer text color
        const footerText = await page.evaluate(() => {
          const footer = document.querySelector('.footer');
          if (!footer) return null;
          const textNodes = footer.childNodes;
          const style = window.getComputedStyle(footer);
          const cardBg = window.getComputedStyle(document.querySelector('.card') || document.body).backgroundColor;
          return {
            color: style.color,
            cardBg,
          };
        });

        // M-1: label font size
        const labelSize = await page.evaluate(() => {
          const label = document.querySelector('label');
          if (!label) return null;
          return window.getComputedStyle(label).fontSize;
        });

        // M-2: aria-label on inputs
        const emailAriaLabel = await getAriaLabel(page, 'input[type="email"], input[name="email"]');
        const pwAriaLabel = await getAriaLabel(page, 'input[type="password"], input[name="password"]');

        // M-6: .glow overflow
        const glowEl = await measureElement(page, '.glow');

        // W-6: network requests (only on login page first load)
        const relevantRequests = networkLog.filter(r => r.url.includes('/api/'));

        results[pagePath][vp.name][theme] = {
          screenshot: path.basename(screenshotPath),
          overflow: overflowItems,
          themeBtn,
          footerLinks: allFooterLinks,
          emailInput,
          footerText,
          labelSize,
          emailAriaLabel,
          pwAriaLabel,
          glowEl,
          networkRequests: relevantRequests,
          consoleErrors: [...consoleLog],
        };
      }
    }
  }

  // ─────────────────────────────────────────────
  // 3. W-6: /login fresh load network check
  // ─────────────────────────────────────────────
  console.log('\n=== W-6: /login network check ===');
  networkLog.length = 0;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 15000 });
  const loginNetworkRequests = networkLog.filter(r => r.url.includes('/api/'));
  results.loginNetworkRequests = loginNetworkRequests;
  console.log('API requests on /login load:', JSON.stringify(loginNetworkRequests, null, 2));

  // ─────────────────────────────────────────────
  // 4. M-4: undefined routes
  // ─────────────────────────────────────────────
  console.log('\n=== M-4: undefined routes ===');
  results.undefinedRoutes = {};
  for (const badPath of ['/agents', '/dashboard', '/register']) {
    await page.goto(BASE_URL + badPath, { waitUntil: 'networkidle', timeout: 15000 });
    results.undefinedRoutes[badPath] = {
      finalUrl: page.url(),
      title: await page.title(),
    };
    console.log(`  ${badPath} → ${page.url()} | title: "${await page.title()}"`);
  }

  await browser.close();

  // ─────────────────────────────────────────────
  // Output results JSON
  // ─────────────────────────────────────────────
  const jsonPath = path.join(OUT_DIR, 'qa-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${jsonPath}`);
}

run().catch(console.error);
