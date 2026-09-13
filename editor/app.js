const $ = (selector) => document.querySelector(selector);
const fields = ['title', 'slug', 'date', 'author', 'category', 'description', 'markdown'];
let posts = [], drafts = [], source = 'new', originalSlug = '', draftId = '', dirty = false, previewTimer;

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
  $('#saveButton').disabled = busy;
  $('#draftButton').disabled = busy;
  $('#deleteButton').disabled = busy || source === 'new';
  $('#newButton').disabled = busy;
  $('#deleteButton').textContent = source === 'draft' ? 'Discard draft' : 'Delete';
  $('#saveState').textContent = label || (dirty ? 'Unsaved changes' : source === 'draft' ? 'Private draft' : source === 'published' ? 'Published' : 'New post');
}
function values() { return Object.fromEntries(fields.map((id) => [id, $(`#${id}`).value])); }
function setValues(post, nextSource = 'published') {
  for (const id of fields) $(`#${id}`).value = post[id] || '';
  source = nextSource;
  draftId = source === 'draft' ? post.id : '';
  originalSlug = source === 'published' || posts.some((item) => item.slug === post.slug) ? post.slug || '' : '';
  $('#slug').disabled = Boolean(originalSlug);
  dirty = false;
  setBusy(false);
  renderPreview();
  renderList();
}
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = value || ''; return span.innerHTML; }
function postButton(post, itemSource) {
  const itemId = itemSource === 'draft' ? post.id : post.slug;
  const active = itemSource === source && itemId === (itemSource === 'draft' ? draftId : originalSlug);
  const subtitle = itemSource === 'draft' ? 'PRIVATE DRAFT' : post.date;
  return `<button class="post ${itemSource === 'draft' ? 'draft' : ''} ${active ? 'active' : ''}" data-source="${itemSource}" data-slug="${itemId}"><strong>${escapeHtml(post.title || 'Untitled draft')}</strong><span>${subtitle}</span></button>`;
}
function renderList() {
  const draftItems = drafts.map((post) => postButton(post, 'draft')).join('') || '<p class="empty-list">No private drafts</p>';
  const publishedItems = posts.map((post) => postButton(post, 'published')).join('') || '<p class="empty-list">No published posts</p>';
  $('#postList').innerHTML = `<p class="list-title">Private drafts</p>${draftItems}<p class="list-title">Published</p>${publishedItems}`;
}
async function refresh() {
  [{ posts }, { drafts }] = await Promise.all([api('/posts'), api('/drafts')]);
  renderList();
}
async function openItem(itemSource, slug, force = false) {
  if (dirty && !force && !confirm('Discard your unsaved changes?')) return;
  setBusy(true, 'Loading…');
  try {
    const endpoint = itemSource === 'draft' ? 'drafts' : 'posts';
    setValues(await api(`/${endpoint}/${encodeURIComponent(slug)}`), itemSource);
  } catch (error) { toast(error.message, true); setBusy(false); }
}
function newPost() {
  if (dirty && !confirm('Discard your unsaved changes?')) return;
  setValues({ date: new Date().toISOString().slice(0, 10), author: 'Bryson', category: 'personal', markdown: '## Start writing\n\n' }, 'new');
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
async function savePrivateDraft() {
  setBusy(true, 'Saving private draft…');
  try {
    const result = await api('/drafts', { method: 'POST', body: JSON.stringify({ post: values(), draftId }) });
    draftId = result.draft.id;
    source = 'draft';
    originalSlug = posts.some((post) => post.slug === result.draft.slug) ? result.draft.slug : '';
    $('#slug').disabled = Boolean(originalSlug);
    dirty = false;
    await refresh();
    setBusy(false);
    toast(result.message);
  } catch (error) { toast(error.message, true); setBusy(false); }
}
async function publish() {
  setBusy(true, 'Pulling, committing & pushing…');
  try {
    const post = values();
    const result = await api('/posts', { method: 'POST', body: JSON.stringify({ post, originalSlug, draftId }) });
    source = 'published'; originalSlug = post.slug; draftId = ''; dirty = false;
    await refresh();
    await openItem('published', post.slug, true);
    toast(result.message);
  } catch (error) { toast(error.message, true); setBusy(false); }
}
async function remove() {
  if (source === 'new') return;
  const deletingDraft = source === 'draft';
  const slug = deletingDraft ? draftId : originalSlug;
  setBusy(true, deletingDraft ? 'Discarding private draft…' : 'Deleting, committing & pushing…');
  try {
    const result = await api(`/${deletingDraft ? 'drafts' : 'posts'}/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    source = 'new'; originalSlug = ''; draftId = ''; dirty = false;
    await refresh();
    newPost();
    toast(result.message);
  } catch (error) { toast(error.message, true); setBusy(false); }
}
function confirmRemoval() {
  const deletingDraft = source === 'draft';
  $('#confirmTitle').textContent = deletingDraft ? 'Discard this private draft?' : 'Delete this published post?';
  $('#confirmCopy').textContent = deletingDraft ? 'This removes the local draft. It has never been published.' : 'This publishes a Git commit removing the post. Git history can recover it.';
  $('#confirmDelete').textContent = deletingDraft ? 'Discard draft' : 'Delete & publish';
  $('#confirmDialog').showModal();
}

$('#postList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-slug]');
  if (button) openItem(button.dataset.source, button.dataset.slug);
});
$('#newButton').addEventListener('click', newPost);
$('#draftButton').addEventListener('click', savePrivateDraft);
$('#saveButton').addEventListener('click', publish);
$('#deleteButton').addEventListener('click', confirmRemoval);
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-scroll-top]');
  if (!button) return;
  const target = $(`#${button.dataset.scrollTop}`);
  target.scrollTo({ top: 0, behavior: 'smooth' });
  if (target.matches('textarea')) target.focus({ preventScroll: true });
});
$('#confirmDialog').addEventListener('close', () => { if ($('#confirmDialog').returnValue === 'confirm') remove(); });
for (const id of fields) $(`#${id}`).addEventListener('input', () => { dirty = true; setBusy(false); renderPreview(); });
$('#title').addEventListener('input', () => { if (!originalSlug && !$('#slug').value) $('#slug').value = $('#title').value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); savePrivateDraft(); }
});
window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });
refresh().then(() => drafts.length ? openItem('draft', drafts[0].id, true) : posts.length ? openItem('published', posts[0].slug, true) : newPost()).catch((error) => toast(error.message, true));
