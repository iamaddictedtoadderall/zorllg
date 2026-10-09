// levels/level01/units.js (P6) — Level 1's unit kinds, registered with ctx.enemies from custom.install (L1 §11):
//  · skiff: raider ice yacht (Gaffer harpoon / Sleet spread gun), rake-run AI, scripted raid modes, water skiffs;
//  · gleaner: Dredge scavenger drone (harvest / defend / hunt / watch), green ghost cab light, latching in the sprint;
//  · gleaner_carrier: heavy flying barge, deploys Gleaners, pops flares at homing missiles, sags when staggered.
// All three are built on arch §4.4's Unit (and use only its documented fields plus addendum A5.1's haul/blindT/heldT).
// They honour blindT (no firing, drift) and never overwrite a pos moved from outside (the harpoon reel: heldT).
// Projectiles go through ctx.projectiles (hits are P4's); the Gaffer's harpoon and cable are Level 1's own mechanic.
import * as THREE from 'three';
import { Unit } from '../../src/actors/enemy.js';
import { clamp, damp, dampAng, yawTo, angWrap } from '../../src/core/util.js';
import { rig, skiffModel, gleanerModel, carrierModel } from './models.js';
import { mats } from './kit.js';
import { glowSprite, setGlowSize, disposeGlow, spawnWreck } from './actors.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
const PI = Math.PI;

