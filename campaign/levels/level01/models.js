// levels/level01/models.js (P6) — procedural models for Level 1's actors and wrecks, built from bevelled kit pieces.
//
// A model is a set of named PARTS, each with a pivot and a list of items [geometry, material, x, y, z, rx, ry, rz, sx, sy, sz]
// (positions relative to the part's pivot). rig() turns a model into a hierarchy with ONE merged mesh per material per
// part (animated actors); flat() merges the whole model into one Builder (static wrecks, LOD meshes).
// Model forward is -Z (arch §1.3). Sizes follow L1 §11 and §12.1.
import * as THREE from 'three';
import { Builder, meshes, slab, side, front, top, cyl, ball, torus, rock, rect, chamfer, chamferRect, compose, glowAnchor,
         mats, shared, DEG } from './kit.js';
import * as KIT from '../../src/art/kit.js';

const PI = Math.PI;

/** parts: { name: { pivot: [x, y, z], parent?: string, items: [...] } } → { root, parts: { name: Object3D }, anchors } */
export function rig(ctx, model, o = {}) {
  const root = new THREE.Group();
  const parts = {};
  const cacheKey = model.key;
  const cache = rig.cache.get(ctx) || new Map();
  rig.cache.set(ctx, cache);
  for (const [name, p] of Object.entries(model.parts)) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...(p.pivot || [0, 0, 0]));
    if (p.rot) g.rotation.set(...p.rot);
    let built = cacheKey ? cache.get(cacheKey + ':' + name) : null;
    if (!built) {
      const B = new Builder();
      for (const it of p.items) B.add(...it);
      built = B.merged();
      if (cacheKey) cache.set(cacheKey + ':' + name, built);
    }
    const m = meshes(built, { castShadow: o.castShadow !== false });
    for (const c of m.children.slice()) g.add(c);
    for (const a of p.anchors || []) {          // glow anchors and named empties
      const e = new THREE.Object3D(); e.name = a.name; e.position.set(...a.at);
      if (a.glow) glowAnchor(e, a.glow);
      g.add(e);
    }
    parts[name] = g;
  }
  for (const [name, p] of Object.entries(model.parts)) (p.parent ? parts[p.parent] : root).add(parts[name]);
  return { root, parts };
}
rig.cache = new WeakMap();

/** the whole model merged into a Builder (static), with an optional world transform */
export function flat(B, model, m4 = new THREE.Matrix4(), poses = {}) {
  const world = {};
  const order = Object.keys(model.parts);
  const mOf = (name) => {
    if (world[name]) return world[name];
    const p = model.parts[name];
    const pose = poses[name] || {};
    const local = compose(...(p.pivot || [0, 0, 0]), ...(pose.rot || p.rot || [0, 0, 0]));
    world[name] = (p.parent ? mOf(p.parent).clone() : m4.clone()).multiply(local);
    return world[name];
  };
  for (const name of order) {
    const pm = mOf(name);
    for (const [geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx] of model.parts[name].items) {
      B.addM(geo, mat, pm.clone().multiply(compose(x, y, z, rx, ry, rz, sx, sy, sz)));
    }
  }
  return B;
}

