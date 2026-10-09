// actors/mechai.js (P4) — P0 STUB: registers the 'mech' kind with a placeholder factory (buildMech, idle animation, no AI).
import { Unit } from './enemy.js';
import { buildMech, animateMech } from '../art/mechs.js';

const DEFAULT_SCHEME = { design: 'striker', base: '#8f8a80', mid: '#6c6a64', accent: '#3f5a58', visor: '#ff3b2a', flame: '#ff6a4a', blade: '#ff4a3a' };

class PlaceholderMech extends Unit {
  update(dt) {
    this.baseUpdate(dt);
    animateMech(this.rig, { fwd: 0, lat: 0, onGround: true, pitch: 0, thrust: 0, hover: 0, landT: 0 }, dt);
  }
}

export function install(ctx) {
  ctx.enemies.register('mech', (c, pos, o = {}) => {
    const cfg = o.config || {};
    let scheme = cfg.scheme;
    if (!scheme) {
      const f = cfg.faction || o.faction;
      const fp = f && (c.mission?.def?.factions || c.world?.def?.factions)?.[f];
      scheme = { ...DEFAULT_SCHEME, design: cfg.design || DEFAULT_SCHEME.design,
                 ...(fp ? { base: fp.shell, mid: fp.mid || fp.shell, accent: fp.accent, visor: fp.eye } : {}) };
    }
    const rig = buildMech(c, scheme);
    const u = new PlaceholderMech(c, { kind: 'mech', name: o.name || 'FRAME', pos, apMax: cfg.ap ?? 9000, impMax: cfg.impMax ?? 2600,
                                        stagDur: 2.6, rig, hitR: 4.2, hitY: 5.5, rad: 2.6, hgt: 9.5, onGround: true });
    u.root.add(rig.root);
    return u;
  });
}
