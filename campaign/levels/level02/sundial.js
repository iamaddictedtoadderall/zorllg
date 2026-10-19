// levels/level02/sundial.js — the Sundial (L2 §12.3, §11.6, §2.5): the hero landmark and its long shadow.
//
//  · SUNDIAL_TYPE (structure 'sundial'): the stepped Founders plinth (140 m at the base, four steps to a 70 m top at
//    +50 m, white ceramic, soft chamfers, gold seam lines, the plaque on the west face of the first step). Its four step
//    boxes are the only colliders: the blade is unreachable.
//  · SundialBlade (runtime): the blade, 1,350 m long, leaning north at 42° from the plinth's top to a tip 953 m up. It
//    must read from every point of the 8.8 km route (L2 §2.5), so it is one level-owned mesh posed per camera: at its
//    true place and scale while it fits inside the far plane (lit, fogged by the engine), otherwise pulled in along the
//    view ray and shrunk to keep its angular size (AD §2.17), drawn then as a two-tone silhouette (sunlit face, shaded
//    face) blended toward the fog colour by the CPU fog estimate, like Level 1's Abeyance impostor.
//  · ShadowStripe (runtime): the plinth's and the blade's shadow on the ground along the sun direction (azimuth 150°,
//    elevation 10°), clipped to 2 km: a ground-conforming grid (8 m cells, 16 on Low) drawn with multiply blending in
//    #5c6a86 with soft edges. inShade(x, z) drives the shade art (L2 §15.2) and the camp slots are generated inside it.
//    (The engine's shadow map can't reach a kilometre-tall caster; addendum 01 deferred AD's terrain-data caster.)
import * as THREE from 'three';
import * as KIT from '../../src/art/kit.js';
import { Builder, mats2, top, slab, front, chamferRect, glowAnchor, part, fp, PI } from './kit2.js';
import { signMesh } from '../level01/structures.js';

const DEG = PI / 180;
export const PLINTH = { base: 140, top: 70, h: 50, steps: 4 };
const STEP_W = (i) => PLINTH.base - (PLINTH.base - PLINTH.top) * (i / (PLINTH.steps - 1));
const STEP_H = PLINTH.h / PLINTH.steps;

