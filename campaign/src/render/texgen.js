// render/texgen.js (P1): procedural texture generators for render/materials.js. Pure functions: each returns
// { data: Uint8Array (RGBA), w, h }. Everything tiles. Packed data maps follow art-direction §3.6 / §4.4 / §4.6:
//   grain, rock      R albedo variation (0.5 neutral) · G height · B cavity (1 open, 0 crevice) · A roughness
//   concrete, metal  same packing
//   grime            R blotches · G fine scratches · B streak noise (1:8 along v) · A chip noise
//   noise            R, G, B, A: four independent tileable fbm fields
// Atlases (4 × 2 cells): spark (R intensity, G hot core) and smoke (RG sprite normal, B detail, A density).
// No per-texel allocation; generators run once per tier size (and per terrain style at level load).

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function hash1(n) { n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1); n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d); n ^= n >>> 13; return (n >>> 0) / 4294967296; }

/** Periodic value noise on a px × py lattice; call with lattice coordinates (x in [0, px) tiles). Range [0, 1]. */
function lattice(seed, px, py = px) {
  const r = mulberry32(seed), a = new Float32Array(px * py);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return function (x, y) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    xi %= px; if (xi < 0) xi += px; yi %= py; if (yi < 0) yi += py;
    const x1 = xi + 1 === px ? 0 : xi + 1, y1 = yi + 1 === py ? 0 : yi + 1;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const r0 = yi * px, r1 = y1 * px;
    const A = a[r0 + xi], B = a[r0 + x1], C = a[r1 + xi], D = a[r1 + x1];
    return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
  };
}
/** fbm over [0,1)² with integer base periods so it tiles; returns ≈ [0, 1] */
function fbmTile(seed, basePx, basePy, octaves, gain = 0.5) {
  const ls = [], amps = [];
  let a = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    const px = basePx << i, py = basePy << i;
    ls.push({ f: lattice(seed + i * 101, px, py), px, py });
    amps.push(a); sum += a; a *= gain;
  }
  return function (u, v) {
    let s = 0;
    for (let i = 0; i < ls.length; i++) { const L = ls[i]; s += amps[i] * L.f(u * L.px, v * L.py); }
    return s / sum;
  };
}
/** Periodic Worley noise on a cx × cy cell grid over [0,1)²; writes f1, f2 and the nearest cell's id into `out`. */
function worley(seed, cx, cy = cx) {
  const r = mulberry32(seed), pts = new Float32Array(cx * cy * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return function (u, v, out) {
    const x = u * cx, y = v * cy, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) {
      const cyy = ((yi + j) % cy + cy) % cy;
      for (let i = -1; i <= 1; i++) {
        const cxx = ((xi + i) % cx + cx) % cx, k = cyy * cx + cxx;
        const dx = xi + i + pts[k * 2] - x, dy = yi + j + pts[k * 2 + 1] - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
      }
    }
    out.f1 = f1; out.f2 = f2; out.id = id;
    return out;
  };
}
function packed(w, h, texel) {
  const data = new Uint8Array(w * h * 4), o = [0, 0, 0, 0];
  for (let y = 0, i = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++, i += 4) {
      texel((x + 0.5) / w, v, o);
      data[i] = clamp01(o[0]) * 255 + 0.5; data[i + 1] = clamp01(o[1]) * 255 + 0.5;
      data[i + 2] = clamp01(o[2]) * 255 + 0.5; data[i + 3] = clamp01(o[3]) * 255 + 0.5;
    }
  }
  return { data, w, h };
}
/** Rasterise short random scratches into a float buffer (wraps). */
function scratches(buf, S, seed, count, lenMin, lenMax, val) {
  const r = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    let x = r() * S, y = r() * S;
    const a = r() * Math.PI * 2, len = (lenMin + r() * (lenMax - lenMin)) * S, dx = Math.cos(a), dy = Math.sin(a);
    const curve = (r() - 0.5) * 0.02;
    const strength = val * (0.4 + 0.6 * r());
    for (let t = 0; t < len; t += 0.7) {
      const xi = ((Math.floor(x + dx * t + curve * t * t) % S) + S) % S, yi = ((Math.floor(y + dy * t) % S) + S) % S;
      const i = yi * S + xi;
      if (buf[i] < strength) buf[i] = strength;
    }
  }
}

