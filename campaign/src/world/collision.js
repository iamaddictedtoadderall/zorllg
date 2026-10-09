// world/collision.js (P2): 2.5D colliders (arch §5.10). A collider is a footprint (axis-aligned box, oriented box or
// circle) extruded between `bottom` and `top`; a collider with a bottom is an overpass, roof or bridge deck that bodies
// can walk on or pass under. Colliders live in a 32 m spatial hash (each one inserted into every cell its footprint
// plus 5 m overlaps).
//
// Semantics (prototype, extended):
// - supportHeight(x, z, y): the highest of the ground and every collider top under (x, z) that a body at height y can
//   step onto (step-up 1.6 m).
// - resolve(body): bodies standing on a top (y ≥ top − 1) are left alone; a body overlapping a collider's side is pushed
//   out horizontally by the shortest way (oriented boxes in their own frame); a body whose head enters a collider's
//   bottom from below is held under it (ceiling) when there is room to stand, otherwise the collider acts as a wall.
// - pointInSolid(p): inside any enabled collider (the ground is not included, as in the prototype).
// - segment(a, b): swept test. Colliders: slab tests (boxes in their own frame, cylinders for circles) on the hash
//   cells the segment crosses (2D DDA); ground: marching ≤ 4 m steps then bisection. The nearest hit wins. `radius`
//   inflates every collider and lifts the ground. A segment that starts inside a collider ignores that collider, and
//   one that starts below the ground ignores the ground ("callers start from free space").
// - ColliderOpts.surface passes any string through to SegmentHit.surface (addendum A5.5); the default is 'concrete'.
//
// obox convention: hw is the half-extent along the box's local X, hd along local Z, rotated by `yaw` exactly like
// Object3D.rotation.y: world = (x + lx·cos + lz·sin, z − lx·sin + lz·cos).
import * as THREE from 'three';

const CG = 32;            // hash cell (m)
const PAD = 5;            // hash insertion overlap (m)
const NONE = Object.freeze([]);
const ckey = (i, j) => i * 100003 + j;
const BIG = 1e9;

const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
const _n = new THREE.Vector3();
const _losHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };

export class Collision {
  constructor(ctx) {
    this.ctx = ctx;
    this.ground = null;
    this._list = [];
    this._grid = new Map();
    this._id = 0;
    this._q = 0;              // query stamp (dedupe colliders seen in several cells)
  }
  get count() { return this._list.length; }

  add(c) {
    if (!c || !c.type) throw new Error('Collision.add: collider needs a type');
    if (!Number.isFinite(c.top)) throw new Error('Collision.add: collider needs a numeric top');
    c.id = ++this._id;
    c.enabled = c.enabled !== false;
    if (c.bottom === undefined || c.bottom === null || !Number.isFinite(c.bottom)) c.bottom = -BIG;
    c.surface = c.surface || 'concrete';
    this._bounds(c);
    c._q = 0;
    this._list.push(c);
    this._insert(c);
    return c;
  }
  /** extra: re-hash a collider after its position, size or yaw was changed in place */
  update(c) { this._unhash(c); this._bounds(c); this._insert(c); return c; }
  remove(c) {
    if (!c) return;
    const i = this._list.indexOf(c);
    if (i < 0) return;
    this._list.splice(i, 1);
    this._unhash(c);
  }
  _bounds(c) {
    if (c.type === 'circle') {
      if (!(c.r > 0)) throw new Error('Collision.add: circle needs r > 0');
      c.minx = c.x - c.r; c.maxx = c.x + c.r; c.minz = c.z - c.r; c.maxz = c.z + c.r;
    } else if (c.type === 'obox') {
      c.yaw = Number(c.yaw) || 0;
      c._c = Math.cos(c.yaw); c._s = Math.sin(c.yaw);
      const co = Math.abs(c._c), si = Math.abs(c._s);
      const ex = c.hw * co + c.hd * si, ez = c.hw * si + c.hd * co;
      c.minx = c.x - ex; c.maxx = c.x + ex; c.minz = c.z - ez; c.maxz = c.z + ez;
    } else if (c.type === 'box') {
      if (c.minx > c.maxx) { const t = c.minx; c.minx = c.maxx; c.maxx = t; }
      if (c.minz > c.maxz) { const t = c.minz; c.minz = c.maxz; c.maxz = t; }
    } else throw new Error('Collision.add: unknown type ' + c.type);
  }
  _insert(c) {
    c._cells = [];
    for (let i = Math.floor((c.minx - PAD) / CG); i <= Math.floor((c.maxx + PAD) / CG); i++)
      for (let j = Math.floor((c.minz - PAD) / CG); j <= Math.floor((c.maxz + PAD) / CG); j++) {
        const k = ckey(i, j);
        let cell = this._grid.get(k);
        if (!cell) { cell = []; this._grid.set(k, cell); }
        cell.push(c); c._cells.push(k);
      }
  }
  _unhash(c) {
    for (const k of c._cells || []) {
      const cell = this._grid.get(k); if (!cell) continue;
      const j = cell.indexOf(c); if (j >= 0) cell.splice(j, 1);
      if (!cell.length) this._grid.delete(k);
    }
    c._cells = [];
  }
  box(cx, cz, w, d, top, bottom, o = {}) {
    return this.add({ ...o, type: 'box', minx: cx - w / 2, maxx: cx + w / 2, minz: cz - d / 2, maxz: cz + d / 2, top, bottom });
  }
  obox(cx, cz, w, d, yaw, top, bottom, o = {}) {
    return this.add({ ...o, type: 'obox', x: cx, z: cz, hw: w / 2, hd: d / 2, yaw, top, bottom });
  }
  circle(x, z, r, top, bottom, o = {}) {
    return this.add({ ...o, type: 'circle', x, z, r, top, bottom });
  }
  near(x, z) { return this._grid.get(ckey(Math.floor(x / CG), Math.floor(z / CG))) || NONE; }
  groundHeight(x, z) { return this.ground ? this.ground.groundHeight(x, z) : 0; }

