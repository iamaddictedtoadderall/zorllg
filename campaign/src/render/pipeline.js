// render/pipeline.js (P1): renderer configuration, the post chain, grading, runtime tier switching and frame stats
// (architecture §7.1, §7.2).
//
// High:   RenderPass → GTAOPass (settings.ao; half resolution) → BloomPass → FinalPass   (MSAA ×4 composer target)
// Medium: RenderPass → BloomPass → FinalPass → SMAAPass   (BloomPass: the prototype bloom in the UnrealBloomPass slot)
// Low:    renderer.render(scene, camera); tone mapping and sRGB by the renderer; no grading, bloom or AO.
// FinalPass (one fragment shader) does chromatic aberration, exposure and tone mapping (the renderer's operator), linear
// → sRGB, then display-space grading (lift/gamma/gain, contrast, saturation, split tints, desaturate), vignette, grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const GRADE_KEYS_NUM = ['exposure', 'contrast', 'saturation', 'desaturate', 'vignette', 'grain', 'chroma', 'hurt'];
const GRADE_KEYS_VEC = ['lift', 'gamma', 'gain', 'shadowsTint', 'highlightsTint'];
const defaultGrade = () => ({ exposure: 1, contrast: 1, saturation: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
                              shadowsTint: [1, 1, 1], highlightsTint: [1, 1, 1], desaturate: 0, vignette: 0.28, grain: 0.028,
                              chroma: 0.012, hurt: 0 });

