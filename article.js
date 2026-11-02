// Article detail behavior: render published content, build sharing links, and manage reader reactions/comments.
const root = document.querySelector('#articleRoot');
const slug = new URLSearchParams(location.search).get('slug');
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const allowedTags = new Set([
  'P',
  'H2',
  'H3',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'A',
  'BR',
  'HR',
  'IMG',
  'DIV',
  'SPAN',
  'MARK',
]);
const normalizeHighlightColor = (color = '') => {
  const value = String(color).trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(value)) return value;
  const rgb = value.match(/^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/);
  if (!rgb || rgb.slice(1).some((part) => Number(part) > 255)) return '';
  return `#${rgb
    .slice(1)
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;
};
const normalizeTextAlignment = (alignment = '') =>
  ['left', 'center', 'right'].includes(String(alignment).toLowerCase())
    ? String(alignment).toLowerCase()
    : '';

function cleanArticleHtml(html) {
  // Allow a small set of editorial elements and strip attributes that could execute injected code.
  const documentFragment = new DOMParser().parseFromString(html || '', 'text/html');
  const cleanNode = (node) => {
    [...node.children].forEach((originalChild) => {
      let child = originalChild;
      if (child.tagName === 'SPAN') {
        const color = normalizeHighlightColor(child.style.backgroundColor);
        if (!color) {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }
        const mark = document.createElement('mark');
        mark.dataset.highlight = color;
        mark.append(...child.childNodes);
        child.replaceWith(mark);
        child = mark;
      }
      if (!allowedTags.has(child.tagName)) {
        cleanNode(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      const highlight = normalizeHighlightColor(
        child.getAttribute('data-highlight') || child.style.backgroundColor
      );
      const alignment = normalizeTextAlignment(
        child.getAttribute('data-align') || child.style.textAlign
      );
      [...child.attributes].forEach((attribute) => {
        if (!(
          (child.tagName === 'A' && attribute.name === 'href') ||
          (child.tagName === 'IMG' && ['src', 'alt'].includes(attribute.name)) ||
          (child.tagName === 'MARK' && attribute.name === 'data-highlight') ||
          (['P', 'DIV'].includes(child.tagName) && attribute.name === 'data-align')
        ))
          child.removeAttribute(attribute.name);
      });
      if (child.tagName === 'MARK') {
        if (highlight) {
          child.setAttribute('data-highlight', highlight);
          child.style.backgroundColor = highlight;
        } else {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }
      }
      if (['P', 'DIV'].includes(child.tagName)) {
        if (alignment) child.setAttribute('data-align', alignment);
        else child.removeAttribute('data-align');
      }
      if (child.tagName === 'A' && !/^https?:\/\//i.test(child.getAttribute('href') || ''))
        child.removeAttribute('href');
      if (
        child.tagName === 'IMG' &&
        !(
          /^https?:\/\//i.test(child.getAttribute('src') || '') ||
          /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(child.getAttribute('src') || '')
        )
      )
        child.remove();
      cleanNode(child);
    });
  };
  cleanNode(documentFragment.body);
  return documentFragment.body.innerHTML;
}

function cleanCommentHtml(html) {
  const allowed = new Set([
    'P',
    'DIV',
    'BR',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'A',
    'SPAN',
    'MARK',
  ]);
  const documentFragment = new DOMParser().parseFromString(html || '', 'text/html');
  const cleanNode = (node) => {
    [...node.children].forEach((originalChild) => {
      let child = originalChild;
      if (child.tagName === 'SPAN') {
        const color = normalizeHighlightColor(child.style.backgroundColor);
        if (!color) {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }
        const mark = document.createElement('mark');
        mark.dataset.highlight = color;
        mark.append(...child.childNodes);
        child.replaceWith(mark);
        child = mark;
      }
      if (!allowed.has(child.tagName)) {
        cleanNode(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      const tagName = child.tagName === 'DIV' ? 'P' : child.tagName.toLowerCase();
      const href = child.tagName === 'A' ? child.getAttribute('href') || '' : '';
      const highlight = normalizeHighlightColor(
        child.getAttribute('data-highlight') || child.style.backgroundColor
      );
      const alignment = normalizeTextAlignment(
        child.getAttribute('data-align') || child.style.textAlign
      );
      [...child.attributes].forEach((attribute) => {
        const keepHref = child.tagName === 'A' && attribute.name === 'href';
        const keepColor = child.tagName === 'MARK' && attribute.name === 'data-highlight';
        const keepAlignment =
          ['P', 'DIV'].includes(child.tagName) && attribute.name === 'data-align';
        if (!keepHref && !keepColor && !keepAlignment) child.removeAttribute(attribute.name);
      });
      if (child.tagName === 'MARK') {
        if (highlight) {
          child.setAttribute('data-highlight', highlight);
          child.style.backgroundColor = highlight;
        } else {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }
      }
      if (['P', 'DIV'].includes(child.tagName)) {
        if (alignment) child.setAttribute('data-align', alignment);
        else child.removeAttribute('data-align');
      }
      if (child.tagName === 'A' && /^https?:\/\//i.test(href)) {
        child.setAttribute('href', href);
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'nofollow noopener noreferrer');
      }
      if (tagName !== child.tagName.toLowerCase()) {
        const replacement = document.createElement(tagName);
        if (alignment) replacement.setAttribute('data-align', alignment);
        replacement.append(...child.childNodes);
        child.replaceWith(replacement);
        cleanNode(replacement);
      } else {
        cleanNode(child);
      }
    });
  };
  cleanNode(documentFragment.body);
  return documentFragment.body.innerHTML;
}

function installCommentEditor() {
  const textarea = root.querySelector('#articleCommentForm textarea[name="comment"]');
  if (!textarea) return;

  const field = document.createElement('div');
  field.className = 'comment-editor-field';
  field.innerHTML = `
    <span class="comment-field-label">Your comment</span>
    <div class="comment-editor-toolbar" role="toolbar" aria-label="Comment formatting">
      <button type="button" data-comment-command="bold" aria-label="Bold" title="Bold"><b>B</b></button>
      <button type="button" data-comment-command="italic" aria-label="Italic" title="Italic"><i>I</i></button>
      <button type="button" data-comment-command="underline" aria-label="Underline" title="Underline"><u>U</u></button>
      <button type="button" data-comment-command="insertUnorderedList" aria-label="Bulleted list" title="Bulleted list"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="3" cy="5" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="3" cy="15" r="1.2"/><path d="M7 5h10M7 10h10M7 15h10"/></svg></button>
      <button type="button" data-comment-command="justifyLeft" aria-label="Align left" title="Align left"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4h16M2 8h11M2 12h16M2 16h11"/></svg></button>
      <button type="button" data-comment-command="justifyCenter" aria-label="Align center" title="Align center"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4h16M4 8h12M2 12h16M4 16h12"/></svg></button>
      <button type="button" data-comment-command="justifyRight" aria-label="Align right" title="Align right"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4h16M7 8h11M2 12h16M7 16h11"/></svg></button>
      <button type="button" data-comment-command="formatBlock" data-comment-value="blockquote" aria-label="Quote" title="Quote">“ ”</button>
      <button type="button" data-comment-link aria-label="Add link" title="Add link"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 12l4-4M7 7l-2 2a3 3 0 004 4l2-2M13 13l2-2a3 3 0 00-4-4L9 9"/></svg></button>
      <div class="highlight-picker">
        <button type="button" class="highlight-picker-toggle" aria-label="Text highlight color" title="Text highlight color" aria-expanded="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 13l7-10 6 4-7 10H4zM2 17h15M13 5l4 3"/></svg><span class="highlight-current" style="background:#fff2a8"></span><span aria-hidden="true">⌄</span></button>
        <div class="highlight-picker-menu" hidden>
          <div class="highlight-color-grid" role="group" aria-label="Preset highlight colors">${['#fff2a8', '#ffe0b2', '#ffd6d6', '#f7d5e3', '#e6d5fa', '#cfe6ff', '#c7efd8', '#d8f0e8', '#e8e8e8', '#ffffff', '#ffc8a8', '#e4f2a8'].map((color) => `<button type="button" class="highlight-color-choice" data-comment-highlight="${color}" style="--highlight-color:${color}" aria-label="Highlight ${color}" title="${color}"></button>`).join('')}</div>
          <label class="highlight-custom-choice">Custom color <input type="color" value="#fff2a8" aria-label="Choose custom highlight color"></label>
        </div>
      </div>
    </div>
    <div id="commentEditor" class="comment-rich-editor" contenteditable="true" role="textbox" aria-label="Your comment" aria-multiline="true" data-placeholder="Write your response…"></div>
    <input type="hidden" name="comment">
    <div class="comment-editor-footer"><small>Up to 3,000 characters. Links and basic formatting are supported.</small><small id="commentEditorCount">0 / 3,000</small></div>
  `;
  textarea.parentElement.replaceWith(field);
}

function showNotFound() {
  root.innerHTML =
    '<div class="article-not-found"><div class="eyebrow">A PAGE IN THE MAKING</div><h1>That story isn’t here yet.</h1><a class="text-link" href="writing.html">Back to the notebook →</a></div>';
}

function articleReadingTime(html = '') {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  return `${Math.max(1, Math.ceil(words.length / 220))} min read`;
}

function setupArticleSharing(item) {
  // Use direct share URLs so each service works even where the browser share sheet is unavailable.
  const articleBody = root.querySelector('.article-body');
  if (!articleBody) return;

  const shareSection = document.createElement('section');
  shareSection.className = 'article-share';
  shareSection.setAttribute('aria-label', 'Share this article');
  shareSection.innerHTML = `<div class="article-share-heading"><div class="eyebrow">PASS IT ALONG</div><p>Share this story with someone.</p></div><div class="article-share-actions" aria-label="Share options"><button class="article-share-action" type="button" data-share-native>Share…</button><button class="article-share-action" type="button" data-share-copy>Copy link</button><a class="article-share-action" data-share="whatsapp" target="_blank" rel="noopener noreferrer">WhatsApp</a><a class="article-share-action" data-share="telegram" target="_blank" rel="noopener noreferrer">Telegram</a><a class="article-share-action" data-share="x" target="_blank" rel="noopener noreferrer">X</a><a class="article-share-action" data-share="facebook" target="_blank" rel="noopener noreferrer">Facebook</a><a class="article-share-action" data-share="linkedin" target="_blank" rel="noopener noreferrer">LinkedIn</a><a class="article-share-action" data-share="email">Email</a></div><p class="article-share-status" role="status" aria-live="polite"></p>`;
  articleBody.after(shareSection);

  const shareUrl = new URL(location.href);
  shareUrl.hash = '';
  const url = shareUrl.toString();
  const title = item.title || document.title;
  const text = `${title} — ${url}`;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);
  const targets = {
    whatsapp: `https://wa.me/?text=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    x: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedText}`,
  };
  shareSection.querySelectorAll('[data-share]').forEach((link) => {
    link.href = targets[link.dataset.share];
  });

  const nativeButton = shareSection.querySelector('[data-share-native]');
  const status = shareSection.querySelector('.article-share-status');
  if (!navigator.share) nativeButton.hidden = true;
  nativeButton.addEventListener('click', async () => {
    try {
      await navigator.share({ title, text: item.deck || '', url });
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Sharing could not be opened.';
    }
  });
  shareSection.querySelector('[data-share-copy]').addEventListener('click', async (event) => {
    const copyButton = event.currentTarget;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const field = document.createElement('textarea');
        field.value = url;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy failed');
      }
      status.textContent = 'Link copied.';
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = 'Copy link';
      }, 1800);
    } catch {
      status.textContent = 'Could not copy the link. Select and copy the page address instead.';
    }
  });
}

