// world/heightfield.js (P2) — P0 STUB: analytic hills heightAt = 8·sin(x/180)·cos(z/150); groundHeight = heightAt.
// Stamps, carving and erosion are ignored. P2 replaces this with the full macro-grid pipeline (§5.3).
import * as THREE from 'three';
import { clamp } from '../core/util.js';

export class Heightfield {
  constructor(def, route, stamps = [], o = {}) {
    this.def = def || {};
    this.route = route;
    this.stamps = stamps;
    this.seed = o.seed ?? 1;
    this.tier = o.tier;
    this.sunDir = o.sunDir;
    if (Array.isArray(this.def.bounds)) {
      const [x0, z0, x1, z1] = this.def.bounds;
      this.bounds = { x0, z0, x1, z1 };
    } else {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, hw = 0;
      for (const [x, z] of route.points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      for (let s = 0; s <= route.length; s += 50) hw = Math.max(hw, route.halfWidthAt(s));
      const g = hw + 1500;
      this.bounds = { x0: x0 - g, z0: z0 - g, x1: x1 + g, z1: z1 + g };
    }
  }
  async build(onProgress) { onProgress?.(1, 'Terrain'); }
  heightAt(x, z) { return 8 * Math.sin(x / 180) * Math.cos(z / 150); }
  groundHeight(x, z) { return this.heightAt(x, z); }
  normalAt(x, z, out = new THREE.Vector3()) {
    const dx = (8 / 180) * Math.cos(x / 180) * Math.cos(z / 150);
    const dz = -(8 / 150) * Math.sin(x / 180) * Math.sin(z / 150);
    return out.set(-dx, 1, -dz).normalize();
  }
  slopeAt(x, z) { return 1 - this.normalAt(x, z, _n).y; }
  surfaceAt(x, z) {
    const h = this.heightAt(x, z), sl = this.slopeAt(x, z);
    return { rock: clamp(sl * 8, 0, 1), sediment: clamp(-h / 8, 0, 1) * 0.5, flow: 0, height01: clamp((h + 8) / 16, 0, 1) };
  }
  lightAt(x, z) { return { sun: 1, sky: 1 }; }
  raycast(origin, dir, maxDist) {
    const step = 4;
    let prevT = 0;
    if (origin.y < this.groundHeight(origin.x, origin.z)) return 0;
    for (let t = step; t <= maxDist + step; t += step) {
      const tt = Math.min(t, maxDist);
      const x = origin.x + dir.x * tt, y = origin.y + dir.y * tt, z = origin.z + dir.z * tt;
      if (y < this.groundHeight(x, z)) {
        let a = prevT, b = tt;
        for (let i = 0; i < 20; i++) {
          const m = (a + b) / 2;
          if (origin.y + dir.y * m < this.groundHeight(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m;
        }
        return (a + b) / 2;
      }
      prevT = tt;
      if (tt >= maxDist) break;
    }
    return Infinity;
  }
  /** Shaded relief for the tactical map, with the route drawn on top. */
  renderMap(canvas, o = {}) {
    const W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
    const b = this.bounds, sx = (b.x1 - b.x0) / W, sz = (b.z1 - b.z0) / H;
    const img = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = b.x0 + i * sx, z = b.z0 + j * sz;
      const n = this.normalAt(x, z, _n);
      const v = clamp(0.55 + (n.x * -0.5 + n.z * -0.5) * 6 + this.heightAt(x, z) / 40, 0, 1) * 200 + 30;
      const k = (j * W + i) * 4;
      img.data[k] = v; img.data[k + 1] = v * 0.92; img.data[k + 2] = v * 0.85; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const route = o.route || this.route;
    if (route) {
      g.strokeStyle = '#e0913c'; g.lineWidth = 2; g.beginPath();
      route.sample(40).forEach((p, i) => { const X = (p.x - b.x0) / sx, Y = (p.z - b.z0) / sz; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
    }
  }
  dispose() { /* nothing to free */ }
}
const _n = new THREE.Vector3();
