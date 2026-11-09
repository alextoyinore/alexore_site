const accountRoot = document.querySelector('#accountRoot');
const loginForm = accountRoot?.querySelector('#memberLoginForm');
const registerForm = accountRoot?.querySelector('#memberRegisterForm');
const resetRequestForm = accountRoot?.querySelector('#memberResetRequestForm');
const resetPasswordForm = accountRoot?.querySelector('#memberResetPasswordForm');
const formsPanel = accountRoot?.querySelector('#accountForms');
const profilePanel = accountRoot?.querySelector('#accountProfile');
const accountModeSwitch = accountRoot?.querySelector('.account-mode-switch');
const initialParams = new URLSearchParams(location.search);
const returnTo = initialParams.get('returnTo');
let passwordResetToken = initialParams.get('password_reset') || '';
let authState = null;

if (passwordResetToken) {
  initialParams.delete('password_reset');
  history.replaceState(null, '', `${location.pathname}${initialParams.size ? `?${initialParams}` : ''}${location.hash}`);
}

function renderAccountState(state) {
  authState = state;
  if (passwordResetToken) {
    formsPanel.hidden = false;
    profilePanel.hidden = true;
    accountModeSwitch.hidden = true;
    loginForm.hidden = true;
    registerForm.hidden = true;
    resetRequestForm.hidden = true;
    resetPasswordForm.hidden = false;
    resetPasswordForm.elements.token.value = passwordResetToken;
    return;
  }
  accountModeSwitch.hidden = false;
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
    resetRequestForm.hidden = true;
    resetPasswordForm.hidden = true;
    accountRoot.querySelectorAll('[data-account-mode]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.accountMode === mode);
    });
  }
}

accountRoot?.querySelector('#showMemberRecovery')?.addEventListener('click', () => {
  accountModeSwitch.hidden = true;
  loginForm.hidden = true;
  registerForm.hidden = true;
  resetPasswordForm.hidden = true;
  resetRequestForm.hidden = false;
});
accountRoot?.querySelector('[data-member-back-login]')?.addEventListener('click', () => {
  resetRequestForm.hidden = true;
  accountModeSwitch.hidden = false;
  loginForm.hidden = false;
  registerForm.hidden = true;
});

resetRequestForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = resetRequestForm.querySelector('[type="submit"]');
  button.disabled = true;
  showFormMessage(resetRequestForm, '');
  try {
    const response = await fetch('api/index.php?route=member-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'request', email: resetRequestForm.elements.email.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The reset request could not be completed.');
    showFormMessage(resetRequestForm, result.message);
  } catch (error) {
    showFormMessage(resetRequestForm, error.message, true);
  } finally {
    button.disabled = false;
  }
});

resetPasswordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = resetPasswordForm.querySelector('[type="submit"]');
  const password = resetPasswordForm.elements.password.value;
  if (password !== resetPasswordForm.elements.confirmPassword.value) {
    showFormMessage(resetPasswordForm, 'The passwords do not match.', true);
    return;
  }
  button.disabled = true;
  showFormMessage(resetPasswordForm, '');
  try {
    const response = await fetch('api/index.php?route=member-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'reset', token: passwordResetToken, password }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The password could not be changed.');
    passwordResetToken = '';
    resetPasswordForm.hidden = true;
    accountModeSwitch.hidden = false;
    loginForm.hidden = false;
    showFormMessage(loginForm, result.message);
  } catch (error) {
    showFormMessage(resetPasswordForm, error.message, true);
  } finally {
    button.disabled = false;
  }
});

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
