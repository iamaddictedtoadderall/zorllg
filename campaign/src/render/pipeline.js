// render/pipeline.js (P1) — P0 STUB: direct renderer.render(), tier setup (pixel ratio, shadow type),
// a live grade object, setView/clearView, warmup via compileAsync, stats() from renderer.info.
import * as THREE from 'three';

export function install(ctx) {
  const r = ctx.renderer;
  let view = null, viewCam = null, lastMs = 0;

  const api = {
    composer: null,
    grade: { exposure: 1, contrast: 1, saturation: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
             shadowsTint: [1, 1, 1], highlightsTint: [1, 1, 1], desaturate: 0, vignette: 0.28, grain: 0.028, chroma: 0.012, hurt: 0 },
    bloom: { strength: 0.85, radius: 0.6, threshold: 0.85 },
    setTier(t) {
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatioMax));
      r.shadowMap.type = t.name === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      r.shadowMap.needsUpdate = true;
      ctx.resize();
    },
    setGrade(p = {}) { Object.assign(api.grade, p); },
    setBloom(p = {}) { Object.assign(api.bloom, p); },
    setView(scene, camera) { view = scene || null; viewCam = camera || null; },
    clearView() { view = null; viewCam = null; },
    render() {
      const t0 = performance.now();
      r.info.reset();
      r.render(view || ctx.scene, viewCam || ctx.camera);
      lastMs = performance.now() - t0;
    },
    async warmup() {
      const s = view || ctx.scene, c = viewCam || ctx.camera;
      if (r.compileAsync) await r.compileAsync(s, c);
    },
    stats() {
      const i = r.info;
      return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
               geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0,
               frameMs: lastMs };
    },
  };
  ctx.events.on('tier:changed', ({ tier }) => api.setTier(tier));
  api.setTier(ctx.tier);
  ctx.pipeline = api;
  return api;
}
