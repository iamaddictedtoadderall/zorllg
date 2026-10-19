// levels/level02/index.js — Level 2's runtime: the custom actions and conditions named by levels/level02.js, the level's
// own systems, and the glue to the engine services. Level 1's runtime (levels/level01/index.js) is the pattern.
//
// installLevel02(ctx, mission, DATA, opts) runs from LevelDef.custom.install, after World.load and before mission.start
// (arch §8.2). It builds the runtime `L` (ctx.l02): the convoy, Tick and the kite, the Watcher, Rusk's Skimmer, the
// Sundial's blade and shadow stripe, the salt crust, the far sails, the Tally on the horizon and the rocket volleys;
// registers the level's unit kinds and actions/conditions (level scoped: mission drops them on level:cleared); and adds:
//   l02-physics  (physics, sim)   after the player: rigs are solid to the frame, the Watcher's circle, the tow mirror;
//   l02-mission  (mission, sim)   the convoy, actors, volleys, terms, the reeds' pushers, the Skimmers' exit clock;
//   l02-fx       (fx, sim)        drawing the convoy and the actors, glow anchors on structures and units.
// Every level start (fresh or checkpoint restart: `level:start`) resets the runtime and restores the convoy from the
// mission flags; the checkpoint lists then call `restoreCommon` and re-run what they need. Sim-relevant state runs on sim
// dt and ctx.random (deterministic). Every addendum 02 engine feature is feature-detected (ctx.sync, ctx.hud.tracker).
import * as THREE from 'three';
import { simDeferred, simResolved, clamp, yawTo, angWrap } from '../../src/core/util.js';
import { ensureL2Structures, L2_STRUCTURE_TYPES } from './structures.js';
import { signMesh } from '../level01/structures.js';
import { setGlowService, plantFlag, spawnWreck as spawnWreckL1, updateWrecks, glowSprite, disposeGlow } from '../level01/actors.js';
import { mats2, shared, cached, instance } from './kit2.js';
import { Convoy } from './convoy.js';
import { registerL2Units, yachtWreckGeo } from './units.js';
import { registerTally } from './tally.js';
import { Tick2, Kite2, Watcher, RuskSkimmer } from './actors.js';
import { SundialBlade, ShadowStripe } from './sundial.js';
import { SaltFlats } from './ground.js';
import { FarSails, TallySkyline, Volleys } from './skyline.js';
import { setPushers } from './reeds.js';
import { Explainer } from './terms.js';

export { ensureL2Structures };
/** every structure type the level registers itself (Level 2's own, and Level 1's tank_cairn and wake_lamp) */
export const L2_TYPES = new Set([...L2_STRUCTURE_TYPES, 'tank_cairn', 'wake_lamp']);

/** the live engine context, when the game is running (debug.js publishes it as window.__game.ctx) */
export function liveCtx() {
  try { return globalThis.__game?.ctx ?? null; } catch (e) { return null; }
}

const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const CP_ORDER = ['cp_lip', 'cp_reeds', 'cp_ruins', 'cp_flats', 'cp_deck', 'cp_road'];
const PANELS = ['ap', 'en', 'weapons', 'radar', 'compass', 'objectives', 'lock', 'rack', 'sync', 'tracker'];
const SYSTEMS = ['l02-physics', 'l02-mission', 'l02-fx'];
const FULL = { move: 1, jump: true, hover: true, boost: true, fire: true, lock: true, blade: true, missile: true, kit: true, interact: true, tear: true };

// ════════════════════════════════════════════════════════════════════════════════════════════════════ install
export function installLevel02(ctx, mission, DATA, opts = {}) {
  if (ctx.l02) { try { ctx.l02.dispose(); } catch (e) { ctx.recordError?.('level02', e); } }
  const m = mission || ctx.mission;
  ensureL2Structures(ctx);
  setGlowService(ctx.particles?.glows);
  const L = createRuntime(ctx, m, DATA, opts);
  ctx.l02 = L;
  placeMissingStructures(ctx, opts);
  registerL2Units(ctx, L);
  registerTally(ctx, L);
  registerActions(L);
  registerConditions(L);
  addSystems(L);
  L.listen();
  return L;
}

