// levels/level01/icebreaker.js (P6) — the Icebreaker (L1 §6; A1.3 trims: no cut-line strike, no intake suction).
// A 60 m ghost-run Dredge drill-crawler sawing the shelf edge. The hull is armoured; its three drill heads are separate
// combat targets (tags drillhead + icebreaker, objective), and the unit itself is not targetable: its ap mirrors the
// heads' sum so the boss bar reads the whole machine.
//  Phase 1 CUTTING: crawls the edge lane (x ≈ 610) south and back, both saws lowered (damageable), slurry jets every 6 s,
//    a sweeping floodlight (SPOTTED), deck turrets, skiff launches every 40 s, a glowing cut line behind it.
//  Phase 2 HUNTING (one saw dead): raises the last saw and drives at the player; saw sweep when the player is within
//    70 m in front (1.5 s telegraph; 140°, 50 m, below 8 m: 1800 / 1400); after a sweep the saw stays low 2 s at ×1.5.
//  Phase 3 HARVEST (both saws dead): crawls to the edge (flag ib:phase = 3), opens its guards, lowers the bow auger over
//    the Raft (collar at y -8); plunges every 9 s with a shockwave ring (0 → 60 m at 40 m/s, 3 m tall: 1400 / 1200);
//    the collar only takes damage while the player's centre is below collar.y + 2 (fire from the Raft).
//  Death of the bow head: the finale (drown.js) calls finale(): the auger tears off, the boiler shock, a dead hulk.
import * as THREE from 'three';
import { Unit } from '../../src/actors/enemy.js';
import { clamp, damp, dampAng, yawTo, angWrap } from '../../src/core/util.js';
import { rig, flat } from './models.js';
import { mats, slab, side, front, cyl, ball, torus, chamferRect, top, glowAnchor, shared } from './kit.js';
import { coneGeo, coneMat } from './structures.js';
import { glowSprite, setGlowSize, disposeGlow } from './actors.js';
import * as KIT from '../../src/art/kit.js';

const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();

