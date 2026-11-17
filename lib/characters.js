// characters.js — reusable flat 2D characters rigged to stand in a lit 3D world.
//
//   import { createCharacter } from './characters.js';
//   const c = createCharacter({ outfit: 'suit', expression: 'scheming', pose: 'holding_prop', prop: 'money' });
//   scene.add(c.group);                 // feet at y = 0 (for sitting poses, the origin is the seat surface)
//   c.setExpression('furious_steam');   // deadpan smug_happy gritted_teeth bug_eyed_shock nervous_sweat furious_steam scheming laughing
//   c.setPose('sitting_dangling_legs'); // standing | sitting_dangling_legs | leaning_on_cane | holding_prop
//   c.setProp('coffee');                // newspaper wrench money burger coffee cane
//   c.setArm('right', 1.2, 0.4);        // shoulder raise, elbow bend (radians) — or c.setGesture('wave')
//   c.faceCamera(camera);               // the visible card turns to the camera (yaw only)
//   c.faceLight(sunLight);              // the hidden shadow twin turns to the light -> full-shape shadows
//   c.update(seconds);                  // breathing, blinking, dangling legs, steam puffs, hat launch
//
// Look: thin, flexible black ink stick limbs with rounded hands and shoes; colour, cel shading and detail
// live on the head, hair, hats and torso clothing. 3.5 heads tall, round head, realistic skin tones.
// Each part is an alpha-tested canvas card with a lit material (catches the key light); an invisible copy
// of the rig faces the light and casts the shadow, so shadows show the full pose from any camera.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
export const INK = '#140f1a';
export const OUTLINE = 0.013;              // outer ink line (metres) — identical on every part
export const INNER = 0.0075;               // inner detail line
const PPM = 1000;                           // texture pixels per metre on every part
const SHADE = 'rgba(52,22,86,0.26)';        // cel shadow tone (multiplied over the base colour)
const LIGHT = 'rgba(255,255,255,0.22)';
export const EXPRESSIONS = ['deadpan', 'smug_happy', 'gritted_teeth', 'bug_eyed_shock', 'nervous_sweat', 'furious_steam', 'scheming', 'laughing'];
export const EXPRESSION_ALIASES = { neutral: 'deadpan', smug: 'smug_happy', angry: 'furious_steam', shocked: 'bug_eyed_shock', nervous: 'nervous_sweat' };
export const OUTFITS = {
  casual: ['tee', 'hoodie', 'cardigan'],
  suit: ['classic'],
  uniform: ['police', 'doctor', 'chef'],
  historical: ['roman', 'victorian', 'medieval'],
};
export const HAIRSTYLES = ['bald', 'short', 'sidepart', 'spiky', 'curly', 'afro', 'bun', 'ponytail', 'long', 'bob'];
export const HEADWEAR = ['none', 'cap', 'beanie', 'tophat', 'helmet', 'laurel', 'chefhat', 'crown'];
export const PROPS = ['none', 'newspaper', 'wrench', 'money', 'burger', 'coffee', 'cane'];
export const POSES = ['standing', 'sitting_dangling_legs', 'leaning_on_cane', 'holding_prop'];
// realistic, diverse skin tones (light -> deep). Faces are never pure white.
export const PALETTES = {
  skin: ['#f6d3b8', '#eebf98', '#d9a072', '#c08250', '#9a6038', '#74452a', '#553220'],
  hair: ['#1e1716', '#4a2c1a', '#8a5a2f', '#e0b25a', '#c2471d', '#c9c9cf', '#f4f4f4'],
};
const PLAN = { head: 1.0, neck: 0.1, torso: 1.2, leg: 1.2 };   // = 3.5 heads

export const GESTURES = {
  rest: { left: [0.12, 0.08], right: [0.12, 0.08] },
  wave: { left: [0.12, 0.08], right: [2.55, 0.55] },
  point: { left: [0.12, 0.08], right: [1.5, 0.0] },
  shrug: { left: [0.95, -1.25], right: [0.95, -1.25] },
  hips: { left: [0.75, 1.75], right: [0.75, 1.75] },
  armsUp: { left: [2.7, 0.25], right: [2.7, 0.25] },
  think: { left: [0.15, 0.1], right: [0.35, 2.55] },
  present: { left: [0.12, 0.08], right: [0.9, -0.35] },
  fists: { left: [0.4, 2.2], right: [0.4, 2.2] },
  belly: { left: [0.35, 1.55], right: [0.35, 1.55] },
  facepalm: { left: [0.12, 0.08], right: [0.45, 2.75] },
  cheer: { left: [2.35, -0.35], right: [2.35, -0.35] },
  // used by poses
  cane: { left: [0.12, 0.08], right: [0.42, -0.22] },
  holdOne: { left: [0.12, 0.08], right: [0.5, 1.75] },
  holdTwo: { left: [0.42, 1.8], right: [0.42, 1.8] },
  seated: { left: [0.32, 0.55], right: [0.32, 0.55] },
};

// ---------------------------------------------------------------- canvas helpers
export function shade(hex, k) {
  const c = new THREE.Color(hex); const h = {}; c.getHSL(h);
  c.setHSL(h.h, Math.min(1, h.s), Math.max(0, Math.min(1, h.l + k))); return '#' + c.getHexString();
}
function ink(g, w = OUTLINE) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
function fillInk(g, col, w = OUTLINE) { g.fillStyle = col; g.fill(); ink(g, w); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
function capsule(g, x, y0, y1, r) { g.beginPath(); g.moveTo(x - r, y0); g.lineTo(x - r, y1); g.arc(x, y1, r, Math.PI, 0, true); g.lineTo(x + r, y0); g.arc(x, y0, r, 0, Math.PI, true); g.closePath(); }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// fill a shape, add a hard-edged cel shadow + rim highlight inside it, then ink the outline
function cel(g, path, col, { shadeFn, lightFn, w = OUTLINE } = {}) {
  path(); g.fillStyle = col; g.fill();
  g.save(); path(); g.clip();
  if (shadeFn) { g.fillStyle = SHADE; shadeFn(); }
  if (lightFn) { g.fillStyle = LIGHT; lightFn(); }
  g.restore();
  path(); ink(g, w);
}
const limbShade = (r, y0, y1) => () => { g_.beginPath(); g_.rect(r * 0.18, y0 - r * 2, r * 3, y1 - y0 + r * 4); g_.fill(); };
let g_ = null; // current context for small shade lambdas

// A card: canvas drawn in metres (y down) with the pivot at (ax, ay). Returns texture + geometry.
function makeCard(wM, hM, ax, ay) {
  const c = document.createElement('canvas'); c.width = Math.ceil(wM * PPM); c.height = Math.ceil(hM * PPM);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  const geo = new THREE.PlaneGeometry(wM, hM); geo.translate(wM / 2 - ax, -(hM / 2 - ay), 0);
  const draw = (fn) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(PPM, 0, 0, PPM, ax * PPM, ay * PPM); g_ = g; fn(g); tex.needsUpdate = true; };
  return { tex, geo, draw, canvas: c };
}

// ---------------------------------------------------------------- head (also used for 2D thumbnails)
export const resolveExpression = (ex) => EXPRESSION_ALIASES[ex] || ex;
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const isDark = (hex) => lum(hex) < 0.32;
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// Draws the head centred at (0,0) with radius R (caller's units); ink width stays constant.
// opts: skipBack (back hair drawn on its own card), noHat (hat drawn on its own card),
//       hatLift (thumbnails: lift the hat), steam (thumbnails: draw static steam puffs)
export function drawHead(g, o, expression = 'deadpan', blink = false, R = 0.25, opts = {}) {
  const ex = resolveExpression(expression);
  const s = R / 0.25; g.save(); g.scale(s, s); g_ = g;
  const lw = OUTLINE / s, iw = INNER / s;
  const P = o.palette;
  if (opts.steam && ex === 'furious_steam') { g.save(); g.scale(0.78, 0.78); drawSteam(g, 0.5, iw); g.restore(); }
  if (!(opts.skipBack && BACK_LAYER.includes(o.hair))) drawHairBack(g, o, lw, iw);
  const skin = ex === 'furious_steam' ? mix(P.skin, '#d81b60', isDark(P.skin) ? 0.42 : 0.55) : P.skin;
  for (const sx of [-1, 1]) { ell(g, sx * 0.246, 0.035, 0.046, 0.062); fillInk(g, skin, lw); g.beginPath(); g.arc(sx * 0.246, 0.035, 0.024, sx < 0 ? -1.2 : Math.PI - 1.9, sx < 0 ? 1.9 : Math.PI + 1.2); g.lineWidth = iw; g.strokeStyle = shade(skin, -0.25); g.stroke(); }
  const head = () => { g.beginPath(); g.arc(0, 0, 0.25, 0, Math.PI * 2); };
  head(); g.fillStyle = skin; g.fill();
  g.save(); head(); g.clip();
  if (ex === 'furious_steam') { const gr = g.createLinearGradient(0, -0.25, 0, 0.1); gr.addColorStop(0, 'rgba(120,0,60,0.45)'); gr.addColorStop(1, 'rgba(120,0,60,0)'); g.fillStyle = gr; g.fillRect(-0.3, -0.3, 0.6, 0.45); }
  g.fillStyle = SHADE; g.beginPath(); g.arc(0, 0, 0.26, 0, Math.PI * 2); g.arc(-0.045, -0.04, 0.262, 0, Math.PI * 2, true); g.fill('evenodd');
  g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -0.12, -0.13, 0.07, 0.035, -0.6); g.fill();
  g.restore();
  head(); ink(g, lw);
  drawFace(g, o, ex, blink, lw, iw, skin);
  drawHairFront(g, o, lw, iw);
  if (!opts.noHat) { g.save(); g.translate(0, -(opts.hatLift || 0)); g.rotate((opts.hatLift || 0) * 0.5); drawHeadwear(g, o, lw, iw); g.restore(); }
  g.restore();
}

