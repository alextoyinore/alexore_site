const accountRoot = document.querySelector('#accountRoot');
const loginForm = accountRoot?.querySelector('#memberLoginForm');
const registerForm = accountRoot?.querySelector('#memberRegisterForm');
const formsPanel = accountRoot?.querySelector('#accountForms');
const profilePanel = accountRoot?.querySelector('#accountProfile');
const returnTo = new URLSearchParams(location.search).get('returnTo');
let authState = null;

function renderAccountState(state) {
  authState = state;
  if (state.authenticated) {
    formsPanel.hidden = true;
    profilePanel.hidden = false;
    accountRoot.querySelector('#accountProfileName').textContent = state.user.fullName;
    accountRoot.querySelector('#accountProfileEmail').textContent = state.user.email;
  } else {
    formsPanel.hidden = false;
    profilePanel.hidden = true;
    const mode = new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login';
    loginForm.hidden = mode !== 'login';
    registerForm.hidden = mode !== 'register';
    accountRoot.querySelectorAll('[data-account-mode]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.accountMode === mode);
    });
  }
}

function showFormMessage(form, text, error = false) {
  const node = form.querySelector('.account-message');
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

function showReoMessage(text, error = false) {
  accountRoot?.querySelectorAll('[data-reo-sso-message]').forEach((node) => {
    node.textContent = text;
    node.classList.toggle('is-error', error);
  });
}

async function beginReoSignIn(button) {
  button.disabled = true;
  showReoMessage('Opening Reo sign-in…');
  try {
    authState = await window.alexoreMemberAuthPromise;
    if (!authState?.reoSsoState) throw new Error('Could not prepare Reo sign-in. Refresh and try again.');
    const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
    const reoApi = localHost
      ? `${location.protocol}//${location.host}/students/api/index.php`
      : 'https://reo.alexore.com.ng/api/index.php';
    const start = new URL(reoApi);
    start.searchParams.set('route', 'alexore-sso-start');
    start.searchParams.set('state', authState.reoSsoState);
    start.searchParams.set('return', `${location.origin}${location.pathname}`);
    location.assign(start.href);
  } catch (error) {
    showReoMessage(error.message, true);
    button.disabled = false;
  }
}

async function finishReoSignIn() {
  const params = new URLSearchParams(location.search);
  if (params.get('reo_sso') !== '1') return;
  const ticket = params.get('ticket') || '';
  const state = params.get('state') || '';
  params.delete('reo_sso');
  params.delete('ticket');
  params.delete('state');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  showReoMessage('Verifying your Reo account…');
  try {
    authState = await window.alexoreMemberAuthPromise;
    const response = await fetch('api/index.php?route=member-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': authState?.csrf || '',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'reo-sso', ticket, state }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Reo sign-in could not be completed.');
    authState = result;
    renderAccountState(result);
    showReoMessage('Your Reo account is now linked to Alexore.');
    await window.refreshAlexoreMemberAuth?.();
  } catch (error) {
    showReoMessage(error.message, true);
  }
}

accountRoot?.querySelectorAll('[data-reo-sso]').forEach((button) => {
  button.addEventListener('click', () => beginReoSignIn(button));
});

async function submitAccountForm(form, action) {
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  showFormMessage(form, '');
  try {
    await window.alexoreMemberAuthPromise;
    const response = await fetch('api/index.php?route=member-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': authState?.csrf || '',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ action, ...Object.fromEntries(new FormData(form)) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your account request could not be completed.');
    authState = result;
    renderAccountState(result);
    await window.refreshAlexoreMemberAuth?.();
    if (returnTo) {
      const destination = new URL(returnTo, location.origin);
      if (destination.origin === location.origin) location.assign(destination.href);
    }
  } catch (error) {
    showFormMessage(form, error.message, true);
  } finally {
    button.disabled = false;
  }
}

loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAccountForm(loginForm, 'login');
});
registerForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAccountForm(registerForm, 'register');
});

accountRoot?.querySelector('#accountLogout')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('api/index.php?route=member-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': authState?.csrf || '',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'logout' }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not log out.');
    authState = result;
    await window.refreshAlexoreMemberAuth?.();
    location.assign('account.html?mode=login');
  } catch (error) {
    const message = accountRoot.querySelector('#accountProfile .account-message');
    message.textContent = error.message;
    message.classList.add('is-error');
    button.disabled = false;
  }
});

if (accountRoot) {
  window.alexoreMemberAuthPromise?.then((state) => {
    renderAccountState(state);
    finishReoSignIn();
  });
}
