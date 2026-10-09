// actors/enemytypes.js (P4): the non-mech unit kinds, registered with ctx.enemies (models from art/units.js).
//   drone, tank, tank_heavy, turret, beacon   ports of the prototype's makeDrone / makeTank / makeTurret / makeBeacon
//   gunship, walker, artillery, apc, dropship  new kinds (§4.4, Appendix C.5)
// Every kind targets the nearest hostile (Unit.acquire: enemies prefer the player, allies hunt enemies), uses
// ctx.timers for delayed shots (no setTimeout), ctx.random for gameplay randomness, honours blindT (no fire, drift) and
// heldT (an outside force owns pos), and supports the behaviours 'assault' (default), 'hold', 'guard', 'patrol' and
// 'scripted' (no AI at all: level code drives pos/yaw).
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap, TAU } from '../core/util.js';
import { Unit } from './enemy.js';
import { buildUnit, animateUnit } from '../art/units.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();
const _iw = { x: 0, z: 0 };

// kind → base stats (Appendix C.5)
const STATS = {
  drone:      { ap: 820, impMax: 500, name: 'DRONE' },
  tank:       { ap: 3000, impMax: 1000, name: 'TANK' },
  tank_heavy: { ap: 7200, impMax: 2200, name: 'HEAVY TANK' },
  turret:     { ap: 2000, impMax: 800, name: 'TURRET' },
  gunship:    { ap: 2600, impMax: 700, name: 'GUNSHIP' },
  walker:     { ap: 9000, impMax: 2600, name: 'WALKER' },
  artillery:  { ap: 2400, impMax: 900, name: 'ARTILLERY' },
  apc:        { ap: 2800, impMax: 1000, name: 'APC' },
  beacon:     { ap: 3200, impMax: Infinity, name: 'BEACON' },
  dropship:   { ap: 6000, impMax: Infinity, name: 'DROPSHIP' },
};

// shared additive "tell" glow (barrel charge, stomp wind-up): one geometry, one material per colour
let tellGeo = null;
const tellMats = new Map();
function tellMesh(ctx, color, r = 0.9) {
  if (!tellGeo) { tellGeo = new THREE.SphereGeometry(1, 10, 8); tellGeo.userData.shared = true; }
  let m = tellMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    m.userData.shared = true; tellMats.set(color, m);
  }
  const mesh = new THREE.Mesh(tellGeo, m);
  mesh.scale.setScalar(0.001); mesh.visible = false; mesh.userData.r = r; mesh.name = 'tell';
  return mesh;
}
function setTell(mesh, k) {
  if (!mesh) return;
  mesh.visible = k > 0.02;
  mesh.scale.setScalar(Math.max(0.001, k * mesh.userData.r));
}

function muzzleWorld(u, i, out) {
  const m = u.rig?.muzzles?.length ? u.rig.muzzles[i % u.rig.muzzles.length] : null;
  if (m) return m.getWorldPosition(out);
  return u.center(out);
}
function flashMuzzle(ctx, from, dir, kind, color, intensity, dist) {
  ctx.fx?.muzzle?.(from, dir, kind);
  ctx.particles?.lights?.flash?.(from, color, intensity, dist, 0.15);
}

/** common factory plumbing: model, stats, hit volume from the rig, faction, team, config */
function make(Cls, kind, ctx, pos, o, extra = {}) {
  const S = STATS[kind];
  const faction = o.faction || 'hostile';
  const rig = buildUnit(ctx, kind, faction, o.config?.model || {});
  const u = new Cls(ctx, {
    kind, name: S.name, pos, apMax: S.ap, impMax: S.impMax, rig,
    rad: rig.rad, hgt: rig.hgt, hitR: rig.hit.r, hitY: rig.hit.center[1], hitYScale: rig.hit.yScale || 0,
    faction, team: o.team || 'enemy', config: o.config || null, ...extra,
  });
  u.root.add(rig.root);
  const fm = ctx.materials?.factionSet?.(faction);
  if (fm?.shell) u.debrisMat = fm.shell;
  u.init?.(o);
  return u;
}

