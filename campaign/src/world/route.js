// world/route.js (P2): the level route (arch §4.2, §5.2). A centripetal Catmull-Rom spline through the control points,
// sampled densely (≤ 2 m), with an arc-length table, per-sample tangents and an O(1) closest-point grid.
//
// Conventions (arch §1.3): s = metres along the route from its start; l = lateral offset, positive to the RIGHT of travel
// (right = (−t.z, t.x) for the unit tangent t). All positions have y = 0.
//
// Spline details:
// - `tension` is the Catmull-Rom alpha (0 uniform, 0.5 centripetal (default), 1 chordal), Barry–Goldman evaluation.
// - The phantom end points are extrapolated (2·P0 − P1), which reproduces the s values in level-01.md §2.3 exactly.
// - An interior control point where the route turns by more than `corner` degrees (default 80) is kept as a sharp corner:
//   both neighbouring spans see an extrapolated phantom there, so they arrive and leave in straight lines instead of
//   bulging round a hairpin. Level routes turn far less (L1's sharpest turn is 67°); an L-shaped test route stays an
//   exact polyline.
// - halfWidth per control point is interpolated in s with a smoothstep between control points (no kinks in the walls).
//
// closest(x, z) is O(1): a 32 m grid stores, per cell, the 16 m chunks of the dense polyline that can contain the
// nearest point of any query inside that cell (conservative bound test), so a query tests a handful of short segments.
import * as THREE from 'three';
import { yawTo, clamp } from '../core/util.js';

const _t = new THREE.Vector3();
const GRID = 32;          // closest-point grid cell (m)
const SUPER = 8;          // grid cells per super cell side (hierarchical build)
const CHUNK = 12;         // dense segments per chunk
const DENSE = 2;          // max dense sample spacing (m)

export class Route {
  constructor(points, o = {}) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('Route needs at least 2 points');
    const P = points.map(p => [Number(p[0]), Number(p[1])]);
    for (const p of P) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error('Route: non-numeric point');
    this._pts = P;
    this.tension = Number.isFinite(o.tension) ? o.tension : 0.5;
    this.cornerDeg = Number.isFinite(o.corner) ? o.corner : 80;
    const n = P.length;

    // ---- sharp corners
    const sharp = new Uint8Array(n);
    for (let i = 1; i < n - 1; i++) {
      const ax = P[i][0] - P[i - 1][0], az = P[i][1] - P[i - 1][1], bx = P[i + 1][0] - P[i][0], bz = P[i + 1][1] - P[i][1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 1e-6 || lb < 1e-6) continue;
      const c = clamp((ax * bx + az * bz) / (la * lb), -1, 1);
      if (Math.acos(c) * 180 / Math.PI > this.cornerDeg) sharp[i] = 1;
    }
    this._sharp = sharp;

