// levels/level02/tally.js — the Tally (L2 §7): Rusk's 80 m three-masted flagship land-yacht, the signature set piece.
// One custom unit kind, `tally`, that owns its child targets, its motion and its phases (Level 1's Icebreaker pattern):
//   phase 0 ARRIVE   the harpoon (beat 9): it swings in beside Big Mercy and three harpoons punch into her tank cars;
//   phase 1 DRAG     it sails along the drag lane toward the flats' edge, Big Mercy skidding behind on three cables
//                    (CABLE targets, tag mercyCable), each covered by a winch turret; rocket volleys at the frame every
//                    20 s while the bridge lives; two escort rakers; the deck sweeper throws the frame off the moving deck;
//   phase 1.5 ANCHOR it runs on 120 m, drops four spike anchors and turns broadside to the frame (flag tally:anchored);
//   phase 2 DECK     the mainmast (16,000 AP, ×0.25 from beyond 60 m) is the boss bar THE TALLY; boarding cranes grab,
//                    deck turrets and the sweeper keep the deck busy; the scripted Hold shot (holdShot event);
//   phase 3 CAPSIZE  the mast falls, the hull slews on its starboard anchors and rolls onto its side; then a smoking
//                    wreck for the rest of the level (flag tally:wreck).
// The unit itself is not targetable; in phase 2 its ap/apMax mirror the mainmast so the engine's boss bar reads it.
// Its hull colliders (three oboxes, the deck at +11 m) move with it and are re-hashed every 0.25 s. Checkpoints restore it
// through restore('drag' | 'anchored' | 'wreck') from mission flags.
import * as THREE from 'three';
import { Unit } from '../../src/actors/enemy.js';
import { clamp, damp, dampAng, yawTo, angWrap, simDeferred } from '../../src/core/util.js';
import { rig, flat } from '../level01/models.js';
import { glowSprite, setGlowSize, disposeGlow } from '../level01/actors.js';
import { Builder, mats2, slab, side, front, top, cyl, ball, torus, chamferRect, cached, shared, PI } from './kit2.js';
import * as KIT from '../../src/art/kit.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const DECK = 11;
const LAMPS = [...[-1, 1].flatMap(s => [-28, -14, 0, 14, 28].map(z => [s * 8.3, 12.6, z])), [-4, 22, 31], [4, 22, 31]];

