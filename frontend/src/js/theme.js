const THEME_KEY = 'aah-theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const btns = document.querySelectorAll('#theme-toggle');
  btns.forEach((btn) => {
    // A-4: button label intentionally describes the *target* mode (what
    // happens on click), not the current one. Add a title tooltip and
    // aria-label that spells this out so it isn't ambiguous on hover or
    // for screen readers.
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    const targetLabel = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
    btn.setAttribute('aria-label', targetLabel);
    btn.setAttribute('title', targetLabel);
    btn.setAttribute('aria-pressed', String(theme === 'light'));
  });
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// theme.js loads in <head> for FOUC prevention — at that point the
// #theme-toggle button doesn't exist yet, so the aria-label/title set by
// applyTheme() above hits zero elements and the button keeps its static
// HTML default ('테마 전환'). Re-run after the DOM is parsed so screen
// readers see the correct target-mode label without first requiring a click.
function setThemeButtonLabels() {
  applyTheme(getTheme());
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setThemeButtonLabels);
} else {
  setThemeButtonLabels();
}

// First call still fires synchronously to set <html data-theme> early
// (avoids a flash of wrong theme on initial paint).
applyTheme(getTheme());