// ------------------------------------------------------------------------------------------------ FinalPass
const FINAL_VS = /* glsl */`
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FINAL_FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform float uExposure, uContrast, uSaturation, uDesat, uVignette, uGrain, uChroma, uHurt, uTime;
uniform vec3 uLift, uGamma, uGain, uShadowTint, uHighTint;
uniform vec2 uRes;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  // 1. chromatic aberration (radial)
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 ca = d * r2 * (uChroma + uHurt * 0.02);
  vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
  // 2. exposure and tone mapping (the renderer's operator and toneMappingExposure)
  c *= uExposure;
  #if defined( ACES_FILMIC_TONE_MAPPING )
    c = ACESFilmicToneMapping(c);
  #elif defined( AGX_TONE_MAPPING )
    c = AgXToneMapping(c);
  #elif defined( NEUTRAL_TONE_MAPPING )
    c = NeutralToneMapping(c);
  #elif defined( REINHARD_TONE_MAPPING )
    c = ReinhardToneMapping(c);
  #elif defined( CINEON_TONE_MAPPING )
    c = CineonToneMapping(c);
  #elif defined( LINEAR_TONE_MAPPING )
    c = LinearToneMapping(c);
  #endif
  c = clamp(c, 0.0, 1.0);
  // 3. linear → sRGB
  #ifdef SRGB_TRANSFER
    c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
  #endif
  // 4. grade in display space
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, vec3(0.0)), 1.0 / max(uGamma, vec3(0.05)));
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  float sw = 1.0 - smoothstep(0.0, 0.55, l), hw = smoothstep(0.45, 1.0, l);
  c *= mix(vec3(1.0), uShadowTint, sw) * mix(vec3(1.0), uHighTint, hw);
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), clamp(uDesat + uHurt * 0.25, 0.0, 1.0));
  // 5. vignette (plus a red rim when hurt)
  float vr = length(d * vec2(1.0, 0.8));
  c *= mix(1.0 - uVignette, 1.0, smoothstep(0.62, 0.18, vr));
  c = mix(c, c * vec3(1.25, 0.55, 0.5), uHurt * smoothstep(0.25, 0.7, vr) * 0.6);
  // 6. grain
  c += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// ------------------------------------------------------------------------------------------------ BloomPass
// The prototype's bloom (AD: "keep the soft-knee bloom"), ported as a composer pass in the UnrealBloomPass slot of
// arch §7.2: a soft-knee bright pass at half resolution (4-tap prefilter, firefly cap), a 13-tap downsample chain
// (Jimenez 2014) and a tent-filter upsample chain that accumulates additively, then an additive composite onto the HDR
// frame before FinalPass tone-maps it. Unlike UnrealBloomPass's truncated (box-like) separable kernels, the result is
// radially smooth: no square halos around bright lenses. 1 + 5 + 5 + 1 = 12 draw calls.
//   strength  composite gain (art.bloom.strength)
//   radius    0..1: upsample weight (0 tight glow … 1 wide halo; 0.6 ≈ the prototype's 0.9)
//   threshold linear HDR luminance after exposure where the soft knee is centred (art.bloom.threshold)
const BLOOM_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLOOM_BRIGHT_FS = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uThreshold, uKnee, uExposure;
varying vec2 vUv;
vec3 S(vec2 o) { return min(texture2D(tDiffuse, vUv + uTexel * o).rgb, vec3(48.0)); }
// Karis-style firefly weight, kept gentle: it only tames extreme sub-pixel sparkles, so a small but genuinely bright
// lamp or ghost beacon (a few pixels at 1 km) still blooms into a readable halo
float W(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b)) * uExposure * 0.07); }
void main() {
  vec3 a = S(vec2(-1.0, -1.0)), b = S(vec2(1.0, -1.0)), c = S(vec2(-1.0, 1.0)), d = S(vec2(1.0, 1.0));
  float wa = W(a), wb = W(b), wc = W(c), wd = W(d);
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  float l = max(col.r, max(col.g, col.b)) * uExposure;
  float k = max(uKnee, 1e-3);
  float s = clamp(l - uThreshold + k, 0.0, 2.0 * k);
  s = s * s / (4.0 * k);
  gl_FragColor = vec4(col * (max(s, l - uThreshold) / max(l, 1e-4)), 1.0);
}`;
const BLOOM_DOWN_FS = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 S(float x, float y) { return texture2D(tDiffuse, vUv + uTexel * vec2(x, y)).rgb; }
void main() {
  vec3 o = S(0.0, 0.0) * 0.125
         + (S(-2.0, 2.0) + S(2.0, 2.0) + S(-2.0, -2.0) + S(2.0, -2.0)) * 0.03125
         + (S(0.0, 2.0) + S(-2.0, 0.0) + S(2.0, 0.0) + S(0.0, -2.0)) * 0.0625
         + (S(-1.0, 1.0) + S(1.0, 1.0) + S(-1.0, -1.0) + S(1.0, -1.0)) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;
const BLOOM_UP_FS = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uK;
varying vec2 vUv;
vec3 S(float x, float y) { return texture2D(tDiffuse, vUv + uTexel * vec2(x, y)).rgb; }
void main() {
  vec3 s = (S(-1.0, 1.0) + S(1.0, 1.0) + S(-1.0, -1.0) + S(1.0, -1.0))
         + (S(0.0, 1.0) + S(-1.0, 0.0) + S(1.0, 0.0) + S(0.0, -1.0)) * 2.0 + S(0.0, 0.0) * 4.0;
  gl_FragColor = vec4(s / 16.0 * uK, 1.0);
}`;
const BLOOM_ADD_FS = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uStrength;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * uStrength, 1.0); }`;

class BloomPass extends Pass {
  constructor(resolution, strength = 0.85, radius = 0.6, threshold = 0.85) {
    super();
    this.strength = strength; this.radius = radius; this.threshold = threshold; this.knee = 0.3; this.exposure = 1;
    this.needsSwap = false;
    this.levels = 6;
    this.mips = [];
    for (let i = 0; i < this.levels; i++) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false,
                                                     minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.name = 'bloom.mip' + i;
      this.mips.push(rt);
    }
    const mk = (fs, u, extra = {}) => new THREE.ShaderMaterial({ name: 'bloom', uniforms: u, vertexShader: BLOOM_VS, fragmentShader: fs,
                                                                  depthTest: false, depthWrite: false, ...extra });
    this.bright = mk(BLOOM_BRIGHT_FS, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: threshold },
                                        uKnee: { value: 0.3 }, uExposure: { value: 1 } });
    this.down = mk(BLOOM_DOWN_FS, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(BLOOM_UP_FS, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uK: { value: 0.9 } },
                 { blending: THREE.AdditiveBlending, transparent: true });
    this.add = mk(BLOOM_ADD_FS, { tDiffuse: { value: null }, uStrength: { value: strength } },
                  { blending: THREE.AdditiveBlending, transparent: true });
    this.fsQuad = new FullScreenQuad(null);
    this.size = new THREE.Vector2(1, 1);
    if (resolution) this.setSize(resolution.x, resolution.y);
  }
  setSize(w, h) {
    this.size.set(w, h);
    let x = w, y = h;
    for (const m of this.mips) { x = Math.max(1, Math.round(x / 2)); y = Math.max(1, Math.round(y / 2)); m.setSize(x, y); }
  }
  _run(renderer, mat, target) { this.fsQuad.material = mat; renderer.setRenderTarget(target); this.fsQuad.render(renderer); }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    const M = this.mips, n = M.length;
    // 1. bright pass (soft knee) into the half-resolution level
    const b = this.bright.uniforms;
    b.tDiffuse.value = readBuffer.texture;
    b.uTexel.value.set(1 / Math.max(1, readBuffer.width), 1 / Math.max(1, readBuffer.height));
    b.uThreshold.value = this.threshold; b.uKnee.value = this.knee; b.uExposure.value = this.exposure;
    this._run(renderer, this.bright, M[0]);
    // 2. 13-tap downsample chain
    for (let i = 1; i < n; i++) {
      this.down.uniforms.tDiffuse.value = M[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / M[i - 1].width, 1 / M[i - 1].height);
      this._run(renderer, this.down, M[i]);
    }
    // 3. tent upsample, accumulated additively into each finer level
    const k = Math.min(1.05, Math.max(0.3, 0.45 + 0.75 * (+this.radius || 0)));
    for (let i = n - 2; i >= 0; i--) {
      this.up.uniforms.tDiffuse.value = M[i + 1].texture;
      this.up.uniforms.uTexel.value.set(1 / M[i + 1].width, 1 / M[i + 1].height);
      this.up.uniforms.uK.value = k;
      this._run(renderer, this.up, M[i]);
    }
    // 4. composite: add onto the HDR frame (FinalPass tone-maps scene + bloom together)
    this.add.uniforms.tDiffuse.value = M[0].texture;
    this.add.uniforms.uStrength.value = Math.max(0, +this.strength || 0) * 0.5;
    this._run(renderer, this.add, this.renderToScreen ? null : readBuffer);
    renderer.autoClear = ac;
  }
  dispose() {
    for (const m of this.mips) m.dispose();
    this.bright.dispose(); this.down.dispose(); this.up.dispose(); this.add.dispose();
  }
}