/** common helpers on top of Unit (work with P0's stub Unit too) */
class L1Unit extends Unit {
  constructor(ctx, o, L) {
    super(ctx, o);
    this.L = L;
    this._ownTimers = !('blindT' in this);   // P0's stub Unit does not count blindT/heldT down; P4's does
    this.blindT ??= 0; this.heldT ??= 0;
    this.config = o.config || this.config || {};
  }
  setHaulL1(part, glint, heavy) {
    if (!part) return;
    const h = { part, glint, ...(heavy !== undefined ? { heavy } : {}) };
    if (this.setHaul) this.setHaul(h); else this.haul = { ...h, heavy: heavy ?? (this.impMax > 1000), taken: false };
  }
  /** fire a projectile owned by this unit (ctx.projectiles; P4 resolves hits) */
  shoot(spec) { spec.team = this.team; spec.owner = this; return this.ctx.projectiles?.fire?.(spec); }
  blind() { return (this.blindT || 0) > 0; }
  stag() { return (this.stagT || 0) > 0; }
  player() { const p = this.ctx.player; return p?.active && p.alive ? p : null; }
  ground(x = this.pos.x, z = this.pos.z) { return this.L.groundAt(x, z); }
  baseUpdate(dt) {
    super.baseUpdate(dt);
    if (this._ownTimers) {
      if (this.blindT > 0) this.blindT = Math.max(0, this.blindT - dt);
      if (this.heldT > 0) this.heldT = Math.max(0, this.heldT - dt);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ skiff
const SK = { ap: 2200, impMax: 900, stag: 2.6, cruise: 32, attack: 45, water: 30, turn: 1.2, accel: 18 };
export class Skiff extends L1Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'skiff', name: o.name || 'RAIDER SKIFF', pos, apMax: SK.ap, impMax: SK.impMax, stagDur: SK.stag, hitR: 4.5, hitY: 3,
                 rad: 5, hgt: 6, faction: 'dredge', config: { ...cfg, haul: undefined } }, L);
    this.variant = cfg.variant === 'sleet' ? 'sleet' : 'gaffer';
    this.water = !!cfg.water;
    this.script = cfg.script || null;
    if (cfg.startAp) this.ap = Math.min(this.apMax, cfg.startAp);
    if (cfg.haul) this.setHaulL1(cfg.haul, this.variant === 'gaffer' ? [0.8, 2.65, -4.6] : [0, 2.8, -4.6], false);
    const r = rig(ctx, skiffModel(ctx, this.variant));
    this.model = r.root; this.parts = r.parts;
    this.tilt = new THREE.Group(); this.tilt.add(this.model); this.root.add(this.tilt);
    this.muzzle = r.parts.gun.getObjectByName('muzzle');
    this.tele = glowSprite('#ff4a2a', 3, 0.9); this.tele.visible = false; this.parts.gun.add(this.tele); this.tele.position.set(0, 0.5, -3.6);
    this.speed = 0; this.yaw = o.yaw ?? 0; this.cd = 2 + ctx.random() * 2; this.alwaysActive = true;
    this.ai = { phase: 'out', wp: null, t: 0, burst: 0, burstT: 0, tele: 0, lead: cfg.lead, leadI: 0, leadDir: 1 };
    this.mode = this.script ? 'script' : cfg.circle ? 'circle' : (cfg.lead !== undefined ? 'lead' : 'rake');
    if (cfg.circle) this.circleAt = ctx.world.resolve(cfg.circle, new THREE.Vector3());
    this.harpoon = null;     // flying harpoon head
    this.onFloor();
  }
  onFloor() {
    const g = this.ground();
    this.onWater = this.water || g < this.L.DATA.sea - 1;
    this.pos.y = this.onWater ? this.L.DATA.sea - 0.5 : g;
  }
  /** head toward a world point at a speed (turn rate limited, accel limited); whisker avoidance of colliders */
  steer(dt, tx, tz, want) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    let tyaw = yawTo(dx, dz);
    // whiskers: if the way ahead is blocked by a collider or a steep slope, turn away
    const C = this.ctx.collision;
    if (C && (this.ai.whT = (this.ai.whT ?? 0) - dt) <= 0) {
      this.ai.whT = 0.25; this.ai.avoid = 0;
      for (const [k, side] of [[0, 0], [0.45, 1], [-0.45, -1]]) {
        const a = this.yaw + k, fx = -Math.sin(a), fz = -Math.cos(a);
        _v.set(this.pos.x, this.pos.y + 3, this.pos.z); _w.set(this.pos.x + fx * 34, this.pos.y + 3, this.pos.z + fz * 34);
        const hit = C.segment(_v, _w, undefined, { ground: !this.onWater, colliders: true, radius: 0 });
        if (hit) this.ai.avoid += side === 0 ? (this.ai.lastSide || 1) * 1.2 : -side;
      }
      if (this.ai.avoid) this.ai.lastSide = Math.sign(this.ai.avoid);
    }
    if (this.ai.avoid) tyaw = this.yaw + Math.sign(this.ai.avoid) * 1.0;
    const turn = SK.turn * dt * (0.4 + 0.6 * Math.min(1, this.speed / 20));
    const d = angWrap(tyaw - this.yaw);
    this.yaw = angWrap(this.yaw + clamp(d, -turn, turn));
    const vmax = this.onWater ? Math.min(want, SK.water) : want;
    this.speed += clamp(vmax - this.speed, -SK.accel * dt * 1.5, SK.accel * dt);
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
    const p = this.player(), ai = this.ai;
    ai.t += dt; this.cd -= dt;
    this.target = p;
    if (this.stag()) {                   // the sail goes slack and it coasts to a halt
      this.speed = damp(this.speed, 0, 1.4, dt); this.cancelTele(); this.move(dt); return;
    }
    if (this.blind()) { const a = this.drift ? this.drift(dt) : this.yaw; this.steer(dt, this.pos.x - Math.sin(a) * 50, this.pos.z - Math.cos(a) * 50, 14); this.cancelTele(); this.move(dt); return; }
    switch (this.mode) {
      case 'script': this.updateScript(dt, p); break;
      case 'circle': this.updateCircle(dt, p); break;
      case 'lead': this.updateLead(dt, p); break;
      case 'flee': {
        if (p) { this.steer(dt, this.pos.x + (this.pos.x - p.pos.x), this.pos.z + (this.pos.z - p.pos.z), SK.attack); if (this.pos.distanceTo(p.pos) > 400) this.removeMe = true; }
        else this.removeMe = true;
        if (this.removeMe && !this.ctx.enemies?.despawn) this.alive = false;
        break;
      }
      case 'launch': {   // slide down the Icebreaker's stern rail, then rake
        ai.launchT = (ai.launchT ?? 0) + dt; this.speed = 14;
        if (ai.launchT > 2.2) this.mode = 'rake';
        break;
      }
      default: this.updateRake(dt, p);
    }
    this.updateWeapons(dt, p);
    this.move(dt);
  }
  // ── behaviours ──
  updateRake(dt, p) {
    const ai = this.ai;
    if (!p) { this.steer(dt, this.home.x, this.home.z, SK.cruise); return; }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (!ai.wp || Math.hypot(ai.wp.x - this.pos.x, ai.wp.z - this.pos.z) < 30 || (ai.phase === 'run' && ai.passed && d > 110)) {
      if (ai.phase === 'run') {   // arc away to 250-350 m
        const a = yawTo(-dx, -dz) + (this.ctx.random() - 0.5) * 1.2, R = 250 + this.ctx.random() * 100;
        ai.wp = new THREE.Vector3(p.pos.x - Math.sin(a) * R, 0, p.pos.z - Math.cos(a) * R); ai.phase = 'out';
      } else {                    // a run line passing 40-70 m from the player and on past
        const side = this.ctx.random() < 0.5 ? -1 : 1, off = 40 + this.ctx.random() * 30;
        const nx = dx / d, nz = dz / d;
        ai.wp = new THREE.Vector3(p.pos.x + -nz * side * off + nx * 160, 0, p.pos.z + nx * side * off + nz * 160);
        ai.phase = 'run'; ai.passed = false;
      }
    }
    if (ai.phase === 'run' && d < 80) ai.passed = true;
    this.steer(dt, ai.wp.x, ai.wp.z, ai.phase === 'run' ? SK.attack : SK.cruise);
  }
  updateCircle(dt, p) {
    const c = this.circleAt, ai = this.ai;
    ai.ang = (ai.ang ?? Math.atan2(this.pos.z - c.z, this.pos.x - c.x)) + dt * 0.33;
    this.steer(dt, c.x + Math.cos(ai.ang + 0.6) * 95, c.z + Math.sin(ai.ang + 0.6) * 95, SK.cruise);
    // rake Tick: visual hits on the ridge around it
    if ((ai.tickT = (ai.tickT ?? 1) - dt) <= 0) { ai.tickT = 1.2 + this.ctx.random(); _v.copy(c).add(_w.set((this.ctx.random() - 0.5) * 30, 2 + this.ctx.random() * 6, (this.ctx.random() - 0.5) * 30)); this.ctx.fx?.sparks?.(_v, 6, [1, 0.7, 0.3], 14); this.ctx.fx?.impact?.(_v, null, 'bullet', 'ground'); }
    if (p && (p.pos.distanceTo(this.pos) < 250 || this.L.counters.playerShots > 0 || this.lastHit > 0)) this.mode = 'rake';
  }
  updateLead(dt, p) {
    const ai = this.ai;
    const leads = this.water ? this.L.DATA.floes.leads : this.L.DATA.skiffLeadsZ3;
    const line = leads[ai.lead % leads.length];
    if (!this.water && (ai.leadI >= line.length || (p && p.pos.distanceTo(this.pos) < 220))) { this.mode = 'rake'; return; }
    if (this.water && ai.leadI === undefined) ai.leadI = 0;
    const tgt = line[clamp(ai.leadI, 0, line.length - 1)];
    if (Math.hypot(tgt[0] - this.pos.x, tgt[1] - this.pos.z) < 25) {
      ai.leadI += ai.leadDir;
      if (this.water && (ai.leadI >= line.length || ai.leadI < 0)) { ai.leadDir *= -1; ai.leadI = clamp(ai.leadI + ai.leadDir * 2, 0, line.length - 1); }
    }
    const run = this.water && p && p.pos.distanceTo(this.pos) < 260;
    if (run && !ai.ran) { ai.ran = true; this.L.counters.skiffRun++; }
    this.steer(dt, tgt[0], tgt[1], run ? SK.water : 24);
  }
  updateScript(dt, p) {
    const ai = this.ai, L = this.L;
    if (this.script === 'raidSled') {
      // sail in through the north gap, harpoon sled1 at t 4 and drag it out north-east at 25 m/s
      const sled = this.ctx.structures?.get?.('sled1');
      if (!ai.hooked && sled) {
        this.steer(dt, sled.pos.x, sled.pos.z, 40);
        if ((ai.t > 4 || this.pos.distanceTo(sled.pos) < 70) && !ai.fired) {
          ai.fired = true; ai.hooked = true;
          sled.setState('towed');
          L.towedSled.attach(this, sled.pos);
          L.towedSled.setLoad(3);
          this.ctx.audio?.play?.('harpoon', this.pos);
          this.ctx.events.emit('l01:sledHarpooned', {});
        }
      } else {
        const out = this.ctx.world.resolve({ s: 330, l: -620 }, _v);
        this.steer(dt, out.x, out.z, 25);
      }
      return;
    }
    if (this.script === 'rakeCutter') { this.updateRake(dt, p); return; }
    if (this.script === 'towCutter') {
      const to = L.raidTow?.to; if (!to) { this.updateRake(dt, p); return; }
      this.steer(dt, to.x + (to.x - this.pos.x) * 0.2, to.z + (to.z - this.pos.z) * 0.2, 18);
      return;
    }
    this.updateRake(dt, p);
  }
  // ── weapons ──
  cancelTele() { if (this.ai.tele > 0) { this.ai.tele = 0; this.tele.visible = false; } this.ai.burst = 0; }
  updateWeapons(dt, p) {
    const ai = this.ai;
    if (!p || this.mode === 'flee' || this.mode === 'circle') { this.cancelTele(); return; }
    this.root.updateMatrixWorld(true);
    const d = p.pos.distanceTo(this.pos);
    const ahead = (() => { const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); return ((p.pos.x - this.pos.x) * fx + (p.pos.z - this.pos.z) * fz) / Math.max(1, d); })();
    const raid = this.script === 'rakeCutter' || this.script === 'raidSled';
    if (this.variant === 'gaffer') {
      if (ai.tele > 0) {
        ai.tele -= dt; this.tele.visible = Math.sin(ai.tele * 40) > -0.3;
        if (ai.tele <= 0) { this.tele.visible = false; this.fireHarpoon(p); }
        return;
      }
      if (this.cd <= 0 && d > 60 && d < 120 && ahead > 0.3 && !raid && !this.L.tow) {
        ai.tele = 0.9; this.ctx.audio?.play?.('charge', this.pos);
        this.L.counters.harpoonTele++;
      }
      this.updateHarpoon(dt, p);
    } else {
      if (ai.burst > 0) {
        ai.burstT -= dt;
        if (ai.burstT <= 0) { ai.burstT = 0.35; ai.burst--; this.sleetBurst(p, raid); }
        return;
      }
      if (this.cd <= 0 && d < 90 && ahead > 0.1) { ai.burst = 3; ai.burstT = 0; this.cd = 4 + this.ctx.random(); }
    }
  }
  sleetBurst(p, raid) {
    this.muzzle.getWorldPosition(_m);
    p.center(_c);
    for (let i = 0; i < 8; i++) {
      _d.copy(_c).sub(_m).normalize();
      const s = 0.044;   // ≈ 5° cone
      _d.x += (this.ctx.random() - 0.5) * s * 2; _d.y += (this.ctx.random() - 0.5) * s * 2; _d.z += (this.ctx.random() - 0.5) * s * 2;
      _d.normalize().multiplyScalar(520);
      this.shoot({ pos: _m.clone(), vel: _d.clone(), kind: 'ebullet', dmg: 70, imp: 35, life: 0.6 });
    }
    this.ctx.fx?.muzzle?.(_m, _d.normalize(), 'shotgun');
    this.ctx.audio?.play?.('shotgun', _m);
    if (raid && p.pos.distanceTo(this.pos) < 90) this.L.setFlag('l01:rakeHit', true);
  }
  fireHarpoon(p) {
    this.muzzle.getWorldPosition(_m);
    p.center(_c); _c.addScaledVector(p.vel, _m.distanceTo(_c) / 170 * 0.6);
    const dir = _d.copy(_c).sub(_m).normalize();
    const head = new THREE.Mesh(this.L.harpoonGeo(), mats(this.ctx).steel); head.castShadow = false;
    head.position.copy(_m); head.lookAt(_c);
    this.ctx.levelRoot.add(head);
    this.harpoon = { head, pos: _m.clone(), vel: dir.clone().multiplyScalar(170), t: 0 };
    this.cd = 7 + this.ctx.random() * 2;
    this.ctx.audio?.play?.('harpoon', _m);
  }
  updateHarpoon(dt, p) {
    const h = this.harpoon; if (!h) return;
    h.t += dt;
    const steps = Math.ceil(h.vel.length() * dt / 1.5);
    for (let i = 0; i < steps; i++) {
      h.pos.addScaledVector(h.vel, dt / steps);
      if (p.alive && p.hitTest(h.pos)) {
        this.ctx.combat?.damage?.(p, 350, 450, { team: this.team, owner: this, kind: 'harpoon', pos: this.pos });
        this.L.attachTow(this);
        this.ctx.fx?.sparks?.(h.pos, 10, [1, 0.8, 0.5], 16);
        this.endHarpoon(); return;
      }
      if (this.ctx.collision?.pointInSolid?.(h.pos) || h.pos.y < this.ground(h.pos.x, h.pos.z)) { this.ctx.fx?.impact?.(h.pos, null, 'bullet', 'ground'); this.endHarpoon(); return; }
    }
    h.head.position.copy(h.pos);
    if (h.t > 1.2) this.endHarpoon();
  }
  endHarpoon() { if (this.harpoon) { this.harpoon.head.parent?.remove(this.harpoon.head); this.harpoon = null; } }
  syncRoot() {
    super.syncRoot();
    if (!this.tilt) return;
    const t = this.ctx.clock.time;
    this.tilt.rotation.z = this.onWater ? Math.sin(t * 1.3 + this.id) * 0.04 : clamp(-this.speed * 0.004, -0.15, 0.15) * Math.sin(t * 0.7);
    this.tilt.rotation.x = this.onWater ? Math.sin(t * 0.9 + this.id) * 0.03 : 0;
    this.tilt.position.y = this.onWater ? -0.9 : 0;
    if (this.parts.fan) this.parts.fan.rotation.z += 0.6;
    if (this.parts.sail) this.parts.sail.rotation.y = this.stag() ? Math.sin(t * 3) * 0.25 : Math.sin(t * 0.8) * 0.05;
  }
  /** the TEAR fail-safe Gaffer (L1 §5 E2) staggers on the first hit the player lands, whatever its impact */
  onDamage(info) {
    if (this.config?.staggerOnFirstHit && !this.firstHit && info?.source?.team === 'player' && this.alive && !(this.stagT > 0) && !info.killed) {
      this.firstHit = true;
      this.stagT = this.stagDur; this.imp = 0; info.staggered = true;
      this.ctx.fx?.sparks?.(this.pos, 14, [1, 0.8, 0.4], 18);
      this.ctx.audio?.play?.('stagger', this.pos);
    }
    super.onDamage?.(info);
  }
  cleanup() { this.endHarpoon(); disposeGlow(this.tele); if (this.L.tow?.by === this) this.L.breakTow('dead'); }
  onDeath(info) {
    this.cleanup();
    super.onDeath(info);
    if (!this.removeMe) spawnWreck(this.L, this.pos, this.yaw, this.variant);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ Gleaner
export class Gleaner extends L1Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'gleaner', name: o.name || 'GLEANER', pos, apMax: 650, impMax: 300, stagDur: 2.0, hitR: 2.4, hitY: 0.2,
                 rad: 2.4, hgt: 2.4, faction: 'ghost', config: cfg, flying: true }, L);
    const r = rig(ctx, gleanerModel(ctx));
    this.model = r.root; this.parts = r.parts; this.root.add(this.model);
    this.mode = cfg.mode || 'defend';
    this.indoor = !!cfg.indoor;
    this.alwaysActive = true;
    this.cd = 1.5 + ctx.random() * 1.5; this.hookCd = 2.5;
    this.ai = { t: 0, orbitA: ctx.random() * PI * 2, alt: 8 + ctx.random() * 8, dive: 0, harvestT: 0 };
    this.latched = false; this.latchT = 0;
    this.harvestPos = null;
    if (cfg.target) { const st = ctx.structures?.get?.(cfg.target); if (st) this.harvestPos = st.pos.clone(); }
    this.home.copy(this.pos);
  }
  harvestTarget() {
    if (this.harvestPos) return this.harvestPos;
    let best = null, bd = 900;
    for (const h of this.L.harvestTargets()) { const d = h.distanceTo(this.pos); if (d < bd) { bd = d; best = h; } }
    if (best) this.harvestPos = best.clone();
    return this.harvestPos;
  }
  fly(dt, tx, ty, tz, speed, k = 2.5) {
    if (this.heldT > 0) return;
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, d = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(speed, d * 1.6);
    this.vel.x = damp(this.vel.x, dx / d * sp, k, dt); this.vel.y = damp(this.vel.y, dy / d * sp, k, dt); this.vel.z = damp(this.vel.z, dz / d * sp, k, dt);
    this.pos.addScaledVector(this.vel, dt);
    const g = this.ground();
    if (this.pos.y < g + 2) { this.pos.y = g + 2; this.vel.y = Math.max(0, this.vel.y); }
    if (Math.hypot(this.vel.x, this.vel.z) > 1) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 4, dt);
  }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const p = this.player(), ai = this.ai;
    ai.t += dt; this.cd -= dt; this.hookCd -= dt;
    this.target = p;
    // the thin rotor whine (L1 §15.5; cosmetic timing)
    if ((ai.whineT = (ai.whineT ?? Math.random() * 3) - dt) <= 0) {
      ai.whineT = 2.4 + Math.random() * 1.2;
      if (p && this.mode !== 'watch' && p.pos.distanceToSquared(this.pos) < 140 * 140) this.ctx.audio?.play?.('rotorWhine', this.pos, { vol: 0.35 });
    }
    if (this.latched) { this.updateLatched(dt, p); return; }
    if (this.stag()) { this.fly(dt, this.pos.x, this.ground() + Math.max(2, ai.alt - 6), this.pos.z, 8); return; }
    if (this.blind()) { const a = this.drift ? this.drift(dt) : 0; this.fly(dt, this.pos.x - Math.sin(a) * 10, this.pos.y, this.pos.z - Math.cos(a) * 10, 6); return; }
    if (this.L.flag('l01:hunt') && (this.mode === 'harvest' || this.mode === 'defend') && !this.indoor && this.tags.has('hunt')) this.mode = 'hunt';
    switch (this.mode) {
      case 'harvest': {
        const h = this.harvestTarget();
        if (p && ((h && p.pos.distanceTo(h) < 60) || this.lastHit > 0 || p.pos.distanceTo(this.pos) < 60)) { this.mode = 'defend'; break; }
        if (!h) { this.mode = 'defend'; break; }
        const a = ai.t * 0.4 + this.id;
        this.fly(dt, h.x + Math.cos(a) * 3, h.y + 4 + Math.sin(ai.t * 1.7) * 0.4, h.z + Math.sin(a) * 3, 14);
        break;
      }
      case 'watch': {
        const w = this.watchAt; if (!w) break;
        this.fly(dt, w.x, w.y, w.z, 12);
        if (p) this.yaw = dampAng(this.yaw, yawTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 2, dt);
        break;
      }
      case 'leave': {
        this.fly(dt, this.pos.x + 60, this.pos.y + 8, this.pos.z - 10, 30);
        if (!p || p.pos.distanceTo(this.pos) > 600) this.removeMe = true;
        break;
      }
      case 'hunt': this.updateHunt(dt, p); break;
      default: this.updateDefend(dt, p);
    }
    if (this.indoor) {   // stay inside the hull (L1 §5 E5)
      const dx = this.pos.x - this.home.x, dz = this.pos.z - this.home.z, d = Math.hypot(dx, dz);
      if (d > 12) { this.pos.x = this.home.x + dx / d * 12; this.pos.z = this.home.z + dz / d * 12; }
      this.pos.y = clamp(this.pos.y, this.home.y - 18, this.home.y + 14);
    }
  }
  updateDefend(dt, p) {
    const ai = this.ai;
    if (!p) { this.fly(dt, this.home.x, this.home.y, this.home.z, 12); return; }
    const d = p.pos.distanceTo(this.pos);
    if (ai.dive > 0) {
      ai.dive -= dt;
      p.center(_c);
      this.fly(dt, _c.x, _c.y + 1, _c.z, 36, 5);
      if (this.pos.distanceTo(_c) < 6 && this.hookCd <= 0) {
        this.hookCd = 2.5; ai.dive = 0;
        this.ctx.combat?.damage?.(p, 180, 120, { team: this.team, owner: this, kind: 'hook', pos: this.pos });
        this.ctx.fx?.sparks?.(_c, 8, [0.7, 1, 0.7], 12);
        this.ctx.audio?.play?.('bladeHit', this.pos, { vol: 0.6 });
      }
      return;
    }
    ai.orbitA += dt * 0.7;
    const R = 20 + (Math.sin(ai.t * 0.3 + this.id) * 0.5 + 0.5) * 30;
    this.fly(dt, p.pos.x + Math.cos(ai.orbitA) * R, p.pos.y + ai.alt, p.pos.z + Math.sin(ai.orbitA) * R, 36);
    if (this.hookCd <= 0 && d < 45 && this.ctx.random() < dt * 0.6) ai.dive = 1.6;
    if (this.cd <= 0 && d < 120 && this.ctx.collision?.lineOfSight?.(this.pos, p.center(_c)) !== false) {
      this.cd = 2 + this.ctx.random();
      p.center(_c); _d.copy(_c).sub(this.pos).normalize().multiplyScalar(140);
      this.shoot({ pos: this.pos.clone(), vel: _d.clone(), kind: 'plasma', dmg: 90, imp: 40, life: 1.0 });
      this.ctx.audio?.play?.('erifle', this.pos, { vol: 0.5 });
    }
  }
  updateHunt(dt, p) {
    const ai = this.ai;
    if (!p) return;
    p.center(_c);
    const d = this.pos.distanceTo(_c);
    if (d > 60) { this.fly(dt, _c.x, Math.max(_c.y + 12, this.ground() + 15), _c.z, 36); return; }
    // dive and try to latch on (L1 §11.2): within 4 m it attaches to the back
    this.fly(dt, _c.x, _c.y + 2, _c.z, 36, 4);
    if (d < 4.5 && this.L.latchCount() < 3 && this.hookCd <= 0) { this.latched = true; this.latchT = 2.5; this.L.counters.latches++; this.ctx.audio?.play?.('metalGroan', this.pos, { vol: 0.6 }); }
  }
  updateLatched(dt, p) {
    if (!p) { this.latched = false; return; }
    this.latchT -= dt;
    const k = this.L.latchIndex(this);
    _v.set(Math.sin(p.bodyYaw) * 1.6 + (k - 1) * 1.2, 7 + k * 0.6, Math.cos(p.bodyYaw) * 1.6);
    this.pos.copy(p.pos).add(_v); this.vel.copy(p.vel); this.yaw = p.bodyYaw;
    this.ai.drainT = (this.ai.drainT ?? 0) + dt;
    if (this.ai.drainT >= 0.25) { this.ai.drainT = 0; this.ctx.combat?.damage?.(p, 35, 0, { team: this.team, owner: this, kind: 'latch' }); }
    if (this.latchT <= 0) this.shake();
  }
  /** shaken off (quick boost, blade, or the latch time ran out) */
  shake() { if (!this.latched) return; this.latched = false; this.hookCd = 3; this.vel.set((this.ctx.random() - 0.5) * 30, 12, (this.ctx.random() - 0.5) * 30); }
  syncRoot() {
    super.syncRoot();
    if (!this.parts) return;
    const t = this.ctx.clock.time;
    this.parts.fan.rotation.y += 0.9;
    this.model.rotation.z = clamp(-this.vel.x * 0.01, -0.3, 0.3) + Math.sin(t * 2 + this.id) * 0.03;
    this.model.rotation.x = this.ai.dive > 0 ? 0.4 : 0;
    const open = this.mode === 'harvest' ? 0.6 : this.latched ? 0.9 : 0.1;
    this.parts.clawL.rotation.z = damp(this.parts.clawL.rotation.z, -open, 4, 1 / 60);
    this.parts.clawR.rotation.z = damp(this.parts.clawR.rotation.z, open, 4, 1 / 60);
  }
  onDeath(info) { this.latched = false; super.onDeath(info); }
}