// ── the cutter (L1 §12.1): small four-legged utility walker, 5 m, saw arm on the right ─────────────────────────────
export function cutterModel(ctx) {
  const M = mats(ctx);
  const body = [];
  // cab pod: canvas-cream and faded-teal plates over a dark core, patched
  body.push([slab(3.0, 2.2, 3.4, 0.25), M.dark, 0, 0, 0]);
  body.push([side([[-1.9, -1.0], [-1.6, 1.2], [-0.6, 1.5], [1.7, 1.4], [1.9, -0.6], [1.5, -1.2], [-1.4, -1.2]], 3.2, 0.18), M.wakeCream, 0, 0.1, 0]);
  body.push([slab(3.3, 0.9, 2.2, 0.15), M.wake, 0, 0.75, 0.4]);
  body.push([slab(1.1, 0.7, 0.12, 0.05), M.wakeRed, -1.0, -0.2, -1.78]);          // patch
  body.push([slab(2.2, 0.8, 0.1, 0.05), M.darkGlass, 0, 0.55, -1.86]);            // windscreen
  body.push([slab(1.9, 0.5, 0.08, 0.04), M.tungsten, 0, 0.5, -1.7]);              // warm interior behind the glass
  body.push([slab(3.4, 0.3, 3.8, 0.1), M.iron, 0, -1.25, 0]);                     // belly plate
  for (const s of [-1, 1]) body.push([cyl(0.18, 0.18, 1.2, 8), M.dark, s * 1.2, 1.7, 0.9]);   // exhaust stacks
  body.push([KIT.greebles(() => 0.37, 1.6, 0.8, 1.2), M.iron, 0, -0.3, 1.75]);
  const parts = { body: { pivot: [0, 3.0, 0], items: body,
    anchors: [{ name: 'cab', at: [0, 0.5, -1.7], glow: { color: '#ffb36b', size: 1.6, intensity: 2, pulse: 'flicker' } }] } };
  // four short articulated legs with broad snow feet
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    parts['leg' + i] = { pivot: [sx * 1.55, 2.2, sz * 1.25], parent: 'body', items: [
      [cyl(0.32, 0.32, 0.5, 10), M.dark, 0, 0, 0, 0, 0, PI / 2],
      [slab(0.45, 1.5, 0.5, 0.08), M.wake, 0, -0.8, 0] ] };
    parts['foot' + i] = { pivot: [0, -1.55, 0], parent: 'leg' + i, items: [
      [slab(0.35, 1.0, 0.4, 0.06), M.iron, 0, -0.5, 0],
      [top(chamferRect(1.3, 1.6, 0.35), 0.25, 0.08), M.rubber, 0, -1.05, 0] ] };
  });
  // the saw arm: a hydraulic boom with a 3 m circular saw
  parts.arm = { pivot: [1.7, 3.3, -0.8], parent: null, items: [
    [slab(0.5, 0.5, 2.6, 0.08), M.wake, 0, 0, -1.2],
    [cyl(0.14, 0.14, 2.0, 8), M.steel, 0.3, 0.25, -1.0, PI / 2, 0, 0] ] };
  parts.saw = { pivot: [0, -0.3, -2.6], parent: 'arm', items: [
    [cyl(1.5, 1.5, 0.12, 24), M.steel, 0, 0, 0, 0, 0, PI / 2],
    [cyl(0.35, 0.35, 0.3, 10), M.dark, 0, 0, 0, 0, 0, PI / 2],
    [side([[-1.7, 0.2], [-1.6, 1.0], [0.4, 1.7], [1.6, 0.8], [1.7, 0.2]], 0.5, 0.06), M.hazard, 0.05, 0, 0] ] };
  parts.arm.pivot = [1.7, 3.3 + 3.0 - 3.0, -0.8];
  // the painted name rides on the cab as a decal added by the runtime (canvas texture)
  return { key: 'cutter', parts };
}