// white cartoon steam puffs (k = 0..1 animation phase)
export function drawSteam(g, k, iw) {
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = (k + i / 3) % 1, x = sx * (0.3 + p * 0.22), y = -0.08 - p * 0.18, r = 0.035 + p * 0.05;
    g.globalAlpha = 1 - p * 0.6;
    g.beginPath(); for (let a = 0; a < 5; a++) { const t = a / 5 * Math.PI * 2; g.moveTo(x + Math.cos(t) * r * 0.6 + r * 0.45, y + Math.sin(t) * r * 0.5); g.arc(x + Math.cos(t) * r * 0.6, y + Math.sin(t) * r * 0.5, r * 0.45, 0, Math.PI * 2); }
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = iw * 1.1; g.strokeStyle = INK; g.stroke();
  }
  g.globalAlpha = 1;
}

function drawFace(g, o, ex, blink, lw, iw, skin) {
  const P = o.palette; const ey = -0.005, ex0 = 0.094;
  const dark = isDark(P.skin);
  const sclera = dark ? '#ffffff' : '#fbf9f4';
  const eyeLine = iw * (dark ? 1.6 : 1.2);
  const rimCol = mix(skin, '#ffffff', 0.55);        // light halo that separates dark features from dark skin
  const brow = P.brow || shade(P.hair === '#f4f4f4' || P.hair === '#c9c9cf' ? '#8a8a92' : P.hair, -0.06);
  // ---- eyes
  const eyeOpen = (x, rx, ry) => { if (dark) { ell(g, x, ey, rx + iw * 1.2, ry + iw * 1.2); g.fillStyle = rimCol; g.fill(); } ell(g, x, ey, rx, ry); g.fillStyle = sclera; g.fill(); g.save(); ell(g, x, ey, rx, ry); g.clip(); g.fillStyle = 'rgba(80,60,140,0.12)'; g.fillRect(x - rx, ey - ry, 2 * rx, ry * 0.5); g.restore(); };
  const pupil = (x, y, r, withIris = true) => {
    if (withIris) { g.fillStyle = P.eyes || '#3b2a20'; ell(g, x, y, r, r * 1.08); g.fill(); g.fillStyle = INK; ell(g, x, y + r * 0.05, r * 0.55, r * 0.6); g.fill(); }
    else { g.fillStyle = INK; ell(g, x, y, r, r); g.fill(); }
    g.fillStyle = '#ffffff'; ell(g, x + r * 0.4, y - r * 0.3, r * 0.3, r * 0.3); g.fill();
  };
  const lid = (x, rx, ry, topY, slant = 0) => { // cover the eye above a (slanted) lid line
    g.save(); ell(g, x, ey, rx + 0.003, ry + 0.003); g.clip(); g.fillStyle = skin;
    g.beginPath(); g.moveTo(x - rx - 0.01, ey - ry - 0.02); g.lineTo(x + rx + 0.01, ey - ry - 0.02); g.lineTo(x + rx + 0.01, topY + slant); g.lineTo(x - rx - 0.01, topY - slant); g.closePath(); g.fill(); g.restore();
    g.beginPath(); g.moveTo(x - rx - 0.004, topY - slant * 1.1); g.lineTo(x + rx + 0.004, topY + slant * 1.1); ink(g, lw * 1.05);
  };
  const arcEye = (x, up = true, w = 0.042) => { g.beginPath(); g.moveTo(x - w, ey + (up ? 0.014 : -0.008)); g.quadraticCurveTo(x, ey + (up ? -0.05 : 0.03), x + w, ey + (up ? 0.014 : -0.008)); if (dark) { g.lineWidth = lw * 1.1 + iw * 2.4; g.strokeStyle = rimCol; g.lineCap = 'round'; g.stroke(); } ink(g, lw * 1.1); };
  const blinkEye = (x) => { g.beginPath(); g.moveTo(x - 0.04, ey + 0.004); g.quadraticCurveTo(x, ey + 0.024, x + 0.04, ey + 0.004); ink(g, lw * 1.05); };
  for (const sx of [-1, 1]) {
    const x = sx * ex0;
    if (ex === 'smug_happy' || ex === 'laughing') {
      if (ex === 'laughing') { // squeezed shut, with a joy tear
        g.beginPath(); g.moveTo(x - 0.045, ey + 0.01); g.quadraticCurveTo(x, ey - 0.05, x + 0.045, ey + 0.01); g.moveTo(x + sx * 0.045, ey + 0.01); g.lineTo(x + sx * 0.058, ey + 0.02);
        if (dark) { g.lineWidth = lw * 1.2 + iw * 2.4; g.strokeStyle = rimCol; g.lineCap = 'round'; g.stroke(); } ink(g, lw * 1.2);
        g.beginPath(); g.moveTo(x + sx * 0.05, ey + 0.025); g.quadraticCurveTo(x + sx * 0.07, ey + 0.06, x + sx * 0.055, ey + 0.07); g.quadraticCurveTo(x + sx * 0.04, ey + 0.055, x + sx * 0.05, ey + 0.025); fillInk(g, '#9bdcff', iw);
      } else arcEye(x, true, 0.044);
      continue;
    }
    if (blink) { blinkEye(x); continue; }
    if (ex === 'deadpan') { const rx = 0.044, ry = 0.05; eyeOpen(x, rx, ry); pupil(x + 0.02, ey + 0.016, 0.019); ell(g, x, ey, rx, ry); ink(g, eyeLine); lid(x, rx, ry, ey - 0.002); continue; }
    if (ex === 'scheming') { const rx = 0.046, ry = 0.046; eyeOpen(x, rx, ry); pupil(x + 0.026, ey + 0.012, 0.017); ell(g, x, ey, rx, ry); ink(g, eyeLine); lid(x, rx, ry, ey + 0.002, sx < 0 ? 0.012 : -0.012); continue; }
    if (ex === 'gritted_teeth' || ex === 'furious_steam') { const rx = 0.043, ry = 0.044; eyeOpen(x, rx, ry); pupil(x, ey + 0.008, ex === 'furious_steam' ? 0.013 : 0.018, ex !== 'furious_steam'); ell(g, x, ey, rx, ry); ink(g, eyeLine); lid(x, rx, ry, ey - 0.012, sx < 0 ? -0.018 : 0.018); continue; }
    if (ex === 'bug_eyed_shock') { const rx = 0.066, ry = 0.08; eyeOpen(x, rx, ry); pupil(x, ey + 0.004, 0.008, false); ell(g, x, ey, rx, ry); ink(g, eyeLine * 1.1); continue; }
    if (ex === 'nervous_sweat') { const rx = 0.05, ry = 0.06; eyeOpen(x, rx, ry); pupil(x - 0.006, ey - 0.012, 0.016); ell(g, x, ey, rx, ry); ink(g, eyeLine); continue; }
  }
  if (o.lashes && !['smug_happy', 'laughing'].includes(ex)) for (const sx of [-1, 1]) { const x = sx * ex0; g.beginPath(); g.moveTo(x + sx * 0.035, ey - 0.035); g.lineTo(x + sx * 0.058, ey - 0.052); g.moveTo(x + sx * 0.045, ey - 0.018); g.lineTo(x + sx * 0.064, ey - 0.026); ink(g, iw * 1.3); }
  if (o.glasses) { for (const sx of [-1, 1]) { rrect(g, sx * ex0 - 0.066, ey - 0.056, 0.132, 0.104, 0.036); g.fillStyle = 'rgba(200,230,255,0.12)'; g.fill(); ink(g, lw * 0.85); } g.beginPath(); g.moveTo(-0.03, ey - 0.012); g.quadraticCurveTo(0, ey - 0.026, 0.03, ey - 0.012); ink(g, lw * 0.85); }
  // ---- brows: [left angle, right angle, left lift, right lift]
  const B = { deadpan: [0, 0, -0.008, -0.008], smug_happy: [0.05, -0.15, 0.02, 0.04], gritted_teeth: [0.5, -0.5, -0.016, -0.016], bug_eyed_shock: [0.08, -0.08, 0.075, 0.075],
    nervous_sweat: [-0.38, 0.38, 0.03, 0.03], furious_steam: [0.62, -0.62, -0.012, -0.012], scheming: [0.42, -0.3, -0.016, 0.045], laughing: [0, 0, 0.026, 0.026] }[ex];
  for (const sx of [-1, 1]) {
    const lift = sx < 0 ? B[2] : B[3];
    g.save(); g.translate(sx * ex0, ey - (ex === 'bug_eyed_shock' ? 0.11 : 0.084) - lift); g.rotate(sx < 0 ? B[0] : B[1]); g.scale(sx, 1);
    g.beginPath(); g.moveTo(-0.038, 0.009); g.quadraticCurveTo(0, -0.018, 0.04, 0.0); g.quadraticCurveTo(0.004, -0.004, -0.038, 0.018); g.closePath();
    if (dark) { g.lineWidth = iw * 3.2; g.strokeStyle = rimCol; g.lineJoin = 'round'; g.stroke(); }
    g.fillStyle = brow; g.fill(); g.lineWidth = iw * 0.9; g.strokeStyle = INK; g.stroke(); g.restore();
  }
  // nose
  g.beginPath(); g.moveTo(-0.004, 0.034); g.quadraticCurveTo(0.022, 0.054, -0.002, 0.066); ink(g, iw * 1.1);
  // beard sits under the mouth
  if (o.beard) { const bc = P.beard || P.hair; g.beginPath(); g.moveTo(-0.18, 0.08); g.quadraticCurveTo(-0.16, 0.26, 0, 0.262); g.quadraticCurveTo(0.16, 0.26, 0.18, 0.08); g.quadraticCurveTo(0.1, 0.168, 0, 0.165); g.quadraticCurveTo(-0.1, 0.168, -0.18, 0.08); g.fillStyle = bc; g.fill(); g.save(); g.clip(); g.fillStyle = SHADE; g.fillRect(0.02, 0, 0.3, 0.3); g.restore(); ink(g, lw); }
  // ---- mouths
  const my = 0.13;
  const mouthRim = () => { if (dark) { g.lineWidth = lw + iw * 2.4; g.strokeStyle = rimCol; g.stroke(); } };
  if (ex === 'deadpan') { g.beginPath(); g.moveTo(-0.05, my); g.lineTo(0.035, my - 0.002); g.lineTo(0.052, my + 0.008); mouthRim(); ink(g, lw); }
  if (ex === 'scheming') { g.beginPath(); g.moveTo(-0.045, my + 0.008); g.quadraticCurveTo(0.01, my + 0.016, 0.06, my - 0.024); mouthRim(); ink(g, lw); g.beginPath(); g.moveTo(0.056, my - 0.03); g.lineTo(0.068, my - 0.014); ink(g, iw); }
  if (ex === 'smug_happy') {
    const p = () => { g.beginPath(); g.moveTo(-0.082, my - 0.02); g.quadraticCurveTo(0, my + 0.0, 0.082, my - 0.02); g.quadraticCurveTo(0.06, my + 0.058, 0, my + 0.06); g.quadraticCurveTo(-0.06, my + 0.058, -0.082, my - 0.02); g.closePath(); };
    p(); g.fillStyle = '#ffffff'; g.fill(); g.save(); p(); g.clip(); g.fillStyle = '#5a1f2e'; g.fillRect(-0.1, my + 0.03, 0.2, 0.05); g.restore();
    g.beginPath(); g.moveTo(-0.07, my + 0.026); g.quadraticCurveTo(0, my + 0.04, 0.07, my + 0.026); ink(g, iw * 0.8);
    p(); mouthRim(); p(); ink(g, lw);
  }
  if (ex === 'gritted_teeth' || ex === 'furious_steam') {
    const w = ex === 'furious_steam' ? 0.07 : 0.066, h = ex === 'furious_steam' ? 0.058 : 0.046;
    rrect(g, -w, my - 0.016, 2 * w, h, 0.016); mouthRim(); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw);
    g.beginPath(); g.moveTo(-w, my - 0.016 + h / 2); g.lineTo(w, my - 0.016 + h / 2);
    for (let k = -2; k <= 2; k++) { g.moveTo(k * w * 0.4, my - 0.016); g.lineTo(k * w * 0.4, my - 0.016 + h); } ink(g, iw * 0.8);
  }
  if (ex === 'bug_eyed_shock') { ell(g, 0, my + 0.03, 0.034, 0.066); mouthRim(); g.fillStyle = '#5a1f2e'; g.fill(); g.save(); ell(g, 0, my + 0.03, 0.034, 0.066); g.clip(); g.fillStyle = '#ff7f8f'; ell(g, 0, my + 0.08, 0.026, 0.022); g.fill(); g.restore(); ell(g, 0, my + 0.03, 0.034, 0.066); ink(g, lw); }
  if (ex === 'nervous_sweat') {
    g.beginPath(); g.moveTo(-0.06, my + 0.016); for (let k = 0; k <= 6; k++) { const x = -0.06 + k * 0.02; g.lineTo(x, my + 0.004 + (k % 2 ? -0.012 : 0.006) + Math.abs(k - 3) * 0.006); } mouthRim(); ink(g, lw);
    // big forehead sweat drop
    const dx = 0.12, dy = -0.15;
    g.beginPath(); g.moveTo(dx, dy - 0.07); g.quadraticCurveTo(dx + 0.05, dy + 0.0, dx + 0.028, dy + 0.025); g.quadraticCurveTo(dx, dy + 0.045, dx - 0.028, dy + 0.025); g.quadraticCurveTo(dx - 0.05, dy + 0.0, dx, dy - 0.07); fillInk(g, '#5ec2ff', iw * 1.3);
    g.fillStyle = '#ffffff'; ell(g, dx - 0.012, dy + 0.0, 0.007, 0.014, -0.3); g.fill();
  }
  if (ex === 'laughing') {
    const path = () => { g.beginPath(); g.moveTo(-0.08, my - 0.024); g.lineTo(0.08, my - 0.024); g.quadraticCurveTo(0.075, my + 0.09, 0, my + 0.094); g.quadraticCurveTo(-0.075, my + 0.09, -0.08, my - 0.024); g.closePath(); };
    path(); mouthRim(); g.fillStyle = '#5a1f2e'; g.fill();
    g.save(); path(); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(-0.09, my - 0.03, 0.18, 0.032); g.fillStyle = '#ff7f8f'; ell(g, 0, my + 0.09, 0.048, 0.034); g.fill(); g.restore();
    path(); ink(g, lw);
  }
  // mustache sits over the top lip — drawn last so it shows on every expression
  if (o.mustache) { const bc = P.beard || P.hair; g.beginPath(); g.moveTo(0, 0.083); g.quadraticCurveTo(-0.058, 0.064, -0.088, 0.106); g.quadraticCurveTo(-0.044, 0.11, 0, 0.097); g.quadraticCurveTo(0.044, 0.11, 0.088, 0.106); g.quadraticCurveTo(0.058, 0.064, 0, 0.083); fillInk(g, bc, iw * 1.3); g.fillStyle = 'rgba(255,255,255,0.25)'; ell(g, -0.04, 0.086, 0.02, 0.005, -0.3); g.fill(); }
}


