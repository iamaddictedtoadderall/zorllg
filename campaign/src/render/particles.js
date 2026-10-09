// render/particles.js (P1): pooled particle systems (instanced camera-facing quads with an atlas sprite, lit billows,
// velocity streaks and fog), the point-light pool, instanced bevelled debris, terrain-conforming decals, and the
// addendum's glow sprites (A5.4: lamps, haul glints, ghost beacons).
//
// Nothing here allocates per frame or per spawn. Ring buffers recycle the oldest entry when full.
// Atlas cells (spawn's `sprite` argument, architecture §4.1 plus internal extras):
//   additive system (sparkSprite): 0 soft dot · 1 streak (stretched along velocity) · 2 flare · 3 fireball (cools over
//                                  its life) · 4 ring · 5 shard glint · 6 ember · 7 tight hot dot
//   alpha system    (smokeSprite): 0 soft dot · 1 billow A (lit) · 2 billow B (lit) · 3 wisp (lit) · 4 ring ·
//                                  5 dust clump (lit) · 6 chip · 7 flake
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { FOG_PARS, NOISE_PARS } from './glsl.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const LIT_CELLS_ALPHA = [0, 1, 1, 1, 0, 1, 0, 0];   // which alpha cells use the lit-billow shading

// ------------------------------------------------------------------------------------------------ shared uniforms
// Light colours for particle shading, refreshed each rendered frame from ctx.atmosphere (sun, hemi) by prepare().
const LIGHT = {
  uSunCol: { value: new THREE.Color(1, 1, 1) }, uHemiSky: { value: new THREE.Color(0.3, 0.3, 0.3) },
  uHemiGround: { value: new THREE.Color(0.1, 0.1, 0.1) }, uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  uTime: { value: 0 }, uPx: { value: new THREE.Vector2(1 / 640, 1 / 360) }, uSizeMul: { value: 1 },
};

function fogUniforms(ctx) {
  const f = ctx.atmosphere?.fogUniforms;
  if (f) return f;
  // atmosphere missing: neutral fog that never applies
  return { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 }, uFogHeightFalloff: { value: 0 },
           uFogHeightBase: { value: 0 }, uFogSunColor: { value: new THREE.Color() }, uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
           uFogInscatter: { value: 0 }, uFogFarStart: { value: 1e9 }, uFogFarEnd: { value: 2e9 } };
}

function quadGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// ------------------------------------------------------------------------------------------------ particle shader
const PARTICLE_VS = /* glsl */`
${FOG_PARS}
attribute vec3 iPos;
attribute vec4 iCol;     // rgb (linear, may exceed 1), alpha
attribute vec4 iMisc;    // size (m), atlas cell, rotation (rad), life fraction 0..1
attribute vec3 iVel;
uniform vec3 uLightDir;
uniform float uAdditive;
varying vec4 vCol;
varying vec2 vUv;
varying vec2 vSun;
varying float vFog;
varying vec3 vFogCol;
varying float vCell;
varying float vLife;
void main() {
  float size = iMisc.x;
  vCol = iCol; vCell = iMisc.y; vLife = iMisc.w;
  if (size <= 0.0 || iCol.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vSun = vec2(0.0); vFog = 0.0; vFogCol = vec3(0.0); return; }
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  vec2 off;
  float cs = cos(iMisc.z), sn = sin(iMisc.z);
  if (uAdditive > 0.5 && abs(iMisc.y - 1.0) < 0.5) {
    // streak: stretched along the screen-space velocity, length grows with speed
    vec2 vv = (viewMatrix * vec4(iVel, 0.0)).xy;
    float sp = length(vv);
    vec2 d = sp > 1e-4 ? vv / sp : vec2(0.0, 1.0);
    float len = size + sp * 0.045;
    off = d * c.y * len + vec2(d.y, -d.x) * c.x * size * 0.32;
  } else {
    off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  // never fill the screen: fade particles that reach the near plane
  float near = smoothstep(0.6, 2.5, -mv.z);
  vCol.a *= near;
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float cell = floor(iMisc.y + 0.5);
  vUv = vec2(mod(cell, 4.0) * 0.25, floor(cell / 4.0) * 0.5) + uv * vec2(0.25, 0.5);
  // sun direction in the sprite's own frame (lit billows)
  vec2 sv = (viewMatrix * vec4(uLightDir, 0.0)).xy;
  vSun = vec2(sv.x * cs + sv.y * sn, -sv.x * sn + sv.y * cs);
  float l = length(vSun); vSun = l > 1e-4 ? vSun / max(l, 0.35) : vec2(0.0, 1.0);
  vFog = cFogAmount(iPos);
  vFogCol = cFogColor(normalize(iPos - cameraPosition));
}`;

