# Outside Work — what is built, and what it is waiting on

The section is `#outside-work`, between the pull-out and the end of the page.
Markup in `prototype/index.html`, styles in `assets/css/outside.css`, the
engine in `assets/js/outside.js`. Built against
`outsideworktechspecv2.md`.

## The art is in, and the axis is measured

All eight files are the delivered ones. The stand-ins that stood here while the
upload was in flight are gone, and `tools/make-blocks.mjs`, which generated
them, has been deleted — it wrote to the delivered filenames, and a tool that
overwrites real art with grey boxes is not something to leave lying in `tools/`.

**Build order §1 is done.** The master block measures:

```
front vertex   318.23, 413.13
right vertex   714.18, 182.43
rise / run     230.70 / 395.95 = 0.5826   ->  true isometric, 0.1% off
```

So `ISO = { AX: 0.8637, AY: -0.5039 }` stands — the same projection the hero's
own depth vector `(+120, −70)` uses. The blocks travel through the ground
plane, not across it. `block_2` agrees to three decimals; `block_1` reads
`0.6036`, about 3.5% off, because its top face is not quite a parallelogram —
harmless, since the axis governs the camera and not the individual block, but
worth knowing if that one ever looks subtly wrong beside the others.

Re-measure after any re-export:

```bash
node tools/measure-iso.mjs public/img/master_block.svg
```

## Two things the export needed, and now has

The blocks arrived as three anonymous `<path>`s with baked fills, which fails
§3.1 (faces need `id="top"/"left"/"right"` or the fold-together assembly cannot
run) and §3.2 (fills need to be variables or a depth tier cannot retint them).
Rather than send the art back, `tools/prep-blocks.mjs` adds both mechanically:

```bash
node tools/prep-blocks.mjs public/img/master_block.svg public/img/block_*.svg
```

**Geometry is never touched, and the delivered colours become the fallbacks**,
so a prepared file renders identically to the one that went in until something
sets a variable. Faces are identified by position — highest is the cap, then
leftmost of the remaining two — and the tool cross-checks that against fill
brightness, refusing the file if the two disagree rather than silently
mislabelling a face and sending the top sliding in sideways. Re-running is
safe; a prepared file is left alone.

It also prints the `BLOCKS` manifest. **Use it rather than typing anchors by
hand:** the origin is genuinely not `(0.5, 1)` on these blocks — the master's
front-bottom vertex sits at `x 0.444` — and eyeballing it puts every block off
the ground.

*One trap, already hit:* these paths close by repeating their first vertex
before `Z`. Averaged raw, that duplicate drags the top face's centroid 55px
toward one corner, which put the mascot off the middle of the face. The tool
closes the ring before averaging.

## The mascots are measured too

`iplay` is a seated figure on a couch; the other two stand. All three arrive on
canvases with 4–12% vertical padding and **the figures are not centred in it** —
the footprints sit at `x 0.44`, `0.67`, `0.64`. A nominal `(0.5, 0.96)` anchor
therefore floats them off the block and shunts them sideways, which is exactly
what it did.

```bash
node tools/measure-mascots.mjs public/img/iplay.png public/img/iShoot.png public/img/iMeme.png
```

It reads the alpha bounding box, then the widest opaque run across the bottom
of it — the footprint, not the box's middle, so an outstretched arm cannot drag
the anchor off the feet. The section scales each figure on its **ink height**,
not its canvas, so a seated character and a standing one read at the same size
on the same plinth. Same reasoning the sprite sheets next door already use.

Filenames are `iplay.png`, `iShoot.png`, `iMeme.png` — **two are camel-cased**
and Pages serves off a case-sensitive filesystem, so `ishoot.png` resolves on a
Mac and 404s in production. They are spelled exactly as delivered everywhere
they appear.

## Built to the design frame

All four frames are now in hand and built to. They are authored **1:1 at
1920×1080** —
the master block's 715px natural width is 715px on that canvas, 37% of the
frame. So the world scales off `REF_W = 1920`, not off 1. Held at 1.0 the same
block ate 50% of a 1440 window: a different composition wearing the same
numbers.

