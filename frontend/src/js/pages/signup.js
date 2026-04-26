async function initSignupPage() {
  const needsSetup = await setupRequired();
  if (!needsSetup) {
    window.location.href = '/login';
  }
}

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
    window.location.href = '/';
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

initSignupPage();
