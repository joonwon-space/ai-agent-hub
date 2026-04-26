let isRegisterMode = false;

async function initLoginPage() {
  const needsSetup = await setupRequired();
  isRegisterMode = needsSetup;

  const subtitle = document.getElementById('subtitle');
  const submitBtn = document.getElementById('submit-btn');

  if (needsSetup) {
    subtitle.textContent = '관리자 계정 생성';
    submitBtn.textContent = '계정 생성';
    document.querySelector('input[type="password"]').setAttribute('autocomplete', 'new-password');
  } else {
    subtitle.textContent = '로그인';
    submitBtn.textContent = '로그인';
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('msg');

  msg.className = 'msg';
  msg.textContent = '';
  btn.disabled = true;

  try {
    if (isRegisterMode) {
      await register(email, password);
    } else {
      await login(email, password);
    }
    window.location.href = '/';
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

initLoginPage();
