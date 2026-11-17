// characters.js — reusable flat 2D characters rigged to stand in a lit 3D world.
//
//   import { createCharacter } from './characters.js';
//   const c = createCharacter({ outfit: 'suit', expression: 'smug', gesture: 'hips' });
//   scene.add(c.group);           // feet at y = 0
//   c.setExpression('shocked');   // neutral | shocked | nervous | smug | angry | laughing
//   c.setArm('right', 1.2, 0.4);  // shoulder raise, elbow bend (radians)
//   c.setGesture('wave');         // preset arm poses (see GESTURES)
//   c.faceCamera(camera);         // the visible card turns to the camera (yaw only)
//   c.faceLight(sunLight);        // the hidden shadow twin turns to the light -> full-shape shadows
//   c.update(seconds);            // idle breathing, head sway, blinking (deterministic)
//
// Look: crisp two-tone cel shading (light from the left), heavy outer ink line with lighter
// inner lines, fixed 3.5-heads-tall proportions, round head, thin limbs.
// Rendering: each part is an alpha-tested canvas card with a lit material (catches the key light).
// A second, invisible copy of the rig faces the light and casts the shadow, so the shadow always
// shows the full silhouette in the current pose, whatever the camera angle.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
export const INK = '#140f1a';
export const OUTLINE = 0.013;              // outer ink line (metres) — identical on every part
export const INNER = 0.0075;               // inner detail line
const PPM = 1000;                           // texture pixels per metre on every part
const SHADE = 'rgba(52,22,86,0.26)';        // cel shadow tone (multiplied over the base colour)
const LIGHT = 'rgba(255,255,255,0.22)';
export const EXPRESSIONS = ['neutral', 'shocked', 'nervous', 'smug', 'angry', 'laughing'];
export const OUTFITS = {
  casual: ['tee', 'hoodie', 'cardigan'],
  suit: ['classic'],
  uniform: ['police', 'doctor', 'chef'],
  historical: ['roman', 'victorian', 'medieval'],
};
export const HAIRSTYLES = ['bald', 'short', 'sidepart', 'spiky', 'curly', 'afro', 'bun', 'ponytail', 'long', 'bob'];
export const HEADWEAR = ['none', 'cap', 'beanie', 'tophat', 'helmet', 'laurel', 'chefhat', 'crown'];
export const PALETTES = {
  skin: ['#f8d5bb', '#efbf98', '#d9a072', '#b0713f', '#86522d', '#5e3720'],
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
// Draws the head centred at (0,0) with radius R (caller's units); ink width stays constant.
export function drawHead(g, o, expression = 'neutral', blink = false, R = 0.25, opts = {}) {
  const s = R / 0.25; g.save(); g.scale(s, s); g_ = g;
  const lw = OUTLINE / s, iw = INNER / s;
  const P = o.palette;
  if (!(opts.skipBack && BACK_LAYER.includes(o.hair))) drawHairBack(g, o, lw, iw);
  for (const sx of [-1, 1]) { ell(g, sx * 0.246, 0.035, 0.046, 0.062); fillInk(g, P.skin, lw); g.beginPath(); g.arc(sx * 0.246, 0.035, 0.024, sx < 0 ? -1.2 : Math.PI - 1.9, sx < 0 ? 1.9 : Math.PI + 1.2); g.lineWidth = iw; g.strokeStyle = shade(P.skin, -0.25); g.stroke(); }
  const head = () => { g.beginPath(); g.arc(0, 0, 0.25, 0, Math.PI * 2); };
  head(); g.fillStyle = P.skin; g.fill();
  g.save(); head(); g.clip();
  // cel crescent on the lower right + soft cheek bounce
  g.fillStyle = SHADE; g.beginPath(); g.arc(0, 0, 0.26, 0, Math.PI * 2); g.arc(-0.045, -0.04, 0.262, 0, Math.PI * 2, true); g.fill('evenodd');
  g.fillStyle = 'rgba(255,255,255,0.3)'; ell(g, -0.12, -0.13, 0.07, 0.035, -0.6); g.fill();
  g.restore();
  head(); ink(g, lw);
  drawFace(g, o, expression, blink, lw, iw);
  drawHairFront(g, o, lw, iw);
  drawHeadwear(g, o, lw, iw);
  g.restore();
}

function drawFace(g, o, ex, blink, lw, iw) {
  const P = o.palette; const ey = -0.005, ex0 = 0.094;
  g.fillStyle = ex === 'angry' ? 'rgba(230,60,60,0.38)' : 'rgba(245,105,120,0.3)';
  ell(g, -0.152, 0.088, 0.047, 0.027); g.fill(); ell(g, 0.152, 0.088, 0.047, 0.027); g.fill();
  if (ex === 'angry') { g.fillStyle = 'rgba(220,50,50,0.13)'; g.beginPath(); g.arc(0, 0, 0.25, -Math.PI * 0.95, -Math.PI * 0.05); g.fill(); }
  const look = ex === 'nervous' ? [0.013, 0.004] : ex === 'smug' ? [0.009, 0] : [0, 0];
  for (const sx of [-1, 1]) {
    const x = sx * ex0;
    if (ex === 'laughing') { g.beginPath(); g.moveTo(x - 0.042, ey + 0.012); g.quadraticCurveTo(x, ey - 0.048, x + 0.042, ey + 0.012); ink(g, lw * 1.05); continue; }
    if (blink) { g.beginPath(); g.moveTo(x - 0.04, ey + 0.004); g.quadraticCurveTo(x, ey + 0.024, x + 0.04, ey + 0.004); ink(g, lw * 1.05); if (o.lashes) { g.beginPath(); g.moveTo(x + sx * 0.04, ey + 0.004); g.lineTo(x + sx * 0.055, ey - 0.006); ink(g, iw); } continue; }
    const big = ex === 'shocked' ? 1.25 : 1;
    const rx = 0.043 * big, ry = (ex === 'angry' ? 0.043 : 0.056) * big;
    ell(g, x, ey, rx, ry); g.fillStyle = '#ffffff'; g.fill();
    g.save(); ell(g, x, ey, rx, ry); g.clip(); g.fillStyle = 'rgba(80,60,140,0.14)'; g.fillRect(x - rx, ey - ry, 2 * rx, ry * 0.55); g.restore();
    const ir = ex === 'shocked' ? 0.018 : 0.027;
    g.fillStyle = P.eyes || '#3b2a20'; ell(g, x + look[0], ey + 0.007 + look[1], ir, ir * 1.08); g.fill();
    g.fillStyle = INK; ell(g, x + look[0], ey + 0.008 + look[1], ir * 0.55, ir * 0.6); g.fill();
    g.fillStyle = '#ffffff'; ell(g, x + look[0] + ir * 0.4, ey - ir * 0.25, ir * 0.3, ir * 0.3); g.fill(); ell(g, x + look[0] - ir * 0.35, ey + ir * 0.55, ir * 0.13, ir * 0.13); g.fill();
    ell(g, x, ey, rx, ry); ink(g, iw * 1.2);
    if (o.lashes) { g.beginPath(); g.moveTo(x + sx * rx * 0.75, ey - ry * 0.68); g.lineTo(x + sx * (rx + 0.016), ey - ry * 0.95); g.moveTo(x + sx * rx * 0.95, ey - ry * 0.3); g.lineTo(x + sx * (rx + 0.018), ey - ry * 0.45); ink(g, iw * 1.3); }
    if (ex === 'smug') {
      g.save(); ell(g, x, ey, rx + 0.003, ry + 0.003); g.clip(); g.fillStyle = P.skin; g.fillRect(x - rx - 0.01, ey - ry - 0.01, 2 * rx + 0.02, ry + 0.006); g.restore();
      g.beginPath(); g.moveTo(x - rx - 0.004, ey - 0.004); g.quadraticCurveTo(x, ey - 0.012, x + rx + 0.004, ey - 0.004); ink(g, lw);
    }
    if (ex === 'angry') {
      g.save(); ell(g, x, ey, rx + 0.003, ry + 0.003); g.clip(); g.fillStyle = P.skin; g.beginPath(); g.moveTo(x - rx - 0.01, ey - ry - 0.01); g.lineTo(x + rx + 0.01, ey - ry - 0.01);
      g.lineTo(x + rx + 0.01, ey + (sx < 0 ? 0.0 : -0.032)); g.lineTo(x - rx - 0.01, ey + (sx < 0 ? -0.032 : 0.0)); g.closePath(); g.fill(); g.restore();
      g.beginPath(); g.moveTo(x - rx, ey + (sx < 0 ? -0.032 : 0.0)); g.lineTo(x + rx, ey + (sx < 0 ? 0.0 : -0.032)); ink(g, lw);
    }
  }
  if (o.glasses) { for (const sx of [-1, 1]) { rrect(g, sx * ex0 - 0.064, ey - 0.052, 0.128, 0.1, 0.035); g.fillStyle = 'rgba(200,230,255,0.12)'; g.fill(); ink(g, lw * 0.85); } g.beginPath(); g.moveTo(-0.03, ey - 0.012); g.quadraticCurveTo(0, ey - 0.026, 0.03, ey - 0.012); ink(g, lw * 0.85); }
  // brows: tapered filled strokes
  const B = { neutral: [0, 0, 0], shocked: [0.12, -0.12, 0.038], nervous: [-0.34, 0.34, 0.014], smug: [0.1, -0.32, 0.008], angry: [0.5, -0.5, -0.014], laughing: [0, 0, 0.022] }[ex];
  for (const sx of [-1, 1]) {
    const lift = B[2] + (ex === 'smug' && sx > 0 ? 0.034 : 0);
    g.save(); g.translate(sx * ex0, ey - 0.082 - lift); g.rotate(sx < 0 ? B[0] : B[1]); g.scale(sx, 1);
    g.beginPath(); g.moveTo(-0.036, 0.008); g.quadraticCurveTo(0, -0.016, 0.038, 0.0); g.quadraticCurveTo(0.004, -0.004, -0.036, 0.016); g.closePath();
    g.fillStyle = P.brow || shade(P.hair === '#f4f4f4' || P.hair === '#c9c9cf' ? '#8a8a92' : P.hair, -0.06); g.fill(); g.lineWidth = iw * 0.8; g.strokeStyle = INK; g.stroke(); g.restore();
  }
  g.beginPath(); g.moveTo(-0.004, 0.034); g.quadraticCurveTo(0.022, 0.054, -0.002, 0.066); ink(g, iw * 1.1);
  if (o.beard) { const bc = P.beard || P.hair; g.beginPath(); g.moveTo(-0.18, 0.08); g.quadraticCurveTo(-0.16, 0.26, 0, 0.262); g.quadraticCurveTo(0.16, 0.26, 0.18, 0.08); g.quadraticCurveTo(0.1, 0.168, 0, 0.165); g.quadraticCurveTo(-0.1, 0.168, -0.18, 0.08); g.fillStyle = bc; g.fill(); g.save(); g.clip(); g.fillStyle = SHADE; g.fillRect(0.02, 0, 0.3, 0.3); g.restore(); ink(g, lw); }
  if (o.mustache) { const bc = P.beard || P.hair; g.beginPath(); g.moveTo(0, 0.083); g.quadraticCurveTo(-0.055, 0.066, -0.082, 0.104); g.quadraticCurveTo(-0.042, 0.108, 0, 0.096); g.quadraticCurveTo(0.042, 0.108, 0.082, 0.104); g.quadraticCurveTo(0.055, 0.066, 0, 0.083); fillInk(g, bc, iw * 1.2); }
  const my = 0.128;
  if (ex === 'neutral') { g.beginPath(); g.moveTo(-0.048, my - 0.006); g.quadraticCurveTo(0, my + 0.028, 0.048, my - 0.006); ink(g, lw); }
  if (ex === 'smug') { g.beginPath(); g.moveTo(-0.042, my + 0.004); g.quadraticCurveTo(0.014, my + 0.024, 0.062, my - 0.02); ink(g, lw); g.beginPath(); g.moveTo(0.058, my - 0.026); g.lineTo(0.068, my - 0.012); ink(g, iw); }
  if (ex === 'nervous') {
    g.beginPath(); g.moveTo(-0.054, my); g.lineTo(0.054, my); g.quadraticCurveTo(0.054, my + 0.034, 0, my + 0.034); g.quadraticCurveTo(-0.054, my + 0.034, -0.054, my); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw);
    g.beginPath(); g.moveTo(-0.052, my + 0.015); g.lineTo(0.052, my + 0.015); for (let k = -2; k <= 2; k++) { g.moveTo(k * 0.021, my); g.lineTo(k * 0.021, my + 0.032); } ink(g, iw * 0.7);
    g.beginPath(); g.moveTo(0.205, -0.135); g.quadraticCurveTo(0.242, -0.072, 0.22, -0.05); g.quadraticCurveTo(0.188, -0.05, 0.205, -0.135); fillInk(g, '#9bdcff', iw * 1.2);
    g.fillStyle = '#ffffff'; ell(g, 0.214, -0.07, 0.005, 0.009); g.fill();
  }
  if (ex === 'shocked') { ell(g, 0, my + 0.014, 0.032, 0.046); fillInk(g, '#5a1f2e', lw); g.fillStyle = '#ff7f8f'; ell(g, 0, my + 0.04, 0.018, 0.012); g.fill(); }
  if (ex === 'angry') {
    rrect(g, -0.058, my - 0.013, 0.116, 0.042, 0.013); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw);
    g.beginPath(); g.moveTo(-0.058, my + 0.008); g.lineTo(0.058, my + 0.008); for (let k = -1; k <= 1; k++) { g.moveTo(k * 0.028, my - 0.013); g.lineTo(k * 0.028, my + 0.029); } ink(g, iw * 0.7);
  }
  if (ex === 'laughing') {
    const path = () => { g.beginPath(); g.moveTo(-0.074, my - 0.022); g.quadraticCurveTo(0, my - 0.032, 0.074, my - 0.022); g.quadraticCurveTo(0.064, my + 0.08, 0, my + 0.083); g.quadraticCurveTo(-0.064, my + 0.08, -0.074, my - 0.022); g.closePath(); };
    path(); g.fillStyle = '#5a1f2e'; g.fill();
    g.save(); path(); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(-0.09, my - 0.045, 0.18, 0.037); g.fillStyle = '#ff7f8f'; ell(g, 0, my + 0.08, 0.044, 0.032); g.fill(); g.restore();
    path(); ink(g, lw);
  }
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

