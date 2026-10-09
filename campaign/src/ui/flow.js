// ui/flow.js (P5): the game state machine (§8): boot → title → (select) → briefing ⇄ garage → loading →
// [intro] → playing ⇄ paused → complete → debrief → [bench → count] → [outro] → next briefing | credits | title,
// and playing → dead → retry (checkpoint restart) | title. Save integration, ranks (built by the mission), campaign
// state (addendum A3.4, A3.7): the campaign loadout, `pending` and `ledger` at level end, the Bench (or its fallback),
// the Morning Count, and resetting #fade and the letterbox when leaving 'playing' or 'complete' for anything other
// than 'paused' or 'interstitial' (L1 ends on a fade to black).
//
// A level end (level:complete / level:failed) that arrives while the level is suspended ('paused', 'interstitial',
// 'loading') is held and handled at the first tick back in 'playing', never dropped: mission.complete() runs once per
// start. In 'dead' a level end is dropped (the death screen decides). A restart, a new level or quitting discards it.
import { ACT } from '../core/input.js';
import { LEVELS, loadLevel, nextLevel } from '../../levels/index.js';
import * as LO from '../combat/loadout.js';
import { formatTime } from '../core/util.js';

const SIM = { playing: true, dead: true, complete: true };
const SUSPENDED = { paused: true, interstitial: true, loading: true };   // a level end is held, not dropped
const KEEP_OVERLAYS = { paused: true, interstitial: true };              // leaving 'playing' for these keeps fade/letterbox
const DEATH_LINES = ['Signal lost.', 'Frame down. Recovery beacon active.', 'AP depleted. Systems offline.'];
const CREDITS = ['DAWNWAKE', 'Follow the thaw. Carry what you can.', 'Built with three.js.',
                 'Every model, texture, sound and note is generated in code.', 'Thank you for playing.'];
