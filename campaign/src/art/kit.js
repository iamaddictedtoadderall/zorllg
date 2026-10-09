// art/kit.js (P3): the bevelled geometry kit. Everything man-made in the game is built from these builders.
//
// Kit contract (AD §2.0, addendum A5.3): every builder returns *kit geometry*: non-indexed, no `uv`, no groups, and exactly
// the attributes `position`, `normal`, `color` (vec3, linear, default 1) and `edge` (float, 1 on bevel faces, for the wear
// patch). Results with plain-value inputs are cached by key and marked `userData.shared` (ctx.clearLevel never disposes
// them). Never mutate a cached geometry: clone it first. Local space is metres, model forward is −Z.
//
// Contents
//   kitFinalize                                    AD §2.0
//   rect, chamfer, chamferRect, round, taper, offset, split           profiles (AD §2.1)
//   plateGeo (+ holes), acKit                      the prototype's plate kit (verbatim semantics)
//   slab, bevelBox, panelBox, armourPlate, ribbedPlate, plateBox, bar AD §2.2
//   latheHard, dome, ring, flange, drum, lampHousing, nozzle, cylinder AD §2.3
//   cylinderBetween, pipeRun, pipe                 AD §2.4
//   truss, barBetween                              AD §2.5
//   loft                                           AD §2.6
//   greebles                                       AD §2.13
//   rockGeo, floe, pressureRidge, icicles          AD §2.12
//   GeoBuilder (merge per material, tint, LOD1 single mesh), bakeRigid / unbakeRigid (rigid skinning)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise.js';
import { mulberry32, hashString, clamp, lerp } from '../core/util.js';

const TAU = Math.PI * 2;
const shared = (g) => { g.userData.shared = true; return g; };
const CACHE = new Map();
/** Cached builder result (by key). */
function cached(key, fn) {
  let g = CACHE.get(key);
  if (!g) { g = shared(fn()); CACHE.set(key, g); }
  return g;
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const keyOf = (...a) => a.map(v => (typeof v === 'number' ? r4(v) : Array.isArray(v) ? JSON.stringify(v, (k, x) => typeof x === 'number' ? r4(x) : x) : String(v))).join('|');

// ------------------------------------------------------------------ attribute contract
/** Makes any geometry kit-compatible (AD §2.0). Mutates and returns g (or a de-indexed copy of it). */
export function kitFinalize(g, o = {}) {
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'edge') g.deleteAttribute(name);
  }
  g.clearGroups();
  g.morphAttributes = {};
  if (o.flat !== false || !g.attributes.normal) g.computeVertexNormals();   // non-indexed → face normals
  const n = g.attributes.position.count;
  if (!g.attributes.color || g.attributes.color.itemSize !== 3) {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  if (!g.attributes.edge || o.edgeAll !== undefined || o.edgeAxis) {
    const e = new Float32Array(n);
    if (o.edgeAll) e.fill(o.edgeAll);
    else if (o.edgeAxis) {
      const k = { x: 0, y: 1, z: 2 }[o.edgeAxis], N = g.attributes.normal.array;
      for (let i = 0; i < n; i++) { const d = Math.abs(N[i * 3 + k]); e[i] = d > 0.2 && d < 0.93 ? 1 : 0; }
    }
    g.setAttribute('edge', new THREE.BufferAttribute(e, 1));
  }
  return g;
}
function isKit(g) {
  const a = g.attributes;
  return !g.index && a.position && a.normal && a.color && a.edge && Object.keys(a).length === 4;
}
/** Build kit geometry straight from arrays. */
function fromArrays(P, N, E, C) {
  const g = new THREE.BufferGeometry();
  const n = P.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C || new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(E || new Float32Array(n), 1));
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _nm = new THREE.Matrix3();
/** Matrix from a Matrix4 or { pos, rot, scale } (rot: Euler XYZ radians, or a Quaternion). */
export function toMatrix(t, out = new THREE.Matrix4()) {
  if (!t) return out.identity();
  if (t.isMatrix4) return out.copy(t);
  _p.set(...(t.pos || [0, 0, 0]));
  if (t.quat) _q.copy(t.quat);
  else { _e.set(...(t.rot || [0, 0, 0]), t.order || 'XYZ'); _q.setFromEuler(_e); }
  const sc = t.scale ?? 1;
  if (Array.isArray(sc)) _s.set(...sc); else _s.set(sc, sc, sc);
  return out.compose(_p, _q, _s);
}

/** Merge kit geometries with optional transforms: parts = [g | [g, t]]. Returns new (uncached) kit geometry. */
export function kitMerge(parts) {
  const list = [];
  let n = 0;
  for (const p of parts) {
    if (!p) continue;
    const [g0, t] = Array.isArray(p) ? p : [p, null];
    const g = isKit(g0) ? g0 : kitFinalize(g0.clone(), { flat: !g0.attributes.normal });
    list.push([g, t]); n += g.attributes.position.count;
  }
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), E = new Float32Array(n);
  let o = 0;
  for (const [g, t] of list) o = writeEntry(g, t ? toMatrix(t, _m) : null, null, P, N, C, E, o);
  return fromArrays(P, N, E, C);
}
/** Writes a kit geometry transformed by matrix m (or identity) with colour multiplier col into the arrays at vertex o. */
function writeEntry(g, m, col, P, N, C, E, o) {
  const pa = g.attributes.position.array, na = g.attributes.normal.array;
  const ca = g.attributes.color?.array, ea = g.attributes.edge?.array;
  const n = g.attributes.position.count;
  let flip = false;
  if (m) { _nm.getNormalMatrix(m); flip = m.determinant() < 0; }
  const e = m ? m.elements : null, ne = m ? _nm.elements : null;
  for (let i = 0; i < n; i++) {
    // flip winding for mirrored transforms: swap the 2nd and 3rd vertex of each triangle
    const src = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
    const j = src * 3, k = (o + i) * 3;
    const x = pa[j], y = pa[j + 1], z = pa[j + 2], nx = na[j], ny = na[j + 1], nz = na[j + 2];
    if (e) {
      P[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      let qx = ne[0] * nx + ne[3] * ny + ne[6] * nz, qy = ne[1] * nx + ne[4] * ny + ne[7] * nz, qz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(qx, qy, qz) || 1;
      N[k] = qx / l; N[k + 1] = qy / l; N[k + 2] = qz / l;
    } else { P[k] = x; P[k + 1] = y; P[k + 2] = z; N[k] = nx; N[k + 1] = ny; N[k + 2] = nz; }
    const cr = ca ? ca[j] : 1, cg = ca ? ca[j + 1] : 1, cb = ca ? ca[j + 2] : 1;
    if (C) {
      if (col) { C[k] = cr * col[0]; C[k + 1] = cg * col[1]; C[k + 2] = cb * col[2]; }
      else { C[k] = cr; C[k + 1] = cg; C[k + 2] = cb; }
    }
    if (E) E[o + i] = ea ? ea[src] : 0;
  }
  return o + n;
}

// ------------------------------------------------------------------ profiles (AD §2.1). [x, y] counter-clockwise.
export function rect(w, h, cx = 0, cy = 0) {
  const x = w / 2, y = h / 2;
  return [[cx - x, cy - y], [cx + x, cy - y], [cx + x, cy + y], [cx - x, cy + y]];
}
/** Cut corners by distance c (number, or one value per corner; 0 leaves a corner sharp). */
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
/** Round corners with radius r in `seg` steps (Founders): a quadratic arc p1 → p (control) → p2 at each corner. */
export function round(pts, r, seg = 3) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ri = Array.isArray(r) ? r[i] : r;
    if (!ri) { out.push(p); continue; }
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const k = Math.min(ri, la * 0.45, lb * 0.45);
    const p1 = [p[0] + (a[0] - p[0]) / la * k, p[1] + (a[1] - p[1]) / la * k];
    const p2 = [p[0] + (b[0] - p[0]) / lb * k, p[1] + (b[1] - p[1]) / lb * k];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg, u = 1 - t;
      out.push([u * u * p1[0] + 2 * u * t * p[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * p[1] + t * t * p2[1]]);
    }
  }
  return out;
}
/** Scale x toward the top: x *= lerp(1, k, (y − yMin) / (yMax − yMin)). Battered walls, tapered towers. */
export function taper(pts, k) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const h = y1 - y0 || 1;
  return pts.map(([x, y]) => [x * lerp(1, k, (y - y0) / h), y]);
}
/** Inset a convex (or mildly concave) counter-clockwise polygon by d (negative d grows it). */
export function offset(pts, d) {
  const n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;   // inward (left) normal of a CCW polygon
    lines.push([a[0] + nx * d, a[1] + ny * d, dx / l, dy / l]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i + n - 1) % n], L1 = lines[i];
    const den = L0[2] * L1[3] - L0[3] * L1[2];
    if (Math.abs(den) < 1e-6) { out.push([L1[0], L1[1]]); continue; }
    const t = ((L1[0] - L0[0]) * L1[3] - (L1[1] - L0[1]) * L1[2]) / den;
    out.push([L0[0] + L0[2] * t, L0[1] + L0[3] * t]);
  }
  return out;
}
/** Cut a length into widths between min and max (seeded), rescaled to sum exactly to len. Never equal cells. */
export function split(len, rng, min, max) {
  const out = [];
  let sum = 0;
  min = Math.max(1e-3, min); max = Math.max(min, max);
  while (sum < len - min * 0.5 || !out.length) { const w = lerp(min, max, rng()); out.push(w); sum += w; if (out.length > 4096) break; }
  const k = len / sum;
  return out.map(w => w * k);
}
/** n jittered widths summing to len (helper for fixed cell counts). */
function divide(len, n, rng, jitter = 0.3) {
  const w = []; let s = 0;
  for (let i = 0; i < n; i++) { const v = 1 + (rng() * 2 - 1) * jitter; w.push(v); s += v; }
  return w.map(v => v * len / s);
}

