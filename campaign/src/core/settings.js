// core/settings.js (P0): settings store, quality tiers (§7.4), tier resolution, touch detection.
import { clone } from './util.js';

const T = (name, o) => Object.freeze({ name, ...o });

/** Quality tiers, values from architecture §7.4 (+ fogFarStart/fogFarEnd from §5.8). */
export const TIERS = Object.freeze({
  low: T('low', {
    pixelRatioMax: 1.0, post: false, msaa: 0, smaa: false, bloom: false, ao: false,
    shadowMapSize: 1024, shadowExtent: 80, terrainCastsShadow: false,
    viewDistance: 1100, terrainSegments: 32, terrainSplit: 1.6, terrainBuildMs: 3,
    erosionScale: 0.4, scatterDensity: 0.35, scatterDistance: 0.5, groundCover: false,
    structureLodDist: 250, particlesAdd: 2500, particlesAlpha: 1200, weatherParticles: 800,
    pointLights: 0, debrisMax: 40, maxDecals: 32, textureSize: 256, anisotropy: 2,
    fogFarStart: 770, fogFarEnd: 1080,
  }),
  medium: T('medium', {
    pixelRatioMax: 1.25, post: true, msaa: 0, smaa: true, bloom: true, ao: false,
    shadowMapSize: 2048, shadowExtent: 130, terrainCastsShadow: false,
    viewDistance: 1800, terrainSegments: 64, terrainSplit: 2.0, terrainBuildMs: 4,
    erosionScale: 0.8, scatterDensity: 0.7, scatterDistance: 0.8, groundCover: true,
    structureLodDist: 400, particlesAdd: 5000, particlesAlpha: 2500, weatherParticles: 2000,
    pointLights: 3, debrisMax: 120, maxDecals: 96, textureSize: 512, anisotropy: 4,
    fogFarStart: 1260, fogFarEnd: 1760,
  }),
  high: T('high', {
    pixelRatioMax: 1.6, post: true, msaa: 4, smaa: false, bloom: true, ao: true,
    shadowMapSize: 4096, shadowExtent: 160, terrainCastsShadow: true,
    viewDistance: 2600, terrainSegments: 64, terrainSplit: 2.4, terrainBuildMs: 5,
    erosionScale: 1.0, scatterDensity: 1.0, scatterDistance: 1.0, groundCover: true,
    structureLodDist: 550, particlesAdd: 8000, particlesAlpha: 4000, weatherParticles: 4000,
    pointLights: 6, debrisMax: 200, maxDecals: 192, textureSize: 1024, anisotropy: 8,
    fogFarStart: 1820, fogFarEnd: 2550,
  }),
});

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  sens: 1, invertY: false, fov: 66, cameraShake: 1,
  volMaster: 0.8, volMusic: 0.7, volSfx: 1,
  quality: 'auto', ao: true,
  touch: 'auto', commsSpeed: 1, showFps: false, reducedMotion: false,
});

/** Allowed values / ranges, used to sanitise stored data and by the settings screen. */
export const SETTINGS_SCHEMA = Object.freeze({
  sens: { min: 0.2, max: 3, step: 0.05 },
  invertY: { bool: true },
  fov: { min: 50, max: 90, step: 1 },
  cameraShake: { min: 0, max: 1.5, step: 0.05 },
  volMaster: { min: 0, max: 1, step: 0.05 },
  volMusic: { min: 0, max: 1, step: 0.05 },
  volSfx: { min: 0, max: 1, step: 0.05 },
  quality: { options: ['auto', 'low', 'medium', 'high'] },
  ao: { bool: true },
  touch: { options: ['auto', 'on', 'off'] },
  commsSpeed: { min: 0.5, max: 3, step: 0.1 },
  showFps: { bool: true },
  reducedMotion: { bool: true },
});

/** Prototype TOUCH_DEVICE heuristic. */
export function detectTouch() {
  try {
    if (typeof matchMedia !== 'function') return false;
    return matchMedia('(pointer: coarse)').matches ||
      ((navigator.maxTouchPoints || 0) > 0 && !matchMedia('(pointer: fine)').matches);
  } catch (e) { return false; }
}

/** quality 'auto' → touch ? 'low' : 'high'. Returns a fresh TierConfig object (tiers are replaced, not mutated). */
export function resolveTier(s) {
  s = s || DEFAULT_SETTINGS;
  let name = s.quality;
  if (!TIERS[name]) {
    const touch = s.touch === 'on' || (s.touch !== 'off' && detectTouch());
    name = touch ? 'low' : 'high';
  }
  return { ...TIERS[name] };
}

function sanitize(key, v) {
  const sc = SETTINGS_SCHEMA[key];
  if (!sc) return undefined;
  if (sc.bool) return typeof v === 'boolean' ? v : undefined;
  if (sc.options) return sc.options.includes(v) ? v : undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(sc.max, Math.max(sc.min, n));
}

export class SettingsStore {
  /** `bus` (optional, or assign later): an EventBus that receives 'settings:changed' {key, value}. */
  constructor(key = 'campaign.settings', bus = null) {
    this.key = key;
    this.bus = bus;
    this._fns = [];
    this._data = clone(DEFAULT_SETTINGS);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.version === 1) for (const k of Object.keys(DEFAULT_SETTINGS)) {
          if (k === 'version') continue;
          const v = sanitize(k, o[k]);
          if (v !== undefined) this._data[k] = v;
        }
      }
    } catch (e) { /* corrupt or unavailable storage: defaults */ }
  }
  get data() { return this._data; }
  get(k) { return this._data[k]; }
  set(k, v) {
    if (!(k in DEFAULT_SETTINGS) || k === 'version') { console.warn('[settings] unknown key', k); return; }
    const s = sanitize(k, v);
    if (s === undefined) { console.warn('[settings] invalid value', k, v); return; }
    if (this._data[k] === s) return;
    this._data[k] = s;
    try { localStorage.setItem(this.key, JSON.stringify(this._data)); } catch (e) { /* ignore */ }
    for (const fn of this._fns.slice()) fn(k, s);
    this.bus?.emit('settings:changed', { key: k, value: s });
  }
  onChange(fn) { this._fns.push(fn); return () => { const i = this._fns.indexOf(fn); if (i >= 0) this._fns.splice(i, 1); }; }
}
