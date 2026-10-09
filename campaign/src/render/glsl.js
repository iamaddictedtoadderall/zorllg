// render/glsl.js (P1): GLSL snippets shared by the P1 render modules (atmosphere fog patch, sky, particles, glows,
// weather, decals). Pure strings, no ctx. The fog maths mirrors atmosphere.fogAmount() on the CPU (architecture §5.8,
// Appendix B.3): exponential height fog integrated analytically along the view ray, sun inscatter, and a far fade that
// guarantees every surface reaches the fog colour before the far plane.

/** Uniform declarations for atmosphere.fogUniforms plus the fog functions. Needs `cameraPosition` (three provides it). */
export const FOG_PARS = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform float uFogHeightBase;
uniform vec3 uFogSunColor;
uniform vec3 uFogSunDir;
uniform float uFogInscatter;
uniform float uFogFarStart;
uniform float uFogFarEnd;
// optical depth from the camera to world point wp (exact integral of density·exp(−k·(y − base)) along the segment)
float cFogDepth(vec3 wp) {
  vec3 rd = wp - cameraPosition;
  float len = length(rd);
  float k = uFogHeightFalloff;
  float h0 = cameraPosition.y - uFogHeightBase;
  float h1 = wp.y - uFogHeightBase;
  float kd = k * (h1 - h0);
  float a = clamp(-k * h0, -60.0, 60.0);
  float od;
  if (abs(kd) > 1e-4) od = (exp(a) - exp(clamp(-k * h1, -60.0, 60.0))) / kd;
  else od = exp(a);
  return max(uFogDensity * od * len, 0.0);
}
// 0..1 fog amount, including the far fade
float cFogAmount(vec3 wp) {
  float len = length(wp - cameraPosition);
  return max(1.0 - exp(-cFogDepth(wp)), smoothstep(uFogFarStart, uFogFarEnd, len));
}
// fog colour seen along the (normalised) view direction: glows toward the sun
vec3 cFogColor(vec3 dir) {
  float s = max(dot(dir, uFogSunDir), 0.0);
  return mix(uFogColor, uFogSunColor, pow(s, 8.0) * uFogInscatter);
}
`;

/** Cheap hash / value noise helpers. */
export const NOISE_PARS = /* glsl */`
float cHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cHash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash12(i), cHash12(i + vec2(1.0, 0.0)), f.x), mix(cHash12(i + vec2(0.0, 1.0)), cHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/**
 * The sky's far colour along a direction (needs FOG_PARS and NOISE_PARS first): the horizon → mid → top gradient
 * (fog colour at and below the horizon), the dawn rim, the sun halo, and the ridge silhouette bands. The sky dome
 * draws exactly this underneath its clouds, aurora, stars, moon and sun disc, and atmosphere.patchMaterial fades
 * distant surfaces to it (the far fade), so a terrain edge dissolves into whatever sky is behind it, ridges included.
 * Uniform names carry a uSky prefix so they never clash with another package's patch.
 */
export const SKY_PARS = /* glsl */`
uniform vec3 uSkyTop, uSkyMid, uSkyHor, uSkySunCol;
uniform float uSkySunGlow;
uniform float uSkyRim, uSkyRimW, uSkyRimH;
uniform vec3 uSkyRimCol, uSkyRimCol2;
uniform vec2 uSkyRimDir;
uniform float uSkyRidgeH, uSkyRidgeLayers;
uniform vec3 uSkyRidgeCol;
uniform float uSkyCover, uSkyCloudSpeed, uSkyCloudOct, uSkyTime;
uniform vec3 uSkyCloudCol;
float cSkyDeg(vec3 d) { return degrees(asin(clamp(d.y, -1.0, 1.0))); }
float cFbm(vec2 p, float oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) { if (float(i) >= oct) break; s += a * cNoise(p); n += a; p = p * 2.03 + 17.1; a *= 0.5; }
  return s / max(n, 1e-3);
}
// clouds: two fbm layers projected on a high plane, lit from the sun side, silver lining; thin edges catch the light
// and thick cores go dark, so cloud forms read on the anti-sun side too. Returns the clouded colour, cover in cl.
vec3 cSkyClouds(vec3 d, vec3 fogC, vec3 c, out float cl) {
  cl = 0.0;
  float h = d.y;
  if (uSkyCover <= 0.001 || h <= 0.0) return c;
  float sp = max(dot(d, uFogSunDir), 0.0);
  vec2 cp = d.xz / (h + 0.12);
  vec2 w = vec2(0.012, 0.004) * uSkyTime * uSkyCloudSpeed;
  float n1 = cFbm(cp * 1.6 + w, uSkyCloudOct);
  float n2 = cFbm(cp * 4.3 + vec2(5.2, 1.3) - w * 1.7, max(uSkyCloudOct - 1.0, 1.0));
  float n = n1 * 0.72 + n2 * 0.28;
  float th = 1.0 - uSkyCover * 0.85;
  cl = smoothstep(th - 0.1, th + 0.2, n) * smoothstep(0.0, 0.14, h);
  float thick = smoothstep(th + 0.05, th + 0.45, n);
  float edgeLit = 1.0 - smoothstep(th - 0.05, th + 0.3, n);
  vec3 lit = uSkyCloudCol * (0.85 + 0.6 * pow(sp, 2.0) + 0.35 * edgeLit) + uSkySunCol * pow(sp, 8.0) * 0.5 * (1.0 - thick);
  vec3 cc = mix(lit, uSkyCloudCol * 0.42, thick * 0.72);
  cc += uSkySunCol * pow(sp, 5.0) * cl * (1.0 - thick) * 1.6 * uSkySunGlow;
  cc = mix(cc, fogC, (1.0 - smoothstep(0.0, 0.3, h)) * 0.65);
  return mix(c, cc, cl * 0.88);
}
vec3 cSkyGradient(vec3 d, vec3 fogC) {
  float h = d.y;
  vec3 c = mix(fogC, uSkyHor, smoothstep(0.0, 0.06, h));
  c = mix(c, uSkyMid, smoothstep(0.02, 0.24, h));
  return mix(c, uSkyTop, smoothstep(0.2, 0.78, h));
}
// dawn rim: a band hugging the horizon toward its azimuth, whatever the sun does; hide (0..1) masks the stars
vec3 cSkyRim(vec3 d, float hd, out float hide) {
  hide = 0.0;
  if (uSkyRim <= 0.001) return vec3(0.0);
  vec2 dz = normalize(d.xz + vec2(1e-5));
  float ad = acos(clamp(dot(dz, uSkyRimDir), -1.0, 1.0));
  float aw = exp(-pow(ad / max(radians(uSkyRimW), 0.01), 2.0) * 1.3);
  float vert = exp(-max(hd, 0.0) / max(uSkyRimH, 0.05)) * smoothstep(-0.25, 0.25, hd);
  vec3 rc = mix(uSkyRimCol, uSkyRimCol2, smoothstep(0.0, uSkyRimH * 2.2, hd));
  float k = uSkyRim * vert * aw;
  hide = clamp(k * 3.0, 0.0, 1.0);
  return rc * k + rc * uSkyRim * aw * 0.12 * exp(-max(hd, 0.0) / max(uSkyRimH * 5.0, 0.2)) * smoothstep(-0.25, 0.25, hd);
}
// sun halo (above the horizon only, so the horizon line matches the fogged land)
vec3 cSkyHalo(vec3 d, float cloud) {
  float sp = max(dot(d, uFogSunDir), 0.0);
  return uSkySunCol * (pow(sp, 6.0) * 0.32 * uSkySunGlow + pow(sp, 60.0) * 0.55 * uSkySunGlow) * smoothstep(0.0, 0.025, d.y) * (1.0 - cloud * 0.5);
}
// ridge silhouettes: the land continues above the horizon in fog-coloured layers
// aa: the silhouette's anti-aliasing width in degrees (max(fwidth(hd), 0.003) × 1.2, taken in uniform control flow)
vec3 cSkyRidges(vec3 d, float hd, vec3 c, vec3 fogC, float cloud, float aa) {
  if (uSkyRidgeH <= 0.01 || hd < -0.5 || hd > uSkyRidgeH + 0.5) return c;
  float az = atan(d.x, -d.z);
  vec2 ring = vec2(cos(az), sin(az));
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uSkyRidgeLayers) break;
    float fi = float(i);
    vec2 rp = ring * (2.3 + fi * 1.9) + vec2(fi * 7.31 + 3.0, fi * 3.17 + 1.0);
    float n = 0.0, a = 0.55, f = 1.0;
    for (int o = 0; o < 5; o++) { float v = 1.0 - abs(cNoise(rp * f) * 2.0 - 1.0); n += a * v * v; f *= 2.13; a *= 0.48; }
    float lh = uSkyRidgeH * (0.18 + 0.82 * clamp(n, 0.0, 1.0)) * (1.0 - fi * 0.3);
    float m = (1.0 - smoothstep(lh - aa, lh + aa, hd)) * smoothstep(-0.3, 0.05, hd);
    vec3 lc = mix(fogC, uSkyRidgeCol, 0.2 + 0.14 * fi);   // the farthest land is the haziest: close to the fog, still a silhouette
    lc = mix(lc, fogC, smoothstep(lh * 0.7, 0.0, hd));
    c = mix(c, lc, m * (1.0 - cloud * 0.3));
  }
  return c;
}
// everything the sky shows that a far surface should fade into
vec3 cSkyFar(vec3 d, float aa) {
  vec3 fogC = cFogColor(d);
  float hd = cSkyDeg(d), hide, cl;
  vec3 c = cSkyGradient(d, fogC) + cSkyRim(d, hd, hide);
  c = cSkyClouds(d, fogC, c, cl);
  c += cSkyHalo(d, cl);
  return cSkyRidges(d, hd, c, fogC, cl, aa);
}
`;
