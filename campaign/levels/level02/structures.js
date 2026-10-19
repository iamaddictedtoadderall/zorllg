// levels/level02/structures.js — Level 2's structure types (L2 §12), registered with ctx.structures before World.load
// places the zones (the `zones` getter in levels/level02.js), plus Level 1's tank_cairn and wake_lamp (ensureL1Structures).
// Built from the kit (bevelled plates, lathes, lofts), merged to one mesh per material: every type is ≤ 6 draw calls at
// LOD0 (signs count) with a single vertex-coloured LOD1; `sundial` is the set piece (L2 §12.3; its blade is runtime,
// levels/level02/sundial.js, because it must read from every point of the route). Geometry is cached per type + params.
//
// Conventions (Level 1's): local origin at the centre of the base; local -Z is the type's front; colliders are local;
// footprints never flatten (Level 2's terrain is authored with explicit stamps).
import * as THREE from 'three';
import * as KIT from '../../src/art/kit.js';
import { Builder, mats2, slab, side, front, top, cyl, ball, torus, rock, chamferRect, glowAnchor, rngFor, withLod,
         part, pal, fp, q5, PI } from './kit2.js';
import { ensureL1Structures, signMesh } from '../level01/structures.js';
import { flat } from '../level01/models.js';
import { yachtModel, skimmerModel } from './models.js';
import { SUNDIAL_TYPE } from './sundial.js';

const TYPES = {};
function type(name, d) { TYPES[name] = d; }
const P = (d, p) => ({ ...(d.params || {}), ...(p || {}) });
const FOUNDERS_FONT = '600 64px "Iowan Old Style", Georgia, "Times New Roman", serif';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII',
               'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV'];

