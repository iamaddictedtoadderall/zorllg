// levels/level01/floes.js (P6) — the floe field, the Raft, the bergs and the sea plane (L1 §8.2, §12.5, §12.6).
//
// One custom system instead of ~200 structures: floes are instances of 8 shape variants (1 draw call each, per-instance
// colour carries the shade state on every tier), plus one instanced foam ring and the bergs (merged, 1-2 draw calls).
// Every floe registers ONE circle collider at load (r = 0.85 × inscribed radius, top at the floe top, bottom -27/-30);
// colliders are enabled or disabled with state, never added or removed at runtime.
//
// Rules (deterministic: the sun's elevation is a function of sprint time only):
//  · shaded = a ray from the floe's top centre (+1 m) toward the sun is blocked by a berg (a cylinder r × h);
//  · a sunlit floe starts rotting the first moment the player stands on it: cracks 0-1.5 s, sags 0.6 m 1.5-3 s,
//    collapses at 3 s (collider off, chunks, sinks over 2 s); leaving does not save it; shaded floes never rot;
//  · before the sunrise nothing rots; the Raft (22 big floes) splits into 2-4 fragments at the finale.
// The generator is validated at load (validate()): from the surfacing point to the fast ice there is a path with every
// gap ≤ 22 m and at most 2 consecutive sunlit floes, at every elevation 5.5..9°; failing seeds are nudged.
import * as THREE from 'three';
import { mulberry32, clamp } from '../../src/core/util.js';
import { blob, mats, shared, patch } from './kit.js';
import { rig, sledModel } from './models.js';
import * as KIT from '../../src/art/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, DEG = PI / 180;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();
const COL = { night: new THREE.Color('#b4c6dc'), shade: new THREE.Color('#5f7fa8'), sun: new THREE.Color('#f2dcc0'),
              rot: new THREE.Color('#ffffff'), crack: new THREE.Color('#fff4e0') };
const NV = 8;
const COLR = 0.85;   // a floe's collider radius is 0.85 × its inscribed radius (L1 §12.5)
/** the standable collider radius: 0.85 × the inscribed radius; a berg's floe is a near-round ring around the berg, so
 *  its collider reaches 0.88 × r (a ~10 m walkable ring outside the berg's own collider at 0.92 × the berg radius) */
export function colR(f) { return f.kind === 'berg' ? f.r * 0.88 : COLR * (f.rin ?? f.r * 0.78); }

// ════════════════════════════════════════════════════════════════════════════════ pure data (no THREE, testable)
export function sunDir2(az) { return [Math.sin(az * DEG), -Math.cos(az * DEG)]; }
export function elevationAt(DATA, t) { const S = DATA.sunClock; return S.from + (S.to - S.from) * Math.min(Math.max(t, 0), S.seconds) / S.seconds; }
/** is a point (x, z) at height y0 above the floe tops shaded by a berg at elevation e (deg)? */
export function shadedAt(bergs, x, z, e, az = 95) {
  const [dx, dz] = sunDir2(az), te = Math.tan(e * DEG);
  for (const b of bergs) {
    const bx = b.x - x, bz = b.z - z;
    const t = bx * dx + bz * dz;
    if (t <= 0) continue;
    const perp = Math.abs(bx * dz - bz * dx);
    if (perp > b.r) continue;
    const tIn = t - Math.sqrt(Math.max(0, b.r * b.r - perp * perp));   // where the ray enters the berg
    if (1 + Math.max(0, tIn) * te < b.h) return true;
  }
  return false;
}
function distToPoly(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(px - ax - dx * t, pz - az - dz * t));
  }
  return best;
}
/**
 * Generates the field: { floes: [{x, z, r, rin, top, bottom, v, yaw, kind: 'floe'|'raft'|'frag'|'berg', parent?, berg?}], bergs }.
 * r is the outline radius, rin the inscribed radius (collider r = 0.85 × rin).
 */
