// levels/level01/structures.js (P6) — Level 1's structure types (L1 §11.8; A2 #16: P6 registers every L1 type).
// Built from the kit (levels/level01/kit.js over arch §4 plateGeo/cylinder/pipe), merged to one mesh per material
// (≤ 6 draw calls for ordinary types), with a single-mesh LOD1 for the big ones. Geometry is cached per type + params.
//
// Conventions: local origin at the centre of the base; local -Z is the type's front; long things (ridges, walls,
// cliffs, sledges) run along local Z. Colliders are local (arch §4.3 StructureTypeDef.colliders); long walls are split
// into ~10 m oriented boxes. Footprints never flatten: Level 1's terrain is authored with explicit stamps.
// State handlers restore root.scale (P0's stub squashes destroyed roots) and set their colliders' `enabled` themselves.
import * as THREE from 'three';
import { Builder, cached, instance, meshes, mats, slab, side, front, top, cyl, ball, torus, plane, rock, rect, chamfer,
         chamferRect, blob, compose, glowAnchor, lamp, decal, signTex, rngFor, shared, DEG } from './kit.js';
import { flat, cutterModel, skiffModel, sledModel } from './models.js';
import { abeyanceType } from './abeyance.js';

const PI = Math.PI;
const TYPES = {};
const q5 = (v) => Math.round(v * 2) / 2;          // half-metre quantisation (shares cached plate geometry)

/** register a type definition (params defaults merged in every hook) */
function type(name, d) { TYPES[name] = d; }
const P = (d, p) => ({ ...(d.params || {}), ...(p || {}) });

/** colliders along a local line: oboxes ≤ step long, `thick` wide */
export function segBoxes(x0, z0, x1, z1, thick, top, bottom, step = 10, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / step)), yaw = Math.atan2(x1 - x0, z1 - z0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    out.push({ type: 'obox', x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, hw: thick / 2, hd: len / n / 2 + 0.2, yaw, top, bottom, ...o });
  }
  return out;
}
const fp = (shape, a, b, exclude = 3) => (shape === 'circle' ? { shape, r: a, flatten: false, pad: 10, exclude, h: 'auto' }
                                                              : { shape, w: a, d: b, flatten: false, pad: 10, exclude, h: 'auto' });
/** a group of meshes from a cached build */
function part(ctx, key, make, o = {}) { const b = cached(ctx, key, make, o); const r = instance(ctx, b, o); r.extra = b.extra; return r; }
function setColliders(inst, on) { for (const c of inst.colliders || []) c.enabled = !!on; }
function unsquash(inst) { if (inst.root && inst.root.scale.y !== 1) { inst.root.scale.y = 1; inst.root.updateMatrix(); } }
/** the runtime parts of a realised structure (the root may be a THREE.LOD wrapping the built root as its level 0) */
export function l01Of(root) {
  if (!root) return null;
  if (root.userData?.l01) return root.userData.l01;
  for (const c of root.children || []) if (c.userData?.l01) return c.userData.l01;
  return null;
}
const partsOf = (inst) => l01Of(inst.root) || {};

// sign textures are canvas textures: cache them per ctx and text
const SIGNS = new WeakMap();
function sign(ctx, text, o = {}) {
  let m = SIGNS.get(ctx); if (!m) { m = new Map(); SIGNS.set(ctx, m); }
  const k = text + JSON.stringify(o);
  if (!m.has(k)) { const t = signTex(ctx, text, o); if (t) t.userData.shared = true; m.set(k, t); }
  return m.get(k);
}
const DECALS = new WeakMap();
export function signMesh(ctx, text, w, h, o = {}) {
  const tex = sign(ctx, text, o);
  if (!tex) return null;
  let m = DECALS.get(ctx); if (!m) { m = new Map(); DECALS.set(ctx, m); }
  const k = text + '|' + w + '|' + h + JSON.stringify(o);
  let mesh = m.get(k);
  if (!mesh) { mesh = decal(ctx, tex, w, h, o); mesh.material.userData.shared = true; mesh.geometry.userData.shared = true; m.set(k, mesh); }
  return mesh.clone();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════ Z1 · the cut
type('ice_block', {
  params: { w: 6, h: 3, d: 6 },
  states: {
    intact(inst) { unsquash(inst); setColliders(inst, true); const p = partsOf(inst); if (p.block) p.block.visible = true; },
    destroyed(inst) { unsquash(inst); setColliders(inst, false); const p = partsOf(inst); if (p.block) p.block.visible = false; },
  },
  footprint: (p) => fp('rect', p.w + 2, p.d + 2),
  colliders: (p) => [{ type: 'box', minx: -p.w / 2, maxx: p.w / 2, minz: -p.d / 2, maxz: p.d / 2, top: p.h, surface: 'ice' }],
  hit: (p) => ({ center: [0, p.h / 2, 0], r: Math.max(p.w, p.d) * 0.6 }),
  build(ctx, p) {
    const M = mats(ctx), dye = ctx.materials.standard({ color: '#e0652a', roughness: 0.7, metalness: 0, envMapIntensity: 0.3 });
    const block = part(ctx, `ice_block:${p.w}:${p.h}:${p.d}`, (B) => {
      B.add(slab(p.w, p.h, p.d, 0.3), M.iceClear, 0, p.h / 2 - 0.15, 0, 0.02, 0.05, 0.01);
      B.add(slab(p.w * 0.7, 0.25, p.d * 0.6, 0.1), M.snow, 0.3, p.h - 0.05, -0.2, 0.03, 0.2, 0);
      for (const [x, z, r] of [[p.w * 0.3, -p.d * 0.2, 0.6], [-p.w * 0.25, p.d * 0.3, 0.8]]) B.add(rock(5, { cuts: 9, noise: 0.04 }), M.ice, x, p.h + 0.1, z, 0, 0, 0, r, r * 0.6, r);
    });
    const site = part(ctx, `ice_block_site:${p.w}:${p.d}`, (B) => {
      const W = p.w / 2 + 1.2, D = p.d / 2 + 1.2;
      for (const [x, z, w, d] of [[0, -D, W * 2, 0.3], [0, D, W * 2, 0.3], [-W, 0, 0.3, D * 2], [W, 0, 0.3, D * 2]]) B.add(slab(w, 0.06, d, 0.02), dye, x, 0.03, z);
      for (const [x, z] of [[-W, -D], [W, D]]) {
        B.add(cyl(0.05, 0.06, 3.2, 6), M.dark, x, 1.6, z);
        B.add(front([[0, 0], [1.3, -0.25], [1.2, -0.75], [0, -0.85]], 0.03, 0.01), M.canvasRed, x + 0.05, 3.1, z);
      }
      B.add(cyl(0.07, 0.09, 4.0, 6), M.dark, W + 0.8, 2.0, -D + 0.8);
      B.add(slab(0.5, 0.35, 0.5, 0.06), M.dark, W + 0.8, 4.1, -D + 0.8);
      B.add(slab(0.36, 0.12, 0.36, 0.03), M.tungsten, W + 0.8, 3.9, -D + 0.8);
    });
    const root = new THREE.Group();
    block.root.name = 'block'; root.add(block.root); root.add(site.root);
    const lampA = new THREE.Object3D(); lampA.position.set(p.w / 2 + 2.0, 3.85, -p.d / 2 - 0.4);
    glowAnchor(lampA, { color: '#ffb36b', size: 1.3, intensity: 2.2, pulse: 'flicker' }); root.add(lampA);
    root.userData.l01 = { block: block.root };
    return { root };
  },
});

type('ice_sled', {
  params: { length: 12, paint: '' },
  states: Object.fromEntries(['loaded0', 'loaded1', 'loaded2', 'loaded3', 'towed'].map((st, i) => [st, (inst) => {
    unsquash(inst);
    setColliders(inst, st !== 'towed');
    if (inst.root) {
      inst.root.visible = st !== 'towed';
      const pp = partsOf(inst);
      for (let k = 0; k < 3; k++) if (pp['block' + k]) pp['block' + k].visible = k < i;
    }
  }])),
  footprint: (p) => fp('rect', 4, p.length + 1),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 1.8, hd: p.length / 2, yaw: 0, top: 2.2 }],
  anchors: () => ({ tow: [0, 0.7, -6.6], flag: [1.6, 1.2, 4.8] }),
  build(ctx, p) {
    const model = sledModel(ctx);
    const body = part(ctx, 'sled_body', (B) => { flat(B, { parts: { body: model.parts.body } }); });
    const root = new THREE.Group(); root.add(body.root);
    const l01 = {};
    for (let k = 0; k < 3; k++) {
      const b = part(ctx, 'sled_block', (B) => { for (const it of model.parts.block0.items) B.add(...it); });
      b.root.position.set(...model.parts['block' + k].pivot); b.root.rotation.y = (k - 1) * 0.08;
      root.add(b.root); l01['block' + k] = b.root;
    }
    if (p.paint) { const s = signMesh(ctx, p.paint, 3.6, 0.7, { bg: '#4f8a86', color: '#e9e3d3', weathered: 0.5 }); if (s) { s.position.set(1.72, 1.0, 0.5); s.rotation.y = PI / 2; root.add(s); } }
    const lampA = new THREE.Object3D(); lampA.position.set(1.4, 4.95, -5.2); glowAnchor(lampA, { color: '#ffb36b', size: 1.2, intensity: 2 }); root.add(lampA);
    root.userData.l01 = l01;
    return { root };
  },
});

