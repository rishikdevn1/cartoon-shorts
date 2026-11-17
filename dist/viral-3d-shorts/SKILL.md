---
name: viral-3d-shorts
description: Create animated Shorts and 3D/2D story videos (YouTube Shorts, TikTok, Reels) with flat 2D cel-shaded characters standing in a lit, ink-outlined 3D world. Use whenever the user asks to make, script, storyboard, animate or render an animated Short, a cartoon or explainer story video, a "true story with a twist" video, or any 3D/2D story video — even from just a topic. Always builds the video from the approved createCharacter(), createBuilding() and createScenery() modules with the approved lighting and shader pipeline.
---

# viral-3d-shorts

Every Short is built from the **approved, locked** asset library in this folder, so all videos share one polished look:
2D cel-shaded characters with stick-ink limbs, real-depth 3D buildings and scenery, golden-hour lighting with cool indigo
shadows, comic-book ink edges, and depth-of-field. Reference renders: `reference/`.

The six rules below are **mandatory for every video**. Do not skip or relax them unless the user explicitly asks.

---

## Rule 1 — Use the pre-built asset modules (never raw primitives)

Always `import` and configure the builders. Never model characters, buildings, trees or street props from raw boxes,
spheres or planes, and never edit the locked modules (`lib/characters.js`, `lib/buildings.js`, `lib/scenery.js`,
`lib/lightingAndShaders.js`). Extend only by **configuring** them (options, palettes, presets) or by adding new files.

```js
import { createCharacter } from './lib/characters.js';
import { CAST } from './lib/cast.js';
import { createBuilding } from './lib/buildings.js';
import { createScenery, setFoliageSun, createTree, createBush, createStreetlight, createBench,
         createTrafficSignal, createHydrant, createTrashCan, createRoad, createSidewalk, createCurb,
         createGrassTufts, createRocks } from './lib/scenery.js';
import { createPipeline, createLightingRig } from './lib/lightingAndShaders.js';
```

**Characters** — `createCharacter(options)` (3.5 heads tall, round head, stick-ink limbs, realistic skin tones):
- `outfit`/`type`: `casual` (tee, hoodie, cardigan) · `suit` · `uniform` (police, doctor, chef) · `historical` (roman, victorian, medieval)
- `hair`, `headwear` (cap, beanie, tophat, helmet, laurel, chefhat, crown), `glasses`, `beard`, `mustache`, `lashes`, `palette`, `height`
- `expression`: `deadpan` · `smug_happy` · `gritted_teeth` · `bug_eyed_shock` (`hatLaunch: true`) · `nervous_sweat` · `furious_steam` · `scheming` · `laughing`
- `pose`: `standing` · `sitting_dangling_legs` (origin = seat surface) · `leaning_on_cane` · `holding_prop` with `prop`: newspaper, wrench, money, burger, coffee, cane
- every frame: `c.update(t)`, `c.faceCamera(camera)`, `c.faceLight(rig.key)`; change with `setExpression`, `setPose`, `setProp`, `setGesture`, `setArm`
- characters stand directly on the ground (`showPedestal: false`). Scale them in the scene with `c.group.scale` (e.g. 1.35) — never inside the module.

**Buildings** — `createBuilding({ style, floors, width, depth, palette, sign })`, styles: `modern-glass`, `brick-apartment`,
`cafe-storefront`, `concrete-midrise`, `suburban-house`. Origin = footprint centre at ground level, front faces +z.

**Scenery** — `createScenery({ preset: 'city-park-edge', clear: [[x0, x1]], trees })` or compose the individual builders.
Call `setFoliageSun(camera, rig.sunDir)` before rendering so tree rims glow on the sun side.

**Adapting eras and settings** — match the story by configuration, not new geometry:
- *Historical*: `historical` outfits (roman / victorian / medieval), laurel/helmet/crown/tophat; drop modern props (traffic signals,
  hydrants); use `brick-apartment` with stone palettes, `suburban-house` as cottages/farmhouses; dirt via `createRocks` + lawn.
- *Rural*: `createTree`, `createBush`, `createGrassTufts`, `createRocks`, `suburban-house` (barn colours via `palette`), a bench, no road paint.
- *Urban/modern*: `createScenery('city-park-edge')`, `modern-glass`, `concrete-midrise`, `cafe-storefront` with a custom `sign`.
If the story needs an object the library lacks, build it in a **new** file in the same style (procedural textures from `lib/textures.js`,
`mat()`, `tbox()`, real depth, ink-friendly silhouettes) — never a flat textured box.

---

## Rule 2 — Script & pacing: 38–45 seconds max, 140–165 words

- **Strictly 140–165 words** (about 4 words per second). Zero dead air: no pauses longer than a breath, no filler intros.
- **Structure:**
  1. **Hook** — exactly one sentence, stated as a paradox ("A man sold the Eiffel Tower. Twice." style).
  2. **Escalation** — setting in one line, then 2–4 beats that raise the stakes; someone doubts or mocks.
  3. **Pivot** — the explanation starts with the exact two words **"You see"**.
  4. **Twist** — one sharp final line. It is the last thing said.