// ════════════════════════════════════════════════════════════════════════════════════ the plinth (structure)
export const SUNDIAL_TYPE = {
  params: { plinth: 140, height: 50, steps: 4 },
  footprint: () => fp('rect', 150, 150, 6),
  colliders: () => Array.from({ length: PLINTH.steps }, (_, i) => {
    const w = STEP_W(i) / 2;
    return { type: 'box', minx: -w, maxx: w, minz: -w, maxz: w, top: (i + 1) * STEP_H, bottom: -1 };
  }),
  anchors: () => ({ plaque: [-PLINTH.base / 2 - 1.5, 4, -45], root: [0, PLINTH.h, 0] }),
  build(ctx) {
    const M = mats2(ctx);
    const r = part(ctx, 'sundial_plinth', (B, lod) => {
      for (let i = 0; i < PLINTH.steps; i++) {
        const w = STEP_W(i), y = i * STEP_H;
        B.add(top(chamferRect(w, w, lod ? 2 : 1.5), STEP_H, lod ? 0 : 0.6), M.ceramicWarm, 0, y + STEP_H / 2, 0);
        if (lod) continue;
        // gold seams along each step's top edges and a dimmer course line halfway up the riser
        for (const [x, z, ry] of [[0, w / 2, 0], [0, -w / 2, 0], [w / 2, 0, PI / 2], [-w / 2, 0, PI / 2]]) {
          B.add(slab(w - 3, 0.35, 0.5, 0.08), M.gold, x * 1.003, y + STEP_H - 0.6, z * 1.003, 0, ry, 0);
          B.add(slab(w - 3.5, 0.22, 0.3, 0.05), M.goldDead, x * 1.006, y + STEP_H * 0.45, z * 1.006, 0, ry, 0);
        }
        // panel joints on the risers (every 10 m): shallow ceramic pilasters
        for (let k = -Math.floor(w / 20); k <= Math.floor(w / 20); k++) {
          for (const [sx, sz, ry] of [[1, 0, PI / 2], [-1, 0, PI / 2], [0, 1, 0], [0, -1, 0]]) {
            const x = sx ? sx * (w / 2 + 0.15) : k * 10, z = sz ? sz * (w / 2 + 0.15) : k * 10;
            B.add(slab(1.2, STEP_H - 1.6, 0.5, 0.15), M.ceramicAged, x, y + STEP_H / 2 - 0.4, z, 0, ry, 0);
          }
        }
      }
      // the plaque's frame on the west face of the first step
      if (!lod) B.add(front(chamferRect(9, 4.4, 0.6), 0.8, 0.15), M.goldDead, -PLINTH.base / 2 - 0.3, 4, -45, 0, PI / 2, 0);
    }, { lod: true });
    const s = signMesh(ctx, 'SUNDIAL GNOMON', 8.2, 1.2, { bg: '#ece4d4', color: '#6e5a2c', font: '600 64px "Iowan Old Style", Georgia, serif', w: 512, h: 76, weathered: 0.4 });
    if (s) { s.position.set(-PLINTH.base / 2 - 0.75, 4.9, -45); s.rotation.y = -PI / 2; r.root.add(s); }
    const s2 = signMesh(ctx, 'CARRY THEM HOME. SET THEM DOWN.', 8.2, 0.9, { bg: '#ece4d4', color: '#7a6638', font: '500 44px "Iowan Old Style", Georgia, serif', w: 768, h: 84, weathered: 0.5 });
    if (s2) { s2.position.set(-PLINTH.base / 2 - 0.75, 3.4, -45); s2.rotation.y = -PI / 2; r.root.add(s2); }
    return r;
  },
};

// ════════════════════════════════════════════════════════════════════════════════════ geometry of the blade
/** the blade's frame: root (top centre of the plinth) and its unit axis (north and up at `lean`°) */
export function bladeFrame(ped, groundY, D) {
  const B = D.blade, lean = B.lean * DEG;
  const root = new THREE.Vector3(ped.x, groundY + PLINTH.h, ped.z);
  const axis = new THREE.Vector3(0, Math.sin(lean), -Math.cos(lean));   // azimuth 0 (north)
  const tip = root.clone().addScaledVector(axis, B.length);
  return { root, axis, tip, length: B.length, rootW: B.rootW, tipW: B.tipW };
}

/** a rounded triangle (one face toward +y of the section's frame), width w, depth d, `r` corner rounding segments */
function roundTri(w, d, seg = 3) {
  const P = [[-w / 2, -d * 0.35], [w / 2, -d * 0.35], [0, d * 0.65]];
  const rad = Math.min(w, d) * 0.12, out = [];
  for (let i = 0; i < 3; i++) {
    const a = P[(i + 2) % 3], b = P[i], c = P[(i + 1) % 3];
    const ab = [a[0] - b[0], a[1] - b[1]], cb = [c[0] - b[0], c[1] - b[1]];
    const la = Math.hypot(...ab), lc = Math.hypot(...cb);
    const p0 = [b[0] + ab[0] / la * rad, b[1] + ab[1] / la * rad], p1 = [b[0] + cb[0] / lc * rad, b[1] + cb[1] / lc * rad];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;   // quadratic Bézier through the corner
      out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * b[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * b[1] + t * t * p1[1]]);
    }
  }
  return out;
}

/**
 * The blade in a local frame: loft along +z (root at z 0, tip at z = length), sections in xy; seams every 20 m (a
 * slightly smaller section at each seam); gold edge strips. Returns { main: geometry (lit), gold: geometry, lod }.
 * The caller rotates local +z onto the blade axis and local +y toward the sun side.
 */
