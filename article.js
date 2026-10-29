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
  root.innerHTML = `<article class="article-wrap"><a class="article-back" href="writing.html">← Back to the notebook</a>${item.sample ? '<p class="article-sample-note">SAMPLE ARTICLE · PREVIEW CONTENT</p>' : ''}<div class="article-meta article-meta-top"><a href="browse.html?category=${encodeURIComponent(item.category)}">${escapeHtml(item.category).toUpperCase()}</a> · ${escapeHtml(readingTime).toUpperCase()} · ${escapeHtml(item.date)}</div><div class="article-hero ${sampleCover ? 'has-sample-art' : ''}">${sampleCover}</div><div class="article-meta">ALEXORE · ${escapeHtml(item.date).toUpperCase()}</div><h1>${escapeHtml(item.title)}</h1><p class="article-deck">${escapeHtml(item.deck)}</p>${tags.length ? `<div class="article-tags" aria-label="Article tags">${tags.map(tag => `<a href="browse.html?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join('')}</div>` : ''}<div class="article-body">${cleanArticleHtml(item.body || '<p>This story is just getting started.</p>')}</div><section class="article-engagement" aria-label="Article reactions and comments"><div class="article-like-row"><div><div class="eyebrow">A NOTE BACK</div><p>If this stayed with you, leave a little appreciation.</p></div><button class="article-like-button" id="articleLikeButton" type="button" aria-pressed="false"><span aria-hidden="true">♡</span><span id="articleLikeCount">${Number(item.likeCount) || 0} likes</span></button></div><div class="comments-section"><div class="comments-heading"><div><h2>Join the conversation</h2><p>No account needed. Comments are reviewed before they appear.</p></div><span class="eyebrow" id="articleCommentCount">${Number(item.commentCount) || 0} COMMENTS</span></div><div class="comment-list" id="articleCommentList" aria-live="polite"><p class="comment-empty">Loading comments…</p></div><form class="comment-form" id="articleCommentForm"><h3>Leave a comment</h3><p>Share a thoughtful response. Your email will stay private.</p><label class="comment-check"><input type="checkbox" name="anonymous"> <span>Comment anonymously</span></label><div id="commentIdentity"><label>Your name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label class="comment-check"><input type="checkbox" name="newsletter"> <span>Also add me to the occasional email newsletter.</span></label></div><label>Your comment<textarea name="comment" maxlength="3000" required></textarea></label><small>Up to 3,000 characters. No links or HTML are needed.</small><button class="button button-dark" type="submit">Post comment <span>↗</span></button><p class="comment-message" id="commentMessage" role="status"></p></form></div></section><div class="article-bottom"><a href="writing.html">← More writing</a><a href="index.html#newsletter">Get the notes ↗</a></div></article>`;
  if (/^(https?:\/\/|uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$)/i.test(item.coverImage || '')) {
    const hero = root.querySelector('.article-hero');
    hero.style.backgroundImage = `linear-gradient(0deg,rgba(14,25,29,.2),rgba(14,25,29,.03)),url(${JSON.stringify(item.coverImage)})`;
    hero.style.backgroundSize = 'cover'; hero.style.backgroundPosition = 'center'; hero.classList.add('has-cover');
  }
  if (!item.sample) setupArticleEngagement(item);
  else {
    root.querySelector('#articleLikeButton').disabled = true;
    root.querySelector('#articleCommentList').innerHTML = '<p class="comment-empty">This is a sample article. Publish it from Studio to enable reader comments and likes.</p>';
    root.querySelectorAll('#articleCommentForm input, #articleCommentForm textarea, #articleCommentForm button').forEach(control => { control.disabled = true; });
    root.querySelector('#commentMessage').textContent = 'Comments and likes will open when this article is published.';
  }
}

function getVisitorId() {
  const key = 'alexore-reader-id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || Array.from({length:32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return Array.from({length:32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

async function setupArticleEngagement(item) {
  const likeButton = root.querySelector('#articleLikeButton');
  const likeCount = root.querySelector('#articleLikeCount');
  const commentList = root.querySelector('#articleCommentList');
  const commentsCount = root.querySelector('#articleCommentCount');
  const form = root.querySelector('#articleCommentForm');
  const anonymousToggle = form.elements.anonymous;
  const identity = root.querySelector('#commentIdentity');
  const message = root.querySelector('#commentMessage');
  const visitorId = getVisitorId();
  const setLike = (liked, count) => {
    likeButton.setAttribute('aria-pressed', String(liked));
    likeButton.querySelector('[aria-hidden="true"]').textContent = liked ? '♥' : '♡';
    likeCount.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
  };
  likeButton.disabled = true;
  fetch(`api/index.php?route=like&slug=${encodeURIComponent(item.slug)}&visitorId=${encodeURIComponent(visitorId)}`, {headers:{'Accept':'application/json'}})
    .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || ''); setLike(result.liked, result.count); })
    .catch(() => {})
    .finally(() => { likeButton.disabled = false; });
  const loadComments = async () => {
    const response = await fetch(`api/index.php?route=comments&slug=${encodeURIComponent(item.slug)}`, {headers:{'Accept':'application/json'}});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Comments could not be loaded.');
    const comments = result.comments || [];
    commentsCount.textContent = `${comments.length} ${comments.length === 1 ? 'COMMENT' : 'COMMENTS'}`;
    commentList.innerHTML = comments.length ? comments.map(comment => `<article class="comment-item"><header><b>${escapeHtml(comment.isAnonymous ? 'Anonymous' : comment.displayName)}</b><time>${escapeHtml(comment.date)}</time></header><p>${escapeHtml(comment.commentText)}</p></article>`).join('') : '<p class="comment-empty">Be the first to leave a thoughtful response.</p>';
  };
  try { await loadComments(); }
  catch { commentList.innerHTML = '<p class="comment-empty">Comments are temporarily unavailable. Please try again later.</p>'; }
  likeButton.addEventListener('click', async () => {
    likeButton.disabled = true;
    try {
      const response = await fetch('api/index.php?route=like', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({slug:item.slug,visitorId})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your reaction could not be saved.');
      setLike(result.liked, result.count);
    } catch (error) { message.textContent = error.message; message.classList.add('comment-error'); }
    finally { likeButton.disabled = false; }
  });
  anonymousToggle.addEventListener('change', () => {
    identity.hidden = anonymousToggle.checked;
    form.elements.name.required = !anonymousToggle.checked;
    form.elements.email.required = !anonymousToggle.checked;
    if (anonymousToggle.checked) form.elements.newsletter.checked = false;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    message.classList.remove('comment-error');
    const data = {slug:item.slug, comment:form.elements.comment.value, anonymous:anonymousToggle.checked};
    if (!anonymousToggle.checked) {
      data.name = form.elements.name.value.trim();
      data.email = form.elements.email.value.trim();
      data.newsletter = form.elements.newsletter.checked;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const response = await fetch('api/index.php?route=comments', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your comment could not be submitted.');
      form.reset();
      identity.hidden = false;
      form.elements.name.required = true;
      form.elements.email.required = true;
      message.textContent = result.message;
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('comment-error');
    } finally { submit.disabled = false; }
  });
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
