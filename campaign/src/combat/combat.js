// combat/combat.js (P4) — P0 STUB: working register/query/damage/kill (port of the prototype's damage and killEnemy rules).
// Visual and audio consequences belong to the targets' onDamage/onDeath (actors), not here.
import * as THREE from 'three';

export const TEAMS = ['player', 'ally', 'enemy', 'neutral'];
export function isHostile(a, b) {
  if (a === 'neutral' || b === 'neutral' || a === b) return false;
  return (a === 'enemy') !== (b === 'enemy');
}

const _c = new THREE.Vector3();

export function install(ctx) {
  const targets = new Set();
  let nextId = 0;
  const newStats = () => ({ kills: 0, damageTaken: 0, damageDealt: 0, shots: 0, missiles: 0, blades: 0, kits: 0, staggers: 0 });

  const matches = (t, f) => {
    if (!!t.alive !== (f.alive ?? true)) return false;   // default: live targets only
    if (f.team && t.team !== f.team) return false;
    if (f.hostileTo && !isHostile(t.team, f.hostileTo)) return false;
    if (f.tag && !(t.tags && t.tags.has(f.tag))) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.objective !== undefined && !!t.objective !== !!f.objective) return false;
    if (f.near && t.center(_c).distanceTo(f.near.pos) > f.near.r) return false;
    return true;
  };

  const api = {
    god: ctx.params.get('god') === '1',
    stats: newStats(),
    register(t) {
      if (t.id == null) t.id = ++nextId;
      if (!t.tags) t.tags = new Set();
      if (targets.has(t)) return;
      targets.add(t);
      ctx.events.emit('target:registered', { target: t });
    },
    unregister(t) { targets.delete(t); },
    all() { return targets.values(); },
    query(f = {}) {
      const out = [];
      for (const t of targets) if (matches(t, f)) out.push(t);
      return out;
    },
    nearestHostile(pos, team, maxDist, filter) {
      let best = null, bd = maxDist * maxDist;
      for (const t of targets) {
        if (!t.alive || !t.targetable || !isHostile(team, t.team)) continue;
        if (filter && !filter(t)) continue;
        const d = t.center(_c).distanceToSquared(pos);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    },
    damage(t, amount, imp = 0, source) {
      const info = { amount: 0, imp, source, staggered: false, killed: false };
      if (!t || !t.alive || t.invuln) return info;
      const isPlayer = t.team === 'player' && t.kind === 'player';
      if (t.stagT > 0) amount *= isPlayer ? 1.25 : 1.6;
      if (isPlayer && api.god) amount = 0;
      t.ap -= amount; t.imp = (t.imp || 0) + imp; t.lastHit = ctx.clock.time;
      info.amount = amount;
      if (isPlayer) api.stats.damageTaken += amount;
      else if (source?.team === 'player') api.stats.damageDealt += amount;
      const impMax = t.impMax ?? Infinity;
      if (t.imp >= impMax && !(t.stagT > 0) && impMax < 1e8) {
        t.stagT = t.stagDur || (isPlayer ? 1.0 : 2.2); t.imp = 0; info.staggered = true;
        if (!isPlayer) api.stats.staggers++;
      }
      if (t.ap <= 0) { t.ap = 0; info.killed = true; }
      t.onDamage?.(info);
      ctx.events.emit('target:damaged', { target: t, amount, staggered: info.staggered });
      if (info.killed) api.kill(t, source, info);
      return info;
    },
    radial(pos, radius, amount, imp, source, o = {}) {
      let n = 0;
      for (const t of [...targets]) {
        if (!t.alive) continue;
        if (source?.team && !isHostile(source.team, t.team)) continue;
        const d = t.center(_c).distanceTo(pos);
        if (d > radius + (t.hitR || 0)) continue;
        if (o.los && ctx.collision && !ctx.collision.lineOfSight(pos, _c)) continue;
        const k = o.falloff === false ? 1 : Math.max(0, 1 - Math.max(0, d - (t.hitR || 0)) / radius);
        if (k <= 0) continue;
        api.damage(t, amount * k, imp * k, source); n++;
      }
      return n;
    },
    kill(t, source, info) {
      if (!t || !t.alive) return;
      t.alive = false; t.ap = 0;
      const di = info || { amount: 0, imp: 0, source, staggered: false, killed: true };
      if (t.team !== 'player' && (source?.team === 'player' || isHostile(t.team, 'player'))) api.stats.kills++;
      t.onDeath?.(di);
      ctx.events.emit('target:killed', { target: t, source });
    },
    resetStats() { api.stats = newStats(); },
    clear() { for (const t of [...targets]) if (!(t.kind === 'player' && t.team === 'player')) targets.delete(t); },
  };
  ctx.combat = api;
  return api;
}
