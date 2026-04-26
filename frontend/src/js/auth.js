const AUTH_BASE = '/api/auth';

async function login(email, password) {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '로그인 실패');
  return data;
}

async function register(email, password) {
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '계정 생성 실패');
  return data;
}

async function logout() {
  await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login';
}

async function getMe() {
  const res = await fetch(`${AUTH_BASE}/me`, { credentials: 'same-origin' });
  if (!res.ok) return null;
  return res.json();
}

async function setupRequired() {
  const res = await fetch(`${AUTH_BASE}/setup-required`, { credentials: 'same-origin' });
  const data = await res.json();
  return data.setupRequired === true;
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  return res;
}
