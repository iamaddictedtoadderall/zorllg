// combat/haul.js (P4, addendum A5.1): ctx.haul. TEAR and the 3-slot haul rack.
// Installed from combat/combat.js install() (main.js is frozen). Reached elsewhere only as ctx.haul (A0 rule 2).
//
//  · Glints: every live target with an untaken `haul` shows an amber glint within 300 m (particles.glows when P1's API
//    exists, otherwise a tiny additive diamond on the target's root as a stand-in).
//  · TEAR: while a staggered haul target is within 30 m with line of sight (`candidate`), BLADE doesn't lunge; holding it
//    0.4 s starts the 1.2 s rip (player invulnerable, a lunge of up to 30 m at 60 m/s, FOV punch, sparks, shake).
//    Light targets die (DamageSource.kind 'tear'); heavies lose the part (`haul.taken`, `onTaken()`).
//  · Rack: 3 parts, oldest first. A full rack opens hud.choice at timeScale 0.3; the dropped or declined part is lost.
//  · State: mission flags 'haul:rack' / 'haul:tears' (checkpoints carry them); restored on level:start.
//  · Caches: a `pickup` with `haul: true` racks its `unlocks`.
// The player module reads `blocksBlade` (swallow the L weapon) and `ctx.player.rip` (movement and pose during the rip).
import * as THREE from 'three';
import { clamp, simDeferred, whenSettled } from '../core/util.js';
import { PARTS } from './loadout.js';
import { isHostile } from './combat.js';

const HOLD = 0.4, RIP_DUR = 1.2, RIP_AT = 0.72, RANGE = 30, GLINT_RANGE = 300, CHOICE_SCALE = 0.3;
const GLINT_COLOR = '#ffbf4a';
const _pc = new THREE.Vector3(), _tc = new THREE.Vector3(), _v = new THREE.Vector3();

