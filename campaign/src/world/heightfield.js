// world/heightfield.js (P2): the level heightfield (arch §5.3, §5.5, §5.6).
//
// A macro grid of `macroCell` metres (8 m; ×1.25 on Low) over the bounds is built in build():
//   1. base relief: domain-warped fBm mixed with ridged fBm, optional terraces;
//   2. macro features (mesa, ridge, basin, crater, spire_field);
//   3. the route bed profile (base height every 8 m, moving average, grade clamp both ways, minus carve.depth);
//   4. corridor shaping: walls rising from walls.start × halfWidth, the bed blended in across bedWidth + shoulder;
//   5. hydraulic droplet erosion (Lague style, seeded) inside the corridor + 600 m, accumulating a flow map, then
//      thermal talus relaxation at 35°;
//   6. re-carve at 50 % and stamps (flatten, raise, lower, crater);
//   7. bakes: slope, log-normalised flow, sky AO (8-direction horizon scan, 16–96 m), sun visibility (march toward sunDir
//      up to 600 m with a soft clearance angle), detail mask, route-bed mask, height percentiles;
//   8. detail: heightAt = Catmull-Rom bicubic(macro) + detail.amp · fbm3(x / detail.scale) · mask.
// Outside the bounds a coarse 32 m "outer" grid (base relief + features + full walls, no erosion) continues the land
// out to the farthest view distance, blended over the last 96 m of the bounds, so the terrain never ends in view.
//
// groundHeight(x, z) is the collision surface: 128 m tiles of 65×65 heightAt samples on the 2 m lattice anchored at
// gridOrigin, triangulated with the diagonal (i, j)–(i+1, j+1) exactly like the terrain's 2 m mesh nodes. Tiles are
// built synchronously on first request (≈ 1–2 ms) and kept in an LRU of 512. Everything here is deterministic.
//
// Build results are cached (one entry, keyed by every input) so reloading the same level skips the build.
import * as THREE from 'three';
import { clamp, smooth, lerp, mulberry32, hashString } from '../core/util.js';
import { createNoise2D, createValueNoise2D, fbm2, ridged2, warp2 } from '../core/noise.js';

const TILE = 64;                 // collision tile cells (2 m) per side → 128 m
const TILE_MAX = 512;
const OUTER_CELL = 64;           // coarse grid outside the bounds
const OUTER_MARGIN = 2816;       // how far the outer grid extends past the bounds (≥ High view distance)
const EDGE_BLEND = 96;           // bounds edge blend band (m)
const BAKE_DIV = 2;              // light bakes at 2 × macroCell
const MAX_ERODE = 0.6;           // m removed per droplet step at most
let CACHE = null;                // { key, data }

const _w = { x: 0, y: 0 };
const _n = new THREE.Vector3();
const _c = { s: 0, l: 0, dist: 0 };

/** Catmull-Rom weights */
function crw(t, out, o) {
  const t2 = t * t, t3 = t2 * t;
  out[o] = 0.5 * (-t3 + 2 * t2 - t);
  out[o + 1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  out[o + 2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  out[o + 3] = 0.5 * (t3 - t2);
}
const _wx = new Float64Array(4), _wz = new Float64Array(4);
const yieldNow = () => new Promise(r => setTimeout(r, 0));

/** droplet erosion for a batch of start positions (a plain function, so the hot loop optimises well) */
function erodeBatch(Hn, flowAcc, BO, BW, starts, n, P) {
  const { nx, lo, hiX, hiZ, inertia, capF, minCap, erodeS, depositS, evap, grav, maxSteps, maxEr, NB } = P;
  for (let q0 = 0; q0 < n; q0++) {
    let px = starts[q0 * 2], pz = starts[q0 * 2 + 1];
    let dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let step = 0; step < maxSteps; step++) {
      const ix = px | 0, iz = pz | 0, fx = px - ix, fz = pz - iz, k = iz * nx + ix;
      const h00 = Hn[k], h10 = Hn[k + 1], h01 = Hn[k + nx], h11 = Hn[k + nx + 1];
      const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz, gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
      const h = h00 * w00 + h10 * w10 + h01 * w01 + h11 * w11;
      dx = dx * inertia - gx * (1 - inertia); dz = dz * inertia - gz * (1 - inertia);
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 1e-9) break;
      dx /= len; dz /= len;
      const fw = water * (0.5 + 0.5 * (speed < 4 ? speed : 4));
      flowAcc[k] += fw * w00; flowAcc[k + 1] += fw * w10; flowAcc[k + nx] += fw * w01; flowAcc[k + nx + 1] += fw * w11;
      px += dx; pz += dz;
      if (px < lo || pz < lo || px >= hiX || pz >= hiZ) break;
      const jx = px | 0, jz = pz | 0, qx = px - jx, qz = pz - jz, q = jz * nx + jx;
      const nh = Hn[q] * (1 - qx) * (1 - qz) + Hn[q + 1] * qx * (1 - qz) + Hn[q + nx] * (1 - qx) * qz + Hn[q + nx + 1] * qx * qz;
      const dh = nh - h;
      const cap = Math.max(-dh * speed * water * capF, minCap);
      if (sed > cap || dh > 0) {
        const dep = dh > 0 ? (dh < sed ? dh : sed) : (sed - cap) * depositS;
        sed -= dep;
        Hn[k] += dep * w00; Hn[k + 1] += dep * w10; Hn[k + nx] += dep * w01; Hn[k + nx + 1] += dep * w11;
      } else {
        let er = (cap - sed) * erodeS;
        if (er > -dh) er = -dh;
        if (er > maxEr) er = maxEr;
        for (let b = 0; b < NB; b++) Hn[k + BO[b]] -= er * BW[b];
        sed += er;
      }
      const sp2 = speed * speed - dh * grav;
      speed = sp2 > 0 ? Math.sqrt(sp2) : 0;
      water *= 1 - evap;
    }
  }
}