export function generateField(DATA) {
  const F = DATA.floes, R = DATA.raft, SEA = DATA.sea;
  const rng = mulberry32(F.seed);
  const floes = [];
  const topF = SEA + F.freeboard, topR = SEA + R.freeboard;
  const add = (o) => { o.v ??= Math.floor(rng() * NV); o.yaw ??= rng() * PI * 2; o.rin ??= o.r * 0.78; o.col ??= colR(o); floes.push(o); return o; };
  const clear = (x, z, r, gap = 5, list = floes, kinds = null) => list.every(f => (kinds && !kinds.includes(f.kind)) || Math.hypot(f.x - x, f.z - z) > f.r + r + gap);
  const inLead = (x, z, r) => F.leads.some(l => distToPoly(x, z, l) < r + 13);
  // bergs on large floes (never rot)
  for (const b of DATA.bergs) add({ x: b.x, z: b.z, r: b.r + 12, top: topF, bottom: -27, kind: 'berg', berg: b });
  // sled 3's floe (1010, 262), shaded at first
  add({ x: DATA.sled3.x, z: DATA.sled3.z, r: 13, top: topF, bottom: -27, kind: 'floe', sled: true });
  // the Raft: big locked floes (x 668..905) on a jittered grid (gaps of a few metres), and their fragments (shown
  // after the split at the finale), which tile the parent floe with crack-width gaps
  const raftAt = [];
  const cols = Math.max(1, Math.round((R.x1 - R.x0) / 80)), rows = Math.max(1, Math.ceil(R.count / cols));
  const cw = (R.x1 - R.x0) / cols, ch = (R.z1 - R.z0) / rows;
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push([i, j]);
  while (cells.length > R.count) cells.splice(Math.floor(rng() * cells.length), 1);
  for (const [i, j] of cells) {
    const r = clamp(Math.min(cw, ch) / 2 - 1.5 - rng() * 3, R.size[0] / 2, R.size[1] / 2);
    const x = R.x0 + (i + 0.5) * cw + (rng() - 0.5) * 4, z = R.z0 + (j + 0.5) * ch + (rng() - 0.5) * 4;
    raftAt.push({ x, z, r });
  }
  // the guaranteed fragment at (856, 23) belongs to the raft floe nearest it
  const G = F.guaranteed[0];
  let gi = 0, gd = Infinity; raftAt.forEach((f, i) => { const d = Math.hypot(f.x - G.x, f.z - G.z) - f.r; if (d < gd) { gd = d; gi = i; } });
  raftAt.forEach((f, i) => {
    const raft = add({ x: f.x, z: f.z, r: f.r, top: topR, bottom: -30, kind: 'raft' });
    const n = 2 + Math.floor(rng() * 3);
    const kr = n === 2 ? 0.52 : n === 3 ? 0.5 : 0.45, kd = n === 2 ? 0.47 : n === 3 ? 0.5 : 0.53;
    const a0 = rng() * PI * 2;
    const parts = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * PI * 2 + (rng() - 0.5) * 0.3;
      parts.push({ x: f.x + Math.cos(a) * f.r * kd, z: f.z + Math.sin(a) * f.r * kd, r: f.r * kr * (0.96 + rng() * 0.08) });
    }
    if (i === gi) {   // the guaranteed fragment replaces the part nearest to it
      let pi = 0, pd = Infinity; parts.forEach((p, k) => { const d = Math.hypot(p.x - G.x, p.z - G.z); if (d < pd) { pd = d; pi = k; } });
      parts[pi] = { x: G.x, z: G.z, r: G.r, guaranteed: true };
      for (let k = parts.length - 1; k >= 0; k--) if (k !== pi && Math.hypot(parts[k].x - G.x, parts[k].z - G.z) < G.r + parts[k].r * 0.6) parts.splice(k, 1);
    }
    for (const p of parts) add({ x: p.x, z: p.z, r: p.r, top: topR, bottom: -30, kind: 'frag', parent: raft, guaranteed: !!p.guaranteed });
  });
  // shade-lane floes (denser inside the lanes at the steepest sun, 9°)
  for (const b of DATA.bergs) {
    const [dx, dz] = sunDir2(DATA.sunClock.azimuth);
    const L9 = b.h / Math.tan(DATA.sunClock.to * DEG), L5 = b.h / Math.tan(DATA.sunClock.from * DEG);
    for (let t = b.r + 18; t < L5; t += 26 + rng() * 10) {
      const lat = (rng() - 0.5) * b.r * 0.9, r = 9 + rng() * (t < L9 ? 7 : 5);
      const x = b.x - dx * t + -dz * lat, z = b.z - dz * t + dx * lat;
      if (x < F.x0 - 30 || x > F.x1 + 20 || !clear(x, z, r, 4) || inLead(x, z, r)) continue;
      if (x < R.x1 + 4) continue;   // the Raft owns x < 905
      add({ x, z, r, top: topF, bottom: -27, kind: 'floe' });
    }
  }
  // general fill (Poisson-like), leads kept open
  for (let tries = 0, n = floes.filter(f => f.kind === 'floe').length; n < (F.count ?? 175) && tries < 12000; tries++) {
    const r = (F.size[0] + Math.pow(rng(), 1.6) * (F.size[1] - F.size[0])) / 2;
    const x = F.x0 + r + rng() * (F.x1 - F.x0 - r * 2), z = F.z0 + rng() * (F.z1 - F.z0);
    if (!clear(x, z, r, 5) || inLead(x, z, r)) continue;
    add({ x, z, r, top: topF, bottom: -27, kind: 'floe' }); n++;
  }
  return { floes, bergs: DATA.bergs };
}
/**
 * Path check at elevation e: a path from the surfacing point to the fast ice where every gap ≤ maxGap and no more than
 * maxGold consecutive sunlit floes. Raft fragments stand for the split Raft. Returns { ok, path } (indices).
 */
