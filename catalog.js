const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tagsOf = item => String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
const labels = {book:'BOOK',product:'DIGITAL PRODUCT',video:'VIDEO',podcast:'PODCAST'};
const icons = {book:'▤',product:'◇',video:'▶',podcast:'◖'};
const list = document.querySelector('#catalogItems');
const empty = document.querySelector('#catalogEmpty');

function card(item) {
  const url = `content-item.html?slug=${encodeURIComponent(item.slug)}`;
  const image = /^https?:\/\//i.test(item.coverImage || '') || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(item.coverImage || '') ? item.coverImage : '';
  const action = item.kind === 'video' ? 'Watch video' : item.kind === 'podcast' ? 'Listen to episode' : item.purchaseUrl ? 'Get this item' : item.assetUrl ? 'Download' : 'View details';
  return `<article class="post-card catalog-card"><a href="${url}" class="post-art art-blue" ${image ? `style="background-image:url('${esc(image)}');background-size:cover;background-position:center;color:white"` : ''}><span>${esc(item.category).toUpperCase()}</span><b>${icons[item.kind] || '✳'}</b><div class="blue-orbit"></div></a><div class="post-meta"><a class="tag" href="browse.html?category=${encodeURIComponent(item.category)}">${esc(item.category).toUpperCase()}</a><span>${labels[item.kind] || ''}</span><time>${esc(item.date || '').toUpperCase()}</time></div><h3><a href="${url}">${esc(item.title)}</a></h3><p class="catalog-card-summary">${esc(item.summary)}</p><div class="catalog-tags">${tagsOf(item).map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join('')}</div><a class="card-arrow" href="${url}">${action} ↗</a></article>`;
}

const kinds = (list?.dataset.kinds || '').split(',').filter(Boolean);
fetch('api/index.php?route=content')
  .then(response => response.json())
  .then(({items = []}) => {
    const results = items.filter(item => kinds.includes(item.kind));
    list.innerHTML = results.map(card).join('');
    empty?.classList.toggle('hidden', results.length > 0);
  })
  .catch(() => empty?.classList.remove('hidden'));