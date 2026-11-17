// post.js — comic-book ink edges + golden-hour grade, then a separate depth-of-field pass.
//
//   const post = createPipeline(renderer, scene, camera, { width: 1920, height: 1080 });
//   post.render({ focus: 9, farBlur: 14, nearBlur: 6 });
//
// Pass 1  colour   : the scene, MSAA, HalfFloat (linear)
// Pass 2  normal+depth : view normals + linear depth. Character cards and leaf/grass cards write depth but are
//                    flagged so the world ink skips them (they carry their own drawn ink).
// Pass 3  ink+grade: depth-jump and crease edges -> near-black ink; ACES tone curve, saturation, warm highlights,
//                    cool indigo shadows, lifted blacks (never pure black), vignette.
// Pass 4  bloom    : soft glow from bright highlights (lamps, sun glints)
// Pass 5  DOF      : gather blur by depth AFTER ink, so far buildings soften while foreground ink stays crisp.
import * as THREE from 'three';

const NDV = 'varying float vD; varying vec2 vUv; varying vec3 vN;\nvoid main(){ vUv=uv; vec4 p=vec4(position,1.); vec3 nn=normal;\n#ifdef USE_INSTANCING\np=instanceMatrix*p; nn=mat3(instanceMatrix)*nn;\n#endif\nvec4 mv=modelViewMatrix*p; vD=-mv.z; vN=normalize(normalMatrix*nn); gl_Position=projectionMatrix*mv; }';
const QV = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';

