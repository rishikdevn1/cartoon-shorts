# cartoon-shorts

A reusable Three.js + Remotion asset library for animated Shorts: flat 2D characters standing in a lit 3D world.
Every future Short builds its cast from the same `createCharacter()` so the look stays consistent across stories, eras and settings.

## Character builder — `lib/characters.js`

```js
import { createCharacter } from './lib/characters.js';
const c = createCharacter({
  outfit: 'uniform', type: 'doctor', hair: 'bun', glasses: true, lashes: true,
  expression: 'smug', gesture: 'think',
  palette: { skin: '#86522d', hair: '#1e1716', top: '#4aa3c9', bottom: '#2e3a52', accent: '#2f6fd6', coat: '#f7f7f4' },
});
scene.add(c.group);          // feet at y = 0
c.setExpression('shocked');  // neutral | shocked | nervous | smug | angry | laughing
c.setArm('right', 1.2, 0.4); // shoulder raise, elbow bend (radians)
c.setGesture('wave');        // rest wave point shrug hips armsUp think present fists belly facepalm cheer
c.faceCamera(camera);        // visible card turns to the camera (yaw only)
c.faceLight(sunLight);       // hidden shadow twin turns to the light -> full silhouette shadows
c.update(seconds);           // idle breathing, head sway, blinking — deterministic per time
```

| Option | Values |
|---|---|
| `outfit` / `type` | `casual`: tee, hoodie, cardigan · `suit`: classic · `uniform`: police, doctor, chef · `historical`: roman, victorian, medieval |
| `hair` | bald, short, sidepart, spiky, curly, afro, bun, ponytail, long, bob |
| `headwear` | none, cap, beanie, tophat, helmet, laurel, chefhat, crown |
| extras | `glasses`, `beard`, `mustache`, `lashes`, `height` (proportions stay 3.5 heads) |
| `palette` | skin, hair, top, bottom, shoes, accent, eyes, coat, shirt, hat, badge, beard, brow |

**Look rules (enforced):** 3.5 heads tall (head 1, neck 0.1, torso 1.2, legs 1.2), round head, thin limbs,
two-tone cel shading lit from the left, 13 mm outer ink line and 7.5 mm inner lines on every part.

**How it sits in 3D:** each body part is an alpha-tested canvas card with a lit material, so it catches the scene's key light.
A second, invisible copy of the rig faces the light and casts the shadow, so shadows always show the full pose.

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
