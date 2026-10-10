// world/terrain.js (P2): terrain rendering and streaming (arch §5.4; AD §3.3, §3.5, §3.6; addendum A5.5).
//
// Quadtree of fixed-resolution nodes. Roots are 1024 m squares on the heightfield's grid origin, tiling the bounds plus
// a margin out to the view distance (beyond the bounds the heightfield continues with its outer grid). Every node has
// tier.terrainSegments segments per side (64 → 16/8/4/2 m spacing at 1024/512/256/128 m).
//
// Selection (each update, from cameraPos, horizontal distance): a node splits while dist(camera, node square) <
// K × size and size > 128, where K = min(tier.terrainSplit, 1.8). The cap holds the High budget (≤ 0.7 M terrain
// triangles in the main pass; measured at 10 route points, see the P2 hand-off). A parent stays drawn until its four children are built, and children
// stay drawn until their parent is ready, so there are never holes.
//
// No popping: every vertex carries a morph target, the surface its parent node would draw at that point (odd vertices
// on the parent's edges and diagonal take the mean of their even neighbours, and the parent's normal). In the vertex
// shader a vertex slides to that target as its distance d to the LOD centre crosses [(K + 1.45)·S, 2K·S] (S = node
// size). A node can only merge into its parent once every one of its vertices is beyond 2K·S, so it is fully morphed
// by then and the swap is invisible; a coarser neighbour can only sit at d ≥ 2K·S of a finer node's edge, so shared
// edges match too. Skirts (an edge strip hanging max(4 m, 2 × spacing)) cover any remaining crack while streaming.
//
// Streaming: wanted nodes go into a queue, nearest first; update() builds until budgetMs is spent. Built nodes are
// cached (LRU) and released beyond the view distance; their geometries return to a pool (all nodes share one vertex
// count and one index buffer).
//
// Vertex data: position (node-local x/z), normal (central differences on the node's own lattice, so same-level
// neighbours agree exactly), colour (Uint16 linear: the AD §3.3 palette blend × patchiness), `surf` (Uint8×4: flow,
// baked sun visibility, sky AO, route-bed mask; the sun term multiplies the final albedo per pixel, which is arch §5.4's
// "× baked lighting" applied after the shader's strata/path/snow colours) and `morph` (target y, target normal xz, size).
// Material: AD §3.5 (two-scale soil, triplanar rock with strata ramp, macro noise, derivative bump, wetness, snow mask,
// optional snow sparkle), TERRAIN_LITE on Low, then ctx.atmosphere.patchMaterial. The detail textures are this
// module's own packed data maps (AD §3.6: R albedo variation, G height, B cavity, A roughness), generated per
// art.surface.style and cached for the session.
import * as THREE from 'three';
import { clamp, smooth, lerp, mulberry32 } from '../core/util.js';
import { createValueNoise2D, tileable2 } from '../core/noise.js';

const ROOT = 1024, MIN = 128, MAXL = 3;
const SPLIT_CAP = 1.8;
const POOL_SPARE = 12;
const RETAIN = 240;            // selections a node stays built after it was last drawn (update() selects once or twice per frame)
const MOVE_HOLD = 90;          // selections prefetching continues after the camera last moved
const _col = new THREE.Color(), _c2 = new THREE.Color();
const _bk = { flow: 0, bed: 0, path: 0, sky: 1, sun: 1, slope: 0, curv: 0, inside: false };
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), _dc = new THREE.Vector3();
/** build-queue order: holes first, then equal screen error; coarser levels first on ties (module level: no per-frame closure) */
const byPriority = (a, b) => a._p - b._p || a.L - b.L;