const BACK_LAYER = ['long', 'bob', 'ponytail'];   // these hang behind the body, so they get their own card
function hairShade(g, H, iw) { g.save(); g.clip(); g.fillStyle = SHADE; g.fillRect(0.04, -0.5, 0.5, 1); g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(-0.1, -0.2, 0.07, 0.016, -0.4, 0, Math.PI * 2); g.fill(); g.restore(); }
function drawHairBack(g, o, lw, iw) {
  const H = shade(o.palette.hair, -0.03), st = o.hair;
  const done = () => { g.fillStyle = H; g.fill(); hairShade(g, H, iw); ink(g, lw); };
  if (st === 'long') { g.beginPath(); g.moveTo(-0.27, -0.05); g.quadraticCurveTo(-0.34, 0.25, -0.25, 0.44); g.quadraticCurveTo(0, 0.4, 0.25, 0.44); g.quadraticCurveTo(0.34, 0.25, 0.27, -0.05); g.closePath(); done(); }
  if (st === 'bob') { g.beginPath(); g.moveTo(-0.29, -0.05); g.quadraticCurveTo(-0.32, 0.16, -0.25, 0.21); g.lineTo(0.25, 0.21); g.quadraticCurveTo(0.32, 0.16, 0.29, -0.05); g.closePath(); done(); }
  if (st === 'ponytail') { g.beginPath(); g.moveTo(0.17, -0.2); g.quadraticCurveTo(0.44, -0.2, 0.37, 0.13); g.quadraticCurveTo(0.34, 0.25, 0.27, 0.28); g.quadraticCurveTo(0.32, 0.05, 0.2, -0.05); g.closePath(); done(); }
  if (st === 'bun') { ell(g, 0, -0.275, 0.095, 0.08); done(); }
  if (st === 'afro') { g.beginPath(); for (let i = 0; i <= 18; i++) { const a = Math.PI * (0.9 + 1.2 * i / 18); const r = 0.335 + (i % 2) * 0.028; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.04) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r - 0.04); } g.closePath(); done(); }
  if (st === 'curly') { for (let i = 0; i < 11; i++) { const a = Math.PI * (1.0 + i / 10); ell(g, Math.cos(a) * 0.256, Math.sin(a) * 0.256 - 0.005, 0.066, 0.066); done(); } }
}
function drawHairFront(g, o, lw, iw) {
  const H = o.palette.hair, st = o.hair;
  if (st === 'bald') return;
  const path = () => {
    g.beginPath();
    if (st === 'sidepart') { g.moveTo(-0.275, 0.0); g.quadraticCurveTo(-0.275, -0.31, 0.02, -0.3); g.quadraticCurveTo(0.275, -0.3, 0.275, 0.0); g.quadraticCurveTo(0.2, -0.13, 0.06, -0.15); g.quadraticCurveTo(-0.12, -0.2, -0.275, 0.0); return; }
    if (st === 'spiky') { g.moveTo(-0.275, -0.02); for (let i = 0; i <= 8; i++) { const x = -0.26 + i * 0.065; g.lineTo(x, i % 2 ? -0.38 + Math.abs(i - 4) * 0.02 : -0.17); } g.lineTo(0.275, -0.02); g.quadraticCurveTo(0, -0.14, -0.275, -0.02); return; }
    g.moveTo(-0.275, -0.02); g.quadraticCurveTo(-0.255, -0.31, 0, -0.3); g.quadraticCurveTo(0.255, -0.31, 0.275, -0.02);
    if (st === 'long' || st === 'bob' || st === 'ponytail' || st === 'bun') { g.quadraticCurveTo(0.13, -0.17, 0.02, -0.18); g.quadraticCurveTo(-0.1, -0.12, -0.275, -0.02); }
    else { g.quadraticCurveTo(0.18, -0.12, 0.085, -0.135); g.quadraticCurveTo(0, -0.1, -0.085, -0.135); g.quadraticCurveTo(-0.18, -0.12, -0.275, -0.02); }
  };
  path(); g.fillStyle = H; g.fill(); g.save(); path(); hairShade(g, H, iw); g.restore(); path(); ink(g, lw);
  if (st === 'curly' || st === 'afro') { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = iw; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(-0.15 + i * 0.043, -0.21 + Math.sin(i * 1.7) * 0.03, 0.014, 0, Math.PI * 1.5); g.stroke(); } }
  if (st === 'sidepart') { g.beginPath(); g.moveTo(-0.07, -0.28); g.quadraticCurveTo(-0.04, -0.21, -0.06, -0.17); ink(g, iw); }
}
function drawHeadwear(g, o, lw, iw) {
  const A = o.palette.hat || o.palette.accent || '#2f4f8f';
  const celFill = (col) => { g.fillStyle = col; g.fill(); g.save(); g.clip(); g.fillStyle = SHADE; g.fillRect(0.05, -1, 1, 2); g.restore(); ink(g, lw); };
  if (o.headwear === 'cap') {
    g.beginPath(); g.moveTo(-0.265, -0.06); g.quadraticCurveTo(-0.265, -0.34, 0, -0.34); g.quadraticCurveTo(0.265, -0.34, 0.265, -0.06); g.closePath(); celFill(A);
    rrect(g, -0.3, -0.095, 0.6, 0.06, 0.022); celFill(shade(A, -0.1));
    ell(g, 0, -0.2, 0.046, 0.042); fillInk(g, o.palette.badge || '#f2c23c', iw * 1.4);
  }
  if (o.headwear === 'beanie') { g.beginPath(); g.moveTo(-0.27, -0.04); g.quadraticCurveTo(-0.275, -0.37, 0, -0.36); g.quadraticCurveTo(0.275, -0.37, 0.27, -0.04); g.closePath(); celFill(A); rrect(g, -0.285, -0.105, 0.57, 0.085, 0.03); celFill(shade(A, -0.1)); for (let k = -5; k <= 5; k++) { g.beginPath(); g.moveTo(k * 0.05, -0.1); g.lineTo(k * 0.05, -0.025); ink(g, iw * 0.7); } ell(g, 0, -0.38, 0.052, 0.052); celFill(shade(A, 0.12)); }
  if (o.headwear === 'tophat') { rrect(g, -0.31, -0.215, 0.62, 0.055, 0.022); celFill('#231f29'); rrect(g, -0.175, -0.56, 0.35, 0.36, 0.02); celFill('#2c2732'); g.beginPath(); g.rect(-0.175, -0.275, 0.35, 0.055); g.fillStyle = A; g.fill(); ink(g, iw); }
  if (o.headwear === 'helmet') {
    g.beginPath(); g.moveTo(-0.275, -0.03); g.quadraticCurveTo(-0.285, -0.32, 0, -0.32); g.quadraticCurveTo(0.285, -0.32, 0.275, -0.03); g.quadraticCurveTo(0, -0.08, -0.275, -0.03); celFill('#d39342');
    g.beginPath(); g.moveTo(-0.03, -0.31); g.quadraticCurveTo(0.0, -0.47, 0.2, -0.43); g.quadraticCurveTo(0.245, -0.34, 0.215, -0.25); g.quadraticCurveTo(0.15, -0.34, 0.03, -0.31); celFill(A);
  }
  if (o.headwear === 'laurel') { for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const a = Math.PI * (1.15 + i * 0.06); const x = sx * Math.cos(a) * -0.255, y = Math.sin(a) * 0.255 - 0.02; ell(g, x, y, 0.036, 0.017, sx * (0.6 + i * 0.25)); fillInk(g, '#5fa33c', iw); } }
  if (o.headwear === 'chefhat') {
    rrect(g, -0.2, -0.33, 0.4, 0.12, 0.02); celFill('#ffffff');
    g.beginPath(); g.moveTo(-0.2, -0.32); g.bezierCurveTo(-0.34, -0.36, -0.3, -0.56, -0.15, -0.52); g.bezierCurveTo(-0.12, -0.66, 0.12, -0.66, 0.15, -0.52); g.bezierCurveTo(0.3, -0.56, 0.34, -0.36, 0.2, -0.32); g.closePath(); celFill('#ffffff');
    for (const x of [-0.08, 0.08]) { g.beginPath(); g.moveTo(x, -0.33); g.quadraticCurveTo(x * 1.3, -0.45, x * 0.9, -0.52); ink(g, iw); }
  }
  if (o.headwear === 'crown') {
    g.beginPath(); g.moveTo(-0.17, -0.2); g.lineTo(-0.19, -0.37); g.lineTo(-0.1, -0.29); g.lineTo(0, -0.4); g.lineTo(0.1, -0.29); g.lineTo(0.19, -0.37); g.lineTo(0.17, -0.2); g.closePath(); celFill('#f2c23c');
    for (const [x, y, c] of [[-0.1, -0.24, '#d8343b'], [0, -0.245, '#2f6fd6'], [0.1, -0.24, '#3aa65a']]) { ell(g, x, y, 0.018, 0.018); fillInk(g, c, iw); }
  }
}