// ── raider skiff (L1 §11.1): 16 m ice yacht, 14 m mast, lateen sail, stern turbine, bow gun ring ─────────────────────
export function skiffModel(ctx, variant = 'gaffer', o = {}) {
  const M = mats(ctx);
  const hullP = [[-8, 0.4], [-6.5, 1.8], [5.5, 2.0], [8, 1.2], [7.2, 0.2], [-6, 0]];
  const hull = [
    [side(hullP, 2.6, 0.12), M.iron, 0, 0, 0],
    [side([[-6.2, 1.7], [5.2, 1.9], [5.2, 2.2], [-6.0, 2.0]], 2.9, 0.06), M.oxide, 0, 0.05, 0],      // deck plate
    [slab(1.4, 0.9, 1.8, 0.2), M.darkGlass, -0.55, 2.55, 1.5], [slab(1.4, 0.9, 1.8, 0.2), M.darkGlass, 0.55, 2.55, -0.6],   // crew hoods
    [slab(1.2, 0.5, 1.4, 0.1), M.amber, -0.55, 2.3, 1.5], [slab(1.2, 0.5, 1.4, 0.1), M.amber, 0.55, 2.3, -0.6],             // warm interior
    [slab(9.0, 0.35, 0.6, 0.08), M.iron, 0, 0.9, 0.6],                                                    // runner cross-beam
    ...[-1, 1].map(s => [side([[-3.2, -0.2], [-2.6, 0.3], [2.8, 0.3], [3.2, -0.1], [2.6, -0.5], [-2.8, -0.5]], 0.35, 0.05), M.steel, s * 4.4, 0.25, 0.6]),
    [side([[-1.6, -0.3], [-1.0, 0.2], [1.2, 0.2], [1.4, -0.2], [-1.2, -0.5]], 0.3, 0.05), M.steel, 0, -0.05, -6.2],     // steering runner
    [slab(0.35, 0.8, 0.35, 0.05), M.dark, 0, 0.35, -6.2],
    [cyl(0.32, 0.36, 1.2, 10), M.dark, 0, 2.3, 0.2],                                                      // mast step
    // stern turbine duct
    [torus(1.15, 0.22, 6, 16), M.iron, 0, 2.3, 7.4, 0, 0, 0],
    [cyl(0.25, 0.25, 0.9, 8), M.dark, 0, 2.3, 7.0, PI / 2, 0, 0],
    // bow gun ring
    [cyl(0.85, 0.95, 0.35, 14), M.iron, 0, 2.05, -5.0],
    [chev(M), M.hazard, 1.32, 1.3, 2.0, 0, PI / 2, 0],
    [chev(M), M.hazard, -1.32, 1.3, 2.0, 0, -PI / 2, 0],
  ];
  const parts = {
    hull: { pivot: [0, 0, 0], items: hull, anchors: [{ name: 'lamp', at: [0, 15.2, 0.2], glow: { color: '#ff9a2e', size: 1.0, intensity: 2.5, pulse: 'flicker' } }] },
    mast: { pivot: [0, 2.8, 0.2], parent: 'hull', items: [
      [cyl(0.2, 0.28, 12.5, 8), M.steel, 0, 6.2, 0],
      [cyl(0.1, 0.1, 8.5, 6), M.cable, 0, 4.0, 3.4, 0.45, 0, 0],
      [ball(0.28, 8, 6), M.sodium, 0, 12.5, 0] ] },
    sail: { pivot: [0, 3.6, 0.6], parent: 'hull', items: sailItems(M) },
    fan: { pivot: [0, 2.3, 7.4], parent: 'hull', items: [0, 1, 2, 3, 4].map(i => [slab(0.22, 1.0, 0.06, 0.02), M.steel, 0, 0, 0, 0, 0, i * 2 * PI / 5]) },
    gun: { pivot: [0, 2.35, -5.0], parent: 'hull', items: variant === 'gaffer' ? [
        [slab(0.8, 0.7, 1.2, 0.1), M.iron, 0, 0.3, 0.2],
        [cyl(0.2, 0.26, 3.6, 10), M.steel, 0, 0.5, -1.6, PI / 2, 0, 0],                       // 4 m harpoon launcher
        [cyl(0.55, 0.55, 0.7, 14), M.oxide, 0.8, 0.3, 0.4, 0, 0, PI / 2],                    // cable drum (the haul glint)
        [side([[-0.4, -0.1], [0, 0.35], [0.4, -0.1]], 0.12, 0.02), M.steel, 0, 0.5, -3.6] ]
      : [
        [slab(0.9, 0.8, 1.3, 0.12), M.iron, 0, 0.35, 0.1],
        [cyl(0.42, 0.42, 1.7, 12), M.steel, 0, 0.45, -1.0, PI / 2, 0, 0],                    // ventilated shroud
        [cyl(0.5, 0.5, 0.6, 14), M.oxide, 0, 0.45, 0.4, PI / 2, 0, 0],                       // drum feed (the haul glint)
        ...[0, 1, 2, 3].map(i => [slab(0.08, 0.5, 1.2, 0.02), M.dark, Math.cos(i * PI / 2) * 0.43, 0.45 + Math.sin(i * PI / 2) * 0.43, -1.0]) ],
      anchors: [{ name: 'muzzle', at: [0, 0.5, variant === 'gaffer' ? -3.5 : -1.9] }, { name: 'glint', at: variant === 'gaffer' ? [0.8, 0.3, 0.4] : [0, 0.45, 0.4] }] },
  };
  return { key: 'skiff:' + variant, parts };
}
function chev(M) { return front([[-1.1, -0.18], [0, 0.32], [1.1, -0.18], [1.1, 0.05], [0, 0.55], [-1.1, 0.05]], 0.05, 0.01); }
function sailItems(M) {
  // a stiff lateen sail of thin plates with stitched seams: 4 panels, oxide with a black Dredge chevron
  const out = [];
  const panels = [[[0, 0], [0.4, 4.0], [3.6, 3.2], [3.0, 0]], [[0.4, 4.0], [0.8, 8.0], [4.2, 6.2], [3.6, 3.2]], [[0.8, 8.0], [1.2, 11.2], [4.4, 8.8], [4.2, 6.2]]];
  panels.forEach((p, i) => out.push([side(p.map(([z, y]) => [z, y]), 0.08, 0.02), i === 1 ? M.oxide : M.wakeRed, 0, 0, 0]));
  out.push([side([[0.9, 5.2], [2.4, 6.4], [3.6, 5.0], [3.6, 5.6], [2.4, 7.0], [0.9, 5.8]], 0.1, 0.02), M.iron, 0.03, 0, 0]);
  out.push([cyl(0.08, 0.08, 9.0, 6), M.steel, 0, 4.2, 2.2, -0.36, 0, 0]);   // yard
  return out;
}

