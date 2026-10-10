// art/structures.js (P3): the structure registry, the Appendix C.3 catalogue built from the kit (AD §2.14–2.15 recipes,
// Dredge style by default), man-made props (Appendix C.2), states, collapse, lazy realise, LOD and shared caches.
//
// Runtime (arch §5.7): place() creates colliders, anchors and the destructible target at once and builds no meshes.
// The 'structures' system realises the nearest unrealised instance within tier.viewDistance + 200 m (≤ 1 per frame)
// and frees roots beyond 1.5× that. A realised structure is a THREE.LOD: level 0 is the merged bevelled build (one mesh
// per material, ≤ 6 draw calls), level 1 (beyond tier.structureLodDist) a single vertex-coloured mesh, hidden past the
// view distance. Catalogue geometry is built once per `type + JSON(params)` (seeded by that key) and shared by clones.
// States live on the instance; realising applies the current state instantly. destroy() plays the generic collapse
// (sink + tilt + fx + rubble collider) unless the type overrides 'destroyed' (relay_pylon topples).
import * as THREE from 'three';
import * as KIT from './kit.js';
import { registerProp } from '../world/scatter.js';
import { mulberry32, hashString, clamp, lerp } from '../core/util.js';
import { buildMechWreck } from './mechs.js';
import { buildUnit } from './units.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TEMPLATES = new Map();       // type|params → { lod0, lod1, lamps, tris0, tris1 }
const RUBBLE = new Map();          // size key → geometry set

/** Build (or fetch) the shared template of a catalogue type for these params. */
function template(ctx, type, def, params) {
  const key = type + '|' + JSON.stringify(params);
  let tpl = TEMPLATES.get(key);
  if (tpl) return tpl;
  const rng = mulberry32(hashString(key));
  const M = matLib(ctx);
  const B = new KIT.GeoBuilder(hashString(key) & 0xffff);
  const lamps = [], dyn = [];
  const api = {
    B, M, rng, lamps, ctx, KIT,
    /** a dynamic part: its own merged meshes in a named group (doors, dishes, lids); LOD1 gets it at the default pose */
    part(name, pos = [0, 0, 0], rot = [0, 0, 0]) { const P = new KIT.GeoBuilder(dyn.length + 7); dyn.push({ name, pos, rot, P }); return P; },
    lamp(Bx, pos, dir, r, light = 'lightSodium', o = {}) { return lampAssembly(api, Bx || B, pos, dir, r, light, o); },
  };
  def.build(api, params);
  foldMaterials(ctx, B, dyn, def.maxCalls ?? 6);
  const lod0 = B.build({ name: 'lod0', castShadow: true, receiveShadow: true });
  for (const d of dyn) {
    const g = d.P.build({ name: d.name });
    g.name = d.name; g.position.set(...d.pos); g.rotation.set(...d.rot); g.userData.part = d.name;
    lod0.add(g);
    g.updateMatrix();
    for (const e of d.P.entries) if (!e.lod0 && !d.noLod1) B.entries.push({ ...e, mat: e.mat.clone().premultiply(g.matrix), lod1: true });
  }
  const lod1 = buildLod1(ctx, B, def.lod1Budget ?? 6000);
  lod0.traverse(o => { if (o.isMesh) { o.geometry.userData.shared = true; } });
  if (lod1) lod1.geometry.userData.shared = true;
  let tris0 = 0; lod0.traverse(o => { if (o.isMesh) tris0 += o.geometry.attributes.position.count / 3; });
  tpl = { key, lod0, lod1, lamps, tris0, tris1: lod1 ? lod1.geometry.attributes.position.count / 3 : 0 };
  TEMPLATES.set(key, tpl);
  return tpl;
}
/** Draw-call discipline (arch §7.5: LOD0 ≤ 6 calls, one mesh per material). When the static build plus the dynamic
 *  parts would need more meshes than `max`, the static materials with the fewest triangles are folded into one shared
 *  vertex-coloured material (their colours move into the colour attribute; roughness/metalness become the folded
 *  set's weighted mean), and two or more light materials fold into one unlit vertex-coloured lens material. The big
 *  surfaces keep their library materials (detail maps, wear); folding only ever touches the small trim. */
function isLight(m) { return !!(m.emissive && m.emissiveIntensity > 0 && m.color && m.color.r + m.color.g + m.color.b < 0.05 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0); }
function foldMaterials(ctx, B, dyn, max) {
  const tris = new Map();
  for (const e of B.entries) if (!e.lod1) tris.set(e.m, (tris.get(e.m) || 0) + e.g.attributes.position.count / 3);
  let dynCalls = 0;
  for (const d of dyn) dynCalls += new Set(d.P.entries.filter(e => !e.lod1).map(e => e.m)).size;
  const allow = Math.max(2, max - dynCalls);
  const mats = [...tris.keys()];
  if (mats.length <= allow) return;
  const lights = mats.filter(isLight), lit = mats.filter(m => !isLight(m));
  const foldLights = lights.length >= 2;
  const emCount = foldLights ? 1 : lights.length;
  const fold = new Set();
  if (lit.length + emCount > allow) {
    lit.sort((a, b) => tris.get(b) - tris.get(a));
    for (const m of lit.slice(Math.max(1, allow - emCount - 1))) fold.add(m);
  }
  let folded = null;
  if (fold.size >= 2) {
    let w = 0, r = 0, mt = 0;
    for (const m of fold) { const t = tris.get(m); w += t; r += (m.roughness ?? 0.7) * t; mt += (m.metalness ?? 0.3) * t; }
    const q = (v) => Math.round(v * 10) / 10;
    folded = foldedMaterial(ctx, q(r / w), q(mt / w));
  }
  const lensMat = foldLights ? lensMaterial(ctx) : null;
  for (const e of B.entries) {
    const m = e.m;
    if (folded && fold.has(m)) {
      const c = m.color || { r: 0.5, g: 0.5, b: 0.5 }, k = e.col || [1, 1, 1];
      e.col = [k[0] * c.r, k[1] * c.g, k[2] * c.b]; e.m = folded;
    } else if (lensMat && isLight(m)) {
      const c = m.emissive, i = m.emissiveIntensity;
      e.col = [c.r * i, c.g * i, c.b * i]; e.m = lensMat;
    }
  }
}
const FOLDED = new Map();
function foldedMaterial(ctx, roughness, metalness) {
  const key = roughness + '|' + metalness;
  let m = FOLDED.get(key);
  if (m && m.userData.foldCtx === ctx) return m;
  m = ctx?.materials?.standard ? ctx.materials.standard({ color: '#ffffff', vertexColors: true, roughness, metalness, envMapIntensity: 0.6, wear: 0.5 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness });
  m.userData.foldCtx = ctx;
  FOLDED.set(key, m);
  return m;
}
let _lens = null;
function lensMaterial(ctx) {
  if (_lens && _lens.userData.foldCtx === ctx) return _lens;
  _lens = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  _lens.name = 'lightsFolded';
  _lens.userData.foldCtx = ctx; _lens.userData.shared = true;
  ctx?.atmosphere?.patchMaterial?.(_lens);
  return _lens;
}
/** LOD1: one vertex-coloured mesh. Drops detail (lod0) entries, then the smallest pieces until the triangle budget fits. */
function buildLod1(ctx, B, budget) {
  const list = B.entries.filter(e => !e.lod0);
  if (!list.length) return null;
  const size = (e) => { const g = e.g; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius * e.mat.getMaxScaleOnAxis(); };
  const scored = list.map(e => ({ e, s: e.lod1 ? Infinity : size(e), t: e.g.attributes.position.count / 3 }));
  scored.sort((a, b) => b.s - a.s);
  const keep = [];
  let tris = 0;
  for (const it of scored) { if (tris + it.t > budget && it.s !== Infinity && keep.length) continue; keep.push(it.e); tris += it.t; }
  const L = new KIT.GeoBuilder(3);
  L.entries = keep.map(e => ({ ...e, lod0: false, lod1: false }));
  return L.buildSingle(null, { material: singleMat(ctx), castShadow: false });
}
let _single = null, _singleCtx = null;
function singleMat(ctx) {
  if (_single && _singleCtx === ctx) return _single;
  _singleCtx = ctx;
  _single = ctx?.materials?.standard ? ctx.materials.standard({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0.15, envMapIntensity: 0.4 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.15 });
  return _single;
}
/** Lamp assembly (AD §4.5): housing + recessed lens; the glow sprite is added at realise (particles.glows). */
const LIGHT_HEX = { lightSodium: '#ff9a2e', lightAmber: '#ffb36b', lightRed: '#ff2a1a', lightCyan: '#5fe3ff', lightWhite: '#fff1d6', lightGold: '#ffcc66', lightGhost: '#a8ff9e' };
function lampAssembly(api, B, pos, dir, r, light, o) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1));
  B.add(KIT.lampHousing(r), o.housing || api.M.dark, m, { lod0: o.lod0 });
  B.add(KIT.lampLens(r), api.M[light] || api.M.lightSodium, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, r * 1.24, 0)));
  if (o.glow !== false) {
    const p = new THREE.Vector3(0, r * 1.6, 0).applyMatrix4(m);
    api.lamps.push({ pos: [p.x, p.y, p.z], color: LIGHT_HEX[light] || '#ffb36b', size: o.size ?? r * 5, pulse: o.pulse || 'flicker' });
  }
}
/** Rubble pile for a footprint (w × d), shared per size. */
function rubble(ctx, w, d, h = 2.5) {
  const key = `${Math.round(w)}|${Math.round(d)}|${Math.round(h)}`;
  let r = RUBBLE.get(key);
  if (r) return r;
  const M = matLib(ctx), rng = mulberry32(hashString('rubble' + key));
  const B = new KIT.GeoBuilder(5);
  const n = clamp(Math.round(w * d / 30), 6, 40);
  for (let i = 0; i < n; i++) {
    const s = lerp(0.8, 2.4, rng()) * Math.sqrt(Math.min(w, d) / 10);
    B.add(KIT.rockGeo(1000 + Math.floor(rng() * 40), { cuts: 9, noise: 0.06, squash: 0.6 }), rng() < 0.5 ? M.concrete : M.concreteDark,
      { pos: [(rng() - 0.5) * w * 0.85, s * 0.25, (rng() - 0.5) * d * 0.85], rot: [rng() * 6, rng() * 6, rng() * 6], scale: s, tint: 0.08 });
  }
  for (let i = 0; i < n * 0.6; i++) {
    B.add(KIT.plateBox(lerp(1, 4, rng()), 0.3, lerp(0.8, 3, rng())), rng() < 0.6 ? M.concreteDark : M.ironBlack,
      { pos: [(rng() - 0.5) * w * 0.9, 0.3 + rng() * h * 0.4, (rng() - 0.5) * d * 0.9], rot: [rng() - 0.5, rng() * 6, rng() - 0.5] });
  }
  B.add(KIT.rockGeo(77, { cuts: 6, noise: 0.05, squash: 0.35, flatBottom: 0.1 }), M.concreteDark, { pos: [0, -0.2, 0], scale: [w * 0.5, h, d * 0.5] });
  const g = B.build({ name: 'rubble' });
  g.traverse(o => { if (o.isMesh) o.geometry.userData.shared = true; });
  RUBBLE.set(key, g);
  return g;
}

