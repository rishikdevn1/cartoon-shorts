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