type('wake_lamp', {
  params: { h: 7 },
  footprint: () => fp('circle', 1.5),
  colliders: (p) => [{ type: 'circle', x: 0, z: 0, r: 0.6, top: p.h }],
  build(ctx, p) {
    const M = mats(ctx);
    const r = part(ctx, 'wake_lamp:' + p.h, (B) => {
      B.add(cyl(0.12, 0.17, p.h, 8), M.dark, 0, p.h / 2, 0);
      B.add(slab(1.6, 0.14, 0.14, 0.03), M.dark, 0.5, p.h - 0.2, 0);
      B.add(cyl(0.32, 0.22, 0.35, 10), M.dark, 1.15, p.h - 0.42, 0);
      B.add(cyl(0.2, 0.2, 0.06, 10), M.tungsten, 1.15, p.h - 0.62, 0);
      B.add(slab(0.06, 1.8, 0.5, 0.02), M.canvasRed, -0.2, p.h - 1.3, 0.25, 0, 0, 0.12);
      B.add(top(chamferRect(0.9, 0.9, 0.2), 0.3, 0.06), M.iron, 0, 0.15, 0);
    });
    const a = new THREE.Object3D(); a.position.set(1.15, p.h - 0.7, 0); glowAnchor(a, { color: '#ffb36b', size: 2.2, intensity: 2.5, pulse: 'flicker' });
    r.root.add(a);
    return r;
  },
});

type('tank_cairn', {
  params: { n: 9 },
  footprint: () => fp('circle', 4),
  colliders: (p) => [{ type: 'circle', x: 0, z: 0, r: 2.6, top: p.n > 6 ? 4.4 : 3 }],
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, 'tank_cairn:' + p.n, (B) => {
      const rng = rngFor('cairn' + p.n), paints = [M.wake, M.wakeRed, M.drum, M.rust, M.wakeCream];
      let placed = 0, y = 0.8, ring = Math.min(5, p.n);
      while (placed < p.n) {
        const k = Math.min(ring, p.n - placed), R = ring > 1 ? 0.65 + ring * 0.28 : 0;
        for (let i = 0; i < k; i++) {
          const a = (i / k) * PI * 2 + rng();
          const m = paints[Math.floor(rng() * paints.length)];
          B.add(cyl(0.62, 0.62, 1.5, 12), m, Math.cos(a) * R, y, Math.sin(a) * R, PI / 2, a, 0);
          B.add(torus(0.62, 0.05, 4, 12), M.dark, Math.cos(a) * R, y, Math.sin(a) * R, 0, a + PI / 2, 0);
          placed++;
        }
        y += 1.15; ring = Math.max(1, ring - 2);
      }
      B.add(cyl(0.05, 0.06, 3.4, 5), M.dark, 0, y + 1.1, 0);
      B.add(front([[0, 0], [0.9, -0.2], [0.8, -0.6], [0, -0.7]], 0.03, 0.01), M.canvasRed, 0.04, y + 2.6, 0);
    });
  },
});

type('wake_board', {
  params: { text: 'SECOND PATIENCE · CUT 4' },
  footprint: () => fp('rect', 5, 2),
  colliders: () => [{ type: 'box', minx: -2.3, maxx: 2.3, minz: -0.4, maxz: 0.4, top: 3.2 }],
  build(ctx, p) {
    const M = mats(ctx);
    const r = part(ctx, 'wake_board', (B) => {
      for (const x of [-1.8, 1.8]) B.add(cyl(0.1, 0.12, 3.4, 6), M.dark, x, 1.7, 0);
      B.add(slab(4.2, 1.4, 0.16, 0.05), M.wakeCream, 0, 2.4, 0.05);
      B.add(slab(4.4, 0.12, 0.3, 0.03), M.dark, 0, 3.15, 0.05);
    });
    const s = signMesh(ctx, p.text, 3.9, 1.1, { bg: '#cbbd9a', color: '#2a2420', weathered: 0.6, w: 512, h: 144 });
    if (s) { s.position.set(0, 2.4, -0.04); s.rotation.y = PI; r.root.add(s); }
    return r;
  },
});