// ====================================================================== detail textures (AD §3.6), cached
const TEX_CACHE = new Map();
function hash1(n) {
  n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15);
  return (n >>> 0) / 4294967296;
}
/** periodic Worley noise on a cx × cz grid over [0,1)²: f1, f2 and the nearest cell id */
function worley(seed, cx, cz = cx) {
  const r = mulberry32(seed), pts = new Float32Array(cx * cz * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  // anisotropic cells (cz < cx: taller than wide) need a wider search across the narrow axis, or the pattern breaks
  const rx = cx > cz ? Math.ceil(cx / cz) + 1 : 1, ry = cz > cx ? Math.ceil(cz / cx) + 1 : 1;
  return (u, v, out) => {
    const x = u * cx, y = v * cz, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      const gx = ((xi + i) % cx + cx) % cx, gy = ((yi + j) % cz + cz) % cz, k = gy * cx + gx;
      // distance in units of the cell width (cells cz/cx times taller than wide stretch the pattern vertically)
      const d = Math.hypot(xi + i + pts[k * 2] - x, (yi + j + pts[k * 2 + 1] - y) * (cx / cz));
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    out.f1 = f1; out.f2 = f2; out.id = id; return out;
  };
}
const _wo = { f1: 0, f2: 0, id: 0 }, _wo2 = { f1: 0, f2: 0, id: 0 };
function makeData(size, fn, srgb = false) {
  const data = new Uint8Array(size * size * 4), o = [0, 0, 0, 0];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    fn((i + 0.5) / size, (j + 0.5) / size, o);
    const k = (j * size + i) * 4;
    data[k] = clamp(o[0], 0, 1) * 255; data[k + 1] = clamp(o[1], 0, 1) * 255; data[k + 2] = clamp(o[2], 0, 1) * 255; data[k + 3] = clamp(o[3], 0, 1) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.userData.shared = true;
  t.needsUpdate = true;
  return t;
}
function detailTextures(style, size, aniso) {
  const key = style + ':' + size;
  let T = TEX_CACHE.get(key);
  if (T) { for (const t of Object.values(T)) t.anisotropy = aniso; return T; }
  const s = 9137;
  const A = tileable2(s, 8), B = tileable2(s + 1, 32), C = tileable2(s + 2, 64), E = tileable2(s + 3, 4), F = tileable2(s + 4, 16);
  const W = worley(s + 5, 24), Wr = worley(s + 6, 10, 3), Wi = worley(s + 7, 36), Wb = worley(s + 9, 8), Wc = worley(s + 10, 16, 8);
  const N4 = tileable2(s + 11, 4), N8 = tileable2(s + 12, 8);
  // vertical streaks: smooth noise across 48 columns, constant down each column
  const colH = new Float32Array(32); { const r = mulberry32(s + 13); for (let i = 0; i < 32; i++) colH[i] = r(); }
  const streakAt = (u) => { const x = ((u % 1) + 1) % 1 * 32, i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); return colH[i % 32] + (colH[(i + 1) % 32] - colH[i % 32]) * t; };
  const fbmT = (u, v) => 0.5 * E(u * 4, v * 4) + 0.3 * A(u * 8, v * 8) + 0.2 * F(u * 16, v * 16);
  // irregular strata (AD §3.6): 5 bands per tile with random widths, boundaries warped by two octaves of noise; only some
  // boundaries carry a thin dark (or pale) line, hard bands stand proud. Evenly spaced bands with a line at every
  // boundary read as scan lines on a cliff.
  const BANDS = (() => {
    const r = mulberry32(s + 21), n = 5, w = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const x = 0.45 + r() * 1.4; w.push(x); sum += x; }
    const b = [0]; let acc = 0;
    for (let i = 0; i < n; i++) { acc += w[i] / sum; b.push(acc); }
    const line = [], hard = [], joints = [];
    for (let i = 0; i < n; i++) {
      const q = r(); line.push(q < 0.35 ? -1 : q < 0.5 ? 1 : 0); hard.push(r() > 0.45);
      // vertical joints confined to the band (blocky jointing between bedding planes), 4 to 9 per tile width
      const nj = 4 + Math.floor(r() * 6), js = [];
      for (let k = 0; k < nj; k++) js.push([r(), 0.45 + 0.55 * r()]);
      joints.push(js);
    }
    return { n, b, line, hard, joints };
  })();
  const strata = (u, v, out) => {
    let y = v + 0.05 * (E(u * 4, v * 4) - 0.5) * 2 + 0.018 * (F(u * 16, v * 16) - 0.5) * 2;
    y -= Math.floor(y);
    let i = 0; while (i < BANDS.n - 1 && y >= BANDS.b[i + 1]) i++;
    const d0 = y - BANDS.b[i], d1 = BANDS.b[i + 1] - y;
    // line at the band's lower boundary (index i) and upper boundary (index i + 1 → the next band's lower one)
    const l0 = BANDS.line[i], l1 = BANDS.line[(i + 1) % BANDS.n];
    const e0 = smooth(0.012, 0.0, d0), e1 = smooth(0.012, 0.0, d1);
    out.edge = (l0 < 0 ? e0 : 0) + (l1 < 0 ? e1 : 0);
    out.pale = (l0 > 0 ? e0 : 0) + (l1 > 0 ? e1 : 0);
    out.hard = BANDS.hard[i] ? 1 : 0;
    out.round = Math.min(1, Math.min(d0, d1) / 0.04);        // hard bands round off at their edges
    // joints: distance to the nearest of the band's joints (slightly wavy, wrapping in u)
    const uu = u + 0.012 * (E(u * 4 + 0.7, v * 8) - 0.5) * 2;
    let jd = 1, js = 0;
    for (const [ju, jw] of BANDS.joints[i]) { let d = Math.abs(uu - ju); d = Math.min(d, 1 - d); if (d < jd) { jd = d; js = jw; } }
    out.joint = smooth(0.007, 0.0, jd) * js;
    return out;
  };
  const _st = { edge: 0, pale: 0, hard: 0, round: 1, joint: 0 };
  let soil, rock;
  if (style === 'snow') {
    soil = makeData(size, (u, v, o) => {
      // wind sastrugi: noise stretched 6:1 along u, plus sparse glassy ice pebbles
      const st = 0.55 * E(u * 4, v * 24) + 0.3 * A(u * 8, v * 48) + 0.15 * C(u * 64, v * 64);
      const w = Wi(u, v, _wo), pq = w.f1 / (0.14 + 0.16 * hash1(w.id + 9));
      const peb = pq < 1 && hash1(w.id + 3) > 0.82 ? Math.sqrt(1 - pq * pq) : 0;
      o[0] = 0.52 + (st - 0.5) * 0.3 - peb * 0.1;
      o[1] = 0.25 + st * 0.6 + peb * 0.15;
      o[2] = 1 - smooth(0.32, 0.15, st) * 0.35;
      o[3] = 0.8 - peb * 0.65 + (st - 0.5) * 0.12;
    });
    rock = makeData(size, (u, v, o) => {
      const n = fbmT(u, v), st = strata(u, v, _st), hard = st.hard * st.round;
      const w = Wc(u, v, _wo), crack = Math.max(st.joint * 0.7, smooth(0.035, 0.0, w.f2 - w.f1) * (hash1(w.id + 5) > 0.4 ? 1 : 0.2));
      // rime fills the fractures: cracks read pale, frost flecks on hard bands
      o[0] = 0.5 + hard * 0.06 - 0.03 + (n - 0.5) * 0.3 + crack * 0.2 - st.edge * 0.1 + st.pale * 0.08;
      o[1] = 0.42 + hard * 0.18 + n * 0.2 - crack * 0.4 - st.edge * 0.1;
      o[2] = 1 - crack * 0.5 - st.edge * 0.2;
      o[3] = 0.78 - crack * 0.3 + (n - 0.5) * 0.1;
    });
  } else if (style === 'ash') {
    soil = makeData(size, (u, v, o) => {
      const base = 0.6 * A(u * 8, v * 8) + 0.25 * B(u * 32, v * 32) + 0.15 * C(u * 64, v * 64);
      const w = W(u, v, _wo), clump = smooth(0.4, 0.1, w.f1) * (hash1(w.id) > 0.6 ? 1 : 0);
      o[0] = 0.5 + (base - 0.5) * 0.7 + clump * 0.12; o[1] = base * 0.6 + clump * 0.35; o[2] = 1 - smooth(0.3, 0.1, base) * 0.4; o[3] = 0.9 - clump * 0.1;
    });
    rock = makeData(size, (u, v, o) => {
      const w = Wb(u, v, _wo), col = smooth(0.0, 0.06, w.f2 - w.f1), n = fbmT(u, v);
      o[0] = 0.45 + n * 0.25 - (1 - col) * 0.2; o[1] = 0.3 + col * 0.45 + n * 0.15; o[2] = 0.3 + col * 0.7; o[3] = 0.9;
    });
  } else {                         // 'grit' (default) and 'glass' (until it gets its own maps)
    // AD §3.6 'grit': fine grain, wind ripples in sandy patches, dried-mud cracks in others, and gravel: domed pebbles of
    // varied size (a dome, not a disc: a disc's edge shades as a ring and reads as a dimple) plus a few larger stones
    soil = makeData(size, (u, v, o) => {
      const base = 0.6 * A(u * 8, v * 8) + 0.4 * B(u * 32, v * 32);
      const fine = C(u * 64, v * 64);
      const patch = smooth(0.4, 0.66, E(u * 4 + 0.37, v * 4 + 0.11));          // 1: cracked mud, 0: sand and gravel
      const sandy = smooth(0.45, 0.25, E(u * 4 + 0.71, v * 4 + 0.53)) * (1 - patch);
      // ripples ≈ 30 cm apart across the tile's diagonal, wandering with the noise, only in the sandy patches
      const rp = Math.sin(((u + v) * 14 + (B(u * 32, v * 32) - 0.5) * 1.6 + (E(u * 4, v * 4) - 0.5) * 1.2) * Math.PI * 2) * 0.5 + 0.5;
      const ripple = (rp * rp) * sandy;
      const w = W(u, v, _wo), cr = hash1(w.id);
      const pr = 0.14 + 0.22 * hash1(w.id + 11), dq = w.f1 / pr;
      const gravel = (cr > 0.5 ? 1 : 0) * (1 - patch * 0.85) * (1 - sandy * 0.7);
      const peb = dq < 1 ? (1 - dq * dq) * (1 - dq * dq) * gravel : 0;          // a bell: shading spreads over the stone
      const pebEdge = dq >= 1 && dq < 1.35 ? (1.35 - dq) / 0.35 * gravel : 0;    // a little contact shadow
      const w2 = Wb(u, v, _wo2), sr = 0.16 + 0.16 * hash1(w2.id + 3), dq2 = w2.f1 / sr;
      const stone = hash1(w2.id + 17) > 0.8 && dq2 < 1 ? (1 - dq2 * dq2) * (1 - patch * 0.6) : 0;
      const crack = smooth(0.035, 0.0, w.f2 - w.f1) * 0.5 * patch;
      o[0] = 0.5 + (base - 0.5) * 0.55 + (fine - 0.5) * 0.18 + peb * (hash1(w.id + 7) - 0.45) * 0.45 + stone * (hash1(w2.id + 5) - 0.6) * 0.5
           - crack * 0.3 + ripple * 0.025 - pebEdge * 0.05 + patch * 0.03;
      o[1] = 0.3 + base * 0.3 + ripple * 0.09 + peb * 0.3 + stone * 0.45 - crack * 0.45 + (fine - 0.5) * 0.08;
      o[2] = 1 - crack * 0.8 - pebEdge * 0.35 - (1 - rp) * sandy * 0.08;
      o[3] = 0.84 - peb * 0.22 - stone * 0.2 + (base - 0.5) * 0.16 - patch * 0.05;
    });
    rock = makeData(size, (u, v, o) => {
      const n = fbmT(u, v), st = strata(u, v, _st), hard = st.hard * st.round;
      // fractures: the band's vertical joints, plus a faint partial network
      const w = Wr(u, v, _wo), crack = Math.max(st.joint, smooth(0.04, 0.0, w.f2 - w.f1) * (hash1(w.id + 5) > 0.55 ? 0.35 : 0));
      // varnish streaks down the face: wobbling, broken up along their length
      const streak = smooth(0.62, 0.97, streakAt(u + 0.015 * (E(u * 4 + 0.9, v * 8) - 0.5) * 2)) * smooth(0.3, 0.8, E(u * 4 + 0.31, v * 4)) * 0.08;
      o[0] = 0.5 + hard * 0.08 - 0.03 + (n - 0.5) * 0.3 - st.edge * 0.12 + st.pale * 0.08 - crack * 0.14 - streak;
      o[1] = 0.4 + hard * 0.22 + n * 0.2 - crack * 0.45 - st.edge * 0.1;
      o[2] = 1 - crack * 0.85 - st.edge * 0.25;
      o[3] = 0.88 + (n - 0.5) * 0.1;
    });
  }
  const noise = makeData(Math.min(256, size), (u, v, o) => {
    o[0] = 0.5 * E(u * 4, v * 4) + 0.3 * A(u * 8, v * 8) + 0.2 * F(u * 16, v * 16);
    o[1] = 0.6 * N4(u * 4, v * 4) + 0.4 * N8(u * 8, v * 8);
    o[2] = B(u * 32, v * 32); o[3] = 1;
  });
  // sea-ice cracks (AD §3.11): thin Worley-edge lines (R: a fine network, G: a wider, sparser one), seen in parallax
  const Wk = worley(s + 31, 12), Wk2 = worley(s + 33, 5);
  const cracks = makeData(Math.min(512, size), (u, v, o) => {
    const uu = u + 0.01 * (E(u * 4 + 0.2, v * 4) - 0.5), vv = v + 0.01 * (E(u * 4, v * 4 + 0.6) - 0.5);
    const a = Wk(uu, vv, _wo), b = Wk2(uu, vv, _wo2);
    o[0] = smooth(0.03, 0.0, a.f2 - a.f1) * (hash1(a.id + 3) > 0.25 ? 1 : 0.35);
    o[1] = smooth(0.05, 0.0, b.f2 - b.f1) * (0.6 + 0.4 * hash1(b.id + 9));
    o[2] = 0; o[3] = 1;
  });
  T = { soil, rock, noise, cracks };
  for (const t of Object.values(T)) t.anisotropy = aniso;
  TEX_CACHE.set(key, T);
  return T;
}
/** extra (tools/tests): the cached detail maps of a surface style: { soil, rock, noise } DataTextures */
export function terrainDetailTextures(style = 'grit', size = 512, aniso = 4) { return detailTextures(style, size, aniso); }
/** extra (tests): drop the cached detail maps (cold-load timing) */
export function clearTerrainCaches() { for (const T of TEX_CACHE.values()) for (const t of Object.values(T)) t.dispose(); TEX_CACHE.clear(); }
/** 256 × 1 strata colour ramp (sRGB data texture) */
function strataRamp(colors, seed) {
  const r = mulberry32(seed), n = 256, data = new Uint8Array(n * 4);
  const cols = colors.map(c => new THREE.Color(c));
  let x = 0, ci = 0;
  while (x < n) {
    const w = Math.max(2, Math.round(n * lerp(0.03, 0.25, r())));
    const c = cols[ci % cols.length]; ci += 1 + (r() > 0.7 ? 1 : 0);
    const line = r();
    for (let i = x; i < Math.min(n, x + w); i++) {
      let k = 1;
      if (i === x && line < 0.25) k = 0.65; else if (i === x && line > 0.75) k = 1.2;
      const g = 1 + (r() - 0.5) * 0.04;
      // colours as sRGB bytes
      data[i * 4] = clamp(c.r * k * g, 0, 1) * 255; data[i * 4 + 1] = clamp(c.g * k * g, 0, 1) * 255; data[i * 4 + 2] = clamp(c.b * k * g, 0, 1) * 255; data[i * 4 + 3] = 255;
    }
    x += w;
  }
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// ====================================================================== shader chunks (AD §3.5)
const V_PARS = /* glsl */`
attribute vec4 surf;
attribute vec4 morph;
uniform vec3 uLodCenter;
uniform float uSplitK;
varying vec4 vSurf;
varying vec3 vTW, vTN;
`;
const V_MORPH_N = /* glsl */`
  float tMk = 0.0;
  if ( morph.w > 0.0 ) {
    vec3 tWp = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
    float tD = length( tWp.xz - uLodCenter.xz );
    tMk = smoothstep( ( uSplitK + 1.45 ) * morph.w, 2.0 * uSplitK * morph.w, tD );
  }
  vec3 tTN = vec3( morph.y, sqrt( max( 0.0, 1.0 - dot( morph.yz, morph.yz ) ) ), morph.z );
  objectNormal = normalize( mix( objectNormal, tTN, tMk ) );
`;
const V_MORPH_P = /* glsl */`
  transformed.y = mix( transformed.y, morph.x, tMk );
`;
const V_OUT = /* glsl */`
  vSurf = surf;
  vTW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vTN = inverseTransformDirection( transformedNormal, viewMatrix );
`;
const F_PARS = /* glsl */`
uniform sampler2D tSoil, tRock, tNoise, tStrata, tCracks;
uniform float uIce;
uniform vec3 uIceDeep, uIceCrack;
uniform vec2 uRockSlope;
uniform vec3 uStrata, uSnow, uSnowColor, uPath;
uniform vec2 uStrataDip;
uniform float uWet, uGloss, uBump, uSparkle, uSoilTexel;
uniform vec3 uSunCol, uSunDirT;
varying vec4 vSurf;
varying vec3 vTW, vTN;
float tH, tR, tSnowW, tRockW, tHr, tLedge, tSteep, tRill;
vec2 tGrad;
mat2 tRot2( float a ) { float c = cos( a ), s = sin( a ); return mat2( c, -s, s, c ); }
vec3 tPerturbH( vec3 p, vec3 n, float h, float k ) {
  vec3 sx = dFdx( p ), sy = dFdy( p ), r1 = cross( sy, n ), r2 = cross( n, sx );
  float det = dot( sx, r1 ); vec2 dh = vec2( dFdx( h ), dFdy( h ) ) * k;
  return normalize( abs( det ) * n - sign( det ) * ( dh.x * r1 + dh.y * r2 ) );
}
float tGlint( vec3 wp, vec3 n, vec3 v, vec3 l, float density ) {
  vec3 cell = floor( wp * density );
  float h = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
  vec3 rn = normalize( n + ( vec3( fract( h * 7.13 ), fract( h * 3.71 ), fract( h * 5.37 ) ) - 0.5 ) * 0.7 );
  return step( 0.985, h ) * pow( max( dot( rn, normalize( l + v ) ), 0.0 ), 600.0 );
}
`;
const F_ALBEDO = /* glsl */`
{
  vec3 wn = normalize( vTN );
  vec2 tUV = vTW.xz * 0.111;
  vec4 soil = texture2D( tSoil, tUV );
  tGrad = vec2( 0.0 );
#ifndef TERRAIN_LITE
  {
    // soil bump from texture-space differences (smooth, unlike screen derivatives on a fine height map)
    float tE = uSoilTexel * 1.5;
    tGrad = vec2( texture2D( tSoil, tUV + vec2( tE, 0.0 ) ).g - soil.g, texture2D( tSoil, tUV + vec2( 0.0, tE ) ).g - soil.g ) * ( 0.111 / tE );
  }
  soil = mix( soil, texture2D( tSoil, tRot2( 0.83 ) * vTW.xz * 0.027 ), 0.35 );
  vec3 bw = pow( abs( wn ), vec3( 4.0 ) ); bw /= dot( bw, vec3( 1.0 ) );
  // the top projection takes the soil map, rotated and coarser: the rock map's bed lines and joints seen from above
  // would draw a straight-line grid across every moderate rock slope
  vec4 rk = texture2D( tRock, vTW.zy * 0.06 ) * bw.x + texture2D( tSoil, tRot2( 0.52 ) * vTW.xz * 0.043 ) * bw.y
          + texture2D( tRock, vTW.xy * 0.06 ) * bw.z;
#else
  vec4 rk = texture2D( tRock, vec2( vTW.x + vTW.z, vTW.y ) * 0.06 );
#endif
  // the detail maps lose contrast with distance (mid-distance moiré on cliffs); the mips take over beyond
  float tFar = smoothstep( 180.0, 1200.0, length( vViewPosition ) );
  rk = mix( rk, vec4( 0.48, 0.5, 0.86, 0.86 ), tFar * 0.55 );
  soil = mix( soil, vec4( 0.5, 0.45, 0.9, 0.82 ), tFar * 0.4 );
  vec4 tMac = texture2D( tNoise, vTW.xz * 0.0024 );     // 420 m tile: r macro brightness, g bed warp
  float macro = tMac.r;
  float rockW = smoothstep( uRockSlope.x, uRockSlope.y, 1.0 - wn.y + ( soil.g - 0.5 ) * 0.12 );
  // bedding planes: a gentle seeded dip (2 to 4 degrees) so long walls show slanting beds, warped at two scales (≈ 400 m
  // rolls and ≈ 40 m wobbles) so no boundary runs ruler-straight
  float band = ( vTW.y + dot( vTW.xz, uStrataDip ) ) / uStrata.x
             + ( tMac.g - 0.5 ) * uStrata.y
             + ( texture2D( tNoise, tRot2( 1.9 ) * vTW.xz * 0.0045 ).r - 0.5 ) * 0.9 + rk.g * 0.15;
  // colour comes in two scales: formations (≈ 17 strataHeights per ramp cycle: a cliff shows a few thick bands of
  // different rock) and the fine beds inside them, which only modulate brightness (±15 %) and blur out with distance.
  // Hue-alternating fine stripes on every metre of a wall read as a zebra. Explicit gradients of the unwrapped bands:
  // fract() would jump at every wrap and pick the smallest mip there (a line).
  float tBlur = 1.0 + 6.0 * smoothstep( 150.0, 700.0, length( vViewPosition ) );
  vec3 fineCol = textureGrad( tStrata, vec2( fract( band ), 0.5 ), vec2( dFdx( band ) * tBlur, 0.0 ), vec2( dFdy( band ) * tBlur, 0.0 ) ).rgb;
  float band3 = band * 0.058 + 0.37;
  vec3 formCol = textureGrad( tStrata, vec2( fract( band3 ), 0.5 ), vec2( dFdx( band3 ), 0.0 ), vec2( dFdy( band3 ), 0.0 ) ).rgb;
  float tFL = dot( fineCol, vec3( 0.299, 0.587, 0.114 ) ), tML = dot( formCol, vec3( 0.299, 0.587, 0.114 ) );
  vec3 strataCol = formCol * mix( 1.0, clamp( tFL / max( tML, 0.03 ), 0.7, 1.35 ), 0.4 );
  float band2 = band * 0.233 + 0.37;
  // strong banding belongs on cliffs; moderate rock slopes take a softer share of it (stripes painted across a 30 degree
  // hillside read as contour lines)
  tSteep = smoothstep( uRockSlope.y - 0.05, uRockSlope.y + 0.3, 1.0 - wn.y );
  // fractures and joints are cliff detail: on moderate rock slopes they read as scratches, so they fade there
  float tRd = 0.25 + 0.75 * tSteep;
  rk.rb = mix( vec2( 0.5, 0.9 ), rk.rb, tRd );
  vec3 rockCol = mix( diffuseColor.rgb, strataCol, uStrata.z * ( 0.4 + 0.6 * tSteep ) ) * ( 0.62 + 0.76 * rk.r );
  // ledges for the bump below: a descending staircase (a step every ≈ 1.4 strataHeights, following the warped beds), so
  // the hard beds stand out as lit lips with shaded risers under them
  float tLq = band2 * 3.0;
  tLedge = -( floor( tLq ) + smoothstep( 0.8, 1.0, fract( tLq ) ) );
  // mid-scale patches (≈ 15 m blotches on a rotated 60 m tile) break up the soil between the vertex colour and the grain
  float tPatch = texture2D( tNoise, tRot2( 0.37 ) * vTW.xz * 0.0167 ).r;
  vec3 soilCol = mix( diffuseColor.rgb * ( 0.82 + 0.36 * soil.r ) * ( 0.86 + 0.28 * tPatch ), uPath * ( 0.9 + 0.2 * soil.r ), vSurf.a * 0.5 );
  vec3 col = mix( soilCol, rockCol, rockW ) * ( 0.86 + 0.28 * macro );
  col *= mix( 1.0, mix( soil.b, rk.b, rockW ), 0.55 ) * mix( 0.5, 1.0, vSurf.b );
  tRill = 0.0;
#ifndef TERRAIN_LITE
  {
    // slope rills: fine gullies a few metres apart running straight downhill on soil and scree slopes (the vertex
    // lattice carries erosion only down to ≈ 16 m). The across-slope coordinate is warped by the patch and macro noise,
    // so the rills wander, fan out round spurs and merge
    float tSl = 1.0 - wn.y;
    float tRw = smoothstep( 0.05, 0.16, tSl ) * ( 1.0 - smoothstep( 0.4, 0.62, tSl ) ) * ( 1.0 - vSurf.a )
              * ( 1.0 - smoothstep( 380.0, 720.0, length( vViewPosition ) ) );
    if ( tRw > 0.001 ) {
      vec2 tSd = wn.xz / max( length( wn.xz ), 1e-3 );
      float tPh = dot( vTW.xz, vec2( -tSd.y, tSd.x ) ) / 6.5 + tPatch * 2.6 + macro * 5.0 + soil.r * 0.25;
      float tTri = 1.0 - abs( fract( tPh ) - 0.5 ) * 2.0;
      tRill = smoothstep( 0.62, 1.0, tTri ) * tRw * ( 0.55 + 0.45 * tPatch );
      col *= 1.0 - 0.14 * tRill;
    }
  }
#endif
  float wet = vSurf.r * uWet * ( 1.0 - rockW * 0.5 );
  col *= 1.0 - wet * 0.35;
  tSnowW = uSnow.x * smoothstep( uSnow.y, uSnow.z, wn.y + ( soil.g - 0.5 ) * 0.15 );
#ifndef TERRAIN_LITE
  if ( uIce > 0.0 ) {
    // sea ice (AD §3.11): bare ice darkens toward deep blue, with two layers of pale cracks under the surface in parallax
    vec3 tV = normalize( cameraPosition - vTW );
    vec2 tPar = tV.xz / max( tV.y, 0.25 );
    float c1 = texture2D( tCracks, vTW.xz / 14.0 - tPar * ( 0.6 / 14.0 ) ).r;
    float c2 = texture2D( tCracks, vTW.xz / 23.0 + 0.37 - tPar * ( 2.2 / 23.0 ) ).g;
    float tIceW = uIce * ( 1.0 - rockW ) * ( 1.0 - smoothstep( 120.0, 400.0, length( vViewPosition ) ) * 0.6 );
    col = mix( col, uIceDeep, 0.35 * tIceW ) + uIceCrack * ( c1 * 0.5 + c2 * 0.22 ) * tIceW;
  }
#endif
  diffuseColor.rgb = mix( col, uSnowColor * ( 0.92 + 0.08 * soil.r ), tSnowW ) * ( 0.55 + 0.45 * vSurf.g );
  tH = mix( soil.g, rk.g, rockW ) * ( 1.0 - 0.7 * tSnowW );
  tHr = rk.g * ( 1.0 - 0.7 * tSnowW );
  tRockW = rockW;
  tGrad *= ( 1.0 - 0.7 * tSnowW );
  tR = mix( mix( soil.a, rk.a, rockW ), 0.78, tSnowW ) - wet * 0.45 - vSurf.a * 0.1;
}
`;
const F_ROUGH = /* glsl */`
  roughnessFactor = clamp( mix( roughnessFactor * ( 0.6 + 0.5 * tR ), 0.2, uGloss ), 0.04, 1.0 );
`;
const F_NORMAL = /* glsl */`
{
  float tDist = length( vViewPosition );
  // mid-scale relief at every distance (≈ 18 m swells over a 73 m rotated tile, plus a 32 m one): the vertex lattice
  // is 4 to 16 m apart, so without it hills between 100 m and 1 km shade as smooth dunes
#ifdef TERRAIN_LITE
  float tMh = texture2D( tNoise, tRot2( 0.61 ) * vTW.xz * 0.0137 ).r;
#else
  float tMh = texture2D( tNoise, tRot2( 0.61 ) * vTW.xz * 0.0137 ).r + 0.5 * texture2D( tNoise, tRot2( -1.13 ) * vTW.xz * 0.031 ).r;
#endif
  normal = tPerturbH( - vViewPosition, normal, tMh * 4.0, uBump * ( 0.3 + 0.3 * tRockW ) * ( 1.0 - 0.6 * tSnowW ) );
#ifndef TERRAIN_LITE
  normal = tPerturbH( - vViewPosition, normal, -tRill, uBump * 0.9 * ( 1.0 - 0.7 * tSnowW ) );
#endif
#ifdef TERRAIN_LITE
  normal = tPerturbH( - vViewPosition, normal, tH, uBump * 0.5 * ( 1.0 - smoothstep( 25.0, 40.0, tDist ) ) );
#else
  vec3 tPert = vec3( tGrad.x, 0.0, tGrad.y ) * 0.07 * uBump * ( 1.0 - tRockW ) * ( 1.0 - smoothstep( 40.0, 160.0, tDist ) );
  normal = normalize( normal - mat3( viewMatrix ) * tPert );
  normal = tPerturbH( - vViewPosition, normal, tHr, uBump * 0.6 * tRockW * ( 1.0 - smoothstep( 80.0, 260.0, tDist ) ) );
  normal = tPerturbH( - vViewPosition, normal, tLedge, uBump * 0.5 * uStrata.z * tSteep * tRockW * ( 1.0 - 0.6 * tSnowW )
                      * ( 1.0 - smoothstep( 380.0, 1100.0, tDist ) ) );
#endif
}
`;
const F_SPARKLE = /* glsl */`
  if ( uSparkle > 0.0 && tSnowW > 0.01 ) {
    vec3 tVg = normalize( cameraPosition - vTW );
    totalEmissiveRadiance += uSunCol * tGlint( vTW, normalize( vTN ), tVg, uSunDirT, 9.0 ) * 6.0 * tSnowW * uSparkle
                             * ( 1.0 - smoothstep( 25.0, 70.0, length( vViewPosition ) ) );
  }
`;

// ====================================================================== renderer
export class TerrainRenderer {
  constructor(ctx, hf, art = {}) {
    this.ctx = ctx;
    this.hf = hf;
    this.art = art || {};
    this.root = new THREE.Group();
    this.root.name = 'terrain';
    this.root.matrixAutoUpdate = false;
    this._nodes = new Map();
    this._pool = [];
    this._built = 0;
    this._frame = 0;
    this._updates = 0;
    this._queue = [];
    this._drawn = [];
    this._lastCam = new THREE.Vector3(hf.bounds.x0, 50, hf.bounds.z0);
    this._lastFocus = new THREE.Vector3();
    this._moving = false; this._moveF = -1e9;
    this._stats = { nodes: 0, pending: 0, triangles: 0, built: 0, pooled: 0, buildMs: 0, builds: 0 };
    this._vn = createValueNoise2D(hf.seed ^ 0x51ab);
    this._setupPalette();
    this._makeMaterial();
    this.setTier(ctx.tier, true);
  }

  // ------------------------------------------------------------------ palette and material
  _art() { return this.ctx.atmosphere?.art || this.art || {}; }
  _setupPalette() {
    const pal = { ground: '#5b4d45', rock: '#2a2321', sediment: '#6b3b28', high: '#786b62', dust: '#8a7a6a', wet: '#3a2e2a',
                  ...(this.art.palette || {}), ...(this._art().palette || {}) };
    this.pal = {};
    for (const k of ['ground', 'rock', 'sediment', 'high', 'dust', 'wet']) this.pal[k] = new THREE.Color(pal[k]);
    this.palKey = JSON.stringify(pal);
    this.palRaw = pal;
    // the vertex bake's coarse rock blend follows the art's per-pixel rock slope band (AD §3.5 uRockSlope)
    const rs = this._art().surface?.rockSlope || this.art.surface?.rockSlope;
    this.rockSlope = Array.isArray(rs) && rs.length === 2 ? [Number(rs[0]) || 0.16, Number(rs[1]) || 0.4] : [0.16, 0.4];
  }
  _makeMaterial() {
    const art = this._art(), S = art.surface || {}, pal = this.palRaw;
    const tier = this.ctx.tier;
    const size = tier.name === 'low' ? 256 : 512;
    // the detail style (AD §3.6): art.surface.style, else 'snow' when the art asks for snow cover, else 'grit'
    const style = S.style || ((Number(S.snow) || 0) >= 0.3 ? 'snow' : 'grit');
    this.style = style;
    const T = detailTextures(style, size, tier.anisotropy ?? 4);
    const strata = Array.isArray(pal.strata) && pal.strata.length >= 2 ? pal.strata
      : (() => { const r = new THREE.Color(pal.rock), h = new THREE.Color(pal.high), g = new THREE.Color(pal.ground), d = new THREE.Color(pal.dust);
                 const hex = (c) => '#' + c.getHexString();
                 return [hex(r), hex(r.clone().lerp(h, 0.35)), hex(r.clone().lerp(g, 0.45)), hex(r.clone().multiplyScalar(0.78)),
                         hex(r.clone().lerp(d, 0.4)), hex(r.clone().lerp(h, 0.6))]; })();
    this._strataTex = strataRamp(strata, this.hf.seed ^ 0x5717);
    const sunCol = new THREE.Color(1, 1, 1);
    const U = this.uniforms = {
      tSoil: { value: T.soil }, tRock: { value: T.rock }, tNoise: { value: T.noise }, tStrata: { value: this._strataTex },
      uRockSlope: { value: new THREE.Vector2(...(S.rockSlope ?? [0.16, 0.36])) },
      uStrata: { value: new THREE.Vector3(S.strataHeight ?? 9, S.strataWarp ?? 1.5, S.strataStrength ?? 0.8) },
      uStrataDip: { value: (() => { const r = mulberry32(this.hf.seed ^ 0xd1b5), a = r() * Math.PI * 2, g = 0.035 + 0.035 * r();
                                    return new THREE.Vector2(Math.cos(a) * g, Math.sin(a) * g); })() },
      uSnow: { value: new THREE.Vector3(S.snow ?? 0, S.snowSlope?.[0] ?? 0.75, S.snowSlope?.[1] ?? 0.92) },
      uSnowColor: { value: new THREE.Color(pal.snow ?? '#e8eef5') },
      uWet: { value: S.wetness ?? 0.5 }, uGloss: { value: S.gloss ?? 0 }, uBump: { value: S.bump ?? 1 },
      uPath: { value: new THREE.Color(pal.dust ?? '#8a7a6a') },
      uSparkle: { value: S.sparkle ?? 0 }, uSoilTexel: { value: 1 / size },
      tCracks: { value: T.cracks }, uIce: { value: this._iceAmount(S, style) },
      uIceDeep: { value: new THREE.Color(pal.wet ?? '#1d2b38').lerp(new THREE.Color('#0d2236'), 0.5) },
      uIceCrack: { value: new THREE.Color('#9fd3ec').lerp(new THREE.Color(pal.snow ?? '#e8eef5'), 0.3) },
      uSunCol: { value: sunCol }, uSunDirT: { value: new THREE.Vector3(0, 1, 0) },
      uLodCenter: { value: new THREE.Vector3() }, uSplitK: { value: 2 },
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    mat.name = 'terrain';
    mat.defines = { TERRAIN: '' };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + V_PARS)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + V_MORPH_N)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + V_MORPH_P)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + V_OUT);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + F_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + F_ALBEDO)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + F_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + F_NORMAL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + F_SPARKLE);
    };
    mat.customProgramCacheKey = () => 'terrain:' + (mat.defines.TERRAIN_LITE !== undefined ? 'lite' : 'full');
    const patched = this.ctx.atmosphere?.patchMaterial ? this.ctx.atmosphere.patchMaterial(mat) : mat;
    this.material = patched || mat;
  }
  /** sea-ice cracks: art.surface.iceCracks (0..1), else on for an icy snow surface (style 'snow' with some gloss) */
  _iceAmount(S, style) {
    if (S.iceCracks !== undefined) return Math.max(0, Number(S.iceCracks) || 0);
    return style === 'snow' && (Number(S.gloss) || 0) >= 0.2 ? 0.6 : 0;
  }
  _syncUniforms() {
    const art = this._art(), S = art.surface || {}, pal = art.palette || {}, U = this.uniforms;
    if (S.rockSlope) U.uRockSlope.value.set(S.rockSlope[0], S.rockSlope[1]);
    U.uStrata.value.set(S.strataHeight ?? 9, S.strataWarp ?? 1.5, S.strataStrength ?? 0.8);
    U.uSnow.value.set(S.snow ?? 0, S.snowSlope?.[0] ?? 0.75, S.snowSlope?.[1] ?? 0.92);
    if (pal.snow) U.uSnowColor.value.set(pal.snow);
    if (pal.dust) U.uPath.value.set(pal.dust);
    U.uWet.value = S.wetness ?? 0.5; U.uGloss.value = S.gloss ?? 0; U.uBump.value = S.bump ?? 1;
    U.uIce.value = this._iceAmount(S, this.style);
    U.uSparkle.value = (S.sparkle ?? 0) * (this.tier?.name === 'low' ? 0.5 : 1);
    // the sky's PMREM already lights the terrain through the hemisphere light; half the library's env weight keeps
    // shadowed faces dark enough for the relief to read (AD §3.1: big terrain casts big, dark shadows)
    const env = 0.5 * (Number(art.light?.env) || 1);
    if (this.material.envMapIntensity !== env) this.material.envMapIntensity = env;
    const at = this.ctx.atmosphere;
    if (at?.sun) U.uSunCol.value.copy(at.sun.color).multiplyScalar(at.sun.intensity / Math.PI);
    if (at?.sunDir) U.uSunDirT.value.copy(at.sunDir);
  }

  // ------------------------------------------------------------------ tiers
  setTier(t, initial = false) {
    const segs = t.terrainSegments || 64;
    const changedSegs = segs !== this.segs;
    this.tier = t;
    this.segs = segs;
    this.K = Math.min(t.terrainSplit || 2, SPLIT_CAP);
    this.viewDist = t.viewDistance || 2600;
    this.castShadows = !!t.terrainCastsShadow;
    this.cacheMax = t.name === 'low' ? 300 : t.name === 'medium' ? 380 : 440;
    this.uniforms.uSplitK.value = this.K;
    const lite = t.name === 'low' || (t.terrainDetail ?? 'full') === 'lite';
    const had = this.material.defines.TERRAIN_LITE !== undefined;
    if (lite !== had) {
      if (lite) this.material.defines.TERRAIN_LITE = ''; else delete this.material.defines.TERRAIN_LITE;
      this.material.needsUpdate = true;
    }
    if (changedSegs && !initial) {
      for (const n of this._nodes.values()) if (n.mesh) this._release(n, true);
      for (const p of this._pool) p.geo.dispose();
      this._pool.length = 0;
      this._index = null;
    }
    if (changedSegs || !this._index) this._makeIndex();
  }
  _makeIndex() {
    const n = this.segs, V = n + 1;
    const idx = [];
    // grid: quad (i, j) → a = (i, j), b = (i+1, j), c = (i+1, j+1), d = (i, j+1); diagonal a–c (matches groundHeight)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * V + i, b = a + 1, c = a + V + 1, d = a + V;
      idx.push(a, c, b, a, d, c);
    }
    // skirts: 4 edges, each a strip from the edge row down to its skirt copy, facing outward (a crack is only ever seen
    // from the neighbour's side; the neighbour's own skirt covers the other case)
    const base = V * V;
    const edge = (e, k) => {           // e: 0 z=0 row, 1 x=n col, 2 z=n row, 3 x=0 col; k along the edge
      if (e === 0) return k; if (e === 1) return k * V + n; if (e === 2) return n * V + k; return k * V;
    };
    for (let e = 0; e < 4; e++) for (let k = 0; k < n; k++) {
      const a = edge(e, k), b = edge(e, k + 1), sa = base + e * V + k, sb = sa + 1;
      if (e === 0 || e === 1) idx.push(a, b, sb, a, sb, sa);
      else idx.push(a, sb, b, a, sa, sb);
    }
    this.vertCount = V * V + 4 * V;
    this._index = new THREE.BufferAttribute(new Uint16Array(idx), 1);
    this.trisPerNode = idx.length / 3;
    this.trisVisiblePerNode = n * n * 2 + 4 * n * 2;
  }
  _newGeo() {
    const nv = this.vertCount;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nv * 3), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint16Array(nv * 3), 3, true));
    g.setAttribute('surf', new THREE.BufferAttribute(new Uint8Array(nv * 4), 4, true));
    g.setAttribute('morph', new THREE.BufferAttribute(new Float32Array(nv * 4), 4));
    g.setIndex(this._index);
    g.boundingBox = new THREE.Box3(); g.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.name = 'terrain-node';
    return { geo: g, mesh, segs: this.segs };
  }

  // ------------------------------------------------------------------ quadtree
  _node(L, ix, iz) {
    const key = (L * 8192 + (ix + 4096)) * 8192 + (iz + 4096);
    let n = this._nodes.get(key);
    if (!n) {
      const size = ROOT >> L, o = this.hf.gridOrigin;
      n = { key, L, ix, iz, size, x0: o.x + ix * size, z0: o.z + iz * size, mesh: null, slot: null, used: -1, kids: null,
            minY: 0, maxY: 0, want: -1, drawnF: -1e9, builtF: -1e9, pf: -1 };
      this._nodes.set(key, n);
    }
    return n;
  }
  _kids(n) {
    if (!n.kids) n.kids = [this._node(n.L + 1, n.ix * 2, n.iz * 2), this._node(n.L + 1, n.ix * 2 + 1, n.iz * 2),
                          this._node(n.L + 1, n.ix * 2, n.iz * 2 + 1), this._node(n.L + 1, n.ix * 2 + 1, n.iz * 2 + 1)];
    return n.kids;
  }
  _dist(n, cx, cz) {
    const dx = Math.max(n.x0 - cx, 0, cx - (n.x0 + n.size)), dz = Math.max(n.z0 - cz, 0, cz - (n.z0 + n.size));
    return Math.sqrt(dx * dx + dz * dz);
  }
  _canCover(n, depth = 0) {
    if (n.mesh) return true;
    if (!n.kids || depth > 3) return false;
    const kids = n.kids;
    for (let i = 0; i < kids.length; i++) if (!this._canCover(kids[i], depth + 1)) return false;
    return true;
  }
  _cover(n, cx, cz, covered = false) {
    const d = this._dist(n, cx, cz);
    n.used = this._frame;                      // ancestors stay cached: the children merge back into them later
    const split = n.L < MAXL && d < this.K * n.size;
    if (split) {
      const kids = this._kids(n);
      const all = this._kidsCover(kids);
      // while settling, recurse straight to the leaves: they are all built before anything is drawn
      if (all || this._settling) { for (const k of kids) this._cover(k, cx, cz, covered || !!n.mesh); return true; }
      for (const k of kids) { k.used = this._frame; this._want(k, this._dist(k, cx, cz), covered || !!n.mesh); }
    }
    else if (this._moving && n.L < MAXL && n.mesh && d < this.K * n.size * 1.3) {
      // prefetch while the camera moves: children are built a little before they're needed, so they appear fully
      // morphed (no pop). A still camera prefetches nothing, so the built set settles to what is drawn.
      for (const k of this._kids(n)) { k.pf = this._frame; if (!k.mesh) { k.used = this._frame; this._want(k, this._dist(k, cx, cz), true, 2000); } }
    }
    if (n.mesh) { this._draw(n); return true; }
    // a split node without all its children is wanted as a fallback (drawn while they build); prewarm and settle skip
    // fallbacks, because they build the children right away
    this._want(n, d, covered, 0, split);
    if (n.kids && this._kidsCover(n.kids)) { for (const k of n.kids) this._drawCovered(k, cx, cz); return true; }
    return false;
  }
  /** wanted-but-not-drawn nodes for a root that is about to enter the view distance */
  _prefetch(n, cx, cz, depth) {
    n.used = this._frame; n.pf = this._frame;
    const d = this._dist(n, cx, cz);
    if (!n.mesh) this._want(n, d, true, 2000);
    if (depth < 1 && n.L < MAXL && d < this.K * n.size) for (const k of this._kids(n)) this._prefetch(k, cx, cz, depth + 1);
  }
  _kidsCover(kids) {
    for (let i = 0; i < kids.length; i++) if (!this._canCover(kids[i])) return false;
    return true;
  }
  /** draw whatever covers a node that isn't wanted at this level (zooming out while the parent builds) */
  _drawCovered(n, cx, cz) {
    if (n.mesh) { this._draw(n); return; }
    for (const k of n.kids) this._drawCovered(k, cx, cz);
  }
  /** queue a build. Priority: holes first (nothing drawn above), then equal screen error (distance / size) */
  _want(n, d, covered = true, extra = 0, fallback = false) {
    if (n.mesh || n.want === this._frame) return;
    n.want = this._frame;
    n._p = (covered ? 1000 : 0) + extra + d / n.size;
    n._pre = !!extra;
    n._fb = fallback;
    this._queue.push(n); n._d = d;
  }
  _draw(n) {
    n.used = this._frame; n.drawnF = this._frame;
    n.mesh.visible = true;
    this._drawn.push(n);
  }
  _select(cx, cz) {
    this._frame++;
    for (const n of this._drawn) if (n.mesh) n.mesh.visible = false;
    this._drawn.length = 0;
    this._queue.length = 0;
    const o = this.hf.gridOrigin, R = this.viewDist, RP = R * 1.3;
    const i0 = Math.floor((cx - RP - o.x) / ROOT), i1 = Math.floor((cx + RP - o.x) / ROOT);
    const j0 = Math.floor((cz - RP - o.z) / ROOT), j1 = Math.floor((cz + RP - o.z) / ROOT);
    // the renderable region: the bounds plus the outer margin
    const b = this.hf.bounds, M = 2816;
    const ri0 = Math.floor((b.x0 - M - o.x) / ROOT), ri1 = Math.floor((b.x1 + M - o.x) / ROOT);
    const rj0 = Math.floor((b.z0 - M - o.z) / ROOT), rj1 = Math.floor((b.z1 + M - o.z) / ROOT);
    let holes = 0;
    for (let j = Math.max(j0, rj0); j <= Math.min(j1, rj1); j++) for (let i = Math.max(i0, ri0); i <= Math.min(i1, ri1); i++) {
      const n = this._node(0, i, j);
      const d = this._dist(n, cx, cz);
      if (d > RP) continue;
      n.used = this._frame;
      if (d > R) { if (this._moving) this._prefetch(n, cx, cz, 0); continue; }   // just outside the view: build ahead while moving
      if (!this._cover(n, cx, cz)) holes++;
    }
    this._queue.sort(byPriority);
    let pend = 0; for (const q of this._queue) if (!q._pre) pend++;
    this._stats.pending = pend;
    this._stats.prefetch = this._queue.length - pend;
    this._stats.holes = holes;
  }

  // ------------------------------------------------------------------ build
  _build(n) {
    const t0 = performance.now();
    let slot = this._pool.pop();
    if (!slot || slot.segs !== this.segs) { if (slot) slot.geo.dispose(); slot = this._newGeo(); }
    const hf = this.hf, nseg = this.segs, V = nseg + 1, sp = n.size / nseg, B = 2, G = V + 2 * B;
    const hg = this._hg && this._hg.length === G * G ? this._hg : (this._hg = new Float64Array(G * G));
    // heights on the node lattice plus a 2-vertex border (normals and morph targets), batch-evaluated: identical to
    // heightAt per sample, so neighbouring nodes and the collision tiles agree exactly
    hf.heightGrid(n.x0 - B * sp, n.z0 - B * sp, sp, G, G, hg);
    const geo = slot.geo, P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color.array,
          SF = geo.attributes.surf.array, M = geo.attributes.morph.array;
    const pal = this.pal, h20 = hf.h20 ?? 0, h80 = hf.h80 ?? 1;
    const gR = pal.ground.r, gG = pal.ground.g, gB = pal.ground.b, sR = pal.sediment.r, sG = pal.sediment.g, sB = pal.sediment.b;
    const hR = pal.high.r, hG = pal.high.g, hB = pal.high.b, rR = pal.rock.r, rG = pal.rock.g, rB = pal.rock.b;
    const dR = pal.dust.r, dG = pal.dust.g, dB = pal.dust.b, rs0 = this.rockSlope[0], rs1 = this.rockSlope[1];
    let minY = Infinity, maxY = -Infinity;
    const i2s = 1 / (2 * sp), i4s = 1 / (4 * sp);
    const vn = this._vn, isLow = n.L === 0;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const v = j * V + i, x = n.x0 + i * sp, z = n.z0 + j * sp, g = (j + B) * G + i + B, h = hg[g];
      if (h < minY) minY = h; if (h > maxY) maxY = h;
      P[v * 3] = i * sp; P[v * 3 + 1] = h; P[v * 3 + 2] = j * sp;
      // normal: central differences on the node's own lattice (same-level neighbours agree exactly)
      let hx = (hg[g + 1] - hg[g - 1]) * i2s, hz = (hg[g + G] - hg[g - G]) * i2s;
      let l = 1 / Math.sqrt(hx * hx + hz * hz + 1);
      const ny = l;
      N[v * 3] = -hx * l * 127; N[v * 3 + 1] = l * 127; N[v * 3 + 2] = -hz * l * 127;
      // morph target: the parent's surface at this point (odd vertices: the mean of their even neighbours along the
      // parent's edge/diagonal) and the parent's normal (step-2 differences)
      const oi = i & 1, oj = j & 1;
      let ty, mx, my, mz;
      if (!oi && !oj) {
        ty = h; hx = (hg[g + 2] - hg[g - 2]) * i4s; hz = (hg[g + 2 * G] - hg[g - 2 * G]) * i4s;
        l = 1 / Math.sqrt(hx * hx + hz * hz + 1); mx = -hx * l; my = l; mz = -hz * l;
      } else {
        const ga = oi && !oj ? g - 1 : !oi && oj ? g - G : g - G - 1, gb = oi && !oj ? g + 1 : !oi && oj ? g + G : g + G + 1;
        ty = (hg[ga] + hg[gb]) * 0.5;
        let ax = (hg[ga + 2] - hg[ga - 2]) * i4s, az = (hg[ga + 2 * G] - hg[ga - 2 * G]) * i4s;
        let la = 1 / Math.sqrt(ax * ax + az * az + 1);
        let bx = (hg[gb + 2] - hg[gb - 2]) * i4s, bz = (hg[gb + 2 * G] - hg[gb - 2 * G]) * i4s;
        let lb = 1 / Math.sqrt(bx * bx + bz * bz + 1);
        mx = -ax * la - bx * lb; my = la + lb; mz = -az * la - bz * lb;
        const ml = 1 / (Math.sqrt(mx * mx + my * my + mz * mz) || 1); mx *= ml; my *= ml; mz *= ml;
      }
      M[v * 4] = ty; M[v * 4 + 1] = mx; M[v * 4 + 2] = mz; M[v * 4 + 3] = n.L > 0 ? n.size : 0;
      // colour bake (AD §3.3 with the arch §5.4 sun term; sky AO goes to surf.b for the shader)
      hf.bakeAt(x, z, _bk);
      const slope = _bk.slope >= 0 ? _bk.slope : 1 - ny;
      const sed = smooth(0.15, 0.6, _bk.flow);
      const cv = _bk.curv || 0;
      let r = gR, gg = gG, b = gB, t;
      t = sed * 0.8; r += (sR - r) * t; gg += (sG - gg) * t; b += (sB - b) * t;
      // ridges and crests paler (wind-scoured), hollows and gullies darker (AD §3.1)
      t = Math.min(1, smooth(h20, h80, h) * 0.45 + (cv > 0 ? cv : 0) * 0.55); r += (hR - r) * t; gg += (hG - gg) * t; b += (hB - b) * t;
      t = (cv < 0 ? -cv : 0) * 0.45; r += (sR * 0.7 - r) * t; gg += (sG * 0.7 - gg) * t; b += (sB * 0.7 - b) * t;
      t = smooth(rs0, rs1, slope); r += (rR - r) * t; gg += (rG - gg) * t; b += (rB - b) * t;
      const path = _bk.path ?? _bk.bed;
      t = path * 0.6 + _bk.bed * 0.12; r += (dR - r) * t; gg += (dG - gg) * t; b += (dB - b) * t;
      // patchiness here; the baked sun term (arch §5.4) rides surf.g and multiplies the final albedo in the shader, so
      // the strata, path and snow colours that replace the vertex colour per pixel are shaded by it too
      const light = 0.88 + 0.24 * vn(x / 37, z / 37);
      r *= light; gg *= light; b *= light;
      C[v * 3] = (r > 1 ? 1 : r) * 65535; C[v * 3 + 1] = (gg > 1 ? 1 : gg) * 65535; C[v * 3 + 2] = (b > 1 ? 1 : b) * 65535;
      const fl = _bk.flow * 1.3;
      SF[v * 4] = (fl > 1 ? 1 : fl) * 255; SF[v * 4 + 1] = _bk.sun * 255; SF[v * 4 + 2] = _bk.sky * 255; SF[v * 4 + 3] = path * 255;
    }
    void isLow;
    // skirts
    const skirt = Math.max(4, 2 * sp), base = V * V;
    for (let e = 0; e < 4; e++) for (let k = 0; k < V; k++) {
      const src = e === 0 ? k : e === 1 ? k * V + nseg : e === 2 ? nseg * V + k : k * V;
      const dst = base + e * V + k;
      P[dst * 3] = P[src * 3]; P[dst * 3 + 1] = P[src * 3 + 1] - skirt; P[dst * 3 + 2] = P[src * 3 + 2];
      N[dst * 3] = N[src * 3]; N[dst * 3 + 1] = N[src * 3 + 1]; N[dst * 3 + 2] = N[src * 3 + 2];
      C[dst * 3] = C[src * 3]; C[dst * 3 + 1] = C[src * 3 + 1]; C[dst * 3 + 2] = C[src * 3 + 2];
      for (let q = 0; q < 4; q++) SF[dst * 4 + q] = SF[src * 4 + q];
      M[dst * 4] = M[src * 4] - skirt; M[dst * 4 + 1] = M[src * 4 + 1]; M[dst * 4 + 2] = M[src * 4 + 2]; M[dst * 4 + 3] = M[src * 4 + 3];
    }
    for (const k of ['position', 'normal', 'color', 'surf', 'morph']) geo.attributes[k].needsUpdate = true;
    geo.boundingBox.min.set(0, minY - skirt, 0); geo.boundingBox.max.set(n.size, maxY + 1, n.size);
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);
    n.minY = minY; n.maxY = maxY;
    const mesh = slot.mesh;
    mesh.material = this.material;
    mesh.position.set(n.x0, 0, n.z0);
    mesh.updateMatrix();
    mesh.matrixWorldNeedsUpdate = true;
    mesh.visible = false;
    if (!mesh.parent) this.root.add(mesh);
    n.mesh = mesh; n.slot = slot; n.builtF = this._frame;
    this._built++;
    this._stats.builds++;
    this._stats.buildMs += performance.now() - t0;
  }
  _release(n, dispose = false) {
    if (!n.mesh) return;
    const slot = n.slot;
    this.root.remove(n.mesh);
    n.mesh.visible = false;
    n.mesh = null; n.slot = null;
    this._built--;
    if (!dispose && this._pool.length < POOL_SPARE && slot.segs === this.segs) this._pool.push(slot);
    else slot.geo.dispose();
  }
  _evict(cx, cz) {
    // the built set tracks the working set, so memory after any flight returns to what the same view needed before it.
    // A built node is kept while it is drawn or was drawn in the last RETAIN selections (≈ 2 to 4 s: quick back-and-forth
    // reuses it), while it is a current prefetch (camera moving), or while it was built recently and the selection still
    // uses it (a child waiting for its siblings, a fallback). Anything else (an ancestor nothing has drawn for a while, a
    // prefetch the camera stopped short of, a node beyond the view) returns its geometry to the pool.
    const far = this.viewDist * 1.45, F = this._frame, recent = F - RETAIN;
    const old = [];
    for (const n of this._nodes.values()) {
      if (!n.mesh || n.drawnF === F) continue;
      const keep = (n.drawnF >= recent || n.pf === F || (n.used === F && n.builtF >= recent)) && this._dist(n, cx, cz) <= far;
      if (!keep) { this._release(n); continue; }
      old.push(n);
    }
    const over = this._built - this.cacheMax;
    if (over > 0 && old.length) {
      old.sort((a, b) => Math.max(a.drawnF, a.builtF) - Math.max(b.drawnF, b.builtF));
      for (let i = 0; i < Math.min(over, old.length); i++) if (old[i].mesh) this._release(old[i]);
    }
    // forget empty far nodes so the map stays small
    if (this._nodes.size > 6000) for (const [k, n] of this._nodes) if (!n.mesh && this._dist(n, cx, cz) > far * 1.5) this._nodes.delete(k);
  }
  _shadows(focus) {
    const ext = (this.ctx.tier.shadowExtent || 160) * 1.25;
    for (const n of this._drawn) {
      const cast = this.castShadows && this._dist(n, focus.x, focus.z) < ext;
      if (n.mesh.castShadow !== cast) n.mesh.castShadow = cast;
    }
  }

  // ------------------------------------------------------------------ public API
  /** motion gate for prefetching: the camera moved within the last MOVE_HOLD selections */
  _track(cam) {
    const dx = cam.x - this._lastCam.x, dz = cam.z - this._lastCam.z;
    if (dx * dx + dz * dz > 0.0025) this._moveF = this._frame;
    this._moving = this._frame - (this._moveF ?? -1e9) < MOVE_HOLD;
  }
  update(focus, cameraPos, budgetMs = 5) {
    const cam = cameraPos || focus;
    this._track(cam);
    this._lastCam.copy(cam); if (focus) this._lastFocus.copy(focus);
    this.uniforms.uLodCenter.value.copy(cam);
    this._syncUniforms();
    this._select(cam.x, cam.z);
    if (budgetMs > 0 && this._queue.length) {
      const t0 = performance.now();
      let built = 0;
      for (const n of this._queue) {
        if (n.mesh) continue;
        this._build(n);
        built++;
        if (performance.now() - t0 >= budgetMs) break;
      }
      if (built) this._select(cam.x, cam.z);
    }
    // eviction walks every known node: every 15 frames, or now when the cache is over its cap
    if (this._built > this.cacheMax || (++this._updates % 15) === 0) this._evict(cam.x, cam.z);
    this._shadows(focus || cam);
    this._count();
  }
  _count() {
    this._stats.nodes = this._drawn.length;
    this._stats.triangles = this._drawn.length * this.trisVisiblePerNode;
    this._stats.built = this._built;
    this._stats.pooled = this._pool.length;
  }
  /** where settle() centres without an argument: the player in follow mode (a debug teleport settles before the
   *  camera has caught up), otherwise the camera */
  _defaultCam() {
    const c = this.ctx, rig = c.cameraRig, p = c.player;
    if ((!rig || rig.mode === 'follow') && p?.active && p.pos) return _dc.set(p.pos.x, p.pos.y + 12, p.pos.z);
    return c.camera?.position || this._lastCam;
  }
  /** build every wanted node now (no yields), re-selecting until nothing is pending */
  settle(cameraPos) {
    const cam = cameraPos || this._defaultCam();
    this._lastCam.copy(cam);
    this.uniforms.uLodCenter.value.copy(cam);
    this._syncUniforms();
    for (let it = 0; it < 4; it++) {
      this._settling = true;
      this._select(cam.x, cam.z);
      this._settling = false;
      const q = this._queue.filter(n => !n._pre && !n._fb);
      if (!q.length) break;
      for (const n of q) if (!n.mesh) this._build(n);
    }
    this._select(cam.x, cam.z);
    this._evict(cam.x, cam.z);
    this._shadows(this._lastFocus);
    this._count();
  }
  async prewarm(focus, onProgress) {
    const cam = new THREE.Vector3(focus.x, focus.y + 15, focus.z);
    this._lastCam.copy(cam); this._lastFocus.copy(focus);
    this.uniforms.uLodCenter.value.copy(cam);
    this._syncUniforms();
    let done = 0, t = performance.now();
    for (let it = 0; it < 4; it++) {
      this._settling = true;
      this._select(cam.x, cam.z);
      this._settling = false;
      const q = this._queue.filter(n => !n._pre && !n._fb);
      if (!q.length) break;
      for (const n of q) {
        if (!n.mesh) this._build(n);
        done++;
        if (performance.now() - t > 40) {
          onProgress?.(Math.min(0.99, done / (done + this._queue.length)));
          await new Promise(r => setTimeout(r, 0));
          t = performance.now();
        }
      }
    }
    this._select(cam.x, cam.z);
    this._count();
    onProgress?.(1);
  }
  stats() {
    return { nodes: this._stats.nodes, pending: this._stats.pending, prefetch: this._stats.prefetch || 0, triangles: this._stats.triangles, built: this._stats.built,
             pooled: this._stats.pooled, holes: this._stats.holes || 0, builds: this._stats.builds,
             avgBuildMs: this._stats.builds ? this._stats.buildMs / this._stats.builds : 0 };
  }
  /** extra: draw calls and triangles of the drawn nodes inside a camera frustum (main-pass terrain budget) */
  measure(camera) {
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    let calls = 0;
    for (const n of this._drawn) {
      _sph.copy(n.mesh.geometry.boundingSphere); _sph.center.x += n.x0; _sph.center.z += n.z0;
      if (_frustum.intersectsSphere(_sph)) calls++;
    }
    return { calls, triangles: calls * this.trisVisiblePerNode, drawn: this._drawn.length };
  }
  /** extra (tests): the rendered, morphed surface height at (x, z) (a CPU replica of the vertex shader), or null */
  renderedHeightAt(x, z) {
    const n = this._drawnAt(x, z);
    if (n) {
      const sp = n.size / this.segs, V = this.segs + 1;
      const fx = Math.min(this.segs - 1e-9, (x - n.x0) / sp), fz = Math.min(this.segs - 1e-9, (z - n.z0) / sp);
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const h = (a, b) => this._morphedY(n, a, b, V, sp);
      const h00 = h(i, j), h11 = h(i + 1, j + 1);
      if (tx >= tz) { const h10 = h(i + 1, j); return h00 + (h10 - h00) * tx + (h11 - h10) * tz; }
      const h01 = h(i, j + 1); return h00 + (h01 - h00) * tz + (h11 - h01) * tx;
    }
    return null;
  }
  /** the drawn node covering (x, z): walk the levels through the node map (O(levels)) */
  _drawnAt(x, z) {
    const o = this.hf.gridOrigin;
    for (let L = MAXL; L >= 0; L--) {
      const size = ROOT >> L, ix = Math.floor((x - o.x) / size), iz = Math.floor((z - o.z) / size);
      const n = this._nodes.get((L * 8192 + (ix + 4096)) * 8192 + (iz + 4096));
      if (n && n.mesh && n.mesh.visible) return n;
    }
    return null;
  }
  _morphedY(n, i, j, V, sp) {
    const geo = n.mesh.geometry, P = geo.attributes.position.array, M = geo.attributes.morph.array, v = j * V + i;
    const y = P[v * 3 + 1], S = M[v * 4 + 3];
    if (!(S > 0)) return y;
    const c = this.uniforms.uLodCenter.value, wx = n.x0 + i * sp, wz = n.z0 + j * sp;
    const d = Math.hypot(wx - c.x, wz - c.z), e0 = (this.K + 1.45) * S, e1 = 2 * this.K * S;
    const t = Math.min(1, Math.max(0, (d - e0) / (e1 - e0))), k = t * t * (3 - 2 * t);
    return y + (M[v * 4] - y) * k;
  }
  /** extra (tests): the largest height gap between a drawn node's rendered edge and its neighbours' surfaces */
  edgeGap() {
    let max = 0, count = 0;
    for (const n of this._drawn) {
      const sp = n.size / this.segs, V = this.segs + 1, eps = 0.01;
      for (let k = 0; k <= this.segs; k++) {
        for (const [i, j, ox, oz] of [[k, 0, 0, -eps], [k, this.segs, 0, eps], [0, k, -eps, 0], [this.segs, k, eps, 0]]) {
          const x = n.x0 + i * sp, z = n.z0 + j * sp;
          const other = this.renderedHeightAt(x + ox, z + oz);
          if (other === null) continue;
          const g = Math.abs(this._morphedY(n, i, j, V, sp) - other);
          count++;
          if (g > max) max = g;
        }
      }
    }
    return { max, count };
  }
  /** extra: the drawn node meshes (tests: raycasting against the settled mesh) */
  drawnMeshes() { return this._drawn.map(n => n.mesh); }
  /** extra: the drawn node that covers (x, z), with its size */
  nodeAt(x, z) {
    const n = this._drawnAt(x, z);
    return n ? { mesh: n.mesh, size: n.size, L: n.L } : null;
  }
  dispose() {
    this.root.parent?.remove(this.root);
    for (const n of this._nodes.values()) if (n.mesh) this._release(n, true);
    for (const p of this._pool) p.geo.dispose();
    this._pool.length = 0;
    this._nodes.clear();
    this._drawn.length = 0;
    this.material.dispose();
    this._strataTex?.dispose();
  }
}
