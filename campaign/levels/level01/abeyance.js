// levels/level01/abeyance.js (P6) — the Abeyance (L1 §11.8; A2 #18: L1's 5 floors and 7° lean; AD §2.17 look): a
// Founders' colony freighter frozen upright in the shelf, 140 m tall, 40 m along the route (local z) by 30 m across
// (local x), leaning 7° toward local +x. The lean is a SHEAR (x += y · tan 7°) applied to the whole upright build, so
// floors and plate rows stay level and the 2.5D colliders (sheared the same way) match the visual.
//
// Gameplay layout (local; -z is the direction of travel = east, +x = south of the route):
//  · the hold tunnel at ice level, 22 m wide and 18 m tall, open at both end faces; its ceiling is floor 1 (+22);
//  · floors at +22, +44, +66, +88, +108, each a 3 × 4 grid of 10 m tiles with one tile torn open in a different corner
//    (floor 1 SE, 2 NW, 3 NE, 4 SW, 5 centre-east), so the climb zigzags;
//  · the west (+z) face is torn open from +30 to +110 (the "dollhouse tear");
//  · the stencil (lattice-ring emblem over CARRY THEM HOME. SET THEM DOWN.) on floor 3's north (-x) inner wall;
//  · the crown platform at +122 with the roost (cache B), scaffold landings on the east (-z) face at +25/50/75/100.
//
// Look (AD §1.3 Founders, §2.17): an octagonal hull (3 m corner chamfers) of aged ceramic plates in an A-A-B rhythm over
// a dark seam backing, steel frame belts every 24 m with icicle curtains and snow on their ledges, porthole rows and
// ladders as scale cues, two swept stern fins at the base (the stern is down in the ice), plates missing in places
// (dark recesses, exposed ribs), the torn superstructure crown and a bent mast. Value: it reads darker than the snow it
// stands in, so it is a dark needle against the dawn rim at range. LOD1 (beyond structureLodDist) is the exterior only;
// the Low tier is one merged vertex-coloured mesh (A1.3).
import * as THREE from 'three';
import { Builder, cached, instance, mats, slab, front, cyl, ball, torus, rock, glowAnchor, decal, signTex, rngFor, compose,
         matColor } from './kit.js';

const PI = Math.PI;
const LEAN = Math.tan(7 * PI / 180);
const W = 30, Lz = 40, HX = W / 2, HZ = Lz / 2;
const CH = 3;                                  // corner chamfer in plan (the octagon)
export const FLOORS = [22, 44, 66, 88, 108];
export const CROWN = 122;
const X = (x, y) => x + y * LEAN;              // sheared x at height y (colliders, anchors, decals)
// open tile per floor: [col (0: -x, 1: centre, 2: +x), row (0: -z … 3: +z)]
const HOLES = [[2, 0], [0, 3], [0, 0], [2, 3], [1, 0]];
const BANDS = [[0, 22], [22, 44], [44, 66], [66, 88], [88, 108], [108, 122]];
const TEAR = [30, 110];
// plate rhythm (A-A-B, AD §1.4): along the ±x faces (z from -17 to 17) and across the ±z faces (x from -12 to 12)
const LONG = [7.5, 7.5, 4, 7.5, 7.5];
const END = [9, 6, 9];
const ROWS = 10, ROW_H = 12;                   // full plate rows to +120; the broken stern section above
const BELTS = [24, 48, 72, 96, 120];
const FIN = { z: 0, out: 13, h: 44, t: 1.8 };  // the swept stern fins on the ±x faces

