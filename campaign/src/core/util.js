// core/util.js (P0): math helpers, RNG, EventBus, TimerQueue, Pool, injectCSS, shared temps.
// Pure module: no ctx access. Hot paths should use the exported temps or their own module-level temps.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return a === b ? 0 : (v - a) / (b - a); }
/** smoothstep (the prototype's `smooth`) */
export function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
/** lerp(a, b, 1 − exp(−k·dt)): frame-rate independent exponential approach */
export function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
export function angWrap(a) {
  if (!Number.isFinite(a)) return 0;
  a = a % TAU;
  if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU;
  return a;
}
export function dampAng(a, b, k, dt) { return a + angWrap(b - a) * (1 - Math.exp(-k * dt)); }
/** yaw that faces the horizontal direction (dx, dz): atan2(−dx, −dz) (§1.3) */
export function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }
/** unit direction for yaw/pitch (§1.3): forward = (−sin yaw, 0, −cos yaw) tilted by pitch */
export function aimDir(yaw, pitch, out) {
  out = out || new THREE.Vector3();
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
/** cosmetic randomness only (Math.random); gameplay uses ctx.random() or mulberry32 */
export function rand(a, b) { return a + Math.random() * (b - a); }
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** uint32 FNV-1a */
export function hashString(s) {
  let h = 0x811c9dc5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
/** "MM:SS" */
export function formatTime(sec) {
  sec = Math.max(0, Number(sec) || 0);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/** idempotent <style id=…>; a second call with the same id replaces the text */
export function injectCSS(id, css) {
  if (typeof document === 'undefined') return;
  const sid = 'css-' + id;
  let el = document.getElementById(sid);
  if (!el) { el = document.createElement('style'); el.id = sid; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Shared scratch vectors for code that cannot hold its own temps. Never keep references across calls. */
export const TMP = { v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(), v4: new THREE.Vector3(),
                     q: new THREE.Quaternion(), m4: new THREE.Matrix4(), color: new THREE.Color() };

/** Escape text for innerHTML templates (ui modules). */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Deep merge of plain objects (arrays and non-plain values are replaced, not merged). Returns a new object. */
export function deepMerge(base, over) {
  if (!isPlain(base)) return clone(over === undefined ? base : over);
  const out = clone(base);
  if (!isPlain(over)) return out;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}
function isPlain(o) { return o !== null && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype; }
/** structured clone of plain data (objects, arrays, primitives); other objects are kept by reference */
export function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isPlain(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
}

export class EventBus {
  constructor() { this._m = new Map(); this._emitting = 0; }
  on(type, fn) {
    // copy-on-write so listeners added or removed during emit() don't affect the running dispatch
    const l = this._m.get(type);
    this._m.set(type, l ? [...l, fn] : [fn]);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const w = (p) => { this.off(type, w); fn(p); };
    w._orig = fn;
    return this.on(type, w);
  }
  off(type, fn) {
    const l = this._m.get(type);
    if (!l) return;
    const i = l.findIndex(f => f === fn || f._orig === fn);
    if (i >= 0) { const n = l.slice(); n.splice(i, 1); this._m.set(type, n); }
  }
  /** Listener exceptions propagate after every listener has run (the first one is rethrown). */
  emit(type, payload) {
    const l = this._m.get(type);
    if (!l || !l.length) return;
    let err = null;
    for (const fn of l) {
      try { fn(payload === undefined ? {} : payload); } catch (e) { if (!err) err = e; }
    }
    if (err) throw err;
  }
  clear() { this._m.clear(); }
}

/** Sim-time timers. `getTime` returns the current time (ctx.clock.time). update() is called by the engine's 'timers' system. */
export class TimerQueue {
  constructor(getTime) { this.getTime = getTime; this._list = []; this._id = 0; }
  after(sec, fn) {
    const id = ++this._id;
    this._list.push({ id, t: this.getTime() + Math.max(0, sec), fn, every: 0 });
    return id;
  }
  /** fn returning false stops the repeat */
  every(sec, fn) {
    const id = ++this._id;
    const s = Math.max(1e-3, sec);
    this._list.push({ id, t: this.getTime() + s, fn, every: s });
    return id;
  }
  cancel(id) { const i = this._list.findIndex(e => e.id === id); if (i >= 0) this._list.splice(i, 1); }
  update() {
    const now = this.getTime();
    if (!this._list.length) return;
    // collect due entries in deadline order (ties: creation order) so results don't depend on array order
    let due = null;
    for (const e of this._list) if (now >= e.t) (due || (due = [])).push(e);
    if (!due) return;
    due.sort((a, b) => a.t - b.t || a.id - b.id);
    for (const e of due) {
      const i = this._list.indexOf(e);
      if (i < 0) continue;            // cancelled by an earlier callback
      if (e.every) {
        e.t += e.every;
        if (e.t <= now) e.t = now + e.every;
        if (e.fn() === false) { const j = this._list.indexOf(e); if (j >= 0) this._list.splice(j, 1); }
      } else {
        this._list.splice(i, 1);
        e.fn();
      }
    }
  }
  clear() { this._list.length = 0; }
  get size() { return this._list.length; }
}

export class Pool {
  constructor(create, reset) { this._create = create; this._reset = reset; this._free = []; }
  get() { return this._free.length ? this._free.pop() : this._create(); }
  release(o) { if (this._reset) this._reset(o); this._free.push(o); }
  get free() { return this._free.length; }
}