  /** footprint test with an optional horizontal pad */
  _in(c, x, z, pad = 0) {
    if (c.type === 'circle') { const dx = x - c.x, dz = z - c.z, r = c.r + pad; return dx * dx + dz * dz < r * r; }
    if (c.type === 'box') return x > c.minx - pad && x < c.maxx + pad && z > c.minz - pad && z < c.maxz + pad;
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c._c - dz * c._s, lz = dx * c._s + dz * c._c;
    return lx > -c.hw - pad && lx < c.hw + pad && lz > -c.hd - pad && lz < c.hd + pad;
  }
  supportHeight(x, z, y) {
    let g = this.groundHeight(x, z);
    const cell = this.near(x, z);
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.enabled && y >= c.top - 1.6 && c.top > g && this._in(c, x, z)) g = c.top;
    }
    return g;
  }
  resolve(m) {
    const p = m.pos, r = m.rad || 0, hgt = m.hgt || 0;
    let touched = false;
    const cell = this.near(p.x, p.z);
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (!c.enabled) continue;
      if (p.y >= c.top - 1.0) continue;                 // standing on it (or above)
      if (p.y + hgt <= c.bottom) continue;              // entirely below an overpass
      if (c.bottom > -1e8 && p.y < c.bottom && p.y + hgt > c.bottom && this._in(c, p.x, p.z)) {
        // head inside the underside: a ceiling if the body fits under it, otherwise fall through to a wall push
        const below = this.groundHeight(p.x, p.z);
        if (c.bottom - hgt >= below - 0.05 && p.y + hgt * 0.5 < c.bottom) {
          p.y = c.bottom - hgt;
          if (m.vel && m.vel.y > 0) m.vel.y = 0;
          touched = true;
          continue;
        }
      }
      if (this._push(c, p, r)) touched = true;
    }
    return touched;
  }
  /** horizontal push-out of a disc (centre p, radius r) from a footprint; true if it moved */
  _push(c, p, r) {
    if (c.type === 'circle') {
      const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz, min = c.r + r;
      if (d2 >= min * min) return false;
      const d = Math.sqrt(d2);
      if (d > 1e-6) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
      else p.x = c.x + min;                              // dead centre: deterministic direction
      return true;
    }
    let lx, lz, hw, hd;
    if (c.type === 'box') {
      hw = (c.maxx - c.minx) / 2; hd = (c.maxz - c.minz) / 2;
      lx = p.x - (c.minx + c.maxx) / 2; lz = p.z - (c.minz + c.maxz) / 2;
    } else {
      hw = c.hw; hd = c.hd;
      const dx = p.x - c.x, dz = p.z - c.z;
      lx = dx * c._c - dz * c._s; lz = dx * c._s + dz * c._c;
    }
    let nx = lx, nz = lz;
    const qx = lx < -hw ? -hw : lx > hw ? hw : lx, qz = lz < -hd ? -hd : lz > hd ? hd : lz;
    const ex = lx - qx, ez = lz - qz, e2 = ex * ex + ez * ez;
    if (e2 > 1e-10) {
      if (e2 >= r * r) return false;
      const e = Math.sqrt(e2);
      nx = qx + ex / e * r; nz = qz + ez / e * r;
    } else {
      // centre inside: shortest axis
      const l = lx + hw, rr = hw - lx, f = lz + hd, b = hd - lz, mn = Math.min(l, rr, f, b);
      if (mn === l) nx = -hw - r; else if (mn === rr) nx = hw + r; else if (mn === f) nz = -hd - r; else nz = hd + r;
    }
    if (c.type === 'box') { p.x = (c.minx + c.maxx) / 2 + nx; p.z = (c.minz + c.maxz) / 2 + nz; }
    else { p.x = c.x + nx * c._c + nz * c._s; p.z = c.z - nx * c._s + nz * c._c; }
    return true;
  }
  pointInSolid(q) {
    const cell = this.near(q.x, q.z);
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.enabled && q.y < c.top && q.y > c.bottom && this._in(c, q.x, q.z)) return true;
    }
    return false;
  }

  /**
   * Swept test a → b. Returns the nearest hit (written into `out` when given) or null.
   * o.ground (true), o.colliders (true), o.radius (0).
   */
  segment(a, b, out, o) {
    const useG = !o || o.ground !== false, useC = !o || o.colliders !== false, rad = (o && o.radius) || 0;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(L > 1e-9)) return null;
    let bestT = Infinity, bestC = null;
    const H = _hit;
    // ---- colliders: DDA over hash cells
    if (useC && this._list.length) {
      const q = ++this._q;
      const visit = (cell) => {
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i];
          if (c._q === q) continue;
          c._q = q;
          if (!c.enabled) continue;
          const t = this._sweep(c, a, dx, dy, dz, rad, bestT, _n);
          if (t < bestT) { bestT = t; bestC = c; H.normal.copy(_n); }
        }
      };
      if (rad > PAD - 0.5) {
        // fat sweeps: every cell under the inflated AABB of the segment
        const i0 = Math.floor((Math.min(a.x, b.x) - rad) / CG), i1 = Math.floor((Math.max(a.x, b.x) + rad) / CG);
        const j0 = Math.floor((Math.min(a.z, b.z) - rad) / CG), j1 = Math.floor((Math.max(a.z, b.z) + rad) / CG);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const cell = this._grid.get(ckey(i, j)); if (cell) visit(cell); }
      } else {
        let i = Math.floor(a.x / CG), j = Math.floor(a.z / CG);
        const iEnd = Math.floor(b.x / CG), jEnd = Math.floor(b.z / CG);
        const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
        const tdx = Math.abs(dx) > 1e-12 ? CG / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-12 ? CG / Math.abs(dz) : Infinity;
        let tmx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (i + 1) * CG : i * CG) - a.x) / dx : Infinity;
        let tmz = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (j + 1) * CG : j * CG) - a.z) / dz : Infinity;
        for (let guard = 0; guard < 4096; guard++) {
          const cell = this._grid.get(ckey(i, j));
          if (cell) visit(cell);
          if (i === iEnd && j === jEnd) break;
          // cells beyond the best hit so far cannot hold a nearer one (colliders overlap their cells by 5 m, and the
          // hit itself was found in an earlier cell), so stop early
          const tNext = Math.min(tmx, tmz);
          if (tNext > 1 || tNext > bestT + PAD / Math.max(1e-6, Math.hypot(dx, dz))) break;
          if (tmx < tmz) { tmx += tdx; i += stepI; } else { tmz += tdz; j += stepJ; }
        }
      }
    }
    // ---- ground: march ≤ 4 m steps up to the best collider hit, then bisect
    let groundT = Infinity;
    if (useG && this.ground) {
      const gh = (t) => this.groundHeight(a.x + dx * t, a.z + dz * t) + rad;
      if (a.y >= gh(0)) {
        const tMax = Math.min(1, bestT);
        const steps = Math.max(1, Math.ceil(L * tMax / 4));
        let prev = 0;
        for (let s = 1; s <= steps; s++) {
          const t = tMax * s / steps;
          if (a.y + dy * t < gh(t)) {
            let lo = prev, hi = t;
            for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (a.y + dy * m < gh(m)) hi = m; else lo = m; }
            groundT = hi;
            break;
          }
          prev = t;
        }
      }
    }
    if (groundT === Infinity && bestT === Infinity) return null;
    out = out || { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
    if (groundT <= bestT) {
      out.t = groundT;
      out.point.set(a.x + dx * groundT, a.y + dy * groundT, a.z + dz * groundT);
      out.ground = true; out.collider = null;
      const w = this.ctx?.world;
      out.surface = w?.surfaceAt ? w.surfaceAt(out.point.x, out.point.z) : 'ground';
      if (w?.normalAt) w.normalAt(out.point.x, out.point.z, out.normal); else out.normal.set(0, 1, 0);
    } else {
      out.t = bestT;
      out.point.set(a.x + dx * bestT, a.y + dy * bestT, a.z + dz * bestT);
      out.ground = false; out.collider = bestC; out.surface = bestC.surface || 'concrete';
      out.normal.copy(H.normal);
    }
    return out;
  }
  /** entry t in [0, 1] of the ray a + t·d into collider c inflated by rad (Infinity if none or a starts inside) */
  _sweep(c, a, dx, dy, dz, rad, tLimit, nOut) {
    // vertical slab
    const y0 = c.bottom > -1e8 ? c.bottom - rad : -Infinity, y1 = c.top + rad;
    let tin = -Infinity, tout = Infinity, axis = 0, sgn = 0;
    if (Math.abs(dy) < 1e-12) { if (a.y <= y0 || a.y >= y1) return Infinity; }
    else {
      let t0 = (y0 - a.y) / dy, t1 = (y1 - a.y) / dy, s0 = -1;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; s0 = 1; }
      // entering through the bottom (moving up: s = −1) or the top (moving down: s = +1)
      if (t0 > tin) { tin = t0; axis = 1; sgn = dy > 0 ? -1 : 1; }
      if (t1 < tout) tout = t1;
      void s0;
    }
    if (c.type === 'circle') {
      const R = c.r + rad, ox = a.x - c.x, oz = a.z - c.z;
      const A = dx * dx + dz * dz, B = 2 * (ox * dx + oz * dz), C = ox * ox + oz * oz - R * R;
      if (A < 1e-12) { if (C >= 0) return Infinity; }
      else {
        const disc = B * B - 4 * A * C;
        if (disc < 0) return Infinity;
        const sq = Math.sqrt(disc), t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
        if (t0 > tin) { tin = t0; axis = 3; }
        if (t1 < tout) tout = t1;
      }
      if (tin > tout || tout < 0 || tin < 0 || tin > 1 || tin >= tLimit) return Infinity;
      if (axis === 1) nOut.set(0, sgn, 0);
      else { const px = a.x + dx * tin - c.x, pz = a.z + dz * tin - c.z, l = Math.hypot(px, pz) || 1; nOut.set(px / l, 0, pz / l); }
      return tin;
    }
    // boxes: work in the box frame
    let ox, oz, ldx, ldz, hw, hd;
    if (c.type === 'box') {
      hw = (c.maxx - c.minx) / 2 + rad; hd = (c.maxz - c.minz) / 2 + rad;
      ox = a.x - (c.minx + c.maxx) / 2; oz = a.z - (c.minz + c.maxz) / 2; ldx = dx; ldz = dz;
    } else {
      hw = c.hw + rad; hd = c.hd + rad;
      const rx = a.x - c.x, rz = a.z - c.z;
      ox = rx * c._c - rz * c._s; oz = rx * c._s + rz * c._c;
      ldx = dx * c._c - dz * c._s; ldz = dx * c._s + dz * c._c;
    }
    let lsx = 0, lsz = 0;
    if (Math.abs(ldx) < 1e-12) { if (ox <= -hw || ox >= hw) return Infinity; }
    else {
      let t0 = (-hw - ox) / ldx, t1 = (hw - ox) / ldx;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > tin) { tin = t0; axis = 2; lsx = ldx > 0 ? -1 : 1; lsz = 0; }
      if (t1 < tout) tout = t1;
    }
    if (Math.abs(ldz) < 1e-12) { if (oz <= -hd || oz >= hd) return Infinity; }
    else {
      let t0 = (-hd - oz) / ldz, t1 = (hd - oz) / ldz;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t0 > tin) { tin = t0; axis = 2; lsx = 0; lsz = ldz > 0 ? -1 : 1; }
      if (t1 < tout) tout = t1;
    }
    if (tin > tout || tout < 0 || tin < 0 || tin > 1 || tin >= tLimit) return Infinity;
    if (axis === 1) nOut.set(0, sgn, 0);
    else if (c.type === 'box') nOut.set(lsx, 0, lsz);
    else nOut.set(lsx * c._c + lsz * c._s, 0, -lsx * c._s + lsz * c._c);
    return tin;
  }
  lineOfSight(a, b) { return !this.segment(a, b, _losHit); }
  clear() { this._list.length = 0; this._grid.clear(); this._id = 0; }
}
