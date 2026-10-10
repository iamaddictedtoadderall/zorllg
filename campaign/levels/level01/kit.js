// levels/level01/kit.js (P6) — Level 1's geometry and material helpers.
//
// Everything here is built on the arch §4 kit (plateGeo, cylinder, pipe, truss, greebles), whose semantics are stable
// whether art/kit.js is P0's stub or P3's real kit. Kit v1 builders from the addendum (rockGeo …) are used through
// kitOr(name, fallback) with small local stand-ins (A5.3: "P6 uses a local kitOr(name, fallback)").
//
// Builder: collects parts (geometry + material + transform), normalises every part to one attribute set
// (position, normal, color, edge; non-indexed, no uv) and merges them into ONE mesh per material, so a structure costs
// a handful of draw calls even while GeoBuilder is a stub. lod() bakes a single vertex-coloured mesh (LOD1, arch §5.7).
// Merged geometries are cached by the caller and marked userData.shared so ctx.clearLevel() never disposes them.
import * as THREE from 'three';
import * as KIT from '../../src/art/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hashString } from '../../src/core/util.js';

export const DEG = Math.PI / 180;
export const shared = (o) => { if (o) o.userData.shared = true; return o; };
/** a Kit v1 builder when P3 has landed it, else the local fallback (A5.3) */
export function kitOr(name, fallback) { return typeof KIT[name] === 'function' ? KIT[name] : fallback; }

// ── 2D profiles (AD §2.1) ───────────────────────────────────────────────────────────────────────────────────────
export function rect(w, h, cx = 0, cy = 0) {
  const x = w / 2, y = h / 2;
  return [[cx - x, cy - y], [cx + x, cy - y], [cx + x, cy + y], [cx - x, cy + y]];
}
export function chamfer(pts, c) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ci = Array.isArray(c) ? c[i] : c;
    if (!ci) { out.push(p); continue; }
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const k = Math.min(ci, la * 0.45, lb * 0.45);
    out.push([p[0] + (a[0] - p[0]) / la * k, p[1] + (a[1] - p[1]) / la * k],
             [p[0] + (b[0] - p[0]) / lb * k, p[1] + (b[1] - p[1]) / lb * k]);
  }
  return out;
}
export const chamferRect = (w, h, c, cx = 0, cy = 0) => chamfer(rect(w, h, cx, cy), c);
/** convex-ish random polygon (top-view outlines for slabs, floes, bergs) */
export function blob(rng, r, n = 8, jitter = 0.25, squash = 1) {
  const pts = [];
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const rr = r * (1 - jitter + rng() * jitter * 2);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
  }
  return pts;
}
const r2 = (v) => Math.round(v * 100) / 100;
const q = (pts) => pts.map(([a, b]) => [r2(a), r2(b)]);