export function validateField(field, DATA, e) {
  const F = DATA.floes, fl = field.floes;
  const nodes = [];
  fl.forEach((f, i) => { if (f.kind !== 'raft') nodes.push(i); });
  const shaded = new Map(nodes.map(i => [i, fl[i].kind === 'berg' || shadedAt(field.bergs, fl[i].x, fl[i].z, e)]));
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - colR(a) - colR(b);   // between the standable colliders
  const S = DATA.surfacing, goal = { x: 1330, z: -80, r: 70 };
  const start = nodes.filter(i => Math.hypot(fl[i].x - S.x, fl[i].z - S.z) < fl[i].r + 2);
  const isGoal = (i) => Math.hypot(fl[i].x - goal.x, fl[i].z - goal.z) - colR(fl[i]) - goal.r <= F.maxGap || fl[i].x + colR(fl[i]) >= DATA.fastIceX + 30;
  // BFS over (node, gold run)
  const key = (i, g) => i * 4 + g, seen = new Set(), prev = new Map(), Q = [];
  for (const i of start) { const g = shaded.get(i) ? 0 : 1; if (g <= F.maxGoldHops) { Q.push([i, g]); seen.add(key(i, g)); } }
  while (Q.length) {
    const [i, g] = Q.shift();
    if (isGoal(i)) { const path = []; let k = key(i, g); while (k !== undefined) { path.unshift(Math.floor(k / 4)); k = prev.get(k); } return { ok: true, path }; }
    for (const j of nodes) {
      if (j === i || gap(fl[i], fl[j]) > F.maxGap) continue;
      const g2 = shaded.get(j) ? 0 : g + 1;
      if (g2 > F.maxGoldHops) continue;
      const k2 = key(j, g2);
      if (seen.has(k2)) continue;
      seen.add(k2); prev.set(k2, key(i, g)); Q.push([j, g2]);
    }
  }
  return { ok: false, path: [] };
}
/**
 * Validates at 5.5..9° and, when a seed fails, nudges stepping floes into the gaps (deterministic). Shade is monotonic
 * in the sun's elevation (a floe shaded at 9° is shaded at every lower elevation), so the repair works at the hardest
 * elevation that fails: from the reachable frontier it adds a floe toward the goal with a 14 m gap, preferring spots
 * shaded at that elevation (they reset the gold run), outside the leads and clear of other floes.
 */
