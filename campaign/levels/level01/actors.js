// levels/level01/actors.js (P6) — Level 1's scripted, non-combat actors and runtime visuals:
//  · Tick, Kit's buggy (L1 §11.6): parks, drives authored paths, follows, rocks when pinned; never a combat target;
//  · Kit's kite (L1 §11.7): follows Tick or the player at height, banks, lands; the o_look target; ribbon tail;
//  · the cutter (L1 §12.1): Juno's ice-cutter, drawn at the hidden player's position; the saw on the raw BLADE input;
//  · Kit's flares (L1 §12.10): arcs that burst high or burn as red-pink pools for 40 s, blinding Gleaners nearby;
//  · the towed sledge, runtime skiff wrecks (burning, 'harvest' targets), recovery flags and falling slabs.
// Everything here is level-scoped (under ctx.levelRoot) and reset on every level start. Movement runs on sim time in
// the runtime's systems (deterministic); purely cosmetic animation may use Math.random.
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap } from '../../src/core/util.js';
import { rig, flat, tickModel, kiteModel, cutterModel, sledModel, skiffModel, recoveryFlagModel } from './models.js';
import { Builder, cached, instance, mats, slab, shared, ball } from './kit.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();

// ── an additive glow sprite (Level 1's own visuals: flares, the cutter's saw sparks); one shared texture ─────────────
let GLOW_TEX = null;
export function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c); GLOW_TEX.colorSpace = THREE.SRGBColorSpace; GLOW_TEX.userData.shared = true;
  return GLOW_TEX;
}
const SPRITE_MATS = new Map();
let GLOWS = null;
/** the runtime hands P1's glow service here (A5.4); without it glowSprite falls back to an additive THREE.Sprite */
export function setGlowService(g) { GLOWS = g?.add ? g : null; }
/** a glow point that rides its parent, drawn by P1's instanced glows (no extra shader program) */
class GlowPoint extends THREE.Object3D {
  constructor(color, size, opacity) {
    super();
    this.isGlowPoint = true;
    this.handle = GLOWS.add(this, { color, size, intensity: 2.4 * opacity, minPx: 1.5 });
    this.addEventListener('removed', () => this.dispose());
  }
  setSize(s) { this.handle?.set?.({ size: s }); }
  dispose() { this.handle?.remove?.(); this.handle = null; }
}
/** an additive glow (flares, saw glow, telegraphs): P1 glows when present, else a sprite; size it with setGlowSize */
export function glowSprite(color, size, opacity = 1) {
  if (GLOWS) return new GlowPoint(color, size, opacity);
  const k = color + '|' + opacity;
  let m = SPRITE_MATS.get(k);
  if (!m) { m = shared(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); SPRITE_MATS.set(k, m); }
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.renderOrder = 3;
  return s;
}
export function setGlowSize(o, s) { if (!o) return; if (o.isGlowPoint) o.setSize(s); else o.scale.setScalar(s); }
export function disposeGlow(o) { if (!o) return; o.parent?.remove(o); if (o.isGlowPoint) o.dispose(); }

