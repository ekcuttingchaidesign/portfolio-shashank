# portfolio-shashank

Personal design portfolio.

## Live site

**https://ekcuttingchaidesign.github.io/portfolio-shashank/**

The root URL forwards to the current prototype at
[`/prototype/`](https://ekcuttingchaidesign.github.io/portfolio-shashank/prototype/).

## What's here

The site is currently a single scroll-scrub landing prototype: two short films
are scrubbed frame-by-frame against scroll position, so scrolling drives the
camera into and back out of a monitor rather than playing video on its own.

| Path | What it is |
| --- | --- |
| `index.html` | Root page; forwards to `prototype/`. Replace once a real landing page exists. |
| `prototype/index.html` | The scroll-scrub prototype — all markup, styles, and scrub logic in one file. |
| `public/video/` | The two source films (`into-the-screen`, `out-of-the-screen`). |
| `.nojekyll` | Tells Pages to publish the files as-is instead of running them through Jekyll. |

## Running it locally

There is no build step, but the page must be served over HTTP — opening
`prototype/index.html` from the filesystem breaks video scrubbing. From the
repo root:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000/ — the same relative paths the deployed site
uses, so what you see locally is what Pages serves.

## Deployment

GitHub Pages is configured to **deploy from a branch**: `main`, folder
`/ (root)`. Pushing to `main` republishes the site within a minute or so; there
is no workflow or build to wait on.

Because the site is served from the repo root, `prototype/index.html` reaches
its videos as `../public/video/…`. Moving either directory means fixing those
paths.
