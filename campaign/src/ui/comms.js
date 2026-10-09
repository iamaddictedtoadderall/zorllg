// ui/comms.js (P5) — P0 STUB: a working minimal port of the prototype's comms typewriter (42 chars/s × commsSpeed,
// hold = 1.4 + 0.032 × length), speakers with colour via the --spk CSS variable, a log, and the waveform canvas.

export function install(ctx) {
  const $ = (s) => document.querySelector(s);
  const el = { box: $('#comms'), who: $('#comms .who span'), line: $('#comms .line'), wave: $('#wave') };
  const wctx = el.wave ? el.wave.getContext('2d') : null;
  const speakers = {};
  const queue = [];
  let cur = null, typed = 0, holdT = 0, blipT = 0, sp = null;

  function finish() {
    const c = cur; cur = null;
    if (c) c.resolve();
  }

  const api = {
    log: [],
    defineSpeakers(map) { Object.assign(speakers, map || {}); },
    say(who, text, o = {}) {
      return new Promise(resolve => {
        const item = { who, text: String(text ?? ''), hold: o.hold, resolve };
        if (o.priority === 'high') { if (cur && !cur.wait) finish(); queue.unshift(item); }
        else queue.push(item);
      });
    },
    play(lines = []) {
      let last = Promise.resolve();
      for (const l of lines) {
        if (l && 'wait' in l && !('text' in l)) last = new Promise(resolve => queue.push({ wait: Math.max(0, +l.wait || 0), resolve }));
        else if (l) last = api.say(l.who, l.text, { hold: l.hold });
      }
      return last;
    },
    clear() {
      const pending = queue.splice(0);
      if (cur) finish();
      for (const q of pending) q.resolve();
      if (el.box) el.box.hidden = true;
    },
    get busy() { return !!cur || queue.length > 0; },
    get current() { return cur && !cur.wait ? { who: cur.who, text: cur.text } : null; },
    /** extra: number of queued lines (not counting the current one) */
    get queued() { return queue.length; },
    update(dt) {
      if (!cur) {
        if (!queue.length) { if (el.box && !el.box.hidden) el.box.hidden = true; return; }
        cur = queue.shift(); typed = 0; holdT = 0;
        if (!cur.wait) {
          sp = speakers[cur.who] || { name: cur.who, color: '' };
          if (el.box) {
            el.box.hidden = false;
            el.box.style.setProperty('--spk', sp.color || 'var(--hud)');
            el.box.dataset.style = sp.style || 'radio';
          }
          if (el.who) el.who.textContent = sp.name || cur.who;
          if (el.line) el.line.textContent = '';
          api.log.push({ who: cur.who, name: sp.name || cur.who, text: cur.text, t: ctx.mission?.elapsed ?? ctx.clock.time });
          if (api.log.length > 200) api.log.splice(0, api.log.length - 200);
          ctx.events.emit('comms:line', { who: cur.who, text: cur.text });
        } else if (el.box) el.box.hidden = true;
      }
      const c = cur;
      if (c.wait !== undefined) { holdT += dt; if (holdT >= c.wait) finish(); return; }
      const cps = 42 * (ctx.settings.get('commsSpeed') || 1);
      if (typed < c.text.length) {
        typed = Math.min(c.text.length, typed + dt * cps);
        if (el.line) el.line.textContent = c.text.slice(0, Math.floor(typed));
        blipT -= dt; if (blipT <= 0) { blipT = 0.07; ctx.audio?.blip?.(sp?.voice); }
      } else {
        holdT += dt;
        const need = c.hold ?? (1.4 + c.text.length * 0.032 - (queue.length > 2 ? 1 : 0));
        if (holdT > need) finish();
      }
      // waveform
      if (wctx) {
        const t = ctx.clock.realTime;
        wctx.clearRect(0, 0, 128, 32);
        const typing = cur && typed < c.text.length;
        wctx.fillStyle = sp?.color || '#e9e3d3';
        for (let i = 0; i < 16; i++) {
          const h = typing ? 4 + Math.abs(Math.sin(t * 17 + i * 1.7) * Math.sin(t * 5 + i)) * 24 : 3;
          wctx.fillRect(i * 8, 16 - h / 2, 5, h);
        }
      }
    },
  };
  ctx.addSystem({ name: 'comms', phase: 'ui', when: 'sim', update: (dt) => api.update(dt) });
  ctx.comms = api;
  return api;
}
