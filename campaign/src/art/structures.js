// art/structures.js (P3) — P0 STUB: the structure registry. Every Appendix C.3 type maps to a generic box with a box
// collider; setState/destroy toggle `state` (and colliders); meshes are realised lazily near the focus (≤ 1 per frame).
// Also registers the Appendix C.2 man-made props with box stand-ins.
import * as THREE from 'three';
import * as KIT from './kit.js';
import { registerProp } from '../world/scatter.js';
import { mulberry32, hashString } from '../core/util.js';

// type → default params, states, generic dims [w (local X), d (local Z), h], options
const CATALOG = {
  bunker: { params: { w: 24, d: 16, h: 8 }, states: ['intact', 'destroyed'], dims: p => [p.w, p.d, p.h], mat: 'concreteDark',
            anchors: p => ({ door: [0, 0, p.d / 2 + 1], roof: [0, p.h, 0] }) },
  watchtower: { params: { h: 24 }, states: ['intact', 'destroyed'], dims: p => [6, 6, p.h], mat: 'steel', anchors: p => ({ top: [0, p.h, 0] }) },
  wall: { params: { length: 40, h: 10, thickness: 3, damaged: 0 }, states: ['intact', 'destroyed'], dims: p => [p.length, p.thickness, p.h], mat: 'concrete' },
  gate: { params: { width: 30, h: 16 }, states: ['closed', 'open', 'destroyed'], dims: p => [p.width, 4, p.h], mat: 'steel', door: true,
          anchors: p => ({ door: [0, 0, 0] }) },
  bridge: { params: { length: 120, h: 20, width: 24 }, states: ['intact', 'destroyed'], dims: p => [p.width, p.length, 3], deck: true,
            flatten: false, mat: 'concrete' },
  relay_pylon: { params: { h: 44 }, states: ['intact', 'destroyed'], dims: p => [8, 8, p.h], mat: 'steel',
                 hit: p => ({ center: [0, p.h / 2, 0], r: 6 }), anchors: p => ({ top: [0, p.h, 0] }) },
  comm_array: { params: { dishes: 3 }, states: ['intact', 'destroyed'], dims: () => [20, 20, 12], mat: 'steel' },
  tank_farm: { params: { tanks: 4 }, states: ['intact', 'destroyed'], dims: () => [40, 40, 12], mat: 'rust' },
  refinery: { params: { size: 60 }, states: ['intact', 'burning', 'destroyed'], dims: p => [p.size, p.size, 30], mat: 'rust' },
  hangar: { params: { w: 60, d: 40, h: 22 }, states: ['closed', 'open'], dims: p => [p.w, p.d, p.h], mat: 'steelDark' },
  landing_pad: { params: { r: 30 }, states: ['idle', 'lit'], dims: p => [p.r * 2, p.r * 2, 1], mat: 'concrete' },
  container_stack: { params: { n: 3, layers: 2 }, states: [], dims: p => [12, 5 * p.n, 6 * p.layers], mat: 'rust' },
  barricade: { params: { length: 20 }, states: ['intact', 'destroyed'], dims: p => [p.length, 2, 3], mat: 'concrete' },
  outpost: { params: { size: 80 }, states: [], dims: () => [20, 14, 8], foot: p => [p.size, p.size], mat: 'concreteDark' },
  ruin_block: { params: { w: 30, d: 30, h: 40, decay: 0.5 }, states: [], dims: p => [p.w, p.d, p.h], mat: 'concrete' },
  monolith: { params: { w: 8, h: 30 }, states: [], dims: p => [p.w, 4, p.h], mat: 'concreteDark' },
  pipeline: { params: { length: 200, h: 6 }, states: ['intact', 'burst'], dims: p => [p.length, 4, p.h], mat: 'rust' },
  crashed_ship: { params: { length: 300 }, states: [], dims: p => [p.length * 0.2, p.length, 40], flatten: false, mat: 'steelDark' },
  megastructure_leg: { params: { h: 600 }, states: [], dims: p => [60, 60, p.h], flatten: false, mat: 'concreteDark' },
  mech_wreck: { params: { design: 'vanguard' }, states: [], dims: () => [10, 10, 5], mat: 'debris' },
  vehicle_wreck: { params: { kind: 'tank' }, states: [], dims: () => [5, 8, 4], mat: 'debris' },
  salvage_cache: { params: {}, states: ['sealed', 'opened'], dims: () => [3, 3, 2], mat: 'stripe' },
  checkpoint_beacon: { params: {}, states: ['idle', 'active'], dims: () => [2, 2, 8], mat: 'steel' },
};
export const STRUCTURE_TYPES = Object.keys(CATALOG);

