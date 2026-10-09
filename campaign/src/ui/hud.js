// ui/hud.js (P5): the in-level HUD. Port of the prototype HUD (AP/EN/stagger, weapon readouts and touch labels, lock
// box, markers with edge arrows, compass, heading-up radar, missile alert, low-AP warning, hurt vignette, hit marker,
// kill feed, hints, warnings) plus the arch additions (boss bar, interaction prompt, zone card, checkpoint toast,
// letterbox, fade, choice) and the addendum A5.2 additions: pilot vitals, panels, weapon slots with ability gating,
// the TEAR prompt and the Haul rack, choice with up to four options, prompt options and the blocked-hit flash.
//
// Clocks (§1.4). The 'hud' system runs always on real dt (it draws while paused). Promises that gate sim logic count
// SIM time in the 'hud-sim' system (ui phase, when 'sim'), so they freeze while paused:
//  · fade(to, seconds, o?): the promise counts down on the clock that was running when the fade started (or
//    o.clock 'sim' | 'real'); a superseded fade counts as finished.
//  · choice(def): read in 'hud-sim' (INTERACT/ALT, Digit1..4, gamepad Y/X, clicks and taps are latched and consumed
//    there); the countdown runs on unscaled sim time (dt / timeScale), so it works at any ctx.timeScale (R9) and
//    freezes while paused. Resolves with the option key, or `default ?? null` on timeout.
import * as THREE from 'three';
import { formatTime, esc, simDeferred, simResolved, injectCSS, clamp, damp, lerp, smooth, angWrap } from '../core/util.js';
import * as LO from '../combat/loadout.js';

const SLOT4 = ['R', 'L', 'S', 'U'];
const SLOT_KEY = { R: 'R', L: 'L', S: 'S', U: 'K' };                 // setSlots uses K for the utility slot
const SLOT_TOUCH = { R: 'fire', L: 'blade', S: 'msl', U: 'kit' };
const SLOT_ABILITY = { R: 'fire', L: 'blade', S: 'missile', U: 'kit' };
const PANELS = ['ap', 'en', 'weapons', 'radar', 'compass', 'objectives', 'lock', 'rack'];
const RADAR_RANGE = 320;                                              // metres from the centre to the rim
const OBJ_LINGER = 6;                                                 // seconds a done/failed objective stays listed
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _scr = { x: 0, y: 0, behind: false };

const HUD_CSS = `
#hud.hide-ap #status .row,#hud.hide-ap #status .apb,#hud.hide-ap #status .stb{visibility:hidden}
#hud.hide-en #status .enb,#hud.hide-en #enLbl{visibility:hidden}
#hud.hide-weapons #weapons,#hud.hide-radar #radar,#hud.hide-compass #compass,#hud.hide-objectives #objpanel,
#hud.hide-lock #lockbox{display:none!important}
#hud.cine>*:not(#vignette):not(#glitch):not(#scan){opacity:0!important;transition:opacity .35s}
#hud>*{transition:opacity .35s}
#game.cine #touch .tb:not(#tSkip):not(#tPause){opacity:0;pointer-events:none}
#objpanel .mrow{display:flex;gap:10px;align-items:baseline}
#objs li{transition:opacity .6s,color .4s}
#objs li .pg{font-family:var(--f-mono);font-size:13px;letter-spacing:0;color:var(--hud-dim);margin-left:2px}
#objs li .tg{font-size:10px;letter-spacing:.2em;color:var(--hud-dim);border:1px solid var(--hud-faint);padding:0 4px;transform:translateY(-2px)}
#objs li.new{animation:hudObjIn 1.8s ease-out}
#objs li.new::before{animation:hudObjDot 1.8s ease-out}
@keyframes hudObjIn{0%{opacity:0;transform:translateX(-10px)}10%{opacity:1;transform:none;color:var(--accent)}55%{color:var(--accent)}100%{color:var(--hud)}}
@keyframes hudObjDot{0%,55%{background:var(--accent);border-color:var(--accent)}}
#objs li.done{animation:hudObjDone 1.2s ease-out}
@keyframes hudObjDone{0%{color:var(--ok)}100%{color:var(--hud-dim)}}
#objs li.fading{opacity:0}
#markers .mk{transition:opacity .25s}
#markers .mk .d{display:block;margin-top:1px;font-family:var(--f-mono);font-size:10px;color:var(--hud-dim)}
#markers .mk.objective b{border-color:var(--accent);background:rgba(224,145,60,.16)}
#markers .mk.objective span{color:var(--accent)}
#markers .mk.waypoint b{border-color:var(--hud);border-radius:50%;transform:none}
#markers .mk.poi b{border-color:var(--en)}
#markers .mk.poi span{color:var(--en)}
#markers .mk.ally span{color:var(--ally)}
#markers .mk.threat b{width:9px;height:9px}
#markers .mk.threat span{color:var(--threat)}
#markers .mk.edge span.l{display:none}
#markers .mk .arw{position:absolute;left:50%;top:50%;width:0;height:0;margin:-24px 0 0 -6px;border:6px solid transparent;border-bottom:9px solid var(--accent);border-top:0;transform-origin:6px 24px;display:none}
#markers .mk.edge .arw{display:block}
#markers .mk.threat .arw{border-bottom-color:var(--threat)}
#markers .mk.ally .arw{border-bottom-color:var(--ally)}
#markers .mk.poi .arw{border-bottom-color:var(--en)}
#compass .cm{position:absolute;bottom:2px;width:7px;height:7px;margin-left:-3.5px;border:1.5px solid var(--accent);transform:rotate(45deg);opacity:.95}
#compass .cm.poi{border-color:var(--en)}
#compass .cm.threat{border-color:var(--threat)}
#compass .cm.ally{border-color:var(--ally)}
#compass .cm.clip{opacity:.45}
#compassStrip span.t{color:var(--hud-faint);font-size:9px;top:9px}
#prompt{overflow:hidden;min-width:120px}
#prompt .hold{font-family:var(--f-mono);font-size:10px;letter-spacing:.12em;color:var(--hud-dim)}
#prompt .pb{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--hud-faint)}
#prompt .pb i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--en)}
#prompt.tear{border-left-color:var(--accent)}
#prompt.tear .pb i{background:var(--accent)}
#prompt.tear span:not(.hold){color:var(--accent);font-weight:700;letter-spacing:.3em}
#choice{pointer-events:none;width:min(780px,94vw);top:56%}
#hud.choosing #prompt,#hud.choosing #killfeed,#hud.choosing #progress,#hud.choosing #hint{visibility:hidden}
#choice .opts{flex-wrap:nowrap}
#choice .opt{white-space:nowrap}
#game.touch #choice .opts{flex-wrap:wrap}
#choice .opt{display:flex;align-items:center;gap:0;font-family:var(--f-display);color:var(--hud);transition:border-color .15s,background .15s}
#choice .opt:hover,#choice .opt.pick{border-color:var(--accent);background:rgba(224,145,60,.18)}
#choice .opt.pick{color:var(--accent)}
#choice .t{text-shadow:0 0 14px rgba(255,91,46,.35)}
#weapons .wpn{transition:background .3s}
#weapons .wpn.off .wn{text-decoration:line-through;text-decoration-thickness:1px;color:var(--hud-dim)}
#weapons .wpn.off .wv{color:var(--hud-dim);font-size:11px;letter-spacing:.14em}
#weapons .wpn.online{animation:hudOnline 1.2s ease-out}
@keyframes hudOnline{0%{background:rgba(143,210,198,.45)}100%{background:transparent}}
#weapons .wpn.online .wn{animation:hudOnlineTx 1.2s ease-out}
@keyframes hudOnlineTx{0%,40%{color:var(--en)}}
#vitals{position:absolute;right:calc(100% + 22px);bottom:-2px;width:132px;display:grid;grid-template-columns:auto 1fr;gap:0 8px;align-items:end}
#vitals .vl{grid-column:1/3;font-size:10px;letter-spacing:.3em;color:var(--hud-dim);display:flex;justify-content:space-between}
#vitals canvas{grid-column:1/3;width:132px;height:30px;display:block;margin:3px 0 2px}
#vitals .bpm{font-family:var(--f-mono);font-size:22px;font-weight:600;line-height:1}
#vitals .u{font-size:10px;letter-spacing:.24em;color:var(--hud-dim);align-self:end;padding-bottom:2px}
#vitals .ft{grid-column:1/3;font-family:var(--f-mono);font-size:10px;letter-spacing:.1em;color:var(--threat);min-height:12px;margin-top:2px}
#vitals.flat .bpm{color:var(--threat)}
#vitals.flat .ft{animation:hudBlink .6s steps(2) infinite}
@keyframes hudBlink{50%{opacity:.2}}
#rack{position:absolute;right:28px;bottom:186px;width:350px}
#rack .rh{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.24em;color:var(--hud-dim);border-bottom:1px solid var(--hud-faint);padding-bottom:4px}
#rack .rh b{font-family:var(--f-mono);font-weight:500;letter-spacing:.04em;color:var(--accent)}
#rack .rs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
#rack .rc{display:flex;align-items:center;gap:7px;min-width:0;height:24px;padding:0 8px;border:1px solid var(--hud-faint);background:rgba(12,11,14,.35);font-size:13px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
#rack .rc i{flex:none;width:7px;height:7px;border-radius:50%;background:#ffbf4a;box-shadow:0 0 8px #ffbf4a}
#rack .rc span{overflow:hidden;text-overflow:ellipsis}
#rack .rc.empty{color:var(--hud-faint)}
#rack .rc.empty i{background:transparent;box-shadow:none;border:1px solid var(--hud-faint)}
#rack .rc.in{animation:hudRackIn 1s ease-out}
@keyframes hudRackIn{0%{border-color:#ffbf4a;background:rgba(255,191,74,.35)}}
#cineSkip{position:absolute;right:calc(28px + var(--safe-r));bottom:calc(11vh + 12px);z-index:3;pointer-events:none;font:500 11px var(--f-mono);letter-spacing:.14em;color:var(--hud-dim);text-transform:uppercase;text-align:right}
#cineSkip .sb{margin-top:5px;height:2px;width:120px;margin-left:auto;background:var(--hud-faint);position:relative;overflow:hidden}
#cineSkip .sb i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--hud)}
#lockbox .frame{transition:border-width .1s}
#lockbox .info .dist{letter-spacing:.06em}
#bossbar .nm{text-shadow:0 0 12px rgba(255,91,46,.35)}
#bossbar .bar{height:7px;background:rgba(233,227,211,.12)}
#bossbar .bar i{transition:width .15s}
#bossbar .bar b{position:absolute;left:0;top:0;bottom:0;background:rgba(255,190,150,.55);transition:width .6s .25s}
#hud.blocked #vignette{background:radial-gradient(ellipse at center,transparent 50%,rgba(143,210,198,.4) 100%)}
#game.touch #vitals{right:calc(100% + 10px);width:84px}
#game.touch #vitals canvas{width:84px;height:22px}
#game.touch #vitals .bpm{font-size:16px}
#game.touch #rack{right:calc(14px + var(--safe-r));top:124px;bottom:auto;width:min(300px,36vw)}
#game.touch #rack .rc{font-size:11px;padding:0 5px;height:20px}
#game.touch #cineSkip{display:none}
@media (max-width:760px){#rack{width:260px;bottom:150px}#vitals{display:none}}
`;

