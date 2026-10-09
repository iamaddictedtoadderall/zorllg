// ui/hud.js (P5) — P0 STUB: show/hide; AP/EN numbers and bars; objectives list; hint/warn text; mission timer;
// weapon readouts (+ touch labels); zone card and checkpoint toast text; fade and letterbox work. Lock box, markers,
// compass, radar, boss bar, choice and glitch are no-ops.
//
// Promises that gate sim logic (§1.4). choice() and fade() return simDeferred() promises (core/util.js) because mission
// lists and shots block on them. Such a promise MUST also count SIM time, never the real dt of the 'hud' system: 'hud'
// runs 'always', also while the game is paused, so a countdown there would let a waiting action list run on during the
// pause (a { complete } reached while paused is lost and the level can never finish).
//  · fade(to, seconds, o?): the #fade CSS transition is visual only. The promise counts down on the clock that was
//    running when the fade started: sim time when ctx.simRunning (or o.clock === 'sim'), in the 'hud-sim' system
//    (ui phase, when 'sim'), so it freezes while paused and scales with ctx.timeScale; real time otherwise (menus, or
//    o.clock === 'real'), in the 'hud' system. The mission's fade action passes { clock: 'sim' } because def.start runs
//    during loading. A superseded fade counts as finished.
//  · the real choice() (P5) MUST settle inside a sim tick: read INTERACT/ALT and count `seconds` down in a 'sim' system
//    such as 'hud-sim' (or with ctx.timers), so the prompt and its timeout freeze while paused, then resolve with the key.
import { formatTime, esc, simDeferred, simResolved } from '../core/util.js';

const SLOT4 = ['R', 'L', 'S', 'U'];
const SLOT_TOUCH = { R: 'fire', L: 'blade', S: 'msl', U: 'kit' };