// ===================================================================================================== drone
class Drone extends Unit {
  init() {
    this.flying = true; this.boomScale = 0.9; this.debris = 4; this.debrisScale = 0.6;
    this.ai.orbitDir = this.ctx.random() < 0.5 ? -1 : 1; this.ai.orbitR = this.rnd(60, 110); this.ai.alt = this.rnd(12, 26);
    if (this.behavior === 'sniper') this.ai.orbitR = this.rnd(150, 200);
    else if (this.behavior === 'flank') this.ai.orbitR *= 1.3;
    this.ai.range = this.behavior === 'sniper' ? 260 : 240;
    const g = this.groundAt();
    if (this.pos.y < g + 10) this.pos.y = g + this.rnd(14, 24);
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, T = this.behavior === 'scripted' ? null : this.acquire(dt);
    if (this.behavior === 'scripted') { animateUnit(this.rig, dt, { speed: this.vel.length() }); return; }
    let tx, tz, dx = 0, dz = 0, dist = Infinity;
    if (T) {
      dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz);
      if (ai.orbitA === undefined) ai.orbitA = Math.atan2(this.pos.z - T.pos.z, this.pos.x - T.pos.x);
      ai.orbitA += ai.orbitDir * dt * 0.35;
      if (ctx.random() < dt * 0.15) ai.orbitDir *= -1;
      if (dist > Math.max(240, ai.orbitR + 60)) { tx = T.pos.x; tz = T.pos.z; }
      else { tx = T.pos.x + Math.cos(ai.orbitA) * ai.orbitR; tz = T.pos.z + Math.sin(ai.orbitA) * ai.orbitR; }
    } else {
      // no target: patrol / escort / loiter around home
      ai.orbitA = (ai.orbitA ?? 0) + dt * 0.25;
      const c = this.idleWish(1, _iw) || this.home;
      const r = this.behavior === 'patrol' ? 0 : 30;
      tx = c.x + Math.cos(ai.orbitA) * r; tz = c.z + Math.sin(ai.orbitA) * r;
      dx = tx - this.pos.x; dz = tz - this.pos.z;
    }
    if (this.heldT <= 0) {
      const ty = Math.max(this.groundAt(tx, tz), this.groundAt()) + ai.alt + Math.sin(ctx.clock.time * 1.3 + ai.orbitR) * 3;
      const want = _v.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
      const wl = want.length(); want.multiplyScalar(Math.min(34, wl * 1.2) / (wl || 1));
      if (this.stagT > 0) want.set(0, -6, 0);
      else if (this.blindT > 0) { this.drift(dt); want.set(Math.cos(ai.driftA) * 8, -1, Math.sin(ai.driftA) * 8); }
      this.vel.x = damp(this.vel.x, want.x, 1.6, dt); this.vel.y = damp(this.vel.y, want.y, 1.6, dt); this.vel.z = damp(this.vel.z, want.z, 1.6, dt);
      this.pos.addScaledVector(this.vel, dt);
      const gh = this.groundAt() + 3; if (this.pos.y < gh) this.pos.y = gh;
      this.keepInPlayArea();
    }
    this.yaw = dampAng(this.yaw, yawTo(dx, dz), 5, dt);
    const r = this.rig.root;
    r.rotation.z = -(this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)) * 0.01;
    animateUnit(this.rig, dt, { speed: this.vel.length(), alert: !!T });
    this.cd -= dt;
    if (this.cd <= 0 && this.canFire() && dist < ai.range) {
      this.cd = this.rnd(1.5, 2.6);
      const from = muzzleWorld(this, 0, new THREE.Vector3());
      const aim = this.lead(from, T, 130, _w).lerp(T.center(_c), 0.4);
      const v = aim.sub(from).normalize();
      this.fire({ pos: from, vel: v.clone().multiplyScalar(130), dmg: 150, imp: 45, kind: 'plasma', life: 3, srcKind: 'plasma' });
      this.sfx('plasma');
      flashMuzzle(ctx, from, v, 'plasma', 0xff4a2a, 300, 20);
    }
  }
}

// ===================================================================================================== tanks
class Tank extends Unit {
  init() {
    this.heavy = this.kind === 'tank_heavy';
    this.boomScale = this.heavy ? 2 : 1.4; this.debris = this.heavy ? 12 : 8;
    this.ai.strafe = this.ctx.random() < 0.5 ? -1 : 1; this.ai.strafeT = this.rnd(2, 5);
    this.yaw = this.rnd(0, TAU);
    this.onGround = true;
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    const m = this.rig.muzzles[0];
    if (m) { this.tell = tellMesh(this.ctx, 0xff5a20, this.heavy ? 1.3 : 0.9); m.add(this.tell); }
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, P = this.rig.parts;
    if (this.behavior === 'scripted') { animateUnit(this.rig, dt, { speed: Math.hypot(this.vel.x, this.vel.z) }); return; }
    const T = this.acquire(dt);
    let mvx = 0, mvz = 0, dist = Infinity, dx = 0, dz = 0;
    if (T) { dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz) || 1; }
    if (this.stagT <= 0) {
      const B = this.behavior;
      ai.strafeT -= dt; if (ai.strafeT <= 0) { if (B !== 'flank') ai.strafe *= -1; ai.strafeT = this.rnd(2, 5); }
      if (this.blindT > 0) { this.drift(dt); mvx = Math.cos(ai.driftA) * 4; mvz = Math.sin(ai.driftA) * 4; }
      else if (this.outsideLeash()) {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hl = Math.hypot(hx, hz) || 1;
        mvx = hx / hl * 8; mvz = hz / hl * 8;
      } else if (!T) { this.idleWish(8, _iw); mvx = _iw.x; mvz = _iw.z; }
      else if (B !== 'hold') {
        // prototype: close to 150 m, then strafe; sniper keeps 200–260 m, flank circles wider and never reverses
        const near = B === 'sniper' ? 200 : B === 'flank' ? 120 : 150, far = B === 'sniper' ? 260 : near;
        if (dist > far) { const s = this.heavy ? 7 : 10; mvx = dx / dist * s; mvz = dz / dist * s; }
        else if (B === 'sniper' && dist < near) { const s = this.heavy ? 4 : 6; mvx = -dx / dist * s; mvz = -dz / dist * s; }
        else { const s = (this.heavy ? 3 : 6) * (B === 'flank' ? 1.6 : 1); mvx = -dz / dist * ai.strafe * s; mvz = dx / dist * ai.strafe * s; }
      }
    }
    this.moveGround(dt, mvx, mvz, 1, 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.5) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 2, dt);
    if (T && P.turret) {
      P.turret.rotation.y = dampAng(P.turret.rotation.y, angWrap(yawTo(dx, dz) - this.yaw), 1.8, dt);
      if (P.barrelPivot) {
        const tip = muzzleWorld(this, 0, _t), pc = T.center(_c);
        P.barrelPivot.rotation.x = damp(P.barrelPivot.rotation.x, clamp(Math.atan2(pc.y - tip.y, dist), -0.2, 0.6), 3, dt);
      }
    }
    animateUnit(this.rig, dt, { speed: sp, alert: !!T });
    this.cd -= dt;
    if (this.canFire() && dist < 270) {
      if (this.cd < 0.7 && this.cd > 0) setTell(this.tell, (0.7 - this.cd) / 0.7);   // barrel glow tell (prototype)
      if (this.cd <= 0) {
        setTell(this.tell, 0);
        const n = this.heavy ? 3 : 1;
        for (let k = 0; k < n; k++) ctx.timers.after(k * 0.26, () => this.shoot(k));
        this.cd = this.heavy ? this.rnd(3.6, 4.6) : this.rnd(3.2, 4.4);
      }
    } else setTell(this.tell, 0);
  }
  shoot(k) {
    const T = this.target, ctx = this.ctx;
    if (!this.alive || !T || !T.alive || this.asleep) return;
    const from = muzzleWorld(this, k, new THREE.Vector3());
    const aim = this.lead(from, T, 240, new THREE.Vector3());
    aim.x += this.rnd(-2, 2) * k; aim.z += this.rnd(-2, 2) * k;
    const dir = aim.sub(from).normalize();
    this.fire({ pos: from, vel: dir.clone().multiplyScalar(240), dmg: this.heavy ? 600 : 680, imp: 340, kind: 'shell', life: 2.5, srcKind: 'shell' });
    this.sfx('cannon');
    flashMuzzle(ctx, from, dir, 'cannon', 0xffa050, 1200, 30);
    for (let s = 0; s < 6; s++) {   // cosmetic muzzle smoke (prototype)
      ctx.particles?.smoke?.spawn?.(from.x, from.y, from.z, (Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6,
                                    1.5, 2, 6, 0.3, 0.28, 0.26, 0.6, 1, 0, 1);
    }
  }
}

