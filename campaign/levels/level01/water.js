// levels/level01/water.js (P6) — water, sinking and surfacing (L1 §12.6), as a `physics`-phase system that runs after
// the player (A5.6 maps it onto gravityScale, enRegenScale and abilities.boost = false underwater).
//
//  · In water: no support above the sea (the seabed is the support) and pos.y below sea − 1. Vertical speed clamped to
//    [−4, +6] m/s, gravity ×0.25, horizontal ×0.4 (abilities.move), EN regen 0, quick boost off (bubbles only), the
//    player's own jump/hover off. Holding JUMP rises at 6 m/s for 150 EN/s (× hoverCostScale: icing doubles it).
//  · Surfacing: rising within 2 m of the sea at a gap between floes → a breach: vy 22 m/s toward the nearest floe,
//    splash and spray; flag `surfaced`.
//  · Sinking: below y −30 for more than 8 s, or EN empty below −35 → mission.fail('Lost under the ice.').
//    Not while the drowning (drown.js) owns the player: `scripted`.
//  · Camera underwater: below the sea the art blends to the underwater preset over 0.4 s (after storing the fields it
//    changes) and back on surfacing.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** the fields of `like` read from `art` (to restore exactly what an underwater blend changes) */
function pick(art, like) {
  const out = {};
  for (const [k, v] of Object.entries(like || {})) {
    if (!art || !(k in art)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) { const sub = pick(art[k], v); if (Object.keys(sub).length) out[k] = sub; }
    else out[k] = Array.isArray(art[k]) ? art[k].slice() : art[k];
  }
  return out;
}

