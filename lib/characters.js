// characters.js — reusable flat 2D characters rigged to stand in a lit 3D world.
//
//   import { createCharacter } from './characters.js';
//   const c = createCharacter({ outfit: 'suit', expression: 'smug', gesture: 'hips' });
//   scene.add(c.group);           // feet at y = 0, faces +z
//   c.setExpression('shocked');   // neutral | shocked | nervous | smug | angry | laughing
//   c.setArm('right', 1.2, 0.4);  // shoulder raise, elbow bend (radians)
//   c.update(seconds);            // idle breathing + blinking
//   c.faceCamera(camera);         // yaw-only billboard
//
// Every part is a flat, alpha-tested canvas card. Cards use a lit material, so they catch the
// key light, and they cast real silhouette shadows (three.js copies map + alphaTest into the
// shadow pass). Proportions are fixed: 3.5 heads tall, round head, thin limbs, 12 mm ink lines.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
export const INK = '#151018';
export const OUTLINE = 0.012;              // ink line width in metres, identical on every part
const PPM = 900;                            // texture pixels per metre (same density on every part)
export const EXPRESSIONS = ['neutral', 'shocked', 'nervous', 'smug', 'angry', 'laughing'];
export const OUTFITS = ['casual', 'suit', 'uniform', 'historical'];
export const HAIRSTYLES = ['bald', 'short', 'sidepart', 'spiky', 'curly', 'afro', 'bun', 'ponytail', 'long', 'bob'];
export const HEADWEAR = ['none', 'cap', 'beanie', 'tophat', 'helmet', 'laurel'];

export const PALETTES = {
  skin: ['#f6d2b8', '#eab68f', '#d39a6d', '#a8693f', '#7a4a2b', '#5c3620'],
  hair: ['#1e1716', '#4a2c1a', '#8a5a2f', '#d8a64a', '#b9461f', '#c9c9cf', '#f2f2f2'],
};

// body plan, in "head units" (u = height / 3.5)
const PLAN = { head: 1.0, neck: 0.1, torso: 1.2, leg: 1.2 };   // 1.0 + 0.1 + 1.2 + 1.2 = 3.5

// gesture presets: [shoulder, elbow] per side; positive shoulder lifts the arm away from the body,
// positive elbow folds the forearm up toward the body's centre line.
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
};

// ---------------------------------------------------------------- canvas helpers
function shade(hex, k) {
  const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 }; c.getHSL(h);
  c.setHSL(h.h, Math.min(1, h.s * (k < 0 ? 1.05 : 0.95)), Math.max(0, Math.min(1, h.l + k)));
  return '#' + c.getHexString();
}
function ink(g, w = OUTLINE) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
function fillInk(g, col, w) { g.fillStyle = col; g.fill(); ink(g, w); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
function capsule(g, x, y0, y1, r) { g.beginPath(); g.moveTo(x - r, y0); g.lineTo(x - r, y1); g.arc(x, y1, r, Math.PI, 0, true); g.lineTo(x + r, y0); g.arc(x, y0, r, 0, Math.PI, true); g.closePath(); }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function clipShade(g, pathFn, x0, x1, y0, y1) {
  // soft form shading inside a shape: light on the left, shade on the right (matches a left key light)
  g.save(); pathFn(); g.clip();
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(40,20,60,0)'); gr.addColorStop(1, 'rgba(40,20,60,0.22)');
  g.fillStyle = gr; g.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2); g.restore();
}

// A card: canvas drawn in metres (y down) with the pivot ("anchor") at (ax, ay).
function makeCard(wM, hM, ax, ay, lit) {
  const c = document.createElement('canvas'); c.width = Math.ceil(wM * PPM); c.height = Math.ceil(hM * PPM);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(wM, hM); geo.translate(wM / 2 - ax, -(hM / 2 - ay), 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(lit.emissive), alphaTest: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = lit.receive;
  mesh.userData.card = true;
  const draw = (fn) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(PPM, 0, 0, PPM, ax * PPM, ay * PPM); fn(g); tex.needsUpdate = true; };
  return { mesh, draw, tex, canvas: c };
}

// ---------------------------------------------------------------- the head (also used for 2D thumbnails)
// Draws the head centred at (0,0) with radius R, in the caller's units.
export function drawHead(g, o, expression = 'neutral', blink = false, R = 0.25) {
  const s = R / 0.25; g.save(); g.scale(s, s); const L = OUTLINE / s * s; // line width stays OUTLINE in caller units
  const lw = OUTLINE / s;
  const P = o.palette;
  // hair that sits behind the head
  drawHairBack(g, o, lw);
  // ears
  for (const sx of [-1, 1]) { ell(g, sx * 0.245, 0.03, 0.045, 0.06); fillInk(g, P.skin, lw); ell(g, sx * 0.245, 0.03, 0.02, 0.03); g.fillStyle = shade(P.skin, -0.12); g.fill(); }
  // skull
  const head = () => { g.beginPath(); g.arc(0, 0, 0.25, 0, Math.PI * 2); };
  head(); g.fillStyle = P.skin; g.fill();
  g.save(); head(); g.clip();
  const gr = g.createRadialGradient(-0.08, -0.1, 0.02, 0, 0, 0.27); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(110,40,60,0.22)');
  g.fillStyle = gr; g.fillRect(-0.3, -0.3, 0.6, 0.6); g.restore();
  head(); ink(g, lw);
  drawFace(g, o, expression, blink, lw);
  drawHairFront(g, o, lw);
  drawHeadwear(g, o, lw);
  g.restore();
}

