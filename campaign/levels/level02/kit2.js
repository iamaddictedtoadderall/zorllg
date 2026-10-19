// levels/level02/kit2.js — Level 2's geometry and material helpers, on top of Level 1's kit (levels/level01/kit.js:
// bevelled plates, the merging Builder, LOD mode, signage). Everything Level 2 builds goes through these, so a structure,
// a rig or a unit costs a handful of draw calls (one merged mesh per material) and gets a single-mesh LOD1.
import * as THREE from 'three';
import { Builder, cached, instance, mats, withLod, shared } from '../level01/kit.js';

export * from '../level01/kit.js';

/** Level 1's materials plus the steppe's own (AD §4.2 values through ctx.materials.standard: cached and shared) */
const M_CACHE = new WeakMap();
export function mats2(ctx) {
  let m = M_CACHE.get(ctx);
  if (m) return m;
  const base = mats(ctx);
  const S = (o) => ctx.materials.standard(o);
  const E = (c, i) => ctx.materials.emissive(c, i);
  m = Object.assign(Object.create(base), {
    // weathered turbine paint: an off-white that has gone the colour of old bone, and its rust
    paint: S({ color: '#c9c0ad', roughness: 0.7, metalness: 0.1, envMapIntensity: 0.6, wear: 0.75 }),
    rustDark: S({ color: '#5a2e1c', roughness: 0.9, metalness: 0.3, envMapIntensity: 0.4, wear: 0.4 }),
    // the steppe's stone: banded sandstone for the Watcher's shelf and the dial stones' scoured feet
    sandstone: S({ color: '#a27a52', roughness: 0.92, metalness: 0, envMapIntensity: 0.4, wear: 0.3 }),
    // Founders white ceramic in the low sun (a touch warmer than Level 1's iced ceramic)
    ceramicWarm: S({ color: '#ece4d4', roughness: 0.38, metalness: 0.05, envMapIntensity: 0.75, wear: 0.35 }),
    // Wake paint faded by the steppe sun
    wakeFaded: S({ color: '#7a9e98', roughness: 0.7, metalness: 0.2, envMapIntensity: 0.5, wear: 0.9 }),
    reedMat: S({ color: '#b07a40', roughness: 0.95, metalness: 0, envMapIntensity: 0.25, side: 'double', wear: 0.4 }),
    sail: S({ color: '#7a2e1e', roughness: 0.85, metalness: 0, envMapIntensity: 0.3, side: 'double', wear: 0.6 }),
    jet: E('#bfe4ff', 4),
    ghostLens: ctx.materials.emissive('#a8ff9e', 5.0001),
  });
  M_CACHE.set(ctx, m);
  return m;
}

export const PI = Math.PI;
export const q5 = (v) => Math.round(v * 2) / 2;

/** a footprint that never flattens (Level 2's terrain is authored with explicit stamps) */
export const fp = (shape, a, b, exclude = 3) => (shape === 'circle' ? { shape, r: a, flatten: false, pad: 10, exclude, h: 'auto' }
                                                                      : { shape, w: a, d: b, flatten: false, pad: 10, exclude, h: 'auto' });
/** a group of meshes from a cached build: { root, lod?, extra } (o.lod: also a single-mesh LOD1; o.remap: a palette) */
export function part(ctx, key, make, o = {}) { const b = cached(ctx, 'l02:' + key, make, o); const r = instance(ctx, b, o); r.extra = b.extra; r.tris = b.tris; return r; }
/** a palette remap: [[from, to], …] → Map */
export const pal = (pairs) => new Map(pairs.filter(([a, b]) => a && b));
/** LOD1 for a multi-part build: one vertex-coloured geometry, cached per ctx + key */
const LODS = new WeakMap();
export function lodGeo(ctx, key, fill, o = {}) {
  let c = LODS.get(ctx); if (!c) { c = new Map(); LODS.set(ctx, c); }
  let g = c.get(key);
  if (!g) { const L = new Builder({ remap: o.remap }); withLod(() => fill(L)); g = L.single(o.colorOf); c.set(key, g); }
  return g;
}
export function lodMesh(ctx, geo) {
  const m = new THREE.Mesh(geo, mats(ctx).lod); m.name = 'lod1'; m.castShadow = false; m.receiveShadow = true;
  return m;
}
/** merged meshes for a one-off (uncached) build, e.g. a model posed at runtime */
export function buildOnce(make, o = {}) {
  const B = new Builder({ remap: o.remap });
  make(B);
  return B.merged();
}
export { shared };
