// render/fx.js (P1): effect recipes (art direction §6), persistent emitters and ambient battle.
// Every effect is layered (flash, body, residue, mark, motion) and pooled: particles live in ctx.particles' ring
// buffers, flashes in its light pool, rings and beams in fixed mesh pools here. Nothing allocates per call.
// Spawn counts scale down with distance (§6.13), with the tier (explosions ×1 / ×0.7 / ×0.4), and when a particle
// system is over 80% full. Math.random() is fine here: effects are cosmetic (architecture §1.4).
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { FOG_PARS } from './glsl.js';

const TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// muzzle flashes (AD §6.3): [flash length m, colour, HDR k, sparks, light cd, light distance]
const MUZZLE = {
  rifle: [1.8, [1.0, 0.85, 0.63], 2.6, 3, 180, 12], mg: [1.2, [1.0, 0.89, 0.66], 2.2, 1, 140, 10],
  shotgun: [2.4, [1.0, 0.82, 0.63], 2.6, 8, 260, 14], cannon: [4.0, [1.0, 0.69, 0.44], 3.2, 6, 700, 22],
  plasma: [1.0, [1.0, 0.42, 0.23], 2.6, 0, 140, 10], turret: [1.4, [1.0, 0.48, 0.25], 2.6, 2, 140, 10],
  rail: [3.0, [0.75, 0.96, 1.0], 3.6, 4, 400, 18],
};
// impact surfaces (AD §6.5): dust colour and spark behaviour
const SURF = {
  ground: { dust: null, sparks: 0, chips: 6, chipCol: [0.18, 0.15, 0.12] },
  rock: { dust: 'rock', sparks: 2, chips: 6, chipCol: [0.2, 0.18, 0.16] },
  concrete: { dust: [0.5, 0.48, 0.45], sparks: 4, chips: 4, chipCol: [0.35, 0.34, 0.32] },
  metal: { dust: null, sparks: 12, chips: 0, chipCol: [0.3, 0.3, 0.3] },
  // L1's collider surfaces (A5.5 passes any string through): internal variants of the ground recipe, so ice and
  // snow hits throw pale powder and glassy chips instead of brown dirt (no new interface: AD §6.5's full set is deferred)
  ice: { dust: [0.78, 0.85, 0.92], sparks: 0, chips: 7, chipCol: [0.7, 0.8, 0.9] },
  snow: { dust: [0.88, 0.91, 0.95], sparks: 0, chips: 0, chipCol: [0.85, 0.88, 0.92] },
};
const EMITTERS = ['smoke', 'fire', 'sparks', 'steam', 'dustDevil'];
const AMBIENTS = ['battle', 'flak', 'lightning', 'searchlights', 'fires'];

