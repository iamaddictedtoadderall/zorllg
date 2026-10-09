// combat/loadout.js (P4): frames (§8.5), the parts catalogue (Appendix C.4 + addendum A3.2), paint presets, stats and
// validation. Pure data and functions: imported by core/save.js, art/mechs.js, ui/garage.js and actors/player.js.
//
// Addendum A3.2 additions (feature-detect them from other packages: `import * as LO`):
//   PartDef.stock / PartDef.haul, FrameStats.campaignOnly, weapon types 'harpoon' and 'flares',
//   MOTH_PAINT, CAMPAIGN_STOCK, campaignLoadout().
// Display names are placeholders the story team may rename; ids are frozen. Part text is spoiler-safe (§8.6).

export const SLOTS = ['R', 'L', 'S', 'U'];

/** Movement constants shared by every frame (prototype values, §1.3). */
const base = {
  enRegen: 720, enRegenAir: 480, qbCost: 170, hoverAccel: 70, hoverCost: 150, jump: 17,
  rad: 2.6, hgt: 9.5, hitR: 3.6,
};

/** Frame stats (§8.5). `design` is the art/mechs.js DESIGNS key (the player falls back to 'vanguard' when it's missing). */
export const FRAMES = {
  vanguard: { ...base, id: 'vanguard', name: 'Vanguard', desc: 'Balanced frame. Angular plating, V-fin sensor head.', design: 'vanguard',
    ap: 9000, en: 1000, speed: 30, qbImpulse: 82, impMax: 1400, load: 60, power: 40 },
  striker: { ...base, id: 'striker', name: 'Striker', desc: 'Light frame. Knife-edged armour, swept back wings.', design: 'striker',
    ap: 7000, en: 1150, speed: 34, qbImpulse: 92, impMax: 1200, load: 45, power: 38, rad: 2.4, hitR: 3.3 },
  bastion: { ...base, id: 'bastion', name: 'Bastion', desc: 'Heavy frame. Rounded armour, wide shoulders, shield arm.', design: 'bastion',
    ap: 12000, en: 900, speed: 26, qbImpulse: 74, impMax: 1900, load: 80, power: 44, rad: 2.9, hitR: 3.9 },
  // A3.2: Vanguard's stats, campaign only (hidden from the free garage). The name appears only at the Bench (A2 #6).
  moth: { ...base, id: 'moth', name: 'Moth', desc: 'Recovered frame. Ceramic plating, gold trim.', design: 'moth',
    ap: 9000, en: 1000, speed: 30, qbImpulse: 82, impMax: 1400, load: 60, power: 40, campaignOnly: true },
};

const FIELD = { by: 'salvage', hint: 'Recovered in the field' };

