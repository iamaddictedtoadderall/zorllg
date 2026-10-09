// art/units.js (P3): unit models built from the kit in the bevelled style: chamfered extruded hulls, layered armour plates,
// lathed barrels, rings and wheels, greebles. Every model keeps the §4.3 part names, muzzle counts, hit volumes and body
// sizes. Moving parts are bone groups; the static plates are baked into one rigidly-skinned mesh per material
// (art/kit.js bakeRigid), so a unit is ≤ 8 draw calls: shell, mid, accent, dark, the eye mesh and additive glows.
import * as THREE from 'three';
import * as KIT from './kit.js';
import { clamp, lerp } from '../core/util.js';

export const UNIT_MODELS = ['drone', 'tank', 'tank_heavy', 'turret', 'gunship', 'walker', 'artillery', 'apc', 'dropship', 'beacon'];

const PI = Math.PI, HALF = PI / 2;
function mats(ctx, faction) {
  if (faction && typeof faction === 'object' && faction.shell) return faction;
  if (ctx?.materials?.factionSet) return ctx.materials.factionSet(faction || 'hostile');
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3 });
  return { shell: m(0x9a958a), mid: m(0x6c6a64), accent: m(0x8f2a22), dark: m(0x141416),
           eye: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3b1f, emissiveIntensity: 3 }),
           glow: new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }) };
}
function mk(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz, order);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function group(parent, name, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; }
function muzzle(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = 'muzzle'; parent.add(o); return o; }
const DERIVED = new Map();
/** cached derived geometry (rotated copies of kit pieces), shared across every unit */
function derived(key, fn) { let g = DERIVED.get(key); if (!g) { g = fn(); g.userData.shared = true; DERIVED.set(key, g); } return g; }
const side = (pts, d, b) => KIT.plateGeo(pts, d, 'side', b);
const front = (pts, d, b) => KIT.plateGeo(pts, d, 'front', b);
const top = (pts, d, b) => KIT.plateGeo(pts, d, 'top', b);
/** a barrel along −z from the pivot: lathe tube, reinforcing rings, a slotted muzzle brake */
function barrel(parent, M, x, y, z, r, len, o = {}) {
  mk(parent, KIT.cylinder(r * 0.85, r, len, 12), M.dark, x, y, z - len / 2, -HALF);
  for (const t of o.rings ?? [0.18, 0.55]) mk(parent, KIT.ring(r * 1.05, r * 0.45, r * 0.9), M.mid, x, y, z - len * t, HALF);
  if (o.brake !== false) {
    const bw = r * 3.2, bh = r * 2.2;
    mk(parent, front(KIT.chamferRect(bw, bh, r * 0.5), r * 2.6, r * 0.15), M.dark, x, y, z - len - r * 1.1);
    for (const s of [-1, 1]) mk(parent, front(KIT.chamferRect(r * 0.9, bh * 0.75, r * 0.2), r * 1.6, r * 0.1), M.mid, x + s * bw * 0.55, y, z - len - r * 1.1);
  }
  return muzzle(parent, x, y, z - len - r * 2.5);
}
/** an emissive sensor strip (kept out of the bake so the eye can pulse) */
function eye(eyes, parent, M, geo, x, y, z, rx = 0, ry = 0) {
  const e = mk(parent, geo, M.eye, x, y, z, rx, ry);
  e.castShadow = false; e.userData.noBake = true; e.name = 'eye';
  eyes.push(e);
  return e;
}
/** a lens housing (dark) + eye lens */
function sensor(eyes, parent, M, r, x, y, z, ry = 0) {
  mk(parent, KIT.lampHousing(r), M.dark, x, y, z, -HALF, ry);
  return eye(eyes, parent, M, KIT.lampLens(r), x - Math.sin(ry) * r * 1.24, y, z - Math.cos(ry) * r * 1.24, -HALF, ry);
}

/** a long side band split into plates with real seams (AD law 1: no long plain face). Profile in (z, y) like `side`,
 *  given as a z range [z0, z1] (z0 < z1) and y range [y0, y1]; n plates, gap between them, extruded `d` across x. */