// ── primitives (all centred unless stated) ────────────────────────────────────────────────────────────────────────
/** bevelled slab w (x) × h (y) × d (z), centred */
export function slab(w, h, d, bevel = 0.12, cham = null) {
  const b = Math.min(bevel, w * 0.2, h * 0.2, d * 0.25);
  return KIT.plateGeo(q(chamferRect(w, h, cham ?? b * 1.2)), d, 'front', b);
}
/** extruded side profile (pts as [z, y] like the prototype's 'side' view; across x by `width`) */
export const side = (pts, width, bevel = 0.1) => KIT.plateGeo(q(pts), width, 'side', bevel);
/** extruded front profile (pts [x, y]; along z by `depth`) */
export const front = (pts, depth, bevel = 0.1) => KIT.plateGeo(q(pts), depth, 'front', bevel);
/** extruded top-view outline (pts [x, z]; up y by `height`, centred on y) */
export const top = (pts, height, bevel = 0.1) => KIT.plateGeo(q(pts), height, 'top', bevel);
export const cyl = (rt, rb, h, seg = 12) => KIT.cylinder(r2(rt), r2(rb), r2(h), seg);
const sphereCache = new Map();
export function ball(r, ws = 10, hs = 8) {
  const k = `${r}|${ws}|${hs}`;
  let g = sphereCache.get(k);
  if (!g) { g = shared(new THREE.SphereGeometry(r, ws, hs)); sphereCache.set(k, g); }
  return g;
}
const torusCache = new Map();
export function torus(r, tube, rs = 6, ts = 18, arc = Math.PI * 2) {
  const k = `${r}|${tube}|${rs}|${ts}|${arc}`;
  let g = torusCache.get(k);
  if (!g) { g = shared(new THREE.TorusGeometry(r, tube, rs, ts, arc)); torusCache.set(k, g); }
  return g;
}
const planeCache = new Map();
export function plane(w, h) {
  const k = `${w}|${h}`;
  let g = planeCache.get(k);
  if (!g) { g = shared(new THREE.PlaneGeometry(w, h)); planeCache.set(k, g); }
  return g;
}
/** faceted ice/rock chunk at unit radius: Kit v1 rockGeo when present, else a cut icosahedron (AD §2.12) */
const rockCache = new Map();
function localRock(seed, o = {}) {
  const k = seed + JSON.stringify(o);
  let g = rockCache.get(k);
  if (g) return g;
  const rng = mulberry32(seed);
  g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, v = new THREE.Vector3();
  const planes = [];
  for (let i = 0; i < (o.cuts ?? 7); i++) {
    const u = (rng() * 2 - 1) * 0.6, a = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    planes.push([s * Math.cos(a), u, s * Math.sin(a), 0.55 + rng() * 0.3]);
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (o.noise ?? 0.06) * Math.sin(v.x * 7 + seed) * Math.cos(v.z * 5 - seed));
    v.y *= o.squash ?? 0.8;
    for (const [nx, ny, nz, d] of planes) { const t = v.x * nx + v.y * ny + v.z * nz - d; if (t > 0) v.set(v.x - nx * t, v.y - ny * t, v.z - nz * t); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  g = g.toNonIndexed(); g.computeVertexNormals();
  shared(g); rockCache.set(k, g);
  return g;
}
export function rock(seed, o) { return kitOr('rockGeo', localRock)(seed, o); }

// ── materials (AD §4.2 values through ctx.materials.standard: cached, shared, atmosphere-patched) ─────────────────
const M_CACHE = new WeakMap();
export function mats(ctx) {
  let m = M_CACHE.get(ctx);
  if (m) return m;
  const S = (o) => ctx.materials.standard(o);
  const E = (c, i) => ctx.materials.emissive(c, i);
  m = {
    ice: S({ color: '#9cc4dc', roughness: 0.2, metalness: 0, envMapIntensity: 1.0, emissive: '#0a3a5a', emissiveIntensity: 0.35 }),
    iceDeep: S({ color: '#5f86a8', roughness: 0.28, metalness: 0, envMapIntensity: 0.9, emissive: '#06243a', emissiveIntensity: 0.3 }),
    iceClear: S({ color: '#b8e2f4', roughness: 0.08, metalness: 0, envMapIntensity: 1.2, emissive: '#1a5a7a', emissiveIntensity: 0.6 }),
    // translucent shelf ice lit from above by the stars: the cavern's roof and its thin windows glow faintly (L1 §2.6 Z2)
    iceGlow: S({ color: '#8fc3e0', roughness: 0.14, metalness: 0, envMapIntensity: 1.0, emissive: '#2a7fb4', emissiveIntensity: 0.55 }),
    frost: S({ color: '#dfeaf3', roughness: 0.6, metalness: 0, envMapIntensity: 0.6, emissive: '#16303f', emissiveIntensity: 0.25 }),
    snow: S({ color: '#e8eef5', roughness: 0.78, metalness: 0, envMapIntensity: 0.4 }),
    ceramic: S({ color: '#e9e6dc', roughness: 0.35, metalness: 0.05, envMapIntensity: 0.7, wear: 0.4 }),
    ceramicAged: S({ color: '#b8b0a0', roughness: 0.5, metalness: 0.05, envMapIntensity: 0.6, wear: 0.7 }),
    // a century of ice and grime on the Abeyance's plates (same program as ceramicAged)
    ceramicGrey: S({ color: '#8f897d', roughness: 0.55, metalness: 0.05, envMapIntensity: 0.6, wear: 0.7 }),
    goldDead: S({ color: '#8a7440', roughness: 0.4, metalness: 0.9, envMapIntensity: 0.9 }),
    gold: S({ color: '#c99a3e', roughness: 0.32, metalness: 1.0, envMapIntensity: 1.1, wear: 0.4 }),
    iron: S({ color: '#1c1b1d', roughness: 0.62, metalness: 0.55, envMapIntensity: 0.7, wear: 0.6 }),
    oxide: S({ color: '#7d2a1c', roughness: 0.6, metalness: 0.3, envMapIntensity: 0.6, wear: 0.7 }),
    hazard: S({ color: '#d9a521', roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6, wear: 0.8 }),
    steel: S({ color: '#2f3236', roughness: 0.5, metalness: 0.85, envMapIntensity: 0.9, wear: 0.5 }),
    rust: S({ color: '#7a4128', roughness: 0.88, metalness: 0.35, envMapIntensity: 0.4, wear: 0.3 }),
    canvas: S({ color: '#d9cba8', roughness: 0.95, metalness: 0, envMapIntensity: 0.25, side: 'double', wear: 0.5 }),
    canvasRed: S({ color: '#a5452f', roughness: 0.9, metalness: 0, envMapIntensity: 0.3, side: 'double', wear: 0.6 }),
    wake: S({ color: '#4f8a86', roughness: 0.62, metalness: 0.28, envMapIntensity: 0.6, wear: 0.8 }),
    wakeRed: S({ color: '#a5452f', roughness: 0.64, metalness: 0.28, envMapIntensity: 0.6, wear: 0.8 }),
    wakeCream: S({ color: '#cbbd9a', roughness: 0.7, metalness: 0.15, envMapIntensity: 0.5, wear: 0.7 }),
    rubber: S({ color: '#1a1918', roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }),
    dark: S({ color: '#141416', roughness: 0.8, metalness: 0.4, envMapIntensity: 0.5 }),
    cable: S({ color: '#151517', roughness: 0.6, metalness: 0.2, envMapIntensity: 0.5 }),
    darkGlass: S({ color: '#0b1014', roughness: 0.06, metalness: 0, envMapIntensity: 1.2 }),
    drum: S({ color: '#3a3330', roughness: 0.7, metalness: 0.5, envMapIntensity: 0.6, wear: 0.6 }),
    tungsten: E('#ffb36b', 3), sodium: E('#ff9a2e', 4), white: E('#fff1d6', 5), cyan: E('#5fe3ff', 3.5),
    cyanDead: E('#5fe3ff', 0.5), goldLight: E('#ffcc66', 3), red: E('#ff2a1a', 3), amber: E('#ffb04a', 3),
    flare: E('#ff7048', 5), orangeTeeth: E('#ff7a2a', 3), collar: E('#bff6ff', 4),
    // per-level animated materials (not from the library: their intensity changes every frame)
    // the ghost-cab light: a library emissive (no extra shader program) of its own, pulsed by the runtime on the beat
    ghost: ctx.materials.emissive('#a8ff9e', 6.0001),
    lod: S({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.4 }),
  };
  M_CACHE.set(ctx, m);
  return m;
}
export function patch(ctx, m) { return ctx.atmosphere?.patchMaterial ? ctx.atmosphere.patchMaterial(m) : m; }

/** additive glow material (sprites, light cones, the light wall); shared per colour/opacity */
export function glowMat(ctx, color, opacity = 1) { return ctx.materials.glow(color, opacity); }

// ── merging ───────────────────────────────────────────────────────────────────────────────────────────────────
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
/** a non-indexed copy with exactly position, normal, color and edge, transformed by `mat` */
function normalise(src, mat) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('color', g.attributes.color && g.attributes.color.itemSize === 3 ? g.attributes.color
    : new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  out.setAttribute('edge', g.attributes.edge && g.attributes.edge.itemSize === 1 ? g.attributes.edge
    : new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (mat) out.applyMatrix4(mat);
  return out;
}
export function compose(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _p.set(x, y, z); _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Builder {
  constructor() { this.groups = new Map(); this.tris = 0; }
  /** add(geometry, material, x, y, z, rx, ry, rz, sx, sy, sz) — Euler order YXZ (yaw, then pitch, then roll) */
  add(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) { return this.addM(geo, mat, compose(x, y, z, rx, ry, rz, sx, sy, sz)); }
  addM(geo, mat, m4) {
    if (!geo || !mat) return this;
    let g = this.groups.get(mat);
    if (!g) { g = []; this.groups.set(mat, g); }
    g.push(normalise(geo, m4));
    return this;
  }
  /** add every mesh under `obj` (relative to obj) */
  addObject(obj) {
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    obj.traverse(c => { if (c.isMesh && c.geometry && c.material && !Array.isArray(c.material)) this.addM(c.geometry, c.material, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)); });
    return this;
  }
  /** merged geometry per material: [{ geo, mat }] (geometries shared/cached by the caller) */
  merged() {
    const out = [];
    for (const [mat, list] of this.groups) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      shared(geo);
      out.push({ geo, mat });
      this.tris += geo.attributes.position.count / 3;
    }
    this.groups.clear();
    return out;
  }
  /** one vertex-coloured geometry (material colours baked, emissives as their emissive colour) */
  single(colorOf) {
    const geos = [];
    for (const [mat, list] of this.groups) {
      const c = colorOf ? colorOf(mat) : matColor(mat);
      for (const g of list) {
        const col = g.attributes.color.array;
        for (let i = 0; i < col.length; i += 3) { col[i] *= c.r; col[i + 1] *= c.g; col[i + 2] *= c.b; }
        geos.push(g);
      }
    }
    const geo = geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry();
    geo.computeBoundingSphere();
    return shared(geo);
  }
}
export function matColor(mat) {
  if (mat.emissive && mat.emissiveIntensity > 0.9 && mat.color && mat.color.r + mat.color.g + mat.color.b < 0.05) return _c.copy(mat.emissive).multiplyScalar(1.5).clone();
  if (mat.color) return mat.color.clone().multiplyScalar(1.08);
  return new THREE.Color(0.5, 0.5, 0.5);
}
/** meshes from merged parts, under a new group */
export function meshes(parts, o = {}) {
  const root = new THREE.Group();
  for (const { geo, mat } of parts) {
    const m = new THREE.Mesh(geo, mat);
    const glowy = mat.blending === THREE.AdditiveBlending || (mat.emissive && mat.color && mat.color.r + mat.color.g + mat.color.b < 0.05);
    m.castShadow = o.castShadow !== false && !glowy;
    m.receiveShadow = o.receiveShadow !== false && !glowy;
    root.add(m);
  }
  return root;
}

// ── build cache: one merge per type + params, kept for the session (geometry is shared, never disposed) ─────────
const BUILD_CACHE = new WeakMap();   // ctx → Map(key → build); materials are per ctx
/**
 * cached(ctx, key, make, o?) → { parts: [{geo, mat}], lod?: geometry, extra }. `make(B, isLod)` fills a Builder and may
 * return extra data (anchors, animated part lists).
 */
export function cached(ctx, key, make, o = {}) {
  let cache = BUILD_CACHE.get(ctx);
  if (!cache) { cache = new Map(); BUILD_CACHE.set(ctx, cache); }
  const k = key;
  let e = cache.get(k);
  if (e) return e;
  const B = new Builder();
  const extra = make(B);
  let lod = null;
  if (o.lod) {
    // LOD1: rebuild with the lodFilter (big pieces only) into one vertex-coloured mesh
    const L = new Builder();
    (o.lodMake || make)(L, true);
    lod = L.single(o.lodColorOf);
  }
  const parts = B.merged();
  e = { parts, lod, extra, tris: B.tris };
  cache.set(k, e);
  return e;
}
/** root (+ LOD) for a cached build: { root, lod? } as StructureTypeDef.build returns */
export function instance(ctx, built, o = {}) {
  const root = meshes(built.parts, o);
  let lod;
  if (built.lod) { lod = new THREE.Mesh(built.lod, mats(ctx).lod); lod.castShadow = false; lod.receiveShadow = true; }
  return { root, lod };
}

// ── misc helpers ─────────────────────────────────────────────────────────────────────────────────────────────
export const rngFor = (s) => mulberry32(typeof s === 'number' ? s : hashString(String(s)));
/**
 * canvas texture with text (signage) from ctx.materials.sign, cached per ctx. `weathered` is applied here by drawing
 * chips and grime over a copy of the sign (no canvas readback: getImageData stalls for tens of seconds on the first
 * call in software-GL browsers, which would land in the level's load).
 */
const SIGN_CACHE = new WeakMap();
export function signTex(ctx, text, o = {}) {
  if (!ctx.materials?.sign) return null;
  let cache = SIGN_CACHE.get(ctx); if (!cache) { cache = new Map(); SIGN_CACHE.set(ctx, cache); }
  const key = String(text) + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const wd = Math.max(0, Math.min(1, +o.weathered || 0));
  const base = ctx.materials.sign(text, { ...o, weathered: 0 });
  let tex = base;
  const src = base?.image;
  if (wd > 0 && src && typeof document !== 'undefined' && src.width) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const rng = mulberry32(hashString(key)), W = c.width, H = c.height;
    // paint chips: flecks of the background colour, denser toward the edges
    g.fillStyle = o.bg || '#2a2a2a';
    for (let i = 0; i < Math.round(160 * wd); i++) {
      const x = rng() * W, y = rng() * H, r = 1 + rng() * rng() * 6;
      g.globalAlpha = 0.35 + rng() * 0.5; g.beginPath(); g.ellipse(x, y, r * (1 + rng()), r, rng() * 3, 0, Math.PI * 2); g.fill();
    }
    // grime: soft dark streaks running down, and a dull wash
    g.fillStyle = '#1a1612';
    for (let i = 0; i < Math.round(26 * wd); i++) { g.globalAlpha = 0.05 + rng() * 0.12 * wd; g.fillRect(rng() * W, rng() * H * 0.3, 2 + rng() * 10, H * (0.3 + rng() * 0.7)); }
    g.globalAlpha = 0.12 * wd; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = base.anisotropy || 1;
    shared(tex);
  }
  cache.set(key, tex);
  return tex;
}
/** a plain textured plane mesh (decals, signs); material is per call */
export function decal(ctx, tex, w, h, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: !!o.transparent, roughness: 0.9, metalness: 0,
                                             emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0),
                                             emissiveMap: o.emissive ? tex : null, emissiveIntensity: o.emissiveIntensity ?? 1,
                                             depthWrite: !o.transparent, polygonOffset: true, polygonOffsetFactor: -2 });
  m.userData.noAO = true;   // flat paint on a surface: no ambient-occlusion pass variant
  const mesh = new THREE.Mesh(plane(w, h), patch(ctx, m));
  mesh.receiveShadow = true;
  return mesh;
}
/** marks an object as a glow anchor (the runtime attaches ctx.particles.glows when P1's glows exist) */
export function glowAnchor(obj, opts) { obj.userData.l01glow = opts; return obj; }
/** emissive lens + glow anchor; returns the lens mesh */
export function lamp(parent, ctx, mat, size, x, y, z, glow) {
  const lens = new THREE.Mesh(ball(size * 0.5, 8, 6), mat);
  lens.position.set(x, y, z);
  lens.castShadow = false;
  if (glow) glowAnchor(lens, glow);
  parent.add(lens);
  return lens;
}
