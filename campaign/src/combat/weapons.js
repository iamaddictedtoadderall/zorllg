// combat/weapons.js (P4) — P0 STUB: weapons with ammo, cooldown and readout(); trigger() does nothing.

export function createWeapon(ctx, part, owner) {
  const st = part.stats || {};
  const ammoMax = st.ammo ?? st.kits ?? 0;
  const w = {
    part, slot: part.slot, owner,
    ammo: ammoMax, ammoMax, cd: 0,
    update(dt) { if (w.cd > 0) w.cd = Math.max(0, w.cd - dt); },
    trigger(inp, aim) { /* stub: P4 implements every weapon type */ },
    readout() {
      const cooling = w.cd > 0, empty = w.ammoMax > 0 && w.ammo <= 0;
      let label;
      switch (part.weapon) {
        case 'blade': label = cooling ? w.cd.toFixed(1) : 'READY'; break;
        case 'missiles': case 'micromissiles': case 'mortar': label = cooling ? w.cd.toFixed(1) : `READY · ${w.ammo}`; break;
        default: label = String(w.ammo);
      }
      return { label, cooling, empty };
    },
    refill() { w.ammo = w.ammoMax; w.cd = 0; },
  };
  return w;
}
