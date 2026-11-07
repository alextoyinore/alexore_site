import { createPagination } from './pagination.js';
import './src/student/styles.css';

// Private publishing studio: authentication, dashboard data, article editing, media uploads, and admin views.
const $ = (selector) => document.querySelector(selector);
const API = 'api/index.php';
const studioMenuButton = $('.studio-sidebar-toggle');
const closeStudioSidebar = () => {
  document.body.classList.remove('studio-sidebar-open');
  studioMenuButton?.setAttribute('aria-expanded', 'false');
  studioMenuButton?.setAttribute('aria-label', 'Open studio navigation');
};
studioMenuButton?.addEventListener('click', () => {
  const open = document.body.classList.toggle('studio-sidebar-open');
  studioMenuButton.setAttribute('aria-expanded', String(open));
  studioMenuButton.setAttribute(
    'aria-label',
    open ? 'Close studio navigation' : 'Open studio navigation'
  );
});
document.querySelector('body')?.addEventListener('click', (event) => {
  if (
    document.body.classList.contains('studio-sidebar-open') &&
    !event.target.closest('.sidebar, .studio-sidebar-toggle')
  )
    closeStudioSidebar();
});
document.querySelectorAll('.sidebar .side-link').forEach((link) => {
  link.setAttribute('aria-label', link.textContent.trim().replace(/\s+/g, ' '));
  link.addEventListener('click', closeStudioSidebar);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeStudioSidebar();
});
let articles = [];
let contentItems = [];
let subscribers = [];
let contactMessages = [];
let contactMessagesLoadError = false;
let settings = {};
let csrfToken = '';
let editingId = null;
let editorReturnView = 'overview';

$('.studio-content').append($('#editorPage'));
let autosaveTimer = null;
let serverAutosaveTimer = null;
let articleSaveInProgress = false;
let articlePreviewOpen = false;
let articleEditorSuspended = false;
let displayName = 'Alex Ore';
let savedEditorRange = null;
let uploadTarget = 'body';
const draftKey = () => `alexore-editor-draft-${editingId || 'new'}`;

function setProfileName(name) {
  displayName = name || 'Alex Ore';
  $('#profileName').textContent = displayName;
  $('#profileInitial').textContent = displayName.trim().charAt(0).toUpperCase();
  $('.profile-dropdown-name').textContent = displayName;
  $('.side-bottom b').textContent = displayName;
}

function closeProfileMenu() {
  $('#profileDropdown').classList.add('hidden');
  $('#profileDot').setAttribute('aria-expanded', 'false');
}

async function api(route, { method = 'GET', data = null, query = {} } = {}) {
  // Keep all Studio requests on one helper so credentials, JSON, and CSRF protection stay consistent.
  const headers = { Accept: 'application/json' };
  if (data !== null) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const params = new URLSearchParams({ route, ...query });
  const response = await fetch(`${API}?${params}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: data === null ? undefined : JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

const studioEditorIcons = {
  undo: '<path d="M9 14 4 9l5-5M4 9h9a7 7 0 010 14h-2"/>',
  redo: '<path d="m15 14 5-5-5-5m5 5h-9a7 7 0 000 14h2"/>',
  bold: '<path d="M6 4h6a3 3 0 010 6H6zm0 6h7a3 3 0 010 6H6z"/>',
  italic: '<path d="M9 4h7M4 16h7M13 4 7 16"/>',
  underline: '<path d="M5 4v5a5 5 0 0010 0V4M4 19h12"/>',
  code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-5-10-2 12"/>',
  bullets: '<circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/><path d="M8 6h12M8 12h12M8 18h12"/>',
  numbers: '<path d="M9 6h11M9 12h11M9 18h11M3 5h2v3M3 11h2l-2 2h2M3 17h2v2H3"/>',
  quote: '<path d="M4 6h6v5H5v6H3v-8zm10 0h6v5h-5v6h-2v-8z"/>',
  link: '<path d="M8 12l4-4m-5-1-2 2a3 3 0 004 4l2-2m2-4 2-2a3 3 0 014 4l-2 2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 4v16M15 4v16"/>',
};
function studioEditorButton(icon, label, attrs) {
  return `<button type="button" data-assignment-command="${attrs}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${studioEditorIcons[icon]}</svg></button>`;
}
function formatCodeBlock(editor) {
  editor.focus();
  document.execCommand('formatBlock', false, 'pre');
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const pre = anchor?.nodeType === Node.ELEMENT_NODE
    ? anchor.closest('pre')
    : anchor?.parentElement?.closest('pre');
  if (!pre || !editor.contains(pre) || pre.querySelector('code')) return;
  const code = document.createElement('code');
  while (pre.firstChild) code.append(pre.firstChild);
  pre.append(code);
}

function safeCommentHtml(html = '') {
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
    'MARK',
  ]);
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  const clean = (parent) => {
    [...parent.children].forEach((child) => {
      if (!allowed.has(child.tagName)) {
        clean(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      const tag = child.tagName === 'DIV' ? 'P' : child.tagName.toLowerCase();
      const href = child.tagName === 'A' ? child.getAttribute('href') || '' : '';
      const highlight = child.getAttribute('data-highlight') || '';
      const alignment = child.getAttribute('data-align') || '';
      [...child.attributes].forEach((attribute) => {
        const keepHref = child.tagName === 'A' && attribute.name === 'href';
        const keepColor = child.tagName === 'MARK' && attribute.name === 'data-highlight';
        const keepAlignment =
          ['P', 'DIV'].includes(child.tagName) && attribute.name === 'data-align';
        if (!keepHref && !keepColor && !keepAlignment) child.removeAttribute(attribute.name);
      });
      if (child.tagName === 'MARK') {
        if (/^#[\da-f]{6}$/i.test(highlight)) {
          child.setAttribute('data-highlight', highlight.toLowerCase());
          child.style.backgroundColor = highlight;
        } else {
          clean(child);
          child.replaceWith(...child.childNodes);
          return;
        }
      }
      if (['P', 'DIV'].includes(child.tagName)) {
        if (['left', 'center', 'right'].includes(alignment))
          child.setAttribute('data-align', alignment);
        else child.removeAttribute('data-align');
      }
      if (child.tagName === 'A' && /^https?:\/\//i.test(href)) {
        child.setAttribute('href', href);
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'nofollow noopener noreferrer');
      }
      if (tag !== child.tagName.toLowerCase()) {
        const replacement = document.createElement(tag);
        if (['left', 'center', 'right'].includes(alignment)) {
          replacement.setAttribute('data-align', alignment);
        }
        replacement.append(...child.childNodes);
        child.replaceWith(replacement);
        clean(replacement);
      } else {
        clean(child);
      }
    });
  };
  clean(parsed.body);
  return parsed.body.innerHTML;
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2400);
}

function toggleStudio(show) {
  ['.sidebar', '.studio-top', '.studio-content', '.studio-footer'].forEach((selector) => {
    const node = $(selector);
    if (node) node.classList.toggle('hidden', !show);
  });
  $('#loginScreen').classList.toggle('hidden', show);
}

async function loadData() {
  // Load the dashboard's independent data sets together to avoid serial request delays.
  const [articleResult, subscriberResult, settingsResult, contentResult, messagesResult] =
    await Promise.all([
      api('articles', { query: { include: 'all' } }),
      api('subscribers'),
      api('settings'),
      api('content', { query: { include: 'all' } }),
      api('messages').catch(() => ({ messages: [], unavailable: true })),
    ]);
  articles = articleResult.articles || [];
  subscribers = subscriberResult.subscribers || [];
  settings = settingsResult.settings || {};
  contentItems = contentResult.items || [];
  contactMessages = messagesResult.messages || [];
  contactMessagesLoadError = Boolean(messagesResult.unavailable);
  renderDashboard();
}

async function startStudio() {
  try {
    const auth = await api('auth');
    if (!auth.authenticated) {
      toggleStudio(false);
      return;
    }
    csrfToken = auth.csrf || '';
    setProfileName(auth.displayName || 'Alex Ore');
    toggleStudio(true);
    await loadData();
  } catch (error) {
    toggleStudio(false);
    $('#loginMessage').textContent = error.message;
    $('#loginMessage').classList.add('login-error');
  }
}

function renderDashboard() {
  const published = articles.filter((article) => article.status === 'Published');
  const drafts = articles.filter((article) => article.status === 'Draft');
  $('#publishedCount').textContent = String(published.length).padStart(2, '0');
  $('#draftStat').textContent = String(drafts.length).padStart(2, '0');
  $('#draftCount').textContent = articles.length;
  $('#contactMessageCount').textContent = contactMessages.filter(
    (message) => message.status === 'new'
  ).length;
  $('#subscriberCount').textContent = subscribers.length;
  $('#audienceCount').textContent = subscribers.length;
  renderSubscriberGrowth();
  $('#recentList').innerHTML =
    articles
      .slice(0, 3)
      .map(
        (article, index) => `
    <div class="recent-item"><div class="recent-thumb">${['✳', '↗', '▤'][index]}</div>
    <div><b>${escapeHtml(article.title)}</b><small>${escapeHtml(article.category.toUpperCase())} · ${escapeHtml(article.read.toUpperCase())} · ${Number(article.viewCount || 0)} views</small></div>
    <span class="status ${article.status === 'Draft' ? 'draft' : ''}">${article.status.toUpperCase()}</span></div>`
      )
      .join('') || '<div class="recent-empty">Your first story is waiting to be written.</div>';
}

