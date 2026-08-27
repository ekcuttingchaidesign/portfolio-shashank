# Art the page is waiting on

## The More Stories renders

All four are in. This is the record of what each slot holds and the one thing
still worth doing.

| File (in `public/img/`) | Card | Shipped at | Card renders at |
| --- | --- | --- | --- |
| `stories_airtel_coins.png` | Airtel Coins · Interaction | 978 × 1504 | 489 × 752 |
| `stories_iptv_selfserve.png` | Self-Serve IPTV | 1872 × 548 | 936 × 274 |
| `stories_wynk_rewind.png` | Wynk Rewind | 976 × 884 | 488 × 442 |
| `stories_parental_controls.png` | Parental Controls | 824 × 884 | 412 × 442 |

Every file is exactly 2× its slot, and every one matches its slot's aspect
ratio to three decimals — so `object-fit: cover` is not cropping any of them,
on the shelf or in the single column below 1000px.

## All four titles are live text

Every card's title is real DOM — selectable, re-wrapping on a phone, crisp at
any zoom. Wynk Rewind and Parental Controls first arrived with their titles
baked into the render and were held behind a `data-lettered` attribute that
hid the duplicate copy; both have since been re-exported clean and the
attribute is gone.

Wynk's big `20` / `21` numerals stay in the render and should: they are
Poppins Bold, rotated, at 144 and 288, and this site ships Satoshi only.
Baking them in is what avoids pulling a second webfont down for two numbers.

If any card is ever re-exported, export it **with its text layers hidden** —
the numerals being the one exception.

## `conical_green.svg`

Now the node's full `0 0 362 369` box, which is correct. The artwork occupies
only the right three-quarters of it — 90px of empty canvas down the left, 74
along the bottom — so the CSS sizes the element to the **file** and lets the
artwork land where the file puts it.

It is no longer bled off the right edge. The design runs it past the frame, but
at this size that cut two-fifths of the shape away and read as a rendering
fault rather than as a deliberate crop, so it is inset by a few px and the
whole cone shows.

The cone is wedged: about 20px of daylight above it to the last case study, and
20 below to the top of the grid. That is why its width is capped at 272 rather
than following vw all the way up, and why its scroll drift is only a few px.
Both numbers come from the `--sx-st-lead` token — change that and the cone's
room changes with it.

## One line worth a second look

The IPTV card reads **"Reducing SR tickets via self serve experience"**, which
is the Figma's copy and is what ships. `SR tickets` is internal Airtel
vocabulary — a design lead reading this page will not know it means service
requests. Something like *"Fewer support tickets, by letting people fix it
themselves"* says the same thing in the reader's words. Left as drawn.


---

# Things that move

## The mascot — two poses on a plinth

| Sheet | Grid | Frames | Role |
| --- | --- | --- | --- |
| `mascot_music_vibe.png` | 6 × 2 | 12 | **Default.** Vibing to the music |
| `mascot_moonwalk_dab2.png` | 6 × 4 | 24 | **On hover / focus.** Moonwalk into a dab, for as long as you stay on it |
| `MASCOT_MOONWALK_ONLY.png` | 8 × 3 | 24 | *Built and kept.* The walk-only cycle, tried and reverted |

Hover the character and it moonwalks; move away and it goes back to vibing.
Focus does the same, so a keyboard is not shut out of it. Both poses loop —
the dab sheet had to play once because a dab has a beginning and an end, but a
moonwalk is a cycle and it runs while you are looking at it.

**To try the walk-only cycle again**, change two things: `POSES.walk` in
`assets/js/sections.js` to `{ cols: 8, rows: 3, frames: 24, cycle: 1500 }`, and
`--sx-mv-walk` plus the `background-size` on
`.sx-mv-mascot[data-warm] .sx-mv-sheet[data-sheet="walk"]` in the CSS to
`MASCOT_MOONWALK_ONLY.webp` / `800% 300%`. Both `.webp` files are built and
normalised to the same scale, so nothing needs regenerating either way.

The vibe's rate follows the strip's — it dances faster while the reel is coming
in fast — at a fifth of the strip's excess, capped at 1.8×. The moonwalk does
not follow it: it is danced at somebody, so it keeps its own tempo, and it
dances even while the strip is paused. A direct answer to a pointer outranks
the ambient state.

### The stand — light, plinth, character

All three are one group, `.sx-mv-stand`, so attaching the whole thing to the
right edge is one number rather than three that have to agree. The character's
position is a share of the stand, not of the section, so it cannot come unstuck
from the plinth it stands on.

`mascot-dance-platform.svg` (renamed from `MASCOT DANCE PLATFORM.svg` — spaces
and capitals in a URL are avoidable trouble). The character stands about 40%
down the stage rather than on its front edge at 47%: a step back from the lip
is where a figure has to be for a plinth to read as something it is standing
ON.

**Attached to the right edge of the WINDOW, not of the column.** The wrap stops
at its gutter, and past 1560 it stops again at its max-width and centres, so
reaching the glass means undoing both — that is the `max()` in the stand's
`right`. It bleeds a little further still, because the plinth's front face only
runs to 633 of the SVG's 763 and stopping flush would leave the thin, faded end
of the top face against the edge, which reads as exactly the gap it was meant
to close. The section clips on the x axis only, so the character can still
stand above its own box.