// ------------------------------------------------------------------------------------------------ fields
// Whole-texture noise fields with per-column tables: ~10× faster than per-texel closures (1024² budget, AD §4.6).

/** fbm value noise over an S × S tile; base lattice px × py doubles per octave. Values ≈ [0, 1]. */
function field(S, seed, px, py, octaves = 1, gain = 0.5) {
  const out = new Float32Array(S * S);
  const xi0 = new Int32Array(S), xi1 = new Int32Array(S), ux = new Float32Array(S);
  let amp = 1, sum = 0;
  for (let o = 0; o < octaves; o++) {
    const P = px << o, Q = py << o, r = mulberry32(seed + o * 101), lat = new Float32Array(P * Q);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let x = 0; x < S; x++) {
      const f = (x + 0.5) / S * P, i = Math.floor(f), t = f - i;
      xi0[x] = i % P; xi1[x] = (i + 1) % P; ux[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < S; y++) {
      const f = (y + 0.5) / S * Q, j = Math.floor(f), t = f - j, vy = t * t * (3 - 2 * t);
      const r0 = (j % Q) * P, r1 = ((j + 1) % Q) * P, row = y * S;
      for (let x = 0; x < S; x++) {
        const A = lat[r0 + xi0[x]], B = lat[r0 + xi1[x]], C = lat[r1 + xi0[x]], D = lat[r1 + xi1[x]], u = ux[x];
        out[row + x] += amp * (A + (B - A) * u + (C - A) * vy + (A - B - C + D) * u * vy);
      }
    }
    sum += amp; amp *= gain;
  }
  const k = 1 / sum;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
/** Periodic Worley over an S × S tile with cx × cy cells: f1, f2 and nearest-cell id per texel. */
function worleyField(S, seed, cx, cy = cx) {
  const r = mulberry32(seed), pts = new Float32Array(cx * cy * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  const F1 = new Float32Array(S * S), F2 = new Float32Array(S * S), ID = new Int32Array(S * S);
  const wx = new Int32Array(cx + 2), wy = new Int32Array(cy + 2);
  for (let i = -1; i <= cx; i++) wx[i + 1] = ((i % cx) + cx) % cx;
  for (let j = -1; j <= cy; j++) wy[j + 1] = ((j % cy) + cy) % cy;
  for (let y = 0; y < S; y++) {
    const fy = (y + 0.5) / S * cy, yi = Math.floor(fy);
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) / S * cx, xi = Math.floor(fx);
      let f1 = 9, f2 = 9, id = 0;
      for (let j = -1; j <= 1; j++) {
        const rowc = wy[yi + j + 1] * cx;
        for (let i = -1; i <= 1; i++) {
          const k = rowc + wx[xi + i + 1];
          const dx = xi + i + pts[k * 2] - fx, dy = yi + j + pts[k * 2 + 1] - fy;
          const d = dx * dx + dy * dy;
          if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
        }
      }
      const i = y * S + x;
      F1[i] = Math.sqrt(f1); F2[i] = Math.sqrt(f2); ID[i] = id;
    }
  }
  return { f1: F1, f2: F2, id: ID };
}
function packArr(S, fn) {
  const data = new Uint8Array(S * S * 4), o = [0, 0, 0, 0];
  for (let i = 0, j = 0; i < S * S; i++, j += 4) {
    fn(i, o);
    data[j] = clamp01(o[0]) * 255 + 0.5; data[j + 1] = clamp01(o[1]) * 255 + 0.5;
    data[j + 2] = clamp01(o[2]) * 255 + 0.5; data[j + 3] = clamp01(o[3]) * 255 + 0.5;
  }
  return { data, w: S, h: S };
}
/** id → [0,1) hash table for Worley cell ids */
function idHash(n, salt) { const t = new Float32Array(n); for (let i = 0; i < n; i++) t[i] = hash1(i * 7919 + salt); return t; }

