// levels/level02/skyline.js — what moves on Level 2's horizon (L2 §2.7, §6 E4): level-owned, because each must sit where
// the gameplay says it is.
//
//  · FarSails: six raider sails (two on Low) on slow arcs 1.5 to 3 km out round the convoy, each with a dust plume.
//    They never come in: the steppe is watched. Single small meshes, fog-patched, posed inside the camera's far plane.
//  · TallySkyline: the Tally on the far flats at (−1,900, −1,500), sails up (its merged LOD1), shown from `c_kite` to the
//    harpoon. It eases toward its spawn point after the volleys. Muzzle flashes on its battery when a volley launches.
//  · Volleys: the rocket volleys (E4) and the Tally's own battery during the drag. Eight rockets per volley: four aimed
//    at the frame (a final homing correction of 20°/s in the last 1.8 s), four bracketing it at 15 to 30 m; 75 m/s on a
//    ballistic arc over 6 s; 420 dmg, 300 imp, splash 8 m (half damage); a ground ring under each. They can't be shot
//    down and never hit rigs (rigs aren't combat targets). `landed(n)` tells the mission when volley n is down.
// All gameplay state here runs on sim time and ctx.random (deterministic); the dust and flashes are cosmetic.
import * as THREE from 'three';
import { clamp, damp, yawTo } from '../../src/core/util.js';
import { mats2 } from './kit2.js';
import { tallyLodGeo } from './tally.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();

/** pose an object at a world point, pulled inside the camera's far plane (scaled about the camera) when it is beyond */
function farPose(o, cam, at, base = 1) {
  if (!cam?.isPerspectiveCamera) return;
  const cp = cam.position, d = cp.distanceTo(at);
  const lim = (cam.far || 3000) * 0.88;
  const k = d > lim ? lim / d : 1;
  o.position.set(cp.x + (at.x - cp.x) * k, cp.y + (at.y - cp.y) * k, cp.z + (at.z - cp.z) * k);
  o.scale.setScalar(base * k);
  o.updateMatrix(); o.matrixWorld.copy(o.matrix);
  for (const c of o.children) c.updateMatrixWorld(true);
}

// ════════════════════════════════════════════════════════════════════════════════ far sails
let SAIL_GEO = null;
function sailGeo() {
  if (SAIL_GEO) return SAIL_GEO;
  // a land-yacht at a glance: a dark plank hull, a mast and a tall rust lateen sail (two triangles, double-sided)
  const P = [], C = [], I = [];
  const hull = new THREE.Color('#2a2422'), sail = new THREE.Color('#8a3a22'), mast = new THREE.Color('#3a3330');
  const quad = (a, b, c, d, col) => { const i = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let k = 0; k < 4; k++) C.push(col.r, col.g, col.b); I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
  const tri = (a, b, c, col) => { const i = P.length / 3; P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) C.push(col.r, col.g, col.b); I.push(i, i + 1, i + 2); };
  quad([-6, 0.6, 0], [6, 0.6, 0], [5, 2.0, 0], [-5.5, 2.0, 0], hull);
  quad([0, 0.6, -1.2], [0, 0.6, 1.2], [0, 2.0, 1.0], [0, 2.0, -1.0], hull);
  quad([-0.25, 2, 0], [0.25, 2, 0], [0.18, 15, 0], [-0.18, 15, 0], mast);
  tri([0.3, 2.6, 0.05], [0.3, 14.5, 0.05], [7.5, 3.0, 0.05], sail);
  tri([-0.3, 3.0, -0.05], [-0.3, 12.5, -0.05], [-5.0, 3.2, -0.05], sail);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
  g.userData.shared = true;
  SAIL_GEO = g;
  return g;
}

