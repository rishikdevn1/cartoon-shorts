# viral-3d-shorts

Approved asset library + rulebook for animated Shorts: flat 2D cel-shaded characters standing in a lit, ink-outlined 3D world.
Read `SKILL.md` first — it is the rulebook every video follows.

```bash
npm install                      # three, remotion, @remotion/three, react
npx playwright install chromium  # only if Chromium is not already available
npm run showcase                 # reproduces reference/city-showcase-v2.png
npm run showcase:night           # the "You see" night-blue look
npm run lineup                   # reproduces the character lineups
```

| File | What it is | Status |
|---|---|---|
| `lib/characters.js` | `createCharacter()` — 2D characters, 8 expressions, poses, props, shadow twin | locked |
| `lib/buildings.js` | `createBuilding()` — 5 architectural styles with real depth | locked |
| `lib/scenery.js` | `createScenery()` + trees, bushes, roads, sidewalks, street props | locked |
| `lib/lightingAndShaders.js` | ink + grade + bloom + DOF pipeline, golden-hour sky, `createLightingRig()` (golden / night) | locked |
| `lib/textures.js` | procedural colour + normal maps used by the modules | support |
| `lib/cast.js` | 11 approved character presets | support |
| `lib/studio.js` | neutral studio set for lineups | support |
| `examples/` | the approved city showcase and character lineups | reference |
| `remotion/` | Remotion + `@remotion/three` composition template | template |
| `tools/` | stills, frame rendering, timing, subtitles, mix, audit sheet, finish | pipeline |
| `reference/` | the approved reference renders | reference |
