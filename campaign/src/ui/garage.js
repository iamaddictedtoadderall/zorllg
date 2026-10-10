// ui/garage.js (P3): the hangar bay (title showcase + free garage) and the Bench (addendum A3.6), one scene, two
// dressings, both built from the kit. A fixed light set (hemi, key, rim, work lamp) is re-tuned per dressing.
//
//   open({ context: 'title'|'briefing' })   free garage: FRAME / R-ARM / L-ARM / SHOULDER / UTILITY / PAINT, stats with
//                                            load and power bars and warnings, locked parts with unlock.hint, Confirm
//                                            (refuses an invalid loadout and shows why) and Back.
//   open({ context: 'bench', levelId })      the Bench: FIT / HAUL / WAKE / LATTICE, Undo, WALK ON, Bench lines
//                                            (A3.5 rules on a working copy of save.flags.campaign; commit on WALK ON).
//   showcase(on)                             title background: the mech on the turntable, slow orbit.
// Drag on the stage (pointer or touch) orbits. CSS is injected (injectCSS 'garage') with the design tokens.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMech, animateMech, DESIGNS, PART_VISUALS } from '../art/mechs.js';
import * as LO from '../combat/loadout.js';
import { FRAMES, PARTS, validate, computeStats, DEFAULT_LOADOUT, PAINT_PRESETS } from '../combat/loadout.js';
import * as KIT from '../art/kit.js';
import { esc, clone, injectCSS, clamp, lerp, damp, mulberry32, hashString } from '../core/util.js';

// AD §5.7 / A3.6 ask for "about 2,500 cd"; with r170 physical units that is ~30 lux on the frame below against a 0.6
// fill, which clips the white ceramic to a bloom halo. 300 cd keeps the warm pool and deep falloff the AD describes and
// lets Moth's shoulders hold their bevels (P3 decision, reviewed against bench-fit.png).
const BENCH_LAMP_CD = 300;
const SLOT_TABS = [['FRAME', null], ['R-ARM', 'R'], ['L-ARM', 'L'], ['SHOULDER', 'S'], ['UTILITY', 'U'], ['PAINT', null]];
const BENCH_TABS = ['FIT', 'HAUL', 'WAKE', 'LATTICE'];
const SLOT_NAME = { R: 'R-ARM', L: 'L-ARM', S: 'SHOULDER', U: 'UTILITY' };
const CAMPAIGN_FALLBACK = { startWater: 4, lockerSize: 4, speakers: {}, fixed: [], fragments: [], roll: [], legs: {} };
const STOCK_FALLBACK = { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' };
const MOTH_FALLBACK = { base: '#d8d2c4', mid: '#aaa494', accent: '#c99a3e', visor: '#5fe3ff', flame: '#a8ecff', blade: '#8fe9ff' };
const STAT_KEYS = { rifle: ['dmg', 'rate', 'ammo'], mg: ['dmg', 'rate', 'ammo'], shotgun: ['pellets', 'dmg', 'ammo'], cannon: ['dmg', 'splash', 'ammo'],
  blade: ['dmg', 'cd', 'lunge'], missiles: ['count', 'dmg', 'cd'], micromissiles: ['count', 'dmg', 'cd'], mortar: ['count', 'dmg', 'splash'],
  kit: ['kits', 'heal', 'duration'], harpoon: ['range', 'cd', 'dmg'], flares: ['count', 'cd', 'range'] };
const STAT_LABEL = { dmg: 'DMG', rate: 'RATE', ammo: 'AMMO', pellets: 'PELLETS', splash: 'SPLASH', cd: 'COOLDOWN', lunge: 'LUNGE', count: 'VOLLEY',
  kits: 'KITS', heal: 'HEAL/S', duration: 'TIME', range: 'RANGE', imp: 'IMPACT', speed: 'VELOCITY', turn: 'TURN' };
const STAT_UNIT = { rate: ' s', cd: ' s', duration: ' s', lunge: ' m', range: ' m', splash: ' m', speed: ' m/s' };

/** campaignLoadout from loadout.js when it exists (A0 rule 1), else the A3.7 fallback shape */
function campaignLoadoutOf(fitted) {
  if (typeof LO.campaignLoadout === 'function') return LO.campaignLoadout(fitted);
  const stock = LO.CAMPAIGN_STOCK || STOCK_FALLBACK;
  const lo = { frame: FRAMES.moth ? 'moth' : 'vanguard', ...stock, paint: { ...(LO.MOTH_PAINT || MOTH_FALLBACK) } };
  for (const s of ['R', 'L', 'S']) if (fitted?.[s] && (PARTS[fitted[s]]?.slot ?? s) === s) lo[s] = fitted[s];
  return lo;
}
const stockOf = () => LO.CAMPAIGN_STOCK || STOCK_FALLBACK;
const partName = (id) => PARTS[id]?.name || id;
const giveValue = (id) => PARTS[id]?.haul?.give ?? 1;
function keyStats(p) {
  if (!p?.stats) return [];
  const keys = [...(STAT_KEYS[p.weapon] || []), ...Object.keys(p.stats)];
  const out = [], seen = new Set();
  for (const k of keys) {
    if (seen.has(k) || p.stats[k] == null || out.length >= 3) continue;
    seen.add(k);
    const v = p.stats[k];
    out.push([STAT_LABEL[k] || k.toUpperCase(), (typeof v === 'number' ? (Math.abs(v) < 10 && v % 1 ? v.toFixed(v < 1 ? 2 : 1) : Math.round(v).toLocaleString('en-GB')) : v) + (STAT_UNIT[k] || '')]);
  }
  return out;
}

// ------------------------------------------------------------------ glow sprites (lamp assemblies in this scene)
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; glowTex.userData.shared = true;
  return glowTex;
}
const glowMats = new Map();
function glowSprite(color, size, intensity = 2.5) {
  const key = color + '|' + intensity;
  let m = glowMats.get(key);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, fog: false });
    m.userData.shared = true; glowMats.set(key, m);
  }
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.renderOrder = 2;
  return s;
}