export function install(ctx) {
  injectCSS('hud', HUD_CSS);
  const $ = (s) => document.querySelector(s);
  const game = $('#game');
  const el = {
    hud: $('#hud'), mname: $('#mname'), objs: $('#objs'), timer: $('#timer'),
    apNum: $('#apNum'), apFill: $('#apFill'), enFill: $('#enFill'), enTxt: $('#enTxt'), enLbl: $('#enLbl'), stFill: $('#stFill'),
    status: $('#status'), warn: $('#warn'), hint: $('#hint'), killfeed: $('#killfeed'), hitmark: $('#hitmark'), vignette: $('#vignette'),
    glitch: $('#glitch'), fade: $('#fade'), letterbox: $('#letterbox'), zonecard: $('#zonecard'), toast: $('#checkpointToast'),
    prompt: $('#prompt'), progress: $('#progress'), choice: $('#choice'), bossbar: $('#bossbar'), lockbox: $('#lockbox'),
    markers: $('#markers'), compass: $('#compass'), strip: $('#compassStrip'), radar: $('#radar'),
    callsign: $('#callsign'), frameName: $('#frameName'), frameSub: $('#frameSub'), weapons: $('#weapons'),
    w: { R: $('#wR'), L: $('#wL'), S: $('#wS'), U: $('#wK') },
  };
  const mk = (tag, cls, parent, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent?.appendChild(e); return e; };
  const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
  const setW = (e, f) => { if (!e) return; const s = (Math.max(0, Math.min(1, f || 0)) * 100).toFixed(1) + '%'; if (e.style.width !== s) e.style.width = s; };
  const toggle = (e, c, on) => { if (e && e.classList.contains(c) !== !!on) e.classList.toggle(c, !!on); };
  const show = (e, on) => { if (e && e.hidden === !!on) e.hidden = !on; };

  // ---------------------------------------------------------------- DOM additions
  // vitals (by the AP bar)
  const vitEl = mk('div', '', el.status, `<div class="vl"><span>PILOT</span><span class="vm"></span></div><canvas width="264" height="60"></canvas>
    <span class="bpm">--</span><span class="u">BPM</span><div class="ft"></div>`);
  vitEl.id = 'vitals'; vitEl.hidden = true;
  const vit = { canvas: vitEl.querySelector('canvas'), bpm: vitEl.querySelector('.bpm'), ft: vitEl.querySelector('.ft') };
  vit.g = vit.canvas.getContext('2d');
  // haul rack (by the weapons panel)
  const rackEl = mk('div', '', el.hud, `<div class="rh"><span>HAUL</span><b>0 / 3</b></div><div class="rs"></div>`);
  rackEl.id = 'rack'; rackEl.hidden = true;
  const rackCount = rackEl.querySelector('.rh b'), rackCells = [];
  for (let i = 0; i < 3; i++) rackCells.push(mk('div', 'rc empty', rackEl.querySelector('.rs'), '<i></i><span>—</span>'));
  // skip indicator for skippable shots
  const skipEl = mk('div', '', game, `<div class="st">Hold <b>Space</b> to skip</div><div class="sb"><i></i></div>`);
  skipEl.id = 'cineSkip'; skipEl.hidden = true;
  const skipBar = skipEl.querySelector('.sb i');
  // prompt: key, text, hold tag, progress bar
  if (el.prompt) {
    el.prompt.innerHTML = '<kbd>F</kbd><span class="pt"></span><span class="hold"></span><div class="pb"><i></i></div>';
  }
  const pr = { kbd: el.prompt?.querySelector('kbd'), text: el.prompt?.querySelector('.pt'), hold: el.prompt?.querySelector('.hold'),
               bar: el.prompt?.querySelector('.pb'), fill: el.prompt?.querySelector('.pb i') };
  // boss bar: a lagging damage bar behind the live one
  const bossFill = el.bossbar?.querySelector('.bar i');
  let bossLag = null;
  if (el.bossbar && bossFill) { bossLag = document.createElement('b'); bossFill.parentElement.insertBefore(bossLag, bossFill); }
  // compass strip: ticks every 15°, cardinal and intercardinal labels
  const PX_DEG = 3.5;
  if (el.strip) {
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let h = '';
    for (let d = -180; d <= 540; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const x = (d + 180) * PX_DEG;
      h += names[n] ? `<span class="${n % 90 === 0 ? 'c' : ''}" style="left:${x}px">${names[n]}</span>`
                    : `<span class="t" style="left:${x}px">${String(n).padStart(3, '0')}</span>`;
    }
    el.strip.innerHTML = h;
  }
  const compassMarks = [];
  for (let i = 0; i < 6; i++) { const c = mk('i', 'cm', el.compass); c.hidden = true; compassMarks.push(c); }
  // markers pool
  const markerEls = [];
  const markerEl = (i) => {
    if (markerEls[i]) return markerEls[i];
    const e = markerEls[i] = mk('div', 'mk', el.markers, '<i class="arw"></i><b></b><span class="l"></span><span class="d"></span>');
    e.style.left = '0px'; e.style.top = '0px';
    return e;
  };
  // radar
  const rg = el.radar ? el.radar.getContext('2d') : null;

  // ---------------------------------------------------------------- state
  const warnings = new Map();
  let hintT = 0, killT = 0, hitT = 0, hurtLevel = 0, blockT = 0, zoneT = 0, toastT = 0, glitchT = 0, lastWarnHTML = '';
  let lastWeapons = null, lastFrameAuto = '', levelStartAt = -99, radarAcc = 0, bossAcc = 0, autoBoss = null, missileT = 0;
  let fadeLeft = 0, fadeDone = null, fadeClock = 'real';
  let markers = [];
  let explicitBoss = null, bossTitle = '', bossDeadT = 0;
  let callsignFrame = null;          // a frame tag set through setCallsign (the level's), else automatic
  let cine = false;
  const panels = { ap: true, en: true, weapons: true, radar: true, compass: true, objectives: true, lock: true, rack: false };
  const slots = { R: { state: 'auto', label: null }, L: { state: 'auto', label: null }, S: { state: 'auto', label: null }, U: { state: 'auto', label: null } };
  const slotGated = { R: false, L: false, S: false, U: false };
  const objSeen = new Map();         // id → { state, at (real time of the last state change) }
  let objList = [];
  let basePrompt = null;             // { text, key, hold, progress } from prompt()
  let shownPrompt = '';
  let lastRack = '';
  // vitals
  const V = { mode: 'hidden', override: null, spikeN: null, spikeT: 0, decay: 8, fault: null, cur: 80, phase: 0, beatVar: 1,
              buf: new Float32Array(264), head: 0, acc: 0, shown: '', lastBeat: 0 };
  // choice
  const CH = { def: null, resolve: null, left: 0, total: 0, picked: null, latch: [], padPrev: [false, false] };

  /** counts the pending fade down when it runs on `clock` ('sim' from 'hud-sim', 'real' from 'hud') */
  const tickFade = (clock, dt) => {
    if (!fadeDone || fadeClock !== clock) return;
    fadeLeft -= dt;
    if (fadeLeft <= 0) { const f = fadeDone; fadeDone = null; f(); }   // settles inside this tick
  };

  // ---------------------------------------------------------------- vitals
  function beatShape(ph) {
    // one heartbeat (phase 0..1): P wave, QRS complex, T wave
    const g = (c, w) => Math.exp(-((ph - c) * (ph - c)) / (2 * w * w));
    return 0.12 * g(0.12, 0.03) - 0.14 * g(0.285, 0.008) + 1.0 * g(0.305, 0.009) - 0.28 * g(0.33, 0.01) + 0.24 * g(0.56, 0.05);
  }
  function liveTarget() {
    const p = ctx.player;
    const ci = ctx.enemies?.combatIntensity?.() ?? 0;
    const apf = p && p.apMax > 0 ? clamp(p.ap / p.apMax, 0, 1) : 1;
    return clamp(74 + 42 * ci + 24 * (1 - apf), 62, 175);
  }
  function updateVitals(dt) {
    const mode = V.mode;
    if (mode === 'hidden') { show(vitEl, false); return; }
    show(vitEl, true);
    let bpm;
    if (mode === 'flat') bpm = null;
    else if (mode === 'locked') { bpm = V.override ?? 60; V.cur = bpm; }
    else {
      let target = V.override ?? liveTarget();
      let k = 0.6;
      if (V.spikeN != null) {
        V.spikeT += dt;
        const f = V.spikeT / Math.max(0.1, V.decay);
        if (f >= 1) V.spikeN = null;
        else { target = lerp(V.spikeN, target, smooth(0, 1, f)); k = 8; }
      }
      V.cur = clamp(damp(V.cur, target, k, dt), 40, 190);
      bpm = V.cur;
    }
    // trace: 120 px/s across a 264 px buffer with a gap ahead of the write head
    const g = vit.g, W = 264, H = 60;
    V.acc += dt * 120;
    let n = Math.min(W, Math.floor(V.acc)); V.acc -= n;
    const beatTime = mode === 'locked' ? (ctx.materials?.uniforms?.uBeat?.value ?? ctx.clock.time) : null;
    while (n-- > 0) {
      let y = 0;
      if (mode === 'locked') {
        const t = beatTime - (n / 120);
        y = beatShape(((t * (bpm / 60)) % 1 + 1) % 1);
      } else if (mode === 'live') {
        V.phase += (bpm / 60) / 120 / V.beatVar;
        if (V.phase >= 1) { V.phase -= 1; V.beatVar = 1 + (Math.random() * 2 - 1) * 0.04; }
        y = beatShape(V.phase);
      }
      V.buf[V.head] = y; V.head = (V.head + 1) % W;
    }
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(233,227,211,.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, H * 0.62); g.lineTo(W, H * 0.62); g.stroke();
    g.strokeStyle = mode === 'flat' ? '#ff5b2e' : '#e9e3d3';
    g.lineWidth = 2.2; g.lineJoin = 'round';
    g.shadowColor = g.strokeStyle; g.shadowBlur = 6;
    g.beginPath();
    let pen = false;
    for (let i = 0; i < W; i++) {
      const idx = (V.head + i) % W;
      if (i < 10) { pen = false; continue; }   // the gap just ahead of the write head
      const y = H * 0.62 - V.buf[idx] * H * 0.5;
      if (!pen) { g.moveTo(i, y); pen = true; } else g.lineTo(i, y);
    }
    g.stroke(); g.shadowBlur = 0;
    const txt = bpm == null ? '--' : String(Math.round(bpm));
    setText(vit.bpm, txt);
    setText(vit.ft, mode === 'flat' ? (V.fault ?? 'SENSOR FAULT') : (V.fault || ''));
    toggle(vitEl, 'flat', mode === 'flat');
  }

  // ---------------------------------------------------------------- objectives
  function renderObjectives() {
    if (!el.objs) return;
    const now = ctx.clock.realTime;
    const vis = objList.filter(o => o.state !== 'hidden');
    // keep the DOM in list order; add, update or remove items by id
    const want = new Set(vis.map(o => o.id));
    for (const li of [...el.objs.children]) if (!want.has(li.dataset.id)) li.remove();
    let prev = null;
    for (const o of vis) {
      let li = el.objs.querySelector(`li[data-id="${CSS.escape(o.id)}"]`);
      const seen = objSeen.get(o.id);
      if (!li) {
        li = document.createElement('li'); li.dataset.id = o.id;
        if (!seen || seen.state === 'hidden') li.classList.add('new');
      }
      if (!seen || seen.state !== o.state) objSeen.set(o.id, { state: o.state, at: now });
      const prog = o.progress ? `<span class="pg">· ${o.progress.cur} / ${o.progress.max}</span>` : '';
      const tm = o.timer != null ? `<span class="pg">· ${formatTime(Math.ceil(o.timer))}</span>` : '';
      const html = `${o.optional ? '<span class="tg">OPT</span> ' : ''}<span class="tx">${esc(o.text)}</span>${prog}${tm}`;
      if (li.innerHTML !== html) li.innerHTML = html;
      li.dataset.state = o.state;
      toggle(li, 'done', o.state === 'done'); toggle(li, 'failed', o.state === 'failed'); toggle(li, 'opt', !!o.optional);
      const at = prev ? prev.nextSibling : el.objs.firstChild;
      if (li !== at) el.objs.insertBefore(li, at);
      prev = li;
    }
  }
  function tickObjectives() {
    if (!el.objs) return;
    const now = ctx.clock.realTime;
    for (const li of el.objs.children) {
      const s = objSeen.get(li.dataset.id);
      const old = s && (s.state === 'done' || s.state === 'failed') && now - s.at > OBJ_LINGER;
      toggle(li, 'fading', old);
      if (old && now - s.at > OBJ_LINGER + 0.7 && !li.hidden) li.hidden = true;
      if (li.classList.contains('new') && s && now - s.at > 1.9) li.classList.remove('new');
    }
  }

  // ---------------------------------------------------------------- weapons, slots, rack, prompt
  function updateWeapons(p) {
    if (p.weapons !== lastWeapons) {   // the player replaces the weapons object on every setLoadout
      lastWeapons = p.weapons;
      for (const s of SLOT4) {
        const wn = el.w[s]?.querySelector('.wn'), w = p.weapons?.[s];
        if (wn && wn.firstChild && w) wn.firstChild.textContent = slots[s].label ?? w.part.name;
      }
    }
    const ab = p.abilities;
    const recent = ctx.clock.realTime - levelStartAt < 1;
    for (const s of SLOT4) {
      const e = el.w[s]; if (!e) continue;
      const cfg = slots[s], w = p.weapons?.[s];
      const gated = cfg.state === 'offline' || (cfg.state === 'auto' && !!ab && ab[SLOT_ABILITY[s]] === false);
      const hidden = cfg.state === 'hidden';
      show(e, !hidden);
      if (slotGated[s] && !gated && !recent) {
        e.classList.remove('online'); void e.offsetWidth; e.classList.add('online');
        api.glitch(0.3); ctx.audio?.play?.('confirm', null);
      }
      slotGated[s] = gated;
      toggle(e, 'off', gated);
      const wn = e.querySelector('.wn');
      const name = cfg.label ?? w?.part?.name ?? '';
      if (wn?.firstChild && wn.firstChild.textContent !== name) wn.firstChild.textContent = name;
      const act = SLOT_TOUCH[s];
      if (gated) {
        setText(e.querySelector('.wv'), 'OFFLINE'); toggle(e, 'cool', false);
        ctx.input?.setTouchLabel?.(act, 'OFF', true);
        continue;
      }
      if (!w) continue;
      const r = w.readout();
      setText(e.querySelector('.wv'), r.label);
      toggle(e, 'cool', r.cooling);
      // prototype touch labels: ammo, blade cooldown only, missile cooldown or count, kit count
      const tl = s === 'L' ? (r.cooling ? r.label : '') : s === 'S' ? (r.cooling ? r.label : String(w.ammo)) : String(w.ammo);
      ctx.input?.setTouchLabel?.(act, tl, r.cooling || r.empty);
    }
  }
  function partName(id) {
    const n = LO.PARTS?.[id]?.name || String(id || '');
    return n.length > 16 ? n.slice(0, 15) + '…' : n;
  }
  function updateRack() {
    const rack = ctx.haul?.rack || [];
    const cap = ctx.haul?.capacity ?? 3;
    const key = rack.join('|') + '#' + cap;
    if (key === lastRack) return;
    const before = lastRack ? lastRack.split('#')[0].split('|').filter(Boolean).length : 0;
    lastRack = key;
    setText(rackCount, `${rack.length} / ${cap}`);
    for (let i = 0; i < rackCells.length; i++) {
      const c = rackCells[i], id = rack[i];
      toggle(c, 'empty', !id);
      setText(c.querySelector('span'), id ? partName(id) : '—');
      c.title = id || '';
      if (id && i >= before && i < rack.length) { c.classList.remove('in'); void c.offsetWidth; c.classList.add('in'); }
    }
  }
  function renderPrompt() {
    const h = ctx.haul, p = ctx.player;
    const tear = h && h.candidate && h.enabled !== false && p?.abilities?.tear !== false && !p?.frozen;
    const cur = tear ? { text: 'TEAR', key: 'RMB', hold: true, progress: h.holdProgress || 0, tear: true } : basePrompt;
    if (!el.prompt) return;
    if (!cur || !cur.text) {
      if (shownPrompt !== '') { show(el.prompt, false); shownPrompt = ''; }
      ctx.input?.showTouchButton?.('interact', false);
      return;
    }
    const sig = `${cur.text}|${cur.key}|${cur.hold}|${!!cur.tear}`;
    if (sig !== shownPrompt) {
      shownPrompt = sig;
      setText(pr.kbd, cur.key || 'F');
      setText(pr.text, cur.text);
      setText(pr.hold, cur.hold ? 'HOLD' : '');
      toggle(el.prompt, 'tear', !!cur.tear);
      show(el.prompt, true);
    }
    const pg = cur.progress;
    if (pr.bar) pr.bar.style.display = pg != null && pg > 0 ? '' : 'none';
    setW(pr.fill, pg || 0);
    ctx.input?.showTouchButton?.('interact', !cur.tear);
    if (cur.tear) ctx.input?.setTouchLabel?.('blade', 'TEAR', false);
  }

  // ---------------------------------------------------------------- lock box, boss bar, markers, compass, radar
  function pxScale() {
    const h = ctx.canvas.clientHeight || innerHeight;
    return h / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
  }
  function updateLock(p) {
    const lb = el.lockbox; if (!lb) return;
    const t = p.lock;
    const rig = ctx.cameraRig;
    if (!t || !t.alive || !rig || !panels.lock) { if (lb.style.display !== 'none') lb.style.display = 'none'; return; }
    t.center(_v);
    rig.worldToScreen(_v, _scr);
    if (_scr.behind) { lb.style.display = 'none'; return; }
    const dist = _v.distanceTo(ctx.camera.position);
    const size = clamp((t.hitR || 3) * 2.6 * pxScale() / Math.max(1, dist), 44, 170);
    lb.style.display = 'block';
    lb.style.width = lb.style.height = size.toFixed(0) + 'px';
    lb.style.transform = `translate(${(_scr.x - size / 2).toFixed(1)}px,${(_scr.y - size / 2).toFixed(1)}px)`;
    toggle(lb, 'hard', !!p.hardLock);
    toggle(lb, 'ally', t.team === 'ally' || t.team === 'neutral');
    setText(lb.querySelector('.nm'), String(t.name || t.kind || '').toUpperCase());
    setW(lb.querySelector('.apb i'), t.apMax > 0 ? t.ap / t.apMax : 0);
    const imp = t.stagT > 0 ? 1 : (Number.isFinite(t.impMax) && t.impMax > 0 ? (t.imp || 0) / t.impMax : 0);
    setW(lb.querySelector('.stb i'), imp);
    const st = lb.querySelector('.stag'); if (st) { const d = t.stagT > 0 ? 'block' : 'none'; if (st.style.display !== d) st.style.display = d; }
    setText(lb.querySelector('.dist'), `${Math.round(p.pos.distanceTo(t.pos))} M`);
  }
  function updateBoss(dt) {
    if (!el.bossbar) return;
    bossAcc -= dt;
    if (!explicitBoss && bossAcc <= 0) {   // automatic: the nearest live boss within 450 m
      bossAcc = 0.25; autoBoss = null;
      const p = ctx.player;
      if (p?.active && ctx.combat) {
        let bd = 450 * 450;
        for (const t of ctx.combat.all()) {
          if (!t.alive || !t.boss || t === p) continue;
          const d = t.pos.distanceToSquared(p.pos);
          if (d < bd) { bd = d; autoBoss = t; }
        }
      }
    }
    const t = explicitBoss || autoBoss;
    if (!t) { show(el.bossbar, false); return; }
    if (!t.alive) {
      bossDeadT += dt;
      setW(bossFill, 0);
      if (bossDeadT > 1.6) { show(el.bossbar, false); if (explicitBoss === t) explicitBoss = null; }
      return;
    }
    bossDeadT = 0;
    show(el.bossbar, true);
    setText(el.bossbar.querySelector('.nm'), (explicitBoss ? bossTitle : '') || String(t.name || '').toUpperCase());
    const f = t.apMax > 0 ? t.ap / t.apMax : 0;
    setW(bossFill, f); setW(bossLag, f);
    toggle(el.bossbar, 'stag', t.stagT > 0);
  }
  function markerPos(m, out) {
    const p = typeof m.pos === 'function' ? m.pos() : m.pos;
    if (!p) return null;
    return out.copy(p);
  }
  function updateMarkers() {
    const rig = ctx.cameraRig, p = ctx.player;
    const W = ctx.canvas.clientWidth || innerWidth, H = ctx.canvas.clientHeight || innerHeight;
    const touch = ctx.input?.isTouch;
    const mx = touch ? 70 : 56, top = touch ? 70 : 92, bot = touch ? 120 : 150;
    let n = 0;
    for (const m of markers) {
      if (!rig || !markerPos(m, _v)) continue;
      const e = markerEl(n++);
      rig.worldToScreen(_v, _scr);
      const kind = m.kind || 'objective';
      if (e.dataset.kind !== kind) { e.className = 'mk ' + kind; e.dataset.kind = kind; }
      let x = _scr.x, y = _scr.y, edge = false;
      const cx = W / 2, cy = H / 2;
      if (_scr.behind || x < mx || x > W - mx || y < top || y > H - bot) {
        edge = true;
        let dx = x - cx, dy = y - cy;
        if (_scr.behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1 && Math.abs(dx) < 1) dy = 1; }
        const sx = (W / 2 - mx) / Math.max(1e-3, Math.abs(dx)), sy = ((dy < 0 ? cy - top : H - bot - cy)) / Math.max(1e-3, Math.abs(dy));
        const k = Math.min(sx, sy);
        x = cx + dx * k; y = cy + dy * k;
        const a = Math.atan2(dy, dx) + Math.PI / 2;
        const arw = e.firstChild; if (arw) arw.style.transform = `rotate(${a.toFixed(3)}rad)`;
      }
      toggle(e, 'edge', edge);
      e.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
      setText(e.children[2], String(m.label ?? ''));
      const d = p?.active ? Math.hypot(_v.x - p.pos.x, _v.z - p.pos.z) : _v.distanceTo(ctx.camera.position);
      setText(e.children[3], d >= 1000 ? `${(d / 1000).toFixed(1)} KM` : `${Math.round(d)} M`);
      if (e.hidden) e.hidden = false;
    }
    for (let i = n; i < markerEls.length; i++) if (!markerEls[i].hidden) markerEls[i].hidden = true;
  }
  function heading() {
    // compass heading = −yaw in degrees (§1.3), from the camera so it follows free and cinematic cameras too
    ctx.camera.getWorldDirection(_w);
    const yaw = Math.atan2(-_w.x, -_w.z);
    return ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  }
  function updateCompass() {
    if (!el.strip || !panels.compass) return;
    const hd = heading();
    el.strip.style.transform = `translateX(${(210 - (hd + 180) * PX_DEG).toFixed(1)}px)`;
    let n = 0;
    const p = ctx.player;
    for (const m of markers) {
      if (n >= compassMarks.length) break;
      if (m.kind === 'threat' || !markerPos(m, _v) || !p?.active) continue;
      const b = Math.atan2(_v.x - p.pos.x, -(_v.z - p.pos.z)) * 180 / Math.PI;   // bearing clockwise from north
      let rel = ((b - hd + 540) % 360) - 180;
      const clip = Math.abs(rel) > 58;
      rel = clamp(rel, -58, 58);
      const c = compassMarks[n++];
      c.style.left = (210 + rel * PX_DEG).toFixed(1) + 'px';
      c.className = 'cm ' + (m.kind || 'objective') + (clip ? ' clip' : '');
      c.hidden = false;
    }
    for (let i = n; i < compassMarks.length; i++) compassMarks[i].hidden = true;
  }
  function drawRadar(dt) {
    if (!rg || !panels.radar) return;
    radarAcc += dt;
    if (radarAcc < 1 / 30) return;
    radarAcc = 0;
    const p = ctx.player;
    const S = 336, C = S / 2, R = C - 10;
    rg.clearRect(0, 0, S, S);
    rg.save();
    rg.beginPath(); rg.arc(C, C, R, 0, Math.PI * 2);
    rg.fillStyle = 'rgba(12,11,14,.42)'; rg.fill();
    rg.lineWidth = 2; rg.strokeStyle = 'rgba(233,227,211,.28)'; rg.stroke();
    rg.clip();
    rg.strokeStyle = 'rgba(233,227,211,.10)'; rg.lineWidth = 1.5;
    for (const f of [0.33, 0.66]) { rg.beginPath(); rg.arc(C, C, R * f, 0, Math.PI * 2); rg.stroke(); }
    rg.beginPath(); rg.moveTo(C, C - R); rg.lineTo(C, C + R); rg.moveTo(C - R, C); rg.lineTo(C + R, C); rg.stroke();
    // sweep (cosmetic)
    const sw = (ctx.clock.realTime * 1.4) % (Math.PI * 2);
    const grd = rg.createConicGradient ? rg.createConicGradient(sw - Math.PI / 2 - 0.6, C, C) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(143,210,198,0)'); grd.addColorStop(0.095, 'rgba(143,210,198,.16)'); grd.addColorStop(0.1, 'rgba(143,210,198,0)');
      rg.fillStyle = grd; rg.fillRect(0, 0, S, S);
    }
    if (p?.active) {
      const yaw = p.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw), k = R / RADAR_RANGE;
      const toR = (x, z, out) => {
        const dx = x - p.pos.x, dz = z - p.pos.z;
        const f = -dx * sy - dz * cy, r = dx * cy - dz * sy;
        out[0] = C + r * k; out[1] = C - f * k; out[2] = Math.hypot(r, f) * k;
        return out;
      };
      const q = [0, 0, 0];
      // north tick
      toR(p.pos.x, p.pos.z - RADAR_RANGE, q);
      rg.fillStyle = 'rgba(233,227,211,.6)'; rg.font = '600 22px "IBM Plex Mono",monospace'; rg.textAlign = 'center'; rg.textBaseline = 'middle';
      const na = Math.atan2(q[1] - C, q[0] - C);
      rg.fillText('N', C + Math.cos(na) * (R - 16), C + Math.sin(na) * (R - 16));
      // units
      for (const u of ctx.enemies?.alive?.() || []) {
        toR(u.pos.x, u.pos.z, q);
        if (q[2] > R + 4) continue;
        const hostile = u.team === 'enemy';
        rg.fillStyle = u.team === 'ally' ? '#7fc6ff' : hostile ? '#ff5b2e' : 'rgba(233,227,211,.6)';
        const big = u.boss || u.kind === 'mech';
        rg.beginPath(); rg.arc(q[0], q[1], big ? 8 : 5.5, 0, Math.PI * 2); rg.fill();
        if (u === p.lock) { rg.strokeStyle = '#ff5b2e'; rg.lineWidth = 2; rg.strokeRect(q[0] - 10, q[1] - 10, 20, 20); }
      }
      // markers (clamped to the rim)
      for (const m of markers) {
        if (m.kind === 'threat' || !markerPos(m, _v)) continue;
        toR(_v.x, _v.z, q);
        if (q[2] > R - 10) { const a = Math.atan2(q[1] - C, q[0] - C); q[0] = C + Math.cos(a) * (R - 10); q[1] = C + Math.sin(a) * (R - 10); }
        rg.save(); rg.translate(q[0], q[1]); rg.rotate(Math.PI / 4);
        rg.strokeStyle = m.kind === 'poi' ? '#8fd2c6' : m.kind === 'ally' ? '#7fc6ff' : '#e0913c'; rg.lineWidth = 3;
        rg.strokeRect(-6, -6, 12, 12); rg.restore();
      }
    }
    // player chevron
    rg.fillStyle = '#e9e3d3';
    rg.beginPath(); rg.moveTo(C, C - 13); rg.lineTo(C + 9, C + 10); rg.lineTo(C, C + 5); rg.lineTo(C - 9, C + 10); rg.closePath(); rg.fill();
    rg.restore();
  }

  // ---------------------------------------------------------------- choice
  function renderChoice() {
    const c = CH.def, root = el.choice;
    if (!root) return;
    if (!c) { show(root, false); return; }
    setText(root.querySelector('.t'), String(c.title || '').toUpperCase());
    const opts = root.querySelector('.opts');
    opts.innerHTML = '';
    c.options.forEach((o, i) => {
      const b = document.createElement('div');
      b.className = 'opt'; b.dataset.key = o.key;
      b.innerHTML = `<kbd>${i + 1}</kbd>${esc(o.label)}`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); CH.latch.push(i); });
      opts.appendChild(b);
    });
    setW(root.querySelector('.bar i'), 1);
    show(root, true);
    toggle(el.hud, 'choosing', true);
  }
  function endChoice(key) {
    const r = CH.resolve;
    CH.def = null; CH.resolve = null; CH.latch.length = 0;
    show(el.choice, false);
    toggle(el.hud, 'choosing', false);
    if (r) r(key);
  }
  function padButtons() {
    try {
      const list = navigator.getGamepads ? navigator.getGamepads() : null;
      if (list) for (const g of list) if (g && g.connected) return [!!g.buttons[3]?.pressed, !!g.buttons[2]?.pressed];   // Y, X
    } catch (e) { /* no gamepad API */ }
    return [false, false];
  }
  /** 'hud-sim' tick: reads the choice (keys latched since the last tick) and counts its time down on unscaled sim time */
  function tickChoice(dt) {
    if (!CH.def) return;
    const n = CH.def.options.length;
    let pick = -1;
    const inp = ctx.input;
    if (inp?.pressed?.('interact')) pick = 0;
    else if (inp?.pressed?.('alt') && n > 1) pick = 1;
    const pad = padButtons();
    if (pad[0] && !CH.padPrev[0]) pick = 0;
    else if (pad[1] && !CH.padPrev[1] && n > 1) pick = 1;
    CH.padPrev = pad;
    while (pick < 0 && CH.latch.length) { const i = CH.latch.shift(); if (i < n) pick = i; }
    if (pick >= 0) { ctx.audio?.play?.('uiSelect', null); endChoice(CH.def.options[pick].key); return; }
    if (CH.total > 0) {
      const ts = ctx.timeScale > 0 ? ctx.timeScale : 1;
      CH.left -= dt / ts;
      setW(el.choice?.querySelector('.bar i'), CH.left / CH.total);
      if (CH.left <= 0) endChoice(CH.def.default ?? null);
    }
  }
  window.addEventListener('keydown', (e) => {
    if (!CH.def || e.repeat) return;
    const m = /^Digit([1-4])$/.exec(e.code) || /^Numpad([1-4])$/.exec(e.code);
    if (m) CH.latch.push(+m[1] - 1);
  }, true);

  // ---------------------------------------------------------------- API
  const api = {
    get markers() { return markers; },
    get vitalsState() {
      const bpm = V.mode === 'locked' ? (V.override ?? 60) : V.mode === 'live' ? Math.round(V.cur) : null;
      return { mode: V.mode, bpm };
    },
    /** extra: current panel visibility (tests) */
    get panels() { return { ...panels }; },
    /** extra: the prompt being shown ({ text, key, hold, tear } or null) */
    get promptState() { return shownPrompt ? { text: pr.text?.textContent, key: pr.kbd?.textContent, hold: !!pr.hold?.textContent, tear: el.prompt?.classList.contains('tear') } : null; },
    /** extra: true while a choice is open */
    get choosing() { return !!CH.def; },
    show(on) { show(el.hud, on); if (!on) { show(el.prompt, false); shownPrompt = ''; } },
    setMission(title, sub) { setText(el.mname, sub ? `${title} · ${sub}` : String(title ?? '')); },
    setObjectives(list = []) { objList = (list || []).map(o => ({ ...o })); renderObjectives(); },
    hint(text, seconds = 7) {
      const t = text && typeof text === 'object' ? (ctx.input?.isTouch ? (text.touch ?? text.desktop) : (text.desktop ?? text.touch)) : text;
      setText(el.hint, String(t ?? '')); hintT = t ? seconds : 0;
    },
    warn(text, seconds = 2, soft = false) {
      const k = String(text);
      const w = warnings.get(k);
      if (w) { w.t = Math.max(w.t, seconds); w.soft = soft; } else warnings.set(k, { t: seconds, soft });
    },
    killfeed(text) { setText(el.killfeed, String(text)); killT = 1.6; },
    hitmark() { hitT = 0.12; },
    hurt(amount) { hurtLevel = Math.max(hurtLevel, Math.min(1, amount)); },
    zoneCard(title, sub = '') {
      if (!el.zonecard) return;
      setText(el.zonecard.querySelector('.t'), String(title ?? '')); setText(el.zonecard.querySelector('.s'), String(sub ?? ''));
      el.zonecard.classList.remove('on'); void el.zonecard.offsetWidth;
      el.zonecard.classList.add('on'); zoneT = 4.5;
    },
    checkpointToast(label) {
      if (!el.toast) return;
      setText(el.toast, `CHECKPOINT · ${String(label ?? '').toUpperCase()}`);
      el.toast.classList.add('on'); toastT = 3;
    },
    /** extra: a short toast in the checkpoint toast slot (pickups) */
    toast(text, seconds = 3) {
      if (!el.toast) return;
      setText(el.toast, String(text ?? ''));
      el.toast.classList.add('on'); toastT = seconds;
    },
    setMarkers(list) { markers = (list || []).filter(m => m && m.pos); },
    progress(label, frac = 0) {
      if (!el.progress) return;
      show(el.progress, label != null);
      if (label != null) { setText(el.progress.querySelector('.pl'), String(label)); setW(el.progress.querySelector('.bar i'), frac); }
    },
    /** prompt(text, { key = 'F', hold, progress }); the TEAR prompt (ctx.haul) shows over it */
    prompt(text, o = {}) {
      basePrompt = text ? { text: String(text), key: o?.key || (ctx.input?.isTouch ? '' : 'F'), hold: !!o?.hold, progress: o?.progress ?? null } : null;
      renderPrompt();
    },
    choice(def) {
      if (CH.def) endChoice(null);
      if (!def || !Array.isArray(def.options) || !def.options.length) return simResolved(null);
      const d = simDeferred();
      CH.def = { title: def.title || '', options: def.options.slice(0, 4).map(o => ({ key: o.key, label: o.label ?? String(o.key) })),
                 default: def.default ?? null };
      CH.total = CH.left = def.seconds > 0 ? +def.seconds : 0;
      CH.resolve = d.resolve; CH.latch.length = 0; CH.padPrev = padButtons();
      renderChoice();
      ctx.audio?.play?.('warn', null);
      return d.promise;
    },
    bossBar(t, title) {
      explicitBoss = t || null; bossTitle = title ? String(title).toUpperCase() : ''; bossDeadT = 0;
      if (!t) { autoBoss = null; bossAcc = 0; }
    },
    setCallsign(name, sub, frame) {
      if (name != null) setText(el.callsign, String(name));
      if (sub != null) setText(el.frameSub, String(sub));
      if (frame != null) { callsignFrame = String(frame); setText(el.frameName, callsignFrame); }
    },
    glitch(level) {
      glitchT = Math.max(glitchT, clamp(+level || 0, 0, 1.5));
      if (glitchT > 0.05) el.callsign?.classList.add('glitching');
    },
    letterbox(on, seconds = 0.6) {
      if (!el.letterbox) return;
      el.letterbox.style.setProperty('--lb-t', `${seconds}s`);
      el.letterbox.classList.toggle('on', !!on);
      api.letterboxOn = !!on;
    },
    letterboxOn: false,
    /** o.clock: 'sim' | 'real' (default: the clock running now; see the header) */
    fade(to, seconds = 1, o) {
      const prev = fadeDone; fadeDone = null;
      if (el.fade) {
        el.fade.style.transitionDuration = `${Math.max(0, seconds)}s`;
        el.fade.style.opacity = String(to);
      }
      api.fadeLevel = +to || 0;
      let p;
      if (!el.fade || !(seconds > 0)) p = simResolved();
      else {
        const d = simDeferred();
        fadeDone = d.resolve; fadeLeft = seconds;
        fadeClock = o && (o.clock === 'sim' || o.clock === 'real') ? o.clock : (ctx.simRunning ? 'sim' : 'real');
        p = d.promise;
      }
      prev?.();   // a superseded fade counts as finished
      return p;
    },
    fadeLevel: 0,
    // ---- addendum A5.2
    vitals(o = {}) {
      if (!o || typeof o !== 'object') return;
      if (o.mode && ['live', 'flat', 'locked', 'hidden'].includes(o.mode) && o.mode !== V.mode) {
        // a mode change drops the previous bpm override and spike (locked defaults to exactly 60)
        V.override = null; V.spikeN = null;
        if (o.mode === 'live') V.cur = o.bpm != null ? clamp(+o.bpm, 20, 220) : liveTarget();
        if (o.mode !== 'flat' && !('fault' in o)) V.fault = null;
        V.mode = o.mode;
      }
      if ('bpm' in o) { V.override = o.bpm == null ? null : clamp(+o.bpm, 20, 220); if (V.override != null && V.spikeN == null) V.cur = V.override; }
      if (o.spike != null) { V.spikeN = clamp(+o.spike, 30, 220); V.spikeT = 0; V.decay = o.decay > 0 ? +o.decay : 8; V.cur = V.spikeN; }
      else if (o.decay > 0) V.decay = +o.decay;
      if ('fault' in o) V.fault = o.fault == null ? null : String(o.fault);
    },
    setPanels(p = {}) {
      for (const k of PANELS) if (k in (p || {})) panels[k] = !!p[k];
      for (const k of PANELS) if (k !== 'rack') toggle(el.hud, 'hide-' + k, !panels[k]);
      show(rackEl, panels.rack);
      if (panels.rack) { lastRack = ''; placeRack(); }
    },
    setSlots(s = {}) {
      for (const [k, v] of Object.entries(s || {})) {
        const slot = k === 'K' ? 'U' : k;
        if (!slots[slot]) continue;
        const o = typeof v === 'string' ? { state: v } : (v || {});
        if (o.state) slots[slot].state = ['auto', 'ready', 'offline', 'hidden'].includes(o.state) ? o.state : 'auto';
        if ('label' in o) slots[slot].label = o.label == null ? null : String(o.label);
      }
      lastWeapons = null;
    },
    /** extra: hide the HUD panels for a hideHud cinematic (comms, letterbox and fade stay) */
    setCinematic(on) { cine = !!on; toggle(el.hud, 'cine', cine); toggle(game, 'cine', cine); },
    /** extra: the skip indicator for skippable shots (frac = hold progress 0..1, or null to hide) */
    skipHint(frac) {
      if (frac == null) { show(skipEl, false); return; }
      show(skipEl, true); setW(skipBar, frac);
      const k = skipEl.querySelector('.st b'); if (k) setText(k, ctx.input?.isTouch ? 'SKIP' : 'Space');
    },
    /** extra: reset per-level HUD state (mission.start calls it before the level script re-applies its own) */
    resetLevel() {
      api.setPanels({ ap: true, en: true, weapons: true, radar: true, compass: true, objectives: true, lock: true, rack: false });
      api.setSlots({ R: { state: 'auto', label: null }, L: { state: 'auto', label: null }, S: { state: 'auto', label: null }, K: { state: 'auto', label: null } });
      V.mode = 'hidden'; V.override = null; V.spikeN = null; V.fault = null; V.cur = 80;
      explicitBoss = null; autoBoss = null; callsignFrame = null; lastFrameAuto = '';
      setText(el.callsign, ''); setText(el.frameSub, '');
      basePrompt = null; renderPrompt();
      warnings.clear(); hintT = 0; zoneT = 0; toastT = 0; glitchT = 0;
      if (CH.def) endChoice(null);
      api.progress(null); api.setCinematic(false); api.skipHint(null);
      markers = []; objSeen.clear(); objList = []; if (el.objs) el.objs.innerHTML = '';
      levelStartAt = ctx.clock.realTime;
      for (const s of SLOT4) slotGated[s] = false;
    },
    update(dt) {
      tickFade('real', dt);
      hintT -= dt; killT -= dt; hitT -= dt; zoneT -= dt; toastT -= dt; blockT -= dt;
      hurtLevel = Math.max(0, hurtLevel - dt * 2.2);
      glitchT = Math.max(0, glitchT - dt * 1.6);
      if (ctx.pipeline?.grade) ctx.pipeline.grade.hurt = hurtLevel;
      if (!el.hud || el.hud.hidden) return;
      const p = ctx.player;
      if (p && p.active) {
        setText(el.apNum, String(Math.ceil(p.ap)));
        toggle(el.apNum, 'low', p.ap < p.apMax * 0.3);
        setW(el.apFill, p.ap / p.apMax);
        setW(el.enFill, p.en / p.enMax);
        toggle(el.enLbl, 'over', p.overheat > 0);
        toggle(el.status, 'over', p.overheat > 0);
        setText(el.enTxt, p.overheat > 0 ? 'RECHARGING' : '');
        setW(el.stFill, p.stagT > 0 ? 1 : (p.imp || 0) / (p.impMax || 1));
        updateWeapons(p);
        // the frame tag: automatic unless the level set one (campaign-only frames never show their name: §8.6, A2 #6)
        if (callsignFrame == null) {
          const fr = LO.FRAMES?.[p.loadout?.frame];
          const auto = fr?.campaignOnly ? '' : `Frame · ${p.stats?.name || ''}`;
          if (auto !== lastFrameAuto) { lastFrameAuto = auto; setText(el.frameName, auto); }
        }
        if (p.ap < p.apMax * 0.25 && p.alive) api.warn(ctx.input?.isTouch ? 'AP CRITICAL · TAP KIT' : 'AP CRITICAL · R TO REPAIR', 0.2, true);
        missileT -= dt;
        if (p.alive && ctx.projectiles?.incoming?.(p, 220)) {
          api.warn('MISSILE INCOMING', 0.25);
          if (missileT <= 0) { missileT = 1.1; ctx.audio?.play?.('alarm', null, { vol: 0.5 }); }
        }
        updateLock(p);
      } else if (el.lockbox && el.lockbox.style.display !== 'none') el.lockbox.style.display = 'none';
      updateVitals(dt);
      if (panels.rack) updateRack();
      renderPrompt();
      updateBoss(dt);
      updateMarkers();
      updateCompass();
      drawRadar(dt);
      tickObjectives();
      setText(el.timer, formatTime(ctx.mission?.elapsed ?? 0));
      let wh = '';
      for (const [k, w] of warnings) { w.t -= dt; if (w.t <= 0) warnings.delete(k); else wh += `<div class="${w.soft ? 'soft' : ''}">${esc(k)}</div>`; }
      if (wh !== lastWarnHTML && el.warn) { el.warn.innerHTML = wh; lastWarnHTML = wh; }
      if (el.hint) { const o = hintT > 0 ? '1' : '0'; if (el.hint.style.opacity !== o) el.hint.style.opacity = o; }
      if (el.killfeed) { const o = killT > 0 ? '1' : '0'; if (el.killfeed.style.opacity !== o) el.killfeed.style.opacity = o; }
      if (el.hitmark) { const o = hitT > 0 ? '1' : '0'; if (el.hitmark.style.opacity !== o) el.hitmark.style.opacity = o; }
      const blocked = blockT > 0;
      toggle(el.hud, 'blocked', blocked && hurtLevel < 0.05);
      if (el.vignette) el.vignette.style.opacity = String(Math.min(1, hurtLevel + (blocked ? 0.3 * (blockT / 0.35) : 0) + (p && p.active && p.alive && p.ap < p.apMax * 0.25 ? 0.25 : 0)).toFixed(3));
      if (el.glitch) {
        el.glitch.style.opacity = glitchT > 0 ? String(Math.min(1, glitchT * (0.6 + Math.random() * 0.8))) : '0';
        el.glitch.style.transform = glitchT > 0.05 ? `translateY(${((Math.random() - 0.5) * 8 * glitchT).toFixed(1)}px)` : '';
        if (glitchT <= 0.05) el.callsign?.classList.remove('glitching');
      }
      if (zoneT <= 0) el.zonecard?.classList.remove('on');
      if (toastT <= 0) el.toast?.classList.remove('on');
    },
  };

  function placeRack() {
    if (!el.weapons || rackEl.hidden || ctx.input?.isTouch) return;
    const r = el.weapons.getBoundingClientRect();
    if (r.height > 0) rackEl.style.bottom = Math.round((ctx.canvas.clientHeight || innerHeight) - r.top + 12) + 'px';
  }
  ctx.events.on('resize', placeRack);
  ctx.events.on('player:damaged', (e) => { if (e?.blocked) blockT = 0.35; });
  ctx.events.on('level:start', () => { levelStartAt = ctx.clock.realTime; callsignFrame = null; lastFrameAuto = ''; for (const s of SLOT4) slotGated[s] = false; });
  ctx.events.on('level:cleared', () => { markers = []; explicitBoss = null; autoBoss = null; if (CH.def) endChoice(null); api.prompt(null); api.progress(null); });

  // sim-clock countdowns (fade, choice) run in a 'sim' system so they freeze while the game is paused
  ctx.addSystem({ name: 'hud-sim', phase: 'ui', when: 'sim', order: -1, update: (dt) => { tickFade('sim', dt); tickChoice(dt); } });
  ctx.addSystem({ name: 'hud', phase: 'ui', when: 'always', update: (dt) => api.update(dt) });
  ctx.hud = api;
  return api;
}
