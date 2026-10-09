// levels/level01/sunrise.js (P6) — the sunrise light wall (L1 §7.1, §12.9; A2 #9: L1's meshes, the AD sun front is
// deferred). A vertical curtain of gold haze (2,000 × 120 m, gradient alpha, horizontal streaks, additive) set
// perpendicular to the sun, sweeping west at 260 m/s from x 2,600, with a trailing flat gold sheet just above the ice
// and water. As the front passes the floes they crack gold-white (floes.setDawnFront) and groan (6 positional iceGroan
// points along the front every 0.6 s). When the front passes the player, onPlayer() runs once (the drown action splits
// the floe). After 12 s both meshes fade out and are removed. Low tier: the same meshes, 30 % more opaque (no bloom).
// Sim-driven (update(dt) from the level runtime); the fade-out is a function of the same clock.
import * as THREE from 'three';
import { sunDir2 } from './floes.js';
import { shared } from './kit.js';

const _v = new THREE.Vector3();

let CURTAIN_TEX = null, SHEET_TEX = null;
/** vertical gradient (bright base, fading up) with horizontal streaks; one shared texture */
function curtainTexture() {
  if (CURTAIN_TEX) return CURTAIN_TEX;
  const w = 256, h = 128, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const streak = new Float32Array(h);
  for (let y = 0; y < h; y++) streak[y] = 0.75 + 0.5 * rnd();
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);                       // 0 top, 1 bottom
    const a = Math.pow(v, 1.8) * (0.55 + 0.45 * streak[y]);
    for (let x = 0; x < w; x++) {
      const edge = Math.min(1, Math.min(x, w - 1 - x) / 24);   // soft ends
      const n = 0.85 + 0.15 * Math.sin(x * 0.11 + y * 0.7) * Math.sin(x * 0.037 - y * 0.21);
      const k = (y * w + x) * 4;
      img.data[k] = 255; img.data[k + 1] = 190; img.data[k + 2] = 120; img.data[k + 3] = Math.round(255 * Math.min(1, a * n * edge));
    }
  }
  g.putImageData(img, 0, 0);
  CURTAIN_TEX = shared(new THREE.CanvasTexture(c));
  CURTAIN_TEX.colorSpace = THREE.SRGBColorSpace;
  return CURTAIN_TEX;
}
/** the trailing sheet: bright at the front edge (u 0), fading east */
function sheetTexture() {
  if (SHEET_TEX) return SHEET_TEX;
  const w = 128, h = 8, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,200,130,0.9)'); gr.addColorStop(0.08, 'rgba(255,180,110,0.45)'); gr.addColorStop(1, 'rgba(255,170,100,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  SHEET_TEX = shared(new THREE.CanvasTexture(c));
  SHEET_TEX.colorSpace = THREE.SRGBColorSpace;
  return SHEET_TEX;
}

