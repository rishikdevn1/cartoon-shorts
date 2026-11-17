// buildings.js — parameterized 3D buildings with real architectural depth.
//
//   import { createBuilding } from './buildings.js';
//   const b = createBuilding({ style: 'brick-apartment', floors: 5, width: 12, depth: 10, palette: { wall: '#b5523a' } });
//   scene.add(b.group);      // origin = centre of the footprint at ground level, front facade faces +z
//
// Styles: modern-glass · brick-apartment · cafe-storefront · concrete-midrise · suburban-house
// Facades are assembled from real wall pieces (spandrels, piers, corner columns), so every window is a recessed
// opening with a frame, mullions and a sill. Roofs carry parapets, AC units, vents, tanks and antennas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEX, tbox, mat, rng } from './textures.js';

export const BUILDING_STYLES = ['modern-glass', 'brick-apartment', 'cafe-storefront', 'concrete-midrise', 'suburban-house'];

// ---------------------------------------------------------------- batching
class Batch {
  constructor() { this.parts = new Map(); }
  add(material, geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()); g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(material)) this.parts.set(material, []); this.parts.get(material).push(g);
  }
  build(parent, { cast = true, receive = true } = {}) {
    for (const [m, list] of this.parts) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); }
  }
}
// transform helper: run facade code in a local frame (rotated around y, offset) and push into the batch
function framed(batch, yaw, offset) {
  const R = new THREE.Matrix4().makeRotationY(yaw), T = new THREE.Matrix4().makeTranslation(...offset), M = T.multiply(R);
  return { add: (material, geo, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, local));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!batch.parts.has(material)) batch.parts.set(material, []); batch.parts.get(material).push(g);
  } };
}

// ---------------------------------------------------------------- shared materials
const MATS = {};
const M = (key, make) => MATS[key] || (MATS[key] = make());
const glassDark = () => M('glassDark', () => new THREE.MeshStandardMaterial({ color: '#27365c', metalness: 0.7, roughness: 0.1, envMapIntensity: 1.4 }));
const glassLit = () => M('glassLit', () => new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45c', emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.1 }));
const glassTint = (c) => M('glassT' + c, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.06, envMapIntensity: 1.6 }));
const solid = (c, o = {}) => M('solid' + c + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0, ...(o.e ? { emissive: o.e, emissiveIntensity: o.ei ?? 1 } : {}) }));
const metal = () => M('metal', () => mat(TEX.concrete('#5d6274', false), { roughness: 0.45, metalness: 0.6, normal: 0.6 }));
const grilleMat = () => M('grille', () => mat(TEX.grille(), { roughness: 0.5, metalness: 0.5 }));

