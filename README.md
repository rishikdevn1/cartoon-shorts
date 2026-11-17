# cartoon-shorts

A reusable Three.js + Remotion asset library for animated Shorts: flat 2D characters standing in a lit 3D world.
Every future Short builds its cast from the same `createCharacter()` so the look stays consistent across stories, eras and settings.

## Character builder — `lib/characters.js`

```js
import { createCharacter } from './lib/characters.js';
const c = createCharacter({
  outfit: 'suit', hair: 'sidepart', glasses: true,
  expression: 'scheming', pose: 'holding_prop', prop: 'money',
  palette: { skin: '#e8ad84', hair: '#94949e', top: '#2b4c9b', bottom: '#2b4c9b', accent: '#e2333b' },
});
scene.add(c.group);                  // feet at y = 0 (sitting: origin = seat surface). No pedestal by default.
c.setExpression('furious_steam');    // see expressions below (old names neutral/smug/angry/shocked/nervous still map)
c.setPose('sitting_dangling_legs');  // standing | sitting_dangling_legs | leaning_on_cane | holding_prop
c.setProp('coffee');                 // newspaper | wrench | money | burger | coffee | cane
c.setGesture('wave');                // or c.setArm('right', shoulder, elbow)
c.faceCamera(camera); c.faceLight(sunLight);
c.update(seconds);                   // breathing, blinking, dangling legs, steam puffs, hat launch
```

**Expressions:** `deadpan` (default) · `smug_happy` · `gritted_teeth` · `bug_eyed_shock` (with `hatLaunch: true` the hat flies up) ·
`nervous_sweat` · `furious_steam` (purple-red face + animated steam puffs) · `scheming` · `laughing`.

| Option | Values |
|---|---|
| `outfit` / `type` | `casual`: tee, hoodie, cardigan · `suit` · `uniform`: police, doctor, chef · `historical`: roman, victorian, medieval |
| `hair` | bald, short, sidepart, spiky, curly, afro, bun, ponytail, long, bob |
| `headwear` | none, cap, beanie, tophat, helmet, laurel, chefhat, crown (on its own layer, so it can launch) |
| extras | `glasses`, `beard`, `mustache`, `lashes`, `height`, `hatLaunch`, `showPedestal` (default false) |
| `palette` | skin, hair, top, bottom, shoes, accent, eyes, coat, shirt, hat, badge, beard, brow |

**Look rules (enforced):** 3.5 heads tall, round head, thin flexible black ink stick limbs with rounded hands and shoes;
colour, cel shading and detail live on faces, hair, hats and torso clothing. No cheek blush.
Dark skin tones automatically get a light rim around brows, eyes and mouth plus brighter eye whites, so expressions read on phones.
Faces are never white: `PALETTES.skin` spans seven realistic tones.

**How it sits in 3D:** every part is an alpha-tested canvas card with a lit material, so it catches the key light.
An invisible copy of the rig faces the light and casts the shadow, so shadows always show the full pose.

`lib/cast.js` has 11 ready-made characters. `lib/studio.js` builds the studio set and lights.

## Stage 2 — buildings, scenery, post

```js
import { createBuilding } from './lib/buildings.js';
import { createScenery, createTree, createStreetlight, createBench, createTrafficSignal } from './lib/scenery.js';
import { createPipeline, createSky } from './lib/post.js';

const cafe = createBuilding({ style: 'cafe-storefront', floors: 3, width: 8.5, sign: 'CAFÉ LUNA' });
const street = createScenery({ preset: 'city-park-edge' });      // road, sidewalk slabs, curb, park, trees, bushes, rocks
createSky(renderer, scene, { sunDir });                           // golden-hour sky + environment reflections
const post = createPipeline(renderer, scene, camera, { width, height });
post.render({ focus: 9, farBlur: 16, nearBlur: 5 });              // ink edges -> grade -> bloom -> depth of field
```

- **Buildings** (`lib/buildings.js`): `modern-glass`, `brick-apartment`, `cafe-storefront`, `concrete-midrise`, `suburban-house`.
  Options: `floors`, `width`, `depth`, `palette`, `sign`, `seed`. Facades are real wall pieces, so windows are recessed openings with
  frames, mullions, sills and lintels. Roofs carry parapets, AC units, vents, water tanks and antennas. Brick apartments get fire escapes;
  the café gets a striped awning, a sign board, a blade sign and a lit interior.
- **Scenery** (`lib/scenery.js`): trees built from trunks, branch limbs and foliage clumps covered in leaf cards; bushes; instanced
  grass tufts; 3D rocks and pebbles; cracked asphalt with lane lines, a crosswalk and a manhole; sidewalk slabs with real expansion-joint
  gaps; curbs and gutters; streetlights, benches, traffic signals, hydrants, trash cans.
- **Textures** (`lib/textures.js`): every surface is painted in code with a matching normal map (brick mortar, concrete grain, asphalt
  aggregate and cracks, wood grain, bark grooves, siding, shingles, stucco, lawn, metal grille).
- **Post** (`lib/post.js`): ink lines from depth jumps and creases, then the golden-hour grade (warm highlights, cool indigo shadows,
  lifted blacks), bloom, and finally depth of field as a separate pass, so background blur never erases foreground ink.
  Mark meshes with `userData.nd = 'card' | 'silhouette' | 'hide'` to control how they are inked.

```bash
node tools/shot.mjs studio/city.html out/city.png   # 1920x1080 Stage 2 showcase
```

## Studio lineups

```bash
npm install
npm run lineup        # out/lineup_a.png and out/lineup_b.png (1920x1080)
```

## Remotion

```bash
npm run studio        # live preview
npm run render        # out/showcase.mp4 (CharacterShowcase, 1920x1080, 7 s)
```

`remotion/CharacterShowcase.jsx` drives the same rigs per frame with `useCurrentFrame()` inside `<ThreeCanvas>`.
There is also a `CharacterShowcaseVertical` (1080x1920) composition for Shorts.
Without a GPU, render with `--gl=swangle` (already in the npm scripts).
In a sandbox without Remotion's own browser download, add `--browser-executable=<path to chrome-headless-shell>`.