export function installHaul(ctx) {
  let rack = [], tears = 0, candidate = null, hold = 0, holdTarget = null, rip = null;
  let choosing = false, prevScale = 1;
  const queue = [];
  const glints = new Map();   // target → { handle?, mesh?, phase }
  let glintGeo = null, glintMat = null;

  const name = (id) => PARTS[id]?.name || id;
  const writeFlags = () => {
    const m = ctx.mission;
    if (!m?.setFlag) return;
    m.setFlag('haul:rack', rack.slice());
    m.setFlag('haul:tears', tears);
  };
  const sfx = (n, at, alt) => {
    const A = ctx.audio; if (!A?.play) return;
    A.play(n, at);   // unknown names warn once and are no-ops (A0 rule 4)
    if (alt) A.play(alt, at);
  };

  // ---------------------------------------------------------------- glints
  function glintPoint(t) {
    const g = t.haul?.glint;
    return Array.isArray(g) ? g : [0, t.hitR || 2, 0];
  }
  function addGlint(t) {
    const root = t.root || t.rig?.root || null;
    if (!root) return null;
    const rec = { handle: null, mesh: null, root, phase: (t.id || 0) * 1.7 };
    const off = glintPoint(t);
    const glows = ctx.particles?.glows;
    if (glows?.add) {
      rec.handle = glows.add(root, { color: GLINT_COLOR, size: 0.9, pulse: 'sparkle', offset: off, minPx: 3 });
    } else {
      // stand-in until particles.glows lands (A0 rule 7: trivial): an additive diamond on the part
      if (!glintGeo) {
        glintGeo = new THREE.OctahedronGeometry(0.45, 0); glintGeo.scale(1, 1.6, 1); glintGeo.userData.shared = true;
        glintMat = new THREE.MeshBasicMaterial({ color: GLINT_COLOR, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
                                                 depthWrite: false, fog: false });
        glintMat.userData.shared = true;
      }
      const m = new THREE.Mesh(glintGeo, glintMat);
      m.name = 'haulGlint'; m.position.set(off[0], off[1], off[2]); m.renderOrder = 5;
      m.frustumCulled = false;
      root.add(m);
      rec.mesh = m;
    }
    glints.set(t, rec);
    return rec;
  }
  function removeGlint(t) {
    const rec = glints.get(t);
    if (!rec) return;
    rec.handle?.remove?.();
    if (rec.mesh) rec.mesh.parent?.remove(rec.mesh);
    glints.delete(t);
  }
  function updateGlints(dt) {
    const pl = ctx.player, list = ctx.combat?.targets;
    if (!list) return;
    for (const t of list) {
      if (!t.haul || t.haul.taken || !t.alive) continue;
      if (!glints.has(t)) addGlint(t);
    }
    for (const [t, rec] of glints) {
      if (!t.alive || !t.haul || t.haul.taken || !list.includes(t) || (t.root && t.root !== rec.root)) { removeGlint(t); continue; }
      const d = pl?.active ? t.pos.distanceTo(pl.pos) : 0;
      const vis = d <= GLINT_RANGE;
      if (rec.handle?.set) rec.handle.set({ visible: vis });
      if (rec.mesh) {
        rec.mesh.visible = vis;
        rec.phase += dt;
        // a slow sparkle (0.7 Hz) that never shrinks below a few pixels at range
        const tw = 0.75 + 0.35 * Math.max(0, Math.sin(rec.phase * 0.7 * Math.PI * 2));
        rec.mesh.scale.setScalar(tw * Math.max(1, d / 110));
        rec.mesh.rotation.y += dt * 1.5;
      }
    }
  }

  // ---------------------------------------------------------------- candidate and TEAR
  function findCandidate() {
    const p = ctx.player, list = ctx.combat?.targets;
    if (!p?.active || !p.alive || !list) return null;
    p.center(_pc);
    let best = null, bd = RANGE * RANGE;
    for (const t of list) {
      if (!t.alive || !t.haul || t.haul.taken || !(t.stagT > 0) || !isHostile('player', t.team)) continue;
      const d = t.center(_tc).distanceToSquared(_pc);
      if (d > bd) continue;
      if (ctx.collision?.lineOfSight && !ctx.collision.lineOfSight(_pc, _tc)) continue;
      bd = d; best = t;
    }
    return best;
  }

  function startRip(t) {
    const p = ctx.player;
    hold = 0; holdTarget = null;
    rip = { target: t, part: t.haul.part, t: 0, dur: RIP_DUR, ripped: false, prevInvuln: !!p.invuln,
            start: p.pos.clone(), travelled: 0, k: 0 };
    p.rip = rip;
    p.invuln = true;
    p.lunge = null;
    const rig = ctx.cameraRig;
    if (rig?.setFov) { rip.baseFov = rig.baseFov ?? ctx.camera.fov; rig.setFov(rip.baseFov - 8, 0.15); }
    sfx('servo', p.center(_pc));
    ctx.events.emit('haul:tearStart', { target: t, part: rip.part });
  }

  function doRip() {
    const p = ctx.player, t = rip.target;
    rip.ripped = true;
    if (!t || !t.alive || !t.haul || t.haul.taken) return;   // lost it (killed by someone else mid-rip)
    const part = t.haul.part;
    const heavy = t.haul.heavy ?? ((t.impMax ?? 0) > 1000);
    const c = t.center(_tc).clone();
    ctx.fx?.sparks?.(c, 46, [1, 0.78, 0.35], 42);
    ctx.fx?.sparks?.(c, 18, [0.75, 0.9, 1], 24);
    ctx.fx?.impact?.(c, null, 'blade', 'metal');
    ctx.particles?.lights?.flash?.(c, 0xffc070, 900, 30, 0.25);
    sfx('tear', c);
    ctx.cameraRig?.addShake?.(0.6);
    removeGlint(t);
    let destroyed = false;
    if (!heavy) {
      destroyed = true;
      t.haul.taken = true;
      ctx.combat.kill(t, { team: 'player', owner: p, kind: 'tear', pos: p.pos.clone() });
    } else {
      t.haul.taken = true;
      try { t.haul.onTaken?.(); } finally { /* keep going */ }
    }
    tears++;
    writeFlags();
    ctx.events.emit('haul:tear', { target: t, part, destroyed });
    api.add(part, { source: 'tear' });
  }

  function endRip() {
    const p = ctx.player;
    if (!rip) return;
    if (p) { p.invuln = rip.prevInvuln; if (p.rip === rip) p.rip = null; }
    const rig = ctx.cameraRig;
    if (rig?.setFov && rip.baseFov) rig.setFov(rig.baseFov ?? rip.baseFov, 0.3);
    rip = null;
  }

  function cancelRip() {
    if (!rip) return;
    const p = ctx.player;
    if (p) { p.invuln = rip.prevInvuln; if (p.rip === rip) p.rip = null; }
    rip = null;
  }

  function update(dt) {
    updateGlints(dt);
    const p = ctx.player;
    if (!p?.active || !p.alive) { candidate = null; hold = 0; if (rip) cancelRip(); return; }
    if (rip) {
      rip.t += dt;
      rip.k = clamp(rip.t / rip.dur, 0, 1);
      if (!rip.ripped && rip.t >= RIP_AT) doRip();
      if (rip && rip.t >= rip.dur) endRip();
      candidate = null; hold = 0;
      return;
    }
    const ab = p.abilities;
    const allowed = api.enabled && (!ab || ab.tear !== false);
    candidate = allowed ? findCandidate() : null;
    if (candidate && !p.frozen && ctx.input?.down?.('blade')) {
      if (holdTarget !== candidate) { hold = 0; holdTarget = candidate; }
      hold += dt;
      if (hold >= HOLD) startRip(candidate);
    } else { hold = 0; holdTarget = null; }
  }

  // ---------------------------------------------------------------- rack
  let pendingD = null;
  /** close an open rack choice without racking (level stop/restart); a late answer from the HUD is ignored */
  function abortChoice() {
    if (choosing) {
      choosing = false;
      if (ctx.timeScale === CHOICE_SCALE) ctx.timeScale = prevScale;
      pendingD?.resolve(false);
    }
    pendingD = null;
    for (const q of queue.splice(0)) q.d.resolve(false);
  }
  function finishAdd(part, d, key) {
    const i = typeof key === 'string' && key.startsWith('drop') ? Number(key.slice(4)) : -1;
    if (i >= 0 && i < rack.length) {
      const dropped = rack[i];
      rack.splice(i, 1); rack.push(part);
      writeFlags();
      ctx.events.emit('haul:racked', { part, rack: rack.slice(), dropped });
      ctx.hud?.hint?.('Dropped.', 3);
      d.resolve(true);
    } else {
      ctx.events.emit('haul:left', { part });
      ctx.hud?.hint?.('Dropped.', 3);
      d.resolve(false);
    }
  }
  function next() {
    if (choosing || !queue.length) return;
    const { part, d } = queue.shift();
    tryAdd(part, d);
  }
  function tryAdd(part, d) {
    if (rack.length < api.capacity) {
      rack.push(part);
      writeFlags();
      ctx.events.emit('haul:racked', { part, rack: rack.slice(), dropped: null });
      sfx('pickup', null);
      d.resolve(true);
      next();
      return;
    }
    // full rack: the swap choice, with time slowed (no pause)
    choosing = true; pendingD = d;
    ctx.player?.endSlowMo?.();   // a blade-hit slow motion must not be what we restore afterwards
    prevScale = ctx.timeScale;
    ctx.timeScale = CHOICE_SCALE;
    const options = rack.map((id, i) => ({ key: 'drop' + i, label: 'Drop ' + name(id) }));
    options.push({ key: 'leave', label: 'Leave it' });
    let pr = null;
    try { pr = ctx.hud?.choice?.({ title: 'RACK FULL. Drop which part?', options, seconds: 8, default: 'leave' }); }
    catch (e) { pr = null; ctx.recordError?.('haul', e); }
    const done = (key) => {
      if (!choosing || pendingD !== d) return;   // aborted meanwhile
      choosing = false; pendingD = null;
      if (ctx.timeScale === CHOICE_SCALE) ctx.timeScale = prevScale;
      finishAdd(part, d, key);
      next();
    };
    whenSettled(pr ?? null, done, () => done(null));
  }

  const api = {
    capacity: 3,
    enabled: true,
    get rack() { return rack; },
    get tears() { return tears; },
    get candidate() { return candidate; },
    get holdProgress() { return rip ? 1 : clamp(hold / HOLD, 0, 1); },
    get busy() { return !!rip; },
    /** extra: the player swallows the L weapon while this is true (A5.1 TEAR) */
    get blocksBlade() {
      const p = ctx.player;
      return !!rip || (!!candidate && api.enabled && p?.abilities?.tear !== false && !p?.frozen);
    },
    /** extra: true while the rack-full choice is open */
    get choosing() { return choosing; },
    isHaulPart(id) { return !!PARTS[id]?.haul; },
    add(part, o = {}) {
      const d = simDeferred();
      if (!part || typeof part !== 'string') { d.resolve(false); return d.promise; }
      if (choosing || queue.length) { queue.push({ part, d, o }); return d.promise; }
      tryAdd(part, d);
      return d.promise;
    },
    set(r, t = 0) {
      rack = Array.isArray(r) ? r.filter(x => typeof x === 'string').slice(0, api.capacity) : [];
      tears = Number(t) || 0;
    },
    clear() {
      rack = []; tears = 0; candidate = null; hold = 0; holdTarget = null;
      cancelRip();
      abortChoice();
      for (const t of [...glints.keys()]) removeGlint(t);
    },
    update,
  };

  ctx.events.on('level:start', ({ fresh }) => {
    if (fresh) { api.clear(); return; }
    const f = ctx.mission?.flags || {};
    cancelRip(); abortChoice();
    api.set(f['haul:rack'] ?? [], f['haul:tears'] ?? 0);
  });
  ctx.events.on('level:cleared', () => api.clear());
  ctx.events.on('player:spawned', () => cancelRip());
  ctx.events.on('pickup', (e) => { if (e?.haul && e.unlocks) api.add(e.unlocks, { source: 'cache' }); });

  ctx.addSystem({ name: 'haul', phase: 'player', when: 'sim', order: -5, update: (dt) => api.update(dt) });
  ctx.haul = api;
  return api;
}
