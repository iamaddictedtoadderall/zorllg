// world/world.js (P2) — P0 STUB: working load (route, stub heightfield, terrain mesh, structure placement), resolve,
// resolveYaw, playArea, groundHeight, raycast; settle resolves. Also creates ctx.collision.
import * as THREE from 'three';
import { Route } from './route.js';
import { Heightfield } from './heightfield.js';
import { TerrainRenderer } from './terrain.js';
import { Scatter } from './scatter.js';
import { Collision } from './collision.js';
import { yawTo, DEG, hashString } from '../core/util.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };

export function install(ctx) {
  ctx.collision = new Collision(ctx);

  const world = {
    def: null, route: null, heightfield: null, terrain: null, scatter: null,
    focus: new THREE.Vector3(),

    async load(def, o = {}) {
      if (world.def) world.unload();
      const t0 = performance.now();
      const progress = (p, label) => {
        o.onProgress?.(p, label);
        ctx.events.emit('level:loading', { levelId: def.id, progress: p, label });
      };
      world.def = def;
      progress(0.02, 'Route');
      // 1. route
      world.route = new Route(def.route.points, { halfWidth: def.route.halfWidth });
      // 2. stamps: level stamps + one flatten disc per flattening structure footprint
      const stamps = [];
      for (const st of def.terrain?.stamps || []) {
        const p = world.resolveXZ(st.at, _v);
        stamps.push({ x: p.x, z: p.z, r: st.r, falloff: st.falloff ?? 30, mode: st.mode, h: st.h, noScatter: !!st.noScatter });
      }
      const entries = [];
      for (const z of def.zones || []) for (const e of z.structures || []) entries.push(e);
      for (const e of entries) {
        const fp = ctx.structures?.footprint?.(e.type, e.params);
        if (fp?.flatten) {
          const p = world.resolveXZ(e.at, _v);
          const r = fp.shape === 'circle' ? fp.r : Math.max(fp.w, fp.d) / 2 * 1.1;
          stamps.push({ x: p.x, z: p.z, r, falloff: fp.pad ?? 20, mode: 'flatten', h: typeof fp.h === 'number' ? fp.h : undefined });
        }
      }
      // 3. heightfield
      progress(0.1, 'Terrain');
      const seed = (def.seed >>> 0) || 1;
      world.heightfield = new Heightfield(def.terrain || {}, world.route, stamps,
        { seed: seed ^ hashString('terrain'), tier: ctx.tier, sunDir: ctx.atmosphere?.sunDir || new THREE.Vector3(0, 1, 0) });
      await world.heightfield.build((p, label) => progress(0.1 + p * 0.5, label || 'Terrain'));
      ctx.collision.ground = world.heightfield;
      // 4. structures
      progress(0.62, 'Structures');
      for (const e of entries) {
        if (!ctx.structures?.place) break;
        const pos = world.resolve(e.at, new THREE.Vector3());
        ctx.structures.place(e, pos, world.resolveYaw(e.yaw, pos));
      }
      // 5. scatter
      progress(0.7, 'Scatter');
      const layers = [...(def.art?.scatter || [])];
      for (const z of def.zones || []) for (const l of z.scatter || []) layers.push({ ...l, range: l.range || z.range });
      const exclusions = stamps.filter(s => s.noScatter || s.mode === 'flatten').map(s => ({ x: s.x, z: s.z, r: s.r }));
      world.scatter = new Scatter(ctx, world.heightfield, world.route, layers, exclusions, { seed: seed ^ hashString('scatter'), tier: ctx.tier });
      await world.scatter.generate((p) => progress(0.7 + p * 0.1, 'Scatter'));
      // 6. terrain mesh + prewarm around the spawn
      progress(0.82, 'Terrain mesh');
      world.terrain = new TerrainRenderer(ctx, world.heightfield, ctx.atmosphere?.art || def.art || {});
      ctx.levelRoot.add(world.terrain.root);
      const spawnAt = o.spawnAt ?? def.checkpoints?.[0]?.at ?? [0, 0];
      const spawn = world.resolve(spawnAt, new THREE.Vector3());
      world.focus.copy(spawn);
      await world.terrain.prewarm(spawn, (p) => progress(0.82 + p * 0.12, 'Terrain mesh'));
      // 7. settle
      ctx.structures?.settle?.(spawn);
      world.scatter.update(spawn);
      progress(1, 'Ready');
      world.loadMs = performance.now() - t0;
    },
    unload() {
      world.terrain?.dispose();
      world.scatter?.dispose();
      world.heightfield?.dispose();
      ctx.structures?.clear?.();
      ctx.collision.clear();
      ctx.collision.ground = null;
      world.def = world.route = world.heightfield = world.terrain = world.scatter = null;
    },
    groundHeight(x, z) { return world.heightfield ? world.heightfield.groundHeight(x, z) : 0; },
    normalAt(x, z, out = new THREE.Vector3()) { return world.heightfield ? world.heightfield.normalAt(x, z, out) : out.set(0, 1, 0); },
    surfaceAt(x, z) {
      if (!world.heightfield) return 'ground';
      const s = world.heightfield.surfaceAt(x, z);
      return s.rock > 0.5 ? 'rock' : s.sediment > 0.5 ? 'sediment' : 'ground';
    },
    /** x/z of a Pos without needing the ground (used before the heightfield exists) */
    resolveXZ(p, out = new THREE.Vector3()) {
      if (Array.isArray(p)) return out.set(+p[0] || 0, 0, +p[1] || 0);
      if (p && typeof p === 'object') {
        if ('s' in p && world.route) return world.route.toWorld(+p.s || 0, +p.l || 0, out);
        if ('x' in p || 'z' in p) return out.set(+p.x || 0, 0, +p.z || 0);
      }
      return out.set(0, 0, 0);
    },
    /** §6.2: [x,z] | {x,z,h?} | {x,z,y} | {s,l?,h?} → Vector3 */
    resolve(p, out = new THREE.Vector3()) {
      world.resolveXZ(p, out);
      if (p && !Array.isArray(p) && typeof p === 'object' && 'y' in p && Number.isFinite(p.y) && !('s' in p)) { out.y = p.y; return out; }
      out.y = world.groundHeight(out.x, out.z) + (p && !Array.isArray(p) && Number.isFinite(p.h) ? p.h : 0);
      return out;
    },
    resolveYaw(y, at) {
      if (typeof y === 'number') return y;
      const s = world.route && at ? world.route.closest(at.x, at.z).s : 0;
      if (y === undefined || y === null || y === 'route') return world.route ? world.route.yawAt(s) : 0;
      if (y === 'reverse') return world.route ? world.route.yawAt(s) + Math.PI : Math.PI;
      if (typeof y === 'object') {
        if ('face' in y) { const f = world.resolveXZ(y.face, _d); return yawTo(f.x - (at?.x || 0), f.z - (at?.z || 0)); }
        if ('azimuth' in y) return -(+y.azimuth || 0) * DEG;
      }
      return 0;
    },
    playArea(x, z) {
      if (!world.route) return { inside: true, edge: 0, s: 0, l: 0, halfWidth: Infinity };
      const c = world.route.closest(x, z);
      const d = c.dist / Math.max(1, c.halfWidth);
      // edge 0.6 at 85 % of the half-width (warning), 1 at 100 % (hard limit); grows past 1 outside
      return { inside: d < 1, edge: Math.max(0, (d - 0.625) / 0.375), s: c.s, l: c.l, halfWidth: c.halfWidth };
    },
    raycast(origin, dir, maxDist) {
      _d.copy(origin).addScaledVector(dir, maxDist);
      const h = ctx.collision.segment(origin, _d, _hit);
      if (!h) return null;
      return { dist: h.t * maxDist, point: h.point.clone(), normal: h.normal.clone(), ground: h.ground, collider: h.collider };
    },
    async settle() {
      world.terrain?.settle();
      world.scatter?.settle();
      ctx.structures?.settle?.(ctx.cameraRig?.focus || world.focus);
    },
    stats() {
      return {
        terrain: world.terrain ? world.terrain.stats() : { nodes: 0, pending: 0, triangles: 0 },
        scatter: world.scatter ? world.scatter.stats() : { types: 0, instances: 0, visible: 0, colliders: 0 },
        colliders: ctx.collision.count,
        structures: ctx.structures?.all ? ctx.structures.all().length : 0,
      };
    },
    update(dt) {
      if (ctx.cameraRig) world.focus.copy(ctx.cameraRig.focus);
      if (!world.def) return;
      world.terrain?.update(world.focus, ctx.camera.position, ctx.tier.terrainBuildMs);
      world.scatter?.update(world.focus);
    },
  };
  ctx.events.on('tier:changed', ({ tier }) => { world.terrain?.setTier(tier); world.scatter?.setTier(tier); });
  ctx.addSystem({ name: 'world', phase: 'world', when: 'always', update: (dt) => world.update(dt) });
  ctx.world = world;
  return world;
}
