// scenery.js — tactile real-life outdoor environments and street infrastructure.
//
//   import { createScenery, createTree, createStreetlight } from './scenery.js';
//   const s = createScenery({ preset: 'city-park-edge' });  scene.add(s.group);
//
// Pieces: createTree (trunk + branch clusters + leaf cards, never solid spheres), createBush, createGrassTufts,
// createRocks, createRoad (cracked asphalt, lane lines, crosswalk), createSidewalk (separate slabs with real
// expansion-joint gaps), createCurb, createStreetlight, createBench, createTrafficSignal, createHydrant, createTrashCan.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEX, tbox, mat, rng } from './textures.js';

const MATS = {};
const M = (k, f) => MATS[k] || (MATS[k] = f());
const solid = (c, o = {}) => M('s' + c + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0, ...(o.e ? { emissive: o.e, emissiveIntensity: o.ei ?? 1 } : {}) }));
const metalM = (c = '#3c4258') => M('metal' + c, () => mat(TEX.concrete(c, false), { roughness: 0.4, metalness: 0.65, normal: 0.5 }));
function mesh(geo, m, o = {}) { const x = new THREE.Mesh(geo, m); x.castShadow = o.cast !== false; x.receiveShadow = o.receive !== false; if (o.nd) x.userData.nd = o.nd; if (o.pos) x.position.set(...o.pos); if (o.rot) x.rotation.set(...o.rot); return x; }
function between(geo, a, b) { // orient a +y unit geometry between two points
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A); const L = d.length();
  const g = geo.clone(); g.scale(1, L, 1); g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(...a); return g;
}
const strip = (g) => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2)); return q; };
const merge = (list) => mergeGeometries(list.map(strip));
const noise3 = (x, y, z) => Math.sin(x * 1.7 + Math.sin(y * 2.3)) * Math.cos(y * 1.3 + z * 0.7) * 0.5 + Math.sin(z * 2.9 + x * 0.5) * 0.5;

// lumpy foliage clump (displaced icosphere) — the solid core that the leaf cards sit on
function clumpGeo(r, seed) {
  let g = new THREE.IcosahedronGeometry(r, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const k = 1 + 0.2 * noise3(n.x * 2.6 + seed, n.y * 2.6, n.z * 2.6) + 0.03 * noise3(n.x * 6, n.y * 6 + seed, n.z * 6); v.copy(n).multiplyScalar(r * k); if (v.y < -r * 0.35) v.y = -r * 0.35 + (v.y + r * 0.35) * 0.3; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
const foliageTex = () => M('foliageTex', () => {
  const t = TEX.grass(); return t;
});
function leafMaterial(color) { return M('leafM' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, normalMap: foliageTex().normalMap, normalScale: new THREE.Vector2(1.5, 1.5) })); }
function leafCardMaterial(color) { return M('leafC' + color, () => new THREE.MeshStandardMaterial({ map: TEX.leaves(color).map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 })); }

