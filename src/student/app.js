import './styles.css';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );
const auth = $('#studentAuth'),
  gate = $('#matricGate'),
  workspace = $('#studentWorkspace'),
  loadError = $('#studentLoadError');
const mainPanel = $('#studentMainPanel');
let csrf = '',
  student = null,
  dashboard = null,
  view = 'assignments';

async function api(route, { method = 'GET', data } = {}) {
  const headers = { Accept: 'application/json' };
  if (data) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`api/index.php?route=${encodeURIComponent(route)}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function message(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('is-error', error);
}
function setTab(next) {
  view = next;
  document
    .querySelectorAll('[data-student-view]')
    .forEach((button) => button.classList.toggle('is-active', button.dataset.studentView === next));
  renderView();
}
const editorIcons = {
  bold: '<path d="M6 4h6a3 3 0 010 6H6zm0 6h7a3 3 0 010 6H6z"/>',
  italic: '<path d="M9 4h7M4 16h7M13 4 7 16"/>',
  underline: '<path d="M5 4v5a5 5 0 0010 0V4M4 19h12"/>',
  strike: '<path d="M4 10h16M7 6c1-3 9-3 10 0M7 14c0 4 9 4 10 0"/>',
  heading: '<path d="M4 5v14M14 5v14M4 12h10M20 8v11m-2-9 2-2 2 2"/>',
  paragraph: '<path d="M4 5h16M4 10h12M4 15h16M4 20h12"/>',
  bullet: '<circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/><path d="M8 6h12M8 12h12M8 18h12"/>',
  ordered: '<path d="M9 6h11M9 12h11M9 18h11M3 5h2v3M3 11h2l-2 2h2M3 17h2v2H3"/>',
  quote: '<path d="M4 6h6v5H5v6H3v-8zm10 0h6v5h-5v6h-2v-8z"/>',
  left: '<path d="M3 5h18M3 10h12M3 15h18M3 20h12"/>',
  center: '<path d="M3 5h18M6 10h12M3 15h18M6 20h12"/>',
  right: '<path d="M3 5h18M9 10h12M3 15h18M9 20h12"/>',
  link: '<path d="M8 12l4-4m-5-1-2 2a3 3 0 004 4l2-2m2-4 2-2a3 3 0 014 4l-2 2"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h9a7 7 0 010 14h-2"/>',
  redo: '<path d="m15 14 5-5-5-5m5 5h-9a7 7 0 000 14h2"/>',
  clear: '<path d="m4 7 13 13M17 7 4 20M4 4h16"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-5-10-2 12"/>',
  rule: '<path d="M3 12h18"/>',
};
function editorButton(icon, label, attrs) {
  return `<button type="button" title="${label}" aria-label="${label}" ${attrs}><svg viewBox="0 0 24 24" aria-hidden="true">${editorIcons[icon]}</svg></button>`;
}
function editorMarkup(id, label) {
  return `<div class="student-editor"><div class="student-editor-toolbar" role="toolbar" aria-label="${label} formatting">
    ${editorButton('undo','Undo','data-cmd="undo"')}${editorButton('redo','Redo','data-cmd="redo"')}<i aria-hidden="true"></i>
    ${editorButton('bold','Bold','data-cmd="bold"')}${editorButton('italic','Italic','data-cmd="italic"')}${editorButton('underline','Underline','data-cmd="underline"')}${editorButton('strike','Strikethrough','data-cmd="strikeThrough"')}
    <button type="button" title="Heading" aria-label="Heading" data-block="h2"><svg viewBox="0 0 24 24" aria-hidden="true">${editorIcons.heading}</svg></button><button type="button" title="Paragraph" aria-label="Paragraph" data-block="p"><svg viewBox="0 0 24 24" aria-hidden="true">${editorIcons.paragraph}</svg></button>
    ${editorButton('bullet','Bulleted list','data-cmd="insertUnorderedList"')}${editorButton('ordered','Numbered list','data-cmd="insertOrderedList"')}${editorButton('quote','Quote','data-cmd="formatBlock" data-value="blockquote"')}${editorButton('code','Code block','data-action="code"')}<i aria-hidden="true"></i>
    ${editorButton('left','Align left','data-cmd="justifyLeft"')}${editorButton('center','Align center','data-cmd="justifyCenter"')}${editorButton('right','Align right','data-cmd="justifyRight"')}${editorButton('link','Insert link','data-action="link"')}${editorButton('table','Insert table','data-action="table"')}${editorButton('rule','Divider','data-cmd="insertHorizontalRule"')}${editorButton('clear','Clear formatting','data-cmd="removeFormat"')}
  </div><div id="${id}" class="student-editor-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${label}" data-placeholder="Start writing here…"><p><br></p></div></div>`;
}
function dateLabel(value) {
  return value
    ? new Date(
        String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z')
      ).toLocaleDateString()
    : 'Not submitted';
}
function renderAssignments() {
  const assignments = dashboard.assignments || [];
  mainPanel.innerHTML = `<div class="student-section-heading"><div><div class="eyebrow">YOUR COURSEWORK</div><h2>Assignments</h2></div><span>${assignments.filter((a) => a.submissionId).length} submitted</span></div>${assignments.length ? `<div class="student-assignment-list">${assignments.map((a) => `<article class="student-panel student-assignment"><div class="student-assignment-top"><div><div class="eyebrow">${a.pairReview == 1 ? 'PAIR REVIEW ENABLED' : 'INDIVIDUAL ASSIGNMENT'} · ${esc(a.status.toUpperCase())}</div><h3>${esc(a.title)}</h3></div><span class="student-status ${a.submissionId ? 'is-submitted' : ''}">${a.submissionId ? 'SUBMITTED' : 'NOT SUBMITTED'}</span></div><div class="student-question">${a.question}</div><div class="student-submission-meta"><span>Submitted: ${esc(dateLabel(a.submittedAt))}</span>${a.dueAt ? `<span>Due: ${esc(dateLabel(a.dueAt))}</span>` : ''}${a.score !== null ? `<strong>Instructor score: ${esc(a.score)} / 100</strong>` : ''}${a.peerScore !== null && a.peerScore !== undefined ? `<strong>Peer score: ${Number(a.peerScore).toFixed(1)} / 100</strong>` : ''}</div>${a.instructorFeedback ? `<div class="student-feedback"><b>Instructor feedback</b><div>${a.instructorFeedback}</div></div>` : ''}${a.status === 'open' ? `<button class="button button-dark student-write" type="button" data-assignment="${a.id}">${a.submissionId ? 'Update submission' : 'Submit assignment'} <span>↗</span></button><form class="student-submission-form hidden" data-assignment="${a.id}"><label class="field-label">YOUR RESPONSE</label>${editorMarkup(`submissionEditor${a.id}`, 'Assignment response')}<p class="student-message" role="status"></p><button class="button button-dark" type="submit">Submit work <span>↗</span></button><button class="plain-link student-cancel-write" type="button">Cancel</button></form>${a.submissionId ? `<details class="student-own-work"><summary>View your submitted work</summary><div>${a.submissionBody}</div></details>` : ''}` : '<p class="student-notice">This assignment is closed for submissions.</p>'}</article>`).join('')}</div>` : '<div class="student-panel student-empty">No assignments are available yet. Check back soon.</div>'}`;
  const peerFeedback = dashboard.peerFeedback || [];
  if (peerFeedback.length)
    mainPanel.insertAdjacentHTML(
      'beforeend',
      `<section class="student-peer-feedback"><div class="eyebrow">COMMENTS ON YOUR WORK</div><h2>Peer feedback</h2><div class="student-assignment-list">${peerFeedback.map((item) => `<article class="student-panel"><div class="eyebrow">${esc(item.assignmentTitle)} · ${esc(item.reviewerName)} · ${esc(item.score)} / 100</div><div>${item.feedback}</div></article>`).join('')}</div></section>`
    );
}
function renderReviews() {
  const reviews = dashboard.reviews || [];
  mainPanel.innerHTML = `<div class="student-section-heading"><div><div class="eyebrow">LEARN FROM EACH OTHER</div><h2>Pair review</h2></div></div><p class="student-notice">Reviews are assigned only for assignments your instructor has marked for pair review.</p>${reviews.length ? `<div class="student-assignment-list">${reviews.map((r) => `<article class="student-panel"><div class="eyebrow">${esc(r.assignmentTitle)} · WORK BY ${esc(r.authorName).toUpperCase()}</div><div class="student-peer-work">${r.submissionBody}</div>${r.reviewedAt ? `<div class="student-feedback"><b>Your peer review · ${esc(r.score)} / 100</b><div>${r.feedback}</div></div>` : `<form class="peer-review-form" data-review="${r.reviewId}"><label class="field-label">PEER SCORE (0–100)<input name="score" type="number" min="0" max="100" required></label><label class="field-label">COMMENTS FOR YOUR PEER</label>${editorMarkup(`reviewEditor${r.reviewId}`, 'Peer review comments')}<button class="button button-dark" type="submit">Send review <span>↗</span></button></form>`}</article>`).join('')}</div>` : '<div class="student-panel student-empty">No pair reviews are assigned yet. Reviews appear here when another student submits work for a pair-review assignment.</div>'}`;
  bindEditorToolbar(mainPanel);
}
function renderForum() {
  const posts = dashboard.forum || [];
  mainPanel.innerHTML = `<div class="student-section-heading"><div><div class="eyebrow">LEARN TOGETHER</div><h2>Student forum</h2></div><button class="button button-dark" id="newForumTopic" type="button">＋ Start a topic</button></div><form id="forumTopicForm" class="student-panel student-form hidden"><label class="field-label">TOPIC TITLE<input name="title" maxlength="180" required></label><label class="field-label">MESSAGE</label>${editorMarkup('forumTopicEditor', 'Forum topic message')}<button class="button button-dark" type="submit">Post topic <span>↗</span></button><button class="plain-link" type="button" id="cancelForumTopic">Cancel</button></form>${posts.length ? `<div class="student-assignment-list">${posts.map((p) => `<article class="student-panel student-forum-post"><div class="eyebrow">${esc(p.authorName)} · ${esc(dateLabel(p.createdAt))}</div><h3>${esc(p.title)}</h3><div class="student-forum-body">${p.body}</div><div class="student-forum-comments">${(p.comments || []).map((c) => `<div class="student-forum-comment"><b>${esc(c.authorName)}</b><small>${esc(dateLabel(c.createdAt))}</small><div>${c.body}</div></div>`).join('')}</div><form class="forum-reply-form" data-post="${p.id}"><label class="field-label">REPLY</label>${editorMarkup(`replyEditor${p.id}`, 'Forum reply')}<button class="plain-link" type="submit">Post reply →</button></form></article>`).join('')}</div>` : '<div class="student-panel student-empty">No topics yet. Start a conversation with your classmates.</div>'}`;
  bindEditorToolbar(mainPanel);
}
function renderProfile() {
  mainPanel.innerHTML = `<div class="student-section-heading"><div><div class="eyebrow">ACCOUNT DETAILS</div><h2>My profile</h2></div></div><p>Keep your student details current so assignment targeting stays accurate.</p><form id="studentProfileEditForm" class="student-panel student-form"><label class="field-label">MATRIC NUMBER<input name="matricNumber" autocomplete="off" minlength="3" maxlength="40" value="${esc(student.matricNumber || '')}" required></label><label class="field-label">PHONE NUMBER<input name="phone" type="tel" autocomplete="tel" maxlength="30" value="${esc(student.phone || '')}" required></label><label class="field-label">DEPARTMENT<input name="department" autocomplete="organization-title" maxlength="120" value="${esc(student.department || '')}" required></label><label class="field-label">LEVEL<input name="level" list="studentProfileLevelOptions" maxlength="40" value="${esc(student.level || '')}" required><datalist id="studentProfileLevelOptions"><option value="100 Level"></option><option value="200 Level"></option><option value="300 Level"></option><option value="400 Level"></option><option value="500 Level"></option><option value="600 Level"></option><option value="700 Level"></option><option value="800 Level"></option></datalist></label><p class="student-message" role="status" aria-live="polite"></p><button class="button button-dark" type="submit">Save profile <span>↗</span></button></form>`;
}
function renderView() {
  if (!dashboard) return;
  if (view === 'assignments') renderAssignments();
  else if (view === 'reviews') renderReviews();
  else if (view === 'profile') renderProfile();
  else renderForum();
}
function bindEditorToolbar(root) {
  root.querySelectorAll('.student-editor-toolbar button').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const editor = button.closest('.student-editor').querySelector('[contenteditable]');
      editor.focus();
      if (button.dataset.block) document.execCommand('formatBlock', false, button.dataset.block);
      else if (button.dataset.action === 'code') {
        document.execCommand('formatBlock', false, 'pre');
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const pre = anchor?.nodeType === Node.ELEMENT_NODE
          ? anchor.closest('pre')
          : anchor?.parentElement?.closest('pre');
        if (pre && editor.contains(pre) && !pre.querySelector('code')) {
          const code = document.createElement('code');
          while (pre.firstChild) code.append(pre.firstChild);
          pre.append(code);
        }
      }
      else if (button.dataset.action === 'link') {
        const url = prompt('Paste a web link');
        if (url && /^https?:\/\//i.test(url)) document.execCommand('createLink', false, url);
      } else if (button.dataset.action === 'table') {
        const selection = window.getSelection();
        const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        const rowsInput = prompt('Number of rows (1–12)', '3');
        if (rowsInput === null) return;
        const colsInput = prompt('Number of columns (1–8)', '3');
        if (colsInput === null) return;
        const rows = Math.max(1, Math.min(12, Number(rowsInput) || 0));
        const cols = Math.max(1, Math.min(8, Number(colsInput) || 0));
        if (!rows || !cols) return;
        const table = `<table><thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`;
        editor.focus();
        if (savedRange) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
        }
        document.execCommand('insertHTML', false, table);
      } else document.execCommand(button.dataset.cmd, false, button.dataset.value || null);
    });
  });
}
async function loadDashboard() {
  dashboard = await api('student-dashboard');
  $('#studentGreeting').textContent = `Hello, ${student.fullName}`;
  $('#studentAccount').classList.remove('hidden');
  $('#studentMatricLabel').textContent = `Matric: ${student.matricNumber} · ${student.department} · ${student.level}`;
  $('#studentAttendancePoints').textContent = String(dashboard.attendancePoints || 0);
  $('#studentAttendanceHistory').innerHTML = dashboard.attendanceHistory?.length
    ? `<div class="eyebrow">RECENT POINTS</div>${dashboard.attendanceHistory.slice(0, 5).map((item) => `<div><span>+1</span><b>${esc(item.assignmentTitle)}</b><small>${esc(dateLabel(item.awardedAt))}</small></div>`).join('')}`
    : '<p class="student-notice">Your first point will appear here after you submit an assignment.</p>';
  $('#studentArticles').innerHTML = dashboard.articles.length
    ? dashboard.articles
        .map(
          (a) =>
            `<a class="student-article-link" href="${esc(dashboard.siteUrl)}/article.html?slug=${encodeURIComponent(a.slug)}"><b>${esc(a.title)}</b><small>${esc(a.category)} · ${esc(a.date)}</small></a>`
        )
        .join('')
    : '<p class="student-notice">New articles will appear here.</p>';
  auth.classList.add('hidden');
  loadError.classList.add('hidden');
  gate.classList.add('hidden');
  workspace.classList.remove('hidden');
  renderView();
}
function showDashboardError(error) {
  auth.classList.add('hidden');
  gate.classList.add('hidden');
  workspace.classList.add('hidden');
  loadError.classList.remove('hidden');
  $('#studentLoadErrorMessage').textContent = error.message;
  if (student) {
    $('#studentGreeting').textContent = `Hello, ${student.fullName}`;
    $('#studentAccount').classList.remove('hidden');
  }
}
async function refreshSession() {
  const state = await api('student-auth');
  csrf = state.csrf || '';
  student = state.student;
  if (!state.authenticated) {
    auth.classList.remove('hidden');
    workspace.classList.add('hidden');
    gate.classList.add('hidden');
    $('#studentAccount').classList.add('hidden');
    return;
  }
  auth.classList.add('hidden');
  if (state.needsProfile || state.needsMatric) {
    gate.classList.remove('hidden');
    workspace.classList.add('hidden');
    $('#studentAccount').classList.remove('hidden');
    $('#studentGreeting').textContent = `Hello, ${student.fullName}`;
    const profileForm = $('#matricForm');
    for (const key of ['matricNumber', 'phone', 'department', 'level']) {
      if (profileForm.elements[key]) profileForm.elements[key].value = student[key] || '';
    }
    return;
  }
  try {
    await loadDashboard();
  } catch (error) {
    showDashboardError(error);
  }
}

$('#studentAuthToggle').addEventListener('click', () => {
  const registering = $('#studentRegisterForm').classList.contains('hidden');
  $('#studentLoginForm').classList.toggle('hidden', registering);
  $('#studentRegisterForm').classList.toggle('hidden', !registering);
  $('#studentAuthToggle').textContent = registering
    ? 'Already registered? Sign in →'
    : 'New here? Create an account →';
  $('#studentAuthTitle').textContent = registering
    ? 'Join your learning studio.'
    : 'Your learning studio.';
  $('#studentAuthCopy').textContent = registering
    ? 'Create your account with your full name and a supported email address.'
    : 'Sign in or create a student account to access assignments and your learning community.';
  message($('#studentAuthMessage'), '');
});
$('#studentLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api('student-auth', {
      method: 'POST',
      data: { action: 'login', ...data },
    });
    csrf = result.csrf;
    student = result.student;
    await refreshSession();
  } catch (error) {
    message($('#studentAuthMessage'), error.message, true);
  }
});
$('#studentRegisterForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api('student-auth', {
      method: 'POST',
      data: { action: 'register', ...data },
    });
    csrf = result.csrf;
    message($('#matricMessage'), result.message);
    await refreshSession();
  } catch (error) {
    message($('#studentAuthMessage'), error.message, true);
  }
});
$('#matricForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('student-profile', {
      method: 'POST',
      data: Object.fromEntries(new FormData(event.currentTarget)),
    });
    student.matricNumber = result.matricNumber;
    student.phone = result.phone;
    student.department = result.department;
    student.level = result.level;
    await loadDashboard();
  } catch (error) {
    message($('#matricMessage'), error.message, true);
  }
});
$('#studentLogout').addEventListener('click', async () => {
  try {
    await api('student-auth', { method: 'POST', data: { action: 'logout' } });
  } finally {
    student = null;
    dashboard = null;
    await refreshSession();
  }
});
document
  .querySelectorAll('[data-student-view]')
  .forEach((button) => button.addEventListener('click', () => setTab(button.dataset.studentView)));
$('#studentDashboardRetry').addEventListener('click', async () => {
  const button = $('#studentDashboardRetry');
  button.disabled = true;
  try {
    await loadDashboard();
  } catch (error) {
    showDashboardError(error);
  } finally {
    button.disabled = false;
  }
});
mainPanel.addEventListener('click', (event) => {
  const write = event.target.closest('.student-write');
  if (write) {
    const form = write.closest('.student-assignment').querySelector('.student-submission-form');
    form.classList.remove('hidden');
    form.querySelector('[contenteditable]').innerHTML =
      dashboard.assignments.find((a) => String(a.id) === write.dataset.assignment)
        ?.submissionBody || '<p><br></p>';
    bindEditorToolbar(form);
    write.classList.add('hidden');
  }
  if (event.target.closest('.student-cancel-write')) {
    const form = event.target.closest('form');
    form.classList.add('hidden');
    form.closest('.student-assignment').querySelector('.student-write').classList.remove('hidden');
  }
  if (event.target.closest('#newForumTopic')) $('#forumTopicForm').classList.remove('hidden');
  if (event.target.closest('#cancelForumTopic')) $('#forumTopicForm').classList.add('hidden');
});
mainPanel.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.matches('#studentProfileEditForm')) {
    event.preventDefault();
    try {
      const updated = await api('student-profile', {
        method: 'POST',
        data: Object.fromEntries(new FormData(form)),
      });
      Object.assign(student, updated);
      await loadDashboard();
      setTab('profile');
      const status = mainPanel.querySelector('.student-message');
      if (status) message(status, 'Your profile has been updated.');
    } catch (error) {
      message(form.querySelector('.student-message'), error.message, true);
    }
    return;
  }
  if (form.matches('.student-submission-form')) {
    event.preventDefault();
    const editor = form.querySelector('[contenteditable]');
    try {
      await api('student-submit', {
        method: 'POST',
        data: { assignmentId: form.dataset.assignment, body: editor.innerHTML },
      });
      await loadDashboard();
      setTab('assignments');
    } catch (error) {
      message(form.querySelector('.student-message'), error.message, true);
    }
  }
  if (form.matches('.peer-review-form')) {
    event.preventDefault();
    try {
      await api('student-review', {
        method: 'POST',
        data: {
          reviewId: form.dataset.review,
          score: form.elements.score.value,
          feedback: form.querySelector('[contenteditable]').innerHTML,
        },
      });
      await loadDashboard();
      setTab('reviews');
    } catch (error) {
      alert(error.message);
    }
  }
  if (form.matches('#forumTopicForm')) {
    event.preventDefault();
    try {
      await api('student-forum-post', {
        method: 'POST',
        data: {
          title: form.elements.title.value,
          body: form.querySelector('[contenteditable]').innerHTML,
        },
      });
      await loadDashboard();
      setTab('forum');
    } catch (error) {
      alert(error.message);
    }
  }
  if (form.matches('.forum-reply-form')) {
    event.preventDefault();
    try {
      await api('student-forum-comment', {
        method: 'POST',
        data: {
          postId: form.dataset.post,
          body: form.querySelector('[contenteditable]').innerHTML,
        },
      });
      await loadDashboard();
      setTab('forum');
    } catch (error) {
      alert(error.message);
    }
  }
});
refreshSession().catch((error) => message($('#studentAuthMessage'), error.message, true));
