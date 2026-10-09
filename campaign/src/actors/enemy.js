// actors/enemy.js (P4) — P0 STUB: the Unit base (implements Target), the kind registry, spawn → placeholder unit
// registered with combat, killAll, combatIntensity 0. Units have no AI in the stub.
import * as THREE from 'three';

const _c = new THREE.Vector3();

export class Unit {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    // Target fields
    this.id = undefined; this.name = 'UNIT'; this.kind = 'unit'; this.team = 'enemy'; this.tags = new Set();
    this.alive = true; this.targetable = true; this.objective = false; this.boss = false;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.ap = 1000; this.apMax = 1000; this.imp = 0; this.impMax = 600; this.stagT = 0; this.stagDur = 2.2;
    this.lastHit = -9; this.invuln = false; this.hitR = 2.5; this.hitY = 0;
    // Unit fields
    this.rig = null; this.root = new THREE.Group(); this.faction = 'hostile'; this.behavior = 'assault';
    this.home = new THREE.Vector3(); this.leash = Infinity; this.aggroRange = 300; this.asleep = false; this.ai = {}; this.cd = 1;
    this.rad = 2; this.hgt = 3; this.onGround = false; this.yaw = 0;
    const { pos, vel, tags, ...rest } = o;
    Object.assign(this, rest);
    if (pos) this.pos.copy(pos);
    if (vel) this.vel.copy(vel);
    if (tags) this.tags = tags instanceof Set ? tags : new Set(tags);
    if (o.ap !== undefined && o.apMax === undefined) this.apMax = o.ap;
    this.ap = this.apMax;
    this.home.copy(this.pos);
    this.root.name = 'unit:' + this.kind;
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.hitY, this.pos.z); }
  hitTest(p) { this.center(_c); return _c.distanceToSquared(p) < this.hitR * this.hitR; }
  /** stagger timer, impact decay (prototype), sleep/wake by distance to the player */
  baseUpdate(dt) {
    if (this.stagT > 0) this.stagT = Math.max(0, this.stagT - dt);
    if (this.ctx.clock.time - this.lastHit > 1.6) this.imp = Math.max(0, this.imp - this.impMax * 0.35 * dt);
    const pl = this.ctx.player;
    if (pl?.active) this.asleep = this.pos.distanceTo(pl.pos) > (this.ctx.enemies?.activeRadius ?? 700);
  }
  update(dt) { this.baseUpdate(dt); }
  syncRoot() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; }
  despawn() {
    this.root.parent?.remove(this.root);
    this.rig?.dispose?.();
    this.ctx.combat?.unregister(this);
  }
  onDeath() {
    this.ctx.fx?.explosion?.(this.center(_c), this.boomScale || 1.2);
    this.root.visible = false;
  }
}

export function install(ctx) {
  const kinds = new Map();
  let units = [];
  const match = (u, f = {}) => (!f.tag || u.tags.has(f.tag)) && (!f.team || u.team === f.team) && (!f.kind || u.kind === f.kind);

  function placeholder(kind, pos, o) {
    const u = new Unit(ctx, { kind, name: (o.name || kind).toUpperCase(), pos });
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), ctx.materials?.get ? ctx.materials.get('lightRed') : new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    m.position.y = 1.5; u.root.add(m);
    return u;
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
      if (o.tag) u.tags.add(o.tag);
      for (const t of o.tags || []) u.tags.add(t);
      if (o.onDeath) { const base = u.onDeath.bind(u); u.onDeath = (info) => { base(info); o.onDeath(u); }; }
      u.home.copy(u.pos);
      u.syncRoot();
      ctx.levelRoot.add(u.root);
      ctx.combat?.register(u);
      units.push(u);
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
    despawn(u) { u.despawn(); u.alive = false; units = units.filter(x => x !== u); },
    clear() { for (const u of units) u.despawn(); units = []; ctx.combat?.rewindIds?.(); },
    prewarm(list) { /* stub */ },
    combatIntensity() { return 0; },
    update(dt) {
      for (const u of units) if (u.alive) { u.update(dt); u.syncRoot(); }
    },
  };
  ctx.events.on('level:cleared', () => { units = []; });
  ctx.addSystem({ name: 'enemies', phase: 'ai', when: 'sim', update: (dt) => api.update(dt) });
  ctx.enemies = api;
  return api;
}