export function createPipeline(renderer, scene, camera, { width: W, height: H } = {}) {
  const PX = W / 1920;
  const RT = (w, h, s = 0) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: s });
  const colorRT = RT(W, H, 4), ndRT = RT(W, H), gradeRT = RT(W, H), bA = RT(W >> 2, H >> 2), bB = RT(W >> 2, H >> 2);
  const ndWorld = new THREE.ShaderMaterial({ vertexShader: NDV, fragmentShader: 'varying float vD; varying vec3 vN; void main(){ vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; gl_FragColor=vec4(n*.5+.5, vD/1000.); }', side: THREE.DoubleSide });
  // silhouette-only surfaces (foliage clumps): a constant camera-facing normal, so only depth jumps get ink
  const ndSil = new THREE.ShaderMaterial({ vertexShader: NDV, fragmentShader: 'varying float vD; void main(){ gl_FragColor=vec4(0.5,0.5,1.0, vD/1000.); }', side: THREE.DoubleSide });
  const cardCache = new Map();
  const cardMat = (map) => {
    const k = map ? map.uuid : 'none'; if (cardCache.has(k)) return cardCache.get(k);
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: map } }, vertexShader: NDV, side: THREE.DoubleSide,
      fragmentShader: map ? 'uniform sampler2D map; varying float vD; varying vec2 vUv; void main(){ if(texture2D(map,vUv).a<.45) discard; gl_FragColor=vec4(0.,0.,0.,vD/1000.); }' : 'varying float vD; void main(){ gl_FragColor=vec4(0.,0.,0.,vD/1000.); }' });
    cardCache.set(k, m); return m;
  };
  const quad = new THREE.PlaneGeometry(2, 2), qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (frag, uniforms) => { const m = new THREE.ShaderMaterial({ uniforms, vertexShader: QV, fragmentShader: frag }); const s = new THREE.Scene(); s.add(new THREE.Mesh(quad, m)); return { m, s }; };

  const ink = pass(`
    uniform sampler2D tCol, tND; uniform vec2 res; uniform float inkR, exposure, sat, contrast, vign, inkK; uniform vec3 inkCol, shadowTint, warm, floorCol; varying vec2 vUv;
    vec4 nd(vec2 o){ return texture2D(tND, vUv + o/res); }
    bool card(vec4 s){ return dot(s.rgb,s.rgb) < 0.01; }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
    vec3 toS(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-0.055, step(0.0031308,c)); }
    void main(){
      vec3 col = texture2D(tCol, vUv).rgb;
      vec4 c = nd(vec2(0.)); float e = 0.;
      if(!card(c)){
        float d = c.a*1000.; vec3 n = c.rgb*2.-1.;
        vec2 dirs[4]; dirs[0]=vec2(1.,0.); dirs[1]=vec2(0.,1.); dirs[2]=vec2(.707,.707); dirs[3]=vec2(.707,-.707);
        for(int i=0;i<4;i++){
          vec4 a = nd(dirs[i]*inkR), b = nd(-dirs[i]*inkR);
          float da = card(a) ? d : a.a*1000., db = card(b) ? d : b.a*1000.;
          float lap = 2. - d/max(da,.01) - d/max(db,.01);
          if(lap > 0.035 && max((da-d)/d,(db-d)/d) > 0.03) e = 1.;
          if(!card(a)){ vec3 na=a.rgb*2.-1.; if(1.-dot(n,na) > 0.28) e = max(e,.85); }
          if(!card(b)){ vec3 nb=b.rgb*2.-1.; if(1.-dot(n,nb) > 0.28) e = max(e,.85); }
        }
        e *= 1. - smoothstep(60., 260., d);
      }
      vec3 s = toS(aces(col*exposure));
      float l = dot(s, vec3(.299,.587,.114));
      s = mix(vec3(l), s, sat);
      s = mix(s, smoothstep(0.,1.,s), contrast);
      s += shadowTint * pow(1.-l, 3.0);              // cool indigo shadows
      s *= mix(vec3(1.), warm, smoothstep(.45,1.,l)); // warm golden highlights
      s = max(s, floorCol);                           // lifted blacks: never pure black
      s = mix(s, inkCol, e*inkK);
      float v = distance(vUv, vec2(.5)); s *= 1. - vign*smoothstep(.35,.9,v);
      gl_FragColor = vec4(clamp(s,0.,1.), c.a);
    }`, { tCol: { value: colorRT.texture }, tND: { value: ndRT.texture }, res: { value: new THREE.Vector2(W, H) }, inkR: { value: 1.6 * PX }, exposure: { value: 1.0 }, sat: { value: 1.22 }, contrast: { value: 0.12 }, vign: { value: 0.28 }, inkK: { value: 0.92 },
    inkCol: { value: new THREE.Color('#120e1c') }, shadowTint: { value: new THREE.Vector3(-0.02, -0.005, 0.06) }, warm: { value: new THREE.Vector3(1.1, 1.0, 0.84) }, floorCol: { value: new THREE.Vector3(0.05, 0.045, 0.11) } });
  const bright = pass('uniform sampler2D tIn; varying vec2 vUv; void main(){ vec3 c=texture2D(tIn,vUv).rgb; float l=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c*smoothstep(.8,1.,l),1.); }', { tIn: { value: gradeRT.texture } });
  const blur = pass('uniform sampler2D tIn; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 a=texture2D(tIn,vUv).rgb*.227; float w[4]; w[0]=.195; w[1]=.122; w[2]=.054; w[3]=.016; for(int i=1;i<5;i++){ vec2 o=dir*float(i)*1.5; a+=(texture2D(tIn,vUv+o).rgb+texture2D(tIn,vUv-o).rgb)*w[i-1]; } gl_FragColor=vec4(a,1.); }', { tIn: { value: null }, dir: { value: new THREE.Vector2() } });
  const dof = pass(`
    uniform sampler2D tIn, tBloom; uniform vec2 res; uniform float focus, farB, nearB, bloomK; varying vec2 vUv;
    float coc(float a){ float d=a*1000.; return farB*smoothstep(focus*1.15, focus*4.5, d) + nearB*smoothstep(focus*0.55, focus*0.22, d); }
    void main(){
      vec4 c0 = texture2D(tIn, vUv); float r0 = coc(c0.a);
      vec3 bl = texture2D(tBloom, vUv).rgb*bloomK;
      if(r0 < .6){ gl_FragColor = vec4(c0.rgb + bl, 1.); return; }
      vec3 acc = c0.rgb; float ws = 1.;
      for(int i=1;i<56;i++){
        float fi=float(i); float rr=sqrt(fi/56.)*r0; float th=fi*2.39996; vec2 o=vec2(cos(th),sin(th))*rr;
        vec4 s = texture2D(tIn, vUv + o/res); float rs = coc(s.a);
        float lim = s.a > c0.a ? min(rs, r0) : rs;      // sharp foreground never smears into blurred background
        float w = smoothstep(rr-1., rr+.5, lim); acc += s.rgb*w; ws += w;
      }
      gl_FragColor = vec4(acc/ws + bl, 1.);
    }`, { tIn: { value: gradeRT.texture }, tBloom: { value: bA.texture }, res: { value: new THREE.Vector2(W, H) }, focus: { value: 9 }, farB: { value: 14 * PX }, nearB: { value: 6 * PX }, bloomK: { value: 0.35 } });

  const swapped = [];
  function toND() {
    swapped.length = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const u = o.userData;
      if (u.characterPart === 'shadow' || u.nd === 'hide') { o.visible = false; swapped.push([o, null]); return; }
      swapped.push([o, o.material]);
      o.material = (u.characterPart === 'visible' || u.nd === 'card') ? cardMat(o.material.map || null) : u.nd === 'silhouette' ? ndSil : ndWorld;
    });
  }
  function fromND() { for (const [o, m] of swapped) { if (m) o.material = m; else o.visible = true; } }

  function render({ focus = 9, farBlur = 14, nearBlur = 6, bloom = 0.35, ink: inkK = 0.92, exposure = 1.0, sat = 1.22 } = {}) {
    const bg = scene.background;
    renderer.setRenderTarget(colorRT); renderer.clear(); renderer.render(scene, camera);
    scene.background = null; const fog = scene.fog; scene.fog = null; toND();
    renderer.setRenderTarget(ndRT); renderer.setClearColor(new THREE.Color(0.5, 0.5, 1.0), 1); renderer.clear(); renderer.render(scene, camera);
    fromND(); scene.background = bg; scene.fog = fog; renderer.setClearColor('#000000', 1);
    ink.m.uniforms.inkK.value = inkK; ink.m.uniforms.exposure.value = exposure; ink.m.uniforms.sat.value = sat;
    renderer.setRenderTarget(gradeRT); renderer.render(ink.s, qcam);
    renderer.setRenderTarget(bA); renderer.render(bright.s, qcam);
    for (let i = 0; i < 2; i++) { blur.m.uniforms.tIn.value = bA.texture; blur.m.uniforms.dir.value.set(4 / W, 0); renderer.setRenderTarget(bB); renderer.render(blur.s, qcam); blur.m.uniforms.tIn.value = bB.texture; blur.m.uniforms.dir.value.set(0, 4 / H); renderer.setRenderTarget(bA); renderer.render(blur.s, qcam); }
    Object.assign(dof.m.uniforms.focus, { value: focus }); dof.m.uniforms.farB.value = farBlur * PX; dof.m.uniforms.nearB.value = nearBlur * PX; dof.m.uniforms.bloomK.value = bloom;
    renderer.setRenderTarget(null); renderer.render(dof.s, qcam);
  }
  return { render, targets: { colorRT, ndRT, gradeRT } };
}

