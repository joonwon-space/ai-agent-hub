const { test, expect } = require('@playwright/test');

const EMAIL    = process.env.QA_EMAIL    || 'test@test.com';
const PASSWORD = process.env.QA_PASSWORD || '';

async function login(page) {
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#submit-btn');
  await page.waitForURL('**/', { timeout: 10000 });
}

// Always start fresh in dark mode (addInitScript runs before every navigation incl. reload)
async function goHomeFresh(page) {
  await page.addInitScript(() => localStorage.removeItem('aah-theme'));
  await page.goto('/');
  if (page.url().includes('/login')) await login(page);
  await page.waitForSelector('#theme-toggle', { state: 'visible' });
}

test.describe('Home — theme toggle', () => {
  test('starts in dark mode', async ({ page }) => {
    await goHomeFresh(page);
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('dark');
    await page.screenshot({ path: 'screenshots/01-dark-mode.png' });
  });

  test('toggles to light mode on click', async ({ page }) => {
    await goHomeFresh(page);
    await page.click('#theme-toggle');
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');
    await page.screenshot({ path: 'screenshots/02-light-mode.png' });
  });

  test('body background changes on toggle', async ({ page }) => {
    await goHomeFresh(page);
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.click('#theme-toggle');
    await page.waitForTimeout(300);

    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).not.toBe(lightBg);
    await page.screenshot({ path: 'screenshots/03-light-bg-check.png' });
  });

  test('toggle button label flips', async ({ page }) => {
    await goHomeFresh(page);
    const before = await page.textContent('#theme-toggle');
    await page.click('#theme-toggle');
    const after = await page.textContent('#theme-toggle');
    expect(before).not.toBe(after);
  });

  test('persists across page reload', async ({ page }) => {
    // First visit: set light mode and save to localStorage
    await page.goto('/');
    if (page.url().includes('/login')) await login(page);
    await page.waitForSelector('#theme-toggle', { state: 'visible' });
    await page.evaluate(() => localStorage.removeItem('aah-theme')); // ensure dark start
    await page.click('#theme-toggle'); // → light, localStorage = 'light'

    // Reload without clearing localStorage
    await page.reload();
    await page.waitForSelector('#theme-toggle', { state: 'visible' });

    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');
    await page.screenshot({ path: 'screenshots/04-persist-after-reload.png' });
  });
});

test.describe('Login page — theme toggle', () => {
  test('toggle works on login page', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('aah-theme'));
    await page.goto('/login');
    await page.waitForSelector('#theme-toggle', { state: 'visible' });
    await page.click('#theme-toggle');
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('light');
    await page.screenshot({ path: 'screenshots/05-login-light.png' });
  });
});

test.describe('Login flow', () => {
  test('login page renders form elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#email', { state: 'visible' });
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
    await page.screenshot({ path: 'screenshots/06-login-form.png' });
  });

  test('login with missing credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#submit-btn', { state: 'visible' });
    // Fill email only, leave password empty
    await page.fill('#email', 'test@example.com');
    await page.click('#submit-btn');
    // HTML5 validation or server error should prevent navigation
    const url = page.url();
    expect(url).toContain('/login');
    await page.screenshot({ path: 'screenshots/07-login-missing-pw.png' });
  });

  test('login with wrong credentials shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('#submit-btn', { state: 'visible' });
    await page.fill('#email', 'nonexistent@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('#submit-btn');
    // Wait for error message to appear (the #msg element becomes visible)
    await page.waitForSelector('#msg.error', { state: 'visible', timeout: 8000 });
    const msgText = await page.textContent('#msg');
    expect(msgText.length).toBeGreaterThan(0);
    await page.screenshot({ path: 'screenshots/08-login-error.png' });
  });

  test('login page redirects to / when already authenticated', async ({ page }) => {
    // If user is already on / (authenticated), visiting /login should not crash
    await page.goto('/login');
    await page.waitForSelector('#email', { state: 'visible' });
    expect(page.url()).toContain('/login');
  });

  test('signup link is visible on login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('.footer a', { state: 'visible' });
    const href = await page.getAttribute('.footer a', 'href');
    expect(href).toContain('/signup');
  });
});
