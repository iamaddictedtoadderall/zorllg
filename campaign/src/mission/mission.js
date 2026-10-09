// mission/mission.js (P5): the level script runtime (§6): objectives, triggers and conditions, encounters and waves,
// checkpoints and restarts, zones, collectibles, interactions and every action in §6.10, plus validateLevel().
// Addendum A5.2: addInteract/removeInteract, the 'encounter:wave' event, 'level:start' after state is restored, haul
// caches routed to the rack on campaign levels, and the LevelResult haul/tears/water fields.
//
// Determinism (§1.4): action lists are run by a synchronous interpreter, never by `await`. Microtasks don't run inside
// ctx.step(n), so an awaited list would only advance between step() calls. A non-blocking action continues the list at
// once; a blocking one returns a simDeferred() promise (core/util.js) that resumes the list synchronously, inside the
// tick that settles it. Services that block a list on sim time (comms.play, cinematics.play, flyby().done, barrage,
// hud.choice, hud.fade, cameraRig.blendTo) return simDeferred() promises too. A custom action ({ call } or
// registerAction) that blocks MUST return one as well (or the promise of m.run(list)): a plain Promise still works but
// resumes on a microtask, which makes the outcome depend on step() chunking; with ?debug=1 that warns once per action.
// Only menu-driven waits (flow.interstitial) may stay plain Promises: the sim is stopped while the menu is up.
// Pause safety: what a list blocks on counts sim time, so it freezes while the sim is stopped. As a backstop, a list
// never resumes while the sim is stopped: a wait that settles then resumes it at the next mission tick.
//
// Rules this runtime adds where §6 is silent (documented for level authors):
//  · Objective kinds: 'timer' counts `seconds` down and is done at 0 (survive); any other kind with `seconds` (except
//    'interact', where it is the fill time) fails when the time runs out. 'escort' (target.tag, optional at/r): done
//    when at least target.count (default 1) escorted targets are alive and all live ones are within r of `at`; fails
//    when fewer than target.count are alive after they first appeared. 'collect': collectibles picked up (target.tag
//    filters by collectible kind), max = target.count or every matching collectible. 'kill'/'destroy' count tagged
//    targets killed during the mission (encounter targets use the tag enc:<id>; without a count, done when none of the
//    tag is left alive, or when the encounter is cleared).
//  · Triggers with `once: false` fire on each rising edge of their condition. `{ trigger: id }` fires regardless of
//    `enabled` and `after`.
//  · Encounters with `persist: false` are stored as 'pending' in snapshots. Kill tallies of an encounter that is
//    re-spawned in full on a restart are rolled back with it.
//  · Without a `complete` block and without any `{ complete: true }` action, the level completes at the route end.
//  · Level-registered actions and conditions (registered while a level is loaded, e.g. from custom.install) are
//    dropped on 'level:cleared'.
import * as THREE from 'three';
import { hashString, clone, clamp, simDeferred, simAll, simResolved, whenSettled, isSettled, isSimPromise } from '../core/util.js';
import * as LO from '../combat/loadout.js';

// ======================================================================================== format registry
export const ACTION_KEYS = ['say', 'comms', 'wait', 'waitFor', 'waitComms', 'objective', 'spawn', 'despawn', 'kill', 'checkpoint',
  'trigger', 'enable', 'disable', 'event', 'cinematic', 'flyby', 'barrage', 'structure', 'fx', 'shake', 'music', 'art', 'weather',
  'hint', 'warn', 'card', 'marker', 'flag', 'player', 'choice', 'interstitial', 'fade', 'letterbox', 'codex', 'unlock', 'complete',
  'fail', 'parallel', 'if', 'call'];
/** secondary keys allowed next to each primary key */
const ACTION_MODS = { comms: ['wait'], waitFor: ['timeout'], flyby: ['wait'], art: ['blend'], weather: ['blend'], flag: ['persist'],
  fade: ['seconds'], letterbox: ['seconds'], if: ['then', 'else'], call: ['args'], hint: ['seconds'], warn: ['seconds', 'soft'],
  music: ['fade'] };
export const CONDITION_KEYS = ['enter', 'enterZone', 'pass', 'cleared', 'killed', 'alive', 'health', 'objective', 'flag', 'timer',
  'structure', 'all', 'any', 'not', 'custom'];
const CONDITION_MODS = { objective: ['state'], flag: ['eq'], timer: ['since'], structure: ['state'], custom: ['args'] };
export const OBJECTIVE_KINDS = ['reach', 'kill', 'destroy', 'interact', 'timer', 'escort', 'collect', 'flag', 'manual'];
const LEVEL_KEYS = ['id', 'title', 'subtitle', 'order', 'seed', 'par', 'briefing', 'intro', 'outro', 'unlocks', 'speakers', 'factions',
  'music', 'route', 'terrain', 'art', 'zones', 'checkpoints', 'objectives', 'encounters', 'triggers', 'events', 'cinematics', 'comms',
  'collectibles', 'start', 'onCheckpoint', 'complete', 'custom', 'campaign', 'deathLine'];
const ZONE_KEYS = ['id', 'range', 'name', 'card', 'art', 'artBlend', 'music', 'structures', 'scatter', 'onEnter', 'repeat'];
const CP_KEYS = ['id', 'at', 'yaw', 'label', 'refill'];
const OBJ_KEYS = ['id', 'text', 'kind', 'at', 'r', 'target', 'seconds', 'label', 'flag', 'showCount', 'showTimer', 'marker', 'optional',
  'failIf', 'onDone', 'onFail', 'initial'];
