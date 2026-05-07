// A-1: if user is already logged in, skip signup and go to the app.
async function initSignupPage() {
  try {
    const me = await getMe();
    if (me) {
      window.location.replace('/my-space');
    }
  } catch (_) {
    // ignore — show signup form
  }
}
initSignupPage();

async function handleSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('password-confirm').value;
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('msg');
  const confirmInput = document.getElementById('password-confirm');

  msg.className = 'msg';
  msg.textContent = '';
  confirmInput.classList.remove('invalid');

  if (password !== confirm) {
    confirmInput.classList.add('invalid');
    msg.className = 'msg error';
    msg.textContent = '비밀번호가 일치하지 않습니다.';
    return;
  }

  btn.disabled = true;

  try {
    await register(email, password);
    // B-2: auto-login on register success so the user actually lands inside
    // the app rather than being silently kicked back to /login.
    await login(email, password);
    msg.className = 'msg success';
    msg.textContent = '계정이 생성되었습니다. 이동 중…';
    // B-4: location.replace (not href) so /signup leaves the history stack —
    // hitting browser back after signup no longer dumps the user on
    // about:blank.
    window.location.replace('/my-space');
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}
