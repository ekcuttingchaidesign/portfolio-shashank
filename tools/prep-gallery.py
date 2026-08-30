#!/usr/bin/env python3
# ============================================================================
#  prep-gallery — the two sizes the galleries actually load.
#
#  The photography and meme cards are delivered as 1080x1600 PNGs with the
#  polaroid frame already baked in — white border, photo up top, the wide
#  margin along the bottom. That is why nothing in the CSS draws a frame: the
#  art IS the frame, and a second one built in CSS would sit inside the first.
#
#  What it does NOT survive is being shipped. Eighteen of those PNGs are 30MB,
#  and the carousel shows them at about 150px wide, so the thumbnail row alone
#  was asking a visitor to download twenty-six megabytes to look at eleven
#  postage stamps. Both sizes below are therefore WebP, and there are two of
#  them rather than one:
#
#    <name>.webp        1080 wide, quality 82 — what the lightbox opens. The
#                       overlay draws the card at ~610 CSS px, so 1080 is
#                       still comfortably 2x on a retina display and there is
#                       nothing to gain from going wider than the master.
#    <name>_thumb.webp  400 wide, quality 78 — what the carousel loads. Also
#                       ~2x its drawn size, and about a fiftieth of the PNG.
#
#  The frames are flattened to RGB on the way through. Every master measures
#  fully opaque (alpha extrema 255,255), so the alpha channel was carrying no
#  information and only cost bytes.
#
#  Masters stay in assets/photography and assets/memes and are not served.
#  This writes into public/img/, which is what the page fetches from.
#
#  Needs Pillow (`python -m pip install Pillow`). It is a Python tool rather
#  than another .mjs like its neighbours because the .mjs ones decode through
#  a headless Chromium that is not installed on every machine this repo gets
#  cloned to, and re-encoding eighteen stills does not need a browser.
#
#  Usage:
#    python tools/prep-gallery.py
# ============================================================================

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing — run: python -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent

# (masters, destination, output stem). The stem is lowercased and the counter
# zero-padded so the files sort the way a human reads them: the delivered
# masters are Photography_1 … Photography_11, which sorts 1, 10, 11, 2 — and
# the carousel plays in filename order.
JOBS = [
    (ROOT / "assets" / "photography", ROOT / "public" / "img" / "photography", "photography"),
    (ROOT / "assets" / "memes",       ROOT / "public" / "img" / "memes",       "meme"),
]

FULL_W,  FULL_Q  = 1080, 82
THUMB_W, THUMB_Q = 400,  78


def natural_key(p: Path):
    """Photography_10 must sort after Photography_2, not before it."""
    stem = p.stem
    digits = "".join(c for c in stem if c.isdigit())
    return (int(digits) if digits else 0, stem)


def convert(src: Path, dst: Path, width: int, quality: int) -> int:
    im = Image.open(src).convert("RGB")
    if im.width != width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)
    return dst.stat().st_size


total_in = total_out = 0

for src_dir, out_dir, stem in JOBS:
    if not src_dir.is_dir():
        print(f"  (skipped, no such folder: {src_dir})")
        continue

    masters = sorted(
        [p for p in src_dir.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg")],
        key=natural_key,
    )
    print(f"\n{src_dir.name} -> {out_dir.relative_to(ROOT)}  ({len(masters)} masters)")

    for i, src in enumerate(masters, 1):
        name = f"{stem}_{i:02d}"
        full = convert(src, out_dir / f"{name}.webp", FULL_W, FULL_Q)
        thumb = convert(src, out_dir / f"{name}_thumb.webp", THUMB_W, THUMB_Q)
        src_kb = src.stat().st_size
        total_in += src_kb
        total_out += full + thumb
        print(f"  {src.name:<22} -> {name}.webp {full/1024:7.0f}KB"
              f"   {name}_thumb.webp {thumb/1024:6.0f}KB"
              f"   (master {src_kb/1024:7.0f}KB)")

print(f"\nmasters {total_in/1048576:.1f}MB  ->  served {total_out/1048576:.1f}MB"
      f"  ({total_out/total_in*100:.0f}% of the weight)\n")