class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, toneMappingExposure: { value: 1 },
      uExposure: { value: 1 }, uContrast: { value: 1 }, uSaturation: { value: 1 }, uDesat: { value: 0 }, uVignette: { value: 0.28 },
      uGrain: { value: 0.028 }, uChroma: { value: 0.012 }, uHurt: { value: 0 }, uTime: { value: 0 },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
      uRes: { value: new THREE.Vector2(1, 1) },
    };
    this.material = new THREE.RawShaderMaterial({ name: 'FinalPass', uniforms: this.uniforms, vertexShader: FINAL_VS, fragmentShader: FINAL_FS,
                                                  depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
    this._cs = null; this._tm = null;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    if (this._cs !== renderer.outputColorSpace || this._tm !== renderer.toneMapping) {
      this._cs = renderer.outputColorSpace; this._tm = renderer.toneMapping;
      const D = {};
      if (THREE.ColorManagement.getTransfer(this._cs) === THREE.SRGBTransfer) D.SRGB_TRANSFER = '';
      const tm = this._tm;
      if (tm === THREE.ACESFilmicToneMapping) D.ACES_FILMIC_TONE_MAPPING = '';
      else if (tm === THREE.AgXToneMapping) D.AGX_TONE_MAPPING = '';
      else if (tm === THREE.NeutralToneMapping) D.NEUTRAL_TONE_MAPPING = '';
      else if (tm === THREE.ReinhardToneMapping) D.REINHARD_TONE_MAPPING = '';
      else if (tm === THREE.CineonToneMapping) D.CINEON_TONE_MAPPING = '';
      else if (tm === THREE.LinearToneMapping) D.LINEAR_TONE_MAPPING = '';
      this.material.defines = D;
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/** GTAO at half resolution that skips the sky, effects and transparent geometry, and never re-renders shadow maps. */
class GameGTAOPass extends GTAOPass {
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }
  overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO) { o.visible = false; return; }
      const m = o.material;
      if (m && (Array.isArray(m) ? m.every(x => x.transparent || x.userData?.noAO) : (m.transparent || m.userData?.noAO))) o.visible = false;
    });
  }
  renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
    const sm = renderer.shadowMap, au = sm.autoUpdate;
    sm.autoUpdate = false;
    const c0 = renderer.info.render.calls;
    super.renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
    this.sceneCalls = renderer.info.render.calls - c0;
    sm.autoUpdate = au;
  }
  dispose() { super.dispose(); this.gtaoMaterial.dispose(); this.blendMaterial.dispose(); }
}

