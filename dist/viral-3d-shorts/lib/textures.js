// textures.js — procedural colour + normal maps generated in code (miniature-diorama surface depth).
// Each texture is painted twice on a canvas: a colour pass and a height pass. The height pass is turned
// into a tangent-space normal map with a Sobel filter, so mortar, grain and aggregate catch the light.
import * as THREE from 'three';

const cache = new Map();
export const rng = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
const hashStr = (k) => { let h = 2166136261; for (const c of k) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cvs(w, h), og = out.getContext('2d'), img = og.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0); return out;
}
// make({ key, size, color(g, r, w, h), height(g, r, w, h), strength }) -> { map, normalMap }
export function makeTexture({ key, size = 512, w = size, h = size, color, height, strength = 3 }) {
  if (cache.has(key)) return cache.get(key);
  const cc = cvs(w, h), hc = cvs(w, h);
  color(cc.getContext('2d'), rng(hashStr(key)), w, h);
  if (height) height(hc.getContext('2d'), rng(hashStr(key)), w, h);
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
  const out = { map, normalMap: height ? new THREE.CanvasTexture(normalFromHeight(hc, strength)) : null };
  for (const t of [out.map, out.normalMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  cache.set(key, out); return out;
}
const speck = (g, r, w, h, n, cols, s0, s1, a = 1) => { for (let i = 0; i < n; i++) { g.globalAlpha = a * (0.3 + r() * 0.7); g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = s0 + r() * (s1 - s0); g.fillRect(r() * w, r() * h, s, s); } g.globalAlpha = 1; };
const blot = (g, r, w, h, n, cols, s0, s1, a) => { for (let i = 0; i < n; i++) { g.globalAlpha = a; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.ellipse(r() * w, r() * h, s0 + r() * (s1 - s0), s0 + r() * (s1 - s0), r() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; };
const shadeHex = (hex, k) => { const c = new THREE.Color(hex); const o = {}; c.getHSL(o); c.setHSL(o.h, o.s, Math.max(0, Math.min(1, o.l + k))); return '#' + c.getHexString(); };

// ---- library (texture tile sizes in metres are noted; use uvScale in geometry helpers)
export const TEX = {
  // 1.6 m tile: 8 courses of running-bond brick
  brick: (base = '#b5523a', mortar = '#d9cdb8') => makeTexture({
    key: 'brick' + base + mortar, strength: 4,
    color: (g, r, w, h) => {
      g.fillStyle = mortar; g.fillRect(0, 0, w, h);
      const rh = h / 8, bw = w / 4;
      for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
        const ox = (y % 2) * bw / 2; g.fillStyle = shadeHex(base, (r() - 0.5) * 0.12); g.fillRect(x * bw + ox + 3, y * rh + 3, bw - 6, rh - 6);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x * bw + ox + 3, y * rh + 3, bw - 6, 4);
      }
      speck(g, r, w, h, 2500, ['#3a1d14', '#f0c8a8'], 1, 3, 0.35);
    },
    height: (g, r, w, h) => {
      g.fillStyle = '#303030'; g.fillRect(0, 0, w, h);
      const rh = h / 8, bw = w / 4;
      for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) { const ox = (y % 2) * bw / 2; g.fillStyle = '#d8d8d8'; g.fillRect(x * bw + ox + 4, y * rh + 4, bw - 8, rh - 8); }
      speck(g, r, w, h, 3000, ['#a0a0a0', '#ffffff'], 1, 3, 0.6);
    },
  }),
  // 2 m tile
  concrete: (base = '#b9b4ab', seams = true) => makeTexture({
    key: 'concrete' + base + seams, strength: 2,
    color: (g, r, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); blot(g, r, w, h, 60, [shadeHex(base, -0.06), shadeHex(base, 0.05)], 20, 70, 0.12); speck(g, r, w, h, 6000, [shadeHex(base, -0.2), shadeHex(base, 0.15)], 1, 2, 0.5); if (seams) { g.fillStyle = shadeHex(base, -0.25); g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); for (const [x, y] of [[w * 0.25, h * 0.25], [w * 0.75, h * 0.25], [w * 0.25, h * 0.75], [w * 0.75, h * 0.75]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } } },
    height: (g, r, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); speck(g, r, w, h, 9000, ['#606060', '#c8c8c8'], 1, 2, 0.8); if (seams) { g.fillStyle = '#202020'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); } },
  }),
  // 4 m tile: blue-grey asphalt with aggregate and branching cracks
  asphalt: () => makeTexture({
    key: 'asphalt', size: 1024, strength: 2.5,
    color: (g, r, w, h) => {
      g.fillStyle = '#4c5060'; g.fillRect(0, 0, w, h); blot(g, r, w, h, 90, ['#424656', '#585c6c', '#4a4c58'], 30, 120, 0.25);
      speck(g, r, w, h, 26000, ['#2c3040', '#6b7088', '#8a8ea2', '#3a3e50'], 1, 3, 0.7);
      g.strokeStyle = '#23263a'; g.lineCap = 'round';
      for (let k = 0; k < 9; k++) { let x = r() * w, y = r() * h; g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); if (r() < 0.2) { g.moveTo(x, y); } } g.stroke(); }
      blot(g, r, w, h, 8, ['#353a4c'], 40, 90, 0.35);   // patch repairs
    },
    height: (g, r, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); speck(g, r, w, h, 30000, ['#505050', '#b0b0b0', '#ffffff'], 1, 3, 0.8);
      g.strokeStyle = '#101010'; for (let k = 0; k < 9; k++) { let x = r() * w, y = r() * h; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
    },
  }),
  // 1.5 m tile = one sidewalk slab with an expansion joint around it
  sidewalk: () => makeTexture({
    key: 'sidewalk', strength: 2.5,
    color: (g, r, w, h) => { g.fillStyle = '#b4a698'; g.fillRect(0, 0, w, h); blot(g, r, w, h, 50, ['#a6988a', '#c2b4a6', '#ab9c90'], 20, 60, 0.2); speck(g, r, w, h, 9000, ['#8f8a96', '#e6e2e8'], 1, 2, 0.6); g.fillStyle = '#9a8e84'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillStyle = 'rgba(255,248,236,0.35)'; g.fillRect(0, 2, w, 1); g.fillRect(2, 0, 1, h); g.strokeStyle = 'rgba(80,70,90,0.35)'; g.lineWidth = 1.5; for (let k = 0; k < 2; k++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } },
    height: (g, r, w, h) => { g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h); speck(g, r, w, h, 9000, ['#707070', '#d0d0d0'], 1, 2, 0.8); g.fillStyle = '#585858'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); },
  }),
  // 2 m tile horizontal clapboard siding
  siding: (base = '#8fb8d8') => makeTexture({
    key: 'siding' + base, strength: 5,
    color: (g, r, w, h) => { const n = 12, bh = h / n; for (let i = 0; i < n; i++) { g.fillStyle = shadeHex(base, (r() - 0.5) * 0.04); g.fillRect(0, i * bh, w, bh); const gr = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,20,60,0.35)'); g.fillStyle = gr; g.fillRect(0, i * bh, w, bh); } speck(g, r, w, h, 1500, ['rgba(0,0,0,0.3)'], 1, 2, 0.4); },
    height: (g, r, w, h) => { const n = 12, bh = h / n; for (let i = 0; i < n; i++) { const gr = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh); gr.addColorStop(0, '#606060'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, i * bh, w, bh); } },
  }),
  // 1 m tile wood planks with grain (benches, porches)
  wood: (base = '#b07a46') => makeTexture({
    key: 'wood' + base, strength: 3,
    color: (g, r, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = shadeHex(base, -0.15); g.lineWidth = 2; for (let i = 0; i < 60; i++) { const y = r() * h; g.globalAlpha = 0.3 + r() * 0.4; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); g.stroke(); } g.globalAlpha = 1; for (let k = 0; k < 4; k++) { g.fillStyle = shadeHex(base, -0.25); g.beginPath(); g.ellipse(r() * w, r() * h, 10, 5, 0, 0, 7); g.fill(); } },
    height: (g, r, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); g.strokeStyle = '#606060'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { const y = r() * h; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); g.stroke(); } },
  }),
  // 1.2 m tile vertical bark grooves
  bark: (base = '#6b4a35') => makeTexture({
    key: 'bark' + base, strength: 6,
    color: (g, r, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const x = r() * w; g.strokeStyle = r() < 0.5 ? shadeHex(base, -0.18) : shadeHex(base, 0.1); g.lineWidth = 2 + r() * 5; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin(y * 0.05 + i) * 6 + (r() - 0.5) * 6, y); g.stroke(); } speck(g, r, w, h, 2000, ['#3a2a20', '#9a8070'], 1, 3, 0.5); blot(g, r, w, h, 12, ['#6f8a4a'], 6, 20, 0.25); },
    height: (g, r, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const x = r() * w; g.strokeStyle = r() < 0.5 ? '#202020' : '#ffffff'; g.lineWidth = 2 + r() * 5; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin(y * 0.05 + i) * 6, y); g.stroke(); } },
  }),
  // 2 m tile roof shingles
  shingles: (base = '#5a4a6a') => makeTexture({
    key: 'shingles' + base, strength: 4,
    color: (g, r, w, h) => { const rows = 10, rh = h / rows; for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) { const ox = (y % 2) * w / 16; g.fillStyle = shadeHex(base, (r() - 0.5) * 0.12); g.fillRect(x * w / 8 + ox + 1, y * rh, w / 8 - 2, rh - 2); g.fillStyle = 'rgba(20,10,40,0.35)'; g.fillRect(x * w / 8 + ox + 1, y * rh + rh - 6, w / 8 - 2, 5); } speck(g, r, w, h, 4000, ['#2a2235', '#9a8aa8'], 1, 2, 0.5); },
    height: (g, r, w, h) => { const rows = 10, rh = h / rows; for (let y = 0; y < rows; y++) { const gr = g.createLinearGradient(0, y * rh, 0, y * rh + rh); gr.addColorStop(0, '#606060'); gr.addColorStop(1, '#f0f0f0'); g.fillStyle = gr; g.fillRect(0, y * rh, w, rh); } },
  }),
  // 2 m tile stucco / plaster
  stucco: (base = '#f0d9b0') => makeTexture({
    key: 'stucco' + base, strength: 2.2,
    color: (g, r, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); blot(g, r, w, h, 70, [shadeHex(base, -0.05), shadeHex(base, 0.04)], 15, 50, 0.2); speck(g, r, w, h, 8000, [shadeHex(base, -0.15), shadeHex(base, 0.08)], 1, 2, 0.5); },
    height: (g, r, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); speck(g, r, w, h, 14000, ['#606060', '#d0d0d0'], 1, 3, 0.9); },
  }),
  // 4 m tile lawn
  grass: () => makeTexture({
    key: 'grass', size: 1024, strength: 3,
    color: (g, r, w, h) => { g.fillStyle = '#4f9a3a'; g.fillRect(0, 0, w, h); blot(g, r, w, h, 120, ['#448c33', '#5fae45', '#3f7f30', '#6cb84c'], 20, 80, 0.3); g.lineCap = 'round'; for (let i = 0; i < 9000; i++) { const x = r() * w, y = r() * h; g.strokeStyle = ['#3b7a2b', '#6fbf4e', '#89cf5e', '#2f6a25'][Math.floor(r() * 4)]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke(); } blot(g, r, w, h, 14, ['#8a7a4a'], 6, 18, 0.25); },
    height: (g, r, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 12000; i++) { g.fillStyle = r() < 0.5 ? '#ffffff' : '#404040'; g.fillRect(r() * w, r() * h, 2, 4); } },
  }),
  // metal grille (AC units, fire escape grating)
  grille: () => makeTexture({
    key: 'grille', size: 256, strength: 5,
    color: (g, r, w, h) => { g.fillStyle = '#a9adb8'; g.fillRect(0, 0, w, h); g.fillStyle = '#5c6070'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3); speck(g, r, w, h, 400, ['#7a5a40'], 1, 3, 0.4); },
    height: (g, r, w, h) => { g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, w, h); g.fillStyle = '#202020'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3); },
  }),
  // leaf cluster sprite with alpha (for fluffy foliage edges)
  leaves: (base = '#4f9a3a') => {
    const key = 'leaves' + base; if (cache.has(key)) return cache.get(key);
    const c = cvs(256, 256), g = c.getContext('2d'), r = rng(hashStr(key));
    for (let i = 0; i < 40; i++) {
      const x = 30 + r() * 196, y = 30 + r() * 196, a = r() * Math.PI * 2, l = 22 + r() * 18;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = shadeHex(base, (r() - 0.45) * 0.22); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.35, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.35, 0, 0); g.fill();
      g.strokeStyle = shadeHex(base, -0.2); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(l * 0.9, 0); g.stroke(); g.restore();
    }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; const out = { map }; cache.set(key, out); return out;
  },
};

// Box geometry with UVs scaled so one texture tile covers `tile` metres on every face.
export function tbox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
export function mat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap || null, normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1), roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0, color: o.color || '#ffffff', ...(o.extra || {}) });
}
