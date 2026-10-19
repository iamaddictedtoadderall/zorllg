// levels/level02/reeds.js — the reed field (L2 §11.4, AD §3.11): the level's dominant visual and a gameplay read: a
// stalking land-yacht shows as a travelling V in the reeds before its sail does.
//
// Registers the scatter prop 'reed_clump' (three seeded variants, 'reed_clump#0..2') at import, through the engine's
// registerProp (arch Appendix C.2): two crossed alpha-tested quads, 1.6 × 2.6 m, a canvas texture of about 20 stalks
// with seed heads (root #5a3a1e to tip #e0a85a), per-instance tint from the scatter. The material is AD §3.11's reed
// shader: a travelling gust wave plus up to eight pushers (the player, moving yachts, Skimmers, Tick, the nearest rigs)
// that bend the reeds away from them. The level runtime fills the pushers each frame with setPushers().
import * as THREE from 'three';
import { registerProp } from '../../src/world/scatter.js';

export const MAX_PUSHERS = 8;
/** shared uniforms (one reed program for every variant) */
export const REED_U = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(5, 1.5) },
  uPush: { value: Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector4(0, 0, 0, 0)) },
};

/** the pushers for this frame: [{ x, z, r, k }] (at most eight, nearest first); the rest are cleared */
export function setPushers(list = [], time = 0, wind = null) {
  REED_U.uTime.value = time;
  if (wind) REED_U.uWind.value.set(wind[0] ?? 5, wind[1] ?? 1.5);
  const P = REED_U.uPush.value;
  for (let i = 0; i < MAX_PUSHERS; i++) {
    const p = list[i];
    if (p) P[i].set(p.x, p.z, p.r, p.k ?? 1); else P[i].set(0, 0, 0, 0);
  }
}

// ── the stalk texture (canvas, cached once) ───────────────────────────────────────────────────────────────────────
let TEX = null;
function reedTexture() {
  if (TEX) return TEX;
  const W = 256, H = 384;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  let seed = 9173;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const root = [0x6e, 0x4e, 0x28], tip = [0xec, 0xc0, 0x74];   // gold steppe reeds (L2 §1.1): darker roots, pale gold heads
  const mix = (t, k = 1) => `rgb(${Math.round((root[0] + (tip[0] - root[0]) * t) * k)},${Math.round((root[1] + (tip[1] - root[1]) * t) * k)},${Math.round((root[2] + (tip[2] - root[2]) * t) * k)})`;
  for (let i = 0; i < 22; i++) {
    const x0 = 20 + rnd() * (W - 40), lean = (rnd() - 0.5) * 60, h = H * (0.62 + rnd() * 0.36), w = 3 + rnd() * 2.5;
    const k = 0.8 + rnd() * 0.35;
    // the stalk: a tapering curved band, darker at the root
    const grad = g.createLinearGradient(0, H, 0, H - h);
    grad.addColorStop(0, mix(0, k)); grad.addColorStop(0.55, mix(0.6, k)); grad.addColorStop(1, mix(1, k));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0 - w / 2, H);
    g.quadraticCurveTo(x0 + lean * 0.3 - w * 0.3, H - h * 0.5, x0 + lean - 0.6, H - h);
    g.lineTo(x0 + lean + 0.6, H - h);
    g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.3, H - h * 0.5, x0 + w / 2, H);
    g.closePath(); g.fill();
    // a leaf or two curling off the stalk
    if (rnd() < 0.7) {
      const ly = H - h * (0.25 + rnd() * 0.3), lx = x0 + lean * ((H - ly) / h) * 0.3, dir = rnd() < 0.5 ? -1 : 1;
      g.fillStyle = mix(0.45, k * 0.95);
      g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo(lx + dir * 30, ly - 30, lx + dir * 44, ly - 10); g.quadraticCurveTo(lx + dir * 22, ly - 20, lx, ly - 6); g.fill();
    }
    // the seed head: an elongated plume at the tip, lighter, with a few hairs
    if (rnd() < 0.85) {
      const hx = x0 + lean, hy = H - h;
      g.fillStyle = mix(1, k * 1.08);
      g.beginPath(); g.ellipse(hx, hy + 14, 5 + rnd() * 2, 22 + rnd() * 8, lean * 0.004, 0, Math.PI * 2); g.fill();
      g.strokeStyle = mix(0.9, k * 1.12); g.lineWidth = 1.4;
      for (let j = 0; j < 5; j++) { g.beginPath(); g.moveTo(hx, hy + 6 + j * 6); g.lineTo(hx + (rnd() - 0.5) * 18, hy + j * 6 - 6); g.stroke(); }
    }
  }
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.wrapS = TEX.wrapT = THREE.ClampToEdgeWrapping;
  TEX.generateMipmaps = true; TEX.minFilter = THREE.LinearMipmapLinearFilter; TEX.anisotropy = 4;
  TEX.userData.shared = true;
  return TEX;
}