function drawFace(g, o, ex, blink, lw) {
  const P = o.palette; const ey = -0.005, ex0 = 0.092;
  // cheeks
  g.fillStyle = ex === 'angry' ? 'rgba(230,70,70,0.35)' : 'rgba(240,110,120,0.28)';
  ell(g, -0.15, 0.085, 0.045, 0.026); g.fill(); ell(g, 0.15, 0.085, 0.045, 0.026); g.fill();
  if (ex === 'angry') { g.fillStyle = 'rgba(220,60,60,0.12)'; g.beginPath(); g.arc(0, 0, 0.25, -Math.PI * 0.95, -Math.PI * 0.05); g.fill(); }
  const look = ex === 'nervous' ? [0.012, 0.004] : ex === 'smug' ? [0.008, 0] : [0, 0];
  // eyes
  for (const sx of [-1, 1]) {
    const x = sx * ex0;
    if (ex === 'laughing') { g.beginPath(); g.moveTo(x - 0.04, ey + 0.012); g.quadraticCurveTo(x, ey - 0.045, x + 0.04, ey + 0.012); ink(g, lw * 1.1); continue; }
    if (blink) { g.beginPath(); g.moveTo(x - 0.038, ey + 0.004); g.quadraticCurveTo(x, ey + 0.022, x + 0.038, ey + 0.004); ink(g, lw * 1.1); continue; }
    const big = ex === 'shocked' ? 1.28 : 1;
    const rx = 0.042 * big, ry = (ex === 'angry' ? 0.042 : 0.055) * big;
    ell(g, x, ey, rx, ry); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw * 0.85);
    const pr = ex === 'shocked' ? 0.015 : 0.023;
    g.fillStyle = INK; ell(g, x + look[0], ey + 0.006 + look[1], pr, pr * 1.08); g.fill();
    g.fillStyle = '#ffffff'; ell(g, x + look[0] + 0.007, ey - 0.003, 0.0055, 0.0055); g.fill();
    if (ex === 'smug') { // heavy lids
      g.save(); ell(g, x, ey, rx + 0.002, ry + 0.002); g.clip(); g.fillStyle = P.skin; g.fillRect(x - rx - 0.01, ey - ry - 0.01, 2 * rx + 0.02, ry + 0.007); g.restore();
      g.beginPath(); g.moveTo(x - rx - 0.004, ey - 0.003); g.lineTo(x + rx + 0.004, ey - 0.003); ink(g, lw * 1.1);
    }
    if (ex === 'angry') { // brow-shaped lid cut
      g.save(); ell(g, x, ey, rx + 0.002, ry + 0.002); g.clip(); g.fillStyle = P.skin; g.beginPath(); g.moveTo(x - rx - 0.01, ey - ry - 0.01); g.lineTo(x + rx + 0.01, ey - ry - 0.01);
      g.lineTo(x + rx + 0.01, ey + (sx < 0 ? 0.0 : -0.03)); g.lineTo(x - rx - 0.01, ey + (sx < 0 ? -0.03 : 0.0)); g.closePath(); g.fill(); g.restore();
    }
  }
  if (o.glasses) { for (const sx of [-1, 1]) { ell(g, sx * ex0, ey, 0.058, 0.052); ink(g, lw * 0.9); } g.beginPath(); g.moveTo(-0.027, ey - 0.008); g.quadraticCurveTo(0, ey - 0.02, 0.027, ey - 0.008); ink(g, lw * 0.9); }
  // brows
  const B = { neutral: [0, 0, 0], shocked: [0.12, -0.12, 0.035], nervous: [-0.32, 0.32, 0.012], smug: [0.12, -0.3, 0.008], angry: [0.45, -0.45, -0.012], laughing: [0, 0, 0.02] }[ex];
  for (const sx of [-1, 1]) {
    const lift = B[2] + (ex === 'smug' && sx > 0 ? 0.03 : 0);
    g.save(); g.translate(sx * ex0, ey - 0.075 - lift); g.rotate(sx < 0 ? B[0] : B[1]);
    g.beginPath(); g.moveTo(-0.032, 0.004); g.quadraticCurveTo(0, -0.01, 0.032, 0.004);
    g.lineWidth = lw * 2.2; g.strokeStyle = o.palette.brow || shade(o.palette.hair, -0.05); g.lineCap = 'round'; g.stroke(); g.restore();
  }
  // nose
  g.beginPath(); g.moveTo(-0.006, 0.035); g.quadraticCurveTo(0.018, 0.052, -0.004, 0.064); ink(g, lw * 0.8);
  // facial hair
  if (o.beard) { g.beginPath(); g.moveTo(-0.17, 0.09); g.quadraticCurveTo(-0.15, 0.25, 0, 0.255); g.quadraticCurveTo(0.15, 0.25, 0.17, 0.09); g.quadraticCurveTo(0.1, 0.17, 0, 0.165); g.quadraticCurveTo(-0.1, 0.17, -0.17, 0.09); fillInk(g, o.palette.hair, lw); }
  if (o.mustache) { g.beginPath(); g.moveTo(0, 0.085); g.quadraticCurveTo(-0.05, 0.07, -0.075, 0.1); g.quadraticCurveTo(-0.04, 0.105, 0, 0.095); g.quadraticCurveTo(0.04, 0.105, 0.075, 0.1); g.quadraticCurveTo(0.05, 0.07, 0, 0.085); fillInk(g, o.palette.hair, lw * 0.8); }
  // mouth
  const my = 0.125;
  if (ex === 'neutral') { g.beginPath(); g.moveTo(-0.045, my - 0.005); g.quadraticCurveTo(0, my + 0.025, 0.045, my - 0.005); ink(g, lw); }
  if (ex === 'smug') { g.beginPath(); g.moveTo(-0.04, my + 0.004); g.quadraticCurveTo(0.012, my + 0.022, 0.058, my - 0.018); ink(g, lw); }
  if (ex === 'nervous') {
    g.beginPath(); g.moveTo(-0.05, my); g.lineTo(0.05, my); g.quadraticCurveTo(0.05, my + 0.032, 0, my + 0.032); g.quadraticCurveTo(-0.05, my + 0.032, -0.05, my); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw);
    g.beginPath(); g.moveTo(-0.05, my + 0.014); g.lineTo(0.05, my + 0.014); for (let k = -2; k <= 2; k++) { g.moveTo(k * 0.02, my); g.lineTo(k * 0.02, my + 0.03); } ink(g, lw * 0.5);
    // sweat drop
    g.beginPath(); g.moveTo(0.2, -0.13); g.quadraticCurveTo(0.235, -0.07, 0.215, -0.05); g.quadraticCurveTo(0.185, -0.05, 0.2, -0.13); fillInk(g, '#9bdcff', lw * 0.8);
  }
  if (ex === 'shocked') { ell(g, 0, my + 0.012, 0.03, 0.042); fillInk(g, '#5a1f2e', lw); }
  if (ex === 'angry') {
    rrect(g, -0.055, my - 0.012, 0.11, 0.04, 0.012); g.fillStyle = '#ffffff'; g.fill(); ink(g, lw);
    g.beginPath(); g.moveTo(-0.055, my + 0.008); g.lineTo(0.055, my + 0.008); for (let k = -1; k <= 1; k++) { g.moveTo(k * 0.027, my - 0.012); g.lineTo(k * 0.027, my + 0.028); } ink(g, lw * 0.5);
  }
  if (ex === 'laughing') {
    const path = () => { g.beginPath(); g.moveTo(-0.07, my - 0.02); g.quadraticCurveTo(0, my - 0.03, 0.07, my - 0.02); g.quadraticCurveTo(0.06, my + 0.075, 0, my + 0.078); g.quadraticCurveTo(-0.06, my + 0.075, -0.07, my - 0.02); g.closePath(); };
    path(); g.fillStyle = '#5a1f2e'; g.fill();
    g.save(); path(); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(-0.08, my - 0.04, 0.16, 0.035); g.fillStyle = '#ff7f8f'; ell(g, 0, my + 0.075, 0.04, 0.03); g.fill(); g.restore();
    path(); ink(g, lw);
  }
}