// ── Gleaner (L1 §11.2): 4 m teardrop scavenger, fan on top, hooked claws, green cab light ──────────────────────
export function gleanerModel(ctx) {
  const M = mats(ctx);
  const bodyP = [[-2, 0], [-1.6, 0.9], [0.4, 1.2], [2, 0.5], [1.8, -0.4], [-1.2, -0.6]];
  return { key: 'gleaner', parts: {
    body: { pivot: [0, 0, 0], items: [
      [side(bodyP, 2.4, 0.18), M.iron, 0, 0, 0],
      [side([[-1.4, 0.75], [0.2, 1.0], [1.2, 0.7], [0.2, 0.75]], 2.5, 0.05), M.oxide, 0, 0.02, 0],     // oxide chevron band
      [slab(1.0, 0.45, 0.2, 0.06), M.darkGlass, 0, 0.35, -1.95],                                     // face plate
      [cyl(0.42, 0.42, 1.1, 12), M.drum, 0, 0.45, 1.75, 0, 0, PI / 2],                              // winch spool
      [torus(1.45, 0.16, 6, 18), M.iron, 0, 1.45, 0.1, PI / 2, 0, 0],                                 // fan duct
      [cyl(0.25, 0.3, 0.4, 8), M.dark, 0, 1.25, 0.1] ],
      anchors: [{ name: 'cab', at: [0, 0.38, -2.08], glow: { color: '#a8ff9e', size: 0.6, intensity: 8, pulse: 'beat', minPx: 4 } },
                { name: 'hook', at: [0, -1.6, 0.2] }] },
    cab: { pivot: [0, 0.38, -2.06], parent: 'body', items: [[KIT.plateGeo([[-0.3, 0], [0, 0.3], [0.3, 0], [0, -0.3]], 0.08, 'front', 0.02), M.ghost, 0, 0, 0]] },
    fan: { pivot: [0, 1.45, 0.1], parent: 'body', items: [0, 1, 2, 3].map(i => [slab(2.5, 0.06, 0.32, 0.02), M.steel, 0, 0, 0, 0, i * PI / 4, 0.18]) },
    clawL: { pivot: [-0.7, -0.5, -0.3], parent: 'body', items: claw(M) },
    clawR: { pivot: [0.7, -0.5, -0.3], parent: 'body', items: claw(M) },
  } };
}
function claw(M) { return [[slab(0.2, 1.1, 0.25, 0.04), M.iron, 0, -0.5, 0], [side([[-0.2, 0], [0.5, -0.1], [0.7, 0.3], [0.5, 0.15], [-0.1, 0.25]], 0.18, 0.03), M.steel, 0, -1.1, -0.1]]; }

