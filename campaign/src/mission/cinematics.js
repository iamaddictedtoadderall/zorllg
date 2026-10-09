// mission/cinematics.js (P5): in-engine camera shots (§6.11), flybys and barrages.
//
//  · play(shot): Catmull-Rom through the keys' positions and look points (Pos, resolved once at the start; with
//    `follow: { tag }` the look points are offsets from the first live target with that tag), per-segment ease (the
//    destination key's `ease`; default 'inOut' for two-key shots, else 'linear'), FOV interpolation. Defaults:
//    letterbox, skippable, freezePlayer and hideHud true, blendOut 0.8 s. `during` runs in parallel from t = 0 through
//    mission.run and is not cut short by a skip. Keys are in unscaled seconds: a shot with `timeScale` slows the world
//    but keeps the camera's pace. A shot with a single key holds for `duration` (default 2 s).
//  · Skip: SKIP held 0.6 s (or the touch SKIP button) during a skippable shot; skip() from code.
//  · flyby(def, o?): a unit model (art/units.js buildUnit) along `path` (Pos with h = altitude) at `speed`; it slows
//    into the deploy point, hovers 2.5 s, deploys (`encounter`, `units`, and the optional o.onDeploy callback), then
//    leaves. `loop` restarts the path. Returns { stop(), done }.
//  · barrage(def): `count` strikes over `duration` at random points (ctx.random) within `radius` of `at`; with `warn`
//    (default true) a pulsing ground ring shows 1.6 s before each impact. Damage `damage` (default 1200) within
//    12 m × scale, falling off; `team` (optional) restricts damage to that team's enemies.
//
// Every promise here is a simDeferred() (core/util.js) settled inside the 'cinematics' tick (sim time), so a mission
// list waiting on it resumes in that tick whatever the step() chunking (§1.4), and everything freezes while paused.
// Camera blends use { clock: 'sim' }.
import * as THREE from 'three';
import { simDeferred, simResolved, clamp, smooth, lerp, yawTo, dampAng, angWrap } from '../core/util.js';
import { buildUnit, animateUnit } from '../art/units.js';

const WARN_T = 1.6;
const DEPLOY_HOVER = 2.5;
const _a = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _l = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function catmull(p0, p1, p2, p3, u, out) {
  const u2 = u * u, u3 = u2 * u;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}