function drawUpperArm(g, o, d) {
  const P = o.palette, st = style(o), r = d.limb / 2, L = d.upper;
  cel(g, () => capsule(g, 0, 0, L, r), P.skin, { shadeFn: limbShade(r, 0, L) });
  if (st.sleeve === 'long' || st.sleeve === 'bell') cel(g, () => capsule(g, 0, 0, L, r * 1.22), st.sleeveCol, { shadeFn: limbShade(r * 1.22, 0, L), lightFn: () => g.fillRect(-r * 1.15, -r, r * 0.35, L) });
  else cel(g, () => { g.beginPath(); g.moveTo(-r * 1.5, -r * 0.6); g.lineTo(-r * 1.38, L * 0.46); g.quadraticCurveTo(0, L * 0.52, r * 1.38, L * 0.46); g.lineTo(r * 1.5, -r * 0.6); g.quadraticCurveTo(0, -r * 1.9, -r * 1.5, -r * 0.6); }, st.sleeveCol, { shadeFn: limbShade(r * 1.4, 0, L) });
}
function drawForearm(g, o, d) {
  const P = o.palette, st = style(o), r = d.limb / 2, L = d.lower, hr = d.hand;
  cel(g, () => capsule(g, 0, 0, L, r), P.skin, { shadeFn: limbShade(r, 0, L) });
  if (st.sleeve === 'long') {
    cel(g, () => capsule(g, 0, 0, L * 0.8, r * 1.22), st.sleeveCol, { shadeFn: limbShade(r * 1.22, 0, L * 0.8) });
    if (st.cuff === 'rib') { rrect(g, -r * 1.25, L * 0.7, r * 2.5, L * 0.12, 0.006); fillInk(g, shade(st.sleeveCol, -0.08), INNER * 1.2); }
    else if (st.cuff) { rrect(g, -r * 1.2, L * 0.72, r * 2.4, L * 0.1, 0.006); fillInk(g, st.cuff, INNER * 1.2); }
  }
  if (st.sleeve === 'bell') cel(g, () => { g.beginPath(); g.moveTo(-r * 1.2, 0); g.lineTo(-r * 2.6, L * 0.82); g.quadraticCurveTo(0, L * 0.95, r * 2.6, L * 0.82); g.lineTo(r * 1.2, 0); g.closePath(); }, st.sleeveCol, { shadeFn: limbShade(r * 2, 0, L) });
  // hand: palm + thumb + finger hints
  ell(g, -hr * 0.78, L + hr * 0.18, hr * 0.42, hr * 0.56, 0.5); fillInk(g, P.skin);
  cel(g, () => ell(g, 0, L + hr * 0.78, hr, hr * 1.06), P.skin, { shadeFn: () => g.fillRect(hr * 0.2, L, hr * 2, hr * 3) });
  g.beginPath(); for (const k of [-0.35, 0.05, 0.42]) { g.moveTo(k * hr, L + hr * 1.35); g.lineTo(k * hr * 1.05, L + hr * 1.7); } ink(g, INNER * 0.8);
}
function drawLeg(g, o, d, side) {
  const P = o.palette, st = style(o), r = d.leg / 2, L = d.legLen;
  const foot = L - d.shoe * 0.45;
  cel(g, () => capsule(g, 0, 0, foot, r), st.pants ? P.bottom : P.skin, { shadeFn: limbShade(r, 0, foot), lightFn: () => g.fillRect(-r, 0, r * 0.3, foot) });
  if (st.shoe === 'sandal') for (const y of [foot - 0.075, foot - 0.03]) { g.beginPath(); g.moveTo(-r, y); g.lineTo(r, y + 0.016); g.lineWidth = INNER * 1.6; g.strokeStyle = '#6b3a1e'; g.stroke(); }
  if (st.pants && o.outfit === 'casual') { g.beginPath(); g.moveTo(-r * 0.2 * side, foot * 0.2); g.lineTo(-r * 0.25 * side, foot - 0.04); ink(g, INNER * 0.7); }
  const sl = d.shoe, sh = d.shoe * 0.45;
  const shoeCol = st.shoe === 'sneaker' ? (P.shoes || '#ffffff') : st.shoe === 'sandal' ? '#8b5a2b' : (P.shoes || '#2a2230');
  // shoe as seen from the front, pointing a little outward
  const shoe = () => { g.beginPath(); g.moveTo(-r * 1.05, foot - sh * 0.55); g.quadraticCurveTo(-sl * 0.62, foot - sh * 0.4, -sl * 0.62 + side * sl * 0.18, L - sh * 0.3); g.quadraticCurveTo(-sl * 0.6 + side * sl * 0.2, L, 0, L); g.quadraticCurveTo(sl * 0.6 + side * sl * 0.2, L, sl * 0.62 + side * sl * 0.18, L - sh * 0.3); g.quadraticCurveTo(sl * 0.62, foot - sh * 0.4, r * 1.05, foot - sh * 0.55); g.closePath(); };
  cel(g, shoe, shoeCol, { shadeFn: () => g.fillRect(sl * 0.1, foot - sh, sl, sh * 2), lightFn: () => { ell(g, -sl * 0.22, foot - sh * 0.05, sl * 0.18, sh * 0.16); g.fill(); } });
  if (st.shoe !== 'sandal') { g.save(); shoe(); g.clip(); g.fillStyle = st.shoe === 'sneaker' ? (P.accent || '#d8343b') : shade(shoeCol, -0.12); g.fillRect(-sl, L - sh * 0.28, sl * 2, sh * 0.3); g.restore(); shoe(); ink(g); }
}