// ---------------------------------------------------------------- golden-hour sky + environment
export function createSky(renderer, scene, { sunDir = new THREE.Vector3(-0.75, 0.32, 0.45), top = '#3d5bd6', mid = '#8fa6ff', horizon = '#ffc48a', sun = '#fff1c9' } = {}) {
  const u = { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, hor: { value: new THREE.Color(horizon) }, sunC: { value: new THREE.Color(sun) }, sunDir: { value: sunDir.clone().normalize() } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: u, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }',
    fragmentShader: `uniform vec3 top,mid,hor,sunC,sunDir; varying vec3 vP;
      void main(){ vec3 d=normalize(vP); float h=d.y;
        vec3 c = h<0. ? hor*0.9 : mix(mix(hor, mid, smoothstep(0.,0.12,h)), top, smoothstep(0.1,0.6,h));
        float s=max(dot(d,normalize(sunDir)),0.); c += sunC*(pow(s,1200.)*6. + pow(s,60.)*0.6 + pow(s,8.)*0.22);
        gl_FragColor=vec4(c,1.); }` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat); sky.userData.nd = 'hide'; sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);
  // environment map for glass and metals from the same sky
  const envScene = new THREE.Scene(); const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone()); envSky.material.uniforms = u; envScene.add(envSky);
  envScene.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2).translate(0, -1, 0), new THREE.MeshBasicMaterial({ color: '#5a5f86' })));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture;
  return { sky, uniforms: u };
}

