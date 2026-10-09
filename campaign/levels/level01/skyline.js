// levels/level01/skyline.js (P6) — the Wake camp's lights on the eastern shore (A1.3: the ~20 instanced beach rigs
// become this skyline row). A seeded scatter of warm tungsten and sodium lamps on the land east of the fast ice: one
// instanced lens mesh (1 draw call) plus a glow per lamp (P1's glows, flicker), so the camp reads from the Abeyance's
// crown and from the floes as a long row of small warm lights under the Thornback.
import * as THREE from 'three';
import { mulberry32 } from '../../src/core/util.js';
import { ball, mats } from './kit.js';

export class WakeLights {
  constructor(L) {
    this.L = L; const ctx = L.ctx, D = L.DATA.wakeLights;
    const rng = mulberry32(D.seed);
    this.points = [];
    // a loose row: clustered rigs along a north-south band, a few strays
    const clusters = 9;
    for (let c = 0; c < clusters; c++) {
      const cz = D.z0 + (c + 0.5) / clusters * (D.z1 - D.z0) + (rng() - 0.5) * 120;
      const cx = D.x0 + 120 + rng() * (D.x1 - D.x0 - 240);
      const n = Math.max(3, Math.round(D.count / clusters + (rng() - 0.5) * 3));
      for (let i = 0; i < n && this.points.length < D.count; i++) {
        const x = cx + (rng() - 0.5) * 70, z = cz + (rng() - 0.5) * 90;
        const h = 3 + rng() * 9;
        this.points.push({ x, z, h, sodium: rng() < 0.3, size: 1.6 + rng() * 1.4 });
      }
    }
    const M = mats(ctx);
    this.mesh = new THREE.InstancedMesh(ball(0.6, 6, 4), M.tungsten, this.points.length);
    this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.frustumCulled = false; this.mesh.name = 'wakeLights';
    ctx.levelRoot.add(this.mesh);
    this.handles = [];
    this.place();
  }
  place() {
    const ctx = this.L.ctx, m4 = new THREE.Matrix4();
    for (const h of this.handles) h?.remove?.();
    this.handles = [];
    this.points.forEach((p, i) => {
      const y = this.L.groundAt(p.x, p.z) + p.h;
      p.pos = new THREE.Vector3(p.x, y, p.z);
      m4.makeTranslation(p.x, y, p.z);
      this.mesh.setMatrixAt(i, m4);
      const g = ctx.particles?.glows?.add?.(p.pos, { color: p.sodium ? '#ff9a2e' : '#ffb36b', size: p.size, intensity: 2.2, minPx: 2,
                                                      pulse: 'flicker', phase: (i * 0.137) % 1 });
      if (g) this.handles.push(g);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** glows are cleared with the level; re-add them if they were dropped (a restart keeps the runtime) */
  ensure() { if (this.handles.length && !this.handles[0].alive) this.place(); }
  dispose() { for (const h of this.handles) h?.remove?.(); this.handles = []; this.mesh.parent?.remove(this.mesh); }
}

/**
 * The Icebreaker's lit steam column (L1 §2.5: "a sodium-orange glow on the eastern horizon and a lit steam column 300 m
 * tall"), visible from the Teeth on. A level-owned mesh instead of a static skyline plume, so it rides the machine (its
 * start position until it is spawned) and dies with it: after the finale it thins and fades over 20 s.
 * Two crossed, camera-agnostic open cylinders with a soft vertical gradient (alpha, colour: sodium-lit base, grey top),
 * MeshBasicMaterial with a map (the same program as the light wall), no shadows, drawn before the transparent effects.
 */
let PLUME_TEX = null;
function plumeTexture() {
  if (PLUME_TEX) return PLUME_TEX;
  const w = 64, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1);                                   // 0 at the base (canvas bottom), 1 at the top
    const a = Math.pow(1 - v, 0.6) * Math.min(1, v * 10 + 0.15); // dense low, thinning up, soft foot
    const warm = Math.max(0, 1 - v * 3.5);                       // the sodium glow from the floodlights below
    for (let x = 0; x < w; x++) {
      const n = 0.7 + 0.3 * Math.sin(x * 0.4 + y * 0.09) * Math.sin(y * 0.031 - x * 0.2);
      const k = (y * w + x) * 4;
      img.data[k] = Math.round(110 + 120 * warm); img.data[k + 1] = Math.round(108 + 40 * warm); img.data[k + 2] = Math.round(112 - 40 * warm);
      img.data[k + 3] = Math.round(255 * Math.max(0, Math.min(1, a * n)));
    }
  }
  g.putImageData(img, 0, 0);
  PLUME_TEX = new THREE.CanvasTexture(c); PLUME_TEX.colorSpace = THREE.SRGBColorSpace; PLUME_TEX.userData.shared = true;
  return PLUME_TEX;
}
export class SteamPlume {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    this.mat = new THREE.MeshBasicMaterial({ map: plumeTexture(), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false,
                                            side: THREE.DoubleSide, fog: false });
    this.root = new THREE.Group(); this.root.name = 'steamPlume';
    const H = 300;
    for (const [r0, r1, rot] of [[10, 60, 0], [14, 48, 0.9]]) {
      const geo = new THREE.CylinderGeometry(r1, r0, H, 20, 1, true); geo.translate(0, H / 2, 0);
      const m = new THREE.Mesh(geo, this.mat); m.rotation.y = rot; m.castShadow = m.receiveShadow = false; m.renderOrder = 1; m.frustumCulled = false;
      this.root.add(m);
    }
    this.fade = 1; this.t = 0;
    ctx.levelRoot.add(this.root);
    this.reset();
  }
  reset() { this.fade = 1; this.root.visible = true; this.place(); }
  place() {
    const ib = this.L.icebreaker, D = this.L.DATA.icebreaker.start;
    if (ib?.pos) this.root.position.set(ib.pos.x - Math.sin(ib.yaw) * -24, (ib.pos.y || 0) + 40, ib.pos.z - Math.cos(ib.yaw) * -24);
    else this.root.position.set(D.x, 40, D.z + 24);
  }
  update(dt) {
    this.t += dt;
    const L = this.L, gone = L.flag('p:finale') || L.flag('p:sprint');
    if (gone) this.fade = L.icebreaker ? Math.max(0, this.fade - dt / 20) : 0;   // the hulk is gone: no column left
    this.root.visible = this.fade > 0.01;
    if (!this.root.visible) return;
    this.place();
    this.mat.opacity = 0.55 * this.fade * (0.92 + 0.08 * Math.sin(this.t * 0.7));
    this.root.children[0].rotation.y += dt * 0.05; this.root.children[1].rotation.y -= dt * 0.04;
    this.root.scale.set(1 + (1 - this.fade) * 0.6, 1, 1 + (1 - this.fade) * 0.6);
  }
  dispose() { this.root.parent?.remove(this.root); for (const m of this.root.children) m.geometry.dispose(); this.mat.dispose(); }
}
