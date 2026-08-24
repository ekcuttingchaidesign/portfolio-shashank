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
| `MASCOT_MOONWALK_ONLY.png` | 8 × 3 | 24 | **On hover / focus.** Moonwalks for as long as you stay on it |
| `mascot_moonwalk_dab2.png` | 6 × 4 | 24 | *Kept for revert.* The moonwalk-into-dab it replaced |

Hover the character and it moonwalks; move away and it goes back to vibing.
Focus does the same, so a keyboard is not shut out of it. Both poses loop —
the dab sheet had to play once because a dab has a beginning and an end, but a
moonwalk is a cycle and it runs while you are looking at it.

**To revert to the dab**, change two things: `POSES.walk` in
`assets/js/sections.js` back to `{ cols: 6, rows: 4, frames: 24, cycle: 2100 }`,
and `--sx-mv-walk` plus the `[data-pose="walk"]` `background-size` in the CSS
back to `mascot_moonwalk_dab2.webp` / `600% 400%`. Both `.webp` files are
already built, so nothing needs regenerating.

The vibe's rate follows the strip's — it dances faster while the reel is coming
in fast — at a fifth of the strip's excess, capped at 1.8×. The moonwalk does
not follow it: it is danced at somebody, so it keeps its own tempo, and it
dances even while the strip is paused. A direct answer to a pointer outranks
the ambient state.

### The plinth

`mascot-dance-platform.svg` (renamed from `MASCOT DANCE PLATFORM.svg` — spaces
and capitals in a URL are avoidable trouble). It sits behind the character and
is sized and placed in fractions of the mascot's own width, so the two cannot
drift apart at any viewport. The character stands about 40% down the stage
rather than on its front edge at 47%: a step back from the lip is where a
figure has to be for a plinth to read as something it is standing ON.

The "spotlight" is already in the file — the top face's gradient runs from
`#553220` to transparent across the surface, which is light falling on it, and
the front face fades downward the same way. No separate light asset is needed
and none was added. If you want an actual cone of light above it, say so; it
is a gradient, not a file.

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
masters stay in the repo as the tool's input and are never requested. The walk
sheet is not fetched with the page — the first hover decodes it before
switching, so a cold first hover never blinks the character out.

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
