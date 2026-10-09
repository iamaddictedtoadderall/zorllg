// core/camera.js (P0): camera rig. Follow (port of the prototype's updateCamera), orbit, cinematic poses and blends,
// a debug free-fly camera, shake, the aim ray and world→screen projection.
//
// Clocks (§1.4). blendTo(), release() and setFov() tweens run on the clock that was running when they started: sim time
// when ctx.simRunning was true (or o.clock === 'sim'), real time otherwise (or o.clock === 'real'). Sim-clock tweens
// advance in the 'cameraRig-sim' system (camera phase, when 'sim', before 'cameraRig'), so they use the engine's sim dt,
// scale with ctx.timeScale and freeze while the sim is stopped (paused, interstitial, loading, dead). Real-clock tweens
// advance in the 'cameraRig' system (always). Free fly, orbit, follow damping and shake decay stay on real time.
// blendTo() returns a simDeferred() promise (core/util.js) that settles inside the tick that finishes the blend, so a
// mission list or a shot waiting on it resumes in that tick whatever the step() chunking. A blend that is superseded
// (blendTo, setPose, orbit, release, setFree(true)) or dropped (player respawn, level unload) counts as finished; its
// promise settles after the new state is in place, so a waiter that starts another blend at that moment is safe.
import * as THREE from 'three';
import { clamp, damp, smooth, aimDir, lerp, hashString, simDeferred } from './util.js';

const _aim = new THREE.Vector3(), _pivot = new THREE.Vector3(), _pos = new THREE.Vector3(), _look = new THREE.Vector3();
const _a = new THREE.Vector3(), _dir = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _hit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null, ground: false, surface: '' };
const _segOpts = { ground: true, colliders: true, radius: 0.6 };

// deterministic shake jitter (gameplay may aim along the camera, so no Math.random here)
function jitter(t, k) { const h = hashString(`${Math.floor(t * 60)}:${k}`); return (h / 4294967295) * 2 - 1; }

