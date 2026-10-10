// levels/level01/drown.js (P6) — the signature set piece as ONE custom action (L1 §7.1, §7.2): the auger falls, the
// boiler shock, the sunrise and its light wall, the floe split, the drowning (vitals race, flat line, 4 s of black with
// "Hold on to me.", the HUD reboot at 60), until control returns underwater. Times are sim seconds:
//   T: from the death of the bow head (the action starts), phase A;
//   t: from entering the water (phase B starts once the player is in the water and the wall has passed them, or T 9.5).
// The action returns a simDeferred() promise that resolves when control returns (t 36). Everything runs from update(dt)
// in the level runtime's mission-phase system, so a restart (mission.stop) simply drops it (the runtime resets it).
// AP isn't drained during the drowning (player.invuln); the boiler shock at T 0.5 is the only damage.
import * as THREE from 'three';
import { simDeferred, clamp, damp, dampAng, yawTo } from '../../src/core/util.js';
import { LightWall } from './sunrise.js';
import { bubbles, splash } from './water.js';
import { mats, slab } from './kit.js';
import { coneGeo, coneMat } from './structures.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Drown {
  /**
   * @param L the level runtime
   * @param a args: { comms: { sunrise, changing, fall, drown }, art: { dawn, water }, music: { drone, rise } }
   */
  constructor(L, a = {}) {
    this.L = L; this.a = a;
    const d = simDeferred();
    this.promise = d.promise; this.resolve = d.resolve;
    this.T = 0; this.t = -1; this.phase = 'A'; this.active = true;
    this.cuesA = this.makeCuesA(); this.cuesB = this.makeCuesB();
    this.lines = (L.ctx.mission?.def?.comms?.[a.comms?.drown] || []).filter(l => l && 'text' in l);
    this.auger = null; this.halves = []; this.throwT = 0; this.wall = null; this.split = false;
    this.beatT = 0; this.bpm = 150; this.heart = true; this.breachT = 0; this.sinkTo = -48;
    this.godRay = null;
  }
  // ── helpers ──
  get ctx() { return this.L.ctx; }
  get p() { return this.L.ctx.player; }
  comms(id) { const c = this.ctx.mission?.def?.comms?.[id]; if (c) this.ctx.comms?.play?.(c); }
  line(i) { const l = this.lines[i]; if (l) this.ctx.comms?.play?.([l]); }
  inWater() { return this.L.water?.state === 'water' || (this.p?.active && this.p.pos.y < this.L.DATA.sea - 1 && this.L.water?.inWater(this.p.pos)); }

  // ── phase A: T from the bow head's death ──
  makeCuesA() {
    return [
      [0, () => this.augerFalls()],
      [0.5, () => this.boilerShock()],
      [1.5, () => this.sunrise()],
      [6.0, () => this.comms(this.a.comms?.changing)],
    ];
  }
  augerFalls() {
    const ctx = this.ctx, L = this.L, ib = L.icebreaker, p = this.p;
    this.L.music(this.a.music?.drone);
    const from = ib?.heads?.B?.pos?.clone() ?? (p?.active ? p.pos.clone().add(_v.set(20, 30, 0)) : new THREE.Vector3());
    // falls onto the Raft 20 m from the player, or onto the player's floe when within 40 m of the bow
    let to;
    const F = L.floes;
    if (p?.active && F) {
      const near = p.pos.distanceTo(from) < 40;
      const i0 = F.floeAt(p.pos.x, p.pos.z);
      if (near && i0 >= 0) to = F.floePos(i0, new THREE.Vector3());
      else {
        const dx = from.x - p.pos.x, dz = from.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        _v.set(p.pos.x + dx / d * 20, 0, p.pos.z + dz / d * 20);
        const i = F.nearestFloe(_v.x, _v.z, true);
        to = i != null ? F.floePos(i, new THREE.Vector3()) : _v.clone().setY(L.DATA.floeTop);
        this.augerFloe = i;
      }
    } else to = from.clone().setY(L.DATA.floeTop);
    // the falling auger: a copy of the part's meshes at its world transform
    if (ib?.parts?.auger) {
      const src = ib.parts.auger;
      src.updateMatrixWorld(true);
      const obj = src.clone(true);
      src.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
      ctx.levelRoot.add(obj);
      this.auger = { obj, from: obj.position.clone(), to, t: 0, dur: 1.3, landed: false, spin: new THREE.Vector3(1.1, 0.3, 0.8) };
    }
    ib?.finale?.();
    ctx.fx?.explosion?.(from, 2.6);
    ctx.fx?.sparks?.(from, 40, [1, 0.8, 0.4], 30);
    this.steam = ctx.fx?.emitter?.('steam', from, { rate: 2.5, scale: 2.2 });
    ctx.audio?.play?.('metalGroan', from);
    ctx.cameraRig?.addShake?.(0.8);
  }
  boilerShock() {
    const ctx = this.ctx, p = this.p, ib = this.L.icebreaker;
    const c = ib ? ib.pos.clone().setY(ib.pos.y + 8) : (p?.active ? p.pos.clone() : new THREE.Vector3());
    ctx.fx?.shockwave?.(c, 400, '#ffd9a0', 1.6);
    ctx.fx?.explosion?.(c, 2.2);
    ctx.audio?.play?.('boom', c);
    ctx.cameraRig?.addShake?.(1.4);
    this.steam?.set?.({ rate: 4, scale: 3 });
    if (p?.active && p.alive && p.pos.distanceTo(c) < 400) {
      ctx.combat?.damage?.(p, 600, 3000, { team: 'enemy', owner: ib || null, kind: 'shock', pos: c });
      if (p.pos.x < 655) { this.throwT = 1.8; p.vel.y = Math.max(p.vel.y, 10); p.onGround = false; }
      else if (!p.onGround) p.vel.y = Math.min(p.vel.y, -12);   // a hovering player is knocked down
    }
  }
  sunrise() {
    const ctx = this.ctx, L = this.L;
    ctx.hud?.letterbox?.(true, 0.8);
    this.comms(this.a.comms?.sunrise);
    L.sunElev = L.DATA.sunClock.from;
    this.wall = new LightWall(L, { from: 2600, speed: 260, azimuth: L.DATA.sunClock.azimuth, onPlayer: () => this.wallAtPlayer() });
    L.wall = this.wall;
    // the art blend's midpoint falls when the wall reaches the player
    const eta = this.wall.etaPlayer();
    if (this.a.art?.dawn) ctx.atmosphere?.set?.(this.a.art.dawn, Math.max(4, 2 * eta));
    L.dawnArt = true;
    ctx.audio?.play?.('iceGroan', null);
  }
  wallAtPlayer() {
    const ctx = this.ctx, p = this.p, F = this.L.floes;
    F?.doSplit?.();
    if (!p?.active || this.inWater()) return;
    const i = F ? F.floeAt(p.pos.x, p.pos.z) : -1;
    if (i >= 0) this.splitFloe(i);
    this.comms(this.a.comms?.fall);
  }
  /** the floe under Moth splits along a crack through its centre: two halves hinge apart and tilt; Moth drops in */
  splitFloe(i) {
    const ctx = this.ctx, F = this.L.floes, f = F.field.floes[i], M = mats(ctx);
    F.state[i] = 3; F.cols[i].enabled = false; F.writeAll();
    this.split = true;
    this.hole = new THREE.Vector3(f.x, this.L.DATA.sea, f.z);
    const w = f.r * 1.4, d = f.r * 0.7, th = Math.min(4, f.top - f.bottom);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(slab(w, th, d, 0.4), M.ice);
      const pivot = new THREE.Group();
      pivot.position.set(f.x, f.top - th / 2, f.z + s * 0.5);
      m.position.set(0, 0, s * d / 2);
      pivot.add(m); ctx.levelRoot.add(pivot);
      this.halves.push({ pivot, s, t: 0 });
    }
    ctx.fx?.dust?.(_v.set(f.x, f.top, f.z), 40, f.r * 0.6, [0.95, 0.97, 1]);
    ctx.audio?.play?.('iceCrack', _v);
    ctx.cameraRig?.addShake?.(0.6);
    const p = this.p;
    if (p?.active) { p.vel.y = Math.min(p.vel.y, -2); p.onGround = false; }
  }
  /** from T 9.5 (once the wall has passed) the player ends up in the water whatever happened (L1 §7.1 guarantees) */
  guarantee() {
    const p = this.p, F = this.L.floes;
    if (!p?.active || this.inWater()) return;
    let i = F ? F.floeAt(p.pos.x, p.pos.z) : -1;
    if (i < 0 && F) {
      i = F.nearestFloe(p.pos.x, p.pos.z, true) ?? -1;
      if (i >= 0) { const f = F.field.floes[i]; p.teleport(_v.set(f.x, f.top + 0.2, f.z)); }
    }
    if (i >= 0) this.splitFloe(i);
    else { p.teleport(_v.set(p.pos.x > 660 ? p.pos.x : 760, this.L.DATA.sea - 2, p.pos.z)); }
  }

  // ── phase B: t from entering the water ──
  makeCuesB() {
    return [
      [0, () => this.enterWater()],
      [1.5, () => this.line(0)], [3.5, () => this.line(1)], [6.0, () => this.line(2)],
      [10.0, () => this.line(3)], [13.5, () => this.line(4)], [17.5, () => this.line(5)],
      [20.0, () => this.slowing()],
      [24.0, () => this.flatline()],
      [26.0, () => this.black()],
      [27.0, () => this.line(6)],
      [30.0, () => this.reboot()],
      [31.5, () => this.line(7)], [34.0, () => this.line(8)],
      [36.0, () => this.controlReturns()],
    ];
  }
  enterWater() {
    const ctx = this.ctx, p = this.p, W = this.L.water;
    ctx.hud?.letterbox?.(false, 0.6);
    if (W && W.state !== 'water') W.enter();
    if (W) W.scripted = true;
    p.invuln = true;
    p.abilities = { ...(p.abilities || {}), jump: false, hover: false, boost: false, fire: false, blade: false, missile: false, lock: false,
                    tear: false, interact: false, kit: false, move: 0.25 };
    if (p.vel.y < -4) p.vel.y = -4;
    splash(ctx, p.pos, 1.6);
    ctx.hud?.vitals?.({ mode: 'live', spike: 150, decay: 40 });
    this.bpm = 150;
    ctx.hud?.warn?.('CABIN BREACH', 2);
    this.L.water?.setUnderFog?.(0.09, 24);         // A1.2: the waterline fallback
    ctx.audio?.duck?.(0.5, 2);
  }
  slowing() {
    const p = this.p;
    p.abilities = { ...(p.abilities || {}), move: 0.1 };
    this.bpmSeq = [[0, 172], [1, 140], [2, 96], [3, 50], [3.6, 30]];
    this.slowT = 0;
  }
  flatline() {
    const ctx = this.ctx, p = this.p;
    p.frozen = true;
    this.heart = false;
    ctx.hud?.vitals?.({ mode: 'flat', fault: 'SENSOR FAULT' });
    ctx.audio?.play?.('flatline', null);
    ctx.hud?.glitch?.(0.4);
  }
  black() {
    const ctx = this.ctx;
    ctx.hud?.fade?.(1, 0.2, { clock: 'sim' });
    ctx.hud?.letterbox?.(false, 0.1);
    ctx.hud?.show?.(false);
    ctx.music?.stop?.(0.2);
    ctx.audio?.duck?.(1, 4.5);
    this.blackout = true;
  }
  reboot() {
    const ctx = this.ctx;
    this.blackout = false;
    ctx.hud?.show?.(true);
    ctx.hud?.fade?.(0, 1.5, { clock: 'sim' });
    ctx.hud?.glitch?.(1.2);
    ctx.hud?.vitals?.({ mode: 'locked', bpm: 60 });
    ctx.mission?.setFlag?.('vitals', 'locked', true);       // A2 #19: the persistent lock, at the reboot itself
    this.L.water?.setUnderFog?.(this.a.art?.water?.fog?.density ?? 0.035, 1.5);
    this.L.music(this.a.music?.rise);
    ctx.audio?.duck?.(0.4, 1.5);
    this.p.en = this.p.enMax;
  }
  controlReturns() {
    const ctx = this.ctx, p = this.p, L = this.L;
    p.frozen = false; p.invuln = false;
    L.setAbilities('full');
    if (L.water) { L.water.scripted = false; L.water.rebase(); }
    L.setFlag('p:sunrise', true);
    L.floes?.updateShade?.(true);
    this.wall?.dispose?.();
    // a god-ray cone over the hole above
    const at = this.hole || _v.set(p.pos.x, L.DATA.sea, p.pos.z);
    const cone = new THREE.Mesh(coneGeo(4, 14, 30), coneMat(ctx, '#d8fff0', 0.16));
    cone.position.set(at.x, L.DATA.sea - 15, at.z);
    cone.renderOrder = 3; cone.castShadow = false;
    ctx.levelRoot.add(cone);
    L.godRay = cone;
    this.finish();
  }
  finish() {
    this.active = false;
    this.steam?.stop?.();
    this.resolve();
  }

  // ── per tick (mission phase, sim) ──
  update(dt) {
    if (!this.active) return;
    const ctx = this.ctx, p = this.p, L = this.L;
    this.T += dt;
    for (const c of this.cuesA) if (!c.done && this.T >= c[0]) { c.done = true; c[1](); }
    this.wall?.update(dt);
    // the falling auger and the split halves (visual)
    const A = this.auger;
    if (A) {
      A.t += dt;
      if (!A.landed) {
        const k = Math.min(1, A.t / A.dur);
        A.obj.position.lerpVectors(A.from, A.to, k);
        A.obj.position.y = A.from.y + (A.to.y - A.from.y) * k * k;
        A.obj.rotation.x += A.spin.x * dt; A.obj.rotation.z += A.spin.z * dt;
        if (k >= 1) {
          A.landed = true;
          ctx.fx?.explosion?.(A.to, 1.8, { decal: false });
          splash(ctx, A.to, 2);
          ctx.audio?.play?.('iceCrack', A.to);
          ctx.cameraRig?.addShake?.(0.9);
          if (this.augerFloe != null) L.floes?.crack?.(this.augerFloe);
        }
      } else if (A.t > A.dur + 2) {
        A.obj.position.y -= dt * 3; A.obj.rotation.x += dt * 0.2;
        if (A.t > A.dur + 12) { A.obj.parent?.remove(A.obj); this.auger = null; }
      }
    }
    for (const h of this.halves) {
      h.t += dt;
      const k = Math.min(1, h.t / 1.2);
      h.pivot.rotation.x = h.s * k * (30 * Math.PI / 180);
      h.pivot.position.y -= dt * (h.t > 1.2 ? 1.5 : 0.3);
      if (h.t > 8) h.pivot.visible = false;
    }
    if (!p?.active) return;
    // thrown off the shelf by the shock
    if (this.throwT > 0) {
      this.throwT -= dt;
      if (p.pos.x < 660) { p.vel.x = Math.max(p.vel.x, 40); } else this.throwT = 0;
    }
    // the camera turns gently toward the wall while the player isn't steering
    if (this.wall && !this.wall.passed && this.T > 1.5 && !(ctx.input?.look?.dx) && !(ctx.input?.look?.dy)) {
      p.yaw = dampAng(p.yaw, yawTo(this.wall.dir.x, this.wall.dir.y), 0.6, dt);
    }
    // the guarantee: from T 9.5, once the wall has passed, retried every second until the player is in the water
    if (this.phase === 'A' && this.T >= 9.5 && this.wall?.passed && !this.inWater() && (this.gT = (this.gT ?? 0) - dt) <= 0) { this.gT = 1; this.guarantee(); }
    // phase B starts in the water, once the wall has passed (or T 9.5)
    if (this.phase === 'A' && this.inWater() && (this.wall?.passed || this.T >= 9.5)) { this.phase = 'B'; this.t = 0; }
    if (this.phase !== 'B') return;
    this.t += dt;
    for (const c of this.cuesB) if (!c.done && this.t >= c[0]) { c.done = true; c[1](); }
    if (!this.active) return;
    // sinking at 4 m/s, settling at y −48
    if (p.pos.y > this.sinkTo + 0.05) p.vel.y = -4;
    else { p.pos.y = this.sinkTo; p.vel.y = 0; }
    // the view drifts up toward the light while the player isn't looking around: the split above, the floe undersides
    // dark against the bright green-white surface (L1 §7.2)
    if (this.t < 26 && !(ctx.input?.look?.dx) && !(ctx.input?.look?.dy)) p.pitch = damp(p.pitch, 0.42, 0.5, dt);
    // the vitals race (150 → 168, ragged), then the slowing sequence
    if (this.t < 20) {
      this.vT = (this.vT ?? 0) - dt;
      if (this.vT <= 0) {
        this.vT = 0.5;
        this.bpm = 150 + 18 * (this.t / 20) + (ctx.random() - 0.5) * 6;
        ctx.hud?.vitals?.({ bpm: Math.round(clamp(this.bpm, 140, 172)) });
      }
      if ((this.warnT = (this.warnT ?? 0) - dt) <= 0) { this.warnT = 1.5; ctx.hud?.warn?.('CABIN BREACH', 1.8); }
    } else if (this.bpmSeq) {
      this.slowT += dt;
      while (this.bpmSeq.length && this.slowT >= this.bpmSeq[0][0]) { this.bpm = this.bpmSeq.shift()[1]; ctx.hud?.vitals?.({ bpm: this.bpm }); }
      if (this.t < 24 && (this.warnT = (this.warnT ?? 0) - dt) <= 0) { this.warnT = 1.5; ctx.hud?.warn?.('CABIN BREACH', 1.8); }
    }
    // the heartbeat (the widget is silent; the sound is the level's)
    if (this.heart) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 60 / Math.max(20, this.bpm); ctx.audio?.play?.('heartbeat', null, { vol: 0.8 }); }
    }
    if (!this.blackout && (this.bubT = (this.bubT ?? 0) - dt) <= 0) { this.bubT = 0.12; bubbles(ctx, _w.set(p.pos.x, p.pos.y + 6, p.pos.z), 3, 3); }
    if (this.t < 26 && (this.duckT = (this.duckT ?? 0) - dt) <= 0) { this.duckT = 1.8; ctx.audio?.duck?.(0.5, 2); }
  }
  /** a restart dropped the action: clean up the meshes it owns */
  dispose() {
    this.active = false;
    this.steam?.stop?.();
    this.auger?.obj.parent?.remove(this.auger.obj); this.auger = null;
    for (const h of this.halves) h.pivot.parent?.remove(h.pivot);
    this.halves = [];
    this.wall?.dispose?.();
  }
}