type('block_stack', {
  params: { rows: 4, crates: false },
  footprint: (p) => fp('rect', p.rows * 3 + 4, 10),
  colliders: (p) => p.crates ? [{ type: 'obox', x: 0, z: 0, hw: 3.5, hd: 2.6, yaw: 0, top: 2.2 }]
    : [{ type: 'obox', x: 0, z: 0, hw: p.rows * 1.6, hd: 4.6, yaw: 0, top: 3 * Math.ceil(p.rows / 2) },
       { type: 'obox', x: 0, z: 0, hw: Math.max(1.6, p.rows * 0.8), hd: 3.2, yaw: 0, top: 3 * p.rows }],
  build(ctx, p) {
    const M = mats(ctx);
    if (p.crates) return part(ctx, 'crates', (B) => {
      const rng = rngFor('crates');
      for (let i = 0; i < 7; i++) {
        const w = 1.4 + rng() * 1.2, h = 0.9 + rng() * 0.6, d = 1.1 + rng() * 0.7, m = [M.wake, M.wakeRed, M.wakeCream, M.drum][i % 4];
        const x = (i % 4 - 1.5) * 1.7 + rng() * 0.3, z = (i < 4 ? -0.9 : 0.9), y = (i >= 6 ? h + 0.9 : h / 2);
        B.add(slab(q5(w), q5(h), q5(d), 0.1), m, x, y, z, 0, rng() * 0.4 - 0.2, 0);
        B.add(slab(q5(w) + 0.1, 0.1, q5(d) + 0.1, 0.03), M.dark, x, y + h / 2, z);
      }
      B.add(cyl(0.6, 0.6, 1.1, 12), M.oxide, 2.9, 0.55, 1.6);   // kite reel post
      B.add(cyl(0.08, 0.08, 2.6, 6), M.dark, 2.9, 1.9, 1.6);
    });
    return part(ctx, 'block_stack:' + p.rows, (B, lod) => {
      const rng = rngFor('stack' + p.rows);
      for (let row = 0; row < p.rows; row++) {
        const nx = p.rows - row, nz = row < p.rows - 1 ? 3 : 2, y = row * 3 + 1.5;
        for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
          if (lod && (i + k) % 2) continue;
          const x = (i - (nx - 1) / 2) * 3.05, z = (k - (nz - 1) / 2) * 3.05;
          B.add(slab(2.95, 2.9, 2.95, 0.22), (i + k + row) % 3 ? M.iceClear : M.ice, x, y, z, 0, (rng() - 0.5) * 0.05, 0);
        }
        if (!lod) for (const z of [-1.6, 1.6]) B.add(slab(nx * 3.1 + 0.2, 0.08, 0.25, 0.02), M.dark, 0, y + 1.47, z);
      }
      B.add(slab(0.12, 3.0, 0.12, 0.02), M.dark, p.rows * 1.6 + 0.6, 1.5, -2.5);
      B.add(slab(1.8, 1.2, 0.12, 0.04), M.iron, p.rows * 1.6 + 0.6, 2.6, -2.5);
      B.add(slab(1.6, 0.18, 0.13, 0.02), M.hazard, p.rows * 1.6 + 0.6, 2.0, -2.5);
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════ pressure ridges (Z1, Z3)
type('pressure_ridge', {
  params: { length: 60, h: 12, seed: 1, rubble: false },
  footprint: (p) => fp('rect', p.h * 1.5, p.length, 6),
  colliders: (p) => segBoxes(0, -p.length / 2 + 2, 0, p.length / 2 - 2, Math.max(6, p.h * (p.rubble ? 1.0 : 1.15)), p.h * (p.rubble ? 0.7 : 0.78), undefined, 10, { surface: 'ice' }),
  build(ctx, p) {
    const M = mats(ctx);
    const make = (B, lod) => {
      const rng = rngFor('ridge' + p.seed);
      const L = p.length, H = p.h, n = Math.max(3, Math.round(L / (p.rubble ? 4 : 3.4)));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, z = -L / 2 + t * L + (rng() - 0.5) * 2;
        const prof = 0.45 + 0.55 * Math.sin(Math.min(1, Math.min(t, 1 - t) * 4) * PI / 2);   // taper at the ends
        for (let k = 0; k < 3; k++) {
          if (lod && (i + k) % 3) continue;
          const mid = k === 1;
          const hh = q5(H * (mid ? 1.0 : 0.62) * prof * (0.65 + rng() * 0.45));
          const w = q5(3.5 + rng() * 6), th = q5(0.7 + rng() * 1.1);
          const lean = (20 + rng() * 50) * DEG * (rng() < 0.5 ? -1 : 1);
          const x = (k - 1) * H * 0.33 + (rng() - 0.5) * 2;
          const m = rng() < 0.55 ? M.ice : M.iceDeep;
          B.add(slab(w, hh, th, 0.25), m, x, hh * 0.32, z, 0, (rng() - 0.5) * 0.8, lean * (mid ? 0.6 : 1));
          if (!lod && rng() < 0.35) B.add(slab(q5(w * 0.8), 0.35, q5(th + 0.4), 0.12), M.snow, x + Math.sin(-lean) * hh * 0.35, hh * 0.32 + Math.cos(lean) * hh * 0.5, z, 0, (rng() - 0.5) * 0.8, lean * 0.4);
        }
        if (!lod && rng() < 0.7) { const s = 0.8 + rng() * 1.6; B.add(rock(Math.floor(rng() * 6) + 3, { cuts: 10, noise: 0.04 }), rng() < 0.5 ? M.ice : M.snow, (rng() - 0.5) * H * 1.2, s * 0.3, z + (rng() - 0.5) * 3, 0, rng() * PI, 0, s, s * 0.7, s); }
      }
      if (!lod) {   // a snow drift along the base on the windward side
        B.add(slab(H * 0.9, 0.9, L * 0.92, 0.4), M.snow, -H * 0.42, 0.25, 0, 0, 0, 0.12);
      }
    };
    return part(ctx, `ridge:${p.length}:${p.h}:${p.seed}:${p.rubble}`, make, { lod: true });
  },
});

type('snow_bridge', {
  params: { span: 70, width: 56 },
  states: {
    intact(inst) { unsquash(inst); setColliders(inst, true); const pp = partsOf(inst); if (pp.crust) pp.crust.visible = true; },
    collapsed(inst, instant) {
      unsquash(inst); setColliders(inst, false);
      const pp = partsOf(inst); if (pp.crust) pp.crust.visible = false;
      if (!instant) inst.l01collapse = true;            // the runtime drops the slabs and the dust (index.js)
    },
  },
  footprint: (p) => fp('rect', p.width, p.span, 0),
  colliders: (p) => [{ type: 'box', minx: -p.width / 2, maxx: p.width / 2, minz: -p.span / 2, maxz: p.span / 2, top: 0.15, bottom: -3, surface: 'snow' }],
  build(ctx, p) {
    const M = mats(ctx);
    const crust = part(ctx, `snow_bridge:${p.span}:${p.width}`, (B) => {
      const nx = 4, nz = 5, w = p.width / nx, d = p.span / nz;
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const x = (i - (nx - 1) / 2) * w, z = (k - (nz - 1) / 2) * d;
        const sag = 0.45 * (1 - Math.abs(x) / (p.width / 2)) * (1 - Math.abs(z) / (p.span / 2));
        B.add(slab(w + 0.4, 1.2, d + 0.4, 0.3), M.snow, x, -0.45 - sag, z, (k - 2) * 0.004, 0, (i - 1.5) * 0.004);
      }
      const rng = rngFor('bridge');
      for (let c = 0; c < 9; c++) B.add(slab(0.25 + rng() * 0.3, 0.05, 8 + rng() * 14, 0.02), M.iceClear, (rng() - 0.5) * p.width * 0.8, 0.13, (rng() - 0.5) * p.span * 0.7, 0, rng() * PI, 0);
    });
    const root = new THREE.Group(); root.add(crust.root);
    root.userData.l01 = { crust: crust.root };
    return { root };
  },
});

// ════════════════════════════════════════════════════════════════════════════ Z2 · under the ice
type('ice_wall', {
  params: { length: 32, h: 22, seed: 1 },
  footprint: (p) => fp('rect', 6, p.length, 0),
  colliders: (p) => segBoxes(0, -p.length / 2, 0, p.length / 2, 6, p.h, -12, 11, { surface: 'ice' }),
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, `ice_wall:${p.length}:${p.h}:${p.seed}`, (B) => {
      const rng = rngFor('wall' + p.seed);
      let z = -p.length / 2;
      while (z < p.length / 2) {
        const w = q5(5 + rng() * 4), h = q5(p.h * (0.75 + rng() * 0.3)), t = q5(2.5 + rng() * 2);
        B.add(slab(t, h, w, 0.35), rng() < 0.5 ? M.iceDeep : M.ice, (rng() - 0.5) * 1.5, h / 2 - 1, z + w / 2, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.12);
        if (rng() < 0.6) B.add(slab(0.15, h * 0.6, 0.6, 0.04), M.iceClear, (rng() < 0.5 ? -1 : 1) * (t / 2 + 0.05), h * 0.45, z + w / 2, 0, 0, 0);   // frozen bubble curtain
        z += w * 0.85;
      }
    });
  },
});

