// levels/level02/actors.js — Level 2's scripted actors (L2 §10.5, §10.6, §10.8). None of them is an AI unit.
//
//  · Tick2: Level 1's Tick (levels/level01/actors.js) with a 'flank' mode: it drives the convoy flank nearest the frame
//    (convoy.flankPoint), and keeps behind Big Mercy otherwise.
//  · Kite2: Level 1's kite, following Tick or Big Mercy, and `up: 'stripe'` for the ending (straight up the Sundial's
//    shadow stripe to 600 m over 12 s).
//  · Watcher: a Striker frame in Dredge colours with a green beacon on its head, standing on the ridge shelf. It tracks
//    Moth with its head (±70°) and, on `leave`, turns and walks east over the crest at 6 m/s and is gone. Never fires,
//    never a target (shots spark off it), a 3 m circle the frame can't walk through.
//  · RuskSkimmer: the command Skimmer that launches from the Tally's stern during the capsize and runs north-west to the
//    skimmer ramp at 70 m/s, then out of the band. Not targetable.
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap } from '../../src/core/util.js';
import { buildMech, animateMech } from '../../src/art/mechs.js';
import { Tick, Kite } from '../level01/actors.js';
import { rig } from '../level01/models.js';
import { skimmerModel } from './models.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const DEG = Math.PI / 180;

// ════════════════════════════════════════════════════════════════════════════════ Tick (flank mode)
export class Tick2 extends Tick {
  command(a = {}) {
    if (a.flank) {
      if (!this.visible) {
        const C = this.L.convoy;
        if (C) { C.flankPoint(_v); this.place({ x: _v.x, z: _v.z }); }
      }
      this.setVisible(true);
      this.mode = 'flank'; this.path = null; this.follow = null;
      return;
    }
    super.command(a);
  }
  update(dt) {
    if (!this.visible) return;
    if (this.mode !== 'flank') { super.update(dt); return; }
    const C = this.L.convoy;
    if (!C) return;
    // the flank nearest the frame; while Big Mercy is taken, a safe spot behind the circle
    if (C.mode === 'circle') {
      const c = C.circleC || C.centre(_c);
      _v.set(c.x + 40, 0, c.z + 40);
    } else C.flankPoint(_v);
    const dx = _v.x - this.pos.x, dz = _v.z - this.pos.z, d = Math.hypot(dx, dz);
    const want = d < 6 ? Math.max(0, C.v) : clamp(d * 0.3 + C.v, 4, 22);
    this.speed = damp(this.speed, want, 1.5, dt);
    if (d > 2) {
      this.yaw = dampAng(this.yaw, yawTo(dx, dz), 2.2, dt);
      const step = Math.min(d, this.speed * dt);
      this.pos.x += -Math.sin(this.yaw) * step; this.pos.z += -Math.cos(this.yaw) * step;
    } else this.yaw = dampAng(this.yaw, C.route.yawAt(C.s), 1.5, dt);
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
  }
}

// ════════════════════════════════════════════════════════════════════════════════ the kite
export class Kite2 extends Kite {
  reset() { super.reset(); this.upT = null; }
  anchor(out) {
    const L = this.L;
    if (this.follow === 'bigMercy') {
      const bm = L.convoy?.byId?.get(3);
      if (bm && bm.state !== 'gone') { out.copy(bm.pos); return out; }
      if (L.tally?.alive) { out.copy(L.tally.pos); return out; }
    }
    return super.anchor(out);
  }
  command(a = {}) {
    if (a.up) {
      // straight up the shadow stripe (the ending): from where it is now to `h` m over the stripe, 450 m along it
      const S = this.L.stripe;
      const from = this.pos.clone();
      let to;
      if (S) {
        const [ax, az] = S.axis.from, [bx, bz] = S.axis.to, l = Math.hypot(bx - ax, bz - az) || 1;
        const t = clamp(((from.x - ax) * (bx - ax) + (from.z - az) * (bz - az)) / (l * l), 0, 1);
        const along = Math.min(1, t + 450 / l);
        to = new THREE.Vector3(ax + (bx - ax) * along, 0, az + (bz - az) * along);
      } else to = from.clone().add(_v.set(-200, 0, -400));
      to.y = this.L.groundAt(to.x, to.z) + (a.h ?? 600);
      this.upT = { t: 0, dur: a.seconds ?? 12, from, to };
      this.setVisible(true); this.landing = false;
      return;
    }
    this.upT = null;
    super.command(a);
  }
  update(dt, t) {
    if (!this.visible) return;
    const U = this.upT;
    if (!U) { super.update(dt, t); return; }
    U.t += dt;
    const k = clamp(U.t / U.dur, 0, 1), e = k * k * (3 - 2 * k);
    const prev = _w.copy(this.pos);
    this.pos.lerpVectors(U.from, U.to, e);
    this.pos.x += Math.sin(t * 0.7) * 6 * (1 - k); this.pos.z += Math.cos(t * 0.5) * 4 * (1 - k);
    if (dt > 0) this.vel.subVectors(this.pos, prev).multiplyScalar(1 / dt);
  }
}