function sideBand(parent, mat, x, z0, z1, y0, y1, d, n, gap = 0.14, bevel = 0.04, slope = 0) {
  const L = z1 - z0, w = (L - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const a = z0 + i * (w + gap), b = a + w, s0 = i === 0 ? slope : 0, s1 = i === n - 1 ? slope : 0;
    mk(parent, side([[b - s1, y1], [a + s0, y1], [a, y0], [b, y0]].map(([zz, yy]) => [Math.round(zz * 1e3) / 1e3, Math.round(yy * 1e3) / 1e3]), d, bevel), mat, x);
  }
}
/** a row of bolt heads on a ±x face, along z */
function boltRow(parent, mat, x, s, y, z0, z1, n, r = 0.07) {
  for (let i = 0; i < n; i++) mk(parent, KIT.cylinder(r, r * 1.15, 0.08, 6), mat, x + s * 0.04, y, lerp(z0, z1, n > 1 ? i / (n - 1) : 0.5), 0, 0, HALF);
}
/** Track unit along z: guard, road wheels (each a bone), sprocket and idler, tread runs (bones that scroll). */
function trackUnit(rig, parent, M, sx, len, h, w, key) {
  const T = group(parent, 'track' + key, sx, 0, 0);
  const rW = h * 0.32, n = Math.max(4, Math.round(len / (rW * 2.6)));
  const wheels = [];
  for (let i = 0; i < n; i++) {
    const z = lerp(-len / 2 + rW * 1.6, len / 2 - rW * 1.6, i / (n - 1));
    const wg = group(T, 'wheel', 0, rW + 0.08, z);
    mk(wg, KIT.cylinder(rW, rW, w * 0.62, 12), M.dark, 0, 0, 0, 0, 0, HALF);
    mk(wg, KIT.cylinder(rW * 0.42, rW * 0.42, w * 0.7, 8), M.mid, 0, 0, 0, 0, 0, HALF);
    wheels.push(wg);
  }
  const rS = h * 0.36;
  for (const [z, name] of [[-len / 2 + rS, 'sprocket'], [len / 2 - rS, 'idler']]) {
    const wg = group(T, name, 0, h - rS - 0.12, z);
    mk(wg, KIT.cylinder(rS, rS, w * 0.5, 14), M.dark, 0, 0, 0, 0, 0, HALF);
    mk(wg, KIT.ring(rS * 1.02, rS * 0.18, w * 0.54, 14), M.mid, 0, 0, 0, 0, 0, HALF);
    wheels.push(wg);
  }
  // tread shoes: top and bottom runs scroll (bones), the wrapped ends stay
  const pitch = clamp(h * 0.24, 0.35, 0.7), pads = Math.floor((len - rS * 2) / pitch);
  const runs = [];
  for (const [y, name] of [[0.09, 'treadBot'], [h - 0.09, 'treadTop']]) {
    const run = group(T, name, 0, y, 0);
    for (let i = -1; i <= pads; i++) mk(run, KIT.bar(w, pitch * 0.82, 0.18), M.dark, 0, 0, -len / 2 + rS + (i + 0.5) * pitch);
    runs.push(run);
  }
  for (const zc of [-len / 2 + rS, len / 2 - rS]) {   // wrapped ends
    const cy = (h - rS - 0.12 + 0.09) / 2 + 0.02, R = (h - 0.18) / 2;
    for (let k = 1; k < 6; k++) {
      const a = k / 6 * PI, s = zc < 0 ? -1 : 1;
      mk(T, KIT.bar(w, pitch * 0.82, 0.18), M.dark, 0, cy - Math.cos(a) * R, zc + s * Math.sin(a) * R, s * a);
    }
  }
  // guard plate over the top, side skirt with bolts
  mk(T, side([[len / 2 + 0.2, h + 0.05], [len / 2 - 0.3, h + 0.3], [-len / 2 + 0.6, h + 0.3], [-len / 2 - 0.25, h - 0.05], [-len / 2 - 0.15, h - 0.25], [len / 2 + 0.1, h - 0.15]], w * 1.12, 0.06), M.mid);
  const sxo = sx > 0 ? w * 0.58 : -w * 0.58, ss = Math.sign(sx) || 1;
  sideBand(T, M.shell, sxo, -len / 2 + 0.9, len / 2 - 0.6, h * 0.35, h - 0.15, 0.14, 3, 0.12, 0.04, 0.3);
  boltRow(T, M.dark, sxo + ss * 0.07, ss, h - 0.32, -len / 2 + 1.4, len / 2 - 1.0, 7, 0.06);
  rig._tracks.push({ wheels, runs, pitch, r: rW });
  return T;
}

