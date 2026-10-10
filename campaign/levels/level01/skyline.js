// levels/level01/skyline.js (P6) — the Wake camp's lights on the eastern shore (A1.3: the ~20 instanced beach rigs
// become this skyline row). A seeded scatter of warm tungsten and sodium lamps on the land east of the fast ice: one
// instanced lens mesh (1 draw call) plus a glow per lamp (P1's glows, flicker), so the camp reads from the Abeyance's
// crown and from the floes as a long row of small warm lights under the Thornback.
import * as THREE from 'three';
import { mulberry32 } from '../../src/core/util.js';
import { ball, mats } from './kit.js';
import { abeyanceSilhouette } from './abeyance.js';

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
/** a billowing column: soft at the sides, dense and sodium-lit low, thinning to grey at the top, lumpy all the way */
function plumeTexture() {
  if (PLUME_TEX) return PLUME_TEX;
  const w = 128, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  const rng = mulberry32(911);
  const blobs = Array.from({ length: 70 }, () => ({ x: 0.2 + rng() * 0.6, y: rng(), r: 0.06 + rng() * 0.14 }));
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1);                                   // 0 at the base (canvas bottom), 1 at the top
    const width = 0.16 + 0.3 * v;                                // the column widens as it rises
    const warm = Math.max(0, 1 - v * 3.2);                       // the sodium floodlights light its foot
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), dx = Math.abs(u - 0.5) / width;
      let a = Math.max(0, 1 - dx * dx) * Math.pow(1 - v, 0.7) * Math.min(1, v * 12 + 0.2);
      let lump = 0;
      for (const b of blobs) { const ddx = (u - 0.5) * (0.5 / width) + 0.5 - b.x, ddy = (v - b.y) * 2; const d2 = (ddx * ddx + ddy * ddy) / (b.r * b.r); if (d2 < 1) lump = Math.max(lump, 1 - d2); }
      a *= 0.45 + 0.75 * lump;
      const k = (y * w + x) * 4, shade = 0.75 + 0.25 * lump;
      img.data[k] = Math.round((150 + 105 * warm) * shade); img.data[k + 1] = Math.round((150 + 40 * warm) * shade); img.data[k + 2] = Math.round((158 - 60 * warm) * shade);
      img.data[k + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  g.putImageData(img, 0, 0);
  PLUME_TEX = new THREE.CanvasTexture(c); PLUME_TEX.colorSpace = THREE.SRGBColorSpace; PLUME_TEX.userData.shared = true;
  return PLUME_TEX;
}
export class SteamPlume {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    this.mat = new THREE.MeshBasicMaterial({ map: plumeTexture(), color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false,
                                            side: THREE.DoubleSide, fog: false });
    this.root = new THREE.Group(); this.root.name = 'steamPlume';
    const H = 300, Wd = 150;
    // three crossed vertical cards (soft-edged in the texture, so no hard cylinder silhouette shows from any side)
    const geo = new THREE.PlaneGeometry(Wd, H, 1, 1); geo.translate(0, H / 2, 0);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, this.mat); m.rotation.y = i * Math.PI / 3; m.castShadow = m.receiveShadow = false; m.renderOrder = 1; m.frustumCulled = false;
      this.root.add(m);
    }
    this.geo = geo;
    this.fade = 1; this.t = 0;
    ctx.levelRoot.add(this.root);
    this.reset();
  }
  reset() { this.fade = 1; this.root.visible = true; this.place(); }
  place() {
    const ib = this.L.icebreaker, D = this.L.DATA.icebreaker.start;
    if (ib?.pos) this.root.position.set(ib.pos.x - Math.sin(ib.yaw) * -24, (ib.pos.y || 0) + 30, ib.pos.z - Math.cos(ib.yaw) * -24);
    else this.root.position.set(D.x, 30, D.z + 24);
  }
  update(dt) {
    this.t += dt;
    const L = this.L, gone = L.flag('p:finale') || L.flag('p:sprint');
    if (gone) this.fade = L.icebreaker ? Math.max(0, this.fade - dt / 20) : 0;   // the hulk is gone: no column left
    this.root.visible = this.fade > 0.01;
    if (!this.root.visible) return;
    this.place();
    this.mat.opacity = 0.4 * this.fade * (0.9 + 0.1 * Math.sin(this.t * 0.7));
    this.root.rotation.y += dt * 0.03;
    this.root.scale.set(1 + (1 - this.fade) * 0.6, 1, 1 + (1 - this.fade) * 0.6);
  }
  dispose() { this.root.parent?.remove(this.root); this.geo.dispose(); this.mat.dispose(); }
}

/**
 * The Abeyance's skyline version (AD §2.17, arch §5.8): the hero landmark must read from every point on the route, but
 * the structure itself is hidden past 1.05 × tier.viewDistance (1.1 km on Low, so the whole cut site and the floes would
 * lose it). Beyond 0.62 × viewDistance this unlit silhouette (the hull's LOD1 exterior, one draw call, fog off) takes
 * over: it sits a little in front of the real hull and shrinks to keep its angular size (so it covers the hull without
 * z-fighting), and past 0.9 × camera.far it is pulled in to stay inside the far plane. Its colour is a dark value mixed
 * part-way toward the fog colour by the CPU fog estimate, so it stays a dark needle against the dawn rim at any range.
 */
const _c = new THREE.Vector3(), _col = new THREE.Color(), _dark = new THREE.Color('#141820');
export class AbeyanceImpostor {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    const geo = abeyanceSilhouette(ctx);
    this.mat = new THREE.MeshBasicMaterial({ color: '#202630', fog: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'abeyanceImpostor'; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false;
    // posed for the camera that is actually rendering (gameplay, cinematics, the free camera of a screenshot)
    this.mesh.onBeforeRender = (renderer, scene, camera) => this.pose(camera);
    ctx.levelRoot.add(this.mesh);
  }
  hull() {
    const S = this.L.ctx.structures;
    if (!this.inst || !this.inst.pos) this.inst = S?.get?.('abeyance') || (S?.all?.() || []).find(i => i.type === 'abeyance') || null;
    return this.inst;
  }
  pose(cam) {
    const ctx = this.L.ctx, inst = this.hull(), m = this.mesh;
    let k = 0;
    if (inst && cam?.isPerspectiveCamera) {
      _c.set(inst.pos.x, inst.pos.y + 70, inst.pos.z);
      const dist = Math.hypot(_c.x - cam.position.x, _c.z - cam.position.z);
      const view = ctx.tier?.viewDistance ?? 2600;
      // in front of the hull by 2 % (it occludes the real hull instead of fighting it), pulled inside the far plane
      if (dist >= view * 0.62) k = Math.min(dist * 0.98, cam.far * 0.9) / dist;
    }
    if (k <= 0) { m.matrixWorld.makeScale(0, 0, 0); return; }   // collapsed: nothing rasterises
    m.position.set(cam.position.x + (inst.pos.x - cam.position.x) * k, cam.position.y + (inst.pos.y - cam.position.y) * k,
                   cam.position.z + (inst.pos.z - cam.position.z) * k);
    m.rotation.set(0, inst.yaw, 0);
    m.scale.setScalar(k);
    m.updateMatrix(); m.matrixWorld.copy(m.matrix);              // levelRoot sits at the origin
    const fogCol = ctx.atmosphere?.fogUniforms?.uFogColor?.value;
    const f = Math.min(0.8, (ctx.atmosphere?.fogAmount?.(_c) ?? 0.5) * 0.55);
    _col.copy(_dark);
    if (fogCol) _col.lerp(fogCol, f);
    this.mat.color.copy(_col);
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mat.dispose(); }
}
