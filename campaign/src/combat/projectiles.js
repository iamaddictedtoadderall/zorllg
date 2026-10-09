// combat/projectiles.js (P4): pooled projectiles drawn as one InstancedMesh per kind, swept against hostile targets
// (ctx.combat) in steps of at most 1.5 m and against the world (ctx.collision.segment), with homing (turn-rate limited,
// prototype), gravity arcs, splash, distance falloff, decoys (A5.1 retarget) and ground warnings (artillery).
//
// ProjectileSpec extras (optional, beyond §4): srcKind (DamageSource.kind, default the projectile kind), falloff
// ([full, quarter, max] metres from the muzzle), splashImp, onExpire(p), scale (visual), color-free.
// Projectile objects are pooled: a reference is valid until `alive` turns false.
import * as THREE from 'three';
import { isHostile } from './combat.js';

const MAX_STEP = 1.5;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Vector3(), _seg = new THREE.Vector3();
const _c = new THREE.Vector3(), _w = new THREE.Vector3(), _cur = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3(), _fwd = new THREE.Vector3(0, 0, 1);
const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
const _segOpts = { ground: true, colliders: true, radius: 0 };
const UP = new THREE.Vector3(0, 1, 0);

/** extra: aim point that leads a moving target (prototype leadPoint) */
export function leadPoint(from, target, speed, out = new THREE.Vector3()) {
  const c = target.center ? target.center(out) : out.copy(target.pos);
  const d = c.distanceTo(from), t = d / Math.max(1, speed);
  const v = target.vel;
  if (v) out.addScaledVector(v, t);
  return out;
}

/** target position for homing/proximity: a Target's centre, or a decoy's pos */
function aimPos(t, out) { return t.center ? t.center(out) : out.copy(t.pos); }

// visual recipes per kind: geometry builder, colour, additive?, capacity, orient along velocity
const KIND_DEFS = {
  bullet:  { cap: 512, glow: 0xffd28a, geo: () => new THREE.BoxGeometry(0.16, 0.16, 4.2), orient: true },
  ebullet: { cap: 512, glow: 0xff8a5a, geo: () => new THREE.BoxGeometry(0.2, 0.2, 3.6), orient: true },
  plasma:  { cap: 256, glow: 0xff4a2a, geo: () => new THREE.IcosahedronGeometry(0.75, 1), orient: false },
  shell:   { cap: 160, glow: 0xffb070, geo: () => new THREE.SphereGeometry(0.55, 8, 6).scale(1, 1, 2.2), orient: true },
  missile: { cap: 160, std: 0xcfc8bb, geo: () => new THREE.CylinderGeometry(0.22, 0.22, 1.6, 6).rotateX(Math.PI / 2), orient: true, flame: 1 },
  micro:   { cap: 192, std: 0xcfc8bb, geo: () => new THREE.CylinderGeometry(0.14, 0.14, 1.0, 5).rotateX(Math.PI / 2), orient: true, flame: 0.7 },
  rail:    { cap: 64,  glow: 0x9fd8ff, geo: () => new THREE.BoxGeometry(0.22, 0.22, 9), orient: true },
  mortar:  { cap: 96,  glow: 0xffa860, geo: () => new THREE.SphereGeometry(0.75, 8, 6), orient: false },
  flak:    { cap: 160, glow: 0xffc080, geo: () => new THREE.SphereGeometry(0.4, 6, 4), orient: false },
  harpoon: { cap: 8,   std: 0x3a3532, geo: () => new THREE.ConeGeometry(0.35, 2.2, 6).rotateX(Math.PI / 2), orient: true },
  flare:   { cap: 32,  glow: 0xff5a78, geo: () => new THREE.IcosahedronGeometry(0.55, 1), orient: false },
};
const EXPLODES = { missile: 0.7, micro: 0.45, shell: 0.6, mortar: 1.0, flak: 0.45 };   // prototype scales (missile, shell)
const IMPACT_KIND = { bullet: 'bullet', ebullet: 'bullet', plasma: 'plasma', rail: 'rail', harpoon: 'blade', flare: null };

