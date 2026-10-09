// render/weather.js (P1): ash, dust, rain, snow, embers and sandstorm in a box that follows the camera, plus lightning
// (architecture §4.1, art direction §5.5). Positions are computed on the GPU from a per-instance seed and a CPU-side
// wrapped offset, so the volume costs one draw call and no per-frame uploads. Motion advances only while the sim runs.
// set() blends the numeric fields (intensity, wind, lightning, fogBoost) and cross-fades a type change through zero.
// An unknown type renders as 'clear' (addendum A5.4).
import * as THREE from 'three';
import { FOG_PARS } from './glsl.js';

const TYPES = {
  //        size m       fall m/s  sway  streak  box xz/y   alpha  additive  colour            lit
  clear:     { size: [0.05, 0.1], fall: 0, sway: 0, streak: 0, box: [60, 30], alpha: 0, add: 0, color: '#ffffff' },
  ash:       { size: [0.12, 0.26], fall: 2.0, sway: 1.0, streak: 0, box: [70, 40], alpha: 0.55, add: 0, color: '#cfc3b8' },
  snow:      { size: [0.06, 0.15], fall: 1.4, sway: 0.6, streak: 0, box: [56, 34], alpha: 0.85, add: 0, color: '#f4f8ff' },
  rain:      { size: [0.018, 0.026], fall: 12, sway: 0, streak: 0.06, box: [40, 30], alpha: 0.5, add: 0, color: '#c8d4e0' },
  dust:      { size: [0.03, 0.08], fall: -0.05, sway: 0.4, streak: 0, box: [40, 24], alpha: 0.9, add: 1, color: '#fff0d8' },
  embers:    { size: [0.04, 0.07], fall: -1.8, sway: 0.8, streak: 0, box: [50, 30], alpha: 1, add: 1, color: '#ff8a3a' },
  sandstorm: { size: [0.02, 0.06], fall: 0.6, sway: 0.3, streak: 0.04, box: [50, 26], alpha: 0.6, add: 0, color: '#d8c7a8' },
};