// ════════════════════════════════════════════════════════════════════════════════════════ Gleaner carrier
export class Carrier extends L1Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'gleaner_carrier', name: o.name || 'GLEANER CARRIER', pos, apMax: 5200, impMax: 1800, stagDur: 3.0, hitR: 7, hitY: 0.5,
                 rad: 7, hgt: 5, faction: 'ghost', config: { ...cfg, haul: undefined }, flying: true }, L);
    const r = rig(ctx, carrierModel(ctx));
    this.model = r.root; this.parts = r.parts; this.root.add(this.model);
    this.alwaysActive = true;
    this.holdAt = cfg.hold ? ctx.world.resolve(cfg.hold, new THREE.Vector3()) : null;
    this.deploy = { every: 12, per: 2, max: 4, cap: 6, ...(cfg.deploy || {}) };
    this.deployed = 0; this.deployT = 6;
    this.flares = cfg.flares ?? 3; this.flareCd = 0; this.flareOnMissiles = !!cfg.flareOnMissiles;
    this.leaveAfter = cfg.leaveAfter ?? null; this.age = 0; this.leaving = false;
    if (cfg.haul) this.setHaulL1(cfg.haul, [0, 4.6, 2.2], true);
    if (this.haul) this.haul.onTaken = () => this.loseFlarePod();
    this.decoys = [];
  }
  loseFlarePod() { this.flares = 0; if (this.parts.flarePod) this.parts.flarePod.visible = false; this.ctx.fx?.sparks?.(this.pos, 20, [1, 0.8, 0.4], 20); }
  update(dt) {
    this.baseUpdate(dt);
    if (!this.alive) return;
    const p = this.player();
    this.age += dt; this.flareCd -= dt; this.deployT -= dt;
    this.target = p;
    this.updateDecoys(dt);
    if (this.leaveAfter != null && this.age > this.leaveAfter) this.leaving = true;
    if (this.leaving) {
      this.fly(dt, this.pos.x + 80, this.pos.y + 10, this.pos.z - 30, 18);
      if (!p || p.pos.distanceTo(this.pos) > 700) { this.removeMe = true; if (!this.ctx.enemies?.despawn) this.alive = false; }
      return;
    }
    const g = this.ground();
    if (this.stag()) { this.fly(dt, this.pos.x, g + 12, this.pos.z, 10); return; }   // sags to 12 m: the TEAR window
    let tx, tz, ty;
    if (p) {
      const anchor = this.holdAt || this.home;
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      const want = clamp(d, 120, 200);
      tx = p.pos.x + dx / d * want; tz = p.pos.z + dz / d * want;
      tx = tx * 0.5 + anchor.x * 0.5; tz = tz * 0.5 + anchor.z * 0.5;
      ty = Math.max(g, this.ground(tx, tz)) + 30 + (Math.sin(this.age * 0.2) * 0.5 + 0.5) * 15;
    } else { tx = this.home.x; tz = this.home.z; ty = this.home.y; }
    this.fly(dt, tx, ty, tz, 14);
    if (p) this.yaw = dampAng(this.yaw, yawTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 0.6, dt);
    // deploy Gleaners
    if (this.deployT <= 0 && !this.blind()) {
      this.deployT = this.deploy.every;
      const encTag = [...this.tags].find(t => t.startsWith('enc:'));
      const alive = this.ctx.enemies?.count?.({ kind: 'gleaner', tag: encTag }) ?? 0;
      for (let i = 0; i < this.deploy.per; i++) {
        if (this.deployed >= this.deploy.max || alive + i >= this.deploy.cap) break;
        this.deployed++;
        _v.copy(this.pos).add(_w.set((i - 0.5) * 3, -3, 0));
        this.ctx.enemies?.spawn?.('gleaner', _v, { name: 'GLEANER', tags: encTag ? [encTag, 'deployed'] : ['deployed'], config: { mode: 'defend' } });
      }
    }
    // flares at homing missiles (L1 §11.3): 4 decoys, 3 uses, 10 s cooldown
    if (this.flares > 0 && this.flareCd <= 0) {
      let incoming = 0;
      this.ctx.projectiles?.forEach?.((pr) => { if (pr.alive && pr.team === 'player' && (pr.kind === 'missile' || pr.kind === 'micro') && pr.target === this && pr.pos.distanceTo(this.pos) < 140) incoming++; });
      if (incoming > 0) this.popFlares();
    }
  }
  popFlares() {
    this.flares--; this.flareCd = 10;
    this.L.counters.carrierFlared++;
    this.ctx.audio?.play?.('flyby', this.pos, { vol: 0.6 });
    for (let i = 0; i < 4; i++) {
      const s = glowSprite('#ffd27a', 6, 1); s.position.copy(this.pos);
      this.ctx.levelRoot.add(s);
      const decoy = { pos: s.position, alive: true, s, vel: new THREE.Vector3((i - 1.5) * 9, 8 + i * 2, (this.ctx.random() - 0.5) * 10), t: 0 };
      this.decoys.push(decoy);
      if (i === 0) this.ctx.projectiles?.retarget?.({ near: this.pos, r: 140, team: 'player', from: this }, decoy);
    }
  }
  updateDecoys(dt) {
    for (const d of this.decoys.slice()) {
      d.t += dt; d.vel.y -= 6 * dt; d.pos.addScaledVector(d.vel, dt); setGlowSize(d.s, 5 + Math.random() * 3);
      if (d.t > 4) { d.alive = false; disposeGlow(d.s); this.decoys.splice(this.decoys.indexOf(d), 1); }
    }
  }
  fly(dt, tx, ty, tz, speed) {
    if (this.heldT > 0) return;
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, d = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(speed, d);
    this.vel.x = damp(this.vel.x, dx / d * sp, 1.2, dt); this.vel.y = damp(this.vel.y, dy / d * sp, 1.2, dt); this.vel.z = damp(this.vel.z, dz / d * sp, 1.2, dt);
    this.pos.addScaledVector(this.vel, dt);
  }
  syncRoot() {
    super.syncRoot();
    if (!this.parts) return;
    const t = this.ctx.clock.time;
    for (const n of ['rotorLBlades', 'rotorRBlades']) this.parts[n].rotation.y += 0.7;
    const tiltK = clamp(Math.hypot(this.vel.x, this.vel.z) * 0.03, 0, 0.4);
    this.parts.rotorL.rotation.x = this.parts.rotorR.rotation.x = -tiltK;
    this.model.rotation.z = Math.sin(t * 0.6 + this.id) * 0.03 + (this.stag() ? Math.sin(t * 5) * 0.08 : 0);
  }
  cleanup() { for (const d of this.decoys) { d.alive = false; disposeGlow(d.s); } this.decoys = []; }
  onDeath(info) { this.cleanup(); this.boomScale = 2.6; this.debris = 14; super.onDeath(info); }
}

/** registers the three kinds with ctx.enemies (factories capture the level runtime) */
export function registerL1Units(ctx, L) {
  ctx.enemies.register('skiff', (c, pos, o = {}) => new Skiff(c, pos, o, L));
  ctx.enemies.register('gleaner', (c, pos, o = {}) => new Gleaner(c, pos, o, L));
  ctx.enemies.register('gleaner_carrier', (c, pos, o = {}) => new Carrier(c, pos, o, L));
}
