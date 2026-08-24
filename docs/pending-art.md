# The More Stories renders

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
