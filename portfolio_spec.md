# Portfolio — Landing Page Experience

Technical specification for the scroll-driven 3D landing sequence.

---

## 1. Concept

The visitor does not land on a webpage. They land **behind someone at a desk**, in a dark room, at night.

Scrolling does not scroll a page — it moves a camera. The camera pushes forward into the monitor, passes through the screen, and later pulls back out, settles, and turns 180° to face the rest of the room.

The entire landing sequence is **one continuous camera move**, pre-rendered in Blender and scrubbed by scroll position in the browser. Nothing in the room is real-time 3D; nothing is interactive geometry. It is a film, played by the scrollbar.

**Design principle held throughout:** every transition must be *caused* by something in the world. The camera moves because you scroll. The screen lights because the camera arrives. Nothing appears for decorative reasons.

---

## 2. The scroll spine

| Scroll | Beat | What happens |
|---|---|---|
| 0% | **Hero** | Over-the-shoulder. Person seated at desk, monitor dark, lamp on. Name and role fade in over the still frame. |
| 0–35% | **The dive** | Camera pushes forward into the monitor. Intro copy drifts out of frame as the camera moves. Screen fills the viewport. |
| 35–70% | **Hold** | Camera frozen on the black screen. *(Not rendered — the browser holds a single frame while overlay content is scrolled.)* |
| 70–85% | **Pull back** | Camera retreats from the screen, back to the original position behind the chair. |
| 85–88% | **Settle** | Camera holds still for ~15 frames. Re-establishes "we are back in the room" before anything moves. |
| 88–100% | **The turn** | Camera rotates 180° on its Z axis to face the opposite wall. |

The **settle** beat is not optional. Without it the rotation reads as a jump cut, because the viewer has not yet registered that they are back in physical space.

---

## 3. The 3D scene

Built in **Blender 4.x**. Single scene, single room, single camera.

### Contents
Desk, gaming chair, seated figure, monitor, monitor stand, keyboard, mouse, mousepad, speakers, headphones, desk lamp, wall shelf, plants, framed posters, F1 model car, Lego figure, paperbacks, cutting-chai glass, sketch paper.

Most objects are third-party GLB/FBX assets (see Credits). The room, lighting, materials, and camera work are original.

### Lighting
Three practical sources only. No studio three-point rig.

| Light | Source | Colour | Role |
|---|---|---|---|
| Key | Monitor backlight (emissive plane) | ~6500K cool blue | Main light on the desk and the figure's shoulders |
| Fill | Desk lamp | ~2700K warm | The only warmth on the work side |
| Rim | Small light behind the figure, out of frame | neutral | Separates the silhouette from the dark. **Non-negotiable** — without it the figure reads as a blob |

Everything else falls into darkness. The dark is structural: it hides geometry seams and cheap topology, and it is the entire mood.

### Materials
- PBR texture sets (diffuse / roughness / normal), wired with **Node Wrangler** (`Ctrl+Shift+T`)
- Colour maps: **sRGB**. Roughness, normal, displacement maps: **Non-Color**. Getting this wrong is the most common texture bug.
- Displacement maps are **not** connected to true displacement — normal maps alone are sufficient for surfaces seen at this distance, and true displacement is expensive
- Texture tiling controlled by a **Mapping** node → Scale (floor tiles ≈ 3–4)
- Wall tint via a **Mix Color (Multiply)** node over the diffuse, so texture detail is retained
- Bevel modifier (1–2 mm, 2 segments) on hard edges so they catch a highlight

### Camera
- 35 mm focal length
- **Depth of field enabled**, f/2.0, focused on the monitor
- Auto-orient / Track-To constraints **off** (they fight manual rotation keyframes)

---

## 4. Camera animation

One camera, one action, keyframed on **Location & Rotation**.

```
frame   0    camera behind the chair, framing the desk
frame  67    screen fills the frame (fully black)
        ...  gap — not rendered
frame 100    camera at the frame-67 position (copied keyframe)
frame 130    camera pulled back to the original position
frame 145    identical to frame 130          ← the settle
frame 187    camera rotated 180° on Z
```

Frame 100 must be an exact copy of frame 67's transform, or the two clips will not join.

### Easing