// ════════════════════════════════════════════════════════════════════════════════ the Watcher
export class Watcher {
  constructor(L) {
    this.L = L;
    this.root = null; this.ac = null;
    this.state = 'off'; this.pos = new THREE.Vector3(); this.yaw = 0; this.isWatcher = true;
    this.gone = false; this.leaveAt = null; this.headYaw = 0;
  }
  build() {
    if (this.ac) return;
    const ctx = this.L.ctx;
    // the prototype Striker in Dredge colours, scarred (L2 §10.5); no weapons drawn, arms hanging
    const ac = buildMech(ctx, { design: 'striker', base: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', visor: '#a8ff9e', dark: '#141211', wear: 0.8 },
                         { shadows: true });
    this.ac = ac;
    this.root = ac.root;
    this.root.name = 'l02:watcher';
    for (const k of ['R', 'L']) { const g = ac.arms?.[k]?.gun || ac.arms?.[k]?.weapon; if (g) g.visible = false; }
    if (ac.blade) ac.blade.visible = false;
    ac.noBlade = true;
    // the green beacon on its head: a lens and a beat glow, readable at 800 m (≥ 4 px)
    const M = ctx.materials;
    const lensMat = M?.get?.('lightGhost') || new THREE.MeshBasicMaterial({ color: '#a8ff9e' });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), lensMat);
    lens.position.set(0, 0.55, -0.85); lens.castShadow = false;
    ac.head.add(lens);
    this.lens = lens;
    const at = new THREE.Object3D(); at.position.set(0, 0.55, -1.0); ac.head.add(at);
    this.glow = ctx.particles?.glows?.add?.(at, { color: '#a8ff9e', size: 1.6, intensity: 6, pulse: 'beat', minPx: 4 }) || null;
    this.root.visible = false;
    ctx.levelRoot.add(this.root);
  }
  appear() {
    const L = this.L, D = L.DATA.watcher;
    this.build();
    L.ctx.world.resolve(D.at, this.pos);
    this.pos.y = L.groundAt(this.pos.x, this.pos.z);
    // facing the convoy (the road below, to the west)
    const c = L.convoy ? L.convoy.centre(_c) : this.pos;
    this.yaw = yawTo(c.x - this.pos.x, c.z - this.pos.z);
    this.state = 'stand'; this.gone = false; this.leaveAt = null; this.walkT = 0;
    this.root.visible = true;
    this.shotsNear = 0;
    L.setFlag('l02:watcher', 'stand');
  }
  /** leave after `sec` seconds (or now) */
  leaveAfter(sec) { if (this.state === 'stand') this.leaveAt = this.L.ctx.clock.time + Math.max(0, sec); }
  leave() {
    if (this.state !== 'stand') return;
    this.state = 'turn'; this.turnT = 0;
    this.yawFrom = this.yaw;
    this.yawTo = yawTo(1, 0.15);          // east, over the crest
  }
  hide() {
    this.state = 'off'; this.gone = true;
    if (this.root) this.root.visible = false;
    this.L.setFlag('l02:watcher', 'gone');
  }
  reset() {
    this.state = 'off'; this.gone = false; this.leaveAt = null;
    if (this.root) this.root.visible = false;
    const f = this.L.flag('l02:watcher');
    if (f === 'gone') this.gone = true;
  }
  update(dt) {
    if (this.state === 'off' || !this.ac) return;
    const L = this.L, ctx = L.ctx, p = L.player();
    if (this.state === 'stand') {
      // leave at once when Moth comes within 250 m or shoots within 30 m of it
      let leave = this.leaveAt != null && ctx.clock.time >= this.leaveAt;
      if (p && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 250) leave = true;
      ctx.projectiles?.forEach?.((pr) => {
        if (pr.team === 'player' && pr.pos.distanceToSquared(_w.set(this.pos.x, this.pos.y + 6, this.pos.z)) < 900) {
          this.shotsNear++;
          if (pr.pos.distanceToSquared(_w) < 16) { ctx.fx?.sparks?.(pr.pos, 10, [1, 0.85, 0.5], 16); pr.alive = false; }
        }
      });
      if (this.shotsNear > 0) leave = true;
      if (leave) this.leave();
    } else if (this.state === 'turn') {
      this.turnT += dt;
      const k = clamp(this.turnT / 1.6, 0, 1);
      this.yaw = this.yawFrom + angWrap(this.yawTo - this.yawFrom) * k;
      if (k >= 1) { this.state = 'walk'; this.walkT = 0; }
    } else if (this.state === 'walk') {
      this.walkT += dt;
      this.pos.x += -Math.sin(this.yaw) * 6 * dt; this.pos.z += -Math.cos(this.yaw) * 6 * dt;
      this.pos.y = L.groundAt(this.pos.x, this.pos.z);
      // out of sight behind the crest (the ridge falls away to the east), or 30 s of walking at most
      const d = p ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : 0;
      if (this.walkT > 30 || (this.walkT > 12 && d > 420)) this.hide();
    }
    // the frame can't walk through it (a 3 m circle)
    if (p && this.state !== 'off') {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dd = Math.hypot(dx, dz), R = 3 + (p.rad || 2.6);
      if (dd < R && dd > 1e-3 && p.pos.y < this.pos.y + 10) { p.pos.x = this.pos.x + dx / dd * R; p.pos.z = this.pos.z + dz / dd * R; }
    }
  }
  draw(dt) {
    if (this.state === 'off' || !this.ac) return;
    const L = this.L, p = L.player();
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    // the head follows Moth (yaw limit 70°)
    let hy = 0;
    if (p && this.state === 'stand') hy = clamp(angWrap(yawTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw), -70 * DEG, 70 * DEG);
    this.headYaw = damp(this.headYaw, hy, 2, dt);
    const walking = this.state === 'walk';
    try { animateMech(this.ac, { fwd: walking ? 6 : 0, lat: 0, onGround: true, pitch: -0.05, thrust: 0, hover: 0, landT: 0 }, Math.max(dt, 1 / 120)); }
    catch (e) { /* the pose is cosmetic */ }
    this.ac.head.rotation.y = this.headYaw;
    // a stride for the walk (the legs swing with a sine)
    if (walking && this.ac.legs) {
      const ph = this.walkT * 6 * 0.55;
      for (const leg of this.ac.legs) leg.hip.rotation.x += Math.sin(ph + (leg.side > 0 ? 0 : Math.PI)) * 0.35;
    }
    this.root.updateMatrixWorld(true);
  }
  dispose() { this.glow?.remove?.(); this.root?.parent?.remove(this.root); }
}

