// ui/screens.js (P5) — P0 STUB: plain, promise-based versions of every screen, built from the prototype's .doc and
// .center-card styles. Each show* renders into #screen and resolves with the player's choice. Keyboard: Enter activates
// the focused button, Esc takes the screen's back/resume option, arrow keys move focus.
import { esc, formatTime } from '../core/util.js';
import { SETTINGS_SCHEMA } from '../core/settings.js';

const TIPS = ['Quick boost costs energy. Watch the EN bar.', 'Staggered targets take bonus damage.', 'Hold jump in the air to hover.'];

export function install(ctx) {
  const root = document.getElementById('screen');
  let pending = null, escValue = undefined, typer = 0;

  function open(name, html, cls = '', esc = undefined) {
    close(null);
    api.current = name;
    root.className = cls;
    root.innerHTML = html;
    root.hidden = false;
    root.scrollTop = 0;
    escValue = esc;
    return new Promise(res => { pending = res; });
  }
  function close(value) {
    cancelAnimationFrame(typer);
    const p = pending; pending = null;
    if (p) p(value);
  }
  function done(value) {
    ctx.audio?.unlock?.();
    ctx.audio?.play?.(value === escValue ? 'uiBack' : 'uiSelect', null);
    close(value);
  }
  function bind(map) {
    for (const [id, value] of Object.entries(map)) {
      const b = root.querySelector('#' + id);
      if (b) b.addEventListener('click', () => done(value));
    }
    const first = root.querySelector('[autofocus]') || root.querySelector('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }
  /** prototype typeInto: real-time typewriter for menus; a click completes it */
  function typeInto(el, text, cps = 70, then) {
    if (!el) return;
    const start = performance.now();
    let i = 0;
    const step = () => {
      if (!el.isConnected) return;
      i = Math.min(text.length, Math.floor((performance.now() - start) / 1000 * cps));
      el.textContent = text.slice(0, i);
      if (i < text.length) { if (Math.random() < 0.3) ctx.audio?.play?.('blip', null); typer = requestAnimationFrame(step); }
      else then?.();
    };
    el.addEventListener('click', () => { i = text.length; el.textContent = text; cancelAnimationFrame(typer); then?.(); }, { once: true });
    step();
  }
  const btn = (id, label, ghost = false, extra = '') => `<button type="button" class="btn${ghost ? ' ghost' : ''}" id="${id}" ${extra}>${esc(label)}</button>`;

  document.addEventListener('keydown', (e) => {
    if (!pending || root.hidden) return;
    if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;   // a held Esc must not toggle pause on and off
    if (e.code === 'Escape' && escValue !== undefined) { e.preventDefault(); done(escValue); return; }
    if (e.code === 'KeyP' && api.current === 'pause') { e.preventDefault(); done('resume'); return; }
    if (e.code.startsWith('Arrow')) {
      const bs = [...root.querySelectorAll('button:not([disabled]), input, select')];
      if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      if (document.activeElement?.tagName === 'INPUT' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;
      const d = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1;
      bs[(i + d + bs.length) % bs.length].focus();
      ctx.audio?.play?.('uiMove', null);
      e.preventDefault();
    }
  });

  const api = {
    current: null,
    hide() {
      close(null);
      api.current = null;
      root.innerHTML = ''; root.className = ''; root.hidden = true;
    },
    showTitle(m = {}) {
      const touch = ctx.input?.isTouch;
      const controls = touch
        ? [['Move', 'LEFT THUMB'], ['Aim', 'DRAG RIGHT SIDE'], ['Fire', 'HOLD FIRE'], ['Blade', 'BLADE'], ['Quick boost', 'BOOST'], ['Jump / hover', 'HOLD JUMP'], ['Missiles', 'MSL'], ['Pause', 'II']]
        : [['Move', 'W A S D'], ['Aim', 'MOUSE'], ['Jump / hover', 'SPACE'], ['Quick boost', 'SHIFT'], ['Fire', 'LEFT CLICK'], ['Blade', 'RIGHT CLICK'], ['Missiles', 'Q'], ['Hard lock', 'E'], ['Repair kit', 'R'], ['Pause', 'ESC']];
      const p = open('title', `
        <div class="title-wrap">
          <div class="org">BUILD 0.1 · PROVING</div>
          <h1>Dawn<span>wake</span></h1>
          <div class="tag">Follow the thaw. Carry what you can.</div>
          <div class="actions">
            ${m.canContinue ? btn('bCont', m.continueLabel || 'Continue', false, 'autofocus') : ''}
            ${btn('bNew', 'New game', !!m.canContinue, m.canContinue ? '' : 'autofocus')}
            ${btn('bSelect', 'Level select', true)}
            ${btn('bGarage', 'Garage', true)}
            ${btn('bSettings', 'Settings', true)}
            ${btn('bCredits', 'Credits', true)}
          </div>
          <div class="controls">${controls.map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div>
          <div class="touchnote">Best played in landscape, with sound on.</div>
        </div>`, 'title');
      bind({ bCont: 'continue', bNew: 'new', bSelect: 'select', bGarage: 'garage', bSettings: 'settings', bCredits: 'credits' });
      return p;
    },
    showLevelSelect(m = {}) {
      const rows = (m.levels || []).map((l, i) => l.unlocked
        ? `<button type="button" class="list-item" id="lv${i}"><span class="nm">${esc(l.title)}</span><span class="meta">${esc(l.subtitle || '')}${l.completed ? ` · BEST ${l.bestTime != null ? formatTime(l.bestTime) : '--:--'} · ${l.bestRank || '-'}` : ''}</span></button>`
        : `<button type="button" class="list-item locked" disabled><span class="nm">CLASSIFIED</span><span class="meta">Locked</span></button>`).join('');
      const p = open('levelSelect', `<div class="doc">
          <div class="hdr"><span>LEVEL SELECT</span><span>${(m.levels || []).filter(l => l.unlocked).length} / ${(m.levels || []).length}</span></div>
          <h2>Levels</h2>
          <div class="list">${rows}</div>
          <div class="actions">${btn('bBack', 'Back', true)}</div></div>`, '', 'back');
      const map = { bBack: 'back' };
      (m.levels || []).forEach((l, i) => { if (l.unlocked) map['lv' + i] = l.id; });
      bind(map);
      return p;
    },
    showBriefing(m) {
      const L = m.level, b = L.briefing || { title: L.title, body: '' };
      const p = open('briefing', `<div class="doc">
          <div class="hdr"><span>${esc(b.header || 'BRIEFING')}</span><span>${esc(L.title)}</span></div>
          <h2>${esc(b.title || L.title)}</h2>
          <div class="sub">${esc(b.subtitle || L.subtitle || '')}</div>
          <div class="body" id="briefBody"></div>
          <dl><dt>Objectives</dt><dd>${(b.objectives || []).map(esc).join('<br>')}</dd></dl>
          ${b.fine ? `<div class="fine">${esc(b.fine)}</div>` : ''}
          <div class="actions">${btn('bStart', 'Deploy', false, 'autofocus')}${btn('bFit', 'Fit frame', true)}${btn('bBack', 'Back', true)}</div>
        </div>`, '', 'back');
      bind({ bStart: 'start', bFit: 'garage', bBack: 'back' });
      typeInto(root.querySelector('#briefBody'), b.body || '', 90);
      return p;
    },
    showLoading(m = {}) {
      open('loading', `<div class="center-card loading">
          <div class="eyebrow">Loading</div><h2>${esc(m.title || '')}</h2>
          <div class="stat-bar"><i id="ldBar"></i></div><p class="mono" id="ldLbl">&nbsp;</p>
          <p class="tip">${esc(m.tip || TIPS[Math.floor(Math.random() * TIPS.length)])}</p></div>`, 'loading');
      const bar = root.querySelector('#ldBar'), lbl = root.querySelector('#ldLbl');
      return {
        set(p, label) { if (bar) bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%'; if (lbl && label) lbl.textContent = label; },
        close() { if (api.current === 'loading') api.hide(); },
      };
    },
    showPause(m = {}) {
      const objs = (m.objectives || []).filter(o => o.state !== 'hidden')
        .map(o => `<li class="${o.state}">${esc(o.text)}</li>`).join('');
      const log = (m.commsLog || []).slice(-6).map(l => `<div><b>${esc(l.name)}</b> ${esc(l.text)}</div>`).join('');
      const p = open('pause', `<div class="center-card pause">
          <div class="eyebrow">${esc(m.title || '')}</div><h2>Paused</h2>
          ${objs ? `<ul class="objlist">${objs}</ul>` : ''}
          <div class="actions">${btn('bRes', 'Resume', false, 'autofocus')}${btn('bRetry', 'Restart from checkpoint', true)}${btn('bSet', 'Settings', true)}${btn('bQuit', 'Quit to title', true)}</div>
          ${m.drawMap ? '<canvas id="pMap" width="320" height="200"></canvas>' : ''}
          ${log ? `<div class="commslog">${log}</div>` : ''}</div>`, 'dim', 'resume');
      bind({ bRes: 'resume', bRetry: 'restart', bSet: 'settings', bQuit: 'quit' });
      const c = root.querySelector('#pMap');
      if (c && m.drawMap) { try { m.drawMap(c); } catch (e) { console.warn('[screens] map', e); } }
      return p;
    },
    showSettings() {
      const s = ctx.settings;
      const row = (k, label) => {
        const sc = SETTINGS_SCHEMA[k], v = s.get(k);
        if (sc.bool) return `<label class="set-row"><span>${label}</span><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}></label>`;
        if (sc.options) return `<label class="set-row"><span>${label}</span><select data-k="${k}">${sc.options.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
        return `<label class="set-row"><span>${label}</span><input type="range" data-k="${k}" min="${sc.min}" max="${sc.max}" step="${sc.step}" value="${v}"><output>${v}</output></label>`;
      };
      const p = open('settings', `<div class="doc settings-doc">
          <div class="hdr"><span>SETTINGS</span><span>Saved automatically</span></div>
          <h2>Settings</h2>
          <div class="set-grid">
            ${row('sens', 'Look speed')}${row('invertY', 'Invert Y')}${row('fov', 'Field of view')}${row('cameraShake', 'Camera shake')}
            ${row('volMaster', 'Master volume')}${row('volMusic', 'Music volume')}${row('volSfx', 'Effects volume')}
            ${row('quality', 'Graphics quality')}${row('ao', 'Ambient occlusion')}${row('touch', 'Touch controls')}
            ${row('commsSpeed', 'Comms speed')}${row('showFps', 'Show FPS')}${row('reducedMotion', 'Reduced motion')}
          </div>
          <div class="actions">${btn('bBack', 'Back', false, 'autofocus')}</div></div>`, '', 'back');
      root.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        const ev = inp.type === 'range' ? 'input' : 'change';
        inp.addEventListener(ev, () => {
          const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
          s.set(k, v);
          const out = inp.parentElement.querySelector('output'); if (out) out.textContent = String(s.get(k));
        });
      });
      bind({ bBack: 'back' });
      return p.then(() => undefined);
    },
    showDeath(m = {}) {
      const p = open('death', `<div class="center-card">
          <div class="eyebrow">Signal lost</div><h2 class="threat">Frame lost</h2><p>${esc(m.line || '')}</p>
          <div class="actions">${btn('bRetry', m.hasCheckpoint ? 'Retry from checkpoint' : 'Retry', false, 'autofocus')}${btn('bQuit', 'Quit to title', true)}</div></div>`, 'dim', 'quit');
      bind({ bRetry: 'retry', bQuit: 'quit' });
      return p;
    },
    showDebrief(m) {
      const r = m.result || {}, L = m.level || {};
      const row = (a, b) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
      const p = open('debrief', `<div class="doc">
          <div class="hdr"><span>DEBRIEF</span><span>${esc(L.title || '')}</span></div>
          <h2>${esc(L.title || 'Complete')}</h2><div class="sub">Complete · ${formatTime(r.time)} · Rank ${esc(r.rank || '-')}</div>
          <table class="ledger">
            ${row('Time', formatTime(r.time))}${row('Targets destroyed', r.kills ?? 0)}${row('Damage taken', Math.round(r.damageTaken || 0))}
            ${row('Rounds fired', r.shots ?? 0)}${row('Salvage recovered', (r.collectibles || []).length)}
            <tr class="total"><td>Rank</td><td>${esc(r.rank || '-')}</td></tr>
          </table>
          ${(m.unlocks || []).length ? `<div class="fine">Unlocked: ${m.unlocks.map(esc).join(', ')}</div>` : ''}
          <div class="actions">${btn('bNext', 'Continue', false, 'autofocus')}${btn('bGarage', 'Garage', true)}${btn('bQuit', 'Title', true)}</div></div>`, '', 'quit');
      bind({ bNext: 'next', bGarage: 'garage', bQuit: 'quit' });
      return p;
    },
    async showInterstitial(pages = [], o = {}) {
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i], last = i === pages.length - 1;
        const p = open('interstitial', `<div class="center-card inter ${esc(pg.style || 'black')}">
            ${pg.title ? `<h2>${esc(pg.title)}</h2>` : ''}<p id="itP"></p>
            <div class="actions" id="itA" hidden>${btn('bNext', last ? 'Continue' : 'Next', false)}${o.skippable && !last ? btn('bSkip', 'Skip', true) : ''}</div></div>`,
          'inter ' + (pg.style || 'black'), o.skippable ? 'skip' : undefined);
        bind({ bNext: 'next', bSkip: 'skip' });
        typeInto(root.querySelector('#itP'), pg.text || '', 40, () => { const a = root.querySelector('#itA'); if (a) { a.hidden = false; a.querySelector('button')?.focus(); } });
        const r = await p;
        if (r === 'skip' || r === null) break;
      }
      if (api.current === 'interstitial') api.hide();
    },
    showCredits(m = {}) {
      const p = open('credits', `<div class="center-card credits">
          <h2>Credits</h2>${(m.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}
          <div class="actions">${btn('bBack', 'Back', false, 'autofocus')}</div></div>`, '', 'back');
      bind({ bBack: 'back' });
      return p.then(() => undefined);
    },
  };
  root.hidden = true;
  ctx.screens = api;
  return api;
}
