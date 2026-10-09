// core/input.js (P0): keyboard, mouse, pointer lock (with the prototype's free-mouse fallback), touch layer,
// gamepad → actions. Also the injection API used by tests and touch buttons. Owns the #touch DOM.
import { clamp } from './util.js';
import { detectTouch } from './settings.js';

export const ACT = Object.freeze({
  FIRE: 'fire', BLADE: 'blade', BOOST: 'boost', JUMP: 'jump', MISSILE: 'missile', LOCK: 'lock',
  KIT: 'kit', INTERACT: 'interact', ALT: 'alt', PAUSE: 'pause', SKIP: 'skip', MAP: 'map',
});
const ACTIONS = Object.values(ACT);
const NO_BINDINGS = [];
/** Actions that still read while input.enabled is false (menus, cinematics). */
const ALWAYS = new Set([ACT.PAUSE, ACT.SKIP, ACT.MAP]);

export const DEFAULT_BINDINGS = Object.freeze({
  fire: ['Mouse0'], blade: ['Mouse2'], boost: ['ShiftLeft', 'ShiftRight'], jump: ['Space'], missile: ['KeyQ'],
  lock: ['KeyE', 'Tab', 'Mouse1'], kit: ['KeyR'], interact: ['KeyF'], alt: ['KeyG'], pause: ['Escape', 'KeyP'],
  skip: ['Space', 'Enter'], map: ['KeyM'],
});
/** Standard-mapping gamepad buttons → actions. 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 L3, 11 R3. */
export const PAD_BINDINGS = Object.freeze({
  fire: [7], blade: [6], boost: [1], jump: [0], missile: [5], lock: [11], kit: [2], interact: [3], alt: [4],
  pause: [9], skip: [0, 9], map: [8],
});
/** The player converts look pixels to radians with this factor × settings.sens (prototype 0.0022). */
export const LOOK_RAD_PER_PX = 0.0022;
const TOUCH_LOOK_X = 0.0058 / LOOK_RAD_PER_PX, TOUCH_LOOK_Y = 0.0042 / LOOK_RAD_PER_PX;   // prototype touch rates
const KEY_YAW_PX = 2.2 / LOOK_RAD_PER_PX, KEY_PITCH_PX = 1.4 / LOOK_RAD_PER_PX;           // arrow keys, rad/s → px/s
const PAD_YAW_PX = 2.6 / LOOK_RAD_PER_PX, PAD_PITCH_PX = 1.6 / LOOK_RAD_PER_PX;
const TOUCH_ACT = { fire: 'fire', blade: 'blade', boost: 'boost', jump: 'jump', msl: 'missile', missile: 'missile',
                    lock: 'lock', kit: 'kit', pause: 'pause', interact: 'interact', skip: 'skip', alt: 'alt' };