// ── Gleaner carrier (L1 §11.3): 18 m flying barge, tilting ducted rotors, flare pod, drums, belly lamps ────────────
export function carrierModel(ctx) {
  const M = mats(ctx);
  const hullP = [[-9, 0], [-8.2, 2.4], [-4, 3.2], [7, 3.0], [9, 1.6], [8.4, -0.8], [-7.6, -1.0]];
  const parts = {
    hull: { pivot: [0, 0, 0], items: [
      [side(hullP, 6.0, 0.3), M.iron, 0, 0, 0],
      [side([[-7.6, 2.6], [6.8, 2.7], [6.6, 3.3], [-7.0, 3.3]], 6.6, 0.12), M.oxide, 0, 0, 0],
      [slab(3.2, 1.8, 3.0, 0.3), M.iron, 0, 3.8, -5.6],                                               // bridge
      [slab(2.6, 0.7, 0.2, 0.08), M.darkGlass, 0, 4.0, -7.15],
      [slab(4.0, 0.6, 9.0, 0.15), M.dark, 0, -1.4, 0.5],                                              // cradle bay
      ...[-1, 1].flatMap(s => [[slab(0.6, 0.6, 3.0, 0.1), M.steel, s * 3.4, 1.0, 0], [chev(M), M.hazard, s * 3.32, 1.5, 4.5, 0, s * PI / 2, 0]]),
      ...[[-1.2, -2.4], [1.2, -2.4], [-1.2, 2.8], [1.2, 2.8]].map(([x, z]) => [cyl(0.85, 0.85, 1.9, 14), M.drum, x, -2.6, z, PI / 2, 0, 0]),   // drums
      [slab(1.0, 0.5, 6.5, 0.1), M.steel, 0, -1.9, 0.2],
      [cyl(0.12, 0.12, 8.0, 6), M.steel, 0, 2.3, 3.5, PI / 2 - 0.3, 0, 0] ],                          // folded net-crane boom
      anchors: [{ name: 'cab', at: [0, 4.0, -7.3], glow: { color: '#a8ff9e', size: 0.6, intensity: 8, pulse: 'beat', minPx: 4 } },
                { name: 'belly0', at: [-2.4, -1.2, -5], glow: { color: '#ff9a2e', size: 1.6, intensity: 2.5, pulse: 'flicker' } },
                { name: 'belly1', at: [2.4, -1.2, 5], glow: { color: '#ff9a2e', size: 1.6, intensity: 2.5, pulse: 'flicker' } },
                { name: 'deploy', at: [0, -2.5, 0.5] }] },
    cab: { pivot: [0, 4.0, -7.28], parent: 'hull', items: [[KIT.plateGeo([[-0.35, 0], [0, 0.35], [0.35, 0], [0, -0.35]], 0.08, 'front', 0.02), M.ghost, 0, 0, 0]] },
    lamps: { pivot: [0, -1.25, 0], parent: 'hull', items: [[slab(0.8, 0.2, 0.8, 0.05), M.sodium, -2.4, 0, -5], [slab(0.8, 0.2, 0.8, 0.05), M.sodium, 2.4, 0, 5]] },
    flarePod: { pivot: [0, 3.6, 2.2], parent: 'hull', items: [
      [slab(2.2, 1.0, 1.6, 0.15), M.iron, 0, 0.4, 0],
      ...[0, 1, 2, 3, 4, 5].map(i => [cyl(0.18, 0.18, 0.9, 8), M.oxide, -0.6 + (i % 3) * 0.6, 1.0, -0.35 + Math.floor(i / 3) * 0.7]) ],
      anchors: [{ name: 'glint', at: [0, 1.0, 0] }] },
  };
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'rotorL' : 'rotorR';
    parts[n] = { pivot: [s * 5.6, 1.6, 0], parent: 'hull', items: [
      [torus(2.6, 0.32, 6, 20), M.iron, 0, 0, 0, PI / 2, 0, 0],
      [slab(0.4, 0.4, 2.0, 0.08), M.iron, -s * 1.8, 0, 0, 0, PI / 2, 0],
      [cyl(0.35, 0.35, 0.6, 8), M.dark, 0, 0, 0] ] };
    parts[n + 'Blades'] = { pivot: [0, 0, 0], parent: n, items: [0, 1, 2].map(i => [slab(4.8, 0.08, 0.5, 0.02), M.steel, 0, 0, 0, 0, i * PI / 3, 0.15]) };
  }
  return { key: 'carrier', parts };
}