// ════════════════════════════════════════════════════════════════════════════════════ the model (≤ 24 draw calls)
function tallyModel(ctx) {
  const M = mats2(ctx);
  const hullP = [[-40, 3], [-34, 9], [-20, 11], [30, 11], [40, 8], [40, 2], [-32, 1.5]];
  const sailPanel = (h, w, i) => side([[0, 0], [0.6, h * 0.36], [w, h * 0.3], [w - 0.4, 0]].map(([z, y]) => [z, y + i * h * 0.34]), 0.12, 0.03);
  const sails = (mh, w) => {
    const out = [];
    for (let i = 0; i < 3; i++) out.push([sailPanel(mh * 0.62, w, i), i === 1 ? M.sail : M.oxide, 0, mh * 0.28, 0.4]);
    out.push([side([[w * 0.2, mh * 0.5], [w * 0.5, mh * 0.6], [w * 0.8, mh * 0.48], [w * 0.8, mh * 0.53], [w * 0.5, mh * 0.66], [w * 0.2, mh * 0.55]], 0.16, 0.02), M.dark, 0.05, 0, 0.4]);
    out.push([cyl(0.25, 0.25, w + 1, 6), M.steel, 0, mh * 0.28, w / 2 + 0.4, PI / 2, 0, 0]);
    out.push([cyl(0.25, 0.25, w + 1, 6), M.steel, 0, mh * 0.92, w / 2 + 0.4, PI / 2, 0, 0]);
    return out;
  };
  const mast = (h, x, z) => [[cyl(0.5, 0.8, h, 10), M.iron, x, DECK + h / 2, z], [torus(0.85, 0.15, 4, 12), M.hazard, x, DECK + h * 0.4, z, PI / 2, 0, 0]];
  const hull = [
    [side(hullP, 16, 0.5), M.iron, 0, 0, 0],
    // armour belts and riveted seams, oxide topsides with hazard chevrons
    ...[3.6, 6.8].map(y => [side([[-33, y - 0.8], [36, y - 0.8], [36, y + 0.8], [-33, y + 0.8]], 16.4, 0.12), M.oxide, 0, 0, 0]),
    [side([[-21, 10.2], [30, 10.2], [30, 11.2], [-21, 11.2]], 16.2, 0.06), M.dark, 0, 0, 0],
    ...[-1, 1].flatMap(s => [0, 1, 2, 3, 4].map(i => [front([[-1.4, -0.24], [0, 0.4], [1.4, -0.24], [1.4, 0.06], [0, 0.7], [-1.4, 0.06]], 0.06, 0.01), M.hazard, s * 8.25, 8.2, -22 + i * 11, 0, s * PI / 2, 0])),
    // running gear: six turbine-wheel bogies in fenders, the stern ducts
    ...[[-1, -24], [1, -24], [-1, 18], [1, 18]].flatMap(([s, z]) => [
      [cyl(2.5, 2.5, 1.6, 16), M.dark, s * 7.4, 2.5, z, 0, 0, PI / 2], [cyl(1.7, 1.7, 1.7, 12), M.iron, s * 7.4, 2.5, z, 0, 0, PI / 2],
      [side([[-3.4, 2.0], [-2.6, 5.4], [2.6, 5.4], [3.4, 2.0]], 1.2, 0.12), M.oxide, s * 8.4, 0, z]]),
    [cyl(2.5, 2.5, 1.6, 16), M.dark, 0, 2.5, -33, 0, 0, PI / 2], [cyl(2.5, 2.5, 1.6, 16), M.dark, 0, 2.5, 36, 0, 0, PI / 2],
    ...[-1, 1].flatMap(s => [[torus(2.0, 0.4, 6, 16), M.iron, s * 4, 6, 40.6], [cyl(0.5, 0.5, 2, 8), M.dark, s * 4, 6, 40.2, PI / 2, 0, 0]]),
    // the foremast and mizzen (static) with their sails, set on the hull
    ...mast(42, 0, -26), ...sails(42, 9).map(([g, m, x, y, z, rx, ry, rz]) => [g, m, x, DECK + y, -26 + z, rx, ry, rz]),
    ...mast(38, 0, 22), ...sails(38, 8).map(([g, m, x, y, z, rx, ry, rz]) => [g, m, x, DECK + y, 22 + z, rx, ry, rz]),
    // the mast step: a riveted housing with a glowing amber collar (the mainmast's weak point)
    [cyl(2.6, 3.0, 2.2, 14), M.iron, 0, DECK + 1.1, -2], [cyl(1.6, 1.6, 0.6, 14), M.amber, 0, DECK + 2.4, -2],
    // the bridge aft: a two-storey armoured deckhouse with amber slit windows, and the rocket battery's base on the foredeck
    [slab(12, 6, 10, 0.5), M.iron, 0, DECK + 3, 30], [slab(10, 4.6, 8, 0.45), M.oxide, 0, DECK + 8.2, 30.4],
    [slab(10.2, 0.6, 0.2, 0.05), M.amber, 0, DECK + 4.2, 24.9], [slab(8.2, 0.6, 0.2, 0.05), M.amber, 0, DECK + 8.8, 26.3],
    [cyl(2.4, 2.8, 1.0, 12), M.iron, 0, DECK + 0.5, -18],
    // the name in white Dredge stencil (a sign mesh is added by the runtime) and deck furniture: crates, coils, a capstan
    ...[[-5, -10], [5, -12], [-5, 8], [5, 10]].map(([x, z]) => [slab(2.4, 1.6, 2.4, 0.12), M.drum, x, DECK + 0.8, z]),
    [cyl(1.0, 1.2, 1.2, 10), M.steel, 3, DECK + 0.6, -32],
    ...LAMPS.flatMap(([x, y, z]) => [[slab(0.9, 0.55, 0.7, 0.08), M.iron, x, y, z], [slab(1.0, 0.14, 0.8, 0.03), M.hazard, x, y + 0.34, z]]),
  ];
  const winch = (x) => ({ pivot: [x, DECK, 31.5 - 9], parent: 'hull', items: [
    [cyl(1.6, 1.9, 1.4, 12), M.iron, 0, 0.7, 0], [slab(2.8, 1.6, 3.0, 0.2), M.oxide, 0, 2.0, 0],
    [cyl(0.9, 0.9, 2.0, 12), M.dark, 0, 1.4, 1.6, 0, 0, PI / 2],                      // the cable drum
    ...[-0.5, 0.5].map(xx => [cyl(0.14, 0.16, 2.6, 8), M.steel, xx, 2.3, -2.4, PI / 2, 0, 0]) ],
    anchors: [{ name: 'muzzle', at: [0, 2.3, -3.6] }, { name: 'drum', at: [0, 1.4, 2.6] }] });
  const crane = (s) => ({ pivot: [s * 7.2, DECK, -6], parent: 'hull', items: [
    [cyl(1.2, 1.4, 2.4, 10), M.iron, 0, 1.2, 0], [KIT.truss(18, 1.6, 1.6, 6, 0.2), M.hazard, 0, 2.4, 0, 0, 0, s * (PI / 2 - 0.5)],
    [cyl(0.1, 0.1, 6, 6), M.dark, s * 15.6, 9.5, 0] ],
    anchors: [{ name: 'tip', at: [s * 15.6, 12.5, 0] }] });
  const claw = (s) => ({ pivot: [s * 15.6, 6.4, 0], parent: s < 0 ? 'craneP' : 'craneS', items: [
    [slab(1.6, 1.0, 1.6, 0.15), M.iron, 0, 0, 0],
    ...[0, 1, 2].map(i => [side([[0, 0], [0.3, -1.6], [0.9, -2.4], [0.6, -2.6], [-0.1, -1.6]], 0.3, 0.05), M.steel, Math.sin(i * 2.1) * 0.6, -0.4, Math.cos(i * 2.1) * 0.6, 0, i * 2.1, 0]) ],
    anchors: [{ name: 'lamp', at: [0, 0.6, 0], glow: { color: '#ffb04a', size: 1.0, intensity: 2.5, pulse: 'flicker' } }, { name: 'grip', at: [0, -2.2, 0] }] });
  const anchorArm = (sx, sz) => ({ pivot: [sx * 8, 4, sz], parent: 'hull', items: [
    [slab(1.2, 1.2, 6, 0.15), M.iron, 0, 0, -sx * 0, 0, 0, 0], [cyl(0.15, 0.9, 4, 8), M.dark, 0, -3.5, 0] ] });
  return { key: 'l02tally', parts: {
    hull: { pivot: [0, 0, 0], items: hull, anchors: [
      { name: 'cab', at: [0, DECK + 8.8, 26.1], glow: { color: '#ffb36b', size: 2.2, intensity: 2.5, pulse: 'flicker' } },
      { name: 'turret0', at: [-4.5, DECK + 0.2, -30] }, { name: 'turret1', at: [4.5, DECK + 0.2, -30] },
      { name: 'stern', at: [0, 6, 42] }, { name: 'bridge', at: [0, DECK + 6, 30] }, { name: 'sweeper', at: [0, DECK + 11.2, 30] },
      { name: 'step', at: [0, DECK + 2.4, -2] }, { name: 'battery', at: [0, DECK + 2.2, -18] },
      ...LAMPS.map(([x, y, z], i) => ({ name: 'lamp' + i, at: [x, y - 0.35, z], glow: { color: '#ff9a2e', size: 1.7, intensity: 3, pulse: 'flicker', phase: (i * 0.29) % 1 } }))] },
    mainmast: { pivot: [0, DECK + 2.4, -2], parent: 'hull', items: [
      [cyl(0.6, 1.0, 55, 12), M.iron, 0, 27.5, 0], ...[14, 30, 46].map(y => [torus(1.0 - y * 0.006, 0.16, 4, 12), M.hazard, 0, y, 0, PI / 2, 0, 0]),
      ...sails(52, 11).map(([g, m, x, y, z, rx, ry, rz]) => [g, m, x, y + 2, z, rx, ry, rz]) ] },
    battery: { pivot: [0, DECK + 1.6, -18], parent: 'hull', items: [
      [slab(3.4, 2.0, 3.4, 0.2), M.iron, 0, 0.8, 0],
      ...[0, 1, 2, 3].flatMap(i => [0, 1, 2].map(j => [cyl(0.24, 0.24, 2.4, 8), M.dark, -1.1 + j * 1.1, 1.0 + i * 0.5 - 0.6, -0.2, -0.6, 0, 0])) ] },
    sweeper: { pivot: [0, DECK + 11.2, 30], parent: 'hull', items: [
      [cyl(0.9, 1.1, 0.8, 10), M.iron, 0, 0.4, 0], [cyl(0.5, 1.2, 3.6, 12), M.dark, 0, 1.0, -2.0, PI / 2, 0, 0] ],
      anchors: [{ name: 'mouth', at: [0, 1.0, -3.9] }] },
    winchP: winch(-5), winchC: winch(0), winchS: winch(5),
    craneP: crane(-1), craneS: crane(1), clawP: claw(-1), clawS: claw(1),
    anchor0: anchorArm(-1, -34), anchor1: anchorArm(1, -34), anchor2: anchorArm(-1, 34), anchor3: anchorArm(1, 34),
  } };
}

/** LOD1 (and the skyline version): the whole ship merged into one vertex-coloured mesh */
export function tallyLodGeo(ctx) {
  const b = cached(ctx, 'l02:tally_lod1', (B) => { flat(B, tallyModel(ctx), new THREE.Matrix4()); }, { lod: true });
  return b.lod;
}
export { tallyModel };

// ════════════════════════════════════════════════════════════════════════════════════ child targets
function child(tally, o) {
  const t = {
    id: undefined, name: o.name, kind: o.kind, team: 'enemy', tags: new Set([...(o.tags || []), 'tally']),
    alive: true, targetable: o.targetable !== false, objective: !!o.objective, boss: false,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), ap: o.ap, apMax: o.ap, imp: 0, impMax: o.impMax ?? Infinity,
    stagT: 0, stagDur: o.stag ?? 0, lastHit: -9, invuln: !!o.invuln, hitR: o.hitR ?? 3, windup: 0, slowT: 0,
    part: o.part || null, local: o.local || null, tally, root: o.part || null,
    center(out = new THREE.Vector3()) { return out.copy(t.pos); },
    hitTest(p) { return p.distanceToSquared(t.pos) < t.hitR * t.hitR; },
    onDamage(info) { o.onDamage?.(t, info); if (!info.blocked) tally.ctx.fx?.sparks?.(t.pos, 4, [1, 0.6, 0.2], 14); },
    onDeath(info) { o.onDeath?.(t, info); },
  };
  for (const tg of tally.tags) if (typeof tg === 'string' && tg.startsWith('enc:')) t.tags.add(tg);
  if (o.haul) t.haul = { part: o.haul, glint: [0, -1.2, 0], heavy: false, taken: false };
  return t;
}