export class Heightfield {
  constructor(def, route, stamps = [], o = {}) {
    this.def = def || {};
    this.route = route;
    this.stamps = (stamps || []).map(s => ({ ...s }));
    this.seed = (o.seed >>> 0) || 1;
    this.tier = o.tier || { name: 'high', erosionScale: 1 };
    this.sunDir = (o.sunDir ? new THREE.Vector3().copy(o.sunDir) : new THREE.Vector3(0.4, 0.6, -0.5)).normalize();
    const D = this.def;
    const base = D.base || {};
    this.P = {
      base: { scale: base.scale ?? 900, amp: base.amp ?? 120, octaves: base.octaves ?? 6, ridged: base.ridged ?? 0,
              warp: base.warp ?? 0, terrace: base.terrace || null },
      detail: { scale: D.detail?.scale ?? 22, amp: D.detail?.amp ?? 1.6 },
      walls: { height: D.walls?.height ?? 260, start: D.walls?.start ?? 0.85, noise: D.walls?.noise ?? 0.3 },
      carve: { depth: D.carve?.depth ?? 4, bedWidth: D.carve?.bedWidth ?? 60, shoulder: D.carve?.shoulder ?? 80,
               smooth: D.carve?.smooth ?? 160, maxGrade: D.carve?.maxGrade ?? 0.08, strength: D.carve?.strength ?? 1 },
      erosion: { droplets: D.erosion?.droplets ?? 120000, thermal: D.erosion?.thermal ?? 2 },
    };
    const lowScale = this.tier.name === 'low' ? 1.25 : 1;
    this.cell = (D.macroCell ?? 8) * lowScale;
    // bounds (snapped to whole metres on the 2 m collision lattice)
    let x0, z0, x1, z1;
    if (Array.isArray(D.bounds) && D.bounds.length === 4) [x0, z0, x1, z1] = D.bounds.map(Number);
    else {
      x0 = Infinity; z0 = Infinity; x1 = -Infinity; z1 = -Infinity;
      for (const [x, z] of route.points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      const g = (route.maxHalfWidth ?? 400) + 1500;
      x0 -= g; z0 -= g; x1 += g; z1 += g;
    }
    x0 = Math.floor(x0 / 2) * 2; z0 = Math.floor(z0 / 2) * 2;
    this.nx = Math.max(4, Math.ceil((x1 - x0) / this.cell) + 1);
    this.nz = Math.max(4, Math.ceil((z1 - z0) / this.cell) + 1);
    this.bounds = { x0, z0, x1: x0 + (this.nx - 1) * this.cell, z1: z0 + (this.nz - 1) * this.cell };
    /** extra: origin of the 2 m collision lattice and of the terrain node grid */
    this.gridOrigin = { x: x0, z: z0 };
    // noise
    const sd = this.seed;
    this.nBase = createNoise2D(sd ^ 0x1a2b3c);
    this.nRidge = createNoise2D(sd ^ 0x5e6f70);
    this.nWarp = createNoise2D(sd ^ 0x0badf0);
    this.nWall = createValueNoise2D(sd ^ 0x77aa11);
    this.nDetail = createNoise2D(sd ^ 0x3c3c3c);
    this.nFeat = createNoise2D(sd ^ 0x2468ac);
    this.features = (D.features || []).map(f => this._feature(f)).filter(Boolean);
    this.built = false;
    this._tiles = new Map();
    this._lastTileKey = null; this._lastTile = null;
    this.stats = { buildMs: 0, cached: false, droplets: 0, cells: this.nx * this.nz };
  }

  // ------------------------------------------------------------------ analytic layers
  _resolveXZ(p, out) {
    if (Array.isArray(p)) { out.x = +p[0] || 0; out.z = +p[1] || 0; return out; }
    if (p && typeof p === 'object') {
      if ('s' in p) { const v = this.route.toWorld(+p.s || 0, +p.l || 0, new THREE.Vector3()); out.x = v.x; out.z = v.z; return out; }
      out.x = +p.x || 0; out.z = +p.z || 0; return out;
    }
    out.x = 0; out.z = 0; return out;
  }
  _feature(f) {
    if (!f || !f.kind) return null;
    const a = this._resolveXZ(f.at, { x: 0, z: 0 });
    const b = f.to ? this._resolveXZ(f.to, { x: 0, z: 0 }) : null;
    const r = Math.max(1, Number(f.r) || 100), h = Number(f.h) || 0, sharp = Math.max(0.2, Number(f.sharpness) || 1);
    const pad = f.kind === 'crater' ? r * 1.8 : r * 1.1;
    let bx0 = a.x - pad, bx1 = a.x + pad, bz0 = a.z - pad, bz1 = a.z + pad;
    if (b) { bx0 = Math.min(bx0, b.x - pad); bx1 = Math.max(bx1, b.x + pad); bz0 = Math.min(bz0, b.z - pad); bz1 = Math.max(bz1, b.z + pad); }
    return { kind: f.kind, ax: a.x, az: a.z, bx: b ? b.x : a.x, bz: b ? b.z : a.z, r, h, sharp, bx0, bx1, bz0, bz1,
             seed: hashString(JSON.stringify([f.kind, a.x, a.z, r])) };
  }
  _featureAt(x, z) {
    let H = 0;
    for (const f of this.features) {
      if (x < f.bx0 || x > f.bx1 || z < f.bz0 || z > f.bz1) continue;
      const dxa = x - f.ax, dza = z - f.az;
      switch (f.kind) {
        case 'mesa': {
          const d = Math.hypot(dxa, dza) * (1 + 0.12 * this.nFeat(x / (f.r * 0.45), z / (f.r * 0.45)));
          const w = Math.min(0.45, 0.22 / f.sharp);
          H += f.h * (1 - smooth(f.r * (1 - w), f.r, d)) * (0.92 + 0.08 * this.nFeat(x / 60, z / 60));
          break;
        }
        case 'ridge': {
          const vx = f.bx - f.ax, vz = f.bz - f.az, L2 = vx * vx + vz * vz;
          let t = L2 > 0 ? (dxa * vx + dza * vz) / L2 : 0; t = clamp(t, 0, 1);
          const d = Math.hypot(x - (f.ax + vx * t), z - (f.az + vz * t));
          const wob = 1 + 0.25 * this.nFeat(x / (f.r * 0.7) + 11, z / (f.r * 0.7));
          const q = clamp(d / (f.r * wob), 0, 1);
          const along = 0.75 + 0.25 * this.nFeat(t * 9.3 + f.seed % 97, 3.1) + 0.12 * ridged2(this.nFeat, x / 140, z / 140, 3);
          const ends = smooth(0, 0.08, t) * smooth(1, 0.92, t);
          H += f.h * Math.pow(1 - q, 1 + f.sharp) * along * (0.35 + 0.65 * ends);
          break;
        }
        case 'basin': {
          const d = Math.hypot(dxa, dza);
          H -= f.h * (1 - smooth(0, f.r, d)) * (1 - smooth(0, f.r, d));
          break;
        }
        case 'crater': {
          const q = Math.hypot(dxa, dza) / f.r;
          if (q < 1) H += -f.h * (1 - q * q) + f.h * 0.35 * Math.pow(q, 6);
          else H += f.h * 0.35 * Math.exp(-((q - 1) / 0.32) * ((q - 1) / 0.32));
          break;
        }
        case 'spire_field': {
          const d = Math.hypot(dxa, dza);
          if (d > f.r) break;
          const cs = Math.max(14, f.r / 7), fade = smooth(f.r, f.r * 0.75, d);
          const ci = Math.floor(x / cs), cj = Math.floor(z / cs);
          let best = 0;
          for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
            const hs = hashString(`${f.seed}:${i}:${j}`), r1 = (hs & 0xffff) / 65535, r2 = (hs >>> 16) / 65535;
            if (r1 > 0.7) continue;
            const sx = (i + 0.2 + 0.6 * r1) * cs, sz = (j + 0.2 + 0.6 * r2) * cs;
            const rs = cs * (0.18 + 0.2 * r2), dd = Math.hypot(x - sx, z - sz);
            if (dd < rs) best = Math.max(best, f.h * (0.4 + 0.6 * r1 / 0.7) * Math.pow(1 - dd / rs, 1.4));
          }
          H += best * fade;
          break;
        }
        default: break;
      }
    }
    return H;
  }
  /** base relief + features (no corridor) */
  _relief(x, z) {
    const B = this.P.base;
    let px = x, pz = z;
    if (B.warp > 0) { warp2(this.nWarp, x, z, B.warp, B.scale * 0.6, _w); px = _w.x; pz = _w.y; }
    const u = px / B.scale, v = pz / B.scale;
    let h = fbm2(this.nBase, u, v, B.octaves) * 1.25;
    if (B.ridged > 0) h = lerp(h, (ridged2(this.nRidge, u * 0.85, v * 0.85, B.octaves) - 0.38) * 2.1, B.ridged);
    h *= B.amp;
    if (B.terrace && B.terrace.step > 0) {
      const st = B.terrace.step, k = h / st, f = k - Math.floor(k);
      const tq = (Math.floor(k) + smooth(0.35, 0.65, f)) * st;
      h = lerp(h, tq, clamp(B.terrace.strength ?? 0.5, 0, 1));
    }
    if (this.features.length) h += this._featureAt(x, z);
    return h;
  }
  /** wall noise factor */
  _wallF(x, z) {
    const W = this.P.walls;
    const n = 0.65 * this.nWall(x / 420, z / 420) + 0.35 * this.nWall(x / 130 + 7.7, z / 130 - 3.1);
    return (1 - W.noise * 0.5) + W.noise * n;
  }
  /** far-field height (outside the bounds: walls saturated) */
  _far(x, z) { return this._relief(x, z) + this.P.walls.height * this._wallF(x, z); }

