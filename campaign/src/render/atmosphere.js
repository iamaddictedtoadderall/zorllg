// render/atmosphere.js (P1): the sky dome, sun / hemisphere / rim lights, the camera-following sun shadow with texel
// snapping, the height-fog material patch (architecture §5.8, Appendix B.3), the PMREM environment, skyline objects,
// art blends (shortest-arc azimuths, addendum A5.4), lightning, and the aurora and dawn rim (A5.4, art direction §5.2).
//
// The sky's horizon colour IS the fog colour (with the same sun inscatter), and every patched material reaches pure fog
// colour before the far plane, so the terrain's far edge never shows. Ridge silhouette bands continue the land above
// the horizon. All art values are resolved into one flat struct (R) that blends without allocation.
import * as THREE from 'three';
import { deepMerge, DEG, clamp, smooth } from '../core/util.js';
import * as KIT from '../art/kit.js';
import { FOG_PARS, NOISE_PARS, SKY_PARS } from './glsl.js';

/** Default level art (every LevelArt field, plus the addendum's). Prototype "cinder basin" look in r170 light units. */
export const DEFAULT_ART = {
  palette: { ground: '#5b4d45', rock: '#2a2321', sediment: '#6b3b28', high: '#786b62', dust: '#8a7a6a',
             wet: '#3a2e2a', concrete: '#4d4642', rust: '#5d3424', accent: '#e0913c', snow: '#e8eef5',
             strata: ['#2a2321', '#3a302c', '#4a3c34', '#2f2622'] },
  toneMapping: 'aces',
  sky: {
    top: '#17141d', mid: '#4f3330', horizon: '#8a5c47',
    sun: { azimuth: 40, elevation: 21, color: '#ffb27c', size: 1, glow: 1 },
    clouds: { cover: 0.5, color: '#4f3330', speed: 1 },
    stars: 0.35,
    moon: { azimuth: 214, elevation: 34, size: 6, color: '#8e7f78' },
    ridges: { height: 2.5, color: null, layers: 2 },
    aurora: { strength: 0, colorA: '#2fe0c8', colorB: '#7b4dff', azimuth: 350, height: 55, speed: 1 },
    dawnRim: { strength: 0, color: '#ff5a2a', color2: '#7a2a40', azimuth: null, width: 35, height: 3 },
  },
  fog: { color: null, density: 0.0015, heightFalloff: 0.012, heightBase: 0, inscatter: 0.6, sunColor: '#ffb27c' },
  light: { sun: 6.5, sunColor: '#ffb27c', hemiSky: '#c4ad9e', hemiGround: '#2b1c16', hemi: 1.7, rim: 2.8, rimColor: '#8fb0c8',
           exposure: 1.1, env: 1, shadowMinElevation: 0 },
  grade: {},
  bloom: { strength: 0.85, radius: 0.6, threshold: 0.85 },
  weather: { type: 'ash', intensity: 0.6, wind: [2.2, 0.6], lightning: 0, fogBoost: 1 },
  skyline: [],
  ambience: [],
  scatter: [],
  surface: {},
};

const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
const GRADE_DEFAULT = { exposure: 1, contrast: 1, saturation: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
                        shadowsTint: [1, 1, 1], highlightsTint: [1, 1, 1], desaturate: 0, vignette: 0.28, grain: 0.028, chroma: 0.012 };
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color();

/** unit direction toward azimuth θ (deg clockwise from north = −Z) at elevation e (deg) */
function dirAzEl(az, el, out) {
  const a = az * DEG, e = el * DEG;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}
function lerpAz(a, b, t) { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * t; }

