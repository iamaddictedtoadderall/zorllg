// audio/music.js (P1) — P0 STUB: silent sequencer; THEMES carries starting data for P1.
export const THEMES = {
  menu: { bpm: 72, root: 55, scale: [0, 2, 3, 7, 8], progression: [0, 0, 5, 3],
          layers: { pad: { wave: 'sawtooth', vol: 0.06, cutoff: 340, octave: 0 } } },
  garage: { bpm: 84, root: 65.41, scale: [0, 2, 3, 5, 7, 10], progression: [0, 3, 4, 0],
            layers: { pad: { wave: 'triangle', vol: 0.05, cutoff: 600 }, pulse: { wave: 'square', vol: 0.03, pattern: 'x...x...', cutoff: 900 } } },
  debrief: { bpm: 66, root: 55, scale: [0, 3, 5, 7, 10], progression: [0, 5, 3, 4],
             layers: { pad: { wave: 'sawtooth', vol: 0.05, cutoff: 420 } } },
  ambient: { bpm: 104, root: 55, scale: [0, 2, 3, 7, 8], progression: [0, 0, 5, 3],
             layers: { pad: { wave: 'sawtooth', vol: 0.06, cutoff: 340 }, drums: { kit: 'industrial', vol: 0.3, pattern: 'x.x.x..x' } },
             intensity: { drums: [0.05, 0.9] } },
  combat: { bpm: 104, root: 55, scale: [0, 1, 3, 7, 8], progression: [0, 0, 1, 0],
            layers: { pad: { wave: 'sawtooth', vol: 0.05, cutoff: 500 }, bass: { wave: 'sine', vol: 0.38, pattern: 'x.x.x.x.' },
                      drums: { kit: 'industrial', vol: 0.4, pattern: 'x.x.x.xx' } },
            intensity: { bass: [0.05, 0.6], drums: [0.3, 1] } },
};

export function install(ctx) {
  const api = {
    theme: null,
    setTheme(t, fadeSeconds = 2) { api.theme = typeof t === 'string' ? t : (t ? 'custom' : null); },
    setIntensity(x) { /* stub */ },
    stinger(name) { /* stub */ },
    stop(fadeSeconds = 2) { api.theme = null; },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'music', phase: 'audio', when: 'always', update: (dt) => api.update(dt) });
  ctx.music = api;
  return api;
}