function renderSubscriberGrowth() {
  const graph = $('#subscriberGrowthGraph');
  if (!graph) return;
  const today = new Date();
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const monthKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthCounts = new Map();
  let existingSubscribers = 0;
  let newSubscribers = 0;

  subscribers.forEach((subscriber) => {
    const signedUpAt = /^\d{4}-\d{2}-\d{2}$/.test(subscriber.subscribedAt || '')
      ? new Date(`${subscriber.subscribedAt}T00:00:00`)
      : null;
    if (!signedUpAt || Number.isNaN(signedUpAt.getTime())) return;
    if (signedUpAt < firstMonth) {
      existingSubscribers += 1;
      return;
    }
    const key = monthKey(signedUpAt);
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    newSubscribers += 1;
  });

  let runningTotal = existingSubscribers;
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
    runningTotal += monthCounts.get(monthKey(date)) || 0;
    return {
      date,
      total: runningTotal,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date),
    };
  });
  const maxTotal = Math.max(...months.map((month) => month.total), 0);
  graph.replaceChildren(
    ...months.map((month) => {
      const bar = document.createElement('span');
      const height = maxTotal ? Math.max(4, (month.total / maxTotal) * 100) : 4;
      const added = monthCounts.get(monthKey(month.date)) || 0;
      bar.style.height = `${height}%`;
      bar.title = `${month.label}: ${month.total} subscribers${added ? ` (+${added})` : ''}`;
      bar.setAttribute('aria-hidden', 'true');
      return bar;
    })
  );
  graph.setAttribute(
    'aria-label',
    `Subscriber growth over the last 12 months. ${newSubscribers} new subscribers; ${subscribers.length} total.`
  );
  $('#subscriberGrowthSummary').textContent =
    `${newSubscribers} new in 12 months · subscriber totals by month`;
}

function revealArticleEditor() {
  ['.studio-heading', '#stats', '#overviewPanels', '#bottomPanels', '#detailPanel'].forEach(
    (selector) => $(selector)?.classList.add('hidden')
  );
  $('#editorPage').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function suspendArticleEditor() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  saveLocalDraft();
  clearInterval(serverAutosaveTimer);
  serverAutosaveTimer = null;
  articleEditorSuspended = true;
  $('#editorPage').classList.add('hidden');
}

function resumeArticleEditor() {
  articleEditorSuspended = false;
  startServerAutosave();
  revealArticleEditor();
}

function openEditor(article = null) {
  // Reuse the editor form for new articles and existing drafts/published articles.
  articleEditorSuspended = false;
  editingId = article?.id || null;
  editorReturnView = document.querySelector('.side-link.selected')?.dataset.view || 'overview';
  if (editorReturnView === 'writing-create') editorReturnView = 'writing';
  $('#editorHeading').textContent = article ? 'Edit article' : 'Write a new article';
  $('#publishArticle').innerHTML =
    article?.status === 'Published'
      ? 'Update article <span>↗</span>'
      : 'Publish article <span>↗</span>';
  $('#articleTitle').value = article?.title || '';
  $('#articleCategory').value = article?.category || 'Becoming';
  $('#articleTags').value = article?.tags || '';
  $('#articleDeck').value = article?.deck || '';
  $('#articleCover').value = article?.coverImage || '';
  $('#articleSeo').value = article?.seoDescription || '';
  $('#articleBody').innerHTML = article?.body || '';
  articlePreviewOpen = false;
  $('#articleBody').contentEditable = 'true';
  $('#previewArticle').textContent = 'Preview';
  $('#articleBody').classList.remove('preview-mode');
  // A new article always starts blank. The browser's shared "new" draft key
  // can contain an abandoned article, so never hydrate it into a fresh post.
  if (!article) localStorage.removeItem(draftKey());
  updateWritingStats();
  startServerAutosave();
  revealArticleEditor();
  setTimeout(() => $('#articleTitle').focus(), 100);
}

async function closeEditor() {
  clearInterval(serverAutosaveTimer);
  serverAutosaveTimer = null;
  $('#editorPage').classList.add('hidden');
  await setView(editorReturnView);
}

async function collect(status) {
  const title = $('#articleTitle').value.trim();
  if (!title) {
    $('#articleTitle').focus();
    toast('Add a title before saving.');
    return;
  }
  const coverImage = $('#articleCover').value.trim();
  if (
    coverImage &&
    !(
      /^https?:\/\//i.test(coverImage) ||
      /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(coverImage)
    )
  ) {
    toast('Use an http(s) image URL or upload an image here.');
    $('#articleCover').focus();
    return;
  }
  if (articleSaveInProgress) return;
  articleSaveInProgress = true;
  try {
    await api('articles', {
      method: 'POST',
      data: {
        id: editingId,
        title,
        category: $('#articleCategory').value,
        tags: $('#articleTags').value,
        deck: $('#articleDeck').value.trim(),
        coverImage,
        seoDescription: $('#articleSeo').value.trim(),
        body: $('#articleBody').innerHTML,
        status,
      },
    });
    localStorage.removeItem(draftKey());
    await loadData();
    articleSaveInProgress = false;
    await closeEditor();
    toast(status === 'Published' ? 'Your article is published.' : 'Draft saved to your studio.');
  } catch (error) {
    articleSaveInProgress = false;
    toast(error.message);
  }
}

$('#editorClose').addEventListener('click', closeEditor);
$('#articleForm').addEventListener('submit', (event) => event.preventDefault());
$('#newPost').addEventListener('click', () => setView('writing-create'));
$('#quickArticle').addEventListener('click', () => setView('writing-create'));
$('#saveDraft').addEventListener('click', () => collect('Draft'));
$('#publishArticle').addEventListener('click', () => collect('Published'));
function wordCount() {
  return ($('#articleBody').innerText.trim().match(/\S+/g) || []).length;
}
function updateWritingStats() {
  const words = wordCount();
  $('#wordCount').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  $('#wordCountStatus').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
}
function saveLocalDraft() {
  // Preserve an in-progress draft in this browser between visits or accidental closes.
  const draft = {
    title: $('#articleTitle').value,
    category: $('#articleCategory').value,
    tags: $('#articleTags').value,
    deck: $('#articleDeck').value,
    coverImage: $('#articleCover').value,
    seoDescription: $('#articleSeo').value,
    body: $('#articleBody').innerHTML,
  };
  try {
    localStorage.setItem(draftKey(), JSON.stringify(draft));
    $('#saveStatus').textContent = 'Saved in this browser';
  } catch {
    $('#saveStatus').textContent = 'Browser storage is full';
  }
}
function scheduleLocalDraft() {
  $('#saveStatus').textContent = 'Saving…';
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveLocalDraft, 500);
  updateWritingStats();
}
function startServerAutosave() {
  clearInterval(serverAutosaveTimer);
  const minutes = Number(settings.editor_autosave_minutes ?? 5);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  serverAutosaveTimer = setInterval(
    async () => {
      if (
        !$('#editorPage') ||
        $('#editorPage').classList.contains('hidden') ||
        articleSaveInProgress ||
        !$('#articleTitle').value.trim()
      )
        return;
      const status =
        articles.find((article) => String(article.id) === String(editingId))?.status === 'Published'
          ? 'Published'
          : 'Draft';
      articleSaveInProgress = true;
      try {
        const result = await api('articles', {
          method: 'POST',
          data: {
            id: editingId,
            title: $('#articleTitle').value.trim(),
            category: $('#articleCategory').value,
            tags: $('#articleTags').value,
            deck: $('#articleDeck').value.trim(),
            coverImage: $('#articleCover').value.trim(),
            seoDescription: $('#articleSeo').value.trim(),
            body: $('#articleBody').innerHTML,
            status,
          },
        });
        editingId = result.id;
        $('#saveStatus').textContent = 'Auto-saved';
        await loadData();
      } catch (error) {
        $('#saveStatus').textContent = 'Auto-save failed';
      } finally {
        articleSaveInProgress = false;
      }
    },
    minutes * 60 * 1000
  );
}
function rememberEditorRange() {
  const selection = window.getSelection();
  if (selection?.rangeCount && $('#articleBody').contains(selection.anchorNode))
    savedEditorRange = selection.getRangeAt(0).cloneRange();
}
function insertHtmlAtCursor(html) {
  $('#articleBody').focus();
  if (savedEditorRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedEditorRange);
  }
  document.execCommand('insertHTML', false, html);
  savedEditorRange = null;
  scheduleLocalDraft();
}
document
  .querySelectorAll('.editor-toolbar [data-command]')
  .forEach((button) => button.addEventListener('mousedown', (event) => event.preventDefault()));