// ---------------------------------------------------------------- outfits
function style(o) {
  const t = o.type;
  if (o.outfit === 'casual') return { sleeve: t === 'tee' ? 'short' : 'long', cuff: t === 'hoodie' ? 'rib' : null, pants: true, shoe: 'sneaker', sleeveCol: o.palette.top };
  if (o.outfit === 'suit') return { sleeve: 'long', cuff: '#ffffff', pants: true, shoe: 'dress', sleeveCol: o.palette.top };
  if (o.outfit === 'uniform') return { sleeve: 'long', cuff: t === 'chef' ? 'rib' : null, pants: true, shoe: t === 'police' ? 'boot' : 'dress', sleeveCol: t === 'police' ? o.palette.top : (o.palette.coat || '#f7f7f4') };
  // historical
  return { sleeve: t === 'roman' ? 'short' : t === 'medieval' ? 'bell' : 'long', pants: t === 'victorian', shoe: t === 'roman' ? 'sandal' : 'dress', sleeveCol: t === 'medieval' ? o.palette.top : o.palette.top };
}

function drawTorso(g, o, d) {
  const P = o.palette, T = d.torso, sw = d.shoulder / 2, hw = d.hip / 2, t = o.type;
  const coatLike = (o.outfit === 'uniform' && t === 'doctor') || (o.outfit === 'historical' && t === 'victorian');
  const gown = o.outfit === 'historical' && t === 'medieval';
  const hem = gown ? d.legLen * 0.93 : coatLike ? 0.4 : (o.outfit === 'historical' && t === 'roman') ? 0.24 : o.outfit === 'suit' ? 0.075 : (o.outfit === 'casual' && t === 'hoodie') ? 0.07 : 0.035;
  const flare = gown ? 0.24 : (o.outfit === 'historical' && t === 'roman') ? 0.045 : coatLike ? 0.06 : 0;
  const base = coatLike ? (P.coat || (t === 'doctor' ? '#f7f7f4' : P.top)) : P.top;
  const body = () => {
    g.beginPath(); g.moveTo(-sw * 0.62, -T); g.quadraticCurveTo(-sw, -T, -sw, -T + 0.075);
    g.quadraticCurveTo(-hw - 0.02, -T * 0.4, -hw - flare * 0.25, 0);
    g.quadraticCurveTo(-hw - flare, hem * 0.6, -hw - flare, hem);
    g.quadraticCurveTo(0, hem + 0.025, hw + flare, hem);
    g.quadraticCurveTo(hw + flare, hem * 0.6, hw + flare * 0.25, 0);
    g.quadraticCurveTo(hw + 0.02, -T * 0.4, sw, -T + 0.075); g.quadraticCurveTo(sw, -T, sw * 0.62, -T); g.closePath();
  };
  // trouser top: the legs themselves are ink sticks, so the trouser colour shows as a short band at the hips
  if (style(o).pants && !gown) { g.beginPath(); g.moveTo(-hw - 0.006, -0.05); g.lineTo(hw + 0.006, -0.05); g.lineTo(hw + 0.012, 0.11); g.lineTo(d.stick * 1.2, 0.11); g.quadraticCurveTo(0, 0.04, -d.stick * 1.2, 0.11); g.lineTo(-hw - 0.012, 0.11); g.closePath(); cel(g, () => { g.beginPath(); g.moveTo(-hw - 0.006, -0.05); g.lineTo(hw + 0.006, -0.05); g.lineTo(hw + 0.012, 0.11); g.lineTo(d.stick * 1.2, 0.11); g.quadraticCurveTo(0, 0.04, -d.stick * 1.2, 0.11); g.lineTo(-hw - 0.012, 0.11); g.closePath(); }, P.bottom, { shadeFn: () => g.fillRect(0.02, -0.1, 0.3, 0.3) }); }
  // hood behind the neck
  if (o.outfit === 'casual' && t === 'hoodie') { g.beginPath(); g.moveTo(-0.14, -T + 0.02); g.quadraticCurveTo(-0.2, -T - 0.12, 0, -T - 0.13); g.quadraticCurveTo(0.2, -T - 0.12, 0.14, -T + 0.02); g.closePath(); fillInk(g, shade(P.top, -0.08)); }
  // neck
  capsule(g, 0, -T - 0.06, -T + 0.02, 0.044); fillInk(g, P.skin); g.fillStyle = SHADE; g.fillRect(-0.044, -T - 0.01, 0.088, 0.03);
  if (o.outfit === 'historical' && t === 'victorian') { g.beginPath(); g.moveTo(-hw - 0.06, -0.05); g.lineTo(-hw - 0.08, hem); g.lineTo(hw + 0.08, hem); g.lineTo(hw + 0.06, -0.05); g.closePath(); fillInk(g, shade(base, -0.1)); }
  cel(g, body, base, { shadeFn: () => { g.beginPath(); g.moveTo(sw * 0.35, -T - 0.05); g.quadraticCurveTo(sw * 0.15, -T * 0.4, hw * 0.45 + flare * 0.6, hem + 0.05); g.lineTo(0.6, hem + 0.1); g.lineTo(0.6, -T - 0.1); g.closePath(); g.fill(); }, lightFn: () => { g.fillRect(-sw - 0.01, -T, 0.035, T + hem); } });
  g.save(); body(); g.clip();
  const L = (w = INNER) => ink(g, w);
  if (o.outfit === 'casual' && t === 'tee') {
    g.beginPath(); g.arc(0, -T, 0.068, 0.15, Math.PI - 0.15); L(OUTLINE * 0.85);
    if (o.logo !== false) { ell(g, 0, -T * 0.55, 0.058, 0.058); fillInk(g, P.accent, INNER * 1.3); g.beginPath(); g.moveTo(-0.026, -T * 0.55); g.lineTo(0.026, -T * 0.55); g.moveTo(0, -T * 0.55 - 0.026); g.lineTo(0, -T * 0.55 + 0.026); L(INNER * 1.2); }
  }
  if (o.outfit === 'casual' && t === 'hoodie') {
    g.beginPath(); g.moveTo(-0.08, -T + 0.01); g.quadraticCurveTo(0, -T + 0.07, 0.08, -T + 0.01); L(OUTLINE * 0.8);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.035, -T + 0.04); g.lineTo(sx * 0.04, -T * 0.6); L(INNER); ell(g, sx * 0.04, -T * 0.6 + 0.008, 0.009, 0.012); g.fillStyle = '#ffffff'; g.fill(); L(INNER * 0.8); }
    g.beginPath(); g.moveTo(-0.12, -T * 0.32); g.lineTo(0.12, -T * 0.32); g.lineTo(0.15, -0.01); g.lineTo(-0.15, -0.01); g.closePath(); g.fillStyle = shade(P.top, -0.05); g.fill(); L(INNER * 1.2);
    g.fillStyle = shade(P.top, -0.1); g.fillRect(-0.4, -0.04, 0.8, hem + 0.05); g.beginPath(); g.moveTo(-0.4, -0.04); g.lineTo(0.4, -0.04); L(INNER);
  }
  if (o.outfit === 'casual' && t === 'cardigan') {
    g.beginPath(); g.moveTo(-0.07, -T); g.lineTo(-0.05, hem + 0.05); g.lineTo(0.05, hem + 0.05); g.lineTo(0.07, -T); g.closePath(); g.fillStyle = P.shirt || '#f2efe6'; g.fill(); L(INNER * 1.3);
    g.beginPath(); g.moveTo(-0.065, -T + 0.005); g.lineTo(0, -T + 0.05); g.lineTo(0.065, -T + 0.005); L(INNER * 1.3);
    for (const y of [-T * 0.55, -T * 0.35, -T * 0.15]) { ell(g, -0.075, y, 0.013, 0.013); fillInk(g, '#d9b46a', INNER * 0.8); }
    for (const sx of [-1, 1]) { rrect(g, sx * 0.14 - 0.045, -T * 0.32, 0.09, 0.07, 0.01); L(INNER); }
  }
  if (o.outfit === 'suit') {
    g.beginPath(); g.moveTo(-0.078, -T); g.lineTo(0, -T * 0.42); g.lineTo(0.078, -T); g.closePath(); fillInk(g, '#ffffff', INNER * 1.3);
    g.beginPath(); g.moveTo(-0.022, -T + 0.03); g.lineTo(0.022, -T + 0.03); g.lineTo(0.032, -T * 0.5); g.lineTo(0, -T * 0.41); g.lineTo(-0.032, -T * 0.5); g.closePath(); fillInk(g, P.accent, INNER * 1.2);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.078, -T); g.lineTo(sx * 0.155, -T * 0.82); g.lineTo(sx * 0.1, -T * 0.72); g.lineTo(0, -T * 0.4); g.fillStyle = shade(P.top, -0.06); g.fill(); L(INNER * 1.3); }
    for (const y of [-T * 0.32, -T * 0.15]) { ell(g, 0, y, 0.014, 0.014); fillInk(g, shade(P.top, -0.25), INNER); }
    g.fillStyle = P.accent; g.beginPath(); g.moveTo(-0.165, -T * 0.7); g.lineTo(-0.135, -T * 0.78); g.lineTo(-0.105, -T * 0.7); g.closePath(); g.fill(); L(INNER);
    g.beginPath(); g.moveTo(-0.175, -T * 0.7); g.lineTo(-0.09, -T * 0.7); L(INNER);
    g.beginPath(); g.moveTo(0, -T * 0.4); g.lineTo(0, hem); L(INNER);
  }
  if (o.outfit === 'uniform' && t === 'police') {
    g.beginPath(); g.moveTo(-0.072, -T); g.lineTo(0, -T + 0.085); g.lineTo(0.072, -T); L(OUTLINE * 0.8);
    g.beginPath(); g.moveTo(0, -T + 0.085); g.lineTo(0, -0.07); L(INNER);
    for (const sx of [-1, 1]) { rrect(g, sx * 0.1 - 0.047, -T * 0.72, 0.094, 0.085, 0.012); L(INNER * 1.2); g.beginPath(); g.moveTo(sx * 0.1 - 0.047, -T * 0.69); g.lineTo(sx * 0.1 + 0.047, -T * 0.69); L(INNER); }
    g.save(); g.translate(-0.1, -T * 0.84); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.015 : 0.034; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); fillInk(g, P.badge || '#f2c23c', INNER); g.restore();
    for (const y of [-T * 0.55, -T * 0.35, -T * 0.15]) { ell(g, 0, y, 0.011, 0.011); g.fillStyle = INK; g.fill(); }
    g.fillStyle = '#2b2226'; g.fillRect(-0.4, -0.075, 0.8, 0.055); g.beginPath(); g.moveTo(-0.4, -0.075); g.lineTo(0.4, -0.075); g.moveTo(-0.4, -0.02); g.lineTo(0.4, -0.02); L(INNER);
    rrect(g, -0.036, -0.085, 0.072, 0.07, 0.009); fillInk(g, P.badge || '#f2c23c', INNER);
  }
  if (o.outfit === 'uniform' && t === 'doctor') {
    g.beginPath(); g.moveTo(-0.085, -T); g.lineTo(-0.06, hem + 0.05); g.lineTo(0.06, hem + 0.05); g.lineTo(0.085, -T); g.closePath(); g.fillStyle = P.top; g.fill(); L(INNER * 1.3);
    g.beginPath(); g.moveTo(-0.02, -T + 0.03); g.lineTo(0.02, -T + 0.03); g.lineTo(0.028, -T * 0.45); g.lineTo(0, -T * 0.38); g.lineTo(-0.028, -T * 0.45); g.closePath(); fillInk(g, P.accent, INNER);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.085, -T); g.lineTo(sx * 0.16, -T * 0.8); g.lineTo(sx * 0.07, -T * 0.5); L(INNER * 1.3); }
    // stethoscope
    g.beginPath(); g.moveTo(-0.11, -T + 0.02); g.quadraticCurveTo(-0.14, -T * 0.5, -0.06, -T * 0.42); g.moveTo(0.11, -T + 0.02); g.quadraticCurveTo(0.14, -T * 0.55, 0.08, -T * 0.5); g.lineWidth = INNER * 2.4; g.strokeStyle = INK; g.stroke(); g.lineWidth = INNER * 1.3; g.strokeStyle = '#4b5a72'; g.stroke();
    ell(g, 0.08, -T * 0.48, 0.022, 0.022); fillInk(g, '#c7ccd6', INNER);
    rrect(g, -0.17, -T * 0.66, 0.08, 0.09, 0.008); L(INNER); g.beginPath(); g.moveTo(-0.15, -T * 0.7); g.lineTo(-0.15, -T * 0.62); g.lineWidth = INNER * 1.8; g.strokeStyle = '#2f6fd6'; g.stroke();
    for (const sx of [-1, 1]) { rrect(g, sx * 0.16 - 0.05, -0.02, 0.1, 0.09, 0.01); L(INNER); }
  }
  if (o.outfit === 'uniform' && t === 'chef') {
    for (const sx of [-1, 1]) for (const y of [-T * 0.7, -T * 0.5, -T * 0.3]) { ell(g, sx * 0.07, y, 0.013, 0.013); fillInk(g, '#d9d9d2', INNER * 0.8); }
    g.beginPath(); g.moveTo(-0.13, -T + 0.03); g.lineTo(0.1, -T * 0.2); L(INNER);
    g.beginPath(); g.moveTo(-0.09, -T + 0.01); g.quadraticCurveTo(0, -T + 0.06, 0.09, -T + 0.01); g.lineTo(0.03, -T + 0.1); g.lineTo(-0.03, -T + 0.1); g.closePath(); fillInk(g, P.accent, INNER * 1.2);
    g.fillStyle = shade(base, -0.06); g.fillRect(-0.4, -0.05, 0.8, 0.1); g.beginPath(); g.moveTo(-0.4, -0.05); g.lineTo(0.4, -0.05); L(INNER);
  }
  if (o.outfit === 'historical' && t === 'roman') {
    g.beginPath(); g.moveTo(-sw, -T + 0.05); g.quadraticCurveTo(0, -T * 0.45, hw + 0.06, -0.05); g.lineTo(hw + 0.06, 0.06); g.quadraticCurveTo(-0.05, -T * 0.35, -sw - 0.02, -T + 0.16); g.closePath(); fillInk(g, P.accent, INNER * 1.3);
    g.strokeStyle = 'rgba(52,22,86,0.3)'; g.lineWidth = INNER; for (const x of [-0.09, 0.0, 0.09]) { g.beginPath(); g.moveTo(x, hem - 0.19); g.quadraticCurveTo(x + 0.012, hem - 0.08, x - 0.01, hem); g.stroke(); }
    g.fillStyle = '#7a4a24'; g.fillRect(-0.4, -0.05, 0.8, 0.036); g.beginPath(); g.moveTo(-0.4, -0.05); g.lineTo(0.4, -0.05); g.moveTo(-0.4, -0.014); g.lineTo(0.4, -0.014); L(INNER);
    g.fillStyle = shade(P.accent, 0.05); g.fillRect(-0.4, hem - 0.032, 0.8, 0.03);
  }
  if (o.outfit === 'historical' && t === 'victorian') {
    g.beginPath(); g.moveTo(-0.072, -T); g.lineTo(0, -T * 0.55); g.lineTo(0.072, -T); g.closePath(); fillInk(g, '#ffffff', INNER * 1.2);
    g.beginPath(); g.moveTo(-0.055, -T + 0.012); g.quadraticCurveTo(0, -T + 0.065, 0.055, -T + 0.012); g.quadraticCurveTo(0, -T + 0.032, -0.055, -T + 0.012); fillInk(g, P.accent, INNER);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.072, -T); g.lineTo(sx * 0.165, -T * 0.78); g.lineTo(sx * 0.06, -T * 0.45); g.fillStyle = shade(base, -0.06); g.fill(); L(INNER * 1.3); }
    for (const y of [-T * 0.38, -T * 0.22, -T * 0.06]) for (const sx of [-1, 1]) { ell(g, sx * 0.052, y, 0.012, 0.012); fillInk(g, '#d9b14a', INNER * 0.8); }
    g.beginPath(); g.moveTo(0.085, -T * 0.38); g.quadraticCurveTo(0.145, -T * 0.3, 0.125, -T * 0.22); g.strokeStyle = '#d9b14a'; g.lineWidth = INNER * 1.3; g.stroke();
  }
  if (gown) {
    g.beginPath(); g.moveTo(-hw - 0.01, -0.03); g.quadraticCurveTo(0, 0.02, hw + 0.01, -0.03); L(INNER * 1.3);
    g.fillStyle = P.accent; g.beginPath(); g.moveTo(-0.075, -T); g.quadraticCurveTo(0, -T + 0.09, 0.075, -T); g.lineTo(0.06, -0.03); g.lineTo(-0.06, -0.03); g.closePath(); g.fill(); L(INNER);
    for (let y = -T + 0.12; y < -0.06; y += 0.07) { g.beginPath(); g.moveTo(-0.04, y); g.lineTo(0.04, y + 0.035); g.moveTo(0.04, y); g.lineTo(-0.04, y + 0.035); g.strokeStyle = '#f2d36b'; g.lineWidth = INNER; g.stroke(); }
    g.strokeStyle = 'rgba(52,22,86,0.28)'; g.lineWidth = INNER * 1.1; for (const x of [-0.16, -0.06, 0.06, 0.16]) { g.beginPath(); g.moveTo(x * 0.5, 0.05); g.quadraticCurveTo(x * 1.1, hem * 0.6, x * 1.5, hem); g.stroke(); }
    g.fillStyle = shade(P.accent, 0.05); g.fillRect(-0.6, hem - 0.04, 1.2, 0.04);
  }
  g.restore();
  if (o.outfit === 'uniform' && t === 'police') for (const sx of [-1, 1]) { rrect(g, sx * sw - (sx > 0 ? 0.115 : 0), -T - 0.006, 0.115, 0.036, 0.01); fillInk(g, shade(P.top, -0.14), INNER * 1.2); }
}

