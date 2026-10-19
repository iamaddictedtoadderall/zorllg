// tools/scenarios/eng-l02.mjs (ENGINE, addendum 02 E13): acceptance for the Level 2 engine package, on the test level
// and inline LevelDefs only (never levels/level02.js). Time is advanced with step(); rendering happens only for shots.
//
//   node tools/playtest.mjs --scenario eng-l02 --port 8705 --out /tmp/campaign-playtest/L2-eng --timeout 2400
//   node tools/playtest.mjs --scenario eng-l02 --port 8706 --touch --size 844x390 --out /tmp/campaign-playtest/L2-eng-touch
//   ENG_SECTIONS=sync,hold node tools/playtest.mjs --scenario eng-l02 ...   (only those sections)
//
// Sections: 1 sync · 2 fill · 3 hold · 4 drive · 5 inputs (touch run: touch) · 6 parts · 7 glint · 8 hud · comms · 9 flow ·
// 10 bench (9 and 10 run together: the Bench follows the inline campaign level). A stub CampaignData leg ('eng2') is
// served by routing levels/campaign.js to a fixture that extends the real data.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : '/tmp/campaign-playtest/eng-l02'; })();

// the stub leg (addendum 02 E13 item 9/10): rigs lost, story flag, a Made fragment, log variants, debrief, gift, forced
// fit, terms and Calls. Lines are short so the Bench script runs quickly.
const FIXTURE = `
import R from './campaign.js?real';
const D = { ...R };
const fr = Array.isArray(R.fragments) ? R.fragments.slice() : [];
if (!fr.some(f => f.id === 'M1')) fr.push({ id: 'M1', gloss: 'TEST / MADE FRAGMENT', made: 'eng2' });
D.fragments = fr;
D.mothRank = R.mothRank || ['F01', 'F08', 'F06', 'F11', 'F09', 'F04', 'F03', 'F05', 'M1', 'F10', 'F02', 'F12', 'F07'];
D.calls = R.calls || { kite: { name: 'Spotter Kite', who: 'Kit', cost: 1, uses: 3, desc: 'Test call.' },
                       mortar: { name: 'Mortar Rig', who: 'Pruitts', cost: 2, uses: 3, desc: 'Test call.' },
                       trike: { name: 'Resupply Trike', who: 'Thimble', cost: 2, uses: 2, desc: 'Test call.' } };
D.legs = { ...(R.legs || {}), eng2: {
  day: 4, draw: 3, edgeLat: 42, debriefTitle: 'ENGINE TEST · LEG 2',
  log: { by: 'mercy', variants: { saved: 'Variant line: saved.', lost: 'Variant line: lost.' }, default: 'Default line.' },
  result: { rigsLostFlag: 'cv:lost', storyFlag: 'campaign:story' },
  made: ['M1'],
  debrief: { waterLabel: 'Water recovered', rigsLost: true },
  gifts: [{ part: 'skate_jets', unlessOwned: true, line: 'gift' }],
  forced: { part: 'skate_jets', fragments: ['F01'], mustFit: true, noGive: true, reason: 'Fit the Skate-Jets first. The canyon floods.', noGiveReason: "Not these. You'll need them." },
  terms: {
    hardpoints: { id: 'eng_hardpoints', term: 'Booster and legs', text: 'Two more hardpoints now take hauled parts: the booster and the legs.' },
    overwrite: { id: 'eng_overwrite', term: 'Overwriting', text: 'Fitting a hungry part clears one stored fragment for good.' },
    made: { id: 'eng_made', term: 'New fragments', text: 'Each new fragment adds a segment to your Sync bar.' },
    calls: { id: 'eng_calls', term: 'Calls', text: 'Help from the Wake next level, paid for in water now.' } },
  calls: true,
  bench: {
    arrive: [{ who: 'OMA', text: 'Test arrive.' }], gift: [{ who: 'OMA', text: 'Test gift.' }],
    hungry: [{ who: 'MOTH', text: 'Test hungry.' }], locked: [{ who: 'MOTH', text: 'Test locked.' }],
    overwrite: [{ who: 'MOTH', text: 'Test overwrite.' }], made: [{ who: 'MOTH', text: 'Test made.' }],
    calls: [{ who: 'OMA', text: 'Test calls.' }], mustFit: [{ who: 'OMA', text: 'Test must fit.' }],
    'fit:sail_rig': [{ who: 'OMA', text: 'Test sail.' }], walkOn: [{ who: 'OMA', text: 'Test walk on.' }] },
} };
export default D;
`;