export function signTexture(text, { bg = '#1f2a44', fg = '#ffd36a', font = '800 120px Georgia, serif', w = 1024, h = 256, border = '#ffd36a' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(18, 18, w - 36, h - 36);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, w / 2 + 5, h / 2 + 7); g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function stripeTexture(c1, c2, n = 8) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 512 / n, 0, 512 / n, 64); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 512; i += 3) g.fillRect(i, 0, 1, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------------------------------------------------------------- window grid facade
// Builds one facade in a local frame: face plane at z = 0 facing +z, spanning x in [-len/2, len/2].
function windowFacade(B, o) {
  const { len, y0, floors, fh, cols, winW, winH, sillH = 0.9, wall, t = 0.35, recess = 0.22, frame, litRatio = 0.25, seed = 1, sill = true, lintel = null, mull = 'cross', ac = 0, shutters = null } = o;
  const r = rng(seed);
  const gap = (len - cols * winW) / cols;
  const xs = Array.from({ length: cols }, (_, i) => -len / 2 + gap / 2 + winW / 2 + i * (winW + gap));
  for (let f = 0; f < floors; f++) {
    const base = y0 + f * fh, wb = base + sillH, wt = wb + winH;
    B.add(wall, tbox(len, sillH, t, 1.6), [0, base + sillH / 2, -t / 2]);
    B.add(wall, tbox(len, base + fh - wt, t, 1.6), [0, (wt + base + fh) / 2, -t / 2]);
    let px = -len / 2;
    for (const x of xs) { const pw = x - winW / 2 - px; if (pw > 0.01) B.add(wall, tbox(pw, winH, t, 1.6), [px + pw / 2, (wb + wt) / 2, -t / 2]); px = x + winW / 2; }
    const pw = len / 2 - px; if (pw > 0.01) B.add(wall, tbox(pw, winH, t, 1.6), [px + pw / 2, (wb + wt) / 2, -t / 2]);
    for (const x of xs) {
      B.add(r() < litRatio ? glassLit() : glassDark(), new THREE.PlaneGeometry(winW, winH), [x, (wb + wt) / 2, -recess]);
      const fw = 0.07, fd = 0.08, fz = -recess + fd / 2;
      B.add(frame, new THREE.BoxGeometry(winW, fw, fd), [x, wt - fw / 2, fz]); B.add(frame, new THREE.BoxGeometry(winW, fw, fd), [x, wb + fw / 2, fz]);
      B.add(frame, new THREE.BoxGeometry(fw, winH, fd), [x - winW / 2 + fw / 2, (wb + wt) / 2, fz]); B.add(frame, new THREE.BoxGeometry(fw, winH, fd), [x + winW / 2 - fw / 2, (wb + wt) / 2, fz]);
      if (mull === 'cross' || mull === 'vertical') B.add(frame, new THREE.BoxGeometry(0.05, winH, 0.06), [x, (wb + wt) / 2, fz]);
      if (mull === 'cross') B.add(frame, new THREE.BoxGeometry(winW, 0.05, 0.06), [x, wb + winH * 0.62, fz]);
      if (sill) B.add(o.sillMat || frame, new THREE.BoxGeometry(winW + 0.16, 0.07, recess + 0.1), [x, wb - 0.035, -recess / 2 + 0.05]);
      if (lintel) B.add(lintel, new THREE.BoxGeometry(winW + 0.24, 0.16, 0.08), [x, wt + 0.08, 0.04]);
      if (shutters) for (const s of [-1, 1]) { B.add(shutters, new THREE.BoxGeometry(winW * 0.42, winH * 1.02, 0.05), [x + s * (winW * 0.71 + 0.02), (wb + wt) / 2, 0.03]); for (let k = 1; k < 6; k++) B.add(shutters, new THREE.BoxGeometry(winW * 0.38, 0.02, 0.03), [x + s * (winW * 0.71 + 0.02), wb + k * winH / 6, 0.065], [0.4, 0, 0]); }
      if (ac && r() < ac && f > 0) { B.add(grilleMat(), tbox(0.62, 0.42, 0.5, 0.5), [x + (r() - 0.5) * 0.2, wb + 0.22, 0.12]); }
    }
  }
}

// ---------------------------------------------------------------- rooftop kit
function roofKit(B, o) {
  const { w, d, y, r, parapet, coping, units = 4, vents = 3, tank = false, antenna = false, penthouse = null } = o;
  const ph = 0.9, pt = 0.25;
  B.add(parapet, tbox(w, ph, pt, 1.6), [0, y + ph / 2, d / 2 - pt / 2]); B.add(parapet, tbox(w, ph, pt, 1.6), [0, y + ph / 2, -d / 2 + pt / 2]);
  B.add(parapet, tbox(pt, ph, d, 1.6), [w / 2 - pt / 2, y + ph / 2, 0]); B.add(parapet, tbox(pt, ph, d, 1.6), [-w / 2 + pt / 2, y + ph / 2, 0]);
  B.add(coping, new THREE.BoxGeometry(w + 0.16, 0.1, pt + 0.16), [0, y + ph + 0.05, d / 2 - pt / 2]); B.add(coping, new THREE.BoxGeometry(w + 0.16, 0.1, pt + 0.16), [0, y + ph + 0.05, -d / 2 + pt / 2]);
  B.add(coping, new THREE.BoxGeometry(pt + 0.16, 0.1, d), [w / 2 - pt / 2, y + ph + 0.05, 0]); B.add(coping, new THREE.BoxGeometry(pt + 0.16, 0.1, d), [-w / 2 + pt / 2, y + ph + 0.05, 0]);
  B.add(solid('#6a6f86', { r: 0.9 }), new THREE.BoxGeometry(w - 0.4, 0.05, d - 0.4), [0, y + 0.03, 0]);
  if (penthouse) { const [pw, phh, pd] = penthouse; B.add(parapet, tbox(pw, phh, pd, 1.6), [-w * 0.15, y + phh / 2, -d * 0.12]); B.add(coping, new THREE.BoxGeometry(pw + 0.2, 0.12, pd + 0.2), [-w * 0.15, y + phh + 0.06, -d * 0.12]); B.add(solid('#3a3f55'), new THREE.BoxGeometry(1.0, 2.0, 0.06), [-w * 0.15 + pw * 0.2, y + 1.0, -d * 0.12 + pd / 2 + 0.03]); }
  for (let i = 0; i < units; i++) {
    const x = (r() - 0.5) * (w - 3), z = (r() - 0.5) * (d - 3);
    B.add(solid('#c9ccd6', { r: 0.4, m: 0.4 }), tbox(1.3, 0.95, 1.0, 1), [x, y + 0.5, z]);
    B.add(grilleMat(), new THREE.PlaneGeometry(1.1, 0.7), [x, y + 0.5, z + 0.505]);
    B.add(solid('#3a3f55', { r: 0.5 }), new THREE.CylinderGeometry(0.36, 0.36, 0.06, 20), [x, y + 1.0, z]);
    B.add(solid('#8a90a2', { r: 0.4, m: 0.5 }), new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), [x, y + 1.04, z]);
    B.add(metal(), new THREE.BoxGeometry(1.4, 0.08, 1.1), [x, y + 0.04, z]);
  }
  for (let i = 0; i < vents; i++) {
    const x = (r() - 0.5) * (w - 2), z = (r() - 0.5) * (d - 2);
    B.add(metal(), new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), [x, y + 0.45, z]);
    B.add(metal(), new THREE.ConeGeometry(0.28, 0.2, 12), [x, y + 1.0, z]);
  }
  if (tank) {
    const x = w * 0.22, z = -d * 0.15;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.add(metal(), new THREE.BoxGeometry(0.12, 2.2, 0.12), [x + dx, y + 1.1, z + dz]);
    B.add(mat(TEX.wood('#7a5236'), { roughness: 0.9 }), new THREE.CylinderGeometry(1.25, 1.25, 2.4, 24, 1, false), [x, y + 3.4, z]);
    for (const hy of [2.6, 3.4, 4.2]) B.add(metal(), new THREE.TorusGeometry(1.27, 0.03, 6, 32), [x, y + hy, z], [Math.PI / 2, 0, 0]);
    B.add(solid('#4a3a50', { r: 0.8 }), new THREE.ConeGeometry(1.4, 0.9, 24), [x, y + 5.05, z]);
  }
  if (antenna) { B.add(metal(), new THREE.CylinderGeometry(0.06, 0.1, 6, 8), [w * 0.2, y + 3, d * 0.1]); B.add(solid('#ff3b3b', { e: '#ff2020', ei: 1.5 }), new THREE.SphereGeometry(0.12, 10, 8), [w * 0.2, y + 6.05, d * 0.1]); }
}

