// render/materials.js (P1): procedural textures, the shared material library, the wear patch, palettes, faction and
// mech sets, signage, and the shared uBeat clock (addendum A5.4).
//
// Rules (architecture §1.5, §4.1; art direction §4):
// - One small library of cached materials; no per-instance clones. Everything here is marked userData.shared so
//   ctx.clearLevel() never disposes it.
// - Every lit material carries the wear patch (object-space triplanar grime, streaks, edge chips from the kit `edge`
//   attribute, frost on top faces) and then atmosphere.patchMaterial (height fog). They all share one onBeforeCompile
//   source and cache key, so the whole library compiles to a handful of programs (plain, instanced, skinned, physical).
// - Textures are generated at the tier's textureSize, and again on a tier change (in place, same objects).
//   Packed data maps are DataTextures with NoColorSpace (AD §3.6); colour maps (panel, decals, signage) are sRGB.
// - StdOpts.map other than 'panel' is sampled triplanar in object space (kit geometry has no UVs); 'panel' keeps the
//   prototype's UV map + bump.
import * as THREE from 'three';
import * as TG from './texgen.js';

const TEX_NAMES = ['panel', 'grain', 'rock', 'concrete', 'metal', 'grime', 'noise', 'smokeSprite', 'sparkSprite'];
/** triplanar tile size in metres for StdOpts.map (divided by mapRepeat) */
const TEX_TILE = { grain: 9, rock: 17, concrete: 6, metal: 4, grime: 4.8, noise: 60, panel: 1, smokeSprite: 4, sparkSprite: 4 };