// ===================================================================================================== turret
class Turret extends Unit {
  init() {
    this.immovable = true; this.boomScale = 1.1; this.debris = 5; this.onGround = true; this.flying = true;
    this.ai.burst = 0; this.ai.bt = 0; this.ai.mi = 0;
    const g = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    if (this.pos.y < g) this.pos.y = g;
    this.addBodyCollider(2.0, 3.2);
  }
  update(dt) {
    this.baseUpdate(dt);
    const ai = this.ai, P = this.rig.parts;
    animateUnit(this.rig, dt, {});
    this.syncColliders();
    if (this.behavior === 'scripted') return;
    const T = this.acquire(dt, Math.max(this.aggroRange, 300));
    if (!T) return;
    const pc = T.center(_c), c = this.center(_t);
    const dx = pc.x - c.x, dz = pc.z - c.z, dist = Math.hypot(dx, dz);
    if (P.head && !(this.blindT > 0)) {
      P.head.rotation.y = dampAng(P.head.rotation.y, angWrap(yawTo(dx, dz) - this.yaw), 2.4, dt);
      P.head.rotation.x = damp(P.head.rotation.x, clamp(Math.atan2(pc.y - c.y, dist), -0.5, 0.8), 3, dt);
    }
    this.cd -= dt;
    if (!this.canFire() || dist > 260) { ai.burst = 0; return; }
    if (this.cd <= 0 && ai.burst <= 0) { ai.burst = 6; ai.bt = 0; this.cd = this.rnd(2.6, 3.4); }
    if (ai.burst > 0) {
      ai.bt -= dt;
      if (ai.bt <= 0) {
        ai.bt = 0.1; ai.burst--;
        const from = muzzleWorld(this, ai.mi++, new THREE.Vector3());
        const aim = this.lead(from, T, 420, _w);
        const spread = this.ai.spread ?? 1;   // levels may tighten it (floodlight: SPOTTED)
        aim.x += this.rnd(-1.5, 1.5) * spread; aim.y += this.rnd(-1, 1) * spread; aim.z += this.rnd(-1.5, 1.5) * spread;
        const dir = aim.sub(from).normalize();
        this.fire({ pos: from, vel: dir.clone().multiplyScalar(420), dmg: 85, imp: 22, kind: 'ebullet', life: 1.4, srcKind: 'turret' });
        this.sfx('turret');
        this.ctx.fx?.muzzle?.(from, dir, 'turret');
      }
    }
  }
}

