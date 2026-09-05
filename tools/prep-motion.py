#!/usr/bin/env python3
# ============================================================================
#  prep-motion — the reel's thirteen films, at a weight the web will carry.
#
#  Same bargain as prep-gallery next door, one medium up. The masters in
#  assets/motion_videos are delivery files: 4K portrait screen recordings,
#  1080p60 films, a 344MB spin wheel. Together they are 890MB, and the reel
#  draws them at 330px tall. Shipping the masters was never on the table —
#  git keeps every version of a binary forever, so a megabyte pushed once is
#  a megabyte in the history for good.
#
#  So each master becomes two files, and neither is the master:
#
#    <slug>.mp4          Long edge 1280, 30fps cap, H.264 High, CRF 27,
#                        faststart. What the overlay plays. The overlay's
#                        frame is about 620 CSS px for portrait and 1100 for
#                        landscape, so 1280 is still 2x on the portrait cards
#                        — which are the ones with UI text in them — and 1x
#                        on the widest landscape, where there is nothing fine
#                        enough to miss it.
#    <slug>_poster.webp  Long edge 900, quality 72. What the CARD shows, and
#                        what the <video> paints before its first frame
#                        decodes. Nothing autoplays in the strip, so this
#                        still IS the card until somebody clicks it.
#
#  The poster is not frame 0, and it is not a fixed timecode either. Almost
#  every one of these opens on black or on a logo animating up out of
#  nothing, so frame 0 gives a strip of empty rectangles — but a fixed seek
#  is only luckier, not righter: 12% into the Airtel film is a white wipe,
#  and that card came out as a blank sheet with a caption under it.
#
#  So the seek lands at 8% and ffmpeg's `thumbnail` filter picks the frame,
#  scoring a few hundred of them and keeping the least ordinary one. That is
#  exactly the judgement being asked for — "the frame that looks like the
#  film" — and it costs a couple of seconds of decode per master.
#
#  faststart matters more here than the numbers do: it moves the moov atom to
#  the front of the file, which is the difference between a video that starts
#  playing on the first few hundred KB and one that plays only once the whole
#  thing has landed. The overlay opens on a click, so that wait is the
#  entire experience of it.
#
#  Needs ffmpeg on PATH, or a path to one in $FFMPEG. There is no pip package
#  that does this; ffmpeg-static from npm is the easiest way to get a build
#  that does not touch the system:
#      npm i ffmpeg-static
#      FFMPEG=node_modules/ffmpeg-static/ffmpeg.exe python tools/prep-motion.py
#
#  Masters stay in assets/motion_videos and are not served — see .gitignore.
#  This writes into public/video/motion/, which is what the page fetches from.
#
#  Usage:
#    python tools/prep-motion.py            # everything that is missing
#    python tools/prep-motion.py --force    # re-encode all of it
# ============================================================================

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "motion_videos"
OUT_DIR = ROOT / "public" / "video" / "motion"

FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
if not FFMPEG:
    sys.exit("ffmpeg is missing — put one on PATH, or set $FFMPEG to a build "
             "(npm i ffmpeg-static gets you one without touching the system).")

VIDEO_LONG_EDGE = 1280
VIDEO_CRF = 27
VIDEO_FPS = 30
POSTER_LONG_EDGE = 900
POSTER_QUALITY = 72
POSTER_AT = 0.08          # where the search for a frame STARTS, not the frame
POSTER_SCAN = 400         # frames scored from there; ~13s at 30fps

# Stable, readable names for the files the markup points at. A slugified
# "Spinny_Dec Dhamaal Tier Based_v3" is a filename nobody can type twice the
# same way, and the version suffixes are the master's business, not the site's.
# Anything not listed here is slugified below, so dropping a new file into the
# folder still works — it just gets a duller name.
NAMES = {
    "Airtel Gaming":                     "airtel_gaming",
    "HT Success v2":                     "ht_success",
    "HT on Thanks":                      "ht_on_thanks",
    "New Chats - Prototype 1":           "new_chats_prototype",
    "Spinny_Dec Dhamaal Tier Based_v3":  "spinny_dec_dhamaal",
    "Spinny_SpinWheel v7":               "spinny_spinwheel",
    "Wynk 2.0 Full Jazz":                "wynk_full_jazz",
    "Wynk 2021 Rewind":                  "wynk_2021_rewind",
    "Wynk_plan_exploration":             "wynk_plan_exploration",
    "starwars_Unreal_engine":            "starwars_unreal_engine",
}

