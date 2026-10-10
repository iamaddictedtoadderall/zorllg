// world/world.js (P2): the level world (arch §4.2, §5.1, §6.2). install(ctx) creates ctx.world and ctx.collision.
//
// load(def) follows arch §5.1: route → stamps (level stamps plus one flatten disc per flattening structure footprint)
// → heightfield build (ctx.collision.ground = heightfield) → structures placed (colliders and targets now, meshes
// lazily) → terrain renderer → scatter (exclusions: structure footprints + exclude, noScatter stamps) → terrain prewarm
// around the spawn → settle. Progress goes to o.onProgress and 'level:loading'. Everything that affects gameplay is
// generated deterministically from def.seed with per-layer seeds (arch §5.6); streaming only decides what is drawn.
//
// The 'world' system (world phase, always) copies ctx.cameraRig.focus, streams terrain from the camera position within
// tier.terrainBuildMs and refills scatter. settle() re-selects from the current camera (free-camera screenshots move
// the camera without a tick) and builds everything pending.
import * as THREE from 'three';
import { Route } from './route.js';
import { Heightfield } from './heightfield.js';
import { TerrainRenderer } from './terrain.js';
import { Scatter } from './scatter.js';
import { Collision } from './collision.js';
import { yawTo, DEG, hashString } from '../core/util.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
const _rc = { s: 0, l: 0, dist: 0 };
// playArea() is called every frame by the player and every unit: results come from a small ring of reused objects (no
// per-frame garbage). A result stays valid for PA_RING further calls; pass `out` to keep one longer.
const PA_RING = 32, _pa = Array.from({ length: PA_RING }, () => ({ inside: true, edge: 0, s: 0, l: 0, halfWidth: 0 }));
let _paI = 0;

