import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH || '/home/bryson2/.openclaw/workspace/.local-browser/chrome-root/opt/google/chrome/chrome';
const editorUrl = process.env.EDITOR_URL || 'https://bryson-yoga-pro-9-16imh9.tail9f2dac.ts.net/blog-editor/';
await fs.access(chromePath);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-scroll-check-'));
const chrome = spawn(chromePath, ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);

function devtoolsUrl() {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not expose DevTools. ${stderr}`)), 10_000);
    chrome.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    chrome.once('exit', (code) => reject(new Error(`Chrome exited early (${code}).`)));
  });
}

const ws = new WebSocket(await devtoolsUrl());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});

function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(sessionId, expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

try {
  const { targetId } = await cdp('Target.createTarget', { url: editorUrl });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const result = await evaluate(sessionId, `(async () => {
    const markdown = document.querySelector('#markdown');
    const preview = document.querySelector('#preview');
    if (!markdown || !preview) throw new Error('Editor panes did not load.');
    markdown.value = Array.from({ length: 500 }, (_, index) => '## Section ' + index + '\\n\\nParagraph ' + index).join('\\n\\n');
    markdown.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 800));
    const measurements = {
      editor: { client: markdown.clientHeight, scroll: markdown.scrollHeight },
      preview: { client: preview.clientHeight, scroll: preview.scrollHeight }
    };
    markdown.scrollTop = markdown.scrollHeight;
    const editorBottom = markdown.scrollTop;
    markdown.scrollTop = 0;
    const editorTop = markdown.scrollTop;
    preview.scrollTop = preview.scrollHeight;
    const previewBottom = preview.scrollTop;
    preview.scrollTop = 0;
    const previewTop = preview.scrollTop;
    return { measurements, editorBottom, editorTop, previewBottom, previewTop };
  })()`);
  const { editor, preview } = result.measurements;
  if (editor.scroll <= editor.client || preview.scroll <= preview.client) throw new Error(`Long content did not overflow: ${JSON.stringify(result.measurements)}`);
  if (result.editorBottom <= 0 || result.previewBottom <= 0 || result.editorTop !== 0 || result.previewTop !== 0) throw new Error(`Scroll travel failed: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  ws.close();
  const exited = once(chrome, 'exit');
  chrome.kill('SIGTERM');
  await exited;
  await fs.rm(profile, { recursive: true, force: true });
}