// ── Tick, Kit's buggy (L1 §11.6): roll cage, balloon tyres, canvas hood, kite reel, whip antenna ───────────────────
export function tickModel(ctx) {
  const M = mats(ctx);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cage = KIT.pipe([V(-0.9, 0.9, 1.6), V(-0.9, 2.4, 0.8), V(-0.9, 2.5, -0.6), V(-0.9, 1.0, -1.7)], 0.08, 6);
  const cageR = KIT.pipe([V(0.9, 0.9, 1.6), V(0.9, 2.4, 0.8), V(0.9, 2.5, -0.6), V(0.9, 1.0, -1.7)], 0.08, 6);
  shared(cage); shared(cageR);
  const parts = {
    body: { pivot: [0, 0, 0], items: [
      [side([[-2.8, 0.6], [-2.5, 1.2], [2.4, 1.2], [2.9, 0.7], [2.6, 0.4], [-2.6, 0.4]], 1.9, 0.12), M.wake, 0, 0, 0],
      [cage, M.dark, 0, 0, 0], [cageR, M.dark, 0, 0, 0],
      [slab(1.9, 0.08, 2.0, 0.03), M.dark, 0, 2.5, 0.1],
      [side([[-0.9, 1.2], [-0.7, 2.2], [0.9, 2.2], [1.2, 1.2]], 1.6, 0.25), M.canvas, 0, 0, 0.3],        // canvas hood
      [slab(1.2, 0.5, 0.1, 0.05), M.tungsten, 0, 1.6, -0.62],                                          // warm light under the hood
      [cyl(0.45, 0.45, 0.5, 12), M.oxide, 0, 1.6, 2.3, 0, 0, PI / 2],                                  // kite reel
      [slab(0.2, 0.2, 1.6, 0.04), M.steel, 0, 1.95, 2.2, -0.4, 0, 0],                                  // launch rail
      [cyl(0.03, 0.04, 3.2, 5), M.cable, -0.8, 3.6, 1.6],                                             // whip antenna
      ...[-0.6, 0.6].map(x => [slab(0.38, 0.28, 0.2, 0.06), M.tungsten, x, 1.05, -2.75]) ],
      anchors: [{ name: 'hl0', at: [-0.6, 1.05, -2.85], glow: { color: '#ffb36b', size: 1.4, intensity: 2.5 } },
                { name: 'hl1', at: [0.6, 1.05, -2.85], glow: { color: '#ffb36b', size: 1.4, intensity: 2.5 } },
                { name: 'reel', at: [0, 1.9, 2.4] }] },
  };
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    parts['wheel' + i] = { pivot: [sx * 1.25, 0.7, sz * 1.85], parent: 'body', items: [
      [cyl(0.7, 0.7, 0.62, 14), M.rubber, 0, 0, 0, 0, 0, PI / 2],
      [cyl(0.32, 0.32, 0.66, 8), M.steel, 0, 0, 0, 0, 0, PI / 2] ] };
  });
  return { key: 'tick', parts };
}

