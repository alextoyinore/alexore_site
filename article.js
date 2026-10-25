const root = document.querySelector('#articleRoot');
const slug = new URLSearchParams(location.search).get('slug');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const allowedTags = new Set(['P','H2','H3','BLOCKQUOTE','UL','OL','LI','STRONG','B','EM','I','U','A','BR','HR','IMG']);

function cleanArticleHtml(html) {
  const documentFragment = new DOMParser().parseFromString(html || '', 'text/html');
  const cleanNode = node => [...node.children].forEach(child => {
    if (!allowedTags.has(child.tagName)) { child.replaceWith(...child.childNodes); return; }
    [...child.attributes].forEach(attribute => {
      if (!((child.tagName === 'A' && attribute.name === 'href') || (child.tagName === 'IMG' && ['src','alt'].includes(attribute.name)))) child.removeAttribute(attribute.name);
    });
    if (child.tagName === 'A' && !/^https?:\/\//i.test(child.getAttribute('href') || '')) child.removeAttribute('href');
    if (child.tagName === 'IMG' && !(/^https?:\/\//i.test(child.getAttribute('src') || '') || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(child.getAttribute('src') || ''))) child.remove();
    cleanNode(child);
  });
  cleanNode(documentFragment.body);
  return documentFragment.body.innerHTML;
}

function showNotFound() {
  root.innerHTML = '<div class="article-not-found"><div class="eyebrow">A PAGE IN THE MAKING</div><h1>That story isn’t here yet.</h1><a class="text-link" href="writing.html">Back to the notebook →</a></div>';
}

function articleReadingTime(html = '') {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  return `${Math.max(1, Math.ceil(words.length / 220))} min read`;
}

function sampleCoverMarkup(slug) {
  const covers = {
    'the-quiet-courage-of-starting-again': '<div class="article-cover-art article-cover-featured featured-art"><div class="sun-disc"></div><div class="feature-shape shape-a"></div><div class="feature-shape shape-b"></div><div class="feature-shape shape-c"></div><span>FIELD NOTES<br>NO. 001</span><b>✳</b></div>',
    'good-work-takes-the-time-it-takes': '<div class="article-cover-art article-cover-card post-art art-green"><span>THE LONG GAME</span><b>↗</b><div class="line-curve"></div></div>',
    'what-does-enough-look-like': '<div class="article-cover-art article-cover-card post-art art-peach"><span>ON MONEY & MEANING</span><b>✳</b><div class="coin-shape">₦</div></div>',
    'staying-human-in-the-age-of-ai': '<div class="article-cover-art article-cover-card post-art art-blue"><span>LEARNING IN PUBLIC</span><b>✦</b><div class="blue-orbit"></div></div>'
  };
  return covers[slug] || '';
}

function renderArticle(item) {
  const readingTime = articleReadingTime(item.body || '');
  const tags = String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
  const sampleCover = item.sample ? sampleCoverMarkup(slug) : '';
  document.title = `${item.title} — alexore`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', item.seoDescription || item.deck || 'Notes on work, money, becoming, and conversations that matter. Christ-like.');
  root.innerHTML = `<article class="article-wrap"><a class="article-back" href="writing.html">← Back to the notebook</a>${item.sample ? '<p class="article-sample-note">SAMPLE ARTICLE · PREVIEW CONTENT</p>' : ''}<div class="article-meta article-meta-top"><a href="browse.html?category=${encodeURIComponent(item.category)}">${escapeHtml(item.category).toUpperCase()}</a> · ${escapeHtml(readingTime).toUpperCase()} · ${escapeHtml(item.date)}</div><div class="article-hero ${sampleCover ? 'has-sample-art' : ''}">${sampleCover}</div><div class="article-meta">ALEXORE · ${escapeHtml(item.date).toUpperCase()}</div><h1>${escapeHtml(item.title)}</h1><p class="article-deck">${escapeHtml(item.deck)}</p>${tags.length ? `<div class="article-tags" aria-label="Article tags">${tags.map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join('')}</div>` : ''}<div class="article-body">${cleanArticleHtml(item.body || '<p>This story is just getting started.</p>')}</div><div class="article-bottom"><a href="writing.html">← More writing</a><a href="index.html#newsletter">Get the notes ↗</a></div></article>`;
  if (/^(https?:\/\/|uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$)/i.test(item.coverImage || '')) {
    const hero = root.querySelector('.article-hero');
    hero.style.backgroundImage = `linear-gradient(0deg,rgba(14,25,29,.2),rgba(14,25,29,.03)),url(${JSON.stringify(item.coverImage)})`;
    hero.style.backgroundSize = 'cover'; hero.style.backgroundPosition = 'center'; hero.classList.add('has-cover');
  }
}

const sampleArticle = window.ALEXORE_CONTENT?.articles?.find(item => item.slug === slug);
if (!slug) showNotFound();
else {
  if (sampleArticle) renderArticle({...sampleArticle, sample:true});
  fetch(`api/index.php?route=article&slug=${encodeURIComponent(slug)}`, {headers:{'Accept':'application/json'}})
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Article not found.');
      renderArticle(result.article);
    })
    .catch(() => { if (!sampleArticle) showNotFound(); });
}