const PARTICLE_FS_ADD = /* glsl */`
uniform sampler2D uAtlas;
varying vec4 vCol; varying vec2 vUv; varying vec2 vSun; varying float vFog; varying vec3 vFogCol; varying float vCell; varying float vLife;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  vec3 col = vCol.rgb;
  if (abs(vCell - 3.0) < 0.5) {   // fireball: hot core cools to deep red over its life
    col *= mix(vec3(1.0), vec3(0.42, 0.16, 0.06), smoothstep(0.15, 0.9, vLife));
    col *= mix(1.0, 0.6 + 0.8 * t.g, 0.6);
  }
  float a = t.r * vCol.a * (1.0 - vFog);
  gl_FragColor = vec4(col * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PARTICLE_FS_ALPHA = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uSunCol, uHemiSky, uHemiGround;
uniform float uLitCells[8];
varying vec4 vCol; varying vec2 vUv; varying vec2 vSun; varying float vFog; varying vec3 vFogCol; varying float vCell; varying float vLife;
void main() {
  vec4 t = texture2D(uAtlas, vUv);       // rg: sprite normal (0..1), b: detail, a: density
  float dens = t.a;
  if (dens * vCol.a < 0.004) discard;
  int ci = int(vCell + 0.5);
  float litOn = 0.0;
  for (int i = 0; i < 8; i++) if (i == ci) litOn = uLitCells[i];
  vec2 n = t.rg * 2.0 - 1.0;
  float lit = 0.4 + 0.6 * clamp(dot(n, vSun) * 0.9 + 0.3, 0.0, 1.0);
  vec3 amb = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * n.y * 0.6 + 0.2);
  vec3 lightC = amb + uSunCol * mix(0.75, lit, litOn);
  vec3 c = vCol.rgb * lightC * (0.8 + 0.4 * t.b);
  c = mix(c, vFogCol, vFog);
  gl_FragColor = vec4(c, dens * vCol.a * (1.0 - vFog * 0.35));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ ParticleSystem
export class ParticleSystem {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.blending = o.blending === 'alpha' ? 'alpha' : 'additive';
    this.max = 0;
    this.cursor = 0;
    this.high = 0;          // high-water mark of used slots
    this._alive = 0;
    this.points = null;     // kept for the stub's field name: the THREE.Mesh that draws this system
    this.mesh = null;
    this._alloc(Math.max(16, o.max | 0 || 1000));
    const add = this.blending === 'additive';
    const atlasName = add ? 'sparkSprite' : 'smokeSprite';
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...fogUniforms(ctx),
        uAtlas: { value: ctx.materials?.textures?.[atlasName] ?? null },
        uLightDir: LIGHT.uLightDir, uSunCol: LIGHT.uSunCol, uHemiSky: LIGHT.uHemiSky, uHemiGround: LIGHT.uHemiGround,
        uAdditive: { value: add ? 1 : 0 },
        uLitCells: { value: LIT_CELLS_ALPHA.slice() },
      },
      vertexShader: PARTICLE_VS,
      fragmentShader: add ? PARTICLE_FS_ADD : PARTICLE_FS_ALPHA,
      transparent: true, depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.material.userData.shared = true;
    this._atlasName = atlasName;
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = add ? 5 : 4;
    this.mesh.name = add ? 'particles-add' : 'particles-smoke';
    this.mesh.userData.noAO = true;
    this.points = this.mesh;
    ctx.scene?.add(this.mesh);
  }
  _alloc(max) {
    this.max = max;
    this.cursor = 0; this.high = 0; this._alive = 0;
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.rotV = new Float32Array(max);
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.misc = new Float32Array(max * 4);
    if (this.geo) this.geo.dispose();   // capacity changed: drop the old GPU buffers first (three re-uploads on next use)
    const g = this.geo || quadGeometry();
    for (const n of ['iPos', 'iCol', 'iMisc', 'iVel']) if (g.getAttribute(n)) g.deleteAttribute(n);
    const mk = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(this.pos, 3); this.aCol = mk(this.col, 4); this.aMisc = mk(this.misc, 4); this.aVel = mk(this.vel, 3);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    g.userData.shared = true;
    this.geo = g;
    if (this.mesh) this.mesh.geometry = g;
  }
  /** extra: reallocate for a new capacity (tier change). Live particles are dropped. */
  resize(max) { max = Math.max(16, max | 0); if (max !== this.max) this._alloc(max); }
  /** Same argument order as the prototype's Particles.spawn, plus `sprite` (atlas cell). */
  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha = 1, drag = 0, gravity = 0, sprite = 0) {
    if (!(life > 0)) return;
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    if (i >= this.high) this.high = i + 1;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = alpha;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = size0; this.s1[i] = size1; this.a0[i] = alpha; this.drag[i] = drag; this.grav[i] = gravity;
    this.misc[i4] = size0; this.misc[i4 + 1] = sprite | 0; this.misc[i4 + 2] = Math.random() * TAU; this.misc[i4 + 3] = 0;
    this.rotV[i] = (Math.random() - 0.5) * (sprite === 1 || sprite === 2 || sprite === 3 ? 0.8 : 0.2);
  }
  update(dt) {
    const P = this.pos, V = this.vel, L = this.life, C = this.col, M = this.misc;
    let alive = 0;
    const n = this.high;
    for (let i = 0; i < n; i++) {
      if (L[i] <= 0) { if (M[i * 4] !== 0) { M[i * 4] = 0; C[i * 4 + 3] = 0; } continue; }
      L[i] -= dt;
      if (L[i] <= 0) { M[i * 4] = 0; C[i * 4 + 3] = 0; continue; }
      alive++;
      const t = 1 - L[i] / this.maxLife[i];
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      M[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      M[i * 4 + 2] += this.rotV[i] * dt;
      M[i * 4 + 3] = t;
      C[i * 4 + 3] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this._alive = alive;
    if (alive === 0 && this.high > 0 && this.cursor === 0) this.high = 0;
    this.geo.instanceCount = this.high;
    for (const a of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.high * a.itemSize);
      a.needsUpdate = true;
    }
  }
  clear() {
    this.life.fill(0); this.misc.fill(0); this.col.fill(0);
    this.cursor = 0; this.high = 0; this._alive = 0;
    this.geo.instanceCount = 0;
  }
  get alive() { return this._alive; }
  /** extra: fill ratio 0..1 (effects scale spawns down above 0.8) */
  load() { return this._alive / this.max; }
  /** extra: refresh the atlas texture (materials regenerates textures on a tier change) */
  _refresh() { const t = this.ctx.materials?.textures?.[this._atlasName]; if (t) this.material.uniforms.uAtlas.value = t; }
}

// ------------------------------------------------------------------------------------------------ glows (A5.4)
const GLOW_VS = /* glsl */`
${FOG_PARS}
${NOISE_PARS}
attribute vec3 iPos;
attribute vec3 iCol;
attribute vec4 iPar;     // size (m), minPx, pulse (0 none, 1 beat, 2 sparkle, 3 flicker), phase
uniform float uBeat, uTime, uSizeMul;
uniform vec2 uPx;
varying vec3 vCol;
varying vec2 vUv;
void main() {
  vUv = uv;
  if (iPar.x <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
  vec4 c = viewMatrix * vec4(iPos, 1.0);
  float dist = length(c.xyz);
  c.xyz += normalize(-c.xyz) * min(0.3, dist * 0.5);            // never hidden by its own housing
  vec4 clip = projectionMatrix * c;
  float size = iPar.x * uSizeMul;
  vec2 ndc = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * size / max(-c.z, 0.1);
  ndc = max(ndc, iPar.y * uSizeMul * uPx);
  clip.xy += position.xy * ndc * clip.w;
  float p = 1.0;
  float ph = iPar.w;
  if (iPar.z > 0.5 && iPar.z < 1.5) p = 0.15 + 0.85 * exp(-fract(uBeat + ph) * 7.0);          // ghost beat, 60/min
  else if (iPar.z > 1.5 && iPar.z < 2.5) {                                                       // haul glint, 0.7 Hz
    float s = 0.5 + 0.5 * sin(6.2832 * (0.7 * uTime + ph));
    p = 0.3 + 0.7 * s * s * s + 0.25 * cNoise(vec2(uTime * 9.0, ph * 17.0));
  } else if (iPar.z > 2.5) {                                                                     // lamp flicker
    float n = cNoise(vec2(uTime * 13.0 + ph * 31.0, ph * 7.0));
    float cut = cNoise(vec2(uTime * 1.7 + ph * 11.0, 3.0 + ph));
    p = (0.88 + 0.12 * n) * (cut < 0.07 ? 0.3 : 1.0);
  }
  vCol = iCol * p * (1.0 - 0.5 * cFogAmount(iPos));
  gl_Position = clip;
}`;
const GLOW_FS = /* glsl */`
varying vec3 vCol; varying vec2 vUv;
void main() {
  float a = smoothstep(0.5, 0.0, length(vUv - 0.5));
  gl_FragColor = vec4(vCol * (a * a * a * 4.0 + a * a * 0.6), 1.0);   // hot core, soft halo
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PULSE = { none: 0, beat: 1, sparkle: 2, flicker: 3 };

class Glows {
  constructor(ctx, cap = 512) {
    this.ctx = ctx;
    this.cap = cap;
    this.live = [];
    this.geo = quadGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.par = new Float32Array(cap * 4);
    const mk = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(this.pos, 3); this.aCol = mk(this.col, 3); this.aPar = mk(this.par, 4);
    this.geo.setAttribute('iPos', this.aPos); this.geo.setAttribute('iCol', this.aCol); this.geo.setAttribute('iPar', this.aPar);
    this.geo.instanceCount = 0;
    this.geo.userData.shared = true;
    const beat = ctx.materials?.uniforms?.uBeat ?? { value: 0 };
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...fogUniforms(ctx), uBeat: beat, uTime: LIGHT.uTime, uPx: LIGHT.uPx, uSizeMul: LIGHT.uSizeMul },
      vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.material.userData.shared = true;
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'glows';
    this.mesh.userData.noAO = true;
    ctx.scene?.add(this.mesh);
    this._warned = false;
  }
  add(at, o = {}) {
    const rec = { at: null, obj: null, pos: new THREE.Vector3(), offset: new THREE.Vector3(), color: new THREE.Color(1, 1, 1),
                  size: 1, intensity: 2, minPx: 0, pulse: 0, phase: 0, visible: true, alive: true, handle: null };
    if (at && at.isObject3D) rec.obj = at; else if (at && at.isVector3) rec.at = at; else rec.at = new THREE.Vector3();
    applyGlowOpts(rec, o);
    const self = this;
    rec.handle = {
      set(p = {}) { if (!rec.alive) return; applyGlowOpts(rec, p); if ('visible' in p) rec.visible = !!p.visible; },
      remove() { if (!rec.alive) return; rec.alive = false; const i = self.live.indexOf(rec); if (i >= 0) self.live.splice(i, 1); },
      get alive() { return rec.alive; },
    };
    if (this.live.length >= this.cap) {
      if (!this._warned) { this._warned = true; console.warn('[particles] glows capacity reached', this.cap); }
      rec.alive = false;
      return rec.handle;
    }
    this.live.push(rec);
    return rec.handle;
  }
  clear() { for (const r of this.live) r.alive = false; this.live.length = 0; this.geo.instanceCount = 0; }
  get count() { return this.live.length; }
  /** Called by the pipeline right before a scene renders: world positions, visibility, and the mesh's parent scene. */
  prepare(scene) {
    if (this.mesh.parent !== scene && scene) scene.add(this.mesh);
    const live = this.live, n = live.length;
    for (let i = 0; i < n; i++) {
      const r = live[i];
      let vis = r.visible, root = scene;
      if (r.obj) {
        let o = r.obj;
        while (o) { if (!o.visible) vis = false; if (!o.parent) break; o = o.parent; }
        root = o;
        if (vis && root === scene) { r.obj.updateWorldMatrix(true, false); r.pos.copy(r.offset).applyMatrix4(r.obj.matrixWorld); }
      } else {
        r.pos.copy(r.at).add(r.offset);
        root = this.ctx.scene;
      }
      if (root !== scene) vis = false;
      const i3 = i * 3, i4 = i * 4;
      this.pos[i3] = r.pos.x; this.pos[i3 + 1] = r.pos.y; this.pos[i3 + 2] = r.pos.z;
      this.col[i3] = r.color.r * r.intensity; this.col[i3 + 1] = r.color.g * r.intensity; this.col[i3 + 2] = r.color.b * r.intensity;
      this.par[i4] = vis ? r.size : 0; this.par[i4 + 1] = r.minPx; this.par[i4 + 2] = r.pulse; this.par[i4 + 3] = r.phase;
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aCol, this.aPar]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}
function applyGlowOpts(r, o) {
  if (o.color != null) r.color.set(o.color);
  if (o.size != null) r.size = Math.max(0, +o.size || 0);
  if (o.intensity != null) r.intensity = +o.intensity;
  if (o.minPx != null) r.minPx = Math.max(0, +o.minPx || 0);
  if (o.pulse != null) r.pulse = PULSE[o.pulse] ?? 0;
  if (o.phase != null) r.phase = +o.phase || 0;
  if (o.offset != null) r.offset.set(o.offset[0] || 0, o.offset[1] || 0, o.offset[2] || 0);
}

// ------------------------------------------------------------------------------------------------ light pool
class LightPool {
  constructor(ctx) { this.ctx = ctx; this.lights = []; this.sprites = null; this.build(ctx.tier.pointLights | 0); }
  build(n) {
    for (const l of this.lights) l.parent?.remove(l);
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 40, 2);
      l.name = 'flash' + i;
      l.userData = { t: 0, dur: 1, peak: 0 };
      this.ctx.scene.add(l);
      this.lights.push(l);
    }
  }
  get count() { return this.lights.length; }
  flash(pos, color, intensity, distance, duration) {
    if (!pos) return;
    duration = Math.max(0.01, +duration || 0.1);
    if (!this.lights.length) {
      // Low tier: an additive sprite burst carries the flash (architecture §7.3)
      const add = this.ctx.particles?.add;
      if (!add) return;
      _c.set(color ?? 0xffa860);
      const k = Math.min(3, 0.4 + Math.log10(Math.max(10, intensity)) * 0.45);
      const size = Math.min(40, Math.max(1.5, (distance || 10) * 0.22));
      add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, duration * 1.4, size, size * 1.25, _c.r * k, _c.g * k, _c.b * k, 0.9, 0, 0, 0);
      return;
    }
    let best = this.lights[0];
    for (const l of this.lights) if (l.intensity < best.intensity) best = l;
    if (best.intensity > intensity) return;
    best.position.copy(pos);
    best.color.set(color ?? 0xffa860);
    best.distance = distance || 40;
    best.intensity = intensity;
    const u = best.userData; u.peak = intensity; u.t = duration; u.dur = duration;
  }
  update(dt) {
    for (const l of this.lights) {
      const u = l.userData;
      if (u.t <= 0) { l.intensity = 0; continue; }
      u.t -= dt;
      const k = Math.max(0, u.t / u.dur);
      l.intensity = u.peak * k * k;
    }
  }
  clear() { for (const l of this.lights) { l.intensity = 0; l.userData.t = 0; } }
}