const SHEAR = new THREE.Matrix4().set(1, LEAN, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const cells = (list, from) => { let a = from; return list.map(w => { const c = { c: a + w / 2, w }; a += w; return c; }); };
const LONG_CELLS = cells(LONG, -17), END_CELLS = cells(END, -12);

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
  // walls per band, following the octagon: the long faces span z -17..17, the end faces x -12..12, plus 4 corner walls.
  // The end faces keep the hold tunnel open below +18 (|x| < 11), and the +z face is torn open from +30 to +110.
  for (const [y0, y1] of BANDS) {
    const ym = (y0 + y1) / 2;
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) obox(X(s * (HX - 0.6), ym), -12.75 + k * 8.5, 0.7, 4.35, y1, y0);
    for (const s of [-1, 1]) {
      const zf = s * (HZ - 0.6);
      if (y0 === 0) {   // the tunnel mouth: 1 m stubs either side below +18, a lintel above it
        for (const sx of [-1, 1]) obox(X(sx * 11.6, ym), zf, 0.6, 0.7, y1, y0);
        obox(X(0, 20), zf, 11.5, 0.7, y1, 18);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const xc = -8 + k * 8;
        if (s > 0 && y1 > TEAR[0] && y0 < TEAR[1] && k === 1) continue;   // the tear (centre panel)
        if (s > 0 && y1 > TEAR[0] + 10 && y0 < TEAR[1] - 10) continue;     // wider in the middle of the tear
        obox(X(xc, ym), zf, 4.1, 0.7, y1, y0);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // the chamfered corners
      out.push({ type: 'obox', x: X(sx * (HX - CH / 2 - 0.3), ym), z: sz * (HZ - CH / 2 - 0.3), hw: CH * 0.75, hd: 0.7,
                 yaw: Math.atan2(sx, sz), top: y1, bottom: y0, surface: 'concrete' });
    }
  }
  // scaffold landings on the east face
  for (const y of [25, 50, 75, 100]) obox(X(0, y), -HZ - 2.6, 4, 2, y + 0.5, y - 0.5);
  // the torn door leaf leaning on the ice outside the east tunnel mouth
  out.push({ type: 'obox', x: X(-6.5, 4), z: -HZ - 5.5, hw: 5, hd: 2.2, yaw: -0.18, top: 9, surface: 'concrete' });
  // the stern fins (swept: tall at the hull, low at the tip)
  for (const s of [-1, 1]) {
    obox(X(s * (HX + 3.5), 16), FIN.z, 3.5, FIN.t / 2 + 0.2, 34, -2);
    obox(X(s * (HX + 9.5), 4), FIN.z, 3.5, FIN.t / 2 + 0.2, 11, -2);
  }
  return out;
}