// ------------------------------------------------------------------ plates (prototype plateGeo, plus holes)
/** The prototype's extruded plate: profile pts extruded `depth`, with a bevel on every cap edge.
 *  view 'side': profile (z, y), extruded across x · 'front': (x, y) along z · 'top': (x, z) along y. Centred on the
 *  extrusion axis. o.holes: inner profiles (same view), bevelled inward for free. */
export function plateGeo(pts, depth, view, bevel, o) {
  const holes = o?.holes || null;
  const key = keyOf('plate', view, depth, bevel, pts, holes || 0);
  return cached(key, () => {
    const flip = (a) => (view === 'side' ? -a : a);
    const shape = new THREE.Shape();
    pts.forEach(([a, b], i) => { if (i) shape.lineTo(flip(a), b); else shape.moveTo(flip(a), b); });
    if (holes) for (const h of holes) {
      const path = new THREE.Path();
      h.forEach(([a, b], i) => { if (i) path.lineTo(flip(a), b); else path.moveTo(flip(a), b); });
      shape.holes.push(path);
    }
    const bv = Math.max(0, Math.min(bevel, depth * 0.3));
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv,
      bevelOffset: -bv, bevelSegments: bevel > 0.12 ? 2 : 1, curveSegments: 3 });
    g.translate(0, 0, -(depth - 2 * bv) / 2);
    if (view === 'side') g.rotateY(Math.PI / 2);       // profile given as (z, y), extruded across x
    else if (view === 'top') g.rotateX(Math.PI / 2);   // profile given as (x, z), extruded along y
    return kitFinalize(g, { edgeAxis: view === 'side' ? 'x' : view === 'top' ? 'y' : 'z' });
  });
}

/** The prototype's acKit: (parent, pts, depth, mat, x, y, z, bevel) → Mesh. ball and joint are kit geometry too. */
export function acKit(bevel) {
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  return {
    side: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'side', b), mat, x, y, z),
    front: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'front', b), mat, x, y, z),
    top: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'top', b), mat, x, y, z),
    ball: (p, r, mat, x = 0, y = 0, z = 0) => add(p, ballGeo(r), mat, x, y, z),
    joint: (p, r, len, mat, x = 0, y = 0, z = 0, axis = 'x') => {
      const m = add(p, jointGeo(r, len), mat, x, y, z);
      if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
      return m;
    },
    cells: (p, cols, rows, mat, z, w, h, y0 = 0) => {
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = (i - (cols - 1) / 2) * w / cols, y = y0 + (j - (rows - 1) / 2) * h / rows;
        add(p, plateGeo([[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]], 0.08, 'front', 0.02), mat, x, y, z);
      }
    },
  };
}
/** acKit ball: a smooth sphere (prototype SphereGeometry(r, 14, 10)) in the kit attribute set. */
export function ballGeo(r) {
  return cached(keyOf('ball', r), () => kitFinalize(new THREE.SphereGeometry(r, 14, 10), { flat: false, edgeAll: 0 }));
}
/** acKit joint: the prototype's joint cylinder (radius r, length len, along y), with chamfered rims. */
export function jointGeo(r, len) {
  return cached(keyOf('joint', r, len), () => {
    const c = Math.min(r * 0.18, len * 0.2), h = len / 2;
    return latheHard([[0, -h], [r - c, -h], [r, -h + c], [r, h - c], [r - c, h], [0, h]], 12, { edgeLen: c * 1.6 });
  });
}

// ------------------------------------------------------------------ slabs and boxes (AD §2.2)
const autoBevel = (w, h, d) => clamp(Math.min(w, h, d) * 0.08, 0.02, 1.2);
/** The default building block: a chamfered, bevelled slab w (x) × h (y) × d (z), centred on the origin.
 *  o: { bevel, chamfer (number or per-corner [bl, br, tr, tl]), taper (top width factor), view } */