function model(ctx) {
  const M = mats(ctx);
  const hullP = [[-30, 4], [-26, 12], [-14, 14], [22, 14], [30, 9], [30, 2], [-24, 1]];
  const hull = [
    [KIT.plateGeo(hullP, 20, 'side', 0.6), M.iron, 0, 0, 0],
    [KIT.plateGeo([[-22, 6], [-14, 13], [18, 13], [26, 8], [24, 3], [-20, 3]], 22, 'side', 0.4), M.oxide, 0, 0, 0],
    [KIT.plateGeo([[-12, 13.5], [16, 13.5], [16, 15], [-11, 15]], 18, 'side', 0.25), M.iron, 0, 0, 0],
    ...[-1, 1].flatMap(s => [
      [slab(3.2, 4, 40, 0.3), M.iron, s * 12.4, 6.5, 2],                                        // sponsons
      ...[0, 1, 2, 3, 4, 5].map(i => [front([[-1.1, -0.18], [0, 0.32], [1.1, -0.18], [1.1, 0.05], [0, 0.55], [-1.1, 0.05]], 0.06, 0.01), M.hazard, s * 14.05, 6.5, -14 + i * 6.4, 0, s * PI / 2, 0]),
      ...[0, 1, 2].map(i => [KIT.greebles(() => 0.3 + i * 0.2, 6, 2, 1.0), M.steel, s * 14.05, 9.2, -10 + i * 12, 0, s * PI / 2, 0]),
    ]),
    // four tracked bogies with skirts
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([sx, sz]) => [
      [side([[-7, 0.3], [-6.4, 3.4], [6.4, 3.4], [7, 0.3], [6.2, -0.2], [-6.2, -0.2]], 3.6, 0.3), M.rubber, sx * 9.2, 0, sz * 17],
      [side([[-6.6, 1.2], [-6.0, 4.2], [6.0, 4.2], [6.6, 1.2]], 0.5, 0.12), M.oxide, sx * 11.2, 0, sz * 17],
      ...[-4.5, -1.5, 1.5, 4.5].map(z => [cyl(1.0, 1.0, 3.8, 10), M.steel, sx * 9.2, 1.4, sz * 17 + z, 0, 0, PI / 2]),
    ]),
    // the cutting gantry at the bow (truss) and the intake ramp, starboard amidships
    [KIT.truss(30, 3, 3, 8, 0.35), M.steel, 0, 10.5, -30.5, 0, PI / 2, 0],
    [slab(4, 0.6, 18, 0.15), M.iron, 13.5, 7, 4, 0.35, 0, -0.3],
    // the bridge tower aft, the stack, the skiff launch rail
    [slab(9, 18, 8, 0.5), M.iron, 0, 23, 21],
    [slab(10, 4.5, 9, 0.4), M.oxide, 0, 33.5, 20.5],
    [slab(8.6, 1.2, 0.2, 0.06), M.darkGlass, 0, 34, 15.95],
    [cyl(1.2, 1.5, 10, 10), M.iron, -3.5, 40, 24],
    [slab(6, 0.6, 14, 0.15), M.steel, 0, 9.5, 34, -0.45, 0, 0],
    // deck turret mounts and the mast step
    [cyl(2.2, 2.6, 1.0, 12), M.iron, -5, 15.2, 4], [cyl(2.2, 2.6, 1.0, 12), M.iron, 5, 15.2, 12],
    [cyl(0.6, 0.8, 16, 8), M.steel, 0, 22, -4],
  ];
  // the arm carries its saw guard (static, so merged into the arm part): oxide, steel and hazard only (L1 §6.1: ≤ 24 calls)
  const sawArm = (s) => [[slab(1.6, 1.6, 16, 0.25), M.oxide, 0, 0, -8], [cyl(0.4, 0.4, 12, 8), M.steel, s * 1.1, 0.9, -7, PI / 2, 0, 0], [cyl(1.4, 1.4, 2.0, 12), M.steel, 0, 0, 0, 0, 0, PI / 2],
                         ...guard().map(([g, m, x, y, z, rx = 0, ry = 0, rz = 0]) => [g, m, x, y - 0.4, z - 16.5, rx, ry, rz])];
  const saw = () => [
    [cyl(3.5, 3.5, 0.4, 32), M.steel, 0, 0, 0, 0, 0, PI / 2],
    ...[...Array(16)].map((_, i) => [slab(0.42, 0.9, 0.5, 0.05), M.orangeTeeth, 0, Math.cos(i * PI / 8) * 3.6, Math.sin(i * PI / 8) * 3.6, i * PI / 8, 0, 0]),
    [cyl(0.8, 0.8, 0.9, 12), M.steel, 0, 0, 0, 0, 0, PI / 2] ];
  const guard = () => [[side([[-4.2, -0.5], [-3.6, 3.6], [0, 4.6], [3.6, 3.6], [4.2, -0.5]], 1.6, 0.2), M.hazard, 0, 0, 0], [slab(1.8, 0.6, 8, 0.1), M.oxide, 0, 4.4, 0]];
  return { key: 'icebreaker', parts: {
    hull: { pivot: [0, 0, 0], items: hull, anchors: [
      { name: 'cab', at: [0, 34, 15.8], glow: { color: '#a8ff9e', size: 0.9, intensity: 8, pulse: 'beat', minPx: 4 } },
      { name: 'stackTop', at: [-3.5, 45.5, 24] },
      { name: 'turret0', at: [-5, 15.8, 4] }, { name: 'turret1', at: [5, 15.8, 12] }, { name: 'stern', at: [0, 6, 38] },
      { name: 'strobe0', at: [-12, 15, -20], glow: { color: '#ffb04a', size: 2, intensity: 3, pulse: 'flicker' } },
      { name: 'strobe1', at: [12, 15, -20], glow: { color: '#ffb04a', size: 2, intensity: 3, pulse: 'flicker' } }] },
    cab: { pivot: [0, 34, 15.8], parent: 'hull', items: [[KIT.plateGeo([[-0.5, 0], [0, 0.5], [0.5, 0], [0, -0.5]], 0.1, 'front', 0.02), M.ghost, 0, 0, 0]] },
    flood: { pivot: [0, 30, -4], parent: 'hull', items: [
      [slab(4.2, 1.4, 1.4, 0.15), M.iron, 0, 0, 0],
      ...[-1.5, -0.5, 0.5, 1.5].map(x => [cyl(0.42, 0.42, 0.2, 10), M.white, x, 0, -0.75, PI / 2, 0, 0]) ],
      anchors: [{ name: 'lens', at: [0, 0, -1], glow: { color: '#fff1d6', size: 4, intensity: 4, pulse: 'none' } }] },
    armP: { pivot: [-15, 9.5, -30], parent: 'hull', items: sawArm(-1) },
    sawP: { pivot: [0, -0.4, -16.5], parent: 'armP', items: saw() },
    armS: { pivot: [15, 9.5, -30], parent: 'hull', items: sawArm(1) },
    sawS: { pivot: [0, -0.4, -16.5], parent: 'armS', items: saw() },
    boom: { pivot: [0, 11, -27], parent: 'hull', items: [[slab(2.2, 2.2, 12, 0.3), M.iron, 0, 0, -6], [cyl(0.5, 0.5, 10, 8), M.iron, 1.4, 1.2, -5, PI / 2, 0, 0]] },
    auger: { pivot: [0, 0, -12], parent: 'boom', items: [
      [cyl(1.6, 1.6, 1.2, 20), M.collar, 0, 0, 0, PI / 2, 0, 0],                                  // the collar (weak point)
      [cyl(2.6, 0.2, 12, 14), M.steel, 0, 0, -6.6, -PI / 2, 0, 0],
      ...[...Array(10)].map((_, i) => [slab(0.25, 3.2 - i * 0.28, 0.6, 0.05), M.steel, Math.cos(i * 1.9) * (2.2 - i * 0.2), Math.sin(i * 1.9) * (2.2 - i * 0.2), -1.4 - i * 1.1, 0, 0, i * 1.9]) ] },
    bladeL: { pivot: [-2.4, 10, -29], parent: 'hull', items: [[side([[-3, -4], [-3.4, 4], [2, 5], [2.6, -4]], 0.8, 0.15), M.hazard, 0, 0, 0]] },
    bladeR: { pivot: [2.4, 10, -29], parent: 'hull', items: [[side([[-3, -4], [-3.4, 4], [2, 5], [2.6, -4]], 0.8, 0.15), M.hazard, 0, 0, 0]] },
  } };
}

