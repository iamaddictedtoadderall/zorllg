// actors/enemytypes.js (P4) — P0 STUB: registers every non-mech kind with a placeholder factory (model from art/units.js,
// base stats from Appendix C.5, no AI). Flying kinds hover at a fixed height above the spawn point.
import { Unit } from './enemy.js';
import { buildUnit, animateUnit } from '../art/units.js';

// kind → [AP, impMax, name, hover height]
const KINDS = {
  drone: [820, 500, 'DRONE', 16],
  tank: [3000, 1000, 'TANK', 0],
  tank_heavy: [7200, 2200, 'HEAVY TANK', 0],
  turret: [2000, 800, 'TURRET', 0],
  gunship: [2600, 700, 'GUNSHIP', 32],
  walker: [9000, 2600, 'WALKER', 0],
  artillery: [2400, 900, 'ARTILLERY', 0],
  apc: [2800, 1000, 'APC', 0],
  beacon: [3200, Infinity, 'BEACON', 0],
  dropship: [6000, Infinity, 'DROPSHIP', 60],
};

class PlaceholderUnit extends Unit {
  update(dt) {
    this.baseUpdate(dt);
    if (this.rig) animateUnit(this.rig, dt, {});
  }
}

export function install(ctx) {
  for (const [kind, [ap, impMax, name, hover]] of Object.entries(KINDS)) {
    ctx.enemies.register(kind, (c, pos, o = {}) => {
      const rig = buildUnit(c, kind, o.faction || 'hostile');
      if (hover) pos.y += hover;
      const u = new PlaceholderUnit(c, { kind, name, pos, apMax: ap, impMax, rig, rad: rig.rad, hgt: rig.hgt,
                                          hitR: rig.hit.r, hitY: rig.hit.center[1], targetable: kind !== 'dropship',
                                          faction: o.faction || 'hostile', onGround: !hover });
      u.root.add(rig.root);
      return u;
    });
  }
}
