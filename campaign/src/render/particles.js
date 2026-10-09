// render/particles.js (P1) — P0 STUB: the full surface as no-ops.

export class ParticleSystem {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.max = o.max || 1000;
    this.blending = o.blending === 'alpha' ? 'alpha' : 'additive';
    this.points = null;   // P1: the THREE.Points object
  }
  /** Same argument order as the prototype's Particles.spawn, plus `sprite`. */
  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha = 1, drag = 0, gravity = 0, sprite = 0) { /* stub */ }
  update(dt) { /* stub */ }
  clear() { /* stub */ }
  get alive() { return 0; }
}

export function install(ctx) {
  const api = {
    add: new ParticleSystem(ctx, { max: ctx.tier.particlesAdd, blending: 'additive' }),
    smoke: new ParticleSystem(ctx, { max: ctx.tier.particlesAlpha, blending: 'alpha' }),
    lights: { flash(pos, color, intensity, distance, duration) { /* stub */ }, count: 0 },
    debris: { spawn(pos, n, scale = 1, material, velScale = 1) { /* stub */ }, clear() { /* stub */ } },
    decals: { spawn(pos, normal, size, kind) { /* stub */ }, clear() { /* stub */ } },
    clear() { api.add.clear(); api.smoke.clear(); api.debris.clear(); api.decals.clear(); },
    update(dt) { api.add.update(dt); api.smoke.update(dt); },
  };
  ctx.addSystem({ name: 'particles', phase: 'fx', when: 'sim', update: (dt) => api.update(dt) });
  ctx.particles = api;
  return api;
}
