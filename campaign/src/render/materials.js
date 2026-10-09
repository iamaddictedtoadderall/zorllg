// render/materials.js (P1) — P0 STUB: 4×4 data textures for every TexName, cached library/standard materials,
// real glow/emissive/mechSet/factionSet, minimal palette tinting and canvas signage.
// Every cached object is marked userData.shared so ctx.clearLevel() never disposes it.
import * as THREE from 'three';

const TEX_NAMES = ['panel', 'grain', 'rock', 'concrete', 'metal', 'grime', 'noise', 'smokeSprite', 'sparkSprite'];
const COLOR_TEX = new Set(['panel', 'grain', 'rock', 'concrete', 'metal', 'grime']);
// prototype MAT values: [color, roughness, metalness]
const LIB = {
  concrete: [0x4d4642, 0.92, 0.05], concreteDark: [0x2f2a28, 0.95, 0.05], steel: [0x3b3d40, 0.55, 0.6],
  steelDark: [0x2a2c30, 0.5, 0.55], rust: [0x5d3424, 0.9, 0.25], stripe: [0xc77b2e, 0.6, 0.2], dark: [0x141416, 0.8, 0.4],
  rock: [0x4a3f3a, 0.95, 0.05], debris: [0x2a2524, 0.8, 0.4], cable: [0x1a1a1c, 0.7, 0.3], canvas: [0x6b6256, 0.95, 0.0],
  scorch: [0x0d0b0a, 1.0, 0.0], rubber: [0x1c1b1b, 0.9, 0.0],
};
const LIGHTS = { lightRed: 0xff3020, lightAmber: 0xffa040, lightCyan: 0x5fe3ff, lightWhite: 0xfff1d6 };
const shared = (o) => { o.userData.shared = true; return o; };

function dataTexture(name, rng) {
  const d = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    const v = name === 'smokeSprite' || name === 'sparkSprite' ? ((i === 5 || i === 6 || i === 9 || i === 10) ? 255 : 40)
      : Math.round(180 + rng() * 60);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, 4, 4, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = COLOR_TEX.has(name) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.name = name;
  t.needsUpdate = true;
  return shared(t);
}

export function install(ctx) {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const textures = {};
  for (const n of TEX_NAMES) textures[n] = dataTexture(n, rng);

  const lib = new Map(), stdCache = new Map(), glowCache = new Map(), emCache = new Map(), mechCache = new Map(), factionCache = new Map();
  let factions = {};
  let envScale = 1;
  const patch = (m) => ctx.atmosphere?.patchMaterial ? ctx.atmosphere.patchMaterial(m) : m;

  function getLib(name) {
    let m = lib.get(name);
    if (m) return m;
    if (LIB[name]) {
      const [c, r, me] = LIB[name];
      m = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, envMapIntensity: 0.6 * envScale });
    } else if (LIGHTS[name]) {
      m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: LIGHTS[name], emissiveIntensity: 3 });
    } else if (name === 'glass') {
      m = new THREE.MeshStandardMaterial({ color: 0x6fd8e8, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    } else {
      console.warn('[materials] unknown library material', name);
      return getLib('concrete');
    }
    m.name = name;
    shared(patch(m));
    lib.set(name, m);
    return m;
  }

  const api = {
    textures,
    get: getLib,
    standard(o = {}) {
      const key = JSON.stringify(o, (k, v) => (v && v.isColor ? '#' + v.getHexString() : v));
      let m = stdCache.get(key);
      if (m) return m;
      m = new THREE.MeshStandardMaterial({
        color: o.color ?? 0x808080, roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0.3,
        envMapIntensity: (o.envMapIntensity ?? 0.6) * envScale, flatShading: !!o.flatShading, vertexColors: !!o.vertexColors,
        side: o.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
        transparent: !!o.transparent, opacity: o.opacity ?? 1,
      });
      if (o.map && textures[o.map]) {
        m.map = textures[o.map];
        if (o.bump) { m.bumpMap = textures[o.map]; m.bumpScale = o.bump; }
      }
      if (o.emissive != null) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
      shared(patch(m));
      stdCache.set(key, m);
      return m;
    },
    glow(color, opacity = 1) {
      const key = new THREE.Color(color).getHexString() + '|' + opacity;
      let m = glowCache.get(key);
      if (!m) {
        m = shared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        glowCache.set(key, m);
      }
      return m;
    },
    emissive(color, intensity = 3) {
      const key = new THREE.Color(color).getHexString() + '|' + intensity;
      let m = emCache.get(key);
      if (!m) {
        m = shared(patch(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })));
        emCache.set(key, m);
      }
      return m;
    },
    /** buildAC's materials: base/mid/acc std, dark, visor emissive 2.6, flame and blade additive glows */
    mechSet(s) {
      const key = JSON.stringify([s.base, s.mid, s.accent, s.visor, s.flame, s.blade, s.dark, s.wear]);
      let set = mechCache.get(key);
      if (set) return set;
      const std = (c, r, me) => shared(patch(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, envMapIntensity: 0.55 * envScale })));
      set = {
        base: std(s.base, 0.42, 0.5), mid: std(s.mid, 0.5, 0.45), acc: std(s.accent, 0.45, 0.3), dark: std(s.dark ?? 0x1b1c20, 0.65, 0.5),
        visor: shared(patch(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: s.visor, emissiveIntensity: 2.6 }))),
        flame: api.glow(s.flame ?? 0xff9a3c, 0.85),
        blade: api.glow(s.blade ?? 0x8fe9ff, 0.9),
      };
      mechCache.set(key, set);
      return set;
    },
    setFactions(f) { factions = { ...(f || {}) }; factionCache.clear(); },
    factionSet(id) {
      let set = factionCache.get(id);
      if (set) return set;
      const p = factions[id] || { shell: '#7a7a78', mid: '#5a5a58', accent: '#3a3a3a', dark: '#1b1c20', eye: '#ff3b1f' };
      const std = (c, r, me) => shared(patch(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, envMapIntensity: 0.55 * envScale })));
      set = {
        shell: std(p.shell, 0.55, 0.35), mid: std(p.mid ?? p.shell, 0.55, 0.4), accent: std(p.accent, 0.5, 0.3), dark: std(p.dark ?? '#141416', 0.8, 0.4),
        eye: api.emissive(p.eye, 3), glow: api.glow(p.eye, 0.9),
      };
      factionCache.set(id, set);
      return set;
    },
    applyPalette(p = {}) {
      const map = { concrete: 'concrete', rust: 'rust', rock: 'rock', accent: 'stripe' };
      for (const [pk, lk] of Object.entries(map)) if (p[pk]) getLib(lk).color.set(p[pk]);
    },
    sign(text, o = {}) {
      const w = o.w || 256, h = o.h || 128;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = o.bg || '#2a2a2a'; g.fillRect(0, 0, w, h);
      g.fillStyle = o.color || '#e9e3d3';
      g.font = o.font || `600 ${Math.round(h * 0.45)}px "Barlow Condensed", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(text), w / 2, h / 2);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    },
    /** extra: env-map intensity scale from art.light.env */
    setEnvScale(k) { envScale = Number(k) || 1; },
    dispose() {
      for (const c of [lib, stdCache, glowCache, emCache]) { for (const m of c.values()) m.dispose(); c.clear(); }
      mechCache.clear(); factionCache.clear();
    },
  };
  ctx.materials = api;
  return api;
}
