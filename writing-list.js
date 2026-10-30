const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tagsOf = item => String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
const list = document.querySelector('#writingList');
const search = document.querySelector('#catalogSearch');
const empty = document.querySelector('#catalogEmpty');
let articles = [];

function renderWriting() {
  const query = (search.value || '').toLocaleLowerCase();
  const results = articles.filter(item => [item.title,item.category,item.deck,item.tags].join(' ').toLocaleLowerCase().includes(query));
  list.innerHTML = results.map(item => {
    const url = `article.html?slug=${encodeURIComponent(item.slug)}`;
    const image = /^https?:\/\//i.test(item.coverImage || '') || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(item.coverImage || '') ? item.coverImage : '';
    return `<article class="post-card catalog-card"><a href="${url}" class="post-art art-blue" aria-label="Read ${esc(item.title)}" ${image ? `style="background-image:url('${esc(image)}');background-size:cover;background-position:center;color:white"` : ''}><span>${esc(item.category).toUpperCase()}</span><b>✳</b><div class="blue-orbit"></div></a><div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(item.category)}">${esc(item.category).toUpperCase()}</a><time>${esc(item.date || '').toUpperCase()}</time><span>${esc(item.read || '').toUpperCase()}</span></div><h3>${esc(item.title)}</h3><p class="catalog-card-summary">${esc(item.deck || '')}</p><div class="catalog-tags">${tagsOf(item).map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join('')}</div><a class="card-arrow" href="${url}">Read article ↗</a></article>`;
  }).join('');
  empty.classList.toggle('hidden', results.length > 0);
}

search.addEventListener('input', renderWriting);
fetch('api/index.php?route=articles')
  .then(response => response.json())
  .then(({articles: published = []}) => { articles = published; renderWriting(); })
  .catch(() => { articles = window.ALEXORE_CONTENT?.articles || []; renderWriting(); });
// Writing archive: fetch published articles and filter the list as the reader types.