// ------------------------------------------------------------------------------------------------ debris
function chunkGeometry(seed) {
  // a chamfered, slightly irregular block: corners cut by planes, flat-shaded (AD §2.11: bevelled chunks, not cubes)
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts = [];
  const hx = 0.5, hy = 0.32 + r() * 0.12, hz = 0.42 + r() * 0.1, c = 0.16;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const j = () => (r() - 0.5) * 0.08;
    pts.push(new THREE.Vector3(sx * (hx - c) + j(), sy * hy + j(), sz * hz + j()));
    pts.push(new THREE.Vector3(sx * hx + j(), sy * (hy - c) + j(), sz * hz * 0.85 + j()));
    pts.push(new THREE.Vector3(sx * hx * 0.9 + j(), sy * hy * 0.8 + j(), sz * (hz - c) + j()));
  }
  let g = new ConvexGeometry(pts);
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute('edge', new THREE.BufferAttribute(new Float32Array(n).fill(0.5), 1));
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

class Debris {
  constructor(ctx) {
    this.ctx = ctx;
    this.geo = chunkGeometry(1337);
    this.meshes = new Map();   // material → InstancedMesh
    this.recs = [];
    this.cursor = 0;
    this.resize(ctx.tier.debrisMax | 0);
  }
  resize(n) {
    n = Math.max(8, n | 0);
    this.cap = n;
    this.recs = [];
    for (let i = 0; i < n; i++) this.recs.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), w: new THREE.Vector3(),
      rot: new THREE.Euler(), scl: new THREE.Vector3(1, 1, 1), smoke: false, burn: false, mesh: null, max: 1 });
    this.cursor = 0;
    for (const m of this.meshes.values()) { m.parent?.remove(m); m.dispose(); }
    this.meshes.clear();
  }
  _mesh(mat) {
    let m = this.meshes.get(mat);
    if (!m) {
      m = new THREE.InstancedMesh(this.geo, mat, this.cap);
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
      m.name = 'debris'; m.userData.noAO = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.ctx.scene.add(m);
      this.meshes.set(mat, m);
    }
    return m;
  }
  spawn(pos, n, scale = 1, material, velScale = 1) {
    if (!pos || !(n > 0)) return;
    const mat = material || this.ctx.materials?.get?.('debris');
    if (!mat) return;
    const mesh = this._mesh(mat);
    n = Math.min(n | 0, this.cap);
    for (let i = 0; i < n; i++) {
      const d = this.recs[this.cursor]; this.cursor = (this.cursor + 1) % this.cap;
      const s = (0.5 + Math.random() * 1.1) * scale;
      d.pos.copy(pos);
      d.pos.x += (Math.random() - 0.5) * scale; d.pos.z += (Math.random() - 0.5) * scale; d.pos.y += Math.random() * scale * 0.5;
      d.vel.set((Math.random() * 2 - 1) * 18, 8 + Math.random() * 18, (Math.random() * 2 - 1) * 18).multiplyScalar(velScale);
      d.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      d.rot.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      d.scl.set(s, s * (0.5 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.7));
      d.life = d.max = 4 + Math.random() * 3;
      d.smoke = Math.random() < 0.4; d.burn = !d.smoke && Math.random() < 0.33;
      d.mesh = mesh;
    }
  }
  update(dt) {
    const smoke = this.ctx.particles?.smoke, add = this.ctx.particles?.add;
    const world = this.ctx.world;
    for (const m of this.meshes.values()) m.count = 0;
    for (const d of this.recs) {
      if (d.life <= 0 || !d.mesh) continue;
      d.life -= dt;
      if (d.life <= 0) continue;
      d.vel.y -= 40 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.w.x * dt; d.rot.y += d.w.y * dt; d.rot.z += d.w.z * dt;
      const g = world?.groundHeight ? world.groundHeight(d.pos.x, d.pos.z) : 0;
      const rest = g + d.scl.y * 0.3;
      if (d.pos.y < rest) {
        d.pos.y = rest;
        if (d.vel.y < 0) d.vel.y *= -0.3;
        d.vel.x *= 0.6; d.vel.z *= 0.6; d.w.multiplyScalar(0.6);
      }
      if (d.smoke && smoke && Math.random() < dt * 12 && d.life > 1.2) smoke.spawn(d.pos.x, d.pos.y, d.pos.z, 0, 3, 0, 1.4, 0.8 * d.scl.x, 2.6 * d.scl.x, 0.14, 0.12, 0.11, 0.55, 0.5, -1, 1);
      if (d.burn && add && Math.random() < dt * 20 && d.life > 1.5) add.spawn(d.pos.x, d.pos.y, d.pos.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.6, 0.35, 0.1, 3, 1.1, 0.3, 1, 1, -2, 6);
      const k = d.life < 1 ? Math.max(0.01, d.life) : 1;
      _q.setFromEuler(d.rot);
      _s.copy(d.scl).multiplyScalar(k);
      _m.compose(d.pos, _q, _s);
      const mesh = d.mesh;
      if (mesh.count < this.cap) mesh.setMatrixAt(mesh.count++, _m);
    }
    for (const m of this.meshes.values()) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
  }
  clear() { for (const d of this.recs) d.life = 0; for (const m of this.meshes.values()) { m.count = 0; m.visible = false; } }
}