export function install(ctx) {
  const cam = ctx.camera;
  const basePos = new THREE.Vector3(0, 20, 30), baseLook = new THREE.Vector3(0, 5, 0);
  const blendFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), t: 1, dur: 0, clock: 'real' };
  const cine = { fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), toPos: new THREE.Vector3(), toLook: new THREE.Vector3(),
                 fromFov: 66, toFov: 66, t: 1, dur: 0, ease: 'inOut', clock: 'real', resolve: null };
  const orbitState = { center: new THREE.Vector3(), radius: 30, height: 10, speed: 0.1, angle: 0, lookOffset: new THREE.Vector3() };
  const free = { yaw: 0, pitch: 0, prevMode: 'follow' };
  const fovTween = { from: 66, to: 66, t: 1, dur: 0, clock: 'real' };
  let camDist = 0, snap = true;
  /** the clock a tween runs on: o.clock when given, else the one running now */
  const clockOf = (o) => (o && (o.clock === 'sim' || o.clock === 'real')) ? o.clock : (ctx.simRunning ? 'sim' : 'real');

  const rig = {
    mode: 'follow',
    focus: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    shake: 0,
    target: null,
    baseFov: ctx.settings.get('fov'),

    addShake(amount) {
      const s = ctx.settings.get('reducedMotion') ? 0 : ctx.settings.get('cameraShake');
      rig.shake = Math.max(rig.shake, clamp(amount, 0, 2.2) * s);
    },
    follow(target) {
      if (target !== rig.target) snap = true;
      rig.target = target;
      if (rig.mode !== 'cinematic' && rig.mode !== 'free') rig.mode = 'follow';
    },
    orbit(center, radius, height, speed, lookOffset) {
      const prev = takeCine();
      orbitState.center.copy(center); orbitState.radius = radius; orbitState.height = height; orbitState.speed = speed;
      orbitState.lookOffset.set(0, 0, 0); if (lookOffset) orbitState.lookOffset.copy(lookOffset);
      orbitState.angle = Math.atan2(basePos.z - center.z, basePos.x - center.x) || 0;
      rig.mode = 'orbit';
      prev?.();
    },
    setPose(pos, look, fov) {
      const prev = takeCine();
      rig.mode = 'cinematic';
      cine.toPos.copy(pos); cine.toLook.copy(look); cine.t = 1; cine.dur = 0;
      basePos.copy(pos); baseLook.copy(look);
      if (fov) rig.setFov(fov, 0);
      apply();
      prev?.();
    },
    /**
     * Blend to a cinematic pose over `seconds` of the tween clock (header). `o.clock` ('sim' | 'real') overrides the
     * default (the clock running now); shots and level scripts that may start while the sim is stopped (mission.start
     * runs def.start during loading) pass { clock: 'sim' }. Returns a simDeferred() promise.
     */
    blendTo(pos, look, seconds, fov, ease = 'inOut', o) {
      const prev = takeCine();
      rig.mode = 'cinematic';
      cine.fromPos.copy(basePos); cine.fromLook.copy(baseLook); cine.toPos.copy(pos); cine.toLook.copy(look);
      cine.fromFov = cam.fov; cine.toFov = fov || cam.fov; cine.t = 0; cine.dur = Math.max(1e-3, seconds || 0);
      cine.ease = ease || 'inOut'; cine.clock = clockOf(o);
      const d = simDeferred();
      cine.resolve = d.resolve;
      prev?.();   // the superseded blend counts as finished
      return d.promise;
    },
    release(seconds = 0.8, o) {
      const prev = takeCine();
      blendFrom.pos.copy(basePos); blendFrom.look.copy(baseLook); blendFrom.t = 0; blendFrom.dur = Math.max(1e-3, seconds);
      blendFrom.clock = clockOf(o);
      if (cam.fov !== rig.baseFov) rig.setFov(rig.baseFov, seconds, o);
      rig.mode = 'follow';
      prev?.();
    },
    setFree(on, pose) {
      if (on) {
        if (rig.mode !== 'free') free.prevMode = rig.mode;
        const prev = takeCine();
        rig.mode = 'free';
        if (pose?.pos) basePos.copy(pose.pos);
        if (pose?.look) baseLook.copy(pose.look);
        _dir.copy(baseLook).sub(basePos);
        if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
        _dir.normalize();
        free.yaw = Math.atan2(-_dir.x, -_dir.z); free.pitch = Math.asin(clamp(_dir.y, -1, 1));
        apply();
        prev?.();
      } else if (rig.mode === 'free') {
        rig.mode = free.prevMode === 'free' || free.prevMode === 'cinematic' ? 'follow' : free.prevMode;
        snap = true;
      }
    },
    setFov(fov, seconds = 0, o) {
      if (!(fov > 1)) return;
      if (!(seconds > 0)) { fovTween.t = 1; cam.fov = fov; cam.updateProjectionMatrix(); return; }
      fovTween.from = cam.fov; fovTween.to = fov; fovTween.t = 0; fovTween.dur = seconds; fovTween.clock = clockOf(o);
    },
    /** centre-screen ray from the un-shaken camera pose */
    aimRay(outOrigin, outDir) {
      outOrigin.copy(basePos);
      outDir.copy(baseLook).sub(basePos);
      if (outDir.lengthSq() < 1e-9) outDir.set(0, 0, -1);
      outDir.normalize();
    },
    /** CSS pixels relative to the canvas */
    worldToScreen(p, out) {
      _proj.copy(p).project(cam);
      const w = ctx.canvas.clientWidth || innerWidth, h = ctx.canvas.clientHeight || innerHeight;
      out.x = (_proj.x * 0.5 + 0.5) * w; out.y = (-_proj.y * 0.5 + 0.5) * h; out.behind = _proj.z > 1;
      return out;
    },
    /** system 'cameraRig' (always, real dt): real-clock tweens, then the pose for the current mode */
    update(dt) {
      advance('real', dt);
      if (rig.mode === 'free') updateFree(dt);
      else if (rig.mode === 'cinematic') updateCine();
      else if (rig.mode === 'orbit') updateOrbit(dt);
      else updateFollow(dt);
      apply(dt);
    },
  };

  /** stops the cinematic blend and detaches its resolver; the caller settles it once its own state is in place */
  function takeCine() {
    const r = cine.resolve;
    cine.resolve = null; cine.t = 1;
    return r;
  }

  /** advances the tweens that run on `clock` ('sim' from 'cameraRig-sim', 'real' from 'cameraRig') */
  function advance(clock, dt) {
    if (fovTween.t < 1 && fovTween.clock === clock) {
      fovTween.t = Math.min(1, fovTween.t + dt / fovTween.dur);
      cam.fov = lerp(fovTween.from, fovTween.to, smooth(0, 1, fovTween.t));
      cam.updateProjectionMatrix();
    }
    if (blendFrom.t < 1 && blendFrom.clock === clock && rig.mode === 'follow') {
      blendFrom.t = Math.min(1, blendFrom.t + dt / blendFrom.dur);
    }
    if (cine.t < 1 && cine.clock === clock && rig.mode === 'cinematic') {
      cine.t = Math.min(1, cine.t + dt / cine.dur);
      const k = cine.ease === 'linear' ? cine.t : smooth(0, 1, cine.t);
      basePos.lerpVectors(cine.fromPos, cine.toPos, k);
      baseLook.lerpVectors(cine.fromLook, cine.toLook, k);
      if (cine.toFov !== cine.fromFov) { cam.fov = lerp(cine.fromFov, cine.toFov, k); cam.updateProjectionMatrix(); }
      // settles inside this tick (simDeferred): waiters resume now, with the final pose already applied
      if (cine.t >= 1 && cine.resolve) { const r = cine.resolve; cine.resolve = null; r(); }
    }
  }

  function updateFollow(dt) {
    const p = rig.target;
    if (!p || !p.pos) return;
    _pivot.set(p.pos.x, p.pos.y + 7.2, p.pos.z);
    aimDir(p.yaw || 0, p.pitch || 0, _aim);
    const hs = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
    const dist = 15 + clamp(hs - 30, 0, 60) * 0.06;
    camDist = snap ? dist : damp(camDist || dist, dist, 4, dt);
    _pos.copy(_pivot).addScaledVector(_aim, -camDist);
    _pos.y += 1.6;
    const gh = groundHeight(_pos.x, _pos.z) + 1.5;
    if (_pos.y < gh) _pos.y = gh;
    // clearance: pull in toward the pivot, never clip through colliders or terrain
    const col = ctx.collision;
    if (col && col.segment) {
      const h = col.segment(_pivot, _pos, _hit, _segOpts);
      if (h && h.t < 1) {
        const d = _pos.distanceTo(_pivot) * h.t;
        _pos.copy(_pivot).addScaledVector(_dir.copy(_pos).sub(_pivot).normalize(), Math.max(1.5, d - 0.8));
      }
    }
    _look.copy(_pivot).addScaledVector(_aim, 60);
    if (blendFrom.t < 1) {   // release() blend back to follow; advanced by advance() on its clock
      const k = smooth(0, 1, blendFrom.t);
      _pos.lerpVectors(blendFrom.pos, _pos, k);
      _look.lerpVectors(blendFrom.look, _look, k);
    }
    basePos.copy(_pos); baseLook.copy(_look);
    rig.focus.copy(p.pos);
    rig.lookTarget.copy(_look);
    snap = false;
  }

  function updateOrbit(dt) {
    const o = orbitState;
    o.angle += o.speed * dt;
    basePos.set(o.center.x + Math.cos(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.sin(o.angle) * o.radius);
    baseLook.copy(o.center).add(o.lookOffset);
    rig.focus.copy(baseLook); rig.lookTarget.copy(baseLook);
  }

  /** cinematic mode: the pose is set by setPose() or by the blend in advance() */
  function updateCine() {
    rig.focus.copy(baseLook); rig.lookTarget.copy(baseLook);
  }

  function updateFree(dt) {
    const inp = ctx.input;
    const look = inp.lookRaw || inp.look;   // mouse deltas only accumulate while the pointer is locked
    free.yaw -= (look.dx || 0) * 0.0022 * ctx.settings.get('sens');
    free.pitch = clamp(free.pitch - (look.dy || 0) * 0.0022 * ctx.settings.get('sens'), -1.5, 1.5);
    aimDir(free.yaw, free.pitch, _fwd);
    _right.set(Math.cos(free.yaw), 0, -Math.sin(free.yaw));
    let speed = 40 * (inp.key('ShiftLeft') || inp.key('ShiftRight') ? 4 : 1);
    const mv = _a.set(0, 0, 0);
    if (inp.key('KeyW')) mv.add(_fwd);
    if (inp.key('KeyS')) mv.sub(_fwd);
    if (inp.key('KeyD')) mv.add(_right);
    if (inp.key('KeyA')) mv.sub(_right);
    if (inp.key('KeyQ')) mv.y += 1;
    if (inp.key('KeyE')) mv.y -= 1;
    if (mv.lengthSq() > 0) basePos.addScaledVector(mv.normalize(), speed * dt);
    baseLook.copy(basePos).add(_fwd);
    rig.focus.copy(basePos); rig.lookTarget.copy(baseLook);
  }

  function groundHeight(x, z) {
    return ctx.world?.groundHeight ? ctx.world.groundHeight(x, z) : (ctx.collision?.groundHeight?.(x, z) ?? 0);
  }

  function apply(dt = 0) {
    cam.position.copy(basePos);
    if (rig.shake > 0) {
      const t = ctx.clock.time + ctx.clock.realTime * (ctx.simRunning ? 0 : 1);
      cam.position.x += jitter(t, 1) * rig.shake * 0.5;
      cam.position.y += jitter(t, 2) * rig.shake * 0.5;
      rig.shake = Math.max(0, rig.shake - dt * 3);
    }
    cam.lookAt(baseLook);
    cam.updateMatrixWorld();
  }

  // A (re)spawn or an unload drops any cinematic or orbit pose: the shot that would have released it belonged to the
  // stopped mission (a checkpoint restart from the pause menu mid-shot must not leave the camera stuck). Free fly stays.
  function dropShot() {
    const prev = takeCine();
    if (fovTween.t < 1) { fovTween.t = 1; cam.fov = fovTween.to; cam.updateProjectionMatrix(); }   // finish, don't freeze mid-way
    if (rig.mode === 'cinematic' || rig.mode === 'orbit') {
      rig.mode = 'follow';
      if (cam.fov !== rig.baseFov) rig.setFov(rig.baseFov, 0);
    }
    prev?.();
  }
  ctx.events.on('player:spawned', () => { snap = true; rig.shake = 0; blendFrom.t = 1; dropShot(); });
  ctx.events.on('level:cleared', () => { dropShot(); if (rig.mode !== 'free') rig.mode = 'follow'; rig.target = null; rig.shake = 0; });
  ctx.events.on('settings:changed', ({ key, value }) => {
    if (key === 'fov') { rig.baseFov = value; if (rig.mode === 'follow') rig.setFov(value, 0.3); }
  });

  // sim-clock tweens first (sim dt, skipped while the sim is stopped), then the pose (always)
  ctx.addSystem({ name: 'cameraRig-sim', phase: 'camera', when: 'sim', order: -10, update: (dt) => advance('sim', dt) });
  ctx.addSystem({ name: 'cameraRig', phase: 'camera', when: 'always', update: (dt) => rig.update(dt) });
  ctx.cameraRig = rig;
  return rig;
}