function cornerColumns(B, w, d, h, m, t = 0.4) { for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) B.add(m, tbox(t, h, t, 1.6), [sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)]); }

// ---------------------------------------------------------------- styles
function modernGlass(o, B) {
  const { width: w, depth: d, floors, palette: P } = o; const fh = 3.6, H = floors * fh + 1.5, r = rng(o.seed);
  const glass = glassTint(P.glass || '#3b5f9a'), panel = solid(P.wall || '#c9d2e3', { r: 0.35, m: 0.6 }), fin = solid(P.trim || '#e8edf5', { r: 0.3, m: 0.7 });
  B.add(solid('#1d2238'), new THREE.BoxGeometry(w - 0.6, H, d - 0.6), [0, H / 2, 0]);               // dark core behind the glass
  const faces = [[0, [0, 0, d / 2], w], [Math.PI / 2, [w / 2, 0, 0], d], [-Math.PI / 2, [-w / 2, 0, 0], d], [Math.PI, [0, 0, -d / 2], w]];
  for (const [yaw, off, len] of faces) {
    const F = framed(B, yaw, off);
    // double-height lobby
    F.add(glassTint('#2f4a74'), new THREE.PlaneGeometry(len - 0.8, fh * 2 - 0.6), [0, fh - 0.3, -0.35]);
    for (let x = -len / 2 + 0.4; x <= len / 2 - 0.4; x += 1.8) F.add(fin, new THREE.BoxGeometry(0.1, fh * 2, 0.18), [x, fh, -0.3]);
    for (let f = 2; f < floors; f++) {
      const yb = f * fh;
      F.add(panel, new THREE.BoxGeometry(len, 0.55, 0.2), [0, yb + 0.275, -0.1]);              // spandrel band
      F.add(r() < 0.12 ? glassLit() : glass, new THREE.PlaneGeometry(len - 0.2, fh - 0.55), [0, yb + 0.55 + (fh - 0.55) / 2, -0.22]);
      for (let x = -len / 2 + 0.3; x <= len / 2 - 0.29; x += 1.5) F.add(fin, new THREE.BoxGeometry(0.08, fh - 0.55, 0.22), [x, yb + 0.55 + (fh - 0.55) / 2, -0.12]);
    }
    F.add(panel, new THREE.BoxGeometry(len, 1.5, 0.3), [0, floors * fh + 0.75, -0.15]);          // crown
  }
  cornerColumns(B, w, d, H, fin, 0.5);
  // entrance canopy
  B.add(fin, new THREE.BoxGeometry(5, 0.2, 2.2), [0, 3.6, d / 2 + 1.1]); for (const s of [-1, 1]) B.add(fin, new THREE.CylinderGeometry(0.08, 0.08, 3.6, 10), [s * 2.3, 1.8, d / 2 + 2.0]);
  roofKit(B, { w, d, y: H, r, parapet: panel, coping: fin, units: 5, vents: 4, antenna: true, penthouse: [w * 0.4, 3, d * 0.4] });
  return H;
}