type('ice_vault', {
  params: { span: 72, depth: 30, seed: 1 },
  footprint: (p) => fp('rect', p.span, p.depth, 0),
  colliders: (p) => [{ type: 'box', minx: -p.span / 2, maxx: p.span / 2, minz: -p.depth / 2, maxz: p.depth / 2, top: 3.4, bottom: 0, surface: 'ice' }],
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, `ice_vault:${p.span}:${p.depth}:${p.seed}`, (B) => {
      const rng = rngFor('vault' + p.seed), S = p.span, D = p.depth;
      B.add(slab(S * 0.5, 3.4, D, 0.5), M.iceDeep, 0, 1.7, 0);
      for (const s of [-1, 1]) B.add(slab(S * 0.32, 3.6, D, 0.5), M.ice, s * S * 0.36, 0.6, 0, 0, 0, s * 0.16);
      B.add(slab(S * 0.98, 0.7, D * 0.98, 0.3), M.snow, 0, 3.2, 0, 0, 0, 0);
      // ice windows: faint blue emissive patches where the roof is thin
      for (let i = 0; i < 2; i++) B.add(slab(4 + rng() * 6, 0.3, 3 + rng() * 5, 0.1), M.iceClear, (rng() - 0.5) * S * 0.4, -0.1, (rng() - 0.5) * D * 0.6);
      // icicle clusters under the roof
      for (let i = 0; i < 26; i++) {
        const h = 1.5 + rng() * 3.5, x = (rng() - 0.5) * S * 0.8, z = (rng() - 0.5) * D * 0.9;
        const y0 = Math.abs(x) > S * 0.25 ? 0.6 - (Math.abs(x) - S * 0.25) * 0.16 : 0;
        B.add(cyl(0.28, 0.02, q5(h), 5), M.ice, x, y0 - h / 2, z);
      }
    });
  },
});

type('ice_pillar', {
  params: { h: 18, r: 4, seed: 1 },
  footprint: (p) => fp('circle', p.r + 1),
  colliders: (p) => [{ type: 'circle', x: 0, z: 0, r: p.r, top: p.h, surface: 'ice' }],
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, `ice_pillar:${p.h}:${p.r}:${p.seed}`, (B) => {
      const rng = rngFor('pillar' + p.seed), n = Math.ceil(p.h / 3);
      for (let i = 0; i < n; i++) {
        const k = 0.75 + rng() * 0.35 - Math.sin(i / n * PI) * 0.2;
        B.add(cyl(q5(p.r * k), q5(p.r * (k + 0.1)), 3.4, 7), i % 2 ? M.ice : M.iceDeep, (rng() - 0.5) * 0.5, i * 3 + 1.6, (rng() - 0.5) * 0.5, 0, i * 0.45, 0);
      }
    });
  },
});

type('cutter_wreck', {
  params: {},
  footprint: () => fp('rect', 8, 8),
  colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 3.2, hd: 3.4, yaw: 0, top: 4 }],
  build(ctx) {
    const M = mats(ctx);
    const r = part(ctx, 'cutter_wreck', (B) => {
      flat(B, cutterModel(ctx), compose(0, 2.1, 0, 0.15, 0.3, PI / 2 * 0.92), { arm: { rot: [0.8, 0.2, 0.4] }, leg0: { rot: [0.6, 0, 0.2] }, leg3: { rot: [-0.9, 0, 0] } });
      B.add(slab(4, 0.5, 3, 0.2), M.snow, -1.5, 0.2, 1.5, 0, 0.4, 0.1);
    });
    const a = new THREE.Object3D(); a.position.set(-0.9, 2.6, -1.8); a.name = 'cab';
    glowAnchor(a, { color: '#ffb36b', size: 1.6, intensity: 2.5, pulse: 'flicker' });
    r.root.add(a);
    return r;
  },
});

type('moth_alcove', {
  params: {},
  states: {
    sealed(inst) { unsquash(inst); const pp = partsOf(inst); if (pp.front) pp.front.visible = true; },
    broken(inst, instant) {
      unsquash(inst); const pp = partsOf(inst); if (pp.front) pp.front.visible = false;
      if (!instant) inst.l01broken = true;                // the runtime drops the front plates as debris
    },
  },
  footprint: () => fp('rect', 12, 12),
  colliders: () => [
    { type: 'obox', x: 0, z: 6.2, hw: 6, hd: 1.2, yaw: 0, top: 14, surface: 'ice' },
    { type: 'obox', x: -5.6, z: 1.5, hw: 1.0, hd: 4.6, yaw: 0, top: 14, surface: 'ice' },
    { type: 'obox', x: 5.6, z: 1.5, hw: 1.0, hd: 4.6, yaw: 0, top: 14, surface: 'ice' } ],
  anchors: () => ({ kneel: [0, 0, 0], visor: [0, 8, -0.6] }),
  build(ctx) {
    const M = mats(ctx);
    const shell = part(ctx, 'alcove_shell', (B) => {
      const rng = rngFor('alcove');
      // back wall and hood: rime-crusted plates in the outline of a kneeling frame
      for (let i = 0; i < 7; i++) B.add(slab(q5(3 + rng() * 3), q5(8 + rng() * 6), 2.4, 0.35), rng() < 0.5 ? M.iceDeep : M.ice, -5 + i * 1.7, 5, 6.4, 0.05, (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.15);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) B.add(slab(1.8, q5(9 + rng() * 5), 3.2, 0.3), M.ice, s * 5.6, 5, 4.5 - i * 2.9, 0, s * 0.15, s * 0.08);
      B.add(slab(13, 2.0, 7, 0.5), M.iceDeep, 0, 13.2, 3.2, -0.18, 0, 0);
      B.add(slab(12, 0.6, 6, 0.3), M.snow, 0, 14.3, 3.4, -0.18, 0, 0);
      // the frame-shaped imprint: shoulder and helmet hollows in clearer ice
      B.add(slab(6.5, 3.2, 0.6, 0.4), M.iceClear, 0, 7.4, 5.1); B.add(slab(2.4, 2.2, 0.6, 0.4), M.iceClear, 0, 10.0, 5.1);
      for (let i = 0; i < 8; i++) B.add(cyl(0.22, 0.02, 1.2 + rng() * 2, 5), M.ice, -5 + rng() * 10, 11.5, rng() * 4);
    });
    const seam = part(ctx, 'alcove_seam', (B) => {
      B.add(slab(0.12, 6, 0.1, 0.02), M.cyanDead, -3.4, 7, 5.0); B.add(slab(0.12, 6, 0.1, 0.02), M.cyanDead, 3.4, 7, 5.0);
      B.add(slab(6.8, 0.12, 0.1, 0.02), M.cyanDead, 0, 10.6, 5.0);
    });
    const frontP = part(ctx, 'alcove_front', (B) => {
      const rng = rngFor('alcoveFront');
      for (let i = 0; i < 9; i++) {
        const w = 1.8 + rng() * 1.8, h = 2.2 + rng() * 3.5;
        B.add(slab(q5(w), q5(h), 0.4, 0.12), M.iceClear, -4 + (i % 4) * 2.6 + rng() * 0.6, 1.5 + Math.floor(i / 4) * 4.2 + rng(), -3.2 + rng() * 0.4, (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.3);
      }
    });
    const root = new THREE.Group(); root.add(shell.root, seam.root, frontP.root);
    root.userData.l01 = { front: frontP.root, seam: seam.root };
    return { root };
  },
});

type('founders_pod', {
  params: { size: 1 },
  footprint: (p) => fp('rect', 5 * p.size, 9 * p.size),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 1.9 * p.size, hd: 4.1 * p.size, yaw: 0, top: 3.0 * p.size }],
  build(ctx, p) {
    const M = mats(ctx), s = p.size;
    return part(ctx, 'pod:' + s, (B) => {
      B.add(front(chamferRect(3.6 * s, 3.6 * s, 0.9 * s), 7.0 * s, 0.4 * s), M.ceramic, 0, 1.2 * s, 0);
      for (const z of [-1, 1]) B.add(front(chamferRect(3.3 * s, 3.3 * s, 0.8 * s), 0.7 * s, 0.25 * s), M.ceramicAged, 0, 1.2 * s, z * 3.75 * s);
      for (const z of [-2.2, 0, 2.2]) B.add(front(chamferRect(3.75 * s, 3.75 * s, 0.95 * s), 0.12, 0.04), M.goldDead, 0, 1.2 * s, z * s);
      // lattice-motif panel: a ring of nodes and hex links on the flank
      for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; B.add(ball(0.12 * s, 6, 4), M.goldDead, 1.83 * s, 1.2 * s + Math.sin(a) * 0.7 * s, Math.cos(a) * 0.7 * s); }
      B.add(slab(0.06, 1.0 * s, 1.0 * s, 0.02), M.ceramicAged, 1.82 * s, 1.2 * s, 0, PI / 4, 0, 0);
      B.add(slab(4.2 * s, 0.6, 2.2 * s, 0.25), M.snow, 0.4, 0.25, 1.5 * s, 0, 0.2, 0.05);
    });
  },
});

