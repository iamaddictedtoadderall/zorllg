// levels/level01.js (P6) — Level 1: THAW (The Rime Shelf). Built from docs/level-01.md as amended by
// docs/addendum-01.md (A1.3 trims, A2 rulings, A5.6 mappings). BUILD TEAM ONLY: this file holds the level script.
//
// Shape of the file
//  · constants and art/music presets (A2 #7: L1 §15 values, AD's reserved colours and field shapes);
//  · DATA: level-only data read by the custom code in levels/level01/ (floes, Icebreaker, skiff leads, shore);
//  · the LevelDef (arch §6), default export.
//
// Rules this file follows
//  · Progression across checkpoints is carried by mission FLAGS (p:*), not by `after` chains, so every checkpoint can be
//    started cold (?level=l01&cp=…, the scenario) as well as restored from a snapshot. Each onCheckpoint list re-runs the
//    remainder of the action list that reached that checkpoint, sets the flags and objectives a cold start lacks, and
//    disables earlier triggers whose conditions would be true at that spot.
//  · Cinematic side effects run in a `parallel` branch next to the shot (not in `during`), so the level works whether
//    or not the cinematics runtime runs `during` lists.
//  · Spoilers (A2 #4, #6): no UI string says "Moth" before c_naming_kit; the frame's comms label is CANTOR 7; Moth never
//    says I, me or my (or a contraction) before "Hold on to me."
//  · Custom structure types are registered before World.load reads `zones` (see `get zones()`), with a fallback that
//    places them from custom.install (levels/level01/index.js) when that is not possible.
import { installLevel01, ensureL1Structures, liveCtx } from './level01/index.js';

const SEA = -24;                  // sea plane (L1 §2.1)
const FLOE_TOP = SEA + 2.4;       // -21.6
const ABEY_S = 1545;              // Abeyance base (route s); the hull's local x is the route's l, local z is -(s - 1545)
const LEAN = Math.tan(7 * Math.PI / 180);   // the hull leans toward local +x (south side of the route)
/** hull-local point (x across, y up, z along the hull, -z = direction of travel) as a route-relative Pos */
const abey = (x, y, z = 0) => ({ s: ABEY_S - z, l: x + y * LEAN, h: y });

// ── music: inline ThemeDefs (L1 §15.6) ───────────────────────────────────────────────────────────────────────────
const NIGHT = { bpm: 60, root: 55, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 4],
  layers: { pad: { wave: 'sawtooth', vol: 0.16, cutoff: 900, octave: 2 },
            bass: { wave: 'sine', vol: 0.2, pattern: 'x.......', octave: 0 },
            arp: { wave: 'triangle', vol: 0.05, pattern: 'x.x...x.', octave: 4 } },
  intensity: { arp: [0.1, 0.5] } };
const DREDGE = { bpm: 112, root: 49, scale: [0, 1, 3, 5, 7, 8, 10], progression: [0, 0, 1, 0],
  layers: { bass: { wave: 'sawtooth', vol: 0.28, cutoff: 700, pattern: 'x.xx.x.x', octave: 1 },
            pulse: { wave: 'square', vol: 0.1, cutoff: 1400, pattern: 'x.x.x.x.', octave: 2 },
            drums: { kit: 'industrial', vol: 0.5, pattern: 'x...x.x.' },
            pad: { wave: 'sawtooth', vol: 0.1, cutoff: 600, octave: 2 } },
  intensity: { drums: [0.3, 0.8], pulse: [0.5, 1.0] } };
const DAWN = { bpm: 126, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 6, 4],
  layers: { pad: { wave: 'sawtooth', vol: 0.18, cutoff: 1600, octave: 2 },
            bass: { wave: 'triangle', vol: 0.24, pattern: 'x..x..x.', octave: 1 },
            drums: { kit: 'tribal', vol: 0.45, pattern: 'x.x.xx.x' },
            lead: { wave: 'triangle', vol: 0.07, octave: 4 } },
  intensity: { drums: [0.2, 0.7], lead: [0.4, 0.9] } };
// the drowning's "single low drone" and the reboot's "single rising pad note" (L1 §7.1, §7.2)
const DRONE = { bpm: 40, root: 41.2, scale: [0], progression: [0],
  layers: { pad: { wave: 'sawtooth', vol: 0.14, cutoff: 260, octave: 1 } } };
const RISE = { bpm: 50, root: 55, scale: [0, 7], progression: [0, 1],
  layers: { pad: { wave: 'triangle', vol: 0.12, cutoff: 1200, octave: 2 } } };
// the bridge song's first four notes on a music box (bible §12.6); played once by the custom action musicBox
const MUSICBOX = { bpm: 84, root: 440, scale: [0, 3, 7, 5], progression: [0],
  layers: { arp: { wave: 'triangle', vol: 0.09, pattern: 'xxxx....', octave: 0 } } };

// ── art presets (L1 §15; A2 #7: AD's aurora/dawn-rim colours and shapes) ──────────────────────────────────────────
// Zone and action blends are partial (atmosphere.set), so a preset that leaves a zone restores what the previous one
// changed. ART_NIGHT holds the full night values.
const AURORA = { strength: 0.6, colorA: '#2fe0c8', colorB: '#7b4dff', azimuth: 350, height: 55, speed: 1 };
const RIM = (k) => ({ strength: 0.7 * k, color: '#ff5a2a', color2: '#7a2a40', azimuth: 95, width: 35, height: 3 });
const ART_NIGHT = {
  sky: { top: '#02050c', mid: '#08122a', horizon: '#16203a',
         sun: { azimuth: 350, elevation: 58, color: '#7fd0c8', size: 0, glow: 0 },   // starlight key; no visible disc
         stars: 1.0, clouds: { cover: 0.12, color: '#1a2440', speed: 0.3 },
         ridges: { height: 1.2, color: '#0b1222', layers: 2 },
         aurora: AURORA, dawnRim: RIM(1) },
  fog: { color: '#141d33', density: 0.0011, heightFalloff: 0.02, heightBase: -10, inscatter: 0.3, sunColor: '#4a7f8a' },
  light: { sun: 0.9, sunColor: '#8fd8c8', hemiSky: '#3a5a8c', hemiGround: '#0a1020', hemi: 1.3,
           rim: 1.4, rimColor: '#6a7fb0', exposure: 1.15, env: 0.5, shadowMinElevation: 0 },
  grade: { contrast: 1.08, saturation: 0.92, lift: [0, 0.01, 0.03], gain: [0.95, 1.0, 1.08],
           shadowsTint: [0.85, 0.95, 1.15], highlightsTint: [1, 1, 1], vignette: 0.34, grain: 0.035 },
  bloom: { strength: 1.0, radius: 0.65, threshold: 0.8 },
  weather: { type: 'snow', intensity: 0.15, wind: [3, -1], lightning: 0, fogBoost: 1 },
};
const ART_UNDER = {                              // Z2: blue ice-glow, no sky
  fog: { color: '#0b2a3c', density: 0.006, heightFalloff: 0, heightBase: -10, inscatter: 0.2, sunColor: '#4a7f8a' },
  light: { sun: 0.2, sunColor: '#8fd8c8', hemiSky: '#2a6f9a', hemiGround: '#020406', hemi: 0.7, rim: 0.8,
           rimColor: '#6a7fb0', exposure: 1.3, env: 0.5 },
  bloom: { strength: 1.2, radius: 0.65, threshold: 0.8 },
  weather: { type: 'clear', intensity: 0, wind: [0, 0], lightning: 0, fogBoost: 1 },
};
const ART_TEETH = { fog: { ...ART_NIGHT.fog, density: 0.0014 }, light: ART_NIGHT.light, bloom: ART_NIGHT.bloom,
                    sky: { dawnRim: RIM(1.2) }, weather: { ...ART_NIGHT.weather, intensity: 0.2, wind: [4, -1] } };
const ART_ABEY = { fog: { ...ART_NIGHT.fog, density: 0.0013 }, light: ART_NIGHT.light, bloom: ART_NIGHT.bloom,
                   sky: { dawnRim: RIM(1.4) }, weather: { ...ART_NIGHT.weather, intensity: 0.15 } };
const ART_PREDAWN = { sky: { mid: '#132040', horizon: '#2a2d4a', dawnRim: RIM(2) },
  fog: { ...ART_NIGHT.fog, color: '#1d2440', density: 0.0012, inscatter: 0.5 },
  light: { ...ART_NIGHT.light, hemi: 1.5, exposure: 1.2 }, bloom: ART_NIGHT.bloom,
  weather: { ...ART_NIGHT.weather, intensity: 0.12 } };
const ART_DAWN = {                               // the sunrise (L1 §15.2): the aurora fades out over the blend
  sky: { top: '#0e1a36', mid: '#3a3a5a', horizon: '#ff9a5c',
         sun: { azimuth: 95, elevation: 5.5, color: '#ffb070', size: 1.4, glow: 1.0 }, stars: 0.1,
         clouds: { cover: 0.18, color: '#6a4a5a', speed: 0.3 },
         aurora: { ...AURORA, strength: 0 }, dawnRim: { ...RIM(2), strength: 0.4 } },
  fog: { color: '#c88a6a', density: 0.0009, heightFalloff: 0.02, heightBase: -10, inscatter: 1.0, sunColor: '#ffb27a' },
  light: { sun: 6.0, sunColor: '#ffad6b', hemiSky: '#8fa6d0', hemiGround: '#3a2a26', hemi: 1.6,
           rim: 2.2, rimColor: '#7fa0e0', exposure: 1.0, env: 0.7, shadowMinElevation: 8 },
  grade: { contrast: 1.06, saturation: 1.1, lift: [0, 0, 0], gain: [1.08, 1.0, 0.92], shadowsTint: [0.8, 0.9, 1.2],
           highlightsTint: [1.1, 1.0, 0.88], vignette: 0.3, grain: 0.03 },
  bloom: { strength: 0.9, radius: 0.6, threshold: 0.9 },
  weather: { type: 'snow', intensity: 0.05, wind: [2, 0], lightning: 0, fogBoost: 1 } };
const ART_FLOES = { fog: { density: 0.0007 } };                                         // Z6 over the dawn
const ART_SHORE = { sky: { sun: { azimuth: 95, elevation: 9 } }, grade: { gain: [1.1, 1.02, 0.9] } };   // Z7
const ART_WATER = {                              // underwater (L1 §15.3); the drowning ramps fog 0.035 → 0.09 (A1.2)
  fog: { color: '#0a2420', density: 0.035, heightFalloff: 0, inscatter: 0.2 },
  light: { sun: 1.2, hemi: 0.6, hemiSky: '#2f6f5a', hemiGround: '#020806' },
  grade: { saturation: 0.7, gain: [0.8, 1.05, 0.95], vignette: 0.55 }, bloom: { strength: 0.6 } };

const PALETTE = { ground: '#b8c6d6', rock: '#5d7899', sediment: '#2b3a4f', high: '#d6dee8', dust: '#c9d4e2',
                  wet: '#1b2633', concrete: '#8a8f96', rust: '#6e3a24', accent: '#e0a030', snow: '#d6e2ee',
                  strata: ['#5d7899', '#6f8aa8', '#4f6a8a', '#83a0bc'] };