// ------------------------------------------------------------------------------------------------ decals
const DECAL_GRID = 5;   // vertices per side: decals conform to the ground
const DECAL_CELL = { scorch: 0, crater: 1, hole: 2, frost: 3 };
class Decals {
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.resize(ctx.tier.maxDecals | 0);
    this._warned = new Set();
  }
  resize(n) {
    n = Math.max(4, n | 0);
    this.cap = n; this.cursor = 0; this.used = 0;
    const V = DECAL_GRID * DECAL_GRID, Q = (DECAL_GRID - 1) * (DECAL_GRID - 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * V * 3); this.nrm = new Float32Array(n * V * 3); this.uv = new Float32Array(n * V * 2);
    this.col = new Float32Array(n * V * 4);
    const idx = new Uint32Array(n * Q * 6);
    let p = 0;
    for (let d = 0; d < n; d++) for (let j = 0; j < DECAL_GRID - 1; j++) for (let i = 0; i < DECAL_GRID - 1; i++) {
      const a = d * V + j * DECAL_GRID + i, b = a + 1, c = a + DECAL_GRID, e = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = e;
    }
    const mk = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', mk(this.pos, 3)); g.setAttribute('normal', mk(this.nrm, 3));
    g.setAttribute('uv', mk(this.uv, 2)); g.setAttribute('color', mk(this.col, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = g; }
    this.geo = g;
  }
  _material() {
    if (this._mat) return this._mat;
    const tex = this.ctx.materials?.textures?._decals ?? null;
    const m = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.95, metalness: 0, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, vertexColors: true, envMapIntensity: 0.2 });
    m.name = 'decals';
    this._mat = this.ctx.atmosphere?.patchMaterial ? this.ctx.atmosphere.patchMaterial(m) : m;
    this._mat.userData.shared = true;
    return this._mat;
  }
  _ensureMesh() {
    if (this.mesh) return;
    this.mesh = new THREE.Mesh(this.geo, this._material());
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.renderOrder = 2;
    this.mesh.name = 'decals'; this.mesh.userData.noAO = true;
    this.ctx.scene.add(this.mesh);
  }
  spawn(pos, normal, size, kind = 'scorch') {
    if (!pos || !(size > 0)) return;
    let cell = DECAL_CELL[kind];
    if (cell === undefined) {
      if (!this._warned.has(kind)) { this._warned.add(kind); console.warn('[particles] unknown decal kind', kind); }
      cell = 0;
    }
    this._ensureMesh();
    const tex = this.ctx.materials?.textures?._decals;
    if (tex && this._mat.map !== tex) { this._mat.map = tex; this._mat.needsUpdate = true; }
    const d = this.cursor; this.cursor = (this.cursor + 1) % this.cap;
    this.used = Math.max(this.used, d + 1);
    const n = _v2.copy(normal && normal.lengthSq() > 1e-6 ? normal : _v.set(0, 1, 0)).normalize();
    const world = this.ctx.world;
    const ground = world?.groundHeight && n.y > 0.6 && Math.abs(pos.y - world.groundHeight(pos.x, pos.z)) < 4;
    // tangent frame with a random rotation about the normal
    const rot = Math.random() * TAU;
    const t = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) t.set(0, 0, 1);
    t.sub(_v.copy(n).multiplyScalar(t.dot(n))).normalize().applyAxisAngle(n, rot);
    const b = _v.copy(n).cross(t);
    const V = DECAL_GRID * DECAL_GRID;
    const u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
    const shade = kind === 'crater' ? 1 : 0.9 + Math.random() * 0.1;
    for (let j = 0; j < DECAL_GRID; j++) for (let i = 0; i < DECAL_GRID; i++) {
      const k = d * V + j * DECAL_GRID + i;
      const fx = i / (DECAL_GRID - 1) - 0.5, fz = j / (DECAL_GRID - 1) - 0.5;
      let x = pos.x + (t.x * fx + b.x * fz) * size * 2, y = pos.y + (t.y * fx + b.y * fz) * size * 2, z = pos.z + (t.z * fx + b.z * fz) * size * 2;
      let nx = n.x, ny = n.y, nz = n.z;
      if (ground) {
        y = world.groundHeight(x, z) + 0.06;
        if (world.normalAt) { world.normalAt(x, z, _s); nx = _s.x; ny = _s.y; nz = _s.z; }
      } else { x += n.x * 0.05; y += n.y * 0.05; z += n.z * 0.05; }
      this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
      this.nrm[k * 3] = nx; this.nrm[k * 3 + 1] = ny; this.nrm[k * 3 + 2] = nz;
      this.uv[k * 2] = u0 + (fx + 0.5) * 0.5; this.uv[k * 2 + 1] = v0 + (fz + 0.5) * 0.5;
      this.col[k * 4] = shade; this.col[k * 4 + 1] = shade; this.col[k * 4 + 2] = shade; this.col[k * 4 + 3] = 1;
    }
    const g = this.geo;
    for (const a of ['position', 'normal', 'uv', 'color']) {
      const at = g.getAttribute(a);
      at.clearUpdateRanges(); at.addUpdateRange(d * V * at.itemSize, V * at.itemSize); at.needsUpdate = true;
    }
    g.setDrawRange(0, this.used * (DECAL_GRID - 1) * (DECAL_GRID - 1) * 6);
  }
  clear() { this.cursor = 0; this.used = 0; this.col.fill(0); this.geo.setDrawRange(0, 0); }
  get count() { return this.used; }
}