export class FarSails {
  constructor(L) {
    this.L = L; const ctx = L.ctx, D = L.DATA.far;
    const low = ctx.tier?.name === 'low' || ctx.settings?.quality === 'low';
    const n = low ? D.lowSails : D.sails;
    let mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
    if (ctx.atmosphere?.patchMaterial) mat = ctx.atmosphere.patchMaterial(mat) || mat;
    this.mat = mat;
    this.sails = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(sailGeo(), mat);
      o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = false; o.frustumCulled = false;
      o.name = 'l02:farSail';
      const s = {
        o, a: (i / n) * Math.PI * 2 + rnd() * 0.6, r: D.ring[0] + rnd() * (D.ring[1] - D.ring[0]),
        w: (0.006 + rnd() * 0.006) * (rnd() < 0.5 ? -1 : 1), at: new THREE.Vector3(), dustT: rnd() * 2, yaw: 0, scale: 1.4 + rnd() * 0.5,
      };
      o.onBeforeRender = (r, sc, cam) => farPose(o, cam, s.at, s.scale);
      ctx.levelRoot.add(o);
      this.sails.push(s);
    }
    this.visible = true;
  }
  set(on) { this.visible = !!on; for (const s of this.sails) s.o.visible = this.visible; }
  update(dt) {
    const L = this.L, C = L.convoy;
    if (!C || !this.visible) return;
    const c = C.centre(_c);
    for (const s of this.sails) {
      s.a += s.w * dt;
      const x = c.x + Math.sin(s.a) * s.r, z = c.z - Math.cos(s.a) * s.r;
      s.at.set(x, L.groundAt(x, z), z);
      s.yaw = s.a + (s.w > 0 ? Math.PI / 2 : -Math.PI / 2);
      s.o.rotation.set(0, s.yaw, 0);
      s.o.quaternion.setFromEuler(s.o.rotation);
      s.dustT -= dt;
      if (s.dustT <= 0) { s.dustT = 0.7; L.ctx.fx?.dust?.(_v.set(x, s.at.y + 1, z), 6, 14, [0.86, 0.72, 0.55]); }
    }
  }
  dispose() { for (const s of this.sails) s.o.parent?.remove(s.o); this.mat.dispose(); }
}

// ════════════════════════════════════════════════════════════════════════════════ the Tally on the horizon
export class TallySkyline {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    this.root = new THREE.Group(); this.root.name = 'l02:tallySkyline';
    this.root.matrixAutoUpdate = false; this.root.frustumCulled = false;
    const mesh = new THREE.Mesh(tallyLodGeo(ctx), mats2(ctx).lod);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = true;
    this.root.add(mesh);
    this.mesh = mesh;
    mesh.onBeforeRender = (r, s, cam) => farPose(this.root, cam, this.at, 1);
    this.at = new THREE.Vector3();
    this.yaw = 0;
    this.root.visible = false;
    ctx.levelRoot.add(this.root);
    // the battery's flash points (a volley launch)
    this.flashes = [];
    this.flashT = 0;
    this.reset();
  }
  reset() {
    const L = this.L, D = L.DATA.tally;
    this.at.set(D.skyline[0], L.groundAt(D.skyline[0], D.skyline[1]), D.skyline[1]);
    this.yaw = yawTo(D.spawn[0] - D.skyline[0], D.spawn[1] - D.skyline[1]) + Math.PI / 2;
    this.moving = false;
    this.show(!!L.flag('l02:tallySky'));
  }
  show(on) {
    this.visible = !!on; this.root.visible = this.visible;
    this.L.setFlag('l02:tallySky', this.visible);
  }
  /** after the volleys: it turns and comes on (toward its spawn, 6 m/s) */
  come() { this.moving = true; }
  flash() {
    if (!this.visible) return;
    const G = this.L.ctx.particles?.glows;
    if (!G?.add) return;
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Object3D(); o.position.set((i - 1) * 6, 22, -18); this.root.add(o);
      const h = G.add(o, { color: '#ffd28a', size: 9, intensity: 5, minPx: 4, pulse: 'none' });
      this.flashes.push({ o, h, t: 0.5 + i * 0.1 });
    }
  }
  update(dt) {
    if (!this.visible) return;
    const L = this.L, D = L.DATA.tally;
    if (this.moving) {
      const dx = D.spawn[0] - this.at.x, dz = D.spawn[1] - this.at.z, d = Math.hypot(dx, dz);
      if (d > 5) { this.at.x += dx / d * 6 * dt; this.at.z += dz / d * 6 * dt; this.at.y = L.groundAt(this.at.x, this.at.z); }
      this.yaw = yawTo(dx, dz);
    }
    this.mesh.rotation.set(0, this.yaw, 0);
    for (const f of this.flashes.slice()) {
      f.t -= dt;
      if (f.t <= 0) { f.h?.remove?.(); f.o.parent?.remove(f.o); this.flashes.splice(this.flashes.indexOf(f), 1); }
    }
  }
  dispose() { for (const f of this.flashes) f.h?.remove?.(); this.root.parent?.remove(this.root); }
}

