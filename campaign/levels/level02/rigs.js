// levels/level02/rigs.js — the Wake's rigs (L2 §4.1, §10.7): forty moving homes in Wake style (AD §1.3): patched,
// asymmetric salvage over bevelled hulls, canvas awnings, kite ribbons, painted names, tungsten windows (dim in daylight).
// No people are ever visible: cabs have canvas screens or dark glass.
//
//  · rigModel(ctx, kind): a cached build (one merged geometry per material + a single vertex-coloured LOD1) for each kind:
//    the generic 'crawler', 'walker' and 'train', and the heroes 'crawler_mast' (Compass Rose), 'walker_tubs' (Twice Shy),
//    'tanker' (Big Mercy: tractor and two tank cars, 40 m), 'bench' (the Bench), 'walker_small' (Second Patience) and
//    'trike' (Thimble).
//  · RigView: one named rig as a THREE.LOD (full model within 300 m, LOD1 beyond), its painted name on both flanks.
//  · RigInstances: the generic rigs, one InstancedMesh per variant and material (≤ 15 draw calls for all of them), with a
//    per-instance tint; beyond 300 m the same instances (the budget is the draw call, not the triangle).
import * as THREE from 'three';
import * as KIT from '../../src/art/kit.js';
import { Builder, mats2, slab, side, front, top, cyl, ball, torus, chamferRect, withLod, rngFor, q5, PI } from './kit2.js';
import { signMesh } from '../level01/structures.js';

// dimensions by kind: length (z), width (x), the cab height (for markers), the footprint used to push the frame out
export const RIG_DIMS = {
  crawler: { len: 18, wid: 9, h: 11 }, crawler_mast: { len: 18, wid: 9, h: 24 }, walker: { len: 12, wid: 9, h: 16 },
  walker_tubs: { len: 12, wid: 9, h: 17 }, walker_small: { len: 9, wid: 7, h: 12 }, train: { len: 26, wid: 6.5, h: 7.5 },
  tanker: { len: 40, wid: 6.5, h: 8 }, bench: { len: 20, wid: 11, h: 15 }, trike: { len: 9, wid: 5, h: 5 },
};

const RIBBON = (M) => [M.canvasRed, M.wake, M.canvas, M.wakeRed];

/** a patch of salvaged plates on a flank (x = the flank plane, facing ±x) */
function patches(B, M, rng, x, y, z, h, w, n, lod) {
  if (lod) return;
  const s = Math.sign(x) || 1;
  for (let i = 0; i < n; i++) B.add(slab(q5(0.8 + rng() * 1.8), q5(0.6 + rng() * 1.4), 0.1, 0.03), [M.wakeRed, M.rust, M.wakeCream, M.drum][i % 4],
                                    x + s * 0.02, y + (rng() - 0.5) * h, z + (rng() - 0.5) * w, 0, PI / 2, (rng() - 0.5) * 0.08);
}
/** a kite-ribbon mast: a thin pole with fluttering strips (static), `h` tall */
function ribbonPole(B, M, rng, x, y, z, h, lod) {
  B.add(cyl(0.12, 0.16, h, 6), M.dark, x, y + h / 2, z);
  if (lod) return;
  for (let i = 0; i < 4; i++) B.add(slab(0.05, 2.4 + rng() * 1.4, 0.45, 0.01), RIBBON(M)[i], x + 0.2, y + h - 1.4 - i * 1.0, z + 0.4 + i * 0.3, 0.25, 0, 0.35 + rng() * 0.3);
}
/** a tracked running gear unit (track band, road wheels, skirt) centred at x, along z */
function track(B, M, x, len, lod) {
  const L = len / 2;
  B.add(side([[-L, 0.3], [-L + 0.6, 2.4], [L - 0.6, 2.4], [L, 0.3], [L - 0.8, -0.1], [-L + 0.8, -0.1]], 2.4, lod ? 0 : 0.28), M.rubber, x, 0, 0);
  if (lod) return;
  const n = Math.round(len / 3.4);
  for (let i = 0; i < n; i++) B.add(cyl(0.9, 0.9, 2.5, 12), M.iron, x, 1.15, -L + 1.6 + i * (len - 3.2) / (n - 1), 0, 0, PI / 2);
  B.add(side([[-L + 0.4, 1.6], [-L + 1.2, 3.0], [L - 1.2, 3.0], [L - 0.4, 1.6]], 0.3, 0.08), M.wakeFaded, x + Math.sign(x) * 1.3, 0, 0);
}