export function install(ctx) {
  const M = (name, fb) => {
    const m = ctx.materials?.get?.(name);
    if (m && (m.name === name || !fb)) return m;
    return fb ? ctx.materials?.standard?.(fb) ?? new THREE.MeshStandardMaterial({ color: fb.color, roughness: fb.roughness ?? 0.7, metalness: fb.metalness ?? 0.3 }) : m;
  };
  const scene = new THREE.Scene();
  scene.name = 'garage';
  scene.background = new THREE.Color(0x14131a);
  scene.fog = new THREE.Fog(0x14131a, 50, 170);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 400);
  // fixed light set; each dressing re-tunes intensities (never adds or removes lights)
  const hemi = new THREE.HemisphereLight(0xd8cfc0, 0x1a1612, 1.1);
  // One shadowed light in both dressings: the spot is the hangar's overhead key and the Bench's work lamp. (Two shadowed
  // lights doubled the shadow taps of every fragment and added a 2048² map; under software GL that made the title frame
  // the slowest thing smoke screenshots.) The directional key is an unshadowed fill.
  const key = new THREE.DirectionalLight(0xffd2a0, 1.2);
  key.position.set(14, 26, 12); key.castShadow = false;
  const rim = new THREE.DirectionalLight(0x7fa8d0, 3.2);
  rim.position.set(-16, 12, -14);
  const lamp = new THREE.SpotLight(0xffb36b, 0, 70, 0.62, 0.65, 2);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.04;
  lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 70;
  const weld = new THREE.PointLight(0xcfe6ff, 0, 9, 2);   // the Bench's welding arc (fixed light set: 0 outside the Bench)
  scene.add(hemi, key, key.target, rim, lamp, lamp.target);
  let roomEnv = null;
  try {
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) { console.warn('[garage] environment', e); }
  scene.environment = roomEnv; scene.environmentIntensity = 0.6;

  const hangarSet = buildHangar(ctx, M);
  const benchSet = buildBench(ctx, M);
  benchSet.root.visible = false;
  // the welding arc light lives in the Bench dressing: hidden with it, so the hangar's programs carry one light fewer
  benchSet.root.add(weld);
  scene.add(hangarSet.root, benchSet.root);
  let dressing = 'hangar';
  function setDressing(d) {
    dressing = d;
    hangarSet.root.visible = d === 'hangar';
    benchSet.root.visible = d === 'bench';
    if (d === 'hangar') {
      scene.background = new THREE.Color(0x14131a); scene.fog.color.set(0x14131a); scene.fog.near = 50; scene.fog.far = 170;
      hemi.color.set(0xd8cfc0); hemi.groundColor.set(0x1a1612); hemi.intensity = 1.1;
      key.intensity = 1.2; key.color.set(0xffd2a0); key.position.set(14, 26, 12);
      rim.intensity = 3.2; rim.color.set(0x7fa8d0); rim.position.set(-16, 12, -14);
      // the overhead key: a warm-white spot over the turntable (≈ 5.5 lux at the mech, the old directional key's level)
      lamp.color.set(0xffd8b0); lamp.intensity = 3900; lamp.angle = 0.56; lamp.penumbra = 0.45; lamp.distance = 70;
      lamp.position.set(10, 26, 9); lamp.target.position.set(0, 3, 0); weld.intensity = 0;
      scene.environment = roomEnv; scene.environmentIntensity = 0.6;
    } else {
      // AD §5.7 The Bench: tungsten work lamp key, warm dim fill, the level's sky as the rim through the open rear
      const art = ctx.atmosphere?.art;
      const horizon = new THREE.Color(art?.sky?.horizon || '#6a7a8c');
      scene.background = horizon.clone().multiplyScalar(0.85);
      scene.fog.color.copy(horizon).multiplyScalar(0.5); scene.fog.near = 40; scene.fog.far = 140;
      hemi.color.set(0x3a2e24); hemi.groundColor.set(0x0e0a08); hemi.intensity = 0.6;
      key.intensity = 0.35; key.color.set(0xffc890); key.position.set(-10, 20, -14);
      rim.intensity = 1.5; rim.color.copy(horizon); rim.position.set(2, 9, 30);
      lamp.color.set(0xffb36b); lamp.intensity = BENCH_LAMP_CD; lamp.angle = 0.62; lamp.penumbra = 0.65; lamp.distance = 40;
      lamp.position.copy(benchSet.lampPos); lamp.target.position.set(0, 3.2, -0.4);
      weld.position.copy(benchSet.weldPos).add(new THREE.Vector3(0.4, 0.3, -0.4));
      scene.environment = ctx.scene.environment || roomEnv; scene.environmentIntensity = ctx.scene.environment ? 0.55 : 0.35;
      benchSet.sky.material.color.copy(horizon);
    }
  }
  setDressing('hangar');

  // ---------------------------------------------------------------- the mech on display
  let rig = null, rigKey = '', t = 0, showcasing = false, resolveOpen = null, context = null;
  let working = null;   // free garage: loadout being edited
  function schemeOf(lo) {
    const f = FRAMES[lo.frame] || FRAMES.vanguard, pt = lo.paint || DEFAULT_LOADOUT.paint;
    const design = f.design && DESIGNS[f.design] ? f.design : 'vanguard';
    return { design, base: pt.base, mid: pt.mid, accent: pt.accent, visor: pt.visor, flame: pt.flame, blade: pt.blade, dark: pt.dark, wear: pt.wear };
  }
  /** (re)build when the frame or paint changed; swap parts live otherwise */
  function setMech(lo, o = {}) {
    const sc = schemeOf(lo), k = JSON.stringify(sc);
    const parts = { R: lo.R, L: lo.L, S: lo.S, U: lo.U };
    const place = () => { rig.root.rotation.y = dressing === 'bench' ? 0 : Math.PI * 0.85; rig.root.position.set(0, dressing === 'bench' ? benchSet.cradleTop : 0, 0); };
    if (rig && rigKey === k && !o.rebuild) { rig.setParts(parts); place(); return rig; }
    const prev = rig;
    rig = buildMech(ctx, sc, { parts });
    rigKey = k;
    place();
    if (prev) { const kn = prev._kneel; prev.dispose(); if (dressing === 'bench') rig._kneel = kn; }
    scene.add(rig.root);
    // settle the pose at once (no visible blend on open)
    const st = idleState();
    for (let i = 0; i < 3; i++) animateMech(rig, st, 1);
    return rig;
  }
  const idleState = () => ({ fwd: 0, lat: 0, onGround: true, pitch: dressing === 'bench' ? -0.25 : -0.15, thrust: 0, hover: 0, landT: 0, crouch: dressing === 'bench' ? 1 : 0 });
  setMech(ctx.save.getLoadout());

  // ---------------------------------------------------------------- camera: slow orbit + drag
  const orbit = { yaw: 0, pitch: 0, dragYaw: 0, dragPitch: 0, dragging: false, lastX: 0, lastY: 0, idle: 0 };
  let viewShift = 0;   // fraction of the width the mech is pushed right (the menu sits on the left)
  function resize() {
    const w = ctx.canvas.clientWidth || innerWidth, h = ctx.canvas.clientHeight || innerHeight;
    camera.aspect = w / h;
    applyViewShift(w, h);
    camera.updateProjectionMatrix();
  }
  function applyViewShift(w = ctx.canvas.clientWidth || innerWidth, h = ctx.canvas.clientHeight || innerHeight) {
    if (viewShift) camera.setViewOffset(w, h, -w * viewShift, 0, w, h); else camera.clearViewOffset();
  }
  function setViewShift(v) { viewShift = v; applyViewShift(); camera.updateProjectionMatrix(); }
  resize();
  ctx.events.on('resize', resize);
  function placeCamera(dt) {
    const bench = dressing === 'bench';
    orbit.idle += dt;
    if (!orbit.dragging && orbit.idle > 2.5) orbit.dragPitch = damp(orbit.dragPitch, 0, 0.6, dt);
    if (!orbit.dragging) orbit.yaw += dt * (bench ? 0.05 : 0.12);
    // the hangar circles the turntable; the Bench sways slowly in front of the kneeling frame (its open rear behind it)
    const yaw = bench ? Math.PI + 0.5 * Math.sin(orbit.yaw * 0.8 - 0.6) + orbit.dragYaw : 0.6 + orbit.yaw + orbit.dragYaw;
    const r = bench ? 22 : 26, look = bench ? 3.9 : 5.6;
    const pitch = clamp((bench ? 0.16 : 0.09) + orbit.dragPitch + Math.sin(t * 0.3) * 0.02, -0.05, 0.75);
    camera.position.set(Math.sin(yaw) * r * Math.cos(pitch), look + Math.sin(pitch) * r + (bench ? 0.6 : 1.6), Math.cos(yaw) * r * Math.cos(pitch));
    camera.lookAt(0, look, 0);
  }
  function stageDrag(root) {
    const stage = root.querySelector('.gx-stage');
    if (!stage) return;
    stage.addEventListener('pointerdown', (e) => {
      orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; orbit.idle = 0;
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX; orbit.lastY = e.clientY;
      orbit.dragYaw -= dx * 0.008; orbit.dragPitch = clamp(orbit.dragPitch + dy * 0.004, -0.15, 0.6); orbit.idle = 0;
    });
    const end = (e) => { orbit.dragging = false; stage.releasePointerCapture?.(e.pointerId); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  }

  injectCSS('garage', CSS);
  injectCSS('bench', BENCH_CSS);
  const screenEl = () => document.getElementById('screen');
  function mount(cls, html) {
    ctx.screens?.hide?.();
    const root = screenEl();
    root.className = 'garage'; root.hidden = false;
    root.innerHTML = `<div class="gx ${cls}">${html}</div>`;
    stageDrag(root);
    return root;
  }
  const sfx = (n) => { ctx.audio?.unlock?.(); ctx.audio?.play?.(n, null); };

  // ================================================================ free garage
  let tab = 'FRAME', errors = [];
  function unlockedSet() { return ctx.save.unlockedParts(); }
  function isLocked(id, uset) { const p = PARTS[id]; return !p || !!p.haul || !uset.has(id); }
  function renderFree() {
    const lo = working;
    const st = computeStats(lo);
    const uset = unlockedSet();
    const f = FRAMES[lo.frame] || FRAMES.vanguard;
    const bar = (v, max, over) => `<div class="stat-bar ${over ? 'over' : ''}"><i style="width:${clamp(v / Math.max(1, max), 0, 1) * 100}%"></i></div>`;
    let body = '';
    const slot = SLOT_TABS.find(([n]) => n === tab)?.[1];
    if (tab === 'FRAME') {
      body = Object.values(FRAMES).filter(fr => !fr.campaignOnly).map(fr => `
        <button type="button" class="gx-card ${fr.id === lo.frame ? 'on' : ''}" data-frame="${esc(fr.id)}">
          <span class="nm">${esc(fr.name)}</span><span class="ds">${esc(fr.desc || DESIGNS[fr.design]?.desc || '')}</span>
          <span class="ks"><b>AP ${fr.ap.toLocaleString('en-GB')}</b><b>EN ${fr.en.toLocaleString('en-GB')}</b><b>SPD ${fr.speed}</b><b>LOAD ${fr.load}</b><b>PWR ${fr.power}</b></span>
        </button>`).join('');
    } else if (slot) {
      const ids = Object.keys(PARTS).filter(id => PARTS[id].slot === slot);
      body = ids.map(id => {
        const p = PARTS[id], locked = isLocked(id, uset);
        return `<button type="button" class="gx-card ${id === lo[slot] ? 'on' : ''} ${locked ? 'locked' : ''}" data-part="${esc(id)}" ${locked ? 'aria-disabled="true"' : ''}>
          <span class="nm">${esc(p.name || id)}${locked ? ' <i class="lk">LOCKED</i>' : ''}</span>
          <span class="ds">${esc(locked ? (p.unlock?.hint || 'Recovered in the field') : (p.desc || ''))}</span>
          <span class="ks"><b>WT ${p.weight ?? '-'}</b><b>PWR ${p.power ?? '-'}</b>${locked ? '' : keyStats(p).map(([k, v]) => `<b>${esc(k)} ${esc(v)}</b>`).join('')}</span>
        </button>`;
      }).join('') || `<div class="gx-empty">No parts for this hardpoint.</div>`;
    } else if (tab === 'PAINT') {
      body = `<div class="gx-swatches">${PAINT_PRESETS.map((pt, i) => `
        <button type="button" class="gx-sw ${pt.id === lo.paint?.id || (!lo.paint?.id && i === 0) ? 'on' : ''}" data-paint="${i}">
          <span class="chips"><i style="background:${esc(pt.base)}"></i><i style="background:${esc(pt.mid)}"></i><i style="background:${esc(pt.accent)}"></i><i style="background:${esc(pt.visor)}"></i></span>
          <span class="nm">${esc(pt.name || pt.id || 'Scheme ' + (i + 1))}</span></button>`).join('')}</div>`;
    }
    const warn = [...errors, ...st.warnings.filter(w => !(errors.length && /power/i.test(w) && errors.some(e => /power/i.test(e))))];
    const root = mount('gx-free', `
      <section class="gx-panel panel">
        <div class="gx-head"><span class="eyebrow">${context === 'briefing' ? 'Fit frame · before deployment' : 'Garage'}</span><h2>${esc(f.name)}</h2></div>
        <nav class="tabs" role="tablist">${SLOT_TABS.map(([n]) => `<button type="button" role="tab" class="${n === tab ? 'on' : ''}" data-tab="${n}">${n}</button>`).join('')}</nav>
        <div class="gx-list">${body}</div>
        <div class="gx-stats">
          <div class="gx-row"><span>AP</span><b>${st.ap.toLocaleString('en-GB')}</b><span>EN</span><b>${st.en.toLocaleString('en-GB')}</b><span>SPEED</span><b>${(st.speed * (st.speedMul || 1)).toFixed(1)}</b><span>QB</span><b>${st.qbImpulse}</b></div>
          <div class="gx-meter"><span>LOAD ${st.weight} / ${st.load}</span>${bar(st.weight, st.load, st.overweight)}</div>
          <div class="gx-meter"><span>POWER ${st.powerDraw} / ${st.power}</span>${bar(st.powerDraw, st.power, st.overpower)}</div>
          <div class="gx-warn" id="gErr" role="alert">${warn.map(w => `<div>${esc(w)}</div>`).join('')}</div>
        </div>
        <div class="actions"><button type="button" class="btn" id="gOk">Confirm</button><button type="button" class="btn ghost" id="gBack">Back</button></div>
      </section>
      <div class="gx-stage" aria-hidden="true"><span class="gx-hint">Drag to orbit</span></div>`);
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { sfx('uiMove'); tab = b.dataset.tab; renderFree(); }));
    root.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => {
      sfx('uiSelect'); errors = []; working.frame = b.dataset.frame; setMech(working); renderFree();
    }));
    root.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') { sfx('empty'); return; }
      sfx('uiSelect'); errors = []; working[slot] = b.dataset.part; setMech(working); renderFree();
    }));
    root.querySelectorAll('[data-paint]').forEach(b => b.addEventListener('click', () => {
      sfx('uiSelect'); working.paint = clone(PAINT_PRESETS[+b.dataset.paint]); setMech(working); renderFree();
    }));
    root.querySelector('#gOk').addEventListener('click', () => api.confirm());
    root.querySelector('#gBack').addEventListener('click', () => { sfx('uiBack'); api.cancel(); });
    root.querySelector('#gOk').focus({ preventScroll: true });
  }

  // ================================================================ the Bench (A3.6)
  let bench = null;   // { data, levelId, leg, w (working CampaignState), undo[], fired:Set, queue[], line, timers, closing, tab }
  const defaultState = (data) => ({ v: 1, day: 0, water: data.startWater ?? 4, arms: 0, parts: {}, spares: [], fitted: { R: stockOf().R, L: stockOf().L, S: stockOf().S },
    lost: [], fragments: {}, kernel: 4, benchVisits: 0, tearCount: 0, pending: null, ledger: null });
  async function campaignData() {
    try { const m = await import('../../levels/campaign.js'); return m.default || CAMPAIGN_FALLBACK; } catch (e) { return CAMPAIGN_FALLBACK; }
  }
  const isStock = (id) => Object.values(stockOf()).includes(id);
  const lockerList = (w) => Object.keys(w.parts).filter(id => w.parts[id] === 'locker');
  function applyArrival(w) {   // A3.5 rule 1
    for (const id of w.pending?.haul || []) {
      if (w.parts[id] === 'fitted' || w.parts[id] === 'locker') w.spares.push(id);
      else w.parts[id] = 'locker';
    }
  }
  function snapshot() { bench.undo.push(JSON.stringify({ parts: bench.w.parts, spares: bench.w.spares, fitted: bench.w.fitted, water: bench.w.water, arms: bench.w.arms, ledger: bench.w.ledger, given: bench.givenThisVisit })); }
  /** A3.5 rule 2: can `id` be fitted to `slot` now? Returns null or the reason it can't. */
  function fitBlock(slot, id) {
    const w = bench.w;
    if (!['R', 'L', 'S'].includes(slot)) return 'Fixed hardpoint.';
    if (w.fitted[slot] === id) return null;
    const stock = stockOf()[slot];
    if (id === stock) {
      const prev = w.fitted[slot];
      if (prev && prev !== stock && w.parts[prev] === 'fitted' && lockerList(w).length + 1 > (bench.data.lockerSize ?? 4)) return 'Locker full. Give a part first.';
      return null;
    }
    if (!PARTS[id]) return 'Unknown part.';
    if (PARTS[id].slot !== slot) return 'Wrong hardpoint.';
    if (w.parts[id] !== 'locker') return w.spares.includes(id) ? 'Spares can only be given.' : 'Not in the Locker.';
    return null;
  }
  function doFit(slot, id) {
    if (!bench || bench.closing) return false;
    const w = bench.w;
    if (w.fitted[slot] === id) return true;
    if (fitBlock(slot, id)) return false;
    snapshot();
    const prev = w.fitted[slot];
    if (prev && !isStock(prev) && w.parts[prev] === 'fitted') w.parts[prev] = 'locker';
    w.fitted[slot] = id;
    if (!isStock(id)) w.parts[id] = 'fitted';
    sfx('uiSelect');
    setMech(campaignLoadoutOf(w.fitted));
    trigger('fit:' + id);
    renderBench();
    return true;
  }
  function doGive(id, o = {}) {   // A3.5 rule 3; a spare goes first when the id is both owned and spare (unless o.owned)
    if (!bench || bench.closing || isStock(id)) return false;
    const w = bench.w;
    const si = w.spares.indexOf(id);
    const owned = w.parts[id] === 'fitted' || w.parts[id] === 'locker';
    if (si < 0 && !owned) return false;
    snapshot();
    const v = giveValue(id);
    w.water += v; w.arms += v;
    if (!w.ledger) w.ledger = { levelId: bench.levelId, before: w.water - v, sledges: 0, gives: 0 };
    w.ledger.gives = (w.ledger.gives || 0) + v;
    if (si >= 0 && !o.owned) w.spares.splice(si, 1);
    else {
      if (w.parts[id] === 'fitted') for (const s of ['R', 'L', 'S']) if (w.fitted[s] === id) { w.fitted[s] = stockOf()[s]; }
      w.parts[id] = 'given';
      setMech(campaignLoadoutOf(w.fitted));
    }
    bench.givenThisVisit++;
    sfx('confirm');
    trigger('give');
    renderBench();
    return true;
  }
  function doUndo() {
    if (!bench || bench.closing || !bench.undo.length) return false;
    const { given, ...s } = JSON.parse(bench.undo.pop());
    Object.assign(bench.w, s);
    bench.givenThisVisit = given ?? bench.givenThisVisit;   // undoing a fit leaves the gives alone
    sfx('uiBack');
    setMech(campaignLoadoutOf(bench.w.fitted));
    renderBench();
    return true;
  }
  // ---- Bench lines: typed in real time at 42 chars/s × speaker.speed; each key at most once per visit
  function trigger(k) {
    if (!bench || bench.fired.has(k)) return;
    const lines = bench.leg?.bench?.[k];
    if (!lines?.length) return;
    bench.fired.add(k);
    bench.queue.push({ key: k, lines: lines.slice() });
  }
  function commsUpdate(dt) {
    const B = bench;
    if (!B) return;
    for (const tm of B.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
    if (!B.line) {
      while (B.queue.length && !B.queue[0].lines.length) { const done = B.queue.shift(); B.onScriptDone(done.key); if (B !== bench) return; }
      if (!B.queue.length) { drawLine(); return; }
      const next = B.queue[0].lines.shift();
      if (next.wait != null) B.line = { wait: next.wait };
      else {
        const sp = B.data.speakers?.[next.who] || {};
        const text = String(next.text || '');
        B.line = { who: next.who, name: sp.name ?? next.who, color: sp.color || '#e9e3d3', font: sp.font, text, shown: 0,
                   cps: 42 * (sp.speed || 1), hold: next.hold ?? 1.4 + 0.032 * text.length, voice: sp.voice };
        ctx.audio?.blip?.(sp.voice);
      }
    }
    const L = B.line;
    if (L.wait != null) { L.wait -= dt; if (L.wait <= 0) B.line = null; }
    else if (L.shown < L.text.length) {
      const before = Math.floor(L.shown);
      L.shown = Math.min(L.text.length, L.shown + dt * L.cps);
      if (Math.floor(L.shown) !== before && Math.floor(L.shown) % 3 === 0) ctx.audio?.blip?.(L.voice);
    } else { L.hold -= dt; if (L.hold <= 0) B.line = null; }
    drawLine();
  }
  function drawLine() {
    const el = document.querySelector('#screen .gx-comms');
    if (!el || !bench) return;
    const L = bench.line;
    if (!L || L.wait != null) { el.classList.toggle('idle', !L); if (!L) { el.querySelector('.who').textContent = ''; el.querySelector('.line').textContent = ''; } return; }
    el.classList.remove('idle');
    const who = el.querySelector('.who'), line = el.querySelector('.line');
    if (who.textContent !== L.name) { who.textContent = L.name; who.style.color = L.color; line.style.color = L.color; line.classList.toggle('mono', L.font === 'monoCaps'); }
    line.textContent = L.text.slice(0, Math.floor(L.shown));
  }
  function renderBench() {
    const B = bench; if (!B) return;
    const w = B.w, data = B.data, size = data.lockerSize ?? 4;
    const locker = lockerList(w);
    const card = (id, slot, on, block) => {
      const p = PARTS[id];
      return `<button type="button" class="gx-card ${on ? 'on' : ''} ${block ? 'locked' : ''}" data-fit="${esc(slot)}:${esc(id)}" ${block ? 'aria-disabled="true"' : ''}>
        <span class="nm">${esc(partName(id))}${isStock(id) ? ' <i class="tag">STOCK</i>' : ''}${on ? ' <i class="tag on">FITTED</i>' : ''}</span>
        <span class="ds">${esc(block || p?.desc || '')}</span>
        <span class="ks">${keyStats(p).map(([k, v]) => `<b>${esc(k)} ${esc(v)}</b>`).join('')}</span></button>`;
    };
    let body = '';
    if (B.tab === 'FIT') {
      body = ['R', 'L', 'S'].map(slot => {
        const choices = [stockOf()[slot], ...locker.filter(id => PARTS[id]?.slot === slot)];
        if (w.fitted[slot] && !choices.includes(w.fitted[slot])) choices.push(w.fitted[slot]);
        return `<div class="gx-slot"><div class="gx-slotname">${SLOT_NAME[slot]}</div>${choices.map(id => card(id, slot, w.fitted[slot] === id, w.fitted[slot] === id ? null : fitBlock(slot, id))).join('')}</div>`;
      }).join('') + `<div class="gx-fixed">${(data.fixed || []).map(fx => `<div class="gx-fixedcard"><span class="hp">${esc(fx.hardpoint)}</span><span class="nm">${esc(fx.name)}</span>
          <span class="ds mono">${esc(fx.stats)}</span><span class="no">No other parts yet.</span></div>`).join('')}</div>`;
    } else if (B.tab === 'HAUL') {
      const fittedHaul = ['R', 'L', 'S'].map(s => w.fitted[s]).filter(id => id && !isStock(id) && w.parts[id] === 'fitted');
      const row = (id, tag, i) => `<div class="gx-haul"><span class="nm">${esc(partName(id))} ${tag ? `<i class="tag">${tag}</i>` : ''}</span>
        <span class="ds">${esc(PARTS[id]?.desc || (PARTS[id] ? '' : 'Unknown part. It can only be given.'))}</span>
        <button type="button" class="btn ghost gx-give" data-give="${esc(id)}" data-kind="${tag === 'SPARE' ? 'spare' : 'owned'}" data-i="${i}">Give <span>+${giveValue(id)} water</span></button></div>`;
      body = `<div class="gx-sub">LOCKER ${locker.length} / ${size}</div>
        ${locker.map((id, i) => row(id, '', i)).join('') || '<div class="gx-empty">The Locker is empty.</div>'}
        ${fittedHaul.length ? `<div class="gx-sub">FITTED</div>${fittedHaul.map((id, i) => row(id, 'FITTED', i)).join('')}` : ''}
        ${w.spares.length ? `<div class="gx-sub">SPARES</div>${w.spares.map((id, i) => row(id, 'SPARE', i)).join('')}` : ''}
        <div class="gx-sub dim">Stock parts hang on the Bench wall. They are always yours.</div>`;
    } else if (B.tab === 'WAKE') {
      const draw = B.leg?.draw ?? 0, after = w.water - draw, short = Math.max(0, -after);
      const lost = new Set(w.lost || []);
      const roll = data.roll || [];
      const souls = roll.filter(r => !lost.has(r.id)).reduce((s, r) => s + (r.souls || 0), 0);
      body = `<div class="gx-wake">
          <div class="gx-big"><span>WATER</span><b>${w.water}</b><i>TANKS</i></div>
          <div class="gx-big"><span>MORNING DRAW</span><b>${draw}</b><i>TANKS</i></div>
          <div class="gx-big ${short ? 'bad' : ''}"><span>AFTER THE COUNT</span><b>${Math.max(0, after)}</b><i>${short ? `${short} SHORT · ${short * 2} RIGS LOST` : 'TANKS'}</i></div>
        </div>
        <div class="gx-sub">WAKE ROLL · ${roll.length - lost.size} RIGS · ${souls} SOULS</div>
        <div class="gx-roll">${roll.map(r => `<span class="${lost.has(r.id) ? 'lost' : ''}">${esc(r.name)} <i>${r.souls}</i></span>`).join('')}</div>`;
    } else {
      const frags = data.fragments || [];
      body = `<div class="gx-sub">MOTH — RECOVERED FRAGMENTS (${frags.length})</div><div class="gx-frags">${frags.map(fr => {
        const rng = mulberry32(hashString(fr.id));
        const bars = [0, 1, 2].map(() => `<i style="width:${Math.round(35 + rng() * 60)}%"></i>`).join('');
        return `<div class="gx-frag"><span class="id mono">${esc(fr.id)}</span><span class="gl mono">${esc(fr.gloss)}</span><span class="rd">${bars}</span></div>`;
      }).join('')}</div>`;
    }
    const haulCount = locker.length + w.spares.length;
    const root = mount('gx-bench', `
      <section class="gx-panel panel">
        <div class="gx-head"><span class="eyebrow">${esc(B.leg?.debriefTitle || 'Camp')}</span><h2>THE BENCH</h2>
          <span class="gx-water">WATER <b>${w.water}</b></span></div>
        <nav class="tabs" role="tablist">${BENCH_TABS.map(n => `<button type="button" role="tab" class="${n === B.tab ? 'on' : ''}" data-btab="${n}">${n}${n === 'HAUL' && haulCount ? ` <i class="ct">${haulCount}</i>` : ''}</button>`).join('')}</nav>
        <div class="gx-list">${body}</div>
        <div class="actions"><button type="button" class="btn" id="bWalk">Walk on</button><button type="button" class="btn ghost" id="bUndo" ${B.undo.length ? '' : 'disabled'}>Undo</button></div>
      </section>
      <div class="gx-stage" aria-hidden="true"></div>
      <div class="gx-comms idle"><span class="who"></span><span class="line"></span></div>
      <div class="gx-confirm" ${B.confirming ? '' : 'hidden'}><div class="panel"><h3>Walk on?</h3>
        <div class="actions"><button type="button" class="btn" id="bYes">Walk on</button><button type="button" class="btn ghost" id="bNo">Back</button></div></div></div>`);
    root.querySelectorAll('[data-btab]').forEach(b => b.addEventListener('click', () => { sfx('uiMove'); api.bench.tab(b.dataset.btab); }));
    root.querySelectorAll('[data-fit]').forEach(b => b.addEventListener('click', () => {
      const [slot, id] = b.dataset.fit.split(':');
      if (b.getAttribute('aria-disabled') === 'true') { sfx('empty'); return; }
      doFit(slot, id);
    }));
    root.querySelectorAll('[data-give]').forEach(b => {
      b.addEventListener('pointerenter', () => trigger('give'));
      b.addEventListener('focus', () => trigger('give'));
      b.addEventListener('click', () => doGive(b.dataset.give, { owned: b.dataset.kind !== 'spare' }));
    });
    root.querySelector('#bUndo').addEventListener('click', () => doUndo());
    root.querySelector('#bWalk').addEventListener('click', () => { if (B.closing) return; sfx('uiSelect'); B.confirming = true; renderBench(); });
    root.querySelector('#bNo')?.addEventListener('click', () => { sfx('uiBack'); B.confirming = false; renderBench(); });
    root.querySelector('#bYes')?.addEventListener('click', () => walkOnWithLines());
    drawLine();
  }
  function closingKeys() {
    const w = bench.w;
    const remaining = Object.values(w.parts).some(s => s === 'fitted' || s === 'locker') || w.spares.length > 0;
    if (bench.givenThisVisit > 0 && !remaining) return ['gaveAll', 'walkOn'];
    if (bench.givenThisVisit === 0) return ['keptAll', 'walkOn'];
    return ['walkOn'];
  }
  function commitBench() {
    const w = clone(bench.w);
    w.pending = null;
    w.benchVisits = (w.benchVisits | 0) + 1;
    const st = typeof structuredClone === 'function' ? structuredClone(w) : clone(w);
    ctx.save.setFlag('campaign', st);
  }
  function walkOnWithLines() {
    const B = bench;
    if (!B || B.closing) return;
    B.closing = true; B.confirming = false;
    B.queue.length = 0; B.line = null; B.timers.length = 0;
    for (const k of closingKeys()) trigger(k);
    renderBench();
    root()?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    B.onScriptDone = () => { if (!B.queue.length) finish(); };
    if (!B.queue.length) finish();
    function finish() { if (bench !== B) return; commitBench(); api.close(); }
  }
  const root = () => screenEl();
  async function openBench(o) {
    const data = await campaignData();
    const raw = ctx.save.getFlag('campaign');
    const w = raw && typeof raw === 'object' ? clone(raw) : defaultState(data);
    w.parts = w.parts || {}; w.spares = w.spares || []; w.fitted = { ...stockOf(), ...(w.fitted || {}) }; delete w.fitted.U;
    const levelId = o.levelId || w.pending?.levelId || Object.keys(data.legs || {})[0] || null;
    applyArrival(w);
    bench = { data, levelId, leg: data.legs?.[levelId] || null, w, undo: [], fired: new Set(), queue: [], line: null, timers: [], tab: 'FIT',
              givenThisVisit: 0, closing: false, confirming: false, onScriptDone: () => {} };
    const B = bench;
    B.onScriptDone = (k) => {
      if (k === 'arrive') B.timers.push({ t: 3, fn: () => trigger('hatch') });
      if (k === 'hatch') B.timers.push({ t: 6, fn: () => trigger('haul') });
    };
    setDressing('bench');
    setViewShift(0.2);
    setMech(campaignLoadoutOf(w.fitted), { rebuild: true });
    orbit.yaw = 0; orbit.dragYaw = 0; orbit.dragPitch = 0;
    renderBench();
    trigger('arrive');
  }

  // ================================================================ service
  const api = {
    get isOpen() { return !!resolveOpen; },
    scene, camera,
    /** addendum A3.6: the contexts open() supports (flow checks for 'bench') */
    get contexts() { return ['title', 'briefing', 'bench']; },
    get context() { return resolveOpen ? context : null; },
    /** extra (tests): the displayed mech rig and the current dressing */
    get rig() { return rig; },
    get dressing() { return dressing; },
    get bench() {
      if (!bench || !resolveOpen) return null;
      return {
        state: () => clone(bench.w),
        fit: (slot, id) => doFit(slot, id),
        give: (id) => doGive(id),
        undo: () => doUndo(),
        tab: (name) => {
          if (!BENCH_TABS.includes(name) || !bench) return;
          bench.tab = name;
          if (name === 'HAUL') trigger('haul');
          if (name === 'LATTICE') trigger('lattice');
          renderBench();
        },
        walkOn: async () => { if (!bench || bench.closing) return; bench.closing = true; commitBench(); api.close(); },
        /** extra (tests): the line being typed, the queued script keys and the keys fired so far */
        get line() { return bench?.line && bench.line.text ? { who: bench.line.who, text: bench.line.text } : null; },
        get fired() { return bench ? [...bench.fired] : []; },
        fitBlock: (slot, id) => fitBlock(slot, id),
      };
    },
    open(o = {}) {
      if (resolveOpen) api.close();
      context = o.context || 'title';
      orbit.idle = 0;
      ctx.pipeline?.setView(scene, camera);
      const p = new Promise(res => { resolveOpen = res; });
      if (context === 'bench') {
        openBench(o).catch(e => { ctx.recordError?.('garage', e); api.close(); });
      } else {
        bench = null;
        setDressing('hangar');
        setViewShift(0.18);
        working = clone(ctx.save.getLoadout());
        if (!FRAMES[working.frame] || FRAMES[working.frame].campaignOnly) working.frame = DEFAULT_LOADOUT.frame;
        tab = 'FRAME'; errors = [];
        setMech(working);
        renderFree();
      }
      return p;
    },
    /** free garage: validate, save, apply to the player, close. Returns false (and shows why) when invalid. */
    confirm() {
      if (!working || context === 'bench') return false;
      const v = validate(working, unlockedForValidate());
      if (!v.ok) { errors = v.errors; sfx('empty'); renderFree(); return false; }
      sfx('confirm');
      ctx.save.setLoadout(working);
      if (ctx.player?.active) ctx.player.setLoadout(working);
      api.close();
      return true;
    },
    /** free garage: leave without saving (the saved loadout is restored on the display) */
    cancel() {
      if (context !== 'bench') setMech(ctx.save.getLoadout());
      api.close();
    },
    /** extra (tests and scripts): set the free-garage working loadout fields and redraw */
    edit(p = {}) {
      if (!working || context === 'bench') return null;
      errors = [];
      for (const k of ['frame', 'R', 'L', 'S', 'U']) if (p[k]) working[k] = p[k];
      if (p.paint) working.paint = clone(p.paint);
      if (p.tab) tab = p.tab;
      setMech(working); renderFree();
      return clone(working);
    },
    get working() { return working ? clone(working) : null; },
    get errors() { return errors.slice(); },
    close() {
      const r = resolveOpen; resolveOpen = null;
      const el = screenEl();
      if (el && el.className === 'garage') { el.innerHTML = ''; el.className = ''; el.hidden = true; }
      bench = null;
      working = null;
      orbit.dragging = false;
      if (r) r();
    },
    showcase(on) {
      showcasing = !!on;
      if (on) {
        if (dressing !== 'hangar' && !resolveOpen) setDressing('hangar');
        setViewShift((camera.aspect > 1.2) ? 0.2 : 0);
        const lo = ctx.save.getLoadout();
        if (!FRAMES[lo.frame] || FRAMES[lo.frame].campaignOnly) lo.frame = DEFAULT_LOADOUT.frame;
        if (!resolveOpen) setMech(lo);
      }
    },
    update(dt) {
      if (!showcasing && !resolveOpen) return;
      t += dt;
      placeCamera(dt);
      if (rig) animateMech(rig, idleState(), dt);
      if (dressing === 'bench') weld.intensity = benchSet.flicker(t, dt);
      if (bench) commsUpdate(dt);
    },
  };
  function unlockedForValidate() {
    const u = new Set(ctx.save.unlockedParts());
    for (const id of [...u]) if (PARTS[id]?.haul) u.delete(id);
    return u;
  }
  ctx.addSystem({ name: 'garage', phase: 'ui', when: 'always', update: (dt) => api.update(dt) });
  ctx.garage = api;
  // Start compiling the hangar/Bench programs now, behind the boot: the title's first frame otherwise compiles every
  // garage program at once (≈ 40 s under software GL on a loaded machine, which is what timed out the title shot).
  // Asynchronous (the GPU process links in the background); a failure here only costs the head start.
  // With post-processing the scene renders into the composer's target (no tone mapping, linear output), which is a
  // different program than a direct render, so compile against a stand-in target in that case.
  try {
    const R = ctx.renderer, post = !!ctx.tier?.post && !ctx.params?.has?.('nopost');
    const rt = post ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null, prev = R.getRenderTarget();
    if (rt) R.setRenderTarget(rt);
    R.compileAsync?.(scene, camera)?.catch?.(() => {});
    if (rt) { R.setRenderTarget(prev); rt.dispose(); }
  } catch (e) { /* the first render compiles instead */ }
  return api;
}