FORCE = "--force" in sys.argv


def slug(stem: str) -> str:
    if stem in NAMES:
        return NAMES[stem]
    s = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    return s or "clip"


def probe(src: Path):
    """width, height, duration — read out of ffmpeg itself, so this tool needs
    exactly one binary rather than ffprobe as well."""
    out = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(src)],
        capture_output=True, text=True, errors="replace"
    ).stderr
    dim = re.search(r"Video:.*?,\s(\d{2,5})x(\d{2,5})", out)
    dur = re.search(r"Duration:\s(\d+):(\d\d):(\d\d\.\d+)", out)
    w, h = (int(dim.group(1)), int(dim.group(2))) if dim else (0, 0)
    secs = (int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + float(dur.group(3))) if dur else 0.0
    return w, h, secs


def run(args):
    r = subprocess.run(args, capture_output=True, text=True, errors="replace")
    if r.returncode != 0:
        sys.exit(f"\nffmpeg failed:\n{' '.join(args)}\n\n{r.stderr[-2500:]}")


def encode(src: Path, dst: Path):
    # force_original_aspect_ratio=decrease fits the frame INSIDE the box, so
    # one number caps the long edge whichever way up the film is. Portrait and
    # landscape then arrive at the overlay with the same amount of detail in
    # them, which a plain -vf scale=1280:-2 would not give.
    run([FFMPEG, "-y", "-v", "error", "-i", str(src),
         "-vf", (f"scale={VIDEO_LONG_EDGE}:{VIDEO_LONG_EDGE}"
                 ":force_original_aspect_ratio=decrease:force_divisible_by=2"
                 f":flags=lanczos,fps={VIDEO_FPS}"),
         "-map", "0:v:0", "-map", "0:a:0?",
         "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
         "-crf", str(VIDEO_CRF), "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "96k",
         "-movflags", "+faststart", str(dst)])


def poster(src: Path, dst: Path, secs: float):
    # -ss before -i seeks by keyframe and costs nothing even on a two minute
    # file. It only chooses where to START LOOKING; `thumbnail` chooses the
    # frame, and it goes after the scale so the scoring is done on 900px
    # frames rather than on 4K ones.
    at = max(0.4, secs * POSTER_AT)
    run([FFMPEG, "-y", "-v", "error", "-ss", f"{at:.2f}", "-i", str(src),
         "-frames:v", "1",
         "-vf", (f"scale={POSTER_LONG_EDGE}:{POSTER_LONG_EDGE}"
                 ":force_original_aspect_ratio=decrease:flags=lanczos"
                 f",thumbnail={POSTER_SCAN}"),
         "-c:v", "libwebp", "-quality", str(POSTER_QUALITY), str(dst)])


if not SRC_DIR.is_dir():
    sys.exit(f"no such folder: {SRC_DIR}")

OUT_DIR.mkdir(parents=True, exist_ok=True)
masters = sorted(p for p in SRC_DIR.iterdir()
                 if p.suffix.lower() in (".mp4", ".mov", ".m4v", ".webm"))

print(f"\n{SRC_DIR.name} -> {OUT_DIR.relative_to(ROOT)}  ({len(masters)} masters)\n")

total_in = total_out = 0
for src in masters:
    name = slug(src.stem)
    mp4 = OUT_DIR / f"{name}.mp4"
    png = OUT_DIR / f"{name}_poster.webp"
    w, h, secs = probe(src)

    if FORCE or not mp4.exists():
        encode(src, mp4)
    if FORCE or not png.exists():
        poster(src, png, secs)

    a, b = mp4.stat().st_size, png.stat().st_size
    total_in += src.stat().st_size
    total_out += a + b
    print(f"  {src.name:<36} {w}x{h} {secs:6.1f}s"
          f"  ->  {name}.mp4 {a/1048576:6.2f}MB   poster {b/1024:5.0f}KB")

print(f"\nmasters {total_in/1048576:.0f}MB  ->  served {total_out/1048576:.1f}MB"
      f"  ({total_out/total_in*100:.1f}% of the weight)\n")