// ════════════════════════════════════════════════════════════════════════════════ Rusk's command Skimmer
export class RuskSkimmer {
  constructor(L) {
    this.L = L; this.root = null; this.active = false; this.pos = new THREE.Vector3(); this.yaw = 0; this.t = 0;
  }
  build() {
    if (this.root) return;
    const ctx = this.L.ctx;
    const r = rig(ctx, skimmerModel(ctx, { command: true }));
    this.root = r.root; this.parts = r.parts;
    this.root.scale.setScalar(1.15);
    this.root.visible = false;
    ctx.levelRoot.add(this.root);
    // the tungsten-lit cab (Rusk is alive) and the jets
    const G = ctx.particles?.glows;
    if (G?.add) {
      const cab = new THREE.Object3D(); cab.position.set(0, 1.6, -1.2); this.root.add(cab);
      this.cabGlow = G.add(cab, { color: '#ffb36b', size: 1.4, intensity: 3, minPx: 3, pulse: 'none' });
    }
  }
  /** launch from the Tally's stern (or from a point) toward the ramp, then out to the north-west */
  flee(from) {
    const L = this.L, D = L.DATA;
    this.build();
    this.pos.copy(from);
    this.pos.y = L.groundAt(from.x, from.z) + 3;
    const ramp = L.ctx.world.resolve(D.ramp, new THREE.Vector3());
    const out = ramp.clone().add(_v.set(-1400, 0, -900));
    this.path = [ramp, out];
    this.pi = 0; this.speed = 20; this.t = 0;
    this.yaw = yawTo(ramp.x - this.pos.x, ramp.z - this.pos.z);
    this.active = true; this.root.visible = true;
    L.ctx.audio?.play?.('boost', this.pos);
    L.setFlag('l02:ruskFled', true);
  }
  reset() { this.active = false; if (this.root) this.root.visible = false; }
  update(dt) {
    if (!this.active || dt <= 0) return;
    const L = this.L, ctx = L.ctx;
    this.t += dt;
    this.speed = damp(this.speed, 70, 1.2, dt);
    const tgt = this.path[this.pi];
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 25) { this.pi++; if (this.pi >= this.path.length) { this.reset(); return; } }
    this.yaw = dampAng(this.yaw, yawTo(dx, dz), 2.5, dt);
    this.pos.x += -Math.sin(this.yaw) * this.speed * dt; this.pos.z += -Math.cos(this.yaw) * this.speed * dt;
    this.pos.y = damp(this.pos.y, L.groundAt(this.pos.x, this.pos.z) + 3, 6, dt);
    // its exhaust leaves a dust trail
    this.dustT = (this.dustT ?? 0) - dt;
    if (this.dustT <= 0) { this.dustT = 0.08; ctx.fx?.dust?.(_w.set(this.pos.x, this.pos.y - 2.5, this.pos.z), 3, 6, [0.95, 0.9, 0.82]); }
    if (this.t > 40) this.reset();
  }
  draw(dt, t) {
    if (!this.active) return;
    this.root.position.copy(this.pos);
    this.root.rotation.set(-0.06, this.yaw, Math.sin(t * 3) * 0.04);
    this.root.updateMatrixWorld(true);
  }
  dispose() { this.cabGlow?.remove?.(); this.root?.parent?.remove(this.root); }
}