function bladeGeometry(F, lod = false) {
  const len = F.length, n = lod ? 14 : Math.round(len / 20), seg = lod ? 1 : 3;
  const secs = [];
  const width = (z) => F.rootW + (F.tipW - F.rootW) * (z / len);
  for (let i = 0; i <= n; i++) {
    const z = (i / n) * len, w = width(z), d = w * 0.62;
    if (!lod && i > 0 && i < n) secs.push({ z: z - 0.6, pts: roundTri(w, d, seg) }, { z: z - 0.3, pts: roundTri(w * 0.985, d * 0.985, seg) }, { z, pts: roundTri(w, d, seg) });
    else secs.push({ z, pts: roundTri(w, d, seg) });
  }
  // the tip: a short point
  secs.push({ z: len + Math.max(6, F.tipW * 0.8), pts: roundTri(0.6, 0.4, seg) });
  const main = KIT.loft(secs, { closed: true, caps: true });
  let gold = null;
  if (!lod) {
    // three gold edge strips along the rounded corners (narrow lofted ribbons just proud of the surface)
    const ribs = [];
    for (const corner of [0, 1, 2]) {
      const sec = [];
      for (let i = 0; i <= 24; i++) {
        const z = (i / 24) * len, w = width(z), d = w * 0.62;
        const tri = roundTri(w * 1.004, d * 1.004, 3);
        const c = tri[corner * 4 + 2];
        const cx = c[0], cy = c[1], nl = Math.hypot(cx, cy) || 1, s = 0.9 + w * 0.004;
        sec.push({ z, pts: [[cx - cy / nl * s, cy + cx / nl * s], [cx + cy / nl * s, cy - cx / nl * s], [cx * 1.01, cy * 1.01]] });
      }
      ribs.push(KIT.loft(sec, { closed: true, caps: false }));
    }
    const B = new Builder();
    const gm = new THREE.MeshBasicMaterial();
    for (const g of ribs) B.addM(g, gm, new THREE.Matrix4());
    gold = B.merged()[0].geo;
  }
  return { main, gold };
}

/** world matrix that maps the blade's local frame (z along the axis, +y toward the sun) onto the world */
function bladeMatrix(F, sunAz) {
  const z = F.axis.clone();
  // +y of the section: perpendicular to the axis, turned toward the sun's azimuth (one face toward the sun, L2 §12.3)
  const sun = new THREE.Vector3(Math.sin(sunAz * DEG), 0, -Math.cos(sunAz * DEG));
  // the section's flat face looks down its local -y: turn -y toward the sun
  const y = sun.clone().addScaledVector(z, -sun.dot(z)).normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(F.root);
  return m;
}