```
worldScale = clamp(vw / 1920, .55, 1.15)        desktop
             clamp(vw / 1920 * 1.9, .30, .50)   phone
```

Everything positional is now in **design units** and scales with it — the
`AMBIENT` offsets, and the station offset, which is read straight off the
frame: the master block's front-bottom vertex sits at `(1345, 925)` against a
centre of `(960, 540)`, so `stOx +385, stOy +385`. §7.1's `+280/+40` predates
the artwork.

Type is sized from the design's **ink**, not from a guess at its point size:

| | design | build |
| --- | --- | --- |
| `I play` ink width | 202px | 209px |
| subtext line 1 | 343px | 348px |
| copy left margin | 165px | 165px |

That put the headline at ~88px — **Bold, not the display Light the rest of the
page opens with** — and the subtext at 28px on 1.85 leading. Both were sitting
about a third under, held down by `rem` ceilings in their clamps; worth
checking any clamp on this page for the same fault, since the middle term only
wins when the ceiling is above it.

The paragraph's measure is in `em` (12.4 of them), so the line breaks after
"only" at every window width rather than only at 1920. The copy *container* is
sized to its content too — at 720px it reached 370px past the longest line, and
since that box is what the ambient field is kept clear of, the composition was
being held away from space nothing occupies.

The design also carries several ambient blocks at **full palette**, not a
uniformly darkened field, so `mid` came up to `brightness(.92)` and `bg` went
further back to `.34`. The contrast between them now reads as depth rather than
as a slightly duller green.

## The CTAs, and what the frames actually show

`I play` has none. `I click` has **View Gallery**, `I meme` has **View Memes**.
So the design is inconsistent across three parallel items, exactly as §7.4
predicted it would look — and it is what ships, because the frames are the
brief. Flagging it once more and leaving it drawn.

The arrow is drawn as an SVG rather than set as `→`: the design's is long and
thin, and the glyph in Satoshi is a short stubby mark that reads as something
else entirely.

## Copy is anchored by its top

The three blocks are 215, 310 and 370 tall. Centring them put the short one
40px below where the design has it and the tall one 40px above; every frame
starts its headline at about 410 of 1080 and lets the block run down from
there. Line endings are explicit `<br>`s, not a measure — `I click` is three
separate sentences, and a width would fold them somewhere else at every window
size.

## The figures are not one size

Ink height as a share of the block they stand on, measured per frame:

| | | |
| --- | --- | --- |
| `iplay` | seated on a couch | 0.82 |
| `iShoot` | standing | 0.90 |
| `iMeme` | standing | 0.90 |

An earlier pass normalised all three to a common ink height, reasoning from the
sprite sheets next door. That was wrong here: those sheets are the same
character walking, so a common height is what keeps him from resizing between
poses. These are three different poses of which one is **sitting down**, and it
is short because it is sitting down. Normalising shrank both standing figures
to two thirds of the size the design draws them.

`iplay` is then carried past its measured 0.53 to **0.82** on purpose. A couch
is wider than a person, so matching its ink height to the frame left it with
less presence on its block than the other two have on theirs; it read as the
small one of the three.

## The title card

Left aligned at 250 of 1920, not centred. `My life beyond` is the **real
italic** — `ital@1` is now on the font link; left to synthesise it the browser
shears the roman, which is a slanted serif rather than this face's own cursive
*a*, *y* and *f*. It carries a warm gradient painted through the text rather
than the flat amber the spec reserved, with the amber kept as the fallback so a
browser without `background-clip: text` gets a headline rather than a gap.

`9` and `5` are upright and heavy, `to` italic at about half their size.
Instrument Serif ships one weight, so the 700 is the browser's synthesis — it
reads as the design's weight at 150px and would not at a text size, and this is
the only place on the site that asks for it.