export function validateAndFix(field, DATA) {
  const elevs = [5.5, 6.5, 7.5, 8.5, 9];
  const log = [];
  const F = DATA.floes, fl = field.floes, goal = { x: 1330, z: -80 };
  const top = DATA.sea + F.freeboard;
  const [sdx, sdz] = sunDir2(DATA.sunClock.azimuth), eMax = DATA.sunClock.to;
  const colOf = (o) => colR(o);
  // the fill floes in the way of a new floe (they are removed); null when something else (a berg, the sledge, the
  // Raft, an earlier nudge) is in the way
  const blockers = (x, z, cr, pad = 2) => {
    const out = [];
    for (let j = 0; j < fl.length; j++) {
      const o = fl[j];
      if (o.kind === 'raft' || Math.hypot(o.x - x, o.z - z) > Math.max(colOf(o), o.r * 0.9) + cr + pad) continue;
      if (o.kind !== 'floe' || o.sled || o.nudged || o.lane) return null;
      out.push(j);
    }
    return out;
  };
  const inLead = (x, z, r) => F.leads.some(l => distToPoly(x, z, l) < r + 4);
  // shaded landing spots: berg lane centrelines at the steepest sun (shaded there = shaded at every elevation)
  const spots = [];
  for (const b of field.bergs) {
    const len = b.h / Math.tan(eMax * DEG);
    for (let t = b.r + 12; t < len - 4; t += 8) for (const lat of [-0.3, 0, 0.3]) {
      const x = b.x - sdx * t - sdz * lat * b.r, z = b.z - sdz * t + sdx * lat * b.r;
      if (x < 905 || x > 1310 || inLead(x, z, 12) || !shadedAt(field.bergs, x, z, eMax)) continue;
      spots.push({ x, z });
    }
  }
  const GR = 16, GC = COLR * 0.78 * GR;                 // gold stepping floes: r 16 (collider ~10.6 m)
  for (let round = 0; round < 40; round++) {
    const bad = elevs.filter(e => !validateField(field, DATA, e).ok);
    if (!bad.length) return { ok: true, rounds: round, log };
    const e = bad[bad.length - 1];
    const reach = reachable(field, DATA, e);
    let best = null, bs = -Infinity;
    for (const [i, g] of reach) {
      const A = fl[i], ca = colOf(A), dA = Math.hypot(goal.x - A.x, goal.z - A.z);
      for (const P of spots) {
        const cp = COLR * 0.78 * 12;
        const bl = blockers(P.x, P.z, cp);
        if (!bl || bl.includes(i)) continue;
        const L = Math.hypot(P.x - A.x, P.z - A.z), D = L - ca - cp;
        if (D <= 0) continue;
        const n = D <= F.maxGap ? 0 : Math.ceil((D - F.maxGap) / (F.maxGap + 2 * GC));
        if (g + n > F.maxGoldHops) continue;
        const prog = dA - Math.hypot(goal.x - P.x, goal.z - P.z);
        if (prog < 10) continue;
        // the gold floes, evenly spaced on the segment between the two colliders
        const ux = (P.x - A.x) / L, uz = (P.z - A.z) / L, steps = [], remove = new Set(bl);
        let ok = true;
        for (let k = 1; k <= n; k++) {
          const tt = ca + (D - n * 2 * GC) / (n + 1) * k + GC * (2 * k - 1);
          const x = A.x + ux * tt, z = A.z + uz * tt;
          const b2 = inLead(x, z, GR) ? null : blockers(x, z, GC, 1);
          if (!b2 || b2.includes(i)) { ok = false; break; }
          for (const j of b2) remove.add(j);
          steps.push({ x, z });
        }
        if (!ok) continue;
        const score = prog - n * 30 - remove.size * 2;
        if (score > bs) { bs = score; best = { steps, land: P, remove: [...remove] }; }
      }
    }
    if (!best) break;
    for (const j of best.remove.sort((a, b) => b - a)) fl.splice(j, 1);
    for (const q of best.steps) fl.push({ x: q.x, z: q.z, r: GR, rin: GR * 0.78, top, bottom: -27, kind: 'floe', v: (round + 3) % NV, yaw: round * 1.7, nudged: true });
    fl.push({ x: best.land.x, z: best.land.z, r: 12, rin: 12 * 0.78, top, bottom: -27, kind: 'floe', v: round % NV, yaw: round * 1.3, nudged: true });
    log.push(`nudge @${e}°: ${best.steps.length} gold + shaded (${best.land.x.toFixed(0)}, ${best.land.z.toFixed(0)})`);
  }
  return { ok: elevs.every(e => validateField(field, DATA, e).ok), rounds: 40, log };
}
/** reachable floes at elevation e from the surfacing point: [[index, lowest gold run]] (BFS over the gap and gold rules) */
function reachable(field, DATA, e) {
  const fl = field.floes;
  const shaded = (i) => fl[i].kind === 'berg' || shadedAt(field.bergs, fl[i].x, fl[i].z, e);
  const S = DATA.surfacing, best = new Map(), Q = [];
  fl.forEach((f, i) => { if (f.kind !== 'raft' && Math.hypot(f.x - S.x, f.z - S.z) < f.r + 2) { const g = shaded(i) ? 0 : 1; best.set(i, g); Q.push([i, g]); } });
  while (Q.length) {
    const [i, g] = Q.shift();
    if (best.get(i) < g) continue;
    fl.forEach((f, j) => {
      if (f.kind === 'raft' || Math.hypot(f.x - fl[i].x, f.z - fl[i].z) - colR(f) - colR(fl[i]) > DATA.floes.maxGap) return;
      const g2 = shaded(j) ? 0 : g + 1; if (g2 > DATA.floes.maxGoldHops) return;
      if (best.has(j) && best.get(j) <= g2) return;
      best.set(j, g2); Q.push([j, g2]);
    });
  }
  return [...best.entries()];
}