**The spotlight** is `spotlight.svg`, softened by `blur(10px)` — half the
Figma's 20, which over the SVG's own soft gradient blurred the beam's edge away
entirely and left a wash with no direction in it.
Its throw is masked away toward the top: the beam is longer than the section it
belongs to and its apex landed 500px up inside More Stories, where a warm wedge
crossing the bento is nobody's idea. Cutting it at the seam would put a hard
bright edge there — the apex is the brightest part of the beam — so instead it
dissolves, and the light arrives from somewhere out of frame with its source
lost in the dark. Which is what a beam does anyway.

**The bloom** is the Figma's 348px `#FF8250` circle under a 600px layer blur,
written as a radial gradient. That is a reading of the spec rather than an
approximation of it: rendered literally and sampled down its radius, that blur
peaks at **5.1% alpha** dead centre and falls 4.71 / 3.92 / 2.75 / 1.96 / 1.18
/ 0.78 / 0.39 at 300, 450, 600, 750, 900, 1050 and 1200px out.

*If these are ever re-derived: the sample canvas has to be bigger than the
blur.* The first pass measured the 700px version in a 1400px box and its tail
read as a flat 2.4% — that was the clipped edge pixel repeating, not the
falloff. There is no
core and no edge — it is a wide, weak wash, which is the shape of a radial
gradient. The stops in the CSS are those measurements. What it avoids is a
filtered layer whose paint bounds run some 2000px past the element on every
side, for a picture a gradient draws for nothing.

The rule this follows, and the reason the featured cards' bloom is built the
same way: on this page a blur is only worth its layer when the thing underneath
has structure to lose. A flat circle has none. The 20px on the beam is a
different case — small, static, and over an SVG with an actual edge to soften.

### The ledge

`right_side_ledge.svg` — the hero's own, mirrored exactly as it is up there.
Reusing the asset *and* its flip is the point: the page opens with a green
wedge in one corner and this answers it in the other, which reads as a rhyme
where a second, different shape would read as clutter. Its viewBox is correct
as delivered, unlike `left_ledge.svg`, whose artwork overflows its declared box
by about 3.4× and would need the same crop fix `conical_green.svg` had.

### The sheets the page loads are generated

All three, by `tools/normalize-sprite.mjs`, **in one run**. Three separate
problems, and each one only shows up once you look:

**Each sheet is off its own grid.** The moonwalk-dab's row pitches are 271, 251
and 234px. A window stepping by a fixed fraction shows most of the intended
frame plus the feet of the one above.

**Figures can touch.** `MASCOT_MOONWALK_ONLY` packs eight across 1536 at a
192px pitch and neighbouring shoes overlap, so there is no empty column to
split on — band detection found five columns, not eight. The tool now falls
back to splitting at the quietest column near each nominal boundary, which for
this sheet lands within six pixels of every one.

**The sheets are drawn at different sizes.** The vibe figures are 428px tall
and the dab's are 208 — the same character at twice the scale. Normalised
separately each sheet is internally perfect and the mascot still changes size
the instant it changes pose.

So every sheet in a run is scaled to a common MEDIAN figure height and drawn
into one shared 274px cell on one baseline. Median, not shortest: a walk's most
compressed frame is an outlier, and anchoring on it floated the moonwalk to a
median of 244 against the vibe's 212 — a 15% growth on hover. Head width was
tried as a pose-invariant anchor and is not one; on the dab sheet it reads an
arm across the face as a 30% bigger head. All three now sit at 239.

**Always pass every sheet in one command**, or they drift apart again:

```bash
node tools/normalize-sprite.mjs public/img \
  public/img/mascot_music_vibe.png:6x2 \
  public/img/MASCOT_MOONWALK_ONLY.png:8x3 \
  public/img/mascot_moonwalk_dab2.png:6x4
```

### Weight

176KB, 323KB and 470KB as WebP against 1.5MB, 1.6MB and 2.1MB as PNG. The PNG
masters stay in the repo as the tool's input and are never requested.

The walk sheet is still not fetched with the page. It is fetched when the
section is APPROACHED, not when the character is hovered, and that distinction
is the whole of a bug that outlived one fix. Each sheet now owns a layer of its
own and the pose only flips which layer is visible; hovering costs an opacity
change and never asks for a file. Under reduced motion, and on the phone
breakpoint where the stand is hidden, the walk sheet is never fetched at all.

**So do not put a `background-image` behind a pose again.** A CSS background is
a resource of its own — warming an `Image()` with the same URL does not warm it,
which is exactly how the character kept vanishing after the first fix went in.

## The fourteen tiles

Blocks for now, by design. Each plate takes a video with no code change:

```html
<div class="sx-cel-plate">
  <video src="../public/video/reel/upi-receipt.mp4" muted loop playsinline
         preload="metadata" poster="..."></video>
</div>
```

Drop the `data-empty` attribute off the plate when you add one — that attribute
is what draws the reserved hatch and the label.

**Playback is already wired.** Tiles play only while on screen and pause the
moment they leave, via IntersectionObserver — no scroll handler, no per-frame
work. Fourteen decoders running at once would cost frames on a laptop and
battery on a phone, and eleven of them would be painting outside the viewport.
The observer also watches for tiles added later, so files can land in any
order.

Ratios are 16:9 and 9:16 and the strip is built for both — one shared height,
width follows the aspect. Nothing needs cropping to fit.