// ------------------------------------------------------------------------------------------------ install
export function install(ctx) {
  const add = new ParticleSystem(ctx, { max: ctx.tier.particlesAdd, blending: 'additive' });
  const smoke = new ParticleSystem(ctx, { max: ctx.tier.particlesAlpha, blending: 'alpha' });
  const lights = new LightPool(ctx);
  const debris = new Debris(ctx);
  const decals = new Decals(ctx);
  const glows = new Glows(ctx, 512);
  const size = new THREE.Vector2();

  const api = {
    add, smoke,
    lights: { flash: (pos, color, intensity, distance, duration) => lights.flash(pos, color, intensity, distance, duration),
              get count() { return lights.count; } },
    debris: { spawn: (pos, n, scale = 1, material, velScale = 1) => debris.spawn(pos, n, scale, material, velScale),
              clear: () => debris.clear() },
    decals: { spawn: (pos, normal, sz, kind) => decals.spawn(pos, normal, sz, kind), clear: () => decals.clear(),
              get count() { return decals.count; } },
    glows: { add: (at, o) => glows.add(at, o), clear: () => glows.clear(), get count() { return glows.count; } },
    clear() { add.clear(); smoke.clear(); debris.clear(); decals.clear(); lights.clear(); },
    update(dt) { add.update(dt); smoke.update(dt); debris.update(dt); lights.update(dt); },
    /** extra (pipeline): refresh shading uniforms and glow positions for the scene about to render. */
    prepare(scene, camera) {
      const atm = ctx.atmosphere;
      if (atm?.sun) {
        LIGHT.uSunCol.value.copy(atm.sun.color).multiplyScalar(atm.sun.intensity / Math.PI);
        LIGHT.uHemiSky.value.copy(atm.hemi.color).multiplyScalar(atm.hemi.intensity / Math.PI);
        LIGHT.uHemiGround.value.copy(atm.hemi.groundColor).multiplyScalar(atm.hemi.intensity / Math.PI);
        LIGHT.uLightDir.value.subVectors(atm.sun.position, atm.sun.target.position).normalize();
      }
      LIGHT.uTime.value = ctx.clock.realTime;
      ctx.renderer.getDrawingBufferSize(size);
      LIGHT.uPx.value.set(2 / Math.max(1, size.x), 2 / Math.max(1, size.y));
      LIGHT.uSizeMul.value = ctx.tier.name === 'low' ? 1.3 : 1;
      glows.prepare(scene || ctx.scene);
    },
    /** extra: live counts for tests and budgets */
    stats() { return { add: add.alive, smoke: smoke.alive, glows: glows.count, decals: decals.count, lights: lights.count }; },
  };
  ctx.events.on('level:cleared', () => { glows.clear(); api.clear(); });
  ctx.events.on('tier:changed', ({ tier }) => {
    add.resize(tier.particlesAdd); smoke.resize(tier.particlesAlpha);
    lights.build(tier.pointLights | 0);
    debris.resize(tier.debrisMax); decals.resize(tier.maxDecals);
    add._refresh(); smoke._refresh();
  });
  ctx.events.on('materials:textures', () => { add._refresh(); smoke._refresh(); });
  ctx.addSystem({ name: 'particles', phase: 'fx', when: 'sim', update: (dt) => api.update(dt) });
  ctx.particles = api;
  return api;
}
