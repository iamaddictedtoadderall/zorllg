// combat/weapons.js (P4): data-driven weapon behaviours (PARTS[].weapon + stats), ported from the prototype's
// updatePlayer/doSlash/missileTargets and extended with the first-build catalogue (Appendix C.4) and the addendum's
// 'harpoon' and 'flares' (A5.1).
//
// The owner is the player (Target & { rig }). Weapons that move the owner hand it a state the player integrates:
//   owner.lunge  = { target, t, speed, weapon }   blade lunge; the player calls weapon.slash() at the end
//   owner.pull   = { point, speed, stop, t, max }  harpoon pull toward a heavy / the world
//   owner.repairT, owner.repairRate              repair kit
//   owner.slowMo?.(scale, realSeconds)           blade-hit slow motion (prototype)
// AimContext (§4.4) gains an optional `hit` flag: true when the camera ray hit something within 600 m.
// Gameplay randomness (spread, launch jitter) uses ctx.random() (§1.4).
import * as THREE from 'three';
import { clamp, aimDir, lerp } from '../core/util.js';
import { leadPoint } from './projectiles.js';
import { isHostile } from './combat.js';

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3(), _v = new THREE.Vector3();
const _c = new THREE.Vector3(), _c2 = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion();
const _Z = new THREE.Vector3(0, 0, 1);

const MUZZLE_FX = { rifle: 'rifle', mg: 'mg', shotgun: 'shotgun', cannon: 'cannon' };
const FIRE_SFX = { rifle: 'rifle', mg: 'mg', shotgun: 'shotgun', cannon: 'cannon' };

// ------------------------------------------------------------------------------------------- shared per-ctx state
// Harpoon reels (they move other units, so they run after the AI: physics phase, after projectiles) and burning flares.
const SHARED = new WeakMap();
function shared(ctx) {
  let s = SHARED.get(ctx);
  if (s) return s;
  s = { reels: [], flares: [], flareFx: [] };
  ctx.addSystem({ name: 'weapons', phase: 'physics', when: 'sim', order: 10, update: (dt) => updateShared(ctx, s, dt) });
  const reset = () => {
    for (const r of s.reels) if (r.target) r.target.heldT = 0;
    s.reels.length = 0;
    for (const f of s.flares) killFlare(f);
    s.flares.length = 0;
  };
  ctx.events.on('level:cleared', reset);
  ctx.events.on('player:spawned', reset);
  SHARED.set(ctx, s);
  return s;
}

function flareVisual(ctx, s) {
  let v = s.flareFx.find(x => !x.used);
  if (!v) {
    const M = ctx.materials;
    const glow = (c, o) => M?.glow ? M.glow(c, o) : new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), glow(0xffe0e6, 1));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), glow(0xff5a78, 0.2));
    core.add(halo); core.name = 'flare'; core.frustumCulled = false; halo.frustumCulled = false;
    core.geometry.userData.shared = true; halo.geometry.userData.shared = true;
    ctx.scene.add(core);
    v = { mesh: core, halo, used: false };
    s.flareFx.push(v);
  }
  v.used = true; v.mesh.visible = true;
  return v;
}
function killFlare(f) {
  f.decoy.alive = false;
  if (f.vis) { f.vis.used = false; f.vis.mesh.visible = false; f.vis = null; }
  f.emitter?.stop?.(); f.emitter = null;
  if (f.proj?.alive && f.proj.serial === f.serial) f.proj.alive = false;
}

