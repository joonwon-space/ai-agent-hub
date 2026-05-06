/**
 * Verify dark mode input border color under REAL dark mode
 * (theme applied via CSS custom property / data-theme, not html.dark class)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://ai.joonwon.dev';
const OUT_DIR = path.join(__dirname);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate and wait for default theme to load
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  // Inspect how theme is actually applied
  const themeImplementation = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      htmlDataTheme: html.getAttribute('data-theme'),
      htmlClass: html.className,
      htmlAttributes: Array.from(html.attributes).map(a => ({ name: a.name, value: a.value })),
      bodyClass: body.className,
      bodyDataTheme: body.getAttribute('data-theme'),
      localStorageTheme: localStorage.getItem('aah-theme'),
      // What CSS variable is being used?
      cssVarBg: getComputedStyle(html).getPropertyValue('--bg'),
      cssVarBgCard: getComputedStyle(html).getPropertyValue('--bg-card'),
      cssVarText: getComputedStyle(html).getPropertyValue('--text'),
      cssVarBorder: getComputedStyle(html).getPropertyValue('--border'),
    };
  });
  console.log('Theme implementation details:', JSON.stringify(themeImplementation, null, 2));

  // Now check dark mode via localStorage 'dark'
  // First: save current state, then set dark
  await page.evaluate(() => {
    localStorage.setItem('aah-theme', 'dark');
    // Trigger theme change - find the app's theme function
    if (window.applyTheme) window.applyTheme('dark');
    if (window.setTheme) window.setTheme('dark');
    // Or dispatch storage event
    window.dispatchEvent(new StorageEvent('storage', { key: 'aah-theme', newValue: 'dark' }));
  });
  await page.waitForTimeout(500);

  const darkThemeState = await page.evaluate(() => {
    const html = document.documentElement;
    const input = document.querySelector('input[type="email"]');
    return {
      htmlDataTheme: html.getAttribute('data-theme'),
      htmlClass: html.className,
      htmlAttributes: Array.from(html.attributes).map(a => ({ name: a.name, value: a.value })),
      localStorageTheme: localStorage.getItem('aah-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      cssVarBg: getComputedStyle(html).getPropertyValue('--bg'),
      cssVarBorder: getComputedStyle(html).getPropertyValue('--border'),
      inputBorder: input ? getComputedStyle(input).border : null,
      inputBorderColor: input ? getComputedStyle(input).borderColor : null,
    };
  });
  console.log('\nDark mode state (after localStorage set + dispatch):', JSON.stringify(darkThemeState, null, 2));

  // Now click the theme button and check REAL dark state
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  // Figure out current theme
  const currentTheme = await page.evaluate(() => localStorage.getItem('aah-theme'));
  console.log('\nCurrent theme on fresh load:', currentTheme);

  // If not dark, click button to go dark
  if (currentTheme !== 'dark') {
    await page.click('.theme-btn');
    await page.waitForTimeout(500);
  }

  // Verify DOM in dark mode
  const darkDomState = await page.evaluate(() => {
    const html = document.documentElement;
    const input = document.querySelector('input[type="email"]');
    return {
      htmlDataTheme: html.getAttribute('data-theme'),
      htmlClass: html.className,
      htmlAllAttrs: Array.from(html.attributes).map(a => `${a.name}="${a.value}"`).join(' '),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      inputBorderColor: input ? getComputedStyle(input).borderColor : null,
      localStorageTheme: localStorage.getItem('aah-theme'),
    };
  });
  console.log('\nDark DOM state (real dark mode):', JSON.stringify(darkDomState, null, 2));

  await page.screenshot({ path: path.join(OUT_DIR, 'login-desktop-dark-verified.png') });

  // Light mode same check
  await page.click('.theme-btn'); // toggle to light
  await page.waitForTimeout(500);
  const lightDomState = await page.evaluate(() => {
    const html = document.documentElement;
    const input = document.querySelector('input[type="email"]');
    return {
      htmlDataTheme: html.getAttribute('data-theme'),
      htmlClass: html.className,
      htmlAllAttrs: Array.from(html.attributes).map(a => `${a.name}="${a.value}"`).join(' '),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      inputBorderColor: input ? getComputedStyle(input).borderColor : null,
      localStorageTheme: localStorage.getItem('aah-theme'),
    };
  });
  console.log('\nLight DOM state:', JSON.stringify(lightDomState, null, 2));

  await page.screenshot({ path: path.join(OUT_DIR, 'login-desktop-light-verified.png') });

  await browser.close();
}

run().catch(console.error);