// ===================================================================================================== beacon
class Beacon extends Unit {
  init() {
    this.immovable = true; this.objective = true; this.boomScale = 1.8; this.debris = 8; this.onGround = true; this.flying = true;
    this.hitY = 8; this.hitR = 3.5;
    this.ai.spawnT = this.rnd(4, 8); this.ai.spawned = [];
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.addBodyCollider(2.6, 17);
  }
  hitTest(q) { const dx = q.x - this.pos.x, dz = q.z - this.pos.z; return dx * dx + dz * dz < 12 && q.y > this.pos.y && q.y < this.pos.y + 18; }
  update(dt) {
    this.baseUpdate(dt);
    const ai = this.ai, beam = this.rig.parts.beam;
    if (beam) { const k = 1 + Math.sin(this.ctx.clock.time * 5) * 0.25; beam.scale.set(k, 1, k); }
    animateUnit(this.rig, dt, {});
    this.syncColliders();
    if (this.behavior === 'scripted') return;
    ai.spawnT -= dt;
    if (ai.spawnT <= 0) {
      ai.spawnT = this.rnd(11, 15);
      ai.spawned = ai.spawned.filter(d => d.alive);
      if (ai.spawned.length < 6) {
        const p = new THREE.Vector3(this.pos.x + this.rnd(-10, 10), this.pos.y + 120, this.pos.z + this.rnd(-10, 10));
        const d = this.ctx.enemies.spawn('drone', p, { team: this.team, faction: this.faction, tags: [...this.tags] });
        d.pos.y = this.pos.y + 120;
        ai.spawned.push(d);
        this.sfx('dropship');
      }
    }
  }
}

// ===================================================================================================== gunship
class Gunship extends Unit {
  init() {
    this.flying = true; this.boomScale = 1.6; this.debris = 9;
    this.ai.orbitDir = this.ctx.random() < 0.5 ? -1 : 1; this.ai.r = this.rnd(110, 170); this.ai.alt = this.rnd(25, 45);
    this.ai.burst = 0; this.ai.bt = 0; this.ai.rcd = this.rnd(3, 5); this.ai.mi = 0; this.ai.pod = 0;
    const g = this.groundAt();
    if (this.pos.y < g + 20) this.pos.y = g + this.ai.alt;
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, P = this.rig.parts;
    animateUnit(this.rig, dt, { speed: this.vel.length() });
    if (this.behavior === 'scripted') return;
    const T = this.acquire(dt);
    let tx = this.home.x, tz = this.home.z, dist = Infinity, dx = 0, dz = 0;
    if (T) {
      dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz) || 1;
      if (ai.a === undefined) ai.a = Math.atan2(this.pos.z - T.pos.z, this.pos.x - T.pos.x);
      // strafing orbit: ~18 m/s around the target, changing direction now and then
      ai.a += ai.orbitDir * dt * 18 / ai.r;
      if (ctx.random() < dt * 0.08) ai.orbitDir *= -1;
      tx = T.pos.x + Math.cos(ai.a) * ai.r; tz = T.pos.z + Math.sin(ai.a) * ai.r;
    } else {
      const c = this.idleWish(1, _iw);
      if (c) { tx = c.x; tz = c.z; }
    }
    if (this.heldT <= 0) {
      const ty = Math.max(this.groundAt(tx, tz), this.groundAt()) + ai.alt + Math.sin(ctx.clock.time * 0.7 + ai.r) * 4;
      const want = _v.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
      const wl = want.length(); want.multiplyScalar(Math.min(22, wl * 0.8) / (wl || 1));
      if (this.stagT > 0) want.set(this.vel.x * 0.3, -5, this.vel.z * 0.3);
      else if (this.blindT > 0) { this.drift(dt); want.set(Math.cos(ai.driftA) * 6, 0, Math.sin(ai.driftA) * 6); }
      this.vel.x = damp(this.vel.x, want.x, 1.2, dt); this.vel.y = damp(this.vel.y, want.y, 1.2, dt); this.vel.z = damp(this.vel.z, want.z, 1.2, dt);
      this.pos.addScaledVector(this.vel, dt);
      const gh = this.groundAt() + 12; if (this.pos.y < gh) { this.pos.y = gh; this.vel.y = Math.max(0, this.vel.y); }
      this.keepInPlayArea();
    }
    if (T) this.yaw = dampAng(this.yaw, yawTo(dx, dz), 1.6, dt);
    const r = this.rig.root, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const fwd = -(this.vel.x * sy + this.vel.z * cy), lat = this.vel.x * cy - this.vel.z * sy;
    r.rotation.x = damp(r.rotation.x, -clamp(fwd, -30, 30) * 0.012 + (this.stagT > 0 ? 0.15 : 0), 3, dt);
    r.rotation.z = damp(r.rotation.z, -clamp(lat, -30, 30) * 0.015 + (this.stagT > 0 ? Math.sin(ctx.clock.time * 9) * 0.12 : 0), 3, dt);
    if (T && P.turret) P.turret.rotation.y = dampAng(P.turret.rotation.y, angWrap(yawTo(dx, dz) - this.yaw), 4, dt);
    // chin gun bursts
    this.cd -= dt;
    if (this.canFire() && dist < 320) {
      if (this.cd <= 0 && ai.burst <= 0) { ai.burst = 8; ai.bt = 0; this.cd = this.rnd(2.4, 3.4); }
    } else ai.burst = 0;
    if (ai.burst > 0) {
      ai.bt -= dt;
      if (ai.bt <= 0) {
        ai.bt = 0.08; ai.burst--;
        const from = muzzleWorld(this, ai.mi++, new THREE.Vector3());
        const aim = this.lead(from, T, 500, _w);
        aim.x += this.rnd(-2, 2); aim.y += this.rnd(-1.2, 1.2); aim.z += this.rnd(-2, 2);
        const dir = aim.sub(from).normalize();
        this.fire({ pos: from, vel: dir.clone().multiplyScalar(500), dmg: 60, imp: 15, kind: 'ebullet', life: 1.0, srcKind: 'gunship' });
        this.sfx('mg');
        ctx.fx?.muzzle?.(from, dir, 'mg');
      }
    }
    // rocket pods: 4 unguided rockets with splash
    ai.rcd -= dt;
    if (ai.rcd <= 0 && this.canFire() && dist < 350) {
      ai.rcd = this.rnd(7, 9);
      for (let k = 0; k < 4; k++) ctx.timers.after(k * 0.12, () => this.rocket(k));
    }
  }
  rocket(k) {
    const T = this.target, P = this.rig.parts;
    if (!this.alive || !T || !T.alive || this.asleep) return;
    const pod = (k % 2 ? P.podR : P.podL) || null;
    const from = pod ? pod.getWorldPosition(new THREE.Vector3()) : this.center(new THREE.Vector3());
    const aim = this.lead(from, T, 180, new THREE.Vector3());
    aim.x += this.rnd(-4, 4); aim.z += this.rnd(-4, 4); aim.y += this.rnd(-1, 2);
    const dir = aim.sub(from).normalize();
    this.fire({ pos: from, vel: dir.clone().multiplyScalar(150), dmg: 300, imp: 140, kind: 'missile', turn: 0, accel: 60, maxSpeed: 220,
                splash: 6, splashDmg: 300, life: 4, srcKind: 'rocket', scale: 0.9 });
    this.sfx('missile');
  }
  onDeath(info) {
    const c = this.center(new THREE.Vector3());
    this.ctx.fx?.explosion?.(c, 0.9);
    this.cleanup?.();
    this.dying = true; this.ai.deathT = 0; this.ai.spin = (this.ctx.random() < 0.5 ? -1 : 1) * this.rnd(2, 4);
  }
  dyingUpdate(dt) {
    // spins down and crashes, then the wreck explodes
    const ai = this.ai;
    ai.deathT += dt;
    this.vel.y = Math.max(-40, this.vel.y - 30 * dt);
    this.vel.x *= 0.99; this.vel.z *= 0.99;
    this.pos.addScaledVector(this.vel, dt);
    this.yaw += ai.spin * dt;
    this.rig.root.rotation.z += dt * 0.6;
    if (Math.random() < dt * 20) this.ctx.particles?.smoke?.spawn?.(this.pos.x, this.pos.y, this.pos.z, 0, 2, 0, 2, 2, 7, 0.2, 0.19, 0.18, 0.7, 1, 0, 1);
    if (this.pos.y <= this.groundAt() + 1 || ai.deathT > 7) {
      this.dying = false;
      Unit.prototype.onDeath.call(this);
      this.ctx.fx?.explosion?.(this.center(_c), 1.8);
    }
  }
}