export function install(ctx) {
  const list = [];        // alive projectiles
  const pool = [];        // free projectile objects
  const meshes = {};      // kind → { mesh, count, def }
  let flameMesh = null;
  const tlist = [];       // per-step candidate targets
  const warnings = [];    // ground warning rings { mesh, t, dur, r, alive }

  function mat(def) {
    const M = ctx.materials;
    if (def.glow != null) {
      const m = M?.glow ? M.glow(def.glow, 1) : new THREE.MeshBasicMaterial({ color: def.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      return m;
    }
    return M?.standard ? M.standard({ color: def.std, roughness: 0.5, metalness: 0.45 })
                       : new THREE.MeshStandardMaterial({ color: def.std, roughness: 0.5, metalness: 0.45 });
  }
  function meshFor(kind) {
    let r = meshes[kind];
    if (r) return r;
    const def = KIND_DEFS[kind] || KIND_DEFS.bullet;
    const geo = def.geo(); geo.userData.shared = true;
    const mesh = new THREE.InstancedMesh(geo, mat(def), def.cap);
    mesh.name = 'proj:' + kind;
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.persistent = true;
    ctx.scene.add(mesh);
    r = meshes[kind] = { mesh, count: 0, def };
    if (def.flame && !flameMesh) {
      const g = new THREE.SphereGeometry(0.5, 8, 6); g.scale(1, 1, 2.4); g.userData.shared = true;
      const fm = ctx.materials?.glow ? ctx.materials.glow(0xffa040, 0.9)
                                     : new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      flameMesh = new THREE.InstancedMesh(g, fm, 352);
      flameMesh.name = 'proj:flame'; flameMesh.frustumCulled = false; flameMesh.count = 0; flameMesh.visible = false;
      flameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      ctx.scene.add(flameMesh);
    }
    return r;
  }

  function newProj() {
    return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), origin: new THREE.Vector3(), alive: false, age: 0,
             team: 'enemy', owner: null, kind: 'bullet', dmg: 0, imp: 0, life: 3, target: null, turn: 0, accel: 0, maxSpeed: 0,
             gravity: 0, splash: 0, splashDmg: 0, splashImp: 0, onHit: null, onExpire: null, srcKind: null, falloff: null, scale: 1 };
  }

  function release(p, i) {
    p.alive = false; p.target = null; p.owner = null; p.onHit = null; p.onExpire = null; p.falloff = null;
    if (i == null) i = list.indexOf(p);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    pool.push(p);
  }

  function falloffMul(p, point) {
    const f = p.falloff;
    if (!f) return 1;
    const d = point.distanceTo(p.origin);
    const [full, quarter, max] = f;
    if (d <= full) return 1;
    if (d <= quarter) return 1 - 0.75 * (d - full) / Math.max(1e-3, quarter - full);
    return d <= max ? 0.25 : 0;
  }

  /** resolve a projectile's end: target hit, world hit or expiry */
  function detonate(p, point, target, normal, surface, decoy) {
    const C = ctx.combat;
    const src = { team: p.team, owner: p.owner || undefined, kind: p.srcKind || p.kind, pos: point.clone() };
    const mul = falloffMul(p, point);
    if (target && C && p.dmg > 0 && mul > 0) {
      C.damage(target, p.dmg * mul, p.imp * mul, src);
      if (p.team === 'player') ctx.audio?.play?.('hit', point);
    } else if (target && C && p.imp > 0 && mul > 0) {
      C.damage(target, 0, p.imp * mul, src);
    }
    if (p.splash > 0 && C) {
      C.radial(point, p.splash, p.splashDmg || p.dmg, p.splashImp || p.imp * 0.5, src, { exclude: target || undefined });
    }
    const ex = EXPLODES[p.kind];
    if (ex) ctx.fx?.explosion?.(src.pos, ex * (p.scale || 1), { decal: !target && !decoy });
    else {
      const ik = IMPACT_KIND[p.kind];
      if (ik && (target || normal)) ctx.fx?.impact?.(src.pos, normal, ik, target ? 'metal' : (surface || 'ground'));
    }
    if (p.onHit) {
      try { p.onHit(p, { target: target || null, point, normal: normal || null, surface: target ? 'metal' : (surface || 'ground'), decoy: decoy || null }); }
      catch (e) { ctx.recordError?.('projectiles', e); }
    }
  }

  const api = {
    fire(spec) {
      const p = pool.pop() || newProj();
      p.pos.copy(spec.pos); p.vel.copy(spec.vel); p.origin.copy(spec.pos);
      p.team = spec.team || 'enemy'; p.owner = spec.owner || null; p.kind = KIND_DEFS[spec.kind] ? spec.kind : 'bullet';
      p.dmg = spec.dmg ?? 0; p.imp = spec.imp ?? 0; p.life = spec.life ?? 3; p.target = spec.target || null;
      p.turn = spec.turn ?? 0; p.accel = spec.accel ?? 0; p.maxSpeed = spec.maxSpeed ?? 0; p.gravity = spec.gravity ?? 0;
      p.splash = spec.splash ?? 0; p.splashDmg = spec.splashDmg ?? 0; p.splashImp = spec.splashImp ?? 0;
      p.onHit = spec.onHit || null; p.onExpire = spec.onExpire || null; p.srcKind = spec.srcKind || null;
      p.falloff = spec.falloff || null; p.scale = spec.scale ?? 1;
      p.alive = true; p.age = 0;
      list.push(p);
      meshFor(p.kind);
      return p;
    },
    update(dt) {
      if (dt <= 0) { render(); return; }
      const C = ctx.combat, col = ctx.collision, targets = C?.targets || [];
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (!p.alive) { release(p, i); continue; }
        p.age += dt;
        // homing (prototype): rotate toward the target at `turn` rad/s, accelerate up to maxSpeed
        const tg = p.target;
        if (tg && p.turn > 0) {
          if (tg.alive) {
            const want = aimPos(tg, _w).sub(p.pos);
            const wl = want.length();
            if (wl > 1e-4) {
              want.multiplyScalar(1 / wl);
              const sp = p.vel.length(); _cur.copy(p.vel).multiplyScalar(1 / (sp || 1));
              const ang = _cur.angleTo(want), maxA = p.turn * dt;
              if (ang > 1e-4) _cur.lerp(want, Math.min(1, maxA / ang)).normalize();
              p.vel.copy(_cur).multiplyScalar(p.maxSpeed > 0 ? Math.min(p.maxSpeed, sp + p.accel * dt) : sp + p.accel * dt);
            }
          }
        } else if (p.accel > 0 && p.maxSpeed > 0) {
          const sp = p.vel.length();
          if (sp > 1e-4 && sp < p.maxSpeed) p.vel.multiplyScalar(Math.min(p.maxSpeed, sp + p.accel * dt) / sp);
        }
        if (p.gravity) p.vel.y -= p.gravity * dt;
        if (p.kind === 'missile' || p.kind === 'micro') ctx.fx?.missileTrail?.(p.pos, p.vel);

        // sweep this frame's segment
        _a.copy(p.pos); _b.copy(p.pos).addScaledVector(p.vel, dt);
        const L = _a.distanceTo(_b);
        let tWorld = 1, worldHit = null;
        if (col?.segment && L > 1e-6) {
          const h = col.segment(_a, _b, _hit, _segOpts);
          if (h) { tWorld = h.t; worldHit = h; }
        }
        // broad phase: hostile targets whose XZ footprint is near the segment
        tlist.length = 0;
        if (C) {
          const dx = _b.x - _a.x, dz = _b.z - _a.z, l2 = dx * dx + dz * dz;
          for (let k = 0; k < targets.length; k++) {
            const t = targets[k];
            if (!t.alive || t.targetable === false || t === p.owner || !isHostile(p.team, t.team)) continue;
            const r = (t.hitR || 2.5) * 1.3 + 2;
            let px = t.pos.x - _a.x, pz = t.pos.z - _a.z;
            const u = l2 > 1e-9 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / l2)) : 0;
            px -= dx * u; pz -= dz * u;
            if (px * px + pz * pz <= r * r) tlist.push(t);
          }
        }
        let hitT = null;
        const decoyProx = tg && p.turn > 0 && tg.alive && !tg.center;   // decoys: detonate on proximity
        if (tlist.length || (tg && p.turn > 0 && tg.alive)) {
          const span = L * tWorld;
          const steps = Math.max(1, Math.ceil(span / MAX_STEP));
          _seg.copy(_b).sub(_a).multiplyScalar(tWorld / steps);
          _q.copy(_a);
          for (let s = 0; s < steps && !hitT; s++) {
            _q.add(_seg);
            for (let k = 0; k < tlist.length; k++) if (tlist[k].hitTest(_q)) { hitT = tlist[k]; break; }
            if (!hitT && tg && p.turn > 0 && tg.alive && aimPos(tg, _c).distanceToSquared(_q) < 3.2 * 3.2) {
              if (decoyProx) { p.pos.copy(_q); detonate(p, p.pos, null, null, 'ground', tg); release(p, i); hitT = 'decoy'; break; }
              if (tg.team === undefined || isHostile(p.team, tg.team)) hitT = tg;
            }
          }
          if (hitT === 'decoy') continue;
          if (hitT) {
            p.pos.copy(_q);
            _n.copy(p.vel).normalize().negate();
            detonate(p, p.pos, hitT, _n, 'metal');
            release(p, i);
            continue;
          }
        }
        if (worldHit) {
          p.pos.copy(worldHit.point);
          // a collider that belongs to a hostile target (turret base, beacon, destructible structure) counts as hitting it
          const ow = worldHit.collider?.owner, ct = ow ? (ow.hitTest ? ow : ow.target) : null;
          if (ct && ct.alive && ct.targetable !== false && ct !== p.owner && ct.team !== undefined && isHostile(p.team, ct.team)) {
            detonate(p, p.pos, ct, worldHit.normal, 'metal');
            release(p, i);
            continue;
          }
          detonate(p, p.pos, null, worldHit.normal, worldHit.surface || (worldHit.ground ? 'ground' : 'concrete'));
          release(p, i);
          continue;
        }
        p.pos.copy(_b);
        if (p.age >= p.life) {
          // prototype: missiles and shells burst when their fuel/fuse runs out
          if (EXPLODES[p.kind]) detonate(p, p.pos, null, null, 'ground');
          if (p.onExpire) { try { p.onExpire(p); } catch (e) { ctx.recordError?.('projectiles', e); } }
          release(p, i);
        }
      }
      updateWarnings(dt);
      render();
    },
    incoming(target, range = 220) {
      if (!target) return false;
      const r2 = range * range;
      for (const p of list) {
        if (p.alive && p.target === target && p.turn > 0 && isHostile(p.team, target.team) && p.pos.distanceToSquared(target.pos) < r2) return true;
      }
      return false;
    },
    forEach(cb) { for (let i = 0; i < list.length; i++) if (list[i].alive) cb(list[i]); },
    /** A5.1: homing projectiles near `near` switch to `decoy` ({ pos, alive }). Returns how many switched. */
    retarget(f = {}, decoy) {
      if (!decoy || !f.near) return 0;
      const r2 = (f.r ?? 30) * (f.r ?? 30);
      let n = 0;
      for (const p of list) {
        if (!p.alive || !p.target || !(p.turn > 0)) continue;
        if (f.team && p.team !== f.team) continue;
        if (f.hostileTo && !isHostile(p.team, f.hostileTo)) continue;
        if (f.from && p.target !== f.from) continue;
        if (p.pos.distanceToSquared(f.near) > r2) continue;
        p.target = decoy; n++;
      }
      return n;
    },
    /** extra: a pulsing ground ring that warns of an incoming strike (artillery, barrages). Returns { stop() }. */
    groundWarning(pos, radius = 10, seconds = 2) {
      let w = warnings.find(x => !x.alive);
      if (!w) {
        if (warnings.length >= 32) w = warnings[0];
        else {
          const g = new THREE.RingGeometry(0.82, 1, 40, 1).rotateX(-Math.PI / 2); g.userData.shared = true;
          const m = new THREE.Mesh(g, ctx.materials?.glow ? ctx.materials.glow(0xff3a20, 0.85)
                                                       : new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          const g2 = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2); g2.userData.shared = true;
          const fill = new THREE.Mesh(g2, ctx.materials?.glow ? ctx.materials.glow(0xff2a10, 0.22)
                                                              : new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
          m.add(fill); m.name = 'groundWarning'; m.renderOrder = 4; m.frustumCulled = false;
          ctx.scene.add(m);
          w = { mesh: m, fill, t: 0, dur: 0, r: 1, alive: false };
          warnings.push(w);
        }
      }
      const gh = ctx.collision?.groundHeight ? ctx.collision.groundHeight(pos.x, pos.z) : pos.y;
      w.mesh.position.set(pos.x, Math.max(gh, pos.y - 2) + 0.35, pos.z);
      w.r = radius; w.t = 0; w.dur = seconds; w.alive = true; w.mesh.visible = true;
      w.mesh.scale.setScalar(radius);
      return { stop() { w.alive = false; w.mesh.visible = false; } };
    },
    /** extra: live ground warnings */
    get warnings() { let n = 0; for (const w of warnings) if (w.alive) n++; return n; },
    clear() {
      for (let i = list.length - 1; i >= 0; i--) release(list[i], i);
      for (const w of warnings) { w.alive = false; w.mesh.visible = false; }
      render();
    },
    get count() { return list.length; },
  };

  function updateWarnings(dt) {
    for (const w of warnings) {
      if (!w.alive) continue;
      w.t += dt;
      if (w.t >= w.dur) { w.alive = false; w.mesh.visible = false; continue; }
      const k = w.t / w.dur;
      // the ring tightens and pulses faster as the strike lands
      const pulse = 0.5 + 0.5 * Math.sin(w.t * (8 + 16 * k));
      w.mesh.scale.setScalar(w.r * (1.15 - 0.15 * k));
      w.fill.scale.setScalar(0.2 + 0.8 * k);
      w.mesh.visible = pulse > 0.15 || k > 0.8;
    }
  }

  function render() {
    for (const k in meshes) meshes[k].count = 0;
    let fc = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      const r = meshes[p.kind] || meshFor(p.kind);
      if (r.count >= r.def.cap) continue;
      const sp = p.vel.length();
      if (r.def.orient && sp > 1e-4) _quat.setFromUnitVectors(_fwd, _cur.copy(p.vel).multiplyScalar(1 / sp));
      else _quat.identity();
      _scl.setScalar(p.scale || 1);
      _m.compose(p.pos, _quat, _scl);
      r.mesh.setMatrixAt(r.count++, _m);
      if (r.def.flame && flameMesh && fc < 352) {
        // the motor glow sits behind the body
        _c.copy(p.pos).addScaledVector(_cur, -(r.def.flame * 1.1));
        _scl.setScalar(r.def.flame * (0.8 + 0.4 * Math.random()));
        _m.compose(_c, _quat, _scl);
        flameMesh.setMatrixAt(fc++, _m);
      }
    }
    for (const k in meshes) {
      const r = meshes[k];
      r.mesh.count = r.count; r.mesh.visible = r.count > 0;
      if (r.count) r.mesh.instanceMatrix.needsUpdate = true;
    }
    if (flameMesh) { flameMesh.count = fc; flameMesh.visible = fc > 0; if (fc) flameMesh.instanceMatrix.needsUpdate = true; }
  }

  for (const k in KIND_DEFS) meshFor(k);   // build every kind's mesh up front (hidden until used)
  ctx.events.on('level:cleared', () => api.clear());
  ctx.addSystem({ name: 'projectiles', phase: 'physics', when: 'sim', update: (dt) => api.update(dt) });
  ctx.projectiles = api;
  return api;
}
