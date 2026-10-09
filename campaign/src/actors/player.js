// actors/player.js (P4): the player mech. A port of the prototype's player state, resetPlayer, updatePlayer, updateLock,
// the aim march and killPlayer, with weapons moved to combat/weapons.js and globals moved to ctx services.
//
// Prototype feel (§1.3): ground speed 30 (frame stats), quick boost 82 m/s for 170 EN, hover 70 m/s² for 150 EN/s,
// jump 17 m/s, gravity 45, terminal fall −75, EN regen 720 ground / 480 air after 0.55 s without use, 2.4 s overheat at
// 0 EN, stagger 1 s, impact decay after 2 s, lock cone 0.2 + 20/d rad (×1.4 on touch) within 420 m, aim march 6 m steps.
//
// Addendum A5.1 fields: abilities, hoverCostScale, enRegenScale, gravityScale, hidden, idleFacing (+ idleFacingReached),
// animOverride, autopilot (emits 'player:autopilotDone'). Extras: lunge / pull / rip states (blade, harpoon, TEAR),
// repairT, slowMo(), idleT, aimHit, aimDir. Event extra: 'player:boost' on every quick boost.
import * as THREE from 'three';
import { clamp, damp, dampAng, angWrap, yawTo, aimDir } from '../core/util.js';
import { ACT, LOOK_RAD_PER_PX } from '../core/input.js';
import { buildMech, animateMech, DESIGNS } from '../art/mechs.js';
import { computeStats, PARTS, SLOTS, DEFAULT_LOADOUT } from '../combat/loadout.js';
import { createWeapon } from '../combat/weapons.js';
import { isHostile } from '../combat/combat.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3();
const _c = new THREE.Vector3(), _q = new THREE.Vector3(), _mz = new THREE.Vector3();
const IDLE = { down: false, pressed: false };
const IN = { R: { down: false, pressed: false }, L: { down: false, pressed: false }, S: { down: false, pressed: false }, U: { down: false, pressed: false } };
const SLOT_ACT = { R: ACT.FIRE, L: ACT.BLADE, S: ACT.MISSILE, U: ACT.KIT };
const SLOT_AB = { R: 'fire', L: 'blade', S: 'missile', U: 'kit' };
const ANIM_KEYS = ['fwd', 'lat', 'onGround', 'pitch', 'aimYaw', 'thrust', 'hover', 'landT', 'bladeT', 'bladeWind', 'recoil', 'crouch', 'tear'];
const IDLE_DELAY = 5, IDLE_TURN = 0.35;

export const DEFAULT_ABILITIES = Object.freeze({ move: 1, jump: true, hover: true, boost: true, fire: true, lock: true, blade: true,
                                                 missile: true, kit: true, interact: true, tear: true });

/** turn `a` toward `b` by at most `step` radians */
function turnToward(a, b, step) {
  const d = angWrap(b - a);
  return Math.abs(d) <= step ? b : angWrap(a + Math.sign(d) * step);
}

