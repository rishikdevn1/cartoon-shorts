// studio.js — a seamless cyclorama set with key/fill/rim lights, for lineups and showcases.
import * as THREE from 'three';
export function createStudioSet({ color = '#cfd3ea', platforms = [], keyPos = [-8, 10, 3.5] } = {}) {
  const group = new THREE.Group();
  const prof = [];
  for (let z = 12; z > -4; z -= 0.5) prof.push([z, 0]);
  for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI / 2; prof.push([-4 - Math.sin(a) * 5, 5 - Math.cos(a) * 5]); }
  for (let y = 6; y <= 30; y += 2) prof.push([-9, y]);
  const pos = [], idx = [];
  prof.forEach(([z, y], r) => { for (const x of [-40, 40]) pos.push(x, y, z); if (r) { const a = (r - 1) * 2, b = r * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const cyc = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })); cyc.receiveShadow = true; group.add(cyc);
  for (const [x, z] of platforms) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.74, 0.06, 64), new THREE.MeshStandardMaterial({ color: '#f6f4fb', roughness: 0.5 })); p.position.set(x, 0.03, z); p.receiveShadow = true; group.add(p); }
  const key = new THREE.DirectionalLight('#fff3e2', 2.6); key.position.set(...keyPos); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 7, bottom: -5, near: 1, far: 50 }); key.shadow.camera.updateProjectionMatrix();
  group.add(key, key.target);
  group.add(new THREE.HemisphereLight('#dfe6ff', '#8a7f9a', 0.75));
  const rim = new THREE.DirectionalLight('#9fb8ff', 1.2); rim.position.set(6, 5, -6); group.add(rim);
  return { group, key };
}
