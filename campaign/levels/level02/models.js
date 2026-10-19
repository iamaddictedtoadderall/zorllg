// levels/level02/models.js — procedural models for Level 2's raiders (L2 §10), built from bevelled kit pieces in Level 1's
// part format (levels/level01/models.js: named PARTS with pivots; rig() for animated actors, flat() for static merges).
// Model forward is -Z (arch §1.3). Dredge colours (L1 §11): black iron, oxide red, hazard amber; living crews show
// tungsten-amber cab light, ghost-run machines the pale green beacon (addendum 01 A2 #22).
import * as THREE from 'three';
import { slab, side, front, top, cyl, ball, torus, chamferRect, mats2, PI } from './kit2.js';
import * as KIT from '../../src/art/kit.js';

const chev = () => front([[-1.1, -0.18], [0, 0.32], [1.1, -0.18], [1.1, 0.05], [0, 0.55], [-1.1, 0.05]], 0.05, 0.01);

/** a 3 m spoked wheel (rolls about local x) */
function wheelItems(M, r = 1.5, w = 0.55) {
  const out = [
    [cyl(r, r, w, 18), M.rubber, 0, 0, 0, 0, 0, PI / 2],
    [cyl(r * 0.72, r * 0.72, w + 0.08, 16), M.iron, 0, 0, 0, 0, 0, PI / 2],
    [cyl(r * 0.24, r * 0.24, w + 0.3, 10), M.steel, 0, 0, 0, 0, 0, PI / 2],
  ];
  for (let i = 0; i < 6; i++) out.push([slab(0.14, r * 1.3, 0.16, 0.03), M.steel, 0, 0, 0, i * PI / 6, 0, 0]);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════ land-yacht (L2 §10.1)
// 18 m long, a 16 m hinged mast with a stiff lateen sail; tricycle running gear, a ducted stern turbine, two crew hoods
// with warm light; a bow mount: 'raker' (twin drum-fed autogun under a ventilated shroud) or 'hooker' (harpoon launcher
// with a cable drum). The Sail-Rig glint sits on the sail's boom.
export function yachtModel(ctx, variant = 'raker') {
  const M = mats2(ctx);
  const hullP = [[-9, 0.6], [-7, 2.0], [6, 2.2], [9, 1.3], [8.2, 0.4], [-7, 0.2]];
  const hull = [
    [side(hullP, 2.8, 0.12), M.iron, 0, 0, 0],
    [side([[-6.6, 1.9], [5.6, 2.1], [5.6, 2.45], [-6.2, 2.25]], 3.1, 0.06), M.oxide, 0, 0.02, 0],                  // deck plate
    [side([[-8.2, 0.9], [-6.6, 1.75], [-4.0, 1.85], [-4.4, 0.7]], 2.95, 0.05), M.oxide, 0, 0, 0],                   // bow armour
    ...[-1, 1].map(s => [side([[-5, 0.7], [4.6, 0.9], [4.6, 1.35], [-5, 1.15]], 0.08, 0.02), M.hazard, s * 1.43, 0, 0]),   // hazard stripe
    ...[-1, 1].map(s => [chev(), M.hazard, s * 1.45, 1.55, 3.4, 0, s * PI / 2, 0]),
    // two crew hoods with warm light inside (living crew; no figures)
    [slab(1.5, 1.0, 2.0, 0.22), M.darkGlass, -0.6, 2.85, 2.2], [slab(1.5, 1.0, 2.0, 0.22), M.darkGlass, 0.6, 2.85, 0.1],
    [slab(1.3, 0.55, 1.6, 0.1), M.amber, -0.6, 2.6, 2.2], [slab(1.3, 0.55, 1.6, 0.1), M.amber, 0.6, 2.6, 0.1],
    // the outrigger beam (8 m) and its struts, the bow wheel fork
    [slab(8.4, 0.45, 0.7, 0.1), M.iron, 0, 1.6, 2.4],
    ...[-1, 1].map(s => [slab(0.35, 0.35, 2.6, 0.06), M.steel, s * 2.4, 1.6, 2.4, 0, 0.6 * s, 0]),
    [slab(0.6, 1.4, 0.6, 0.1), M.dark, 0, 1.0, -6.6],
    // mast step, stern duct
    [cyl(0.42, 0.5, 0.9, 10), M.dark, 0, 2.7, -1.0],
    [torus(1.15, 0.24, 6, 16), M.iron, 0, 2.7, 8.4],
    [cyl(0.28, 0.28, 0.9, 8), M.dark, 0, 2.7, 8.0, PI / 2, 0, 0],
    [KIT.greebles(() => 0.41, 1.2, 0.6, 1.0), M.steel, 1.42, 1.25, -1.5, 0, PI / 2, 0],
  ];
  const sail = [];
  // three battened panels of thin plates, oxide red with a black chevron (the sail's own frame: z aft, y up from the yard)
  const panels = [[[0, 0], [0.4, 4.2], [4.2, 3.4], [3.6, 0]], [[0.4, 4.2], [0.9, 8.6], [4.8, 6.6], [4.2, 3.4]], [[0.9, 8.6], [1.4, 12.4], [5.0, 9.6], [4.8, 6.6]]];
  panels.forEach((p, i) => sail.push([side(p, 0.08, 0.02), i === 1 ? M.sail : M.oxide, 0, 0, 0]));
  for (const y of [4.2, 8.6]) sail.push([slab(0.12, 0.12, 4.6, 0.02), M.dark, 0.06, y - 0.4, 2.4, 0, 0, 0]);   // battens
  sail.push([side([[1.0, 5.6], [2.6, 7.0], [3.9, 5.4], [3.9, 6.1], [2.6, 7.7], [1.0, 6.3]], 0.1, 0.02), M.dark, 0.04, 0, 0]);   // chevron
  sail.push([cyl(0.1, 0.1, 5.2, 6), M.steel, 0, 0.1, 2.4, PI / 2, 0, 0]);                                     // the boom (glint)
  const parts = {
    hull: { pivot: [0, 0, 0], items: hull, anchors: [{ name: 'cab', at: [0, 3.0, 1.0] }] },
    mast: { pivot: [0, 3.1, -1.0], parent: 'hull', items: [
      [cyl(0.2, 0.3, 15.6, 8), M.steel, 0, 7.8, 0],
      [cyl(0.08, 0.08, 9, 6), M.cable, 0, 4.4, 3.6, 0.48, 0, 0],
      [ball(0.3, 8, 6), M.sodium, 0, 15.7, 0] ],
      anchors: [{ name: 'lamp', at: [0, 15.7, 0], glow: { color: '#ff9a2e', size: 1.1, intensity: 2.5, pulse: 'flicker' } }] },
    sail: { pivot: [0, 1.4, 0.25], parent: 'mast', items: sail, anchors: [{ name: 'boom', at: [0, 0.1, 2.4] }] },
    wheelL: { pivot: [-4.1, 1.5, 2.4], parent: 'hull', items: wheelItems(M) },
    wheelR: { pivot: [4.1, 1.5, 2.4], parent: 'hull', items: wheelItems(M) },
    wheelB: { pivot: [0, 1.2, -6.6], parent: 'hull', items: wheelItems(M, 1.2, 0.45) },
    fan: { pivot: [0, 2.7, 8.4], parent: 'hull', items: [0, 1, 2, 3, 4].map(i => [slab(0.24, 1.05, 0.06, 0.02), M.steel, 0, 0, 0, 0, 0, i * 2 * PI / 5]) },
    gun: { pivot: [0, 2.5, -5.4], parent: 'hull', items: variant === 'hooker' ? [
        [slab(0.9, 0.8, 1.3, 0.1), M.iron, 0, 0.3, 0.2],
        [cyl(0.22, 0.28, 4.0, 10), M.steel, 0, 0.55, -1.8, PI / 2, 0, 0],                       // the 4 m harpoon launcher
        [cyl(0.6, 0.6, 0.8, 14), M.oxide, 0.9, 0.35, 0.4, 0, 0, PI / 2],                        // cable drum
        [side([[-0.45, -0.12], [0, 0.4], [0.45, -0.12]], 0.14, 0.02), M.steel, 0, 0.55, -3.9] ]
      : [
        [slab(1.0, 0.8, 1.4, 0.12), M.iron, 0, 0.35, 0.1],
        ...[-1, 1].map(s => [cyl(0.36, 0.36, 1.9, 12), M.steel, s * 0.42, 0.45, -1.1, PI / 2, 0, 0]),   // twin ventilated shrouds
        [cyl(0.5, 0.5, 0.7, 14), M.oxide, 0, 0.5, 0.5, 0, 0, PI / 2],                          // drum feed
        ...[0, 1, 2].map(i => [slab(0.08, 0.5, 1.4, 0.02), M.dark, (i - 1) * 0.42, 0.85, -1.1]) ],
      anchors: [{ name: 'muzzle', at: [0, 0.5, variant === 'hooker' ? -3.9 : -2.1] }] },
  };
  return { key: 'l02yacht:' + variant, parts };
}

// ════════════════════════════════════════════════════════════════════════════════ Skimmer (L2 §10.3, §10.6)
// A 9 m wedge hull on four ducted hover-skids (blue-white jets), a twin nose gun, a two-tube missile pod; the pale green
// beacon on its low cab (ghost-run). `command`: Rusk's two-seat command sled, 12 m, tungsten-lit tinted cab, no beacon.
export function skimmerModel(ctx, o = {}) {
  const M = mats2(ctx);
  const L = o.command ? 1.3 : 1;
  const z = (v) => v * L;
  const hull = [
    [side([[z(-4.6), 0.2], [z(-2.6), 1.25], [z(3.6), 1.45], [z(4.6), 0.75], [z(4.2), -0.15], [z(-3.2), -0.35]], 2.6, 0.14), M.iron, 0, 0, 0],
    [side([[z(-3.4), 0.75], [z(-1.8), 1.35], [z(2.2), 1.5], [z(2.6), 1.05]], 3.0, 0.08), M.oxide, 0, 0.02, 0],
    ...[-1, 1].map(s => [side([[z(-3.8), 0.15], [z(3.8), 0.3], [z(3.8), 0.6], [z(-3.4), 0.5]], 0.08, 0.02), M.hazard, s * 1.32, 0, 0]),
    ...[-1, 1].map(s => [chev(), M.hazard, s * 1.36, 0.95, z(1.6), 0, s * PI / 2, 0]),
    // the low cab: tinted dark glass; Rusk's is lit tungsten from inside
    [side([[z(-1.6), 1.3], [z(-0.6), 2.1], [z(o.command ? 1.9 : 0.9), 2.15], [z(o.command ? 2.4 : 1.5), 1.4]], 1.7, 0.1), M.darkGlass, 0, 0, 0],
    ...(o.command ? [[slab(1.3, 0.4, z(2.6), 0.08), M.tungsten, 0, 1.75, z(0.4)]] : []),
    [KIT.greebles(() => 0.29, 1.4, 0.7, 1.0), M.steel, 0, 1.47, z(2.8), -PI / 2, 0, 0],
    // nose gun (twin) and its housing
    [slab(1.0, 0.5, 1.0, 0.1), M.dark, 0, 0.55, z(-3.6)],
    ...[-1, 1].map(s => [cyl(0.12, 0.14, 1.6, 8), M.steel, s * 0.28, 0.55, z(-4.5), PI / 2, 0, 0]),
  ];
  // four ducted skids on short struts (blue-white jet glow underneath)
  const skids = {};
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    skids['skid' + i] = { pivot: [sx * 1.75, 0.0, sz * z(2.6)], parent: 'hull', items: [
      [slab(0.3, 0.3, 1.0, 0.05), M.steel, -sx * 0.35, 0.35, 0, 0, 0, sx * 0.5],
      [torus(0.62, 0.17, 6, 14), M.iron, 0, -0.25, 0, PI / 2, 0, 0],
      [cyl(0.5, 0.58, 0.5, 12), M.dark, 0, -0.25, 0],
      [cyl(0.36, 0.36, 0.06, 10), M.jet, 0, -0.52, 0] ],
      anchors: [{ name: 'jet' + i, at: [0, -0.62, 0], glow: { color: '#bfe4ff', size: 1.6, intensity: 2.2, pulse: 'flicker' } }] };
  });
  const parts = {
    hull: { pivot: [0, 0, 0], items: hull, anchors: [
      { name: 'beacon', at: [0, 2.25, z(0.2)], ...(o.command ? {} : { glow: { color: '#a8ff9e', size: 0.55, intensity: 6, pulse: 'beat', minPx: 4 } }) },
      { name: 'muzzle', at: [0, 0.55, z(-5.3)] }, { name: 'skates', at: [1.75, -0.3, z(2.6)] }] },
    ...skids,
    pod: { pivot: [0, 1.5, z(2.0)], parent: 'hull', items: [
      [slab(1.5, 0.8, 1.9, 0.12), M.oxide, 0, 0.4, 0],
      ...[-1, 1].map(s => [cyl(0.24, 0.24, 1.9, 10), M.dark, s * 0.38, 0.45, -0.05, PI / 2, 0, 0]) ],
      anchors: [{ name: 'tube0', at: [-0.38, 0.45, -1.1] }, { name: 'tube1', at: [0.38, 0.45, -1.1] }] },
  };
  if (!o.command) parts.hull.items.push([ball(0.26, 10, 8), M.ghostLens, 0, 2.25, z(0.2)]);
  return { key: 'l02skimmer:' + (o.command ? 'cmd' : 'std'), parts };
}