// The moulin: a ring of ice walls, open to the sky, entered at the bottom through a doorway on local +z (the trench side
// with yaw 'route'): the door segment of the collider ring is a lintel from `door` m up, so the way out is the climb.
type('shaft_ring', {
  params: { r: 12, h: 34, door: 11 },
  footprint: (p) => fp('circle', p.r + 6, 0, 0),
  colliders: (p) => {
    const out = [], R = p.r + 2.5, n = 10, hw = PI * R / n + 0.6;
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2;
      out.push({ type: 'obox', x: Math.sin(a) * R, z: Math.cos(a) * R, hw: i === 0 ? hw - 1.2 : hw, hd: 2.2, yaw: a, top: p.h,
                 bottom: i === 0 ? p.door : -4, surface: 'ice' });
    }
    return out;
  },
  build(ctx, p) {
    const M = mats(ctx);
    const ring = part(ctx, `shaft:${p.r}:${p.h}:${p.door}`, (B) => {
      const rng = rngFor('shaft'), R = p.r + 2.5, n = 10;
      for (let i = 0; i < n * 2; i++) {
        const a = i / (n * 2) * PI * 2, w = q5(2 * PI * R / (n * 2) + 1.5), h = q5(p.h * (0.9 + rng() * 0.15));
        const t = q5(3 + rng() * 2), mat = rng() < 0.5 ? M.ice : M.iceDeep, rx = (rng() - 0.5) * 0.1, rz = (rng() - 0.5) * 0.08;
        const door = i === 0 || i === 1 || i === n * 2 - 1;
        if (door) {   // the doorway: a lintel of ice over the opening, icicles hanging from it
          const lh = h - p.door;
          B.add(slab(w, lh, t, 0.4), mat, Math.sin(a) * (R + 0.5), p.door + lh / 2 - 2 + 0.5, Math.cos(a) * (R + 0.5), rx, a, rz);
          for (let k = 0; k < 4; k++) B.add(cyl(0.3, 0.02, q5(1.5 + rng() * 2.5), 5), M.ice, Math.sin(a) * (R + 0.5) + (rng() - 0.5) * w * Math.cos(a), p.door - 2.5, Math.cos(a) * (R + 0.5) - (rng() - 0.5) * w * Math.sin(a));
          continue;
        }
        B.add(slab(w, h, t, 0.4), mat, Math.sin(a) * (R + 0.5), h / 2 - 2, Math.cos(a) * (R + 0.5), rx, a, rz);
      }
      for (let i = 0; i < 14; i++) {   // the raised rim: rafted slabs tilted outward
        const a = i / 14 * PI * 2 + rng() * 0.2, w = q5(4 + rng() * 4);
        B.add(slab(w, q5(3 + rng() * 3), 1.2, 0.3), rng() < 0.6 ? M.ice : M.snow, Math.sin(a) * (R + 3), p.h + 0.5, Math.cos(a) * (R + 3), -0.6 - rng() * 0.5, a, 0);
      }
    });
    // a cone of cold starlight falling into the dark (additive, no shadows)
    // (it ends just above the rim: from the surface the moulin reads as a hole, not a pillar of light)
    const cone = new THREE.Mesh(coneGeo(p.r * 0.75, p.r * 1.05, p.h + 4), coneMat(ctx, '#7fb6ff', 0.10));
    cone.position.y = (p.h + 4) / 2 - 1; cone.castShadow = cone.receiveShadow = false; cone.renderOrder = 2; cone.name = 'lightCone';
    ring.root.add(cone);
    return ring;
  },
});
const CONE = new Map();
export function coneGeo(rt, rb, h) {
  const k = `${rt}|${rb}|${h}`;
  let g = CONE.get(k);
  if (!g) { g = shared(new THREE.CylinderGeometry(rt, rb, h, 24, 1, true)); CONE.set(k, g); }
  return g;
}
const CONE_MATS = new WeakMap();
/** additive, fog-free light volume material: P1's library glow (shared per colour and opacity; no extra program) */
export function coneMat(ctx, color, opacity) {
  if (ctx.materials?.glow) return ctx.materials.glow(color, opacity);
  let m = CONE_MATS.get(ctx); if (!m) { m = new Map(); CONE_MATS.set(ctx, m); }
  const k = color + '|' + opacity;
  if (!m.has(k)) m.set(k, shared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  return m.get(k);
}

// ════════════════════════════════════════════════════════════════════════════ Z3 · wrecks
type('skiff_wreck', {
  params: { seed: 1, frozen: false },
  footprint: () => fp('rect', 6, 17),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 2.6, hd: 7.6, yaw: 0, top: p.frozen ? 2 : 3.2 }],
  anchors: () => ({ harvest: [0, 3, 0], fire: [0.5, 1.5, 2] }),
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, `skiff_wreck:${p.seed}:${p.frozen}`, (B) => {
      const rng = rngFor('wreck' + p.seed);
      const m = skiffModel(ctx, p.seed % 2 ? 'gaffer' : 'sleet');
      const sink = p.frozen ? -1.6 : 0;
      flat(B, m, compose(0, 1.4 + sink, 0, 0.05, 0, 1.15 + rng() * 0.15),
           { mast: { rot: [0.3, 0, 1.2 + rng() * 0.3] }, sail: { rot: [0.6, 0.3, 1.0] } });
      for (let i = 0; i < 5; i++) B.add(rock(9 + i, { cuts: 8 }), M.dark, (rng() - 0.5) * 6, 0.2, (rng() - 0.5) * 12, 0, rng() * PI, 0, 0.6 + rng(), 0.3, 0.6 + rng());
      if (p.frozen) { for (let i = 0; i < 6; i++) B.add(slab(q5(3 + rng() * 4), 0.8, q5(3 + rng() * 4), 0.3), rng() < 0.5 ? M.snow : M.ice, (rng() - 0.5) * 5, 0.2, (rng() - 0.5) * 12, 0.05, rng() * PI, 0.05); }
    });
  },
});