function crawlerBody(B, M, rng, o, lod) {
  const len = o.len || 18, L = len / 2;
  for (const s of [-1, 1]) track(B, M, s * 3.6, len, lod);
  // the hull and its deck, a front cab with a glazed band, the living house behind with a canvas awning
  B.add(slab(7.4, 2.8, len - 1, lod ? 0 : 0.4), M.wake, 0, 3.7, 0);
  B.add(slab(7.8, 0.4, len - 0.4, lod ? 0 : 0.12), M.dark, 0, 5.2, 0);
  B.add(side([[-L + 0.8, 5.3], [-L + 1.6, 8.4], [-L + 6.4, 8.6], [-L + 6.6, 5.3]], 6.6, lod ? 0 : 0.35), M.wakeCream, -0.3, 0, 0);
  B.add(slab(6.2, 1.0, 0.12, 0.04), M.darkGlass, -0.3, 7.4, -L + 1.25, -0.2, 0, 0);
  if (!lod) B.add(slab(5.6, 0.7, 0.1, 0.03), M.tungsten, -0.3, 7.3, -L + 1.38, -0.2, 0, 0);
  B.add(slab(6.8, 3.4, len - 8, lod ? 0 : 0.35), M.wakeCream, 0.2, 7.0, 3.6);
  // the awning: two canvas slopes over hoops, ragged at the ends
  for (const s of [-1, 1]) B.add(slab(4.0, 0.12, len - 7, lod ? 0 : 0.03), M.canvas, s * 1.8, 9.4, 3.4, 0, 0, s * 0.42);
  if (!lod) {
    for (let i = 0; i < 4; i++) B.add(KIT.ring(3.4, 0.16, 0.16, 16), M.dark, 0, 8.6, -1 + i * 3.4, PI / 2, 0, 0);
    for (const z of [-1.5, 2.5, 6.5]) for (const s of [-1, 1]) { B.add(slab(0.1, 0.9, 1.8, 0.03), M.tungsten, s * 3.42, 7.3, z); }
    patches(B, M, rng, 3.75, 3.7, 0, 2.2, len - 3, 6, lod);
    patches(B, M, rng, -3.75, 3.7, 0, 2.2, len - 3, 5, lod);
    patches(B, M, rng, 3.45, 7.0, 3.6, 2.4, len - 9, 3, lod);
    // side water drums, a ladder, an exhaust stack, crates on the rear deck
    for (const z of [-2, 0.5]) B.add(cyl(0.65, 0.65, 1.5, 12), M.drum, -4.4, 6.0, z, 0, 0, 0);
    for (let i = 0; i < 6; i++) B.add(slab(0.9, 0.08, 0.08, 0.02), M.dark, 3.8, 4.4 + i * 0.6, L - 2.2);
    B.add(cyl(0.22, 0.28, 4.2, 8), M.dark, 2.6, 9.9, -L + 5.2);
    for (let i = 0; i < 3; i++) B.add(slab(q5(1.2 + rng()), q5(0.8 + rng() * 0.6), q5(1.0 + rng()), 0.08), [M.wakeRed, M.drum, M.wakeCream][i], -1.5 + i * 1.5, 6.0, L - 1.2, 0, rng() * 0.3, 0);
    B.add(KIT.greebles(() => 0.37, 2.4, 1.0, 1.0), M.iron, 0, 4.0, L - 0.4);
  }
}
function walkerBody(B, M, rng, o, lod) {
  const k = o.scale || 1;
  B.add(side([[-6 * k, 7 * k], [-5.4 * k, 12.5 * k], [4.8 * k, 13.2 * k], [6.2 * k, 10 * k], [5.6 * k, 6.8 * k], [-5.2 * k, 6.4 * k]], 9.4 * k, lod ? 0 : 0.4), M.wake, 0, 0, 0);
  B.add(slab(8 * k, 3.2 * k, 6 * k, lod ? 0 : 0.4), M.wakeCream, 0, 14.6 * k, -1 * k);
  B.add(slab(6.4 * k, 1.0 * k, 0.12, 0.05), M.darkGlass, 0, 14.8 * k, -4.05 * k);
  if (!lod) B.add(slab(5.8 * k, 0.6 * k, 0.1, 0.03), M.tungsten, 0, 14.8 * k, -3.95 * k);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    B.add(slab(1.3 * k, 6.4 * k, 1.5 * k, lod ? 0 : 0.2), M.iron, x * k, 3.5 * k, z * k, 0, 0, x * 0.02);
    B.add(top(chamferRect(2.6 * k, 3.0 * k, 0.6 * k), 0.5 * k, lod ? 0 : 0.12), M.rubber, x * k, 0.25 * k, z * k);
    if (!lod) B.add(cyl(0.7 * k, 0.7 * k, 1.6 * k, 10), M.dark, x * k, 6.8 * k, z * k, 0, 0, PI / 2);
  }
  B.add(slab(10 * k, 0.15, 6 * k, lod ? 0 : 0.04), M.canvas, 0, 16.6 * k, 3 * k, 0.15, 0, 0);
  if (!lod) {
    patches(B, M, rng, 4.75 * k, 10 * k, 0, 4 * k, 9 * k, 5, lod);
    patches(B, M, rng, -4.75 * k, 10 * k, 0, 4 * k, 9 * k, 4, lod);
    for (let i = 0; i < 4; i++) B.add(slab(0.1, 0.8 * k, 1.4 * k, 0.03), M.tungsten, 4.76 * k, 9.6 * k, -3 * k + i * 2.2 * k);
    B.add(cyl(0.6 * k, 0.6 * k, 1.4 * k, 12), M.drum, -3.2 * k, 14.4 * k, 3.4 * k);
  }
}
function trainBody(B, M, rng, o, lod) {
  // tractor (front) and one trailer behind, on paired wheels; a tow bar between
  const tz = -8.5;
  B.add(slab(5.8, 1.2, 8.6, lod ? 0 : 0.3), M.iron, 0, 1.6, tz);
  B.add(slab(5.0, 4.0, 4.4, lod ? 0 : 0.4), M.wakeCream, 0, 4.2, tz - 1.6);
  B.add(slab(4.2, 1.0, 0.12, 0.05), M.darkGlass, 0, 5.2, tz - 3.85);
  if (!lod) B.add(slab(3.8, 0.7, 0.1, 0.03), M.tungsten, 0, 5.2, tz - 3.75);
  B.add(slab(5.2, 2.4, 4.0, lod ? 0 : 0.3), M.wake, 0, 3.4, tz + 2.6);
  for (const zz of [tz - 2.6, tz + 2.6]) for (const s of [-1, 1]) B.add(cyl(1.05, 1.05, 0.9, lod ? 8 : 14), M.rubber, s * 2.9, 1.05, zz, 0, 0, PI / 2);
  // trailer: a flatbed with a canvas-covered load and a water tank
  const rz = 6.5;
  B.add(slab(6.0, 1.0, 12.4, lod ? 0 : 0.25), M.iron, 0, 1.7, rz);
  B.add(cyl(2.1, 2.1, 6.0, lod ? 8 : 16), M.drum, 0, 4.2, rz + 2.6, PI / 2, 0, 0);
  B.add(slab(5.4, 2.8, 5.2, lod ? 0 : 0.5), M.canvas, 0, 3.6, rz - 3.2);
  for (const zz of [rz - 4, rz + 4]) for (const s of [-1, 1]) B.add(cyl(1.0, 1.0, 0.9, lod ? 8 : 14), M.rubber, s * 2.9, 1.0, zz, 0, 0, PI / 2);
  if (!lod) {
    B.add(slab(0.4, 0.4, 3, 0.06), M.dark, 0, 1.4, 0);
    for (const zz of [-1, 1]) B.add(torus(2.12, 0.08, 4, 18), M.dark, 0, 4.2, rz + 2.6 + zz * 2, 0, 0, 0);
    patches(B, M, rng, 2.55, 3.4, tz + 2.6, 1.6, 3.4, 3, lod);
    B.add(cyl(0.18, 0.22, 3.0, 8), M.dark, 1.8, 7.4, tz - 0.2);
  }
}
function tankerBody(B, M, rng, lod) {
  // Big Mercy: a tractor and two 14 m tank cars (L2 §4.1), 40 m long; ribbed tanks with hoops, ladders and a catwalk
  const tz = -15;
  B.add(slab(6.0, 1.4, 10, lod ? 0 : 0.3), M.iron, 0, 1.7, tz);
  B.add(slab(5.6, 4.4, 5.0, lod ? 0 : 0.45), M.wakeCream, 0, 4.6, tz - 2.2);
  B.add(slab(4.8, 1.1, 0.12, 0.05), M.darkGlass, 0, 5.8, tz - 4.75);
  if (!lod) B.add(slab(4.4, 0.8, 0.1, 0.03), M.tungsten, 0, 5.8, tz - 4.65);
  B.add(slab(5.6, 2.8, 4.4, lod ? 0 : 0.3), M.wake, 0, 3.8, tz + 2.8);
  for (const zz of [tz - 3, tz + 3]) for (const s of [-1, 1]) B.add(cyl(1.2, 1.2, 1.0, lod ? 8 : 16), M.rubber, s * 3.0, 1.2, zz, 0, 0, PI / 2);
  for (const cz of [-1.5, 13]) {
    B.add(slab(5.6, 0.9, 13.4, lod ? 0 : 0.25), M.iron, 0, 1.75, cz);
    B.add(cyl(2.6, 2.6, 12.2, lod ? 10 : 22), cz < 0 ? M.wake : M.wakeRed, 0, 4.85, cz, PI / 2, 0, 0);
    for (const zz of [-5.6, 5.6]) B.add(cyl(2.3, 2.6, 0.5, lod ? 10 : 22), M.drum, 0, 4.85, cz + zz + Math.sign(zz) * 0.3, PI / 2, 0, 0);
    for (const zz of [cz - 4.6, cz + 4.6]) for (const s of [-1, 1]) B.add(cyl(1.05, 1.05, 0.9, lod ? 8 : 14), M.rubber, s * 2.9, 1.05, zz, 0, 0, PI / 2);
    if (!lod) {
      for (const zz of [-4, -1.3, 1.3, 4]) B.add(torus(2.63, 0.1, 4, 22), M.dark, 0, 4.85, cz + zz);
      B.add(slab(1.4, 0.12, 12, 0.03), M.dark, 0, 7.55, cz);                                     // catwalk
      for (const s of [-1, 1]) B.add(cyl(0.05, 0.05, 12, 4), M.dark, s * 0.75, 8.3, cz, PI / 2, 0, 0);
      B.add(cyl(0.6, 0.6, 0.4, 10), M.iron, 0, 7.7, cz - 3);                                    // filler hatch
      for (let i = 0; i < 7; i++) B.add(slab(0.7, 0.07, 0.07, 0.02), M.dark, 2.75, 2.5 + i * 0.75, cz + 5.9);
      patches(B, M, rng, 2.62, 4.85, cz, 2.2, 9, 2, lod);
    }
  }
  if (!lod) ribbonPole(B, M, rng, -2, 6.6, tz + 2.8, 6, lod);
}
function trikeBody(B, M, rng, lod) {
  // Thimble: a small resupply trike: a cab over the front wheel, a cargo box, two big rear wheels
  B.add(slab(2.8, 2.6, 3.2, lod ? 0 : 0.35), M.wakeCream, 0, 2.6, -2.6);
  B.add(slab(2.4, 0.9, 0.1, 0.04), M.darkGlass, 0, 3.2, -4.22);
  B.add(slab(3.8, 2.8, 4.6, lod ? 0 : 0.35), M.wake, 0, 2.6, 1.6);
  B.add(slab(4.0, 0.12, 4.8, lod ? 0 : 0.03), M.canvasRed, 0, 4.2, 1.6, 0.06, 0, 0);
  B.add(cyl(0.9, 0.9, 0.7, lod ? 8 : 14), M.rubber, 0, 0.9, -3.6, 0, 0, PI / 2);
  for (const s of [-1, 1]) B.add(cyl(1.4, 1.4, 1.0, lod ? 8 : 16), M.rubber, s * 2.4, 1.4, 2.4, 0, 0, PI / 2);
  if (!lod) {
    for (const s of [-1, 1]) B.add(cyl(0.9, 0.9, 1.06, 12), M.iron, s * 2.4, 1.4, 2.4, 0, 0, PI / 2);
    for (let i = 0; i < 3; i++) B.add(slab(1.0, 0.6, 0.8, 0.06), [M.drum, M.wakeRed, M.wakeCream][i], -1 + i, 4.6, 0.6 + (i % 2), 0, 0.2 * i, 0);
    ribbonPole(B, M, rng, 1.6, 4.0, 3.4, 4, lod);
    B.add(slab(0.1, 0.5, 1.2, 0.03), M.tungsten, 1.41, 3.0, -2.6);
  }
}
function benchBody(B, M, rng, lod) {
  // the Bench: a long workshop crawler with two crane arms over a cradle at the back, canvas walls, the work lamp
  crawlerBody(B, M, rng, { len: 20 }, lod);
  for (const s of [-1, 1]) {
    B.add(slab(0.7, 0.7, 11, lod ? 0 : 0.12), M.hazard, s * 2.4, 12.6, 3.5, -0.42, 0, 0);
    if (!lod) B.add(cyl(0.12, 0.12, 6, 6), M.cable, s * 2.4, 11.6, 7.8);
  }
  B.add(cyl(0.6, 0.4, 0.8, 10), M.dark, 0, 14.4, 7.6);
  B.add(cyl(0.4, 0.4, 0.06, 10), M.tungsten, 0, 13.98, 7.6);
  if (!lod) for (let i = 0; i < 5; i++) B.add(slab(0.3, 2.4, 1.4, 0.05), [M.oxide, M.iron, M.ceramicAged][i % 3], -4.0, 6.4, -4 + i * 1.8);
}