// ════════════════════════════════════════════════════════════════════════════════════ turbine ruins (Z1, Z2, Z4)
// A colony wind turbine: a tapered tower in flanged sections with rust streaks and an access door, a rounded nacelle
// (split open on some seeds), 0 to 3 blades stopped at odd angles (some snapped), one blade lying in the reeds.
// Fallen: the tower on its side in a shallow trench, broken in two, the nacelle half buried, 4 to 7 m tall (cover).
function towerR(h, y) { return 3.0 - 1.4 * (y / h); }
/** add every part of builder `src` to `B` under a transform (position, Euler YXZ) */
function mergeInto(B, src, pos, rot) {
  const m4 = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(1, 1, 1));
  for (const [mat, list] of src.groups) for (const g of list) B.addM(g, mat, m4);
}
function blade(B, M, len, x, y, z, roll, snapped, lod) {
  const L = snapped ? len * snapped : len;
  const pts = snapped
    ? [[-1.2, 1.0], [-1.7, Math.min(6, L * 0.5)], [-1.1, L * 0.92], [-0.3, L], [0.4, L * 0.86], [0.9, L * 0.97], [1.5, Math.min(7, L * 0.55)], [1.1, 1.0]]
    : [[-1.2, 1.0], [-1.7, 6], [-0.35, L], [0.3, L], [1.6, 7], [1.1, 1.0]];
  B.add(front(pts.map(([a, b]) => [q5(a * 2) / 2, q5(b)]), 0.6, lod ? 0 : 0.12), M.paint, x, y, z, 0, 0, roll);
  if (!lod) B.add(front([[-0.25, 1.0], [-0.3, L * 0.7], [0.3, L * 0.7], [0.25, 1.0]].map(([a, b]) => [a, q5(b)]), 0.66, 0.02), M.rustDark, x, y, z, 0, 0, roll);
}
function nacelle(B, M, rng, split, lod) {
  const prof = [[-6.0, -1.6], [-6.5, 0], [-6.0, 1.6], [5.0, 1.9], [6.4, 0.8], [6.4, -1.0], [5.0, -1.8]];
  if (split && !lod) {
    // split open: the two shells lean apart, the gearbox shows
    B.add(side(prof, 1.5, 0.22), M.paint, -1.3, 0, 0, 0, 0, -0.18);
    B.add(side(prof, 1.5, 0.22), M.paint, 1.3, -0.1, 0, 0, 0, 0.12);
    B.add(cyl(0.9, 0.9, 6.5, 12), M.dark, 0, 0, -0.5, PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) B.add(cyl(0.6, 0.6, 0.8, 10), M.iron, 0, 0.6, -2 + i * 1.8, 0, 0, PI / 2);
  } else {
    B.add(side(prof, 3.8, lod ? 0 : 0.28), M.paint, 0, 0, 0);
    if (!lod) {
      B.add(side([[-5.2, -1.62], [4.6, -1.62], [4.6, -1.2], [-5.2, -1.2]], 3.9, 0.05), M.rustDark, 0, 0, 0);
      B.add(KIT.greeble('vent', 1.6, 0.8, 0.3), M.dark, 1.92, 0.4, 3.2, 0, PI / 2, 0);
      B.add(KIT.greeble('vent', 1.6, 0.8, 0.3), M.dark, -1.92, 0.4, 3.2, 0, -PI / 2, 0);
    }
  }
  B.add(cyl(0.5, 1.45, 2.6, lod ? 8 : 14), M.paint, 0, 0, -7.7, -PI / 2, 0, 0);       // hub nose
}
type('turbine_ruin', {
  params: { h: 80, blades: 2, fallen: false, seed: 1 },
  footprint: (p) => (p.fallen ? fp('rect', 12, p.h + 20) : fp('circle', 8)),
  colliders: (p) => p.fallen
    ? [{ type: 'obox', x: 0, z: p.h * 0.2, hw: 2.8, hd: p.h * 0.32, yaw: 0, top: 4.6 },
       { type: 'obox', x: 1.2, z: -p.h * 0.32, hw: 3.2, hd: p.h * 0.2 + 5, yaw: 0.12, top: 5.4 }]
    : [{ type: 'circle', x: 0, z: 0, r: 3.2, top: p.h }],
  build(ctx, p) {
    const M = mats2(ctx);
    const remap = pal([[M.steel, M.iron], [M.cable, M.dark]]);
    const fill = (B, lod) => {
      const rng = rngFor('turbine' + p.seed + ':' + p.h);
      const split = p.seed % 3 === 0;
      const len = Math.round(p.h * 0.42);
      if (!p.fallen) {
        // the foundation pad and the tower: four flanged sections, tapering
        B.add(top(chamferRect(9, 9, 1.4), 1.2, lod ? 0 : 0.3), M.concrete, 0, 0.3, 0);
        const N = lod ? 1 : 4;
        for (let i = 0; i < N; i++) {
          const y0 = (i / N) * p.h, y1 = ((i + 1) / N) * p.h;
          B.add(KIT.latheHard([[0, y0], [towerR(p.h, y0), y0], [towerR(p.h, y1), y1], [0, y1]], lod ? 10 : 22), M.paint, 0, 0, 0);
          if (!lod && i > 0) B.add(KIT.ring(towerR(p.h, y0) + 0.08, 0.32, 0.4), M.iron, 0, y0, 0);
        }
        if (!lod) {
          // rust bleeding down from the flanges and the door, an access door, a ladder cage seam
          for (let i = 0; i < 9; i++) {
            const y = p.h * (0.15 + rng() * 0.75), a = rng() * PI * 2, r = towerR(p.h, y) + 0.02, hh = q5(3 + rng() * 7);
            B.add(slab(0.3 + rng() * 0.4, hh, 0.05, 0.01), M.rustDark, Math.sin(a) * r, y - hh / 2, Math.cos(a) * r, 0, a, 0);
          }
          B.add(front(chamferRect(1.5, 2.6, 0.4), 0.3, 0.06), M.dark, 0, 2.4, -2.96);
          B.add(front(chamferRect(1.9, 3.0, 0.5), 0.18, 0.05), M.iron, 0, 2.4, -2.92);
          B.add(slab(1.0, 0.18, 0.4, 0.04), M.hazard, 0, 4.1, -3.0);
        }
        // the nacelle, yawed a little off the tower's axis, the hub and its blades
        const yaw = (rng() - 0.5) * 0.6;
        const NB = new Builder();
        nacelle(NB, M, rng, split, lod);
        for (let i = 0; i < p.blades; i++) {
          const roll = (i / 3) * PI * 2 + rng() * 0.8 + 0.3;
          const snapped = i === 2 || (i === 1 && p.seed % 2) ? 0.35 + rng() * 0.3 : 0;
          blade(NB, M, len, 0, 0, -8.4, roll, snapped, lod);
        }
        mergeInto(B, NB, [0, p.h + 1.6, 0.8], [0.04, yaw, 0]);
        // a blade that came down, lying in the reeds
        if (p.blades < 3) {
          const LB = new Builder();
          blade(LB, M, len, 0, 0, 0, 0, p.blades === 0 ? 0.7 : 0, lod);
          mergeInto(B, LB, [9 + rng() * 4, 0.45, -4 + rng() * 6], [-PI / 2 + 0.05, rng() * PI, 0]);
        }
      } else {
        // fallen: the tower lies along local z (base at +z) in a shallow trench, broken in two near 60 %
        const r0 = 3.0, br = 0.6;
        const segA = KIT.latheHard([[0, 0], [r0, 0], [towerR(p.h, p.h * br), p.h * br], [0, p.h * br]], lod ? 10 : 22);
        const segB = KIT.latheHard([[0, p.h * br + 2], [towerR(p.h, p.h * br + 2), p.h * br + 2], [1.6, p.h], [0, p.h]], lod ? 10 : 22);
        B.add(segA, M.paint, 0, 2.0, p.h * 0.5, -PI / 2, 0, 0);
        B.add(segB, M.paint, 0.9, 1.7, p.h * 0.5 + 0.0, -PI / 2, 0.12, 0.05);
        if (!lod) {
          for (let i = 1; i < 4; i++) B.add(KIT.ring(towerR(p.h, p.h * i / 4) + 0.08, 0.32, 0.4), M.iron, 0, 2.0, p.h * 0.5 - p.h * i / 4, -PI / 2, 0, 0);
          for (let i = 0; i < 8; i++) {
            const z = p.h * 0.5 - rng() * p.h * 0.55, a = (rng() - 0.5) * 2.2;
            B.add(slab(0.4 + rng() * 0.4, 0.05, q5(2 + rng() * 5), 0.01), M.rustDark, Math.sin(a) * 2.6, 2.0 + Math.cos(a) * 2.6, z, 0, 0, -a);
          }
          // the jagged break: torn plate fingers
          for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; B.add(slab(0.5, 0.06, 1.6 + rng() * 1.4, 0.01), M.paint, Math.sin(a) * 2.2, 2.0 + Math.cos(a) * 2.2, p.h * 0.5 - p.h * br - 1.0, 0, 0, -a); }
          B.add(top(chamferRect(8, 9, 1.4), 1.0, 0.25), M.concrete, 0, 0.2, p.h * 0.5 + 2.5, 0.3, 0, 0);   // the pad, tipped up
        }
        // the nacelle half buried at the top end, a blade stuck up at an angle, another flat in the reeds
        const NB = new Builder();
        nacelle(NB, M, rng, split, lod);
        blade(NB, M, len, 0, 0, -8.4, 0.5 + rng() * 0.4, 0.5, lod);
        mergeInto(B, NB, [1.6, 1.0, -p.h * 0.5 - 6.5], [0.08, 0.3, 0.45]);
      }
    };
    return part(ctx, `turbine:${p.h}:${p.blades}:${p.seed}:${p.fallen ? 1 : 0}`, fill, { lod: true, remap });
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ substation ruin (Z4)
// Founders ceramic walls 3 to 5 m tall with broken tops and soft chamfers, dead gold seam strips, cable ducts, rubble.
// 40 m (x) by 25 m (z); a doorway gap on the front (-z) wall. The transformer pods are placed by the zone.
const SUB_WALLS = [ // [x0, z0, x1, z1, h]
  [-20, 12.5, 20, 12.5, 4.6], [-20, -12.5, -20, 12.5, 4.0], [20, -12.5, 20, 12.5, 3.4],
  [-20, -12.5, -4, -12.5, 4.4], [4, -12.5, 20, -12.5, 3.2], [6, -3, 6, 9, 3.6] ];
type('substation_ruin', {
  params: {},
  footprint: () => fp('rect', 44, 30),
  colliders: () => SUB_WALLS.map(([x0, z0, x1, z1, h]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    return { type: 'obox', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: 0.7, hd: len / 2 + 0.6, yaw: Math.atan2(x1 - x0, z1 - z0), top: h * 0.85 };
  }),
  build(ctx) {
    const M = mats2(ctx);
    const remap = pal([[M.ceramic, M.ceramicAged], [M.steel, M.iron], [M.gold, M.goldDead]]);
    return part(ctx, 'substation', (B, lod) => {
      const rng = rngFor('substation');
      for (const [x0, z0, x1, z1, h] of SUB_WALLS) {
        const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
        // the wall as a front profile along its length with a broken top, extruded 1.2 m thick
        const pts = [[-len / 2, 0]];
        const n = Math.max(3, Math.round(len / 4));
        for (let i = 0; i <= n; i++) {
          const x = -len / 2 + (i / n) * len;
          const broken = rng() < 0.45 ? h * (0.45 + rng() * 0.35) : h * (0.92 + rng() * 0.08);
          pts.push([q5(x * 2) / 2, q5(broken * 2) / 2]);
        }
        pts.push([len / 2, 0]);
        const g = front(pts, 1.2, lod ? 0 : 0.18);
        B.add(g, M.ceramicAged, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, yaw + PI / 2, 0);
        if (!lod) {
          B.add(slab(len * 0.9, 0.16, 1.26, 0.03), M.goldDead, (x0 + x1) / 2, Math.min(2.2, h * 0.45), (z0 + z1) / 2, 0, yaw + PI / 2, 0);
          B.add(slab(len + 0.4, 0.5, 1.6, 0.12), M.ceramic, (x0 + x1) / 2, 0.25, (z0 + z1) / 2, 0, yaw + PI / 2, 0);   // plinth course
        }
      }
      if (!lod) {
        // cable ducts from the pods to the back wall, broken floor slabs, rubble
        for (const x of [-6, 4]) { B.add(cyl(0.45, 0.45, 16, 10), M.iron, x, 0.4, 4, PI / 2, 0, 0); B.add(KIT.ring(0.5, 0.22, 0.4), M.dark, x, 0.4, 0, PI / 2, 0, 0); }
        for (let i = 0; i < 10; i++) B.add(slab(q5(3 + rng() * 3), 0.3, q5(3 + rng() * 3), 0.08), M.ceramicAged, -16 + rng() * 32, 0.1, -10 + rng() * 20, (rng() - 0.5) * 0.08, rng() * PI, (rng() - 0.5) * 0.08);
        for (let i = 0; i < 14; i++) { const s = 0.6 + rng() * 1.2; B.add(rock(7 + i, { squash: 0.6 }), M.ceramicAged, -21 + rng() * 42, 0.3, (rng() < 0.5 ? -13.5 : 13.5) + (rng() - 0.5) * 3, rng(), rng() * 6, 0, s, s * 0.7, s); }
      }
    }, { lod: true, remap });
  },
});

// Founders transformer pods (L2: the substation's and the waystation's): Level 1's pod without its snow, standing on a
// scoured footing in the reeds.
type('transformer_pod', {
  params: { size: 1 },
  footprint: (p) => fp('rect', 5 * p.size, 9 * p.size),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 1.9 * p.size, hd: 4.1 * p.size, yaw: 0, top: 3.0 * p.size }],
  build(ctx, p) {
    const M = mats2(ctx), s = p.size;
    return part(ctx, 'tpod:' + s, (B, lod) => {
      B.add(front(chamferRect(3.6 * s, 3.6 * s, 0.9 * s), 7.0 * s, lod ? 0 : 0.4 * s), M.ceramicWarm, 0, 1.2 * s, 0);
      for (const z of [-1, 1]) B.add(front(chamferRect(3.3 * s, 3.3 * s, 0.8 * s), 0.7 * s, 0.25 * s), M.ceramicAged, 0, 1.2 * s, z * 3.75 * s);
      for (const z of [-2.2, 0, 2.2]) B.add(front(chamferRect(3.75 * s, 3.75 * s, 0.95 * s), 0.12, 0.04), M.goldDead, 0, 1.2 * s, z * s);
      if (!lod) for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; B.add(ball(0.12 * s, 6, 4), M.goldDead, 1.83 * s, 1.2 * s + Math.sin(a) * 0.7 * s, Math.cos(a) * 0.7 * s); }
      B.add(top(chamferRect(4.6 * s, 8.6 * s, 0.6), 0.5, 0.15), M.sandstone, 0, -0.1, 0);
      if (!lod) for (const z of [-1, 1]) B.add(cyl(0.3, 0.3, 1.4, 8), M.iron, 0, 2.8 * s, z * 2.6 * s);
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ wrecks (Z2, Z4)
// An old land-yacht wreck on its side, mast snapped, sail torn, half sunk in the reeds (no fire). Holds the salvage cache.
type('yacht_wreck', {
  params: { seed: 7 },
  footprint: () => fp('rect', 12, 22),
  colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 2.4, hd: 9, yaw: 0, top: 3.4 }],
  build(ctx, p) {
    const M = mats2(ctx);
    const remap = pal([[M.oxide, M.rust], [M.sail, M.rustDark], [M.amber, M.dark], [M.sodium, M.dark], [M.darkGlass, M.dark],
                       [M.steel, M.iron], [M.cable, M.dark], [M.rubber, M.dark], [M.hazard, M.rust]]);
    return part(ctx, 'yacht_wreck:' + p.seed, (B, lod) => {
      const model = yachtModel(ctx, 'raker');
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.9, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, 1.25, 'YXZ')), new THREE.Vector3(1, 1, 1));
      // the mast snapped and lying back along the hull, the sail torn half away, a wheel off
      const poses = { mast: { rot: [1.35, 0, 0.2] }, sail: { rot: [0.3, 0, 0.5] }, wheelR: { rot: [0, 0, 0.4] } };
      const keep = { ...model, parts: { ...model.parts } };
      if (lod) { delete keep.parts.fan; delete keep.parts.gun; }
      flat(B, keep, m4, poses);
      if (!lod) {
        const rng = rngFor('yw' + p.seed);
        for (let i = 0; i < 5; i++) B.add(side([[0, 0], [0.6, 1.6 + rng()], [1.8, 1.2], [1.4, 0]], 0.06, 0.01), M.sail, 2 + rng() * 3, 0.2, -6 + rng() * 10, rng(), rng() * 6, rng());
        B.add(rock(31, { squash: 0.4 }), M.sandstone, -2.5, 0.2, 3, 0, 1, 0, 3.4, 1.2, 4.5);   // the reed bank it slid into
      }
    }, { lod: true, remap });
  },
});

