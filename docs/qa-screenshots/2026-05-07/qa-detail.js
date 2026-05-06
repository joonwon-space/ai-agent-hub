/**
 * Detailed checks: contrast ratios, card padding, card max-width, theme switching consistency
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://ai.joonwon.dev';
const OUT_DIR = path.join(__dirname);

// Relative luminance per WCAG
function getLuminance(r, g, b) {
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrast(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(str) {
  // handles rgb(r, g, b) and rgba(r, g, b, a)
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const detail = {};

  // ─────────────────────────────────────────────
  // W-1: Contrast check - dark mode footer text vs card background
  // ─────────────────────────────────────────────
  console.log('\n=== W-1: Contrast ratio (dark mode footer text) ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  // Set dark mode via localStorage
  await page.evaluate(() => {
    localStorage.setItem('aah-theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(500);

  const darkContrastData = await page.evaluate(() => {
    const footer = document.querySelector('.footer');
    const card = document.querySelector('.card');
    if (!footer || !card) return null;
    const footerStyle = window.getComputedStyle(footer);
    const cardStyle = window.getComputedStyle(card);
    // Also check any direct text spans in footer
    const spans = footer.querySelectorAll('span, p, div');
    const spanColors = Array.from(spans).map(s => ({
      tag: s.tagName,
      class: s.className,
      color: window.getComputedStyle(s).color,
      bg: window.getComputedStyle(s).backgroundColor,
    }));
    return {
      footerColor: footerStyle.color,
      footerBg: footerStyle.backgroundColor,
      cardBg: cardStyle.backgroundColor,
      spanColors,
    };
  });
  console.log('Dark mode footer contrast data:', JSON.stringify(darkContrastData, null, 2));

  if (darkContrastData) {
    const textRgb = parseRgb(darkContrastData.footerColor);
    const cardRgb = parseRgb(darkContrastData.cardBg);
    if (textRgb && cardRgb) {
      const ratio = getContrast(textRgb, cardRgb);
      console.log(`Contrast ratio: ${ratio.toFixed(2)}:1 (need ≥ 4.5)`);
      detail.w1 = { textColor: darkContrastData.footerColor, cardBg: darkContrastData.cardBg, ratio: ratio.toFixed(2) };
    }
  }

  // ─────────────────────────────────────────────
  // W-1 light mode as well
  // ─────────────────────────────────────────────
  await page.evaluate(() => {
    localStorage.setItem('aah-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(500);
  const lightContrastData = await page.evaluate(() => {
    const footer = document.querySelector('.footer');
    const card = document.querySelector('.card');
    if (!footer || !card) return null;
    const footerStyle = window.getComputedStyle(footer);
    const cardStyle = window.getComputedStyle(card);
    return { footerColor: footerStyle.color, cardBg: cardStyle.backgroundColor };
  });
  if (lightContrastData) {
    const textRgb = parseRgb(lightContrastData.footerColor);
    const cardRgb = parseRgb(lightContrastData.cardBg);
    if (textRgb && cardRgb) {
      const ratio = getContrast(textRgb, cardRgb);
      console.log(`Light mode contrast ratio: ${ratio.toFixed(2)}:1`);
      detail.w1light = { textColor: lightContrastData.footerColor, cardBg: lightContrastData.cardBg, ratio: ratio.toFixed(2) };
    }
  }

  // ─────────────────────────────────────────────
  // W-2: Card padding on mobile
  // ─────────────────────────────────────────────
  console.log('\n=== W-2: Card padding (mobile 375px) ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  const cardPaddingData = await page.evaluate(() => {
    const card = document.querySelector('.card');
    const body = document.body;
    if (!card) return null;
    const cardRect = card.getBoundingClientRect();
    const bodyStyle = window.getComputedStyle(body);
    const cardStyle = window.getComputedStyle(card);
    return {
      cardLeft: Math.round(cardRect.left),
      cardRight: Math.round(cardRect.right),
      cardWidth: Math.round(cardRect.width),
      viewportWidth: window.innerWidth,
      bodyPaddingLeft: bodyStyle.paddingLeft,
      bodyPaddingRight: bodyStyle.paddingRight,
      cardMaxWidth: cardStyle.maxWidth,
      leftMargin: Math.round(cardRect.left),
      rightMargin: Math.round(window.innerWidth - cardRect.right),
    };
  });
  console.log('Card padding:', JSON.stringify(cardPaddingData, null, 2));
  detail.w2 = cardPaddingData;

  // ─────────────────────────────────────────────
  // W-3: Theme button on mobile
  // ─────────────────────────────────────────────
  console.log('\n=== W-3: Theme button touch target (mobile 375px) ===');
  const themeBtnMobile = await page.evaluate(() => {
    const btn = document.querySelector('.theme-btn');
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      minWidth: style.minWidth,
      minHeight: style.minHeight,
      padding: style.padding,
    };
  });
  console.log('Theme btn mobile:', JSON.stringify(themeBtnMobile, null, 2));
  detail.w3mobile = themeBtnMobile;

  // Desktop theme button
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  const themeBtnDesktop = await page.evaluate(() => {
    const btn = document.querySelector('.theme-btn');
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const style = window.getComputedStyle(btn);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      minWidth: style.minWidth,
      minHeight: style.minHeight,
      padding: style.padding,
    };
  });
  console.log('Theme btn desktop:', JSON.stringify(themeBtnDesktop, null, 2));
  detail.w3desktop = themeBtnDesktop;

  // ─────────────────────────────────────────────
  // W-4: Footer links on mobile vs desktop
  // ─────────────────────────────────────────────
  console.log('\n=== W-4: Footer links touch targets ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  const footerLinksMobile = await page.evaluate(() => {
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
  console.log('Footer links mobile:', JSON.stringify(footerLinksMobile, null, 2));
  detail.w4mobile = footerLinksMobile;

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  const footerLinksDesktop = await page.evaluate(() => {
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
  console.log('Footer links desktop:', JSON.stringify(footerLinksDesktop, null, 2));
  detail.w4desktop = footerLinksDesktop;

  // ─────────────────────────────────────────────
  // W-5: Input border visibility
  // ─────────────────────────────────────────────
  console.log('\n=== W-5: Input border visibility ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  // Dark mode
  await page.evaluate(() => {
    localStorage.setItem('aah-theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(300);
  const inputBorderDark = await page.evaluate(() => {
    const input = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
    if (!input) return null;
    const style = window.getComputedStyle(input);
    return {
      border: style.border,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
      outline: style.outline,
    };
  });
  console.log('Input border dark:', JSON.stringify(inputBorderDark, null, 2));
  detail.w5dark = inputBorderDark;

  // Light mode
  await page.evaluate(() => {
    localStorage.setItem('aah-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(300);
  const inputBorderLight = await page.evaluate(() => {
    const input = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
    if (!input) return null;
    const style = window.getComputedStyle(input);
    return {
      border: style.border,
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
    };
  });
  console.log('Input border light:', JSON.stringify(inputBorderLight, null, 2));
  detail.w5light = inputBorderLight;

  // ─────────────────────────────────────────────
  // Theme switching consistency check (bug detection)
  // The test: navigate to /login, set localStorage to 'light',
  // but does DOM actually reflect 'light'?
  // ─────────────────────────────────────────────
  console.log('\n=== Theme switching consistency check ===');
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });

  // Check default theme on fresh load
  const defaultTheme = await page.evaluate(() => {
    return {
      htmlClass: document.documentElement.className,
      localStorage: localStorage.getItem('aah-theme'),
      bodyBg: window.getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log('Default theme state:', JSON.stringify(defaultTheme, null, 2));
  detail.themeDefault = defaultTheme;

  // ─────────────────────────────────────────────
  // Theme button text check (visual label)
  // ─────────────────────────────────────────────
  const themeBtnText = await page.evaluate(() => {
    const btn = document.querySelector('.theme-btn');
    if (!btn) return null;
    return {
      text: btn.textContent.trim(),
      innerText: btn.innerText,
    };
  });
  console.log('Theme button text (default):', JSON.stringify(themeBtnText, null, 2));
  detail.themeBtnText = themeBtnText;

  // ─────────────────────────────────────────────
  // Check /signup page consistency with /login
  // ─────────────────────────────────────────────
  console.log('\n=== Signup page consistency check ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE_URL + '/signup', { waitUntil: 'networkidle' });
  const signupCardData = await page.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    const style = window.getComputedStyle(card);
    return {
      cardLeft: Math.round(rect.left),
      cardRight: Math.round(rect.right),
      cardWidth: Math.round(rect.width),
      leftMargin: Math.round(rect.left),
      rightMargin: Math.round(window.innerWidth - rect.right),
      maxWidth: style.maxWidth,
    };
  });
  console.log('Signup card padding (mobile):', JSON.stringify(signupCardData, null, 2));
  detail.signupCard = signupCardData;

  // ─────────────────────────────────────────────
  // M-1: label/subtitle font sizes verification
  // ─────────────────────────────────────────────
  console.log('\n=== M-1: Font sizes ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  const fontSizes = await page.evaluate(() => {
    const label = document.querySelector('label');
    const subtitle = document.querySelector('.subtitle, .sub-title, [class*="subtitle"]');
    const h1 = document.querySelector('h1');
    const allLabels = Array.from(document.querySelectorAll('label')).map(l => ({
      text: l.textContent.trim().substring(0, 20),
      fontSize: window.getComputedStyle(l).fontSize,
    }));
    return {
      firstLabel: label ? { text: label.textContent.trim(), fontSize: window.getComputedStyle(label).fontSize } : null,
      subtitle: subtitle ? { text: subtitle.textContent.trim().substring(0, 30), fontSize: window.getComputedStyle(subtitle).fontSize } : null,
      h1: h1 ? { text: h1.textContent.trim(), fontSize: window.getComputedStyle(h1).fontSize } : null,
      allLabels,
    };
  });
  console.log('Font sizes:', JSON.stringify(fontSizes, null, 2));
  detail.m1 = fontSizes;

  // ─────────────────────────────────────────────
  // M-2: aria-label checks
  // ─────────────────────────────────────────────
  console.log('\n=== M-2: aria-label on inputs ===');
  const ariaLabels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(inp => ({
      type: inp.type,
      id: inp.id,
      ariaLabel: inp.getAttribute('aria-label'),
      placeholder: inp.placeholder,
    }));
  });
  console.log('Input aria labels:', JSON.stringify(ariaLabels, null, 2));
  detail.m2 = ariaLabels;

  // ─────────────────────────────────────────────
  // M-6: .glow overflow check on mobile
  // ─────────────────────────────────────────────
  console.log('\n=== M-6: .glow overflow (mobile 375px) ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
  const glowData = await page.evaluate(() => {
    const glow = document.querySelector('.glow');
    if (!glow) return null;
    const rect = glow.getBoundingClientRect();
    const style = window.getComputedStyle(glow);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      left: Math.round(rect.left),
      viewportWidth: window.innerWidth,
      maxWidth: style.maxWidth,
      overflow: style.overflow,
      exceedsViewport: rect.right > window.innerWidth,
    };
  });
  console.log('.glow data (mobile):', JSON.stringify(glowData, null, 2));
  detail.m6 = glowData;

  // Also check body overflow
  const bodyOverflow = await page.evaluate(() => {
    const style = window.getComputedStyle(document.body);
    return {
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  });
  console.log('Body overflow:', JSON.stringify(bodyOverflow, null, 2));
  detail.bodyOverflow = bodyOverflow;

  await browser.close();

  const jsonPath = path.join(OUT_DIR, 'qa-detail.json');
  fs.writeFileSync(jsonPath, JSON.stringify(detail, null, 2));
  console.log(`\nDetail results saved to: ${jsonPath}`);
}

run().catch(console.error);
