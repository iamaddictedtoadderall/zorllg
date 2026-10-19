// levels/level02/convoy.js — the Wake on the road (L2 §4): the gameplay twist, the convoy IS the level.
//
//  · Formation: 40 rigs in 4 columns × 10 ranks round the convoy centre (`s`), each on its slot along the route with a
//    small seeded wobble, sitting on the ground and pitched to the slope. Heroes and the seven named target rigs are full
//    models (RigView, LOD1 beyond 300 m); the other 27 are instanced (RigInstances).
//  · Speed (eased at 1.5 m/s²): roll 9 m/s while an encounter is active or the frame is out of the band, open 12 on a
//    clear road, hold 4 at a shut gate (the convoy never outruns a fight), 0 when circled (Big Mercy taken) or camped.
//  · The band: a 700 m disc round the convoy centre (round Big Mercy in the set piece): soft warning beyond 600 m, hard
//    beyond 700 m with a 30 s clock; at 30 s outside, raids land without her (hooked rigs are lost at once, new hooks
//    are instant until she is back).
//  · Harpooned rigs (L2 §4.4): a puller (yacht, harpooner) hooks a named rig with a CABLE target (600 AP); the rig is
//    dragged off; 25 s to cut it free (or kill/stagger the puller), else it is hauled away and comes off the Roll (flag
//    cv:lost, applied by the engine at the level's end, addendum 02 E10).
//  · Circle (the Tally), reform, camp (in the Sundial's shadow stripe), the tracker (ctx.hud.tracker, E5, feature-detected),
//    and the frame pushed out of rig footprints (rigs are not colliders: the frame would ride them).
// Everything here runs on sim time and is restored from the mission flags cv:s, cv:mode, cv:lost on every level start.
import * as THREE from 'three';
import { clamp, damp, dampAng, yawTo, angWrap, mulberry32 } from '../../src/core/util.js';
import CAMPAIGN from '../campaign.js';
import { RigView, RigInstances, RIG_DIMS } from './rigs.js';
import { mats2 } from './kit2.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _c = new THREE.Vector3();
const GENERIC = ['crawler', 'walker', 'train'];
export const ROLL = CAMPAIGN.roll || [];

