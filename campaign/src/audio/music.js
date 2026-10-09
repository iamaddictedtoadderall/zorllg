// audio/music.js (P1): the procedural music sequencer. It schedules ahead on the AudioContext clock (lookahead 0.2 s),
// plays ThemeDefs (pad / bass / pulse / drums / arp / lead layers, scales and chord progressions), fades layers in with
// combat intensity, cross-fades themes, and plays stingers. 'ambient' and 'combat' carry the prototype's pad and combat
// pulse. Nothing plays until ctx.audio is unlocked; state (theme, intensity) is tracked regardless.

/** Built-in themes. Levels register more by name (THEMES.x = def) or pass a ThemeDef to setTheme. */
export const THEMES = {
  menu: { bpm: 72, root: 55, scale: [0, 2, 3, 7, 8], progression: [0, 0, 5, 3],
          layers: { pad: { wave: 'sawtooth', vol: 0.06, cutoff: 340, octave: 1 },
                    arp: { wave: 'triangle', vol: 0.025, pattern: 'x...x...x.x.....', octave: 3, cutoff: 1800 } } },
  garage: { bpm: 84, root: 65.41, scale: [0, 2, 3, 5, 7, 10], progression: [0, 3, 4, 0],
            layers: { pad: { wave: 'triangle', vol: 0.05, cutoff: 600, octave: 1 }, pulse: { wave: 'square', vol: 0.03, pattern: 'x...x...', cutoff: 900, octave: 2 },
                      bass: { wave: 'sine', vol: 0.12, pattern: 'x.......x.....x.', octave: 0 } } },
  debrief: { bpm: 66, root: 55, scale: [0, 3, 5, 7, 10], progression: [0, 5, 3, 4],
             layers: { pad: { wave: 'sawtooth', vol: 0.05, cutoff: 420, octave: 1 }, lead: { wave: 'triangle', vol: 0.03, octave: 3 } } },
  // the prototype: a dark sawtooth pad, and the 104 bpm combat pulse that rises with combat intensity
  ambient: { bpm: 104, root: 55, scale: [0, 2, 3, 7, 8], progression: [0, 0, 5, 3],
             layers: { pad: { wave: 'sawtooth', vol: 0.06, cutoff: 340, octave: 0, drone: true },
                       drums: { kit: 'industrial', vol: 0.38, pattern: 'x.x.x.x.' } },
             intensity: { drums: [0.05, 0.9] } },
  combat: { bpm: 104, root: 55, scale: [0, 1, 3, 7, 8], progression: [0, 0, 1, 0],
            layers: { pad: { wave: 'sawtooth', vol: 0.05, cutoff: 500, octave: 0, drone: true },
                      bass: { wave: 'sawtooth', vol: 0.16, pattern: 'x.x.x.xx', cutoff: 420, octave: 0 },
                      drums: { kit: 'industrial', vol: 0.4, pattern: 'x.x.x.xx' },
                      pulse: { wave: 'square', vol: 0.03, pattern: '..x...x...x...xx', cutoff: 1200, octave: 2 } },
            intensity: { bass: [0.05, 0.6], drums: [0.3, 1], pulse: [0.6, 1] } },
};
const LAYER_OCT = { pad: 1, bass: 0, pulse: 1, arp: 3, lead: 3 };
const STINGERS = ['objective', 'checkpoint', 'discovery', 'dread', 'victory', 'death', 'boss'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function install(ctx) {
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };
  let intensity = 0, manual = null;
  let current = null;            // ThemePlayer
  const fading = [];
  let pending = null;            // { def, name, fade } while audio isn't ready
  let stingBus = null;

  const audio = () => (ctx.audio?.ready && ctx.audio.context && ctx.audio.bus ? ctx.audio : null);
  const resolveTheme = (t) => {
    if (!t) return null;
    if (typeof t === 'string') {
      const d = THEMES[t];
      if (!d) { warnOnce('theme:' + t, '[music] unknown theme', t, '(using ambient)'); return { name: 'ambient', def: THEMES.ambient }; }
      return { name: t, def: d };
    }
    if (typeof t === 'object') return { name: t.name || 'custom', def: t };
    return null;
  };

  // ---------------------------------------------------------------- note helpers
  function note(def, degree, octave, extra = 0) {
    const sc = def.scale && def.scale.length ? def.scale : [0, 2, 3, 5, 7, 8, 10];
    const n = sc.length, di = ((degree % n) + n) % n, oct = Math.floor(degree / n);
    return (def.root || 55) * Math.pow(2, octave + oct + (sc[di] + extra) / 12);
  }
  function voice(ac, dest, t, o) {
    const { type = 'sine', f = 220, dur = 0.3, vol = 0.1, att = 0.01, rel = null, cutoff = null, f1 = null, q = 0.8 } = o;
    if (vol < 1e-4) return;
    const osc = ac.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.003, att));
    if (rel != null) { g.gain.setValueAtTime(vol, t + Math.max(att, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (cutoff) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q; g.connect(fl); out = fl; }
    osc.connect(g); out.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noiseHit(ac, dest, t, o) {
    const nb = ctx.audio.noise; if (!nb) return;
    const { dur = 0.05, freq = 7500, type = 'highpass', vol = 0.06, q = 0.8 } = o;
    const s = ac.createBufferSource(); s.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vol), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- one playing theme
  class ThemePlayer {
    constructor(name, def, fade) {
      const A = audio(), ac = A.context;
      this.name = name; this.def = def; this.ac = ac;
      this.out = ac.createGain(); this.out.gain.value = 0.0001;
      this.out.connect(A.bus.music);
      this.out.gain.setValueAtTime(0.0001, ac.currentTime);
      this.out.gain.exponentialRampToValueAtTime(1, ac.currentTime + Math.max(0.05, fade));
      this.bar = 4 * 60 / Math.max(20, def.bpm || 90);
      this.t0 = ac.currentTime + 0.08;
      this.layers = {};
      this.rng = mulberry32((def.bpm | 0) * 131 + Math.round((def.root || 55) * 10));
      for (const [k, L] of Object.entries(def.layers || {})) {
        if (!L) continue;
        const g = ac.createGain(); g.gain.value = 0; g.connect(this.out);
        const pat = L.pattern || (k === 'drums' ? 'x.x.x.x.' : k === 'pad' ? 'x' : k === 'lead' ? '' : 'x.x.x.x.');
        this.layers[k] = { L, g, next: this.t0, step: 0, pat, lvl: 0 };
      }
      this.stopAt = Infinity;
      this.padNodes = [];
    }
    layerLevel(k, I) {
      const map = this.def.intensity || {};
      const r = map[k];
      if (!r) return 1;
      return smooth(r[0], Math.max(r[0] + 1e-3, r[1]), I);
    }
    chordDegree(barIndex) {
      const p = this.def.progression && this.def.progression.length ? this.def.progression : [0];
      return p[((barIndex % p.length) + p.length) % p.length] | 0;
    }
    schedule(until, I) {
      const ac = this.ac;
      for (const [k, s] of Object.entries(this.layers)) {
        const target = s.L.vol * this.layerLevel(k, I);
        s.g.gain.setTargetAtTime(Math.max(0, target), ac.currentTime, 0.4);
        const L = s.L, oct = L.octave ?? LAYER_OCT[k] ?? 1;
        if (k === 'pad') {
          // one chord per bar, long attack and an overlapping release
          while (s.next < until) {
            const bi = Math.round((s.next - this.t0) / this.bar);
            const deg = this.chordDegree(bi);
            const dur = this.bar * 1.25;
            const tones = L.drone ? [[0, 0], [0, 0.12], [4, -0.07], [7, 0.05]] : [[deg, 0], [deg + 2, 0.08], [deg + 4, -0.06], [deg + 7, 0]];
            for (const [d, det] of tones) {
              const f = L.drone ? (this.def.root || 55) * Math.pow(2, oct + (d === 0 ? 0 : d === 4 ? 7 / 12 : 1)) : note(this.def, d, oct);
              voice(ac, s.g, s.next, { type: L.wave || 'sawtooth', f, dur, vol: L.drone ? 1 : 0.8, att: this.bar * 0.35, rel: this.bar * 0.4,
                                       cutoff: L.cutoff ?? 600, detune: det * 100, q: 1.6 });
            }
            s.next += this.bar;
          }
          continue;
        }
        const n = Math.max(1, s.pat.length || 8), stepDur = this.bar / n;
        while (s.next < until) {
          const bi = Math.floor((s.next - this.t0 + 1e-4) / this.bar), si = s.step % n;
          const ch = s.pat[si] || '.';
          const hit = ch === 'x' || ch === 'X';
          const deg = this.chordDegree(bi);
          const t = s.next;
          if (k === 'drums') this.drum(s, t, si, hit, ch === 'X', I, stepDur);
          else if (k === 'lead') {
            if (si % 2 === 0 && this.rng() < 0.55) {
              const d = deg + [0, 2, 4, 7, 4, 2, 5, 9][Math.floor(this.rng() * 8)];
              voice(ac, s.g, t, { type: L.wave || 'triangle', f: note(this.def, d, oct), dur: stepDur * (this.rng() < 0.3 ? 4 : 2), vol: 0.5, att: 0.03, cutoff: L.cutoff ?? 2600 });
            }
          } else if (hit) {
            if (k === 'bass') voice(ac, s.g, t, { type: L.wave || 'sine', f: note(this.def, deg, oct), dur: stepDur * 0.9, vol: 0.9, att: 0.006, cutoff: L.cutoff ?? 700, q: 2 });
            else if (k === 'pulse') voice(ac, s.g, t, { type: L.wave || 'square', f: note(this.def, deg + [0, 2, 4][s.step % 3], oct), dur: stepDur * 0.6, vol: 0.6, att: 0.004, cutoff: L.cutoff ?? 1200 });
            else if (k === 'arp') voice(ac, s.g, t, { type: L.wave || 'triangle', f: note(this.def, deg + [0, 2, 4, 7, 9, 7, 4, 2][s.step % 8], oct), dur: stepDur * 1.6, vol: 0.6, att: 0.004, cutoff: L.cutoff ?? 3000 });
          }
          s.next += stepDur; s.step++;
        }
      }
    }
    drum(s, t, si, hit, accent, I, stepDur) {
      const ac = this.ac, kit = s.L.kit || 'industrial', g = s.g;
      if (kit === 'industrial') {
        // the prototype's pulse: kick on hits, a tight hat between, and a sawtooth stab at full intensity
        if (hit) voice(ac, g, t, { type: 'sine', f: 110, f1: 38, dur: 0.22, vol: accent ? 1.2 : 1 });
        else noiseHit(ac, g, t, { dur: 0.05, freq: 7500, vol: 0.16 });
        if (I > 0.9 && si % 4 === 3) voice(ac, g, t, { type: 'sawtooth', f: (this.def.root || 55), dur: 0.18, vol: 0.32 * (I - 0.8) * 5, cutoff: 900 });
        if (si % 8 === 4 && hit) noiseHit(ac, g, t, { dur: 0.12, freq: 1800, type: 'bandpass', vol: 0.25, q: 2 });
      } else if (kit === 'tribal') {
        if (hit) voice(ac, g, t, { type: 'sine', f: si % 2 ? 150 : 105, f1: si % 2 ? 80 : 52, dur: 0.28, vol: accent ? 1.1 : 0.9 });
        if (si % 2 === 1) noiseHit(ac, g, t, { dur: 0.04, freq: 5200, type: 'bandpass', vol: 0.12, q: 1.5 });
      } else {   // sparse
        if (hit && si % 4 === 0) voice(ac, g, t, { type: 'sine', f: 90, f1: 42, dur: 0.3, vol: 0.7 });
        else if (hit) noiseHit(ac, g, t, { dur: 0.03, freq: 2400, type: 'bandpass', vol: 0.15, q: 4 });
      }
    }
    fadeOut(sec) {
      const t = this.ac.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, sec));
      this.stopAt = t + Math.max(0.05, sec) + this.bar * 1.3;
    }
    dispose() { try { this.out.disconnect(); } catch (e) { /* ignore */ } }
  }

  function startPending() {
    if (!pending || !audio()) return;
    const { name, def, fade } = pending;
    pending = null;
    if (current) { current.fadeOut(fade); fading.push(current); }
    current = new ThemePlayer(name, def, fade);
  }

  // ---------------------------------------------------------------- stingers (on their own gain, over the theme)
  function stinger(name) {
    if (!STINGERS.includes(name)) { warnOnce('st:' + name, '[music] unknown stinger', name); return; }
    api.lastStinger = name;
    const A = audio(); if (!A) return;
    const ac = A.context;
    if (!stingBus) { stingBus = ac.createGain(); stingBus.gain.value = 1; stingBus.connect(A.bus.music); }
    const t = ac.currentTime + 0.02, root = current?.def.root || 55, d = stingBus;
    const tri = (f, tt, dur, v, type = 'triangle', cut = 3000) => voice(ac, d, tt, { type, f, dur, vol: v, att: 0.01, cutoff: cut });
    switch (name) {
      case 'objective': [523.25, 659.25, 783.99].forEach((f, i) => tri(f, t + i * 0.11, 0.6, 0.1)); break;
      case 'checkpoint': [659.25, 987.77].forEach((f, i) => tri(f, t + i * 0.16, 0.9, 0.09, 'sine')); break;
      case 'discovery':
        [0, 4, 7, 11, 14, 19].forEach((s2, i) => tri(440 * Math.pow(2, s2 / 12), t + i * 0.09, 1.6, 0.07, 'sine'));
        voice(ac, d, t, { type: 'sawtooth', f: 220, dur: 2.6, vol: 0.05, att: 0.6, rel: 1.2, cutoff: 900 });
        break;
      case 'dread':
        for (const s2 of [0, 1, 3]) voice(ac, d, t, { type: 'sawtooth', f: root * Math.pow(2, s2 / 12), dur: 3.2, vol: 0.12, att: 1.2, rel: 1.4, cutoff: 380, q: 3 });
        voice(ac, d, t + 1.4, { type: 'sine', f: 41, f1: 30, dur: 1.6, vol: 0.4, att: 0.02 });
        break;
      case 'victory':
        for (const f of [220, 277.18, 329.63, 440]) voice(ac, d, t, { type: 'sawtooth', f, dur: 3.2, vol: 0.07, att: 0.25, rel: 1.6, cutoff: 1600, detune: (Math.random() - 0.5) * 12 });
        tri(880, t + 0.3, 1.8, 0.05, 'sine');
        break;
      case 'death':
        [440, 349.23, 293.66, 220].forEach((f, i) => tri(f, t + i * 0.45, 1.4, 0.08, 'triangle', 1400));
        voice(ac, d, t, { type: 'sawtooth', f: 55, dur: 3.4, vol: 0.08, att: 0.5, rel: 1.6, cutoff: 260 });
        break;
      case 'boss':
        for (const k of [0, 0.42]) {
          for (const f of [root * 2, root * 2 * 1.189, root * 3]) voice(ac, d, t + k, { type: 'sawtooth', f, dur: 0.5, vol: 0.1, att: 0.01, cutoff: 1400, q: 2 });
          voice(ac, d, t + k, { type: 'sine', f: 90, f1: 34, dur: 0.6, vol: 0.5 });
        }
        break;
    }
  }

  const api = {
    /** extra: the current theme name, the smoothed intensity, the last stinger (tests, HUD) */
    theme: null, intensity: 0, lastStinger: null,
    setTheme(t, fadeSeconds = 2) {
      const r = resolveTheme(t);
      if (!r) { warnOnce('theme:null', '[music] setTheme needs a name or a ThemeDef'); return; }
      if (current && current.def === r.def && !pending) { api.theme = r.name; return; }
      api.theme = r.name;
      pending = { name: r.name, def: r.def, fade: Math.max(0.05, +fadeSeconds || 0.05) };
      startPending();
    },
    setIntensity(x) { manual = x == null ? null : clamp(+x || 0, 0, 1); },
    stinger,
    stop(fadeSeconds = 2) {
      pending = null; api.theme = null;
      if (current) { current.fadeOut(Math.max(0.05, +fadeSeconds || 0.05)); fading.push(current); current = null; }
    },
    update(dt) {
      const target = manual != null ? manual : clamp(+(ctx.enemies?.combatIntensity?.() ?? 0) || 0, 0, 1);
      intensity += (target - intensity) * (1 - Math.exp(-0.6 * dt));
      api.intensity = intensity;
      if (pending) startPending();
      const A = audio();
      if (!A) return;
      const now = A.context.currentTime, until = now + 0.2;
      if (current) current.schedule(until, intensity);
      for (let i = fading.length - 1; i >= 0; i--) {
        const p = fading[i];
        if (now > p.stopAt) { p.dispose(); fading.splice(i, 1); }
        else p.schedule(Math.min(until, p.stopAt - p.bar), intensity);
      }
    },
  };
  ctx.addSystem({ name: 'music', phase: 'audio', when: 'always', update: (dt) => api.update(dt) });
  ctx.music = api;
  return api;
}