const LOW = new WeakMap();   // ctx → the Low-tier single mesh geometry (shared, never disposed)
const SEAM_GEO = new WeakMap();
/** fills a Builder with the hull. lod = exterior silhouette only (LOD1, the skyline impostor). */
function make(ctx, B, lod) {
  const M = mats(ctx);
  const rng = rngFor('abeyance');
  // everything is built upright, then sheared by the lean
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    B.addM(geo, mat, SHEAR.clone().multiply(compose(x, y, z, rx, ry, rz, sx, sy, sz)));
  const plateMat = () => { const r = rng(); return r < 0.18 ? M.ceramic : r < 0.62 ? M.ceramicAged : M.ceramicGrey; };
  const damaged = new Set(['x-1:6:3', 'x-1:7:3', 'x1:4:0', 'x1:8:1', 'z-1:5:1', 'z-1:6:1', 'x1:2:4', 'z-1:8:0', 'x-1:9:0']);

  // ── hull plates: rows of 12 m, plates over a dark seam backing; corners chamfered ──
  for (let row = 0; row < ROWS; row++) {
    const y0 = row * ROW_H, y1 = y0 + ROW_H;
    // long faces (±x)
    for (const s of [-1, 1]) LONG_CELLS.forEach((cell, k) => {
      const key = `x${s}:${row}:${k}`, ym = (y0 + y1) / 2;
      if (lod) { if (k === 0) add(slab(0.9, ROW_H, 34, 0.25), row % 3 === 1 ? M.ceramicGrey : M.ceramicAged, s * HX, ym, 0); return; }
      add(slab(0.4, ROW_H, cell.w + 0.1, 0.05), M.dark, s * (HX - 0.55), ym, cell.c);                    // seam backing
      if (damaged.has(key)) {                                                                              // a missing plate
        for (let i = 0; i < 3; i++) add(slab(0.25, 0.5, cell.w * (0.5 + rng() * 0.4), 0.05), M.steel, s * (HX - 0.2), y0 + 2 + i * 4 + rng(), cell.c);
        add(slab(0.4, ROW_H * 0.45, cell.w * 0.6, 0.12), plateMat(), s * (HX + 0.1), y0 + ROW_H * 0.25, cell.c - cell.w * 0.15, 0.08, 0, s * 0.12);
        return;
      }
      add(slab(0.9, ROW_H - 0.3, cell.w - 0.3, 0.3), plateMat(), s * HX, ym, cell.c);
      if (rng() < 0.3) add(slab(0.3, ROW_H * 0.42, cell.w * 0.62, 0.12), plateMat(), s * (HX + 0.55), y0 + ROW_H * (0.3 + rng() * 0.35), cell.c + (rng() - 0.5) * cell.w * 0.2);   // doubler
      if (rng() < 0.25) add(slab(0.1, ROW_H * (0.35 + rng() * 0.45), 0.4 + rng() * 0.7, 0.02), M.rust, s * (HX + 0.48), y0 + ROW_H * 0.45, cell.c + (rng() - 0.5) * cell.w * 0.6);
      add(slab(0.2, 0.16, cell.w - 0.4, 0.03), M.goldDead, s * (HX + 0.48), y1 - 0.6, cell.c);           // dead gold seam
      if (row % 2 === 0 && row > 0 && row < 9 && cell.w > 5) for (const dz of [-1.6, 1.6]) {           // porthole pair
        add(torus(0.62, 0.11, 4, 12), M.steel, s * (HX + 0.46), y0 + 7.4, cell.c + dz, 0, PI / 2, 0);
        add(cyl(0.55, 0.55, 0.2, 10), M.dark, s * (HX + 0.4), y0 + 7.4, cell.c + dz, 0, 0, PI / 2);
      }
    });
    // end faces (±z)
    for (const s of [-1, 1]) END_CELLS.forEach((cell, k) => {
      const key = `z${s}:${row}:${k}`;
      let yb = y0, ye = y1;
      if (y1 <= 18) return;                                                       // the hold tunnel mouth
      if (y0 < 18) yb = 18;
      const inTear = s > 0 && ((k === 1 && y1 > TEAR[0] && y0 < TEAR[1]) || (y1 > TEAR[0] + 12 && y0 < TEAR[1] - 12));
      if (inTear) {
        // torn plate fragments along the edges of the tear (bent outward)
        if (!lod && (y0 < TEAR[0] + 12 || y1 > TEAR[1] - 12 || k !== 1) && rng() < 0.6) {
          add(slab(cell.w * (0.3 + rng() * 0.3), 3 + rng() * 5, 0.5, 0.1), plateMat(), cell.c + (rng() - 0.5) * 3, (yb + ye) / 2 + (rng() - 0.5) * 6, s * (HZ + 0.6), (rng() - 0.5) * 0.9 + s * 0.4, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.6);
        }
        return;
      }
      const h = ye - yb, ym = (yb + ye) / 2;
      if (lod) { add(slab(cell.w + 0.1, h, 0.9, 0.25), M.ceramicAged, cell.c, ym, s * HZ); return; }
      add(slab(cell.w + 0.1, h, 0.4, 0.05), M.dark, cell.c, ym, s * (HZ - 0.55));
      if (damaged.has(key)) {
        for (let i = 0; i < 3; i++) add(slab(cell.w * (0.5 + rng() * 0.4), 0.5, 0.25, 0.05), M.steel, cell.c, yb + 2 + i * 4 + rng(), s * (HZ - 0.2));
        return;
      }
      add(slab(cell.w - 0.3, h - 0.3, 0.9, 0.3), plateMat(), cell.c, ym, s * HZ);
      if (rng() < 0.3) add(slab(cell.w * 0.6, h * 0.4, 0.3, 0.12), plateMat(), cell.c + (rng() - 0.5) * cell.w * 0.2, yb + h * (0.35 + rng() * 0.3), s * (HZ + 0.55));
      if (rng() < 0.3) add(slab(0.4 + rng() * 0.7, h * (0.35 + rng() * 0.45), 0.1, 0.02), M.rust, cell.c + (rng() - 0.5) * cell.w * 0.6, yb + h * 0.45, s * (HZ + 0.48));
      add(slab(cell.w - 0.4, 0.16, 0.2, 0.03), M.goldDead, cell.c, ye - 0.6, s * (HZ + 0.48));
    });
    // the four chamfered corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const yaw = Math.atan2(sx, sz), cx = sx * (HX - CH / 2), cz = sz * (HZ - CH / 2);
      if (!lod) add(slab(CH * 1.414 + 0.3, ROW_H, 0.4, 0.05), M.dark, cx - sx * 0.4, (y0 + y1) / 2, cz - sz * 0.4, 0, yaw, 0);
      add(slab(CH * 1.414 - (lod ? 0 : 0.3), ROW_H - (lod ? 0 : 0.3), 0.9, lod ? 0.25 : 0.3), lod ? M.ceramicAged : plateMat(), cx, (y0 + y1) / 2, cz, 0, yaw, 0);
    }
  }

  // ── frame belts every 24 m: steel bands around the octagon, snow on the ledge, icicle curtains under them ──
  for (const y of BELTS) {
    for (const s of [-1, 1]) {
      add(slab(1.3, 1.4, 34.4, 0.25), M.steel, s * (HX + 0.55), y, 0);
      if (s > 0 && y > TEAR[0] && y < TEAR[1]) {                                  // the belt is torn with the face
        for (const sx of [-1, 1]) add(slab(4.5, 1.4, 1.3, 0.25), M.steel, sx * 10.2, y, s * (HZ + 0.55), 0, 0, sx * 0.25);
      } else add(slab(24.4, 1.4, 1.3, 0.25), M.steel, 0, y, s * (HZ + 0.55));
      if (!lod) {
        add(slab(0.7, 0.35, 33.8, 0.08), M.snow, s * (HX + 0.95), y + 0.85, 0);
        for (let i = 0; i < 9; i++) { const z = -16 + rng() * 32, l = 0.8 + rng() * 2.6; add(cyl(0.18 + rng() * 0.12, 0.02, l, 5), M.ice, s * (HX + 0.9), y - 0.7 - l / 2, z); }
      }
    }
    if (!lod) for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(slab(CH * 1.414 + 0.6, 1.4, 1.3, 0.25), M.steel, sx * (HX - CH / 2 + 0.4), y, sz * (HZ - CH / 2 + 0.4), 0, Math.atan2(sx, sz), 0);
  }

  // ── the stern fins: swept plates rising out of the ice on the ±x faces, an armour layer and a dark edge ──
  for (const s of [-1, 1]) {
    const pts = [[0, -3], [FIN.out, -3], [FIN.out, 4], [FIN.out - 2.5, 9], [3.5, FIN.h - 6], [0, FIN.h]].map(([x, y]) => [s * x, y]);
    if (s < 0) pts.reverse();
    add(front(pts, FIN.t, 0.35), lod ? M.ceramicAged : M.ceramicGrey, s * HX, 0, FIN.z);
    if (!lod) {
      const p2 = [[0.5, 2], [FIN.out - 3, 2], [FIN.out - 3.5, 7], [3.2, FIN.h - 12], [0.5, FIN.h - 9]].map(([x, y]) => [s * x, y]);
      if (s < 0) p2.reverse();
      add(front(p2, FIN.t + 0.5, 0.2), M.ceramicAged, s * HX, 0, FIN.z);
      add(slab(0.6, 22, FIN.t + 0.7, 0.15), M.steel, s * (HX + 7.2), 15, FIN.z, 0, 0, -s * 0.62);   // leading-edge spar
      for (let i = 0; i < 4; i++) add(cyl(0.22, 0.02, 1.2 + rng() * 2.2, 5), M.ice, s * (HX + 6 + rng() * 5), 2.5 + rng() * 6, FIN.z + (rng() - 0.5) * 1.2);
    }
  }

  // ── the broken stern section above the crown: jagged plates, torn frames, the bent mast ──
  for (let i = 0; i < 12; i++) {
    const side = i % 4, h = 4 + rng() * 14;
    const along = -14 + rng() * 22;
    const [x, z, yaw] = side === 0 ? [-HX, along, PI / 2] : side === 1 ? [HX, along, PI / 2] : side === 2 ? [along * 0.6, -HZ, 0] : [along * 0.5, -HZ + 6, 0];
    add(slab(3 + rng() * 5, h, 0.8, 0.2), lod ? M.ceramicAged : plateMat(), x, CROWN + h / 2 - 1, z, (rng() - 0.5) * 0.25, yaw, (rng() - 0.5) * 0.35);
  }
  for (let i = 0; i < 9; i++) { const h = 6 + rng() * 14, x = -12 + rng() * 24, z = -18 + rng() * 22; add(slab(0.5, h, 0.7, 0.1), M.steel, x, CROWN + h / 2, z, (rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4); }
  // the mast: a lattice spar up from the crown's north-east corner, bent over two-thirds of the way up
  {
    const mx = -11, mz = -15, h1 = 26, h2 = 18, bend = 0.75;
    add(cyl(0.55, 0.75, h1, 8), M.steel, mx, CROWN + h1 / 2, mz);
    add(cyl(0.4, 0.55, h2, 8), M.steel, mx + Math.sin(bend) * h2 / 2, CROWN + h1 + Math.cos(bend) * h2 / 2, mz, 0, 0, -bend);
    if (!lod) {
      for (let i = 1; i < 5; i++) add(slab(3.2 - i * 0.4, 0.25, 0.25, 0.05), M.steel, mx, CROWN + i * 5.5, mz, 0, PI / 4, 0);   // yards
      add(cyl(0.06, 0.06, 30, 4), M.dark, mx + 6, CROWN + 14, mz + 3, 0.15, 0, 0.42);                                       // a loose stay
    }
  }
  if (lod) return;

  // ── the tunnel mouths: heavy door frames (a mech-scale cue), one torn door leaf leaning on the ice ──
  for (const s of [-1, 1]) {
    for (const sx of [-1, 1]) add(slab(1.4, 18.6, 1.6, 0.3), M.steel, sx * 11.6, 9.3, s * (HZ + 0.2));
    add(slab(24.6, 1.6, 1.6, 0.3), M.steel, 0, 18.4, s * (HZ + 0.2));
    add(slab(23, 0.7, 1.1, 0.15), M.hazard, 0, 17.2, s * (HZ + 0.5));
  }
  add(slab(10, 16, 0.8, 0.3), M.ceramicGrey, -6.5, 6.4, -HZ - 5.5, -0.42, 0.18, 0.06);
  // ── frame ribs inside the faces (seen through the tear, the tunnel and the missing plates) ──
  for (let k = 0; k <= 5; k++) for (const s of [-1, 1]) add(slab(0.7, 122, 0.7, 0.12), M.steel, s * (HX - 1.0), 61, -17 + k * 6.8);
  for (let k = 0; k <= 4; k++) for (const s of [-1, 1]) { const x = -12 + k * 6; if (s > 0 && Math.abs(x) < 11) continue; add(slab(0.7, 104, 0.7, 0.12), M.steel, x, 70, s * (HZ - 1.0)); }
  // ── floors: tiles with the torn openings, beams under them, icicles at the tears ──
  FLOORS.forEach((y, f) => {
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
      const x = -10 + c * 10, z = -15 + r * 10;
      if (HOLES[f][0] === c && HOLES[f][1] === r) {
        for (let i = 0; i < 4; i++) add(slab(1.5 + rng() * 2, 0.3, 0.8 + rng(), 0.06), M.steel, x + (rng() - 0.5) * 9, y - 0.2, z + (rng() - 0.5) * 9, (rng() - 0.5) * 0.6, rng() * PI, (rng() - 0.5) * 0.5);
        for (let i = 0; i < 5; i++) add(cyl(0.2, 0.02, 1.4 + rng() * 2, 5), M.ice, x + (rng() - 0.5) * 9, y - 1.6, z + (rng() < 0.5 ? -4.6 : 4.6));
        continue;
      }
      add(slab(9.9, 1.5, 9.9, 0.15), (c + r + f) % 2 ? M.steel : M.iron, x, y, z);
      add(slab(9.6, 0.1, 9.6, 0.02), M.ceramicAged, x, y + 0.78, z);
    }
    for (let k = 0; k < 5; k++) add(slab(W - 1, 0.8, 0.5, 0.08), M.steel, 0, y - 1.2, -20 + k * 10);
    // a cargo rack on every floor against the south wall (scale cue, cover)
    const rz = f % 2 ? 8 : -8;
    add(slab(2.2, 3.2, 7, 0.12), M.iron, HX - 3, y + 2.4, rz);
    for (let i = 0; i < 3; i++) add(cyl(0.9, 0.9, 1.4, 10), M.iron, HX - 3, y + 1.6, rz - 2.4 + i * 2.4, PI / 2, 0, 0);
  });
  // ── crown: the open top, the Dredge roost (crane gantry, spares shelf, work lamps) ──
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) add(slab(9.9, 1.2, 9.9, 0.15), M.iron, -10 + c * 10, CROWN - 0.1, -15 + r * 10);
  for (const z of [-14, 14]) { add(slab(0.6, 12, 0.6, 0.1), M.rust, -12, CROWN + 6, z); add(slab(0.6, 12, 0.6, 0.1), M.rust, 12, CROWN + 6, z); }
  add(slab(26, 0.8, 0.8, 0.12), M.hazard, 0, CROWN + 12, -14); add(slab(26, 0.8, 0.8, 0.12), M.hazard, 0, CROWN + 12, 14);
  add(slab(0.8, 0.8, 28, 0.12), M.rust, 0, CROWN + 12.6, 0);
  add(slab(5, 3.2, 1.6, 0.15), M.iron, 6, CROWN + 1.6, 13);     // spares shelf (cache B)
  for (let i = 0; i < 3; i++) add(slab(4.6, 0.12, 1.4, 0.03), M.steel, 6, CROWN + 0.6 + i, 13);
  for (const [x, z] of [[-12, -14], [12, 14], [12, -14]]) { add(slab(0.9, 0.5, 0.6, 0.08), M.iron, x, CROWN + 10, z); add(slab(0.6, 0.12, 0.4, 0.03), M.sodium, x, CROWN + 9.75, z); }
  // ── the hold: sodium work lamps on the ceiling, cable runs ──
  for (const z of [-12, 0, 12]) { add(slab(1.2, 0.5, 0.8, 0.08), M.iron, 0, 20.6, z); add(slab(0.9, 0.12, 0.5, 0.03), M.sodium, 0, 20.3, z); }
  for (const s of [-1, 1]) add(cyl(0.12, 0.12, 40, 6), M.dark, s * 10.5, 17, 0, PI / 2, 0, 0);
  // ── work lamps hung down the climb, one per floor ──
  FLOORS.forEach((y, f) => { const x = f % 2 ? -12 : 12, z = f % 2 ? 16 : -16; add(cyl(0.05, 0.05, 6, 4), M.dark, x, y + 13, z); add(slab(0.8, 0.5, 0.8, 0.08), M.iron, x, y + 9.8, z); add(slab(0.5, 0.12, 0.5, 0.03), M.sodium, x, y + 9.5, z); });
  // ── scaffold landings on the east face, with rails, and ladders between them ──
  for (const y of [25, 50, 75, 100]) {
    add(slab(8, 0.5, 4, 0.1), M.iron, 0, y, -HZ - 2.6);
    add(slab(8, 0.12, 0.12, 0.02), M.hazard, 0, y + 1.1, -HZ - 4.5);
    for (const x of [-3.8, 3.8]) add(slab(0.12, 1.1, 0.12, 0.02), M.dark, x, y + 0.55, -HZ - 4.5);
    add(slab(0.5, 0.12, 0.4, 0.03), M.sodium, 3.5, y + 2.4, -HZ - 1.2);
    for (const x of [-3.2, -2.4]) add(cyl(0.05, 0.05, 25, 4), M.dark, x, y - 12.5, -HZ - 1.0);
    for (let i = 1; i < 41; i++) add(cyl(0.035, 0.035, 0.8, 4), M.dark, -2.8, y - i * 0.6, -HZ - 1.0, 0, 0, PI / 2);
  }
  // ── the stencil wall: lattice-ring emblem (7 bevelled nodes, hexagonal lattice) on floor 3's north inner wall ──
  const sx = -HX + 1.3, sz = -1;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * PI * 2, R = 2.4;
    add(ball(0.42, 8, 6), M.goldDead, sx, 75 + Math.sin(a) * R, sz + Math.cos(a) * R);
    const a2 = (i + 1) / 7 * PI * 2, mx = (Math.cos(a) + Math.cos(a2)) / 2 * R, my = (Math.sin(a) + Math.sin(a2)) / 2 * R;
    add(slab(0.14, 0.18, 2.1, 0.03), M.goldDead, sx, 75 + my, sz + mx, -Math.atan2(Math.sin(a2) - Math.sin(a), Math.cos(a2) - Math.cos(a)), 0, 0);
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; add(slab(0.14, 0.16, 1.4, 0.03), M.goldDead, sx, 75 + Math.sin(a) * 1.0, sz + Math.cos(a) * 1.0, -(a + PI / 2), 0, 0); }
  // ── the ice collar at the base, rime on the windward (north, -x) face ──
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * PI * 2, R = 24 + rng() * 6, x = Math.cos(a) * R * 0.85, z = Math.sin(a) * R;
    if (Math.abs(x) < 12.5 && Math.abs(z) > 15) continue;   // keep the tunnel mouths clear
    if (Math.abs(z - FIN.z) < 3 && Math.abs(x) > HX + 2) continue;   // and the fins
    const sc = 2 + rng() * 3.5;
    add(rock(30 + (i % 6), { cuts: 10, noise: 0.04 }), rng() < 0.6 ? M.ice : M.snow, x, sc * 0.3, z, 0, rng() * PI, 0, sc, sc * 0.8, sc);
  }
  for (let i = 0; i < 22; i++) { const y = 8 + rng() * 104; add(slab(0.4, 3 + rng() * 6, 2 + rng() * 4, 0.1), M.ice, -HX - 0.65, y, -16 + rng() * 32); }
}

