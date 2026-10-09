// debug/debug.js (P0): window.__game (§9.2), the #dbg overlay (toggle with the backquote key), URL params god/mute,
// and window error capture. Every __game method is safe from Playwright's page.evaluate and returns JSON-safe data.
import * as THREE from 'three';
import { LEVELS } from '../../levels/index.js';

export const VERSION = '0.1.0-p0';
const SLOTS = ['R', 'L', 'S', 'U'];
const r3 = (v) => [v.x, v.y, v.z];

export function install(ctx) {
  const winErrors = [];
  window.addEventListener('error', (e) => winErrors.push({ system: 'window', message: String(e.message || e.error?.message || e) }));
  window.addEventListener('unhandledrejection', (e) => winErrors.push({ system: 'promise', message: String(e.reason?.message || e.reason) }));

  let markReady;
  const ready = new Promise(res => { markReady = res; });
  let readyDone = false;
  const resolveReady = () => { if (!readyDone) { readyDone = true; markReady(); } };
  ctx.events.on('state:changed', ({ to }) => { if (to === 'title' || to === 'playing') resolveReady(); });

  if (ctx.params.get('god') === '1' && ctx.combat) ctx.combat.god = true;

  const waitFor = (pred, timeoutMs = 120000) => new Promise((res, rej) => {
    const t0 = performance.now();
    const poll = () => {
      if (pred()) return res();
      if (performance.now() - t0 > timeoutMs) return rej(new Error('timeout'));
      setTimeout(poll, 25);
    };
    poll();
  });
  const resolvePos = (p) => {
    if (Array.isArray(p) && p.length === 3) return new THREE.Vector3(p[0], p[1], p[2]);
    return ctx.world.resolve(p, new THREE.Vector3());
  };

  function getState() {
    const pl = ctx.player, mi = ctx.mission, w = ctx.world;
    let player = null;
    if (pl && (pl.active || pl.rig)) {
      const weapons = {};
      for (const s of SLOTS) { const wp = pl.weapons?.[s]; if (wp) weapons[s] = { id: wp.part.id, ammo: wp.ammo, cd: wp.cd }; }
      player = {
        active: !!pl.active, alive: !!pl.alive, pos: r3(pl.pos), vel: r3(pl.vel), yaw: pl.yaw, pitch: pl.pitch,
        ap: pl.ap, apMax: pl.apMax, en: pl.en, onGround: !!pl.onGround,
        s: w?.route ? w.playArea(pl.pos.x, pl.pos.z).s : 0,
        lock: pl.lock ? pl.lock.name : null, weapons,
      };
    }
    const units = (ctx.enemies?.all() || []).map(u => ({ id: u.id, kind: u.kind, name: u.name, team: u.team, tags: [...(u.tags || [])],
                                                          pos: r3(u.pos), ap: u.ap, alive: !!u.alive }));
    const ws = w?.def ? w.stats() : null;
    return {
      state: ctx.flow?.state ?? 'boot', levelId: ctx.flow?.levelId ?? null, checkpoint: mi?.checkpoint ?? null,
      time: mi?.elapsed ?? 0, frame: ctx.clock.frame,
      player, units,
      objectives: (mi?.def ? mi.objectives() : []).map(o => ({ id: o.id, text: o.text, state: o.state, ...(o.progress ? { progress: { ...o.progress } } : {}) })),
      flags: JSON.parse(JSON.stringify(mi?.flags || {})),
      comms: { current: ctx.comms?.current ?? null, queued: ctx.comms?.queued ?? 0 },
      cinematic: !!ctx.cinematics?.active,
      world: ws ? { nodes: ws.terrain.nodes ?? 0, pending: ws.terrain.pending ?? 0, colliders: ws.colliders, structures: ws.structures,
                    scatterVisible: ws.scatter.visible ?? 0 } : null,
      perf: ctx.pipeline?.stats ? ctx.pipeline.stats() : {},
      errors: ctx.errors.length + winErrors.length,
    };
  }

  const api = {
    ctx,
    ready,
    version: VERSION,
    state: () => ctx.flow?.state ?? 'boot',
    pause() { ctx.debugPaused = true; },
    resume() { ctx.debugPaused = false; },
    step(n = 1, dt = 1 / 60) { ctx.step(n, dt); return getState(); },
    render() { ctx.renderFrame(); },
    async settle() {
      await ctx.world?.settle?.();
      ctx.structures?.settle?.(ctx.cameraRig?.focus);
      await ctx.pipeline?.warmup?.();
    },
    async startLevel(id, cp, o = {}) {
      const paused = o.paused !== false;
      if (o.tier) ctx.setTier(o.tier);
      if (paused) ctx.debugPaused = true;
      await ctx.flow.startLevel(id, cp, { skipIntro: true });
      if (ctx.flow.state !== 'playing') await waitFor(() => ctx.flow.state === 'playing', 30000);
      if (paused) ctx.debugPaused = true;
      await api.settle();
      if (!paused) ctx.debugPaused = false;
      return getState();
    },
    teleport(p, o = {}) {
      const pos = resolvePos(p);
      if (o.h !== undefined) pos.y = ctx.world.groundHeight(pos.x, pos.z) + o.h;
      else if (!(Array.isArray(p) && p.length === 3) && !(p && typeof p === 'object' && 'y' in p)) pos.y = NaN;
      ctx.player.teleport(pos, o.yaw);
      ctx.world?.terrain?.settle?.();
      ctx.world?.scatter?.settle?.();
      ctx.structures?.settle?.(ctx.player.pos);
    },
    setGod(on) { if (ctx.combat) ctx.combat.god = !!on; },
    killAll(f) { return ctx.enemies?.killAll(f) ?? 0; },
    spawn(kind, p, o) { return ctx.enemies.spawn(kind, resolvePos(p), o || {}).id; },
    trigger(id) { ctx.mission?.fire(id); },
    setFlag(k, v) { ctx.mission?.setFlag(k, v); },
    completeObjective(id) { ctx.mission?.run([{ objective: { complete: id } }]); },
    checkpoint(id) { ctx.mission?.reachCheckpoint(id); },
    async restart() {
      const paused = ctx.debugPaused;
      await ctx.flow.restartCheckpoint();
      ctx.debugPaused = paused;
    },
    skipCinematic() { ctx.cinematics?.skip(); },
    input: {
      move(x, y) { ctx.input.injectMove(x, y); },
      look(dx, dy) { ctx.input.injectLook(dx, dy); },
      hold(a, down) { ctx.input.inject(a, down); },
      press(a) { ctx.input.tap(a); },
      clear() { ctx.input.clearInjected(); },
    },
    freeCam(on, pose) {
      const P = pose ? { pos: new THREE.Vector3(...pose.pos), look: new THREE.Vector3(...pose.look) } : undefined;
      ctx.cameraRig.setFree(!!on, P);
      if (pose?.fov) ctx.cameraRig.setFov(pose.fov, 0);
      else if (!on) ctx.cameraRig.setFov(ctx.settings.get('fov'), 0);
      ctx.camera.updateMatrixWorld();
    },
    setCamera(pos, look, fov) { api.freeCam(true, { pos, look, fov }); },
    hud(on) { document.getElementById('game')?.classList.toggle('shot-clean', !on); },
    setTier(name) { ctx.setTier(name); },
    setTimeScale(x) { ctx.timeScale = Math.max(0, Number(x) || 0); },
    seed(n) { ctx.reseed(n); },
    perf() {
      const s = ctx.pipeline?.stats ? ctx.pipeline.stats() : {};
      return { ...s, fps: ctx.perf.fps, simMs: ctx.perf.simMs, frameMs: ctx.perf.frameMs };
    },
    getState,
    errors() {
      return [...ctx.errors.map(e => ({ system: e.system, message: e.message })), ...winErrors];
    },
    levels() {
      const lv = ctx.save.data.progress.levels;
      return LEVELS.map(l => ({ id: l.id, title: l.title, unlocked: !!lv[l.id]?.unlocked || !!l.hidden }));
    },
    save: {
      reset() { ctx.save.reset(); },
      get() { return JSON.parse(JSON.stringify(ctx.save.data)); },
      set(d) { ctx.save.importJSON(JSON.stringify(d)); },
    },
    /** extra: called by main.js when boot finished (or failed) so `ready` never hangs */
    _markReady: resolveReady,
  };

  // ---------------------------------------------------------------- overlay (#dbg) and debug keys
  const dbg = document.getElementById('dbg');
  let acc = 0;
  const overlay = {
    visible: false,
    toggle(on = !overlay.visible) { overlay.visible = on; if (dbg) dbg.hidden = !on; },
  };
  if (ctx.debug && ctx.params.get('overlay') === '1') overlay.toggle(true);
  window.addEventListener('keydown', (e) => { if (ctx.debug && e.code === 'Backquote' && !e.repeat) { overlay.toggle(); acc = 1; } });
  ctx.addSystem({
    name: 'debug-keys', phase: 'early', when: 'always',
    update(dt) {
      if (!ctx.debug && !ctx.settings.get('showFps')) { if (overlay.visible) overlay.toggle(false); return; }
      if (!ctx.debug && !overlay.visible) overlay.toggle(true);
      acc += dt;
      if (!overlay.visible || !dbg || acc < 0.25) return;
      acc = 0;
      const s = ctx.pipeline?.stats ? ctx.pipeline.stats() : {};
      const p = ctx.player;
      const lines = [
        `${VERSION} · ${ctx.tier.name} · ${Math.round(ctx.perf.fps)} fps · sim ${ctx.perf.simMs.toFixed(1)} ms · render ${ctx.perf.renderMs.toFixed(1)} ms`,
        `state ${ctx.flow?.state} · level ${ctx.flow?.levelId ?? '-'} · cp ${ctx.mission?.checkpoint ?? '-'} · t ${(ctx.mission?.elapsed ?? 0).toFixed(1)}`,
        `calls ${s.calls ?? '-'} · tris ${s.triangles ?? '-'} · geo ${s.geometries ?? '-'} · tex ${s.textures ?? '-'} · prog ${s.programs ?? '-'}`,
      ];
      if (ctx.debug && p?.active) lines.push(`pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)} · yaw ${p.yaw.toFixed(2)} · cam ${ctx.cameraRig?.mode}`);
      if (ctx.errors.length) lines.push(`errors ${ctx.errors.length}: ${ctx.errors[ctx.errors.length - 1].system}: ${ctx.errors[ctx.errors.length - 1].message}`);
      dbg.textContent = lines.join('\n');
    },
  });

  ctx.debugApi = api;
  window.__game = api;
  return api;
}
