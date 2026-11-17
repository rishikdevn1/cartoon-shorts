// Stage 2 showcase: three locked characters on a city sidewalk beside a park, all five building styles.
import * as THREE from 'three';
import { createCharacter } from '../lib/characters.js';
import { CAST } from '../lib/cast.js';
import { createBuilding } from '../lib/buildings.js';
import { createScenery, setFoliageSun, createStreetlight, createBench, createTrafficSignal, createHydrant, createTrashCan } from '../lib/scenery.js';
import { createPipeline, createLightingRig } from '../lib/lightingAndShaders.js';

const W = 1920, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, W / H, 0.1, 1500);
camera.position.set(1.4, 2.1, 12.4); camera.lookAt(-0.4, 3.1, -8);

// light: the approved golden rig (switch to 'night' on the exact "You see" frame). ?preset=night previews it.
const PRESET = new URLSearchParams(location.search).get('preset') || 'golden';
const rig = createLightingRig(renderer, scene, { preset: PRESET });
const key = rig.key, sunDir = rig.sunDir;

// streetscape
const sc = createScenery({ preset: 'city-park-edge', clear: [[-4.6, 3.6]], trees: [[-5.4, -4.6, 7.4, 2.7], [-13.5, -6.5, 8.6, 3.2], [-9, -13, 6.4, 2.3], [-20, -4.4, 7.8, 3.0], [-24, -16, 9, 3.4], [-4, -32, 8, 3], [-30, -30, 9.5, 3.5]] }); scene.add(sc.group);
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
  [pick('Maya'), -3.0, 1.0], [{ ...pick('Officer Diaz'), expression: 'deadpan', gesture: 'rest' }, -0.5, 0.6], [pick('Grandpa Joe'), 2.0, 1.0],
].map(([o, x, z]) => { const c = createCharacter(o); c.group.scale.setScalar(1.35); c.group.position.set(x, swY, z); scene.add(c.group); c.faceCamera(camera); c.faceLight(key); c.update(0.4); return c; });

setFoliageSun(camera, sunDir);
const post = createPipeline(renderer, scene, camera, { width: W, height: H });
post.render({ focus: camera.position.distanceTo(new THREE.Vector3(-0.5, 1.2, 0.6)), ...rig.post });
window.done = true;