function brickApartment(o, B) {
  const { width: w, depth: d, floors, palette: P } = o; const fh = 3.1, H = floors * fh + 0.6, r = rng(o.seed);
  const brick = mat(TEX.brick(P.wall || '#b5523a', P.mortar || '#d8ccb6'), { normal: 1.2 });
  const stone = mat(TEX.concrete(P.trim || '#e6dccb', false), { normal: 0.8 }), frame = solid(P.frame || '#f4efe6', { r: 0.5 });
  const cols = Math.max(2, Math.round(w / 2.8)), colsD = Math.max(2, Math.round(d / 3));
  const faces = [[0, [0, 0, d / 2], w, cols], [Math.PI / 2, [w / 2, 0, 0], d, colsD], [-Math.PI / 2, [-w / 2, 0, 0], d, colsD]];
  for (const [yaw, off, len, c] of faces) windowFacade(framed(B, yaw, off), { len, y0: 0, floors, fh, cols: c, winW: 1.15, winH: 1.65, wall: brick, frame, lintel: stone, sillMat: stone, seed: o.seed + yaw * 10, ac: 0.18, litRatio: 0.22 });
  B.add(brick, tbox(w, H, 0.35, 1.6), [0, H / 2, -d / 2 + 0.175]);
  cornerColumns(B, w, d, H - 0.6, brick, 0.36);
  // stoop + door on the front (replaces one ground window visually: a framed door slab in front of it)
  const dx = -w / 2 + (w - cols * 1.15) / cols / 2 + 1.15 / 2;
  B.add(solid(P.door || '#2f6b4f', { r: 0.5 }), new THREE.BoxGeometry(1.2, 2.3, 0.08), [dx, 1.45, d / 2 + 0.05]);
  B.add(stone, new THREE.BoxGeometry(1.7, 0.18, 0.3), [dx, 2.7, d / 2 + 0.12]);
  for (let i = 0; i < 3; i++) B.add(stone, tbox(1.8, 0.15, 0.35 + i * 0.32, 1), [dx, 0.075 + i * 0.15, d / 2 + 0.175 + (2 - i) * 0.16]);
  // cornice with dentils
  B.add(stone, tbox(w + 0.6, 0.35, 0.6, 1.6), [0, H - 0.35, d / 2 + 0.15]);
  for (let x = -w / 2; x <= w / 2; x += 0.4) B.add(stone, new THREE.BoxGeometry(0.16, 0.16, 0.16), [x, H - 0.6, d / 2 + 0.1]);
  // fire escape over the second window column
  const fx = -w / 2 + (w - cols * 1.15) / cols * 1.5 + 1.15 * 1.5, iron = solid('#262a38', { r: 0.5, m: 0.5 });
  for (let f = 1; f < floors; f++) {
    const y = f * fh + 0.05;
    B.add(grilleMat(), new THREE.BoxGeometry(3.0, 0.05, 1.1), [fx, y, d / 2 + 0.55]);
    B.add(iron, new THREE.BoxGeometry(3.0, 0.04, 0.04), [fx, y + 0.95, d / 2 + 1.1]);
    for (const s of [-1, 1]) B.add(iron, new THREE.BoxGeometry(0.04, 0.04, 1.1), [fx + s * 1.5, y + 0.95, d / 2 + 0.55]);
    for (let k = 0; k <= 10; k++) B.add(iron, new THREE.BoxGeometry(0.025, 0.95, 0.025), [fx - 1.5 + k * 0.3, y + 0.47, d / 2 + 1.1]);
    for (const s of [-1, 1]) B.add(iron, new THREE.BoxGeometry(0.03, 0.95, 0.03), [fx + s * 1.5, y + 0.47, d / 2 + 0.55]);
    for (const s of [-1, 1]) B.add(iron, new THREE.BoxGeometry(0.05, 0.05, 0.6), [fx + s * 1.3, y - 0.2, d / 2 + 0.3], [-0.6, 0, 0]);
    if (f < floors - 1) { // ladder up to the next landing
      const len = Math.hypot(fh, 1.8), ang = Math.atan2(fh, 1.8);
      for (const s of [-0.22, 0.22]) B.add(iron, new THREE.BoxGeometry(len, 0.05, 0.05), [fx + 0.3, y + fh / 2, d / 2 + 0.8 + s], [0, 0, ang]);
      for (let k = 1; k < 9; k++) { const t = k / 9; B.add(iron, new THREE.BoxGeometry(0.04, 0.03, 0.44), [fx + 0.3 - 0.9 + t * 1.8, y + t * fh, d / 2 + 0.8]); }
    }
  }
  roofKit(B, { w, d, y: H, r, parapet: brick, coping: stone, units: 2, vents: 3, tank: true });
  return H;
}

