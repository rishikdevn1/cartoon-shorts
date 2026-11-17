// Stage 2 showcase: three locked characters on a city sidewalk beside a park, all five building styles.
import * as THREE from 'three';
import { createCharacter } from '../lib/characters.js';
import { CAST } from '../lib/cast.js';
import { createBuilding } from '../lib/buildings.js';
import { createScenery, createStreetlight, createBench, createTrafficSignal, createHydrant, createTrashCan } from '../lib/scenery.js';
import { createPipeline, createSky } from '../lib/post.js';

const W = 1920, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1500);
camera.position.set(2.2, 2.7, 15.5); camera.lookAt(-1.2, 3.6, -8);

// light: saturated golden key from the low left, warm rim from behind right, cool indigo sky fill
const sunDir = new THREE.Vector3(-0.78, 0.36, 0.5).normalize();
createSky(renderer, scene, { sunDir: new THREE.Vector3(-0.9, 0.1, -0.42), horizon: '#ff9c62', mid: '#e89a86', top: '#2f62d0', sun: '#ffd9a0' });
const key = new THREE.DirectionalLight('#ffad52', 5.6); key.position.copy(sunDir).multiplyScalar(60); key.target.position.set(0, 0, -6);
key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
Object.assign(key.shadow.camera, { left: -32, right: 32, top: 26, bottom: -18, near: 1, far: 160 }); key.shadow.camera.updateProjectionMatrix();
scene.add(key, key.target);
const rim = new THREE.DirectionalLight('#ffc070', 3.0); rim.position.set(40, 18, -45); scene.add(rim);
scene.add(new THREE.HemisphereLight('#8fa4ff', '#4a3f6a', 0.7));
scene.fog = new THREE.Fog('#e6b49c', 90, 480);

// streetscape
const sc = createScenery({ preset: 'city-park-edge' }); scene.add(sc.group);
const swY = sc.sidewalkHeight;
const place = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
place(createStreetlight({ armDir: 1 }), -4.2, swY, 2.55);
place(createStreetlight({ armDir: 1 }), 7.5, swY, 2.55);
place(createTrafficSignal({ arm: 4.4, state: 'green' }), -9.8, swY, 2.6);
place(createBench(), -6.2, swY, -0.7);
place(createHydrant(), 3.4, swY, 2.45);
place(createTrashCan(), -6.6, swY, 2.4);

// all five building styles at different depths
const bld = (style, x, z, opt = {}, ry = 0) => { const b = createBuilding({ style, ...opt }); b.group.position.set(x, 0, z); b.group.rotation.y = ry; scene.add(b.group); return b; };
bld('cafe-storefront', 5.0, -1.5 - 4.5, { width: 8.5, depth: 9 });
bld('brick-apartment', 15.4, -1.5 - 5, { width: 12, depth: 10, floors: 5 });
bld('concrete-midrise', -27, -52, { width: 16, depth: 14, floors: 8 }, 0.2);
bld('modern-glass', -6, -78, { width: 15, depth: 13, floors: 16 });
bld('suburban-house', -12.5, -21, { width: 9, depth: 8 }, 0.18);
// distant skyline for depth
bld('modern-glass', 34, -110, { width: 18, depth: 16, floors: 20, palette: { glass: '#4a6fb0' } });
bld('concrete-midrise', -40, -120, { width: 20, depth: 16, floors: 10 });
bld('modern-glass', -2, -150, { width: 16, depth: 16, floors: 26, palette: { glass: '#5a7cc0' } });
bld('brick-apartment', 22, -40, { width: 14, depth: 12, floors: 6, palette: { wall: '#9a4a5a' } });
bld('concrete-midrise', 8, -60, { width: 14, depth: 14, floors: 9, palette: { wall: '#c9b9a8' } });

// the locked cast: Maya with coffee, Officer Diaz, Grandpa Joe on his cane
const pick = (n) => CAST.find((c) => c.name === n);
const cast = [
  [pick('Maya'), -2.1, 0.9], [{ ...pick('Officer Diaz'), expression: 'deadpan', gesture: 'rest' }, -0.2, 0.5], [pick('Grandpa Joe'), 1.8, 0.9],
].map(([o, x, z]) => { const c = createCharacter(o); c.group.position.set(x, swY, z); scene.add(c.group); c.faceCamera(camera); c.faceLight(key); c.update(0.4); return c; });

const post = createPipeline(renderer, scene, camera, { width: W, height: H });
post.render({ focus: camera.position.distanceTo(new THREE.Vector3(-0.2, 1, 0.6)), farBlur: 16, nearBlur: 5, bloom: 0.3, exposure: 0.86, sat: 1.28 });
window.done = true;