export function buildUnit(ctx, kind, faction, o = {}) {
  const M = mats(ctx, faction);
  const S = o.scale ?? 1, V = o.variant ?? 0;
  const root = new THREE.Group();
  root.name = 'unit:' + kind;
  const inner = group(root, 'scaled'); inner.scale.setScalar(S);
  const parts = {}, muzzles = [], eyes = [], glows = [];
  const rig = { _tracks: [], _legs: [], _t: Math.random() * 10 };
  let hit = { center: [0, 2, 0], r: 3 }, rad = 2, hgt = 3, sphere = null;
  const K = KIT.acKit(0.08);

  switch (kind) {
    case 'drone': {
      const body = parts.body = group(inner, 'body');
      // lens hull, nose forward (−z), armoured spine, belly plate, side sponsons with fins
      mk(body, side([[2.2, 0.05], [1.4, 0.62], [-0.6, 0.78], [-2.0, 0.28], [-2.25, -0.1], [-1.4, -0.5], [1.2, -0.52]], 2.4, 0.12), M.shell);
      mk(body, side([[1.7, 0.55], [0.9, 0.95], [-0.5, 0.98], [-1.4, 0.62], [-0.4, 0.62]], 1.3, 0.08), M.mid);
      mk(body, side([[1.5, -0.42], [-1.2, -0.45], [-1.5, -0.66], [1.1, -0.7]], 1.6, 0.06), M.dark);
      for (const s of [-1, 1]) {
        mk(body, side([[1.3, 0.2], [0.3, 0.38], [-1.0, 0.28], [-1.25, -0.05], [-0.8, -0.32], [1.1, -0.28]], 0.75, 0.08), M.accent, s * 1.55, 0, 0.1);
        mk(body, side([[1.4, 0.3], [2.1, 0.95], [1.85, 1.0], [0.9, 0.35]], 0.1, 0.03), M.mid, s * 1.55, 0, 0.1);
        mk(body, KIT.nozzle(0.24, 0.5), M.dark, s * 1.55, 0, 1.3, HALF);
      }
      mk(body, KIT.greeble('vent', 0.9, 0.7, 0.18), M.dark, 0, 0.95, 0.6, -HALF);
      mk(body, KIT.cylinder(0.05, 0.03, 1.4, 6), M.dark, 0.5, 1.6, 0.9, 0.3);
      sensor(eyes, body, M, 0.26, 0, 0.12, -2.1);
      K.joint(body, 0.13, 1.0, M.dark, 0, -0.42, -2.0, 'z');
      muzzles.push(muzzle(body, 0, -0.42, -2.55));
      // ducted ring around the hull (spins about the vertical axis via ring.rotation.z, as in the prototype)
      const ring = parts.ring = group(body, 'ring'); ring.rotation.x = HALF;
      const rg = derived('droneRing', () => KIT.ring(2.55, 0.32, 0.42, 40).clone().rotateX(HALF));
      mk(ring, rg, M.dark);
      for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2; mk(ring, KIT.plateBox(0.3, 0.55, 0.62, 0.05), M.accent, Math.cos(a) * 2.55, Math.sin(a) * 2.55, 0, 0, 0, a); }
      hit = { center: [0, 0, 0], r: 2.7 }; rad = 2; hgt = 2; sphere = { center: [0, 0, 0], r: 4 };
      break;
    }
    case 'tank': case 'tank_heavy': case 'artillery': {
      const heavy = kind === 'tank_heavy', art = kind === 'artillery', k = heavy ? 1.45 : 1;
      const chassis = parts.chassis = group(inner, 'chassis');
      chassis.scale.setScalar(k);
      const L = art ? 8.2 : 7.2;
      // hull: sloped glacis forward (−z), engine deck aft
      mk(chassis, side([[L / 2, 1.0], [L / 2, 2.05], [L / 2 - 1.2, 2.45], [-L / 2 + 1.7, 2.45], [-L / 2, 1.55], [-L / 2 + 0.3, 1.0]], 3.2, 0.12), M.shell, 0, 0, 0);
      mk(chassis, side([[L / 2 - 0.3, 2.42], [L / 2 - 1.3, 2.62], [-L / 2 + 2.0, 2.62], [-L / 2 + 1.6, 2.42]], 2.6, 0.08), M.mid);
      mk(chassis, KIT.armourPlate(KIT.chamferRect(3.0, 1.2, 0.25), 0.16), M.mid, 0, 2.0, -L / 2 + 0.7, -0.95);
      mk(chassis, KIT.ribbedPlate(2.2, 1.4, 0.12, { pitch: 0.28 }), M.dark, 0, 2.68, L / 2 - 1.1, -HALF);
      for (const s of [-1, 1]) {
        mk(chassis, KIT.cylinder(0.12, 0.12, 0.9, 8), M.dark, s * 1.1, 2.0, L / 2 + 0.2, HALF);
        mk(chassis, KIT.lampHousing(0.16), M.dark, s * 1.25, 2.05, -L / 2 + 0.95, -HALF - 0.6);
      }
      mk(chassis, KIT.plateBox(4.7, 0.25, 1.0, 0.06), M.accent, 0, 2.5, -L / 2 + 2.2);
      rig._tracks = [];
      trackUnit(rig, chassis, M, -2.25, L, 1.75, 1.2, 'L');
      trackUnit(rig, chassis, M, 2.25, L, 1.75, 1.2, 'R');
      if (heavy) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) mk(chassis, KIT.armourPlate(KIT.chamferRect(1.5, 0.9, 0.18), 0.14), M.accent, s * 2.92, 1.35, -2.4 + i * 1.6, 0, s * HALF, 0);
      if (art) for (const s of [-1, 1]) {   // folded outrigger stabilisers
        mk(chassis, side([[0.4, 0.6], [-1.6, 0.6], [-1.9, 0.2], [0.4, 0.2]], 0.35, 0.05), M.dark, s * 2.95, 0.9, L / 2 - 1.0);
        mk(chassis, KIT.cylinder(0.32, 0.36, 0.2, 12), M.mid, s * 2.95, 0.35, L / 2 - 2.8);
      }
      // turret
      const turret = parts.turret = group(inner, 'turret', 0, 2.62 * k, art ? 0.6 * k : 0);
      const tk = new THREE.Group(); tk.scale.setScalar(k); turret.add(tk);
      if (art) {
        mk(tk, side([[1.9, 0], [1.9, 1.8], [1.3, 2.1], [-1.4, 2.1], [-1.9, 1.3], [-1.7, 0]], 3.0, 0.1), M.shell);
        mk(tk, KIT.ribbedPlate(2.4, 1.6, 0.1, { pitch: 0.4 }), M.mid, 0, 2.12, 0.3, -HALF);
        for (const s of [-1, 1]) mk(tk, KIT.armourPlate(KIT.chamferRect(2.6, 1.3, 0.25), 0.12), M.accent, s * 1.56, 1.05, 0, 0, s * HALF, 0);
      } else {
        mk(tk, side([[1.9, 0], [1.9, 1.0], [1.3, 1.38], [-1.3, 1.38], [-2.05, 0.75], [-1.7, 0]], 3.1, 0.1), M.shell);
        mk(tk, side([[1.5, 1.36], [1.1, 1.55], [-0.9, 1.55], [-1.2, 1.36]], 2.2, 0.06), M.mid);
        mk(tk, KIT.panelBox(2.2, 0.7, 0.9, { cols: 3, rows: 1 }), M.accent, 0, 0.75, 2.2);
        for (const s of [-1, 1]) {   // stowage bins on the turret flanks, strapped
          mk(tk, KIT.panelBox(0.42, 0.6, 1.6, { cols: 1, rows: 1, deps: 2, inset: 0.04 }), M.mid, s * 1.76, 0.6, 0.95);
          for (const z of [0.5, 1.4]) mk(tk, KIT.bar(0.5, 0.06, 0.08), M.dark, s * 1.76, 0.92, z, 0, 0, 0);
        }
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) mk(tk, KIT.cylinder(0.09, 0.09, 0.5, 8), M.dark, s * (1.62 + i * 0.01), 0.95 + i * 0.16, -0.9, 0.5, 0, -s * HALF);
        mk(tk, KIT.ring(0.42, 0.14, 0.12), M.dark, 0.6, 1.6, 0.4);
        mk(tk, KIT.disc(0.38, 0.1), M.mid, 0.6, 1.62, 0.4);
      }
      mk(tk, KIT.cylinder(0.04, 0.03, art ? 2.4 : 2.0, 5), M.dark, -0.9, (art ? 2.1 : 1.38) + 1.0, 1.2);
      sensor(eyes, tk, M, 0.2, 1.05, art ? 1.5 : 0.95, -1.75);
      const bp = parts.barrelPivot = group(turret, 'barrelPivot', 0, (art ? 1.15 : 0.62) * k, -1.6 * k);
      mk(bp, KIT.armourPlate(KIT.chamferRect(heavy ? 1.9 : 1.3, 0.95, 0.25), 0.3), M.mid, 0, 0, -0.1, 0, 0, 0);
      const barrels = heavy ? [-0.55, 0.55] : [0];
      const len = art ? 8.5 : 5.4;
      for (const bx of barrels) muzzles.push(barrel(bp, M, bx * k, 0, -0.4 * k, 0.26 * k, len * k, { rings: [0.2, art ? 0.4 : 0.6, art ? 0.75 : 0.6] }));
      if (art) bp.rotation.x = 0.6;
      hit = { center: [0, 2.2 * k, 0], r: 4.2 * k, yScale: 1.6 }; rad = 4 * k; hgt = 4 * k; sphere = { center: [0, 2 * k, 0], r: 8 * k };
      break;
    }
    case 'turret': {
      const base = parts.base = group(inner, 'base');
      mk(base, KIT.cylinder(1.75, 2.1, 1.3, 8, 0.12), M.dark, 0, 0.65, 0, 0, PI / 8);
      for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; mk(base, KIT.armourPlate(KIT.chamferRect(1.25, 1.0, 0.18), 0.12), M.shell, Math.sin(a) * 1.9, 0.62, Math.cos(a) * 1.9, -0.22, a, 0, 'YXZ'); }
      mk(base, KIT.ring(1.45, 0.28, 0.3), M.mid, 0, 1.45, 0);
      const head = parts.head = group(inner, 'head', 0, 2.4, 0);
      mk(head, side([[1.25, -0.75], [1.25, 0.55], [0.7, 0.9], [-0.8, 0.9], [-1.4, 0.3], [-1.3, -0.75]], 2.3, 0.1), M.shell);
      mk(head, side([[0.9, 0.88], [0.5, 1.05], [-0.6, 1.05], [-0.9, 0.88]], 1.5, 0.06), M.mid);
      mk(head, KIT.cylinder(0.75, 0.85, 0.45, 12), M.dark, 0, -0.95, 0);
      for (const s of [-1, 1]) {
        mk(head, KIT.drum(0.48, 0.55, 1, 12), M.accent, s * 1.42, -0.3, 0.2, 0, 0, s * HALF);
        mk(head, front(KIT.chamferRect(0.5, 0.6, 0.12), 1.4, 0.05), M.mid, s * 0.62, -0.2, -1.6);
        mk(head, KIT.armourPlate(KIT.chamferRect(1.7, 0.55, 0.14), 0.08), M.mid, s * 1.18, 0.42, -0.15, 0, s * HALF, 0);   // cheek plate
        muzzles.push(barrel(head, M, s * 0.62, -0.2, -2.1, 0.13, 2.1, { rings: [0.3, 0.7] }));
      }
      sensor(eyes, head, M, 0.2, 0, 0.45, -1.32);
      mk(head, KIT.greeble('junction', 0.6, 0.5, 0.2), M.dark, 0, 0.3, 1.27);
      hit = { center: [0, 2.2, 0], r: 2.8 }; rad = 2; hgt = 4; sphere = { center: [0, 2, 0], r: 5.5 };
      break;
    }
    case 'gunship': {
      const body = parts.body = group(inner, 'body');
      const sec = (z, w, h, yo = 0, c = 0.3) => ({ z, pts: KIT.chamferRect(w, h, Math.min(w, h) * c, 0, yo) });
      mk(body, derived('gunshipHull', () => KIT.loft([sec(-4.9, 0.5, 0.5, -0.3), sec(-3.6, 1.9, 1.7, -0.05), sec(-1.2, 2.9, 2.3, 0.1), sec(1.8, 2.8, 2.2, 0.15), sec(3.6, 1.4, 1.2, 0.35), sec(5.2, 0.6, 0.6, 0.45)])), M.shell);
      mk(body, side([[-1.0, 1.1], [-2.8, 1.0], [-3.75, 0.4], [-3.4, 0.25], [-1.2, 0.85]], 1.5, 0.06), M.dark);   // canopy
      eye(eyes, body, M, side([[-2.9, 0.92], [-3.6, 0.42], [-3.45, 0.38], [-2.8, 0.85]], 1.56, 0.02), 0, 0, 0);
      mk(body, side([[2.2, 1.15], [1.5, 1.6], [-0.6, 1.6], [-1.1, 1.15]], 1.9, 0.08), M.mid);   // engine hump
      for (const s of [-1, 1]) for (const [z, w] of [[-1.9, 1.5], [0.15, 2.1], [2.3, 1.2]]) {   // flank armour, two layers
        mk(body, KIT.armourPlate(KIT.chamferRect(w, 1.15, 0.22), 0.1, { lip: 0.1 }), M.shell, s * (z > 2 ? 1.3 : 1.42), 0.12, z, 0, s * HALF + (z > 2 ? s * 0.18 : 0), 0);
      }
      mk(body, KIT.bar(3.2, 0.32, 0.12), M.dark, 0, 1.16, -2.4, 0, HALF, 0);   // dorsal spine strip
      mk(body, KIT.cylinder(0.04, 0.03, 1.1, 5), M.dark, -0.4, 2.1, 0.9);
      mk(body, KIT.greeble('dome', 0.5, 0.5, 0.2), M.dark, 0.35, 1.62, 0.2, -HALF);
      for (const s of [-1, 1]) mk(body, KIT.greeble('vent', 0.9, 0.6, 0.15), M.dark, s * 0.96, 1.4, 0.6, 0, s * HALF);
      mk(body, KIT.bar(4.5, 0.55, 0.6), M.shell, 0, 0.45, 6.6, 0, HALF);   // tail boom
      mk(body, side([[8.2, 0.5], [9.0, 2.4], [8.6, 2.5], [7.5, 0.6]], 0.16, 0.04), M.mid);
      for (const s of [-1, 1]) mk(body, front([[0, 0], [1.7 * s, 0.15], [1.8 * s, 0.4], [0, 0.35]], 0.12, 0.03), M.accent, 0, 0.6, 8.5);
      for (const s of [-1, 1]) {
        mk(body, side([[1.2, 0.15], [-0.9, 0.15], [-1.2, -0.12], [1.2, -0.12]], 4.4, 0.05), M.mid, s * 2.3, 0.35, 0);   // stub wing
        mk(body, KIT.ring(1.95, 0.22, 0.55, 32), M.dark, s * 4.2, 1.15, -0.5);   // rotor duct
        for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + 0.3; mk(body, KIT.bar(1.9, 0.12, 0.1), M.dark, s * 4.2 + Math.cos(a) * 0.95, 1.0, -0.5 + Math.sin(a) * 0.95, 0, -a); }
        const rotor = parts[s < 0 ? 'rotorL' : 'rotorR'] = group(body, s < 0 ? 'rotorL' : 'rotorR', s * 4.2, 1.2, -0.5);
        mk(rotor, KIT.cylinder(0.3, 0.38, 0.4, 10), M.mid);
        for (let i = 0; i < 4; i++) mk(rotor, side([[0.12, 0.04], [-0.1, 0.05], [-0.14, -0.03], [0.12, -0.04]], 1.75, 0.02), M.dark, 0, 0, 0, 0, i / 4 * PI * 2, 0).position.set(Math.cos(i / 4 * PI * 2) * 0.95, 0, -Math.sin(i / 4 * PI * 2) * 0.95);
        const pod = parts[s < 0 ? 'podL' : 'podR'] = group(body, s < 0 ? 'podL' : 'podR', s * 2.6, -0.25, -0.8);
        mk(pod, KIT.cylinder(0.45, 0.5, 2.3, 10), M.accent, 0, 0, 0, -HALF);
        mk(pod, KIT.ring(0.42, 0.1, 0.12), M.dark, 0, 0, -1.15, HALF);
        for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; mk(pod, KIT.cylinder(0.09, 0.09, 0.12, 8), M.dark, Math.cos(a) * 0.26, Math.sin(a) * 0.26, -1.2, HALF); }
      }
      const turret = parts.turret = group(body, 'turret', 0, -1.15, -3.0);
      mk(turret, derived('chinDome', () => KIT.dome(0.65, 0.6, 14).clone().rotateX(PI)), M.dark, 0, 0.2, 0);
      for (const s of [-1, 1]) muzzles.push(barrel(turret, M, s * 0.24, -0.15, -0.3, 0.08, 1.1, { rings: [0.5], brake: false }));
      sensor(eyes, turret, M, 0.12, 0, -0.1, -0.5);
      hit = { center: [0, 0, 0], r: 4.5 }; rad = 4; hgt = 3; sphere = { center: [0, 0, 1.5], r: 10 };
      break;
    }
    case 'walker': {
      const body = parts.body = group(inner, 'body', 0, 7, 0);
      mk(body, side([[4.2, -0.9], [4.4, 0.6], [3.2, 1.6], [-2.6, 1.7], [-4.3, 0.7], [-4.4, -0.6], [-3.4, -1.5], [3.4, -1.5]], 5.4, 0.2), M.shell);
      mk(body, side([[3.4, 1.55], [2.8, 2.0], [-1.9, 2.05], [-2.5, 1.62]], 4.0, 0.12), M.mid);
      for (const s of [-1, 1]) mk(body, KIT.armourPlate(KIT.chamferRect(6.4, 2.2, 0.5), 0.22), M.mid, s * 2.75, 0.0, 0, 0, s * HALF, 0);
      mk(body, KIT.ribbedPlate(3.0, 2.2, 0.15, { pitch: 0.5 }), M.dark, 0, 1.0, 4.35, 0.2);
      for (const s of [-1, 1]) mk(body, KIT.nozzle(0.35, 0.8), M.dark, s * 1.2, 0.9, 4.6, HALF);
      mk(body, KIT.greeble('vent', 1.6, 1.0, 0.25), M.dark, 0, -0.3, -4.42, 0, PI);
      sensor(eyes, body, M, 0.32, -0.9, 0.2, -4.45);
      sensor(eyes, body, M, 0.22, 0.9, 0.35, -4.4);
      const turret = parts.turret = group(body, 'turret', 0, 2.05, 0);
      mk(turret, KIT.cylinder(1.6, 1.8, 0.5, 14), M.dark, 0, 0.2, 0);
      mk(turret, side([[1.9, 0.3], [1.9, 1.5], [1.2, 1.95], [-1.4, 1.95], [-2.2, 1.0], [-1.9, 0.3]], 3.4, 0.12), M.shell);
      mk(turret, KIT.ribbedPlate(2.4, 1.6, 0.1, { pitch: 0.4 }), M.accent, 0, 1.97, 0.2, -HALF);
      for (const s of [-1, 1]) muzzles.push(barrel(turret, M, s * 0.85, 1.0, -1.9, 0.3, 4.6, { rings: [0.25, 0.6] }));
      sensor(eyes, turret, M, 0.18, 1.3, 1.5, -1.7);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
        const leg = parts['leg' + i] = group(body, 'leg' + i, sx * 2.7, -0.6, sz * 3.0);
        mk(leg, KIT.cylinder(0.9, 0.9, 1.3, 12), M.dark, 0, 0, 0, 0, 0, HALF);
        mk(leg, side([[0.75, 0.4], [0.6, -2.9], [-0.55, -3.1], [-0.85, 0.2]], 1.0, 0.1), M.mid, sx * 0.55, 0, 0, 0, 0, sx * 0.45);
        const knee = group(leg, 'knee', sx * 1.85, -2.6, 0);
        mk(knee, KIT.cylinder(0.65, 0.65, 1.1, 12), M.dark, 0, 0, 0, 0, 0, HALF);
        mk(knee, side([[0.6, 0.45], [0.55, -2.6], [0.2, -3.05], [-0.4, -3.0], [-0.6, 0.3]], 0.95, 0.09), M.shell);
        mk(knee, KIT.armourPlate(KIT.chamferRect(1.0, 1.9, 0.25), 0.12), M.accent, sx * 0.52, -1.2, 0, 0, sx * HALF, 0);
        const foot = group(knee, 'foot', 0, -3.3, 0);
        mk(foot, KIT.cylinder(0.9, 1.2, 0.55, 10, 0.12), M.dark, 0, -0.08, 0);
        for (let c = 0; c < 3; c++) { const a = c / 3 * PI * 2 + PI / 6; mk(foot, side([[0.5, 0.0], [0.5, 0.25], [-0.65, 0.05], [-0.7, -0.25]], 0.3, 0.04), M.mid, Math.sin(a) * 1.0, -0.2, Math.cos(a) * 1.0, 0, a, 0); }
        leg.userData.knee = knee; leg.userData.foot = foot;
        rig._legs.push({ leg, knee, foot, phase: [0, PI, PI * 1.5, PI * 0.5][i], sx, sz });
      });
      hit = { center: [0, 7, 0], r: 5.5 }; rad = 5; hgt = 10; sphere = { center: [0, 5, 0], r: 11 };
      break;
    }
    case 'apc': {
      const chassis = parts.chassis = group(inner, 'chassis');
      mk(chassis, side([[4.5, 0.9], [4.5, 2.9], [3.6, 3.4], [-2.6, 3.4], [-4.5, 2.0], [-4.3, 0.9]], 3.6, 0.14), M.shell);
      mk(chassis, side([[3.4, 3.38], [3.0, 3.62], [-1.9, 3.62], [-2.3, 3.38]], 2.6, 0.08), M.mid);
      mk(chassis, KIT.armourPlate(KIT.chamferRect(3.2, 1.6, 0.3), 0.15), M.mid, 0, 2.55, -3.62, -0.85);
      for (const s of [-1, 1]) {
        sideBand(chassis, M.accent, s * 1.86, -4.2, 4.3, 1.2, 2.5, 0.16, 4, 0.12, 0.05, 0.2);
        boltRow(chassis, M.dark, s * 1.95, s, 2.36, -3.9, 4.0, 9, 0.06);
        for (const z of [-1.6, 1.9]) { const hm = mk(chassis, KIT.greeble('hatch', 0.9, 0.9, 0.18), M.dark, s * 1.8, 2.95, z); hm.rotation.y = s * HALF; }
        for (const z of [-3.0, 0.2, 3.2]) mk(chassis, KIT.armourPlate(KIT.chamferRect(0.55, 0.28, 0.08), 0.1), M.dark, s * 1.72, 3.05, z, 0, s * HALF, 0);
        for (let i = 0; i < 4; i++) {
          const z = -3.0 + i * 2.05;
          const w = group(chassis, 'wheel', s * 1.75, 0.82, z);
          mk(w, KIT.cylinder(0.82, 0.82, 0.62, 16, 0.12), M.dark, 0, 0, 0, 0, 0, HALF);
          mk(w, KIT.ring(0.5, 0.18, 0.66), M.mid, 0, 0, 0, 0, 0, HALF);
          mk(chassis, side([[0.95, 1.65], [0.7, 1.9], [-0.7, 1.9], [-0.95, 1.65]], 0.5, 0.05), M.mid, s * 1.86, 0, z);
          rig._tracks.push({ wheels: [w], runs: [], pitch: 1, r: 0.82 });
        }
        mk(chassis, KIT.greeble('pipes', 2.6, 0.5, 0.25), M.dark, s * 1.85, 2.8, 0.6, 0, s * HALF);
      }
      for (const z of [-0.6, 1.4]) { mk(chassis, KIT.ring(0.45, 0.14, 0.18), M.dark, 0, 3.66, z); mk(chassis, KIT.disc(0.4, 0.1), M.mid, 0, 3.7, z); }
      mk(chassis, KIT.cylinder(0.05, 0.03, 2.2, 5), M.dark, 1.2, 4.6, 2.5);
      sensor(eyes, chassis, M, 0.22, -0.9, 2.95, -4.05);
      sensor(eyes, chassis, M, 0.22, 0.9, 2.95, -4.05);
      const hatch = parts.hatch = group(chassis, 'hatch', 0, 0.95, 4.52);
      mk(hatch, front(KIT.chamferRect(2.6, 2.2, 0.3, 0, 1.1), 0.22, 0.05), M.mid, 0, 0, 0.11);
      mk(hatch, KIT.ribbedPlate(2.0, 1.6, 0.06, { pitch: 0.3, axis: 'y' }), M.dark, 0, 1.15, 0.24);
      hit = { center: [0, 2, 0], r: 4.6, yScale: 1.6 }; rad = 4; hgt = 3.5; sphere = { center: [0, 2, 0], r: 7 };
      break;
    }
    case 'dropship': {
      const body = parts.body = group(inner, 'body');
      const sec = (z, w, h, yo = 0, c = 0.28) => ({ z, pts: KIT.chamferRect(w, h, Math.min(w, h) * c, 0, yo) });
      mk(body, derived('dropshipHull', () => KIT.loft([sec(-11.5, 2.2, 1.8, 0.2), sec(-9.0, 6.0, 3.6, 0.3), sec(-4, 8.2, 4.4, 0.2), sec(5, 8.2, 4.4, 0.2), sec(10, 6.4, 3.4, 0.7), sec(11.6, 4.0, 2.2, 1.0)])), M.shell);
      mk(body, side([[-7.5, 2.2], [-9.4, 1.9], [-10.8, 0.9], [-10.3, 0.7], [-7.8, 1.6]], 3.4, 0.08), M.dark);
      eye(eyes, body, M, side([[-9.6, 1.75], [-10.6, 1.0], [-10.4, 0.92], [-9.4, 1.65]], 3.46, 0.03), 0, 0, 0);
      mk(body, side([[8, 2.5], [6, 3.3], [-5, 3.3], [-6.5, 2.5]], 5.2, 0.15), M.mid);
      for (const [z, w] of [[-3.6, 2.4], [-0.6, 3.0], [2.6, 2.8]]) for (const s of [-1, 1])   // roof plates with seams
        mk(body, KIT.armourPlate(KIT.chamferRect(2.3, w, 0.3), 0.14, { lip: 0.14 }), M.shell, s * 1.25, 3.36, z, -HALF, 0, 0);
      mk(body, KIT.greeble('fins', 1.6, 2.2, 0.35), M.dark, 0, 3.3, 5.2, -HALF);
      for (const s of [-1, 1]) {
        if (s > 0) mk(body, side([[5.5, 0.4], [-2.5, 0.4], [-3.4, -0.2], [5.5, -0.3]], 14, 0.1), M.mid, 0, 1.1, 0);   // both wings, one plate
        for (const x of [5.0, 6.3]) mk(body, KIT.bar(6.4, 0.16, 0.18), M.dark, s * x, 1.58, 1.4, 0, HALF, 0);   // wing fences
        mk(body, KIT.panelBox(0.6, 3.6, 16, { cols: 1, rows: 2, inset: 0.1 }), M.accent, s * 4.15, 0.2, 0);
        mk(body, side([[12.6, 0.8], [13.6, 4.4], [12.8, 4.6], [10.6, 1.4]], 0.3, 0.06), M.mid, s * 2.4, 0.6, 0, 0, 0, -s * 0.25);
        for (let i = 0; i < 3; i++) mk(body, KIT.greeble('vent', 1.6, 1.0, 0.25), M.dark, s * 4.14, 2.2, -4 + i * 3.6, 0, s * HALF);
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
        const t = parts['thrust' + i] = group(body, 'thrust' + i, sx * 6.2, 0.9, sz * 6.0);
        mk(t, KIT.cylinder(1.25, 1.35, 2.6, 16), M.dark, 0, 0.3, 0);
        mk(t, KIT.ring(1.36, 0.2, 0.5), M.accent, 0, 1.4, 0);
        mk(t, derived('dsNozzle', () => KIT.nozzle(1.15, 1.2).clone().rotateX(PI)), M.dark, 0, -1.0, 0);
        const gg = group(t, 'glow', 0, -1.9, 0); gg.scale.set(1, 0.6, 1);
        const g = mk(gg, derived('dsGlow', () => new THREE.ConeGeometry(0.8, 3.2, 12, 1, true).rotateX(PI).translate(0, -1.6, 0)), M.glow);
        g.castShadow = false; g.userData.bakeAdditive = true; glows.push(gg);
        mk(body, side([[1.2, 0.5], [-1.2, 0.5], [-1.5, -0.3], [1.5, -0.3]], Math.abs(sx * 6.2) - 4.0, 0.06), M.mid, sx * (4.2 + (6.2 - 4.2) / 2), 1.0, sz * 6.0);
      });
      const bay = parts.bay = group(body, 'bay', 0, -2.0, 2);
      mk(bay, KIT.ribbedPlate(4.8, 8.4, 0.25, { pitch: 0.7, axis: 'y' }), M.dark, 0, 0, 0, HALF);
      for (const s of [-1, 1]) mk(bay, KIT.armourPlate(KIT.chamferRect(1.0, 8.2, 0.2), 0.12), M.mid, s * 2.6, 0.1, 0, HALF);
      hit = { center: [0, 0, 0], r: 11 }; rad = 9; hgt = 5; sphere = { center: [0, 0, 0], r: 16 };
      break;
    }
    case 'beacon': {
      const body = parts.body = group(inner, 'body');
      mk(body, KIT.cylinder(2.5, 3.3, 1.2, 8, 0.15), M.dark, 0, 0.6, 0, 0, PI / 8);
      mk(body, KIT.cylinder(1.9, 2.3, 1.2, 8, 0.12), M.shell, 0, 1.8, 0, 0, PI / 8);
      for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; mk(body, side([[1.5, 0], [0.2, 3.6], [-0.3, 3.6], [-0.4, 0]], 0.35, 0.06), M.mid, Math.sin(a) * 2.1, 0.6, Math.cos(a) * 2.1, 0, a + HALF, 0); }
      for (let i = 0; i < 2; i++) { const a = i * PI + 0.4; mk(body, KIT.greeble('junction', 1.0, 0.8, 0.4), M.dark, Math.sin(a) * 2.45, 1.0, Math.cos(a) * 2.45, 0, a); }
      const spire = parts.spire = group(body, 'spire', 0, 2.4, 0);
      const drums = [[1.15, 1.6], [1.0, 1.6], [0.86, 1.5], [0.74, 1.4], [0.62, 1.3], [0.52, 1.2]];
      let y = 0;
      for (const [r, h] of drums) {
        mk(spire, KIT.cylinder(r * 0.92, r, h, 10), M.shell, 0, y + h / 2, 0);
        mk(spire, KIT.ring(r * 1.04, r * 0.3, 0.22), M.dark, 0, y + h, 0);
        y += h;
      }
      for (const s of [-1, 1]) mk(spire, KIT.bar(y * 0.85, 0.16, 0.16), M.dark, s * 0.95, y * 0.42, 0, 0, 0, HALF - s * 0.06);
      mk(spire, KIT.cylinder(0.75, 0.45, 1.3, 8), M.accent, 0, y + 0.65, 0);
      eye(eyes, spire, M, KIT.cylinder(0.5, 0.5, 0.35, 10), 0, y + 1.45, 0);
      mk(spire, KIT.ring(0.62, 0.16, 0.22), M.dark, 0, y + 1.3, 0);
      // the beam: its own additive material (the beacon pulses its opacity)
      const bm = new THREE.MeshBasicMaterial({ color: (M.glow?.color || new THREE.Color(0xffa040)).clone(), transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const beam = parts.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 900, 10, 1, true), bm);
      beam.position.y = 460; beam.name = 'beam'; beam.castShadow = false; beam.userData.ownMaterial = true; body.add(beam);
      hit = { center: [0, 8, 0], r: 3.5 }; rad = 3; hgt = 18; sphere = { center: [0, 9, 0], r: 12 };
      break;
    }
    default: {
      console.warn('[units] unknown unit model', kind);
      parts.body = group(inner, 'body');
      mk(parts.body, KIT.panelBox(3, 3, 3), M.shell, 0, 1.5, 0);
      hit = { center: [0, 1.5, 0], r: 2.5 };
    }
  }
  if (V % 2 === 1) inner.traverse(m => { if (m.isMesh && m.material === M.accent) m.material = M.mid; });   // variant: plain paint
  KIT.bakeRigid(root, { sphere: sphere ? { center: sphere.center.map(v => v * S), r: sphere.r * S } : undefined });
  Object.assign(rig, {
    kind, root, parts, muzzles, eyes, glows,
    hit: { ...hit, center: hit.center.map(v => v * S), r: hit.r * S }, rad: rad * S, hgt: hgt * S,
    dispose() {
      root.parent?.remove(root);
      const b = root.userData.rigidBake;
      if (b) { for (const sm of b.meshes) sm.geometry.dispose(); b.skeleton.dispose(); }
      root.traverse(m => {
        if (m.geometry && !m.geometry.userData?.shared && !m.isSkinnedMesh && m.userData.ownGeometry) m.geometry.dispose();
        if (m.userData?.ownMaterial) m.material.dispose();
      });
    },
  });
  if (parts.beam) parts.beam.userData.ownGeometry = true;
  return rig;
}

