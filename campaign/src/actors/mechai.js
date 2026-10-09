// actors/mechai.js (P4): the 'mech' kind. A port of the prototype's makeAC duelist (strafe at a preferred range, random
// hops and hover, dodge quick boosts against incoming fire, rifle bursts, missile volleys, the blade wind-up and lunge,
// the phase-2 energy shock), driven by MechConfig (§4.4):
//   weapons   primary gun 'rifle' | 'mg' | 'shotgun' | 'cannon', plus 'missiles', 'blade', 'shock' (default rifle, missiles, blade)
//   phases    [{ at: AP fraction, aggression?, add?: abilities, preferRange? }]: the prototype's "phase 2 below 50 %"
//   aggression, dodge (qb chance multiplier), preferRange (72; later phases × 0.67 like the prototype's 48)
//   rifleDmg, bladeDmg, shockDmg, follow: 'player' (ally escort)
// A5.1/R14: a mech farther than `leash` from `home` disengages and walks back (default leash Infinity).
// The unit records which behaviours it used in `ai.used` (tests read it).
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap, TAU } from '../core/util.js';
import { Unit } from './enemy.js';
import { buildMech, animateMech } from '../art/mechs.js';
import { isHostile } from '../combat/combat.js';

const DEFAULT_SCHEME = { design: 'striker', base: '#8f8a80', mid: '#6c6a64', accent: '#3f5a58', visor: '#ff3b2a', flame: '#ff6a4a', blade: '#ff4a3a' };
const GUN_PART = { rifle: 'rifle_r30', mg: 'mg_r12', shotgun: 'shotgun_s8', cannon: 'cannon_hc90' };
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _c2 = new THREE.Vector3(), _m = new THREE.Vector3();
const IW = { x: 0, z: 0 };
let shockGeo = null;