// ════════════════════════════════════════════════════════════════════════════════ harpooner additions (L2 §10.2)
// Built on the prototype walker (art/units.js, scale 0.75): a cable gun on a raised back mount and a fat box magazine
// that turns its turret guns into the rivet gun (the Rivet Driver glint sits on it).
export function harpoonerExtras(ctx) {
  const M = mats2(ctx);
  return {
    cableGun: [
      [slab(1.0, 0.8, 1.2, 0.1), M.iron, 0, 0, 0],
      [cyl(0.24, 0.3, 5.0, 10), M.steel, 0, 0.35, -2.3, PI / 2, 0, 0],
      [cyl(0.62, 0.62, 0.9, 14), M.oxide, 0, 0.1, 0.6, 0, 0, PI / 2],
      [side([[-0.5, -0.14], [0, 0.45], [0.5, -0.14]], 0.16, 0.02), M.steel, 0, 0.35, -4.9],
      [slab(0.4, 1.5, 0.4, 0.06), M.dark, 0, -0.9, 0.2] ],
    magazine: [
      [slab(1.0, 1.1, 1.3, 0.12), M.oxide, 0, -0.3, 0.6],
      [slab(1.04, 0.14, 1.34, 0.03), M.hazard, 0, 0.1, 0.6] ],
  };
}

// ════════════════════════════════════════════════════════════════════════════════ rockets (the Tally's battery)
// A Dredge rocket: drawn by the engine's 'missile' projectile kind; the launch flash is an fx muzzle.
export const ROCKET = { kind: 'missile' };
export { THREE };