const VS = /* glsl */`
${FOG_PARS}
attribute vec4 aSeed;
uniform vec3 uBox, uOffset, uCam, uVel;
uniform float uTime, uSway, uIntensity, uStreak, uSizeA, uSizeB, uMinPx, uAlpha;
uniform vec2 uPx;
uniform vec3 uColor, uSunC, uHemiC, uLightDir;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vUv = uv;
  if (aSeed.w > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); return; }
  vec3 p = aSeed.xyz * uBox + uOffset;
  p.x += sin(uTime * (0.7 + aSeed.w) + aSeed.w * 40.0) * uSway;
  p.z += cos(uTime * (0.6 + aSeed.x) + aSeed.y * 30.0) * uSway;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = uCam + rel;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float size = mix(uSizeA, uSizeB, fract(aSeed.w * 7.31));
  // minimum on-screen size: tiny flakes stay visible, faded to keep their energy
  float px = projectionMatrix[1][1] * size / max(-mv.z, 0.1);
  float minN = uMinPx * uPx.y;
  float fade = px < minN ? (px / minN) * (px / minN) : 1.0;
  float ndcSize = max(px, minN);
  vec4 clip = projectionMatrix * mv;
  vec2 c = position.xy;
  vec2 off;
  if (uStreak > 0.0) {
    vec2 sv = (viewMatrix * vec4(uVel, 0.0)).xy;
    float sl = length(sv);
    vec2 d = sl > 1e-4 ? sv / sl : vec2(0.0, 1.0);
    float len = ndcSize + projectionMatrix[1][1] * sl * uStreak / max(-mv.z, 0.1);
    off = d * c.y * len + vec2(-d.y, d.x) * c.x * ndcSize;
  } else off = c * ndcSize;
  clip.xy += off * vec2(projectionMatrix[0][0] / projectionMatrix[1][1], 1.0) * clip.w;
  // light: sky fill plus sun, brighter looking toward the sun (forward scatter)
  vec3 vd = normalize(wp - cameraPosition);
  float fwd = pow(max(dot(vd, uLightDir), 0.0), 6.0);
  vec3 light = uHemiC * 0.6 + uSunC * (0.35 + 1.2 * fwd);
  float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(rel.x) / uBox.x, max(abs(rel.y) / uBox.y, abs(rel.z) / uBox.z)));
  float near = smoothstep(0.4, 1.5, -mv.z);
  float f = cFogAmount(wp);
  vCol = vec4(uColor * light, uAlpha * fade * edge * near * (1.0 - f * 0.8));
  gl_Position = clip;
}`;
const FS = /* glsl */`
uniform float uAdd;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r) * vCol.a;
  if (a < 0.003) discard;
  if (uAdd > 0.5) gl_FragColor = vec4(vCol.rgb * a, 1.0);
  else gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function install(ctx) {
  const warned = new Set();
  const fogU = ctx.atmosphere?.fogUniforms || {};
  const U = {
    ...fogU,
    uBox: { value: new THREE.Vector3(60, 30, 60) }, uOffset: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSway: { value: 0 }, uIntensity: { value: 0 }, uStreak: { value: 0 },
    uSizeA: { value: 0.1 }, uSizeB: { value: 0.2 }, uMinPx: { value: 1.6 }, uAlpha: { value: 0 }, uPx: { value: new THREE.Vector2(1 / 640, 1 / 360) },
    uColor: { value: new THREE.Color() }, uSunC: { value: new THREE.Color() }, uHemiC: { value: new THREE.Color() },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uAdd: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
  mat.userData.shared = true;
  let geo = null, mesh = null, count = 0;
  const drawSize = new THREE.Vector2();

  function build(n) {
    n = Math.max(16, n | 0);
    if (n === count && mesh) return;
    count = n;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(n * 4);
    let s = 0x9e3779b9;
    const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
    for (let i = 0; i < n * 4; i++) seed[i] = rnd();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n;
    g.userData.shared = true;
    if (geo) geo.dispose();
    geo = g;
    if (!mesh) {
      mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'weather'; mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.userData.noAO = true;
      mesh.onBeforeRender = (r, sc, cam) => { U.uCam.value.copy(cam.position); };
      ctx.scene.add(mesh);
    } else mesh.geometry = geo;
  }
  build(ctx.tier.weatherParticles || 2000);

  // live state, blend and cross-fade
  const api = {
    current: { type: 'clear', intensity: 0, wind: [0, 0], lightning: 0, fogBoost: 1 },
    set(p = {}, blendSeconds = 0) {
      p = p || {};
      const to = { ...target };
      if (p.type != null) {
        if (TYPES[p.type]) to.type = p.type;
        else { if (!warned.has(p.type)) { warned.add(p.type); console.warn('[weather] unknown weather type', p.type); } to.type = 'clear'; }
      }
      for (const k of ['intensity', 'lightning', 'fogBoost']) if (p[k] != null && Number.isFinite(+p[k])) to[k] = +p[k];
      if (Array.isArray(p.wind)) to.wind = [+p.wind[0] || 0, +p.wind[1] || 0];
      const dur = Math.max(0, +blendSeconds || 0);
      target = to;
      if (dur <= 0) {
        Object.assign(api.current, { ...to, wind: to.wind.slice() });
        shownType = to.type; shownK = 1; blend = null;
      } else {
        blend = { from: { intensity: api.current.intensity, lightning: api.current.lightning, fogBoost: api.current.fogBoost, wind: api.current.wind.slice() },
                  t: 0, dur, typeChange: to.type !== shownType };
      }
    },
    update(dt) {
      const c = api.current;
      if (blend) {
        blend.t += dt;
        const k = Math.min(1, blend.t / blend.dur), e = k * k * (3 - 2 * k), f = blend.from;
        c.lightning = f.lightning + (target.lightning - f.lightning) * e;
        c.fogBoost = f.fogBoost + (target.fogBoost - f.fogBoost) * e;
        c.wind[0] = f.wind[0] + (target.wind[0] - f.wind[0]) * e; c.wind[1] = f.wind[1] + (target.wind[1] - f.wind[1]) * e;
        if (blend.typeChange) {
          if (k < 0.5) { shownK = 1 - k * 2; c.intensity = f.intensity; }
          else { shownType = target.type; c.type = target.type; shownK = (k - 0.5) * 2; c.intensity = target.intensity; }
        } else { c.intensity = f.intensity + (target.intensity - f.intensity) * e; c.type = target.type; shownType = target.type; shownK = 1; }
        if (k >= 1) { blend = null; Object.assign(c, { ...target, wind: target.wind.slice() }); shownType = target.type; shownK = 1; }
      }
      const T = TYPES[shownType] || TYPES.clear;
      const sim = ctx.simRunning;
      const wx = c.wind[0] || 0, wz = c.wind[1] || 0;
      const storm = shownType === 'sandstorm' ? 1.6 : 1;
      U.uVel.value.set(wx * storm, -T.fall, wz * storm);
      if (sim) {
        weatherTime += dt;
        const o = U.uOffset.value, b = U.uBox.value;
        o.x = (o.x + U.uVel.value.x * dt) % b.x; o.y = (o.y + U.uVel.value.y * dt) % b.y; o.z = (o.z + U.uVel.value.z * dt) % b.z;
        // lightning strikes: a few per minute at lightning = 1
        if (c.lightning > 0.001) {
          strikeT -= dt;
          if (strikeT <= 0) {
            strikeT = (3 + Math.random() * 9) / Math.max(0.05, c.lightning);
            const k = 0.6 + Math.random() * 0.6;
            ctx.atmosphere?.lightning?.(k);
            thunderT = 0.4 + Math.random() * 2.2; thunderK = k;
          }
        }
        if (thunderT > 0) { thunderT -= dt; if (thunderT <= 0) ctx.audio?.play?.('thunder', null, { vol: 0.5 + thunderK * 0.4 }); }
      }
      U.uTime.value = weatherTime;
      U.uBox.value.set(T.box[0], T.box[1], T.box[0]);
      U.uSway.value = T.sway; U.uStreak.value = T.streak;
      U.uSizeA.value = T.size[0] * (ctx.tier.name === 'low' ? 1.3 : 1); U.uSizeB.value = T.size[1] * (ctx.tier.name === 'low' ? 1.3 : 1);
      U.uAlpha.value = T.alpha * shownK;
      U.uIntensity.value = shownType === 'clear' ? 0 : Math.max(0, Math.min(1, c.intensity)) * shownK;
      U.uColor.value.set(T.color);
      U.uAdd.value = T.add;
      mat.blending = T.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      const atm = ctx.atmosphere;
      if (atm?.sun) {
        U.uSunC.value.copy(atm.sun.color).multiplyScalar(atm.sun.intensity / Math.PI);
        U.uHemiC.value.copy(atm.hemi.color).multiplyScalar(atm.hemi.intensity / Math.PI);
        if (atm.lightDir) U.uLightDir.value.copy(atm.lightDir);
      }
      ctx.renderer.getDrawingBufferSize(drawSize);
      U.uPx.value.set(2 / Math.max(1, drawSize.x), 2 / Math.max(1, drawSize.y));
      if (mesh) mesh.visible = U.uIntensity.value > 0.001 && U.uAlpha.value > 0.001;
    },
  };
  let target = { ...api.current, wind: [0, 0] };
  let blend = null, shownType = 'clear', shownK = 1, weatherTime = 0, strikeT = 4, thunderT = 0, thunderK = 1;

  ctx.events.on('tier:changed', ({ tier }) => build(tier.weatherParticles || 2000));
  ctx.addSystem({ name: 'weather', phase: 'fx', when: 'always', update: (dt) => api.update(dt) });
  ctx.weather = api;
  // atmosphere.apply() ran before this module existed: pick up the art's weather now
  const w = ctx.atmosphere?.art?.weather;
  if (w) api.set(w, 0);
  api.update(0);
  return api;
}