document.querySelectorAll('.editor-toolbar [data-command]').forEach((button) =>
  button.addEventListener('click', () => {
    $('#articleBody').focus();
    if (button.dataset.command === 'codeBlock') formatCodeBlock($('#articleBody'));
    else document.execCommand(button.dataset.command, false, null);
    scheduleLocalDraft();
  })
);
document.querySelectorAll('.editor-toolbar .highlight-picker').forEach((picker) => {
  const toggle = picker.querySelector('.highlight-picker-toggle');
  const menu = picker.querySelector('.highlight-picker-menu');
  const current = toggle.querySelector('.highlight-current');
  const applyColor = (color) => {
    $('#articleBody').focus();
    if (savedEditorRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedEditorRange);
    }
    document.execCommand('hiliteColor', false, color);
    savedEditorRange = null;
    scheduleLocalDraft();
  };
  toggle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    rememberEditorRange();
  });
  toggle.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });
  picker.querySelectorAll('[data-highlight-color]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      current.style.background = button.dataset.highlightColor;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      applyColor(button.dataset.highlightColor);
    });
  });
  const custom = picker.querySelector('input[type="color"]');
  custom.addEventListener('mousedown', rememberEditorRange);
  custom.addEventListener('focus', rememberEditorRange);
  custom.addEventListener('change', () => {
    current.style.background = custom.value;
    applyColor(custom.value);
  });
  document.addEventListener('mousedown', (event) => {
    if (!picker.contains(event.target)) {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
});
$('#blockStyle').addEventListener('change', (event) => {
  $('#articleBody').focus();
  document.execCommand('formatBlock', false, event.target.value);
  scheduleLocalDraft();
});
document.querySelectorAll('.editor-toolbar [data-action]').forEach((button) =>
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'link') {
      const url = prompt('Paste a link starting with https://');
      if (url && /^https?:\/\//i.test(url)) {
        $('#articleBody').focus();
        if (savedEditorRange) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(savedEditorRange);
          savedEditorRange = null;
        }
        document.execCommand('createLink', false, url);
      }
    }
    if (action === 'image') {
      rememberEditorRange();
      uploadTarget = 'body';
      openImagePicker();
    }
    if (action === 'table') {
      const rowsInput = prompt('Number of rows (1–12)', '3');
      if (rowsInput !== null) {
        const colsInput = prompt('Number of columns (1–8)', '3');
        if (colsInput !== null) {
          const rows = Math.max(1, Math.min(12, Number(rowsInput) || 0));
          const cols = Math.max(1, Math.min(8, Number(colsInput) || 0));
          if (rows && cols) {
            const table = `<table><thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`;
            insertHtmlAtCursor(table);
          }
        }
      }
    }
    if (action === 'clear') {
      $('#articleBody').focus();
      document.execCommand('removeFormat', false, null);
    }
    scheduleLocalDraft();
  })
);
document.querySelectorAll('.editor-toolbar [data-action="link"]').forEach((button) =>
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    rememberEditorRange();
  })
);
document.querySelectorAll('.editor-toolbar [data-action="table"]').forEach((button) =>
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    rememberEditorRange();
  })
);
const imagePicker = $('#imagePicker');
const imagePickerGrid = $('#imagePickerGrid');
const imagePickerStatus = $('#imagePickerStatus');
const closeImagePicker = () => imagePicker.classList.add('hidden');
const applyChosenImage = (url) => {
  closeImagePicker();
  if (uploadTarget === 'cover') {
    $('#articleCover').value = url;
    scheduleLocalDraft();
    toast('Featured image selected.');
    return;
  }
  const alt = prompt('Describe the image for readers using screen readers') || '';
  insertHtmlAtCursor(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`);
  scheduleLocalDraft();
};
const openImagePicker = async () => {
  imagePicker.classList.remove('hidden');
  imagePickerStatus.textContent = 'Loading your images…';
  imagePickerGrid.innerHTML = '';
  $('#imagePickerClose')?.focus();
  try {
    const response = await fetch(`${API}?route=images`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The image library could not be loaded.');
    const images = result.images || [];
    imagePickerStatus.textContent = images.length
      ? `${images.length} image${images.length === 1 ? '' : 's'} in your library`
      : 'No uploaded images yet. Upload one to get started.';
    imagePickerGrid.innerHTML = images
      .map(
        (image) =>
          `<button type="button" class="image-picker-item" data-image-url="${escapeHtml(image.url)}" aria-label="Use image ${escapeHtml(image.url.split('/').pop())}"><img src="${escapeHtml(image.url)}" alt="" loading="lazy"><span>${Number(image.width)} × ${Number(image.height)}</span></button>`
      )
      .join('');
  } catch (error) {
    imagePickerStatus.textContent = error.message;
  }
};
$('#coverImageUpload').addEventListener('click', () => {
  uploadTarget = 'cover';
  openImagePicker();
});
$('#imagePickerClose').addEventListener('click', closeImagePicker);
$('#imagePickerUpload').addEventListener('click', () => {
  closeImagePicker();
  $('#articleImageFile').click();
});
imagePicker.addEventListener('click', (event) => {
  if (event.target === imagePicker) closeImagePicker();
});
imagePickerGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-image-url]');
  if (button) applyChosenImage(button.dataset.imageUrl);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !imagePicker.classList.contains('hidden')) closeImagePicker();
});
const compressImageForUpload = async (file) => {
  if (file.type === 'image/gif') return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { alpha: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob || !blob.type.startsWith('image/')) return file;
    if (blob.size >= file.size) return file;
    const extension =
      blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    return new File([blob], `image.${extension}`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
$('#articleImageFile').addEventListener('change', async (event) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  if (file.size > 24 * 1024 * 1024) {
    toast('Choose an image smaller than 24 MB.');
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    toast('Choose a JPG, PNG, GIF, or WebP image.');
    return;
  }
  try {
    const uploadFile = await compressImageForUpload(file);
    if (uploadFile.size > 8 * 1024 * 1024) {
      toast('This image is still larger than 8 MB after compression.');
      return;
    }
    const form = new FormData();
    form.append('image', uploadFile);
    const response = await fetch(`${API}?route=upload`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'same-origin',
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The image upload failed.');
    if (uploadTarget === 'cover') {
      $('#articleCover').value = result.url;
      scheduleLocalDraft();
    } else {
      const alt = prompt('Describe the image for readers using screen readers') || '';
      insertHtmlAtCursor(`<img src="${escapeHtml(result.url)}" alt="${escapeHtml(alt)}">`);
    }
    toast(uploadFile.size < file.size ? 'Image compressed and uploaded.' : 'Image uploaded.');
  } catch (error) {
    toast(error.message);
  }
});
$('#articleBody').addEventListener('input', () => {
  scheduleLocalDraft();
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  const showCommands =
    node?.nodeType === Node.TEXT_NODE &&
    node.textContent.slice(0, selection.anchorOffset).endsWith('/');
  $('#slashMenu').classList.toggle('hidden', !showCommands);
});
document.querySelectorAll('#slashMenu [data-block]').forEach((button) => {
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      range.setStart(node, selection.anchorOffset - 1);
      range.setEnd(node, selection.anchorOffset);
      range.deleteContents();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    $('#articleBody').focus();
    const block = button.dataset.block;
    if (block === 'UL') document.execCommand('insertUnorderedList', false, null);
    else if (block === 'OL') document.execCommand('insertOrderedList', false, null);
    else if (block === 'HR') document.execCommand('insertHorizontalRule', false, null);
    else document.execCommand('formatBlock', false, block);
    $('#slashMenu').classList.add('hidden');
    scheduleLocalDraft();
  });
});
$('#articleBody').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveLocalDraft();
    toast('Draft saved in this browser.');
  }
});
[
  'articleTitle',
  'articleCategory',
  'articleTags',
  'articleDeck',
  'articleCover',
  'articleSeo',
].forEach((id) => {
  document.getElementById(id).addEventListener('input', scheduleLocalDraft);
  document.getElementById(id).addEventListener('change', scheduleLocalDraft);
});
$('#previewArticle').addEventListener('click', () => {
  articlePreviewOpen = !articlePreviewOpen;
  $('#articleBody').contentEditable = String(!articlePreviewOpen);
  $('#previewArticle').textContent = articlePreviewOpen ? 'Continue editing' : 'Preview';
  $('#articleBody').classList.toggle('preview-mode', articlePreviewOpen);
});
$('#profileDot').addEventListener('click', () => {
  const open = $('#profileDropdown').classList.toggle('hidden') === false;
  $('#profileDot').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (event) => {
  if (!$('#profileMenu').contains(event.target)) closeProfileMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeProfileMenu();
});
$('#logoutButton').addEventListener('click', async () => {
  try {
    await api('auth', { method: 'POST', data: { action: 'logout' } });
    csrfToken = '';
    closeProfileMenu();
    setProfileName('Alex Ore');
    toggleStudio(false);
    $('#loginMessage').textContent = 'You have been signed out.';
    $('#loginMessage').classList.remove('login-error');
  } catch (error) {
    toast(error.message);
  }
});
function downloadFile(name, data, type) {
  const blob = new Blob([data], { type }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function renderAssignmentStudioView(view, panel, options = {}) {
  const result = await api('assignments');
  const assignments = result.assignments || [];

  if (view === 'assignments') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>Assignments</h2></div><button id="createAssignment" class="button button-dark" type="button">＋ Create assignment</button></div><p>Manage prompts here. Open submissions and grading separately to review student work.</p><div id="studioAssignmentList" class="studio-assignment-list"></div>`;
    $('#createAssignment').onclick = () => setView('assignment-create');
    createPagination($('#studioAssignmentList'), { pageSize: 15, label: 'Assignments' }).setItems(
      assignments,
      (assignment) => `<article class="studio-assignment-card"><div><h3>${escapeHtml(assignment.title)}</h3><p>${escapeHtml(assignment.status.toUpperCase())} · ${Number(assignment.submissionCount)} submissions · ${escapeHtml(assignment.department || 'All departments')} · ${escapeHtml(assignment.level || 'All levels')} · ${Number(assignment.pairReview) ? 'Pair review' : 'Individual'}</p></div><div class="studio-assignment-actions"><button class="plain-link edit-assignment" type="button" data-id="${assignment.id}">Edit</button><button class="plain-link view-assignment-submissions" type="button" data-id="${assignment.id}">View submissions</button><button class="plain-link delete-assignment" type="button" data-id="${assignment.id}">Delete</button></div></article>`
    );
    panel.onclick = async (event) => {
      const button = event.target.closest('button[data-id]');
      if (!button) return;
      if (button.matches('.edit-assignment')) {
        setView('assignment-create', { assignmentId: button.dataset.id });
      } else if (button.matches('.view-assignment-submissions')) {
        setView('assignment-submissions', { assignmentId: button.dataset.id });
      } else if (button.matches('.delete-assignment')) {
        const assignment = assignments.find((row) => String(row.id) === button.dataset.id);
        if (!assignment || !confirm(`Delete “${assignment.title}”? This permanently removes its student submissions and pair reviews.`)) return;
        button.disabled = true;
        try {
          await api('assignments', { method: 'DELETE', data: { id: assignment.id } });
          toast('Assignment deleted.');
          await setView('assignments');
        } catch (error) {
          button.disabled = false;
          toast(error.message);
        }
      }
    };
    return;
  }

  if (view === 'assignment-create') {
    const assignment = assignments.find((row) => String(row.id) === String(options.assignmentId)) || null;
    const departmentOptions = (result.departments || []).map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
    const levelOptions = (result.levels || []).map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>${assignment ? 'Edit assignment' : 'Create assignment'}</h2></div><button class="plain-link" type="button" id="backToAssignments">← All assignments</button></div><form id="assignmentAdminForm" class="products-form"><input type="hidden" name="id" value="${assignment ? assignment.id : ''}"><label class="field-label">ASSIGNMENT TITLE<input name="title" maxlength="240" required value="${escapeHtml(assignment?.title || '')}"></label><div class="field-row"><label class="field-label">DEPARTMENT TARGET (OPTIONAL)<input name="department" list="assignmentDepartments" maxlength="120" placeholder="All departments, or CS, Mathematics" value="${escapeHtml((assignment?.department || '').replaceAll(',', ', '))}"><small>Separate departments with commas. Leave blank to target every department.</small><datalist id="assignmentDepartments">${departmentOptions}</datalist></label><label class="field-label">LEVEL TARGET (OPTIONAL)<input name="level" list="assignmentLevels" maxlength="40" placeholder="All levels" value="${escapeHtml(assignment?.level || '')}"><small>Leave blank to target every level.</small></label></div><label class="field-label">QUESTION / INSTRUCTIONS</label><div class="student-editor-toolbar" role="toolbar" aria-label="Assignment question formatting">${studioEditorButton('undo','Undo','undo')}${studioEditorButton('redo','Redo','redo')}<i aria-hidden="true"></i>${studioEditorButton('bold','Bold','bold')}${studioEditorButton('italic','Italic','italic')}${studioEditorButton('underline','Underline','underline')}${studioEditorButton('bullets','Bulleted list','insertUnorderedList')}${studioEditorButton('numbers','Numbered list','insertOrderedList')}${studioEditorButton('quote','Quote','formatBlock:blockquote')}${studioEditorButton('code','Code block','code')}${studioEditorButton('link','Insert link','action:link')}${studioEditorButton('table','Insert table','action:table')}</div><div id="assignmentQuestion" class="student-editor-body" contenteditable="true" role="textbox" aria-label="Assignment question" aria-multiline="true">${assignment?.question || '<p><br></p>'}</div><div class="field-row"><label class="field-label">DUE DATE (OPTIONAL)<input name="dueAt" type="datetime-local" value="${assignment?.dueAt ? escapeHtml(assignment.dueAt.slice(0, 16).replace(' ', 'T')) : ''}"></label><label class="field-label">STATUS<select name="status"><option value="open" ${assignment?.status !== 'closed' ? 'selected' : ''}>Open</option><option value="closed" ${assignment?.status === 'closed' ? 'selected' : ''}>Closed</option></select></label></div><label class="field-label"><span><input name="pairReview" type="checkbox" ${Number(assignment?.pairReview) === 1 ? 'checked' : ''}> Enable pair review for this assignment</span></label><div class="settings-actions"><button class="button button-dark" type="submit">${assignment ? 'Save changes' : 'Post assignment'} <span>↗</span></button><button id="resetAssignmentForm" class="button button-outline" type="button">Clear</button></div></form>`;
    const form = $('#assignmentAdminForm');
    $('#backToAssignments').onclick = () => setView('assignments');
    $('#resetAssignmentForm').onclick = () => assignment ? setView('assignment-create', { assignmentId: assignment.id }) : (form.reset(), ($('#assignmentQuestion').innerHTML = '<p><br></p>'));
    panel.querySelectorAll('[data-assignment-command]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.onclick = () => {
        const action = button.dataset.assignmentCommand;
        const editor = $('#assignmentQuestion');
        editor.focus();
        if (action === 'code') formatCodeBlock(editor);
        else if (action === 'action:link') {
          const url = prompt('Paste a web link starting with https://');
          if (url && /^https?:\/\//i.test(url)) document.execCommand('createLink', false, url);
        } else if (action === 'action:table') {
          const rows = Math.max(1, Math.min(12, Number(prompt('Number of rows (1–12)', '3')) || 0));
          const cols = Math.max(1, Math.min(8, Number(prompt('Number of columns (1–8)', '3')) || 0));
          if (rows && cols) {
            const table = `<table><thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`;
            document.execCommand('insertHTML', false, table);
          }
        } else {
          const [command, value] = action.split(':');
          document.execCommand(command, false, value || null);
        }
      };
    });
    let saving = false;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      const saveButton = form.querySelector('[type="submit"]');
      saveButton.disabled = true;
      const values = Object.fromEntries(new FormData(form));
      try {
        await api('assignments', { method: 'POST', data: { ...values, question: $('#assignmentQuestion').innerHTML, pairReview: form.elements.pairReview.checked } });
        toast(assignment ? 'Assignment updated.' : 'Assignment posted.');
        await setView('assignments');
      } catch (error) {
        toast(error.message);
      } finally {
        saving = false;
        saveButton.disabled = false;
      }
    };
    return;
  }

  renderAssignmentSubmissions(panel, assignments, String(options.assignmentId || assignments[0]?.id || ''));
}

async function renderStudentRecords(panel, studentId = '', submissionPage = 1, activityPage = 1) {
  if (studentId) {
    const data = await api('student-records', { query: { studentId, submissionPage, activityPage } });
    const student = data.student;
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>${escapeHtml(student.fullName)}’s record</h2></div><button class="plain-link" type="button" id="backToStudentRecords">← All students</button></div><p>${escapeHtml(student.email)} · ${escapeHtml(student.matricNumber || 'No matric number')} · ${escapeHtml(student.department || 'No department')} · ${escapeHtml(student.level || 'No level')}</p><div class="student-record-stats"><div><b>${Number(student.attendancePoints || 0)}</b><span>attendance points</span></div><div><b>${Number(student.submissionTotal || 0)}</b><span>submissions</span></div><div><b>${Number(student.gradedTotal || 0)}</b><span>graded</span></div><div><b>${student.averageGrade === null ? '—' : Number(student.averageGrade).toFixed(1)}</b><span>average grade</span></div><div><b>${Number(student.activityTotal || 0)}</b><span>activities</span></div></div><div class="student-record-columns"><section><h3>Attendance and grades</h3><div id="studentRecordSubmissions"></div><nav id="studentRecordSubmissionsPager" class="assignment-submission-pager" aria-label="Student submission records"></nav></section><section><h3>Activity history <small>${Number(student.activityTotal || 0)} total activities</small></h3><div id="studentRecordActivity"></div><nav id="studentRecordActivityPager" class="assignment-submission-pager" aria-label="Student activity pages"></nav></section></div>`;
    $('#backToStudentRecords').onclick = () => renderStudentRecords(panel);
    const submissionsRoot = $('#studentRecordSubmissions');
    if (data.submissions.length) submissionsRoot.innerHTML = data.submissions.map((item) => `<article class="student-record-item"><b>${escapeHtml(item.assignmentTitle)}</b><small>${escapeHtml(item.submittedAt)} · Attendance +1</small><strong>${item.score === null ? 'Not graded' : `${Number(item.score).toFixed(1)} / 100`}</strong>${item.feedback ? `<p>${escapeHtml(item.feedback)}</p>` : ''}</article>`).join('');
    else submissionsRoot.innerHTML = '<div class="empty-state">No submissions or attendance points yet.</div>';
    const renderRecordPager = (root, current, total, kind) => {
      const pages = Math.ceil(total / data.pageSize);
      root.innerHTML = pages > 1 ? `<button type="button" data-record-detail-page="${current - 1}" data-kind="${kind}" ${current <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${current} of ${pages}</span><button type="button" data-record-detail-page="${current + 1}" data-kind="${kind}" ${current >= pages ? 'disabled' : ''}>Next →</button>` : '';
      root.onclick = (event) => { const button = event.target.closest('[data-record-detail-page]'); if (!button || button.disabled) return; const next = Number(button.dataset.recordDetailPage); renderStudentRecords(panel, studentId, kind === 'submissions' ? next : submissionPage, kind === 'activity' ? next : activityPage); };
    };
    renderRecordPager($('#studentRecordSubmissionsPager'), submissionPage, Number(student.submissionTotal), 'submissions');
    const activityRoot = $('#studentRecordActivity');
    if (data.activity.length) {
      activityRoot.innerHTML = data.activity.map((item) => `<article class="student-record-item"><b>${escapeHtml(item.description)}</b><small>${escapeHtml(item.createdAt)}</small></article>`).join('');
    } else activityRoot.innerHTML = '<div class="empty-state">No student activity yet.</div>';
    renderRecordPager($('#studentRecordActivityPager'), activityPage, Number(student.activityTotal), 'activity');
    return;
  }
  panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>Student records</h2></div><button class="plain-link" id="refreshStudentRecords" type="button">Refresh ↻</button></div><p>Attendance points, submissions, grades, account totals, and activity for every student.</p><form id="studentRecordsSearch" class="assignment-submission-filters"><label class="field-label">FIND A STUDENT<input name="search" type="search" placeholder="Name, email, matric, department, or level"></label><button class="button button-dark" type="submit">Search</button></form><p id="studentRecordsCount" class="student-notice"></p><div id="studentRecordsList" class="student-record-list"></div><nav id="studentRecordsPager" class="assignment-submission-pager" aria-label="Student record pages"></nav>`;
  const searchForm = $('#studentRecordsSearch');
  const list = $('#studentRecordsList');
  const pager = $('#studentRecordsPager');
  let page = 1;
  const load = async () => {
    const data = await api('student-records', { query: { page, pageSize: 25, search: searchForm.elements.search.value.trim() } });
    $('#studentRecordsCount').textContent = `Showing ${data.total ? (page - 1) * 25 + 1 : 0}–${Math.min(page * 25, data.total)} of ${data.total} students`;
    list.innerHTML = data.students.length ? data.students.map((item) => `<article class="student-record-card"><div><b>${escapeHtml(item.fullName)}</b><small>${escapeHtml(item.email)} · ${escapeHtml(item.matricNumber || 'No matric number')}</small><small>${escapeHtml(item.department || 'No department')} · ${escapeHtml(item.level || 'No level')}</small></div><div class="student-record-card-stats"><span><b>${Number(item.attendancePoints)}</b> attendance</span><span><b>${Number(item.submissionTotal)}</b> submissions</span><span><b>${Number(item.gradedTotal)}</b> graded</span><span><b>${item.averageGrade === null ? '—' : Number(item.averageGrade).toFixed(1)}</b> average</span><span><b>${Number(item.activityTotal)}</b> activities</span></div><button class="plain-link student-record-open" data-student="${item.id}" type="button">View full record →</button></article>`).join('') : '<div class="empty-state">No students match this search.</div>';
    const pages = Math.ceil(data.total / 25);
    pager.innerHTML = pages > 1 ? `<button type="button" data-record-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${page} of ${pages}</span><button type="button" data-record-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>` : '';
  };
  searchForm.onsubmit = async (event) => { event.preventDefault(); page = 1; await load(); };
  $('#refreshStudentRecords').onclick = load;
  pager.onclick = async (event) => { const button = event.target.closest('[data-record-page]'); if (!button || button.disabled) return; page = Number(button.dataset.recordPage); await load(); };
  list.onclick = (event) => { const button = event.target.closest('.student-record-open'); if (button) renderStudentRecords(panel, button.dataset.student); };
  await load();
}

async function renderUserManagement(panel) {
  panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">ACCOUNT ADMINISTRATION</div><h2>User management</h2></div><button class="plain-link" id="refreshSiteMembers" type="button">Refresh ↻</button></div><p>Manage public Alexore member accounts. Studio administrator accounts use a separate login and are not listed here. Deactivated members cannot sign in, comment, or like articles.</p><form id="siteMembersSearch" class="assignment-submission-filters"><label class="field-label">FIND A MEMBER<input name="search" type="search" placeholder="Name or email address"></label><button class="button button-dark" type="submit">Search</button></form><p id="siteMembersCount" class="student-notice"></p><div id="siteMembersList" class="site-member-list"></div><nav id="siteMembersPager" class="assignment-submission-pager" aria-label="Member account pages"></nav>`;
  const form = $('#siteMembersSearch');
  const list = $('#siteMembersList');
  const pager = $('#siteMembersPager');
  let page = 1;
  const load = async () => {
    try {
      const data = await api('site-members', { query: { page, pageSize: 25, search: form.elements.search.value.trim() } });
      $('#siteMembersCount').textContent = `Showing ${data.total ? (page - 1) * 25 + 1 : 0}–${Math.min(page * 25, data.total)} of ${data.total} member accounts`;
      list.innerHTML = data.members.length ? data.members.map((member) => `<article class="site-member-card"><div class="site-member-identity"><b>${escapeHtml(member.fullName)}</b><span>${escapeHtml(member.email)}</span><small>Created ${escapeHtml(member.createdAt)} · Last sign-in ${escapeHtml(member.lastLoginAt || 'Never')}${Number(member.hasReoAccount) ? ' · Reo student' : ''}</small></div><span class="site-member-status ${Number(member.isActive) ? 'is-active' : ''}">${Number(member.isActive) ? 'ACTIVE' : 'DEACTIVATED'}</span><button class="plain-link site-member-toggle" type="button" data-member="${member.id}" data-active="${Number(member.isActive) ? '0' : '1'}">${Number(member.isActive) ? 'Deactivate account' : 'Reactivate account'}</button></article>`).join('') : '<div class="empty-state">No member accounts match this search.</div>';
      const pages = Math.ceil(data.total / 25);
      pager.innerHTML = pages > 1 ? `<button type="button" data-member-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${page} of ${pages}</span><button type="button" data-member-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>` : '';
    } catch (error) {
      $('#siteMembersCount').textContent = '';
      list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      pager.innerHTML = '';
    }
  };
  form.onsubmit = async (event) => { event.preventDefault(); page = 1; await load(); };
  $('#refreshSiteMembers').onclick = load;
  pager.onclick = async (event) => { const button = event.target.closest('[data-member-page]'); if (!button || button.disabled) return; page = Number(button.dataset.memberPage); await load(); };
  list.onclick = async (event) => {
    const button = event.target.closest('.site-member-toggle');
    if (!button) return;
    button.disabled = true;
    try {
      await api('site-members', { method: 'POST', data: { id: button.dataset.member, active: button.dataset.active === '1' } });
      toast(button.dataset.active === '1' ? 'Member account reactivated.' : 'Member account deactivated.');
      await load();
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  };
  await load();
}

async function renderAssignmentSubmissions(panel, assignments, initialAssignmentId) {
  panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>Submissions & grading</h2></div></div><form id="assignmentSubmissionFilters" class="assignment-submission-filters"><label class="field-label">ASSIGNMENT<select name="assignmentId" ${assignments.length ? '' : 'disabled'}>${assignments.length ? assignments.map((item) => `<option value="${item.id}" ${String(item.id) === initialAssignmentId ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('') : '<option value="">No assignments yet</option>'}</select></label><label class="field-label">FIND A STUDENT<input name="search" type="search" placeholder="Name, email, or matric number"></label><button class="button button-dark" type="submit">Search</button></form><p id="assignmentSubmissionCount" class="student-notice"></p><div id="assignmentSubmissionRows" class="assignment-submission-list"></div><nav id="assignmentSubmissionPager" class="assignment-submission-pager" aria-label="Submission pages"></nav>`;
  const filters = $('#assignmentSubmissionFilters');
  const rowsPanel = $('#assignmentSubmissionRows');
  const pager = $('#assignmentSubmissionPager');
  let page = 1;
  const pageSize = 25;
  const loadSubmissions = async () => {
    const assignmentId = filters.elements.assignmentId.value;
    if (!assignmentId) {
      rowsPanel.innerHTML = '<div class="empty-state">Create an assignment before reviewing submissions.</div>';
      pager.innerHTML = '';
      $('#assignmentSubmissionCount').textContent = '';
      return;
    }
    try {
      const data = await api('assignment-submissions', { query: { assignmentId, page, pageSize, search: filters.elements.search.value.trim() } });
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      $('#assignmentSubmissionCount').textContent = `Showing ${data.total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, data.total)} of ${data.total} submissions`;
      rowsPanel.innerHTML = data.submissions.length ? data.submissions.map((submission) => `<article class="assignment-submission-card"><div class="eyebrow">${escapeHtml(submission.studentName)} · ${escapeHtml(submission.matricNumber || 'NO MATRIC')} · ${escapeHtml(submission.department || 'NO DEPARTMENT')} · ${escapeHtml(submission.level || 'NO LEVEL')} · ${escapeHtml(submission.submittedAt)}</div><p class="student-notice">${escapeHtml(submission.email)}${submission.phone ? ` · ${escapeHtml(submission.phone)}` : ''}</p><div class="student-admin-work">${submission.body}</div><form class="student-grade-form" data-submission="${submission.id}"><div class="field-row"><label class="field-label">SCORE / 100<input type="number" name="score" min="0" max="100" step="0.01" value="${submission.score === null ? '' : escapeHtml(submission.score)}" required></label><label class="field-label">FEEDBACK<textarea name="feedback" rows="3">${escapeHtml(submission.feedback || '')}</textarea></label></div><button class="plain-link" type="submit">Save grade →</button></form></article>`).join('') : '<div class="empty-state">No submissions match this assignment and search.</div>';
      pager.innerHTML = data.total > pageSize ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${page} of ${totalPages}</span><button type="button" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>` : '';
      pager.querySelectorAll('[data-page]').forEach((button) => {
        button.onclick = () => { page = Number(button.dataset.page); loadSubmissions(); };
      });
      rowsPanel.querySelectorAll('.student-grade-form').forEach((gradeForm) => {
        gradeForm.onsubmit = async (event) => {
          event.preventDefault();
          const save = gradeForm.querySelector('[type="submit"]');
          save.disabled = true;
          try {
            await api('student-grade', { method: 'POST', data: { submissionId: gradeForm.dataset.submission, score: gradeForm.elements.score.value, feedback: gradeForm.elements.feedback.value } });
            toast('Grade saved.');
            await loadSubmissions();
          } catch (error) {
            toast(error.message);
            save.disabled = false;
          }
        };
      });
    } catch (error) {
      rowsPanel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      pager.innerHTML = '';
    }
  };
  filters.onsubmit = (event) => { event.preventDefault(); page = 1; loadSubmissions(); };
  filters.elements.assignmentId.onchange = () => { page = 1; loadSubmissions(); };
  loadSubmissions();
}

async function setView(view, options = {}) {
  // Swap the Studio's content panel while preserving the shared sidebar and page shell.
  document
    .querySelectorAll('.side-link')
    .forEach((button) => button.classList.toggle('selected', button.dataset.view === view));
  $('#overviewPanels').classList.toggle('hidden', view !== 'overview');
  $('#bottomPanels').classList.toggle('hidden', view !== 'overview');
  $('#stats').classList.toggle('hidden', !['overview', 'writing', 'audience'].includes(view));
  $('#detailPanel').classList.toggle('hidden', view === 'overview');
  $('#newPost').classList.toggle('hidden', view !== 'overview');
  const titles = {
    overview: ['Your studio.', 'A little space to make things that matter.'],
    writing: ['Your writing.', 'Every idea, from first draft to published piece.'],
    'writing-create': ['Create writing.', 'Shape an idea into a story.'],
    assignments: [
      'Manage student assignments.',
      'Browse and update assignment prompts.',
    ],
    'assignment-create': [
      'Create assignment.',
      'Write a new prompt or update an existing assignment.',
    ],
    'assignment-submissions': [
      'Submissions & grading.',
      'Find student work, review it, and record grades.',
    ],
    'student-activity': [
      'Student activity.',
      'A readable timeline of important actions in the student service.',
    ],
    'student-records': [
      'Student records.',
      'Attendance, submissions, grades, totals, and student activity.',
    ],
    'user-management': [
      'User management.',
      'Manage member access to comments, likes, and Alexore accounts.',
    ],
    audience: ['Your community.', 'A growing circle of curious, thoughtful people.'],
    comments: ['Reader comments.', 'Review comments before they appear beneath your writing.'],
    messages: ['Contact messages.', 'Read and reply to messages sent through your contact form.'],
    about: [
      'About page.',
      'Manage the story, themes, and closing call to action on your About page.',
    ],
    shop: ['Books & products.', 'Upload and publish books and digital products.'],
    library: [
      'Video & podcasts.',
      'Publish episodes and videos for people to watch and listen to.',
    ],
    products: [
      'Shop page content.',
      'Edit the introduction to your books and products storefront.',
    ],
    media: ['Media page content.', 'Edit the introduction to your video and podcast library.'],
    speaking: ['Speaking page content.', 'Edit the public speaking page.'],
    settings: ['Site settings.', 'Your public profile, links, and content backup.'],
  };
  $('#viewTitle').textContent =
    view === 'assignment-create' && options.assignmentId ? 'Edit assignment.' : titles[view][0];
  $('#viewSubtitle').textContent = titles[view][1];
  const panel = $('#detailPanel');
  if (view === 'writing-create') {
    if (articleEditorSuspended) resumeArticleEditor();
    else openEditor();
  } else if (view === 'writing') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">THE NOTEBOOK</div><h2>All writing</h2></div><button class="plain-link" id="viewNew">＋ New article</button><button class="plain-link" id="exportArticles">Download backup ↓</button></div><div class="detail-list" id="studioWritingList"></div>`;
    const writingPager = createPagination($('#studioWritingList'), {
      pageSize: 15,
      label: 'Writing',
    });
    writingPager.setItems(
      articles,
      (article) =>
        `<div class="detail-row"><span>${escapeHtml(article.title)} <small> · ${escapeHtml(article.category)}</small></span><span><small>${article.status.toUpperCase()} · ${escapeHtml(article.date)} · ${Number(article.viewCount || 0)} views</small> <button class="plain-link edit-article" data-id="${article.id}">Edit</button></span></div>`
    );
    $('#viewNew').onclick = () => setView('writing-create');
    $('#exportArticles').onclick = () => {
      downloadFile('alexore-articles.json', JSON.stringify(articles, null, 2), 'application/json');
      toast('Article backup downloaded.');
    };
    panel.onclick = (event) => {
      const button = event.target.closest('.edit-article');
      if (button) openEditor(articles.find((article) => String(article.id) === button.dataset.id));
    };
  } else if (['assignments', 'assignment-create', 'assignment-submissions'].includes(view)) {
    await renderAssignmentStudioView(view, panel, options);
  } else if (view === 'student-records') {
    await renderStudentRecords(panel, options.studentId || '');
  } else if (view === 'user-management') {
    await renderUserManagement(panel);
  } else if (view === 'student-activity') {
    const result = await api('student-activity');
    const activity = result.activity || [];
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">STUDENT LEARNING SERVICE</div><h2>Recent activity</h2></div><button class="plain-link" id="refreshStudentActivity" type="button">Refresh ↻</button></div><p>Account setup, submissions, reviews, grades, and forum activity appear here in plain language.</p><div id="studentActivityPages"></div>`;
    if (activity.length) {
      createPagination($('#studentActivityPages'), { pageSize: 25, label: 'Student activity' }).setItems(
        activity,
        (item) => `<article class="student-activity-entry"><span class="student-activity-mark" aria-hidden="true">•</span><div><b>${escapeHtml(item.description)}</b><time>${escapeHtml(item.createdAt)}</time></div></article>`
      );
    } else {
      $('#studentActivityPages').innerHTML = '<div class="empty-state">No student activity yet. New activity will appear here.</div>';
    }
    $('#refreshStudentActivity').onclick = () => setView('student-activity');
  } else if (view === 'audience') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">YOUR EMAIL COMMUNITY</div><h2>${subscribers.length} subscribers</h2></div><button class="plain-link" id="exportSubscribers">Download CSV ↓</button></div><p>Subscriber emails are stored in your site database. Connect an email service when you’re ready to send newsletters.</p><div class="detail-list" id="studioAudienceList"></div>`;
    createPagination($('#studioAudienceList'), { pageSize: 20, label: 'Subscribers' }).setItems(
      subscribers,
      (row) =>
        `<div class="detail-row">${escapeHtml(row.email)}<small>${escapeHtml(row.date)}</small></div>`
    );
    $('#exportSubscribers').onclick = () => {
      const csv =
        'email\r\n' + subscribers.map((row) => `"${row.email.replaceAll('"', '""')}"`).join('\r\n');
      downloadFile('alexore-subscribers.csv', csv, 'text/csv');
      toast('Subscriber list downloaded.');
    };
  } else if (view === 'comments') {
    const result = await api('comments', { query: { include: 'all' } });
    const comments = result.comments || [];
    const pendingCount = comments.filter((comment) => comment.status === 'pending').length;
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">READER CONVERSATION</div><h2>${pendingCount} awaiting review</h2></div></div><p>Comments stay private until approved. Reader email addresses are never shown here or published.</p>${comments.length ? `<div class="detail-list">${comments.map((comment) => `<article class="moderation-comment"><div class="moderation-comment-head"><span><b>${escapeHtml(comment.isAnonymous ? 'Anonymous' : comment.displayName)}</b> on <a href="article.html?slug=${encodeURIComponent(comment.slug)}" target="_blank" rel="noopener">${escapeHtml(comment.articleTitle)}</a></span><small>${escapeHtml(comment.status.toUpperCase())} · ${escapeHtml(comment.date)}</small></div><p>${escapeHtml(comment.commentText)}</p><div class="moderation-comment-actions"><button class="plain-link moderate-comment" data-id="${comment.id}" data-status="${comment.status === 'approved' ? 'rejected' : 'approved'}">${comment.status === 'approved' ? 'Hide comment' : 'Approve comment'}</button></div></article>`).join('')}</div>` : '<div class="empty-state">No comments yet. Reader responses will appear here for review.</div>'}`;
    panel.querySelectorAll('.moderation-comment > p').forEach((node, index) => {
      const formattedComment = document.createElement('div');
      formattedComment.className = 'comment-body';
      formattedComment.innerHTML = safeCommentHtml(comments[index].commentText);
      node.replaceWith(formattedComment);
    });
    panel.querySelectorAll('.moderate-comment').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            await api('comments', {
              method: 'POST',
              data: { moderate: true, id: button.dataset.id, status: button.dataset.status },
            });
            await setView('comments');
            toast(button.dataset.status === 'approved' ? 'Comment approved.' : 'Comment hidden.');
          } catch (error) {
            button.disabled = false;
            toast(error.message);
          }
        })
    );
  } else if (view === 'messages') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">CONTACT INBOX</div><h2>${contactMessages.filter((message) => message.status === 'new').length} unread · ${contactMessages.length} total</h2></div></div><p>Messages sent through your public contact form appear here. Reply directly from your email app.</p>${contactMessagesLoadError ? '<div class="empty-state">The inbox is temporarily unavailable. Please try again later.</div>' : contactMessages.length ? `<div class="detail-list">${contactMessages.map((message) => `<article class="moderation-comment"><div class="moderation-comment-head"><span><b>${escapeHtml(message.name)}</b> · <a href="mailto:${encodeURIComponent(message.email)}">${escapeHtml(message.email)}</a></span><small>${escapeHtml(message.status.toUpperCase())} · ${escapeHtml(message.date)}</small></div><h3>${escapeHtml(message.subject)}</h3><p class="contact-inbox-message">${escapeHtml(message.message).replace(/\r?\n/g, '<br>')}</p><div class="moderation-comment-actions"><a class="plain-link" href="mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(`Re: ${message.subject}`)}">Reply by email ↗</a>${message.status === 'new' ? `<button class="plain-link mark-message-read" data-id="${message.id}">Mark as read</button>` : ''}</div></article>`).join('')}</div>` : '<div class="empty-state">No messages yet. New contact form messages will appear here.</div>'}`;
    panel.querySelectorAll('.mark-message-read').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            await api('messages', {
              method: 'POST',
              data: { id: button.dataset.id, status: 'read' },
            });
            await loadData();
            await setView('messages');
          } catch (error) {
            button.disabled = false;
            toast(error.message);
          }
        })
    );
  } else if (view === 'shop' || view === 'library') {
    const shop = view === 'shop';
    const types = shop ? ['book', 'product'] : ['video', 'podcast'];
    const items = contentItems.filter((item) => types.includes(item.kind));
    const typeLabel = (kind) =>
      ({ book: 'BOOK', product: 'DIGITAL PRODUCT', video: 'VIDEO', podcast: 'PODCAST' })[kind] ||
      kind.toUpperCase();
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${shop ? 'SHOP INVENTORY' : 'MEDIA LIBRARY'}</div><h2>${items.length} ${shop ? 'books & products' : 'videos & podcasts'}</h2></div><button class="button button-dark" id="newContentItem">＋ Add ${shop ? 'a book or product' : 'a video or podcast'}</button></div><p>${shop ? 'Add books and downloadable products, upload a digital file, and link to your checkout provider when you sell an item.' : 'Add a video or podcast episode by pasting its hosted video, audio, or streaming URL.'}</p><form id="contentItemForm" class="products-form hidden"><input type="hidden" name="id"><section class="products-editor-group"><div class="eyebrow">CONTENT DETAILS</div><div class="field-row"><label class="field-label">TYPE<select name="kind">${types.map((kind) => `<option value="${kind}">${typeLabel(kind)}</option>`).join('')}</select></label><label class="field-label">TITLE<input name="title" required maxlength="240"></label></div><div class="field-row"><label class="field-label">CATEGORY<input name="category" maxlength="80" placeholder="Becoming, Work, Money…" required></label><label class="field-label">TAGS<input name="tags" maxlength="500" placeholder="Separate tags with commas"></label></div><label class="field-label">SHORT DESCRIPTION<textarea name="summary" rows="3" maxlength="500"></textarea></label><label class="field-label">DETAIL PAGE COPY<textarea name="body" rows="6" placeholder="Additional context, notes, or product details…"></textarea></label></section><section class="products-editor-group"><div class="eyebrow">IMAGE & DELIVERY</div><label class="field-label">COVER IMAGE URL<input name="coverImage" placeholder="uploads/… or https://…"></label><div class="field-row"><label class="field-label">UPLOAD COVER IMAGE<input type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/gif"></label>${shop ? '<label class="field-label">DIGITAL FILE URL<input name="assetUrl" type="text" placeholder="uploads/…"></label><label class="field-label">UPLOAD FILE (PDF, EPUB, ZIP, DOCX)<input type="file" name="assetFile" accept=".pdf,.epub,.zip,.docx"></label>' : '<span class="field-help">Set the media URL below.</span>'}</div>${shop ? '<div class="field-row"><label class="field-label">PRICE<input name="price" type="number" min="0" step="0.01" placeholder="Optional"></label><label class="field-label">CURRENCY<input name="currency" value="NGN" maxlength="3"></label></div><label class="field-label">PURCHASE / CHECKOUT URL<input name="purchaseUrl" type="url" placeholder="https://"></label>' : '<label class="field-label">VIDEO / AUDIO URL<input name="mediaUrl" type="url" placeholder="YouTube, Vimeo, Spotify, or audio URL"></label>'}<label class="field-label">STATUS<select name="status"><option>Draft</option><option>Published</option></select></label></section><div class="settings-actions"><button class="button button-dark" type="submit">Save item <span>↗</span></button><button class="button button-outline" type="button" id="cancelContentItem">Cancel</button></div></form><div id="contentItemList" class="detail-list">${items.length ? items.map((item) => `<div class="detail-row"><span>${escapeHtml(item.title)} <small> · ${typeLabel(item.kind)} · ${escapeHtml(item.category)}</small></span><span><small>${item.status.toUpperCase()}</small> <button class="plain-link edit-content-item" data-id="${item.id}">Edit</button></span></div>`).join('') : '<div class="empty-state">Nothing here yet. Add your first item when it is ready.</div>'}</div>`;
    const form = $('#contentItemForm');
    const showForm = (item) => {
      form.reset();
      form.classList.remove('hidden');
      $('#contentItemList').classList.add('hidden');
      form.elements.id.value = item?.id || '';
      form.elements.kind.value = item?.kind || types[0];
      [
        'title',
        'category',
        'tags',
        'summary',
        'body',
        'coverImage',
        'mediaUrl',
        'assetUrl',
        'purchaseUrl',
        'price',
        'currency',
        'status',
      ].forEach((key) => {
        if (form.elements[key])
          form.elements[key].value =
            item?.[key] ?? (key === 'currency' ? 'NGN' : key === 'status' ? 'Draft' : '');
      });
      $('#newContentItem').classList.add('hidden');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#newContentItem').onclick = () => showForm();
    $('#cancelContentItem').onclick = () => {
      form.classList.add('hidden');
      $('#contentItemList').classList.remove('hidden');
      $('#newContentItem').classList.remove('hidden');
    };
    panel
      .querySelectorAll('.edit-content-item')
      .forEach(
        (button) =>
          (button.onclick = () =>
            showForm(items.find((item) => String(item.id) === button.dataset.id)))
      );
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!shop && data.status === 'Published' && !String(data.mediaUrl || '').trim()) {
        toast('Add a hosted video or audio URL before publishing.');
        form.elements.mediaUrl.focus();
        return;
      }
      if (
        shop &&
        data.status === 'Published' &&
        Number(data.price) > 0 &&
        !String(data.purchaseUrl || '').trim()
      ) {
        toast('Add a checkout URL before publishing a priced item.');
        form.elements.purchaseUrl.focus();
        return;
      }
      try {
        const cover = form.elements.coverFile.files[0];
        if (cover) {
          const body = new FormData();
          body.append('image', cover);
          const response = await fetch(`${API}?route=upload`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Cover image upload failed.');
          data.coverImage = result.url;
        }
        const asset = form.elements.assetFile?.files[0];
        if (asset) {
          const body = new FormData();
          body.append('asset', asset);
          const response = await fetch(`${API}?route=asset-upload`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'same-origin',
            body,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Digital file upload failed.');
          data.assetUrl = result.url;
        }
        delete data.coverFile;
        delete data.assetFile;
        await api('content', { method: 'POST', data });
        await loadData();
        await setView(view);
        toast(data.status === 'Published' ? 'Content published.' : 'Draft saved.');
      } catch (error) {
        toast(error.message);
      }
    };
  } else if (view === 'products') {
    const defaults = {
      products_heading: 'From the page\ninto practice.',
      products_intro:
        'Books and frameworks are where ideas get room to deepen. I’m shaping two ways to explore work, money, becoming, and the conversations that matter.',
      products_section_heading: 'Made slowly.\nMade with care.',
      products_section_body:
        'The work is still taking shape. I’ll share more as the ideas become useful, clear, and ready to travel beyond these pages.',
      book_status: 'BOOK · IN PROGRESS',
      book_card_title: 'A book, taking shape',
      book_card_description:
        'A longer exploration of the questions behind these notes: how we work, what we value, and who we are becoming.',
      book_hero_title: 'A longer note\non becoming.',
      book_lead:
        'I’m working on a book that gathers the questions I keep returning to: the work we choose, our relationship with money, the inner life, and how we keep becoming without losing what matters.',
      book_section_title: 'A work in\nthe making.',
      book_section_body:
        'This page will grow as the manuscript finds its shape. For now, it’s a place to follow the questions and themes that are guiding the work.',
      framework_status: 'FRAMEWORK · IN PROGRESS',
      framework_card_title: 'A framework for practice',
      framework_card_description:
        'A practical structure is emerging from the ideas I teach, write about, and return to in my own life.',
      framework_hero_title: 'Ideas you can\nput into practice.',
      framework_lead:
        'I’m shaping a practical framework from the patterns I notice across teaching, work, money, and the inner work of becoming. The aim is to turn good questions into thoughtful next steps.',
      framework_section_title: 'Useful before\nit’s finished.',
      framework_section_body:
        'The framework doesn’t have a final name, format, or method yet. I’m developing it in public through essays and learning experiences. These are broad areas of interest, not a finished model.',
    };
    const field = (key, label) =>
      `<label class="field-label">${label}<textarea name="${key}" rows="3">${escapeHtml(settings[key] || defaults[key])}</textarea></label>`;
    const inputField = (key, label) =>
      `<label class="field-label">${label}<input name="${key}" value="${escapeHtml(settings[key] || defaults[key])}"></label>`;
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">SHOP PAGE CONTENT</div><h2>Edit the shop landing page</h2></div><a class="plain-link" href="products.html" target="_blank" rel="noopener">Preview shop ↗</a></div><p>Update the shop introduction and featured book/framework cards. Published inventory appears in the storefront below.</p><form id="productsForm" class="products-form"><section class="products-editor-group"><div class="eyebrow">THE COLLECTION</div><div class="field-row">${field('products_heading', 'PAGE HEADLINE', true)}${field('products_intro', 'INTRODUCTION', true)}</div><div class="field-row">${field('products_section_heading', 'SECTION HEADING', true)}${field('products_section_body', 'SECTION COPY', true)}</div></section><section class="products-editor-group"><div class="eyebrow">THE BOOK</div><div class="field-row">${inputField('book_status', 'STATUS TAG')}${inputField('book_card_title', 'CARD TITLE')}</div>${field('book_card_description', 'CARD DESCRIPTION', true)}${field('book_hero_title', 'PAGE HEADLINE', true)}${field('book_lead', 'INTRODUCTION', true)}<div class="field-row">${field('book_section_title', 'SECTION HEADING', true)}${field('book_section_body', 'SECTION COPY', true)}</div><a class="plain-link" href="book.html" target="_blank" rel="noopener">Preview book page ↗</a></section><section class="products-editor-group"><div class="eyebrow">THE FRAMEWORK</div><div class="field-row">${inputField('framework_status', 'STATUS TAG')}${inputField('framework_card_title', 'CARD TITLE')}</div>${field('framework_card_description', 'CARD DESCRIPTION', true)}${field('framework_hero_title', 'PAGE HEADLINE', true)}${field('framework_lead', 'INTRODUCTION', true)}<div class="field-row">${field('framework_section_title', 'SECTION HEADING', true)}${field('framework_section_body', 'SECTION COPY', true)}</div><a class="plain-link" href="framework.html" target="_blank" rel="noopener">Preview framework page ↗</a></section><div class="settings-actions"><button class="button button-dark" type="submit">Save shop page <span>↗</span></button></div></form>`;
    $('#productsForm').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await api('settings', { method: 'POST', data: values });
        settings = { ...settings, ...values };
        toast('Shop page saved.');
      } catch (error) {
        toast(error.message);
      }
    };
  } else if (view === 'about') {
    const defaults = {
      about_hero_title: 'Curiosity is a\nway of',
      about_hero_emphasis: 'living.',
      about_intro:
        'I’m Ore — a tech educator, writer, and lifelong student of what makes a meaningful life. I make complex ideas feel human, and share what I’m learning along the way.',
      about_section_title: 'Learn, make,\nbecome.',
      about_detail:
        'These pages are where my interests meet: technology and growth, ambition and faith, the work we do and the people we’re becoming.',
      about_story_continued:
        'I move between teaching, writing, speaking, and making practical resources. Each is a way to take a question seriously, make room for thoughtful conversation, and turn what we learn into something useful.',
      about_point1_title: 'Technology, made human',
      about_point1_body: 'Clear, people-first learning for a world shaped by AI.',
      about_point2_title: 'Ideas worth living',
      about_point2_body: 'Notes on work, money, faith, growth, and becoming.',
      about_point3_title: 'Practice and possibility',
      about_point3_body: 'Frameworks and tools that help ideas travel into everyday life.',
      about_point4_title: 'Better conversations',
      about_point4_body: 'Space to think deeply about the future we are making together.',
      about_bottom_title: 'Keep becoming.',
      about_bottom_body:
        'Follow along through the writing, or get an occasional note when there’s something new to share.',
    };
    const field = (key, label, rows = 3) => {
      const current =
        key === 'about_intro' ? settings.about_intro || settings.intro : settings[key];
      return `<label class="field-label">${label}<textarea name="${key}" rows="${rows}">${escapeHtml(current || defaults[key])}</textarea></label>`;
    };
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">PAGE CONTENT</div><h2>Edit the About page</h2></div><a class="plain-link" href="about.html" target="_blank" rel="noopener">Preview About page ↗</a></div><p>Shape your introduction, the ideas behind your work, and the closing invitation. The page keeps its existing layout and visual style.</p><form id="aboutPageForm" class="products-form"><section class="products-editor-group"><div class="eyebrow">INTRODUCTION</div>${field('about_hero_title', 'HEADLINE', 2)}<div class="field-row">${field('about_hero_emphasis', 'HIGHLIGHT WORD', 1)}${field('about_intro', 'INTRODUCTION', 4)}</div></section><section class="products-editor-group"><div class="eyebrow">YOUR STORY</div>${field('about_section_title', 'SECTION HEADING', 2)}${field('about_detail', 'SECTION INTRODUCTION', 3)}${field('about_story_continued', 'CONTINUED', 4)}</section><section class="products-editor-group"><div class="eyebrow">WHAT MATTERS TO YOU</div>${[1, 2, 3, 4].map((index) => `<div class="field-row">${field(`about_point${index}_title`, `THEME ${index} TITLE`, 2)}${field(`about_point${index}_body`, `THEME ${index} DESCRIPTION`, 3)}</div>`).join('')}</section><section class="products-editor-group"><div class="eyebrow">CLOSING</div>${field('about_bottom_title', 'CLOSING HEADING', 2)}${field('about_bottom_body', 'CLOSING COPY', 3)}</section><div class="settings-actions"><button class="button button-dark" type="submit">Save About page <span>↗</span></button></div></form>`;
    $('#aboutPageForm').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await api('settings', { method: 'POST', data: values });
        settings = { ...settings, ...values };
        toast('About page saved.');
      } catch (error) {
        toast(error.message);
      }
    };
  } else if (view === 'media' || view === 'speaking') {
    const media = view === 'media';
    const defaults = media
      ? {
          media_hero_title: 'The notebook,\nout loud.',
          media_lead:
            'I’m preparing to bring article ideas into video and audio: practical training on technology and AI, alongside spoken reflections and conversations about work and becoming.',
          media_section_title: 'A new way\nto share.',
          media_section_body:
            'The plan is to start publishing article-inspired podcast content on YouTube in 2027, alongside training videos with a special focus on AI. The format and schedule are still being worked out.',
          media_bottom_title: 'Be there from the start.',
          media_bottom_body:
            'Get an occasional note when new videos, audio, and lessons are ready.',
        }
      : {
          speaking_hero_title: 'Ideas for the\nwork of being.',
          speaking_lead:
            'I’m growing into public speaking and looking forward to conversations that help people think more deeply about technology, growth, self-discovery, and the kind of life we are building.',
          speaking_section_title: 'Room for\nmeaning.',
          speaking_section_body:
            'Talks and conversations are still taking shape. These are the themes I’m drawn to bring into a room, with curiosity, practical insight, and a Christ-like grounding.',
          speaking_bottom_title: 'Let’s keep talking.',
          speaking_bottom_body:
            'Speaking details and booking information will be added as this work grows. Join the list for updates.',
        };
    const key = (suffix) => `${view}_${suffix}`;
    const textarea = (suffix, label) =>
      `<label class="field-label">${label}<textarea name="${key(suffix)}" rows="${suffix.includes('title') ? 2 : 4}">${escapeHtml(settings[key(suffix)] || defaults[key(suffix)])}</textarea></label>`;
    const page = media ? 'media.html' : 'speaking.html';
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${media ? 'ON CAMERA & IN YOUR EARS' : 'ON STAGE'}</div><h2>Edit the ${media ? 'video & podcast' : 'speaking'} page</h2></div><a class="plain-link" href="${page}" target="_blank" rel="noopener">Preview page ↗</a></div><p>Update the public page while keeping its existing layout and visual style.</p><form id="publicContentForm" class="products-form"><section class="products-editor-group"><div class="eyebrow">INTRODUCTION</div>${textarea('hero_title', 'PAGE HEADLINE')}${textarea('lead', 'LEAD')}</section><section class="products-editor-group"><div class="eyebrow">${media ? 'WHAT’S COMING' : 'POSSIBLE CONVERSATIONS'}</div>${textarea('section_title', 'SECTION HEADING')}${textarea('section_body', 'SECTION COPY')}</section><section class="products-editor-group"><div class="eyebrow">NEXT STEP</div>${textarea('bottom_title', 'CLOSING HEADING')}${textarea('bottom_body', 'CLOSING COPY')}</section><div class="settings-actions"><button class="button button-dark" type="submit">Save ${media ? 'video & podcast' : 'speaking'} page <span>↗</span></button></div></form>`;
    $('#publicContentForm').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await api('settings', { method: 'POST', data: values });
        settings = { ...settings, ...values };
        toast(`${media ? 'Video & podcast' : 'Speaking'} page saved.`);
      } catch (error) {
        toast(error.message);
      }
    };
  } else if (view === 'settings') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">MAKE IT YOURS</div><h2>Public profile & links</h2></div></div><p>Update your homepage introduction, ways to connect, and social links. Edit the full About page from the Page Content section.</p><form id="settingsForm" class="settings-form"><label class="field-label">HOMEPAGE INTRODUCTION<textarea name="home_intro" rows="2" placeholder="Notes on work, money, becoming, and conversations that matter.">${escapeHtml(settings.home_intro || '')}</textarea></label><label class="field-label">WAYS TO CONNECT INTRODUCTION<textarea name="offers_intro" rows="2">${escapeHtml(settings.offers_intro || 'From the page to the stage to the classroom — here are a few ways we can connect.')}</textarea></label><label class="field-label">CONTACT FORM EMAIL DESTINATION<input name="contact_delivery_email" type="email" value="${escapeHtml(settings.contact_delivery_email || '')}" placeholder="you@example.com"><small class="field-help">Prepared for email delivery. Messages currently appear in Studio; email forwarding needs a mail service connection.</small></label><label class="field-label">PUBLIC SITE URL<input name="public_site_url" type="url" value="${escapeHtml(settings.public_site_url || '')}" placeholder="https://alexore.com"><small class="field-help">Used by the student subdomain to link back to your published articles.</small></label><label class="field-label">ARTICLE AUTO-SAVE<select name="editor_autosave_minutes"><option value="0" ${Number(settings.editor_autosave_minutes) === 0 ? 'selected' : ''}>Off</option><option value="5" ${Number(settings.editor_autosave_minutes ?? 5) === 5 ? 'selected' : ''}>Every 5 minutes</option><option value="10" ${Number(settings.editor_autosave_minutes) === 10 ? 'selected' : ''}>Every 10 minutes</option><option value="15" ${Number(settings.editor_autosave_minutes) === 15 ? 'selected' : ''}>Every 15 minutes</option></select></label><div class="settings-grid">${[
      ['x', 'X'],
      ['medium', 'Medium'],
      ['substack', 'Substack'],
      ['linkedin', 'LinkedIn'],
      ['youtube', 'YouTube'],
    ]
      .map(
        ([key, label]) =>
          `<label class="field-label">${label.toUpperCase()} PROFILE URL<input name="${key}" type="url" placeholder="https://" value="${escapeHtml(settings[key] || '')}"></label>`
      )
      .join(
        ''
      )}</div><div class="settings-actions"><button class="button button-dark" type="submit">Save site settings <span>↗</span></button><button class="button button-outline" type="button" id="exportAll">Download all data ↓</button></div></form>`;
    $('#settingsForm').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await api('settings', { method: 'POST', data: values });
        settings = { ...settings, ...values };
        startServerAutosave();
        toast('Site settings saved.');
      } catch (error) {
        toast(error.message);
      }
    };
    $('#exportAll').onclick = () => {
      downloadFile(
        'alexore-site-backup.json',
        JSON.stringify({ articles, subscribers, settings }, null, 2),
        'application/json'
      );
      toast('Full site backup downloaded.');
    };
  } else {
    const content = {
      media: [
        'VIDEO LESSONS',
        'Plan practical AI and technology tutorials for your YouTube channel.',
        'ARTICLE TO AUDIO',
        'Adapt essays into thoughtful, listenable podcast episodes, planned for 2027.',
      ],
      speaking: [
        'TALK IDEAS',
        'Collect talk titles, outlines, and the stories you want to bring to a room.',
        'BOOKING INFORMATION',
        'Add your topics, event details, and contact path when you are ready to book.',
      ],
    }[view];
    const publicPage = { media: 'media.html', speaking: 'speaking.html' }[view];
    panel.innerHTML = `<div class="eyebrow">${view === 'products' ? 'IN DEVELOPMENT' : 'IN PROGRESS'}</div><h2>${titles[view][0].replace('.', '')}</h2><p>${titles[view][1]} This space is ready for you to plan, organize, and publish when each idea is ready.</p><div class="detail-list">${content.map((item, index) => `<div class="detail-row"><span>${item}</span><small>${index === 0 ? 'IN PROGRESS' : 'COMING SOON'}</small></div>`).join('')}</div><p><a class="plain-link" href="${publicPage}" target="_blank" rel="noopener">View public detail page ↗</a></p>`;
  }
}

document
  .querySelectorAll('[data-view]')
  .forEach((button) =>
    button.addEventListener('click', () => {
      const nextView = button.dataset.view;
      const editorOpen = !$('#editorPage').classList.contains('hidden');
      if (editorOpen && nextView === 'writing-create') return;
      if (editorOpen) suspendArticleEditor();
      setView(nextView);
    })
  );
document
  .querySelectorAll('[data-go]')
  .forEach((button) => button.addEventListener('click', () => setView(button.dataset.go)));
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#loginMessage').classList.remove('login-error');
  try {
    const result = await api('auth', {
      method: 'POST',
      data: { username: $('#adminUsername').value.trim(), password: $('#adminPassword').value },
    });
    csrfToken = result.csrf;
    setProfileName(result.displayName || 'Alex Ore');
    $('#adminPassword').value = '';
    toggleStudio(true);
    await loadData();
  } catch (error) {
    $('#loginMessage').textContent = error.message;
    $('#loginMessage').classList.add('login-error');
  }
});
$('#togglePassword').addEventListener('click', () => {
  const input = $('#adminPassword');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  $('#togglePassword').textContent = visible ? 'Hide' : 'Show';
  $('#togglePassword').setAttribute('aria-pressed', String(visible));
});

startStudio();
