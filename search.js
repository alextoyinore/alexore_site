const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const params = new URLSearchParams(location.search);
const input = document.querySelector('#globalSearchInput');
const form = document.querySelector('#globalSearchForm');
const resultsNode = document.querySelector('#searchResults');
const emptyNode = document.querySelector('#searchEmpty');
const countNode = document.querySelector('#searchResultCount');
const headingNode = document.querySelector('#searchResultsHeading');
const filters = [...document.querySelectorAll('.search-filter')];
const icons = {article:'✳',book:'▤',product:'◇',video:'▶',podcast:'◖'};
const labels = {article:'WRITING',book:'BOOK',product:'DIGITAL PRODUCT',video:'VIDEO',podcast:'PODCAST'};
let items = [];
let activeKind = 'all';

input.value = params.get('q') || '';

function tagsOf(item) {
  return String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
}

function searchableText(item) {
  const body = String(item.body || '').replace(/<[^>]*>/g, ' ');
  return [item.title, item.category, item.tags, item.deck, item.summary, body]
    .join(' ').normalize('NFKC').toLocaleLowerCase();
}

function score(item, query) {
  const title = String(item.title || '').normalize('NFKC').toLocaleLowerCase();
  const categoryAndTags = `${item.category || ''} ${item.tags || ''}`.normalize('NFKC').toLocaleLowerCase();
  return query.reduce((total, term) => total
    + (title.startsWith(term) ? 12 : title.includes(term) ? 8 : 0)
    + (categoryAndTags.includes(term) ? 5 : 0)
    + (searchableText(item).includes(term) ? 1 : 0), 0);
}

function card(item) {
  const article = item.kind === 'article';
  const url = article
    ? `article.html?slug=${encodeURIComponent(item.slug)}`
    : `content-item.html?slug=${encodeURIComponent(item.slug)}`;
  const title = esc(item.title);
  const category = item.category || 'Notes';
  const summary = item.deck || item.summary || '';
  const image = /^https?:\/\//i.test(item.coverImage || '')
    || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(item.coverImage || '')
    ? item.coverImage : '';
  const action = article ? 'Read article' : item.kind === 'video' ? 'Watch video'
    : item.kind === 'podcast' ? 'Listen to episode'
    : item.purchaseUrl ? 'Get this item' : item.assetUrl ? 'Download' : 'View details';
  const readTime = article && item.read ? `<span>${esc(item.read).toUpperCase()}</span>` : '';

  return `<article class="post-card catalog-card">
    <a href="${url}" class="post-art art-blue" aria-label="Open ${title}" ${image ? `style="background-image:url('${esc(image)}');background-size:cover;background-position:center;color:white"` : ''}>
      <span>${esc(category).toUpperCase()}</span><b>${icons[item.kind] || '✳'}</b>
    </a>
    <div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(category)}">${esc(category).toUpperCase()}</a><span>${labels[item.kind] || ''}</span>${readTime}<time>${esc(item.date || '').toUpperCase()}</time></div>
    <h3><a href="${url}">${title}</a></h3>
    ${summary ? `<p class="catalog-card-summary">${esc(summary)}</p>` : ''}
    <div class="catalog-tags">${tagsOf(item).map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join('')}</div>
    <a class="card-arrow" href="${url}">${action} ↗</a>
  </article>`;
}

function render() {
  const queryText = input.value.trim();
  const terms = queryText.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter(item => (activeKind === 'all' || item.kind === activeKind)
    && terms.every(term => searchableText(item).includes(term)));
  if (terms.length) matches.sort((a, b) => score(b, terms) - score(a, terms));

  resultsNode.innerHTML = matches.map(card).join('');
  resultsNode.setAttribute('aria-busy', 'false');
  headingNode.textContent = queryText ? `Results for “${queryText}”` : 'Recent work';
  countNode.textContent = `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`;
  emptyNode.classList.toggle('hidden', matches.length > 0);
  emptyNode.textContent = queryText ? 'No published items matched that search. Try another word or content type.' : 'No published items are available yet.';

  const nextUrl = new URL(location.href);
  if (queryText) nextUrl.searchParams.set('q', queryText);
  else nextUrl.searchParams.delete('q');
  history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  render();
});
input.addEventListener('input', render);
filters.forEach(filter => filter.addEventListener('click', () => {
  activeKind = filter.dataset.kind;
  filters.forEach(button => {
    const selected = button === filter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  render();
}));

Promise.all([
  fetch('api/index.php?route=articles', {headers:{'Accept':'application/json'}})
    .then(response => { if (!response.ok) throw new Error('Writing is temporarily unavailable.'); return response.json(); })
    .then(result => (result.articles || []).map(item => ({...item, kind:'article'}))),
  fetch('api/index.php?route=content', {headers:{'Accept':'application/json'}})
    .then(response => { if (!response.ok) throw new Error('The library is temporarily unavailable.'); return response.json(); })
    .then(result => result.items || [])
]).then(groups => {
  items = groups.flat();
  render();
}).catch(() => {
  resultsNode.setAttribute('aria-busy', 'false');
  countNode.textContent = '';
  headingNode.textContent = 'Search unavailable';
  emptyNode.textContent = 'Published content could not be loaded. Please try again in a moment.';
  emptyNode.classList.remove('hidden');
});