export default async function (g) {
  const T0 = Date.now();
  const ONLY = typeof process !== 'undefined' && process.env.ENG_SECTIONS ? process.env.ENG_SECTIONS.split(',') : null;
  const TOUCH = !!g.args.touch;
  const sec = async (name, fn) => {
    if (ONLY && !ONLY.includes(name)) return;
    if (TOUCH && name !== 'touch') return;
    if (!TOUCH && name === 'touch') return;
    const t = Date.now();
    try { await fn(); }
    catch (e) { g.assert(false, `${name}: threw ${e.message}`); g.log(String(e.stack || e)); }
    g.log(`section ${name}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  };
  const shot = async (name, o) => {
    try { return await g.shot(name, o); } catch (e) { g.log(`shot ${name} failed: ${e.message.split('\n')[0]}`); }
    try {
      const url = await g.eval(async () => { const G = window.__game; G.render?.(); return G.ctx.renderer.domElement.toDataURL('image/png'); });
      const file = join(OUT_DIR, `${name}.png`);
      writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      g.log(`shot ${name}: canvas capture (no HUD) ${file}`);
      return file;
    } catch (e) { g.log(`shot ${name} canvas capture failed: ${e.message}`); }
    return null;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // the stub CampaignData (before anything imports levels/campaign.js)
  await g.page.route('**/levels/campaign.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FIXTURE }));

  // ---------------------------------------------------------------------------------------------- setup
  const setup = async () => {
    await g.startLevel('test', 'cp_start');
    await g.eval(async () => {
      const G = window.__game, c = G.ctx, T = c.THREE;
      const LO = await import(new URL('src/combat/loadout.js', location.href).href);
      const WP = await import(new URL('src/combat/weapons.js', location.href).href);
      const H = window.__e2 = {
        G, c, T, LO, WP, ev: [],
        clean(o = {}) {
          for (const u of c.enemies.all().slice()) c.enemies.despawn(u);
          c.projectiles.clear(); c.input.clearInjected();
          c.haul?.clear?.(); WP.clearShared?.(c);
          c.sync?.cancel?.(); c.sync?.lock?.('sight', 'drive', 'hold'); c.sync?.enable?.(false); c.sync?.setFill?.(0);
          const p = c.player;
          p.abilities = { move: 1, jump: true, hover: true, boost: true, fire: true, lock: true, blade: true, missile: true, kit: true, interact: true, tear: true };
          p.invuln = false; p.invulnT = 0; p.frozen = false; p.lunge = null; p.pull = null; p.drive = null; p.autopilot = null;
          const lo = o.loadout || { ...LO.DEFAULT_LOADOUT };
          if (JSON.stringify(p.loadout) !== JSON.stringify(lo)) p.setLoadout(lo);
          p.refill(); p.lock = null; p.hardLock = false; p.stagT = 0; p.imp = 0; p.vel.set(0, 0, 0); p.repairT = 0;
          c.timeScale = 1; c.combat.god = o.god ?? true;
          H.ev.length = 0;
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
        spawn(kind, pos, o = {}) { return c.enemies.spawn(kind, pos, { ...o, tags: ['e2', ...(o.tags || [])] }); },
        hs() { const v = c.player.vel; return Math.hypot(v.x, v.z); },
        dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
        /** a hostile shot from `from` straight at the player's centre at `speed` */
        shoot(from, speed = 300) {
          const pc = c.player.center(new T.Vector3());
          const v = pc.clone().sub(from).normalize().multiplyScalar(speed);
          return c.projectiles.fire({ pos: from.clone(), vel: v, dmg: 50, imp: 10, team: 'enemy', kind: 'ebullet', life: 3 });
        },
        count(t) { return H.ev.filter(e => e.t === t).length; },
      };
      for (const t of ['sync:move', 'sync:end', 'sync:hold', 'sync:filled', 'player:perfectDodge', 'player:boost', 'comms:line', 'target:killed', 'player:died',
                       'claw:grab', 'claw:throw', 'claw:impact', 'player:sail'])
        c.events.on(t, (e) => H.ev.push({ t, e, time: c.clock.time }));
    });
  };

  if (!TOUCH) await setup();

  // ---------------------------------------------------------------------------------------------- 1 sync and Second Sight
  await sec('sync', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, out = {};
      H.clean(); H.place(160, 0); G.step(5);
      out.exists = !!S && typeof S.unlock === 'function';
      out.disabled0 = S.enabled === false && S.capacity === 12;
      S.unlock('sight');
      out.enabled = S.enabled && S.unlocked.has('sight');
      S.setFill(2);
      out.use2 = S.use('sight');
      S.setFill(3);
      out.use3 = S.use('sight');
      out.scale = c.timeScale; out.fillAfter = S.fill;
      // a hostile shot in flight draws a path; a target winding up gets a red glow
      const d = H.spawn('drone', H.fwd(90, 20), { behavior: 'scripted' });
      G.step(2);
      H.shoot(H.fwd(120, 15), 80);
      d.windup = 2;
      G.step(2);
      out.paths = S.paths; out.flashes = S.flashes;
      out.sightClass = document.getElementById('hud').classList.contains('sight');
      d.windup = 0; G.step(2);
      out.flashesOff = S.flashes;
      // 6 sim seconds at 0.7: 6 / (0.7 / 60) ≈ 514 ticks
      let ticks = 6;
      while (S.active && ticks < 700) { G.step(1); ticks++; }
      out.ticks = ticks; out.simT = ticks * 0.7 / 60;
      out.scaleAfter = c.timeScale; out.pathsAfter = S.paths; out.flashesAfter = S.flashes;
      out.events = { move: H.count('sync:move'), end: H.count('sync:end') };
      return out;
    });
    g.log('sync', r);
    g.assert(r.exists && r.disabled0, 'ctx.sync exists, disabled by default, capacity 12 without campaign state');
    g.assert(r.enabled, "unlock('sight') enables Sync");
    g.assert(r.use2 === false && r.use3 === true && r.fillAfter === 0, `use('sight') fails at 2 and succeeds at 3, spending 3 (fill ${r.fillAfter})`);
    g.assert(r.scale === 0.7 && near(r.simT, 6, 0.1) && r.scaleAfter === 1, `Second Sight: timeScale 0.7 for ${r.simT.toFixed(2)} sim s (${r.ticks} ticks), then 1`);
    g.assert(r.paths >= 1 && r.pathsAfter === 0, `path lines while a hostile shot flies (${r.paths}), cleared after`);
    g.assert(r.flashes >= 1 && r.flashesOff === 0, `a target with windup > 0 gets a glow (${r.flashes}), removed at windup 0 (${r.flashesOff})`);
    g.assert(r.sightClass, '#hud gets the class sight during Second Sight');
    g.assert(r.events.move === 1 && r.events.end === 1, `sync:move and sync:end (${JSON.stringify(r.events)})`);
  });

  // ---------------------------------------------------------------------------------------------- 2 filling
  await sec('fill', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, out = {};
      H.clean({ loadout: { ...H.LO.DEFAULT_LOADOUT } }); H.place(170, 0); G.step(5);
      S.unlock('sight'); S.setFill(0);
      const t = H.spawn('tank', H.fwd(60), { behavior: 'hold', ap: 1e6 });
      G.step(2);
      c.combat.damage(t, 1500, 0, { team: 'player', owner: c.player, kind: 'rifle' });
      out.dmg = S.fill;
      // a TEAR: a staggered haul drone within 30 m, BLADE held 0.4 s, the rip
      S.setFill(0);
      const d = H.spawn('drone', H.fwd(14, 6), { behavior: 'scripted', config: { haul: 'shotgun_s8' } });
      G.step(2); H.face(d.center());
      d.stagT = 5;
      G.step(2);
      out.cand = c.haul.candidate === d;
      G.input.hold('blade', true);
      for (let i = 0; i < 120 && !H.count('target:killed'); i++) { G.step(1); d.stagT = Math.max(d.stagT, 2); }
      G.input.hold('blade', false);
      out.tears = c.haul.tears; out.tear = S.fill;
      G.step(80);
      // a scripted perfect dodge: an input quick boost while a shot is 0.1 s out
      S.setFill(0); c.player.vel.set(0, 0, 0); G.step(30);
      c.player.en = c.player.enMax;
      H.shoot(H.fwd(30, 6), 300);
      G.input.press('boost'); G.step(1);
      out.pd = H.count('player:perfectDodge'); out.dodge = S.fill;
      G.step(30);
      // never above capacity
      S.setFill(S.capacity - 0.5); S.add(5);
      out.cap = S.fill === S.capacity;
      out.filled = H.count('sync:filled');
      return out;
    });
    g.log('fill', r);
    g.assert(near(r.dmg, 1, 1e-6), `1,500 player damage → +1 (fill ${r.dmg})`);
    g.assert(r.cand && r.tears === 1 && near(r.tear, 2, 1e-6), `a TEAR → +2 (tears ${r.tears}, fill ${r.tear})`);
    g.assert(r.pd === 1 && near(r.dodge, 1, 1e-6), `a perfect dodge → player:perfectDodge and +1 (events ${r.pd}, fill ${r.dodge})`);
    g.assert(r.cap, 'never above capacity');
    g.assert(r.filled >= 3, `sync:filled on whole segments (${r.filled})`);
  });

  // ---------------------------------------------------------------------------------------------- 3 Hold
  await sec('hold', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, p = c.player, out = {};
      H.clean({ god: false }); H.place(180, 0); G.step(5);
      S.unlock('hold'); S.setFill(6);
      out.ready = S.holdReady;
      p.ap = 500;
      const lines0 = H.count('comms:line');
      const info = c.combat.damage(p, 5000, 3000, { team: 'enemy', kind: 'shell' });
      out.ap = p.ap; out.invulnT = p.invulnT; out.fill = S.fill; out.held = !!info.held; out.alive = p.alive; out.stag = p.stagT;
      out.holdEv = H.count('sync:hold');
      out.hud = !!document.getElementById('holdtx')?.classList.contains('on');
      // blocked while invulnerable
      const b = c.combat.damage(p, 5000, 0, { team: 'enemy', kind: 'shell' });
      out.blocked = !!b.blocked && p.ap === 1;
      G.step(150);
      out.invulnEnd = p.invulnT;
      out.lines = H.count('comms:line') - lines0;
      // with fill 5 the player dies
      p.ap = 500; S.setFill(5);
      out.ready5 = S.holdReady;
      c.combat.damage(p, 5000, 0, { team: 'enemy', kind: 'shell' });
      out.dead = !p.alive;
      return out;
    });
    g.log('hold', r);
    g.assert(r.ready && r.ap === 1 && r.alive && r.held, `Hold: a lethal hit leaves AP 1 (ap ${r.ap}, held ${r.held})`);
    g.assert(r.invulnT === 2 && r.fill === 0 && r.holdEv === 1 && r.stag === 0, `Hold: invulnT 2, fill 0, sync:hold emitted, no stagger (${r.invulnT}, ${r.fill}, ${r.holdEv})`);
    g.assert(r.blocked && r.invulnEnd === 0, 'invulnT blocks damage like invuln, then runs out');
    g.assert(r.hud, 'HUD: the HOLD text shows');
    g.assert(r.lines === 0, `Hold says nothing on comms (${r.lines} lines)`);
    g.assert(!r.ready5 && r.dead, 'with fill 5 the lethal hit kills');
    await g.eval(() => window.__game.restart());
    await g.step(5);
  });

  // ---------------------------------------------------------------------------------------------- 4 Moth Drives
  await sec('drive', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, p = c.player, out = {};
      H.clean(); H.place(200, 0); G.step(5);
      S.unlock('drive'); S.setFill(0);
      const d = H.spawn('drone', H.fwd(140, 18), { behavior: 'scripted', name: 'TARGET' });
      d.pos.y = c.world.groundHeight(d.pos.x, d.pos.z) + 18;
      G.step(2);
      out.free = S.free('drive');
      out.driveSet = !!p.drive;
      const dist = [];
      let t = 0, shots = 0;
      const t0 = c.clock.time;
      while (S.active && t < 700) {
        G.step(1); t++;
        if (t % 50 === 0) {   // a shot from the drone at the player, about once a second
          const from = d.center(new H.T.Vector3());
          H.shoot(from, 260); shots++;
        }
        if (t > 120 && t % 10 === 0) dist.push(H.dist(p.pos, d.pos));
      }
      out.dur = c.clock.time - t0; out.ended = !S.active && !p.drive;
      out.pref = p.weapons.R?.part?.stats?.pref;
      out.within = dist.filter(x => Math.abs(x - 140) <= 15).length / Math.max(1, dist.length);
      out.minD = Math.min(...dist); out.maxD = Math.max(...dist);
      out.dodges = p.driveDodges; out.fill = S.fill; out.shots = shots;
      out.pd = H.count('player:perfectDodge');
      // on a raised platform (a 40 × 40 m deck, 12 m up) the frame never leaves it
      H.clean(); H.place(300, 0); G.step(3);
      S.unlock('drive');
      const pc = p.pos.clone(), gy = c.world.groundHeight(pc.x, pc.z);
      const deck = c.collision.box(pc.x, pc.z, 40, 40, gy + 12, gy - 5, { surface: 'metal', tag: 'e2deck' });
      G.teleport([pc.x, gy + 12.5, pc.z]); p.vel.set(0, 0, 0); G.step(30);
      out.onDeck0 = p.onGround && Math.abs(p.pos.y - (gy + 12)) < 0.6;
      const d2 = H.spawn('drone', H.fwd(160, 20), { behavior: 'scripted' });
      d2.pos.y = c.world.groundHeight(d2.pos.x, d2.pos.z) + 20;
      S.free('drive');
      let off = 0, n = 0, minY = Infinity;
      for (let i = 0; i < 520 && S.active; i++) {
        G.step(1); n++;
        if (i % 45 === 0) H.shoot(d2.center(new H.T.Vector3()), 260);
        minY = Math.min(minY, p.pos.y);
        if (Math.abs(p.pos.x - pc.x) > 20 || Math.abs(p.pos.z - pc.z) > 20) off++;
      }
      out.deck = { off, n, minY: minY - (gy + 12), moved: H.dist(p.pos, pc), dodges: p.driveDodges };
      S.cancel();
      c.collision.remove(deck);
      H.clean();
      return out;
    });
    g.log('drive', r);
    g.assert(r.free && r.driveSet, 'Moth Drives: free(drive) sets player.drive');
    g.assert(near(r.dur, 8, 0.1) && r.ended, `Moth Drives lasts 8 s (${r.dur.toFixed(2)}) then ends`);
    g.assert(r.pref === 140 && r.within >= 0.85, `keeps within 15 m of pref 140 around the drone (${(r.within * 100).toFixed(0)} % of samples; ${r.minD.toFixed(1)}–${r.maxD.toFixed(1)} m)`);
    g.assert(r.dodges > 0 && r.fill === 0 && r.pd === 0, `auto-dodges happen (${r.dodges}) and add no Sync (fill ${r.fill}, perfect dodges ${r.pd})`);
    g.assert(r.onDeck0 && r.deck.off === 0 && r.deck.minY > -0.6, `on a raised deck the frame never leaves it (${JSON.stringify(r.deck)})`);
  });

  // ---------------------------------------------------------------------------------------------- 5 inputs
  await sec('inputs', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, out = {};
      H.clean(); H.place(210, 0); G.step(5);
      out.binds = { sight: c.input.bindings.sight, drive: c.input.bindings.drive, act: [c.input && 'sight', 'drive'] };
      // locked: the press does nothing
      S.enable(true); S.setFill(10);
      G.input.press('sight'); G.step(1);
      out.lockedIgnored = !S.active;
      S.unlock('sight', 'drive');
      G.input.press('sight'); G.step(1);
      out.sight = S.active?.move === 'sight';
      S.cancel(); G.step(1);
      G.input.press('drive'); G.step(1);
      out.drive = S.active?.move === 'drive' && !!c.player.drive;
      G.step(10);
      G.input.press('drive'); G.step(1);
      out.cancel = !S.active && !c.player.drive;
      H.clean();
      return out;
    });
    g.log('inputs', r);
    g.assert(r.binds.sight?.[0] === 'KeyC' && r.binds.drive?.[0] === 'KeyV', 'bindings: sight C, drive V');
    g.assert(r.lockedIgnored, 'a locked move ignores its input');
    g.assert(r.sight && r.drive && r.cancel, `inject sight → Second Sight; drive → Moth Drives; drive again → cancel (${JSON.stringify(r)})`);
  });

  // ---------------------------------------------------------------------------------------------- 5t touch buttons (touch run)
  await sec('touch', async () => {
    await setup();
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, out = {};
      H.clean(); H.place(160, 0); G.step(5);
      const vis = (id) => { const b = document.getElementById(id); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; };
      c.hud.setPanels({ sync: true });
      G.step(2);
      out.before = { sight: vis('tSight'), drive: vis('tDrive') };
      S.unlock('sight'); S.setFill(1); G.step(2);
      out.sightOnly = { sight: vis('tSight'), drive: vis('tDrive'), dim: document.getElementById('tSight')?.classList.contains('cool') };
      S.unlock('drive'); S.setFill(5); G.step(2);
      out.both = { sight: vis('tSight'), drive: vis('tDrive'), dim: document.getElementById('tSight')?.classList.contains('cool') };
      const r1 = document.getElementById('tSight').getBoundingClientRect(), r2 = document.getElementById('tDrive').getBoundingClientRect();
      const rb = document.getElementById('tBoost').getBoundingClientRect();
      out.layout = { sightAboveBoost: r1.bottom <= rb.top + 1, driveAboveBoost: r2.bottom <= rb.top + 1, onScreen: r1.right <= innerWidth && r1.top >= 0 && r2.top >= 0 };
      // overlap with the other buttons
      const rects = [...document.querySelectorAll('#touch .tb')].filter(b => !b.hidden && b.id !== 'tSight' && b.id !== 'tDrive').map(b => b.getBoundingClientRect());
      const ov = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
      out.overlap = rects.some(x => ov(x, r1) || ov(x, r2));
      return out;
    });
    g.log('touch', r);
    g.assert(!r.before.sight && !r.before.drive, 'touch: no SIGHT/DRIVE buttons while Sync is off');
    g.assert(r.sightOnly.sight && !r.sightOnly.drive && r.sightOnly.dim, 'touch: SIGHT appears when unlocked (dimmed while unaffordable), DRIVE stays hidden');
    g.assert(r.both.sight && r.both.drive && !r.both.dim, 'touch: both buttons once both are unlocked and affordable');
    g.assert(r.layout.sightAboveBoost && r.layout.driveAboveBoost && r.layout.onScreen && !r.overlap, `touch: buttons above BOOST, on screen, no overlap (${JSON.stringify(r.layout)})`);
    // inject through the button (input's delegated .tb handler)
    const tap = await g.eval(async () => {
      const G = window.__game, c = G.ctx, S = c.sync;
      const b = document.getElementById('tSight'), rr = b.getBoundingClientRect();
      const ev = (type) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: rr.x + 10, clientY: rr.y + 10 }));
      ev('pointerdown'); G.step(1); ev('pointerup'); G.step(1);
      return { active: S.active?.move ?? null };
    });
    g.assert(tap.active === 'sight', `touch: tapping SIGHT starts Second Sight (${tap.active})`);
    await g.step(30);
    await shot('touch-sync-hud');
  });

  // ---------------------------------------------------------------------------------------------- 6 parts and weapons
  await sec('parts', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, LO = H.LO, p = c.player, out = {};
      const lo = LO.campaignLoadout({ B: 'sail_rig', G: 'skate_jets' });
      out.lo = { B: lo.B, G: lo.G, C: lo.C };
      out.valid = LO.validate(lo).ok;
      out.hp = LO.HARDPOINTS?.join(',');
      out.stock = { B: LO.CAMPAIGN_STOCK.B, G: LO.CAMPAIGN_STOCK.G, C: LO.CAMPAIGN_STOCK.C };
      // ground speed, stock vs Skate-Jets (a straight run along the route)
      const speed = (loadout) => {
        H.clean({ loadout }); H.place(120, 0); G.step(20);
        G.input.move(0, 1); G.step(200);
        let s = 0; for (let i = 0; i < 40; i++) { G.step(1); s += H.hs(); }
        G.input.clear(); G.step(60);
        return s / 40;
      };
      out.v0 = speed(LO.campaignLoadout({}));
      out.v1 = speed(LO.campaignLoadout({ G: 'skate_jets' }));
      out.mods = p.mods;
      // SAIL: 2 s straight at speed, then a free quick boost; qbCooldown 1.0 s
      H.clean({ loadout: LO.campaignLoadout({ B: 'sail_rig' }) }); H.place(120, 0); G.step(20);
      G.input.move(0, 1);
      let sailAt = -1;
      for (let i = 0; i < 300; i++) { G.step(1); if (p.sail && sailAt < 0) sailAt = i; }
      out.sailAt = sailAt / 60; out.sail = p.sail;
      out.chip = !!document.querySelector('#enLbl .sail') && !document.querySelector('#enLbl .sail').hidden;
      p.en = 600; p.enUseT = 0;
      const boosts0 = H.ev.filter(e => e.t === 'player:boost' && !e.e?.auto).length;
      const en0 = p.en;
      G.input.press('boost'); G.step(1);
      out.qbFreeCost = en0 - p.en;
      G.step(20);
      G.input.press('boost'); G.step(1);   // 0.35 s later: refused (qbCooldown 1.0)
      out.boostsQuick = H.ev.filter(e => e.t === 'player:boost' && !e.e?.auto).length - boosts0;
      G.step(50);
      G.input.press('boost'); G.step(1);   // 1.2 s after the first: allowed
      out.boostsLater = H.ev.filter(e => e.t === 'player:boost' && !e.e?.auto).length - boosts0;
      G.input.clear(); G.step(60);
      // Rivet Driver slows a drone
      H.clean({ loadout: LO.campaignLoadout({ R: 'rivet_driver' }) }); H.place(140, 0); G.step(5);
      const d = H.spawn('drone', H.fwd(50, 10), { behavior: 'scripted', ap: 1e5 });
      d.pos.y = c.world.groundHeight(d.pos.x, d.pos.z) + 10;
      G.step(2); H.face(d.center()); G.step(2);
      p.lock = d; p.hardLock = true;
      G.input.hold('fire', true);
      for (let i = 0; i < 60 && !(d.slowT > 0); i++) { G.step(1); H.face(d.center()); }
      G.input.hold('fire', false);
      out.rivet = { slowT: d.slowT, scale: d.speedScale, ammo: p.weapons.R.ammo, label: p.weapons.R.readout().label };
      // Crane-Claw: grab a staggered drone, hold, throw; the throw kills it
      H.clean({ loadout: LO.campaignLoadout({ L: 'crane_claw' }) }); H.place(150, 0); G.step(5);
      const e = H.spawn('drone', H.fwd(15, 6), { behavior: 'scripted' });
      e.pos.y = c.world.groundHeight(e.pos.x, e.pos.z) + 6;
      G.step(2); H.face(e.center()); G.step(1);
      e.stagT = 3;
      const w = p.weapons.L;
      out.clawReady = w.readout().label;
      G.input.press('blade'); G.step(1);
      out.grab = w.state;
      G.step(25);
      out.hold = w.state; out.holdLabel = w.readout().label;
      const mz = p.rig.muzzleL.getWorldPosition(new H.T.Vector3());
      out.heldNear = e.center(new H.T.Vector3()).distanceTo(mz) < 8;
      out.stillStag = e.stagT > 0;
      H.face(H.fwd(60, 0));
      G.input.press('blade'); G.step(1);
      out.thrown = H.count('claw:throw');
      for (let i = 0; i < 240 && e.alive; i++) G.step(1);
      const k = H.ev.find(x => x.t === 'target:killed' && x.e.target === e);
      out.killed = !e.alive; out.kind = k?.e?.source?.kind;
      out.cd = w.readout().label;
      // a swipe with nothing to grab
      G.step(90);
      const t2 = H.spawn('tank', H.fwd(9), { behavior: 'hold', ap: 1e5 });
      G.step(2); H.face(t2.center());
      const ap0 = t2.ap;
      G.input.press('blade'); G.step(2);
      out.swipe = ap0 - t2.ap;
      H.clean();
      return out;
    });
    g.log('parts', r);
    g.assert(r.lo.B === 'sail_rig' && r.lo.G === 'skate_jets' && r.lo.C === null && r.valid, "campaignLoadout({ B: 'sail_rig', G: 'skate_jets' }) validates");
    g.assert(r.hp === 'B,G,C' && r.stock.B === null && r.stock.G === null && r.stock.C === null, 'HARDPOINTS and CAMPAIGN_STOCK.B/G/C (null = stock)');
    g.assert(near(r.v1 / r.v0, 1.35, 0.03), `ground speed × 1.35 with Skate-Jets (${r.v0.toFixed(2)} → ${r.v1.toFixed(2)})`);
    g.assert(r.sail && r.sailAt >= 1.8 && r.sailAt <= 3.2, `SAIL engages after about 2 s straight (${r.sailAt.toFixed(2)} s)`);
    g.assert(r.chip, 'HUD: the SAIL chip shows');
    g.assert(r.qbFreeCost <= 0.01, `quick boost costs 0 EN while sailing (${r.qbFreeCost})`);
    g.assert(r.boostsQuick === 1 && r.boostsLater === 2, `qbCooldown 1.0 s enforced (${r.boostsQuick}, then ${r.boostsLater})`);
    g.assert(r.rivet.slowT > 1 && r.rivet.scale === 0.8 && r.rivet.ammo < 120, `the Rivet Driver slows a drone (slowT ${r.rivet.slowT?.toFixed(2)}, speedScale ${r.rivet.scale})`);
    g.assert(r.clawReady === 'READY' && (r.grab === 'reach' || r.grab === 'hold') && r.hold === 'hold' && /^HOLDING \d s$/.test(r.holdLabel),
             `the Crane-Claw grabs a staggered drone (${r.grab} → ${r.hold}, ${r.holdLabel})`);
    g.assert(r.heldNear && r.stillStag, 'the held drone rides the claw, staggered');
    g.assert(r.thrown === 1 && r.killed && r.kind === 'claw', `the throw kills it (kind ${r.kind})`);
    g.assert(r.swipe >= 800, `with nothing to grab: a swipe (${r.swipe} damage)`);
  });

  // ---------------------------------------------------------------------------------------------- 7 hungry glint
  await sec('glint', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, out = {};
      H.clean(); H.place(160, 0); G.step(5);
      const a = H.spawn('drone', H.fwd(60, 10, -9), { behavior: 'scripted', config: { haul: 'skate_jets' } });
      const b = H.spawn('drone', H.fwd(60, 10, 9), { behavior: 'scripted', config: { haul: 'shotgun_s8' } });
      c.particles?.clear?.();   // the dust of earlier sections
      G.step(3);
      out.hungry = c.haul.glintOf(a); out.amber = c.haul.glintOf(b);
      return out;
    });
    g.log('glint', r);
    g.assert(r.hungry?.color === '#d8ffe6' && r.hungry.hungry && r.hungry.halo, `a hungry part glints pale green-white with a halo (${JSON.stringify(r.hungry)})`);
    g.assert(r.amber?.color === '#ffbf4a' && !r.amber.hungry, 'an ordinary part glints amber');
    await g.camera(await g.eval(() => { const v = window.__e2.fwd(40, 12, 0); return [v.x, v.y, v.z]; }),
                   await g.eval(() => { const v = window.__e2.fwd(60, 10); return [v.x, v.y + 1, v.z]; }), 50);
    await shot('glints', { hud: false });
    await g.freeCam(false);
    await g.eval(() => window.__e2.clean());
  });

  // ---------------------------------------------------------------------------------------------- 8 HUD: meter, tracker, shots
  await sec('hud', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync, out = {};
      H.clean(); H.place(160, 0); G.step(5);
      c.hud.setPanels({ sync: true, tracker: true });
      S.unlock('sight', 'drive', 'hold'); S.setFill(4.5);
      G.step(2);
      out.m12 = c.hud.syncState;
      out.domSegs = document.querySelectorAll('#syncm .sg i').length;
      // capacity 5 (seven fragments overwritten): HOLD greys out with a dash
      const fr = {}; for (const id of ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07']) fr[id] = 'overwritten';
      S.refreshCapacity({ fragments: fr });
      G.step(2);
      out.m5 = c.hud.syncState;
      S.refreshCapacity(null); S.setFill(6); G.step(2);
      out.ready = c.hud.syncState.labels.hold;
      S.setFill(4.5);
      // the tracker
      c.hud.tracker({ id: 'wake', title: 'THE WAKE', value: '38 RIGS · 284 SOULS', band: { state: 'warn', text: 'TOO FAR · 640 m' },
                      alerts: [{ id: 'a1', label: 'BRASS MULE', t: 0.6, text: '15 s', kind: 'danger' }, { id: 'a2', label: 'KETTLE', t: 0.3, text: '8 s' }] });
      const T = document.getElementById('tracker');
      out.tracker = { vis: !T.hidden && T.getBoundingClientRect().height > 0, text: T.textContent, band: T.querySelector('.trk-b')?.className,
                      alerts: T.querySelectorAll('.trk-a').length, w: T.querySelector('.trk-a .ab i')?.style.width, state: c.hud.trackerState?.title };
      c.hud.tracker({ id: 'wake', title: 'THE WAKE', value: '38 RIGS · 284 SOULS', band: { state: 'out', text: 'OUT OF RANGE · 22 s' },
                      alerts: [{ id: 'a1', label: 'BRASS MULE', t: 0.4, text: '10 s', kind: 'danger' }] });
      out.tracker2 = { band: T.querySelector('.trk-b')?.className, alerts: T.querySelectorAll('.trk-a').length };
      return out;
    });
    g.log('hud', r);
    g.assert(r.m12.visible && r.m12.segments === 12 && r.domSegs === 12 && r.m12.filled === 4, `the meter: 12 segments, 4 filled (${r.m12.segments}, ${r.m12.filled})`);
    g.assert(r.m12.labels.sight?.text === 'SIGHT 3' && r.m12.labels.drive?.text === 'DRIVE 4' && /^HOLD 6$/.test(r.m12.labels.hold?.text || '')
             && r.m12.labels.drive.cls === '' && r.m12.labels.hold.cls === 'dim', `tick labels lit/dim (${JSON.stringify(r.m12.labels)})`);
    g.assert(r.m5.segments === 5 && r.m5.labels.hold?.text === 'HOLD —' && r.m5.labels.hold.cls === 'grey', `capacity 5: 5 segments, HOLD greyed (${JSON.stringify(r.m5.labels.hold)})`);
    g.assert(r.ready?.text === 'HOLD READY', `HOLD READY when holdReady (${r.ready?.text})`);
    g.assert(r.tracker.vis && /THE WAKE/.test(r.tracker.text) && /38 RIGS/.test(r.tracker.text) && /TOO FAR/.test(r.tracker.text) && /warn/.test(r.tracker.band)
             && r.tracker.alerts === 2 && parseFloat(r.tracker.w) === 60 && r.tracker.state === 'THE WAKE', `tracker renders title, band and alerts (${JSON.stringify(r.tracker)})`);
    g.assert(/out/.test(r.tracker2.band) && r.tracker2.alerts === 1, 'tracker updates (band out, one alert)');
    // a gameplay shot: the meter, the tracker, Second Sight with a shot in flight and a target winding up
    await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, S = c.sync;
      c.player.setLoadout(H.LO.campaignLoadout({ B: 'sail_rig', G: 'skate_jets', R: 'rivet_driver', L: 'crane_claw' }));
      const d = H.spawn('drone', H.fwd(70, 16, 8), { behavior: 'scripted' });
      G.step(2);
      S.setFill(4.5); S.free('sight');
      for (let i = 0; i < 4; i++) H.shoot(H.fwd(110 + i * 12, 12 + i * 3, -30 + i * 20), 70);
      const m = H.spawn('drone', H.fwd(120, 30, -40), { behavior: 'scripted' });
      c.projectiles.fire({ pos: m.center(new H.T.Vector3()), vel: new H.T.Vector3(0, 20, 0), dmg: 50, imp: 10, team: 'enemy', kind: 'missile', target: c.player, turn: 1.6, accel: 80, maxSpeed: 140, life: 6 });
      d.windup = 2;
      G.step(10);
    });
    await shot('hud-sync-sight');
    const back = await g.eval(() => {
      const H = window.__e2, c = H.c; c.sync.cancel(); H.G.step(2);
      c.hud.tracker(null);
      const T = document.getElementById('tracker');
      return { hidden: T.hidden, state: c.hud.trackerState, sight: document.getElementById('hud').classList.contains('sight') };
    });
    g.assert(back.hidden && back.state === null && !back.sight, 'tracker(null) hides it; the sight overlay ends with the move');
    // the frame with all four new parts, from behind (the Sail-Rig vanes up, the skates' jets)
    await g.eval(() => { const H = window.__e2, c = H.c; c.player.rig.setSail(1); H.G.input.move(0, 1); H.G.step(30); H.G.input.clear(); });
    await g.camera(await g.eval(() => { const p = window.__game.ctx.player; const y = p.yaw; return [p.pos.x + Math.sin(y) * 16 + Math.cos(y) * 7, p.pos.y + 10, p.pos.z + Math.cos(y) * 16 - Math.sin(y) * 7]; }),
                   await g.eval(() => { const p = window.__game.ctx.player.pos; return [p.x, p.y + 6, p.z]; }), 40);
    await shot('parts-rear', { hud: false });
    await g.camera(await g.eval(() => { const p = window.__game.ctx.player; const y = p.yaw; return [p.pos.x - Math.sin(y) * 15 - Math.cos(y) * 8, p.pos.y + 7, p.pos.z - Math.cos(y) * 15 + Math.sin(y) * 8]; }),
                   await g.eval(() => { const p = window.__game.ctx.player.pos; return [p.x, p.y + 5, p.z]; }), 40);
    await shot('parts-front', { hud: false });
    await g.freeCam(false);
    await g.eval(() => { const H = window.__e2; H.c.hud.setPanels({ sync: false, tracker: false }); H.clean(); });
  });

  // ---------------------------------------------------------------------------------------------- 8b comms typography (E6)
  await sec('comms', async () => {
    const r = await g.eval(() => {
      const H = window.__e2, G = H.G, c = H.c, out = {};
      H.clean(); H.place(160, 0); G.step(5);
      c.comms.clear();
      c.comms.defineSpeakers({ E2W: { name: 'WOBBLE', color: '#a8ff9e', wobble: 0.8, speedVar: 0.6, style: 'radio' },
                               E2P: { name: 'PLAIN', color: '#e9e3d3', style: 'radio' } });
      const text = 'Steady now. The reeds are moving.';
      const timeToType = (who) => {
        c.comms.clear(); G.step(1);
        c.comms.say(who, text);
        let n = 0; G.step(1);
        while (c.comms.typing && n < 600) { G.step(1); n++; }
        return n;
      };
      out.plainT = timeToType('E2P');
      out.wobT = timeToType('E2W');
      out.wobT2 = timeToType('E2W');
      c.comms.clear(); G.step(1);
      c.comms.say('E2W', text); G.step(20);
      const line = document.querySelector('#comms .line');
      out.spans = line.querySelectorAll('.wl').length; out.jit = line.classList.contains('jit');
      out.vars = line.querySelector('.wl')?.style.getPropertyValue('--wx');
      G.step(200);
      out.log = c.comms.log.slice(-1)[0]?.text;
      c.comms.clear(); G.step(1);
      c.comms.say('E2P', text); G.step(20);
      out.plainSpans = document.querySelectorAll('#comms .line .wl').length; out.plainJit = document.querySelector('#comms .line').classList.contains('jit');
      c.comms.clear(); G.step(1);
      return out;
    });
    g.log('comms', r);
    g.assert(r.spans > 3 && r.jit && /px$/.test(r.vars || ''), `wobble: letters arrive displaced, the line jitters (${r.spans} letters, ${r.vars})`);
    g.assert(r.wobT !== r.plainT && r.wobT === r.wobT2, `speedVar: per-letter timing differs from plain and is deterministic (${r.plainT} vs ${r.wobT} / ${r.wobT2} ticks)`);
    g.assert(r.log === 'Steady now. The reeds are moving.' && r.plainSpans === 0 && !r.plainJit, 'the log keeps plain text; a plain speaker is unchanged');
  });

  // ---------------------------------------------------------------------------------------------- 9 + 10 flow and the Bench
  await sec('flow', async () => {
    // a v1 campaign state with a pending rack; the inline campaign level 'eng2'
    await g.eval(() => {
      const sv = window.__game.ctx.save;
      sv.setFlag('campaign', { v: 1, day: 1, water: 3, arms: 0, parts: { harpoon_gaff: 'fitted' }, spares: [], fitted: { R: 'rifle_r30', L: 'harpoon_gaff', S: 'msl_vm4' },
                               lost: [], fragments: {}, kernel: 4, benchVisits: 1, tearCount: 2, pending: null, ledger: null });
    });
    await g.eval(async () => {
      const T = (await import(new URL('levels/test.js', location.href).href)).default;
      window.__campDef = { ...T, id: 'eng2', title: 'ENGINE LEG', subtitle: 'Campaign fixture', intro: [], outro: [], unlocks: { levels: [] },
                           campaign: { bench: true, waterFlags: ['w1', 'w2'] }, complete: undefined, start: [{ objective: { add: 'o_reach' } }] };
    });
    await g.eval(() => window.__game.startLevel(window.__campDef, 'cp_start'));
    const s0 = await g.eval(() => {
      const c = window.__game.ctx;
      return { sync: c.sync.enabled, cap: c.sync.capacity, lo: { ...c.player.loadout, paint: undefined }, camp: c.save.getFlag('campaign') };
    });
    g.assert(s0.sync === false && s0.cap === 12 && s0.lo.frame === 'moth' && s0.lo.L === 'harpoon_gaff', `the campaign level starts with the v1 state's loadout, Sync off (${JSON.stringify({ sync: s0.sync, cap: s0.cap, L: s0.lo.L })})`);
    await g.eval(() => {
      const c = window.__game.ctx, m = c.mission;
      m.setFlag('w1', true); m.setFlag('w2', true);
      m.setFlag('cv:lost', [40, 39]);
      m.setFlag('campaign:story', { mercy: 'saved' });
      c.sync.unlock('sight', 'drive');
      c.haul.set(['sail_rig', 'rivet_driver', 'crane_claw'], 3);
      m.complete();
    });
    await g.step(4);
    const waitState = async (st, ms = 20000) => {
      const t = Date.now();
      while (Date.now() - t < ms) { const cur = await g.eval(() => window.__game.state()); if ((Array.isArray(st) ? st : [st]).includes(cur)) return true; await sleep(150); }
      return false;
    };
    g.assert(await waitState('debrief'), 'campaign level → debrief');
    await sleep(300);
    const db = await g.eval(() => ({ rows: [...document.querySelectorAll('#screen .ledger tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
                                     camp: window.__game.ctx.save.getFlag('campaign'), result: window.__game.ctx.mission.lastResult }));
    g.log('debrief rows', db.rows);
    g.assert(db.result.flags && Array.isArray(db.result.flags['cv:lost']) && db.result.flags['campaign:story']?.mercy === 'saved', 'LevelResult.flags carries the mission flags');
    g.assert(db.rows.some(r => /^Water recovered\s*2 \/ 2/.test(r)) && db.rows.some(r => /^Rigs lost/.test(r) && /Last Light|Crow/.test(r)),
             `debrief: the water label and the Rigs lost row (${db.rows.join(' | ')})`);
    const c1 = db.camp;
    g.assert(c1.v === 2 && c1.lost.includes(40) && c1.lost.includes(39) && c1.story?.mercy === 'saved' && c1.fragments?.M1 === 'intact'
             && c1.sync?.unlocked?.includes('sight') && c1.sync.unlocked.includes('drive') && c1.fitted?.B === null && Array.isArray(c1.bound) && c1.calls?.kite === 0,
             `level:complete: v1 → v2, lost, story, M1, sync.unlocked (${JSON.stringify({ v: c1.v, lost: c1.lost, story: c1.story, fr: c1.fragments, sync: c1.sync })})`);
    g.assert(JSON.stringify(c1.ledger?.lostOnRoad) === '[40,39]' && JSON.stringify(c1.ledger?.made) === '["M1"]', 'ledger.lostOnRoad and ledger.made');
    await shot('debrief-v2', { settle: false });
    await g.eval(() => document.querySelector('#screen #bA0')?.click());
    g.assert(await waitState('bench', 30000), 'debrief → the Bench');
    const wB = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await g.eval(fn)) return true; await sleep(150); } return false; };
    await wB(() => !!window.__game.ctx.garage.bench);
    // the gift arrives (it wasn't hauled), and its line plays after arrive
    const b0 = await g.eval(() => ({ st: window.__game.ctx.garage.bench.state(), fired: window.__game.ctx.garage.bench.fired }));
    g.assert(b0.st.parts.skate_jets === 'locker' && b0.st.parts.sail_rig === 'locker' && b0.st.parts.crane_claw === 'locker', `arrival: the hauled parts and the gifted Skate-Jets are in the Locker (${JSON.stringify(b0.st.parts)})`);
    // the harness holds the engine paused: the Bench (lines in real time) and the HUD's cards advance on step()
    let gift = false;
    for (let i = 0; i < 20 && !gift; i++) { await g.step(30); gift = await g.eval(() => window.__game.ctx.garage.bench.fired.includes('gift')); }
    g.assert(gift, 'the gift line plays after arrive');
    const ex0 = await g.eval(() => ({ ex: window.__game.ctx.hud.explainState, parent: document.getElementById('explain')?.parentElement?.id,
                                      vis: !document.getElementById('explain').hidden, z: getComputedStyle(document.getElementById('explain')).zIndex }));
    g.assert(ex0.ex?.id === 'eng_hardpoints' && ex0.vis && ex0.parent === 'game' && Number(ex0.z) > 4, `an explain card shows above the Bench (${JSON.stringify(ex0)})`);
    await sleep(400);
    await shot('bench-fit', { settle: false });
    const ops = await g.eval(() => {
      const B = window.__game.ctx.garage.bench, out = {};
      out.blocked0 = B.walkOnBlocked;
      out.fitB = B.fit('B', 'sail_rig');
      out.giveForced = B.give('skate_jets'); out.giveBlock = B.giveBlock('skate_jets');
      out.fitG = B.fit('G', 'skate_jets');
      out.picker = B.picker;
      out.size0 = B.syncSize;
      out.locked = B.overwrite('F02');
      return out;
    });
    g.log('bench ops', ops);
    g.assert(ops.fitB === true, 'fit BOOSTER: Sail-Rig');
    g.assert(ops.blocked0 && /Skate-Jets/.test(ops.blocked0), `WALK ON blocked while the forced part isn't fitted (${ops.blocked0})`);
    g.assert(ops.giveForced === false && /need/.test(ops.giveBlock || ''), 'GIVE is blocked on the forced part');
    g.assert(ops.fitG === 'picker' && ops.picker?.part === 'skate_jets' && JSON.stringify(ops.picker.allowed) === '["F01"]' && ops.picker.recommended === 'F01' && ops.picker.remaining === 1,
             `fitting the hungry Skate-Jets opens the picker: only F01, recommended F01 (${JSON.stringify(ops.picker)})`);
    g.assert(ops.size0 === 13 && ops.locked === false, `SYNC 13 before (F01..F12 + M1); a locked card refuses (${ops.size0})`);
    await sleep(300);
    await shot('bench-picker', { settle: false });
    const ow = await g.eval(async () => {
      const B = window.__game.ctx.garage.bench, out = {};
      out.walkRefused = await B.walkOn();
      out.ow = B.overwrite('F01');
      const st = B.state();
      out.fr = st.fragments.F01; out.bound = st.bound; out.G = st.fitted.G; out.size = B.syncSize; out.picker = B.picker; out.overwrites = st.overwrites;
      out.blocked = B.walkOnBlocked;
      out.cap = window.__game.ctx.sync.capacity;
      // undo the fit: the part stays bound, the fragment stays overwritten; refitting is free
      out.undo = B.undo();
      const st2 = B.state();
      out.afterUndo = { G: st2.fitted.G, bound: st2.bound, fr: st2.fragments.F01 };
      out.refit = B.fit('G', 'skate_jets');
      // Calls: funding moves water and can be undone
      const w0 = B.state().water;
      B.tab('WAKE');
      out.fund = B.fund('kite', true); out.w1 = B.state().water;
      out.undoFund = B.undo(); out.w2 = B.state().water; out.funded2 = B.funded.kite;
      out.fund2 = B.fund('kite', true); out.w3 = B.state().water;
      out.w0 = w0;
      B.tab('LATTICE');
      out.fired = B.fired;
      return out;
    });
    g.log('overwrite', ow);
    g.assert(ow.walkRefused === false, 'bench.walkOn() is refused while the forced fit is owed');
    g.assert(ow.ow && ow.fr === 'overwritten' && ow.bound.includes('skate_jets') && ow.G === 'skate_jets' && !ow.picker && ow.overwrites[0]?.id === 'F01' && ow.overwrites[0].part === 'skate_jets',
             `overwrite(F01) binds the part and completes the fit (${JSON.stringify({ fr: ow.fr, bound: ow.bound, G: ow.G })})`);
    g.assert(ow.size === 12 && ow.cap === 12, `capacity drops by 1 (Bench SYNC ${ow.size}, ctx.sync ${ow.cap})`);
    g.assert(ow.blocked === null, 'WALK ON unblocked once the Skate-Jets are fitted');
    g.assert(ow.undo && ow.afterUndo.G === null && ow.afterUndo.bound.includes('skate_jets') && ow.afterUndo.fr === 'overwritten' && ow.refit === true,
             `undoing the fit keeps the part bound and the fragment overwritten; refit is free (${JSON.stringify(ow.afterUndo)})`);
    g.assert(ow.fund && ow.w1 === ow.w0 - 1 && ow.undoFund && ow.w2 === ow.w0 && !ow.funded2 && ow.fund2 && ow.w3 === ow.w0 - 1,
             `fund() moves water and is undoable (${ow.w0} → ${ow.w1} → ${ow.w2} → ${ow.w3})`);
    g.assert(['gift', 'hungry', 'locked', 'overwrite', 'calls', 'made', 'fit:sail_rig'].every(k => ow.fired.includes(k)), `Bench V2 line keys fired (${ow.fired.join(', ')})`);
    await sleep(800);
    await shot('bench-lattice', { settle: false });
    await g.eval(() => window.__game.ctx.garage.bench.tab('WAKE'));
    await sleep(300);
    await shot('bench-wake', { settle: false });
    const glos = await g.eval(() => window.__game.ctx.hud.glossary.map(x => x.id));
    g.assert(['eng_hardpoints', 'eng_overwrite', 'eng_made', 'eng_calls'].every(id => glos.includes(id)), `the four Bench cards were explained (${glos.filter(x => x.startsWith('eng_')).join(', ')})`);
    await g.eval(() => window.__game.ctx.garage.bench.walkOn());
    g.assert(await waitState('count', 20000), 'WALK ON → the Count');
    await g.page.waitForSelector('#bWalk', { state: 'visible', timeout: 10000 });
    const cnt = await g.eval(() => ({ last: window.__game.ctx.flow.lastCount, camp: window.__game.ctx.save.getFlag('campaign'), text: document.getElementById('screen').innerText }));
    g.log('count', cnt.last);
    const roll = await g.eval(() => window.__game.ctx.flow.campaignData().then(d => d.roll.filter(r => r.id === 40 || r.id === 39).map(r => r.name)));
    g.assert(cnt.last.lostOnRoad?.length === 2 && cnt.last.lost[0] === cnt.last.lostOnRoad[0] && roll.includes(cnt.last.lostOnRoad[0]) && /LOST ON THE ROAD/.test(cnt.text),
             `the Count lists the rigs lost on the road first (${JSON.stringify(cnt.last.lost)})`);
    g.assert(cnt.last.log === 'Variant line: saved.', `the log variant by the story flag (${cnt.last.log})`);
    g.assert(cnt.camp.v === 2 && cnt.camp.calls?.kite === 3 && cnt.camp.fitted.G === 'skate_jets' && cnt.camp.fitted.B === 'sail_rig' && cnt.camp.bound.includes('skate_jets')
             && cnt.camp.fragments.F01 === 'overwritten' && cnt.camp.ledger === null, `WALK ON committed v2: fitted B/G, bound, calls, F01 (${JSON.stringify({ fitted: cnt.camp.fitted, calls: cnt.camp.calls })})`);
    g.assert(cnt.last.water.after === cnt.camp.water && cnt.last.water.funded === 1, `the Count's water includes the funding (${JSON.stringify(cnt.last.water)})`);
    await shot('count-v2', { settle: false });
    await g.eval(() => document.querySelector('#screen #bWalk')?.click());
    g.assert(await waitState(['title', 'briefing'], 20000), 'after the Count: title');
    // the next campaign level starts with the Sync moves from campaign state and the fitted B/G parts
    await g.eval(() => window.__game.startLevel(window.__campDef, 'cp_start'));
    const s2 = await g.eval(() => {
      const c = window.__game.ctx, p = c.player;
      return { en: c.sync.enabled, un: [...c.sync.unlocked], fill: c.sync.fill, cap: c.sync.capacity, B: p.loadout.B, G: p.loadout.G, mods: p.mods,
               beacons: p.rig.ghostBeacons?.() ?? 0 };
    });
    g.log('next level', s2);
    g.assert(s2.en && s2.un.includes('sight') && s2.un.includes('drive') && s2.fill === 0 && s2.cap === 12, `a fresh campaign start reads st.sync and the fragments (${JSON.stringify(s2)})`);
    g.assert(s2.B === 'sail_rig' && s2.G === 'skate_jets' && s2.mods.speedMul === 1.35 && s2.beacons >= 1, 'the campaign loadout carries B and G; the bound Skate-Jets show ghost beacons');
    // a restart reads the flags
    const rs = await g.eval(() => {
      const G = window.__game, c = G.ctx, S = c.sync;
      S.setFill(5); G.step(40);
      c.mission.reachCheckpoint('cp_mid');
      G.step(2);
      S.setFill(2.5); S.lock('drive'); G.step(40);
      G.restart(); G.step(3);
      return { fill: S.fill, un: [...S.unlocked], en: S.enabled };
    });
    g.log('restart', rs);
    g.assert(rs.en && rs.un.includes('sight') && rs.un.includes('drive') && rs.fill === 5, `a checkpoint restart restores Sync from the mission flags (${JSON.stringify(rs)})`);
    await g.camera(await g.eval(() => { const p = window.__game.ctx.player; const y = p.yaw; return [p.pos.x - Math.sin(y) * 13 + Math.cos(y) * 6, p.pos.y + 6, p.pos.z - Math.cos(y) * 13 - Math.sin(y) * 6]; }),
                   await g.eval(() => { const p = window.__game.ctx.player.pos; return [p.x, p.y + 4, p.z]; }), 40);
    await shot('ghost-beacon', { hud: false });
    await g.freeCam(false);
  });

  g.log(`total ${((Date.now() - T0) / 1000).toFixed(0)} s`);
}