// ---------------------------------------------------------------- stick limbs, hands, shoes, props
// Arms and legs are thin, flexible black ink sticks with simple rounded hands and shoes.
function drawStick(g, len, w) { capsule(g, 0, 0, len, w / 2); g.fillStyle = INK; g.fill(); }
function drawForearmStick(g, o, d) {
  drawStick(g, d.lower, d.stick);
  const r = d.hand, y = d.lower + r * 0.55;
  ell(g, -r * 0.82, y - r * 0.35, r * 0.4, r * 0.5, 0.6); fillInk(g, o.palette.skin, OUTLINE * 0.9);     // thumb
  cel(g, () => ell(g, 0, y, r, r * 1.02), o.palette.skin, { shadeFn: () => g.fillRect(r * 0.25, y - r * 2, r * 2, r * 4), w: OUTLINE * 0.95 });
}
function drawShinStick(g, o, d, side) {
  const st = style(o), sl = d.shoe, sh = d.shoe * 0.46, L = d.shin;
  drawStick(g, L - sh * 0.5, d.stick);
  const shoeCol = st.shoe === 'sneaker' ? (o.palette.shoes || '#ffffff') : st.shoe === 'sandal' ? '#8b5a2b' : (o.palette.shoes || '#2a2230');
  const shoe = () => { g.beginPath(); g.moveTo(-sl * 0.32 * side - sl * 0.12, L - sh); g.quadraticCurveTo(-sl * 0.5 * side, L - sh * 0.95, -sl * 0.45 * side, L - sh * 0.35); g.quadraticCurveTo(-sl * 0.42 * side, L, -sl * 0.2 * side, L); g.lineTo(sl * 0.62 * side, L); g.quadraticCurveTo(sl * 0.85 * side, L, sl * 0.8 * side, L - sh * 0.4); g.quadraticCurveTo(sl * 0.7 * side, L - sh * 0.95, sl * 0.12 * side, L - sh); g.closePath(); };
  cel(g, shoe, shoeCol, { shadeFn: () => g.fillRect(-sl, L - sh * 0.42, sl * 2, sh), lightFn: () => { ell(g, sl * 0.3 * side, L - sh * 0.7, sl * 0.15, sh * 0.13); g.fill(); } });
  if (st.shoe !== 'sandal') { g.save(); shoe(); g.clip(); g.fillStyle = st.shoe === 'sneaker' ? (o.palette.accent || '#d8343b') : shade(shoeCol, -0.14); g.fillRect(-sl, L - sh * 0.24, sl * 2, sh * 0.3); g.restore(); shoe(); ink(g, OUTLINE * 0.95); }
  else { g.beginPath(); g.moveTo(-sl * 0.2, L - sh * 0.6); g.lineTo(sl * 0.4 * side, L - sh * 0.75); ink(g, INNER * 1.4); }
}
function drawSleeveCap(g, o, d) {
  const st = style(o), r = d.stick * 1.9;
  const col = st.sleeveCol;
  const big = st.sleeve === 'short';
  const p = () => { g.beginPath(); g.moveTo(-r * (big ? 1.25 : 0.95), -r * 0.5); g.quadraticCurveTo(-r * (big ? 1.35 : 1.0), r * (big ? 1.25 : 0.7), 0, r * (big ? 1.35 : 0.8)); g.quadraticCurveTo(r * (big ? 1.35 : 1.0), r * (big ? 1.25 : 0.7), r * (big ? 1.25 : 0.95), -r * 0.5); g.quadraticCurveTo(0, -r * 1.3, -r * (big ? 1.25 : 0.95), -r * 0.5); };
  cel(g, p, col, { shadeFn: () => g.fillRect(r * 0.2, -r * 2, r * 3, r * 4), w: OUTLINE * 0.95 });
}
export function drawProp(g, kind, opts = {}) {
  // grip point at (0,0); drawn in metres, y down
  if (kind === 'newspaper') {
    const w = 0.36, h = 0.44, y0 = -h * 0.62;
    const p = () => rrect(g, -w / 2, y0, w, h, 0.01);
    cel(g, p, '#f2efe6', { shadeFn: () => g.fillRect(0, y0, w, h) });
    g.fillStyle = '#2b2630'; g.fillRect(-w / 2 + 0.025, y0 + 0.02, w - 0.05, 0.05);
    g.fillStyle = '#ffffff'; g.font = '700 0.032px sans-serif'; g.textAlign = 'center'; g.fillText('DAILY NEWS', 0, y0 + 0.056);
    rrect(g, -w / 2 + 0.025, y0 + 0.09, 0.14, 0.11, 0.004); g.fillStyle = '#9fb6d9'; g.fill(); ink(g, INNER);
    g.strokeStyle = 'rgba(30,25,40,0.55)'; g.lineWidth = INNER * 1.1; for (let i = 0; i < 9; i++) { const yy = y0 + 0.1 + i * 0.03; const x0 = i < 4 ? -w / 2 + 0.18 : -w / 2 + 0.025; g.beginPath(); g.moveTo(x0, yy); g.lineTo(w / 2 - 0.025, yy); g.stroke(); }
    g.beginPath(); g.moveTo(0, y0); g.lineTo(0, y0 + h); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = INNER; g.stroke();
    p(); ink(g);
  }
  if (kind === 'wrench') {
    g.save(); g.rotate(-0.5);
    const p = () => { g.beginPath(); g.roundRect(-0.018, -0.3, 0.036, 0.32, 0.015); g.moveTo(0.05, -0.33); g.arc(0, -0.33, 0.05, 0, Math.PI * 2); };
    g.beginPath(); g.roundRect(-0.018, -0.3, 0.036, 0.32, 0.015); fillInk(g, '#b8c0cc');
    g.beginPath(); g.arc(0, -0.33, 0.052, 0.9, Math.PI * 2 + 0.2 - 0.0); g.lineTo(0.02, -0.36); g.lineTo(-0.0, -0.33); g.closePath(); fillInk(g, '#c8d0dc');
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-0.012, -0.28, 0.008, 0.26);
    g.restore();
  }
  if (kind === 'money') {
    for (let i = -1; i <= 1; i++) {
      g.save(); g.rotate(i * 0.32); g.translate(0, -0.1);
      rrect(g, -0.055, -0.13, 0.11, 0.2, 0.008); g.fillStyle = '#7cc46a'; g.fill(); g.save(); g.clip(); g.fillStyle = SHADE; g.fillRect(0.02, -0.2, 0.1, 0.3); g.restore(); ink(g, OUTLINE * 0.85);
      rrect(g, -0.04, -0.115, 0.08, 0.17, 0.006); g.lineWidth = INNER * 0.8; g.strokeStyle = '#3f7d3a'; g.stroke();
      g.fillStyle = '#2f6b2c'; g.font = '800 0.07px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, -0.03);
      g.restore();
    }
  }
  if (kind === 'burger') {
    const y = -0.06;
    g.beginPath(); g.moveTo(-0.09, y); g.quadraticCurveTo(-0.09, y - 0.1, 0, y - 0.1); g.quadraticCurveTo(0.09, y - 0.1, 0.09, y); g.closePath(); cel(g, () => { g.beginPath(); g.moveTo(-0.09, y); g.quadraticCurveTo(-0.09, y - 0.1, 0, y - 0.1); g.quadraticCurveTo(0.09, y - 0.1, 0.09, y); g.closePath(); }, '#e9a54a', { shadeFn: () => g.fillRect(0.02, y - 0.12, 0.1, 0.12) });
    for (const [x, yy] of [[-0.04, y - 0.06], [0.0, y - 0.075], [0.035, y - 0.055]]) { g.fillStyle = '#fff3d6'; ell(g, x, yy, 0.007, 0.004, 0.4); g.fill(); }
    g.beginPath(); g.moveTo(-0.1, y + 0.005); for (let k = 0; k <= 8; k++) g.lineTo(-0.1 + k * 0.025, y + (k % 2 ? 0.022 : 0.004)); g.lineTo(0.1, y + 0.005); g.closePath(); fillInk(g, '#6fbf4a', INNER);
    rrect(g, -0.092, y + 0.014, 0.184, 0.032, 0.014); fillInk(g, '#7a3f22', INNER * 1.2);
    rrect(g, -0.088, y + 0.044, 0.176, 0.036, 0.016); fillInk(g, '#e9a54a', INNER * 1.2);
  }
  if (kind === 'coffee') {
    const p = () => { g.beginPath(); g.moveTo(-0.045, -0.15); g.lineTo(0.045, -0.15); g.lineTo(0.035, 0.03); g.lineTo(-0.035, 0.03); g.closePath(); };
    cel(g, p, '#ffffff', { shadeFn: () => g.fillRect(0.01, -0.2, 0.1, 0.3) });
    rrect(g, -0.05, -0.17, 0.1, 0.028, 0.008); fillInk(g, '#4a3b36', INNER * 1.2);
    rrect(g, -0.044, -0.09, 0.086, 0.06, 0.004); g.fillStyle = '#b07a46'; g.fill(); ink(g, INNER);
    for (const x of [-0.015, 0.012]) { g.beginPath(); g.moveTo(x, -0.2); g.quadraticCurveTo(x + 0.02, -0.23, x, -0.26); g.lineWidth = INNER; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke(); }
  }
  if (kind === 'cane') {
    const L = opts.length || 0.85;
    g.beginPath(); g.moveTo(0, -0.04); g.lineTo(0, L); g.lineWidth = 0.034; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 0.02; g.strokeStyle = '#8a5a2f'; g.stroke();
    g.beginPath(); g.arc(-0.05, -0.04, 0.05, 0, Math.PI, true); g.lineWidth = 0.034; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.02; g.strokeStyle = '#8a5a2f'; g.stroke();
    g.fillStyle = '#2a2230'; g.fillRect(-0.017, L - 0.03, 0.034, 0.03);
  }
}

