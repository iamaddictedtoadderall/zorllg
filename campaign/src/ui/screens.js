// ui/screens.js (P5): every menu screen (§4.5), built on the prototype's .doc and .center-card styles. Each show*
// renders into #screen and resolves with the player's choice; flow decides what happens next.
// Addendum A3.7: showDebrief takes title/rows/actions, showBriefing takes canFit, showMorningCount (Day n card on a
// canvas map strip of Gaunt).
// Keyboard: Enter or Space activates the focused button (Enter with nothing focused takes the primary one), Esc takes
// the screen's back/resume option, the arrow keys move focus. Typewriters run on real time (menus: §1.4 allows it);
// a click, Enter or Space completes a typewriter at once.
import { esc, formatTime, injectCSS, mulberry32, hashString } from '../core/util.js';
import { SETTINGS_SCHEMA } from '../core/settings.js';

const TIPS = [
  'Quick boost costs energy. Watch the EN bar.',
  'Staggered targets take bonus damage.',
  'Hold jump in the air to hover. Hover burns EN.',
  'Missiles fire at every target inside the reticle.',
  'Repair kits heal over a second. Use them before the bar runs out.',
  'The blade lunges to your locked target.',
];
const RANK_TEXT = { S: 'Exemplary', A: 'Clean', B: 'Steady', C: 'Survived' };