// ================================================================== install
export function install(ctx) {
  const defs = new Map();
  for (const t of STRUCTURE_TYPES) defs.set(t, { ...CATALOG[t], builtin: true, stateList: CATALOG[t].states?.length ? CATALOG[t].states : ['intact'] });
  const insts = new Map();
  let autoId = 0;

  // man-made props (Appendix C.2): one vertex-coloured geometry per type (one draw call per instanced type)
  for (const [name, prop] of Object.entries(PROPS)) {
    registerProp(name, (c) => {
      const geo = prop.geometry(c);
      return { geometry: geo, material: propMaterial(c), castShadow: prop.castShadow ?? true, receiveShadow: true,
               radius: prop.radius, height: prop.height, collider: prop.collider ?? 'circle', maxInstances: prop.maxInstances ?? 512 };
    });
  }

  const realiseDist = () => ctx.tier.viewDistance + 200;
  const simDt = (dt) => (ctx.simRunning ? dt * (ctx.timeScale ?? 1) : 0);

  function toWorld(inst, lx, ly, lz, out) {
    const c = Math.cos(inst.yaw), s = Math.sin(inst.yaw);
    return out.set(inst.pos.x + lx * c + lz * s, inst.pos.y + ly, inst.pos.z - lx * s + lz * c);
  }
  function addCollider(inst, cd) {
    const col = ctx.collision;
    if (!col) return null;
    const top = inst.pos.y + cd.top, bottom = cd.bottom !== undefined ? inst.pos.y + cd.bottom : undefined;
    const o = { surface: cd.surface || 'concrete', owner: inst, tag: cd.tag, enabled: cd.enabled };
    let c;
    if (cd.type === 'circle') { toWorld(inst, cd.x || 0, 0, cd.z || 0, _v); c = col.circle(_v.x, _v.z, cd.r, top, bottom, o); }
    else if (cd.type === 'obox') { toWorld(inst, cd.x || 0, 0, cd.z || 0, _v); c = col.obox(_v.x, _v.z, cd.hw * 2, cd.hd * 2, inst.yaw + (cd.yaw || 0), top, bottom, o); }
    else {
      const cx = (cd.minx + cd.maxx) / 2, cz = (cd.minz + cd.maxz) / 2, w = cd.maxx - cd.minx, d = cd.maxz - cd.minz;
      toWorld(inst, cx, 0, cz, _v);
      const quarter = Math.abs(Math.sin(inst.yaw * 2)) < 1e-6;
      if (quarter) { const swap = Math.abs(Math.sin(inst.yaw)) > 0.5; c = col.box(_v.x, _v.z, swap ? d : w, swap ? w : d, top, bottom, o); }
      else c = col.obox(_v.x, _v.z, w, d, inst.yaw, top, bottom, o);
    }
    if (c && cd.tag) c.tag = cd.tag;
    return c;
  }
  function footprintWD(def, params) {
    const fp = def.footprint(params);
    return fp.shape === 'circle' ? [fp.r * 2, fp.r * 2] : [fp.w, fp.d];
  }
  function ensureRubbleCollider(inst) {
    if (inst.colliders.some(c => c.tag === 'rubble')) return;
    const def = defs.get(inst.type);
    const rc = def.rubbleColliders ? def.rubbleColliders(inst.params, inst) : null;
    const list = rc || (() => { const [w, d] = footprintWD(def, inst.params); return [{ type: 'box', minx: -w / 2 * 0.9, maxx: w / 2 * 0.9, minz: -d / 2 * 0.9, maxz: d / 2 * 0.9, top: 2.5, tag: 'rubble' }]; })();
    for (const cd of list) { const r = addCollider(inst, { ...cd, tag: 'rubble' }); if (r) inst.colliders.push(r); }
  }
  /** colliders and visuals for the current state */
  function applyState(inst, instant) {
    const def = defs.get(inst.type);
    const st = inst.state;
    if (st === 'destroyed') ensureRubbleCollider(inst);
    for (const c of inst.colliders) {
      if (c.tag === 'rubble') c.enabled = st === 'destroyed';
      else if (c.tag === 'door') c.enabled = st !== 'open' && st !== 'destroyed';
      else if (c.tag && def.colliderEnabled) c.enabled = def.colliderEnabled(c.tag, st);
      else c.enabled = st !== 'destroyed';
    }
    const hook = def.states && !Array.isArray(def.states) ? def.states[st] : def.stateHooks?.[st];
    if (st === 'destroyed' && !hook) collapse(inst, instant);
    else if (inst.collapse && st !== 'destroyed') uncollapse(inst);
    if (hook) hook(inst, instant, ctx);
    for (const h of inst.glows) h.set({ visible: st !== 'destroyed' && (def.glowsOn ? def.glowsOn(st) : true) });
  }

  // ---------------------------------------------------------------- collapse (generic destroy)
  function collapse(inst, instant) {
    const def = defs.get(inst.type);
    const [w, d] = footprintWD(def, inst.params);
    const h = def.height ? def.height(inst.params) : 10;
    if (!inst.collapse) {
      const r = mulberry32(hashString(inst.id + ':fall'));
      inst.collapse = { t: 0, dur: 2.6, sink: Math.min(h * 0.6, 14), tiltX: (r() - 0.5) * 0.35, tiltZ: (r() - 0.5) * 0.35, w, d, h, fx: false };
    }
    if (instant) inst.collapse.t = inst.collapse.dur;
    else if (!inst.collapse.fx && inst.root) {
      inst.collapse.fx = true;
      const c = toWorld(inst, 0, h * 0.4, 0, new THREE.Vector3());
      ctx.fx?.explosion?.(c, clamp(Math.max(w, d) / 14, 1.2, 4), { debris: 10 });
      ctx.fx?.dust?.(toWorld(inst, 0, 1, 0, new THREE.Vector3()), 30, Math.max(w, d) * 0.6);
      ctx.audio?.play?.('collapse', c);
    }
    poseCollapse(inst);
  }
  function uncollapse(inst) {
    inst.collapse = null;
    if (inst.rubble) { inst.rubble.parent?.remove(inst.rubble); inst.rubble = null; }
    if (inst.root) { inst.root.position.copy(inst.pos); inst.root.rotation.set(0, inst.yaw, 0); inst.root.updateMatrix(); }
  }
  function poseCollapse(inst) {
    const C = inst.collapse;
    if (!C || !inst.root) return;
    const k = C.t / C.dur, e = k * k * (3 - 2 * k);
    inst.root.position.set(inst.pos.x, inst.pos.y - C.sink * e, inst.pos.z);
    inst.root.rotation.set(C.tiltX * e, inst.yaw, C.tiltZ * e, 'YXZ');
    inst.root.updateMatrix();
    if (k >= 1 && !inst.rubble) {
      const rb = rubble(ctx, C.w, C.d).clone();
      rb.position.copy(inst.pos); rb.rotation.y = inst.yaw; rb.matrixAutoUpdate = false; rb.updateMatrix();
      rb.traverse(o => { if (o !== rb) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
      ctx.levelRoot.add(rb); inst.rubble = rb;
    }
    if (k >= 1 && C.sink > 0) inst.root.visible = C.h * 0.4 > C.sink * 0.5;   // fully sunk structures vanish into the rubble
  }

  // ---------------------------------------------------------------- realise
  function realise(inst) {
    if (inst.root) return;
    const def = defs.get(inst.type);
    let root;
    if (def.builtin) {
      const tpl = template(ctx, inst.type, def, inst.params);
      const lod = new THREE.LOD();
      const l0 = tpl.lod0.clone(true);
      lod.addLevel(l0, 0);
      if (tpl.lod1) lod.addLevel(tpl.lod1.clone(), ctx.tier.structureLodDist ?? 400);
      lod.addLevel(new THREE.Object3D(), ctx.tier.viewDistance * 1.05);
      root = lod;
      inst.lamps = tpl.lamps;
    } else {
      const rng = mulberry32(hashString(inst.id));
      const built = def.build(ctx, inst.params, rng, KIT);
      if (built.lod) {
        const lod = new THREE.LOD(); lod.addLevel(built.root, 0); lod.addLevel(built.lod, ctx.tier.structureLodDist ?? 400);
        lod.addLevel(new THREE.Object3D(), ctx.tier.viewDistance * 1.05);
        root = lod;
      } else root = built.root;
      inst.lamps = [];
    }
    root.name = 'structure:' + inst.id;
    root.position.copy(inst.pos); root.rotation.y = inst.yaw;
    root.userData.structure = inst.id;
    root.matrixAutoUpdate = false;
    root.updateMatrix();
    root.traverse(o => { if (o !== root) { o.matrixAutoUpdate = !!o.userData.part; o.updateMatrix(); } });
    ctx.levelRoot.add(root);
    inst.root = root;
    inst.glows = [];
    const G = ctx.particles?.glows;
    if (G?.add) for (const L of inst.lamps) inst.glows.push(G.add(root, { color: L.color, size: L.size, intensity: 2.2, pulse: L.pulse, offset: L.pos, minPx: 2 }));
    def.onRealise?.(inst, ctx);
    if (inst.collapse || inst.state === 'destroyed') { if (inst.state === 'destroyed') collapse(inst, true); }
    applyState(inst, true);
    realisedCount++;
  }
  function unrealise(inst) {
    if (!inst.root) return;
    const def = defs.get(inst.type);
    def.onUnrealise?.(inst, ctx);
    for (const h of inst.glows) h.remove();
    inst.glows = [];
    inst.root.parent?.remove(inst.root);
    if (!def.builtin) inst.root.traverse(o => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
    inst.root = null;
    if (inst.rubble) { inst.rubble.parent?.remove(inst.rubble); inst.rubble = null; }
  }
  let realisedCount = 0;

  ctx.events.on('tier:changed', ({ tier }) => {
    for (const inst of insts.values()) {
      if (!inst.root?.isLOD) continue;
      const lv = inst.root.levels;
      if (lv[1]) lv[1].distance = lv.length > 2 ? tier.structureLodDist : lv[1].distance;
      if (lv.length > 2) lv[lv.length - 1].distance = tier.viewDistance * 1.05;
    }
  });

  const api = {
    register(type, def) {
      if (!def || typeof def.footprint !== 'function' || typeof def.colliders !== 'function' || typeof def.build !== 'function')
        throw new Error(`structures.register(${type}): needs footprint, colliders and build`);
      defs.set(type, { stateList: def.states ? Object.keys(def.states) : ['intact'], ...def, builtin: false });
    },
    has(type) { return defs.has(type); },
    footprint(type, params) {
      const d = defs.get(type);
      if (!d) { console.warn('[structures] unknown type', type); return { shape: 'circle', r: 5, flatten: false, pad: 10, exclude: 0, h: 'auto' }; }
      return d.footprint({ ...(d.defaults || d.params || {}), ...(params || {}) });
    },
    place(entry, pos, yaw = 0) {
      let def = defs.get(entry.type);
      if (!def) { console.error('[structures] unknown structure type', entry.type); def = defs.get('ruin_block'); }
      const type = defs.get(entry.type) ? entry.type : 'ruin_block';
      const id = entry.id || `${entry.type}#${++autoId}`;
      if (insts.has(id)) throw new Error(`structures.place: duplicate id "${id}"`);
      const params = { ...(def.defaults || def.params || {}), ...(entry.params || {}) };
      const inst = {
        id, type, params, pos: pos.clone(), yaw: yaw || 0, root: null, colliders: [], anchors: {}, glows: [], lamps: [],
        state: entry.state || def.stateList?.[0] || 'intact', target: null, tag: entry.tag, collapse: null, rubble: null, anim: {},
        setState(state, o = {}) {
          if (inst.state === state) return;
          inst.state = state;
          applyState(inst, !!o.instant);
          ctx.events.emit('structure:state', { id, state });
        },
        destroy(o = {}) {
          if (inst.state === 'destroyed') return;
          inst.setState('destroyed', o);
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
        const base = toWorld(inst, h.center[0], 0, h.center[2], new THREE.Vector3());
        const t = {
          name: ds.name || entry.type.toUpperCase(), kind: 'structure', team: ds.team || 'enemy', tags,
          alive: true, targetable: true, objective: !!ds.objective, boss: false,
          pos: c, vel: new THREE.Vector3(), ap: ds.ap, apMax: ds.ap, imp: 0, impMax: ds.impMax ?? Infinity,
          stagT: 0, stagDur: 0, lastHit: -9, invuln: false, hitR: h.r, structure: inst,
          center(out = new THREE.Vector3()) {
            if (h.h && ctx.player?.pos) return out.set(base.x, clamp(ctx.player.pos.y + 6, base.y + 4, base.y + h.h - 2), base.z);
            return out.copy(this.pos);
          },
          hitTest(p) {
            if (h.h) { const dx = p.x - base.x, dz = p.z - base.z; return dx * dx + dz * dz < h.r * h.r && p.y > base.y - 1 && p.y < base.y + h.h; }
            return p.distanceToSquared(this.pos) < this.hitR * this.hitR;
          },
          onDeath() { inst.destroy(); },
        };
        inst.target = t;
        ctx.combat.register(t);
      }
      // prebuild the shared catalogue geometry while loading (realising then only clones meshes)
      if (def.builtin && def.prebuild !== false) template(ctx, type, def, params);
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
        inst.anim = {};
        if (st !== 'destroyed') uncollapse(inst);
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
      autoId = 0;   // generated ids ('wall#1') are the same on every load of a level (checkpoint states key on them)
    },
    update(dt) {
      if (!insts.size) return;
      const sdt = simDt(dt);
      for (const inst of insts.values()) {
        if (!inst.root) continue;
        if (inst.collapse && inst.collapse.t < inst.collapse.dur && sdt > 0) { inst.collapse.t = Math.min(inst.collapse.dur, inst.collapse.t + sdt); poseCollapse(inst); }
        const def = defs.get(inst.type);
        if (def.animate) def.animate(inst, sdt, ctx, dt);
      }
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
    /** extra (tests, tools): template stats for a type and params */
    templateStats(type, params) {
      const def = defs.get(type);
      if (!def?.builtin) return null;
      const tpl = template(ctx, type, def, { ...(def.defaults || def.params || {}), ...(params || {}) });
      let calls = 0; tpl.lod0.traverse(o => { if (o.isMesh) calls++; });
      return { tris0: tpl.tris0, tris1: tpl.tris1, calls0: calls, calls1: tpl.lod1 ? 1 : 0, lamps: tpl.lamps.length };
    },
    /** extra (tests, galleries): fresh clones of a catalogue type's LOD0 group and LOD1 mesh (sharing the cached geometry) */
    preview(type, params) {
      const def = defs.get(type);
      if (!def?.builtin) return null;
      const p = { ...(def.defaults || def.params || {}), ...(params || {}) };
      const tpl = template(ctx, type, def, p);
      return { lod0: tpl.lod0.clone(true), lod1: tpl.lod1 ? tpl.lod1.clone() : null, lamps: tpl.lamps, params: p, height: def.height ? def.height(p) : 10, footprint: def.footprint(p) };
    },
    /** extra (tests): number of realise() calls so far */
    get realised() { return realisedCount; },
  };
  ctx.addSystem({ name: 'structures', phase: 'world', when: 'always', order: 10, update: (dt) => api.update(dt) });
  ctx.structures = api;
  return api;
}

let _propMat = null, _propCtx = null;
function propMaterial(ctx) {
  if (_propMat && _propCtx === ctx) return _propMat;
  _propCtx = ctx;
  _propMat = ctx?.materials?.standard ? ctx.materials.standard({ color: '#ffffff', vertexColors: true, roughness: 0.78, metalness: 0.3, envMapIntensity: 0.55, wear: 0.55 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.3 });
  return _propMat;
}

// ================================================================== materials (library first, AD §4.2 fallbacks)
const MAT_FALLBACK = {
  concrete: ['#6e665c', 0.92, 0.02], concreteDark: ['#4d463e', 0.94, 0.02], steel: ['#5b5e62', 0.38, 0.9], steelDark: ['#2f3236', 0.5, 0.85],
  ironBlack: ['#1c1b1d', 0.62, 0.55], oxide: ['#7d2a1c', 0.6, 0.3], stripe: ['#d9a521', 0.55, 0.25], rust: ['#7a4128', 0.88, 0.35],
  paintWake: ['#4f8a86', 0.62, 0.28], paintWakeRed: ['#a5452f', 0.64, 0.28], canvas: ['#d9cba8', 0.95, 0], rubber: ['#1a1918', 0.9, 0],
  ceramic: ['#e9e6dc', 0.35, 0.05], ceramicAged: ['#b8b0a0', 0.5, 0.05], gold: ['#c99a3e', 0.32, 1], darkGlass: ['#0b1014', 0.06, 0],
  glass: ['#3c4a52', 0.1, 0], ice: ['#9cc4dc', 0.18, 0], snow: ['#e8eef5', 0.78, 0], rock: ['#4a3f3a', 0.92, 0], debris: ['#2a2524', 0.8, 0.4],
  scorch: ['#141212', 0.95, 0.1], dark: ['#141416', 0.8, 0.4], cable: ['#151517', 0.6, 0.2],
};
const LIGHT_FALLBACK = { lightAmber: ['#ffb36b', 3], lightCyan: ['#5fe3ff', 3.5], lightGold: ['#ffcc66', 3], lightSodium: ['#ff9a2e', 4],
  lightWhite: ['#fff1d6', 5], lightRed: ['#ff2a1a', 3], lightGhost: ['#a8ff9e', 6] };
const LIBS = new WeakMap();
function getMat(ctx, name) {
  const m = ctx?.materials?.get?.(name);
  if (m && m.name === name) return m;
  const F = MAT_FALLBACK[name], L = LIGHT_FALLBACK[name];
  if (ctx?.materials?.standard && F) return ctx.materials.standard({ color: F[0], roughness: F[1], metalness: F[2], wear: 0.5 });
  if (ctx?.materials?.emissive && L) return ctx.materials.emissive(L[0], L[1]);
  if (m) return m;
  return new THREE.MeshStandardMaterial({ color: F?.[0] ?? '#808080', roughness: F?.[1] ?? 0.7, metalness: F?.[2] ?? 0.3, emissive: L?.[0] ?? '#000000' });
}
/** Named library materials for a ctx (cached): M.concrete, M.ironBlack, M.lightSodium … */
export function matLib(ctx) {
  const key = ctx || matLib;
  let L = LIBS.get(key);
  if (L) return L;
  const cache = {};
  L = new Proxy(cache, { get: (t, name) => (typeof name !== 'string' ? undefined : (t[name] ??= getMat(ctx, name))) });
  LIBS.set(key, L);
  return L;
}

// ================================================================== builders shared by the catalogue
const PI = Math.PI, HALF = PI / 2;
const r2 = (v) => Math.round(v * 100) / 100;
const P = (x, y, z, rx = 0, ry = 0, rz = 0, extra) => ({ pos: [x, y, z], rot: [rx, ry, rz], ...(extra || {}) });
const GEO = new Map();
function geo(key, fn) { let g = GEO.get(key); if (!g) { g = fn(); g.userData.shared = true; GEO.set(key, g); } return g; }
/** battered block: chamfered rectangle w × d at the base, × k at the top, height h (base at y = 0) */
function frustum(w, d, h, k = 0.9, c = 0) {
  return geo(`fr|${w}|${d}|${h}|${k}|${c}`, () => {
    const cc = c || Math.min(w, d) * 0.06;
    const g = KIT.loft([{ z: 0, pts: KIT.chamferRect(w, d, cc) }, { z: h, pts: KIT.chamferRect(w * k, d * k, cc * k) }]);
    g.rotateX(-HALF);
    return g;
  });
}
function box(w, d, top, o = {}) {
  const x = o.x || 0, z = o.z || 0;
  return { type: 'box', minx: x - w / 2, maxx: x + w / 2, minz: z - d / 2, maxz: z + d / 2, top, bottom: o.bottom, tag: o.tag, surface: o.surface };
}
const rect = (w, d, extra = {}) => ({ shape: 'rect', w, d, flatten: true, pad: clamp(Math.max(w, d) * 0.3, 8, 40), exclude: 4, h: 'auto', ...extra });
/** a vertical ladder on a face: rails + rungs every 0.35 m (detail) */
function ladder(B, M, x, y0, z, h, ry = 0, w = 0.8) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const V = B.under ? B.under(m) : B;
  for (const s of [-1, 1]) V.add(KIT.bar(h, 0.1, 0.1), M.ironBlack, P(s * w / 2, h / 2, 0, 0, 0, HALF));
  for (let y = 0.3; y < h; y += 0.35) V.add(KIT.bar(w, 0.06, 0.06), M.ironBlack, P(0, y, 0, 0, 0, 0, { lod0: true }));
}
/** handrail from a to b ([x,y,z]): posts every 1.8 m, top and mid rails (detail) */
function railing(B, M, a, b, h = 1.1, mat) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), L = A.distanceTo(Bv), n = Math.max(1, Math.round(L / 1.8));
  for (let i = 0; i <= n; i++) { const q = A.clone().lerp(Bv, i / n); B.add(KIT.bar(h, 0.09, 0.09), mat || M.ironBlack, P(q.x, q.y + h / 2, q.z, 0, 0, HALF, { lod0: true })); }
  for (const y of [h, h * 0.5]) B.add(KIT.barBetween([A.x, A.y + y, A.z], [Bv.x, Bv.y + y, Bv.z], 0.07, 0.07), mat || M.ironBlack, { lod0: true });
}
/** hazard band: alternating stripe / iron blocks along x, w long, h tall, t thick, centred at pos */
function hazard(B, M, w, h, t, pos, ry = 0) {
  const n = Math.max(2, Math.round(w / (h * 1.1))), cw = w / n;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const V = B.under(m);
  for (let i = 0; i < n; i++) V.add(KIT.plateBox(cw * 0.96, h, t, Math.min(h, t) * 0.15), i % 2 ? M.ironBlack : M.stripe, P(-w / 2 + cw * (i + 0.5), 0, 0));
}
/** panel wall body along x: proud plates on an irregular grid over a dark core (real seams), both faces */
function panelWall(B, M, rng, L, H, T, o = {}) {
  const gap = o.gap ?? 0.16, damage = o.damage ?? 0, mat = o.mat || M.concrete, core = o.core || M.concreteDark;
  B.add(KIT.slab(L, H, T * 0.72, { bevel: 0.15 }), core, P(0, H / 2, 0));
  B.add(KIT.slab(L, H * 0.92, T, {}), core, P(0, H * 0.46, 0, 0, 0, 0, { lod1: true }));
  const cols = KIT.split(L, rng, o.colMin ?? 2.6, o.colMax ?? 4.4), rows = KIT.split(H - 1.2, rng, o.rowMin ?? 2.2, o.rowMax ?? 3.4);
  for (const s of o.faces ?? [-1, 1]) {
    let x = -L / 2;
    for (const cw of cols) {
      let y = 0.9;
      for (const rh of rows) {
        if (!(damage && rng() < damage * 0.45 && y > 2)) {
          B.add(KIT.plateBox(cw - gap, rh - gap, 0.32, 0.07), mat, P(x + cw / 2, y + rh / 2, s * (T * 0.36 + 0.14), 0, 0, 0, { tint: 0.06 }));
        } else for (let k = 0; k < 3; k++) B.add(KIT.bar(rh * 0.9, 0.06, 0.06), M.rust, P(x + cw * (0.25 + k * 0.25), y + rh / 2, s * T * 0.36, 0, 0, HALF + (rng() - 0.5) * 0.4, { lod0: true }));
        y += rh;
      }
      x += cw;
    }
  }
}
const dir3 = (a) => [Math.sin(a), 0, Math.cos(a)];
/** a ground pad of w × d as cast slabs on an irregular grid with real expansion joints (no 60 m plain face, and the
 *  joints break the concrete texture's repeat); top at y, thickness t; the joint gaps show the dark sub-base */
function pad(B, M, rng, w, d, y, t = 0.6, o = {}) {
  const mat = o.mat || M.concreteDark, base = o.base || M.dark, gap = o.gap ?? 0.22;
  B.add(KIT.slab(w, t * 0.5, d, { bevel: 0.1 }), base, P(0, y - t * 0.75, 0));
  B.add(KIT.slab(w, t, d, { bevel: 0.2 }), mat, P(0, y - t / 2, 0, 0, 0, 0, { lod1: true }));
  const cols = KIT.split(w, rng, o.min ?? 7, o.max ?? 11), rows = KIT.split(d, rng, o.min ?? 7, o.max ?? 11);
  let x = -w / 2;
  for (const cw of cols) {
    let z = -d / 2;
    for (const rd of rows) { B.add(KIT.slab(cw - gap, t, rd - gap, { bevel: Math.min(0.12, t * 0.2) }), mat, P(x + cw / 2, y - t / 2, z + rd / 2, 0, 0, 0, { tint: 0.06, lod0: true })); z += rd; }
    x += cw;
  }
}

// ================================================================== the catalogue (Appendix C.3)
const DREDGE_PLATE = (A) => A.M.concrete;
export const CATALOG = {
  // ---------------------------------------------------------------- bunker: battered concrete, slit, blast door, roof clutter
  bunker: {
    params: { w: 24, d: 16, h: 8 }, states: ['intact', 'destroyed'], height: p => p.h,
    footprint: p => rect(p.w + 3, p.d + 3, { pad: 12 }),
    colliders: p => [box(p.w, p.d, p.h)],
    anchors: p => ({ door: [0, 0, p.d / 2 + 1], roof: [0, p.h, 0] }),
    hit: p => ({ center: [0, p.h / 2, 0], r: Math.max(p.w, p.d) * 0.5 }),
    build(A, p) {
      const { B, M, rng } = A, { w, d, h } = p;
      B.add(frustum(w + 2.6, d + 2.6, 2.4, 0.95, 0.5), M.concreteDark, P(0, -1.5, 0));
      B.add(frustum(w, d, h - 0.9, 0.86, 1.4), M.concrete, P(0, 0.9, 0));
      B.add(frustum(w * 0.84, d * 0.8, 0.7, 0.92, 0.4), M.concreteDark, P(0, h - 0.05, 0));
      // pilasters on the long faces
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const x = -w * 0.36 + i * w * 0.24;
        if (s < 0 && Math.abs(x) < w * 0.33) continue;   // the slit facade owns the middle of the front face
        B.add(KIT.slab(1.3, h - 0.6, 1.4, { taper: 0.75 }), M.concreteDark, P(x, (h - 0.6) / 2 + 0.6, s * (d / 2 - 0.5), s * 0.12, 0, 0));
      }
      // front facade (−z) with the firing slit (a real hole) and a dark interior behind it
      const fz = -d / 2 + 0.55, sy = h * 0.6;
      B.add(KIT.plateGeo(KIT.chamferRect(w * 0.62, h * 0.52, 0.45), 0.8, 'front', 0.14, { holes: [KIT.chamferRect(w * 0.42, 0.8, 0.18, 0, 0.25)] }),
        M.concreteDark, P(0, sy, fz - 0.15, -0.1));
      B.add(KIT.plateBox(w * 0.44, 1.0, 1.0, 0.05), M.dark, P(0, sy + 0.25, fz + 0.75));
      B.add(KIT.slab(w * 0.48, 0.4, 1.4, { bevel: 0.12 }), M.concrete, P(0, sy + 0.95, fz - 0.6, -0.1));
      A.lamp(B, [w * 0.3, h * 0.82, fz - 0.6], [0, -0.35, -1], 0.32, 'lightSodium');
      // blast door at the back (+z) with a frame and a hazard band
      const bz = d / 2 - 0.4;
      for (const s of [-1, 1]) B.add(KIT.slab(0.9, 5.6, 1.4), M.concreteDark, P(s * 3.0, 2.8, bz + 0.3));
      B.add(KIT.slab(7.0, 0.9, 1.4), M.concreteDark, P(0, 6.0, bz + 0.3));
      B.add(KIT.panelBox(5.0, 5.0, 0.5, { cols: 2, rows: 3, inset: 0.06 }), M.ironBlack, P(0, 2.6, bz + 0.25));
      hazard(B, M, 5.0, 0.5, 0.2, [0, 0.55, bz + 0.6]);
      B.add(KIT.greeble('junction', 0.9, 1.1, 0.35), M.ironBlack, P(4.2, 2.4, bz + 0.62));
      A.lamp(B, [0, 6.8, bz + 1.1], [0, -0.4, 1], 0.28, 'lightSodium');
      // roof: cast slabs with real pour joints (no 20 m plain lid), vents, hatch, whip antenna, a stack of sandbag-like slabs
      const rt = h + 0.62;   // top of the roof cap
      {
        const rw = w * 0.84 * 0.9, rd = d * 0.8 * 0.9;
        let x = -rw / 2;
        for (const cw of KIT.split(rw, rng, 3.2, 5.2)) {
          let z = -rd / 2;
          for (const cd of KIT.split(rd, rng, 3.0, 4.6)) {
            B.add(KIT.slab(r2(cw - 0.2), 0.16, r2(cd - 0.2), { bevel: 0.05 }), M.concrete, P(x + cw / 2, rt + 0.04, z + cd / 2, 0, 0, 0, { tint: 0.07, lod0: true }));
            z += cd;
          }
          x += cw;
        }
      }
      B.add(KIT.greeble('vent', 2.2, 1.6, 0.5), M.ironBlack, P(-w * 0.2, rt, 0, -HALF));
      B.add(KIT.greeble('vent', 1.6, 1.6, 0.5), M.ironBlack, P(w * 0.08, rt, d * 0.15, -HALF));
      B.add(KIT.ring(0.8, 0.22, 0.3), M.ironBlack, P(w * 0.22, rt + 0.12, -d * 0.12));
      B.add(KIT.disc(0.7, 0.16), M.concreteDark, P(w * 0.22, rt + 0.16, -d * 0.12));
      B.add(KIT.cylinder(0.05, 0.03, 6, 6), M.ironBlack, P(-w * 0.32, rt + 3.2, d * 0.2), { lod0: true });
      B.add(KIT.cylinder(0.25, 0.3, 0.4, 8), M.ironBlack, P(-w * 0.32, rt + 0.18, d * 0.2));
      B.add(KIT.greebles(rng, w * 0.4, 1.8, 0.6), M.ironBlack, P(w * 0.02, rt, -d * 0.3, -HALF), { lod0: true });
      for (const s of [-1, 1]) B.add(KIT.pipeRun([[s * w * 0.42, rt + 0.3, d * 0.28], [s * w * 0.42, rt + 0.3, -d * 0.1], [s * w * 0.3, rt + 0.3, -d * 0.1]], 0.14, { flangeEnds: true }), M.ironBlack, null, { lod0: true });
    },
  },
  // ---------------------------------------------------------------- watchtower: battered shaft, ladder cage, cab with window band
  watchtower: {
    params: { h: 24 }, states: ['intact', 'destroyed'], height: p => p.h,
    footprint: p => rect(9, 9, { pad: 8 }),
    colliders: p => [box(5.6, 5.6, p.h - 4), box(9, 9, p.h + 0.8, { bottom: p.h - 4.2 })],
    anchors: p => ({ top: [0, p.h + 0.9, 0] }),
    hit: p => ({ center: [0, p.h / 2, 0], r: 4, h: p.h + 2 }),
    build(A, p) {
      const { B, M, rng } = A, H = p.h, ch = H - 4;
      B.add(frustum(8, 8, 2.2, 0.92, 0.5), M.concreteDark, P(0, -1.4, 0));
      B.add(frustum(5.6, 5.6, ch, 0.74, 0.9), M.concrete, P(0, 0.8, 0));
      for (let y = 4; y < ch - 1; y += 4.5) { const k = 1 - (y / ch) * 0.26; B.add(frustum(5.75 * k, 5.75 * k, 0.35, 0.99, 0.6 * k), M.concreteDark, P(0, y, 0)); }
      ladder(B, M, 0, 0.8, 2.95, ch - 0.4);
      for (let y = 3; y < ch - 1; y += 1.6) B.add(KIT.ring(0.75, 0.06, 0.08, 10).clone().rotateX(HALF), M.ironBlack, P(0, y, 3.55, 0, 0, 0, { lod0: true }));
      // cab
      const cy = H - 4;
      B.add(KIT.slab(8.6, 0.7, 8.6, { bevel: 0.2 }), M.concreteDark, P(0, cy, 0));
      hazard(B, M, 8.4, 0.45, 0.25, [0, cy - 0.55, -4.25]);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(KIT.slab(0.8, 3.4, 0.8), M.concrete, P(sx * 3.9, cy + 2.0, sz * 3.9));
      for (let i = 0; i < 4; i++) {
        const a = i * HALF, m = new THREE.Matrix4().makeRotationY(a), V = B.under(m);
        V.add(KIT.slab(7.0, 1.2, 0.5), M.concrete, P(0, cy + 0.95, -3.95));
        V.add(KIT.plateBox(7.0, 1.3, 0.25, 0.04), M.dark, P(0, cy + 2.2, -3.75));
        for (let k = -1; k <= 1; k++) V.add(KIT.bar(1.3, 0.12, 0.14), M.ironBlack, P(k * 2.3, cy + 2.2, -3.95, 0, 0, HALF));
        V.add(KIT.slab(7.6, 0.6, 0.6), M.concreteDark, P(0, cy + 3.15, -4.05));
      }
      B.add(KIT.slab(9.6, 0.6, 9.6, { bevel: 0.22 }), M.concreteDark, P(0, cy + 3.75, 0));
      B.add(KIT.slab(6.4, 0.5, 6.4), M.concrete, P(0, cy + 4.25, 0));
      // roof clutter: searchlight on a yoke, whips, a junction box
      B.add(KIT.cylinder(0.5, 0.6, 0.5, 10), M.ironBlack, P(2.2, cy + 4.7, -2.2));
      for (const s of [-1, 1]) B.add(KIT.plateBox(0.15, 1.0, 0.5, 0.03), M.ironBlack, P(2.2 + s * 0.75, cy + 5.3, -2.2));
      A.lamp(B, [2.2, cy + 5.5, -2.2], [0.3, -0.25, -1], 0.6, 'lightWhite', { size: 3 });
      A.lamp(B, [-4.3, cy + 3.0, -4.3], [-0.5, -0.3, -0.6], 0.3, 'lightSodium');
      for (const [x, z, hh] of [[-2.6, 2.4, 5], [-1.6, 2.8, 3.6]]) B.add(KIT.cylinder(0.05, 0.03, hh, 6), M.ironBlack, P(x, cy + 4.5 + hh / 2, z), { lod0: true });
      B.add(KIT.greeble('junction', 1.2, 0.8, 0.5), M.ironBlack, P(0, cy + 4.7, 2.2, -HALF));
    },
  },
  // ---------------------------------------------------------------- wall: panel wall with plinth, buttresses, coping, conduit, damage
  wall: {
    params: { length: 40, h: 10, thickness: 3, damaged: 0 }, states: ['intact', 'destroyed'], height: p => p.h,
    footprint: p => rect(p.length, p.thickness + 3, { pad: 8 }),
    colliders: p => [box(p.length, p.thickness + 0.6, p.h)],
    hit: p => ({ center: [0, p.h / 2, 0], r: Math.max(p.length * 0.5, p.h) }),
    build(A, p) {
      const { B, M, rng } = A, L = p.length, H = p.h, T = p.thickness, dmg = p.damaged || 0;
      B.add(frustum(L + 1.2, T + 2.2, 2.4, 0.94, 0.4), M.concreteDark, P(0, -1.5, 0));
      // params.panel 'large': a coarser panel grid (composites such as the outpost, which must fit one 60k LOD0)
      const big = p.panel === 'large';
      panelWall(B, M, rng, L, H - 0.6, T, { damage: dmg, ...(big ? { colMin: 4.6, colMax: 7.2, rowMin: 3.2, rowMax: 4.6 } : {}) });
      const nb = Math.max(1, Math.round(L / 8));
      for (let i = 0; i <= nb; i++) {
        const x = -L / 2 + L * i / nb;
        B.add(KIT.slab(1.5, H + 0.2, T + 1.8, { taper: 0.82 }), M.concreteDark, P(x, (H + 0.2) / 2, 0));
        if (i % 2 === 1) A.lamp(B, [x, H * 0.72, -(T / 2 + 1.0)], [0, -0.3, -1], 0.28, 'lightSodium', { lod0: true });
      }
      // coping with a drip edge (broken into pieces when damaged)
      const pieces = dmg > 0 ? KIT.split(L, rng, 4, 9) : [L];
      let x = -L / 2;
      for (const cw of pieces) {
        const missing = dmg > 0 && rng() < dmg * 0.6;
        if (!missing) B.add(KIT.slab(cw - (dmg > 0 ? 0.3 : 0), 0.7, T + 0.9, { bevel: 0.2, chamfer: [0.1, 0.1, 0.32, 0.32] }), M.concreteDark,
          P(x + cw / 2, H - 0.3 - (dmg > 0 ? rng() * dmg * 1.2 : 0), 0, 0, 0, dmg > 0 ? (rng() - 0.5) * dmg * 0.1 : 0));
        x += cw;
      }
      // conduit on the outer face, with clamp blocks
      B.add(KIT.pipeRun([[-L / 2 + 1, H * 0.62, -(T / 2 + 0.55)], [L / 2 - 1, H * 0.62, -(T / 2 + 0.55)]], 0.16, { flangeEnds: false }), M.ironBlack, null, { lod0: true });
      for (let k = -L / 2 + 3; k < L / 2 - 1; k += 4.2) B.add(KIT.plateBox(0.3, 0.5, 0.4, 0.04), M.ironBlack, P(k, H * 0.62, -(T / 2 + 0.4)), { lod0: true });
      if (dmg > 0) for (let i = 0; i < Math.round(dmg * 10); i++) {   // rubble at the foot
        B.add(KIT.rockGeo(500 + i, { cuts: 9, noise: 0.06 }), M.concreteDark, { pos: [(rng() - 0.5) * L * 0.9, 0.3, (rng() < 0.5 ? -1 : 1) * (T / 2 + 1 + rng() * 2)], rot: [rng(), rng() * 6, rng()], scale: 0.7 + rng() * 1.2 });
      }
    },
  },
  // ---------------------------------------------------------------- gate: twin battered towers, lintel truss, blast door that drops into its slot
  gate: {
    params: { width: 30, h: 16 }, states: ['closed', 'open', 'destroyed'], height: p => p.h + 3,
    footprint: p => rect(p.width + 16, 10, { pad: 12 }),
    colliders: p => [box(p.width, 2.4, p.h, { tag: 'door' }), box(7.2, 8, p.h + 3, { x: -(p.width / 2 + 3.6) }), box(7.2, 8, p.h + 3, { x: p.width / 2 + 3.6 }),
                     box(p.width + 14, 4, p.h + 3.4, { bottom: p.h + 0.2 })],
    anchors: p => ({ door: [0, 0, 0] }),
    hit: p => ({ center: [0, p.h / 2, 0], r: p.width * 0.5 }),
    build(A, p) {
      const { B, M } = A, W = p.width, H = p.h;
      for (const s of [-1, 1]) {
        const x = s * (W / 2 + 3.6);
        B.add(frustum(9, 10, 2.4, 0.95), M.concreteDark, P(x, -1.5, 0));
        B.add(frustum(7.2, 8, H + 2.2, 0.84, 1.0), M.concrete, P(x, 0.8, 0));
        for (let y = 4; y < H; y += 5) B.add(frustum(7.4 * (1 - y / (H + 3) * 0.16), 8.2 * (1 - y / (H + 3) * 0.16), 0.4, 0.99, 0.6), M.concreteDark, P(x, y, 0));
        B.add(KIT.slab(1.0, H - 0.4, 1.6), M.ironBlack, P(s * (W / 2 + 0.3), H / 2, 0));   // door guides
        hazard(B, M, 0.9, 1.0, 1.7, [s * (W / 2 + 0.3), 1.0, 0], HALF);
        A.lamp(B, [x, H + 0.6, -4.2], [0, -0.3, -1], 0.42, 'lightSodium');
        B.add(KIT.greeble('vent', 3.2, 1.8, 0.4), M.ironBlack, P(x, H * 0.55, -4.0 + s * 0, 0, PI));
      }
      // lintel: a box girder and a truss over it
      B.add(KIT.slab(W + 15, 2.6, 4.2, { bevel: 0.3 }), M.concreteDark, P(0, H + 1.5, 0));
      B.add(KIT.truss(W + 12, 2.4, 2.4, Math.round(W / 4), 0.3), M.ironBlack, P(0, H + 2.8, 0));
      hazard(B, M, W, 0.6, 0.3, [0, H + 0.45, -2.2]);
      B.add(KIT.plateBox(W, 0.6, 2.6, 0.08), M.dark, P(0, 0.05, 0));   // the door slot
      // the door (drops into its slot when open)
      const D = A.part('door');
      D.add(KIT.panelBox(W - 0.2, H - 0.2, 1.4, { cols: Math.max(3, Math.round(W / 5)), rows: Math.max(2, Math.round(H / 5)), inset: 0.08 }), M.ironBlack, P(0, H / 2, 0));
      for (let i = 1; i < 4; i++) D.add(KIT.bar(H - 0.6, 0.4, 0.5), M.ironBlack, P(-W / 2 + W * i / 4, H / 2, -0.9, 0, 0, HALF));
      D.add(KIT.bar(W - 0.4, 0.5, 0.6), M.ironBlack, P(0, 1.0, -0.9));
    },
    stateHooks: {
      closed: (inst, instant) => doorTo(inst, 0, instant),
      open: (inst, instant) => doorTo(inst, -(inst.params.h + 0.4), instant),
    },
    animate: (inst, dt) => animParts(inst, dt),
  },
  // ---------------------------------------------------------------- bridge: piers, deck, side trusses, portals, lamps (along local z)
  bridge: {
    params: { length: 120, h: 20, width: 24 }, states: ['intact', 'destroyed'], height: p => p.h,
    footprint: p => rect(p.width + 4, p.length, { flatten: false, pad: 10, exclude: 2 }),
    colliders: p => {
      const out = [box(p.width, p.length, p.h + 1.4, { bottom: p.h - 0.2, surface: 'metal' })];
      for (const s of [-1, 1]) out.push(box(1.2, p.length, p.h + 10.4, { x: s * (p.width / 2 - 0.4), bottom: p.h + 1.4, surface: 'metal' }));
      for (const z of piersFor(p.length)) out.push(box(7, 9, p.h - 0.2, { z }));
      return out;
    },
    rubbleColliders: p => piersFor(p.length).map(z => box(8, 10, 3, { z })),
    hit: p => ({ center: [0, p.h, 0], r: p.length * 0.5 }),
    lod1Budget: 6000,
    build(A, p) {
      const { B, M } = A, L = p.length, H = p.h, W = p.width;
      for (const z of piersFor(L)) {
        B.add(frustum(7, 9, H + 2.2, 0.72, 1.2), M.concrete, P(0, -3, z));
        B.add(KIT.slab(W + 1.5, 1.6, 7.5, { bevel: 0.35 }), M.concreteDark, P(0, H - 0.8, z));
        hazard(B, M, 5, 0.8, 0.3, [0, H * 0.35, z - 4.4]);
      }
      for (const s of [-1, 1]) {
        const az = s * (L / 2 + 5);
        B.add(frustum(W + 4, 12, H + 3, 0.9, 1.2), M.concreteDark, P(0, -3, az));
        B.add(KIT.slab(W + 3, 1.2, 11, { bevel: 0.35, chamfer: 0.4 }), M.concrete, P(0, H + 0.2, az));            // coping
        for (let y = 2; y < H; y += 5) B.add(frustum((W + 4) * (1 - (y + 3) / (H + 3) * 0.1) + 0.5, 12.5 - (y + 3) / (H + 3) * 1.2, 0.5, 0.99, 0.5), M.concrete, P(0, y, az));   // pour lines
        for (const x of [-W * 0.32, 0, W * 0.32]) B.add(KIT.slab(2.2, H + 2, 1.6, { taper: 0.8 }), M.concrete, P(x, (H + 2) / 2 - 2.5, az + s * 6.1, s * -0.05, 0, 0));   // buttresses on the outer face
      }
      B.add(KIT.ribbedPlate(W, L, 0.9, { pitch: 4, axis: 'y' }), M.steelDark, P(0, H + 0.95, 0, -HALF));
      B.add(KIT.slab(W - 1, 0.5, L, { bevel: 0.12 }), M.concreteDark, P(0, H + 1.4, 0));
      for (const s of [-1, 1]) {
        B.add(KIT.truss(L, 0, 9, Math.round(L / 6), { pattern: 'pratt', bar: 0.55 }), M.rust, P(s * (W / 2 - 0.4), H + 1.5, 0, 0, HALF), { tint: 0.08 });
        railing(B, M, [s * (W / 2 - 1.6), H + 1.65, -L / 2 + 1], [s * (W / 2 - 1.6), H + 1.65, L / 2 - 1]);
      }
      for (const z of [-L / 2, L / 2]) {   // portals
        for (const s of [-1, 1]) B.add(KIT.slab(1.1, 11, 1.1, { taper: 0.9 }), M.ironBlack, P(s * (W / 2 - 0.4), H + 6.9, z));
        B.add(KIT.slab(W + 0.8, 1.2, 1.3), M.ironBlack, P(0, H + 12.2, z));
        hazard(B, M, W * 0.5, 0.7, 0.3, [0, H + 12.2, z - 0.8]);
      }
      for (let z = -L / 2 + 6; z < L / 2 - 3; z += 12) B.add(KIT.barBetween([-W / 2 + 0.4, H + 10.4, z], [W / 2 - 0.4, H + 10.4, z + 6], 0.3, 0.3), M.rust, { lod0: true });
      for (let z = -L / 2 + 10; z < L / 2; z += 20) for (const s of [-1, 1]) {
        B.add(KIT.cylinder(0.14, 0.18, 6, 8), M.ironBlack, P(s * (W / 2 - 2.2), H + 4.4, z), { lod0: true });
        A.lamp(B, [s * (W / 2 - 2.6), H + 7.4, z], [-s * 0.6, -1, 0], 0.32, 'lightSodium', { lod0: true });
      }
    },
  },
  // ---------------------------------------------------------------- relay pylon: lattice tower, collars, nodes, dish, blinking lamp; topples
  relay_pylon: {
    params: { h: 44 }, states: ['intact', 'destroyed'], height: p => p.h,
    footprint: p => rect(10, 10, { pad: 8 }),
    colliders: p => [{ type: 'circle', x: 0, z: 0, r: 3.4, top: p.h }],
    rubbleColliders: (p, inst) => { const a = fallAngle(inst); return [{ type: 'obox', x: Math.sin(a) * p.h * 0.5, z: Math.cos(a) * p.h * 0.5, hw: 2.4, hd: p.h * 0.48, yaw: a, top: 3 }]; },
    anchors: p => ({ top: [0, p.h + 4, 0] }),
    hit: p => ({ center: [0, p.h / 2, 0], r: 4, h: p.h + 4 }),
    build(A, p) {
      const { B, M } = A, H = p.h;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(frustum(2.6, 2.6, 2.6, 0.8, 0.4), M.concreteDark, P(sx * 3.1, -1.4, sz * 3.1));
      B.add(frustum(8.4, 8.4, 1.6, 0.9, 0.4), M.concreteDark, P(0, -0.9, 0));
      const at = (y) => lerp(3.0, 1.0, y / H);
      const corner = (y, sx, sz) => [sx * at(y), y, sz * at(y)];
      const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of C) B.add(KIT.barBetween(corner(0.7, sx, sz), corner(H, sx, sz), 0.5, 0.5), M.steel);
      const levels = []; for (let y = 6; y < H; y += 7) levels.push(y);
      let prev = 0.7;
      for (const y of levels) {
        for (let i = 0; i < 4; i++) {
          const [ax, az] = C[i], [bx, bz] = C[(i + 1) % 4];
          B.add(KIT.barBetween(corner(y, ax, az), corner(y, bx, bz), 0.3, 0.3), M.steel);
          B.add(KIT.barBetween(corner(prev, ax, az), corner(y, bx, bz), 0.16, 0.16), M.steel, { lod0: true });
          B.add(KIT.barBetween(corner(prev, bx, bz), corner(y, ax, az), 0.16, 0.16), M.steel, { lod0: true });
          B.add(KIT.ballGeo(0.42), M.ironBlack, P(...corner(y, ax, az)), { lod0: true });
        }
        if ((y / 7) % 2 < 1) A.lamp(B, [at(y) + 0.3, y, 0], [1, 0, 0], 0.16, 'lightCyan', { lod0: true, size: 0.9, pulse: 'flicker' });
        prev = y;
      }
      B.add(KIT.panelBox(2.8, 2.4, 2.8, { cols: 2, rows: 1 }), M.ironBlack, P(0, H + 1.2, 0));
      B.add(KIT.cylinder(0.25, 0.3, 2.6, 8), M.steel, P(0, H + 3.2, 0));
      const dish = geo('pylonDish', () => KIT.latheHard([[0, 0], [0.6, 0.05], [1.8, 0.35], [3.0, 0.95], [3.4, 1.25], [3.2, 1.3], [2.8, 1.05], [1.6, 0.5], [0.4, 0.22], [0, 0.2]], 20, { edgeLen: 0.3 }));
      B.add(dish, M.steel, P(0, H + 4.0, 0.4, -0.55, 0, 0));
      B.add(KIT.cylinder(0.08, 0.08, 2.0, 6), M.ironBlack, P(0, H + 5.0, -0.2, -0.55), { lod0: true });
      const lamp = A.part('lamp', [0, H + 6.4, 0]);
      lamp.add(KIT.cylinder(0.75, 0.75, 0.7, 10), M.lightRed, P(0, 0, 0));
      B.add(KIT.cylinder(0.85, 0.95, 0.3, 10), M.ironBlack, P(0, H + 5.9, 0));
      A.lamps.push({ pos: [0, H + 6.6, 0], color: '#ff2a1a', size: 4, pulse: 'beat', blink: true });
    },
    stateHooks: { destroyed: (inst, instant, ctx) => topple(inst, instant, ctx), intact: (inst) => untopple(inst) },
    animate: (inst, dt, ctx, rdt) => {
      const lamp = inst.root?.getObjectByName('lamp');
      if (lamp) lamp.visible = inst.state !== 'destroyed' && ((ctx.clock.time + (hashString(inst.id) % 100) / 100) % 1.2) < 0.25;
      animTopple(inst, dt, ctx);
    },
    glowsOn: st => st !== 'destroyed',
  },
  // ---------------------------------------------------------------- comm_array: platform, hut, slewing dishes
  comm_array: {
    params: { dishes: 3 }, states: ['intact', 'destroyed'], height: () => 12,
    footprint: p => rect(24, 24, { pad: 10 }),
    colliders: p => [box(22, 22, 1.4, { surface: 'concrete' }), box(6, 4.5, 4.6, { x: -6, z: 6.5 }),
                     ...dishSpots(p.dishes).map(([x, z]) => ({ type: 'circle', x, z, r: 1.4, top: 7 }))],
    hit: p => ({ center: [0, 5, 0], r: 10 }),
    build(A, p) {
      const { B, M, rng } = A;
      B.add(frustum(23, 23, 2.6, 0.97, 0.6), M.concrete, P(0, -1.2, 0));
      pad(B, M, rng, 23.4, 23.4, 1.6, 0.5, { min: 5, max: 8 });
      for (const s of [-1, 1]) { railing(B, M, [-11, 1.4, s * 11], [11, 1.4, s * 11]); railing(B, M, [s * 11, 1.4, -11], [s * 11, 1.4, 11]); }
      hazard(B, M, 22, 0.35, 0.25, [0, 1.25, -11.6]);
      B.add(KIT.panelBox(6, 3.4, 4.5, { cols: 2, rows: 1 }), M.ironBlack, P(-6, 3.1, 6.5));
      B.add(KIT.slab(6.6, 0.4, 5.1), M.concreteDark, P(-6, 4.95, 6.5));
      B.add(KIT.greeble('vent', 1.6, 1.0, 0.3), M.ironBlack, P(-6, 3.4, 4.2, 0, PI));
      B.add(KIT.cylinder(0.05, 0.03, 5, 6), M.ironBlack, P(-7.8, 7.5, 7.6), { lod0: true });
      dishSpots(p.dishes).forEach(([x, z], i) => {
        B.add(KIT.cylinder(0.9, 1.2, 5.2, 12), M.concrete, P(x, 3.9, z));
        B.add(KIT.ring(1.0, 0.3, 0.35), M.ironBlack, P(x, 6.5, z));
        B.add(KIT.pipeRun([[x, 1.6, z], [x * 0.5 - 3, 1.6, z * 0.5 + 3.2], [-6, 1.6, 4.2]], 0.12, { flangeEnds: false }), M.ironBlack, null, { lod0: true });
        const D = A.part('dish' + i, [x, 6.7, z], [0.5, rng() * PI * 2, 0]);
        dishInto(D, M, 3.4 + (i === 0 ? 0.6 : 0));
      });
    },
    animate: (inst, dt, ctx) => {
      if (!inst.root || inst.state === 'destroyed' || !dt) return;
      const t = ctx.clock.time, ph = (hashString(inst.id) % 628) / 100;
      for (let i = 0; i < 6; i++) {
        const d = inst.root.getObjectByName('dish' + i); if (!d) break;
        d.rotation.set(0.45 + 0.12 * Math.sin(t * 0.13 + i), ph + i * 2.1 + 0.6 * Math.sin(t * 0.07 + i * 1.7), 0, 'YXZ');
        d.updateMatrix();
      }
    },
  },
  // ---------------------------------------------------------------- tank_farm: ribbed tanks in a bund, pipes, ladders; burns when destroyed
  tank_farm: {
    params: { tanks: 4 }, states: ['intact', 'destroyed'], height: () => 14,
    footprint: p => { const [w, d] = farmSize(p.tanks); return rect(w + 6, d + 6, { pad: 12 }); },
    colliders: p => farmSpots(p.tanks).map(([x, z]) => ({ type: 'circle', x, z, r: 6.2, top: 14 })),
    hit: p => ({ center: [0, 6, 0], r: Math.max(...farmSize(p.tanks)) * 0.5 }),
    build(A, p) {
      const { B, M, rng } = A, [w, d] = farmSize(p.tanks);
      pad(B, M, rng, w + 2, d + 2, 0.35, 0.6, { min: 6, max: 9 });
      for (const s of [-1, 1]) { B.add(KIT.slab(w + 4, 1.6, 1.2), M.concreteDark, P(0, 0.6, s * (d / 2 + 2))); B.add(KIT.slab(1.2, 1.6, d + 4), M.concreteDark, P(s * (w / 2 + 2), 0.6, 0)); }
      const spots = farmSpots(p.tanks);
      spots.forEach(([x, z], i) => {
        tankInto(B, M, x, z, 6, 12.5, [M.oxide, M.steel, M.ironBlack][i % 3], rng);
        if (i > 0) { const [px, pz] = spots[i - 1]; B.add(KIT.pipeRun([[px, 1.4, pz + 6.6], [px, 1.4, pz + 8], [x, 1.4, pz + 8], [x, 1.4, z + 6.6]], 0.35), M.ironBlack, null, { lod0: true }); }
      });
      B.add(KIT.panelBox(3, 2.2, 2.4, { cols: 2, rows: 1 }), M.ironBlack, P(w / 2 - 1, 1.5, -d / 2 + 1));
      A.lamp(B, [w / 2 - 1, 3.3, -d / 2 - 0.4], [0, -0.3, -1], 0.3, 'lightSodium');
    },
    onRealise: (inst, ctx) => { if (inst.state === 'destroyed') burn(inst, ctx, 2); },
    onUnrealise: (inst) => stopFx(inst),
    stateHooks: { destroyed: (inst, instant, ctx) => { burn(inst, ctx, 2); } },
  },
  // ---------------------------------------------------------------- refinery: tanks, a process column, pipe racks, flare stack
  refinery: {
    params: { size: 60 }, states: ['intact', 'burning', 'destroyed'], height: () => 34,
    footprint: p => rect(p.size, p.size, { pad: 14 }),
    colliders: p => { const L = refLayout(p.size); return [...L.tanks.map(([x, z, r]) => ({ type: 'circle', x, z, r, top: 10 })), { type: 'circle', x: L.col[0], z: L.col[1], r: 2.6, top: 30 },
                                                                   { type: 'circle', x: L.flare[0], z: L.flare[1], r: 2.4, top: 34 }]; },
    hit: p => ({ center: [0, 8, 0], r: p.size * 0.45 }),
    build(A, p) {
      const { B, M, rng } = A, S = p.size, L = refLayout(S);
      pad(B, M, rng, S, S, 0.35, 0.6);
      L.tanks.forEach(([x, z, r], i) => tankInto(B, M, x, z, r, r * 1.7, [M.oxide, M.steel, M.ironBlack][i % 3], rng));
      // process column with platforms every 6 m and a ladder
      const [cx, cz] = L.col;
      B.add(geo('refColumn', () => KIT.latheHard([[0, 0], [2.6, 0], [2.6, 0.5], [2.2, 0.7], [2.2, 28], [1.6, 29.5], [0.6, 30.2], [0, 30.3]], 24, { edgeLen: 0.6 })), M.steelDark, P(cx, 0, cz));
      for (let y = 6; y < 29; y += 6) {
        B.add(KIT.ring(2.9, 1.4, 0.25, 24), M.ironBlack, P(cx, y, cz));
        for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; B.add(KIT.bar(1.1, 0.07, 0.07), M.ironBlack, P(cx + Math.sin(a) * 3.5, y + 0.6, cz + Math.cos(a) * 3.5, 0, 0, HALF, { lod0: true })); }
        B.add(KIT.ring(3.55, 0.08, 0.08, 24), M.ironBlack, P(cx, y + 1.1, cz), { lod0: true });
      }
      ladder(B, M, cx, 0.4, cz + 2.4, 29, 0);
      // pipe racks (Manhattan runs, mixed diameters, colours by duty)
      const [fx, fz] = L.flare;
      L.tanks.forEach(([x, z, r], i) => {
        B.add(KIT.pipeRun([[x, 2 + i * 0.6, z], [x, 5 + i * 0.6, z], [cx, 5 + i * 0.6, z], [cx, 5 + i * 0.6, cz - 3]], 0.25 + 0.12 * (i % 3), { support: { every: 9, groundY: 0.3 } }),
          i % 2 ? M.oxide : M.ironBlack, null, i > 1 ? { lod0: true } : undefined);
      });
      B.add(KIT.pipeRun([[cx, 24, cz], [cx, 24, fz], [fx, 24, fz], [fx, 30, fz]], 0.45, { support: { every: 12, groundY: 0.3 } }), M.oxide);
      // flare stack: lattice tower + stack + tip
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(KIT.barBetween([fx + sx * 2.4, 0.3, fz + sz * 2.4], [fx + sx * 0.8, 32, fz + sz * 0.8], 0.3, 0.3), M.ironBlack);
      for (let y = 4; y < 32; y += 5) { const k = lerp(2.4, 0.8, y / 32); B.add(KIT.ring(k * 1.42, 0.12, 0.2, 4).clone().rotateY(PI / 4), M.ironBlack, P(fx, y, fz), { lod0: true }); }
      B.add(KIT.cylinder(0.6, 0.7, 34, 12), M.steel, P(fx, 17, fz));
      B.add(KIT.cylinder(0.95, 0.75, 1.4, 12), M.ironBlack, P(fx, 34.4, fz));
      hazard(B, M, 3, 0.6, 0.3, [fx, 33, fz - 1.2]);
      for (const [x, z] of [[-S / 2 + 3, -S / 2 + 3], [S / 2 - 3, S / 2 - 3]]) {
        B.add(KIT.cylinder(0.15, 0.2, 7, 8), M.ironBlack, P(x, 3.5, z), { lod0: true });
        A.lamp(B, [x, 7.3, z], [0, -1, 0], 0.4, 'lightSodium');
      }
      // control hut with a door, window band, roof unit and lamp; a couple of containers by the gate
      const hx = -S * 0.06, hz = S * 0.32;
      B.add(KIT.panelBox(9, 4.2, 6, { cols: 3, rows: 1 }), M.ironBlack, P(hx, 2.45, hz));
      B.add(KIT.slab(9.8, 0.5, 6.8, { bevel: 0.15 }), M.concreteDark, P(hx, 4.8, hz));
      B.add(KIT.plateBox(6, 0.9, 0.25, 0.04), M.darkGlass, P(hx + 0.8, 3.1, hz - 3.08));
      hazard(B, M, 2.2, 0.35, 0.2, [hx - 3.2, 4.25, hz - 3.15]);
      B.add(KIT.panelBox(1.6, 2.6, 0.3, { cols: 1, rows: 2 }), M.oxide, P(hx - 3.2, 1.65, hz - 3.1));
      B.add(KIT.greeble('vent', 2.4, 1.4, 0.5), M.steelDark, P(hx + 1.5, 5.05, hz, -HALF));
      A.lamp(B, [hx - 3.2, 4.6, hz - 3.6], [0, -0.4, -1], 0.26, 'lightSodium');
      for (const [x, z, ry] of [[S * 0.38, S * 0.3, 0.03], [S * 0.38 - 5.1, S * 0.3 + 0.4, -0.04]]) container(B, M, ry > 0 ? M.oxide : M.steelDark, x, 0.35, z, HALF + ry);
      // horizontal heat exchangers on saddles
      for (let i = 0; i < 2; i++) {
        const z = -S * 0.32 + i * 3.4;
        B.add(KIT.cylinder(1.2, 1.2, 9, 16), M.steel, P(S * 0.3, 2.2, z, 0, 0, HALF));
        for (const k of [-3.2, 0, 3.2]) B.add(KIT.ring(1.24, 0.12, 0.28, 16), M.ironBlack, P(S * 0.3 + k, 2.2, z, 0, 0, HALF), { lod0: true });
        for (const s of [-1, 1]) B.add(KIT.slab(0.6, 1.4, 2.6), M.ironBlack, P(S * 0.3 + s * 3, 0.9, z));
      }
    },
    onRealise: (inst, ctx) => refineryFx(inst, ctx),
    onUnrealise: (inst) => stopFx(inst),
    stateHooks: { intact: (i, n, ctx) => refineryFx(i, ctx), burning: (i, n, ctx) => refineryFx(i, ctx), destroyed: null },
  },
  // ---------------------------------------------------------------- hangar: walkable interior, arched roof on ribs, sliding doors
  hangar: {
    params: { w: 60, d: 40, h: 22 }, states: ['closed', 'open'], height: p => p.h,
    footprint: p => rect(p.w + 4, p.d + 4, { pad: 14 }),
    colliders: p => [box(2.4, p.d, p.h, { x: -(p.w / 2 - 1.2) }), box(2.4, p.d, p.h, { x: p.w / 2 - 1.2 }), box(p.w, 2.4, p.h, { z: p.d / 2 - 1.2 }),
                     box(p.w, p.d, p.h + 8, { bottom: p.h - 0.5 }), box(p.w - 4.8, 1.6, p.h - 3, { z: -(p.d / 2 - 1.0), tag: 'door' })],
    anchors: p => ({ door: [0, 0, -p.d / 2] }),
    hit: p => ({ center: [0, p.h / 2, 0], r: p.w * 0.5 }),
    build(A, p) {
      const { B, M, rng } = A, W = p.w, D = p.d, H = p.h;
      B.add(KIT.slab(W + 2, 0.8, D + 2, { bevel: 0.25 }), M.concreteDark, P(0, -0.2, 0));
      // side walls (along z) and back wall (along x)
      for (const s of [-1, 1]) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(s * (W / 2 - 1.2), 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, HALF, 0)), new THREE.Vector3(1, 1, 1));
        panelWall(B.under(m), M, rng, D, H - 1, 2.4, { faces: [s], colMin: 3.5, colMax: 5.5, rowMin: 3, rowMax: 4.5 });
      }
      panelWall(B.under(new THREE.Matrix4().makeTranslation(0, 0, D / 2 - 1.2)), M, rng, W - 4.8, H - 1, 2.4, { faces: [1], colMin: 3.5, colMax: 5.5, rowMin: 3, rowMax: 4.5 });
      // ribs (arched) every 8 m and roof plates following the arch
      const pts = []; for (let k = 0; k <= 8; k++) { const u = -1 + 2 * k / 8; pts.push([u * W / 2, H - 0.6 + (1 - u * u) * W * 0.18]); }
      for (let z = -D / 2 + 1; z <= D / 2 - 1; z += 8) {
        for (let k = 0; k < 8; k++) B.add(KIT.barBetween([pts[k][0], pts[k][1], z], [pts[k + 1][0], pts[k + 1][1], z], 0.6, 0.9), M.steelDark);
        for (const s of [-1, 1]) B.add(KIT.slab(1.6, H, 1.6, { taper: 0.8 }), M.concreteDark, P(s * (W / 2 - 0.4), H / 2, z));
      }
      for (let k = 0; k < 8; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
        B.add(KIT.ribbedPlate(len + 0.2, D + 1.4, 0.35, { pitch: 1.6 }), M.rust, P(mx, my + 0.55, 0, -HALF, 0, a, { order: 'ZXY', tint: 0.07 }));
      }
      // gable walls under the arch, front and back: a plate following the roof line, stiffeners and a louvre
      const gable = [[-W / 2 + 0.6, H - 1.2], [W / 2 - 0.6, H - 1.2], ...pts.slice().reverse().map(([x, y], i, arr) => [x * (W / 2 - 0.6) / (W / 2), y + 0.4])];
      for (const [gz, face] of [[-D / 2 + 0.9, -1], [D / 2 - 0.9, 1]]) {
        B.add(KIT.plateGeo(gable, 0.5, 'front', 0.12), M.concreteDark, P(0, 0, gz, 0, 0, 0, { tint: 0.05 }));
        for (const u of [-0.5, 0, 0.5]) {
          const top = H - 0.6 + (1 - u * u) * W * 0.18;
          B.add(KIT.bar(top - H + 1.2, 0.5, 0.4), M.steelDark, P(u * W / 2, (top + H - 1.2) / 2, gz + face * 0.45, 0, 0, HALF));
        }
        B.add(KIT.greeble('vent', 4.2, 2.2, 0.4), M.ironBlack, P(0, H + W * 0.09, gz + face * 0.4, 0, face > 0 ? 0 : PI, 0));
        B.add(KIT.bar(W - 1.2, 0.6, 0.5), M.steelDark, P(0, H - 1.0, gz + face * 0.45));
      }
      // front: door frame, lintel truss, lamps; the door leaves slide sideways
      for (const s of [-1, 1]) B.add(KIT.slab(2.6, H, 3, { taper: 0.88 }), M.concrete, P(s * (W / 2 - 1.3), H / 2, -D / 2 + 1.2));
      B.add(KIT.truss(W, 2, 3, Math.round(W / 4), 0.36), M.steelDark, P(0, H - 3.2, -D / 2 + 1.2));
      hazard(B, M, W - 5, 0.8, 0.3, [0, H - 3.6, -D / 2 - 0.1]);
      for (const x of [-W / 4, 0, W / 4]) A.lamp(B, [x, H - 1.2, -D / 2 - 0.6], [0, -1, -0.6], 0.5, 'lightSodium');
      for (const s of [-1, 1]) {
        const dw = (W - 5.2) / 2;
        const Dp = A.part(s < 0 ? 'doorL' : 'doorR', [s * dw / 2, 0, -D / 2 + 1.0]);
        Dp.add(KIT.panelBox(dw, H - 3.6, 1.2, { cols: 3, rows: 3, inset: 0.08 }), M.ironBlack, P(0, (H - 3.6) / 2, 0));
        Dp.add(KIT.bar(dw * 0.96, 0.4, 0.5), M.ironBlack, P(0, 1.2, -0.75));
      }
    },
    stateHooks: {
      closed: (inst, instant) => slideDoors(inst, 0, instant),
      open: (inst, instant) => slideDoors(inst, (inst.params.w - 5.2) / 2 * 0.92, instant),
    },
    animate: (inst, dt) => animParts(inst, dt),
  },
  // ---------------------------------------------------------------- landing pad: octagonal pad, markings, edge lights (lit state)
  landing_pad: {
    params: { r: 30 }, states: ['idle', 'lit'], height: () => 1,
    footprint: p => ({ shape: 'circle', r: p.r + 2, flatten: true, pad: 12, exclude: 3, h: 'auto' }),
    colliders: p => [{ type: 'circle', x: 0, z: 0, r: p.r, top: 0.45 }],
    colliderEnabled: () => true,
    build(A, p) {
      const { B, M } = A, R = p.r;
      B.add(KIT.cylinder(R, R + 1.2, 1.6, 8, 0.4), M.concrete, P(0, -0.35, 0, 0, PI / 8));
      B.add(KIT.ring(R - 0.6, 1.0, 0.25, 8).clone().rotateY(PI / 8), M.concreteDark, P(0, 0.48, 0));
      B.add(KIT.ring(R * 0.62, 0.9, 0.12, 48), M.stripe, P(0, 0.47, 0));
      for (const x of [-R * 0.22, R * 0.22]) B.add(KIT.plateBox(R * 0.09, 0.1, R * 0.5, 0.03), M.stripe, P(x, 0.47, 0));
      B.add(KIT.plateBox(R * 0.44, 0.1, R * 0.09, 0.03), M.stripe, P(0, 0.47, 0));
      for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; B.add(KIT.plateBox(1.6, 0.12, 0.6, 0.04), M.concreteDark, P(Math.sin(a) * R * 0.8, 0.47, Math.cos(a) * R * 0.8, 0, a)); }
      const Lt = A.part('lights');
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * PI * 2, x = Math.sin(a) * (R - 0.9), z = Math.cos(a) * (R - 0.9);
        B.add(KIT.cylinder(0.32, 0.38, 0.3, 8), M.ironBlack, P(x, 0.62, z));
        B.add(KIT.cylinder(0.24, 0.24, 0.06, 8), M.dark, P(x, 0.78, z));
        Lt.add(KIT.cylinder(0.24, 0.24, 0.08, 8), M.lightWhite, P(x, 0.8, z));
      }
      for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) { B.add(KIT.cylinder(0.12, 0.16, 1.4, 6), M.ironBlack, P(s * 2.2, 0.7, -R - k * 4), { lod0: true }); }
    },
    stateHooks: { idle: (inst) => setPartVisible(inst, 'lights', false), lit: (inst) => setPartVisible(inst, 'lights', true) },
  },
  // ---------------------------------------------------------------- container stack: mech-scale corrugated containers
  container_stack: {
    params: { n: 3, layers: 2 }, states: [], height: p => 5 * p.layers,
    footprint: p => rect(13, 5 * p.n + 1, { pad: 6 }),
    colliders: p => [box(12.4, 5 * p.n, 5 * p.layers)],
    build(A, p) {
      const { B, M, rng } = A;
      const pal = [M.rust, M.oxide, M.paintWake, M.steelDark];
      for (let l = 0; l < p.layers; l++) for (let i = 0; i < p.n; i++) {
        if (l > 0 && rng() < 0.18) continue;
        container(B, M, pal[Math.floor(rng() * pal.length)], (rng() - 0.5) * 0.5, l * 5.05, -((p.n - 1) * 5) / 2 + i * 5 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.06);
      }
    },
  },
  // ---------------------------------------------------------------- barricade: Wake salvage, skewed plates, drums, a rig door, canvas
  barricade: {
    params: { length: 20 }, states: ['intact', 'destroyed'], height: () => 4,
    footprint: p => rect(p.length + 2, 5, { pad: 5 }),
    colliders: p => [box(p.length, 2.6, 3.6)],
    hit: p => ({ center: [0, 2, 0], r: p.length * 0.5 }),
    // Wake salvage (AD §2.15): mismatched plates leaned at 5–15° skews, each in its own frame with a patch, painted
    // stripes and bolts on some; struts behind; a canvas tarp hanging over one bay; drums and a rig door at the foot
    build(A, p) {
      const { B, M, rng } = A, L = p.length;
      const paints = [M.rust, M.paintWake, M.paintWakeRed];
      let x = -L / 2, bay = 0;
      const tarpAt = Math.floor(rng() * 3) + 1, ONE = new THREE.Vector3(1, 1, 1);
      while (x < L / 2 - 1) {
        const w = lerp(2.2, 4.2, rng()), h = lerp(2.8, 4.2, rng());
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x + w / 2, h / 2 - 0.2, (rng() - 0.5) * 0.6),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1 - rng() * 0.15, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.25)), ONE);
        const V = B.under(m), mat = paints[Math.floor(rng() * 3)];
        // the proud layer faces −z (the front)
        V.add(KIT.armourPlate(KIT.chamfer(KIT.rect(w, h), [0.2, 0.2, rng() * 0.8, rng() * 0.8]), 0.18), mat, P(0, 0, 0, 0, PI, 0, { tint: 0.1 }));
        const face = -0.23;
        if (rng() < 0.45) V.add(KIT.plateBox(r2(w * 0.8), 0.3, 0.05, 0.01), M.canvas, P(0, (rng() - 0.5) * h * 0.3, face, 0, 0, (rng() < 0.5 ? -1 : 1) * 0.55, { tint: 0.08 }));   // painted band
        if (rng() < 0.55) {   // a riveted patch plate
          const pw = r2(w * lerp(0.25, 0.4, rng())), ph = r2(h * lerp(0.2, 0.35, rng())), px = (rng() - 0.5) * w * 0.4, py = (rng() - 0.5) * h * 0.4;
          V.add(KIT.plateBox(pw, ph, 0.07, 0.02), rng() < 0.5 ? M.steelDark : M.rust, P(px, py, face + 0.02, 0, 0, (rng() - 0.5) * 0.3));
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) V.add(KIT.cylinder(0.07, 0.08, 0.06, 6), M.ironBlack, P(px + sx * (pw / 2 - 0.12), py + sy * (ph / 2 - 0.12), face - 0.03, HALF), { lod0: true });
        }
        B.add(KIT.barBetween([x + w / 2, h * 0.7, 0.2], [x + w / 2 + (rng() - 0.5), 0, 1.8], 0.14, 0.14), M.ironBlack, { lod0: true });
        if (bay === tarpAt) {   // canvas tarp over this bay: two sheets bellied outward, laced at the top
          const tw = w * 1.3, top = h - 0.5;
          B.add(KIT.plateBox(r2(tw), r2(top * 0.55), 0.06, 0.02), M.canvas, P(x + w / 2, top - top * 0.27, -0.55, -0.22, 0, 0.03, { tint: 0.1 }));
          B.add(KIT.plateBox(r2(tw * 0.96), r2(top * 0.5), 0.06, 0.02), M.canvas, P(x + w / 2, top * 0.25 + 0.1, -0.62, 0.16, 0, -0.02, { tint: 0.1 }));
          B.add(KIT.bar(r2(tw + 0.3), 0.1, 0.1), M.ironBlack, P(x + w / 2, top + 0.02, -0.4), { lod0: true });
        }
        x += w * lerp(0.8, 0.95, rng()); bay++;
      }
      for (let i = 0; i < Math.round(L / 6); i++) {   // drums behind, and a cluster of two in front
        const dx = (rng() - 0.5) * L * 0.8;
        B.add(KIT.drum(0.55, 1.5, 2), paints[i % 3], P(dx, 0, 1.4 + rng() * 0.6, 0, rng() * 6, 0, { tint: 0.1 }));
      }
      for (let i = 0; i < 2; i++) B.add(KIT.drum(0.55, 1.5, 2), paints[(i + 1) % 3], P(L * 0.22 + i * 1.15, 0, -1.3 - (i % 2) * 0.4, 0, rng() * 6, 0, { tint: 0.1 }));
      B.add(KIT.drum(0.55, 1.5, 2), M.rust, P(L * 0.22 + 0.6, 0.55, -2.2, HALF, rng(), 0, { tint: 0.1 }));   // one on its side
      B.add(KIT.panelBox(2.4, 3.2, 0.3, { cols: 1, rows: 2 }), M.paintWake, P(-L * 0.18, 1.1, -0.9, 0.5, 0.3, 1.2));   // a rig door
      for (let i = 0; i < 2; i++) tankTrap(B, M, -L / 2 + 2 + i * (L - 4), 1.8, rng);
    },
  },
  // ---------------------------------------------------------------- outpost: walls, bunker, towers, containers, a gap with a barricade
  outpost: {
    params: { size: 80 }, states: [], height: () => 26,
    footprint: p => rect(p.size, p.size, { pad: 14 }),
    colliders: p => outpostParts(p.size).flatMap(([type, x, z, yaw, params]) => moveColliders(CATALOG[type].colliders({ ...CATALOG[type].params, ...params }), x, z, yaw)),
    lod1Budget: 6000,
    build(A, p) {
      for (const [type, x, z, yaw, params] of outpostParts(p.size)) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
        CATALOG[type].build(subApi(A, m), { ...CATALOG[type].params, ...params });
      }
    },
  },
  // ---------------------------------------------------------------- ruin_block: decayed building with floors, window bays, rebar, rubble mound
  ruin_block: {
    params: { w: 30, d: 30, h: 40, decay: 0.5 }, states: [], height: p => p.h,
    footprint: p => rect(p.w + 6, p.d + 6, { pad: 12 }),
    colliders: p => [box(p.w, p.d, p.h * (1 - p.decay * 0.45))],
    build(A, p) {
      const { B, M, rng } = A, { w, d, h, decay } = p;
      B.add(frustum(w + 2, d + 2, 2.4, 0.97), M.concreteDark, P(0, -1.6, 0));
      const floor = 4.2;
      for (const face of [0, 1, 2, 3]) {
        const len = face % 2 ? d : w, m = new THREE.Matrix4().compose(new THREE.Vector3(...[[0, 0, -d / 2], [w / 2, 0, 0], [0, 0, d / 2], [-w / 2, 0, 0]][face]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, [0, -HALF, PI, HALF][face], 0)), new THREE.Vector3(1, 1, 1));
        const V = B.under(m);
        const cols = KIT.split(len, rng, 4.5, 6.5);
        let x = -len / 2;
        for (const cw of cols) {
          const top = h * (1 - decay * Math.pow(rng(), 0.6)) ;
          for (let y = 0; y < top - 0.5; y += floor) {
            const fh = Math.min(floor, top - y);
            const win = fh > 3 && rng() > 0.2;
            V.add(KIT.plateGeo(KIT.chamferRect(cw - 0.25, fh - 0.25, 0.12), 0.6, 'front', 0.1, win ? { holes: [KIT.chamferRect(cw * 0.5, fh * 0.48, 0.1, 0, 0.2)] } : undefined),
              M.concrete, P(x + cw / 2, y + fh / 2, 0, 0, 0, 0, { tint: 0.07 }));
            if (win) V.add(KIT.plateBox(cw * 0.52, fh * 0.5, 0.2, 0.03), M.dark, P(x + cw / 2, y + fh / 2 + 0.2, 1.0));
          }
          if (top < h * 0.98) for (let k = 0; k < 3; k++) V.add(KIT.bar(1.2 + rng() * 1.5, 0.07, 0.07), M.rust, P(x + cw * (0.2 + k * 0.3), top + 0.5, 0.1, 0, 0, HALF + (rng() - 0.5) * 0.6, { lod0: true }));
          V.add(KIT.slab(0.9, top, 1.0), M.concreteDark, P(x, top / 2, -0.25));
          x += cw;
        }
      }
      // floors: cast slabs with joints; the upper floors lose slabs and the edges sag (no 30 m plain lid on top)
      const top = h * (1 - decay * 0.6);
      for (let y = floor; y < top; y += floor) {
        const upper = (y / top), cols = KIT.split(w - 0.6, rng, 4.5, 7), rows = KIT.split(d - 0.6, rng, 4.5, 7);
        B.add(KIT.slab(w - 0.6, 0.5, d - 0.6), M.concreteDark, P(0, y, 0, 0, 0, 0, { lod1: true }));
        let x = -(w - 0.6) / 2;
        for (const cw of cols) {
          let z = -(d - 0.6) / 2;
          for (const cd of rows) {
            const gone = upper > 0.55 && rng() < decay * 0.5 * upper;
            if (!gone) {
              const sag = upper > 0.5 && rng() < decay * 0.4 ? (rng() - 0.5) * 0.12 : 0;
              B.add(KIT.slab(r2(cw - 0.12), 0.5, r2(cd - 0.12), { bevel: 0.08 }), M.concreteDark, P(x + cw / 2, y - Math.abs(sag) * 3, z + cd / 2, sag, 0, sag * 0.7, { tint: 0.06, lod0: true }));
            } else for (let k = 0; k < 2; k++) B.add(KIT.bar(r2(cw * 0.8), 0.06, 0.06), M.rust, P(x + cw / 2, y, z + cd * (0.3 + k * 0.4), 0, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.2, { lod0: true }));   // exposed rebar
            z += cd;
          }
          x += cw;
        }
      }
      for (let i = 0; i < 8; i++) B.add(KIT.rockGeo(300 + i, { cuts: 9, noise: 0.07, squash: 0.6 }), rng() < 0.5 ? M.concrete : M.concreteDark,
        { pos: [(rng() - 0.5) * (w + 8), 0.4, (rng() < 0.5 ? -1 : 1) * (d / 2 + 1.5 + rng() * 3)], rot: [rng(), rng() * 6, rng()], scale: 1.2 + rng() * 2.4 });
    },
  },
  // ---------------------------------------------------------------- monolith: the prototype's slabs, upgraded (Founders, weathered)
  monolith: {
    params: { w: 8, h: 30 }, states: [], height: p => p.h,
    footprint: p => rect(p.w + 6, p.w * 0.45 + 6, { pad: 8 }),
    colliders: p => [box(p.w, p.w * 0.5, p.h)],
    // the prototype slab, upgraded: a battered ceramic blade on a stepped plinth, sheared at the top, its face plates
    // separated by dim cyan Founders seams, a gold inlay and fallen shards at the foot
    build(A, p) {
      const { B, M, rng } = A, { w, h } = p, t = w * 0.45, hc = h * 0.9;
      B.add(frustum(w + 3, t + 3, 3, 0.86, 0.5), M.concreteDark, P(0, -1.4, 0));
      B.add(frustum(w + 1.2, t + 1.2, 1.2, 0.92, 0.3), M.concreteDark, P(0, 1.0, 0));
      B.add(KIT.slab(w, hc, t, { taper: 0.86, chamfer: [0.3, 0.3, w * 0.18, w * 0.18], bevel: 0.25 }), M.ceramicAged, P(0, hc / 2 + 1.6, 0));
      // the sheared crown: a tilted wedge of the same section, slipped sideways
      B.add(KIT.slab(w * 0.86, h * 0.12, t * 0.86, { taper: 0.82, chamfer: [0.2, 0.2, w * 0.14, w * 0.14], bevel: 0.2 }), M.ceramicAged, P(w * 0.08, hc + 1.6 + h * 0.055, 0.1, 0.04, 0.12, -0.2));
      for (const s of [-1, 1]) {
        let y = 3.2;
        while (y < hc - 2) {
          const ph = Math.min(lerp(3, 6, rng()), hc - 1 - y), k = 1 - (y + ph / 2) / h * 0.14;
          if (ph < 1.2) break;
          B.add(KIT.armourPlate(KIT.round(KIT.rect(w * 0.72 * k, ph - 0.45), 0.3, 2), 0.25), M.ceramicAged, P(0, y + ph / 2, s * (t / 2 + 0.04), 0, s < 0 ? PI : 0, 0, { tint: 0.08 }));
          B.add(KIT.bar(w * 0.6 * k, 0.09, 0.1), M.lightCyan, P(0, y + ph - 0.02, s * (t / 2 + 0.06)));   // seam
          y += ph;
        }
        B.add(KIT.plateBox(0.14, hc * 0.8, 0.1, 0.02), M.gold, P(w * 0.3, hc * 0.45 + 1.6, s * (t / 2 + 0.07)));
      }
      for (let i = 0; i < 6; i++) B.add(KIT.rockGeo(800 + i, { cuts: 8, noise: 0.05 }), M.ceramicAged,
        { pos: [(rng() - 0.5) * w * 2, 0.3, (rng() < 0.5 ? -1 : 1) * (t * 0.8 + rng() * t)], rot: [rng(), rng() * 6, rng()], scale: 0.5 + rng() * 1.1 });
    },
  },
  // ---------------------------------------------------------------- pipeline: main pipe and two runs on portal supports; bursts
  pipeline: {
    params: { length: 200, h: 6 }, states: ['intact', 'burst'], height: p => p.h,
    footprint: p => rect(p.length, 6, { flatten: false, pad: 6, exclude: 3 }),
    colliders: p => { const out = [box(p.length, 3.2, p.h + 1.4, { bottom: p.h - 1.4, surface: 'metal' })];
                      for (let x = -p.length / 2 + 6; x < p.length / 2; x += 12) for (const s of [-1, 1]) out.push({ type: 'circle', x, z: s * 2.2, r: 0.5, top: p.h }); return out; },
    colliderEnabled: () => true,
    build(A, p) {
      const { B, M } = A, L = p.length, H = p.h;
      B.add(KIT.pipeRun([[-L / 2, H, 0], [L / 2, H, 0]], 1.3, { flangeEvery: 12, radial: 20 }), M.oxide);
      B.add(KIT.pipeRun([[-L / 2, H + 0.4, 2.0], [L / 2, H + 0.4, 2.0]], 0.42, { flangeEvery: 12 }), M.steel, null, { lod0: true });
      B.add(KIT.pipeRun([[-L / 2, H - 0.4, -2.0], [L / 2, H - 0.4, -2.0]], 0.32, { flangeEvery: 24 }), M.ironBlack, null, { lod0: true });
      for (let x = -L / 2 + 6; x < L / 2; x += 12) {
        for (const s of [-1, 1]) {
          B.add(KIT.slab(0.7, H - 1.1, 0.7, { taper: 0.85 }), M.ironBlack, P(x, (H - 1.1) / 2, s * 2.2));
          B.add(frustum(1.6, 1.6, 1.2, 0.8, 0.2), M.concreteDark, P(x, -0.6, s * 2.2));
        }
        B.add(KIT.slab(0.8, 0.6, 5.6), M.ironBlack, P(x, H - 1.3, 0));
        B.add(KIT.plateBox(0.6, 0.5, 2.4, 0.06), M.ironBlack, P(x, H - 1.05, 0), { lod0: true });
      }
      for (let x = -L / 2 + 25; x < L / 2; x += 50) {
        B.add(KIT.drum(1.6, 2.2, 1, 16), M.ironBlack, P(x, H, 0, 0, 0, HALF));
        B.add(KIT.ring(0.8, 0.12, 0.15, 16), M.stripe, P(x, H + 2.2, 0));
        for (let k = 0; k < 4; k++) B.add(KIT.bar(1.5, 0.08, 0.08), M.stripe, P(x, H + 2.2, 0, 0, k * PI / 4, 0), { lod0: true });
        B.add(KIT.cylinder(0.2, 0.2, 1.2, 8), M.ironBlack, P(x, H + 1.6, 0));
        for (const s of [-1, 1]) B.add(KIT.ring(1.36, 0.15, 0.8, 24).clone().rotateZ(HALF), M.stripe, P(x + s * 4, H, 0));
      }
      const burst = A.part('burst', [L * 0.1, H, 0]);
      for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; burst.add(KIT.plateBox(1.1, 0.12, 0.9, 0.03), M.dark, P(0.6, Math.sin(a) * 1.5, Math.cos(a) * 1.5, a + 0.6, 0.8, 0)); }
      burst.add(KIT.cylinder(1.36, 1.36, 1.6, 20), M.dark, P(0, 0, 0, 0, 0, HALF));
    },
    stateHooks: {
      intact: (inst) => { setPartVisible(inst, 'burst', false); stopFx(inst); },
      burst: (inst, instant, ctx) => { setPartVisible(inst, 'burst', true); burstFx(inst, ctx); },
    },
    onRealise: (inst, ctx) => { if (inst.state === 'burst') burstFx(inst, ctx); },
    onUnrealise: (inst) => stopFx(inst),
  },
  // ---------------------------------------------------------------- crashed_ship: set piece hull with frames, plating seams, breaches
  crashed_ship: {
    params: { length: 300 }, states: [], height: p => p.length * 0.09,
    footprint: p => rect(p.length * 0.2, p.length * 1.04, { flatten: false, pad: 20, exclude: 10 }),
    colliders: p => { const L = p.length, out = []; for (let i = 0; i < 6; i++) { const z = -L / 2 + L * (i + 0.5) / 6; out.push({ type: 'obox', x: i < 3 ? L * 0.01 * (3 - i) : 0, z, hw: L * 0.07, hd: L / 12, yaw: i < 3 ? 0.16 : 0, top: L * 0.075 * (i === 0 ? 0.35 : i === 5 ? 0.7 : 1) }); } return out; },
    lod1Budget: 15000,
    // a bulk carrier broken in two: the stern settled and listing, the bow torn off, yawed away and nosed into the ground
    build(A, p) {
      const { B, M, rng } = A, L = p.length, W = L * 0.13, Hh = L * 0.095;
      const N = 28, iB = 15, secs = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, z = -L / 2 + u * L;
        const bow = Math.min(1, u / 0.2), stern = Math.min(1, (1 - u) / 0.07);
        const k = Math.sqrt(Math.max(0.05, Math.min(bow, stern)));
        const w = W * (0.22 + 0.78 * k), h = Hh * (0.55 + 0.45 * k) + (1 - bow) * Hh * 0.18;
        const cy = h * 0.5 - Hh * 0.3;
        secs.push({ z, pts: KIT.round(KIT.rect(w, h, 0, cy), [w * 0.3, w * 0.3, w * 0.06, w * 0.06], 2), w, h, top: cy + h / 2 });
      }
      const zb = secs[iB].z;
      const mStern = new THREE.Matrix4().compose(new THREE.Vector3(0, -Hh * 0.2, L * 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.025, 0, 0.13)), new THREE.Vector3(1, 1, 1));
      const mBow = new THREE.Matrix4().makeTranslation(L * 0.05, -Hh * 0.12, zb - L * 0.06)
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.075, 0.16, -0.09)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, -zb));
      const piece = (V, list, key, breakAt) => {
        // the hull core is dark (it shows in the plating seams and where plates are gone); LOD1 gets the painted hull
        const core = geo(`shipHull|${L}|${key}`, () => KIT.loft(list.map(s => ({ z: s.z, pts: s.pts }))));
        V.add(core, M.ironBlack, { lod0: true });
        V.add(core, M.oxide, { lod1: true });
        const q = list[0].pts.length;
        // frames (every section): ribs that sit in the plating seams
        list.forEach((s, i) => {
          if (i === 0 || i === list.length - 1) return;
          for (let j = 0; j < q; j += 2) V.add(KIT.barBetween([s.pts[j][0] * 1.01, s.pts[j][1], s.z], [s.pts[(j + 2) % q][0] * 1.01, s.pts[(j + 2) % q][1], s.z], 0.45, 0.4), M.ceramicAged, { lod0: i % 2 === 1 });
        });
        // hull plating (AD §2.6): strakes of bevelled plates that follow the section outline, a seam at every frame and
        // between strakes; the boot-top band below the sheer line is black iron, the topsides oxide; ~7% of plates gone
        const cyOf = (s) => s.top - s.h / 2;
        for (let i = 0; i < list.length - 1; i++) {
          const a = list[i], b = list[i + 1], zA = a.z + 0.4, zB = b.z - 0.4;
          const nzs = zB - zA < 1.5 ? 0 : Math.max(1, Math.round((zB - zA) / 6));
          for (let j = 0; j < q; j++) {
            const j1 = (j + 1) % q, A0 = a.pts[j], A1 = a.pts[j1], B0 = b.pts[j], B1 = b.pts[j1];
            const ex = A1[0] - A0[0], ey = A1[1] - A0[1], el = Math.hypot(ex, ey);
            if (el < 0.8) continue;
            const ny = -ex / el;                         // outward normal's y for a counter-clockwise outline
            if (ny > 0.75 || ny < -0.75) continue;       // the deck (plated below) and the buried bottom
            if (Math.max(A0[1], A1[1]) < -Hh * 0.25) continue;
            const n = Math.max(1, Math.round(el / 6.5));
            for (let k = 0; k < n; k++) for (let m = 0; m < nzs; m++) {
              if (rng() < 0.07) continue;
              const t0 = k / n + 0.25 / el, t1 = (k + 1) / n - 0.25 / el;
              // corners on the hull surface: girth fraction t (between outline points j, j1), length fraction u (a → b)
              const at = (t, u) => {
                const xa = A0[0] + (A1[0] - A0[0]) * t, ya = A0[1] + (A1[1] - A0[1]) * t, xb = B0[0] + (B1[0] - B0[0]) * t, yb = B0[1] + (B1[1] - B0[1]) * t;
                const w = (zA + (zB - zA) * u - a.z) / (b.z - a.z);
                return [xa + (xb - xa) * w, ya + (yb - ya) * w, zA + (zB - zA) * u];
              };
              const u0 = m / nzs + (m ? 0.2 / (zB - zA) : 0), u1 = (m + 1) / nzs - (m < nzs - 1 ? 0.2 / (zB - zA) : 0);
              const p0 = at(t0, u0), p1 = at(t1, u0), p2 = at(t1, u1), p3 = at(t0, u1);
              const low = (p0[1] + p1[1]) / 2 < cyOf(a) - a.h * 0.12;
              V.add(KIT.quadPlate(p0, p1, p2, p3, 0.55, 0.18), low ? M.ironBlack : M.oxide, { tint: 0.09, lod0: true });
            }
          }
          // deck plating and hatch covers (one in four hatches gone)
          const dw = Math.min(a.w, b.w) * 0.86, top = Math.min(a.top, b.top), dz = b.z - a.z;
          V.add(KIT.plateBox(dw, 0.35, dz - 0.3, 0.06), M.steelDark, P(0, top + 0.12, (a.z + b.z) / 2, 0, 0, 0, { tint: 0.05 }));
          if (i % 2 === 0 && dw > W * 0.6) {
            const open = rng() < 0.25;
            if (open) V.add(KIT.plateBox(dw * 0.55, 0.4, dz * 0.7, 0.05), M.dark, P(0, top + 0.32, (a.z + b.z) / 2));
            else V.add(KIT.panelBox(dw * 0.6, 1.4, dz * 0.74, { cols: 3, rows: 1, inset: 0.06 }), M.steelDark, P(0, top + 0.95, (a.z + b.z) / 2, 0, 0, (rng() - 0.5) * 0.04));
          }
        }
        // the break: dark interior inside the cap, ragged frames and torn plating
        const e = breakAt === 'end' ? list[list.length - 1] : list[0], dir = breakAt === 'end' ? 1 : -1;
        const ec = e.top - e.h / 2;
        V.add(KIT.plateGeo(e.pts.map(([x, y]) => [x * 0.92, (y - ec) * 0.92 + ec]), 0.4, 'front', 0.05), M.dark, P(0, 0, e.z + dir * 0.25));
        for (let j = 0; j < q; j++) {
          const len = lerp(1.5, 9, rng()), [x, y] = e.pts[j];
          V.add(KIT.barBetween([x, y, e.z], [x * (1 + (rng() - 0.5) * 0.25), y + (rng() - 0.6) * 3, e.z + dir * len], 0.5, 0.45), M.rust);
          if (rng() < 0.55) V.add(KIT.plateBox(lerp(3, 7, rng()), 0.25, lerp(2, 6, rng()), 0.05), M.oxide,
            P(x * 1.02, y, e.z + dir * lerp(1, 4, rng()), (rng() - 0.5) * 0.9, (rng() - 0.5) * 0.6, (rng() - 0.5) * 1.2));
        }
        for (const s2 of [-1, 1]) V.add(KIT.bar(e.h * 0.9, 0.9, 0.9), M.rust, P(s2 * e.w * 0.25, e.top - e.h * 0.45, e.z + dir * 0.6, 0, 0, HALF));
        // hull breaches (AD §2.11): a torn hole in the side plating showing the dark hold, exposed frames across it and
        // plates peeled back around the rim
        for (let b = 0; b < 2; b++) {
          const sec = list[1 + Math.floor(rng() * (list.length - 2))], sd = rng() < 0.5 ? -1 : 1;
          const ylo = sec.top - sec.h + sec.w * 0.3, yhi = sec.top - sec.w * 0.06;
          if (yhi - ylo < 6) continue;
          const bw = lerp(9, 15, rng()), bh = Math.min(lerp(5, 8, rng()), (yhi - ylo) * 0.8), yc = lerp(ylo + bh / 2, yhi - bh / 2, rng()), x = sd * (sec.w / 2 + 0.15);
          const hole = [];
          for (let k = 0; k < 14; k++) { const a = k / 14 * PI * 2, rr = lerp(0.72, 1.0, rng()); hole.push([Math.cos(a) * bw / 2 * rr, Math.sin(a) * bh / 2 * rr]); }
          V.add(KIT.plateGeo(hole.map(([a, c]) => [r2(a), r2(c)]), 0.5, 'side', 0.05), M.dark, P(x, yc, sec.z));
          for (let f = -bw / 2 + 2; f < bw / 2 - 1; f += 3) V.add(KIT.barBetween([x + sd * 0.25, yc - bh * 0.42, sec.z + f], [x + sd * 0.25, yc + bh * 0.42, sec.z + f], 0.45, 0.55), M.rust);
          for (let k = 0; k < 4; k++) {
            const a = rng() * PI * 2;
            V.add(KIT.plateBox(lerp(2.5, 4.5, rng()), 0.22, lerp(1.5, 3, rng()), 0.05), M.oxide,
              P(x + sd * 0.8, yc + Math.sin(a) * bh * 0.5, sec.z + Math.cos(a) * bw * 0.5, 0, 0, sd * lerp(0.4, 1.1, rng())));
          }
        }
      };
      const VS = B.under(mStern), VB = B.under(mBow);
      piece(VS, secs.slice(iB), 'stern', 'start');
      piece(VB, secs.slice(0, iB + 1), 'bow', 'end');
      // superstructure aft: stacked decks with a window band, funnel, mast with a broken radar arm
      const sz = L * 0.36, sTop = secs[N - 3].top;
      let y = sTop;
      for (let k = 0; k < 4; k++) {
        const bw = W * (0.7 - k * 0.1), bh = Hh * 0.16, bd = L * (0.12 - k * 0.018);
        VS.add(KIT.panelBox(bw, bh, bd, { cols: 4, rows: 1, inset: 0.05 }), M.ceramicAged, P(0, y + bh / 2, sz, 0, 0, 0, { tint: 0.05 }));
        if (k === 3) VS.add(KIT.plateBox(bw + 0.3, bh * 0.32, bd + 0.3, 0.05), M.dark, P(0, y + bh * 0.55, sz));
        else VS.add(KIT.plateBox(bw + 0.8, 0.35, bd + 0.8, 0.05), M.steelDark, P(0, y + bh, sz));
        // window bands on the front and both sides (dead: dark glass in a frame lip), and a deck rail at each level's
        // front edge (scale cues: a 2.4 m window row and a 1.1 m rail on a 300 m hull)
        if (k < 3) {
          const wy = y + bh * 0.58, wh = Math.min(2.4, bh * 0.3);
          VS.add(KIT.plateBox(bw * 0.86, wh, 0.5, 0.08), M.darkGlass, P(0, wy, sz - bd / 2 - 0.15));
          VS.add(KIT.plateBox(bw * 0.9, 0.35, 0.8, 0.06), M.steelDark, P(0, wy + wh / 2 + 0.25, sz - bd / 2 - 0.3));
          for (const s2 of [-1, 1]) VS.add(KIT.plateBox(0.5, wh, bd * 0.8, 0.08), M.darkGlass, P(s2 * (bw / 2 + 0.15), wy, sz));
          railing(VS, M, [-bw / 2 - 0.2, y + bh + 0.2, sz - bd / 2 - 0.3], [bw / 2 + 0.2, y + bh + 0.2, sz - bd / 2 - 0.3], 1.1, M.steelDark);
        }
        y += bh;
      }
      for (const s2 of [-1, 1]) VS.add(KIT.plateBox(W * 0.12, 0.4, Hh * 0.08, 0.05), M.steelDark, P(s2 * (W * 0.42), y - Hh * 0.17, sz - L * 0.035));   // bridge wings
      const fun = geo('shipFunnel|' + L, () => KIT.latheHard([[0, 0], [W * 0.16, 0], [W * 0.15, Hh * 0.3], [W * 0.17, Hh * 0.32], [W * 0.17, Hh * 0.36], [W * 0.12, Hh * 0.37], [0, Hh * 0.37]], 16, { edgeLen: 0.6 }));
      VS.add(fun, M.oxide, P(0, y, sz + L * 0.045, -0.12, 0, 0));
      VS.add(KIT.ring(W * 0.155, 0.3, Hh * 0.05, 16), M.ceramicAged, P(0, y + Hh * 0.24, sz + L * 0.045 + Hh * 0.03, -0.12, 0, 0));
      VS.add(KIT.truss(Hh * 0.7, 1.4, 1.6, 6, 0.22), M.rust, P(0, y, sz - L * 0.02, 0, 0, HALF));
      VS.add(KIT.bar(W * 0.4, 0.35, 0.5), M.rust, P(W * 0.1, y + Hh * 0.62, sz - L * 0.02, 0, 0.3, -0.5));
      // deck cranes on the bow piece, one fallen
      for (const [zf, fallen] of [[0.24, false], [0.4, true]]) {
        const z = -L / 2 + L * zf, top = secs[Math.round(zf * N)].top;
        VB.add(KIT.cylinder(1.4, 1.8, Hh * 0.25, 12), M.ceramicAged, P(W * 0.3, top + Hh * 0.125, z));
        VB.add(KIT.truss(Hh * 0.8, 1.2, 1.4, 6, 0.22), M.rust, fallen ? P(W * 0.3 - Hh * 0.35, top + 1.4, z + 4, 0, 0.5, 0.1) : P(W * 0.3 - Hh * 0.2, top + Hh * 0.45, z, 0, 0.4, 0.75));
      }
      // ground: a ploughed mound at the buried nose, spilled cargo and plating around the break
      const nose = new THREE.Vector3(0, 0, -L / 2 + L * 0.04).applyMatrix4(mBow);
      B.add(KIT.rockGeo(91, { cuts: 7, noise: 0.08, squash: 0.45, flatBottom: 0.2 }), M.concreteDark, { pos: [nose.x, -1, nose.z + L * 0.02], scale: [W * 0.85, Hh * 0.3, L * 0.09] });
      for (let i = 0; i < 9; i++) B.add(KIT.rockGeo(120 + i, { cuts: 8, noise: 0.06 }), M.concreteDark,
        { pos: [nose.x + (rng() - 0.5) * W * 2.2, 0.4, nose.z + L * 0.05 + rng() * L * 0.08], rot: [rng(), rng() * 6, rng()], scale: lerp(2, 5, rng()) }, { lod0: i > 3 });
      for (let i = 0; i < 7; i++) B.add(KIT.ribbedPlate(12, 2.6, 2.6, { pitch: 0.9 }), i % 2 ? M.oxide : M.ceramicAged,
        P(L * 0.03 + (rng() - 0.5) * W * 1.6, 1.3 + (i % 3 === 2 ? 2.6 : 0), zb - L * 0.03 + (rng() - 0.5) * L * 0.1, 0, rng() * 6, i % 3 === 2 ? 0.3 : 0, { tint: 0.12 }));
      for (let i = 0; i < 22; i++) B.add(KIT.plateBox(lerp(2, 7, rng()), 0.35, lerp(2, 5, rng()), 0.08), rng() < 0.5 ? M.ceramicAged : M.rust,
        P((rng() < 0.5 ? -1 : 1) * (W * 0.55 + rng() * 16), 0.4 + rng(), (rng() - 0.5) * L * 0.95, rng() - 0.5, rng() * 6, rng() - 0.5), { lod0: true });
    },
  },
  // ---------------------------------------------------------------- megastructure_leg: a giant tapered leg on the horizon
  megastructure_leg: {
    params: { h: 600 }, states: [], height: p => p.h,
    footprint: p => ({ shape: 'circle', r: 48, flatten: false, pad: 30, exclude: 12, h: 'auto' }),
    colliders: p => [{ type: 'circle', x: 0, z: 0, r: 38, top: p.h }],
    build(A, p) {
      const { B, M } = A, H = p.h;
      const oct = (r) => { const out = []; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
      const secs = []; for (let i = 0; i <= 12; i++) { const u = i / 12; secs.push({ z: u * H, pts: oct(lerp(36, 17, Math.pow(u, 0.8))) }); }
      const col = geo('megaLeg|' + H, () => { const g = KIT.loft(secs); g.rotateX(-HALF); return g; });
      B.add(col, M.concreteDark);
      B.add(frustum(96, 96, 30, 0.7, 14), M.concreteDark, P(0, -10, 0));
      // corner members and a rib down the middle of each face (no 25 m-wide plain face), in 6 straight runs that follow
      // the leg's curved taper so they sit on the hull all the way up
      const rAt = (u) => lerp(36, 17, Math.pow(u, 0.8));
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * PI * 2 + PI / 8, am = a + PI / 8, cm = Math.cos(PI / 8);
        for (let k = 0; k < 6; k++) {
          const u0 = k / 6, u1 = (k + 1) / 6, r0 = rAt(u0) + 1, r1 = rAt(u1) + 1;
          B.add(KIT.barBetween([Math.cos(a) * r0, u0 * H, Math.sin(a) * r0], [Math.cos(a) * r1, u1 * H, Math.sin(a) * r1], 4.5, 4.5), M.steelDark);
          B.add(KIT.barBetween([Math.cos(am) * (r0 * cm + 0.2), u0 * H, Math.sin(am) * (r0 * cm + 0.2)], [Math.cos(am) * (r1 * cm + 0.2), u1 * H, Math.sin(am) * (r1 * cm + 0.2)], 2.2, 2.6), M.steelDark);
        }
      }
      for (let y = 60; y < H; y += 60) {
        const r = lerp(36, 17, Math.pow(y / H, 0.8)) + 2.5;
        B.add(KIT.ring(r, 5, 6, 8).clone().rotateY(PI / 8), M.rust, P(0, y, 0));
        if ((y / 60) % 2 === 0) for (let k = 0; k < 4; k++) { const a = k / 4 * PI * 2; A.lamp(B, [Math.cos(a) * (r + 2.5), y + 3.4, Math.sin(a) * (r + 2.5)], [Math.cos(a), 0.2, Math.sin(a)], 1.4, 'lightRed', { size: 14, pulse: 'beat' }); }
      }
      for (let y = 30; y < H - 30; y += 120) for (let i = 0; i < 8; i++) {
        const a0 = i / 8 * PI * 2 + PI / 8, a1 = (i + 1) / 8 * PI * 2 + PI / 8, r0 = lerp(36, 17, Math.pow(y / H, 0.8)) + 2, r1 = lerp(36, 17, Math.pow((y + 60) / H, 0.8)) + 2;
        B.add(KIT.barBetween([Math.cos(a0) * r0, y, Math.sin(a0) * r0], [Math.cos(a1) * r1, y + 60, Math.sin(a1) * r1], 1.6, 1.6), M.rust);
      }
    },
  },
  // ---------------------------------------------------------------- mech_wreck: a broken frame (buildMechWreck) with smoke
  mech_wreck: {
    params: { design: 'vanguard' }, states: [], height: () => 6,
    footprint: () => rect(14, 14, { pad: 6 }),
    colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 4.5, hd: 4.5, yaw: 0, top: 4.5 }],
    build(A, p) {
      const sc = p.scheme || { design: p.design || 'vanguard', base: '#5a5650', mid: '#3a3632', accent: '#7d2a1c', visor: '#111111' };
      const W = buildMechWreck(A.ctx, { ...sc, design: p.design || sc.design || 'vanguard' }, hashString(JSON.stringify(p)) & 0xffff);
      W.updateMatrixWorld(true);
      A.B.addObject(W);
      const rng = A.rng;
      for (let i = 0; i < 6; i++) A.B.add(KIT.plateBox(lerp(0.8, 2, rng()), 0.15, lerp(0.6, 1.4, rng()), 0.04), A.M.scorch, P((rng() - 0.5) * 12, 0.1, (rng() - 0.5) * 12, rng() - 0.5, rng() * 6, rng() - 0.5));
    },
    onRealise: (inst, ctx) => smokeFx(inst, ctx, [0, 3, 0], 0.8),
    onUnrealise: (inst) => stopFx(inst),
  },
  // ---------------------------------------------------------------- vehicle_wreck: a unit model, charred, tilted and sunk
  vehicle_wreck: {
    params: { kind: 'tank' }, states: [], height: () => 4,
    footprint: () => rect(10, 12, { pad: 5 }),
    colliders: () => [{ type: 'obox', x: 0, z: 0, hw: 3.4, hd: 4.4, yaw: 0, top: 3.2 }],
    build(A, p) {
      const M = A.M, std = A.ctx?.materials?.standard;
      const ch = (c) => (std ? std({ color: c, roughness: 0.9, metalness: 0.3, envMapIntensity: 0.3, wear: 0.95 }) : M.scorch);
      const fm = { shell: ch('#2b2724'), mid: ch('#1f1c1a'), accent: ch('#3a2418'), dark: ch('#0f0e0e'), eye: M.dark, glow: M.dark };
      const rig = buildUnit(A.ctx, ['drone', 'tank', 'tank_heavy', 'turret', 'gunship', 'walker', 'artillery', 'apc', 'dropship', 'beacon'].includes(p.kind) ? p.kind : 'tank', fm);
      KIT.unbakeRigid(rig.root);
      for (const e of rig.eyes) e.visible = false;
      rig.root.traverse(o => { if (o.isMesh && (o.material.transparent || o.material.blending !== THREE.NormalBlending)) o.visible = false; });
      if (rig.parts.turret) rig.parts.turret.rotation.set(0.12, 0.7, 0.05);
      if (rig.parts.barrelPivot) rig.parts.barrelPivot.rotation.x = -0.2;
      rig.root.rotation.set(0.08, 0, 0.16); rig.root.position.y = -0.8;
      rig.root.updateMatrixWorld(true);
      const W = new THREE.Group(); W.add(rig.root); W.updateMatrixWorld(true);
      A.B.addObject(W);
      const rng = A.rng;
      for (let i = 0; i < 8; i++) A.B.add(KIT.plateBox(lerp(0.6, 1.8, rng()), 0.14, lerp(0.5, 1.2, rng()), 0.04), fm.shell, P((rng() - 0.5) * 12, 0.1, (rng() - 0.5) * 12, rng() - 0.5, rng() * 6, rng() - 0.5));
    },
    onRealise: (inst, ctx) => smokeFx(inst, ctx, [0, 2.5, 0], 0.6),
    onUnrealise: (inst) => stopFx(inst),
  },
  // ---------------------------------------------------------------- salvage_cache: a strapped supply case with a lid and a beacon
  salvage_cache: {
    params: {}, states: ['sealed', 'opened'], height: () => 2,
    footprint: () => rect(4, 4, { pad: 4, exclude: 2 }),
    colliders: () => [box(3, 2.2, 1.7)],
    colliderEnabled: () => true,
    build(A, p) {
      const { B, M } = A;
      B.add(KIT.slab(3.2, 0.25, 2.4, { bevel: 0.05 }), M.ironBlack, P(0, 0.12, 0));
      for (const s of [-1, 1]) B.add(KIT.bar(3.0, 0.22, 0.2), M.ironBlack, P(0, 0.05, s * 0.9));
      B.add(KIT.panelBox(2.8, 1.3, 2.0, { cols: 2, rows: 1, inset: 0.05 }), M.oxide, P(0, 0.92, 0));
      for (const x of [-0.8, 0.8]) B.add(KIT.plateBox(0.18, 1.36, 2.06, 0.03), M.stripe, P(x, 0.92, 0));
      for (const s of [-1, 1]) B.add(KIT.plateBox(0.35, 0.18, 0.5, 0.04), M.ironBlack, P(s * 1.5, 1.1, 0));
      const lid = A.part('lid', [0, 1.58, 1.0]);
      lid.add(KIT.panelBox(2.9, 0.22, 2.1, { cols: 2, rows: 1, inset: 0.04 }), M.oxide, P(0, 0.11, -1.0));
      lid.add(KIT.bar(1.0, 0.1, 0.12), M.oxide, P(0, 0.3, -1.95));
      // the beacon is a full lamp assembly (AD §4.5): mast, housing, a lens dome (dark once opened) inside a wire cage
      const bx = 1.15, bz = 0.8, by = 2.8, br = 0.17;
      B.add(KIT.cylinder(0.06, 0.07, 1.3, 6), M.ironBlack, P(bx, 2.2, bz));
      B.add(KIT.lampHousing(br), M.ironBlack, P(bx, by, bz));
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * PI * 2 + 0.4;
        B.add(KIT.barBetween([bx + Math.cos(a) * br * 1.05, by + br * 1.3, bz + Math.sin(a) * br * 1.05], [bx + Math.cos(a) * br * 0.45, by + br * 3.1, bz + Math.sin(a) * br * 0.45], 0.03, 0.03), M.ironBlack);
      }
      B.add(KIT.disc(br * 0.6, 0.05), M.ironBlack, P(bx, by + br * 3.15, bz));
      const bc = A.part('beacon', [bx, by + br * 1.2, bz]);
      bc.add(KIT.dome(br * 0.86, br * 1.4, 12), M.lightAmber, P(0, 0, 0));
      A.lamps.push({ pos: [bx, by + br * 2.0, bz], color: '#ffbf4a', size: 1.6, pulse: 'sparkle' });
    },
    stateHooks: {
      sealed: (inst, instant) => { partTo(inst, 'lid', { rx: 0 }, instant); setPartVisible(inst, 'beacon', true); },
      opened: (inst, instant) => { partTo(inst, 'lid', { rx: -1.9 }, instant); setPartVisible(inst, 'beacon', false); },
    },
    glowsOn: st => st === 'sealed',
    animate: (inst, dt) => animParts(inst, dt),
  },
  // ---------------------------------------------------------------- checkpoint_beacon: a mast with a lamp head (idle dim, active lit)
  checkpoint_beacon: {
    params: {}, states: ['idle', 'active'], height: () => 9,
    footprint: () => rect(4, 4, { pad: 4, exclude: 2 }),
    colliders: () => [{ type: 'circle', x: 0, z: 0, r: 1.2, top: 8.5 }],
    colliderEnabled: () => true,
    build(A, p) {
      const { B, M } = A;
      B.add(frustum(2.6, 2.6, 1.2, 0.8, 0.3), M.concreteDark, P(0, -0.4, 0));
      for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; B.add(KIT.plateGeo([[0, 0], [1.3, 0], [0, 2.4]], 0.16, 'front', 0.03), M.steel, P(Math.sin(a) * 0.25, 0.8, Math.cos(a) * 0.25, 0, a + HALF, 0)); }
      B.add(KIT.cylinder(0.22, 0.32, 7, 10), M.steel, P(0, 4.3, 0));
      for (const y of [2.5, 5.0, 7.2]) B.add(KIT.ring(0.34, 0.12, 0.2), M.ironBlack, P(0, y, 0));
      B.add(KIT.lampHousing(0.55), M.ironBlack, P(0, 7.8, 0));
      const idle = A.part('lensIdle', [0, 7.8 + 0.55 * 1.24, 0]); idle.add(KIT.lampLens(0.55), M.lightAmber, P(0, 0, 0));
      const act = A.part('lensActive', [0, 7.8 + 0.55 * 1.24, 0]); act.add(KIT.lampLens(0.55), M.lightCyan, P(0, 0, 0));
      A.lamps.push({ pos: [0, 8.6, 0], color: '#5fe3ff', size: 3.5, pulse: 'beat' });
    },
    stateHooks: {
      idle: (inst) => { setPartVisible(inst, 'lensIdle', true); setPartVisible(inst, 'lensActive', false); },
      active: (inst) => { setPartVisible(inst, 'lensIdle', false); setPartVisible(inst, 'lensActive', true); },
    },
    glowsOn: st => st === 'active',
  },
};
for (const k of Object.keys(CATALOG)) CATALOG[k].defaults = CATALOG[k].params;
export const STRUCTURE_TYPES = Object.keys(CATALOG);