const MANMADE_PROPS = {
  container: [12, 6, 5], barrel_cluster: [3, 2, 3], barricade_small: [6, 2, 1.5], tank_trap: [3, 2, 3], girder: [10, 1, 1],
  concrete_chunk: [3, 2, 3], pipe_piece: [8, 1.5, 1.5], wreck_debris: [4, 1.5, 4], cable_spool: [2.5, 2.5, 1.5],
  sign_post: [0.4, 4, 0.4], sandbags: [5, 1.2, 1.5],
};

function genericDef(type) {
  const c = CATALOG[type];
  const P = (params) => ({ ...c.params, ...(params || {}) });
  return {
    defaults: c.params,
    stateList: c.states.length ? c.states : ['intact'],
    footprint(params) {
      const p = P(params);
      const [w, d] = c.foot ? c.foot(p) : c.dims(p);
      const pad = Math.min(40, Math.max(8, Math.max(w, d) * 0.3));
      if (c.circle) return { shape: 'circle', r: w / 2, flatten: c.flatten !== false, pad, exclude: 4, h: 'auto' };
      return { shape: 'rect', w, d, flatten: c.flatten !== false, pad, exclude: 4, h: 'auto' };
    },
    colliders(params) {
      const p = P(params);
      const [w, d, h] = c.dims(p);
      if (c.circle) return [{ type: 'circle', x: 0, z: 0, r: w / 2, top: h }];
      if (c.deck) return [{ type: 'box', minx: -w / 2, maxx: w / 2, minz: -d / 2, maxz: d / 2, top: p.h, bottom: p.h - h }];
      return [{ type: 'box', minx: -w / 2, maxx: w / 2, minz: -d / 2, maxz: d / 2, top: h, tag: c.door ? 'door' : undefined }];
    },
    anchors(params) { return c.anchors ? c.anchors(P(params)) : {}; },
    build(ctx, params, rng, kit) {
      const p = P(params);
      const [w, d, h] = c.dims(p);
      const mat = ctx.materials?.get ? ctx.materials.get(c.mat || 'concrete') : new THREE.MeshStandardMaterial({ color: 0x777777 });
      const root = new THREE.Group();
      const geo = c.circle ? kit.cylinder(w / 2, w / 2, h, 24) : kit.bevelBox(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = c.deck ? p.h - h / 2 : h / 2;
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      return { root };
    },
    hit(params) { const p = P(params); if (c.hit) return c.hit(p); const [w, d, h] = c.dims(p); return { center: [0, h / 2, 0], r: Math.max(w, d, h) * 0.5 }; },
  };
}

const _v = new THREE.Vector3();

export function install(ctx) {
  const defs = new Map();
  for (const t of STRUCTURE_TYPES) defs.set(t, genericDef(t));
  const insts = new Map();
  let autoId = 0;

  for (const [name, [w, h, d]] of Object.entries(MANMADE_PROPS)) {
    registerProp(name, (c) => ({
      geometry: KIT.bevelBox(w, h, d), material: c.materials?.get ? c.materials.get('steel') : new THREE.MeshStandardMaterial(),
      castShadow: true, receiveShadow: true, radius: Math.max(w, d) / 2, height: h, collider: 'circle', maxInstances: 512,
    }));
  }

  const realiseDist = () => ctx.tier.viewDistance + 200;

  function toWorld(inst, lx, ly, lz, out) {
    const c = Math.cos(inst.yaw), s = Math.sin(inst.yaw);
    return out.set(inst.pos.x + lx * c + lz * s, inst.pos.y + ly, inst.pos.z - lx * s + lz * c);
  }
  function addCollider(inst, cd) {
    const col = ctx.collision;
    if (!col) return null;
    const top = inst.pos.y + cd.top, bottom = cd.bottom !== undefined ? inst.pos.y + cd.bottom : undefined;
    const o = { surface: cd.surface || 'concrete', owner: inst, tag: cd.tag, enabled: cd.enabled };
    if (cd.type === 'circle') { toWorld(inst, cd.x || 0, 0, cd.z || 0, _v); return col.circle(_v.x, _v.z, cd.r, top, bottom, o); }
    if (cd.type === 'obox') { toWorld(inst, cd.x || 0, 0, cd.z || 0, _v); return col.obox(_v.x, _v.z, cd.hw * 2, cd.hd * 2, inst.yaw + (cd.yaw || 0), top, bottom, o); }
    const cx = (cd.minx + cd.maxx) / 2, cz = (cd.minz + cd.maxz) / 2, w = cd.maxx - cd.minx, d = cd.maxz - cd.minz;
    toWorld(inst, cx, 0, cz, _v);
    const quarter = Math.abs(Math.sin(inst.yaw * 2)) < 1e-6;
    if (quarter) {
      const swap = Math.abs(Math.sin(inst.yaw)) > 0.5;
      return col.box(_v.x, _v.z, swap ? d : w, swap ? w : d, top, bottom, o);
    }
    return col.obox(_v.x, _v.z, w, d, inst.yaw, top, bottom, o);
  }

  function applyState(inst, instant) {
    const def = defs.get(inst.type);
    const st = inst.state;
    for (const c of inst.colliders) {
      if (c.tag === 'rubble') c.enabled = st === 'destroyed';
      else if (c.tag === 'door') c.enabled = st !== 'open' && st !== 'destroyed';
      else c.enabled = st !== 'destroyed';
    }
    if (st === 'destroyed' && !inst.colliders.some(c => c.tag === 'rubble')) {
      const fp = def.footprint(inst.params);
      const w = fp.shape === 'circle' ? fp.r * 2 : fp.w, d = fp.shape === 'circle' ? fp.r * 2 : fp.d;
      const r = addCollider(inst, { type: 'box', minx: -w / 2, maxx: w / 2, minz: -d / 2, maxz: d / 2, top: 2.5, tag: 'rubble' });
      if (r) inst.colliders.push(r);
    }
    if (inst.root) {
      inst.root.scale.y = st === 'destroyed' ? 0.25 : 1;
      inst.root.updateMatrix();
    }
    def.states?.[st]?.(inst, instant);
  }

  function realise(inst) {
    if (inst.root) return;
    const def = defs.get(inst.type);
    const rng = mulberry32(hashString(inst.id));
    const built = def.build(ctx, inst.params, rng, KIT);
    const root = built.root;
    root.name = 'structure:' + inst.id;
    root.position.copy(inst.pos); root.rotation.y = inst.yaw;
    root.userData.structure = inst.id;
    root.matrixAutoUpdate = false;
    root.updateMatrix();
    root.traverse(o => { if (o !== root) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    ctx.levelRoot.add(root);
    inst.root = root;
    applyState(inst, true);
  }
  function unrealise(inst) {
    if (!inst.root) return;
    inst.root.parent?.remove(inst.root);
    inst.root = null;
  }

  const api = {
    register(type, def) {
      if (!def || typeof def.footprint !== 'function' || typeof def.colliders !== 'function' || typeof def.build !== 'function')
        throw new Error(`structures.register(${type}): needs footprint, colliders and build`);
      defs.set(type, { stateList: def.states ? Object.keys(def.states) : ['intact'], ...def });
    },
    has(type) { return defs.has(type); },
    footprint(type, params) {
      const d = defs.get(type);
      if (!d) { console.warn('[structures] unknown type', type); return { shape: 'circle', r: 5, flatten: false, pad: 10, exclude: 0, h: 'auto' }; }
      return d.footprint({ ...(d.defaults || {}), ...(params || {}) });
    },
    place(entry, pos, yaw = 0) {
      let def = defs.get(entry.type);
      if (!def) { console.error('[structures] unknown structure type', entry.type); def = defs.get('ruin_block'); }
      const id = entry.id || `${entry.type}#${++autoId}`;
      if (insts.has(id)) throw new Error(`structures.place: duplicate id "${id}"`);
      const params = { ...(def.defaults || {}), ...(entry.params || {}) };
      const inst = {
        id, type: entry.type, params, pos: pos.clone(), yaw: yaw || 0, root: null, colliders: [], anchors: {},
        state: entry.state || def.stateList?.[0] || 'intact', target: null, tag: entry.tag,
        setState(state, o = {}) {
          if (inst.state === state) return;
          inst.state = state;
          applyState(inst, !!o.instant);
          ctx.events.emit('structure:state', { id, state });
        },
        destroy(o = {}) {
          if (inst.state === 'destroyed') return;
          inst.setState('destroyed', o);
          if (!o.instant && ctx.fx?.explosion) ctx.fx.explosion(_v.copy(inst.pos).setY(inst.pos.y + 4), 1.8);
          if (inst.target?.alive && ctx.combat?.kill) ctx.combat.kill(inst.target);
        },
      };
      for (const cd of def.colliders(params)) { const c = addCollider(inst, cd); if (c) inst.colliders.push(c); }
      const an = def.anchors ? def.anchors(params) : {};
      for (const [k, [x, y, z]] of Object.entries(an)) inst.anchors[k] = toWorld(inst, x, y, z, new THREE.Vector3());
      const ds = entry.destructible;
      if (ds && ctx.combat?.register) {
        const h = def.hit ? def.hit(params) : { center: [0, 4, 0], r: 6 };
        const c = toWorld(inst, h.center[0], h.center[1], h.center[2], new THREE.Vector3());
        const tags = new Set(['structure']); if (ds.tag) tags.add(ds.tag); if (entry.tag) tags.add(entry.tag);
        const t = {
          name: ds.name || entry.type.toUpperCase(), kind: 'structure', team: ds.team || 'enemy', tags,
          alive: true, targetable: true, objective: !!ds.objective, boss: false,
          pos: c, vel: new THREE.Vector3(), ap: ds.ap, apMax: ds.ap, imp: 0, impMax: ds.impMax ?? Infinity,
          stagT: 0, stagDur: 0, lastHit: -9, invuln: false, hitR: h.r, structure: inst,
          center(out) { return out.copy(this.pos); },
          hitTest(p) { return p.distanceToSquared(this.pos) < this.hitR * this.hitR; },
          onDeath() { inst.destroy(); },
        };
        inst.target = t;
        ctx.combat.register(t);
      }
      insts.set(id, inst);
      applyState(inst, true);
      return inst;
    },
    get(id) { return insts.get(id); },
    all() { return [...insts.values()]; },
    settle(focus) {
      const f = focus || ctx.cameraRig?.focus || _v.set(0, 0, 0);
      const R = realiseDist();
      for (const inst of insts.values()) if (!inst.root && inst.pos.distanceTo(f) < R) realise(inst);
    },
    states() { const o = {}; for (const [id, i] of insts) o[id] = i.state; return o; },
    reset(states = {}) {
      for (const [id, st] of Object.entries(states)) {
        const inst = insts.get(id);
        if (!inst || inst.state === st) continue;
        inst.state = st;
        applyState(inst, true);
        if (inst.target && st !== 'destroyed' && !inst.target.alive) {
          Object.assign(inst.target, { alive: true, ap: inst.target.apMax, imp: 0 });
          ctx.combat?.register(inst.target);
        }
        ctx.events.emit('structure:state', { id, state: st });
      }
    },
    clear() {
      for (const inst of insts.values()) {
        unrealise(inst);
        if (inst.target) ctx.combat?.unregister(inst.target);
        for (const c of inst.colliders) ctx.collision?.remove(c);
      }
      insts.clear();
    },
    update(dt) {
      if (!insts.size) return;
      const f = ctx.cameraRig?.focus;
      if (!f) return;
      const R = realiseDist();
      let best = null, bd = Infinity;
      for (const inst of insts.values()) {
        const d = inst.pos.distanceTo(f);
        if (!inst.root && d < R && d < bd) { bd = d; best = inst; }
        else if (inst.root && d > R * 1.5) unrealise(inst);
      }
      if (best) realise(best);
    },
  };
  ctx.addSystem({ name: 'structures', phase: 'world', when: 'always', order: 10, update: (dt) => api.update(dt) });
  ctx.structures = api;
  return api;
}
