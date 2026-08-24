# Renders More Stories is waiting on

The four bento cards are built and laid out; each one is holding a slot for its
artwork. Until a file lands the card paints the reserved plate the featured
covers already use — corner ticks and the slot's name — so nothing is broken in
the meantime and nothing needs changing in the code when the file arrives.

**Drop the file in `public/img/` under the exact name below and it appears.**
No other change is needed: the `data-art` contract flips the slot to `ready` the
moment the image decodes.

| File name (in `public/img/`) | Card | Export at | Card renders at |
| --- | --- | --- | --- |
| `stories_airtel_coins.png` | Airtel Coins · Interaction | **978 × 1504** (2×) | 489 × 752 |
| `stories_iptv_selfserve.png` | Self-Serve IPTV | **1872 × 548** (2×) | 936 × 274 |
| `stories_wynk_rewind.png` | Wynk Rewind | **976 × 884** (2×) | 488 × 442 |
| `stories_parental_controls.png` | Parental Controls | **824 × 884** (2×) | 412 × 442 |

## What to include in each export, and what to leave out

Every card's **text is live DOM**, not baked into the image — it stays crisp,
selectable and responsive, and it re-wraps on a phone. So export the artwork
**with the text layers hidden**, with these exceptions:

- **Airtel Coins** — the phone mockup and the coins around it. Hide `AIRTEL
  COINS` and `INTERACTION`. The card's own black-to-amber ground is CSS, so the
  export can be transparent or can carry the ground; either works.
- **Self-Serve IPTV** — the set-top box photograph only. Hide `Self-Serve IPTV`
  and its line beneath. The black-to-clear wash over the left 61% is CSS, so
  export the photograph clean and let the card lay the scrim over it.
- **Wynk Rewind** — this one **keeps its numerals**. The big `20` / `21` are
  artwork, not type: they are Poppins Bold, rotated, at 144 and 288, and this
  site ships Satoshi only. Baking them in is what avoids pulling a whole
  second webfont down for two numbers. Hide only `WYNK REWIND`.
- **Parental Controls** — the set-top box render. Hide `PARENTAL` and
  `CONTROLS`.

Each slot is `object-fit: cover`, so a file at the right aspect ratio fills the
card and one slightly off is cropped from its centre rather than squashed.

## Already in the repo

- `conical_green.svg` — the cone over the heading. The uploaded export had a
  `viewBox` of `0 0 236 369` while the artwork's own bounds are
  `90.4, 29.4 → 361.5, 294.7`, so roughly a third of the shape was cut off its
  right edge and 75px of empty canvas hung below it. The file now carries the
  artwork's own box. If it is ever re-exported from Figma, export the
  `conical_green` node on its own rather than its parent frame.

## One thing worth a second look

The IPTV card's line reads **"Reducing SR tickets via self serve experience"**,
which is the Figma's copy and is what ships. `SR tickets` is internal Airtel
vocabulary — a design lead reading this page will not know it means service
requests. Something like *"Fewer support tickets, by letting people fix it
themselves"* says the same thing in the reader's words. Left as drawn; say the
word and it changes.