// ════════════════════════════════════════════════════════════════════════════════════ the blade (runtime)
const _c = new THREE.Vector3(), _col = new THREE.Color(), _fog = new THREE.Color();
export class SundialBlade {
  constructor(L) {
    this.L = L; const ctx = L.ctx, D = L.DATA.sundial;
    const ped = D.pedestal;
    const gy = L.groundAt(ped.x, ped.z);
    this.F = bladeFrame(ped, gy, D);
    this.sunAz = L.DATA.sun.azimuth;
    this.mat0 = bladeMatrix(this.F, this.sunAz);
    const M = mats2(ctx);
    const g0 = bladeGeometry(this.F, false), g1 = bladeGeometry(this.F, true);
    g0.main.applyMatrix4(this.mat0); if (g0.gold) g0.gold.applyMatrix4(this.mat0); g1.main.applyMatrix4(this.mat0);
    for (const g of [g0.main, g0.gold, g1.main]) if (g) { g.translate(-this.F.root.x, -this.F.root.y, -this.F.root.z); g.computeBoundingSphere(); g.userData.shared = false; }
    // near: lit ceramic with the gold seams (the low sun catches them first)
    this.near = new THREE.Group(); this.near.name = 'sundialBlade';
    const mBlade = new THREE.Mesh(g0.main, M.ceramicWarm); mBlade.castShadow = false; mBlade.receiveShadow = true;
    this.near.add(mBlade);
    if (g0.gold) { const mg = new THREE.Mesh(g0.gold, ctx.materials.emissive('#ffcc66', 1.4)); mg.castShadow = false; this.near.add(mg); }
    // far: a two-tone silhouette (sun face, shade face) from the LOD geometry, coloured per frame (no fog, no lighting)
    this.farGeo = this.twoTone(g1.main);
    this.farSun = new THREE.MeshBasicMaterial({ color: '#f2e2c4', fog: false });
    this.farShade = new THREE.MeshBasicMaterial({ color: '#7d8aa6', fog: false });
    this.far = new THREE.Mesh(this.farGeo, [this.farSun, this.farShade]); this.far.name = 'sundialFar';
    this.far.castShadow = false; this.far.receiveShadow = false;
    // no ambient occlusion on the blade: GTAO's half-resolution depth can't resolve a kilometre-long sliver kilometres
    // away (it darkened the whole silhouette to slate and stair-stepped its edges), and nothing is near enough to occlude it
    this.far.userData.noAO = true;
    this.near.traverse(o => { if (o.isMesh) o.userData.noAO = true; });
    for (const o of [this.near, this.far]) {
      o.matrixAutoUpdate = false; o.frustumCulled = false;
      ctx.levelRoot.add(o);
    }
    mBlade.frustumCulled = false;
    // posed for the camera that renders (gameplay, cinematics, the screenshot camera)
    mBlade.onBeforeRender = (r, s, cam) => this.pose(cam);
    this.far.onBeforeRender = (r, s, cam) => this.pose(cam);
    this.lastCam = null; this.lastFrame = -1;
    // the lattice-ring emblem 40 m across on the sun-facing flat face, 40 m up the blade (it faces the approach)
    const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
    this.mat0.extractBasis(bx, by, bz);
    const a = 40, w = this.F.rootW + (this.F.tipW - this.F.rootW) * (a / this.F.length), d = w * 0.62;
    const ring = new THREE.Mesh(KIT.ring(18, 2.2, 1.2, 48), M.gold);
    ring.position.copy(bz).multiplyScalar(a).addScaledVector(by, -0.35 * d - 0.7);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), by.clone().negate());   // the ring's axis along the face normal
    ring.castShadow = false;
    ring.userData.noAO = true;
    this.near.add(ring);
  }
  /** split the LOD geometry into a sunlit and a shaded group (by face normal against the sun direction) */
  twoTone(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = p.count / 3;
    const sun = new THREE.Vector3(Math.sin(this.sunAz * DEG) * Math.cos(10 * DEG), Math.sin(10 * DEG), -Math.cos(this.sunAz * DEG) * Math.cos(10 * DEG));
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
    const lit = [], dark = [];
    for (let i = 0; i < n; i++) {
      a.fromBufferAttribute(p, i * 3); b.fromBufferAttribute(p, i * 3 + 1); c.fromBufferAttribute(p, i * 3 + 2);
      nn.subVectors(c, b).cross(_c.subVectors(a, b)).normalize();
      (nn.dot(sun) > 0.05 ? lit : dark).push(i);
    }
    const out = new Float32Array(n * 9);
    let k = 0;
    for (const i of [...lit, ...dark]) for (let v = 0; v < 3; v++) { out[k++] = p.getX(i * 3 + v); out[k++] = p.getY(i * 3 + v); out[k++] = p.getZ(i * 3 + v); }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g2.addGroup(0, lit.length * 3, 0); g2.addGroup(lit.length * 3, dark.length * 3, 1);
    g2.computeBoundingSphere();
    return g2;
  }
  pose(cam) {
    if (!cam?.isPerspectiveCamera) return;
    const ctx = this.L.ctx, fr = ctx.clock?.frame ?? 0;
    if (this.lastCam === cam && this.lastFrame === fr && this.posed) return;
    this.lastCam = cam; this.lastFrame = fr; this.posed = true;
    const F = this.F, cp = cam.position;
    const dRoot = cp.distanceTo(F.root), dTip = cp.distanceTo(F.tip);
    const lim = (cam.far || 3000) * 0.86;
    const k = Math.min(1, lim / Math.max(dRoot, dTip, 1));
    const nearOn = k >= 0.999;
    this.near.visible = nearOn; this.far.visible = !nearOn;
    const o = nearOn ? this.near : this.far;
    o.position.set(cp.x + (F.root.x - cp.x) * k, cp.y + (F.root.y - cp.y) * k, cp.z + (F.root.z - cp.z) * k);
    o.scale.setScalar(k);
    o.updateMatrix(); o.matrixWorld.copy(o.matrix);
    if (!nearOn) {
      o.children?.forEach?.(c => c.updateMatrixWorld?.(true));
      // the silhouette's two tones, part-way toward the fog colour (the CPU fog estimate at the blade's middle)
      _c.lerpVectors(F.root, F.tip, 0.35);
      const fogCol = ctx.atmosphere?.fogUniforms?.uFogColor?.value;
      const f = Math.min(0.62, (ctx.atmosphere?.fogAmount?.(_c) ?? 0.5) * 0.5);
      if (fogCol) _fog.copy(fogCol); else _fog.set('#d4ab80');
      this.farSun.color.copy(_col.set('#f6e6c8').lerp(_fog, f));
      this.farShade.color.copy(_col.set('#8492ad').lerp(_fog, f * 1.1));
    } else {
      for (const c of o.children) c.updateMatrixWorld(true);
    }
  }
  dispose() {
    for (const o of [this.near, this.far]) { o.parent?.remove(o); o.traverse(c => c.geometry?.dispose?.()); }
    this.farSun.dispose(); this.farShade.dispose();
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ the shadow stripe
/** a convex polygon (counter-clockwise or not) → signed distance (negative inside) */
function convexSD(poly, x, z) {
  let inside = true, best = Infinity;
  const n = poly.length;
  // orientation
  let area = 0; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    const cross = (ex * (z - a[1]) - ez * (x - a[0])) * sgn;
    if (cross < 0) inside = false;
    // distance to the segment
    let t = ((x - a[0]) * ex + (z - a[1]) * ez) / (l * l); t = Math.max(0, Math.min(1, t));
    const dx = x - (a[0] + ex * t), dz = z - (a[1] + ez * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return inside ? -best : best;
}
function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

export class ShadowStripe {
  constructor(L) {
    this.L = L; const ctx = L.ctx, D = L.DATA.sundial, sun = L.DATA.sun;
    const ped = D.pedestal, gy = L.groundAt(ped.x, ped.z);
    const F = bladeFrame(ped, gy, D);
    const dir = [Math.sin((sun.azimuth + 180) * DEG), -Math.cos((sun.azimuth + 180) * DEG)];
    const k = 1 / Math.tan(sun.elevation * DEG);
    const shadowOf = (p) => [p.x + dir[0] * (p.y - gy) * k, p.z + dir[1] * (p.y - gy) * k];
    // the plinth's shadow: its top square swept along the sun direction (the convex hull of base and shadow)
    const h = PLINTH.h, half = PLINTH.base / 2, top = PLINTH.top / 2;
    const sq = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => [ped.x + x, ped.z + z]);
    const sqTop = [[-top, -top], [top, -top], [top, top], [-top, top]].map(([x, z]) => [ped.x + x + dir[0] * h * k, ped.z + z + dir[1] * h * k]);
    this.plinth = hull([...sq, ...sqTop]);
    // the blade's shadow: a trapezoid from the root's shadow to the shadow of the point 2 km out (clipped)
    const at = (t) => F.root.clone().lerp(F.tip, t);
    let tMax = 1;
    for (let t = 0.01; t <= 1; t += 0.01) { const s = shadowOf(at(t)); if (Math.hypot(s[0] - ped.x, s[1] - ped.z) > 2000) { tMax = t; break; } }
    const s0 = shadowOf(at(0)), s1 = shadowOf(at(tMax));
    const ax = [s1[0] - s0[0], s1[1] - s0[1]], al = Math.hypot(...ax), nx = -ax[1] / al, nz = ax[0] / al;
    // the shadow's width: the blade's cross-section seen along the sun (its widest extent), a little wider at the root
    const w0 = (F.rootW + 10) / 2, w1 = (F.rootW + (F.tipW - F.rootW) * tMax) / 2;
    this.blade = [[s0[0] + nx * w0, s0[1] + nz * w0], [s1[0] + nx * w1, s1[1] + nz * w1], [s1[0] - nx * w1, s1[1] - nz * w1], [s0[0] - nx * w0, s0[1] - nz * w0]];
    // the stripe's direction (the road the Wake follows, azimuth about 335°)
    this.az = ((Math.atan2(s1[0] - ped.x, -(s1[1] - ped.z)) / DEG) + 360) % 360;
    this.axis = { from: [ped.x, ped.z], to: s1 };
    this.build(ctx);
  }
  /** signed distance to the stripe's edge (negative inside) */
  sd(x, z) { return Math.min(convexSD(this.plinth, x, z), convexSD(this.blade, x, z)); }
  inShade(x, z, margin = 0) { return this.sd(x, z) <= -margin; }
  /** pull a point inside the stripe (toward the stripe's axis) until it is `margin` m inside */
  nudgeInside(x, z, margin = 10) {
    if (this.sd(x, z) <= -margin) return [x, z];
    const [ax, az] = this.axis.from, [bx, bz] = this.axis.to;
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = ((x - ax) * ex + (z - az) * ez) / l2; t = Math.max(0.02, Math.min(0.98, t));
    const cx = ax + ex * t, cz = az + ez * t;
    for (let k = 0.05; k <= 1.0001; k += 0.05) {
      const px = x + (cx - x) * k, pz = z + (cz - z) * k;
      if (this.sd(px, pz) <= -margin) return [px, pz];
    }
    return [cx, cz];
  }
  build(ctx) {
    const L = this.L;
    const cell = ctx.tier?.name === 'low' ? 16 : 8, soft = 18;
    const all = [...this.plinth, ...this.blade];
    const x0 = Math.min(...all.map(p => p[0])) - soft, x1 = Math.max(...all.map(p => p[0])) + soft;
    const z0 = Math.min(...all.map(p => p[1])) - soft, z1 = Math.max(...all.map(p => p[1])) + soft;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const pos = [], col = [], idx = [];
    const c0 = new THREE.Color('#5c6a86'), white = new THREE.Color(1, 1, 1), c = new THREE.Color();
    const vert = (i, j) => {
      const k = j * (nx + 1) + i;
      if (vid[k] >= 0) return vid[k];
      const x = x0 + i * cell, z = z0 + j * cell;
      const d = this.sd(x, z);
      const w = Math.max(0, Math.min(1, (soft * 0.5 - d) / soft));   // 1 well inside, 0 outside the soft edge
      c.copy(white).lerp(c0, w * w * (3 - 2 * w));
      vid[k] = pos.length / 3;
      pos.push(x, L.groundAt(x, z) + 0.3, z); col.push(c.r, c.g, c.b);
      return vid[k];
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const xm = x0 + (i + 0.5) * cell, zm = z0 + (j + 0.5) * cell;
      if (this.sd(xm, zm) > soft * 0.6 + cell) continue;
      const a = vert(i, j), b = vert(i + 1, j), cc = vert(i + 1, j + 1), d = vert(i, j + 1);
      idx.push(a, d, cc, a, cc, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false,
                                            premultipliedAlpha: true, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.userData.noAO = true;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'shadowStripe'; this.mesh.renderOrder = 1; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData.noAO = true;
    ctx.levelRoot.add(this.mesh);
    this.tris = idx.length / 3;
  }
  dispose() { this.mesh?.parent?.remove(this.mesh); this.mesh?.geometry?.dispose(); this.mesh?.material?.dispose(); }
}