/** Parts catalogue (Appendix C.4, retuned and extended by addendum A3.2). Weapon behaviour lives in combat/weapons.js. */
export const PARTS = {
  // ── R: right arm ────────────────────────────────────────────────────────────────────────────────────────────────
  rifle_r30: { id: 'rifle_r30', slot: 'R', name: 'Lantern Carbine', desc: 'Balanced auto-rifle. Leads a locked target.',
    weapon: 'rifle', weight: 12, power: 8, visual: 'rifle', stock: true,
    stats: { dmg: 245, imp: 70, rate: 0.135, speed: 680, ammo: 600, spread: 0.008 }, unlock: { by: 'start' } },
  mg_r12: { id: 'mg_r12', slot: 'R', name: 'R-12 Machine Gun', desc: 'High rate of fire, light rounds, wide spread.',
    weapon: 'mg', weight: 10, power: 10, visual: 'mg',
    stats: { dmg: 120, imp: 32, rate: 0.07, speed: 640, ammo: 1200, spread: 0.02 }, unlock: { ...FIELD } },
  shotgun_s8: { id: 'shotgun_s8', slot: 'R', name: 'Sleet Gun', desc: 'Short-range spread gun. Staggers what it hits up close.',
    weapon: 'shotgun', weight: 14, power: 8, visual: 'shotgun',
    // A3.2 / L1 §13.4: 8 pellets × (140, 110), every 0.85 s, 520 m/s, 96 shells, 4.5° cone;
    // full damage to 40 m, linear to 25 % at 80 m, nothing past 90 m.
    stats: { pellets: 8, dmg: 140, imp: 110, rate: 0.85, speed: 520, ammo: 96, cone: 4.5, full: 40, quarter: 80, max: 90 },
    haul: { give: 1, hunger: 0, source: 'L1:skiff_sleet' }, unlock: { ...FIELD } },
  cannon_hc90: { id: 'cannon_hc90', slot: 'R', name: 'HC-90 Cannon', desc: 'Heavy shell with splash. Slow to cycle.',
    weapon: 'cannon', weight: 28, power: 14, visual: 'cannon',
    stats: { dmg: 1400, imp: 900, splash: 8, splashDmg: 600, rate: 1.6, speed: 300, ammo: 40 }, unlock: { ...FIELD } },

  // ── L: left arm ─────────────────────────────────────────────────────────────────────────────────────────────────
  blade_pb2: { id: 'blade_pb2', slot: 'L', name: 'Psalter Blade', desc: 'Pulse-blade lunge to the locked target.',
    weapon: 'blade', weight: 8, power: 12, visual: 'blade', stock: true,
    stats: { dmg: 2300, imp: 700, cd: 2.6, lunge: 75, lungeSpeed: 110 }, unlock: { by: 'start' } },
  blade_hx: { id: 'blade_hx', slot: 'L', name: 'HX Heavy Blade', desc: 'Slower, shorter lunge. Hits much harder.',
    weapon: 'blade', weight: 14, power: 16, visual: 'blade_heavy',
    stats: { dmg: 3400, imp: 1200, cd: 4.0, lunge: 55, lungeSpeed: 95 }, unlock: { ...FIELD } },
  harpoon_gaff: { id: 'harpoon_gaff', slot: 'L', name: 'Gaff Harpoon', desc: 'Grapple. Reels light targets in; pulls you to heavy ones.',
    weapon: 'harpoon', weight: 10, power: 10, visual: 'harpoon',
    stats: { range: 80, cd: 3.0, speed: 220, dmg: 300, imp: 2000, reelTo: 12, reelTime: 0.6, pullSpeed: 70, pullStop: 6, lightImpMax: 1000 },
    haul: { give: 1, hunger: 0, source: 'L1:skiff_gaffer' }, unlock: { ...FIELD } },

  // ── S: shoulder ─────────────────────────────────────────────────────────────────────────────────────────────────
  msl_vm4: { id: 'msl_vm4', slot: 'S', name: 'Chorus Rack', desc: 'Four-lock homing missile volley.',
    weapon: 'missiles', weight: 14, power: 10, visual: 'pod4', stock: true,
    stats: { count: 4, dmg: 620, imp: 260, cd: 7, ammo: 80, turn: 2.6, accel: 110, maxSpeed: 175 }, unlock: { by: 'start' } },
  msl_sw8: { id: 'msl_sw8', slot: 'S', name: 'SW-8 Micro-missiles', desc: 'Eight light homing missiles per volley.',
    weapon: 'micromissiles', weight: 16, power: 12, visual: 'pod8',
    stats: { count: 8, dmg: 260, imp: 120, cd: 9, ammo: 160, turn: 3.2, accel: 130, maxSpeed: 190 }, unlock: { ...FIELD } },
  mortar_m3: { id: 'mortar_m3', slot: 'S', name: 'M-3 Mortar', desc: 'Three arcing shells with a wide splash.',
    weapon: 'mortar', weight: 18, power: 8, visual: 'mortar',
    stats: { count: 3, dmg: 900, imp: 500, splash: 10, cd: 6, ammo: 36, gravity: 45 }, unlock: { ...FIELD } },
  flare_pod: { id: 'flare_pod', slot: 'S', name: 'Flare Pod', desc: 'Decoy flares. Pull missiles away, light the ice, blind what they stick to.',
    weapon: 'flares', weight: 12, power: 8, visual: 'flarepod',
    stats: { count: 6, cd: 2, range: 60, decoyR: 30, lightR: 40, lightT: 30, blind: 4 },
    haul: { give: 1, hunger: 0, source: 'L1:gleaner_carrier' }, unlock: { ...FIELD } },

  // ── U: utility ──────────────────────────────────────────────────────────────────────────────────────────────────
  kit_rk3: { id: 'kit_rk3', slot: 'U', name: 'Repair kits', desc: 'Three field repairs.',
    weapon: 'kit', weight: 4, power: 0, visual: 'kit', stock: true,
    stats: { kits: 3, heal: 3600, duration: 1.2, ammo: 3 }, unlock: { by: 'start' } },
  kit_rk2f: { id: 'kit_rk2f', slot: 'U', name: 'RK-2F Fast Kit', desc: 'Two fast repairs.',
    weapon: 'kit', weight: 3, power: 0, visual: 'kit',
    stats: { kits: 2, heal: 7200, duration: 0.6, ammo: 2 }, unlock: { ...FIELD } },
};

