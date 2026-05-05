const THEME_KEY = 'aah-theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const btns = document.querySelectorAll('#theme-toggle');
  btns.forEach((btn) => {
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    btn.setAttribute('aria-label', `테마 전환 — 현재: ${theme === 'dark' ? '다크' : '라이트'}`);
    btn.setAttribute('aria-pressed', String(theme === 'light'));
  });
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

applyTheme(getTheme());
