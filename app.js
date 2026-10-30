// Home page behavior: navigation, newsletter signup, latest articles, and public site settings.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const menuButton = document.querySelector('.menu-button');
menuButton?.addEventListener('click', () => {
  const open = document.querySelector('.main-nav')?.classList.toggle('open') || false;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

document.querySelectorAll('.main-nav a').forEach(link => {
  const url = new URL(link.href, location.href);
  if (url.pathname === location.pathname && url.hash === location.hash) link.classList.add('active');
  link.addEventListener('click', () => {
    document.querySelector('.main-nav')?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded','false');
    menuButton?.setAttribute('aria-label','Open navigation');
  });
});

document.querySelector('#subscribeForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const emailInput = form.querySelector('#email');
  const email = emailInput.value.trim();
  const message = document.querySelector('#subscribeMessage');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  emailInput.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message.textContent = 'Adding you to the list…';
  try {
    const response = await fetch('api/index.php?route=subscribe', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({email}), credentials:'same-origin'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not join the list.');
    message.textContent = result.message;
    form.reset();
  } catch (error) {
    message.textContent = `${error.message} Please try again soon.`;
  } finally {
    button.disabled = false;
    emailInput.disabled = false;
    form.removeAttribute('aria-busy');
  }
});

// The article API returns newest-first; show one featured story plus six cards (seven total).
fetch('api/index.php?route=articles', {headers:{'Accept':'application/json'}})
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(({articles=[]}) => {
    const grid = document.querySelector('.post-grid');
    if (!grid || !articles.length) return;
    const coverIsUsable = url => /^https?:\/\//i.test(url || '') || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(url || '');
    const latestArticles = articles.slice(0, 7);
    const featured = latestArticles[0];
    const featuredPanel = document.querySelector('.featured-post');
    if (featuredPanel) {
      const art = featuredPanel.querySelector('.featured-art');
      const copy = featuredPanel.querySelector('.featured-copy');
      copy.innerHTML = `<div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(featured.category)}">${escapeHtml(featured.category).toUpperCase()}</a><span>${escapeHtml(featured.read).toUpperCase()}</span><span>✳</span><time>${escapeHtml(featured.date).toUpperCase()}</time></div><h3>${escapeHtml(featured.title)}</h3><p>${escapeHtml(featured.deck || '')}</p><a class="read-link" href="article.html?slug=${encodeURIComponent(featured.slug)}">Read the story <span>↗</span></a>`;
      if (coverIsUsable(featured.coverImage)) {
        art.classList.add('has-cover');
        art.style.backgroundImage = `url(${JSON.stringify(featured.coverImage)})`;
        art.style.backgroundSize = 'cover'; art.style.backgroundPosition = 'center';
      } else art.classList.remove('has-cover');
    }
    grid.replaceChildren();
    latestArticles.slice(1).forEach(article => {
      const card = document.createElement('article');
      card.className = 'post-card';
      const target = `article.html?slug=${encodeURIComponent(article.slug)}`;
      card.innerHTML = `<a href="${target}" aria-label="Read ${escapeHtml(article.title)}"><div class="post-art art-blue"><span>${escapeHtml(article.category).toUpperCase()}</span><b>✳</b><div class="blue-orbit"></div></div></a><div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(article.category)}">${escapeHtml(article.category).toUpperCase()}</a><time>${escapeHtml(article.date).toUpperCase()}</time><span>${escapeHtml(article.read).toUpperCase()}</span></div><h3>${escapeHtml(article.title)}</h3><a class="card-arrow" href="${target}">Read article ↗</a>`;
      const artwork = card.querySelector('.post-art');
      if (coverIsUsable(article.coverImage)) {
        artwork.style.backgroundImage = `url(${JSON.stringify(article.coverImage)})`;
        artwork.style.backgroundSize = 'cover'; artwork.style.backgroundPosition = 'center';
      }
      grid.append(card);
    });
  }).catch(() => {});

// Public settings supply editable page copy and the social profile destinations.
fetch('api/index.php?route=settings', {headers:{'Accept':'application/json'}})
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(({settings={}}) => {
    document.querySelectorAll('[data-setting]').forEach(node => {
      const value = settings[node.dataset.setting];
      if (typeof value !== 'string' || !value.trim()) return;
      if (node.hasAttribute('data-setting-lines')) node.innerHTML = value.trim().split(/\r?\n/).map(line => line.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))).join('<br>');
      else node.textContent = value.trim();
    });
    document.querySelectorAll('[data-social]').forEach(link => {
      const url = settings[link.dataset.social];
      if (url && /^https?:\/\//i.test(url)) { link.href=url; link.target='_blank'; link.rel='noopener noreferrer'; }
      else link.hidden=true;
    });
  }).catch(() => document.querySelectorAll('[data-social]').forEach(link => link.hidden=true));
