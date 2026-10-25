const root = document.querySelector('#contentItemRoot');
const slug = new URLSearchParams(location.search).get('slug');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tagsOf = item => String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);

function safeUrl(value) {
  try {
    const url = new URL(value, location.href);
    return ['http:','https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function embedUrl(raw, kind) {
  const source = safeUrl(raw);
  if (!source) return '';
  try {
    const url = new URL(source);
    if (kind === 'video') {
      if (url.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
      if (url.hostname.includes('youtube.com')) {
        const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
        if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      }
      if (url.hostname.includes('vimeo.com')) {
        const id = url.pathname.split('/').filter(Boolean).pop();
        if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      }
    }
    if (kind === 'podcast' && url.hostname.includes('open.spotify.com')) return `${url.origin}/embed${url.pathname}`;
  } catch {}
  return '';
}

function renderItem(item) {
  document.title = `${item.title} — alexore`;
  const shopItem = ['book','product'].includes(item.kind);
  const sectionUrl = shopItem ? 'products.html' : 'media.html';
  const sectionName = shopItem ? 'BOOKS & PRODUCTS' : 'VIDEO & PODCAST';
  const image = safeUrl(item.coverImage);
  const media = safeUrl(item.mediaUrl);
  let player = '';
  if (item.kind === 'video' && media) {
    const embed = embedUrl(media, 'video');
    if (embed) player = `<iframe class="catalog-media-player" src="${esc(embed)}" title="${esc(item.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>`;
    else if (/\.(mp4|webm|mov)(\?|$)/i.test(media)) player = `<video class="catalog-media-player" src="${esc(media)}" controls playsinline></video>`;
    else player = `<a class="button button-dark" href="${esc(media)}" target="_blank" rel="noopener">Watch video ↗</a>`;
  }
  if (item.kind === 'podcast' && media) {
    if (/\.(mp3|m4a|ogg|wav)(\?|$)/i.test(media)) player = `<audio class="catalog-audio-player" src="${esc(media)}" controls preload="metadata"></audio>`;
    else {
      const embed = embedUrl(media, 'podcast');
      player = embed ? `<iframe class="catalog-media-player" src="${esc(embed)}" title="${esc(item.title)}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>` : `<a class="button button-dark" href="${esc(media)}" target="_blank" rel="noopener">Listen to episode ↗</a>`;
    }
  }
  const asset = safeUrl(item.assetUrl);
  const purchase = safeUrl(item.purchaseUrl);
  const actions = [];
  if (item.price && Number(item.price) > 0) actions.push(`<span class="detail-kicker">${esc(item.currency || 'NGN')} ${Number(item.price).toFixed(2)}</span>`);
  if (purchase) actions.push(`<a class="button button-dark" href="${esc(purchase)}" target="_blank" rel="noopener">Get this item <span>↗</span></a>`);
  else if (asset && (!item.price || Number(item.price) === 0)) actions.push(`<a class="button button-dark" href="${esc(asset)}" target="_blank" rel="noopener" download>Download file <span>↓</span></a>`);
  const body = String(item.body || '').split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean).map(paragraph => `<p>${esc(paragraph).replace(/\n/g,'<br>')}</p>`).join('');
  root.innerHTML = `<div class="detail-breadcrumb"><a href="index.html">HOME</a> / <a href="${sectionUrl}">${sectionName}</a> / ${item.kind.toUpperCase()}</div><article class="catalog-detail"><div class="eyebrow">${item.kind.toUpperCase()} · ${esc(item.date || '')}</div><h1>${esc(item.title)}</h1><a class="catalog-category" href="browse.html?category=${encodeURIComponent(item.category)}">${esc(item.category)}</a>${image ? `<div class="content-detail-cover" style="background-image:url('${esc(image)}')"></div>` : ''}<p class="detail-lead">${esc(item.summary)}</p>${player ? `<div class="content-detail-actions">${player}</div>` : ''}<div class="catalog-filter-row">${tagsOf(item).map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join('')}</div>${body ? `<div class="content-detail-copy">${body}</div>` : ''}<div class="content-detail-actions">${actions.join('')}</div><div class="article-bottom"><a href="${sectionUrl}">← More ${shopItem ? 'books & products' : 'videos & podcasts'}</a><a href="writing.html">Explore all writing ↗</a></div></article>`;
}

if (!slug) root.innerHTML = '<div class="empty-state">This item is not available.</div>';
else fetch(`api/index.php?route=content-item&slug=${encodeURIComponent(slug)}`)
  .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unavailable'); renderItem(result.item); })
  .catch(() => { root.innerHTML = '<div class="article-not-found"><div class="eyebrow">A PAGE IN THE MAKING</div><h1>This item isn’t here yet.</h1><a class="text-link" href="products.html">Back to the shop →</a></div>'; });
