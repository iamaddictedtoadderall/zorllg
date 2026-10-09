// world/route.js (P2) — P0 STUB: a working POLYLINE route (linear segments, arc length, brute-force closest).
// P2 replaces it with a centripetal Catmull-Rom spline and an O(1) closest-point grid.
import * as THREE from 'three';
import { yawTo, clamp } from '../core/util.js';

export class Route {
  constructor(points, o = {}) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('Route needs at least 2 points');
    this._pts = points.map(p => [Number(p[0]), Number(p[1])]);
    this.tension = o.tension ?? 0.5;
    const n = this._pts.length;
    this._cum = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const [x0, z0] = this._pts[i - 1], [x1, z1] = this._pts[i];
      this._cum[i] = this._cum[i - 1] + Math.hypot(x1 - x0, z1 - z0);
    }
    this._len = this._cum[n - 1];
    const hw = o.halfWidth ?? 400;
    this._hw = Array.isArray(hw) ? this._pts.map((_, i) => Number(hw[Math.min(i, hw.length - 1)]) || 400) : null;
    this._hwConst = Array.isArray(hw) ? 0 : Number(hw) || 400;
  }
  get length() { return this._len; }
  get points() { return this._pts; }
  /** segment index containing arc length s */
  _seg(s) {
    const c = this._cum, n = c.length;
    if (s <= 0) return 0;
    if (s >= this._len) return n - 2;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    return Math.min(lo, n - 2);
  }
  pointAt(s, out = new THREE.Vector3()) {
    s = clamp(s, 0, this._len);
    const i = this._seg(s), a = this._pts[i], b = this._pts[i + 1];
    const L = this._cum[i + 1] - this._cum[i];
    const t = L > 0 ? (s - this._cum[i]) / L : 0;
    return out.set(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
  }
  tangentAt(s, out = new THREE.Vector3()) {
    const i = this._seg(clamp(s, 0, this._len)), a = this._pts[i], b = this._pts[i + 1];
    out.set(b[0] - a[0], 0, b[1] - a[1]);
    const l = out.length();
    return l > 0 ? out.multiplyScalar(1 / l) : out.set(0, 0, -1);
  }
  yawAt(s) { const t = this.tangentAt(s, _t); return yawTo(t.x, t.z); }
  halfWidthAt(s) {
    if (!this._hw) return this._hwConst;
    s = clamp(s, 0, this._len);
    const i = this._seg(s), L = this._cum[i + 1] - this._cum[i];
    const t = L > 0 ? (s - this._cum[i]) / L : 0;
    return this._hw[i] + (this._hw[i + 1] - this._hw[i]) * t;
  }
  /** y = 0; l > 0 is to the right of the direction of travel */
  toWorld(s, l = 0, out = new THREE.Vector3()) {
    this.pointAt(s, out);
    const t = this.tangentAt(s, _t);
    // right of travel = (−t.z, t.x)
    out.x += -t.z * l; out.z += t.x * l;
    return out;
  }
  closest(x, z) {
    let best = Infinity, bs = 0, bl = 0;
    const p = this._pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = clamp(t, 0, 1);
      const qx = ax + dx * t, qz = az + dz * t;
      const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
      if (d2 < best) {
        best = d2;
        const L = Math.sqrt(L2) || 1;
        bs = this._cum[i] + t * L;
        bl = ((x - qx) * -dz + (z - qz) * dx) / L;   // signed: + right of travel
      }
    }
    return { s: bs, l: bl, halfWidth: this.halfWidthAt(bs), dist: Math.sqrt(best) };
  }
  sample(step) {
    step = Math.max(0.5, Number(step) || 8);
    const out = [];
    for (let s = 0; s < this._len; s += step) { this.pointAt(s, _t); out.push({ s, x: _t.x, z: _t.z }); }
    this.pointAt(this._len, _t); out.push({ s: this._len, x: _t.x, z: _t.z });
    return out;
  }
}
const _t = new THREE.Vector3();