// ------------------------------------------------------------------------------------------------ sky shader
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = /* glsl */`
${FOG_PARS}
${NOISE_PARS}
${SKY_PARS}
uniform float uSunSize;
uniform float uStars;
uniform vec3 uMoonDir, uMoonCol; uniform float uMoonSize;
uniform float uAur, uAurH, uAurSpeed, uAurBands; uniform vec3 uAurA, uAurB; uniform vec2 uAurF;
uniform float uFlash;
varying vec3 vDir;
// One aurora curtain: a vertical sheet from height 1 to 1 + depth (observer at 0) standing on a footprint that meanders
// around the line at forward distance D across the aurora's heading. dh = the view direction's horizontal components in
// the aurora frame (x right, y forward), h = its height. The footprint is written in polar form, r(θ) = D(1 + m(θ))/cos θ,
// so every view azimuth θ hits it exactly once (no iteration, no seams), and a ray pattern that depends on θ alone is a
// set of vertical lines on the sheet, which is what aurora rays are.
// span: the curtain's own arc of azimuth (radians either side of the heading). Each curtain ends somewhere else, and
// each end fades over ≈ 30° with a long squared tail: against a near-black sky the eye sees anything above a few
// percent, so a plain linear fade (or ends that line up) reads as a hard vertical cut.
vec3 cAurCurtain(vec2 dh, float h, float D, float ph, float t, float depth, vec2 span) {
  float lh = length(dh);
  if (dh.y <= 0.0 || lh < 1e-4) return vec3(0.0);
  float th = atan(dh.x, dh.y);
  float ends = smoothstep(span.x, span.x + 0.52, th) * smoothstep(span.y, span.y - 0.52, th);
  ends *= ends;
  if (ends <= 0.0) return vec3(0.0);
  float p1 = th * 3.1 + ph + t * 0.021, p2 = th * 8.7 + ph * 2.3 - t * 0.034;
  float m = 0.2 * sin(p1) + 0.07 * sin(p2) + 0.07 * (cNoise(vec2(th * 6.0 + ph * 5.0, t * 0.012)) - 0.5);
  float dm = 0.62 * cos(p1) + 0.61 * cos(p2);
  float r = D * (1.0 + m) / max(cos(th), 0.15);
  float z = (r * h / lh - 1.0) / depth;          // 0 at the lower edge, 1 at the top of the sheet
  if (z < -0.06 || z > 1.6) return vec3(0.0);
  float u = tan(clamp(th, -1.4, 1.4));            // position along the curtain, in units of D
  float edge = smoothstep(-0.05, 0.0, z);
  float zp = max(z, 0.0);
  float prof = edge * (exp(-zp * 3.0) + 0.3 * exp(-pow((z - 0.45) / 0.3, 2.0)) + 0.7 * exp(-zp * 26.0));
  // rays: vertical on the sheet, drifting slowly; the finest set fades where the curtain recedes (no shimmer)
  float r1 = cNoise(vec2(u * 30.0, t * 0.22 + ph));
  float r2 = cNoise(vec2(u * 85.0 + 3.7, t * 0.5 + ph));
  float rays = 0.12 + 0.88 * r1 * r1 * r1 + 0.4 * r2 * r2 * r2 * smoothstep(2.4, 1.0, abs(u));
  // patches that brighten and fade along the curtain, and its ends
  float seg = 0.1 + 0.9 * smoothstep(0.3, 0.8, cNoise(vec2(u * 0.9 + ph * 3.0, t * 0.025)));
  // emission integrates through the sheet: brighter where it is seen edge-on (the folds); the boost never outlives
  // the curtain's end fade
  float g = dm / (1.0 + m) + u;
  float graze = 1.0 + (pow(min(sqrt(1.0 + g * g), 5.0), 0.6) - 1.0) * ends;
  vec3 col = mix(uAurA, uAurB * 0.85, smoothstep(0.3, 1.05, z)) + uAurA * 0.45 * exp(-zp * 22.0);
  return col * prof * rays * seg * ends * graze * 0.42;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 fogC = cFogColor(d);
  float hd = cSkyDeg(d);
  float ridgeAA = max(fwidth(hd), 0.003) * 1.2;
  float starPx = length(fwidth(d * 230.0)) * 0.6;
  // 1. gradient: fog colour at (and below) the horizon → horizon → mid → top
  vec3 c = cSkyGradient(d, fogC);
  float s = dot(d, uFogSunDir), sp = max(s, 0.0);
  // 2. dawn rim (hides the stars behind it)
  float rimHide;
  c += cSkyRim(d, hd, rimHide);
  // 3. clouds
  float cl;
  c = cSkyClouds(d, fogC, c, cl);
  // 4. aurora: vertical curtains hanging above a meandering footprint (AD §5.2 item 6). Each curtain is a sheet whose
  //    ray hit is solved analytically (no slices, so no banding): a sharp, bright lower edge, emission decaying upward
  //    from teal into violet, fine vertical rays that converge toward the zenith in perspective, brighter where the
  //    sheet is seen edge-on (folds), and segments that wax and wane along its length. High/Medium 3 curtains, Low 1.
  if (uAur > 0.001 && h > 0.0) {
    vec2 rgt = vec2(-uAurF.y, uAurF.x);
    vec2 dh = vec2(dot(d.xz, rgt), dot(d.xz, uAurF));
    float t = uSkyTime * uAurSpeed;
    float D = 1.0 / tan(radians(clamp(uAurH - 12.0, 6.0, 80.0)));   // the main curtain's base sits 12° below the band centre
    vec3 acc = cAurCurtain(dh, h, D, 0.0, t, 1.3, vec2(-1.28, 1.2));
    if (uAurBands > 1.5) acc += cAurCurtain(dh, h, D * 1.75, 2.1, t, 1.1, vec2(-0.95, 1.32)) * 0.7;
    if (uAurBands > 2.5) acc += cAurCurtain(dh, h, D * 2.7, 4.7, t, 0.9, vec2(-1.33, 0.85)) * 0.5;
    c += acc * uAur * smoothstep(0.0, 0.1, h) * (1.0 - cl * 0.7);
  }
  // 5. stars (hashed cells, twinkling) and a faint galactic band; hidden by bright sky, cloud and the dawn rim
  if (uStars > 0.001 && h > -0.02) {
    float skyL = dot(c, vec3(0.3, 0.59, 0.11));
    float vis = uStars * smoothstep(0.0, 0.16, h) * (1.0 - cl) * (1.0 - rimHide) * (1.0 - smoothstep(0.03, 0.3, skyL));
    if (vis > 0.001) {
      vec3 p = d * 230.0;
      vec3 cell = floor(p), f = fract(p) - 0.5;
      float hs = cHash13(cell);
      if (hs > 0.991) {
        vec3 off = (vec3(cHash13(cell + 1.3), cHash13(cell + 2.7), cHash13(cell + 4.1)) - 0.5) * 0.55;
        float px = starPx;
        float br = pow((hs - 0.991) / 0.009, 2.0);
        float st = smoothstep(max(px, 0.05), 0.0, length(f - off)) * (0.25 + 1.75 * br) * (0.7 + 0.3 * sin(uSkyTime * (1.3 + hs * 31.0) + hs * 600.0));
        vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.88, 0.72), cHash13(cell + 9.0));
        c += tint * st * vis * 1.8;
      }
      float mw = dot(d, normalize(vec3(0.35, 0.62, -0.7)));
      c += vec3(0.5, 0.56, 0.74) * exp(-mw * mw * 26.0) * (0.3 + 0.7 * cFbm(d.xz / (abs(d.y) + 0.3) * 6.0, 3.0)) * 0.03 * vis;
    }
  }
  // 6. moon: a lit sphere with a mottled face
  if (uMoonSize > 0.01) {
    float mr = radians(uMoonSize) * 0.5;
    float md = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
    if (md < mr * 4.0) {
      vec3 mu = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
      vec3 mv = cross(mu, uMoonDir);
      vec2 q = vec2(dot(d, mu), dot(d, mv)) / sin(mr);
      float r2 = dot(q, q);
      float disk = 1.0 - smoothstep(0.9, 1.0, sqrt(r2));
      vec3 n = normalize(q.x * mu + q.y * mv - sqrt(max(0.0, 1.0 - r2)) * uMoonDir);
      float lit = max(dot(n, uFogSunDir), 0.0);
      float mare = 0.75 + 0.3 * cNoise(q * 3.0 + 7.0) - 0.2 * smoothstep(0.55, 0.75, cNoise(q * 6.0 + 2.0));
      vec3 mc = uMoonCol * (0.06 + 1.25 * lit) * mare;
      c = mix(c, mc, disk * (1.0 - cl * 0.85));
      c += uMoonCol * 0.06 * exp(-md / mr * 1.2) * (1.0 - disk) * (1.0 - cl * 0.6);
    }
  }
  // 7. sun halo and disc (above the horizon only, so the horizon matches the fogged terrain)
  c += cSkyHalo(d, cl);
  float disc = smoothstep(1.0 - 0.0007 * uSunSize, 1.0 - 0.0003 * uSunSize, s) * step(0.01, uSunSize);
  c += uSkySunCol * disc * 6.0 * min(uSunSize, 1.0) * (1.0 - cl * 0.85) * smoothstep(-0.004, 0.004, h);   // a shrinking disc dims too
  // 8. ridge silhouettes: the land continues above the horizon in fog-coloured layers
  c = cSkyRidges(d, hd, c, fogC, cl, ridgeAA);
  c += vec3(0.62, 0.68, 0.85) * uFlash * (0.25 + 0.75 * cl);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef TONE_MAPPING
    // straight to an 8-bit screen (Low: no FinalPass grain): dither the long, dark gradients so they never band
    gl_FragColor.rgb += (cHash12(gl_FragCoord.xy) - 0.5) / 255.0;
  #endif
}`;