const ENC_KEYS = ['id', 'tag', 'units', 'waves', 'onCleared', 'persist'];
const GROUP_KEYS = ['kind', 'count', 'at', 'spread', 'opts', 'via'];
const TRIG_KEYS = ['id', 'when', 'do', 'once', 'enabled', 'after'];
const COLL_KEYS = ['id', 'kind', 'at', 'unlocks', 'codex', 'label'];
const CINE_KEYS = ['keys', 'letterbox', 'skippable', 'freezePlayer', 'hideHud', 'timeScale', 'during', 'blendOut', 'follow', 'duration'];
const KEY_KEYS = ['t', 'pos', 'look', 'fov', 'ease'];
const FLYBY_KEYS = ['model', 'faction', 'path', 'speed', 'sound', 'deploy', 'loop', 'scale'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** §6.2 Pos: [x, z] | { x, z, h? } | { x, z, y } | { s, l?, h? } */
export function isPos(p) {
  if (Array.isArray(p)) return p.length >= 2 && isNum(p[0]) && isNum(p[1]);
  if (!isObj(p)) return false;
  if ('s' in p) return isNum(p.s) && (p.l === undefined || isNum(p.l)) && (p.h === undefined || isNum(p.h));
  return isNum(p.x) && isNum(p.z) && (p.h === undefined || isNum(p.h)) && (p.y === undefined || isNum(p.y));
}
function isYaw(y) {
  if (y === undefined || isNum(y) || y === 'route' || y === 'reverse') return true;
  return isObj(y) && (('face' in y && isPos(y.face)) || ('azimuth' in y && isNum(y.azimuth)));
}

// ======================================================================================== validateLevel
/**
 * Static checks (§6, §6.10 "rejects unknown keys and dangling ids"): shapes, ids, references between ids, action and
 * condition keys and their arguments, positions. Returns a list of human-readable errors ([] = valid). Custom action
 * and condition names (`call`, `custom`) are checked against `ctx.mission`'s registry only when it already knows them
 * as level-registered names would be missing before custom.install; an unknown `call` name is therefore not an error.
 * Keys starting with '_' are ignored everywhere (author notes).
 */
export function validateLevel(def, ctx) {
  const E = [];
  const err = (path, msg) => E.push(`${path}: ${msg}`);
  if (!isObj(def)) return ['level: not an object'];
  const reg = ctx?.mission?._registry?.() || { actions: new Set(), conditions: new Set() };
  const unknownKeys = (o, allowed, path) => {
    if (!isObj(o)) return;
    for (const k of Object.keys(o)) if (!allowed.includes(k) && !k.startsWith('_')) err(path, `unknown key "${k}"`);
  };
  const ids = (list, path) => {
    const s = new Set();
    if (list === undefined) return s;
    if (!Array.isArray(list)) { err(path, 'must be an array'); return s; }
    list.forEach((x, i) => {
      if (!isObj(x)) { err(`${path}[${i}]`, 'must be an object'); return; }
      if (typeof x.id !== 'string' || !x.id) err(`${path}[${i}]`, 'missing id');
      else if (s.has(x.id)) err(`${path}[${i}]`, `duplicate id "${x.id}"`);
      else s.add(x.id);
    });
    return s;
  };
  unknownKeys(def, LEVEL_KEYS, 'level');
  if (typeof def.id !== 'string' || !def.id) err('level', 'missing id');
  if (typeof def.title !== 'string') err('level', 'missing title');
  if (!isObj(def.route) || !Array.isArray(def.route.points) || def.route.points.length < 2) err('route', 'needs at least two points');
  else def.route.points.forEach((p, i) => { if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) err(`route.points[${i}]`, 'must be [x, z]'); });
  if (!isObj(def.briefing)) err('briefing', 'missing');
  if (def.speakers !== undefined && !isObj(def.speakers)) err('speakers', 'must be an object');

  const Z = ids(def.zones, 'zones'), CP = ids(def.checkpoints, 'checkpoints'), OB = ids(def.objectives, 'objectives');
  const EN = ids(def.encounters, 'encounters'), TR = ids(def.triggers, 'triggers'), CO = ids(def.collectibles, 'collectibles');
  const EV = new Set(Object.keys(def.events || {})), CI = new Set(Object.keys(def.cinematics || {}));
  const CM = new Set(Object.keys(def.comms || {})), SP = new Set(Object.keys(def.speakers || {}));
  const ST = new Set();
  if (!Array.isArray(def.checkpoints) || !def.checkpoints.length) err('checkpoints', 'needs at least one checkpoint');
  (def.zones || []).forEach((z, i) => {
    const p = `zones[${i}] (${z?.id})`;
    if (!isObj(z)) return;
    unknownKeys(z, ZONE_KEYS, p);
    if (!Array.isArray(z.range) || !isNum(z.range[0]) || !isNum(z.range[1]) || z.range[1] <= z.range[0]) err(p, 'range must be [s0, s1] with s1 > s0');
    (z.structures || []).forEach((st, j) => {
      const q = `${p}.structures[${j}]`;
      if (!isObj(st) || typeof st.type !== 'string') { err(q, 'needs a type'); return; }
      if (!isPos(st.at)) err(q, 'bad position "at"');
      if (!isYaw(st.yaw)) err(q, 'bad yaw');
      if (st.id !== undefined) { if (ST.has(st.id)) err(q, `duplicate structure id "${st.id}"`); ST.add(st.id); }
    });
  });
  (def.collectibles || []).forEach((c) => ST.add(cacheId(c?.id)));

  // ---- conditions and actions
  const cond = (c, path) => {
    if (!isObj(c)) { err(path, 'condition must be an object'); return; }
    const primary = Object.keys(c).find(k => CONDITION_KEYS.includes(k));
    if (!primary) { err(path, `unknown condition ${JSON.stringify(Object.keys(c))}`); return; }
    const allowed = [primary, ...(CONDITION_MODS[primary] || [])];
    for (const k of Object.keys(c)) if (!allowed.includes(k) && !k.startsWith('_')) err(path, `unknown condition key "${k}" (with "${primary}")`);
    const v = c[primary];
    switch (primary) {
      case 'enter': if (!isObj(v) || !isPos(v.at) || !isNum(v.r)) err(path, 'enter needs { at: Pos, r }'); break;
      case 'enterZone': if (!Z.has(v)) err(path, `unknown zone "${v}"`); break;
      case 'pass': if (!isNum(v)) err(path, 'pass needs a number'); break;
      case 'cleared': if (!EN.has(v)) err(path, `unknown encounter "${v}"`); break;
      case 'killed': if (!isObj(v) || typeof v.tag !== 'string') err(path, 'killed needs { tag }'); break;
      case 'alive': if (!isObj(v) || typeof v.tag !== 'string' || !isNum(v.lte)) err(path, 'alive needs { tag, lte }'); break;
      case 'health': if (!isObj(v) || !isNum(v.below)) err(path, 'health needs { below }'); break;
      case 'objective':
        if (!OB.has(v)) err(path, `unknown objective "${v}"`);
        if (c.state !== undefined && !['done', 'failed', 'active', 'hidden'].includes(c.state)) err(path, `bad objective state "${c.state}"`);
        break;
      case 'flag': if (typeof v !== 'string') err(path, 'flag needs a name'); break;
      case 'timer': if (!isNum(v)) err(path, 'timer needs seconds'); if (c.since !== undefined && !TR.has(c.since)) err(path, `unknown trigger "${c.since}"`); break;
      case 'structure': if (!ST.has(v)) err(path, `unknown structure "${v}"`); if (typeof c.state !== 'string') err(path, 'structure needs a state'); break;
      case 'all': case 'any':
        if (!Array.isArray(v) || !v.length) err(path, `${primary} needs a non-empty list`); else v.forEach((x, i) => cond(x, `${path}.${primary}[${i}]`)); break;
      case 'not': cond(v, `${path}.not`); break;
      case 'custom': if (typeof v !== 'string') err(path, 'custom needs a name'); break;
    }
  };
  const list = (l, path) => {
    if (l === undefined) return;
    if (!Array.isArray(l)) { err(path, 'action list must be an array'); return; }
    l.forEach((a, i) => action(a, `${path}[${i}]`));
  };
  const group = (g, path) => {
    if (!isObj(g)) { err(path, 'unit group must be an object'); return; }
    unknownKeys(g, GROUP_KEYS, path);
    if (typeof g.kind !== 'string') err(path, 'unit group needs a kind');
    if (!isPos(g.at)) err(path, 'unit group needs a position "at"');
    if (g.count !== undefined && !(isNum(g.count) && g.count >= 1)) err(path, 'count must be ≥ 1');
    if (g.via !== undefined && !(isObj(g.via) && isObj(g.via.dropship) && isPos(g.via.dropship.from))) err(path, 'via needs { dropship: { from: Pos } }');
  };
  const cine = (c, path) => {
    if (!isObj(c)) { err(path, 'cinematic must be an object'); return; }
    unknownKeys(c, CINE_KEYS, path);
    if (!Array.isArray(c.keys) || !c.keys.length) { err(path, 'needs keys'); return; }
    let t = -Infinity;
    c.keys.forEach((k, i) => {
      const q = `${path}.keys[${i}]`;
      unknownKeys(k, KEY_KEYS, q);
      if (!isNum(k?.t) || k.t < t) err(q, 'key times must be numbers in ascending order');
      t = k?.t;
      if (!isPos(k?.pos) || !isPos(k?.look)) err(q, 'pos and look must be positions');
      if (k?.ease !== undefined && !['linear', 'inOut'].includes(k.ease)) err(q, `bad ease "${k.ease}"`);
    });
    list(c.during, `${path}.during`);
  };
  const flyby = (f, path) => {
    if (!isObj(f)) { err(path, 'flyby must be an object'); return; }
    unknownKeys(f, FLYBY_KEYS, path);
    if (typeof f.model !== 'string') err(path, 'flyby needs a model');
    if (!Array.isArray(f.path) || f.path.length < 2 || !f.path.every(isPos)) err(path, 'flyby path needs at least two positions');
    if (!isNum(f.speed) || f.speed <= 0) err(path, 'flyby needs a speed > 0');
    if (f.deploy !== undefined) {
      if (!isObj(f.deploy) || !isNum(f.deploy.at)) err(path, 'deploy needs { at: path index }');
      else {
        if (f.deploy.encounter !== undefined && !EN.has(f.deploy.encounter)) err(path, `unknown encounter "${f.deploy.encounter}"`);
        (f.deploy.units || []).forEach((g, i) => group(g, `${path}.deploy.units[${i}]`));
      }
    }
  };
  function action(a, path) {
    if (!isObj(a)) { err(path, 'action must be an object'); return; }
    const keys = Object.keys(a).filter(k => !k.startsWith('_'));
    const primary = actionKey(a, reg.actions);
    if (!primary) { err(path, `unknown action ${JSON.stringify(keys)}`); return; }
    if (reg.actions.has(primary) && !ACTION_KEYS.includes(primary)) return;
    const allowed = [primary, ...(ACTION_MODS[primary] || [])];
    for (const k of keys) if (!allowed.includes(k)) err(path, `unknown key "${k}" in "${primary}" action`);
    const v = a[primary];
    switch (primary) {
      case 'say': {
        const s = Array.isArray(v) ? { who: v[0], text: v[1] } : v;
        if (!isObj(s) || typeof s.who !== 'string' || typeof s.text !== 'string') err(path, 'say needs [who, text] or { who, text }');
        else if (SP.size && !SP.has(s.who)) err(path, `unknown speaker "${s.who}"`);
        break;
      }
      case 'comms': if (!CM.has(v)) err(path, `unknown comms script "${v}"`); break;
      case 'wait': if (!isNum(v) || v < 0) err(path, 'wait needs seconds ≥ 0'); break;
      case 'waitFor': cond(v, `${path}.waitFor`); if (a.timeout !== undefined && !isNum(a.timeout)) err(path, 'timeout must be a number'); break;
      case 'waitComms': break;
      case 'objective': {
        if (!isObj(v)) { err(path, 'objective needs an object'); break; }
        const ops = Object.keys(v);
        if (ops.length !== 1 || !['add', 'complete', 'fail', 'remove', 'text'].includes(ops[0])) { err(path, `objective needs one of add/complete/fail/remove/text (got ${ops})`); break; }
        const id = ops[0] === 'text' ? (Array.isArray(v.text) ? v.text[0] : undefined) : v[ops[0]];
        if (!OB.has(id)) err(path, `unknown objective "${id}"`);
        if (ops[0] === 'text' && (!Array.isArray(v.text) || typeof v.text[1] !== 'string')) err(path, 'objective text needs [id, text]');
        break;
      }
      case 'spawn': if (typeof v === 'string') { if (!EN.has(v)) err(path, `unknown encounter "${v}"`); } else group(v, `${path}.spawn`); break;
      case 'despawn': case 'kill': if (!isObj(v) || typeof v.tag !== 'string') err(path, `${primary} needs { tag }`); break;
      case 'checkpoint': if (!CP.has(v)) err(path, `unknown checkpoint "${v}"`); break;
      case 'trigger': case 'enable': case 'disable': if (!TR.has(v)) err(path, `unknown trigger "${v}"`); break;
      case 'event': if (!EV.has(v)) err(path, `unknown event "${v}"`); break;
      case 'cinematic': if (typeof v === 'string') { if (!CI.has(v)) err(path, `unknown cinematic "${v}"`); } else cine(v, `${path}.cinematic`); break;
      case 'flyby': flyby(v, `${path}.flyby`); break;
      case 'barrage': if (!isObj(v) || !isPos(v.at) || !isNum(v.radius) || !isNum(v.count) || !isNum(v.duration)) err(path, 'barrage needs { at, radius, count, duration }'); break;
      case 'structure': if (!isObj(v) || typeof v.state !== 'string') err(path, 'structure needs { id, state }'); else if (!ST.has(v.id)) err(path, `unknown structure "${v.id}"`); break;
      case 'fx':
        if (!isObj(v)) { err(path, 'fx needs an object'); break; }
        if (v.explosion) { if (!isPos(v.explosion.at)) err(path, 'fx.explosion needs { at }'); }
        else if (v.emitter) { if (typeof v.emitter.kind !== 'string' || !isPos(v.emitter.at)) err(path, 'fx.emitter needs { kind, at, id? }'); }
        else if (v.ambient) { if (typeof v.ambient.kind !== 'string' || !isPos(v.ambient.at)) err(path, 'fx.ambient needs { kind, at, radius }'); }
        else if (typeof v.stop !== 'string') err(path, 'fx needs explosion, emitter, ambient or stop');
        break;
      case 'shake': if (!isNum(v)) err(path, 'shake needs a number'); break;
      case 'music': if (!isObj(v) || !('theme' in v || 'intensity' in v || 'stinger' in v)) err(path, 'music needs theme, intensity or stinger'); break;
      case 'art': case 'weather': if (!isObj(v)) err(path, `${primary} needs an object`); break;
      case 'hint': if (!(typeof v === 'string' || (isObj(v) && (typeof v.desktop === 'string' || typeof v.touch === 'string')))) err(path, 'hint needs text or { desktop, touch }'); break;
      case 'warn': if (typeof v !== 'string') err(path, 'warn needs text'); break;
      case 'card': if (!isObj(v) || typeof v.title !== 'string') err(path, 'card needs { title, sub? }'); break;
      case 'marker':
        if (!isObj(v)) { err(path, 'marker needs an object'); break; }
        if ('remove' in v) { if (typeof v.remove !== 'string') err(path, 'marker remove needs an id'); }
        else if (typeof v.id !== 'string' || !isPos(v.at)) err(path, 'marker needs { id, at, label }');
        else if (v.kind !== undefined && !['objective', 'waypoint', 'poi', 'ally', 'threat'].includes(v.kind)) err(path, `bad marker kind "${v.kind}"`);
        break;
      case 'flag': if (!Array.isArray(v) || typeof v[0] !== 'string') err(path, 'flag needs [name, value]'); break;
      case 'player':
        if (!isObj(v)) { err(path, 'player needs an object'); break; }
        for (const k of Object.keys(v)) if (!['heal', 'refill', 'freeze', 'teleport', 'yaw'].includes(k)) err(path, `unknown player key "${k}"`);
        if (v.teleport !== undefined && !isPos(v.teleport)) err(path, 'player.teleport must be a position');
        if (v.yaw !== undefined && !isYaw(v.yaw)) err(path, 'player.yaw must be a YawSpec');
        break;
      case 'choice':
        if (!isObj(v) || !Array.isArray(v.options) || !v.options.length || v.options.length > 4) { err(path, 'choice needs 1 to 4 options'); break; }
        v.options.forEach((o, i) => {
          if (!isObj(o) || o.key === undefined || typeof o.label !== 'string') err(`${path}.options[${i}]`, 'option needs { key, label, do }');
          list(o?.do, `${path}.options[${i}].do`);
        });
        if (v.default !== undefined && !v.options.some(o => o?.key === v.default)) err(path, `default "${v.default}" is not an option key`);
        break;
      case 'interstitial': if (!Array.isArray(v) || !v.every(p => isObj(p) && typeof p.text === 'string')) err(path, 'interstitial needs pages with text'); break;
      case 'fade': if (!isNum(v)) err(path, 'fade needs a target opacity'); break;
      case 'letterbox': if (typeof v !== 'boolean') err(path, 'letterbox needs true or false'); break;
      case 'codex': case 'unlock': if (typeof v !== 'string') err(path, `${primary} needs an id`); break;
      case 'complete': break;
      case 'fail': if (typeof v !== 'string') err(path, 'fail needs a reason'); break;
      case 'parallel': if (!Array.isArray(v)) err(path, 'parallel needs a list of action lists'); else v.forEach((l, i) => list(l, `${path}.parallel[${i}]`)); break;
      case 'if': cond(v, `${path}.if`); list(a.then || [], `${path}.then`); list(a.else, `${path}.else`); if (!Array.isArray(a.then)) err(path, 'if needs then: []'); break;
      case 'call': if (typeof v !== 'string') err(path, 'call needs a name'); break;
    }
  }

  // ---- sections
  (def.checkpoints || []).forEach((c, i) => {
    const p = `checkpoints[${i}] (${c?.id})`;
    unknownKeys(c, CP_KEYS, p);
    if (!isPos(c?.at)) err(p, 'bad position "at"');
    if (!isYaw(c?.yaw)) err(p, 'bad yaw');
  });
  (def.objectives || []).forEach((o, i) => {
    const p = `objectives[${i}] (${o?.id})`;
    if (!isObj(o)) return;
    unknownKeys(o, OBJ_KEYS, p);
    if (typeof o.text !== 'string') err(p, 'missing text');
    if (!OBJECTIVE_KINDS.includes(o.kind)) { err(p, `unknown kind "${o.kind}"`); return; }
    if ((o.kind === 'reach' || o.kind === 'interact') && !isPos(o.at)) err(p, `${o.kind} needs "at"`);
    if (o.kind === 'interact' && o.seconds !== undefined && !(isNum(o.seconds) && o.seconds > 0)) err(p, 'interact seconds must be > 0');
    if ((o.kind === 'kill' || o.kind === 'destroy' || o.kind === 'escort')) {
      if (!isObj(o.target) || !(typeof o.target.tag === 'string' || typeof o.target.encounter === 'string')) err(p, `${o.kind} needs target { tag } or { encounter }`);
      else if (o.target.encounter !== undefined && !EN.has(o.target.encounter)) err(p, `unknown encounter "${o.target.encounter}"`);
    }
    if (o.kind === 'timer' && !(isNum(o.seconds) && o.seconds > 0)) err(p, 'timer needs seconds > 0');
    if (o.kind === 'flag' && typeof o.flag !== 'string') err(p, 'flag kind needs "flag"');
    if (o.marker !== undefined && !(typeof o.marker === 'boolean' || o.marker === 'targets' || isPos(o.marker))) err(p, 'marker must be true, false, "targets" or a position');
    if (o.marker === true && !isPos(o.at)) err(p, 'marker: true needs "at"');
    if (o.initial !== undefined && !['hidden', 'active'].includes(o.initial)) err(p, `bad initial "${o.initial}"`);
    if (o.failIf !== undefined) cond(o.failIf, `${p}.failIf`);
    list(o.onDone, `${p}.onDone`); list(o.onFail, `${p}.onFail`);
  });
  (def.encounters || []).forEach((e, i) => {
    const p = `encounters[${i}] (${e?.id})`;
    if (!isObj(e)) return;
    unknownKeys(e, ENC_KEYS, p);
    if (!Array.isArray(e.units) || !e.units.length) err(p, 'needs units');
    else e.units.forEach((g, j) => group(g, `${p}.units[${j}]`));
    (e.waves || []).forEach((w, j) => {
      const q = `${p}.waves[${j}]`;
      if (!isObj(w) || !Array.isArray(w.units) || !w.units.length) { err(q, 'wave needs units'); return; }
      w.units.forEach((g, k) => group(g, `${q}.units[${k}]`));
      const ok = w.when === 'cleared' || (isObj(w.when) && (isNum(w.when.delay) || isNum(w.when.remaining)));
      if (!ok) err(q, "when must be 'cleared', { delay } or { remaining }");
    });
    list(e.onCleared, `${p}.onCleared`);
  });
  (def.triggers || []).forEach((t, i) => {
    const p = `triggers[${i}] (${t?.id})`;
    if (!isObj(t)) return;
    unknownKeys(t, TRIG_KEYS, p);
    cond(t.when, `${p}.when`);
    if (!Array.isArray(t.do)) err(p, 'needs do: []'); else list(t.do, `${p}.do`);
    if (t.after !== undefined && !TR.has(t.after)) err(p, `unknown trigger "${t.after}" in after`);
    if (t.after === t.id && t.id) err(p, 'a trigger cannot come after itself');
  });
  (def.zones || []).forEach((z, i) => { list(z?.onEnter, `zones[${i}] (${z?.id}).onEnter`); });
  (def.collectibles || []).forEach((c, i) => {
    const p = `collectibles[${i}] (${c?.id})`;
    unknownKeys(c, COLL_KEYS, p);
    if (!['salvage', 'log'].includes(c?.kind)) err(p, `kind must be 'salvage' or 'log'`);
    if (!isPos(c?.at)) err(p, 'bad position "at"');
  });
  for (const [k, l] of Object.entries(def.events || {})) list(l, `events.${k}`);
  for (const [k, c] of Object.entries(def.cinematics || {})) cine(c, `cinematics.${k}`);
  for (const [k, l] of Object.entries(def.comms || {})) {
    if (!Array.isArray(l)) { err(`comms.${k}`, 'must be a list of lines'); continue; }
    l.forEach((x, i) => {
      const p = `comms.${k}[${i}]`;
      if (isObj(x) && 'wait' in x && !('text' in x)) { if (!isNum(x.wait)) err(p, 'wait needs seconds'); return; }
      if (!isObj(x) || typeof x.who !== 'string' || typeof x.text !== 'string') err(p, 'line needs { who, text }');
      else if (SP.size && !SP.has(x.who)) err(p, `unknown speaker "${x.who}"`);
    });
  }
  list(def.start, 'start');
  if (!Array.isArray(def.start)) err('start', 'missing start actions (use [])');
  for (const [k, l] of Object.entries(def.onCheckpoint || {})) {
    if (!CP.has(k)) err(`onCheckpoint.${k}`, `unknown checkpoint "${k}"`);
    list(l, `onCheckpoint.${k}`);
  }
  if (def.complete !== undefined) {
    if (!isObj(def.complete)) err('complete', 'must be { when, do? }');
    else { unknownKeys(def.complete, ['when', 'do'], 'complete'); cond(def.complete.when, 'complete.when'); list(def.complete.do, 'complete.do'); }
  }
  if (def.campaign !== undefined) {
    if (!isObj(def.campaign)) err('campaign', 'must be an object');
    else {
      unknownKeys(def.campaign, ['bench', 'waterFlags'], 'campaign');
      if (def.campaign.waterFlags !== undefined && !(Array.isArray(def.campaign.waterFlags) && def.campaign.waterFlags.every(f => typeof f === 'string'))) err('campaign', 'waterFlags must be a list of flag names');
    }
  }
  return E;
}