    // ---- dense samples (every span pushes its own start point: control points appear twice, as zero-length pieces)
    const X = [], Z = [], TX = [], TZ = [], S = [];
    const ctrlS = new Float64Array(n);
    let s = 0, px = P[0][0], pz = P[0][1];
    const q = { x: 0, z: 0 }, q2 = { x: 0, z: 0 };
    for (let i = 0; i < n - 1; i++) {
      const p1 = P[i], p2 = P[i + 1];
      const p0 = (i > 0 && !sharp[i]) ? P[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
      const p3 = (i + 2 < n && !sharp[i + 1]) ? P[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
      const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const m = Math.max(2, Math.ceil(chord / DENSE));
      ctrlS[i] = s;
      for (let k = 0; k <= m; k++) {
        const t = k / m;
        crPoint(p0, p1, p2, p3, this.tension, t, q);
        if (k > 0) s += Math.hypot(q.x - px, q.z - pz);
        // tangent by a small central difference inside the span (one-sided at the ends)
        const h = 1e-4, ta = Math.max(0, t - h), tb = Math.min(1, t + h);
        crPoint(p0, p1, p2, p3, this.tension, ta, q2);
        const ax = q2.x, az = q2.z;
        crPoint(p0, p1, p2, p3, this.tension, tb, q2);
        let tx = q2.x - ax, tz = q2.z - az;
        const tl = Math.hypot(tx, tz);
        if (tl > 1e-12) { tx /= tl; tz /= tl; } else { tx = (p2[0] - p1[0]) / (chord || 1); tz = (p2[1] - p1[1]) / (chord || 1); }
        X.push(q.x); Z.push(q.z); TX.push(tx); TZ.push(tz); S.push(s);
        px = q.x; pz = q.z;
      }
    }
    ctrlS[n - 1] = s;
    // exact control points (the spline interpolates them; remove float drift)
    this._X = Float64Array.from(X); this._Z = Float64Array.from(Z);
    this._TX = Float64Array.from(TX); this._TZ = Float64Array.from(TZ); this._S = Float64Array.from(S);
    this._len = s;
    this._ctrlS = ctrlS;

    // ---- half widths
    const hw = o.halfWidth ?? 400;
    if (Array.isArray(hw)) {
      this._hw = P.map((_, i) => { const v = Number(hw[Math.min(i, hw.length - 1)]); return Number.isFinite(v) && v > 0 ? v : 400; });
      this._hwConst = 0;
      this._hwMax = Math.max(...this._hw);
    } else {
      this._hw = null;
      this._hwConst = Number(hw) > 0 ? Number(hw) : 400;
      this._hwMax = this._hwConst;
    }
    this._buildGrid();
  }

  get length() { return this._len; }
  get points() { return this._pts; }
  /** extra: s of each control point */
  get controlS() { return this._ctrlS; }
  /** extra: the largest half-width anywhere on the route */
  get maxHalfWidth() { return this._hwMax; }

  /** dense index k with S[k] ≤ s (the later one of a duplicated control point) */
  _idx(s) {
    const S = this._S, n = S.length;
    if (s <= 0) return 0;
    if (s >= this._len) return n - 2;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return Math.min(lo, n - 2);
  }
  pointAt(s, out = new THREE.Vector3()) {
    s = clamp(Number(s) || 0, 0, this._len);
    const k = this._idx(s), S = this._S, L = S[k + 1] - S[k];
    const t = L > 0 ? clamp((s - S[k]) / L, 0, 1) : 0;
    return out.set(this._X[k] + (this._X[k + 1] - this._X[k]) * t, 0, this._Z[k] + (this._Z[k + 1] - this._Z[k]) * t);
  }
  tangentAt(s, out = new THREE.Vector3()) {
    s = clamp(Number(s) || 0, 0, this._len);
    const k = this._idx(s), S = this._S, L = S[k + 1] - S[k];
    const t = L > 0 ? clamp((s - S[k]) / L, 0, 1) : 0;
    const x = this._TX[k] + (this._TX[k + 1] - this._TX[k]) * t, z = this._TZ[k] + (this._TZ[k + 1] - this._TZ[k]) * t;
    const l = Math.hypot(x, z);
    return l > 1e-12 ? out.set(x / l, 0, z / l) : out.set(this._TX[k], 0, this._TZ[k]);
  }
  yawAt(s) { const t = this.tangentAt(s, _t); return yawTo(t.x, t.z); }
  halfWidthAt(s) {
    if (!this._hw) return this._hwConst;
    s = clamp(Number(s) || 0, 0, this._len);
    const C = this._ctrlS, n = C.length;
    let i = 0;
    while (i < n - 2 && C[i + 1] <= s) i++;
    const L = C[i + 1] - C[i];
    let t = L > 0 ? clamp((s - C[i]) / L, 0, 1) : 0;
    t = t * t * (3 - 2 * t);
    return this._hw[i] + (this._hw[i + 1] - this._hw[i]) * t;
  }
  /** y = 0; l > 0 is to the right of the direction of travel */
  toWorld(s, l = 0, out = new THREE.Vector3()) {
    this.pointAt(s, out);
    const t = this.tangentAt(s, _t);
    out.x += -t.z * l; out.z += t.x * l;
    return out;
  }
  closest(x, z) {
    const o = { s: 0, l: 0, halfWidth: 0, dist: 0 };
    this.closestInto(x, z, o);
    o.halfWidth = this.halfWidthAt(o.s);
    return o;
  }
  /** extra: allocation-free closest; writes s, l, dist into `out` (halfWidth is not computed) */
  closestInto(x, z, out) {
    const g = this._grid;
    const i = Math.floor((x - g.x0) / GRID), j = Math.floor((z - g.z0) / GRID);
    let best = Infinity, bk = 0, bt = 0;
    const X = this._X, Z = this._Z, nSeg = X.length - 1;
    let a = 0, b = g.nChunks, list = null;
    if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) { const cell = j * g.nx + i; a = g.offA[cell]; b = g.offB[cell]; list = g.list; }
    for (let q = a; q < b; q++) {
      const c = list ? list[q] : q;
      const k0 = c * CHUNK, k1 = Math.min(nSeg, k0 + CHUNK);
      for (let k = k0; k < k1; k++) {
        const ax = X[k], az = Z[k], dx = X[k + 1] - ax, dz = Z[k + 1] - az;
        const L2 = dx * dx + dz * dz;
        if (L2 <= 1e-12) continue;
        let t = ((x - ax) * dx + (z - az) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - x, qz = az + dz * t - z, d2 = qx * qx + qz * qz;
        if (d2 < best) { best = d2; bk = k; bt = t; }
      }
    }
    const ax = X[bk], az = Z[bk], dx = X[bk + 1] - ax, dz = Z[bk + 1] - az;
    const L = Math.sqrt(dx * dx + dz * dz) || 1;
    const qx = ax + dx * bt, qz = az + dz * bt;
    out.s = this._S[bk] + (this._S[bk + 1] - this._S[bk]) * bt;
    // signed lateral offset against the interpolated tangent (smooth across dense vertices)
    const tx0 = this._TX[bk] + (this._TX[bk + 1] - this._TX[bk]) * bt, tz0 = this._TZ[bk] + (this._TZ[bk + 1] - this._TZ[bk]) * bt;
    const tl = Math.hypot(tx0, tz0);
    const tx = tl > 1e-9 ? tx0 / tl : dx / L, tz = tl > 1e-9 ? tz0 / tl : dz / L;
    out.l = (x - qx) * -tz + (z - qz) * tx;
    out.dist = Math.sqrt(best);
    // interior projections: |l| is exactly the distance; at a vertex, never more than the distance
    if (bt > 0 && bt < 1) out.l = out.l < 0 ? -out.dist : out.dist;
    else if (Math.abs(out.l) > out.dist) out.l = out.l < 0 ? -out.dist : out.dist;
    return out;
  }
  sample(step) {
    step = Math.max(0.5, Number(step) || 8);
    const out = [];
    for (let s = 0; s < this._len; s += step) { this.pointAt(s, _t); out.push({ s, x: _t.x, z: _t.z }); }
    this.pointAt(this._len, _t); out.push({ s: this._len, x: _t.x, z: _t.z });
    return out;
  }

  _buildGrid() {
    const X = this._X, Z = this._Z, nSeg = X.length - 1;
    const nChunks = Math.ceil(nSeg / CHUNK);
    const cx = new Float64Array(nChunks), cz = new Float64Array(nChunks), cr = new Float64Array(nChunks);
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let c = 0; c < nChunks; c++) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let k = c * CHUNK; k <= Math.min(nSeg, c * CHUNK + CHUNK); k++) {
        x0 = Math.min(x0, X[k]); x1 = Math.max(x1, X[k]); z0 = Math.min(z0, Z[k]); z1 = Math.max(z1, Z[k]);
      }
      cx[c] = (x0 + x1) / 2; cz[c] = (z0 + z1) / 2; cr[c] = Math.hypot(x1 - x0, z1 - z0) / 2;
      bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1); bz0 = Math.min(bz0, z0); bz1 = Math.max(bz1, z1);
    }
    // cover everything a level can query: the generated bounds (hw + 1500) plus the rendered margin
    const M = this._hwMax + 4200;
    const SUP = GRID * SUPER;
    const x0 = Math.floor((bx0 - M) / SUP) * SUP, z0 = Math.floor((bz0 - M) / SUP) * SUP;
    const sx = Math.ceil((bx1 + M - x0) / SUP), sz = Math.ceil((bz1 + M - z0) / SUP);
    const nx = sx * SUPER, nz = sz * SUPER;
    const offA = new Int32Array(nx * nz), offB = new Int32Array(nx * nz);
    const diag = GRID * Math.SQRT2, diagS = SUP * Math.SQRT2;
    const BAND = this._hwMax + 900;   // fine cells only where gameplay, scatter and terrain shaping query
    let list = new Int32Array(65536), cnt = 0;
    const push = (c) => { if (cnt >= list.length) { const nl = new Int32Array(list.length * 2); nl.set(list); list = nl; } list[cnt++] = c; };
    const sub = new Int32Array(nChunks);
    // two levels: a super cell keeps every chunk that can be nearest for any point inside it (margin = both diagonals,
    // so a cell-level test over that subset sees the true minimum); cells near the route then filter the subset
    for (let J = 0; J < sz; J++) for (let I = 0; I < sx; I++) {
      const PX = x0 + (I + 0.5) * SUP, PZ = z0 + (J + 0.5) * SUP;
      let minUpper = Infinity, minLower = Infinity;
      for (let c = 0; c < nChunks; c++) {
        const d = Math.hypot(PX - cx[c], PZ - cz[c]);
        if (d + cr[c] < minUpper) minUpper = d + cr[c];
        if (d - cr[c] < minLower) minLower = d - cr[c];
      }
      const limS = minUpper + diagS + diag;
      let ns = 0;
      const sa = cnt;
      for (let c = 0; c < nChunks; c++) if (Math.hypot(PX - cx[c], PZ - cz[c]) - cr[c] <= limS) { sub[ns++] = c; push(c); }
      const sb = cnt;
      const near = minLower - diagS / 2 <= BAND;
      for (let jj = 0; jj < SUPER; jj++) for (let ii = 0; ii < SUPER; ii++) {
        const k = (J * SUPER + jj) * nx + I * SUPER + ii;
        if (!near) { offA[k] = sa; offB[k] = sb; continue; }
        const px = x0 + (I * SUPER + ii + 0.5) * GRID, pz = z0 + (J * SUPER + jj + 0.5) * GRID;
        let mu = Infinity;
        for (let q = 0; q < ns; q++) { const c = sub[q]; const d = Math.hypot(px - cx[c], pz - cz[c]) + cr[c]; if (d < mu) mu = d; }
        const lim = mu + diag;
        offA[k] = cnt;
        for (let q = 0; q < ns; q++) { const c = sub[q]; if (Math.hypot(px - cx[c], pz - cz[c]) - cr[c] <= lim) push(c); }
        offB[k] = cnt;
      }
    }
    list = list.slice(0, cnt);
    this._grid = { x0, z0, nx, nz, offA, offB, list, nChunks };
  }
}

