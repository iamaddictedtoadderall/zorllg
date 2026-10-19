// levels/level02.js — Level 2: THE WAKE (The Morning Steppe). Built from docs/level-02.md (L2) and docs/addendum-02.md
// (A2). BUILD TEAM ONLY: this file holds the level script.
//
// Shape of the file
//  · constants and art/music presets (L2 §15, §17);
//  · DATA: level-only data read by the custom code in levels/level02/ (the convoy, the Tally, the Sundial, volleys);
//  · the LevelDef (arch §6 as amended by addendum 01; no new LevelDef keys, A2 B0 rule 5), default export.
//
// Rules this file follows (Level 1's proven patterns)
//  · Progression across checkpoints is carried by mission FLAGS (p:*), not by `after` chains, so every checkpoint can be
//    started cold (?level=l02&cp=…, the scenario) as well as restored from a snapshot. Each onCheckpoint list sets the
//    flags and objectives a cold start lacks, re-runs what the checkpoint's action list did after the snapshot, and
//    disables earlier triggers whose conditions would be true at that spot (the convoy is far along the road).
//  · The convoy's state lives in mission flags (cv:s, cv:mode, cv:lost, cv:hooked), so every snapshot captures it; the
//    runtime restores it on every level start (levels/level02/convoy.js).
//  · Shots framed on a moving thing (the harpoon, the capsize) are played by the custom action `shot`, which resolves
//    their keys relative to Big Mercy or the Tally at that moment (the engine's `follow` only offsets look points).
//  · The clarity pass (docs/todo.md, L2 §5): every new term gets a plain-English card the first time it matters
//    (levels/level02/terms.js), every new speaker a tag, and every objective says what to do and where.
//  · Every addendum 02 engine feature is reached through ctx (ctx.sync, ctx.hud.tracker) and feature-detected by the
//    runtime; the level runs and completes without any of them (A2 §B6.3).
//  · Custom structure types are registered before World.load reads `zones` (see `get zones()`), with a fallback that
//    places them from custom.install (levels/level02/index.js) when that is not possible.
import { installLevel02, ensureL2Structures, liveCtx, L2_TYPES } from './level02/index.js';
import './level02/reeds.js';     // registers the 'reed_clump' scatter prop at import (scatter.js registerProp)

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────────────────
const PED = { x: -61, z: -3684 };                 // the Sundial's pedestal centre (s 8250, l +130)
const SUN = { azimuth: 150, elevation: 10 };      // L2 §1.3 A1: the sun stands still all level
const CAMP = { s: 8560, l: 120 };
const BENCH = { s: 8580, l: 125 };
const term = (...ids) => ({ call: 'term', args: { ids } });
const add = (...ids) => ids.map(id => ({ objective: { add: id } }));
const done = (...ids) => ids.map(id => ({ objective: { complete: id } }));
const flags = (...names) => names.map(n => ({ flag: [n, true] }));
const disable = (...ids) => ids.map(id => ({ disable: id }));
const ifNone = (tag, then) => ({ if: { not: { custom: 'unitAlive', args: { tag } } }, then });
const convoyAt = (gte) => ({ custom: 'convoy', args: { gte } });
const HINT = {
  band:  'Stay within 700 m of the Wake. The tracker shows how far you are.',
  cable: 'Lock onto the CABLE and shoot it, or blade it.',
  sync:  'The Sync bar fills as you fight. Partner moves spend it.',
  sight: { desktop: 'C: Second Sight (3 Sync). Time slows and shots show their paths.', touch: 'SIGHT: time slows and shots show their paths.' },
  drive: { desktop: 'V: Moth Drives (4 Sync). The frame moves and dodges; you aim and fire.', touch: 'DRIVE: the frame moves and dodges; you aim and fire.' },
  hold:  'HOLD fired: 6 Sync spent. It saves you from one killing hit.',
  tanks: { desktop: 'F to flag the tanks', touch: 'INTERACT to flag the tanks' },
  tear:  { desktop: 'Hold right click to TEAR', touch: 'Hold BLADE to TEAR' },
};
// L2 §5.1: each hint fires once per save (flag `hint:<id>`; it lives in the snapshot, like Level 1's)
const hint = (id, text = HINT[id]) => ({ if: { not: { flag: 'hint:' + id } }, then: [{ hint: text }, { flag: ['hint:' + id, true] }] });

// ── music (inline ThemeDefs, L2 §15.5) ───────────────────────────────────────────────────────────────────────────
const ROAD = { bpm: 84, root: 73.42, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 4, 0],
  layers: { pad: { wave: 'sawtooth', vol: 0.15, cutoff: 1400, octave: 2 },
            arp: { wave: 'triangle', vol: 0.06, pattern: 'x.x.x..x', octave: 4 },
            drums: { kit: 'tribal', vol: 0.25, pattern: 'x...x...' } },
  intensity: { drums: [0.1, 0.4], arp: [0.3, 0.7] } };
const RAID = { bpm: 118, root: 73.42, scale: [0, 2, 4, 5, 7, 9, 10], progression: [0, 6, 3, 4],
  layers: { bass: { wave: 'sawtooth', vol: 0.26, cutoff: 800, pattern: 'x.x.xx.x', octave: 1 },
            drums: { kit: 'tribal', vol: 0.5, pattern: 'x.xxx.x.' },
            pulse: { wave: 'square', vol: 0.08, cutoff: 1600, pattern: 'x.x.x.x.', octave: 3 } },
  intensity: { drums: [0.3, 0.9], pulse: [0.4, 1.0] } };
const TALLY = { bpm: 132, root: 49, scale: [0, 1, 4, 5, 7, 8, 10], progression: [0, 1, 0, 6],
  layers: { bass: { wave: 'sawtooth', vol: 0.3, cutoff: 700, pattern: 'xx.x.xx.', octave: 1 },
            drums: { kit: 'industrial', vol: 0.55, pattern: 'x.x.x.xx' },
            lead: { wave: 'triangle', vol: 0.07, octave: 4 },
            pad: { wave: 'sawtooth', vol: 0.08, cutoff: 600, octave: 2 } },
  intensity: { drums: [0.4, 1.0], lead: [0.5, 1.0] } };
const NOON = { bpm: 66, root: 73.42, scale: [0, 2, 4, 5, 7, 9, 11], progression: [0, 4, 5, 3],
  layers: { pad: { wave: 'sawtooth', vol: 0.14, cutoff: 1100, octave: 2 },
            lead: { wave: 'triangle', vol: 0.05, pattern: 'x...x...', octave: 3 } } };
// the bridge song's first four notes on a music box (bible §12.6), carried into the Bench (L2 §15.5)
const MUSICBOX = { bpm: 84, root: 440, scale: [0, 3, 7, 5], progression: [0],
  layers: { arp: { wave: 'triangle', vol: 0.09, pattern: 'xxxx....', octave: 0 } } };

// ── art presets (L2 §15) ─────────────────────────────────────────────────────────────────────────────────────────
// Zone and action blends are partial (atmosphere.set): a preset that leaves a zone restores what the previous one changed.
const ART_BASE = {
  sky: { top: '#2e4f7c', mid: '#9fb3c0', horizon: '#e9c49a', sun: { ...SUN, color: '#ffc27a', size: 1.2, glow: 1.0 },
         clouds: { cover: 0.3, color: '#f2d8b8', speed: 1 }, ridges: { height: 1.0, color: '#8a6a58', layers: 2 } },
  fog: { color: '#d4ab80', density: 0.0009, heightFalloff: 0.008, inscatter: 1.0, sunColor: '#ffc98a' },
  light: { sun: 6.8, sunColor: '#ffbf73', hemi: 1.7, hemiSky: '#9ab4d0', hemiGround: '#6b4a2c', rim: 2.2, rimColor: '#a9c4e0',
           exposure: 1.0, env: 1.0, shafts: 0.45, shadowMinElevation: 12 },
  grade: { contrast: 1.06, saturation: 1.12, lift: [0.01, 0.005, 0.0], highlightsTint: [1.06, 1.0, 0.9],
           shadowsTint: [0.92, 0.97, 1.06], vignette: 0.25, grain: 0.03 },
  bloom: { strength: 0.6, threshold: 0.95 },
  weather: { type: 'dust', intensity: 0.5, wind: [5, 1.5] },
};
const ART_FLATS = { light: { ...ART_BASE.light, hemiGround: '#c8b89c', exposure: 0.95 },
  grade: { ...ART_BASE.grade, saturation: 1.04, highlightsTint: [1.04, 1.0, 0.94] }, weather: { ...ART_BASE.weather, intensity: 0.3 } };
// the Sundial's shade (L2 §15.2): cool blue shade with gold sunlight beyond the stripe and a warm rim on everything
const ART_SHADE = { light: { ...ART_BASE.light, sun: 1.1, hemi: 2.0, hemiSky: '#8aa6c8', rim: 2.6, rimColor: '#ffd9a0' },
  grade: { ...ART_BASE.grade, saturation: 0.98, shadowsTint: [0.9, 0.96, 1.1], highlightsTint: [1.0, 1.0, 1.02] },
  fog: { ...ART_BASE.fog, inscatter: 0.6 } };
const ART_SUN = { light: ART_BASE.light, grade: ART_BASE.grade, fog: ART_BASE.fog };   // leaving the shade (Z7's values)

const PALETTE = { ground: '#9a6a3a', rock: '#5a4232', sediment: '#7a5434', high: '#b88a56', dust: '#d4ab80',
                  wet: '#3a2a1a', concrete: '#7a7066', rust: '#7a4128', accent: '#ffb36b',
                  strata: ['#6a4a34', '#8a6040', '#5a3e2c', '#a07850'] };

