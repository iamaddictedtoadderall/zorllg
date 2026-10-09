// world/scatter.js (P2) — P0 STUB: a working global prop registry; Scatter itself places nothing.

const REGISTRY = new Map();

/** Global prop registry. P2 registers natural props, P3 registers man-made props (Appendix C.2). */
export function registerProp(name, factory) {
  if (typeof factory !== 'function') throw new Error(`registerProp(${name}): factory must be a function`);
  REGISTRY.set(name, factory);
}
export function propNames() { return [...REGISTRY.keys()]; }
/** extra: look up a factory (P2 uses it to build InstancedMeshes) */
export function propFactory(name) { return REGISTRY.get(name) || null; }

export class Scatter {
  constructor(ctx, hf, route, layers = [], exclusions = [], o = {}) {
    this.ctx = ctx; this.hf = hf; this.route = route; this.layers = layers; this.exclusions = exclusions;
    this.seed = o.seed ?? 1; this.tier = o.tier;
  }
  async generate(onProgress) { onProgress?.(1, 'Scatter'); }
  update(focus) { /* stub */ }
  settle() { /* stub */ }
  setTier(t) { this.tier = t; }
  stats() { return { types: 0, instances: 0, visible: 0, colliders: 0 }; }
  dispose() { /* stub */ }
}