export function install(ctx) {
  const canvas = ctx.canvas;
  const doc = typeof document !== 'undefined' ? document : null;
  const $ = (s) => doc ? doc.querySelector(s) : null;

  const keys = Object.create(null);       // raw state by code (keyboard codes and Mouse0..2)
  const latched = Object.create(null);    // went down since the last endFrame
  const swallowed = Object.create(null);  // held through a state change: ignored by actions until released
  const injDown = Object.create(null), injPress = Object.create(null);
  const touchDown = Object.create(null), touchPress = Object.create(null);
  const padDown = Object.create(null), padPress = Object.create(null), padPrev = Object.create(null);
  const prevDown = Object.create(null), held = Object.create(null);
  const st = { down: Object.create(null), pressed: Object.create(null), released: Object.create(null) };
  for (const a of ACTIONS) { st.down[a] = st.pressed[a] = st.released[a] = false; held[a] = 0; prevDown[a] = false; }

  const injMove = { x: 0, y: 0 }, injLook = { dx: 0, dy: 0 };
  const mouse = { dx: 0, dy: 0, x: 0, y: 0, moved: false };
  const touch = { mx: 0, mz: 0, lookX: 0, lookY: 0, ptr: new Map(), stickId: null, seen: false };
  const pad = { lx: 0, ly: 0, rx: 0, ry: 0, connected: false };
  let freeHinted = false, selfExit = false, touchSkipTap = false;

  const api = {
    isTouch: false,
    pointerLocked: false,
    freeMouse: false,
    move: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 },
    /** extra: this frame's raw mouse look, ignoring `enabled` (debug free camera) */
    lookRaw: { dx: 0, dy: 0 },
    enabled: false,
    bindings: DEFAULT_BINDINGS,
    gamepad: pad,

    down(a) { return gate(a) && !!st.down[a]; },
    pressed(a) { return gate(a) && !!st.pressed[a]; },
    released(a) { return gate(a) && !!st.released[a]; },
    heldFor(a) { return gate(a) ? held[a] || 0 : 0; },
    key(code) { return !!keys[code]; },

    beginFrame() {
      const dt = ctx.clock.realDt || 0;
      // the debug free camera borrows the keyboard and mouse, so those don't drive gameplay while it flies
      const fc = ctx.cameraRig?.mode === 'free';
      pollPad();
      for (const a of ACTIONS) {
        let raw = !!(injDown[a] || touchDown[a] || padDown[a]);
        let latch = !!(injPress[a] || touchPress[a] || padPress[a]);
        const b = fc && a !== ACT.PAUSE ? NO_BINDINGS : (api.bindings[a] || NO_BINDINGS);
        for (let i = 0; i < b.length; i++) {
          const c = b[i];
          if (swallowed[c]) continue;
          if (keys[c]) raw = true;
          if (latched[c]) latch = true;
        }
        const d = raw || latch;
        st.pressed[a] = latch || (d && !prevDown[a]);
        st.released[a] = !d && prevDown[a];
        st.down[a] = d;
        held[a] = d ? held[a] + dt : 0;
      }
      if (touchSkipTap) { held.skip = Math.max(held.skip, 1); st.down.skip = true; }

      // movement: keys, else injected, else touch stick, else gamepad
      let mx = fc ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), my = fc ? 0 : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
      else if (injMove.x || injMove.y) { mx = injMove.x; my = injMove.y; }
      else {
        const tm = Math.hypot(touch.mx, touch.mz);
        if (tm > 0.15) { const k = clamp((tm - 0.15) / 0.55, 0.3, 1) / tm; mx = touch.mx * k; my = -touch.mz * k; }
        else if (pad.lx || pad.ly) { mx = pad.lx; my = -pad.ly; }
      }
      const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }

      // look, in mouse-pixel units (not sensitivity-scaled)
      let lx = (fc ? 0 : mouse.dx) + injLook.dx + touch.lookX * TOUCH_LOOK_X;
      let ly = (fc ? 0 : mouse.dy) + injLook.dy + touch.lookY * TOUCH_LOOK_Y;
      api.lookRaw.dx = mouse.dx; api.lookRaw.dy = mouse.dy;
      if (!fc) {
        if (keys.ArrowLeft) lx -= KEY_YAW_PX * dt;
        if (keys.ArrowRight) lx += KEY_YAW_PX * dt;
        if (keys.ArrowUp) ly -= KEY_PITCH_PX * dt;
        if (keys.ArrowDown) ly += KEY_PITCH_PX * dt;
      }
      lx += pad.rx * PAD_YAW_PX * dt; ly += pad.ry * PAD_PITCH_PX * dt;
      if (!fc && api.freeMouse && mouse.moved && !api.pointerLocked && typeof innerWidth === 'number') {
        // prototype edge-push turning while the pointer isn't captured
        const nx = (mouse.x / innerWidth) * 2 - 1, ny = (mouse.y / innerHeight) * 2 - 1;
        const ex = Math.sign(nx) * Math.max(0, Math.abs(nx) - 0.35) / 0.65, ey = Math.sign(ny) * Math.max(0, Math.abs(ny) - 0.4) / 0.6;
        lx += ex * KEY_YAW_PX * (2.4 / 2.2) * dt; ly += ey * KEY_PITCH_PX * dt;
      }
      mouse.dx = mouse.dy = 0; injLook.dx = injLook.dy = 0; touch.lookX = touch.lookY = 0;
      if (api.enabled) { api.move.x = mx; api.move.y = my; api.look.dx = lx; api.look.dy = ly; }
      else { api.move.x = api.move.y = 0; api.look.dx = api.look.dy = 0; }
    },
    endFrame() {
      for (const a of ACTIONS) prevDown[a] = st.down[a];
      for (const k in latched) delete latched[k];
      for (const k in injPress) delete injPress[k];
      for (const k in touchPress) delete touchPress[k];
      for (const k in padPress) delete padPress[k];
      touchSkipTap = false;
    },

    requestPointerLock(quiet = false) {
      if (api.isTouch || api.pointerLocked || !canvas) return;
      try {
        const r = canvas.requestPointerLock && canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => enableFreeMouse());
      } catch (e) { enableFreeMouse(); }
      if (!quiet) setTimeout(() => { if (!api.pointerLocked && ctx.flow?.state === 'playing') enableFreeMouse(); }, 900);
    },
    exitPointerLock() {
      if (doc && doc.pointerLockElement) { selfExit = true; try { doc.exitPointerLock(); } catch (e) { /* ignore */ } }
    },
    setTouchMode(on) {
      api.isTouch = !!on;
      $('#game')?.classList.toggle('touch', api.isTouch);
      if (api.isTouch) api.exitPointerLock();
      else releaseTouches();
    },
    showTouchButton(act, on) {
      const b = $(`#touch .tb[data-act="${act}"]`);
      if (b) b.hidden = !on;
    },
    setTouchLabel(act, text, cooling = false) {
      const b = labelEls[act] || (labelEls[act] = $(`#touch .tb[data-act="${act === 'missile' ? 'msl' : act}"]`));
      if (!b) return;
      const s = b.querySelector('small');
      const t = String(text ?? '');
      if (s && s.textContent !== t) s.textContent = t;
      if (b.classList.contains('cool') !== !!cooling) b.classList.toggle('cool', !!cooling);
    },
    inject(a, down) {
      if (down && !injDown[a]) injPress[a] = true;
      injDown[a] = !!down;
    },
    /** extra: a one-frame press (down this tick, up the next) */
    tap(a) { injPress[a] = true; },
    injectMove(x, y) { injMove.x = clamp(Number(x) || 0, -1, 1); injMove.y = clamp(Number(y) || 0, -1, 1); },
    injectLook(dx, dy) { injLook.dx += Number(dx) || 0; injLook.dy += Number(dy) || 0; },
    clearInjected() {
      for (const k in injDown) delete injDown[k];
      for (const k in injPress) delete injPress[k];
      injMove.x = injMove.y = 0; injLook.dx = injLook.dy = 0;
    },
    /** extra: forget every held key/button/touch (used on focus loss and state changes) */
    releaseAll() {
      for (const k in keys) keys[k] = false;
      for (const k in swallowed) delete swallowed[k];
      releaseTouches();
    },
  };
  const labelEls = {};

  function gate(a) { return api.enabled || ALWAYS.has(a); }

  function enableFreeMouse() {
    if (api.freeMouse || api.pointerLocked) return;
    api.freeMouse = true; mouse.moved = false;
    if (!freeHinted && ctx.flow?.state === 'playing') {
      freeHinted = true;
      ctx.hud?.hint?.('Click the view to capture the mouse. Until then, push the cursor toward the screen edge to turn, or use the arrow keys.', 9);
    }
  }

  function pollPad() {
    for (const k in padDown) padDown[k] = false;
    pad.lx = pad.ly = pad.rx = pad.ry = 0; pad.connected = false;
    let gp = null;
    try {
      const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
      if (list) for (const g of list) if (g && g.connected) { gp = g; break; }
    } catch (e) { gp = null; }
    if (!gp) { for (const a of ACTIONS) padPrev[a] = false; return; }
    pad.connected = true;
    const btn = (i) => { const b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.3); };
    for (const a of ACTIONS) {
      const d = (PAD_BINDINGS[a] || []).some(btn);
      padDown[a] = d;
      if (d && !padPrev[a]) padPress[a] = true;
      padPrev[a] = d;
    }
    const dz = (x, y, out) => {
      const m = Math.hypot(x, y);
      if (m < 0.15) { out[0] = 0; out[1] = 0; return; }
      const k = Math.min(1, (m - 0.15) / 0.85) / m; out[0] = x * k; out[1] = y * k;
    };
    const t = [0, 0];
    dz(gp.axes[0] || 0, gp.axes[1] || 0, t); pad.lx = t[0]; pad.ly = t[1];
    dz(gp.axes[2] || 0, gp.axes[3] || 0, t); pad.rx = t[0]; pad.ry = t[1];
  }

  // ---------------------------------------------------------------- keyboard / mouse
  if (typeof window !== 'undefined') {
    // Capture phase on window: input records every key before any menu handler (screens listen on document) reacts to
    // it, and before the microtask checkpoint that follows that handler. So when a key closes a menu (Esc or P resumes
    // the pause menu → state:changed), the press is already latched and the state change below drops it, instead of
    // the press landing after the change and re-pausing on the next tick.
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab') e.preventDefault();
      if ((e.code === 'Space' || e.code.startsWith('Arrow')) && ctx.flow?.state === 'playing') e.preventDefault();
      if (!keys[e.code]) {
        if (e.repeat) swallowed[e.code] = true;   // auto-repeat of a key we forgot (releaseAll, focus): not a new press
        else latched[e.code] = true;
      }
      keys[e.code] = true;
    }, true);
    window.addEventListener('keyup', e => { keys[e.code] = false; delete swallowed[e.code]; }, true);
    window.addEventListener('blur', () => {
      for (const k in swallowed) delete swallowed[k];
      for (const k in keys) keys[k] = false;
      releaseTouches();
      ctx.events.emit('input:focuslost', { reason: 'blur' });
    });
    window.addEventListener('mouseup', e => { keys['Mouse' + e.button] = false; });
    window.addEventListener('contextmenu', e => { if (ctx.flow?.state === 'playing') e.preventDefault(); });
    window.addEventListener('mousemove', e => {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true;
      if (api.pointerLocked) { mouse.dx += clamp(e.movementX || 0, -250, 250); mouse.dy += clamp(e.movementY || 0, -250, 250); }
    });
    window.addEventListener('touchstart', () => {
      touch.seen = true;
      if (!api.isTouch && ctx.settings.get('touch') !== 'off') api.setTouchMode(true);
    }, { passive: true });
  }
  if (doc) {
    doc.addEventListener('mouseleave', () => { mouse.moved = false; });
    doc.addEventListener('pointerlockchange', () => {
      const was = api.pointerLocked;
      api.pointerLocked = doc.pointerLockElement === canvas;
      if (api.pointerLocked) api.freeMouse = false;
      if (was && !api.pointerLocked && !api.freeMouse && !selfExit) ctx.events.emit('input:focuslost', { reason: 'pointerlock' });
      selfExit = false;
    });
    doc.addEventListener('pointerlockerror', () => enableFreeMouse());
  }
  if (canvas) {
    canvas.addEventListener('mousedown', e => {
      ctx.audio?.unlock?.();
      if (ctx.flow?.state !== 'playing') return;
      if (!api.pointerLocked && !api.isTouch) api.requestPointerLock(true);
      const code = 'Mouse' + e.button;
      if (!keys[code]) latched[code] = true;
      keys[code] = true;
      if (e.button === 1) e.preventDefault();
    });
  }

  // ---------------------------------------------------------------- touch layer (prototype port)
  const touchEl = $('#touch'), stickEl = $('#stick'), knobEl = $('#stick .knob'), rotateEl = $('#rotate');
  function touchAct(act, down) {
    const a = TOUCH_ACT[act];
    if (!a) return;
    if (down) { if (!touchDown[a]) touchPress[a] = true; touchDown[a] = true; if (a === 'skip') touchSkipTap = true; }
    else touchDown[a] = false;
  }
  function releaseTouches() {
    for (const [, r] of touch.ptr) if (r.btn) { r.btn.classList.remove('on'); touchAct(r.act, false); }
    touch.ptr.clear(); touch.stickId = null; touch.mx = touch.mz = 0; touch.lookX = touch.lookY = 0;
    for (const k in touchDown) touchDown[k] = false;
    if (stickEl) stickEl.hidden = true;
  }
  if (touchEl) {
    touchEl.addEventListener('pointerdown', e => {
      if (ctx.flow?.state !== 'playing') return;
      e.preventDefault();
      try { touchEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ctx.audio?.unlock?.();
      const btn = e.target.closest && e.target.closest('.tb');
      if (btn) {
        touch.ptr.set(e.pointerId, { btn, act: btn.dataset.act, x: e.clientX, y: e.clientY });
        btn.classList.add('on'); touchAct(btn.dataset.act, true);
        return;
      }
      if (e.clientX < innerWidth * 0.42 && touch.stickId === null) {
        touch.stickId = e.pointerId;
        touch.ptr.set(e.pointerId, { stick: true, ox: e.clientX, oy: e.clientY });
        if (stickEl) { stickEl.hidden = false; stickEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }
        if (knobEl) knobEl.style.transform = '';
      } else touch.ptr.set(e.pointerId, { look: true, x: e.clientX, y: e.clientY });
    });
    touchEl.addEventListener('pointermove', e => {
      const r = touch.ptr.get(e.pointerId); if (!r) return;
      e.preventDefault();
      if (r.stick) {
        let dx = e.clientX - r.ox, dy = e.clientY - r.oy; const d = Math.hypot(dx, dy), R = 56;
        if (d > R) { dx *= R / d; dy *= R / d; }
        if (knobEl) knobEl.style.transform = `translate(${dx}px,${dy}px)`;
        touch.mx = dx / R; touch.mz = dy / R;
      } else if (r.look || r.act === 'fire') {
        touch.lookX += e.clientX - r.x; touch.lookY += e.clientY - r.y; r.x = e.clientX; r.y = e.clientY;
      }
    });
    const touchEnd = e => {
      const r = touch.ptr.get(e.pointerId); if (!r) return;
      touch.ptr.delete(e.pointerId);
      if (r.btn) { r.btn.classList.remove('on'); touchAct(r.act, false); }
      if (r.stick) { touch.stickId = null; touch.mx = touch.mz = 0; if (stickEl) stickEl.hidden = true; }
    };
    touchEl.addEventListener('pointerup', touchEnd);
    touchEl.addEventListener('pointercancel', touchEnd);
    touchEl.addEventListener('contextmenu', e => e.preventDefault());
  }

  function updateTouchLayer() {
    if (!touchEl) return;
    const show = api.isTouch && ctx.flow?.state === 'playing';
    if (touchEl.hidden === show) { touchEl.hidden = !show; if (!show) releaseTouches(); }
    if (!show) return;
    const portrait = innerHeight > innerWidth;
    if (rotateEl && rotateEl.hidden === portrait) rotateEl.hidden = !portrait;
    const choice = $('#choice');
    const pe = choice && !choice.hidden ? 'none' : '';
    if (touchEl.style.pointerEvents !== pe) touchEl.style.pointerEvents = pe;
  }

  // ---------------------------------------------------------------- touch mode resolution
  const resolveTouchMode = () => {
    if (ctx.params.get('touch') === '1') return true;
    const s = ctx.settings.get('touch');
    if (s === 'on') return true;
    if (s === 'off') return false;
    return detectTouch() || touch.seen;
  };
  api.setTouchMode(resolveTouchMode());
  ctx.events.on('settings:changed', ({ key }) => { if (key === 'touch') api.setTouchMode(resolveTouchMode()); });
  // A state change drops held mouse buttons and every unconsumed press, and swallows keys still held until they are
  // released: the key that closed a menu (Esc/P on pause, Enter on Deploy, Space on a button) belongs to that menu and
  // must not read as a fresh gameplay press (re-pause, jump, skip) on the next tick. Movement and look read raw keys.
  ctx.events.on('state:changed', () => {
    for (const k in keys) if (k.startsWith('Mouse')) keys[k] = false;
    for (const k in keys) if (keys[k]) swallowed[k] = true;
    for (const k in latched) delete latched[k];
    for (const k in touchPress) delete touchPress[k];
    updateTouchLayer();   // show/hide #touch right away, not on the next tick (matters while debug-paused)
  });

  ctx.addSystem({ name: 'input', phase: 'input', when: 'always', update: () => { api.beginFrame(); updateTouchLayer(); } });
  ctx.addSystem({ name: 'input-end', phase: 'late', when: 'always', update: () => api.endFrame() });
  ctx.input = api;
  return api;
}
