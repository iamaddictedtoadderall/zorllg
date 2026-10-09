// audio/audio.js (P1): the WebAudio graph (master → compressor → out; music, sfx and ambience buses), every synthesized
// SFX (prototype AU port plus the new names in architecture Appendix C.1 and addendum A5.4), 3D attenuation with
// stereo pan from the camera, loops, the comms typewriter blip, ducking, and a weather-driven ambience bed.
// There are no samples: everything is oscillators and filtered noise. ?mute=1 holds the master at 0 (tests).
// play() with an unknown name is a no-op that warns once (A5.4).

export const SFX = [
  // prototype
  'rifle', 'erifle', 'plasma', 'cannon', 'turret', 'explode', 'boom', 'qb', 'blade', 'bladeHit', 'missile', 'lock',
  'blip', 'hit', 'hurt', 'alarm', 'land', 'stagger', 'repair', 'empty', 'charge', 'door', 'confirm', 'glitch',
  // new
  'mg', 'shotgun', 'mortar', 'rail', 'step', 'stepHeavy', 'servo', 'rotor', 'dropship', 'flyby', 'thunder', 'collapse',
  'metalGroan', 'klaxon', 'static', 'pickup', 'objective', 'checkpoint', 'uiMove', 'uiSelect', 'uiBack', 'interact',
  'shockwave', 'warn',
  // addendum A5.4
  'chime', 'heartbeat', 'flatline', 'tear', 'splash', 'bubbles', 'iceGroan', 'iceCrack', 'saw', 'harpoon', 'winch', 'rotorWhine',
];
const KNOWN = new Set(SFX);
const LOOPS = ['boost', 'hover', 'wind', 'rain', 'fire', 'alarm', 'engine', 'rumble'];
const UI = new Set(['blip', 'lock', 'hit', 'hurt', 'alarm', 'repair', 'empty', 'confirm', 'glitch', 'pickup', 'objective', 'checkpoint',
  'uiMove', 'uiSelect', 'uiBack', 'interact', 'warn', 'klaxon', 'chime', 'heartbeat', 'flatline', 'static']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------------------------------------ synth helpers
/** Builds a synth bound to an AudioContext (real or offline), its noise buffers and a destination node. */
function makeSynth(ac, buf, dest) {
  const S = {
    ac, dest, end: 0,
    env(g, t, vol, dur, att = 0.005) {
      vol = Math.max(1e-4, vol);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(att + 0.01, dur));
      S.end = Math.max(S.end, t + dur);
    },
    noise(t, o) {
      const { dur = 0.2, freq = 1000, f1 = null, q = 1, type = 'bandpass', vol = 0.5, att = 0.005, which = 'white', rate = 1 } = o;
      if (vol < 1e-4) return;
      const s = ac.createBufferSource(); s.buffer = which === 'brown' ? buf.brown : buf.white; s.playbackRate.value = rate;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = ac.createGain(); S.env(g, t, vol, dur, att);
      s.connect(f); f.connect(g); g.connect(o.dest || dest);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    },
    tone(t, o) {
      const { type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.2, att = 0.005, detune = 0, vib = 0, vibRate = 5 } = o;
      if (vol < 1e-4) return;
      const osc = ac.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(Math.max(1, f0), t); osc.detune.value = detune;
      if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      if (vib > 0) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
      const g = ac.createGain(); S.env(g, t, vol, dur, att);
      let out = g;
      if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.lpQ ?? 0.7; g.connect(f); out = f; }
      osc.connect(g); out.connect(o.dest || dest);
      osc.start(t); osc.stop(t + dur + 0.05);
    },
    /** amplitude-modulated noise (rotors, rattles) */
    chop(t, o) {
      const { dur = 0.6, freq = 300, q = 1.2, vol = 0.3, rate = 12, depth = 0.9, type = 'bandpass' } = o;
      const s = ac.createBufferSource(); s.buffer = buf.white;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); S.env(g, t, vol, dur, o.att ?? 0.05);
      const am = ac.createGain(); am.gain.value = 1 - depth * 0.5;
      const l = ac.createOscillator(); l.type = 'square'; l.frequency.value = rate;
      const lg = ac.createGain(); lg.gain.value = depth * 0.5; l.connect(lg); lg.connect(am.gain);
      s.connect(f); f.connect(am); am.connect(g); g.connect(o.dest || dest);
      s.start(t, Math.random()); s.stop(t + dur + 0.05); l.start(t); l.stop(t + dur + 0.05);
    },
    /** a struck bell: fundamental plus an inharmonic partial that decays faster */
    bell(t, f, vol, dur = 1.4) {
      S.tone(t, { type: 'sine', f0: f, dur, vol, att: 0.004 });
      S.tone(t, { type: 'sine', f0: f * 2.76, dur: dur * 0.45, vol: vol * 0.18, att: 0.003 });
      S.tone(t, { type: 'sine', f0: f * 5.4, dur: dur * 0.2, vol: vol * 0.06, att: 0.002 });
    },
  };
  return S;
}