// ------------------------------------------------------------------------------------------------ skyline shader
const SKYLINE_VS = /* glsl */`
varying vec3 vN; varying vec3 vW; varying float vY;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SKYLINE_FS = /* glsl */`
${FOG_PARS}
uniform vec3 uCol, uLightDir, uSunC; uniform float uHaze, uH, uAlpha;
varying vec3 vN; varying vec3 vW; varying float vY;
void main() {
  float ndl = max(dot(normalize(vN), uLightDir), 0.0);
  vec3 c = uCol * (0.6 + 0.4 * ndl) + uSunC * pow(ndl, 3.0) * 0.06;
  float hz = mix(min(1.0, uHaze + 0.35), uHaze, smoothstep(0.0, uH * 0.35, vY));
  c = mix(c, cFogColor(normalize(vW - cameraPosition)), hz);
  gl_FragColor = vec4(c, uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PLUME_FS = /* glsl */`
${FOG_PARS}
${NOISE_PARS}
uniform vec3 uCol, uLightDir; uniform float uHaze, uH, uTime, uAlpha;
varying vec3 vN; varying vec3 vW; varying float vY;
void main() {
  float y = vY / uH;
  vec2 p = vec2(atan(vN.x, vN.z) * 1.5, y * 6.0 - uTime * 0.02);
  float n = cNoise(p * 2.0) * 0.6 + cNoise(p * 5.0 + 3.1) * 0.4;
  float a = smoothstep(0.25, 0.65, n) * smoothstep(1.0, 0.55, y) * smoothstep(0.0, 0.08, y) * uAlpha;
  if (a < 0.02) discard;
  float ndl = 0.6 + 0.4 * max(dot(normalize(vN), uLightDir), 0.0);
  vec3 c = mix(uCol * ndl, cFogColor(normalize(vW - cameraPosition)), uHaze * (0.8 + 0.2 * y));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function install(ctx) {
  const scene = ctx.scene, renderer = ctx.renderer;
  const hemi = new THREE.HemisphereLight(0xc4ad9e, 0x2b1c16, 1.7);
  const sun = new THREE.DirectionalLight(0xffb27c, 6.5);
  sun.castShadow = true;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.3;
  const rim = new THREE.DirectionalLight(0x8fb0c8, 2.8);
  hemi.name = 'hemi'; sun.name = 'sun'; rim.name = 'rim';
  scene.add(hemi, sun, sun.target, rim, rim.target);

  const sunDir = new THREE.Vector3(0.6, 0.36, -0.72).normalize();   // toward the sun (true elevation)
  const lightDir = new THREE.Vector3().copy(sunDir);                 // the key light (shadowMinElevation clamp)
  const fogUniforms = {
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0015 }, uFogHeightFalloff: { value: 0.012 },
    uFogHeightBase: { value: 0 }, uFogSunColor: { value: new THREE.Color() }, uFogSunDir: { value: sunDir },
    uFogInscatter: { value: 0.6 }, uFogFarStart: { value: ctx.tier.fogFarStart ?? 1820 }, uFogFarEnd: { value: ctx.tier.fogFarEnd ?? 2550 },
  };

  // ---------------------------------------------------------------- resolved art state (blends without allocation)
  const mkR = () => ({
    sunAz: 0, sunEl: 0, sunSize: 1, sunGlow: 1, sunColor: new THREE.Color(),
    top: new THREE.Color(), mid: new THREE.Color(), hor: new THREE.Color(),
    cover: 0, cloudColor: new THREE.Color(), cloudSpeed: 1, stars: 0,
    moonAz: 0, moonEl: 0, moonSize: 0, moonColor: new THREE.Color(),
    ridgeH: 0, ridgeColor: new THREE.Color(), ridgeLayers: 2,
    aur: 0, aurA: new THREE.Color(), aurB: new THREE.Color(), aurAz: 0, aurH: 55, aurSpeed: 1,
    rim: 0, rimColor: new THREE.Color(), rimColor2: new THREE.Color(), rimAz: 0, rimW: 35, rimH: 3,
    fogColor: new THREE.Color(), fogDensity: 0, fogFalloff: 0, fogBase: 0, fogInscatter: 0, fogSunColor: new THREE.Color(),
    lSun: 0, lSunColor: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemi: 0,
    lRim: 0, lRimColor: new THREE.Color(), exposure: 1, env: 1, minEl: 0, ground: new THREE.Color(),
  });
  const R = mkR(), RA = mkR(), RB = mkR();
  const COLOR_KEYS = Object.keys(R).filter(k => R[k] && R[k].isColor);
  const NUM_KEYS = Object.keys(R).filter(k => typeof R[k] === 'number');
  const AZ_KEYS = new Set(['sunAz', 'moonAz', 'aurAz', 'rimAz']);

  function resolve(a, r) {
    const sky = a.sky || {}, sn = sky.sun || {}, cl = sky.clouds || {}, mo = sky.moon || {}, ri = sky.ridges || {};
    const au = sky.aurora || {}, dr = sky.dawnRim || {}, fog = a.fog || {}, li = a.light || {}, pal = a.palette || {};
    r.sunAz = +sn.azimuth || 0; r.sunEl = +(sn.elevation ?? 21); r.sunSize = +(sn.size ?? 1); r.sunGlow = +(sn.glow ?? 1);
    r.sunColor.set(sn.color || '#ffffff');
    r.top.set(sky.top || '#17141d'); r.mid.set(sky.mid || '#4f3330'); r.hor.set(sky.horizon || '#8a5c47');
    r.cover = clamp(+(cl.cover ?? 0), 0, 1); r.cloudColor.set(cl.color || sky.mid || '#4f3330'); r.cloudSpeed = +(cl.speed ?? 1);
    r.stars = Math.max(0, +(sky.stars ?? 0));
    r.moonAz = +(mo.azimuth ?? 0); r.moonEl = +(mo.elevation ?? -30); r.moonSize = Math.max(0, +(mo.size ?? 0)); r.moonColor.set(mo.color || '#8e7f78');
    r.fogColor.set(fog.color || sky.horizon || '#8a5c47');
    r.ridgeH = Math.max(0, +(ri.height ?? 0)); r.ridgeLayers = clamp(Math.round(+(ri.layers ?? 2)), 1, 3);
    if (ri.color) r.ridgeColor.set(ri.color); else r.ridgeColor.set(pal.rock || '#2a2321').lerp(r.fogColor, 0.35);
    r.aur = Math.max(0, +(au.strength ?? au.intensity ?? 0)); r.aurA.set(au.colorA || '#2fe0c8'); r.aurB.set(au.colorB || '#7b4dff');
    r.aurAz = +(au.azimuth ?? 350); r.aurH = +(au.height ?? 55); r.aurSpeed = +(au.speed ?? 1);
    r.rim = Math.max(0, +(dr.strength ?? dr.intensity ?? 0)); r.rimColor.set(dr.color || '#ff5a2a'); r.rimColor2.set(dr.color2 || '#7a2a40');
    r.rimAz = +(dr.azimuth ?? sn.azimuth ?? 0); r.rimW = Math.max(1, +(dr.width ?? 35)); r.rimH = Math.max(0.1, +(dr.height ?? 3));
    r.fogDensity = Math.max(0, +(fog.density ?? 0.0015)); r.fogFalloff = Math.max(0, +(fog.heightFalloff ?? 0.012));
    r.fogBase = +(fog.heightBase ?? 0); r.fogInscatter = Math.max(0, +(fog.inscatter ?? 0.6)); r.fogSunColor.set(fog.sunColor || sn.color || '#ffffff');
    r.lSun = Math.max(0, +(li.sun ?? 6.5)); r.lSunColor.set(li.sunColor || sn.color || '#ffffff');
    r.hemiSky.set(li.hemiSky || '#c4ad9e'); r.hemiGround.set(li.hemiGround || '#2b1c16'); r.hemi = Math.max(0, +(li.hemi ?? 1.7));
    r.lRim = Math.max(0, +(li.rim ?? 2.8)); r.lRimColor.set(li.rimColor || '#8fb0c8');
    r.exposure = +(li.exposure ?? 1); r.env = +(li.env ?? 1); r.minEl = +(li.shadowMinElevation ?? 0);
    r.ground.set(pal.ground || '#5b4d45');
    return r;
  }
  // The visible sun disc, halo and moon blend biased toward the smaller value, so a hidden key light (L1's starlight
  // sun: size 0, high in the sky) never shows as a disc crossing the sky mid-blend: the disc only grows in over the
  // last 30% of the blend, as the key nears its dawn position, and shrinks away in the first 30% going the other way.
  const BIASED = new Set(['sunSize', 'sunGlow', 'moonSize']);
  function lerpR(a, b, t, out) {
    for (const k of NUM_KEYS) {
      if (AZ_KEYS.has(k)) { out[k] = lerpAz(a[k], b[k], t); continue; }
      let u = t;
      if (BIASED.has(k)) u = b[k] > a[k] ? smooth(0.7, 1, t) : smooth(0, 0.3, t);
      out[k] = a[k] + (b[k] - a[k]) * u;
    }
    for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
    out.ridgeLayers = t < 0.5 ? a.ridgeLayers : b.ridgeLayers;
  }
  function copyR(src, out) { for (const k of NUM_KEYS) out[k] = src[k]; for (const k of COLOR_KEYS) out[k].copy(src[k]); }

  // ---------------------------------------------------------------- sky dome
  // the far-sky uniforms (SKY_PARS) are shared by the sky dome and every patched material's far fade
  const skyFarUniforms = {
    uSkyTop: { value: new THREE.Color() }, uSkyMid: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
    uSkySunCol: { value: new THREE.Color() }, uSkySunGlow: { value: 1 },
    uSkyRim: { value: 0 }, uSkyRimW: { value: 35 }, uSkyRimH: { value: 3 }, uSkyRimCol: { value: new THREE.Color() },
    uSkyRimCol2: { value: new THREE.Color() }, uSkyRimDir: { value: new THREE.Vector2(0, -1) },
    uSkyRidgeH: { value: 0 }, uSkyRidgeLayers: { value: 2 }, uSkyRidgeCol: { value: new THREE.Color() },
    uSkyCover: { value: 0 }, uSkyCloudSpeed: { value: 1 }, uSkyCloudOct: { value: 5 }, uSkyCloudCol: { value: new THREE.Color() },
    uSkyTime: { value: 0 },
  };
  const skyU = {
    ...fogUniforms, ...skyFarUniforms,
    uSunSize: { value: 1 },
    uStars: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonCol: { value: new THREE.Color() }, uMoonSize: { value: 0 },
    uAur: { value: 0 }, uAurH: { value: 55 }, uAurSpeed: { value: 1 }, uAurBands: { value: 3 },
    uAurA: { value: new THREE.Color() }, uAurB: { value: new THREE.Color() }, uAurF: { value: new THREE.Vector2(0, -1) },
    uFlash: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS,
                                            side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  skyMat.name = 'sky';
  skyMat.userData.shared = true;
  const skyGeo = new THREE.SphereGeometry(1, 64, 32);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky'; sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noAO = true;
  sky.onBeforeRender = (r, s, cam) => {   // follow whichever camera renders it (main, PMREM cube cameras)
    sky.position.copy(cam.position);
    sky.scale.setScalar((cam.far || 1000) * 0.92);
    sky.updateMatrixWorld();
  };
  scene.add(sky);

  // ---------------------------------------------------------------- environment (PMREM of the sky + a ground disc)
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyGeo, skyMat);
  envSky.frustumCulled = false;
  envSky.onBeforeRender = (r, s, cam) => { envSky.position.copy(cam.position); envSky.scale.setScalar((cam.far || 100) * 0.9); envSky.updateMatrixWorld(); };
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x3a2a24, side: THREE.DoubleSide });
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(60, 32), groundMat);
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -4;
  envScene.add(envSky, envGround);
  let pmrem = null, envRT = null, cubeRT = null, cubeCam = null, envDirty = false, installing = true;

  function buildEnv() {
    // during install the cube render, the prefilter and their shader compiles wait for the first tick or render,
    // so the page finishes loading sooner (every later apply builds the environment right away)
    if (installing) { envDirty = true; return; }
    envDirty = false;
    try {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      // ground bounce: the palette ground lit by sun and sky, hazed toward the fog
      const sunK = R.lSun * Math.max(0.05, Math.sin(Math.max(R.minEl, R.sunEl) * DEG)) / Math.PI;
      _c.copy(R.hemiSky).multiplyScalar(R.hemi * 0.35 / Math.PI).add(_c2.copy(R.lSunColor).multiplyScalar(sunK));
      groundMat.color.copy(R.ground).multiply(_c).lerp(R.fogColor, 0.25);
      // render the sky into a small HDR cube, then prefilter it (a 128² cube is plenty for blurred reflections)
      // 256² on High/Medium keeps a small bright sky feature (moon, halo core) from turning into texel squares on
      // mirror-like metal; 128² on Low
      const cs = ctx.tier.name === 'low' ? 128 : 256;
      if (cubeRT && cubeRT.width !== cs) { envScene.remove(cubeCam); cubeRT.dispose(); cubeRT = null; }
      if (!cubeRT) {
        cubeRT = new THREE.WebGLCubeRenderTarget(cs, { type: THREE.HalfFloatType, generateMipmaps: false });
        cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
        envScene.add(cubeCam);
      }
      // no lightning flash and no sun disc in the cube: a 1° disc becomes texel squares on mirrors; the direct sun
      // light draws the glint instead
      const flash = skyU.uFlash.value, disc = skyU.uSunSize.value;
      skyU.uFlash.value = 0; skyU.uSunSize.value = 0;
      cubeCam.update(renderer, envScene);
      const rt = pmrem.fromCubemap(cubeRT.texture);
      skyU.uFlash.value = flash; skyU.uSunSize.value = disc;
      if (envRT) envRT.dispose();
      envRT = rt;
      api.envMap = rt.texture;
      scene.environment = api.envMap;
    } catch (e) {
      console.warn('[atmosphere] environment build failed', e);
      api.envMap = null; scene.environment = null;
    }
  }

  // ---------------------------------------------------------------- skyline objects (§5.8)
  const skylineRoot = new THREE.Group();
  skylineRoot.name = 'skyline';
  scene.add(skylineRoot);
  const skyline = [];                  // { obj, world: Vector3 | null, at, size, mats[], h, def }
  const skylineBuilders = new Map();
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };

  function silMat(color, haze, h, plume = false) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...fogUniforms, uCol: { value: new THREE.Color(color) }, uLightDir: { value: lightDir }, uSunC: { value: skyU.uSkySunCol.value },
                  uHaze: { value: haze }, uH: { value: h }, uAlpha: { value: 1 }, uTime: skyU.uSkyTime },
      vertexShader: SKYLINE_VS, fragmentShader: plume ? PLUME_FS : SKYLINE_FS, fog: false,
      transparent: plume, depthWrite: !plume, side: plume ? THREE.DoubleSide : THREE.FrontSide,
    });
    return m;
  }
  const geo = {
    box: (w, h, d, b) => (KIT.bevelBox ? KIT.bevelBox(w, h, d, b) : new THREE.BoxGeometry(w, h, d)),
    cyl: (rt, rb, h, seg) => (KIT.cylinder ? KIT.cylinder(rt, rb, h, seg, 0) : new THREE.CylinderGeometry(rt, rb, h, seg)),
  };
  function addPart(group, g, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.frustumCulled = false; m.userData.noAO = true;
    group.add(m);
    return m;
  }
  // Kit geometry where it exists (namespace import, feature-detected: kit.js is another package's file), plain
  // geometry otherwise. Profiles are silhouette-first (AD §1.4, §2.17): battered walls, chamfered steps, flanges and
  // see-through trusses, so a skyline object reads as a designed shape at 3 km and never as a stack of boxes.
  const lathe = (prof, seg) => (KIT.latheHard ? KIT.latheHard(prof, seg, { crease: 30 })
    : new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  const plate = (pts, depth, view, bevel) => (KIT.plateGeo ? KIT.plateGeo(pts, depth, view, bevel) : (() => {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2);
    if (view === 'side') g.rotateY(Math.PI / 2);
    return g;
  })());
  const crect = (w, h, c, cx = 0, cy = 0) => {
    const x = w / 2, y = h / 2;
    const r = [[cx - x, cy - y], [cx + x, cy - y], [cx + x, cy + y], [cx - x, cy + y]];
    return KIT.chamfer ? KIT.chamfer(r, c) : r;
  };
  const batter = (pts, k) => (KIT.taper ? KIT.taper(pts, k) : pts);
  // Builders return { obj, h } in metres at the object's true distance; `mat` is the silhouette material.
  const BUILD = {
    tower(mat, rng) {   // a flared mast: stepped shaft, platform flanges, a cantilevered pod and an antenna
      const g = new THREE.Group(), H = 340, f = (k) => H * k;
      addPart(g, lathe([[0, 0], [26, 0], [26, 5], [17, 14], [12, 60], [9.5, f(0.32)], [15, f(0.32)], [15, f(0.32) + 7], [8.5, f(0.32) + 10],
                        [7, f(0.62)], [12, f(0.62)], [12, f(0.62) + 6], [6.5, f(0.62) + 8], [5, f(0.86)], [17, f(0.86)], [19, f(0.86) + 9],
                        [17, f(0.86) + 16], [3.2, f(0.86) + 18], [3.2, H], [0, H]], 10), mat, 0, 0, 0, 0, rng() * 3, 0);
      addPart(g, plate(crect(36, 14, 4, 0, 0), 12, 'front', 1.5), mat, 20, f(0.74), 0, 0, rng() * 6, 0);
      addPart(g, geo.cyl(0.9, 1.6, 70, 5), mat, 0, H + 35, 0);
      addPart(g, geo.cyl(0.6, 0.9, 40, 5), mat, 9, H - 10, 0, 0, 0, 0.12);
      return { obj: g, h: H + 70 };
    },
    tether(mat) {       // an orbital tether climbing out of sight, with a station ring
      const g = new THREE.Group(), H = 9000;
      addPart(g, geo.cyl(9, 14, H, 10), mat, 0, H / 2 - 50, 0);
      addPart(g, lathe([[0, -30], [40, -30], [60, -12], [60, 12], [40, 30], [0, 30]], 16), mat, 0, 900, 0);
      addPart(g, new THREE.TorusGeometry(120, 10, 8, 40), mat, 0, 900, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) addPart(g, geo.cyl(3, 3, 230, 5), mat, 0, 900, 0, 0, i * Math.PI / 4, Math.PI / 2);   // spokes
      return { obj: g, h: 1200 };
    },
    spire(mat, rng) {   // a stepped, tapering spire with flanges and a needle
      const prof = [[0, 0]]; let y = 0, r = 62;
      for (let i = 0; i < 5; i++) {
        const h = 140 - i * 15, rt = r * 0.74;
        prof.push([r + 6, y], [r + 6, y + 5], [r, y + 8], [rt, y + h]);
        y += h; r = rt * 0.9;
      }
      prof.push([r * 0.6, y + 4], [1.2, y + 170], [0, y + 170]);
      const g = new THREE.Group();
      addPart(g, lathe(prof, 8), mat, 0, 0, 0, 0, rng(), 0);
      return { obj: g, h: y + 170 };
    },
    megastructure(mat, rng) {   // battered, stepped massing with chamfered shoulders, buttresses, stacks and a truss gantry
      const g = new THREE.Group();
      addPart(g, plate(batter(crect(520, 380, 34, 0, 190), 0.84), 260, 'front', 6), mat, 0, 0, 0);
      addPart(g, plate(batter(crect(360, 260, 26, -40, 510), 0.86), 210, 'front', 5), mat, 0, 0, 0);
      addPart(g, plate(batter(crect(170, 230, 22, 70, 755), 0.8), 150, 'front', 4), mat, 0, 0, 0);
      // buttresses: wedges against the front face, irregular spacing (3-5-8 rhythm)
      for (const [x, h] of [[-225, 300], [-150, 250], [-30, 340], [95, 280], [200, 320]]) {
        const hh = h * (0.9 + rng() * 0.2);
        addPart(g, plate(crect(80, hh, 10, -40, hh / 2).map(([a, b]) => [a * (1 - b / hh * 0.85), b]), 26, 'side', 2), mat, x, 0, 130);   // side view flips z: the wedge leans out of the face
      }
      for (let i = 0; i < 3; i++) addPart(g, geo.cyl(7, 9, 120 + i * 30, 8), mat, 100 + i * 26, 870 + i * 15, -20);
      if (KIT.truss) addPart(g, KIT.truss(300, 0, 34, 9, 4), mat, -60, 645, 60);
      return { obj: g, h: 1000 };
    },
    wreck(mat, rng) {   // a broken hull on its side: two hull sections, exposed ribs at the break, a fin
      const g = new THREE.Group();
      const hull = [[-210, 0], [150, 0], [215, 30], [200, 80], [120, 96], [-160, 92], [-200, 60]];
      addPart(g, plate(hull, 110, 'side', 6), mat, 0, 20, 0, 0, 0, 0.06);
      addPart(g, plate([[0, 0], [150, 0], [175, 50], [120, 110], [10, 100]], 90, 'side', 5), mat, 0, 40, -240, 0.35, 0.25, 0.5);
      for (let i = 0; i < 6; i++) addPart(g, geo.box(8, 70 + rng() * 60, 8, 1), mat, (rng() - 0.5) * 80, 110, -150 - i * 16, 0.2 + rng() * 0.5, 0, (rng() - 0.5) * 0.6);
      addPart(g, plate([[0, 0], [90, 0], [40, 150], [10, 150]], 14, 'side', 2), mat, 0, 105, 120, -0.3, 0, 0);
      return { obj: g, h: 260 };
    },
    smoke(mat) {        // a rising plume, widening and fading
      const g = new THREE.Group(), H = 1600;
      const pg = new THREE.CylinderGeometry(260, 50, H, 24, 12, true); pg.translate(0, H / 2, 0);
      addPart(g, pg, mat, 0, 0, 0);
      return { obj: g, h: H, plume: true };
    },
    storm_wall(mat) {   // a dark curtain across a slice of the horizon
      const g = new THREE.Group(), H = 1400;
      const sg = new THREE.CylinderGeometry(3000, 3000, H, 48, 6, true, -0.6, 1.2); sg.translate(0, H / 2, -3000);
      addPart(g, sg, mat, 0, 0, 0);
      return { obj: g, h: H, plume: true };
    },
  };
  BUILD.custom = BUILD.spire;

  function buildSkyline(list) {
    clearSkyline();
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const def of list || []) {
      try {
        const kind = def.kind || 'spire';
        let builder = BUILD[kind];
        if (kind === 'custom' && def.custom && skylineBuilders.has(def.custom)) builder = null;
        const baseCol = def.color || '#' + _c.copy(R.ridgeColor).multiplyScalar(0.8).getHexString();
        const plumeKind = kind === 'smoke' || kind === 'storm_wall';
        const mat = silMat(baseCol, 0.5, 100, plumeKind);
        mat.userData.shared = false;
        let built;
        if (builder) built = builder(mat, rng);
        else if (skylineBuilders.has(def.custom)) built = skylineBuilders.get(def.custom)(ctx, def, mat);
        else { warnOnce('sky:' + kind, '[atmosphere] unknown skyline kind', kind); built = BUILD.spire(mat, rng); }
        if (!built || !built.obj) continue;
        if (kind === 'custom' && !skylineBuilders.has(def.custom)) warnOnce('skyc:' + def.custom, '[atmosphere] unknown custom skyline', def.custom);
        mat.uniforms.uH.value = built.h || 100;
        if (kind === 'storm_wall') mat.uniforms.uAlpha.value = 0.9;
        built.obj.traverse(o => { o.renderOrder = -9; o.frustumCulled = false; o.userData.noAO = true; });
        built.obj.matrixAutoUpdate = true;
        skylineRoot.add(built.obj);
        skyline.push({ obj: built.obj, def, mat, world: null, size: Math.max(0.01, +(def.size ?? 1)), h: built.h || 100 });
      } catch (e) { console.warn('[atmosphere] skyline build failed', def, e); }
    }
  }
  function clearSkyline() {
    for (const s of skyline) {
      skylineRoot.remove(s.obj);
      s.obj.traverse(o => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
      s.mat.dispose();
    }
    skyline.length = 0;
  }
  function skylineWorld(s) {
    if (s.world) return s.world;
    const at = s.def.at;
    if (at && typeof at === 'object' && !Array.isArray(at) && 'azimuth' in at) {
      s.world = dirAzEl(+at.azimuth || 0, 0, new THREE.Vector3()).multiplyScalar(+at.dist || 4000);
      s.world.y = -0.012 * (+at.dist || 4000);
    } else if (Array.isArray(at)) s.world = new THREE.Vector3(+at[0] || 0, 0, +at[1] || 0);
    else if (at && ctx.world?.route) { try { s.world = ctx.world.resolve(at, new THREE.Vector3()); } catch (e) { s.world = null; } }
    else if (at && 'x' in at) s.world = new THREE.Vector3(+at.x || 0, +at.y || 0, +at.z || 0);
    return s.world;
  }
  function placeSkyline(cam) {
    if (!skyline.length) return;
    const far = (cam.far || ctx.camera.far) * 0.88;
    for (const s of skyline) {
      const w = skylineWorld(s);
      if (!w) { s.obj.visible = false; continue; }
      s.obj.visible = true;
      _v.subVectors(w, cam.position);
      const dist = Math.max(1, _v.length());
      const placed = Math.min(dist, far), k = placed / dist;
      s.obj.position.copy(cam.position).addScaledVector(_v, k);
      s.obj.scale.setScalar(s.size * k);
      s.mat.uniforms.uHaze.value = clamp(0.38 + 0.42 * (1 - Math.exp(-dist / 7000)), 0, 0.86);
    }
  }

  // ---------------------------------------------------------------- shadow follow with texel snapping (§7.3)
  function shadowCam() {
    const e = ctx.tier.shadowExtent || 160, s = ctx.tier.shadowMapSize || 2048;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 10, far: 900 });
    sun.shadow.camera.updateProjectionMatrix();
    if (sun.shadow.mapSize.x !== s) {
      sun.shadow.mapSize.set(s, s);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    const texel = (2 * e) / s;
    sun.shadow.normalBias = Math.max(0.4, texel * 4);
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = ctx.tier.name === 'low' ? 1 : 2;
  }
  const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _ctr = new THREE.Vector3();
  function followShadow(focus) {
    const e = ctx.tier.shadowExtent || 160, s = ctx.tier.shadowMapSize || 2048, texel = (2 * e) / s;
    _m.lookAt(lightDir, ZERO, UP);
    _right.setFromMatrixColumn(_m, 0); _up.setFromMatrixColumn(_m, 1);
    const u = focus.dot(_right), v = focus.dot(_up);
    const du = Math.round(u / texel) * texel - u, dv = Math.round(v / texel) * texel - v;
    _ctr.copy(focus).addScaledVector(_right, du).addScaledVector(_up, dv);
    sun.target.position.copy(_ctr);
    sun.position.copy(_ctr).addScaledVector(lightDir, 420);
    rim.target.position.copy(_ctr);
    rim.position.set(_ctr.x - lightDir.x * 100, _ctr.y + 50, _ctr.z - lightDir.z * 100);
  }
  function focusPoint(cam) {
    const rig = ctx.cameraRig;
    if (rig && rig.mode !== 'free' && rig.focus) return rig.focus;
    return (cam || ctx.camera).position;
  }

  // ---------------------------------------------------------------- applying the resolved state
  const auroraTint = new THREE.Color();
  let flashT = 9, flashK = 0;
  function applyR(r) {
    dirAzEl(r.sunAz, r.sunEl, sunDir);
    const el = Math.max(r.sunEl, r.minEl, 3);
    dirAzEl(r.sunAz, Math.min(el, 89), lightDir);
    // sky
    skyU.uSkySunCol.value.copy(r.sunColor); skyU.uSunSize.value = r.sunSize; skyU.uSkySunGlow.value = r.sunGlow;
    skyU.uSkyTop.value.copy(r.top); skyU.uSkyMid.value.copy(r.mid); skyU.uSkyHor.value.copy(r.hor);
    skyU.uSkyCover.value = r.cover; skyU.uSkyCloudCol.value.copy(r.cloudColor); skyU.uSkyCloudSpeed.value = r.cloudSpeed;
    skyU.uStars.value = r.stars;
    dirAzEl(r.moonAz, r.moonEl, skyU.uMoonDir.value); skyU.uMoonCol.value.copy(r.moonColor);
    skyU.uMoonSize.value = r.moonEl > -10 ? r.moonSize : 0;
    skyU.uSkyRidgeH.value = r.ridgeH; skyU.uSkyRidgeLayers.value = r.ridgeLayers; skyU.uSkyRidgeCol.value.copy(r.ridgeColor);
    skyU.uAur.value = r.aur; skyU.uAurA.value.copy(r.aurA); skyU.uAurB.value.copy(r.aurB); skyU.uAurH.value = r.aurH;
    skyU.uAurSpeed.value = r.aurSpeed; skyU.uAurF.value.set(Math.sin(r.aurAz * DEG), -Math.cos(r.aurAz * DEG));
    skyU.uSkyRim.value = r.rim; skyU.uSkyRimCol.value.copy(r.rimColor); skyU.uSkyRimCol2.value.copy(r.rimColor2);
    skyU.uSkyRimDir.value.set(Math.sin(r.rimAz * DEG), -Math.cos(r.rimAz * DEG)); skyU.uSkyRimW.value = r.rimW; skyU.uSkyRimH.value = r.rimH;
    // fog
    fogUniforms.uFogColor.value.copy(r.fogColor); fogUniforms.uFogHeightFalloff.value = r.fogFalloff;
    fogUniforms.uFogHeightBase.value = r.fogBase; fogUniforms.uFogSunColor.value.copy(r.fogSunColor);
    fogUniforms.uFogInscatter.value = r.fogInscatter;
    if (!scene.fog) scene.fog = new THREE.FogExp2(r.fogColor.getHex(), r.fogDensity);
    scene.fog.color.copy(r.fogColor);
    scene.background = scene.fog.color;
    // lights
    sun.color.copy(r.lSunColor); sun.intensity = r.lSun;
    hemi.color.copy(r.hemiSky); hemi.groundColor.copy(r.hemiGround); hemi.intensity = r.hemi;
    if (r.aur > 0) {   // the aurora lends the sky fill a little of its light (A5.4)
      auroraTint.copy(r.aurA).lerp(r.aurB, 0.5);
      hemi.color.lerp(auroraTint, 0.2 * smooth(0, 0.2, r.aur));
    }
    rim.color.copy(r.lRimColor); rim.intensity = r.lRim;
    baseHemi = hemi.intensity;
    renderer.toneMappingExposure = r.exposure;
    ctx.materials?.setEnvScale?.(r.env);
    updateFogDensity();
  }
  let baseHemi = 1.7;
  function updateFogDensity() {
    const boost = ctx.weather?.current?.fogBoost ?? 1;
    const d = R.fogDensity * (Number.isFinite(boost) ? Math.max(0, boost) : 1);
    fogUniforms.uFogDensity.value = d;
    // three's FogExp2 for any unpatched material: matched to the height fog at the camera's height
    const camY = ctx.camera.position.y - R.fogBase;
    if (scene.fog) scene.fog.density = d * Math.exp(-R.fogFalloff * clamp(camY, -50, 400)) * 1.1;
  }

  // ---------------------------------------------------------------- blends
  let blend = null;                          // { t, dur }
  let setCount = 0;
  let target = deepMerge(DEFAULT_ART, {});   // art at the end of the current blend
  let ambience = [];

  function startAmbience(list) {
    for (const h of ambience) h?.stop?.();
    ambience = [];
    for (const def of list || []) { try { const h = ctx.fx?.ambient?.(def); if (h) ambience.push(h); } catch (e) { console.warn('[atmosphere] ambience failed', e); } }
  }

  // ---------------------------------------------------------------- material patch (§5.8, Appendix B.3)
  const DECLS = [
    ['uFogColor', 'uniform vec3 uFogColor;'], ['uFogDensity', 'uniform float uFogDensity;'], ['uFogHeightFalloff', 'uniform float uFogHeightFalloff;'],
    ['uFogHeightBase', 'uniform float uFogHeightBase;'], ['uFogSunColor', 'uniform vec3 uFogSunColor;'], ['uFogSunDir', 'uniform vec3 uFogSunDir;'],
    ['uFogInscatter', 'uniform float uFogInscatter;'], ['uFogFarStart', 'uniform float uFogFarStart;'], ['uFogFarEnd', 'uniform float uFogFarEnd;'],
  ];
  const FOG_FUNCS = FOG_PARS.slice(FOG_PARS.indexOf('// optical depth'));
  function fogPars(src) {
    // declare only what the shader doesn't already declare (another package's patch may share a uniform name)
    let out = '';
    for (const [name, decl] of DECLS) if (!new RegExp('uniform\\s+\\w+\\s+' + name + '\\s*;').test(src)) out += decl + '\n';
    out += FOG_FUNCS;
    if (!src.includes('cHash12')) out += NOISE_PARS;
    if (!src.includes('cSkyFar')) out += SKY_PARS;
    return out;
  }
  // Height fog and inscatter toward the fog colour; past uFogFarStart the target colour itself turns into the sky
  // behind the surface (gradient, dawn rim, sun halo, ridge bands), so the far edge of the land is never visible.
  const FOG_BLOCK = `{
    vec3 cv_ = vFogWorld - cameraPosition; float cl_ = length(cv_); vec3 cd_ = cv_ / max(cl_, 1e-4);
    float caa_ = max(fwidth(cSkyDeg(cd_)), 0.003) * 1.2;
    float cf_ = cFogAmount(vFogWorld);
    vec3 cc_ = cFogColor(cd_);
    float cff_ = smoothstep(uFogFarStart, uFogFarEnd, cl_);
    if (cff_ > 0.001) cc_ = mix(cc_, cSkyFar(cd_, caa_), cff_);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, cc_, cf_);
  }`;
  function fogPatch(sh, m) {
    if (m.fog === false) return;
    for (const k of Object.keys(fogUniforms)) sh.uniforms[k] = fogUniforms[k];
    for (const k of Object.keys(skyFarUniforms)) sh.uniforms[k] = skyFarUniforms[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);');
    const additive = m.blending === THREE.AdditiveBlending;
    const block = additive ? '{ float cf_ = cFogAmount(vFogWorld); gl_FragColor.rgb *= 1.0 - cf_; }' : FOG_BLOCK;
    let fs = sh.fragmentShader;
    if (!fs.includes('vFogWorld')) fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;\n' + fogPars(fs));
    if (fs.includes('#include <opaque_fragment>')) {
      fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + block).replace('#include <fog_fragment>', '');
    } else if (fs.includes('#include <fog_fragment>')) fs = fs.replace('#include <fog_fragment>', block);
    sh.fragmentShader = fs;
  }

  // ---------------------------------------------------------------- api
  const api = {
    sun, hemi, rim, sunDir,
    /** extra: the key light's direction (sunDir with the shadowMinElevation clamp) */
    lightDir,
    art: deepMerge(DEFAULT_ART, {}),
    envMap: null,
    fogUniforms,
    /** extra: the sky dome mesh and its uniforms (tests, levels that need to read them) */
    sky, skyUniforms: skyU,
    apply(art = {}) {
      blend = null;
      api.art = deepMerge(DEFAULT_ART, art || {});
      target = api.art;
      resolve(api.art, R);
      applyR(R);
      renderer.toneMapping = TONE[api.art.toneMapping] ?? THREE.ACESFilmicToneMapping;
      if (api.art.toneMapping && !TONE[api.art.toneMapping]) warnOnce('tone:' + api.art.toneMapping, '[atmosphere] unknown toneMapping', api.art.toneMapping);
      ctx.pipeline?.setGrade?.({ ...GRADE_DEFAULT, ...(api.art.grade || {}) }, 0);
      ctx.pipeline?.setBloom?.({ ...DEFAULT_ART.bloom, ...(api.art.bloom || {}) }, 0);
      ctx.weather?.set?.({ ...DEFAULT_ART.weather, ...(api.art.weather || {}) }, 0);
      ctx.materials?.applyPalette?.(api.art.palette || {});
      ctx.materials?.setSurfaceStyle?.(api.art.surface?.style);
      ctx.materials?.setFrost?.(api.art.surface?.frost ?? 0, api.art.palette?.snow);
      buildSkyline(api.art.skyline);
      startAmbience(api.art.ambience);
      buildEnv();
      api.update(0);
    },
    set(p = {}, blendSeconds = 0) {
      p = p || {};
      setCount++;
      const dur = Math.max(0, +blendSeconds || 0);
      // the blend starts from wherever the art is now (mid-blend included)
      if (blend) copyR(R, RA); else resolve(api.art, RA);
      target = deepMerge(target, p);
      resolve(target, RB);
      if (p.toneMapping) renderer.toneMapping = TONE[p.toneMapping] ?? renderer.toneMapping;
      if (p.grade) ctx.pipeline?.setGrade?.(p.grade, dur);
      if (p.bloom) ctx.pipeline?.setBloom?.(p.bloom, dur);
      if (p.weather) ctx.weather?.set?.(p.weather, dur);
      if (p.palette) ctx.materials?.applyPalette?.(p.palette);
      if (p.surface) {
        if (p.surface.style) ctx.materials?.setSurfaceStyle?.(p.surface.style);
        if (p.surface.frost != null) ctx.materials?.setFrost?.(p.surface.frost, target.palette?.snow);
      }
      if (p.skyline) buildSkyline(target.skyline);
      if (dur <= 0) {
        blend = null;
        api.art = target;
        copyR(RB, R); applyR(R);
        buildEnv();
      } else {
        api.art = target;          // fields without a visual blend (unknown ones included) take effect now
        blend = { t: 0, dur };
      }
    },
    patchMaterial(m) {
      if (!m || !m.isMaterial || m.userData.cFog) return m;
      m.userData.cFog = true;
      const prev = m.onBeforeCompile;
      const hasKey = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
      const prevKey = m.customProgramCacheKey;
      const prevSrc = hasKey ? null : String(prev);
      m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); fogPatch(sh, this); };
      m.customProgramCacheKey = function () {
        return (prevSrc ?? prevKey.call(this)) + '|cfog' + (this.blending === THREE.AdditiveBlending ? 'A' : '') + (this.fog === false ? 'N' : '');
      };
      m.needsUpdate = true;
      return m;
    },
    fogAmount(p) {
      const cam = ctx.camera.position;
      const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const k = fogUniforms.uFogHeightFalloff.value, base = fogUniforms.uFogHeightBase.value, dens = fogUniforms.uFogDensity.value;
      const h0 = cam.y - base, h1 = p.y - base, kd = k * (h1 - h0);
      const a = clamp(-k * h0, -60, 60);
      const od = Math.abs(kd) > 1e-4 ? (Math.exp(a) - Math.exp(clamp(-k * h1, -60, 60))) / kd : Math.exp(a);
      const f = 1 - Math.exp(-Math.max(0, dens * od * len));
      return Math.max(f, smooth(fogUniforms.uFogFarStart.value, fogUniforms.uFogFarEnd.value, len));
    },
    lightning(strength = 1) { flashT = 0; flashK = clamp(+strength || 1, 0, 3); },
    rebuildEnvironment() { buildEnv(); },
    clear() { clearSkyline(); startAmbience([]); },
    /** extra: register a builder for skyline entries of kind 'custom' ({ custom: name }): (ctx, def, mat) → { obj, h } */
    registerSkyline(name, fn) { skylineBuilders.set(name, fn); },
    /** extra: true while an art blend runs */
    get blending() { return !!blend; },
    /** extra (tests): the running blend's progress, or null */
    blendInfo() { return blend ? { t: blend.t, dur: blend.dur, sets: setCount } : { t: 0, dur: 0, sets: setCount }; },
    /** extra (pipeline): per-render placement for whichever camera renders the main scene */
    prepare(cam) {
      cam = cam || ctx.camera;
      if (envDirty) { envDirty = false; buildEnv(); }
      followShadow(focusPoint(cam));
      placeSkyline(cam);
    },
    update(dt = 0) {
      skyU.uSkyTime.value = ctx.clock.realTime;
      if (envDirty) { envDirty = false; buildEnv(); }
      if (blend) {
        blend.t += dt;
        const k = blend.dur > 0 ? Math.min(1, blend.t / blend.dur) : 1;
        lerpR(RA, RB, k * k * (3 - 2 * k), R);
        applyR(R);
        if (k >= 1) { blend = null; buildEnv(); }
      }
      // lightning: a double flicker on the sky and the sky fill
      if (flashT < 2) {
        flashT += dt;
        const f = flashK * (Math.exp(-flashT * 16) + (flashT > 0.13 ? 0.7 * Math.exp(-(flashT - 0.13) * 11) : 0));
        skyU.uFlash.value = f;
        hemi.intensity = baseHemi + f * 2.5;
      } else if (skyU.uFlash.value !== 0) { skyU.uFlash.value = 0; hemi.intensity = baseHemi; }
      updateFogDensity();
      api.prepare(ctx.camera);
    },
  };

  ctx.events.on('tier:changed', ({ tier }) => {
    shadowCam();
    fogUniforms.uFogFarStart.value = tier.fogFarStart ?? 1820; fogUniforms.uFogFarEnd.value = tier.fogFarEnd ?? 2550;
    skyU.uSkyCloudOct.value = tier.name === 'high' ? 5 : tier.name === 'medium' ? 4 : 3;
    skyU.uAurBands.value = tier.name === 'low' ? 1 : 3;
  });
  ctx.events.on('level:cleared', () => { clearSkyline(); for (const h of ambience) h?.stop?.(); ambience = []; });
  shadowCam();
  skyU.uSkyCloudOct.value = ctx.tier.name === 'high' ? 5 : ctx.tier.name === 'medium' ? 4 : 3;
  skyU.uAurBands.value = ctx.tier.name === 'low' ? 1 : 3;
  ctx.addSystem({ name: 'atmosphere', phase: 'fx', when: 'always', update: (dt) => api.update(dt) });
  ctx.atmosphere = api;
  api.apply({});
  installing = false;
  return api;
}
