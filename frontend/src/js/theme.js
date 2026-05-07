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

applyTheme(getTheme());
