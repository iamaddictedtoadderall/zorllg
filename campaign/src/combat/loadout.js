// combat/loadout.js (P4) — P0 STUB: frames (§8.5), the 4 starting parts (Appendix C.4), stats and validation.
// Pure data and functions; imported by core/save.js, ui/garage.js and actors/player.js.

export const SLOTS = ['R', 'L', 'S', 'U'];

const base = {
  enRegen: 720, enRegenAir: 480, qbCost: 170, hoverAccel: 70, hoverCost: 150, jump: 17,
  rad: 2.6, hgt: 9.5, hitR: 3.6,
};
/** Frame stats (§8.5). `design` is the art/mechs.js DESIGNS key. */
export const FRAMES = {
  vanguard: { ...base, id: 'vanguard', name: 'Vanguard', desc: 'Balanced frame. Angular plating, V-fin sensor head.', design: 'vanguard',
    ap: 9000, en: 1000, speed: 30, qbImpulse: 82, impMax: 1400, load: 60, power: 40 },
  striker: { ...base, id: 'striker', name: 'Striker', desc: 'Light frame. Knife-edged armour, swept back wings.', design: 'striker',
    ap: 7000, en: 1150, speed: 34, qbImpulse: 92, impMax: 1200, load: 45, power: 38, rad: 2.4, hitR: 3.3 },
  bastion: { ...base, id: 'bastion', name: 'Bastion', desc: 'Heavy frame. Rounded armour, wide shoulders, shield arm.', design: 'bastion',
    ap: 12000, en: 900, speed: 26, qbImpulse: 74, impMax: 1900, load: 80, power: 44, rad: 2.9, hitR: 3.9 },
};

/** Parts catalogue. P0 seeds only the four starting parts; P4 adds the rest of Appendix C.4 (ids are frozen). */
export const PARTS = {
  rifle_r30: { id: 'rifle_r30', slot: 'R', name: 'R-30 Rifle', desc: 'Reliable automatic rifle.', weapon: 'rifle',
    weight: 12, power: 8, visual: 'rifle',
    stats: { dmg: 245, imp: 70, rate: 0.135, speed: 680, ammo: 600, spread: 0.008 }, unlock: { by: 'start' } },
  blade_pb2: { id: 'blade_pb2', slot: 'L', name: 'PB-2 Pulse Blade', desc: 'Lunging energy blade.', weapon: 'blade',
    weight: 8, power: 12, visual: 'blade',
    stats: { dmg: 2300, imp: 700, cd: 2.6, lunge: 75, lungeSpeed: 110 }, unlock: { by: 'start' } },
  msl_vm4: { id: 'msl_vm4', slot: 'S', name: 'VM-4 Missiles', desc: 'Four homing missiles per salvo.', weapon: 'missiles',
    weight: 14, power: 10, visual: 'pod4',
    stats: { count: 4, dmg: 620, imp: 260, cd: 7, ammo: 80, turn: 2.6, accel: 110, maxSpeed: 175 }, unlock: { by: 'start' } },
  kit_rk3: { id: 'kit_rk3', slot: 'U', name: 'RK-3 Repair Kit', desc: 'Three field repairs.', weapon: 'kit',
    weight: 4, power: 0, visual: 'kit',
    stats: { kits: 3, heal: 3600, duration: 1.2, ammo: 3 }, unlock: { by: 'start' } },
};

export const PAINT_PRESETS = [
  { id: 'field', name: 'Field grey', base: '#5a5f67', mid: '#3b3f45', accent: '#d0842f', visor: '#7fe9ff', flame: '#ff9a3c', blade: '#8fe9ff' },
  { id: 'rust', name: 'Rust', base: '#6b4a3a', mid: '#3e302a', accent: '#c9a24a', visor: '#ffb36b', flame: '#ff9a3c', blade: '#ffcf8f' },
  { id: 'frost', name: 'Frost', base: '#9aa3a8', mid: '#5d666c', accent: '#3f7f9a', visor: '#5fe3ff', flame: '#9fd8ff', blade: '#bff3ff' },
  { id: 'night', name: 'Night', base: '#2c2f35', mid: '#1d1f24', accent: '#b8432f', visor: '#ff6a4a', flame: '#ff7a4a', blade: '#ff9a7a' },
];

export const DEFAULT_LOADOUT = Object.freeze({
  frame: 'vanguard', R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3',
  paint: Object.freeze({ ...PAINT_PRESETS[0] }),
});

/** Part ids unlocked on a new save: exactly the DEFAULT_LOADOUT parts. */
export function startingUnlocks() { return ['rifle_r30', 'blade_pb2', 'msl_vm4', 'kit_rk3']; }

export function computeStats(lo) {
  const f = FRAMES[lo?.frame] || FRAMES.vanguard;
  let weight = 0, powerDraw = 0;
  for (const s of SLOTS) { const p = PARTS[lo?.[s]]; if (p) { weight += p.weight; powerDraw += p.power; } }
  const overweight = weight > f.load, overpower = powerDraw > f.power;
  const speedMul = overweight ? Math.max(0.5, 1 - 0.01 * (weight - f.load)) : 1;
  const warnings = [];
  if (overweight) warnings.push(`Overweight by ${weight - f.load}: speed −${Math.round((1 - speedMul) * 100)}%`);
  if (overpower) warnings.push(`Power draw ${powerDraw} exceeds frame power ${f.power}`);
  return { ...f, weight, powerDraw, overweight, overpower, speedMul,
           qbCost: f.qbCost / speedMul, warnings };
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