// ------------------------------------------------------------------------------------------------ surface maps
export function genGrain(S, style = 'grit', seed = 11) {
  if (style === 'snow') {
    // wind sastrugi (noise stretched 6:1 along the wind, x), sparse glassy ice pebbles
    const a = field(S, seed, 2, 12, 4, 0.55), b = field(S, seed + 7, 8, 8, 3, 0.5), wr = worleyField(S, seed + 3, 20), hs = idHash(400, seed);
    return packArr(S, (i, o) => {
      const s = a[i], f = b[i], ridge = sstep(0.42, 0.7, s);
      const peb = sstep(0.3, 0.12, wr.f1[i]) * (hs[wr.id[i]] > 0.82 ? 1 : 0);
      o[0] = 0.5 + (s - 0.5) * 0.25 + (f - 0.5) * 0.12 - peb * 0.18;
      o[1] = 0.25 + ridge * 0.55 + (f - 0.5) * 0.2 + peb * 0.2;
      o[2] = 0.85 + ridge * 0.15 - peb * 0.1;
      o[3] = 0.72 + (f - 0.5) * 0.12 - peb * 0.5;
    });
  }
  if (style === 'ash') {
    const a = field(S, seed, 8, 8, 5, 0.55), wr = worleyField(S, seed + 2, 40), hs = idHash(1600, seed);
    return packArr(S, (i, o) => {
      const s = a[i], clump = sstep(0.28, 0.1, wr.f1[i]) * (hs[wr.id[i]] > 0.5 ? 1 : 0);
      o[0] = 0.5 + (s - 0.5) * 0.5 + clump * 0.12; o[1] = s * 0.6 + clump * 0.35; o[2] = 0.75 + s * 0.25; o[3] = 0.9 - clump * 0.1;
    });
  }
  // 'grit' (default): pebbles in some cells, dried-mud cracks along cell borders, two octaves of value noise
  const na = field(S, seed, 8, 8, 2, 0.5), nb = field(S, seed + 1, 32, 32, 2, 0.5), wr = worleyField(S, seed + 2, 24);
  const h1 = idHash(576, seed), h2 = idHash(576, seed + 7);
  return packArr(S, (i, o) => {
    const base = 0.6 * na[i] + 0.4 * nb[i];
    const pebble = sstep(0.34, 0.18, wr.f1[i]) * (h1[wr.id[i]] > 0.55 ? 1 : 0);
    const crack = sstep(0.04, 0.0, wr.f2[i] - wr.f1[i]) * 0.7;
    o[0] = 0.5 + (base - 0.5) * 0.6 + pebble * (h2[wr.id[i]] - 0.5) * 0.5 - crack * 0.3;
    o[1] = base * 0.55 + pebble * 0.45 - crack * 0.5;
    o[2] = 1 - crack * 0.8;
    o[3] = 0.82 - pebble * 0.25 + (base - 0.5) * 0.2;
  });
}

