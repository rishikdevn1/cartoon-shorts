// Remotion + three.js: the same createCharacter() rigs, animated deterministically per frame.
import React, { useMemo, useLayoutEffect } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createCharacter, EXPRESSIONS } from '../lib/characters.js';
import { createStudioSet } from '../lib/studio.js';
import { CAST } from '../lib/cast.js';

const PICK = CAST.slice(6);            // the five new characters
const GEST = ['present', 'think', 'facepalm', 'hips', 'cheer'];
const SP = 2.1;

function Scene({ frame, fps, vertical }) {
  const { scene, camera, gl } = useThree();
  const world = useMemo(() => {
    const xs = PICK.map((_, i) => (i - (PICK.length - 1) / 2) * SP);
    const set = createStudioSet({ platforms: xs.map((x) => [x, 0]) });
    const chars = PICK.map((o, i) => { const c = createCharacter({ ...o, seed: 100 + i }); c.group.position.set(xs[i], 0.06, 0); set.group.add(c.group); return c; });
    return { set, chars };
  }, []);
  useLayoutEffect(() => { scene.add(world.set.group); scene.background = new THREE.Color('#2b2f45'); gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap; return () => scene.remove(world.set.group); }, [scene, gl, world]);
  const t = frame / fps;
  // camera: slow dolly-in with a gentle arc (vertical framing sits further back)
  const k = interpolate(frame, [0, 210], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const dist = vertical ? 24 - 4 * k : 14.5 - 3 * k;
  camera.position.set(Math.sin(k * 0.5 - 0.25) * 3, 3.4 - 0.6 * k, dist);
  camera.lookAt(0, vertical ? 1.1 : 1.05, 0);
  camera.updateProjectionMatrix();
  world.chars.forEach((c, i) => {
    // every character cycles through all six expressions and alternates two gestures
    const step = Math.floor((frame + i * 9) / 35);
    const ex = EXPRESSIONS[(step + i) % EXPRESSIONS.length];
    if (c.expression !== ex) c.setExpression(ex);
    c.setGesture(step % 2 ? GEST[i] : (i % 2 ? 'wave' : 'rest'));
    c.update(t);
    c.faceCamera(camera); c.faceLight(world.set.key);
  });
  return null;
}

export const CharacterShowcase = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#2b2f45' }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: vertical ? 34 : 24, position: [0, 4.6, 17], near: 0.1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NoToneMapping; }} shadows>
        <Scene frame={frame} fps={fps} vertical={vertical} />
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 48, top: 40, fontFamily: 'Inter, sans-serif', color: '#23263a' }}>
        <div style={{ fontSize: vertical ? 44 : 32, fontWeight: 800 }}>createCharacter() × Remotion</div>
        <div style={{ fontSize: vertical ? 24 : 18, opacity: 0.7, marginTop: 6 }}>idle breathing · blinking · six expressions · arm joints · light-facing shadows</div>
      </div>
    </AbsoluteFill>
  );
};