// ── level-only data consumed by custom code ──────────────────────────────────────────────────────────────────────
const DATA = {
  sea: SEA, floeTop: FLOE_TOP, abeyS: ABEY_S, lean: 7,
  shelfEdge: [[628, -470], [645, -300], [636, -120], [650, 40], [638, 210], [655, 470]],
  seaBounds: { x0: 600, x1: 2400, z0: -1100, z1: 1100 },
  raft: { x0: 668, x1: 905, z0: -300, z1: 330, count: 22, size: [40, 90], freeboard: 3, seed: 7101 },
  floes: { x0: 905, x1: 1295, z0: -320, z1: 330, size: [14, 45], freeboard: 2.4, seed: 7102, maxGap: 22, maxGoldHops: 2,
           leads: [ [[900, -120], [1000, -80], [1150, -110], [1290, -90]],
                    [[930, 100], [1040, 60], [1180, 75], [1280, 110]],
                    [[960, 230], [1100, 300], [1250, 270]] ],
           guaranteed: [{ x: 856, z: 23, r: 26, raft: true }] },
  bergs: [ { id: 'B1', x: 995, z: 30, r: 22, h: 24 }, { id: 'B2', x: 1075, z: 120, r: 25, h: 28 },
           { id: 'B3', x: 1150, z: 185, r: 22, h: 22 }, { id: 'B4', x: 1240, z: 130, r: 24, h: 26 },
           { id: 'B5', x: 1300, z: 15, r: 22, h: 20 },  { id: 'B6', x: 1340, z: -60, r: 18, h: 18 },
           { id: 'B7', x: 920, z: -60, r: 16, h: 16 },  { id: 'B8', x: 1180, z: 260, r: 18, h: 20 },
           { id: 'B9', x: 1210, z: -40, r: 15, h: 16 } ],
  sunClock: { from: 5.5, to: 9, seconds: 180, azimuth: 95 },
  sled3: { x: 1010, z: 262 },
  surfacing: { x: 856, z: 23 },
  fastIceX: 1300,
  icebreaker: { start: { x: 590, z: -340, azimuth: 180 }, laneX: 610, laneZ: [-340, 380],
                harvest: { x: 612, z: -8, azimuth: 90 }, collarY: -8, heads: { port: 8000, stbd: 8000, bow: 14000 } },
  skiffLeadsZ3: [ [[-700, -20], [-600, 60], [-480, 130], [-340, 100], [-240, 0]],
                  [[-640, 180], [-560, 120], [-500, 40]] ],
  abeyance: { floors: [22, 44, 66, 88, 108], crown: 122 },
  wakeLights: { x0: 1360, x1: 2150, z0: -1250, z1: 1250, count: 64, seed: 7301 },
  shore: { hole: { s: 3185, l: -20 }, kneel: { s: 3180, l: -14 }, cradle: { s: 3282, l: 20 } },
  tick: { park0: { s: 90, l: 70 } },
};