export function genRock(S, style = 'grit', seed = 21) {
  // strata bands (hard bands proud, thin dark lines at band edges) + vertical fractures (Worley, cells 1:3)
  const warp = field(S, seed, 4, 4, 3, 0.5), det = field(S, seed + 5, 16, 16, 3, 0.5), fr = worleyField(S, seed + 9, 10, 4);
  const bandsN = 7, snow = style === 'snow';
  const hardT = new Float32Array(bandsN), toneT = new Float32Array(bandsN);
  for (let b = 0; b < bandsN; b++) { hardT[b] = hash1(b + seed) > 0.45 ? 1 : 0; toneT[b] = hash1(b * 3 + 1 + seed); }
  return packArr(S, (i, o) => {
    const v = (Math.floor(i / S) + 0.5) / S, w = warp[i], d = det[i];
    const bp = v * bandsN + (w - 0.5) * 1.05;
    const bi = Math.floor(bp), bf = bp - bi, bm = ((bi % bandsN) + bandsN) % bandsN;
    const hard = hardT[bm], tone = toneT[bm];
    const edge = sstep(0.06, 0.0, bf) + sstep(0.94, 1.0, bf);
    const crack = sstep(0.05, 0.0, fr.f2[i] - fr.f1[i]);
    if (snow) {
      // rime-filled fractures and frosted ledges: cracks read pale, not dark
      o[0] = 0.5 + (tone - 0.5) * 0.25 + (d - 0.5) * 0.25 + crack * 0.25 + hard * 0.05;
      o[1] = 0.35 + hard * 0.3 + (d - 0.5) * 0.3 - crack * 0.25 - edge * 0.15;
      o[2] = 1 - crack * 0.3 - edge * 0.3;
      o[3] = 0.82 - crack * 0.3 + (d - 0.5) * 0.1;
    } else {
      o[0] = 0.5 + (tone - 0.5) * 0.35 + (d - 0.5) * 0.3 - edge * 0.25 - crack * 0.2;
      o[1] = 0.3 + hard * 0.35 + (d - 0.5) * 0.35 - crack * 0.45 - edge * 0.2;
      o[2] = 1 - crack * 0.85 - edge * 0.45;
      o[3] = 0.88 + (d - 0.5) * 0.12 - hard * 0.04;
    }
  });
}

export function genConcrete(S, seed = 31) {
  // one tile = 6 m: aggregate speckle, form-tie holes on a 1.2 m grid, pour lines every 3 m, water stains
  const n = field(S, seed, 16, 16, 3, 0.55), sp = field(S, seed + 3, Math.min(256, S / 4) | 0, Math.min(256, S / 4) | 0, 1);
  const stain = field(S, seed + 4, 6, 1, 3, 0.5), blot = field(S, seed + 8, 4, 4, 3, 0.5);
  return packArr(S, (i, o) => {
    const u = ((i % S) + 0.5) / S, v = (Math.floor(i / S) + 0.5) / S;
    const b = n[i], s = sp[i];
    const speck = s > 0.78 ? (s - 0.78) * 3 : 0, pit = s < 0.06 ? (0.06 - s) * 9 : 0;
    const gx = u * 5 - Math.floor(u * 5) - 0.5, gy = v * 5 - Math.floor(v * 5) - 0.5;
    const tie = sstep(0.05, 0.03, Math.sqrt(gx * gx + gy * gy));
    const pv = v * 2 - Math.floor(v * 2);
    const pour = sstep(0.015, 0.0, Math.min(pv, 1 - pv));
    const st = sstep(0.55, 0.85, stain[i]) * (0.4 + 0.6 * (1 - pv));
    const bl = sstep(0.5, 0.75, blot[i]);
    o[0] = 0.5 + (b - 0.5) * 0.35 + speck * 0.25 - pit * 0.2 - tie * 0.35 - pour * 0.25 - st * 0.25 - bl * 0.12;
    o[1] = 0.5 + (b - 0.5) * 0.3 - pit * 0.5 - tie * 0.6 - pour * 0.4;
    o[2] = 1 - tie * 0.9 - pour * 0.6 - pit * 0.5;
    o[3] = 0.9 + (b - 0.5) * 0.1 - st * 0.15;
  });
}

export function genMetal(S, seed = 41) {
  const brush = field(S, seed, 2, 96, 2, 0.5), patch = field(S, seed + 2, 4, 4, 4, 0.5);
  const sc = new Float32Array(S * S);
  scratches(sc, S, seed + 5, Math.round(220 * S / 1024) + 40, 0.01, 0.06, 1);
  return packArr(S, (i, o) => {
    const b = brush[i], p = patch[i], s = sc[i];
    o[0] = 0.5 + (b - 0.5) * 0.25 + (p - 0.5) * 0.25 + s * 0.15;
    o[1] = 0.5 + (b - 0.5) * 0.15 - s * 0.3;
    o[2] = 1 - s * 0.2;
    o[3] = 0.45 + (p - 0.5) * 0.4 + (b - 0.5) * 0.15 - s * 0.15;
  });
}

