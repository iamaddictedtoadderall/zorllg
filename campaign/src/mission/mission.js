// mission/mission.js (P5) — P0 STUB: a minimal level-script runtime.
//  · start() spawns the player at the checkpoint, reseeds ctx.random (§1.4), restores a CheckpointState, runs def.start
//    (fresh) or def.onCheckpoint[cp], and emits 'level:start'.
//  · Actions: say, comms, wait, waitFor, waitComms, objective, spawn (encounter id or inline group; no waves), despawn,
//    kill, checkpoint, trigger, enable, disable, event, cinematic, shake, music, structure, hint, warn, card, marker,
//    flag, player, fade, letterbox, codex, unlock, complete, fail, parallel, if, call. Others warn once and are skipped.
//  · Conditions: enter, enterZone, pass, cleared, killed, alive, health, objective, flag, timer, structure, all/any/not,
//    custom. Objectives: 'reach' (and kill/destroy by tag) complete automatically.
//  · Zones: card + art blend + music + onEnter. Completes at the route end when def.complete is missing.
//  validateLevel() returns [] (P5 implements the static checks).
import * as THREE from 'three';
import { hashString, clone, clamp } from '../core/util.js';

export function validateLevel(def, ctx) { return []; }

const ORDER = ['say', 'comms', 'waitFor', 'waitComms', 'objective', 'spawn', 'despawn', 'kill', 'checkpoint', 'trigger', 'enable',
  'disable', 'event', 'cinematic', 'flyby', 'barrage', 'structure', 'fx', 'shake', 'music', 'art', 'weather', 'hint', 'warn',
  'card', 'marker', 'flag', 'player', 'choice', 'interstitial', 'fade', 'letterbox', 'codex', 'unlock', 'complete', 'fail',
  'parallel', 'if', 'call', 'wait'];
const _v = new THREE.Vector3(), _p = new THREE.Vector3();

