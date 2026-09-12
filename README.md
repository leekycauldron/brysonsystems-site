# brysonsystems.ca

The Bryson Systems website. A static site (plain HTML, no build step), deployed on Netlify.

## Structure
- `index.html` — homepage
- `blog/` — blog index and posts
  - `blog/bio-md/` — the bio.md launch post. `post.md` is the editable source; `index.html` is the rendered page (the markdown is spliced between the `content:start` / `content:end` markers).

## Deploy
Netlify builds from this repo on every push to `main`. There is no build command; the publish directory is the repo root (see `netlify.toml`). To publish a change: commit and push.