export function slab(w, h, d, o = {}) {
  const b = o.bevel ?? autoBevel(w, h, d);
  const view = o.view ?? 'front';
  let pts;
  if (view === 'side') pts = rect(d, h);          // profile (z, y); extruded across x by w
  else if (view === 'top') pts = rect(w, d);      // profile (x, z); extruded along y by h
  else pts = rect(w, h);
  const depth = view === 'side' ? w : view === 'top' ? h : d;
  const c = o.chamfer ?? Math.min(b, Math.min(pts[1][0] - pts[0][0], pts[2][1] - pts[1][1]) * 0.3);
  pts = chamfer(pts, c);
  if (o.taper !== undefined && o.taper !== 1) pts = taper(pts, o.taper);
  return plateGeo(pts.map(p => [r4(p[0]), r4(p[1])]), depth, view, b);
}
/** All twelve edges bevelled (architecture signature unchanged). Cached. */
export function bevelBox(w, h, d, bevel = 0.08) { return slab(w, h, d, { bevel, chamfer: bevel }); }
/** Alias of bevelBox with an automatic bevel (proportional to the smallest side). */
export function plateBox(w, h, d, bevel) { return slab(w, h, d, { bevel: bevel ?? autoBevel(w, h, d) }); }
/** A long member: chamfered cross-section w × h extruded `len` along x, no cap bevel (cheap: 28 triangles). */
export function bar(len, w, h = w, c) {
  const ch = c ?? Math.min(w, h) * 0.18;
  return cached(keyOf('bar', len, w, h, ch), () => {
    const g = plateGeo(chamferRect(w, h, ch).map(([a, b]) => [r4(a), r4(b)]), len, 'front', 0).clone();
    g.rotateY(Math.PI / 2);   // extrusion z → x; profile x (w) → z, profile y (h) → y
    return g;
  });
}
/** A bar from point a to point b (Vector3 or [x,y,z]) with section w × h. Uncached kit geometry. */
export function barBetween(a, b, w, h = w) {
  const A = Array.isArray(a) ? _a.set(...a) : _a.copy(a), B = Array.isArray(b) ? _b.set(...b) : _b.copy(b);
  const len = A.distanceTo(B);
  const g = bar(r4(Math.max(0.01, len)), w, h).clone();
  _c.subVectors(B, A).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _c);
  _m.compose(_p.addVectors(A, B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

/** Bevelled box with real panel seams: an inset core plus one proud plate per cell on each face (irregular grid).
 *  o: { bevel, inset (0.06), cols, rows (x and y cells; z follows the x cell size), gap, cell, bottom (false), seed } */
export function panelBox(w, h, d, o = {}) {
  const mn = Math.min(w, h, d);
  const inset = o.inset ?? clamp(mn * 0.05, 0.04, 0.35);
  const gap = o.gap ?? clamp(mn * 0.03, 0.05, 0.3);
  const bevel = o.bevel ?? clamp(mn * 0.05, 0.02, 0.5);
  const cell = o.cell ?? clamp(Math.max(w, h, d) / 3, 0.8, 4);
  const cols = o.cols ?? Math.max(1, Math.round(w / cell)), rows = o.rows ?? Math.max(1, Math.round(h / cell));
  const deps = o.deps ?? Math.max(1, Math.round(d / Math.max(w / cols, h / rows, cell * 0.5)));
  const key = keyOf('panelBox', w, h, d, inset, gap, bevel, cols, rows, deps, o.bottom ? 1 : 0, o.seed ?? 0);
  return cached(key, () => {
    const rng = mulberry32(hashString(key));
    const parts = [];
    const cw = w - 2 * inset, chh = h - 2 * inset, cd = d - 2 * inset;
    parts.push(bevelBox(cw, chh, cd, Math.min(bevel, inset * 2 + 0.02)));
    const pb = clamp(Math.min(gap * 0.6, inset * 0.4), 0.01, 0.2);
    const wx = divide(cw, cols, rng), wy = divide(chh, rows, rng), wz = divide(cd, deps, rng);
    const cells = (ws) => { const out = []; let s = -ws.reduce((a, b) => a + b, 0) / 2; for (const v of ws) { out.push([s + v / 2, v]); s += v; } return out; };
    const X = cells(wx), Y = cells(wy), Z = cells(wz);
    const t = inset;
    for (const sz of [-1, 1]) for (const [x, sx] of X) for (const [y, sy] of Y)          // ±z faces
      parts.push([plateBox(r4(sx - gap), r4(sy - gap), t, pb), { pos: [x, y, sz * (d / 2 - t / 2)] }]);
    for (const sx of [-1, 1]) for (const [z, szz] of Z) for (const [y, sy] of Y)          // ±x faces
      parts.push([plateBox(t, r4(sy - gap), r4(szz - gap), pb), { pos: [sx * (w / 2 - t / 2), y, z] }]);
    for (const sy of o.bottom ? [-1, 1] : [1]) for (const [x, sx] of X) for (const [z, szz] of Z)   // top (and bottom)
      parts.push([plateBox(r4(sx - gap), t, r4(szz - gap), pb), { pos: [x, sy * (h / 2 - t / 2), z] }]);
    return kitMerge(parts);
  });
}
/** Two-layer plate: a base plate (profile pts, thickness t, 'front' view) plus a second plate offset(pts, lip) at 0.6 t,
 *  sitting proud on +z. o: { lip, bevel, view } */
export function armourPlate(pts, t, o = {}) {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const [x, y] of pts) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const lip = o.lip ?? Math.min(mxx - mnx, mxy - mny) * 0.1;
  const b = o.bevel ?? clamp(t * 0.35, 0.01, 0.4);
  const key = keyOf('armour', pts, t, lip, b, o.view || 'front');
  return cached(key, () => {
    const base = plateGeo(pts, t, 'front', b);
    const top = plateGeo(offset(pts, lip).map(p => [r4(p[0]), r4(p[1])]), t * 0.6, 'front', b * 0.8);
    const g = kitMerge([base, [top, { pos: [0, 0, t * 0.5 + t * 0.3 - 0.01] }]]);
    if (o.view === 'side') g.rotateY(Math.PI / 2);
    else if (o.view === 'top') g.rotateX(-Math.PI / 2);
    return g;
  });
}
/** A plate w (x) × h (y), thickness t (z), with raised ribs every o.pitch along x (o.axis 'y' for ribs along y). */
export function ribbedPlate(w, h, t, o = {}) {
  const pitch = o.pitch ?? Math.max(0.6, Math.min(w, h) / 6), axis = o.axis || 'x';
  const rib = o.rib ?? clamp(pitch * 0.18, 0.06, 0.6), rd = o.ribDepth ?? clamp(t * 0.6, 0.04, 0.5);
  const key = keyOf('ribbed', w, h, t, pitch, axis, rib, rd);
  return cached(key, () => {
    const parts = [bevelBox(w, h, t, clamp(Math.min(w, h, t) * 0.15, 0.01, 0.3))];
    const L = axis === 'x' ? w : h, n = Math.max(1, Math.floor((L - pitch * 0.5) / pitch));
    const span = (n - 1) * pitch;
    // ribs are chamfered bars (bevelled along their length, flat-cut ends): ~28 triangles each instead of ~100, so
    // corrugated containers, decks and roofs stay cheap (the ends are sub-pixel at any distance a rib is seen from)
    for (let i = 0; i < n; i++) {
      const s = -span / 2 + i * pitch;
      if (axis === 'x') parts.push([bar(r4(h * 0.96), rd, rib), { pos: [s, 0, t / 2 + rd / 2 - 0.01], rot: [0, 0, Math.PI / 2] }]);
      else parts.push([bar(r4(w * 0.96), rd, rib), { pos: [0, s, t / 2 + rd / 2 - 0.01] }]);
    }
    return kitMerge(parts);
  });
}

// ------------------------------------------------------------------ lathes (AD §2.3)
/** prof: [[r, y], ...] bottom to top, r ≥ 0. Smooth around the axis, hard at profile corners sharper than `crease`°.
 *  Segments shorter than edgeLen are tagged edge = 1. o: { crease (35), edgeLen (0.25), phi0, phiLen } */
export function latheHard(prof, seg = 24, o = {}) {
  const { crease = 35, edgeLen = 0.25, phi0 = 0, phiLen = TAU } = o;
  const sn = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy) || 1;
    sn.push([dy / l, -dr / l]);
  }
  const cosC = Math.cos(crease * Math.PI / 180);
  const nAt = (i, j) => {
    const a = sn[i], b = sn[j];
    if (!b || a[0] * b[0] + a[1] * b[1] < cosC) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l];
  };
  const P = [], N = [], E = [];
  const sinT = [], cosT = [];
  for (let k = 0; k <= seg; k++) { const a = phi0 + k / seg * phiLen; sinT.push(Math.sin(a)); cosT.push(Math.cos(a)); }
  const push = (r, y, n, k, e) => { P.push(r * sinT[k], y, r * cosT[k]); N.push(n[0] * sinT[k], n[1], n[0] * cosT[k]); E.push(e); };
  for (let i = 0; i < sn.length; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (Math.hypot(r1 - r0, y1 - y0) < 1e-6) continue;
    const n0 = nAt(i, i - 1), n1 = nAt(i, i + 1);
    const isEdge = Math.hypot(r1 - r0, y1 - y0) < edgeLen ? 1 : 0;
    for (let k = 0; k < seg; k++) {
      // quad (r0,k) (r1,k) (r1,k+1) (r0,k+1), wound counter-clockwise seen from outside
      if (r1 > 1e-6) { push(r0, y0, n0, k, isEdge); push(r1, y1, n1, k + 1, isEdge); push(r1, y1, n1, k, isEdge); }
      if (r0 > 1e-6) { push(r0, y0, n0, k, isEdge); push(r0, y0, n0, k + 1, isEdge); push(r1, y1, n1, k + 1, isEdge); }
    }
  }
  return fromArrays(new Float32Array(P), new Float32Array(N), new Float32Array(E));
}
const segFor = (r, lo = 8, hi = 48) => clamp(Math.round(r * 10), lo, hi);
/** Chamfered cylinder (rTop, rBot, h) centred on the origin, along y. bevel 0 → an automatic small chamfer
 *  (raw cylinders are not allowed in final art); bevel < 0 → no chamfer. */