export function genGrime(S, seed = 51) {
  const bl = field(S, seed, 4, 4, 5, 0.55), streak = field(S, seed + 3, 8, 1, 4, 0.5), chip = field(S, seed + 6, 24, 24, 3, 0.55);
  const sc = new Float32Array(S * S);
  scratches(sc, S, seed + 9, Math.round(900 * S / 1024) + 60, 0.004, 0.03, 1);
  return packArr(S, (i, o) => { o[0] = sstep(0.45, 0.75, bl[i]); o[1] = sc[i]; o[2] = streak[i]; o[3] = chip[i]; });
}

export function genNoise(S, seed = 61) {
  const a = field(S, seed, 4, 4, 4, 0.5), b = field(S, seed + 20, 4, 4, 4, 0.5), c = field(S, seed + 40, 8, 8, 3, 0.5), d = field(S, seed + 60, 2, 2, 4, 0.55);
  return packArr(S, (i, o) => { o[0] = a[i]; o[1] = b[i]; o[2] = c[i]; o[3] = d[i]; });
}

/** The prototype's per-face panel texture (edge darkening plus an inset seam), grey, for UV-mapped props. */
export function genPanel(S, seed = 7) {
  const r = mulberry32(seed);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ex = Math.min(x, S - 1 - x) / S, ey = Math.min(y, S - 1 - y) / S, e = Math.min(ex, ey);
    let v = 0.78 + sstep(0, 0.06, e) * 0.22;
    if (Math.abs(e - 0.11) < 0.006) v *= 0.72;
    v *= 0.94 + r() * 0.06 - sstep(0.6, 1, y / S) * sstep(0.1, 0, ex) * 0.12;
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = clamp01(v) * 255; data[i + 3] = 255;
  }
  return { data, w: S, h: S };
}