export class LightWall {
  /**
   * @param L the level runtime; o: { from = 2600, speed = 260, width = 2000, height = 120, azimuth = 95, onPlayer }
   */
  constructor(L, o = {}) {
    this.L = L; const ctx = L.ctx;
    this.speed = o.speed ?? 260; this.width = o.width ?? 2000; this.height = o.height ?? 120;
    const [dx, dz] = sunDir2(o.azimuth ?? 95);
    this.dir = new THREE.Vector2(dx, dz);              // toward the sun (east)
    this.d0 = o.from ?? 2600;                           // starting projection on the sun direction
    this.d = this.d0; this.t = 0; this.done = false; this.passed = false; this.onPlayer = o.onPlayer || null;
    this.groanT = 0;
    const low = ctx.tier?.name === 'low';
    const k = low ? 1.3 : 1;
    this.root = new THREE.Group(); this.root.name = 'lightWall';
    this.root.rotation.y = Math.atan2(dx, dz);         // local +z toward the sun: the curtain's plane spans local x
    this.curtainMat = new THREE.MeshBasicMaterial({ map: curtainTexture(), color: '#ffb070', transparent: true, opacity: 0.85 * k,
                                                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cg = new THREE.PlaneGeometry(this.width, this.height);
    this.curtain = new THREE.Mesh(cg, this.curtainMat);
    this.curtain.position.y = this.height / 2;
    this.curtain.renderOrder = 4; this.curtain.frustumCulled = false;
    this.root.add(this.curtain);
    this.sheetMat = new THREE.MeshBasicMaterial({ map: sheetTexture(), color: '#ffc080', transparent: true, opacity: 0.32 * k,
                                                  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.sheetLen = 3000;
    const sg = new THREE.PlaneGeometry(this.width, this.sheetLen);
    sg.rotateX(-Math.PI / 2);                          // in the xz plane; its local +z (u 1 → v) runs east
    // u runs along the length: 0 at the front edge (local z 0, the plane's original v = 1), 1 at the far east end
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, 1 - v, u); }
    this.sheet = new THREE.Mesh(sg, this.sheetMat);
    this.sheet.position.set(0, 0, this.sheetLen / 2);
    this.sheet.renderOrder = 3; this.sheet.frustumCulled = false;
    this.root.add(this.sheet);
    this.baseY = (L.DATA.floeTop ?? -21.6) + 1.2;
    this.place();
    ctx.levelRoot.add(this.root);
    ctx.audio?.play?.('iceGroan', null, { vol: 0.7 });
  }
  /** the world point of the front at lateral offset `lat` (m), at the curtain's base */
  frontPoint(lat, out) {
    const dx = this.dir.x, dz = this.dir.y;
    return out.set(dx * this.d - dz * lat, this.baseY, dz * this.d + dx * lat);
  }
  place() {
    const p = this.L.ctx.player;
    // the curtain is centred laterally on the player (or the Raft), so its 2 km always covers the view
    const cx = p?.active ? p.pos.x : 800, cz = p?.active ? p.pos.z : 0;
    const lat = -this.dir.y * cx + this.dir.x * cz;
    this.frontPoint(lat, _v);
    this.root.position.set(_v.x, this.baseY, _v.z);
    this.root.updateMatrixWorld(true);
  }
  /** projection of the player on the sun direction */
  playerD() { const p = this.L.ctx.player; return p?.active ? p.pos.x * this.dir.x + p.pos.z * this.dir.y : -Infinity; }
  /** seconds until the front reaches the player (from now) */
  etaPlayer() { return Math.max(0, (this.d - this.playerD()) / this.speed); }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const travelling = this.d > -2000;
    if (travelling) this.d -= this.speed * dt;
    this.place();
    this.L.floes?.setDawnFront?.(this.d);
    // groans along the front
    this.groanT -= dt;
    if (this.groanT <= 0 && travelling && this.d > 500) {
      this.groanT = 0.6;
      const ctx = this.L.ctx;
      for (let i = 0; i < 6; i++) { this.frontPoint((i - 2.5) * 220, _v); ctx.audio?.play?.('iceGroan', _v, { vol: 0.6 }); }
    }
    if (!this.passed && this.d <= this.playerD()) { this.passed = true; this.onPlayer?.(); }
    // fade out 12 s after the sweep starts
    const fade = this.t < 12 ? 1 : Math.max(0, 1 - (this.t - 12) / 2.5);
    const low = this.L.ctx.tier?.name === 'low' ? 1.3 : 1;
    this.curtainMat.opacity = 0.85 * low * fade;
    this.sheetMat.opacity = 0.32 * low * fade;
    if (fade <= 0) this.dispose();
  }
  dispose() {
    if (this.done) return;
    this.done = true;
    this.root.parent?.remove(this.root);
    this.curtain.geometry.dispose(); this.sheet.geometry.dispose();
    this.curtainMat.dispose(); this.sheetMat.dispose();
  }
}
