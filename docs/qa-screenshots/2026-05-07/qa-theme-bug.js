/**
 * Additional checks:
 * 1. Theme switching: click the button and verify DOM changes
 * 2. Dark mode input border on desktop after actual dark mode (not via localStorage override)
 * 3. Redirect chain detail: / -> my-space -> login (HTTP vs HTTPS)
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
  const extra = {};

  // ─────────────────────────────────────────────
  // Theme button click test
  // ─────────────────────────────────────────────
  console.log('\n=== Theme button click test ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  const before = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    localStorageTheme: localStorage.getItem('aah-theme'),
    btnText: document.querySelector('.theme-btn')?.textContent?.trim(),
    bodyBg: window.getComputedStyle(document.body).backgroundColor,
  }));
  console.log('Before click:', JSON.stringify(before, null, 2));

  // Click theme button
  await page.click('.theme-btn');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    localStorageTheme: localStorage.getItem('aah-theme'),
    btnText: document.querySelector('.theme-btn')?.textContent?.trim(),
    bodyBg: window.getComputedStyle(document.body).backgroundColor,
  }));
  console.log('After click:', JSON.stringify(after, null, 2));
  extra.themeToggle = { before, after };

  // Screenshot after toggle
  await page.screenshot({ path: path.join(OUT_DIR, 'login-desktop-toggled.png') });

  // Click again to return
  await page.click('.theme-btn');
  await page.waitForTimeout(300);
  const after2 = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    localStorageTheme: localStorage.getItem('aah-theme'),
    btnText: document.querySelector('.theme-btn')?.textContent?.trim(),
  }));
  console.log('After 2nd click:', JSON.stringify(after2, null, 2));
  extra.themeToggle2 = after2;

  // ─────────────────────────────────────────────
  // Check dark mode input border (via real dark mode toggle)
  // ─────────────────────────────────────────────
  console.log('\n=== Dark mode input border (real toggle) ===');
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  // Check initial state - what theme does server default to?
  const initialTheme = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    localStorageTheme: localStorage.getItem('aah-theme'),
  }));
  console.log('Initial theme state:', JSON.stringify(initialTheme, null, 2));

  // If light (default), click to switch to dark
  if (!initialTheme.htmlClass.includes('dark')) {
    await page.click('.theme-btn');
    await page.waitForTimeout(500);
  }

  const darkInputBorder = await page.evaluate(() => {
    const input = document.querySelector('input[type="email"]');
    if (!input) return null;
    const style = window.getComputedStyle(input);
    return {
      border: style.border,
      borderColor: style.borderColor,
      htmlClass: document.documentElement.className,
    };
  });
  console.log('Dark mode input border (after real toggle):', JSON.stringify(darkInputBorder, null, 2));
  extra.darkInputBorder = darkInputBorder;

  await page.screenshot({ path: path.join(OUT_DIR, 'login-desktop-dark-real.png') });

  // ─────────────────────────────────────────────
  // W-3 desktop: is 28px height a regression?
  // Check if there's a media query or specific CSS for desktop
  // ─────────────────────────────────────────────
  console.log('\n=== W-3 Desktop theme button CSS detail ===');
  const desktopThemeBtnCss = await page.evaluate(() => {
    const btn = document.querySelector('.theme-btn');
    if (!btn) return null;
    const style = window.getComputedStyle(btn);
    return {
      width: Math.round(btn.getBoundingClientRect().width),
      height: Math.round(btn.getBoundingClientRect().height),
      minWidth: style.minWidth,
      minHeight: style.minHeight,
      padding: style.padding,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      display: style.display,
      boxSizing: style.boxSizing,
    };
  });
  console.log('Desktop .theme-btn CSS:', JSON.stringify(desktopThemeBtnCss, null, 2));
  extra.desktopThemeBtn = desktopThemeBtnCss;

  // ─────────────────────────────────────────────
  // W-4 desktop footer link check - signup page
  // ─────────────────────────────────────────────
  console.log('\n=== W-4 Desktop footer links - signup page ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/signup', { waitUntil: 'networkidle' });
  const signupFooterDesktop = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.footer a')).map(a => {
      const rect = a.getBoundingClientRect();
      const style = window.getComputedStyle(a);
      return {
        text: a.textContent.trim(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
      };
    });
  });
  console.log('Signup footer links desktop:', JSON.stringify(signupFooterDesktop, null, 2));
  extra.signupFooterDesktop = signupFooterDesktop;

  // ─────────────────────────────────────────────
  // Redirect chain detail - check HTTP mixed content
  // ─────────────────────────────────────────────
  console.log('\n=== Redirect chain detail ===');
  const redirectsCapture = [];
  page.on('response', (r) => {
    if (r.status() >= 300 && r.status() < 400) {
      redirectsCapture.push({
        url: r.url(),
        status: r.status(),
        location: r.headers()['location'],
      });
    }
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Redirects:', JSON.stringify(redirectsCapture, null, 2));
  console.log('Final URL:', page.url());
  extra.redirectDetail = { redirects: redirectsCapture, finalUrl: page.url() };

  await browser.close();

  const jsonPath = path.join(OUT_DIR, 'qa-extra.json');
  fs.writeFileSync(jsonPath, JSON.stringify(extra, null, 2));
  console.log(`\nExtra results saved to: ${jsonPath}`);
}

run().catch(console.error);