export function install(ctx) {
  const r = ctx.renderer;
  const forceDirect = ctx.params.get('nopost') === '1';
  let view = null, viewCam = null;
  let composer = null, P = {};
  const size = new THREE.Vector2();
  const counters = { shadow: 0, shadowTris: 0, main: 0, mainTris: 0, ao: 0, post: 0, frameMs: 0, afterMain: 0, afterMainTris: 0 };

  // count shadow-map draw calls separately (whole-frame stats include them)
  const sm = r.shadowMap;
  if (!sm._p1wrapped) {
    const orig = sm.render.bind(sm);
    sm.render = function (lights, scene, camera) {
      const c0 = r.info.render.calls, t0 = r.info.render.triangles;
      orig(lights, scene, camera);
      counters.shadow += r.info.render.calls - c0; counters.shadowTris += r.info.render.triangles - t0;
    };
    sm._p1wrapped = true;
  }

  const grade = defaultGrade();
  const bloom = { strength: 0.85, radius: 0.6, threshold: 0.85 };
  let gBlend = null, bBlend = null;   // { from, to, t, dur }

  function dispose() {
    if (!composer) return;
    for (const p of composer.passes) { try { p.dispose?.(); } catch (e) { /* ignore */ } }
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    composer = null; P = {};
  }
  function build(t) {
    dispose();
    if (!t.post || forceDirect) return;
    r.getSize(size);
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr),
      { type: THREE.HalfFloatType, samples: t.msaa | 0, depthBuffer: true });
    rt.texture.name = 'pipeline.rt';
    composer = new EffectComposer(r, rt);
    composer.setPixelRatio(pr);
    const scene = view || ctx.scene, cam = viewCam || ctx.camera;
    P.render = new RenderPass(scene, cam);
    {   // record the totals right after the main pass (wrapped once here, so render() allocates nothing per frame)
      const rp = P.render, orig = rp.render;
      rp.render = function (a, b, c, d, e) {
        orig.call(this, a, b, c, d, e);
        counters.afterMain = r.info.render.calls; counters.afterMainTris = r.info.render.triangles;
      };
    }
    composer.addPass(P.render);
    if (t.ao && ctx.settings.get('ao') !== false) {
      P.ao = new GameGTAOPass(scene, cam, Math.max(1, size.x * pr / 2), Math.max(1, size.y * pr / 2), undefined,
                              { radius: 2.5, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      P.ao.blendIntensity = 0.7;
      P.ao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(P.ao);
    }
    if (t.bloom) {
      P.bloom = new BloomPass(new THREE.Vector2(size.x * pr, size.y * pr), bloom.strength, bloom.radius, bloom.threshold);
      composer.addPass(P.bloom);
    }
    P.final = new FinalPass();
    composer.addPass(P.final);
    if (t.smaa) { P.smaa = new SMAAPass(size.x * pr, size.y * pr); composer.addPass(P.smaa); }
    composer.setSize(size.x, size.y);
  }

  function applyUniforms() {
    const f = P.final;
    if (!f) return;
    const u = f.uniforms;
    u.uExposure.value = grade.exposure; u.uContrast.value = grade.contrast; u.uSaturation.value = grade.saturation;
    u.uDesat.value = grade.desaturate; u.uVignette.value = grade.vignette; u.uGrain.value = grade.grain;
    u.uChroma.value = grade.chroma; u.uHurt.value = Math.max(0, Math.min(1, +grade.hurt || 0));
    u.uLift.value.fromArray(grade.lift); u.uGamma.value.fromArray(grade.gamma); u.uGain.value.fromArray(grade.gain);
    u.uShadowTint.value.fromArray(grade.shadowsTint); u.uHighTint.value.fromArray(grade.highlightsTint);
    u.uTime.value = ctx.clock.realTime;
    if (P.bloom) { P.bloom.strength = bloom.strength; P.bloom.radius = bloom.radius; P.bloom.threshold = bloom.threshold;
                   P.bloom.exposure = r.toneMappingExposure * (grade.exposure || 1); }
  }
  const snapGrade = () => { const s = {}; for (const k of GRADE_KEYS_NUM) s[k] = grade[k]; for (const k of GRADE_KEYS_VEC) s[k] = grade[k].slice(); return s; };
  const vec3 = (v, d) => (Array.isArray(v) && v.length >= 3 ? [+v[0], +v[1], +v[2]] : typeof v === 'number' ? [v, v, v] : d);

  const api = {
    composer: null,
    grade,
    bloom,
    setTier(t) {
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatioMax || 1));
      r.shadowMap.type = t.name === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      r.shadowMap.needsUpdate = true;
      const sun = ctx.atmosphere?.sun;
      if (sun && sun.shadow.mapSize.x !== t.shadowMapSize) {
        sun.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      build(t);
      api.composer = composer;
      ctx.resize();
    },
    setGrade(p = {}, blendSeconds = 0) {
      if (!p) return;
      const to = snapGrade();
      for (const k of GRADE_KEYS_NUM) if (p[k] != null && Number.isFinite(+p[k])) to[k] = +p[k];
      for (const k of GRADE_KEYS_VEC) if (p[k] != null) to[k] = vec3(p[k], to[k]);
      if (gBlend) { gBlend = null; }
      if (!(blendSeconds > 0)) {
        for (const k of GRADE_KEYS_NUM) if (k !== 'hurt' || p.hurt != null) grade[k] = to[k];
        for (const k of GRADE_KEYS_VEC) grade[k] = to[k];
      } else gBlend = { from: snapGrade(), to, t: 0, dur: +blendSeconds };
      applyUniforms();
    },
    setBloom(p = {}, blendSeconds = 0) {
      if (!p) return;
      const to = { ...bloom };
      for (const k of ['strength', 'radius', 'threshold']) if (p[k] != null && Number.isFinite(+p[k])) to[k] = +p[k];
      if (!(blendSeconds > 0)) { Object.assign(bloom, to); bBlend = null; }
      else bBlend = { from: { ...bloom }, to, t: 0, dur: +blendSeconds };
      applyUniforms();
    },
    setView(scene, camera) {
      view = scene || null; viewCam = camera || null;
      if (P.render) { P.render.scene = view || ctx.scene; P.render.camera = viewCam || ctx.camera; }
      if (P.ao) { P.ao.scene = view || ctx.scene; P.ao.camera = viewCam || ctx.camera; }
    },
    clearView() { api.setView(null, null); },
    render() {
      const t0 = performance.now();
      const scene = view || ctx.scene, cam = viewCam || ctx.camera;
      r.info.reset();
      counters.shadow = 0; counters.shadowTris = 0;
      if (scene === ctx.scene) ctx.atmosphere?.prepare?.(cam);
      ctx.particles?.prepare?.(scene, cam);
      if (composer) {
        applyUniforms();
        if (P.render.scene !== scene || P.render.camera !== cam) api.setView(view, viewCam);
        counters.afterMain = 0; counters.afterMainTris = 0;
        composer.render(ctx.clock.realDt || 1 / 60);
        counters.main = counters.afterMain - counters.shadow; counters.mainTris = counters.afterMainTris - counters.shadowTris;
        counters.ao = P.ao?.sceneCalls ?? 0;
        counters.post = r.info.render.calls - counters.afterMain - counters.ao;
      } else {
        const e0 = r.toneMappingExposure;
        r.toneMappingExposure = e0 * (grade.exposure || 1);
        r.setRenderTarget(null);
        r.render(scene, cam);
        counters.main = r.info.render.calls - counters.shadow; counters.mainTris = r.info.render.triangles - counters.shadowTris;
        counters.ao = 0; counters.post = 0;
        r.toneMappingExposure = e0;
      }
      counters.frameMs = performance.now() - t0;
    },
    async warmup() {
      const s = view || ctx.scene, c = viewCam || ctx.camera;
      // compile against the target the frame really renders into: with the composer that is a linear HDR target with
      // no tone mapping, so compiling against the screen would build a second, never-used program for every material
      // (sRGB + tone-mapped variants), doubling the program count on High and Medium
      const prevRT = r.getRenderTarget();
      try {
        if (r.compileAsync) {
          if (composer) r.setRenderTarget(composer.renderTarget1);
          const p = r.compileAsync(s, c);   // programs are created synchronously inside; the promise waits for linking
          r.setRenderTarget(prevRT);
          await p;
        }
      } catch (e) { r.setRenderTarget(prevRT); console.warn('[pipeline] compileAsync failed', e); }
      api.render();   // compiles the post chain and the shadow programs; hidden behind the loading screen
    },
    stats() {
      const i = r.info;
      return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
               geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0,
               frameMs: counters.frameMs,
               // extras: the breakdown used for the §7.5 budgets
               main: counters.main, shadow: counters.shadow, ao: counters.ao, post: counters.post,
               mainTriangles: counters.mainTris, shadowTriangles: counters.shadowTris,
               tier: ctx.tier.name, composer: !!composer };
    },
    /** extra: names of the active passes (tests) */
    passes() { return composer ? composer.passes.map(p => p.constructor.name) : []; },
  };

  ctx.events.on('tier:changed', ({ tier }) => api.setTier(tier));
  ctx.events.on('resize', ({ w, h }) => { if (composer) { composer.setPixelRatio(r.getPixelRatio()); composer.setSize(w, h); } });
  ctx.events.on('settings:changed', ({ key }) => { if (key === 'ao' && ctx.tier.ao) { build(ctx.tier); api.composer = composer; } });
  ctx.addSystem({
    name: 'pipeline', phase: 'fx', when: 'always', order: 50,
    update(dt) {
      if (gBlend) {
        gBlend.t += dt;
        const k0 = Math.min(1, gBlend.t / gBlend.dur), k = k0 * k0 * (3 - 2 * k0), { from, to } = gBlend;
        for (const key of GRADE_KEYS_NUM) if (key !== 'hurt') grade[key] = from[key] + (to[key] - from[key]) * k;
        for (const key of GRADE_KEYS_VEC) for (let j = 0; j < 3; j++) grade[key][j] = from[key][j] + (to[key][j] - from[key][j]) * k;
        if (k0 >= 1) gBlend = null;
      }
      if (bBlend) {
        bBlend.t += dt;
        const k0 = Math.min(1, bBlend.t / bBlend.dur), k = k0 * k0 * (3 - 2 * k0);
        for (const key of ['strength', 'radius', 'threshold']) bloom[key] = bBlend.from[key] + (bBlend.to[key] - bBlend.from[key]) * k;
        if (k0 >= 1) bBlend = null;
      }
    },
  });
  ctx.pipeline = api;
  const art = ctx.atmosphere?.art;
  if (art) { api.setGrade({ ...(art.grade || {}) }); api.setBloom(art.bloom || {}); }
  api.setTier(ctx.tier);
  return api;
}