// ---------------------------------------------------------------- trees
export function createTree(o = {}) {
  const { height = 7, crown = 2.6, seed = 1, leaf = '#4f9a3a', bark = '#6b4a35', leafCards = 2200 } = o;
  const r = rng(seed * 7919 + 13), group = new THREE.Group(); group.name = 'tree';
  const barkM = M('bark' + bark, () => mat(TEX.bark(bark), { roughness: 0.95, normal: 1.4 }));
  const trunkH = height * 0.48, r0 = 0.12 + height * 0.022;
  const trunk = new THREE.CylinderGeometry(r0 * 0.62, r0, trunkH, 12, 8); trunk.translate(0, trunkH / 2, 0);
  { const p = trunk.attributes.position, uv = trunk.attributes.uv; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.9 + seed) * 0.08 * y / trunkH); p.setZ(i, p.getZ(i) + Math.cos(y * 0.7 + seed) * 0.06 * y / trunkH); uv.setXY(i, uv.getX(i) * (2 * Math.PI * r0) / 1.2, uv.getY(i) * trunkH / 1.2); } trunk.computeVertexNormals(); }
  const wood = [trunk];
  // root flare
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + r(); wood.push(between(new THREE.CylinderGeometry(0.03, r0 * 0.55, 1, 6), [Math.cos(a) * r0 * 1.9, 0.02, Math.sin(a) * r0 * 1.9], [0, 0.45, 0])); }
  // branches: main limbs from the upper trunk, each with two twigs; clumps sit at the tips
  const tips = [], top = [Math.sin(trunkH * 0.9 + seed) * 0.08, trunkH, Math.cos(trunkH * 0.7 + seed) * 0.06];
  const limbs = 5 + Math.floor(r() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = i / limbs * Math.PI * 2 + r() * 0.6, up = 0.55 + r() * 0.5, len = crown * (0.75 + r() * 0.35);
    const s = [top[0], trunkH * (0.82 + r() * 0.18), top[2]];
    const e = [s[0] + Math.cos(a) * len * 0.85, s[1] + len * up, s[2] + Math.sin(a) * len * 0.85];
    wood.push(between(new THREE.CylinderGeometry(r0 * 0.22, r0 * 0.48, 1, 7), s, e));
    tips.push([e, crown * (0.45 + r() * 0.2)]);
    for (let k = 0; k < 2; k++) {
      const b = a + (k ? 0.7 : -0.7) + (r() - 0.5) * 0.4, t = 0.55 + r() * 0.25, m = [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t, s[2] + (e[2] - s[2]) * t];
      const e2 = [m[0] + Math.cos(b) * len * 0.45, m[1] + len * 0.35, m[2] + Math.sin(b) * len * 0.45];
      wood.push(between(new THREE.CylinderGeometry(r0 * 0.1, r0 * 0.22, 1, 6), m, e2)); tips.push([e2, crown * (0.32 + r() * 0.15)]);
    }
  }
  tips.push([[top[0], trunkH + crown * 0.95, top[2]], crown * 0.6]);
  group.add(mesh(merge(wood), barkM));
  // clumps in three tones (underside darker, top lighter)
  const tones = [shade(leaf, -0.1), leaf, shade(leaf, 0.08)];
  const clumps = [[], [], []];
  tips.forEach(([p, rad], i) => { const g = clumpGeo(rad, seed + i); g.translate(...p); clumps[p[1] > trunkH + crown * 0.9 ? 2 : (i % 3 === 0 ? 0 : 1)].push(g); });
  clumps.forEach((list, i) => list.length && group.add(mesh(merge(list), leafMaterial(tones[i]), { nd: 'silhouette' })));
  // leaf cards scattered over the clump surfaces for soft, leafy silhouettes
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.75, 0.75), leafCardMaterial(shade(leaf, 0.04)), leafCards);
  im.castShadow = true; im.receiveShadow = true; im.userData.nd = 'card';
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3(), E = new THREE.Euler();
  for (let i = 0; i < leafCards; i++) {
    const [p, rad] = tips[Math.floor(r() * tips.length)]; const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 1.6);
    const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    Pp.set(p[0], p[1], p[2]).addScaledVector(n, rad * (0.88 + r() * 0.24)); E.set(r() * 6.28, r() * 6.28, r() * 6.28); Q.setFromEuler(E); const s = 0.7 + r() * 0.6; S.set(s, s, s);
    Mx.compose(Pp, Q, S); im.setMatrixAt(i, Mx);
  }
  group.add(im);
  return group;
}
function shade(hex, k) { const c = new THREE.Color(hex); const o = {}; c.getHSL(o); c.setHSL(o.h, o.s, Math.max(0, Math.min(1, o.l + k))); return '#' + c.getHexString(); }

export function createBush(o = {}) {
  const { size = 1.0, seed = 1, leaf = '#3f8f3a', flowers = null } = o;
  const r = rng(seed * 31 + 7), group = new THREE.Group(); group.name = 'bush';
  const list = [], pts = [];
  for (let i = 0; i < 4; i++) { const p = [(r() - 0.5) * size * 0.9, size * (0.35 + r() * 0.2), (r() - 0.5) * size * 0.6]; const rad = size * (0.38 + r() * 0.18); const g = clumpGeo(rad, seed + i); g.translate(...p); list.push(g); pts.push([p, rad]); }
  group.add(mesh(merge(list), leafMaterial(leaf), { nd: 'silhouette' }));
  const n = Math.round(380 * size), im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 0.4), leafCardMaterial(shade(leaf, 0.05)), n); im.castShadow = true; im.receiveShadow = true; im.userData.nd = 'card';
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const [p, rad] = pts[Math.floor(r() * pts.length)]; const n3 = new THREE.Vector3(r() - 0.5, r() * 0.8 - 0.1, r() - 0.5).normalize(); Pp.set(...p).addScaledVector(n3, rad); Q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)); const s = 0.8 + r() * 0.5; S.set(s, s, s); Mx.compose(Pp, Q, S); im.setMatrixAt(i, Mx); }
  group.add(im);
  if (flowers) { const fl = []; for (let i = 0; i < 18 * size; i++) { const [p, rad] = pts[Math.floor(r() * pts.length)]; const n3 = new THREE.Vector3(r() - 0.5, r() * 0.9, r() - 0.5).normalize(); const g = new THREE.IcosahedronGeometry(0.05, 0); g.translate(p[0] + n3.x * rad * 1.02, p[1] + n3.y * rad * 1.02, p[2] + n3.z * rad * 1.02); fl.push(g); } group.add(mesh(merge(fl), solid(flowers, { r: 0.6 }), { cast: false })); }
  return group;
}