// ════════════════════════════════════════════════════════════════════════════ Z4 · the apron and the hold
type('gleaner_pad', {
  params: {},
  footprint: () => fp('rect', 32, 32),
  colliders: () => [{ type: 'box', minx: -15, maxx: 15, minz: -15, maxz: 15, top: 3, bottom: 1.2 }],
  build(ctx) {
    const M = mats(ctx);
    const r = part(ctx, 'gleaner_pad', (B, lod) => {
      B.add(slab(30, 0.8, 30, 0.25), M.iron, 0, 2.6, 0);
      if (!lod) for (let i = 0; i < 9; i++) B.add(slab(0.35, 0.18, 29, 0.05), M.steel, -13.5 + i * 3.4, 3.05, 0);   // deck ribs
      for (const s of [-1, 1]) {
        B.add(slab(30.4, 0.9, 0.6, 0.15), M.oxide, 0, 2.6, s * 15.1);
        B.add(slab(0.6, 0.9, 30.4, 0.15), M.oxide, s * 15.1, 2.6, 0);
        if (!lod) for (let i = 0; i < 6; i++) B.add(front([[-1.1, -0.18], [0, 0.32], [1.1, -0.18], [1.1, 0.05], [0, 0.55], [-1.1, 0.05]], 0.06, 0.01), M.hazard, -12 + i * 4.8, 2.5, s * 15.42, 0, s > 0 ? 0 : PI, 0);
      }
      for (const x of [-12, -4, 4, 12]) for (const z of [-12, 0, 12]) B.add(cyl(0.7, 0.9, 2.4, 8), M.dark, x, 1.2, z);
      for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
        B.add(cyl(0.15, 0.2, 7, 6), M.dark, x, 6.5, z);
        B.add(slab(0.9, 0.5, 0.6, 0.08), M.iron, x, 10.1, z);
        B.add(slab(0.6, 0.12, 0.4, 0.03), M.sodium, x, 9.85, z);
      }
      for (const [x, z] of [[-8, 9], [7, -9]]) { B.add(cyl(1.2, 1.2, 1.4, 14), M.drum, x, 3.9, z, 0, 0, PI / 2); B.add(cyl(0.4, 0.4, 1.6, 8), M.dark, x, 3.9, z, 0, 0, PI / 2); }
    }, { lod: true });
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      const a = new THREE.Object3D(); a.position.set(x, 9.8, z); glowAnchor(a, { color: '#ff9a2e', size: 2.4, intensity: 3, pulse: 'flicker' }); r.root.add(a);
    }
    return r;
  },
});

type('drum_rack', {
  params: { n: 8 },
  footprint: (p) => fp('rect', 4, p.n * 0.9 + 1),
  colliders: (p) => [{ type: 'obox', x: 0, z: 0, hw: 1.8, hd: p.n / 2 * 0.95 + 0.4, yaw: 0, top: 2.4 }],
  anchors: () => ({ harvest: [0, 3, 0] }),
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, 'drum_rack:' + p.n, (B) => {
      const cols = Math.ceil(p.n / 2);
      for (let i = 0; i < p.n; i++) {
        const x = (i % 2 ? 0.85 : -0.85), z = (Math.floor(i / 2) - (cols - 1) / 2) * 1.9, y = 1.15;
        B.add(cyl(0.75, 0.75, 1.9, 14), M.drum, x, y, z);
        for (const dy of [-0.55, 0.55]) B.add(cyl(0.78, 0.78, 0.12, 14), M.iron, x, y + dy, z);
        B.add(cyl(0.7, 0.7, 0.08, 14), M.oxide, x, y + 0.98, z);
      }
      const L = cols * 1.9 + 0.6;
      for (const x of [-1.8, 1.8]) for (const y of [0.15, 2.3]) B.add(slab(0.2, 0.2, L, 0.04), M.steel, x, y, 0);
      for (let k = 0; k <= cols; k++) for (const x of [-1.8, 1.8]) B.add(slab(0.2, 2.4, 0.2, 0.04), M.steel, x, 1.2, -L / 2 + k * (L / cols));
    });
  },
});

type('winch_lock', {
  params: {},
  states: {
    intact(inst) { unsquash(inst); const pp = partsOf(inst); if (pp.clamp) pp.clamp.visible = true; if (pp.chain) pp.chain.visible = true; },
    destroyed(inst) { unsquash(inst); setColliders(inst, false); const pp = partsOf(inst); if (pp.clamp) pp.clamp.visible = false; if (pp.chain) pp.chain.visible = false; },
  },
  footprint: () => fp('circle', 2, 0, 0),
  colliders: () => [],
  hit: () => ({ center: [0, 8, 0], r: 2.4 }),
  anchors: () => ({ lock: [0, 8, 0] }),
  build(ctx) {
    const M = mats(ctx);
    const body = part(ctx, 'winch_body', (B) => {
      B.add(slab(0.6, 3.2, 3.6, 0.1), M.iron, -0.9, 8.4, 0);
      B.add(cyl(0.9, 0.9, 2.6, 14), M.drum, 0, 8.6, 0, PI / 2, 0, 0);
      B.add(slab(0.4, 0.4, 3.2, 0.08), M.oxide, 0.2, 9.8, 0);
      B.add(front([[-1.1, -0.18], [0, 0.32], [1.1, -0.18], [1.1, 0.05], [0, 0.55], [-1.1, 0.05]], 0.06, 0.01), M.hazard, -0.55, 7.0, 0, 0, PI / 2, 0);
    });
    const clamp = part(ctx, 'winch_clamp', (B) => {
      B.add(slab(1.2, 1.4, 1.0, 0.12), M.oxide, 0.3, 7.6, 1.0);
      B.add(cyl(0.18, 0.18, 1.4, 8), M.steel, 0.6, 7.6, 1.0, 0, 0, PI / 2);
    });
    const chain = part(ctx, 'winch_chain', (B) => {
      for (let i = 0; i < 14; i++) B.add(torus(0.22, 0.06, 4, 8), M.steel, 0.6 + i * 0.05, 7.2 - i * 0.5, 1.2 + i * 0.12, 0, (i % 2) * PI / 2, 0);
    });
    const root = new THREE.Group(); root.add(body.root, clamp.root, chain.root);
    const g = new THREE.Object3D(); g.position.set(0.3, 7.6, 1.0); glowAnchor(g, { color: '#ffbf4a', size: 0.9, intensity: 2, pulse: 'sparkle' }); root.add(g);
    root.userData.l01 = { clamp: clamp.root, chain: chain.root };
    return { root };
  },
});

