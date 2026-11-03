const menuButton = document.querySelector('.menu-button');
const mainNav = document.querySelector('.main-nav');
const closeNavigation = () => {
  mainNav?.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
};
menuButton?.addEventListener('click', () => {
  const open = mainNav?.classList.toggle('open') || false;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
document.addEventListener('pointerdown', (event) => {
  if (mainNav?.classList.contains('open') && !event.target.closest('.main-nav, .menu-button'))
    closeNavigation();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNavigation();
});
document.querySelectorAll('.main-nav a').forEach((link) => {
  const url = new URL(link.href, location.href);
  const currentHash = location.hash;
  if (url.pathname === location.pathname && url.hash === currentHash) link.classList.add('active');
});
document.querySelectorAll('.main-nav a').forEach((link) =>
  link.addEventListener('click', () => {
    closeNavigation();
  })
);
fetch('api/index.php?route=settings', { headers: { Accept: 'application/json' } })
  .then((response) => (response.ok ? response.json() : Promise.reject()))
  .then(({ settings = {} }) =>
    document.querySelectorAll('[data-social]').forEach((link) => {
      const url = settings[link.dataset.social];
      if (url && /^https?:\/\//i.test(url)) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else link.hidden = true;
    })
  )
  .catch(() => document.querySelectorAll('[data-social]').forEach((link) => (link.hidden = true)));

fetch('api/index.php?route=settings', { headers: { Accept: 'application/json' } })
  .then((response) => (response.ok ? response.json() : Promise.reject()))
  .then(({ settings = {} }) =>
    document.querySelectorAll('[data-setting]').forEach((node) => {
      const value = settings[node.dataset.setting];
      if (typeof value !== 'string' || !value.trim()) return;
      if (node.hasAttribute('data-setting-lines'))
        node.innerHTML = value
          .trim()
          .split(/\r?\n/)
          .map((part) =>
            part.replace(
              /[&<>"']/g,
              (char) =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
            )
          )
          .join('<br>');
      else node.textContent = value.trim();
    })
  )
  .catch(() => {});
// Shared behavior for detail pages: active navigation, responsive menu state, and editable site settings.