class Mech extends Unit {
  init(cfg) {
    const ctx = this.ctx;
    this.cfg = cfg;
    const weapons = cfg.weapons || ['rifle', 'missiles', 'blade'];
    this.abil = new Set(weapons);
    this.gun = weapons.find(w => GUN_PART[w]) || null;
    this.baseAggr = cfg.aggression ?? 1;
    this.phaseIdx = 0;
    this.phases = (cfg.phases || []).slice().sort((a, b) => b.at - a.at);
    this.boomScale = 2.6; this.debris = 14; this.debrisScale = 1.3; this.stagDur = 2.6;
    Object.assign(this.ai, { strafe: 1, strafeT: 2, hoverT: 0, qbCd: 2, qbT: 0, burst: 0, bt: 0, msCd: 6, bladeCd: 4, bladeWind: 0,
                             lungeT: 0, bladeT: 0, shockCd: 9, shockWind: 0, landT: 0, recoil: 0, thrust: 0, hover: 0, dangerT: 0,
                             aggr: this.baseAggr, prefer: cfg.preferRange ?? (this.behavior === 'sniper' ? 160 : 72), returning: false,
                             used: { rifle: 0, mg: 0, shotgun: 0, cannon: 0, missiles: 0, blade: 0, dodge: 0, shock: 0, hop: 0 } });
    this.yaw = this.ai.yaw0 ?? 0;
    // shock sphere: a private additive material (its opacity animates)
    if (!shockGeo) { shockGeo = new THREE.SphereGeometry(1, 24, 16); shockGeo.userData.shared = true; }
    const col = this.rig.scheme?.blade ?? '#ff5040';
    this.shockMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.shockMesh = new THREE.Mesh(shockGeo, this.shockMat);
    this.shockMesh.visible = false; this.shockMesh.frustumCulled = false; this.shockMesh.name = 'shock';
    ctx.levelRoot.add(this.shockMesh);
    this.pos.y = Math.max(this.pos.y, this.supportAt(this.pos.x, this.pos.z, this.pos.y + 2));
  }
  cleanup() {
    if (this.shockMesh) { this.shockMesh.visible = false; this.shockMesh.parent?.remove(this.shockMesh); }
    this.shockMat?.dispose(); this.shockMat = null;
  }
  get aggression() { return this.ai.aggr; }
  /** phase transitions: the first phase whose AP fraction is crossed (prototype phase 2 at 50 %) */
  updatePhase() {
    const frac = this.ap / this.apMax;
    while (this.phaseIdx < this.phases.length && frac < this.phases[this.phaseIdx].at) {
      const ph = this.phases[this.phaseIdx++];
      if (ph.aggression != null) this.ai.aggr = ph.aggression;
      for (const a of ph.add || []) this.abil.add(a);
      this.ai.prefer = ph.preferRange ?? (this.cfg.preferRange ?? (this.behavior === 'sniper' ? 160 : 72)) * 0.67;
      this.ai.qbFast = true;
      this.ctx.events.emit('unit:phase', { unit: this, phase: this.phaseIdx + 1 });
      this.cfg.onPhase?.(this, this.phaseIdx + 1);
    }
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, cfg = this.cfg;
    if (this.dropping) this.dropping = false;   // a drop is just a fall: the prototype physics below handle it
    if (this.behavior === 'scripted') { this.animate(dt, null, Infinity, false); return; }
    this.updatePhase();
    const aggr = ai.aggr, dodgeK = cfg.dodge ?? 1;
    // leash (R14): beyond `leash` from home, disengage and walk back; resume inside half the leash
    if (this.outsideLeash()) ai.returning = true;
    else if (ai.returning && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) < this.effLeash() * 0.5) ai.returning = false;
    const T = ai.returning ? null : this.acquire(dt, Math.max(this.aggroRange, 420));
    if (ai.returning) this.target = null;
    let P = T ? T.pos : null;
    let idle = null;
    if (!P) { idle = this.idleWish(1, IW); P = idle; }   // patrol, escort (config.follow 'player'), home
    const dx = P ? P.x - this.pos.x : 0, dz = P ? P.z - this.pos.z : 0, dist = P ? Math.hypot(dx, dz) || 1 : Infinity;
    const dirx = P ? dx / dist : 0, dirz = P ? dz / dist : 0;
    if (P && (T || dist > 3)) this.yaw = dampAng(this.yaw, yawTo(dx, dz), 6, dt);
    ai.qbT -= dt; ai.qbCd -= dt; ai.msCd -= dt; ai.bladeCd -= dt; ai.shockCd -= dt; ai.landT = Math.max(0, ai.landT - dt * 2.5);
    ai.recoil = damp(ai.recoil, 0, 10, dt);
    let wishx = 0, wishz = 0, speed = 30 * aggr, ascend = false;
    const busy = this.stagT > 0 || ai.bladeWind > 0 || ai.shockWind > 0 || ai.lungeT > 0;
    if (this.stagT > 0 || this.heldT > 0) { /* stunned or held */ }
    else if (ai.shockWind > 0) {
      ai.shockWind -= dt;
      const k = 1 - ai.shockWind / 1.4;
      this.shockMesh.visible = true; this.shockMesh.position.copy(this.center(_c)); this.shockMesh.scale.setScalar(2 + k * 6 + Math.random() * 0.5);
      this.shockMat.opacity = 0.2 + k * 0.4;
      if (ai.shockWind <= 0) {
        this.shockMesh.visible = false;
        const c = this.center(new THREE.Vector3());
        ctx.fx?.explosion?.(c, 2.2);
        ctx.fx?.shockwave?.(c, 36, this.rig.scheme?.blade ?? '#ff5040', 0.5);
        const A = ctx.particles?.add;
        if (A) for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; A.spawn(c.x, c.y - 3, c.z, Math.cos(a) * 60, 2, Math.sin(a) * 60, 0.55, 4, 7, 1, 0.4, 0.3, 1, 2, 0, 0); }
        // prototype: the player within 36 m of the centre takes the full hit; now every hostile within 36 m
        ctx.combat?.radial(c, 36, cfg.shockDmg ?? 2600, 900, { team: this.team, owner: this, kind: 'shock', pos: c.clone() }, { falloff: false });
        ai.shockCd = this.rnd(11, 14);
      }
    } else if (ai.bladeWind > 0) {
      ai.bladeWind -= dt;
      if (ai.bladeWind <= 0) { ai.lungeT = 0.45; this.sfx('blade'); }
    } else if (ai.lungeT > 0) {
      ai.lungeT -= dt;
      wishx = dirx; wishz = dirz; speed = 105;
      this.vel.x = dirx * 105; this.vel.z = dirz * 105;
      if (T) this.vel.y = clamp((T.pos.y - this.pos.y) * 4, -40, 40);
      if (T && T.center(_c).distanceTo(this.center(_c2)) < 10) {
        ai.lungeT = 0; ai.bladeT = 0.4; this.vel.multiplyScalar(0.2);
        ctx.combat?.damage(T, cfg.bladeDmg ?? 2000, 750, { team: this.team, owner: this, kind: 'blade', pos: this.pos.clone() });
        this.sfx('bladeHit');
        ctx.fx?.sparks?.(T.center(_c), 30, [0.6, 0.9, 1], 35);
        ai.bladeCd = this.rnd(5, 7) / aggr;
      } else if (ai.lungeT <= 0) { ai.bladeT = 0.4; ai.bladeCd = this.rnd(4, 6) / aggr; }
    } else if (P) {
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { if (this.behavior !== 'flank') ai.strafe = ctx.random() < 0.6 ? -ai.strafe : ai.strafe; ai.strafeT = this.rnd(1.4, 3.2); }
      const escort = this.behavior === 'escort' || cfg.follow === 'player';
      const prefer = T ? ai.prefer : (escort && !ai.returning ? 35 : 3);
      const radial = clamp((dist - prefer) / 30, -1, 1);
      const side = T ? 0.9 : 0;
      wishx = dirx * radial - dirz * ai.strafe * side; wishz = dirz * radial + dirx * ai.strafe * side;
      const wl = Math.hypot(wishx, wishz) || 1; wishx /= wl; wishz /= wl;
      if (!T && dist < prefer + 8) { wishx = wishz = 0; }
      if (T) {
        if (this.onGround && ctx.random() < dt * 0.3) { this.vel.y = 20; ai.hoverT = this.rnd(0.8, 2.2); ai.used.hop++; }
        if (T.pos.y - this.pos.y > 25 && ctx.random() < dt * 2) ai.hoverT = Math.max(ai.hoverT, 1.2);
        // dodge incoming fire (prototype: 0.7 vs missiles within 50 m, 0.18 vs bullets within 140 m, × aggression)
        ai.dangerT -= dt;
        if (ai.dangerT <= 0) {
          ai.dangerT = 0.2;
          if (ai.qbCd <= 0 && dodgeK > 0) this.dodge(dirx, dirz, aggr * dodgeK);
        }
        if (this.canFire()) this.attacks(T, dist, aggr, dt);
      }
    }
    if (ai.burst > 0 && !busy && this.canFire()) this.gunFire(T, aggr, dt);
    else if (busy) { /* bursts pause */ }
    // movement physics (prototype)
    const hv = ai.qbT > 0 ? 1.2 : (this.onGround ? 5 : 2.2);
    if (this.stagT > 0) { wishx = wishz = 0; }
    if (this.blindT > 0 && ai.lungeT <= 0) { const a = this.drift(dt); wishx = Math.cos(a); wishz = Math.sin(a); speed = 8; }
    if (this.heldT <= 0) {
      if (ai.lungeT <= 0) {
        this.vel.x = damp(this.vel.x, wishx * speed, hv, dt); this.vel.z = damp(this.vel.z, wishz * speed, hv, dt);
      }
      ai.hoverT -= dt;
      ascend = ai.hoverT > 0 && this.stagT <= 0;
      if (ascend) this.vel.y = Math.min(18, this.vel.y + 68 * dt);
      if (ai.lungeT <= 0) this.vel.y -= 45 * dt;
      if (ai.shockWind > 0 || ai.bladeWind > 0) { this.vel.x *= 0.92; this.vel.z *= 0.92; if (!this.onGround) this.vel.y = Math.max(this.vel.y, -4); }
      this.vel.y = Math.max(this.vel.y, -70);
      this.pos.addScaledVector(this.vel, dt);
      ctx.collision?.resolve(this);
      const g = this.supportAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y <= g) {
        if (!this.onGround && this.vel.y < -25) { ai.landT = 0.3; ctx.fx?.dust?.(this.pos, 10, 4); ctx.fx?.landing?.(this.pos, 1); this.sfx('land'); }
        this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); this.onGround = true;
      } else if (this.onGround && this.pos.y - g < 1.2 && this.vel.y <= 0) { this.pos.y = g; this.vel.y = 0; }
      else this.onGround = false;
      this.keepInPlayArea();
    }
    ai.bladeT = Math.max(0, ai.bladeT - dt);
    this.animate(dt, T, dist, ascend);
  }
  dodge(dirx, dirz, k) {
    const ai = this.ai, ctx = this.ctx;
    let done = false;
    ctx.projectiles?.forEach((p) => {
      if (done || !isHostile(p.team, this.team)) return;
      const rx = this.pos.x - p.pos.x, rz = this.pos.z - p.pos.z, rd = Math.hypot(rx, rz);
      const msl = p.kind === 'missile' || p.kind === 'micro';
      if (rd < (msl ? 50 : 140) && (rx * p.vel.x + rz * p.vel.z) > 0 && ctx.random() < (msl ? 0.7 : 0.18) * k) {
        const s = ctx.random() < 0.5 ? -1 : 1;
        this.vel.x += -dirz * s * 88; this.vel.z += dirx * s * 88; ai.qbT = 0.3; ai.qbCd = ai.qbFast ? 0.9 : 1.5;
        this.sfx('qb');
        ctx.fx?.boost?.(_m.set(this.pos.x, this.pos.y + 7, this.pos.z), _c.set(dirz * s, 0, -dirx * s));
        ai.used.dodge++;
        done = true;
      }
    });
  }
  attacks(T, dist, aggr, dt) {
    const ai = this.ai, ctx = this.ctx, A = this.abil;
    if (A.has('blade') && dist < 42 && ai.bladeCd <= 0) { ai.bladeWind = 0.5; this.sfx('charge'); ai.used.blade++; }
    else if (A.has('shock') && ai.shockCd <= 0 && dist < 60) {
      ai.shockWind = 1.4; this.sfx('charge'); ai.used.shock++;
      if (T.kind === 'player') ctx.hud?.warn?.('ENERGY SURGE — BOOST AWAY', 1.4);
    } else if (A.has('missiles') && ai.msCd <= 0 && dist < 380) {
      ai.msCd = this.rnd(7, 9) / aggr; ai.used.missiles++;
      for (let i = 0; i < 4; i++) {
        const jx = this.rnd(-0.6, 0.6), jz = this.rnd(-0.6, 0.6);
        ctx.timers.after(i * 0.11, () => {
          if (!this.alive || this.asleep || !T.alive) return;
          const from = (this.rig.pod || this.rig.root).getWorldPosition(new THREE.Vector3());
          const v = new THREE.Vector3(jx, 1, jz).normalize().multiplyScalar(50);
          this.fire({ pos: from, vel: v, dmg: 420, imp: 220, kind: 'missile', target: T, turn: 1.7, accel: 90, maxSpeed: 150, life: 6, srcKind: 'missiles' });
          this.sfx('missile');
        });
      }
    } else if (this.gun && dist < (this.gun === 'shotgun' ? 90 : 320)) {
      if (ai.burst <= 0 && ctx.random() < (this.gun === 'shotgun' ? 1.6 : 0.9) * aggr * dt) {
        ai.burst = this.gun === 'mg' ? 5 : this.gun === 'rifle' ? 3 : 1; ai.bt = 0; ai.used[this.gun]++;
      }
    }
  }
  gunFire(T, aggr, dt) {
    const ai = this.ai, ctx = this.ctx, cfg = this.cfg;
    ai.bt -= dt;
    if (ai.bt > 0) return;
    ai.burst--;
    const from = this.rig.muzzle.getWorldPosition(new THREE.Vector3());
    const err = 2.6 / aggr;
    let dir, fxKind = 'rifle';
    if (this.gun === 'shotgun') {
      ai.bt = 1.2; fxKind = 'shotgun';
      dir = this.lead(from, T, 520, new THREE.Vector3()).sub(from).normalize();
      for (let i = 0; i < 8; i++) {
        _v.copy(dir); _v.x += this.rnd(-0.045, 0.045); _v.y += this.rnd(-0.045, 0.045); _v.z += this.rnd(-0.045, 0.045);
        this.fire({ pos: from, vel: _v.normalize().multiplyScalar(520), dmg: 70, imp: 35, kind: 'ebullet', life: 0.18, srcKind: 'shotgun',
                    falloff: [40, 80, 90], scale: 0.7 });
      }
      this.sfx('shotgun');
    } else if (this.gun === 'cannon') {
      ai.bt = 1.5; fxKind = 'cannon';
      dir = this.lead(from, T, 260, new THREE.Vector3()).sub(from).normalize();
      this.fire({ pos: from, vel: _v.copy(dir).multiplyScalar(260), dmg: 900, imp: 600, splash: 8, splashDmg: 400, kind: 'shell', life: 2.5,
                  srcKind: 'cannon', scale: 1.3 });
      this.sfx('cannon');
    } else {
      const mg = this.gun === 'mg';
      ai.bt = mg ? 0.09 : 0.13;
      const aim = this.lead(from, T, 600, new THREE.Vector3());
      aim.x += this.rnd(-err, err); aim.y += this.rnd(-err, err); aim.z += this.rnd(-err, err);
      dir = aim.sub(from).normalize();
      this.fire({ pos: from, vel: _v.copy(dir).multiplyScalar(600), dmg: cfg.rifleDmg ?? (mg ? 120 : 220), imp: mg ? 40 : 85,
                  kind: 'ebullet', life: 1.2, srcKind: this.gun });
      this.sfx(mg ? 'mg' : 'erifle');
    }
    ai.recoil = 1;
    ctx.fx?.muzzle?.(from, dir, fxKind);
  }
  animate(dt, T, dist, ascend) {
    const ai = this.ai, r = this.rig;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fwd = -(this.vel.x * sy + this.vel.z * cy), lat = this.vel.x * cy - this.vel.z * sy;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    ai.thrust = damp(ai.thrust, ai.qbT > 0 || ai.lungeT > 0 ? 1.4 : clamp(hs / 30, 0, 1) * 0.6 + (ascend ? 0.4 : 0), 10, dt);
    ai.hover = damp(ai.hover, ascend ? 1 : 0, 10, dt);
    let pitch = 0;
    if (T) { const pc = T.center(_c), mz = r.muzzle.getWorldPosition(_m); pitch = Math.atan2(pc.y - mz.y, Number.isFinite(dist) ? dist : 100); }
    animateMech(r, { fwd, lat, onGround: this.onGround, pitch, thrust: ai.thrust, hover: ai.hover, landT: ai.landT, bladeT: ai.bladeT,
                     bladeWind: ai.bladeWind > 0 || ai.lungeT > 0, recoil: ai.recoil, crouch: this.stagT > 0 ? 0.3 : 0 }, dt);
    r.root.rotation.z = this.stagT > 0 ? Math.sin(this.ctx.clock.time * 30) * 0.02 : 0;
  }
}

