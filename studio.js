const $ = selector => document.querySelector(selector);
const API = 'api/index.php';
let articles = [];
let contentItems = [];
let subscribers = [];
let settings = {};
let csrfToken = '';
let editingId = null;
let editorReturnView = 'overview';

$('.studio-content').append($('#editorPage'));
let autosaveTimer = null;
let articlePreviewOpen = false;
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

async function api(route, {method = 'GET', data = null, query = {}} = {}) {
  const headers = {'Accept': 'application/json'};
  if (data !== null) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const params = new URLSearchParams({route, ...query});
  const response = await fetch(`${API}?${params}`, {
    method, headers, credentials: 'same-origin', body: data === null ? undefined : JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2400);
}

function toggleStudio(show) {
  ['.sidebar', '.studio-top', '.studio-content', '.studio-footer'].forEach(selector => {
    const node = $(selector);
    if (node) node.classList.toggle('hidden', !show);
  });
  $('#loginScreen').classList.toggle('hidden', show);
}

async function loadData() {
  const [articleResult, subscriberResult, settingsResult, contentResult] = await Promise.all([
    api('articles', {query:{include:'all'}}), api('subscribers'), api('settings'), api('content', {query:{include:'all'}})
  ]);
  articles = articleResult.articles || [];
  subscribers = subscriberResult.subscribers || [];
  settings = settingsResult.settings || {};
  contentItems = contentResult.items || [];
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
  const published = articles.filter(article => article.status === 'Published');
  const drafts = articles.filter(article => article.status === 'Draft');
  $('#publishedCount').textContent = String(published.length).padStart(2, '0');
  $('#draftStat').textContent = String(drafts.length).padStart(2, '0');
  $('#draftCount').textContent = drafts.length;
  $('#subscriberCount').textContent = subscribers.length;
  $('#audienceCount').textContent = subscribers.length;
  $('#recentList').innerHTML = articles.slice(0, 3).map((article, index) => `
    <div class="recent-item"><div class="recent-thumb">${['✳','↗','▤'][index]}</div>
    <div><b>${escapeHtml(article.title)}</b><small>${escapeHtml(article.category.toUpperCase())} · ${escapeHtml(article.read.toUpperCase())}</small></div>
    <span class="status ${article.status === 'Draft' ? 'draft' : ''}">${article.status.toUpperCase()}</span></div>`).join('')
    || '<div class="recent-empty">Your first story is waiting to be written.</div>';
}

function openEditor(article = null) {
  editingId = article?.id || null;
  editorReturnView = document.querySelector('.side-link.selected')?.dataset.view || 'overview';
  $('#editorHeading').textContent = article ? 'Edit article' : 'Write a new article';
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
  const localDraft = !article ? localStorage.getItem(draftKey()) : null;
  if (localDraft) {
    try {
      const draft = JSON.parse(localDraft);
      $('#articleTitle').value = draft.title || '';
      $('#articleCategory').value = draft.category || 'Becoming';
      $('#articleTags').value = draft.tags || '';
      $('#articleDeck').value = draft.deck || '';
      $('#articleCover').value = draft.coverImage || '';
      $('#articleSeo').value = draft.seoDescription || '';
      $('#articleBody').innerHTML = draft.body || '';
    } catch { localStorage.removeItem(draftKey()); }
  }
  updateWritingStats();
  ['.studio-heading','#stats','#overviewPanels','#bottomPanels','#detailPanel'].forEach(selector => $(selector)?.classList.add('hidden'));
  $('#editorPage').classList.remove('hidden');
  window.scrollTo({top: 0, behavior: 'smooth'});
  setTimeout(() => $('#articleTitle').focus(), 100);
}

async function closeEditor() {
  $('#editorPage').classList.add('hidden');
  await setView(editorReturnView);
}

async function collect(status) {
  const title = $('#articleTitle').value.trim();
  if (!title) { $('#articleTitle').focus(); toast('Add a title before saving.'); return; }
  const coverImage = $('#articleCover').value.trim();
  if (coverImage && !(/^https?:\/\//i.test(coverImage) || /^uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(coverImage))) {
    toast('Use an http(s) image URL or upload an image here.'); $('#articleCover').focus(); return;
  }
  try {
    await api('articles', {method: 'POST', data: {
      id: editingId, title, category: $('#articleCategory').value, tags: $('#articleTags').value,
      deck: $('#articleDeck').value.trim(), coverImage, seoDescription: $('#articleSeo').value.trim(),
      body: $('#articleBody').innerHTML, status
    }});
    localStorage.removeItem(draftKey());
    await loadData();
    await closeEditor();
    toast(status === 'Published' ? 'Your article is published.' : 'Draft saved to your studio.');
  } catch (error) { toast(error.message); }
}

$('#editorClose').addEventListener('click', closeEditor);
$('#articleForm').addEventListener('submit', event => event.preventDefault());
$('#newPost').addEventListener('click', () => openEditor());
$('#quickArticle').addEventListener('click', () => openEditor());
$('#saveDraft').addEventListener('click', () => collect('Draft'));
$('#publishArticle').addEventListener('click', () => collect('Published'));
function wordCount() { return ($('#articleBody').innerText.trim().match(/\S+/g) || []).length; }
function updateWritingStats() {
  const words = wordCount();
  $('#wordCount').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  $('#wordCountStatus').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
}
function saveLocalDraft() {
  const draft = {title:$('#articleTitle').value,category:$('#articleCategory').value,tags:$('#articleTags').value,deck:$('#articleDeck').value,coverImage:$('#articleCover').value,seoDescription:$('#articleSeo').value,body:$('#articleBody').innerHTML};
  try { localStorage.setItem(draftKey(), JSON.stringify(draft)); $('#saveStatus').textContent = 'Saved in this browser'; } catch { $('#saveStatus').textContent = 'Browser storage is full'; }
}
function scheduleLocalDraft() { $('#saveStatus').textContent = 'Saving…'; clearTimeout(autosaveTimer); autosaveTimer = setTimeout(saveLocalDraft, 500); updateWritingStats(); }
function rememberEditorRange() {
  const selection = window.getSelection();
  if (selection?.rangeCount && $('#articleBody').contains(selection.anchorNode)) savedEditorRange = selection.getRangeAt(0).cloneRange();
}
function insertHtmlAtCursor(html) {
  $('#articleBody').focus();
  if (savedEditorRange) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedEditorRange); }
  document.execCommand('insertHTML', false, html); savedEditorRange = null; scheduleLocalDraft();
}
document.querySelectorAll('.editor-toolbar [data-command]').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
document.querySelectorAll('.editor-toolbar [data-command]').forEach(button => button.addEventListener('click', () => { $('#articleBody').focus(); document.execCommand(button.dataset.command, false, null); scheduleLocalDraft(); }));
$('#blockStyle').addEventListener('change', event => { $('#articleBody').focus(); document.execCommand('formatBlock', false, event.target.value); scheduleLocalDraft(); });
document.querySelectorAll('.editor-toolbar [data-action]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.action;
  if (action === 'link') { const url = prompt('Paste a link starting with https://'); if (url && /^https?:\/\//i.test(url)) { $('#articleBody').focus(); document.execCommand('createLink', false, url); } }
  if (action === 'image') { rememberEditorRange(); uploadTarget = 'body'; $('#articleImageFile').click(); }
  if (action === 'clear') { $('#articleBody').focus(); document.execCommand('removeFormat', false, null); }
  scheduleLocalDraft();
}));
$('#coverImageUpload').addEventListener('click', () => { uploadTarget = 'cover'; $('#articleImageFile').click(); });
$('#articleImageFile').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('Images must be smaller than 8 MB.'); return; }
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { toast('Choose a JPG, PNG, GIF, or WebP image.'); return; }
  const form = new FormData(); form.append('image', file);
  try {
    const response = await fetch(`${API}?route=upload`, {method:'POST',headers:{'Accept':'application/json','X-CSRF-Token':csrfToken},credentials:'same-origin',body:form});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The image upload failed.');
    if (uploadTarget === 'cover') { $('#articleCover').value = result.url; scheduleLocalDraft(); }
    else { const alt = prompt('Describe the image for readers using screen readers') || ''; insertHtmlAtCursor(`<img src="${escapeHtml(result.url)}" alt="${escapeHtml(alt)}">`); }
    toast('Image uploaded.');
  } catch (error) { toast(error.message); }
});
$('#articleBody').addEventListener('input', () => {
  scheduleLocalDraft();
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  const showCommands = node?.nodeType === Node.TEXT_NODE && node.textContent.slice(0, selection.anchorOffset).endsWith('/');
  $('#slashMenu').classList.toggle('hidden', !showCommands);
});
document.querySelectorAll('#slashMenu [data-block]').forEach(button => {
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      range.setStart(node, selection.anchorOffset - 1); range.setEnd(node, selection.anchorOffset); range.deleteContents();
      selection.removeAllRanges(); selection.addRange(range);
    }
    $('#articleBody').focus();
    const block = button.dataset.block;
    if (block === 'UL') document.execCommand('insertUnorderedList', false, null);
    else if (block === 'OL') document.execCommand('insertOrderedList', false, null);
    else if (block === 'HR') document.execCommand('insertHorizontalRule', false, null);
    else document.execCommand('formatBlock', false, block);
    $('#slashMenu').classList.add('hidden'); scheduleLocalDraft();
  });
});
$('#articleBody').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveLocalDraft(); toast('Draft saved in this browser.'); }
});
['articleTitle','articleCategory','articleTags','articleDeck','articleCover','articleSeo'].forEach(id => {
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
document.addEventListener('click', event => { if (!$('#profileMenu').contains(event.target)) closeProfileMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProfileMenu(); });
$('#logoutButton').addEventListener('click', async () => {
  try { await api('auth', {method:'POST', data:{action:'logout'}}); csrfToken=''; closeProfileMenu(); setProfileName('Alex Ore'); toggleStudio(false); $('#loginMessage').textContent='You have been signed out.'; $('#loginMessage').classList.remove('login-error'); }
  catch (error) { toast(error.message); }
});
function downloadFile(name, data, type) {
  const blob = new Blob([data], {type}), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

async function setView(view) {
  document.querySelectorAll('.side-link').forEach(button => button.classList.toggle('selected', button.dataset.view === view));
  $('#overviewPanels').classList.toggle('hidden', view !== 'overview');
  $('#bottomPanels').classList.toggle('hidden', view !== 'overview');
  $('#stats').classList.toggle('hidden', !['overview','writing','audience'].includes(view));
  $('#detailPanel').classList.toggle('hidden', view === 'overview');
  $('#newPost').classList.toggle('hidden', !['overview','writing'].includes(view));
  const titles = {
    overview:['Your studio.','A little space to make things that matter.'], writing:['Your writing.','Every idea, from first draft to published piece.'],
    audience:['Your community.','A growing circle of curious, thoughtful people.'],
    shop:['Books & products.','Upload and publish books and digital products.'], library:['Video & podcasts.','Publish episodes and videos for people to watch and listen to.'],
    products:['Shop page content.','Edit the introduction to your books and products storefront.'],
    media:['Media page content.','Edit the introduction to your video and podcast library.'], speaking:['Speaking page content.','Edit the public speaking page.'],
    settings:['Site settings.','Your public profile, links, and content backup.']
  };
  $('#viewTitle').textContent = titles[view][0]; $('#viewSubtitle').textContent = titles[view][1];
  const panel = $('#detailPanel');
  if (view === 'writing') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">THE NOTEBOOK</div><h2>All writing</h2></div><button class="plain-link" id="viewNew">＋ New article</button><button class="plain-link" id="exportArticles">Download backup ↓</button></div><div class="detail-list">${articles.length ? articles.map(article => `<div class="detail-row"><span>${escapeHtml(article.title)} <small> · ${escapeHtml(article.category)}</small></span><span><small>${article.status.toUpperCase()} · ${escapeHtml(article.date)}</small> <button class="plain-link edit-article" data-id="${article.id}">Edit</button></span></div>`).join('') : '<div class="empty-state">Your writing starts with one brave sentence.</div>'}</div>`;
    $('#viewNew').onclick = () => openEditor();
    $('#exportArticles').onclick = () => { downloadFile('alexore-articles.json', JSON.stringify(articles, null, 2), 'application/json'); toast('Article backup downloaded.'); };
    panel.querySelectorAll('.edit-article').forEach(button => button.onclick = () => openEditor(articles.find(article => String(article.id) === button.dataset.id)));
  } else if (view === 'audience') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">YOUR EMAIL COMMUNITY</div><h2>${subscribers.length} subscribers</h2></div><button class="plain-link" id="exportSubscribers">Download CSV ↓</button></div><p>Subscriber emails are stored in your site database. Connect an email service when you’re ready to send newsletters.</p>${subscribers.length ? `<div class="detail-list">${subscribers.map(row => `<div class="detail-row">${escapeHtml(row.email)}<small>${escapeHtml(row.date)}</small></div>`).join('')}</div>` : '<div class="empty-state">Your first subscriber will appear here.</div>'}`;
    $('#exportSubscribers').onclick = () => { const csv = 'email\r\n' + subscribers.map(row => `"${row.email.replaceAll('"','""')}"`).join('\r\n'); downloadFile('alexore-subscribers.csv', csv, 'text/csv'); toast('Subscriber list downloaded.'); };
  } else if (view === 'shop' || view === 'library') {
    const shop = view === 'shop';
    const types = shop ? ['book','product'] : ['video','podcast'];
    const items = contentItems.filter(item => types.includes(item.kind));
    const typeLabel = kind => ({book:'BOOK',product:'DIGITAL PRODUCT',video:'VIDEO',podcast:'PODCAST'}[kind] || kind.toUpperCase());
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${shop ? 'SHOP INVENTORY' : 'MEDIA LIBRARY'}</div><h2>${items.length} ${shop ? 'books & products' : 'videos & podcasts'}</h2></div><button class="button button-dark" id="newContentItem">＋ Add ${shop ? 'a book or product' : 'a video or podcast'}</button></div><p>${shop ? 'Add books and downloadable products, upload a digital file, and link to your checkout provider when you sell an item.' : 'Add a video or podcast episode by pasting its hosted video, audio, or streaming URL.'}</p><form id="contentItemForm" class="products-form hidden"><input type="hidden" name="id"><section class="products-editor-group"><div class="eyebrow">CONTENT DETAILS</div><div class="field-row"><label class="field-label">TYPE<select name="kind">${types.map(kind => `<option value="${kind}">${typeLabel(kind)}</option>`).join('')}</select></label><label class="field-label">TITLE<input name="title" required maxlength="240"></label></div><div class="field-row"><label class="field-label">CATEGORY<input name="category" maxlength="80" placeholder="Becoming, Work, Money…" required></label><label class="field-label">TAGS<input name="tags" maxlength="500" placeholder="Separate tags with commas"></label></div><label class="field-label">SHORT DESCRIPTION<textarea name="summary" rows="3" maxlength="500"></textarea></label><label class="field-label">DETAIL PAGE COPY<textarea name="body" rows="6" placeholder="Additional context, notes, or product details…"></textarea></label></section><section class="products-editor-group"><div class="eyebrow">IMAGE & DELIVERY</div><label class="field-label">COVER IMAGE URL<input name="coverImage" placeholder="uploads/… or https://…"></label><div class="field-row"><label class="field-label">UPLOAD COVER IMAGE<input type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/gif"></label>${shop ? '<label class="field-label">DIGITAL FILE URL<input name="assetUrl" type="text" placeholder="uploads/…"></label><label class="field-label">UPLOAD FILE (PDF, EPUB, ZIP, DOCX)<input type="file" name="assetFile" accept=".pdf,.epub,.zip,.docx"></label>' : '<span class="field-help">Set the media URL below.</span>'}</div>${shop ? '<div class="field-row"><label class="field-label">PRICE<input name="price" type="number" min="0" step="0.01" placeholder="Optional"></label><label class="field-label">CURRENCY<input name="currency" value="NGN" maxlength="3"></label></div><label class="field-label">PURCHASE / CHECKOUT URL<input name="purchaseUrl" type="url" placeholder="https://"></label>' : '<label class="field-label">VIDEO / AUDIO URL<input name="mediaUrl" type="url" placeholder="YouTube, Vimeo, Spotify, or audio URL"></label>'}<label class="field-label">STATUS<select name="status"><option>Draft</option><option>Published</option></select></label></section><div class="settings-actions"><button class="button button-dark" type="submit">Save item <span>↗</span></button><button class="button button-outline" type="button" id="cancelContentItem">Cancel</button></div></form><div id="contentItemList" class="detail-list">${items.length ? items.map(item => `<div class="detail-row"><span>${escapeHtml(item.title)} <small> · ${typeLabel(item.kind)} · ${escapeHtml(item.category)}</small></span><span><small>${item.status.toUpperCase()}</small> <button class="plain-link edit-content-item" data-id="${item.id}">Edit</button></span></div>`).join('') : '<div class="empty-state">Nothing here yet. Add your first item when it is ready.</div>'}</div>`;
    const form = $('#contentItemForm');
    const showForm = item => {
      form.reset(); form.classList.remove('hidden'); $('#contentItemList').classList.add('hidden');
      form.elements.id.value = item?.id || ''; form.elements.kind.value = item?.kind || types[0];
      ['title','category','tags','summary','body','coverImage','mediaUrl','assetUrl','purchaseUrl','price','currency','status'].forEach(key => { if (form.elements[key]) form.elements[key].value = item?.[key] ?? (key === 'currency' ? 'NGN' : key === 'status' ? 'Draft' : ''); });
      $('#newContentItem').classList.add('hidden');
      form.scrollIntoView({behavior:'smooth',block:'start'});
    };
    $('#newContentItem').onclick = () => showForm();
    $('#cancelContentItem').onclick = () => { form.classList.add('hidden'); $('#contentItemList').classList.remove('hidden'); $('#newContentItem').classList.remove('hidden'); };
    panel.querySelectorAll('.edit-content-item').forEach(button => button.onclick = () => showForm(items.find(item => String(item.id) === button.dataset.id)));
    form.onsubmit = async event => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(form));
      if (!shop && data.status === 'Published' && !String(data.mediaUrl || '').trim()) { toast('Add a hosted video or audio URL before publishing.'); form.elements.mediaUrl.focus(); return; }
      if (shop && data.status === 'Published' && Number(data.price) > 0 && !String(data.purchaseUrl || '').trim()) { toast('Add a checkout URL before publishing a priced item.'); form.elements.purchaseUrl.focus(); return; }
      try {
        const cover = form.elements.coverFile.files[0];
        if (cover) { const body = new FormData(); body.append('image',cover); const response = await fetch(`${API}?route=upload`,{method:'POST',headers:{'Accept':'application/json','X-CSRF-Token':csrfToken},credentials:'same-origin',body}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Cover image upload failed.'); data.coverImage=result.url; }
        const asset = form.elements.assetFile?.files[0];
        if (asset) { const body = new FormData(); body.append('asset',asset); const response = await fetch(`${API}?route=asset-upload`,{method:'POST',headers:{'Accept':'application/json','X-CSRF-Token':csrfToken},credentials:'same-origin',body}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Digital file upload failed.'); data.assetUrl=result.url; }
        delete data.coverFile; delete data.assetFile;
        await api('content',{method:'POST',data}); await loadData(); await setView(view); toast(data.status === 'Published' ? 'Content published.' : 'Draft saved.');
      } catch (error) { toast(error.message); }
    };
  } else if (view === 'products') {
    const defaults = {
      products_heading:'From the page\ninto practice.',
      products_intro:'Books and frameworks are where ideas get room to deepen. I’m shaping two ways to explore work, money, becoming, and the conversations that matter.',
      products_section_heading:'Made slowly.\nMade with care.',
      products_section_body:'The work is still taking shape. I’ll share more as the ideas become useful, clear, and ready to travel beyond these pages.',
      book_status:'BOOK · IN PROGRESS', book_card_title:'A book, taking shape',
      book_card_description:'A longer exploration of the questions behind these notes: how we work, what we value, and who we are becoming.',
      book_hero_title:'A longer note\non becoming.',
      book_lead:'I’m working on a book that gathers the questions I keep returning to: the work we choose, our relationship with money, the inner life, and how we keep becoming without losing what matters.',
      book_section_title:'A work in\nthe making.',
      book_section_body:'This page will grow as the manuscript finds its shape. For now, it’s a place to follow the questions and themes that are guiding the work.',
      framework_status:'FRAMEWORK · IN PROGRESS', framework_card_title:'A framework for practice',
      framework_card_description:'A practical structure is emerging from the ideas I teach, write about, and return to in my own life.',
      framework_hero_title:'Ideas you can\nput into practice.',
      framework_lead:'I’m shaping a practical framework from the patterns I notice across teaching, work, money, and the inner work of becoming. The aim is to turn good questions into thoughtful next steps.',
      framework_section_title:'Useful before\nit’s finished.',
      framework_section_body:'The framework doesn’t have a final name, format, or method yet. I’m developing it in public through essays and learning experiences. These are broad areas of interest, not a finished model.'
    };
    const field = (key, label) => `<label class="field-label">${label}<textarea name="${key}" rows="3">${escapeHtml(settings[key] || defaults[key])}</textarea></label>`;
    const inputField = (key, label) => `<label class="field-label">${label}<input name="${key}" value="${escapeHtml(settings[key] || defaults[key])}"></label>`;
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">SHOP PAGE CONTENT</div><h2>Edit the shop landing page</h2></div><a class="plain-link" href="products.html" target="_blank" rel="noopener">Preview shop ↗</a></div><p>Update the shop introduction and featured book/framework cards. Published inventory appears in the storefront below.</p><form id="productsForm" class="products-form"><section class="products-editor-group"><div class="eyebrow">THE COLLECTION</div><div class="field-row">${field('products_heading','PAGE HEADLINE',true)}${field('products_intro','INTRODUCTION',true)}</div><div class="field-row">${field('products_section_heading','SECTION HEADING',true)}${field('products_section_body','SECTION COPY',true)}</div></section><section class="products-editor-group"><div class="eyebrow">THE BOOK</div><div class="field-row">${inputField('book_status','STATUS TAG')}${inputField('book_card_title','CARD TITLE')}</div>${field('book_card_description','CARD DESCRIPTION',true)}${field('book_hero_title','PAGE HEADLINE',true)}${field('book_lead','INTRODUCTION',true)}<div class="field-row">${field('book_section_title','SECTION HEADING',true)}${field('book_section_body','SECTION COPY',true)}</div><a class="plain-link" href="book.html" target="_blank" rel="noopener">Preview book page ↗</a></section><section class="products-editor-group"><div class="eyebrow">THE FRAMEWORK</div><div class="field-row">${inputField('framework_status','STATUS TAG')}${inputField('framework_card_title','CARD TITLE')}</div>${field('framework_card_description','CARD DESCRIPTION',true)}${field('framework_hero_title','PAGE HEADLINE',true)}${field('framework_lead','INTRODUCTION',true)}<div class="field-row">${field('framework_section_title','SECTION HEADING',true)}${field('framework_section_body','SECTION COPY',true)}</div><a class="plain-link" href="framework.html" target="_blank" rel="noopener">Preview framework page ↗</a></section><div class="settings-actions"><button class="button button-dark" type="submit">Save shop page <span>↗</span></button></div></form>`;
    $('#productsForm').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try { await api('settings', {method:'POST', data:values}); settings = {...settings, ...values}; toast('Shop page saved.'); }
      catch (error) { toast(error.message); }
    };
  } else if (view === 'media' || view === 'speaking') {
    const media = view === 'media';
    const defaults = media ? {
      media_hero_title:'The notebook,\nout loud.',
      media_lead:'I’m preparing to bring article ideas into video and audio: practical training on technology and AI, alongside spoken reflections and conversations about work and becoming.',
      media_section_title:'A new way\nto share.',
      media_section_body:'The plan is to start publishing article-inspired podcast content on YouTube in 2027, alongside training videos with a special focus on AI. The format and schedule are still being worked out.',
      media_bottom_title:'Be there from the start.',
      media_bottom_body:'Get an occasional note when new videos, audio, and lessons are ready.'
    } : {
      speaking_hero_title:'Ideas for the\nwork of being.',
      speaking_lead:'I’m growing into public speaking and looking forward to conversations that help people think more deeply about technology, growth, self-discovery, and the kind of life we are building.',
      speaking_section_title:'Room for\nmeaning.',
      speaking_section_body:'Talks and conversations are still taking shape. These are the themes I’m drawn to bring into a room, with curiosity, practical insight, and a Christ-like grounding.',
      speaking_bottom_title:'Let’s keep talking.',
      speaking_bottom_body:'Speaking details and booking information will be added as this work grows. Join the list for updates.'
    };
    const key = suffix => `${view}_${suffix}`;
    const textarea = (suffix, label) => `<label class="field-label">${label}<textarea name="${key(suffix)}" rows="${suffix.includes('title') ? 2 : 4}">${escapeHtml(settings[key(suffix)] || defaults[key(suffix)])}</textarea></label>`;
    const page = media ? 'media.html' : 'speaking.html';
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">${media ? 'ON CAMERA & IN YOUR EARS' : 'ON STAGE'}</div><h2>Edit the ${media ? 'video & podcast' : 'speaking'} page</h2></div><a class="plain-link" href="${page}" target="_blank" rel="noopener">Preview page ↗</a></div><p>Update the public page while keeping its existing layout and visual style.</p><form id="publicContentForm" class="products-form"><section class="products-editor-group"><div class="eyebrow">INTRODUCTION</div>${textarea('hero_title','PAGE HEADLINE')}${textarea('lead','LEAD')}</section><section class="products-editor-group"><div class="eyebrow">${media ? 'WHAT’S COMING' : 'POSSIBLE CONVERSATIONS'}</div>${textarea('section_title','SECTION HEADING')}${textarea('section_body','SECTION COPY')}</section><section class="products-editor-group"><div class="eyebrow">NEXT STEP</div>${textarea('bottom_title','CLOSING HEADING')}${textarea('bottom_body','CLOSING COPY')}</section><div class="settings-actions"><button class="button button-dark" type="submit">Save ${media ? 'video & podcast' : 'speaking'} page <span>↗</span></button></div></form>`;
    $('#publicContentForm').onsubmit = async event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      try { await api('settings', {method:'POST', data:values}); settings = {...settings, ...values}; toast(`${media ? 'Video & podcast' : 'Speaking'} page saved.`); }
      catch (error) { toast(error.message); }
    };
  } else if (view === 'settings') {
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">MAKE IT YOURS</div><h2>Public profile & links</h2></div></div><p>Update homepage and About copy, plus your social links. Links appear in the public site footer when a valid URL is provided.</p><form id="settingsForm" class="settings-form"><label class="field-label">HOMEPAGE INTRODUCTION<textarea name="home_intro" rows="2" placeholder="Notes on work, money, becoming, and conversations that matter.">${escapeHtml(settings.home_intro || '')}</textarea></label><label class="field-label">ABOUT INTRODUCTION<textarea name="about_intro" rows="3">${escapeHtml(settings.about_intro || settings.intro || 'I’m Ore — a tech educator, writer, and lifelong student of what makes a meaningful life. I make complex ideas feel human, and share what I’m learning along the way.')}</textarea></label><label class="field-label">ABOUT CONTINUED<textarea name="about_detail" rows="3">${escapeHtml(settings.about_detail || 'These pages are where my interests meet: technology and growth, ambition and faith, the work we do and the people we’re becoming.')}</textarea></label><label class="field-label">WAYS TO CONNECT INTRODUCTION<textarea name="offers_intro" rows="2">${escapeHtml(settings.offers_intro || 'From the page to the stage to the classroom — here are a few ways we can connect.')}</textarea></label><div class="settings-grid">${[['x','X'],['medium','Medium'],['substack','Substack'],['linkedin','LinkedIn'],['youtube','YouTube']].map(([key,label]) => `<label class="field-label">${label.toUpperCase()} PROFILE URL<input name="${key}" type="url" placeholder="https://" value="${escapeHtml(settings[key] || '')}"></label>`).join('')}</div><div class="settings-actions"><button class="button button-dark" type="submit">Save site settings <span>↗</span></button><button class="button button-outline" type="button" id="exportAll">Download all data ↓</button></div></form>`;
    $('#settingsForm').onsubmit = async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api('settings', {method:'POST', data:values}); settings = {...settings, ...values}; toast('Site settings saved.'); } catch (error) { toast(error.message); } };
    $('#exportAll').onclick = () => { downloadFile('alexore-site-backup.json', JSON.stringify({articles,subscribers,settings}, null, 2), 'application/json'); toast('Full site backup downloaded.'); };
  } else {
    const content = {media:['VIDEO LESSONS','Plan practical AI and technology tutorials for your YouTube channel.','ARTICLE TO AUDIO','Adapt essays into thoughtful, listenable podcast episodes, planned for 2027.'],speaking:['TALK IDEAS','Collect talk titles, outlines, and the stories you want to bring to a room.','BOOKING INFORMATION','Add your topics, event details, and contact path when you are ready to book.']}[view];
    const publicPage = {media:'media.html',speaking:'speaking.html'}[view];
    panel.innerHTML = `<div class="eyebrow">${view === 'products' ? 'IN DEVELOPMENT' : 'IN PROGRESS'}</div><h2>${titles[view][0].replace('.','')}</h2><p>${titles[view][1]} This space is ready for you to plan, organize, and publish when each idea is ready.</p><div class="detail-list">${content.map((item,index) => `<div class="detail-row"><span>${item}</span><small>${index === 0 ? 'IN PROGRESS' : 'COMING SOON'}</small></div>`).join('')}</div><p><a class="plain-link" href="${publicPage}" target="_blank" rel="noopener">View public detail page ↗</a></p>`;
  }
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setView(button.dataset.go)));
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault(); $('#loginMessage').classList.remove('login-error');
  try { const result = await api('auth', {method:'POST',data:{username:$('#adminUsername').value.trim(),password:$('#adminPassword').value}}); csrfToken=result.csrf; setProfileName(result.displayName || 'Alex Ore'); $('#adminPassword').value=''; toggleStudio(true); await loadData(); }
  catch (error) { $('#loginMessage').textContent=error.message; $('#loginMessage').classList.add('login-error'); }
});
$('#togglePassword').addEventListener('click', () => {
  const input = $('#adminPassword');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  $('#togglePassword').textContent = visible ? 'Hide' : 'Show';
  $('#togglePassword').setAttribute('aria-pressed', String(visible));
});

startStudio();