export function install(ctx) {
  ctx.collision = new Collision(ctx);
  let loadToken = 0;

  const world = {
    def: null, route: null, heightfield: null, terrain: null, scatter: null,
    /** extra: true once load() has finished (streaming runs only then) */
    ready: false,
    focus: new THREE.Vector3(),
    /** extra: timings of the last load (ms) and the resolved stamps */
    timings: null,
    stamps: [],

    async load(def, o = {}) {
      if (world.def) world.unload();
      const token = ++loadToken;
      const t0 = performance.now(), T = {};
      let tp = t0;
      const lap = (k) => { const n = performance.now(); T[k] = Math.round(n - tp); tp = n; };
      const progress = (p, label) => {
        o.onProgress?.(p, label);
        ctx.events.emit('level:loading', { levelId: def.id, progress: p, label });
      };
      world.def = def;
      world.ready = false;
      progress(0.01, 'Route');
      // 1. route
      world.route = new Route(def.route.points, { halfWidth: def.route.halfWidth });
      // 2. stamps
      const stamps = [];
      for (const st of def.terrain?.stamps || []) {
        const p = world.resolveXZ(st.at, _v);
        stamps.push({ x: p.x, z: p.z, r: st.r, falloff: st.falloff ?? 30, mode: st.mode, h: st.h, noScatter: !!st.noScatter });
      }
      const entries = [];
      for (const z of def.zones || []) for (const e of z.structures || []) entries.push(e);
      const footprints = new Map();
      for (const e of entries) {
        let fp = null;
        try { fp = ctx.structures?.footprint?.(e.type, e.params) ?? null; } catch (err) { console.warn('[world] footprint', e.type, err); }
        footprints.set(e, fp);
        if (fp?.flatten) {
          const p = world.resolveXZ(e.at, _v);
          const r = fp.shape === 'circle' ? fp.r : Math.max(fp.w, fp.d) / 2 * 1.1;
          stamps.push({ x: p.x, z: p.z, r, falloff: fp.pad ?? 20, mode: 'flatten', h: typeof fp.h === 'number' ? fp.h : undefined, structure: true });
        }
      }
      world.stamps = stamps;
      lap('route');
      // 3. heightfield
      progress(0.04, 'Terrain');
      const seed = (def.seed >>> 0) || 1;
      world.heightfield = new Heightfield(def.terrain || {}, world.route, stamps,
        { seed: seed ^ hashString('terrain'), tier: ctx.tier, sunDir: ctx.atmosphere?.sunDir || new THREE.Vector3(0.4, 0.6, -0.5) });
      await world.heightfield.build((p, label) => progress(0.04 + p * 0.56, label || 'Terrain'));
      if (token !== loadToken) return;
      ctx.collision.ground = world.heightfield;
      lap('heightfield');
      // 4. structures
      progress(0.6, 'Structures');
      if (ctx.structures?.place) {
        for (const e of entries) {
          const pos = world.resolve(e.at, new THREE.Vector3());
          ctx.structures.place(e, pos, world.resolveYaw(e.yaw, pos));
        }
      }
      lap('structures');
      // terrain renderer (its material and detail maps are shared with the rock props)
      world.terrain = new TerrainRenderer(ctx, world.heightfield, ctx.atmosphere?.art || def.art || {});
      ctx.levelRoot.add(world.terrain.root);
      // 5. scatter
      progress(0.64, 'Scatter');
      const layers = [...(def.art?.scatter || [])];
      for (const z of def.zones || []) for (const l of z.scatter || []) layers.push({ ...l, range: l.range || z.range });
      const exclusions = [];
      for (const e of entries) {
        const fp = footprints.get(e);
        if (!fp) continue;
        const p = world.resolveXZ(e.at, _v);
        const r = fp.shape === 'circle' ? fp.r : Math.hypot(fp.w || 0, fp.d || 0) / 2;
        exclusions.push({ x: p.x, z: p.z, r: (r || 0) + (fp.exclude ?? 0) });
      }
      for (const s of stamps) if (s.noScatter) exclusions.push({ x: s.x, z: s.z, r: s.r + (s.falloff ?? 0) * 0.5 });
      world._scatterArgs = { layers, exclusions, seed: seed ^ hashString('scatter') };
      world.scatter = new Scatter(ctx, world.heightfield, world.route, layers, exclusions, { seed: seed ^ hashString('scatter'), tier: ctx.tier });
      await world.scatter.generate((p) => progress(0.64 + p * 0.14, 'Scatter'));
      if (token !== loadToken) return;
      ctx.levelRoot.add(world.scatter.root);
      lap('scatter');
      // 6. terrain prewarm around the spawn
      progress(0.8, 'Terrain mesh');
      const spawnAt = o.spawnAt ?? def.checkpoints?.[0]?.at ?? [0, 0];
      const spawn = world.resolve(spawnAt, new THREE.Vector3());
      world.focus.copy(spawn);
      await world.terrain.prewarm(spawn, (p) => progress(0.8 + p * 0.17, 'Terrain mesh'));
      if (token !== loadToken) return;
      lap('prewarm');
      // 7. settle
      ctx.structures?.settle?.(spawn);
      world.scatter.settle(spawn);
      lap('settle');
      world.ready = true;
      world.loadMs = performance.now() - t0;
      world.timings = { ...T, total: Math.round(world.loadMs), heightfieldCached: !!world.heightfield.stats.cached };
      progress(1, 'Ready');
    },
    unload() {
      ++loadToken;
      world.terrain?.dispose();
      world.scatter?.dispose();
      world.heightfield?.dispose();
      ctx.structures?.clear?.();
      ctx.collision.clear();
      ctx.collision.ground = null;
      world.def = world.route = world.heightfield = world.terrain = world.scatter = null;
      world.stamps = [];
      world.ready = false;
    },
    groundHeight(x, z) { return world.heightfield ? world.heightfield.groundHeight(x, z) : 0; },
    normalAt(x, z, out = new THREE.Vector3()) { return world.heightfield ? world.heightfield.normalAt(x, z, out) : out.set(0, 1, 0); },
    surfaceAt(x, z) {
      if (!world.heightfield) return 'ground';
      const s = world.heightfield.surfaceAt(x, z);
      return s.rock > 0.5 ? 'rock' : s.sediment > 0.5 ? 'sediment' : 'ground';
    },
    /** extra: x/z of a Pos without needing the ground (used before the heightfield exists) */
    resolveXZ(p, out = new THREE.Vector3()) {
      if (Array.isArray(p)) return out.set(+p[0] || 0, 0, +p[1] || 0);
      if (p && typeof p === 'object') {
        if (p.isVector3) return out.set(p.x, 0, p.z);
        if ('s' in p && world.route) return world.route.toWorld(+p.s || 0, +p.l || 0, out);
        if ('x' in p || 'z' in p) return out.set(+p.x || 0, 0, +p.z || 0);
      }
      return out.set(0, 0, 0);
    },
    /** §6.2: [x,z] | {x,z,h?} | {x,z,y} | {s,l?,h?} → Vector3 */
    resolve(p, out = new THREE.Vector3()) {
      if (p && p.isVector3) return out.copy(p);
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
    playArea(x, z, out) {
      const o = out || _pa[_paI = (_paI + 1) % PA_RING];
      if (!world.route) { o.inside = true; o.edge = 0; o.s = 0; o.l = 0; o.halfWidth = Infinity; return o; }
      // exact closest point (O(1) grid): the same s and l on every tier, so triggers fire identically
      world.route.closestInto(x, z, _rc);
      const hw = world.route.halfWidthAt(_rc.s);
      const d = _rc.dist / Math.max(1, hw);
      // edge 0.6 at 85 % of the half-width (the warning), 1 at 100 % (the hard limit); it keeps growing outside
      o.inside = d < 1; o.edge = Math.max(0, (d - 0.625) / 0.375); o.s = _rc.s; o.l = _rc.l; o.halfWidth = hw;
      return o;
    },
    /** §4.2; extra optional `out` ({ point, normal } vectors reused) for per-frame callers */
    raycast(origin, dir, maxDist, out) {
      _d.copy(origin).addScaledVector(dir, maxDist);
      const h = ctx.collision.segment(origin, _d, _hit);
      if (!h) return null;
      const o = out || { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), ground: false, collider: null };
      o.dist = h.t * maxDist; o.point.copy(h.point); o.normal.copy(h.normal); o.ground = h.ground; o.collider = h.collider;
      return o;
    },
    /** the point streaming centres on: the camera rig focus (the camera itself in free fly) */
    _focusNow(out) {
      const rig = ctx.cameraRig;
      if (rig?.mode === 'free') return out.copy(ctx.camera.position);
      if (rig) return out.copy(rig.focus);
      return out.copy(world.focus);
    },
    async settle() {
      if (!world.def) { ctx.structures?.settle?.(ctx.cameraRig?.focus || world.focus); return; }
      world._focusNow(_f);
      world.focus.copy(_f);
      ctx.camera.updateMatrixWorld();
      world.terrain?.settle(ctx.camera.position);
      world.scatter?.settle(_f);
      ctx.structures?.settle?.(_f);
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
      if (ctx.cameraRig) world._focusNow(world.focus);
      if (!world.ready || !world.terrain) return;       // nothing streams while a level is loading
      world.terrain.update(world.focus, ctx.camera.position, ctx.tier.terrainBuildMs);
      world.scatter?.update(world.focus);
    },
    /** extra: rebuild the scatter for the current tier (density, ground cover); colliders follow the new set */
    async regenerateScatter() {
      if (!world.def || !world.heightfield || !world._scatterArgs) return;
      const A = world._scatterArgs, token = loadToken;
      const next = new Scatter(ctx, world.heightfield, world.route, A.layers, A.exclusions, { seed: A.seed, tier: ctx.tier });
      world.scatter?.dispose();
      world.scatter = next;
      await next.generate();
      if (token !== loadToken || world.scatter !== next) { next.dispose(); return; }
      ctx.levelRoot.add(next.root);
      next.settle(world.focus);
    },
  };
  ctx.events.on('tier:changed', ({ tier }) => {
    world.terrain?.setTier(tier);
    if (world.scatter) {
      world.scatter.setTier(tier);
      if (world.scatter.needsRegenerate) world.regenerateScatter().catch(e => ctx.recordError?.('world', e));
    }
  });
  ctx.addSystem({ name: 'world', phase: 'world', when: 'always', update: (dt) => world.update(dt) });
  ctx.world = world;
  return world;
}
