// audio/audio.js (P1) — P0 STUB: silent. SFX lists every name play() accepts (Appendix C.1).
export const SFX = [
  // prototype
  'rifle', 'erifle', 'plasma', 'cannon', 'turret', 'explode', 'boom', 'qb', 'blade', 'bladeHit', 'missile', 'lock',
  'blip', 'hit', 'hurt', 'alarm', 'land', 'stagger', 'repair', 'empty', 'charge', 'door', 'confirm', 'glitch',
  // new
  'mg', 'shotgun', 'mortar', 'rail', 'step', 'stepHeavy', 'servo', 'rotor', 'dropship', 'flyby', 'thunder', 'collapse',
  'metalGroan', 'klaxon', 'static', 'pickup', 'objective', 'checkpoint', 'uiMove', 'uiSelect', 'uiBack', 'interact',
  'shockwave', 'warn',
];
const KNOWN = new Set(SFX);

export function install(ctx) {
  const warned = new Set();
  const api = {
    ready: false,
    bus: null,
    noise: null,
    unlock() { /* stub: no AudioContext */ },
    setVolumes(v = {}) { /* stub */ },
    play(name, at = null, o = {}) {
      if (!KNOWN.has(name) && !warned.has(name)) { warned.add(name); console.warn('[audio] unknown SFX', name); }
    },
    loop(name, o = {}) { return { set() { /* stub */ }, stop() { /* stub */ } }; },
    blip(voice) { /* stub */ },
    duck(amount, seconds) { /* stub */ },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'audio', phase: 'audio', when: 'always', update: (dt) => api.update(dt) });
  ctx.audio = api;
  return api;
}
