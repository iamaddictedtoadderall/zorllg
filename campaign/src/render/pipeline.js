// render/pipeline.js (P1): renderer configuration, the post chain, grading, runtime tier switching and frame stats
// (architecture §7.1, §7.2).
//
// High:   RenderPass → GTAOPass (settings.ao; half resolution) → UnrealBloomPass → FinalPass   (MSAA ×4 composer target)
// Medium: RenderPass → UnrealBloomPass → FinalPass → SMAAPass
// Low:    renderer.render(scene, camera); tone mapping and sRGB by the renderer; no grading, bloom or AO.
// FinalPass (one fragment shader) does chromatic aberration, exposure and tone mapping (the renderer's operator), linear
// → sRGB, then display-space grading (lift/gamma/gain, contrast, saturation, split tints, desaturate), vignette, grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
  const counters = { shadow: 0, shadowTris: 0, main: 0, mainTris: 0, ao: 0, post: 0, frameMs: 0 };

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
    composer.addPass(P.render);
    if (t.ao && ctx.settings.get('ao') !== false) {
      P.ao = new GameGTAOPass(scene, cam, Math.max(1, size.x * pr / 2), Math.max(1, size.y * pr / 2), undefined,
                              { radius: 2.5, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      P.ao.blendIntensity = 0.7;
      P.ao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(P.ao);
    }
    if (t.bloom) {
      P.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr, size.y * pr), bloom.strength, bloom.radius, bloom.threshold);
      if (P.bloom.highPassUniforms?.smoothWidth) P.bloom.highPassUniforms.smoothWidth.value = 0.35;   // soft knee (prototype)
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
    if (P.bloom) { P.bloom.strength = bloom.strength; P.bloom.radius = bloom.radius; P.bloom.threshold = bloom.threshold; }
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
        const rp = P.render, orig = rp.render;
        let afterMain = 0, afterMainTris = 0;
        rp.render = function (...a) { orig.apply(this, a); afterMain = r.info.render.calls; afterMainTris = r.info.render.triangles; };
        composer.render(ctx.clock.realDt || 1 / 60);
        rp.render = orig;
        counters.main = afterMain - counters.shadow; counters.mainTris = afterMainTris - counters.shadowTris;
        counters.ao = P.ao?.sceneCalls ?? 0;
        counters.post = r.info.render.calls - afterMain - counters.ao;
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
      try { if (r.compileAsync) await r.compileAsync(s, c); } catch (e) { console.warn('[pipeline] compileAsync failed', e); }
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
