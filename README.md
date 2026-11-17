# cartoon-shorts

A reusable Three.js asset library for animated Shorts: flat 2D characters standing in a lit 3D world.

## Step 1 — character builder (`lib/characters.js`)

```js
import { createCharacter } from './lib/characters.js';
const c = createCharacter({ outfit: 'suit', hair: 'sidepart', expression: 'smug', gesture: 'hips',
  palette: { skin: '#e2a982', hair: '#8f8f98', top: '#2c3e6b', bottom: '#2c3e6b', accent: '#d8343b' } });
scene.add(c.group);          // feet at y = 0
c.setExpression('shocked');  // neutral | shocked | nervous | smug | angry | laughing
c.setArm('right', 1.2, 0.4); // shoulder raise, elbow bend (radians)
c.update(seconds);           // idle breathing + blinking
c.faceCamera(camera);        // yaw-only billboard
```

- Outfits: `casual`, `suit`, `uniform`, `historical` (`era: 'roman' | 'victorian'`)
- Hair: bald, short, sidepart, spiky, curly, afro, bun, ponytail, long, bob · Headwear: cap, beanie, tophat, helmet, laurel
- Extras: glasses, beard, mustache · Gestures: rest, wave, point, shrug, hips, armsUp, think, present, fists, belly
- Fixed proportions: 3.5 heads tall (head 1, neck 0.1, torso 1.2, legs 1.2), 12 mm ink line on every part

## Studio lineup

```bash
npm install
node tools/shot.mjs studio/lineup.html out/lineup.png
```

Needs Playwright with Chromium (software WebGL is fine).