export function cylinder(rTop, rBot, h, seg = 12, bevel = 0) {
  const b = bevel > 0 ? bevel : bevel < 0 ? 0 : clamp(Math.min(rTop || rBot, rBot || rTop, h) * 0.08, 0.005, 0.5);
  return cached(keyOf('cyl', rTop, rBot, h, seg, b), () => {
    const H = h / 2, prof = [[0, -H]];
    if (b && rBot > b) prof.push([rBot - b, -H], [rBot, -H + b]); else prof.push([rBot, -H]);
    if (b && rTop > b) prof.push([rTop, H - b], [rTop - b, H]); else prof.push([rTop, H]);
    prof.push([0, H]);
    return latheHard(prof, seg, { edgeLen: Math.max(b * 1.6, 0.001) });
  });
}
/** Elliptical dome of radius r, height h, base at y = 0, with a hatch ring at the top. */
export function dome(r, h, seg) {
  const s = seg ?? segFor(r, 12, 48);
  return cached(keyOf('dome', r, h, s), () => {
    const prof = [[0, -0.02 * h], [r * 1.03, -0.02 * h], [r * 1.03, 0.04 * h]];
    const hr = 0.2 * r;
    for (let i = 0; i <= 7; i++) {
      const th = i / 7 * Math.acos(hr / r);
      prof.push([r * Math.cos(th), 0.04 * h + (h * 0.96 - 0.04 * h) * Math.sin(th)]);
    }
    const top = prof[prof.length - 1][1];
    prof.push([hr * 1.05, top + 0.03 * h], [hr * 0.92, top + 0.06 * h], [0, top + 0.06 * h]);
    return latheHard(prof, s, { edgeLen: r * 0.12 });
  });
}
/** Hard-edged ring (replaces TorusGeometry): a lathed chamfered rectangle at radius r, radial width w, height t. */
export function ring(r, w, t, seg) {
  const s = seg ?? segFor(r, 12, 64);
  return cached(keyOf('ring', r, w, t, s), () => {
    const c = Math.min(w, t) * 0.22, ri = r - w / 2, ro = r + w / 2, h = t / 2;
    // counter-clockwise in (r, y): outer side up, top inward, inner side down, bottom outward
    const prof = [[ro - c, -h], [ro, -h + c], [ro, h - c], [ro - c, h], [ri + c, h], [ri, h - c], [ri, -h + c], [ri + c, -h], [ro - c, -h]];
    return latheHard(prof, s, { edgeLen: c * 1.8, crease: 30 });
  });
}
/** Flange around a pipe of radius r: thickness t (along y), radial width w. */
export function flange(r, t, w, seg) { return ring(r + w / 2, w, t, seg ?? segFor(r + w, 10, 40)); }
/** Barrel / water drum of radius r, height h (base at y = 0), with `ribs` rolling hoops and a recessed lid. */
export function drum(r, h, ribs = 2, seg) {
  // drums are seen up close (camp props, the Bench, mech racks): rounder than the AD minimum so the silhouette never
  // reads as a polygon at 10 m
  const s = seg ?? clamp(Math.round(r * 16), 14, 40);
  return cached(keyOf('drum', r, h, ribs, s), () => {
    const prof = [[0, 0], [r * 0.9, 0], [r, 0.03 * h]];
    const rh = Math.min(0.025 * h, r * 0.08), rw = 0.035 * h;
    for (let i = 1; i <= ribs; i++) {
      const y = h * i / (ribs + 1);
      prof.push([r, y - rw], [r + rh, y - rw * 0.4], [r + rh, y + rw * 0.4], [r, y + rw]);
    }
    prof.push([r, h * 0.97], [r * 0.97, h], [r * 0.9, h], [r * 0.88, h * 0.985], [0, h * 0.985]);
    return latheHard(prof, s, { edgeLen: r * 0.15 });
  });
}
/** Lamp head of radius r along +y: back cap, body, hood lip and a lens recess at y = 1.25 r (add the lens separately:
 *  a cylinder(r*0.82, r*0.82, 0.02) in a light material, at y = 1.24 r). */
export function lampHousing(r, seg) {
  const s = seg ?? segFor(r, 10, 24);
  return cached(keyOf('lamp', r, s), () => latheHard([[0, 0], [r * 0.55, 0], [r * 0.85, 0.18 * r], [r, 0.5 * r], [r, 1.15 * r],
    [r * 1.1, 1.2 * r], [r * 1.1, 1.36 * r], [r * 0.86, 1.36 * r], [r * 0.84, 1.25 * r], [0, 1.25 * r]], s, { edgeLen: r * 0.3 }));
}
/** The lens disc that goes in a lampHousing(r). */
export function lampLens(r) { return cylinder(r * 0.82, r * 0.82, Math.max(0.01, r * 0.04), segFor(r, 10, 24), -1); }
/** Thruster nozzle: exit radius r, length len along +y (throat at y = 0, exit at y = len); double-walled bell. */
export function nozzle(r, len, seg) {
  const s = seg ?? segFor(r, 10, 32);
  return cached(keyOf('nozzle', r, len, s), () => {
    const t = Math.max(0.02, r * 0.07);
    const prof = [[0, -0.12 * len], [r * 0.5, -0.12 * len], [r * 0.52, 0], [r * 0.48, 0.12 * len], [r * 0.62, 0.45 * len], [r * 0.86, 0.78 * len],
      [r, len], [r - t, len], [r * 0.86 - t, 0.78 * len], [r * 0.62 - t, 0.45 * len], [r * 0.46 - t, 0.15 * len], [0, 0.15 * len]];
    return latheHard(prof, s, { edgeLen: t * 2, crease: 40 });
  });
}
/** Flat disc (thin chamfered cylinder) of radius r, thickness t, centred. */
export function disc(r, t, seg) { return cylinder(r, r, t, seg ?? segFor(r, 10, 48)); }