- Plain spoken English, contractions, sentences of 8–15 words, numbers written as words. Never narrate what the viewer can already see.
- Facts presented as true must be checked; label legends as legends.
- Count words before presenting the script and state the count and estimated length.

---

## Rule 3 — Continuous camera choreography

- **0 to 1 hard cuts in the entire Short.** Everything else is one continuous camera.
- **~65% of frames** are a subtle, continuous slow push-in (the camera is never fully static).
- Between scenes the camera **glides over ~23 frames** (at 30 fps) with cubic-bezier **slow-in, slow-out** easing
  (`cubic-bezier(0.65, 0, 0.35, 1)` / smootherstep).
- **Never** frame empty walls or blank ground: every frame has a character, a key prop or a readable landmark in focus.
- Keep characters large and against clean, contrasting backgrounds (no dark limbs over dark bushes).

```js
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // slow-in, slow-out
// glide: lerp(camA, camB, ease(clamp((f - f0) / 23)))  ·  push-in: dolly 2–4% closer per second
```

---

## Rule 4 — Story-driven lighting & shaders

- **Setup:** `createLightingRig(renderer, scene, { preset: 'golden' })` — warm golden-amber key, warm rim, cool blue/indigo shadows,
  amber horizon into daytime blue. No pastel cream grounds, no magenta/pink skies, no pure black, no muddy brown.
- **Pivot:** on the **exact frame** the word "You see" starts (from the timing file), call `rig.apply('night')` — deep night-blue.
  Night-blue is reserved for the pivot and what follows.
- **Ink:** keep the approved edge shader (≈75% of geometry edges inked). Mark meshes with `userData.nd = 'card' | 'silhouette' | 'hide'`
  only when needed (characters and foliage are already handled).
- **Depth of field** always runs as a **separate pass after the ink shader** (`createPipeline(...).render({ focus, ...rig.post })`),
  focused on the speaking character, so background blur never erases foreground ink.

---

## Rule 5 — Subtitles & visual gags

- Chunky white sans-serif subtitles with thick black outlines, **1–3 words at a time**, in the **lower third**, with a small pop.
  Generate them with `tools/subs.py` (Inter ExtraBold) and burn them in with `tools/finish.sh`.
- When explaining a mechanism, show it with **3D visual metaphors and overlays** (cut-aways, arrows, oversized props, x-ray
  views, on-screen diagrams built in 3D) rather than talking heads.

---

## Rule 6 — Mandatory pre-render visual audit

Before rendering the final MP4:
1. Render a still **every 2 seconds** of the timeline (`tools/render-frames.mjs` with a frame list such as `0,60,120,...`) and build a
   sheet with `tools/audit_sheet.py`.
2. **Spawn isolated sub-agents** to audit them, **splitting file ownership** so they never overwrite each other — e.g. agent A owns
   frames 0–N/2 and writes `audit/a.md`, agent B owns N/2–N and writes `audit/b.md`; only the main agent edits scene code.
3. Each agent checks: **zero camera clipping** (no camera inside walls, trees, props), **no floating props or characters** (feet and
   bases touch the ground), **clear character shadows** matching the other shadows' angle, **intact ink outlines**, **proper
   background blur**, the night-blue switch on the "You see" frame, subtitles in the lower third.
4. Fix every finding, re-render the affected stills, and only then render the full frame sequence.

---

## Workflow (every video)

1. **Topic → script** (Rule 2). Show the script with word count; get approval or a voiceover.
2. **Voiceover** → `python3 tools/timing.py voice.mp3 script.txt` → `work/phrases.json` (phrase times; find the "You see" frame).
3. **Shot plan** (`work/PLAN.md`): one continuous camera path (Rule 3), cast + expressions per beat, lighting switch frame (Rule 4),
   visual metaphors for the explanation (Rule 5).
4. **Scene code**: a page that builds the world from the modules and exposes `window.renderFrame(f)` and `window.ready`
   (see `examples/city.js` for setup; `remotion/` for a Remotion variant). Vertical Shorts are 1080×1920, 30 fps.
5. **Audit** (Rule 6).
6. **Render**: `node tools/render-frames.mjs scene.html frames "0-<N-1>"` (run 2 copies on split ranges to go faster; `RESUME=1`).
7. **Audio**: music + SFX stems, then `python3 tools/mix.py voice.mp3 music.wav sfx.wav` (music and SFX at 50% of the voice level).
8. **Subtitles**: `python3 tools/subs.py voice.mp3 work/phrases.json work/subs.ass 1080 1920 3`.
9. **Finish**: `bash tools/finish.sh "Title"` → `out/video.mp4` (−14 LUFS, subtitles burned in, freeze/black QA).

## Environment notes
- Needs Node 18+, Python 3 with numpy + Pillow, ffmpeg (with libass), Playwright Chromium. Software WebGL works:
  Chromium flags `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; Remotion `--gl=swangle`.
- In sandboxes without Remotion's own browser download, pass `--browser-executable=<chrome-headless-shell>`.
- Rendering at 1080×1920 in software takes about 1.5–3 s per frame.