export function install(ctx) {
  const actions = new Map(), conditions = new Map();
  let elapsed = 0, gen = 0, running = false, completed = false, trigAcc = 0, cpSnap = null;
  let objectives = new Map(), triggers = new Map(), encounters = new Map(), zonesEntered = new Set(), zonesIn = new Set();
  const warned = new Set();

  const W = () => ctx.world;
  const res = (p) => W().resolve(p, new THREE.Vector3());
  const playerXZ = () => ctx.player?.active ? ctx.player.pos : null;
  const routeS = () => { const p = playerXZ(); return p && W()?.route ? W().playArea(p.x, p.z).s : 0; };
  const waitSim = (sec) => new Promise(r => ctx.timers.after(Math.max(0, sec), r));

  function pushObjectives() { ctx.hud?.setObjectives?.(m.objectives()); }
  function setObjective(id, state) {
    const o = objectives.get(id);
    if (!o) { console.warn('[mission] unknown objective', id); return; }
    if (o.state === state) return;
    o.state = state;
    ctx.events.emit('objective:changed', { id, state, text: o.text, progress: o.progress });
    pushObjectives();
    if (state === 'done' && o.def.onDone) m.run(o.def.onDone);
    if (state === 'failed' && o.def.onFail) m.run(o.def.onFail);
  }

  function spawnGroup(g, tags) {
    const n = g.count ?? 1;
    const base = res(g.at);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = ctx.random() * Math.PI * 2, r = (g.spread || 0) * Math.sqrt(ctx.random());
      _p.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
      _p.y = W().groundHeight(_p.x, _p.z) + (g.at && typeof g.at === 'object' && !Array.isArray(g.at) && Number.isFinite(g.at.h) ? g.at.h : 0);
      const opts = { ...(g.opts || {}), tags: [...(g.opts?.tags || []), ...tags] };
      out.push(ctx.enemies?.spawn(g.kind, _p, opts));
    }
    return out;
  }
  function spawnEncounter(id) {
    const e = (m.def.encounters || []).find(x => x.id === id);
    if (!e) { console.warn('[mission] unknown encounter', id); return; }
    const tags = ['enc:' + id]; if (e.tag) tags.push(e.tag);
    for (const g of e.units || []) spawnGroup(g, tags);
    encounters.set(id, 'active');
    ctx.events.emit('encounter:started', { id });
  }

  function builtinAction(key, a, g) {
    const v = a[key];
    switch (key) {
      case 'say': {
        const s = Array.isArray(v) ? { who: v[0], text: v[1] } : v;
        ctx.comms?.say(s.who, s.text, { hold: s.hold, priority: s.priority });
        return;
      }
      case 'comms': { const p = ctx.comms?.play(m.def.comms?.[v] || []); return a.wait ? p : undefined; }
      case 'wait': return waitSim(+v || 0);
      case 'waitFor': return new Promise(r => {
        const t0 = elapsed;
        const id = ctx.timers.every(0.1, () => {
          if (g !== gen) return false;
          if (m.check(v) || (a.timeout && elapsed - t0 >= a.timeout)) { r(); return false; }
        });
        if (m.check(v)) { ctx.timers.cancel(id); r(); }
      });
      case 'waitComms': return new Promise(r => {
        if (!ctx.comms?.busy) return r();
        ctx.timers.every(0.1, () => { if (g !== gen) return false; if (!ctx.comms?.busy) { r(); return false; } });
      });
      case 'objective': {
        if (v.add) setObjective(v.add, 'active');
        if (v.complete) setObjective(v.complete, 'done');
        if (v.fail) setObjective(v.fail, 'failed');
        if (v.remove) setObjective(v.remove, 'hidden');
        if (v.text) { const o = objectives.get(v.text[0]); if (o) { o.text = v.text[1]; pushObjectives(); } }
        return;
      }
      case 'spawn': if (typeof v === 'string') spawnEncounter(v); else spawnGroup(v, [...(v.opts?.tags || [])]); return;
      case 'despawn': for (const u of ctx.enemies?.alive({ tag: v.tag }) || []) ctx.enemies.despawn(u); return;
      case 'kill': for (const u of ctx.enemies?.alive({ tag: v.tag }) || []) ctx.combat?.kill(u); return;
      case 'checkpoint': m.reachCheckpoint(v); return;
      case 'trigger': m.fire(v); return;
      case 'enable': { const t = triggers.get(v); if (t) t.enabled = true; return; }
      case 'disable': { const t = triggers.get(v); if (t) t.enabled = false; return; }
      case 'event': return m.run(m.def.events?.[v] || [], g);
      case 'cinematic': return ctx.cinematics?.play(v);
      case 'flyby': { const f = ctx.cinematics?.flyby(v); return a.wait ? f?.done : undefined; }
      case 'barrage': return ctx.cinematics?.barrage(v);
      case 'structure': ctx.structures?.get(v.id)?.setState(v.state); return;
      case 'fx': if (v.explosion) ctx.fx?.explosion(res(v.explosion.at), v.explosion.scale ?? 1); return;
      case 'shake': ctx.cameraRig?.addShake(+v || 0.5); return;
      case 'music': if (v.theme) ctx.music?.setTheme(v.theme); if ('intensity' in v) ctx.music?.setIntensity(v.intensity); if (v.stinger) ctx.music?.stinger(v.stinger); return;
      case 'art': ctx.atmosphere?.set(v, a.blend ?? 0); return;
      case 'weather': ctx.weather?.set(v, a.blend ?? 0); return;
      case 'hint': ctx.hud?.hint(v); return;
      case 'warn': ctx.hud?.warn(v); return;
      case 'card': ctx.hud?.zoneCard(v.title, v.sub); return;
      case 'marker': {
        const list = (ctx.hud?.markers || []).filter(x => x.id !== (v.remove || v.id));
        if (!v.remove) list.push({ id: v.id, pos: res(v.at), label: v.label, kind: v.kind });
        ctx.hud?.setMarkers(list);
        return;
      }
      case 'flag': m.setFlag(v[0], v[1], !!a.persist); return;
      case 'player': {
        const p = ctx.player; if (!p) return;
        if (v.heal) p.heal(v.heal);
        if (v.refill) p.refill();
        if ('freeze' in v) p.frozen = !!v.freeze;
        if (v.teleport) { const q = res(v.teleport); p.teleport(q, v.yaw !== undefined ? W().resolveYaw(v.yaw, q) : undefined); }
        return;
      }
      case 'choice': return ctx.hud?.choice({ title: v.title, options: v.options, seconds: v.seconds }).then(k => {
        const opt = v.options.find(o => o.key === k) || v.options.find(o => o.key === v.default) || v.options[0];
        return opt ? m.run(opt.do || [], g) : undefined;
      });
      case 'interstitial': return ctx.flow?.interstitial(v);
      case 'fade': return ctx.hud?.fade(+v, a.seconds ?? 1);
      case 'letterbox': ctx.hud?.letterbox(!!v); return;
      case 'codex': ctx.save?.addCodex(v); return;
      case 'unlock': ctx.save?.unlockPart(v); return;
      case 'complete': m.complete(); return;
      case 'fail': m.fail(v); return;
      case 'parallel': return Promise.all(v.map(list => m.run(list, g)));
      case 'if': return m.run(m.check(v) ? a.then : (a.else || []), g);
      case 'call': { const fn = actions.get(v); if (!fn) { console.warn('[mission] unknown custom action', v); return; } return fn(a.args, m, ctx); }
      default:
        if (!warned.has(key)) { warned.add(key); console.warn('[mission stub] action not implemented:', key); }
    }
  }
  function runAction(a, g) {
    if (!a || typeof a !== 'object') return;
    for (const k of Object.keys(a)) if (actions.has(k) && k !== 'call') return actions.get(k)(a[k], m, ctx);
    const key = ORDER.find(k => k in a);
    if (!key) { const k = Object.keys(a)[0]; if (!warned.has(k)) { warned.add(k); console.warn('[mission] unknown action', a); } return; }
    return builtinAction(key, a, g);
  }

  function checkObjectives() {
    const p = playerXZ();
    for (const o of objectives.values()) {
      if (o.state !== 'active') continue;
      const d = o.def;
      if (d.kind === 'reach' && p && d.at) {
        const q = W().resolve(d.at, _v);
        if (Math.hypot(p.x - q.x, p.z - q.z) <= (d.r ?? 40)) setObjective(o.id, 'done');
      } else if ((d.kind === 'kill' || d.kind === 'destroy') && d.target) {
        const tag = d.target.tag || (d.target.encounter ? 'enc:' + d.target.encounter : null);
        if (!tag) continue;
        const all = ctx.combat ? ctx.combat.query({ tag, alive: false }).length + ctx.combat.query({ tag }).length : 0;
        const dead = ctx.combat ? ctx.combat.query({ tag, alive: false }).length : 0;
        const max = d.target.count ?? all;
        if (d.showCount) { o.progress = { cur: Math.min(dead, max), max }; }
        if (max > 0 && dead >= max) setObjective(o.id, 'done');
      }
      if (d.failIf && m.check(d.failIf)) setObjective(o.id, 'failed');
    }
  }
  function checkZones() {
    const s = routeS();
    for (const z of m.def.zones || []) {
      const [s0, s1] = z.range;
      const inNow = zonesIn.has(z.id);
      if (!inNow && s >= s0 + 10 && s <= s1) {
        zonesIn.add(z.id);
        ctx.events.emit('zone:entered', { id: z.id, name: z.name });
        if (z.card) ctx.hud?.zoneCard(z.card.title, z.card.sub);
        if (z.art) ctx.atmosphere?.set(z.art, z.artBlend ?? 6);
        if (z.music) ctx.music?.setTheme(z.music);
        if (z.onEnter && (z.repeat || !zonesEntered.has(z.id))) m.run(z.onEnter);
        zonesEntered.add(z.id);
      } else if (inNow && (s < s0 - 10 || s > s1 + 10)) {
        zonesIn.delete(z.id);
        ctx.events.emit('zone:exited', { id: z.id, name: z.name });
      }
    }
  }
  function checkEncounters() {
    for (const [id, st] of encounters) {
      if (st !== 'active') continue;
      if ((ctx.enemies?.count({ tag: 'enc:' + id }) ?? 0) === 0) {
        encounters.set(id, 'cleared');
        ctx.events.emit('encounter:cleared', { id });
        const e = m.def.encounters.find(x => x.id === id);
        if (e?.onCleared) m.run(e.onCleared);
      }
    }
  }

  const m = {
    def: null,
    checkpoint: null,
    flags: {},
    get elapsed() { return elapsed; },
    start(def, checkpointId, snap) {
      m.stop();
      m.def = def;
      const cps = def.checkpoints || [];
      const cp = cps.find(c => c.id === checkpointId) || cps[0] || { id: null, at: [0, 0] };
      m.checkpoint = cp.id;
      const useSnap = snap && snap.levelId === def.id && snap.checkpoint === cp.id ? snap : null;
      cpSnap = useSnap ? clone(useSnap) : null;
      const fresh = !useSnap && (!checkpointId || checkpointId === cps[0]?.id);
      ctx.reseed((hashString(def.id + ':' + m.checkpoint) ^ Number(ctx.params.get('seed') ?? def.seed ?? 0)) >>> 0);
      ctx.clock.time = 0; ctx.clock.dt = 0;
      elapsed = useSnap?.elapsed ?? 0;
      completed = false; trigAcc = 0; running = true; m._completing = false;
      if (fresh) ctx.combat?.resetStats();
      m.flags = clone(useSnap?.flags ?? {});
      objectives = new Map();
      for (const o of def.objectives || []) {
        const s = useSnap?.objectives?.find(x => x.id === o.id);
        objectives.set(o.id, { id: o.id, text: s?.text ?? o.text, state: s?.state ?? (o.initial === 'active' ? 'active' : 'hidden'),
                               progress: s?.progress, optional: !!o.optional, def: o });
      }
      triggers = new Map();
      for (const t of def.triggers || []) triggers.set(t.id, { def: t, fired: !!useSnap?.fired?.includes(t.id), enabled: t.enabled !== false, firedAt: -1 });
      encounters = new Map();
      for (const e of def.encounters || []) encounters.set(e.id, useSnap?.encounters?.[e.id] ?? 'pending');
      zonesEntered = new Set(useSnap?.zonesEntered || []); zonesIn = new Set();
      if (useSnap?.structures) ctx.structures?.reset(useSnap.structures);
      const pos = W().resolve(cp.at, new THREE.Vector3());
      ctx.player?.spawn(pos, W().resolveYaw(cp.yaw, pos), useSnap && cp.refill === false ? useSnap.player : undefined);
      for (const [id, st] of encounters) if (st === 'active') spawnEncounter(id);
      ctx.hud?.setMission?.(String(def.title || def.id).toUpperCase(), def.subtitle ? String(def.subtitle).toUpperCase() : '');
      pushObjectives();
      if (fresh) ctx.save?.setCheckpoint(def.id, null);
      ctx.events.emit('level:start', { levelId: def.id, checkpoint: m.checkpoint, fresh });
      const g = gen;
      m.run(fresh ? def.start || [] : def.onCheckpoint?.[m.checkpoint] || [], g);
    },
    restart() { if (m.def) m.start(m.def, m.checkpoint, cpSnap); },
    stop() {
      gen++; running = false;
      ctx.enemies?.clear();
      ctx.projectiles?.clear();
      ctx.fx?.clearEmitters();
      ctx.particles?.clear();
      ctx.timers.clear();
      triggers = new Map();
      ctx.hud?.setMarkers?.([]);
      ctx.hud?.progress?.(null);
      ctx.hud?.prompt?.(null);
      ctx.comms?.clear();
      if (ctx.player) ctx.player.frozen = false;
    },
    async run(list, g = gen) {
      for (const a of list || []) {
        if (g !== gen) return;
        try { await runAction(a, g); }
        catch (e) { ctx.recordError?.('mission', e); }
      }
    },
    registerAction(name, fn) { actions.set(name, fn); },
    registerCondition(name, fn) { conditions.set(name, fn); },
    check(c) {
      if (!c || typeof c !== 'object') return !!c;
      const p = playerXZ();
      if ('all' in c) return c.all.every(x => m.check(x));
      if ('any' in c) return c.any.some(x => m.check(x));
      if ('not' in c) return !m.check(c.not);
      if ('enter' in c) { if (!p) return false; const q = W().resolve(c.enter.at, _v); return Math.hypot(p.x - q.x, p.z - q.z) <= c.enter.r; }
      if ('enterZone' in c) return zonesIn.has(c.enterZone);
      if ('pass' in c) return !!p && routeS() >= c.pass;
      if ('cleared' in c) return encounters.get(c.cleared) === 'cleared';
      if ('killed' in c) {
        const tag = c.killed.tag, dead = ctx.combat?.query({ tag, alive: false }).length ?? 0, live = ctx.combat?.query({ tag }).length ?? 0;
        return c.killed.count != null ? dead >= c.killed.count : dead > 0 && live === 0;
      }
      if ('alive' in c) return (ctx.combat?.query({ tag: c.alive.tag }).length ?? 0) <= c.alive.lte;
      if ('health' in c) {
        const t = c.health.tag ? ctx.combat?.query({ tag: c.health.tag })[0] : ctx.player;
        return !!t && t.apMax > 0 && t.ap / t.apMax < c.health.below;
      }
      if ('objective' in c) return objectives.get(c.objective)?.state === (c.state || 'done');
      if ('flag' in c) return 'eq' in c ? m.flags[c.flag] === c.eq : !!m.flags[c.flag];
      if ('timer' in c) {
        if (!c.since) return elapsed >= c.timer;
        const t = triggers.get(c.since);
        return !!t && t.firedAt >= 0 && elapsed - t.firedAt >= c.timer;
      }
      if ('structure' in c) return ctx.structures?.get(c.structure)?.state === c.state;
      if ('custom' in c) { const fn = conditions.get(c.custom); return fn ? !!fn(c.args, m, ctx) : false; }
      return false;
    },
    objective(id) { const o = objectives.get(id); return o ? { id: o.id, text: o.text, state: o.state, progress: o.progress, optional: o.optional } : undefined; },
    objectives() { return [...objectives.keys()].map(id => m.objective(id)); },
    fire(id) {
      const t = triggers.get(id);
      if (!t) { console.warn('[mission] unknown trigger', id); return; }
      if (t.def.once !== false) t.fired = true;
      t.firedAt = elapsed;
      ctx.events.emit('trigger:fired', { id });
      m.run(t.def.do || []);
    },
    setFlag(k, v, persist = false) { m.flags[k] = v; if (persist) ctx.save?.setFlag(k, v); },
    reachCheckpoint(id) {
      const cp = (m.def?.checkpoints || []).find(c => c.id === id);
      if (!cp) { console.warn('[mission] unknown checkpoint', id); return; }
      m.checkpoint = id;
      cpSnap = m.snapshot();
      ctx.save?.setCheckpoint(m.def.id, cpSnap);
      ctx.hud?.checkpointToast?.(cp.label || id);
      ctx.events.emit('checkpoint:reached', { id, label: cp.label || id });
    },
    snapshot() {
      return {
        levelId: m.def?.id ?? null, checkpoint: m.checkpoint, flags: clone(m.flags),
        objectives: m.objectives().map(o => ({ id: o.id, state: o.state, text: o.text, progress: o.progress ? { ...o.progress } : undefined })),
        fired: [...triggers.values()].filter(t => t.fired).map(t => t.def.id),
        encounters: Object.fromEntries(encounters),
        structures: ctx.structures?.states?.() ?? {},
        collectibles: [],
        player: ctx.player?.snapshot?.() ?? null,
        elapsed, zonesEntered: [...zonesEntered],
      };
    },
    complete() {
      if (completed || !m.def) return;
      completed = true;
      const st = ctx.combat?.stats || {};
      const par = m.def.par || { time: 600, damage: 10000 };
      const time = elapsed, dmg = st.damageTaken || 0;
      const score = 0.5 * clamp(par.time / Math.max(time, 1), 0, 1) + 0.5 * clamp(par.damage / Math.max(dmg, 1), 0, 1);
      const rank = score >= 0.9 ? 'S' : score >= 0.75 ? 'A' : score >= 0.55 ? 'B' : 'C';
      const result = { time, kills: st.kills || 0, damageTaken: dmg, shots: st.shots || 0, collectibles: [], rank };
      ctx.events.emit('level:complete', { levelId: m.def.id, result });
    },
    fail(reason = 'Mission failed') { if (!m.def) return; ctx.events.emit('level:failed', { levelId: m.def.id, reason }); },
    update(dt) {
      if (!running || !m.def) return;
      elapsed += dt;
      trigAcc += dt;
      if (trigAcc < 0.1) return;
      trigAcc = 0;
      checkZones();
      checkObjectives();
      checkEncounters();
      for (const t of triggers.values()) {
        if (t.fired || !t.enabled) continue;
        if (t.def.after && !triggers.get(t.def.after)?.fired) continue;
        if (m.check(t.def.when)) m.fire(t.def.id);
      }
      if (!completed) {
        if (m.def.complete?.when) {
          if (m.check(m.def.complete.when) && !m._completing) {
            m._completing = true;
            const g = gen;
            m.run(m.def.complete.do || [], g).then(() => { m._completing = false; if (g === gen) m.complete(); });
          }
        } else if (W()?.route && ctx.player?.active && routeS() >= W().route.length - 40) m.complete();
      }
    },
  };
  ctx.addSystem({ name: 'mission', phase: 'mission', when: 'sim', order: 0, update: (dt) => m.update(dt) });
  ctx.mission = m;
  return m;
}