// ================================================================ dressings (built with the kit, merged per material)
function lampAssembly(B, parent, mats, pos, dir, r, color, size, base) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  g.updateMatrix();
  B.add(KIT.lampHousing(r), mats.housing, g.matrix);
  const lens = new THREE.Matrix4().multiplyMatrices(g.matrix, new THREE.Matrix4().makeTranslation(0, r * 1.24, 0));
  B.add(KIT.lampLens(r), mats.lens, lens);
  const sp = glowSprite(color, size);
  const p = new THREE.Vector3(0, r * 1.5, 0).applyMatrix4(g.matrix);
  if (base) p.applyMatrix4(base);   // B was a sub-builder view (B.under(base)): the sprite lives in the root's space
  sp.position.copy(p);
  parent.add(sp);
  return sp;
}
/** A plain lit material for the big receive-only surfaces of the two dressings (deck plates, back walls): no wear patch
 *  and no atmosphere patch (these scenes use their own THREE.Fog), vertex colours for the per-plate tint. These
 *  surfaces fill most of the title frame, and under software GL the library's patched kit shader there was the cost
 *  that pushed the title render past the harness's screenshot timeout (P3 measurement: ~13 s of an ~18 s frame). */
function plainMat(color, roughness, metalness, env = 0.6) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: env, vertexColors: true });
  m.userData.shared = true;
  return m;
}
/** Marks every mesh of a group as excluded from the GTAO pass (pipeline's GameGTAOPass honours userData.noAO). */
function noAO(g) { g.traverse(o => { if (o.isMesh) o.userData.noAO = true; }); return g; }
function buildHangar(ctx, M) {
  const root = new THREE.Group(); root.name = 'hangar';
  const mats = {
    plate: M('concreteDark', { color: '#4d463e', roughness: 0.94, metalness: 0.02 }),
    steel: M('steel', { color: '#5b5e62', roughness: 0.38, metalness: 0.9 }),
    stripe: M('stripe', { color: '#d9a521', roughness: 0.55, metalness: 0.25 }), dark: M('dark', { color: '#141416', roughness: 0.8, metalness: 0.4 }),
    housing: M('dark', { color: '#141416', roughness: 0.8, metalness: 0.4 }), lens: M('lightAmber', null) || ctx.materials?.emissive?.('#ffb36b', 3),
    rust: M('rust', { color: '#7a4128', roughness: 0.88, metalness: 0.35 }),
    deck: plainMat('#34373c', 0.52, 0.82, 0.9), wall: plainMat('#5f5850', 0.9, 0.02, 0.35), wallDark: plainMat('#423c35', 0.92, 0.02, 0.3),
  };
  const lights = [];
  // turntable (the only shadow caster of the set besides the mech): drum, chamfered rim, hazard ring, lamp strip
  const Bt = new KIT.GeoBuilder(77);
  Bt.add(KIT.cylinder(9.3, 9.8, 0.7, 64, 0.12), mats.plate, { pos: [0, -0.35, 0] });
  Bt.add(KIT.ring(8.95, 0.5, 0.18, 64), mats.stripe, { pos: [0, 0.04, 0] });
  Bt.add(KIT.ring(9.55, 0.4, 0.16, 64), mats.dark, { pos: [0, 0.03, 0] });
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; Bt.add(KIT.plateBox(0.5, 0.1, 0.9, 0.03), mats.steel, { pos: [Math.sin(a) * 6.6, 0.03, Math.cos(a) * 6.6], rot: [0, a, 0] }); }
  // floor: ribbed deck plates in an irregular grid (receive-only; ribbed near the turntable, plain further out)
  const rng = mulberry32(5), F = new KIT.GeoBuilder(78);
  for (let x = -40; x < 40; x += 10) for (let z = -40; z < 40; z += 10) {
    const r = Math.hypot(x + 5, z + 5);
    if (r < 11) continue;
    F.add(r < 30 ? KIT.ribbedPlate(9.8, 9.8, 0.25, { pitch: rng() < 0.5 ? 2.2 : 2.9, axis: rng() < 0.5 ? 'x' : 'y' }) : KIT.plateBox(9.8, 9.8, 0.25, 0.05),
          mats.deck, { pos: [x + 5, -0.12, z + 5], rot: [-Math.PI / 2, 0, 0], tint: 0.09 });
  }
  // the set (no shadows, no AO): stripes, crane, towers, containers, drums, lamps
  const Bs = new KIT.GeoBuilder(80);
  for (const s of [-1, 1]) Bs.add(KIT.plateBox(0.6, 0.06, 70, 0.02), mats.stripe, { pos: [s * 14, 0.02, 2] });
  // the back wall of the bay (outside the camera's orbit, r 26): panelled bays between tapered pilasters, a coping and a
  // hazard band over the main door; the rest of the bay stays in darkness (the AD's "studio" read).
  const WALL = 38, Wb = new KIT.GeoBuilder(79);
  for (let i = 0; i < 8; i++) {
    const x = -40 + i * 10;
    Wb.add(KIT.panelBox(9.6, 22, 1.2, { cols: 1, rows: 3, deps: 1 }), mats.wall, { pos: [x + 5, 11, WALL], tint: 0.08 });
    Wb.add(KIT.slab(1.6, 24, 2.4, { taper: 0.82 }), mats.wallDark, { pos: [x, 12, WALL - 0.6] });
    if (i % 2 === 1 && (i < 3 || i > 5)) lights.push(lampAssembly(Bs, root, mats, [x, 14, WALL - 1.6], [0, -0.35, -1], 0.4, '#ffb36b', 2.6));
  }
  Wb.add(KIT.slab(82, 1.4, 3.2), mats.wallDark, { pos: [0, 23.2, WALL - 0.8] });
  Bs.add(KIT.slab(26, 2.2, 1.8), mats.stripe, { pos: [0, 17.8, WALL - 1.2] });
  for (let i = 0; i < 7; i++) Bs.add(KIT.plateBox(3.2, 0.5, 0.4, 0.06), mats.dark, { pos: [-9.6 + i * 3.2, 17.8, WALL - 2.2] });
  // gantry crane overhead and two lattice towers with walkways
  Bs.add(KIT.truss(60, 3, 3.2, 12, 0.32), mats.rust, { pos: [0, 19, 8] });
  for (const s of [-1, 1]) {
    Bs.add(KIT.truss(22, 2.6, 2.6, 6, 0.28), mats.steel, { pos: [s * 21, 0, 10], rot: [0, 0, Math.PI / 2] });
    Bs.add(KIT.ribbedPlate(4, 8, 0.2, { pitch: 0.5 }), mats.dark, { pos: [s * 19.4, 12, 10], rot: [-Math.PI / 2, 0, 0] });
    for (let k = 0; k < 5; k++) Bs.add(KIT.bar(1.1, 0.08, 0.08), mats.steel, { pos: [s * 17.6, 12.6, 6.4 + k * 1.8], rot: [0, 0, Math.PI / 2] });
    Bs.add(KIT.bar(8, 0.08, 0.08), mats.stripe, { pos: [s * 17.6, 13.1, 10], rot: [0, Math.PI / 2, 0] });
    // containers and drums by the walls
    Bs.add(KIT.ribbedPlate(12, 5.4, 4.8, { pitch: 1.1 }), s < 0 ? mats.rust : mats.plate, { pos: [s * 30, 2.7, 16 - s * 4], rot: [0, Math.PI / 2 + s * 0.08, 0] });
    for (let k = 0; k < 4; k++) Bs.add(KIT.drum(0.65, 1.7, 2), k % 2 ? mats.rust : mats.dark, { pos: [s * 24 + (k % 2) * 1.5, 0, 20 - Math.floor(k / 2) * 1.5] });
  }
  for (const x of [-12, 0, 12]) lights.push(lampAssembly(Bs, root, mats, [x, 18.2, 8], [0, -1, 0], 0.7, '#ffb36b', 5));
  for (const s of [-1, 1]) lights.push(lampAssembly(Bs, root, mats, [s * 19, 12.8, 13.8], [-s * 0.3, -0.4, -1], 0.45, '#ffb36b', 3));
  const table = Bt.build({ name: 'hangarTable' });
  const set = noAO(Bs.build({ name: 'hangarMerged', castShadow: false, receiveShadow: true }));
  const deck = noAO(F.build({ name: 'hangarDeck', castShadow: false, receiveShadow: true }));
  const walls = noAO(Wb.build({ name: 'hangarWalls', castShadow: false, receiveShadow: false }));
  for (const g of [table, set, deck, walls]) { g.traverse(m => { if (m.isMesh) { m.matrixAutoUpdate = false; m.updateMatrix(); } }); root.add(g); }
  return { root };
}
function buildBench(ctx, M) {
  const root = new THREE.Group(); root.name = 'bench';
  const mats = {
    deck: plainMat('#2c2b2b', 0.55, 0.8, 0.8), rust: M('rust', { color: '#7a4128', roughness: 0.88, metalness: 0.35 }),
    teal: M('paintWake', { color: '#4f8a86', roughness: 0.62, metalness: 0.28 }), canvas: M('canvas', { color: '#d9cba8', roughness: 0.95, metalness: 0 }),
    dark: M('dark', { color: '#141416', roughness: 0.8, metalness: 0.4 }), stripe: M('stripe', { color: '#d9a521', roughness: 0.55, metalness: 0.25 }),
    housing: M('dark', { color: '#141416', roughness: 0.8, metalness: 0.4 }), lens: M('lightAmber', null) || ctx.materials?.emissive?.('#ffb36b', 3),
    rubber: M('rubber', { color: '#1a1918', roughness: 0.9, metalness: 0 }),
  };
  const B = new KIT.GeoBuilder(31);
  const rng = mulberry32(31);
  // deck of the crawler: iron tread plates (skewed a little: nothing on a Wake rig matches)
  const F = new KIT.GeoBuilder(32);   // deck: receive-only shadows (see buildHangar)
  for (let x = -12; x < 12; x += 4) for (let z = -16; z < 14; z += 4) {
    F.add(KIT.ribbedPlate(3.9, 3.9, 0.22, { pitch: 0.9 + rng() * 0.5, axis: rng() < 0.5 ? 'x' : 'y' }), mats.deck, { pos: [x + 2, -0.11, z + 2], rot: [-Math.PI / 2, 0, (rng() - 0.5) * 0.02], tint: 0.08 });
  }
  // the kneeling cradle: two hazard-striped rails, cross members, shin pads and a back frame
  const cradleTop = 0.0;
  for (const s of [-1, 1]) {
    B.add(KIT.bar(9, 0.7, 0.6), mats.rust, { pos: [s * 2.4, 0.3, 0.4], rot: [0, Math.PI / 2, 0] });
    for (let k = 0; k < 5; k++) B.add(KIT.plateBox(0.72, 0.62, 0.7, 0.05), k % 2 ? mats.stripe : mats.dark, { pos: [s * 2.4, 0.3, -3.4 + k * 1.9 + 0.35] });
    B.add(KIT.plateBox(1.4, 0.3, 3.6, 0.08), mats.rubber, { pos: [s * 1.25, 0.12, 0.2] });
    B.add(KIT.slab(0.6, 7.6, 0.7, { taper: 0.7 }), mats.rust, { pos: [s * 2.6, 3.8, 4.8] });
    B.add(KIT.cylinder(0.22, 0.22, 4.4, 10), mats.dark, { pos: [s * 2.6, 3.6, 3.6], rot: [0.5, 0, 0] });
  }
  for (const z of [-3.2, 0.4, 3.8]) B.add(KIT.bar(5.4, 0.45, 0.4), mats.rust, { pos: [0, 0.22, z] });
  B.add(KIT.bar(5.8, 0.6, 0.6), mats.rust, { pos: [0, 7.4, 4.8] });
  B.add(KIT.plateBox(4.2, 1.2, 0.4, 0.08), mats.teal, { pos: [0, 6.6, 4.7], tint: 0.06 });
  // crane arm over the frame with the tungsten work lamp; a second arm holding a part
  B.add(KIT.cylinder(0.75, 0.9, 1.0, 12), mats.dark, { pos: [-7.5, 0.5, 2] });
  B.add(KIT.truss(11, 1.0, 1.1, 5, 0.18), mats.teal, { pos: [-7.5, 0.6, 2], rot: [0, 0, Math.PI / 2] });
  const boomFrom = new THREE.Vector3(-7.5, 11, 2), boomTo = new THREE.Vector3(-1.8, 12.2, 0.2);
  B.add(KIT.barBetween(boomFrom, boomTo, 0.7, 0.8), mats.teal);
  B.add(KIT.barBetween([-7.2, 6.5, 2], [-4.0, 11.6, 1.2], 0.28, 0.28), mats.dark);
  B.add(KIT.barBetween([-7.2, 6.5, 2], [-5.0, 10.0, 1.5], 0.42, 0.42), mats.deck);
  const lampPos = new THREE.Vector3(-1.6, 11.3, 0.1);
  B.add(KIT.cylinder(0.12, 0.12, 0.9, 8), mats.dark, { pos: [-1.7, 11.8, 0.15] });
  const lampSprite = lampAssembly(B, root, mats, [lampPos.x, lampPos.y + 0.2, lampPos.z], [0.15, -1, -0.05], 0.75, '#ffb36b', 4.5);
  B.add(KIT.truss(8, 0.8, 0.9, 4, 0.15), mats.rust, { pos: [8.5, 0.5, 6], rot: [0, 0, Math.PI / 2] });
  B.add(KIT.barBetween([8.5, 8.4, 6], [4.5, 10.2, 3.2], 0.5, 0.55), mats.rust);
  B.add(KIT.cylinderBetween([4.5, 10.2, 3.2], [4.5, 7.2, 3.2], 0.05, 6), mats.dark);
  B.add(KIT.armourPlate(KIT.chamferRect(2.4, 1.6, 0.35), 0.18), mats.teal, { pos: [4.5, 6.4, 3.2], rot: [0, 0.6, 0.15] });
  // ribs (arched frames) every 4 m, canvas skin between them on the sides and roof; the rear (+z) is open
  const ribs = [-12, -8, -4, 0, 4, 8, 12];
  for (const z of ribs) {
    for (const s of [-1, 1]) {
      B.add(KIT.bar(9.5, 0.35, 0.45), mats.rust, { pos: [s * 11, 4.75, z], rot: [0, 0, Math.PI / 2] });
      B.add(KIT.barBetween([s * 11, 9.4, z], [s * 5, 14.2, z], 0.35, 0.45), mats.rust);
    }
    B.add(KIT.bar(10, 0.35, 0.45), mats.rust, { pos: [0, 14.2, z] });
  }
  for (let i = 0; i < ribs.length - 1; i++) {
    const z0 = ribs[i], z1 = ribs[i + 1], zc = (z0 + z1) / 2, L = z1 - z0 - 0.3;
    for (const s of [-1, 1]) {
      // sagging canvas: seamed strips that belly inward between the ribs, laced to the frame
      for (let k = 0; k < 3; k++) {
        const y = 1.6 + k * 3.0, bell = (k === 1 ? 0.18 : 0.08) + rng() * 0.06;
        B.add(KIT.plateBox(0.1, 2.9, L, 0.03), mats.canvas, { pos: [s * (11.15 - bell), y, zc], rot: [s * (k - 1) * 0.04, 0, s * (0.02 + rng() * 0.03)], tint: 0.12 });
        B.add(KIT.bar(L * 0.98, 0.06, 0.06), mats.dark, { pos: [s * (11.12 - bell * 0.5), y + 1.47, zc], rot: [0, Math.PI / 2, 0] });
      }
      for (let k = 0; k < 2; k++) B.add(KIT.plateBox(0.1, 3.4, L, 0.03), mats.canvas, { pos: [s * (9.6 - k * 2.9), 10.5 + k * 2.2, zc], rot: [0, 0, s * (0.85 + k * 0.12)], tint: 0.12 });
    }
    for (let k = 0; k < 3; k++) B.add(KIT.plateBox(3.3, 0.1, L, 0.03), mats.canvas, { pos: [-3.3 + k * 3.3, 14.42 - (k === 1 ? 0.15 : 0), zc], tint: 0.1 });
    if (i === 2) {   // the crawler's painted name on the right-hand canvas
      const sign = ctx.materials?.sign?.('THE BENCH', { style: 'painted', color: '#3a2a20', bg: 'rgba(0,0,0,0)', w: 512, h: 128, weathered: 0.4 });
      if (sign) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: sign, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.position.set(10.85, 6.2, zc); m.rotation.y = -Math.PI / 2; root.add(m);
      }
    }
    if (i % 2 === 0) lampAssembly(B, root, mats, [0, 13.8, zc], [0, -1, 0], 0.32, '#ffb36b', 1.8);
  }
  // parts rack on the left wall with the stock parts hanging on it (A2 #11), drums and a tool bench on the right
  B.add(KIT.bar(10, 0.25, 0.25), mats.dark, { pos: [-10.3, 6.2, -4], rot: [0, Math.PI / 2, 0] });
  B.add(KIT.bar(10, 0.25, 0.25), mats.dark, { pos: [-10.3, 2.4, -4], rot: [0, Math.PI / 2, 0] });
  for (const z of [-8.6, -4, 0.6]) B.add(KIT.bar(4.2, 0.2, 0.2), mats.dark, { pos: [-10.3, 4.3, z], rot: [0, 0, Math.PI / 2] });
  const pm = { base: mats.teal, mid: mats.rust, acc: mats.stripe, dark: mats.dark, visor: mats.lens, iron: mats.dark, oxide: mats.rust };
  const K = KIT.acKit(0.07);
  const hang = (vis, pos, rot) => {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.set(...rot);
    PART_VISUALS[vis]?.(K, pm, g);
    const n0 = B.entries.length;
    B.addObject(g);
    for (const e of B.entries.slice(n0)) e.mat.premultiply(g.matrix);
  };
  hang('rifle', [-9.9, 4.6, -7.4], [0, Math.PI / 2, -0.25]);
  hang('blade', [-9.9, 4.2, -2.6], [0, Math.PI / 2, 0.2]);
  hang('pod4', [-9.6, 3.6, 1.6], [0, Math.PI / 2, 0]);
  for (let k = 0; k < 5; k++) B.add(KIT.drum(0.55, 1.5, 2), k % 3 ? mats.teal : mats.rust, { pos: [8.4 + (k % 2) * 1.2, 0, -9 + k * 1.3], tint: 0.08 });
  B.add(KIT.panelBox(2.2, 1.0, 4.5, { cols: 2, rows: 1 }), mats.rust, { pos: [9.6, 1.2, 2.5] });
  B.add(KIT.greebles(mulberry32(9), 2.0, 4.2, 1.2), mats.dark, { pos: [9.6, 1.7, 2.5], rot: [-Math.PI / 2, 0, Math.PI / 2] });
  for (const s of [-1, 1]) B.add(KIT.slab(0.4, 1.2, 0.4), mats.dark, { pos: [9.6 + s * 0.8, 0.6, 2.5 + s * 1.8] });
  const built = B.build({ name: 'benchMerged' }), deck = F.build({ name: 'benchDeck', castShadow: false, receiveShadow: true });
  for (const g of [built, deck]) { g.traverse(m => { if (m.isMesh) { m.matrixAutoUpdate = false; m.updateMatrix(); } }); root.add(g); }
  // the open rear: a sky card in the level's horizon colour (with a darker ground band), seen through the frame
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x6a7a8c, fog: false, vertexColors: true });
  const skyGeo = new THREE.PlaneGeometry(120, 60, 1, 8);
  const sc = new Float32Array(skyGeo.attributes.position.count * 3);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {   // brighter at the horizon, falling toward the top; dark ground band
    const y = skyGeo.attributes.position.getY(i) / 30, v = y < -0.62 ? 0.18 : clamp(1.05 - Math.max(0, y + 0.6) * 0.55, 0.35, 1.05);
    sc[i * 3] = sc[i * 3 + 1] = sc[i * 3 + 2] = v;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(0, 20, 60); sky.rotation.y = Math.PI; root.add(sky);
  const fx = benchEffects(root, lampPos, [0.15, -1, -0.05]);
  return {
    root, lampPos, cradleTop, sky, weldPos: fx.weldPos,
    /** per frame (real time): lamp hum, dust motes in the cone, the welding arc and its sparks; returns the arc light (cd) */
    flicker(t, dt = 1 / 60) { const f = 1 + 0.04 * Math.sin(t * 13.1) * Math.sin(t * 3.7); lampSprite.scale.setScalar(4.5 * f); return fx.update(t, dt); },
  };
}
/** The Bench's light and life (AD §5.7, The Bench): the work lamp's light cone with dust motes drifting in it, and a
 *  welding arc at the frame's right knee (blue-white flicker, a spark shower that falls and bounces on the deck).
 *  Cosmetic only (Math.random is allowed here, §1.4); fixed-size buffers, nothing allocated per frame. */