  // ------------------------------------------------------------------ build
  _cacheKey() {
    const r = this.route;
    return JSON.stringify({ v: 4, d: this.def, p: r.points, hw: [r.halfWidthAt(0), r.maxHalfWidth, r.length,
      ...Array.from(r.controlS || []).map((s) => r.halfWidthAt(s))], st: this.stamps, seed: this.seed, cell: this.cell,
      er: this.tier.erosionScale ?? 1, sun: [this.sunDir.x, this.sunDir.y, this.sunDir.z].map(v => Math.round(v * 1000)) });
  }
  async build(onProgress) {
    const t0 = performance.now();
    const key = this._cacheKey();
    if (CACHE && CACHE.key === key) {
      Object.assign(this, CACHE.data);
      this.built = true;
      this.stats.cached = true;
      this.stats.buildMs = performance.now() - t0;
      onProgress?.(1, 'Terrain');
      return;
    }
    let tLast = performance.now(), tStage = tLast;
    const stages = this.stats.stages = {};
    const stage = (k) => { const n = performance.now(); stages[k] = Math.round(n - tStage); tStage = n; };
    const tick = async (p, label) => {
      if (performance.now() - tLast > 45) { onProgress?.(p, label); await yieldNow(); tLast = performance.now(); }
    };
    const { nx, nz, cell } = this, x0 = this.bounds.x0, z0 = this.bounds.z0, N = nx * nz;
    const route = this.route, P = this.P;
    const H = new Float32Array(N);
    // route distance on a coarse 64 m lattice (cheap; the corridor stage refines it near the route)
    const route0 = this.route, CC = 64;
    const cnx = Math.ceil((nx - 1) * cell / CC) + 2, cnz = Math.ceil((nz - 1) * cell / CC) + 2;
    const cd = new Float32Array(cnx * cnz);
    for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) cd[j * cnx + i] = route0.closestInto(x0 + i * CC, z0 + j * CC, _c).dist;
    const cdAt = (x, z) => {          // bilinear coarse distance (continuous)
      const fx = (x - x0) / CC, fz = (z - z0) / CC, i = Math.min(cnx - 2, Math.floor(fx)), j = Math.min(cnz - 2, Math.floor(fz));
      const tx = fx - i, tz = fz - j, k = j * cnx + i;
      return (cd[k] * (1 - tx) + cd[k + 1] * tx) * (1 - tz) + (cd[k + cnx] * (1 - tx) + cd[k + cnx + 1] * tx) * tz;
    };
    this._cdAt = cdAt;
    // 1–2. base relief + features: exact on the 8 m lattice within hw + 600 m of the route (where it is seen up close),
    // a 16 m bicubic lattice beyond, blended over 150 m
    const hwM = route0.maxHalfWidth ?? 400, EXACT = hwM * 1.2 + 330, BLEND = 150;
    const C2 = cell * 2, rnx = Math.ceil((nx - 1) / 2) + 4, rnz = Math.ceil((nz - 1) / 2) + 4;
    const R2 = new Float32Array(rnx * rnz);
    for (let j = 0; j < rnz; j++) {
      for (let i = 0; i < rnx; i++) R2[j * rnx + i] = this._relief(x0 + (i - 1) * C2, z0 + (j - 1) * C2);
      if ((j & 15) === 0) await tick(0.04 * j / rnz, 'Relief');
    }
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * cell;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell, d = cdAt(x, z);
        if (d <= EXACT) { H[j * nx + i] = this._relief(x, z); continue; }
        // bicubic from the 16 m lattice
        const fx = i / 2 + 1, fz = j / 2 + 1, ix = Math.floor(fx), iz = Math.floor(fz);
        crw(fx - ix, _wx, 0); crw(fz - iz, _wz, 0);
        let h = 0;
        for (let b = 0; b < 4; b++) {
          const row = Math.min(rnz - 1, Math.max(0, iz - 1 + b)) * rnx;
          let r = 0;
          for (let a = 0; a < 4; a++) r += R2[row + Math.min(rnx - 1, Math.max(0, ix - 1 + a))] * _wx[a];
          h += r * _wz[b];
        }
        if (d < EXACT + BLEND) h = lerp(this._relief(x, z), h, smooth(EXACT, EXACT + BLEND, d));
        H[j * nx + i] = h;
      }
      if ((j & 7) === 0) await tick(0.04 + 0.08 * j / nz, 'Relief');
    }
    stage('relief');
    // 3. route bed profile
    const ds = 8, nb = Math.max(2, Math.ceil(route.length / ds) + 1);
    let bed = new Float64Array(nb);
    const v = new THREE.Vector3();
    for (let i = 0; i < nb; i++) { route.pointAt(Math.min(route.length, i * ds), v); bed[i] = this._sampleGrid(H, v.x, v.z); }
    {
      const w = Math.max(1, Math.round(P.carve.smooth / ds / 2)), pre = new Float64Array(nb + 1), sm = new Float64Array(nb);
      for (let i = 0; i < nb; i++) pre[i + 1] = pre[i] + bed[i];
      for (let i = 0; i < nb; i++) { const a = Math.max(0, i - w), b = Math.min(nb - 1, i + w); sm[i] = (pre[b + 1] - pre[a]) / (b - a + 1); }
      for (let i = 0; i < nb; i++) sm[i] -= P.carve.depth;
      // flatten stamps on the route become level anchors of the bed profile, so the bed meets them at ≤ maxGrade
      const anchor = new Uint8Array(nb);
      const bedR = P.carve.bedWidth / 2 + P.carve.shoulder / 2;
      for (const st of this.stamps) {
        if (st.mode !== 'flatten') continue;
        route.closestInto(st.x, st.z, _c);
        if (_c.dist > bedR) continue;
        const sc = _c.s, r = Math.max(0.5, st.r || 10), fo = Math.max(1, st.falloff ?? 30);
        const chord = Math.sqrt(Math.max(0, r * r - _c.dist * _c.dist));
        const fi = sc / ds, i0 = Math.floor(fi);
        const target = Number.isFinite(st.h) ? st.h : (i0 >= nb - 1 ? sm[nb - 1] : sm[i0] + (sm[i0 + 1] - sm[i0]) * (fi - i0));
        st.h = target; st.onRoute = true;
        for (let i = 0; i < nb; i++) {
          const e = Math.abs(i * ds - sc);
          if (e > chord + fo) continue;
          const w = e <= chord ? 1 : smooth(chord + fo, chord, e);
          sm[i] = lerp(sm[i], target, w);
          if (w > 0.999) anchor[i] = 1;
        }
      }
      const g = P.carve.maxGrade * ds;
      for (let i = 1; i < nb; i++) if (!anchor[i]) sm[i] = clamp(sm[i], sm[i - 1] - g, sm[i - 1] + g);
      for (let i = nb - 2; i >= 0; i--) if (!anchor[i]) sm[i] = clamp(sm[i], sm[i + 1] - g, sm[i + 1] + g);
      bed = sm;
      // a heavily smoothed copy (≈ 700 m window) is the wall reference: it changes slowly across bends
      const w2 = Math.max(1, Math.round(350 / ds)), pre2 = new Float64Array(nb + 1), ref = new Float64Array(nb);
      for (let i = 0; i < nb; i++) pre2[i + 1] = pre2[i] + bed[i];
      for (let i = 0; i < nb; i++) { const a = Math.max(0, i - w2), b = Math.min(nb - 1, i + w2); ref[i] = (pre2[b + 1] - pre2[a]) / (b - a + 1); }
      this._bedRef = ref;
    }
    this._bed = bed; this._bedDs = ds;
    // 4. corridor shaping. Route coordinates per cell: exact on a 16 m lattice near the route and interpolated between
    // (exact again where the lattice straddles a jump in s or the route ends); far away a conservative coarse bound
    const RS = new Float32Array(N), RL = new Float32Array(N), RD = new Float32Array(N);
    const hwMax = route.maxHalfWidth ?? 400, FAR = Math.max(hwMax * 2.3, hwMax + 700);
    const bedHalf = P.carve.bedWidth / 2, sh = Math.max(1, P.carve.shoulder), W = P.walls;
    const lbAt = (i, j) => {
      const ci = Math.floor(i * cell / CC), cj = Math.floor(j * cell / CC);
      return Math.min(cd[cj * cnx + ci], cd[cj * cnx + ci + 1], cd[(cj + 1) * cnx + ci], cd[(cj + 1) * cnx + ci + 1]) - CC * 1.5;
    };
    const lnx2 = Math.ceil((nx - 1) / 2) + 1, lnz2 = Math.ceil((nz - 1) / 2) + 1;
    const LS = new Float32Array(lnx2 * lnz2).fill(NaN), LL = new Float32Array(lnx2 * lnz2), LD = new Float32Array(lnx2 * lnz2);
    for (let b = 0; b < lnz2; b++) for (let a = 0; a < lnx2; a++) {
      const i = Math.min(nx - 1, a * 2), j = Math.min(nz - 1, b * 2);
      if (lbAt(i, j) > FAR + 2 * CC) continue;
      route.closestInto(x0 + a * 2 * cell, z0 + b * 2 * cell, _c);
      LS[b * lnx2 + a] = _c.s; LL[b * lnx2 + a] = _c.l; LD[b * lnx2 + a] = _c.dist;
    }
    await tick(0.13, 'Corridor');
    const rlen = route.length, jump = cell * 6;
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * cell;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = x0 + i * cell;
        const lb = lbAt(i, j);
        if (lb > FAR) { RS[k] = -1; RL[k] = 0; RD[k] = lb; H[k] += W.height * this._wallF(x, z); continue; }
        // route coordinates from the lattice
        const a0 = i >> 1, b0 = j >> 1, ta = (i & 1) * 0.5, tb = (j & 1) * 0.5;
        const a1 = Math.min(lnx2 - 1, a0 + (i & 1)), b1 = Math.min(lnz2 - 1, b0 + (j & 1));
        const q00 = b0 * lnx2 + a0, q10 = b0 * lnx2 + a1, q01 = b1 * lnx2 + a0, q11 = b1 * lnx2 + a1;
        const s00 = LS[q00], s10 = LS[q10], s01 = LS[q01], s11 = LS[q11];
        const smin = Math.min(s00, s10, s01, s11), smax = Math.max(s00, s10, s01, s11);
        if (smin === smin && smax - smin < jump && smin > 1 && smax < rlen - 1) {
          const w00 = (1 - ta) * (1 - tb), w10 = ta * (1 - tb), w01 = (1 - ta) * tb, w11 = ta * tb;
          _c.s = s00 * w00 + s10 * w10 + s01 * w01 + s11 * w11;
          _c.l = LL[q00] * w00 + LL[q10] * w10 + LL[q01] * w01 + LL[q11] * w11;
          _c.dist = Math.abs(_c.l);
        } else route.closestInto(x, z, _c);
        RS[k] = _c.s; RL[k] = _c.l; RD[k] = _c.dist;
        const hw = route.halfWidthAt(_c.s);
        // the rim line wanders (±7 %) so the canyon isn't a perfect offset of the route
        const d = _c.dist / hw * (1 + 0.14 * (this.nWall(x / 340 + 31.7, z / 340 - 12.9) - 0.5));
        // walls rise from walls.start; where the land outside sits low (a valley crossing the corridor edge) the wall
        // also lifts it toward a smoothed bed reference, so the rim always stands well above the route. The lift fades
        // out between 1.5 and 2.2 half-widths (no seams in the far field).
        // spurs (ridged noise pushes buttresses into the corridor) and benches (a partly stepped ramp) break the face
        const dsp = d - 0.11 * (ridged2(this.nRidge, x / 230 + 5.3, z / 230 - 2.1, 3) - 0.45);
        let ramp = smooth(W.start, 1.2, dsp);
        if (ramp > 0 && ramp < 1) { const q = ramp * 5, f = q - Math.floor(q); ramp = lerp(ramp, (Math.floor(q) + smooth(0.3, 0.7, f)) / 5, 0.45); }
        let h = H[k];
        if (ramp > 0) {
          const lift = Math.max(0, this._bedRefAt(_c.s) + 0.12 * W.height - h) * (1 - smooth(1.5, 2.2, d));
          h += ramp * (W.height * this._wallF(x, z) + lift);
        }
        const bw = P.carve.strength * (1 - smooth(bedHalf, bedHalf + sh, _c.dist));
        if (bw > 0) h = lerp(h, this._bedAt(_c.s), bw);
        H[k] = h;
      }
      if ((j & 7) === 0) await tick(0.12 + 0.12 * j / nz, 'Corridor');
    }
    stage('corridor');
    // erosion region mask (corridor + 600 m)
    const region = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (RS[k] >= 0 && RD[k] <= route.halfWidthAt(RS[k]) + 600) region[k] = 1;
    // 5. erosion
    const flowAcc = new Float32Array(N);
    await this._erode(H, region, flowAcc, (p) => tick(0.24 + 0.4 * p, 'Erosion'));
    stage('erosion');
    for (let p = 0; p < P.erosion.thermal; p++) { this._thermal(H, region); await tick(0.64 + 0.03 * p, 'Erosion'); }
    stage('thermal');
    // 6. re-carve at 50 % and stamps
    const bedMask = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      if (RS[k] < 0) continue;
      const bw = 1 - smooth(bedHalf, bedHalf + sh, RD[k]), inner = 1 - smooth(bedHalf * 0.45, bedHalf * 0.9, RD[k]);
      if (bw > 0) H[k] = lerp(H[k], this._bedAt(RS[k]), P.carve.strength * (0.5 * bw + 0.5 * inner));
      bedMask[k] = Math.round(255 * (1 - smooth(bedHalf * 0.7, bedHalf + sh * 0.35, RD[k])));
    }
    const stampMask = new Float32Array(N);
    this._bedMaskTmp = bedMask;
    this._applyStamps(H, stampMask);
    this._bedMaskTmp = null;
    await tick(0.7, 'Stamps');
    // 7. bakes
    const flow = new Float32Array(N);
    {
      let mx = 0; const hist = [];
      for (let k = 0; k < N; k += 5) if (flowAcc[k] > 0) hist.push(flowAcc[k]);
      hist.sort((a, b) => a - b);
      mx = hist.length ? hist[Math.floor(hist.length * 0.98)] : 1;
      const lm = Math.log(1 + Math.max(1e-6, mx));
      for (let k = 0; k < N; k++) flow[k] = clamp(Math.log(1 + flowAcc[k]) / lm, 0, 1);
      // a light blur so channels read as soft bands
      const tmp = new Float32Array(N);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        let s = 0, n = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const w = a === 0 && b === 0 ? 4 : (a === 0 || b === 0 ? 2 : 1); s += flow[jj * nx + ii] * w; n += w;
        }
        tmp[j * nx + i] = s / n;
      }
      flow.set(tmp);
    }
    // curvature (convex ridges +, hollows −) from a 2-cell Laplacian, squashed to ±1
    const curv = new Float32Array(N);
    for (let j = 2; j < nz - 2; j++) for (let i = 2; i < nx - 2; i++) {
      const k = j * nx + i;
      const lap = (H[k - 2] + H[k + 2] + H[k - 2 * nx] + H[k + 2 * nx] - 4 * H[k]) / (4 * cell * cell);
      curv[k] = Math.tanh(-lap * 22);
    }
    const slope = new Float32Array(N), mask = new Float32Array(N);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const hx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / ((Math.min(nx - 1, i + 1) - Math.max(0, i - 1)) * cell);
      const hz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / ((Math.min(nz - 1, j + 1) - Math.max(0, j - 1)) * cell);
      const ny = 1 / Math.sqrt(hx * hx + hz * hz + 1);
      slope[k] = 1 - ny;
      const bw = bedMask[k] / 255;
      mask[k] = (1 - bw * 0.85) * (1 - stampMask[k]) * (0.75 + 0.75 * smooth(0.04, 0.35, slope[k]));
    }
    await tick(0.74, 'Bakes');
    // height percentiles over the corridor
    {
      const hs = [];
      for (let k = 0; k < N; k += 7) if (RS[k] >= 0 && RD[k] <= route.halfWidthAt(RS[k]) * 1.1) hs.push(H[k]);
      hs.sort((a, b) => a - b);
      this.h20 = hs.length ? hs[Math.floor(hs.length * 0.2)] : 0;
      this.h80 = hs.length ? hs[Math.floor(hs.length * 0.8)] : 1;
      this.hMin = hs.length ? hs[0] : 0; this.hMax = hs.length ? hs[hs.length - 1] : 1;
      if (this.h80 - this.h20 < 1) this.h80 = this.h20 + 1;
    }
    this.H = H; this.flow = flow; this.slope = slope; this.mask = mask; this.bedMask = bedMask; this.curv = curv;
    stage('bakes');
    // light bakes at BAKE_DIV × cell
    await this._bakeLight(tick);
    stage('light');
    // outer grid
    await this._buildOuter(tick);
    stage('outer');
    this.built = true;
    this.stats.buildMs = performance.now() - t0;
    CACHE = { key, data: { H, flow, slope, mask, bedMask, curv, h20: this.h20, h80: this.h80, hMin: this.hMin, hMax: this.hMax,
                           sun: this.sun, sky: this.sky, lnx: this.lnx, lnz: this.lnz, outer: this.outer, _bed: this._bed,
                           _bedDs: this._bedDs, _bedRef: this._bedRef, stamps: this.stamps.map(t => ({ ...t })), stats: { ...this.stats } } };
    onProgress?.(1, 'Terrain');
  }
  _bedRefAt(s) {
    const f = s / this._bedDs, i = Math.floor(f), b = this._bedRef;
    if (i <= 0) return b[0];
    if (i >= b.length - 1) return b[b.length - 1];
    return b[i] + (b[i + 1] - b[i]) * (f - i);
  }
  _bedAt(s) {
    const f = s / this._bedDs, i = Math.floor(f), b = this._bed;
    if (i <= 0) return b[0];
    if (i >= b.length - 1) return b[b.length - 1];
    return b[i] + (b[i + 1] - b[i]) * (f - i);
  }
  /** bilinear sample of a node array */
  _sampleGrid(A, x, z) {
    const fx = clamp((x - this.bounds.x0) / this.cell, 0, this.nx - 1.0001), fz = clamp((z - this.bounds.z0) / this.cell, 0, this.nz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, nx = this.nx, k = j * nx + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + nx] * (1 - tx) + A[k + nx + 1] * tx) * tz;
  }
  async _erode(H, region, flowAcc, prog) {
    const { nx, nz, cell } = this, route = this.route;
    const count = Math.round(this.P.erosion.droplets * (this.tier.erosionScale ?? 1));
    this.stats.droplets = count;
    if (count <= 0) return;
    const rng = mulberry32(this.seed ^ 0xe7051 ^ hashString('erosion'));
    // heights are eroded in normalised units (HS metres per unit): Lague's constants expect gentle unit slopes
    const HS = cell * 10, iHS = 1 / HS;
    const inertia = 0.05, capF = 4, minCap = 0.01, erodeS = 0.3, depositS = 0.3, evap = 0.01, grav = 4, maxSteps = 48;
    const maxEr = MAX_ERODE * iHS;
    const N = nx * nz, Hn = new Float32Array(N);
    for (let k = 0; k < N; k++) Hn[k] = H[k] * iHS;
    // brush: radius 2 cells, as flat index offsets (droplets stay ≥ 3 cells from the edge, so no bounds checks)
    const BR = 2, offs = [], bw = [];
    let wsum = 0;
    for (let b = -BR; b <= BR; b++) for (let a = -BR; a <= BR; a++) {
      const d = Math.hypot(a, b); if (d >= BR + 0.5) continue;
      const w = Math.max(0, 1 - d / (BR + 0.5)); offs.push(b * nx + a); bw.push(w); wsum += w;
    }
    const BW = Float32Array.from(bw.map(w => w / wsum)), BO = Int32Array.from(offs), NB = BW.length;
    const v = new THREE.Vector3(), x0 = this.bounds.x0, z0 = this.bounds.z0;
    const P = { nx, nz, lo: 3, hiX: nx - 4, hiZ: nz - 4, inertia, capF, minCap, erodeS, depositS, evap, grav, maxSteps, maxEr, NB };
    const starts = new Float64Array(2048);
    for (let d0 = 0; d0 < count; d0 += 1024) {
      const m = Math.min(1024, count - d0);
      let n = 0;
      for (let d = 0; d < m; d++) {
        const s = rng() * route.length, hw = route.halfWidthAt(s);
        const l = (rng() * 2 - 1) * (hw + 600);
        route.toWorld(s, l, v);
        const px = (v.x - x0) / cell, pz = (v.z - z0) / cell;
        if (px < P.lo || pz < P.lo || px >= P.hiX || pz >= P.hiZ) continue;
        if (!region[Math.floor(pz) * nx + Math.floor(px)]) continue;
        starts[n * 2] = px; starts[n * 2 + 1] = pz; n++;
      }
      erodeBatch(Hn, flowAcc, BO, BW, starts, n, P);
      await prog(d0 / count);
    }
    for (let k = 0; k < N; k++) H[k] = Hn[k] * HS;
  }
  _thermal(H, region) {
    const { nx, nz, cell } = this;
    const talus = Math.tan(35 * Math.PI / 180) * cell, talusD = talus * Math.SQRT2;
    const delta = new Float32Array(nx * nz);
    const NB = [[1, 0, talus], [0, 1, talus], [1, 1, talusD], [-1, 1, talusD]];
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (!region[k]) continue;
      for (const [a, b, t] of NB) {
        const q = (j + b) * nx + i + a, d = H[k] - H[q];
        if (d > t) { const m = (d - t) * 0.25; delta[k] -= m; delta[q] += m; }
        else if (-d > t) { const m = (-d - t) * 0.25; delta[k] += m; delta[q] -= m; }
      }
    }
    for (let k = 0; k < delta.length; k++) H[k] += delta[k];
  }
  _applyStamps(H, smask) {
    const { nx, nz, cell } = this, x0 = this.bounds.x0, z0 = this.bounds.z0;
    for (const st of this.stamps) {
      const r = Math.max(0.5, st.r || 10), fo = Math.max(0, st.falloff ?? 30), R = r + fo;
      const i0 = Math.max(0, Math.floor((st.x - R - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((st.x + R - x0) / cell));
      const j0 = Math.max(0, Math.floor((st.z - R - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((st.z + R - z0) / cell));
      if (i0 > i1 || j0 > j1) continue;
      let target = st.h;
      if (st.mode === 'flatten' && !Number.isFinite(target)) {
        let s = 0, n = 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (Math.hypot(x0 + i * cell - st.x, z0 + j * cell - st.z) <= r) { s += H[j * nx + i]; n++; }
        }
        target = n ? s / n : this._sampleGrid(H, st.x, st.z);
        st.h = target;          // resolved (structures and tests can read it)
      }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i, d = Math.hypot(x0 + i * cell - st.x, z0 + j * cell - st.z);
        if (d > R) continue;
        let w = d <= r ? 1 : smooth(R, r, d);
        switch (st.mode) {
          case 'flatten':
            // on the route the bed profile already ramps into the disc (anchors); don't blend its rim twice
            if (st.onRoute && d > r && this._bedMaskTmp) w *= 1 - this._bedMaskTmp[k] / 255;
            H[k] = lerp(H[k], target, w); smask[k] = Math.max(smask[k], w); break;
          case 'raise': H[k] += (Number(st.h) || 0) * w; break;
          case 'lower': H[k] -= (Number(st.h) || 0) * w; break;
          case 'crater': {
            const depth = Number(st.h) || 6, q = d / r;
            const prof = q < 1 ? -depth * (1 - q * q) + depth * 0.3 * Math.pow(q, 6) : depth * 0.3 * Math.exp(-(((q - 1) * r / Math.max(1, fo * 0.5)) ** 2));
            H[k] += prof; smask[k] = Math.max(smask[k], (q < 1.2 ? 0.7 : 0) * w);
            break;
          }
          default: break;
        }
      }
    }
  }
  async _bakeLight(tick) {
    const { nx, nz, cell } = this, H = this.H;
    const lc = cell * BAKE_DIV, lnx = Math.ceil((nx - 1) / BAKE_DIV) + 1, lnz = Math.ceil((nz - 1) / BAKE_DIV) + 1;
    const sky = new Uint8Array(lnx * lnz), sun = new Uint8Array(lnx * lnz);
    const x0 = this.bounds.x0, z0 = this.bounds.z0;
    const dirs = [];
    for (let a = 0; a < 8; a++) dirs.push([Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]);
    const steps = [16, 34, 60, 96];
    const sd = this.sunDir, sl = Math.hypot(sd.x, sd.z);
    const sdx = sl > 1e-4 ? sd.x / sl : 0, sdz = sl > 1e-4 ? sd.z / sl : 0, tanE = sl > 1e-4 ? sd.y / sl : 99;
    const sunSteps = []; for (let t = 12; t <= 600; t *= 1.3) sunSteps.push(t);
    const softA = 0.06;   // radians of soft clearance
    const farD = (this.route.maxHalfWidth ?? 400) + 900;
    for (let j = 0; j < lnz; j++) {
      for (let i = 0; i < lnx; i++) {
        const x = x0 + i * lc, z = z0 + j * lc, h0 = this._sampleGrid(H, x, z) + 1.5;
        // full horizon scan near the corridor; far terrain (seen from ≥ 1 km) gets every other direction and step
        const far = this._cdAt ? this._cdAt(x, z) > farD : false, ds = far ? 2 : 1;
        let occ = 0, nd = 0;
        for (let q = 0; q < 8; q += ds) {
          const dx = dirs[q][0], dz = dirs[q][1];
          let m = 0;
          for (let si = 0; si < steps.length; si += ds) { const t = steps[si]; const e = (this._sampleGrid(H, x + dx * t, z + dz * t) - h0) / t; if (e > m) m = e; }
          occ += m / Math.sqrt(1 + m * m);         // sin of the horizon elevation
          nd++;
        }
        sky[j * lnx + i] = Math.round(255 * clamp(1 - occ / nd * 1.15, 0, 1));
        let vis = 1;
        if (sd.y <= 0.0) vis = 0;
        else if (sl > 1e-4) {
          let minA = 1;
          const far = this._cdAt ? this._cdAt(x, z) > farD : false;
          for (let si = 0; si < sunSteps.length; si += far ? 2 : 1) {
            const t = sunSteps[si];
            const ry = h0 + t * tanE, gh = this._sampleGrid(H, x + sdx * t, z + sdz * t);
            const a = Math.atan2(ry - gh, t);
            if (a < minA) minA = a;
            if (minA < -softA) break;
          }
          vis = smooth(-softA, softA, minA);
        }
        sun[j * lnx + i] = Math.round(255 * vis);
      }
      if ((j & 3) === 0) await tick(0.76 + 0.14 * j / lnz, 'Light');
    }
    this.sky = sky; this.sun = sun; this.lnx = lnx; this.lnz = lnz;
  }
  async _buildOuter(tick) {
    const b = this.bounds, M = OUTER_MARGIN, C = OUTER_CELL;
    const ox = Math.floor((b.x0 - M) / C) * C, oz = Math.floor((b.z0 - M) / C) * C;
    const onx = Math.ceil((b.x1 + M - ox) / C) + 1, onz = Math.ceil((b.z1 + M - oz) / C) + 1;
    const A = new Float32Array(onx * onz);
    for (let j = 0; j < onz; j++) {
      const z = oz + j * C;
      for (let i = 0; i < onx; i++) {
        const x = ox + i * C;
        // inside the bounds (minus a margin) the outer grid is never sampled; use the macro grid there
        if (x > b.x0 + 2 * C && x < b.x1 - 2 * C && z > b.z0 + 2 * C && z < b.z1 - 2 * C) A[j * onx + i] = this._sampleGrid(this.H, x, z);
        else A[j * onx + i] = this._far(x, z);
      }
      if ((j & 7) === 0) await tick(0.9 + 0.1 * j / onz, 'Horizon');
    }
    this.outer = { x0: ox, z0: oz, nx: onx, nz: onz, cell: C, A };
  }

  // ------------------------------------------------------------------ queries
  /** Catmull-Rom bicubic of the macro grid (clamped at the edges) */
  _macro(x, z) {
    const { nx, nz, cell } = this, H = this.H;
    const fx = (x - this.bounds.x0) / cell, fz = (z - this.bounds.z0) / cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    crw(fx - ix, _wx, 0); crw(fz - iz, _wz, 0);
    let h = 0;
    for (let b = 0; b < 4; b++) {
      const jj = Math.min(nz - 1, Math.max(0, iz - 1 + b)), row = jj * nx;
      let r = 0;
      for (let a = 0; a < 4; a++) r += H[row + Math.min(nx - 1, Math.max(0, ix - 1 + a))] * _wx[a];
      h += r * _wz[b];
    }
    return h;
  }
  _outerAt(x, z) {
    const O = this.outer;
    if (!O) return this._far(x, z);
    const fx = (x - O.x0) / O.cell, fz = (z - O.z0) / O.cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 1 || iz < 1 || ix >= O.nx - 2 || iz >= O.nz - 2) return this._far(x, z);
    crw(fx - ix, _wx, 0); crw(fz - iz, _wz, 0);
    let h = 0;
    for (let b = 0; b < 4; b++) {
      const row = (iz - 1 + b) * O.nx;
      let r = 0;
      for (let a = 0; a < 4; a++) r += O.A[row + ix - 1 + a] * _wx[a];
      h += r * _wz[b];
    }
    return h;
  }
  _maskAt(x, z) {
    const b = this.bounds;
    if (x < b.x0 || z < b.z0 || x > b.x1 || z > b.z1) return 0;
    return this._sampleGrid(this.mask, x, z);
  }
  /** analytic surface: bicubic macro + detail (use it for meshes and placement) */
  heightAt(x, z) {
    if (!this.built) return this._relief(x, z);
    const b = this.bounds;
    // distance inside the bounds edge
    const e = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    let h;
    if (e >= EDGE_BLEND) h = this._macro(x, z);
    else if (e <= 0) h = this._outerAt(x, z);
    else h = lerp(this._outerAt(x, z), this._macro(x, z), smooth(0, EDGE_BLEND, e));
    const D = this.P.detail;
    if (D.amp > 0 && e > 0) {
      const m = this._sampleGrid(this.mask, x, z) * smooth(0, EDGE_BLEND, e);
      if (m > 0.001) {
        const u = x / D.scale, v = z / D.scale, n = this.nDetail;
        const d = (n(u, v) + 0.5 * n(u * 2.03 + 17.1, v * 2.03 - 9.7) + 0.25 * n(u * 4.11 - 5.3, v * 4.11 + 3.9)) / 1.75;
        h += D.amp * d * m;
      }
    }
    return h;
  }
  /** collision surface: 2 m tile triangles, identical to the 2 m terrain mesh */
  groundHeight(x, z) {
    const fx = (x - this.gridOrigin.x) * 0.5, fz = (z - this.gridOrigin.z) * 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = Math.floor(ix / TILE), tz = Math.floor(iz / TILE);
    const key = tx * 65536 + tz;
    let T;
    if (key === this._lastTileKey) T = this._lastTile;
    else {
      T = this._tiles.get(key);
      if (T) { this._tiles.delete(key); this._tiles.set(key, T); }          // LRU touch
      else {
        T = this._buildTile(tx, tz);
        this._tiles.set(key, T);
        if (this._tiles.size > TILE_MAX) this._tiles.delete(this._tiles.keys().next().value);
      }
      this._lastTileKey = key; this._lastTile = T;
    }
    const li = ix - tx * TILE, lj = iz - tz * TILE, u = fx - ix, w = fz - iz, S = TILE + 1, k = lj * S + li;
    const h00 = T[k], h11 = T[k + S + 1];
    if (u >= w) { const h10 = T[k + 1]; return h00 + (h10 - h00) * u + (h11 - h10) * w; }
    const h01 = T[k + S];
    return h00 + (h01 - h00) * w + (h11 - h01) * u;
  }
  _buildTile(tx, tz) {
    const S = TILE + 1, T = new Float32Array(S * S);
    const gx = this.gridOrigin.x + tx * TILE * 2, gz = this.gridOrigin.z + tz * TILE * 2;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) T[j * S + i] = this.heightAt(gx + i * 2, gz + j * 2);
    return T;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) { return 1 - this.normalAt(x, z, _n).y; }
  /** extra: slope of the macro surface (bilinear bake, cheap) */
  macroSlopeAt(x, z) { return this.built ? this._sampleGrid(this.slope, x, z) : this.slopeAt(x, z); }
  surfaceAt(x, z) {
    if (!this.built) return { rock: 0, sediment: 0, flow: 0, height01: 0.5 };
    const sl = this._sampleGrid(this.slope, x, z), fl = this._sampleGrid(this.flow, x, z);
    const rock = smooth(0.2, 0.42, sl);
    const h01 = clamp((this.heightAt(x, z) - this.h20) / (this.h80 - this.h20), 0, 1);
    return { rock, sediment: clamp(smooth(0.15, 0.6, fl) * (1 - rock), 0, 1), flow: fl, height01: h01 };
  }
  lightAt(x, z) {
    if (!this.built) return { sun: 1, sky: 1 };
    return { sun: this._sampleLight(this.sun, x, z) / 255, sky: this._sampleLight(this.sky, x, z) / 255 };
  }
  _sampleLight(A, x, z) {
    const lc = this.cell * BAKE_DIV;
    const fx = clamp((x - this.bounds.x0) / lc, 0, this.lnx - 1.0001), fz = clamp((z - this.bounds.z0) / lc, 0, this.lnz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, n = this.lnx, k = j * n + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + n] * (1 - tx) + A[k + n + 1] * tx) * tz;
  }
  /**
   * extra (terrain vertex bake): writes flow, sediment, sky, sun, route-bed mask, macro slope and height01 for (x, z)
   * into `o` in one pass. Outside the bounds: no flow, no bed, open sky.
   */
  bakeAt(x, z, o) {
    const b = this.bounds;
    if (!this.built || x < b.x0 || z < b.z0 || x > b.x1 || z > b.z1) {
      o.flow = 0; o.bed = 0; o.sky = 1; o.sun = this.sunDir.y > 0 ? 1 : 0; o.slope = -1; o.curv = 0; o.inside = false;
      return o;
    }
    o.inside = true;
    o.flow = this._sampleGrid(this.flow, x, z);
    o.bed = this._sampleGrid(this.bedMask, x, z) / 255;
    o.slope = this._sampleGrid(this.slope, x, z);
    o.curv = this.curv ? this._sampleGrid(this.curv, x, z) : 0;
    o.sky = this._sampleLight(this.sky, x, z) / 255;
    o.sun = this._sampleLight(this.sun, x, z) / 255;
    return o;
  }
  raycast(origin, dir, maxDist) {
    if (origin.y < this.groundHeight(origin.x, origin.z)) return 0;
    const step = 4;
    let prev = 0;
    for (let t = Math.min(step, maxDist); ; t = Math.min(t + step, maxDist)) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < this.groundHeight(x, z)) {
        let a = prev, b = t;
        for (let i = 0; i < 24; i++) {
          const m = (a + b) / 2;
          if (origin.y + dir.y * m < this.groundHeight(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m;
        }
        return b;
      }
      prev = t;
      if (t >= maxDist) break;
    }
    return Infinity;
  }
  /** Shaded relief for the tactical map (pause menu), with the play corridor and the route on top. */
  renderMap(canvas, o = {}) {
    const W = canvas.width, Ht = canvas.height, g = canvas.getContext('2d');
    if (!W || !Ht || !g) return;
    const route = o.route || this.route;
    // frame the corridor (with a margin), keeping the aspect ratio
    let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity;
    for (const p of route.sample(50)) { fx0 = Math.min(fx0, p.x); fx1 = Math.max(fx1, p.x); fz0 = Math.min(fz0, p.z); fz1 = Math.max(fz1, p.z); }
    const m = (route.maxHalfWidth ?? 400) * 1.35;
    fx0 -= m; fx1 += m; fz0 -= m; fz1 += m;
    const sc = Math.max((fx1 - fx0) / W, (fz1 - fz0) / Ht);
    const cx = (fx0 + fx1) / 2, cz = (fz0 + fz1) / 2;
    const X0 = cx - sc * W / 2, Z0 = cz - sc * Ht / 2;
    const img = g.createImageData(W, Ht), D = img.data;
    const lo = this.hMin ?? -50, hi = this.hMax ?? 200, built = this.built;
    const hAt = (x, z) => built ? this._sampleGrid(this.H, x, z) : this._relief(x, z);
    for (let j = 0; j < Ht; j++) for (let i = 0; i < W; i++) {
      const x = X0 + (i + 0.5) * sc, z = Z0 + (j + 0.5) * sc;
      const h = hAt(x, z), e = Math.max(2, sc);
      const dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
      const shade = clamp(0.62 + (-dx * 0.7 - dz * 0.7) * 0.9, 0.08, 1.15);
      const t = clamp((h - lo) / Math.max(1, hi - lo), 0, 1);
      const fl = built ? this._sampleGrid(this.flow, x, z) : 0;
      const contour = Math.abs(((h / 20) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.82 : 1;
      let r = 34 + 70 * t, gg = 44 + 74 * t, b = 50 + 70 * t;
      r *= shade * contour; gg *= shade * contour; b *= shade * contour;
      b += fl * 26; gg += fl * 8;
      const k = (j * W + i) * 4;
      D[k] = clamp(r, 0, 255); D[k + 1] = clamp(gg, 0, 255); D[k + 2] = clamp(b, 0, 255); D[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toC = (x, z) => [(x - X0) / sc, (z - Z0) / sc];
    if (route) {
      const pts = route.sample(25);
      // corridor edges
      g.strokeStyle = 'rgba(224,145,60,0.28)'; g.lineWidth = 1; g.setLineDash([4, 4]);
      for (const side of [-1, 1]) {
        g.beginPath();
        pts.forEach((p, idx) => { const v = route.toWorld(p.s, side * route.halfWidthAt(p.s)); const [X, Y] = toC(v.x, v.z); if (idx) g.lineTo(X, Y); else g.moveTo(X, Y); });
        g.stroke();
      }
      g.setLineDash([]);
      g.strokeStyle = '#e0913c'; g.lineWidth = 2; g.beginPath();
      pts.forEach((p, idx) => { const [X, Y] = toC(p.x, p.z); if (idx) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
      const [sx, sy] = toC(pts[0].x, pts[0].z), [ex, ey] = toC(pts[pts.length - 1].x, pts[pts.length - 1].z);
      g.fillStyle = '#e0913c'; g.beginPath(); g.arc(sx, sy, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e0913c'; g.lineWidth = 2; g.beginPath(); g.arc(ex, ey, 5, 0, Math.PI * 2); g.stroke();
    }
    if (o.player) { const [px, py] = toC(o.player.x, o.player.z); g.fillStyle = '#7fe9ff'; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); }
    /** extra: the transform used, so callers can draw markers */
    return { x0: X0, z0: Z0, scale: sc };
  }
  dispose() { this._tiles.clear(); this._lastTile = null; this._lastTileKey = null; }
}

/** extra: drop the build cache (tests) */
export function clearHeightfieldCache() { CACHE = null; }