// Library presets: [colour, roughness, metalness, envMapIntensity, wear, style] — art direction §4.2.
// style: 0 neutral, 1 wake (bleached tops, rust bleed), 2 dredge (soot), 3 founders (crazing)
const LIB = {
  concrete: ['#6e665c', 0.92, 0.02, 0.3, 0.6, 2], concreteDark: ['#4d463e', 0.94, 0.02, 0.3, 0.7, 2],
  steel: ['#5b5e62', 0.38, 0.9, 1.0, 0.4, 2], steelDark: ['#2f3236', 0.5, 0.85, 0.9, 0.5, 2],
  ironBlack: ['#1c1b1d', 0.62, 0.55, 0.7, 0.6, 2], oxide: ['#7d2a1c', 0.6, 0.3, 0.6, 0.7, 2],
  stripe: ['#d9a521', 0.55, 0.25, 0.6, 0.8, 2], rust: ['#7a4128', 0.88, 0.35, 0.4, 0.3, 1],
  paintWake: ['#4f8a86', 0.62, 0.28, 0.6, 0.8, 1], paintWakeRed: ['#a5452f', 0.64, 0.28, 0.6, 0.8, 1],
  canvas: ['#d9cba8', 0.95, 0.0, 0.25, 0.5, 1], rubber: ['#1a1918', 0.9, 0.0, 0.3, 0.3, 0],
  cable: ['#151517', 0.6, 0.2, 0.5, 0.0, 0], ceramic: ['#e9e6dc', 0.35, 0.05, 0.7, 0.4, 3],
  ceramicAged: ['#b8b0a0', 0.5, 0.05, 0.6, 0.7, 3], gold: ['#c99a3e', 0.32, 1.0, 1.1, 0.4, 3],
  darkGlass: ['#0b1014', 0.06, 0.0, 1.2, 0.0, 0], glass: ['#3c4a52', 0.1, 0.0, 1.0, 0.0, 0],
  mirror: ['#d8dde2', 0.06, 1.0, 1.2, 0.0, 0], ice: ['#9cc4dc', 0.18, 0.0, 1.0, 0.0, 0],
  snow: ['#e8eef5', 0.78, 0.0, 0.4, 0.0, 0], rock: ['#4a3f3a', 0.92, 0.0, 0.25, 0.0, 0],
  debris: ['#2a2524', 0.8, 0.4, 0.5, 0.6, 2], scorch: ['#141212', 0.95, 0.1, 0.2, 0.0, 0],
  dark: ['#141416', 0.8, 0.4, 0.5, 0.2, 0],
};
// emissive lenses: [colour, intensity] — reserved colours (AD §1.6)
const LIGHTS = {
  lightAmber: ['#ffb36b', 3], lightCyan: ['#5fe3ff', 3.5], lightGold: ['#ffcc66', 3], lightSodium: ['#ff9a2e', 4],
  lightWhite: ['#fff1d6', 5], lightRed: ['#ff2a1a', 3], lightGhost: ['#a8ff9e', 6],
};
const BARE = { 0: '#8a8d90', 1: '#5d3424', 2: '#8a8d90', 3: '#9a9384' };
const STYLE_VEC = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** optional StdOpts.wearStyle (AD §4.4): neutral (default: grime, warm rust streaks, steel chips), or a faction's wear */
const WEAR_STYLE = { none: 0, neutral: 0, wake: 1, dredge: 2, founders: 3 };
/** built-in faction palettes for the AD ids when a level doesn't define them (unknown ids still get neutral grey) */
const DEFAULT_FACTIONS = {
  wake: { shell: '#4f8a86', mid: '#7a4128', accent: '#d9cba8', dark: '#1a1918', eye: '#ffb36b', wear: 0.8 },
  dredge: { shell: '#2e2b2b', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', eye: '#ff9a2e', wear: 0.65 },
  ghost: { shell: '#3a3434', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', eye: '#a8ff9e', wear: 0.75 },
  founders: { shell: '#e9e6dc', mid: '#b8b0a0', accent: '#c99a3e', dark: '#1a1e24', eye: '#5fe3ff', wear: 0.5 },
  hands: { shell: '#5a4a40', mid: '#7d2a1c', accent: '#c48a3a', dark: '#1a1918', eye: '#ffb36b', wear: 0.8 },
};
const NEUTRAL_FACTION = { shell: '#7a7a78', mid: '#5a5a58', accent: '#3a3a3a', dark: '#1b1c20', eye: '#ff3b1f', wear: 0.35 };

const shared = (o) => { o.userData.shared = true; return o; };

// ------------------------------------------------------------------------------------------------ wear patch GLSL
const WEAR_VERT_PARS = /* glsl */`
attribute float edge;
varying float vEdge;
varying vec3 vObjP;
varying vec3 vObjN;`;
const WEAR_VERT = /* glsl */`
vEdge = edge; vObjP = position; vObjN = normal;
#ifdef USE_INSTANCING
  vObjP += instanceMatrix[3].xyz * 0.173;
#endif`;
const WEAR_FRAG_PARS = /* glsl */`
uniform sampler2D tGrime;
uniform float uWear;
uniform vec3 uWearStyle;     // x wake, y dredge, z founders
uniform vec3 uBare;
uniform float uBareMetal;
uniform float uFrost;        // level-wide (art.surface.frost), shared
uniform vec3 uFrostColor;
uniform float uFrostK;       // per material (0 for lenses and glass)
uniform vec3 uSSS;           // per material: fake subsurface rim glow (ice, AD §4.2); black for everything else
varying float vEdge;
varying vec3 vObjP;
varying vec3 vObjN;
float wChip, wRough, wFrost;
#ifdef C_DETAIL
uniform sampler2D tDetail;
uniform float uDetailScale;
uniform float uDetailBump;
float cDetH;
vec3 cPerturb(vec3 p, vec3 n, float h, float k) {
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}
#endif`;
const WEAR_FRAG = /* glsl */`
{
  vec3 on = normalize(vObjN + 1e-5);
  vec3 tw = pow(abs(on), vec3(3.0)); tw /= dot(tw, vec3(1.0));
  vec4 gr = texture2D(tGrime, vObjP.zy * 0.21) * tw.x + texture2D(tGrime, vObjP.xz * 0.21) * tw.y
          + texture2D(tGrime, vObjP.xy * 0.21) * tw.z;
  float sB = texture2D(tGrime, vec2((vObjP.x + vObjP.z) * 0.35, vObjP.y * 0.04)).b;
  float wOn = smoothstep(0.0, 0.15, uWear);
  wChip = wOn * vEdge * smoothstep(0.66 - 0.35 * uWear, 0.72 - 0.35 * uWear, gr.a);
  float grime = uWear * gr.r * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 4.0, vObjP.y)));
  float streak = uWear * smoothstep(0.55, 0.85, sB) * (1.0 - abs(on.y));
  float bleach = uWearStyle.x * uWear * smoothstep(0.4, 0.95, on.y);
  vec3 c = diffuseColor.rgb;
  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11)) * 1.25), bleach * 0.45);
  c *= 1.0 - grime * 0.45;
  c = mix(c, c * mix(vec3(0.55, 0.32, 0.2), vec3(0.16), uWearStyle.y), streak * 0.6);
  c *= 1.0 - uWearStyle.z * uWear * gr.g * 0.3;
  c = mix(c, uBare, wChip);
  wRough = grime * 0.25 - wChip * 0.25;
#ifdef C_DETAIL
  vec4 dt = texture2D(tDetail, vObjP.zy * uDetailScale) * tw.x + texture2D(tDetail, vObjP.xz * uDetailScale) * tw.y
          + texture2D(tDetail, vObjP.xy * uDetailScale) * tw.z;
  c *= (0.72 + 0.56 * dt.r) * mix(1.0, dt.b, 0.45);
  cDetH = dt.g;
  wRough += (dt.a - 0.8) * 0.35;
#endif
  wFrost = uFrost * uFrostK * smoothstep(0.3, 0.9, on.y + gr.r * 0.3);
  c = mix(c, uFrostColor, wFrost);
  wRough += wFrost * 0.25;
  diffuseColor.rgb = c;
}`;

// Low tier (direct render: the renderer tone-maps in the material, so TONE_MAPPING is defined only there): there is
// no bloom, so an HDR lens would tone-map to plain white and lose its meaning. Compress the emissive radiance
// hue-preservingly so lenses clip toward their saturated reserved colour instead (AD §7.2 rule 1): ghost lights stay
// pale green, sodium orange, cyan cyan. High and Medium render linear HDR into the composer and keep full values.
const EMISSIVE_LOW = /* glsl */`
#ifdef TONE_MAPPING
{ float em_ = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
  if (em_ > 1.0) totalEmissiveRadiance *= (1.0 + 0.1 * log2(em_)) / em_; }
#endif`;

// Ice's fake subsurface (AD §4.2): thin, grazing edges glow blue-white, so ice reads as translucent, not as white paint
const SSS_FRAG = /* glsl */`
totalEmissiveRadiance += uSSS * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.0);`;

const SHARED_U = {
  tGrime: { value: null },
  uFrost: { value: 0 },
  uFrostColor: { value: new THREE.Color('#e3ecf4') },
};

/** The shared onBeforeCompile (one source for every library material: same program key). `this` is the material. */
function wearPatch(shader) {
  const cu = this.userData.cu;
  Object.assign(shader.uniforms, SHARED_U, cu);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + WEAR_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WEAR_VERT);
  let fs = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + WEAR_FRAG_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + WEAR_FRAG)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + wRough, 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uBareMetal, wChip) * (1.0 - 0.8 * wFrost);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SSS_FRAG + EMISSIVE_LOW);
  if (cu.tDetail) {
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' +
      'normal = cPerturb(-vViewPosition, normal, cDetH, uDetailBump * (1.0 - smoothstep(30.0, 90.0, length(vViewPosition))));');
  }
  shader.fragmentShader = fs;
}
function wearKey() { return 'cwear1'; }