/** SFX recipes: (S, t, k = volume scale, r = pitch scale). Prototype recipes are ported unchanged. */
const RECIPES = {
  rifle(S, t, k, r) { S.noise(t, { dur: 0.09, freq: 2000 * r, q: 0.7, vol: 0.32 * k }); S.tone(t, { type: 'square', f0: 190 * r, f1: 55 * r, dur: 0.07, vol: 0.12 * k }); },
  erifle(S, t, k, r) { S.noise(t, { dur: 0.08, freq: 1500 * r, q: 0.9, vol: 0.25 * k }); S.tone(t, { type: 'square', f0: 150 * r, f1: 50 * r, dur: 0.06, vol: 0.08 * k }); },
  plasma(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 1100 * r, f1: 180 * r, dur: 0.2, vol: 0.09 * k }); },
  cannon(S, t, k, r) { S.noise(t, { dur: 0.55, freq: 700 * r, f1: 120, type: 'lowpass', q: 0.5, vol: 0.6 * k }); S.tone(t, { f0: 95 * r, f1: 30, dur: 0.45, vol: 0.5 * k }); },
  turret(S, t, k, r) { S.noise(t, { dur: 0.06, freq: 2600 * r, q: 1.2, vol: 0.2 * k }); },
  explode(S, t, k, r) { S.noise(t, { dur: 1.1, freq: 2400 * r, f1: 90, type: 'lowpass', q: 0.4, vol: 0.75 * k }); S.tone(t, { f0: 70 * r, f1: 25, dur: 0.8, vol: 0.55 * k }); },
  boom(S, t, k, r) { S.noise(t, { dur: 2.2, freq: 1800 * r, f1: 50, type: 'lowpass', q: 0.4, vol: 0.95 * k }); S.tone(t, { f0: 55 * r, f1: 18, dur: 1.8, vol: 0.8 * k }); },
  qb(S, t, k, r) { S.noise(t, { dur: 0.38, freq: 380 * r, f1: 1800 * r, q: 0.9, vol: 0.45 * k }); S.tone(t, { type: 'triangle', f0: 120 * r, f1: 60 * r, dur: 0.2, vol: 0.2 * k }); },
  blade(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 160 * r, f1: 1200 * r, dur: 0.28, vol: 0.18 * k }); S.noise(t, { dur: 0.25, freq: 4000, type: 'highpass', vol: 0.25 * k }); },
  bladeHit(S, t, k, r) { S.tone(t, { type: 'square', f0: 90 * r, f1: 40, dur: 0.35, vol: 0.4 * k }); S.noise(t, { dur: 0.4, freq: 1200 * r, q: 0.5, vol: 0.5 * k }); },
  missile(S, t, k, r) { S.noise(t, { dur: 0.6, freq: 3200 * r, f1: 900 * r, q: 0.8, vol: 0.22 * k }); },
  lock(S, t, k, r) { S.tone(t, { f0: 1500 * r, dur: 0.05, vol: 0.06 * k }); },
  blip(S, t, k, r) { S.tone(t, { type: 'square', f0: (700 + Math.random() * 500) * r, dur: 0.025, vol: 0.025 * k }); },
  hit(S, t, k, r) { S.tone(t, { type: 'triangle', f0: 2400 * r, dur: 0.035, vol: 0.05 * k }); },
  hurt(S, t, k, r) { S.noise(t, { dur: 0.28, freq: 500 * r, type: 'lowpass', vol: 0.55 * k }); S.tone(t, { type: 'square', f0: 330 * r, f1: 200 * r, dur: 0.12, vol: 0.06 * k }); },
  alarm(S, t, k, r) { S.tone(t, { type: 'square', f0: 920 * r, dur: 0.1, vol: 0.06 * k }); S.tone(t + 0.13, { type: 'square', f0: 920 * r, dur: 0.1, vol: 0.06 * k }); },
  land(S, t, k, r) { S.noise(t, { dur: 0.35, freq: 320 * r, type: 'lowpass', vol: 0.5 * k }); S.tone(t, { f0: 80 * r, f1: 40, dur: 0.25, vol: 0.3 * k }); },
  stagger(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 240 * r, f1: 50, dur: 0.5, vol: 0.18 * k }); S.tone(t, { type: 'square', f0: 1200 * r, f1: 600 * r, dur: 0.15, vol: 0.06 * k }); },
  repair(S, t, k, r) { S.tone(t, { type: 'sine', f0: 400 * r, f1: 900 * r, dur: 0.6, vol: 0.12 * k }); },
  empty(S, t, k, r) { S.tone(t, { type: 'square', f0: 200 * r, dur: 0.05, vol: 0.05 * k }); },
  charge(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 80 * r, f1: 900 * r, dur: 1.3, vol: 0.2 * k }); },
  door(S, t, k, r) { S.noise(t, { dur: 3, freq: 200 * r, type: 'lowpass', q: 4, vol: 0.4 * k }); S.tone(t, { type: 'sawtooth', f0: 45 * r, f1: 60 * r, dur: 3, vol: 0.1 * k }); },
  confirm(S, t, k, r) { S.tone(t, { f0: 660 * r, dur: 0.08, vol: 0.08 * k }); S.tone(t + 0.09, { f0: 990 * r, dur: 0.12, vol: 0.08 * k }); },
  glitch(S, t, k, r) { S.noise(t, { dur: 0.3, freq: 5000 * r, q: 6, vol: 0.18 * k }); S.tone(t, { type: 'square', f0: 60 * r, dur: 0.3, vol: 0.1 * k }); },
  // ---- new (Appendix C.1)
  mg(S, t, k, r) { S.noise(t, { dur: 0.06, freq: 2400 * r, q: 0.8, vol: 0.26 * k }); S.tone(t, { type: 'square', f0: 220 * r, f1: 70 * r, dur: 0.05, vol: 0.09 * k }); },
  shotgun(S, t, k, r) { S.noise(t, { dur: 0.32, freq: 3200 * r, f1: 260, type: 'lowpass', q: 0.6, vol: 0.6 * k }); S.noise(t, { dur: 0.05, freq: 5000, type: 'highpass', vol: 0.3 * k }); S.tone(t, { f0: 130 * r, f1: 42, dur: 0.22, vol: 0.4 * k }); },
  mortar(S, t, k, r) { S.tone(t, { f0: 170 * r, f1: 38, dur: 0.38, vol: 0.55 * k }); S.noise(t, { dur: 0.5, freq: 900 * r, f1: 150, type: 'lowpass', vol: 0.4 * k }); S.noise(t + 0.05, { dur: 0.7, freq: 2600 * r, f1: 1400 * r, q: 6, vol: 0.05 * k }); },
  rail(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 3200 * r, f1: 180 * r, dur: 0.26, vol: 0.16 * k }); S.noise(t, { dur: 0.16, freq: 6000, type: 'highpass', vol: 0.3 * k }); S.tone(t, { f0: 85 * r, f1: 40, dur: 0.45, vol: 0.35 * k }); },
  step(S, t, k, r) { S.noise(t, { dur: 0.12, freq: 180 * r, type: 'lowpass', q: 0.8, vol: 0.32 * k }); S.tone(t, { f0: 62 * r, f1: 40, dur: 0.1, vol: 0.18 * k }); },
  stepHeavy(S, t, k, r) { S.noise(t, { dur: 0.25, freq: 140 * r, type: 'lowpass', q: 0.8, vol: 0.55 * k }); S.tone(t, { f0: 48 * r, f1: 30, dur: 0.22, vol: 0.4 * k }); S.noise(t + 0.01, { dur: 0.08, freq: 900 * r, q: 8, vol: 0.12 * k }); },
  servo(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 380 * r, f1: 640 * r, dur: 0.26, vol: 0.05 * k, lp: 1400 }); S.tone(t, { type: 'square', f0: 760 * r, f1: 1280 * r, dur: 0.26, vol: 0.015 * k, lp: 2400 }); },
  rotor(S, t, k, r) { S.chop(t, { dur: 0.9, freq: 260 * r, q: 0.9, vol: 0.4 * k, rate: 13 * r, depth: 0.95, att: 0.15 }); },
  dropship(S, t, k, r) { S.noise(t, { dur: 2.2, freq: 260 * r, type: 'lowpass', q: 0.7, vol: 0.55 * k, att: 0.4, which: 'brown' }); S.tone(t, { type: 'sawtooth', f0: 46 * r, f1: 52 * r, dur: 2.2, vol: 0.12 * k, att: 0.4, lp: 300, vib: 2, vibRate: 3 }); S.chop(t, { dur: 2.2, freq: 140 * r, vol: 0.18 * k, rate: 9, att: 0.5 }); },
  flyby(S, t, k, r) { S.noise(t, { dur: 1.0, freq: 380 * r, f1: 1900 * r, q: 1.2, vol: 0.4 * k, att: 0.8 }); S.noise(t + 1.0, { dur: 1.1, freq: 1900 * r, f1: 260 * r, q: 1.2, vol: 0.4 * k, att: 0.02 }); S.tone(t + 0.6, { type: 'sawtooth', f0: 140 * r, f1: 70 * r, dur: 1.4, vol: 0.06 * k, lp: 500 }); },
  thunder(S, t, k, r) { S.noise(t, { dur: 0.25, freq: 3000 * r, type: 'highpass', vol: 0.25 * k }); S.noise(t, { dur: 3.2, freq: 520 * r, f1: 60, type: 'lowpass', q: 0.4, vol: 0.9 * k, att: 0.05, which: 'brown' }); S.noise(t + 0.4, { dur: 2.0, freq: 240 * r, f1: 50, type: 'lowpass', vol: 0.6 * k, att: 0.2, which: 'brown' }); },
  collapse(S, t, k, r) {
    S.noise(t, { dur: 3.2, freq: 300 * r, f1: 60, type: 'lowpass', vol: 0.8 * k, att: 0.1, which: 'brown' });
    for (let i = 0; i < 6; i++) { const tt = t + rnd(0, 1.6); S.noise(tt, { dur: rnd(0.15, 0.4), freq: rnd(600, 2200) * r, q: 3, vol: 0.25 * k }); S.tone(tt, { type: 'square', f0: rnd(90, 220) * r, f1: 40, dur: 0.3, vol: 0.08 * k }); }
  },
  metalGroan(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 72 * r, f1: 54 * r, dur: 1.9, vol: 0.2 * k, att: 0.3, lp: 600, lpQ: 6, vib: 3, vibRate: 1.7 }); S.noise(t, { dur: 1.9, freq: 700 * r, f1: 420 * r, q: 12, vol: 0.08 * k, att: 0.4 }); },
  klaxon(S, t, k, r) { for (let i = 0; i < 2; i++) { S.tone(t + i * 0.8, { type: 'square', f0: 440 * r, dur: 0.38, vol: 0.07 * k, lp: 2200 }); S.tone(t + i * 0.8 + 0.4, { type: 'square', f0: 554 * r, dur: 0.38, vol: 0.07 * k, lp: 2200 }); } },
  static(S, t, k, r) { S.noise(t, { dur: 0.35, freq: 2600 * r, type: 'highpass', vol: 0.12 * k }); S.chop(t, { dur: 0.35, freq: 1800 * r, q: 0.5, vol: 0.08 * k, rate: 31, depth: 1 }); },
  pickup(S, t, k, r) { [660, 880, 1320].forEach((f, i) => S.tone(t + i * 0.06, { type: 'triangle', f0: f * r, dur: 0.14, vol: 0.08 * k })); },
  objective(S, t, k, r) { S.tone(t, { type: 'triangle', f0: 523 * r, dur: 0.18, vol: 0.09 * k }); S.tone(t + 0.12, { type: 'triangle', f0: 784 * r, dur: 0.32, vol: 0.09 * k }); },
  checkpoint(S, t, k, r) { [660, 880, 1100].forEach((f, i) => S.bell(t + i * 0.1, f * r, 0.06 * k, 0.8)); },
  uiMove(S, t, k, r) { S.tone(t, { type: 'square', f0: 1200 * r, dur: 0.02, vol: 0.02 * k, lp: 3000 }); },
  uiSelect(S, t, k, r) { S.tone(t, { type: 'triangle', f0: 880 * r, dur: 0.06, vol: 0.07 * k }); S.tone(t + 0.06, { type: 'triangle', f0: 1320 * r, dur: 0.1, vol: 0.07 * k }); },
  uiBack(S, t, k, r) { S.tone(t, { type: 'triangle', f0: 660 * r, dur: 0.06, vol: 0.06 * k }); S.tone(t + 0.06, { type: 'triangle', f0: 440 * r, dur: 0.1, vol: 0.06 * k }); },
  interact(S, t, k, r) { S.tone(t, { type: 'sine', f0: 520 * r, f1: 700 * r, dur: 0.12, vol: 0.08 * k }); S.noise(t, { dur: 0.08, freq: 3000, q: 2, vol: 0.04 * k }); },
  shockwave(S, t, k, r) { S.noise(t, { dur: 0.9, freq: 1400 * r, f1: 90, type: 'lowpass', vol: 0.6 * k, att: 0.01 }); S.tone(t, { f0: 52 * r, f1: 26, dur: 0.7, vol: 0.5 * k }); },
  warn(S, t, k, r) { for (let i = 0; i < 3; i++) S.tone(t + i * 0.14, { type: 'square', f0: 880 * r, dur: 0.08, vol: 0.06 * k, lp: 2600 }); },
  // ---- addendum A5.4
  chime(S, t, k, r) { [659.25, 523.25, 440].forEach((f, i) => S.bell(t + i * 0.35, f * r, 0.12 * k, 1.6)); },
  heartbeat(S, t, k, r) {
    S.tone(t, { f0: 58 * r, f1: 40 * r, dur: 0.14, vol: 0.5 * k, lp: 160 }); S.noise(t, { dur: 0.1, freq: 120, type: 'lowpass', vol: 0.25 * k, which: 'brown' });
    S.tone(t + 0.19, { f0: 52 * r, f1: 38 * r, dur: 0.12, vol: 0.35 * k, lp: 160 });
  },
  flatline(S, t, k, r) { S.tone(t, { type: 'sine', f0: 1000 * r, dur: 1.5, vol: 0.07 * k, att: 0.01 }); },
  tear(S, t, k, r) {
    S.noise(t, { dur: 0.55, freq: 3200 * r, f1: 520 * r, q: 2.5, vol: 0.5 * k, att: 0.02 });
    S.tone(t, { type: 'sawtooth', f0: 950 * r, f1: 260 * r, dur: 0.5, vol: 0.12 * k, lp: 2600, lpQ: 4 });
    S.tone(t + 0.42, { type: 'square', f0: 110 * r, f1: 45, dur: 0.3, vol: 0.3 * k }); S.noise(t + 0.42, { dur: 0.3, freq: 1500 * r, q: 0.8, vol: 0.35 * k });
  },
  splash(S, t, k, r) { S.noise(t, { dur: 0.7, freq: 2200 * r, f1: 280, type: 'lowpass', q: 0.6, vol: 0.55 * k, att: 0.01 }); S.noise(t + 0.05, { dur: 0.5, freq: 900 * r, q: 2, vol: 0.18 * k }); RECIPES.bubbles(S, t + 0.25, k * 0.5, r); },
  bubbles(S, t, k, r) { for (let i = 0; i < 7; i++) { const f = rnd(320, 900) * r; S.tone(t + rnd(0, 0.7), { type: 'sine', f0: f, f1: f * 1.8, dur: rnd(0.04, 0.09), vol: 0.06 * k }); } },
  iceGroan(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 62 * r, f1: 46 * r, dur: 2.2, vol: 0.18 * k, att: 0.5, lp: 380, lpQ: 8, vib: 4, vibRate: 0.9 }); S.noise(t + 0.3, { dur: 1.6, freq: 520 * r, f1: 300 * r, q: 14, vol: 0.06 * k, att: 0.3 }); },
  iceCrack(S, t, k, r) { S.noise(t, { dur: 0.06, freq: 4200 * r, type: 'highpass', vol: 0.5 * k, att: 0.001 }); S.tone(t, { type: 'sine', f0: 2600 * r, f1: 1200 * r, dur: 0.18, vol: 0.06 * k }); S.noise(t + 0.03, { dur: 0.9, freq: 900 * r, f1: 300, q: 3, vol: 0.1 * k }); },
  saw(S, t, k, r) { S.tone(t, { type: 'sawtooth', f0: 320 * r, f1: 1450 * r, dur: 0.85, vol: 0.12 * k, att: 0.05, lp: 3600, lpQ: 3 }); S.noise(t, { dur: 0.85, freq: 2600 * r, q: 1.5, vol: 0.2 * k, att: 0.05 }); },
  harpoon(S, t, k, r) { S.noise(t, { dur: 0.08, freq: 1500 * r, q: 0.7, vol: 0.45 * k }); S.tone(t, { type: 'square', f0: 140 * r, f1: 60, dur: 0.1, vol: 0.2 * k }); S.tone(t + 0.04, { type: 'sine', f0: 950 * r, f1: 380 * r, dur: 0.35, vol: 0.05 * k }); },
  winch(S, t, k, r) { S.chop(t, { dur: 0.8, freq: 2200 * r, q: 3, vol: 0.2 * k, rate: 18 * r, depth: 1, att: 0.02 }); S.tone(t, { type: 'sawtooth', f0: 190 * r, f1: 240 * r, dur: 0.8, vol: 0.05 * k, lp: 900 }); },
  rotorWhine(S, t, k, r) { S.tone(t, { type: 'sine', f0: 1800 * r, dur: 0.8, vol: 0.03 * k, att: 0.1 }); S.tone(t, { type: 'sine', f0: 1811 * r, dur: 0.8, vol: 0.03 * k, att: 0.1 }); S.chop(t, { dur: 0.8, freq: 1900 * r, q: 6, vol: 0.03 * k, rate: 30, att: 0.1 }); },
};

