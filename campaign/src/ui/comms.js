// ui/comms.js (P5): the comms box. Port of the prototype typewriter (42 chars/s × settings.commsSpeed, hold
// 1.4 s + 0.032 s per character), speakers with colour through the --spk CSS variable, the waveform canvas and a log
// for the pause menu. Addendum A5.2 (R5): SpeakerDef typography (font, italic, weight, speed, static, channel, chime),
// `name: ''` hides the label, the box renders above #fade and #letterbox (it is re-parented from #hud to #game, so it
// also stays up during hideHud cinematics), a mid-level defineSpeakers() applies to later lines only.
//
// Timing runs on sim time (system 'comms', ui phase, when 'sim'): lines freeze while the game is paused and scale with
// ctx.timeScale. say()/play() return simDeferred() promises that settle inside the comms tick (§1.4), so a mission list
// waiting on them resumes in that tick whatever the step() chunking.
//
// Queue rules: say() appends; priority 'high' finishes the current line at once and jumps the queue. A speaker with
// `chime: true` (the OPEN channel) interrupts the same way, plays the 'chime' SFX, waits 1.05 s, then types. play()
// keeps a script together: a script that contains a chime line or a high-priority line jumps the queue as a block.
// The box is visible only in the flow states playing, paused, complete and dead.
import { simDeferred, simResolved, injectCSS } from '../core/util.js';

const CPS = 42;                        // prototype characters per second at commsSpeed 1
const CHIME_WAIT = 1.05;               // A5.2: play the chime, wait 1.05 s, then type
const SHOW = new Set(['playing', 'paused', 'complete', 'dead']);
const FONTS = new Set(['sans', 'monoCaps', 'serif']);
const NOISE = '▒░▓';

const CSS = `
#comms{z-index:3;pointer-events:none;overflow:hidden}
#comms:not([hidden]){animation:commsIn .16s ease-out}
@keyframes commsIn{from{opacity:0}to{opacity:1}}
#comms .who{min-height:16px}
#comms .who .chan{font:500 10px/1 var(--f-mono);letter-spacing:.14em;padding:2px 5px 1px;border:1px solid currentColor;opacity:.75}
#comms .who .chan:empty{display:none}
#comms.noname .who span.nm{display:none}
#comms .line{font-weight:var(--cw,400);white-space:pre-wrap}
#comms[data-font=monoCaps] .line{text-transform:uppercase;letter-spacing:.07em;font-size:13px}
#comms[data-font=sans] .line{font-family:var(--f-display);font-size:18px;line-height:1.35;letter-spacing:.02em}
#comms[data-font=serif] .line{font-family:Georgia,"Iowan Old Style","Times New Roman",serif;font-size:16px;line-height:1.45}
#comms.upright .line{font-style:normal}
#comms.italic .line{font-style:italic}
#comms[data-style=system]{background:linear-gradient(90deg,rgba(6,7,9,.86),rgba(6,7,9,.4));border-left-style:solid}
#comms[data-style=system] .line{letter-spacing:.06em}
#comms .stat{position:absolute;inset:0;pointer-events:none;opacity:calc(var(--static,0) * .7);mix-blend-mode:screen;display:none;
  background:repeating-linear-gradient(0deg,rgba(233,227,211,.13) 0 1px,transparent 1px 3px),
             linear-gradient(90deg,transparent,rgba(233,227,211,.06) 40%,transparent 60%);
  background-size:100% 9px,300% 100%}
#comms.static .stat{display:block;animation:commsStatic .22s steps(3) infinite}
@keyframes commsStatic{0%{background-position:0 0,0 0}33%{background-position:0 -4px,40% 0}66%{background-position:0 3px,90% 0}}
#comms.chiming .line::after{content:"";display:inline-block;width:7px;height:7px;margin-left:2px;border-radius:50%;
  background:var(--spk);animation:commsChime .35s ease-in-out infinite alternate}
@keyframes commsChime{from{opacity:.25}to{opacity:1}}
#comms .line .cur{display:inline-block;width:.55em;height:1em;margin-left:1px;vertical-align:-2px;background:var(--spk);opacity:.7}
#game.cine #comms:not(.overblack){left:50%;right:auto;top:auto;bottom:calc(11vh + 16px);transform:translateX(-50%);width:min(640px,72vw);
  background:linear-gradient(90deg,rgba(12,11,14,0),rgba(12,11,14,.62) 18%,rgba(12,11,14,.62) 82%,rgba(12,11,14,0));border-left-color:transparent;text-align:center}
#game.cine #comms:not(.overblack) .who{justify-content:center}
#comms.overblack{left:50%!important;right:auto!important;top:50%!important;bottom:auto!important;transform:translate(-50%,-50%)!important;
  width:min(620px,84vw)!important;background:none!important;border-left-color:transparent;text-align:center;padding:0}
#comms.overblack .who{justify-content:center}
#comms.overblack .who canvas{display:none}
#game #comms.overblack .line{font-size:16px;line-height:1.55;margin-top:10px}
#game #comms.overblack[data-font=sans] .line{font-size:21px}
#game #comms.overblack[data-font=serif] .line{font-size:19px}
#game #comms.overblack .who{font-size:12px}
@media (prefers-reduced-motion:reduce){#comms .stat{animation:none}#comms:not([hidden]){animation:none}}
`;

