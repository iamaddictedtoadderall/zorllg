// combat/combat.js (P4): targets, teams, damage, stagger, kills and stats (port of the prototype's damage/killEnemy rules).
// Visual consequences that belong to a target live in its onDamage/onDeath (actors); this module only adds the shared
// feedback the prototype gave for every hit (hitmark, stagger sparks, killfeed).
//
// Addendum A5.1: `invuln` blocks damage on every target (DamageInfo.blocked, payload `blocked`), DamageSource.kind,
// and ctx.haul (combat/haul.js), installed from here.
//
// Target ids are deterministic per level (§1.4: same level, checkpoint and inputs → same getState(), unit ids included):
//  · the player, one Target reused across levels, always gets PLAYER_ID;
//  · 'level:cleared' (ctx.clearLevel) unregisters every level target and restarts the counter, so the destructible
//    structures placed by World.load get the same ids on every load of a level;
//  · 'player:spawned' (mission.start, after mission.stop cleared the units) rewinds the counter to the highest id still
//    registered (structures, the player), so units spawned after a checkpoint restart get the same ids as after a fresh
//    load of that checkpoint. Ids still registered are never reused.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { installHaul } from './haul.js';

export const TEAMS = ['player', 'ally', 'enemy', 'neutral'];
/** Player and ally are hostile to enemy; neutral is hostile to nobody (§1.3). */
export function isHostile(a, b) {
  if (a === 'neutral' || b === 'neutral' || a === b) return false;
  return (a === 'enemy') !== (b === 'enemy');
}

const _c = new THREE.Vector3();
/** extra: the player's fixed target id; level targets are numbered from PLAYER_ID + 1 */
export const PLAYER_ID = 1;
const isPlayer = (t) => t.team === 'player' && t.kind === 'player';
/** extra: hit-test eligibility shared by projectiles, blades and splash: alive, targetable, hostile to `team` */
export function canHit(t, team) {
  return !!t && t.alive && t.targetable !== false && (!team || isHostile(team, t.team));
}