export function install(ctx) {
  const $ = (s) => document.querySelector(s);
  const el = {
    hud: $('#hud'), mname: $('#mname'), objs: $('#objs'), timer: $('#timer'),
    apNum: $('#apNum'), apFill: $('#apFill'), enFill: $('#enFill'), enTxt: $('#enTxt'), enLbl: $('#enLbl'), stFill: $('#stFill'),
    warn: $('#warn'), hint: $('#hint'), killfeed: $('#killfeed'), hitmark: $('#hitmark'), vignette: $('#vignette'),
    fade: $('#fade'), letterbox: $('#letterbox'), zonecard: $('#zonecard'), toast: $('#checkpointToast'), prompt: $('#prompt'),
    progress: $('#progress'), callsign: $('#callsign'), frameName: $('#frameName'), frameSub: $('#frameSub'),
    w: { R: $('#wR'), L: $('#wL'), S: $('#wS'), U: $('#wK') },
  };
  const warnings = new Map();
  let hintT = 0, killT = 0, hitT = 0, hurtLevel = 0, zoneT = 0, toastT = 0, lastWarnHTML = '', lastWeapons = null;
  let fadeLeft = 0, fadeDone = null, fadeClock = 'real';
  /** counts the pending fade down when it runs on `clock` ('sim' from 'hud-sim', 'real' from 'hud') */
  const tickFade = (clock, dt) => {
    if (!fadeDone || fadeClock !== clock) return;
    fadeLeft -= dt;
    if (fadeLeft <= 0) { const f = fadeDone; fadeDone = null; f(); }   // settles inside this tick
  };
  const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
  const setW = (e, f) => { if (e) e.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(2) + '%'; };

  const api = {
    markers: [],
    show(on) { if (el.hud) el.hud.hidden = !on; },
    setMission(title, sub) { setText(el.mname, sub ? `${title} · ${sub}` : String(title ?? '')); },
    setObjectives(list = []) {
      if (!el.objs) return;
      el.objs.innerHTML = list.filter(o => o.state !== 'hidden').map(o => {
        const prog = o.progress ? ` · ${o.progress.cur} / ${o.progress.max}` : '';
        return `<li class="${o.state === 'done' ? 'done' : o.state === 'failed' ? 'failed' : ''}${o.optional ? ' opt' : ''}">${esc(o.text)}${prog}</li>`;
      }).join('');
    },
    hint(text, seconds = 7) {
      const t = text && typeof text === 'object' ? (ctx.input?.isTouch ? text.touch : text.desktop) : text;
      setText(el.hint, String(t ?? '')); hintT = seconds;
    },
    warn(text, seconds = 2, soft = false) { warnings.set(String(text), { t: seconds, soft }); },
    killfeed(text) { setText(el.killfeed, String(text)); killT = 1.6; },
    hitmark() { hitT = 0.12; },
    hurt(amount) { hurtLevel = Math.max(hurtLevel, Math.min(1, amount)); },
    zoneCard(title, sub = '') {
      if (!el.zonecard) return;
      setText(el.zonecard.querySelector('.t'), title); setText(el.zonecard.querySelector('.s'), sub);
      el.zonecard.classList.add('on'); zoneT = 4.5;
    },
    checkpointToast(label) { if (el.toast) { setText(el.toast, `CHECKPOINT · ${label}`); el.toast.classList.add('on'); toastT = 3; } },
    setMarkers(list) { api.markers = list || []; },
    progress(label, frac = 0) {
      if (!el.progress) return;
      el.progress.hidden = label == null;
      if (label != null) { setText(el.progress.querySelector('.pl'), label); setW(el.progress.querySelector('.bar i'), frac); }
    },
    prompt(text) {
      if (el.prompt) { el.prompt.hidden = !text; setText(el.prompt.querySelector('span'), text || ''); }
      ctx.input?.showTouchButton?.('interact', !!text);
    },
    choice(def) { return simResolved(null); },
    bossBar(t, title) { /* stub */ },
    setCallsign(name, sub, frame) {
      if (name != null) setText(el.callsign, name);
      if (sub != null) setText(el.frameSub, sub);
      if (frame != null) setText(el.frameName, frame);
    },
    glitch(level) { /* stub */ },
    letterbox(on, seconds = 0.6) {
      if (!el.letterbox) return;
      el.letterbox.style.setProperty('--lb-t', `${seconds}s`);
      el.letterbox.classList.toggle('on', !!on);
    },
    /** o.clock: 'sim' | 'real' (default: the clock running now; see the header) */
    fade(to, seconds = 1, o) {
      const prev = fadeDone; fadeDone = null;
      if (el.fade) {
        el.fade.style.transitionDuration = `${Math.max(0, seconds)}s`;
        el.fade.style.opacity = String(to);
      }
      let p;
      if (!el.fade || !(seconds > 0)) p = simResolved();
      else {
        const d = simDeferred();
        fadeDone = d.resolve; fadeLeft = seconds;
        fadeClock = o && (o.clock === 'sim' || o.clock === 'real') ? o.clock : (ctx.simRunning ? 'sim' : 'real');
        p = d.promise;
      }
      prev?.();   // a superseded fade counts as finished (settled after the new one is in place, so its waiter may start another)
      return p;
    },
    update(dt) {
      tickFade('real', dt);
      hintT -= dt; killT -= dt; hitT -= dt; zoneT -= dt; toastT -= dt;
      hurtLevel = Math.max(0, hurtLevel - dt * 2.2);
      if (ctx.pipeline?.grade) ctx.pipeline.grade.hurt = hurtLevel;
      if (!el.hud || el.hud.hidden) return;
      const p = ctx.player;
      if (p && p.active) {
        setText(el.apNum, String(Math.ceil(p.ap)));
        el.apNum?.classList.toggle('low', p.ap < p.apMax * 0.3);
        setW(el.apFill, p.ap / p.apMax);
        setW(el.enFill, p.en / p.enMax);
        el.enLbl?.classList.toggle('over', p.overheat > 0);
        el.enLbl?.parentElement?.classList.toggle('over', p.overheat > 0);
        setText(el.enTxt, p.overheat > 0 ? 'RECHARGING' : '');
        setW(el.stFill, p.stagT > 0 ? 1 : (p.imp || 0) / (p.impMax || 1));
        // weapons
        if (p.weapons !== lastWeapons) {   // the player replaces the weapons object on every setLoadout
          lastWeapons = p.weapons;
          setText(el.frameName, `Frame · ${p.stats?.name || ''}`);
          for (const s of SLOT4) {
            const wn = el.w[s]?.querySelector('.wn'), w = p.weapons?.[s];
            if (wn && wn.firstChild && w) wn.firstChild.textContent = w.part.name;
          }
        }
        for (const s of SLOT4) {
          const w = p.weapons?.[s]; if (!w || !el.w[s]) continue;
          const r = w.readout();
          setText(el.w[s].querySelector('.wv'), r.label);
          el.w[s].classList.toggle('cool', r.cooling);
          const act = SLOT_TOUCH[s];
          // prototype touch labels: ammo, blade cooldown only, missile cooldown or count, kit count
          const tl = s === 'L' ? (r.cooling ? r.label : '') : s === 'S' ? (r.cooling ? r.label : String(w.ammo)) : String(w.ammo);
          ctx.input?.setTouchLabel?.(act, tl, r.cooling || r.empty);
        }
        if (p.ap < p.apMax * 0.25 && p.alive) api.warn(ctx.input?.isTouch ? 'AP CRITICAL · TAP KIT' : 'AP CRITICAL · R TO REPAIR', 0.2, true);
      }
      setText(el.timer, formatTime(ctx.mission?.elapsed ?? 0));
      let wh = '';
      for (const [k, w] of warnings) { w.t -= dt; if (w.t <= 0) warnings.delete(k); else wh += `<div class="${w.soft ? 'soft' : ''}">${esc(k)}</div>`; }
      if (wh !== lastWarnHTML && el.warn) { el.warn.innerHTML = wh; lastWarnHTML = wh; }
      if (el.hint) el.hint.style.opacity = hintT > 0 ? '1' : '0';
      if (el.killfeed) el.killfeed.style.opacity = killT > 0 ? '1' : '0';
      if (el.hitmark) el.hitmark.style.opacity = hitT > 0 ? '1' : '0';
      if (el.vignette) el.vignette.style.opacity = String(hurtLevel + (p && p.active && p.ap < p.apMax * 0.25 ? 0.25 : 0));
      if (zoneT <= 0) el.zonecard?.classList.remove('on');
      if (toastT <= 0) el.toast?.classList.remove('on');
    },
  };
  // sim-clock countdowns (fade; P5: choice) run in a 'sim' system so they freeze while the game is paused
  ctx.addSystem({ name: 'hud-sim', phase: 'ui', when: 'sim', order: -1, update: (dt) => tickFade('sim', dt) });
  ctx.addSystem({ name: 'hud', phase: 'ui', when: 'always', update: (dt) => api.update(dt) });
  ctx.hud = api;
  return api;
}