Interpolation is **Cubic** throughout. Easing mode differs by beat, because the beats do different jobs:

| Beat | Frames | Easing | Why |
|---|---|---|---|
| Dive | 0 → 67 | **Ease In** | Slow start, accelerating into the screen. Reads as *falling in* rather than arriving. |
| Pull back | 100 → 130 | **Ease In-Out** | Smooth at both ends. |
| Settle | 130 → 145 | — | Two identical keyframes; the camera is still. |
| Turn | 145 → 187 | **Ease In-Out** | Slow, fast, slow. The speed curve *is* the drama. |

Set via Graph Editor → `T` (interpolation) and `Ctrl+E` (easing mode).

**Avoid Auto Clamped handles** — they overshoot and introduce a visible shake on a camera move.

---

## 5. Render & export

### Render settings
| Setting | Value |
|---|---|
| Engine | Cycles |
| Device | GPU Compute |
| Max samples | 256 |
| Denoise | **On** (OpenImageDenoise) |
| Motion blur | On, shutter 0.5 |
| Resolution | 1920 × 1080 @ 100% |
| Frame rate | **30 fps** — not 29.97 |
| Colour depth | 8-bit |

### Output
Two clips are rendered from the same animation:

| Clip | Frame range |
|---|---|
| `dive.mp4` | 0 → 67 |
| `turn.mp4` | 100 → 187 |

Frames beyond the point where the screen is fully black are not rendered — they are identical frames and waste time and file size.

Also export **frame 0 as a still** for use as the video poster.

### Encoding

If exporting video directly from Blender:

```
Container:          MPEG-4
Video codec:        H.264
Output quality:     High Quality
Keyframe interval:  1        ← critical
Max B-frames:       off
Audio codec:        No Audio
```

If rendering PNG sequence first, encode with:

```bash
ffmpeg -i frames_%04d.png \
  -an -vf fps=30 \
  -c:v libx264 -preset slow -crf 22 \
  -g 1 -keyint_min 1 -sc_threshold 0 \
  -pix_fmt yuv420p -movflags +faststart \
  output.mp4
```

**Budget:** both clips under 8 MB combined.

---

## 6. The all-keyframe requirement

This is the single most important technical finding in the project.

A normally-encoded H.264 file stores a keyframe every ~20–30 frames and reconstructs everything in between. That is fine for playback, and **broken for scroll-scrubbing** — every seek forces the decoder to find the previous keyframe and rebuild forward from it, which produces visible stutter, especially when scrolling backwards.

A first export of the turn clip measured:

```
Total frames: 90
Keyframes:     4      ← one every 22.5 frames
```

Re-encoded with `-g 1 -keyint_min 1 -sc_threshold 0`:

```
Total frames: 90
Keyframes:    90
File size:    3.5 MB → 1.9 MB   (audio track removed)
```

### Verify before shipping

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries frame=key_frame -of csv=p=0 file.mp4 \
  | awk -F',' '{if($1==1) kf++; total++} END {print kf"/"total" keyframes"}'
```

Keyframes must equal total frames. VLC is not a valid test surface — it seeks aggressively and will appear janky regardless. Test in a browser.

---

## 7. Scroll-scrub implementation

Scroll position maps to `video.currentTime`, but **never directly**. The target is smoothed toward, every frame:

```js
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let target = 0, current = 0;
const DAMPING = 0.18;

function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
  target = p * video.duration;
}