function drawHairBack(g, o, lw) {
  const H = o.palette.hair, st = o.hair;
  if (st === 'long') { g.beginPath(); g.moveTo(-0.27, -0.05); g.quadraticCurveTo(-0.33, 0.25, -0.24, 0.42); g.lineTo(0.24, 0.42); g.quadraticCurveTo(0.33, 0.25, 0.27, -0.05); g.closePath(); fillInk(g, shade(H, -0.04), lw); }
  if (st === 'bob') { g.beginPath(); g.moveTo(-0.285, -0.05); g.quadraticCurveTo(-0.31, 0.15, -0.25, 0.2); g.lineTo(0.25, 0.2); g.quadraticCurveTo(0.31, 0.15, 0.285, -0.05); g.closePath(); fillInk(g, shade(H, -0.04), lw); }
  if (st === 'ponytail') { g.beginPath(); g.moveTo(0.17, -0.2); g.quadraticCurveTo(0.42, -0.2, 0.36, 0.12); g.quadraticCurveTo(0.33, 0.24, 0.27, 0.27); g.quadraticCurveTo(0.31, 0.05, 0.2, -0.05); g.closePath(); fillInk(g, H, lw); }
  if (st === 'bun') { ell(g, 0, -0.27, 0.09, 0.075); fillInk(g, H, lw); }
  if (st === 'afro') { g.beginPath(); for (let i = 0; i <= 16; i++) { const a = Math.PI * (0.92 + 1.16 * i / 16); const r = 0.335 + (i % 2) * 0.025; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.04) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r - 0.04); } g.closePath(); fillInk(g, H, lw); }
  if (st === 'curly') { for (let i = 0; i < 11; i++) { const a = Math.PI * (1.0 + i / 10); ell(g, Math.cos(a) * 0.255, Math.sin(a) * 0.255 - 0.005, 0.065, 0.065); fillInk(g, H, lw); } }
}
function drawHairFront(g, o, lw) {
  const H = o.palette.hair, st = o.hair; if (st === 'bald') { g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, -0.09, -0.16, 0.06, 0.025, -0.5); g.fill(); return; }
  const cap = (dy = 0) => { g.beginPath(); g.arc(0, 0, 0.25, Math.PI * 1.04, Math.PI * 1.96); };
  g.save(); g.beginPath(); g.arc(0, 0, 0.25 + lw / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = H;
  if (st === 'short' || st === 'curly' || st === 'afro' || st === 'bun' || st === 'ponytail' || st === 'long' || st === 'bob') {
    g.beginPath(); g.moveTo(-0.27, -0.02); g.quadraticCurveTo(-0.25, -0.3, 0, -0.29); g.quadraticCurveTo(0.25, -0.3, 0.27, -0.02);
    if (st === 'long' || st === 'bob' || st === 'ponytail' || st === 'bun') { g.quadraticCurveTo(0.12, -0.16, 0.02, -0.17); g.quadraticCurveTo(-0.1, -0.11, -0.27, -0.02); }
    else { g.quadraticCurveTo(0.17, -0.12, 0.08, -0.13); g.quadraticCurveTo(0, -0.1, -0.08, -0.13); g.quadraticCurveTo(-0.17, -0.12, -0.27, -0.02); }
    g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  }
  if (st === 'sidepart') { g.beginPath(); g.moveTo(-0.27, -0.0); g.quadraticCurveTo(-0.27, -0.3, 0.02, -0.29); g.quadraticCurveTo(0.27, -0.29, 0.27, -0.0); g.quadraticCurveTo(0.2, -0.13, 0.06, -0.15); g.quadraticCurveTo(-0.12, -0.2, -0.27, 0.0); g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); g.beginPath(); g.moveTo(-0.07, -0.27); g.quadraticCurveTo(-0.04, -0.2, -0.06, -0.17); ink(g, lw * 0.6); }
  if (st === 'spiky') { g.beginPath(); g.moveTo(-0.27, -0.02); for (let i = 0; i <= 8; i++) { const x = -0.26 + i * 0.065; g.lineTo(x, i % 2 ? -0.37 + Math.abs(i - 4) * 0.02 : -0.17); } g.lineTo(0.27, -0.02); g.quadraticCurveTo(0, -0.14, -0.27, -0.02); g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
  g.restore();
  // outline of the hairline crossing outside the head clip
  if (st === 'spiky') { g.beginPath(); g.moveTo(-0.27, -0.02); for (let i = 0; i <= 8; i++) { const x = -0.26 + i * 0.065; g.lineTo(x, i % 2 ? -0.37 + Math.abs(i - 4) * 0.02 : -0.17); } g.lineTo(0.27, -0.02); g.closePath(); g.save(); g.beginPath(); g.rect(-0.4, -0.5, 0.8, 0.5); g.clip(); g.beginPath(); g.moveTo(-0.27, -0.02); for (let i = 0; i <= 8; i++) { const x = -0.26 + i * 0.065; g.lineTo(x, i % 2 ? -0.37 + Math.abs(i - 4) * 0.02 : -0.17); } g.lineTo(0.27, -0.02); g.fillStyle = H; g.fill(); ink(g, lw); g.restore(); }
  if (st === 'curly' || st === 'afro') { g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 9; i++) { ell(g, -0.16 + i * 0.04, -0.2 + Math.sin(i) * 0.03, 0.012, 0.012); g.fill(); } }
  if (st !== 'spiky') { g.fillStyle = 'rgba(255,255,255,0.22)'; ell(g, -0.1, -0.22, 0.06, 0.018, -0.35); g.fill(); }
}
function drawHeadwear(g, o, lw) {
  const A = o.palette.hat || o.palette.accent || '#2f4f8f';
  if (o.headwear === 'cap') {
    g.beginPath(); g.moveTo(-0.26, -0.06); g.quadraticCurveTo(-0.26, -0.33, 0, -0.33); g.quadraticCurveTo(0.26, -0.33, 0.26, -0.06); g.closePath(); fillInk(g, A, lw);
    rrect(g, -0.29, -0.09, 0.58, 0.06, 0.02); fillInk(g, shade(A, -0.12), lw);
    ell(g, 0, -0.2, 0.045, 0.04); fillInk(g, o.palette.badge || '#f2c23c', lw * 0.8);
  }
  if (o.headwear === 'beanie') { g.beginPath(); g.moveTo(-0.265, -0.04); g.quadraticCurveTo(-0.27, -0.36, 0, -0.35); g.quadraticCurveTo(0.27, -0.36, 0.265, -0.04); g.closePath(); fillInk(g, A, lw); rrect(g, -0.28, -0.1, 0.56, 0.08, 0.03); fillInk(g, shade(A, -0.1), lw); ell(g, 0, -0.37, 0.05, 0.05); fillInk(g, shade(A, 0.12), lw); }
  if (o.headwear === 'tophat') { rrect(g, -0.3, -0.21, 0.6, 0.05, 0.02); fillInk(g, '#1f1b24', lw); rrect(g, -0.17, -0.55, 0.34, 0.36, 0.02); fillInk(g, '#2a2530', lw); g.fillStyle = A; g.fillRect(-0.17, -0.27, 0.34, 0.05); g.beginPath(); g.rect(-0.17, -0.27, 0.34, 0.05); ink(g, lw * 0.7); }
  if (o.headwear === 'helmet') {
    g.beginPath(); g.moveTo(-0.27, -0.03); g.quadraticCurveTo(-0.28, -0.31, 0, -0.31); g.quadraticCurveTo(0.28, -0.31, 0.27, -0.03); g.quadraticCurveTo(0, -0.08, -0.27, -0.03); fillInk(g, '#d39342', lw);
    g.fillStyle = 'rgba(255,240,200,0.5)'; ell(g, -0.1, -0.22, 0.05, 0.02, -0.4); g.fill();
    g.beginPath(); g.moveTo(-0.03, -0.3); g.quadraticCurveTo(0.0, -0.46, 0.2, -0.42); g.quadraticCurveTo(0.24, -0.33, 0.21, -0.24); g.quadraticCurveTo(0.15, -0.33, 0.03, -0.3); fillInk(g, A, lw);
  }
  if (o.headwear === 'laurel') { for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const a = Math.PI * (1.15 + i * 0.06) ; const x = sx * Math.cos(a) * -0.25, y = Math.sin(a) * 0.25 - 0.02; ell(g, x, y, 0.035, 0.016, sx * (0.6 + i * 0.25)); fillInk(g, '#5c9e3a', lw * 0.6); } }
}