// ════════════════════════════════════════════════════════════════════════════════ the rocket volleys
export class Volleys {
  constructor(L) { this.L = L; this.sets = new Map(); this.fired = 0; }
  reset() {
    this.sets.clear();
    // a snapshot restart: volleys already down stay down
    for (const n of this.L.flag('l02:volleysLanded') || []) this.sets.set(n, { landed: true, list: [], planned: 0 });
  }
  /**
   * fire volley n: { freeSight, count, from, local }. `local`: from the given launcher (the Tally's battery during the
   * drag) on a short arc; otherwise from the skyline Tally's bearing, arcing in from 450 m out over 6 s.
   */
  fire(n, o = {}) {
    const L = this.L, ctx = L.ctx, P = ctx.projectiles, p = L.player();
    if (!P?.fire || !p) { this.sets.set(n, { landed: true, list: [], planned: 0 }); this.markLanded(n); return; }
    const D = L.DATA.volley;
    const count = o.count ?? D.count;
    const set = { list: [], planned: count, landed: false, t0: ctx.clock.time };
    this.sets.set(n, set);
    const g = 18;
    const T = o.local ? null : 6;
    const sky = L.skyline?.at || new THREE.Vector3(L.DATA.tally.skyline[0], 0, L.DATA.tally.skyline[1]);
    // the targets: half aimed at the frame, the rest bracketing it 15 to 30 m out
    const aimed = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      ctx.timers.after(i * 0.14, () => {
        const pl = L.player(); if (!pl) { set.planned--; return; }
        const tgt = pl.pos.clone();
        const isAimed = i < aimed;
        if (!isAimed) { const a = ctx.random() * Math.PI * 2, r = 15 + ctx.random() * 15; tgt.x += Math.cos(a) * r; tgt.z += Math.sin(a) * r; }
        tgt.y = L.groundAt(tgt.x, tgt.z);
        let from, flight;
        if (o.local && o.from) {
          from = o.from.clone().add(_v.set((ctx.random() - 0.5) * 3, 2, (ctx.random() - 0.5) * 3));
          flight = clamp(from.distanceTo(tgt) / D.speed, 2.2, 6);
        } else {
          const dx = sky.x - pl.pos.x, dz = sky.z - pl.pos.z, dl = Math.hypot(dx, dz) || 1;
          const back = D.speed * T * 0.95;
          from = new THREE.Vector3(pl.pos.x + dx / dl * back + (ctx.random() - 0.5) * 40, 0, pl.pos.z + dz / dl * back + (ctx.random() - 0.5) * 40);
          from.y = L.groundAt(from.x, from.z) + 60 + ctx.random() * 20;
          flight = T;
        }
        const vel = new THREE.Vector3((tgt.x - from.x) / flight, (tgt.y - from.y) / flight + 0.5 * g * flight, (tgt.z - from.z) / flight);
        const pr = P.fire({ kind: 'missile', pos: from, vel, team: 'enemy', owner: null, dmg: D.dmg, imp: D.imp, splash: D.splash,
                            splashDmg: D.dmg * 0.5, splashImp: D.imp * 0.5, gravity: g, life: flight + 3, srcKind: 'rocket', scale: 1.2 });
        if (pr) set.list.push({ p: pr, serial: pr.serial, aimed: isAimed, flight, born: ctx.clock.time });
        P.groundWarning?.(tgt, D.splash, flight);
        if (i === 0) { ctx.audio?.play?.('missile', from, { vol: 0.8 }); L.skyline?.flash?.(); }
      });
    }
    this.fired++;
    if (o.freeSight && typeof ctx.sync?.free === 'function') { try { ctx.sync.free('sight'); } catch (e) { ctx.recordError?.('level02', e); } }
  }
  /** the final homing correction (20°/s) for the aimed rockets in their last 1.8 s */
  update(dt) {
    const L = this.L, ctx = L.ctx, p = L.player();
    for (const [n, set] of this.sets) {
      if (set.landed) continue;
      let alive = 0;
      for (const r of set.list) {
        if (!r.p.alive || r.p.serial !== r.serial) continue;
        alive++;
        if (r.aimed && p && r.p.age >= r.flight - 1.8 && !r.homing) { r.homing = true; r.p.target = p; r.p.turn = 0.35; }
      }
      if (set.list.length >= set.planned && alive === 0) { set.landed = true; this.markLanded(n); }
      else if (ctx.clock.time - set.t0 > 15) { set.landed = true; this.markLanded(n); }    // never stuck
    }
  }
  markLanded(n) {
    const l = new Set(this.L.flag('l02:volleysLanded') || []); l.add(n);
    this.L.setFlag('l02:volleysLanded', [...l]);
    this.L.ctx.events.emit('l02:volleyLanded', { n });
  }
  landed(n) { return !!this.sets.get(n)?.landed || (this.L.flag('l02:volleysLanded') || []).includes(n); }
}
