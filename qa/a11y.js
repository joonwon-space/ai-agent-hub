/**
 * a11y.js — Shared accessibility audit helper for Playwright specs.
 *
 * Uses @axe-core/playwright to run WCAG 2.0/2.1 A/AA audits.
 * Throws on critical/serious violations; moderate/minor are returned for reporting.
 */

const { AxeBuilder } = require('@axe-core/playwright');

/**
 * Run an axe accessibility audit on the given page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label - Human-readable label for error messages (e.g. 'login-1280-dark')
 * @returns {Promise<import('axe-core').AxeResults>} Full axe results (use .violations for details)
 * @throws {Error} If any critical or serious violations are found
 */
async function auditA11y(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const critical = result.violations.filter(
    (v) => ['critical', 'serious'].includes(v.impact),
  );

  if (critical.length > 0) {
    const msg = critical
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elem)`)
      .join('\n');
    throw new Error(`${label} — ${critical.length} critical/serious a11y violations:\n${msg}`);
  }

  return result;
}

module.exports = { auditA11y };