function cafeStorefront(o, B, group) {
  const { width: w, depth: d, palette: P } = o; const floors = o.floors, gh = 4.2, fh = 3.0, H = gh + (floors - 1) * fh + 0.5, r = rng(o.seed);
  const stucco = mat(TEX.stucco(P.wall || '#f2c9a0'), { normal: 1 }), trim = solid(P.trim || '#fff6e8', { r: 0.5 }), frame = solid(P.frame || '#2d3a2f', { r: 0.4, m: 0.3 });
  const base = mat(TEX.brick(P.base || '#8a3b2e', '#cbbfae'), { normal: 1.2 });
  // upper floors on all visible faces
  const faces = [[0, [0, 0, d / 2], w, 3], [Math.PI / 2, [w / 2, 0, 0], d, 3], [-Math.PI / 2, [-w / 2, 0, 0], d, 3]];
  for (const [yaw, off, len, c] of faces) windowFacade(framed(B, yaw, off), { len, y0: gh, floors: floors - 1, fh, cols: c, winW: 1.1, winH: 1.6, wall: stucco, frame: trim, sillMat: trim, lintel: trim, seed: o.seed + yaw, litRatio: 0.3, shutters: yaw === 0 ? solid(P.shutter || '#3f7d5a', { r: 0.6 }) : null });
  B.add(stucco, tbox(w, H, 0.35, 2), [0, H / 2, -d / 2 + 0.175]);
  // ground floor storefront: brick piers, kickplate, three big panes, a door
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) { const F = framed(B, yaw, yaw > 0 ? [w / 2, 0, 0] : [-w / 2, 0, 0]); F.add(base, tbox(d, gh, 0.35, 1.6), [0, gh / 2, -0.175]); }
  for (const s of [-1, 1]) B.add(base, tbox(0.7, gh, 0.45, 1.6), [s * (w / 2 - 0.35), gh / 2, d / 2 - 0.2]);
  B.add(base, tbox(w - 1.4, 0.55, 0.35, 1.6), [0, 0.275, d / 2 - 0.3]);
  B.add(base, tbox(w - 1.4, 0.6, 0.35, 1.6), [0, gh - 0.3, d / 2 - 0.2]);
  const sw = w - 1.4, y0 = 0.55, y1 = gh - 0.6;
  B.add(M('shopGlass', () => new THREE.MeshStandardMaterial({ color: '#6f8fc0', metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.38, envMapIntensity: 1.6 })), new THREE.PlaneGeometry(sw, y1 - y0), [0, (y0 + y1) / 2, d / 2 - 0.42]);
  // interior: back wall, counter, pendant lamps, a few tables seen through the window
  B.add(solid('#5a3a2a', { r: 0.8 }), new THREE.PlaneGeometry(sw, y1), [0, y1 / 2, d / 2 - 3.2]);
  B.add(mat(TEX.wood('#9a6a3e')), tbox(sw * 0.6, 1.05, 0.6, 1), [sw * 0.1, 0.52, d / 2 - 2.7]);
  for (let i = 0; i < 3; i++) { const x = -sw / 2 + 1 + i * sw / 3; B.add(solid('#1f2430'), new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), [x, y1 - 0.4, d / 2 - 1.6]); B.add(solid('#ffd18a', { e: '#ffb050', ei: 2.2 }), new THREE.SphereGeometry(0.14, 12, 8), [x, y1 - 0.85, d / 2 - 1.6]); B.add(solid('#e8dcc8', { r: 0.6 }), new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), [x, 0.75, d / 2 - 1.3]); B.add(solid('#2a2a34'), new THREE.CylinderGeometry(0.04, 0.04, 0.73, 6), [x, 0.37, d / 2 - 1.3]); }
  for (let i = 0; i <= 4; i++) { const x = -sw / 2 + i * sw / 4; B.add(frame, new THREE.BoxGeometry(0.1, y1 - y0, 0.12), [x, (y0 + y1) / 2, d / 2 - 0.38]); }
  B.add(frame, new THREE.BoxGeometry(sw, 0.1, 0.12), [0, y0 + 0.05, d / 2 - 0.38]); B.add(frame, new THREE.BoxGeometry(sw, 0.1, 0.12), [0, y1 - 0.05, d / 2 - 0.38]); B.add(frame, new THREE.BoxGeometry(sw, 0.07, 0.1), [0, y0 + (y1 - y0) * 0.78, d / 2 - 0.38]);
  // door in the right-most bay
  const dx = sw / 2 - sw / 8; B.add(solid(P.door || '#c0392b', { r: 0.4 }), new THREE.BoxGeometry(sw / 4 - 0.25, 2.4, 0.06), [dx, 1.2 + 0.05, d / 2 - 0.36]); B.add(glassDark(), new THREE.PlaneGeometry(sw / 4 - 0.6, 1.3), [dx, 1.6, d / 2 - 0.325]); B.add(solid('#d9b14a', { r: 0.3, m: 0.9 }), new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), [dx - sw / 8 + 0.35, 1.25, d / 2 - 0.3]);
  // striped awning: frame + sloped fabric + scalloped valance + side flaps
  const aw = sw + 0.4, ad = 1.5, ay = y1 + 0.25, drop = 0.75;
  const fab = M('awn' + (P.awning || ['#d8343b', '#fff4e6']).join(), () => { const t = stripeTexture(...(P.awning || ['#d8343b', '#fff4e6']), 12); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, side: THREE.DoubleSide }); });
  const slope = Math.atan2(drop, ad), sl = Math.hypot(ad, drop);
  B.add(fab, new THREE.PlaneGeometry(aw, sl), [0, ay - drop / 2, d / 2 + ad / 2 - 0.1], [-Math.PI / 2 + slope, 0, 0]);
  const val = new THREE.Shape(); val.moveTo(-aw / 2, 0); val.lineTo(aw / 2, 0); val.lineTo(aw / 2, -0.28); const nS = 14; for (let i = nS; i >= 0; i--) { const x = -aw / 2 + i * aw / nS; val.quadraticCurveTo(x + aw / nS / 2, -0.42, x, -0.28); } val.closePath();
  const vg = new THREE.ShapeGeometry(val); { const p = vg.attributes.position, uv = vg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + aw / 2) / aw, 0.5); }
  B.add(fab, vg, [0, ay - drop, d / 2 + ad - 0.1]);
  for (const s of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(ad, -drop); tri.lineTo(ad, -drop - 0.28); tri.lineTo(0, -0.1); tri.closePath(); const tg = new THREE.ShapeGeometry(tri); B.add(fab, tg, [s * aw / 2, ay, d / 2 - 0.1], [0, -Math.PI / 2, 0]); }
  for (const s of [-1, 1]) B.add(frame, new THREE.CylinderGeometry(0.03, 0.03, sl, 8), [s * aw / 2, ay - drop / 2, d / 2 + ad / 2 - 0.1], [-Math.PI / 2 + slope + Math.PI / 2, 0, 0]);
  // sign board above the awning + a hanging blade sign
  const signT = signTexture(o.sign || 'CAFÉ LUNA', { bg: P.signBg || '#203a2f', fg: P.signFg || '#ffd36a', border: P.signFg || '#ffd36a' });
  B.add(trim, new THREE.BoxGeometry(sw * 0.8 + 0.2, 1.05, 0.2), [0, gh + 0.55, d / 2 + 0.05]);
  const sm = new THREE.MeshStandardMaterial({ map: signT, roughness: 0.5, emissive: '#ffffff', emissiveMap: signT, emissiveIntensity: 0.25 });
  B.add(sm, new THREE.PlaneGeometry(sw * 0.8, 0.85), [0, gh + 0.55, d / 2 + 0.16]);
  const bladeT = signTexture('☕', { bg: P.signBg || '#203a2f', fg: '#ffffff', font: '160px serif', w: 256, h: 256 });
  const bm = new THREE.MeshStandardMaterial({ map: bladeT, roughness: 0.5, side: THREE.DoubleSide });
  B.add(frame, new THREE.BoxGeometry(0.06, 0.06, 1.1), [w / 2 - 0.4, gh + 1.9, d / 2 + 0.5]);
  B.add(bm, new THREE.PlaneGeometry(0.85, 0.85), [w / 2 - 0.4, gh + 1.4, d / 2 + 0.75], [0, Math.PI / 2, 0]);
  // flower boxes on the upper floor
  for (let i = 0; i < 3; i++) { const x = -w / 2 + (w - 3.3) / 3 / 2 + 0.55 + i * ((w - 3.3) / 3 + 1.1); B.add(mat(TEX.wood('#7a4a2a')), tbox(1.2, 0.25, 0.3, 1), [x, gh + 0.78, d / 2 + 0.16]); for (let k = 0; k < 6; k++) B.add(solid(['#ff5a7a', '#ffd23a', '#ffffff', '#ff7a2a'][k % 4], { r: 0.7 }), new THREE.IcosahedronGeometry(0.09, 0), [x - 0.5 + k * 0.2, gh + 0.98, d / 2 + 0.18 + (k % 2) * 0.06]); }
  B.add(trim, tbox(w + 0.5, 0.4, 0.55, 2), [0, H - 0.3, d / 2 + 0.1]);
  roofKit(B, { w, d, y: H, r, parapet: stucco, coping: trim, units: 2, vents: 2 });
  return H;
}