// ════════════════════════════════════════════════════════════════════════════════ the runtime field
/** a floe variant at unit radius: the body spans y -1..0 (top at 0), a snow cap sits just above it (scaled by thickness) */
function variantGeo(ctx, v) {
  const rng = mulberry32(900 + v);
  const pts = blob(rng, 1, 7 + (v % 3), 0.18);
  const q3 = (k) => pts.map(([a, b]) => [Math.round(a * k) / 1000, Math.round(b * k) / 1000]);
  const body = KIT.plateGeo(q3(1000), 1, 'top', 0.12);
  const cap = KIT.plateGeo(q3(900), 0.03, 'top', 0.008);
  const col = (g, c, y) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    n.translate(0, y, 0);
    if (!n.attributes.normal) n.computeVertexNormals();
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', n.attributes.position);
    out.setAttribute('normal', n.attributes.normal);
    const k = n.attributes.position.count, a = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) { const ny = n.attributes.normal.getY(i); const cc = ny > 0.6 ? c : _c.copy(c).multiplyScalar(0.72); a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    out.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return out;
  };
  const g = mergeGeometries([col(body, new THREE.Color('#c6d8ea'), -0.51), col(cap, new THREE.Color('#ffffff'), -0.01)], false);
  g.computeBoundingSphere();
  return shared(g);
}
const VGEO = new WeakMap();