// ════════════════════════════════════════════════════════════════════════════ Z5 · the shelf edge
type('ice_cliff', {
  params: { length: 170, h: 80, seed: 1 },
  footprint: (p) => fp('rect', 12, p.length, 0),
  colliders: (p) => segBoxes(3, -p.length / 2, 3, p.length / 2, 10, 1, -p.h, 10, { surface: 'ice' }),
  build(ctx, p) {
    const M = mats(ctx);
    return part(ctx, `ice_cliff:${p.length}:${p.seed}`, (B, lod) => {
      const rng = rngFor('cliff' + p.seed);
      let z = -p.length / 2;
      while (z < p.length / 2) {
        const w = q5(8 + rng() * 6), dx = (rng() - 0.5) * 1.2;
        B.add(slab(10, p.h + 1, w + 0.4, 0.5), rng() < 0.5 ? M.ice : M.iceDeep, 3 + dx, -p.h / 2 + 0.5, z + w / 2);
        if (!lod) {
          for (let k = 0; k < 4; k++) B.add(slab(0.25, 0.35, w, 0.05), M.iceDeep, -2.05 + dx, -4 - k * 6 - rng() * 2, z + w / 2);    // saw lines
          for (let k = 0; k < 4; k++) { const hh = 1 + rng() * 2.4; B.add(cyl(0.25, 0.02, q5(hh), 5), M.ice, -2.0 + dx, -0.2 - hh / 2, z + rng() * w); }
          B.add(slab(1.2, 0.5, w, 0.15), M.snow, -1.4 + dx, 0.85, z + w / 2);
        }
        z += w;
      }
    }, { lod: true });
  },
});

// ════════════════════════════════════════════════════════════════════════════ Z7 · the shore and the Wake
type('fast_ice_hole', {
  params: { r: 4.5 },
  footprint: (p) => fp('circle', p.r + 3, 0, 0),
  colliders: () => [],
  anchors: (p) => ({ water: [0, -0.3, 0] }),
  build(ctx, p) {
    const M = mats(ctx);
    const water = ctx.materials.standard({ color: '#0a1a20', roughness: 0.04, metalness: 0.1, envMapIntensity: 1.4 });
    return part(ctx, 'hole:' + p.r, (B) => {
      const rng = rngFor('hole');
      B.add(cyl(p.r + 0.2, p.r + 0.2, 0.4, 24), water, 0, -0.35, 0);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * PI * 2 + rng() * 0.2, w = 1.4 + rng() * 1.6;
        B.add(slab(q5(w), 0.6, q5(1.4 + rng()), 0.18), rng() < 0.6 ? M.ice : M.snow, Math.sin(a) * (p.r + 0.9), 0.05, Math.cos(a) * (p.r + 0.9), -0.15 - rng() * 0.2, a, 0);
      }
      // a fallen windbreak and a tank on a tripod
      B.add(slab(6, 0.12, 2.2, 0.04), M.canvas, p.r + 4, 0.3, 2, 0.1, 0.5, 0.08);
      for (const x of [-2.6, 0, 2.6]) B.add(cyl(0.06, 0.06, 2.6, 5), M.dark, p.r + 4 + x * 0.9, 0.15, 2 + x * 0.5, 0, 0.5, PI / 2 - 0.1);
      for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; B.add(cyl(0.06, 0.06, 3.4, 5), M.dark, -p.r - 3 + Math.sin(a) * 0.7, 1.6, -1 + Math.cos(a) * 0.7, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25); }
      B.add(cyl(0.6, 0.6, 1.4, 12), M.wake, -p.r - 3, 3.2, -1, PI / 2, 0.4, 0);
    });
  },
});

type('wake_rig', {
  params: { kind: 'crawler', name: '', seed: 1 },
  footprint: (p) => fp('rect', 14, 26),
  colliders: (p) => p.kind === 'train' ? [-14, 0, 14].map(z => ({ type: 'obox', x: 0, z, hw: 3.4, hd: 6.4, yaw: 0, top: 7 }))
    : p.kind === 'walker' ? [{ type: 'obox', x: 0, z: 0, hw: 5, hd: 6, yaw: 0, top: 14, bottom: 6 }, ...[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z]) => ({ type: 'circle', x, z, r: 1.2, top: 7 }))]
    : [{ type: 'obox', x: 0, z: 0, hw: 5.2, hd: 11, yaw: 0, top: 11 }],
  build(ctx, p) {
    const M = mats(ctx);
    const r = part(ctx, `wake_rig:${p.kind}:${p.seed}`, (B, lod) => buildRig(B, M, p, lod), { lod: true });
    if (p.name) {
      const s = signMesh(ctx, p.name, 7, 1.1, { bg: '#4f8a86', color: '#efe4cc', weathered: 0.6, w: 512, h: 96 });
      if (s) { s.position.set(p.kind === 'train' ? 3.48 : 5.32, p.kind === 'walker' ? 9 : 4.6, 0); s.rotation.y = PI / 2; r.root.add(s); }
    }
    for (const a of r.extra || []) { const o = new THREE.Object3D(); o.position.set(...a); glowAnchor(o, { color: '#ffb36b', size: 2.0, intensity: 2.5, pulse: 'flicker' }); r.root.add(o); }
    return r;
  },
});
function buildRig(B, M, p, lod) {
  const rng = rngFor('rig' + p.seed), lamps = [];
  const patches = (x0, y0, z0, w, h, n) => { if (!lod) for (let i = 0; i < n; i++) B.add(slab(q5(0.8 + rng() * 1.6), q5(0.6 + rng() * 1.2), 0.1, 0.03), [M.wakeRed, M.rust, M.wakeCream][i % 3], x0, y0 + (rng() - 0.5) * h, z0 + (rng() - 0.5) * w, 0, PI / 2, 0); };
  if (p.kind === 'train') {
    for (const z of [-14, 0, 14]) {
      B.add(slab(6.4, 1.2, 12.4, 0.3), M.iron, 0, 1.6, z);
      for (const zz of [-4.5, 4.5]) for (const s of [-1, 1]) B.add(cyl(1.0, 1.0, 0.8, 12), M.rubber, s * 3.0, 1.0, z + zz, 0, 0, PI / 2);
      B.add(cyl(2.6, 2.6, 10.5, 16), z === -14 ? M.wake : M.rust, 0, 4.6, z, PI / 2, 0, 0);
      for (const zz of [-3, 0, 3]) B.add(torus(2.62, 0.12, 4, 16), M.dark, 0, 4.6, z + zz);
      patches(2.7, 4.6, z, 9, 3, 3);
    }
    B.add(slab(5.2, 4.5, 4.5, 0.4), M.wakeCream, 0, 4.0, -22.5);
    B.add(slab(4.2, 1.2, 0.1, 0.05), M.tungsten, 0, 5.0, -24.8); lamps.push([0, 5.0, -25.2]);
    for (const z of [-7, 7]) B.add(slab(0.6, 0.6, 2.2, 0.1), M.dark, 0, 1.7, z);
  } else if (p.kind === 'walker') {
    B.add(side([[-6, 7], [-5.4, 12.5], [4.8, 13.2], [6.2, 10], [5.6, 6.8], [-5.2, 6.4]], 9.4, 0.4), M.wake, 0, 0, 0);
    B.add(slab(8, 3.2, 6, 0.4), M.wakeCream, 0, 14.6, -1);
    B.add(slab(6.4, 1.0, 0.12, 0.05), M.tungsten, 0, 14.8, -4.05); lamps.push([0, 14.8, -4.5]);
    B.add(slab(1.4, 0.8, 0.12, 0.05), M.tungsten, 4.75, 9.6, 2); lamps.push([5.1, 9.6, 2]);
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      B.add(slab(1.2, 6.2, 1.4, 0.2), M.iron, x, 3.6, z, 0, 0, x * 0.02);
      B.add(top(chamferRect(2.6, 3.0, 0.6), 0.5, 0.12), M.rubber, x, 0.25, z);
    }
    B.add(slab(10, 0.15, 6, 0.04), M.canvas, 0, 16.6, 3, 0.15, 0, 0);
    patches(4.75, 10, 0, 9, 4, 5);
    B.add(cyl(0.12, 0.14, 9, 6), M.dark, -3, 20, 2);
    if (!lod) for (let i = 0; i < 4; i++) B.add(slab(0.05, 2.6, 0.4, 0.01), [M.canvasRed, M.wake, M.canvas][i % 3], -3 + 0.2, 23 - i * 1.2, 2.4 + i * 0.4, 0.2, 0, 0.3);
  } else {
    for (const s of [-1, 1]) {
      B.add(side([[-11, 0.3], [-10.4, 2.6], [10.4, 2.6], [11, 0.3], [10.2, -0.1], [-10.2, -0.1]], 2.6, 0.3), M.rubber, s * 4.0, 0, 0);
      if (!lod) for (let i = 0; i < 6; i++) B.add(cyl(0.9, 0.9, 2.8, 10), M.iron, s * 4.0, 1.2, -8 + i * 3.2, 0, 0, PI / 2);
    }
    B.add(slab(10.4, 4.2, 20, 0.45), M.wake, 0, 4.8, 0);
    B.add(slab(8.4, 3.6, 9, 0.4), M.wakeCream, -0.6, 8.6, -4.5);
    B.add(slab(7.6, 0.9, 0.12, 0.05), M.tungsten, -0.6, 9.2, -9.05); lamps.push([-0.6, 9.2, -9.5]);
    for (const z of [-2, 3, 7]) { B.add(slab(0.12, 0.8, 1.6, 0.04), M.tungsten, 5.25, 6.0, z); lamps.push([5.6, 6.0, z]); }
    B.add(slab(10.8, 0.12, 8, 0.03), M.canvas, 0.3, 11.2, 4.5, 0.12, 0, 0.05);
    patches(5.25, 4.8, 0, 18, 3, 6);
    B.add(cyl(0.16, 0.2, 16, 6), M.dark, 3, 15, 6);
    B.add(slab(4, 0.14, 0.14, 0.03), M.dark, 3, 21.5, 6);
    if (!lod) for (let i = 0; i < 5; i++) B.add(slab(0.05, 3.2, 0.5, 0.01), [M.canvasRed, M.wake, M.canvas][i % 3], 1.2 + i * 0.9, 20, 6.1, 0, 0, 0.2);
  }
  return lamps;
}

