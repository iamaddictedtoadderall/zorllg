// levels/level02/units.js — Level 2's raider kinds (L2 §10), registered with ctx.enemies from custom.install:
//  · land_yacht: a raider sail-boat on wheels. Stalks hidden in the reeds with its mast down (a travelling V in the reeds
//    is the only tell), breaks cover with a sail snap, then rakes ('raker') or hooks a named rig ('hooker'). Flees at
//    15 % AP. Sail-Rig haul (plain glint).
//  · harpooner: a slow Dredge gun-walker (the prototype walker at 0.75 scale) with a cable gun on a back mount. Waits
//    behind its cover until the convoy's front passes, steps out, braces (1.2 s wind-up) and winches a rig in; its rivet
//    gun fires at the frame. Rivet Driver haul (heavy: a TEAR rips the rivet gun off, the walker lives).
//  · skimmer: a ghost-run Dredge hover-sled (pale green beacon). Strafing runs at the frame, missile passes over the
//    convoy (air bursts, near misses), homing missiles at the frame. Skate-Jets haul (hungry: the engine colours it,
//    addendum 02 E8).
// Every kind honours blindT and slowT (speedScale, A2 E4; treated as 1 until the engine has it), sets `windup` while
// telegraphing (Second Sight flashes it), and never overwrites a pos moved from outside (heldT).
import * as THREE from 'three';
import { Unit } from '../../src/actors/enemy.js';
import { buildUnit, animateUnit } from '../../src/art/units.js';
import { clamp, damp, dampAng, yawTo, angWrap } from '../../src/core/util.js';
import { rig, flat } from '../level01/models.js';
import { glowSprite, setGlowSize, disposeGlow } from '../level01/actors.js';
import { cached, instance, mats2, Builder, PI } from './kit2.js';
import { yachtModel, skimmerModel, harpoonerExtras } from './models.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();