function concreteMidrise(o, B) {
  const { width: w, depth: d, floors, palette: P } = o; const fh = 3.4, H = floors * fh + 0.4, r = rng(o.seed);
  const conc = mat(TEX.concrete(P.wall || '#bdb6ad'), { normal: 1 }), frame = solid(P.frame || '#3c4256', { r: 0.4, m: 0.5 }), fin = mat(TEX.concrete(P.trim || '#d8d1c6', false));
  B.add(solid('#232842'), new THREE.BoxGeometry(w - 0.8, H, d - 0.8), [0, H / 2, 0]);
  const faces = [[0, [0, 0, d / 2], w], [Math.PI / 2, [w / 2, 0, 0], d], [-Math.PI / 2, [-w / 2, 0, 0], d], [Math.PI, [0, 0, -d / 2], w]];
  for (const [yaw, off, len] of faces) {
    const F = framed(B, yaw, off);
    F.add(glassTint('#2c4166'), new THREE.PlaneGeometry(len - 1, fh - 0.4), [0, fh / 2, -0.45]); for (let x = -len / 2 + 0.5; x <= len / 2 - 0.5; x += 2) F.add(frame, new THREE.BoxGeometry(0.1, fh - 0.4, 0.12), [x, fh / 2, -0.4]);
    F.add(fin, tbox(len, 0.6, 0.6, 2), [0, fh - 0.1, 0]);
    for (let f = 1; f < floors; f++) {
      const yb = f * fh;
      F.add(conc, tbox(len, 1.2, 0.4, 2), [0, yb + 0.6, -0.2]);
      F.add(r() < 0.2 ? glassLit() : glassTint('#33507e'), new THREE.PlaneGeometry(len, fh - 1.2), [0, yb + 1.2 + (fh - 1.2) / 2, -0.38]);
      for (let x = -len / 2 + 0.6; x <= len / 2 - 0.6; x += 1.2) F.add(frame, new THREE.BoxGeometry(0.07, fh - 1.2, 0.1), [x, yb + 1.2 + (fh - 1.2) / 2, -0.33]);
      F.add(frame, new THREE.BoxGeometry(len, 0.06, 0.12), [0, yb + 1.25, -0.33]);
    }
    for (let x = -len / 2 + 0.3; x <= len / 2 - 0.29; x += 4) F.add(fin, tbox(0.4, H - fh, 0.7, 2), [x, fh + (H - fh) / 2, 0.15]);
  }
  B.add(fin, new THREE.BoxGeometry(6, 0.25, 2.6), [0, fh + 0.2, d / 2 + 1.3]);
  roofKit(B, { w, d, y: H, r, parapet: conc, coping: fin, units: 4, vents: 4, penthouse: [w * 0.35, 3.2, d * 0.35] });
  return H;
}

