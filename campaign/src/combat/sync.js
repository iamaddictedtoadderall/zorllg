// combat/sync.js (P4, addendum 02 E1): ctx.sync. The Sync meter and the partner moves (bible §7.6): Second Sight,
// Moth Drives and Hold. Installed from combat/combat.js install() (main.js is frozen, B0 rule 2); reached elsewhere
// only as ctx.sync (feature-detected by levels: `typeof ctx.sync?.unlock === 'function'`).
//
//  · Meter: `capacity` segments = floor(Σ fragment value) over F01..F12 plus every Made fragment in campaign state
//    (intact 1, retold 0.5, overwritten 0; a missing old fragment counts as intact). 12 without campaign state (B2 #8).
//  · Filling: +amount/1500 per player damage dealt (target:damaged with a 'player' source), +1 per player:perfectDodge,
//    +2 per haul:tear. Never drains; clamped to capacity; `sync:filled` each time a whole segment is crossed.
//  · Second Sight (3, 6 sim s): timeScale 0.7 (B0 rule 6), predicted paths of hostile projectiles within 250 m (64 paths
//    × 12 segments, additive, fading along the path; drawn as camera-facing ribbons in one mesh, because WebGL lines are
//    1 px wide), red glows on targets winding up (Target.windup > 0).
//  · Moth Drives (4, 8 s): ctx.player.drive = { until } (the player steers, E3). V cancels it.
//  · Hold (6, automatic): fired from combat.damage on a hit that would take the player to 0 AP: AP stays at 1,
//    invulnT 2, HUD flash (the HUD listens to sync:hold), 'syncHold'. The engine never speaks for Hold (B2 #3).
//  · Checkpoints: mission flags sync:on / sync:unlocked / sync:fill. A fresh level:start reads campaign state
//    (st.sync.unlocked), a restart the flags.
// Gameplay state uses sim time only (B0 rule 7). The path lines and flashes are cosmetic.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { isHostile } from './combat.js';