/** a drill head: a combat Target positioned on a model part */
function makeHead(ib, name, label, ap, impMax, stagDur) {
  const t = {
    id: undefined, name: label, kind: 'drillhead', team: 'enemy', tags: new Set(['drillhead', 'icebreaker', 'head_' + name]),
    alive: true, targetable: true, objective: true, boss: false, isHead: true,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), ap, apMax: ap, imp: 0, impMax, stagT: 0, stagDur, lastHit: -9,
    invuln: true, hitR: name === 'bow' ? 3.2 : 4.6, part: null, ib, headName: name, vulnBonus: 0,
    center(out = new THREE.Vector3()) { return out.copy(t.pos); },
    hitTest(p) { return p.distanceToSquared(t.pos) < t.hitR * t.hitR; },
    onDamage(info) {
      if (info.blocked) { if (name === 'bow') ib.onBowBlocked(); return; }
      if (t.vulnBonus > 0 && info.amount > 0 && t.alive) { t.ap -= info.amount * 0.5; if (t.ap <= 0 && t.alive) { t.ap = 0; ib.ctx.combat?.kill?.(t, info.source); } }
      ib.ctx.fx?.sparks?.(t.pos, 6, [1, 0.6, 0.2], 18);
    },
    onDeath() { ib.onHeadDead(t); },
  };
  return t;
}

