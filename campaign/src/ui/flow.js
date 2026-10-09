// ui/flow.js (P5) — P0 STUB: a working game state machine (§8): title → (select) → briefing → loading → playing ⇄ paused
// → complete → debrief → title, dead → retry, plus garage, settings, credits and interstitials.
import { ACT } from '../core/input.js';
import { LEVELS, loadLevel, nextLevel } from '../../levels/index.js';

const SIM = { playing: true, dead: true, complete: true };
const DEATH_LINES = ['Frame down. Recovery beacon active.', 'AP depleted. Systems offline.', 'Contact lost with the frame.'];
const CREDITS = ['DAWNWAKE', 'Follow the thaw. Carry what you can.', 'Built with three.js', 'Every model, texture and sound is generated in code.'];

export function install(ctx) {
  let menuToken = 0;
  const S = () => ctx.screens, H = () => ctx.hud;

  function set(to) {
    const from = flow.state;
    if (from === to) return;
    flow.state = to;
    ctx.input.enabled = to === 'playing';
    if (!SIM[to]) ctx.simRunning = false;
    document.getElementById('hud')?.classList.toggle('dim', to === 'paused');
    ctx.events.emit('state:changed', { from, to });
  }
  function levelList() {
    const lv = ctx.save.data.progress.levels;
    return LEVELS.filter(l => !l.hidden || ctx.debug).sort((a, b) => a.order - b.order).map(l => ({
      id: l.id, title: l.title, subtitle: l.hidden ? 'Development' : undefined,
      unlocked: !!lv[l.id]?.unlocked || (l.hidden && ctx.debug), completed: !!lv[l.id]?.completed,
      bestTime: lv[l.id]?.bestTime ?? undefined, bestRank: lv[l.id]?.bestRank ?? undefined,
    }));
  }
  function titleView() {
    ctx.pipeline?.setView(ctx.garage.scene, ctx.garage.camera);
    ctx.garage?.showcase(true);
  }
  function teardown() {
    if (!ctx.world?.def && !ctx.mission?.def) return;
    if (ctx.mission?.def) ctx.save.addPlayTime(ctx.mission.elapsed);
    ctx.mission?.stop();
    if (ctx.mission) ctx.mission.def = null;
    ctx.player?.despawn();
    ctx.world?.unload();
    ctx.atmosphere?.clear();
    ctx.clearLevel();
    ctx.save.write();
    flow.levelId = null; flow.def = null;
  }

  async function titleLoop(token) {
    while (token === menuToken) {
      set('title');
      titleView();
      ctx.music?.setTheme('menu');
      const cur = ctx.save.data.progress.current;
      const curLevel = cur && LEVELS.find(l => l.id === cur.levelId);
      const r = await S().showTitle({ canContinue: !!curLevel, continueLabel: curLevel ? `Continue · ${curLevel.title}` : undefined });
      if (token !== menuToken) return;
      if (r === 'continue' && curLevel) { await flow.startLevel(curLevel.id, cur.checkpoint?.checkpoint ?? undefined); return; }
      if (r === 'new') {
        const first = LEVELS.filter(l => !l.hidden).sort((a, b) => a.order - b.order)[0];
        if (first && await briefing(first.id, token)) return;
      } else if (r === 'select') {
        set('levelSelect');
        const id = await S().showLevelSelect({ levels: levelList() });
        if (token !== menuToken) return;
        if (id && id !== 'back' && await briefing(id, token)) return;
      } else if (r === 'garage') {
        set('garage'); ctx.music?.setTheme('garage');
        await ctx.garage.open({ context: 'title' });
      } else if (r === 'settings') {
        set('settings'); await S().showSettings();
      } else if (r === 'credits') {
        set('credits'); await S().showCredits({ lines: CREDITS });
      } else if (r == null) return;   // replaced by something else (tests, direct start)
    }
  }
  /** briefing for a level; resolves true when the level was started */
  async function briefing(id, token) {
    const def = await loadLevel(id);
    while (token === menuToken) {
      set('briefing');
      const r = await S().showBriefing({ level: def });
      if (token !== menuToken) return true;
      if (r === 'start') { await flow.startLevel(def); return true; }
      if (r === 'garage') { set('garage'); ctx.music?.setTheme('garage'); await ctx.garage.open({ context: 'briefing', levelId: id }); continue; }
      return false;
    }
    return true;
  }

  async function onDeathScreen(line) {
    ctx.simRunning = false;
    ctx.input.exitPointerLock();
    const r = await S().showDeath({ line, hasCheckpoint: !!ctx.mission?.checkpoint && ctx.mission.checkpoint !== ctx.mission.def?.checkpoints?.[0]?.id });
    if (flow.state !== 'dead') return;
    if (r === 'retry') await flow.restartCheckpoint();
    else if (r === 'quit') await flow.quitToTitle();
  }

  async function loadAndPlay(level, checkpointId, o, token) {
    ctx.audio?.unlock?.();
    set('loading');
    H()?.show(false);
    ctx.garage?.showcase(false);
    ctx.garage?.isOpen && ctx.garage.close();
    const loader = S().showLoading({ title: typeof level === 'string' ? (LEVELS.find(l => l.id === level)?.title || level) : level.title });
    const def = typeof level === 'string' ? await loadLevel(level) : level;
    if (token !== menuToken) return;
    teardown();
    ctx.pipeline?.clearView();
    ctx.materials?.setFactions(def.factions || {});
    ctx.materials?.applyPalette(def.art?.palette || {});
    ctx.atmosphere?.apply(def.art || {});
    ctx.comms?.defineSpeakers(def.speakers || {});
    ctx.music?.setTheme(def.music?.theme ?? 'ambient');
    const cp = (def.checkpoints || []).find(c => c.id === checkpointId) || def.checkpoints?.[0];
    await ctx.world.load(def, { onProgress: (p, label) => loader.set(p * 0.9, label), spawnAt: cp?.at });
    if (token !== menuToken) return;
    def.custom?.install?.(ctx, ctx.mission);
    ctx.player.setLoadout(ctx.save.getLoadout());
    const snap = ctx.save.getCheckpoint(def.id);
    const fresh = !(snap && snap.checkpoint === cp?.id) && (!checkpointId || checkpointId === def.checkpoints?.[0]?.id);
    ctx.mission.start(def, cp?.id, snap);
    flow.levelId = def.id; flow.def = def;
    loader.set(0.95, 'Shaders');
    await ctx.pipeline?.warmup();
    await ctx.world.settle();
    loader.set(1, 'Ready');
    loader.close();
    if (token !== menuToken) return;
    if (fresh && !o.skipIntro && def.intro?.length) {
      set('interstitial');
      await S().showInterstitial(def.intro, { skippable: true });
      if (token !== menuToken) return;
    }
    S().hide();
    H()?.show(true);
    set('playing');
    ctx.simRunning = true;
    ctx.input.requestPointerLock();
    ctx.events.emit('level:ready', { levelId: def.id });
    if (ctx.input.isTouch && !navigator.webdriver && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  }

  const flow = {
    state: 'boot',
    levelId: null,
    def: null,
    async boot() {
      const lvl = ctx.params.get('level');
      if (lvl && LEVELS.some(l => l.id === lvl)) { await flow.startLevel(lvl, ctx.params.get('cp') || undefined, { skipIntro: true }); return; }
      await flow.toTitle();
    },
    async toTitle() {
      teardown();
      ctx.input.exitPointerLock();
      H()?.show(false);
      H()?.letterbox(false, 0);
      H()?.fade(0, 0);
      const token = ++menuToken;
      titleLoop(token).catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
    },
    async startLevel(level, checkpointId, o = {}) {
      const token = ++menuToken;
      try { await loadAndPlay(level, checkpointId, o, token); }
      catch (e) {
        ctx.recordError('flow', e); e._recorded = true;
        if (token === menuToken) await flow.toTitle();
        throw e;
      }
    },
    async restartCheckpoint() {
      if (!ctx.mission?.def) return;
      ++menuToken;
      S().hide();
      set('loading');
      ctx.mission.restart();
      await ctx.world.settle();
      H()?.show(true);
      set('playing');
      ctx.simRunning = true;
      ctx.input.requestPointerLock();
      ctx.events.emit('level:ready', { levelId: ctx.mission.def.id });
    },
    pause() {
      if (flow.state !== 'playing') return;
      set('paused');
      ctx.input.exitPointerLock();
      ctx.input.releaseAll?.();
      const token = ++menuToken;
      (async () => {
        while (flow.state === 'paused' && token === menuToken) {
          const r = await S().showPause({
            title: flow.def?.title || '', objectives: ctx.mission?.objectives() || [], commsLog: ctx.comms?.log || [],
            drawMap: ctx.world?.heightfield ? (c) => ctx.world.heightfield.renderMap(c, { route: ctx.world.route }) : undefined,
          });
          if (flow.state !== 'paused' || token !== menuToken) return;
          if (r === 'resume') { flow.resume(); return; }
          if (r === 'restart') { await flow.restartCheckpoint(); return; }
          if (r === 'quit') { await flow.quitToTitle(); return; }
          if (r === 'settings') await S().showSettings();
          else if (r == null) return;
        }
      })().catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
    },
    resume() {
      if (flow.state !== 'paused') return;
      ++menuToken;
      S().hide();
      set('playing');
      ctx.simRunning = true;
      ctx.input.requestPointerLock();
    },
    async interstitial(pages) {
      const back = flow.state;
      set('interstitial');
      ctx.input.exitPointerLock();
      await S().showInterstitial(pages || []);
      S().hide();
      if (back === 'playing' && flow.state === 'interstitial') { set('playing'); ctx.simRunning = true; ctx.input.requestPointerLock(); }
    },
    async quitToTitle() {
      await flow.toTitle();
    },
    update() {
      if (flow.state === 'playing' && ctx.input.pressed(ACT.PAUSE)) flow.pause();
    },
  };

  ctx.events.on('input:focuslost', () => { if (flow.state === 'playing') flow.pause(); });
  ctx.events.on('player:died', () => {
    if (flow.state !== 'playing') return;
    set('dead');
    ctx.save.data.stats.deaths++;
    const line = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)];
    ctx.timers.after(2.6, () => { if (flow.state === 'dead') onDeathScreen(line).catch(e => { if (!e?._recorded) ctx.recordError('flow', e); }); });
  });
  ctx.events.on('level:failed', ({ reason }) => {
    if (flow.state !== 'playing') return;
    set('dead');
    onDeathScreen(reason || 'Mission failed.').catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
  });
  ctx.events.on('level:complete', ({ levelId, result }) => {
    if (flow.state !== 'playing') return;
    const def = flow.def;
    set('complete');
    ctx.simRunning = false;
    ctx.input.exitPointerLock();
    const unl = [...(def?.unlocks?.levels || []), ...(def?.unlocks?.parts || [])];
    ctx.save.completeLevel(levelId, result, def?.unlocks);
    const token = ++menuToken;
    (async () => {
      set('debrief');
      H()?.show(false);
      ctx.music?.setTheme('debrief');
      const r = await S().showDebrief({ level: def, result, unlocks: unl });
      if (token !== menuToken) return;
      if (def?.outro?.length) { set('interstitial'); await S().showInterstitial(def.outro, { skippable: true }); }
      if (token !== menuToken) return;
      teardown();
      if (r === 'next') {
        const nx = nextLevel(levelId);
        if (nx) { const t2 = ++menuToken; titleView(); if (await briefing(nx, t2)) return; }
        else { set('credits'); titleView(); await S().showCredits({ lines: CREDITS }); }
      } else if (r === 'garage') { set('garage'); titleView(); await ctx.garage.open({ context: 'title' }); }
      await flow.toTitle();
    })().catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
  });
  ctx.addSystem({ name: 'flow', phase: 'early', when: 'always', update: () => flow.update() });
  ctx.flow = flow;
  return flow;
}
