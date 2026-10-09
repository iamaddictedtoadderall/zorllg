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
// neighbours agree exactly), colour (Uint16 linear: palette blend × baked sun term), `surf` (Uint8×4: flow, sediment,
// sky AO, route-bed mask) and `morph` (target y, target normal xz, node size).
// Material: AD §3.5 (two-scale soil, triplanar rock with strata ramp, macro noise, derivative bump, wetness, snow mask,
// optional snow sparkle), TERRAIN_LITE on Low, then ctx.atmosphere.patchMaterial. The detail textures are this
// module's own packed data maps (AD §3.6: R albedo variation, G height, B cavity, A roughness), generated per
// art.surface.style and cached for the session.
import * as THREE from 'three';
import { clamp, smooth, lerp, mulberry32 } from '../core/util.js';
import { createValueNoise2D, tileable2 } from '../core/noise.js';

const ROOT = 1024, MIN = 128, MAXL = 3;
const SPLIT_CAP = 1.8;
const POOL_SPARE = 24;
const _col = new THREE.Color(), _c2 = new THREE.Color();
const _bk = { flow: 0, bed: 0, sky: 1, sun: 1, slope: 0, curv: 0, inside: false };
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();

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
  return (u, v, out) => {
    const x = u * cx, y = v * cz, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = ((xi + i) % cx + cx) % cx, gy = ((yi + j) % cz + cz) % cz, k = gy * cx + gx;
      // distance in units of the cell width (cells cz/cx times taller than wide stretch the pattern vertically)
      const d = Math.hypot(xi + i + pts[k * 2] - x, (yi + j + pts[k * 2 + 1] - y) * (cx / cz));
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    out.f1 = f1; out.f2 = f2; out.id = id; return out;
  };
}
const _wo = { f1: 0, f2: 0, id: 0 };
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
  const W = worley(s + 5, 24), Wr = worley(s + 6, 10, 3), Wi = worley(s + 7, 36), Wb = worley(s + 9, 8);
  const N4 = tileable2(s + 11, 4), N8 = tileable2(s + 12, 8);
  // vertical streaks: smooth noise across 48 columns, constant down each column
  const colH = new Float32Array(48); { const r = mulberry32(s + 13); for (let i = 0; i < 48; i++) colH[i] = r(); }
  const streakAt = (u) => { const x = u * 48, i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); return colH[i % 48] + (colH[(i + 1) % 48] - colH[i % 48]) * t; };
  const fbmT = (u, v) => 0.5 * E(u * 4, v * 4) + 0.3 * A(u * 8, v * 8) + 0.2 * F(u * 16, v * 16);
  let soil, rock;
  if (style === 'snow') {
    soil = makeData(size, (u, v, o) => {
      // wind sastrugi: noise stretched 6:1 along u, plus sparse glassy ice pebbles
      const st = 0.55 * E(u * 4, v * 24) + 0.3 * A(u * 8, v * 48) + 0.15 * C(u * 64, v * 64);
      const w = Wi(u, v, _wo), peb = smooth(0.3, 0.12, w.f1 * 1.0) * (hash1(w.id + 3) > 0.82 ? 1 : 0);
      o[0] = 0.52 + (st - 0.5) * 0.3 - peb * 0.28;
      o[1] = 0.25 + st * 0.6 + peb * 0.15;
      o[2] = 1 - smooth(0.32, 0.15, st) * 0.35;
      o[3] = 0.8 - peb * 0.65 + (st - 0.5) * 0.12;
    });
    rock = makeData(size, (u, v, o) => {
      const n = fbmT(u, v), band = v * 7 + 0.15 * (E(u * 4, v * 4) - 0.5) * 2, bi = Math.floor(band), bf = band - bi;
      const hard = hash1(bi * 7 + 11) > 0.45, edge = smooth(0.07, 0.0, Math.min(bf, 1 - bf));
      const w = Wr(u, v, _wo), crack = smooth(0.06, 0.0, w.f2 - w.f1);
      // rime fills the fractures: cracks read pale, frost flecks on hard bands
      o[0] = 0.5 + (hard ? 0.08 : -0.06) + (n - 0.5) * 0.3 + crack * 0.3 - edge * 0.12;
      o[1] = (hard ? 0.62 : 0.42) + n * 0.2 - crack * 0.4 - edge * 0.1;
      o[2] = 1 - crack * 0.5 - edge * 0.25;
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
    soil = makeData(size, (u, v, o) => {
      const base = 0.6 * A(u * 8, v * 8) + 0.4 * B(u * 32, v * 32);
      const fine = C(u * 64, v * 64);
      const w = W(u, v, _wo), cr = hash1(w.id), patch = smooth(0.42, 0.62, E(u * 4 + 0.37, v * 4 + 0.11));
      const peb = smooth(0.3, 0.16, w.f1 * 1.0) * (cr > 0.62 ? 1 : 0) * (0.4 + 0.6 * (1 - patch));
      const crack = smooth(0.035, 0.0, w.f2 - w.f1) * 0.45 * patch;   // dried-mud cracks only in patches
      o[0] = 0.5 + (base - 0.5) * 0.6 + (fine - 0.5) * 0.15 + peb * (hash1(w.id + 7) - 0.5) * 0.5 - crack * 0.3;
      o[1] = base * 0.55 + peb * 0.45 - crack * 0.5 + (fine - 0.5) * 0.1;
      o[2] = 1 - crack * 0.8;
      o[3] = 0.82 - peb * 0.25 + (base - 0.5) * 0.2;
    });
    rock = makeData(size, (u, v, o) => {
      const n = fbmT(u, v), band = v * 7 + 0.15 * (E(u * 4, v * 4) - 0.5) * 2, bi = Math.floor(band), bf = band - bi;
      const hard = hash1(bi * 7 + 11) > 0.45, edge = smooth(0.07, 0.0, Math.min(bf, 1 - bf));
      const w = Wr(u, v, _wo), crack = smooth(0.06, 0.0, w.f2 - w.f1);
      const streak = smooth(0.6, 0.9, streakAt(u)) * (0.5 + 0.5 * E(u * 4, v * 4)) * 0.25;   // varnish streaks down the face
      o[0] = 0.5 + (hard ? 0.1 : -0.07) + (n - 0.5) * 0.3 - edge * 0.25 - crack * 0.2 - streak;
      o[1] = (hard ? 0.65 : 0.4) + n * 0.2 - crack * 0.45 - edge * 0.1;
      o[2] = 1 - crack * 0.85 - edge * 0.3;
      o[3] = 0.88 + (n - 0.5) * 0.1;
    });
  }
  const noise = makeData(Math.min(256, size), (u, v, o) => {
    o[0] = 0.5 * E(u * 4, v * 4) + 0.3 * A(u * 8, v * 8) + 0.2 * F(u * 16, v * 16);
    o[1] = 0.6 * N4(u * 4, v * 4) + 0.4 * N8(u * 8, v * 8);
    o[2] = B(u * 32, v * 32); o[3] = 1;
  });
  T = { soil, rock, noise };
  for (const t of Object.values(T)) t.anisotropy = aniso;
  TEX_CACHE.set(key, T);
  return T;
}
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
uniform sampler2D tSoil, tRock, tNoise, tStrata;
uniform vec2 uRockSlope;
uniform vec3 uStrata, uSnow, uSnowColor, uPath;
uniform float uWet, uGloss, uBump, uSparkle, uSoilTexel;
uniform vec3 uSunCol, uSunDirT;
varying vec4 vSurf;
varying vec3 vTW, vTN;
float tH, tR, tSnowW, tRockW, tHr;
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
  vec4 rk = texture2D( tRock, vTW.zy * 0.06 ) * bw.x + texture2D( tRock, vTW.xz * 0.06 ) * bw.y
          + texture2D( tRock, vTW.xy * 0.06 ) * bw.z;
#else
  vec4 rk = texture2D( tRock, vec2( vTW.x + vTW.z, vTW.y ) * 0.06 );
#endif
  float macro = texture2D( tNoise, vTW.xz * 0.0024 ).r;
  float rockW = smoothstep( uRockSlope.x, uRockSlope.y, 1.0 - wn.y + ( soil.g - 0.5 ) * 0.12 );
  float band = vTW.y / uStrata.x + ( texture2D( tNoise, vTW.xz * 0.0015 ).g - 0.5 ) * uStrata.y + rk.g * 0.15;
  vec3 strataCol = texture2D( tStrata, vec2( fract( band ), 0.5 ) ).rgb;
  vec3 rockCol = mix( diffuseColor.rgb, strataCol, uStrata.z ) * ( 0.7 + 0.6 * rk.r );
  vec3 soilCol = mix( diffuseColor.rgb * ( 0.82 + 0.36 * soil.r ), uPath * ( 0.9 + 0.2 * soil.r ), vSurf.a * 0.5 );
  vec3 col = mix( soilCol, rockCol, rockW ) * ( 0.86 + 0.28 * macro );
  col *= mix( 1.0, mix( soil.b, rk.b, rockW ), 0.55 ) * mix( 0.5, 1.0, vSurf.b );
  float wet = vSurf.r * uWet * ( 1.0 - rockW * 0.5 );
  col *= 1.0 - wet * 0.35;
  tSnowW = uSnow.x * smoothstep( uSnow.y, uSnow.z, wn.y + ( soil.g - 0.5 ) * 0.15 );
  diffuseColor.rgb = mix( col, uSnowColor * ( 0.92 + 0.08 * soil.r ), tSnowW );
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
#ifdef TERRAIN_LITE
  normal = tPerturbH( - vViewPosition, normal, tH, uBump * 0.5 * ( 1.0 - smoothstep( 25.0, 40.0, tDist ) ) );
#else
  vec3 tPert = vec3( tGrad.x, 0.0, tGrad.y ) * 0.07 * uBump * ( 1.0 - tRockW ) * ( 1.0 - smoothstep( 40.0, 160.0, tDist ) );
  normal = normalize( normal - mat3( viewMatrix ) * tPert );
  normal = tPerturbH( - vViewPosition, normal, tHr, uBump * 0.6 * tRockW * ( 1.0 - smoothstep( 80.0, 260.0, tDist ) ) );
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
    this._queue = [];
    this._drawn = [];
    this._lastCam = new THREE.Vector3(hf.bounds.x0, 50, hf.bounds.z0);
    this._lastFocus = new THREE.Vector3();
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
  }
  _makeMaterial() {
    const art = this._art(), S = art.surface || {}, pal = this.palRaw;
    const tier = this.ctx.tier;
    const size = tier.name === 'low' ? 256 : 512;
    const T = detailTextures(S.style || 'grit', size, tier.anisotropy ?? 4);
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
      uSnow: { value: new THREE.Vector3(S.snow ?? 0, S.snowSlope?.[0] ?? 0.75, S.snowSlope?.[1] ?? 0.92) },
      uSnowColor: { value: new THREE.Color(pal.snow ?? '#e8eef5') },
      uWet: { value: S.wetness ?? 0.5 }, uGloss: { value: S.gloss ?? 0 }, uBump: { value: S.bump ?? 1 },
      uPath: { value: new THREE.Color(pal.dust ?? '#8a7a6a') },
      uSparkle: { value: S.sparkle ?? 0 }, uSoilTexel: { value: 1 / size },
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
  _syncUniforms() {
    const art = this._art(), S = art.surface || {}, pal = art.palette || {}, U = this.uniforms;
    if (S.rockSlope) U.uRockSlope.value.set(S.rockSlope[0], S.rockSlope[1]);
    U.uStrata.value.set(S.strataHeight ?? 9, S.strataWarp ?? 1.5, S.strataStrength ?? 0.8);
    U.uSnow.value.set(S.snow ?? 0, S.snowSlope?.[0] ?? 0.75, S.snowSlope?.[1] ?? 0.92);
    if (pal.snow) U.uSnowColor.value.set(pal.snow);
    if (pal.dust) U.uPath.value.set(pal.dust);
    U.uWet.value = S.wetness ?? 0.5; U.uGloss.value = S.gloss ?? 0; U.uBump.value = S.bump ?? 1;
    U.uSparkle.value = (S.sparkle ?? 0) * (this.tier?.name === 'low' ? 0.5 : 1);
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
            minY: 0, maxY: 0, want: -1 };
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
    for (const k of n.kids) if (!this._canCover(k, depth + 1)) return false;
    return true;
  }
  _cover(n, cx, cz, covered = false) {
    const d = this._dist(n, cx, cz);
    n.used = this._frame;                      // ancestors stay cached: the children merge back into them later
    const split = n.L < MAXL && d < this.K * n.size;
    if (split) {
      const kids = this._kids(n);
      let all = true;
      for (const k of kids) if (!this._canCover(k)) { all = false; break; }
      if (all) { for (const k of kids) this._cover(k, cx, cz, covered || !!n.mesh); return true; }
      for (const k of kids) { k.used = this._frame; this._want(k, this._dist(k, cx, cz), covered || !!n.mesh); }
    }
    else if (n.L < MAXL && n.mesh && d < this.K * n.size * 1.3) {
      // prefetch: children are built a little before they're needed, so they appear fully morphed (no pop)
      for (const k of this._kids(n)) if (!k.mesh) { k.used = this._frame; this._want(k, this._dist(k, cx, cz), true, 2000); }
    }
    if (n.mesh) { this._draw(n); return true; }
    this._want(n, d, covered);
    if (n.kids && n.kids.every(k => this._canCover(k))) { for (const k of n.kids) this._drawCovered(k, cx, cz); return true; }
    return false;
  }
  /** wanted-but-not-drawn nodes for a root that is about to enter the view distance */
  _prefetch(n, cx, cz, depth) {
    n.used = this._frame;
    const d = this._dist(n, cx, cz);
    if (!n.mesh) this._want(n, d, true, 2000);
    if (depth < 1 && n.L < MAXL && d < this.K * n.size) for (const k of this._kids(n)) this._prefetch(k, cx, cz, depth + 1);
  }
  /** draw whatever covers a node that isn't wanted at this level (zooming out while the parent builds) */
  _drawCovered(n, cx, cz) {
    if (n.mesh) { this._draw(n); return; }
    for (const k of n.kids) this._drawCovered(k, cx, cz);
  }
  /** queue a build. Priority: holes first (nothing drawn above), then equal screen error (distance / size) */
  _want(n, d, covered = true, extra = 0) {
    if (n.mesh || n.want === this._frame) return;
    n.want = this._frame;
    n._p = (covered ? 1000 : 0) + extra + d / n.size;
    if (extra) n._pre = true; else n._pre = false;
    this._queue.push(n); n._d = d;
  }
  _draw(n) {
    n.used = this._frame;
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
      if (d > R) { this._prefetch(n, cx, cz, 0); continue; }   // just outside the view: build ahead, draw nothing
      if (!this._cover(n, cx, cz)) holes++;
    }
    this._queue.sort((a, b2) => a._p - b2._p || a.L - b2.L);
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
    for (let j = 0; j < G; j++) {
      const z = n.z0 + (j - B) * sp;
      for (let i = 0; i < G; i++) hg[j * G + i] = hf.heightAt(n.x0 + (i - B) * sp, z);
    }
    const geo = slot.geo, P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color.array,
          SF = geo.attributes.surf.array, M = geo.attributes.morph.array;
    const pal = this.pal, h20 = hf.h20 ?? 0, h80 = hf.h80 ?? 1;
    let minY = Infinity, maxY = -Infinity;
    const H = (i, j) => hg[(j + B) * G + i + B];
    const nrm = (i, j, s, out) => {           // normal at lattice (i, j) with neighbour step s (in vertices)
      const hx = (H(i + s, j) - H(i - s, j)) / (2 * s * sp), hz = (H(i, j + s) - H(i, j - s)) / (2 * s * sp);
      const l = Math.sqrt(hx * hx + hz * hz + 1);
      out[0] = -hx / l; out[1] = 1 / l; out[2] = -hz / l; return out;
    };
    const nA = [0, 0, 0], nB = [0, 0, 0], nO = [0, 0, 0];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const v = j * V + i, x = n.x0 + i * sp, z = n.z0 + j * sp, h = H(i, j);
      if (h < minY) minY = h; if (h > maxY) maxY = h;
      P[v * 3] = i * sp; P[v * 3 + 1] = h; P[v * 3 + 2] = j * sp;
      nrm(i, j, 1, nO);
      N[v * 3] = nO[0] * 127; N[v * 3 + 1] = nO[1] * 127; N[v * 3 + 2] = nO[2] * 127;
      // morph target: the parent's surface at this point
      const oi = i & 1, oj = j & 1;
      let ty;
      if (!oi && !oj) { ty = h; nrm(i, j, 2, nA); nB[0] = nA[0]; nB[1] = nA[1]; nB[2] = nA[2]; }
      else if (oi && !oj) { ty = (H(i - 1, j) + H(i + 1, j)) * 0.5; nrm(i - 1, j, 2, nA); nrm(i + 1, j, 2, nB); }
      else if (!oi && oj) { ty = (H(i, j - 1) + H(i, j + 1)) * 0.5; nrm(i, j - 1, 2, nA); nrm(i, j + 1, 2, nB); }
      else { ty = (H(i - 1, j - 1) + H(i + 1, j + 1)) * 0.5; nrm(i - 1, j - 1, 2, nA); nrm(i + 1, j + 1, 2, nB); }
      let mx = nA[0] + nB[0], my = nA[1] + nB[1], mz = nA[2] + nB[2];
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      M[v * 4] = ty; M[v * 4 + 1] = mx / ml; M[v * 4 + 2] = mz / ml; M[v * 4 + 3] = n.L > 0 ? n.size : 0;
      // colour bake (AD §3.3 with the arch §5.4 sun term; sky AO goes to surf.b for the shader)
      hf.bakeAt(x, z, _bk);
      const slope = _bk.slope >= 0 ? _bk.slope : 1 - nO[1];
      const sed = smooth(0.15, 0.6, _bk.flow);
      const cv = _bk.curv || 0;
      _col.copy(pal.ground)
        .lerp(pal.sediment, sed * 0.8)
        .lerp(pal.high, Math.min(1, smooth(h20, h80, h) * 0.5 + Math.max(0, cv) * 0.35))
        .lerp(_c2.copy(pal.sediment).multiplyScalar(0.8), Math.max(0, -cv) * 0.3)
        .lerp(pal.rock, smooth(0.16, 0.4, slope))
        .lerp(pal.dust, _bk.bed * 0.6);
      const patch = 0.88 + 0.24 * this._vn(x / 37, z / 37);
      const light = patch * (0.55 + 0.45 * _bk.sun);
      C[v * 3] = clamp(_col.r * light, 0, 1) * 65535; C[v * 3 + 1] = clamp(_col.g * light, 0, 1) * 65535; C[v * 3 + 2] = clamp(_col.b * light, 0, 1) * 65535;
      SF[v * 4] = clamp(_bk.flow * 1.3, 0, 1) * 255; SF[v * 4 + 1] = sed * 255; SF[v * 4 + 2] = _bk.sky * 255; SF[v * 4 + 3] = _bk.bed * 255;
    }
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
    n.mesh = mesh; n.slot = slot;
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
    const far = this.viewDist * 1.45;
    let over = this._built - this.cacheMax;
    const old = [];
    for (const n of this._nodes.values()) {
      if (!n.mesh || n.used === this._frame) continue;
      if (this._dist(n, cx, cz) > far) { this._release(n); continue; }
      if (over > 0) old.push(n);
    }
    over = this._built - this.cacheMax;
    if (over > 0 && old.length) {
      old.sort((a, b) => a.used - b.used);
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
  update(focus, cameraPos, budgetMs = 5) {
    const cam = cameraPos || focus;
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
    if (this._built > this.cacheMax || (this._frame % 15) === 0) this._evict(cam.x, cam.z);
    this._shadows(focus || cam);
    this._count();
  }
  _count() {
    this._stats.nodes = this._drawn.length;
    this._stats.triangles = this._drawn.length * this.trisVisiblePerNode;
    this._stats.built = this._built;
    this._stats.pooled = this._pool.length;
  }
  /** build every wanted node now (no yields), re-selecting until nothing is pending */
  settle(cameraPos) {
    const cam = cameraPos || this._lastCam;
    this._lastCam.copy(cam);
    this.uniforms.uLodCenter.value.copy(cam);
    this._syncUniforms();
    for (let it = 0; it < 8; it++) {
      this._select(cam.x, cam.z);
      const q = this._queue.filter(n => !n._pre);
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
    for (let it = 0; it < 10; it++) {
      this._select(cam.x, cam.z);
      const q = this._queue.filter(n => !n._pre);
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