// ------------------------------------------------------------------------------------------------ sprite atlases
/** additive atlas, 4 × 2 cells: R intensity, G hot core / detail */
export function genSparkAtlas(cw, seed = 71) {
  const w = cw * 4, h = cw * 2, data = new Uint8Array(w * h * 4);
  const puff = fbmTile(seed, 4, 4, 4, 0.55);
  for (let cell = 0; cell < 8; cell++) {
    const ox = (cell % 4) * cw, oy = Math.floor(cell / 4) * cw;
    for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) {
      const u = (x + 0.5) / cw - 0.5, v = (y + 0.5) / cw - 0.5, r = Math.sqrt(u * u + v * v) * 2;
      let I = 0, G = 0;
      switch (cell) {
        case 0: { const a = sstep(1, 0, r); I = a * a; G = a; break; }                                   // soft dot
        case 1: { const a = Math.exp(-(u * u) / 0.0035) * sstep(0.5, 0.2, Math.abs(v)); I = a; G = a * a; break; }   // streak
        case 2: { const core = Math.exp(-r * r * 30), rays = Math.exp(-Math.abs(u) * 34) * Math.exp(-v * v * 9) + Math.exp(-Math.abs(v) * 34) * Math.exp(-u * u * 9);
                  I = Math.min(1, core + rays * 0.8 + Math.exp(-r * r * 4) * 0.25) * sstep(1, 0.7, r); G = core; break; }   // flare
        case 3: { const n = puff((u + 0.5) * 0.5 + 0.13, (v + 0.5) * 0.5 + 0.41); const m = sstep(1, 0.25, r + (n - 0.5) * 0.7);
                  I = m * (0.55 + 0.45 * n); G = sstep(0.75, 0.0, r) * (0.6 + 0.4 * n); break; }        // fireball
        case 4: { const d = (r - 0.78) / 0.09; I = Math.exp(-d * d) * sstep(1, 0.95, r); G = I; break; }    // ring
        case 5: { const dia = Math.abs(u) * 1.6 + Math.abs(v) * 0.9; I = sstep(0.5, 0.0, dia) ** 2 + Math.exp(-r * r * 60) * 0.6; I = Math.min(1, I); G = I; break; }  // shard glint
        case 6: { const a = sstep(0.7, 0, r); I = a * a * a; G = a; break; }                              // ember
        case 7: { const a = Math.exp(-r * r * 9); I = a; G = a * a; break; }                              // tight hot dot
      }
      const i = ((oy + y) * w + ox + x) * 4;
      data[i] = clamp01(I) * 255; data[i + 1] = clamp01(G) * 255; data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

/** alpha atlas, 4 × 2 cells: RG sprite-space normal (0..1), B detail, A density */
export function genSmokeAtlas(cw, seed = 81) {
  const w = cw * 4, h = cw * 2, data = new Uint8Array(w * h * 4);
  const nA = fbmTile(seed, 3, 3, 5, 0.55), nB = fbmTile(seed + 50, 3, 3, 5, 0.55), nC = fbmTile(seed + 90, 6, 6, 4, 0.6);
  const hgt = new Float32Array(cw * cw), den = new Float32Array(cw * cw), det = new Float32Array(cw * cw);
  for (let cell = 0; cell < 8; cell++) {
    const ox = (cell % 4) * cw, oy = Math.floor(cell / 4) * cw;
    for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) {
      const u = (x + 0.5) / cw - 0.5, v = (y + 0.5) / cw - 0.5, r = Math.sqrt(u * u + v * v) * 2;
      const k = y * cw + x;
      let D = 0, H = 0, B = 0.5;
      const s = cell * 0.37;
      switch (cell) {
        case 0: D = sstep(1, 0, r) ** 1.5; H = Math.sqrt(Math.max(0, 1 - r * r)); break;
        case 1: case 2: {
          const n = (cell === 1 ? nA : nB)((u + 0.5) * 0.5 + s, (v + 0.5) * 0.5 + s * 1.7);
          const n2 = nC((u + 0.5) + s, (v + 0.5) + s);
          const rr = r + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.25;
          D = sstep(1.0, 0.45, rr) * (0.75 + 0.25 * n2);
          H = Math.sqrt(Math.max(0, 1 - Math.min(1, rr * rr))) * (0.6 + 0.6 * n);
          B = n2; break;
        }
        case 3: {   // wisp: stretched, thin
          const n = nA((u + 0.5) * 0.4 + 0.7, (v + 0.5) * 1.2 + 0.2);
          const rr = Math.sqrt(u * u * 4 + v * v * 0.9) * 2 + (n - 0.5) * 0.8;
          D = sstep(1, 0.3, rr) * 0.8; H = Math.sqrt(Math.max(0, 1 - Math.min(1, rr * rr))); B = n; break;
        }
        case 4: { const d = (r - 0.75) / 0.12; D = Math.exp(-d * d) * sstep(1, 0.92, r); H = 0.5; break; }
        case 5: {   // dust clump: granular
          const n = nC((u + 0.5) * 2 + 0.3, (v + 0.5) * 2 + 0.9), n2 = nB((u + 0.5) + 0.2, (v + 0.5) + 0.6);
          const rr = r + (n2 - 0.5) * 0.7;
          D = sstep(1, 0.35, rr) * (0.55 + 0.45 * sstep(0.3, 0.7, n)); H = Math.sqrt(Math.max(0, 1 - Math.min(1, rr * rr))) * (0.5 + n); B = n; break;
        }
        case 6: { const a = Math.atan2(v, u), rr = r * (1 + 0.35 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 5)); D = sstep(0.75, 0.6, rr); H = 1 - rr; B = 0.3; break; }   // chip
        case 7: D = sstep(0.8, 0.55, r); H = Math.sqrt(Math.max(0, 1 - r * r)); break;   // flake
      }
      den[k] = clamp01(D); hgt[k] = H; det[k] = B;
    }
    for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      const hx = hgt[y * cw + Math.min(cw - 1, x + 1)] - hgt[y * cw + Math.max(0, x - 1)];
      const hy = hgt[Math.min(cw - 1, y + 1) * cw + x] - hgt[Math.max(0, y - 1) * cw + x];
      let nx = -hx * cw * 0.12, ny = -hy * cw * 0.12;
      const l = Math.sqrt(nx * nx + ny * ny + 1); nx /= l; ny /= l;
      const i = ((oy + y) * w + ox + x) * 4;
      data[i] = clamp01(nx * 0.5 + 0.5) * 255; data[i + 1] = clamp01(ny * 0.5 + 0.5) * 255;
      data[i + 2] = clamp01(det[k]) * 255; data[i + 3] = den[k] * 255;
    }
  }
  return { data, w, h };
}

