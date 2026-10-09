// core/noise.js (P0): seeded, deterministic, allocation-free 2D noise for terrain and textures.
import { mulberry32 } from './util.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
// 12 gradient directions (classic simplex set projected to 2D, plus axis-aligned ones)
const GRAD = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
  0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071,
]);

function permutation(seed) {
  const rng = mulberry32(seed ^ 0x9E3779B9);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

/** Simplex noise, range ≈ [−1, 1]. */
export function createNoise2D(seed = 0) {
  const perm = permutation(seed | 0);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) permMod12[i] = perm[i] % 12;
  return function noise2D(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = permMod12[ii + perm[jj]] * 2; t0 *= t0; n0 = t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = permMod12[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n1 = t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = permMod12[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n2 = t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

/** Value noise on an integer lattice with smoothstep interpolation, range [0, 1]. */
export function createValueNoise2D(seed = 0) {
  const perm = permutation((seed | 0) ^ 0x51ED270B);
  const rng = mulberry32((seed | 0) ^ 0x2545F491);
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = rng();
  const h = (i, j) => val[perm[(i & 255) + perm[j & 255]]];
  return function value2D(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Fractal Brownian motion, normalised by the amplitude sum so the result stays in ≈ the noise's range. */
export function fbm2(noise, x, y, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * noise(x * f + i * 17.13, y * f - i * 9.71);
    n += a; a *= gain; f *= lacunarity;
  }
  return s / n;
}

/** Ridged multifractal in [0, 1]: sharp crests. Expects signed noise in ≈ [−1, 1] (createNoise2D);
 *  for [0, 1] value noise pass `(x, y) => v(x, y) * 2 - 1`. */
export function ridged2(noise, x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0, w = 1;
  for (let i = 0; i < octaves; i++) {
    let v = noise(x * f + i * 31.7, y * f + i * 47.3);
    v = 1 - Math.abs(v);
    v *= v;
    s += v * a * w;
    n += a;
    w = Math.min(1, Math.max(0, v * 1.5));
    a *= gain; f *= lacunarity;
  }
  return Math.min(1, Math.max(0, s / n));
}

/** Domain warp: writes the warped coordinates into `out` (no allocation). */
export function warp2(noise, x, y, amount, scale, out) {
  const sx = x / scale, sy = y / scale;
  const wx = noise(sx + 5.2, sy + 1.3), wy = noise(sx - 8.3, sy + 2.8);
  out.x = x + wx * amount;
  out.y = y + wy * amount;
  return out;
}

/** Periodic value noise for tileable textures: integer `period` lattice cells per tile, range [0, 1]. */
export function tileable2(seed, period) {
  const P = Math.max(1, Math.round(period));
  const rng = mulberry32((seed | 0) ^ 0x7F4A7C15);
  const lat = new Float32Array(P * P);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const at = (i, j) => lat[(((j % P) + P) % P) * P + (((i % P) + P) % P)];
  return function tile2D(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