const SCREEN_CSS = `
#screen{z-index:4}
#fade{z-index:2}
#screen .doc{box-shadow:0 18px 60px rgba(0,0,0,.45)}
#screen.menu-dark{background:rgba(8,8,10,.72)}
#screen.debrief{background:linear-gradient(90deg,rgba(8,8,10,.9),rgba(8,8,10,.55))}
.doc .kv{display:flex;justify-content:space-between;gap:12px;font-family:var(--f-mono);font-size:11px;color:var(--hud-dim)}
.doc .objlist{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.doc .objlist li{display:flex;gap:10px;align-items:baseline;font-size:16px;letter-spacing:.06em;text-transform:uppercase}
.doc .objlist li::before{content:"";flex:none;width:7px;height:7px;border:1px solid var(--hud);transform:translateY(-1px) rotate(45deg)}
.doc .objlist li.done{color:var(--hud-dim);text-decoration:line-through}
.doc .objlist li.done::before{background:var(--hud-dim);border-color:var(--hud-dim)}
.doc .objlist li.failed{color:var(--threat);text-decoration:line-through}
.doc .objlist li .pg{font-family:var(--f-mono);font-size:12px;color:var(--hud-dim)}
.doc h3{font-size:12px;letter-spacing:.3em;color:var(--hud-dim);font-weight:600;margin:20px 0 8px;text-transform:uppercase}
.doc .body .cur,.center-card .cur{display:inline-block;width:.55em;height:1.05em;vertical-align:-2px;background:var(--accent);margin-left:2px;animation:scrCur .8s steps(2) infinite}
@keyframes scrCur{50%{opacity:0}}
.pause-wrap{margin:auto;display:grid;grid-template-columns:minmax(280px,420px) minmax(300px,500px);gap:22px;align-items:start;padding:0 20px;box-sizing:border-box;max-width:980px;width:100%}
.pause-wrap .doc{margin:0;width:auto}
.pause-wrap .doc h2{margin-top:10px}
.pause-wrap .actions{display:grid!important;grid-template-columns:1fr;gap:8px!important}
.pause-wrap .actions .btn{text-align:left}
.pause-side{display:grid;gap:14px}
.pause-side .panel{padding:14px 16px}
.pause-side canvas{display:block;width:100%;height:auto;border:1px solid var(--hud-faint);background:#0c0b0e}
.pause-side .maplegend{display:flex;gap:14px;margin-top:8px;font-family:var(--f-mono);font-size:10px;color:var(--hud-dim)}
.pause-side .maplegend i{display:inline-block;width:8px;height:8px;margin-right:5px;vertical-align:-1px}
.pause-log{max-height:190px;overflow-y:auto;font-family:var(--f-mono);font-size:12px;line-height:1.55;color:var(--hud-dim);scrollbar-width:thin}
.pause-log div{padding:2px 0;border-bottom:1px solid rgba(233,227,211,.05)}
.pause-log b{font-weight:600;letter-spacing:.12em;margin-right:8px}
.pause-log .empty{opacity:.6}
@media (max-width:860px),(max-height:520px){.pause-wrap{grid-template-columns:1fr;max-width:460px}.pause-side{display:none}}
.set-group{margin-top:16px}
.set-group h3{margin:0 0 6px}
.set-row:focus-within{color:var(--hud)}
.set-row input[type=range]{height:18px}
.ledger td:first-child{letter-spacing:.06em;text-transform:uppercase;color:var(--hud-dim);font-family:var(--f-display);font-size:15px}
.ledger td:last-child{color:var(--hud)}
.ledger tr.hl td:last-child{color:var(--accent)}
.debrief-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.rank{display:grid;place-items:center;width:84px;height:84px;border:2px solid var(--accent);font:700 54px/1 var(--f-display);color:var(--accent);clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px)}
.rank small{display:block;font:500 9px var(--f-mono);letter-spacing:.2em;color:var(--hud-dim);text-align:center;margin-top:-4px}
.list-item .nm{display:flex;flex-direction:column;gap:2px}
.list-item .nm small{font-family:var(--f-mono);font-size:11px;letter-spacing:.04em;text-transform:none;color:var(--hud-dim)}
.list-item .rk{font:700 22px var(--f-display);color:var(--accent);min-width:22px;text-align:right}
.center-card.inter{max-width:760px}
.center-card.inter p{font-size:17px;line-height:1.85;text-align:left;letter-spacing:.01em}
.center-card.inter.black p{color:#e9e3d3}
.center-card.inter.paper{background:#e8dcc4;color:#2a241c;padding:40px 46px;box-shadow:0 20px 70px rgba(0,0,0,.6)}
.center-card.inter.paper p{color:#2a241c;font-family:Georgia,"Times New Roman",serif;font-size:18px}
.center-card.inter.paper .btn{background:#2a241c;color:#e8dcc4}
.center-card.inter.paper .btn.ghost{background:transparent;color:#2a241c;box-shadow:inset 0 0 0 1px rgba(42,36,28,.4)}
.center-card.inter.terminal p{color:var(--en);text-shadow:0 0 10px rgba(143,210,198,.35)}
.center-card.inter .pg{font-family:var(--f-mono);font-size:10px;letter-spacing:.2em;color:var(--hud-dim);margin-top:18px;text-align:left}
#screen.count{background:#06070a}
.count-wrap{margin:auto;width:min(920px,calc(100% - 32px));display:grid;gap:18px;padding:12px 0}
.count-wrap canvas{width:100%;height:auto;display:block;border-top:1px solid var(--hud-faint);border-bottom:1px solid var(--hud-faint)}
.count-day{font:700 clamp(56px,10vw,112px)/.86 var(--f-display);letter-spacing:.06em;text-transform:uppercase}
.count-day small{display:block;font:500 12px var(--f-mono);letter-spacing:.3em;color:var(--hud-dim);margin-bottom:10px}
.count-grid{display:grid;grid-template-columns:auto 1fr;gap:8px 26px;align-items:baseline}
.count-grid dt{font-size:13px;letter-spacing:.3em;color:var(--hud-dim);text-transform:uppercase}
.count-grid dd{margin:0;font:600 26px var(--f-display);letter-spacing:.08em;text-transform:uppercase}
.count-grid dd small{font:400 13px var(--f-mono);letter-spacing:.02em;color:var(--hud-dim);text-transform:none;margin-left:12px}
.count-grid dd.neg{color:var(--threat)}
.count-lost{font-family:var(--f-mono);font-size:13px;color:var(--hud-dim);line-height:1.7}
.count-lost s{color:rgba(233,227,211,.42)}
.count-log{font:italic 400 19px/1.55 Georgia,"Times New Roman",serif;color:#e8dcc4;max-width:640px}
.count-wrap .actions{display:flex;gap:12px}
@media (max-height:520px){.count-wrap{gap:10px}.count-day{font-size:52px}.count-grid dd{font-size:20px}.count-log{font-size:16px}}
`;