// ===================================================================================================== walker
class Walker extends Unit {
  init() {
    this.boomScale = 2.4; this.debris = 14; this.debrisScale = 1.3; this.onGround = true;
    this.ai.strafe = this.ctx.random() < 0.5 ? -1 : 1; this.ai.strafeT = this.rnd(3, 6); this.ai.stompCd = 3; this.ai.stompWind = 0;
    this.ai.mi = 0; this.ai.stepT = 0;
    this.yaw = this.rnd(0, TAU);
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.cd = this.rnd(2, 3.5);
    const m = this.rig.muzzles[0];
    if (m) { this.tell = tellMesh(this.ctx, 0xff7a30, 1.4); m.add(this.tell); }
    this.stompTell = tellMesh(this.ctx, 0xff5020, 1); this.root.add(this.stompTell); this.stompTell.position.y = 0.6;
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, P = this.rig.parts;
    if (this.behavior === 'scripted') { animateUnit(this.rig, dt, { speed: Math.hypot(this.vel.x, this.vel.z) }); return; }
    const T = this.acquire(dt);
    let mvx = 0, mvz = 0, dist = Infinity, dx = 0, dz = 0;
    if (T) { dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz) || 1; }
    const busy = ai.stompWind > 0;
    if (this.stagT <= 0 && !busy) {
      ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafe *= -1; ai.strafeT = this.rnd(3, 6); }
      if (this.blindT > 0) { this.drift(dt); mvx = Math.cos(ai.driftA) * 3; mvz = Math.sin(ai.driftA) * 3; }
      else if (this.outsideLeash()) { const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hl = Math.hypot(hx, hz) || 1; mvx = hx / hl * 6; mvz = hz / hl * 6; }
      else if (!T) { this.idleWish(5, _iw); mvx = _iw.x; mvz = _iw.z; }
      else if (this.behavior !== 'hold') {
        if (dist > 180) { mvx = dx / dist * 6; mvz = dz / dist * 6; }
        else if (dist < 60 && dist > 16) { mvx = -dx / dist * 4; mvz = -dz / dist * 4; }
        else { mvx = -dz / dist * ai.strafe * 2.5; mvz = dx / dist * ai.strafe * 2.5; }
      }
    }
    this.moveGround(dt, mvx, mvz, 1, 1.5);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.6) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 0.8, dt);
    if (sp > 1.5) { ai.stepT -= dt; if (ai.stepT <= 0) { ai.stepT = 1.1; this.sfx('stepHeavy'); } }
    if (T && P.turret) P.turret.rotation.y = dampAng(P.turret.rotation.y, angWrap(yawTo(dx, dz) - this.yaw), 1.4, dt);
    animateUnit(this.rig, dt, { speed: sp, firing: this.cd < 0.9, alert: !!T });
    // stomp: anything hostile within 14 m
    ai.stompCd -= dt;
    if (ai.stompWind > 0) {
      ai.stompWind -= dt;
      setTell(this.stompTell, (0.8 - ai.stompWind) / 0.8 * 7);
      if (ai.stompWind <= 0) {
        setTell(this.stompTell, 0);
        const c = new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z);
        ctx.combat?.radial(c, 14, 1200, 900, { team: this.team, owner: this, kind: 'stomp', pos: c.clone() }, { falloff: false });
        ctx.fx?.shockwave?.(c, 16, 0xffb070, 0.5);
        ctx.fx?.dust?.(c, 26, 12);
        ctx.cameraRig?.addShake?.(ctx.player?.pos ? clamp(1.2 - ctx.player.pos.distanceTo(c) / 80, 0, 1.2) : 0.6);
        this.sfx('boom');
        ai.stompCd = 6;
      }
    } else if (this.canFire() && dist < 14 && ai.stompCd <= 0) {
      ai.stompWind = 0.8; this.sfx('charge');
    }
    // heavy cannon with a charge tell
    this.cd -= dt;
    if (this.canFire() && dist < 320 && !busy) {
      if (this.cd < 0.9 && this.cd > 0) setTell(this.tell, (0.9 - this.cd) / 0.9);
      if (this.cd <= 0) {
        setTell(this.tell, 0);
        this.cd = this.rnd(4, 5.5);
        const from = muzzleWorld(this, ai.mi++, new THREE.Vector3());
        const aim = this.lead(from, T, 260, _w);
        const dir = aim.sub(from).normalize();
        this.fire({ pos: from, vel: dir.clone().multiplyScalar(260), dmg: 900, imp: 600, kind: 'shell', life: 2.5, srcKind: 'walker', scale: 1.5 });
        this.sfx('cannon');
        flashMuzzle(ctx, from, dir, 'cannon', 0xffa050, 2000, 36);
        ctx.cameraRig?.addShake?.(0.2);
      }
    } else setTell(this.tell, 0);
  }
}

