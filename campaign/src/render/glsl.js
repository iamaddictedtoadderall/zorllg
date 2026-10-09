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