export const PAINT_PRESETS = [
  { id: 'field', name: 'Field grey', base: '#5a5f67', mid: '#3b3f45', accent: '#d0842f', visor: '#7fe9ff', flame: '#ff9a3c', blade: '#8fe9ff' },
  { id: 'rust', name: 'Rust', base: '#6b4a3a', mid: '#3e302a', accent: '#c9a24a', visor: '#ffb36b', flame: '#ff9a3c', blade: '#ffcf8f' },
  { id: 'frost', name: 'Frost', base: '#9aa3a8', mid: '#5d666c', accent: '#3f7f9a', visor: '#5fe3ff', flame: '#9fd8ff', blade: '#bff3ff' },
  { id: 'night', name: 'Night', base: '#2c2f35', mid: '#1d1f24', accent: '#b8432f', visor: '#ff6a4a', flame: '#ff7a4a', blade: '#ff9a7a' },
];

/** A3.2 / AD §4.3: Founders ceramic, gold trim, cyan visor. Not in PAINT_PRESETS (the free garage never offers it). */
export const MOTH_PAINT = Object.freeze({ id: 'founders', name: 'Founders', base: '#d8d2c4', mid: '#aaa494', accent: '#c99a3e',
                                          visor: '#5fe3ff', flame: '#a8ecff', blade: '#8fe9ff' });

/** A3.2: the campaign frame's stock parts. */
export const CAMPAIGN_STOCK = Object.freeze({ R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' });

export const DEFAULT_LOADOUT = Object.freeze({
  frame: 'vanguard', R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3',
  paint: Object.freeze({ ...PAINT_PRESETS[0] }),
});

/** Part ids unlocked on a new save: exactly the DEFAULT_LOADOUT parts. */
export function startingUnlocks() { return ['rifle_r30', 'blade_pb2', 'msl_vm4', 'kit_rk3']; }

/**
 * A3.2: the campaign loadout. { frame: 'moth', ...CAMPAIGN_STOCK, ...fitted, paint: MOTH_PAINT }.
 * Ignores ids that aren't in PARTS or don't fit their slot (and the utility slot, which is fixed in V1).
 */
export function campaignLoadout(fitted) {
  const lo = { frame: 'moth', ...CAMPAIGN_STOCK, paint: { ...MOTH_PAINT } };
  if (fitted && typeof fitted === 'object') {
    for (const s of ['R', 'L', 'S']) {
      const id = fitted[s];
      if (typeof id === 'string' && PARTS[id] && PARTS[id].slot === s) lo[s] = id;
    }
  }
  return lo;
}

/** extra: true for a hauled part (A3.2 `haul` block). ctx.haul.isHaulPart uses it. */
export function isHaulPart(id) { return !!PARTS[id]?.haul; }

export function computeStats(lo) {
  const f = FRAMES[lo?.frame] || FRAMES.vanguard;
  let weight = 0, powerDraw = 0;
  for (const s of SLOTS) { const p = PARTS[lo?.[s]]; if (p) { weight += p.weight; powerDraw += p.power; } }
  const overweight = weight > f.load, overpower = powerDraw > f.power;
  // §8.5: 1 % speed per point over the load (floor 50 %); quick-boost cost rises by the same factor
  const speedMul = overweight ? Math.max(0.5, 1 - 0.01 * (weight - f.load)) : 1;
  const warnings = [];
  if (overweight) warnings.push(`Overweight by ${weight - f.load}: speed −${Math.round((1 - speedMul) * 100)}%`);
  if (overpower) warnings.push(`Power draw ${powerDraw} exceeds frame power ${f.power}`);
  return { ...f, weight, powerDraw, overweight, overpower, speedMul, qbCost: f.qbCost / speedMul, warnings };
}

export function validate(lo, unlocked) {
  const errors = [];
  if (!lo || !FRAMES[lo.frame]) errors.push(`Unknown frame "${lo?.frame}"`);
  for (const s of SLOTS) {
    const id = lo?.[s], p = PARTS[id];
    if (!p) { errors.push(`Slot ${s}: unknown part "${id}"`); continue; }
    if (p.slot !== s) errors.push(`Slot ${s}: ${p.name} fits slot ${p.slot}`);
    if (unlocked && !unlocked.has(id)) errors.push(`${p.name} is locked`);
  }
  if (!errors.length) {
    const st = computeStats(lo);
    if (st.overpower) errors.push(`Power draw ${st.powerDraw} exceeds ${st.name} power ${st.power}`);
  }
  return { ok: errors.length === 0, errors };
}
