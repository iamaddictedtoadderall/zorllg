// actors/enemy.js (P4): the Unit base (implements Target), the kind registry, spawning, activation (sleep beyond
// activeRadius), body separation (units ↔ units, units ↔ player), combat intensity and steering/aim helpers that every
// kind (P4's and the levels' own, e.g. levels/level01/units.js) can use.
//
// Prototype origin: class Enemy (baseUpdate: stagger timer + sparks, impact decay), killEnemy (explosion, debris),
// addEnemy, AC separation from the player, the tick's combat-intensity scan.
// Addendum A5.1: `haul` (parsed from o.haul or o.config.haul; heavy defaults to impMax > 1000), `blindT` (counted down
// here; P4's kinds don't fire while blind and drift), `heldT` (an outside force such as the harpoon reel owns `pos`:
// P4's kinds skip their own movement while it is > 0).
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap } from '../core/util.js';
import { isHostile } from '../combat/combat.js';
import { leadPoint } from '../combat/projectiles.js';
import { buildUnit, UNIT_MODELS } from '../art/units.js';
import { buildMech } from '../art/mechs.js';

const _c = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Unit {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    // Target fields
    this.id = undefined; this.name = 'UNIT'; this.kind = 'unit'; this.team = 'enemy'; this.tags = new Set();
    this.alive = true; this.targetable = true; this.objective = false; this.boss = false;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.ap = 1000; this.apMax = 1000; this.imp = 0; this.impMax = 600; this.stagT = 0; this.stagDur = 2.2;
    this.lastHit = -9; this.invuln = false; this.hitR = 2.5; this.hitY = 0; this.hitYScale = 0;
    this.blindT = 0; this.heldT = 0; this.haul = null;
    // Unit fields
    this.rig = null; this.root = new THREE.Group(); this.faction = 'hostile'; this.behavior = 'assault';
    this.home = new THREE.Vector3(); this.leash = Infinity; this.aggroRange = 600; this.asleep = false; this.ai = {};
    this.cd = 1 + ctx.random() * 2;   // prototype rand(1, 3), seeded
    this.rad = 2; this.hgt = 3; this.onGround = false; this.yaw = 0;
    // extras
    this.isUnit = true; this.target = null; this.immovable = false; this.alwaysActive = false; this.dropping = false;
    this.dying = false; this.keepMesh = false; this.boomScale = 1.2; this.debris = 6; this.debrisScale = 1; this.colliders = [];
    this.patrol = null; this.config = null;
    const { pos, vel, tags, haul, ...rest } = o;
    Object.assign(this, rest);
    if (pos) this.pos.copy(pos);
    if (vel) this.vel.copy(vel);
    if (tags) this.tags = tags instanceof Set ? tags : new Set(tags);
    if (o.ap !== undefined && o.apMax === undefined) this.apMax = o.ap;
    this.ap = this.apMax;
    this.home.copy(this.pos);
    this.root.name = 'unit:' + this.kind;
    const h = haul ?? o.config?.haul;
    if (h) this.setHaul(h);
  }
  /** A5.1: a part id, or { part, glint?, heavy?, onTaken? } */
  setHaul(h) {
    if (!h) { this.haul = null; return; }
    this.haul = typeof h === 'string' ? { part: h } : { ...h };
    if (this.haul.heavy === undefined) this.haul.heavy = (this.impMax ?? 0) > 1000;
    this.haul.taken = !!this.haul.taken;
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.hitY, this.pos.z); }
  hitTest(p) {
    this.center(_c);
    const dx = p.x - _c.x, dz = p.z - _c.z, dy = (p.y - _c.y) * (this.hitYScale || 1);
    return dx * dx + dy * dy + dz * dz < this.hitR * this.hitR;
  }
  /** prototype: stagger timer + sparks, impact decay; plus blindness and outside-hold timers (sleep: enemies.update) */
  baseUpdate(dt) {
    if (this.stagT > 0) {
      this.stagT = Math.max(0, this.stagT - dt);
      if (Math.random() < dt * 20) this.ctx.fx?.sparks?.(this.center(_c), 1, [1, 0.8, 0.3], 10);   // cosmetic
    }
    if (this.ctx.clock.time - this.lastHit > 1.6) this.imp = Math.max(0, this.imp - this.impMax * 0.35 * dt);
    if (this.blindT > 0) this.blindT = Math.max(0, this.blindT - dt);
    if (this.heldT > 0) this.heldT = Math.max(0, this.heldT - dt);
    if (!Number.isFinite(this.imp)) this.imp = 0;
  }
  update(dt) { this.baseUpdate(dt); }
  syncRoot() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; }
  despawn() {
    this.cleanup?.();
    for (const c of this.colliders) this.ctx.collision?.remove(c);
    this.colliders.length = 0;
    this.root.parent?.remove(this.root);
    this.rig?.dispose?.();
    this.ctx.combat?.unregister(this);
  }
  onDeath() {
    const c = this.center(new THREE.Vector3());
    this.ctx.fx?.explosion?.(c, this.boomScale || 1.2);
    this.ctx.particles?.debris?.spawn?.(c, this.debris || 6, this.debrisScale || 1, this.debrisMat);
    this.cleanup?.();
    for (const c2 of this.colliders) { c2.enabled = false; }
    if (!this.keepMesh) { this.root.visible = false; this.root.parent?.remove(this.root); }
  }

  // ---------------------------------------------------------------- helpers for kinds (steering, aiming)
  groundAt(x = this.pos.x, z = this.pos.z) {
    const C = this.ctx.collision;
    return C ? C.groundHeight(x, z) : (this.ctx.world?.groundHeight?.(x, z) ?? 0);
  }
  supportAt(x, z, y) {
    const C = this.ctx.collision;
    return C ? C.supportHeight(x, z, y) : this.groundAt(x, z);
  }
  rnd(a, b) { return a + this.ctx.random() * (b - a); }
  sfx(name) { this.ctx.audio?.play?.(name, this.pos); }
  /** can this unit shoot this frame: alive, awake, not staggered, not blinded, has a live target */
  canFire() { return this.alive && !this.asleep && !(this.stagT > 0) && !(this.blindT > 0) && !!this.target && this.target.alive; }
  /** fire a projectile owned by this unit */
  fire(spec) { spec.team = this.team; spec.owner = this; return this.ctx.projectiles?.fire(spec); }
  lead(from, target, speed, out) { return leadPoint(from, target, speed, out); }
  /**
   * Target acquisition: the nearest live hostile unit or player within aggroRange (the current target is kept to
   * 1.5 × the range). The player counts as 30 % closer, so enemies prefer it to allies (the prototype only ever
   * targeted the player). Re-evaluated every 0.4 s. Neutral units never acquire.
   */
  acquire(dt, range = this.aggroRange) {
    const cur = this.target;
    if (cur && (!cur.alive || cur.targetable === false || !isHostile(this.team, cur.team))) this.target = null;
    this.ai.acqT = (this.ai.acqT ?? 0) - dt;
    if (this.ai.acqT > 0 && (this.target || this.ai.acqT > 0.2)) return this.target;
    this.ai.acqT = 0.4;
    const list = this.ctx.combat?.targets;
    if (!list || this.team === 'neutral') { this.target = null; return null; }
    let best = null, bs = Infinity;
    for (const t of list) {
      if (!t.alive || t.targetable === false || t === this || !isHostile(this.team, t.team)) continue;
      if (!(t.isUnit || t.kind === 'player')) continue;
      const d = t.pos.distanceTo(this.pos);
      const lim = t === this.target ? range * 1.5 : range;
      if (d > lim) continue;
      const s = d * (t.kind === 'player' ? 0.7 : 1) * (t === this.target ? 0.85 : 1);
      if (s < bs) { bs = s; best = t; }
    }
    this.target = best;
    return best;
  }
  /** horizontal distance to the current target (Infinity without one) */
  targetDist() { const t = this.target; return t ? Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : Infinity; }
  /** prototype tank movement: damp toward the wish velocity, collide, snap to the support height */
  moveGround(dt, wx, wz, speed, k = 2) {
    if (this.heldT > 0) return;
    if (this.dropping) { this.fall(dt); return; }
    this.vel.x = damp(this.vel.x, wx * speed, k, dt); this.vel.z = damp(this.vel.z, wz * speed, k, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.vel.y = 0;
    this.ctx.collision?.resolve(this);
    this.pos.y = this.supportAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.onGround = true;
    this.keepInPlayArea();
  }
  /** fall from a drop (140 m, prototype AC drop) until the ground */
  fall(dt) {
    this.vel.y = Math.max(-70, this.vel.y - 45 * dt);
    this.vel.x *= 0.98; this.vel.z *= 0.98;
    this.pos.addScaledVector(this.vel, dt);
    const g = this.supportAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= g) {
      this.pos.y = g; this.dropping = false; this.onGround = true;
      if (this.vel.y < -20) {
        this.ctx.fx?.landing?.(this.pos, 1); this.ctx.fx?.dust?.(this.pos, 10, 4);
        this.sfx('land');
      }
      this.vel.set(0, 0, 0);
      this.home.copy(this.pos);
    }
  }
  /** keep units inside the level's play area (they never wander past the hard edge) */
  keepInPlayArea() {
    const W = this.ctx.world;
    if (!W?.route || !W.playArea) return;
    const pa = W.playArea(this.pos.x, this.pos.z);
    if (pa.edge < 1) return;
    const c = W.route.pointAt(pa.s, _w);
    const dx = c.x - this.pos.x, dz = c.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    const push = (pa.edge - 1) * pa.halfWidth * 0.375 + 0.5;
    this.pos.x += dx / dl * push; this.pos.z += dz / dl * push;
  }
  /** blinded units drift (A5.1): a slow seeded wander */
  drift(dt) {
    const a = (this.ai.driftA ?? (this.ai.driftA = this.rnd(0, Math.PI * 2))) + (this.ctx.random() - 0.5) * dt * 2;
    this.ai.driftA = a;
    return a;
  }
  /** home/leash: true when the unit is farther than `leash` from home (it should disengage and walk back) */
  outsideLeash() { return Number.isFinite(this.leash) && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > this.leash; }
  /** turn `yaw` toward a world direction */
  faceTo(dt, dx, dz, k = 5) { this.yaw = dampAng(this.yaw, yawTo(dx, dz), k, dt); }
}