export function install(ctx) {
  const targets = new Set();
  const list = [];          // same members as `targets`, for allocation-free iteration (combat.targets)
  const tmp = [];
  let nextId = PLAYER_ID;   // the last id handed out
  let staggerHinted = false;
  const rewindIds = () => { let m = PLAYER_ID; for (const t of targets) if (t.id > m) m = t.id; nextId = m; };
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

  function staggerFeedback(t) {
    const c = t.center(_c);
    ctx.audio?.play?.('stagger', c);
    ctx.fx?.sparks?.(c, 24, [1, 0.8, 0.3], 30);
    // prototype hint, once per level; campaign levels teach staggers through their own script (TEAR)
    if (!staggerHinted && !ctx.mission?.def?.campaign) {
      staggerHinted = true;
      ctx.hud?.hint?.('Staggered targets take bonus damage. Close in with the blade.');
    }
  }

  const api = {
    god: ctx.params.get('god') === '1',
    stats: newStats(),
    /** extra: the registered targets as an array (read-only; for allocation-free loops) */
    get targets() { return list; },
    register(t) {
      if (t.id == null) t.id = isPlayer(t) ? PLAYER_ID : ++nextId;
      if (!t.tags) t.tags = new Set();
      if (targets.has(t)) return;
      targets.add(t); list.push(t);
      ctx.events.emit('target:registered', { target: t });
    },
    unregister(t) {
      if (!targets.delete(t)) return;
      const i = list.indexOf(t); if (i >= 0) list.splice(i, 1);
    },
    all() { return targets.values(); },
    query(f = {}) {
      const out = [];
      for (const t of list) if (matches(t, f)) out.push(t);
      return out;
    },
    nearestHostile(pos, team, maxDist, filter) {
      let best = null, bd = maxDist * maxDist;
      for (const t of list) {
        if (!t.alive || t.targetable === false || !isHostile(team, t.team)) continue;
        if (filter && !filter(t)) continue;
        const d = t.center(_c).distanceToSquared(pos);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    },
    /**
     * Prototype rules: ×1.6 (units) / ×1.25 (player) while staggered, the impact gauge and stagger, god mode for the
     * player, kill at 0 AP. A5.1: an `invuln` target takes nothing and the hit is reported as `blocked`.
     */
    damage(t, amount, imp = 0, source) {
      const info = { amount: 0, imp: 0, source, staggered: false, killed: false };
      if (!t || !t.alive) return info;
      const pl = isPlayer(t);
      if (t.invuln) {
        info.blocked = true;
        ctx.events.emit('target:damaged', { target: t, amount: 0, staggered: false, blocked: true });
        if (pl) ctx.events.emit('player:damaged', { amount: 0, source, ap: t.ap, blocked: true });
        return info;
      }
      amount = Math.max(0, Number(amount) || 0); imp = Math.max(0, Number(imp) || 0);
      if (t.stagT > 0) amount *= pl ? 1.25 : 1.6;
      if (pl && api.god) amount = 0;
      t.ap -= amount; t.imp = (t.imp || 0) + imp; t.lastHit = ctx.clock.time;
      info.amount = amount; info.imp = imp;
      if (pl) api.stats.damageTaken += amount;
      else if (source?.team === 'player') api.stats.damageDealt += amount;
      const impMax = t.impMax ?? Infinity;
      if (t.imp >= impMax && !(t.stagT > 0) && impMax < 1e8) {
        t.stagT = t.stagDur || (pl ? 1.0 : 2.2); t.imp = 0; info.staggered = true;
        if (!pl) { if (source?.team === 'player') api.stats.staggers++; staggerFeedback(t); }
      }
      if (t.ap <= 0) { t.ap = 0; info.killed = true; }
      if (!pl && source?.team === 'player') ctx.hud?.hitmark?.();
      t.onDamage?.(info);
      ctx.events.emit('target:damaged', { target: t, amount, staggered: info.staggered });
      if (pl) {
        ctx.events.emit('player:damaged', { amount, source, ap: t.ap });
        if (info.staggered) ctx.events.emit('player:staggered', {});
      }
      if (info.killed) api.kill(t, source, info);
      return info;
    },
    /**
     * Splash damage around `pos`. Hits live, targetable targets hostile to source.team (every team without a source).
     * Linear falloff from the hit sphere's surface to `radius`. Extra option: `exclude` (a target to skip, e.g. the
     * direct hit of the same shell).
     */
    radial(pos, radius, amount, imp, source, o = {}) {
      if (!(radius > 0)) return 0;
      let n = 0;
      tmp.length = 0;
      for (const t of list) tmp.push(t);
      for (const t of tmp) {
        if (!t.alive || t.targetable === false || t === o.exclude) continue;
        if (source?.team && !isHostile(source.team, t.team)) continue;
        const hr = t.hitR || 0;
        const d = t.center(_c).distanceTo(pos);
        if (d > radius + hr) continue;
        if (o.los && ctx.collision && !ctx.collision.lineOfSight(pos, _c)) continue;
        const k = o.falloff === false ? 1 : clamp(1 - Math.max(0, d - hr) / radius, 0, 1);
        if (k <= 0) continue;
        api.damage(t, amount * k, (imp || 0) * k, source); n++;
      }
      tmp.length = 0;
      return n;
    },
    kill(t, source, info) {
      if (!t || !t.alive) return;
      t.alive = false; t.ap = 0;
      const di = info || { amount: 0, imp: 0, source, staggered: false, killed: true };
      const pl = isPlayer(t);
      if (!pl && isHostile(t.team, 'player')) {
        api.stats.kills++;
        ctx.hud?.killfeed?.(t.objective ? 'OBJECTIVE DESTROYED' : 'TARGET DESTROYED');
      }
      t.onDeath?.(di);
      ctx.events.emit('target:killed', { target: t, source });
    },
    resetStats() { api.stats = newStats(); },
    clear() {
      for (const t of [...targets]) if (!isPlayer(t)) api.unregister(t);
    },
  };
  ctx.events.on('level:cleared', () => { api.clear(); rewindIds(); staggerHinted = false; });
  ctx.events.on('player:spawned', rewindIds);
  ctx.combat = api;
  installHaul(ctx);
  return api;
}