// ---------------------------------------------------------------- catalogue helpers
function piersFor(L) { const n = Math.max(1, Math.round(L / 40)); const out = []; for (let i = 1; i < n + 1; i++) out.push(-L / 2 + L * i / (n + 1)); return out; }
function dishSpots(n) { const all = [[5, -5], [-5, -4], [6, 5], [-1, 0]]; return all.slice(0, clamp(Math.round(n), 1, 4)); }
function farmSize(n) { const cols = Math.min(2, n), rows = Math.ceil(n / 2); return [cols * 15, rows * 15]; }
function farmSpots(n) { const out = []; for (let i = 0; i < n; i++) { const c = i % 2, r = Math.floor(i / 2), [w, d] = farmSize(n); out.push([-w / 2 + 7.5 + c * 15, -d / 2 + 7.5 + r * 15]); } return out; }
function refLayout(S) {
  return { tanks: [[-S * 0.28, -S * 0.25, 5], [-S * 0.28, S * 0.05, 4], [-S * 0.05, -S * 0.3, 3.5]], col: [S * 0.12, S * 0.12], flare: [S * 0.32, -S * 0.3] };
}
function fallAngle(inst) { const r = mulberry32(hashString(inst?.id || 'pylon')); return r() * PI * 2; }
function moveColliders(list, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return list.map(cd => {
    if (cd.type === 'box') {
      const cx = (cd.minx + cd.maxx) / 2, cz = (cd.minz + cd.maxz) / 2, w = cd.maxx - cd.minx, d = cd.maxz - cd.minz;
      return { type: 'obox', x: x + cx * c + cz * s, z: z - cx * s + cz * c, hw: w / 2, hd: d / 2, yaw, top: cd.top, bottom: cd.bottom, tag: cd.tag };
    }
    const nx = x + (cd.x || 0) * c + (cd.z || 0) * s, nz = z - (cd.x || 0) * s + (cd.z || 0) * c;
    return { ...cd, x: nx, z: nz, yaw: (cd.yaw || 0) + yaw };
  });
}
function outpostParts(size) {
  const h = size / 2, L = size - 8;
  return [
    ['wall', 0, h - 2, 0, { length: L, h: 9, thickness: 2.6, panel: 'large' }],
    ['wall', -(h - 2), 0, HALF, { length: L, h: 9, thickness: 2.6, panel: 'large' }],
    ['wall', h - 2, 0, HALF, { length: L, h: 9, thickness: 2.6, panel: 'large' }],
    ['wall', -(L / 4 + 6), -(h - 2), 0, { length: L / 2 - 12, h: 9, thickness: 2.6, panel: 'large' }],
    ['wall', L / 4 + 6, -(h - 2), 0, { length: L / 2 - 12, h: 9, thickness: 2.6, panel: 'large' }],
    ['bunker', 4, 6, PI, { w: 20, d: 14, h: 7 }],
    ['watchtower', -(h - 7), h - 7, 0, { h: 20 }],
    ['watchtower', h - 7, -(h - 7), 0, { h: 20 }],
    ['container_stack', -(h - 14), -6, HALF, { n: 2, layers: 2 }],
    ['barricade', 0, -(h + 4), 0, { length: 16 }],
  ];
}
/** a sub-builder API for composing a type into another (outpost) */
function subApi(A, m) {
  const B = A.B.under(m);
  return { ...A, B, lamp: (Bx, pos, dir, r, light, o) => A.lamp(B, pos, dir, r, light, o), part: A.part,
           lamps: { push: (L) => { const p = new THREE.Vector3(...L.pos).applyMatrix4(m); A.lamps.push({ ...L, pos: [p.x, p.y, p.z] }); } } };
}
function container(B, M, mat, x, y, z, ry) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const V = B.under(m), Lc = 12, Hc = 5, Dc = 4.6;
  for (const s of [-1, 1]) V.add(KIT.ribbedPlate(Lc - 0.6, Hc - 0.6, 0.12, { pitch: 0.6, axis: 'x' }), mat, P(0, Hc / 2, s * (Dc / 2 - 0.06), 0, s < 0 ? PI : 0, 0, { tint: 0.07 }));
  // corrugated roof (ribs across the width): a 12 m lid is never one plain face
  V.add(KIT.ribbedPlate(Lc - 0.5, Dc - 0.5, 0.14, { pitch: 1.0, axis: 'x' }), mat, P(0, Hc - 0.14, 0, -HALF, 0, 0, { tint: 0.05 }));
  V.add(KIT.slab(Lc - 0.4, Hc - 0.4, Dc - 0.4, { bevel: 0.05 }), mat, P(0, Hc / 2, 0, 0, 0, 0, { lod1: true }));
  for (const s of [-1, 1]) {
    V.add(KIT.panelBox(0.25, Hc - 0.5, Dc - 0.5, { cols: 1, rows: 1, inset: 0.04 }), mat, P(s * (Lc / 2 - 0.2), Hc / 2, 0));
    if (s > 0) for (const zz of [-0.7, 0.7]) V.add(KIT.bar(Hc - 0.8, 0.08, 0.08), M.ironBlack, P(Lc / 2, Hc / 2, zz, 0, 0, HALF), { lod0: true });
  }
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) V.add(KIT.plateBox(0.45, 0.45, 0.45, 0.06), M.ironBlack, P(sx * (Lc / 2 - 0.22), 0.22 + sy * (Hc - 0.44), sz * (Dc / 2 - 0.22)));
  for (const sz of [-1, 1]) for (const sy of [0, 1]) V.add(KIT.bar(Lc - 0.9, 0.2, 0.26), M.ironBlack, P(0, 0.2 + sy * (Hc - 0.4), sz * (Dc / 2 - 0.12)));
}
function tankInto(B, M, x, z, r, h, mat, rng) {
  const key = `tank|${r}|${h}`;
  const body = geo(key, () => {
    const prof = [[0, 0], [r * 1.03, 0], [r * 1.03, 0.4], [r, 0.42]];
    for (let y = 2.4; y < h - 1; y += 2.5) prof.push([r, y - 0.18], [r * 1.025, y - 0.08], [r * 1.025, y + 0.08], [r, y + 0.18]);
    prof.push([r, h]);
    for (let i = 1; i <= 6; i++) { const t = i / 6 * HALF; prof.push([r * Math.cos(t) * (i === 6 ? 0.16 : 1), h + Math.sin(t) * r * 0.32]); }
    prof.push([r * 0.16, h + r * 0.32 + 0.3], [0, h + r * 0.32 + 0.3]);
    return KIT.latheHard(prof, clamp(Math.round(r * 6), 16, 40), { edgeLen: 0.3 });
  });
  // LOD1 stand-in (AD §2.18: halve lathe segments, drop the ribs): the tanks are the site's silhouette, so they must
  // never be the pieces the LOD1 triangle budget drops
  const lo = geo(`tankL1|${r}|${h}`, () => KIT.latheHard([[0, 0], [r * 1.03, 0], [r * 1.03, 0.4], [r, 0.42], [r, h], [r * 0.72, h + r * 0.24],
                                                          [r * 0.16, h + r * 0.32 + 0.3], [0, h + r * 0.32 + 0.3]], 12, { edgeLen: 0.3 }));
  const yaw0 = rng() * PI;
  B.add(body, mat, P(x, 0, z, 0, yaw0, 0, { tint: 0.06, lod0: true }));
  B.add(lo, mat, P(x, 0, z, 0, yaw0, 0, { lod1: true }));
  B.add(KIT.ring(r + 0.04, 0.1, 0.55, clamp(Math.round(r * 6), 16, 40)), M.stripe, P(x, h - 0.75, z), { lod0: true });   // painted band
  ladder(B, M, x, 0.4, z + r + 0.35, h + 0.2, 0);
  // roof walkway railing: posts on the dome shoulder and a top rail
  const rr = r * 0.62, ry = h + r * 0.32 * Math.sin(Math.acos(rr / r)) - 0.05, n = clamp(Math.round(rr * 1.6), 8, 16);
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2; B.add(KIT.bar(1.1, 0.08, 0.08), M.ironBlack, P(x + Math.cos(a) * rr, ry + 0.55, z + Math.sin(a) * rr, 0, 0, HALF), { lod0: true }); }
  B.add(KIT.ring(rr, 0.09, 0.09, 4 * n), M.ironBlack, P(x, ry + 1.1, z), { lod0: true });
  B.add(KIT.cylinder(0.3, 0.3, 1.2, 8), M.ironBlack, P(x + r * 0.3, h + r * 0.3 + 0.4, z), { lod0: true });
  B.add(KIT.flange(0.45, 0.3, 0.25), M.ironBlack, P(x, 1.4, z + r + 0.05, HALF, 0, 0));
}
function tankTrap(B, M, x, z, rng) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.9, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * PI, 0)), new THREE.Vector3(1, 1, 1));
  const V = B.under(m);
  for (const [rx, ry, rz] of [[0.7, 0, 0.6], [-0.7, 0, 0.6], [0, HALF, -0.9]]) V.add(KIT.bar(3.0, 0.3, 0.35), M.ironBlack, P(0, 0, 0, rx, ry, rz));
}
function dishInto(D, M, r) {
  const dish = geo('dish|' + r, () => KIT.latheHard([[0, 0], [0.5, 0.06], [r * 0.5, r * 0.12], [r * 0.85, r * 0.3], [r, r * 0.42], [r * 1.04, r * 0.44], [r * 1.04, r * 0.5], [r * 0.95, r * 0.48],
                                                      [r * 0.8, r * 0.36], [r * 0.45, r * 0.18], [0, r * 0.1]], 28, { edgeLen: 0.4 }));
  D.add(dish, M.steel, P(0, 0.8, 0));
  for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; D.add(KIT.barBetween([0, 0.75, 0], [Math.cos(a) * r * 0.85, 0.75 + r * 0.28, Math.sin(a) * r * 0.85], 0.12, 0.18), M.steel); }
  for (let k = 0; k < 3; k++) { const a = k / 3 * PI * 2; D.add(KIT.barBetween([Math.cos(a) * r * 0.8, 0.8 + r * 0.36, Math.sin(a) * r * 0.8], [0, 0.8 + r * 0.95, 0], 0.07, 0.07), M.steel); }
  D.add(KIT.cylinder(0.22, 0.3, 0.6, 10), M.steel, P(0, 0.8 + r * 0.95, 0));
  D.add(KIT.plateBox(1.4, 0.8, 1.4, 0.08), M.steel, P(0, 0.2, 0));
}