// ------------------------------------------------------------------ pipes (AD §2.4)
/** An open cylinder from a to b (Vector3 or [x,y,z]). Smooth around its axis. Uncached. */
export function cylinderBetween(a, b, r, radial = 8, o = {}) {
  const A = Array.isArray(a) ? new THREE.Vector3(...a) : a.clone(), B = Array.isArray(b) ? new THREE.Vector3(...b) : b.clone();
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(o.r1 ?? r, r, Math.max(0.001, len), radial, 1, !o.caps);
  const dir = _c.subVectors(B, A).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  _m.compose(_p.addVectors(A, B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return kitFinalize(g, { flat: false, edgeAll: 0 });
}
function flangeAt(pos, dir, r) {
  const g = flange(r * 1.02, Math.max(0.04, r * 0.35), Math.max(0.05, r * 0.32)).clone();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _c.copy(dir).normalize());
  _m.compose(pos, _q, _s.set(1, 1, 1));
  return g.applyMatrix4(_m);
}
/** Straight runs with tight bends (never noodles). pts: polyline (Vector3 or [x,y,z]).
 *  o: { bend (2.5 r), radial, flangeEvery (0), flangeEnds (true), support: { every, groundY } } */
export function pipeRun(pts, r, o = {}) {
  const V = pts.map(p => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone()));
  const { bend = 2.5 * r, radial = clamp(Math.round(r * 24), 6, 24), flangeEvery = 0, support = null, flangeEnds = true } = o;
  const parts = [];
  for (let i = 0; i < V.length - 1; i++) {
    const a = V[i], b = V[i + 1], dir = new THREE.Vector3().subVectors(b, a).normalize();
    const segLen = a.distanceTo(b);
    const t0 = i > 0 ? Math.min(bend, segLen * 0.45) : 0, t1 = i < V.length - 2 ? Math.min(bend, segLen * 0.45) : 0;
    const s0 = a.clone().addScaledVector(dir, t0), s1 = b.clone().addScaledVector(dir, -t1);
    parts.push(cylinderBetween(s0, s1, r, radial));
    if (flangeEvery) for (let s = flangeEvery; s < s0.distanceTo(s1) - 0.1; s += flangeEvery) parts.push(flangeAt(s0.clone().addScaledVector(dir, s), dir, r));
    if (flangeEnds && i === 0) parts.push(flangeAt(s0, dir, r));
    if (flangeEnds && i === V.length - 2) parts.push(flangeAt(s1, dir, r));
    if (i < V.length - 2) {
      const nxt = new THREE.Vector3().subVectors(V[i + 2], b).normalize();
      const nl = b.distanceTo(V[i + 2]);
      const c = new THREE.QuadraticBezierCurve3(s1, b.clone(), b.clone().addScaledVector(nxt, Math.min(bend, nl * 0.45)));
      parts.push(kitFinalize(new THREE.TubeGeometry(c, 6, r, radial, false), { flat: false, edgeAll: 0 }), flangeAt(s1, dir, r), flangeAt(c.v2, nxt, r));
    }
    if (support) {
      const every = support.every || 8, gy = support.groundY ?? 0;
      for (let s = every / 2; s < segLen; s += every) {
        const p = a.clone().addScaledVector(dir, s);
        if (p.y - r - gy < 0.3) continue;
        parts.push([plateBox(r * 2.6, r * 0.5, r * 1.4), { pos: [p.x, p.y - r - r * 0.25, p.z] }]);          // shoe
        parts.push([plateBox(r * 0.7, p.y - r - gy, r * 0.7), { pos: [p.x, gy + (p.y - r - gy) / 2, p.z] }]);  // stand
      }
    }
  }
  return kitMerge(parts);
}
/** Architecture signature: a pipe through `points` (Vector3[] or [x,y,z][]), built as a pipeRun (straights + bends). */
export function pipe(points, radius, radial = 8) {
  return pipeRun(points, radius, { radial, flangeEnds: false });
}

// ------------------------------------------------------------------ trusses (AD §2.5)
/** Truss along x (length), height along y (base at y = 0), two faces `width` apart in z (0 = a single face).
 *  bays: number of bays. bar: member size; a 5th-argument object is read as { bar, pattern: 'warren'|'pratt'|'k' }. */
function gussetGeo(B) {
  // a chamfered gusset plate (AD §2.5: "chamfered plates of 2.5 × bar"); no cap bevel at this size (sub-pixel), the
  // clipped corners carry the read. Whole plate tagged as edge so the wear patch chips it.
  return cached(keyOf('gusset', B), () => kitFinalize(plateGeo(chamferRect(B * 2.4, B * 2.0, B * 0.5).map(p => [r4(p[0]), r4(p[1])]), B * 0.3, 'front', 0).clone(), { edgeAll: 1 }));
}
export function truss(length, width, height, bays, barSize = 0.25) {
  const o = typeof barSize === 'object' && barSize ? barSize : { bar: barSize };
  const B = o.bar ?? 0.25, pattern = o.pattern || 'warren';
  bays = Math.max(1, Math.round(bays));
  return cached(keyOf('truss', length, width, height, bays, B, pattern, o.gussets !== false), () => {
    const parts = [], L = length, H = height, bw = B * 0.75;
    const faces = width > 0 ? [-width / 2, width / 2] : [0];
    const xs = []; for (let i = 0; i <= bays; i++) xs.push(-L / 2 + L * i / bays);
    const yb = B / 2, yt = H - B / 2;
    for (const z of faces) {
      parts.push([bar(L, B, B), { pos: [0, yb, z] }], [bar(L, B, B), { pos: [0, yt, z] }]);
      for (const x of xs) {
        parts.push(barBetween([x, yb, z], [x, yt, z], bw, bw));
        // gusset plates on the outer face only (plain boxes: at truss scale a bevel is sub-pixel)
        if (o.gussets !== false) for (const y of [yb, yt]) parts.push([gussetGeo(B), { pos: [x, y + (y === yb ? B * 0.4 : -B * 0.4), z + (z < 0 || faces.length === 1 ? -1 : 1) * B * 0.55] }]);
      }
      for (let i = 0; i < bays; i++) {
        const x0 = xs[i], x1 = xs[i + 1], xm = (x0 + x1) / 2;
        if (pattern === 'k') {
          parts.push(barBetween([x0, yb, z], [x1, (yb + yt) / 2, z], bw * 0.8), barBetween([x0, yt, z], [x1, (yb + yt) / 2, z], bw * 0.8));
        } else if (pattern === 'pratt') {
          const toMid = xm < 0;
          parts.push(barBetween(toMid ? [x0, yt, z] : [x0, yb, z], toMid ? [x1, yb, z] : [x1, yt, z], bw * 0.8));
        } else {
          parts.push(barBetween(i % 2 ? [x0, yt, z] : [x0, yb, z], i % 2 ? [x1, yb, z] : [x1, yt, z], bw * 0.8));
        }
      }
    }
    if (width > 0) {
      for (const x of xs) for (const y of [yb, yt]) parts.push(barBetween([x, y, -width / 2], [x, y, width / 2], bw * 0.85));
      for (let i = 0; i < bays; i++) for (const y of [yb, yt]) {
        const x0 = xs[i], x1 = xs[i + 1];
        parts.push(barBetween([x0, y, -width / 2], [x1, y, width / 2], bw * 0.55), barBetween([x0, y, width / 2], [x1, y, -width / 2], bw * 0.55));
      }
    }
    return kitMerge(parts);
  });
}

// ------------------------------------------------------------------ loft (AD §2.6)
/** Skin a list of cross-sections with the same point count. sections: [{ z, pts: [[x, y], ...] }] (placed along z), or
 *  [{ pos: [x, y, z], pts }]. o: { closed (true: the section is a loop), caps (true), smooth (false) }. Uncached. */