// ---------------------------------------------------------------- outfits (torso, sleeves, legs)
const OUTFIT_STYLE = {
  casual: { sleeve: 'short', pants: true, shoe: 'sneaker' },
  suit: { sleeve: 'long', pants: true, shoe: 'dress', cuff: '#ffffff' },
  uniform: { sleeve: 'long', pants: true, shoe: 'boot', cuff: null },
  historical: { sleeve: 'short', pants: false, shoe: 'sandal' },
};

function drawTorso(g, o, d) {
  // origin = hip centre, torso goes up to the neck at y = -d.torso; skirt/hem may go below 0
  const P = o.palette, T = d.torso, sw = d.shoulder / 2, hw = d.hip / 2;
  const hem = o.outfit === 'historical' ? (o.era === 'victorian' ? 0.42 : 0.24) : o.outfit === 'suit' ? 0.07 : 0.03;
  const body = () => {
    g.beginPath(); g.moveTo(-sw * 0.62, -T); g.quadraticCurveTo(-sw, -T, -sw, -T + 0.07);
    g.quadraticCurveTo(-hw - 0.02, -T * 0.4, -hw - (o.outfit === 'historical' ? 0.04 : 0), hem);
    g.quadraticCurveTo(0, hem + 0.02, hw + (o.outfit === 'historical' ? 0.04 : 0), hem);
    g.quadraticCurveTo(hw + 0.02, -T * 0.4, sw, -T + 0.07); g.quadraticCurveTo(sw, -T, sw * 0.62, -T); g.closePath();
  };
  // neck
  rrect(g, -0.045, -T - 0.07, 0.09, 0.1, 0.02); fillInk(g, P.skin);
  if (o.outfit === 'historical' && o.era === 'victorian') { // long coat tails behind
    g.beginPath(); g.moveTo(-hw - 0.05, -0.05); g.lineTo(-hw - 0.07, hem); g.lineTo(hw + 0.07, hem); g.lineTo(hw + 0.05, -0.05); g.closePath(); fillInk(g, shade(P.top, -0.08));
  }
  body(); g.fillStyle = P.top; g.fill();
  clipShade(g, body, -sw, sw, -T, hem);
  // outfit details
  g.save(); body(); g.clip();
  if (o.outfit === 'casual') {
    g.beginPath(); g.arc(0, -T, 0.065, 0, Math.PI); ink(g); // crew neck
    if (o.logo !== false) { ell(g, 0, -T * 0.55, 0.055, 0.055); fillInk(g, P.accent); g.beginPath(); g.moveTo(-0.025, -T * 0.55); g.lineTo(0.025, -T * 0.55); g.moveTo(0, -T * 0.55 - 0.025); g.lineTo(0, -T * 0.55 + 0.025); ink(g, OUTLINE * 0.8); }
    g.fillStyle = 'rgba(40,20,60,0.12)'; g.fillRect(-0.4, -0.06, 0.8, 0.06);
  }
  if (o.outfit === 'suit') {
    g.beginPath(); g.moveTo(-0.075, -T); g.lineTo(0, -T * 0.42); g.lineTo(0.075, -T); g.closePath(); fillInk(g, '#ffffff');
    g.beginPath(); g.moveTo(-0.022, -T + 0.03); g.lineTo(0.022, -T + 0.03); g.lineTo(0.03, -T * 0.5); g.lineTo(0, -T * 0.42); g.lineTo(-0.03, -T * 0.5); g.closePath(); fillInk(g, P.accent);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.075, -T); g.lineTo(sx * 0.15, -T * 0.82); g.lineTo(sx * 0.1, -T * 0.72); g.lineTo(0, -T * 0.4); ink(g); }
    for (const y of [-T * 0.32, -T * 0.15]) { ell(g, 0, y, 0.014, 0.014); fillInk(g, shade(P.top, -0.2), OUTLINE * 0.7); }
    g.beginPath(); g.moveTo(-0.17, -T * 0.7); g.lineTo(-0.08, -T * 0.7); ink(g, OUTLINE * 0.8);
    g.fillStyle = P.accent; g.beginPath(); g.moveTo(-0.16, -T * 0.7); g.lineTo(-0.13, -T * 0.77); g.lineTo(-0.1, -T * 0.7); g.fill();
    g.beginPath(); g.moveTo(0, -T * 0.4); g.lineTo(0, hem); ink(g, OUTLINE * 0.8);
  }
  if (o.outfit === 'uniform') {
    g.beginPath(); g.moveTo(-0.07, -T); g.lineTo(0, -T + 0.08); g.lineTo(0.07, -T); ink(g);
    g.beginPath(); g.moveTo(0, -T + 0.08); g.lineTo(0, -0.06); ink(g, OUTLINE * 0.8);
    for (const sx of [-1, 1]) { rrect(g, sx * 0.1 - 0.045, -T * 0.72, 0.09, 0.08, 0.01); ink(g, OUTLINE * 0.8); g.beginPath(); g.moveTo(sx * 0.1 - 0.045, -T * 0.69); g.lineTo(sx * 0.1 + 0.045, -T * 0.69); ink(g, OUTLINE * 0.6); }
    // badge
    g.save(); g.translate(-0.1, -T * 0.83); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.014 : 0.032; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); fillInk(g, P.badge || '#f2c23c', OUTLINE * 0.7); g.restore();
    for (const y of [-T * 0.55, -T * 0.35, -T * 0.15]) { ell(g, 0, y, 0.011, 0.011); g.fillStyle = INK; g.fill(); }
    // belt
    g.fillStyle = '#2b2226'; g.fillRect(-0.4, -0.07, 0.8, 0.05); rrect(g, -0.035, -0.08, 0.07, 0.065, 0.008); fillInk(g, P.badge || '#f2c23c', OUTLINE * 0.7);
    g.beginPath(); g.moveTo(-0.4, -0.07); g.lineTo(0.4, -0.07); g.moveTo(-0.4, -0.02); g.lineTo(0.4, -0.02); ink(g, OUTLINE * 0.7);
  }
  if (o.outfit === 'historical' && o.era !== 'victorian') { // tunic + toga drape
    g.beginPath(); g.moveTo(-sw, -T + 0.05); g.quadraticCurveTo(0, -T * 0.45, hw + 0.05, -0.05); g.lineTo(hw + 0.05, 0.06); g.quadraticCurveTo(-0.05, -T * 0.35, -sw - 0.02, -T + 0.16); g.closePath(); fillInk(g, P.accent);
    g.strokeStyle = 'rgba(40,20,60,0.25)'; g.lineWidth = OUTLINE * 0.7; for (const x of [-0.08, 0.0, 0.08]) { g.beginPath(); g.moveTo(x, hem - 0.18); g.quadraticCurveTo(x + 0.01, hem - 0.08, x - 0.01, hem); g.stroke(); }
    g.fillStyle = '#7a4a24'; g.fillRect(-0.4, -0.05, 0.8, 0.035); g.beginPath(); g.moveTo(-0.4, -0.05); g.lineTo(0.4, -0.05); g.moveTo(-0.4, -0.015); g.lineTo(0.4, -0.015); ink(g, OUTLINE * 0.6);
    g.fillStyle = shade(P.top, 0.25); g.fillRect(-0.4, hem - 0.03, 0.8, 0.03);
  }
  if (o.outfit === 'historical' && o.era === 'victorian') {
    g.beginPath(); g.moveTo(-0.07, -T); g.lineTo(0, -T * 0.55); g.lineTo(0.07, -T); g.closePath(); fillInk(g, '#ffffff');
    g.beginPath(); g.moveTo(-0.05, -T + 0.01); g.quadraticCurveTo(0, -T + 0.06, 0.05, -T + 0.01); g.quadraticCurveTo(0, -T + 0.03, -0.05, -T + 0.01); fillInk(g, P.accent);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.07, -T); g.lineTo(sx * 0.16, -T * 0.78); g.lineTo(sx * 0.06, -T * 0.45); ink(g); }
    for (const y of [-T * 0.38, -T * 0.22, -T * 0.06]) for (const sx of [-1, 1]) { ell(g, sx * 0.05, y, 0.012, 0.012); fillInk(g, '#d9b14a', OUTLINE * 0.6); }
    g.beginPath(); g.moveTo(0.08, -T * 0.38); g.quadraticCurveTo(0.14, -T * 0.3, 0.12, -T * 0.22); g.strokeStyle = '#d9b14a'; g.lineWidth = OUTLINE * 0.8; g.stroke();
  }
  g.restore();
  body(); ink(g);
  if (o.outfit === 'uniform') for (const sx of [-1, 1]) { rrect(g, sx * sw - (sx > 0 ? 0.11 : 0), -T - 0.005, 0.11, 0.035, 0.01); fillInk(g, shade(P.top, -0.12), OUTLINE * 0.8); }
}