function sampleCoverMarkup(slug) {
  const covers = {
    'the-quiet-courage-of-starting-again':
      '<div class="article-cover-art article-cover-featured featured-art"><div class="sun-disc"></div><div class="feature-shape shape-a"></div><div class="feature-shape shape-b"></div><div class="feature-shape shape-c"></div><span>FIELD NOTES<br>NO. 001</span><b>✳</b></div>',
    'good-work-takes-the-time-it-takes':
      '<div class="article-cover-art article-cover-card post-art art-green"><span>THE LONG GAME</span><b>↗</b><div class="line-curve"></div></div>',
    'what-does-enough-look-like':
      '<div class="article-cover-art article-cover-card post-art art-peach"><span>ON MONEY & MEANING</span><b>✳</b><div class="coin-shape">₦</div></div>',
    'staying-human-in-the-age-of-ai':
      '<div class="article-cover-art article-cover-card post-art art-blue"><span>LEARNING IN PUBLIC</span><b>✦</b><div class="blue-orbit"></div></div>',
  };
  return covers[slug] || '';
}

function renderArticle(item) {
  const readingTime = articleReadingTime(item.body || '');
  const tags = String(item.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const sampleCover = item.sample ? sampleCoverMarkup(slug) : '';
  document.title = `${item.title} — alexore`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      item.seoDescription ||
        item.deck ||
        'Notes on work, money, becoming, and conversations that matter. Christ-like.'
    );
  root.innerHTML = `<article class="article-wrap"><a class="article-back" href="writing.html">← Back to the notebook</a>${item.sample ? '<p class="article-sample-note">SAMPLE ARTICLE · PREVIEW CONTENT</p>' : ''}<div class="article-meta article-meta-top"><a href="browse.html?category=${encodeURIComponent(item.category)}">${escapeHtml(item.category).toUpperCase()}</a> · ${escapeHtml(readingTime).toUpperCase()} · ${escapeHtml(item.date)}</div><div class="article-hero ${sampleCover ? 'has-sample-art' : ''}">${sampleCover}</div><div class="article-meta">ALEXORE · ${escapeHtml(item.date).toUpperCase()}</div><h1>${escapeHtml(item.title)}</h1><p class="article-deck">${escapeHtml(item.deck)}</p>${tags.length ? `<div class="article-tags" aria-label="Article tags">${tags.map((tag) => `<a href="browse.html?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join('')}</div>` : ''}<div class="article-body">${cleanArticleHtml(item.body || '<p>This story is just getting started.</p>')}</div><section class="article-engagement" aria-label="Article reactions and comments"><div class="article-like-row"><div><div class="eyebrow">A NOTE BACK</div><p>If this stayed with you, leave a little appreciation.</p></div><button class="article-like-button" id="articleLikeButton" type="button" aria-pressed="false"><span aria-hidden="true">♡</span><span id="articleLikeCount">${Number(item.likeCount) || 0} likes</span></button></div><div class="comments-section"><div class="comments-heading"><div><h2>Join the conversation</h2><p>No account needed. Comments are reviewed before they appear.</p></div><span class="eyebrow" id="articleCommentCount">${Number(item.commentCount) || 0} COMMENTS</span></div><div class="comment-list" id="articleCommentList" aria-live="polite"><p class="comment-empty">Loading comments…</p></div><form class="comment-form" id="articleCommentForm"><h3>Leave a comment</h3><p>Share a thoughtful response. Your email will stay private.</p><label class="comment-check"><input type="checkbox" name="anonymous"> <span>Comment anonymously</span></label><div id="commentIdentity"><label>Your name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label class="comment-check"><input type="checkbox" name="newsletter"> <span>Also add me to the occasional email newsletter.</span></label></div><label>Your comment<textarea name="comment" maxlength="3000" required></textarea></label><small>Up to 3,000 characters. No links or HTML are needed.</small><button class="button button-dark" type="submit">Post comment <span>↗</span></button><p class="comment-message" id="commentMessage" role="status"></p></form></div></section><div class="article-bottom"><a href="writing.html">← More writing</a><a href="index.html#newsletter">Get the notes ↗</a></div></article>`;
  installCommentEditor();
  const likeMark = root.querySelector('#articleLikeButton [aria-hidden="true"]');
  likeMark.outerHTML =
    '<svg class="article-like-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8c2 0 3 1.5 2.5 3.5L13 10h6a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 2H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  setupArticleSharing(item);
  if (/^(https?:\/\/|uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$)/i.test(item.coverImage || '')) {
    const hero = root.querySelector('.article-hero');
    hero.style.backgroundImage = `url(${JSON.stringify(item.coverImage)})`;
    hero.style.backgroundSize = 'cover';
    hero.style.backgroundPosition = 'center';
    hero.classList.add('has-cover');
  }
  if (!item.sample) setupArticleEngagement(item);
  else {
    root.querySelector('#articleLikeButton').disabled = true;
    root.querySelector('#articleCommentList').innerHTML =
      '<p class="comment-empty">This is a sample article. Publish it from Studio to enable reader comments and likes.</p>';
    root
      .querySelectorAll(
        '#articleCommentForm input, #articleCommentForm textarea, #articleCommentForm button, #articleCommentForm [contenteditable="true"]'
      )
      .forEach((control) => {
        if (control.hasAttribute('contenteditable'))
          control.setAttribute('contenteditable', 'false');
        else control.disabled = true;
      });
    root.querySelector('#commentMessage').textContent =
      'Comments and likes will open when this article is published.';
  }
}

function getVisitorId() {
  const key = 'alexore-reader-id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        globalThis.crypto?.randomUUID?.() ||
        Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

async function setupArticleEngagement(item) {
  // Load the visitor's like state and public comments, then wire like/comment submissions.
  const likeButton = root.querySelector('#articleLikeButton');
  const likeCount = root.querySelector('#articleLikeCount');
  const commentList = root.querySelector('#articleCommentList');
  const commentsCount = root.querySelector('#articleCommentCount');
  const form = root.querySelector('#articleCommentForm');
  const anonymousToggle = form.elements.anonymous;
  const identity = root.querySelector('#commentIdentity');
  const message = root.querySelector('#commentMessage');
  const editor = root.querySelector('#commentEditor');
  const commentInput = form.elements.comment;
  const editorCount = root.querySelector('#commentEditorCount');
  const visitorId = getVisitorId();
  const syncEditor = () => {
    commentInput.value = cleanCommentHtml(editor.innerHTML);
    editorCount.textContent = `${editor.innerText.trim().length} / 3,000`;
  };
  const setLike = (liked, count) => {
    likeButton.setAttribute('aria-pressed', String(liked));
    likeButton.classList.toggle('is-liked', liked);
    likeCount.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
  };
  likeButton.disabled = true;
  fetch(
    `api/index.php?route=like&slug=${encodeURIComponent(item.slug)}&visitorId=${encodeURIComponent(visitorId)}`,
    { headers: { Accept: 'application/json' } }
  )
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '');
      setLike(result.liked, result.count);
    })
    .catch(() => {})
    .finally(() => {
      likeButton.disabled = false;
    });
  const loadComments = async () => {
    const response = await fetch(
      `api/index.php?route=comments&slug=${encodeURIComponent(item.slug)}`,
      { headers: { Accept: 'application/json' } }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Comments could not be loaded.');
    const comments = result.comments || [];
    commentsCount.textContent = `${comments.length} ${comments.length === 1 ? 'COMMENT' : 'COMMENTS'}`;
    commentList.innerHTML = comments.length
      ? comments
          .map(
            (comment) =>
              `<article class="comment-item"><header><b>${escapeHtml(comment.isAnonymous ? 'Anonymous' : comment.displayName)}</b><time>${escapeHtml(comment.date)}</time></header><div class="comment-body">${cleanCommentHtml(comment.commentText)}</div></article>`
          )
          .join('')
      : '<p class="comment-empty">Be the first to leave a thoughtful response.</p>';
  };
  try {
    await loadComments();
  } catch {
    commentList.innerHTML =
      '<p class="comment-empty">Comments are temporarily unavailable. Please try again later.</p>';
  }
  likeButton.addEventListener('click', async () => {
    likeButton.disabled = true;
    try {
      const response = await fetch('api/index.php?route=like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ slug: item.slug, visitorId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your reaction could not be saved.');
      setLike(result.liked, result.count);
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('comment-error');
    } finally {
      likeButton.disabled = false;
    }
  });
  anonymousToggle.addEventListener('change', () => {
    identity.hidden = anonymousToggle.checked;
    form.elements.name.required = !anonymousToggle.checked;
    form.elements.email.required = !anonymousToggle.checked;
    if (anonymousToggle.checked) form.elements.newsletter.checked = false;
  });
  editor.addEventListener('input', syncEditor);
  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const pastedHtml = event.clipboardData.getData('text/html');
    const pastedText = event.clipboardData.getData('text/plain');
    const content = pastedHtml
      ? cleanCommentHtml(pastedHtml)
      : escapeHtml(pastedText).replace(/\r?\n/g, '<br>');
    document.execCommand('insertHTML', false, content);
    syncEditor();
  });
  root.querySelectorAll('[data-comment-command], [data-comment-link]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      editor.focus();
      if (button.hasAttribute('data-comment-link')) {
        const url = prompt('Paste a link starting with https://');
        if (url && /^https?:\/\//i.test(url.trim())) {
          document.execCommand('createLink', false, url.trim());
        }
      } else {
        document.execCommand(
          button.dataset.commentCommand,
          false,
          button.dataset.commentValue || null
        );
      }
      syncEditor();
    });
  });
  let editorRange = null;
  const rememberCommentRange = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode))
      editorRange = selection.getRangeAt(0).cloneRange();
  };
  const applyCommentHighlight = (color) => {
    editor.focus();
    if (editorRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(editorRange);
    }
    document.execCommand('hiliteColor', false, color);
    editorRange = null;
    syncEditor();
  };
  const commentPicker = root.querySelector('.highlight-picker');
  const commentPickerToggle = commentPicker.querySelector('.highlight-picker-toggle');
  const commentPickerMenu = commentPicker.querySelector('.highlight-picker-menu');
  commentPickerToggle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    rememberCommentRange();
  });
  commentPickerToggle.addEventListener('click', () => {
    commentPickerMenu.hidden = !commentPickerMenu.hidden;
    commentPickerToggle.setAttribute('aria-expanded', String(!commentPickerMenu.hidden));
  });
  commentPicker.querySelectorAll('[data-comment-highlight]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      commentPickerToggle.querySelector('.highlight-current').style.background =
        button.dataset.commentHighlight;
      commentPickerMenu.hidden = true;
      commentPickerToggle.setAttribute('aria-expanded', 'false');
      applyCommentHighlight(button.dataset.commentHighlight);
    });
  });
  const customCommentColor = commentPicker.querySelector('input[type="color"]');
  customCommentColor.addEventListener('mousedown', rememberCommentRange);
  customCommentColor.addEventListener('focus', rememberCommentRange);
  customCommentColor.addEventListener('change', () => {
    commentPickerToggle.querySelector('.highlight-current').style.background =
      customCommentColor.value;
    applyCommentHighlight(customCommentColor.value);
  });
  document.addEventListener('mousedown', (event) => {
    if (!commentPicker.contains(event.target)) {
      commentPickerMenu.hidden = true;
      commentPickerToggle.setAttribute('aria-expanded', 'false');
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    message.classList.remove('comment-error');
    syncEditor();
    if (!editor.innerText.trim()) {
      message.textContent = 'Write a comment before posting.';
      message.classList.add('comment-error');
      editor.focus();
      return;
    }
    if (editor.innerText.trim().length > 3000) {
      message.textContent = 'Keep your comment under 3,000 characters.';
      message.classList.add('comment-error');
      editor.focus();
      return;
    }
    const data = {
      slug: item.slug,
      comment: commentInput.value,
      anonymous: anonymousToggle.checked,
    };
    if (!anonymousToggle.checked) {
      data.name = form.elements.name.value.trim();
      data.email = form.elements.email.value.trim();
      data.newsletter = form.elements.newsletter.checked;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const response = await fetch('api/index.php?route=comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your comment could not be submitted.');
      form.reset();
      editor.innerHTML = '';
      syncEditor();
      identity.hidden = false;
      form.elements.name.required = true;
      form.elements.email.required = true;
      message.textContent = result.message;
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('comment-error');
    } finally {
      submit.disabled = false;
    }
  });
}

const sampleArticle = window.ALEXORE_CONTENT?.articles?.find((item) => item.slug === slug);
if (!slug) showNotFound();
else {
  if (sampleArticle) renderArticle({ ...sampleArticle, sample: true });
  fetch(`api/index.php?route=article&slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Article not found.');
      renderArticle(result.article);
    })
    .catch(() => {
      if (!sampleArticle) showNotFound();
    });
}