export function loft(sections, o = {}) {
  const closed = o.closed !== false, caps = o.caps !== false;
  const S = sections.map(s => {
    const off = s.pos || [0, 0, s.z ?? 0];
    return s.pts.map(([x, y]) => [x + off[0], y + off[1], off[2]]);
  });
  const n = S[0].length, P = [];
  const quad = (a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < S.length - 1; i++) {
    const A = S[i], B = S[i + 1];
    for (let j = 0; j < (closed ? n : n - 1); j++) {
      const j1 = (j + 1) % n;
      // sections advance along +z; a CCW section (seen from +z) has outward faces with this winding
      quad(A[j], A[j1], B[j1], B[j]);
    }
  }
  if (caps && closed) {
    for (const [idx, sign] of [[0, -1], [S.length - 1, 1]]) {
      const sec = S[idx];
      const tris = THREE.ShapeUtils.triangulateShape(sec.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const t of tris) {
        const [a, b, c] = t.map(k => sec[k]);
        if (sign > 0) P.push(...a, ...b, ...c); else P.push(...a, ...c, ...b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (o.smooth) {
    const m = mergeVertices(g, 1e-4); m.computeVertexNormals();
    return kitFinalize(m, { flat: false, edgeAll: 0 });
  }
  return kitFinalize(g, { flat: true, edgeAll: 0 });
}

// ------------------------------------------------------------------ greebles (AD §2.13)
const GREEBLE = {
  vent(w, h, d) {   // louvred: a chamfered frame with slats
    const parts = [[plateGeo(chamferRect(w, h, Math.min(w, h) * 0.12).map(q => q.map(r4)), d * 0.5, 'front', d * 0.12,
      { holes: [chamferRect(w * 0.78, h * 0.72, Math.min(w, h) * 0.06).map(q => q.map(r4))] }), { pos: [0, 0, d * 0.25] }]];
    const n = clamp(Math.round(h / 0.18), 3, 6);
    for (let i = 0; i < n; i++) parts.push([plateBox(w * 0.76, h * 0.72 / n * 0.7, d * 0.12), { pos: [0, -h * 0.36 + h * 0.72 * (i + 0.5) / n, d * 0.2], rot: [-0.5, 0, 0] }]);
    return parts;
  },
  hatch(w, h, d) {   // round hatch: ring, disc, hinge blocks, handle
    const r = Math.min(w, h) * 0.45;
    return [[ring(r * 0.88, r * 0.24, d * 0.4), { pos: [0, 0, d * 0.2], rot: [Math.PI / 2, 0, 0] }],
      [disc(r * 0.78, d * 0.3), { pos: [0, 0, d * 0.15], rot: [Math.PI / 2, 0, 0] }],
      [plateBox(r * 0.35, r * 0.22, d * 0.45), { pos: [-r * 0.95, r * 0.4, d * 0.22] }], [plateBox(r * 0.35, r * 0.22, d * 0.45), { pos: [-r * 0.95, -r * 0.4, d * 0.22] }],
      [plateBox(r * 0.6, r * 0.12, d * 0.35), { pos: [r * 0.35, 0, d * 0.45] }]];
  },
  junction(w, h, d) {   // junction box with a door seam and a conduit stub
    return [[plateBox(w * 0.8, h * 0.8, d * 0.8), { pos: [0, 0, d * 0.4] }], [plateBox(w * 0.62, h * 0.6, d * 0.12), { pos: [0, h * 0.02, d * 0.84] }],
      [cylinder(Math.min(w, h) * 0.07, Math.min(w, h) * 0.07, h * 0.4, 8), { pos: [w * 0.25, -h * 0.55, d * 0.4] }]];
  },
  studs(w, h, d) {   // stud row (studs ≥ 0.12 m)
    const s = clamp(Math.min(w, h) * 0.3, 0.12, 0.4), n = clamp(Math.floor(w / (s * 2.2)), 2, 8), parts = [[plateBox(w, s * 1.4, d * 0.15), { pos: [0, 0, d * 0.075] }]];
    for (let i = 0; i < n; i++) parts.push([cylinder(s * 0.42, s * 0.48, d * 0.3, 6), { pos: [-w / 2 + w * (i + 0.5) / n, 0, d * 0.25], rot: [Math.PI / 2, 0, 0] }]);
    return parts;
  },
  fins(w, h, d) {   // heat-sink fin bank
    const n = clamp(Math.round(w / 0.16), 3, 10), parts = [[plateBox(w, h * 0.3, d * 0.2), { pos: [0, -h * 0.35, d * 0.1] }]];
    for (let i = 0; i < n; i++) parts.push([plateBox(w / n * 0.35, h * 0.9, d * 0.7), { pos: [-w / 2 + w * (i + 0.5) / n, 0, d * 0.35] }]);
    return parts;
  },
  pipes(w, h, d) {   // a short pipe run with clamps
    const r = clamp(Math.min(h, d) * 0.18, 0.04, 0.5), parts = [];
    for (const k of [-1, 1]) parts.push(cylinderBetween([-w / 2, k * h * 0.2, r * 1.2], [w / 2, k * h * 0.2, r * 1.2], r * (k > 0 ? 1 : 0.7), 8));
    parts.push([plateBox(r * 1.2, h * 0.8, r * 2.4), { pos: [-w * 0.3, 0, r * 1.2] }], [plateBox(r * 1.2, h * 0.8, r * 2.4), { pos: [w * 0.3, 0, r * 1.2] }]);
    return parts;
  },
  stack(w, h, d) {   // two stacked plates
    return [[plateBox(w * 0.9, h * 0.9, d * 0.4), { pos: [0, 0, d * 0.2] }], [plateBox(w * 0.6, h * 0.55, d * 0.35), { pos: [w * 0.08, -h * 0.08, d * 0.55] }]];
  },
  dome(w, h, d) {   // sensor dome on a plate
    const r = Math.min(w, h) * 0.32;
    return [[plateBox(w * 0.7, h * 0.7, d * 0.2), { pos: [0, 0, d * 0.1] }], [dome(r, r * 0.8, 12), { pos: [0, 0, d * 0.2], rot: [Math.PI / 2, 0, 0] }]];
  },
};
const G_TABLE = [['vent', 3], ['junction', 3], ['stack', 3], ['pipes', 2], ['studs', 2], ['fins', 2], ['hatch', 1], ['dome', 1]];
/** Greeble clusters on the local XY plane (+Z out, base at z = 0) over a w × h face. density ≈ clusters per m². */
export function greebles(rng, w, h, density = 0.2) {
  const parts = [];
  const total = G_TABLE.reduce((s, [, k]) => s + k, 0);
  const pickRecipe = () => { let r = rng() * total; for (const [n, k] of G_TABLE) { r -= k; if (r <= 0) return n; } return 'stack'; };
  const depth = clamp(Math.round(Math.log2(Math.max(1, w * h * density * 2))), 1, 7);
  const splitCell = (x, y, cw, ch, lv) => {
    if (lv >= depth || Math.min(cw, ch) < 0.3) {
      if (rng() < 0.4) return;
      const f = lerp(0.6, 0.9, rng()), gw = cw * f, gh = ch * f, d = clamp(Math.min(gw, gh) * 0.35, 0.05, 1.2);
      const name = pickRecipe();
      for (const p of GREEBLE[name](gw, gh, d)) {
        const [g, t] = Array.isArray(p) ? p : [p, null];
        const m = toMatrix(t, new THREE.Matrix4());
        m.premultiply(new THREE.Matrix4().makeTranslation(x + (rng() - 0.5) * (cw - gw), y + (rng() - 0.5) * (ch - gh), 0));
        parts.push([g, m]);
      }
      return;
    }
    const r = lerp(0.3, 0.7, rng());
    if (cw >= ch) { const a = cw * r; splitCell(x - cw / 2 + a / 2, y, a, ch, lv + 1); splitCell(x + a / 2, y, cw - a, ch, lv + 1); }
    else { const a = ch * r; splitCell(x, y - ch / 2 + a / 2, cw, a, lv + 1); splitCell(x, y + a / 2, cw, ch - a, lv + 1); }
  };
  splitCell(0, 0, w, h, 0);
  if (!parts.length) parts.push([plateBox(Math.min(w, 0.6), Math.min(h, 0.4), 0.1), { pos: [0, 0, 0.05] }]);
  return kitMerge(parts);
}
/** One named greeble (vent, hatch, junction, studs, fins, pipes, stack, dome) sized w × h × d on XY, +Z out. */
export function greeble(name, w, h, d = Math.min(w, h) * 0.35) {
  return cached(keyOf('greeble', name, w, h, d), () => kitMerge((GREEBLE[name] || GREEBLE.stack)(w, h, d)));
}

// ------------------------------------------------------------------ rocks and ice (AD §2.12)
/** Faceted rock: a displaced icosahedron cut by random planes (crisp facets), flat bottom, optional strata ledges.
 *  Unit size (about ±1); scale it. o: { detail, cuts, cutDepth, noise, squash, flatBottom, strata, strataBands, stretch } */
export function rockGeo(seed, o = {}) {
  return cached(keyOf('rock', seed, JSON.stringify(o)), () => {
    const { detail = 2, cuts = 7, cutDepth = [0.55, 0.85], noise = 0.16, squash = 0.8, flatBottom = 0.35, strata = 0, strataBands = 5, stretch = 1 } = o;
    const rng = mulberry32(seed >>> 0), n2 = createNoise2D(seed >>> 0);
    const n3 = (x, y, z) => (n2(x, y) + n2(y + 31.7, z) + n2(z - 17.3, x)) / 3;
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const planes = [];
    for (let k = 0; k < cuts; k++) {
      const u = (rng() * 2 - 1) * 0.6, a = rng() * TAU, s = Math.sqrt(1 - u * u);
      planes.push([s * Math.cos(a), u, s * Math.sin(a), lerp(cutDepth[0], cutDepth[1], rng())]);
    }
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + noise * n3(v.x * 1.7, v.y * 1.7, v.z * 1.7));
      v.y *= squash;
      for (const [nx, ny, nz, d] of planes) {
        const t = v.x * nx + v.y * ny + v.z * nz - d;
        if (t > 0) { v.x -= nx * t; v.y -= ny * t; v.z -= nz * t; }
      }
      if (v.y < -flatBottom) v.y = -flatBottom + (v.y + flatBottom) * 0.15;
      if (strata) {
        const b = Math.floor((v.y + 1) * strataBands * 0.5) % 2;
        v.x *= 1 + strata * (b ? 0.06 : -0.04); v.z *= 1 + strata * (b ? 0.06 : -0.04);
      }
      v.y *= stretch;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return kitFinalize(g, { flat: true });
  });
}
/** Sea-ice floe: a noisy top-view polygon of radius r extruded `thick` with a melted 0.3–0.6 m bevel; base at y = 0.
 *  The snow layer (inset 0.3 m, on top) is returned as geometry.userData.snow (draw it with the snow material). */
export function floe(seed, r, thick = 2) {
  return cached(keyOf('floe', seed, r, thick), () => {
    const rng = mulberry32((seed >>> 0) + 911), n2 = createNoise2D(seed >>> 0);
    const n = clamp(Math.round(r * 0.8), 9, 28), pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (rng() - 0.5) * 0.25;
      const rr = r * (0.78 + 0.18 * n2(Math.cos(a) * 1.3, Math.sin(a) * 1.3) + rng() * 0.08);
      pts.push([r4(Math.cos(a) * rr), r4(Math.sin(a) * rr)]);
    }
    const ccw = pts;   // counter-clockwise in profile space (offset() insets it)
    const bev = clamp(thick * 0.18, 0.3, 0.6);
    const body = plateGeo(ccw, thick, 'top', bev).clone();
    body.translate(0, thick / 2, 0);
    const snowPts = offset(ccw, 0.3 + r * 0.02).map(p => [r4(p[0]), r4(p[1])]);
    const snow = plateGeo(snowPts, 0.22, 'top', 0.08).clone();
    snow.translate(0, thick + 0.06, 0);
    body.userData.snow = shared(snow);
    return body;
  });
}
/** Pressure ridge: tilted ice slabs and blocks piled along a path ([[x, z], ...] or Vector3s), up to height h.
 *  o: { seed, width (h * 0.9), density (1) } */
export function pressureRidge(path, h = 10, o = {}) {
  const P = path.map(p => (Array.isArray(p) ? [p[0], p.length > 2 ? p[2] : p[1]] : [p.x, p.z]));
  return cached(keyOf('ridge', P, h, o.seed ?? 1, o.width ?? 0, o.density ?? 1), () => {
    const rng = mulberry32((o.seed ?? 1) * 7919 + 13);
    const width = o.width ?? h * 0.9, parts = [];
    // slab sizes follow AD §2.12 (4–12 × 2–6 × 0.6–1.5 m) for ridges of 8 to 25 m; small ridges scale them down
    const ks = clamp(h / 10, 0.3, 1);
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      const dx = (x1 - x0) / L, dz = (z1 - z0) / L, yaw = Math.atan2(-dz, dx);
      const step = 3.2 * ks / (o.density ?? 1);
      for (let s = 0; s < L; s += step * lerp(0.7, 1.3, rng())) {
        const lat = (rng() - 0.5) * width * 0.6, hh = h * (0.35 + 0.65 * Math.sin(Math.PI * (s / L) * 0.8 + 0.3) * lerp(0.6, 1, rng()));
        const cx = x0 + dx * s - dz * lat, cz = z0 + dz * s + dx * lat;
        const deep = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < deep; k++) {
          const sw = lerp(4, 12, rng()) * ks * (hh / h * 0.6 + 0.4), sh = lerp(2, 6, rng()) * ks * (hh / h * 0.5 + 0.5), st = lerp(0.6, 1.5, rng()) * Math.sqrt(ks);
          const tilt = lerp(20, 70, rng()) * Math.PI / 180 * (rng() < 0.5 ? -1 : 1);
          const y = k * hh / deep * 0.6 + sh * 0.3;
          parts.push([plateBox(r4(sw), r4(sh), r4(st), 0.12), { pos: [cx + (rng() - 0.5) * 2, y, cz + (rng() - 0.5) * 2],
            rot: [tilt, yaw + (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.4], order: 'YXZ' }]);
        }
        if (rng() < 0.6) {
          const bs = lerp(1, 2.6, rng());
          parts.push([rockGeo(Math.floor(rng() * 1e6), { cuts: 10, noise: 0.04 }), { pos: [cx + (rng() - 0.5) * width * 0.5, bs * 0.3, cz + (rng() - 0.5) * width * 0.5],
            rot: [rng() * TAU, rng() * TAU, 0], scale: bs }]);
        }
      }
    }
    return kitMerge(parts);
  });
}
/** A row of icicles hanging under an edge from a to b (Vector3 or [x,y,z]): n thin lathed spikes. o: { len (1.6), r (0.12), seed } */
export function icicles(edge, n = 8, o = {}) {
  const [a, b] = edge.map(p => (Array.isArray(p) ? p : [p.x, p.y, p.z]));
  return cached(keyOf('icicles', a, b, n, o.len ?? 1.6, o.r ?? 0.12, o.seed ?? 1), () => {
    const rng = mulberry32((o.seed ?? 1) * 104729 + n);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (rng() - 0.5) * 0.6) / n;
      const len = (o.len ?? 1.6) * lerp(0.25, 1.15, rng() * rng() + 0.2), r = (o.r ?? 0.12) * lerp(0.6, 1.3, rng());
      const g = latheHard([[0, -len], [r * 0.25, -len * 0.8], [r * 0.7, -len * 0.3], [r, 0], [0, 0.02]], 6, { edgeLen: 0 });
      parts.push([g, { pos: [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] }]);
    }
    return kitMerge(parts);
  });
}