/** cached builds: { parts: [{ geo, mat }], lod: geometry, anchors } */
const CACHE = new WeakMap();
export function rigModel(ctx, kind) {
  let c = CACHE.get(ctx); if (!c) { c = new Map(); CACHE.set(ctx, c); }
  if (c.has(kind)) return c.get(kind);
  const M = mats2(ctx);
  const fill = (B, lod) => {
    const rng = rngFor('rig:' + kind);
    switch (kind) {
      case 'crawler': crawlerBody(B, M, rng, {}, lod); if (!lod) ribbonPole(B, M, rng, 2.6, 9.4, 6, 6, lod); break;
      case 'crawler_mast':
        crawlerBody(B, M, rng, {}, lod);
        B.add(cyl(0.22, 0.34, 22, 8), M.dark, -2.2, 16, 1);                                   // the navigator's mast
        B.add(slab(4.6, 0.2, 0.2, 0.04), M.dark, -2.2, 22, 1);
        if (!lod) { for (let i = 0; i < 6; i++) B.add(front([[0, 0], [1.6, -0.4], [0, -0.8]], 0.05, 0.01), RIBBON(M)[i % 4], -2.2 + (i - 2.5) * 0.7, 25.5 - i * 1.8, 1.2, 0, 0.4, 0); }
        B.add(KIT.ring(0.9, 0.1, 0.1, 16), M.gold, -2.2, 26.6, 1, PI / 2, 0, 0);               // the sighting ring
        break;
      case 'walker': walkerBody(B, M, rng, {}, lod); if (!lod) ribbonPole(B, M, rng, -3, 17, 2, 7, lod); break;
      case 'walker_tubs':
        walkerBody(B, M, rng, {}, lod);
        for (const s of [-1, 1]) { B.add(cyl(1.3, 1.5, 1.4, lod ? 8 : 14), M.iron, s * 3.0, 17.2, 2.4); if (!lod) B.add(cyl(0.25, 0.25, 2.4, 8), M.dark, s * 3.0, 17.8, 0.8, PI / 2, 0, 0); }
        break;
      case 'walker_small': walkerBody(B, M, rng, { scale: 0.7 }, lod); if (!lod) ribbonPole(B, M, rng, -2, 12, 1.4, 5, lod); break;
      case 'train': trainBody(B, M, rng, {}, lod); break;
      case 'tanker': tankerBody(B, M, rng, lod); break;
      case 'bench': benchBody(B, M, rng, lod); break;
      case 'trike': trikeBody(B, M, rng, lod); break;
      default: crawlerBody(B, M, rng, {}, lod);
    }
  };
  const remap = new Map([[M.rubber, M.dark], [M.steel, M.iron], [M.cable, M.dark], [M.rust, M.wakeRed], [M.canvasRed, M.wakeRed],
                         [M.drum, M.iron], [M.oxide, M.wakeRed], [M.ceramicAged, M.wakeCream], [M.gold, M.hazard]]);
  const B = new Builder({ remap });
  fill(B, false);
  const parts = B.merged();
  const LB = new Builder({ remap });
  withLod(() => fill(LB, true));
  const lod = LB.single();
  // window lamps (dim in daylight): glow anchors at the cab glazing
  const d = RIG_DIMS[kind] || RIG_DIMS.crawler;
  const e = { parts, lod, dims: d, tris: B.tris };
  c.set(kind, e);
  return e;
}