/** the zones' level-only structures, when World.load couldn't place them (the types weren't registered yet) */
function placeMissingStructures(ctx, opts) {
  const S = ctx.structures, W = ctx.world;
  if (!S?.place || !W?.resolve || !opts.ZONES) return;
  const types = opts.L2_TYPES || L2_TYPES;
  const placed = S.all?.().some(i => types.has(i.type));
  if (placed) return;
  for (const z of opts.ZONES) for (const e of z.structures || []) {
    if (!types.has(e.type)) continue;
    if (e.id && S.get?.(e.id)) continue;
    try {
      const pos = W.resolve(e.at, new THREE.Vector3());
      S.place(e, pos, W.resolveYaw(e.yaw, pos));
    } catch (err) { ctx.recordError?.('level02', err); }
  }
  S.settle?.(ctx.cameraRig?.focus);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════ runtime
function createRuntime(ctx, m, DATA, opts) {
  const L = {
    ctx, DATA, opts, mission: m,
    art: DATA.art || {}, musicDefs: DATA.music || {},
    counters: {}, heard: new Set(), waves: new Map(), unsub: [], glow: new Map(), scanned: new WeakSet(),
    tow: null, grabbedBy: null, tally: null, panels: {}, flagMeshes: {}, levelT: 0, skimLeave: false, ended: false,
    wrecks: [],

    flag(k) { return m?.flags?.[k]; },
    setFlag(k, v) { m?.setFlag ? m.setFlag(k, v) : (m.flags[k] = v); },
    groundAt(x, z) { return ctx.world?.groundHeight ? ctx.world.groundHeight(x, z) : (ctx.collision?.groundHeight?.(x, z) ?? 0); },
    signMesh(text, w, h, o) { return signMesh(ctx, text, w, h, o); },
    music(theme) { if (theme) m?.run?.([{ music: { theme } }]); },
    resolve(p, out = new THREE.Vector3()) { return ctx.world.resolve(p, out); },
    player() { const p = ctx.player; return p?.active && p.alive ? p : null; },
    cpIndex(id) { return Math.max(0, CP_ORDER.indexOf(id ?? m?.checkpoint)); },
    routeS(pos) { return ctx.world?.route?.closest?.(pos.x, pos.z)?.s ?? 0; },
  };

  // ── comms scripts with {rig} filled in (the convoy's templates), played through ctx.comms ──
  // o.urgent: the script jumps the comms queue (a hooked rig's 25 s clock can't wait behind banter)
  L.playComms = (name, vars, o = {}) => {
    const lines = m?.def?.comms?.[name];
    if (!lines) return simResolved();
    let out = vars ? lines.map(l => (l.text ? { ...l, text: l.text.replace(/\{(\w+)\}/g, (s, k) => vars[k] ?? s) } : l)) : lines;
    if (o.urgent) out = out.map(l => (l.text ? { ...l, priority: 'high' } : l));
    try { return ctx.comms?.play?.(out) ?? simResolved(); } catch (e) { ctx.recordError?.('level02', e); return simResolved(); }
  };
  // ── one-per-save hints (flag hint:<id>), as the level script's `hint()` ──
  L.runHint = (id) => {
    const text = DATA.hints?.[id];
    if (!text || L.flag('hint:' + id)) return;
    L.setFlag('hint:' + id, true);
    ctx.hud?.hint?.(text, 7);
  };

  // ── actors and level systems ──
  L.terms = new Explainer(L);
  L.convoy = new Convoy(L);
  L.tick = new Tick2(L);
  L.kite = new Kite2(L);
  L.watcher = new Watcher(L);
  L.rusk = new RuskSkimmer(L);
  L.volleys = new Volleys(L);
  try { L.stripe = new ShadowStripe(L); } catch (e) { ctx.recordError?.('level02', e); L.stripe = null; }
  try { L.blade = new SundialBlade(L); } catch (e) { ctx.recordError?.('level02', e); L.blade = null; }
  try { L.salt = new SaltFlats(L); } catch (e) { ctx.recordError?.('level02', e); L.salt = null; }
  try { L.sails = new FarSails(L); } catch (e) { ctx.recordError?.('level02', e); L.sails = null; }
  try { L.skyline = new TallySkyline(L); } catch (e) { ctx.recordError?.('level02', e); L.skyline = null; }
  // the convoy's named rigs carry lamps (glow anchors)
  for (const v of L.convoy.views.values()) scanGlows(L, v.root);

  // the frame harpoon (yachts, harpooners): Level 1's tow on ctx.player.tow; a quick boost snaps it
  let harpoonG = null;
  L.harpoonGeo = () => {
    if (!harpoonG) { harpoonG = new THREE.CylinderGeometry(0, 0.28, 1.8, 6); harpoonG.rotateX(PI / 2); shared(harpoonG); }
    return harpoonG;
  };
  const cg = new THREE.CylinderGeometry(0.07, 0.07, 1, 5); cg.translate(0, 0.5, 0); cg.rotateX(PI / 2);
  L.cable = new THREE.Mesh(cg, mats2(ctx).cable); L.cable.visible = false; L.cable.castShadow = false; L.cable.frustumCulled = false;
  ctx.levelRoot.add(L.cable);
  L.attachTow = (unit, o = {}) => {
    const p = ctx.player;
    if (!unit?.alive || !p) return;
    const T = { by: unit, t: 0 };
    L.tow = T;
    p.tow = {
      owner: T,
      to: () => {
        if (!unit.alive || unit.stagT > 0 || p.pos.distanceTo(unit.pos) > 160) return null;
        return Math.hypot(unit.pos.x - p.pos.x, unit.pos.z - p.pos.z) > 22 ? unit.pos : p.pos;
      },
      speed: o.speed ?? 18,
      seconds: o.seconds ?? 3,
      onBreak: (reason) => { if (L.tow === T) L.breakTow(reason); },
    };
    ctx.audio?.play?.('winch', p.pos);
    ctx.hud?.warn?.(ctx.input?.touch ? 'HARPOONED · BOOST TO SNAP' : 'HARPOONED · BOOST TO SNAP', 2);
  };
  L.breakTow = (reason) => {
    const t = L.tow; if (!t) return;
    L.tow = null;
    const p = ctx.player;
    if (p?.tow?.owner === t) p.tow = null;
    if (reason === 'boost' && p) { ctx.fx?.sparks?.(p.center(_c), 16, [1, 0.8, 0.5], 20); ctx.audio?.play?.('cableSnap', p.pos); }
  };
  // a yacht wreck where one died: on its side, burning 20 s (it stays on the map)
  L.spawnWreck = (pos, yaw) => {
    const { root } = instance(ctx, yachtWreckGeo(ctx));
    root.position.copy(pos); root.position.y = L.groundAt(pos.x, pos.z); root.rotation.y = yaw;
    ctx.levelRoot.add(root);
    const w = { root, pos: root.position, t: 0, burn: 20,
                em: ctx.fx?.emitter?.('fire', root.position.clone().add(_v.set(0, 1.5, 0)), { rate: 0.8, scale: 0.8 }),
                smoke: ctx.fx?.emitter?.('smoke', root.position.clone().add(_v.set(0, 3, 0)), { rate: 0.6, scale: 1 }),
                fire: glowSprite('#ff7a3a', 9, 0.8) };
    w.fire.position.set(0, 2.2, 0); root.add(w.fire);
    L.wrecks.push(w);
    if (L.wrecks.length > 14) { const old = L.wrecks.shift(); removeWreck(old); }
    return w;
  };
  const removeWreck = (w) => { w.root.parent?.remove(w.root); w.em?.stop?.(); w.smoke?.stop?.(); disposeGlow(w.fire); };

  // ── panels ──
  L.setPanels = (o) => {
    for (const k of PANELS) if (k in o) L.panels[k] = !!o[k];
    ctx.hud?.setPanels?.({ ...L.panels });
    L.setFlag('l02:panels', { ...L.panels });
  };

  // ── caches (flag the tanks: mission.addInteract) ──
  L.cachePos = (id, out = new THREE.Vector3()) => {
    const inst = ctx.structures?.get?.(id);
    if (inst?.anchors?.flag) return out.copy(inst.anchors.flag);
    if (inst) return out.copy(inst.pos).setY(inst.pos.y + 2);
    const at = DATA.caches[id];
    return at ? L.resolve({ ...at, h: 2 }, out) : null;
  };
  L.openCache = (id) => {
    if (L.flag(id)) return;
    L.setFlag('l02:open:' + id, true);
    m?.addInteract?.({ id: 'flag_' + id, at: () => L.cachePos(id, new THREE.Vector3()), r: 14, seconds: 1.5, label: 'FLAG TANKS', flag: id, marker: false });
  };
  L.plantCacheFlag = (id) => {
    if (L.flagMeshes[id]) return;
    const pos = L.cachePos(id, new THREE.Vector3()); if (!pos) return;
    const fm = plantFlag(L, pos.add(_v.set(2.2, 0.4, 0)));
    L.flagMeshes[id] = fm;
    scanGlows(L, fm);
  };
  L.openPlaque = () => {
    if (L.flag('plaque')) return;
    L.setFlag('l02:open:plaque', true);
    const P = DATA.plaque;
    m?.addInteract?.({ id: 'read_plaque', at: () => new THREE.Vector3(P.x, L.groundAt(P.x, P.z) + P.h, P.z), r: 16, seconds: 1.2, label: 'READ PLAQUE', flag: 'plaque', marker: false });
  };

  // ── per-level-start reset ──
  L.reset = (e = {}) => {
    const p = ctx.player;
    L.counters = { brokeCover: 0, unitOut: 0, hooks: 0, freed: 0, lost: 0, bandWarn: 0, onTally: 0, craneTry: 0, craneGrab: 0,
                   hullHit: 0, mastFar: 0, mastDead: 0, cablesCut: 0, deckThrown: 0, holdShot: 0, playerHits: 0 };
    L.heard.clear(); L.waves.clear();
    L.tow = null; L.grabbedBy = null; L.levelT = 0; L.skimLeave = false; L.skimWaveAt = null; L.ended = false;
    L.panels = {};
    L.cable.visible = false;
    for (const w of L.wrecks) removeWreck(w);
    L.wrecks.length = 0;
    for (const fm of Object.values(L.flagMeshes)) fm.parent?.remove(fm);
    L.flagMeshes = {};
    if (p) {
      p.abilities = { ...FULL };
      p.hoverCostScale = 1; p.enRegenScale = 1; p.gravityScale = 1;
      p.hidden = false; p.idleFacing = null; p.animOverride = null; p.autopilot = null; p.invuln = false; p.tow = null;
    }
    if (ctx.haul) ctx.haul.enabled = true;
    L.terms.reset();
    L.tick.reset(); L.kite.reset(); L.watcher.reset(); L.rusk.reset();
    L.volleys.reset();
    L.skyline?.reset?.();
    L.convoy.restore(e.checkpoint ?? m?.checkpoint);
    // what the snapshot's flags carry: planted flags, open interactions, panels
    const fl = m?.flags || {};
    for (const id of ['cacheA', 'cacheB']) {
      if (fl[id]) L.plantCacheFlag(id);
      else if (fl['l02:open:' + id]) L.openCache(id);
    }
    if (fl['l02:open:plaque'] && !fl.plaque) L.openPlaque();
    if (fl['l02:panels']) { L.panels = { ...fl['l02:panels'] }; ctx.hud?.setPanels?.({ ...L.panels }); }
    L.rackSeen = new Set(ctx.haul?.rack || []);
    L.shadeIn = null;
  };

  // ── event listeners ──
  L.listen = () => {
    const on = (type, fn) => L.unsub.push(ctx.events.on(type, (e) => { try { fn(e || {}); } catch (err) { ctx.recordError?.('level02', err); } }));
    on('level:start', (e) => L.reset(e));
    on('level:complete', () => { L.ended = true; L.amb?.wind?.stop?.(2.5); if (L.amb) L.amb.wind = null; });
    on('level:cleared', () => L.dispose());
    on('player:damaged', () => { L.counters.playerHits = (L.counters.playerHits || 0) + 1; });
    on('pickup', () => L.terms.request(['rack', 'bench']));
    on('comms:line', (e) => { if (e.text) L.heard.add(e.text); });
    on('encounter:wave', (e) => {
      L.waves.set(e.id + ':' + e.wave, L.levelT);
      if (e.id === 'e_skimmers' && e.wave >= 1) L.skimWaveAt = L.levelT;
    });
    on('unit:spawned', (e) => { if (e.unit) scanGlows(L, e.unit.root); });
    on('player:boost', () => { L.breakTow('boost'); if (L.grabbedBy) { L.grabbedBy = null; } });
    on('checkpoint:reached', () => { const p = ctx.player; if (p?.active && p.alive) p.refill?.(); });
    on('trigger:fired', (e) => { if (e.id === 't_bench') L.setFlag('p:ending', true); });
  };

  L.dispose = () => {
    for (const u of L.unsub) { try { u(); } catch (e) { /* ignore */ } }
    L.unsub = [];
    for (const n of SYSTEMS) ctx.removeSystem?.(n);
    L.amb?.wind?.stop?.(0.5); L.amb = null;
    for (const hs of L.glow.values()) for (const h of hs) h?.remove?.();
    L.glow.clear();
    for (const w of L.wrecks) removeWreck(w);
    L.wrecks.length = 0;
    for (const o of [L.convoy, L.kite, L.watcher, L.rusk, L.stripe, L.blade, L.salt, L.sails, L.skyline]) { try { o?.dispose?.(); } catch (e) { /* ignore */ } }
    L.cable?.geometry?.dispose?.();
    setPushers([]);
    if (ctx.l02 === L) ctx.l02 = null;
  };
  return L;
}

// ════════════════════════════════════════════════════════════════════════════════════════ glow anchors
/** adds P1 glows for every anchor under `root` marked userData.l01glow (the kit's glowAnchor) */
function scanGlows(L, root) {
  const G = L.ctx.particles?.glows;
  if (!G?.add || !root || L.scanned.has(root)) return;
  L.scanned.add(root);
  const hs = [];
  if (root.isLOD && root.levels?.[0]?.object) {
    const lv0 = root.levels[0].object, move = [];
    lv0.traverse(o => { if (o !== lv0 && o.userData?.l01glow && !o.isMesh) move.push(o); });
    if (move.length) {
      root.updateMatrixWorld(true);
      for (const o of move) { root.attach(o); o.updateMatrix(); }
    }
  }
  root.traverse(o => { const g = o.userData?.l01glow; if (g) { const h = G.add(o, g); if (h) hs.push(h); } });
  if (hs.length) L.glow.set(root, hs);
}
function updateGlows(L) {
  const ctx = L.ctx;
  for (const inst of ctx.structures?.all?.() || []) {
    const r = inst.root;
    if (!r || L.scanned.has(r)) continue;
    scanGlows(L, r);
  }
  for (const [root, hs] of L.glow) {
    let o = root; while (o.parent) o = o.parent;
    if (o !== ctx.scene) { for (const h of hs) h?.remove?.(); L.glow.delete(root); L.scanned.delete(root); }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════ systems
function addSystems(L) {
  const ctx = L.ctx;
  ctx.addSystem({ name: 'l02-physics', phase: 'physics', when: 'sim', order: 20, update: (dt) => physics(L, dt) });
  ctx.addSystem({ name: 'l02-mission', phase: 'mission', when: 'sim', order: 5, update: (dt) => missionTick(L, dt) });
  ctx.addSystem({ name: 'l02-fx', phase: 'fx', when: 'sim', order: 5, update: (dt) => fxTick(L, dt) });
}

/** after the player: rigs are solid (they're not colliders: the frame would ride them), the Watcher, the tow mirror */
function physics(L, dt) {
  if (dt <= 0) return;
  const p = L.player();
  if (!p) return;
  L.convoy.pushOut(p);
  for (const u of L.ctx.enemies?.alive?.() || []) if (u.kind === 'harpooner') L.convoy.pushOut(u);
  const T = L.tow;
  if (T) { T.t += dt; if (p.tow?.owner !== T) L.tow = null; }
}

function missionTick(L, dt) {
  if (dt <= 0) return;
  const ctx = L.ctx, t = ctx.clock.time, p = L.player();
  L.levelT += dt;
  L.convoy.update(dt);
  L.tick.update(dt); L.kite.update(dt, t); L.watcher.update(dt); L.rusk.update(dt);
  L.volleys.update(dt);
  L.sails?.update(dt); L.skyline?.update(dt);
  updateWrecks(L, dt);
  // the Skimmers break off north 150 s after their second wave (L2 §6 E6)
  if (L.skimWaveAt != null && !L.skimLeave && L.levelT - L.skimWaveAt >= 150) L.skimLeave = true;
  // the clarity pass: a card for each part the first time it enters the rack
  const rack = ctx.haul?.rack;
  if (rack?.length && L.rackSeen) for (const id of rack) if (!L.rackSeen.has(id)) { L.rackSeen.add(id); L.terms.request(['rack', 'bench']); }
  L.terms.update(dt);
  // flags for the caches: plant a flag the moment the tanks are flagged
  for (const id of ['cacheA', 'cacheB']) if (L.flag(id) && !L.flagMeshes[id]) { L.plantCacheFlag(id); L.setFlag('l02:open:' + id, false); ctx.audio?.play?.('confirm', null); }
  // the reeds bend away from the frame, the yachts, the Skimmers, Tick and the nearest rigs (AD §3.11)
  updatePushers(L, t);
  ambience(L, dt);
}

const PUSH = [];
function updatePushers(L, t) {
  const ctx = L.ctx, cam = ctx.camera?.position, p = L.player();
  PUSH.length = 0;
  const add = (x, z, r, k) => PUSH.push({ x, z, r, k, d: cam ? Math.hypot(x - cam.x, z - cam.z) : 0 });
  if (p) add(p.pos.x, p.pos.z, 6, p.onGround ? 1 : 0.6);
  for (const u of ctx.enemies?.alive?.() || []) {
    if (u.kind === 'land_yacht') add(u.pos.x, u.pos.z, 9, 1.2);
    else if (u.kind === 'skimmer') add(u.pos.x, u.pos.z, 10, 1.0);
    else if (u.kind === 'harpooner') add(u.pos.x, u.pos.z, 5, 0.8);
  }
  if (L.tick.visible) add(L.tick.pos.x, L.tick.pos.z, 5, 0.9);
  if (p) for (const { r } of L.convoy.near(p.pos, 3)) add(r.pos.x, r.pos.z, 9, 1);
  PUSH.sort((a, b) => a.d - b.d);
  const w = ctx.weather?.wind || L.DATA.art?.ART_BASE?.weather?.wind;
  setPushers(PUSH.slice(0, 8), t, Array.isArray(w) ? w : (w && 'x' in w ? [w.x, w.z ?? w.y] : null));
}

/** the steppe's wind (cosmetic: Math.random timing) */
function ambience(L, dt) {
  const ctx = L.ctx, A = ctx.audio, p = L.player();
  const S = L.amb || (L.amb = { wind: null, windT: 0 });
  if (!p || !A || L.ended) return;
  S.windT -= dt;
  if (S.windT <= 0) {
    S.windT = 0.5;
    if (!S.wind && A.ready !== false && A.loop) { try { S.wind = A.loop('wind', { vol: 0 }) || null; } catch (e) { S.wind = null; } }
    S.wind?.set?.({ vol: L.flag('p:camp') ? 0.12 : 0.22 });
  }
}

function fxTick(L, dt) {
  const ctx = L.ctx, t = ctx.clock.time, p = ctx.player;
  L.convoy.draw(dt);
  L.tick.draw(dt, t); L.kite.draw(dt, t); L.watcher.draw(dt); L.rusk.draw(dt, t);
  // the frame harpoon's cable
  const T = L.tow;
  if (T?.by?.alive && p?.active) {
    if (T.by.cableFrom) T.by.cableFrom(_v); else _v.copy(T.by.pos).setY(T.by.pos.y + 1.6);
    p.center(_w);
    L.cable.visible = true; L.cable.position.copy(_v); L.cable.lookAt(_w); L.cable.scale.set(1, 1, _v.distanceTo(_w));
  } else L.cable.visible = false;
  // the ghost beat on the shared ghost-lens material (AD §4.5)
  const beat = ctx.materials?.uniforms?.uBeat?.value ?? t;
  const ph = ((beat % 1) + 1) % 1;
  const M = mats2(ctx);
  if (M.ghostLens) M.ghostLens.emissiveIntensity = 0.8 + 6 * Math.exp(-ph * 7);
  L.glowT = (L.glowT ?? 0) - dt;
  if (L.glowT <= 0) { L.glowT = 0.25; updateGlows(L); }
}

// ════════════════════════════════════════════════════════════════════════════════════════ helpers
function findTally(L) {
  if (L.tally?.alive || L.tally?.root?.parent) return L.tally;
  return (L.ctx.enemies?.alive?.({ kind: 'tally' }) || [])[0] || null;
}
/** a frame-relative shot key ({ x across, z behind, y up } of an object with pos and yaw) → world */
function relPos(o, k) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  // the object's forward is (−sin yaw, −cos yaw); its right is (cos yaw, −sin yaw); behind = −forward
  return { x: o.pos.x + c * (k.x || 0) + s * (k.z || 0), z: o.pos.z - s * (k.x || 0) + c * (k.z || 0), y: o.pos.y + (k.y || 0) };
}

// ════════════════════════════════════════════════════════════════════════════════════════ custom actions
function registerActions(L) {
  const ctx = L.ctx, m = L.mission, D = L.DATA;
  const reg = (name, fn) => m.registerAction(name, (a, mm, c) => fn(a || {}, mm, c));

  reg('term', (a) => L.terms.request(a.ids || a.id));
  reg('hudPanels', (a) => {
    const o = {};
    if ('all' in a) for (const k of PANELS) o[k] = !!a.all;
    for (const k of PANELS) if (k in a) o[k] = !!a[k];
    if (o.tracker && typeof ctx.hud?.tracker !== 'function') o.tracker = false;
    L.setPanels(o);
  });
  reg('vitals', (a) => ctx.hud?.vitals?.(a));
  reg('tick', (a) => L.tick.command(a));
  reg('kite', (a) => {
    if (a.up) L.setFlag('p:ending', true);
    L.kite.command(a);
  });
  reg('flagCache', (a) => { if (a.id) L.openCache(a.id); });
  reg('plaqueInteract', () => L.openPlaque());
  reg('watcher', (a) => {
    if (a.appear) L.watcher.appear();
    if (a.leaveAfter != null) L.watcher.leaveAfter(a.leaveAfter);
    if (a.leave) L.watcher.leave();
  });
  // Sync (addendum 02 E1, feature-detected)
  reg('sync', (a) => {
    const S = ctx.sync;
    if (!S || typeof S.unlock !== 'function') return;
    try {
      if (a.enable) S.enable?.(true);
      if (a.unlock) S.unlock(...[].concat(a.unlock));
      if (a.fill != null) S.setFill?.(a.fill);
      if (a.atLeast != null) S.atLeast?.(a.atLeast);
      if (a.free) S.free?.(a.free);
    } catch (e) { ctx.recordError?.('level02', e); }
  });
  reg('tallySkyline', (a) => { if (a.show) L.skyline?.show(true); else { L.skyline?.show(false); } if (a.come) L.skyline?.come(); });
  reg('volley', (a) => { L.volleys.fire(a.n ?? 1, { freeSight: !!a.freeSight }); if ((a.n ?? 1) >= 2) L.skyline?.come(); });
  reg('convoy', (a) => {
    const C = L.convoy;
    if (a.start) { C.reset(); C.s = a.s ?? D.convoy.startS; C.mode = 'roll'; C.snapAll(); C.saveFlags(); }
    if (a.mode) {
      if (a.mode === 'circle' && a.instant && C.mode !== 'circle') C.setMode('circle', { instant: true });
      else if (a.mode !== C.mode || a.reform) C.setMode(a.mode, { instant: !!a.instant, reform: !!a.reform });
    }
    if (a.lose != null) C.loseRig(a.lose);
  });
  reg('band', (a) => { L.convoy.bandMode = a.centre === 'bigMercy' ? 'bigMercy' : 'convoy'; L.convoy.saveFlags(); });
  reg('story', (a) => {
    const prev = L.flag('campaign:story');
    const st = { ...(prev && typeof prev === 'object' ? prev : {}) };
    for (const [k, v] of Object.entries(a)) st[k] = v;
    L.setFlag('campaign:story', st);
  });
  reg('mercy', (a) => {
    const C = L.convoy, bm = C.byId.get(3), T = findTally(L);
    if (a.free && bm && bm.state !== 'gone') {
      bm.state = 'mercyStopped'; bm.v = 0;
      L.setFlag('mercy:stop', { x: Math.round(bm.pos.x * 10) / 10, z: Math.round(bm.pos.z * 10) / 10, yaw: Math.round(bm.yaw * 1000) / 1000 });
      T?.dropCables?.(true);
    }
    if (a.lost) {
      if (bm && bm.state !== 'gone') { ctx.fx?.dust?.(_v.set(bm.pos.x, bm.pos.y + 3, bm.pos.z), 40, 22, [0.95, 0.93, 0.9]); ctx.audio?.play?.('metalGroan', bm.pos); }
      C.loseRig(3);
      T?.dropCables?.(true);
    }
  });
  reg('tally', (a) => {
    const T = findTally(L);
    if (!T) return;
    if (a.harpoon) T.harpoon();
    if (a.drag) T.startDrag();
    if (a.anchor) T.anchorUp();
    if (a.restore) T.restore(a.restore);
    if (a.capsize) T.capsize();
    if (a.sweeperShot) return T.sweeperShot(typeof a.sweeperShot === 'object' ? a.sweeperShot : {});
  });
  // a shot framed on a moving thing: keys relative to Big Mercy or the Tally now
  reg('shot', (a) => {
    const def = m.def?.cinematics?.[a.name];
    if (!def) return simResolved();
    let o = null;
    if (a.rel === 'bigMercy') { const bm = L.convoy.byId.get(3); if (bm && bm.state !== 'gone') o = { pos: bm.pos, yaw: bm.yaw }; }
    if (!o && (a.rel === 'tally' || a.rel === 'bigMercy')) { const T = findTally(L); if (T) o = { pos: T.pos, yaw: T.yaw }; }
    if (!o) { const p = L.player(); o = p ? { pos: p.pos, yaw: p.yaw || 0 } : { pos: new THREE.Vector3(), yaw: 0 }; }
    const keys = def.keys.map(k => ({ ...k, pos: relPos(o, k.pos), look: relPos(o, k.look) }));
    return ctx.cinematics?.play?.({ ...def, name: a.name, keys }) ?? simResolved();
  });
  reg('mark', (a) => { if (a.id) L.setFlag('mark:' + a.id, Math.round(L.levelT * 100) / 100); });
  reg('slowmo', (a) => { ctx.player?.slowMo?.(a.scale ?? 0.4, a.seconds ?? 1.2); });
  // move the frame clear of the capsizing hull (to `dist` m from it, on the side it is on)
  reg('playerClear', (a) => {
    const p = L.player(), T = findTally(L); if (!p || !T) return;
    const dx = p.pos.x - T.pos.x, dz = p.pos.z - T.pos.z, d = Math.hypot(dx, dz);
    const R = a.dist ?? 60;
    if (d >= R && !T.onDeck?.(p)) return;
    const nx = d > 1 ? dx / d : 1, nz = d > 1 ? dz / d : 0;
    const x = T.pos.x + nx * R, z = T.pos.z + nz * R;
    p.teleport?.(new THREE.Vector3(x, L.groundAt(x, z) + 0.5, z), yawTo(T.pos.x - x, T.pos.z - z));
  });
  // a cold start beside the anchored Tally (cp_deck): the port side, `dist` m out
  reg('playerTo', (a) => {
    const p = ctx.player, T = findTally(L); if (!p || !T) return;
    const side = a.tally === 'starboard' ? -1 : 1, R = a.dist ?? 70;
    const x = T.pos.x + Math.cos(T.yaw) * R * side, z = T.pos.z - Math.sin(T.yaw) * R * side;
    p.teleport?.(new THREE.Vector3(x, L.groundAt(x, z) + 0.5, z), yawTo(T.pos.x - x, T.pos.z - z));
  });
  reg('rusk', (a) => {
    if (!a.flee) return;
    const T = findTally(L);
    const from = T ? (T.anchorWorld ? T.anchorWorld('stern', new THREE.Vector3()) : T.pos.clone()) : L.resolve(D.ramp);
    L.rusk.flee(from);
  });
  reg('musicBox', () => L.music(L.musicDefs.MUSICBOX));
  reg('restoreCommon', (a) => restoreCommon(L, a.cp));
}

/** the checkpoint-common part of every onCheckpoint list */
function restoreCommon(L, cp) {
  const ctx = L.ctx, C = L.convoy, i = L.cpIndex(cp);
  // the convoy: the snapshot's (flags, restored at level:start), else this checkpoint's default spot
  if (!Number.isFinite(L.flag('cv:s'))) { C.s = L.DATA.cpConvoy[cp] ?? C.s; C.snapAll(); C.saveFlags(); }
  // panels: the snapshot's, else what the level has shown by this checkpoint
  if (!L.flag('l02:panels')) L.setPanels({ rack: (ctx.haul?.rack?.length ?? 0) > 0, sync: i >= 3, tracker: typeof ctx.hud?.tracker === 'function' });
  L.setPanels({ ap: true, en: true, weapons: true, radar: true, compass: true, objectives: true, lock: true });
  if ((ctx.haul?.rack?.length ?? 0) > 0) L.setPanels({ rack: true });
  if (typeof ctx.hud?.tracker === 'function') L.setPanels({ tracker: true });
  ctx.hud?.vitals?.({ mode: 'locked', bpm: 60 });
  L.tick.command({ flank: true });
  if (!L.kite.visible) L.kite.command({ follow: 'tick', h: 85, show: true });
  // the Tally on the horizon belongs to the volley stretch only
  if (i >= 3) L.skyline?.show(false);
  if (i >= 2) L.watcher.gone = true;
}

// ════════════════════════════════════════════════════════════════════════════════════════ custom conditions
function registerConditions(L) {
  const ctx = L.ctx, m = L.mission;
  const reg = (name, fn) => m.registerCondition(name, (a, mm, c) => { try { return !!fn(a || {}); } catch (e) { ctx.recordError?.('level02', e); return false; } });
  const C = () => L.counters || {};
  const P = () => L.player();
  reg('convoy', (a) => L.convoy.s >= (a.gte ?? 0));
  reg('enemyWithin', (a) => {
    const p = P(); if (!p) return false;
    const r2 = (a.r ?? 100) ** 2;
    for (const u of ctx.enemies?.alive?.(a.kind ? { kind: a.kind } : {}) || []) {
      if (u.team !== 'enemy' || u.isWatcher) continue;
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  });
  reg('bandDist', (a) => !!P() && !L.flag('p:camp') && L.convoy.bandDist() >= (a.gte ?? 600));
  reg('brokeCover', () => C().brokeCover > 0);
  reg('waveStarted', (a) => L.waves.has(a.encounter + ':' + (a.wave ?? 1)) || (m.encounterState?.(a.encounter)?.wave ?? 0) >= (a.wave ?? 1));
  reg('tearAvailable', (a) => {
    const p = P(); if (!p) return false;
    if (ctx.haul?.candidate) return true;
    const r = a.r ?? 40;
    for (const t of ctx.combat?.targets || []) {
      if (!t.alive || t === p || !t.haul || t.haul.taken || !(t.stagT > 0)) continue;
      if (t.center(_c).distanceTo(p.center(_w)) <= r) return true;
    }
    return false;
  });
  reg('rackCount', (a) => (ctx.haul?.rack?.length ?? 0) >= (a.gte ?? 1));
  reg('rackHas', (a) => (ctx.haul?.rack || []).includes(a.part));
  reg('tearsThisLevel', (a) => (ctx.haul?.tears ?? 0) >= (a.gte ?? 1));
  reg('unitOut', () => C().unitOut > 0);
  reg('watcherGone', () => L.watcher.gone);
  reg('volleyLanded', (a) => L.volleys.landed(a.n ?? 1));
  reg('onTally', () => { const T = findTally(L), p = P(); return !!(T && p && T.onDeck?.(p)); });
  reg('tallyPhase', (a) => { const T = findTally(L); return !!T && T.phase === a.eq; });
  reg('mercyProgress', (a) => {
    if (L.flag('mercy:over')) return 1 >= (a.gte ?? 1);
    const T = findTally(L);
    const pr = T && T.phase >= 1 && T.phase < 1.5 ? Math.min(0.999, T.progress) : 0;
    return pr >= (a.gte ?? 1);
  });
  reg('since', (a) => { const f = L.flag('mark:' + a.mark); return Number.isFinite(f) && L.levelT - f >= (a.sec ?? 0); });
  reg('craneGrab', () => C().craneGrab > 0);
  reg('nearTally', (a) => { const T = findTally(L), p = P(); return !!(T && p && Math.hypot(T.pos.x - p.pos.x, T.pos.z - p.pos.z) <= (a.r ?? 200)); });
  reg('hungryNear', (a) => {
    const p = P(); if (!p) return false;
    for (const u of ctx.enemies?.alive?.() || []) {
      if (u.haul?.part !== 'skate_jets' || u.haul.taken) continue;
      if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= (a.r ?? 150)) return true;
    }
    return false;
  });
  reg('skimmersLeft', () => L.skimLeave && (ctx.enemies?.count?.({ kind: 'skimmer' }) ?? 0) === 0);
  reg('inShade', () => { const p = P(); return !!(p && L.stripe && L.stripe.inShade(p.pos.x, p.pos.z, 4)); });
  reg('unitAlive', (a) => (ctx.enemies?.count?.({ tag: a.tag }) ?? 0) > 0);
}
