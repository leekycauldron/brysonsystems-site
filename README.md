# brysonsystems.ca

The Bryson Systems website. A static site (plain HTML, no build step), deployed on Netlify.

## Structure
- `index.html` — homepage
- `blog/` — blog index and posts
  - `blog/bio-md/` — the bio.md launch post. `post.md` is the editable source; `index.html` is the rendered page (the markdown is spliced between the `content:start` / `content:end` markers).

## Deploy
Netlify builds from this repo on every push to `main`. There is no build command; the publish directory is the repo root (see `netlify.toml`). To publish a change: commit and push.

## Private blog editor

`editor/` is a local Node.js Markdown editor with side-by-side preview. It separates posts into Technical and Personal writing. It scans `blog/*/post.md`, writes metadata and rendered HTML, rebuilds the filterable blog index, then commits and pushes each save/delete to `main` so Netlify deploys it.

```bash
cd editor
npm install
npm start
```

The production instance binds to localhost and is exposed only to the tailnet with Tailscale Serve. The editor files are blocked on the public Netlify site by `netlify.toml`.