// instanced grass tufts over an area (rect [x0, z0, x1, z1]); `avoid(x, z)` returns true to skip a spot
export function createGrassTufts({ area, count = 4000, seed = 3, y = 0, height = 0.32, avoid = null } = {}) {
  const blades = [];
  for (let k = 0; k < 6; k++) {
    const b = new THREE.BufferGeometry(); const h = 0.75 + (k % 3) * 0.18, w = 0.045;
    b.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.1 * (k - 2.5) * 0.4, h, 0.03], 3));
    b.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.4, 1, 0, 0.4, 1, 0, 0.7, 1], 3));
    b.setAttribute('color', new THREE.Float32BufferAttribute([0.1, 0.28, 0.08, 0.1, 0.28, 0.08, 0.32, 0.62, 0.16], 3));
    b.rotateY(k * 1.05); b.translate(Math.cos(k * 2.1) * 0.06, 0, Math.sin(k * 2.1) * 0.06); blades.push(b);
  }
  const tuft = mergeGeometries(blades);
  const im = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), count);
  im.receiveShadow = true; im.castShadow = false; im.userData.nd = 'card';
  const r = rng(seed * 101 + 5), Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3(); let n = 0, guard = 0;
  while (n < count && guard++ < count * 20) { const x = area[0] + r() * (area[2] - area[0]), z = area[1] + r() * (area[3] - area[1]); if (avoid && avoid(x, z)) continue; const s = height * (0.6 + r() * 0.8); Pp.set(x, y, z); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.3); S.set(s, s * (0.8 + r() * 0.5), s); Mx.compose(Pp, Q, S); im.setMatrixAt(n++, Mx); }
  im.count = n; return im;
}

export function createRocks({ area, count = 60, seed = 9, y = 0, size = [0.04, 0.25], color = '#9a948e' } = {}) {
  let g = new THREE.DodecahedronGeometry(1, 1); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.25 * noise3(v.x * 3, v.y * 3, v.z * 3); p.setXYZ(i, v.x * k, v.y * k * 0.6, v.z * k); } g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2)); }
  const m = M('rock' + color, () => mat(TEX.concrete(color, false), { roughness: 0.95, normal: 2 }));
  const im = new THREE.InstancedMesh(g, m, count); im.castShadow = true; im.receiveShadow = true;
  const r = rng(seed * 17 + 3), Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
  for (let i = 0; i < count; i++) { const s = size[0] + Math.pow(r(), 3) * (size[1] - size[0]); Pp.set(area[0] + r() * (area[2] - area[0]), y + s * 0.25, area[1] + r() * (area[3] - area[1])); Q.setFromEuler(new THREE.Euler(r(), r() * 6, r())); S.set(s, s, s * (0.7 + r() * 0.5)); Mx.compose(Pp, Q, S); im.setMatrixAt(i, Mx); }
  return im;
}

