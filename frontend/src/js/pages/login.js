async function initLoginPage() {
  const needsSetup = await setupRequired();
  if (needsSetup) {
    window.location.href = '/signup';
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
    await login(email, password);
    window.location.href = '/my-space';
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

initLoginPage();
