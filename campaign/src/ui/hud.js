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
// Clarity pass (docs/todo.md): weapon rows lead with a plain type label taken from PartDef.weapon; the part's own
// (flavour) name follows, smaller, or is dropped when it says the same thing.
const TYPE_LABEL = { rifle: 'Rifle', mg: 'Machine gun', shotgun: 'Shotgun', cannon: 'Cannon', blade: 'Blade', missiles: 'Missiles',
  micromissiles: 'Micro-missiles', mortar: 'Mortar', kit: 'Repair kits', harpoon: 'Harpoon', flares: 'Flares', saw: 'Saw',
  shock: 'Shock', plasma: 'Plasma', rail: 'Railgun' };
// touch: the button's own word already names these types, so its badge would only repeat it
const TOUCH_VERB_TYPES = { R: [], L: ['blade'], S: ['missiles'], U: ['kit'] };
const TOUCH_SHORT = { mg: 'MG', micromissiles: 'MICRO-MSL', kit: 'KITS', rail: 'RAIL' };
/** the plain type label of a part ('Rifle', 'Harpoon', 'Repair kits'); unknown types are capitalised, no type → its name */
export function weaponTypeLabel(part) {
  const t = part && typeof part.weapon === 'string' ? part.weapon : '';
  if (!t) return part?.name ? String(part.name) : '';
  if (TYPE_LABEL[t]) return TYPE_LABEL[t];
  const s = t.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const sameWords = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
// explain cards: a key name on desktop → the on-screen button that does the same on touch
const EX_TOUCH_KEYS = { F: 'USE', E: 'LOCK', TAB: 'LOCK', R: 'KIT', Q: 'MSL', RMB: 'BLADE', LMB: 'FIRE', SPACE: 'JUMP', SHIFT: 'BOOST',
  ESC: 'II', ESCAPE: 'II', P: 'II', G: '', WASD: 'MOVE', 'W A S D': 'MOVE', MOUSE: 'DRAG' };
const RADAR_RANGE = 320;                                              // metres from the centre to the rim
const OBJ_LINGER = 6;                                                 // seconds a done/failed objective stays listed
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _scr = { x: 0, y: 0, behind: false };
const OCC_MAX = 64;
const occ = new Float32Array(OCC_MAX * 4);                            // screen rects taken this frame (marker declutter)
let nOcc = 0;
function occupy(x0, y0, x1, y1) { if (nOcc < OCC_MAX) { const k = 4 * nOcc++; occ[k] = x0; occ[k + 1] = y0; occ[k + 2] = x1; occ[k + 3] = y1; } }
function occupied(x0, y0, x1, y1) {
  for (let i = 0; i < nOcc; i++) { const k = 4 * i; if (x0 < occ[k + 2] && x1 > occ[k] && y0 < occ[k + 3] && y1 > occ[k + 1]) return true; }
  return false;
}

const HUD_CSS = `
#hud.hide-ap #status .row,#hud.hide-ap #status .apb,#hud.hide-ap #status .stb{visibility:hidden}
#hud.hide-en #status .enb,#hud.hide-en #enLbl{visibility:hidden}
#hud.hide-weapons #weapons,#hud.hide-radar #radar,#hud.hide-compass #compass,#hud.hide-objectives #objpanel,
#hud.hide-lock #lockbox{display:none!important}
#hud.cine>*:not(#vignette):not(#glitch):not(#scan){opacity:0!important;transition:opacity .35s}
#hud>*{transition:opacity .35s}
#game.cine #touch .tb:not(#tSkip):not(#tPause),#game.cine #stickHome{opacity:0;pointer-events:none}
#touch #tSkip,#touch #tPause{z-index:3}
#game.touch #prompt kbd:not([hidden]):not(:empty){display:inline-block;font-size:10px;letter-spacing:.12em;color:var(--en);border-color:var(--en)}
#objpanel .mrow{display:flex;gap:10px;align-items:baseline}
#objs li{transition:opacity .6s,color .4s}
#objs li .pg{font-family:var(--f-mono);font-size:13px;letter-spacing:0;color:var(--hud-dim);margin-left:2px}
#objs li .tg{font-size:10px;letter-spacing:.2em;color:var(--hud-dim);border:1px solid var(--hud-faint);padding:0 4px;transform:translateY(-2px)}
#objs li.new{animation:hudObjIn 1.8s ease-out}
#objs li.new::before{animation:hudObjDot 1.8s ease-out}
@keyframes hudObjIn{0%{opacity:.35;transform:translateX(-10px)}10%{opacity:1;transform:none;color:var(--accent)}55%{color:var(--accent)}100%{color:var(--hud)}}
@keyframes hudObjDot{0%,55%{background:var(--accent);border-color:var(--accent)}}
#objs li.done{animation:hudObjDone 1.2s ease-out}
@keyframes hudObjDone{0%{color:var(--ok)}100%{color:var(--hud-dim)}}
#objs li.fading{opacity:0}
#markers .mk{transition:opacity .25s}
#markers .mk .d{display:block;margin-top:1px;font-family:var(--f-mono);font-size:10px;color:var(--hud-dim)}
#markers .mk span{text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 6px rgba(0,0,0,.55)}
#markers .mk b{box-shadow:0 0 0 1px rgba(0,0,0,.25)}
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
#prompt.tear .pb{height:3px;background:rgba(224,145,60,.22)}
#prompt.tear .pb i{background:var(--accent);box-shadow:0 0 8px var(--accent)}
#prompt.tear span:not(.hold){color:var(--accent);font-weight:700;letter-spacing:.3em}
#choice{pointer-events:none;width:min(780px,94vw);top:56%}
#hud.choosing #prompt,#hud.choosing #killfeed,#hud.choosing #progress,#hud.choosing #hint{visibility:hidden}
#choice .opts{flex-wrap:nowrap}
#choice .opt{white-space:nowrap}
#game.touch #choice .opts{flex-wrap:wrap}
#choice .opt{display:flex;align-items:center;gap:0;font-family:var(--f-display);color:var(--hud);text-transform:uppercase;font-size:16px;letter-spacing:.18em;transition:border-color .15s,background .15s}
#choice .opt:hover,#choice .opt.pick{border-color:var(--accent);background:rgba(224,145,60,.18)}
#choice .opt.pick{color:var(--accent)}
#choice{padding:16px 26px 20px;box-sizing:border-box;background:radial-gradient(closest-side,rgba(8,8,10,.76),rgba(8,8,10,.5) 58%,rgba(8,8,10,0))}
#choice .t{color:#ff7a52;text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 16px rgba(255,91,46,.35)}
#choice .opt{background:rgba(12,11,14,.8)}
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
#rack .rc{display:flex;align-items:center;gap:6px;min-width:0;height:24px;padding:0 6px;border:1px solid var(--hud-faint);background:rgba(12,11,14,.35);font-size:12px;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap}
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
#zonecard{top:15.5%}
#game.touch #rack{left:calc(14px + var(--safe-l));right:auto;top:auto;bottom:184px;width:min(176px,24vw)}
#game.touch #rack .rs{grid-template-columns:1fr;gap:3px;margin-top:4px}
#game.touch #mname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (orientation:landscape){#game.touch #objpanel{max-width:calc(53vw - min(210px,18vw) - 34px)}}
#game.touch #objs li{flex-wrap:wrap;column-gap:6px;row-gap:0;line-height:1.25}
#game.touch #bossbar{top:var(--boss-top,64px)}
#game.touch #bossbar .nm{font-size:12px}
#game.touch #bossbar .stag{margin-top:2px;font-size:10px}
#game.touch #zonecard{top:22%}
#game.touch #hud.boss-on #zonecard{top:calc(var(--boss-top,64px) + 50px)}
#game.touch #zonecard .t{font-size:24px;letter-spacing:.24em}
#game.touch #zonecard .s{font-size:11px}
#game.touch #warn{top:37%}
#game.touch #hud.zone-on.boss-on #warn{top:calc(var(--boss-top,64px) + 102px)}
#game.touch #checkpointToast{font-size:11px;letter-spacing:.16em;padding:5px 10px}
#hud.zone-on.boss-on #warn{top:max(31%,calc(15.5% + 76px))}
#markers .mk.nolabel span{visibility:hidden}
#game.touch #prompt{top:calc(50% + 40px)}
#game.touch #hint{bottom:70px}
#game.touch #progress{top:calc(50% + 84px)}
#game.touch #tInteract{right:auto;bottom:auto;left:calc(50% - 212px + var(--safe-l));top:calc(50% + 24px)}
#game.touch #rack .rc{font-size:11px;padding:0 5px;height:20px}
#game.touch #cineSkip{display:none}
@media (max-width:760px){#rack{width:260px;bottom:150px}#vitals{right:calc(100% + 8px);width:72px}#vitals canvas{width:72px;height:20px}#vitals .bpm{font-size:15px}#vitals .vl span.vm{display:none}}
#weapons .wpn .wn{display:flex;align-items:baseline;min-width:0;overflow:hidden}
#weapons .wpn .wt,#weapons .wpn .key{flex:none}
#weapons .wpn .fl{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:9px;font:400 11px var(--f-mono);letter-spacing:.02em;text-transform:none;color:var(--hud-dim)}
#weapons .wpn .fl:empty,#weapons .wpn.off .fl{display:none}
#weapons .wpn.off .wn{text-decoration:none}
#weapons .wpn.off .wt{text-decoration:line-through;text-decoration-thickness:1px}
@media (max-width:760px){#weapons .wpn .fl{display:none}}
@media (min-width:1200px){#weapons,#rack{width:380px}}
@media (min-width:761px) and (max-width:1199px){#status{width:330px;margin-left:-165px}#weapons,#rack{width:300px}#weapons .wpn{grid-template-columns:66px 1fr auto}#weapons .wpn .fl{display:none}}
#hint{white-space:normal;max-width:min(880px,calc(100vw - 80px));box-sizing:border-box;text-align:center;line-height:1.35;text-wrap:balance}
#wtags{position:absolute;inset:0;pointer-events:none;display:none}
#game.touch #wtags{display:block}
#wtags .wtag{position:absolute;left:0;top:0;padding:2px 5px 1px;font:600 9px/1 var(--f-mono);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;
  color:var(--hud);background:rgba(12,11,14,.8);border:1px solid var(--hud-faint);border-bottom-color:var(--hud-dim)}
#wtags .wtag[hidden]{display:none}
#explain{position:absolute;right:calc(28px + var(--safe-r,0px));top:256px;width:330px;box-sizing:border-box;padding:10px 15px 12px;pointer-events:none;
  background:linear-gradient(270deg,rgba(12,11,14,.86),rgba(12,11,14,.58));border-right:2px solid var(--accent);z-index:1}
#explain .eh{display:flex;justify-content:space-between;gap:10px;font:500 10px/1 var(--f-mono);letter-spacing:.22em;color:var(--hud-dim);text-transform:uppercase}
#explain .eh b{font-weight:600;color:var(--accent);letter-spacing:.2em}
#explain .tm{display:flex;align-items:center;gap:10px;margin-top:8px}
#explain .tm b{font:700 21px/1.05 var(--f-display);letter-spacing:.12em;text-transform:uppercase;color:var(--hud)}
#explain .tm kbd{flex:none;font:600 11px/1 var(--f-mono);letter-spacing:.08em;padding:3px 6px 2px;border:1px solid var(--accent);color:var(--accent);text-transform:uppercase;white-space:nowrap}
#explain .tm kbd:empty{display:none}
#explain .tx{margin:6px 0 0;font:400 16px/1.32 var(--f-display);letter-spacing:.02em;color:var(--hud);text-wrap:pretty}
#explain .ft{margin-top:7px;font:400 11px/1.3 var(--f-mono);color:var(--hud-dim)}
#explain .ft:empty{display:none}
#explain .tb{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(224,145,60,.15)}
#explain .tb i{position:absolute;right:0;top:0;bottom:0;width:100%;background:var(--accent);opacity:.7}
#explain:not([hidden]){animation:hudExIn .35s ease-out}
@keyframes hudExIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
#explain.out{opacity:0;transform:translateX(8px);transition:opacity .4s,transform .4s}
#hud.choosing #explain{visibility:hidden}
#game.touch #explain{right:auto;left:calc(14px + var(--safe-l,0px));width:min(300px,38vw);padding:8px 12px 10px;border-right:0;border-left:2px solid var(--accent);
  background:linear-gradient(90deg,rgba(12,11,14,.88),rgba(12,11,14,.6))}
#game.touch #explain .tm{margin-top:6px}
#game.touch #explain .tm b{font-size:16px}
#game.touch #explain .tx{font-size:13px;line-height:1.3;margin-top:4px}
#game.touch #explain .ft{font-size:10px;margin-top:5px}
#game.touch #hud.explaining #rack{opacity:.12}
@keyframes hudExInL{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
#game.touch #explain:not([hidden]){animation-name:hudExInL}
@media (max-height:520px){#explain{top:min(256px,44vh)}}
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
  const commsEl = $('#comms');
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
  // weapon rows: [type label][key][flavour name] (the key cap from index.html is kept)
  const wrow = {};
  for (const s of SLOT4) {
    const e = el.w[s], wn = e?.querySelector('.wn');
    if (!wn) continue;
    const key = wn.querySelector('.key')?.textContent ?? '';
    wn.innerHTML = `<span class="wt"></span>${key ? `<span class="key">${esc(key)}</span>` : ''}<span class="fl"></span>`;
    wrow[s] = { wt: wn.querySelector('.wt'), fl: wn.querySelector('.fl'), shown: '' };
  }
  // touch: the plain type as a small badge on the weapon button, where the button's own word doesn't already say it
  const tagsEl = mk('div', '', el.hud);
  tagsEl.id = 'wtags';
  const wtag = {};
  for (const s of SLOT4) { const t = mk('span', 'wtag', tagsEl); t.hidden = true; wtag[s] = { el: t, text: '', btn: null }; }
  let tagsDirty = true, tagsTouch = null;
  // explain cards (clarity pass): a first-time plain-English note on a term or mechanic
  const exEl = mk('div', '', el.hud, `<div class="eh"><span class="no">FIELD NOTE</span><b>NEW</b></div><div class="tm"><b></b><kbd></kbd></div>
    <p class="tx"></p><div class="ft"></div><div class="tb"><i></i></div>`);
  exEl.id = 'explain'; exEl.hidden = true;
  const ex = { no: exEl.querySelector('.no'), term: exEl.querySelector('.tm b'), key: exEl.querySelector('.tm kbd'), tx: exEl.querySelector('.tx'),
               ft: exEl.querySelector('.ft'), bar: exEl.querySelector('.tb i') };
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
  let bossTop = 64, bossTopAcc = 0;   // touch: the boss bar slides under a tall comms box (both share the top centre)
  // the comms box's bottom edge, kept by a ResizeObserver (read after layout, so the HUD never forces one); without
  // ResizeObserver it is measured at 5 Hz while it matters
  let commsBottom = -1;
  if (commsEl && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { commsBottom = commsEl.hidden ? 0 : commsEl.offsetTop + commsEl.offsetHeight; }).observe(commsEl);
  }
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
      const ended = o.state === 'done' || o.state === 'failed';
      if (!li) {
        li = document.createElement('li'); li.dataset.id = o.id;
        if ((!seen || seen.state === 'hidden') && !ended) li.classList.add('new');
      }
      // an objective first seen already ended (restored by a checkpoint restart) is listed but stays out of sight
      if (!seen) objSeen.set(o.id, { state: o.state, at: ended ? now - OBJ_LINGER - 1 : now });
      else if (seen.state !== o.state) objSeen.set(o.id, { state: o.state, at: now });
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
  /** [type label, flavour name] for a slot: a setSlots label replaces both; the flavour is dropped when it only repeats
   *  the type ('Repair kits') */
  function rowNames(s, w) {
    const cfg = slots[s], part = w?.part;
    if (cfg.label != null) return [cfg.label, ''];
    if (!part) return ['', ''];
    const type = weaponTypeLabel(part), name = part.name ? String(part.name) : '';
    return [type, name && !sameWords(name, type) ? name : ''];
  }
  /** the touch badge text for a slot: the short plain type, unless the button's own word already says it */
  function touchTag(s, w) {
    const cfg = slots[s], t = w?.part?.weapon;
    if (cfg.label != null) return String(cfg.label).toUpperCase();
    if (!t || TOUCH_VERB_TYPES[s].includes(t)) return '';
    return TOUCH_SHORT[t] || weaponTypeLabel(w.part).toUpperCase();
  }
  function placeTags() {
    tagsDirty = false;
    if (!ctx.input?.isTouch) return;
    const hr = el.hud.getBoundingClientRect();
    for (const s of SLOT4) {
      const tg = wtag[s];
      tg.btn = tg.btn || document.querySelector(`#touch .tb[data-act="${SLOT_TOUCH[s]}"]`);
      const r = tg.btn?.getBoundingClientRect();
      if (!r || !r.width) { tg.el.style.transform = 'translate(-999px,-999px)'; continue; }
      tg.el.style.transform = `translate(${(r.left + r.width / 2 - hr.left).toFixed(1)}px,${(r.top - hr.top - 1).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
  function updateWeapons(p) {
    if (p.weapons !== lastWeapons) {   // the player replaces the weapons object on every setLoadout (setSlots resets it too)
      lastWeapons = p.weapons;
      for (const s of SLOT4) {
        const r = wrow[s], w = p.weapons?.[s];
        if (r) { const [t, f] = rowNames(s, w); setText(r.wt, t); setText(r.fl, f); r.fl.title = f; r.shown = t; }
        const tag = touchTag(s, w);
        if (tag !== wtag[s].text) { wtag[s].text = tag; setText(wtag[s].el, tag); tagsDirty = true; }
      }
    }
    const isTouch = !!ctx.input?.isTouch;
    if (isTouch !== tagsTouch) { tagsTouch = isTouch; tagsDirty = true; }
    if (tagsDirty && isTouch) placeTags();
    const ab = p.abilities;
    const recent = ctx.clock.realTime - levelStartAt < 1;
    for (const s of SLOT4) {
      const e = el.w[s]; if (!e) continue;
      const cfg = slots[s], w = p.weapons?.[s];
      const gated = cfg.state === 'offline' || (cfg.state === 'auto' && !!ab && ab[SLOT_ABILITY[s]] === false);
      const hidden = cfg.state === 'hidden';
      show(e, !hidden);
      show(wtag[s].el, isTouch && !hidden && !gated && !!wtag[s].text && !(s === 'L' && bladeTear));
      if (slotGated[s] && !gated && !recent) {
        e.classList.remove('online'); void e.offsetWidth; e.classList.add('online');
        api.glitch(0.3); ctx.audio?.play?.('confirm', null);
      }
      slotGated[s] = gated;
      toggle(e, 'off', gated);
      const act = SLOT_TOUCH[s];
      if (gated) {
        setText(e.querySelector('.wv'), 'OFFLINE'); toggle(e, 'cool', false);
        const tear = s === 'L' && tearUp();
        if (s === 'L') setBladeTear(tear);
        ctx.input?.setTouchLabel?.(act, tear ? '' : 'OFF', !tear);
        continue;
      }
      if (!w) continue;
      const r = w.readout();
      setText(e.querySelector('.wv'), r.label);
      toggle(e, 'cool', r.cooling);
      // prototype touch labels: ammo, blade cooldown only, missile cooldown or count, kit count (the BLADE button
      // reads TEAR while the TEAR prompt is up, with no sub-label)
      const tear = s === 'L' && tearUp();
      if (s === 'L') setBladeTear(tear);
      const tl = tear ? '' : s === 'L' ? (r.cooling ? r.label : '') : s === 'S' ? (r.cooling ? r.label : String(w.ammo)) : String(w.ammo);
      ctx.input?.setTouchLabel?.(act, tl, tear ? false : r.cooling || r.empty);
    }
    // A1.2: the other gated touch buttons stay on screen, dimmed (OFF where the button has a sub-label)
    if (ctx.input?.isTouch) {
      const g = (k) => !!ab && ab[k] === false;
      ctx.input.setTouchLabel?.('boost', g('boost') ? 'OFF' : '', g('boost'));
      ctx.input.setTouchLabel?.('jump', g('jump') && g('hover') ? 'OFF' : '', g('jump') && g('hover'));
      ctx.input.setTouchLabel?.('lock', g('lock') ? 'OFF' : '', g('lock'));
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
      if (!id) c.classList.remove('in');
      setText(c.querySelector('span'), id ? partName(id) : '—');
      c.title = id || '';
      if (id && i >= before && i < rack.length) { c.classList.remove('in'); void c.offsetWidth; c.classList.add('in'); }
    }
  }
  /** the key cap a prompt shows: keyboard keys on desktop; on touch the on-screen button that does it (interact → the
   *  USE button), or none (TEAR: the BLADE button itself is relabelled TEAR) */
  const TOUCH_KEYS = { F: 'USE', E: 'LOCK', R: 'KIT', Q: 'MSL', G: '', RMB: '', LMB: 'FIRE', SPACE: 'JUMP', SHIFT: 'BOOST' };
  function promptKey(k) {
    const key = k == null ? 'F' : String(k);
    if (!ctx.input?.isTouch) return key;
    const t = TOUCH_KEYS[key.toUpperCase()];
    return t !== undefined ? t : key;
  }
  /** the TEAR prompt is up: a candidate, haul enabled, TEAR not gated, the frame not frozen (A5.2) */
  function tearUp() {
    const h = ctx.haul, p = ctx.player;
    return !!(h && h.candidate && h.enabled !== false && p?.abilities?.tear !== false && !p?.frozen);
  }
  /** on touch the BLADE button itself reads TEAR while the TEAR prompt is up */
  const bladeBtn = document.querySelector('#touch .tb[data-act="blade"]'), bladeTxt = bladeBtn?.querySelector('span');
  let bladeTear = false;
  function setBladeTear(on) {
    if (on === bladeTear || !bladeTxt) return;
    bladeTear = on;
    bladeTxt.textContent = on ? 'TEAR' : 'BLADE';
    bladeBtn.classList.toggle('on', on);
  }
  function renderPrompt() {
    const h = ctx.haul;
    const tear = tearUp();
    const cur = tear ? { text: 'TEAR', key: 'RMB', hold: true, progress: h.holdProgress || 0, tear: true } : basePrompt;
    if (!el.prompt) return;
    if (!cur || !cur.text) {
      if (shownPrompt !== '') { show(el.prompt, false); shownPrompt = ''; }
      ctx.input?.showTouchButton?.('interact', false);
      return;
    }
    const key = promptKey(cur.key);
    const sig = `${cur.text}|${key}|${cur.hold}|${!!cur.tear}`;
    if (sig !== shownPrompt) {
      shownPrompt = sig;
      setText(pr.kbd, key);
      if (pr.kbd) pr.kbd.hidden = !key;
      setText(pr.text, cur.text);
      setText(pr.hold, cur.hold ? 'HOLD' : '');
      toggle(el.prompt, 'tear', !!cur.tear);
      show(el.prompt, true);
    }
    const pg = cur.progress;
    if (pr.bar) pr.bar.style.display = pg != null && pg > 0 ? '' : 'none';
    setW(pr.fill, pg || 0);
    ctx.input?.showTouchButton?.('interact', !cur.tear);
  }

  // ---------------------------------------------------------------- explain cards (clarity pass)
  // explain({ id, term, text, key }): the first time an id is seen, record { id, term, text, key } in
  // save.flags.glossary (the pause menu's Field notes list them in that order) and queue a card. Cards show one at a
  // time; a card's time runs only while the player can see it (sim running, no hideHud shot, not under a fade, no
  // choice open), so a note never expires behind a cinematic or a black screen.
  const EX = { queue: [], cur: null, t: 0, dur: 0, out: 0, gap: 0 };
  /** a { desktop, touch } pair → the side for this device; anything else → itself */
  const forDevice = (v) => (v && typeof v === 'object') ? (ctx.input?.isTouch ? (v.touch ?? v.desktop) : (v.desktop ?? v.touch)) : v;
  /** the key cap for this device: on touch a keyboard key (or 'Hold RMB') names the on-screen button instead */
  function exKey(k) {
    const v = forDevice(k);
    if (v == null || v === '') return '';
    const s = String(v).trim();
    if (!ctx.input?.isTouch || (k && typeof k === 'object' && k.touch != null)) return s;
    const up = s.toUpperCase();
    if (up in EX_TOUCH_KEYS) return EX_TOUCH_KEYS[up];
    const m = /^(hold|tap|press)\s+(.+)$/i.exec(s);
    if (m && m[2].toUpperCase() in EX_TOUCH_KEYS) { const b = EX_TOUCH_KEYS[m[2].toUpperCase()]; return b ? `${m[1]} ${b}` : ''; }
    return s;
  }
  function glossaryList() {
    try { const g = ctx.save?.getFlag?.('glossary'); return Array.isArray(g) ? g : []; } catch (e) { return []; }
  }
  const exCanRun = () => ctx.simRunning && !cine && (api.fadeLevel ?? 0) < 0.6 && !CH.def && !el.hud.hidden
    && (ctx.flow?.state ?? 'playing') === 'playing';
  function exShow(e) {
    EX.cur = e; EX.t = 0; EX.out = 0;
    const text = String(forDevice(e.text) ?? '');
    EX.dur = clamp(4.5 + 0.055 * (text.length + String(e.term || '').length), 6.5, 13);
    const n = glossaryList().findIndex(x => x && x.id === e.id);
    setText(ex.no, n >= 0 ? `FIELD NOTE ${String(n + 1).padStart(2, '0')}` : 'FIELD NOTE');
    setText(ex.term, String(e.term || ''));
    setText(ex.key, exKey(e.key));
    setText(ex.tx, text);
    // the first card says where the notes live (non-breaking spaces keep each menu path on one line)
    setText(ex.ft, n === 0 ? (ctx.input?.isTouch ? 'Notes are kept under\u00a0II\u00a0›\u00a0Field\u00a0notes.' : 'Notes are kept under Pause\u00a0(Esc)\u00a0›\u00a0Field\u00a0notes.') : '');
    if (ctx.input?.isTouch) {   // under the objectives list, whatever its length
      const op = document.getElementById('objpanel'), hr = el.hud.getBoundingClientRect();
      const r = op && op.offsetParent !== null ? op.getBoundingClientRect() : null;
      exEl.style.top = Math.round(Math.max(96, r && r.height ? r.bottom - hr.top + 10 : 96)) + 'px';
    } else exEl.style.top = '';
    exEl.classList.remove('out');
    exEl.hidden = false;
    exEl.style.animation = 'none'; void exEl.offsetWidth; exEl.style.animation = '';
    toggle(el.hud, 'explaining', true);
    setW(ex.bar, 1);
    ctx.audio?.play?.('blip', null);
  }
  function exHide() {
    EX.cur = null; EX.gap = 0.6;
    exEl.hidden = true; exEl.classList.remove('out');
    toggle(el.hud, 'explaining', false);
  }
  function tickExplain(dt) {
    if (!EX.cur) {
      if (EX.gap > 0) { if (exCanRun()) EX.gap -= dt; return; }
      if (EX.queue.length && exCanRun()) exShow(EX.queue.shift());
      return;
    }
    if (EX.out > 0) { EX.out -= dt; if (EX.out <= 0) exHide(); return; }
    if (!exCanRun()) return;
    EX.t += dt;
    setW(ex.bar, 1 - EX.t / EX.dur);
    if (EX.t >= EX.dur) { exEl.classList.add('out'); EX.out = 0.42; }
  }

  // ---------------------------------------------------------------- lock box, boss bar, markers, compass, radar
  // the viewport in CSS pixels, cached (reading clientWidth after this frame's style writes would force a layout)
  const view = { w: ctx.canvas.clientWidth || innerWidth, h: ctx.canvas.clientHeight || innerHeight };
  ctx.events.on('resize', () => { view.w = ctx.canvas.clientWidth || innerWidth; view.h = ctx.canvas.clientHeight || innerHeight; });
  function pxScale() {
    const h = view.h;
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
    // the lock box and its info block (name, bars, STAGGERED, distance) keep marker labels off them
    const lx = _scr.x - size / 2, ly = _scr.y - size / 2;
    occupy(lx, ly, lx + size + (ctx.input?.isTouch ? 130 : 160), ly + Math.max(size, 74));
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
    const W = view.w, H = view.h;
    const touch = ctx.input?.isTouch;
    const mx = touch ? 70 : 56, top = touch ? 128 : 168, bot = touch ? 120 : 190;   // clear of objectives/comms/radar/boss bar and weapons
    const cx = W / 2, cy = H / 2;
    // the interaction prompt under the reticle keeps marker labels off it too
    if (shownPrompt && el.prompt && !el.prompt.hidden) {
      const pw = 70 + (pr.text?.textContent?.length || 0) * (touch ? 9 : 11), py = cy + (touch ? 40 : 84);
      occupy(cx - pw / 2, py - 4, cx + pw / 2, py + 40);
    }
    // on touch, the right-hand button cluster and the stick's home
    if (touch) { occupy(W - 300, H - 236, W, H); occupy(0, H - 176, 210, H); }
    // the comms box while a line is up (its layout is fixed: left middle on desktop, top centre on touch)
    if (commsEl && !commsEl.hidden && !commsEl.classList.contains('overblack')) {
      if (touch) { const cw = Math.min(420, W * 0.36); occupy(W * 0.53 - cw / 2, 0, W * 0.53 + cw / 2, 76); }
      else occupy(0, H * 0.44 - 6, 28 + Math.min(430, W * 0.4) + 36, H * 0.44 + 110);
    }
    let n = 0;
    for (const m of markers) {
      if (!rig || !markerPos(m, _v)) continue;
      const e = markerEl(n++);
      rig.worldToScreen(_v, _scr);
      const kind = m.kind || 'objective';
      if (e.dataset.kind !== kind) { e.className = 'mk ' + kind; e.dataset.kind = kind; }
      let x = _scr.x, y = _scr.y, edge = false;
      if (_scr.behind || x < mx || x > W - mx || y < top || y > H - bot) {
        edge = true;
        let dx = x - cx, dy = y - cy;
        if (_scr.behind) {
          // behind the camera the projection is mirrored and its vertical half is meaningless: point the way to turn.
          // In camera space (x right, z back) a target to the side sits on that side edge; one straight behind sits at
          // the bottom edge.
          // A target straight behind goes to the side it is nearer (the bottom edge holds the bars, prompts and
          // buttons), a little below the centre line.
          _w.copy(_v).applyMatrix4(ctx.camera.matrixWorldInverse);
          const back = Math.max(1e-3, Math.abs(_w.z));
          dx = Math.abs(_w.x) < back * 0.6 ? (_w.x < 0 ? -1 : 1) * back * 0.6 : _w.x;
          dy = back * (touch ? 0.05 : 0.15);   // desktop: below the comms box on the left
        }
        const sx = (W / 2 - mx) / Math.max(1e-3, Math.abs(dx)), sy = ((dy < 0 ? cy - top : H - bot - cy)) / Math.max(1e-3, Math.abs(dy));
        const k = Math.min(sx, sy);
        x = cx + dx * k; y = cy + dy * k;
        const a = Math.atan2(dy, dx) + Math.PI / 2;
        const arw = e.firstChild; if (arw) arw.style.transform = `rotate(${a.toFixed(3)}rad)`;
      }
      toggle(e, 'edge', edge);
      // declutter: a label that would sit on an earlier marker's label, the lock box and its info, or the prompt is
      // dropped (the diamond stays); so is the label of the locked target's own marker (the lock box names it)
      // (labels are 11 px mono, about 6.6 px a character, two lines below the diamond: the label and the distance)
      const hw = edge ? 22 : Math.max(String(m.label ?? '').length, 6) * 3.3 + 3;
      const lx0 = x - hw, lx1 = x + hw, ly0 = y - 4, ly1 = y + 24;
      const clash = !!(m.target && m.target === p?.lock && !edge) || occupied(lx0, ly0, lx1, ly1);
      if (!clash) occupy(lx0, ly0, lx1, ly1);
      toggle(e, 'nolabel', clash);
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
      basePrompt = text ? { text: String(text), key: o?.key ?? 'F', hold: !!o?.hold, progress: o?.progress ?? null } : null;
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
    // ---- clarity pass (docs/todo.md)
    /** explain({ id, term, text, key? }): a short first-time hint card (term in bold, one or two sentences, an optional
     *  key or button). text and key may be { desktop, touch }; a plain key ('F', 'Hold RMB') names the on-screen button
     *  on touch. Only the first call for an id does anything: it records the entry in save.flags.glossary (kept in the
     *  order met, listed in the pause menu's Field notes) and queues the card. Returns true when recorded. Never throws. */
    explain(o) {
      try {
        if (!o || typeof o !== 'object') return false;
        // only strings (and numbers) count as text: an object or a function in a text field is dropped, not shown
        const str = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
        const pair = (v) => {
          if (!v || typeof v !== 'object') return str(v);
          const d = str(v.desktop), t = str(v.touch);
          return d && t ? { desktop: d, touch: t } : (d || t);
        };
        const term = str(o.term);
        const text = pair(o.text);
        const id = str(o.id) || (term ? 'term:' + term.toLowerCase() : '');
        if (!id || !text) return false;   // a card needs an id (or a term to name it) and something to say
        const list = glossaryList();
        if (list.some(x => x && x.id === id) || EX.cur?.id === id || EX.queue.some(x => x.id === id)) return false;
        const entry = { id, term, text };
        // `keys: { desktop, touch }` (an optional extra) keeps both variants, so the card and the Field notes follow a
        // later switch of input mode; otherwise `key` as given
        const both = o.keys && typeof o.keys === 'object' ? pair(o.keys) : '';
        const key = typeof both === 'object' ? both : pair(o.key);
        if (key) entry.key = key;
        const lv = ctx.mission?.def?.id; if (lv) entry.level = String(lv);
        try { ctx.save?.setFlag?.('glossary', [...list.filter(Boolean).map(x => ({ ...x })), entry]); }
        catch (e) { console.warn('[hud] explain: could not save the glossary', e); }
        EX.queue.push(entry);
        try { ctx.events.emit('hud:explain', { id, term }); } catch (e) { console.warn('[hud] explain listener', e); }
        return true;
      } catch (e) { console.warn('[hud] explain', e); return false; }
    },
    /** extra: the card on screen ({ id, term, visible, left }), or null; queued ids (tests) */
    get explainState() {
      return EX.cur ? { id: EX.cur.id, term: EX.cur.term, visible: !exEl.hidden && !exEl.classList.contains('out'), left: Math.max(0, EX.dur - EX.t), queued: EX.queue.map(x => x.id) }
                    : (EX.queue.length ? { id: null, queued: EX.queue.map(x => x.id) } : null);
    },
    /** extra: a card's key as shown on this device (a { desktop, touch } pair resolved; a keyboard key → the touch button) */
    explainKey(k) { try { return exKey(k); } catch (e) { return ''; } },
    /** extra: the recorded glossary (save.flags.glossary), in the order met */
    get glossary() { return glossaryList().map(x => ({ ...x })); },
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
      setBladeTear(false);
      explicitBoss = null; autoBoss = null; callsignFrame = null; lastFrameAuto = '';
      setText(el.callsign, ''); setText(el.frameSub, '');
      basePrompt = null; renderPrompt();
      warnings.clear(); hintT = 0; zoneT = 0; toastT = 0; glitchT = 0;
      if (CH.def) endChoice(null);
      api.progress(null); api.setCinematic(false); api.skipHint(null);
      // a fade or the bars left by the stopped run don't carry into the new one (the level script sets its own)
      if (api.fadeLevel !== 0 || fadeDone) api.fade(0, 0);
      if (api.letterboxOn) api.letterbox(false, 0);
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
      nOcc = 0;
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
      tickExplain(dt);
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
      // stacking: the zone card moves under a visible boss bar, the warnings under both (touch layouts are tight)
      const bossOn = !!el.bossbar && !el.bossbar.hidden;
      toggle(el.hud, 'boss-on', bossOn);
      // touch: comms and the boss bar share the top centre; a comms box taller than the gap pushes the bar (and the
      // zone card and warnings stacked under it) down. Measured at 5 Hz, only while both are up.
      let bt = 64;
      if (bossOn && ctx.input?.isTouch && commsEl && !commsEl.hidden && !commsEl.classList.contains('overblack') && !cine) {
        if (commsBottom >= 0) bt = Math.max(64, Math.round(commsBottom + 8));
        else {
          bossTopAcc -= dt;
          if (bossTopAcc > 0) bt = bossTop;
          else { bossTopAcc = 0.2; const r = commsEl.getBoundingClientRect(); bt = Math.max(64, Math.round(r.bottom + 8)); }
        }
      }
      if (bt !== bossTop) { bossTop = bt; el.hud.style.setProperty('--boss-top', bt + 'px'); }
      toggle(el.hud, 'zone-on', zoneT > 0);
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
  ctx.events.on('level:cleared', () => {
    markers = []; explicitBoss = null; autoBoss = null; if (CH.def) endChoice(null); api.prompt(null); api.progress(null);
    EX.queue.length = 0; if (EX.cur) exHide(); EX.gap = 0;   // the notes stay in the glossary (Field notes)
  });
  ctx.events.on('resize', () => { tagsDirty = true; });

  // sim-clock countdowns (fade, choice) run in a 'sim' system so they freeze while the game is paused
  ctx.addSystem({ name: 'hud-sim', phase: 'ui', when: 'sim', order: -1, update: (dt) => { tickFade('sim', dt); tickChoice(dt); } });
  ctx.addSystem({ name: 'hud', phase: 'ui', when: 'always', update: (dt) => api.update(dt) });
  ctx.hud = api;
  return api;
}