/** helpers on top of the engine's Unit */
class L2Unit extends Unit {
  constructor(ctx, o, L) {
    super(ctx, o);
    this.L = L;
    this.windup = 0;
    if (!('slowT' in this)) this.slowT = 0;
    this.alwaysActive = true;
    this.config = o.config || this.config || {};
    this.bornT = ctx.clock.time;
  }
  /** the engine's slow (A2 E4) when it exists: 0.8 while slowT > 0 */
  speedK() { return typeof this.speedScale === 'number' ? this.speedScale : 1; }
  shoot(spec) { spec.team = this.team; spec.owner = this; return this.ctx.projectiles?.fire?.(spec); }
  blind() { return (this.blindT || 0) > 0; }
  stag() { return (this.stagT || 0) > 0; }
  player() { const p = this.ctx.player; return p?.active && p.alive ? p : null; }
  ground(x = this.pos.x, z = this.pos.z) { return this.L.groundAt(x, z); }
  setHaulL2(part, glint, heavy) {
    if (!part) return;
    const h = { part, glint, ...(heavy !== undefined ? { heavy } : {}) };
    if (this.setHaul) this.setHaul(h); else this.haul = { ...h, heavy: heavy ?? (this.impMax > 1000), taken: false };
  }
  /** the TEAR guarantee unit (L2 §6 E1): staggers on the first player hit; a kill before the TEAR leaves it at 1 AP */
  guarantee(info) {
    if (!this.config?.staggerOnFirstHit) return;
    if (!this.firstHit && info?.source?.team === 'player' && this.alive && !(this.stagT > 0) && !info.killed) {
      this.firstHit = true; this.stagT = this.stagDur; this.imp = 0; info.staggered = true;
      this.ctx.fx?.sparks?.(this.pos, 14, [1, 0.8, 0.4], 18); this.ctx.audio?.play?.('stagger', this.pos);
    }
    if (info?.killed && this.haul && !this.haul.taken && info.source?.team === 'player' && info.source?.kind !== 'tear') {
      info.killed = false; this.ap = 1; this.alive = true; this.stagT = Math.max(this.stagT || 0, this.stagDur); this.imp = 0;
    }
  }
  /** steer away from rigs ahead (rigs are not colliders, L2 §4.1) */
  rigAvoid(yaw) {
    const C = this.L.convoy; if (!C) return 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let turn = 0;
    for (const r of C.rigs) {
      if (r.state === 'gone') continue;
      const dx = r.pos.x - this.pos.x, dz = r.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 40 || d < 1) continue;
      const ahead = (dx * fx + dz * fz) / d;
      if (ahead < 0.55) continue;
      const side = dx * -fz + dz * fx;   // > 0: the rig is to the right
      turn += side > 0 ? -1 : 1;
    }
    return turn;
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ land-yacht (L2 §10.1)
const LY = { ap: 1800, impMax: 800, stag: 2.4, stalk: 20, cruise: 38, attack: 50, turn: 1.0, accel: 16, tow: 6 };
export class LandYacht extends L2Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'land_yacht', name: o.name || 'LAND-YACHT', pos, apMax: LY.ap, impMax: LY.impMax, stagDur: LY.stag, hitR: 4.8, hitY: 3,
                 rad: 5, hgt: 6, faction: 'dredge', config: { ...cfg, haul: undefined } }, L);
    this.config = cfg;
    this.variant = cfg.variant === 'hooker' ? 'hooker' : 'raker';
    if (cfg.haul) this.setHaulL2(cfg.haul, [0, 5.4, 2.2], false);
    const r = rig(ctx, yachtModel(ctx, this.variant));
    this.model = r.root; this.parts = r.parts;
    this.tilt = new THREE.Group(); this.tilt.add(this.model); this.root.add(this.tilt);
    this.muzzle = r.parts.gun.getObjectByName('muzzle');
    this.tele = glowSprite('#ff4a2a', 3.4, 0.9); this.tele.visible = false; this.parts.gun.add(this.tele); this.tele.position.set(0, 0.6, -3.6);
    this.speed = 0; this.yaw = o.yaw ?? 0; this.cd = 2 + ctx.random() * 2;
    this.stalking = !!cfg.stalk;
    this.mastK = this.stalking ? 0 : 1;
    if (this.stalking) this.targetable = false;
    this.side = Math.sign(ctx.world.route.closest(pos.x, pos.z).l) || -1;
    this.ai = { phase: 'out', wp: null, t: 0, burst: 0, burstT: 0, tele: 0, rehook: 0, rig: null };
    this.mode = this.stalking ? 'stalk' : (this.variant === 'hooker' ? 'hook' : 'rake');
    this.harpoon = null;
    this.onFloor();
    this.yaw = yawTo(-this.side * 1, 0);   // a first heading toward the road
  }
  onFloor() { this.pos.y = this.ground(); }
  steer(dt, tx, tz, want) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    let tyaw = yawTo(dx, dz);
    const C = this.ctx.collision;
    if (C && (this.ai.whT = (this.ai.whT ?? 0) - dt) <= 0) {
      this.ai.whT = 0.25; this.ai.avoid = 0;
      for (const [k, side] of [[0, 0], [0.45, 1], [-0.45, -1]]) {
        const a = this.yaw + k, fx = -Math.sin(a), fz = -Math.cos(a);
        _v.set(this.pos.x, this.pos.y + 3, this.pos.z); _w.set(this.pos.x + fx * 34, this.pos.y + 3, this.pos.z + fz * 34);
        const hit = C.segment(_v, _w, undefined, { ground: true, colliders: true, radius: 0 });
        if (hit) this.ai.avoid += side === 0 ? (this.ai.lastSide || 1) * 1.2 : -side;
      }
      this.ai.avoid += this.rigAvoid(this.yaw) * 1.5;
      if (this.ai.avoid) this.ai.lastSide = Math.sign(this.ai.avoid);
    }
    if (this.ai.avoid) tyaw = this.yaw + Math.sign(this.ai.avoid) * 1.0;
    const turn = LY.turn * dt * (0.4 + 0.6 * Math.min(1, this.speed / 20));
    this.yaw = angWrap(this.yaw + clamp(angWrap(tyaw - this.yaw), -turn, turn));
    const vmax = want * this.speedK();
    this.speed += clamp(vmax - this.speed, -LY.accel * dt * 1.5, LY.accel * dt);
  }
  move(dt) {
    if (this.heldT > 0) { this.onFloor(); return; }
    this.vel.set(-Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.ctx.collision?.resolve?.(this);
    this.keepInPlayArea?.();
    this.onFloor();
  }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const p = this.player(), ai = this.ai, L = this.L;
    ai.t += dt; this.cd -= dt;
    this.target = p;
    // the mast: snaps up in 0.6 s when it breaks cover
    this.mastK = this.stalking ? 0 : Math.min(1, this.mastK + dt / 0.6);
    if (this.ap < this.apMax * 0.15 && this.mode !== 'flee' && !this.config.staggerOnFirstHit) { this.mode = 'flee'; this.cancelTele(); this.endTow(); }
    if (this.stag()) { this.speed = damp(this.speed, 0, 1.2, dt); this.cancelTele(); this.move(dt); return; }
    if (this.blind()) { const a = this.drift ? this.drift(dt) : this.yaw; this.steer(dt, this.pos.x - Math.sin(a) * 50, this.pos.z - Math.cos(a) * 50, 14); this.cancelTele(); this.move(dt); return; }
    switch (this.mode) {
      case 'stalk': this.updateStalk(dt, p); break;
      case 'hook': this.updateHook(dt, p); break;
      case 'tow': this.updateTow(dt); break;
      case 'flee': {
        const c = L.convoy?.centre(_c) || (p ? p.pos : this.pos);
        this.steer(dt, this.pos.x + (this.pos.x - c.x), this.pos.z + (this.pos.z - c.z), LY.attack);
        if (Math.hypot(this.pos.x - c.x, this.pos.z - c.z) > 900) { this.fled = true; this.removeMe = true; }
        break;
      }
      default: this.updateRake(dt, p);
    }
    if (this.mode === 'rake' && this.variant === 'hooker' && (ai.rehook -= dt) <= 0) this.mode = 'hook';
    this.updateWeapons(dt, p);
    this.move(dt);
  }
  // ── stalking in the reeds, then breaking cover ──
  updateStalk(dt, p) {
    const C = this.L.convoy;
    const flank = C ? C.route.toWorld(clamp(C.s + 20, 0, C.route.length), this.side * 60, _v) : (p ? p.pos : this.pos);
    this.steer(dt, flank.x, flank.z, LY.stalk);
    const nearRig = C ? C.near(this.pos, 1)[0]?.d ?? Infinity : Infinity;
    const shotAt = this.lastHit > this.bornT || this.ctx.projectiles?.incoming?.(this, 260);
    if (nearRig < 220 || (p && p.pos.distanceTo(this.pos) < 150) || shotAt) this.breakCover();
  }
  breakCover() {
    if (!this.stalking) return;
    this.stalking = false; this.targetable = true;
    this.mode = this.variant === 'hooker' ? 'hook' : 'rake';
    this.ctx.audio?.play?.('sailSnap', this.pos);
    this.ctx.fx?.dust?.(this.pos, 12, 8);
    this.L.counters.brokeCover = (this.L.counters.brokeCover || 0) + 1;
    this.ctx.events.emit('l02:brokeCover', { unit: this });
  }
  onDamage(info) {
    if (this.stalking && info?.source?.team === 'player') this.breakCover();
    this.guarantee(info);
    super.onDamage?.(info);
  }
  // ── rake runs (L1 skiff style, faster) at the frame or, 40 % of runs, a rig ──
  updateRake(dt, p) {
    const ai = this.ai, C = this.L.convoy;
    if (!ai.tgt || ai.phase === 'pick') {
      const rigT = C && this.ctx.random() < 0.4 ? C.near(this.pos, 4)[Math.floor(this.ctx.random() * 3)]?.r : null;
      ai.tgt = rigT ? { pos: rigT.pos, rig: rigT } : p ? { pos: p.pos } : null;
      ai.phase = 'out'; ai.wp = null;
    }
    const tp = ai.tgt?.pos || p?.pos;
    if (!tp) { this.steer(dt, this.home.x, this.home.z, LY.cruise); return; }
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (!ai.wp || Math.hypot(ai.wp.x - this.pos.x, ai.wp.z - this.pos.z) < 30 || (ai.phase === 'run' && ai.passed && d > 110)) {
      if (ai.phase === 'run') {
        const a = yawTo(-dx, -dz) + (this.ctx.random() - 0.5) * 1.2, R = 250 + this.ctx.random() * 100;
        ai.wp = new THREE.Vector3(tp.x - Math.sin(a) * R, 0, tp.z - Math.cos(a) * R); ai.phase = 'turn';
      } else if (ai.phase === 'turn') { ai.phase = 'pick'; return; }
      else {
        const side = this.ctx.random() < 0.5 ? -1 : 1, off = 40 + this.ctx.random() * 30;
        const nx = dx / d, nz = dz / d;
        ai.wp = new THREE.Vector3(tp.x + -nz * side * off + nx * 160, 0, tp.z + nx * side * off + nz * 160);
        ai.phase = 'run'; ai.passed = false;
      }
    }
    if (ai.phase === 'run' && d < 80) ai.passed = true;
    this.steer(dt, ai.wp.x, ai.wp.z, ai.phase === 'run' ? LY.attack : LY.cruise);
  }
  // ── the hooker: match a rig's speed 40 to 70 m out, telegraph, harpoon it; or harpoon the frame ──
  updateHook(dt, p) {
    const ai = this.ai, C = this.L.convoy;
    if (!C) { this.mode = 'rake'; return; }
    if (!ai.rig || ai.rig.state !== 'slot') ai.rig = C.pickRig(this.pos, ai.rigTried ? null : this.config.rig);
    const r = ai.rig;
    const pd = p ? p.pos.distanceTo(this.pos) : Infinity;
    if (!r || (pd < 100 && r.pos.distanceTo(this.pos) > 220)) {
      // no rig in reach: the frame (as Level 1's Gaffer)
      this.updateRake(dt, p);
      if (p && ai.tele <= 0 && this.cd <= 0 && pd > 50 && pd < 120 && !this.L.tow) { ai.tele = 1.2; ai.teleKind = 'frame'; this.ctx.audio?.play?.('charge', this.pos); }
      return;
    }
    // a station beside the rig on our side of the road, moving with it
    const side = Math.sign(C.route.closest(this.pos.x, this.pos.z).l - r.l) || this.side;
    const st = C.route.toWorld(clamp(C.s + r.ds + 10, 0, C.route.length), r.l + side * 55, _w);
    const dst = Math.hypot(st.x - this.pos.x, st.z - this.pos.z);
    this.steer(dt, st.x, st.z, dst > 60 ? LY.attack : Math.max(8, C.v + dst * 0.4));
    const dr = r.pos.distanceTo(this.pos);
    if (ai.tele <= 0 && dr > 30 && dr < 75 && C.canHook()) {
      ai.tele = 1.2; ai.teleKind = 'rig';
      this.ctx.audio?.play?.('harpoon', this.pos); this.ctx.audio?.play?.('rigHorn', r.pos);
    }
  }
  updateTow(dt) {
    // towing: a course straight away from the road at 6 m/s
    const C = this.L.convoy;
    const rc = C?.route.closest(this.pos.x, this.pos.z);
    const side = Math.sign(rc?.l ?? this.side) || this.side;
    const t = C ? C.route.toWorld(rc.s, rc.l + side * 200, _w) : this.pos;
    this.steer(dt, t.x, t.z, LY.tow);
  }
  /** the launcher (the cable's end on this side) */
  cableFrom(out) { this.root.updateMatrixWorld(true); return this.muzzle ? this.muzzle.getWorldPosition(out) : out.copy(this.pos).setY(this.pos.y + 3); }
  onCableEnd(reason) {
    if (this.mode === 'tow') this.mode = 'rake';
    this.ai.rig = null; this.ai.rigTried = true;
    this.ai.rehook = 20;   // re-hooks after 20 s if it lives (L2 §4.4)
  }
  cancelTele() { if (this.ai.tele > 0) { this.ai.tele = 0; this.tele.visible = false; } this.windup = 0; this.ai.burst = 0; }
  updateWeapons(dt, p) {
    const ai = this.ai, C = this.L.convoy;
    if (this.mode === 'flee' || this.mode === 'stalk') { this.cancelTele(); return; }
    if (ai.tele > 0) {
      ai.tele -= dt; this.windup = Math.max(0, ai.tele);
      this.tele.visible = Math.sin(ai.tele * 40) > -0.3;
      if (ai.tele <= 0) {
        this.tele.visible = false; this.windup = 0;
        if (ai.teleKind === 'rig') {
          const r = ai.rig;
          if (r && r.state === 'slot' && C?.canHook() && r.pos.distanceTo(this.pos) < 110) {
            const h = C.hook(this, r, { kind: 'yacht' });
            if (h) this.mode = r.state === 'hooked' ? 'tow' : 'rake';
          }
          this.cd = 4;
        } else if (p) this.fireHarpoon(p);
      }
      return;
    }
    if (this.variant === 'hooker') { this.updateHarpoon(dt, p); return; }
    if (!p) return;
    this.root.updateMatrixWorld(true);
    const tgt = this.ai.tgt?.rig ? this.ai.tgt.pos : p.pos;
    const d = tgt.distanceTo(this.pos);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ahead = ((tgt.x - this.pos.x) * fx + (tgt.z - this.pos.z) * fz) / Math.max(1, d);
    if (ai.burst > 0) {
      ai.burstT -= dt;
      if (ai.burstT <= 0) { ai.burstT = 0.3; ai.burst--; this.burst(tgt === p.pos ? p : null, tgt); }
      return;
    }
    if (this.cd <= 0 && d < 140 && ahead > 0.25) { ai.burst = 3; ai.burstT = 0; this.cd = 3.5 + this.ctx.random(); }
  }
  /** one burst: 6 rounds × 70 / 30 at 480 m/s in a 3° cone (L2 §10.1); rounds at a rig only spark on it */
  burst(p, at) {
    this.muzzle.getWorldPosition(_m);
    if (p) p.center(_c); else _c.set(at.x, at.y + 3, at.z);
    for (let i = 0; i < 6; i++) {
      _d.copy(_c).sub(_m).normalize();
      const s = 0.026;
      _d.x += (this.ctx.random() - 0.5) * s * 2; _d.y += (this.ctx.random() - 0.5) * s * 2; _d.z += (this.ctx.random() - 0.5) * s * 2;
      _d.normalize().multiplyScalar(480);
      this.shoot({ pos: _m.clone(), vel: _d.clone(), kind: 'ebullet', dmg: 70, imp: 30, life: 0.5 });
    }
    this.ctx.fx?.muzzle?.(_m, _d.normalize(), 'mg');
    this.ctx.audio?.play?.('mg', _m);
  }
  fireHarpoon(p) {
    this.muzzle.getWorldPosition(_m);
    p.center(_c); _c.addScaledVector(p.vel, _m.distanceTo(_c) / 170 * 0.6);
    const dir = _d.copy(_c).sub(_m).normalize();
    const head = new THREE.Mesh(this.L.harpoonGeo(), mats2(this.ctx).steel); head.castShadow = false;
    head.position.copy(_m); head.lookAt(_c);
    this.ctx.levelRoot.add(head);
    this.harpoon = { head, pos: _m.clone(), vel: dir.clone().multiplyScalar(170), t: 0 };
    this.cd = 7 + this.ctx.random() * 2;
    this.ctx.audio?.play?.('harpoon', _m);
  }
  updateHarpoon(dt, p) {
    const h = this.harpoon; if (!h || !p) return;
    h.t += dt;
    const steps = Math.ceil(h.vel.length() * dt / 1.5);
    for (let i = 0; i < steps; i++) {
      h.pos.addScaledVector(h.vel, dt / steps);
      if (p.alive && p.hitTest(h.pos)) {
        this.ctx.combat?.damage?.(p, 350, 450, { team: this.team, owner: this, kind: 'harpoon', pos: this.pos });
        this.L.attachTow(this, { speed: 18, seconds: 3 });
        this.ctx.fx?.sparks?.(h.pos, 10, [1, 0.8, 0.5], 16);
        this.endHarpoon(); return;
      }
      if (h.pos.y < this.ground(h.pos.x, h.pos.z)) { this.ctx.fx?.impact?.(h.pos, null, 'bullet', 'ground'); this.endHarpoon(); return; }
    }
    h.head.position.copy(h.pos);
    if (h.t > 1.2) this.endHarpoon();
  }
  endHarpoon() { if (this.harpoon) { this.harpoon.head.parent?.remove(this.harpoon.head); this.harpoon = null; } }
  endTow() { if (this.L.tow?.by === this) this.L.breakTow('dead'); }
  syncRoot() {
    super.syncRoot();
    if (!this.tilt) return;
    const t = this.ctx.clock.time, P = this.parts;
    this.tilt.rotation.z = clamp(-this.speed * 0.004, -0.15, 0.15) * Math.sin(t * 0.7 + this.id);
    P.mast.rotation.x = (1 - this.mastK) * (PI / 2) * 0.96;
    if (P.fan) P.fan.rotation.z += 0.5 + this.speed * 0.02;
    const roll = this.speed * 0.016 / 1.5;
    for (const w of ['wheelL', 'wheelR', 'wheelB']) if (P[w]) P[w].rotation.x -= roll;
    if (P.sail) P.sail.rotation.y = this.stag() ? Math.sin(t * 6) * 0.35 : Math.sin(t * 0.8 + this.id) * 0.05 + (this.mode === 'tow' ? 0.15 : 0);
  }
  cleanup() { this.endHarpoon(); disposeGlow(this.tele); this.endTow(); }
  onDeath(info) {
    this.cleanup();
    if (this.fled) { this.root.visible = false; this.root.parent?.remove(this.root); return; }
    super.onDeath(info);
    this.L.spawnWreck?.(this.pos, this.yaw, 'yacht');
  }
}