// ── geometry: two crossed quads, uv.y 0 at the root (three variants: rotation and lean of the cross) ───────────────
const GEO = new Map();
function reedGeo(v) {
  if (GEO.has(v)) return GEO.get(v);
  const w = 1.6, h = 2.6, P = [], U = [], N = [], I = [];
  const quad = (a, lean) => {
    const c = Math.cos(a), s = Math.sin(a), b = P.length / 3;
    const lx = Math.cos(a + 1.3) * lean, lz = Math.sin(a + 1.3) * lean;
    P.push(-c * w / 2, 0, -s * w / 2, c * w / 2, 0, s * w / 2, c * w / 2 + lx, h, s * w / 2 + lz, -c * w / 2 + lx, h, -s * w / 2 + lz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) N.push(0, 1, 0);    // up-facing normals: soft, even lighting on cards (no dark backfaces)
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const a0 = [0.2, 1.1, 2.0][v] ?? 0;
  quad(a0, [0.1, 0.25, -0.15][v] ?? 0);
  quad(a0 + Math.PI / 2, [-0.2, 0.05, 0.2][v] ?? 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.shared = true;
  GEO.set(v, g);
  return g;
}

// ── the reed material (AD §3.11), one per ctx, patched by the atmosphere for fog ──────────────────────────────────
const MATS = new WeakMap();
export function reedMaterial(ctx) {
  let m = MATS.get(ctx);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: reedTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
                                       envMapIntensity: 0.35, color: new THREE.Color('#e8d6b8') });
  m.name = 'l02-reeds';
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, REED_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec2 uWind; uniform vec4 uPush[${MAX_PUSHERS}];`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            mat4 im = instanceMatrix;
          #else
            mat4 im = mat4(1.0);
          #endif
          vec3 rootW = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 wd = normalize(uWind + 1e-4);
          float gust = 0.5 + 0.5 * sin(dot(rootW.xz, wd) * 0.045 - uTime * 1.7);
          gust *= gust * (0.6 + 0.4 * sin(rootW.x * 0.13 + rootW.z * 0.07));
          vec2 bend = wd * (0.25 + 0.9 * gust) * length(uWind) * 0.08;
          for (int k = 0; k < ${MAX_PUSHERS}; k++) {
            vec2 d = rootW.xz - uPush[k].xy;
            bend += normalize(d + 1e-3) * uPush[k].w * smoothstep(uPush[k].z, 0.0, length(d)) * 1.2;
          }
          float h = uv.y * uv.y;
          vec3 bendL = vec3(bend.x, 0.0, bend.y) * mat3(im);
          bendL /= max(1e-4, dot(im[0].xyz, im[0].xyz));
          transformed.xz += bendL.xz * h * 2.6;
          transformed.y -= dot(bendL.xz, bendL.xz) * h * 0.9;
        }`);
  };
  m.customProgramCacheKey = () => 'l02-reeds';
  if (ctx.atmosphere?.patchMaterial) m = ctx.atmosphere.patchMaterial(m) || m;
  MATS.set(ctx, m);
  return m;
}

function reedFactory(v) {
  return (ctx) => ({
    geometry: reedGeo(v), material: reedMaterial(ctx), castShadow: false, receiveShadow: true,
    radius: 0.8, height: 2.6, collider: null, maxInstances: undefined,
    align: 0.25, sink: 0.04, rock: false, cover: false, kind: 'reed',
  });
}
for (let v = 0; v < 3; v++) registerProp(`reed_clump#${v}`, reedFactory(v));
registerProp('reed_clump', reedFactory(0));
