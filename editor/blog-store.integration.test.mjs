import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('creates, edits, deletes, commits, and pushes a post', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-editor-test-'));
  const repo = path.join(root, 'site');
  const remote = path.join(root, 'origin.git');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(repo, 'blog'), { recursive: true });
  await fs.writeFile(path.join(repo, 'blog', 'index.html'), '<p>No posts yet.</p>\n');
  await exec('git', ['init', '--bare', remote]);
  await exec('git', ['init', '-b', 'main'], { cwd: repo });
  await exec('git', ['config', 'user.name', 'Test Author'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  await exec('git', ['add', '.'], { cwd: repo });
  await exec('git', ['commit', '-m', 'initial'], { cwd: repo });
  await exec('git', ['remote', 'add', 'origin', remote], { cwd: repo });
  await exec('git', ['push', '-u', 'origin', 'main'], { cwd: repo });

  process.env.BLOG_REPO_DIR = repo;
  const store = await import(`./blog-store.mjs?integration=${Date.now()}`);
  const post = { slug: 'test-post', title: 'Test post', description: 'A test post.', author: 'Bryson', date: '2026-09-12', category: 'personal', markdown: '## Hello\n\nFirst version.' };

  const headBeforeDraft = (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const drafted = await store.saveDraft(post);
  assert.equal(drafted.draft.id, 'test-post');
  assert.match(drafted.message, /Nothing was published/);
  assert.equal((await store.getDraft('test-post')).markdown, post.markdown);
  assert.equal((await store.listDrafts())[0].slug, 'test-post');
  assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim(), headBeforeDraft);
  assert.equal((await exec('git', ['status', '--porcelain'], { cwd: repo })).stdout.trim(), '');

  const incomplete = await store.saveDraft({ category: 'personal' });
  assert.match(incomplete.draft.id, /^draft-\d+$/);
  assert.equal((await store.getDraft(incomplete.draft.id)).title, '');
  await store.deleteDraft(incomplete.draft.id);

  const created = await store.savePost(post);
  assert.equal(created.changed, true);
  const saved = await store.getPost('test-post');
  assert.equal(saved.title, 'Test post');
  assert.equal(saved.category, 'personal');
  const index = await fs.readFile(path.join(repo, 'blog/index.html'), 'utf8');
  assert.match(index, /data-category="personal"/);
  assert.doesNotMatch(index, /data-tag=/);

  post.markdown = '## Hello\n\nSecond version.';
  const edited = await store.savePost(post, 'test-post');
  assert.equal(edited.changed, true);
  assert.match((await fs.readFile(path.join(repo, 'blog/test-post/index.html'), 'utf8')), /Second version/);

  assert.match((await store.deleteDraft('test-post')).message, /discarded/);
  assert.deepEqual(await store.listDrafts(), []);

  const deleted = await store.deletePost('test-post');
  assert.equal(deleted.changed, true);
  assert.deepEqual(await store.listPosts(), []);
  const { stdout } = await exec('git', ['--git-dir', remote, 'rev-list', '--count', 'main']);
  assert.equal(stdout.trim(), '4');
});
