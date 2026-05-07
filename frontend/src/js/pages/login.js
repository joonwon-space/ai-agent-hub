async function initLoginPage() {
  // A-1: if the user is already authenticated (e.g., hit browser back from
  // /my-space), bounce straight to the app instead of showing a confusing
  // login form. location.replace so /login doesn't re-pollute history.
  try {
    const me = await getMe();
    if (me) {
      window.location.replace('/my-space');
      return;
    }
  } catch (_) {
    // network/getMe error — fall through to login form
  }

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