function drawUpperArm(g, o, d) {
  const P = o.palette, st = OUTFIT_STYLE[o.outfit], r = d.limb / 2, L = d.upper;
  capsule(g, 0, 0, L, r); fillInk(g, P.skin);
  const sleeveCol = o.outfit === 'casual' ? P.top : P.top;
  if (st.sleeve === 'long') { capsule(g, 0, 0, L, r * 1.18); fillInk(g, sleeveCol); }
  else { g.beginPath(); g.moveTo(-r * 1.45, -r * 0.6); g.lineTo(-r * 1.35, L * 0.45); g.quadraticCurveTo(0, L * 0.5, r * 1.35, L * 0.45); g.lineTo(r * 1.45, -r * 0.6); g.quadraticCurveTo(0, -r * 1.8, -r * 1.45, -r * 0.6); fillInk(g, sleeveCol); }
}
function drawForearm(g, o, d) {
  const P = o.palette, st = OUTFIT_STYLE[o.outfit], r = d.limb / 2, L = d.lower;
  capsule(g, 0, 0, L, r); fillInk(g, P.skin);
  if (st.sleeve === 'long') {
    capsule(g, 0, 0, L * 0.8, r * 1.18); fillInk(g, P.top);
    if (st.cuff) { rrect(g, -r * 1.2, L * 0.72, r * 2.4, L * 0.1, 0.006); fillInk(g, st.cuff, OUTLINE * 0.8); }
  }
  // mitten hand with a thumb
  const hr = d.hand;
  ell(g, -hr * 0.75, L + hr * 0.2, hr * 0.42, hr * 0.55, 0.5); fillInk(g, P.skin);
  ell(g, 0, L + hr * 0.75, hr, hr * 1.05); fillInk(g, P.skin);
  g.fillStyle = 'rgba(120,40,60,0.16)'; ell(g, hr * 0.3, L + hr, hr * 0.55, hr * 0.5); g.fill();
}
function drawLeg(g, o, d, side) {
  const P = o.palette, st = OUTFIT_STYLE[o.outfit], r = d.leg / 2, L = d.legLen;
  const foot = L - d.shoe * 0.5;
  capsule(g, 0, 0, foot, r); fillInk(g, st.pants ? P.bottom : P.skin);
  if (st.pants) { g.save(); capsule(g, 0, 0, foot, r); g.clip(); g.fillStyle = 'rgba(40,20,60,0.18)'; g.fillRect(side * r * 0.2, -0.05, r * 1.2, L); g.restore(); capsule(g, 0, 0, foot, r); ink(g); }
  if (!st.pants && st.shoe === 'sandal') { for (const y of [foot - 0.07, foot - 0.03]) { g.beginPath(); g.moveTo(-r, y); g.lineTo(r, y + 0.015); g.lineWidth = OUTLINE * 0.9; g.strokeStyle = '#6b3a1e'; g.stroke(); } }
  // shoe: points outward
  const sx = side, sl = d.shoe, sh = d.shoe * 0.42;
  const shoeCol = st.shoe === 'sneaker' ? (P.shoes || '#ffffff') : st.shoe === 'sandal' ? '#8b5a2b' : (P.shoes || '#2a2230');
  g.beginPath(); g.moveTo(-r * 1.1, foot - sh * 0.4); g.quadraticCurveTo(-r * 1.2, L, -r * 0.6, L); g.lineTo(sx * sl * 0.95, L); g.quadraticCurveTo(sx * sl * 1.05, foot - sh * 0.1, sx * sl * 0.35, foot - sh * 0.7); g.lineTo(-r * 1.1 * sx, foot - sh * 0.9); g.closePath();
  if (sx < 0) { g.beginPath(); g.moveTo(r * 1.1, foot - sh * 0.4); g.quadraticCurveTo(r * 1.2, L, r * 0.6, L); g.lineTo(-sl * 0.95, L); g.quadraticCurveTo(-sl * 1.05, foot - sh * 0.1, -sl * 0.35, foot - sh * 0.7); g.lineTo(r * 1.1, foot - sh * 0.9); g.closePath(); }
  fillInk(g, shoeCol);
  if (st.shoe === 'sneaker') { g.beginPath(); g.moveTo(-r * 1.0 * sx * -1, L - 0.012); g.lineTo(sx * sl * 0.9, L - 0.012); g.lineWidth = OUTLINE * 0.8; g.strokeStyle = P.accent; g.stroke(); }
}

