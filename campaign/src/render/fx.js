// render/fx.js (P1) — P0 STUB: no-op effect recipes; explosion() shakes the camera and emits 'fx:explosion'.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

function handle(pos) {
  return { pos: pos ? pos.clone() : new THREE.Vector3(), alive: true, set() { /* stub */ }, stop() { this.alive = false; } };
}

export function install(ctx) {
  const emitters = [];
  const api = {
    sparks(pos, n = 10, color = [1, 0.7, 0.3], speed = 25) { /* stub */ },
    dust(pos, n = 12, spread = 6, color) { /* stub */ },
    explosion(pos, scale = 1, o = {}) {
      if (o.shake !== false) {
        const d = pos.distanceTo(ctx.camera.position);
        ctx.cameraRig?.addShake?.(clamp(scale * 2.2 - d / 60, 0, 2.2));
      }
      ctx.events.emit('fx:explosion', { pos: pos.clone(), scale });
    },
    muzzle(pos, dir, kind) { /* stub */ },
    impact(pos, normal, kind, surface) { /* stub */ },
    missileTrail(pos, vel) { /* stub */ },
    boost(pos, dir, color) { /* stub */ },
    landing(pos, scale = 1) { /* stub */ },
    shockwave(pos, radius, color, duration = 0.5) { /* stub */ },
    beam(from, to, color, width = 0.6, duration = 0.15) { /* stub */ },
    emitter(kind, pos, o = {}) { const h = handle(pos); emitters.push(h); return h; },
    ambient(def) { const h = handle(null); emitters.push(h); return h; },
    clearEmitters() { for (const h of emitters) h.stop(); emitters.length = 0; },
    update(dt) { /* stub */ },
  };
  ctx.addSystem({ name: 'fx', phase: 'fx', when: 'sim', update: (dt) => api.update(dt) });
  ctx.fx = api;
  return api;
}
