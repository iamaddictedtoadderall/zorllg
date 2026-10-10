// levels/level01/index.js (P6) — Level 1's runtime: the custom actions and conditions named by levels/level01.js, the
// level's own systems, and the glue to the engine services (A5.6 maps every custom action onto a committed API).
//
// installLevel01(ctx, mission, DATA, opts) runs from LevelDef.custom.install, after World.load and before mission.start
// (arch §8.2). It builds the runtime `L` (ctx.l01): Tick, the kite, the cutter, Kit's flares, the towed sledge, the floe
// field, the sea, the water system, the Wake's lights; registers the level's unit kinds and actions/conditions (level
// scoped: mission drops them on level:cleared); and adds five systems:
//   l01-ai       (ai, sim)        the cutter's saw on the raw BLADE input;
//   l01-physics  (physics, sim)   after the player: water, harpoon tows, the raid tow;
//   l01-mission  (mission, sim)   actors, floes, the sun clock, the Gleaner hunt, the drowning, sledges, look timers;
//   l01-fx       (fx, sim)        drawing actors, cables, the ghost beat, glow anchors (P1 glows) on structures and units;
//   l01-late     (late, always)   the spoiler guard: the HUD never shows the frame's name before the naming.
// Every level start (fresh or checkpoint restart: `level:start`) resets the runtime; the checkpoint lists then call
// `restoreCommon` and re-run what they need. Everything sim-relevant is driven by sim dt and ctx.random (deterministic).
import * as THREE from 'three';
import { simDeferred, simResolved, clamp, damp, yawTo, angWrap } from '../../src/core/util.js';
import { ensureL1Structures, signMesh, L1_STRUCTURE_TYPES, l01Of } from './structures.js';
import { Tick, Kite, Cutter, Flares, TowedSled, updateWrecks, igniteAt, updateFires, plantFlag, dropSlabs, updateDebris, setGlowService } from './actors.js';
import { registerL1Units } from './units.js';
import { registerIcebreaker, CutLine } from './icebreaker.js';
import { FloeField, Sea, elevationAt } from './floes.js';
import { Water, bubbles } from './water.js';
import { Drown } from './drown.js';
import { WakeLights, SteamPlume, AbeyanceImpostor } from './skyline.js';
import { mats, ball, shared } from './kit.js';
import { Explainer } from './terms.js';

export { ensureL1Structures };

/** the live engine context, when the game is running (debug.js publishes it as window.__game.ctx) */
export function liveCtx() {
  try { return globalThis.__game?.ctx ?? null; } catch (e) { return null; }
}

const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const CP_ORDER = ['cp_cut', 'cp_cavern', 'cp_ridges', 'cp_abeyance', 'cp_cutline', 'cp_harvest', 'cp_floes'];
const PANELS = ['ap', 'en', 'weapons', 'radar', 'compass', 'objectives', 'lock', 'rack'];
const SYSTEMS = ['l01-ai', 'l01-physics', 'l01-mission', 'l01-fx', 'l01-late'];

// ── ability presets (L1 §12.2; A5.1 Abilities; tear on from `lock` up) ─────────────────────────────────────────────
const OFF = { move: 1, jump: false, hover: false, boost: false, fire: false, lock: false, blade: false, missile: false, kit: false, interact: false, tear: false };
const P_JUMP = { ...OFF, jump: true, hover: true };
const P_LOCK = { ...P_JUMP, fire: true, lock: true, tear: true, interact: true };
const P_QB = { ...P_LOCK, boost: true };
const P_BLADE = { ...P_QB, blade: true };
const P_MSL = { ...P_BLADE, missile: true };
export const PRESETS = {
  cutter: { ...OFF, move: 0.4 }, walk: { ...OFF, move: 0.33 }, jump: P_JUMP, lock: P_LOCK, qb: P_QB, blade: P_BLADE,
  missiles: P_MSL, full: { ...P_MSL, kit: true },
};
const ADD_KEYS = { boost: 'boost', qb: 'boost', blade: 'blade', missile: 'missile', missiles: 'missile', kit: 'kit', repair: 'kit',
                   lock: 'lock', fire: 'fire', jump: 'jump', hover: 'hover', interact: 'interact', tear: 'tear' };