// A stripped Wake crawler (the BELLWETHER): canvas rotted to ribs, wheels gone, a track lying beside it, its painted name.
type('rig_wreck', {
  params: { name: '', seed: 1 },
  footprint: () => fp('rect', 16, 26),
  colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 5.2, hd: 10.5, yaw: 0, top: 6.5 }, { type: 'obox', x: -8, z: 2, hw: 1.6, hd: 9, yaw: 0.08, top: 2.4 }],
  build(ctx, p) {
    const M = mats2(ctx);
    const remap = pal([[M.wake, M.wakeFaded], [M.rubber, M.dark], [M.iron, M.dark], [M.canvas, M.canvasRed]]);
    const r = part(ctx, 'rig_wreck:' + p.seed, (B, lod) => {
      const rng = rngFor('rigw' + p.seed);
      B.add(slab(10.2, 4.0, 20, lod ? 0 : 0.45), M.wakeFaded, 0, 3.2, 0, 0.02, 0, 0.04);
      B.add(slab(8.2, 3.2, 8, lod ? 0 : 0.35), M.wakeCream, -0.5, 6.4, -5, 0.06, 0.04, -0.12);      // the house, sagging
      // one track still on, the other lying beside it in the reeds
      B.add(side([[-11, 0.3], [-10.4, 2.6], [10.4, 2.6], [11, 0.3], [10.2, -0.1], [-10.2, -0.1]], 2.6, lod ? 0 : 0.3), M.dark, 4.0, 0, 0);
      B.add(side([[-10, 0.3], [-9.6, 2.2], [9.6, 2.2], [10, 0.3], [9.2, -0.1], [-9.2, -0.1]], 2.4, lod ? 0 : 0.3), M.dark, -8.2, -0.4, 2.0, 0, 0.08, 1.35);
      if (!lod) {
        // the empty wheel wells and the canvas ribs over the rear deck, rag remnants
        for (let i = 0; i < 6; i++) B.add(cyl(0.95, 0.95, 0.6, 12), M.dark, -5.4, 1.2, -8 + i * 3.2, 0, 0, PI / 2);
        for (let i = 0; i < 6; i++) {
          const z = 1.5 + i * 1.7;
          B.add(KIT.ring(4.4, 0.2, 0.2, 18), M.dark, 0, 5.2, z, PI / 2, 0, 0);
          if (rng() < 0.5) B.add(slab(0.06, 1.2 + rng() * 1.2, 1.5, 0.01), M.canvasRed, (rng() - 0.5) * 6, 7 + rng(), z, 0, 0, (rng() - 0.5) * 1.2);
        }
        for (let i = 0; i < 7; i++) B.add(slab(q5(0.8 + rng() * 1.6), q5(0.6 + rng()), 0.1, 0.03), [M.canvasRed, M.wakeCream, M.wakeCream][i % 3], 5.15, 3.0 + (rng() - 0.5) * 2.4, -8 + rng() * 16, 0, PI / 2, 0);
        B.add(KIT.greebles(() => 0.53, 2.0, 1.0, 1.0), M.dark, 0, 3.5, 10.05);
      }
    }, { lod: true, remap });
    if (p.name) {
      const s = signMesh(ctx, p.name, 6.4, 1.0, { bg: '#7a9e98', color: '#efe4cc', weathered: 0.85, w: 512, h: 96 });
      if (s) { s.position.set(5.12, 3.6, 2.5); s.rotation.y = PI / 2; r.root.add(s); }
    }
    return r;
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ the old road (Z1 to Z7)
// Founders milestone: a 3 m white ceramic post with soft chamfers, a gold band and its number in Founders' type.
type('road_marker', {
  params: { n: 0 },
  footprint: () => fp('circle', 1.2, null, 1),
  colliders: () => [{ type: 'circle', x: 0, z: 0, r: 0.5, top: 3.2 }],
  build(ctx, p) {
    const M = mats2(ctx);
    const r = part(ctx, 'road_marker', (B, lod) => {
      B.add(top(chamferRect(1.2, 1.2, 0.25), 0.4, lod ? 0 : 0.1), M.ceramicAged, 0, 0.2, 0);
      B.add(top(chamferRect(0.7, 0.7, 0.16), 2.7, lod ? 0 : 0.08), M.ceramicWarm, 0, 1.75, 0);
      B.add(top(chamferRect(0.78, 0.78, 0.18), 0.2, 0.04), M.gold, 0, 2.45, 0);
      B.add(top(chamferRect(0.5, 0.5, 0.15), 0.3, 0.08), M.ceramicWarm, 0, 3.2, 0);
    }, { lod: true });
    for (const [x, z, ry] of [[-0.36, 0, -PI / 2], [0, -0.36, PI]]) {
      const s = signMesh(ctx, String(p.n), 0.5, 0.42, { bg: '#ece4d4', color: '#7a6230', font: FOUNDERS_FONT, w: 128, h: 108 });
      if (s) { s.position.set(x * 1.03, 1.85, z * 1.03); s.rotation.y = ry; r.root.add(s); }
    }
    return r;
  },
});

// A low white ceramic culvert by the creek, half silted: an arched barrel across the road bank with headwalls.
type('road_culvert', {
  params: { span: 18 },
  footprint: (p) => fp('rect', p.span + 4, 12),
  colliders: (p) => [{ type: 'box', minx: -p.span / 2, maxx: p.span / 2, minz: -3.6, maxz: 3.6, top: 3.8 }],
  build(ctx, p) {
    const M = mats2(ctx);
    return part(ctx, 'culvert:' + p.span, (B, lod) => {
      const arch = (r0, r1, n) => {
        const pts = [];
        for (let i = 0; i <= n; i++) { const a = PI * i / n; pts.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
        for (let i = n; i >= 0; i--) { const a = PI * i / n; pts.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
        return pts.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
      };
      B.add(side(arch(3.0, 3.6, lod ? 6 : 14), p.span, lod ? 0 : 0.12), M.ceramicWarm, 0, 0, 0);
      for (const sx of [-1, 1]) {
        const wall = KIT.plateGeo([[-6, 0], [6, 0], [6, 4.8], [-6, 4.8]], 0.9, 'side', lod ? 0 : 0.18,
                                  { holes: lod ? [] : [arch(0, 3.05, 12).slice(0, 13).reverse()] });
        B.add(wall, M.ceramicAged, sx * (p.span / 2 + 0.45), 0, 0);
        B.add(slab(1.1, 0.25, 12.4, 0.06), M.goldDead, sx * (p.span / 2 + 0.45), 4.75, 0);
      }
      if (!lod) {
        B.add(rock(41, { squash: 0.35 }), M.sandstone, 0, 0.2, 0, 0, 0, 0, p.span * 0.45, 1.6, 2.6);   // the silt
        for (const sx of [-1, 1]) B.add(rock(43, { squash: 0.4 }), M.sandstone, sx * (p.span / 2 + 2.5), 0.3, (sx > 0 ? 1 : -1) * 2, 0, sx, 0, 3, 1.4, 2.4);
      }
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ the Watcher's Ridge (Z3)
// The Watcher's stand: layered sandstone slabs with a clean flat top (and a collider for the frame to stand on).
type('rock_shelf', {
  params: { w: 24, d: 14 },
  footprint: (p) => fp('rect', p.w + 6, p.d + 6),
  colliders: (p) => [{ type: 'box', minx: -p.w / 2, maxx: p.w / 2, minz: -p.d / 2, maxz: p.d / 2, top: 4.2 }],
  build(ctx, p) {
    const M = mats2(ctx);
    return part(ctx, `shelf:${p.w}:${p.d}`, (B, lod) => {
      const rng = rngFor('shelf');
      // strata: three layered slabs stepping back, each a squashed faceted rock, then the flat cap
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.12;
        B.add(rock(60 + i, { squash: 0.3, cuts: 8 }), M.sandstone, (rng() - 0.5) * 2, 0.6 + i * 1.3, (rng() - 0.5) * 2, 0, rng() * 0.4, 0, p.w * 0.55 * k, 1.8, p.d * 0.6 * k);
      }
      B.add(top(chamferRect(p.w * 0.92, p.d * 0.9, 2.2), 0.9, lod ? 0 : 0.3), M.sandstone, 0, 3.75, 0);
      if (!lod) for (let i = 0; i < 6; i++) { const s = 1 + rng() * 2; B.add(rock(70 + i), M.rock, (rng() - 0.5) * p.w, 0.4, (rng() < 0.5 ? -1 : 1) * (p.d / 2 + 1.5), rng(), rng() * 6, 0, s, s * 0.7, s); }
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ water caches (Z3, Z7)
// Three Wake tanks under a reed-mat tarp, staked; an old convoy's paint on the middle one.
type('water_cache', {
  params: { paint: '' },
  footprint: () => fp('rect', 6, 8, 2),
  colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 2.0, hd: 3.2, yaw: 0, top: 2.2 }],
  anchors: () => ({ flag: [2.6, 0, -3.6] }),
  build(ctx, p) {
    const M = mats2(ctx);
    const r = part(ctx, 'water_cache', (B, lod) => {
      [[M.wake, -1.95], [M.drum, 0], [M.wakeRed, 1.95]].forEach(([m, z]) => {
        B.add(cyl(0.88, 0.88, 3.0, lod ? 8 : 16), m, 0, 0.9, z, 0, 0, PI / 2);
        if (!lod) for (const x of [-1.2, 1.2]) B.add(torus(0.89, 0.06, 4, 16), M.dark, x, 0.9, z, 0, PI / 2, 0);
        if (!lod) B.add(slab(0.7, 0.16, 0.16, 0.04), M.dark, 0, 1.82, z);
      });
      // the reed mat over the top, sagging between the tanks, its edges pegged down with rope
      B.add(slab(3.6, 0.12, 6.8, lod ? 0 : 0.04), M.reedMat, 0, 1.95, 0, 0, 0, 0.06);
      if (!lod) {
        for (const sx of [-1, 1]) B.add(slab(0.5, 0.1, 6.6, 0.02), M.reedMat, sx * 2.0, 1.6, 0, 0, 0, sx * 0.9);
        for (const [x, z] of [[-2.4, -3.2], [2.4, -3.2], [-2.4, 3.2], [2.4, 3.2]]) {
          B.add(cyl(0.05, 0.07, 0.9, 5), M.dark, x, 0.35, z, 0.2, 0, x * 0.08);
          B.add(cyl(0.025, 0.025, 1.4, 4), M.dark, x * 0.85, 1.1, z * 0.95, 0, 0, x > 0 ? 0.8 : -0.8);
        }
      }
    }, { lod: true });
    if (p.paint) {
      const s = signMesh(ctx, p.paint, 2.4, 0.42, { bg: '#4a5a52', color: '#d8cdb0', weathered: 0.9, w: 512, h: 90 });
      if (s) { s.position.set(-1.5, 0.95, 0); s.rotation.y = -PI / 2; r.root.add(s); }
    }
    return r;
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ the salt flats (Z5)
// A Dredge survey pole: black iron with hazard chevrons and a sodium lamp (so the drag's progress reads).
type('salt_pole', {
  params: {},
  footprint: () => fp('circle', 1, null, 1),
  colliders: () => [{ type: 'circle', x: 0, z: 0, r: 0.3, top: 7 }],
  build(ctx) {
    const M = mats2(ctx);
    const r = part(ctx, 'salt_pole', (B, lod) => {
      B.add(cyl(0.12, 0.16, 7, 8), M.iron, 0, 3.5, 0);
      for (const y of [1.2, 2.4, 3.6, 4.8]) B.add(cyl(0.18, 0.18, 0.5, 8), (y * 10) % 24 < 12 ? M.hazard : M.dark, 0, y, 0);
      B.add(slab(0.9, 0.12, 0.12, 0.03), M.iron, 0.35, 6.8, 0);
      B.add(cyl(0.22, 0.16, 0.3, 8), M.dark, 0.75, 6.6, 0);
      B.add(cyl(0.16, 0.16, 0.05, 8), M.sodium, 0.75, 6.44, 0);
      B.add(top(chamferRect(0.9, 0.9, 0.2), 0.3, 0.06), M.iron, 0, 0.15, 0);
    }, { lod: true });
    const a = new THREE.Object3D(); a.position.set(0.75, 6.38, 0); glowAnchor(a, { color: '#ff9a2e', size: 1.6, intensity: 2.5, pulse: 'flicker' }); r.root.add(a);
    return r;
  },
});

// The Dredge skimmer ramp: a black iron ramp up the crust lip to a dock on legs, chevrons, sodium lamps, two parked
// Skimmers. The ramp climbs toward local -z; the dock sits on top at +8 m.
type('skimmer_ramp', {
  params: {},
  footprint: () => fp('rect', 24, 50),
  colliders: () => [
    { type: 'obox', x: 0, z: 10, hw: 5.2, hd: 6, yaw: 0, top: 2.6 },
    { type: 'obox', x: 0, z: 0, hw: 5.2, hd: 5, yaw: 0, top: 5.4 },
    { type: 'obox', x: 0, z: -14, hw: 9, hd: 8, yaw: 0, top: 8.2 } ],
  build(ctx) {
    const M = mats2(ctx);
    const remap = pal([[M.steel, M.iron], [M.cable, M.dark], [M.rubber, M.dark], [M.darkGlass, M.dark], [M.jet, M.sodium],
                       [M.ghostLens, M.sodium], [M.concrete, M.iron], [M.tungsten, M.sodium]]);
    const r = part(ctx, 'skimmer_ramp', (B, lod) => {
      // the ramp: a ribbed deck from the salt up to the dock (about 15° over 22 m)
      const ramp = lod ? slab(10, 0.6, 23, 0) : KIT.ribbedPlate(10, 23, 0.4, { pitch: 1.0 });
      B.add(ramp, M.iron, 0, 4.0, 4.5, lod ? -0.36 : PI / 2 - 0.36, 0, 0);
      for (const sx of [-1, 1]) {
        B.add(slab(0.4, 0.8, 23.5, 0.08), M.hazard, sx * 5.0, 4.4, 4.5, -0.36, 0, 0);
        for (let i = 0; i < 4; i++) { const z = 14 - i * 6, y = Math.max(0.5, 8 - (z + 6) * 0.38); B.add(cyl(0.3, 0.35, y + 0.4, 8), M.dark, sx * 4.4, y / 2, z); }
      }
      // the dock: a plated deck on four legs with a hazard rim and a crane stub
      B.add(slab(18, 0.8, 16, lod ? 0 : 0.2), M.iron, 0, 7.8, -14);
      if (!lod) {
        for (const [x, z] of [[-8, -21], [8, -21], [-8, -7], [8, -7]]) B.add(KIT.truss(7.5, 1.2, 1.2, 3, 0.18), M.dark, x, 0, z, 0, 0, PI / 2);
        for (const sx of [-1, 1]) B.add(slab(0.3, 0.5, 16, 0.06), M.hazard, sx * 9, 8.3, -14);
        B.add(slab(18, 0.5, 0.3, 0.06), M.hazard, 0, 8.3, -22);
        B.add(cyl(0.4, 0.5, 6, 8), M.dark, -7, 11, -20); B.add(slab(0.5, 0.5, 8, 0.08), M.oxide, -7, 14, -16.5, 0.2, 0, 0);
      }
      // two parked Skimmers (dressing)
      const sm = skimmerModel(ctx);
      for (const [x, ry] of [[-4, 0.1], [4, -0.2]]) {
        const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, 9.0, -14), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        const keep = lod ? { ...sm, parts: { hull: sm.parts.hull } } : sm;
        flat(B, keep, m4);
      }
    }, { lod: true, remap });
    for (const [x, z] of [[-9, -7], [9, -7], [-9, -21]]) {
      const a = new THREE.Object3D(); a.position.set(x, 10.6, z); glowAnchor(a, { color: '#ff9a2e', size: 2.2, intensity: 2.6, pulse: 'flicker' }); r.root.add(a);
    }
    return r;
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ the colony road (Z6)
// A Founders waystation: a 20 m dome stub with a wedge missing, a cistern ring, a doorway arch, gold seams.
type('waystation_ruin', {
  params: {},
  footprint: () => fp('rect', 30, 30),
  colliders: () => [0, 1, 2, 3].map(i => {
    const a = i * PI / 2 + PI / 4;
    return { type: 'obox', x: Math.sin(a) * 9, z: Math.cos(a) * 9, hw: 5.5, hd: 1.2, yaw: a, top: 6 };
  }).filter((c, i) => i !== 3),
  build(ctx) {
    const M = mats2(ctx);
    return part(ctx, 'waystation', (B, lod) => {
      const rng = rngFor('waystation');
      const seg = lod ? 12 : 28;
      // one closed profile: up the outer face, across the broken rim, down the inner face; a wedge missing
      const outerC = [], innerC = [];
      for (let i = 0; i <= 6; i++) { const t = i / 8 * PI / 2; outerC.push([10.5 * Math.cos(t), 9.2 * Math.sin(t)]); innerC.push([9.7 * Math.cos(t), 8.5 * Math.sin(t)]); }
      const prof = [...outerC, ...innerC.reverse()].map(([r, y]) => [Math.round(r * 100) / 100, Math.round(y * 100) / 100]);
      B.add(KIT.latheHard(prof, seg, { phi0: 0.3, phiLen: PI * 1.55, crease: 50 }), M.ceramicWarm, 0, 0, 0);
      if (!lod) for (const y of [2.6, 5.2]) B.add(KIT.ring(Math.sqrt(Math.max(1, 100 - (y / 9 * 10) ** 2)) + 0.45, 0.25, 0.2, 40), M.goldDead, 0, y, 0);
      // the cistern ring and its broken lid, the doorway arch
      B.add(KIT.ring(4, 1.1, 1.6, lod ? 12 : 32), M.ceramicAged, 15, 0.8, 6);
      if (!lod) B.add(slab(5, 0.4, 3, 0.1), M.ceramic, 15.5, 1.7, 5.2, 0.2, 0.4, 0.1);
      B.add(front([[-2.6, 0], [2.6, 0], [2.6, 5.2], [1.4, 6.4], [-1.4, 6.4], [-2.6, 5.2]], 1.6, lod ? 0 : 0.25), M.ceramicWarm, 0, 0, -10.6);
      if (!lod) {
        B.add(front([[-1.6, 0], [1.6, 0], [1.6, 4.4], [0.9, 5.2], [-0.9, 5.2], [-1.6, 4.4]], 1.7, 0.1), M.dark, 0, 0, -10.62);
        B.add(slab(5.6, 0.2, 1.7, 0.05), M.gold, 0, 6.5, -10.6);
        for (let i = 0; i < 10; i++) { const s = 0.8 + rng() * 1.8, a = -1.4 + rng() * 1.6; B.add(rock(80 + i, { squash: 0.5 }), M.ceramicAged, Math.sin(a) * (11 + rng() * 4), 0.3, Math.cos(a) * (11 + rng() * 4), rng(), rng() * 6, 0, s, s * 0.6, s); }
      }
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════════════ the dial ring (Z7)
// A Founders monolith: a tall tapering slab with soft chamfers, a gold band (two on the road stone), an engraved plaque
// facing the pedestal (local -z), a wind-scoured base.
type('dial_stone', {
  params: { h: 28, road: false, seed: 0 },
  footprint: () => fp('rect', 9, 6),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 3.1, hd: 1.4, yaw: 0, top: p.h }],
  build(ctx, p) {
    const M = mats2(ctx);
    const r = part(ctx, `dial_stone:${p.h}:${p.road ? 1 : 0}:${p.seed % 4}`, (B, lod) => {
      const rng = rngFor('dial' + (p.seed % 4));
      const h = p.h, w0 = 6.2, w1 = 4.8;
      B.add(front([[-w0 / 2, 0], [w0 / 2, 0], [w1 / 2, h - 2.2], [w1 / 2 - 1.0, h], [-w1 / 2 + 1.0, h], [-w1 / 2, h - 2.2]], 2.6, lod ? 0 : 0.42), M.ceramicWarm, 0, 0, 0);
      for (const y of p.road ? [h * 0.62, h * 0.7] : [h * 0.66]) {
        const k = 1 - (y / h) * (1 - w1 / w0);
        B.add(front(chamferRect(w0 * k + 0.12, 0.45, 0.1), 2.72, 0.05), M.gold, 0, y, 0);
      }
      if (!lod) {
        B.add(front(chamferRect(3.0, 2.2, 0.3), 2.64, 0.08), M.ceramicAged, 0, 4.4, 0);    // the plaque's frame (both faces)
        for (let i = 0; i < 6; i++) { const s = 0.9 + rng() * 1.5; B.add(rock(90 + i, { squash: 0.5 }), M.sandstone, (rng() - 0.5) * 7, 0.2, (rng() - 0.5) * 4.5, rng(), rng() * 6, 0, s, s * 0.6, s); }
        B.add(top(chamferRect(7.0, 3.4, 0.9), 0.6, 0.15), M.ceramicAged, 0, 0.1, 0);
      }
    }, { lod: true });
    const label = p.road ? 'ROAD' : ROMAN[Math.round(((p.seed % 360) + 360) % 360 / 15) || 24] || '';
    if (label) {
      const s = signMesh(ctx, label, 2.4, 1.6, { bg: '#ece4d4', color: '#6e5a2c', font: FOUNDERS_FONT, w: 256, h: 170, weathered: 0.35 });
      if (s) { s.position.set(0, 4.4, -1.35); s.rotation.y = PI; r.root.add(s); }
    }
    return r;
  },
});

type('sundial', SUNDIAL_TYPE);

// ════════════════════════════════════════════════════════════════════════════════════ registration
export const L2_STRUCTURE_TYPES = Object.keys(TYPES);
export const L2_TYPE_DEFS = TYPES;
const REGISTERED = new WeakSet();
function wrapped(name) {
  const d = TYPES[name];
  const w = {
    defaults: d.params || {},
    footprint: (p) => d.footprint(P(d, p)),
    colliders: (p) => d.colliders(P(d, p)),
    build: (ctx, p, rng, kit) => d.build(ctx, P(d, p), rng, kit),
  };
  if (d.anchors) w.anchors = (p) => d.anchors(P(d, p));
  if (d.hit) w.hit = (p) => d.hit(P(d, p));
  if (d.states) w.states = d.states;
  if (d.animate) w.animate = d.animate;
  if (d.onRealise) w.onRealise = d.onRealise;
  return w;
}
/**
 * Registers every Level 2 type with ctx.structures, and Level 1's (tank_cairn, wake_lamp). Idempotent per ctx.
 * Returns true when every type is available.
 */
export function ensureL2Structures(ctx) {
  const S = ctx?.structures;
  if (!S?.register || !S.has) return false;
  try { ensureL1Structures(ctx); } catch (e) { console.error('[level02] cannot register Level 1 types', e); }
  const first = !REGISTERED.has(ctx);
  for (const t of L2_STRUCTURE_TYPES) {
    if (!first && S.has(t)) continue;
    try { S.register(t, wrapped(t)); } catch (e) { console.error('[level02] cannot register structure type', t, e); return false; }
  }
  REGISTERED.add(ctx);
  return L2_STRUCTURE_TYPES.every(t => S.has(t)) && S.has('tank_cairn') && S.has('wake_lamp');
}
export { withLod };