export class Convoy {
  constructor(L) {
    this.L = L; const ctx = L.ctx, D = L.DATA.convoy;
    this.D = D;
    this.route = ctx.world.route;
    // ── the slots: heroes and targets where L2 §4.1 puts them, the rest of the Roll in order ──
    const fixed = new Map();
    for (const h of D.heroes) fixed.set(h.rank * 4 + h.col, { id: h.id, model: h.model, hero: true });
    for (const t of D.targets) fixed.set(t.rank * 4 + t.col, { id: t.id, model: 'crawler', target: true });
    const used = new Set([...fixed.values()].map(f => f.id));
    const rest = ROLL.filter(r => !used.has(r.id));
    const rng = mulberry32(0x5ead);
    this.rigs = [];
    let ri = 0;
    for (let rank = 0; rank < D.ranks; rank++) for (let col = 0; col < D.columns.length; col++) {
      const k = rank * 4 + col;
      const f = fixed.get(k);
      const r = f ? ROLL.find(x => x.id === f.id) : rest[ri++];
      if (!r) continue;
      const kind = f?.model || (f?.target ? 'crawler' : GENERIC[(r.id * 7 + rank) % 3]);
      this.rigs.push({
        id: r.id, name: r.name, souls: r.souls, rank, col, kind, hero: !!f?.hero, target: !!f?.target, named: !!f,
        ds: D.rankGap * (D.ranks - 1) / 2 - rank * D.rankGap, l: D.columns[col],
        wob: { a: 1.5 * (0.6 + rng() * 0.4), f: 0.05 * (0.8 + rng() * 0.4), p: rng() * Math.PI * 2 },
        tint: new THREE.Color().setHSL(0.08 + rng() * 0.05, 0.12 + rng() * 0.1, 0.92 + rng() * 0.12),
        pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, state: 'slot', view: null,
        tgt: new THREE.Vector3(), tyaw: 0, v: 0, ringA: 0, campAt: null, wheelT: 0,
      });
    }
    this.byId = new Map(this.rigs.map(r => [r.id, r]));
    // ── views: full models for the named rigs (and any generic rig once it is hooked); the rest instanced ──
    this.views = new Map();
    for (const r of this.rigs) if (r.named) this.makeView(r);
    const counts = {}; for (const r of this.rigs) if (!r.named) counts[r.kind] = (counts[r.kind] || 0) + 1;
    this.inst = new RigInstances(ctx, counts);
    // the cables (puller → rig): one stretched cylinder each, pooled
    const cg = new THREE.CylinderGeometry(0.09, 0.09, 1, 6); cg.translate(0, 0.5, 0); cg.rotateX(Math.PI / 2); cg.userData.shared = true;
    this.cableGeo = cg;
    this.cableMeshes = [];
    this.hooks = [];
    this.reset();
  }
  makeView(r) {
    if (this.views.has(r.id)) return this.views.get(r.id);
    const v = new RigView(this.L.ctx, r.kind, r.name, { lodDist: 300 });
    this.L.ctx.levelRoot.add(v.root);
    this.views.set(r.id, v);
    r.view = v; r.named = true;
    return v;
  }
  // ════════════════════════════════════════════════════════════════════════════════ state
  reset() {
    const L = this.L;
    for (const h of this.hooks) this.dropCable(h);
    this.hooks = [];
    this.s = this.D.startS; this.v = 0; this.mode = 'roll'; this.modeT = 0;
    this.lost = new Set(); this.hookedOnce = new Set(); this.freedLine = 0; this.lostOnce = false;
    this.outT = 0; this.warnT = 0; this.bandBroken = false; this.nextInstant = false; this.bandMode = 'convoy';
    this.wasActive = false; this.openN = 0; this.trackT = 0; this.flagT = 0; this.markerT = 0; this.reformT = 0;
    this.campReady = false; this.bandWarned = false;
    for (const r of this.rigs) { r.state = 'slot'; r.v = 0; r.hook = null; r.campAt = null; }
    // the campaign's own losses (thirst, earlier days): those rigs are not on the road
    const camp = L.ctx.save?.getFlag?.('campaign');
    this.campaignLost = new Set(Array.isArray(camp?.lost) ? camp.lost : []);
    for (const id of this.campaignLost) { const r = this.byId.get(id); if (r) r.state = 'gone'; }
    this.hasTracker = typeof L.ctx.hud?.tracker === 'function';
  }
  /** level:start: put the convoy where the snapshot (or the checkpoint's default) says, every rig in its slot */
  restore(cp) {
    const L = this.L, D = L.DATA;
    const fl = L.mission?.flags || {};
    this.reset();
    this.s = Number.isFinite(fl['cv:s']) ? fl['cv:s'] : (D.cpConvoy[cp] ?? D.convoy.startS);
    this.mode = fl['cv:mode'] || 'roll';
    for (const id of fl['cv:lost'] || []) { this.lost.add(id); const r = this.byId.get(id); if (r) r.state = 'gone'; }
    if (fl.bigMercyLost) { this.lost.add(3); const r = this.byId.get(3); if (r) r.state = 'gone'; }
    this.bandMode = fl['cv:band'] || 'convoy';
    this.snapAll();
  }
  setFlag(k, v) { this.L.setFlag(k, v); }
  saveFlags() {
    this.setFlag('cv:s', Math.round(this.s * 10) / 10);
    this.setFlag('cv:mode', this.mode);
    this.setFlag('cv:lost', [...this.lost]);
    this.setFlag('cv:hooked', this.hooks.map(h => h.rig.id));
    this.setFlag('cv:band', this.bandMode);
  }
  // ════════════════════════════════════════════════════════════════════════════════ geometry
  centre(out = _c) { return this.route.toWorld(this.s, 0, out); }
  slotPose(r, t, out) {
    const s = clamp(this.s + r.ds, 2, this.route.length - 2);
    const wob = r.wob.a * Math.sin(t * r.wob.f * Math.PI * 2 + r.wob.p);
    this.route.toWorld(s, r.l + wob, out);
    return this.route.yawAt(s);
  }
  /** the band's centre: the convoy, or Big Mercy (or the Tally once she is gone) during the set piece */
  bandCentre(out = _w) {
    if (this.bandMode === 'bigMercy') {
      const bm = this.byId.get(3);
      if (bm && bm.state !== 'gone') return out.copy(bm.pos);
      const t = this.L.tally;
      if (t?.alive) return out.copy(t.pos);
    }
    return this.centre(out);
  }
  bandDist() {
    const p = this.L.player(); if (!p) return 0;
    const c = this.bandCentre(_w);
    return Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
  }
  walking() { return this.rigs.filter(r => r.state !== 'gone' && !this.lost.has(r.id) && !this.campaignLost.has(r.id)); }
  rollCount() {
    const w = ROLL.filter(r => !this.lost.has(r.id) && !this.campaignLost.has(r.id));
    return { rigs: w.length, souls: w.reduce((a, r) => a + r.souls, 0) };
  }
  // ════════════════════════════════════════════════════════════════════════════════ modes
  setMode(mode, o = {}) {
    const prev = this.mode;
    this.mode = mode; this.modeT = 0;
    if (mode === 'circle') {
      // ring positions round the centre, assigned by each rig's current bearing so nobody crosses the ring
      const c = this.centre(_v).clone();
      this.circleC = c;
      const list = this.rigs.filter(r => r.state !== 'gone' && r.id !== 3);
      list.sort((a, b) => Math.atan2(a.pos.x - c.x, a.pos.z - c.z) - Math.atan2(b.pos.x - c.x, b.pos.z - c.z));
      list.forEach((r, i) => { r.ringA = (i / list.length) * Math.PI * 2 + Math.atan2(list[0].pos.x - c.x, list[0].pos.z - c.z); if (r.state === 'slot') r.state = 'circle'; });
      if (o.instant) { this.modeT = 30; for (const r of list) this.placeAtTarget(r); }
    } else if (mode === 'roll' && (prev === 'circle' || o.reform)) {
      this.reformT = o.instant ? 20 : 0;
      for (const r of this.rigs) if (r.state === 'circle' || r.state === 'mercyStopped') r.state = r.id === 3 ? 'returning' : 'reform';
      for (const r of this.rigs) if (r.state === 'reform' && o.instant) { r.state = 'slot'; this.placeAtTarget(r); }
    } else if (mode === 'camp') {
      this.assignCamp();
      for (const r of this.rigs) if (r.state !== 'gone') r.state = 'camp';
      if (o.instant) { this.modeT = 40; for (const r of this.rigs) if (r.state === 'camp') this.placeAtTarget(r); }
    }
    this.saveFlags();
  }
  assignCamp() {
    const D = this.D, L = this.L;
    const cols = D.camp.stripeCols, [s0, s1] = D.camp.s;
    const live = this.rigs.filter(r => r.state !== 'gone');
    const rows = Math.ceil(live.length / cols.length);
    const slots = [];
    for (let i = 0; i < rows; i++) for (const l of cols) {
      const s = s0 + (s1 - s0) * (rows > 1 ? i / (rows - 1) : 0.5);
      const p = this.route.toWorld(s, l, new THREE.Vector3());
      const q = L.stripe ? L.stripe.nudgeInside(p.x, p.z, 12) : [p.x, p.z];
      slots.push({ x: q[0], z: q[1], s, l });
    }
    // the Bench parks exactly at its spot (L2 §2.6 Z7), the others take the nearest free slot in Roll order
    const bench = this.byId.get(1);
    const bp = this.route.toWorld(D.camp.bench.s, D.camp.bench.l, new THREE.Vector3());
    if (bench && bench.state !== 'gone') {
      bench.campAt = { x: bp.x, z: bp.z, yaw: this.route.yawAt(D.camp.bench.s) };
      let bi = 0, bd = Infinity; slots.forEach((sl, i) => { const d = Math.hypot(sl.x - bp.x, sl.z - bp.z); if (d < bd) { bd = d; bi = i; } });
      slots.splice(bi, 1);
    }
    const yaw = this.route.yawAt((s0 + s1) / 2);
    for (const r of live) {
      if (r.id === 1) continue;
      let bi = -1, bd = Infinity;
      slots.forEach((sl, i) => { if (sl.used) return; const d = Math.hypot(sl.x - r.pos.x, sl.z - r.pos.z) + (Math.abs(sl.x - bp.x) + Math.abs(sl.z - bp.z) < 20 ? 1e5 : 0); if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) { r.campAt = { x: r.pos.x, z: r.pos.z, yaw }; continue; }
      slots[bi].used = true;
      r.campAt = { x: slots[bi].x, z: slots[bi].z, yaw: yaw + ((r.id * 37) % 7 - 3) * 0.06 };
    }
  }
  // ════════════════════════════════════════════════════════════════════════════════ per frame
  placeAtTarget(r) {
    const t = this.L.ctx.clock.time;
    this.targetOf(r, t, r.tgt);
    r.pos.copy(r.tgt); r.yaw = r.tyaw; r.v = 0;
    if (r.state === 'reform' || r.state === 'returning') r.state = 'slot';
  }
  snapAll() {
    const t = this.L.ctx.clock.time;
    for (const r of this.rigs) {
      if (r.state === 'gone') continue;
      if (r.state !== 'camp' && r.state !== 'circle') r.state = 'slot';
      this.targetOf(r, t, r.tgt); r.pos.copy(r.tgt); r.yaw = r.tyaw;
    }
    this.draw(0);
  }
  /** where a rig wants to be now (by its state), with its heading */
  targetOf(r, t, out) {
    if (r.state === 'circle') {
      const c = this.circleC || this.centre(_t);
      const R = this.D.circleR;
      const slotYaw = this.slotPose(r, t, _t);
      const k = clamp(this.modeT / 20, 0, 1), e = k * k * (3 - 2 * k);
      const cx = c.x + Math.sin(r.ringA) * R, cz = c.z + Math.cos(r.ringA) * R;
      out.set(_t.x + (cx - _t.x) * e, 0, _t.z + (cz - _t.z) * e);
      r.tyaw = e > 0.5 ? r.ringA + Math.PI / 2 : slotYaw;
      return out;
    }
    if (r.state === 'camp' && r.campAt) {
      const slotYaw = this.slotPose(r, t, _t);
      const k = clamp(this.modeT / 30, 0, 1), e = k * k * (3 - 2 * k);
      out.set(_t.x + (r.campAt.x - _t.x) * e, 0, _t.z + (r.campAt.z - _t.z) * e);
      r.tyaw = e > 0.6 ? r.campAt.yaw : slotYaw;
      return out;
    }
    r.tyaw = this.slotPose(r, t, out);
    return out;
  }
  /** the convoy's target speed now (L2 §4.2) */
  targetSpeed() {
    const S = this.D.speeds, L = this.L;
    if (this.mode === 'circle' || this.mode === 'camp' || this.mode === 'still') return 0;
    let v = S.open;
    const active = this.encounterActive();
    if (active || this.outside) v = S.roll;
    for (const g of this.D.gates) if (this.s >= g.s - 4 && this.s < g.s + 400 && !L.flag(g.flag)) { v = Math.min(v, S.hold); break; }
    if (this.s >= this.D.campS - 1) v = Math.min(v, 2);
    return v;
  }
  encounterActive() {
    const L = this.L, ctx = L.ctx;
    if (L.flag('p:sync') && !L.flag('volleyDone')) return true;     // the rocket volleys count as an encounter (L2 §4.2)
    if (this.hooks.length) return true;
    const c = this.centre(_t);
    for (const u of ctx.enemies?.alive?.() || []) {
      if (u.team !== 'enemy' || u.kind === 'tally' || u.isWatcher) continue;
      if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 1500) return true;
    }
    return false;
  }
  update(dt) {
    const L = this.L, ctx = L.ctx, t = ctx.clock.time;
    if (dt <= 0) return;
    this.modeT += dt;
    // ── speed and position along the road ──
    const want = this.targetSpeed();
    const a = this.D.speeds.accel;
    this.v += clamp(want - this.v, -a * dt * 2, a * dt);
    if (this.mode === 'roll') this.s = Math.min(this.D.campS, this.s + this.v * dt);
    // open road: Hesper's call the first time after each fight
    const active = this.encounterActive();
    if (active) this.wasActive = true;
    else if (this.wasActive && want >= this.D.speeds.open - 0.01 && this.mode === 'roll' && !this.outside) {
      this.wasActive = false;
      if (this.openN < 3 && L.flag('p:raid1')) { this.openN++; L.playComms('c_open' + this.openN); }
    }
    // ── the band ──
    this.updateBand(dt);
    // ── hooks ──
    for (const h of this.hooks.slice()) this.updateHook(h, dt);
    // ── rigs ──
    for (const r of this.rigs) this.updateRig(r, dt, t);
    if (this.reformT < 20 && this.mode === 'roll') {
      this.reformT += dt;
      if (this.reformT >= 20) for (const r of this.rigs) if (r.state === 'reform') r.state = 'slot';
    }
    // ── flags (a snapshot carries the convoy), tracker, markers ──
    if ((this.flagT -= dt) <= 0) { this.flagT = 0.5; this.saveFlags(); }
    if ((this.trackT -= dt) <= 0) { this.trackT = 0.25; this.updateTracker(); }
    if ((this.markerT -= dt) <= 0) { this.markerT = 0.5; this.updateMarkers(); }
  }
  updateRig(r, dt, t) {
    if (r.state === 'gone') return;
    const ctx = this.L.ctx;
    switch (r.state) {
      case 'slot': case 'circle': case 'camp': {
        this.targetOf(r, t, r.tgt);
        const dx = r.tgt.x - r.pos.x, dz = r.tgt.z - r.pos.z, d = Math.hypot(dx, dz);
        if (r.state === 'slot' && d < 6) { r.pos.x = r.tgt.x; r.pos.z = r.tgt.z; r.yaw = dampAng(r.yaw, r.tyaw, 4, dt); r.v = this.v; }
        else {
          const vmax = r.state === 'slot' ? 14 : 12;
          const step = Math.min(d, vmax * dt * (0.4 + 0.6 * clamp(d / 10, 0, 1)));
          if (d > 0.01) { r.pos.x += dx / d * step; r.pos.z += dz / d * step; }
          r.v = step / dt;
          const head = d > 1.5 ? yawTo(dx, dz) : r.tyaw;
          r.yaw = dampAng(r.yaw, head, 1.6, dt);
        }
        break;
      }
      case 'reform': case 'returning': {
        this.targetOf({ ...r, state: 'slot' }, t, r.tgt); r.tyaw = this.slotPose(r, t, _t);
        const dx = r.tgt.x - r.pos.x, dz = r.tgt.z - r.pos.z, d = Math.hypot(dx, dz);
        const vmax = r.state === 'returning' ? 10 + this.v : 8 + this.v;
        const step = Math.min(d, vmax * dt);
        if (d > 0.01) { r.pos.x += dx / d * step; r.pos.z += dz / d * step; }
        r.v = step / dt;
        r.yaw = dampAng(r.yaw, d > 3 ? yawTo(dx, dz) : r.tyaw, 1.4, dt);
        if (d < 2) r.state = 'slot';
        break;
      }
      case 'hooked': {
        const h = r.hook;
        if (!h) { r.state = 'returning'; break; }
        const from = h.puller.cableFrom ? h.puller.cableFrom(_t) : _t.copy(h.puller.pos);
        const dx = from.x - r.pos.x, dz = from.z - r.pos.z, d = Math.hypot(dx, dz);
        if (d > 32) { const step = Math.min(d - 32, h.drag * dt); r.pos.x += dx / d * step; r.pos.z += dz / d * step; r.v = step / dt; }
        else r.v = 0;
        r.roll = Math.sin(t * 7 + r.id) * 0.03;                     // skidding
        if (r.v > 0.5 && Math.random() < dt * 6) ctx.fx?.dust?.(_v.set(r.pos.x, r.pos.y + 0.5, r.pos.z), 4, 5);
        break;
      }
      case 'hauled': {
        // hauled away over the swell at 12 m/s, despawned 600 m out in a dust cloud
        const c = this.centre(_t);
        const dx = r.pos.x - c.x, dz = r.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
        r.pos.x += dx / d * 12 * dt; r.pos.z += dz / d * 12 * dt;
        r.yaw = dampAng(r.yaw, yawTo(-dx, -dz), 0.8, dt);
        if (Math.random() < dt * 8) ctx.fx?.dust?.(_v.set(r.pos.x, r.pos.y + 0.5, r.pos.z), 5, 7);
        if (d > this.D.harpoon.despawnAt) { r.state = 'gone'; ctx.fx?.dust?.(_v.set(r.pos.x, r.pos.y + 2, r.pos.z), 30, 18); }
        break;
      }
      case 'mercy': case 'mercyStopped': break;                       // posed by the Tally (tally.js)
      default: break;
    }
  }
  // ════════════════════════════════════════════════════════════════════════════════ the band
  updateBand(dt) {
    const L = this.L, ctx = L.ctx, B = this.D.band;
    const p = L.player();
    if (!p || L.flag('p:camp')) { this.outside = false; this.bandState = { state: 'in', text: 'WITH THE WAKE' }; return; }
    const d = this.bandDist();
    this.distNow = d;
    if (d > B.warn) {
      if (!this.bandWarned) { this.bandWarned = true; L.counters.bandWarn = (L.counters.bandWarn || 0) + 1; }
      if ((this.warnT -= dt) <= 0) {
        this.warnT = 3;
        if (!this.hasTracker || d > B.radius) ctx.hud?.warn?.('STAY WITH THE WAKE', 2, d <= B.radius);
      }
    }
    if (d > B.radius) {
      this.outside = true;
      this.outT += dt;
      if (this.outT >= B.grace && !this.bandBroken) {
        this.bandBroken = true;
        if (this.hooks.length) for (const h of this.hooks.slice()) this.loseHook(h);
        else this.nextInstant = true;
      }
      this.bandState = { state: 'out', text: `OUT OF RANGE · ${Math.max(0, Math.ceil(B.grace - this.outT))} s` };
    } else {
      this.outside = false;
      if (this.outT > 0) { this.outT = 0; this.bandBroken = false; this.nextInstant = false; }
      this.bandState = d > B.warn ? { state: 'warn', text: `TOO FAR · ${Math.round(d / 10) * 10} m` } : { state: 'in', text: 'WITH THE WAKE' };
    }
  }
  updateTracker() {
    const ctx = this.L.ctx;
    if (typeof ctx.hud?.tracker !== 'function') return;
    const n = this.rollCount();
    const alerts = this.hooks.slice(0, 3).map(h => ({ id: 'hook' + h.rig.id, label: h.rig.name.toUpperCase(), t: clamp(h.clock / this.D.harpoon.clock, 0, 1),
                                                      text: `${Math.max(0, Math.ceil(h.clock))} s`, kind: 'danger' }));
    try { ctx.hud.tracker({ id: 'wake', title: 'THE WAKE', value: `${n.rigs} RIGS · ${n.souls} SOULS`, band: this.bandState || null, alerts }); }
    catch (e) { ctx.recordError?.('level02', e); }
  }
  updateMarkers() {
    // the hooked rigs' names hang over them (L2 §4.4), as ally markers
    const L = this.L, m = L.mission;
    for (const h of this.hooks) {
      const r = h.rig;
      m?.run?.([{ marker: { id: 'm_hook_' + r.id, at: { x: Math.round(r.pos.x), z: Math.round(r.pos.z), y: Math.round(r.pos.y + (RIG_DIMS[r.kind]?.h || 10) + 4) },
                            label: r.name.toUpperCase(), kind: 'ally' } }]);
    }
  }
  // ════════════════════════════════════════════════════════════════════════════════ harpoons
  /** the nearest hookable rig to a point, preferring named rigs on the puller's side of the road */
  pickRig(pos, preferId) {
    const pref = preferId != null ? this.byId.get(preferId) : null;
    if (pref && pref.state === 'slot' && !this.lost.has(pref.id)) return pref;
    const side = Math.sign(this.route.closest(pos.x, pos.z).l) || 1;
    let best = null, bd = Infinity;
    for (const r of this.rigs) {
      if (r.state !== 'slot' || r.id === 3 || this.lost.has(r.id)) continue;
      const d = Math.hypot(r.pos.x - pos.x, r.pos.z - pos.z) + (Math.sign(r.l) === side ? 0 : 400) + (r.target ? 0 : 250);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  canHook() { return this.hooks.length < this.D.harpoon.maxHooked; }
  /** a puller hooks a rig: { kind: 'yacht'|'winch' }. Returns the hook or null. */
  hook(puller, rig, o = {}) {
    const L = this.L, ctx = L.ctx, H = this.D.harpoon;
    if (!rig || rig.state !== 'slot' || !this.canHook()) return null;
    if (!rig.view) this.makeView(rig);                                // a generic rig becomes a full model with its name
    const used = new Set(this.hooks.map(h => h.n));
    const n = [1, 2, 3].find(i => !used.has(i)) || 1;
    const h = { rig, puller, n, clock: H.clock, drag: o.kind === 'winch' ? H.dragWinch : H.dragYacht, kind: o.kind || 'yacht' };
    rig.state = 'hooked'; rig.hook = h;
    const self = this;
    const cable = {
      id: undefined, name: 'CABLE', kind: 'cable', team: 'enemy', tags: new Set(['cable', 'cable:' + rig.id, 'free' + n]),
      alive: true, targetable: true, objective: true, boss: false,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), ap: H.cable.rig, apMax: H.cable.rig, imp: 0, impMax: Infinity,
      stagT: 0, stagDur: 0, lastHit: -9, invuln: false, hitR: H.cable.hitR, isCable: true,
      center(out = new THREE.Vector3()) { return out.copy(this.pos); },
      hitTest(p) { return p.distanceToSquared(this.pos) < this.hitR * this.hitR; },
      onDamage(info) {
        // the blade cuts a cable in one hit (L2 §4.4)
        if (!info.blocked && info.source?.team === 'player' && (info.source.kind === 'blade' || info.source.weapon === 'blade') && this.alive) {
          this.ap = 0; info.killed = true;
        }
      },
      onDeath() { self.freeHook(h, 'cut'); },
    };
    h.cable = cable;
    this.positionCable(h);
    ctx.combat?.register?.(cable);
    ctx.audio?.play?.('harpoon', rig.pos);
    ctx.audio?.play?.('rigHorn', rig.pos);
    this.hooks.push(h);
    this.hookedOnce.add(rig.id);
    L.counters.hooks = (L.counters.hooks || 0) + 1;
    L.mission?.run?.([{ objective: { add: 'o_free' + n } }, { objective: { text: ['o_free' + n, `Cut ${rig.name} free: shoot or blade the cable`] } }]);
    L.terms.request('harpooned');
    L.runHint('cable');
    L.playComms('c_hooked', { rig: rig.name });
    ctx.events.emit('l02:hooked', { id: rig.id, name: rig.name, n });
    this.saveFlags();
    if (this.bandBroken || this.nextInstant || o.instant) { this.nextInstant = false; this.loseHook(h); return h; }
    return h;
  }
  positionCable(h) {
    const from = h.puller.cableFrom ? h.puller.cableFrom(_t) : _t.copy(h.puller.pos).setY(h.puller.pos.y + 3);
    const r = h.rig;
    _v.set(r.pos.x, r.pos.y + 3.5, r.pos.z);
    h.cable.pos.copy(from).add(_v).multiplyScalar(0.5);
    h.from = from.clone(); h.to = _v.clone();
  }
  updateHook(h, dt) {
    const p = h.puller;
    if (!p.alive || p.removeMe) { this.freeHook(h, 'puller'); return; }
    if (p.stagT > 0) { this.freeHook(h, 'stagger'); return; }
    h.clock -= dt;
    this.positionCable(h);
    if (h.clock <= 0) this.loseHook(h);
  }
  dropCable(h) {
    const ctx = this.L.ctx;
    if (h.cable) { if (h.cable.alive) { h.cable.alive = false; } ctx.combat?.unregister?.(h.cable); }
    this.L.mission?.run?.([{ marker: { remove: 'm_hook_' + h.rig.id } }]);
  }
  freeHook(h, reason) {
    const L = this.L, ctx = L.ctx;
    const i = this.hooks.indexOf(h); if (i < 0) return;
    this.hooks.splice(i, 1);
    this.dropCable(h);
    const r = h.rig;
    r.hook = null; r.state = 'returning';
    ctx.fx?.sparks?.(h.cable.pos, 14, [1, 0.8, 0.5], 18);
    ctx.audio?.play?.('cableSnap', h.cable.pos);
    L.mission?.run?.([{ objective: { complete: 'o_free' + h.n } }]);
    if (!h.freedSaid) {
      h.freedSaid = true;
      this.freedLine++;
      L.playComms(this.freedLine % 2 ? 'c_freed_kit' : 'c_freed_hesper', { rig: r.name });
    }
    h.puller.onCableEnd?.(reason);
    L.counters.freed = (L.counters.freed || 0) + 1;
    ctx.events.emit('l02:freed', { id: r.id, reason });
    this.saveFlags();
  }
  loseHook(h) {
    const L = this.L, ctx = L.ctx;
    const i = this.hooks.indexOf(h); if (i < 0) return;
    this.hooks.splice(i, 1);
    this.dropCable(h);
    const r = h.rig;
    r.hook = null; r.state = 'hauled';
    this.lost.add(r.id);
    L.mission?.run?.([{ objective: { fail: 'o_free' + h.n } }, { objective: { remove: 'o_free' + h.n } }]);
    L.playComms('c_lost', { rig: r.name });
    L.terms.request('rig_lost');
    h.puller.onCableEnd?.('won');
    L.counters.lost = (L.counters.lost || 0) + 1;
    ctx.events.emit('l02:lost', { id: r.id, name: r.name });
    this.saveFlags();
  }
  /** a rig lost outright (Big Mercy over the edge) */
  loseRig(id) {
    const r = this.byId.get(id); if (!r) return;
    this.lost.add(id);
    for (const h of this.hooks.slice()) if (h.rig === r) { this.hooks.splice(this.hooks.indexOf(h), 1); this.dropCable(h); }
    r.state = 'gone';
    this.saveFlags();
  }
  // ════════════════════════════════════════════════════════════════════════════════ physics: rigs are solid to the frame
  pushOut(body) {
    if (!body?.pos) return;
    const rad = body.rad || 2.6;
    for (const r of this.rigs) {
      if (r.state === 'gone') continue;
      const dx = body.pos.x - r.pos.x, dz = body.pos.z - r.pos.z;
      if (dx * dx + dz * dz > 900) continue;
      const D = RIG_DIMS[r.kind] || RIG_DIMS.crawler;
      if (body.pos.y > r.pos.y + D.h * 0.9) continue;          // on top of it (or flying over)
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hw = D.wid / 2 + rad, hd = D.len / 2 + rad;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue;
      const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
      let nlx = lx, nlz = lz;
      if (px < pz) nlx = Math.sign(lx || 1) * hw; else nlz = Math.sign(lz || 1) * hd;
      body.pos.x = r.pos.x + nlx * c + nlz * s; body.pos.z = r.pos.z - nlx * s + nlz * c;
    }
  }
  // ════════════════════════════════════════════════════════════════════════════════ drawing
  draw(dt) {
    const L = this.L, ctx = L.ctx;
    this.inst.begin();
    for (const r of this.rigs) {
      if (r.state === 'gone') { if (r.view) r.view.root.visible = false; continue; }
      const D = RIG_DIMS[r.kind] || RIG_DIMS.crawler;
      // on the ground, pitched to the slope (front and rear axles)
      const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw), h = D.len * 0.4;
      const yf = L.groundAt(r.pos.x + fx * h, r.pos.z + fz * h), yb = L.groundAt(r.pos.x - fx * h, r.pos.z - fz * h);
      r.pos.y = (yf + yb) / 2;
      r.pitch = Math.atan2(yf - yb, h * 2) * 0.9;
      if (r.view) {
        const o = r.view.root;
        o.visible = true;
        o.position.copy(r.pos); o.rotation.set(r.pitch, r.yaw, r.roll || 0, 'YXZ');
      } else this.inst.push(r.kind, r.pos, r.yaw, r.pitch, r.roll || 0, r.tint);
    }
    this.inst.end();
    // cables
    let ci = 0;
    for (const h of this.hooks) {
      let m = this.cableMeshes[ci];
      if (!m) { m = new THREE.Mesh(this.cableGeo, mats2(ctx).cable); m.castShadow = false; m.frustumCulled = false; ctx.levelRoot.add(m); this.cableMeshes[ci] = m; }
      ci++;
      m.visible = true; m.position.copy(h.from); m.lookAt(h.to); m.scale.set(1, 1, h.from.distanceTo(h.to));
    }
    for (; ci < this.cableMeshes.length; ci++) this.cableMeshes[ci].visible = false;
  }
  /** rigs near a point (reed pushers, dust): [{ r, d }] nearest first */
  near(p, n = 3) {
    return this.rigs.filter(r => r.state !== 'gone').map(r => ({ r, d: Math.hypot(r.pos.x - p.x, r.pos.z - p.z) }))
      .sort((a, b) => a.d - b.d).slice(0, n);
  }
  /** the flank point Tick drives: the side of the convoy nearest the player, 60 to 120 m out */
  flankPoint(out) {
    const p = this.L.player();
    const c = this.centre(_t);
    let side = -1;
    if (p) side = Math.sign(this.route.closest(p.pos.x, p.pos.z).l - 0) || -1;
    const off = side * (36 + 70);
    return this.route.toWorld(clamp(this.s + 40, 0, this.route.length), off, out);
  }
  dispose() {
    for (const h of this.hooks) this.dropCable(h);
    this.hooks = [];
    for (const v of this.views.values()) v.dispose();
    this.inst.dispose();
    for (const m of this.cableMeshes) m.parent?.remove(m);
  }
}
