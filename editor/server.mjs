import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteDraft, deletePost, getDraft, getPost, listDrafts, listPosts, renderMarkdown, saveDraft, savePost } from './blog-store.mjs';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const assets = {
  '/': ['ui.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};

function normalizePath(url) {
  let pathname = new URL(url, 'http://localhost').pathname;
  if (pathname === '/blog-editor' || pathname === '/blog-editor/') return '/';
  if (pathname.startsWith('/blog-editor/')) pathname = pathname.slice('/blog-editor'.length);
  return pathname;
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (req, res) => {
  try {
    if (new URL(req.url, 'http://localhost').pathname === '/blog-editor') {
      res.writeHead(308, { location: '/blog-editor/' });
      res.end();
      return;
    }
    const pathname = normalizePath(req.url);
    const asset = assets[pathname];
    if ((req.method === 'GET' || req.method === 'HEAD') && asset) {
      res.writeHead(200, { 'content-type': asset[1], 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : await fs.readFile(path.join(DIR, asset[0])));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/posts') return json(res, 200, { posts: await listPosts() });
    if (req.method === 'GET' && pathname.startsWith('/api/posts/')) return json(res, 200, await getPost(decodeURIComponent(pathname.slice('/api/posts/'.length))));
    if (req.method === 'GET' && pathname === '/api/drafts') return json(res, 200, { drafts: await listDrafts() });
    if (req.method === 'GET' && pathname.startsWith('/api/drafts/')) return json(res, 200, await getDraft(decodeURIComponent(pathname.slice('/api/drafts/'.length))));
    if (req.method === 'POST' && pathname === '/api/preview') {
      const input = await body(req);
      return json(res, 200, { html: renderMarkdown(input.markdown) });
    }
    if (req.method === 'POST' && pathname === '/api/posts') {
      const input = await body(req);
      const result = await savePost(input.post, input.originalSlug || '');
      if (input.draftId) await deleteDraft(input.draftId).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      return json(res, 200, result);
    }
    if (req.method === 'POST' && pathname === '/api/drafts') {
      const input = await body(req);
      return json(res, 200, await saveDraft(input.post, input.draftId || ''));
    }
    if (req.method === 'DELETE' && pathname.startsWith('/api/posts/')) return json(res, 200, await deletePost(decodeURIComponent(pathname.slice('/api/posts/'.length))));
    if (req.method === 'DELETE' && pathname.startsWith('/api/drafts/')) return json(res, 200, await deleteDraft(decodeURIComponent(pathname.slice('/api/drafts/'.length))));
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error);
    json(res, 400, { error: error.message || 'Unexpected error.' });
  }
});

server.listen(PORT, HOST, () => console.log(`Bryson Systems blog editor listening on http://${HOST}:${PORT}`));