// ── terrain stamps (L1 §2.4, §17; order matters: stamps apply in sequence) ─────────────────────────────────────
const STAMPS = [
  // Z1 bay, flat at the shelf surface
  { at: { s: 170, l: 0 }, r: 165, falloff: 30, mode: 'flatten', h: 0 },
  // Z2: the shaft's raised rim first, then the cavern trench (y -18) cut through it, then the shaft floor
  { at: { s: 625 }, r: 30, falloff: 10, mode: 'raise', h: 16 },
  ...Array.from({ length: 13 }, (_, i) => ({ at: { s: 330 + i * 25 }, r: i < 4 ? 50 : 34, falloff: 6, mode: 'flatten', h: -18, noScatter: true })),
  { at: { s: 625 }, r: 14, falloff: 4, mode: 'flatten', h: -18, noScatter: true },
  // Z4 apron and hull pad; Z5 field
  { at: { s: 1440 }, r: 150, falloff: 40, mode: 'flatten', h: 0 },
  { at: { s: ABEY_S }, r: 60, falloff: 20, mode: 'flatten', h: 0, noScatter: true },
  ...[1760, 1880, 2000, 2120].flatMap(s => [-260, 0, 260].map(l => ({ at: { s, l }, r: 170, falloff: 50, mode: 'flatten', h: 0 }))),
  // open water: the seabed at -70 east of the shelf edge (x 655..1360); the cliff face hides the 640..655 transition
  ...[760, 860, 960, 1060, 1160, 1255].flatMap(x => [-330, -220, -110, 0, 110, 220, 330].map(z =>
      ({ at: [x, z], r: 100, falloff: 15, mode: 'flatten', h: -70, noScatter: true }))),
  // shore-fast ice and the stepped beach ramp
  { at: { s: 3165, l: -20 }, r: 70, falloff: 15, mode: 'flatten', h: -21, noScatter: true },
  { at: { s: 3215, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -15 },
  { at: { s: 3250, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -9 },
  { at: { s: 3285, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -3 },
  { at: { s: 3320, l: 0 }, r: 70, falloff: 25, mode: 'flatten', h: 3 },
  // scatter keep-outs around set pieces (raise by 0 = no height change)
  { at: { s: 3290, l: 20 }, r: 40, falloff: 0, mode: 'raise', h: 0, noScatter: true },
  { at: { s: 1470, l: -60 }, r: 30, falloff: 0, mode: 'raise', h: 0, noScatter: true },
];

// ── structures (all types are level-only, registered by levels/level01/structures.js; A2 #16) ─────────────────
const ridge = (at, yaw, length, h, seed, extra = {}) => ({ type: 'pressure_ridge', at, yaw, params: { length, h, seed, ...extra } });
const az = (a) => ({ azimuth: a });
/** ice_cliff segments along the sawn shelf edge polyline (absolute y 0: the shelf surface) */
function cliffSegments(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const a = Math.atan2(x1 - x0, -(z1 - z0)) * 180 / Math.PI;   // azimuth of the segment direction
    out.push({ type: 'ice_cliff', at: { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 0 }, yaw: az(a), params: { length: Math.round(len + 6), h: 80, seed: 40 + i } });
  }
  return out;
}

const ZONES = [
  { id: 'z_cut', range: [0, 320], name: 'The Cut', card: { title: 'THE CUT', sub: 'West edge, Rime Shelf' },
    art: ART_NIGHT, artBlend: 3,
    structures: [
      { id: 'block1', type: 'ice_block', at: { s: 115, l: -55 }, yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block', team: 'neutral' } },
      { id: 'block2', type: 'ice_block', at: { s: 165, l: 45 }, yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block', team: 'neutral' } },
      { id: 'block3', type: 'ice_block', at: { s: 215, l: -35 }, yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block', team: 'neutral' } },
      { id: 'sled1', type: 'ice_sled', at: { s: 160, l: -5 }, yaw: 'route', state: 'loaded0', params: { paint: 'SECOND PATIENCE' } },
      ...[[60, -40], [100, 60], [140, -90], [190, 80], [230, -70], [270, 30]].map(([s, l]) => ({ type: 'wake_lamp', at: { s, l }, params: { h: 7 } })),
      { type: 'tank_cairn', at: { s: 40, l: 70 }, params: { n: 9 } },
      { type: 'wake_board', at: { s: 70, l: 40 }, yaw: az(250), params: { text: 'SECOND PATIENCE · CUT 4' } },
      { type: 'block_stack', at: { s: 80, l: 95 }, yaw: az(20), params: { rows: 2, crates: true } },   // tool crates (windbreak cut, A1.3)
      ridge({ x: -1488, z: 22 }, az(8), 220, 14, 1),                                 // west wall (the Dark beyond)
      ridge({ s: 120, l: -150 }, 'route', 120, 12, 2),                                // north wall (gap s 180..280)
      ridge({ s: 300, l: -128 }, 'route', 50, 14, 3),
      ridge({ s: 165, l: 140 }, 'route', 270, 12, 4),                                 // south wall
      ridge({ s: 312, l: -40 }, 'route', 62, 16, 5),                                  // the east gully, north side
      ridge({ s: 312, l: 40 }, 'route', 62, 16, 6),                                   // the east gully, south side
      { id: 'snowBridge', type: 'snow_bridge', at: { x: -1107, z: 32, y: 0 }, yaw: 'route', params: { span: 70, width: 56 }, state: 'intact' },
    ] },

  { id: 'z_under', range: [320, 640], name: 'Under the Ice',          // no card: the player arrives during the boot
    art: ART_UNDER, artBlend: 1.5,
    structures: [
      ...Array.from({ length: 10 }, (_, i) => ({ type: 'ice_vault', at: { s: 345 + i * 30, h: 16 }, yaw: 'route',
                                                 params: { span: i < 3 ? 104 : 72, depth: 30, seed: 20 + i } })),
      ...Array.from({ length: 10 }, (_, i) => [-1, 1].map(sd => ({ type: 'ice_wall', at: { s: 345 + i * 30, l: sd * (i < 3 ? 48 : 33) },
                                                                    yaw: 'route', params: { length: 32, h: 22, seed: 60 + i * 2 + (sd > 0 ? 1 : 0) } }))).flat(),
      { id: 'cutterWreck', type: 'cutter_wreck', at: { s: 345, l: 12 }, yaw: az(150) },
      { id: 'alcove', type: 'moth_alcove', at: { s: 377, l: -26 }, yaw: az(63), state: 'sealed' },
      { type: 'founders_pod', at: { s: 430, l: 26 }, yaw: az(200), params: { size: 1 } },
      { type: 'founders_pod', at: { s: 540, l: -26 }, yaw: az(40), params: { size: 1.2 } },
      ...[[505, -14], [515, 12], [528, -4], [540, 18]].map(([s, l], i) => ({ type: 'ice_pillar', at: { s, l }, params: { h: 18, r: 4, seed: 80 + i } })),
      { id: 'shaft', type: 'shaft_ring', at: { s: 625 }, params: { r: 12, h: 34 } },
    ] },

  { id: 'z_teeth', range: [640, 1350], name: 'The Teeth', card: { title: 'THE TEETH', sub: 'Pressure ridges' },
    art: ART_TEETH, artBlend: 3,                                       // also undoes ART_UNDER
    structures: [
      // the maze: rows of rafted slabs with side leads at s 800, 1010 and 1240 (L1 §2.6 Z3)
      ridge({ s: 735, l: -112 }, 'route', 110, 14, 11), ridge({ s: 905, l: -115 }, 'route', 170, 18, 12),
      ridge({ s: 1125, l: -118 }, 'route', 200, 20, 13), ridge({ s: 760, l: -235 }, 'route', 150, 16, 14),
      ridge({ s: 950, l: -270 }, 'route', 120, 18, 15), ridge({ s: 1160, l: -235 }, 'route', 160, 22, 16),
      ridge({ s: 740, l: 125 }, 'route', 100, 13, 17), ridge({ s: 845, l: 140 }, 'route', 60, 15, 18),
      ridge({ s: 1100, l: 140 }, 'route', 180, 20, 19), ridge({ s: 770, l: 250 }, 'route', 150, 16, 20),
      ridge({ s: 975, l: 255 }, 'route', 140, 18, 21), ridge({ s: 1185, l: 240 }, 'route', 150, 22, 22),
      // Kit's dead end: a short side lead closed by ridges, Tick wedged at s 900 l +70
      ridge({ s: 878, l: 98 }, az(30), 46, 12, 23), ridge({ s: 930, l: 112 }, az(30), 60, 14, 24),
      // hummocks in the lead (cover)
      ridge({ s: 960, l: -45 }, az(60), 36, 8, 25, { rubble: true }), ridge({ s: 1060, l: 55 }, az(110), 40, 9, 26, { rubble: true }),
      ridge({ s: 1215, l: -30 }, az(80), 34, 8, 27, { rubble: true }),
      // the pass that frames the Abeyance (25 m)
      ridge({ s: 1300, l: -58 }, 'route', 64, 25, 28), ridge({ s: 1300, l: 58 }, 'route', 64, 25, 29),
      ridge({ s: 1265, l: -150 }, 'route', 70, 18, 30), ridge({ s: 1265, l: 150 }, 'route', 70, 18, 31),
      { id: 'wreckA', type: 'skiff_wreck', at: { s: 1130, l: -40 }, yaw: az(70), tag: 'harvest', params: { seed: 1 } },
      { id: 'wreckB', type: 'skiff_wreck', at: { s: 1160, l: 35 }, yaw: az(250), tag: 'harvest', params: { seed: 2 } },
      { id: 'wreckOld', type: 'skiff_wreck', at: { s: 1010, l: -178 }, yaw: az(10), params: { seed: 3, frozen: true } },
      { type: 'tank_cairn', at: { s: 760, l: 40 }, params: { n: 6 } },
    ] },

  { id: 'z_abeyance', range: [1350, 1700], name: 'The Abeyance', card: { title: 'THE ABEYANCE', sub: 'Frozen freighter' },
    art: ART_ABEY, artBlend: 4,
    structures: [
      { id: 'abeyance', type: 'abeyance', at: { s: ABEY_S, l: 0 }, yaw: 'route', params: { tilt: 7, height: 140 } },
      { id: 'pad', type: 'gleaner_pad', at: { s: 1470, l: -60 }, yaw: 'route' },
      { id: 'padRack', type: 'drum_rack', at: { s: 1478, l: -60, h: 3 }, yaw: 'route', tag: 'harvest', params: { n: 4 } },
      ...[[1540, -7.5], [1540, 7.5], [1550, -7.5], [1550, 7.5], [1560, -7.5], [1560, 7.5]].map(([s, l], i) =>
         ({ id: 'rack' + i, type: 'drum_rack', at: { s, l }, yaw: 'route', tag: 'harvest', params: { n: 8 } })),
      { id: 'winchLock', type: 'winch_lock', at: abey(-10.2, 0, -2), yaw: 'route',
        destructible: { ap: 1500, name: 'WINCH LOCK', tag: 'winch', objective: true } },
      { id: 'sled2', type: 'ice_sled', at: { s: 1529, l: -3 }, yaw: 'route', state: 'loaded3', params: { paint: 'HARDTACK' } },
      ...[[1400, -40], [1415, 22], [1450, 55], [1460, -110], [1490, 30], [1500, -22], [1420, 72], [1428, 60]].map(([s, l], i) =>
         ({ type: 'founders_pod', at: { s, l }, yaw: az(i * 47), params: { size: 1 + (i % 3) * 0.15 } })),
      { type: 'block_stack', at: { s: 1405, l: 95 }, yaw: az(40), params: { rows: 3 } },
    ] },

  { id: 'z_cutline', range: [1700, 2500], name: 'The Cut-line', card: { title: 'THE CUT-LINE', sub: 'Dredge harvest ground' },
    // the pre-dawn art is applied by onEnter so that re-entering after the sunrise keeps the dawn (index.js re-asserts it)
    art: ART_PREDAWN, artBlend: 6, music: DREDGE,
    structures: [
      ...[[1850, -120, 4], [1900, 90, 4], [2050, 200, 4], [2100, -260, 4], [1960, -130, 3], [2160, 40, 2]].map(([s, l, rows]) =>
         ({ type: 'block_stack', at: { s, l }, yaw: 'route', params: { rows } })),
      ...cliffSegments(DATA.shelfEdge),
    ] },

  { id: 'z_floes', range: [2500, 3130], name: 'The Floes', card: { title: 'THE FLOES' },
    art: ART_FLOES, artBlend: 4, music: DAWN },

  { id: 'z_shore', range: [3130, 3400], name: 'The Shore', card: { title: 'THE SHORE', sub: 'The Wake' },
    art: ART_SHORE, artBlend: 6,
    structures: [
      { id: 'hole', type: 'fast_ice_hole', at: { s: 3185, l: -20 }, params: { r: 4.5 } },
      { id: 'bench', type: 'bench_crawler', at: { s: 3296, l: 20 }, yaw: az(270) },
      { type: 'wake_rig', at: { s: 3268, l: 85 }, yaw: az(250), params: { kind: 'walker', name: 'SECOND PATIENCE', seed: 2 } },
      { type: 'wake_rig', at: { s: 3325, l: -75 }, yaw: az(200), params: { kind: 'train', name: 'BIG MERCY', seed: 3 } },
      { type: 'wake_rig', at: { s: 3312, l: 150 }, yaw: az(260), params: { kind: 'crawler', name: 'COMPASS ROSE', seed: 4 } },
    ] },
];
const L1_TYPES = new Set(ZONES.flatMap(z => (z.structures || []).map(e => e.type)));
/** the zones without level-only structure types (used when the types cannot be registered before World.load) */
const ZONES_BARE = ZONES.map(z => ({ ...z, structures: (z.structures || []).filter(e => !L1_TYPES.has(e.type)) }));

// ── encounters (L1 §5; haul ids are engine ids, A2 #14) ───────────────────────────────────────────────────────
const SKIFF = 'RAIDER SKIFF';
const encounters = [
  { id: 'e_raid', persist: false, units: [
      { kind: 'skiff', at: { s: 150, l: -330 }, opts: { name: SKIFF, tags: ['raid', 'raid_g1'], behavior: 'scripted', targetable: false,
        config: { variant: 'gaffer', script: 'raidSled', faction: 'dredge' } } },
      { kind: 'skiff', at: { s: 240, l: -340 }, opts: { name: SKIFF, tags: ['raid', 'raid_g2'], behavior: 'scripted', targetable: false,
        config: { variant: 'gaffer', script: 'rakeCutter', faction: 'dredge' } } },
      { kind: 'skiff', at: { s: 300, l: -300 }, opts: { name: SKIFF, tags: ['raid', 'raid_s1'], behavior: 'scripted', targetable: false,
        config: { variant: 'sleet', script: 'rakeCutter', faction: 'dredge' } } } ] },

  { id: 'e_pin', units: [
      { kind: 'skiff', at: { s: 960, l: 40 }, opts: { name: SKIFF, tags: ['pin', 'sled1tow'],
        config: { variant: 'gaffer', haul: 'harpoon_gaff', circle: { s: 900, l: 70 }, towing: 'sled1' } } },
      { kind: 'skiff', at: { s: 990, l: 110 }, opts: { name: SKIFF, tags: ['pin'],
        config: { variant: 'sleet', haul: 'shotgun_s8', circle: { s: 900, l: 70 } } } } ],
    waves: [ { when: { remaining: 1 }, units: [
      { kind: 'skiff', at: { s: 1080, l: -60 }, opts: { name: SKIFF, tags: ['pin'], config: { variant: 'gaffer', haul: 'harpoon_gaff', startAp: 1400, lead: 0 } } },
      { kind: 'skiff', at: { s: 1100, l: 20 }, opts: { name: SKIFF, tags: ['pin'], config: { variant: 'sleet', haul: 'shotgun_s8', lead: 0 } } } ] } ] },

  { id: 'e_gleaners', units: [
      { kind: 'gleaner', count: 3, at: { s: 1130, l: -40, h: 6 }, spread: 12, opts: { name: 'GLEANER', config: { mode: 'harvest', target: 'wreckA' } } },
      { kind: 'gleaner', count: 3, at: { s: 1160, l: 35, h: 6 }, spread: 12, opts: { name: 'GLEANER', config: { mode: 'harvest', target: 'wreckB' } } } ],
    waves: [ { when: { delay: 25 }, units: [
      { kind: 'gleaner_carrier', at: { s: 1500, l: -100, h: 70 }, opts: { name: 'GLEANER CARRIER', tags: ['carrier', 'carrier1'],
        config: { hold: { s: 1180, l: -20, h: 38 }, deploy: { every: 12, per: 2, max: 4, cap: 6 }, flares: 3, haul: 'flare_pod', leaveAfter: 90 } } } ] } ] },

  { id: 'e_apron', units: [
      { kind: 'mech', at: { s: 1470, l: -40 }, opts: { name: 'SEXTON', tags: ['sexton'], boss: true, behavior: 'guard', leash: 140, faction: 'ghost',
        config: { design: 'bastion', faction: 'ghost', ap: 11000, impMax: 2400, aggression: 0.8, dodge: 0.5, preferRange: 40,
                  weapons: ['mg', 'blade'], rifleDmg: 120, bladeDmg: 1800, phases: [{ at: 0.5, aggression: 1.0, add: ['shock'] }] } } },
      { kind: 'gleaner_carrier', at: { s: 1470, l: -60, h: 35 }, opts: { name: 'GLEANER CARRIER', tags: ['carrier', 'carrier2'],
        config: { hold: { s: 1470, l: -60, h: 35 }, deploy: { every: 12, per: 2, max: 6, cap: 3 }, flares: 3, haul: 'flare_pod', flareOnMissiles: true } } },
      { kind: 'gleaner', count: 3, at: { s: 1480, l: -95, h: 10 }, spread: 15, opts: { name: 'GLEANER', config: { mode: 'defend' } } } ] },

  // e_shaft keeps only its floor-2 group (A1.3 trim)
  { id: 'e_shaft', units: [
      { kind: 'gleaner', count: 2, at: abey(-4, 50, 6), spread: 6, opts: { name: 'GLEANER', config: { mode: 'defend', indoor: true } } } ] },

  { id: 'e_hold', units: [
      { kind: 'gleaner', count: 2, at: { s: 1550, l: 0, h: 10 }, spread: 6, opts: { name: 'GLEANER', config: { mode: 'defend', indoor: true } } } ] },

  { id: 'e_field', units: [
      { kind: 'skiff', at: { s: 1900, l: 90 }, opts: { name: SKIFF, tags: ['field'], config: { variant: 'sleet', haul: 'shotgun_s8' } } },
      { kind: 'skiff', at: { s: 2000, l: -150 }, opts: { name: SKIFF, tags: ['field'], config: { variant: 'gaffer', haul: 'harpoon_gaff' } } } ] },

  { id: 'e_icebreaker', units: [
      { kind: 'icebreaker', at: [590, -340], opts: { name: 'ICEBREAKER', tags: ['icebreaker'], boss: true, targetable: false, yaw: Math.PI,
        config: { heads: { port: 8000, stbd: 8000, bow: 14000 }, turrets: 2, skiffLaunch: { every: [40, 50], max: 3 } } } } ] },

  { id: 'e_floes', persist: false, units: [
      { kind: 'skiff', at: [1000, -80], opts: { name: SKIFF, tags: ['floeskiff'], config: { variant: 'sleet', water: true, lead: 0, haul: 'shotgun_s8' } } },
      { kind: 'skiff', at: [1150, 75], opts: { name: SKIFF, tags: ['floeskiff'], config: { variant: 'gaffer', water: true, lead: 1, haul: 'harpoon_gaff' } } },
      { kind: 'skiff', at: [1250, 270], opts: { name: SKIFF, tags: ['floeskiff'], config: { variant: 'sleet', water: true, lead: 2, haul: 'shotgun_s8' } } } ] },
];

// ── helpers for action lists ───────────────────────────────────────────────────────────────────────────────────
const disable = (...ids) => ids.map(id => ({ disable: id }));
const flags = (...names) => names.map(n => ({ flag: [n, true] }));
const done = (...ids) => ids.map(id => ({ objective: { complete: id } }));
const add = (...ids) => ids.map(id => ({ objective: { add: id } }));
const ifNone = (tag, then) => ({ if: { not: { custom: 'unitAlive', args: { tag } } }, then });
const HINT = {
  walk: { desktop: 'W A S D to walk', touch: 'Left thumb to walk' },
  saw: { desktop: 'Right click to saw', touch: 'Tap BLADE to saw' },
  jump: { desktop: 'Space to jump. Hold it in the air to hover. Hover burns EN.', touch: 'JUMP. Hold it in the air to hover.' },
  lock: { desktop: 'Aim near a target to lock on. Left click fires. E holds the lock.', touch: 'Aim near a target to lock on. FIRE shoots. LOCK holds it.' },
  qb: { desktop: 'Shift + direction to quick boost. Snaps harpoon cables.', touch: 'BOOST + direction to dash. Snaps harpoon cables.' },
  tear: { desktop: 'Hold right click to TEAR', touch: 'Hold BLADE to TEAR' },
  flag: { desktop: 'F to flag the sledge', touch: 'INTERACT to flag the sledge' },
  blade: { desktop: 'Right click to lunge with the blade. It finds your locked target.', touch: 'BLADE lunges at your locked target.' },
  msl: { desktop: 'Q fires missiles at everything inside the reticle.', touch: 'MSL fires missiles at everything in the reticle.' },
  kit: { desktop: 'R uses a repair kit. You have 3.', touch: 'KIT uses a repair kit. You have 3.' },
  rise: { desktop: 'Hold Space to rise', touch: 'Hold JUMP to rise' },
};
// earlier triggers whose conditions are true further along the route (cold starts disable them; see the header)
const SEG_Z2 = ['t_look', 't_block1_near', 't_raid', 't_raid_failsafe', 't_collapse'];
const SEG_Z3 = [...SEG_Z2, 't_name', 't_signal', 't_shaft', 't_out', 't_kitflare'];
const SEG_Z4 = [...SEG_Z3, 't_pin', 't_qb', 't_tear', 't_tear_failsafe', 't_gleaners', 't_blade', 't_abeyance_view', 't_idle_north', 't_pin_clear', 't_burn'];
const SEG_Z5 = [...SEG_Z4, 't_apron', 't_repair', 't_floor2', 't_stencil', 't_crown', 't_hold_sled', 't_enemy_flares', 't_surge'];
const SEG_HARVEST = [...SEG_Z5, 't_field', 't_head1', 't_head2', 't_pa2', 't_harvest', 't_crack', 't_spotlight', 't_heads_hint'];
const SEG_Z6 = [...SEG_HARVEST, 't_collar', 't_finale', 't_hull_hint'];

// ── triggers ─────────────────────────────────────────────────────────────────────────────────────────────────
const triggers = [
  // Z1 · the cut (fresh starts only)
  { id: 't_look', when: { objective: 'o_look' }, do: [
      { comms: 'c_watchNorth' }, { call: 'kite', args: { follow: 'tick', h: 85, side: 'north' } }, ...add('o_cut'), { hint: HINT.walk } ] },
  { id: 't_block1_near', when: { enter: { at: { s: 115, l: -55 }, r: 30 } }, after: 't_look', do: [
      { comms: 'c_block1_near' }, { hint: HINT.saw } ] },
  { id: 't_block1', when: { structure: 'block1', state: 'destroyed' }, do: [{ comms: 'c_block1' }, { call: 'sledLoad', args: { n: 1 } }] },
  { id: 't_block2', when: { structure: 'block2', state: 'destroyed' }, do: [{ comms: 'c_block2' }, { call: 'sledLoad', args: { n: 2 } }] },
  { id: 't_block3', when: { structure: 'block3', state: 'destroyed' }, do: [{ comms: 'c_block3' }, { call: 'sledLoad', args: { n: 3 } }] },
  { id: 't_raid', when: { objective: 'o_cut' }, do: [
      { wait: 2 }, { music: { stinger: 'dread' } }, { call: 'skiffLights' }, { comms: 'c_lights', wait: true },
      { call: 'kite', args: { land: true } },
      { call: 'tick', args: { path: [{ s: 200, l: 120 }, { s: 300, l: 60 }, { s: 330, l: 300 }], speed: 16, hideAtEnd: true } },
      { spawn: 'e_raid' }, { music: { theme: DREDGE } }, { call: 'vitals', args: { spike: 128 } },
      { wait: 4 }, { comms: 'c_raid_sled' },
      { wait: 4 }, { comms: 'c_raid_gully' }, ...add('o_gully') ] },
  { id: 't_raid_hit', when: { custom: 'playerHit' }, after: 't_raid', do: [{ comms: 'c_raid_hit' }] },
  { id: 't_raid_failsafe', when: { all: [{ timer: 25, since: 't_raid' }, { not: { pass: 260 } }] }, after: 't_raid', do: [
      { call: 'raidTowCutter', args: { to: { s: 324 } } }] },          // onto the snow bridge: the collapse follows
  { id: 't_collapse', when: { pass: 318 }, after: 't_raid', do: [{ event: 'collapse' }] },

  // Z2 · under the ice
  { id: 't_name', when: { all: [{ pass: 460 }, { flag: 'p:awake' }] }, do: [{ comms: 'c_name' }] },
  { id: 't_signal', when: { all: [{ pass: 560 }, { flag: 'p:awake' }] }, do: [{ comms: 'c_signal' }] },
  { id: 't_shaft', when: { all: [{ enter: { at: { s: 625 }, r: 26 } }, { flag: 'p:awake' }] }, do: [
      { call: 'abilities', args: { preset: 'jump' } }, { comms: 'c_shaft' }, { hint: HINT.jump },
      ...done('o_up'), ...add('o_climb') ] },
  { id: 't_out', when: { all: [{ custom: 'aboveY', args: { y: 8, near: { s: 625 }, r: 40 } }, { flag: 'p:awake' }] }, after: 't_shaft', do: [
      ...flags('outOfShaft'), ...done('o_climb'), { checkpoint: 'cp_ridges' }, { music: { theme: NIGHT } },
      { call: 'tick', args: { park: { s: 900, l: 70 }, pinned: true, show: true } }, { call: 'kite', args: { follow: 'tick', h: 80 } },
      { comms: 'c_kit_reconnect', wait: true }, ...add('o_kit') ] },
  { id: 't_kitflare', when: { custom: 'commsLine', args: { text: 'Coming. Put up a flare.' } }, do: [
      { wait: 1.2 }, { call: 'kitFlare', args: { from: { s: 900, l: 70 }, at: { s: 900, l: 70, h: 180 }, burst: true } } ] },

  // Z3 · the Teeth
  { id: 't_idle_north', when: { all: [{ enterZone: 'z_teeth' }, { custom: 'idleNorthReached' }] }, do: [{ comms: 'c_idle_north' }] },
  { id: 't_pin', when: { all: [{ pass: 820 }, { flag: 'outOfShaft' }] }, do: [
      { spawn: 'e_pin' }, { music: { theme: DREDGE } }, { waitFor: { custom: 'enemyWithin', args: { r: 300 } }, timeout: 10 },
      { call: 'abilities', args: { preset: 'lock' } }, { comms: 'c_pin' }, { hint: HINT.lock },
      ...done('o_kit'), ...add('o_skiffs'), ...flags('p:pin') ] },
  { id: 't_qb', when: { any: [{ custom: 'harpoonTelegraph' }, { timer: 45, since: 't_pin' }] }, after: 't_pin', do: [
      { call: 'abilities', args: { add: ['boost'] } }, { comms: 'c_qb' }, { hint: HINT.qb } ] },
  { id: 't_stagger_hint', when: { all: [{ custom: 'anyStaggered' }, { flag: 'p:pin' }] }, do: [
      { hint: 'Staggered targets take extra damage, and loose parts can be torn off.' } ] },
  { id: 't_tear', when: { custom: 'tearAvailable', args: { r: 40 } }, after: 't_pin', do: [
      { comms: 'c_tear' }, { hint: HINT.tear } ] },
  { id: 't_first_tear', when: { all: [{ custom: 'rackCount', args: { gte: 1 } }, { flag: 'outOfShaft' }] }, do: [
      { call: 'hudPanels', args: { rack: true } }, { hint: 'HAUL 1/3. Parts go to the Bench at the end of the walk.' }, { comms: 'c_first_tear' } ] },
  { id: 't_tear_failsafe', when: { all: [{ cleared: 'e_pin' }, { not: { custom: 'rackCount', args: { gte: 1 } } }] }, do: [
      { spawn: { kind: 'skiff', at: { s: 1120, l: 0 }, opts: { name: SKIFF, tags: ['pin3'],
        config: { variant: 'gaffer', haul: 'harpoon_gaff', startAp: 1000, staggerOnFirstHit: true, lead: 0 } } } } ] },
  { id: 't_sled1', when: { killed: { tag: 'sled1tow' } }, do: [
      { comms: 'c_sled1' }, ...add('o_sled1'), { call: 'flagSled', args: { id: 'sled1' } }, { hint: HINT.flag } ] },
  { id: 't_sled1_done', when: { flag: 'sled1' }, do: [{ comms: 'c_sled1_done' }, ...done('o_sled1')] },
  { id: 't_pin_wave', when: { custom: 'waveStarted', args: { encounter: 'e_pin', wave: 1 } }, do: [{ comms: 'c_pin_wave' }] },
  { id: 't_pin_clear', when: { cleared: 'e_pin' }, do: [
      ...flags('p:pinClear'), { music: { theme: NIGHT } }, { comms: 'c_pin_clear', wait: true },
      { call: 'tick', args: { path: [{ s: 960, l: 30 }, { s: 1000, l: 10 }], speed: 10, pinned: false } },
      { wait: 4 }, { comms: 'c_whatfor' } ] },
  { id: 't_gleaners', when: { all: [{ pass: 1060 }, { flag: 'p:pinClear' }] }, do: [
      { spawn: 'e_gleaners' }, { music: { stinger: 'dread' } }, { comms: 'c_gleaners' }, ...add('o_wrecks'), ...flags('p:gleaners') ] },
  { id: 't_blade', when: { any: [{ custom: 'enemyWithin', args: { r: 30, kind: 'gleaner' } }, { timer: 8, since: 't_gleaners' }] }, after: 't_gleaners', do: [
      { call: 'abilities', args: { add: ['blade'] } }, { comms: 'c_blade' }, { hint: HINT.blade } ] },
  { id: 't_blade_kill', when: { custom: 'bladeKill' }, after: 't_blade', do: [{ comms: 'c_blade_kill' }] },
  { id: 't_carrier', when: { custom: 'waveStarted', args: { encounter: 'e_gleaners', wave: 1 } }, do: [{ music: { theme: DREDGE } }, { comms: 'c_carrier' }] },
  { id: 't_burn', when: { cleared: 'e_gleaners' }, do: [
      ...flags('p:burn'), { music: { theme: NIGHT } }, { comms: 'c_burn', wait: true }, { call: 'burnWrecks', args: { zone: 'z_teeth' } },
      ...add('o_abeyance'), { call: 'tick', args: { follow: 'player', distance: 90 } } ] },
  { id: 't_abeyance_view', when: { all: [{ pass: 1290 }, { flag: 'p:burn' }] }, do: [{ comms: 'c_abeyance' }] },

  // Z4 · the Abeyance
  { id: 't_apron', when: { all: [{ pass: 1370 }, { flag: 'p:burn' }] }, do: [
      { checkpoint: 'cp_abeyance' }, ...flags('p:apron'), { call: 'tick', args: { park: { s: 1360, l: 50 } } },
      { spawn: 'e_apron' }, { music: { stinger: 'dread' } }, { comms: 'c_ghost', wait: true },
      { music: { theme: DREDGE } }, { call: 'abilities', args: { add: ['missile'] } }, { comms: 'c_missiles' }, { hint: HINT.msl },
      ...done('o_abeyance'), ...add('o_sexton') ] },
  { id: 't_enemy_flares', when: { custom: 'carrierFlared' }, do: [{ comms: 'c_enemy_flares' }] },
  { id: 't_surge', when: { health: { tag: 'sexton', below: 0.5 } }, do: [{ comms: 'c_surge' }] },
  { id: 't_repair', when: { all: [{ flag: 'p:apron' }, { any: [{ health: { below: 0.55 } }, { killed: { tag: 'sexton' } }] }] }, do: [
      { call: 'abilities', args: { add: ['kit'] } }, { comms: 'c_repair' }, { hint: HINT.kit } ] },
  { id: 't_sexton_dead', when: { killed: { tag: 'sexton' } }, do: [
      ...flags('p:sexton'), { music: { theme: NIGHT } }, { wait: 3 }, { comms: 'c_drums', wait: true },
      ...add('o_climb2'), { comms: 'c_climb' },
      { call: 'tick', args: { path: [{ s: 1500, l: 0 }, { s: 1545, l: 3 }, { s: 1625, l: 30 }], speed: 6, parkAtEnd: true } } ] },
  { id: 't_hold_sled', when: { custom: 'tickAt', args: { s: 1540, r: 14 } }, do: [
      { comms: 'c_hardtack' }, { spawn: 'e_hold' }, ...add('o_sled2'),
      { marker: { id: 'm_winch', at: abey(-10.2, 8, -2), label: 'WINCH', kind: 'poi' } } ] },
  { id: 't_winch', when: { structure: 'winchLock', state: 'destroyed' }, do: [
      { marker: { remove: 'm_winch' } }, { call: 'flagSled', args: { id: 'sled2' } } ] },
  { id: 't_sled2_done', when: { flag: 'sled2' }, do: [{ comms: 'c_hardtack_done' }, ...done('o_sled2')] },
  { id: 't_floor2', when: { all: [{ custom: 'aboveY', args: { y: 40, near: { s: ABEY_S }, r: 45 } }, { flag: 'p:sexton' }] }, do: [
      { spawn: 'e_shaft' }, { comms: 'c_shaft_gleaners' } ] },
  { id: 't_stencil', when: { all: [{ custom: 'aboveY', args: { y: 62, near: { s: ABEY_S }, r: 45 } },
                                   { custom: 'nearAnchor', args: { id: 'abeyance', anchor: 'stencil', r: 25 } }] }, do: [
      { parallel: [ [{ cinematic: 'stencil' }], [{ call: 'stencilLight', args: { on: true } }, { call: 'mothStops', args: { seconds: 2 } }] ] },
      { comms: 'c_stencil' } ] },
  { id: 't_crown', when: { all: [{ custom: 'aboveY', args: { y: 119, near: { s: ABEY_S }, r: 50 } }, { flag: 'p:sexton' }] }, do: [
      ...flags('crown'), ...done('o_climb2'), { music: { stinger: 'boss' } },
      { parallel: [ [{ cinematic: 'cutlineReveal' }], [{ wait: 0.5 }, { comms: 'c_cutline', wait: true }] ] },
      { comms: 'c_detour' }, { call: 'kite', args: { follow: 'player', h: 90 } },
      { call: 'tick', args: { path: [{ s: 1660, l: -120 }, { s: 1700, l: -330 }], speed: 12, hideAtEnd: true } },
      ...add('o_heads') ] },

  // Z5 · the cut-line
  { id: 't_field', when: { all: [{ pass: 1720 }, { flag: 'crown' }, { custom: 'onGround' }] }, do: [
      { checkpoint: 'cp_cutline' }, ...flags('p:field'), { spawn: 'e_field' }, { spawn: 'e_icebreaker' },
      { music: { theme: DREDGE, intensity: 1 } }, { comms: 'c_pa1' } ] },
  { id: 't_heads_hint', when: { timer: 15, since: 't_field' }, do: [{ comms: 'c_heads_hint' }] },
  { id: 't_hull_hint', when: { custom: 'hullHit' }, do: [{ hint: 'ARMOURED. Hit the drill heads.' }] },
  { id: 't_spotlight', when: { custom: 'inFloodlight' }, do: [{ comms: 'c_spotlight' }] },
  { id: 't_head1', when: { killed: { tag: 'drillhead', count: 1 } }, do: [{ comms: 'c_head1' }] },
  { id: 't_crack', when: { custom: 'sawSweep' }, do: [{ comms: 'c_crack' }] },
  { id: 't_pa2', when: { timer: 20, since: 't_head1' }, do: [{ comms: 'c_pa2' }] },
  { id: 't_head2', when: { killed: { tag: 'drillhead', count: 2 } }, do: [{ comms: 'c_head2' }] },
  { id: 't_harvest', when: { flag: 'ib:phase', eq: 3 }, do: [{ checkpoint: 'cp_harvest' }, { comms: 'c_auger' }] },
  { id: 't_collar', when: { custom: 'collarHitFromAbove' }, do: [{ hint: 'Get below the collar. Fire from the Raft.' }] },
  { id: 't_finale', when: { killed: { tag: 'drillhead', count: 3 } }, do: [{ event: 'finale' }] },

  // Z6 · the floes (the sprint's flags gate them, so cold starts at cp_floes work)
  { id: 't_rot', when: { all: [{ flag: 'p:sprint' }, { any: [{ custom: 'touchedGold' }, { custom: 'sprintTime', args: { gte: 12 } }] }] }, do: [
      { comms: 'c_rot' }, { hint: 'Gold ice breaks soon after you land on it. Blue ice holds.' } ] },
  { id: 't_sink', when: { all: [{ flag: 'p:sprint' }, { custom: 'sprintTime', args: { gte: 8 } }] }, do: [
      { call: 'icebreakerSink' }, { wait: 2 }, { comms: 'c_sink' } ] },
  { id: 't_leads', when: { custom: 'skiffRun' }, after: 't_sink', do: [{ comms: 'c_leads' }] },
  { id: 't_hunt', when: { all: [{ flag: 'l01:hunt' }, { custom: 'enemyWithin', args: { r: 120, kind: 'gleaner' } }] }, do: [{ comms: 'c_hunt' }] },
  { id: 't_sled3', when: { all: [{ flag: 'p:sprint' }, { any: [{ enter: { at: [1010, 262], r: 220 } }, { custom: 'sprintTime', args: { gte: 25 } }] }] }, do: [
      { comms: 'c_sled3' }, ...add('o_sled3'), { call: 'flagSled', args: { id: 'sled3' } } ] },
  { id: 't_sled3_done', when: { flag: 'sled3' }, do: [{ comms: 'c_sled3_done' }, ...done('o_sled3')] },
  { id: 't_sled3_lost', when: { flag: 'sled3Lost' }, do: [{ comms: 'c_sled3_lost' }, { objective: { fail: 'o_sled3' } }] },
  { id: 't_withme', when: { all: [{ flag: 'p:sprint' }, { any: [
      { all: [{ custom: 'sprintTime', args: { gte: 75 } }, { not: { custom: 'enemyWithin', args: { r: 150 } } }] },
      { custom: 'sprintTime', args: { gte: 110 } }] }] }, do: [{ comms: 'c_withme' }] },
  { id: 't_lastbit', when: { all: [{ pass: 3060 }, { flag: 'p:sprint' }] }, do: [{ comms: 'c_lastbit' }] },

  // Z7 · the shore
  { id: 't_shore', when: { all: [{ pass: 3130 }, { flag: 'p:sprint' }] }, do: [{ event: 'shore' }] },
  { id: 't_bench', when: { objective: 'o_bench' }, do: [{ event: 'naming' }] },
];

// ── the level ────────────────────────────────────────────────────────────────────────────────────────────────
const def = {
  id: 'l01', title: 'THAW', subtitle: 'The Rime Shelf', order: 1, seed: 116001,
  par: { time: 1080, damage: 18000 },
  campaign: { bench: true, waterFlags: ['sled1', 'sled2', 'sled3'] },   // A3.7, A5.6

  briefing: {
    header: 'THE WAKE · CUT ORDER', title: 'THAW', subtitle: 'The Rime Shelf',
    body: 'Edge is coming. Wake rolls at first light.\n' +
          'Three blocks from the west cut before we go. Take the cutter and the boy. The boy flies, you cut.\n' +
          "Don't go past the ridges. Don't wait for the sun.\n" +
          '— O. Desh, the Bench',
    objectives: ['Cut three blocks', 'Back before the sun'], fine: 'Keep up.', showMap: false,
  },
  intro: [{ style: 'black', hold: 9, text:
    'GAUNT. One day lasts ten years. The dawn walks west, eleven kilometres a day. Behind it, the ground burns. ' +
    'Ahead of it, the sea is ice. Between them, for a few hundred kilometres, there is water. We follow it.' }],
  outro: [],                      // the Bench and the Morning Count follow through flow (A3.7)
  unlocks: { levels: ['l02'] },   // L1 awards no parts (A2 #12)

  // SpeakerDef additions are A5.2's; MOTH fixed per A2 #24. The label changes to MOTH only at the naming.
  speakers: {
    JUNO:      { name: 'JUNO', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
                 channel: 'LOCAL', font: 'sans', speed: 1.0, static: 0 },
    MOTH:      { name: 'CANTOR 7', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal',
                 channel: 'LOCAL', font: 'monoCaps', speed: 1 },
    KIT:       { name: 'KIT · TICK', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 }, style: 'radio',
                 channel: 'WAKE', speed: 1.4, static: 0.25 },
    OMA:       { name: 'OMA · BENCH', color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' }, style: 'radio',
                 channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
    FOREMAN:   { name: '', color: '#e9d79a', voice: { base: 140, wave: 'sine' }, style: 'intercept',
                 channel: 'OPEN', speed: 0.7, italic: true, static: 0, chime: true },
    BOOT:      { name: '', color: '#9fb8c4', voice: { base: 900, wave: 'square' }, style: 'system',
                 font: 'monoCaps', speed: 1.8 },
    DREDGE_PA: { name: 'DREDGE · ICEBREAKER', color: '#d0583a', voice: { base: 160, wave: 'sawtooth', jitter: 0.3 },
                 style: 'intercept', channel: 'DREDGE', speed: 1.0, static: 0.7 },
  },

  factions: {   // L1 §11 / AD §4.3: living crews tungsten-amber, ghosts pale green (A2 #7 reserved colours)
    dredge:   { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#ff9a2e', wear: 0.55 },
    ghost:    { shell: '#3a3434', mid: '#6a2a1c', accent: '#d9a521', dark: '#141211', eye: '#a8ff9e', wear: 0.7 },
    wake:     { shell: '#b9a98a', mid: '#4f7d7a', accent: '#c8682e', dark: '#2a2420', eye: '#ffb36b', wear: 0.6 },
    founders: { shell: '#e6e2d8', mid: '#c9c3b5', accent: '#c99a3e', dark: '#3a3d40', eye: '#5fe3ff', wear: 0.4 },
  },

  music: { theme: NIGHT, combat: DREDGE },

  route: {
    points: [[-1420, 20], [-1280, 60], [-1130, 40], [-985, -25], [-850, -70], [-720, -40], [-610, 60],
             [-480, 130], [-340, 90], [-230, -20], [-120, -90], [-10, -40], [90, 0], [200, 0], [330, 10],
             [560, -10], [790, 0], [920, 20], [1010, 140], [1120, 190], [1230, 90], [1300, -50],
             [1380, -100], [1440, -60], [1480, -40]],
    halfWidth: [300, 300, 300, 300, 320, 360, 400, 420, 420, 380, 380, 380, 420, 450, 450,
                450, 450, 420, 400, 400, 380, 360, 320, 300, 300],
  },

  terrain: {
    macroCell: 8,
    base: { scale: 600, amp: 5, octaves: 4, ridged: 0.3, warp: 60, terrace: { step: 2.5, strength: 0.4 } },
    features: [
      // pressure-ridge bases around the bay and in the Teeth (visual; colliders come from pressure_ridge structures)
      { kind: 'ridge', at: { s: 60, l: -150 }, to: { s: 300, l: -150 }, r: 40, h: 12, sharpness: 0.7 },
      { kind: 'ridge', at: { s: 60, l: 150 }, to: { s: 300, l: 130 }, r: 40, h: 10, sharpness: 0.7 },
      { kind: 'ridge', at: { s: 700, l: -170 }, to: { s: 1000, l: -170 }, r: 50, h: 18, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 760, l: 190 }, to: { s: 1040, l: 200 }, r: 50, h: 16, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 1080, l: -180 }, to: { s: 1290, l: -110 }, r: 45, h: 22, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 1100, l: 190 }, to: { s: 1300, l: 110 }, r: 45, h: 22, sharpness: 0.8 },
      // the Thornback, east of the shore (crest about +130); the sun rises behind it
      { kind: 'ridge', at: [2650, -1500], to: [2900, 1400], r: 450, h: 130, sharpness: 0.5 },
    ],
    detail: { scale: 14, amp: 0.5 },
    walls: { height: 40, start: 0.82, noise: 0.6 },
    carve: { depth: 0.5, bedWidth: 90, shoulder: 60, smooth: 200, maxGrade: 0.06, strength: 0.6 },
    erosion: { droplets: 30000, thermal: 1 },
    stamps: STAMPS,
  },

  art: {
    ...ART_NIGHT,
    palette: PALETTE,
    toneMapping: 'aces',
    surface: { snow: 0.6, snowSlope: [0.35, 0.6], gloss: 0.35, rockSlope: [0.35, 0.6], strataHeight: 3, sparkle: 0.4 },
    skyline: [
      { kind: 'smoke', at: [600, -200], size: 1.2, color: '#ffb04a' },   // the Icebreaker's lit steam plume
    ],
    ambience: [],
    scatter: [
      { prop: 'slab', density: 1.4, scale: [2, 6], slope: [0, 0.6], align: 0.4, collide: true, collideMinScale: 4, castShadow: true },
      { prop: 'spire', density: 0.12, scale: [3, 8], avoidRoute: true, collide: true, collideMinScale: 4, castShadow: true },
      { prop: 'rock_small', density: 8, scale: [0.6, 1.6], maxDist: 220 },        // ice rubble (palette-tinted)
      { prop: 'snow_drift', density: 6, scale: [2, 6], slope: [0, 0.3], maxDist: 400 },
      { prop: 'ice_shard', density: 40, scale: [0.6, 1.4], maxDist: 120 },
    ],
  },

  // `zones` is a getter: it registers the level-only structure types with ctx.structures before World.load places them
  // (custom.install runs after the world loads; arch §8.2). Without a reachable ctx it returns the zones without those
  // structures, and custom.install places them instead.
  get zones() {
    const ctx = liveCtx();
    return ctx?.structures && ensureL1Structures(ctx) ? ZONES : ZONES_BARE;
  },

  checkpoints: [
    { id: 'cp_cut',      at: { s: 40, l: -20 },  yaw: 'route', label: 'The cut' },
    { id: 'cp_cavern',   at: { s: 384, l: -18 }, yaw: az(63), label: 'Under the ice' },
    { id: 'cp_ridges',   at: { s: 690, l: 0 },   yaw: 'route', label: 'The Teeth' },
    { id: 'cp_abeyance', at: { s: 1375, l: 0 },  yaw: 'route', label: 'The Abeyance' },
    { id: 'cp_cutline',  at: { s: 1735, l: 0 },  yaw: 'route', label: 'The cut-line' },
    { id: 'cp_harvest',  at: { s: 2200, l: 0 },  yaw: az(90), label: 'The shelf edge' },
    { id: 'cp_floes',    at: { x: 856, z: 23, y: SEA + 3 }, yaw: az(100), label: 'The floes' },   // the guaranteed Raft fragment
  ],

  objectives: [
    { id: 'o_look', text: "Find Kit's kite", kind: 'manual' },
    { id: 'o_cut', text: 'Cut three blocks', kind: 'destroy', target: { tag: 'block', count: 3 }, showCount: true, marker: 'targets' },
    { id: 'o_gully', text: 'Run for the east gully', kind: 'reach', at: { s: 320 }, r: 30, marker: true },
    { id: 'o_up', text: 'Find a way up', kind: 'reach', at: { s: 625 }, r: 26, marker: true },
    { id: 'o_climb', text: 'Climb out', kind: 'flag', flag: 'outOfShaft' },
    { id: 'o_kit', text: 'Reach Kit', kind: 'reach', at: { s: 860, l: 40 }, r: 80, marker: { s: 900, l: 70, h: 6 } },
    { id: 'o_skiffs', text: 'Drive the skiffs off Tick', kind: 'kill', target: { tag: 'pin' }, showCount: true, marker: 'targets' },
    { id: 'o_sled1', text: 'Flag the sledge', kind: 'flag', flag: 'sled1', optional: true },
    { id: 'o_wrecks', text: 'Keep the Gleaners off the wrecks', kind: 'kill', target: { encounter: 'e_gleaners' }, marker: 'targets' },
    { id: 'o_abeyance', text: 'Make for the Abeyance', kind: 'reach', at: { s: 1370 }, r: 80, marker: true },
    { id: 'o_sexton', text: 'Destroy the Sexton', kind: 'kill', target: { tag: 'sexton' }, marker: 'targets' },
    { id: 'o_climb2', text: 'Climb the Abeyance', kind: 'flag', flag: 'crown', marker: abey(0, 124, 0) },
    { id: 'o_sled2', text: "Free Hardtack's sledge", kind: 'flag', flag: 'sled2', optional: true },
    { id: 'o_heads', text: "Break the Icebreaker's drill heads", kind: 'destroy', target: { tag: 'drillhead', count: 3 },
      showCount: true, marker: 'targets' },
    { id: 'o_surface', text: 'Surface', kind: 'flag', flag: 'surfaced' },
    { id: 'o_shore', text: "Follow Kit's flares to the shore", kind: 'reach', at: { s: 3130 }, r: 60, marker: { s: 3150, l: 0, h: 4 } },
    { id: 'o_sled3', text: 'Flag the drifting sledge', kind: 'flag', flag: 'sled3', optional: true,
      failIf: { flag: 'sled3Lost' }, marker: { x: 1010, z: 262, y: FLOE_TOP + 4 } },
    { id: 'o_bench', text: 'Bring the frame in', kind: 'reach', at: DATA.shore.cradle, r: 18, marker: true },
  ],

  encounters,
  triggers,

  events: {
    collapse: [
      ...done('o_gully'), ...flags('p:fell'),
      { parallel: [
        [{ cinematic: 'bridgeCollapse' }],
        [{ structure: { id: 'snowBridge', state: 'collapsed' } }, { call: 'cutterFall' }, { comms: 'c_collapse' },
         { call: 'vitals', args: { spike: 146 } }, { shake: 1.2 }, { wait: 4.2 }, { call: 'alcoveGlow', args: { on: true } }] ] },
      { despawn: { tag: 'raid' } },
      { fade: 1, seconds: 0.6 },
      { interstitial: [{ style: 'black', hold: 5, text: 'Its hatch was open. It was the only warm thing in the dark.' }] },
      { call: 'cutter', args: { on: false } }, { call: 'callsign', args: { name: 'JUNO', frame: 'CANTOR 7' } },
      { call: 'kite', args: { hide: true } }, { call: 'tick', args: { hide: true } },
      { player: { teleport: { s: 377, l: -26 }, yaw: az(63) } },
      { call: 'kneel', args: { on: true } },
      { art: ART_UNDER, blend: 0 },
      { call: 'hudPanels', args: { all: false } }, { call: 'vitals', args: { mode: 'hidden' } },
      { comms: 'c_boot', wait: true },                                // over black (A5.2: comms render above the fade)
      { call: 'vitals', args: { mode: 'live', bpm: null, spike: 112, decay: 60 } },   // boot 112, decaying over 60 s
      { parallel: [
        [{ cinematic: 'mothWakes' }],
        [{ fade: 0, seconds: 1.5 }, { call: 'visor', args: { on: true } }, { music: { stinger: 'discovery' } },
         { wait: 2.5 }, { structure: { id: 'alcove', state: 'broken' } }, { call: 'kneel', args: { on: false } }, { shake: 0.4 }] ] },
      ...flags('p:awake'),
      { checkpoint: 'cp_cavern' },
      { call: 'abilities', args: { preset: 'walk' } }, { call: 'idleFacing', args: { yaw: 0 } },
      { call: 'hudPanels', args: { all: true, en: false, radar: false, weapons: false, rack: false } },
      { music: { theme: NIGHT } }, { comms: 'c_walk' },
      ...add('o_up'), { hint: HINT.walk },
    ],

    finale: [
      ...done('o_heads'), ...flags('p:finale'),
      // §7: auger falls, boiler shock, sunrise (ART_DAWN), light wall, split, the drowning, flatline, black, reboot,
      // vitals locked at 60; resolves when control returns underwater
      { call: 'drown', args: { comms: { sunrise: 'c_sunrise', changing: 'c_ice_changing', fall: 'c_fall', drown: 'c_drown' },
                               art: { dawn: ART_DAWN, water: ART_WATER }, music: { drone: DRONE, rise: RISE } } },
      { flag: ['vitals', 'locked'], persist: true },                 // A2 #19
      ...add('o_surface'), { hint: HINT.rise },
      { waitFor: { flag: 'surfaced' } },                              // set by the water system's breach (L1 §12.6)
      ...done('o_surface'),
      { checkpoint: 'cp_floes' },
      ...flags('p:sprint'),
      { music: { theme: DAWN } },
      { call: 'floes', args: { start: true } }, { call: 'sunClock', args: { start: true } },
      { call: 'gleanerHunt', args: { on: true } }, { spawn: 'e_floes' },
      { comms: 'c_surfaced' },
      ...add('o_shore'),
      { wait: 3 }, { comms: 'c_icing' }, { call: 'hoverIcing', args: { scale: 2 } },
    ],

    shore: [
      ...done('o_shore'), ...flags('p:shore'),
      { call: 'kitFlare', args: { road: [{ s: 3135, l: 30 }, { s: 3150, l: -10 }, { s: 3165, l: 25 }, { s: 3180, l: -40 }, { s: 3195, l: 10 }] } },
      { comms: 'c_backoff' }, { call: 'gleanerHunt', args: { on: false, scatter: true } }, { call: 'skiffsLeave' },
      { call: 'sunClock', args: { start: false } }, { call: 'floes', args: { freeze: true } },
      { player: { freeze: true } }, { letterbox: true },
      { call: 'mothWalk', args: { to: DATA.shore.kneel, face: DATA.shore.hole, speed: 5 } },
      { call: 'kneel', args: { on: true } },
      { call: 'watchers', args: { count: 5, around: DATA.shore.hole, dist: [160, 220], h: [25, 40] } },
      { parallel: [ [{ cinematic: 'shoreKneel' }], [{ call: 'holeBubbles', args: { delay: 6 } }, { comms: 'c_ballast', wait: true }] ] },
      { call: 'kneel', args: { on: false } }, { call: 'watchers', args: { leave: true } },
      { comms: 'c_foreman', wait: true },
      { letterbox: false }, { player: { freeze: false } },
      { call: 'abilities', args: { preset: 'walk' } },                // weapons stowed: a slow walk into camp
      ...add('o_bench'),
    ],

    naming: [
      { player: { freeze: true } },
      { parallel: [
        [{ cinematic: 'naming' }],
        [{ call: 'turnNorth', args: { seconds: 4 } }, { wait: 3 }, { comms: 'c_naming_kit', wait: true },
         { call: 'renameSpeaker', args: { id: 'MOTH', name: 'MOTH' } }, { comms: 'c_naming_moth', wait: true },
         { call: 'musicBox' }, { fade: 1, seconds: 3 }] ] },
      { complete: true },
    ],
  },

  cinematics: {
    vista: { skippable: true, keys: [
      { t: 0, pos: { s: 15, l: 25, h: 5 },  look: abey(0, 75, 0), fov: 36 },
      { t: 8, pos: { s: 55, l: 8, h: 12 },  look: abey(0, 70, 0), fov: 32, ease: 'inOut' } ] },
    bridgeCollapse: { skippable: false, keys: [
      { t: 0,   pos: { s: 296, l: 42, h: 14 }, look: { x: -1107, z: 32, y: 2 }, fov: 50 },
      { t: 2.5, pos: { s: 345, l: 20, h: 6 },  look: { x: -1107, z: 32, y: -4 }, fov: 55 },
      { t: 5,   pos: { s: 362, l: 10, h: 4 },  look: { s: 377, l: -28, h: 8 }, fov: 45, ease: 'inOut' } ] },
    mothWakes: { skippable: false, keys: [
      { t: 0, pos: { s: 381, l: -23, h: 9.5 }, look: { s: 376, l: -27, h: 9.5 }, fov: 30 },
      { t: 3, pos: { s: 370, l: -12, h: 8 },   look: { s: 377, l: -26, h: 7 },   fov: 42, ease: 'inOut' },
      { t: 6, pos: { s: 357, l: 2, h: 10 },    look: { s: 377, l: -26, h: 6 },   fov: 50, ease: 'inOut' } ] },
    stencil: { letterbox: false, hideHud: false, skippable: false, keys: [
      { t: 0,   pos: abey(4, 74, 2), look: abey(-14, 71, -1), fov: 48 },
      { t: 2.5, pos: abey(2, 73, 0), look: abey(-14, 72, -1), fov: 42 } ] },
    cutlineReveal: { skippable: true, keys: [
      { t: 0, pos: abey(6, 136, -8), look: { x: 600, z: -200, y: 10 }, fov: 45 },
      { t: 7, pos: abey(10, 134, -14), look: { x: 900, z: 0, y: -10 }, fov: 38, ease: 'inOut' } ] },
    shoreKneel: { skippable: false, keys: [
      { t: 0,  pos: { s: 3165, l: 25, h: 7 }, look: { s: 3183, l: -16, h: 4 }, fov: 40 },
      { t: 18, pos: { s: 3170, l: 35, h: 9 }, look: { s: 3183, l: -16, h: 4 }, fov: 36, ease: 'linear' } ] },
    naming: { skippable: false, keys: [
      { t: 0,  pos: { s: 3262, l: 62, h: 8 }, look: { s: 3282, l: 20, h: 7 }, fov: 42 },
      { t: 15, pos: { s: 3254, l: 42, h: 6 }, look: { s: 3282, l: 20, h: 8 }, fov: 38, ease: 'inOut' } ] },
  },

  comms: {
    c_morning: [{ who: 'KIT', text: "Morning, Jun! Kite's up. Look up. No, UP. That's me, being amazing." }],
    c_watchNorth: [{ who: 'JUNO', text: 'Morning. Keep the kite on the north for me.' },
                   { who: 'KIT', text: "Kite's on the north. North is very… dark. Good job, north." }],
    c_block1_near: [{ who: 'KIT', text: "Orange flags. I put those there. You're welcome." }],
    c_block1: [{ who: 'JUNO', text: 'One.' }, { who: 'KIT', text: 'Crooked.' }, { who: 'JUNO', text: 'Drinks the same.' }],
    c_block2: [{ who: 'KIT', text: "Two! That's more than halfway. That's two-thirds-way." }],
    c_block3: [{ who: 'JUNO', text: "Three. Sled's full. Bring Tick round." },
               { who: 'KIT', text: 'Bringing Tick round. Tick is coming round. Tick is— hang on.' }],
    c_lights: [{ who: 'KIT', text: "Lights on the ice. Lots of lights. Jun, those aren't ours." },
               { who: 'JUNO', text: 'Kite down. Get to the ridges.' }],
    c_raid_sled: [{ who: 'KIT', text: "They've got the sled— they've HARPOONED the sled—" }, { who: 'JUNO', text: 'Let it go. Move, Kit.' }],
    c_raid_hit: [{ who: 'JUNO', text: 'Dry it.' }],
    c_raid_gully: [{ who: 'KIT', text: 'East gully, Jun! The gully! GO!' }],
    c_collapse: [{ who: 'KIT', text: 'Jun? JUN—', hold: 0.9 }],
    c_boot: [{ who: 'BOOT', text: 'CANTOR 7 // KERNEL 4/4', hold: 0.6 }, { who: 'BOOT', text: 'LATTICE: EMPTY // PASSENGER: NONE', hold: 0.6 },
             { who: 'BOOT', text: 'PILOT: DETECTED', hold: 1.2 },
             { who: 'MOTH', text: 'Query: are you authorised?' }, { who: 'JUNO', text: "I'm the only one here, so yes." },
             { who: 'MOTH', text: 'This frame accepts.' }],
    c_walk: [{ who: 'JUNO', text: 'Can you climb?' }, { who: 'MOTH', text: 'Drive systems are cold. Walking only.' }],
    c_name: [{ who: 'MOTH', text: 'Query: what are you called?' }, { who: 'JUNO', text: 'Juno. You?' },
             { who: 'MOTH', text: 'Cantor 7. Nothing else is stored.' }, { who: 'JUNO', text: "That's a number, not a name." },
             { who: 'MOTH', text: 'Noted.' }],
    c_signal: [{ who: 'JUNO', text: "Kit. Kit, it's me." }, { wait: 2.5 }, { who: 'JUNO', text: "Signal's dead down here." },
               { who: 'MOTH', text: 'Correction: the ice is thick. The signal is not dead.' }, { who: 'JUNO', text: 'Thanks.' }],
    c_shaft: [{ who: 'MOTH', text: 'Boost system… remembered.' }],
    c_kit_reconnect: [{ who: 'KIT', text: '—un? Jun? JUN. Answer me. Answer me answer me answer—' },
                      { who: 'JUNO', text: "Kit. It's me. I'm in something." },
                      { who: 'KIT', text: "There's a GIANT thing coming out of the ice, Jun, run—" },
                      { who: 'JUNO', text: "That's me." }, { who: 'KIT', text: '…Oh. Okay. Okay okay okay.' }, { wait: 1.5 },
                      { who: 'KIT', text: "Two skiffs. Tick's stuck. Hurry." }, { who: 'JUNO', text: 'Coming. Put up a flare.' },
                      { wait: 2 }, { who: 'KIT', text: "Flare's up. Follow the red." }],
    c_idle_north: [{ who: 'JUNO', text: 'Stop turning. East is that way.' }, { who: 'MOTH', text: 'Noted.' }],
    c_pin: [{ who: 'MOTH', text: 'Targeting… remembered.' }],
    c_qb: [{ who: 'MOTH', text: 'Lateral thrust… remembered.' }],
    c_tear: [{ who: 'MOTH', text: 'That part is loose. This frame can take it.' }],
    c_first_tear: [{ who: 'JUNO', text: "Huh. Oma'll want that." }],
    c_sled1: [{ who: 'KIT', text: "That's our SLED. He was towing our sled." }, { who: 'JUNO', text: 'Flag it. Big Mercy can fetch it later.' }],
    c_sled1_done: [{ who: 'KIT', text: "Flagged! That's a tank. A whole tank. I'm counting it." }],
    c_pin_wave: [{ who: 'KIT', text: 'More sails, east lead! Two!' }],
    c_pin_clear: [{ who: 'KIT', text: 'Okay so that was AMAZING, and also I nearly died, so.' }, { who: 'JUNO', text: 'Drink something.' }],
    c_whatfor: [{ who: 'MOTH', text: 'Query: what is this frame for?' }, { who: 'JUNO', text: 'Water first. Then we argue about what you are.' }],
    c_gleaners: [{ who: 'KIT', text: 'Green lights. Jun, those are Gleaners.' }, { who: 'JUNO', text: "They're here for the skiff crews." },
                 { who: 'KIT', text: "They're already dead, Jun." }, { who: 'JUNO', text: "That's when they come." }],
    c_blade: [{ who: 'MOTH', text: 'Blade… remembered.' }],
    c_blade_kill: [{ who: 'KIT', text: 'YES! Do that again! Do that MORE!' }],
    c_carrier: [{ who: 'KIT', text: 'Big one! Big green one, north!' }],
    c_burn: [{ who: 'JUNO', text: 'Kit. Burn the wrecks.' }, { who: 'KIT', text: 'With what?' },
             { who: 'JUNO', text: 'Flare. Into the fuel.' }, { who: 'KIT', text: '…Okay.' }],
    c_abeyance: [{ who: 'KIT', text: "There's the Abeyance. Biggest thing on the shelf. Bigger than you, big guy." },
                 { who: 'MOTH', text: 'Query: is "big guy" a designation?' }, { who: 'KIT', text: 'It is NOW.' }],
    c_ghost: [{ who: 'KIT', text: "Jun. That one's got a light." }, { who: 'JUNO', text: "Ghost. Don't look at the light." }],
    c_missiles: [{ who: 'MOTH', text: 'Chorus… remembered.' }],
    c_enemy_flares: [{ who: 'KIT', text: "It's throwing sparkles! That's CHEATING." }],
    c_surge: [{ who: 'MOTH', text: 'Energy surge. Move away from it.' }],
    c_repair: [{ who: 'MOTH', text: 'Repair cycle… remembered.' }],
    c_drums: [{ who: 'KIT', text: "Jun. There's drums in there. In the hold. Lots of drums." },
              { who: 'JUNO', text: 'Mark them. Oma will want a Turnback.' }, { who: 'KIT', text: '…Marking.' }],
    c_climb: [{ who: 'KIT', text: "I can't see past the ridges from down here. Get up top. Eyes on." },
              { who: 'JUNO', text: "Climbing. Drive through. Don't stop." },
              { who: 'KIT', text: 'Not stopping. Not looking. Not looking at ANY of it.' }],
    c_hardtack: [{ who: 'KIT', text: "Jun, there's a sled in here. Hardtack's paint. It's chained to their winch." },
                 { who: 'JUNO', text: "I'll get the winch." }],
    c_hardtack_done: [{ who: 'KIT', text: 'Two tanks! TWO!' }],
    c_shaft_gleaners: [{ who: 'MOTH', text: 'Movement above.' }],
    c_stencil: [{ who: 'MOTH', text: 'This frame knows this mark.' }, { who: 'JUNO', text: 'From where?' },
                { who: 'MOTH', text: 'Unknown. Logged.' }],
    c_cutline: [{ who: 'KIT', text: "That's the ice we came for. They're taking all of it." },
                { who: 'KIT', text: "And it's cutting right between us and the beach." }, { who: 'JUNO', text: 'Then it stops cutting.' }],
    c_detour: [{ who: 'KIT', text: "Tick can't swim. I'm going round by the north fast-ice. Meet you on the beach." },
               { who: 'JUNO', text: 'Keep the kite on me.' }, { who: 'KIT', text: "Kite's on you. No strings attached. Okay, one string." }],
    c_pa1: [{ who: 'DREDGE_PA', text: "Cut and haul. Cut and haul. Shift's not over." }],
    c_heads_hint: [{ who: 'KIT', text: "Kite says the saw heads go soft when they're cutting. Hit them low." }],
    c_spotlight: [{ who: 'KIT', text: "Out of the light, Jun! They're aiming with it!" }],
    c_head1: [{ who: 'KIT', text: "Head's off! ONE!" }, { who: 'JUNO', text: "It's turning. Here it comes." }],
    c_crack: [{ who: 'MOTH', text: 'The ice is splitting toward this frame. Move off the line.' }],
    c_pa2: [{ who: 'DREDGE_PA', text: 'Cut and— cut and haul. Cut and haul.' }],
    c_head2: [{ who: 'KIT', text: "TWO! It's got one head left and it looks ANGRY." }],
    c_auger: [{ who: 'MOTH', text: 'The bow drill is armoured above. Exposed from below.' }, { who: 'JUNO', text: 'Down on the raft, then.' }],
    c_sunrise: [{ who: 'KIT', text: 'Jun. Jun, the sun. Look east.' }],
    c_ice_changing: [{ who: 'MOTH', text: 'The ice is changing.' }],
    c_fall: [{ who: 'JUNO', text: 'Hold—', hold: 0.4 }],
    // c_drown is played line by line by the 'drown' action on the L1 §7.2 timeline (waits are the script's silences)
    c_drown: [{ who: 'JUNO', text: 'Up. Get us up.' }, { who: 'MOTH', text: 'Thrusters are flooded. This frame is sinking.' },
              { who: 'JUNO', text: 'Okay.' }, { wait: 4 },
              { who: 'JUNO', text: 'Hey. Hey, listen. If this goes bad.' },
              { who: 'JUNO', text: "Don't let me end up one of his ghosts. Promise me." },
              { who: 'MOTH', text: 'Promised.' },
              { who: 'MOTH', text: 'Hold on to me.' },
              { who: 'JUNO', text: "…I'm okay? I'm okay!" }, { who: 'MOTH', text: 'You are okay.' }],
    c_surfaced: [{ who: 'KIT', text: 'JUN! I saw you go under, I saw you go UNDER—' }, { who: 'JUNO', text: 'Fine. Where are you?' },
                 { who: 'KIT', text: 'Beach! Follow the flares!' }],
    c_icing: [{ who: 'MOTH', text: 'Vents are icing. Hover is limited.' }, { who: 'JUNO', text: 'Then we hop.' }],
    c_rot: [{ who: 'MOTH', text: 'Sunlit ice is failing. Shadowed ice holds.' }, { who: 'JUNO', text: 'Blue holds, gold breaks. Got it.' }],
    c_sink: [{ who: 'KIT', text: "It's going under. The whole thing's going UNDER." }],
    c_leads: [{ who: 'KIT', text: "Skiffs in the leads! They don't care about the sun, they FLOAT—" }],
    c_hunt: [{ who: 'KIT', text: 'Why are the Gleaners all coming at YOU?' }, { who: 'JUNO', text: "I'm the biggest thing out here." }],
    c_sled3: [{ who: 'KIT', text: "Sled on a floe, south! Lark's Rest paint. It's in the shade. For now." }],
    c_sled3_done: [{ who: 'KIT', text: "THREE tanks! Oma's going to— she's going to nod, probably!" }],
    c_sled3_lost: [{ who: 'KIT', text: "Lost it. Doesn't matter. Keep going." }],
    c_withme: [{ who: 'JUNO', text: 'You with me?' }, { who: 'MOTH', text: 'I am here.' }],
    c_lastbit: [{ who: 'KIT', text: "Last bit! Fast-ice holds, it's shore ice, it's GOOD ice!" }],
    c_backoff: [{ who: 'KIT', text: 'Get OFF her! Flares, flares, FLARES—' }],
    c_ballast: [{ wait: 3 }, { who: 'JUNO', text: "Why'd we stop?" }, { who: 'MOTH', text: 'Releasing ballast.' },
                { who: 'JUNO', text: 'Since when do you carry ballast?' }, { who: 'MOTH', text: 'Not anymore.' }, { wait: 2 }],
    c_foreman: [{ who: 'FOREMAN', text: 'There you are.' }, { wait: 2 }, { who: 'KIT', text: 'Who was THAT?' },
                { who: 'OMA', text: 'Nobody you answer, boy. Bring the frame in.' }],
    c_naming_kit: [{ who: 'KIT', text: "It keeps turning north. Like a moth at a lamp. I'm calling it Moth." }],
    c_naming_moth: [{ who: 'MOTH', text: 'Designation accepted. Logged.' }],
  },

  collectibles: [   // caches feed the Haul rack (A5.2): `unlocks` is a haul part id (A2 #14)
    { id: 'cacheA', kind: 'salvage', at: { s: 1012, l: -170, h: 1 }, unlocks: 'harpoon_gaff', label: 'Old skiff wreck' },
    { id: 'cacheB', kind: 'salvage', at: abey(6, 123.5, 12), unlocks: 'flare_pod', label: 'Roost spares' },
  ],

  start: [
    { call: 'cutter', args: { on: true } }, { call: 'abilities', args: { preset: 'cutter' } },
    { call: 'callsign', args: { name: 'JUNO', frame: 'CUTTER' } },
    { call: 'hudPanels', args: { all: true, en: false, radar: false, rack: false } },
    { call: 'hudSlots', args: { R: 'hidden', L: { state: 'ready', label: 'SAW' }, S: 'hidden', K: 'hidden' } },
    { call: 'vitals', args: { mode: 'live', bpm: 80 } },
    { call: 'tick', args: { park: DATA.tick.park0, show: true } }, { call: 'kite', args: { follow: 'tick', h: 85, show: true } },
    { cinematic: 'vista' },
    { wait: 1.5 }, { comms: 'c_morning' },
    ...add('o_look'), { hint: { desktop: 'Mouse to look', touch: 'Drag the right side to look' } },
    { waitFor: { any: [{ custom: 'lookingAt', args: { target: 'kite', deg: 8, hold: 0.5 } }, { objective: 'o_look' }] } },
    ...done('o_look'),
  ],

  onCheckpoint: {
    cp_cavern: [
      { call: 'restoreCommon', args: { cp: 'cp_cavern' } }, ...flags('p:fell', 'p:awake'), ...disable(...SEG_Z2),
      { art: ART_UNDER, blend: 0 },
      { call: 'abilities', args: { preset: 'walk' } }, { call: 'idleFacing', args: { yaw: 0 } },
      { music: { theme: NIGHT } }, ...add('o_up'), { hint: HINT.walk } ],
    cp_ridges: [
      { call: 'restoreCommon', args: { cp: 'cp_ridges' } }, ...flags('p:fell', 'p:awake', 'outOfShaft'), ...disable(...SEG_Z3),
      { art: ART_TEETH, blend: 0 }, { call: 'abilities', args: { preset: 'jump' } },
      ...done('o_up', 'o_climb'),
      { call: 'tick', args: { park: { s: 900, l: 70 }, pinned: true, show: true } }, { call: 'kite', args: { follow: 'tick', h: 80, show: true } },
      { call: 'kitFlare', args: { at: { s: 900, l: 70, h: 160 }, burst: true } }, { music: { theme: NIGHT } },
      ...add('o_kit') ],
    cp_abeyance: [
      { call: 'restoreCommon', args: { cp: 'cp_abeyance' } },
      ...flags('p:fell', 'p:awake', 'outOfShaft', 'p:pin', 'p:pinClear', 'p:gleaners', 'p:burn', 'p:apron'), ...disable(...SEG_Z4),
      { art: ART_ABEY, blend: 0 }, { call: 'abilities', args: { preset: 'missiles' } },
      { call: 'tick', args: { park: { s: 1360, l: 50 }, show: true } }, { call: 'kite', args: { follow: 'tick', h: 90, show: true } },
      ifNone('sexton', [{ spawn: 'e_apron' }]), { music: { theme: DREDGE } },
      ...done('o_abeyance'), ...add('o_sexton') ],
    cp_cutline: [
      { call: 'restoreCommon', args: { cp: 'cp_cutline' } },
      ...flags('p:fell', 'p:awake', 'outOfShaft', 'p:pin', 'p:pinClear', 'p:gleaners', 'p:burn', 'p:apron', 'p:sexton', 'crown', 'p:field'),
      ...disable(...SEG_Z5, 't_heads_hint'),
      { art: ART_PREDAWN, blend: 0 }, { call: 'abilities', args: { preset: 'full' } },
      { call: 'tick', args: { hide: true } }, { call: 'kite', args: { follow: 'player', h: 90, show: true } },
      ifNone('field', [{ spawn: 'e_field' }]), ifNone('icebreaker', [{ spawn: 'e_icebreaker' }]),
      { music: { theme: DREDGE, intensity: 1 } }, ...add('o_heads'), { wait: 15 }, { comms: 'c_heads_hint' } ],
    cp_harvest: [
      { call: 'restoreCommon', args: { cp: 'cp_harvest' } },
      ...flags('p:fell', 'p:awake', 'outOfShaft', 'p:pin', 'p:pinClear', 'p:gleaners', 'p:burn', 'p:apron', 'p:sexton', 'crown', 'p:field'),
      ...disable(...SEG_HARVEST),
      { art: ART_PREDAWN, blend: 0 }, { call: 'abilities', args: { preset: 'full' } },
      { call: 'tick', args: { hide: true } }, { call: 'kite', args: { follow: 'player', h: 90, show: true } },
      ifNone('icebreaker', [{ spawn: 'e_icebreaker' }]), { call: 'icebreaker', args: { phase: 3 } },
      { music: { theme: DREDGE, intensity: 1.2 } }, ...add('o_heads'), { comms: 'c_auger' } ],
    cp_floes: [
      { call: 'restoreCommon', args: { cp: 'cp_floes' } },
      ...flags('p:fell', 'p:awake', 'outOfShaft', 'p:pin', 'p:pinClear', 'p:gleaners', 'p:burn', 'p:apron', 'p:sexton', 'crown',
               'p:field', 'p:finale', 'surfaced', 'p:sprint'),
      ...disable(...SEG_Z6),
      { call: 'vitals', args: { mode: 'locked', bpm: 60 } }, { art: ART_DAWN, blend: 0 }, { art: ART_FLOES, blend: 0 },
      { call: 'abilities', args: { preset: 'full' } },
      { call: 'tick', args: { hide: true } }, { call: 'kite', args: { follow: 'player', h: 90, show: true } },
      { call: 'icebreakerSink', args: { instant: true } }, { call: 'floes', args: { reset: true, start: true } },
      { call: 'sunClock', args: { start: true } }, { call: 'hoverIcing', args: { scale: 2 } },
      { call: 'gleanerHunt', args: { on: true } }, ifNone('floeskiff', [{ spawn: 'e_floes' }]),
      { music: { theme: DAWN } }, ...done('o_heads', 'o_surface'), ...add('o_shore') ],
  },

  // no `complete` block: the 'naming' event ends the level with { complete: true }
  custom: { install: (ctx, mission) => installLevel01(ctx, mission, DATA, { ZONES, L1_TYPES, art: { ART_NIGHT, ART_UNDER, ART_TEETH, ART_ABEY, ART_PREDAWN, ART_DAWN, ART_FLOES, ART_SHORE, ART_WATER }, music: { NIGHT, DREDGE, DAWN, DRONE, RISE, MUSICBOX } }) },
};

export default def;
export { DATA, ZONES, L1_TYPES };
