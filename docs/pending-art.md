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

## The mascot — two poses, delivered

| Sheet | Grid | Frames | Role |
| --- | --- | --- | --- |
| `mascot_music_vibe.png` | 6 × 2 | 12 | **Default.** Vibing to the music, on a loop |
| `mascot_moonwalk_dab2.png` | 6 × 4 | 24 | **On click.** Moonwalk into a dab, plays once, returns to vibing |

Clicking the character plays the moonwalk and it goes back to vibing. It is a
real button: keyboard-reachable, Enter and Space work, and it has a focus ring.
Under reduced motion there is no sprite to play, so JS strips the button
semantics rather than leaving a labelled control that answers Enter with
nothing.

The vibe's rate follows the strip's — it dances faster while the reel is coming
in fast and settles as the reel settles, at a fifth of the strip's excess and
capped at 1.8×. The moonwalk does not follow the strip: it is a performance
someone asked for, so it plays at its own tempo, and it plays even while the
strip is paused. A direct answer to a click outranks the ambient state.

### The sheets the page loads are generated

`mascot_music_vibe.webp` and `mascot_moonwalk_dab2.webp`, built by
`tools/normalize-sprite.mjs` **in one run**. Two separate problems make this
necessary, and the second is the one that bites.

**Each sheet is off its own grid.** They read as even — six across, evenly
spaced. Measured, the moonwalk's row pitches are **271, 251 and 234px** and its
columns run **240 to 262**. That is what an image model produces: figures
placed approximately. A CSS window stepping by a fixed fraction shows most of
the intended frame plus the feet of the one above.

**The two sheets are drawn at different sizes.** The vibe figures are **428px**
tall; the moonwalk's are **208**. The same character, about twice as large.
Normalised separately, each sheet would be internally perfect and the mascot
would still double in size the instant it changed pose.

So the tool takes both at once, scales them to a common standing height (each
sheet's shortest figure is its most compact pose), and draws every frame into
one shared 274px cell, centred and standing on a common baseline. Within a
sheet figures keep their relative scale — a raised arm should make a frame
taller, and flattening heights would squash exactly the dab poses that need
the room.

**Re-run it whenever either sheet is re-exported — and always pass both**, or
they will drift apart in size again:

```bash
node tools/normalize-sprite.mjs public/img \
  public/img/mascot_music_vibe.png:6x2 \
  public/img/mascot_moonwalk_dab2.png:6x4
```

It fails loudly if a sheet does not contain exactly the grid you claim, which
is the check worth having — a silently wrong grid is the bug it exists to
prevent. If a frame count or grid changes, the `POSES` table in
`assets/js/sections.js` follows it, and each pose's `background-size` in the
CSS.

### Weight

143KB and 470KB as WebP, against 1.5MB and 2.1MB as PNG. The two PNG masters
stay in the repo as the tool's input and are never requested by the page.
WebP needs Safari 14; this page already needs container queries, which need
Safari 16, so it costs no reach.

The walk sheet is not fetched with the page — hovering or tabbing to the
mascot warms it, and the click decodes before switching so a cold first click
never blinks the character out.

### Worth knowing

Frames render at up to 210px from 274px cells, so about 1.3× — fine on a
standard display, slightly soft on a retina one. Sharper means a bigger master;
for a character bobbing at the edge of a section this is the right trade unless
you disagree.

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