// ════════════════════════════════════════════════════════════════════════════════════ harpooner (L2 §10.2)
const HP = { ap: 4200, impMax: 1400, stag: 3.0, speed: 9, turn: 1.6 };
export class Harpooner extends L2Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'harpooner', name: o.name || 'HARPOONER', pos, apMax: HP.ap, impMax: HP.impMax, stagDur: HP.stag, hitR: 4.5, hitY: 5,
                 rad: 4, hgt: 8.5, faction: 'dredge', config: { ...cfg, haul: undefined } }, L);
    this.config = cfg;
    if (cfg.haul) this.setHaulL2(cfg.haul, [0.9, 7.2, -0.6], true);
    const r = buildUnit(ctx, 'walker', 'dredge', { scale: 0.75 });
    this.rig = r; this.root.add(r.root);
    // the cable gun on a raised back mount, the box magazine that makes the turret guns a rivet gun
    const X = harpoonerExtras(ctx);
    const addItems = (parent, items, x, y, z) => {
      const B = new Builder();
      for (const it of items) B.add(...it);
      const g = new THREE.Group(); g.position.set(x, y, z);
      for (const { geo, mat } of B.merged()) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
      parent.add(g);
      return g;
    };
    const body = r.parts.body || r.root, turret = r.parts.turret || body;
    this.cableGun = addItems(body, X.cableGun, 0, 3.3, 1.4);
    this.magazine = addItems(turret, X.magazine, 0, 1.0, 0.4);
    this.cableMuzzle = new THREE.Object3D(); this.cableMuzzle.position.set(0, 0.35, -5); this.cableGun.add(this.cableMuzzle);
    this.tele = glowSprite('#ff4a2a', 3, 0.9); this.tele.visible = false; this.cableGun.add(this.tele); this.tele.position.set(0, 0.4, -4.6);
    this.cover = pos.clone();
    this.coverS = ctx.world.route.closest(pos.x, pos.z).s;
    this.side = Math.sign(ctx.world.route.closest(pos.x, pos.z).l) || 1;
    this.mode = 'cover'; this.modeT = 0; this.cd = 2 + ctx.random(); this.rehook = 0; this.speed = 0; this.braced = 0;
    this.yaw = yawTo(-this.side, 0);
    this.pos.y = this.ground();
  }
  setMode(m) { this.mode = m; this.modeT = 0; }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const p = this.player(), C = this.L.convoy, ai = this.ai;
    this.modeT += dt; this.cd -= dt; this.rehook -= dt;
    this.target = p;
    let wish = null, speed = 0;
    if (this.stag()) { this.cancelTele(); this.braced = damp(this.braced, 0, 4, dt); this.walk(dt, null, 0); return; }
    if (this.blind()) { this.cancelTele(); this.walk(dt, null, 0); return; }
    const pd = p ? p.pos.distanceTo(this.pos) : Infinity;
    switch (this.mode) {
      case 'cover': {
        // waits behind its fallen tower until the convoy's front rank passes its s − 60 (or the frame is on it)
        const front = C ? C.s + 189 : Infinity;
        if (front >= this.coverS - 60 || pd < 60 || this.lastHit > this.bornT) {
          this.setMode('out');
          this.L.counters.unitOut = (this.L.counters.unitOut || 0) + 1;
        }
        break;
      }
      case 'out': {
        // steps out toward the road (2 s)
        const rc = C?.route.closest(this.pos.x, this.pos.z);
        wish = C ? C.route.toWorld(rc.s, rc.l - this.side * 30, _w) : null; speed = HP.speed;
        if (this.modeT > 2) this.setMode('hunt');
        break;
      }
      case 'hunt': {
        // the rig to hook: its own if it is still on the road, else the nearest on this side
        if (!ai.rig || ai.rig.state !== 'slot') ai.rig = C?.pickRig(this.pos, ai.rigTried ? null : this.config.rig) || null;
        const r = ai.rig;
        const rd = r ? r.pos.distanceTo(this.pos) : Infinity;
        if (this.rehook <= 0 && C?.canHook() && r && rd < 220) { this.setMode('brace'); ai.teleKind = 'rig'; this.ctx.audio?.play?.('charge', this.pos); }
        else if (this.rehook <= 0 && p && pd < 120 && (!r || rd >= 220) && !this.L.tow) { this.setMode('brace'); ai.teleKind = 'frame'; this.ctx.audio?.play?.('charge', this.pos); }
        else {
          const goal = r || p;
          if (goal) { wish = goal.pos; speed = (goal.pos.distanceTo(this.pos) > 150) ? HP.speed : 0; }
        }
        break;
      }
      case 'brace': {
        // 1.2 s wind-up: legs splay, the cable gun tilts up (Second Sight flashes it)
        this.braced = Math.min(1, this.braced + dt * 3);
        this.windup = Math.max(0, 1.2 - this.modeT);
        this.tele.visible = Math.sin(this.modeT * 40) > -0.3;
        const goal = ai.teleKind === 'rig' ? ai.rig?.pos : p?.pos;
        if (goal) this.faceTo(dt, goal.x - this.pos.x, goal.z - this.pos.z, 3);
        if (this.modeT >= 1.2) { this.windup = 0; this.tele.visible = false; this.fireCable(); }
        break;
      }
      case 'winch': {
        // braced: can't move while the cable is on; the rivet gun still fires
        this.braced = 1;
        if (ai.rig?.hook) this.faceTo(dt, ai.rig.pos.x - this.pos.x, ai.rig.pos.z - this.pos.z, 2);
        break;
      }
      case 'shot': { if (!this.cableShot) this.setMode('hunt'); break; }
      default: break;
    }
    if (this.mode !== 'brace' && this.mode !== 'winch') this.braced = damp(this.braced, 0, 3, dt);
    this.updateCableShot(dt);
    this.updateRivets(dt, p, pd);
    this.walk(dt, wish, speed);
  }
  walk(dt, wish, speed) {
    if (this.heldT > 0) return;
    let wx = 0, wz = 0;
    if (wish && speed > 0) {
      const dx = wish.x - this.pos.x, dz = wish.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 4) {
        const a = yawTo(dx, dz) + this.rigAvoid(this.yaw) * 0.8;
        this.yaw = dampAng(this.yaw, a, HP.turn, dt);
        wx = -Math.sin(this.yaw); wz = -Math.cos(this.yaw);
      }
    }
    this.moveGround(dt, wx, wz, speed, 3);           // moveGround applies speedScale (addendum 02 E4)
    this.speed = Math.hypot(this.vel.x, this.vel.z);
  }
  fireCable() {
    const ai = this.ai, p = this.player();
    this.cableMuzzle.getWorldPosition(_m);
    const tgt = ai.teleKind === 'rig' ? ai.rig : null;
    const at = tgt ? _c.set(tgt.pos.x, tgt.pos.y + 3.5, tgt.pos.z) : p ? p.center(_c) : null;
    if (!at) { this.setMode('hunt'); return; }
    const dir = _d.copy(at).sub(_m).normalize();
    const head = new THREE.Mesh(this.L.harpoonGeo(), mats2(this.ctx).steel); head.castShadow = false;
    head.position.copy(_m); head.lookAt(at); this.ctx.levelRoot.add(head);
    this.cableShot = { head, pos: _m.clone(), vel: dir.clone().multiplyScalar(160), t: 0, rig: tgt, frame: !tgt };
    this.ctx.audio?.play?.('harpoon', _m);
    this.setMode('shot');
  }
  updateCableShot(dt) {
    const h = this.cableShot; if (!h) return;
    h.t += dt;
    const p = this.player();
    const steps = Math.ceil(h.vel.length() * dt / 2);
    for (let i = 0; i < steps; i++) {
      h.pos.addScaledVector(h.vel, dt / steps);
      if (h.rig && h.pos.distanceTo(_c.set(h.rig.pos.x, h.rig.pos.y + 3.5, h.rig.pos.z)) < 6) {
        this.endCableShot();
        const hk = this.L.convoy?.hook(this, h.rig, { kind: 'winch' });
        if (hk && h.rig.state === 'hooked') this.setMode('winch'); else { this.rehook = 6; this.setMode('hunt'); }
        return;
      }
      if (h.frame && p?.alive && p.hitTest(h.pos)) {
        this.ctx.combat?.damage?.(p, 300, 400, { team: this.team, owner: this, kind: 'harpoon', pos: this.pos });
        this.L.attachTow(this, { speed: 14, seconds: 3 });
        this.endCableShot(); this.rehook = 25; this.setMode('hunt');
        return;
      }
    }
    h.head.position.copy(h.pos);
    if (h.t > 1.6 || h.pos.y < this.ground(h.pos.x, h.pos.z)) { this.endCableShot(); this.rehook = 6; this.setMode('hunt'); }
  }
  endCableShot() { if (this.cableShot) { this.cableShot.head.parent?.remove(this.cableShot.head); this.cableShot = null; } }
  cableFrom(out) { this.root.updateMatrixWorld(true); return this.cableMuzzle.getWorldPosition(out); }
  onCableEnd(reason) { this.ai.rig = null; this.ai.rigTried = true; this.rehook = 25; if (this.mode === 'winch') this.setMode('hunt'); }
  cancelTele() { this.windup = 0; if (this.tele) this.tele.visible = false; if (this.mode === 'brace') this.setMode('hunt'); }
  /** the rivet gun: 3 rivets × 160 / 120 at 450 m/s, every 2.5 s, out to 260 m, at the frame only (not after a TEAR) */
  updateRivets(dt, p, pd) {
    if (!p || this.haul?.taken || this.mode === 'cover') return;
    const ai = this.ai;
    if (ai.rv > 0) {
      ai.rvT -= dt;
      if (ai.rvT <= 0) {
        ai.rvT = 0.18; ai.rv--;
        const mz = this.rig.muzzles?.[ai.rv % 2] || this.root;
        mz.getWorldPosition(_m);
        this.lead(_m, p, 450, _c);
        _d.copy(_c).sub(_m).normalize();
        _d.x += (this.ctx.random() - 0.5) * 0.02; _d.y += (this.ctx.random() - 0.5) * 0.02;
        this.shoot({ pos: _m.clone(), vel: _d.normalize().multiplyScalar(450), kind: 'shell', dmg: 160, imp: 120, life: 0.8, scale: 0.7, srcKind: 'rivet' });
        this.ctx.fx?.muzzle?.(_m, _d, 'cannon');
        this.ctx.audio?.play?.('cannon', _m, { vol: 0.6, rate: 1.3 });
      }
      return;
    }
    if (this.cd <= 0 && pd < 260) { ai.rv = 3; ai.rvT = 0; this.cd = 2.5; }
    // the turret tracks the frame
    const tur = this.rig.parts?.turret;
    if (tur) tur.rotation.y = dampAng(tur.rotation.y, angWrap(yawTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw), 3, dt);
  }
  onTaken() { if (this.magazine) this.magazine.visible = false; }
  syncRoot() {
    super.syncRoot();
    animateUnit(this.rig, this.ctx.clock.dt || 1 / 60, { speed: this.speed || 0 });
    // braced: the legs splay and dig in; the cable gun tilts up
    const b = this.braced || 0;
    for (let i = 0; i < 4; i++) { const leg = this.rig.parts?.['leg' + i]; if (leg) leg.rotation.z = (i % 2 ? 1 : -1) * 0.25 * b; }
    if (this.cableGun) this.cableGun.rotation.x = 0.18 * b;
    if (this.haul?.taken && this.magazine?.visible) this.magazine.visible = false;
  }
  cleanup() { this.endCableShot(); disposeGlow(this.tele); if (this.L.tow?.by === this) this.L.breakTow('dead'); }
  despawn() { this.cleanup(); super.despawn(); }
  onDeath(info) { this.cleanup(); this.boomScale = 2.2; this.debris = 12; super.onDeath(info); }
}

