// mission/cinematics.js (P5) — P0 STUB: play/flyby/barrage resolve immediately (play still emits cinematic:start/end).

export function install(ctx) {
  const api = {
    active: false,
    play(shot) {
      const name = typeof shot === 'string' ? shot : (shot?.name || 'inline');
      ctx.events.emit('cinematic:start', { name });
      ctx.events.emit('cinematic:end', { name });
      return Promise.resolve();
    },
    skip() { /* stub */ },
    flyby(def) { return { stop() { /* stub */ }, done: Promise.resolve() }; },
    barrage(def) { return Promise.resolve(); },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'cinematics', phase: 'mission', when: 'sim', order: 10, update: (dt) => api.update(dt) });
  ctx.cinematics = api;
  return api;
}
