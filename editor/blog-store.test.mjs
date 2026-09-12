import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './blog-store.mjs';

test('renders common Markdown', () => {
  const html = renderMarkdown('## Hello\n\n**bold** and [link](https://example.com)');
  assert.match(html, /<h2>Hello<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
});

test('removes executable markup', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|javascript:/i);
});
