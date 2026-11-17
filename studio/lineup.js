// Studio lineup: six characters from createCharacter() on a lit 3D floor + expression sheets.
import * as THREE from 'three';
import { createCharacter, drawHead, EXPRESSIONS } from '../lib/characters.js';

const W = 1920, H = 1080;
const wrap = document.getElementById('wrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
wrap.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2f45');
const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 200); cam.position.set(0, 2.3, 17.5); cam.lookAt(0, 0.45, 0);

// cyclorama: one seamless sheet — floor, a curved cove, then the back wall
{
  const prof = []; // (z, y) along the profile
  for (let z = 12; z > -4; z -= 0.5) prof.push([z, 0]);
  for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI / 2; prof.push([-4 - Math.sin(a) * 5, 5 - Math.cos(a) * 5]); }
  for (let y = 6; y <= 30; y += 2) prof.push([-9, y]);
  const pos = [], idx = [], nx = 2;
  prof.forEach(([z, y], r) => { for (const x of [-40, 40]) pos.push(x, y, z); if (r) { const a = (r - 1) * nx, b = r * nx; idx.push(a, b, a + 1, b, b + 1, a + 1); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const cyc = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cfd3ea', roughness: 0.95, side: THREE.DoubleSide })); cyc.receiveShadow = true; scene.add(cyc);
}
// low round platforms
for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.06, 64), new THREE.MeshStandardMaterial({ color: '#f4f2fa', roughness: 0.55 })); p.position.set((i - 2.5) * 2.05, 0.03, 0); p.receiveShadow = true; scene.add(p); }

// lights: warm key (casts shadows), cool fill, rim
const key = new THREE.DirectionalLight('#fff3e2', 2.6); key.position.set(-4.5, 8, 11); key.castShadow = true;
key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 6, bottom: -4, near: 1, far: 40 }); key.shadow.camera.updateProjectionMatrix(); scene.add(key);
scene.add(new THREE.HemisphereLight('#dfe6ff', '#8a7f9a', 0.75));
const rim = new THREE.DirectionalLight('#9fb8ff', 1.2); rim.position.set(6, 5, -6); scene.add(rim);
// a soft spotlight pool on the floor


const CAST = [
  { name: 'Maya', role: 'Modern casual', outfit: 'casual', hair: 'ponytail', expression: 'neutral', gesture: 'wave', height: 1.66,
    palette: { skin: '#f1c7a5', hair: '#5a3220', top: '#2fa58f', bottom: '#3f5f9e', shoes: '#ffffff', accent: '#ffcf4a' } },
  { name: 'Mr. Grant', role: 'Business suit', outfit: 'suit', hair: 'sidepart', expression: 'smug', gesture: 'hips', height: 1.82, glasses: true,
    palette: { skin: '#e2a982', hair: '#8f8f98', top: '#2c3e6b', bottom: '#2c3e6b', shoes: '#2a1e1a', accent: '#d8343b' } },
  { name: 'Officer Diaz', role: 'Uniform', outfit: 'uniform', hair: 'short', headwear: 'cap', expression: 'angry', gesture: 'point', height: 1.78, mustache: true,
    palette: { skin: '#a8693f', hair: '#1e1716', top: '#3d5f9e', bottom: '#253a63', shoes: '#1b1b22', accent: '#f2c23c', hat: '#253a63', badge: '#f2c23c' } },
  { name: 'Marcus', role: 'Historical · Roman', outfit: 'historical', era: 'roman', hair: 'curly', headwear: 'laurel', expression: 'laughing', gesture: 'belly', height: 1.74, beard: true,
    palette: { skin: '#d39a6d', hair: '#3b2414', top: '#f1e6cc', bottom: '#f1e6cc', accent: '#b3262f' } },
  { name: 'Zoe', role: 'Modern casual', outfit: 'casual', hair: 'afro', expression: 'shocked', gesture: 'armsUp', height: 1.6,
    palette: { skin: '#7a4a2b', hair: '#1e1716', top: '#f05a7e', bottom: '#2f2f3f', shoes: '#ffd23a', accent: '#ffffff' } },
  { name: 'Prof. Hale', role: 'Historical · Victorian', outfit: 'historical', era: 'victorian', hair: 'bald', headwear: 'tophat', expression: 'nervous', gesture: 'shrug', height: 1.76, mustache: true,
    palette: { skin: '#f6d2b8', hair: '#c9c9cf', top: '#5b3a6e', bottom: '#2a2530', shoes: '#2a1e1a', accent: '#c0392b', hat: '#8a2b2b' } },
];
const chars = CAST.map((o, i) => { const c = createCharacter(o); c.group.position.set((i - 2.5) * 2.05, 0.06, 0); scene.add(c.group); c.faceCamera(cam); c.update(0.3); return c; });
renderer.render(scene, cam);

// 2D overlay: title, name tags, expression sheets drawn with the same drawHead()
const ov = document.createElement('canvas'); ov.width = W; ov.height = H; wrap.appendChild(ov);
const g = ov.getContext('2d');
g.font = '700 30px "Inter Display", Inter, sans-serif'; g.fillStyle = '#23263a'; g.textAlign = 'left';
g.fillText('createCharacter() · studio lineup', 48, 62);
g.font = '500 18px Inter, sans-serif'; g.fillStyle = 'rgba(35,38,58,0.7)';
g.fillText('3.5 heads tall · round head · thin limbs · 12 mm ink line · lit 3D cards with real shadows', 48, 92);
const toScreen = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
chars.forEach((c, i) => {
  const [cx, fy] = toScreen(new THREE.Vector3((i - 2.5) * 2.05, 0, 0.75));
  // name tag
  g.textAlign = 'center'; g.font = '700 22px "Inter Display", Inter, sans-serif'; g.fillStyle = '#23263a'; g.fillText(CAST[i].name, cx, fy + 34);
  g.font = '500 15px Inter, sans-serif'; g.fillStyle = 'rgba(35,38,58,0.7)'; g.fillText(CAST[i].role + ' · ' + CAST[i].expression, cx, fy + 56);
  // expression sheet: 3 x 2 heads
  const top = fy + 74, cw = 286, x0 = cx - cw / 2;
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.roundRect(x0, top, cw, 272, 14); g.fill(); g.strokeStyle = 'rgba(35,38,58,0.12)'; g.lineWidth = 1.5; g.stroke();
  EXPRESSIONS.forEach((ex, k) => {
    const hx = x0 + 48 + (k % 3) * 95, hy = top + 74 + Math.floor(k / 3) * 128;
    g.save(); g.translate(hx, hy); const R = 30; g.scale(R / 0.25, R / 0.25); drawHead(g, c.options, ex, false, 0.25); g.restore();
    g.font = '600 13px Inter, sans-serif'; g.fillStyle = 'rgba(35,38,58,0.75)'; g.textAlign = 'center'; g.fillText(ex, hx, hy + 52);
  });
});
window.done = true;