// ---------------------------------------------------------------- createCharacter
let SEED = 1;
export function createCharacter(options = {}) {
  const o = {
    name: 'Character', height: 1.75, outfit: 'casual', era: 'roman', hair: 'short', headwear: 'none',
    expression: 'neutral', gesture: 'rest', glasses: false, beard: false, mustache: false,
    seed: SEED++, light: { emissive: '#5a5a5a', receive: false }, ...options,
  };
  o.palette = { skin: '#eab68f', hair: '#3a2416', top: '#3b82c4', bottom: '#3a4a6b', shoes: null, accent: '#f2c23c', ...(options.palette || {}) };
  const u = o.height / 3.5;
  const d = {
    head: u * PLAN.head, torso: u * PLAN.torso, neck: u * PLAN.neck, legLen: u * PLAN.leg,
    shoulder: u * 0.92, hip: u * 0.68, limb: u * 0.135, leg: u * 0.17, upper: u * 0.66, lower: u * 0.58, hand: u * 0.085, shoe: u * 0.25,
  };
  const lit = o.light;
  const group = new THREE.Group(); group.name = o.name;
  const rig = new THREE.Group(); group.add(rig);                  // receives the yaw billboard
  const hips = new THREE.Group(); hips.position.y = d.legLen; rig.add(hips);
  // legs (behind the torso)
  const legs = {};
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    const j = new THREE.Group(); j.position.set(side * d.hip * 0.27, 0, -0.012); hips.add(j);
    const w = d.shoe * 2.2 + 0.05, card = makeCard(w, d.legLen + 0.06, w / 2, 0.02, lit);
    card.draw((g) => drawLeg(g, o, d, side)); j.add(card.mesh); legs[name] = j;
  }
  // torso
  const torso = new THREE.Group(); hips.add(torso);
  const hemExtra = o.outfit === 'historical' ? 0.5 : 0.12;
  const tCard = makeCard(d.shoulder + 0.12, d.torso + d.neck + hemExtra + 0.08, (d.shoulder + 0.12) / 2, d.torso + d.neck + 0.04, lit);
  tCard.draw((g) => drawTorso(g, o, d)); torso.add(tCard.mesh);
  // arms: shoulder -> elbow -> hand, each a pivoting card
  const arms = {};
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    const sh = new THREE.Group(); sh.position.set(side * (d.shoulder / 2 - d.limb * 0.55), d.torso - 0.035, 0.012); torso.add(sh);
    const ua = makeCard(d.limb * 3.2, d.upper + d.limb * 2, d.limb * 1.6, d.limb, lit); ua.draw((g) => drawUpperArm(g, o, d)); ua.mesh.rotation.z = 0; sh.add(ua.mesh);
    const el = new THREE.Group(); el.position.set(0, -d.upper, 0.004); sh.add(el);
    const fw = d.hand * 3.4, fa = makeCard(fw, d.lower + d.hand * 2.6, fw / 2, d.limb * 0.8, lit); fa.draw((g) => drawForearm(g, o, d)); el.add(fa.mesh);
    arms[name] = { shoulder: sh, elbow: el, side };
  }
  // head
  const head = new THREE.Group(); head.position.set(0, d.torso + d.neck, 0.02); torso.add(head);
  const hs = d.head / 0.5;                               // head drawn in a 0.5 m design space, scaled to size
  const hW = 1.0 * hs, hH = 1.25 * hs;
  const hCard = makeCard(hW, hH + 0.25 * hs, hW / 2, hH, lit);
  const drawH = (ex, blink) => hCard.draw((g) => { g.translate(0, -0.25 * hs); g.scale(hs, hs); drawHead(g, o, ex, blink, 0.25); });
  head.add(hCard.mesh);

  // ---------------- api
  let expression = o.expression, blinking = false;
  const redraw = () => drawH(expression, blinking && expression !== 'laughing');
  redraw();
  function setArm(side, shoulder, elbow) {
    const a = arms[side]; const s = a.side;
    a.shoulder.rotation.z = s * shoulder;           // left arm swings to -x, right arm to +x
    a.elbow.rotation.z = -s * elbow;
  }
  function setGesture(nameOrPose) {
    const p = typeof nameOrPose === 'string' ? GESTURES[nameOrPose] : nameOrPose;
    setArm('left', ...p.left); setArm('right', ...p.right); o.gesture = nameOrPose;
  }
  setGesture(o.gesture);
  // deterministic blink schedule
  let rs = o.seed * 9301 + 49297; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
  const blinks = []; for (let t = 0.6 + rnd() * 2; t < 600; t += 2.4 + rnd() * 2.8) blinks.push(t);
  function update(t) {
    const br = Math.sin(t * Math.PI * 2 / 3.4 + o.seed);
    torso.scale.set(1 + br * 0.006, 1 + br * 0.014, 1);              // breathing
    head.rotation.z = Math.sin(t * 0.9 + o.seed) * 0.025;               // tiny head sway
    for (const a of Object.values(arms)) a.shoulder.position.y = d.torso - 0.035 + br * 0.004;
    const b = blinks.some((x) => t >= x && t < x + 0.13);
    if (b !== blinking) { blinking = b; redraw(); }
  }
  function setExpression(ex) { if (!EXPRESSIONS.includes(ex)) throw new Error('unknown expression ' + ex); expression = ex; redraw(); }
  function faceCamera(cam) { const p = new THREE.Vector3(); group.getWorldPosition(p); rig.rotation.y = Math.atan2(cam.position.x - p.x, cam.position.z - p.z); }
  return {
    group, rig, options: o, dims: d, joints: { hips, torso, head, legs, arms },
    setExpression, setArm, setGesture, update, faceCamera,
    get expression() { return expression; },
  };
}