export class Icebreaker extends Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'icebreaker', name: 'ICEBREAKER', pos, apMax: 30000, impMax: Infinity, hitR: 14, hitY: 9, rad: 16, hgt: 18,
                 faction: 'dredge', config: cfg, targetable: false, boss: true, immovable: true });
    this.L = L; this.cfg = cfg;
    this.blindT ??= 0; this.heldT ??= 0;
    const r = rig(ctx, model(ctx));
    this.model = r.root; this.parts = r.parts; this.root.add(this.model);
    this.alwaysActive = true; this.ghost = true; this.keepMesh = true; this.targetable = false;
    this.phase = 1; this.dirZ = 1; this.speed = 0; this.heads = null; this.turrets = [];
    this.t = 0; this.jetT = [3, 6]; this.jet = [0, 0]; this.jetTele = [0, 0]; this.floodA = 0; this.launchT = 25; this.launchN = 0;
    this.sweep = { tele: 0, act: 0, low: 0, cd: 4 }; this.plunge = { cd: 6, tele: 0, rec: 0, ring: null };
    this.colT = 0; this.cols = []; this.runOverT = 0; this.dead = false; this.armLow = { P: 1, S: 1 }; this.guardOpen = 0; this.boomLow = 0;
    this.yaw = o.yaw ?? PI;
    // effects meshes
    const M = mats(ctx);
    // CylinderGeometry's top (+y) is rotated to -z (away from the lamp): wide end far, narrow end at the lens
    this.floodCone = new THREE.Mesh(coneGeo(70, 1.2, 500), coneMat(ctx, '#ffe4b0', 0.05));
    this.floodCone.castShadow = false; this.floodCone.renderOrder = 2;
    this.floodPivot = new THREE.Group(); this.floodPivot.add(this.floodCone); this.floodCone.position.set(0, 0, -250); this.floodCone.rotation.x = -PI / 2;
    this.parts.flood.add(this.floodPivot);
    this.jetMeshes = ['P', 'S'].map(() => { const m = new THREE.Mesh(coneGeo(16, 0.5, 60), coneMat(ctx, '#e8f4ff', 0.18)); m.visible = false; m.castShadow = false; ctx.levelRoot.add(m); return m; });
    this.ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 48, 1, true), coneMat(ctx, '#bfe8ff', 0.35)); this.ringMesh.visible = false; ctx.levelRoot.add(this.ringMesh);
    this.cutLine = L.cutLine;
    this.sawGlow = { P: glowSprite('#ff7a2a', 9, 0.7), S: glowSprite('#ff7a2a', 9, 0.7) };
    this.parts.sawP.add(this.sawGlow.P); this.parts.sawS.add(this.sawGlow.S);
  }
  onSpawned() { this.ensureHeads(); }
  ensureHeads() {
    if (this.heads) return;
    const ctx = this.ctx, H = this.cfg.heads || { port: 8000, stbd: 8000, bow: 14000 };
    this.heads = { P: makeHead(this, 'port', 'PORT SAW', H.port, 2600, 3), S: makeHead(this, 'stbd', 'STARBOARD SAW', H.stbd, 2600, 3), B: makeHead(this, 'bow', 'BOW AUGER', H.bow, 3600, 4) };
    this.heads.P.part = this.parts.sawP; this.heads.S.part = this.parts.sawS; this.heads.B.part = this.parts.auger;
    for (const t of this.tags) if (typeof t === 'string' && t.startsWith('enc:')) for (const h of Object.values(this.heads)) h.tags.add(t);
    for (const h of Object.values(this.heads)) ctx.combat?.register?.(h);
    // deck turrets (prototype turret, Dredge colours), carried on the deck mounts
    for (let i = 0; i < (this.cfg.turrets ?? 2); i++) {
      const u = ctx.enemies?.spawn?.('turret', this.anchorWorld('turret' + i, new THREE.Vector3()), { faction: 'dredge', name: 'DECK TURRET', tags: ['ib_turret'] });
      if (u) { u.immovable = true; u.alwaysActive = true; this.turrets.push(u); }
    }
    this.L.icebreaker = this;
    this.updateHeads(0);
  }
  anchorWorld(name, out) {
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.root.updateMatrixWorld(true);
    const a = this.parts.hull.getObjectByName(name);
    return a ? a.getWorldPosition(out) : out.copy(this.pos);
  }
  get collarY() { return this.L.DATA.icebreaker.collarY; }
  // ── phases ──
  setPhase(n) {
    this.ensureHeads();
    if (n >= 3) {
      for (const k of ['P', 'S']) { const h = this.heads[k]; if (h.alive) this.ctx.combat?.kill?.(h, { team: 'player', kind: 'script' }); }
      const hv = this.L.DATA.icebreaker.harvest;
      this.pos.set(hv.x, this.L.groundAt(hv.x, hv.z), hv.z); this.yaw = -hv.azimuth * PI / 180;
      this.phase = 3; this.guardOpen = 1; this.boomLow = 1; this.plunge.cd = 5;
      this.L.setFlag('ib:phase', 3);
      this.syncRoot(); this.updateHeads(0); this.rehash();
    }
  }
  onHeadDead(h) {
    const k = h === this.heads.P ? 'P' : h === this.heads.S ? 'S' : 'B';
    this.ctx.fx?.explosion?.(h.pos, 2.2);
    this.ctx.audio?.play?.('metalGroan', h.pos);
    if (k === 'P' || k === 'S') {
      this.armLow[k] = 2;   // limp: hangs and drags sparks
      const alive = ['P', 'S'].filter(x => this.heads[x].alive).length;
      if (this.phase === 1 && alive === 1) { this.phase = 2; this.L.setFlag('ib:phase', 2); }
      else if (alive === 0 && this.phase < 3) { this.phase = 2.5; this.L.setFlag('ib:phase', 2.5); }
    }
  }
  /** the bridge stack venting steam and the odd spark (L1 §6.1); it follows the hull, and dies with it under the sea */
  updateStack(dt) {
    const fx = this.ctx.fx; if (!fx?.emitter) return;
    this.stackA ??= this.parts.hull.getObjectByName('stackTop');
    if (!this.stackA) return;
    this.stackA.getWorldPosition(_c);
    if (_c.y < this.L.DATA.sea) { this.stack?.stop?.(); this.stack = null; this.stackOff = true; return; }
    if (this.stackOff) return;
    if (!this.stack || this.stack.alive === false) this.stack = fx.emitter('steam', _c.clone(), { rate: this.hulk ? 2.2 : 1.1, scale: 2.6 });
    this.stack.pos.copy(_c);
    if (this.hulk && !this.stackHulk) { this.stackHulk = true; this.stack.set?.({ rate: 2.2, scale: 3.2 }); }
    if (Math.random() < dt * 1.5) fx.sparks?.(_c, 3, [1, 0.6, 0.25], 8);
  }
  onBowBlocked() { if (this.phase === 3) this.L.counters.collarAbove++; }
  /** the finale (drown.js T 0): the auger tears off and falls, the machine dies as a hulk */
  finale() {
    if (this.dead) return;
    this.dead = true;
    this.parts.boom.visible = this.parts.auger.visible = false;
    for (const u of this.turrets) if (u.alive) this.ctx.combat?.kill?.(u, { team: 'neutral', kind: 'script' });
    for (const u of this.ctx.enemies?.alive?.({ tag: 'ib_skiff' }) || []) u.mode = 'flee';
    this.floodCone.visible = false;
    for (const m of this.jetMeshes) m.visible = false;
    this.ringMesh.visible = false;
    this.sawGlow.P.visible = this.sawGlow.S.visible = false;
    this.hulk = true;
  }
  // ── update ──
  update(dt) {
    this.baseUpdate(dt);
    if (!this.heads) this.ensureHeads();
    this.updateStack(dt);
    if (this.hulk) { this.carryTurrets(); return; }
    this.t += dt;
    const p = this.ctx.player?.active && this.ctx.player.alive ? this.ctx.player : null;
    switch (this.phase) {
      case 1: this.phaseCut(dt, p); break;
      case 2: this.phaseHunt(dt, p); break;
      case 2.5: this.phaseToEdge(dt, p); break;
      case 3: this.phaseHarvest(dt, p); break;
    }
    this.moveHull(dt);
    this.updateFlood(dt, p);
    this.updateJets(dt, p);
    this.updateLaunches(dt);
    this.runOver(dt, p);
    this.updateHeads(dt);
    this.carryTurrets();
    this.trackHullHits();
    this.ap = Object.values(this.heads).reduce((a, h) => a + Math.max(0, h.ap), 0);
    if ((this.colT -= dt) <= 0) { this.colT = 0.25; this.rehash(); }
  }
  phaseCut(dt, p) {
    const D = this.L.DATA.icebreaker, [z0, z1] = D.laneZ;
    if (this.pos.z > z1 - 5) this.dirZ = -1; else if (this.pos.z < z0 + 5) this.dirZ = 1;
    const tx = D.laneX, tz = this.dirZ > 0 ? z1 : z0;
    this.drive(dt, tx, tz, 4.5);
    this.armLow.P = this.heads.P.alive ? 1 : 2; this.armLow.S = this.heads.S.alive ? 1 : 2;
    if (this.speed > 1) for (const k of ['P', 'S']) if (this.heads[k].alive && Math.random() < dt * 2) this.cutLine?.drop(this.heads[k].pos);
  }
  phaseHunt(dt, p) {
    const S = this.sweep;
    const k = this.heads.P.alive ? 'P' : 'S';
    S.cd -= dt;
    if (p) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      const fwd = (dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / Math.max(1, d);
      if (S.tele > 0) {
        S.tele -= dt; this.speed = damp(this.speed, 0, 2, dt);
        if (Math.random() < dt * 30) this.ctx.fx?.sparks?.(this.heads[k].pos, 4, [1, 1, 1], 20);
        if (S.tele <= 0) { S.act = 0.6; this.doSweep(k, p); }
      } else if (S.act > 0) { S.act -= dt; if (S.act <= 0) S.low = 2; }
      else {
        if (S.low > 0) S.low -= dt;
        if (d > 45) this.drive(dt, p.pos.x, p.pos.z, 6.5); else this.speed = damp(this.speed, 0, 1.5, dt);
        if (S.cd <= 0 && d < 70 + 15 && fwd > 0.4 && S.low <= 0) {
          S.tele = 1.5; S.cd = 7; this.L.counters.sawSweep++;
          this.ctx.audio?.play?.('charge', this.pos); this.ctx.audio?.play?.('saw', this.heads[k].pos);
        }
      }
    }
    this.armLow[k] = S.tele > 0 || S.act > 0 || S.low > 0 ? 1 : 0;
  }
  doSweep(k, p) {
    // 140° arc at ground level, radius 50 m from the shoulder; everything below 8 m above the ice is hit
    const sh = this.heads[k].pos, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const ang = Math.abs(angWrap(yawTo(dx, dz) - this.yaw)), d = Math.hypot(p.pos.x - sh.x, p.pos.z - sh.z);
    const g = this.L.groundAt(p.pos.x, p.pos.z);
    if (d < 50 && ang < 70 * PI / 180 && p.pos.y - g < 8) this.ctx.combat?.damage?.(p, 1800, 1400, { team: 'enemy', owner: this, kind: 'saw', pos: sh });
    this.ctx.fx?.shockwave?.(sh, 50, '#ffd9a0', 0.4);
    this.ctx.fx?.sparks?.(sh, 30, [1, 0.8, 0.5], 30);
    this.ctx.cameraRig?.addShake?.(0.7);
    this.ctx.audio?.play?.('saw', sh);
  }
  phaseToEdge(dt) {
    const hv = this.L.DATA.icebreaker.harvest;
    const d = Math.hypot(hv.x - this.pos.x, hv.z - this.pos.z);
    if (d > 3) this.drive(dt, hv.x, hv.z, 5);
    else {
      this.speed = 0; this.yaw = dampAng(this.yaw, -hv.azimuth * PI / 180, 0.6, dt);
      if (Math.abs(angWrap(this.yaw + hv.azimuth * PI / 180)) < 0.05) { this.phase = 3; this.plunge.cd = 4; this.L.setFlag('ib:phase', 3); }
    }
  }
  phaseHarvest(dt, p) {
    this.speed = 0;
    this.guardOpen = Math.min(1, this.guardOpen + dt * 0.5);
    this.boomLow = Math.min(1, this.boomLow + dt * 0.35);
    const P = this.plunge;
    if (P.rec > 0) { P.rec -= dt; }
    else if (P.tele > 0) {
      P.tele -= dt;
      if (Math.random() < dt * 20) this.ctx.fx?.dust?.(this.heads.B.pos, 4, 3, [0.9, 0.95, 1]);
      if (P.tele <= 0) this.doPlunge(p);
    } else if ((P.cd -= dt) <= 0 && this.boomLow >= 1) {
      P.tele = 2; P.cd = 9;
      this.ctx.audio?.play?.('rotorWhine', this.heads.B.pos);
    }
    if (P.ring) {
      const R = P.ring;
      R.r += 40 * dt;
      this.ringMesh.visible = true; this.ringMesh.position.copy(R.c); this.ringMesh.scale.set(R.r, 1, R.r);
      if (p && !R.hit) {
        const d = Math.hypot(p.pos.x - R.c.x, p.pos.z - R.c.z), g = R.c.y;
        if (Math.abs(d - R.r) < 3 && p.pos.y < g + 3) { R.hit = true; this.ctx.combat?.damage?.(p, 1400, 1200, { team: 'enemy', owner: this, kind: 'shockwave', pos: R.c }); }
      }
      if (R.r > 60) { P.ring = null; this.ringMesh.visible = false; }
    }
  }
  doPlunge(p) {
    // into the Raft floe nearest the player
    const F = this.L.floes;
    const at = p ? p.pos : this.heads.B.pos;
    const i = F?.nearestFloe?.(at.x, at.z, true);
    const c = i != null ? F.floePos(i, new THREE.Vector3()) : this.heads.B.pos.clone().setY(this.L.DATA.floeTop);
    if (i != null) F.crack(i);
    this.plunge.rec = 3;
    this.plunge.ring = { c, r: 0, hit: false };
    this.ctx.fx?.explosion?.(c, 1.6, { decal: false });
    this.ctx.fx?.shockwave?.(c, 60, '#bfe8ff', 1.5);
    this.ctx.audio?.play?.('iceCrack', c);
    this.ctx.cameraRig?.addShake?.(0.8);
  }
  drive(dt, tx, tz, speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const ty = yawTo(dx, dz), d = angWrap(ty - this.yaw), turn = 0.12 * dt;
    this.yaw = angWrap(this.yaw + clamp(d, -turn, turn));
    this.speed = damp(this.speed, Math.abs(d) > 0.8 ? speed * 0.3 : speed, 0.8, dt);
  }
  moveHull(dt) {
    this.pos.x += -Math.sin(this.yaw) * this.speed * dt; this.pos.z += -Math.cos(this.yaw) * this.speed * dt;
    this.pos.y = this.L.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < -5) this.pos.y = 0;   // never sink into the sea stamps near the edge
  }
  updateFlood(dt, p) {
    const fl = this.parts.flood;
    if (this.phase === 3) { fl.rotation.y = damp(fl.rotation.y, 0, 1, dt); fl.rotation.x = damp(fl.rotation.x, -0.45, 1, dt); }
    else { this.floodA += dt * (2 * PI / 9); fl.rotation.y = Math.sin(this.floodA) * 1.2; fl.rotation.x = -0.12; }
    if (!p) return;
    // in the 8° cone, 500 m
    fl.updateMatrixWorld(true);
    fl.getWorldPosition(_v);
    _w.set(0, 0, -1).applyQuaternion(fl.getWorldQuaternion(_q));
    p.center(_c);
    const to = _c.sub(_v), d = to.length();
    const lit = d < 500 && to.dot(_w) / d > Math.cos(8 * PI / 180 + 3 / Math.max(10, d));
    if (lit) { this.L.counters.inFlood++; this.ctx.hud?.warn?.('SPOTTED', 0.3, true); }
  }
  updateJets(dt, p) {
    if (this.phase !== 1) { for (const m of this.jetMeshes) m.visible = false; return; }
    ['P', 'S'].forEach((k, i) => {
      const h = this.heads[k];
      if (!h.alive) { this.jetMeshes[i].visible = false; return; }
      this.jetT[i] -= dt;
      if (this.jetT[i] <= 0 && this.jet[i] <= 0 && this.jetTele[i] <= 0) { this.jetTele[i] = 0.8; this.ctx.audio?.play?.('static', h.pos, { vol: 0.6, rate: 0.6 }); }
      if (this.jetTele[i] > 0) { this.jetTele[i] -= dt; if (Math.random() < dt * 30) this.ctx.fx?.dust?.(h.pos, 3, 2, [0.95, 0.97, 1]); if (this.jetTele[i] <= 0) { this.jet[i] = 1.5; this.jetT[i] = 6; } }
      const m = this.jetMeshes[i];
      if (this.jet[i] > 0) {
        this.jet[i] -= dt;
        // a sideways cone (30°, 60 m) from the saw
        const side = k === 'P' ? 1 : -1;
        const dir = _w.set(Math.cos(this.yaw) * -side, 0, -Math.sin(this.yaw) * -side);   // outward: port is the -x side
        m.visible = true; m.position.copy(h.pos).addScaledVector(dir, 30); m.lookAt(_v.copy(h.pos).addScaledVector(dir, 100)); m.rotateX(PI / 2);
        if (Math.random() < dt * 40) this.ctx.fx?.dust?.(_v.copy(h.pos).addScaledVector(dir, 10 + Math.random() * 40), 4, 4, [0.95, 0.97, 1]);
        if (p) {
          p.center(_c); const to = _c.sub(h.pos), d = to.length();
          if (d < 60 && to.dot(dir) / d > Math.cos(15 * PI / 180)) {
            this.ctx.combat?.damage?.(p, 220 * dt, 700 * dt, { team: 'enemy', owner: this, kind: 'slurry', pos: h.pos });
            p.vel.addScaledVector(dir, 25 * dt * 3);
          }
        }
      } else m.visible = false;
    });
  }
  updateLaunches(dt) {
    if (this.phase >= 2.5) return;
    this.launchT -= dt;
    if (this.launchT > 0) return;
    const L = this.cfg.skiffLaunch || { every: [40, 50], max: 3 };
    this.launchT = this.phase === 1 ? L.every[0] : L.every[1];
    const alive = this.ctx.enemies?.count?.({ tag: 'ib_skiff' }) ?? 0;
    for (let i = 0; i < 2 && alive + i < (L.max ?? 3); i++) {
      const variant = this.launchN++ % 2 ? 'sleet' : 'gaffer';
      const at = this.anchorWorld('stern', new THREE.Vector3()); at.x += (i - 0.5) * 6;
      const u = this.ctx.enemies?.spawn?.('skiff', at, { name: 'RAIDER SKIFF', tags: ['ib_skiff'], yaw: this.yaw + PI,
                                                         config: { variant, haul: variant === 'gaffer' ? 'harpoon_gaff' : 'shotgun_s8' } });
      if (u) { u.mode = 'launch'; u.yaw = this.yaw + PI; }
    }
  }
  runOver(dt, p) {
    this.runOverT -= dt;
    if (!p || this.runOverT > 0 || this.speed < 0.5) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < 12 && Math.abs(lz) < 31 && p.pos.y < this.pos.y + 8) {
      this.runOverT = 1;
      this.ctx.combat?.damage?.(p, 1200, 1600, { team: 'enemy', owner: this, kind: 'crush', pos: this.pos });
      const side = Math.sign(lx) || 1;
      p.pos.x += c * side * 4; p.pos.z += -s * side * 4;
      p.vel.x += c * side * 20; p.vel.z += -s * side * 20;
    }
  }
  updateHeads(dt) {
    this.syncRoot();
    this.model.updateMatrixWorld(true);
    const P = this.ctx.player;
    for (const [k, h] of Object.entries(this.heads || {})) {
      h.part.getWorldPosition(h.pos);
      if (h.stagT > 0) h.stagT = Math.max(0, h.stagT - dt);
      if (this.ctx.clock.time - h.lastHit > 1.6) h.imp = Math.max(0, h.imp - h.impMax * 0.35 * dt);
      if (!h.alive) continue;
      if (k === 'B') {
        const below = P?.active ? P.center(_c).y < this.collarY + 2 : false;
        h.invuln = !(this.phase === 3 && this.boomLow >= 1 && below);
      } else {
        h.invuln = !(this.armLow[k] >= 1) || this.hulk;
        h.vulnBonus = this.phase === 2 && this.sweep.low > 0 ? 1 : 0;
      }
    }
  }
  carryTurrets() {
    for (let i = 0; i < this.turrets.length; i++) {
      const u = this.turrets[i];
      if (!u.alive) continue;
      this.anchorWorld('turret' + i, u.pos);
      u.heldT = Math.max(u.heldT || 0, 0.1); u.home?.copy?.(u.pos);
      u.syncRoot?.();
    }
  }
  /**
   * player projectiles about to enter the hull box count as hull hits (the hint "ARMOURED. Hit the drill heads.").
   * The enemies system runs before the projectiles system (ai → physics), and a projectile dies on the hull's collider
   * inside its own step, so the test sweeps each projectile's next 1/20 s: a segment that crosses the hull box (and
   * passes no live drill head on the way) is a hull hit.
   */
  trackHullHits() {
    if (this.L.counters.hullHit) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const inHull = (x, y, z) => {
      const dx = x - this.pos.x, dz = z - this.pos.z, ly = y - this.pos.y;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.abs(lx) < 13 && Math.abs(lz) < 31 && ly > -1 && ly < 16;
    };
    this.ctx.projectiles?.forEach?.((pr) => {
      if (!pr.alive || pr.team !== 'player' || this.L.counters.hullHit) return;
      const dx = pr.pos.x - this.pos.x, dz = pr.pos.z - this.pos.z;
      const reach = 40 + pr.vel.length() * 0.05;
      if (dx * dx + dz * dz > reach * reach) return;
      for (let i = 0; i <= 8; i++) {
        const k = (i / 8) * 0.05;
        _v.copy(pr.pos).addScaledVector(pr.vel, k);
        for (const h of Object.values(this.heads)) if (h.alive && h.pos.distanceTo(_v) < h.hitR + 2) return;   // a head first
        if (inHull(_v.x, _v.y, _v.z)) { this.L.counters.hullHit++; return; }
      }
    });
  }
  rehash() {
    const C = this.ctx.collision; if (!C) return;
    for (const c of this.cols) C.remove(c);
    this.cols.length = 0;
    if (this.sunk) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const z of [-18, 0, 18]) {
      const x = this.pos.x + z * s, zz = this.pos.z + z * c;
      this.cols.push(C.obox(x, zz, 24, 19, this.yaw, this.pos.y + 14, this.pos.y - 2, { surface: 'metal', tag: 'icebreaker' }));
    }
  }
  syncRoot() {
    super.syncRoot();
    if (!this.parts) return;
    const t = this.ctx.clock.time, P = this.parts;
    for (const k of ['P', 'S']) {
      const arm = k === 'P' ? P.armP : P.armS, saw = k === 'P' ? P.sawP : P.sawS;
      const st = this.armLow[k];   // 0 raised, 1 lowered, 2 limp
      const target = st === 2 ? 0.95 : st === 1 ? 0.62 : -0.15;
      arm.rotation.x = damp(arm.rotation.x, target, 1.5, 1 / 60) + (st === 2 ? Math.sin(t * 3) * 0.02 : 0);
      if (st !== 2) saw.rotation.x -= (st === 1 ? 0.5 : 0.1);
      const g = this.sawGlow[k]; g.visible = st === 1 && !this.hulk; setGlowSize(g, 8 + Math.random() * 3);
      if (st === 2 && Math.random() < 0.2 && this.speed > 0.5) { saw.getWorldPosition(_v); this.ctx.fx?.sparks?.(_v, 2, [1, 0.6, 0.2], 10); }
    }
    P.bladeL.rotation.y = -this.guardOpen * 0.9; P.bladeR.rotation.y = this.guardOpen * 0.9;
    P.boom.rotation.x = this.boomLow * 1.1;
    if (this.plunge.tele > 0 || this.phase === 3) P.auger.rotation.z += this.plunge.tele > 0 ? 0.6 : 0.08;
    if (this.plunge.rec > 0) P.boom.rotation.x = 1.1 + 0.18;
  }
  cleanup() {
    this.stack?.stop?.(); this.stack = null; this.stackOff = true;
    const C = this.ctx.collision; for (const c of this.cols) C?.remove(c); this.cols.length = 0;
    for (const m of [...this.jetMeshes, this.ringMesh]) m.parent?.remove(m);
    disposeGlow(this.sawGlow?.P); disposeGlow(this.sawGlow?.S);
    for (const h of Object.values(this.heads || {})) this.ctx.combat?.unregister?.(h);
    if (this.L.icebreaker === this) this.L.icebreaker = null;
  }
  despawn() { this.cleanup(); super.despawn(); }
}

