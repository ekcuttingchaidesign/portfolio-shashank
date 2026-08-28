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

## Station placement is derived from the art, not from the spec

§7.1 gives `ox: +280, oy: +40`. The `+40` was written before the blocks had
dimensions. Delivered, the master is 715×509 and the figure on it reaches
**526px above the block's own ground point** — 58% of a 900px window — so an
origin at the middle of the frame hangs the group's head off the top of the
screen and across the nav. `stOy` is 240 on desktop and 420 on the phone, which
centres that 526 instead. `ox: +280` is the spec's and is unchanged.

## The overlap with the pull-out

Two independent knobs, because they answer two different questions.

**Scroll.** `#outside-work` is pulled up over the tail of `#s-exit` by 40% of
that section's travel, so the two share that stretch and the camera has already
left its first key by the time the desk stops turning. The world reads the
film's height itself; the landing engine is never asked to know about it.

**Reveal.** The landing engine hands over the film's own scrub position —
`window.SX.ledge(pExit)`, the same shape as the `SX.hero` and `SX.dust` hooks
beside it. The ramp runs `pExit 0.60 → 1.00`, which puts the world at **25%
revealed when the film is 70% scrubbed**, which was the brief. Measured at
1440×900: `pExit 0.700 → reveal 26.1%`.

The two spans are deliberately the same 40% of travel, and one thing depends on
it: through the overlap the stage's top edge is still descending the screen and
the glow is clipped along it, which measured 3.5–9.0 luma against the black the
film ends on — a panel sliding up over the video, which is the one thing the
ground under this page is black to avoid. A mask band shrinking with the reveal
dissolves that edge, and reaches zero exactly when the edge reaches the top of
the window and stops being an edge. Retune one span and the other has to move
with it.

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

```
0.40 × (π × 501 × 265.5) / (2π × 896²) = 3.3%
```

The stops are `exp(−4.5 f²)` down a 3σ extent. It is a wide, weak wash, which
is what a 1000px blur is.

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

`mascot_say_hi.png` **is** now in: it is the figure riding the closing block,
which is what §11 asks for and what nothing else in the delivery could have
been. The other five are not, because the spec's §11 ends at "Say hello." and
inventing a contact row under it would be designing rather than building. They
are sitting in `public/img/` ready. `last_ledge.svg` is worth a look before it
is used: like `left_ledge.svg` before it, its artwork overflows its declared
`viewBox` — 443 wide inside a 398 box — so it will need the same crop fix
`conical_green.svg` had.

## Still open

- Subtext, CTA labels, CTA destinations.
- Whether the four social marks belong under "Say hello.", and in what form.
- `dwell` vs linear travel between keys (§10) is still the open design
  question the spec flags, and is much easier to judge with real artwork in.

## Numbers worth keeping

At 1440×900: 47 nodes total, **45 painting at the peak**, the rest
`visibility: hidden` — well inside the spec's 120 ceiling, so the `bg` tier
does not need pre-composing yet. Nothing is fetched with the page; every
variant and mascot is warmed when the section comes within a screen. No failed
requests, and no horizontal overflow at 390px.