// ════════════════════════════════════════════════════════════════════════════════════════════════════ install
export function installLevel01(ctx, mission, DATA, opts = {}) {
  if (ctx.l01) { try { ctx.l01.dispose(); } catch (e) { ctx.recordError?.('level01', e); } }
  const m = mission || ctx.mission;
  ensureL1Structures(ctx);
  // the level's own glow points (flares, telegraphs, saw glows) ride P1's instanced glows when they exist (A5.4):
  // no sprite program and no per-sprite draw call; without them they fall back to additive sprites
  setGlowService(ctx.particles?.glows);
  const L = createRuntime(ctx, m, DATA, opts);
  ctx.l01 = L;
  placeMissingStructures(ctx, opts);
  registerL1Units(ctx, L);
  registerIcebreaker(ctx, L);
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
  const types = opts.L1_TYPES || new Set(L1_STRUCTURE_TYPES);
  const placed = S.all?.().some(i => types.has(i.type));
  if (placed) return;
  for (const z of opts.ZONES) for (const e of z.structures || []) {
    if (!types.has(e.type)) continue;
    if (e.id && S.get?.(e.id)) continue;
    try {
      const pos = W.resolve(e.at, new THREE.Vector3());
      S.place(e, pos, W.resolveYaw(e.yaw, pos));
    } catch (err) { ctx.recordError?.('level01', err); }
  }
  S.settle?.(ctx.cameraRig?.focus);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════ runtime
function createRuntime(ctx, m, DATA, opts) {
  const L = {
    ctx, DATA, opts, mission: m,
    art: opts.art || {}, musicDefs: opts.music || {},
    counters: null, heard: new Set(), waves: new Set(),
    wrecks: [], fires: [], debris: [], unsub: [], glow: new Map(), scanned: new WeakSet(),
    tow: null, raidTow: null, drown: null, wall: null, godRay: null,
    sunElev: DATA.sunClock.from, sprintT: 0, sunRunning: false, hunt: false, dawnArt: false,
    named: false, frameTag: null, panels: {}, flagMeshes: {},

    flag(k) { return m?.flags?.[k]; },
    setFlag(k, v) { m?.setFlag ? m.setFlag(k, v) : (m.flags[k] = v); },
    groundAt(x, z) { return ctx.world?.groundHeight ? ctx.world.groundHeight(x, z) : (ctx.collision?.groundHeight?.(x, z) ?? 0); },
    inWater(pos) { return L.water ? L.water.inWater(pos) : L.groundAt(pos.x, pos.z) < DATA.sea - 1; },
    signMesh(text, w, h, o) { return signMesh(ctx, text, w, h, o); },
    music(theme) { if (theme) m?.run?.([{ music: { theme } }]); },
    resolve(p, out = new THREE.Vector3()) { return ctx.world.resolve(p, out); },
    player() { const p = ctx.player; return p?.active && p.alive ? p : null; },
    cpIndex(id) { return Math.max(0, CP_ORDER.indexOf(id ?? m?.checkpoint)); },
    routeS(pos) { return ctx.world?.route?.closest?.(pos.x, pos.z)?.s ?? 0; },
  };

  // ── actors and level systems ──
  L.tick = new Tick(L);
  L.kite = new Kite(L);
  L.cutter = new Cutter(L);
  L.flares = new Flares(L);
  L.towedSled = new TowedSled(L);
  L.cutLine = new CutLine(L);
  L.sea = new Sea(L);
  try { L.floes = new FloeField(L); } catch (e) { ctx.recordError?.('level01', e); L.floes = null; }
  L.water = new Water(L, { underArt: L.art.ART_WATER });
  L.terms = new Explainer(L);         // first-time explainer cards (the clarity pass, terms.js)
  try { L.wakeLights = new WakeLights(L); } catch (e) { ctx.recordError?.('level01', e); }
  try { L.plume = new SteamPlume(L); } catch (e) { ctx.recordError?.('level01', e); }
  try { L.abeyImp = new AbeyanceImpostor(L); } catch (e) { ctx.recordError?.('level01', e); }
  // the tow cable (harpoon on the player, the raid's harpoon on the cutter): one stretched cylinder
  const cg = new THREE.CylinderGeometry(0.07, 0.07, 1, 5); cg.translate(0, 0.5, 0); cg.rotateX(PI / 2);
  L.cable = new THREE.Mesh(cg, mats(ctx).cable); L.cable.visible = false; L.cable.castShadow = false; L.cable.frustumCulled = false;
  ctx.levelRoot.add(L.cable);
  let harpoonG = null;
  L.harpoonGeo = () => {
    if (!harpoonG) { harpoonG = new THREE.CylinderGeometry(0, 0.28, 1.8, 6); harpoonG.rotateX(PI / 2); shared(harpoonG); }
    return harpoonG;
  };

  // ── harpoon tows (the Gaffer's harpoon on Moth; quick boost snaps the cable) ──
  L.attachTow = (unit) => {
    if (!unit?.alive) return;
    L.tow = { by: unit, t: 0 };
    ctx.audio?.play?.('winch', ctx.player?.pos);
    ctx.hud?.warn?.('HARPOONED · BOOST TO SNAP', 2);
  };
  L.breakTow = (reason) => {
    const t = L.tow; if (!t) return;
    L.tow = null;
    if (reason === 'boost') {
      const p = ctx.player;
      if (p) { ctx.fx?.sparks?.(p.center(_c), 16, [1, 0.8, 0.5], 20); ctx.audio?.play?.('hit', p.pos); }
    }
  };
  // ── Gleaner latching (the sprint) ──
  L.latched = () => (ctx.enemies?.alive?.({ kind: 'gleaner' }) || []).filter(u => u.latched);
  L.latchCount = () => L.latched().length;
  L.latchIndex = (u) => Math.max(0, L.latched().indexOf(u));
  // ── Gleaner harvest targets: the 'harvest' structures (wrecks, drum racks) and burning runtime wrecks ──
  L.harvestTargets = () => {
    const out = [];
    for (const inst of ctx.structures?.all?.() || []) {
      if (inst.tag !== 'harvest' || inst.state === 'destroyed') continue;
      out.push(inst.anchors?.harvest ? inst.anchors.harvest.clone() : inst.pos.clone().setY(inst.pos.y + 3));
    }
    for (const w of L.wrecks) out.push(w.pos.clone().setY(w.pos.y + 2));
    return out;
  };

  // ── abilities, panels, slots ──
  L.setAbilities = (preset, add) => {
    const p = ctx.player; if (!p) return;
    let a = preset ? { ...(PRESETS[preset] || PRESETS.full) } : { ...(p.abilities || PRESETS.full) };
    for (const k of add || []) { const key = ADD_KEYS[k] || k; a[key] = true; }
    p.abilities = a;
    if (ctx.haul) ctx.haul.enabled = !L.cutter.on && a.tear !== false;
    L.setFlag('l01:ab', { ...a });
    // the HUD comes online with the systems (L1 §4): EN with hover, weapons/radar/lock with targeting
    const pan = {};
    if (a.hover || a.jump) pan.en = true;
    if (a.fire || a.lock) { pan.weapons = true; pan.radar = true; pan.lock = true; }
    if (Object.keys(pan).length && !L.cutter.on) L.setPanels(pan);
    L.water?.rebase?.();
  };
  L.setPanels = (o) => {
    for (const k of PANELS) if (k in o) L.panels[k] = !!o[k];
    ctx.hud?.setPanels?.({ ...L.panels });
    L.setFlag('l01:panels', { ...L.panels });
  };
  L.setCallsign = (name, frame) => {
    L.callsign = { name, frame };
    L.frameTag = frame;
    ctx.hud?.setCallsign?.(name, '', frame);
    L.setFlag('l01:callsign', { name, frame });
  };

  // ── sledges ──
  L.sledPos = (id, out = new THREE.Vector3()) => {
    if (id === 'sled1') {
      if (L.towedSled.active) return out.copy(L.towedSled.pos);
      const f = L.flag('l01:sled1Pos'); if (f) return out.set(f[0], L.groundAt(f[0], f[1]), f[1]);
      return null;
    }
    if (id === 'sled3') return L.floes?.sledPos?.(out) ?? null;
    const inst = ctx.structures?.get?.(id);
    return inst ? out.copy(inst.pos) : null;
  };
  L.openSled = (id) => {
    L.setFlag('l01:open:' + id, true);
    ctx.mission?.addInteract?.({ id: 'flag_' + id, at: () => L.sledPos(id, new THREE.Vector3()), r: 14, seconds: 1.5, label: 'FLAG SLEDGE', flag: id,
                                 marker: id !== 'sled3' });   // sled 3's objective carries its own marker
  };
  L.plantSledFlag = (id) => {
    if (L.flagMeshes[id]) return;
    const pos = L.sledPos(id, new THREE.Vector3()); if (!pos) return;
    let parent = null;
    if (id === 'sled3' && L.floes?.sled) parent = L.floes.sled;
    const fm = plantFlag(L, parent ? new THREE.Vector3(1.4, 2.2, 0) : pos.clone().add(_v.set(1.6, 2.2, 0)));
    if (parent) { fm.parent?.remove(fm); parent.add(fm); }
    L.flagMeshes[id] = fm;
    scanGlows(L, fm);
  };

  // ── per-level-start reset ──
  L.reset = (e = {}) => {
    const p = ctx.player;
    L.counters = { playerHits: 0, playerShots: 0, harpoonTele: 0, skiffRun: 0, latches: 0, carrierFlared: 0, staggered: 0, bladeKills: 0,
                   hullHit: 0, inFlood: 0, sawSweep: 0, collarAbove: 0, touchedGold: 0 };
    L.heard.clear(); L.waves.clear();
    L.lookT = 0; L.tow = null; L.raidTow = null; L.hunt = false; L.huntT = 6; L.sunRunning = false; L.sprintT = 0;
    L.sunElev = DATA.sunClock.from; L.sunArtT = 0; L.dawnArt = false; L.named = false; L.frameTag = null; L.panels = {};
    L.alcoveGlow = false; L.stencilOn = false; L.holeBub = null; L.sinking = null; L.raidLights?.forEach(s => s.parent?.remove(s)); L.raidLights = null;
    L.reassert = null; L.visor?.remove?.(); L.visor = null; L.watchers = [];
    if (L.drown) { L.drown.dispose(); L.drown = null; }
    for (const h of L.steamFog || []) h?.stop?.();
    L.steamFog = null;
    L.wall?.dispose?.(); L.wall = null;
    L.godRay?.parent?.remove(L.godRay); L.godRay = null;
    L.tick.reset(); L.kite.reset(); L.cutter.reset(); L.flares.reset(); L.towedSled.reset(); L.cutLine.reset();
    for (const w of L.wrecks) { w.root.parent?.remove(w.root); w.em?.stop?.(); w.smoke?.stop?.(); }
    L.wrecks.length = 0;
    for (const f of L.fires) { f.s.parent?.remove(f.s); f.em?.stop?.(); f.sm?.stop?.(); }
    L.fires.length = 0;
    for (const d of L.debris) d.m.parent?.remove(d.m);
    L.debris.length = 0;
    for (const fm of Object.values(L.flagMeshes)) fm.parent?.remove(fm);
    L.flagMeshes = {};
    L.water.reset();
    if (L.floes) { L.floes.running = false; L.floes.frozen = false; L.floes.reset(false); }
    L.cable.visible = false;
    L.icebreaker = null;
    // the player's addendum fields (a restart doesn't emit level:cleared, which is where P4 resets them)
    if (p) {
      p.abilities = { ...PRESETS.full };
      p.hoverCostScale = 1; p.enRegenScale = 1; p.gravityScale = 1;
      p.hidden = false; p.idleFacing = null; p.animOverride = null; p.autopilot = null; p.invuln = false;
    }
    if (ctx.haul) ctx.haul.enabled = true;
    L.wakeLights?.ensure?.();
    L.plume?.reset?.();
    // what the snapshot's flags carry: planted flags, the dropped sledge, open interactions, panels, the callsign
    const fl = m?.flags || {};
    if (fl['l01:sled1Pos']) {   // sled 1 where its tow skiff died
      const [x, z] = fl['l01:sled1Pos'], S = L.towedSled;
      S.by = null; S.active = true; S.root.visible = true; S.pos.set(x, L.groundAt(x, z), z);
    }
    L.shots0 = ctx.combat?.stats?.shots ?? 0;
    for (const id of ['sled1', 'sled2', 'sled3']) {
      if (fl[id]) L.plantSledFlag(id);
      else if (fl['l01:open:' + id] && !(id === 'sled3' && fl.sled3Lost)) L.openSled(id);
    }
    if (fl['l01:panels']) { L.panels = { ...fl['l01:panels'] }; ctx.hud?.setPanels?.({ ...L.panels }); }
    if (fl['l01:callsign']) L.setCallsign(fl['l01:callsign'].name, fl['l01:callsign'].frame);
    if (fl['l01:stencil']) L.stencilOn = true;
    if (fl['p:sunrise']) L.dawnArt = true;
    L.terms.reset();
    L.rackSeen = new Set(ctx.haul?.rack || []);   // parts already racked at this start were explained when they arrived
  };

  // ── event listeners ──
  L.listen = () => {
    const on = (type, fn) => L.unsub.push(ctx.events.on(type, (e) => { try { fn(e || {}); } catch (err) { ctx.recordError?.('level01', err); } }));
    on('level:start', (e) => { L.ended = false; L.reset(e); });
    on('level:complete', () => { L.ended = true; L.amb?.wind?.stop?.(2.5); if (L.amb) L.amb.wind = null; });
    on('level:cleared', () => L.dispose());
    on('player:damaged', (e) => {
      if (L.counters) L.counters.playerHits++;
      if (!e.blocked && (e.amount ?? 1) > 0 && L.flag('p:awake')) L.terms.request('ap');   // the frame's first real hit
    });
    on('pickup', () => L.terms.request(['cache', 'rack', 'bench']));
    on('trigger:fired', (e) => { if (e.id === 't_raid_go' && L.counters) L.counters.playerHits = 0; });
    on('target:damaged', (e) => {
      if (!L.counters) return;
      if (e.staggered && e.target !== ctx.player) L.counters.staggered++;
      const t = e.target;
      if (e.blocked && t?.isHead && t.headName === 'bow' && t.ib) t.ib.onBowBlocked?.();
    });
    on('target:killed', (e) => {
      if (!L.counters) return;
      const t = e.target, src = e.source;
      if (src?.team === 'player' && (src.kind === 'blade' || src.weapon === 'blade')) L.counters.bladeKills++;
      if (t?.tags?.has?.('sled1tow') && L.towedSled.active) {
        L.setFlag('l01:sled1Pos', [Math.round(L.towedSled.pos.x * 10) / 10, Math.round(L.towedSled.pos.z * 10) / 10]);
      }
    });
    on('comms:line', (e) => { if (e.text) L.heard.add(e.text); });
    on('encounter:wave', (e) => L.waves.add(e.id + ':' + e.wave));
    on('unit:spawned', (e) => onUnitSpawned(L, e.unit));
    on('player:boost', () => {
      L.breakTow('boost');
      for (const u of L.latched()) u.shake?.();
    });
    on('structure:state', (e) => onStructureState(L, e));
    on('zone:entered', (e) => { if (L.dawnArt) L.reassert = e.id; });
  };

  L.dispose = () => {
    for (const u of L.unsub) { try { u(); } catch (e) { /* ignore */ } }
    L.unsub = [];
    for (const n of SYSTEMS) ctx.removeSystem?.(n);
    L.drown?.dispose?.(); L.wall?.dispose?.();
    for (const h of L.steamFog || []) h?.stop?.();
    L.steamFog = null;
    L.amb?.wind?.stop?.(0.5); L.amb = null;
    for (const hs of L.glow.values()) for (const h of hs) h?.remove?.();
    L.glow.clear();
    L.floes?.dispose?.(); L.sea?.dispose?.(); L.wakeLights?.dispose?.(); L.plume?.dispose?.(); L.abeyImp?.dispose?.(); L.kite?.dispose?.(); L.towedSled?.dispose?.(); L.cutLine?.dispose?.();
    L.cable?.geometry?.dispose?.();
    if (ctx.l01 === L) ctx.l01 = null;
  };
  return L;
}

// ════════════════════════════════════════════════════════════════════════════════════════ events → runtime
function onUnitSpawned(L, u) {
  if (!u) return;
  const ctx = L.ctx;
  // the Sexton's ghost light (A1.2, A5.6): a lightGhost lens on the head plus a beat glow, ≥ 4 px at any range
  if (u.tags?.has?.('sexton')) {
    const head = u.rig?.head || u.root;
    const lensMat = ctx.materials?.get?.('lightGhost') || mats(ctx).ghost;
    const lens = new THREE.Mesh(ball(0.32, 10, 8), lensMat);
    lens.position.set(0, 0.45, -0.95); lens.castShadow = false;
    lens.userData.l01glow = { color: '#a8ff9e', size: 1.4, intensity: 6, pulse: 'beat', minPx: 4 };
    head.add(lens);
  }
  // the pin's Gaffer tows sled 1 on a cable 30 m behind (L1 §5 E2)
  if (u.config?.towing === 'sled1') { L.towedSled.attach(u); L.towedSled.setLoad(3); }
  scanGlows(L, u.root);
}

function onStructureState(L, e) {
  const ctx = L.ctx, inst = ctx.structures?.get?.(e.id);
  if (!inst) return;
  if (e.id === 'snowBridge' && e.state === 'collapsed' && inst.l01collapse) {
    inst.l01collapse = false;
    dropSlabs(L, inst.pos.clone().setY(inst.pos.y + 1), inst.yaw, { n: 12, w: 12, h: 1.4, d: 10, spread: 26, life: 4, floor: inst.pos.y - 18 });
    ctx.cameraRig?.addShake?.(1.0);
  }
  if (e.id === 'alcove' && e.state === 'broken' && inst.l01broken) {
    inst.l01broken = false;
    _v.set(0, 5, -3.2).applyAxisAngle(_w.set(0, 1, 0), inst.yaw).add(inst.pos);
    dropSlabs(L, _v, inst.yaw, { n: 8, w: 2.4, h: 3, d: 0.4, spread: 4, life: 3, floor: inst.pos.y, mat: mats(ctx).iceClear });
    ctx.audio?.play?.('iceCrack', _v);
  }
  if (e.id === 'sled1' && e.state === 'towed') {
    // the raid's sledge leaves with the harpooning skiff; the structure stays hidden (its towed state)
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════ glow anchors
/** adds P1 glows for every anchor under `root` marked userData.l01glow (glows follow the object; hidden with it) */
function scanGlows(L, root) {
  const G = L.ctx.particles?.glows;
  if (!G?.add || !root || L.scanned.has(root)) return;
  L.scanned.add(root);
  const hs = [];
  root.traverse(o => { const g = o.userData?.l01glow; if (g) { const h = G.add(o, g); if (h) hs.push(h); } });
  if (hs.length) L.glow.set(root, hs);
}
/** structures realise and unrealise with distance: scan new roots, drop handles of detached ones */
function updateGlows(L) {
  const ctx = L.ctx;
  for (const inst of ctx.structures?.all?.() || []) {
    const r = inst.root;
    if (!r || L.scanned.has(r)) continue;
    scanGlows(L, r);
    applyStructureLooks(L, inst);
  }
  for (const [root, hs] of L.glow) {
    let o = root; while (o.parent) o = o.parent;
    if (o !== ctx.scene) { for (const h of hs) h?.remove?.(); L.glow.delete(root); L.scanned.delete(root); }
  }
}
/** per-root looks that live in the runtime (they're re-applied when a structure realises again) */
function applyStructureLooks(L, inst) {
  const M = mats(L.ctx), l = l01Of(inst.root);
  if (!l) return;
  if (inst.id === 'alcove' && l.seam) l.seam.traverse(o => { if (o.isMesh) o.material = L.alcoveGlow ? M.cyan : M.cyanDead; });
  if (inst.type === 'abeyance' && l.seam) l.seam.traverse(o => { if (o.isMesh) o.material = L.stencilOn ? l.seamOn : l.seamOff; });
}

// ════════════════════════════════════════════════════════════════════════════════════════ systems
function addSystems(L) {
  const ctx = L.ctx;
  ctx.addSystem({ name: 'l01-ai', phase: 'ai', when: 'sim', order: -5, update: (dt) => L.cutter.input(dt) });
  ctx.addSystem({ name: 'l01-physics', phase: 'physics', when: 'sim', order: 20, update: (dt) => physics(L, dt) });
  ctx.addSystem({ name: 'l01-mission', phase: 'mission', when: 'sim', order: 5, update: (dt) => missionTick(L, dt) });
  ctx.addSystem({ name: 'l01-fx', phase: 'fx', when: 'sim', order: 5, update: (dt) => fxTick(L, dt) });
  ctx.addSystem({ name: 'l01-late', phase: 'late', when: 'always', order: 50, update: (dt) => lateTick(L, dt) });
}

/** after the player: water, the harpoon tow, the raid's tow of the cutter */
function physics(L, dt) {
  if (!L.counters || dt <= 0) return;
  const ctx = L.ctx, p = L.player();
  L.water.update(dt);
  if (!p) return;
  // the Gaffer's harpoon: Moth is dragged toward the skiff; 6 s, or a quick boost, or the skiff's death breaks it
  const T = L.tow;
  if (T) {
    T.t += dt;
    const u = T.by;
    if (!u?.alive || T.t > 6 || p.pos.distanceTo(u.pos) > 140) L.breakTow('end');
    else {
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d > 22) {
        const sp = Math.max(14, (u.speed || 0) * 0.8);
        p.vel.x = damp(p.vel.x, dx / d * sp, 4, dt); p.vel.z = damp(p.vel.z, dz / d * sp, 4, dt);
      }
    }
  }
  // the raid fail-safe: a harpoon in the cutter, towed to the gully
  const R = L.raidTow;
  if (R) {
    const dx = R.to.x - p.pos.x, dz = R.to.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 3 || !L.cutter.on) L.raidTow = null;
    else { const s = Math.min(d, 16 * dt); p.pos.x += dx / d * s; p.pos.z += dz / d * s; p.vel.x = dx / d * 16; p.vel.z = dz / d * 16; }
  }
}

function missionTick(L, dt) {
  if (!L.counters || dt <= 0) return;
  const ctx = L.ctx, p = L.player(), t = ctx.clock.time;
  L.counters.playerShots = Math.max(0, (ctx.combat?.stats?.shots ?? 0) - (L.shots0 ?? 0));
  L.tick.update(dt); L.kite.update(dt, t); L.flares.update(dt); L.towedSled.update(dt);
  updateWrecks(L, dt); updateFires(L, dt); updateDebris(L, dt);
  if (L.floes) L.floes.update(dt);
  L.drown?.update(dt);
  L.plume?.update(dt);
  // the clarity pass: a card for each part the first time it enters the rack, and for the first Gleaner latch
  const rack = ctx.haul?.rack;
  if (rack?.length && L.rackSeen) for (const id of rack) if (!L.rackSeen.has(id)) { L.rackSeen.add(id); L.terms.request(['rack', 'bench', id]); }
  if (L.counters.latches > 0) L.terms.request('latch');
  L.terms.update(dt);
  // the look-at timer (o_look: the kite within 8° of the screen centre for 0.5 s)
  if (L.kite.visible) {
    ctx.camera.getWorldDirection(_d);
    _v.copy(L.kite.pos).sub(ctx.camera.position).normalize();
    L.lookT = _d.dot(_v) > Math.cos((L.lookDeg ?? 8) * PI / 180) ? L.lookT + dt : 0;
  } else L.lookT = 0;
  // the sun clock (L1 §12.5): elevation is a function of sprint time; the visual sun follows every 10 s
  if (L.sunRunning) {
    L.sprintT += dt;
    L.sunElev = elevationAt(L.DATA, L.sprintT);
    L.sunArtT -= dt;
    if (L.sunArtT <= 0) {
      L.sunArtT = 10;
      if (!L.water.camUnder) ctx.atmosphere?.set?.({ sky: { sun: { elevation: elevationAt(L.DATA, L.sprintT + 10) } } }, 10);
    }
  }
  // the Gleaner hunt (E8): 2 every 20 s from the north-east, up to 6 alive
  if (L.hunt && p) {
    L.huntT -= dt;
    if (L.huntT <= 0) {
      L.huntT = 20;
      const alive = ctx.enemies?.count?.({ tag: 'hunt' }) ?? 0;
      for (let i = 0; i < 2 && alive + i < 6; i++) {
        const at = L.resolve({ s: 3000 + (ctx.random() - 0.5) * 60, l: -300 + (ctx.random() - 0.5) * 80, h: 60 + ctx.random() * 15 });
        ctx.enemies?.spawn?.('gleaner', at, { name: 'GLEANER', tags: ['hunt'], config: { mode: 'hunt' } });
      }
    }
  }
  // sledges: plant a flag the moment one is flagged
  for (const id of ['sled1', 'sled2', 'sled3']) {
    if (L.flag(id) && !L.flagMeshes[id]) {
      L.plantSledFlag(id); L.setFlag('l01:open:' + id, false);
      ctx.audio?.play?.('confirm', null);
    }
  }
  // the bubbles at the hole (the shore kneel; only bubbles, L1 §18.2)
  const HB = L.holeBub;
  if (HB) {
    HB.t += dt;
    if (HB.t > 0 && HB.t < 12 && (HB.acc = (HB.acc ?? 0) - dt) <= 0) {
      HB.acc = 0.1;
      bubbles(ctx, _v.set(HB.at.x, L.DATA.sea + 3 - 0.5, HB.at.z), 3 + Math.floor(HB.t), 2.5);
      if (Math.floor(HB.t * 2) % 6 === 0) ctx.audio?.play?.('bubbles', HB.at, { vol: 0.5 });
    }
    if (HB.t >= 12) L.holeBub = null;
  }
  // the Icebreaker hulk going under (sprint time 8)
  const S = L.sinking;
  if (S) {
    S.t += dt;
    const u = S.unit, k = Math.min(1, S.t / 12);
    if (u?.root) {
      u.pos.x = S.from.x + S.dir.x * 40 * k; u.pos.z = S.from.z + S.dir.z * 40 * k;
      u.pos.y = S.from.y - 70 * k * k;
      u.root.position.copy(u.pos); u.root.rotation.set(0, u.yaw, 0); u.root.rotateZ(-0.6 * k); u.root.rotateX(0.25 * k);
      if (S.t > 3 && S.t < 9 && (S.splashT = (S.splashT ?? 0) - dt) <= 0) { S.splashT = 0.6; ctx.fx?.dust?.(_v.set(u.pos.x, L.DATA.sea, u.pos.z), 20, 20, [0.9, 0.95, 1]); }
    }
    if (k >= 1) { L.sinking = null; removeIcebreaker(L, u); }
  }
  ambience(L, dt);
  // the raid's lights on the ice (before the skiffs arrive)
  if (L.raidLights && (L.raidLightsT -= dt) <= 0) { for (const s of L.raidLights) s.parent?.remove(s); L.raidLights = null; }
  // zone art after the sunrise: re-assert the dawn over the zone's night preset
  if (L.reassert) {
    const id = L.reassert; L.reassert = null;
    const A = L.art, extra = id === 'z_floes' ? A.ART_FLOES : id === 'z_shore' ? A.ART_SHORE : null;
    if (A.ART_DAWN && !L.water.camUnder) {
      ctx.atmosphere?.set?.(A.ART_DAWN, 3);
      if (extra) ctx.atmosphere?.set?.(extra, 3);
      if (L.sunRunning) ctx.atmosphere?.set?.({ sky: { sun: { elevation: L.sunElev } } }, 3);
    }
    if (L.flag('p:sprint') && id === 'z_cutline') L.music(L.musicDefs.DAWN);
  }
}

/**
 * The level's ambience (L1 §15.5) and the dawn's steam fog (L1 §2.6 Z6). Audio is cosmetic (Math.random timing):
 *  · the wind over the ice (the 'wind' loop): full on the surface at night, softer after the sunrise, a whisper in the
 *    cavern, silent underwater;
 *  · distant ice cracks every 6 to 14 s, panned (deep groans in the cavern instead);
 *  · the Icebreaker's deep thrum every 4 s, audible from the Teeth (its start position until it is spawned), until the
 *    finale;
 *  · after the sunrise, low steam rising off the open-water leads (persistent 'steam' emitters, re-made after a restart).
 */
function ambience(L, dt) {
  const ctx = L.ctx, A = ctx.audio, p = L.player();
  const S = L.amb || (L.amb = { wind: null, windT: 0, crackT: 4, thrumT: 2 });
  if (p && A && !L.ended) {
    const under = !!L.water?.camUnder || L.water?.state === 'water';
    const s = L.routeS(p.pos);
    const cavern = s > 322 && s < 640 && p.pos.y < -6;
    S.windT -= dt;
    if (S.windT <= 0) {
      S.windT = 0.5;
      if (!S.wind && A.ready !== false && A.loop) { try { S.wind = A.loop('wind', { vol: 0 }) || null; } catch (e) { S.wind = null; } }
      const vol = under || L.drown?.blackout ? 0 : cavern ? 0.05 : L.flag('p:sunrise') ? 0.2 : 0.3;
      S.wind?.set?.({ vol });
    }
    S.crackT -= dt;
    if (S.crackT <= 0 && !under) {
      S.crackT = 6 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2, r = cavern ? 30 + Math.random() * 40 : 160 + Math.random() * 220;
      _v.set(p.pos.x + Math.cos(a) * r, p.pos.y + (cavern ? 6 : 0), p.pos.z + Math.sin(a) * r);
      A.play?.(cavern ? 'iceGroan' : 'iceCrack', _v, { vol: cavern ? 0.45 : 0.5, rate: 0.8 + Math.random() * 0.4, range: 900 });
    }
    const ib = L.icebreaker;
    const thrumAt = ib && !ib.hulk ? ib.pos
      : (!ib && s >= 640 && !cavern && !L.flag('p:field') && !L.flag('p:finale')) ? _w.set(L.DATA.icebreaker.start.x, 4, L.DATA.icebreaker.start.z) : null;
    S.thrumT -= dt;
    if (S.thrumT <= 0) {
      S.thrumT = 4;
      if (thrumAt && !under) A.play?.('boom', thrumAt, { vol: 0.32, rate: 0.42, range: 2600 });
    }
  }
  // steam fog over the leads in the new sun
  if (L.steamFog && L.steamFog.some(h => h && h.alive === false)) { for (const h of L.steamFog) h?.stop?.(); L.steamFog = null; }
  if (!L.steamFog && L.flag('p:sunrise') && ctx.fx?.emitter) {
    L.steamFog = [];
    for (const line of L.DATA.floes.leads) for (const [x, z] of line) {
      _v.set(x, L.DATA.sea + 0.5, z);
      L.steamFog.push(ctx.fx.emitter('steam', _v.clone(), { rate: 0.3, scale: 2.6, color: [0.92, 0.9, 0.88] }));
    }
  }
}

function fxTick(L, dt) {
  if (!L.counters) return;
  const ctx = L.ctx, t = ctx.clock.time, p = ctx.player;
  L.tick.draw(dt, t); L.kite.draw(dt, t); L.cutter.draw(dt, t); L.flares.draw(dt, t); L.towedSled.draw(dt, t);
  // the ghost beat on the shared ghost-cab material (AD §4.5: instant on, 0.3 s decay, 60 a minute)
  const beat = ctx.materials?.uniforms?.uBeat?.value ?? t;
  const M = mats(ctx);
  const ph = ((beat % 1) + 1) % 1;
  M.ghost.emissiveIntensity = 0.6 + 7 * Math.exp(-ph * 7);
  // cables: the harpoon tow (skiff → Moth) and the raid's harpoon in the cutter
  const T = L.tow, R = L.raidTow;
  const from = T?.by?.alive ? T.by.pos : (R && L.raidSkiff?.alive ? L.raidSkiff.pos : null);
  if (from && p?.active) {
    _v.copy(from); _v.y += 1.6; p.center(_w);
    L.cable.visible = true; L.cable.position.copy(_v); L.cable.lookAt(_w); L.cable.scale.set(1, 1, _v.distanceTo(_w));
  } else L.cable.visible = false;
  if (L.godRay) { L.godRay.material.opacity = 0.12 + 0.05 * Math.sin(t * 1.3); if (L.flag('surfaced')) { L.godRay.parent?.remove(L.godRay); L.godRay = null; } }
  // glow anchors on structures that just realised (and runtime looks: the alcove seam, the stencil)
  L.glowT = (L.glowT ?? 0) - dt;
  if (L.glowT <= 0) { L.glowT = 0.25; updateGlows(L); }
}

/** the spoiler guard (A2 #6): no UI string names the frame before Kit does */
function lateTick(L, dt) {
  L.lateT = (L.lateT ?? 0) - dt;
  if (L.lateT > 0 || L.named) return;
  L.lateT = 0.5;
  const el = typeof document !== 'undefined' ? document.getElementById('frameName') : null;
  if (el && /moth/i.test(el.textContent || '')) L.ctx.hud?.setCallsign?.(null, null, L.frameTag || 'CANTOR 7');
}

// ════════════════════════════════════════════════════════════════════════════════════════ the Icebreaker hulk
function removeIcebreaker(L, u) {
  const ctx = L.ctx;
  if (!u) return;
  for (const t of u.turrets || []) if (t.alive || t.root?.parent) { try { ctx.enemies?.despawn?.(t); } catch (e) { /* ignore */ } }
  try { ctx.enemies?.despawn ? ctx.enemies.despawn(u) : u.despawn?.(); } catch (e) { ctx.recordError?.('level01', e); }
  if (L.icebreaker === u) L.icebreaker = null;
}
function findIcebreaker(L) {
  return L.icebreaker || (L.ctx.enemies?.alive?.({ kind: 'icebreaker' }) || [])[0] || (L.ctx.enemies?.all?.() || []).find(u => u.kind === 'icebreaker') || null;
}

// ════════════════════════════════════════════════════════════════════════════════════════ custom actions
function registerActions(L) {
  const ctx = L.ctx, m = L.mission, D = L.DATA;
  const reg = (name, fn) => m.registerAction(name, (a, mm, c) => fn(a || {}, mm, c));
  const waitSim = (sec) => { const d = simDeferred(); ctx.timers.after(Math.max(0, sec), () => d.resolve()); return d.promise; };

  // the cutter (L1 §12.1; A5.6: player.hidden, the cutter preset, haul.enabled = false)
  reg('cutter', (a) => {
    L.cutter.set(!!a.on);
    if (a.on) { L.setAbilities('cutter'); if (ctx.haul) ctx.haul.enabled = false; }
    else {
      if (ctx.haul) ctx.haul.enabled = true;
      ctx.hud?.setSlots?.({ R: { state: 'auto', label: null }, L: { state: 'auto', label: null }, S: { state: 'auto', label: null }, K: { state: 'auto', label: null } });
    }
  });
  reg('cutterFall', () => L.cutter.fall());
  reg('sledLoad', (a) => ctx.structures?.get?.('sled1')?.setState?.('loaded' + clamp(a.n | 0, 0, 3)));
  reg('abilities', (a) => L.setAbilities(a.preset || null, a.add));
  reg('hudPanels', (a) => {
    const o = {};
    if ('all' in a) for (const k of PANELS) o[k] = !!a.all;
    for (const k of PANELS) if (k in a) o[k] = !!a[k];
    L.setPanels(o);
    if ('vitals' in a) ctx.hud?.vitals?.({ mode: a.vitals ? 'live' : 'hidden' });
  });
  reg('hudSlots', (a) => ctx.hud?.setSlots?.(a));
  reg('vitals', (a) => ctx.hud?.vitals?.(a));
  // first-time explainer cards (terms.js): { call: 'term', args: { id } } or { ids: [...] }
  reg('term', (a) => L.terms.request(a.ids || a.id));
  reg('idleFacing', (a) => { if (ctx.player) ctx.player.idleFacing = a.yaw ?? null; });
  reg('callsign', (a) => L.setCallsign(a.name ?? 'JUNO', a.frame ?? 'CANTOR 7'));
  reg('renameSpeaker', (a) => {
    if (!a.id) return;
    ctx.comms?.defineSpeakers?.({ [a.id]: { name: a.name } });
    if (a.id === 'MOTH') L.named = true;
  });
  // Tick, the kite, Kit's flares
  reg('tick', (a) => L.tick.command(a));
  reg('kite', (a) => L.kite.command(a));
  reg('kitFlare', (a) => {
    if (a.road) { a.road.forEach((at, i) => ctx.timers.after(i * 0.35, () => L.flares.fire(at, { from: a.from }))); return; }
    if (a.at) L.flares.fire(a.at, { from: a.from, burst: !!a.burst });
  });
  reg('burnWrecks', (a) => {
    // Kit's flares into the fuel: the 'harvest' wrecks of the zone and the runtime skiff wrecks (L1 §3 beat 12)
    const targets = [];
    for (const inst of ctx.structures?.all?.() || []) if (inst.type === 'skiff_wreck' && inst.tag === 'harvest') targets.push(inst.pos.clone());
    for (const w of L.wrecks) targets.push(w.pos.clone());
    targets.forEach((at, i) => ctx.timers.after(0.5 + i * 0.6, () => {
      const f = L.flares.fire(at.clone().setY(at.y + 1), {});
      ctx.timers.after((f?.flight ?? 1.5) + 0.1, () => igniteAt(L, at, 120));
    }));
  });
  reg('skiffLights', () => {
    // the raid's sail lamps far out on the north ice, before the skiffs come in
    L.raidLights = [];
    for (let i = 0; i < 7; i++) {
      const at = L.resolve({ s: 140 + i * 28, l: -360 - (i % 3) * 30, h: 4 });
      const s = makeLampSprite(L, '#ffb04a', 5);
      s.position.copy(at); ctx.levelRoot.add(s); L.raidLights.push(s);
    }
    L.raidLightsT = 14;
  });
  reg('raidTowCutter', (a) => {
    const to = L.resolve(a.to || { s: 324 });
    const sk = (ctx.enemies?.alive?.({ tag: 'raid_s1' }) || [])[0] || (ctx.enemies?.alive?.({ tag: 'raid' }) || [])[0] || null;
    if (sk) { sk.script = 'towCutter'; sk.mode = 'script'; L.raidSkiff = sk; }
    L.raidTow = { to };
    ctx.audio?.play?.('harpoon', ctx.player?.pos);
    ctx.cameraRig?.addShake?.(0.5);
  });
  // sledges (A5.6: mission.addInteract)
  reg('flagSled', (a) => { if (a.id && !L.flag(a.id)) L.openSled(a.id); });
  // the alcove, the visor, the stencil
  reg('alcoveGlow', (a) => { L.alcoveGlow = !!a.on; const inst = ctx.structures?.get?.('alcove'); if (inst) applyStructureLooks(L, inst); });
  reg('visor', (a) => {
    L.visor?.remove?.(); L.visor = null;
    const p = ctx.player, head = p?.rig?.head;
    if (a.on && head && ctx.particles?.glows?.add) {
      L.visor = ctx.particles.glows.add(head, { color: '#7fe9ff', size: 0.9, intensity: 4, minPx: 2, pulse: 'none', offset: [0, 0.35, -0.9] });
      ctx.timers.after(9, () => { L.visor?.remove?.(); L.visor = null; });
    }
    ctx.audio?.play?.('confirm', null);
  });
  reg('stencilLight', (a) => {
    L.stencilOn = !!a.on; L.setFlag('l01:stencil', L.stencilOn);
    const inst = (ctx.structures?.all?.() || []).find(i => i.type === 'abeyance');
    if (inst) applyStructureLooks(L, inst);
  });
  reg('mothStops', (a) => {
    const p = ctx.player; if (!p) return;
    p.frozen = true;
    const inst = (ctx.structures?.all?.() || []).find(i => i.type === 'abeyance');
    const st = inst?.anchors?.stencil;
    if (st) p.autopilot = { face: yawTo(st.x - p.pos.x, st.z - p.pos.z), turnRate: 1.2 };
    ctx.timers.after(a.seconds ?? 2, () => { if (ctx.player) { ctx.player.frozen = false; ctx.player.autopilot = null; } });
  });
  // the Icebreaker
  reg('icebreaker', (a) => { const ib = findIcebreaker(L); if (ib && a.phase) ib.setPhase(a.phase); });
  reg('icebreakerSink', (a) => {
    const ib = findIcebreaker(L);
    if (!ib) return;
    if (!ib.hulk) ib.finale?.();
    if (a.instant) { removeIcebreaker(L, ib); return; }
    // a great slow tilt off the shelf edge, the green cab light going under last (L1 §7.3)
    const dir = new THREE.Vector3(1, 0, 0);
    L.sinking = { unit: ib, t: 0, from: ib.pos.clone(), dir };
    ctx.audio?.play?.('metalGroan', ib.pos);
    ctx.cameraRig?.addShake?.(0.3);
  });
  // the set piece (drown.js)
  reg('drown', (a) => {
    L.drown?.dispose?.();
    L.drown = new Drown(L, a);
    return L.drown.promise;
  });
  // the floe sprint
  reg('floes', (a) => {
    const F = L.floes; if (!F) return;
    if (a.reset) F.reset(true);
    if (a.start) { F.running = true; F.frozen = false; }
    if (a.freeze) F.frozen = true;
  });
  reg('sunClock', (a) => {
    if (a.start) { L.sunRunning = true; L.sprintT = 0; L.sunArtT = 0; L.sunElev = D.sunClock.from; L.dawnArt = true; }
    else L.sunRunning = false;
  });
  reg('hoverIcing', (a) => { if (ctx.player) ctx.player.hoverCostScale = a.scale ?? 2; });
  reg('gleanerHunt', (a) => {
    L.hunt = !!a.on; L.setFlag('l01:hunt', L.hunt);
    if (L.hunt) L.huntT = Math.min(L.huntT ?? 6, 6);
    if (a.scatter) for (const u of ctx.enemies?.alive?.({ kind: 'gleaner' }) || []) {
      if (u.latched) u.shake?.();
      u.blindT = Math.max(u.blindT || 0, 3); u.mode = 'leave';
    }
  });
  reg('skiffsLeave', () => { for (const u of ctx.enemies?.alive?.({ kind: 'skiff' }) || []) { u.mode = 'flee'; u.cancelTele?.(); } });
  // the shore
  reg('mothWalk', (a) => {
    const p = ctx.player; if (!p) return;
    const to = L.resolve(a.to), face = a.face ? L.resolve(a.face) : null;
    const d = simDeferred();
    let done = false;
    const finish = () => { if (done) return; done = true; off(); d.resolve(); };
    const off = ctx.events.on('player:autopilotDone', finish);
    p.autopilot = { to, face: face ? yawTo(face.x - to.x, face.z - to.z) : undefined, speed: a.speed ?? 5 };
    // a fallback when the autopilot isn't there (or is stuck): arrive after the walk's time plus a margin
    const secs = p.pos.distanceTo(to) / (a.speed ?? 5) + 4;
    ctx.timers.after(secs, () => {
      if (done) return;
      p.autopilot = null;
      p.teleport(to, face ? yawTo(face.x - to.x, face.z - to.z) : undefined);
      finish();
    });
    return d.promise;
  });
  reg('kneel', (a) => { if (ctx.player) ctx.player.animOverride = a.on ? { crouch: 1 } : null; });
  reg('turnNorth', (a) => {
    const p = ctx.player;
    if (p) p.autopilot = { face: 0, turnRate: 0.35 };
    return waitSim(a.seconds ?? 4);
  });
  reg('watchers', (a) => {
    if (a.leave) {
      for (const u of L.watchers || []) if (u.alive) { u.mode = 'leave'; }
      return;
    }
    const at = L.resolve(a.around || D.shore.hole);
    L.watchers = [];
    const n = a.count ?? 5, [d0, d1] = a.dist || [160, 220], [h0, h1] = a.h || [25, 40];
    for (let i = 0; i < n; i++) {
      const ang = (20 + (i / Math.max(1, n - 1)) * 70) * PI / 180;     // a loose arc to the north-east
      const r = d0 + ctx.random() * (d1 - d0);
      const x = at.x + Math.sin(ang) * r, z = at.z - Math.cos(ang) * r;
      const watchAt = new THREE.Vector3(x, L.groundAt(x, z) + h0 + ctx.random() * (h1 - h0), z);
      const u = ctx.enemies?.spawn?.('gleaner', watchAt.clone().add(_v.set(40, 15, -30)), { name: 'GLEANER', tags: ['watcher'], targetable: false, config: { mode: 'watch' } });
      if (u) { u.mode = 'watch'; u.watchAt = watchAt; u.targetable = false; L.watchers.push(u); }
    }
  });
  reg('holeBubbles', (a) => { L.holeBub = { t: -(a.delay ?? 0), at: L.resolve(D.shore.hole) }; });
  reg('musicBox', () => L.music(L.musicDefs.MUSICBOX));
  // the checkpoint lists' common part (L1 §9)
  reg('restoreCommon', (a) => restoreCommon(L, a.cp));
}

function makeLampSprite(L, color, size) {
  const G = L.ctx.particles?.glows;
  const o = new THREE.Object3D();
  const lens = new THREE.Mesh(ball(0.5, 6, 4), mats(L.ctx).amber); lens.castShadow = false; o.add(lens);
  if (G?.add) { const h = G.add(o, { color, size, intensity: 3, minPx: 2, pulse: 'flicker' }); o.userData.glowHandle = h; }
  o.addEventListener?.('removed', () => o.userData.glowHandle?.remove?.());
  return o;
}

/** the checkpoint-common part of every onCheckpoint list (L1 §9): structures, the frame tag, panels, vitals, facing */
function restoreCommon(L, cp) {
  const ctx = L.ctx, i = L.cpIndex(cp), p = ctx.player;
  const setState = (id, st) => { const inst = ctx.structures?.get?.(id); if (inst && inst.state !== st) inst.setState(st, { instant: true }); };
  if (i >= 1) {
    L.cutter.set(false);
    setState('snowBridge', 'collapsed'); setState('alcove', 'broken'); setState('sled1', 'towed');
    L.alcoveGlow = false;
    if (!L.flag('l01:callsign')) L.setCallsign('JUNO', 'CANTOR 7');
    else { const c = L.flag('l01:callsign'); L.setCallsign(c.name, c.frame); }
    ctx.hud?.setSlots?.({ R: { state: 'auto', label: null }, L: { state: 'auto', label: null }, S: { state: 'auto', label: null }, K: { state: 'auto', label: null } });
    if (p) p.idleFacing = 0;
    // panels: the snapshot's (flag l01:panels, restored at level:start), else what this checkpoint implies
    if (!L.flag('l01:panels')) {
      const pan = { ap: true, compass: true, objectives: true, en: i >= 2, weapons: i >= 3, radar: i >= 3, lock: i >= 3, rack: i >= 3 && (ctx.haul?.rack?.length ?? 0) > 0 };
      L.setPanels(pan);
    }
    // AP, the compass and the objectives are never hidden once the frame is awake (a snapshot can't turn them off)
    L.setPanels({ ap: true, compass: true, objectives: true });
    if ((ctx.haul?.rack?.length ?? 0) > 0) L.setPanels({ rack: true });
    // vitals: Juno's heart until the drowning (cp_floes sets locked itself)
    if (i < 6) ctx.hud?.vitals?.({ mode: 'live', ...(i === 1 ? { spike: 96, decay: 40 } : {}) });
  }
  if (i >= 6) { L.setFlag('p:sunrise', true); L.dawnArt = true; }
}

// ════════════════════════════════════════════════════════════════════════════════════════ custom conditions
function registerConditions(L) {
  const ctx = L.ctx, m = L.mission;
  const reg = (name, fn) => m.registerCondition(name, (a, mm, c) => { try { return !!fn(a || {}); } catch (e) { ctx.recordError?.('level01', e); return false; } });
  const C = () => L.counters || {};
  const P = () => L.player();
  reg('lookingAt', (a) => { L.lookDeg = a.deg ?? 8; return L.lookT >= (a.hold ?? 0.5); });
  reg('playerHit', () => C().playerHits > 0);
  reg('aboveY', (a) => {
    const p = P(); if (!p || p.pos.y < a.y) return false;
    if (!a.near) return true;
    const c = L.resolve(a.near, _c);
    return Math.hypot(p.pos.x - c.x, p.pos.z - c.z) <= (a.r ?? 40);
  });
  reg('onSurface', (a) => {
    const p = P(); if (!p || !p.onGround || p.pos.y < (a.y ?? -4)) return false;
    if (!a.near) return true;
    const c = L.resolve(a.near, _c);
    return Math.hypot(p.pos.x - c.x, p.pos.z - c.z) <= (a.r ?? 60);
  });
  reg('nearAnchor', (a) => {
    const p = P(); if (!p) return false;
    const inst = ctx.structures?.get?.(a.id) || (ctx.structures?.all?.() || []).find(i => i.type === a.id);
    const at = inst?.anchors?.[a.anchor];
    if (!at) return false;
    return p.center(_c).distanceTo(at) <= (a.r ?? 20);
  });
  reg('commsLine', (a) => L.heard.has(a.text));
  reg('idleNorthReached', () => !!ctx.player?.idleFacingReached);
  reg('enemyWithin', (a) => {
    const p = P(); if (!p) return false;
    const r2 = (a.r ?? 100) ** 2;
    for (const u of ctx.enemies?.alive?.(a.kind ? { kind: a.kind } : {}) || []) {
      if (u.team !== 'enemy' || u.targetable === false && !a.kind) continue;
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  });
  reg('harpoonTelegraph', () => C().harpoonTele > 0);
  reg('anyStaggered', () => C().staggered > 0);
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
  reg('waveStarted', (a) => L.waves.has(a.encounter + ':' + a.wave) || (m.encounterState?.(a.encounter)?.wave ?? 0) >= (a.wave ?? 1) + 0);
  reg('bladeKill', () => C().bladeKills > 0);
  reg('tickAt', (a) => {
    if (!L.tick.visible) return false;
    const c = L.resolve({ s: a.s, l: a.l ?? 0 }, _c);
    return Math.hypot(L.tick.pos.x - c.x, L.tick.pos.z - c.z) <= (a.r ?? 12);
  });
  reg('carrierFlared', () => C().carrierFlared > 0);
  reg('onGround', () => !!P()?.onGround);
  reg('hullHit', () => C().hullHit > 0);
  reg('inFloodlight', () => C().inFlood > 0);
  reg('sawSweep', () => C().sawSweep > 0);
  reg('collarHitFromAbove', () => C().collarAbove > 0);
  reg('touchedGold', () => C().touchedGold > 0);
  reg('sprintTime', (a) => L.sunRunning && L.sprintT >= (a.gte ?? 0));
  reg('skiffRun', () => C().skiffRun > 0);
  reg('unitAlive', (a) => (ctx.enemies?.count?.({ tag: a.tag }) ?? 0) > 0);
}
