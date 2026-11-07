const authLinks = {
  register: [...document.querySelectorAll('[data-member-register]')],
  login: [...document.querySelectorAll('[data-member-login]')],
  account: [...document.querySelectorAll('[data-member-account]')],
  profile: [...document.querySelectorAll('[data-member-profile]')],
  logout: [...document.querySelectorAll('[data-member-logout]')],
};

async function refreshAlexoreMemberAuth() {
  try {
    const response = await fetch('api/index.php?route=member-auth', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Account status unavailable.');
    window.alexoreMember = result;
    authLinks.register.forEach((node) => (node.hidden = result.authenticated));
    authLinks.login.forEach((node) => (node.hidden = result.authenticated));
    authLinks.account.forEach((node) => (node.hidden = !result.authenticated));
    authLinks.profile.forEach((node) => {
      node.textContent = result.authenticated ? `Hi, ${result.user.fullName}` : 'My profile';
    });
    document.dispatchEvent(new CustomEvent('alexore:member-auth', { detail: result }));
    return result;
  } catch (error) {
    window.alexoreMember = { authenticated: false, user: null, csrf: '' };
    authLinks.register.forEach((node) => (node.hidden = false));
    authLinks.login.forEach((node) => (node.hidden = false));
    authLinks.account.forEach((node) => (node.hidden = true));
    document.dispatchEvent(new CustomEvent('alexore:member-auth', { detail: window.alexoreMember }));
    return window.alexoreMember;
  }
}

authLinks.logout.forEach((button) => {
  button.addEventListener('click', async () => {
    const auth = window.alexoreMember;
    if (!auth?.csrf) return;
    button.disabled = true;
    try {
      const response = await fetch('api/index.php?route=member-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': auth.csrf,
        },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'logout' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not log out.');
      await refreshAlexoreMemberAuth();
    } catch (error) {
      button.disabled = false;
      window.alert(error.message);
    }
  });
});

window.refreshAlexoreMemberAuth = refreshAlexoreMemberAuth;
window.alexoreMemberAuthPromise = refreshAlexoreMemberAuth();