// ════════════════════════════════════════════════════════════════════════════════════ the unit
export class Tally extends Unit {
  constructor(ctx, pos, o, L) {
    const cfg = o.config || {};
    super(ctx, { kind: 'tally', name: 'THE TALLY', pos, apMax: cfg.mast || 16000, impMax: Infinity, hitR: 20, hitY: 10, rad: 22, hgt: 30,
                 faction: 'dredge', config: cfg, targetable: false, boss: false, immovable: true });
    this.L = L; this.cfg = cfg;
    this.alwaysActive = true; this.ghost = true; this.keepMesh = true; this.targetable = false;
    const r = rig(ctx, tallyModel(ctx));
    this.model = r.root; this.parts = r.parts;
    this.tilt = new THREE.Group(); this.tilt.add(this.model); this.root.add(this.tilt);
    this.lod = new THREE.Mesh(tallyLodGeo(ctx), mats2(ctx).lod); this.lod.visible = false; this.lod.castShadow = false;
    this.tilt.add(this.lod);
    // the name on both bows (white Dredge stencil) and the tally-mark emblem
    for (const s of [-1, 1]) {
      const sg = L.signMesh?.('TALLY  ||||/', 9, 1.6, { bg: '#2f2b29', color: '#ece6d8', stencil: true, weathered: 0.5, w: 512, h: 96 });
      if (sg) { sg.position.set(s * 8.05, 7.6, -27); sg.rotation.y = s * PI / 2; this.parts.hull.add(sg); }
    }
    this.phase = 0; this.d = 0; this.speed = 0; this.t = 0; this.colT = 0; this.cols = [];
    this.kids = {}; this.cables = []; this.turrets = []; this.escorts = 0; this.escortT = 0; this.escortTotal = 0;
    this.volleyT = 14; this.sweep = { t: 0, tele: 0, cd: 9 }; this.deckT = 0; this.runOverT = 0;
    this.mastFall = 0; this.cap = null; this.roll = 0; this.heel = 0; this.anchorDrop = 0;
    this.yaw = o.yaw ?? 0;
    this.sweeperGlow = glowSprite('#ff3b1f', 4, 0.9); this.sweeperGlow.visible = false;
    this.parts.sweeper.getObjectByName('mouth')?.add(this.sweeperGlow);
    this.mastGlow = glowSprite('#ffb04a', 7, 0.8); this.parts.hull.getObjectByName('step')?.add(this.mastGlow);
    L.tally = this;
  }
  onSpawned() { this.ensureKids(); }
  // ── the lane (L2 §7.4): from BM₀ to the flats' edge, in route-relative offsets ──
  laneInit(s0) {
    const R = this.ctx.world.route, lane = this.L.DATA.flats.lane;
    this.s0 = s0;
    this.lanePts = lane.map(([ds, l]) => R.toWorld(s0 + ds, l, new THREE.Vector3()));
    this.laneCum = [0];
    for (let i = 1; i < this.lanePts.length; i++) this.laneCum.push(this.laneCum[i - 1] + this.lanePts[i].distanceTo(this.lanePts[i - 1]));
    this.laneLen = this.laneCum[this.laneCum.length - 1];
  }
  lane(d, out = new THREE.Vector3()) {
    const P = this.lanePts, C = this.laneCum, n = P.length;
    if (d <= 0) { out.copy(P[0]).addScaledVector(_d.subVectors(P[1], P[0]).normalize(), d); return out; }
    if (d >= this.laneLen) { out.copy(P[n - 1]).addScaledVector(_d.subVectors(P[n - 1], P[n - 2]).normalize(), d - this.laneLen); return out; }
    let i = 0; while (i < n - 2 && C[i + 1] < d) i++;
    const k = (d - C[i]) / (C[i + 1] - C[i]);
    return out.lerpVectors(P[i], P[i + 1], k);
  }
  laneYaw(d) {
    const a = this.lane(d - 4, new THREE.Vector3()), b = this.lane(d + 4, new THREE.Vector3());
    return yawTo(b.x - a.x, b.z - a.z);
  }
  get progress() { return this.laneLen ? clamp(this.d / this.laneLen, 0, 1) : 0; }
  // ── the child targets ──
  ensureKids() {
    if (this.kids.mast) return;
    const ctx = this.ctx, cfg = this.cfg, self = this;
    const K = this.kids;
    for (const [i, name] of ['P', 'C', 'S'].entries()) {
      K['winch' + name] = child(this, { name: 'WINCH TURRET', kind: 'winch', ap: cfg.winches ?? 3000, impMax: 900, stag: 2.0, hitR: 3.6,
        tags: ['winch'], part: this.parts['winch' + name], local: [0, 2, 0],
        onDeath: (t, info) => { self.releaseCable(i, info?.source); ctx.fx?.explosion?.(t.pos, 1.8); ctx.audio?.play?.('metalGroan', t.pos); } });
    }
    K.bridge = child(this, { name: 'BRIDGE', kind: 'bridge', ap: cfg.bridge ?? 6000, impMax: 1800, stag: 2.5, hitR: 6.5, tags: ['bridge'],
      part: this.parts.hull, local: [0, DECK + 5.5, 30],
      onDeath: (t) => { ctx.fx?.explosion?.(t.pos, 2.6); ctx.audio?.play?.('metalGroan', t.pos); self.setDead('bridge'); } });
    for (const s of ['P', 'S']) {
      K['crane' + s] = child(this, { name: 'BOARDING CRANE', kind: 'crane', ap: cfg.cranes?.ap ?? 2800, impMax: 900, stag: 2.5, hitR: 3.2,
        tags: ['crane'], part: this.parts['claw' + s], local: [0, -0.6, 0], haul: cfg.cranes?.haul,
        onDeath: (t) => { ctx.fx?.explosion?.(t.pos, 1.6); self.parts['claw' + s].visible = false; self.parts['crane' + s].rotation.z = (s === 'P' ? 1 : -1) * 0.6; self.endGrab(t); self.setDead('crane' + s); } });
    }
    K.mast = child(this, { name: 'MAINMAST', kind: 'mainmast', ap: cfg.mast ?? 16000, impMax: 3000, stag: 3.0, hitR: 4.2, tags: ['mainmast'],
      part: this.parts.hull, local: [0, DECK + 4.5, -2], invuln: true, objective: true,
      onDamage: (t, info) => self.mastHit(t, info), onDeath: () => self.onMastDead() });
    for (const t of Object.values(K)) { this.placeKid(t); ctx.combat?.register?.(t); }
    // the deck turrets (the prototype turret in Dredge colours), carried on their mounts
    for (let i = 0; i < (cfg.deckTurrets ?? 2); i++) {
      const u = ctx.enemies?.spawn?.('turret', this.anchorWorld('turret' + i, new THREE.Vector3()), { faction: 'dredge', name: 'DECK TURRET', tags: ['tallyTurret'], ap: 2000 });
      if (u) { u.immovable = true; u.alwaysActive = true; u.impMax = 800; this.turrets.push(u); }
    }
  }
  setDead(id) {
    const list = new Set(this.L.flag('tally:dead') || []); list.add(id);
    this.L.setFlag('tally:dead', [...list]);
  }
  placeKid(t) {
    if (!t.part) return;
    t.part.updateMatrixWorld(true);
    t.pos.set(...(t.local || [0, 0, 0])).applyMatrix4(t.part.matrixWorld);
  }
  anchorWorld(name, out) {
    this.syncRoot(); this.root.updateMatrixWorld(true);
    const a = this.parts.hull.getObjectByName(name) || this.model.getObjectByName(name);
    return a ? a.getWorldPosition(out) : out.copy(this.pos);
  }
  // ── the cables on Big Mercy ──
  makeCables() {
    const ctx = this.ctx, self = this;
    this.dropCables(true);
    for (let i = 0; i < 3; i++) {
      const c = child(this, { name: 'CABLE', kind: 'cable', ap: this.cfg.cables ?? 1200, hitR: 3, tags: ['mercyCable', 'cable'], objective: true,
        onDamage: (t, info) => { if (!info.blocked && info.source?.team === 'player' && (info.source.kind === 'blade' || info.source.weapon === 'blade')) { t.ap = 0; info.killed = true; } },
        onDeath: (t) => self.onCableCut(i, t) });
      c.idx = i; c.from = new THREE.Vector3(); c.to = new THREE.Vector3();
      this.cables[i] = c;
      ctx.combat?.register?.(c);
      if (!this.cableMesh) this.cableMesh = [];
      if (!this.cableMesh[i]) {
        const g = new THREE.CylinderGeometry(0.16, 0.16, 1, 6); g.translate(0, 0.5, 0); g.rotateX(PI / 2);
        const m = new THREE.Mesh(g, mats2(ctx).cable); m.castShadow = false; m.frustumCulled = false; ctx.levelRoot.add(m);
        this.cableMesh[i] = m;
      }
      this.cableMesh[i].visible = true;
    }
    this.updateCables();
  }
  dropCables(silent) {
    for (const c of this.cables) if (c) { if (c.alive && silent) { c.alive = false; } this.ctx.combat?.unregister?.(c); }
    this.cables = [];
    for (const m of this.cableMesh || []) m.visible = false;
  }
  cablesAttached() { return this.cables.filter(c => c && c.alive).length; }
  releaseCable(i, source) {
    const c = this.cables[i];
    if (c?.alive) this.ctx.combat?.kill?.(c, source || { team: 'player', kind: 'release' });
  }
  onCableCut(i, c) {
    const ctx = this.ctx;
    ctx.fx?.sparks?.(c.pos, 24, [1, 0.8, 0.5], 24);
    ctx.audio?.play?.('cableSnap', c.pos);
    if (this.cableMesh?.[i]) this.cableMesh[i].visible = false;
    this.L.counters.cablesCut = (this.L.counters.cablesCut || 0) + 1;
  }
  updateCables() {
    const bm = this.L.convoy?.byId.get(3);
    for (let i = 0; i < 3; i++) {
      const c = this.cables[i]; if (!c || !c.alive) continue;
      const w = this.kids['winch' + ['P', 'C', 'S'][i]];
      this.parts['winch' + ['P', 'C', 'S'][i]].getObjectByName('drum')?.getWorldPosition(c.from) ?? c.from.copy(this.pos);
      if (bm) {
        const fx = -Math.sin(bm.yaw), fz = -Math.cos(bm.yaw), rx = Math.cos(bm.yaw), rz = -Math.sin(bm.yaw);
        const along = [-14, -1, 12][i], across = [-1.5, 1.5, 0][i];
        c.to.set(bm.pos.x - fx * along + rx * across, bm.pos.y + 6, bm.pos.z - fz * along + rz * across);
      } else c.to.copy(c.from).y -= 5;
      // sagging slightly: the target at the midpoint, a little low
      c.pos.lerpVectors(c.from, c.to, 0.5); c.pos.y -= 1.5;
      const m = this.cableMesh?.[i];
      if (m) { m.visible = true; m.position.copy(c.from); m.lookAt(c.to); m.scale.set(1, 1, c.from.distanceTo(c.to)); }
      void w;
    }
  }
  // ── phases ──
  /** the harpoon (beat 9): swing in beside Big Mercy, harpoons at t 4.5; returns when the drag can start */
  harpoon() {
    const L = this.L, C = L.convoy;
    this.ensureKids();
    const bm = C?.byId.get(3);
    const s0 = bm ? C.route.closest(bm.pos.x, bm.pos.z).s : (L.flag('mercy:s0') ?? L.DATA.tally.mercyS0);
    this.laneInit(s0);
    L.setFlag('mercy:s0', Math.round(s0));
    this.d = 0;
    if (bm) { bm.state = 'mercy'; bm.mercyFrom = bm.pos.clone(); bm.mercyT = 0; }
    // the approach: from out on the flats, round to its drag station 140 m along the lane
    const end = this.lane(this.L.DATA.tally.sternGap + 40, new THREE.Vector3());
    const yEnd = this.laneYaw(this.L.DATA.tally.sternGap + 40);
    const fx = -Math.sin(yEnd), fz = -Math.cos(yEnd);
    this.arrive = { t: 0, from: new THREE.Vector3(end.x + fz * 170 - fx * 120, 0, end.z - fx * 170 - fz * 120), to: end, yTo: yEnd, fired: false };
    this.pos.copy(this.arrive.from); this.yaw = yawTo(end.x - this.pos.x, end.z - this.pos.z);
    this.phase = 0;
    L.setFlag('tally:phase', 0);
  }
  startDrag() {
    if (this.phase >= 1) return;
    if (!this.lanePts) { const C = this.L.convoy, bm = C?.byId.get(3); this.laneInit(bm ? C.route.closest(bm.pos.x, bm.pos.z).s : this.L.DATA.tally.mercyS0); }
    if (!this.cables.length) this.makeCables();
    this.phase = 1; this.arrive = null;
    this.L.setFlag('tally:phase', 1);
    const bm = this.L.convoy?.byId.get(3); if (bm) bm.state = 'mercy';
  }
  /** checkpoint restores */
  restore(kind) {
    const L = this.L, ctx = this.ctx;
    this.ensureKids();
    const dead = new Set(L.flag('tally:dead') || []);
    for (const id of dead) { const t = this.kids[id]; if (t?.alive) this.killSilently(t); }
    if (kind === 'drag') {
      const s0 = L.flag('mercy:s0') ?? L.DATA.tally.mercyS0;
      this.laneInit(s0);
      this.d = 0; this.phase = 0; this.arrive = null;
      const bm = L.convoy?.byId.get(3);
      if (bm) { bm.state = 'mercy'; this.lane(0, bm.pos); bm.yaw = this.laneYaw(0); }
      this.lane(L.DATA.tally.sternGap + 40, this.pos); this.yaw = this.laneYaw(L.DATA.tally.sternGap + 40);
      this.pos.y = L.groundAt(this.pos.x, this.pos.z);
      this.startDrag();
    } else if (kind === 'anchored' || kind === 'wreck') {
      this.dropCables(true);
      for (const k of ['winchP', 'winchC', 'winchS']) if (this.kids[k]?.alive) this.killSilently(this.kids[k]);
      for (const k of ['winchP', 'winchC', 'winchS']) this.parts[k].visible = kind !== 'wreck' ? true : false;
      const a = L.flag(kind === 'wreck' ? 'tally:wreck' : 'tally:anchor') || L.flag('tally:anchor') || this.defaultAnchor();
      this.pos.set(a.x, L.groundAt(a.x, a.z), a.z); this.yaw = a.yaw;
      if (!this.lanePts) this.laneInit(L.flag('mercy:s0') ?? L.DATA.tally.mercyS0);
      const bm = L.convoy?.byId.get(3);
      if (bm && !L.flag('bigMercyLost')) { bm.state = 'mercyStopped'; const at = L.flag('mercy:stop'); if (at) { bm.pos.set(at.x, 0, at.z); bm.yaw = at.yaw; } else { this.lane(this.laneLen * 0.4, bm.pos); bm.yaw = this.laneYaw(this.laneLen * 0.4); } }
      this.anchorDrop = 1;
      if (kind === 'anchored') { this.phase = 2; L.setFlag('tally:anchored', true); L.setFlag('tally:phase', 2); this.boss = true; this.kids.mast.invuln = false; }
      else { this.toWreck(true); }
    }
    this.syncRoot(); this.rehash();
  }
  defaultAnchor() {
    if (!this.lanePts) this.laneInit(this.L.flag('mercy:s0') ?? this.L.DATA.tally.mercyS0);
    const p = this.lane(this.laneLen * 0.55 + 140, new THREE.Vector3());
    return { x: p.x, z: p.z, yaw: this.laneYaw(this.laneLen * 0.55) + PI / 2 };
  }
  killSilently(t) {
    t.alive = false; t.ap = 0;
    this.ctx.combat?.unregister?.(t);
    if (t.kind === 'crane') { const s = t === this.kids.craneP ? 'P' : 'S'; this.parts['claw' + s].visible = false; }
    if (t.kind === 'winch') { const k = Object.keys(this.kids).find(x => this.kids[x] === t); if (k) this.parts[k].visible = false; }
  }
  /** after Big Mercy is free (or lost): run on 120 m, drop the spike anchors, turn broadside to the frame over 6 s */
  anchorUp() {
    if (this.phase >= 1.5) return;
    this.phase = 1.5; this.anc = { t: 0, run: 0, stage: 'run', y0: this.yaw };
    this.dropCables(true);
    this.L.setFlag('tally:phase', 1.5);
  }
  onMastDead() {
    this.L.counters.mastDead = (this.L.counters.mastDead || 0) + 1;
    this.ctx.fx?.explosion?.(this.kids.mast.pos, 3);
    this.ctx.audio?.play?.('metalGroan', this.kids.mast.pos);
  }
  mastHit(t, info) {
    if (info.blocked || info.amount <= 0) return;
    // hits from more than 60 m away do ×0.25 (L2 §7.2): refund three quarters of it
    const src = info.source?.pos || info.source?.owner?.pos;
    const p = this.ctx.player;
    const from = src || p?.pos;
    if (from && from.distanceTo(t.pos) > this.L.DATA.tally.mastFar) {
      t.ap = Math.min(t.apMax, t.ap + info.amount * (1 - this.L.DATA.tally.mastFarScale));
      if (t.ap > 0 && info.killed) { info.killed = false; }
      this.L.counters.mastFar = (this.L.counters.mastFar || 0) + 1;
    }
    if (info.staggered) { this.mastShake = 2.5; this.ctx.cameraRig?.addShake?.(0.4); }
  }
  // ── update ──
  update(dt) {
    this.baseUpdate(dt);
    this.ensureKids();
    const L = this.L, p = L.player();
    this.t += dt;
    if (this.mastShake > 0) this.mastShake -= dt;
    switch (this.phase) {
      case 0: this.updateArrive(dt); break;
      case 1: this.updateDrag(dt, p); break;
      case 1.5: this.updateAnchor(dt, p); break;
      case 2: this.updateDeck(dt, p); break;
      case 3: this.updateCapsize(dt); break;
      default: break;
    }
    if (this.phase <= 2) {
      this.updateWinches(dt, p);
      this.updateCranes(dt, p);
      this.carryTurrets();
      this.updateCables();
      this.trackHullHits();
    }
    for (const k of Object.values(this.kids)) {
      this.placeKid(k);
      if (k.stagT > 0) k.stagT = Math.max(0, k.stagT - dt);
      if (this.ctx.clock.time - k.lastHit > 1.6) k.imp = Math.max(0, k.imp - (k.impMax === Infinity ? 0 : k.impMax * 0.35 * dt));
    }
    if (this.phase === 2) { this.apMax = this.kids.mast.apMax; this.ap = Math.max(1, this.kids.mast.ap); }
    if ((this.colT -= dt) <= 0) { this.colT = 0.25; this.rehash(); }
    if (this.phase < 3 && this.speed > 0.5) this.runOver(dt, p);
  }
  updateArrive(dt) {
    const A = this.arrive; if (!A) return;
    A.t += dt;
    const k = clamp(A.t / 5, 0, 1), e = k * k * (3 - 2 * k);
    const x = A.from.x + (A.to.x - A.from.x) * e, z = A.from.z + (A.to.z - A.from.z) * e;
    this.speed = Math.hypot(x - this.pos.x, z - this.pos.z) / Math.max(dt, 1e-3);
    this.pos.set(x, this.L.groundAt(x, z), z);
    this.yaw = dampAng(this.yaw, k < 0.6 ? yawTo(A.to.x - A.from.x, A.to.z - A.from.z) : A.yTo, 1.6, dt);
    // the harpoons punch in (sparks, a spray of water from one tank car) and Big Mercy is yanked off the road
    if (A.t >= 4.5 && !A.fired) {
      A.fired = true;
      this.makeCables();
      const bm = this.L.convoy?.byId.get(3);
      for (const c of this.cables) { this.ctx.fx?.sparks?.(c.to, 24, [1, 0.8, 0.5], 24); }
      if (bm) { this.ctx.fx?.emitter?.('steam', _v.set(bm.pos.x, bm.pos.y + 5, bm.pos.z), { rate: 3, scale: 1.2, color: [0.85, 0.9, 1], life: 3 }); this.ctx.audio?.play?.('harpoon', bm.pos); this.ctx.audio?.play?.('rigHorn', bm.pos); }
      this.ctx.cameraRig?.addShake?.(0.6);
    }
    if (A.fired) this.dragBM(dt, 2.0);
  }
  /** Big Mercy on the lane at d (yanked: eased in from her slot over the first seconds) */
  dragBM(dt, speed) {
    const bm = this.L.convoy?.byId.get(3);
    if (!bm || bm.state === 'gone') return;
    bm.state = 'mercy';
    this.lane(this.d, _v);
    bm.pos.x = damp(bm.pos.x, _v.x, 2.5, dt); bm.pos.z = damp(bm.pos.z, _v.z, 2.5, dt);
    bm.yaw = dampAng(bm.yaw, this.laneYaw(this.d), 1.2, dt);
    bm.roll = Math.sin(this.t * 6) * 0.025 * Math.min(1, speed);
    if (speed > 0.5 && Math.random() < dt * 10) this.ctx.fx?.dust?.(_w.set(bm.pos.x, bm.pos.y + 0.4, bm.pos.z), 5, 8, [0.95, 0.93, 0.9]);
  }
  updateDrag(dt, p) {
    const L = this.L, D = L.DATA.tally;
    const n = this.cablesAttached();
    const want = n >= 3 ? D.drag[0] : n === 2 ? D.drag[1] : n === 1 ? D.drag[2] : 0;
    this.speed = damp(this.speed, want, 1.5, dt);
    this.d += this.speed * dt;
    L.setFlag('mercy:d', Math.round(this.d * 10) / 10);
    this.dragBM(dt, this.speed);
    this.lane(this.d + D.sternGap + 40, _v);
    this.pos.set(_v.x, L.groundAt(_v.x, _v.z), _v.z);
    this.yaw = dampAng(this.yaw, this.laneYaw(this.d + D.sternGap + 40), 1.0, dt);
    // the rocket battery: a six-rocket volley at the frame every 20 s while the bridge lives
    if (this.kids.bridge.alive && p) {
      this.volleyT -= dt;
      if (this.volleyT <= 0) { this.volleyT = D.volley.every; L.volleys?.fire(99, { count: D.volley.count, from: this.anchorWorld('battery', new THREE.Vector3()), local: true }); this.parts.battery.rotation.y = angWrap(yawTo(p.pos.x - this.pos.x, p.pos.z - this.pos.z) - this.yaw); }
    }
    // two escort rakers circle the drag (2 alive at most, 4 in all), a replacement 15 s after one dies
    const E = this.cfg.escort || { max: 2, total: 4, every: 15 };
    const alive = this.ctx.enemies?.count?.({ tag: 'tallyEscort' }) ?? 0;
    if (alive < E.max && this.escortTotal < E.total) {
      this.escortT -= dt;
      if (this.escortT <= 0 || this.escortTotal < E.max) {
        this.escortT = E.every;
        const a = this.lane(this.d + 60, new THREE.Vector3()), ry = this.laneYaw(this.d);
        const at = new THREE.Vector3(a.x + Math.cos(ry) * 260, 0, a.z - Math.sin(ry) * 260); at.y = L.groundAt(at.x, at.z);
        const u = this.ctx.enemies?.spawn?.('land_yacht', at, { name: 'LAND-YACHT', tags: ['tallyEscort'], config: { variant: 'raker', haul: 'sail_rig' } });
        if (u) this.escortTotal++;
      }
    }
    this.deckSweeper(dt, p, true);
    if (this.d >= this.laneLen && n > 0) L.setFlag('mercy:over', true);
  }
  updateAnchor(dt, p) {
    const A = this.anc, L = this.L;
    A.t += dt;
    if (A.stage === 'run') {
      // runs on 120 m
      this.speed = damp(this.speed, 16, 1.2, dt);
      const step = this.speed * dt; A.run += step;
      this.pos.x += -Math.sin(this.yaw) * step; this.pos.z += -Math.cos(this.yaw) * step; this.pos.y = L.groundAt(this.pos.x, this.pos.z);
      if (A.run >= L.DATA.tally.anchorRun) { A.stage = 'drop'; A.t = 0; this.speed = 0; this.anchorDrop = 0; this.ctx.audio?.play?.('metalGroan', this.pos); this.ctx.cameraRig?.addShake?.(0.5); }
    } else if (A.stage === 'drop') {
      this.anchorDrop = Math.min(1, A.t / 0.8);
      if (Math.random() < dt * 20) for (const i of [0, 1, 2, 3]) { const a = this.parts['anchor' + i]; a.getWorldPosition(_v); this.ctx.fx?.sparks?.(_v, 4, [1, 0.8, 0.5], 14); this.ctx.fx?.dust?.(_v.setY(this.L.groundAt(_v.x, _v.z)), 4, 6, [0.95, 0.95, 0.95]); }
      if (A.t >= 0.8) { A.stage = 'turn'; A.t = 0; A.y0 = this.yaw; const pp = p?.pos || this.pos; const toP = yawTo(pp.x - this.pos.x, pp.z - this.pos.z);
        const c1 = angWrap(toP + PI / 2), c2 = angWrap(toP - PI / 2); A.y1 = Math.abs(angWrap(c1 - this.yaw)) < Math.abs(angWrap(c2 - this.yaw)) ? c1 : c2; }
    } else if (A.stage === 'turn') {
      // the hull yaws on its anchors, broadside to the frame, over 6 s
      const k = clamp(A.t / 6, 0, 1), e = k * k * (3 - 2 * k);
      this.yaw = A.y0 + angWrap(A.y1 - A.y0) * e;
      if (Math.random() < dt * 8) this.ctx.fx?.dust?.(this.anchorWorld('stern', _v), 6, 10, [0.95, 0.95, 0.92]);
      if (k >= 1) {
        this.phase = 2; this.boss = true; this.kids.mast.invuln = false; this.deckT = 0;
        L.setFlag('tally:anchor', { x: Math.round(this.pos.x * 10) / 10, z: Math.round(this.pos.z * 10) / 10, yaw: Math.round(this.yaw * 1000) / 1000 });
        L.setFlag('tally:phase', 2);
        L.setFlag('tally:anchored', true);
      }
    }
  }
  updateDeck(dt, p) {
    this.deckT += dt;
    this.speed = 0;
    this.deckSweeper(dt, p, false);
    if (this.mastShake > 0) this.parts.mainmast.rotation.z = Math.sin(this.t * 14) * 0.012 * this.mastShake;
    else this.parts.mainmast.rotation.z = 0;
  }
  /** is the frame standing on the deck (its support is one of our hull colliders)? */
  onDeck(p) {
    if (!p) return false;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < 8.5 && Math.abs(lz) < 39 && p.pos.y > this.pos.y + DECK - 1.5 && p.pos.y < this.pos.y + DECK + 6 && !!p.onGround;
  }
  /** the deck sweeper: a broadside harpoon gun on the bridge roof (moving deck: throws the frame off after 1 s; anchored:
   *  a blast along the deck every 9 s with a 1.5 s red telegraph, while the bridge lives) */
  deckSweeper(dt, p, moving) {
    const S = this.sweep, ctx = this.ctx, L = this.L;
    const on = this.onDeck(p);
    if (on) L.counters.onTally = (L.counters.onTally || 0) + 1;
    if (this.scripted) return;   // the Hold shot owns the gun
    if (moving) {
      if (on) {
        S.t += dt;
        const delay = this.kids.bridge.alive ? 1.0 : 2.0;
        this.sweeperGlow.visible = Math.sin(S.t * 30) > 0;
        if (S.t >= delay) { S.t = -1.5; this.blast(p, 400, 1500, 30); }
      } else { S.t = Math.max(0, S.t - dt); this.sweeperGlow.visible = false; }
      return;
    }
    if (!this.kids.bridge.alive) { this.sweeperGlow.visible = false; this.kids.bridge.windup = 0; return; }
    if (S.tele > 0) {
      S.tele -= dt; this.kids.bridge.windup = Math.max(0, S.tele);
      this.sweeperGlow.visible = true; setGlowSize(this.sweeperGlow, 4 + Math.sin(this.t * 20) * 1.5);
      if (S.tele <= 0) { this.sweeperGlow.visible = false; this.kids.bridge.windup = 0; if (this.onDeck(p)) this.blast(p, 600, 1200, 22); ctx.fx?.shockwave?.(this.anchorWorld('sweeper', _v), 40, '#ffb48a', 0.5); }
    } else if ((S.cd -= dt) <= 0) { S.cd = L.DATA.tally.sweeper.every; S.tele = 1.5; ctx.audio?.play?.('charge', this.pos); }
  }
  blast(p, dmg, imp, push) {
    const ctx = this.ctx;
    const mouth = this.anchorWorld('sweeper', _v);
    ctx.fx?.muzzle?.(mouth, _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 'shotgun');
    ctx.audio?.play?.('cannon', mouth);
    if (!p) return;
    ctx.combat?.damage?.(p, dmg, imp, { team: 'enemy', owner: this, kind: 'sweeper', pos: mouth.clone() });
    // knocked off the side: outward across the hull, and up
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const lx = dx * c - dz * s, side = Math.sign(lx) || 1;
    p.vel.x += c * side * push; p.vel.z += -s * side * push; p.vel.y = Math.max(p.vel.y, 10);
    p.onGround = false;
    this.L.counters.deckThrown = (this.L.counters.deckThrown || 0) + 1;
  }
  /** the scripted Hold shot (L2 §7.8): the gun swings onto the frame with a 1.5 s telegraph that can't be dodged */
  sweeperShot(o = {}) {
    const d = simDeferred(), ctx = this.ctx, L = this.L, self = this;
    this.scripted = true;
    const tele = o.telegraph ?? 1.5;
    let t = 0;
    this.sweeperGlow.visible = true;
    ctx.audio?.play?.('charge', this.pos);
    const off = ctx.events.on('level:cleared', () => d.resolve());
    const step = () => {
      t += 1 / 30;
      self.sweeperGlow.visible = Math.sin(t * 30) > -0.2;
      const p = L.player();
      if (p) self.parts.sweeper.rotation.y = angWrap(yawTo(p.pos.x - self.pos.x, p.pos.z - self.pos.z) - self.yaw);
      if (t < tele) { ctx.timers.after(1 / 30, step); return; }
      self.sweeperGlow.visible = false; self.scripted = false; off?.();
      if (p) {
        const mouth = self.anchorWorld('sweeper', _v);
        ctx.fx?.muzzle?.(mouth, _w.subVectors(p.center(_c), mouth).normalize(), 'cannon');
        ctx.audio?.play?.('cannon', mouth);
        ctx.fx?.sparks?.(p.center(_c), 30, [1, 0.8, 0.5], 24);
        const S = ctx.sync;
        // with the engine's Sync: a killing hit, Hold fires (A2 E1). Without it (or if Hold can't fire), never lethal.
        const lethal = o.lethal && typeof S?.unlock === 'function' && S.holdReady === true;
        const dmg = lethal ? p.ap + 1 : Math.min(2500, p.ap * 0.5);
        if (p.invuln) p.invuln = false;
        ctx.combat?.damage?.(p, dmg, 0, { team: 'enemy', owner: self, kind: 'sweeper', pos: mouth.clone(), scripted: true });
        L.counters.holdShot = (L.counters.holdShot || 0) + 1;
        L.setFlag('p:holdShot', true);
      }
      d.resolve();
    };
    ctx.timers.after(1 / 30, step);
    return d.promise;
  }
  // ── winch turrets (twin guns, 6 × 85 at 420 m/s, every 2.8 s, out to 260 m) ──
  updateWinches(dt, p) {
    if (!p) return;
    for (const k of ['winchP', 'winchC', 'winchS']) {
      const t = this.kids[k]; if (!t?.alive) continue;
      const part = this.parts[k];
      part.rotation.y = dampAng(part.rotation.y, angWrap(yawTo(p.pos.x - t.pos.x, p.pos.z - t.pos.z) - this.yaw), 2, dt);
      if (t.stagT > 0) continue;
      t.cd = (t.cd ?? 1 + Math.random() * 2) - dt;
      if (t.burst > 0) {
        t.burstT -= dt;
        if (t.burstT <= 0) {
          t.burstT = 0.1; t.burst--;
          part.getObjectByName('muzzle')?.getWorldPosition(_v);
          this.lead(_v, p, 420, _c);
          _d.subVectors(_c, _v).normalize(); _d.x += (this.ctx.random() - 0.5) * 0.03; _d.y += (this.ctx.random() - 0.5) * 0.03;
          this.ctx.projectiles?.fire?.({ pos: _v.clone(), vel: _d.normalize().multiplyScalar(420), kind: 'ebullet', dmg: 85, imp: 40, life: 0.8, team: 'enemy', owner: this });
          this.ctx.fx?.muzzle?.(_v, _d, 'mg');
        }
      } else if (t.cd <= 0 && p.pos.distanceTo(t.pos) < 260) { t.cd = 2.8; t.burst = 6; t.burstT = 0; }
    }
  }
  // ── boarding cranes: swing the claw at the frame within 30 m (1.2 s wind-up), grab 2.5 s, 300 AP/s, lift 6 m ──
  updateCranes(dt, p) {
    for (const s of ['P', 'S']) {
      const t = this.kids['crane' + s]; if (!t?.alive) continue;
      const crane = this.parts['crane' + s], claw = this.parts['claw' + s];
      const st = t.st || (t.st = { mode: 'idle', t: 0, cd: 3 + (s === 'S' ? 2 : 0) });
      st.t += dt; st.cd -= dt;
      if (t.stagT > 0 && st.mode !== 'idle') { this.endGrab(t); st.mode = 'idle'; st.cd = 3; }
      const d = p ? p.pos.distanceTo(t.pos) : Infinity;
      if (st.mode === 'idle') {
        crane.rotation.y = damp(crane.rotation.y, Math.sin(this.t * 0.4 + (s === 'P' ? 0 : 2)) * 0.3, 1, dt);
        if (this.phase === 2 && p && st.cd <= 0 && d < 30 && t.stagT <= 0) { st.mode = 'tele'; st.t = 0; this.L.counters.craneTry = (this.L.counters.craneTry || 0) + 1; this.ctx.audio?.play?.('winch', t.pos); }
      } else if (st.mode === 'tele') {
        t.windup = Math.max(0, 1.2 - st.t);
        if (p) crane.rotation.y = dampAng(crane.rotation.y, angWrap(yawTo(p.pos.x - t.pos.x, p.pos.z - t.pos.z) - this.yaw + (s === 'P' ? PI / 2 : -PI / 2)), 2.5, dt);
        claw.scale.setScalar(1 + 0.15 * Math.sin(st.t * 12));
        if (st.t >= 1.2) {
          t.windup = 0; claw.scale.setScalar(1);
          if (p && d < 14) { st.mode = 'grab'; st.t = 0; st.grabFrom = p.pos.clone(); this.L.counters.craneGrab = (this.L.counters.craneGrab || 0) + 1; this.L.grabbedBy = t; this.ctx.audio?.play?.('hit', p.pos); }
          else { st.mode = 'idle'; st.cd = 4; }
        }
      } else if (st.mode === 'grab') {
        if (!p || st.t >= 2.5 || this.L.grabbedBy !== t) { this.endGrab(t); st.mode = 'idle'; st.cd = 5; continue; }
        // held 2.5 s, lifted 6 m, 300 AP a second (a quick boost breaks the grab)
        claw.getWorldPosition(_v);
        p.pos.x = damp(p.pos.x, _v.x, 6, dt); p.pos.z = damp(p.pos.z, _v.z, 6, dt);
        p.pos.y = damp(p.pos.y, st.grabFrom.y + 6, 3, dt); p.vel.set(0, 0, 0);
        this.ctx.combat?.damage?.(p, 300 * dt, 0, { team: 'enemy', owner: this, kind: 'crane' });
      }
    }
  }
  endGrab(t) { if (this.L.grabbedBy === t) this.L.grabbedBy = null; }
  carryTurrets() {
    for (let i = 0; i < this.turrets.length; i++) {
      const u = this.turrets[i];
      if (!u.alive) continue;
      this.anchorWorld('turret' + i, u.pos);
      u.heldT = Math.max(u.heldT || 0, 0.1); u.home?.copy?.(u.pos);
      u.syncRoot?.(); u.syncColliders?.();
    }
  }
  /** player projectiles about to hit the hull in phase 1: the "ARMOURED" hint (Level 1's trackHullHits pattern) */
  trackHullHits() {
    if (this.phase !== 1 || this.L.counters.hullHit) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const inHull = (x, y, z) => { const dx = x - this.pos.x, dz = z - this.pos.z, ly = y - this.pos.y; const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < 8.5 && Math.abs(lz) < 40 && ly > 0 && ly < DECK + 1; };
    this.ctx.projectiles?.forEach?.((pr) => {
      if (!pr.alive || pr.team !== 'player' || this.L.counters.hullHit) return;
      const dx = pr.pos.x - this.pos.x, dz = pr.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 60 * 60) return;
      for (let i = 0; i <= 6; i++) {
        _v.copy(pr.pos).addScaledVector(pr.vel, (i / 6) * 0.05);
        for (const k of Object.values(this.kids)) if (k.alive && k.pos.distanceTo(_v) < k.hitR + 2) return;
        for (const cb of this.cables) if (cb?.alive && cb.pos.distanceTo(_v) < 6) return;
        if (inHull(_v.x, _v.y, _v.z)) { this.L.counters.hullHit = 1; return; }
      }
    });
  }
  runOver(dt, p) {
    this.runOverT -= dt;
    if (!p || this.runOverT > 0) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < 8.5 && Math.abs(lz) < 40 && p.pos.y < this.pos.y + 8) {
      this.runOverT = 1;
      this.ctx.combat?.damage?.(p, 1000, 1400, { team: 'enemy', owner: this, kind: 'crush', pos: this.pos });
      const side = Math.sign(lx) || 1;
      p.pos.x += c * side * 6; p.pos.z += -s * side * 6;
      p.vel.x += c * side * 18; p.vel.z += -s * side * 18;
    }
  }
  rehash() {
    const C = this.ctx.collision; if (!C) return;
    for (const c of this.cols) C.remove(c);
    this.cols.length = 0;
    if (this.removeMe) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    if (this.phase >= 3 && this.cap?.done) {
      // the wreck on its side: a low long box (its keel toward the reeds)
      for (const z of [-26, 0, 26]) this.cols.push(C.obox(this.pos.x + z * s, this.pos.z + z * c, 13, 27, this.yaw, this.pos.y + 14, this.pos.y - 2, { surface: 'metal', tag: 'tally' }));
      return;
    }
    if (this.phase >= 3) return;
    for (const z of [-26, 0, 26]) this.cols.push(C.obox(this.pos.x + z * s, this.pos.z + z * c, 16, 27, this.yaw, this.pos.y + DECK, this.pos.y - 2, { surface: 'metal', tag: 'tally' }));
    // the bridge (a step up at the stern)
    this.cols.push(C.obox(this.pos.x + 30 * s, this.pos.z + 30 * c, 12, 10, this.yaw, this.pos.y + DECK + 6, this.pos.y + DECK - 1, { surface: 'metal', tag: 'tally' }));
  }
  // ── capsize (beat 13) ──
  capsize() {
    if (this.phase >= 3) return;
    this.phase = 3; this.boss = false; this.speed = 0;
    this.cap = { t: 0, y0: this.yaw, lamps: 0, done: false };
    this.L.setFlag('tally:phase', 3);
    for (const k of Object.values(this.kids)) if (k.alive) this.killSilently(k);
    for (const u of this.turrets) if (u.alive) this.ctx.combat?.kill?.(u, { team: 'neutral', kind: 'script' });
    for (const u of this.ctx.enemies?.alive?.({ tag: 'tallyEscort' }) || []) u.mode = 'flee';
    this.endGrab(this.L.grabbedBy);
    this.ctx.audio?.play?.('metalGroan', this.pos);
  }
  updateCapsize(dt) {
    const C = this.cap; if (!C || C.done) return;
    C.t += dt;
    // the mast cracks and falls across the deck to port (0 to 2 s); the hull slews round on its starboard anchors and
    // rolls onto its side into the reeds (1.5 to 6.5 s), the sodium lamps going out one by one, salt and dust
    this.mastFall = clamp(C.t / 2, 0, 1);
    const k = clamp((C.t - 1.5) / 5, 0, 1), e = k * k * (3 - 2 * k);
    this.yaw = C.y0 + 0.8 * e;
    this.heel = e * 1.62;
    if (C.t > 1.5 && C.t < 7 && Math.random() < dt * 14) { this.anchorWorld('stern', _v); this.ctx.fx?.dust?.(_v.setY(this.L.groundAt(_v.x, _v.z)), 12, 22, [0.95, 0.94, 0.9]); }
    const n = Math.floor(clamp((C.t - 2) / 4, 0, 1) * LAMPS.length);
    if (n > C.lamps) { for (let i = C.lamps; i < n; i++) { const a = this.parts.hull.getObjectByName('lamp' + i); if (a) a.userData.out = true; } C.lamps = n; }
    if (C.t > 0.2 && !C.boom) { C.boom = true; this.ctx.fx?.explosion?.(this.anchorWorld('step', _v), 3.2); this.ctx.cameraRig?.addShake?.(0.8); }
    if (C.t > 4 && !C.crash) { C.crash = true; this.ctx.audio?.play?.('collapse', this.pos); this.ctx.cameraRig?.addShake?.(1.0); }
    if (C.t >= 7) this.toWreck(false);
  }
  toWreck(instant) {
    if (!this.cap) this.cap = { t: 7, y0: this.yaw, lamps: LAMPS.length };
    this.phase = 3; this.mastFall = 1; this.heel = 1.62; this.cap.done = true; this.boss = false;
    if (instant) { for (const k of Object.values(this.kids)) if (k.alive) this.killSilently(k); this.dropCables(true); for (const u of this.turrets) if (u.alive) this.ctx.enemies?.despawn?.(u); }
    for (let i = 0; i < LAMPS.length; i++) { const a = this.parts.hull.getObjectByName('lamp' + i); if (a) a.userData.out = true; }
    this.L.setFlag('tally:wreck', { x: Math.round(this.pos.x * 10) / 10, z: Math.round(this.pos.z * 10) / 10, yaw: Math.round(this.yaw * 1000) / 1000 });
    this.L.setFlag('tally:phase', 4);
    this.team = 'neutral';
    if (!this.smoke && this.ctx.fx?.emitter) {
      this.anchorWorld('step', _v);
      this.smoke = this.ctx.fx.emitter('smoke', _v.clone(), { rate: 0.8, scale: 2.2 });
      this.fire = this.ctx.fx.emitter('fire', _v.clone(), { rate: 0.5, scale: 1.2 });
    }
    this.rehash();
  }
  syncRoot() {
    super.syncRoot();
    if (!this.parts) return;
    const P = this.parts, t = this.ctx.clock.time;
    // the heel (capsize: onto its port side, pivoting on the starboard keel edge)
    this.tilt.rotation.z = this.heel || 0;
    this.tilt.position.y = (this.heel || 0) > 0 ? -Math.sin(this.heel) * 2 : 0;
    this.tilt.position.x = (this.heel || 0) > 0 ? -Math.sin(this.heel) * 6 : 0;
    P.mainmast.rotation.x = 0; P.mainmast.rotation.z = (this.mastFall || 0) * 1.45;
    for (let i = 0; i < 4; i++) { const a = P['anchor' + i]; if (a) { a.rotation.x = (i < 2 ? -1 : 1) * (1 - (this.anchorDrop || 0)) * 1.1; a.position.y = 4 - (this.anchorDrop || 0) * 2.5; } }
    for (const k of ['winchP', 'winchC', 'winchS']) if (this.kids[k] && !this.kids[k].alive) P[k].visible = false;
    if (this.mastGlow) { this.mastGlow.visible = this.phase < 3; setGlowSize(this.mastGlow, 6 + Math.sin(t * 3) * 1.2 + (this.phase === 2 ? 2 : 0)); }
    // LOD1 beyond 550 m (one merged mesh)
    const cam = this.ctx.camera;
    const far = cam && cam.position.distanceTo(this.pos) > 550 && this.phase < 3;
    if (this.lod.visible !== far) { this.lod.visible = far; for (const c of this.model.children) c.visible = !far; }
  }
  cleanup() {
    const C = this.ctx.collision; for (const c of this.cols) C?.remove(c); this.cols.length = 0;
    for (const t of Object.values(this.kids)) this.ctx.combat?.unregister?.(t);
    this.dropCables(true);
    for (const m of this.cableMesh || []) m.parent?.remove(m);
    for (const u of this.turrets) if (u.alive || u.root?.parent) { try { this.ctx.enemies?.despawn?.(u); } catch (e) { /* ignore */ } }
    disposeGlow(this.sweeperGlow); disposeGlow(this.mastGlow);
    this.smoke?.stop?.(); this.fire?.stop?.();
    if (this.L.tally === this) this.L.tally = null;
  }
  despawn() { this.cleanup(); super.despawn(); }
}

export function registerTally(ctx, L) {
  ctx.enemies.register('tally', (c, pos, o = {}) => new Tally(c, pos, o, L));
}