export function install(ctx) {
  ctx.enemies.register('mech', (c, pos, o = {}) => {
    const cfg = o.config || {};
    let scheme = cfg.scheme;
    if (!scheme) {
      const f = cfg.faction || o.faction;
      const fp = f && (c.mission?.def?.factions || c.world?.def?.factions)?.[f];
      scheme = { ...DEFAULT_SCHEME, design: cfg.design || DEFAULT_SCHEME.design,
                 ...(fp ? { base: fp.shell, mid: fp.mid || fp.shell, accent: fp.accent, visor: fp.eye, dark: fp.dark, wear: fp.wear } : {}) };
    } else if (cfg.design && !scheme.design) scheme = { ...scheme, design: cfg.design };
    const weapons = cfg.weapons || ['rifle', 'missiles', 'blade'];
    const gun = weapons.find(w => GUN_PART[w]);
    const rig = buildMech(c, scheme, { parts: { R: gun ? GUN_PART[gun] : undefined, L: weapons.includes('blade') ? 'blade_pb2' : undefined,
                                                S: weapons.includes('missiles') ? 'msl_vm4' : undefined } });
    const u = new Mech(c, { kind: 'mech', name: o.name || 'FRAME', pos, apMax: cfg.ap ?? 9000, impMax: cfg.impMax ?? 2600,
                            stagDur: 2.6, rig, hitR: 4.2, hitY: 5.5, rad: 2.6, hgt: 9.5, onGround: true,
                            faction: cfg.faction || o.faction || 'hostile', team: o.team || 'enemy', config: cfg });
    u.root.add(rig.root);
    u.debrisMat = rig.mats?.base;
    u.ai.yaw0 = o.yaw ?? 0;
    u.init(cfg);
    return u;
  });
}
export { Mech };