// ---------------------------------------------------------------- street infrastructure
export function createRoad({ x0 = -60, x1 = 60, z0 = 3.2, z1 = 11, crosswalk = [-11, -6.5] } = {}) {
  const group = new THREE.Group(); group.name = 'road';
  const L = x1 - x0, W = z1 - z0; const tex = TEX.asphalt();
  const geo = new THREE.PlaneGeometry(L, W); geo.rotateX(-Math.PI / 2); { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 4, uv.getY(i) * W / 4); }
  group.add(mesh(geo, mat(tex, { roughness: 0.9, normal: 1.2 }), { pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2], cast: false }));
  const paint = M('paint', () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, 256, 256); const r = rng(5); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(80,85,110,${0.2 + r() * 0.5})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 2 + r() * 4); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); });
  const yellow = solid('#f2c23c', { r: 0.7 });
  const cz = (z0 + z1) / 2, lines = [], ylines = [];
  for (let x = x0; x < x1; x += 4) ylines.push(new THREE.BoxGeometry(2.2, 0.012, 0.13).translate(x + 1.1, 0.006, cz));
  for (const z of [z0 + 0.35, z1 - 0.35]) lines.push(new THREE.BoxGeometry(L, 0.01, 0.12).translate((x0 + x1) / 2, 0.005, z));
  if (crosswalk) for (let z = z0 + 0.5; z < z1 - 0.4; z += 0.9) lines.push(new THREE.BoxGeometry(crosswalk[1] - crosswalk[0], 0.014, 0.5).translate((crosswalk[0] + crosswalk[1]) / 2, 0.007, z + 0.25));
  group.add(mesh(merge(lines), paint, { cast: false })); group.add(mesh(merge(ylines), yellow, { cast: false }));
  // manhole cover
  const mh = M('manhole', () => mat(TEX.grille(), { roughness: 0.5, metalness: 0.6, color: '#7a7f90' }));
  group.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), mh, { pos: [6, 0.01, z0 + 2.2], cast: false }));
  return group;
}

export function createSidewalk({ x0 = -60, x1 = 60, z0 = -1.5, z1 = 3.0, slab = 1.5, h = 0.15, gap = 0.03 } = {}) {
  const group = new THREE.Group(); group.name = 'sidewalk';
  const list = [];
  for (let x = x0; x < x1 - 0.01; x += slab) for (let z = z0; z < z1 - 0.01; z += slab) { const zz = Math.min(slab, z1 - z); list.push(tbox(slab - gap * 1.5, h, zz - gap * 1.5, slab).translate(x + slab / 2, h / 2, z + zz / 2)); }
  const m = M('sidewalkM', () => mat(TEX.sidewalk(), { roughness: 0.9, normal: 1.2 }));
  group.add(mesh(merge(list), m));
  group.add(mesh(tbox(x1 - x0, h * 0.8, (z1 - z0) - 0.02, 2).translate((x0 + x1) / 2, h * 0.4 - 0.01, (z0 + z1) / 2), solid('#6d6a7a', { r: 0.9 }), { cast: false }));
  return group;
}
export function createCurb({ x0 = -60, x1 = 60, z = 3.0, h = 0.17, w = 0.22 } = {}) {
  const m = M('curbM', () => mat(TEX.concrete('#d2ccd2', true), { roughness: 0.85 }));
  const list = []; for (let x = x0; x < x1; x += 2) list.push(tbox(1.98, h, w, 2).translate(x + 1, h / 2, z + w / 2));
  const g = new THREE.Group(); g.add(mesh(merge(list), m));
  g.add(mesh(tbox(x1 - x0, 0.01, 0.35, 2).translate((x0 + x1) / 2, 0.005, z + w + 0.17), mat(TEX.concrete('#8a8796', false)), { cast: false }));  // gutter
  return g;
}

export function createStreetlight(o = {}) {
  const { height = 6.2, lit = true, armDir = 1 } = o; const g = new THREE.Group(); g.name = 'streetlight';
  const m = metalM('#2f3a52');
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 16), m, { pos: [0, 0.25, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.12, height, 14), m, { pos: [0, height / 2, 0] }));
  g.add(mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 20), m, { pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0] }));
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, height - 0.3, 0), new THREE.Vector3(0, height + 0.5, armDir * 0.3), new THREE.Vector3(0, height + 0.35, armDir * 1.4));
  g.add(mesh(new THREE.TubeGeometry(curve, 16, 0.05, 8), m));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.32, 0.28, 16), m, { pos: [0, height + 0.24, armDir * 1.45] }));
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16), solid('#fff1c8', { e: lit ? '#ffd890' : '#000000', ei: 2.2 }), { pos: [0, height + 0.09, armDir * 1.45], nd: 'card' }));
  return g;
}