const COSTS = Object.freeze({ sight: 3, drive: 4, hold: 6 });
const DURATIONS = Object.freeze({ sight: 6, drive: 8 });
const MOVES = ['sight', 'drive', 'hold'];
const SIGHT_SCALE = 0.7;
const OLD_FRAGMENTS = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F12'];
const PATHS = 64, SEGS = 12, HORIZON = 1.5, PATH_RANGE = 250;
const PATH_COLOR = new THREE.Color('#ff6a3a');
const _w = new THREE.Vector3(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _cur = new THREE.Vector3();

/** B2 #8: a fragment's value toward the meter */
export function fragmentValue(state) {
  if (state == null || state === 'intact') return 1;
  if (state === 'overwritten') return 0;
  if (typeof state === 'string' && state.startsWith('retold')) return 0.5;
  return 1;
}
/** B2 #8: floor(Σ value) over the twelve old fragments plus every other (Made) fragment present in the state */
export function syncCapacity(st) {
  if (!st || typeof st !== 'object') return 12;
  const fr = st.fragments && typeof st.fragments === 'object' ? st.fragments : {};
  let sum = 0;
  for (const id of OLD_FRAGMENTS) sum += fragmentValue(fr[id]);
  for (const [id, v] of Object.entries(fr)) if (!OLD_FRAGMENTS.includes(id)) sum += fragmentValue(v);
  return Math.floor(sum + 1e-6);
}

export function installSync(ctx) {
  let enabled = false, fill = 0, capacity = 12, active = null;
  const unlocked = new Set();
  let sightPrev = 1, sightSet = false;     // the time scale Second Sight found, and whether it set its own
  let flagT = 0, dirty = false;
  const flashes = new Map();               // target → glow handle
  let pathsDrawn = 0;

  // ---------------------------------------------------------------- path lines (one mesh of camera-facing ribbons)
  const nQ = PATHS * SEGS, nV = nQ * 4;
  const posA = new Float32Array(nV * 3), colA = new Float32Array(nV * 3);
  const idx = new Uint16Array(nQ * 6);
  for (let q = 0; q < nQ; q++) { const v = q * 4, i = q * 6; idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v + 2; idx[i + 4] = v + 1; idx[i + 5] = v + 3; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  geo.userData.shared = true;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
                                            fog: false, toneMapped: false, side: THREE.DoubleSide });
  mat.userData.shared = true;
  const lines = new THREE.Mesh(geo, mat);
  lines.name = 'sync:paths'; lines.frustumCulled = false; lines.visible = false; lines.renderOrder = 6;
  lines.userData.persistent = true;
  ctx.scene.add(lines);

  const player = () => ctx.player;
  const mission = () => ctx.mission;
  function campaignState() {
    if (!mission()?.def?.campaign) return null;
    const s = ctx.save?.getFlag?.('campaign');
    return s && typeof s === 'object' ? s : null;
  }
  function writeFlags(force) {
    const m = mission();
    if (!m?.setFlag || !m.def) return;
    if (!force && !dirty) return;
    dirty = false; flagT = 0;
    m.setFlag('sync:on', enabled);
    m.setFlag('sync:unlocked', [...unlocked]);
    m.setFlag('sync:fill', Math.round(fill * 1000) / 1000);
  }
  const touch = () => { dirty = true; };
  const sfx = (n) => ctx.audio?.play?.(n, null);

  function addFill(n, reason) {
    if (!enabled || !(n > 0)) return;
    const before = fill;
    fill = clamp(fill + n, 0, capacity);
    if (fill === before) return;
    touch();
    const a = Math.floor(before + 1e-9), b = Math.floor(fill + 1e-9);
    if (b > a) ctx.events.emit('sync:filled', { fill, segments: b, reason: reason || 'script' });
  }

  // ---------------------------------------------------------------- moves
  function canStart(move) {
    const p = player();
    if (!enabled || !unlocked.has(move) || active) return false;
    if (!p?.active || !p.alive || p.frozen) return false;
    return move === 'sight' || move === 'drive';
  }
  function start(move, free) {
    const p = player();
    if (move === 'sight') {
      p?.endSlowMo?.();   // a blade-hit slow motion must not be what we restore afterwards
      sightPrev = ctx.timeScale; ctx.timeScale = SIGHT_SCALE; sightSet = true;
      active = { move, t: DURATIONS.sight, dur: DURATIONS.sight, free: !!free };
      sfx('syncSight');
    } else {
      p.drive = { until: ctx.clock.time + DURATIONS.drive };
      active = { move, t: DURATIONS.drive, dur: DURATIONS.drive, free: !!free };
      sfx('syncDrive');
    }
    writeFlags(true);
    ctx.events.emit('sync:move', { move, free: !!free });
  }
  function end(silent) {
    const a = active;
    if (!a) return;
    active = null;
    if (a.move === 'sight') {
      if (sightSet && ctx.timeScale === SIGHT_SCALE) ctx.timeScale = sightPrev;
      sightSet = false;
      clearVisuals();
      if (!silent) sfx('syncSight');
    } else {
      const p = player();
      if (p && p.drive) p.drive = null;
    }
    if (!silent) ctx.events.emit('sync:end', { move: a.move });
  }
  function clearVisuals() {
    for (const h of flashes.values()) h?.remove?.();
    flashes.clear();
    lines.visible = false; geo.setDrawRange(0, 0); pathsDrawn = 0;
  }
  function resetRun() {
    end(true);
    if (sightSet && ctx.timeScale === SIGHT_SCALE) ctx.timeScale = sightPrev;
    sightSet = false;
    clearVisuals();
    const p = player();
    if (p) p.drive = null;
  }

  // ---------------------------------------------------------------- Second Sight visuals
  function updatePaths() {
    const p = player();
    if (!p?.active) { lines.visible = false; return; }
    const P = ctx.projectiles, col = ctx.collision;
    let n = 0, vi = 0;
    const r2 = PATH_RANGE * PATH_RANGE, step = HORIZON / SEGS;
    const cam = ctx.camera.position;
    const quad = (x0, y0, z0, x1, y1, z1, a0, a1) => {
      // a camera-facing ribbon: half width grows with distance so a far path still reads (≈ 1.5–2 px)
      const mx = (x0 + x1) / 2 - cam.x, my = (y0 + y1) / 2 - cam.y, mz = (z0 + z1) / 2 - cam.z;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-6) return;
      const hw = clamp(Math.hypot(mx, my, mz) * 0.0022, 0.1, 0.7) / sl;
      sx *= hw; sy *= hw; sz *= hw;
      const o = vi * 3, k = 1.6;
      posA[o] = x0 - sx; posA[o + 1] = y0 - sy; posA[o + 2] = z0 - sz;
      posA[o + 3] = x0 + sx; posA[o + 4] = y0 + sy; posA[o + 5] = z0 + sz;
      posA[o + 6] = x1 - sx; posA[o + 7] = y1 - sy; posA[o + 8] = z1 - sz;
      posA[o + 9] = x1 + sx; posA[o + 10] = y1 + sy; posA[o + 11] = z1 + sz;
      for (let j = 0; j < 4; j++) {
        const a = (j < 2 ? a0 : a1) * k, c = o + j * 3;
        colA[c] = PATH_COLOR.r * a; colA[c + 1] = PATH_COLOR.g * a; colA[c + 2] = PATH_COLOR.b * a;
      }
      vi += 4;
    };
    P?.forEach?.((pr) => {
      if (n >= PATHS || !isHostile(pr.team, 'player') || pr.pos.distanceToSquared(p.pos) > r2) return;
      _p.copy(pr.pos); _v.copy(pr.vel);
      const tg = pr.target && pr.turn > 0 && pr.target.alive ? pr.target : null;
      for (let s = 0; s < SEGS; s++) {
        const x0 = _p.x, y0 = _p.y, z0 = _p.z;
        if (tg) {   // a homing projectile bends toward its target at its turn rate
          const c = tg.center ? tg.center(_c) : _c.copy(tg.pos);
          _w.copy(c).sub(_p);
          const wl = _w.length(), sp = _v.length();
          if (wl > 1e-3 && sp > 1e-3) {
            _w.multiplyScalar(1 / wl); _cur.copy(_v).multiplyScalar(1 / sp);
            const ang = _cur.angleTo(_w), maxA = pr.turn * step;
            if (ang > 1e-4) _cur.lerp(_w, Math.min(1, maxA / ang)).normalize();
            const ns = pr.maxSpeed > 0 ? Math.min(pr.maxSpeed, sp + (pr.accel || 0) * step) : sp + (pr.accel || 0) * step;
            _v.copy(_cur).multiplyScalar(ns);
          }
        }
        if (pr.gravity) _v.y -= pr.gravity * step;
        _p.addScaledVector(_v, step);
        quad(x0, y0, z0, _p.x, _p.y, _p.z, 1 - s / SEGS, 1 - (s + 1) / SEGS);
        const g = col?.groundHeight ? col.groundHeight(_p.x, _p.z) : -Infinity;
        if (_p.y < g) break;   // the path ends where it meets the ground
      }
      n++;
    });
    pathsDrawn = n;
    geo.setDrawRange(0, (vi / 4) * 6);
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    lines.visible = vi > 0;
  }
  function updateFlashes() {
    const list = ctx.combat?.targets || [];
    const glows = ctx.particles?.glows;
    for (const t of list) {
      const on = t.alive && (t.windup || 0) > 0 && isHostile(t.team, 'player');
      const h = flashes.get(t);
      if (on && !h && glows?.add) {
        const root = t.root || t.rig?.root;
        if (!root) continue;
        flashes.set(t, glows.add(root, { color: '#ff3b1f', size: Math.max(2, (t.hitR || 2.5) * 0.8), pulse: 'flicker', intensity: 3,
                                         offset: [0, t.hitY || (t.hitR || 2.5), 0] }));
      } else if (!on && h) { h.remove?.(); flashes.delete(t); }
    }
    for (const [t, h] of flashes) if (!list.includes(t) || !t.alive) { h?.remove?.(); flashes.delete(t); }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    const p = player();
    // inputs (E1): only while enabled and playing
    if (enabled && (ctx.flow?.state ?? 'playing') === 'playing' && ctx.input) {
      if (ctx.input.pressed('sight')) api.use('sight');
      if (ctx.input.pressed('drive')) { if (active?.move === 'drive') api.cancel(); else api.use('drive'); }
    }
    if (active) {
      if (active.move === 'sight') {
        active.t = Math.max(0, active.t - dt);
        if (active.t <= 0 || !p?.active || !p.alive) end();
      } else {
        const d = p?.drive;
        active.t = d ? Math.max(0, d.until - ctx.clock.time) : 0;
        if (!d || active.t <= 0 || !p.alive || p.frozen) { if (d) p.drive = null; end(); }
      }
    }
    if (active?.move === 'sight') { updatePaths(); updateFlashes(); }
    flagT += dt;
    if (dirty && flagT >= 0.5) writeFlags(false);
  }

  const api = {
    get enabled() { return enabled; },
    set enabled(v) { api.enable(!!v); },
    get capacity() { return capacity; },
    get fill() { return fill; },
    get unlocked() { return unlocked; },
    costs: COSTS,
    durations: DURATIONS,
    get active() { return active ? { ...active } : null; },
    get holdReady() { return enabled && unlocked.has('hold') && capacity >= COSTS.hold && fill >= COSTS.hold; },
    /** extra (tests): the paths drawn last frame and the live wind-up flashes */
    get paths() { return pathsDrawn; },
    get flashes() { return flashes.size; },
    enable(on = true) {
      const was = enabled;
      enabled = !!on;
      if (!enabled && active) end();
      if (was !== enabled) { touch(); writeFlags(true); }
    },
    unlock(...moves) {
      for (const m of moves.flat()) if (MOVES.includes(m)) unlocked.add(m);
      enabled = true;
      touch(); writeFlags(true);
    },
    lock(...moves) {
      for (const m of moves.flat()) unlocked.delete(m);
      if (active && !unlocked.has(active.move)) end();
      touch(); writeFlags(true);
    },
    add(n, reason = 'script') { addFill(Number(n) || 0, reason); },
    setFill(n) { fill = clamp(Number(n) || 0, 0, capacity); touch(); },
    atLeast(n) { api.setFill(Math.max(fill, Math.min(Number(n) || 0, capacity))); },
    use(move) {
      if (!canStart(move) || fill < COSTS[move]) return false;
      fill -= COSTS[move]; touch();
      start(move, false);
      return true;
    },
    free(move) {
      if (!canStart(move)) return false;
      start(move, true);
      return true;
    },
    cancel() { if (active) end(); },
    /** re-read the fragment states (the Bench calls it after an overwrite, with its working copy) */
    refreshCapacity(st) {
      capacity = syncCapacity(st !== undefined ? st : campaignState());
      if (fill > capacity) { fill = capacity; touch(); }
      return capacity;
    },
    /** combat.damage's Hold hook (E4): spends the cost, 2 s of invulnerability, the flash and the sound. No comms. */
    _fireHold(source) {
      fill = Math.max(0, fill - COSTS.hold); touch();
      const p = player();
      if (p) p.invulnT = 2;
      sfx('syncHold');
      writeFlags(true);
      ctx.events.emit('sync:hold', { source: source || null });
    },
    update,
  };

  // ---------------------------------------------------------------- filling
  ctx.events.on('target:damaged', (e) => {
    if (!enabled || !e || e.blocked || !(e.amount > 0)) return;
    if (e.source?.team !== 'player' || e.target === player()) return;
    addFill(e.amount / 1500, 'damage');
  });
  ctx.events.on('player:perfectDodge', () => addFill(1, 'dodge'));
  ctx.events.on('haul:tear', () => addFill(2, 'tear'));

  // ---------------------------------------------------------------- checkpoints
  ctx.events.on('level:start', ({ fresh } = {}) => {
    resetRun();
    const f = mission()?.flags || {};
    const st = campaignState();
    capacity = syncCapacity(st);
    unlocked.clear();
    if (!fresh && 'sync:on' in f) {
      enabled = !!f['sync:on'];
      for (const m of Array.isArray(f['sync:unlocked']) ? f['sync:unlocked'] : []) if (MOVES.includes(m)) unlocked.add(m);
      fill = clamp(Number(f['sync:fill']) || 0, 0, capacity);
    } else {
      const list = Array.isArray(st?.sync?.unlocked) ? st.sync.unlocked.filter(m => MOVES.includes(m)) : [];
      enabled = list.length > 0;
      for (const m of list) unlocked.add(m);
      fill = 0;
    }
    dirty = false; flagT = 0;
    if (enabled) writeFlags(true);
  });
  ctx.events.on('level:cleared', () => { resetRun(); enabled = false; unlocked.clear(); fill = 0; capacity = 12; dirty = false; });
  ctx.events.on('player:died', () => { if (active) end(); });

  // before the player (it reads player.drive this frame), after the haul (order -5)
  ctx.addSystem({ name: 'sync', phase: 'player', when: 'sim', order: -8, update: (dt) => update(dt) });
  ctx.sync = api;
  return api;
}