export class FloeField {
  constructor(L) {
    this.L = L; const ctx = L.ctx, DATA = L.DATA;
    this.field = generateField(DATA);
    this.check = validateAndFix(this.field, DATA);
    if (!this.check.ok) console.warn('[level01] floe field failed validation', this.check.log);
    const fl = this.field.floes;
    this.n = fl.length;
    this.state = new Uint8Array(this.n);        // 0 solid, 1 rotting, 2 sunk, 3 hidden (raft split / not yet split)
    this.rotT = new Float32Array(this.n);
    this.shaded = new Uint8Array(this.n);
    this.crackT = new Float32Array(this.n);     // visual crack flash (light wall, plunges)
    this.sinkY = new Float32Array(this.n);
    // the dawn front (sunrise.js): floes whose projection on the sun direction is ≥ dawnD are in the dawn light
    const [sdx, sdz] = sunDir2(DATA.sunClock.azimuth);
    this.proj = Float32Array.from(fl.map(f => f.x * sdx + f.z * sdz));
    this.dawnD = Infinity;
    // instanced meshes per variant
    let vg = VGEO.get(ctx); if (!vg) { vg = Array.from({ length: NV }, (_, v) => variantGeo(ctx, v)); VGEO.set(ctx, vg); }
    const mat = ctx.materials.standard({ color: '#ffffff', vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.9 });
    this.meshes = vg.map((g, v) => {
      const count = fl.filter(f => f.v === v && f.kind !== 'berg').length + 1;
      const m = new THREE.InstancedMesh(g, mat, count);
      m.count = 0; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; m.name = 'floes' + v;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      ctx.levelRoot.add(m);
      return m;
    });
    this.slot = new Int32Array(this.n).fill(-1);
    fl.forEach((f, i) => { if (f.kind === 'berg') return; const m = this.meshes[f.v]; this.slot[i] = m.count++; });
    // foam rings at the waterline: one InstancedMesh on the floes' own material (same shader program), white per instance
    const rg = new THREE.RingGeometry(1.0, 1.16, 28, 1); rg.rotateX(-PI / 2); rg.deleteAttribute('uv');
    rg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rg.attributes.position.count * 3).fill(0.9), 3));
    this.foam = new THREE.InstancedMesh(rg, mat, this.n);
    this.foam.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 3).fill(1), 3);
    this.foam.count = this.n; this.foam.frustumCulled = false; this.foam.castShadow = false; this.foam.receiveShadow = false;
    ctx.levelRoot.add(this.foam);
    // bergs: tabular icebergs (merged; 1 draw call per material)
    this.bergMesh = this.buildBergs(ctx);
    // colliders: one per floe, created once
    const C = ctx.collision;
    this.cols = fl.map((f, i) => {
      const top = f.kind === 'berg' ? f.top : f.top;
      const c = C.circle(f.x, f.z, colR(f), top, f.bottom, { surface: 'ice', tag: 'floe' });
      c.l01floe = i;
      return c;
    });
    this.bergCols = this.field.bergs.map(b => { const c = C.circle(b.x, b.z, b.r * 0.92, DATA.floeTop + b.h, -27, { surface: 'ice', tag: 'berg' }); return c; });
    // sled 3 (Lark's Rest) rides its floe: sinks with it
    this.sledIdx = fl.findIndex(f => f.sled);
    const sr = rig(ctx, { key: 'sled', parts: sledModel(ctx).parts });
    this.sled = sr.root; this.sled.name = 'sled3';
    this.sled.rotation.y = 0.6;
    ctx.levelRoot.add(this.sled);
    this.split = false; this.running = false; this.frozen = false;
    this.reset(false);
  }
  buildBergs(ctx) {
    const M = mats(ctx), group = new THREE.Group();
    const parts = [];
    for (const b of this.field.bergs) {
      const rng = mulberry32(Math.floor(b.x * 7 + b.z));
      const pts = blob(rng, b.r, 9, 0.12);
      const g = KIT.plateGeo(pts.map(([a, c]) => [Math.round(a * 100) / 100, Math.round(c * 100) / 100]), b.h + 6, 'top', 1.2);
      const n = (g.index ? g.toNonIndexed() : g.clone());
      n.deleteAttribute('uv'); n.clearGroups?.();
      n.translate(b.x, this.L.DATA.floeTop + (b.h + 6) / 2 - 6, b.z);
      parts.push(n);
    }
    const geo = mergeGeometries(parts.map(p => { const o = new THREE.BufferGeometry(); o.setAttribute('position', p.attributes.position); o.setAttribute('normal', p.attributes.normal); return o; }), false);
    const mesh = new THREE.Mesh(geo, M.ice); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'bergs';
    group.add(mesh);
    this.L.ctx.levelRoot.add(group);
    return group;
  }
  /** back to the start state: the Raft whole, everything solid; split = true for cp_floes */
  reset(split) {
    this.split = !!split; this.rotT.fill(0); this.crackT.fill(0); this.sinkY.fill(0);
    const fl = this.field.floes;
    for (let i = 0; i < this.n; i++) {
      const k = fl[i].kind;
      this.state[i] = k === 'raft' ? (split ? 3 : 0) : k === 'frag' ? (split ? 0 : 3) : 0;
      this.cols[i].enabled = this.state[i] === 0;
    }
    this.touched = -1; this.touchedGold = false; this.dawnD = Infinity;
    this.updateShade(true);
    this.writeAll();
  }
  /** the Raft splits (finale): every raft floe swaps for its fragments */
  doSplit() {
    if (this.split) return;
    this.split = true;
    const fl = this.field.floes;
    for (let i = 0; i < this.n; i++) {
      if (fl[i].kind === 'raft') { this.state[i] = 3; this.cols[i].enabled = false; }
      else if (fl[i].kind === 'frag') { this.state[i] = 0; this.cols[i].enabled = true; this.crackT[i] = 1.5; }
    }
    this.writeAll();
  }
  /** the floe (index) the point stands on, or -1 */
  floeAt(x, z, y) {
    const C = this.L.ctx.collision;
    for (const c of C.near(x, z)) {
      if (c.l01floe === undefined || !c.enabled) continue;
      if (Math.hypot(x - c.x, z - c.z) <= c.r + 0.5 && (y === undefined || Math.abs(y - c.top) < 0.8)) return c.l01floe;
    }
    return -1;
  }
  nearestFloe(x, z, raftOnly) {
    let best = null, bd = Infinity;
    const fl = this.field.floes;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== 0) continue;
      if (raftOnly && fl[i].kind !== 'raft' && fl[i].kind !== 'frag') continue;
      const d = Math.hypot(fl[i].x - x, fl[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  floePos(i, out) { const f = this.field.floes[i]; return out.set(f.x, f.top, f.z); }
  crack(i) { this.crackT[i] = 1.2; this.L.ctx.audio?.play?.('iceCrack', _p.set(this.field.floes[i].x, this.field.floes[i].top, this.field.floes[i].z)); }
  /** split the floe under (x, z) into a gap (the finale): the floe sinks at once (the player falls in) */
  dropUnder(x, z) {
    const i = this.floeAt(x, z);
    if (i < 0) return false;
    this.state[i] = 2; this.cols[i].enabled = false; this.sinkY[i] = 0.01;
    this.L.ctx.fx?.dust?.(_p.set(x, this.field.floes[i].top, z), 30, 12, [0.95, 0.97, 1]);
    this.L.ctx.audio?.play?.('iceCrack', _p);
    return true;
  }
  sunElevation() { return this.L.sunElev ?? 5.5; }
  /** is floe i in the dawn light (the light wall has passed it, or the sun is up)? */
  isDawn(i) { return this.proj[i] >= this.dawnD || !!this.L.flag('p:sunrise'); }
  /** sunrise.js: the light wall's front moved to d (projection on the sun direction); floes it passes crack gold-white */
  setDawnFront(d) {
    if (d >= this.dawnD) return 0;
    let n = 0;
    for (let i = 0; i < this.n; i++) if (this.proj[i] >= d && this.proj[i] < this.dawnD && this.state[i] !== 3) { this.crackT[i] = Math.max(this.crackT[i], 1.0); n++; }
    this.dawnD = d;
    this.updateShade(true);
    return n;
  }
  /** sled 3 on its floe: placed at the floe's current top, hidden once sunk */
  placeSled() {
    const i = this.sledIdx; if (i < 0 || !this.sled) return;
    const f = this.field.floes[i];
    this.sled.visible = !(this.state[i] === 2 && this.sinkY[i] >= 8) && this.state[i] !== 3;
    this.sled.position.set(f.x + 2, this.topOf(i), f.z - 1);
    this.sled.updateMatrixWorld(true);
  }
  sledPos(out) { const i = this.sledIdx; return i < 0 ? null : out.set(this.field.floes[i].x + 2, this.topOf(i), this.field.floes[i].z - 1); }
  updateShade(force) {
    const fl = this.field.floes, e = this.sunElevation();
    let changed = false;
    for (let i = 0; i < this.n; i++) {
      const s = !this.isDawn(i) || fl[i].kind === 'berg' || shadedAt(this.field.bergs, fl[i].x, fl[i].z, e) ? 1 : 0;
      if (s !== this.shaded[i]) { this.shaded[i] = s; changed = true; }
    }
    if (changed || force) this.writeColors();
  }
  /** sim update: rot timers, support detection, sinking */
  update(dt) {
    const L = this.L, p = L.ctx.player;
    this.shadeT = (this.shadeT ?? 0) - dt;
    if (this.shadeT <= 0) { this.shadeT = 0.5; this.updateShade(false); }
    let dirty = false;
    // support
    this.touched = -1;
    if (p?.active && p.alive && p.onGround) this.touched = this.floeAt(p.pos.x, p.pos.z, p.pos.y);
    const canRot = this.running && !this.frozen && L.flag('p:sunrise');
    if (this.touched >= 0 && canRot && this.state[this.touched] === 0 && !this.shaded[this.touched] && this.field.floes[this.touched].kind !== 'berg') {
      this.state[this.touched] = 1; this.rotT[this.touched] = 0; this.touchedGold = true; L.counters.touchedGold++;
      L.ctx.audio?.play?.('iceGroan', p.pos);
    }
    for (let i = 0; i < this.n; i++) {
      if (this.crackT[i] > 0) { this.crackT[i] = Math.max(0, this.crackT[i] - dt); dirty = true; }
      if (this.state[i] === 1) {
        this.rotT[i] += dt; dirty = true;
        const f = this.field.floes[i];
        if (this.rotT[i] > 1.5 && Math.random() < dt * 6) L.ctx.fx?.dust?.(_p.set(f.x + (Math.random() - 0.5) * f.r, f.top, f.z + (Math.random() - 0.5) * f.r), 3, 2, [1, 1, 1]);
        if (this.rotT[i] >= 3.0) {
          this.state[i] = 2; this.cols[i].enabled = false; this.sinkY[i] = 0.01;
          L.ctx.particles?.debris?.spawn?.(_p.set(f.x, f.top, f.z), 6, Math.min(3, f.r / 6), mats(L.ctx).ice, 0.6);
          L.ctx.audio?.play?.('iceCrack', _p);
          if (f.sled && !L.flag('sled3')) L.setFlag('sled3Lost', true);
        }
      } else if (this.state[i] === 2 && this.sinkY[i] < 8) { this.sinkY[i] += dt * 4; dirty = true; }
    }
    if (dirty) this.writeAll();
  }
  writeColors() {
    const fl = this.field.floes;
    for (let i = 0; i < this.n; i++) {
      const s = this.slot[i]; if (s < 0) continue;
      const m = this.meshes[fl[i].v];
      if (!this.isDawn(i)) _c.copy(COL.night);
      else if (this.state[i] === 1) _c.copy(COL.rot);
      else _c.copy(this.shaded[i] ? COL.shade : COL.sun);
      if (this.crackT[i] > 0) _c.lerp(COL.crack, Math.min(1, this.crackT[i]));
      if (this.state[i] === 1 && this.rotT[i] < 1.5) _c.lerp(COL.sun, 0.5 - this.rotT[i] / 3);
      m.instanceColor.setXYZ(s, _c.r, _c.g, _c.b);
    }
    for (const m of this.meshes) m.instanceColor.needsUpdate = true;
  }
  /** the floe's current top (sag while rotting, sinking once sunk) */
  topOf(i) {
    const f = this.field.floes[i];
    const sag = this.state[i] === 1 ? Math.min(0.6, Math.max(0, this.rotT[i] - 1.5) / 1.5 * 0.6) : 0;
    return f.top - sag - this.sinkY[i];
  }
  writeAll() {
    const fl = this.field.floes;
    for (let i = 0; i < this.n; i++) {
      const f = fl[i], s = this.slot[i];
      const thick = f.top - f.bottom;
      const hide = this.state[i] === 3 || (this.state[i] === 2 && this.sinkY[i] >= 8);
      _q.setFromAxisAngle(_p.set(0, 1, 0), f.yaw);
      _s.set(hide ? 0 : f.r, hide ? 0 : thick, hide ? 0 : f.r);
      _m4.compose(_p.set(f.x, this.topOf(i), f.z), _q, _s);   // the body spans y -1..0 × thick below the top
      if (s >= 0) this.meshes[f.v].setMatrixAt(s, _m4);
      // foam ring at the waterline
      const fr = hide ? 0 : f.r * 1.02;
      _m4.compose(_p.set(f.x, this.L.DATA.sea + 0.06, f.z), _q, _s.set(fr, 1, fr));
      this.foam.setMatrixAt(i, _m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.foam.instanceMatrix.needsUpdate = true;
    this.placeSled();
    this.writeColors();
  }
  /** debugging and tests: snapshot of the states */
  stateString() { return Array.from(this.state).join(''); }
  dispose() {
    const C = this.L.ctx.collision;
    for (const c of this.cols) C?.remove(c);
    for (const c of this.bergCols) C?.remove(c);
    this.foam.geometry.dispose();
  }
}

// ════════════════════════════════════════════════════════════════════════════════ the sea plane
/** one large plane at y -24 (dark green-black, sun glint from the sky reflection) plus its underside seen from below */
export class Sea {
  constructor(L) {
    const ctx = L.ctx, B = L.DATA.seaBounds, y = L.DATA.sea;
    const w = B.x1 - B.x0, d = B.z1 - B.z0;
    const g = new THREE.PlaneGeometry(w, d, 1, 1); g.rotateX(-PI / 2);
    // library materials (no extra shader programs): a glossy dark green-black top, an emissive green-white underside
    const top = ctx.materials.standard({ color: '#0d2226', roughness: 0.1, metalness: 0.05, envMapIntensity: 1.3 });
    this.top = new THREE.Mesh(g, top); this.top.position.set((B.x0 + B.x1) / 2, y, (B.z0 + B.z1) / 2); this.top.receiveShadow = true; this.top.name = 'sea';
    const g2 = new THREE.PlaneGeometry(w, d, 1, 1); g2.rotateX(PI / 2);
    const under = ctx.materials.emissive('#7fc0a8', 1.0);
    this.under = new THREE.Mesh(g2, under); this.under.position.copy(this.top.position); this.under.position.y -= 0.05; this.under.name = 'seaUnder';
    ctx.levelRoot.add(this.top, this.under);
  }
  dispose() { for (const m of [this.top, this.under]) m.geometry.dispose(); }
}
