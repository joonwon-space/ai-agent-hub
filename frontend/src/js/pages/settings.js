const SETTINGS_KEYS = ['jira_base_url', 'jira_email', 'jira_api_token', 'jira_project_key'];
const MASKED_RE = /^●/;

// A-6: mask an email for shared-screen display. "abcdef@example.com" → "ab***@example.com"
function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  const prefix = local.length <= 2 ? local : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

async function initSettingsPage() {
  let me;
  try {
    me = await getMe();
  } catch (_) {
    // network error — treat as unauthenticated
  }
  if (!me) {
    window.location.href = '/login';
    return;
  }

  document.body.style.visibility = 'visible';
  const emailEl = document.getElementById('user-email');
  // A-6: mask the email so a shared screen doesn't leak the full address.
  // Format: keeps first 2 chars of local part + '***' + '@' + domain.
  if (emailEl) emailEl.textContent = maskEmail(me.email);

  try {
    const res = await authFetch('/api/settings');
    if (!res) return;
    const data = await res.json();

    for (const key of SETTINGS_KEYS) {
      const el = document.getElementById(key);
      if (!el) continue;
      if (key === 'jira_api_token') {
        el.placeholder = data[key] ? data[key] : '저장된 토큰을 변경하려면 새 값을 입력하세요';
        el.value = '';
      } else {
        el.value = data[key] || '';
      }
    }
  } catch (err) {
    showMsg('설정 로드 실패: ' + err.message, 'error');
  }
}

async function handleSave(event) {
  event.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;

  const body = {};
  for (const key of SETTINGS_KEYS) {
    const el = document.getElementById(key);
    if (!el) continue;
    const val = el.value.trim();
    if (key === 'jira_api_token') {
      if (val !== '') body[key] = val;
    } else {
      body[key] = val;
    }
  }

  try {
    const res = await authFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res) return;
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '저장 실패');
    }
    showMsg('설정이 저장되었습니다.', 'success');
    document.getElementById('jira_api_token').value = '';
    await initSettingsPage();
  } catch (err) {
    showMsg(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function showMsg(text, type) {
  const msg = document.getElementById('msg');
  msg.textContent = text;
  msg.className = `msg ${type}`;
  setTimeout(() => { msg.className = 'msg'; }, 4000);
}

initSettingsPage();