/** the glowing slush channel the saws leave behind: one dynamic mesh of up to 400 flat quads (1 draw call, the
 *  library glow material, so no extra shader program) */
export class CutLine {
  constructor(L) {
    this.L = L; const ctx = L.ctx;
    this.max = 400; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 6 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, coneMat(ctx, '#ff7a2a', 0.5));
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.name = 'cutLine';
    ctx.levelRoot.add(this.mesh);
    this.last = new Map();
  }
  drop(p) {
    const k = Math.round(p.x / 3) + ':' + Math.round(p.z / 3);
    if (this.last.has(k)) return;
    this.last.set(k, 1);
    const i = this.n++ % this.max;
    const y = this.L.groundAt(p.x, p.z) + 0.08, a = (Math.random() - 0.5) * 0.2, c = Math.cos(a), s = Math.sin(a);
    const q = [[-0.8, -3.5], [0.8, 3.5], [0.8, -3.5], [-0.8, -3.5], [-0.8, 3.5], [0.8, 3.5]];   // normals up (front faces seen from above)
    for (let v = 0; v < 6; v++) {
      const [lx, lz] = q[v], o = (i * 6 + v) * 3;
      this.pos[o] = p.x + lx * c + lz * s; this.pos[o + 1] = y; this.pos[o + 2] = p.z - lx * s + lz * c;
    }
    const attr = this.mesh.geometry.attributes.position;
    attr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.min(this.max, this.n) * 6);
  }
  reset() { this.n = 0; this.mesh.geometry.setDrawRange(0, 0); this.last.clear(); }
  dispose() { this.mesh.geometry.dispose(); }
}

export function registerIcebreaker(ctx, L) {
  ctx.enemies.register('icebreaker', (c, pos, o = {}) => new Icebreaker(c, pos, o, L));
}