function updateShared(ctx, s, dt) {
  // reels: drag a light target to `reelTo` m in front of the owner over `reelTime` s (it can't fight back: heldT)
  for (let i = s.reels.length - 1; i >= 0; i--) {
    const r = s.reels[i], t = r.target, o = r.owner;
    if (!t || !t.alive || !o?.alive) { if (t) t.heldT = 0; s.reels.splice(i, 1); r.weapon.reelDone(); continue; }
    r.t += dt;
    const k = clamp(r.t / r.dur, 0, 1), e = k * k * (3 - 2 * k);
    aimDir(o.bodyYaw ?? o.yaw ?? 0, 0, _f);
    _to.copy(o.pos).addScaledVector(_f, r.dist);
    const flying = !t.onGround && (r.fromY - groundAt(ctx, r.from.x, r.from.z)) > 3;
    _to.y = flying ? o.pos.y + 6 : groundAt(ctx, _to.x, _to.z);
    _v.copy(t.pos);
    t.pos.lerpVectors(r.from, _to, e);
    if (!flying) t.pos.y = Math.max(t.pos.y, ctx.collision?.supportHeight ? ctx.collision.supportHeight(t.pos.x, t.pos.z, t.pos.y + 2) : t.pos.y);
    if (dt > 0) t.vel.copy(t.pos).sub(_v).multiplyScalar(1 / dt);
    t.heldT = 0.1;
    if (t.root) t.root.position.copy(t.pos);
    if (k >= 1) { t.vel.multiplyScalar(0.2); t.heldT = 0; s.reels.splice(i, 1); r.weapon.reelDone(); }
  }
  // flares: in flight the decoy rides the projectile; then it burns where it landed (or on what it stuck to)
  for (let i = s.flares.length - 1; i >= 0; i--) {
    const f = s.flares[i];
    if (f.state === 'flight') {
      if (f.proj && f.proj.alive && f.proj.serial === f.serial) f.decoy.pos.copy(f.proj.pos);
      else { killFlare(f); s.flares.splice(i, 1); continue; }   // cleared without landing (projectiles.clear)
    } else {
      f.burn -= dt;
      if (f.attached) {
        if (f.attached.alive) f.decoy.pos.copy(f.attached.pos).add(f.offset);
        else f.attached = null;
      }
      if (f.burn <= 0) { killFlare(f); s.flares.splice(i, 1); continue; }
    }
    if (f.vis) {
      f.vis.mesh.position.copy(f.decoy.pos);
      const fl = 0.8 + 0.35 * Math.random();   // cosmetic flicker
      f.vis.mesh.scale.setScalar(f.state === 'flight' ? 0.9 : fl * (f.burn < 2 ? Math.max(0.05, f.burn / 2) : 1));
    }
    if (f.emitter?.pos) f.emitter.pos.copy(f.decoy.pos);
  }
}
function land(ctx, f, point, target) {
  f.state = 'burn';
  f.burn = f.lightT;
  f.decoy.pos.copy(point);
  if (target && target.alive) {
    f.attached = target;
    f.offset = new THREE.Vector3().copy(point).sub(target.pos);
    target.blindT = Math.max(target.blindT || 0, f.blind);
  }
  ctx.particles?.lights?.flash?.(f.decoy.pos, 0xff6a80, 420, f.lightR, f.lightT);
  f.emitter = ctx.fx?.emitter?.('fire', f.decoy.pos, { rate: 0.6, scale: 0.35, color: [1, 0.35, 0.45] }) || null;
  ctx.fx?.sparks?.(f.decoy.pos, 16, [1, 0.45, 0.5], 14);
}

function groundAt(ctx, x, z) {
  return ctx.collision?.groundHeight ? ctx.collision.groundHeight(x, z) : (ctx.world?.groundHeight?.(x, z) ?? 0);
}

// ------------------------------------------------------------------------------------------- helpers
function rnd(ctx, a, b) { return a + ctx.random() * (b - a); }
function sfx(ctx, name, at) { ctx.audio?.play?.(name, at ?? null); }
function stats(ctx) { return ctx.combat?.stats; }

/** world position of a rig socket, falling back to the owner's centre */
function socket(owner, which, out) {
  const rig = owner.rig;
  const o = rig ? (which === 'L' ? rig.muzzleL : which === 'S' ? (rig.mounts?.S?.children?.length ? rig.mounts.S : rig.pod) : rig.muzzle) : null;
  if (o) return o.getWorldPosition(out);
  return owner.center ? owner.center(out) : out.copy(owner.pos);
}

/** prototype missileTargets(): hostile targets inside a 0.45 rad cone of the camera within 460 m, lock first */
export function missileTargets(ctx, owner, aim, max = 4) {
  const C = ctx.combat; if (!C) return [];
  const cam = ctx.camera.position, out = [];
  for (const t of C.targets) {
    if (!t.alive || t.targetable === false || !isHostile(owner.team, t.team)) continue;
    const c = t.center(_c); const d = c.distanceTo(owner.pos);
    if (d > 460) continue;
    const ang = _c2.copy(c).sub(cam).normalize().angleTo(aim.dir);
    if (ang < 0.45) out.push({ e: t, s: ang + d / 2000 });
  }
  out.sort((a, b) => a.s - b.s);
  const lock = aim.lock && aim.lock.alive ? aim.lock : null;
  if (lock && !out.find(o => o.e === lock)) out.unshift({ e: lock, s: -1 });
  return out.slice(0, max).map(o => o.e);
}