/** Barry–Goldman evaluation of a Catmull-Rom span p1→p2 with knot exponent alpha. Writes {x, z}. */
function crPoint(p0, p1, p2, p3, alpha, t, out) {
  const d01 = Math.max(1e-6, Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), alpha));
  const d12 = Math.max(1e-6, Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), alpha));
  const d23 = Math.max(1e-6, Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), alpha));
  const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
  const T = t1 + (t2 - t1) * t;
  if (t <= 0) { out.x = p1[0]; out.z = p1[1]; return out; }
  if (t >= 1) { out.x = p2[0]; out.z = p2[1]; return out; }
  const a1x = ((t1 - T) * p0[0] + (T - t0) * p1[0]) / (t1 - t0), a1z = ((t1 - T) * p0[1] + (T - t0) * p1[1]) / (t1 - t0);
  const a2x = ((t2 - T) * p1[0] + (T - t1) * p2[0]) / (t2 - t1), a2z = ((t2 - T) * p1[1] + (T - t1) * p2[1]) / (t2 - t1);
  const a3x = ((t3 - T) * p2[0] + (T - t2) * p3[0]) / (t3 - t2), a3z = ((t3 - T) * p2[1] + (T - t2) * p3[1]) / (t3 - t2);
  const b1x = ((t2 - T) * a1x + (T - t0) * a2x) / (t2 - t0), b1z = ((t2 - T) * a1z + (T - t0) * a2z) / (t2 - t0);
  const b2x = ((t3 - T) * a2x + (T - t1) * a3x) / (t3 - t1), b2z = ((t3 - T) * a2z + (T - t1) * a3z) / (t3 - t1);
  out.x = ((t2 - T) * b1x + (T - t1) * b2x) / (t2 - t1);
  out.z = ((t2 - T) * b1z + (T - t1) * b2z) / (t2 - t1);
  return out;
}