// ---------------------------------------------------------------- createCharacter
let SEED = 1;
export function createCharacter(options = {}) {
  const o = {
    name: 'Character', height: 1.75, outfit: 'casual', type: null, hair: 'short', headwear: 'none',
    expression: 'deadpan', gesture: null, pose: 'standing', prop: 'none', hatLaunch: false,
    glasses: false, beard: false, mustache: false, lashes: false, showPedestal: false,
    seed: SEED++, emissive: '#5c5c5c', ...options,
  };
  if (!o.type) o.type = options.era || OUTFITS[o.outfit][0];
  o.expression = resolveExpression(o.expression);
  o.palette = { skin: '#efbf98', hair: '#3a2416', top: '#3b82c4', bottom: '#3a4a6b', shoes: null, accent: '#f2c23c', eyes: '#3b2a20', ...(options.palette || {}) };
  const u = o.height / 3.5;
  const d = {
    head: u * PLAN.head, torso: u * PLAN.torso, neck: u * PLAN.neck, legLen: u * PLAN.leg,
    shoulder: u * 0.92, hip: u * 0.68, stick: u * 0.075, upper: u * 0.66, lower: u * 0.6, hand: u * 0.1, shoe: u * 0.3,
  };
  d.thigh = d.legLen * 0.5; d.shin = d.legLen * 0.5;
  d.limb = d.stick; d.leg = d.stick;       // torso code still refers to these
  const gown = o.outfit === 'historical' && o.type === 'medieval';
  const coat = (o.outfit === 'uniform' && o.type === 'doctor') || (o.outfit === 'historical' && o.type === 'victorian');
  const hemExtra = gown ? d.legLen + 0.1 : coat ? 0.52 : o.type === 'roman' ? 0.36 : 0.18;
  const hs = d.head / 0.5, hW = 1.0 * hs, hH = 1.35 * hs;
  // ---- textures (shared by the visible rig and the shadow twin)
  const cards = {
    thigh: (() => { const w = d.stick * 2; const k = makeCard(w, d.thigh + d.stick * 2, w / 2, d.stick); k.draw((g) => drawStick(g, d.thigh, d.stick)); return k; })(),
    shin: [-1, 1].map((side) => { const w = d.shoe * 2.1; const k = makeCard(w, d.shin + d.stick * 2, w / 2, d.stick); k.draw((g) => drawShinStick(g, o, d, side)); return k; }),
    upper: (() => { const w = d.stick * 2; const k = makeCard(w, d.upper + d.stick * 2, w / 2, d.stick); k.draw((g) => drawStick(g, d.upper, d.stick)); return k; })(),
    lower: (() => { const w = d.hand * 3.2; const k = makeCard(w, d.lower + d.hand * 2.8, w / 2, d.stick); k.draw((g) => drawForearmStick(g, o, d)); return k; })(),
    cap: (() => { const w = d.stick * 6; const k = makeCard(w, w, w / 2, w / 2); k.draw((g) => drawSleeveCap(g, o, d)); return k; })(),
    torso: (() => { const W = d.shoulder + (gown ? 0.62 : 0.2); const k = makeCard(W, d.torso + d.neck + hemExtra + 0.22, W / 2, d.torso + d.neck + 0.17); k.draw((g) => drawTorso(g, o, d)); return k; })(),
    head: makeCard(hW, hH + 0.25 * hs, hW / 2, hH),
    hat: o.headwear !== 'none' ? makeCard(hW * 1.2, hH * 1.1, hW * 0.6, hH * 0.9) : null,
  };
  if (BACK_LAYER.includes(o.hair)) { cards.hairBack = makeCard(hW, hH + 0.25 * hs, hW / 2, hH); cards.hairBack.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); g_ = g; drawHairBack(g, o, OUTLINE / hs, INNER / hs); }); }
  if (cards.hat) cards.hat.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); g_ = g; drawHeadwear(g, o, OUTLINE / hs, INNER / hs); });
  const propCards = {};
  const propCard = (kind, len) => {
    const key = kind + (len ? len.toFixed(2) : '');
    if (propCards[key]) return propCards[key];
    const H = kind === 'cane' ? len + 0.2 : 0.62, W = 0.5;
    const k = makeCard(W, H, W / 2, kind === 'cane' ? 0.12 : H * 0.75); k.draw((g) => drawProp(g, kind, { length: len })); return (propCards[key] = k);
  };
  const litMat = (tex) => new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(o.emissive), alphaTest: 0.5, side: THREE.DoubleSide });
  const shadowMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  function buildRig(isShadow) {
    const mesh = (card) => { const m = new THREE.Mesh(card.geo, isShadow ? shadowMat(card.tex) : litMat(card.tex)); m.castShadow = isShadow; m.receiveShadow = false; m.userData.characterPart = isShadow ? 'shadow' : 'visible'; if (isShadow) m.renderOrder = -50; return m; };
    const rig = new THREE.Group(); rig.name = isShadow ? 'shadowRig' : 'rig';
    const hips = new THREE.Group(); hips.position.y = d.legLen; rig.add(hips);
    const legs = {};
    [['left', -1], ['right', 1]].forEach(([name, side], i) => {
      const hip = new THREE.Group(); hip.position.set(side * d.hip * 0.24, 0, -0.012); hips.add(hip);
      const thigh = mesh(cards.thigh); hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -d.thigh; hip.add(knee); knee.add(mesh(cards.shin[i]));
      legs[name] = { hip, thigh, knee, side };
    });
    const torso = new THREE.Group(); hips.add(torso); torso.add(mesh(cards.torso));
    const arms = {};
    for (const [name, side] of [['left', -1], ['right', 1]]) {
      const sx = side * (d.shoulder / 2 - d.stick * 1.1), sy = d.torso - 0.04;
      const sh = new THREE.Group(); sh.position.set(sx, sy, 0.014); torso.add(sh);
      sh.add(mesh(cards.upper));
      const el = new THREE.Group(); el.position.set(0, -d.upper, 0.004); sh.add(el); el.add(mesh(cards.lower));
      const hand = new THREE.Group(); hand.position.set(0, -d.lower - d.hand * 0.55, 0.006); el.add(hand);
      if (style(o).sleeve === 'short') { const cap = mesh(cards.cap); cap.position.set(sx, sy + d.stick * 0.3, 0.03); torso.add(cap); }
      arms[name] = { shoulder: sh, elbow: el, hand, side };
    }
    const chestProp = new THREE.Group(); chestProp.position.set(0, d.torso * 0.62, 0.008); torso.add(chestProp);
    const head = new THREE.Group(); head.position.set(0, d.torso + d.neck, 0.024); torso.add(head); head.add(mesh(cards.head));
    if (cards.hairBack) { const hb = mesh(cards.hairBack); hb.position.z = -0.06; head.add(hb); }
    const hat = new THREE.Group(); hat.position.z = 0.01; head.add(hat); if (cards.hat) hat.add(mesh(cards.hat));
    const steam = [];
    if (!isShadow) {
      const sc = makeCard(0.2, 0.2, 0.1, 0.1); sc.draw((g) => { for (let a = 0; a < 5; a++) { const t = a / 5 * Math.PI * 2; ell(g, Math.cos(t) * 0.035, Math.sin(t) * 0.028, 0.04, 0.04); } g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = INNER * 1.4; g.strokeStyle = INK; g.stroke(); g.fillStyle = '#ffffff'; ell(g, 0, 0, 0.045, 0.04); g.fill(); });
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(sc.geo, new THREE.MeshBasicMaterial({ map: sc.tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false })); m.visible = false; head.add(m); steam.push(m); }
    }
    return { rig, hips, torso, legs, arms, head, hat, steam, chestProp, mesh };
  }
  const group = new THREE.Group(); group.name = o.name;
  const V = buildRig(false), S = buildRig(true);
  group.add(V.rig, S.rig);
  const rigs = [V, S];

  // ---------------- api
  let expression = o.expression, blinking = false, exprT = null, hatLift = 0, pose = 'standing', t0 = 0;
  const drawH = () => cards.head.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); drawHead(g, o, expression, blinking && !['laughing', 'smug_happy'].includes(expression), 0.25, { skipBack: true, noHat: true }); });
  drawH();
  const syncProps = () => { for (const R of rigs) for (const a of Object.values(R.arms)) for (const c of a.hand.children) c.rotation.z = -(a.shoulder.rotation.z + a.elbow.rotation.z) - R.torso.rotation.z; };
  function setArm(side, shoulder, elbow) {
    for (const R of rigs) { const a = R.arms[side]; a.shoulder.rotation.z = a.side * shoulder; a.elbow.rotation.z = -a.side * elbow; }
    syncProps();
  }
  function setGesture(g) { const p = typeof g === 'string' ? GESTURES[g] : g; setArm('left', ...p.left); setArm('right', ...p.right); o.gesture = g; }
  function clearProps() { for (const R of rigs) { for (const a of Object.values(R.arms)) a.hand.clear(); R.chestProp.clear(); } }
  function handHeightFor(side, sh, el) { // world height of the hand in the standing pose
    const a = sh, b = sh - el; return d.legLen + d.torso - 0.04 - d.upper * Math.cos(a) - (d.lower + d.hand * 0.55) * Math.cos(b);
  }
  function setProp(kind, where = 'right') {
    clearProps(); o.prop = kind; if (!kind || kind === 'none') return;
    for (const R of rigs) {
      if (kind === 'newspaper') { const m = R.mesh(propCard('newspaper')); m.position.y = 0.12; R.chestProp.add(m); continue; }
      const len = kind === 'cane' ? handHeightFor(where, ...GESTURES.cane.right) : null;
      R.arms[where].hand.add(R.mesh(propCard(kind, len)));
    }
    syncProps();
  }
  function setPose(name, opt = {}) {
    pose = name; o.pose = name;
    for (const R of rigs) {
      R.torso.rotation.z = 0; R.head.rotation.z = 0; R.hips.position.y = d.legLen;
      for (const L of Object.values(R.legs)) { L.hip.rotation.z = 0; L.thigh.scale.y = 1; L.knee.position.y = -d.thigh; L.knee.rotation.z = 0; }
    }
    if (name === 'sitting_dangling_legs') {
      // the group origin is the seat surface: thighs point at the camera (foreshortened), shins dangle
      for (const R of rigs) { R.hips.position.y = d.stick * 0.5; for (const L of Object.values(R.legs)) { L.hip.rotation.z = L.side * 0.22; L.thigh.scale.y = 0.26; L.knee.position.y = -d.thigh * 0.26; L.knee.rotation.z = -L.side * 0.22; } }
      setGesture(o.gesture || 'seated'); setProp(opt.prop || o.prop);
    } else if (name === 'leaning_on_cane') {
      setGesture('cane'); setProp('cane');
      for (const R of rigs) { R.torso.rotation.z = -0.06; R.head.rotation.z = 0.05; }
      syncProps();
    } else if (name === 'holding_prop') {
      const kind = opt.prop || (o.prop !== 'none' ? o.prop : 'newspaper');
      setGesture(kind === 'newspaper' ? 'holdTwo' : (o.gesture && o.gesture !== 'rest' ? o.gesture : 'holdOne')); setProp(kind);
    } else { setGesture(o.gesture || 'rest'); setProp(o.prop); }
  }
  setPose(o.pose, { prop: o.prop });
  if (o.gesture && o.pose === 'standing') setGesture(o.gesture);
  let rs = o.seed * 9301 + 49297; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
  const blinks = []; for (let t = 0.6 + rnd() * 2; t < 900; t += 2.4 + rnd() * 2.8) blinks.push(t);
  function setHatLift(v) { hatLift = v; for (const R of rigs) { R.hat.position.y = v; R.hat.rotation.z = v * 0.9; } }
  function update(t) {
    const br = Math.sin(t * Math.PI * 2 / 3.4 + o.seed);
    for (const R of rigs) {
      R.torso.scale.set(1 + br * 0.006, 1 + br * 0.014, 1);
      R.head.rotation.z = (pose === 'leaning_on_cane' ? 0.05 : 0) + Math.sin(t * 0.9 + o.seed) * 0.025;
      for (const a of Object.values(R.arms)) a.shoulder.position.y = d.torso - 0.04 + br * 0.004;
      if (pose === 'sitting_dangling_legs') for (const L of Object.values(R.legs)) L.knee.rotation.z = -L.side * 0.22 + Math.sin(t * 2.6 + L.side * 1.3 + o.seed) * 0.14;
    }
    const b = blinks.some((x) => t >= x && t < x + 0.13);
    if (b !== blinking) { blinking = b; drawH(); }
    // furious steam puffs shoot out both sides of the head
    for (let i = 0; i < V.steam.length; i++) {
      const m = V.steam[i], on = expression === 'furious_steam'; m.visible = on; if (!on) continue;
      const side = i < 3 ? -1 : 1, p = ((t * 1.4 + (i % 3) / 3) % 1);
      m.position.set(side * (d.head * 0.55 + p * d.head * 0.55), d.head * (0.45 + p * 0.35), 0.03);
      const s = 0.45 + p * 1.1; m.scale.set(s * hs, s * hs, 1); m.material.opacity = 1 - p * p;
    }
    // hat launch on bug-eyed shock
    if (o.hatLaunch && expression === 'bug_eyed_shock' && cards.hat) {
      const e = exprT == null ? 0.45 : Math.max(0, t - exprT);
      const up = e < 1.1 ? Math.sin(Math.min(1, e / 1.1) * Math.PI) * d.head * 1.4 : 0;
      setHatLift(up);
    } else if (hatLift && !o.hatLaunch) setHatLift(0);
    t0 = t;
  }
  function setExpression(ex, atTime = null) {
    ex = resolveExpression(ex); if (!EXPRESSIONS.includes(ex)) throw new Error('unknown expression ' + ex);
    if (ex !== expression) exprT = atTime != null ? atTime : t0;
    expression = ex; drawH(); if (ex !== 'bug_eyed_shock' && hatLift) setHatLift(0);
  }
  const wp = new THREE.Vector3();
  function faceCamera(cam) { group.getWorldPosition(wp); V.rig.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z) - group.rotation.y; }
  function faceLight(light) {
    const dir = light.isLight ? new THREE.Vector3().subVectors(light.position, light.target ? light.target.position : new THREE.Vector3()) : light;
    S.rig.rotation.y = Math.atan2(dir.x, dir.z) - group.rotation.y;
  }
  return {
    group, options: o, dims: d, joints: V, shadowJoints: S,
    setExpression, setArm, setGesture, setPose, setProp, setHatLift, update, faceCamera, faceLight,
    get expression() { return expression; }, get pose() { return pose; },
  };
}