// ===================================================================================================== artillery
class Artillery extends Unit {
  init() {
    this.boomScale = 1.5; this.debris = 8; this.onGround = true;
    this.yaw = this.rnd(0, TAU);
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.cd = this.rnd(3, 5);
    this.ai.salvos = 0; this.ai.warned = 0;
  }
  update(dt) {
    this.baseUpdate(dt);
    const ctx = this.ctx, ai = this.ai, P = this.rig.parts;
    if (this.behavior === 'scripted') { animateUnit(this.rig, dt, { speed: Math.hypot(this.vel.x, this.vel.z) }); return; }
    const T = this.acquire(dt, Math.max(this.aggroRange, 900));
    let mvx = 0, mvz = 0, dist = Infinity, dx = 0, dz = 0;
    if (T) { dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz) || 1; }
    if (this.stagT <= 0 && !T && !(this.blindT > 0)) { this.idleWish(6, _iw); mvx = _iw.x; mvz = _iw.z; }
    else if (this.stagT <= 0 && T && this.behavior !== 'hold' && !(this.blindT > 0)) {
      if (dist < 160) { mvx = -dx / dist * 8; mvz = -dz / dist * 8; }        // too close: pull back
      else if (dist > 850) { mvx = dx / dist * 7; mvz = dz / dist * 7; }   // out of range: close in
    }
    this.moveGround(dt, mvx, mvz, 1, 1.5);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.5) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 1.5, dt);
    if (T && P.turret) P.turret.rotation.y = dampAng(P.turret.rotation.y, angWrap(yawTo(dx, dz) - this.yaw), 1.2, dt);
    if (P.barrelPivot) P.barrelPivot.rotation.x = damp(P.barrelPivot.rotation.x, T ? clamp(0.5 + dist / 2400, 0.5, 0.85) : 0.3, 2, dt);
    animateUnit(this.rig, dt, { speed: sp, alert: !!T });
    this.cd -= dt;
    if (this.cd <= 0 && this.canFire() && dist >= 120 && dist <= 900) {
      this.cd = this.rnd(6, 8);
      ai.salvos++;
      // 3 shells at where the target is now; each impact point is marked on the ground 2 s before it lands
      const g = 45;
      for (let k = 0; k < 3; k++) {
        const to = new THREE.Vector3(T.pos.x + this.rnd(-10, 10), 0, T.pos.z + this.rnd(-10, 10));
        to.y = this.groundAt(to.x, to.z);
        ctx.timers.after(k * 0.35, () => {
          if (!this.alive || this.asleep) return;
          const from = muzzleWorld(this, 0, new THREE.Vector3());
          const D = Math.hypot(to.x - from.x, to.z - from.z);
          const Tf = clamp(2 + D / 300, 2.2, 5);
          const vel = new THREE.Vector3((to.x - from.x) / Tf, (to.y - from.y + 0.5 * g * Tf * Tf) / Tf, (to.z - from.z) / Tf);
          this.fire({ pos: from, vel, gravity: g, dmg: 700, imp: 450, splash: 12, splashDmg: 700, kind: 'mortar', life: Tf + 1.5, srcKind: 'artillery', scale: 1.2 });
          this.sfx('mortar');
          ctx.fx?.muzzle?.(from, _f.set(0, 1, 0), 'cannon');
          ctx.particles?.lights?.flash?.(from, 0xffa050, 900, 30, 0.12);
          ctx.timers.after(Math.max(0, Tf - 2), () => { ctx.projectiles?.groundWarning?.(to, 12, 2); ai.warned++; });
        });
      }
    }
  }
}

