# portfolio-shashank

Personal design portfolio.

## Live site

**https://ekcuttingchaidesign.github.io/portfolio-shashank/**

The root URL forwards to the current prototype at
[`/prototype/`](https://ekcuttingchaidesign.github.io/portfolio-shashank/prototype/).

## What's here

The site is a single scroll-scrub landing page: two short films are scrubbed
frame-by-frame against scroll position, so scrolling drives the camera into and
back out of a monitor rather than playing video on its own. Everything below
that is a normal page, styled to read as the interface running on the screen you
just dived into.

| Path | What it is |
| --- | --- |
| `index.html` | Root page; forwards to `prototype/`. Replace once a real landing page exists. |
| `prototype/index.html` | The page. Hero markup and the whole scrub engine are inline here; the sections below it are markup only. |
| `assets/css/sections.css` | Every style on the page except the scrub engine's own. The `:root` block at the top holds the palette and type scale. |
| `assets/js/sections.js` | Hero arrival, the headline rotator, the scroll reveals, the Experience reels, and the hand-off. Uses Motion. |
| `assets/vendor/motion.js` | [Motion](https://motion.dev) 13.1.0, vendored as a UMD bundle so there is no build step. |
| `assets/fonts/` | Satoshi, as woff2. The two weights the hero needs are preloaded. |
| `public/video/` | The two source films (`into-the-screen`, `out-of-the-screen`). |
| `public/img/` | The portrait, the three headline objects, and project covers. |
| `docs/pending-art.md` | What each More Stories slot holds, the brief for the projectionist mascot, and how to drop films into the reel. |
| `portfolio-content.html` | The hi-fi content wireframe all the copy below the hero comes from. Reference, not shipped. |
| `portfolio_spec.md` | The written spec behind the same. Reference, not shipped. |
| `tools/normalize-sprite.mjs` | Redraws a sprite sheet onto a strict uniform grid. The mascot's delivered sheet is not on one; see `docs/pending-art.md`. |
| `serve.js` | Local dev server. See **Running it locally** — the usual one-liner does not work here. |
| `.nojekyll` | Tells Pages to publish the files as-is instead of running them through Jekyll. |

## The page, top to bottom

1. **The dive** (`#s-enter`) — one sticky stage that holds three beats on a
   single scroll timeline: the film scrubs the camera into the monitor, the
   approach copy bridges the end of it, and then the hero *arrives along Z* —
   starting small, far and blurred, and coming forward to meet you. It arrives
   on Z rather than sliding up on Y because a Y move read as a sheet covering
   the film, and scrolling back showed the hero's own black instead of the
   frames underneath.
2. **The hold.** Once the hero has landed the scroll holds it, and the headline
   cycles through three sentences — *I craft ideas into experiences*, *I make
   pixels come alive*, *I capture moments that stay*. Each carries its own 3D
   object set into the line where a word would go; one box glides between the
   sentences and the objects crossfade inside it as it travels.
3. **`#sx-work`** — Featured work. Three case studies stacked in Z on one
   sticky line, each receding as the next climbs over it.
4. **`#sx-stories`** — More Stories. Four smaller projects on one shelf, which
   assembles from its own edges as the block comes up the screen.
5. **`#sx-move`** — Things that move. The motion reel, and the one section that
   inverts the page's habit: everything else assembles out of stillness and
   stops, this arrives already running and slows down as you reach it.
6. **`#sx-archive`** — Built with AI.
7. **`#sx-exp`** — How I got here. Four stops down one rail, with a sticky
   stage beside it where the character changes company as you scroll.
8. **`#sx-hand`**, **`#s-exit`**, **`#s-connect`** — the handoff, the dive back
   out, and *Say hello.* The handoff is one line, 250px under Experience, and
   the pull-out starts straight after it.

## Direction

The film puts you inside a monitor, so the page underneath is treated as the
interface running on it rather than as a document. Structural devices come from
the world the work is actually in — entertainment products and the motion inside
them — so spec strips read like title cards and key visuals behave like players.

**The signature is the Experience section**, and it is the character rather
than the layout. An earlier version drew the career as a rig levelling up — kit
accumulating on a desk — and the four renders that replaced it say something
better: at each stop he is a *different person*. A student in a plaid shirt, a
commuter with a laptop under one arm, a flying thing in a spider hoodie, and
finally someone who just walks. The character IS the timeline, so nearly all the
page's boldness is spent on him changing and everything around him stays quiet.

He changes by **re-render**: one vermilion bar crosses the stage, the outgoing
character is clipped away behind it and the incoming one resolves in front of
it. A dissolve would have been a transition between two pictures; a bar reads as
a render pass finishing, which is the world this page is already in.

He stands free — no card, no frame. A panel around him made the character an
exhibit; without one he is simply in the room the section is in. What holds him
is a warm bloom that brightens as the career runs, and the hero's own
`right_side_ledge` in the far corner.

**The rail is green, and the rest of the page is not.** `#57C74B` is the Claude
Code level's floor — the thing you have just walked off to get here — so the
timeline is drawn in the colour of the ground behind it, and vermilion stays
what it has always been on this page: the one *type* accent. Structure in one,
writing in the other, and no third hue invented for the job.

The rail beside him is not evenly divided, because the CV is not. Three short
stops, then five years of Airtel carrying five stints inside it — so the Airtel
segment runs long, its rule is thicker, and it opens into five rather than
closing into one line. The shape of the rail is the shape of the career.

| | |
| --- | --- |
| Everything | Satoshi — Light for the roman, Black Italic for the words that carry the claim |
| Accent | One: vermilion `#E0542A`, sampled from the portrait itself — 7% of that photograph is this colour. Experience's rail is the exception, and deliberately structural: `#57C74B`, the Claude Code level's floor |
| Ink | `#F4F1EC`, the portrait's cream, stepped down through four alphas for hierarchy |

Each project below the hero carries its own `--sx-key`, sampled from its cover
the same way the page's accent was sampled from the portrait.

### Tuning it

| What | Where |
| --- | --- |
| Length of the hero's arrival, and the hold after it | `HERO_VH` / `HERO_HOLD_VH` in the inline script in `prototype/index.html` |
| How long each Experience stop stays on the stage | `.sx-xp-stop`'s `padding-bottom` in `sections.css` — the gap between two stop tops IS the time a company holds |
| The gaps around Experience | `.sx-seam-exp` (down off the level) and `.sx-seam-out` (up to the hand-off line) |
| Which sheet, how many frames and how fast, per company | `REELS` in `sections.js` |
| How long each headline sentence holds, and how long the change takes | `SWAP_HOLD` / `SWAP_MS` in `sections.js` |
| When the objects crossfade inside the glide | `FACE_MIX_IN` / `FACE_MIX_OUT` in `sections.js` |
| Size of the objects set into the headline | `--sx-face-size` in the `:root` block in `sections.css` |
| Type scale and palette | the `:root` block in `sections.css` |

Artwork below the hero is still placeholder: the labelled `.slab` boxes mark
reserved frames. Swapping one for an `<img>` or `<video>` needs no other change.

## Running it locally

There is no build step, but the page must be served over HTTP — opening
`prototype/index.html` from the filesystem breaks video scrubbing.

**`python3 -m http.server` is not enough.** It does not answer HTTP Range
requests. The films keep their `moov` atom at the end of the file, so Chrome
asks for the tail first, gets a `200` with the whole file instead of the tail,
and the video never reports metadata — the hero stays black locally while
working fine on Pages, which does support Range. Use the server in this repo
instead, which serves it the way Pages does:

```sh
node serve.js          # http://localhost:8000
node serve.js 8123     # a different port
```

Then visit the root — the same relative paths the deployed site uses, so what
you see locally is what Pages serves.

`npm install` is optional. Motion is already vendored into `assets/vendor/`, and
that vendored copy is what the page loads; the npm dependency only exists so the
bundle can be refreshed.

## Deployment

GitHub Pages is configured to **deploy from a branch**: `main`, folder
`/ (root)`. Pushing to `main` republishes the site within a minute or so; there
is no workflow or build to wait on.

Because the site is served from the repo root, `prototype/index.html` reaches
its films as `../public/video/…` and its images as `../public/img/…`. Moving
either directory means fixing those paths.