const cacheId = (id) => `cache:${id}`;
/** the primary key of an action: a known (or registered) key whose allowed modifiers cover every other key */
export function actionKey(a, registered) {
  const keys = Object.keys(a).filter(k => !k.startsWith('_'));
  const cands = keys.filter(k => ACTION_KEYS.includes(k) || registered?.has?.(k));
  return cands.find(c => keys.every(k => k === c || (ACTION_MODS[c] || []).includes(k))) ?? cands[0];
}

// ======================================================================================== install
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const ABILITIES = { move: 1, jump: true, hover: true, boost: true, fire: true, lock: true, blade: true, missile: true, kit: true, interact: true, tear: true };

export function install(ctx) {
  const builtinRegistry = { actions: new Map(), conditions: new Map() };
  const actions = new Map(), conditions = new Map();
  const levelScoped = { actions: new Set(), conditions: new Set() };
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };

  let elapsed = 0, gen = 0, running = false, completed = false, failed = false, completing = false, trigAcc = 0, cpSnap = null;
  let objectives = new Map(), triggers = new Map(), encounters = new Map();
  let kills = new Map(), encKills = new Map(), collected = new Set();
  let zonesEntered = new Set(), zonesIn = new Set();
  let actionMarkers = new Map(), interacts = new Map(), emitters = new Map();
  let markerSig = '', markerAcc = 0, markerDirty = true;
  let base = null;                    // { def, structures } — the load-time structure states (fresh restarts)
  let loadedFor = null;               // the world (heightfield) the collectibles and prewarm belong to
  const cacheGlows = new Map();
  let promptSig = null, progressSig = null;   // null forces the next refresh
  let musicCur = null;
  const musicAuto = { hot: 0, calm: 0, combat: false };
  let held = [];                      // list continuations whose blocking promise settled while the sim was stopped
  /** runs fn now while the sim runs; otherwise holds it for the next mission tick (pause safety) */
  const simGate = (fn) => { if (ctx.simRunning) fn(); else held.push(fn); };

  const W = () => ctx.world;
  const res = (p, out = new THREE.Vector3()) => W().resolve(p, out);
  const player = () => ctx.player?.active ? ctx.player : null;
  const routeS = () => { const p = player(); return p && W()?.route ? W().playArea(p.pos.x, p.pos.z).s : 0; };
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const waitSim = (sec) => { const d = simDeferred(); ctx.timers.after(Math.max(0, sec), () => d.resolve()); return d.promise; };
  /** polls `test` every 0.1 s of sim time (timers run inside the tick); resolves when it returns true */
  const pollSim = (g, test) => {
    const d = simDeferred();
    if (test()) { d.resolve(); return d.promise; }
    ctx.timers.every(0.1, () => {
      if (g !== gen) return false;
      if (test()) { d.resolve(); return false; }
    });
    return d.promise;
  };

  // ------------------------------------------------------------------------------------ objectives
  function objState(o) {
    return { id: o.id, text: o.text, state: o.state, ...(o.progress ? { progress: { ...o.progress } } : {}),
             optional: !!o.def.optional, ...(o.timer != null && (o.def.showTimer || o.def.kind === 'timer') ? { timer: Math.max(0, o.timer) } : {}) };
  }
  function pushObjectives() { ctx.hud?.setObjectives?.(m.objectives()); }
  function setObjective(id, state) {
    const o = objectives.get(id);
    if (!o) { warnOnce('obj:' + id, '[mission] unknown objective', id); return; }
    if (o.state === state) return;
    const was = o.state;
    o.state = state;
    if (state === 'active' && was !== 'active') {
      o.ip = 0; o.started = false; o.seen = false;
      o.timer = o.def.seconds > 0 && o.def.kind !== 'interact' ? +o.def.seconds : null;
      ctx.audio?.play?.('objective', null, { vol: 0.5 });
    }
    if (state === 'done') { ctx.audio?.play?.('objective', null); ctx.music?.stinger?.('objective'); }
    if (state === 'failed') ctx.audio?.play?.('warn', null);
    ctx.events.emit('objective:changed', { id, state, text: o.text, progress: o.progress ? { ...o.progress } : undefined });
    pushObjectives();
    markerDirty = true;
    if (state === 'done' && o.def.onDone) m.run(o.def.onDone);
    if (state === 'failed' && o.def.onFail) m.run(o.def.onFail);
  }
  function killTagOf(t) { return t.tag || (t.encounter ? 'enc:' + t.encounter : null); }
  function checkObjectives() {
    const p = player();
    for (const o of objectives.values()) {
      if (o.state !== 'active') continue;
      const d = o.def;
      let prog = null;
      switch (d.kind) {
        case 'reach':
          if (p && d.at && dist2(p.pos, res(d.at, _v)) <= (d.r ?? 40)) { setObjective(o.id, 'done'); continue; }
          break;
        case 'kill': case 'destroy': {
          const t = d.target || {}, tag = killTagOf(t);
          if (!tag) break;
          const dead = kills.get(tag) || 0;
          const live = (ctx.combat?.query({ tag }) || []).filter(x => x !== ctx.player).length;
          const enc = t.encounter && !t.tag ? encounters.get(t.encounter) : null;
          const max = t.count ?? (dead + live + (enc ? enc.pending : 0));
          prog = { cur: Math.min(dead, max), max };
          const done = t.count != null ? dead >= t.count : enc ? enc.state === 'cleared' : (max > 0 && live === 0 && dead > 0);
          if (done) { o.progress = d.showCount ? { cur: max, max } : o.progress; setObjective(o.id, 'done'); continue; }
          break;
        }
        case 'escort': {
          const t = d.target || {}, tag = killTagOf(t);
          const live = (ctx.combat?.query({ tag }) || []).filter(x => x !== ctx.player);
          const need = t.count ?? 1;
          if (live.length) o.seen = true;
          if (o.seen && live.length < need) { setObjective(o.id, 'failed'); continue; }
          if (d.at && live.length >= need) {
            const at = res(d.at, _v), r = d.r ?? 40;
            prog = { cur: live.filter(x => dist2(x.pos, at) <= r).length, max: live.length };
            if (prog.cur === live.length) { setObjective(o.id, 'done'); continue; }
          }
          break;
        }
        case 'collect': {
          const kind = d.target?.tag;
          const pool = (m.def.collectibles || []).filter(c => !kind || c.kind === kind);
          const cur = pool.filter(c => collected.has(c.id)).length, max = d.target?.count ?? pool.length;
          prog = { cur: Math.min(cur, max), max };
          if (max > 0 && cur >= max) { o.progress = d.showCount ? prog : o.progress; setObjective(o.id, 'done'); continue; }
          break;
        }
        case 'flag':
          if (d.flag && m.flags[d.flag]) { setObjective(o.id, 'done'); continue; }
          break;
      }
      if (d.showCount && prog) {
        if (!o.progress || o.progress.cur !== prog.cur || o.progress.max !== prog.max) {
          o.progress = prog;
          ctx.events.emit('objective:changed', { id: o.id, state: o.state, text: o.text, progress: { ...prog } });
          pushObjectives();
        }
      }
      if (d.failIf && m.check(d.failIf)) setObjective(o.id, 'failed');
    }
  }
  /** per tick: timer objectives and time limits */
  function tickObjectiveTimers(dt) {
    let changed = false;
    for (const o of objectives.values()) {
      if (o.state !== 'active' || o.timer == null) continue;
      const before = Math.ceil(o.timer);
      o.timer -= dt;
      if (Math.ceil(o.timer) !== before) changed = true;
      if (o.timer <= 0) { o.timer = 0; setObjective(o.id, o.def.kind === 'timer' ? 'done' : 'failed'); changed = false; }
    }
    if (changed) pushObjectives();
  }

  // ------------------------------------------------------------------------------------ interactions (§6.8, A5.2)
  function interactEntries() {
    const out = [];
    for (const o of objectives.values()) {
      if (o.state !== 'active' || o.def.kind !== 'interact') continue;
      out.push({ key: 'obj:' + o.id, label: o.def.label || o.text, r: o.def.r ?? 14, seconds: o.def.seconds ?? 2, rec: o,
                 pos: () => res(o.def.at, _q) });
    }
    for (const it of interacts.values()) out.push({ key: 'int:' + it.id, label: it.label, r: it.r, seconds: it.seconds, rec: it, pos: it.pos });
    return out;
  }
  function tickInteracts(dt) {
    const p = player();
    const gated = p?.abilities?.interact === false;
    let best = null, bd = Infinity;
    const list = interactEntries();
    for (const e of list) {
      const q = e.pos();
      if (!q || !p) continue;
      const d = dist2(p.pos, q);
      const inside = d <= e.r && Math.abs(p.pos.y - q.y) < 30;
      if (e.rec.started && inside && !gated) {
        e.rec.ip = Math.min(1, (e.rec.ip || 0) + dt / Math.max(0.05, e.seconds));
        if (e.rec.ip >= 1) { completeInteract(e); continue; }
      }
      if (inside && !gated && d < bd) { bd = d; best = e; }
    }
    if (best && !best.rec.started && p && ctx.input?.pressed?.('interact') && !ctx.hud?.choosing) {
      best.rec.started = true;
      ctx.audio?.play?.('interact', null);
    }
    // prompt and progress
    const sig = best ? `${best.key}|${best.label}|${best.rec.started ? 1 : 0}|${(best.rec.ip || 0).toFixed(2)}` : '';
    if (sig !== promptSig) {
      promptSig = sig;
      if (best) ctx.hud?.prompt?.(best.label, { key: 'F', progress: best.rec.started ? best.rec.ip || 0 : null });
      else ctx.hud?.prompt?.(null);
    }
    const run = list.find(e => e.rec.started && (e.rec.ip || 0) < 1);
    const ps = run ? `${run.label}|${(run.rec.ip || 0).toFixed(2)}` : '';
    if (ps !== progressSig) { progressSig = ps; ctx.hud?.progress?.(run ? String(run.label).toUpperCase() : null, run ? run.rec.ip || 0 : 0); }
  }
  function completeInteract(e) {
    ctx.audio?.play?.('confirm', null);
    if (e.key.startsWith('obj:')) setObjective(e.rec.id, 'done');
    else {
      const it = e.rec;
      interacts.delete(it.id);
      if (it.flag) m.setFlag(it.flag, true);
      if (it.onDone) m.run(it.onDone);
    }
    promptSig = null; progressSig = null;
  }

  // ------------------------------------------------------------------------------------ encounters
  function groupY(g, base) {
    const at = g.at;
    if (at && !Array.isArray(at) && typeof at === 'object' && !('s' in at) && Number.isFinite(at.y)) return at.y;
    const h = at && !Array.isArray(at) && Number.isFinite(at.h) ? at.h : 0;
    return W().groundHeight(base.x, base.z) + h;
  }
  /** spawns one UnitGroup now (or by dropship: returns [] and calls onLate when the group lands) */
  function spawnGroup(g, tags, encId) {
    if (g.via?.dropship && ctx.cinematics?.flyby) {
      const enc = encId ? encounters.get(encId) : null;
      if (enc) enc.pending++;
      const to = res(g.at, new THREE.Vector3());
      const from = g.via.dropship.from, h = g.via.dropship.h ?? 60;
      const fromP = Array.isArray(from) ? { x: from[0], z: from[1], h } : { ...from, h: from.h ?? h };
      const landing = { x: to.x, z: to.z, h: 18 };
      const exit = { x: to.x + (to.x - (res(from, _p).x)), z: to.z + (to.z - _p.z), h: h + 40 };
      const myGen = gen;
      ctx.cinematics.flyby({ model: 'dropship', faction: g.opts?.faction, path: [fromP, landing, exit], speed: 55, sound: 'dropship',
        deploy: { at: 1 } }, { onDeploy: () => {
          if (myGen !== gen) return;
          if (enc) enc.pending = Math.max(0, enc.pending - 1);
          spawnGroup({ ...g, via: undefined }, tags, encId);
        } });
      return [];
    }
    const n = Math.max(1, Math.floor(g.count ?? 1));
    const base = res(g.at, new THREE.Vector3());
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = ctx.random() * Math.PI * 2, r = (g.spread || 0) * Math.sqrt(ctx.random());
      _p.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
      _p.y = groupY(g, _p);
      const opts = { ...(g.opts || {}), tags: [...(g.opts?.tags || []), ...tags] };
      const u = ctx.enemies?.spawn(g.kind, _p.clone(), opts);
      if (u) out.push(u);
    }
    return out;
  }
  function encTags(e) { const t = ['enc:' + e.id]; if (e.tag) t.push(e.tag); return t; }
  function spawnEncounter(id) {
    const e = (m.def.encounters || []).find(x => x.id === id);
    if (!e) { warnOnce('enc:' + id, '[mission] unknown encounter', id); return; }
    const cur = encounters.get(id);
    if (cur && cur.state === 'active') { warnOnce('encact:' + id, '[mission] encounter already active', id); return; }
    const rec = { def: e, state: 'active', wave: 0, waveAt: elapsed, pending: 0 };
    encounters.set(id, rec);
    encKills.set(id, new Map());
    for (const g of e.units || []) spawnGroup(g, encTags(e), id);
    ctx.events.emit('encounter:started', { id });
  }
  function updateEncounters() {
    for (const [id, rec] of encounters) {
      if (rec.state !== 'active') continue;
      const e = rec.def, waves = e.waves || [];
      const alive = ctx.enemies?.count({ tag: 'enc:' + id }) ?? 0;
      if (rec.wave < waves.length) {
        const w = waves[rec.wave], when = w.when;
        const ok = when === 'cleared' ? alive === 0 && rec.pending === 0
          : when && Number.isFinite(when.delay) ? elapsed - rec.waveAt >= when.delay
          : when && Number.isFinite(when.remaining) ? alive <= when.remaining && rec.pending === 0 : false;
        if (ok) {
          rec.wave++; rec.waveAt = elapsed;
          for (const g of w.units || []) spawnGroup(g, encTags(e), id);
          ctx.events.emit('encounter:wave', { id, wave: rec.wave });
        }
        continue;
      }
      if (alive === 0 && rec.pending === 0) {
        rec.state = 'cleared';
        ctx.events.emit('encounter:cleared', { id });
        if (e.onCleared) m.run(e.onCleared);
      }
    }
  }
  function onKilled({ target }) {
    if (!running || !target?.tags || target === ctx.player) return;
    let enc = null;
    for (const t of target.tags) if (typeof t === 'string' && t.startsWith('enc:')) enc = t.slice(4);
    for (const t of target.tags) {
      kills.set(t, (kills.get(t) || 0) + 1);
      if (enc) { const ek = encKills.get(enc) || new Map(); ek.set(t, (ek.get(t) || 0) + 1); encKills.set(enc, ek); }
    }
  }

  // ------------------------------------------------------------------------------------ zones
  function zoneAt(s) {
    const zs = m.def?.zones || [];
    return zs.find(z => s >= z.range[0] && s < z.range[1]) || (zs.length && s >= zs[zs.length - 1].range[1] ? zs[zs.length - 1] : null);
  }
  function enterZone(z, o = {}) {
    zonesIn.add(z.id);
    ctx.events.emit('zone:entered', { id: z.id, name: z.name });
    if (z.card) ctx.hud?.zoneCard(z.card.title, z.card.sub);
    if (z.art) { ctx.atmosphere?.set?.(z.art, o.instant ? 0 : (z.artBlend ?? 6)); if (z.art.palette) ctx.materials?.applyPalette?.(z.art.palette); }
    if (z.music) setTheme(z.music);
    if (z.onEnter && (z.repeat || !zonesEntered.has(z.id))) m.run(z.onEnter);
    zonesEntered.add(z.id);
  }
  function checkZones() {
    const s = routeS();
    const len = W()?.route?.length ?? Infinity;
    for (const z of m.def.zones || []) {
      const [s0, s1] = z.range;
      const inNow = zonesIn.has(z.id);
      const lo = s0 > 0 ? s0 + 10 : s0, hi = s1 >= len ? Infinity : s1 + 10;
      if (!inNow && s >= lo && s < hi && s >= s0) enterZone(z);
      else if (inNow && (s < (s0 > 0 ? s0 - 10 : -Infinity) || s > hi)) {
        zonesIn.delete(z.id);
        ctx.events.emit('zone:exited', { id: z.id, name: z.name });
      }
    }
  }

  // ------------------------------------------------------------------------------------ collectibles
  function placeCollectibles() {
    const S = ctx.structures;
    for (const g of cacheGlows.values()) g?.remove?.();
    cacheGlows.clear();
    for (const c of m.def.collectibles || []) {
      const sid = cacheId(c.id);
      if (S?.has?.('salvage_cache') && !S.get(sid)) {
        const pos = res(c.at, new THREE.Vector3());
        try { S.place({ id: sid, type: 'salvage_cache', at: c.at, state: 'sealed' }, pos, W().resolveYaw(undefined, pos)); }
        catch (e) { ctx.recordError?.('mission', e); }
      }
    }
  }
  function refreshCacheGlows() {
    for (const c of m.def.collectibles || []) {
      const has = cacheGlows.has(c.id);
      if (collected.has(c.id)) { if (has) { cacheGlows.get(c.id)?.remove?.(); cacheGlows.delete(c.id); } continue; }
      if (has) continue;
      const g = ctx.particles?.glows?.add?.(res(c.at, new THREE.Vector3()).add(_v.set(0, 2.2, 0)), { color: '#ffbf4a', size: 1.1, pulse: 'sparkle' });
      cacheGlows.set(c.id, g || null);
    }
  }
  function isHaulPart(id) {
    if (!id) return false;
    const h = ctx.haul?.isHaulPart?.(id);
    return h != null ? !!h : !!LO.PARTS?.[id]?.haul;
  }
  function collect(c) {
    collected.add(c.id);
    ctx.structures?.get?.(cacheId(c.id))?.setState?.('opened');
    cacheGlows.get(c.id)?.remove?.(); cacheGlows.delete(c.id);
    const haul = !!m.def.campaign && isHaulPart(c.unlocks);
    if (c.unlocks && !haul) ctx.save?.unlockPart?.(c.unlocks);
    if (c.codex) ctx.save?.addCodex?.(c.codex);
    const lv = ctx.save?.data?.progress?.levels?.[m.def.id];
    if (lv && Array.isArray(lv.collectibles) && !lv.collectibles.includes(c.id)) { lv.collectibles.push(c.id); ctx.save.write(); }
    const part = c.unlocks ? (LO.PARTS?.[c.unlocks]?.name || c.unlocks) : null;
    const text = haul ? `HAUL · ${part}` : c.kind === 'log' ? `LOG RECOVERED${c.label ? ' · ' + c.label : ''}` : `SALVAGE · ${part || c.label || 'CACHE'}`;
    (ctx.hud?.toast || ctx.hud?.checkpointToast)?.call(ctx.hud, String(text).toUpperCase());
    ctx.audio?.play?.('pickup', null);
    ctx.music?.stinger?.('discovery');
    const payload = { id: c.id, kind: c.kind, unlocks: c.unlocks ?? null };
    if (haul) payload.haul = true;
    ctx.events.emit('pickup', payload);
    pushObjectives();
  }
  function checkCollectibles() {
    const p = player();
    if (!p) return;
    for (const c of m.def.collectibles || []) {
      if (collected.has(c.id)) continue;
      const q = res(c.at, _v);
      if (dist2(p.pos, q) <= 12 && Math.abs(p.pos.y - q.y) < 25) collect(c);
    }
  }

  // ------------------------------------------------------------------------------------ markers
  function rebuildMarkers(force = false) {
    const list = [], sigs = [];
    for (const o of objectives.values()) {
      if (o.state !== 'active' || !o.def.marker) continue;
      const d = o.def, mk = d.marker;
      const label = String(d.label || o.text).toUpperCase().slice(0, 28);
      if (mk === 'targets') {
        const tag = killTagOf(d.target || {});
        if (!tag) continue;
        const kind = d.kind === 'escort' ? 'ally' : 'threat';
        const ts = (ctx.combat?.query({ tag }) || []).filter(t => t !== ctx.player).slice(0, 12);
        for (const t of ts) {
          const tmp = new THREE.Vector3();
          list.push({ id: `obj:${o.id}:${t.id}`, pos: () => (t.alive ? t.center(tmp) : null), label: String(t.name || '').toUpperCase(), kind });
          sigs.push(`${o.id}:${t.id}`);
        }
      } else {
        const at = mk === true ? d.at : mk;
        if (!at) continue;
        list.push({ id: 'obj:' + o.id, pos: res(at, new THREE.Vector3()), label, kind: 'objective' });
        sigs.push(o.id);
      }
    }
    for (const a of actionMarkers.values()) {
      list.push({ id: a.id, pos: res(a.at, new THREE.Vector3()), label: String(a.label ?? '').toUpperCase(), kind: a.kind || 'waypoint' });
      sigs.push('a:' + a.id + ':' + JSON.stringify(a.at));
    }
    for (const it of interacts.values()) {
      if (!it.marker) continue;
      list.push({ id: 'int:' + it.id, pos: it.pos, label: String(it.label).toUpperCase(), kind: 'poi' });
      sigs.push('i:' + it.id);
    }
    const sig = sigs.join('|');
    if (!force && sig === markerSig) return;
    markerSig = sig;
    ctx.hud?.setMarkers?.(list);
  }

  // ------------------------------------------------------------------------------------ music
  function setTheme(t, fade) {
    musicCur = t;
    ctx.music?.setTheme?.(t, fade);
    musicAuto.combat = false; musicAuto.hot = 0; musicAuto.calm = 0;
  }
  /** def.music.combat: switch to the combat theme in a fight and back after a calm, while the level's base theme plays */
  function tickMusic(dt) {
    const mu = m.def.music;
    if (!mu?.combat || !ctx.music) return;
    const baseT = mu.theme ?? 'ambient';
    // hands off unless the base theme plays, or the combat theme that this auto-switch put on
    if (!(musicCur === baseT || (musicAuto.combat && musicCur === mu.combat))) return;
    const ci = ctx.enemies?.combatIntensity?.() ?? 0;
    if (ci >= 0.5) { musicAuto.hot += dt; musicAuto.calm = 0; } else if (ci < 0.2) { musicAuto.calm += dt; musicAuto.hot = 0; }
    if (!musicAuto.combat && musicAuto.hot > 1.5) { musicAuto.combat = true; musicCur = mu.combat; ctx.music.setTheme(mu.combat, 1.5); }
    else if (musicAuto.combat && musicAuto.calm > 8) { musicAuto.combat = false; musicCur = baseT; ctx.music.setTheme(baseT, 4); }
  }

  // ------------------------------------------------------------------------------------ actions
  function builtinAction(key, a, g) {
    const v = a[key];
    switch (key) {
      case 'say': {
        const s = Array.isArray(v) ? { who: v[0], text: v[1] } : v;
        ctx.comms?.say(s.who, s.text, { hold: s.hold, priority: s.priority });
        return;
      }
      case 'comms': {
        const lines = m.def.comms?.[v];
        if (!lines) warnOnce('comms:' + v, '[mission] unknown comms script', v);
        const p = ctx.comms?.play(lines || []);
        return a.wait ? p : undefined;
      }
      case 'wait': return waitSim(+v || 0);
      case 'waitFor': { const t0 = elapsed; return pollSim(g, () => m.check(v) || (a.timeout != null && elapsed - t0 >= a.timeout)); }
      case 'waitComms': return pollSim(g, () => !ctx.comms?.busy);
      case 'objective': {
        if (v.add) setObjective(v.add, 'active');
        if (v.complete) setObjective(v.complete, 'done');
        if (v.fail) setObjective(v.fail, 'failed');
        if (v.remove) setObjective(v.remove, 'hidden');
        if (v.text) {
          const o = objectives.get(v.text[0]);
          if (o) { o.text = String(v.text[1]); ctx.events.emit('objective:changed', { id: o.id, state: o.state, text: o.text, progress: o.progress }); pushObjectives(); }
        }
        return;
      }
      case 'spawn':
        if (typeof v === 'string') spawnEncounter(v);
        else spawnGroup(v, [], null);
        return;
      case 'despawn': for (const u of (ctx.enemies?.all() || []).filter(u => u.tags?.has(v.tag))) ctx.enemies.despawn(u); return;
      case 'kill':
        for (const t of ctx.combat?.query({ tag: v.tag }) || []) if (t !== ctx.player) ctx.combat.kill(t, { team: 'neutral', kind: 'script' });
        return;
      case 'checkpoint': m.reachCheckpoint(v); return;
      case 'trigger': m.fire(v); return;
      case 'enable': { const t = triggers.get(v); if (t) t.enabled = true; return; }
      case 'disable': { const t = triggers.get(v); if (t) t.enabled = false; return; }
      case 'event': {
        const l = m.def.events?.[v];
        if (!l) { warnOnce('ev:' + v, '[mission] unknown event', v); return; }
        return m.run(l, g);
      }
      case 'cinematic': return ctx.cinematics?.play(v);
      case 'flyby': { const f = ctx.cinematics?.flyby(v); return a.wait ? f?.done : undefined; }
      case 'barrage': ctx.cinematics?.barrage(v); return;   // not blocking (§6.10)
      case 'structure': {
        const inst = ctx.structures?.get(v.id);
        if (!inst) { warnOnce('st:' + v.id, '[mission] unknown structure', v.id); return; }
        if (v.state === 'destroyed' && inst.destroy) inst.destroy(); else inst.setState(v.state);
        return;
      }
      case 'fx': {
        if (v.explosion) ctx.fx?.explosion?.(res(v.explosion.at), v.explosion.scale ?? 1, v.explosion.opts || {});
        else if (v.emitter) {
          const e = v.emitter, id = e.id || `em${emitters.size}`;
          emitters.get(id)?.stop?.();
          const h = ctx.fx?.emitter?.(e.kind, res(e.at), { rate: e.rate, scale: e.scale, color: e.color });
          if (h) emitters.set(id, h);
        } else if (v.ambient) {
          const am = v.ambient, id = am.id || `am${emitters.size}`;
          emitters.get(id)?.stop?.();
          const { id: _id, ...rest } = am;
          const h = ctx.fx?.ambient?.(rest);
          if (h) emitters.set(id, h);
        } else if (v.stop) { emitters.get(v.stop)?.stop?.(); emitters.delete(v.stop); }
        return;
      }
      case 'shake': ctx.cameraRig?.addShake(+v || 0.5); return;
      case 'music':
        if (v.theme !== undefined) setTheme(v.theme, a.fade ?? v.fade);
        if ('intensity' in v) ctx.music?.setIntensity?.(v.intensity);
        if (v.stinger) ctx.music?.stinger?.(v.stinger);
        return;
      case 'art':
        ctx.atmosphere?.set?.(v, a.blend ?? 0);
        if (v.palette) ctx.materials?.applyPalette?.(v.palette);
        return;
      case 'weather': ctx.weather?.set?.(v, a.blend ?? 0); return;
      case 'hint': ctx.hud?.hint(v, a.seconds ?? 7); return;
      case 'warn': ctx.hud?.warn(v, a.seconds ?? 2.5, !!a.soft); return;
      case 'card': ctx.hud?.zoneCard(v.title, v.sub); return;
      case 'marker':
        if (v.remove) actionMarkers.delete(v.remove);
        else actionMarkers.set(v.id, { id: v.id, at: clone(v.at), label: v.label ?? '', kind: v.kind });
        rebuildMarkers(true);
        return;
      case 'flag': m.setFlag(v[0], v[1], !!a.persist); return;
      case 'player': {
        const p = ctx.player; if (!p) return;
        if (v.heal) p.heal(+v.heal);
        if (v.refill) p.refill();
        if ('freeze' in v) p.frozen = !!v.freeze;
        if (v.teleport) { const q = res(v.teleport); p.teleport(q, v.yaw !== undefined ? W().resolveYaw(v.yaw, q) : undefined); }
        else if (v.yaw !== undefined) { const y = W().resolveYaw(v.yaw, p.pos); p.yaw = y; if ('bodyYaw' in p) p.bodyYaw = y; }
        return;
      }
      case 'choice': {
        const d = simDeferred();
        whenSettled(ctx.hud?.choice({ title: v.title, options: v.options.map(o => ({ key: o.key, label: o.label })), seconds: v.seconds, default: v.default }),
          (k) => simGate(() => {
            if (g !== gen) { d.resolve(); return; }
            const opt = v.options.find(o => o.key === k) ?? (v.default !== undefined ? v.options.find(o => o.key === v.default) : null);
            whenSettled(opt ? m.run(opt.do || [], g) : undefined, () => d.resolve());
          }));
        return d.promise;
      }
      case 'interstitial': return ctx.flow?.interstitial(v);
      case 'fade': return ctx.hud?.fade(+v, a.seconds ?? 1, { clock: 'sim' });   // sim time even when run during loading
      case 'letterbox': ctx.hud?.letterbox(!!v, a.seconds ?? 0.6); return;
      case 'codex': ctx.save?.addCodex(v); return;
      case 'unlock': ctx.save?.unlockPart(v); return;
      case 'complete': m.complete(); return;
      case 'fail': m.fail(v); return;
      case 'parallel': return simAll(v.map(list => m.run(list, g)));
      case 'if': return m.run(m.check(v) ? a.then : (a.else || []), g);
      case 'call': {
        const fn = actions.get(v);
        if (!fn) { warnOnce('call:' + v, '[mission] unknown custom action', v); return; }
        return fn(a.args, m, ctx);
      }
      default: warnOnce('act:' + key, '[mission] action not implemented:', key);
    }
  }
  /** debug builds: a blocking action that returned a plain Promise resumes on a microtask (step-chunking dependent) */
  function warnPlain(a) {
    const key = a && typeof a === 'object' ? (a.call ? 'call:' + a.call : Object.keys(a)[0]) : String(a);
    if (key === 'interstitial') return;   // menu-driven: the sim is stopped meanwhile
    warnOnce('plain:' + key, `[mission] action "${key}" returned a plain Promise; it resumes the list on a microtask, so the result depends on how step() is chunked (§1.4). Return a simDeferred() promise from core/util.js.`);
  }
  function runAction(a, g) {
    if (!a || typeof a !== 'object') return;
    for (const k of Object.keys(a)) if (k !== 'call' && actions.has(k) && !ACTION_KEYS.includes(k)) return actions.get(k)(a[k], m, ctx);
    const key = actionKey(a);
    if (!key) { warnOnce('unk:' + Object.keys(a)[0], '[mission] unknown action', a); return; }
    return builtinAction(key, a, g);
  }

  // ------------------------------------------------------------------------------------ triggers
  function checkTriggers() {
    for (const t of triggers.values()) {
      if (!running || completed) return;
      if (!t.enabled) continue;
      const once = t.def.once !== false;
      if (once && t.fired) continue;
      if (t.def.after && !triggers.get(t.def.after)?.fired) continue;
      const now = m.check(t.def.when);
      if (once) { if (now) m.fire(t.def.id); }
      else { if (now && !t.prev) m.fire(t.def.id); t.prev = now; }
    }
  }

  function resetPlayerExtras() {
    const p = ctx.player;
    if (!p) return;
    if (p.abilities && typeof p.abilities === 'object') p.abilities = { ...ABILITIES };
    for (const [k, v] of [['hoverCostScale', 1], ['enRegenScale', 1], ['gravityScale', 1]]) if (k in p) p[k] = v;
    if ('hidden' in p) p.hidden = false;
    for (const k of ['idleFacing', 'animOverride', 'autopilot']) if (k in p) p[k] = null;
    p.invuln = false;
  }
  function staticCompletes(def) {
    let found = false;
    const walk = (x) => {
      if (found || !x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if ('complete' in x && x.complete === true) { found = true; return; }
      for (const k of Object.keys(x)) if (k !== 'custom' && k !== 'art' && k !== 'terrain' && k !== 'route') walk(x[k]);
    };
    walk({ a: def.start, b: def.triggers, c: def.events, d: def.onCheckpoint, e: def.objectives, f: def.encounters, g: def.zones, h: def.cinematics });
    return found;
  }
  function unitKinds(def) {
    const kinds = new Set();
    const addG = (g) => { if (g?.kind) kinds.add(g.kind); };
    for (const e of def.encounters || []) { (e.units || []).forEach(addG); for (const w of e.waves || []) (w.units || []).forEach(addG); }
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.spawn && typeof x.spawn === 'object') addG(x.spawn);
      if (x.flyby?.deploy?.units) x.flyby.deploy.units.forEach(addG);
      for (const k of Object.keys(x)) if (k !== 'art' && k !== 'terrain' && k !== 'route' && k !== 'custom') walk(x[k]);
    };
    walk([def.start, def.triggers, def.events, def.onCheckpoint, def.cinematics]);
    return [...kinds];
  }

  // ======================================================================================== the service
  const m = {
    def: null,
    checkpoint: null,
    flags: {},
    get elapsed() { return elapsed; },
    /** extra: true while the level runs (after start, before stop) */
    get running() { return running; },
    start(def, checkpointId, snap) {
      const sameWorld = !!(ctx.world?.heightfield && loadedFor === ctx.world.heightfield && m.def === def);
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
      ctx.timeScale = 1;
      elapsed = useSnap?.elapsed ?? 0;
      completed = false; failed = false; completing = false; trigAcc = 0; running = true; markerSig = ''; promptSig = null; progressSig = null;
      if (fresh) ctx.combat?.resetStats?.();
      resetPlayerExtras();
      ctx.hud?.resetLevel?.();
      // restore state
      m.flags = clone(useSnap?.flags ?? {});
      objectives = new Map();
      for (const o of def.objectives || []) {
        const s = useSnap?.objectives?.find(x => x.id === o.id);
        objectives.set(o.id, { id: o.id, def: o, text: s?.text ?? o.text, state: s?.state ?? (o.initial === 'active' ? 'active' : 'hidden'),
                               progress: s?.progress ? { ...s.progress } : undefined, ip: s?.ip ?? 0, started: !!s?.started, seen: !!s?.seen,
                               timer: s?.timer ?? (o.initial === 'active' && o.seconds > 0 && o.kind !== 'interact' ? +o.seconds : null) });
      }
      triggers = new Map();
      for (const t of def.triggers || []) {
        const st = useSnap?.triggers?.[t.id];
        triggers.set(t.id, { def: t, fired: !!useSnap?.fired?.includes(t.id), enabled: st?.enabled ?? (t.enabled !== false),
                             firedAt: st?.firedAt ?? -1, prev: !!st?.prev });
      }
      encounters = new Map(); encKills = new Map();
      kills = new Map(Object.entries(useSnap?.kills || {}));
      for (const e of def.encounters || []) {
        const st = useSnap?.encounters?.[e.id] ?? 'pending';
        encounters.set(e.id, { def: e, state: st === 'active' ? 'pending' : st, wave: 0, waveAt: 0, pending: 0 });
        if (st === 'active') for (const [tag, n] of Object.entries(useSnap?.encKills?.[e.id] || {})) kills.set(tag, Math.max(0, (kills.get(tag) || 0) - n));
      }
      collected = new Set(useSnap?.collectibles || []);
      zonesEntered = new Set(useSnap?.zonesEntered || []); zonesIn = new Set();
      actionMarkers = new Map((useSnap?.markers || []).map(a => [a.id, a]));
      interacts = new Map();
      // the world: collectibles once per load, structure states (snapshot, else the load-time states)
      if (!sameWorld) {
        placeCollectibles();
        base = { def, structures: ctx.structures?.states?.() ?? {} };
        loadedFor = ctx.world?.heightfield || null;
        ctx.enemies?.prewarm?.(unitKinds(def));
      } else {
        ctx.materials?.applyPalette?.(def.art?.palette || {});
        ctx.atmosphere?.apply?.(def.art || {});
      }
      if (useSnap?.structures) ctx.structures?.reset?.(useSnap.structures);
      else if (base?.def === def) ctx.structures?.reset?.(base.structures);
      for (const c of def.collectibles || []) {
        const inst = ctx.structures?.get?.(cacheId(c.id));
        if (inst) inst.setState(collected.has(c.id) ? 'opened' : 'sealed', { instant: true });
      }
      refreshCacheGlows();
      // the player
      const pos = res(cp.at, new THREE.Vector3());
      ctx.player?.spawn(pos, W().resolveYaw(cp.yaw, pos), useSnap && cp.refill === false ? useSnap.player : undefined);
      // active encounters come back in full
      for (const e of def.encounters || []) if (useSnap?.encounters?.[e.id] === 'active') spawnEncounter(e.id);
      // HUD
      ctx.hud?.setMission?.(String(def.title || def.id).toUpperCase(), def.subtitle ? String(def.subtitle).toUpperCase() : '');
      pushObjectives();
      rebuildMarkers(true);
      if (fresh) ctx.save?.setCheckpoint(def.id, null);
      // A5.2: level:start fires once flags, objectives and structures are restored and the player has spawned
      ctx.events.emit('level:start', { levelId: def.id, checkpoint: m.checkpoint, fresh });
      // the zone at the spawn point is entered now (art instantly), so the level script's own art and music win
      const z = zoneAt(W()?.route ? W().playArea(pos.x, pos.z).s : 0);
      musicCur = def.music?.theme ?? 'ambient';
      if (sameWorld && !z?.music) ctx.music?.setTheme?.(musicCur, 1);
      if (z) enterZone(z, { instant: true });
      m._autoComplete = !def.complete && !staticCompletes(def);
      m.run(fresh ? def.start || [] : def.onCheckpoint?.[m.checkpoint] || []);
    },
    restart() { if (m.def) m.start(m.def, m.checkpoint, cpSnap); },
    stop() {
      gen++; running = false;
      ctx.cinematics?.stopAll?.();
      ctx.enemies?.clear();
      ctx.projectiles?.clear();
      for (const h of emitters.values()) h?.stop?.();
      emitters.clear();
      ctx.fx?.clearEmitters();
      ctx.particles?.clear();
      ctx.timers.clear();
      triggers = new Map();
      interacts = new Map();
      ctx.hud?.setMarkers?.([]);
      ctx.hud?.progress?.(null);
      ctx.hud?.prompt?.(null);
      ctx.hud?.bossBar?.(null);
      ctx.comms?.clear();
      if (ctx.hud?.choosing) ctx.hud.choice(null);
      if (ctx.player) ctx.player.frozen = false;
      ctx.timeScale = 1;
      markerSig = ''; promptSig = null; progressSig = null;
      held = [];   // stale lists only (gen changed above), including any the clears just settled
    },
    /**
     * Runs the list synchronously up to the first action that is still pending, and resumes it the moment that action
     * settles (inside the tick for simDeferred() promises). Returns a simDeferred() promise for the whole list. A list
     * whose generation is stale (mission.stop/start ran) stops before its next action. A list never resumes while the
     * sim is stopped: a wait that settles then resumes it at the next mission tick.
     */
    run(list, g = gen) {
      const d = simDeferred();
      const items = Array.isArray(list) ? list : [];
      let i = 0;
      const next = () => {
        while (i < items.length) {
          if (g !== gen) break;
          const a = items[i++];
          let r;
          try { r = runAction(a, g); }
          catch (e) { ctx.recordError?.('mission', e); continue; }
          if (isSettled(r)) continue;
          if (ctx.debug && !isSimPromise(r)) warnPlain(a);
          whenSettled(r, () => simGate(next), (e) => { ctx.recordError?.('mission', e); simGate(next); });
          return;
        }
        d.resolve();
      };
      next();
      return d.promise;
    },
    registerAction(name, fn) {
      if (typeof fn !== 'function') throw new Error(`mission.registerAction(${name}): needs a function`);
      actions.set(name, fn);
      if (ctx.world?.def) levelScoped.actions.add(name); else builtinRegistry.actions.set(name, fn);
    },
    registerCondition(name, fn) {
      if (typeof fn !== 'function') throw new Error(`mission.registerCondition(${name}): needs a function`);
      conditions.set(name, fn);
      if (ctx.world?.def) levelScoped.conditions.add(name); else builtinRegistry.conditions.set(name, fn);
    },
    /** extra: the registered names (validateLevel uses it) */
    _registry() { return { actions: new Set(actions.keys()), conditions: new Set(conditions.keys()) }; },
    check(c) {
      if (!c || typeof c !== 'object') return !!c;
      const p = player();
      if ('all' in c) return c.all.every(x => m.check(x));
      if ('any' in c) return c.any.some(x => m.check(x));
      if ('not' in c) return !m.check(c.not);
      if ('enter' in c) { if (!p) return false; return dist2(p.pos, res(c.enter.at, _v)) <= c.enter.r; }
      if ('enterZone' in c) return zonesIn.has(c.enterZone);
      if ('pass' in c) return !!p && routeS() >= c.pass;
      if ('cleared' in c) return encounters.get(c.cleared)?.state === 'cleared';
      if ('killed' in c) {
        const tag = c.killed.tag, dead = kills.get(tag) || 0;
        if (c.killed.count != null) return dead >= c.killed.count;
        const live = (ctx.combat?.query({ tag }) || []).filter(t => t !== ctx.player).length;
        return dead > 0 && live === 0;
      }
      if ('alive' in c) return ((ctx.combat?.query({ tag: c.alive.tag }) || []).filter(t => t !== ctx.player).length) <= c.alive.lte;
      if ('health' in c) {
        let t = ctx.player;
        if (c.health.tag) {
          t = (ctx.combat?.query({ tag: c.health.tag }) || [])[0];
          if (!t) return (kills.get(c.health.tag) || 0) > 0;   // all dead: below any fraction
        }
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
      if ('custom' in c) {
        const fn = conditions.get(c.custom);
        if (!fn) { warnOnce('cond:' + c.custom, '[mission] unknown custom condition', c.custom); return false; }
        return !!fn(c.args, m, ctx);
      }
      warnOnce('condk:' + Object.keys(c)[0], '[mission] unknown condition', c);
      return false;
    },
    objective(id) { const o = objectives.get(id); return o ? objState(o) : undefined; },
    objectives() { return [...objectives.values()].map(objState); },
    fire(id) {
      const t = triggers.get(id);
      if (!t) { warnOnce('trig:' + id, '[mission] unknown trigger', id); return; }
      if (t.def.once !== false) t.fired = true;
      t.firedAt = elapsed;
      ctx.events.emit('trigger:fired', { id });
      m.run(t.def.do || []);
    },
    setFlag(k, v, persist = false) {
      m.flags[k] = v;
      if (persist) ctx.save?.setFlag(k, v);
    },
    reachCheckpoint(id) {
      const cps = m.def?.checkpoints || [];
      const i = cps.findIndex(c => c.id === id);
      if (i < 0) { warnOnce('cp:' + id, '[mission] unknown checkpoint', id); return; }
      const cp = cps[i];
      m.checkpoint = id;
      cpSnap = m.snapshot();
      ctx.save?.setCheckpoint(m.def.id, cpSnap);
      ctx.hud?.checkpointToast?.(cp.label || id);
      ctx.audio?.play?.('checkpoint', null);
      ctx.events.emit('checkpoint:reached', { id, label: cp.label || id });
    },
    snapshot() {
      const enc = {}, ek = {};
      for (const [id, r] of encounters) {
        enc[id] = r.def.persist === false && r.state !== 'pending' ? 'pending' : r.state;
        if (enc[id] === 'active') ek[id] = Object.fromEntries(encKills.get(id) || []);
      }
      const trig = {};
      for (const [id, t] of triggers) if (t.firedAt >= 0 || t.enabled !== (t.def.enabled !== false) || t.prev) trig[id] = { enabled: t.enabled, firedAt: t.firedAt, prev: !!t.prev };
      return {
        levelId: m.def?.id ?? null, checkpoint: m.checkpoint, flags: clone(m.flags),
        objectives: [...objectives.values()].map(o => ({ id: o.id, state: o.state, text: o.text,
          progress: o.progress ? { ...o.progress } : undefined, timer: o.timer ?? undefined, ip: o.ip || 0, started: !!o.started, seen: !!o.seen })),
        fired: [...triggers.values()].filter(t => t.fired).map(t => t.def.id),
        triggers: trig,
        encounters: enc, encKills: ek,
        kills: Object.fromEntries(kills),
        structures: ctx.structures?.states?.() ?? {},
        collectibles: [...collected],
        player: ctx.player?.snapshot?.() ?? null,
        elapsed, zonesEntered: [...zonesEntered],
        markers: [...actionMarkers.values()].map(a => clone(a)),
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
      const wf = m.def.campaign?.waterFlags || [];
      const result = {
        time, kills: st.kills || 0, damageTaken: dmg, shots: st.shots || 0, collectibles: [...collected], rank,
        haul: [...(ctx.haul?.rack ?? [])], tears: ctx.haul?.tears ?? 0,
        water: wf.filter(f => !!m.flags[f]).length, waterMax: wf.length,
      };
      m.lastResult = result;
      ctx.events.emit('level:complete', { levelId: m.def.id, result });
    },
    fail(reason = 'Mission failed.') {
      if (!m.def || failed || completed) return;
      failed = true;
      ctx.events.emit('level:failed', { levelId: m.def.id, reason });
    },
    // ---- addendum A5.2
    addInteract(o = {}) {
      if (!o.id) throw new Error('mission.addInteract: needs an id');
      const at = o.at;
      const vec = new THREE.Vector3();
      const pos = typeof at === 'function' ? at : at?.isVector3 ? () => at : () => (at ? res(at, vec) : null);
      interacts.set(o.id, { id: o.id, pos, r: o.r ?? 14, seconds: o.seconds ?? 1.5, label: o.label || 'INTERACT', flag: o.flag,
                            onDone: o.onDone, marker: !!o.marker, ip: 0, started: false });
      promptSig = null; markerDirty = true;
    },
    removeInteract(id) { interacts.delete(id); promptSig = null; markerDirty = true; },
    /** extra: spawn one UnitGroup now (flyby deploys); tags are added to the group's own */
    _spawnGroup(g, tags = [], encId = null) { return spawnGroup(g, tags, encId); },
    /** extra: the open interactions (tests) */
    interacts() { return [...interacts.values()].map(i => ({ id: i.id, label: i.label, r: i.r, seconds: i.seconds, progress: i.ip, started: i.started })); },
    /** extra: encounter states and wave index (tests, debug) */
    encounterState(id) { const r = encounters.get(id); return r ? { state: r.state, wave: r.wave, pending: r.pending } : undefined; },
    /** extra: kill tallies by tag (tests, debug) */
    kills(tag) { return kills.get(tag) || 0; },
    /** extra: ids of the collectibles picked up this run */
    get collected() { return [...collected]; },
    /** extra: zones the player is in now */
    get zones() { return [...zonesIn]; },
    update(dt) {
      if (held.length) {   // waits that settled while the sim was stopped resume now
        const h = held; held = [];
        for (const fn of h) { try { fn(); } catch (e) { ctx.recordError?.('mission', e); } }
      }
      if (!running || !m.def) return;
      elapsed += dt;
      tickInteracts(dt);
      tickObjectiveTimers(dt);
      tickMusic(dt);
      trigAcc += dt;
      markerAcc += dt;
      if (trigAcc < 0.1 - 1e-9) return;
      trigAcc = 0;
      checkZones();
      checkCollectibles();
      checkObjectives();
      updateEncounters();
      checkTriggers();
      if (markerAcc >= 0.5 || markerDirty) { markerAcc = 0; markerDirty = false; rebuildMarkers(); }
      if (!completed && running) {
        if (m.def.complete?.when) {
          if (!completing && m.check(m.def.complete.when)) {
            completing = true;
            const g = gen;
            whenSettled(m.run(m.def.complete.do || [], g), () => { if (g === gen) m.complete(); });
          }
        } else if (m._autoComplete && W()?.route && player() && routeS() >= W().route.length - 40) m.complete();
      }
    },
  };

  ctx.events.on('target:killed', onKilled);
  ctx.events.on('level:cleared', () => {
    for (const n of levelScoped.actions) { if (builtinRegistry.actions.has(n)) actions.set(n, builtinRegistry.actions.get(n)); else actions.delete(n); }
    for (const n of levelScoped.conditions) { if (builtinRegistry.conditions.has(n)) conditions.set(n, builtinRegistry.conditions.get(n)); else conditions.delete(n); }
    levelScoped.actions.clear(); levelScoped.conditions.clear();
    base = null; loadedFor = null; cacheGlows.clear();
  });
  ctx.addSystem({ name: 'mission', phase: 'mission', when: 'sim', order: 0, update: (dt) => m.update(dt) });
  ctx.mission = m;
  return m;
}