**Spec §1 says "type only, no master block" and the frame disagrees**, putting
a large slab out to the right. The frame wins. `k: .78` scales it to the 560 it
is drawn at, since no variant comes in that size and stretching a tier to reach
it would have moved that block's parallax too.

## Loud blocks arrive; quiet ones have always been there

§8 gives the whole ambient field a wide 1400 entrance window so it fades up
from far off rather than popping in. Right for the dark `bg` and `mid` slabs,
wrong for the bright `stage` ones: at 1400 a stage block is 90% opaque while
still 820 units out, and since each frame was composed on its own, one of
station one's bright slabs was arriving at full strength on top of the title
card's block and reading as a single broken stepped solid.

The two share a path down the travel axis, so no coordinate fixes it — the loud
ones simply arrive nearer their own stop. `stage` and `fg` get 620, `bg` and
`mid` keep 1400.

## The overlap with the pull-out

The world does not slide in. The desk turns, and what was behind it is there.

**The stage is pinned to the window** (`position: fixed`), not stuck to its
section. Sticky meant the stage was clipped by the section's own top edge, and
that edge is still descending the screen through the entire reveal — measured,
it does not reach `y=0` until `pExit 1.05`, a full frame after the film ends.
So the world arrived through a horizontal line travelling upward: a sheet
coming up from the bottom, which is the opposite of the intended read.

Widening the scroll overlap also uncovers the frame, but pays for it with the
camera — at 83% the edge clears in time and a fifth of the ledge timeline is
gone before the film stops, so the title stop would be leaving as the desk
settles. Pinning costs nothing: through the overlap the section has barely
begun to scroll, so a fixed stage and a stuck one differ only in that this one
fills the frame.

A pinned stage covering the window at opacity 0 would swallow pointer events
for the whole page above it, so it is `visibility: hidden` until it has
something to show. Verified across the full 23,800px document: no leak at any
scroll position above the section.

Two knobs drive the arrival, and they answer different questions.

**Scroll.** The section is pulled up over the tail of `#s-exit` by 40% of that
section's travel, so the two share that stretch of scroll. The world reads the
film's height itself; the landing engine is never asked to know about it.

**Reveal.** The landing engine hands over the film's own scrub position —
`window.SX.ledge(pExit)`, the same shape as the `SX.hero` and `SX.dust` hooks
beside it. The ramp runs `pExit 0.60 → 1.00`, which puts the world at **25%
revealed when the film is 70% scrubbed**. Measured at 1440×900:
`pExit 0.700 → reveal 26.1%`.

## The title is a separate entity

§9 puts the title card at full parallax, and that was wrong for what this
moment is. On the axis it became one more thing sliding down and left with the
blocks — the desk finished turning and the type was already leaving on the same
vector as the scenery.

Two things happen at once instead. The desk rotates; the type arrives **from
the left**, horizontally, on no axis at all; the world is revealed behind it.
The entry is driven by the **film** (`reveal`), not the camera, and held back
by `TITLE_DELAY` — driven straight off the reveal the type raced the rotation
instead of landing into the space it opens. Only the exit belongs to the
camera, once that has pushed past the title stop toward `I play`.

### It rides a real spring

The entrance is scrubbed, so a time-based Motion animation cannot drive it —
that would not play backwards when you scroll up. What Motion *can* give is the
curve. `Motion.spring({ stiffness: 190, damping: 17 })` is sampled once across
its own settling time (820ms) into a 160-entry lookup, and the scrub then rides
real spring physics instead of a cubic. It overshoots to ~1.08 and settles,
which is what makes the words arrive with weight rather than just sliding.

The line is split into six word tokens at runtime — three serif, then `9`,
`to`, `5` — and each lands on a stagger, carrying `x`, `rotate`, `scale`,
`opacity` and a blur that clears ahead of the movement so a word is legible
while it is still settling. The filter is dropped entirely once sharp; left on,
it keeps the token rasterising through its own layer for the rest of the
section. Falls back to a back-ease of comparable overshoot if the library did
not load.

