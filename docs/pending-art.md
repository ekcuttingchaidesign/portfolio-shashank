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

## The two lettered cards

Airtel Coins and Self-Serve IPTV came through clean, so their titles are live
text: selectable, re-wrapping on a phone, crisp at any zoom.

**Wynk Rewind and Parental Controls arrived with their titles baked into the
render**, which printed each of them twice — once from the PNG and once from
the DOM. Those two cards now carry `data-lettered`, which takes the DOM copy
off the screen while leaving it in the document, so a screen reader still has
a name for the card and nothing is drawn twice.

That is a working state, not the better one. The live text is sharper on a
high-DPI screen, it re-wraps when the card narrows, and it can be selected and
searched. To get it back:

1. Re-export the two nodes from Figma with their text layers hidden — same
   names, same 976 × 884 and 824 × 884.
2. Delete the `data-lettered` attribute from the two `<article>` tags in
   `prototype/index.html`.

Nothing else changes; the copy is already sitting there.

Wynk's big `20` / `21` numerals are **not** text for this purpose — they are
Poppins Bold, rotated, at 144 and 288, and this site ships Satoshi only.
They should stay in the render whatever else comes out of it.

## `conical_green.svg`

The uploaded export had a `viewBox` of `0 0 236 369` against artwork whose own
bounds are `90.4, 29.4 → 361.5, 294.7` — roughly a third of the cone was cut
off its right edge, with 75px of empty canvas hanging below it. The file now
carries the artwork's own box. If it is re-exported, export the `conical_green`
node on its own rather than its parent frame.

## One line worth a second look

The IPTV card reads **"Reducing SR tickets via self serve experience"**, which
is the Figma's copy and is what ships. `SR tickets` is internal Airtel
vocabulary — a design lead reading this page will not know it means service
requests. Something like *"Fewer support tickets, by letting people fix it
themselves"* says the same thing in the reader's words. Left as drawn.