function makeBuffers(ac) {
  const len = Math.floor(ac.sampleRate * 2);
  const white = ac.createBuffer(1, len, ac.sampleRate), w = white.getChannelData(0);
  const brown = ac.createBuffer(1, len, ac.sampleRate), b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
  }
  return { white, brown };
}

export function install(ctx) {
  const warned = new Set();
  const muted = ctx.params.get('mute') === '1';
  const vols = { master: ctx.settings.get('volMaster') ?? 0.8, music: ctx.settings.get('volMusic') ?? 0.7, sfx: ctx.settings.get('volSfx') ?? 1 };
  let ac = null, buf = null, comp = null, duckGain = null;
  const voices = [];            // end times of scheduled voices (limit)
  const lastPlay = new Map();   // name → ac time (throttle)
  const loops = new Set();
  const right = { x: 1, y: 0, z: 0 };
  let duckUntil = 0;
  let bed = null;               // ambience bed loops

  function applyVolumes() {
    if (!api.bus) return;
    const t = ac.currentTime;
    api.bus.master.gain.setTargetAtTime(muted ? 0 : vols.master, t, 0.02);
    api.bus.music.gain.setTargetAtTime(vols.music * 0.55, t, 0.02);
    api.bus.sfx.gain.setTargetAtTime(vols.sfx, t, 0.02);
    api.bus.ambience.gain.setTargetAtTime(vols.sfx * 0.7, t, 0.02);
  }
  function build() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ac = new C();
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(ac.destination);
    const master = ac.createGain(); master.gain.value = muted ? 0 : vols.master; master.connect(comp);
    duckGain = ac.createGain(); duckGain.connect(master);
    const music = ac.createGain(), sfx = ac.createGain(), ambience = ac.createGain();
    music.connect(duckGain); ambience.connect(duckGain); sfx.connect(master);
    api.bus = { master, music, sfx, ambience };
    buf = makeBuffers(ac);
    api.noise = buf.white;
    api.context = ac;
    applyVolumes();
    for (const l of loops) l._start();
    return true;
  }

  // ---------------------------------------------------------------- loops
  function makeLoop(name, o = {}) {
    const st = { vol: o.vol ?? 0.5, rate: o.rate ?? 1, cutoff: o.cutoff ?? null };
    let nodes = null, stopped = false;
    const h = {
      set(p = {}) {
        if (p.vol != null) st.vol = Math.max(0, +p.vol || 0);
        if (p.rate != null) st.rate = Math.max(0.05, +p.rate || 1);
        if (p.cutoff != null) st.cutoff = Math.max(20, +p.cutoff || 20);
        if (nodes) nodes.apply();
      },
      stop(fade = 0.3) {
        if (stopped) return;
        stopped = true; loops.delete(h);
        if (!nodes) return;
        const t = ac.currentTime, n = nodes;
        n.out.gain.cancelScheduledValues(t); n.out.gain.setValueAtTime(n.out.gain.value, t);
        n.out.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
        for (const s of n.srcs) { try { s.stop(t + Math.max(0.01, fade) + 0.05); } catch (e) { /* already stopped */ } }
      },
      _start() {
        if (nodes || stopped || !ac) return;
        const t = ac.currentTime, out = ac.createGain(); out.gain.value = 0;
        const srcs = [];
        const noiseSrc = (which = 'white') => { const s = ac.createBufferSource(); s.buffer = buf[which]; s.loop = true; s.start(t, Math.random() * 1.5); srcs.push(s); return s; };
        const osc = (type, f) => { const o2 = ac.createOscillator(); o2.type = type; o2.frequency.value = f; o2.start(t); srcs.push(o2); return o2; };
        const filt = (type, f, q = 0.8) => { const f2 = ac.createBiquadFilter(); f2.type = type; f2.frequency.value = f; f2.Q.value = q; return f2; };
        let f = null, apply = () => {}, bus = api.bus.sfx;
        switch (name) {
          case 'boost': { const s = noiseSrc(); f = filt('bandpass', 600, 0.8); s.connect(f); f.connect(out);
            apply = () => { f.frequency.setTargetAtTime(st.cutoff ?? 400 + st.rate * 600, ac.currentTime, 0.08); out.gain.setTargetAtTime(st.vol * 0.12, ac.currentTime, 0.05); }; break; }
          case 'hover': { const s = noiseSrc(); f = filt('bandpass', 300, 1.2); s.connect(f); f.connect(out); const o2 = osc('sine', 90); const g2 = ac.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(out);
            apply = () => { f.frequency.setTargetAtTime(st.cutoff ?? 260 * st.rate, ac.currentTime, 0.08); o2.frequency.setTargetAtTime(90 * st.rate, ac.currentTime, 0.1); out.gain.setTargetAtTime(st.vol * 0.15, ac.currentTime, 0.05); }; break; }
          case 'wind': { bus = api.bus.ambience; const s = noiseSrc('brown'); f = filt('lowpass', 500, 1.5); s.connect(f); f.connect(out);
            const l = osc('sine', 0.09); const lg = ac.createGain(); lg.gain.value = 220; l.connect(lg); lg.connect(f.frequency);
            apply = () => { f.frequency.setTargetAtTime(st.cutoff ?? 380 * st.rate, ac.currentTime, 0.3); out.gain.setTargetAtTime(st.vol * 0.5, ac.currentTime, 0.3); }; break; }
          case 'rain': { bus = api.bus.ambience; const s = noiseSrc(); f = filt('highpass', 1500, 0.5); const f2 = filt('lowpass', 7000, 0.5); s.connect(f); f.connect(f2); f2.connect(out);
            apply = () => { f.frequency.setTargetAtTime(st.cutoff ?? 1500, ac.currentTime, 0.2); out.gain.setTargetAtTime(st.vol * 0.3, ac.currentTime, 0.2); }; break; }
          case 'fire': { bus = api.bus.ambience; const s = noiseSrc('brown'); f = filt('lowpass', 300, 0.7); s.connect(f); f.connect(out);
            const s2 = noiseSrc(); const bp = filt('bandpass', 1800, 1.5); const am = ac.createGain(); am.gain.value = 0;
            const l = osc('square', 7.3); const lg = ac.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
            s2.connect(bp); bp.connect(am); am.connect(out);
            apply = () => { out.gain.setTargetAtTime(st.vol * 0.4, ac.currentTime, 0.2); l.frequency.setTargetAtTime(7.3 * st.rate, ac.currentTime, 0.2); }; break; }
          case 'alarm': { const o2 = osc('square', 880); const l = osc('square', 1.6); const lg = ac.createGain(); lg.gain.value = 110; l.connect(lg); lg.connect(o2.frequency);
            f = filt('lowpass', 2400); o2.connect(f); f.connect(out);
            apply = () => { o2.frequency.setTargetAtTime(770 * st.rate, ac.currentTime, 0.05); out.gain.setTargetAtTime(st.vol * 0.05, ac.currentTime, 0.05); }; break; }
          case 'engine': { const a = osc('sawtooth', 55), b = osc('sawtooth', 110.6); f = filt('lowpass', 400, 1.2); a.connect(f); b.connect(f); f.connect(out);
            apply = () => { a.frequency.setTargetAtTime(55 * st.rate, ac.currentTime, 0.1); b.frequency.setTargetAtTime(110.6 * st.rate, ac.currentTime, 0.1);
                            f.frequency.setTargetAtTime(st.cutoff ?? 400 * st.rate, ac.currentTime, 0.1); out.gain.setTargetAtTime(st.vol * 0.12, ac.currentTime, 0.1); }; break; }
          case 'rumble': default: { bus = api.bus.ambience; const s = noiseSrc('brown'); f = filt('lowpass', 120, 0.9); s.connect(f); f.connect(out);
            apply = () => { f.frequency.setTargetAtTime(st.cutoff ?? 120 * st.rate, ac.currentTime, 0.2); out.gain.setTargetAtTime(st.vol * 0.7, ac.currentTime, 0.2); }; break; }
        }
        out.connect(bus);
        nodes = { out, srcs, apply };
        apply();
      },
    };
    loops.add(h);
    if (ac) h._start();
    return h;
  }

  // ---------------------------------------------------------------- play
  function play(name, at = null, o = {}) {
    if (!KNOWN.has(name)) { if (!warned.has(name)) { warned.add(name); console.warn('[audio] unknown SFX', name); } return; }
    if (!ac || !api.bus) return;
    o = o || {};
    const t = ac.currentTime;
    // throttle repeats of one sound (a 1200 rpm mg would otherwise stack dozens of voices)
    const last = lastPlay.get(name);
    if (last !== undefined && t - last < 0.018 && !UI.has(name)) return;
    lastPlay.set(name, t);
    while (voices.length && voices[0] < t) voices.shift();
    if (voices.length > 48 && !UI.has(name)) return;
    let k = o.vol ?? 1, pan = 0;
    if (at && at.isVector3) {
      const cam = ctx.camera.position;
      const dx = at.x - cam.x, dy = at.y - cam.y, dz = at.z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const a = clamp(1 - d / (o.range ?? 520), 0, 1);
      if (a <= 0.02) return;
      k *= a * a;
      if (d > 0.5) pan = clamp((dx * right.x + dy * right.y + dz * right.z) / d, -1, 1) * clamp(d / 12, 0, 1) * 0.85;
    }
    let dest = api.bus.sfx;
    if (pan !== 0 && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = pan; p.connect(api.bus.sfx); dest = p;
    }
    const S = makeSynth(ac, buf, dest);
    RECIPES[name](S, t + 0.005, k, o.rate ?? 1);
    // keep the end-time list sorted (insertion)
    const e = S.end;
    let i = voices.length; voices.push(e);
    while (i > 0 && voices[i - 1] > e) { voices[i] = voices[i - 1]; i--; }
    voices[i] = e;
  }

  const api = {
    ready: false,
    bus: null,
    noise: null,
    /** extra: the AudioContext (music.js schedules on it) */
    context: null,
    unlock() {
      try {
        if (!ac && !build()) return;
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        api.ready = true;
      } catch (e) { console.warn('[audio] unlock failed', e); }
    },
    setVolumes(v = {}) {
      for (const k of ['master', 'music', 'sfx']) if (v[k] != null && Number.isFinite(+v[k])) vols[k] = clamp(+v[k], 0, 1);
      applyVolumes();
    },
    play,
    loop(name, o = {}) {
      if (!LOOPS.includes(name) && !warned.has('loop:' + name)) { warned.add('loop:' + name); console.warn('[audio] unknown loop', name); }
      return makeLoop(name, o || {});
    },
    blip(voice) {
      if (!ac || !api.bus) return;
      const t = ac.currentTime;
      const base = voice?.base ?? 950, j = voice?.jitter ?? 0.25;
      const S = makeSynth(ac, buf, api.bus.sfx);
      S.tone(t, { type: voice?.wave ?? 'square', f0: base * (1 + (Math.random() - 0.5) * j), dur: 0.025, vol: 0.025, lp: 4000 });
    },
    duck(amount, seconds) {
      if (!ac || !duckGain) return;
      const t = ac.currentTime, a = clamp(+amount || 0, 0, 1), s = Math.max(0, +seconds || 0);
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setValueAtTime(duckGain.gain.value, t);
      duckGain.gain.linearRampToValueAtTime(1 - a, t + 0.08);
      duckGain.gain.setValueAtTime(1 - a, t + 0.08 + s);
      duckGain.gain.linearRampToValueAtTime(1, t + 0.5 + s);
      duckUntil = t + 0.5 + s;
    },
    update(dt) {
      const m = ctx.camera.matrixWorld.elements;
      const l = Math.hypot(m[0], m[1], m[2]) || 1;
      right.x = m[0] / l; right.y = m[1] / l; right.z = m[2] / l;
      if (!ac) return;
      // ambience bed: wind always, rain with rain; only while a level runs
      const w = ctx.weather?.current;
      const on = ctx.simRunning && !!w;
      if (on && !bed) bed = { wind: makeLoop('wind', { vol: 0 }), rain: makeLoop('rain', { vol: 0 }), wv: 0, wr: 1, rv: 0 };
      if (bed) {
        const ws = w ? Math.hypot(w.wind?.[0] || 0, w.wind?.[1] || 0) : 0;
        const storm = w?.type === 'sandstorm' ? 2 : 1;
        const wv = on ? clamp(0.06 + ws * 0.025 * storm, 0, 0.35) : 0, wr = 0.8 + Math.min(1.2, ws * 0.06);
        const rv = on && w?.type === 'rain' ? clamp(w.intensity, 0, 1) * 0.6 : 0;
        // only touch the AudioParams when the bed really changes (every set() schedules automation events)
        if (Math.abs(wv - bed.wv) > 0.002 || Math.abs(wr - bed.wr) > 0.01) { bed.wv = wv; bed.wr = wr; bed.wind.set({ vol: wv, rate: wr }); }
        if (Math.abs(rv - bed.rv) > 0.002) { bed.rv = rv; bed.rain.set({ vol: rv }); }
      }
    },
    /** extra (tests): render one SFX offline and report its level; also proves the recipe runs without throwing */
    async renderOffline(name, seconds = 2) {
      if (!KNOWN.has(name)) throw new Error('unknown SFX ' + name);
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) return { peak: -1, rms: -1 };
      const oc = new OAC(1, Math.floor(22050 * seconds), 22050);
      const b = makeBuffers(oc);
      const S = makeSynth(oc, b, oc.destination);
      RECIPES[name](S, 0.01, 1, 1);
      const out = await oc.startRendering();
      const d = out.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
      return { peak, rms: Math.sqrt(sum / d.length), end: S.end };
    },
    /** extra: live voice count (tests) */
    get voices() { return voices.length; },
  };

  ctx.events.on('settings:changed', ({ key, value }) => {
    if (key === 'volMaster') api.setVolumes({ master: value });
    else if (key === 'volMusic') api.setVolumes({ music: value });
    else if (key === 'volSfx') api.setVolumes({ sfx: value });
  });
  ctx.addSystem({ name: 'audio', phase: 'audio', when: 'always', update: (dt) => api.update(dt) });
  ctx.audio = api;
  return api;
}