function benchEffects(root, lampPos, lampDir) {
  const dir = new THREE.Vector3(...lampDir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const apex = lampPos.clone().addScaledVector(dir, 0.9);
  // light cone: an open cone, apex at the lens, fading to nothing at the floor (vertex colour = falloff)
  const H = 10.5, coneGeo = new THREE.ConeGeometry(4.6, H, 28, 8, true);
  coneGeo.translate(0, -H / 2, 0);
  const cp = coneGeo.attributes.position, cc = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) {
    const t = clamp(-cp.getY(i) / H, 0, 1), v = Math.pow(1 - t, 1.6) * clamp(t / 0.12, 0, 1);
    cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = v;
  }
  for (let i = 0; i < cp.count; i++) cc[i] = cc[i * 3];
  coneGeo.setAttribute('fade', new THREE.BufferAttribute(cc.slice(0, cp.count), 1));
  // soft edges: the sheet fades where it turns edge-on to the view, so the cone reads as a shaft, not a lampshade
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffb36b').multiplyScalar(0.11) } },
    vertexShader: `attribute float fade; varying float vF; varying vec3 vN; varying vec3 vV;
      void main() { vF = fade; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vF; varying vec3 vN; varying vec3 vV;
      void main() { float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * vF * f * f, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.copy(apex); cone.quaternion.copy(q); cone.renderOrder = 3; cone.name = 'lampCone';
  root.add(cone);
  // dust motes inside the cone (slow drift, wrapped)
  const NM = 70, mp = new Float32Array(NM * 3), mSeed = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++) { mSeed[i * 3] = Math.random(); mSeed[i * 3 + 1] = Math.random(); mSeed[i * 3 + 2] = Math.random() * Math.PI * 2; }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const moteMat = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color('#ffd2a0').multiplyScalar(0.9), size: 0.09, sizeAttenuation: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.renderOrder = 4; motes.name = 'dustMotes';
  root.add(motes);
  // the welding arc at the right knee (half hidden by the shin: someone is working behind it), sparks falling to the deck
  const weldPos = new THREE.Vector3(2.25, 1.2, -1.8);
  const arc = glowSprite('#cfe6ff', 1.4, 5); arc.position.copy(weldPos); arc.renderOrder = 5; root.add(arc);
  const NS = 64, sp = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkMat = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color('#ffd9a0').multiplyScalar(3), size: 0.16, sizeAttenuation: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; sparks.renderOrder = 5; sparks.name = 'weldSparks';
  root.add(sparks);
  for (let i = 0; i < NS; i++) { sp[i * 3 + 1] = -50; sl[i] = 0; }
  let welding = false, phase = 1.5, next = 0;
  return {
    weldPos,
    update(t, dt) {
      dt = Math.min(dt, 0.1);
      for (let i = 0; i < NM; i++) {   // motes: a slow column of dust inside the cone
        const u = (mSeed[i * 3] + t * 0.012) % 1, r = Math.sqrt(mSeed[i * 3 + 1]) * 4.0 * (0.15 + 0.85 * u), a = mSeed[i * 3 + 2] + t * 0.05;
        const lx = Math.cos(a) * r, lz = Math.sin(a) * r, ly = -u * H * 0.92;
        // cone-local (x, y, z) → world: rotate by q, offset by the apex (inlined to avoid temporaries)
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        const ix = qw * lx + qy * lz - qz * ly, iy = qw * ly + qz * lx - qx * lz, iz = qw * lz + qx * ly - qy * lx, iw = -qx * lx - qy * ly - qz * lz;
        mp[i * 3] = apex.x + ix * qw + iw * -qx + iy * -qz - iz * -qy;
        mp[i * 3 + 1] = apex.y + iy * qw + iw * -qy + iz * -qx - ix * -qz + Math.sin(t * 0.7 + i) * 0.05;
        mp[i * 3 + 2] = apex.z + iz * qw + iw * -qz + ix * -qy - iy * -qx;
      }
      moteGeo.attributes.position.needsUpdate = true;
      phase -= dt;   // welding comes in bursts: 1.5–4 s of arc, 1–3 s of quiet
      if (phase <= 0) { welding = !welding; phase = welding ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 2; }
      const on = welding && Math.random() < 0.82;
      arc.visible = on; arc.scale.setScalar(on ? 0.8 + Math.random() * 1.1 : 0.01);
      if (welding) {
        next -= dt;
        while (next <= 0) {
          next += 0.012 + Math.random() * 0.02;
          let k = -1; for (let i = 0; i < NS; i++) if (sl[i] <= 0) { k = i; break; }
          if (k < 0) break;
          sp[k * 3] = weldPos.x; sp[k * 3 + 1] = weldPos.y; sp[k * 3 + 2] = weldPos.z;
          const a = Math.random() * Math.PI * 2, up = Math.random() * 3.2, out = 1.5 + Math.random() * 3;
          sv[k * 3] = 0.6 + Math.cos(a) * out * 0.6 + out * 0.5; sv[k * 3 + 1] = up; sv[k * 3 + 2] = Math.sin(a) * out * 0.8 - 0.8;
          sl[k] = 0.5 + Math.random() * 0.7;
        }
      }
      for (let i = 0; i < NS; i++) {
        if (sl[i] <= 0) { sp[i * 3 + 1] = -50; continue; }
        sl[i] -= dt;
        sv[i * 3 + 1] -= 9.8 * dt;
        sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
        if (sp[i * 3 + 1] < 0.03 && sv[i * 3 + 1] < 0) { sp[i * 3 + 1] = 0.03; sv[i * 3 + 1] *= -0.3; sv[i * 3] *= 0.5; sv[i * 3 + 2] *= 0.5; }
      }
      sparkGeo.attributes.position.needsUpdate = true;
      return on ? 25 + Math.random() * 45 : 0;
    },
  };
}

const CSS = `
#screen.garage{padding:0;display:block;overflow:hidden;background:none}
.gx{position:absolute;inset:0;display:flex;pointer-events:none}
.gx-panel{pointer-events:auto;position:relative;margin:clamp(12px,3vh,28px) 0 clamp(12px,3vh,28px) clamp(12px,4vw,56px);width:clamp(340px,38vw,520px);
  display:flex;flex-direction:column;min-height:0;max-height:calc(100% - 2*clamp(12px,3vh,28px));box-shadow:0 18px 60px rgba(0,0,0,.45)}
.gx-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.gx-head .eyebrow{flex:1 0 100%}
.gx-head h2{margin:2px 0 8px;font-size:clamp(34px,4.6vw,54px);line-height:.9;letter-spacing:.03em;text-transform:uppercase;font-weight:700}
.gx .tabs{flex:none}
.gx .tabs button{padding:8px 11px;white-space:nowrap}
.gx .tabs .ct{font:600 11px var(--f-mono);color:var(--accent);font-style:normal}
.gx-list{flex:1 1 auto;min-height:60px;overflow-y:auto;margin-top:12px;padding-right:4px;display:grid;gap:6px;align-content:start}
.gx-card{display:grid;gap:3px;text-align:left;width:100%;background:rgba(12,11,14,.4);border:1px solid var(--hud-faint);padding:9px 12px;color:var(--hud);cursor:pointer;font-family:var(--f-display)}
.gx-card .nm{font:600 18px var(--f-display);letter-spacing:.08em;text-transform:uppercase}
.gx-card .ds{font:400 12px var(--f-mono);color:var(--hud-dim);line-height:1.45}
.gx-card .ks{display:flex;flex-wrap:wrap;gap:4px 12px;font:500 11px var(--f-mono);color:var(--hud);letter-spacing:.04em}
.gx-card .ks b{font-weight:500}
.gx-card:hover,.gx-card:focus-visible{border-color:var(--accent);outline:none}
.gx-card.on{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent);background:rgba(224,145,60,.08)}
.gx-card.locked{opacity:.5;cursor:default}
.gx-card.locked:hover{border-color:var(--hud-faint)}
.gx-card .lk,.gx .tag{font:600 10px var(--f-mono);letter-spacing:.14em;color:var(--hud-dim);border:1px solid var(--hud-faint);padding:1px 5px;margin-left:6px;font-style:normal;vertical-align:middle}
.gx .tag.on{color:var(--accent);border-color:var(--accent)}
.gx-empty{font:400 13px var(--f-mono);color:var(--hud-dim);padding:10px 2px}
.gx-swatches{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.gx-sw{display:grid;gap:6px;background:rgba(12,11,14,.4);border:1px solid var(--hud-faint);padding:10px;color:var(--hud);cursor:pointer;text-align:left}
.gx-sw.on,.gx-sw:hover{border-color:var(--accent)}
.gx-sw .chips{display:flex;gap:3px}.gx-sw .chips i{flex:1;height:22px;display:block}
.gx-sw .nm{font:600 14px var(--f-display);letter-spacing:.16em;text-transform:uppercase}
.gx-stats{flex:none;margin-top:12px;border-top:1px solid var(--hud-faint);padding-top:10px;font-family:var(--f-mono);font-size:12px}
.gx-row{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr auto 1fr;gap:4px 8px;color:var(--hud-dim);align-items:baseline}
.gx-row b{color:var(--hud);font-weight:500}
.gx-meter{margin-top:8px;color:var(--hud-dim);letter-spacing:.08em}
.gx-meter .stat-bar{margin-top:4px}
.gx-warn{color:var(--threat);margin-top:8px;min-height:1em;line-height:1.5}
.gx .actions{flex:none;margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}
.gx-stage{pointer-events:auto;flex:1;position:relative;cursor:grab;touch-action:none}
.gx-stage:active{cursor:grabbing}
.gx-hint{position:absolute;right:28px;bottom:22px;font:500 11px var(--f-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--hud-dim)}
@media (max-height:500px),(max-width:760px){
  .gx-panel{width:min(56vw,460px);margin:8px 0 8px max(8px,var(--safe-l));padding:10px 12px;max-height:calc(100% - 16px)}
  .gx-head h2{font-size:26px;margin:0 0 4px}
  .gx-head .eyebrow{font-size:9px}
  .gx .tabs{flex-wrap:nowrap;overflow-x:auto}
  .gx .tabs button{font-size:11px;padding:6px 8px;letter-spacing:.14em}
  .gx-list{margin-top:6px;gap:4px}
  .gx-card{padding:6px 9px}
  .gx-card .nm{font-size:14px}
  .gx-card .ds{font-size:10px}
  .gx-card .ks{font-size:10px;gap:2px 8px}
  .gx-stats{margin-top:6px;padding-top:6px;font-size:10px}
  .gx-row{grid-template-columns:repeat(8,auto)}
  .gx-meter{margin-top:4px}
  .gx .actions{margin-top:8px;gap:8px}
  .gx .actions .btn{font-size:13px;padding:8px 14px}
  .gx-hint{display:none}
}
`;
// Bench-only rules (A3.6: injectCSS('bench', …)), layered on the shared garage panel styles
const BENCH_CSS = `
.gx-water{margin-left:auto;font:500 13px var(--f-mono);color:var(--hud-dim);letter-spacing:.12em}
.gx-water b{color:var(--en);font-size:20px;margin-left:6px}
.gx-slot{display:grid;gap:5px;margin-bottom:6px}
.gx-slotname,.gx-sub{font:600 12px var(--f-display);letter-spacing:.26em;color:var(--accent);margin-top:6px}
.gx-sub.dim{color:var(--hud-dim);letter-spacing:.1em;font:400 11px var(--f-mono);margin-top:12px}
.gx-fixed{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.gx-fixedcard{display:grid;gap:2px;border:1px dashed var(--hud-faint);padding:8px 10px}
.gx-fixedcard .hp{font:600 11px var(--f-display);letter-spacing:.24em;color:var(--hud-dim)}
.gx-fixedcard .nm{font:600 15px var(--f-display);letter-spacing:.08em;text-transform:uppercase}
.gx-fixedcard .ds{font-size:11px;color:var(--hud-dim);line-height:1.4}
.gx-fixedcard .no{font:400 10px var(--f-mono);color:var(--hud-dim);letter-spacing:.06em}
.gx-haul{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;border:1px solid var(--hud-faint);padding:8px 10px;background:rgba(12,11,14,.4)}
.gx-haul .nm{font:600 17px var(--f-display);letter-spacing:.08em;text-transform:uppercase}
.gx-haul .ds{grid-column:1;font:400 11px var(--f-mono);color:var(--hud-dim)}
.gx-haul .gx-give{grid-column:2;grid-row:1 / span 2;font-size:14px;padding:8px 14px;letter-spacing:.16em}
.gx-give span{display:block;font:500 10px var(--f-mono);letter-spacing:.08em;color:var(--en)}
.gx-wake{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.gx-big{border:1px solid var(--hud-faint);padding:8px 10px;display:grid;gap:2px}
.gx-big span{font:600 10px var(--f-display);letter-spacing:.2em;color:var(--hud-dim)}
.gx-big b{font:600 34px var(--f-display);color:var(--en);line-height:1}
.gx-big i{font:400 10px var(--f-mono);font-style:normal;color:var(--hud-dim)}
.gx-big.bad b,.gx-big.bad i{color:var(--threat)}
.gx-roll{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 14px;font:400 12px var(--f-mono);margin-top:6px}
.gx-roll span{display:flex;justify-content:space-between;border-bottom:1px solid rgba(233,227,211,.06);padding:2px 0}
.gx-roll span i{color:var(--hud-dim);font-style:normal}
.gx-roll span.lost{color:var(--hud-dim);text-decoration:line-through}
.gx-frags{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.gx-frag{border:1px solid var(--hud-faint);padding:8px 10px;display:grid;gap:5px;background:rgba(12,11,14,.4)}
.gx-frag .id{font-size:10px;color:var(--hud-dim)}
.gx-frag .gl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-variant:small-caps;color:#7fe9ff;line-height:1.35}
.gx-frag .rd{display:grid;gap:4px}
.gx-frag .rd i{display:block;height:7px;background:rgba(233,227,211,.78)}
.gx-comms{pointer-events:none;position:absolute;right:clamp(12px,4vw,56px);bottom:clamp(12px,4vh,40px);width:min(460px,44vw);background:rgba(12,11,14,.72);
  border-left:3px solid var(--accent);padding:10px 14px;display:grid;gap:4px;transition:opacity .3s}
.gx-comms.idle{opacity:0}
.gx-comms .who{font:600 12px var(--f-display);letter-spacing:.24em;text-transform:uppercase}
.gx-comms .line{font:500 17px var(--f-display);letter-spacing:.03em;line-height:1.3;min-height:1.3em}
.gx-comms .line.mono{font:500 14px var(--f-mono);text-transform:uppercase;letter-spacing:.06em}
.gx-confirm{pointer-events:auto;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(12,11,14,.55)}
.gx-confirm h3{margin:0 0 6px;font:700 36px var(--f-display);text-transform:uppercase;letter-spacing:.04em}
@media (max-height:500px),(max-width:760px){
  .gx-comms{width:min(330px,38vw);right:max(8px,var(--safe-r));bottom:8px;padding:6px 10px}
  .gx-comms .line{font-size:13px}
  .gx-fixed,.gx-frags,.gx-roll{grid-template-columns:1fr}
  .gx-big b{font-size:24px}
}
`;