function build(ctx, p) {
  const M = mats(ctx);
  // LOD1 and the skyline impostor are darker than the lit plates: at range the hull is a dark needle against the rim
  const built = cached(ctx, 'abeyance:v2', (B) => make(ctx, B, false), {
    lod: true, lodMake: (B) => make(ctx, B, true), lodColorOf: (m) => matColor(m).multiplyScalar(0.72),
  });
  const r = instance(ctx, built);
  let root = r.root;
  // Low tier (A1.3, L1 §15.4): the whole hull, interior floors included, as ONE vertex-coloured mesh
  if (ctx.tier?.name === 'low') {
    let g = LOW.get(ctx);
    if (!g) { const B = new Builder(); make(ctx, B, false); g = B.single(); LOW.set(ctx, g); }
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
  // the seam strip around the stencil: one merged mesh (its material swaps between dead and lit)
  const seam = new THREE.Group(); seam.name = 'stencilSeam';
  const seamMatOff = M.cyanDead;
  const SB = new Builder();
  for (const [y, h, z, w] of [[69.4, 0.12, -1, 12.2], [79.2, 0.12, -1, 12.2], [74.3, 9.9, -7.1, 0.12], [74.3, 9.9, 5.1, 0.12]]) SB.add(slab(0.08, h, w, 0.02), seamMatOff, X(-HX + 1.32, y), y, z);
  const sp = SEAM_GEO.get(ctx) || SB.merged()[0];
  SEAM_GEO.set(ctx, sp);
  const sm = new THREE.Mesh(sp.geo, seamMatOff); sm.castShadow = false; seam.add(sm);
  root.add(seam);
  // the name in Founders' type, running vertically down the north face (between the porthole rows)
  const nameTex = signTex(ctx, 'ABEYANCE', { bg: '#a39b8b', color: '#3c342a', weathered: 0.7, w: 1024, h: 128 });
  if (nameTex) {
    nameTex.userData.shared = true;
    const nm = decal(ctx, nameTex, 34, 4.2, {});
    nm.position.set(X(-HX - 0.5, 66), 66, 12.75); nm.rotation.set(0, -PI / 2, PI / 2 - Math.atan(LEAN)); root.add(nm);
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

/** the exterior silhouette geometry (the LOD1 merge), for the skyline impostor (skyline.js) */
export function abeyanceSilhouette(ctx) {
  const built = cached(ctx, 'abeyance:v2', (B) => make(ctx, B, false), {
    lod: true, lodMake: (B) => make(ctx, B, true), lodColorOf: (m) => matColor(m).multiplyScalar(0.72),
  });
  return built.lod;
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
