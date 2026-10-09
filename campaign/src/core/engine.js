// core/engine.js (P0): the ctx object, the frame loop, phases, systems, deterministic stepping,
// per-system error capture, resize and quality tiers (§3).
import * as THREE from 'three';
import { EventBus, TimerQueue, mulberry32, clamp, hashString } from './util.js';
import { SettingsStore, TIERS, resolveTier } from './settings.js';
import { SaveStore } from './save.js';
import * as inputModule from './input.js';

export const PHASES = ['input', 'early', 'player', 'ai', 'physics', 'mission', 'world', 'camera', 'fx', 'ui', 'audio', 'late'];
const ERR_MAX = 50;

/**
 * Creates the engine context (§3.2). Services are attached afterwards by each module's install(ctx).
 * Extra (non-§3.2) fields: ctx.pausedRender (render each rAF frame while debug-paused; the harness turns it off),
 * ctx.perf (timings), ctx.forcedTier (tier from ?tier=), ctx.systems (introspection), PHASES export.
 */
export function createEngine(opts = {}) {
  const canvas = opts.canvas;
  const params = opts.params || new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const debug = params.has('debug') && params.get('debug') !== '0';

  const events = new EventBus();
  const settings = new SettingsStore('campaign.settings', events);
  const forcedTier = TIERS[params.get('tier')] ? params.get('tier') : null;
  const tier = forcedTier ? { ...TIERS[forcedTier] } : resolveTier(settings.data);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: debug,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = tier.name === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatioMax));

  const scene = new THREE.Scene();
  scene.name = 'scene';
  const levelRoot = new THREE.Group();
  levelRoot.name = 'levelRoot';
  scene.add(levelRoot);
  const camera = new THREE.PerspectiveCamera(settings.get('fov'), 16 / 9, 0.5, tier.viewDistance * 1.3);
  camera.name = 'camera';
  scene.add(camera);   // so camera-attached objects (weather volumes, etc.) render

  const save = new SaveStore('campaign.save');
  save.load();

  const clock = { time: 0, dt: 0, realTime: 0, realDt: 0, frame: 0 };
  let rng = mulberry32(hashString('campaign'));
  const systems = Object.fromEntries(PHASES.map(p => [p, []]));
  let regCounter = 0;
  const lastErrLog = new Map();
  let rafId = 0, lastNow = 0, started = false;

  const ctx = {
    THREE, canvas, renderer, scene, levelRoot, camera, params, debug,
    clock, events,
    timers: new TimerQueue(() => ctx.clock.time),
    settings, tier, save,
    input: null,
    random: () => rng(),
    reseed(seed) { rng = mulberry32((Number(seed) >>> 0) || 1); },
    errors: [],

    simRunning: false,
    debugPaused: false,
    timeScale: 1,

    // extras
    pausedRender: true,
    forcedTier,
    perf: { simMs: 0, frameMs: 0, renderMs: 0, fps: 0 },
    systems,

    addSystem(def) {
      if (!def || typeof def.update !== 'function' || !def.name) throw new Error('addSystem: needs { name, phase, update }');
      if (!systems[def.phase]) throw new Error(`addSystem(${def.name}): unknown phase "${def.phase}"`);
      ctx.removeSystem(def.name);
      const sys = { name: def.name, phase: def.phase, update: def.update, when: def.when === 'always' ? 'always' : 'sim',
                    order: Number(def.order) || 0, _reg: regCounter++ };
      const list = systems[def.phase];
      list.push(sys);
      list.sort((a, b) => a.order - b.order || a._reg - b._reg);
      return () => { const i = list.indexOf(sys); if (i >= 0) list.splice(i, 1); };
    },
    removeSystem(name) {
      for (const p of PHASES) {
        const list = systems[p];
        const i = list.findIndex(s => s.name === name);
        if (i >= 0) list.splice(i, 1);
      }
    },
    start() {
      if (started) return;
      started = true;
      const frame = (now) => {
        rafId = requestAnimationFrame(frame);
        const realDt = lastNow ? clamp((now - lastNow) / 1000, 0, 0.1) : 1 / 60;
        lastNow = now;
        const t0 = performance.now();
        if (!ctx.debugPaused) ctx.tick(realDt);
        if (!ctx.debugPaused || ctx.pausedRender) ctx.renderFrame();
        ctx.perf.frameMs = performance.now() - t0;
        ctx.perf.fps = ctx.perf.fps ? ctx.perf.fps * 0.9 + (realDt > 0 ? 0.1 / realDt : 0) : (realDt > 0 ? 1 / realDt : 0);
      };
      rafId = requestAnimationFrame(frame);
    },
    stop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; started = false; lastNow = 0; },
    tick(realDt) {
      const t0 = performance.now();
      realDt = Math.max(0, Number(realDt) || 0);
      clock.realDt = realDt; clock.realTime += realDt; clock.frame++;
      const sim = ctx.simRunning;
      const simDt = sim ? Math.min(realDt, 1 / 30) * ctx.timeScale : 0;
      for (const phase of PHASES) {
        const list = systems[phase];
        for (let i = 0; i < list.length; i++) {
          const sys = list[i];
          if (sys.when === 'sim' && !sim) continue;
          try { sys.update(sys.when === 'sim' ? simDt : realDt, ctx); }
          catch (e) { recordError(sys.name, e); }
        }
      }
      if (sim) { clock.time += simDt; clock.dt = simDt; }
      ctx.perf.simMs = performance.now() - t0;
    },
    /**
     * n × tick(dt), synchronously. No microtask checkpoint runs between these ticks (rAF play runs one after every
     * frame), so anything that sequences the sim MUST settle synchronously inside a tick (ctx.timers, simDeferred() in
     * core/util.js), never through `await`. Then step(n) gives the same state however the n ticks are split (§1.4).
     */
    step(n = 1, dt = 1 / 60) {
      n = Math.max(0, Math.floor(n));
      for (let i = 0; i < n; i++) ctx.tick(dt);
    },
    renderFrame() {
      const t0 = performance.now();
      try {
        if (ctx.pipeline?.render) ctx.pipeline.render();
        else { renderer.info.reset(); renderer.render(scene, camera); }
      } catch (e) { recordError('render', e); }
      ctx.perf.renderMs = performance.now() - t0;
    },
    clearLevel() {
      const kids = levelRoot.children.slice();
      for (const o of kids) { levelRoot.remove(o); disposeTree(o); }
      ctx.timers.clear();
      events.emit('level:cleared', {});
    },
    setTier(name) {
      if (!TIERS[name]) { console.warn('[engine] unknown tier', name); return; }
      ctx.tier = { ...TIERS[name] };
      camera.far = ctx.tier.viewDistance * 1.3;
      camera.updateProjectionMatrix();
      events.emit('tier:changed', { tier: ctx.tier });
    },
    resize() {
      const w = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
      const h = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      events.emit('resize', { w, h, pr: renderer.getPixelRatio() });
    },
    recordError: (system, e) => recordError(system, e),
  };

  function recordError(system, e) {
    const message = e && e.message ? e.message : String(e);
    ctx.errors.push({ system, message, stack: e && e.stack ? String(e.stack) : undefined, t: clock.realTime });
    if (ctx.errors.length > ERR_MAX) ctx.errors.splice(0, ctx.errors.length - ERR_MAX);
    const now = performance.now();
    if (!(lastErrLog.get(system) > now - 1000)) {
      lastErrLog.set(system, now);
      console.error(`[system ${system}]`, e);
    }
  }

  // engine-owned systems
  ctx.addSystem({ name: 'timers', phase: 'early', when: 'sim', order: -10, update: () => ctx.timers.update() });

  // settings that the engine owns
  events.on('settings:changed', ({ key }) => {
    if (key === 'quality' && !forcedTier) ctx.setTier(resolveTier(settings.data).name);
  });

  window.addEventListener('resize', () => ctx.resize());
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => ctx.resize());

  // input is part of the core (§3.6: "called by createEngine")
  ctx.input = inputModule.install(ctx);
  ctx.resize();
  return ctx;
}

/** Dispose a detached subtree, skipping anything marked `userData.shared` (cached kit geometry, library materials). */
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
        const t = m[k];
        if (t && !t.userData?.shared) t.dispose();
      }
      m.dispose();
    }
    if (o.isInstancedMesh && o.dispose) o.dispose();
  });
}