// ════════════════════════════════════════════════════════════════════════════════════ Skimmer (L2 §10.3)
const SK = { ap: 2600, impMax: 900, stag: 2.2, cruise: 45, run: 60, turn: 1.6, accel: 24, hover: 2.5 };
export class Skimmer extends L2Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'skimmer', name: o.name || 'SKIMMER', pos, apMax: SK.ap, impMax: SK.impMax, stagDur: SK.stag, hitR: 3.5, hitY: 2.5,
                 rad: 4, hgt: 4, faction: 'ghost', config: { ...cfg, haul: undefined } }, L);
    this.config = cfg;
    if (cfg.haul) this.setHaulL2(cfg.haul, [1.75, 2.2, 2.6], false);
    const r = rig(ctx, skimmerModel(ctx));
    this.model = r.root; this.parts = r.parts;
    this.tilt = new THREE.Group(); this.tilt.add(this.model); this.root.add(this.tilt);
    this.muzzle = r.parts.hull.getObjectByName('muzzle');
    this.speed = SK.cruise * 0.6; this.yaw = o.yaw ?? 0; this.bank = 0;
    this.ai = { phase: 'out', wp: null, burst: 0, burstT: 0, mslT: 4 + ctx.random() * 4, airT: 3 + ctx.random() * 4, pair: cfg.pair || 'a', slide: 0 };
    this.cd = 2 + ctx.random() * 2;
    this.leaveAt = cfg.leaveAfter ? ctx.clock.time + cfg.leaveAfter : null;
    this.mode = 'run';
    this.pos.y = this.ground() + SK.hover;
    const p = this.player();
    if (p) this.yaw = yawTo(p.pos.x - pos.x, p.pos.z - pos.z);
  }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const p = this.player(), ai = this.ai, L = this.L;
    this.target = p; this.cd -= dt; ai.mslT -= dt; ai.airT -= dt;
    if (this.mode === 'leave' || (this.leaveAt != null && this.ctx.clock.time >= this.leaveAt) || L.skimLeave) this.mode = 'leave';
    if (this.stag()) {
      // drops onto its skids and slides 30 m
      this.windup = 0; ai.burst = 0;
      this.speed = damp(this.speed, 0, 1.0, dt);
      this.fly(dt, 0.6);
      return;
    }
    let tx, tz, want = SK.cruise;
    if (this.mode === 'leave') {
      const C = L.convoy;
      const c = C ? C.centre(_c) : this.pos;
      tx = this.pos.x - 0.3 * (c.x - this.pos.x); tz = this.pos.z - 600; want = SK.run;
      if (Math.hypot(this.pos.x - c.x, this.pos.z - c.z) > 900) { this.fled = true; this.removeMe = true; }
    } else if (!p || this.blind()) {
      const a = this.drift ? this.drift(dt) : this.yaw; tx = this.pos.x - Math.sin(a) * 60; tz = this.pos.z - Math.cos(a) * 60;
    } else {
      // strafing runs at the frame: a line passing 30 to 60 m out; pairs cross from opposite sides
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      if (!ai.wp || Math.hypot(ai.wp.x - this.pos.x, ai.wp.z - this.pos.z) < 35 || (ai.phase === 'run' && ai.passed && d > 140)) {
        if (ai.phase === 'run') {
          const a = yawTo(-dx, -dz) + (this.ctx.random() - 0.5) * 1.4, R = 280 + this.ctx.random() * 120;
          ai.wp = new THREE.Vector3(p.pos.x - Math.sin(a) * R, 0, p.pos.z - Math.cos(a) * R); ai.phase = 'out';
        } else {
          const side = (ai.pair.charCodeAt(0) + (this.id || 0)) % 2 ? 1 : -1, off = 30 + this.ctx.random() * 30;
          const nx = dx / d, nz = dz / d;
          ai.wp = new THREE.Vector3(p.pos.x + -nz * side * off + nx * 180, 0, p.pos.z + nx * side * off + nz * 180);
          ai.phase = 'run'; ai.passed = false;
        }
      }
      if (ai.phase === 'run' && d < 90) ai.passed = true;
      tx = ai.wp.x; tz = ai.wp.z; want = ai.phase === 'run' ? SK.run : SK.cruise;
      this.weapons(dt, p, d);
    }
    // steer (turn-rate limited, banking into turns)
    const tyaw = yawTo(tx - this.pos.x, tz - this.pos.z) + this.rigAvoid(this.yaw) * 0.6;
    const dyaw = clamp(angWrap(tyaw - this.yaw), -SK.turn * dt, SK.turn * dt);
    this.yaw = angWrap(this.yaw + dyaw);
    this.bank = damp(this.bank, clamp(-dyaw / Math.max(dt, 1e-3) * 0.35, -0.6, 0.6), 4, dt);
    const vmax = want * this.speedK();
    this.speed += clamp(vmax - this.speed, -SK.accel * dt * 1.5, SK.accel * dt);
    this.fly(dt, SK.hover);
  }
  fly(dt, hover) {
    if (this.heldT > 0) return;
    this.vel.set(-Math.sin(this.yaw) * this.speed, 0, -Math.cos(this.yaw) * this.speed);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.ctx.collision?.resolve?.(this);
    this.keepInPlayArea?.();
    const g = this.ground() + hover;
    this.pos.y = damp(this.pos.y, g, 6, dt);
    if (this.speed > 10 && Math.random() < dt * 3) this.ctx.fx?.dust?.(_v.set(this.pos.x, this.ground() + 0.3, this.pos.z), 3, 4);
  }
  weapons(dt, p, d) {
    const ai = this.ai, C = this.L.convoy;
    // the twin nose gun: bursts during a pass 30 to 60 m out
    if (ai.burst > 0) {
      ai.burstT -= dt;
      if (ai.burstT <= 0) {
        ai.burstT = 0.09; ai.burst--;
        this.root.updateMatrixWorld(true); this.muzzle.getWorldPosition(_m); p.center(_c);
        _d.copy(_c).sub(_m).normalize(); _d.x += (this.ctx.random() - 0.5) * 0.04; _d.y += (this.ctx.random() - 0.5) * 0.04; _d.z += (this.ctx.random() - 0.5) * 0.04;
        this.shoot({ pos: _m.clone(), vel: _d.normalize().multiplyScalar(520), kind: 'ebullet', dmg: 90, imp: 40, life: 0.5 });
        this.ctx.fx?.muzzle?.(_m, _d, 'mg');
        if (ai.burst % 2) this.ctx.audio?.play?.('mg', _m, { rate: 1.2 });
      }
    } else if (this.cd <= 0 && d > 25 && d < 140) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const ahead = ((p.pos.x - this.pos.x) * fx + (p.pos.z - this.pos.z) * fz) / Math.max(1, d);
      if (ahead > 0.6) { ai.burst = 4; ai.burstT = 0; this.cd = 1.6 + this.ctx.random(); }
    }
    // homing missiles at the frame every 10 s (a 0.5 s wind-up that Second Sight flashes)
    if (ai.mslT <= 0.5 && ai.mslT > 0) this.windup = ai.mslT;
    if (ai.mslT <= 0 && d < 420) {
      ai.mslT = 10; this.windup = 0;
      for (let i = 0; i < 2; i++) {
        const tube = this.parts.pod.getObjectByName('tube' + i);
        this.root.updateMatrixWorld(true); tube.getWorldPosition(_m);
        _d.set(-Math.sin(this.yaw), 0.35, -Math.cos(this.yaw)).normalize().multiplyScalar(70);
        this.shoot({ pos: _m.clone(), vel: _d.clone(), kind: 'missile', dmg: 380, imp: 260, life: 6, target: p, turn: 2.2, accel: 60, maxSpeed: 150, splash: 5, splashDmg: 150 });
      }
      this.ctx.audio?.play?.('missile', this.pos);
    }
    // missile passes over the convoy: two air bursts 20 to 40 m above a rig every 8 s (near misses; rigs take no damage)
    if (ai.airT <= 0 && C) {
      ai.airT = 8;
      const r = C.near(this.pos, 1)[0];
      if (r && r.d < 350) {
        for (let i = 0; i < 2; i++) {
          const tube = this.parts.pod.getObjectByName('tube' + i);
          this.root.updateMatrixWorld(true); tube.getWorldPosition(_m);
          _c.set(r.r.pos.x + (this.ctx.random() - 0.5) * 20, r.r.pos.y + 20 + this.ctx.random() * 20, r.r.pos.z + (this.ctx.random() - 0.5) * 20);
          _d.copy(_c).sub(_m); const t = Math.max(0.6, _d.length() / 110);
          this.shoot({ pos: _m.clone(), vel: _d.multiplyScalar(1 / t).clone(), kind: 'missile', dmg: 0, imp: 0, life: t, splash: 0 });
        }
        this.ctx.audio?.play?.('missile', this.pos);
      }
    }
  }
  syncRoot() {
    super.syncRoot();
    if (!this.tilt) return;
    const t = this.ctx.clock.time;
    this.tilt.rotation.z = this.bank + Math.sin(t * 2.1 + (this.id || 0)) * 0.02;
    this.tilt.rotation.x = clamp(-this.speed * 0.002, -0.12, 0.12);
    this.tilt.position.y = Math.sin(t * 1.7 + (this.id || 0)) * 0.12;
  }
  onDamage(info) { this.guarantee(info); super.onDamage?.(info); }
  onDeath(info) {
    if (this.fled) { this.root.visible = false; this.root.parent?.remove(this.root); return; }
    this.boomScale = 1.8; this.debris = 10;
    super.onDeath(info);
  }
}

/** registers the three kinds with ctx.enemies (factories capture the level runtime) */
export function registerL2Units(ctx, L) {
  ctx.enemies.register('land_yacht', (c, pos, o = {}) => new LandYacht(c, pos, o, L));
  ctx.enemies.register('harpooner', (c, pos, o = {}) => new Harpooner(c, pos, o, L));
  ctx.enemies.register('skimmer', (c, pos, o = {}) => new Skimmer(c, pos, o, L));
}

/** a land-yacht wreck left where one died: on its side, burning 20 s; it stays on the map (L2 §10.1) */
export function yachtWreckGeo(ctx) {
  return cached(ctx, 'l02:rt_yacht_wreck', (B) => {
    flat(B, yachtModel(ctx, 'raker'), new THREE.Matrix4().makeRotationZ(1.2).setPosition(0, 1.6, 0), { mast: { rot: [1.2, 0, 0.4] }, sail: { rot: [0.5, 0.3, 0.9] } });
  });
}
export { instance };