/** where a name sign goes on each kind (x on the right flank, y, z) */
const SIGN_AT = {
  crawler: [3.78, 3.9, 0, 7, 1.0], crawler_mast: [3.78, 3.9, 0, 7, 1.0], bench: [3.78, 3.9, 0, 7, 1.0],
  walker: [4.8, 9.0, 0, 7, 1.0], walker_tubs: [4.8, 9.0, 0, 7, 1.0], walker_small: [3.4, 6.4, 0, 5, 0.8],
  train: [3.03, 1.75, 6.5, 6, 0.75], tanker: [2.64, 4.85, -1.5, 8, 1.1], trike: [1.92, 2.6, 1.6, 3.6, 0.6],
};

// ════════════════════════════════════════════════════════════════════════════════════ one named rig
export class RigView {
  constructor(ctx, kind, name, o = {}) {
    this.ctx = ctx; this.kind = kind; this.name = name;
    const b = rigModel(ctx, kind);
    const M = mats2(ctx);
    const near = new THREE.Group();
    for (const { geo, mat } of b.parts) {
      const m = new THREE.Mesh(geo, mat);
      const glowy = mat.emissive && mat.color && mat.color.r + mat.color.g + mat.color.b < 0.05;
      m.castShadow = !glowy && o.shadows !== false; m.receiveShadow = !glowy;
      near.add(m);
    }
    if (name) {
      const [x, y, z, w, h] = SIGN_AT[kind] || SIGN_AT.crawler;
      for (const s of [-1, 1]) {
        const sg = signMesh(ctx, name.toUpperCase(), w, h, { bg: '#4f8a86', color: '#efe4cc', weathered: 0.55, w: 512, h: 96 });
        if (sg) { sg.position.set(s * x, y, z); sg.rotation.y = s * PI / 2; sg.castShadow = false; near.add(sg); }
      }
    }
    const far = new THREE.Mesh(b.lod, M.lod); far.castShadow = false; far.receiveShadow = true;
    this.root = new THREE.LOD();
    this.root.addLevel(near, 0);
    this.root.addLevel(far, o.lodDist ?? 300);
    this.root.addLevel(new THREE.Object3D(), o.hideDist ?? 2600);
    this.root.name = 'rig:' + (name || kind);
    this.root.matrixAutoUpdate = true;
    this.near = near; this.dims = b.dims;
    // the window lamps: a warm glow at the front glazing (dim in daylight), through P1's glows when present
    const G = ctx.particles?.glows;
    this.glow = null;
    if (G?.add && o.lamp !== false) {
      const a = new THREE.Object3D(); a.position.set(0, (b.dims.h || 8) * 0.55, -(b.dims.len || 18) * 0.42); near.add(a);
      this.glow = G.add(a, { color: '#ffb36b', size: 1.2, intensity: 1.2, pulse: 'flicker', minPx: 1 });
    }
  }
  dispose() { this.glow?.remove?.(); this.root.parent?.remove(this.root); }
}