// ------------------------------------------------------------------ GeoBuilder: merge per material
/** Collects kit geometry with transforms and materials; build() merges one Mesh per material (≤ 6 draw calls per
 *  structure when you stay within 5 materials + 1 emissive); buildSingle() merges everything into one vertex-coloured
 *  mesh (LOD1, far silhouettes). Inputs without the kit attribute set are normalised (kitFinalize on a copy). */
export class GeoBuilder {
  constructor(seed = 1) { this.entries = []; this.rng = mulberry32((seed >>> 0) || 1); }
  /** t: Matrix4 or { pos, rot, scale, tint, lod0, lod1 }. o: { tint (number: value jitter ±, or [r,g,b] / Color),
   *  lod0 (detail: skipped by buildSingle), lod1 (a simplified stand-in: only in buildSingle) } */
  add(g, m, t, o) {
    if (!g || !m) return this;
    if (!isKit(g)) g = kitFinalize(g.clone(), { flat: !g.attributes.normal });
    const tint = o?.tint ?? (t && !t.isMatrix4 ? t.tint : undefined);
    let col = null;
    if (typeof tint === 'number' && tint) { const f = 1 + (this.rng() * 2 - 1) * tint; col = [f, f, f]; }
    else if (tint && tint.isColor) col = [tint.r, tint.g, tint.b];
    else if (Array.isArray(tint)) col = tint.slice(0, 3);
    this.entries.push({ g, m, mat: toMatrix(t, new THREE.Matrix4()), col, lod0: !!(o?.lod0 ?? (t && !t.isMatrix4 && t.lod0)),
                        lod1: !!(o?.lod1 ?? (t && !t.isMatrix4 && t.lod1)) });
    return this;
  }
  /** Adds every descendant mesh of `o`, with its transform relative to `o`. */
  addObject(o, opts) {
    o.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    o.traverse(c => {
      if (!c.isMesh || !c.geometry || c.isSkinnedMesh || c.isInstancedMesh) return;
      let vis = true; for (let p = c; p && p !== o; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis && !opts?.hidden) return;
      const mat = Array.isArray(c.material) ? c.material[0] : c.material;
      this.add(c.geometry, mat, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld), opts);
    });
    return this;
  }
  get count() { return this.entries.length; }
  triangles(filter) { let n = 0; for (const e of this.entries) if (!filter || filter(e)) n += e.g.attributes.position.count / 3; return n; }
  /** A builder view that applies `base` (Matrix4) before every transform (compose sub-assemblies). */
  under(base) {
    const B = this, M4 = new THREE.Matrix4();
    return {
      rng: B.rng, entries: B.entries,
      add(g, m, t, o) {
        const tt = toMatrix(t, M4.clone()).premultiply(base);
        const tint = o?.tint ?? (t && !t.isMatrix4 ? t.tint : undefined);
        const lod0 = o?.lod0 ?? (t && !t.isMatrix4 ? t.lod0 : undefined), lod1 = o?.lod1 ?? (t && !t.isMatrix4 ? t.lod1 : undefined);
        B.add(g, m, tt, { tint, lod0, lod1 });
        return this;
      },
      under(b2) { return B.under(base.clone().multiply(b2)); },
    };
  }
  /** Merged geometry of every entry using material m (or all entries when m is null). */
  mergedFor(m, single = null) {
    const list = this.entries.filter(e => (m ? e.m === m : true) && (single ? !e.lod0 : !e.lod1));
    let n = 0; for (const e of list) n += e.g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), E = new Float32Array(n);
    let o = 0;
    for (const e of list) {
      let col = e.col;
      if (single) { const c = single(e.m); col = [c.r * (col ? col[0] : 1), c.g * (col ? col[1] : 1), c.b * (col ? col[2] : 1)]; }
      const o0 = o;
      o = writeEntry(e.g, e.mat, col, P, N, C, E, o);
      if (single) for (let i = o0; i < o; i++) if (E[i] > 0.5) { C[i * 3] *= 1.08; C[i * 3 + 1] *= 1.08; C[i * 3 + 2] *= 1.08; }   // edge lightening
    }
    const g = fromArrays(P, N, E, C);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  /** One merged Mesh per material, in a Group. o: { castShadow (true), receiveShadow (true), name } */
  build(o = {}) {
    const root = new THREE.Group();
    if (o.name) root.name = o.name;
    const mats = [];
    for (const e of this.entries) if (!e.lod1 && !mats.includes(e.m)) mats.push(e.m);
    let tris = 0;
    for (const m of mats) {
      const g = this.mergedFor(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = o.castShadow ?? true; mesh.receiveShadow = o.receiveShadow ?? true;
      if (m.blending === THREE.AdditiveBlending || m.transparent) mesh.castShadow = false;
      if (m.name) mesh.name = m.name;
      root.add(mesh);
      tris += g.attributes.position.count / 3;
    }
    root.userData.triangles = tris;
    return root;
  }
  /** Everything as one mesh with baked vertex colours (colorOf(material) × tint, edges +8%); lod0 entries dropped.
   *  o: { material (a vertex-colour material; default a shared one), castShadow } */
  buildSingle(colorOf, o = {}) {
    const cf = colorOf || defaultColorOf;
    const g = this.mergedFor(null, (m) => cf(m) || defaultColorOf(m));
    const mesh = new THREE.Mesh(g, o.material || singleMaterial());
    mesh.castShadow = o.castShadow ?? false; mesh.receiveShadow = true;
    mesh.userData.triangles = g.attributes.position.count / 3;
    return mesh;
  }
}
const _dc = new THREE.Color();
/** The average display colour of a material: emissive for black-based lamp materials, else its colour. */
export function defaultColorOf(m) {
  if (!m) return _dc.set(0x808080);
  const c = m.color || _dc.set(0x808080);
  if (m.emissive && c.r + c.g + c.b < 0.05 && m.emissiveIntensity > 0) return _dc.copy(m.emissive).multiplyScalar(Math.min(2.5, m.emissiveIntensity));
  return _dc.copy(c);
}
let _single = null;
function singleMaterial() {
  if (!_single) { _single = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.4 }); _single.userData.shared = true; _single.name = 'kitSingle'; }
  return _single;
}