/** velocity that lands a gravity-`g` shell on `to` after `T` seconds */
function ballistic(from, to, g, T, out) {
  return out.set((to.x - from.x) / T, (to.y - from.y + 0.5 * g * T * T) / T, (to.z - from.z) / T);
}

// ------------------------------------------------------------------------------------------- createWeapon
export function createWeapon(ctx, part, owner) {
  const st = part.stats || {};
  const type = part.weapon;
  const ammoMax = st.ammo ?? st.kits ?? st.count ?? 0;
  const S = (type === 'harpoon' || type === 'flares') ? shared(ctx) : null;
  const team = () => owner.team || 'player';
  const src = (kind) => ({ team: team(), owner, kind: kind || type });
  let cable = null;

  const w = {
    part, slot: part.slot, owner,
    ammo: ammoMax, ammoMax, cd: 0,
    /** extra: harpoon state ('idle' | 'flight' | 'reel' | 'pull') */
    state: 'idle',
    update(dt) {
      if (w.cd > 0) w.cd = Math.max(0, w.cd - dt);
      if (type === 'harpoon') updateCable();
    },
    trigger(inp, aim) {
      if (!inp) return;
      switch (type) {
        case 'rifle': case 'mg': if (inp.down) fireBullet(aim); break;
        case 'shotgun': if (inp.down) fireShotgun(aim); break;
        case 'cannon': if (inp.down) fireCannon(aim); break;
        case 'blade': if (inp.pressed) startBlade(aim); break;
        case 'missiles': case 'micromissiles': if (inp.pressed) fireMissiles(aim); break;
        case 'mortar': if (inp.pressed) fireMortar(aim); break;
        case 'kit': if (inp.pressed) useKit(); break;
        case 'harpoon': if (inp.pressed) fireHarpoon(aim); break;
        case 'flares': if (inp.pressed) fireFlare(aim); break;
        default: break;
      }
    },
    readout() {
      const cooling = w.cd > 0;
      const empty = w.ammoMax > 0 && w.ammo <= 0;
      let label, cool = cooling;
      switch (type) {
        case 'blade': case 'harpoon': label = cooling ? w.cd.toFixed(1) : 'READY'; break;
        case 'missiles': case 'micromissiles': case 'mortar': label = cooling ? w.cd.toFixed(1) : `READY · ${w.ammo}`; break;
        case 'kit': label = String(w.ammo); cool = (owner.repairT || 0) > 0; break;
        case 'flares': label = String(w.ammo); break;
        case 'rifle': case 'mg': label = String(w.ammo); cool = false; break;
        default: label = String(w.ammo);
      }
      return { label, cooling: cool, empty };
    },
    refill() { w.ammo = w.ammoMax; w.cd = 0; },
    /** extra: release meshes (the player calls it when it rebuilds its weapons) */
    dispose() {
      if (cable) { cable.parent?.remove(cable); cable.geometry.dispose(); cable = null; }
      if (S) {
        for (let i = S.reels.length - 1; i >= 0; i--) if (S.reels[i].weapon === w) { if (S.reels[i].target) S.reels[i].target.heldT = 0; S.reels.splice(i, 1); }
      }
      if (owner.pull?.weapon === w) owner.pull = null;
      if (owner.lunge?.weapon === w) owner.lunge = null;
    },
    /** blade: the lunge ended (called by the player). Prototype doSlash(). */
    slash() {
      const C = ctx.combat; if (!C) return;
      owner.bladeT = 0.4; owner.vel.multiplyScalar(0.25);
      const c = owner.center(_c).clone();
      aimDir(owner.bodyYaw ?? owner.yaw ?? 0, 0, _f);
      let hitAny = false;
      for (const t of [...C.targets]) {
        if (!t.alive || t.targetable === false || !isHostile(team(), t.team)) continue;
        const ec = t.center(_c2); _v.copy(ec).sub(c); const dl = _v.length();
        const reach = Math.max(13, (t.hitR || 2.5) + 8.5);
        if (dl < reach && _v.normalize().dot(_f) > -0.1) {
          C.damage(t, st.dmg ?? 2300, st.imp ?? 700, src('blade'));
          hitAny = true;
          ctx.fx?.sparks?.(ec, 30, [0.6, 0.95, 1], 38);
          ctx.fx?.impact?.(ec.clone(), null, 'blade', 'metal');
        }
      }
      if (hitAny) {
        ctx.particles?.lights?.flash?.(c, 0x8fe9ff, 1200, 30, 0.3);
        sfx(ctx, 'bladeHit', c);
        ctx.cameraRig?.addShake?.(0.7);
        owner.slowMo?.(0.25, 0.07);
      }
      return hitAny;
    },
    /** harpoon: a reel finished */
    reelDone() { if (w.state === 'reel') w.state = 'idle'; },
  };

  // ---------------------------------------------------------------- guns
  function aimTarget(from, aim, speed, out) {
    if (aim.lock && aim.lock.alive) return leadPoint(from, aim.lock, speed, out);
    return out.copy(aim.point);
  }
  function fireBullet(aim) {
    if (w.cd > 0) return;
    if (w.ammo <= 0) { sfx(ctx, 'empty'); w.cd = 0.3; return; }
    w.cd = st.rate ?? 0.135; w.ammo--;
    const s = stats(ctx); if (s && owner.team === 'player') s.shots++;
    const from = socket(owner, 'R', _from).clone();
    aimTarget(from, aim, st.speed ?? 680, _to);
    const sp = st.spread ?? 0.008;
    _dir.copy(_to).sub(from).normalize();
    _dir.x += rnd(ctx, -sp, sp); _dir.y += rnd(ctx, -sp, sp); _dir.z += rnd(ctx, -sp, sp); _dir.normalize();
    ctx.projectiles?.fire({ pos: from, vel: _v.copy(_dir).multiplyScalar(st.speed ?? 680), dmg: st.dmg ?? 245, imp: st.imp ?? 70,
                            team: team(), owner, kind: 'bullet', life: type === 'mg' ? 1.0 : 1.2, srcKind: type });
    sfx(ctx, FIRE_SFX[type], from);
    owner.recoil = 1;
    ctx.fx?.muzzle?.(from, _dir, MUZZLE_FX[type]);
    ctx.particles?.lights?.flash?.(from, 0xffc070, 350, 22, 0.07);
  }
  function fireShotgun(aim) {
    if (w.cd > 0) return;
    if (w.ammo <= 0) { sfx(ctx, 'empty'); w.cd = 0.3; return; }
    w.cd = st.rate ?? 0.85; w.ammo--;
    const s = stats(ctx); if (s && owner.team === 'player') s.shots++;
    const from = socket(owner, 'R', _from).clone();
    const speed = st.speed ?? 520;
    aimTarget(from, aim, speed, _to);
    _dir.copy(_to).sub(from).normalize();
    // pellets spread uniformly over a cone of `cone` degrees (full angle)
    const half = ((st.cone ?? 4.5) * Math.PI / 180) / 2;
    _q.setFromUnitVectors(_Z, _dir);
    const n = st.pellets ?? 8, life = (st.max ?? 90) / speed;
    for (let i = 0; i < n; i++) {
      const a = ctx.random() * Math.PI * 2, r = Math.sqrt(ctx.random()) * Math.tan(half);
      _v.set(Math.cos(a) * r, Math.sin(a) * r, 1).normalize().applyQuaternion(_q).multiplyScalar(speed);
      ctx.projectiles?.fire({ pos: from, vel: _v, dmg: st.dmg ?? 140, imp: st.imp ?? 110, team: team(), owner, kind: 'bullet',
                              life, srcKind: 'shotgun', falloff: [st.full ?? 40, st.quarter ?? 80, st.max ?? 90], scale: 0.8 });
    }
    sfx(ctx, 'shotgun', from);
    owner.recoil = 1.4;
    ctx.fx?.muzzle?.(from, _dir, 'shotgun');
    ctx.particles?.lights?.flash?.(from, 0xffb060, 600, 26, 0.09);
    ctx.cameraRig?.addShake?.(0.15);
  }
  function fireCannon(aim) {
    if (w.cd > 0) return;
    if (w.ammo <= 0) { sfx(ctx, 'empty'); w.cd = 0.3; return; }
    w.cd = st.rate ?? 1.6; w.ammo--;
    const s = stats(ctx); if (s && owner.team === 'player') s.shots++;
    const from = socket(owner, 'R', _from).clone();
    const speed = st.speed ?? 300;
    aimTarget(from, aim, speed, _to);
    _dir.copy(_to).sub(from).normalize();
    ctx.projectiles?.fire({ pos: from, vel: _v.copy(_dir).multiplyScalar(speed), dmg: st.dmg ?? 1400, imp: st.imp ?? 900,
                            splash: st.splash ?? 8, splashDmg: st.splashDmg ?? 600, team: team(), owner, kind: 'shell', life: 3,
                            srcKind: 'cannon', scale: 1.3 });
    sfx(ctx, 'cannon', from);
    owner.recoil = 2;
    ctx.fx?.muzzle?.(from, _dir, 'cannon');
    ctx.particles?.lights?.flash?.(from, 0xffa050, 900, 30, 0.12);
    ctx.cameraRig?.addShake?.(0.35);
  }

  // ---------------------------------------------------------------- blade (prototype lunge + doSlash)
  function startBlade(aim) {
    if (w.cd > 0 || owner.lunge) return;
    w.cd = st.cd ?? 2.6;
    const s = stats(ctx); if (s && owner.team === 'player') s.blades++;
    sfx(ctx, 'blade', owner.pos);
    const range = st.lunge ?? 75, speed = st.lungeSpeed ?? 110;
    const L = aim.lock && aim.lock.alive && aim.lock.center(_c).distanceTo(owner.center(_c2)) < range ? aim.lock : null;
    owner.lunge = { target: L, t: L ? range / speed * 0.8 : 0.12, speed, weapon: w };
    if (!L) { aimDir(owner.yaw, 0, _f); owner.vel.x += _f.x * 40; owner.vel.z += _f.z * 40; }
  }

  // ---------------------------------------------------------------- missiles (prototype volley)
  function fireMissiles(aim) {
    if (w.cd > 0 || w.ammo <= 0) { sfx(ctx, 'empty'); return; }
    w.cd = st.cd ?? 7;
    const micro = type === 'micromissiles';
    const n = st.count ?? 4, max = micro ? 8 : 4;
    const targets = missileTargets(ctx, owner, aim, max);
    const dir0 = aim.dir.clone();
    for (let i = 0; i < n && w.ammo > 0; i++) {
      w.ammo--;
      const s = stats(ctx); if (s && owner.team === 'player') s.missiles++;
      const tgt = targets.length ? targets[i % targets.length] : null;
      const jx = rnd(ctx, -0.5, 0.5), jz = rnd(ctx, -0.5, 0.5);
      ctx.timers.after(i * (micro ? 0.05 : 0.09), () => {
        if (!owner.active || !owner.alive) return;
        const from = socket(owner, 'S', new THREE.Vector3());
        // VM-4: the prototype's upward launch; SW-8 micro-missiles leave flatter, led by the aim (a tighter swarm)
        const v = micro ? new THREE.Vector3(jx * 0.8, 0.55, jz * 0.8).normalize().multiplyScalar(30).addScaledVector(dir0, 45)
                        : new THREE.Vector3(jx, 1.0, jz).normalize().multiplyScalar(45).addScaledVector(dir0, 25);
        const live = tgt && tgt.alive ? tgt : null;
        const pr = ctx.projectiles?.fire({ pos: from, vel: v, dmg: st.dmg ?? 620, imp: st.imp ?? 260, team: team(), owner,
                                           kind: micro ? 'micro' : 'missile', target: live, turn: live ? (st.turn ?? 2.6) : 0,
                                           accel: st.accel ?? 110, maxSpeed: st.maxSpeed ?? 175, life: 5, srcKind: type,
                                           fuse: micro ? 4 : undefined });
        if (pr && !live) pr.vel.copy(dir0).multiplyScalar(140);
        sfx(ctx, 'missile', from);
      });
    }
  }

  // ---------------------------------------------------------------- mortar (arcing shells)
  function fireMortar(aim) {
    if (w.cd > 0 || w.ammo <= 0) { sfx(ctx, 'empty'); return; }
    w.cd = st.cd ?? 6;
    const g = st.gravity ?? 45;
    const aimAt = new THREE.Vector3();
    if (aim.lock && aim.lock.alive) aimAt.copy(aim.lock.pos);
    else aimAt.copy(aim.point);
    // clamp to 30..420 m from the owner
    _v.copy(aimAt).sub(owner.pos); _v.y = 0;
    const d = _v.length();
    if (d > 420) aimAt.copy(owner.pos).addScaledVector(_v.normalize(), 420);
    else if (d < 30) aimAt.copy(owner.pos).addScaledVector(d > 1e-3 ? _v.normalize() : aimDir(owner.yaw, 0, _f), 30);
    aimAt.y = groundAt(ctx, aimAt.x, aimAt.z);
    const n = st.count ?? 3;
    for (let i = 0; i < n && w.ammo > 0; i++) {
      w.ammo--;
      const s = stats(ctx); if (s && owner.team === 'player') s.shots++;
      const ox = rnd(ctx, -5, 5), oz = rnd(ctx, -5, 5);
      ctx.timers.after(i * 0.16, () => {
        if (!owner.active || !owner.alive) return;
        const from = socket(owner, 'S', new THREE.Vector3());
        const to = new THREE.Vector3(aimAt.x + ox, 0, aimAt.z + oz); to.y = groundAt(ctx, to.x, to.z);
        const D = Math.hypot(to.x - from.x, to.z - from.z);
        const T = clamp(D / 80 + 1.0, 1.4, 5.2);
        ctx.projectiles?.fire({ pos: from, vel: ballistic(from, to, g, T, new THREE.Vector3()), gravity: g, dmg: st.dmg ?? 900,
                                imp: st.imp ?? 500, splash: st.splash ?? 10, splashDmg: st.dmg ?? 900, team: team(), owner,
                                kind: 'mortar', life: T + 2, srcKind: 'mortar' });
        sfx(ctx, 'mortar', from);
        ctx.fx?.muzzle?.(from, UP_V, 'cannon');
      });
    }
  }

  // ---------------------------------------------------------------- repair kit
  function useKit() {
    if (w.ammo > 0 && !((owner.repairT || 0) > 0) && owner.ap < owner.apMax) {
      w.ammo--; owner.repairT = st.duration ?? 1.2; owner.repairRate = st.heal ?? 3600;
      const s = stats(ctx); if (s && owner.team === 'player') s.kits++;
      sfx(ctx, 'repair', owner.pos);
    } else sfx(ctx, 'empty');
  }

  // ---------------------------------------------------------------- harpoon (A5.1)
  function fireHarpoon(aim) {
    if (w.cd > 0 || w.state !== 'idle') return;
    w.cd = st.cd ?? 3.0;
    const from = socket(owner, 'L', _from).clone();
    const speed = st.speed ?? 220, range = st.range ?? 80;
    if (aim.lock && aim.lock.alive && aim.lock.center(_c).distanceTo(from) < range + 10) leadPoint(from, aim.lock, speed, _to);
    else _to.copy(aim.point);
    _dir.copy(_to).sub(from).normalize();
    w.state = 'flight';
    w.head = ctx.projectiles?.fire({
      pos: from, vel: _v.copy(_dir).multiplyScalar(speed), dmg: 0, imp: 0, team: team(), owner, kind: 'harpoon',
      life: range / speed, srcKind: 'harpoon',
      onHit: (p, hit) => harpoonHit(hit),
      onExpire: () => { w.state = 'idle'; w.head = null; },
    }) || null;
    w.headSerial = w.head?.serial;
    sfx(ctx, 'harpoon', from);
    ctx.fx?.muzzle?.(from, _dir, 'rail');
  }
  function harpoonHit(hit) {
    w.head = null;
    const C = ctx.combat, t = hit.target;
    const light = t && t.pos && (t.impMax ?? Infinity) <= (st.lightImpMax ?? 1000) && !t.boss && !t.immovable && t.vel;
    if (light) {
      const info = C?.damage(t, st.dmg ?? 300, st.imp ?? 2000, src('harpoon'));
      sfx(ctx, 'winch', t.pos);
      if (info && !info.killed && t.alive) {
        w.state = 'reel';
        const fromP = t.pos.clone();
        S.reels.push({ target: t, owner, weapon: w, t: 0, dur: st.reelTime ?? 0.6, dist: st.reelTo ?? 12, from: fromP, fromY: fromP.y });
        t.heldT = 0.1;
        return;
      }
      w.state = 'idle';
      return;
    }
    if (t && C) C.damage(t, st.dmg ?? 300, 0, src('harpoon'));
    // heavy, boss part, structure or the world: pull the owner to the point
    w.state = 'pull';
    owner.lunge = null;
    owner.pull = { point: hit.point.clone(), speed: st.pullSpeed ?? 70, stop: st.pullStop ?? 6, t: 0,
                   max: (st.range ?? 80) / (st.pullSpeed ?? 70) + 0.6, weapon: w, target: t || null };
    sfx(ctx, 'winch', owner.pos);
  }
  /** called by the player when its pull ends */
  w.pullDone = () => { if (w.state === 'pull') w.state = 'idle'; };

  function updateCable() {
    let a = null, b = null;
    if (w.state === 'idle') { if (cable) cable.visible = false; return; }
    if (!owner.rig || !owner.active) { if (cable) cable.visible = false; return; }
    a = socket(owner, 'L', _c);
    if (w.state === 'flight') b = w.head && w.head.alive && w.head.serial === w.headSerial ? w.head.pos : null;
    else if (w.state === 'reel') { const r = S.reels.find(x => x.weapon === w); b = r?.target?.alive ? r.target.center(_c2) : null; }
    else if (w.state === 'pull') b = owner.pull?.weapon === w ? owner.pull.point : null;
    if (!b) { w.state = 'idle'; w.head = null; if (cable) cable.visible = false; return; }   // head cleared, reel/pull over
    if (!cable) {
      const g = new THREE.CylinderGeometry(0.07, 0.07, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
      const m = ctx.materials?.get ? ctx.materials.get('cable') : new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.6 });
      cable = new THREE.Mesh(g, m); cable.name = 'harpoonCable'; cable.frustumCulled = false; cable.castShadow = false;
      ctx.scene.add(cable);
    }
    _v.copy(b).sub(a);
    const len = _v.length();
    if (len < 1e-3) { cable.visible = false; return; }
    cable.visible = true;
    cable.position.copy(a);
    cable.quaternion.setFromUnitVectors(_Z, _v.multiplyScalar(1 / len));
    cable.scale.set(1, 1, len);
  }

  // ---------------------------------------------------------------- flares (A5.1)
  function fireFlare(aim) {
    if (w.cd > 0) return;
    if (w.ammo <= 0) { sfx(ctx, 'empty'); return; }
    w.cd = st.cd ?? 2; w.ammo--;
    const from = socket(owner, 'S', _from).clone();
    const range = st.range ?? 60, g = 45;
    let vel;
    const lock = aim.lock && aim.lock.alive && aim.lock.center(_c).distanceTo(owner.pos) <= range * 1.5 ? aim.lock : null;
    if (lock || aim.hit !== false) {
      const P = lock ? lock.center(new THREE.Vector3()) : aim.point.clone();
      _v.copy(P).sub(from);
      const d = _v.length();
      if (d > range) P.copy(from).addScaledVector(_v.normalize(), range);
      const D = Math.hypot(P.x - from.x, P.z - from.z);
      vel = ballistic(from, P, g, clamp(D / 45 + 0.35, 0.45, 1.6), new THREE.Vector3());
    } else {
      aimDir(owner.yaw, 0, _f);
      vel = new THREE.Vector3(_f.x * 3, 42, _f.z * 3);   // nothing aimed: straight up
    }
    const decoy = { pos: from.clone(), alive: true, flare: true };
    const f = { decoy, state: 'flight', burn: 0, lightT: st.lightT ?? 30, lightR: st.lightR ?? 40, blind: st.blind ?? 4,
                attached: null, offset: null, emitter: null, proj: null, vis: flareVisual(ctx, S) };
    f.proj = ctx.projectiles?.fire({ pos: from, vel, gravity: g, dmg: 0, imp: 0, team: team(), owner, kind: 'flare', life: 8,
                                     srcKind: 'flares',
                                     onHit: (p, hit) => land(ctx, f, hit.point, hit.target),
                                     onExpire: (p) => land(ctx, f, p.pos, null) }) || null;
    f.serial = f.proj?.serial;
    S.flares.push(f);
    // hostile homing missiles within decoyR of the owner chase the flare instead
    const n = ctx.projectiles?.retarget?.({ near: owner.pos, r: st.decoyR ?? 30, hostileTo: team() }, decoy) ?? 0;
    w.lastDecoyed = n;
    sfx(ctx, 'missile', from);
    ctx.particles?.lights?.flash?.(from, 0xff6a80, 500, 25, 0.2);
  }

  return w;
}
const UP_V = new THREE.Vector3(0, 1, 0);