function render() {
  current += (target - current) * DAMPING;
  if (Math.abs(target - current) < 0.001) current = target;
  if (Math.abs(video.currentTime - current) > 0.008) {
    video.currentTime = current;
  }
  requestAnimationFrame(render);
}
```

The damping is what gives the camera weight. Without it the camera is welded to the scrollbar and the motion feels mechanical. `0.18` is the tuned value; lower is heavier.

Video element requirements: `muted`, `playsinline`, `preload="auto"`, and a `poster` attribute so nothing flashes black during load.

### Hold behaviour

Between the dive and the turn, the playhead is pinned to the dive's final frame while overlay content scrolls. The hold is **not** baked into the video — it is a scroll range in which `target` does not advance.

---

## 8. The screen is never rendered

The monitor is rendered **black** in Blender, with only a faint emissive glow to light the desk.

All screen content is an HTML layer positioned over the monitor's screen area in the composite. This means screen content can be changed, animated, or replaced without re-rendering a single frame of 3D.

---

## 9. Intro overlay

The name and role are composited **on** the first frame of the video, not shown before it. A title card that must clear before the room appears is a gate, and it costs the strongest asset on the page — the first sight of the room.

Sequence on load, staggered:

```
+500ms   नमस्ते, मैं
+1100ms  Shashank
+1700ms  Product & Motion Designer
+2200ms  menu, CTA, scroll cue
```

The intro **exits because the camera moves** — opacity and translate are driven by the same scroll progress value as the dive, over roughly 0–30%. It never gets its own separate "and now the title leaves" beat.

A **View work →** CTA is present from load and persists. Not every visitor will scroll a 3D room, and a recruiter with ninety seconds must be able to reach the work in one click.

---

## 10. Design system

### Palette
Read off the render itself, not chosen from references.

| Token | Hex | Use |
|---|---|---|
| Void | `#04060C` | Page background |
| Wall | `#0A0F1C` | Section backgrounds |
| Surface | `#18202F` | Cards, lifted planes |
| Glow | `#5B8DEF` | Primary accent — the monitor LED |
| Ice | `#C7DBFF` | Hover, highlights |
| Chai | `#D08544` | The only warmth. Used once. |
| Poster | `#C2382F` | Used once, site-wide |
| Paper | `#EDF1F8` | Light sections |

Accent gradient: `linear-gradient(104deg, #DCE9FF 0%, #8FB4F7 42%, #4F7BFF 100%)`

### Type
All from [Fontshare](https://fontshare.com).

| Face | Role |
|---|---|
| Clash Display 600 | Headlines, card titles |
| Satoshi 400/500/700 | Body, UI |
| Gambetta italic | Asides and honest lines only. Never labels or buttons. |
| JetBrains Mono | Labels, metadata, timecodes |

### Rules
1. Cool navy, never warm black — match the wall in the render
2. Accent colour is the gradient, never flat blue
3. Warmth appears twice site-wide and no more
4. Surfaces are lit, not bordered — specular top edge, shadow beneath
5. Highlight by dimming, never by adding glow
6. One film grain over both the renders and the HTML — it is the glue between them
7. Nothing snaps; everything arrives slightly late, like the camera does

---

## 11. Mobile

The 180° rotation does not survive a 390px viewport — it induces motion sickness and the room does not read at that size.

**Kept:** the over-the-shoulder open (portrait crop), and the dive into the screen (a single scale transform).

**Replaced:** the turn becomes a **notification**. A system-style banner drops from the top of the device — *"Screen time · 6h 12m. That's enough for today."* — the screen goes dark, then returns warm. A cut plus a temperature change instead of a rotation. On a phone this is arguably stronger than the desktop version, because the device is complicit in the joke.

**Dropped:** free camera movement, 3D room, any WebGL.

Portrait renders (1080 × 1920) are exported from the same Blender scene with a second camera. Compose the room for a 9:16 crop from the start.

---

## 12. Stack

| Tool | Use |
|---|---|
| Blender 4.x (Cycles) | Scene, lighting, camera animation, rendering |
| After Effects | Optional grade and composite |
| FFmpeg / Handbrake | Encoding, all-keyframe verification |
| Framer | Site build, scroll binding, overlays |
| Fontshare | Typefaces |
| Poly Haven | PBR texture sets |
| Sketchfab | Third-party 3D assets |

---

## 13. Known issues / to do

- [ ] Portrait render pass for mobile hero
- [ ] Screen content layer — behaviour on the hero before the dive begins
- [ ] Poster frames wired for both clips
- [ ] Loading strategy: the dive clip must be buffered before the scroll is armed
- [ ] `prefers-reduced-motion` fallback — static hero frame, no scrub
- [ ] Real-device testing on 4G, not desktop emulation
- [ ] Rim light pass on the figure needs a second look at the pull-back angle

---

## Credits

3D assets sourced from Sketchfab under their respective licences — see `CREDITS.md` for per-asset attribution. Texture sets from Poly Haven (CC0). Typefaces from Fontshare.

---

*Room, lighting, camera work, and everything downstream of the render are original.*