/** decal atlas, 2 × 2 cells (sRGB colour + alpha): scorch, crater, hole, frost */
export function genDecalAtlas(cw, seed = 91) {
  const w = cw * 2, h = cw * 2, data = new Uint8Array(w * h * 4);
  const n = fbmTile(seed, 6, 6, 5, 0.55), n2 = fbmTile(seed + 30, 16, 16, 3, 0.5);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * cw, oy = Math.floor(cell / 2) * cw;
    for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) {
      const u = (x + 0.5) / cw - 0.5, v = (y + 0.5) / cw - 0.5, r = Math.sqrt(u * u + v * v) * 2, a = Math.atan2(v, u);
      const nn = n((u + 0.5) * 0.5 + cell * 0.25, (v + 0.5) * 0.5 + cell * 0.13), fine = n2(u + 0.5, v + 0.5);
      let R = 0, G = 0, B = 0, A = 0;
      if (cell === 0) {          // scorch: soot blotch with streaks radiating out
        const spokes = 0.5 + 0.5 * Math.sin(a * 9 + nn * 6) * Math.sin(a * 4 - 1.3);
        const rr = r + (nn - 0.5) * 0.6 - spokes * 0.18 * sstep(0.3, 0.9, r);
        A = sstep(1.0, 0.25, rr) * (0.75 + 0.25 * fine);
        const c = 0.05 + 0.08 * sstep(0.2, 0.9, rr) + fine * 0.03;
        R = c * 1.1; G = c * 0.95; B = c * 0.85;
      } else if (cell === 1) {   // crater: dark centre, raised pale rim, ejecta spokes
        const rr = r + (nn - 0.5) * 0.25;
        const pit = sstep(0.55, 0.1, rr), rim = Math.exp(-(((rr - 0.62) / 0.12) ** 2));
        const ej = sstep(1.0, 0.6, rr) * (0.5 + 0.5 * Math.sin(a * 13 + nn * 9)) * sstep(0.55, 0.75, rr);
        A = Math.min(1, pit * 0.95 + rim * 0.7 + ej * 0.5) * sstep(1, 0.85, rr);
        const c = 0.06 + rim * 0.25 + ej * 0.12 + fine * 0.05;
        R = c; G = c * 0.92; B = c * 0.84;
      } else if (cell === 2) {   // bullet hole: dark centre, burnt ring
        const rr = r + (nn - 0.5) * 0.3;
        A = Math.min(1, sstep(0.35, 0.2, rr) + sstep(0.9, 0.35, rr) * 0.6);
        const c = sstep(0.2, 0.45, rr) * 0.12 + 0.02;
        R = c * 1.1; G = c; B = c * 0.9;
      } else {                   // frost: pale crystalline patch
        const cr = Math.abs(Math.sin(a * 6 + nn * 4)) * Math.abs(Math.sin(r * 18 + fine * 6));
        A = sstep(1, 0.3, r + (nn - 0.5) * 0.5) * (0.35 + 0.4 * cr);
        R = 0.85; G = 0.92; B = 1.0;
      }
      const i = ((oy + y) * w + ox + x) * 4;
      data[i] = clamp01(R) * 255; data[i + 1] = clamp01(G) * 255; data[i + 2] = clamp01(B) * 255; data[i + 3] = clamp01(A) * 255;
    }
  }
  return { data, w, h };
}