export function install(ctx) {
  injectCSS('screens', SCREEN_CSS);
  const root = document.getElementById('screen');
  let pending = null, escValue = undefined, typer = 0, typing = null;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

  function open(name, html, cls = '', escV = undefined) {
    close(null);
    api.current = name;
    root.className = cls;
    root.innerHTML = html;
    root.hidden = false;
    root.scrollTop = 0;
    escValue = escV;
    return new Promise(res => { pending = res; });
  }
  function close(value) {
    cancelAnimationFrame(typer); typing = null;
    for (const id of timers) clearTimeout(id);
    timers.clear();
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
    focusFirst();
  }
  function focusFirst() {
    const first = root.querySelector('[autofocus]:not([disabled])') || root.querySelector('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }
  /** real-time typewriter for menus; a click (or Enter/Space via the key handler) completes it */
  function typeInto(el, text, cps = 70, then) {
    if (!el) { then?.(); return; }
    const start = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; typing = null;
      cancelAnimationFrame(typer);
      el.textContent = text;
      then?.();
    };
    const step = () => {
      if (!el.isConnected || finished) return;
      const i = Math.min(text.length, Math.floor((performance.now() - start) / 1000 * cps));
      el.textContent = text.slice(0, i);
      if (i < text.length) {
        const c = document.createElement('span'); c.className = 'cur'; el.appendChild(c);
        if (Math.random() < 0.3) ctx.audio?.play?.('blip', null);
        typer = requestAnimationFrame(step);
      } else finish();
    };
    typing = finish;
    el.addEventListener('click', finish, { once: true });
    step();
  }
  const btn = (id, label, ghost = false, extra = '') => `<button type="button" class="btn${ghost ? ' ghost' : ''}" id="${id}" ${extra}>${esc(label)}</button>`;

  document.addEventListener('keydown', (e) => {
    if (!pending || root.hidden) return;
    if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;   // a held Esc must not toggle pause on and off
    if (typing && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) { e.preventDefault(); typing(); return; }
    if (e.code === 'Escape' && escValue !== undefined) { e.preventDefault(); done(escValue); return; }
    if (e.code === 'KeyP' && api.current === 'pause') { e.preventDefault(); done('resume'); return; }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && (!document.activeElement || document.activeElement === document.body || !root.contains(document.activeElement))) {
      const b = root.querySelector('[autofocus]:not([disabled])') || root.querySelector('.btn:not([disabled])');
      if (b) { e.preventDefault(); b.click(); }
      return;
    }
    if (e.code.startsWith('Arrow')) {
      const bs = [...root.querySelectorAll('button:not([disabled]), input, select')].filter(x => x.offsetParent !== null);
      if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      const tag = document.activeElement?.tagName;
      if ((tag === 'INPUT' && document.activeElement.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) || tag === 'SELECT' && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
      const d = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1;
      bs[(i + d + bs.length) % bs.length].focus();
      ctx.audio?.play?.('uiMove', null);
      e.preventDefault();
    }
  });

  // ---------------------------------------------------------------- the morning count map strip
  function drawStrip(c, m) {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    const edgeX = Math.round(W * 0.56);
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, '#05070d'); bg.addColorStop(0.42, '#0b1426'); bg.addColorStop(0.555, '#1b2a44');
    bg.addColorStop(0.565, '#6a3a22'); bg.addColorStop(0.7, '#3d1c12'); bg.addColorStop(1, '#170806');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const rng = mulberry32(hashString('gaunt-strip'));
    // ice floes west of the edge, embers east of it
    for (let i = 0; i < 260; i++) {
      const x = rng() * W, y = rng() * H, r = rng() * 2.2 + 0.4;
      if (x < edgeX - 6) { g.fillStyle = `rgba(150,180,220,${0.05 + rng() * 0.12})`; g.fillRect(x, y, r * 3, r); }
      else if (x > edgeX + 6) { g.fillStyle = `rgba(255,${120 + (rng() * 80) | 0},60,${0.05 + rng() * 0.18 * (1 - (x - edgeX) / W)})`; g.fillRect(x, y, r, r); }
    }
    // latitude lines (90°N at the top, 0° at the bottom)
    g.font = '500 11px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
    for (let lat = 15; lat < 90; lat += 15) {
      const y = H - (lat / 90) * H;
      g.strokeStyle = 'rgba(233,227,211,.07)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      g.fillStyle = 'rgba(233,227,211,.32)'; g.fillText(`${lat}°N`, 8, y - 7);
    }
    // the edge: a glowing vertical line
    for (const [w, a] of [[26, 0.06], [12, 0.14], [5, 0.35], [2, 1]]) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(255,214,150,${a * 0.6})`); gr.addColorStop(0.5, `rgba(255,170,90,${a})`); gr.addColorStop(1, `rgba(255,120,60,${a * 0.6})`);
      g.fillStyle = gr; g.fillRect(edgeX - w / 2, 0, w, H);
    }
    g.fillStyle = 'rgba(233,227,211,.5)'; g.textAlign = 'center';
    g.fillText('THE EDGE', edgeX, 12);
    g.textAlign = 'left'; g.fillText('ICE · WEST', 8, H - 10);
    g.textAlign = 'right'; g.fillText('EAST · BURN', W - 8, H - 10);
    // the Wake
    if (Number.isFinite(m.edgeLat)) {
      const y = H - (m.edgeLat / 90) * H;
      const gl = g.createRadialGradient(edgeX, y, 0, edgeX, y, 22);
      gl.addColorStop(0, 'rgba(233,227,211,.75)'); gl.addColorStop(1, 'rgba(233,227,211,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(edgeX, y, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(edgeX, y, 4.5, 0, Math.PI * 2); g.fill();
      g.textAlign = 'left'; g.fillStyle = '#e9e3d3'; g.font = '600 12px "IBM Plex Mono", monospace';
      g.fillText(`THE WAKE · ${Math.round(m.edgeLat)}°N`, edgeX + 16, y);
    }
  }

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
        : [['Move', 'W A S D'], ['Aim', 'MOUSE'], ['Jump / hover', 'SPACE'], ['Quick boost', 'SHIFT'], ['Fire', 'LEFT CLICK'], ['Blade', 'RIGHT CLICK'], ['Missiles', 'Q'], ['Hard lock', 'E'], ['Repair kit', 'R'], ['Interact', 'F'], ['Pause', 'ESC']];
      const p = open('title', `
        <div class="title-wrap">
          <div class="org">BUILD 0.1 · FIRST LIGHT</div>
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
      const lv = m.levels || [];
      const rows = lv.map((l, i) => l.unlocked
        ? `<button type="button" class="list-item" id="lv${i}" ${i === lv.findIndex(x => x.unlocked) ? 'autofocus' : ''}>
             <span class="nm">${esc(l.title)}<small>${esc(l.subtitle || '')}${l.completed ? `${l.subtitle ? ' · ' : ''}Best ${l.bestTime != null ? formatTime(l.bestTime) : '--:--'}` : (l.subtitle ? '' : 'Not yet completed')}</small></span>
             <span class="rk">${l.completed ? esc(l.bestRank || '') : ''}</span></button>`
        : `<button type="button" class="list-item locked" disabled><span class="nm">CLASSIFIED<small>Locked</small></span><span class="rk"></span></button>`).join('');
      const p = open('levelSelect', `<div class="doc">
          <div class="hdr"><span>LEVEL SELECT</span><span>${lv.filter(l => l.unlocked).length} / ${lv.length} open</span></div>
          <h2>Levels</h2>
          <div class="list">${rows || '<div class="fine">No levels.</div>'}</div>
          <div class="actions">${btn('bBack', 'Back', true)}</div></div>`, 'menu-dark', 'back');
      const map = { bBack: 'back' };
      lv.forEach((l, i) => { if (l.unlocked) map['lv' + i] = l.id; });
      bind(map);
      return p;
    },
    showBriefing(m) {
      const L = m.level || {}, b = L.briefing || { title: L.title, body: '' };
      const canFit = m.canFit !== false;
      const p = open('briefing', `<div class="doc">
          <div class="hdr"><span>${esc(b.header || 'BRIEFING')}</span><span>${esc(L.title || '')}</span></div>
          <h2>${esc(b.title || L.title || '')}</h2>
          <div class="sub">${esc(b.subtitle || L.subtitle || '')}</div>
          <div class="body" id="briefBody"></div>
          ${(b.objectives || []).length ? `<dl><dt>Objectives</dt><dd>${b.objectives.map(esc).join('<br>')}</dd></dl>` : ''}
          ${b.fine ? `<div class="fine">${esc(b.fine)}</div>` : ''}
          <div class="actions">${btn('bStart', 'Deploy', false, 'autofocus')}${canFit ? btn('bFit', 'Fit frame', true) : ''}${btn('bBack', 'Back', true)}</div>
        </div>`, 'menu-dark', 'back');
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
        set(p, label) {
          if (bar && bar.isConnected) bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
          if (lbl && lbl.isConnected && label) lbl.textContent = label;
        },
        close() { if (api.current === 'loading') api.hide(); },
      };
    },
    showPause(m = {}) {
      const objs = (m.objectives || []).filter(o => o.state !== 'hidden')
        .map(o => `<li class="${o.state}">${o.optional ? '<span class="pg">OPT</span> ' : ''}${esc(o.text)}${o.progress ? ` <span class="pg">${o.progress.cur} / ${o.progress.max}</span>` : ''}</li>`).join('');
      const log = (m.commsLog || []).slice(-40).map(l => `<div><b style="color:${esc(ctx.comms?.speaker?.(l.who)?.color || 'var(--hud)')}">${esc(l.name || '·')}</b>${esc(l.text)}</div>`).join('');
      const p = open('pause', `<div class="pause-wrap">
          <div class="doc">
            <div class="hdr"><span>PAUSED</span><span>${esc(m.title || '')} · ${formatTime(ctx.mission?.elapsed ?? 0)}</span></div>
            <h2>Paused</h2>
            ${objs ? `<h3>Objectives</h3><ul class="objlist">${objs}</ul>` : ''}
            <div class="actions" style="margin-top:22px">${btn('bRes', 'Resume', false, 'autofocus')}${btn('bRetry', 'Restart from checkpoint', true)}${btn('bSet', 'Settings', true)}${btn('bQuit', 'Quit to title', true)}</div>
          </div>
          <div class="pause-side">
            ${m.drawMap ? `<div class="panel"><div class="kv"><span>TACTICAL MAP</span><span>NORTH UP</span></div><canvas id="pMap" width="560" height="340" style="margin-top:8px"></canvas>
              <div class="maplegend"><span><i style="background:#e9e3d3"></i>Frame</span><span><i style="background:#e0913c"></i>Route · objective</span><span><i style="background:#8fd2c6"></i>Checkpoint</span></div></div>` : ''}
            <div class="panel"><div class="kv"><span>COMMS LOG</span><span>${(m.commsLog || []).length} lines</span></div>
              <div class="pause-log" id="pLog" style="margin-top:8px">${log || '<div class="empty">No transmissions yet.</div>'}</div></div>
          </div></div>`, 'dim', 'resume');
      bind({ bRes: 'resume', bRetry: 'restart', bSet: 'settings', bQuit: 'quit' });
      const c = root.querySelector('#pMap');
      if (c && m.drawMap) { try { m.drawMap(c); } catch (e) { console.warn('[screens] map', e); } }
      const lg = root.querySelector('#pLog'); if (lg) lg.scrollTop = lg.scrollHeight;
      return p;
    },
    showSettings() {
      const s = ctx.settings;
      const fmt = (k, v) => {
        if (['volMaster', 'volMusic', 'volSfx', 'cameraShake'].includes(k)) return `${Math.round(v * 100)}%`;
        if (k === 'fov') return `${Math.round(v)}°`;
        if (k === 'sens' || k === 'commsSpeed') return `×${(+v).toFixed(k === 'sens' ? 2 : 1)}`;
        return String(v);
      };
      const row = (k, label) => {
        const sc = SETTINGS_SCHEMA[k], v = s.get(k);
        if (!sc) return '';
        if (sc.bool) return `<label class="set-row"><span>${label}</span><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><output></output></label>`;
        if (sc.options) return `<label class="set-row"><span>${label}</span><select data-k="${k}">${sc.options.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select><output></output></label>`;
        return `<label class="set-row"><span>${label}</span><input type="range" data-k="${k}" min="${sc.min}" max="${sc.max}" step="${sc.step}" value="${v}"><output>${fmt(k, v)}</output></label>`;
      };
      const forced = ctx.forcedTier ? `<div class="fine">Quality is forced to ${esc(ctx.forcedTier)} by the page address.</div>` : '';
      const p = open('settings', `<div class="doc settings-doc">
          <div class="hdr"><span>SETTINGS</span><span>Saved automatically</span></div>
          <h2>Settings</h2>
          <div class="set-group"><h3>Controls</h3><div class="set-grid">${row('sens', 'Look speed')}${row('invertY', 'Invert Y')}${row('touch', 'Touch controls')}</div></div>
          <div class="set-group"><h3>Camera</h3><div class="set-grid">${row('fov', 'Field of view')}${row('cameraShake', 'Camera shake')}${row('reducedMotion', 'Reduced motion')}</div></div>
          <div class="set-group"><h3>Audio</h3><div class="set-grid">${row('volMaster', 'Master volume')}${row('volMusic', 'Music volume')}${row('volSfx', 'Effects volume')}</div></div>
          <div class="set-group"><h3>Display</h3><div class="set-grid">${row('quality', 'Graphics quality')}${row('ao', 'Ambient occlusion')}${row('showFps', 'Show FPS')}</div></div>
          <div class="set-group"><h3>Comms</h3><div class="set-grid">${row('commsSpeed', 'Comms speed')}</div></div>
          ${forced}
          <div class="actions">${btn('bBack', 'Back', false, 'autofocus')}</div></div>`, 'menu-dark', 'back');
      root.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        const ev = inp.type === 'range' ? 'input' : 'change';
        inp.addEventListener(ev, () => {
          const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
          s.set(k, v);
          const out = inp.parentElement.querySelector('output'); if (out && inp.type === 'range') out.textContent = fmt(k, s.get(k));
          if (inp.type !== 'range') ctx.audio?.play?.('uiMove', null);
        });
      });
      bind({ bBack: 'back' });
      return p.then(() => undefined);
    },
    showDeath(m = {}) {
      const p = open('death', `<div class="center-card">
          <div class="eyebrow">Signal lost</div><h2 class="threat">Frame down</h2><p>${esc(m.line || '')}</p>
          <div class="actions">${btn('bRetry', m.hasCheckpoint ? 'Retry from checkpoint' : 'Retry', false, 'autofocus')}${btn('bQuit', 'Quit to title', true)}</div></div>`, 'dim', 'quit');
      bind({ bRetry: 'retry', bQuit: 'quit' });
      return p;
    },
    showDebrief(m = {}) {
      const r = m.result || {}, L = m.level || {};
      const row = (a, b, hl = false) => `<tr${hl ? ' class="hl"' : ''}><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
      const rows = Array.isArray(m.rows) && m.rows.length
        ? m.rows.map(x => row(x.label, x.value, /rank/i.test(x.label))).join('')
        : row('Time', formatTime(r.time)) + row('Targets destroyed', r.kills ?? 0) + row('Damage taken', Math.round(r.damageTaken || 0))
          + row('Rounds fired', r.shots ?? 0) + row('Salvage recovered', (r.collectibles || []).length) + row('Rank', r.rank || '-', true);
      const actions = Array.isArray(m.actions) && m.actions.length ? m.actions
        : [{ key: 'next', label: 'Continue' }, { key: 'garage', label: 'Garage' }, { key: 'quit', label: 'Title' }];
      const p = open('debrief', `<div class="doc">
          <div class="hdr"><span>DEBRIEF</span><span>${esc(L.title || '')}</span></div>
          <div class="debrief-top"><div><h2>${esc(m.title || L.title || 'Complete')}</h2>
            <div class="sub">Complete · ${formatTime(r.time)}</div></div>
            <div class="rank">${esc(r.rank || '-')}<small>${esc(RANK_TEXT[r.rank] || '')}</small></div></div>
          <table class="ledger">${rows}</table>
          ${(m.unlocks || []).length ? `<div class="fine">Unlocked: ${m.unlocks.map(esc).join(', ')}</div>` : ''}
          <div class="actions">${actions.map((a, i) => btn('bA' + i, a.label, i > 0, i === 0 ? 'autofocus' : '')).join('')}</div></div>`, 'debrief',
        actions.some(a => a.key === 'quit') ? 'quit' : undefined);
      const map = {}; actions.forEach((a, i) => { map['bA' + i] = a.key; });
      bind(map);
      return p;
    },
    async showInterstitial(pages = [], o = {}) {
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i], last = i === pages.length - 1, style = ['black', 'paper', 'terminal'].includes(pg.style) ? pg.style : 'black';
        const p = open('interstitial', `<div class="center-card inter ${style}">
            ${pg.title ? `<h2>${esc(pg.title)}</h2>` : ''}<p id="itP"></p>
            ${pages.length > 1 ? `<div class="pg">${i + 1} / ${pages.length}</div>` : ''}
            <div class="actions" id="itA" hidden>${btn('bNext', last ? 'Continue' : 'Next', false)}${o.skippable && !last ? btn('bSkip', 'Skip', true) : ''}</div></div>`,
          'inter ' + style, o.skippable ? 'skip' : undefined);
        bind({ bNext: 'next', bSkip: 'skip' });
        typeInto(root.querySelector('#itP'), pg.text || '', style === 'terminal' ? 55 : 40, () => {
          const a = root.querySelector('#itA');
          if (a) { a.hidden = false; a.querySelector('button')?.focus({ preventScroll: true }); }
          if (pg.hold > 0) later(() => { if (api.current === 'interstitial' && pending) done('next'); }, pg.hold * 1000);
        });
        const r = await p;
        if (r === 'skip' || r === null) break;
      }
      if (api.current === 'interstitial') api.hide();
    },
    showCredits(m = {}) {
      const p = open('credits', `<div class="center-card credits">
          <div class="eyebrow">Credits</div><h2>Dawnwake</h2>${(m.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}
          <div class="actions">${btn('bBack', 'Back', false, 'autofocus')}</div></div>`, 'menu-dark', 'back');
      bind({ bBack: 'back' });
      return p.then(() => undefined);
    },
    /** A3.7: the Morning Count card. Resolves on WALK ON (click, Enter or tap). */
    showMorningCount(m = {}) {
      const w = m.water || {};
      const parts = [`${w.before ?? 0}`, `+ ${w.sledges ?? 0} sledge${w.sledges === 1 ? '' : 's'}`];
      if (w.gives > 0) parts.push(`+ ${w.gives} given`);
      parts.push(`− ${w.draw ?? 0} drawn`);
      const lost = (m.lost || []).length
        ? `<div class="count-lost">Lost this leg: ${m.lost.map(n => `<s>${esc(n)}</s>`).join(' · ')}</div>`
        : '<div class="count-lost">— no names lost —</div>';
      const p = open('count', `<div class="count-wrap">
          <div class="count-day"><small>THE MORNING COUNT</small>Day ${esc(m.day ?? 1)}</div>
          <canvas id="cStrip" width="1200" height="220"></canvas>
          <dl class="count-grid">
            <dt>Water</dt><dd class="${w.short > 0 ? 'neg' : ''}">${esc(w.after ?? 0)} tank${w.after === 1 ? '' : 's'}<small>(${esc(parts.join(' '))}${w.short > 0 ? ` · short ${esc(w.short)}` : ''})</small></dd>
            <dt>Wake roll</dt><dd>${esc(m.rigs ?? 0)} rigs · ${esc(m.souls ?? 0)} souls</dd>
          </dl>
          ${lost}
          ${m.log ? `<div class="count-log">“${esc(m.log)}”</div>` : ''}
          <div class="actions">${btn('bWalk', 'Walk on', false, 'autofocus')}</div>
        </div>`, 'count');
      bind({ bWalk: 'walk' });
      const c = root.querySelector('#cStrip');
      if (c) { try { drawStrip(c, m); } catch (e) { console.warn('[screens] count strip', e); } }
      return p.then(() => undefined);
    },
  };
  root.hidden = true;
  ctx.screens = api;
  return api;
}