// ---------------------------------------------------------------- createCharacter
let SEED = 1;
export function createCharacter(options = {}) {
  const o = {
    name: 'Character', height: 1.75, outfit: 'casual', type: null, hair: 'short', headwear: 'none',
    expression: 'neutral', gesture: 'rest', glasses: false, beard: false, mustache: false, lashes: false,
    seed: SEED++, emissive: '#5c5c5c', ...options,
  };
  if (!o.type) o.type = options.era || OUTFITS[o.outfit][0];
  o.palette = { skin: '#efbf98', hair: '#3a2416', top: '#3b82c4', bottom: '#3a4a6b', shoes: null, accent: '#f2c23c', eyes: '#3b2a20', ...(options.palette || {}) };
  const u = o.height / 3.5;
  const d = {
    head: u * PLAN.head, torso: u * PLAN.torso, neck: u * PLAN.neck, legLen: u * PLAN.leg,
    shoulder: u * 0.92, hip: u * 0.68, limb: u * 0.135, leg: u * 0.17, upper: u * 0.66, lower: u * 0.58, hand: u * 0.088, shoe: u * 0.27,
  };
  // ---- one set of textures, two rigs (visible + shadow twin)
  const gown = o.outfit === 'historical' && o.type === 'medieval';
  const coat = (o.outfit === 'uniform' && o.type === 'doctor') || (o.outfit === 'historical' && o.type === 'victorian');
  const hemExtra = gown ? d.legLen + 0.1 : coat ? 0.52 : o.type === 'roman' ? 0.36 : 0.14;
  const legW = d.shoe * 1.6 + 0.06;
  const cards = {
    leg: [-1, 1].map((side) => { const k = makeCard(legW, d.legLen + 0.06, legW / 2, 0.02); k.draw((g) => drawLeg(g, o, d, side)); return k; }),
    torso: (() => { const W = d.shoulder + (gown ? 0.62 : 0.16); const k = makeCard(W, d.torso + d.neck + hemExtra + 0.2, W / 2, d.torso + d.neck + 0.17); k.draw((g) => drawTorso(g, o, d)); return k; })(),
    upper: (() => { const k = makeCard(d.limb * 3.4, d.upper + d.limb * 2, d.limb * 1.7, d.limb); k.draw((g) => drawUpperArm(g, o, d)); return k; })(),
    lower: (() => { const w = Math.max(d.hand * 3.6, d.limb * 3.6); const k = makeCard(w, d.lower + d.hand * 2.8, w / 2, d.limb * 0.8); k.draw((g) => drawForearm(g, o, d)); return k; })(),
  };
  const hs = d.head / 0.5, hW = 1.0 * hs, hH = 1.35 * hs;
  cards.head = makeCard(hW, hH + 0.25 * hs, hW / 2, hH);
  if (BACK_LAYER.includes(o.hair)) { cards.hairBack = makeCard(hW, hH + 0.25 * hs, hW / 2, hH); cards.hairBack.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); g_ = g; drawHairBack(g, o, OUTLINE / hs, INNER / hs); }); }
  const litMat = (tex) => new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(o.emissive), alphaTest: 0.5, side: THREE.DoubleSide });
  const shadowMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  function buildRig(isShadow) {
    const mesh = (card) => { const m = new THREE.Mesh(card.geo, isShadow ? shadowMat(card.tex) : litMat(card.tex)); m.castShadow = isShadow; m.receiveShadow = false; m.userData.characterPart = isShadow ? 'shadow' : 'visible'; if (isShadow) m.renderOrder = -50; return m; };
    const rig = new THREE.Group(); rig.name = isShadow ? 'shadowRig' : 'rig';
    const hips = new THREE.Group(); hips.position.y = d.legLen; rig.add(hips);
    const legs = {};
    [['left', -1], ['right', 1]].forEach(([name, side], i) => { const j = new THREE.Group(); j.position.set(side * d.hip * 0.27, 0, -0.012); j.add(mesh(cards.leg[i])); hips.add(j); legs[name] = j; });
    const torso = new THREE.Group(); hips.add(torso); torso.add(mesh(cards.torso));
    const arms = {};
    for (const [name, side] of [['left', -1], ['right', 1]]) {
      const sh = new THREE.Group(); sh.position.set(side * (d.shoulder / 2 - d.limb * 0.55), d.torso - 0.035, 0.014); torso.add(sh);
      const ua = mesh(cards.upper); sh.add(ua);
      const el = new THREE.Group(); el.position.set(0, -d.upper, 0.004); sh.add(el);
      const fa = mesh(cards.lower); el.add(fa);
      arms[name] = { shoulder: sh, elbow: el, side };
    }
    const head = new THREE.Group(); head.position.set(0, d.torso + d.neck, 0.024); torso.add(head); head.add(mesh(cards.head));
    if (cards.hairBack) { const hb = mesh(cards.hairBack); hb.position.z = -0.06; head.add(hb); }
    return { rig, hips, torso, legs, arms, head };
  }
  const group = new THREE.Group(); group.name = o.name;
  const V = buildRig(false), S = buildRig(true);
  group.add(V.rig, S.rig);
  const rigs = [V, S];

  // ---------------- api
  let expression = o.expression, blinking = false;
  const drawH = () => cards.head.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); drawHead(g, o, expression, blinking && expression !== 'laughing', 0.25, { skipBack: true }); });
  drawH();
  function setArm(side, shoulder, elbow) {
    for (const R of rigs) { const a = R.arms[side]; a.shoulder.rotation.z = a.side * shoulder; a.elbow.rotation.z = -a.side * elbow; }
  }
  function setGesture(g) { const p = typeof g === 'string' ? GESTURES[g] : g; setArm('left', ...p.left); setArm('right', ...p.right); o.gesture = g; }
  setGesture(o.gesture);
  let rs = o.seed * 9301 + 49297; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
  const blinks = []; for (let t = 0.6 + rnd() * 2; t < 900; t += 2.4 + rnd() * 2.8) blinks.push(t);
  function update(t) {
    const br = Math.sin(t * Math.PI * 2 / 3.4 + o.seed);
    for (const R of rigs) {
      R.torso.scale.set(1 + br * 0.006, 1 + br * 0.014, 1);
      R.head.rotation.z = Math.sin(t * 0.9 + o.seed) * 0.025;
      for (const a of Object.values(R.arms)) a.shoulder.position.y = d.torso - 0.035 + br * 0.004;
    }
    const b = blinks.some((x) => t >= x && t < x + 0.13);
    if (b !== blinking) { blinking = b; drawH(); }
  }
  function setExpression(ex) { if (!EXPRESSIONS.includes(ex)) throw new Error('unknown expression ' + ex); expression = ex; drawH(); }
  const wp = new THREE.Vector3();
  function faceCamera(cam) { group.getWorldPosition(wp); V.rig.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z) - group.rotation.y; }
  function faceLight(light) {
    // accepts a DirectionalLight (uses position - target) or a direction Vector3 pointing toward the light
    const dir = light.isLight ? new THREE.Vector3().subVectors(light.position, light.target ? light.target.position : new THREE.Vector3()) : light;
    S.rig.rotation.y = Math.atan2(dir.x, dir.z) - group.rotation.y;
  }
  return {
    group, options: o, dims: d, joints: V, shadowJoints: S,
    setExpression, setArm, setGesture, update, faceCamera, faceLight,
    get expression() { return expression; },
  };
}