export function install(ctx) {
  const P = () => ctx.particles;
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };
  const dustCol = new THREE.Color(0.45, 0.38, 0.33), rockCol = new THREE.Color(0.3, 0.26, 0.24);
  let dustKey = '', rockKey = '';
  function paletteColors() {
    const pal = ctx.atmosphere?.art?.palette;
    if (pal?.dust && pal.dust !== dustKey) { dustKey = pal.dust; dustCol.set(pal.dust); }
    if (pal?.rock && pal.rock !== rockKey) { rockKey = pal.rock; rockCol.set(pal.rock).lerp(dustCol, 0.35); }
  }
  /** count multiplier from camera distance, tier and particle load */
  function lod(pos, sys) {
    const cam = ctx.camera.position;
    const d = pos ? cam.distanceTo(pos) : 0;
    let k = d > 800 ? 0.15 : d > 300 ? 0.5 : 1;
    const load = sys?.load ? sys.load() : 0;
    if (load > 0.8) k *= Math.max(0.1, (1 - load) / 0.2);
    return k;
  }
  const tierK = () => (ctx.tier.name === 'high' ? 1 : ctx.tier.name === 'medium' ? 0.7 : 0.4);
  const groundAt = (x, z) => (ctx.world?.groundHeight ? ctx.world.groundHeight(x, z) : 0);

  // ---------------------------------------------------------------- pooled rings (shockwaves) and beams
  // shockwave: a flat disc whose shader draws a soft, bright leading band with a faint hazy trail inside it
  const ringGeo = new THREE.PlaneGeometry(2, 2, 1, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const RING_VS = `varying vec2 vP; varying vec3 vW;
    void main() { vP = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const RING_FS = `${FOG_PARS}
    uniform vec3 uCol; uniform float uK, uO;
    varying vec2 vP; varying vec3 vW;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      // a soft leading band (heat and dust pushed outward) that widens as it slows, and a faint haze inside it
      // the band sits well inside the quad's rim, so it fades to nothing before the disc's edge (no hard outline)
      float w = mix(0.05, 0.12, uK), c0 = 1.0 - 2.4 * w;
      float band = exp(-pow((r - c0) / w, 2.0)) * (0.7 + 0.3 * sin(atan(vP.y, vP.x) * 7.0 + r * 9.0));
      float trail = smoothstep(0.25, c0, r) * (1.0 - smoothstep(c0, c0 + w, r)) * 0.06;
      float a = (band + trail) * uO * (1.0 - smoothstep(0.9, 1.0, r)) * (1.0 - cFogAmount(vW) * 0.8);
      gl_FragColor = vec4(uCol * a, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const rings = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.ShaderMaterial({ uniforms: { ...(ctx.atmosphere?.fogUniforms || {}), uCol: { value: new THREE.Color() }, uK: { value: 0 }, uO: { value: 0 } },
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.userData.shared = true; m.userData.noAO = true;
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.userData.noAO = true; mesh.name = 'shockwave';
    ctx.scene.add(mesh);
    rings.push({ mesh, t: 0, dur: 1, r: 1, col: new THREE.Color(), alive: false });
  }
  let ringCursor = 0;
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beams = [];
  const BEAM_VS = `varying vec3 vN; varying vec3 vW; varying float vV;
    void main() { vV = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const BEAM_FS = `${FOG_PARS}
    uniform vec3 uCol; uniform float uK, uT, uLen;
    varying vec3 vN; varying vec3 vW; varying float vV;
    void main() {
      float e = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
      // soft muzzle end, a slight flare at the impact end; the beam dissipates from the muzzle forward as it fades,
      // with faint travelling ripples so it reads as energy rather than a tube
      float along = vV * uLen;
      float ends = smoothstep(0.0, 1.5, along) * (1.0 - smoothstep(uLen - 0.4, uLen, along) * 0.5);
      float decay = smoothstep(uT - 0.15, uT + 0.1, vV);
      float rip = 0.8 + 0.2 * sin(along * 1.7 - uT * 40.0);
      vec3 c = uCol * (pow(e, 2.0) * 0.35 + pow(e, 14.0) * 2.2 * rip) + vec3(1.0) * pow(e, 40.0) * 1.6;
      gl_FragColor = vec4(c * uK * ends * decay * (1.0 - cFogAmount(vW) * 0.7), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.ShaderMaterial({ uniforms: { ...(ctx.atmosphere?.fogUniforms || {}), uCol: { value: new THREE.Color() }, uK: { value: 0 }, uT: { value: 0 }, uLen: { value: 1 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.userData.shared = true;
    const g = new THREE.Group();
    const a = new THREE.Mesh(beamGeo, mat);
    a.frustumCulled = false; a.userData.noAO = true; a.renderOrder = 6;
    g.add(a); g.visible = false; g.name = 'beam';
    ctx.scene.add(g);
    beams.push({ g, a, mat, t: 0, dur: 0.15, w: 0.6, col: new THREE.Color(), alive: false });
  }
  let beamCursor = 0;

  // ---------------------------------------------------------------- delayed cosmetic spawns (fixed pool)
  const delayed = [];
  for (let i = 0; i < 64; i++) delayed.push({ t: -1, fn: null, pos: new THREE.Vector3(), a: 0 });
  function later(sec, fn, pos, a = 0) {
    for (const d of delayed) if (d.t < 0) { d.t = sec; d.fn = fn; d.pos.copy(pos); d.a = a; return; }
  }

  // ---------------------------------------------------------------- recipes
  function sparks(pos, n = 10, color = [1, 0.7, 0.3], speed = 25) {
    const add = P()?.add; if (!add || !pos) return;
    n = Math.round(n * lod(pos, add));
    const [r, g, b] = color || [1, 0.7, 0.3];
    for (let i = 0; i < n; i++) {
      add.spawn(pos.x, pos.y, pos.z, R(-1, 1) * speed, R(-0.3, 1.2) * speed, R(-1, 1) * speed, R(0.15, 0.45), R(0.12, 0.3), 0.04,
                r * 2.6, g * 2.2, b * 1.8, 1, 3, 30, 1);   // HDR but hue-keeping: hot sparks read orange-yellow, not white
    }
  }
  function dust(pos, n = 12, spread = 6, color) {
    const sm = P()?.smoke; if (!sm || !pos) return;
    paletteColors();
    n = Math.round(n * lod(pos, sm));
    const cr = color ? color[0] : dustCol.r, cg = color ? color[1] : dustCol.g, cb = color ? color[2] : dustCol.b;
    for (let i = 0; i < n; i++) {
      const s = R(0.85, 1.15);
      sm.spawn(pos.x + R(-spread, spread), pos.y + R(0, 1.5), pos.z + R(-spread, spread), R(-6, 6), R(1, 5), R(-6, 6),
               R(1.2, 2.4), R(2.3, 4.5), R(7, 12.5), cr * s, cg * s, cb * s, 0.45, 1.5, -0.5, Math.random() < 0.65 ? 5 : 1);
    }
  }
  /** a rising, widening smoke column: lobed billows of mixed size and speed (never one round blob), the lower ones
   *  denser and darker, the high ones thinner, drifting with the wind */
  function smokePuff(pos, scale, n, dark = 0.12) {
    const sm = P()?.smoke; if (!sm) return;
    const sq = Math.sqrt(scale), wx = windX(), wz = windZ();
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;                  // 0 = low, slow and dense … 1 = high, fast and thin
      const g = dark * R(0.85, 1.3) * (1 + 0.35 * t);
      const big = R(0.75, 1.25);
      sm.spawn(pos.x + R(-1.8, 1.8) * scale, pos.y + (R(-0.3, 1.2) + t * 2.2) * scale, pos.z + R(-1.8, 1.8) * scale,
               R(-3.5, 3.5) * scale + wx, (2 + 9 * t * R(0.7, 1.2)) * sq, R(-3.5, 3.5) * scale + wz,
               R(2.6, 4.6), R(2.5, 4.5) * scale * big, R(9, 15) * scale * big, g, g * 0.95, g * 0.9,
               R(0.62, 0.82) * (1 - 0.25 * t), 1.1, -1.2, Math.random() < 0.5 ? 1 : 2);
    }
  }
  function explosion(pos, scale = 1, o = {}) {
    if (!pos) return;
    o = o || {};
    scale = Math.max(0.05, +scale || 1);
    const ps = P(), add = ps?.add, sm = ps?.smoke;
    const k = lod(pos, add) * tierK(), s = scale, sq = Math.sqrt(s);
    const d = pos.distanceTo(ctx.camera.position);
    paletteColors();
    // flash: pooled light plus a hot core sprite
    ps?.lights?.flash(pos, 0xff9a52, 2000 * s, 45 * sq + 15, 0.45);
    if (add) {
      // flash: a short white-yellow core and a star flare, gone before the fireball peaks
      add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.13, 4 * s, 11 * s, 1.5, 1.1, 0.62, 1, 0, 0, 7);
      add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.07, 7 * s, 12 * s, 0.9, 0.7, 0.45, 1, 0, 0, 2);
      // a soft additive heat glow under the fireball body (it carries the bloom; the body itself is opaque fire)
      const ng = Math.max(1, Math.round(3 * k));
      for (let i = 0; i < ng; i++) {
        add.spawn(pos.x + R(-1, 1) * s, pos.y + R(0, 1.2) * s, pos.z + R(-1, 1) * s, 0, R(1, 3), 0, R(0.35, 0.5), 5 * s, 10 * s,
                  0.34, 0.15, 0.045, 1, 1.5, 0, 3);
      }
    }
    if (sm) {
      // lit smoke: dark billows rising and growing; a second, higher puff for big blasts. Spawned before the fire
      // billows so the opaque fire draws over the smoke it turns into (the alpha pool draws in spawn order)
      smokePuff(pos, s, Math.max(4, Math.round(12 * s * k)), 0.08);
      if (s >= 2) later(1.0, (p, a) => smokePuff(_v2.set(p.x, p.y + 6 * a, p.z), a, Math.max(2, Math.round(6 * a * tierK())), 0.07), pos, s);
      // dust ring: palette dust billows rushing outward low to the ground (not on Low)
      if (ctx.tier.name !== 'low') {
        const gy = groundAt(pos.x, pos.z);
        if (pos.y - gy < 6 * s) {
          // big, thin, overlapping billows so the ring reads as one rolling wall of dust, not a row of dust balls
          const nd = Math.round(20 * k);
          for (let i = 0; i < nd; i++) {
            const a = (i / Math.max(1, nd)) * TAU + R(-0.2, 0.2), sp = 25 * s * R(0.75, 1.15);
            sm.spawn(pos.x + Math.cos(a) * s, gy + 0.8 * s, pos.z + Math.sin(a) * s, Math.cos(a) * sp, R(0.5, 2), Math.sin(a) * sp,
                     R(1.3, 2.4), 2.6 * s, 9.5 * s, dustCol.r, dustCol.g, dustCol.b, 0.4, 3, -0.3, Math.random() < 0.6 ? 5 : 1);
          }
        }
      }
    }
    if (sm) {
      // fireball body (AD §6.6): opaque, emissive fire billows (alpha cell 7) inside a sphere of radius 2s, expanding
      // 3s → 9s over ~0.6 s. Each billow shows a hot core, an orange body and a deep red rim, and burns down to soot
      // (the shader), so the fireball reads as rolling fire with structure rather than an additive bloom blob. A few
      // slower billows roll upward into the smoke column.
      const nf = Math.max(5, Math.round(R(10, 14) * k));
      for (let i = 0; i < nf; i++) {
        _v.set(R(-1, 1), R(-0.25, 1), R(-1, 1)).normalize();
        const sp = R(5, 13) * sq, rr = 2 * s * Math.sqrt(Math.random()), hot = R(0.9, 1.15);
        sm.spawn(pos.x + _v.x * rr, pos.y + Math.abs(_v.y) * rr * 0.8, pos.z + _v.z * rr,
                 _v.x * sp, _v.y * sp + 3, _v.z * sp, R(0.75, 1.15), 3 * s * R(0.8, 1.2), 9 * s * R(0.85, 1.15),
                 hot, hot, hot, 1, 3.2, -3, 7);
      }
      const nr = Math.max(2, Math.round(5 * k));
      for (let i = 0; i < nr; i++) {
        const a = Math.random() * TAU, rr = R(0.5, 1.5) * s;
        sm.spawn(pos.x + Math.cos(a) * rr, pos.y + R(1, 2.5) * s, pos.z + Math.sin(a) * rr, Math.cos(a) * R(1, 3) * sq, R(5, 9) * sq, Math.sin(a) * R(1, 3) * sq,
                 R(1.3, 1.9), 3.5 * s, 8 * s, 0.85, 0.8, 0.8, 1, 1.4, -2, 7);
      }
    }
    if (add) {
      // sparks: 30s streaks, speed 40√s
      const ns = Math.round(30 * s * k);
      for (let i = 0; i < ns; i++) {
        _v.set(R(-1, 1), R(-0.2, 1.2), R(-1, 1)).normalize().multiplyScalar(40 * sq * R(0.4, 1));
        add.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.3, 0.8), R(0.15, 0.35), 0.05, 2.2, 1.1, 0.4, 1, 2, 30, 1);
      }
      // embers rising slowly
      const ne = Math.round(20 * s * k);
      for (let i = 0; i < ne; i++) {
        add.spawn(pos.x + R(-2, 2) * s, pos.y + R(0, 2) * s, pos.z + R(-2, 2) * s, R(-3, 3), R(2, 6), R(-3, 3), R(1.5, 3), R(0.15, 0.3), 0.05,
                  2.4, 0.9, 0.22, 1, 0.8, -1.5, 6);
      }
    }
    shockwave(_v3.set(pos.x, Math.max(pos.y - 0.5, groundAt(pos.x, pos.z) + 0.3), pos.z), 14 * s, '#ffa860', 0.35);
    const nDeb = o.debris != null ? o.debris : Math.round(R(6, 12) * s * (d > 300 ? 0 : 1) * tierK());
    if (nDeb > 0) ps?.debris?.spawn(pos, nDeb, 0.6 * sq, o.debrisMaterial, sq);
    if (o.decal !== false) {
      const gy = groundAt(pos.x, pos.z);
      if (pos.y - gy < 4 + 2 * s) {
        _v3.set(pos.x, gy, pos.z);
        ps?.decals?.spawn(_v3, ctx.world?.normalAt ? ctx.world.normalAt(pos.x, pos.z, _n) : _n.set(0, 1, 0), 4 * s, 'scorch');
        if (s >= 1.5) ps?.decals?.spawn(_v3, _n, 2.2 * s, 'crater');
      }
    }
    if (o.shake !== false) ctx.cameraRig?.addShake?.(clamp(scale * 2.2 - d / 60, 0, 2.2));
    if (!o.quiet) ctx.audio?.play?.(scale > 1.5 ? 'boom' : 'explode', pos);
    ctx.events.emit('fx:explosion', { pos: pos.clone(), scale });
  }
  function muzzle(pos, dir, kind = 'rifle') {
    const add = P()?.add; if (!add || !pos) return;
    let M = MUZZLE[kind];
    if (!M) { warnOnce('muzzle:' + kind, '[fx] unknown muzzle kind', kind); M = MUZZLE.rifle; }
    const [len, col, kk, nsp, cd, ld] = M;
    const dx = dir?.x ?? 0, dy = dir?.y ?? 0, dz = dir?.z ?? -1;
    const j = R(0.85, 1.15);
    // the flash (AD §6.3): a small white-hot core, a coloured body (the kind's hue, kept saturated so player rounds
    // read warm, enemy plasma red-orange and the rail cyan) and a streak (or a fan for the shotgun) along the barrel
    const v = len / 0.045, ck = kk * 0.55;
    add.spawn(pos.x + dx * len * 0.1, pos.y + dy * len * 0.1, pos.z + dz * len * 0.1, 0, 0, 0, 0.05, len * 0.22 * j, len * 0.3 * j,
              0.45 + col[0] * 1.5, 0.45 + col[1] * 1.5, 0.45 + col[2] * 1.5, 1, 0, 0, 7);   // hot but hue-keeping core
    if (kind === 'plasma') {   // a soft orb, no petals
      add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.08, len * 0.7 * j, len * 1.0 * j, col[0] * ck, col[1] * ck, col[2] * ck, 1, 0, 0, 0);
    } else {                   // a ragged burst (the noisy fireball cell, gone in two frames) pushed out of the barrel
      add.spawn(pos.x + dx * len * 0.25, pos.y + dy * len * 0.25, pos.z + dz * len * 0.25, dx * v * 0.15, dy * v * 0.15, dz * v * 0.15, 0.05,
                len * 0.45 * j, len * 0.6 * j, col[0] * ck, col[1] * ck * 0.9, col[2] * ck * 0.8, 1, 0, 0, 3);
    }
    // the main tongue along the barrel, plus two short side petals (a fan of three for the shotgun)
    const fan = kind === 'shotgun' ? 3 : kind === 'plasma' ? 1 : 3;
    for (let f = 0; f < fan; f++) {
      const side = fan > 1 ? f - 1 : 0, main = side === 0 || kind === 'shotgun';
      const sx = side * (kind === 'shotgun' ? 0.22 : R(0.35, 0.6)), sy = R(-0.08, 0.08);
      const ex = dx + sx * dz, ey = dy + sy, ez = dz - sx * dx, kl = main ? 1 : 0.45;
      add.spawn(pos.x + ex * len * 0.3 * kl, pos.y + ey * len * 0.3 * kl, pos.z + ez * len * 0.3 * kl, ex * v * kl, ey * v * kl, ez * v * kl, 0.045,
                len * 0.32 * kl, len * 0.22 * kl, col[0] * kk * 0.8, col[1] * kk * 0.72, col[2] * kk * 0.6, 1, 0, 0, 1);
    }
    for (let i = 0; i < nsp; i++) {
      const sp = R(15, 40);
      add.spawn(pos.x, pos.y, pos.z, dx * sp + R(-6, 6), dy * sp + R(-4, 6), dz * sp + R(-6, 6), R(0.08, 0.2), 0.12, 0.03,
                col[0] * 3, col[1] * 2.5, col[2] * 1.8, 1, 4, 20, 1);
    }
    if (kind !== 'mg' || Math.random() < 0.34) P()?.lights?.flash(pos, kind === 'rail' ? 0xbff4ff : kind === 'plasma' || kind === 'turret' ? 0xff7a40 : 0xffc890, cd, ld, 0.05);
    if (kind === 'cannon' || kind === 'shotgun') {
      const sm = P()?.smoke;
      if (sm) for (let i = 0; i < (kind === 'cannon' ? 4 : 2); i++) {
        sm.spawn(pos.x + dx * 1.5, pos.y + dy * 1.5, pos.z + dz * 1.5, dx * R(4, 9) + R(-2, 2), R(0.5, 2), dz * R(4, 9) + R(-2, 2),
                 R(0.8, 1.5), 0.8, R(2.5, 4), 0.5, 0.48, 0.45, 0.35, 2.5, -0.3, 1);
      }
      if (kind === 'cannon' && pos.y - groundAt(pos.x, pos.z) < 4) dust(_v.set(pos.x, groundAt(pos.x, pos.z), pos.z), 6, 3);
    }
    if (kind === 'rail') { shockwave(pos, 2.5, '#bff4ff', 0.18); add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, len * 0.4, len * 0.9, 0.5, 1.4, 1.8, 1, 0, 0, 4); }
    if (kind === 'cannon') add.spawn(pos.x + dx * len * 0.4, pos.y + dy * len * 0.4, pos.z + dz * len * 0.4, dx * 8, dy * 8, dz * 8, 0.1, len * 0.4, len * 0.8,
                                     1.2, 0.55, 0.2, 1, 2, 0, 3);
  }
  function impact(pos, normal, kind = 'bullet', surface = 'ground') {
    if (!pos) return;
    const ps = P(), add = ps?.add, sm = ps?.smoke;
    let S = SURF[surface];
    if (!S) { warnOnce('surf:' + surface, '[fx] unknown impact surface', surface); S = SURF.ground; surface = 'ground'; }
    paletteColors();
    const n = normal && normal.lengthSq() > 1e-6 ? _n.copy(normal).normalize() : _n.set(0, 1, 0);
    const k = lod(pos, add);
    const heavy = kind === 'shell' || kind === 'blade';
    const mult = heavy ? 3 : 1;
    if (kind === 'plasma') {
      if (add) {
        add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.14, 0.6, 1.3, 1.3, 0.36, 0.13, 1, 0, 0, 0);
        add.spawn(pos.x + n.x * 0.2, pos.y + n.y * 0.2, pos.z + n.z * 0.2, n.x * 2, n.y * 2, n.z * 2, 0.3, 0.6, 1.6, 0.8, 0.22, 0.08, 0.8, 2, -1, 3);
        for (let i = 0; i < Math.round(10 * k); i++) {
          _v.copy(n).multiplyScalar(R(6, 18)).add(_v2.set(R(-8, 8), R(-4, 8), R(-8, 8)));
          add.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.2, 0.5), 0.25, 0.05, 3, 1.1, 0.4, 1, 2, 20, 1);
        }
      }
      ps?.lights?.flash(pos, 0xff6a3a, 160, 10, 0.12);
    } else if (kind === 'rail') {
      if (add) {
        add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.18, 1.6, 3.0, 0.8, 1.5, 1.9, 1, 0, 0, 2);
        for (let i = 0; i < Math.round(20 * k); i++) {
          _v.copy(n).multiplyScalar(R(10, 40)).add(_v2.set(R(-12, 12), R(-6, 12), R(-12, 12)));
          add.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.2, 0.6), 0.3, 0.05, 1.8, 3.2, 4, 1, 2, 25, 1);
        }
      }
      ps?.lights?.flash(pos, 0xbff4ff, 400, 18, 0.15);
    }
    // surface response
    if (add && S.sparks) {
      const ns = Math.round(S.sparks * mult * k * (kind === 'blade' ? 3 : 1));
      for (let i = 0; i < ns; i++) {
        _v.copy(n).multiplyScalar(R(8, 30)).add(_v2.set(R(-10, 10), R(-4, 10), R(-10, 10)));
        add.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.12, 0.4), R(0.12, 0.26), 0.04, 2.4, 1.2, 0.42, 1, 3, 30, 1);
      }
      if (surface === 'metal') add.spawn(pos.x + n.x * 0.1, pos.y + n.y * 0.1, pos.z + n.z * 0.1, 0, 0, 0, 0.07, 0.6 * mult, 0.9 * mult, 2.2, 1.8, 1.3, 1, 0, 0, 2);
    }
    if (sm) {
      const col = S.dust === 'rock' ? rockCol : S.dust ? _c.setRGB(S.dust[0], S.dust[1], S.dust[2]) : dustCol;
      const nd = Math.round((surface === 'metal' ? 1 : 5) * mult * k);
      for (let i = 0; i < nd; i++) {
        _v.copy(n).multiplyScalar(R(1.5, 5)).add(_v2.set(R(-1.5, 1.5), R(0, 2), R(-1.5, 1.5)));
        sm.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.6, 1.4), 0.4 * mult, R(1.5, 3) * mult, col.r, col.g, col.b, 0.6, 2.5, -0.2, surface === 'metal' ? 3 : 5);
      }
      // chips (dark, falling) and a soil fountain for ground hits
      const nc = Math.round(S.chips * k * (heavy ? 2 : 1));
      for (let i = 0; i < nc; i++) {
        _v.copy(n).multiplyScalar(R(5, 14)).add(_v2.set(R(-4, 4), R(0, 6), R(-4, 4)));
        sm.spawn(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, R(0.4, 0.9), R(0.15, 0.3), 0.1, S.chipCol[0], S.chipCol[1], S.chipCol[2], 1, 0.5, 30, 6);
      }
    }
    if (heavy) {
      if (kind === 'shell') {
        ps?.lights?.flash(pos, 0xff9a52, 450, 16, 0.2);
        if (add) add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.22, 2.0, 4.5, 1.1, 0.52, 0.16, 1, 0, 0, 3);
        smokePuff(pos, 0.45, Math.max(2, Math.round(4 * k)), 0.1);
        if (surface === 'ground' || surface === 'rock' || surface === 'concrete') ps?.decals?.spawn(pos, n, 2.2, surface === 'concrete' ? 'scorch' : 'crater');
        else ps?.decals?.spawn(pos, n, 1.4, 'scorch');
      } else {
        // blade: a white flare and a burst of sparks
        if (add) add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 1.8, 3.0, 1.3, 1.5, 1.8, 1, 0, 0, 2);
        sparks(pos, 40 * k, [1, 0.85, 0.6], 30);
        ps?.lights?.flash(pos, 0xcfe9ff, 300, 14, 0.12);
      }
    } else if (kind === 'bullet' && surface !== 'metal' && Math.random() < 0.3) {
      ps?.decals?.spawn(pos, n, 0.35, 'hole');
    }
  }
  function missileTrail(pos, vel) {
    const ps = P(); if (!ps || !pos) return;
    const low = ctx.tier.name === 'low';
    if (low && Math.random() < 0.5) return;
    const add = ps.add, sm = ps.smoke;
    const vx = vel?.x ?? 0, vy = vel?.y ?? 0, vz = vel?.z ?? 0;
    add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 1.1, 0.8, 3.5, 2.4, 1.3, 1, 0, 0, 2);
    add.spawn(pos.x - vx * 0.012, pos.y - vy * 0.012, pos.z - vz * 0.012, -vx * 0.15, -vy * 0.15, -vz * 0.15, 0.08, 0.5, 0.2, 3.2, 1.6, 0.6, 1, 0, 0, 1);
    if (lod(pos, sm) > 0.3) sm.spawn(pos.x - vx * 0.02, pos.y - vy * 0.02, pos.z - vz * 0.02, R(-0.4, 0.4), R(0.3, 0.9), R(-0.4, 0.4), R(1.2, 2), 0.6, 3,
                                     0.55, 0.53, 0.5, 0.45, 0.6, -0.4, Math.random() < 0.5 ? 1 : 3);
  }
  function boost(pos, dir, color) {
    const ps = P(); if (!ps || !pos) return;
    _c.set(color ?? 0xff9a3c);
    const dx = dir?.x ?? 0, dy = dir?.y ?? -1, dz = dir?.z ?? 0;
    for (let i = 0; i < 2; i++) {
      const sp = R(14, 26);
      ps.add.spawn(pos.x, pos.y, pos.z, dx * sp + R(-1.5, 1.5), dy * sp + R(-1.5, 1.5), dz * sp + R(-1.5, 1.5), R(0.08, 0.16), R(0.5, 0.8), 0.15,
                   _c.r * 3, _c.g * 3, _c.b * 3, 1, 3, 0, Math.random() < 0.5 ? 1 : 0);
    }
    // ground effect: kick up the surface when low
    const gy = groundAt(pos.x, pos.z);
    if (pos.y - gy < 8 && Math.random() < 0.5) {
      paletteColors();
      const a = Math.random() * TAU;
      ps.smoke.spawn(pos.x + Math.cos(a) * 2, gy + 0.5, pos.z + Math.sin(a) * 2, Math.cos(a) * R(8, 16), R(0.5, 2), Math.sin(a) * R(8, 16),
                     R(0.8, 1.4), 1.2, R(3, 5), dustCol.r, dustCol.g, dustCol.b, 0.45, 2.5, -0.2, 5);
    }
  }
  function landing(pos, scale = 1) {
    if (!pos) return;
    const sm = P()?.smoke;
    paletteColors();
    const s = Math.max(0.2, +scale || 1);
    if (sm) {
      const n = Math.round(14 * s * lod(pos, sm));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * TAU + R(-0.2, 0.2), sp = R(10, 18) * Math.sqrt(s);
        sm.spawn(pos.x + Math.cos(a) * 2.5, pos.y + 0.4, pos.z + Math.sin(a) * 2.5, Math.cos(a) * sp, R(0.5, 2.5), Math.sin(a) * sp,
                 R(0.9, 1.8), 1.7 * s, R(4.5, 8) * s, dustCol.r, dustCol.g, dustCol.b, 0.48, 3, -0.2, 5);
      }
    }
    shockwave(pos, 4 * s, '#d8c8b0', 0.3);
    ctx.cameraRig?.addShake?.(clamp(0.25 * s, 0, 1));
  }
  function shockwave(pos, radius, color, duration = 0.5) {
    if (!pos) return;
    const r = rings[ringCursor]; ringCursor = (ringCursor + 1) % rings.length;
    r.mesh.position.copy(pos);
    r.r = Math.max(0.1, +radius || 1); r.dur = Math.max(0.05, +duration || 0.5); r.t = 0; r.alive = true;
    r.col.set(color ?? '#ffffff');
    r.mesh.material.uniforms.uCol.value.copy(r.col).multiplyScalar(0.55);
    r.mesh.material.uniforms.uO.value = 1; r.mesh.material.uniforms.uK.value = 0;
    r.mesh.scale.setScalar(0.01);
    r.mesh.visible = true;
  }
  function beam(from, to, color, width = 0.6, duration = 0.15) {
    if (!from || !to) return;
    const b = beams[beamCursor]; beamCursor = (beamCursor + 1) % beams.length;
    _v.subVectors(to, from);
    const len = _v.length();
    if (len < 1e-3) return;
    b.g.position.copy(from);
    _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / len));
    b.g.quaternion.copy(_q);
    b.w = Math.max(0.02, +width || 0.6); b.dur = Math.max(0.02, +duration || 0.15); b.t = 0; b.alive = true;
    b.col.set(color ?? '#bff4ff');
    b.a.scale.set(b.w, len, b.w);
    b.mat.uniforms.uCol.value.copy(b.col);
    b.mat.uniforms.uK.value = 1; b.mat.uniforms.uT.value = 0; b.mat.uniforms.uLen.value = len;
    b.g.visible = true;
    sparks(to, 8, [b.col.r, b.col.g, b.col.b], 18);
    P()?.lights?.flash(to, b.col.getHex(), 500, 12, Math.min(0.2, b.dur));
  }

  // ---------------------------------------------------------------- persistent emitters
  const emitters = [];
  function makeHandle(kind, pos, o, list, isAmbient) {
    const h = {
      kind, pos: pos ? pos.clone() : new THREE.Vector3(), alive: true,
      rate: o.rate ?? 1, scale: o.scale ?? 1, color: o.color ? o.color.slice() : null, acc: 0, light: 0, phase: Math.random() * 10,
      set(p = {}) {
        if (p.rate != null) h.rate = +p.rate; if (p.scale != null) h.scale = +p.scale;
        if (p.color) h.color = p.color.slice(); if (p.intensity != null) h.intensity = +p.intensity;
        if (p.pos?.isVector3) h.pos.copy(p.pos);
        if (p.radius != null) h.radius = +p.radius;
      },
      stop() { h.alive = false; const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); },
    };
    if (isAmbient) { Object.assign(h, o); const st = h.stop; h.stop = () => { st(); stopAmbient(h); }; }
    return h;
  }
  function emitter(kind, pos, o = {}) {
    if (!EMITTERS.includes(kind)) { warnOnce('em:' + kind, '[fx] unknown emitter kind', kind); kind = 'smoke'; }
    const h = makeHandle(kind, pos, o || {}, emitters, false);
    emitters.push(h);
    return h;
  }
  function runEmitter(h, dt) {
    const ps = P(); if (!ps || !(h.rate > 0)) return;
    const d = ctx.camera.position.distanceTo(h.pos);
    if (d > (ctx.tier.viewDistance || 1800)) return;
    const k = d > 600 ? 0.35 : d > 300 ? 0.6 : 1;
    const s = h.scale, p = h.pos, c = h.color;
    const base = { smoke: 9, fire: 34, sparks: 14, steam: 12, dustDevil: 16 }[h.kind];
    h.acc += base * h.rate * k * dt;
    let n = Math.floor(h.acc); h.acc -= n;
    n = Math.min(n, 12);
    const add = ps.add, sm = ps.smoke;
    for (let i = 0; i < n; i++) {
      switch (h.kind) {
        case 'smoke': {
          const g = c ? 1 : R(0.055, 0.1);
          sm.spawn(p.x + R(-1, 1) * s, p.y + R(0, 1) * s, p.z + R(-1, 1) * s, R(-0.6, 0.6) + windX(), R(2.5, 4.5) * s, R(-0.6, 0.6) + windZ(),
                   R(4, 7), 1.5 * s, R(7, 11) * s, c ? c[0] : g, c ? c[1] : g * 0.94, c ? c[2] : g * 0.88, 0.6, 0.15, -0.4, Math.random() < 0.5 ? 1 : 2);
          break;
        }
        case 'fire': {
          const fr = c ? c[0] : 1, fg = c ? c[1] : 0.46, fb = c ? c[2] : 0.12;
          const hot = Math.random(), hk = 0.85 + hot * 0.3;
          // the billow tint is relative to the default flame colour (1 = neutral heat ramp)
          const tr = Math.min(2, Math.max(0.3, fr)), tg = Math.min(2, Math.max(0.3, fg / 0.46)), tb = Math.min(2, Math.max(0.3, fb / 0.12));
          // tongues: opaque flame billows (alpha cell 7) that rise, shrink and cool from yellow to red to soot, so the
          // fire has a body with structure; a fainter additive billow behind each carries the glow into the bloom
          sm.spawn(p.x + R(-0.9, 0.9) * s, p.y + R(0, 0.6) * s, p.z + R(-0.9, 0.9) * s, R(-0.4, 0.4) + windX() * 0.3, R(3.5, 6.5) * s, R(-0.4, 0.4) + windZ() * 0.3,
                   R(0.7, 1.1), R(2.0, 2.9) * s, 0.5 * s, tr * hk, tg * hk, tb * hk, 0.95, 0.9, -3, 7);
          if (Math.random() < 0.5) add.spawn(p.x + R(-0.6, 0.6) * s, p.y + R(0, 0.5) * s, p.z + R(-0.6, 0.6) * s, R(-0.3, 0.3), R(3, 5) * s, R(-0.3, 0.3),
                                             R(0.5, 0.8), R(1.8, 2.4) * s, 0.5 * s, fr * 0.32, fg * 0.3, fb * 0.28, 1, 1.0, -3, 3);
          // licks: thin streaks along the updraft
          if (Math.random() < 0.5) add.spawn(p.x + R(-0.6, 0.6) * s, p.y + R(0.3, 1.2) * s, p.z + R(-0.6, 0.6) * s, windX() * 0.3, R(4, 8) * s, windZ() * 0.3,
                                             R(0.25, 0.45), R(0.35, 0.6) * s, 0.1 * s, fr * 1.3, fg * 1.1, fb * 0.9, 1, 1.5, -2, 1);
          // the glowing bed
          if (Math.random() < 0.3) add.spawn(p.x + R(-0.5, 0.5) * s, p.y + 0.2 * s, p.z + R(-0.5, 0.5) * s, 0, R(0.3, 1.0), 0, R(0.4, 0.7),
                                             R(1.6, 2.4) * s, R(1.0, 1.4) * s, fr * 0.45, fg * 0.32, fb * 0.3, 0.8, 1, 0, 0);
          if (Math.random() < 0.3) add.spawn(p.x, p.y + s, p.z, R(-1, 1), R(2, 5), R(-1, 1), R(1, 2.2), 0.2, 0.05, 2.4, 0.9, 0.22, 1, 0.5, -1, 6);
          if (Math.random() < 0.35) sm.spawn(p.x + R(-0.5, 0.5) * s, p.y + 2 * s, p.z + R(-0.5, 0.5) * s, R(-0.5, 0.5) + windX(), R(3, 5) * s,
                                             R(-0.5, 0.5) + windZ(), R(3, 5), 1.8 * s, R(6, 10) * s, 0.065, 0.06, 0.057, 0.75, 0.1, -0.5, 1);
          break;
        }
        case 'sparks': {
          const cr = c ? c[0] : 1, cg = c ? c[1] : 0.75, cb = c ? c[2] : 0.4;
          add.spawn(p.x, p.y, p.z, R(-5, 5) * s, R(0, 6) * s, R(-5, 5) * s, R(0.4, 1), R(0.1, 0.22), 0.03, cr * 3, cg * 3, cb * 3, 1, 1, 30, 1);
          break;
        }
        case 'steam': {
          sm.spawn(p.x + R(-0.6, 0.6) * s, p.y, p.z + R(-0.6, 0.6) * s, R(-0.8, 0.8) + windX(), R(5, 9) * s, R(-0.8, 0.8) + windZ(),
                   R(1.4, 2.4), 0.8 * s, R(5, 8) * s, c ? c[0] : 0.85, c ? c[1] : 0.86, c ? c[2] : 0.88, 0.4, 0.6, -1, 3);
          break;
        }
        case 'dustDevil': {
          paletteColors();
          const a = h.phase * 3 + i;
          const r = R(1, 4) * s;
          sm.spawn(p.x + Math.cos(a) * r, groundAt(p.x, p.z) + R(0, 10) * s, p.z + Math.sin(a) * r, -Math.sin(a) * 9 * s, R(3, 7) * s, Math.cos(a) * 9 * s,
                   R(1.5, 3), 1.5 * s, R(4, 7) * s, dustCol.r, dustCol.g, dustCol.b, 0.4, 0.8, -1.5, 5);
          break;
        }
      }
    }
    if (h.kind === 'fire') {
      h.light -= dt;
      if (h.light <= 0 && d < 90) { h.light = 0.09; ps.lights?.flash(_v.set(p.x, p.y + 1.5 * s, p.z), 0xff8a3c, R(450, 700) * s, 18 * s, 0.14); }
    }
    if (h.kind === 'dustDevil') h.phase += dt * 1.7;
  }
  const windX = () => (ctx.weather?.current?.wind?.[0] ?? 0) * 0.6;
  const windZ = () => (ctx.weather?.current?.wind?.[1] ?? 0) * 0.6;

  // ---------------------------------------------------------------- ambient battle (distant flashes, tracers, flak, lightning, searchlights, fires)
  const ambients = [];
  function ambient(def = {}) {
    let kind = def.kind;
    if (!AMBIENTS.includes(kind)) { warnOnce('amb:' + kind, '[fx] unknown ambient kind', kind); kind = 'battle'; }
    const h = makeHandle(kind, null, {}, ambients, true);
    h.kind = kind; h.at = def.at; h.radius = Math.max(10, +def.radius || 300); h.intensity = def.intensity ?? 1;
    h.col = new THREE.Color(def.color ?? (kind === 'searchlights' ? '#fff1d6' : '#ffb070'));
    h.resolved = false; h.timer = R(0.2, 1.5); h.lights = null; h.t = 0;
    ambients.push(h);
    return h;
  }
  function resolveAt(h) {
    if (h.resolved) return true;
    const at = h.at;
    try {
      if (Array.isArray(at)) h.pos.set(+at[0] || 0, groundAt(+at[0] || 0, +at[1] || 0), +at[1] || 0);
      else if (at && typeof at === 'object' && 'azimuth' in at) {
        const a = (+at.azimuth || 0) * Math.PI / 180, dist = +at.dist || 2000;
        h.pos.set(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
      } else if (at && ctx.world?.route) ctx.world.resolve(at, h.pos);
      else if (at && 'x' in at) h.pos.set(+at.x || 0, +at.y || 0, +at.z || 0);
      else return false;
    } catch (e) { return false; }
    h.resolved = true;
    return true;
  }
  /** a random point near an ambient's centre at height y0..y1 above the ground (shared temp: no per-frame closure) */
  function pickNear(h, y0, y1) {
    const p = h.pos, rad = h.radius;
    _v.set(p.x + R(-1, 1) * rad, 0, p.z + R(-1, 1) * rad);
    return _v.setY(groundAt(_v.x, _v.z) + R(y0, y1));
  }
  function runAmbient(h, dt) {
    if (!(h.intensity > 0) || !resolveAt(h)) return;
    const ps = P(); if (!ps) return;
    h.t += dt; h.timer -= dt * h.intensity;
    const add = ps.add, p = h.pos, rad = h.radius;
    switch (h.kind) {
      case 'battle': {
        if (h.timer <= 0) {
          h.timer = R(0.25, 1.4);
          const q = pickNear(h, 0, 6);
          add.spawn(q.x, q.y + 4, q.z, 0, 0, 0, R(0.25, 0.6), R(14, 30), R(30, 50), h.col.r * 2.4, h.col.g * 2, h.col.b * 1.5, 1, 0, 0, 7);
          add.spawn(q.x, q.y + 4, q.z, 0, 5, 0, R(1.0, 1.8), R(14, 24), R(26, 40), 1.3, 0.5, 0.15, 0.8, 0.5, 0, 3);
          if (Math.random() < 0.25) ctx.audio?.play?.('boom', q, { range: 6000, vol: 0.35 });
        }
        if (Math.random() < dt * 6 * h.intensity) {   // tracer arcs
          const q = pickNear(h, 2, 20), a = Math.random() * TAU, sp = R(250, 400);
          add.spawn(q.x, q.y, q.z, Math.cos(a) * sp, R(10, 60), Math.sin(a) * sp, R(0.4, 0.9), 5, 5, 2.6, 1.2, 0.45, 1, 0, 30, 1);
        }
        break;
      }
      case 'flak': {
        if (h.timer <= 0) {
          h.timer = R(0.15, 0.7);
          const q = pickNear(h, 120, 380);
          add.spawn(q.x, q.y, q.z, 0, 0, 0, 0.18, R(6, 10), R(14, 20), 3, 2.4, 1.6, 1, 0, 0, 2);
          ps.smoke.spawn(q.x, q.y, q.z, 0, 0.5, 0, R(3, 6), 6, 14, 0.08, 0.08, 0.08, 0.7, 0.2, 0, 1);
        }
        break;
      }
      case 'lightning': {
        if (h.timer <= 0) {
          h.timer = R(4, 12);
          ctx.atmosphere?.lightning?.(R(0.6, 1.2));
          const q = pickNear(h, 0, 0);
          later(R(0.6, 2.4), (pp) => ctx.audio?.play?.('thunder', pp, { range: 9000, vol: 0.8 }), q);
        }
        break;
      }
      case 'searchlights': {
        if (!h.lights) {
          h.lights = [];
          for (let i = 0; i < 3; i++) {
            const m = beamConeMaterial(h.col, 0.11);
            const geo = new THREE.ConeGeometry(30, 900, 20, 1, true); geo.translate(0, -450, 0); geo.rotateX(Math.PI);
            const mesh = new THREE.Mesh(geo, m);
            mesh.userData.noAO = true; mesh.frustumCulled = false; mesh.renderOrder = 6;
            const q = pickNear(h, 0, 2);
            mesh.position.set(q.x, q.y, q.z);
            ctx.levelRoot.add(mesh);
            h.lights.push({ mesh, ph: Math.random() * TAU, sp: R(0.15, 0.35) });
          }
        }
        for (const l of h.lights) {
          l.ph += dt * l.sp;
          l.mesh.rotation.set(0.55 + 0.3 * Math.sin(l.ph * 0.7), l.ph, 0);
        }
        break;
      }
      case 'fires': {
        if (Math.random() < dt * 8 * h.intensity) {
          const q = pickNear(h, 0, 1);
          add.spawn(q.x, q.y + 2, q.z, 0, R(2, 5), 0, R(0.6, 1.2), R(4, 8), R(1, 3), 3.5, 1.6, 0.5, 1, 0.5, -2, 3);
          ps.smoke.spawn(q.x, q.y + 6, q.z, windX(), R(4, 7), windZ(), R(5, 9), 5, 18, 0.09, 0.085, 0.08, 0.55, 0.1, -0.3, 1);
        }
        break;
      }
    }
  }
  function stopAmbient(h) {
    if (h.lights) for (const l of h.lights) { l.mesh.parent?.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); }
    h.lights = null;
  }

  /** a soft volumetric-looking light cone: bright at the lamp, fading along its length and at grazing edges */
  function beamConeMaterial(color, strength) {
    return new THREE.ShaderMaterial({
      uniforms: { ...(ctx.atmosphere?.fogUniforms || {}), uCol: { value: new THREE.Color(color).multiplyScalar(strength) } },
      vertexShader: `varying vec3 vW; varying vec3 vN; varying float vT;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vT = uv.y;
                      gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${FOG_PARS}
        uniform vec3 uCol; varying vec3 vW; varying vec3 vN; varying float vT;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          float edge = pow(abs(dot(normalize(vN), v)), 2.6);                    // soft, hazy edges
          float along = (pow(vT, 2.2) * 0.9 + 0.1 * vT) * smoothstep(0.0, 0.3, vT);   // uv.y is 1 at the lamp; the far end dissolves
          float a = edge * along * (1.0 - cFogAmount(vW) * 0.8);
          gl_FragColor = vec4(uCol * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }

  // ---------------------------------------------------------------- api
  const api = {
    sparks, dust, explosion, muzzle, impact, missileTrail, boost, landing, shockwave, beam, emitter, ambient,
    clearEmitters() { for (const h of emitters.slice()) h.stop(); emitters.length = 0; },
    update(dt) {
      for (const h of emitters) runEmitter(h, dt);
      for (let i = ambients.length - 1; i >= 0; i--) {
        const h = ambients[i];
        if (!h.alive) { stopAmbient(h); ambients.splice(i, 1); continue; }
        runAmbient(h, dt);
      }
      for (const r of rings) {
        if (!r.alive) continue;
        r.t += dt;
        const k = r.t / r.dur;
        if (k >= 1) { r.alive = false; r.mesh.visible = false; continue; }
        const e = 1 - (1 - k) * (1 - k) * (1 - k);
        r.mesh.scale.setScalar(Math.max(0.01, r.r * e * 1.2));   // the band rides at ≈ 0.75–0.9 of the quad
        r.mesh.material.uniforms.uK.value = k;
        r.mesh.material.uniforms.uO.value = (1 - k) * (1 - k);
      }
      for (const b of beams) {
        if (!b.alive) continue;
        b.t += dt;
        const k = b.t / b.dur;
        if (k >= 1) { b.alive = false; b.g.visible = false; continue; }
        b.mat.uniforms.uK.value = (1 - k) * (1 - k); b.mat.uniforms.uT.value = k * k;
        const w = b.w * (1 + k * 0.8);
        b.a.scale.x = b.a.scale.z = w;
      }
      for (const d of delayed) {
        if (d.t < 0) continue;
        d.t -= dt;
        if (d.t < 0) { const fn = d.fn; d.fn = null; d.t = -1; fn?.(d.pos, d.a); }
      }
    },
    /** extra: live counts (tests) */
    stats() { return { emitters: emitters.length, ambients: ambients.length, rings: rings.filter(r => r.alive).length, beams: beams.filter(b => b.alive).length }; },
  };
  ctx.events.on('level:cleared', () => {
    api.clearEmitters();
    for (const h of ambients) { h.alive = false; stopAmbient(h); }
    ambients.length = 0;
    for (const r of rings) { r.alive = false; r.mesh.visible = false; }
    for (const b of beams) { b.alive = false; b.g.visible = false; }
    for (const d of delayed) { d.t = -1; d.fn = null; }
  });
  ctx.addSystem({ name: 'fx', phase: 'fx', when: 'sim', update: (dt) => api.update(dt) });
  ctx.fx = api;
  return api;
}