export function install(ctx) {
  const textures = {};
  // uBeat (A5.4) is the shared beat clock: always exactly ctx.clock.time (sim seconds since the level started), read
  // live by every shader that binds it and by the HUD's vitals trace. Writing it sets an offset (debug/tests only).
  let beatOffset = 0;
  const uniforms = { uBeat: { get value() { return ctx.clock.time + beatOffset; }, set value(v) { beatOffset = (+v || 0) - ctx.clock.time; } } };
  const lib = new Map(), stdCache = new Map(), glowCache = new Map(), emCache = new Map(), mechCache = new Map(),
        factionCache = new Map(), signCache = new Map();
  const all = new Set();            // every lit material created here (env scale, dispose)
  const warned = new Set();
  let factions = {};
  let envScale = 1;
  let style = 'grit';
  let texSize = 0;
  const stats = { genMs: 0 };

  // ---------------------------------------------------------------- textures
  function makeTex(name, img, colorSpace) {
    const t = new THREE.DataTexture(img.data, img.w, img.h, THREE.RGBAFormat);
    t.name = name;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = colorSpace;
    t.anisotropy = ctx.tier.anisotropy || 1;
    t.needsUpdate = true;
    return shared(t);
  }
  function setTex(name, img, colorSpace) {
    const t = textures[name];
    if (!t) { textures[name] = makeTex(name, img, colorSpace); return; }
    t.dispose();                                  // free the old GPU storage (size may change)
    t.image = { data: img.data, width: img.w, height: img.h };
    t.anisotropy = ctx.tier.anisotropy || 1;
    t.needsUpdate = true;
  }
  function generate(S) {
    const t0 = performance.now();
    texSize = S;
    const D = THREE.NoColorSpace, C = THREE.SRGBColorSpace;
    setTex('panel', TG.genPanel(Math.min(S, 256)), C);
    // grain and rock serve StdOpts.map and the rock/concrete detail here (the terrain bakes its own detail maps), so
    // 512² is plenty and keeps install inside the AD §4.6 budget on High
    setTex('grain', TG.genGrain(Math.min(S, 512), style), D);
    setTex('rock', TG.genRock(Math.min(S, 512), style), D);
    setTex('concrete', TG.genConcrete(Math.min(S, 512)), D);
    setTex('metal', TG.genMetal(Math.min(S, 512)), D);
    setTex('grime', TG.genGrime(Math.min(S, 512)), D);
    setTex('noise', TG.genNoise(Math.min(S, 512)), D);
    const cw = Math.max(64, Math.min(128, S / 8)) | 0;
    setTex('smokeSprite', TG.genSmokeAtlas(cw), D);
    setTex('sparkSprite', TG.genSparkAtlas(cw), D);
    setTex('_decals', TG.genDecalAtlas(Math.max(96, Math.min(192, S / 4)) | 0), C);
    for (const n of ['smokeSprite', 'sparkSprite']) textures[n].wrapS = textures[n].wrapT = THREE.ClampToEdgeWrapping;
    textures._decals.wrapS = textures._decals.wrapT = THREE.ClampToEdgeWrapping;
    SHARED_U.tGrime.value = textures.grime;
    stats.genMs = performance.now() - t0;
    ctx.events.emit('materials:textures', { size: S });
  }
  generate(ctx.tier.textureSize || 512);

  // ---------------------------------------------------------------- material construction
  const patchFog = (m) => (ctx.atmosphere?.patchMaterial ? ctx.atmosphere.patchMaterial(m) : m);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  /** A lit kit material with the wear patch, cached by the caller. */
  function kitMaterial(o) {
    const physical = !!o.physical;
    const m = physical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
    m.color.set(o.color ?? 0x808080);
    m.roughness = o.roughness ?? 0.7;
    m.metalness = o.metalness ?? 0.3;
    m.envMapIntensity = (o.env ?? 0.6) * envScale;
    m.userData.envBase = o.env ?? 0.6;
    if (o.emissive != null) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
    if (o.flatShading) m.flatShading = true;
    if (o.vertexColors) m.vertexColors = true;
    if (o.side === 'double') m.side = THREE.DoubleSide;
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; m.depthWrite = o.opacity == null || o.opacity > 0.6; }
    else if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; }
    if (physical) { m.clearcoat = o.clearcoat ?? 0; m.clearcoatRoughness = o.clearcoatRoughness ?? 0.25; }
    const st = STYLE_VEC[o.style ?? 0] || STYLE_VEC[0];
    const cu = {
      uWear: { value: o.wear ?? 0 },
      uWearStyle: { value: new THREE.Vector3(st[0], st[1], st[2]) },
      uBare: { value: new THREE.Color(o.bare ?? BARE[o.style ?? 0]) },
      uBareMetal: { value: o.bareMetal ?? (o.style === 3 ? 0.05 : 0.85) },
      uFrostK: { value: o.frostK ?? 1 },
      uSSS: { value: new THREE.Color(o.sss ?? 0x000000) },
    };
    if (o.detail && textures[o.detail]) {
      cu.tDetail = { value: textures[o.detail] };
      cu.uDetailScale = { value: 1 / ((TEX_TILE[o.detail] || 6) / (o.mapRepeat || 1)) };
      cu.uDetailBump = { value: o.bump ?? 0 };
      m.defines = { ...(m.defines || {}), C_DETAIL: '' };
    }
    m.userData.cu = cu;
    m.defaultAttributeValues = { edge: [0] };   // geometry without the kit `edge` attribute reads 0 (A5.4)
    m.onBeforeCompile = wearPatch;
    m.customProgramCacheKey = wearKey;
    if (o.name) m.name = o.name;
    shared(patchFog(m));
    all.add(m);
    return m;
  }

  function getLib(name) {
    let m = lib.get(name);
    if (m) return m;
    const L = LIB[name], E = LIGHTS[name];
    if (L) {
      const [color, roughness, metalness, env, wear, sty] = L;
      if (name === 'ceramic') {
        m = kitMaterial({ name, color, roughness, metalness, env, wear, style: sty, physical: true,
                          clearcoat: ctx.tier.name === 'high' ? 0.6 : 0, clearcoatRoughness: 0.25 });
      } else {
        const frostK = ['darkGlass', 'glass', 'mirror', 'ice', 'snow', 'scorch'].includes(name) ? 0 : 1;
        const o = { name, color, roughness, metalness, env, wear, style: sty, frostK };
        if (name === 'concrete' || name === 'concreteDark') { o.detail = 'concrete'; o.bump = 0.6; }
        if (name === 'rock') { o.detail = 'rock'; o.bump = 0.8; o.flatShading = true; }
        if (name === 'steel' || name === 'steelDark' || name === 'mirror') { o.detail = 'metal'; o.bump = 0.05; }
        if (name === 'ice') { o.emissive = '#0a3a5a'; o.emissiveIntensity = 0.12; o.sss = new THREE.Color('#9cc4dc').multiplyScalar(0.3); }
        m = kitMaterial(o);
      }
    } else if (E) {
      m = kitMaterial({ name, color: 0x000000, roughness: 0.4, metalness: 0, env: 0.2, emissive: E[0], emissiveIntensity: E[1], frostK: 0 });
    } else {
      if (!warned.has(name)) { warned.add(name); console.warn('[materials] unknown library material', name); }
      m = kitMaterial({ name: 'unknown:' + name, color: '#808080', roughness: 0.7, metalness: 0.2, env: 0.5 });
    }
    lib.set(name, m);
    return m;
  }

  function std(o = {}) {
    const key = JSON.stringify(o, (k, v) => (v && v.isColor ? '#' + v.getHexString() : v));
    let m = stdCache.get(key);
    if (m) return m;
    const panel = o.map === 'panel';
    m = kitMaterial({
      color: o.color ?? 0x808080, roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0.3, env: o.envMapIntensity ?? 0.6,
      emissive: o.emissive, emissiveIntensity: o.emissiveIntensity, flatShading: o.flatShading, vertexColors: o.vertexColors,
      wear: o.wear ?? 0, style: WEAR_STYLE[o.wearStyle] ?? 0, bare: o.bare, side: o.side, transparent: o.transparent, opacity: o.opacity,
      detail: o.map && !panel ? o.map : null, mapRepeat: o.mapRepeat, bump: o.bump ? o.bump * 0.6 : 0,
    });
    if (panel) {
      m.map = textures.panel;
      if (o.bump) { m.bumpMap = textures.panel; m.bumpScale = o.bump; }
      if (o.mapRepeat) { /* the panel texture maps 0..1 per face; repeat applies to every user of the shared texture */ }
    } else if (o.map && !textures[o.map] && !warned.has('map:' + o.map)) {
      warned.add('map:' + o.map); console.warn('[materials] unknown texture', o.map);
    }
    stdCache.set(key, m);
    return m;
  }

  function glow(color, opacity = 1) {
    const key = new THREE.Color(color).getHexString() + '|' + opacity;
    let m = glowCache.get(key);
    if (!m) {
      m = shared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.userData.noAO = true;
      glowCache.set(key, m);
    }
    return m;
  }
  function emissive(color, intensity = 3) {
    const key = new THREE.Color(color).getHexString() + '|' + intensity;
    let m = emCache.get(key);
    if (!m) {
      m = kitMaterial({ color: 0x000000, roughness: 0.4, metalness: 0, env: 0.2, emissive: color, emissiveIntensity: intensity, frostK: 0 });
      emCache.set(key, m);
    }
    return m;
  }
  function wearStyleFor(base) {
    const l = lum(new THREE.Color(base));
    return l > 0.4 ? 3 : l < 0.03 ? 2 : 1;
  }

  // ---------------------------------------------------------------- api
  const api = {
    textures,
    uniforms,
    get: getLib,
    standard: std,
    glow,
    emissive,
    /** buildAC's materials: base/mid/acc/dark (worn satin paint), visor emissive 2.6, flame and blade additive glows */
    mechSet(s = {}) {
      const key = JSON.stringify([s.base, s.mid, s.accent, s.visor, s.flame, s.blade, s.dark, s.wear].map(v => (v && v.isColor ? v.getHexString() : v)));
      let set = mechCache.get(key);
      if (set) return set;
      const wear = s.wear ?? 0.35, sty = wearStyleFor(s.base ?? '#888888');
      const paint = (c, r, me, w) => kitMaterial({ color: c, roughness: r, metalness: me, env: 0.65, wear: w, style: sty });
      set = {
        base: paint(s.base ?? '#888888', 0.42, 0.45, wear), mid: paint(s.mid ?? s.base ?? '#666666', 0.5, 0.42, wear),
        acc: paint(s.accent ?? '#cc8833', 0.45, 0.32, wear * 0.8), dark: paint(s.dark ?? 0x1b1c20, 0.62, 0.5, wear * 0.5),
        visor: kitMaterial({ color: 0x050505, roughness: 0.3, metalness: 0, env: 0.4, emissive: s.visor ?? '#77eeff', emissiveIntensity: 2.6, frostK: 0 }),
        flame: glow(s.flame ?? 0xff9a3c, 0.85),
        blade: glow(s.blade ?? 0x8fe9ff, 0.9),
      };
      mechCache.set(key, set);
      return set;
    },
    setFactions(f) { factions = { ...(f || {}) }; factionCache.clear(); },
    factionSet(id) {
      let set = factionCache.get(id);
      if (set) return set;
      const p = factions[id] || DEFAULT_FACTIONS[id] || NEUTRAL_FACTION;
      const wear = p.wear ?? 0.4, sty = wearStyleFor(p.shell ?? '#7a7a78');
      const paint = (c, r, me, w) => kitMaterial({ color: c, roughness: r, metalness: me, env: 0.6, wear: w, style: sty });
      set = {
        shell: paint(p.shell ?? '#7a7a78', 0.55, 0.35, wear), mid: paint(p.mid ?? p.shell ?? '#5a5a58', 0.55, 0.4, wear),
        accent: paint(p.accent ?? '#3a3a3a', 0.5, 0.3, wear * 0.8), dark: paint(p.dark ?? '#141416', 0.75, 0.4, wear * 0.5),
        eye: emissive(p.eye ?? '#ff3b1f', 3), glow: glow(p.eye ?? '#ff3b1f', 0.9),
      };
      factionCache.set(id, set);
      return set;
    },
    /** Retint the library from a (partial) level palette. Reserved-colour materials (stripe, lights) never change. */
    applyPalette(p = {}) {
      if (!p) return;
      const c = new THREE.Color();
      if (p.concrete) { getLib('concrete').color.set(p.concrete); getLib('concreteDark').color.set(c.set(p.concrete).multiplyScalar(0.62)); }
      if (p.rust) getLib('rust').color.set(p.rust);
      if (p.rock) getLib('rock').color.set(p.rock);
      if (p.rock || p.ground) {
        const d = getLib('debris').color;
        if (p.rock) d.set(p.rock); if (p.ground) d.lerp(c.set(p.ground), 0.3);
        d.multiplyScalar(0.8);
      }
      if (p.snow) getLib('snow').color.set(p.snow);
    },
    sign(text, o = {}) {
      const key = JSON.stringify([String(text), o]);
      const hit = signCache.get(key);
      if (hit) return hit;
      const w = o.w || 256, h = o.h || 128;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = o.bg || '#2a2a2a'; g.fillRect(0, 0, w, h);
      const size = Math.round(h * 0.5);
      g.font = o.font || `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.textBaseline = 'middle';
      const str = String(text);
      const widths = [...str].map(ch => g.measureText(ch).width * 1.06);
      const total = widths.reduce((a, b) => a + b, 0);
      const scale = Math.min(1, (w * 0.9) / Math.max(1, total));
      g.save();
      g.translate(w / 2 - (total * scale) / 2, h / 2);
      g.scale(scale, 1);
      let x = 0;
      const STENCIL = new Set('ABDOPQR04689'.split(''));
      [...str].forEach((ch, i) => {
        g.fillStyle = o.color || '#e9e3d3';
        g.fillText(ch, x, 0);
        if (o.stencil && STENCIL.has(ch.toUpperCase())) {
          g.fillStyle = o.bg || '#2a2a2a';
          g.fillRect(x + widths[i] * 0.45, -size * 0.6, widths[i] * 0.07, size * 1.2);
        }
        x += widths[i];
      });
      g.restore();
      const wd = Math.max(0, Math.min(1, o.weathered ?? 0));
      if (wd > 0) {
        // erode with a noise mask and dull the paint: chips, fade and grime
        const img = g.getImageData(0, 0, w, h), d = img.data;
        let s = 1234567;
        const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
        const blot = new Float32Array(64);
        for (let i = 0; i < 64; i++) blot[i] = rnd();
        for (let y = 0; y < h; y++) for (let x2 = 0; x2 < w; x2++) {
          const i = (y * w + x2) * 4;
          const b = blot[((y >> 4) % 8) * 8 + ((x2 >> 4) % 8)];
          const n = rnd() * 0.6 + b * 0.4;
          const k = n < wd * 0.45 ? 0.55 : 1 - wd * 0.25 * n;
          d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
        }
        g.putImageData(img, 0, 0);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ctx.tier.anisotropy || 1;
      shared(t);
      signCache.set(key, t);
      return t;
    },
    /** extra: env-map intensity scale from art.light.env (applied to every lit library material) */
    setEnvScale(k) {
      envScale = Number.isFinite(+k) ? +k : 1;
      for (const m of all) if (m.userData.envBase != null) m.envMapIntensity = m.userData.envBase * envScale;
    },
    /** extra: level-wide frost amount (art.surface.frost) on top faces of every kit material */
    setFrost(amount, color) {
      SHARED_U.uFrost.value = Math.max(0, Math.min(1, +amount || 0));
      if (color) SHARED_U.uFrostColor.value.set(color);
    },
    /** extra: terrain detail style (art.surface.style): regenerates grain and rock ('grit' | 'snow' | 'ash'; others → grit) */
    setSurfaceStyle(s) {
      const want = s === 'snow' || s === 'ash' ? s : 'grit';
      if (want === style) return false;
      style = want;
      setTex('grain', TG.genGrain(Math.min(texSize, 512), style), THREE.NoColorSpace);
      setTex('rock', TG.genRock(Math.min(texSize, 512), style), THREE.NoColorSpace);
      ctx.events.emit('materials:textures', { size: texSize, style });
      return true;
    },
    /** extra: diagnostics for tests */
    info() { return { textureSize: texSize, genMs: stats.genMs, materials: all.size, library: lib.size, style }; },
    dispose() {
      for (const m of all) m.dispose();
      for (const m of glowCache.values()) m.dispose();
      for (const t of signCache.values()) t.dispose();
      all.clear(); lib.clear(); stdCache.clear(); glowCache.clear(); emCache.clear(); mechCache.clear(); factionCache.clear(); signCache.clear();
    },
  };

  ctx.events.on('tier:changed', ({ tier }) => {
    if ((tier.textureSize || 512) !== texSize) generate(tier.textureSize || 512);
    else for (const n of Object.keys(textures)) { textures[n].anisotropy = tier.anisotropy || 1; textures[n].needsUpdate = true; }
    const ceramic = lib.get('ceramic');
    if (ceramic) ceramic.clearcoat = tier.name === 'high' ? 0.6 : 0;
  });
  ctx.events.on('level:cleared', () => { beatOffset = 0; });
  ctx.materials = api;
  return api;
}