export function install(ctx) {
  let shot = null;
  const flybys = new Set();
  const barrages = new Set();
  const warned = new Set();

  // ---------------------------------------------------------------- warning rings (persistent pool, never disposed)
  const ringGeo = new THREE.RingGeometry(0.86, 1, 56);
  const discGeo = new THREE.CircleGeometry(1, 40);
  const rings = [];
  function ring() {
    let r = rings.find(x => !x.busy);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                                                depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const fill = new THREE.MeshBasicMaterial({ color: 0xff5b2e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
                                                 depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const g = new THREE.Group(); g.name = 'barrageWarn';
      const outer = new THREE.Mesh(ringGeo, mat), inner = new THREE.Mesh(discGeo, fill);
      outer.rotation.x = inner.rotation.x = -Math.PI / 2;
      outer.renderOrder = inner.renderOrder = 5;
      g.add(outer, inner); g.visible = false;
      ctx.scene.add(g);
      r = { g, outer, inner, busy: false };
      rings.push(r);
    }
    r.busy = true;
    return r;
  }
  function freeRing(r) { if (!r) return; r.busy = false; r.g.visible = false; }

  const res = (p, out = new THREE.Vector3()) => ctx.world.resolve(p, out);

  // ---------------------------------------------------------------- shots
  function relOffset(p, out) {
    if (Array.isArray(p)) return out.set(+p[0] || 0, 0, +p[1] || 0);
    return out.set(+p.x || 0, Number.isFinite(p.y) ? p.y : (+p.h || 0), +p.z || 0);
  }
  function buildShot(def, name) {
    const keys = (def.keys || []).map(k => ({
      t: +k.t || 0, pos: res(k.pos), look: def.follow && (Array.isArray(k.look) || !('s' in k.look)) ? relOffset(k.look, new THREE.Vector3()) : res(k.look),
      lookAbs: res(k.look), fov: k.fov, ease: k.ease,
    }));
    const last = keys.length ? keys[keys.length - 1].t : 0;
    const dur = keys.length <= 1 || last <= 0 ? (def.duration ?? 2) : last;
    return { def, name, keys, dur, t: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: ctx.camera.fov, resolve: null, prev: null };
  }
  function followTarget(s) {
    const tag = s.def.follow?.tag;
    if (!tag || !ctx.combat) return null;
    return ctx.combat.query({ tag })[0] || null;
  }
  function evalShot(s) {
    const K = s.keys, n = K.length;
    if (!n) return;
    const tgt = followTarget(s);
    const lookOf = (k, out) => (s.def.follow ? (tgt ? out.copy(tgt.center(_n)).add(k.look) : out.copy(k.lookAbs)) : out.copy(k.look));
    if (n === 1 || s.t <= K[0].t) {
      s.pos.copy(K[0].pos); lookOf(K[0], s.look); s.fov = K[0].fov ?? s.fov;
      return;
    }
    let i = 0;
    while (i < n - 2 && s.t >= K[i + 1].t) i++;
    const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(n - 1, i + 2)];
    const span = Math.max(1e-4, k2.t - k1.t);
    let u = clamp((s.t - k1.t) / span, 0, 1);
    const ease = k2.ease ?? (n === 2 ? 'inOut' : 'linear');
    if (ease === 'inOut') u = smooth(0, 1, u);
    catmull(k0.pos, k1.pos, k2.pos, k3.pos, u, s.pos);
    catmull(lookOf(k0, _l[0]), lookOf(k1, _l[1]), lookOf(k2, _l[2]), lookOf(k3, _l[3]), u, s.look);
    const f1 = k1.fov ?? s.fov, f2 = k2.fov ?? f1;
    s.fov = lerp(f1, f2, u);
  }
  function poseShot(s) {
    evalShot(s);
    ctx.cameraRig?.setPose(s.pos, s.look, s.fov > 1 ? s.fov : undefined);
  }
  function finishShot(skipped) {
    const s = shot;
    if (!s) return;
    shot = null;
    api.active = false;
    const pv = s.prev, p = ctx.player;
    if (pv.froze && p) p.frozen = pv.frozen;
    if (pv.letterboxed && !pv.letterbox) ctx.hud?.letterbox?.(false, 0.5);
    if (pv.hid) ctx.hud?.setCinematic?.(false);
    if (pv.timeScale != null) ctx.timeScale = pv.timeScale;
    ctx.hud?.skipHint?.(null);
    ctx.input?.showTouchButton?.('skip', false);
    if (ctx.cameraRig?.mode === 'cinematic') ctx.cameraRig.release(skipped ? 0.35 : (s.def.blendOut ?? 0.8), { clock: 'sim' });
    ctx.events.emit('cinematic:end', { name: s.name });
    s.resolve?.();
  }

  // ---------------------------------------------------------------- flybys
  function makeFlyby(def, o = {}) {
    const d = simDeferred();
    const pts = (def.path || []).map(p => res(p));
    const fb = { def, o, pts, seg: 0, segT: 0, pos: new THREE.Vector3(), yaw: 0, bank: 0, hover: 0, deployed: false, alive: true,
                 resolve: d.resolve, rig: null, dist: 0, closest: Infinity, played: false };
    if (pts.length < 2) { d.resolve(); return { stop() {}, done: d.promise }; }
    try {
      fb.rig = buildUnit(ctx, def.model, def.faction || 'hostile', { scale: def.scale ?? 1 });
      fb.rig.root.name = 'flyby:' + def.model;
      ctx.levelRoot.add(fb.rig.root);
    } catch (e) {
      if (!warned.has(def.model)) { warned.add(def.model); console.warn('[cinematics] flyby model failed', def.model, e); }
    }
    fb.pos.copy(pts[0]);
    fb.yaw = yawTo(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
    ctx.audio?.play?.(def.sound || 'flyby', fb.pos, { range: 900 });
    flybys.add(fb);
    syncFlyby(fb, 0);
    const handle = { stop() { endFlyby(fb); }, done: d.promise };
    return handle;
  }
  function endFlyby(fb) {
    if (!fb.alive) return;
    fb.alive = false;
    flybys.delete(fb);
    fb.rig?.dispose?.();
    fb.resolve();
  }
  function deploy(fb) {
    fb.deployed = true;
    const dp = fb.def.deploy || {};
    const m = ctx.mission;
    if (dp.encounter && m) m.run([{ spawn: dp.encounter }]);
    for (const g of dp.units || []) {
      const at = g.at ? undefined : { x: fb.pos.x, z: fb.pos.z };
      m?._spawnGroup?.(at ? { ...g, at } : g);
    }
    if (fb.def.model === 'dropship') ctx.fx?.dust?.(_a.set(fb.pos.x, ctx.world.groundHeight(fb.pos.x, fb.pos.z), fb.pos.z), 30, 14);
    try { fb.o.onDeploy?.(fb); } catch (e) { ctx.recordError?.('cinematics', e); }
  }
  function syncFlyby(fb, dt) {
    const r = fb.rig?.root;
    if (!r) return;
    r.position.copy(fb.pos);
    r.rotation.set(0, fb.yaw, fb.bank * 0.35, 'YXZ');
    if (fb.rig.parts?.bay) fb.rig.parts.bay.rotation.x = fb.hover > 0 ? Math.min(0.9, fb.rig.parts.bay.rotation.x + dt * 1.5) : Math.max(0, fb.rig.parts.bay.rotation.x - dt * 1.5);
    try { animateUnit(fb.rig, dt, { speed: fb.def.speed, alert: true }); } catch (e) { /* stub rigs may lack parts */ }
  }
  function updateFlyby(fb, dt) {
    const def = fb.def, pts = fb.pts;
    if (fb.hover > 0) {
      fb.hover -= dt;
      fb.pos.y += Math.sin(ctx.clock.time * 2.2) * 0.02;
      if (fb.hover <= 0 && !fb.deployed) deploy(fb);
      syncFlyby(fb, dt);
      return;
    }
    const deployAt = def.deploy && !fb.deployed ? Math.round(def.deploy.at) : -1;
    let speed = def.speed;
    if (deployAt > 0) {   // slow into the deploy point
      const target = pts[Math.min(deployAt, pts.length - 1)];
      const d = fb.pos.distanceTo(target) + (fb.seg < deployAt - 1 ? 1e3 : 0);
      speed = def.speed * clamp(d / 90, 0.12, 1);
    } else if (fb.deployed && fb.segT < 0.3 && fb.seg === Math.round(def.deploy?.at ?? -9)) speed = def.speed * clamp(0.25 + fb.segT * 2.5, 0.25, 1);
    let move = speed * dt;
    while (move > 0 && fb.alive) {
      const a = pts[fb.seg], b = pts[fb.seg + 1];
      if (!b) {
        if (def.loop) { fb.seg = 0; fb.segT = 0; fb.pos.copy(pts[0]); continue; }
        endFlyby(fb); return;
      }
      const len = Math.max(1e-3, a.distanceTo(b));
      const left = (1 - fb.segT) * len;
      if (move < left) { fb.segT += move / len; move = 0; }
      else {
        move -= left; fb.seg++; fb.segT = 0;
        if (fb.seg === deployAt) { fb.pos.copy(pts[fb.seg]); fb.hover = DEPLOY_HOVER; ctx.audio?.play?.('dropship', fb.pos); break; }
      }
      fb.pos.lerpVectors(pts[fb.seg], pts[fb.seg + 1] || pts[fb.seg], fb.segT);
    }
    if (!fb.alive) return;
    const nb = pts[fb.seg + 1];
    if (nb) {
      const want = yawTo(nb.x - fb.pos.x, nb.z - fb.pos.z);
      const prev = fb.yaw;
      fb.yaw = dampAng(fb.yaw, want, 2.5, dt);
      fb.bank = clamp(angWrap(fb.yaw - prev) / Math.max(dt, 1e-3), -1, 1);
    }
    const dCam = fb.pos.distanceTo(ctx.camera.position);
    if (dCam < fb.closest) fb.closest = dCam;
    else if (!fb.played && fb.closest < 320 && dCam > fb.closest + 20) { fb.played = true; ctx.audio?.play?.('flyby', fb.pos, { range: 900 }); }
    syncFlyby(fb, dt);
  }

  // ---------------------------------------------------------------- barrages
  function makeBarrage(def) {
    const d = simDeferred();
    const at = res(def.at);
    const n = Math.max(1, Math.floor(def.count || 1)), dur = Math.max(0, +def.duration || 0);
    const warn = def.warn !== false, lead = warn ? WARN_T : 0;
    const scale = def.scale ?? 1.4;
    const strikes = [];
    for (let i = 0; i < n; i++) {
      const a = ctx.random() * Math.PI * 2, r = (def.radius || 0) * Math.sqrt(ctx.random());
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      const t = (n === 1 ? 0 : (i + ctx.random() * 0.8) / n) * dur;
      strikes.push({ x, z, t, warnAt: t, hitAt: t + lead, ring: null, done: false });
    }
    strikes.sort((p, q) => p.t - q.t);
    const b = { def, t: 0, strikes, scale, resolve: d.resolve, damage: def.damage ?? 1200, alive: true };
    barrages.add(b);
    return d.promise;
  }
  function endBarrage(b) {
    if (!b.alive) return;
    b.alive = false;
    for (const s of b.strikes) { freeRing(s.ring); s.ring = null; }
    barrages.delete(b);
    b.resolve();
  }
  function updateBarrage(b, dt) {
    b.t += dt;
    let left = 0;
    const R = 12 * b.scale;
    for (const s of b.strikes) {
      if (s.done) continue;
      left++;
      const warn = b.def.warn !== false;
      if (warn && b.t >= s.warnAt && !s.ring) {
        s.ring = ring();
        const y = ctx.world.groundHeight(s.x, s.z);
        s.ring.g.position.set(s.x, y + 0.35, s.z);
        ctx.world.normalAt?.(s.x, s.z, _n);
        s.ring.g.quaternion.setFromUnitVectors(_up, _n.lengthSq() > 0.5 ? _n : _up);
        s.ring.g.scale.setScalar(R);
        s.ring.g.visible = true;
        s.ring.g.updateMatrixWorld(true);
        ctx.audio?.play?.('warn', s.ring.g.position, { vol: 0.5 });
      }
      if (s.ring) {
        const f = clamp((b.t - s.warnAt) / WARN_T, 0, 1);
        s.ring.outer.material.opacity = 0.55 + 0.4 * Math.sin(b.t * 18) * (1 - f * 0.5);
        s.ring.inner.material.opacity = 0.12 + 0.25 * f;
        s.ring.inner.scale.setScalar(Math.max(0.02, f));
      }
      if (b.t >= s.hitAt) {
        s.done = true; left--;
        freeRing(s.ring); s.ring = null;
        const y = ctx.world.groundHeight(s.x, s.z);
        _a.set(s.x, y + 1, s.z);
        ctx.fx?.explosion?.(_a, b.scale, { debris: 4 });
        if (b.damage > 0 && ctx.combat) {
          const src = { kind: 'barrage', pos: _a.clone() };
          if (b.def.team) src.team = b.def.team;
          ctx.combat.radial(_a, R, b.damage, b.damage * 0.5, src);
        }
      }
    }
    if (left === 0) endBarrage(b);
  }

  // ---------------------------------------------------------------- API
  const api = {
    active: false,
    /** extra: the playing shot's name and time (tests) */
    get current() { return shot ? { name: shot.name, t: shot.t, duration: shot.dur, skippable: shot.def.skippable !== false } : null; },
    play(s) {
      const def = typeof s === 'string' ? ctx.mission?.def?.cinematics?.[s] : s;
      const name = typeof s === 'string' ? s : (s?.name || 'inline');
      if (!def || !Array.isArray(def.keys) || !def.keys.length) {
        if (!warned.has('shot:' + name)) { warned.add('shot:' + name); console.warn('[cinematics] unknown or empty shot', name); }
        return simResolved();
      }
      if (shot) finishShot(true);
      const d = simDeferred();
      const sh = buildShot(def, name);
      sh.resolve = d.resolve;
      const p = ctx.player;
      sh.prev = { frozen: !!p?.frozen, froze: false, letterbox: !!ctx.hud?.letterboxOn, letterboxed: false, hid: false, timeScale: null };
      if (def.freezePlayer !== false && p) { p.frozen = true; sh.prev.froze = true; }
      if (def.letterbox !== false) { ctx.hud?.letterbox?.(true, 0.6); sh.prev.letterboxed = true; }
      if (def.hideHud !== false) { ctx.hud?.setCinematic?.(true); sh.prev.hid = true; }
      if (def.timeScale != null && def.timeScale > 0) { sh.prev.timeScale = ctx.timeScale; ctx.timeScale = def.timeScale; }
      if (def.skippable !== false) { ctx.input?.showTouchButton?.('skip', true); ctx.hud?.skipHint?.(0); }
      shot = sh;
      api.active = true;
      ctx.events.emit('cinematic:start', { name });
      poseShot(sh);
      if (def.during?.length) ctx.mission?.run(def.during);
      return d.promise;
    },
    skip() {
      if (!shot || shot.def.skippable === false) return;
      finishShot(true);
    },
    flyby(def, o) { return makeFlyby(def || {}, o); },
    barrage(def) { return makeBarrage(def || {}); },
    /** extra: end the shot, flybys and barrages now (mission.stop, level unload) */
    stopAll() {
      if (shot) finishShot(true);
      for (const fb of [...flybys]) endFlyby(fb);
      for (const b of [...barrages]) endBarrage(b);
    },
    /** extra: live flyby and barrage counts (tests) */
    get counts() { return { flybys: flybys.size, barrages: barrages.size, rings: rings.filter(r => r.busy).length }; },
    update(dt) {
      if (shot) {
        const s = shot;
        const ts = ctx.timeScale > 0 ? ctx.timeScale : 1;
        s.t += dt / ts;
        if (s.def.skippable !== false) {
          const h = ctx.input?.heldFor?.('skip') || 0;
          ctx.hud?.skipHint?.(clamp(h / 0.6, 0, 1));
          if (h >= 0.6) { finishShot(true); }
        }
        if (shot === s) {
          if (s.t >= s.dur) { s.t = s.dur; poseShot(s); finishShot(false); }
          else poseShot(s);
        }
      }
      for (const fb of [...flybys]) updateFlyby(fb, dt);
      for (const b of [...barrages]) updateBarrage(b, dt);
    },
  };
  ctx.events.on('level:cleared', () => {
    if (shot) finishShot(true);
    for (const fb of [...flybys]) { fb.rig = null; endFlyby(fb); }   // the rigs went with levelRoot
    for (const b of [...barrages]) endBarrage(b);
  });
  ctx.addSystem({ name: 'cinematics', phase: 'mission', when: 'sim', order: 10, update: (dt) => api.update(dt) });
  ctx.cinematics = api;
  return api;
}