// ===================================================================================================== APC
class Apc extends Unit {
  init() {
    this.boomScale = 1.5; this.debris = 9; this.onGround = true;
    this.yaw = this.rnd(0, TAU);
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.ai.deployed = false; this.ai.hatch = 0; this.ai.deployT = 0;
  }
  update(dt) {
    this.baseUpdate(dt);
    const ai = this.ai, P = this.rig.parts;
    if (this.behavior === 'scripted') { animateUnit(this.rig, dt, { speed: Math.hypot(this.vel.x, this.vel.z) }); return; }
    const T = this.acquire(dt, Math.max(this.aggroRange, 800));
    let mvx = 0, mvz = 0, dist = Infinity, dx = 0, dz = 0;
    if (T) { dx = T.pos.x - this.pos.x; dz = T.pos.z - this.pos.z; dist = Math.hypot(dx, dz) || 1; }
    if (this.stagT <= 0 && !(this.blindT > 0) && !T) { this.idleWish(10, _iw); mvx = _iw.x; mvz = _iw.z; }
    else if (this.stagT <= 0 && !(this.blindT > 0) && T && this.behavior !== 'hold') {
      if (!ai.deployed && dist > 180) { mvx = dx / dist * 12; mvz = dz / dist * 12; }
      else if (ai.deployed && dist < 120) { mvx = -dx / dist * 6; mvz = -dz / dist * 6; }
    }
    this.moveGround(dt, mvx, mvz, 1, 1.4);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.5) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 1.6, dt);
    // deploy 3 drones once within 200 m: stop, drop the ramp, launch them one by one
    if (!ai.deployed && T && dist < 200 && this.stagT <= 0) { ai.deployed = true; ai.deployT = 0; this.sfx('door'); }
    if (ai.deployed && ai.deployT < 2) {
      ai.deployT += dt;
      for (let k = 0; k < 3; k++) {
        const at = 0.5 + k * 0.45;
        if (ai.deployT >= at && (ai.n ?? 0) === k) {
          ai.n = k + 1;
          const back = new THREE.Vector3(Math.sin(this.yaw) * 6, 3 + k, Math.cos(this.yaw) * 6).add(this.pos);
          this.ctx.enemies.spawn('drone', back, { team: this.team, faction: this.faction, tags: [...this.tags] });
        }
      }
    }
    ai.hatch = damp(ai.hatch, ai.deployed && ai.deployT < 3 ? 1 : 0, 3, dt);
    if (P.hatch) P.hatch.rotation.x = ai.hatch * 1.2;
    animateUnit(this.rig, dt, { speed: sp, alert: !!T });
  }
}