// ════════════════════════════════════════════════════════════════════════════════════ the generic rigs, instanced
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export class RigInstances {
  /** kinds: { kind: count } */
  constructor(ctx, kinds) {
    this.ctx = ctx;
    this.groups = {};
    this.root = new THREE.Group(); this.root.name = 'rigInstances';
    for (const [kind, n] of Object.entries(kinds)) {
      if (!n) continue;
      const b = rigModel(ctx, kind);
      const meshes = b.parts.map(({ geo, mat }) => {
        const m = new THREE.InstancedMesh(geo, mat, n);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const glowy = mat.emissive && mat.color && mat.color.r + mat.color.g + mat.color.b < 0.05;
        m.castShadow = !glowy; m.receiveShadow = !glowy;
        m.frustumCulled = false; m.count = 0;
        this.root.add(m);
        return m;
      });
      this.groups[kind] = { meshes, cap: n, count: 0 };
    }
    ctx.levelRoot.add(this.root);
  }
  begin() { for (const g of Object.values(this.groups)) g.count = 0; }
  /** add one instance this frame (pos, yaw, pitch, roll, tint 0..1 multipliers) */
  push(kind, pos, yaw, pitch, roll, tint) {
    const g = this.groups[kind]; if (!g || g.count >= g.cap) return;
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _m4.compose(pos, _q, _s);
    const i = g.count++;
    for (const m of g.meshes) { m.setMatrixAt(i, _m4); if (tint) m.setColorAt(i, tint); }
  }
  end() {
    for (const g of Object.values(this.groups)) for (const m of g.meshes) {
      m.count = g.count; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere?.();
    }
  }
  dispose() { this.root.parent?.remove(this.root); for (const g of Object.values(this.groups)) for (const m of g.meshes) m.dispose?.(); }
}