export function install(ctx) {
  let hidden = false, lastLock = null, idleReached = false;
  const ST = {};            // reused MechAnimState
  let overrideExtras = [];
  const aim = { origin: new THREE.Vector3(), point: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), lock: null, hit: false };

  const p = {
    // ── Target ──
    id: undefined, name: 'PLAYER', kind: 'player', team: 'player', tags: new Set(['player']),
    alive: false, targetable: true, objective: false, boss: false,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    ap: 9000, apMax: 9000, imp: 0, impMax: 1400, stagT: 0, stagDur: 1.0, lastHit: -9, invuln: false, hitR: 3.6,
    center(out = new THREE.Vector3()) { return out.set(p.pos.x, p.pos.y + 5.5, p.pos.z); },
    hitTest(q) { p.center(_t); return _t.distanceToSquared(q) < p.hitR * p.hitR; },
    onDamage(info) {
      if (info.blocked) return;
      if (info.amount > 0) {
        ctx.hud?.hurt?.(clamp(info.amount / 1500, 0.25, 1));
        ctx.audio?.play?.('hurt', null);
        ctx.cameraRig?.addShake?.(clamp(info.amount / 900, 0.2, 1.4));
      }
      if (info.staggered) { ctx.audio?.play?.('stagger', null); ctx.hud?.warn?.('STAGGERED', 1); }
    },
    onDeath() {
      p.alive = false;
      p.lunge = null; p.pull = null; p.rip = null; endSlow();
      const c = p.center(new THREE.Vector3());
      ctx.fx?.explosion?.(c, 2.4);
      ctx.particles?.debris?.spawn?.(c, 12, 1.3, p.rig?.mats?.base);
      if (p.rig) p.rig.root.visible = false;
      ctx.events.emit('player:died', {});
    },

    // ── Player (§4.4) ──
    active: false,
    rig: null,
    loadout: null, stats: null, weapons: {},
    yaw: 0, pitch: -0.05, bodyYaw: 0,
    en: 1000, enMax: 1000, overheat: 0,
    onGround: true, thrust: 0, hover: 0, rad: 2.6, hgt: 9.5,
    lock: null, hardLock: false,
    aimPoint: new THREE.Vector3(),
    frozen: false,

    // ── addendum A5.1 ──
    abilities: { ...DEFAULT_ABILITIES },
    hoverCostScale: 1, enRegenScale: 1, gravityScale: 1,
    get hidden() { return hidden; },
    set hidden(v) { hidden = !!v; if (p.rig) p.rig.root.visible = p.active && p.alive && !hidden; },
    idleFacing: null,
    get idleFacingReached() { return idleReached; },
    animOverride: null,
    autopilot: null,

    // ── extras ──
    landT: 0, qbT: 0, enUseT: 0, recoil: 0, bladeT: 0, repairT: 0, repairRate: 3600,
    lunge: null, pull: null, rip: null, slowT: 0, idleT: 0,
    aimHit: false, aimDir: aim.dir, aimOrigin: aim.origin,

    setLoadout(lo) {
      p.loadout = JSON.parse(JSON.stringify(lo || DEFAULT_LOADOUT));
      p.stats = computeStats(p.loadout);
      const s = p.stats;
      p.apMax = s.ap; p.enMax = s.en; p.impMax = s.impMax; p.rad = s.rad; p.hgt = s.hgt; p.hitR = s.hitR;
      if (!p.active) { p.ap = p.apMax; p.en = p.enMax; } else { p.ap = Math.min(p.ap, p.apMax); p.en = Math.min(p.en, p.enMax); }
      for (const w of Object.values(p.weapons || {})) w?.dispose?.();
      p.lunge = null; p.pull = null;
      p.weapons = {};
      for (const slot of SLOTS) { const part = PARTS[p.loadout[slot]]; if (part) p.weapons[slot] = createWeapon(ctx, part, p); }
      if (p.rig) p.rig.dispose();
      const paint = p.loadout.paint || {};
      const design = DESIGNS[s.design] ? s.design : 'vanguard';
      p.rig = buildMech(ctx, { design, base: paint.base, mid: paint.mid, accent: paint.accent, visor: paint.visor,
                               flame: paint.flame, blade: paint.blade },
                       { parts: { R: p.loadout.R, L: p.loadout.L, S: p.loadout.S, U: p.loadout.U } });
      p.rig.root.visible = p.active && p.alive && !hidden;
      p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw;
      ctx.scene.add(p.rig.root);
    },
    spawn(pos, yaw = 0, snap) {
      if (!p.rig) p.setLoadout(ctx.save?.getLoadout?.() || DEFAULT_LOADOUT);
      endSlow();
      Object.assign(p, { alive: true, active: true, imp: 0, stagT: 0, lastHit: -9, overheat: 0, landT: 0, qbT: 0, enUseT: 0,
                         thrust: 0, hover: 0, lock: null, hardLock: false, frozen: false, onGround: true, recoil: 0, bladeT: 0,
                         repairT: 0, lunge: null, pull: null, rip: null, idleT: 0, autopilot: null });
      lastLock = null; idleReached = false;
      p.ap = snap?.ap ?? p.apMax; p.en = p.enMax;
      for (const slot of SLOTS) { const w = p.weapons[slot]; if (!w) continue; w.refill(); if (snap?.ammo?.[slot] != null) w.ammo = snap.ammo[slot]; }
      p.yaw = p.bodyYaw = yaw; p.pitch = -0.05;
      p.vel.set(0, 0, 0);
      p.pos.copy(pos);
      if (!Number.isFinite(p.pos.y)) p.pos.y = ground(p.pos.x, p.pos.z, 1e5);
      p.rig.root.visible = !hidden;
      p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw;
      ctx.combat?.register(p);
      ctx.cameraRig?.follow(p);
      ctx.events.emit('player:spawned', {});
    },
    despawn() {
      p.active = false; p.alive = false;
      p.lunge = null; p.pull = null; p.rip = null; endSlow();
      ctx.combat?.unregister(p);
      if (p.rig) p.rig.root.visible = false;
    },
    teleport(pos, yaw) {
      p.pos.copy(pos);
      if (!Number.isFinite(p.pos.y)) p.pos.y = ground(p.pos.x, p.pos.z, 1e5);
      p.vel.set(0, 0, 0);
      p.lunge = null; p.pull = null;
      if (yaw !== undefined) p.yaw = p.bodyYaw = yaw;
      if (p.rig) { p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw; }
    },
    snapshot() {
      const ammo = {};
      for (const slot of SLOTS) ammo[slot] = p.weapons[slot]?.ammo ?? 0;
      return { ap: p.ap, ammo };
    },
    heal(amount) { p.ap = Math.min(p.apMax, p.ap + (Number(amount) || 0)); },
    refill() { p.ap = p.apMax; p.en = p.enMax; p.overheat = 0; for (const w of Object.values(p.weapons)) w.refill(); },
    /** extra: prototype blade-hit slow motion (timeScale for `seconds` of real time); ignored while something else owns timeScale */
    slowMo(scale = 0.25, seconds = 0.07) {
      if (p.slowT > 0) { p.slowT = Math.max(p.slowT, seconds); return; }
      if (ctx.timeScale !== 1) return;
      p.slowPrev = ctx.timeScale; p.slowScale = scale; ctx.timeScale = scale; p.slowT = seconds;
    },
    /** extra: ability check honouring a partial `abilities` object (missing = allowed) */
    can(k) { const a = p.abilities; return !a || a[k] !== false; },

    update(dt) {
      if (!p.active || dt <= 0) return;
      const inp = ctx.input;
      if (p.slowT > 0) { p.slowT -= dt / Math.max(ctx.timeScale, 0.05); if (p.slowT <= 0) endSlow(); }

      // ── look ──
      const sens = LOOK_RAD_PER_PX * (ctx.settings.get('sens') ?? 1);
      const ldx = inp.look.dx || 0, ldy = inp.look.dy || 0;
      p.yaw = angWrap(p.yaw - ldx * sens);
      p.pitch = clamp(p.pitch - ldy * sens * (ctx.settings.get('invertY') ? -1 : 1), -0.75, 0.95);
      if (!p.can('lock')) { p.lock = null; p.hardLock = false; }
      if (p.hardLock && p.lock && p.lock.alive) {
        const c = p.lock.center(_t); const dx = c.x - p.pos.x, dz = c.z - p.pos.z;
        p.yaw = dampAng(p.yaw, yawTo(dx, dz), 7, dt);
        p.pitch = damp(p.pitch, clamp(Math.atan2(c.y - (p.pos.y + 7), Math.hypot(dx, dz)) + 0.06, -0.75, 0.95), 6, dt);
      } else if (p.hardLock) p.hardLock = false;

      if (!p.alive) return;
      const rip = p.rip, ap = p.autopilot;
      const canAct = p.stagT <= 0 && !p.frozen && !rip;
      p.stagT = Math.max(0, p.stagT - dt);
      if (ctx.clock.time - p.lastHit > 2) p.imp = Math.max(0, p.imp - p.impMax * 0.4 * dt);
      p.qbT -= dt; p.enUseT -= dt; p.overheat = Math.max(0, p.overheat - dt); p.landT = Math.max(0, p.landT - dt * 2.5);
      p.recoil = damp(p.recoil, 0, 12, dt);
      const S = p.stats;

      // ── movement intent: move.x right, move.y forward; forward = (−sin yaw, −cos yaw), right = (cos yaw, −sin yaw) ──
      let mx = 0, my = 0, moveMag = 0;
      if (canAct) { mx = inp.move.x || 0; my = inp.move.y || 0; }
      const il = Math.hypot(mx, my);
      if (il > 0) { moveMag = Math.min(1, il); mx /= il; my /= il; }
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      let wx = mx * cy - my * sy, wz = -mx * sy - my * cy;
      const moveScale = typeof p.abilities?.move === 'number' ? p.abilities.move : 1;
      let speed = S.speed * (S.speedMul || 1) * moveScale;

      // autopilot (A5.1): walks to `to` even while frozen, then turns the body to `face`
      let apYaw = null;
      if (ap) {
        if (ap.to && !ap.arrived) {
          const dx = ap.to.x - p.pos.x, dz = ap.to.z - p.pos.z, d = Math.hypot(dx, dz);
          if (d > 1.5) { wx = dx / d; wz = dz / d; moveMag = 1; speed = ap.speed ?? 5; apYaw = yawTo(dx, dz); }
          else ap.arrived = true;
        } else if (!ap.to) ap.arrived = true;
      }

      // quick boost
      if (canAct && p.can('boost') && inp.pressed(ACT.BOOST) && p.overheat <= 0 && p.en >= 60) {
        useEN(S.qbCost ?? 170);
        let qx = wx, qz = wz; if (il === 0) { qx = -sy; qz = -cy; }
        p.vel.x += qx * S.qbImpulse; p.vel.z += qz * S.qbImpulse; if (!p.onGround) p.vel.y = Math.max(p.vel.y, 0);
        p.qbT = 0.28; p.pull = null;
        ctx.audio?.play?.('qb', null);
        ctx.cameraRig?.addShake?.(0.25);
        if (p.rig?.flames?.[0]) ctx.fx?.boost?.(p.rig.flames[0].getWorldPosition(_t), _t2.set(-qx, 0, -qz));
        ctx.events.emit('player:boost', { dir: [qx, qz] });
      }

      // blade lunge / harpoon pull / TEAR override movement
      let ascend = false, driven = false;
      if (p.lunge) {
        const L = p.lunge; L.t -= dt; driven = true;
        const tgt = L.target;
        if (tgt && tgt.alive) {
          const c = tgt.center(_t); const d = _t2.copy(c).sub(p.center(_c)); const dl = d.length();
          if (dl < 9.5 || L.t <= 0) { p.lunge = null; L.weapon?.slash?.(); }
          else { d.multiplyScalar(1 / dl); p.vel.set(d.x * L.speed, d.y * L.speed, d.z * L.speed); }
        } else if (L.t <= 0) { p.lunge = null; L.weapon?.slash?.(); }
      } else if (p.pull) {
        const P = p.pull; P.t += dt; driven = true;
        const d = _t2.copy(P.point).sub(p.center(_c)); const dl = d.length();
        if (dl <= P.stop || P.t > P.max) { p.pull = null; P.weapon?.pullDone?.(); }   // keeps momentum
        else p.vel.copy(d.multiplyScalar(P.speed / dl));
      } else if (rip) {
        const tg = rip.target;
        if (!rip.ripped && tg && tg.alive) {
          const d = _t2.copy(tg.center(_t)).sub(p.center(_c)); const dl = d.length();
          if (dl > 8 && rip.travelled < 30) { driven = true; p.vel.copy(d.multiplyScalar(60 / dl)); rip.travelled += 60 * dt; }
          else { driven = true; p.vel.multiplyScalar(0.7); }
        }
      }
      if (!driven) {
        const k = p.qbT > 0 ? 1.4 : (p.onGround ? 7 : 2.4);
        const sp = (p.onGround ? speed : speed * 0.92) * moveMag;
        p.vel.x = damp(p.vel.x, wx * sp, k, dt); p.vel.z = damp(p.vel.z, wz * sp, k, dt);
        // vertical: jump from the ground, hover in the air
        if (canAct && inp.down(ACT.JUMP) && p.overheat <= 0 && p.en > 0) {
          if (p.onGround && inp.pressed(ACT.JUMP)) {
            if (p.can('jump')) { p.vel.y = S.jump; p.onGround = false; ctx.fx?.dust?.(p.pos, 6, 3); }
          } else if (!p.onGround && p.can('hover')) {
            if (useEN(S.hoverCost * (p.hoverCostScale ?? 1) * dt)) { p.vel.y = Math.min(20, p.vel.y + S.hoverAccel * dt); ascend = true; }
          }
        }
        p.vel.y -= 45 * (p.gravityScale ?? 1) * dt;
        if (p.qbT > 0 && !p.onGround) p.vel.y = Math.max(p.vel.y, -2);
      }
      p.vel.y = Math.max(p.vel.y, -75);
      if (p.frozen && !ap) { p.vel.x *= 0.9; p.vel.z *= 0.9; }
      p.pos.addScaledVector(p.vel, dt);
      ctx.collision?.resolve(p);
      const g = ground(p.pos.x, p.pos.z, p.pos.y);
      if (p.pos.y <= g) {
        if (!p.onGround && p.vel.y < -24) {
          const sp = -p.vel.y;
          p.landT = 0.3;
          ctx.fx?.landing?.(p.pos, clamp(sp / 40, 0.5, 1.6));
          ctx.audio?.play?.('land', null);
          ctx.cameraRig?.addShake?.(0.3);
          ctx.events.emit('player:landed', { speed: sp });
        }
        p.pos.y = g; p.vel.y = Math.max(0, p.vel.y); p.onGround = true;
      } else if (p.onGround && p.pos.y - g < 1.2 && p.vel.y <= 0) { p.pos.y = g; p.vel.y = 0; }   // downhill: stay planted
      else p.onGround = false;
      const gh = ctx.world?.groundHeight ? ctx.world.groundHeight(p.pos.x, p.pos.z) : 0;
      if (p.pos.y > gh + 160) { p.pos.y = gh + 160; p.vel.y = Math.min(p.vel.y, 0); }
      // play area (§4.4): warning past 0.6, pushed back toward the route at the hard limit
      const pa = ctx.world?.route && ctx.world.playArea ? ctx.world.playArea(p.pos.x, p.pos.z) : null;
      if (pa && pa.edge > 0.6) {
        ctx.hud?.warn?.('LEAVING OPERATIONAL AREA', 0.3);
        if (pa.edge >= 1) {
          const c = ctx.world.route.pointAt(pa.s, _t);
          const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dl = Math.hypot(dx, dz) || 1;
          const push = (pa.edge - 1) * pa.halfWidth * 0.375 + 0.5;
          p.pos.x += dx / dl * push; p.pos.z += dz / dl * push;
          const out = -(p.vel.x * dx + p.vel.z * dz) / dl;   // remove outward velocity
          if (out > 0) { p.vel.x += dx / dl * out; p.vel.z += dz / dl * out; }
        }
      }
      // EN regen and repair
      if (p.enUseT <= 0) p.en = Math.min(p.enMax, p.en + (p.overheat > 0 ? 0 : (p.onGround ? S.enRegen : S.enRegenAir)) * (p.enRegenScale ?? 1) * dt);
      if (p.repairT > 0) { p.repairT -= dt; p.ap = Math.min(p.apMax, p.ap + (p.repairRate || 3600) * dt); }

      // ── aim: lock-on and the aim point marched along last frame's camera ray (prototype) ──
      if (ctx.cameraRig?.aimRay) ctx.cameraRig.aimRay(aim.origin, aim.dir);
      else { p.center(aim.origin); aimDir(p.yaw, p.pitch, aim.dir); }
      if (p.can('lock')) updateLock(); else { p.lock = null; p.hardLock = false; lastLock = null; }
      let hitT = 600; p.aimHit = false;
      const col = ctx.collision;
      for (let t = 10; t < 600; t += 6) {
        _q.copy(aim.origin).addScaledVector(aim.dir, t);
        if (_q.y < groundAt(_q.x, _q.z) || (col && col.pointInSolid(_q))) { hitT = t; p.aimHit = true; break; }
      }
      p.aimPoint.copy(aim.origin).addScaledVector(aim.dir, hitT);
      aim.point.copy(p.aimPoint);
      aim.lock = p.lock && p.lock.alive ? p.lock : null;
      aim.hit = p.aimHit || !!aim.lock;

      // ── weapons ──
      const blockL = !!ctx.haul?.blocksBlade;
      for (let i = 0; i < SLOTS.length; i++) {
        const slot = SLOTS[i], w = p.weapons[slot];
        if (!w) continue;
        w.update(dt);
        const a = SLOT_ACT[slot];
        let ok = canAct && p.can(SLOT_AB[slot]);
        if (slot === 'L' && blockL) ok = false;
        if (ok) { const r = IN[slot]; r.down = inp.down(a); r.pressed = inp.pressed(a); w.trigger(r, aim); }
        else w.trigger(IDLE, aim);
      }
      if (p.can('lock') && inp.pressed(ACT.LOCK)) {
        if (p.hardLock) p.hardLock = false;
        else if (p.lock) { p.hardLock = true; ctx.audio?.play?.('lock', null); }
      }
      p.bladeT = Math.max(0, p.bladeT - dt);

      // ── body yaw: autopilot, idle facing (A5.1), else follow the aim (prototype) ──
      const anyInput = il > 0 || ldx !== 0 || ldy !== 0 || inp.down(ACT.FIRE) || inp.down(ACT.BLADE) || inp.down(ACT.BOOST)
                       || inp.down(ACT.JUMP) || inp.down(ACT.MISSILE) || inp.down(ACT.KIT) || inp.down(ACT.LOCK);
      p.idleT = anyInput ? 0 : p.idleT + dt;
      idleReached = false;
      if (ap) {
        const rate = ap.turnRate ?? IDLE_TURN;
        if (apYaw != null) p.bodyYaw = turnToward(p.bodyYaw, apYaw, Math.max(rate, 1.2) * dt);
        else if (ap.arrived) {
          if (ap.face != null) p.bodyYaw = turnToward(p.bodyYaw, ap.face, rate * dt);
          if (ap.face == null || Math.abs(angWrap(ap.face - p.bodyYaw)) < 0.01) {
            if (ap.face != null) p.bodyYaw = ap.face;
            if (p.autopilot === ap) p.autopilot = null;
            ctx.events.emit('player:autopilotDone', {});
          }
        }
      } else if (p.idleFacing != null && p.idleT > IDLE_DELAY && p.onGround && !p.lunge && !rip
                 && (ctx.enemies?.combatIntensity?.() ?? 0) < 0.2) {
        p.bodyYaw = turnToward(p.bodyYaw, p.idleFacing, IDLE_TURN * dt);
        idleReached = Math.abs(angWrap(p.idleFacing - p.bodyYaw)) < 0.01;
      } else p.bodyYaw = dampAng(p.bodyYaw, p.yaw, 12, dt);

      // ── visuals ──
      const r = p.rig;
      if (!r) return;
      r.root.position.copy(p.pos); r.root.rotation.y = p.bodyYaw;
      r.root.visible = !hidden;
      const cb = Math.cos(p.bodyYaw), sb = Math.sin(p.bodyYaw);
      const fwd = -(p.vel.x * sb + p.vel.z * cb), lat = p.vel.x * cb - p.vel.z * sb, hs = Math.hypot(p.vel.x, p.vel.z);
      p.thrust = damp(p.thrust, p.qbT > 0 || p.lunge || p.pull || (rip && !rip.ripped) ? 1.5 : clamp(hs / 30, 0, 1) * 0.55 + (ascend ? 0.45 : 0), 12, dt);
      p.hover = damp(p.hover, ascend ? 1 : 0, 12, dt);
      if (!hidden) {
        r.muzzle.getWorldPosition(_mz);
        const tp = aim.lock ? aim.lock.center(_t) : p.aimPoint;
        const aimPitch = Math.atan2(tp.y - _mz.y, Math.hypot(tp.x - _mz.x, tp.z - _mz.z));
        const aimYaw = angWrap(yawTo(tp.x - p.pos.x, tp.z - p.pos.z) - p.bodyYaw);
        for (const k of overrideExtras) ST[k] = undefined;
        ST.fwd = fwd; ST.lat = lat; ST.onGround = p.onGround; ST.pitch = clamp(aimPitch, -0.9, 1.1); ST.aimYaw = aimYaw;
        ST.thrust = p.thrust; ST.hover = p.hover; ST.landT = p.landT; ST.bladeT = p.bladeT; ST.bladeWind = false;
        ST.recoil = p.recoil; ST.crouch = p.stagT > 0 ? 0.3 : 0; ST.tear = undefined;
        if (rip) {
          ST.tear = rip.k;
          if (!rip.ripped) ST.bladeWind = true;
          else ST.bladeT = clamp(0.4 - (rip.t - 0.72), 0, 0.4);
        }
        if (p.animOverride) {
          Object.assign(ST, p.animOverride);
          overrideExtras = Object.keys(p.animOverride).filter(k => !ANIM_KEYS.includes(k));
        } else overrideExtras = [];
        animateMech(r, ST, dt);
        // footfall dust while running (cosmetic, prototype)
        const P = ctx.particles;
        if (P && p.onGround && hs > 12 && Math.random() < dt * 14) {
          const s = Math.random() < 0.5 ? -1 : 1;
          P.smoke?.spawn?.(p.pos.x + cb * s * 1.2, p.pos.y + 0.3, p.pos.z - sb * s * 1.2, (Math.random() - 0.5) * 4, 0.5 + Math.random() * 1.5,
                           (Math.random() - 0.5) * 4, 1.2, 1.2, 4, 0.45, 0.38, 0.33, 0.45, 1, 0, 1);
        }
        if (P && p.onGround && hs > 20 && Math.random() < dt * 30) {
          P.add?.spawn?.(p.pos.x + (Math.random() - 0.5) * 2, p.pos.y + 0.2, p.pos.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6,
                         1 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.25, 0.3, 0.1, 1, 0.7, 0.3, 1, 1, 20, 0);
        }
      }
    },
  };

  function updateLock() {
    if (p.hardLock && p.lock && p.lock.alive) return;
    const list = ctx.combat?.targets;
    if (!list) return;
    const camPos = aim.origin, camF = aim.dir;
    const touchK = ctx.input?.isTouch ? 1.4 : 1;
    let best = null, bestS = 1e9;
    for (const e of list) {
      if (!e.alive || e.targetable === false || !isHostile('player', e.team)) continue;
      const c = e.center(_t); const d = c.distanceTo(p.pos);
      if (d > 420) continue;
      const ang = _t2.copy(c).sub(camPos).normalize().angleTo(camF);
      const lim = (0.2 + clamp(20 / Math.max(d, 1), 0, 0.2)) * touchK;
      if (ang < lim) { const s = ang + d / 3000 + (e === p.lock ? -0.05 : 0); if (s < bestS) { bestS = s; best = e; } }
    }
    p.lock = best;
    if (best && best !== lastLock) ctx.audio?.play?.('lock', null);
    lastLock = best;
  }

  /** prototype useEN: spend EN; emptying it overheats the frame for 2.4 s */
  function useEN(amt) {
    if (p.overheat > 0 || p.en <= 0) return false;
    p.en -= amt; p.enUseT = 0.55;
    if (p.en <= 0) { p.en = 0; p.overheat = 2.4; ctx.audio?.play?.('empty', null); ctx.hud?.warn?.('EN DEPLETED', 1.5); }
    return true;
  }
  function endSlow() {
    if (p.slowT > 0 || p.slowScale) {
      if (p.slowScale && ctx.timeScale === p.slowScale) ctx.timeScale = p.slowPrev ?? 1;
    }
    p.slowT = 0; p.slowScale = 0;
  }
  function groundAt(x, z) {
    if (ctx.collision) return ctx.collision.groundHeight(x, z);
    return ctx.world ? ctx.world.groundHeight(x, z) : 0;
  }
  function ground(x, z, y) {
    if (ctx.collision) return ctx.collision.supportHeight(x, z, y);
    return ctx.world ? ctx.world.groundHeight(x, z) : 0;
  }

  ctx.events.on('level:cleared', () => {
    if (p.active) p.despawn();
    // level-owned controls reset with the level (they survive spawn and setLoadout within a level)
    p.abilities = { ...DEFAULT_ABILITIES };
    p.hoverCostScale = 1; p.enRegenScale = 1; p.gravityScale = 1;
    p.hidden = false; p.idleFacing = null; p.animOverride = null; p.autopilot = null; p.invuln = false;
  });
  ctx.addSystem({ name: 'player', phase: 'player', when: 'sim', update: (dt) => p.update(dt) });
  ctx.player = p;
  return p;
}