// ===================================================================================================== dropship
// Scripted transport: flies in, hovers, deploys a group, leaves and despawns. config: { path?: Vec3[] (world points,
// default: an approach from 450 m along its yaw at 90 m up, ending 30 m above the spawn point), speed? (40),
// hover? (3 s), deploy?: { units?: Array<{ kind, count?, opts?, spread? }>, kind?, count? } (default 3 drones),
// leave?: boolean (true) }. targetable: false unless SpawnOpts says otherwise.
class Dropship extends Unit {
  init(o) {
    this.flying = true; this.alwaysActive = true; this.ghost = true; this.immovable = true; this.boomScale = 2.6; this.debris = 14;
    this.targetable = o.targetable ?? false;
    const cfg = o.config || {};
    const ground = this.groundAt();
    const dropAt = new THREE.Vector3(this.pos.x, Math.max(this.pos.y, ground) + (cfg.hoverHeight ?? 30), this.pos.z);
    this.ai.path = (cfg.path?.length ? cfg.path.map(p => Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone()) : null);
    if (!this.ai.path) {
      const yaw = o.yaw ?? this.yaw ?? 0;
      const back = new THREE.Vector3(Math.sin(yaw) * 450, 0, Math.cos(yaw) * 450);   // behind its facing
      const start = dropAt.clone().add(back); start.y = Math.max(dropAt.y, this.groundAt(start.x, start.z) + 30) + 60;
      this.ai.path = [start, dropAt.clone().add(back.clone().multiplyScalar(0.25)).setY(dropAt.y + 15), dropAt];
    }
    this.pos.copy(this.ai.path[0]);
    this.home.copy(this.pos);
    this.ai.i = 1; this.ai.state = 'fly'; this.ai.hoverT = cfg.hover ?? 3; this.ai.speed = cfg.speed ?? 40;
    this.ai.deployAt = cfg.deploy?.at ?? this.ai.path.length - 1;
    const d = cfg.deploy || {};
    this.ai.group = d.units || [{ kind: d.kind || 'drone', count: d.count ?? 3 }];
    this.ai.leave = cfg.leave !== false; this.ai.deployed = 0;
    if (this.ai.path.length < 2) this.ai.path.push(this.ai.path[0].clone());
    this.ai.deployAt = clamp(this.ai.deployAt, 1, this.ai.path.length - 1);
    this.yaw = Math.atan2(-(this.ai.path[1].x - this.pos.x), -(this.ai.path[1].z - this.pos.z)) || 0;
    this.sfxT = 0;
  }
  update(dt) {
    this.baseUpdate(dt);
    const ai = this.ai, ctx = this.ctx;
    animateUnit(this.rig, dt, { speed: this.vel.length() });
    this.sfxT -= dt; if (this.sfxT <= 0) { this.sfxT = 2.5; this.sfx('dropship'); }
    if (this.stagT > 0) { this.vel.multiplyScalar(0.95); this.pos.addScaledVector(this.vel, dt); return; }
    if (ai.state === 'fly' || ai.state === 'leave') {
      const tgt = ai.state === 'leave' ? ai.exit : ai.path[ai.i];
      _v.copy(tgt).sub(this.pos);
      const d = _v.length();
      const slow = ai.state === 'fly' && ai.i === ai.deployAt ? clamp(d / 60, 0.15, 1) : 1;
      const want = _v.multiplyScalar(Math.min(ai.speed * slow, d * 2) / (d || 1));
      this.vel.x = damp(this.vel.x, want.x, 1.5, dt); this.vel.y = damp(this.vel.y, want.y, 1.5, dt); this.vel.z = damp(this.vel.z, want.z, 1.5, dt);
      this.pos.addScaledVector(this.vel, dt);
      if (Math.hypot(this.vel.x, this.vel.z) > 2) this.yaw = dampAng(this.yaw, yawTo(this.vel.x, this.vel.z), 1.2, dt);
      if (d < 4) {
        if (ai.state === 'leave') { this.removeMe = true; return; }
        if (ai.i === ai.deployAt) { ai.state = 'hover'; ai.t = 0; this.sfx('door'); }
        else if (ai.i < ai.path.length - 1) ai.i++;
        else ai.state = 'hover';
      }
    } else if (ai.state === 'hover') {
      ai.t += dt;
      this.vel.multiplyScalar(0.9);
      this.pos.y += Math.sin(ctx.clock.time * 1.7) * 0.02;
      const bay = this.rig.parts.bay;
      if (bay) bay.position.y = -2.4 - Math.min(1, ai.t) * 0.8;
      if (ai.t > 0.8 && !ai.deployed) { ai.deployed = 1; this.deploy(); }
      if (ai.t > ai.hoverT) {
        if (ai.deployAt < ai.path.length - 1) { ai.i = ai.deployAt + 1; ai.deployAt = -1; ai.state = 'fly'; }
        else if (ai.leave) {
          ai.state = 'leave';
          const last = ai.path[ai.path.length - 1], prev = ai.path[Math.max(0, ai.path.length - 2)];
          _w.copy(last).sub(prev).setY(0); if (_w.lengthSq() < 1) _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          _w.normalize();
          ai.exit = last.clone().addScaledVector(_w, 650); ai.exit.y = last.y + 90;
        } else ai.state = 'idle';
      }
    }
  }
  deploy() {
    const bay = this.rig.parts.bay;
    const at = bay ? bay.getWorldPosition(new THREE.Vector3()) : this.pos.clone();
    let k = 0;
    for (const g of this.ai.group) {
      const n = g.count ?? 1, spread = g.spread ?? 6;
      for (let i = 0; i < n; i++, k++) {
        const a = k * 2.4, r = Math.min(spread, 2 + k * 1.5);
        const p = new THREE.Vector3(at.x + Math.cos(a) * r, at.y - 2, at.z + Math.sin(a) * r);
        const opts = { team: this.team, faction: this.faction, ...(g.opts || {}) };
        opts.tags = [...this.tags, ...(g.opts?.tags || [])];
        const u = this.ctx.enemies.spawn(g.kind || 'drone', p, opts);
        // ground units drop out of the bay (their factories snap them to the ground)
        if (!u.flying && p.y > u.groundAt(p.x, p.z) + 2) { u.pos.y = p.y; u.dropping = true; u.onGround = false; u.vel.set(0, -4, 0); u.syncRoot(); }
      }
    }
    this.ctx.events.emit('dropship:deployed', { unit: this, count: k });
  }
  onDeath(info) {
    const c = this.center(new THREE.Vector3());
    this.ctx.fx?.explosion?.(c, 1.4);
    this.dying = true; this.ai.deathT = 0;
  }
  dyingUpdate(dt) {
    this.ai.deathT += dt;
    this.vel.y = Math.max(-40, this.vel.y - 25 * dt);
    this.pos.addScaledVector(this.vel, dt);
    this.rig.root.rotation.z += dt * 0.3;
    if (this.pos.y <= this.groundAt() + 2 || this.ai.deathT > 8) {
      this.dying = false;
      Unit.prototype.onDeath.call(this);
      this.ctx.fx?.explosion?.(this.center(_c), 2.6);
    }
  }
}

const CLASSES = { drone: Drone, tank: Tank, tank_heavy: Tank, turret: Turret, gunship: Gunship, walker: Walker,
                  artillery: Artillery, apc: Apc, beacon: Beacon, dropship: Dropship };

export function install(ctx) {
  for (const [kind, Cls] of Object.entries(CLASSES)) {
    ctx.enemies.register(kind, (c, pos, o = {}) => make(Cls, kind, c, pos, o));
  }
}
export { Drone, Tank, Turret, Beacon, Gunship, Walker, Artillery, Apc, Dropship };