// ---------------------------------------------------------------- state helpers (dynamic parts, fx)
function part(inst, name) { return inst.root?.getObjectByName(name) || null; }
function setPartVisible(inst, name, on) { const p = part(inst, name); if (p) p.visible = on; }
/** animate a dynamic part toward a pose { y, x, rx } (instant or over ~2.5 s of sim time via animParts) */
function partTo(inst, name, pose, instant) {
  inst.anim = inst.anim || {};
  const p = part(inst, name);
  if (!p) { inst.anim[name] = { pose, done: true }; return; }
  p.userData.home ??= { x: p.position.x, y: p.position.y, z: p.position.z, rx: p.rotation.x };
  if (instant) { applyPose(p, pose); delete inst.anim[name]; return; }
  inst.anim[name] = { pose, speed: pose.speed ?? 1 };
}
function applyPose(p, pose) {
  const h = p.userData.home;
  if (pose.y !== undefined) p.position.y = h.y + pose.y;
  if (pose.x !== undefined) p.position.x = h.x + pose.x;
  if (pose.rx !== undefined) p.rotation.x = h.rx + pose.rx;
  p.updateMatrix();
}
function animParts(inst, dt) {
  if (!inst.anim || !inst.root) return;
  for (const [name, a] of Object.entries(inst.anim)) {
    const p = part(inst, name);
    if (!p || a.done) continue;
    p.userData.home ??= { x: p.position.x, y: p.position.y, z: p.position.z, rx: p.rotation.x };
    const h = p.userData.home, k = 1 - Math.exp(-dt * 2.2), pose = a.pose;
    let done = true;
    if (pose.y !== undefined) { p.position.y += (h.y + pose.y - p.position.y) * k; if (Math.abs(h.y + pose.y - p.position.y) > 0.02) done = false; }
    if (pose.x !== undefined) { p.position.x += (h.x + pose.x - p.position.x) * k; if (Math.abs(h.x + pose.x - p.position.x) > 0.02) done = false; }
    if (pose.rx !== undefined) { p.rotation.x += (h.rx + pose.rx - p.rotation.x) * k; if (Math.abs(h.rx + pose.rx - p.rotation.x) > 0.005) done = false; }
    p.updateMatrix();
    if (done) { applyPose(p, pose); delete inst.anim[name]; }
  }
}
function doorTo(inst, y, instant) { partTo(inst, 'door', { y }, instant); }
function slideDoors(inst, dx, instant) { partTo(inst, 'doorL', { x: -dx }, instant); partTo(inst, 'doorR', { x: dx }, instant); }
function topple(inst, instant, ctx) {
  inst.fall = inst.fall || { t: 0, axis: fallAngle(inst), fx: 0 };
  if (instant) inst.fall.t = 1.45;
  poseTopple(inst);
  if (!instant && ctx && inst.root) {
    const H = inst.params.h, base = inst.pos;
    for (let i = 0; i < 4; i++) {
      const fn = () => ctx.fx?.explosion?.(new THREE.Vector3(base.x + (Math.random() - 0.5) * 6, base.y + 8 + i * 9, base.z + (Math.random() - 0.5) * 6), 1.2, { quiet: i > 0 });
      if (ctx.timers?.after) ctx.timers.after(i * 0.22, fn); else fn();
    }
    ctx.audio?.play?.('metalGroan', base);
  }
}
function untopple(inst) { inst.fall = null; if (inst.root) { inst.root.rotation.set(0, inst.yaw, 0); inst.root.updateMatrix(); } }
function poseTopple(inst) {
  const F = inst.fall; if (!F || !inst.root) return;
  const a = Math.min(1.45, F.t);
  // tip over toward the fall azimuth: rotate about the horizontal axis perpendicular to it
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(F.axis), 0, -Math.sin(F.axis)), a);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), inst.yaw);
  inst.root.quaternion.copy(q).multiply(qy);
  inst.root.updateMatrix();
}
function animTopple(inst, dt, ctx) {
  const F = inst.fall;
  if (!F || F.t >= 1.45 || !dt) return;
  F.t = Math.min(1.45, F.t + dt * (0.2 + F.t * 1.4));
  poseTopple(inst);
  if (F.t >= 1.45 && !F.landed) {
    F.landed = true;
    const H = inst.params.h, p = new THREE.Vector3(inst.pos.x + Math.sin(F.axis) * H * 0.5, inst.pos.y + 1, inst.pos.z + Math.cos(F.axis) * H * 0.5);
    ctx?.fx?.dust?.(p, 30, 14);
    ctx?.cameraRig?.addShake?.(0.6);
    ctx?.audio?.play?.('land', p);
  }
}
function stopFx(inst) { for (const h of inst.fx || []) h?.stop?.(); inst.fx = []; }
function emit(inst, ctx, kind, local, o) {
  if (!ctx?.fx?.emitter) return;
  const c = Math.cos(inst.yaw), s = Math.sin(inst.yaw);
  const p = new THREE.Vector3(inst.pos.x + local[0] * c + local[2] * s, inst.pos.y + local[1], inst.pos.z - local[0] * s + local[2] * c);
  (inst.fx ||= []).push(ctx.fx.emitter(kind, p, o));
}
function burn(inst, ctx, n) {
  if (!inst.root || inst.fx?.length) return;
  const spots = farmSpots(inst.params.tanks || 4).slice(0, n);
  for (const [x, z] of spots) { emit(inst, ctx, 'fire', [x, 6, z], { scale: 2 }); emit(inst, ctx, 'smoke', [x, 10, z], { scale: 2.5 }); }
}
function refineryFx(inst, ctx) {
  stopFx(inst);
  if (!inst.root || inst.state === 'destroyed') { if (inst.root) emit(inst, ctx, 'smoke', [0, 8, 0], { scale: 3 }); return; }
  const L = refLayout(inst.params.size);
  emit(inst, ctx, 'fire', [L.flare[0], 35.2, L.flare[1]], { scale: 1.2 });
  if (inst.state === 'burning') for (const [x, z, r] of L.tanks.slice(0, 2)) { emit(inst, ctx, 'fire', [x, r * 1.8, z], { scale: 2 }); emit(inst, ctx, 'smoke', [x, r * 2.4, z], { scale: 2.5 }); }
}
function burstFx(inst, ctx) {
  if (!inst.root) return;
  stopFx(inst);
  emit(inst, ctx, 'steam', [inst.params.length * 0.1, inst.params.h, 1.4], { scale: 1.6 });
}
function smokeFx(inst, ctx, local, scale) { if (!inst.fx?.length) emit(inst, ctx, 'smoke', local, { scale, rate: 0.6 }); }