// ── level-only data consumed by levels/level02/*.js ─────────────────────────────────────────────────────────────
const DATA = {
  sun: SUN,
  convoy: {
    startS: 450, campS: 8560, columns: [-36, -12, 12, 36], ranks: 10, rankGap: 42,
    speeds: { roll: 9, open: 12, hold: 4, accel: 1.5 }, circleR: 110,
    band: { radius: 700, warn: 600, grace: 30 },
    // trigger points (convoy centre): each gate holds the convoy at 4 m/s while it is shut (L2 §4.2)
    gates: [ { s: 2850, flag: 'p:raid1Clear' }, { s: 3650, flag: 'p:raid1Clear' }, { s: 4550, flag: 'p:ruinsClear' },
             { s: 4900, flag: 'p:mercyReady' }, { s: 7000, flag: 'p:skimClear' } ],
    triggers: { raid1: 1350, watcher: 2850, ruins: 3650, volley: 4550, mercy: 4900, broadcast: 7000, dial: 7650, camp: 8560 },
    // hero rigs (Roll ids) and their models; col is the index into `columns`
    heroes: [ { id: 4, rank: 0, col: 1, model: 'crawler_mast' }, { id: 5, rank: 2, col: 3, model: 'walker_tubs' },
              { id: 3, rank: 4, col: 0, model: 'tanker' },        { id: 1, rank: 5, col: 2, model: 'bench' },
              { id: 2, rank: 6, col: 1, model: 'walker_small' },  { id: 6, rank: 7, col: 2, model: 'trike' } ],
    targets: [ { id: 8, rank: 3, col: 0 }, { id: 21, rank: 1, col: 3 }, { id: 35, rank: 5, col: 3 }, { id: 18, rank: 6, col: 0 },
               { id: 27, rank: 7, col: 1 }, { id: 34, rank: 8, col: 0 }, { id: 25, rank: 9, col: 3 } ],
    harpoon: { telegraph: 1.2, clock: 25, dragYacht: 6, dragWinch: 5, haulAway: 12, despawnAt: 600, maxHooked: 2,
               rehook: { yacht: 20, harpooner: 25 }, cable: { rig: 600, mercy: 1200, hitR: 3 } },
    // the camp in the shadow stripe: five short columns (l), parked between s 8380 and 8760; the Bench at BENCH
    camp: { stripeCols: [45, 75, 105, 135, 165], s: [8380, 8760], bench: BENCH },
  },
  sundial: { pedestal: PED, plinth: { w: 140, h: 50, steps: 4 }, blade: { length: 1350, lean: 42, azimuth: 0, rootW: 90, tipW: 18 },     // rootW 90: it stands on the 70 m top (L2 §12.3 says 150)
             ring: { r: 600, stones: 24, roadStoneAz: 335 }, stripeAz: 335, stripeLen: 5400 },
  flats: { lane: [[0, -36], [120, -250], [220, -470], [300, -680]],          // (Δs from BM₀, l)
           polygon: [[5050, -150], [5050, -700], [6000, -720], [6000, -160]] },
  tally: { spawn: [-1250, -700], skyline: [-1900, -1500], drag: [4.5, 3.4, 2.3], sternGap: 100, anchorRun: 120,
           volley: { every: 20, count: 6 }, sweeper: { every: 9, dmg: 600 }, mastFar: 60, mastFarScale: 0.25,
           holdAt: { mastBelow: 0.6, within: 200, fallback: 75 }, mercyS0: 4921 },
  volley: { count: 8, gap: 18, dmg: 420, imp: 300, splash: 8, speed: 75 },
  ruinsCover: { h1: { s: 3990, l: -215 }, h2: { s: 4070, l: 245 }, h3: { s: 4150, l: -270 }, h4: { s: 4420, l: 150 }, h5: { s: 4480, l: -140 } },
  far: { sails: 6, lowSails: 2, ring: [1500, 3000] },
  caches: { cacheA: { s: 2900, l: -380 }, cacheB: { s: 7750, l: 260 } },
  watcher: { at: { s: 3050, l: 520 } },
  plaque: { x: PED.x - 72, z: PED.z - 45, h: 4 },                // the west face of the plinth's first step (sundial anchor 'plaque')
  ramp: { s: 5620, l: -720 },
  // per checkpoint (cold starts): where the convoy is when nothing else says so
  cpConvoy: { cp_lip: 450, cp_reeds: 2475, cp_ruins: 3650, cp_flats: 4900, cp_deck: 4900, cp_road: 5100 },
  music: { ROAD, RAID, TALLY, NOON, MUSICBOX },
  art: { ART_BASE, ART_FLATS, ART_SHADE, ART_SUN },
  hints: HINT,
};

// ── zones (structures need the L2 types registered first: see `get zones()`) ──────────────────────────────────────
const ROAD_MARKERS = Array.from({ length: 17 }, (_, i) => ({ type: 'road_marker', at: { s: 250 + i * 500, l: 48 }, yaw: 'route', params: { n: 16 - i } }));
const markersIn = (s0, s1) => ROAD_MARKERS.filter(m => m.at.s >= s0 && m.at.s < s1);
const RUIN_STANDING = [[3820, -320, 84, 2], [3950, 300, 76, 3], [4120, -480, 90, 1], [4260, 420, 72, 0], [4420, -250, 88, 2], [4600, 350, 80, 1], [4780, -420, 70, 3]];
const RUIN_FALLEN = [[3990, -215, 40], [4070, 245, 300], [4150, -270, 75], [4340, 160, 20], [4430, -150, 110], [4700, 480, 200]];
// the dial ring: 24 stones every 15° on a 600 m radius; the two where the road passes through (165°, 180°) are left out
const DIAL = Array.from({ length: 24 }, (_, i) => i * 15)
  .filter(az => az !== 165 && az !== 180)
  .map(az => ({ type: 'dial_stone', at: [Math.round(PED.x + 600 * Math.sin(az * Math.PI / 180)), Math.round(PED.z - 600 * Math.cos(az * Math.PI / 180))],
                yaw: { face: [PED.x, PED.z] }, params: { h: az === 335 ? 36 : 28, road: az === 335, seed: az } }));
// the camp's lamps in the shadow stripe
const CAMP_LAMPS = [[8420, 70], [8470, 150], [8540, 60], [8620, 160], [8680, 80], [8740, 140]];

const ZONES = [
  { id: 'z_lip', range: [0, 1150], name: 'The Lip', card: { title: 'THE LIP', sub: 'South edge of the Morning Steppe' },
    structures: [ ...markersIn(0, 1150),
      { type: 'tank_cairn', at: { s: 300, l: 60 }, params: { n: 9 } }, { type: 'tank_cairn', at: { s: 900, l: -70 }, params: { n: 7 } },
      { type: 'turbine_ruin', at: { s: 700, l: 420 }, yaw: { azimuth: 60 }, params: { h: 80, fallen: true, seed: 1 } } ] },

  { id: 'z_reeds', range: [1150, 2650], name: 'The Reed Sea', card: { title: 'THE REED SEA' },
    art: { weather: { ...ART_BASE.weather, intensity: 0.6 }, fog: { ...ART_BASE.fog, density: 0.0010 } }, artBlend: 4,
    structures: [ ...markersIn(1150, 2650),
      { type: 'tank_cairn', at: { s: 1700, l: 55 }, params: { n: 8 } },
      { id: 'bellwether', type: 'rig_wreck', at: { s: 2200, l: -120 }, yaw: { azimuth: 30 }, params: { name: 'BELLWETHER', seed: 3 } },
      { type: 'turbine_ruin', at: { s: 2400, l: 380 }, yaw: { azimuth: 200 }, params: { h: 74, fallen: true, seed: 2 } } ] },

  { id: 'z_ridge', range: [2650, 3450], name: "The Watcher's Ridge", card: { title: "THE WATCHER'S RIDGE" },
    art: { weather: { ...ART_BASE.weather, intensity: 0.4 }, fog: ART_BASE.fog }, artBlend: 4,
    structures: [ ...markersIn(2650, 3450),
      { id: 'cacheA', type: 'water_cache', at: DATA.caches.cacheA, yaw: { azimuth: 80 }, params: { paint: 'LANTERN LINE' } },
      { type: 'tank_cairn', at: { s: 2910, l: -395 }, params: { n: 5 } },
      { id: 'shelf', type: 'rock_shelf', at: { s: 3050, l: 520 }, yaw: { azimuth: 230 }, params: { w: 24, d: 14 } },
      { type: 'road_culvert', at: { s: 3200 }, yaw: 'route', params: { span: 18 } } ] },

  { id: 'z_ruins', range: [3450, 5050], name: 'The Turbine Ruins', card: { title: 'THE TURBINE RUINS', sub: 'Colony wind farm' },
    art: { fog: { ...ART_BASE.fog, density: 0.0011 }, grade: { ...ART_BASE.grade, contrast: 1.08 } }, artBlend: 4,
    structures: [ ...markersIn(3450, 5050),
      ...RUIN_STANDING.map(([s, l, h, b], i) => ({ type: 'turbine_ruin', at: { s, l }, yaw: { azimuth: 150 + i * 23 }, params: { h, blades: b, seed: 10 + i } })),
      ...RUIN_FALLEN.map(([s, l, az], i) => ({ id: 'fallen' + i, type: 'turbine_ruin', at: { s, l }, yaw: { azimuth: az }, params: { h: 78, fallen: true, seed: 20 + i } })),
      { type: 'substation_ruin', at: { s: 4100, l: 260 }, yaw: 'route' },
      { type: 'transformer_pod', at: { s: 4095, l: 252 }, yaw: { azimuth: 12 } }, { type: 'transformer_pod', at: { s: 4108, l: 270 }, yaw: { azimuth: 190 } },
      { id: 'oldYacht', type: 'yacht_wreck', at: { s: 4250, l: -380 }, yaw: { azimuth: 300 }, params: { seed: 7 } } ] },

  { id: 'z_flats', range: [5050, 6300], name: 'The Salt Flats', card: { title: 'THE SALT FLATS' },
    art: ART_FLATS, artBlend: 4,
    structures: [ ...markersIn(5050, 6300),
      // the salt crust over the pan is a ground-conforming runtime mesh (levels/level02/ground.js, DATA.flats.polygon)
      { id: 'ramp', type: 'skimmer_ramp', at: DATA.ramp, yaw: { azimuth: 90 } },
      ...Array.from({ length: 9 }, (_, i) => ({ type: 'salt_pole', at: { s: 5150 + i * 90, l: -200 - i * 55 } })) ] },

  { id: 'z_road', range: [6300, 7650], name: 'The Colony Road', card: { title: 'THE COLONY ROAD' },
    art: { ...ART_BASE, weather: { ...ART_BASE.weather, intensity: 0.35 } }, artBlend: 4,      // also undoes ART_FLATS
    structures: [ ...markersIn(6300, 7650),
      { type: 'waystation_ruin', at: { s: 6900, l: -150 }, yaw: { azimuth: 40 } },
      { type: 'transformer_pod', at: { s: 6880, l: -128 }, yaw: { azimuth: 75 } }, { type: 'transformer_pod', at: { s: 6920, l: -175 }, yaw: { azimuth: 260 } },
      { type: 'tank_cairn', at: { s: 6600, l: 60 }, params: { n: 9 } } ] },

  { id: 'z_sundial', range: [7650, 8791], name: 'The Sundial', card: { title: 'THE SUNDIAL' },
    structures: [ ...markersIn(7650, 8791),
      { id: 'sundial', type: 'sundial', at: [PED.x, PED.z], yaw: 0, params: { plinth: 140, height: 50, steps: 4 } },
      ...DIAL,
      { id: 'cacheB', type: 'water_cache', at: DATA.caches.cacheB, yaw: { azimuth: 200 }, params: { paint: '' } },
      ...CAMP_LAMPS.map(([s, l]) => ({ type: 'wake_lamp', at: { s, l }, params: { h: 7 } })) ] },
];
/** the zones without level-only structure types (used when the types cannot be registered before World.load) */
const ZONES_BARE = ZONES.map(z => ({ ...z, structures: (z.structures || []).filter(e => !L2_TYPES.has(e.type)) }));