type('bench_crawler', {
  params: {},
  footprint: () => fp('rect', 18, 34),
  colliders: () => [{ type: 'obox', x: 0, z: 14, hw: 6.6, hd: 10, yaw: 0, top: 12 }],
  anchors: () => ({ cradle: [0, 0, -6], lamp: [0, 14, -4] }),
  build(ctx) {
    const M = mats(ctx);
    const r = part(ctx, 'bench', (B, lod) => {
      // the workshop crawler behind the cradle (local +z)
      for (const s of [-1, 1]) {
        B.add(side([[-6, 0.3], [-5.4, 2.8], [5.4, 2.8], [6, 0.3], [5.2, -0.1], [-5.2, -0.1]], 2.8, 0.3), M.rubber, s * 5.4, 0, 14);
        if (!lod) for (let i = 0; i < 4; i++) B.add(cyl(1.0, 1.0, 3.0, 10), M.iron, s * 5.4, 1.3, 9.5 + i * 3, 0, 0, PI / 2);
      }
      B.add(slab(13.2, 5.0, 19, 0.45), M.wake, 0, 5.4, 14);
      B.add(slab(12, 4.0, 10, 0.4), M.wakeCream, 0, 9.8, 17);
      B.add(slab(11, 0.14, 12, 0.04), M.canvas, 0, 12.4, 9.5, -0.12, 0, 0);
      B.add(slab(9, 1.2, 0.12, 0.05), M.tungsten, 0, 10.2, 11.95);
      // the kneeling cradle: a frame-shaped steel cradle on a deck plate
      B.add(top(chamferRect(11, 12, 1.2), 0.5, 0.15), M.iron, 0, 0.25, -6);
      for (const s of [-1, 1]) {
        B.add(slab(0.7, 7.5, 0.7, 0.12), M.steel, s * 4.6, 4.0, -2.2);
        B.add(slab(0.7, 5.5, 0.7, 0.12), M.steel, s * 4.6, 3.0, -9.5);
        B.add(slab(0.5, 0.5, 7.8, 0.1), M.steel, s * 4.6, 7.2, -5.9, -0.2, 0, 0);
        B.add(slab(1.6, 0.6, 2.0, 0.12), M.oxide, s * 3.4, 1.0, -6.2);
      }
      B.add(slab(9.6, 0.6, 0.6, 0.12), M.steel, 0, 7.8, -2.2);
      // crane arms reaching over the cradle, a welding lamp, a parts rack
      for (const s of [-1, 1]) {
        B.add(cyl(0.45, 0.55, 6, 8), M.iron, s * 5.2, 15, 8);
        B.add(slab(0.7, 0.7, 13, 0.12), M.hazard, s * 4.4, 17.6, 2.5, -0.25, s * 0.15, 0);
        B.add(cyl(0.06, 0.06, 8, 5), M.cable, s * 3.6, 13.8, -3.6);
      }
      B.add(cyl(0.6, 0.4, 0.8, 10), M.dark, 0, 14.4, -4); B.add(cyl(0.4, 0.4, 0.06, 10), M.white, 0, 13.98, -4);
      if (!lod) for (let i = 0; i < 5; i++) B.add(slab(0.3, 3.2, 1.6, 0.05), [M.oxide, M.iron, M.ceramicAged][i % 3], 6.9, 4.2, 6 + i * 2.2);
    }, { lod: true });
    const a = new THREE.Object3D(); a.position.set(0, 13.9, -4); glowAnchor(a, { color: '#fff1d6', size: 3.2, intensity: 3.5, pulse: 'none' }); r.root.add(a);
    const b = new THREE.Object3D(); b.position.set(0, 10.2, 12.2); glowAnchor(b, { color: '#ffb36b', size: 3, intensity: 2.5, pulse: 'flicker' }); r.root.add(b);
    const s = signMesh(ctx, 'THE BENCH', 6, 1.1, { bg: '#4f8a86', color: '#efe4cc', weathered: 0.6, w: 512, h: 96 });
    if (s) { s.position.set(6.62, 6.2, 14); s.rotation.y = PI / 2; r.root.add(s); }
    return r;
  },
});

// ════════════════════════════════════════════════════════════════════════════ the Abeyance (abeyance.js)
type('abeyance', abeyanceType);

// ════════════════════════════════════════════════════════════════════════════ registration
export const L1_STRUCTURE_TYPES = Object.keys(TYPES);
/** tests and tools: the raw type definitions (params defaults in `params`) */
export const L1_TYPE_DEFS = TYPES;
const REGISTERED = new WeakSet();
/** wraps a definition so every hook sees params merged with the type's defaults */
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
  return w;
}
/**
 * Registers every Level 1 type with ctx.structures (overriding same-named generic types, A2 #16). Idempotent: types
 * are re-registered only when missing. Returns true when every type is available.
 */
export function ensureL1Structures(ctx) {
  const S = ctx?.structures;
  if (!S?.register || !S.has) return false;
  const first = !REGISTERED.has(ctx);
  for (const t of L1_STRUCTURE_TYPES) {
    if (!first && S.has(t)) continue;
    try { S.register(t, wrapped(t)); } catch (e) { console.error('[level01] cannot register structure type', t, e); return false; }
  }
  REGISTERED.add(ctx);
  return L1_STRUCTURE_TYPES.every(t => S.has(t));
}
