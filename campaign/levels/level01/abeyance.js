// levels/level01/abeyance.js (P6) — the Abeyance (L1 §11.8; A2 #18: L1's 5 floors and 7° lean): a Founders' colony
// freighter frozen upright in the shelf, 140 m tall, 40 m along the route (local z) by 30 m across (local x), leaning 7°
// toward local +x. The lean is a shear (x += y · tan 7°): floors stay level, so the 2.5D colliders match the visual.
//
// Gameplay layout (local; -z is the direction of travel = east, +x = south of the route):
//  · the hold tunnel at ice level, 22 m wide and 18 m tall, open at both end faces; its ceiling is floor 1 (+22);
//  · floors at +22, +44, +66, +88, +108, each a 3 × 4 grid of 10 m tiles with one tile torn open in a different corner
//    (floor 1 SE, 2 NW, 3 NE, 4 SW, 5 centre-east), so the climb zigzags;
//  · the west (+z) face is torn open from +30 to +110 (the "dollhouse tear");
//  · the stencil (lattice-ring emblem over CARRY THEM HOME. SET THEM DOWN.) on floor 3's north (-x) inner wall;
//  · the crown platform at +122 with the roost (cache B), scaffold landings on the east (-z) face at +25/50/75/100.
import * as THREE from 'three';
import { Builder, cached, instance, mats, slab, side, front, cyl, ball, torus, plane, rock, chamferRect, glowAnchor, decal,
         signTex, rngFor, shared } from './kit.js';

const PI = Math.PI;
const LEAN = Math.tan(7 * PI / 180);
const W = 30, Lz = 40, HX = W / 2, HZ = Lz / 2;
export const FLOORS = [22, 44, 66, 88, 108];
export const CROWN = 122;
const X = (x, y) => x + y * LEAN;                       // sheared x at height y
// open tile per floor: [col (0: -x, 1: centre, 2: +x), row (0: -z … 3: +z)]
const HOLES = [[2, 0], [0, 3], [0, 0], [2, 3], [1, 0]];
const BANDS = [[0, 22], [22, 44], [44, 66], [66, 88], [88, 108], [108, 122]];
const TEAR = [30, 110];

function colliders() {
  const out = [];
  const obox = (x, z, hw, hd, top, bottom, o = {}) => out.push({ type: 'obox', x, z, hw, hd, yaw: 0, top, bottom, surface: 'concrete', ...o });
  // floors (and the hold's ceiling)
  FLOORS.forEach((y, f) => {
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
      if (HOLES[f][0] === c && HOLES[f][1] === r) continue;
      obox(X(-10 + c * 10, y), -15 + r * 10, 5, 5, y + 0.75, y - 0.75);
    }
  });
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) obox(X(-10 + c * 10, CROWN), -15 + r * 10, 5, 5, CROWN + 0.6, CROWN - 0.9);   // crown
  // walls per band; the end faces keep the hold tunnel open below +18 and the +z face is torn from +30 to +110
  for (const [y0, y1] of BANDS) {
    const ym = (y0 + y1) / 2;
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) obox(X(s * (HX - 0.6), ym), -15 + k * 10, 0.7, 5.1, y1, y0);
    for (const s of [-1, 1]) {
      const zf = s * (HZ - 0.6);
      for (let k = 0; k < 3; k++) {
        const xc = -10 + k * 10;
        if (y0 === 0) {   // the tunnel mouth: only the outer 4 m of each end face below +18, a lintel above it
          if (k !== 1) obox(X(xc + (k === 0 ? -2 : 2), ym), zf, 3, 0.7, y1, y0);
          obox(X(xc, 20), zf, 5, 0.7, y1, 18);
          continue;
        }
        if (s > 0 && y1 > TEAR[0] && y0 < TEAR[1] && k === 1) continue;   // the tear (centre panel)
        if (s > 0 && y1 > TEAR[0] + 10 && y0 < TEAR[1] - 10) continue;     // wider in the middle of the tear
        obox(X(xc, ym), zf, 5.1, 0.7, y1, y0);
      }
    }
  }
  // scaffold landings on the east face
  for (const y of [25, 50, 75, 100]) obox(X(0, y), -HZ - 2.6, 4, 2, y + 0.5, y - 0.5);
  return out;
}

