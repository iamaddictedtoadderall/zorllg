// combat/projectiles.js (P4) — P0 STUB: fire() moves projectiles in straight lines until `life` runs out. No hits,
// no rendering.
import * as THREE from 'three';

export function install(ctx) {
  const list = [];
  const api = {
    fire(spec) {
      const p = { life: 3, gravity: 0, ...spec, pos: spec.pos.clone(), vel: spec.vel.clone(), alive: true, age: 0 };
      list.push(p);
      return p;
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.gravity) p.vel.y -= p.gravity * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.age >= p.life) { p.alive = false; list.splice(i, 1); }
      }
    },
    incoming(target, range = 220) { return false; },
    forEach(cb) { for (const p of list) cb(p); },
    clear() { for (const p of list) p.alive = false; list.length = 0; },
    get count() { return list.length; },
  };
  ctx.addSystem({ name: 'projectiles', phase: 'physics', when: 'sim', update: (dt) => api.update(dt) });
  ctx.projectiles = api;
  return api;
}
