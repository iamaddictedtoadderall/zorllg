// actors/player.js (P4) — P0 STUB: minimal mover. WASD/stick relative to yaw, mouse look, jump, a simple quick boost,
// gravity to supportHeight, collision push-out, play-area warning/pushback, cameraRig.follow, buildMech + animateMech.
// No weapons fire, no EN use, no lock-on. P4 ports the prototype's updatePlayer.
import * as THREE from 'three';
import { clamp, damp, dampAng, angWrap, yawTo } from '../core/util.js';
import { ACT, LOOK_RAD_PER_PX } from '../core/input.js';
import { buildMech, animateMech } from '../art/mechs.js';
import { computeStats, PARTS, SLOTS, DEFAULT_LOADOUT } from '../combat/loadout.js';
import { createWeapon } from '../combat/weapons.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export function install(ctx) {
  const p = {
    // Target
    id: undefined, name: 'PLAYER', kind: 'player', team: 'player', tags: new Set(['player']),
    alive: false, targetable: true, objective: false, boss: false,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    ap: 9000, apMax: 9000, imp: 0, impMax: 1400, stagT: 0, stagDur: 1.0, lastHit: -9, invuln: false, hitR: 3.6,
    center(out = new THREE.Vector3()) { return out.set(p.pos.x, p.pos.y + 5.5, p.pos.z); },
    hitTest(q) { p.center(_t); return _t.distanceToSquared(q) < p.hitR * p.hitR; },
    onDamage(info) { if (info.amount > 0) ctx.hud?.hurt?.(Math.min(1, info.amount / 1500)); ctx.events.emit('player:damaged', { amount: info.amount, source: info.source, ap: p.ap }); },
    onDeath() {
      p.alive = false;
      ctx.fx?.explosion?.(p.center(_t), 2.4);
      if (p.rig) p.rig.root.visible = false;
      ctx.events.emit('player:died', {});
    },

    // Player
    active: false,
    rig: null,
    loadout: null, stats: null, weapons: {},
    yaw: 0, pitch: -0.05, bodyYaw: 0,
    en: 1000, enMax: 1000, overheat: 0,
    onGround: true, thrust: 0, hover: 0, rad: 2.6, hgt: 9.5,
    lock: null, hardLock: false,
    aimPoint: new THREE.Vector3(),
    frozen: false,
    landT: 0, qbT: 0,

    setLoadout(lo) {
      p.loadout = JSON.parse(JSON.stringify(lo || DEFAULT_LOADOUT));
      p.stats = computeStats(p.loadout);
      const s = p.stats;
      p.apMax = s.ap; p.enMax = s.en; p.impMax = s.impMax; p.rad = s.rad; p.hgt = s.hgt; p.hitR = s.hitR;
      if (!p.active) { p.ap = p.apMax; p.en = p.enMax; } else { p.ap = Math.min(p.ap, p.apMax); p.en = Math.min(p.en, p.enMax); }
      p.weapons = {};
      for (const slot of SLOTS) { const part = PARTS[p.loadout[slot]]; if (part) p.weapons[slot] = createWeapon(ctx, part, p); }
      const vis = p.rig ? p.rig.root.visible : false;
      if (p.rig) p.rig.dispose();
      const paint = p.loadout.paint || {};
      p.rig = buildMech(ctx, { design: s.design, base: paint.base, mid: paint.mid, accent: paint.accent, visor: paint.visor,
                               flame: paint.flame, blade: paint.blade },
                       { parts: { R: p.loadout.R, L: p.loadout.L, S: p.loadout.S, U: p.loadout.U } });
      p.rig.root.visible = vis;
      p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw;
      ctx.scene.add(p.rig.root);
    },
    spawn(pos, yaw = 0, snap) {
      if (!p.rig) p.setLoadout(ctx.save?.getLoadout?.() || DEFAULT_LOADOUT);
      Object.assign(p, { alive: true, active: true, imp: 0, stagT: 0, lastHit: -9, overheat: 0, landT: 0, qbT: 0,
                         thrust: 0, hover: 0, lock: null, hardLock: false, frozen: false, onGround: true });
      p.ap = snap?.ap ?? p.apMax; p.en = p.enMax;
      for (const slot of SLOTS) { const w = p.weapons[slot]; if (!w) continue; w.refill(); if (snap?.ammo?.[slot] != null) w.ammo = snap.ammo[slot]; }
      p.yaw = p.bodyYaw = yaw; p.pitch = -0.05;
      p.vel.set(0, 0, 0);
      p.pos.copy(pos);
      if (!Number.isFinite(p.pos.y)) p.pos.y = ground(p.pos.x, p.pos.z, 1e5);
      p.rig.root.visible = true;
      p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw;
      ctx.combat?.register(p);
      ctx.cameraRig?.follow(p);
      ctx.events.emit('player:spawned', {});
    },
    despawn() {
      p.active = false; p.alive = false;
      ctx.combat?.unregister(p);
      if (p.rig) p.rig.root.visible = false;
    },
    teleport(pos, yaw) {
      p.pos.copy(pos);
      if (!Number.isFinite(p.pos.y)) p.pos.y = ground(p.pos.x, p.pos.z, 1e5);
      p.vel.set(0, 0, 0);
      if (yaw !== undefined) p.yaw = p.bodyYaw = yaw;
      if (p.rig) { p.rig.root.position.copy(p.pos); p.rig.root.rotation.y = p.bodyYaw; }
    },
    snapshot() {
      const ammo = {};
      for (const slot of SLOTS) ammo[slot] = p.weapons[slot]?.ammo ?? 0;
      return { ap: p.ap, ammo };
    },
    heal(amount) { p.ap = Math.min(p.apMax, p.ap + amount); },
    refill() { p.ap = p.apMax; p.en = p.enMax; for (const w of Object.values(p.weapons)) w.refill(); },

    update(dt) {
      if (!p.active || dt <= 0) return;
      const inp = ctx.input;
      // look
      const sens = LOOK_RAD_PER_PX * ctx.settings.get('sens');
      p.yaw = angWrap(p.yaw - inp.look.dx * sens);
      p.pitch = clamp(p.pitch - inp.look.dy * sens * (ctx.settings.get('invertY') ? -1 : 1), -0.75, 0.95);
      if (!p.alive) return;
      const canAct = p.stagT <= 0 && !p.frozen;
      p.stagT = Math.max(0, p.stagT - dt);
      p.landT = Math.max(0, p.landT - dt * 2.5);
      p.qbT -= dt;
      // movement intent: move.x right, move.y forward; forward = (−sin yaw, −cos yaw), right = (cos yaw, −sin yaw)
      const mx = canAct ? inp.move.x : 0, my = canAct ? inp.move.y : 0;
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      const wx = mx * cy - my * sy, wz = -mx * sy - my * cy;
      if (canAct && inp.pressed(ACT.BOOST)) {
        let qx = wx, qz = wz; const ql = Math.hypot(qx, qz);
        if (ql < 1e-3) { qx = -sy; qz = -cy; } else { qx /= ql; qz /= ql; }
        p.vel.x += qx * p.stats.qbImpulse; p.vel.z += qz * p.stats.qbImpulse; p.qbT = 0.28;
      }
      const speed = p.stats.speed * (p.stats.speedMul || 1) * (p.onGround ? 1 : 0.92);
      const k = p.qbT > 0 ? 1.4 : (p.onGround ? 7 : 2.4);
      p.vel.x = damp(p.vel.x, wx * speed, k, dt); p.vel.z = damp(p.vel.z, wz * speed, k, dt);
      if (canAct && p.onGround && inp.pressed(ACT.JUMP)) { p.vel.y = p.stats.jump; p.onGround = false; }
      p.vel.y = Math.max(p.vel.y - 45 * dt, -75);
      if (p.frozen) { p.vel.x *= 0.9; p.vel.z *= 0.9; }
      p.pos.addScaledVector(p.vel, dt);
      ctx.collision?.resolve(p);
      const g = ground(p.pos.x, p.pos.z, p.pos.y);
      if (p.pos.y <= g) {
        if (!p.onGround && p.vel.y < -24) { p.landT = 0.3; ctx.events.emit('player:landed', { speed: -p.vel.y }); }
        p.pos.y = g; p.vel.y = Math.max(0, p.vel.y); p.onGround = true;
      } else if (p.onGround && p.pos.y - g < 1.2 && p.vel.y <= 0) p.pos.y = g;
      else p.onGround = false;
      const gh = ctx.world ? ctx.world.groundHeight(p.pos.x, p.pos.z) : 0;
      if (p.pos.y > gh + 160) { p.pos.y = gh + 160; p.vel.y = Math.min(p.vel.y, 0); }
      // play area
      const pa = ctx.world?.playArea ? ctx.world.playArea(p.pos.x, p.pos.z) : null;
      if (pa && pa.edge > 0.6) {
        ctx.hud?.warn?.('LEAVING OPERATIONAL AREA', 0.3);
        if (pa.edge >= 1 && ctx.world.route) {
          const c = ctx.world.route.pointAt(pa.s, _t);
          const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dl = Math.hypot(dx, dz) || 1;
          const push = (pa.edge - 1) * pa.halfWidth * 0.375 + 0.5;
          p.pos.x += dx / dl * push; p.pos.z += dz / dl * push;
        }
      }
      for (let i = 0; i < SLOTS.length; i++) p.weapons[SLOTS[i]]?.update(dt);
      // aim point along the camera ray (P4: lock-on, aim march)
      if (ctx.cameraRig) {
        ctx.cameraRig.aimRay(_o, _d);
        const h = ctx.world?.raycast ? ctx.world.raycast(_o, _d, 600) : null;
        p.aimPoint.copy(_o).addScaledVector(_d, h ? h.dist : 600);
      }
      // visuals
      p.bodyYaw = dampAng(p.bodyYaw, p.yaw, 12, dt);
      const r = p.rig;
      r.root.position.copy(p.pos); r.root.rotation.y = p.bodyYaw;
      const cb = Math.cos(p.bodyYaw), sb = Math.sin(p.bodyYaw);
      const fwd = -(p.vel.x * sb + p.vel.z * cb), lat = p.vel.x * cb - p.vel.z * sb, hs = Math.hypot(p.vel.x, p.vel.z);
      p.thrust = damp(p.thrust, p.qbT > 0 ? 1.5 : clamp(hs / 30, 0, 1) * 0.55, 12, dt);
      const aimYaw = angWrap(yawTo(p.aimPoint.x - p.pos.x, p.aimPoint.z - p.pos.z) - p.bodyYaw);
      animateMech(r, { fwd, lat, onGround: p.onGround, pitch: clamp(p.pitch, -0.9, 1.1), aimYaw, thrust: p.thrust, hover: p.hover,
                       landT: p.landT, bladeT: 0, recoil: 0, crouch: p.stagT > 0 ? 0.3 : 0 }, dt);
    },
  };
  function ground(x, z, y) {
    if (ctx.collision) return ctx.collision.supportHeight(x, z, y);
    return ctx.world ? ctx.world.groundHeight(x, z) : 0;
  }
  ctx.events.on('level:cleared', () => { if (p.active) p.despawn(); });
  ctx.addSystem({ name: 'player', phase: 'player', when: 'sim', update: (dt) => p.update(dt) });
  ctx.player = p;
  return p;
}