const LOW = new WeakMap();   // ctx → the Low-tier single mesh geometry (shared, never disposed)
function build(ctx, p) {
  const M = mats(ctx);
  const make = (B, lod) => {
    const rng = rngFor('abeyance');
    // ── hull plates: vertical bands of 8 × 12 m ceramic plates with gold seams, sheared by the lean ──
    for (let row = 0; row < 11; row++) {
      const y0 = row * 12, y1 = Math.min(y0 + 12, row === 10 ? 140 : y0 + 12), ym = (y0 + y1) / 2, h = y1 - y0;
      const broken = row >= 10;
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {          // long faces (±x)
        const z = -16 + k * 8;
        if (broken && (k > 2 || rng() < 0.4)) continue;               // the stern section torn away above +122
        const hh = broken ? 4 + rng() * 14 : h;
        const m = rng() < 0.3 ? M.ceramicAged : M.ceramic;
        if (lod && (k + row) % 2) { B.add(slab(0.9, hh, 8.1, 0.2), m, X(s * HX, y0 + hh / 2), y0 + hh / 2, z, 0, 0, -0.122); continue; }
        B.add(slab(0.9, hh - 0.25, 7.8, 0.3), m, X(s * HX, y0 + hh / 2), y0 + hh / 2, z, 0, 0, -0.122);
        if (!lod && !broken) B.add(slab(0.18, 0.16, 7.9, 0.03), M.goldDead, X(s * (HX + 0.5), y1), y1 - 0.05, z, 0, 0, -0.122);
        if (!lod && rng() < 0.25) B.add(slab(0.1, hh * (0.4 + rng() * 0.5), 0.5 + rng(), 0.02), M.rust, X(s * (HX + 0.48), ym), ym - hh * 0.1, z + (rng() - 0.5) * 6, 0, 0, -0.122);
      }
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {          // end faces (±z)
        const x = -11.25 + k * 7.5;
        if (y1 <= 18 && Math.abs(x) < 11) continue;                     // hold tunnel mouth
        if (s > 0 && y1 > TEAR[0] && y0 < TEAR[1] && Math.abs(x) < 11 && !(y0 < TEAR[0] && rng() < 0.5)) continue;   // the tear
        if (broken && (s > 0 || rng() < 0.5)) continue;
        const yb = y1 <= 18 ? y0 : Math.max(y0, 18), hh = broken ? 3 + rng() * 10 : y1 - yb;
        const m = rng() < 0.3 ? M.ceramicAged : M.ceramic;
        B.add(slab(7.3, hh - 0.25, 0.9, 0.3), m, X(x, yb + hh / 2), yb + hh / 2, s * HZ, 0, 0, -0.122);
        if (!lod && !broken) B.add(slab(7.4, 0.16, 0.18, 0.03), M.goldDead, X(x, y1), y1 - 0.05, s * (HZ + 0.5), 0, 0, -0.122);
      }
    }
    // jagged frames above the broken top
    for (let i = 0; i < 9; i++) { const h = 6 + rng() * 14, x = -12 + rng() * 24, z = -18 + rng() * 22; B.add(slab(0.5, h, 0.7, 0.1), M.steel, X(x, CROWN + h / 2), CROWN + h / 2, z, (rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4); }
    if (lod) return;
    // ── frame ribs inside the faces ──
    for (let k = 0; k <= 5; k++) for (const s of [-1, 1]) B.add(slab(0.7, 122, 0.7, 0.12), M.steel, X(s * (HX - 1.0), 61), 61, -20 + k * 8, 0, 0, -0.122);
    for (let k = 0; k <= 4; k++) for (const s of [-1, 1]) { if (s > 0 && Math.abs(-15 + k * 7.5) < 11) continue; B.add(slab(0.7, 104, 0.7, 0.12), M.steel, X(-15 + k * 7.5, 70), 70, s * (HZ - 1.0), 0, 0, -0.122); }
    // ── floors: tiles with the torn openings, beams under them, icicles at the tears ──
    FLOORS.forEach((y, f) => {
      for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
        const x = X(-10 + c * 10, y), z = -15 + r * 10;
        if (HOLES[f][0] === c && HOLES[f][1] === r) {
          for (let i = 0; i < 4; i++) B.add(slab(1.5 + rng() * 2, 0.3, 0.8 + rng(), 0.06), M.steel, x + (rng() - 0.5) * 9, y - 0.2, z + (rng() - 0.5) * 9, (rng() - 0.5) * 0.6, rng() * PI, (rng() - 0.5) * 0.5);
          for (let i = 0; i < 5; i++) B.add(cyl(0.2, 0.02, 1.4 + rng() * 2, 5), M.ice, x + (rng() - 0.5) * 9, y - 1.6, z + (rng() < 0.5 ? -4.6 : 4.6));
          continue;
        }
        B.add(slab(9.9, 1.5, 9.9, 0.15), (c + r + f) % 2 ? M.steel : M.iron, x, y, z);
        B.add(slab(9.6, 0.1, 9.6, 0.02), M.ceramicAged, x, y + 0.78, z);
      }
      for (let k = 0; k < 5; k++) B.add(slab(W - 1, 0.8, 0.5, 0.08), M.steel, X(0, y - 1.2), y - 1.2, -20 + k * 10);
    });
    // ── crown: the open top, the Dredge roost (crane gantry, spares shelf, work lamps) ──
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) B.add(slab(9.9, 1.2, 9.9, 0.15), M.iron, X(-10 + c * 10, CROWN), CROWN - 0.1, -15 + r * 10);
    for (const z of [-14, 14]) { B.add(slab(0.6, 12, 0.6, 0.1), M.oxide, X(-12, CROWN + 6), CROWN + 6, z); B.add(slab(0.6, 12, 0.6, 0.1), M.oxide, X(12, CROWN + 6), CROWN + 6, z); }
    B.add(slab(26, 0.8, 0.8, 0.12), M.hazard, X(0, CROWN + 12), CROWN + 12, -14); B.add(slab(26, 0.8, 0.8, 0.12), M.hazard, X(0, CROWN + 12), CROWN + 12, 14);
    B.add(slab(0.8, 0.8, 28, 0.12), M.oxide, X(0, CROWN + 12.6), CROWN + 12.6, 0);
    B.add(slab(5, 3.2, 1.6, 0.15), M.iron, X(6, CROWN + 1.6), CROWN + 1.6, 13);     // spares shelf (cache B)
    for (let i = 0; i < 3; i++) B.add(slab(4.6, 0.12, 1.4, 0.03), M.steel, X(6, CROWN + 0.6 + i), CROWN + 0.6 + i, 13);
    for (const [x, z] of [[-12, -14], [12, 14], [12, -14]]) { B.add(slab(0.9, 0.5, 0.6, 0.08), M.iron, X(x, CROWN + 10), CROWN + 10, z); B.add(slab(0.6, 0.12, 0.4, 0.03), M.sodium, X(x, CROWN + 9.75), CROWN + 9.75, z); }
    // ── the hold: sodium work lamps on the ceiling, cable runs ──
    for (const z of [-12, 0, 12]) { B.add(slab(1.2, 0.5, 0.8, 0.08), M.iron, X(0, 20.6), 20.6, z); B.add(slab(0.9, 0.12, 0.5, 0.03), M.sodium, X(0, 20.3), 20.3, z); }
    for (const s of [-1, 1]) B.add(cyl(0.12, 0.12, 40, 6), M.cable, X(s * 10.5, 17), 17, 0, PI / 2, 0, 0);
    // ── work lamps hung down the climb, one per floor ──
    FLOORS.forEach((y, f) => { const x = X(f % 2 ? -12 : 12, y + 9), z = f % 2 ? 16 : -16; B.add(cyl(0.05, 0.05, 6, 4), M.cable, x, y + 13, z); B.add(slab(0.8, 0.5, 0.8, 0.08), M.iron, x, y + 9.8, z); B.add(slab(0.5, 0.12, 0.5, 0.03), M.sodium, x, y + 9.5, z); });
    // ── scaffold landings on the east face, with rails ──
    for (const y of [25, 50, 75, 100]) {
      B.add(slab(8, 0.5, 4, 0.1), M.iron, X(0, y), y, -HZ - 2.6);
      B.add(slab(8, 0.12, 0.12, 0.02), M.hazard, X(0, y + 1.1), y + 1.1, -HZ - 4.5);
      for (const x of [-3.8, 3.8]) B.add(slab(0.12, 1.1, 0.12, 0.02), M.dark, X(x, y + 0.55), y + 0.55, -HZ - 4.5);
      B.add(slab(0.5, 0.12, 0.4, 0.03), M.sodium, X(3.5, y + 2.4), y + 2.4, -HZ - 1.2);
    }
    // ── the stencil wall: lattice-ring emblem (7 bevelled nodes, hexagonal lattice) on floor 3's north inner wall ──
    const sx = X(-HX + 1.25, 72), sz = -1;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * PI * 2, R = 2.4;
      B.add(ball(0.42, 8, 6), M.goldDead, X(-HX + 1.3, 75 + Math.sin(a) * R), 75 + Math.sin(a) * R, sz + Math.cos(a) * R);
      const a2 = (i + 1) / 7 * PI * 2, mx = (Math.cos(a) + Math.cos(a2)) / 2 * R, my = (Math.sin(a) + Math.sin(a2)) / 2 * R;
      B.add(slab(0.14, 0.18, 2.1, 0.03), M.goldDead, X(-HX + 1.3, 75 + my), 75 + my, sz + mx, -Math.atan2(Math.sin(a2) - Math.sin(a), Math.cos(a2) - Math.cos(a)), 0, 0);
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; B.add(slab(0.14, 0.16, 1.4, 0.03), M.goldDead, X(-HX + 1.3, 75 + Math.sin(a) * 1.0), 75 + Math.sin(a) * 1.0, sz + Math.cos(a) * 1.0, -(a + PI / 2), 0, 0); }
    // ── the ice collar at the base, rime on the windward face ──
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * PI * 2, R = 26 + rng() * 5, x = Math.cos(a) * R * 0.8, z = Math.sin(a) * R;
      if (Math.abs(x) < 12 && Math.abs(z) > 15) continue;   // keep the tunnel mouths clear
      const s = 2 + rng() * 3.5;
      B.add(rock(30 + (i % 6), { cuts: 10, noise: 0.04 }), rng() < 0.6 ? M.ice : M.snow, x, s * 0.3, z, 0, rng() * PI, 0, s, s * 0.8, s);
    }
    for (let i = 0; i < 18; i++) { const y = 10 + rng() * 100; B.add(slab(0.4, 3 + rng() * 6, 2 + rng() * 4, 0.1), M.ice, X(-HX - 0.6, y), y, -18 + rng() * 36, 0, 0, -0.122); }
  };
  const built = cached(ctx, 'abeyance', make, { lod: true });
  const r = instance(ctx, built);
  let root = r.root;
  // Low tier (A1.3, L1 §15.4): the whole hull, interior floors included, as ONE vertex-coloured mesh
  if (ctx.tier?.name === 'low') {
    let g = LOW.get(ctx);
    if (!g) { const B = new Builder(); make(B, false); g = B.single(); LOW.set(ctx, g); }
    root = new THREE.Group();
    const m = new THREE.Mesh(g, M.lod); m.castShadow = true; m.receiveShadow = true; m.name = 'abeyanceLow';
    root.add(m);
  }
  // the stencil words and the seam strip that flickers on as Moth approaches (custom action stencilLight)
  const tex = signTex(ctx, 'CARRY THEM HOME. SET THEM DOWN.', { stencil: true, bg: '#d8d3c5', color: '#3a2e22', weathered: 0.6, w: 1024, h: 128 });
  if (tex) {
    tex.userData.shared = true;
    const words = decal(ctx, tex, 11, 1.4, {});
    words.position.set(X(-HX + 1.36, 70.5), 70.5, -1); words.rotation.y = PI / 2; words.rotation.z = 0;
    words.name = 'stencilWords'; root.add(words);
  }
  const seam = new THREE.Group(); seam.name = 'stencilSeam';
  const seamMatOff = M.cyanDead;
  for (const [y, h, z, w] of [[69.4, 0.12, -1, 12.2], [79.2, 0.12, -1, 12.2], [74.3, 9.9, -7.1, 0.12], [74.3, 9.9, 5.1, 0.12]]) {
    const m = new THREE.Mesh(slab(0.08, h, w, 0.02), seamMatOff); m.position.set(X(-HX + 1.32, y), y, z); seam.add(m);
  }
  root.add(seam);
  const nameTex = signTex(ctx, 'ABEYANCE', { bg: '#c9c3b5', color: '#4a4030', weathered: 0.7, w: 1024, h: 128 });
  if (nameTex) {
    nameTex.userData.shared = true;
    const nm = decal(ctx, nameTex, 36, 4.4, {});
    nm.position.set(X(-HX - 0.5, 72), 72, 6); nm.rotation.set(0, -PI / 2, PI / 2 - 0.122); root.add(nm);
  }
  // glow anchors for the lamps (the runtime attaches ctx.particles.glows when it exists)
  const g = (x, y, z, color, size) => { const o = new THREE.Object3D(); o.position.set(X(x, y), y, z); glowAnchor(o, { color, size, intensity: 3, pulse: 'flicker' }); root.add(o); };
  for (const z of [-12, 0, 12]) g(0, 20.2, z, '#ff9a2e', 2.6);
  FLOORS.forEach((y, f) => g(f % 2 ? -12 : 12, y + 9.4, f % 2 ? 16 : -16, '#ff9a2e', 2.2));
  for (const [x, z] of [[-12, -14], [12, 14], [12, -14]]) g(x, CROWN + 9.6, z, '#ff9a2e', 2.4);
  for (const y of [25, 50, 75, 100]) g(3.5, y + 2.3, -HZ - 1.2, '#ff9a2e', 1.8);
  root.userData.l01 = { seam, seamOff: seamMatOff, seamOn: M.cyan };
  if (ctx.tier?.name === 'low') return { root };
  return { root, lod: r.lod ? (() => { const grp = new THREE.Group(); grp.add(r.lod); return grp; })() : undefined };
}

export const abeyanceType = {
  params: { tilt: 7, height: 140 },
  footprint: () => ({ shape: 'rect', w: 34, d: 44, flatten: false, pad: 20, exclude: 6, h: 'auto' }),
  colliders: () => colliders(),
  anchors: () => ({
    stencil: [X(-HX + 1.5, 72), 72, -1],
    crown: [X(0, CROWN + 1), CROWN + 1, 0],
    cacheB: [X(6, CROWN + 1.5), CROWN + 1.5, 12],
    holdEast: [0, 0, -HZ - 6], holdWest: [0, 0, HZ + 6],
  }),
  build,
};