function suburbanHouse(o, B) {
  const { width: w, depth: d, palette: P } = o; const floors = Math.min(o.floors, 2), fh = 2.9, wallH = floors * fh + 0.4, r = rng(o.seed);
  const siding = mat(TEX.siding(P.wall || '#8fb8d8'), { normal: 1.2 }), trim = solid(P.trim || '#ffffff', { r: 0.5 }), found = mat(TEX.concrete('#a8a2a8', false));
  const roofM = mat(TEX.shingles(P.roof || '#4a3f63'), { normal: 1.2, roughness: 0.9 });
  B.add(found, tbox(w + 0.2, 0.4, d + 0.2, 2), [0, 0.2, 0]);
  const faces = [[0, [0, 0.4, d / 2], w, 3], [Math.PI / 2, [w / 2, 0.4, 0], d, 2], [-Math.PI / 2, [-w / 2, 0.4, 0], d, 2]];
  for (const [yaw, off, len, c] of faces) windowFacade(framed(B, yaw, off), { len, y0: 0, floors, fh, cols: c, winW: 1.0, winH: 1.35, sillH: 0.85, wall: siding, frame: trim, lintel: trim, sillMat: trim, mull: 'cross', seed: o.seed + yaw, litRatio: 0.3, shutters: solid(P.shutter || '#2f4a7a', { r: 0.6 }), t: 0.25, recess: 0.15 });
  B.add(siding, tbox(w, wallH - 0.4, 0.25, 2), [0, 0.4 + (wallH - 0.4) / 2, -d / 2 + 0.125]);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) B.add(trim, new THREE.BoxGeometry(0.16, wallH - 0.4, 0.16), [sx * (w / 2 - 0.05), 0.4 + (wallH - 0.4) / 2, sz * (d / 2 - 0.05)]);
  // gable roof (prism along x) with overhang + fascia
  const rh = d * 0.42, ov = 0.5, sl = Math.hypot(d / 2 + ov, rh), ang = Math.atan2(rh, d / 2 + ov);
  for (const s of [-1, 1]) {
    const g = tbox(w + ov * 2, 0.16, sl, 2); B.add(roofM, g, [0, wallH + rh / 2 - 0.05, s * (d / 2 + ov) / 2], [s * ang, 0, 0]);
    B.add(trim, new THREE.BoxGeometry(w + ov * 2 + 0.04, 0.22, 0.08), [0, wallH - 0.08, s * (d / 2 + ov)]);
  }
  for (const sx of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rh); tri.closePath(); const tg = new THREE.ShapeGeometry(tri); const uv = tg.attributes.uv, p = tg.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getY(i) / 2); B.add(siding, tg, [sx * (w / 2 - 0.01), wallH, 0], [0, sx * Math.PI / 2, 0]); }
  // chimney
  const brick = mat(TEX.brick('#9a4a3a', '#d0c4b2'));
  B.add(brick, tbox(0.9, rh + 2.2, 0.9, 1.6), [w * 0.3, wallH + (rh + 2.2) / 2 - 0.6, -d * 0.12]); B.add(found, new THREE.BoxGeometry(1.1, 0.15, 1.1), [w * 0.3, wallH + rh + 1.0 - 0.6 + 0.6, -d * 0.12]);
  // porch: deck, steps, posts, shed roof, front door
  const pw = w * 0.55, pd = 2.0, deck = mat(TEX.wood('#a8784a'));
  B.add(deck, tbox(pw, 0.2, pd, 1), [-w * 0.12, 0.5, d / 2 + pd / 2]);
  for (let i = 0; i < 3; i++) B.add(deck, tbox(1.6, 0.15, 0.32, 1), [-w * 0.12, 0.08 + i * 0.15, d / 2 + pd + 0.5 - i * 0.3]);
  for (const s of [-0.5, -0.17, 0.17, 0.5]) B.add(trim, new THREE.CylinderGeometry(0.09, 0.1, 2.5, 12), [-w * 0.12 + s * pw * 0.96, 1.85, d / 2 + pd - 0.12]);
  B.add(roofM, tbox(pw + 0.4, 0.12, pd + 0.6, 2), [-w * 0.12, 3.2, d / 2 + pd / 2], [0.18, 0, 0]);
  B.add(trim, new THREE.BoxGeometry(pw + 0.4, 0.2, 0.08), [-w * 0.12, 3.05, d / 2 + pd + 0.3]);
  for (let k = 0; k < 9; k++) { const x = -w * 0.12 - pw / 2 + 0.2 + k * (pw - 0.4) / 8; if (Math.abs(x + w * 0.12) < 0.85) continue; B.add(trim, new THREE.BoxGeometry(0.05, 0.75, 0.05), [x, 0.98, d / 2 + pd - 0.12]); }
  B.add(trim, new THREE.BoxGeometry(pw, 0.07, 0.08), [-w * 0.12, 1.36, d / 2 + pd - 0.12]);
  B.add(solid(P.door || '#c0392b', { r: 0.4 }), new THREE.BoxGeometry(1.0, 2.15, 0.08), [-w * 0.12, 0.6 + 1.08, d / 2 + 0.06]);
  B.add(trim, new THREE.BoxGeometry(1.3, 0.14, 0.12), [-w * 0.12, 2.85, d / 2 + 0.06]);
  B.add(solid('#d9b14a', { r: 0.3, m: 0.9 }), new THREE.SphereGeometry(0.05, 10, 8), [-w * 0.12 + 0.36, 1.65, d / 2 + 0.12]);
  return wallH + rh;
}