export function createBench(o = {}) {
  const g = new THREE.Group(); g.name = 'bench';
  const wood = M('benchWood', () => mat(TEX.wood('#b8763e'), { roughness: 0.7, normal: 1.3 })), iron = metalM('#2a3048');
  const L = o.length || 1.9;
  for (let i = 0; i < 3; i++) g.add(mesh(tbox(L, 0.04, 0.13, 1), wood, { pos: [0, 0.45, -0.18 + i * 0.16] }));
  for (let i = 0; i < 2; i++) g.add(mesh(tbox(L, 0.11, 0.035, 1), wood, { pos: [0, 0.62 + i * 0.16, -0.3 - i * 0.03], rot: [-0.2, 0, 0] }));
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - 0.15);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), iron, { pos: [x, 0.225, 0.12] })); g.add(mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), iron, { pos: [x, 0.42, -0.3], rot: [-0.18, 0, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.5), iron, { pos: [x, 0.42, -0.07] })); g.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.42), iron, { pos: [x, 0.7, -0.02] }));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), iron, { pos: [x, 0.58, 0.18] }));
  }
  return g;
}

export function createTrafficSignal(o = {}) {
  const { arm = 4.2, state = 'green' } = o; const g = new THREE.Group(); g.name = 'trafficSignal';
  const m = metalM('#2c3446'), housing = solid('#f2c23c', { r: 0.5 }), black = solid('#1c1f2c', { r: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 14), m, { pos: [0, 0.175, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.6, 14), m, { pos: [0, 2.8, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, arm, 10), m, { pos: [0, 5.3, arm / 2], rot: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(arm * 0.6, 0.9), 6), m, { pos: [0, 5.75, arm * 0.3], rot: [Math.atan2(arm * 0.6, -0.9) + Math.PI, 0, 0] }));
  const head = (y0, z, face) => {
    const hg = new THREE.Group(); hg.position.set(0, y0, z); hg.rotation.y = face; g.add(hg);
    hg.add(mesh(tbox(0.36, 1.05, 0.3, 1), housing)); hg.add(mesh(new THREE.BoxGeometry(0.56, 1.25, 0.04), black, { pos: [0, 0, -0.17] }));
    ['red', 'amber', 'green'].forEach((c, i) => {
      const on = c === state, col = { red: '#ff3b2f', amber: '#ffb020', green: '#3bf07a' }[c];
      hg.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 18), solid(on ? col : '#3a3d4a', on ? { e: col, ei: 2.5, r: 0.3 } : { r: 0.4 }), { pos: [0, 0.32 - i * 0.32, 0.16], rot: [Math.PI / 2, 0, 0], nd: on ? 'card' : undefined }));
      const visor = new THREE.CylinderGeometry(0.135, 0.135, 0.16, 18, 1, true, Math.PI * 0.5, Math.PI); hg.add(mesh(visor, black, { pos: [0, 0.32 - i * 0.32 + 0.0, 0.24], rot: [Math.PI / 2, 0, 0] }));
    });
    return hg;
  };
  head(4.75, arm - 0.2, 0); head(3.3, 0.22, 0);
  // pedestrian signal + push button
  const ped = new THREE.Group(); ped.position.set(0.24, 2.55, 0); ped.rotation.y = Math.PI / 2; g.add(ped);
  ped.add(mesh(tbox(0.34, 0.34, 0.2, 1), black)); ped.add(mesh(new THREE.PlaneGeometry(0.24, 0.24), solid('#f4f4f4', { e: '#ffffff', ei: 1.6 }), { pos: [0, 0, 0.105], nd: 'card' }));
  g.add(mesh(tbox(0.12, 0.18, 0.08, 1), housing, { pos: [0, 1.15, 0.13] }));
  return g;
}
export function createHydrant() {
  const g = new THREE.Group(); const red = solid('#d8343b', { r: 0.45, m: 0.2 }), cap = solid('#f2c23c', { r: 0.45 });
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 16), red, { pos: [0, 0.04, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.55, 16), red, { pos: [0, 0.35, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap, { pos: [0, 0.62, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 6), cap, { pos: [0, 0.76, 0] }));
  for (const a of [0, Math.PI / 2, -Math.PI / 2]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), red, { pos: [Math.sin(a) * 0.14, 0.42, Math.cos(a) * 0.14], rot: [Math.PI / 2, 0, -a] }));
  return g;
}
export function createTrashCan() {
  const g = new THREE.Group(); const m = metalM('#2f5a4a');
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.add(mesh(new THREE.BoxGeometry(0.06, 0.85, 0.025), m, { pos: [Math.cos(a) * 0.3, 0.48, Math.sin(a) * 0.3], rot: [0, -a, 0] })); }
  g.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 20), m, { pos: [0, 0.1, 0] })); g.add(mesh(new THREE.TorusGeometry(0.31, 0.025, 6, 24), m, { pos: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.33, 0.08, 20), m, { pos: [0, 0.95, 0] }));
  return g;
}