// ── Kit's kite (L1 §11.7): diamond kite-drone, 4 m span, red nav light (the ribbon tail is built by the runtime) ─────
export function kiteModel(ctx) {
  const M = mats(ctx);
  return { key: 'kite', parts: {
    body: { pivot: [0, 0, 0], items: [
      [front([[0, 2.2], [-2.0, 0], [0, -1.4], [0, 0]], 0.06, 0.01), M.canvas, 0, 0, 0],
      [front([[0, 2.2], [0, 0], [0, -1.4], [2.0, 0]], 0.06, 0.01), M.wake, 0, 0, 0],
      [slab(0.06, 3.6, 0.08, 0.01), M.dark, 0, 0.4, 0.05], [slab(4.0, 0.06, 0.08, 0.01), M.dark, 0, 0, 0.05],
      [torus(0.35, 0.06, 4, 10), M.iron, 0, -0.6, 0.12] ],
      anchors: [{ name: 'nav', at: [0, -1.4, 0.1], glow: { color: '#ff3b2a', size: 0.8, intensity: 3, pulse: 'flicker' } },
                { name: 'tail', at: [0, -1.4, 0] }] },
    nav: { pivot: [0, -1.4, 0.1], parent: 'body', items: [[ball(0.12, 6, 4), M.red, 0, 0, 0]] },
  } };
}

// ── sledge (L1 §11.8 ice_sled): runners, plate deck, stakes, tarp, lamp pole; blocks on the deck ─────────────────
export function sledModel(ctx) {
  const M = mats(ctx);
  const body = [
    ...[-1, 1].map(s => [side([[-6.2, 0.2], [-5.6, 0.7], [5.8, 0.7], [6.2, 0.35], [5.6, 0], [-5.8, 0]], 0.3, 0.06), M.steel, s * 1.4, 0, 0]),
    [slab(3.2, 0.3, 11.0, 0.08), M.iron, 0, 0.9, 0],
    [slab(3.4, 0.12, 10.4, 0.04), M.rust, 0, 1.1, 0],
    ...[-4.6, -1.5, 1.5, 4.6].flatMap(z => [-1, 1].map(s => [slab(0.16, 1.4, 0.16, 0.03), M.dark, s * 1.55, 1.75, z])),
    [side([[4.0, 1.1], [4.4, 2.0], [5.6, 2.0], [5.8, 1.1]], 3.0, 0.15), M.canvas, 0, 0, 0],             // tarp over the gear
    [cyl(0.07, 0.08, 4.2, 6), M.dark, 1.4, 3.0, -5.2],                                                 // lamp pole
    [slab(0.4, 0.35, 0.4, 0.05), M.dark, 1.4, 5.2, -5.2], [slab(0.3, 0.15, 0.3, 0.03), M.tungsten, 1.4, 5.0, -5.2],
    [slab(0.12, 0.2, 0.9, 0.03), M.dark, 0, 0.7, -6.4],                                                // tow eye
  ];
  const parts = { body: { pivot: [0, 0, 0], items: body,
    anchors: [{ name: 'lamp', at: [1.4, 4.95, -5.2], glow: { color: '#ffb36b', size: 1.2, intensity: 2 } }, { name: 'tow', at: [0, 0.7, -6.6] }] } };
  for (let i = 0; i < 3; i++) parts['block' + i] = { pivot: [0, 2.6, -3.0 + i * 3.1], parent: 'body', items: [[slab(2.8, 2.4, 2.8, 0.25), M.iceClear, 0, 0, 0, 0, (i - 1) * 0.08, 0]] };
  return { key: 'sled', parts };
}

/** a Wake recovery flag with a lamp (planted when a sledge is flagged) */
export function recoveryFlagModel(ctx) {
  const M = mats(ctx);
  return { key: 'rflag', parts: { pole: { pivot: [0, 0, 0], items: [
    [cyl(0.06, 0.07, 6.5, 6), M.dark, 0, 3.25, 0],
    [front([[0, 0], [2.2, -0.35], [2.0, -1.2], [0, -1.4]], 0.04, 0.01), M.canvasRed, 0.05, 6.3, 0],
    [slab(0.3, 0.3, 0.3, 0.05), M.tungsten, 0, 5.0, 0] ],
    anchors: [{ name: 'lamp', at: [0, 5.0, 0], glow: { color: '#ffb36b', size: 1.4, intensity: 2.5, pulse: 'flicker' } }] } } };
}