/** Rotors, rings, walker gait, tread scroll and wheel spin, eye pulse. st: { speed (m/s), firing, alert } */
export function animateUnit(rig, dt, st = {}) {
  const p = rig.parts;
  rig._t = (rig._t || 0) + dt;
  const t = rig._t, sp = st.speed ?? 0;
  if (p.ring) p.ring.rotation.z += dt * 6;
  if (p.rotorL) p.rotorL.rotation.y += dt * 30;
  if (p.rotorR) p.rotorR.rotation.y -= dt * 30;
  if (rig._tracks?.length && sp) {
    for (const tr of rig._tracks) {
      for (const w of tr.wheels) w.rotation.x -= sp * dt / tr.r;
      const off = ((t * sp) % tr.pitch + tr.pitch) % tr.pitch;
      if (tr.runs[0]) tr.runs[0].position.z = off;            // bottom run moves back relative to the hull
      if (tr.runs[1]) tr.runs[1].position.z = -off;           // top run forward
    }
  }
  if (rig._legs?.length) {
    const gait = clamp(sp / 6, 0, 1.5), w = t * (1.2 + sp * 0.25);
    for (const L of rig._legs) {
      const ph = w + L.phase, lift = Math.max(0, Math.sin(ph));
      L.leg.rotation.x = Math.cos(ph) * 0.28 * gait;
      L.knee.rotation.z = -L.sx * lift * 0.35 * gait;
      L.foot.rotation.z = L.sx * lift * 0.3 * gait;
    }
    if (p.body) p.body.position.y = 7 + Math.sin(w * 2) * 0.12 * gait;
  }
  if (rig.glows?.length) for (const g of rig.glows) g.scale.y = 0.55 + 0.1 * Math.sin(t * 31 + g.id);
  if (st.alert || st.firing) {
    const s = 1 + 0.12 * Math.max(0, Math.sin(t * 9));
    for (const e of rig.eyes) e.scale.setScalar(s);
  } else if (rig.eyes[0] && rig.eyes[0].scale.x !== 1) for (const e of rig.eyes) e.scale.setScalar(1);
}