// ---------------------------------------------------------------- approved lighting rigs
// 'golden' = the approved Stage 2 showcase look (warm amber key, warm rim, cool indigo shadows, amber->blue sky).
// 'night'  = deep night-blue for the "You see" pivot. Switch with rig.apply('night') on that exact frame.
export const LIGHTING_PRESETS = {
  golden: {
    key: { color: '#ffad52', intensity: 5.6, dir: [-0.88, 0.4, 0.26] }, rim: { color: '#ffc070', intensity: 3.0, pos: [40, 18, -45] },
    hemi: { sky: '#8fa4ff', ground: '#4a3f6a', intensity: 0.7 }, fog: { color: '#f0c88e', near: 90, far: 480 },
    sky: { sunDir: [-0.9, 0.1, -0.42], horizon: '#ffa338', mid: '#ffe0a0', top: '#2f86e8', sun: '#fff0c0' },
    post: { exposure: 0.86, sat: 1.28, bloom: 0.3, farBlur: 16, nearBlur: 5, ink: 0.92 },
  },
  night: {
    key: { color: '#86a2ff', intensity: 1.8, dir: [-0.6, 0.55, 0.3] }, rim: { color: '#5f7dff', intensity: 1.4, pos: [40, 18, -45] },
    hemi: { sky: '#2c3c94', ground: '#0f1238', intensity: 0.65 }, fog: { color: '#1c2558', near: 60, far: 380 },
    sky: { sunDir: [-0.5, 0.35, -0.6], horizon: '#3a4cae', mid: '#1d2c74', top: '#0a1140', sun: '#d6deff' },
    post: { exposure: 0.95, sat: 1.12, bloom: 0.5, farBlur: 16, nearBlur: 5, ink: 0.92 },
  },
};
export function createLightingRig(renderer, scene, { preset = 'golden', shadowTarget = [0, 0, -6], shadowExtent = [-32, 32, 26, -18] } = {}) {
  const P0 = LIGHTING_PRESETS[preset];
  const sky = createSky(renderer, scene, { sunDir: new THREE.Vector3(...P0.sky.sunDir), horizon: P0.sky.horizon, mid: P0.sky.mid, top: P0.sky.top, sun: P0.sky.sun });
  const key = new THREE.DirectionalLight(); key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
  Object.assign(key.shadow.camera, { left: shadowExtent[0], right: shadowExtent[1], top: shadowExtent[2], bottom: shadowExtent[3], near: 1, far: 160 }); key.shadow.camera.updateProjectionMatrix();
  key.target.position.set(...shadowTarget); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(); scene.add(rim);
  const hemi = new THREE.HemisphereLight(); scene.add(hemi);
  scene.fog = new THREE.Fog('#ffffff', 90, 480);
  const sunDir = new THREE.Vector3();
  const rig = { key, rim, hemi, sky, sunDir, preset, post: P0.post,
    apply(name) {
      const P = LIGHTING_PRESETS[name]; rig.preset = name; rig.post = P.post;
      sunDir.set(...P.key.dir).normalize(); key.color.set(P.key.color); key.intensity = P.key.intensity; key.position.copy(key.target.position).addScaledVector(sunDir, 60);
      rim.color.set(P.rim.color); rim.intensity = P.rim.intensity; rim.position.set(...P.rim.pos);
      hemi.color.set(P.hemi.sky); hemi.groundColor.set(P.hemi.ground); hemi.intensity = P.hemi.intensity;
      scene.fog.color.set(P.fog.color); scene.fog.near = P.fog.near; scene.fog.far = P.fog.far;
      const u = sky.uniforms; u.top.value.set(P.sky.top); u.mid.value.set(P.sky.mid); u.hor.value.set(P.sky.horizon); u.sunC.value.set(P.sky.sun); u.sunDir.value.set(...P.sky.sunDir).normalize();
      return rig;
    } };
  return rig.apply(preset);
}