*One trap:* the words have to be `inline-block` to be transformable, and
`background-clip: text` on the parent does **not** reach an inline-block
child's glyphs. The serif line inherited a transparent fill with nothing
painting through it and vanished completely. The gradient now lives on each
word, with JS sizing it to the line width and offsetting it by the word's own
left edge, so three paints still read as one sweep.

## Depth is a ladder, and only the master block is at full

| tier | opacity | role |
| --- | --- | --- |
| `stage` | 100% | the block a mascot stands on, and the title's own slab |
| `near` | 68% | the bright field immediately around it |
| `mid` | 36% | behind that |
| `bg` | 15% | far field |
| `fg` | 100%, near-black | punctuation crossing the bottom of frame |

Opacity carries most of it now and brightness only trims — the reverse of how
this file started. §4.1 pushes brightness precisely so overlapping blocks stay
opaque, and that is still true; the field is composed to keep overlaps rare
rather than to hide them behind a filter.

## Everything but the master block floats

Two unequal periods per node and a phase from its own index, so nothing pulses
in unison, with amplitude falling by tier — a far object moving as far as a
near one *is* a near one. Translation only: rotating an isometric block turns
its faces off the ground plane.

**The first pass of this was invisible**, and the test that passed it was the
problem: it asked "did the transform string change", which is true of sub-pixel
motion. Measured properly the blocks were travelling one to three pixels a
second through a 13-second cycle. The periods are 4.6s and 6.1s now, with 7 to
16px of travel, and the check measures real on-screen displacement — 14 to 32px
over five seconds.

Running the loop every frame also put `style.width` on the frame path, which is
not a compositor property. It is cached and written only on change. Layout is
still one pass per frame — reading the section's rect after the previous
frame's writes forces that, and at 24ms per 3s it is not worth restructuring
the loop to avoid.

The block a mascot stands on does not move. A figure bobbing on its own plinth
reads as a mistake rather than as weightlessness.

This is the only thing here that moves without the scroll moving, so it is the
only reason the loop cannot park. It runs while the section is on screen and
stops the moment it is not. **`?still=1` freezes it** — which is what lets the
reversibility check compare transforms at a scroll position rather than at an
instant, and what to reach for when judging a composition.

## No mirrored blocks

`flip` is gone. Mirroring an isometric block with `scaleX(-1)` mirrors the
projection with it: the faces end up lit for the opposite axis and the block
visibly stops travelling along the same line as everything else. §5 offers it
"for variety" and it is not variety, it is a block facing the wrong way.
Variety comes from the four variants and the tiers.

## The glow is a gradient, not a blur

The Figma is a 1002×531 ellipse, `#FF8C6C` at 40%, under a **1000px** layer
blur. Written as a radial gradient, for the reason the mascot's bloom already
established: a blur is only worth its own layer when what is underneath has
structure to lose, and a flat ellipse has none.

Derived rather than eyeballed. Convolving that ellipse with the matching
Gaussian — σ ≈ 896, calibrated against the 600px-blur bloom in
`pending-art.md`, which was measured at 5.1% peak — adds variances and gives
σx 930 / σy 906, so the source ellipse's 1.89 aspect survives only as a 3%
stretch. Peak alpha:

**Re-derived once against the design.** Figma's layer-blur value is twice the
Gaussian σ, so 1000 is σ 500 — not the ~896 a first pass took second-hand from
the 600px bloom in `pending-art.md`. That put the peak at 3.3% and the glow was
all but invisible; the title frame reads about `rgb(27,16,12)` at its warmest,
which is the 10.6% below.

```
0.40 × (π × 501 × 265.5) / (2π × 500²) = 10.6%
```

The stops are `exp(−4.5 f²)` down a 3σ extent, and it sits upper-left where all
four frames put it. Still a wide, soft wash; just not an invisible one.

Its colour travels `#FF8C6C → #FFFFFF` across the traversal, written into
`--lw-glow-rgb`; the stops carry alpha only.

