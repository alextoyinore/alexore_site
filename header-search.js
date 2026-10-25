const headerSearchForms = document.querySelectorAll('.header-search');
const mobileHeaderSearch = window.matchMedia('(max-width: 600px)');

headerSearchForms.forEach(form => {
  const toggle = form.querySelector('.header-search-toggle');
  const close = form.querySelector('.header-search-close');
  const input = form.querySelector('input[name="q"]');
  if (!toggle || !input) return;

  if (location.pathname.endsWith('/search.html')) {
    input.value = new URLSearchParams(location.search).get('q') || '';
  }

  const setOpen = (open, focusInput = false) => {
    form.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close search' : 'Open search');
    if (focusInput && open) input.focus();
  };

  toggle.addEventListener('click', () => {
    const open = !form.classList.contains('is-open');
    setOpen(open, open);
  });

  close?.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });

  form.addEventListener('keydown', event => {
    if (event.key === 'Escape' && form.classList.contains('is-open') && !mobileHeaderSearch.matches) {
      event.preventDefault();
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener('pointerdown', event => {
    if (!mobileHeaderSearch.matches && form.classList.contains('is-open') && !form.contains(event.target)) {
      setOpen(false);
    }
  });
});
