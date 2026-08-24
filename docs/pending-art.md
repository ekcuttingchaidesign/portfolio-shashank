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

## The projectionist — delivered

`mascot_moonwalk_dab2.png` is in, 24 frames of a moonwalk-into-dab cycle. It
drives the mascot in Things that move, and its frame rate is the strip's rate:
the character works hard while the reel is coming in fast, settles as the reel
settles, and freezes mid-frame when you hit Pause.

### The sheet the page actually loads is generated

`mascot_reel_sheet.webp` — built from the delivered PNG by
`tools/normalize-sprite.mjs`, and it exists because the delivered sheet is not
on a grid. It reads as one: six across, four down, evenly spaced. Measured, its
row pitches are **271, 251 and 234px** and its columns run **240 to 262**.
That is what an image model produces — figures placed approximately — and
approximately is fatal here. A CSS window stepping by a fixed fraction across
it showed most of the intended frame plus the feet of the frame above.

The tool finds each figure by its alpha and redraws all 24 into cells of one
size (274px), centred horizontally and standing on a common baseline. Figures
keep their own scale: a raised arm should make a frame taller, and normalising
heights would squash exactly the poses that need the room.

**If the sheet is ever re-exported, re-run it:**

```bash
node tools/normalize-sprite.mjs \
  public/img/<new-sheet>.png public/img/mascot_reel_sheet.png 6 4
```

It writes both a `.png` and a `.webp`; only the WebP ships. It fails loudly if
it cannot find exactly 6 × 4 figures, which is the check you want — a silently
wrong grid is the bug it exists to prevent.

If the frame count or grid changes, three constants in `assets/js/sections.js`
follow it: `SPRITE_COLS`, `SPRITE_ROWS`, `SPRITE_FRAMES`.

### Why WebP

470KB against 1.6MB for the same frames as PNG. The delivered 2.1MB master
stays in the repo as the source for the tool but is never requested by the
page. WebP needs Safari 14; this page already needs container queries, which
need Safari 16 — so it costs no reach.

### Worth knowing

The frames render at up to 210px from 274px cells, so about 1.3× — fine on a
standard display, slightly soft on a retina one. Sharper would mean a bigger
master; it is a decorative character bobbing at the edge of a section, so this
is the right trade unless you disagree.

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