**It must stay inside `overflow: hidden`.** At 5580px across it is not the seam
that bites without one — it is horizontal overflow. Measured at a 390px
viewport with the clip removed, the page laid out at 1560 and scrolled
sideways.

## Copy that is placeholder

The spec gives headlines and the closing plaque but no subtext, so **the three
paragraphs and all three CTA labels are written to be replaced.** The CTA
`href`s are `#` and carry `data-lw-todo="destination"` — grep for that
attribute; they need real destinations before this ships.

Station two is **`I click`**, per spec §1. The Figma screen and the asset are
both named *iShoot*. The spec supersedes, so `I click` is what is in the page;
worth a decision either way.

All three stations carry a CTA. The spec notes `I play` had none in the slides
and that an inconsistent pattern across three parallel items reads as an
oversight — `View trophies →` is the suggested fix and is what shipped.

## Rules this section is holding to

- **The serif appears once.** Instrument Serif is declared on `.lw-title` and
  nowhere else. `--sx-serif` in the global tokens still points at Satoshi and
  should stay that way.
- **Amber appears exactly twice.** `--lw-amber` `#D08544` is declared on `.lw`,
  not in the global token block, so it cannot be reached from elsewhere: the
  title, and `Rare` in the closing plaque.
- **Entrances are a pure function of camera distance**, never of time and never
  of an observer, which is what lets scrolling up play them backwards.
  Verified: every painting node is bit-identical scrolling down to a position
  and back up to it.
- **The exit dissolves.** Entrance only ever counts up, so everything behind
  the camera would sit at full opacity forever and the world would stop rather
  than thin out. A separate dissolve runs `camT 3400 → 4300`, exempting the one
  block the spec leaves standing at the end.
- **The band is symmetric.** Blocks also fade once they are well behind the
  camera — held to 700 units, gone by 1200, so nothing survives to the next
  stop 1450 on. This is what keeps §6's "never overlap the copy column" true:
  the worst offender was one of station one's slabs still sitting over station
  *two's* copy, covering 39% of it, which no amount of nudging its coordinates
  could fix because the offence only existed at the far station. Audited at all
  three dwells: clear.

## Delivered but unused

The upload also carried `mascot_say_hi.png`, `last_ledge.svg`, and four social
marks — `dribbble.svg`, `instagram.svg`, `lnkedin.svg` (spelled that way in the
file), `youtube.svg`.

All seven belong to the **Say hello** section, which is a later build.

**None of them is used here.** `mascot_say_hi.png` was briefly riding the
closing block — §11 asks for a figure there — and has been taken back out now
that its home is known. The block drifts in bare and the plaque carries the
beat until Say hello absorbs this stop. `last_ledge.svg` is
worth a look before it is used: like `left_ledge.svg` before it, its artwork
overflows its declared `viewBox` — 443 wide inside a 398 box — so it will need
the same crop fix `conical_green.svg` had.

## Reduced motion has its own heading

The only `h2` lives inside the stage, and the stage is `display: none` under
reduced motion — so the stack, which *is* the whole section there, was reading
with no heading at all. It carries its own now.

## Still open

- **CTA destinations.** Both pills are `href="#"` and carry
  `data-lw-todo="destination"`. Grep for that.
- Station two is headed **`I click`**, from spec §1 and confirmed by its own
  frame, while the asset is named *iShoot*. Only the filename disagrees now.
- Ambient composition at stations two and three follows station one's tier mix
  and their own frames' broad placement, but is not a coordinate-level trace of
  either. `?edit=1` retunes it.
- `dwell` vs linear travel between keys (§10) is still the open design
  question the spec flags, and is much easier to judge with real artwork in.

## Numbers worth keeping

At 1440×900: 47 nodes total, **45 painting at the peak**, the rest
`visibility: hidden` — well inside the spec's 120 ceiling, so the `bg` tier
does not need pre-composing yet. Nothing is fetched with the page; every
variant and mascot is warmed when the section comes within a screen. No failed
requests, and no horizontal overflow at 390px.
