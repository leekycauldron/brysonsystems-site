const $ = (selector) => document.querySelector(selector);
const fields = ['title', 'slug', 'date', 'author', 'category', 'description', 'markdown'];
let posts = [], originalSlug = '', dirty = false, previewTimer;

function apiPath(path = '') {
  return `${location.pathname.startsWith('/blog-editor') ? '/blog-editor' : ''}/api${path}`;
}
async function api(path, options = {}) {
  const response = await fetch(apiPath(path), { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.className = `show${error ? ' error' : ''}`;
  clearTimeout(node.timer); node.timer = setTimeout(() => node.className = '', error ? 7000 : 4000);
}
function setBusy(busy, label = '') {
  $('#saveButton').disabled = busy; $('#deleteButton').disabled = busy || !originalSlug; $('#newButton').disabled = busy;
  $('#saveState').textContent = label || (dirty ? 'Unsaved changes' : 'Saved');
}
function values() { return Object.fromEntries(fields.map((id) => [id, $(`#${id}`).value])); }
function setValues(post) {
  for (const id of fields) $(`#${id}`).value = post[id] || '';
  originalSlug = post.slug || ''; $('#slug').disabled = Boolean(originalSlug); dirty = false; setBusy(false); renderPreview(); renderList();
}
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value || ''; return span.innerHTML; }
function renderList() {
  $('#postList').innerHTML = posts.map((post) => `<button class="post ${post.slug === originalSlug ? 'active' : ''}" data-slug="${post.slug}"><strong>${escapeHtml(post.title)}</strong><span>${post.date}</span></button>`).join('');
}
async function refresh(preferredSlug = originalSlug) {
  ({ posts } = await api('/posts')); renderList();
  if (preferredSlug && posts.some((post) => post.slug === preferredSlug)) await openPost(preferredSlug, true);
}
async function openPost(slug, force = false) {
  if (dirty && !force && !confirm('Discard your unsaved changes?')) return;
  setBusy(true, 'Loading…');
  try { setValues(await api(`/posts/${encodeURIComponent(slug)}`)); } catch (error) { toast(error.message, true); setBusy(false); }
}
function newPost() {
  if (dirty && !confirm('Discard your unsaved changes?')) return;
  setValues({ date: new Date().toISOString().slice(0, 10), author: 'Bryson', category: 'personal', markdown: '## Start writing\n\n' });
  dirty = false; setBusy(false, 'New draft');
}
function renderPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    try {
      const preview = $('#preview');
      const maxScroll = preview.scrollHeight - preview.clientHeight;
      const scrollRatio = maxScroll > 0 ? preview.scrollTop / maxScroll : 0;
      const { html } = await api('/preview', { method: 'POST', body: JSON.stringify({ markdown: $('#markdown').value }) });
      preview.innerHTML = `<h1>${escapeHtml($('#title').value || 'Untitled')}</h1>${html}`;
      requestAnimationFrame(() => { preview.scrollTop = scrollRatio * Math.max(0, preview.scrollHeight - preview.clientHeight); });
    } catch (error) { $('#preview').textContent = error.message; }
  }, 120);
}
async function save() {
  setBusy(true, 'Pulling, committing & pushing…');
  try {
    const post = values(); const result = await api('/posts', { method: 'POST', body: JSON.stringify({ post, originalSlug }) });
    originalSlug = post.slug; dirty = false; await refresh(post.slug); toast(result.message);
  } catch (error) { toast(error.message, true); setBusy(false); }
}
async function remove() {
  if (!originalSlug) return;
  setBusy(true, 'Deleting, committing & pushing…');
  try {
    const result = await api(`/posts/${encodeURIComponent(originalSlug)}`, { method: 'DELETE' });
    originalSlug = ''; dirty = false; await refresh(''); newPost(); toast(result.message);
  } catch (error) { toast(error.message, true); setBusy(false); }
}

$('#postList').addEventListener('click', (event) => { const button = event.target.closest('[data-slug]'); if (button) openPost(button.dataset.slug); });
$('#newButton').addEventListener('click', newPost); $('#saveButton').addEventListener('click', save);
$('#deleteButton').addEventListener('click', () => $('#confirmDialog').showModal());
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-scroll-top]');
  if (!button) return;
  const target = $(`#${button.dataset.scrollTop}`);
  target.scrollTo({ top: 0, behavior: 'smooth' });
  if (target.matches('textarea')) target.focus({ preventScroll: true });
});
$('#confirmDialog').addEventListener('close', () => { if ($('#confirmDialog').returnValue === 'confirm') remove(); });
for (const id of fields) $(`#${id}`).addEventListener('input', () => { dirty = true; setBusy(false); renderPreview(); });
$('#title').addEventListener('input', () => { if (!originalSlug) $('#slug').value = $('#title').value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); } });
window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });
refresh().then(() => posts.length ? openPost(posts[0].slug, true) : newPost()).catch((error) => toast(error.message, true));