// ════════════════════════════════════════════════════════════════════════════════════════════════ Tick
export class Tick {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    const r = rig(ctx, tickModel(ctx));
    this.root = r.root; this.parts = r.parts;
    const name = L.signMesh?.('TICK', 1.6, 0.45, { bg: '#4f8a86', color: '#efe4cc' });
    if (name) { name.position.set(0.97, 0.95, 0.4); name.rotation.y = Math.PI / 2; this.parts.body.add(name); }
    ctx.levelRoot.add(this.root);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.visible = false;
    this.mode = 'park'; this.path = null; this.pi = 0; this.pinned = false; this.follow = null;
    this.root.visible = false;
  }
  reset() { this.mode = 'park'; this.path = null; this.pinned = false; this.follow = null; this.setVisible(false); }
  setVisible(v) { this.visible = !!v; this.root.visible = this.visible; }
  place(p, yaw) {
    const W = this.L.ctx.world;
    W.resolve(p, this.pos);
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
    if (yaw !== undefined) this.yaw = yaw; else if (W.route) this.yaw = W.route.yawAt(W.route.closest(this.pos.x, this.pos.z).s);
  }
  command(a = {}) {
    if (a.hide) { this.setVisible(false); this.mode = 'park'; return; }
    if (a.show || a.park || a.path || a.follow) this.setVisible(true);
    if ('pinned' in a) this.pinned = !!a.pinned;
    if (a.park) { this.place(a.park); this.mode = 'park'; this.path = null; this.follow = null; }
    if (a.path) {
      if (!this.visible || this.pos.lengthSq() === 0) this.place(a.path[0]);
      this.path = a.path.map(p => this.L.ctx.world.resolve(p, new THREE.Vector3()));
      this.pi = 0; this.mode = 'drive'; this.drive = { speed: a.speed ?? 12, hideAtEnd: !!a.hideAtEnd, parkAtEnd: !!a.parkAtEnd };
      this.follow = null;
    }
    if (a.follow) { this.follow = { who: a.follow, distance: a.distance ?? 90 }; this.mode = 'follow'; this.path = null; }
  }
  update(dt) {
    if (!this.visible) return;
    if (this.mode === 'drive' && this.path) {
      const tgt = this.path[this.pi];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
      this.speed = damp(this.speed, this.drive.speed, 2, dt);
      if (d < Math.max(3, this.speed * dt * 1.5)) {
        this.pi++;
        if (this.pi >= this.path.length) {
          this.mode = 'park'; this.path = null; this.speed = 0;
          if (this.drive.hideAtEnd) this.setVisible(false);
          this.L.ctx.events.emit('l01:tickArrived', {});
          return;
        }
      } else {
        this.yaw = dampAng(this.yaw, yawTo(dx, dz), 3, dt);
        const step = Math.min(d, this.speed * dt);
        this.pos.x += dx / d * step; this.pos.z += dz / d * step;
      }
    } else if (this.mode === 'follow' && this.follow) {
      const p = this.L.ctx.player;
      if (p?.active) {
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        const want = d - this.follow.distance;
        if (want > 4) {
          this.speed = damp(this.speed, clamp(want * 0.5, 4, 18), 1.5, dt);
          this.yaw = dampAng(this.yaw, yawTo(dx, dz), 2, dt);
          this.pos.x += dx / d * this.speed * dt; this.pos.z += dz / d * this.speed * dt;
        } else this.speed = damp(this.speed, 0, 3, dt);
      }
    } else this.speed = damp(this.speed, 0, 3, dt);
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
  }
  draw(dt, t) {
    if (!this.visible) return;
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    if (this.pinned) { this.root.rotation.z = Math.sin(t * 9) * 0.04; this.root.rotation.x = Math.sin(t * 7.3) * 0.03; }
    for (let i = 0; i < 4; i++) { const w = this.parts['wheel' + i]; if (w) w.rotation.x -= this.speed * dt / 0.7; }
    this.root.updateMatrixWorld(true);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ the kite
export class Kite {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    const r = rig(ctx, kiteModel(ctx), { castShadow: false });
    this.root = r.root; this.parts = r.parts;
    ctx.levelRoot.add(this.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.visible = false;
    this.follow = 'tick'; this.h = 85; this.side = null; this.landing = false;
    // the ribbon tail: a 12 m strip of 10 quads, updated in place
    const n = 11, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 2 * 3), idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.tailN = n;
    this.tail = new THREE.Mesh(geo, mats(ctx).canvasRed);
    this.tail.frustumCulled = false; this.tail.castShadow = false;
    ctx.levelRoot.add(this.tail);
    this.tailPts = Array.from({ length: n }, () => new THREE.Vector3());
    this.root.visible = this.tail.visible = false;
  }
  reset() { this.setVisible(false); this.follow = 'tick'; this.landing = false; this.side = null; }
  setVisible(v) { this.visible = !!v; this.root.visible = this.tail.visible = this.visible; }
  anchor(out) {
    const L = this.L;
    if (this.follow === 'player' && L.ctx.player?.active) out.copy(L.ctx.player.pos);
    else if (L.tick.visible) out.copy(L.tick.pos);
    else if (L.ctx.player?.active) out.copy(L.ctx.player.pos);
    else out.set(0, 0, 0);
    if (this.side === 'north') out.z -= 70;
    return out;
  }
  command(a = {}) {
    if (a.hide) { this.setVisible(false); return; }
    if (a.land) { this.landing = true; return; }
    if (a.follow) this.follow = a.follow;
    if (a.h) this.h = a.h;
    if ('side' in a) this.side = a.side || null;
    this.landing = false;
    if (a.show || a.follow) {
      if (!this.visible) { this.anchor(this.pos); this.pos.y += this.h; this.resetTail(); }
      this.setVisible(true);
    }
  }
  resetTail() { for (let i = 0; i < this.tailN; i++) this.tailPts[i].copy(this.pos).y -= i * 1.2; }
  update(dt, t) {
    if (!this.visible) return;
    this.anchor(_v);
    if (this.landing) {
      _v.y += 2;
      if (this.pos.distanceTo(_v) < 4) { this.setVisible(false); this.landing = false; return; }
    } else {
      _v.x += Math.sin(t * 0.21) * 22; _v.z += Math.cos(t * 0.17) * 18; _v.y += this.h + Math.sin(t * 0.5) * 6;
    }
    const k = this.landing ? 0.9 : 0.45;
    this.vel.x = damp(this.vel.x, (_v.x - this.pos.x) * k, 1.5, dt);
    this.vel.y = damp(this.vel.y, (_v.y - this.pos.y) * k, 1.5, dt);
    this.vel.z = damp(this.vel.z, (_v.z - this.pos.z) * k, 1.5, dt);
    this.pos.addScaledVector(this.vel, dt);
  }
  draw(dt, t) {
    if (!this.visible) return;
    this.root.position.copy(this.pos);
    const bank = clamp(this.vel.x * 0.02, -0.5, 0.5);
    this.root.rotation.set(-0.5 + Math.sin(t * 1.3) * 0.08, yawTo(this.vel.x, this.vel.z) || 0, bank + Math.sin(t * 0.9) * 0.1);
    this.root.updateMatrixWorld(true);
    // ribbon: each point trails the previous one, with a travelling sine
    const P = this.tailPts, arr = this.tail.geometry.attributes.position.array;
    this.parts.body.children.find(c => c.name === 'tail')?.getWorldPosition(P[0]) ?? P[0].copy(this.pos);
    for (let i = 1; i < this.tailN; i++) {
      _w.copy(P[i]).sub(P[i - 1]); const l = _w.length() || 1;
      P[i].copy(P[i - 1]).addScaledVector(_w, 1.2 / l);
      P[i].y -= 0.25 * dt * 60 * 0.02;
    }
    for (let i = 0; i < this.tailN; i++) {
      const w = 0.22 * (1 - i / this.tailN) + 0.06, s = Math.sin(t * 6 - i * 0.8) * 0.35;
      arr[i * 6] = P[i].x - w + s; arr[i * 6 + 1] = P[i].y; arr[i * 6 + 2] = P[i].z;
      arr[i * 6 + 3] = P[i].x + w + s; arr[i * 6 + 4] = P[i].y; arr[i * 6 + 5] = P[i].z;
    }
    this.tail.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { this.tail.geometry.dispose(); }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ the cutter
export class Cutter {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    const r = rig(ctx, cutterModel(ctx));
    this.root = r.root; this.parts = r.parts;
    const name = L.signMesh?.('SECOND PATIENCE · CUTTER', 2.6, 0.32, { bg: '#cbbd9a', color: '#2a2420', w: 512, h: 64 });
    if (name) { name.position.set(1.62, 0.3, 0.2); name.rotation.y = Math.PI / 2; this.parts.body.add(name); }
    ctx.levelRoot.add(this.root);
    this.on = false; this.cd = 0; this.strikeT = 0; this.walkPh = 0; this.fallT = -1;
    this.root.visible = false;
  }
  reset() { this.set(false); this.fallT = -1; }
  set(on) {
    const p = this.L.ctx.player;
    this.on = !!on;
    this.root.visible = this.on;
    this.L.setFlag('inCutter', this.on);
    if (p) {
      p.hidden = this.on;
      p.invuln = this.on;
      if (p.rig) p.rig.root.visible = !this.on && p.active && p.alive;
    }
    if (this.L.ctx.haul) this.L.ctx.haul.enabled = !this.on;
  }
  /** raw BLADE input saws a block within 14 m in front: 300 damage, three strikes a block (L1 §12.1) */
  input(dt) {
    if (!this.on) return;
    const ctx = this.L.ctx, p = ctx.player;
    this.cd = Math.max(0, this.cd - dt); this.strikeT = Math.max(0, this.strikeT - dt);
    if (!p?.active || p.frozen || this.fallT >= 0) return;
    if (ctx.input.pressed('blade') && this.cd <= 0) {
      this.cd = 0.6; this.strikeT = 0.5;
      ctx.audio?.play?.('saw', p.pos);
      const fx = -Math.sin(p.bodyYaw), fz = -Math.cos(p.bodyYaw);
      let best = null, bd = 14;
      for (const t of ctx.combat?.query?.({ tag: 'block' }) || []) {
        t.center(_v);
        const dx = _v.x - p.pos.x, dz = _v.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > bd + 3) continue;
        if (d > 2 && (dx * fx + dz * fz) / d < 0.3) continue;
        if (d - 3 < bd) { bd = d - 3; best = t; }
      }
      const saw = this.parts.saw;
      saw.getWorldPosition(_a);
      if (best) {
        ctx.combat.damage(best, 300, 0, { team: 'neutral', kind: 'saw', pos: p.pos });
        ctx.fx?.sparks?.(_a, 14, [0.8, 0.9, 1], 18);
        ctx.fx?.dust?.(_a, 10, 3, [0.85, 0.9, 1]);
        ctx.cameraRig?.addShake?.(0.25);
      } else ctx.fx?.sparks?.(_a, 4, [1, 0.8, 0.5], 10);
    }
  }
  /** the fall into the cavern (bridgeCollapse): tumble down and forward, then vanish (the wreck is in the cavern) */
  fall() { if (this.on) this.fallT = 0; }
  draw(dt, t) {
    if (!this.on) return;
    const p = this.L.ctx.player;
    if (!p?.active) return;
    if (this.fallT >= 0) {
      this.fallT += dt;
      const k = this.fallT;
      this.root.position.set(p.pos.x + Math.sin(-p.bodyYaw) * k * 6, p.pos.y - 22.5 * k * k, p.pos.z - Math.cos(p.bodyYaw) * k * 6);
      this.root.rotation.set(k * 1.3, p.bodyYaw, k * 0.9);
      if (k > 2.5) this.root.visible = false;
      this.root.updateMatrixWorld(true);
      return;
    }
    this.root.position.copy(p.pos);
    this.root.rotation.set(0, p.bodyYaw, 0);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    this.walkPh += dt * sp * 0.9;
    for (let i = 0; i < 4; i++) {
      const leg = this.parts['leg' + i]; if (!leg) continue;
      const ph = this.walkPh + (i === 0 || i === 3 ? 0 : Math.PI);
      leg.rotation.x = Math.sin(ph) * Math.min(0.5, sp * 0.05);
      const foot = this.parts['foot' + i]; if (foot) foot.rotation.x = -Math.max(0, Math.sin(ph)) * Math.min(0.5, sp * 0.05);
    }
    this.parts.body.position.y = 3.0 + Math.abs(Math.sin(this.walkPh)) * Math.min(0.15, sp * 0.01);
    const arm = this.parts.arm;
    arm.rotation.x = this.strikeT > 0 ? -0.55 * Math.sin(this.strikeT / 0.5 * Math.PI) : 0.05;
    this.parts.saw.rotation.x += dt * (this.strikeT > 0 ? 40 : 4);
    this.root.updateMatrixWorld(true);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ Kit's flares
export class Flares {
  constructor(L) { this.L = L; this.list = []; }
  reset() { for (const f of this.list) this.remove(f); this.list = []; }
  remove(f) { f.obj.parent?.remove(f.obj); disposeGlow(f.sp); disposeGlow(f.core); f.em?.stop?.(); }
  /** a flare from `from` (or from Tick, or from behind the player) to `at`; burst = hang high, else burn on the ground */
  fire(at, o = {}) {
    const ctx = this.L.ctx, W = ctx.world;
    const to = W.resolve(at, new THREE.Vector3());
    const from = o.from ? W.resolve(o.from, new THREE.Vector3()) : (this.L.tick.visible ? this.L.tick.pos.clone() : to.clone().add(_v.set(-80, 0, 30)));
    from.y += 2;
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(ball(0.35, 8, 6), mats(ctx).flare));
    const sp = glowSprite('#ff6a4a', o.burst ? 26 : 14, 0.95); obj.add(sp);
    const core = glowSprite('#ffd0c8', o.burst ? 7 : 4, 1); obj.add(core);
    obj.position.copy(from);
    ctx.levelRoot.add(obj);
    const flight = Math.max(1.2, from.distanceTo(to) / 70);
    const f = { obj, sp, core, from, to, t: 0, flight, burst: !!o.burst, life: o.life ?? 40, landed: false, em: null };
    this.list.push(f);
    ctx.audio?.play?.('flyby', from, { vol: 0.5 });
    return f;
  }
  update(dt) {
    const ctx = this.L.ctx;
    for (const f of this.list.slice()) {
      f.t += dt;
      if (f.t < f.flight) {
        const k = f.t / f.flight;
        f.obj.position.lerpVectors(f.from, f.to, k);
        f.obj.position.y += Math.sin(k * Math.PI) * Math.min(80, f.from.distanceTo(f.to) * 0.35);
      } else {
        if (!f.landed) {
          f.landed = true;
          ctx.particles?.lights?.flash?.(f.to, '#ff5a4a', 9000, 90, 1.2);
          ctx.audio?.play?.(f.burst ? 'boom' : 'pickup', f.to, { vol: 0.5 });
          if (!f.burst) f.em = ctx.fx?.emitter?.('fire', f.to, { rate: 0.6, scale: 0.6, color: [1, 0.35, 0.45] });
        }
        if (f.burst) f.obj.position.y = f.to.y - (f.t - f.flight) * 1.2;   // hangs under a canopy, slowly falling
        else f.obj.position.copy(f.to);
        // blind Gleaners within 25 m of a burning flare
        if (!f.burst) for (const u of ctx.enemies?.alive?.({ kind: 'gleaner' }) || []) if (u.pos.distanceTo(f.obj.position) < 25) u.blindT = Math.max(u.blindT || 0, 4);
      }
      if (f.t > f.flight + f.life) { this.remove(f); this.list.splice(this.list.indexOf(f), 1); }
    }
  }
  draw(dt, t) {
    for (const f of this.list) { const k = 0.85 + Math.random() * 0.3; setGlowSize(f.sp, (f.burst ? 26 : 14) * k); setGlowSize(f.core, (f.burst ? 7 : 4) * k); }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════ the towed sledge
/** a runtime copy of a sledge (sled1 after the raid harpoons it, and at the pin): follows a tow unit on a cable */
export class TowedSled {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    const r = rig(ctx, { key: 'sled', parts: sledModel(ctx).parts });
    this.root = r.root; this.parts = r.parts;
    const nm = L.signMesh?.('SECOND PATIENCE', 3.6, 0.7, { bg: '#4f8a86', color: '#e9e3d3' });
    if (nm) { nm.position.set(1.72, 1.0, 0.5); nm.rotation.y = Math.PI / 2; this.parts.body.add(nm); }
    ctx.levelRoot.add(this.root);
    const cg = new THREE.CylinderGeometry(0.06, 0.06, 1, 5); cg.translate(0, 0.5, 0); cg.rotateX(Math.PI / 2);
    this.cable = new THREE.Mesh(cg, mats(ctx).cable); this.cable.castShadow = false;
    ctx.levelRoot.add(this.cable);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.by = null; this.active = false; this.flag = null;
    this.reset();
  }
  reset() { this.active = false; this.by = null; this.root.visible = this.cable.visible = false; this.setLoad(3); if (this.flag) { this.flag.parent?.remove(this.flag); this.flag = null; } }
  setLoad(n) { for (let i = 0; i < 3; i++) if (this.parts['block' + i]) this.parts['block' + i].visible = i < n; }
  attach(unit, from) {
    this.by = unit; this.active = true; this.root.visible = true;
    if (from) { this.pos.copy(from); } else { this.pos.copy(unit.pos).add(_v.set(Math.sin(unit.yaw) * 30, 0, Math.cos(unit.yaw) * 30)); }
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
  }
  release() { this.by = null; this.cable.visible = false; }
  update(dt) {
    if (!this.active) return;
    const u = this.by;
    if (u && u.alive && u.root?.parent) {
      const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 30) { const k = (d - 30) / d; this.pos.x += dx * k; this.pos.z += dz * k; }
      this.yaw = dampAng(this.yaw, yawTo(dx, dz), 3, dt);
    } else if (u) this.release();
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
  }
  draw(dt, t) {
    if (!this.active) return;
    this.root.position.copy(this.pos); this.root.rotation.set(0, this.yaw, 0);
    const u = this.by;
    if (u && u.alive) {
      this.root.updateMatrixWorld(true);
      _v.set(0, 0.8, -6.4).applyMatrix4(this.root.matrixWorld);
      _w.copy(u.pos); _w.y += 1.4;
      const d = _v.distanceTo(_w);
      this.cable.visible = true; this.cable.position.copy(_v); this.cable.lookAt(_w); this.cable.scale.set(1, 1, d);
    } else this.cable.visible = false;
  }
  dispose() { this.cable.geometry.dispose(); }
}

// ════════════════════════════════════════════════════════════════════════════════ runtime wrecks, flags, debris
/** a skiff wreck left where a skiff died: on its side, burning for 20 s, a 'harvest' target for Gleaners */
export function spawnWreck(L, pos, yaw, variant) {
  const ctx = L.ctx;
  const b = cached(ctx, 'rt_wreck:' + variant, (B) => { flat(B, skiffModel(ctx, variant), new THREE.Matrix4().makeRotationZ(1.2).setPosition(0, 1.4, 0), { mast: { rot: [0.3, 0, 1.3] }, sail: { rot: [0.6, 0.3, 1.0] } }); });
  const { root } = instance(ctx, b);
  root.position.copy(pos); root.position.y = L.groundAt(pos.x, pos.z) - (L.inWater(pos) ? 1.2 : 0); root.rotation.y = yaw;
  ctx.levelRoot.add(root);
  const w = { root, pos: root.position, t: 0, burn: 20, em: ctx.fx?.emitter?.('fire', root.position.clone().add(_v.set(0, 1.5, 0)), { rate: 0.8, scale: 0.8 }),
              smoke: ctx.fx?.emitter?.('smoke', root.position.clone().add(_v.set(0, 3, 0)), { rate: 0.6, scale: 1 }), fire: glowSprite('#ff7a3a', 9, 0.8) };
  w.fire.position.set(0, 2.2, 0); root.add(w.fire);
  L.wrecks.push(w);
  return w;
}
export function updateWrecks(L, dt) {
  for (const w of L.wrecks) {
    w.t += dt;
    if (w.t > w.burn && !w.out) { w.out = true; w.em?.stop?.(); disposeGlow(w.fire); w.smoke?.set?.({ rate: 0.2 }); }
    if (!w.out) setGlowSize(w.fire, 7 + Math.random() * 4);
  }
}
/** set a skiff wreck (runtime or structure) on fire for `life` seconds (burnWrecks) */
export function igniteAt(L, pos, life = 120) {
  const ctx = L.ctx;
  const s = glowSprite('#ff7a3a', 10, 0.85); s.position.copy(pos); s.position.y += 2.5; ctx.levelRoot.add(s);
  const em = ctx.fx?.emitter?.('fire', pos.clone().add(_v.set(0, 1.5, 0)), { rate: 1, scale: 1 });
  const sm = ctx.fx?.emitter?.('smoke', pos.clone().add(_v.set(0, 4, 0)), { rate: 0.8, scale: 1.4 });
  L.fires.push({ s, em, sm, t: 0, life });
}
export function updateFires(L, dt) {
  for (const f of L.fires.slice()) {
    f.t += dt; setGlowSize(f.s, 8 + Math.random() * 5);
    if (f.t > f.life) { disposeGlow(f.s); f.em?.stop?.(); f.sm?.stop?.(); L.fires.splice(L.fires.indexOf(f), 1); }
  }
}
/** a planted Wake recovery flag (a flagged sledge) */
export function plantFlag(L, pos) {
  const r = rig(L.ctx, recoveryFlagModel(L.ctx));
  r.root.position.copy(pos);
  L.ctx.levelRoot.add(r.root);
  return r.root;
}
/** slabs that fall and fade (the snow bridge, the alcove's front plates): runtime meshes, removed after `life` */
export function dropSlabs(L, pos, yaw, o = {}) {
  const ctx = L.ctx, M = mats(ctx);
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const g = slab(o.w ?? 10, o.h ?? 1.2, o.d ?? 10, 0.3);
    const m = new THREE.Mesh(g, o.mat ?? M.snow);
    const a = (i / n) * Math.PI * 2, r = (o.spread ?? 14) * (0.3 + 0.7 * ((i * 37) % 10) / 10);
    m.position.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
    m.rotation.y = yaw + i;
    ctx.levelRoot.add(m);
    L.debris.push({ m, v: new THREE.Vector3(Math.cos(a) * 2, -2 - (i % 3), Math.sin(a) * 2), w: new THREE.Vector3((i % 3) - 1, 0.3, ((i + 1) % 3) - 1), t: 0, life: o.life ?? 3.5, floor: o.floor ?? -1e9 });
  }
  ctx.fx?.dust?.(pos, 30, o.spread ?? 14, [0.85, 0.9, 1]);
  ctx.audio?.play?.('collapse', pos);
}
export function updateDebris(L, dt) {
  for (const d of L.debris.slice()) {
    d.t += dt; d.v.y -= 30 * dt;
    d.m.position.addScaledVector(d.v, dt);
    if (d.m.position.y < d.floor) { d.m.position.y = d.floor; d.v.set(0, 0, 0); d.w.set(0, 0, 0); }
    d.m.rotation.x += d.w.x * dt; d.m.rotation.z += d.w.z * dt;
    if (d.t > d.life) { d.m.parent?.remove(d.m); L.debris.splice(L.debris.indexOf(d), 1); }
  }
}
