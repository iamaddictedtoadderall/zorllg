// world/collision.js (P2) — P0 STUB: port of the prototype's 2.5D colliders (box, circle) with a 32 m spatial hash.
// Oriented boxes are treated as their axis-aligned bounds. segment() marches in ≤ 0.75 m steps and bisects.
// obox convention (for P2): hw is the half-extent along the box's local X, hd along local Z, the box rotated by `yaw`
// exactly like Object3D.rotation.y.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const CG = 32;
const NONE = [];
const ckey = (i, j) => i * 100003 + j;
const _n = new THREE.Vector3();

export class Collision {
  constructor(ctx) {
    this.ctx = ctx;
    this.ground = null;
    this._list = [];
    this._grid = new Map();
    this._id = 0;
  }
  get count() { return this._list.length; }

  add(c) {
    if (!c || !c.type) throw new Error('Collision.add: collider needs a type');
    c.id = ++this._id;
    c.enabled = c.enabled !== false;
    if (c.bottom === undefined || c.bottom === null) c.bottom = -1e9;
    if (!Number.isFinite(c.top)) throw new Error('Collision.add: collider needs a numeric top');
    if (c.type === 'circle') {
      c.minx = c.x - c.r; c.maxx = c.x + c.r; c.minz = c.z - c.r; c.maxz = c.z + c.r;
    } else if (c.type === 'obox') {
      const co = Math.abs(Math.cos(c.yaw || 0)), si = Math.abs(Math.sin(c.yaw || 0));
      const ex = c.hw * co + c.hd * si, ez = c.hw * si + c.hd * co;
      c.minx = c.x - ex; c.maxx = c.x + ex; c.minz = c.z - ez; c.maxz = c.z + ez;
    } else if (c.type !== 'box') throw new Error('Collision.add: unknown type ' + c.type);
    c.surface = c.surface || 'concrete';
    this._list.push(c);
    const pad = 5;
    c._cells = [];
    for (let i = Math.floor((c.minx - pad) / CG); i <= Math.floor((c.maxx + pad) / CG); i++)
      for (let j = Math.floor((c.minz - pad) / CG); j <= Math.floor((c.maxz + pad) / CG); j++) {
        const k = ckey(i, j);
        let cell = this._grid.get(k);
        if (!cell) { cell = []; this._grid.set(k, cell); }
        cell.push(c); c._cells.push(k);
      }
    return c;
  }
  remove(c) {
    const i = this._list.indexOf(c);
    if (i < 0) return;
    this._list.splice(i, 1);
    for (const k of c._cells || []) {
      const cell = this._grid.get(k); if (!cell) continue;
      const j = cell.indexOf(c); if (j >= 0) cell.splice(j, 1);
      if (!cell.length) this._grid.delete(k);
    }
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

  _in(c, x, z, pad = 0) {
    if (c.type === 'circle') { const dx = x - c.x, dz = z - c.z, r = c.r + pad; return dx * dx + dz * dz < r * r; }
    return x > c.minx - pad && x < c.maxx + pad && z > c.minz - pad && z < c.maxz + pad;
  }
  /** highest ground/top under a body at height y (1.6 m step-up) */
  supportHeight(x, z, y) {
    let g = this.groundHeight(x, z);
    for (const c of this.near(x, z)) if (c.enabled && y >= c.top - 1.6 && c.top > g && this._in(c, x, z)) g = c.top;
    return g;
  }
  /** push a body out of colliders, apply ceilings; true if anything was touched */
  resolve(m) {
    const p = m.pos, r = m.rad;
    let touched = false;
    for (const c of this.near(p.x, p.z)) {
      if (!c.enabled) continue;
      if (p.y >= c.top - 1.0) continue;
      if (p.y + m.hgt <= c.bottom) continue;
      if (c.bottom > -1e8 && p.y < c.bottom && p.y + m.hgt > c.bottom && this._in(c, p.x, p.z)) {
        p.y = c.bottom - m.hgt; if (m.vel && m.vel.y > 0) m.vel.y = 0; touched = true; continue;   // ceiling
      }
      if (c.type === 'circle') {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-4) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; touched = true; }
      } else {
        const qx = clamp(p.x, c.minx, c.maxx), qz = clamp(p.z, c.minz, c.maxz);
        const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
        if (d2 > 1e-6) {
          if (d2 < r * r) { const d = Math.sqrt(d2); p.x = qx + dx / d * r; p.z = qz + dz / d * r; touched = true; }
        } else {
          const l = p.x - c.minx, rr = c.maxx - p.x, f = p.z - c.minz, b = c.maxz - p.z, mn = Math.min(l, rr, f, b);
          if (mn === l) p.x = c.minx - r; else if (mn === rr) p.x = c.maxx + r; else if (mn === f) p.z = c.minz - r; else p.z = c.maxz + r;
          touched = true;
        }
      }
    }
    return touched;
  }
  pointInSolid(q) {
    for (const c of this.near(q.x, q.z)) if (c.enabled && q.y < c.top && q.y > c.bottom && this._in(c, q.x, q.z)) return true;
    return false;
  }
  _solidAt(x, y, z, rad, useCol) {
    if (!useCol) return null;
    for (const c of this.near(x, z)) {
      if (c.enabled && y < c.top + rad && y > c.bottom - rad && this._in(c, x, z, rad)) return c;
    }
    return null;
  }
  /** first hit along a → b (ground and/or colliders), or null */
  segment(a, b, out, o = {}) {
    const useG = o.ground !== false, useC = o.colliders !== false, rad = o.radius || 0;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return null;
    const steps = Math.max(1, Math.ceil(L / 0.75));
    const hitAt = (t) => {
      const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (useG && y < this.groundHeight(x, z) + rad) return 'g';
      return this._solidAt(x, y, z, rad, useC);
    };
    let prev = 0;
    if (hitAt(0)) return null;   // starting inside: report nothing (callers start from free space)
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const h = hitAt(t);
      if (h) {
        let lo = prev, hi = t, hit = h;
        for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; const hm = hitAt(m); if (hm) { hi = m; hit = hm; } else lo = m; }
        out = out || { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
        out.t = hi;
        out.point.set(a.x + dx * hi, a.y + dy * hi, a.z + dz * hi);
        if (hit === 'g') {
          out.ground = true; out.collider = null;
          out.surface = this.ctx?.world?.surfaceAt ? this.ctx.world.surfaceAt(out.point.x, out.point.z) : 'ground';
          if (this.ctx?.world?.normalAt) this.ctx.world.normalAt(out.point.x, out.point.z, out.normal); else out.normal.set(0, 1, 0);
        } else {
          out.ground = false; out.collider = hit; out.surface = hit.surface || 'concrete';
          this._normal(hit, out.point, a, out.normal);
        }
        return out;
      }
      prev = t;
    }
    return null;
  }
  _normal(c, p, from, out) {
    if (from.y >= c.top - 0.05 && p.y >= c.top - 0.6) return out.set(0, 1, 0);
    if (c.bottom > -1e8 && from.y <= c.bottom + 0.05 && p.y <= c.bottom + 0.6) return out.set(0, -1, 0);
    if (c.type === 'circle') return out.set(p.x - c.x, 0, p.z - c.z).normalize();
    const d = [p.x - c.minx, c.maxx - p.x, p.z - c.minz, c.maxz - p.z];
    const m = Math.min(...d), i = d.indexOf(m);
    return out.set(i === 0 ? -1 : i === 1 ? 1 : 0, 0, i === 2 ? -1 : i === 3 ? 1 : 0);
  }
  lineOfSight(a, b) { return !this.segment(a, b, _losHit); }
  clear() { this._list.length = 0; this._grid.clear(); }
}
const _losHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