// ---------------------------------------------------------------- presets
// 'city-park-edge': a road in front, a sidewalk with slab joints and a curb, a park behind on the left
// (lawn, trees, bushes, tufts, rocks, bench), streetlights, a traffic signal, a hydrant and a trash can.
export function createScenery(options = {}) {
  const o = { preset: 'city-park-edge', park: [-60, -60, 0.5, -1.5], sidewalk: [-1.5, 3.0], road: [3.2, 11], seed: 4, trees: null, ...options };
  const group = new THREE.Group(); group.name = 'scenery:' + o.preset;
  const SW_H = 0.15;
  group.add(createRoad({ z0: o.road[0], z1: o.road[1] }));
  group.add(createSidewalk({ z0: o.sidewalk[0], z1: o.sidewalk[1], h: SW_H }));
  group.add(createCurb({ z: o.sidewalk[1], h: 0.17 }));
  // ground beyond the street: lawn in the park, paving elsewhere
  const [px0, pz0, px1, pz1] = o.park;
  const lawn = new THREE.PlaneGeometry(px1 - px0, pz1 - pz0); lawn.rotateX(-Math.PI / 2); { const uv = lawn.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (px1 - px0) / 4, uv.getY(i) * (pz1 - pz0) / 4); }
  group.add(mesh(lawn, mat(TEX.grass(), { roughness: 0.95, normal: 1.5 }), { pos: [(px0 + px1) / 2, 0.02, (pz0 + pz1) / 2], cast: false }));
  const pave = new THREE.PlaneGeometry(200, 120); pave.rotateX(-Math.PI / 2); { const uv = pave.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 100, uv.getY(i) * 60); }
  group.add(mesh(pave, mat(TEX.concrete('#a9a4ad', true), { roughness: 0.95 }), { pos: [0, 0, -60], cast: false }));
  // park edge: low stone border along the sidewalk
  group.add(mesh(tbox(px1 - px0, 0.28, 0.25, 2).translate((px0 + px1) / 2, 0.14, pz1 - 0.125), mat(TEX.concrete('#bdb7c0', false))));
  const r = rng(o.seed * 13);
  const trees = o.trees || [[-5.4, -4.6, 7.4, 2.7], [-13.5, -6.5, 8.6, 3.2], [-1.8, -11, 6.4, 2.3], [-20, -4.4, 7.8, 3.0], [-24, -16, 9, 3.4], [-4, -30, 8, 3], [-30, -30, 9.5, 3.5]];
  trees.forEach(([x, z, h, c], i) => { const t = createTree({ height: h, crown: c, seed: o.seed + i * 5, leaf: ['#4f9a3a', '#5aa63e', '#3f8a35', '#66ad3f'][i % 4] }); t.position.set(x, 0, z); t.rotation.y = r() * 6; group.add(t); });
  for (let i = 0; i < 9; i++) { const b = createBush({ size: 0.8 + r() * 0.6, seed: o.seed + i, leaf: ['#3f8f3a', '#4c9a3c', '#357f33'][i % 3], flowers: i % 3 === 0 ? ['#ff6b9a', '#ffd23a', '#ffffff'][i % 3] : null }); b.position.set(px1 - 1.0 - i * 2.6 - r(), 0, pz1 - 1.2 - r() * 0.8); group.add(b); }
  group.add(createGrassTufts({ area: [px0 + 30, pz0 + 35, px1, pz1 - 0.3], count: 6000, seed: o.seed }));
  group.add(createRocks({ area: [px0 + 40, pz0 + 45, px1, pz1 - 0.4], count: 70, seed: o.seed }));
  group.add(createRocks({ area: [-40, o.road[0] - 0.05, 40, o.road[0] + 0.25], count: 50, seed: o.seed + 1, size: [0.02, 0.06], color: '#8a8794' }));  // gutter pebbles
  return { group, sidewalkHeight: SW_H };
}
