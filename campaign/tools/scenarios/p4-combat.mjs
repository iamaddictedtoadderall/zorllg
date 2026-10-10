// tools/scenarios/p4-combat.mjs (P4): acceptance for Combat and AI (architecture §10.7) and the addendum's P4 checklist
// (A6). Runs on levels/test.js near the drop point (s < 450, before any test-level trigger), spawning everything it
// needs with the tag 'p4'. Time is advanced with step(); rendering happens only for screenshots.
//
//   node tools/playtest.mjs --scenario p4-combat --port 8300 --out /tmp/campaign-playtest/P4-p4-combat
//   P4_SECTIONS=haul,kinds node tools/playtest.mjs --scenario p4-combat ...   (only those sections)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PARTS_EXPECT = {};   // filled from the page
// the harness's output directory (playtest.mjs default when --out is absent)
const OUT_DIR = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : '/tmp/campaign-playtest/p4-combat'; })();

export default async function (g) {
  const T0 = Date.now();
  // P4_SECTIONS=haul,kinds runs only those sections (a quick local check; acceptance runs everything)
  const ONLY = typeof process !== 'undefined' && process.env.P4_SECTIONS ? process.env.P4_SECTIONS.split(',') : null;
  const sec = async (name, fn) => {
    if (ONLY && !ONLY.includes(name)) return;
    const t = Date.now();
    try { await fn(); }
    catch (e) { g.assert(false, `${name}: threw ${e.message}`); g.log(String(e.stack || e)); }
    g.log(`section ${name}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // software rendering on a loaded machine can exceed the 30 s screenshot timeout: on a timeout, fall back to one
  // rendered frame read straight off the canvas (preserveDrawingBuffer is on under ?debug=1; no HUD). Never aborts.
  const shot = async (name, o) => {
    try { return await g.shot(name, o); } catch (e) { g.log(`shot ${name} failed: ${e.message.split('\n')[0]}`); }
    try {
      const url = await g.eval(async (o) => {
        const G = window.__game;
        await G.settle?.(); G.render?.();
        const r = G.ctx.renderer.domElement.toDataURL('image/png');
        if (o?.hud === false) G.hud?.(true);
        return r;
      }, o || {});
      const file = join(OUT_DIR, `${name}.png`);
      writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      g.log(`shot ${name}: canvas capture (no HUD) ${file}`);
      return file;
    } catch (e) { g.log(`shot ${name} canvas capture failed: ${e.message}`); }
    return null;
  };

  // ---------------------------------------------------------------------------------------------- setup
  await g.startLevel('test', 'cp_start');
  await g.eval(async () => {
    const G = window.__game, c = G.ctx, T = c.THREE;
    const U = await import(new URL('src/core/util.js', location.href).href);
    const LO = await import(new URL('src/combat/loadout.js', location.href).href);
    const H = window.__p4 = {
      G, c, T, U, LO,
      V: (x, y, z) => new T.Vector3(x, y, z),
      at(s, l = 0, h = 0) { return c.world.resolve({ s, l, h }, new T.Vector3()); },
      ev: [], dmg: [], kinds: new Set(),
      clean(o = {}) {
        for (const u of c.enemies.all().slice()) c.enemies.despawn(u);
        c.projectiles.clear(); c.input.clearInjected();
        c.haul?.clear?.();
        const p = c.player;
        p.abilities = { move: 1, jump: true, hover: true, boost: true, fire: true, lock: true, blade: true, missile: true, kit: true, interact: true, tear: true };
        p.hoverCostScale = 1; p.enRegenScale = 1; p.gravityScale = 1; p.hidden = false; p.idleFacing = null; p.animOverride = null;
        p.autopilot = null; p.invuln = false; p.frozen = false; p.lunge = null; p.pull = null;
        if (o.loadout !== false && JSON.stringify(p.loadout) !== JSON.stringify({ ...LO.DEFAULT_LOADOUT })) p.setLoadout({ ...LO.DEFAULT_LOADOUT });
        p.refill(); p.lock = null; p.hardLock = false; p.stagT = 0; p.imp = 0; p.vel.set(0, 0, 0); p.repairT = 0;
        c.timeScale = 1; c.combat.god = o.god ?? true;
        H.dmg.length = 0; H.ev.length = 0;
      },
      place(s, l = 0) {
        G.teleport({ s, l });
        const p = c.player; const y = c.world.resolveYaw('route', p.pos);
        p.yaw = p.bodyYaw = y; p.pitch = -0.05; p.vel.set(0, 0, 0);
        return y;
      },
      fwd(d, h = 0, side = 0) {
        const p = c.player, y = p.yaw;
        const x = p.pos.x - Math.sin(y) * d + Math.cos(y) * side, z = p.pos.z - Math.cos(y) * d - Math.sin(y) * side;
        return new T.Vector3(x, c.world.groundHeight(x, z) + h, z);
      },
      face(pt, dy = 0) {
        const p = c.player, dx = pt.x - p.pos.x, dz = pt.z - p.pos.z;
        p.yaw = p.bodyYaw = Math.atan2(-dx, -dz);
        p.pitch = Math.max(-0.75, Math.min(0.95, Math.atan2(pt.y + dy - (p.pos.y + 7), Math.hypot(dx, dz)) + 0.03));
      },
      spawn(kind, pos, o = {}) { return c.enemies.spawn(kind, pos, { ...o, tags: ['p4', ...(o.tags || [])] }); },
      hs() { const v = c.player.vel; return Math.hypot(v.x, v.z); },
      dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
    };
    for (const t of ['player:damaged', 'player:staggered', 'player:autopilotDone', 'haul:tear', 'haul:racked', 'haul:left', 'target:killed',
                     'player:landed', 'dropship:deployed', 'unit:spawned', 'player:boost'])
      c.events.on(t, (e) => H.ev.push({ t, e, time: c.clock.time }));
    const orig = c.combat.damage;
    c.combat.damage = function (t, a, i, s) {
      const r = orig.call(this, t, a, i, s);
      if (s?.team === 'player') H.kinds.add(s.kind);
      H.dmg.push({ tk: t.kind, tid: t.id, team: t.team, amt: r.amount, imp: r.imp, sk: s?.kind, st: s?.team, ok: s?.owner?.kind,
                   blocked: !!r.blocked, staggered: r.staggered, killed: r.killed });
      if (H.dmg.length > 20000) H.dmg.splice(0, 10000);
      return r;
    };
  });
  const parts = await g.eval(() => Object.values(window.__p4.LO.PARTS).map(p => ({ id: p.id, slot: p.slot, weapon: p.weapon, stats: p.stats })));
  g.log('parts', parts.map(p => p.id).join(','));

  // ---------------------------------------------------------------------------------------------- 1 movement parity
  await sec('movement', async () => {
    const r = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, out = {};
      const measure = (frame) => {
        H.clean();
        if (frame) { p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, frame }); p.refill(); }
        H.place(140, 0);
        G.step(30);
        const o = { frame: frame || 'vanguard', apMax: p.apMax, enMax: p.enMax, impMax: p.impMax };
        // settled ground speed
        G.input.move(0, 1); G.step(150);
        let sum = 0; for (let i = 0; i < 30; i++) { G.step(1); sum += H.hs(); }
        o.speed = sum / 30;
        G.input.clear(); G.step(90);
        // quick boost from standstill: impulse and EN cost
        p.en = p.enMax; p.enUseT = 0; G.step(1);
        const en0 = p.en, h0 = H.hs();
        G.input.press('boost'); G.step(1);
        o.qbGain = H.hs() - h0; o.qbCost = en0 - p.en;
        G.step(90); p.en = p.enMax;
        // jump velocity
        G.input.hold('jump', true); G.step(1);
        o.jumpVy = p.vel.y + 45 / 60;   // undo one frame of gravity
        // hover drain while airborne
        G.step(18); const e1 = p.en; G.step(30); const e2 = p.en;
        o.hoverRate = (e1 - e2) / 0.5; o.airborne = !p.onGround;
        // EN depletion → overheat
        p.en = 20; let f = 0; while (p.overheat <= 0 && f < 60) { G.step(1); f++; }
        o.overheat0 = p.overheat;
        let n = 0; while (p.overheat > 0 && n < 400) { G.step(1); n++; }
        o.overheatDur = n / 60 + 1 / 60;
        G.input.clear(); G.step(120);
        return o;
      };
      out.vanguard = measure(null);
      out.striker = measure('striker');
      out.bastion = measure('bastion');
      H.clean();
      out.frames = { striker: H.LO.FRAMES.striker, bastion: H.LO.FRAMES.bastion };
      return out;
    });
    g.log('movement', JSON.stringify({ v: r.vanguard, s: r.striker, b: r.bastion }));
    const v = r.vanguard;
    g.assert(near(v.speed, 30, 1), `Vanguard ground speed settles at 30 ± 1 (${v.speed.toFixed(2)})`);
    g.assert(v.qbGain >= 70 && near(v.qbCost, 170, 0.01), `quick boost adds ≥ 70 m/s (${v.qbGain.toFixed(1)}) and costs 170 EN (${v.qbCost.toFixed(2)})`);
    g.assert(v.airborne && near(v.hoverRate, 150, 2), `hover drains 150 EN/s (${v.hoverRate.toFixed(1)})`);
    g.assert(near(v.jumpVy, 17, 0.05), `jump velocity 17 m/s (${v.jumpVy.toFixed(2)})`);
    g.assert(near(v.overheat0, 2.4, 0.05) && near(v.overheatDur, 2.4, 0.05), `EN depletion overheats for 2.4 s (${v.overheat0.toFixed(2)}, ${v.overheatDur.toFixed(2)} s)`);
    for (const f of ['striker', 'bastion']) {
      const m = r[f], F = r.frames[f];
      g.assert(near(m.speed, F.speed, 1) && m.apMax === F.ap && m.enMax === F.en && m.impMax === F.impMax && m.qbGain >= F.qbImpulse * 0.95,
        `${f} follows FRAMES (speed ${m.speed.toFixed(1)}/${F.speed}, AP ${m.apMax}, EN ${m.enMax}, qb +${m.qbGain.toFixed(1)}/${F.qbImpulse})`);
    }
  });

  // ---------------------------------------------------------------------------------------------- 2 addendum player fields
  await sec('player-addendum', async () => {
    const r = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, o = {};
      const W = p.weapons;
      // gating: each ability off reads as idle, on works
      H.clean(); H.place(150, 0); G.step(20);
      const gate = {};
      // move scale
      p.abilities.move = 0.33; G.input.move(0, 1); G.step(150); gate.moveScaled = H.hs(); G.input.clear(); G.step(60); p.abilities.move = 1;
      // jump
      p.abilities.jump = false; G.input.press('jump'); G.step(2); gate.jumpOff = p.vel.y <= 0.01 && p.onGround;
      p.abilities.jump = true; G.input.press('jump'); G.step(1); gate.jumpOn = p.vel.y > 15; G.step(120);
      // hover
      p.abilities.hover = false; p.en = 1000; p.enUseT = 0; G.input.hold('jump', true); G.step(20); gate.hoverOff = p.en >= 999 && p.vel.y < 16;
      G.input.clear(); G.step(120); p.abilities.hover = true;
      G.input.hold('jump', true); G.step(20); gate.hoverOn = p.en < 990; G.input.clear(); G.step(150); p.en = p.enMax;
      // boost
      p.abilities.boost = false; const e0 = p.en; G.input.press('boost'); G.step(1); gate.boostOff = p.en === e0 && H.hs() < 5;
      p.abilities.boost = true; G.input.press('boost'); G.step(1); gate.boostOn = H.hs() > 60; G.step(90);
      // fire
      p.abilities.fire = false; const a0 = W.R.ammo; G.input.hold('fire', true); G.step(20); gate.fireOff = W.R.ammo === a0;
      p.abilities.fire = true; G.step(20); gate.fireOn = W.R.ammo < a0; G.input.clear(); G.step(20);
      // lock
      const d = H.spawn('drone', H.fwd(90, 20), { behavior: 'scripted' }); d.pos.y = c.world.groundHeight(d.pos.x, d.pos.z) + 20;
      H.face(d.center()); p.abilities.lock = false; G.step(3); gate.lockOff = p.lock === null;
      p.abilities.lock = true; H.face(d.center()); G.step(3); gate.lockOn = p.lock === d;
      // blade
      p.abilities.blade = false; G.input.press('blade'); G.step(2); gate.bladeOff = W.L.cd === 0 && !p.lunge;
      p.abilities.blade = true; G.input.press('blade'); G.step(2); gate.bladeOn = W.L.cd > 2; G.step(60);
      // missile
      p.abilities.missile = false; const m0 = W.S.ammo; G.input.press('missile'); G.step(2); gate.missileOff = W.S.ammo === m0;
      p.abilities.missile = true; G.input.press('missile'); G.step(30); gate.missileOn = W.S.ammo === m0 - 4;
      // kit
      p.ap = 4000; p.abilities.kit = false; const k0 = W.U.ammo; G.input.press('kit'); G.step(2); gate.kitOff = W.U.ammo === k0;
      p.abilities.kit = true; G.input.press('kit'); G.step(2); gate.kitOn = W.U.ammo === k0 - 1; G.step(80);
      // tear (candidate requires abilities.tear)
      c.enemies.despawn(d);
      const h = H.spawn('drone', H.fwd(18, 8), { config: { haul: 'harpoon_gaff' }, behavior: 'scripted' });
      c.combat.damage(h, 0, 600, { team: 'player', kind: 'test' });
      p.abilities.tear = false; G.step(2); gate.tearOff = c.haul.candidate === null;
      p.abilities.tear = true; G.step(2); gate.tearOn = c.haul.candidate === h;
      c.enemies.despawn(h);
      o.gate = gate;
      // scales
      H.clean(); H.place(150, 0); G.step(20);
      p.hoverCostScale = 2; G.input.hold('jump', true); G.step(19); const s1 = p.en; G.step(30); o.hoverIcing = (s1 - p.en) / 0.5;
      G.input.clear(); G.step(150); p.hoverCostScale = 1;
      p.en = 500; p.enUseT = 0; p.enRegenScale = 0; G.step(60); o.regenOff = p.en === 500; p.enRegenScale = 1; G.step(30); o.regenOn = p.en > 500;
      G.teleport({ s: 150, l: 0 }, { h: 60 }); p.gravityScale = 0.25; G.step(1); const vy0 = p.vel.y; G.step(60); o.lowGravAcc = (vy0 - p.vel.y) / 1.0;
      p.gravityScale = 1; G.step(240);
      // hidden survives setLoadout and spawn
      p.hidden = true; G.step(1); const h1 = p.rig.root.visible === false;
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT }); G.step(1); const h2 = p.rig.root.visible === false;
      p.hidden = false; G.step(1); o.hidden = h1 && h2 && p.rig.root.visible === true;
      // animOverride: the kneel lowers the pelvis
      G.step(30); const py0 = p.rig.pelvis.position.y; p.animOverride = { crouch: 1 }; G.step(30); const py1 = p.rig.pelvis.position.y;
      p.animOverride = null; G.step(30); o.kneel = { py0, py1, back: p.rig.pelvis.position.y };
      // idleFacing: after 5 s idle the body turns to it at 0.35 rad/s and holds; input releases it
      H.place(150, 0); G.input.look(1, 0); G.step(1); p.yaw = p.bodyYaw = 1.4; G.step(10); p.idleFacing = 0;
      G.step(4 * 60); o.idleEarly = Math.abs(p.bodyYaw - 1.4) < 0.02;
      G.step(9 * 60); o.idleReached = p.idleFacingReached; o.idleBody = p.bodyYaw; o.idleYaw = p.yaw;
      G.input.look(5, 0); G.step(30); o.idleReleased = !p.idleFacingReached && Math.abs(p.bodyYaw - p.yaw) < 0.05;
      p.idleFacing = null;
      // autopilot: walks there (even frozen), faces, clears itself and emits its event
      H.clean(); H.place(150, 0); G.step(10);
      const to = H.fwd(25, 0, 12); p.frozen = true;
      p.autopilot = { to, face: 0.5, speed: 5 };
      let n = 0; H.ev.length = 0;
      while (p.autopilot && n < 60 * 20) { G.step(1); n++; }
      o.auto = { t: n / 60, d: H.dist(p.pos, to), yaw: p.bodyYaw, ev: H.ev.filter(e => e.t === 'player:autopilotDone').length };
      p.frozen = false;
      // invulnerable player takes 0 (blocked), event still fires
      H.clean({ god: false }); G.step(2);
      p.invuln = true; const ap0 = p.ap; H.ev.length = 0;
      const info = c.combat.damage(p, 1500, 900, { team: 'enemy', kind: 'test' });
      const ev = H.ev.find(e => e.t === 'player:damaged');
      o.invuln = { ap: p.ap === ap0, blocked: !!info.blocked, amount: info.amount, imp: info.imp, ev: !!ev && ev.e.blocked === true && ev.e.amount === 0 };
      p.invuln = false; c.combat.god = true;
      return o;
    });
    g.log('addendum', JSON.stringify(r));
    for (const [k, v] of Object.entries(r.gate)) if (k !== 'moveScaled') g.assert(v === true, `ability gating: ${k}`);
    g.assert(near(r.gate.moveScaled, 9.9, 0.6), `abilities.move 0.33 → walk speed ${r.gate.moveScaled.toFixed(2)} (≈10)`);
    g.assert(near(r.hoverIcing, 300, 5), `hoverCostScale 2 → hover drains ${r.hoverIcing.toFixed(1)} EN/s`);
    g.assert(r.regenOff && r.regenOn, `enRegenScale 0 stops EN regen (${r.regenOff}, ${r.regenOn})`);
    g.assert(near(r.lowGravAcc, 11.25, 0.6), `gravityScale 0.25 → fall acceleration ${r.lowGravAcc.toFixed(2)} m/s²`);
    g.assert(r.hidden, 'hidden survives setLoadout and hides the rig');
    g.assert(r.kneel.py0 - r.kneel.py1 > 1 && r.kneel.back > r.kneel.py1 + 1, `animOverride { crouch: 1 } kneels (pelvis ${r.kneel.py0.toFixed(2)} → ${r.kneel.py1.toFixed(2)} → ${r.kneel.back.toFixed(2)})`);
    g.assert(r.idleEarly && r.idleReached && Math.abs(r.idleBody) < 0.02 && Math.abs(r.idleYaw - 1.4) < 0.01 && r.idleReleased,
      `idleFacing: waits 5 s, turns the body (not the camera) to north and holds, input releases (${JSON.stringify({ e: r.idleEarly, r: r.idleReached, b: r.idleBody.toFixed(3), rel: r.idleReleased })})`);
    g.assert(r.auto.d < 1.6 && Math.abs(r.auto.yaw - 0.5) < 0.02 && r.auto.ev === 1, `autopilot arrives (${r.auto.d.toFixed(2)} m, ${r.auto.t.toFixed(1)} s), faces, emits player:autopilotDone`);
    g.assert(r.invuln.ap && r.invuln.blocked && r.invuln.amount === 0 && r.invuln.imp === 0 && r.invuln.ev, `invulnerable player takes 0, blocked (${JSON.stringify(r.invuln)})`);
  });

  // ---------------------------------------------------------------------------------------------- 2b extras level code relies on
  await sec('extras', async () => {
    const r = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, T = H.T;
      // player.tow: a level-driven drag (L1 Gaffer harpoon) that a quick boost snaps
      H.clean(); H.place(150, 0); G.step(5);
      const anchor = H.fwd(80, 0); let broke = null;
      p.tow = { to: anchor, speed: 18, seconds: 3, onBreak: (why) => { broke = why; } };
      const d0 = H.dist(p.pos, anchor); G.step(60); const d1 = H.dist(p.pos, anchor);
      G.input.press('boost'); G.step(1);
      const tow = { pulled: d0 - d1, broke, cleared: p.tow === null };
      // a turret carried by something else (the Icebreaker's deck) keeps its collider under it
      H.clean(); H.place(150, 0); G.step(5);
      const t = H.spawn('turret', H.fwd(40, 0));
      const solid = (q) => c.collision.pointInSolid(new T.Vector3(q.x, q.y + 1.5, q.z));
      const old = t.pos.clone(), was = solid(old);
      t.pos.x += 30; t.heldT = 0.2; G.step(2);
      const col = { was, now: solid(t.pos), left: solid(old) };
      // dropship deploy groups in UnitGroup shape
      const ds = H.spawn('dropship', H.fwd(120, 0), { config: { deploy: { units: [{ kind: 'tank', count: 2, opts: { behavior: 'hold' } }] }, hover: 2 } });
      let n = 0; while (!ds.ai.deployed && n < 40 * 60) { G.step(30); n += 30; }
      G.step(240);
      const tanks = c.enemies.all().filter(u => u.kind === 'tank' && u.alive);
      const landed = tanks.every(u => Math.abs(u.pos.y - c.world.groundHeight(u.pos.x, u.pos.z)) < 1.5 && !u.dropping);
      return { tow, col, deployed: tanks.length, landed, behaviors: tanks.map(u => u.behavior) };
    });
    g.log('extras', JSON.stringify(r));
    g.assert(near(r.tow.pulled, 18, 2.5) && r.tow.broke === 'boost' && r.tow.cleared, `player.tow drags 18 m/s and a quick boost snaps it (${r.tow.pulled.toFixed(1)} m in 1 s, ${r.tow.broke})`);
    g.assert(r.col.was && r.col.now && !r.col.left, `a moved turret's collider follows it (${JSON.stringify(r.col)})`);
    g.assert(r.deployed === 2 && r.landed && r.behaviors.every(b => b === 'hold'), `dropship deploys a UnitGroup-shaped group that lands (${r.deployed}, ${r.behaviors})`);

    // combat.radial is re-entrant: a death inside a splash that splashes again (chained explosions) must not cut the
    // outer splash short (review rev2 #2)
    const re = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c;
      H.clean(); H.place(160, 0); G.step(5);
      const A = H.spawn('tank', H.fwd(60, 0, -9), { behavior: 'hold' });
      const B = H.spawn('tank', H.fwd(60, 0, 0), { behavior: 'hold' });
      const C = H.spawn('tank', H.fwd(60, 0, 9), { behavior: 'hold' });
      A.ap = 10; B.ap = 5000; C.ap = 5000;
      const far = H.fwd(400, 0);
      let nested = -1, depth = 0;
      const off = c.events.on('target:killed', (e) => {
        if (e.target !== A) return;
        depth++; nested = c.combat.radial(far, 10, 50, 0, { team: 'player', kind: 'test' }); depth--;
      });
      const n = c.combat.radial(A.center(), 30, 100, 0, { team: 'player', kind: 'test' }, { falloff: false });
      off();
      const out = { n, nested, aDead: !A.alive, b: 5000 - B.ap, c: 5000 - C.ap };
      H.clean();
      return out;
    });
    g.assert(re.n === 3 && re.nested === 0 && re.aDead && re.b === 100 && re.c === 100,
      `combat.radial is re-entrant: a nested splash from a death inside it leaves the outer one whole (${JSON.stringify(re)})`);
  });

  // ---------------------------------------------------------------------------------------------- 3 weapons
  await sec('weapons', async () => {
    // rifle with lock kills a drone at 80 m within 6 s
    const rifle = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(20);
      const d = H.spawn('drone', H.fwd(80, 22));
      H.face(d.center()); G.step(2);
      const locked = p.lock === d;
      G.input.press('lock'); G.step(1);
      G.input.hold('fire', true);
      let n = 0; while (d.alive && n < 6 * 60) { G.step(1); n++; }
      G.input.clear();
      return { locked, hard: true, t: n / 60, dead: !d.alive, dist0: 80, kills: c.combat.stats.kills };
    });
    g.assert(rifle.locked && rifle.dead && rifle.t <= 6, `rifle with lock kills a drone at 80 m in ${rifle.t.toFixed(2)} s (≤ 6)`);
    await shot('rifle-vs-drone');

    // blade lunge to a tank 60 m away
    const blade = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(20);
      const t = H.spawn('tank', H.fwd(62, 0), { behavior: 'hold' });
      G.step(2); H.face(t.center()); G.step(3);
      const locked = p.lock === t, ap0 = t.ap, p0 = p.pos.clone();
      G.input.press('blade');
      let minD = 1e9, n = 0;
      for (; n < 60; n++) { G.step(1); minD = Math.min(minD, p.center().distanceTo(t.center())); }
      return { locked, minD, travelled: p.pos.distanceTo(p0), dmg: ap0 - t.ap, kinds: H.dmg.filter(x => x.tk === 'tank').map(x => x.sk) };
    });
    g.assert(blade.locked && blade.minD < 13 && blade.travelled > 40 && blade.dmg >= 2300 && blade.kinds.includes('blade'),
      `blade lunges ${blade.travelled.toFixed(1)} m to the tank (closest ${blade.minD.toFixed(1)} m) and hits for ${blade.dmg.toFixed(0)} (kind ${blade.kinds})`);

    // stagger and the bonus (units ×1.6, player ×1.25, player:staggered)
    const stag = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean({ god: false }); H.place(160, 0); G.step(5);
      const t = H.spawn('tank', H.fwd(80, 0), { behavior: 'hold' });
      const i1 = c.combat.damage(t, 0, 999, { team: 'player', kind: 'test' });
      const i2 = c.combat.damage(t, 0, 1, { team: 'player', kind: 'test' });
      const st = t.stagT; const ap0 = t.ap;
      c.combat.damage(t, 100, 0, { team: 'player', kind: 'test' });
      const unitBonus = ap0 - t.ap;
      G.step(Math.ceil(2.3 * 60));
      const recovered = t.stagT === 0;
      H.ev.length = 0;
      const pi = c.combat.damage(p, 0, 1400, { team: 'enemy' });
      const pev = H.ev.filter(e => e.t === 'player:staggered').length;
      const pap0 = p.ap; c.combat.damage(p, 100, 0, { team: 'enemy' }); const playerBonus = pap0 - p.ap;
      const pst = p.stagT;
      G.input.move(0, 1); G.step(30); const frozenWhileStag = H.hs() < 3;
      G.step(60); const movesAfter = H.hs() > 10; G.input.clear();
      c.combat.god = true; p.refill();
      return { i1: i1.staggered, i2: i2.staggered, st, unitBonus, recovered, pst: pi.staggered, pev, playerBonus, stagDur: pst, frozenWhileStag, movesAfter };
    });
    g.assert(!stag.i1 && stag.i2 && near(stag.st, 2.2, 0.01) && near(stag.unitBonus, 160, 0.01) && stag.recovered,
      `unit stagger at impMax, 2.2 s, ×1.6 bonus (${stag.unitBonus})`);
    g.assert(stag.pst && stag.pev === 1 && near(stag.playerBonus, 125, 0.01) && stag.frozenWhileStag && stag.movesAfter,
      `player stagger (event, ×1.25 bonus ${stag.playerBonus}, 1 s lockout)`);

    // missiles home
    const msl = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(10);
      const t = H.spawn('tank', H.fwd(200, 0, 70), { behavior: 'hold' });
      G.step(2); H.face(H.fwd(200, 10, 0)); G.step(3);
      const ap0 = t.ap, a0 = p.weapons.S.ammo;
      G.input.press('missile'); G.step(40);
      const homing = []; c.projectiles.forEach(q => { if (q.kind === 'missile') homing.push(q.target === t && q.turn > 0); });
      // angle between missile velocity and the line to the target, early vs later
      const ang = () => { let a = []; c.projectiles.forEach(q => { if (q.kind === 'missile' && q.target === t) { const w = t.center().sub(q.pos).normalize(); a.push(q.vel.clone().normalize().angleTo(w)); } }); return a.length ? a.reduce((x, y) => x + y) / a.length : null; };
      const angA = ang(); G.step(30); const angB = ang();
      window.__p4.mslShot = true;
      return { pre: true, ammo: a0 - p.weapons.S.ammo, homing, angA, angB, ap0 };
    });
    await shot('missiles-in-flight');
    Object.assign(msl, await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      const t = c.enemies.all().find(u => u.kind === 'tank' && u.tags.has('p4'));
      G.step(180);
      return { dmg: t.apMax - t.ap, hits: H.dmg.filter(x => x.tk === 'tank' && x.sk === 'missiles').length };
    }));
    g.assert(msl.ammo === 4 && msl.homing.length === 4 && msl.homing.every(Boolean) && (msl.angB ?? 0) <= (msl.angA ?? 1) && msl.hits >= 3,
      `missiles home (${msl.homing.length} homing, angle ${msl.angA?.toFixed(2)} → ${msl.angB?.toFixed(2)}, ${msl.hits} hits, ${msl.dmg.toFixed(0)} dmg)`);

    // kits heal
    const kit = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(5);
      p.ap = 3000; G.input.press('kit'); G.step(80);
      return { ap: p.ap, kits: p.weapons.U.ammo, label: p.weapons.U.readout().label };
    });
    g.assert(near(kit.ap, 3000 + 3600 * 1.2, 40) && kit.kits === 2 && kit.label === '2', `kit heals 3600/s for 1.2 s (AP ${kit.ap.toFixed(0)}, kits ${kit.kits})`);

    // every weapon in PARTS fires and reads out correctly
    const all = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, out = [];
      const ACT = { R: 'fire', L: 'blade', S: 'missile', U: 'kit' };
      for (const part of Object.values(H.LO.PARTS)) {
        H.clean(); H.place(160, 0);
        p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, [part.slot]: part.id }); p.refill(); G.step(5);
        if (part.slot === 'U') p.ap = 5000;
        // a sturdy target 45 m ahead so every weapon lands a hit (DamageSource.kind is checked later)
        const tgt = H.spawn('tank', H.fwd(45, 0), { behavior: 'hold', ap: 1e6 });
        G.step(1); H.face(tgt.center()); G.step(2);
        const w = p.weapons[part.slot]; const r0 = w.readout(); const a0 = w.ammo; const n0 = c.projectiles.count;
        let fired = 0; const cnt = () => { fired = Math.max(fired, c.projectiles.count - n0); };
        G.input.hold(ACT[part.slot], true); G.step(1); cnt(); G.input.hold(ACT[part.slot], false);
        for (let i = 0; i < 40; i++) { G.step(1); cnt(); }
        const r1 = w.readout();
        G.step(110);
        out.push({ id: part.id, weapon: part.weapon, r0, r1, a0, a1: w.ammo, cd: w.cd, fired, repair: p.repairT > 0 || p.ap > 5000,
                   lunge: !!p.lunge || w.cd > 0, max: w.ammoMax });
      }
      H.clean();
      return out;
    });
    for (const w of all) {
      let ok = false, why = '';
      const num = (s) => /^\d+\.\d$/.test(s);
      switch (w.weapon) {
        case 'rifle': case 'mg': case 'shotgun': case 'cannon':
          ok = w.r0.label === String(w.max) && w.a1 < w.a0 && w.r1.label === String(w.a1) && w.fired > 0; break;
        case 'blade': ok = w.r0.label === 'READY' && num(w.r1.label) && w.r1.cooling; break;
        case 'missiles': case 'micromissiles': case 'mortar':
          ok = w.r0.label === `READY · ${w.max}` && num(w.r1.label) && w.a1 < w.a0 && w.fired > 0; break;
        case 'kit': ok = w.r0.label === String(w.max) && w.r1.label === String(w.max - 1) && w.repair; break;
        case 'harpoon': ok = w.r0.label === 'READY' && num(w.r1.label) && w.fired > 0; break;
        case 'flares': ok = w.r0.label === String(w.max) && w.r1.label === String(w.max - 1) && w.fired > 0; break;
        default: why = 'unknown weapon type';
      }
      g.assert(ok, `${w.id} (${w.weapon}) fires and reads out: ${w.r0.label} → ${w.r1.label} (ammo ${w.a0} → ${w.a1}, projectiles ${w.fired}) ${why}`);
    }
  });

  // ---------------------------------------------------------------------------------------------- 4 harpoon, flares, damage kinds
  await sec('harpoon-flares', async () => {
    const reel = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(170, 0);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, L: 'harpoon_gaff' }); p.refill(); G.step(10);
      const d = H.spawn('drone', H.fwd(48, 14));
      d.pos.y = c.world.groundHeight(d.pos.x, d.pos.z) + 14;
      G.step(1); H.face(d.center()); G.step(2);
      const locked = p.lock === d, d0 = H.dist(d.pos, p.pos);
      G.input.press('blade');
      let reeling = false, n = 0;
      for (; n < 90; n++) { G.step(1); if (p.weapons.L.state === 'reel') reeling = true; if (reeling && p.weapons.L.state === 'idle') break; }
      const d1 = H.dist(d.pos, p.pos);
      const hit = H.dmg.find(x => x.tk === 'drone' && x.sk === 'harpoon');
      return { locked, d0, d1, reeling, t: n / 60, hit: hit ? { amt: hit.amt, imp: hit.imp, staggered: hit.staggered } : null, alive: d.alive };
    });
    g.assert(reel.locked && reel.reeling && reel.hit && reel.hit.amt === 300 && reel.hit.imp === 2000 && reel.hit.staggered && reel.d1 < 16 && reel.d1 > 8,
      `harpoon reels a drone from ${reel.d0.toFixed(1)} m to ${reel.d1.toFixed(1)} m (300 dmg, 2000 imp, staggered) in ${reel.t.toFixed(2)} s`);
    // the shot: a second reel seen from the side, mid-haul, so the cable and the drone both show (after the reel the
    // drone hangs 12 m ahead, hidden behind the mech in the chase view)
    const rs = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean({ loadout: false }); H.place(170, 0);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, L: 'harpoon_gaff' }); p.refill(); G.step(10);
      const d = H.spawn('drone', H.fwd(48, 14));
      d.pos.y = c.world.groundHeight(d.pos.x, d.pos.z) + 14;
      G.step(1); H.face(d.center()); G.step(2);
      G.input.press('blade');
      let n = 0; while (p.weapons.L.state !== 'reel' && n < 60) { G.step(1); n++; }
      G.step(12);
      const a = p.center(), b = d.center(), m = a.clone().lerp(b, 0.5);
      return { state: p.weapons.L.state, dist: a.distanceTo(b),
               cam: [m.x + Math.cos(p.yaw) * 30, m.y + 6, m.z - Math.sin(p.yaw) * 30], look: [m.x, m.y + 1, m.z] };
    });
    g.log('harpoon shot', JSON.stringify({ state: rs.state, dist: +rs.dist.toFixed(1) }));
    await g.camera(rs.cam, rs.look, 55);
    await shot('harpoon-reel', { hud: false });
    await g.freeCam(false);
    await g.eval(() => { const H = window.__p4; H.G.step(40); H.c.player.setLoadout({ ...H.LO.DEFAULT_LOADOUT }); H.clean(); });

    const pull = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean({ loadout: false }); H.place(200, 0);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, L: 'harpoon_gaff' }); p.refill(); G.step(10);
      // a wall 60 m ahead, across the line of fire
      const cpos = H.fwd(60, 0), gy = c.world.groundHeight(cpos.x, cpos.z);
      const wall = c.collision.obox(cpos.x, cpos.z, 50, 4, p.yaw, gy + 40, gy - 10, { surface: 'concrete', tag: 'p4wall' });
      H.face(new H.T.Vector3(cpos.x, gy + 9, cpos.z)); G.step(3);
      const aimHit = p.aimHit, aimD = H.dist(p.aimPoint, p.pos);
      const p0 = p.pos.clone();
      G.input.press('blade');
      let pulled = false, n = 0;
      for (; n < 150; n++) { G.step(1); if (p.pull) pulled = true; if (pulled && !p.pull) break; }
      const travelled = H.dist(p.pos, p0), toWall = H.dist(p.pos, cpos);
      const vEnd = H.hs();
      G.step(60);
      c.collision.remove(wall);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT });
      return { aimHit, aimD, pulled, travelled, toWall, t: n / 60, vEnd };
    });
    g.assert(pull.aimHit && pull.pulled && pull.travelled > 40 && pull.toWall < 12 && pull.vEnd > 20,
      `harpoon pulls the player to a wall (${pull.travelled.toFixed(1)} m in ${pull.t.toFixed(2)} s, ends ${pull.toWall.toFixed(1)} m from it, keeps ${pull.vEnd.toFixed(0)} m/s)`);

    // A5.1: a light target that cannot move (turret, impMax 800) still takes 300 dmg + 2000 imp (a stagger) and is not
    // reeled; a heavy (impMax > 1000) pulls the player and takes no damage (review rev2 #4)
    const hk = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      const one = (kind) => {
        H.clean({ loadout: false }); H.place(200, 0);
        p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, L: 'harpoon_gaff' }); p.refill(); G.step(10);
        const t = H.spawn(kind, H.fwd(50, 0), { behavior: 'scripted' });
        G.step(1); H.face(t.center()); G.step(2);
        const locked = p.lock === t, p0 = p.pos.clone(), t0 = t.pos.clone();
        G.input.press('blade');
        let pulled = false, reel = false, stag = 0, n = 0;
        for (; n < 90; n++) {
          G.step(1);
          if (p.pull) pulled = true;
          if (p.weapons.L.state === 'reel') reel = true;
          stag = Math.max(stag, t.stagT || 0);
          if (n > 30 && !p.pull && p.weapons.L.state === 'idle') break;
        }
        const hits = H.dmg.filter(x => x.tid === t.id && x.sk === 'harpoon');
        return { kind, impMax: t.impMax, locked, pulled, reel, stag: +stag.toFixed(2), moved: +H.dist(p.pos, p0).toFixed(1),
                 tMoved: +H.dist(t.pos, t0).toFixed(1), hits: hits.map(x => [Math.round(x.amt), Math.round(x.imp), x.staggered]),
                 state: p.weapons.L.state };
      };
      const out = { turret: one('turret'), heavy: one('tank_heavy') };
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT }); H.clean();
      return out;
    });
    g.log('harpoon kinds', JSON.stringify(hk));
    const tu = hk.turret, hv = hk.heavy;
    g.assert(tu.locked && tu.impMax <= 1000 && tu.hits.length === 1 && tu.hits[0][0] === 300 && tu.hits[0][1] === 2000 && tu.hits[0][2] && tu.stag > 0
      && !tu.pulled && !tu.reel && tu.moved < 2 && tu.tMoved < 0.5 && tu.state === 'idle',
      `harpoon on a turret (impMax ${tu.impMax}): 300 dmg + 2000 imp stagger, no reel and no pull (player moved ${tu.moved} m)`);
    g.assert(hv.locked && hv.impMax > 1000 && hv.hits.length === 0 && hv.pulled && hv.moved > 30,
      `harpoon on a tank_heavy (impMax ${hv.impMax}) pulls the player ${hv.moved} m and deals no damage (${hv.hits.length} hits)`);

    const flare = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, T = H.T;
      H.clean(); H.place(170, 0);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, S: 'flare_pod' }); p.refill(); p.pitch = 0.9; G.step(10);
      const from = p.center().add(new T.Vector3(18, 12, 14));
      const m = c.projectiles.fire({ pos: from, vel: p.center().sub(from).normalize().multiplyScalar(40), team: 'enemy', kind: 'missile',
                                     target: p, turn: 2.2, accel: 60, maxSpeed: 120, dmg: 420, imp: 220, life: 6 });
      const inc0 = c.projectiles.incoming(p);
      G.input.press('missile'); G.step(1);
      const retargeted = m.alive && m.target !== p && m.target?.alive === true && !!m.target?.flare;
      const inc1 = c.projectiles.incoming(p);
      const decoyed = p.weapons.S.lastDecoyed;
      G.step(240);
      const hitPlayer = H.dmg.some(x => x.tk === 'player' && x.sk === 'missile');
      return { inc0, inc1, retargeted, decoyed, hitPlayer, ammo: p.weapons.S.ammo, label: p.weapons.S.readout().label };
    });
    g.assert(flare.inc0 && flare.retargeted && !flare.inc1 && flare.decoyed === 1 && flare.ammo === 5,
      `a flare retargets an incoming missile (incoming ${flare.inc0} → ${flare.inc1}, switched ${flare.decoyed}, flares ${flare.label}; hit player afterwards: ${flare.hitPlayer})`);
    const fl = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean({ loadout: false }); H.place(170, 0); p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, S: 'flare_pod' }); p.refill(); G.step(5);
      H.face(H.fwd(40, 0)); G.step(2); G.input.press('missile'); G.step(70);
      const f = H.fwd(40, 0);
      return { cam: [p.pos.x + Math.cos(p.yaw) * 22, p.pos.y + 14, p.pos.z - Math.sin(p.yaw) * 22], look: [f.x, f.y + 2, f.z] };
    });
    await g.camera(fl.cam, fl.look, 55);
    await shot('flare-burning', { hud: false });
    await g.freeCam(false);
    await g.eval(() => { const H = window.__p4; H.c.player.setLoadout({ ...H.LO.DEFAULT_LOADOUT }); H.c.player.refill(); });

    const blind = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(170, 0);
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT, S: 'flare_pod' }); p.refill(); G.step(5);
      const t = H.spawn('tank', H.fwd(35, 0), { behavior: 'hold' });
      G.step(2); H.face(t.center()); G.step(2);
      G.input.press('missile');
      let blindMax = 0; for (let i = 0; i < 90; i++) { G.step(1); blindMax = Math.max(blindMax, t.blindT); }
      const shotsBefore = H.dmg.filter(x => x.ok === 'tank').length;
      // while blind it doesn't fire
      t.blindT = 4; t.cd = 0; let fired = 0;
      const n0 = c.projectiles.count;
      for (let i = 0; i < 120; i++) { G.step(1); if (t.blindT > 0.1 && c.projectiles.count > n0) fired++; }
      p.setLoadout({ ...H.LO.DEFAULT_LOADOUT });
      return { blindMax, fired, blindNow: t.blindT };
    });
    g.assert(blind.blindMax > 3 && blind.fired === 0, `a flare that hits sticks and blinds (blindT ${blind.blindMax.toFixed(2)}), blinded units hold fire`);

    const kinds = await g.eval(() => [...window.__p4.kinds]);
    g.log('player damage kinds seen', kinds.join(','));
    const want = ['rifle', 'mg', 'shotgun', 'cannon', 'blade', 'harpoon', 'missiles', 'micromissiles', 'mortar'];
    g.assert(want.every(k => kinds.includes(k)) && kinds.every(k => typeof k === 'string'),
      `player damage carries DamageSource.kind = weapon type (${kinds.join(', ')})`);
  });

  // ---------------------------------------------------------------------------------------------- 5 haul / TEAR
  await sec('haul', async () => {
    // the haul glint on a live target (before the TEAR)
    await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c;
      H.clean(); H.place(180, 0); G.step(5);
      const s = H.spawn('tank', H.fwd(28, 0, 6), { behavior: 'hold', config: { haul: 'shotgun_s8' } });
      s.yaw = c.player.yaw + 2.4; G.step(30);
    });
    await shot('haul-glint');
    const tear = await g.eval(async () => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(180, 0); G.step(5);
      const d = H.spawn('drone', H.fwd(20, 8), { config: { haul: 'harpoon_gaff' } });
      const parsed = { part: d.haul?.part, heavy: d.haul?.heavy };
      window.__p4.glintTarget = d;
      c.combat.damage(d, 0, 600, { team: 'player', kind: 'test' });
      G.step(1);
      const cand = c.haul.candidate === d;
      H.face(d.center());
      G.input.hold('blade', true);
      let started = -1, n = 0, prog = 0;
      for (; n < 40; n++) { G.step(1); prog = Math.max(prog, c.haul.holdProgress); if (c.haul.busy && started < 0) started = n; }
      const inv = p.invuln, lunge = !!p.lunge, Lcd = p.weapons.L.cd;
      G.input.clear();
      return { d: true, started, prog, inv, lunge, Lcd, parsed, cand };
    });
    await shot('tear-rip');
    const tear2 = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      const d = c.enemies.all().find(u => u.kind === 'drone' && u.tags.has('p4'));
      for (let i = 0; i < 80; i++) G.step(1);
      const tev = H.ev.find(e => e.t === 'haul:tear');
      const kev = H.ev.find(e => e.t === 'target:killed' && e.e.target === d);
      return { rack: [...c.haul.rack], tears: c.haul.tears, dead: !d.alive,
               tear: tev ? { part: tev.e.part, destroyed: tev.e.destroyed } : null, killKind: kev?.e.source?.kind,
               invAfter: p.invuln, flags: { rack: c.mission.flags['haul:rack'], tears: c.mission.flags['haul:tears'] } };
    });
    Object.assign(tear, tear2, { started: (tear.started + 1) / 60 });
    g.log('tear', JSON.stringify(tear));
    g.assert(tear.parsed.part === 'harpoon_gaff' && tear.parsed.heavy === false, 'Unit parses config.haul (heavy from impMax)');
    g.assert(tear.cand && near(tear.started, 0.4, 0.05) && tear.inv && !tear.lunge && tear.Lcd === 0,
      `TEAR: candidate, 0.4 s hold starts the rip (${tear.started.toFixed(2)} s), invulnerable, blade swallowed`);
    g.assert(tear.dead && tear.tear?.destroyed === true && tear.killKind === 'tear' && JSON.stringify(tear.rack) === '["harpoon_gaff"]' && tear.tears === 1 && !tear.invAfter,
      `TEAR on a staggered haul drone gives a rack of 1 (${JSON.stringify(tear.rack)}, kill kind ${tear.killKind})`);
    g.assert(JSON.stringify(tear.flags.rack) === '["harpoon_gaff"]' && tear.flags.tears === 1, 'rack mirrored to mission flags haul:rack / haul:tears');

    const heavy = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      c.input.clearInjected(); c.projectiles.clear();
      for (const u of c.enemies.all().slice()) c.enemies.despawn(u);
      H.place(180, 0); G.step(5);
      let taken = 0;
      const t = H.spawn('tank_heavy', H.fwd(22, 0), { behavior: 'hold', config: { haul: { part: 'flare_pod', onTaken: () => { taken++; } } } });
      c.combat.damage(t, 0, 2200, { team: 'player', kind: 'test' });
      G.step(1); H.face(t.center());
      G.input.hold('blade', true); G.step(30); G.input.clear(); G.step(80);
      return { alive: t.alive, taken: t.haul.taken, onTaken: taken, rack: [...c.haul.rack], heavy: t.haul.heavy };
    });
    g.assert(heavy.alive && heavy.taken && heavy.onTaken === 1 && heavy.heavy && heavy.rack.length === 2 && heavy.rack[1] === 'flare_pod',
      `TEAR on a heavy takes the part and leaves it alive (${JSON.stringify(heavy)})`);
    await shot('after-tear');

    const full = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, U = H.U;
      const realChoice = c.hud.choice;
      const calls = [];
      let answer = 'drop0';
      c.hud.choice = (def) => { calls.push({ title: def.title, labels: def.options.map(o => o.label), keys: def.options.map(o => o.key), seconds: def.seconds, scale: c.timeScale }); return U.simResolved(answer); };
      const out = {};
      c.haul.add('shotgun_s8');
      out.rack3 = [...c.haul.rack];
      H.ev.length = 0;
      let res = null; U.whenSettled(c.haul.add('mg_r12'), (v) => { res = v; });
      out.after = [...c.haul.rack]; out.res = res; out.call = calls[0]; out.scaleAfter = c.timeScale;
      const ev = H.ev.find(e => e.t === 'haul:racked'); out.dropped = ev?.e.dropped;
      answer = 'leave'; H.ev.length = 0;
      let res2 = null; U.whenSettled(c.haul.add('cannon_hc90'), (v) => { res2 = v; });
      out.res2 = res2; out.left = H.ev.some(e => e.t === 'haul:left' && e.e.part === 'cannon_hc90'); out.unchanged = JSON.stringify(c.haul.rack) === JSON.stringify(out.after);
      c.hud.choice = realChoice;
      return out;
    });
    g.log('full rack', JSON.stringify(full));
    g.assert(full.call && full.call.title === 'RACK FULL. Drop which part?' && full.call.labels.length === 4 && full.call.labels[3] === 'Leave it'
      && full.call.labels[0].startsWith('Drop ') && near(full.call.scale, 0.3, 1e-9) && full.call.seconds === 8,
      `a full rack opens the choice (${full.call?.labels.join(' | ')}, timeScale ${full.call?.scale})`);
    g.assert(full.res === true && full.dropped === 'harpoon_gaff' && JSON.stringify(full.after) === '["flare_pod","shotgun_s8","mg_r12"]' && full.scaleAfter === 1,
      `dropping swaps the part in and restores time (${JSON.stringify(full.after)})`);
    g.assert(full.res2 === false && full.left && full.unchanged, 'Leave it keeps the rack (haul:left)');

    const cp = await g.eval(async () => {
      const H = window.__p4, G = H.G, c = H.c, U = H.U;
      const before = [...c.haul.rack], tears0 = c.haul.tears;
      G.checkpoint('cp_start');
      const real = c.hud.choice;
      c.hud.choice = () => U.simResolved('drop1');
      c.haul.add('blade_hx');
      c.hud.choice = real;
      const changed = [...c.haul.rack];
      await G.restart(); G.step(2);
      const restored = [...c.haul.rack], tears = c.haul.tears;
      // a haul cache pickup goes to the rack
      c.haul.clear();
      c.events.emit('pickup', { id: 'p4cache', kind: 'salvage', unlocks: 'harpoon_gaff', haul: true });
      const cache = [...c.haul.rack];
      c.haul.clear();
      return { before, changed, restored, tears0, tears, cache };
    });
    g.assert(JSON.stringify(cp.restored) === JSON.stringify(cp.before) && JSON.stringify(cp.changed) !== JSON.stringify(cp.before) && cp.tears === cp.tears0,
      `a checkpoint restart restores the rack (${JSON.stringify(cp.before)} → ${JSON.stringify(cp.changed)} → ${JSON.stringify(cp.restored)})`);
    g.assert(JSON.stringify(cp.cache) === '["harpoon_gaff"]', 'a haul cache pickup racks its part');

    // a restart during the 1.2 s rip puts the gameplay FOV and invulnerability back (review rev2 #1)
    const fov = await g.eval(async () => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(180, 0); G.step(5);
      const base = c.cameraRig.baseFov ?? c.camera.fov, start = c.camera.fov;
      const d = H.spawn('drone', H.fwd(18, 8), { config: { haul: 'harpoon_gaff' }, behavior: 'scripted' });
      c.combat.damage(d, 0, 600, { team: 'player', kind: 'test' });
      G.step(1); H.face(d.center()); G.input.hold('blade', true);
      G.step(36);
      const busy = c.haul.busy, mid = c.camera.fov, inv = p.invuln;
      G.input.clear();
      await G.restart(); G.step(60);
      const out = { base, start, busy, mid, inv, after: c.camera.fov, invAfter: p.invuln, busyAfter: c.haul.busy, rip: !!p.rip };
      c.haul.clear(); H.clean();
      return out;
    });
    g.assert(fov.busy && fov.inv && fov.mid < fov.base - 4 && Math.abs(fov.after - fov.base) < 0.01 && !fov.invAfter && !fov.busyAfter && !fov.rip,
      `a restart mid-rip restores the FOV (${fov.mid.toFixed(1)} → ${fov.after.toFixed(1)}, base ${fov.base}) and invulnerability`);
  });

  // ---------------------------------------------------------------------------------------------- 6 every enemy kind
  await sec('kinds', async () => {
    const kinds = await g.eval(() => window.__p4.c.enemies.kinds());
    const want = ['drone', 'tank', 'tank_heavy', 'turret', 'gunship', 'walker', 'artillery', 'apc', 'beacon', 'dropship', 'mech'];
    g.assert(want.every(k => kinds.includes(k)), `every kind registered (${kinds.join(', ')})`);
    const SPEC = { drone: [150, 20, 20], tank: [160, 0, 20], tank_heavy: [160, 0, 20], turret: [120, 0, 15], gunship: [200, 35, 20],
                   walker: [200, 0, 25], artillery: [450, 0, 25], apc: [320, 0, 30], beacon: [150, 0, 30], dropship: [150, 0, 40], mech: [150, 0, 20] };
    for (const kind of want) {
      const [d, h, maxT] = SPEC[kind];
      const r = await g.eval(([kind, d, h, maxT]) => {
        const H = window.__p4, G = H.G, c = H.c, p = c.player;
        H.clean(); H.place(140, 0); G.step(5);
        const err0 = G.errors().length;
        const u = H.spawn(kind, H.fwd(d, h), {});
        const home = u.pos.clone();
        let acquired = false, attacked = false, minAlt = Infinity, n = 0, warned = 0, spawnedKids = 0;
        const kid = () => c.enemies.all().filter(x => x !== u && x.alive && x.tags.has('p4')).length;
        for (; n < maxT * 60; n += 15) {
          G.step(15);
          if (u.target === p || (u.ai.state === 'hover' || u.ai.deployed)) acquired = acquired || u.target === p;
          if (kind === 'gunship') minAlt = Math.min(minAlt, u.pos.y - c.world.groundHeight(u.pos.x, u.pos.z));
          warned = Math.max(warned, c.projectiles.warnings);
          spawnedKids = Math.max(spawnedKids, kid());
          const hits = H.dmg.filter(x => x.tk === 'player' && x.st === 'enemy');
          if (hits.some(x => x.ok === kind)) attacked = true;
          if (['apc', 'beacon', 'dropship'].includes(kind) && spawnedKids > 0 && hits.length) attacked = true;
          if (attacked && (acquired || ['dropship', 'beacon'].includes(kind)) && n > 120) break;
        }
        const moved = H.dist(u.pos, home);
        const kidsAcq = c.enemies.all().some(x => x !== u && x.target === p);
        // kill it cleanly (dying units fall first)
        const kidsBefore = kid();
        c.combat.kill(u, { team: 'player', kind: 'test' });
        let m = 0; while (u.dying && m < 600) { G.step(10); m += 10; }
        G.step(5);
        return { kind, acquired: acquired || kidsAcq, attacked, t: n / 60, minAlt, moved, warned, kids: spawnedKids, kidsBefore,
                 dead: !u.alive, detached: !u.root.parent, dyingDone: !u.dying, errors: G.errors().length - err0,
                 hitKinds: [...new Set(H.dmg.filter(x => x.tk === 'player').map(x => x.ok + ':' + x.sk))] };
      }, [kind, d, h, maxT]);
      g.log('kind', JSON.stringify(r));
      g.assert(r.acquired && r.attacked && r.dead && r.detached && r.dyingDone && r.errors === 0,
        `${kind}: spawns, acquires the player, attacks (${r.hitKinds.join(' ')}) in ${r.t.toFixed(1)} s and dies cleanly`);
      if (kind === 'gunship') g.assert(r.minAlt > 15, `gunship stays airborne (min ${r.minAlt.toFixed(1)} m above ground)`);
      if (kind === 'walker') g.assert(r.moved > 15, `walker walks (${r.moved.toFixed(1)} m)`);
      if (kind === 'artillery') g.assert(r.warned > 0, `artillery shows ground warnings (${r.warned} at once)`);
      if (kind === 'dropship') g.assert(r.kids >= 3, `dropship deploys its group (${r.kids})`);
      if (kind === 'beacon') g.assert(r.kids >= 1, `beacon spawns drones (${r.kids})`);
      if (kind === 'apc') g.assert(r.kids >= 3, `apc deploys 3 drones (${r.kids})`);
    }
    // artillery warning screenshot
    await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c;
      H.clean(); H.place(140, 0); G.step(5);
      H.spawn('artillery', H.fwd(420, 0), { behavior: 'hold' });
      let n = 0; while (c.projectiles.warnings === 0 && n < 1200) { G.step(5); n += 5; }
      G.step(30);
    });
    const pp = await g.eval(() => { const p = window.__p4.c.player; return [p.pos.x, p.pos.y, p.pos.z, p.yaw]; });
    await g.camera([pp[0] + 40 * Math.cos(pp[3]), pp[1] + 45, pp[2] - 40 * Math.sin(pp[3])], [pp[0] - Math.sin(pp[3]) * 10, pp[1], pp[2] - Math.cos(pp[3]) * 10]);
    await shot('artillery-warning', { hud: false });
    await g.freeCam(false);
    // lineup of every kind (scripted, so they pose)
    const line = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(5);
      const list = ['drone', 'tank', 'tank_heavy', 'turret', 'gunship', 'walker', 'artillery', 'apc', 'beacon', 'mech'];
      list.forEach((k, i) => {
        const pos = H.fwd(70, k === 'drone' ? 10 : k === 'gunship' ? 14 : 0, -63 + i * 14);
        const u = H.spawn(k, pos, { behavior: 'scripted' });
        if (k === 'drone' || k === 'gunship') u.pos.y = pos.y;
        u.yaw = p.yaw + Math.PI * 0.85;
      });
      G.step(20);
      const a = H.fwd(-20, 26, 0), b = H.fwd(70, 3, 0);
      return { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z] };
    });
    await g.camera(line.a, line.b, 60);
    await shot('lineup', { hud: false });
    await g.freeCam(false);
  });

  // ---------------------------------------------------------------------------------------------- 6b warning on a slope
  await sec('warning-slope', async () => {
    // the warning drapes over sloped ground: every ring vertex sits just above the terrain (review rev2 #3)
    const slope = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, T = H.T;
      H.clean(); H.place(300, 120); G.step(5);
      // a strike on the player at s 300 / l 120: about 9 m of rise across the 24 m ring (artillery aims at the ground under it)
      const ctr = H.fwd(0, 0);
      c.projectiles.groundWarning(ctr, 12, 3);
      G.step(60);
      const ring = c.scene.children.filter(o => o.name === 'groundWarning' && o.visible !== undefined)
        .find(o => Math.hypot(o.position.x - ctr.x, o.position.z - ctr.z) < 0.01);
      const v = new T.Vector3();
      let lo = Infinity, hi = -Infinity, glo = Infinity, ghi = -Infinity, nv = 0;
      for (const m of ring ? [ring, ring.children[0]] : []) {
        m.updateMatrixWorld(true);
        const a = m.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
          const gh = c.world.groundHeight(v.x, v.z), dy = v.y - gh;
          lo = Math.min(lo, dy); hi = Math.max(hi, dy); glo = Math.min(glo, gh); ghi = Math.max(ghi, gh); nv++;
        }
      }
      const cam = H.fwd(-30, 8, 20), look = p.pos.clone();
      return { found: !!ring, nv, lo: +lo.toFixed(2), hi: +hi.toFixed(2), rise: +(ghi - glo).toFixed(1), cam: [cam.x, cam.y, cam.z], look: [look.x, look.y, look.z] };
    });
    g.log('warning drape', JSON.stringify(slope));
    g.assert(slope.found && slope.nv > 300 && slope.rise > 3 && slope.lo > 0.15 && slope.hi < 1.2,
      `the ground warning drapes over a ${slope.rise} m rise (vertices ${slope.lo}..${slope.hi} m above the ground)`);
    await g.camera(slope.cam, slope.look, 60);
    await shot('artillery-warning-slope', { hud: false });
    await g.freeCam(false);
  });

  // ---------------------------------------------------------------------------------------------- 7 mech duel + leash
  await sec('mech-duel', async () => {
    const duel = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(140, 0); G.step(5);
      const m = H.spawn('mech', H.fwd(120, 0), { name: 'DUELIST', config: { design: 'striker' } });
      const e0 = G.errors().length;
      let n = 0, minD = 1e9;
      for (let k = 0; k < 120; k++) {
        if (!m.alive) break;
        const d = H.dist(p.pos, m.pos); minD = Math.min(minD, d);
        if (!p.hardLock || p.lock !== m) { H.face(m.center()); G.step(1); if (p.lock === m) G.input.press('lock'); }
        G.input.hold('fire', true);
        G.input.move(0, d > 30 ? 1 : 0);
        if (k % 6 === 3 && d > 45) G.input.press('boost');
        if (k % 14 === 7) G.input.press('missile');
        if (k === 70 && m.ai.used.blade === 0) { const q = m.pos.clone(); G.teleport({ x: q.x + 18, z: q.z + 18 }); }
        G.step(30); n += 30;
        if (m.ap < m.apMax * 0.35) m.ap = m.apMax * 0.9;   // keep the duel going for the full minute
      }
      G.input.clear();
      const used = { ...m.ai.used };
      const errs = G.errors().length - e0;
      const hitKinds = [...new Set(H.dmg.filter(x => x.tk === 'player' && x.ok === 'mech').map(x => x.sk))];
      return { t: n / 60, used, errs, minD, alive: m.alive, hitKinds };
    });
    const b = ['rifle', 'missiles', 'blade', 'dodge'].filter(k => duel.used[k] > 0);
    g.log('duel', JSON.stringify(duel));
    g.assert(duel.t >= 60 && duel.errs === 0, `60 s god-mode mech duel without errors (${duel.t.toFixed(0)} s)`);
    g.assert(b.length >= 4, `mech AI used rifle, missiles, blade and dodge (${JSON.stringify(duel.used)}; hit the player with ${duel.hitKinds.join(', ')})`);
    await shot('mech-duel');

    const leash = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(140, 0); G.step(5);
      const m = H.spawn('mech', H.fwd(170, 0), { leash: 60, behavior: 'guard', config: { design: 'bastion' } });
      let maxD = 0, returned = false;
      for (let i = 0; i < 40; i++) { G.step(30); maxD = Math.max(maxD, H.dist(m.pos, m.home)); if (m.ai.returning) returned = true; }
      return { maxD, returned };
    });
    g.assert(leash.returned && leash.maxD < 60 + 35, `mech leash: disengages past 60 m and walks back (max ${leash.maxD.toFixed(1)} m from home)`);
  });

  // ---------------------------------------------------------------------------------------------- 7b spawn behaviours
  await sec('behaviours', async () => {
    const b = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player, T = H.T;
      // patrol: no target in range → loops through its points
      H.clean(); H.place(60, 0); G.step(5);
      const A = H.at(700, -60), B = H.at(700, 60);
      const t = H.spawn('tank', A.clone(), { behavior: 'patrol', patrol: [A, B], aggroRange: 200 });
      let minB = 1e9, backToA = 1e9, seenB = false;
      for (let i = 0; i < 60; i++) { G.step(30); const dB = H.dist(t.pos, B); minB = Math.min(minB, dB); if (dB < 9) seenB = true; if (seenB) backToA = Math.min(backToA, H.dist(t.pos, A)); }
      const patrol = { minB, backToA, target: t.target ? t.target.kind : null };
      // escort: an ally drone with nothing to fight keeps near the player
      H.clean(); H.place(60, 0); G.step(5);
      const d = H.spawn('drone', H.fwd(160, 20, 60), { team: 'ally', behavior: 'escort' });
      G.step(20 * 60);
      const escort = H.dist(d.pos, p.pos);
      // guard: chases inside its 200 m default leash, then walks home
      H.clean(); H.place(60, 0); G.step(5);
      const g0 = H.fwd(420, 0);
      const gt = H.spawn('tank', g0, { behavior: 'guard' });
      let gmax = 0; for (let i = 0; i < 80; i++) { G.step(30); gmax = Math.max(gmax, H.dist(gt.pos, gt.home)); }
      // sniper tank keeps its distance; hold never moves
      H.clean(); H.place(60, 0); G.step(5);
      const sn = H.spawn('tank', H.fwd(120, 0, 30), { behavior: 'sniper' });
      const hd = H.spawn('tank', H.fwd(160, 0, -40), { behavior: 'hold' });
      const h0 = hd.pos.clone();
      G.step(20 * 60);
      return { patrol, escort, gmax, sniper: H.dist(sn.pos, p.pos), hold: H.dist(hd.pos, h0) };
    });
    g.log('behaviours', JSON.stringify(b));
    g.assert(b.patrol.minB < 9 && b.patrol.backToA < 12, `patrol loops between its points (to B ${b.patrol.minB.toFixed(1)} m, back to A ${b.patrol.backToA.toFixed(1)} m)`);
    g.assert(b.escort < 60, `escort ally stays near the player (${b.escort.toFixed(1)} m)`);
    g.assert(b.gmax < 235, `guard chases only inside its leash (max ${b.gmax.toFixed(1)} m from home)`);
    g.assert(b.sniper > 190 && b.hold < 1, `sniper keeps range (${b.sniper.toFixed(0)} m), hold stays put (${b.hold.toFixed(2)} m)`);
  });

  // ---------------------------------------------------------------------------------------------- 8 allies
  await sec('allies', async () => {
    const ally = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(80, -120); G.step(5);
      const shots0 = c.combat.stats.shots;
      const base = H.at(380, 140);
      const tanks = [H.spawn('tank', base.clone().add(new H.T.Vector3(-15, 0, 0)), { team: 'ally' }),
                     H.spawn('tank', base.clone().add(new H.T.Vector3(15, 0, 0)), { team: 'ally' })];
      const drones = [0, 1, 2].map(i => H.spawn('drone', base.clone().add(new H.T.Vector3(-60 + i * 40, 20, -90)), {}));
      let n = 0;
      while (drones.some(d => d.alive) && n < 120 * 60) { G.step(30); n += 30; }
      const byAlly = H.dmg.filter(x => x.tk === 'drone' && x.st === 'ally').length;
      return { t: n / 60, dead: drones.filter(d => !d.alive).length, shots: c.combat.stats.shots - shots0, byAlly,
               tanksAlive: tanks.filter(t => t.alive).length, targets: drones.map(d => d.target?.kind ?? null) };
    });
    g.assert(ally.dead === 3 && ally.shots === 0 && ally.byAlly > 0, `ally tanks kill 3 enemy drones without the player firing (${ally.t.toFixed(1)} s, ${ally.byAlly} ally hits)`);
  });

  // ---------------------------------------------------------------------------------------------- 9 determinism
  await sec('determinism', async () => {
    const run = async () => {
      await g.eval(async () => {
        const H = window.__p4, G = H.G, c = H.c;
        H.clean();
        await G.restart();
        G.step(1);
        H.place(150, 0);
        H.spawn('drone', H.fwd(120, 20, -30)); H.spawn('tank', H.fwd(180, 0, 40)); H.spawn('mech', H.fwd(200, 0, 0));
        H.spawn('gunship', H.fwd(220, 35, -60), { config: { haul: 'mg_r12' } });
      });
      await g.input({ clear: true, move: [0.3, 1], hold: { fire: true } });
      await g.step(300);
      await g.input({ press: ['missile'] });
      await g.step(300);
      await g.input({ clear: true });
      const s = await g.state();
      delete s.frame; delete s.perf; delete s.world;
      return s;
    };
    const a = await run(), b = await run();
    const diff = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    g.log('determinism units', a.units.map(u => `${u.kind}:${u.ap.toFixed(0)}`).join(' '), 'player', a.player.ap.toFixed(0));
    g.assert(a.units.length >= 4 && diff.length === 0, `two combat replays give identical snapshots (differs: ${diff.join(', ') || 'nothing'})`);
  });

  // ---------------------------------------------------------------------------------------------- 10 load test
  await sec('load', async () => {
    const load = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(160, 0); G.step(5);
      const mix = [['drone', 14], ['tank', 8], ['tank_heavy', 4], ['turret', 4], ['gunship', 3], ['walker', 2], ['artillery', 2], ['apc', 2], ['mech', 1]];
      let i = 0;
      for (const [k, n] of mix) for (let j = 0; j < n; j++, i++) {
        const a = i / 40 * Math.PI * 2, r = 150 + (i % 5) * 35;
        const pos = new H.T.Vector3(p.pos.x + Math.cos(a) * r, 0, p.pos.z + Math.sin(a) * r);
        pos.y = c.world.groundHeight(pos.x, pos.z) + (k === 'drone' ? 20 : k === 'gunship' ? 35 : 0);
        H.spawn(k, pos, {});
      }
      G.step(120);
      // top up to 400 live projectiles high above the field (they fly level and never hit anything)
      const fill = () => {
        let k = 0;
        while (c.projectiles.count < 400 && k < 600) {
          const a = (k * 2.399) % (Math.PI * 2), r = 20 + (k % 37) * 5;
          const pos = new H.T.Vector3(p.pos.x + Math.cos(a) * r, p.pos.y + 90 + (k % 7) * 4, p.pos.z + Math.sin(a) * r);
          const kind = ['plasma', 'ebullet', 'bullet', 'shell'][k % 4];
          c.projectiles.fire({ pos, vel: new H.T.Vector3(Math.cos(a + 1.3) * 30, 0, Math.sin(a + 1.3) * 30), team: k % 2 ? 'enemy' : 'player', kind, dmg: 1, imp: 0, life: 30 });
          k++;
        }
      };
      fill();
      // per-system timing for the P4 systems
      const names = ['player', 'enemies', 'projectiles', 'haul', 'weapons'], acc = Object.fromEntries(names.map(n => [n, 0]));
      const wrapped = [];
      for (const ph of Object.values(c.systems)) for (const s of ph) if (names.includes(s.name)) {
        const f = s.update; wrapped.push([s, f]);
        s.update = (dt, x) => { const t0 = performance.now(); f(dt, x); acc[s.name] += performance.now() - t0; };
      }
      const sims = [];
      let units = 0, proj = 0;
      for (let f = 0; f < 60; f++) { fill(); G.step(1); sims.push(c.perf.simMs); units += c.enemies.count({}) + c.enemies.count({ team: 'ally' }); proj += c.projectiles.count; }
      for (const [s, f] of wrapped) s.update = f;
      sims.sort((a, b) => a - b);
      const mean = sims.reduce((a, b) => a + b) / sims.length;
      return { mean, median: sims[30], p90: sims[54], max: sims[59], units: units / 60, proj: proj / 60, p4: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v / 60])) };
    });
    g.log('load', JSON.stringify(load));
    const p4ms = Object.values(load.p4).reduce((a, b) => a + b, 0);
    g.assert(load.units >= 40 && load.proj >= 395, `load test populated (${load.units.toFixed(0)} units, ${load.proj.toFixed(0)} projectiles)`);
    g.assert(load.mean <= 8, `40 units + 400 projectiles: perf().simMs mean ${load.mean.toFixed(2)} ms (median ${load.median.toFixed(2)}, p90 ${load.p90.toFixed(2)}; P4 systems ${p4ms.toFixed(2)} ms)`);
    await shot('load-test');
  });

  // ---------------------------------------------------------------------------------------------- 11 firefight shots
  await sec('firefight', async () => {
    await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(170, 0); G.step(5);
      H.spawn('tank', H.fwd(150, 0, -40)); H.spawn('tank', H.fwd(170, 0, 50));
      for (let i = 0; i < 3; i++) H.spawn('drone', H.fwd(110 + i * 15, 22, -30 + i * 30));
      G.step(60);
      const t = c.enemies.all().find(u => u.kind === 'tank' && u.alive);
      H.face(t.center()); G.step(2); G.input.press('lock'); G.step(1);
      G.input.hold('fire', true); G.step(150);
      G.input.press('missile'); G.step(24);
    });
    await shot('firefight');
    await g.eval(() => window.__p4.G.input.clear());
    // a blade lunge seen from the side, mid-swing
    const side = await g.eval(() => {
      const H = window.__p4, G = H.G, c = H.c, p = c.player;
      H.clean(); H.place(170, 0); G.step(5);
      const t = H.spawn('tank', H.fwd(55, 0), { behavior: 'hold' });
      G.step(2); H.face(t.center()); G.step(3);
      G.input.press('blade');
      let n = 0; while (!p.bladeT && n < 60) { G.step(1); n++; }
      G.step(4);
      const m = p.pos.clone().lerp(t.pos, 0.5);
      return { cam: [m.x + Math.cos(p.yaw) * 26, m.y + 9, m.z - Math.sin(p.yaw) * 26], look: [m.x, m.y + 4, m.z] };
    });
    await g.camera(side.cam, side.look, 55);
    await shot('blade-lunge-side', { hud: false });
    await g.freeCam(false);
  });

  // ---------------------------------------------------------------------------------------------- wrap up
  await g.eval(() => window.__p4.clean());
  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).slice(0, 5).join('; ')})`);
  g.log(`total ${((Date.now() - T0) / 1000).toFixed(0)} s`);
}
