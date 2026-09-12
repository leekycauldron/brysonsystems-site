import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const exec = promisify(execFile);
const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = process.env.BLOG_REPO_DIR ? path.resolve(process.env.BLOG_REPO_DIR) : path.resolve(EDITOR_DIR, '..');
const BLOG_DIR = path.join(REPO_DIR, 'blog');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORIES = new Set(['technical', 'essay', 'personal', 'note']);
const CATEGORY_LABELS = { technical: 'Technical', essay: 'Essay', personal: 'Personal', note: 'Note' };

marked.setOptions({ gfm: true, breaks: false });
const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading']
  },
  allowedSchemes: ['http', 'https', 'mailto']
};

export function renderMarkdown(markdown) {
  return sanitizeHtml(marked.parse(String(markdown || '')), sanitizeOptions);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function validatePost(post) {
  const category = String(post.category || 'technical').trim().toLowerCase();
  const tags = (Array.isArray(post.tags) ? post.tags : String(post.tags || '').split(','))
    .map((tag) => String(tag).trim()).filter(Boolean);
  const clean = {
    slug: String(post.slug || '').trim().toLowerCase(), title: String(post.title || '').trim(),
    description: String(post.description || '').trim(), author: String(post.author || 'Bryson').trim(),
    date: String(post.date || '').trim(), category, tags: [...new Set(tags)].slice(0, 8),
    markdown: String(post.markdown || '')
  };
  if (!SLUG_RE.test(clean.slug)) throw new Error('Slug must contain lowercase letters, numbers, and single hyphens only.');
  if (!clean.title) throw new Error('Title is required.');
  if (!clean.description) throw new Error('Description is required.');
  if (!CATEGORIES.has(clean.category)) throw new Error('Type must be Technical, Essay, Personal, or Note.');
  if (clean.tags.some((tag) => tag.length > 32)) throw new Error('Tags must be 32 characters or fewer.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || Number.isNaN(Date.parse(`${clean.date}T00:00:00Z`))) throw new Error('Date must be a valid YYYY-MM-DD date.');
  if (!clean.markdown.trim()) throw new Error('Markdown body is required.');
  return clean;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Could not find ${label} in post template.`);
  return source.replace(pattern, replacement);
}

async function readMeta(slug, html = '') {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(BLOG_DIR, slug, 'meta.json'), 'utf8'));
    const category = CATEGORIES.has(meta.category) ? meta.category : 'technical';
    const tags = Array.isArray(meta.tags) ? meta.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
    return { ...meta, slug, category, tags };
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const title = html.match(/<article[\s\S]*?<h1>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || slug;
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || title;
  const meta = html.match(/<p class="post-meta">([^<]+)<\/p>/i)?.[1]?.split('·').map((part) => part.trim()) || [];
  return { slug, title, description, author: meta[0] || 'Bryson', date: '2026-09-01', category: 'technical', tags: [] };
}

function taxonomyMarkup(post) {
  const tags = post.tags.map((tag) => `<span class="topic-tag">${escapeHtml(tag)}</span>`).join('');
  return `<div class="post-taxonomy"><span class="type-badge type-${escapeHtml(post.category)}">${CATEGORY_LABELS[post.category]}</span>${tags}</div>`;
}

export async function listPosts() {
  const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
  const posts = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const dir = path.join(BLOG_DIR, entry.name);
    try { await fs.access(path.join(dir, 'post.md')); } catch { continue; }
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => '');
    posts.push(await readMeta(entry.name, html));
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export async function getPost(slug) {
  if (!SLUG_RE.test(slug)) throw new Error('Invalid slug.');
  const dir = path.join(BLOG_DIR, slug);
  const [markdown, html] = await Promise.all([
    fs.readFile(path.join(dir, 'post.md'), 'utf8'), fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => '')
  ]);
  return { ...(await readMeta(slug, html)), slug, markdown };
}

function postTemplate(post, body) {
  const title = escapeHtml(post.title), description = escapeHtml(post.description);
  const author = escapeHtml(post.author), month = escapeHtml(formatMonth(post.date));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Bryson Systems</title><meta name="description" content="${description}"><style>
:root{--ink:#17211b;--muted:#5f6b63;--line:#d9e1db;--paper:#f7f4ee;--white:#fffdfa;--green:#245c42;--shadow:0 24px 70px rgba(23,33,27,.13)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--paper);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}a{color:inherit;text-decoration:none}.site-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(18px,4vw,54px);border-bottom:1px solid rgba(23,33,27,.08);background:rgba(247,244,238,.88);backdrop-filter:blur(18px)}.brand{display:flex;align-items:center;gap:10px;font-weight:750}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:7px;color:var(--white);background:var(--green);font-size:.78rem}.nav{display:flex;align-items:center;gap:clamp(14px,3vw,28px);color:var(--muted);font-size:.94rem}.nav a:hover,.nav a.active{color:var(--ink)}.eyebrow{margin:0 0 14px;color:var(--green);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}article{max-width:760px;margin:0 auto;padding:clamp(48px,8vw,90px) clamp(18px,5vw,32px) clamp(40px,6vw,70px)}article h1{margin:0 0 14px;font-size:clamp(2.4rem,6vw,3.9rem);line-height:.98}.post-meta{margin:0 0 12px;color:var(--muted);font-size:.95rem}.post-taxonomy{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 38px}.type-badge,.topic-tag{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.04em}.type-badge{color:var(--white);background:var(--green);text-transform:uppercase}.topic-tag{color:var(--muted);border:1px solid var(--line);background:var(--white)}article h2{margin:46px 0 12px;font-size:1.65rem;line-height:1.1}article h3{margin:32px 0 10px}article p{margin:0 0 16px;font-size:1.08rem;line-height:1.62}article li{font-size:1.08rem;line-height:1.62;margin-bottom:6px}article blockquote{margin:26px 0;padding:18px 22px;border-left:6px solid var(--green);border-radius:7px;background:var(--white);box-shadow:var(--shadow)}article a{text-decoration:underline}article img{max-width:100%;height:auto;border-radius:7px}pre{overflow-x:auto;padding:16px 18px;border:1px solid var(--line);border-radius:7px;background:var(--white)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}footer{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:26px clamp(18px,4vw,54px);border-top:1px solid rgba(23,33,27,.1);color:var(--muted);font-size:.92rem}
</style></head><body><header class="site-header"><a class="brand" href="/" aria-label="Bryson Systems home"><span class="brand-mark">BS</span><span>Bryson Systems</span></a><nav class="nav" aria-label="Primary navigation"><a href="/#work">Work</a><a href="/#videos">Videos</a><a href="/#process">Process</a><a href="/blog/" class="active">Blog</a><a href="/#contact">Contact</a></nav></header><main><article><p class="eyebrow">Blog</p><h1>${title}</h1><p class="post-meta">${author} · ${month}</p>${taxonomyMarkup(post)}
<!-- content:start -->
${body}
<!-- content:end -->
</article></main><footer><span>Bryson Systems</span><span>AI workflow systems for content, marketing, and operations.</span></footer></body></html>
`;
}

async function renderPostHtml(post) {
  const body = renderMarkdown(post.markdown);
  const htmlPath = path.join(BLOG_DIR, post.slug, 'index.html');
  let existing = await fs.readFile(htmlPath, 'utf8').catch(() => '');
  if (!existing || !existing.includes('<!-- content:start -->') || !existing.includes('<!-- content:end -->')) return postTemplate(post, body);
  existing = replaceOnce(existing, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(post.title)} | Bryson Systems</title>`, 'page title');
  existing = replaceOnce(existing, /<meta\s+name="description"\s+content="[^"]*">/i, `<meta name="description" content="${escapeHtml(post.description)}">`, 'meta description');
  existing = replaceOnce(existing, /(<article[\s\S]*?<h1>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(post.title)}$2`, 'post title');
  existing = replaceOnce(existing, /<p class="post-meta">[\s\S]*?<\/p>/i, `<p class="post-meta">${escapeHtml(post.author)} · ${escapeHtml(formatMonth(post.date))}</p>`, 'post metadata');
  if (/<div class="post-taxonomy">[\s\S]*?<\/div>/i.test(existing)) {
    existing = existing.replace(/<div class="post-taxonomy">[\s\S]*?<\/div>/i, taxonomyMarkup(post));
  } else {
    existing = existing.replace(/(<p class="post-meta">[\s\S]*?<\/p>)/i, `$1\n        ${taxonomyMarkup(post)}`);
  }
  if (!existing.includes('.post-taxonomy{')) {
    const taxonomyCss = `.post-taxonomy{display:flex;flex-wrap:wrap;gap:7px;margin:-24px 0 38px}.type-badge,.topic-tag{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.04em}.type-badge{color:var(--white);background:var(--green);text-transform:uppercase}.topic-tag{color:var(--muted);border:1px solid var(--line);background:var(--white)}\n`;
    existing = existing.replace('</style>', `${taxonomyCss}</style>`);
  }
  return replaceOnce(existing, /<!-- content:start -->[\s\S]*?<!-- content:end -->/, `<!-- content:start -->\n${body}\n        <!-- content:end -->`, 'Markdown content markers');
}

function blogIndex(posts) {
  const categories = ['technical', 'essay', 'personal', 'note'];
  const tags = [...new Set(posts.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b));
  const typeButtons = categories.map((category) => `<button type="button" data-category="${category}">${CATEGORY_LABELS[category]}</button>`).join('');
  const tagButtons = tags.map((tag) => `<button type="button" data-tag="${escapeHtml(tag.toLowerCase())}">${escapeHtml(tag)}</button>`).join('');
  const items = posts.map((post) => {
    const postTags = post.tags.map((tag) => `<button type="button" class="tag" data-card-tag="${escapeHtml(tag.toLowerCase())}">${escapeHtml(tag)}</button>`).join('');
    return `<article class="post-item" data-post data-category="${post.category}" data-tags="${escapeHtml(post.tags.map((tag) => tag.toLowerCase()).join('|'))}">
        <div class="post-topline"><span class="type type-${post.category}">${CATEGORY_LABELS[post.category]}</span><span>${escapeHtml(formatMonth(post.date))}</span></div>
        <a href="/blog/${escapeHtml(post.slug)}/"><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p></a>
        ${postTags ? `<div class="tags">${postTags}</div>` : ''}
      </article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Writing | Bryson Systems</title><meta name="description" content="Technical articles, essays, and personal writing from Bryson Lee-Kwen."><style>
:root{--ink:#17211b;--muted:#5f6b63;--line:#d9e1db;--paper:#f7f4ee;--white:#fffdfa;--green:#245c42;--mint:#d8efe2;--blue:#dbe8f6;--rose:#f4dfdc;--gold:#f2e5c8}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}a{color:inherit;text-decoration:none}.site-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(18px,4vw,54px);border-bottom:1px solid rgba(23,33,27,.08);background:rgba(247,244,238,.9);backdrop-filter:blur(18px)}.brand{display:flex;align-items:center;gap:10px;font-weight:750}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:7px;color:var(--white);background:var(--green);font-size:.78rem}.nav{display:flex;align-items:center;gap:clamp(14px,3vw,28px);color:var(--muted);font-size:.94rem}.nav a:hover,.nav a.active{color:var(--ink)}main{max-width:900px;margin:0 auto;padding:clamp(52px,8vw,92px) clamp(18px,5vw,32px)}.eyebrow{margin:0 0 14px;color:var(--green);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{max-width:720px;margin:0;font-size:clamp(2.6rem,7vw,4.5rem);line-height:.95;letter-spacing:-.04em}.intro{max-width:660px;margin:22px 0 36px;color:var(--muted);font-size:1.08rem}.filters{display:grid;gap:13px;padding:18px 0 22px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.filter-label{width:52px;color:var(--muted);font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.filters button,.tag{padding:6px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:transparent;cursor:pointer;font:700 .78rem/1.2 inherit}.filters button:hover,.filters button.active,.tag:hover{border-color:var(--green);color:var(--white);background:var(--green)}.posts{margin-top:12px}.post-item{padding:30px 0;border-bottom:1px solid var(--line)}.post-item[hidden]{display:none}.post-topline{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.type{padding:4px 8px;border-radius:999px;color:var(--ink);font-size:.68rem;font-weight:850;letter-spacing:.07em}.type-technical{background:var(--mint)}.type-essay{background:var(--blue)}.type-personal{background:var(--rose)}.type-note{background:var(--gold)}.post-item h2{margin:10px 0 8px;font-size:clamp(1.45rem,3vw,1.8rem);line-height:1.08}.post-item a:hover h2{color:var(--green)}.post-item p{max-width:720px;margin:0;color:var(--muted)}.tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.tag{padding:4px 9px;font-size:.7rem}.empty{padding:34px 0;color:var(--muted)}footer{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:26px clamp(18px,4vw,54px);border-top:1px solid rgba(23,33,27,.1);color:var(--muted);font-size:.92rem}@media(max-width:680px){.site-header{padding:14px 18px;gap:14px}.brand>span:last-child{display:none}.nav{gap:12px;font-size:.82rem}.filter-label{width:100%}}
</style></head><body><header class="site-header"><a class="brand" href="/" aria-label="Bryson Systems home"><span class="brand-mark">BS</span><span>Bryson Systems</span></a><nav class="nav" aria-label="Primary navigation"><a href="/#work">Work</a><a href="/#videos">Videos</a><a href="/#process">Process</a><a href="/blog/" class="active">Writing</a><a href="/#contact">Contact</a></nav></header>
<main><p class="eyebrow">Writing</p><h1>Ideas, systems, and the person behind them.</h1><p class="intro">Technical breakdowns sit alongside essays and personal writing—clearly labeled, so you can read the side of me you came for.</p>
<section class="filters" aria-label="Filter articles"><div class="filter-row"><span class="filter-label">Type</span><button type="button" class="active" data-category="all">All</button>${typeButtons}</div>${tagButtons ? `<div class="filter-row"><span class="filter-label">Topics</span><button type="button" class="active" data-tag="all">All</button>${tagButtons}</div>` : ''}</section>
<section class="posts" aria-live="polite">${items || '<p>No posts yet.</p>'}<p class="empty" hidden>No writing matches those filters.</p></section></main>
<footer><span>Bryson Systems</span><span>AI workflow systems for content, marketing, and operations.</span></footer>
<script>(()=>{let category='all',tag='all';const posts=[...document.querySelectorAll('[data-post]')],empty=document.querySelector('.empty');function apply(){let visible=0;for(const post of posts){const show=(category==='all'||post.dataset.category===category)&&(tag==='all'||post.dataset.tags.split('|').includes(tag));post.hidden=!show;if(show)visible++}empty.hidden=visible>0;const params=new URLSearchParams;if(category!=='all')params.set('type',category);if(tag!=='all')params.set('tag',tag);history.replaceState(null,'',location.pathname+(params.size?'?'+params:''))}function select(attr,value){document.querySelectorAll('['+attr+']').forEach(button=>button.classList.toggle('active',button.dataset[attr.slice(5)]===value))}document.addEventListener('click',event=>{const type=event.target.closest('[data-category]'),topic=event.target.closest('[data-tag],[data-card-tag]');if(type){category=type.dataset.category;select('data-category',category);apply()}if(topic){tag=topic.dataset.tag||topic.dataset.cardTag;select('data-tag',tag);apply()}});const params=new URLSearchParams(location.search);category=params.get('type')||'all';tag=params.get('tag')||'all';select('data-category',category);select('data-tag',tag);apply()})()</script></body></html>\n`;
}

export async function rebuildSite() {
  const posts = await listPosts();
  for (const meta of posts) {
    const post = await getPost(meta.slug);
    await fs.writeFile(path.join(BLOG_DIR, post.slug, 'index.html'), await renderPostHtml(post));
  }
  await fs.writeFile(path.join(BLOG_DIR, 'index.html'), blogIndex(posts));
  return posts;
}

async function git(args) {
  const { stdout } = await exec('git', args, { cwd: REPO_DIR, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

async function assertReady() {
  const branch = await git(['branch', '--show-current']);
  if (branch !== 'main') throw new Error(`Editor requires the main branch; current branch is ${branch || 'detached HEAD'}.`);
  const dirty = await git(['status', '--porcelain']);
  if (dirty) throw new Error(`Repository has uncommitted changes. Resolve them before publishing:\n${dirty}`);
  await git(['pull', '--ff-only', 'origin', 'main']);
}

async function commitAndPush(message) {
  await git(['add', '-A', '--', 'blog']);
  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged) return { changed: false, message: 'No changes to publish.' };
  await git(['commit', '-m', message]);
  const commit = await git(['rev-parse', '--short', 'HEAD']);
  try { await git(['push', 'origin', 'main']); }
  catch (error) { throw new Error(`Created commit ${commit}, but push failed. Fix GitHub authentication and retry.\n${error.stderr || error.message}`); }
  return { changed: true, commit, message: `Published commit ${commit}. Netlify deployment has started.` };
}

export async function savePost(input, originalSlug = '') {
  const post = validatePost(input);
  if (originalSlug && originalSlug !== post.slug) throw new Error('Existing post slugs cannot be renamed.');
  await assertReady();
  const dir = path.join(BLOG_DIR, post.slug);
  if (!originalSlug) {
    try { await fs.access(dir); throw new Error(`A post named ${post.slug} already exists.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, 'post.md'), post.markdown.trimEnd() + '\n'),
    fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ slug: post.slug, title: post.title, description: post.description, author: post.author, date: post.date, category: post.category, tags: post.tags }, null, 2) + '\n'),
    renderPostHtml(post).then((html) => fs.writeFile(path.join(dir, 'index.html'), html))
  ]);
  await fs.writeFile(path.join(BLOG_DIR, 'index.html'), blogIndex(await listPosts()));
  return commitAndPush(`blog: ${originalSlug ? 'update' : 'publish'} ${post.slug}`);
}

export async function deletePost(slug) {
  if (!SLUG_RE.test(slug)) throw new Error('Invalid slug.');
  await assertReady();
  const dir = path.join(BLOG_DIR, slug);
  await fs.access(path.join(dir, 'post.md'));
  await fs.rm(dir, { recursive: true, force: false });
  await fs.writeFile(path.join(BLOG_DIR, 'index.html'), blogIndex(await listPosts()));
  return commitAndPush(`blog: delete ${slug}`);
}
