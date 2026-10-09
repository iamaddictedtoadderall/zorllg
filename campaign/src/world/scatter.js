// world/scatter.js (P2): prop registry, natural props, instanced scatter and prop colliders (arch §5.9, AD §2.12, §3.8,
// addendum A5.5).
//
// Registry: registerProp(name, factory(ctx) → PropType). P2 registers the natural props at module load:
//   rock_small, rock_medium, rock_large, boulder, spire, slab, pebbles, scrub, grass_tuft, dead_tree, stump,
//   ice_shard, snow_drift
// each with three seeded variants `name#0..2` (a layer naming `rock_small` picks a variant per instance). P3 registers
// the man-made props. Natural rocks are faceted: a displaced icosahedron cut by random planes (AD §2.12). Materials
// follow the level palette (ctx.atmosphere.art) and share the terrain's world-space detail and snow mask.
//
// Scatter: generate() places every layer for the whole level, deterministically from the level seed and the layer:
// a jittered grid sized from the layer density, rejected by range, route band, avoidRoute, slope, height, surface and
// exclusion discs, with an extra preference for slope breaks and gullies for rocks (AD §3.8). Instances with scale ≥
// collideMinScale on `collide` layers register a circle collider (radius × scale × 0.85, top = ground + height ×
// scale × 0.7) and are kept on every tier, so gameplay is identical on every tier; the purely visual instances are
// thinned by tier.scatterDensity. Instances (matrix + tint) are stored in 64 m cells. Route coordinates come from the
// heightfield's lattice (routeCoord). Ground-cover layers (maxDist ≤ 150 m, no collide) exist only when tier.groundCover.
// update(focus) refills one InstancedMesh per prop type (per variant) from the cells within maxDist ×
// tier.scatterDistance, nearest cells first, every 8 m of movement or 15 calls. Layers with castShadow get a second
// small mesh for the instances inside the shadow box (High/Medium only); nothing else casts.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smooth, lerp, mulberry32, hashString, TAU } from '../core/util.js';
import { createNoise2D } from '../core/noise.js';

const REGISTRY = new Map();

/** Global prop registry. P2 registers natural props, P3 registers man-made props (Appendix C.2). */
export function registerProp(name, factory) {
  if (typeof factory !== 'function') throw new Error(`registerProp(${name}): factory must be a function`);
  REGISTRY.set(name, factory);
}
export function propNames() { return [...REGISTRY.keys()]; }
/** extra: look up a factory */
export function propFactory(name) { return REGISTRY.get(name) || null; }

// ====================================================================== natural prop geometry
const GEO = new Map();
const V = new THREE.Vector3();

