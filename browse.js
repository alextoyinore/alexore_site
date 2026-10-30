// Category/tag browse page: read the filter from the URL and render matching published items.
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tagsOf = item => String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
const params = new URLSearchParams(location.search);
const tag = params.get('tag');
const category = params.get('category');
const value = (tag || category || '').trim();
document.querySelector('#browseType').textContent = tag ? 'TAG' : 'CATEGORY';
document.querySelector('#browseHeading').textContent = value || 'Explore';
document.querySelector('#browseCopy').textContent = tag ? `Every published item tagged “${value}”.` : `Published items filed under “${value}”.`;
const list = document.querySelector('#browseList');
const empty = document.querySelector('#catalogEmpty');
const labels = {article:'WRITING',book:'BOOK',product:'PRODUCT',video:'VIDEO',podcast:'PODCAST'};

function card(item) {
  const article = item.kind === 'article';
  const url = article ? `article.html?slug=${encodeURIComponent(item.slug)}` : `content-item.html?slug=${encodeURIComponent(item.slug)}`;
  const title = esc(item.title), categoryName = item.category || 'Notes';
  const summary = item.deck || item.summary || '';
  const image = /^https?:\/\//i.test(item.coverImage || '') || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(item.coverImage || '') ? item.coverImage : '';
  const icon = article ? '✳' : ({book:'▤',product:'◇',video:'▶',podcast:'◖'}[item.kind] || '✳');
  const action = article ? 'Read article' : item.kind === 'video' ? 'Watch video' : item.kind === 'podcast' ? 'Listen to episode' : 'View details';
  return `<article class="post-card catalog-card"><a href="${url}" class="post-art art-blue" ${image ? `style="background-image:url('${esc(image)}');background-size:cover;background-position:center;color:white"` : ''}><span>${esc(categoryName).toUpperCase()}</span><b>${icon}</b><div class="blue-orbit"></div></a><div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(categoryName)}">${esc(categoryName).toUpperCase()}</a><span>${labels[item.kind] || ''}</span><time>${esc(item.date || '').toUpperCase()}</time></div><h3><a href="${url}">${title}</a></h3><p class="catalog-card-summary">${esc(summary)}</p><div class="catalog-tags">${tagsOf(item).map(value => `<a href="browse.html?tag=${encodeURIComponent(value)}">#${esc(value)}</a>`).join('')}</div><a class="card-arrow" href="${url}">${action} ↗</a></article>`;
}

Promise.all([
  fetch('api/index.php?route=articles').then(response => response.json()).then(result => (result.articles || []).map(item => ({...item,kind:'article'}))),
  fetch('api/index.php?route=content').then(response => response.json()).then(result => result.items || [])
]).then(groups => {
  const all = groups.flat();
  const results = all.filter(item => tag
    ? tagsOf(item).some(itemTag => itemTag.toLocaleLowerCase() === value.toLocaleLowerCase())
    : String(item.category || '').toLocaleLowerCase() === value.toLocaleLowerCase());
  list.innerHTML = results.map(card).join('');
  empty.classList.toggle('hidden', results.length > 0);
}).catch(() => empty.classList.remove('hidden'));
