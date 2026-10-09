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