/** a few rising bubbles (additive particles; cosmetic) */
export function bubbles(ctx, pos, n = 4, spread = 2) {
  const A = ctx.particles?.add; if (!A?.spawn) return;
  for (let i = 0; i < n; i++) {
    A.spawn(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * spread, pos.z + (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6,
            1.2 + Math.random(), 0.12 + Math.random() * 0.12, 0.05, 0.55, 0.85, 0.8, 0.8, 0.4, -2.5, 1);
  }
}
/** a splash at the waterline */
export function splash(ctx, pos, k = 1) {
  _v.set(pos.x, ctx.l01?.DATA?.sea ?? -24, pos.z);
  ctx.fx?.dust?.(_v, Math.round(24 * k), 6 * k, [0.85, 0.95, 1]);
  ctx.fx?.sparks?.(_v, Math.round(10 * k), [0.85, 0.95, 1], 14);
  ctx.fx?.shockwave?.(_v, 10 * k, '#cfefff', 0.5);
  ctx.audio?.play?.('splash', _v);
}

export class Water {
  constructor(L, o = {}) {
    this.L = L;
    this.underArt = o.underArt || null;   // the underwater art preset (L1 §15.3)
    this.reset();
  }
  get sea() { return this.L.DATA.sea; }
  reset() {
    if (this.state === 'water') this.leave(true);
    this.state = 'air';          // 'air' | 'water'
    this.deepT = 0;              // seconds below −30
    this.scripted = false;       // the drowning owns the player
    this.bubbleT = 0;
    if (this.camUnder) this.cameraOut(true);
    this.camUnder = false; this.saved = null; this.lastSaved = null; this.lastOut = null;
    this.saveAb = null;
  }
  /** is this world point in open water (no floe or structure under it above the sea)? */
  inWater(pos) {
    const C = this.L.ctx.collision;
    const sup = C ? C.supportHeight(pos.x, pos.z, this.sea + 4) : this.L.groundAt(pos.x, pos.z);
    return sup < this.sea - 1;
  }
  enter() {
    const p = this.L.ctx.player;
    this.state = 'water'; this.deepT = 0;
    this.saveAb = { jump: p.abilities?.jump, hover: p.abilities?.hover, boost: p.abilities?.boost, move: p.abilities?.move };
    this.apply();
    if (p.vel.y < -4) { splash(this.L.ctx, p.pos, Math.min(2, -p.vel.y / 20)); p.vel.y = -4; }
    this.L.ctx.events.emit('l01:water', { in: true });
  }
  /** (re)applies the underwater physics on the player */
  apply() {
    const p = this.L.ctx.player;
    p.gravityScale = 0.25; p.enRegenScale = 0;
    const base = this.saveAb?.move ?? 1;
    p.abilities = { ...(p.abilities || {}), jump: false, hover: false, boost: false, move: (typeof base === 'number' ? base : 1) * 0.4 };
  }
  leave(quiet) {
    const p = this.L.ctx.player;
    this.state = 'air'; this.deepT = 0;
    if (p) {
      p.gravityScale = 1; p.enRegenScale = 1;
      if (this.saveAb && p.abilities) {
        const a = { ...p.abilities };
        for (const k of ['jump', 'hover', 'boost', 'move']) if (this.saveAb[k] !== undefined) a[k] = this.saveAb[k];
        p.abilities = a;
      }
    }
    this.saveAb = null;
    if (!quiet) this.L.ctx.events.emit('l01:water', { in: false });
  }
  /** a level script changed the abilities while underwater (the drown action's control return): keep them as the base */
  rebase() {
    if (this.state !== 'water') return;
    const p = this.L.ctx.player;
    this.saveAb = { jump: p.abilities?.jump, hover: p.abilities?.hover, boost: p.abilities?.boost, move: p.abilities?.move };
    this.apply();
  }
  breach() {
    const ctx = this.L.ctx, p = ctx.player;
    this.leave();
    p.vel.y = 22;
    // toward the nearest floe, to land on it about a second later
    const F = this.L.floes;
    const i = F?.nearestFloe?.(p.pos.x, p.pos.z);
    if (i != null && i >= 0) {
      const f = F.field.floes[i];
      const dx = f.x - p.pos.x, dz = f.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
      const want = Math.min(26, Math.max(0, d - f.rin * 0.5));
      p.vel.x = dx / d * want; p.vel.z = dz / d * want;
    }
    splash(ctx, p.pos, 2.2);
    ctx.fx?.emitter && ctx.fx.dust?.(_w.set(p.pos.x, this.sea + 1, p.pos.z), 20, 4, [1, 1, 1]);
    ctx.cameraRig?.addShake?.(0.4);
    this.L.setFlag('surfaced', true);
    ctx.events.emit('l01:breach', {});
  }
  /** physics phase, after the player */
  update(dt) {
    const ctx = this.L.ctx, p = ctx.player;
    this.updateCamera();
    if (!p?.active || !p.alive || dt <= 0) return;
    const sea = this.sea;
    const sup = ctx.collision ? ctx.collision.supportHeight(p.pos.x, p.pos.z, p.pos.y + 0.5) : this.L.groundAt(p.pos.x, p.pos.z);
    const open = sup < sea - 1;
    if (this.state === 'air') {
      if (open && p.pos.y < sea - 1) this.enter();
      else return;
    }
    // in water
    if (!open && p.pos.y >= sup - 0.5) { this.leave(); return; }        // pushed out onto a floe or the shelf
    if (this.scripted) { this.bubbleT -= dt; if (this.bubbleT <= 0) { this.bubbleT = 0.15; bubbles(ctx, _v.set(p.pos.x, p.pos.y + 6, p.pos.z), 3); } return; }
    // swim: rise on JUMP (EN), clamp vertical speed
    const up = ctx.input?.down?.('jump') && !p.frozen;
    if (up && p.en > 0) {
      p.vel.y = 6;
      p.en = Math.max(0, p.en - 150 * (p.hoverCostScale ?? 1) * dt);
      p.enUseT = Math.max(p.enUseT || 0, 0.3);
    }
    p.vel.y = Math.min(6, Math.max(-4, p.vel.y));
    if (ctx.input?.pressed?.('boost')) bubbles(ctx, _v.set(p.pos.x, p.pos.y + 4, p.pos.z), 14, 4);
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) { this.bubbleT = up ? 0.08 : 0.3; bubbles(ctx, _v.set(p.pos.x, p.pos.y + 6, p.pos.z), up ? 4 : 2); }
    // surfacing: a gap above (no floe over this point), within 2 m of the sea, rising
    if (p.pos.y > sea - 2 && p.vel.y > 0) {
      const over = ctx.collision ? ctx.collision.supportHeight(p.pos.x, p.pos.z, sea + 4) : -Infinity;
      if (over < sea - 1) { this.breach(); return; }
    }
    // sinking
    if (p.pos.y < -30) this.deepT += dt; else this.deepT = 0;
    if (this.deepT > 8 || (p.pos.y < -35 && p.en <= 0.5)) {
      this.deepT = 0;
      // god mode (debug, ?god=1, tests) covers this death too: the frame simply keeps swimming
      if (!ctx.combat?.god) ctx.mission?.fail?.('Lost under the ice.');
    }
  }
  /** camera below the sea: the underwater art (L1 §12.6, §15.3) */
  updateCamera() {
    const ctx = this.L.ctx, A = ctx.atmosphere;
    if (!A || !this.underArt) return;
    const under = ctx.camera.position.y < this.sea - 0.2 && this.cameraOverWater();
    if (under && !this.camUnder) {
      this.camUnder = true;
      // dipping back under while the last surfacing's blend is still running would snapshot a half-underwater art
      // (and restore THAT on the next surfacing): reuse the last good snapshot instead
      const t = ctx.clock?.time ?? 0;
      this.saved = this.lastSaved && t - (this.lastOut ?? -99) < 1.5 ? this.lastSaved : pick(A.art, this.underArt);
      A.set(this.underArt, 0.4);
      ctx.audio?.duck?.(0.45, 0.6);
    } else if (!under && this.camUnder) this.cameraOut(false);
    else if (under && this.camUnder) ctx.audio?.duck?.(0.45, 0.6);
  }
  cameraOut(instant) {
    this.camUnder = false;
    // after the sunrise the art above the water is the dawn (plus the zone's own changes), whatever was mid-blend when
    // the camera went under (the drowning starts while the sunrise blend is still running)
    const dawn = this.dawnTarget();
    const to = dawn ? pick(dawn, this.underArt) : this.saved;
    if (to) this.L.ctx.atmosphere?.set?.(to, instant ? 0 : 0.4);
    this.lastSaved = this.saved; this.lastOut = this.L.ctx.clock?.time ?? 0;
    this.saved = null;
  }
  /** the intended above-water art after the sunrise: ART_DAWN with the floes' or the shore's changes, else null */
  dawnTarget() {
    const L = this.L, A = L.art || {};
    if (!L.dawnArt || !A.ART_DAWN) return null;
    const t = JSON.parse(JSON.stringify(A.ART_DAWN));
    const p = L.ctx.player, s = p?.active ? L.routeS(p.pos) : 0;
    const extra = s >= 3130 ? A.ART_SHORE : s >= 2460 ? A.ART_FLOES : null;
    const merge = (a, b) => { for (const [k, v] of Object.entries(b || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) merge(a[k] ??= {}, v); else a[k] = v; } };
    if (extra) merge(t, extra);
    return t;
  }
  /** the camera is over the sea region (not inside a terrain cave below the sea line) */
  cameraOverWater() {
    const c = this.L.ctx.camera.position, B = this.L.DATA.seaBounds;
    return c.x > B.x0 && c.x < B.x1 && c.z > B.z0 && c.z < B.z1 && this.L.groundAt(c.x, c.z) < this.sea - 1;
  }
  /** the drowning ramps the underwater fog (A1.2's waterline fallback); keeps the stored art for the surfacing */
  setUnderFog(density, seconds) {
    if (!this.camUnder) return;
    this.L.ctx.atmosphere?.set?.({ fog: { density } }, seconds);
  }
}