// ================================================================== man-made props (Appendix C.2), one vertex-coloured geometry each
const PC = { rust: '#7a4128', oxide: '#7d2a1c', teal: '#4f8a86', iron: '#26252a', steel: '#5b5e62', conc: '#6e665c', concD: '#4d463e', stripe: '#d9a521',
             canvas: '#c9bb98', sand: '#8a7d62', rubber: '#1a1918', red: '#a5452f' };
function propGeo(name, fn) {
  return geo('prop|' + name, () => {
    const B = new KIT.GeoBuilder(hashString(name));
    const tag = (hex) => ({ color: new THREE.Color(hex) });
    fn(B, tag, mulberry32(hashString(name)));
    return B.mergedFor(null, (m) => m.color);
  });
}
export const PROPS = {
  container: { radius: 6, height: 5, collider: 'box', geometry: () => propGeo('container', (B, T) => {
    const V = B, Lc = 12, Hc = 5, Dc = 4.6, mat = T(PC.rust);
    for (const s of [-1, 1]) V.add(KIT.ribbedPlate(Lc - 0.6, Hc - 0.6, 0.12, { pitch: 1.3 }), mat, P(0, Hc / 2, s * (Dc / 2 - 0.06), 0, s < 0 ? PI : 0, 0), { tint: 0.05 });
    V.add(KIT.ribbedPlate(Lc - 0.5, Dc - 0.5, 0.16, { pitch: 1.6, axis: 'x' }), mat, P(0, Hc - 0.15, 0, -HALF, 0, 0));   // corrugated roof
    for (const s of [-1, 1]) V.add(KIT.panelBox(0.25, Hc - 0.5, Dc - 0.5, { cols: 1, rows: 1, inset: 0.04 }), mat, P(s * (Lc / 2 - 0.2), Hc / 2, 0));
    const ir = T(PC.iron);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) V.add(KIT.bar(0.45, 0.45, 0.45), ir, P(sx * (Lc / 2 - 0.22), 0.22 + sy * (Hc - 0.44), sz * (Dc / 2 - 0.22)));
    for (const sz of [-1, 1]) for (const sy of [0, 1]) V.add(KIT.bar(Lc - 0.9, 0.2, 0.26), ir, P(0, 0.2 + sy * (Hc - 0.4), sz * (Dc / 2 - 0.12)));
  }) },
  barrel_cluster: { radius: 1.6, height: 1.7, collider: 'circle', geometry: () => propGeo('barrels', (B, T, r) => {
    const cols = [PC.teal, PC.rust, PC.oxide, PC.iron];
    for (const [x, z, k] of [[-0.6, -0.4, 0], [0.6, -0.5, 1], [0, 0.6, 2], [1.2, 0.5, 3], [-1.1, 0.7, 1]]) B.add(KIT.drum(0.5, 1.5, 2, 10), T(cols[k]), P(x, 0, z, 0, r() * 6, 0));
    B.add(KIT.drum(0.5, 1.5, 2, 10), T(PC.rust), P(0.2, 0.5, -1.4, HALF, 0.4, 0));
  }) },
  barricade_small: { radius: 3, height: 2, collider: 'box', geometry: () => propGeo('barricade_small', (B, T, r) => {
    for (let i = 0; i < 3; i++) B.add(KIT.armourPlate(KIT.chamfer(KIT.rect(2.0, 1.9), [0.15, 0.15, 0.5, 0.3]), 0.14), T([PC.rust, PC.teal, PC.red][i]), P(-2 + i * 1.9, 0.9, (r() - 0.5) * 0.3, -0.12, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2));
    for (let i = 0; i < 3; i++) B.add(KIT.barBetween([-2 + i * 1.9, 1.4, 0.15], [-2 + i * 1.9 + 0.2, 0, 1.2], 0.12, 0.12), T(PC.iron));
  }) },
  tank_trap: { radius: 1.6, height: 1.8, collider: 'circle', geometry: () => propGeo('tank_trap', (B, T) => {
    for (const [rx, ry, rz] of [[0.7, 0, 0.6], [-0.7, 0, 0.6], [0, HALF, -0.9]]) B.add(KIT.bar(3.0, 0.28, 0.34), T(PC.iron), P(0, 0.9, 0, rx, ry, rz));
    B.add(KIT.plateBox(0.6, 0.12, 0.6, 0.03), T(PC.rust), P(0, 0.9, 0));
  }) },
  girder: { radius: 5, height: 1, collider: 'box', geometry: () => propGeo('girder', (B, T) => {
    const c = T(PC.rust);
    B.add(KIT.bar(10, 0.9, 0.12), c, P(0, 0.06, 0)); B.add(KIT.bar(10, 0.9, 0.12), c, P(0, 0.94, 0)); B.add(KIT.bar(10, 0.12, 0.8), c, P(0, 0.5, 0));
    for (let x = -4.5; x <= 4.5; x += 1.5) B.add(KIT.plateBox(0.1, 0.76, 0.4, 0.02), c, P(x, 0.5, 0.25));
    B.add(KIT.plateBox(1.2, 0.95, 0.12, 0.03), T(PC.iron), P(4.6, 0.5, 0));
  }) },
  concrete_chunk: { radius: 1.5, height: 1.6, collider: 'circle', geometry: () => propGeo('concrete_chunk', (B, T, r) => {
    B.add(KIT.rockGeo(4242, { cuts: 9, noise: 0.06, squash: 0.7 }), T(PC.conc), { pos: [0, 0.7, 0], scale: [1.5, 1.1, 1.3] });
    for (let i = 0; i < 3; i++) B.add(KIT.bar(1.4, 0.07, 0.07), T(PC.rust), P((r() - 0.5) * 1.2, 1.2, (r() - 0.5), 0, r() * 6, HALF * 0.6 + r() * 0.5));
  }) },
  pipe_piece: { radius: 4, height: 1.5, collider: 'box', geometry: () => propGeo('pipe_piece', (B, T) => {
    B.add(KIT.cylinderBetween([-3.6, 0.72, 0], [3.6, 0.72, 0], 0.72, 18), T(PC.oxide));
    B.add(KIT.cylinderBetween([-3.6, 0.72, 0], [3.6, 0.72, 0], 0.6, 18).clone().scale(1, 1, 1), T(PC.iron));
    for (const x of [-3.6, 3.6]) B.add(KIT.flange(0.72, 0.25, 0.22).clone().rotateZ(HALF), T(PC.iron), P(x, 0.72, 0));
    for (const x of [-1.5, 1.5]) B.add(KIT.slab(0.4, 0.5, 1.6), T(PC.iron), P(x, 0.25, 0));
  }) },
  wreck_debris: { radius: 2, height: 1.5, collider: 'circle', geometry: () => propGeo('wreck_debris', (B, T, r) => {
    for (let i = 0; i < 6; i++) B.add(KIT.plateBox(0.6 + r() * 1.6, 0.18, 0.5 + r() * 1.2, 0.04), T([PC.iron, PC.rust, PC.steel][i % 3]), P((r() - 0.5) * 3, 0.2 + r() * 0.8, (r() - 0.5) * 3, r() - 0.5, r() * 6, r() - 0.5));
    B.add(KIT.barBetween([-1.2, 0.1, -0.8], [0.9, 1.3, 0.6], 0.2, 0.3), T(PC.iron));
  }) },
  cable_spool: { radius: 1.3, height: 2.5, collider: 'circle', geometry: () => propGeo('cable_spool', (B, T) => {
    for (const z of [-0.6, 0.6]) B.add(KIT.cylinder(1.25, 1.25, 0.14, 20), T(PC.rust), P(0, 1.25, z, HALF));
    B.add(KIT.cylinder(0.85, 0.85, 1.1, 18), T(PC.rubber), P(0, 1.25, 0, HALF));
    B.add(KIT.cylinder(0.25, 0.25, 1.4, 10), T(PC.iron), P(0, 1.25, 0, HALF));
  }) },
  sign_post: { radius: 0.4, height: 4, collider: 'circle', castShadow: true, geometry: () => propGeo('sign_post', (B, T) => {
    B.add(KIT.cylinder(0.09, 0.11, 3.6, 8), T(PC.iron), P(0, 1.8, 0));
    B.add(KIT.armourPlate(KIT.chamferRect(1.4, 0.8, 0.12), 0.06), T(PC.stripe), P(0, 3.3, 0.08));
    B.add(KIT.plateBox(0.5, 0.14, 0.5, 0.03), T(PC.concD), P(0, 0.07, 0));
  }) },
  sandbags: { radius: 2.5, height: 1.2, collider: 'box', geometry: () => propGeo('sandbags', (B, T, r) => {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) {
      const x = -2.2 + i * 0.9 + row * 0.45;
      B.add(KIT.slab(0.86, 0.36, 0.55, { bevel: 0.12, chamfer: 0.14 }), T(r() < 0.5 ? PC.sand : PC.canvas), P(x, 0.18 + row * 0.34, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.1, 0), { tint: 0.08 });
    }
  }) },
};