export function install(ctx) {
  const kinds = new Map();
  let units = [];
  let prewarmed = [];
  const match = (u, f = {}) => (!f.tag || u.tags.has(f.tag)) && (!f.team || u.team === f.team) && (!f.kind || u.kind === f.kind);

  function placeholder(kind, pos, o) {
    const u = new Unit(ctx, { kind, name: (o.name || kind).toUpperCase(), pos });
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), ctx.materials?.get ? ctx.materials.get('lightRed') : new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    m.position.y = 1.5; u.root.add(m);
    return u;
  }

  /** body separation: units push apart; units push out of the player (prototype AC rule); immovable units push the player */
  function separate() {
    const pl = ctx.player, plOn = pl?.active && pl.alive;
    const n = units.length;
    for (let i = 0; i < n; i++) {
      const u = units[i];
      if (!u.alive || u.asleep || u.dropping || u.ghost) continue;
      if (plOn && !pl.hidden) {
        const dx = u.pos.x - pl.pos.x, dz = u.pos.z - pl.pos.z, d = Math.hypot(dx, dz), min = (u.rad || 2) + (pl.rad || 2.6) + 0.3;
        if (d < min && d > 1e-3 && overlapY(u, pl)) {
          if (u.immovable || u.heldT > 0) { pl.pos.x = u.pos.x - dx / d * min; pl.pos.z = u.pos.z - dz / d * min; }
          else { u.pos.x = pl.pos.x + dx / d * min; u.pos.z = pl.pos.z + dz / d * min; }
        }
      }
      for (let j = i + 1; j < n; j++) {
        const v = units[j];
        if (!v.alive || v.asleep || v.dropping || v.ghost) continue;
        const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z;
        const min = (u.rad || 2) + (v.rad || 2);
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-3 || !overlapY(u, v)) continue;
        const um = !(u.immovable || u.heldT > 0), vm = !(v.immovable || v.heldT > 0);
        if (!um && !vm) continue;
        const push = min - d, nx = dx / d, nz = dz / d;
        const ku = um && vm ? 0.5 : um ? 1 : 0, kv = um && vm ? 0.5 : vm ? 1 : 0;
        u.pos.x -= nx * push * ku; u.pos.z -= nz * push * ku;
        v.pos.x += nx * push * kv; v.pos.z += nz * push * kv;
      }
    }
  }
  function overlapY(a, b) {
    const a0 = a.pos.y - (a.hgtBelow || 0), a1 = a.pos.y + (a.hgt || 3), b0 = b.pos.y - (b.hgtBelow || 0), b1 = b.pos.y + (b.hgt || 3);
    return a0 < b1 && b0 < a1;
  }

  const api = {
    activeRadius: 700,
    register(kind, factory) { kinds.set(kind, factory); },
    kinds() { return [...kinds.keys()]; },
    spawn(kind, pos, o = {}) {
      const f = kinds.get(kind);
      let u;
      if (!f) { console.error('[enemies] unknown unit kind', kind); u = placeholder(kind, pos, o); }
      else u = f(ctx, pos.clone(), o);
      if (o.team) u.team = o.team;
      if (o.faction) u.faction = o.faction;
      if (o.name) u.name = o.name;
      if (o.yaw !== undefined) u.yaw = o.yaw;
      if (o.ap !== undefined) { u.apMax = o.ap; u.ap = o.ap; }
      if (o.behavior) u.behavior = o.behavior;
      if (o.leash !== undefined) u.leash = o.leash;
      if (o.aggroRange !== undefined) u.aggroRange = o.aggroRange;
      if (o.objective !== undefined) u.objective = !!o.objective;
      if (o.boss !== undefined) u.boss = !!o.boss;
      if (o.targetable !== undefined) u.targetable = !!o.targetable;
      if (o.patrol) u.patrol = o.patrol.map(p => p.clone ? p.clone() : new THREE.Vector3(p[0], p[1] ?? 0, p[2] ?? 0));
      if (o.config && !u.config) u.config = o.config;
      if (o.config?.haul && !u.haul) {
        if (u.setHaul) u.setHaul(o.config.haul);
        else u.haul = typeof o.config.haul === 'string' ? { part: o.config.haul } : { ...o.config.haul };
      }
      if (u.haul && u.haul.heavy === undefined) u.haul.heavy = (u.impMax ?? 0) > 1000;
      if (o.tag) u.tags.add(o.tag);
      for (const t of o.tags || []) u.tags.add(t);
      if (o.onDeath) { const base = u.onDeath.bind(u); u.onDeath = (info) => { base(info); o.onDeath(u); }; }
      if (o.drop && !u.flying) {
        // prototype: arrives from 140 m up and lands
        u.pos.y = (u.groundAt ? u.groundAt(u.pos.x, u.pos.z) : u.pos.y) + 140;
        u.vel.set(0, -30, 0); u.dropping = true; u.onGround = false;
      } else if (o.drop && u.flying) { u.pos.y += 120; u.ai.descend = true; }
      u.home.copy(u.pos);
      u.syncRoot();
      ctx.levelRoot.add(u.root);
      ctx.combat?.register(u);
      units.push(u);
      u.onSpawned?.();
      ctx.events.emit('unit:spawned', { unit: u });
      return u;
    },
    all() { return units; },
    alive(f) { return units.filter(u => u.alive && match(u, f)); },
    count(f) { let n = 0; for (const u of units) if (u.alive && match(u, f)) n++; return n; },
    killAll(f = {}) {
      const ff = { team: 'enemy', ...f };
      let n = 0;
      for (const u of units.slice()) if (u.alive && match(u, ff)) { ctx.combat ? ctx.combat.kill(u) : (u.alive = false); n++; }
      return n;
    },
    despawn(u) { u.despawn(); u.alive = false; u.dying = false; units = units.filter(x => x !== u); },
    clear() { for (const u of units) u.despawn(); units = []; },
    prewarm(list = []) {
      // one hidden instance of each kind's model, far below the map, so pipeline.warmup compiles its shaders
      for (const kind of new Set(list)) {
        try {
          let root = null, rig = null;
          if (kind === 'mech') { rig = buildMech(ctx, { design: 'vanguard', base: '#8f8a80', mid: '#6c6a64', accent: '#3f5a58', visor: '#ff3b2a' }); root = rig.root; }
          else if (UNIT_MODELS.includes(kind)) { rig = buildUnit(ctx, kind, 'hostile'); root = rig.root; }
          else continue;
          const f = ctx.cameraRig?.focus;
          root.position.set(f?.x ?? 0, -4000, f?.z ?? 0);
          ctx.levelRoot.add(root);
          prewarmed.push(rig);
        } catch (e) { ctx.recordError?.('enemies', e); }
      }
    },
    combatIntensity() {
      const pl = ctx.player;
      if (!pl?.active) return 0;
      let c = 0;
      for (const u of units) {
        if (!u.alive || u.objective || !isHostile(u.team, 'player')) continue;
        if (u.pos.distanceToSquared(pl.pos) >= 300 * 300) continue;
        if (u.kind === 'mech') return 1.3;
        c = 1;
      }
      return c;
    },
    update(dt) {
      const pl = ctx.player, plOn = !!pl?.active, R2 = api.activeRadius * api.activeRadius;
      const n = units.length;   // units spawned during this loop start next frame
      for (let i = 0; i < n; i++) {
        const u = units[i];
        if (!u) continue;
        if (!u.alive) { if (u.dying) { u.dyingUpdate?.(dt); u.syncRoot(); } continue; }
        const always = u.alwaysActive || u.boss || u.behavior === 'scripted';
        u.asleep = !always && (!plOn || u.pos.distanceToSquared(pl.pos) > R2);
        if (u.asleep) continue;
        u.update(dt);
        if (u.alive || u.dying) u.syncRoot();
      }
      // units that finished their script (a dropship that left) are removed after the loop
      for (let i = units.length - 1; i >= 0; i--) if (units[i].removeMe) api.despawn(units[i]);
      separate();
    },
  };
  ctx.events.on('level:ready', () => { for (const r of prewarmed) r.dispose?.(); prewarmed = []; });
  ctx.events.on('level:cleared', () => { units = []; prewarmed = []; });
  ctx.addSystem({ name: 'enemies', phase: 'ai', when: 'sim', update: (dt) => api.update(dt) });
  ctx.enemies = api;
  return api;
}