// ── encounters (L2 §6; haul ids are the A2 E7 part ids) ──────────────────────────────────────────────────────────
const YACHT = 'LAND-YACHT', HARPOONER = 'HARPOONER', SKIMMER = 'SKIMMER';
const encounters = [
  { id: 'e_raid1', units: [
      { kind: 'land_yacht', at: { s: 1900, l: -600 }, opts: { name: YACHT, tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig', stalk: true } } },
      { kind: 'land_yacht', at: { s: 1950, l: -520 }, opts: { name: YACHT, tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig', stalk: true } } },
      { kind: 'land_yacht', at: { s: 2000, l: -650 }, opts: { name: YACHT, tags: ['raid1', 'hooker'], config: { variant: 'hooker', rig: 18, haul: 'sail_rig', stalk: true } } } ],
    waves: [ { when: { remaining: 1 }, units: [
      { kind: 'land_yacht', at: { s: 1000, l: 550 }, opts: { name: YACHT, tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig' } } },
      { kind: 'land_yacht', at: { s: 950, l: 620 }, opts: { name: YACHT, tags: ['raid1', 'hooker'], config: { variant: 'hooker', rig: 25, haul: 'sail_rig' } } } ] } ] },

  { id: 'e_ruins', units: [
      { kind: 'harpooner', at: DATA.ruinsCover.h1, opts: { name: HARPOONER, tags: ['harpooner'], config: { cover: 'fallen0', rig: 8, haul: 'rivet_driver' } } },
      { kind: 'harpooner', at: DATA.ruinsCover.h2, opts: { name: HARPOONER, tags: ['harpooner'], config: { cover: 'fallen1', rig: 35, haul: 'rivet_driver' } } },
      { kind: 'harpooner', at: DATA.ruinsCover.h3, opts: { name: HARPOONER, tags: ['harpooner'], config: { cover: 'fallen2', rig: 27, haul: 'rivet_driver' } } },
      { kind: 'land_yacht', count: 2, at: { s: 4300, l: 500 }, spread: 60, opts: { name: YACHT, config: { variant: 'raker', haul: 'sail_rig' } } } ],
    waves: [ { when: { remaining: 2 }, units: [
      { kind: 'harpooner', at: DATA.ruinsCover.h4, opts: { name: HARPOONER, tags: ['harpooner'], config: { cover: 'fallen3', rig: 21, haul: 'rivet_driver' } } },
      { kind: 'harpooner', at: DATA.ruinsCover.h5, opts: { name: HARPOONER, tags: ['harpooner'], config: { cover: 'fallen4', rig: 34, haul: 'rivet_driver' } } } ] } ] },

  { id: 'e_tally', persist: true, units: [
      { kind: 'tally', at: DATA.tally.spawn, opts: { name: 'THE TALLY', tags: ['tally'], targetable: false,
        config: { winches: 3000, cables: 1200, cranes: { ap: 2800, haul: 'crane_claw' }, bridge: 6000, mast: 16000,
                  deckTurrets: 2, escort: { kind: 'land_yacht', max: 2, total: 4, every: 15 } } } } ] },

  { id: 'e_skimmers', units: [
      { kind: 'skimmer', count: 2, at: { s: 5750, l: -450 }, spread: 20, opts: { name: SKIMMER, config: { pair: 'a', haul: 'skate_jets' } } },
      { kind: 'skimmer', count: 2, at: { s: 5800, l: -520 }, spread: 20, opts: { name: SKIMMER, config: { pair: 'b', haul: 'skate_jets' } } } ],
    waves: [ { when: { remaining: 1 }, units: [
      { kind: 'skimmer', count: 2, at: { s: 6200, l: 500 }, spread: 20, opts: { name: SKIMMER, config: { pair: 'c', haul: 'skate_jets', leaveAfter: 150 } } } ] } ] },
];

// ── triggers ──────────────────────────────────────────────────────────────────────────────────────────────────────
// earlier triggers whose conditions are true further along the road (cold checkpoint starts disable them)
const SEG_REEDS = ['t_hesper1', 't_ration', 't_still', 't_raid1', 't_raid1_seen', 't_wave2', 't_tear_failsafe', 't_raid1_clear'];
const SEG_RUINS = [...SEG_REEDS, 't_cacheA_spot', 't_cacheA_near', 't_watcher', 't_watcher_gone', 't_ruins_warn', 't_ruins'];
const SEG_FLATS = [...SEG_RUINS, 't_harpooner', 't_rusk2', 't_ruins_clear', 't_sync', 't_mercy'];
const SEG_DECK = [...SEG_FLATS, 't_cable1', 't_cable2', 't_deck_warn', 't_hum1', 't_mercy_half', 't_hum2', 't_mercy_free', 't_mercy_lost'];
const SEG_ROAD = [...SEG_DECK, 't_drive', 't_crane', 't_hold', 't_mast_low', 't_capsize'];

const triggers = [
  // ── Z1 · the lip ─────────────────────────────────────────────────────────────────────────────────────────────
  { id: 't_hesper1', when: convoyAt(700), do: [{ comms: 'c_hesper1' }, term('sundial')] },
  { id: 't_ration', when: { all: [convoyAt(950), { not: { custom: 'enemyWithin', args: { r: 400 } } }] }, do: [{ comms: 'c_ration' }] },
  { id: 't_still', when: convoyAt(1150), do: [{ comms: 'c_still' }, term('still')] },
  { id: 't_band', when: { custom: 'bandDist', args: { gte: 600 } }, do: [{ comms: 'c_band' }, hint('band')] },

  // ── Z2 · raid 1 ─────────────────────────────────────────────────────────────────────────────────────────────
  { id: 't_raid1', when: convoyAt(1350), do: [
      { spawn: 'e_raid1' }, ...flags('p:raid1'), { comms: 'c_reeds' }, { call: 'kite', args: { follow: 'tick', h: 110 } } ] },
  { id: 't_raid1_seen', when: { custom: 'brokeCover', args: { encounter: 'e_raid1' } }, do: [
      { music: { theme: RAID } }, { comms: 'c_raid1' }, term('land_yacht', 'stagger', 'tear', 'rack', 'dredge'), ...add('o_raid1') ] },
  { id: 't_wave2', when: { custom: 'waveStarted', args: { encounter: 'e_raid1', wave: 1 } }, do: [{ comms: 'c_wave2' }] },
  { id: 't_tear_hint', when: { custom: 'tearAvailable', args: { r: 40 } }, do: [hint('tear'), term('tear')] },
  { id: 't_first_tear', when: { custom: 'rackCount', args: { gte: 1 } }, do: [{ comms: 'c_first_tear' }, { call: 'hudPanels', args: { rack: true } }, term('rack', 'bench')] },
  // the TEAR guarantee (L2 §6 E1): one more raker that staggers on its first hit, only when no TEAR happened this level
  { id: 't_tear_failsafe', when: { all: [{ cleared: 'e_raid1' }, { not: { custom: 'tearsThisLevel', args: { gte: 1 } } }] }, do: [
      { spawn: { kind: 'land_yacht', at: { s: 2900, l: -200 }, opts: { name: YACHT, tags: ['raid1x'], ap: 1200,
        config: { variant: 'raker', haul: 'sail_rig', staggerOnFirstHit: true } } } } ] },
  { id: 't_raid1_clear', when: { cleared: 'e_raid1' }, do: [
      ...flags('p:raid1Clear'), { music: { theme: ROAD } }, ...done('o_raid1'), { checkpoint: 'cp_reeds' }, { comms: 'c_raid1_clear', wait: true } ] },

  // ── Z3 · cache A, the Watcher ──────────────────────────────────────────────────────────────────────────────
  { id: 't_cacheA_spot', when: convoyAt(2700), do: [
      { comms: 'c_cacheA_spot' }, ...add('o_cacheA'), term('water_cache'), { call: 'flagCache', args: { id: 'cacheA' } } ] },
  { id: 't_cacheA_near', when: { enter: { at: DATA.caches.cacheA, r: 30 } }, do: [hint('tanks')] },
  { id: 't_cacheA_flag', when: { flag: 'cacheA' }, do: [{ comms: 'c_cacheA_flag' }, ...done('o_cacheA')] },
  { id: 't_watcher', when: { all: [convoyAt(2850), { flag: 'p:raid1Clear' }] }, do: [
      { call: 'watcher', args: { appear: true } }, { music: { stinger: 'dread' } },
      { comms: 'c_watcher', wait: true }, { call: 'watcher', args: { leaveAfter: 22 } } ] },
  { id: 't_watcher_gone', when: { custom: 'watcherGone' }, do: [{ comms: 'c_watcher_gone' }] },

  // ── Z4 · the ruins ─────────────────────────────────────────────────────────────────────────────────────────
  { id: 't_ruins_warn', when: { all: [convoyAt(3500), { flag: 'p:raid1Clear' }] }, do: [{ comms: 'c_ruins' }] },
  { id: 't_ruins', when: { all: [convoyAt(3650), { flag: 'p:raid1Clear' }] }, do: [
      ...flags('p:ruins'), { checkpoint: 'cp_ruins' },
      { spawn: 'e_ruins' }, ...add('o_ruins'), { music: { theme: RAID } },
      { comms: 'c_rusk1', wait: true }, { wait: 3 }, { comms: 'c_rusk_who' } ] },
  { id: 't_harpooner', when: { custom: 'unitOut', args: { tag: 'harpooner' } }, do: [{ comms: 'c_harpooner' }, term('harpooner', 'qb')] },
  { id: 't_rusk2', when: { custom: 'waveStarted', args: { encounter: 'e_ruins', wave: 1 } }, do: [
      { comms: 'c_rusk2', wait: true }, { wait: 2 }, { comms: 'c_handshake' } ] },
  { id: 't_ruins_clear', when: { cleared: 'e_ruins' }, do: [
      ...flags('p:ruinsClear'), { music: { theme: ROAD } }, ...done('o_ruins'), { comms: 'c_ruins_clear' }] },

  // ── Z4 north · Sync and the volleys (E4) ───────────────────────────────────────────────────────────────────
  { id: 't_sync', when: { all: [{ flag: 'p:ruinsClear' }, convoyAt(4550)] }, do: [
      ...flags('p:sync'), { wait: 3 }, { music: { stinger: 'discovery' } },
      { call: 'sync', args: { enable: true, unlock: ['sight'], fill: 3 } }, { call: 'hudPanels', args: { sync: true } },
      { comms: 'c_sync', wait: true }, term('sync'), hint('sync'),
      { wait: 6 }, { call: 'kite', args: { follow: 'tick', h: 220 } }, { comms: 'c_kite', wait: true },
      { call: 'tallySkyline', args: { show: true } }, { music: { stinger: 'dread' } }, { comms: 'c_tally_seen', wait: true },
      ...add('o_volley'), { wait: 6 },
      { call: 'volley', args: { n: 1, freeSight: true } }, { comms: 'c_volley1' }, term('second_sight'), hint('sight'),
      { waitFor: { custom: 'volleyLanded', args: { n: 1 } } }, { wait: 18 },
      { call: 'sync', args: { atLeast: 3 } }, { call: 'volley', args: { n: 2 } }, { comms: 'c_volley2' },
      { waitFor: { custom: 'volleyLanded', args: { n: 2 } } }, ...flags('volleyDone'), ...done('o_volley'),
      { comms: 'c_volley_done' }, { wait: 12 }, ...flags('p:mercyReady') ] },

  // ── Z5 · Big Mercy and the Tally ───────────────────────────────────────────────────────────────────────────
  { id: 't_mercy', when: { all: [{ flag: 'p:mercyReady' }, convoyAt(4900)] }, do: [{ event: 'mercy' }] },
  { id: 't_cable1', when: { killed: { tag: 'mercyCable', count: 1 } }, do: [{ comms: 'c_cable1' }] },
  { id: 't_cable2', when: { killed: { tag: 'mercyCable', count: 2 } }, do: [{ comms: 'c_cable2' }] },
  { id: 't_deck_warn', when: { all: [{ custom: 'onTally' }, { custom: 'tallyPhase', args: { eq: 1 } }] }, do: [{ comms: 'c_deck_warn' }] },
  { id: 't_hum1', when: { custom: 'mercyProgress', args: { gte: 0.25 } }, do: [{ comms: 'c_hum1' }] },
  { id: 't_mercy_half', when: { custom: 'mercyProgress', args: { gte: 0.5 } }, do: [{ comms: 'c_mercy_half' }] },
  { id: 't_hum2', when: { custom: 'mercyProgress', args: { gte: 0.6 } }, do: [{ comms: 'c_hum2' }] },
  { id: 't_mercy_free', when: { all: [{ flag: 'p:mercy' }, { killed: { tag: 'mercyCable', count: 3 } }, { not: { flag: 'bigMercyLost' } }] }, do: [{ event: 'mercyFree' }] },
  { id: 't_mercy_lost', when: { all: [{ custom: 'mercyProgress', args: { gte: 1 } }, { not: { flag: 'bigMercySaved' } }] }, do: [{ event: 'mercyLost' }] },
  { id: 't_drive', when: { all: [{ flag: 'p:deck' }, { any: [{ custom: 'onTally' }, { custom: 'since', args: { mark: 'deck', sec: 12 } }] }] }, do: [
      { call: 'sync', args: { unlock: ['drive'], atLeast: 4 } }, { comms: 'c_drive' }, term('moth_drives'), hint('drive') ] },
  { id: 't_crane', when: { custom: 'craneGrab' }, do: [{ comms: 'c_crane' }] },
  { id: 't_claw', when: { custom: 'rackHas', args: { part: 'crane_claw' } }, do: [{ comms: 'c_claw' }, term('crane_claw')] },
  { id: 't_hold', when: { all: [{ flag: 'p:deck' }, { any: [
      { all: [{ health: { tag: 'mainmast', below: 0.6 } }, { custom: 'nearTally', args: { r: 200 } }] },
      { custom: 'since', args: { mark: 'deck', sec: 75 } }] }] }, do: [{ event: 'holdShot' }] },
  { id: 't_mast_low', when: { all: [{ flag: 'p:deck' }, { health: { tag: 'mainmast', below: 0.25 } }] }, do: [{ comms: 'c_mast_low' }] },
  { id: 't_capsize', when: { all: [{ flag: 'p:deck' }, { killed: { tag: 'mainmast' } }] }, do: [{ event: 'capsize' }] },

  // ── Z6 · Skimmers, the broadcast; the haul cards whenever a part first enters the rack ─────────────────────
  { id: 't_hungry', when: { custom: 'hungryNear', args: { r: 150 } }, do: [{ comms: 'c_hungry' }, term('hungry')] },
  { id: 't_skates', when: { custom: 'rackHas', args: { part: 'skate_jets' } }, do: [{ comms: 'c_skates' }, term('skate_jets')] },
  { id: 't_sail', when: { custom: 'rackHas', args: { part: 'sail_rig' } }, do: [term('sail_rig')] },
  { id: 't_rivet', when: { custom: 'rackHas', args: { part: 'rivet_driver' } }, do: [{ comms: 'c_rivet' }, term('rivet_driver')] },
  { id: 't_skimmers_clear', when: { all: [{ flag: 'p:capsize' }, { any: [{ cleared: 'e_skimmers' }, { custom: 'skimmersLeft' }] }] }, do: [
      ...flags('p:skimClear'), { music: { theme: ROAD } }, ...done('o_skimmers'), { comms: 'c_skimmers_clear' } ] },
  { id: 't_foreman', when: { all: [{ flag: 'p:skimClear' }, convoyAt(7000)] }, do: [
      { comms: 'c_foreman', wait: true },
      { if: { flag: 'bigMercyLost' }, then: [{ comms: 'c_foreman_after_lost' }], else: [{ comms: 'c_foreman_after' }] } ] },

  // ── Z7 · the Sundial ───────────────────────────────────────────────────────────────────────────────────────
  { id: 't_dial', when: { all: [{ flag: 'p:capsize' }, convoyAt(7650)] }, do: [{ comms: 'c_dial' }] },
  { id: 't_cacheB_spot', when: { all: [{ flag: 'p:capsize' }, convoyAt(7700), { not: { flag: 'cacheB' } }] }, do: [
      { comms: 'c_cacheB_spot' }, ...add('o_cacheB'), term('water_cache'), { call: 'flagCache', args: { id: 'cacheB' } } ] },
  { id: 't_cacheB_near', when: { enter: { at: DATA.caches.cacheB, r: 30 } }, do: [hint('tanks')] },
  { id: 't_cacheB_flag', when: { flag: 'cacheB' }, do: [{ comms: 'c_cacheB_flag' }, ...done('o_cacheB')] },
  { id: 't_camp', when: { all: [{ flag: 'p:capsize' }, convoyAt(8560)] }, do: [{ event: 'camp' }] },
  // the shade toggles: each arms the other, so a blend runs once per crossing of the stripe's edge
  { id: 't_shade_in', when: { custom: 'inShade' }, once: false, do: [{ art: ART_SHADE, blend: 2 }, { disable: 't_shade_in' }, { enable: 't_shade_out' }] },
  { id: 't_shade_out', when: { not: { custom: 'inShade' } }, enabled: false, once: false,
    do: [{ art: ART_SUN, blend: 2 }, { disable: 't_shade_out' }, { enable: 't_shade_in' }] },
  { id: 't_plaque', when: { flag: 'plaque' }, do: [
      { interstitial: [{ style: 'plaque', hold: 6, text: 'SUNDIAL GNOMON · RAISED IN THE FOURTH YEAR\n' +
        'WHEN THE SHADOW LIES ON THE ROAD STONE, WALK THE SHADOW NORTH.\nCARRY THEM HOME. SET THEM DOWN.' }] },
      ...done('o_plaque'), { comms: 'c_plaque' }, term('founders') ] },
  { id: 't_bench', when: { all: [{ flag: 'p:camp' }, { objective: 'o_bench' }] }, do: [{ event: 'ending' }] },
];

// ── the level ────────────────────────────────────────────────────────────────────────────────────────────────────
const def = {
  id: 'l02', title: 'THE WAKE', subtitle: 'The Morning Steppe', order: 2, seed: 116002,
  par: { time: 1080, damage: 22000 },
  campaign: { bench: true, waterFlags: ['mercy1', 'mercy2', 'mercy3', 'mercy4', 'cacheA', 'cacheB'] },

  briefing: {
    header: 'THE WAKE · ROAD ORDER', title: 'THE WAKE', subtitle: 'The Morning Steppe',
    body: 'Wake rolls north on the old colony road. Sundial by noon: the big needle on the horizon. We camp in its shade.\n' +
          'Raiders work these reeds. You ride the flanks, girl. Nobody gets dragged off.\n' +
          "Big Mercy's our water tanker. Everything we've got is in her. Watch her.\n" +
          '— O. Desh, the Bench',
    objectives: ['Escort the Wake to the Sundial', 'Keep every rig on the road', 'Keep Big Mercy safe'],
    fine: 'Keep up.',
    showMap: false,
  },
  intro: [], outro: [],
  unlocks: { levels: ['l03'] },

  // L2 §5.3: a tag on each speaker's first line in a playthrough (spoiler-free; the Foreman and the Watcher stay unknown)
  speakers: {
    JUNO:    { name: 'JUNO', tag: 'you', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
               channel: 'LOCAL', font: 'sans', speed: 1.0, static: 0 },
    MOTH:    { name: 'MOTH', tag: 'your frame', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal',
               channel: 'LOCAL', font: 'monoCaps', speed: 1 },
    KIT:     { name: 'KIT · TICK', tag: 'your brother, the scout', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 },
               style: 'radio', channel: 'WAKE', speed: 1.4, static: 0.25 },
    OMA:     { name: 'OMA · BENCH', tag: "the convoy's elder and mechanic", color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' },
               style: 'radio', channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
    HESPER:  { name: 'HESPER · COMPASS ROSE', tag: "the Wake's navigator", color: '#b8b4ac', voice: { base: 260, wave: 'triangle' },
               style: 'radio', channel: 'WAKE', speed: 1.0, static: 0.25 },
    ANSEL:   { name: 'ANSEL · BIG MERCY', tag: 'driver of Big Mercy, the water tanker', color: '#b8b4ac', voice: { base: 120, wave: 'sine' },
               style: 'radio', channel: 'WAKE', speed: 0.8, static: 0.3 },
    RUSK:    { name: 'TALLYMAN', tag: 'Dredge water-officer, commanding the raiders', color: '#c4532e', voice: { base: 190, wave: 'sawtooth', jitter: 0.2 },
               style: 'intercept', channel: 'DREDGE', speed: 1.2, static: 0.7 },
    // wobble and speedVar are addendum 02 E6 fields (ignored until they land: plain pale green text)
    TALLOW:  { name: '', tag: 'unknown voice', color: '#b8f5c0', voice: { base: 400, wave: 'sine', jitter: 0.35 }, style: 'internal',
               channel: 'LOCAL', font: 'sans', speed: 0.9, static: 0, wobble: 0.6, speedVar: 0.5 },
    FOREMAN: { name: '', tag: 'unknown voice', color: '#e9d79a', voice: { base: 140, wave: 'sine' }, style: 'intercept',
               channel: 'OPEN', speed: 0.7, italic: true, static: 0, chime: true },
  },

  factions: {   // L2 §10: living crews tungsten-amber, ghosts pale green (A2 #7 reserved colours)
    dredge:   { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#ffb36b', wear: 0.55 },
    ghost:    { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#a8ff9e', wear: 0.7 },
    wake:     { shell: '#b9a98a', mid: '#4f7d7a', accent: '#c8682e', dark: '#2a2420', eye: '#ffb36b', wear: 0.6 },
    founders: { shell: '#e6e2d8', mid: '#c9c3b5', accent: '#d8b25a', dark: '#3a3d40', eye: '#5fe3ff', wear: 0.4 },
  },

  music: { theme: ROAD, combat: RAID },

  route: {
    points: [[650, 3900], [600, 3450], [700, 2950], [900, 2400], [930, 1850], [760, 1350], [450, 950], [100, 580], [-280, 160],
             [-600, -320], [-720, -850], [-660, -1380], [-460, -1900], [-230, -2420], [-110, -2950], [-110, -3350], [-230, -3760], [-430, -4120]],
    halfWidth: [650, 650, 700, 750, 750, 700, 700, 650, 650, 700, 900, 900, 750, 700, 700, 750, 750, 700],
  },

  terrain: {
    bounds: [-2400, -5400, 2600, 5000], macroCell: 10,
    base: { scale: 1400, amp: 22, octaves: 5, ridged: 0.15, warp: 120 },
    features: [
      { kind: 'ridge', at: [-300, 4250], to: [1600, 4250], r: 260, h: 70, sharpness: 0.5 },                    // the southern lip
      { kind: 'ridge', at: { s: 2800, l: 560 }, to: { s: 3320, l: 470 }, r: 130, h: 50, sharpness: 0.7 },        // the Watcher's Ridge
      { kind: 'mesa', at: { s: 4150 }, r: 520, h: 12, sharpness: 0.2 },                                         // the wind-farm plateau
      { kind: 'basin', at: { s: 5520, l: -470 }, r: 520, h: 6 },                                                 // the salt pan
      { kind: 'ridge', at: { s: 5250, l: -740 }, to: { s: 5950, l: -700 }, r: 60, h: 12, sharpness: 0.8 },       // the flats' edge
    ],
    detail: { scale: 18, amp: 0.7 },
    walls: { height: 45, start: 0.85, noise: 0.5 },
    carve: { depth: 1.2, bedWidth: 110, shoulder: 90, smooth: 260, maxGrade: 0.05, strength: 0.8 },
    erosion: { droplets: 60000, thermal: 1 },
    stamps: [
      ...[[5150, -260], [5300, -380], [5450, -470], [5600, -560], [5750, -520]].map(([s, l]) =>
         ({ at: { s, l }, r: 170, falloff: 40, mode: 'flatten', noScatter: true })),                              // the pan floor (its own level)
      { at: { s: 5450 }, r: 160, falloff: 40, mode: 'flatten' },                                                 // the laager (the bed's level)
      { at: [PED.x, PED.z], r: 640, falloff: 120, mode: 'flatten' },                                             // the dial floor (its own level)
      { at: [PED.x, PED.z], r: 110, falloff: 20, mode: 'raise', h: 4 },                                          // the plinth berm
      { at: CAMP, r: 220, falloff: 0, mode: 'raise', h: 0, noScatter: true },                                    // the camp in the stripe (keep-out)
      { at: { s: 3200 }, r: 60, falloff: 20, mode: 'lower', h: 4 },                                              // the dry creek
      // scatter keep-outs (raise by 0 = no height change): the Watcher's shelf, the caches, the plaque face
      { at: { s: 3050, l: 520 }, r: 20, falloff: 0, mode: 'raise', h: 0, noScatter: true },
      { at: DATA.caches.cacheA, r: 9, falloff: 0, mode: 'raise', h: 0, noScatter: true },
      { at: DATA.caches.cacheB, r: 9, falloff: 0, mode: 'raise', h: 0, noScatter: true },
    ],
  },

  art: {
    ...ART_BASE,
    palette: PALETTE,
    toneMapping: 'aces',
    surface: { style: 'grit', dust: 0.25, rockSlope: [0.3, 0.55], strataHeight: 8 },
    // the Sundial (and its long shadow), the far sails and the Tally on the horizon are level-owned (levels/level02/
    // sundial.js, skyline.js): they need to sit exactly where the gameplay says. The Dredge's plume is the engine's.
    skyline: [{ kind: 'smoke', at: { azimuth: 10, dist: 14000 }, size: 3, color: '#4a3a30' }],
    ambience: [],
    scatter: [
      { prop: 'reed_clump', density: 1000, scale: [0.95, 1.45], slope: [0, 0.45], avoidRoute: true, maxDist: 250, seed: 21 },
      { prop: 'scrub', density: 30, scale: [0.6, 1.4], slope: [0, 0.5], maxDist: 180 },
      { prop: 'rock_medium', density: 2, scale: [1, 3], slope: [0.1, 0.8], collide: true, collideMinScale: 2.4 },
      { prop: 'boulder', density: 0.3, scale: [4, 9], avoidRoute: true, collide: true, castShadow: true },
      { prop: 'rock_large', density: 6, scale: [3, 7], slope: [0.25, 1], range: [2700, 3400], collide: true, castShadow: true },   // the ridge crest
      { prop: 'pebbles', density: 60, maxDist: 120 },
    ],
  },

  // `zones` is a getter: it registers the level-only structure types with ctx.structures before World.load places them
  // (custom.install runs after the world loads; arch §8.2). Without a reachable ctx it returns the zones without those
  // structures, and custom.install places them instead.
  get zones() {
    const ctx = liveCtx();
    return ctx?.structures && ensureL2Structures(ctx) ? ZONES : ZONES_BARE;
  },

  checkpoints: [
    { id: 'cp_lip',   at: { s: 520, l: -80 },  yaw: 'route', label: 'The lip' },
    { id: 'cp_reeds', at: { s: 2450, l: -80 }, yaw: 'route', label: 'The reed sea' },
    { id: 'cp_ruins', at: { s: 3700, l: -90 }, yaw: 'route', label: 'The turbine ruins' },
    { id: 'cp_flats', at: { s: 5300, l: -150 }, yaw: { azimuth: 270 }, label: 'The salt flats' },
    { id: 'cp_deck',  at: { s: 5600, l: -380 }, yaw: { azimuth: 270 }, label: "The Tally's deck" },   // moved beside the anchored hull by playerTo
    { id: 'cp_road',  at: { s: 5500, l: -80 }, yaw: 'route', label: 'The colony road' },
  ],

  // L2 §9.4: every objective says what to do and where (a marker on every one with a place); `label` is the marker text
  objectives: [
    { id: 'o_escort', text: 'Escort the Wake to the Sundial', label: 'THE SUNDIAL', kind: 'manual', marker: { x: PED.x, z: PED.z, y: 520 } },
    { id: 'o_raid1', text: 'Drive off the raiders in the reeds', kind: 'kill', target: { encounter: 'e_raid1' }, showCount: true, marker: 'targets' },
    // the pool of hooked rigs: the convoy code sets the text ("Cut Brass Mule free: …") and tags the cable 'free<n>'
    { id: 'o_free1', text: 'Cut the hooked rig free: shoot or blade the cable', kind: 'manual', target: { tag: 'free1' }, marker: 'targets' },
    { id: 'o_free2', text: 'Cut the hooked rig free: shoot or blade the cable', kind: 'manual', target: { tag: 'free2' }, marker: 'targets' },
    { id: 'o_free3', text: 'Cut the hooked rig free: shoot or blade the cable', kind: 'manual', target: { tag: 'free3' }, marker: 'targets' },
    { id: 'o_cacheA', text: 'Flag the water tanks in the reeds, left of the road', label: 'WATER TANKS', kind: 'flag', flag: 'cacheA', optional: true, marker: { ...DATA.caches.cacheA, h: 3 } },
    { id: 'o_ruins', text: 'Stop the harpooners in the turbine ruins', kind: 'kill', target: { encounter: 'e_ruins' }, showCount: true, marker: 'targets' },
    { id: 'o_volley', text: 'Get through the rocket volleys: watch their paths', kind: 'flag', flag: 'volleyDone' },
    { id: 'o_cables', text: 'Cut the three cables dragging Big Mercy', kind: 'destroy', target: { tag: 'mercyCable', count: 3 }, showCount: true, marker: 'targets' },
    { id: 'o_mast', text: 'Board the Tally and break its mainmast', kind: 'destroy', target: { tag: 'mainmast' }, marker: 'targets' },
    { id: 'o_skimmers', text: 'Drive off the Skimmers', kind: 'kill', target: { encounter: 'e_skimmers' }, showCount: true, marker: 'targets' },
    { id: 'o_cacheB', text: 'Flag the water tanks by the dial stone, right of the road', label: 'WATER TANKS', kind: 'flag', flag: 'cacheB', optional: true, marker: { ...DATA.caches.cacheB, h: 3 } },
    { id: 'o_camp', text: "Follow the Wake into the Sundial's shadow", label: 'CAMP', kind: 'reach', at: CAMP, r: 120, marker: true },
    { id: 'o_plaque', text: "Read the plaque on the Sundial's base", label: 'PLAQUE', kind: 'flag', flag: 'plaque', optional: true, marker: DATA.plaque },
    { id: 'o_bench', text: 'Bring the frame to the Bench, under its work lamp', label: 'THE BENCH', kind: 'reach', at: BENCH, r: 18, marker: { ...BENCH, h: 6 } },
  ],

  encounters,
  triggers,

  events: {
    mercy: [
      ...flags('p:mercy'), { call: 'convoy', args: { mode: 'circle' } }, { music: { stinger: 'boss' } },
      { call: 'tallySkyline', args: { show: false } }, { call: 'kite', args: { follow: 'bigMercy', h: 90 } },
      { spawn: 'e_tally' },
      // the harpoon (L2 §7.3): side effects in a parallel branch next to the shot
      { parallel: [ [{ call: 'shot', args: { name: 'harpoonMercy', rel: 'bigMercy' } }],
                    [{ call: 'tally', args: { harpoon: true } }, { wait: 3.6 }, { comms: 'c_harpoon' }, { shake: 0.6 }] ] },
      { call: 'tally', args: { drag: true } },
      { checkpoint: 'cp_flats' }, { music: { theme: TALLY } },
      { call: 'band', args: { centre: 'bigMercy' } },
      { comms: 'c_mercy' }, term('tally', 'big_mercy'), ...add('o_cables'), hint('cable'),
    ],
    mercyFree: [
      ...done('o_cables'), ...flags('bigMercySaved', 'mercy1', 'mercy2', 'mercy3', 'mercy4'),
      { call: 'story', args: { bigMercy: 'saved' } }, { call: 'mercy', args: { free: true } },
      { comms: 'c_mercy_free', wait: true }, { call: 'tally', args: { anchor: true } },
      { waitFor: { flag: 'tally:anchored' } },
      { comms: 'c_anchor' }, term('boarding'),
      ...flags('p:deck'), { call: 'mark', args: { id: 'deck' } }, { checkpoint: 'cp_deck' }, ...add('o_mast'),
    ],
    mercyLost: [
      { objective: { fail: 'o_cables' } }, ...flags('bigMercyLost'), { call: 'convoy', args: { lose: 3 } },
      { call: 'story', args: { bigMercy: 'lost' } }, { call: 'mercy', args: { lost: true } },
      { comms: 'c_mercy_lost', wait: true }, { call: 'tally', args: { anchor: true } },
      { waitFor: { flag: 'tally:anchored' } },
      { comms: 'c_anchor' }, term('boarding'),
      ...flags('p:deck'), { call: 'mark', args: { id: 'deck' } }, { checkpoint: 'cp_deck' }, ...add('o_mast'),
    ],
    holdShot: [
      { comms: 'c_sweeper', wait: true },
      { call: 'sync', args: { unlock: ['hold'], atLeast: 6 } },
      { call: 'tally', args: { sweeperShot: { lethal: true, telegraph: 1.5 } } },      // the engine's Hold fires on the hit (A2 E1)
      { call: 'slowmo', args: { scale: 0.4, seconds: 1.2 } }, { comms: 'c_hold', wait: true },
      { wait: 2 }, { comms: 'c_hold_after' }, term('hold'), hint('hold'),
    ],
    capsize: [
      ...done('o_mast'), ...flags('p:capsize'), { music: { stinger: 'boss' } },
      { parallel: [ [{ call: 'shot', args: { name: 'capsize', rel: 'tally' } }],
                    [{ call: 'tally', args: { capsize: true } }, { call: 'playerClear', args: { from: 'tally', dist: 60 } },
                     { call: 'rusk', args: { flee: true } }, { wait: 2.5 }, { comms: 'c_rusk_flee' }, { shake: 1.2 }] ] },
      { call: 'convoy', args: { mode: 'roll', reform: true } }, { call: 'band', args: { centre: 'convoy' } },
      { call: 'kite', args: { follow: 'tick', h: 110 } },
      { checkpoint: 'cp_road' }, { music: { theme: RAID } },
      { if: { flag: 'bigMercyLost' }, then: [{ comms: 'c_reform_lost' }], else: [{ comms: 'c_reform' }] },
      { spawn: 'e_skimmers' }, ...add('o_skimmers'), { comms: 'c_skimmers' }, term('skimmers', 'ghost'),
    ],
    camp: [
      ...flags('p:camp'), { call: 'convoy', args: { mode: 'camp' } }, { music: { theme: NOON } },
      { comms: 'c_noon', wait: true }, ...done('o_escort'), ...add('o_camp', 'o_bench', 'o_plaque'),
      { call: 'plaqueInteract' },
    ],
    ending: [
      { player: { freeze: true } },
      { parallel: [ [{ cinematic: 'kiteWorld' }],
                    [{ call: 'kite', args: { up: 'stripe', h: 600, seconds: 12 } }, { wait: 0.6 }, { comms: 'c_kite_world', wait: true },
                     { call: 'musicBox' }, { fade: 1, seconds: 3 }] ] },
      { complete: true },
    ],
  },

  // `harpoonMercy` and `capsize` are played by the custom action `shot` with keys relative to Big Mercy / the Tally
  // (x across, z behind, y up, in that object's frame); the others are ordinary route-relative shots.
  cinematics: {
    vista: { skippable: true, keys: [
      { t: 0, pos: { s: 380, l: 90, h: 22 }, look: { x: PED.x, z: PED.z, y: 420 }, fov: 34 },
      { t: 8, pos: { s: 470, l: 60, h: 14 }, look: { x: PED.x, z: PED.z, y: 380 }, fov: 30, ease: 'inOut' } ] },
    harpoonMercy: { skippable: false, keys: [
      { t: 0, pos: { x: 34, z: 42, y: 7 }, look: { x: -60, z: -40, y: 9 }, fov: 50 },
      { t: 8, pos: { x: 58, z: 70, y: 16 }, look: { x: -110, z: -120, y: 12 }, fov: 44, ease: 'inOut' } ] },
    capsize: { skippable: false, keys: [
      { t: 0, pos: { x: 120, z: 90, y: 32 }, look: { x: 0, z: 0, y: 18 }, fov: 50 },
      { t: 7, pos: { x: 150, z: 120, y: 24 }, look: { x: -20, z: 0, y: 6 }, fov: 46, ease: 'inOut' } ] },
    kiteWorld: { skippable: false, keys: [
      { t: 0,  pos: { s: 8540, l: 60, h: 8 },  look: { s: 8580, l: 125, h: 8 }, fov: 44 },
      { t: 6,  pos: { s: 8550, l: 70, h: 10 }, look: { s: 8700, l: 160, h: 140 }, fov: 50, ease: 'inOut' },
      { t: 14, pos: { s: 8555, l: 72, h: 12 }, look: { s: 9200, l: 400, h: 600 }, fov: 56, ease: 'inOut' } ] },
  },

  comms: {
    c_morning: [{ who: 'OMA', text: "Morning, girl. You haven't climbed down since the ice." }, { who: 'MOTH', text: 'She is resting.' },
                { who: 'JUNO', text: "I'm right here, Oma." }, { who: 'OMA', text: 'So you are.' }],
    c_roll: [{ who: 'OMA', text: "Wake's rolling. Ride the flanks. Anything that wants a rig goes through you." }, { who: 'JUNO', text: 'Copy.' }],
    c_hesper1: [{ who: 'HESPER', text: 'Compass Rose to all rigs. Sundial bears three-five-four. Hold your columns.' },
                { who: 'KIT', text: "Hesper says three-five-four like it's a song." }, { who: 'HESPER', text: 'It is a song, Kit. Learn it.' }],
    c_ration: [{ who: 'JUNO', text: 'Ration, Moth.' }, { who: 'MOTH', text: 'Dispensed.' }, { who: 'JUNO', text: 'Tastes like the last one.' },
               { who: 'MOTH', text: 'Noted. Query: is that good?' }, { who: 'JUNO', text: "It's consistent." }],
    c_still: [{ who: 'KIT', text: "Hesper says if we keep this pace we'll see the Still before I'm sixteen." },
              { who: 'JUNO', text: 'Hesper says a lot of things.' }, { who: 'KIT', text: "She said you'd say that." }],
    c_band: [{ who: 'OMA', text: 'Girl. Where are you going?' }],
    c_reeds: [{ who: 'KIT', text: "Reeds are moving. Left side, way out. That's not wind." }, { who: 'JUNO', text: 'Kite up. Everyone tighten up.' }],
    c_raid1: [{ who: 'KIT', text: 'SAILS! Three— no. Three. Three sails!' }, { who: 'JUNO', text: 'I see them. Stay behind Big Mercy, Kit.' }],
    // templates: the convoy code substitutes {rig} and plays them with ctx.comms.play
    c_hooked: [{ who: 'HESPER', text: "{rig}'s hooked! They're dragging her off the road!" }, { who: 'JUNO', text: 'On it.' }],
    c_freed_kit: [{ who: 'KIT', text: "{rig}'s LOOSE! She's coming back!" }],
    c_freed_hesper: [{ who: 'HESPER', text: "{rig}'s back in her column. Good." }],
    c_lost: [{ who: 'HESPER', text: "We've lost {rig}. Close up the column." }, { who: 'JUNO', text: '…Close up.' }],
    c_first_tear: [{ who: 'JUNO', text: "Oma'll want that." }],
    c_wave2: [{ who: 'KIT', text: 'Two more sails behind us! Right side!' }],
    c_raid1_clear: [{ who: 'KIT', text: 'Ha— hahaha. Okay. Okay so that was a LOT of sails.' }, { wait: 2 },
                    { who: 'MOTH', text: 'Query: Kit laughed while they were shooting at him. Why do people laugh when they are scared?' },
                    { who: 'JUNO', text: 'Ask me at camp.' }, { who: 'MOTH', text: 'Logged.' }],
    c_open1: [{ who: 'HESPER', text: "Road's clear. All rigs, open her up." }],
    c_open2: [{ who: 'HESPER', text: 'Clear. Open her up.' }],
    c_open3: [{ who: 'HESPER', text: 'Open road. Make up the time.' }],
    c_cacheA_spot: [{ who: 'KIT', text: 'Kite sees tank lids in the reeds. Left of the road, by a cairn. Full ones!' },
                    { who: 'JUNO', text: "I'll flag them if there's time." }],
    c_cacheA_flag: [{ who: 'KIT', text: 'Old paint on them. Lantern Line. Never heard of them.' }, { who: 'JUNO', text: 'They went dry. Years back.' },
                    { who: 'KIT', text: '…Oh.' }],
    c_watcher: [{ who: 'KIT', text: "Jun. Ridge, right side. There's a frame up there." }, { who: 'KIT', text: "It's got a light. A green one." },
                { wait: 2 }, { who: 'TALLOW', text: 'Hello hello.' }, { who: 'JUNO', text: 'Moth, who—' }, { who: 'MOTH', text: 'Interference.' }],
    c_watcher_gone: [{ who: 'KIT', text: "It's going. It didn't even shoot. Why didn't it shoot?" }, { who: 'JUNO', text: "Don't know. Eyes front." }],
    c_ruins: [{ who: 'HESPER', text: 'Turbine ruins ahead. Road runs right through. Keep it tight.' },
              { who: 'KIT', text: 'I hate the ruins. Things hide in the ruins.' }],
    c_rusk1: [{ who: 'RUSK', text: 'Every drop on Gaunt is tallied, hauler. Yours are overdue.' }],
    c_rusk_who: [{ who: 'KIT', text: "Who's THAT?" }, { who: 'OMA', text: 'Tallyman. Dredge water-officer. Keeps the books on everything they steal.' }],
    c_harpooner: [{ who: 'JUNO', text: 'Walkers in the ruins. Cable guns. Keep the rigs moving.' }],
    c_rusk2: [{ who: 'RUSK', text: "Your frame's handshake is loud. We can hear you from the Dredge." }],
    c_handshake: [{ who: 'JUNO', text: "What's a handshake?" }, { who: 'MOTH', text: 'A signal. I will try to be quieter.' }],
    c_rivet: [{ who: 'JUNO', text: 'Rivet gun. Heavy.' }],
    c_ruins_clear: [{ who: 'KIT', text: "That's the last walker! I think. Is it? It is. YES." }],
    c_sync: [{ who: 'MOTH', text: 'Juno. I have context now. I can anticipate you.' }, { who: 'JUNO', text: 'Meaning?' },
             { who: 'MOTH', text: 'Meaning when you need me, I will already be moving.' }],
    c_kite: [{ who: 'KIT', text: "Kite's up! Good news: I can see the Dredge. Bad news: I can see the Dredge." },
             { who: 'KIT', text: 'Wait. Something closer. Three masts, out on the flats.' }],
    c_tally_seen: [{ who: 'HESPER', text: "That's the Tally. The Tallyman's flagship." }, { who: 'JUNO', text: 'Stay with Big Mercy, Kit.' }],
    c_volley1: [{ who: 'KIT', text: 'Flashes on the masts— ROCKETS! Coming at YOU, Jun!' }, { who: 'MOTH', text: 'Second Sight. Watch the lines.' }],
    c_volley2: [{ who: 'MOTH', text: 'Again. Your turn.' }],
    c_volley_done: [{ who: 'KIT', text: "It's turning. It's coming. It's coming FAST." }],
    c_harpoon: [{ who: 'RUSK', text: 'Big Mercy. Four tanks, four souls, all overdue.' }, { who: 'ANSEL', text: 'Hm. Hm-hm-hmm.' }],
    c_mercy: [{ who: 'HESPER', text: "Big Mercy's hooked! Three cables! All rigs, stop and circle!" },
              { who: 'JUNO', text: "Big Mercy, keep your wheels straight. Don't watch the harpoons. Watch me." },
              { who: 'ANSEL', text: 'Hm-hm. Watching you.' }],
    c_cable1: [{ who: 'KIT', text: 'ONE! Two to go!' }],
    c_cable2: [{ who: 'KIT', text: "TWO! She's dragging slower!" }],
    c_deck_warn: [{ who: 'KIT', text: 'Get off the deck, Jun! The CABLES!' }],
    c_hum1: [{ who: 'ANSEL', text: 'Hm-hm-hmm. Hm. Hm-hm.' }],
    c_mercy_half: [{ who: 'HESPER', text: "Big Mercy's halfway to the edge of the flats. Juno." }],
    c_hum2: [{ who: 'ANSEL', text: 'HM-hm-hmm. Hm-HM.' }],
    c_mercy_free: [{ who: 'ANSEL', text: "…She's stopped. She's stopped. Thank you, frame. Thank you, Juno." },
                   { who: 'RUSK', text: "Spikes down! Bring her about! I'll collect from the frame instead." }],
    c_mercy_lost: [{ who: 'ANSEL', text: 'Hm-hm. Hm—', hold: 0.3 }, { wait: 1 }, { who: 'HESPER', text: "Big Mercy's over the edge. She's gone." },
                   { wait: 2 }, { who: 'RUSK', text: 'One tanker, paid in full. Now the frame.' }],
    c_anchor: [{ who: 'KIT', text: "It stopped! It's— it's TURNING. At you!" }, { who: 'JUNO', text: 'Good. Now it holds still.' }],
    c_drive: [{ who: 'MOTH', text: 'Let me drive. You shoot.' }, { who: 'JUNO', text: 'Since when do you drive?' }, { who: 'MOTH', text: 'Since now.' }],
    c_crane: [{ who: 'KIT', text: "The crane! It's grabbing for you!" }],
    c_claw: [{ who: 'JUNO', text: 'Their claw. Oma can use that.' }],
    c_sweeper: [{ who: 'RUSK', text: 'Hold still, hauler. Let me balance the books.' }],
    c_hold: [{ who: 'MOTH', text: 'Hold on to me.' }],
    c_hold_after: [{ who: 'JUNO', text: 'You said that under the ice.' }, { who: 'MOTH', text: 'I did.' }],
    c_mast_low: [{ who: 'KIT', text: "The mast's going, the whole mast is GOING—" }],
    c_rusk_flee: [{ who: 'RUSK', text: 'This goes on your tally, hauler!' }, { who: 'KIT', text: "He's running! On a sled thing! A hover sled!" }],
    c_reform: [{ who: 'HESPER', text: 'All rigs, back in columns. Big Mercy, take your place.' }, { who: 'ANSEL', text: 'Hm. Taking it.' }],
    c_reform_lost: [{ who: 'HESPER', text: 'All rigs, back in columns. Close the gap where Big Mercy was.' }],
    c_skimmers: [{ who: 'KIT', text: 'Sleds! Four— no, FOUR. Fast ones. Green lights.' }, { who: 'JUNO', text: "Don't look at the lights." }],
    c_hungry: [{ who: 'MOTH', text: 'That one is hungry. It will need room.' }, { who: 'JUNO', text: 'Room?' },
               { who: 'MOTH', text: 'In me. I will show you at the Bench.' }],
    c_skates: [{ who: 'KIT', text: 'You took its LEGS. Jun took its legs!' }],
    c_skimmers_clear: [{ who: 'HESPER', text: "Road's clear to the Sundial. Open her up." }, { who: 'KIT', text: 'We made it. We basically made it.' }],
    // the Foreman's lines are bible §12.1 V2, V3, V5, verbatim
    c_foreman: [{ who: 'FOREMAN', text: 'Do you know what a day costs on Gaunt, little rig? Ten years of walking. Nobody gets to sit down.' },
                { wait: 2 }, { who: 'FOREMAN', text: 'Work is the only prayer that gets answered.' },
                { wait: 2 }, { who: 'FOREMAN', text: 'The Still is ice and bones. Turn around and work.' },
                { wait: 1.5 }, { who: 'OMA', text: 'Turn that off.' }, { who: 'KIT', text: "Can't. It's on every channel." }],
    c_foreman_after: [{ who: 'ANSEL', text: 'Hm-hm-hmm. Hm-hm. HM-hm-hmm.' }, { who: 'KIT', text: "Ansel's humming over him. Everybody HUM." }],
    c_foreman_after_lost: [{ wait: 3 }, { who: 'JUNO', text: 'Drive louder, then.' }],
    c_dial: [{ who: 'HESPER', text: 'Dial ring. All rigs, ease down. We camp in the shadow.' },
             { who: 'KIT', text: "It's SO big. You can't see the top. Can you see the top?" },
             { who: 'MOTH', text: 'Yes. There is a plaque at the top. It is too far to read.' }],
    c_cacheB_spot: [{ who: 'KIT', text: 'More tanks! Under the stone, right side!' }],
    c_cacheB_flag: [{ who: 'KIT', text: 'That\'s TWO caches. Oma\'s going to say "hm."' }],
    c_noon: [{ who: 'HESPER', text: "Shadow's laid along the north road. Sundial noon, Day Four." },
             { who: 'OMA', text: 'Rigs in, wheels chocked. Bring the frame to the Bench, girl.' }],
    c_plaque: [{ who: 'MOTH', text: 'That phrase again. The same as the ship in the ice.' }, { who: 'JUNO', text: 'Founders wrote it on everything.' }],
    c_kite_world: [{ who: 'KIT', text: 'Watch this. Straight up the shadow. Up, up, up—' }, { who: 'KIT', text: 'I can see the whole WORLD!' },
                   { who: 'MOTH', text: 'Logged.' }, { wait: 1.5 }, { who: 'JUNO', text: '…Good kite.' }],
  },

  collectibles: [   // the salvage cache feeds the Haul rack (A5.2): `unlocks` is a haul part id
    { id: 'cacheS1', kind: 'salvage', at: { s: 4250, l: -380, h: 1 }, unlocks: 'sail_rig', label: 'Wrecked yacht' },
  ],

  start: [
    { call: 'vitals', args: { mode: 'locked', bpm: 60 } },
    { call: 'convoy', args: { start: true, s: 450, mode: 'roll' } },
    { call: 'tick', args: { flank: true } }, { call: 'kite', args: { follow: 'tick', h: 85, show: true } },
    { call: 'hudPanels', args: { rack: false, sync: false, tracker: true } },
    { cinematic: 'vista' },
    { wait: 1.0 }, { comms: 'c_morning', wait: true },
    { wait: 2 }, { comms: 'c_roll' }, ...add('o_escort'), term('convoy', 'wake', 'rigs', 'bench', 'water'), hint('band'),
  ],

  onCheckpoint: {
    cp_reeds: [
      { call: 'restoreCommon', args: { cp: 'cp_reeds' } }, ...flags('p:raid1', 'p:raid1Clear'), ...disable(...SEG_REEDS),
      { music: { theme: ROAD } }, ...add('o_escort'), term('convoy', 'wake', 'rigs') ],
    cp_ruins: [
      { call: 'restoreCommon', args: { cp: 'cp_ruins' } }, ...flags('p:raid1', 'p:raid1Clear', 'p:ruins'), ...disable(...SEG_RUINS),
      ifNone('enc:e_ruins', [{ spawn: 'e_ruins' }]), { music: { theme: RAID } }, ...add('o_escort', 'o_ruins'),
      term('convoy', 'rigs'), { comms: 'c_rusk1', wait: true }, { wait: 3 }, { comms: 'c_rusk_who' } ],
    cp_flats: [
      { call: 'restoreCommon', args: { cp: 'cp_flats' } },
      ...flags('p:raid1', 'p:raid1Clear', 'p:ruins', 'p:ruinsClear', 'p:sync', 'volleyDone', 'p:mercyReady', 'p:mercy'), ...disable(...SEG_FLATS),
      { call: 'sync', args: { enable: true, unlock: ['sight'], atLeast: 3 } }, { call: 'hudPanels', args: { sync: true } },
      { call: 'convoy', args: { mode: 'circle', instant: true } },
      ifNone('tally', [{ spawn: 'e_tally' }]), { call: 'tally', args: { restore: 'drag' } },
      { call: 'band', args: { centre: 'bigMercy' } }, { call: 'kite', args: { follow: 'bigMercy', h: 90, show: true } },
      { music: { theme: TALLY } }, ...add('o_escort', 'o_cables'), term('tally', 'big_mercy'), hint('cable') ],
    cp_deck: [
      { call: 'restoreCommon', args: { cp: 'cp_deck' } },
      ...flags('p:raid1', 'p:raid1Clear', 'p:ruins', 'p:ruinsClear', 'p:sync', 'volleyDone', 'p:mercyReady', 'p:mercy', 'p:deck'),
      ...disable(...SEG_DECK),
      { if: { not: { flag: 'bigMercyLost' } }, then: [...flags('bigMercySaved', 'mercy1', 'mercy2', 'mercy3', 'mercy4'), { call: 'story', args: { bigMercy: 'saved' } }] },
      { call: 'sync', args: { enable: true, unlock: ['sight'], atLeast: 3 } }, { call: 'hudPanels', args: { sync: true } },
      { call: 'convoy', args: { mode: 'circle', instant: true } },
      ifNone('tally', [{ spawn: 'e_tally' }]), { call: 'tally', args: { restore: 'anchored' } },
      { call: 'band', args: { centre: 'bigMercy' } }, { call: 'kite', args: { follow: 'bigMercy', h: 90, show: true } },
      { call: 'playerTo', args: { tally: 'port', dist: 70 } }, { call: 'mark', args: { id: 'deck' } },
      { music: { theme: TALLY } }, ...add('o_escort', 'o_mast'), term('boarding') ],
    cp_road: [
      { call: 'restoreCommon', args: { cp: 'cp_road' } },
      ...flags('p:raid1', 'p:raid1Clear', 'p:ruins', 'p:ruinsClear', 'p:sync', 'volleyDone', 'p:mercyReady', 'p:mercy', 'p:deck', 'p:capsize'),
      ...disable(...SEG_ROAD),
      { if: { not: { flag: 'bigMercyLost' } }, then: [...flags('bigMercySaved', 'mercy1', 'mercy2', 'mercy3', 'mercy4'), { call: 'story', args: { bigMercy: 'saved' } }] },
      { call: 'sync', args: { enable: true, unlock: ['sight', 'drive', 'hold'], atLeast: 0 } }, { call: 'hudPanels', args: { sync: true } },
      { call: 'tally', args: { restore: 'wreck' } },
      { call: 'convoy', args: { mode: 'roll', reform: true } }, { call: 'band', args: { centre: 'convoy' } },
      { call: 'kite', args: { follow: 'tick', h: 110, show: true } },
      ifNone('enc:e_skimmers', [{ spawn: 'e_skimmers' }]), { music: { theme: RAID } }, ...add('o_escort', 'o_skimmers'),
      term('skimmers', 'ghost') ],
  },

  // no `complete` block: the 'ending' event ends the level with { complete: true }
  custom: { install: (ctx, mission) => installLevel02(ctx, mission, DATA, { ZONES, L2_TYPES }) },
};

export default def;
export { DATA, ZONES };