// ---------------------------------------------------------------- createBuilding
const DEFAULTS = {
  'modern-glass': { floors: 12, width: 14, depth: 12, palette: { wall: '#c9d2e3', trim: '#eef2f8', glass: '#3b6aa8' } },
  'brick-apartment': { floors: 5, width: 12, depth: 10, palette: { wall: '#b5523a', mortar: '#d8ccb6', trim: '#e9dfcf', frame: '#f6f1e8', door: '#2f6b4f' } },
  'cafe-storefront': { floors: 3, width: 8.5, depth: 9, palette: { wall: '#f2b98a', trim: '#fff4e2', frame: '#24382c', base: '#8a3b2e', door: '#c0392b', awning: ['#d8343b', '#fff4e6'], shutter: '#3f8a5f', signBg: '#203a2f', signFg: '#ffd36a' } },
  'concrete-midrise': { floors: 7, width: 16, depth: 14, palette: { wall: '#bdb6ad', trim: '#d8d1c6', frame: '#3c4256' } },
  'suburban-house': { floors: 2, width: 9, depth: 8, palette: { wall: '#8fbfe0', trim: '#ffffff', roof: '#4a3f63', door: '#d8343b', shutter: '#2f4a7a' } },
};
let BSEED = 7;
export function createBuilding(options = {}) {
  const style = options.style || 'brick-apartment';
  const def = DEFAULTS[style]; if (!def) throw new Error('unknown building style ' + style);
  const o = { ...def, ...options, seed: options.seed ?? BSEED++, palette: { ...def.palette, ...(options.palette || {}) } };
  const group = new THREE.Group(); group.name = style;
  const B = new Batch();
  const H = { 'modern-glass': modernGlass, 'brick-apartment': brickApartment, 'cafe-storefront': cafeStorefront, 'concrete-midrise': concreteMidrise, 'suburban-house': suburbanHouse }[style](o, B, group);
  B.build(group);
  group.userData.building = { style, height: H, width: o.width, depth: o.depth };
  return { group, height: H, width: o.width, depth: o.depth, options: o };
}
