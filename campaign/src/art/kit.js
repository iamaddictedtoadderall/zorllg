// art/kit.js (P3) — P0 STUB: VERBATIM port of the prototype's plateGeo/acKit (bevelled extruded plates),
// plus simple stand-ins for the rest of the kit (bevelBox = BoxGeometry, GeoBuilder groups without merging,
// bakeRigid returns its input). Cached geometries are marked userData.shared (never mutate them; clone first).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const shared = (g) => { g.userData.shared = true; return g; };

// ------------------------------------------------------------------ prototype port (AC model)
// Frames share one skeleton (pelvis, legs, torso, head, arms, pod) so animation and weapon anchors stay the same;
// each design dresses it in bevelled armour plates extruded from 2D profiles. Forward is -z.
const acGeoCache = new Map();
export function plateGeo(pts, depth, view, bevel) {
  const key = `${view}|${depth}|${bevel}|${pts.join(';')}`;
  let g = acGeoCache.get(key);
  if (g) return g;
  const shape = new THREE.Shape();
  pts.forEach(([a, b], i) => { const u = view === 'side' ? -a : a; if (i) shape.lineTo(u, b); else shape.moveTo(u, b); });
  const bv = Math.min(bevel, depth * 0.3);
  g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: bevel > 0.12 ? 2 : 1, curveSegments: 3 });
  g.translate(0, 0, -(depth - 2 * bv) / 2);
  if (view === 'side') g.rotateY(Math.PI / 2);       // profile given as (z, y), extruded across x
  else if (view === 'top') g.rotateX(Math.PI / 2);   // profile given as (x, z), extruded along y
  shared(g);
  acGeoCache.set(key, g);
  return g;
}
const sphereCache = new Map(), jointCache = new Map();
function sphereGeo(r) { let g = sphereCache.get(r); if (!g) { g = shared(new THREE.SphereGeometry(r, 14, 10)); sphereCache.set(r, g); } return g; }
function jointGeo(r, len) { const k = r + '|' + len; let g = jointCache.get(k); if (!g) { g = shared(new THREE.CylinderGeometry(r, r, len, 12)); jointCache.set(k, g); } return g; }
export function acKit(bevel) {
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  return {
    side: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'side', b), mat, x, y, z),
    front: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'front', b), mat, x, y, z),
    top: (p, pts, d, mat, x = 0, y = 0, z = 0, b = bevel) => add(p, plateGeo(pts, d, 'top', b), mat, x, y, z),
    ball: (p, r, mat, x = 0, y = 0, z = 0) => add(p, sphereGeo(r), mat, x, y, z),
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

// ------------------------------------------------------------------ stand-ins (P3 replaces)
const boxCache = new Map(), cylCache = new Map();
/** stub: a plain (cached) BoxGeometry */
export function bevelBox(w, h, d, bevel = 0.08) {
  const k = `${w}|${h}|${d}`;
  let g = boxCache.get(k);
  if (!g) { g = shared(new THREE.BoxGeometry(w, h, d)); boxCache.set(k, g); }
  return g;
}
/** stub: same as bevelBox */
export function panelBox(w, h, d, o = {}) { return bevelBox(w, h, d, o.bevel); }
export function cylinder(rTop, rBot, h, seg = 12, bevel = 0) {
  const k = `${rTop}|${rBot}|${h}|${seg}`;
  let g = cylCache.get(k);
  if (!g) { g = shared(new THREE.CylinderGeometry(rTop, rBot, h, seg)); cylCache.set(k, g); }
  return g;
}
export function pipe(points, radius, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => p.clone ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 4), radius, radial, false);
}
/** stub: a box the size of the truss */
export function truss(length, width, height, bays, bar = 0.25) { return new THREE.BoxGeometry(length, height, width); }
/** stub: a few small boxes on the local XY plane, +Z out */
export function greebles(rng, w, h, density) {
  const n = Math.max(1, Math.round(w * h * density));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = 0.15 + rng() * 0.4, g = new THREE.BoxGeometry(s, s * (0.5 + rng()), s * 0.5);
    g.translate((rng() - 0.5) * w, (rng() - 0.5) * h, s * 0.25);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** stub: groups parts as separate meshes (no merging). buildSingle() does merge, with vertex colours. */
export class GeoBuilder {
  constructor() { this.parts = []; }
  add(g, m, t) {
    let mat;
    if (!t) mat = new THREE.Matrix4();
    else if (t.isMatrix4) mat = t.clone();
    else {
      _p.set(...(t.pos || [0, 0, 0]));
      _e.set(...(t.rot || [0, 0, 0])); _q.setFromEuler(_e);
      const sc = t.scale ?? 1; if (Array.isArray(sc)) _s.set(...sc); else _s.set(sc, sc, sc);
      mat = new THREE.Matrix4().compose(_p, _q, _s);
    }
    this.parts.push({ g, m, mat });
    return this;
  }
  addObject(o) {
    o.updateMatrixWorld(true);
    const inv = _m4.copy(o.matrixWorld).invert();
    o.traverse(c => { if (c.isMesh && c.geometry) this.parts.push({ g: c.geometry, m: c.material, mat: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld) }); });
    return this;
  }
  build(o = {}) {
    const root = new THREE.Group();
    if (o.name) root.name = o.name;
    for (const p of this.parts) {
      const mesh = new THREE.Mesh(p.g, p.m);
      p.mat.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = o.castShadow ?? true; mesh.receiveShadow = o.receiveShadow ?? true;
      root.add(mesh);
    }
    return root;
  }
  buildSingle(colorOf) {
    const geos = [];
    for (const p of this.parts) {
      let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      g.applyMatrix4(p.mat);
      const keep = new THREE.BufferGeometry();
      keep.setAttribute('position', g.attributes.position);
      if (!g.attributes.normal) g.computeVertexNormals();
      keep.setAttribute('normal', g.attributes.normal);
      const c = colorOf ? colorOf(p.m) : new THREE.Color(0x808080);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      keep.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(keep);
      if (g !== p.g) g.dispose();
    }
    const merged = geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry();
    return new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.2 }));
  }
}

/** stub: returns its input unchanged (P3 bakes Bone hierarchies into rigid SkinnedMeshes) */
export function bakeRigid(root) { return root; }