function finalize(g, flat) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'color') g.deleteAttribute(k);
  if (flat) g.computeVertexNormals(); else { const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); g = m.toNonIndexed(); }
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.shared = true;
  return g;
}
/** vertex colours: ambient occlusion by height and a little noise (multiplied by the material colour) */
function shadeAO(g, seed, lo = 0.55, hi = 1.0, noiseAmt = 0.12) {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  g.computeBoundingBox();
  const b = g.boundingBox, n2 = createNoise2D(seed);
  for (let i = 0; i < n; i++) {
    V.fromBufferAttribute(p, i);
    const t = smooth(b.min.y, b.max.y, V.y);
    const v = lerp(lo, hi, Math.sqrt(t)) * (1 + noiseAmt * n2(V.x * 1.3 + V.y, V.z * 1.3 - V.y));
    col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** AD §2.12 faceted rock: displaced icosahedron flattened against random planes. Base at y = 0, unit-ish radius. */
function rockGeo(seed, o = {}) {
  const { detail = 2, cuts = 7, cutDepth = [0.55, 0.85], noise = 0.16, squash = 0.8, flatBottom = 0.35, strata = 0, strataBands = 5,
          stretch = 1 } = o;
  const rng = mulberry32(seed), n2 = createNoise2D(seed);
  const n3 = (x, y, z) => (n2(x, y) + n2(y + 31.7, z) + n2(z - 17.3, x)) / 3;
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const u = (rng() * 2 - 1) * 0.6, a = rng() * TAU, s = Math.sqrt(1 - u * u);
    planes.push([s * Math.cos(a), u, s * Math.sin(a), lerp(cutDepth[0], cutDepth[1], rng())]);
  }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    V.multiplyScalar(1 + noise * n3(V.x * 1.7, V.y * 1.7, V.z * 1.7));
    V.y *= squash;
    for (const [nx, ny, nz, d] of planes) {
      const t = V.x * nx + V.y * ny + V.z * nz - d;
      if (t > 0) { V.x -= nx * t; V.y -= ny * t; V.z -= nz * t; }
    }
    if (V.y < -flatBottom) V.y = -flatBottom + (V.y + flatBottom) * 0.15;
    if (strata) {
      const b = Math.floor((V.y + 1) * strataBands * 0.5) % 2;
      V.x *= 1 + strata * (b ? 0.06 : -0.04); V.z *= 1 + strata * (b ? 0.06 : -0.04);
    }
    V.y *= stretch;
    p.setXYZ(i, V.x, V.y, V.z);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  return g;
}
function rockType(seed, o, size) {
  let g = rockGeo(seed, o);
  g.scale(size[0], size[1], size[0]);
  g = finalize(g, true);
  return shadeAO(g, seed, 0.5, 1.05, 0.14);
}
function pebblesGeo(seed) {
  const rng = mulberry32(seed), parts = [];
  const n = 7 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const r = 0.07 + 0.16 * Math.pow(rng(), 2), a = rng() * TAU, d = Math.sqrt(rng()) * 0.85;
    let g = rockGeo(seed * 31 + i, { detail: 0, cuts: 4, noise: 0.25, squash: 0.6 });
    g.scale(r, r * 0.8, r); g.rotateY(rng() * TAU); g.translate(Math.cos(a) * d, -r * 0.15, Math.sin(a) * d);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const g = finalize(mergeGeometries(parts.map(q => { q.deleteAttribute('uv'); q.deleteAttribute('normal'); return q; })), true);
  return shadeAO(g, seed, 0.6, 1, 0.1);
}
function bladeTuft(seed, n, h, w, spread, lean) {
  const rng = mulberry32(seed), pos = [], col = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * spread, bh = h * (0.6 + 0.6 * rng()), bw = w * (0.7 + 0.6 * rng());
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d, la = a + (rng() - 0.5) * 1.2, ld = lean * (0.4 + rng());
    const px = -Math.sin(la), pz = Math.cos(la);         // blade width direction
    const tip = [bx + Math.cos(la) * ld * bh, bh, bz + Math.sin(la) * ld * bh];
    const mid = [bx + Math.cos(la) * ld * bh * 0.35, bh * 0.55, bz + Math.sin(la) * ld * bh * 0.35];
    const b0 = [bx - px * bw, 0, bz - pz * bw], b1 = [bx + px * bw, 0, bz + pz * bw];
    const m0 = [mid[0] - px * bw * 0.6, mid[1], mid[2] - pz * bw * 0.6], m1 = [mid[0] + px * bw * 0.6, mid[1], mid[2] + pz * bw * 0.6];
    const tris = [[b0, b1, m1], [b0, m1, m0], [m0, m1, tip]];
    for (const t of tris) for (const v of t) { pos.push(...v); const k = 0.45 + 0.6 * (v[1] / bh); col.push(k, k, k * 0.95); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // tufts read better with up-facing normals (no dark backsides)
  const nm = g.attributes.normal;
  for (let i = 0; i < nm.count; i++) { V.fromBufferAttribute(nm, i); V.y = Math.abs(V.y) + 0.8; V.normalize(); nm.setXYZ(i, V.x, V.y, V.z); }
  g.computeBoundingSphere(); g.userData.shared = true;
  return g;
}
function scrubGeo(seed) {
  const rng = mulberry32(seed), parts = [];
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.25 + 0.3 * rng(), a = rng() * TAU, d = rng() * 0.45;
    let g = new THREE.IcosahedronGeometry(r, 1);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
    const p = g.attributes.position, n2 = createNoise2D(seed + i);
    for (let k = 0; k < p.count; k++) { V.fromBufferAttribute(p, k); V.multiplyScalar(1 + 0.35 * n2(V.x * 4, V.z * 4 + V.y * 3)); p.setXYZ(k, V.x, V.y, V.z); }
    g.scale(1, 0.62, 1); g.translate(Math.cos(a) * d, r * 0.5 + 0.05, Math.sin(a) * d);
    parts.push(g.toNonIndexed());
  }
  for (let i = 0; i < 6; i++) {          // twigs
    const h = 0.4 + 0.5 * rng(), g = new THREE.CylinderGeometry(0.005, 0.02, h, 3, 1, true);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.translate(0, h / 2, 0); g.rotateZ((rng() - 0.5) * 1.2); g.rotateY(rng() * TAU);
    g.translate((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6);
    parts.push(g.toNonIndexed());
  }
  const g = finalize(mergeGeometries(parts), true);
  return shadeAO(g, seed, 0.45, 1.05, 0.25);
}
function treeGeo(seed, dead = true) {
  const rng = mulberry32(seed), parts = [];
  const seg = (a, b, r0, r1, sides = 6) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, sides, 1, false);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g.toNonIndexed());
  };
  const H = 4.5 + 3 * rng();
  let p = new THREE.Vector3(0, -0.2, 0), r = 0.32 + 0.1 * rng();
  const dir = new THREE.Vector3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3).normalize();
  const trunk = [];
  for (let i = 0; i < 5; i++) {
    const q = p.clone().addScaledVector(dir, H / 5);
    const r1 = r * 0.78; seg(p, q, r, r1, 7); trunk.push({ p: q.clone(), r: r1 });
    p = q; r = r1;
    dir.x += (rng() - 0.5) * 0.35; dir.z += (rng() - 0.5) * 0.35; dir.normalize();
  }
  const nb = dead ? 4 + Math.floor(rng() * 3) : 6;
  for (let b = 0; b < nb; b++) {
    const t = trunk[1 + Math.floor(rng() * (trunk.length - 1))];
    const a = rng() * TAU, up = 0.4 + 0.6 * rng();
    let bp = t.p.clone(), br = t.r * 0.55;
    const bd = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const L = (1 + 1.6 * rng()) * (dead ? 1 : 0.8);
    for (let k = 0; k < 3; k++) {
      const q = bp.clone().addScaledVector(bd, L / 3);
      seg(bp, q, br, br * 0.6, 5);
      bp = q; br *= 0.6; bd.y += (rng() - 0.3) * 0.4; bd.x += (rng() - 0.5) * 0.4; bd.normalize();
    }
  }
  const g = finalize(mergeGeometries(parts), true);
  return shadeAO(g, seed, 0.55, 1.0, 0.18);
}
function stumpGeo(seed) {
  const rng = mulberry32(seed), parts = [];
  let g = new THREE.CylinderGeometry(0.34, 0.48, 0.8, 9, 2, false);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    if (V.y > 0.3) V.y += (rng() - 0.3) * 0.35;           // jagged break
    V.x *= 1 + (rng() - 0.5) * 0.12; V.z *= 1 + (rng() - 0.5) * 0.12;
    p.setXYZ(i, V.x, V.y, V.z);
  }
  g.translate(0, 0.4, 0);
  parts.push(g.toNonIndexed());
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + rng() * 0.6, r = new THREE.CylinderGeometry(0.03, 0.14, 0.9, 5, 1, false);
    r.deleteAttribute('uv'); r.deleteAttribute('normal');
    r.rotateZ(Math.PI / 2 - 0.25); r.translate(0.42, 0.06, 0); r.rotateY(a);
    parts.push(r.toNonIndexed());
  }
  const out = finalize(mergeGeometries(parts), true);
  return shadeAO(out, seed, 0.5, 1.0, 0.15);
}
function iceShardGeo(seed) {
  const rng = mulberry32(seed), parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.25 + 0.55 * rng(), r = 0.04 + 0.07 * rng(), sides = 4 + Math.floor(rng() * 2);
    let g = new THREE.CylinderGeometry(0.0, r, h, sides, 1, false);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { V.fromBufferAttribute(p, k); if (V.y > 0) { V.x += (rng() - 0.5) * r * 0.8; V.z += (rng() - 0.5) * r * 0.8; } p.setXYZ(k, V.x, V.y, V.z); }
    g.translate(0, h / 2 - 0.05, 0);
    g.rotateZ((rng() - 0.5) * 1.1); g.rotateX((rng() - 0.5) * 1.1);
    g.translate((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
    parts.push(g.toNonIndexed());
  }
  const g = finalize(mergeGeometries(parts), true);
  // depth tint: bluer at the base, near-white at the tips
  const pc = g.attributes.position, col = new Float32Array(pc.count * 3);
  g.computeBoundingBox();
  for (let i = 0; i < pc.count; i++) {
    const t = smooth(g.boundingBox.min.y, g.boundingBox.max.y, pc.getY(i));
    col[i * 3] = lerp(0.55, 1.0, t); col[i * 3 + 1] = lerp(0.75, 1.0, t); col[i * 3 + 2] = 1.0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function driftGeo(seed) {
  const rng = mulberry32(seed), n2 = createNoise2D(seed);
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const len = 2.6 + 1.2 * rng(), hgt = 0.55 + 0.25 * rng(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    const r = 1 + 0.12 * n2(V.x * 2.1, V.z * 2.1);
    V.x *= len * r; V.z *= 1.1 * r;
    // windward face gentle, lee face steeper: skew the crest toward +x
    V.y = Math.max(0, V.y) * hgt * (1 - 0.25 * V.x / len) ;
    V.x += V.y * 0.8;
    p.setXYZ(i, V.x, V.y - 0.05, V.z);
  }
  g = finalize(g, false);
  const pc = g.attributes.position, col = new Float32Array(pc.count * 3);
  for (let i = 0; i < pc.count; i++) { const k = 0.82 + 0.18 * smooth(-0.05, 0.4, pc.getY(i)); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** natural prop specs: geometry builder, material kind, footprint and placement defaults */
const NATURAL = {
  rock_small: { kind: 'rock', radius: 0.5, height: 0.6, collider: 'circle', align: 0.7, sink: 0.18, rock: true,
                geo: (s) => rockType(s, { cuts: 6, noise: 0.2 }, [0.5, 0.6]) },
  rock_medium: { kind: 'rock', radius: 1.0, height: 1.1, collider: 'circle', align: 0.7, sink: 0.2, rock: true,
                 geo: (s) => rockType(s, { cuts: 7 }, [1.0, 1.1]) },
  rock_large: { kind: 'rock', radius: 2.0, height: 2.0, collider: 'circle', align: 0.6, sink: 0.22, rock: true, castShadow: true,
                geo: (s) => rockType(s, { cuts: 8, noise: 0.14, strata: 0.6 }, [2.0, 2.0]) },
  boulder: { kind: 'rock', radius: 1.0, height: 1.5, collider: 'circle', align: 0.4, sink: 0.18, rock: true, castShadow: true,
             geo: (s) => rockType(s, { cuts: 6, noise: 0.12, squash: 0.9, detail: 3 }, [1.0, 1.5]) },
  spire: { kind: 'rock', radius: 1.0, height: 6.0, collider: 'circle', align: 0.1, sink: 0.08, rock: true, castShadow: true,
           geo: (s) => rockType(s, { cuts: 8, strata: 1, squash: 1, flatBottom: 0.6, detail: 2 }, [1.0, 3.2]) },
  slab: { kind: 'rock', radius: 1.4, height: 0.7, collider: 'circle', align: 0.85, sink: 0.15, rock: true,
          geo: (s) => rockType(s, { cuts: 4, squash: 0.35, cutDepth: [0.6, 0.9] }, [1.4, 1.6]) },
  pebbles: { kind: 'rock', radius: 0.9, height: 0.15, collider: null, align: 1, sink: 0.25, cover: true, geo: pebblesGeo },
  scrub: { kind: 'scrub', radius: 0.8, height: 0.8, collider: null, align: 0.3, sink: 0.05, cover: true, geo: scrubGeo },
  grass_tuft: { kind: 'grass', radius: 0.4, height: 0.5, collider: null, align: 0.4, sink: 0.04, cover: true,
                geo: (s) => bladeTuft(s, 14, 0.5, 0.025, 0.22, 0.35) },
  dead_tree: { kind: 'wood', radius: 0.35, height: 6.0, collider: 'circle', align: 0.05, sink: 0.03, castShadow: true, geo: (s) => treeGeo(s, true) },
  stump: { kind: 'wood', radius: 0.5, height: 0.8, collider: 'circle', align: 0.2, sink: 0.05, geo: stumpGeo },
  ice_shard: { kind: 'ice', radius: 0.4, height: 0.7, collider: null, align: 0.6, sink: 0.15, cover: true, maxDist: 120, geo: iceShardGeo },
  snow_drift: { kind: 'snow', radius: 3.0, height: 0.6, collider: null, align: 1.0, sink: 0.2, geo: driftGeo },
};
export const NATURAL_PROPS = Object.keys(NATURAL);
const VARIANTS = 3;

// ---------------------------------------------------------------------- natural materials (palette-tinted, cached)
const MAT = new Map();
const ROCK_PARS = /* glsl */`
uniform sampler2D tPropRock;
uniform vec3 uPropSnow; uniform float uPropSnowAmt;
varying vec3 vPW, vPN;
`;
function natMaterial(ctx, kind) {
  const art = ctx.atmosphere?.art || {}, pal = art.palette || {}, S = art.surface || {};
  const C = (c, d) => new THREE.Color(c ?? d);
  let color, rough = 0.9, metal = 0, env = 0.6, side = THREE.FrontSide;
  switch (kind) {
    case 'rock': color = C(pal.rock, '#2a2321').lerp(C(pal.high, '#786b62'), 0.32).lerp(C(pal.ground, '#5b4d45'), 0.15); break;
    case 'scrub': color = C(pal.ground, '#5b4d45').lerp(new THREE.Color('#6b6a3a'), 0.55).multiplyScalar(0.9); rough = 0.85; break;
    case 'grass': color = C(pal.ground, '#5b4d45').lerp(new THREE.Color('#a8955a'), 0.6); rough = 0.8; side = THREE.DoubleSide; break;
    case 'wood': color = C(pal.high, '#786b62').lerp(new THREE.Color('#6d6258'), 0.6); rough = 0.88; break;
    case 'ice': color = new THREE.Color('#b9d8ea'); rough = 0.12; env = 1.4; break;
    case 'snow': color = C(pal.snow, '#e8eef5'); rough = 0.82; env = 0.5; break;
    default: color = new THREE.Color('#888888');
  }
  const snowAmt = kind === 'rock' || kind === 'wood' ? (S.snow ?? 0) : 0;
  let rockTex = null;
  if (kind === 'rock' || kind === 'wood') { try { rockTex = ctx.world?.terrain?.uniforms?.tRock?.value || null; } catch (e) { rockTex = null; } }
  const key = kind + ':' + color.getHexString() + ':' + snowAmt + ':' + (pal.snow || '') + ':' + (rockTex ? rockTex.uuid : '-');
  let m = MAT.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, side, envMapIntensity: env });
  m.name = 'prop-' + kind;
  if (kind === 'rock' || kind === 'wood') {
    // world-space triplanar detail (the terrain's packed rock map) and the level's snow cover on up-facing faces
    const tex = rockTex;
    const U = { tPropRock: { value: tex }, uPropSnow: { value: C(pal.snow, '#e8eef5') }, uPropSnowAmt: { value: snowAmt } };
    m.defines = { ...(m.defines || {}), PROP_ROCK: '' };
    if (!tex) m.defines.PROP_NOTEX = '';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW, vPN;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          #ifdef USE_INSTANCING
            vPW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
            vPN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );
          #else
            vPW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
            vPN = normalize( mat3( modelMatrix ) * objectNormal );
          #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + ROCK_PARS)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 pn = normalize( vPN );
            #ifndef PROP_NOTEX
              vec3 bw = pow( abs( pn ), vec3( 4.0 ) ); bw /= dot( bw, vec3( 1.0 ) );
              vec4 rk = texture2D( tPropRock, vPW.zy * 0.21 ) * bw.x + texture2D( tPropRock, vPW.xz * 0.21 ) * bw.y
                      + texture2D( tPropRock, vPW.xy * 0.21 ) * bw.z;
              diffuseColor.rgb *= ( 0.72 + 0.56 * rk.r ) * mix( 1.0, rk.b, 0.5 );
            #endif
            float sw = uPropSnowAmt * smoothstep( 0.55, 0.85, pn.y );
            diffuseColor.rgb = mix( diffuseColor.rgb, uPropSnow, sw );
          }`);
    };
    m.customProgramCacheKey = () => 'prop-rock' + (tex ? '' : '-notex');
  }
  m.userData.shared = true;
  m = ctx.atmosphere?.patchMaterial ? (ctx.atmosphere.patchMaterial(m) || m) : m;
  MAT.set(key, m);
  return m;
}

function naturalFactory(name, variant) {
  const spec = NATURAL[name];
  return (ctx) => {
    const gk = name + '#' + variant;
    let geometry = GEO.get(gk);
    if (!geometry) { geometry = spec.geo(hashString('p2:' + gk)); GEO.set(gk, geometry); }
    return { geometry, material: natMaterial(ctx, spec.kind), castShadow: !!spec.castShadow, receiveShadow: true,
             radius: spec.radius, height: spec.height, collider: spec.collider, maxInstances: undefined,
             // extras used by Scatter
             align: spec.align, sink: spec.sink, rock: !!spec.rock, cover: !!spec.cover, maxDist: spec.maxDist };
  };
}
for (const name of Object.keys(NATURAL)) {
  for (let v = 0; v < VARIANTS; v++) registerProp(`${name}#${v}`, naturalFactory(name, v));
  registerProp(name, naturalFactory(name, 0));
}

// ====================================================================== Scatter
const CELL = 64;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(),
      _p = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();
const _rc = { s: 0, l: 0, dist: 0 };
const _bk = { flow: 0, bed: 0, sky: 1, sun: 1, slope: 0, inside: false };
const ckey = (i, j) => i * 100003 + j;
const ORD = 16384, _ordD = new Float64Array(ORD), _ordI = new Int32Array(ORD), _ordA = new Array(ORD).fill(null);

export class Scatter {
  constructor(ctx, hf, route, layers = [], exclusions = [], o = {}) {
    this.ctx = ctx; this.hf = hf; this.route = route;
    this.layers = (layers || []).filter(l => l && l.prop);
    this.exclusions = (exclusions || []).filter(e => e && Number.isFinite(e.x) && Number.isFinite(e.z));
    this.seed = (o.seed >>> 0) || 1;
    this.tier = o.tier || ctx.tier;
    this.root = new THREE.Group();
    this.root.name = 'scatter';
    this.root.matrixAutoUpdate = false;
    this.meshes = new Map();          // mesh key → { type, inst, near, cap, batches: [] }
    this.colliders = [];
    this._lastFocus = new THREE.Vector3(1e9, 0, 1e9);
    this._calls = 0;
    this._stats = { types: 0, instances: 0, visible: 0, colliders: 0 };
    this._exGrid = new Map();
    for (const e of this.exclusions) {
      const r = e.r || 0;
      for (let i = Math.floor((e.x - r) / CELL); i <= Math.floor((e.x + r) / CELL); i++)
        for (let j = Math.floor((e.z - r) / CELL); j <= Math.floor((e.z + r) / CELL); j++) {
          const k = ckey(i, j); let c = this._exGrid.get(k); if (!c) this._exGrid.set(k, c = []); c.push(e);
        }
    }
  }
  _excluded(x, z, pad) {
    const c = this._exGrid.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!c) return false;
    for (const e of c) { const r = (e.r || 0) + pad; if ((x - e.x) ** 2 + (z - e.z) ** 2 < r * r) return true; }
    return false;
  }
  /** resolve a prop name to its PropType variants (natural props: 3 seeded variants) */
  _types(name) {
    const out = [];
    if (REGISTRY.has(name + '#0')) for (let v = 0; v < VARIANTS && REGISTRY.has(`${name}#${v}`); v++) out.push(`${name}#${v}`);
    else if (REGISTRY.has(name)) out.push(name);
    return out;
  }
  _mesh(key) {
    let M = this.meshes.get(key);
    if (M) return M;
    const f = REGISTRY.get(key);
    const type = f(this.ctx);
    if (!type || !type.geometry) throw new Error(`prop ${key}: factory returned no geometry`);
    M = { key, type, batches: [], inst: null, near: null, cap: 0, nearCap: 0, total: 0, shadow: false };
    this.meshes.set(key, M);
    return M;
  }
  /** per-layer placement context (everything tryPlace needs, resolved once) */
  _layerCtx(li, L) {
    const tier = this.tier, hf = this.hf, route = this.route;
    const keys = this._types(L.prop);
    if (!keys.length) { console.warn(`[scatter] unknown prop "${L.prop}"`); return null; }
    const spec = this._mesh(keys[0]).type;
    const maxDist0 = L.maxDist ?? spec.maxDist ?? (spec.cover ? 140 : 650);
    const cover = maxDist0 <= 150 && !L.collide;
    if (cover && !tier.groundCover) return null;
    const density = Number(L.density) || 0;
    if (density <= 0) return null;
    const hw0 = route.maxHalfWidth ?? 400;
    const sc = L.scale || [1, 1];
    const maxDist = maxDist0 * (tier.scatterDistance ?? 1);
    const LC = {
      li, L, keys, spec, cover, density, maxDist, hw0,
      seed: this.seed ^ hashString(`${li}:${L.prop}`) ^ ((L.seed ?? 0) * 2654435761),
      sc, slope: L.slope || [0, 1], hr: L.height || [-Infinity, Infinity],
      align: L.align ?? spec.align ?? 0.5, sink: L.sink ?? spec.sink ?? 0.15, isRock: !!spec.rock,
      margin: cover ? 30 : Math.min(maxDist0, 0.35 * hw0 + 120),
      collideMin: L.collideMinScale ?? sc[0],
      surfMode: L.surface && L.surface !== 'any' ? L.surface : null,
      band0: L.routeBand ? L.routeBand[0] : 0, band1: L.routeBand ? L.routeBand[1] : Infinity,
      avoid: L.avoidRoute ? (hf.P?.carve?.bedWidth ?? 60) / 2 + 14 : -1,
      tierDens: tier.scatterDensity ?? 1,
      batchByKey: new Map(),
    };
    for (const k of keys) {
      const M = this._mesh(k);
      const B = { layer: L, maxDist, maxDist2: maxDist * maxDist, cells: new Map(), count: 0, collide: !!L.collide,
                  castShadow: !!(L.castShadow ?? false), lazy: null };
      M.batches.push(B); LC.batchByKey.set(k, B);
      if (B.castShadow && tier.name !== 'low' && M.type.castShadow !== false) M.shadow = true;
    }
    return LC;
  }
  /** one placement candidate (consumes exactly six random numbers); pushes into `out` (cell arrays) */
  _tryPlace(LC, rng, x, z) {
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
    const hf = this.hf, route = this.route, L = LC.L, spec = LC.spec;
    if (hf.routeCoord) hf.routeCoord(x, z, _rc); else route.closestInto(x, z, _rc);
    const dist = _rc.dist, lim = LC.cover ? 1.0 : 1.1;
    if (dist > LC.hw0 * lim + LC.margin) return;
    const s = _rc.s;
    if (L.range && (s < L.range[0] || s > L.range[1])) return;
    if (dist < LC.band0 || dist > LC.band1 || dist < LC.avoid) return;
    if (dist > route.halfWidthAt(s) * lim + LC.margin) return;
    hf.bakeAt(x, z, _bk);
    const sl = _bk.slope >= 0 ? _bk.slope : hf.slopeAt(x, z);
    if (sl < LC.slope[0] || sl > LC.slope[1]) return;
    if (LC.surfMode) {
      const rock = smooth(0.2, 0.42, sl);
      if (LC.surfMode === 'rock' && rock < 0.5) return;
      if (LC.surfMode === 'sediment' && smooth(0.15, 0.6, _bk.flow) * (1 - rock) < 0.35) return;
      if (LC.surfMode === 'flat' && sl > 0.06) return;
    }
    // rocks gather at slope breaks, in gullies and on steep ground; they thin out on open flats (AD §3.8)
    if (LC.isRock && !LC.cover && r6 > clamp(0.3 + sl * 2.2 + _bk.flow * 0.8, 0, 1)) return;
    // power-law scale for rocks (many small, few big)
    const t = LC.isRock ? r1 * r1 * r1 : r1;
    const sz = lerp(LC.sc[0], LC.sc[1], t);
    const collides = L.collide && sz >= LC.collideMin && !!spec.collider;
    if (!collides && r5 >= LC.tierDens) return;
    const r = spec.radius * sz;
    if (this._excluded(x, z, r)) return;
    const gy = hf.heightAt(x, z);
    if (gy < LC.hr[0] || gy > LC.hr[1]) return;
    hf.normalAt(x, z, _n);
    _q2.setFromUnitVectors(_up, _n);
    _q2.slerp(_q.identity(), 1 - LC.align);
    _q.setFromAxisAngle(_up, r2 * TAU);
    _q.premultiply(_q2);
    _p.set(x, gy - LC.sink * spec.height * sz, z); _s.set(sz, sz, sz);
    _m.compose(_p, _q, _s);
    const B = LC.batchByKey.get(LC.keys[Math.floor(r3 * LC.keys.length) % LC.keys.length]);
    const ck = ckey(Math.floor(x / CELL), Math.floor(z / CELL));
    let arr = B.cells.get(ck);
    if (!arr) { arr = []; B.cells.set(ck, arr); }
    else if (!Array.isArray(arr)) { arr = Array.from(arr); B.cells.set(ck, arr); }
    const e = _m.elements;
    for (let q = 0; q < 16; q++) arr.push(e[q]);
    arr.push(0.86 + 0.28 * r4, x, z);
    B.count++;
    if (collides && this.ctx.collision) {
      const col = this.ctx.collision, top = gy + spec.height * sz * 0.7;
      const surface = LC.isRock ? 'rock' : (spec.kind === 'wood' ? 'wood' : 'concrete');
      const c = spec.collider === 'box'
        ? col.obox(x, z, r * 1.7, r * 1.7, r2 * TAU, top, undefined, { surface, tag: 'prop', owner: this })
        : col.circle(x, z, r * 0.85, top, undefined, { surface, tag: 'prop', owner: this });
      this.colliders.push(c);
    }
  }
  async generate(onProgress) {
    const t0 = performance.now();
    let tLast = performance.now();
    this._lazy = [];
    for (let li = 0; li < this.layers.length; li++) {
      const LC = this._layerCtx(li, this.layers[li]);
      if (!LC) continue;
      if (LC.cover) {
        // ground cover (no colliders, ≤ 150 m): generated per 64 m cell as cells come into range (refill), from a
        // per-cell seed, so it is deterministic and costs nothing at load
        LC.done = new Set();
        for (const B of LC.batchByKey.values()) B.lazy = LC;
        this._lazy.push(LC);
        continue;
      }
      // the whole level, deterministically: a jittered grid sized from the layer density
      const L = LC.L, rng = mulberry32(LC.seed);
      const cl = L.cluster && L.cluster.count > 1 ? { size: Math.max(1, L.cluster.size || 10), count: Math.round(L.cluster.count) } : null;
      const cs = Math.sqrt(10000 / (cl ? LC.density / cl.count : LC.density));
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of this.route.points) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      const grow = LC.hw0 * 1.1 + LC.margin;
      x0 = Math.floor((x0 - grow) / cs) * cs; z0 = Math.floor((z0 - grow) / cs) * cs; x1 += grow; z1 += grow;
      const nxc = Math.ceil((x1 - x0) / cs), nzc = Math.ceil((z1 - z0) / cs);
      for (let j = 0; j < nzc; j++) {
        for (let i = 0; i < nxc; i++) {
          const cx = x0 + (i + rng()) * cs, cz = z0 + (j + rng()) * cs;
          if (!cl) this._tryPlace(LC, rng, cx, cz);
          else for (let c = 0; c < cl.count; c++) {
            const a = rng() * TAU, d = cl.size * Math.sqrt(rng()) * 0.7;
            this._tryPlace(LC, rng, cx + Math.cos(a) * d, cz + Math.sin(a) * d);
          }
        }
        if (performance.now() - tLast > 40) {
          onProgress?.((li + j / nzc) / Math.max(1, this.layers.length));
          await new Promise(r => setTimeout(r, 0));
          tLast = performance.now();
        }
      }
      for (const B of LC.batchByKey.values()) for (const [k, arr] of B.cells) B.cells.set(k, Float32Array.from(arr));
    }
    // meshes: capacity from the densest visible disc
    for (const M of this.meshes.values()) {
      let total = 0, est = 0;
      for (const B of M.batches) {
        const cellsIn = Math.PI * (B.maxDist / CELL + 0.5) ** 2;
        if (B.lazy) {
          // the layer's density over the disc, shared by its variants, with headroom for clustering
          total += 1;
          est += Math.ceil(B.lazy.density * B.lazy.tierDens * cellsIn * CELL * CELL / 10000 / B.lazy.keys.length * 1.6) + 32;
          continue;
        }
        total += B.count;
        // instances inside one maxDist disc: the mean count of the populated 64 m cells over the disc (+ half a cell),
        // with headroom for clustering and the rock preference (the fill drops the farthest instances beyond it)
        est += Math.min(B.count, Math.ceil(B.count / Math.max(1, B.cells.size) * cellsIn * 1.5) + 32);
      }
      M.total = total;
      const maxI = M.type.maxInstances ?? Infinity;
      M.cap = Math.max(1, Math.min(M.batches.some(B => B.lazy) ? Infinity : total, est, maxI));
      if (!total) continue;
      const inst = new THREE.InstancedMesh(M.type.geometry, M.type.material, M.cap);
      inst.name = 'scatter:' + M.key;
      inst.count = 0;
      inst.castShadow = false;
      inst.receiveShadow = M.type.receiveShadow !== false;
      inst.matrixAutoUpdate = false;
      inst.frustumCulled = true;
      inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.setColorAt(0, _col.setRGB(1, 1, 1));
      this.root.add(inst);
      M.inst = inst;
      if (M.shadow) {
        M.nearCap = Math.min(total, 512);
        const near = new THREE.InstancedMesh(M.type.geometry, M.type.material, M.nearCap);
        near.name = 'scatter-shadow:' + M.key;
        near.count = 0; near.castShadow = true; near.receiveShadow = true; near.matrixAutoUpdate = false;
        near.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        near.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        near.setColorAt(0, _col.setRGB(1, 1, 1));
        this.root.add(near);
        M.near = near;
      }
    }
    this._stats.types = [...this.meshes.values()].filter(M => M.total > 0).length;
    this._countInstances();
    this._stats.colliders = this.colliders.length;
    this.genMs = performance.now() - t0;
    onProgress?.(1);
  }
  _countInstances() {
    let n = 0;
    for (const M of this.meshes.values()) for (const B of M.batches) n += B.count;
    this._stats.instances = n;
  }
  /** generate the lazy ground-cover cells within range of (fx, fz) */
  _fillLazy(fx, fz) {
    let added = false;
    for (const LC of this._lazy || []) {
      const R = Math.ceil(LC.maxDist / CELL), ci = Math.floor(fx / CELL), cj = Math.floor(fz / CELL), md2 = (LC.maxDist + CELL) ** 2;
      // a jittered grid of sub-cells inside each 64 m cell, each holding a candidate with the right probability
      const nsub = Math.max(1, Math.round(CELL / Math.sqrt(10000 / LC.density))), sub = CELL / nsub, pc = LC.density * sub * sub / 10000;
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
        const key = ckey(i, j);
        if (LC.done.has(key)) continue;
        const ddx = Math.max(i * CELL - fx, 0, fx - (i + 1) * CELL), ddz = Math.max(j * CELL - fz, 0, fz - (j + 1) * CELL);
        if (ddx * ddx + ddz * ddz > md2) continue;
        LC.done.add(key);
        const rng = mulberry32(LC.seed ^ Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1));
        for (let b = 0; b < nsub; b++) for (let a = 0; a < nsub; a++) {
          const x = (i * CELL) + (a + rng()) * sub, z = (j * CELL) + (b + rng()) * sub;
          if (rng() < pc) this._tryPlace(LC, rng, x, z); else { rng(); rng(); rng(); rng(); rng(); rng(); }
        }
        for (const B of LC.batchByKey.values()) { const arr = B.cells.get(key); if (Array.isArray(arr)) B.cells.set(key, Float32Array.from(arr)); }
        added = true;
      }
    }
    if (added) this._countInstances();
  }
  update(focus) {
    if (!focus) return;
    this._calls++;
    const dx = focus.x - this._lastFocus.x, dz = focus.z - this._lastFocus.z;
    if (dx * dx + dz * dz < 64 && this._calls < 15) return;
    this._refill(focus);
  }
  _refill(focus) {
    this._calls = 0;
    this._lastFocus.copy(focus);
    const fx = focus.x, fz = focus.z;
    this._fillLazy(fx, fz);
    const shadowR = (this.ctx.tier?.shadowExtent ?? 160) * 1.2, shadowR2 = shadowR * shadowR;
    let visible = 0;
    for (const M of this.meshes.values()) {
      if (!M.inst) continue;
      const I = M.inst.instanceMatrix.array, CA = M.inst.instanceColor?.array;
      const NI = M.near?.instanceMatrix.array, NC = M.near?.instanceColor?.array;
      let n = 0, nn = 0, rmax = 0;
      for (const B of M.batches) {
        if (!B.count) continue;
        const R = Math.ceil(B.maxDist / CELL), ci = Math.floor(fx / CELL), cj = Math.floor(fz / CELL);
        // nearest cells first so a full mesh drops the farthest instances (module-level scratch: no allocation)
        let nc = 0;
        for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
          const arr = B.cells.get(ckey(i, j));
          if (!arr) continue;
          const ddx = Math.max(i * CELL - fx, 0, fx - (i + 1) * CELL), ddz = Math.max(j * CELL - fz, 0, fz - (j + 1) * CELL);
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > B.maxDist2 || nc >= ORD) continue;
          _ordD[nc] = d2; _ordA[nc] = arr; _ordI[nc] = nc; nc++;
        }
        // insertion sort of the cell indices by distance (a few dozen cells, nearly sorted by the scan order)
        for (let a = 1; a < nc; a++) { const v = _ordI[a], d = _ordD[v]; let b = a - 1; while (b >= 0 && _ordD[_ordI[b]] > d) { _ordI[b + 1] = _ordI[b]; b--; } _ordI[b + 1] = v; }
        for (let q = 0; q < nc; q++) {
          const arr = _ordA[_ordI[q]];
          for (let o = 0; o < arr.length; o += 19) {
            const x = arr[o + 17], z = arr[o + 18], d2 = (x - fx) * (x - fx) + (z - fz) * (z - fz);
            if (d2 > B.maxDist2) continue;
            if (M.near && d2 < shadowR2 && nn < M.nearCap) {
              for (let e = 0; e < 16; e++) NI[nn * 16 + e] = arr[o + e];
              if (NC) { const t = arr[o + 16]; NC[nn * 3] = t; NC[nn * 3 + 1] = t; NC[nn * 3 + 2] = t; }
              nn++;
              continue;
            }
            if (n >= M.cap) continue;
            for (let e = 0; e < 16; e++) I[n * 16 + e] = arr[o + e];
            if (CA) { const t = arr[o + 16]; CA[n * 3] = t; CA[n * 3 + 1] = t; CA[n * 3 + 2] = t; }
            n++;
          }
        }
        for (let q = 0; q < nc; q++) _ordA[q] = null;
        rmax = Math.max(rmax, B.maxDist);
      }
      M.inst.count = n;
      M.inst.instanceMatrix.needsUpdate = true;
      if (M.inst.instanceColor) M.inst.instanceColor.needsUpdate = true;
      const pad = (M.type.radius || 1) * 12 + (M.type.height || 1) * 12;
      M.inst.boundingSphere.center.set(fx, focus.y, fz); M.inst.boundingSphere.radius = rmax + pad + 200;
      M.inst.visible = n > 0;
      if (M.near) {
        M.near.count = nn; M.near.instanceMatrix.needsUpdate = true;
        if (M.near.instanceColor) M.near.instanceColor.needsUpdate = true;
        M.near.boundingSphere.center.set(fx, focus.y, fz); M.near.boundingSphere.radius = shadowR + pad + 200;
        M.near.visible = nn > 0;
      }
      visible += n + nn;
    }
    this._stats.visible = visible;
  }
  /** refill now (optionally around a new focus) */
  settle(focus) { this._refill(focus || this._lastFocus); }
  setTier(t) {
    const prev = this.tier;
    this.tier = t;
    // density and ground cover change the instance sets: the world regenerates (World.setTier → regenerate)
    this.needsRegenerate = !prev || prev.scatterDensity !== t.scatterDensity || prev.groundCover !== t.groundCover
      || prev.scatterDistance !== t.scatterDistance || (prev.name === 'low') !== (t.name === 'low');
  }
  stats() {
    let calls = 0;
    for (const M of this.meshes.values()) { if (M.inst?.visible && M.inst.count) calls++; if (M.near?.visible && M.near.count) calls++; }
    return { ...this._stats, calls };
  }
  /** extra: a stable hash of every prop collider (determinism tests) */
  colliderHash() {
    let h = 0x811c9dc5;
    for (const c of this.colliders) {
      const s = `${c.x.toFixed(3)},${c.z.toFixed(3)},${(c.r ?? c.hw).toFixed(3)},${c.top.toFixed(3)};`;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    }
    return (h >>> 0).toString(16) + ':' + this.colliders.length;
  }
  dispose() {
    for (const c of this.colliders) this.ctx.collision?.remove(c);
    this.colliders.length = 0;
    for (const M of this.meshes.values()) {
      if (M.inst) { this.root.remove(M.inst); M.inst.dispose(); }
      if (M.near) { this.root.remove(M.near); M.near.dispose(); }
    }
    this.meshes.clear();
    this.root.parent?.remove(this.root);
  }
}