// ------------------------------------------------------------------ rigid skinning
/** Converts a hierarchy of bone groups with attached plate meshes into one SkinnedMesh per material (rigid weights:
 *  skinIndex = owning bone, weight 1). The bone objects keep their names and references, so animation that rotates
 *  bones still works. Additive or transparent meshes, invisible meshes, and meshes flagged userData.noBake stay as they
 *  are (unless flagged userData.bakeAdditive: then they bake too, one mesh per material, no shadows). Sets a generous
 *  manual boundingSphere. Returns root; root.userData.rigidBake holds the sources (unbakeRigid).
 *  o: { sphere: { center: [x,y,z], r }, castShadow } */
export function bakeRigid(root, o = {}) {
  if (root.userData.rigidBake) unbakeRigid(root);
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const list = [];
  root.traverse(c => {
    if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || c.userData.noBake) return;
    const m = c.material;
    if (!m || Array.isArray(m)) return;
    if ((m.transparent || m.blending !== THREE.NormalBlending) && !c.userData.bakeAdditive) return;
    for (let p = c; p && p !== root; p = p.parent) if (!p.visible) return;
    list.push(c);
  });
  const inSet = new Set(list);
  const bones = [], boneIndex = new Map(), byMat = new Map();
  let shadow = false;
  for (const mesh of list) {
    let b = mesh.parent; while (inSet.has(b)) b = b.parent;
    if (!boneIndex.has(b)) { boneIndex.set(b, bones.length); bones.push(b); }
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    byMat.get(mesh.material).push([mesh, boneIndex.get(b)]);
    shadow = shadow || mesh.castShadow;
  }
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  const M = new THREE.Matrix4();
  for (const [mat, items] of byMat) {
    let n = 0;
    const geos = items.map(([mesh]) => { const g = isKit(mesh.geometry) ? mesh.geometry : kitFinalize(mesh.geometry.clone(), { flat: false }); n += g.attributes.position.count; return g; });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), E = new Float32Array(n);
    const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    let off = 0;
    items.forEach(([mesh, bi], k) => {
      M.multiplyMatrices(rootInv, mesh.matrixWorld);
      const o0 = off;
      off = writeEntry(geos[k], M, null, P, N, C, E, off);
      for (let i = o0; i < off; i++) { SI[i * 4] = bi; SW[i * 4] = 1; }
    });
    const g = fromArrays(P, N, E, C);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const sm = new THREE.SkinnedMesh(g, mat);
    sm.name = 'baked:' + (mat.name || meshes.length);
    const additive = mat.transparent || mat.blending !== THREE.NormalBlending;
    sm.castShadow = additive ? false : (o.castShadow ?? shadow); sm.receiveShadow = !additive;
    sm.userData.noBake = true;
    root.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    const bs = g.boundingSphere;
    sm.boundingSphere = o.sphere ? new THREE.Sphere(new THREE.Vector3(...o.sphere.center), o.sphere.r)
                                 : new THREE.Sphere(bs.center.clone(), bs.radius * 1.4 + 1);
    meshes.push(sm);
  }
  const sources = list.map(mesh => ({ mesh, parent: mesh.parent }));
  for (const s of sources) s.parent.remove(s.mesh);
  root.userData.rigidBake = { meshes, sources, skeleton, drawCalls: meshes.length };
  return root;
}
/** Restores the source meshes of a bakeRigid(root) and disposes the skinned meshes. */
export function unbakeRigid(root) {
  const b = root.userData.rigidBake;
  if (!b) return root;
  for (const sm of b.meshes) { sm.parent?.remove(sm); sm.geometry.dispose(); }
  for (const s of b.sources) s.parent.add(s.mesh);
  b.skeleton.dispose();
  delete root.userData.rigidBake;
  return root;
}

/** Cache statistics (tests). */
export function kitCacheStats() { let tris = 0; for (const g of CACHE.values()) tris += (g.attributes.position?.count || 0) / 3; return { entries: CACHE.size, triangles: tris }; }
