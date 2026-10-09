// mission/cinematics.js (P5) — P0 STUB: play/flyby/barrage resolve immediately (play still emits cinematic:start/end).
// Their promises are simDeferred() promises (core/util.js). The real shots end on sim time inside the 'cinematics'
// tick, and MUST keep settling through simDeferred() so the mission list that waits on them resumes in that tick (§1.4).
// Shots count sim time (this system is 'sim'), so they freeze while paused. A shot that uses ctx.cameraRig.blendTo,
// release or ctx.hud.fade passes { clock: 'sim' }, so those tweens freeze with it even if the shot started during
// loading (def.start runs then).
import { simResolved } from '../core/util.js';

export function install(ctx) {
  const api = {
    active: false,
    play(shot) {
      const name = typeof shot === 'string' ? shot : (shot?.name || 'inline');
      ctx.events.emit('cinematic:start', { name });
      ctx.events.emit('cinematic:end', { name });
      return simResolved();
    },
    skip() { /* stub */ },
    flyby(def) { return { stop() { /* stub */ }, done: simResolved() }; },
    barrage(def) { return simResolved(); },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'cinematics', phase: 'mission', when: 'sim', order: 10, update: (dt) => api.update(dt) });
  ctx.cinematics = api;
  return api;
}