export function install(ctx) {
  injectCSS('comms', CSS);
  const $ = (s) => document.querySelector(s);
  const box = $('#comms');
  // A5.2: render above #fade and #letterbox, and outside #hud so hideHud shots and hud.show(false) keep it
  const game = $('#game');
  if (box && game && box.parentElement !== game) game.appendChild(box);
  const whoEl = box?.querySelector('.who');
  const nameEl = box?.querySelector('.who span');
  if (nameEl) nameEl.classList.add('nm');
  let chanEl = box?.querySelector('.who .chan');
  if (whoEl && !chanEl) { chanEl = document.createElement('i'); chanEl.className = 'chan'; whoEl.insertBefore(chanEl, nameEl || null); }
  const lineEl = box?.querySelector('.line');
  let statEl = box?.querySelector('.stat');
  if (box && !statEl) { statEl = document.createElement('div'); statEl.className = 'stat'; box.appendChild(statEl); }
  const wave = $('#wave');
  const wctx = wave ? wave.getContext('2d') : null;

  const speakers = {};
  const queue = [];
  let cur = null, typed = 0, holdT = 0, blipT = 0, sp = null, phase = 'type', waveT = 0, lastShown = '';

  function finish() {
    const c = cur; cur = null; phase = 'type';
    if (box) box.classList.remove('chiming');
    if (c) c.resolve();
  }
  const allowed = () => SHOW.has(ctx.flow?.state ?? 'playing');
  function setVisible(on) { if (box && box.hidden === !!on) box.hidden = !on; }
  function speaker(who) { return speakers[who] || { name: who, color: '' }; }
  function makeItem(who, text, o, d) {
    const s = speaker(who);
    return { who, text: String(text ?? ''), hold: o.hold, resolve: d.resolve, chime: !!s.chime, high: o.priority === 'high' || !!s.chime };
  }
  /** a line (or a block of lines) that interrupts: the current line finishes now, the block goes to the front */
  function interrupt(items) {
    queue.unshift(...items);
    if (cur) finish();
  }

  function startLine() {
    cur = queue.shift(); typed = 0; holdT = 0; blipT = 0; phase = 'type';
    if (cur.wait !== undefined) { setVisible(false); return; }
    sp = speaker(cur.who);
    const name = sp.name ?? cur.who;
    if (box) {
      box.style.setProperty('--spk', sp.color || 'var(--hud)');
      const stat = Math.max(0, Math.min(1, +sp.static || 0));
      box.style.setProperty('--static', String(stat));
      box.classList.toggle('static', stat > 0);   // the static layer (and its infinite animation) only when needed
      box.style.setProperty('--cw', String(sp.weight || 400));
      box.dataset.style = sp.style || 'radio';
      box.dataset.font = FONTS.has(sp.font) ? sp.font : 'mono';
      box.classList.toggle('italic', !!sp.italic);
      // a speaker with an explicit `font` has its typography fully specified: upright unless `italic` (the 'internal'
      // style's default italic applies only to speakers without a font)
      box.classList.toggle('upright', FONTS.has(sp.font) && !sp.italic);
      box.classList.toggle('noname', name === '');
    }
    if (nameEl) nameEl.textContent = name;
    if (chanEl) chanEl.textContent = sp.channel && sp.channel !== 'LOCAL' ? sp.channel : '';
    if (lineEl) lineEl.textContent = '';
    lastShown = '';
    api.log.push({ who: cur.who, name, text: cur.text, t: ctx.mission?.elapsed ?? ctx.clock.time });
    if (api.log.length > 200) api.log.splice(0, api.log.length - 200);
    ctx.events.emit('comms:line', { who: cur.who, text: cur.text });
    if (cur.chime) {
      phase = 'chime';
      box?.classList.add('chiming');
      ctx.audio?.play?.('chime', null);
    }
    if (allowed()) setVisible(true);
  }

  function render(c) {
    if (!lineEl) return;
    const n = Math.floor(typed);
    let s = c.text.slice(0, n);
    const st = +sp?.static || 0;
    if (st > 0 && n < c.text.length && s.length > 2) {   // visual static: a few corrupted glyphs at the write head
      const a = s.split('');
      for (let k = Math.max(0, a.length - 5); k < a.length; k++) if (a[k] !== ' ' && Math.random() < st * 0.35) a[k] = NOISE[(Math.random() * 3) | 0];
      s = a.join('');
    }
    if (s !== lastShown) { lineEl.textContent = s; lastShown = s; }
  }

  function drawWave(dt) {
    if (!wctx) return;
    waveT += dt;
    const typing = cur && cur.wait === undefined && phase === 'type' && typed < cur.text.length;
    wctx.clearRect(0, 0, 128, 32);
    wctx.fillStyle = sp?.color || '#e9e3d3';
    const st = +sp?.static || 0, t = waveT;
    for (let i = 0; i < 16; i++) {
      let h = typing ? 4 + Math.abs(Math.sin(t * 17 + i * 1.7) * Math.sin(t * 5 + i)) * 24 : 3;
      if (phase === 'chime') h = 3 + Math.max(0, Math.sin(t * 9 - i * 0.5)) * 10;
      if (st > 0) h += Math.random() * st * 8;
      wctx.fillRect(i * 8, 16 - h / 2, 5, h);
    }
  }

  const api = {
    log: [],
    /** merged per speaker (a mid-level rename like { MOTH: { name: 'MOTH' } } keeps the other fields) */
    defineSpeakers(map) {
      for (const [k, v] of Object.entries(map || {})) speakers[k] = { ...(speakers[k] || {}), ...(v || {}) };
    },
    /** extra: the resolved speaker definition (tests, Bench lines) */
    speaker(who) { return { ...speaker(who) }; },
    say(who, text, o = {}) {
      const d = simDeferred();
      const item = makeItem(who, text, o || {}, d);
      if (item.high) interrupt([item]); else queue.push(item);
      return d.promise;
    },
    play(lines = []) {
      const items = [];
      let last = null;
      for (const l of lines || []) {
        if (!l) continue;
        const d = simDeferred();
        if ('wait' in l && !('text' in l)) items.push({ wait: Math.max(0, +l.wait || 0), resolve: d.resolve });
        else items.push(makeItem(l.who, l.text, { hold: l.hold, priority: l.priority }, d));
        last = d.promise;
      }
      if (!items.length) return simResolved();
      if (items.some(i => i.high)) interrupt(items); else queue.push(...items);
      return last;
    },
    clear() {
      const pending = queue.splice(0);
      if (cur) finish();
      for (const q of pending) q.resolve();
      setVisible(false);
    },
    get busy() { return !!cur || queue.length > 0; },
    get current() { return cur && cur.wait === undefined ? { who: cur.who, text: cur.text } : null; },
    /** extra: lines queued behind the current one */
    get queued() { return queue.length; },
    /** extra: true while the current line is still typing (tests, skip logic) */
    get typing() { return !!cur && cur.wait === undefined && (phase === 'chime' || typed < cur.text.length); },
    update(dt) {
      // over a full fade to black the box moves to the centre of the screen, without its panel (L1's boot text and the
      // drowning's black are comms typography over black)
      const black = (ctx.hud?.fadeLevel ?? 0) >= 0.95;
      if (box && box.classList.contains('overblack') !== black) box.classList.toggle('overblack', black);
      if (!cur) {
        if (!queue.length) { setVisible(false); drawWave(dt); return; }
        startLine();
      }
      const c = cur;
      if (c.wait !== undefined) { holdT += dt; if (holdT >= c.wait) finish(); return; }
      if (allowed() && box?.hidden) setVisible(true);
      if (phase === 'chime') {
        holdT += dt;
        if (holdT >= CHIME_WAIT) { phase = 'type'; holdT = 0; box?.classList.remove('chiming'); }
        drawWave(dt);
        return;
      }
      const cps = CPS * (ctx.settings.get('commsSpeed') || 1) * (sp?.speed > 0 ? sp.speed : 1);
      if (typed < c.text.length) {
        typed = Math.min(c.text.length, typed + dt * cps);
        render(c);
        blipT -= dt;
        if (blipT <= 0) { blipT = 0.07; if (c.text[Math.floor(typed) - 1] !== ' ') ctx.audio?.blip?.(sp?.voice); }
      } else {
        if (lastShown !== c.text) render(c);
        holdT += dt;
        const need = c.hold ?? (1.4 + c.text.length * 0.032 - (queue.length > 2 ? 1 : 0));
        if (holdT > need) finish();
      }
      drawWave(dt);
    },
  };

  ctx.events.on('state:changed', ({ to }) => {
    if (!SHOW.has(to)) setVisible(false);
    else if (cur && cur.wait === undefined) setVisible(true);
  });
  ctx.events.on('level:cleared', () => { api.clear(); api.log.length = 0; });   // a checkpoint restart keeps the log
  ctx.addSystem({ name: 'comms', phase: 'ui', when: 'sim', update: (dt) => api.update(dt) });
  ctx.comms = api;
  return api;
}
