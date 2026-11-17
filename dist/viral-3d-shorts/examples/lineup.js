// Studio lineup: characters from createCharacter() standing on a lit 3D floor + their 8 expressions.
import * as THREE from 'three';
import { createCharacter, drawHead, EXPRESSIONS } from '../lib/characters.js';
import { createStudioSet } from '../lib/studio.js';
import { CAST as ALL } from '../lib/cast.js';
const SET = new URLSearchParams(location.search).get('set') || 'a';
const W = 1920, H = 1080;
const wrap = document.getElementById('wrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
wrap.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2f45');
const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 200); cam.position.set(0, 5.0, 17.6); cam.lookAt(0, 0.35, 0);
const studio = createStudioSet({ keyPos: [-8, 10, 3.5] }); scene.add(studio.group);
const CAST = SET === 'b' ? ALL.slice(6) : ALL.slice(0, 6);
const N = CAST.length, SP = 2.12;
const chars = CAST.map((o, i) => {
  const c = createCharacter(o); const x = (i - (N - 1) / 2) * SP;
  if (o.pose === 'sitting_dangling_legs') { // a wooden crate to sit on
    const h = 0.62; const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.6), new THREE.MeshStandardMaterial({ color: '#b07a46', roughness: 0.8 }));
    crate.position.set(x, h / 2, -0.36); crate.castShadow = crate.receiveShadow = true; scene.add(crate);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.66), new THREE.MeshStandardMaterial({ color: '#8a5a30', roughness: 0.8 })); lid.position.set(x, h + 0.025, -0.36); lid.castShadow = lid.receiveShadow = true; scene.add(lid);
    c.group.position.set(x, h + 0.05, 0.0);
  } else c.group.position.set(x, 0, 0);
  scene.add(c.group); c.faceCamera(cam); c.faceLight(studio.key); c.update(0.45); return c;
});
renderer.render(scene, cam);

const ov = document.createElement('canvas'); ov.width = W; ov.height = H; wrap.appendChild(ov);
const g = ov.getContext('2d');
g.font = '700 30px "Inter Display", Inter, sans-serif'; g.fillStyle = '#23263a'; g.textAlign = 'left';
g.fillText('createCharacter() · studio lineup ' + (SET === 'b' ? 'B' : 'A') + ' — v3', 48, 62);
g.font = '500 18px Inter, sans-serif'; g.fillStyle = 'rgba(35,38,58,0.7)';
g.fillText('stick ink limbs · 8 comic expressions · poses: standing / sitting / cane / holding prop · no pedestals · full-silhouette shadows', 48, 92);
const toScreen = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
chars.forEach((c, i) => {
  const [cx, fy] = toScreen(new THREE.Vector3((i - (N - 1) / 2) * SP, 0, 0.9));
  g.textAlign = 'center'; g.font = '700 22px "Inter Display", Inter, sans-serif'; g.fillStyle = '#23263a'; g.fillText(CAST[i].name, cx, fy + 30);
  g.font = '500 14px Inter, sans-serif'; g.fillStyle = 'rgba(35,38,58,0.72)'; g.fillText(CAST[i].role, cx, fy + 50);
  const cw = 288, top = fy + 64, x0 = cx - cw / 2;
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.roundRect(x0, top, cw, 216, 14); g.fill(); g.strokeStyle = 'rgba(35,38,58,0.12)'; g.lineWidth = 1.5; g.stroke();
  EXPRESSIONS.forEach((ex, k) => {
    const hx = x0 + 37 + (k % 4) * 71, hy = top + 56 + Math.floor(k / 4) * 104;
    g.save(); g.translate(hx, hy); const R = 23; g.scale(R / 0.25, R / 0.25);
    drawHead(g, c.options, ex, false, 0.25, { steam: true, hatLift: ex === 'bug_eyed_shock' && c.options.hatLaunch ? 0.12 : 0 }); g.restore();
    g.font = '600 12px Inter, sans-serif'; const lab = { deadpan: 'deadpan', smug_happy: 'smug happy', gritted_teeth: 'gritted', bug_eyed_shock: 'bug-eyed', nervous_sweat: 'nervous', furious_steam: 'furious', scheming: 'scheming', laughing: 'laughing' }[ex]; const tw = g.measureText(lab).width + 8; g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.roundRect(hx - tw / 2, hy + 31, tw, 15, 4); g.fill(); g.fillStyle = 'rgba(35,38,58,0.78)'; g.fillText({ deadpan: 'deadpan', smug_happy: 'smug happy', gritted_teeth: 'gritted', bug_eyed_shock: 'bug-eyed', nervous_sweat: 'nervous', furious_steam: 'furious', scheming: 'scheming', laughing: 'laughing' }[ex], hx, hy + 42);
  });
});
window.done = true;