export const CAMPAIGN_FALLBACK = Object.freeze({ version: 1, startWater: 4, lockerSize: 4, speakers: {}, fixed: [], fragments: [], roll: [], legs: {} });
/** A3.4: the campaign state anyone uses when the save flag is missing */
export function defaultCampaign(data) {
  return { v: 1, day: 0, water: data?.startWater ?? 4, arms: 0, parts: {}, spares: [], fitted: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4' },
           lost: [], fragments: {}, kernel: 4, benchVisits: 0, tearCount: 0, pending: null, ledger: null };
}
const deepCopy = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function install(ctx) {
  let menuToken = 0;
  let heldEnd = null;   // ['complete' | 'failed', payload] that arrived while suspended
  let campaignP = null;
  const perf = { t: 0, samples: [], done: false };
  const S = () => ctx.screens, H = () => ctx.hud;

  function set(to) {
    const from = flow.state;
    if (from === to) return;
    flow.state = to;
    ctx.input.enabled = to === 'playing';
    if (!SIM[to]) ctx.simRunning = false;
    document.getElementById('hud')?.classList.toggle('dim', to === 'paused');
    if ((from === 'playing' || from === 'complete') && !KEEP_OVERLAYS[to]) { H()?.fade(0, 0); H()?.letterbox(false, 0); H()?.setCinematic?.(false); }
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
  /** a fade/letterbox left by the stopped run must not persist (called before mission.start/restart) */
  function clearOverlays() { H()?.fade(0, 0); H()?.letterbox(false, 0); H()?.setCinematic?.(false); }
  function teardown() {
    heldEnd = null;
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

  // ---------------------------------------------------------------- campaign (A3)
  /** levels/campaign.js (P6), or the A3.3 fallback when it is missing */
  function campaignData() {
    if (!campaignP) campaignP = import('../../levels/campaign.js').then(m => m.default || CAMPAIGN_FALLBACK).catch(() => CAMPAIGN_FALLBACK);
    return campaignP;
  }
  function getCampaign(data) {
    const s = ctx.save.getFlag('campaign');
    return s && typeof s === 'object' ? deepCopy(s) : defaultCampaign(data);
  }
  function putCampaign(st) { ctx.save.setFlag('campaign', deepCopy(st)); }
  function campaignLoadout(st) {
    if (typeof LO.campaignLoadout === 'function') return LO.campaignLoadout(st.fitted);
    const lo = ctx.save.getLoadout();
    return { ...lo, frame: LO.FRAMES?.moth ? 'moth' : lo.frame };
  }
  /** A3.4: at level:complete of a campaign level, before the debrief */
  function writePending(levelId, result, data) {
    const st = getCampaign(data);
    const sledges = result?.water ?? 0, tears = result?.tears ?? 0;
    st.pending = { levelId, haul: [...(result?.haul ?? [])], tears, sledges };
    st.ledger = { levelId, before: st.water, sledges, gives: 0 };
    st.water += sledges;
    st.tearCount = (st.tearCount || 0) + tears;
    putCampaign(st);
    return st;
  }
  /** A3.7 step 4 without bench mode: A3.5 rule 1 applied to `pending`, then cleared */
  function benchFallback() {
    const st = getCampaign();
    for (const part of st.pending?.haul || []) {
      const s = st.parts[part];
      if (s === 'fitted' || s === 'locker') st.spares.push(part);
      else st.parts[part] = 'locker';
    }
    st.pending = null;
    putCampaign(st);
  }
  /** A3.5 rule 6, save, then the Morning Count card */
  async function runCount(levelId, token) {
    const data = await campaignData();
    if (token !== menuToken) return;
    const st = getCampaign(data);
    const leg = data.legs?.[levelId] || {};
    const draw = leg.draw ?? 0;
    const day = leg.day ?? ((st.day || 0) + 1);
    const ledger = st.ledger || { before: st.water, sledges: 0, gives: 0 };
    const roll = Array.isArray(data.roll) ? data.roll : [];
    let after = st.water - draw, short = 0;
    const lostNow = [];
    if (after < 0) {
      short = -after;
      let toLose = 2 * short;
      for (let i = roll.length - 1; i >= 0 && toLose > 0; i--) {
        const r = roll[i];
        if (r.protected || st.lost.includes(r.id)) continue;
        st.lost.push(r.id); lostNow.push(r.name); toLose--;
      }
      after = 0;
    }
    st.water = after; st.day = day; st.ledger = null;
    putCampaign(st);
    const walking = roll.filter(r => !st.lost.includes(r.id));
    flow.lastCount = { day, water: { before: ledger.before, sledges: ledger.sledges, gives: ledger.gives || 0, draw, after, short },
                       rigs: walking.length, souls: walking.reduce((a, r) => a + (r.souls || 0), 0), lost: lostNow, log: leg.log || '', edgeLat: leg.edgeLat };
    await S().showMorningCount(flow.lastCount);
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
  /** briefing for a level; resolves true when the level was started (or the menu was taken over) */
  async function briefing(id, token) {
    const def = typeof id === 'string' ? await loadLevel(id) : id;
    while (token === menuToken) {
      set('briefing');
      const r = await S().showBriefing({ level: def, canFit: !def.campaign });
      if (token !== menuToken) return true;
      if (r === 'start') { await flow.startLevel(def); return true; }
      if (r === 'garage' && !def.campaign) {
        set('garage'); ctx.music?.setTheme('garage');
        await ctx.garage.open({ context: 'briefing', levelId: def.id });
        continue;
      }
      return false;
    }
    return true;
  }

  async function onDeathScreen(line) {
    ctx.simRunning = false;
    ctx.input.exitPointerLock();
    const m = ctx.mission;
    const r = await S().showDeath({ line, hasCheckpoint: !!m?.checkpoint && m.checkpoint !== m.def?.checkpoints?.[0]?.id });
    if (flow.state !== 'dead') return;
    if (r === 'retry') await flow.restartCheckpoint();
    else if (r === 'quit') await flow.quitToTitle();
  }

  async function loadAndPlay(level, checkpointId, o, token) {
    ctx.audio?.unlock?.();
    heldEnd = null;
    set('loading');
    H()?.show(false);
    ctx.garage?.showcase(false);
    ctx.garage?.isOpen && ctx.garage.close();
    const loader = S().showLoading({ title: typeof level === 'string' ? (LEVELS.find(l => l.id === level)?.title || level) : level.title });
    const def = typeof level === 'string' ? await loadLevel(level) : level;
    if (token !== menuToken) return;
    teardown();
    clearOverlays();
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
    if (def.campaign) {
      const data = await campaignData();
      if (token !== menuToken) return;
      if (!ctx.save.getFlag('campaign')) putCampaign(defaultCampaign(data));   // A3.4: created when a campaign level starts
      ctx.player.setLoadout(campaignLoadout(getCampaign(data)));
    } else ctx.player.setLoadout(ctx.save.getLoadout());
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
    perf.t = 0; perf.samples.length = 0; perf.done = false;
    ctx.input.requestPointerLock();
    ctx.events.emit('level:ready', { levelId: def.id });
    if (ctx.input.isTouch && !navigator.webdriver && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  }

  /** the pause menu's tactical map: the heightfield's shaded relief, cropped to the route, with route, checkpoints,
   *  markers and the frame. Assumes renderMap() maps heightfield.bounds onto the whole canvas (arch §4.2 stub). */
  function drawMap(c) {
    const w = ctx.world, hf = w?.heightfield;
    if (!hf || !w.route) return;
    const b = hf.bounds, BW = b.x1 - b.x0, BH = b.z1 - b.z0;
    const big = document.createElement('canvas');
    const k = 900 / Math.max(BW, BH);
    big.width = Math.max(32, Math.round(BW * k)); big.height = Math.max(32, Math.round(BH * k));
    hf.renderMap(big, { route: w.route });
    // crop: the route's bounding box plus a margin, aspect-fit into the visible canvas
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of w.route.sample(40)) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const pad = 380; x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
    const W = c.width, H = c.height, sc = Math.min(W / (x1 - x0), H / (z1 - z0));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const X = (x) => W / 2 + (x - cx) * sc, Y = (z) => H / 2 + (z - cz) * sc;
    const g = c.getContext('2d');
    g.fillStyle = '#0c0b0e'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(big, (X(b.x0)), (Y(b.z0)), BW * sc, BH * sc);
    g.fillStyle = 'rgba(12,11,14,.28)'; g.fillRect(0, 0, W, H);
    // route
    g.strokeStyle = 'rgba(224,145,60,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath();
    w.route.sample(30).forEach((p, i) => { if (i) g.lineTo(X(p.x), Y(p.z)); else g.moveTo(X(p.x), Y(p.z)); });
    g.stroke(); g.setLineDash([]);
    // checkpoints
    const m = ctx.mission;
    for (const cp of m?.def?.checkpoints || []) {
      const p = w.resolve(cp.at);
      g.fillStyle = cp.id === m.checkpoint ? '#8fd2c6' : 'rgba(143,210,198,.45)';
      g.fillRect(X(p.x) - 3, Y(p.z) - 3, 6, 6);
    }
    // markers (objective first)
    for (const mk of H()?.markers || []) {
      const p = typeof mk.pos === 'function' ? mk.pos() : mk.pos;
      if (!p) continue;
      g.save(); g.translate(X(p.x), Y(p.z)); g.rotate(Math.PI / 4);
      g.strokeStyle = mk.kind === 'threat' ? '#ff5b2e' : mk.kind === 'ally' ? '#7fc6ff' : mk.kind === 'poi' ? '#8fd2c6' : '#e0913c';
      g.lineWidth = 2; g.strokeRect(-5, -5, 10, 10); g.restore();
    }
    // the frame
    const pl = ctx.player;
    if (pl?.active) {
      g.save(); g.translate(X(pl.pos.x), Y(pl.pos.z)); g.rotate(-pl.yaw);
      g.fillStyle = '#e9e3d3'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = 'rgba(233,227,211,.7)'; g.font = '600 12px "IBM Plex Mono",monospace'; g.fillText('N', W - 18, 18);
    // scale bar: 500 m
    g.fillStyle = 'rgba(233,227,211,.6)'; g.fillRect(14, H - 16, 500 * sc, 2);
    g.font = '500 10px "IBM Plex Mono",monospace'; g.fillText('500 M', 14, H - 22);
  }

  const flow = {
    state: 'boot',
    levelId: null,
    def: null,
    /** extra: the last Morning Count shown (tests) */
    lastCount: null,
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
      heldEnd = null;
      set('loading');
      clearOverlays();
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
      ctx.audio?.duck?.(0.5, 0.3);
      const token = ++menuToken;
      (async () => {
        while (flow.state === 'paused' && token === menuToken) {
          const r = await S().showPause({
            title: flow.def?.title || '', objectives: ctx.mission?.objectives() || [], commsLog: ctx.comms?.log || [],
            drawMap: ctx.world?.heightfield?.renderMap ? drawMap : undefined,
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
    update(dt) {
      if (flow.state === 'playing' && heldEnd) { const [kind, e] = heldEnd; heldEnd = null; (kind === 'complete' ? onComplete : onFailed)(e); return; }
      if (flow.state === 'playing' && ctx.input.pressed(ACT.PAUSE)) { flow.pause(); return; }
      // §7.4: suggest a lower tier if the median frame time over the first 10 s of play exceeds 22 ms (never silently)
      if (flow.state === 'playing' && !perf.done && !ctx.debugPaused) {
        perf.t += dt; perf.samples.push(dt);
        if (perf.t >= 10) {
          perf.done = true;
          const s = perf.samples.slice().sort((a, b) => a - b), med = s[s.length >> 1] || 0;
          if (med > 0.022 && ctx.tier.name !== 'low' && !ctx.forcedTier) H()?.hint('Frame rate is low. A lower graphics quality in Settings may help.', 9);
        }
      }
    },
  };

  ctx.events.on('input:focuslost', () => { if (flow.state === 'playing') flow.pause(); });
  ctx.events.on('player:died', () => {
    if (flow.state !== 'playing') return;
    set('dead');
    ctx.save.data.stats.deaths++;
    const dl = flow.def?.deathLine;
    const lines = Array.isArray(dl) ? dl : dl ? [dl] : DEATH_LINES;
    const line = lines[Math.floor(Math.random() * lines.length)];
    ctx.timers.after(2.6, () => { if (flow.state === 'dead') onDeathScreen(line).catch(e => { if (!e?._recorded) ctx.recordError('flow', e); }); });
  });
  /** a level end outside 'playing': held while suspended (handled back in 'playing'), otherwise dropped */
  function holdEnd(kind, e) {
    if (SUSPENDED[flow.state] && ctx.mission?.def && !heldEnd) heldEnd = [kind, e];
  }
  function onFailed({ reason }) {
    set('dead');
    onDeathScreen(reason || 'Mission failed.').catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
  }
  ctx.events.on('level:failed', (e) => {
    if (flow.state !== 'playing') { holdEnd('failed', e); return; }
    onFailed(e);
  });
  ctx.events.on('level:complete', (e) => {
    if (flow.state !== 'playing') { holdEnd('complete', e); return; }
    onComplete(e);
  });
  function onComplete({ levelId, result }) {
    const def = flow.def;
    set('complete');
    ctx.simRunning = false;
    ctx.input.exitPointerLock();
    const camp = def?.campaign || null;
    const unl = [...(def?.unlocks?.levels || []), ...(def?.unlocks?.parts || [])];
    if (camp && campaignP == null) campaignData();
    const token = ++menuToken;
    (async () => {
      set('debrief');
      H()?.show(false);
      ctx.music?.setTheme('debrief');
      let r;
      if (camp) {
        const data = await campaignData();
        if (token !== menuToken) return;
        writePending(levelId, result, data);   // A3.4: before the debrief
        ctx.save.completeLevel(levelId, result, def?.unlocks);
        const leg = data.legs?.[levelId] || {};
        const haul = (result.haul || []).map(id => LO.PARTS?.[id]?.name || id);
        const rows = [
          { label: 'Time', value: formatTime(result.time) },
          { label: 'Kills', value: String(result.kills ?? 0) },
          { label: 'Damage taken', value: String(Math.round(result.damageTaken || 0)) },
          { label: 'Haul', value: haul.length ? haul.join(', ') : '—' },
          { label: 'Sledges flagged', value: `${result.water ?? 0} / ${result.waterMax ?? 0}` },
          { label: 'Rank', value: result.rank || '-' },
        ];
        r = await S().showDebrief({ level: def, result, unlocks: [], title: leg.debriefTitle || def.title, rows,
                                    actions: [{ key: 'next', label: camp.bench === false ? 'Continue' : 'To the Bench' }] });
      } else {
        ctx.save.completeLevel(levelId, result, def?.unlocks);
        r = await S().showDebrief({ level: def, result, unlocks: unl });
      }
      if (token !== menuToken) return;
      teardown();
      if (camp) {
        if (camp.bench !== false) {
          if (Array.isArray(ctx.garage?.contexts) && ctx.garage.contexts.includes('bench')) {
            set('bench'); ctx.music?.setTheme('garage');
            await ctx.garage.open({ context: 'bench', levelId });
          } else benchFallback();
          if (token !== menuToken) return;
        }
        set('count');
        ctx.pipeline?.setView(ctx.garage.scene, ctx.garage.camera);
        await runCount(levelId, token);
        if (token !== menuToken) return;
      }
      if (def?.outro?.length) { set('interstitial'); await S().showInterstitial(def.outro, { skippable: true }); }
      if (token !== menuToken) return;
      if (r === 'next') {
        const nx = nextLevel(levelId);
        const open = nx && !!ctx.save.data.progress.levels[nx]?.unlocked;
        if (nx && (open || !camp)) { const t2 = ++menuToken; titleView(); if (await briefing(nx, t2)) return; }
        else if (!nx && !camp) { set('credits'); titleView(); await S().showCredits({ lines: CREDITS }); }
      } else if (r === 'garage') { set('garage'); titleView(); await ctx.garage.open({ context: 'title' }); }
      await flow.toTitle();
    })().catch(e => { if (!e?._recorded) ctx.recordError('flow', e); });
  }
  ctx.addSystem({ name: 'flow', phase: 'early', when: 'always', update: (dt) => flow.update(dt) });
  ctx.flow = flow;
  return flow;
}
