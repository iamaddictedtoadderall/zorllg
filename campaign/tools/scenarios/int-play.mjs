// tools/scenarios/int-play.mjs (integration): Level 1 played end to end FROM THE TITLE the way a player would.
//
//   node tools/playtest.mjs --scenario int-play --port 8602 --timeout 7200 --out /tmp/campaign-playtest/INT-int-play
//        [--param shots=0] [--param leak=0]
//
// Real menu clicks (New game → briefing → Deploy → the intro cards), no checkpoint starts: every checkpoint has to be
// reached by playing. Fights use aimed fire, lock-on, missiles, repair kits, quick boosts and TEAR through injected
// inputs (the aim is set like a perfect mouse); long walks steer along the route and only far detours teleport. A
// death goes through the real death screen (Retry). The end: debrief → the Bench (real clicks: Fit, Give, Undo, Walk
// on) → the Morning Count → the title. Then a leak check: level select → l01 → Esc → Quit to title, twice.
// Throughout: a spoiler watch (no visible "Moth" before the naming), and the clarity log (objective texts, speaker
// tags on first lines, explainer cards).
export default async function (g) {
  const P = Object.fromEntries((g.args.params || []).map(p => { const [k, ...v] = p.split('='); return [k, v.join('=')]; }));
  const SHOTS = P.shots !== '0', LEAK = P.leak !== '0';
  // debug only (the proof run starts at the title): cp=<checkpoint> starts there through __game.startLevel
  const CPS = ['cp_cut', 'cp_cavern', 'cp_ridges', 'cp_abeyance', 'cp_cutline', 'cp_floes'];
  const FROM = P.cp ? Math.max(0, CPS.indexOf(P.cp)) : 0;
  let r;
  const ev = (fn, arg) => g.eval(fn, arg);
  const T0 = Date.now();
  const since = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
  const notes = [];   // shortcuts the run had to take (a player-blocking problem shows up here)
  const note = (s) => { notes.push(s); g.log('NOTE ' + s); };

  // ── the in-page library ───────────────────────────────────────────────────────────────────────────────────────
  await ev(() => {
    const G = window.__game, ctx = G.ctx;
    const IP = window.__ip = { spoil: [], deaths: 0, lines: [], obj: [], cards: [], fired: new Set(), cps: [] };
    ctx.events.on('trigger:fired', (e) => IP.fired.add(e.id));
    ctx.events.on('level:start', () => IP.fired.clear());   // a checkpoint restart re-arms what fired after it
    ctx.events.on('comms:line', (e) => IP.lines.push({ who: e.who, text: e.text, tag: e.tag ?? null, name: e.name ?? ctx.comms?.speaker?.(e.who)?.name ?? null }));
    ctx.events.on('objective:changed', (e) => { if (e.state === 'active' && e.text) IP.obj.push({ id: e.id, text: e.text }); });
    ctx.events.on('hud:explain', (e) => IP.cards.push({ id: e.id, term: e.term }));
    ctx.events.on('checkpoint:reached', (e) => IP.cps.push(e.id ?? e.checkpoint ?? JSON.stringify(e)));
    IP.ev = [];
    const rec = (n) => (e) => { if (IP.ev.length < 60) IP.ev.push(`${ctx.clock.time.toFixed(1)} ${n} ${JSON.stringify(e ?? {}).slice(0, 80)}`); };
    for (const n of ['level:start', 'state:changed', 'player:died', 'level:failed', 'mission:restart']) ctx.events.on(n, rec(n));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    IP.sleep = sleep;
    /** the spoiler watch: visible text naming the frame before the naming */
    IP.spoilCheck = () => {
      if (ctx.l01?.named || IP.fired.has('t_bench')) return;   // the naming begins at t_bench (Kit's line names it)
      const t = document.body.innerText || '';
      const m = t.match(/[^\n]{0,40}\bmoth\b[^\n]{0,40}/i);
      if (m && IP.spoil.length < 20) IP.spoil.push({ state: ctx.flow.state, text: m[0], cp: ctx.mission?.checkpoint ?? null });
    };
    /** one sim chunk the way the game advances: menus/cards handled like a player, deaths retried */
    IP.tick = async (n = 10) => {
      const st = ctx.flow.state;
      if (st === 'interstitial') {
        const b = document.querySelector('#screen #bNext');
        if (b && !b.closest('[hidden]')) b.click();
        await sleep(120); IP.spoilCheck(); return 'interstitial';
      }
      if (st === 'dead') {
        // the death beat runs on sim time before the death screen shows: step until Retry appears
        const b = document.querySelector('#screen #bRetry');
        if (!b) { G.step(n); await sleep(0); return 'dead'; }
        IP.deaths++; b.click(); await sleep(400);
        // the retry reloads the checkpoint (async); wait for 'playing'
        for (let i = 0; i < 600 && ctx.flow.state !== 'playing'; i++) {
          if (ctx.flow.state === 'interstitial') { document.querySelector('#screen #bNext')?.click(); }
          await sleep(100);
        }
        return 'retried';
      }
      if (st !== 'playing' && st !== 'complete') { await sleep(50); return st; }
      G.step(n);
      if ((ctx.clock.frame % 60) < n) IP.spoilCheck();
      await sleep(0);
      return st;
    };
    IP.aimAt = (pos, eyeH = 9) => {
      const p = ctx.player;
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, dy = pos.y - (p.pos.y + eyeH);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz))));
    };
    /** fight until pred() or no target or maxSec. targets(): list of Targets; prefer(): optional first pick */
    IP.fight = async (o) => {
      const p = ctx.player, V = p.pos.constructor, c = new V();
      const targets = (0, eval)('(' + o.targets + ')'), pred = o.until ? (0, eval)('(' + o.until + ')') : null;
      let steps = 0, strafe = 1, strafeT = 0, lockT = 0, mslT = 0, tearHold = 0, last = null, shots0 = ctx.combat?.stats?.shots ?? 0;
      const deaths0 = IP.deaths;
      const trace = [];
      const maxSteps = Math.round((o.maxSec ?? 120) * 60);
      const range = o.range ?? 120, minR = o.min ?? 25;
      while (steps < maxSteps) {
        if (pred && pred(ctx, ctx.l01)) return { ok: true, t: steps / 60, why: 'until' };
        if (ctx.flow.state !== 'playing') {
          const s = await IP.tick(10); steps += 2;
          if (s === 'retried') { G.input.clear(); if (IP.deaths - deaths0 >= 4) return { ok: false, t: steps / 60, why: 'deaths', deaths: IP.deaths - deaths0 }; }
          if (ctx.flow.state === 'debrief') break;
          continue;
        }
        if (ctx.cinematics?.active || p.frozen) { G.input.clear(); await IP.tick(10); steps += 10; continue; }
        const list = (targets(ctx, ctx.l01, o.arg) || []).filter(t => t && t.alive !== false);
        if (!list.length) { if (!pred) return { ok: true, t: steps / 60, why: 'none' }; G.input.clear(); await IP.tick(10); steps += 10; continue; }
        let T = null, bd = Infinity;
        for (const t of list) { const tc = t.center ? t.center(c) : t.pos; const d = tc.distanceTo(p.pos); if (d < bd) { bd = d; T = t; } }
        if (T !== last) { last = T; lockT = 0; }
        const tc = T.center ? T.center(new V()) : T.pos.clone();
        const flat = Math.hypot(tc.x - p.pos.x, tc.z - p.pos.z);
        if (flat > (o.teleportBeyond ?? 600)) {   // a long way off: get there (a player would sprint for half a minute)
          const k = (flat - range * 0.8) / flat;
          p.teleport(new V(p.pos.x + (tc.x - p.pos.x) * k, NaN, p.pos.z + (tc.z - p.pos.z) * k));
          G.input.clear(); await IP.tick(10); steps += 10; continue;
        }
        IP.aimAt(tc, o.eye ?? 9);
        G.input.clear();
        // TEAR like a player: a staggered target with a glinting part is not shot dead; close in for the prompt
        const tearable = o.tear !== false && T.stagT > 0 && T.haul && !T.haul.taken && p.abilities?.tear !== false && ctx.haul?.enabled !== false;
        if (tearable && !ctx.haul?.candidate) {
          G.input.move(0, 1);
          if (flat > 45 && p.abilities?.boost && (steps % 40) === 0) G.input.press('boost');
          await IP.tick(10); steps += 10; continue;
        }
        strafeT -= 10; if (strafeT <= 0) { strafe = -strafe; strafeT = 120 + ((steps / 10) % 7) * 20; }
        const fwd = flat > range ? 1 : flat < minR ? -0.6 : 0;
        if (!o.stand) G.input.move(fwd ? 0.25 * strafe : strafe * 0.8, fwd);
        if (p.abilities?.fire !== false && flat < 300) G.input.hold('fire', true);
        if (p.abilities?.lock && !p.hardLock && (lockT -= 10) <= 0) { G.input.press('lock'); lockT = 60; }
        if (p.abilities?.missile && (mslT -= 10) <= 0 && flat < 260) { G.input.press('missile'); mslT = 150; }
        if (p.abilities?.kit && p.ap < p.apMax * 0.35) G.input.press('kit');
        if (p.tow && p.abilities?.boost) G.input.press('boost');
        if (o.blade && p.abilities?.blade && flat < 40 && (steps % 60) === 0) G.input.press('blade');
        // TEAR: a glinting staggered target in reach shows the prompt; hold BLADE until the rack takes it
        if (o.tear !== false && ctx.haul?.candidate && p.abilities?.tear !== false) {
          tearHold = 50;
        }
        if (tearHold > 0) { tearHold -= 10; G.input.hold('fire', false); G.input.hold('blade', true); IP.aimAt(ctx.haul?.candidate?.pos ?? tc, 3); }
        await IP.tick(10); steps += 10;
        if (steps % 600 === 0) trace.push({ t: steps / 60, T: T.name || T.kind, d: Math.round(flat), tap: Math.round(T.ap ?? -1), stag: +(T.stagT || 0).toFixed(1),
                                           ap: Math.round(p.ap), lock: !!p.hardLock, fire: p.abilities?.fire, deaths: IP.deaths - deaths0 });
      }
      G.input.clear();
      return { trace: trace.slice(-12), ok: pred ? !!pred(ctx, ctx.l01) : !(targets(ctx, ctx.l01, o.arg) || []).some(t => t && t.alive !== false), t: steps / 60, why: 'time',
               shots: (ctx.combat?.stats?.shots ?? 0) - shots0 };
    };
    /** walk along the route to (s, l) like a player: stick forward, steering 40 m ahead, side-steps when stuck */
    IP.walkTo = async (s, l, maxSec, sprint = 0, r = 12) => {
      const p = ctx.player;
      const goal = ctx.world.resolve({ s, l });
      let steps = 0, last = p.pos.clone(), lastT = 0, side = 0, sideT = 0, stuck = 0;
      const maxSteps = Math.round(maxSec * 60);
      while (steps < maxSteps) {
        if (ctx.flow.state !== 'playing') { await IP.tick(10); steps += 2; continue; }
        if (ctx.cinematics?.active || p.frozen) { G.input.clear(); await IP.tick(10); steps += 10; continue; }
        const rc = ctx.world.route.closest(p.pos.x, p.pos.z);
        const d = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
        if (d < r) { G.input.clear(); return { ok: true, t: steps / 60, stuck }; }
        const ahead = d < 60 ? goal : ctx.world.resolve({ s: Math.min(s, rc.s + 40), l: l * Math.min(1, (rc.s + 40) / s) });
        p.yaw = Math.atan2(-(ahead.x - p.pos.x), -(ahead.z - p.pos.z)); p.pitch = -0.08;
        if (steps - lastT >= 90) {
          if (p.pos.distanceTo(last) < 4) { stuck++; side = stuck % 2 ? 1 : -1; sideT = 120; if (p.abilities?.jump && p.onGround) G.input.press('jump'); }
          last.copy(p.pos); lastT = steps;
        }
        if (sideT > 0) { sideT -= 10; G.input.move(side, 0.4); } else G.input.move(0, 1);
        if (sprint && p.abilities?.boost && p.onGround && (steps % 90) === 0) G.input.press('boost');
        await IP.tick(10); steps += 10;
      }
      G.input.clear();
      return { ok: false, t: steps / 60, at: [p.pos.x, p.pos.y, p.pos.z].map(v => +v.toFixed(1)), s: +ctx.world.route.closest(p.pos.x, p.pos.z).s.toFixed(0), stuck };
    };
    /** walk straight at a world point (short distances) */
    IP.walkAt = async (x, z, maxSec, r = 6) => {
      const p = ctx.player; let steps = 0, last = p.pos.clone(), lastT = 0;
      while (steps < maxSec * 60) {
        if (ctx.flow.state !== 'playing') { await IP.tick(10); steps += 2; continue; }
        const d = Math.hypot(x - p.pos.x, z - p.pos.z);
        if (d < r) { G.input.clear(); return { ok: true, t: steps / 60 }; }
        p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); p.pitch = -0.1;
        G.input.clear(); G.input.move(0, 1);
        // blocked by a ridge: jump and hover over it (when those systems are back)
        if (steps - lastT >= 60) { if (p.pos.distanceTo(last) < 6 && p.abilities?.jump && p.onGround) G.input.press('jump'); last.copy(p.pos); lastT = steps; }
        if (!p.onGround && p.vel.y < 0 && p.abilities?.hover && p.en > 200) G.input.hold('jump', true);
        await IP.tick(10); steps += 10;
      }
      G.input.clear();
      return { ok: false, t: steps / 60, d: Math.hypot(x - p.pos.x, z - p.pos.z) };
    };
  });

  // ── scenario-side helpers ─────────────────────────────────────────────────────────────────────────────────────
  async function until(pred, arg, maxSec = 30, chunk = 10) {
    return ev(async ([src, arg, maxSteps, chunk]) => {
      const ctx = window.__game.ctx, IP = window.__ip;
      const f = (0, eval)('(' + src + ')');
      const test = () => { try { return !!f(ctx, ctx.l01, arg); } catch (e) { return false; } };
      let steps = 0;
      while (steps < maxSteps) {
        if (test()) return { ok: true, t: steps / 60 };
        const s = await IP.tick(chunk);
        if (s === 'playing' || s === 'complete') steps += chunk;
        else steps += 2;   // menus: count a little so a stuck menu still times out
      }
      return { ok: test(), t: steps / 60 };
    }, [pred.toString(), arg ?? null, Math.round(maxSec * 60), chunk]);
  }
  const step = (sec, chunk = 30) => until(() => false, null, sec, chunk);
  const fired = (id) => ev((id) => window.__ip.fired.has(id), id);
  const fight = (o) => ev((o) => window.__ip.fight(o), { ...o, targets: o.targets.toString(), until: o.until ? o.until.toString() : null });
  const walkTo = (s, l, maxSec, sprint = 0, r = 12) => ev(([s, l, m, sp, r]) => window.__ip.walkTo(s, l, m, sp, r), [s, l, maxSec, sprint, r]);
  const walkAt = (x, z, maxSec, r = 6) => ev(([x, z, m, r]) => window.__ip.walkAt(x, z, m, r), [x, z, maxSec, r]);
  const routePos = (s, l = 0, h = 0) => ev(([s, l, h]) => { const v = window.__game.ctx.world.resolve({ s, l, h }); return [v.x, v.y, v.z]; }, [s, l, h]);
  const cp = () => ev(() => window.__game.ctx.mission?.checkpoint ?? null);
  const flowState = () => ev(() => window.__game.ctx.flow.state);
  const skipCine = () => ev(() => { if (window.__game.ctx.cinematics?.active) window.__game.skipCinematic(); });
  async function shot(name, o = {}) {
    if (!SHOTS) return null;
    const t = Date.now();
    const file = `${g.out}/${name}.png`;
    try {
      if (o.settle !== false) await ev(() => window.__game.settle());
      await ev((hud) => { window.__game.hud(hud); window.__game.render(); }, o.hud !== false);
      await g.page.screenshot({ path: file, timeout: 240000 });
      if (o.hud === false) await ev(() => window.__game.hud(true));
      g.log(`[${since()}] shot ${name} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    } catch (e) { g.log(`shot ${name} failed: ${e.message.split('\n')[0]}`); }
    return file;
  }
  async function noErrors(label) {
    const e = await ev(() => window.__game.errors());
    g.assert(e.length === 0, `${label}: no game errors${e.length ? ' (' + e.slice(0, 3).map(x => x.system + ': ' + x.message).join(' | ') + ')' : ''}`);
  }
  async function click(sel, ms = 20000) {
    await g.page.waitForSelector(sel, { state: 'visible', timeout: ms });
    await g.page.click(sel);
  }
  async function waitFlow(want, ms = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await flowState();
      if (s === want) return true;
      if (s === 'interstitial' && want !== 'interstitial') await ev(() => document.querySelector('#screen #bNext')?.click());
      // the Bench's lines, the debrief and the Count wait on sim time: advance it a little while waiting
      if (s === 'bench' || s === 'complete' || s === 'debrief' || s === 'count') await ev(() => window.__game.step(6));
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  }
  async function zone(label) {
    const s = await ev(() => { const ctx = window.__game.ctx, p = ctx.player; return { cp: ctx.mission?.checkpoint, s: +ctx.world.route.closest(p.pos.x, p.pos.z).s.toFixed(0),
      ap: Math.round(p.ap), deaths: window.__ip.deaths, obj: ctx.mission.objectives?.filter?.(o => o.state === 'active').map(o => o.text) ?? null }; });
    g.log(`[${since()}] ${label}`, s);
  }

  // ════════════════════════════════════════════════════════════════════════════════════════ the title and briefing
  if (FROM <= 0) {
  // the harness opens a fresh browser profile (an empty save) and debug-pauses the sim: menus run on real time and
  // the level is stepped by hand below
  g.assert(await flowState() === 'title', 'starts at the title');
  g.assert(await ev(() => !document.querySelector('#screen #bCont')), 'a fresh save: no Continue on the title');
  await shot('00-title', { settle: false });
  await click('#bNew');
  g.assert(await waitFlow('briefing', 30000), 'New game → briefing');
  const brief = await ev(() => ({ h2: document.querySelector('#screen h2')?.textContent, text: document.querySelector('#screen')?.innerText || '',
                                  fit: !!document.querySelector('#screen #bFit') }));
  g.log('briefing', brief.text.replace(/\s+/g, ' ').slice(0, 900));
  g.assert(!/\bmoth\b/i.test(brief.text), 'briefing does not name the frame');
  g.assert(!brief.fit, 'campaign briefing hides "Fit frame" (A2 #6)');
  await shot('01-briefing', { settle: false });
  await click('#bStart');
  // loading → the intro cards (a player reads them and presses Next)
  const intro = [];
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const s = await flowState();
      if (s === 'playing') break;
      if (s === 'interstitial') {
        // read the card like a player: wait for its text to type in (up to 12 s), then press Next
        await new Promise(r => setTimeout(r, 2500));
        let txt = '';
        for (let i = 0; i < 20 && txt.length < 30; i++) {
          txt = await ev(() => document.querySelector('#screen .card, #screen')?.innerText?.replace(/\s+/g, ' ').replace(/\b(Next|Skip|Continue)\b/g, '').trim() || '');
          if (txt.length < 30) await new Promise(r => setTimeout(r, 500));
        }
        if (txt && intro[intro.length - 1] !== txt) { intro.push(txt); if (intro.length === 1) await shot('02-intro-card', { settle: false }); }
        await ev(() => document.querySelector('#screen #bNext')?.click());
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }
  g.log('intro cards', intro);
  g.assert(intro.every(t => !/\bmoth\b/i.test(t)), 'intro cards do not name the frame');
  const s0 = await ev(() => window.__game.getState());
  g.assert(s0.state === 'playing' && s0.levelId === 'l01' && s0.checkpoint === 'cp_cut', `Deploy → playing l01 at cp_cut (${s0.state} ${s0.levelId} ${s0.checkpoint})`);
  await noErrors('title → level');

  } else {
    await ev(() => window.__game.save.reset());
    const st = await g.startLevel('l01', CPS[FROM]);
    note(`debug run: started at ${CPS[FROM]} through __game.startLevel (not a proof run)`);
    g.assert(st.state === 'playing', `started at ${CPS[FROM]}`);
  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z1 · the cut
  if (FROM <= 0) {
  r = await until((ctx) => ctx.cinematics.active, null, 3, 5);
  if (r.ok) { await step(2); await shot('10-z1-opening', { hud: false }); }
  r = await until((ctx) => !ctx.cinematics.active, null, 60);
  g.assert(r.ok, `the opening vista ends by itself (${r.t.toFixed(1)} s)`);
  r = await until((ctx) => ctx.mission.objective('o_look')?.state === 'active', null, 10);
  g.assert(r.ok, 'o_look: "Look up and find Kit\'s kite"');
  await step(3);
  await shot('11-z1-cutter-start');
  r = await until((ctx, L) => { const p = ctx.player, k = L.kite.pos; window.__ip.aimAt(k); return ctx.mission.objective('o_look')?.state === 'done'; }, null, 15, 5);
  g.assert(r.ok, `looking at the kite completes o_look (${r.t.toFixed(1)} s)`);
  r = await until((ctx) => ctx.mission.objective('o_cut')?.state === 'active', null, 8);
  g.assert(r.ok, 'o_cut active');
  // the three marked blocks: drive the cutter to each and saw it (BLADE ×3)
  for (const id of ['block1', 'block2', 'block3']) {
    const b = await ev((id) => { const i = window.__game.ctx.structures.get(id); return i && { x: i.pos.x, z: i.pos.z, state: i.state }; }, id);
    if (!b || b.state === 'destroyed') continue;
    let w = await walkAt(b.x, b.z, 40, 9);
    if (!w.ok) { note(`Z1: the cutter could not drive to ${id} in 40 s (${JSON.stringify(w)}); teleported`); await ev(([x, z]) => { const p = window.__game.ctx.player; const d = Math.hypot(x - p.pos.x, z - p.pos.z); p.teleport(new p.pos.constructor(x + (p.pos.x - x) / d * 8, NaN, z + (p.pos.z - z) / d * 8)); }, [b.x, b.z]); }
    for (let i = 0; i < 6; i++) {
      const st = await ev((id) => window.__game.ctx.structures.get(id).state, id);
      if (st === 'destroyed') break;
      await ev(([x, z]) => { const ctx = window.__game.ctx, p = ctx.player; p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); p.bodyYaw = p.yaw; p.pitch = -0.1; }, [b.x, b.z]);
      await step(0.2, 6);
      await g.input({ press: ['blade'] }); await step(0.8, 6);
    }
    const st = await ev((id) => window.__game.ctx.structures.get(id).state, id);
    g.assert(st === 'destroyed', `the cutter's saw cuts ${id}`);
    if (id === 'block1') await shot('12-z1-cut');
  }
  r = await until((ctx) => ctx.mission.objective('o_cut')?.state === 'done', null, 6);
  g.assert(r.ok, 'o_cut done');
  r = await until((ctx) => ctx.enemies.count({ tag: 'raid' }) >= 1, null, 30);
  g.assert(r.ok, `the raid arrives (${r.t.toFixed(0)} s)`);
  await step(4);
  await shot('13-z1-raid');
  r = await until((ctx) => ctx.mission.objective('o_gully')?.state === 'active', null, 30);
  g.assert(r.ok, 'o_gully: "Run east into the gully"');
  r = await walkTo(322, 0, 90, 0, 5);
  g.log('drive to the gully', r);
  r = await until((ctx) => ctx.mission.flags['p:fell'], null, 40);
  g.assert(r.ok, `the snow bridge collapses (${r.t.toFixed(1)} s)`);
  r = await until((ctx) => ctx.flow.state === 'interstitial' || (ctx.hud.fadeLevel ?? 0) >= 1, null, 20, 5);
  if (r.ok) await shot('14-z1-hatch-card', { settle: false });
  r = await until((ctx) => ctx.mission.checkpoint === 'cp_cavern' && ctx.mission.flags['p:awake'] && !ctx.player.frozen, null, 120);
  g.assert(r.ok, `the boot over black, the waking, cp_cavern reached by playing (${r.t.toFixed(1)} s)`);
  await zone('Z2 start');
  await noErrors('Z1');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z2 · under the ice
  if (FROM <= 1) {
  await step(1);
  await shot('20-z2-cavern');
  r = await walkTo(625, 0, 120, 0, 8);
  g.assert(r.ok, `walked the cavern to the shaft (${r.t.toFixed(0)} s ${JSON.stringify(r)})`);
  r = await until((ctx) => ctx.player.abilities.jump && ctx.player.abilities.hover, null, 10);
  g.assert(r.ok, 'jump and hover remembered at the shaft');
  await shot('21-z2-shaft');
  await g.input({ clear: true, hold: { jump: true } });
  r = await until((ctx) => ctx.player.pos.y > 20, null, 10, 5);
  await g.input({ clear: true, hold: { jump: true }, move: [0, 1] });
  await step(1.2, 5);
  await g.input({ clear: true, move: [0, 1] });
  r = await until((ctx) => ctx.mission.flags.outOfShaft, null, 10);
  await g.input({ clear: true });
  g.assert(r.ok, 'hover-climbed out of the shaft');
  r = await until((ctx) => ctx.mission.checkpoint === 'cp_ridges', null, 6);
  g.assert(r.ok, 'cp_ridges reached by playing');
  r = await until((ctx) => ctx.mission.objective('o_kit')?.state === 'active', null, 60);
  g.assert(r.ok, `o_kit: "Reach Kit under the red flare" (${r.t.toFixed(0)} s)`);
  await zone('Z3 start');
  await noErrors('Z2');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z3 · the Teeth
  if (FROM <= 2) {
  // a death in the Teeth sends the player back to cp_ridges (the pin and the wrecks again): replay the zone like a player
  for (let attempt = 0; ; attempt++) {
    const deaths0 = await ev(() => window.__ip.deaths);
    const guard = async () => { if ((await ev(() => window.__ip.deaths)) > deaths0) throw new Error('RETRY'); };
    try {
    await shot('30-z3-teeth');
    r = await walkTo(860, 40, 90, 1, 20);   // to Kit's marker (the pin starts at s 820)
    g.log('walk to Kit', r);
    r = await until((ctx) => ctx.enemies.count({ tag: 'pin' }) >= 1 && ctx.player.abilities.fire, null, 20);
    await guard();
    g.assert(r.ok, 'the pin: skiffs on Tick, the rifle remembered');
    await step(2);
    await shot('31-z3-pin');
    r = await fight({ targets: (ctx) => ctx.enemies.alive({ tag: 'pin' }), until: (ctx) => window.__ip.fired.has('t_pin_clear'), maxSec: 240, range: 90, min: 20 });
    g.log('pin fight', r);
    await guard();
    if (!r.ok) { note(`Z3: the pin fight did not clear in 240 s (${JSON.stringify(r)}); killed the rest`); await ev(() => window.__game.ctx.enemies.killAll({ tag: 'pin' })); await until(() => window.__ip.fired.has('t_pin_clear'), null, 20); }
    // the TEAR guarantee (pin3: a Gaffer that staggers on its first hit) arrives once the pin is clear without a TEAR
    r = await until((ctx) => ctx.enemies.count({ tag: 'pin3' }) >= 1 || (ctx.haul?.rack?.length ?? 0) >= 1, null, 10);
    if (await ev(() => window.__game.ctx.enemies.count({ tag: 'pin3' }) >= 1)) {
      r = await fight({ targets: (ctx) => ctx.enemies.alive({ tag: 'pin3' }), until: (ctx) => (ctx.haul?.rack?.length ?? 0) >= 1, maxSec: 120, range: 60, min: 10 });
      g.log('TEAR guarantee fight', r);
    }
    const tears = await ev(() => ({ rack: [...(window.__game.ctx.haul?.rack || [])], tears: window.__game.ctx.haul?.tears ?? 0 }));
    g.log('after the pin', tears);
    await guard();
    g.assert(tears.rack.length >= 1, `TEAR in the pin fight racked a part (${tears.rack.join(', ')})`);
    if (await fired('t_sled1')) {
      const sp = await ev(() => { const v = window.__game.ctx.l01.sledPos('sled1'); return v && [v.x, v.z]; });
      if (sp) {
        const w = await walkAt(sp[0], sp[1], 40, 7);
        if (!w.ok) { note('Z3: could not walk to sled 1; teleported'); await g.teleport([sp[0] + 5, sp[1]]); }
        await g.input({ clear: true, hold: { interact: true } });
        r = await until((ctx) => ctx.mission.flags.sled1, null, 5, 5);
        await g.input({ clear: true });
        g.assert(r.ok, 'sled 1 flagged (hold F)');
      }
    } else note('Z3: t_sled1 never fired (the tow skiff survived?)');
    // cache A: the old wreck frozen into a side lead, a detour across open leads (a straight walk drowns in them): teleport
    r = { ok: false };
    if (!r.ok) { note('Z3: cache A detour (a side lead off the route): teleported to it'); const ca = await routePos(1012, -160); await g.teleport([ca[0], ca[2]]); }
    await step(1);
    g.log('rack after cache A', await ev(() => [...(window.__game.ctx.haul?.rack || [])]));
    { const back = await routePos(1000, 0); await g.teleport([back[0], back[2]]); }   // and back to the route (the wreck sits in open water)
    await zone('Z3 after cache A');
    r = await walkTo(1060, 0, 60, 1);
    r = await until((ctx) => ctx.enemies.count({ kind: 'gleaner' }) >= 1, null, 10);
    await guard();
    g.assert(r.ok, 'the Gleaners at the wrecks');
    if (!r.ok) g.log('gleaners diag', await ev(() => { const ctx = window.__game.ctx, p = ctx.player, rc = ctx.world.route.closest(p.pos.x, p.pos.z);
      return { pinClear: ctx.mission.flags['p:pinClear'], s: rc.s, l: rc.l, fired: [...window.__ip.fired].filter(x => /pin|glean|tear/.test(x)),
               ev: window.__ip.ev, cp: ctx.mission.checkpoint, enc: ctx.mission.encounterState?.('e_pin') ?? null, state: ctx.flow.state }; }));
    r = await until((ctx) => ctx.player.abilities.blade, null, 12);
    await step(1);
    await shot('32-z3-gleaners');
    r = await fight({ targets: (ctx) => ctx.enemies.alive({ tag: 'enc:e_gleaners' }), until: (ctx) => window.__ip.fired.has('t_burn'), maxSec: 300, range: 70, min: 12, blade: true });
    g.log('gleaner fight', r);
    await guard();
    if (!r.ok) { note(`Z3: the wrecks fight did not finish in 300 s (${JSON.stringify(r)}); killed the rest`); await ev(() => window.__game.ctx.enemies.killAll({ tag: 'enc:e_gleaners' })); await until(() => window.__ip.fired.has('t_burn'), null, 20); }
    await shot('33-z3-after-wrecks');
    r = await until((ctx) => ctx.mission.objective('o_abeyance')?.state === 'active', null, 40);
    await guard();
    g.assert(r.ok, 'o_abeyance: "Head for the giant frozen ship"');
    r = await walkTo(1295, 0, 90, 1);
    g.log('walk to the pass', r);
    await shot('34-z3-pass');
    r = await walkTo(1380, 0, 60, 1);
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_abeyance', null, 10);
    await guard();
    g.assert(r.ok, 'cp_abeyance reached by playing');
    await zone('Z4 start');
      break;
    } catch (e) {
      if (e.message !== 'RETRY' || attempt >= 2) throw e;
      note(`Z3: died in the Teeth; the zone again from cp_ridges (attempt ${attempt + 2})`);
      await until((ctx) => ctx.flow.state === 'playing' && !ctx.player.frozen, null, 30);
    }
  }
  await noErrors('Z3');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z4 · the Abeyance
  if (FROM <= 3) {
  r = await until((ctx) => ctx.enemies.count({ tag: 'sexton' }) === 1 && ctx.mission.objective('o_sexton')?.state === 'active', null, 30);
  g.assert(r.ok, 'the Sexton and o_sexton');
  r = await until((ctx) => ctx.player.abilities.missile, null, 30);
  await step(2);
  await shot('40-z4-sexton');
  r = await fight({ targets: (ctx) => { const s = ctx.enemies.alive({ tag: 'sexton' }); const o = ctx.enemies.alive({ team: 'enemy' }).filter(u => u.pos.distanceTo(ctx.player.pos) < 45 && !u.tags?.has?.('sexton')); return o.length ? o : s; },
                    until: (ctx) => ctx.enemies.count({ tag: 'sexton' }) === 0 && ctx.mission.flags['p:sexton'], maxSec: 360, range: 70, min: 30 });
  g.log('Sexton fight', r, await ev(() => ({ deaths: window.__ip.deaths, ap: window.__game.ctx.player.ap })));
  if (!r.ok) { note(`Z4: the Sexton fight did not finish in 360 s (${JSON.stringify(r)}); killed it`); await ev(() => window.__game.ctx.enemies.killAll({ tag: 'sexton' })); }
  await shot('41-z4-after-sexton');
  r = await until((ctx) => ctx.mission.objective('o_climb2')?.state === 'active', null, 40);
  g.assert(r.ok, 'o_climb2: "Climb up inside the Abeyance to the top"');
  r = await until(() => window.__ip.fired.has('t_hold_sled'), null, 60);
  if (r.ok) {
    // the winch lock: shoot it
    r = await fight({ targets: (ctx) => { const i = ctx.structures.get('winchLock'); return i?.target?.alive ? [i.target] : []; }, maxSec: 40, range: 40, min: 8, stand: false });
    if (!r.ok) { note('Z4: could not shoot the winch lock off in 40 s; destroyed it'); await ev(() => { const ctx = window.__game.ctx, i = ctx.structures.get('winchLock'); if (i?.target?.alive) ctx.combat.kill(i.target, { team: 'player' }); }); }
    await until(() => window.__ip.fired.has('t_winch'), null, 4);
    const s2 = await ev(() => { const v = window.__game.ctx.l01.sledPos('sled2'); return v && [v.x, v.y, v.z]; });
    if (s2) {
      await g.teleport([s2[0] + 5, s2[1] + 0.5, s2[2] + 2]);
      await g.input({ clear: true, hold: { interact: true } });
      r = await until((ctx) => ctx.mission.flags.sled2, null, 5, 5);
      await g.input({ clear: true });
      g.assert(r.ok, 'sled 2 flagged');
    }
  } else note('Z4: t_hold_sled did not fire in 60 s');
  // the climb (floors 2, 3, the crown): the stairs are a long climb, so floor by floor
  const fl2 = await ev(() => { const v = window.__game.ctx.world.resolve({ s: 1545, l: 5 }); return [v.x, v.z]; });
  await g.teleport([fl2[0], 45.6, fl2[1]]);
  r = await until(() => window.__ip.fired.has('t_floor2'), null, 4);
  if (r.ok) {
    await step(2);
    await shot('42-z4-floor2');
    r = await fight({ targets: (ctx) => ctx.enemies.alive({ kind: 'gleaner' }).filter(u => u.pos.distanceTo(ctx.player.pos) < 80), maxSec: 90, range: 40, min: 8, blade: true, teleportBeyond: 1e9 });
    g.log('floor 2 fight', r);
  }
  const fl3 = await ev(() => { const v = window.__game.ctx.world.resolve({ s: 1545, l: 4 }); return [v.x, v.z]; });
  await g.teleport([fl3[0], 67.6, fl3[1]]);
  r = await until(() => window.__ip.fired.has('t_stencil'), null, 4);
  g.assert(r.ok, 't_stencil on floor 3');
  await step(1.2, 6);
  await shot('43-z4-stencil', { hud: false });
  r = await until((ctx) => !ctx.cinematics.active && !ctx.player.frozen, null, 20);
  const crown = await ev(() => { const ctx = window.__game.ctx, v = ctx.world.resolve({ s: 1545 - 12, l: 6 + 123.5 * Math.tan(7 * Math.PI / 180) }); return [v.x, v.z]; });
  await g.teleport([crown[0], 124.2, crown[1]]);
  r = await until(() => window.__ip.fired.has('t_crown'), null, 4);
  g.assert(r.ok, 't_crown');
  r = await until((ctx) => ctx.cinematics.active, null, 3, 2);
  if (r.ok) { await step(3); await shot('44-z4-crown-reveal', { hud: false }); }
  r = await until((ctx) => ctx.mission.objective('o_heads')?.state === 'active' && !ctx.cinematics.active, null, 60);
  g.assert(r.ok, `the cut-line reveal plays out: o_heads (${r.t.toFixed(0)} s)`);
  g.log('rack at the crown', await ev(() => [...(window.__game.ctx.haul?.rack || [])]));
  // down to the cut-line field (a long descent and walk)
  const fd = await routePos(1700, 0);
  await g.teleport([fd[0], fd[2]]);
  r = await walkTo(1740, 0, 30, 1);
  r = await until((ctx) => ctx.mission.checkpoint === 'cp_cutline' && ctx.enemies.count({ kind: 'icebreaker' }) === 1, null, 10);
  g.assert(r.ok, 'cp_cutline reached, the Icebreaker');
  await zone('Z5 start');
  await noErrors('Z4');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z5 · the Icebreaker
  if (FROM <= 4) {
  await step(3);
  await shot('50-z5-icebreaker');
  // the two saws, then survive the crawl to the edge (a death sends the fight back to cp_cutline: take the saws again)
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const head of ['head_port', 'head_stbd']) {
      r = await fight({ targets: (ctx, L, tag) => ctx.combat.query({ tag }).filter(t => t.alive), arg: head, maxSec: 240, range: 110, min: 50, eye: 6 });
      g.log(`${head} fight`, r, await ev(() => ({ deaths: window.__ip.deaths, phase: window.__game.ctx.mission.flags['ib:phase'] })));
      if (!r.ok) { note(`Z5: ${head} still alive after 240 s of fire (${JSON.stringify(r)}); killed it`); await ev((h) => { const ctx = window.__game.ctx, t = ctx.combat.query({ tag: h })[0]; if (t?.alive) ctx.combat.kill(t, { team: 'player' }); }, head); }
      if (head === 'head_port' && attempt === 0) { await step(2); await shot('51-z5-phase2'); }
    }
    // the crawl: keep the deck turrets and the launched skiffs busy (they are what kills an idle frame here)
    r = await fight({ targets: (ctx) => ctx.enemies.alive({ team: 'enemy' }).filter(u => u.kind !== 'icebreaker' && u.pos.distanceTo(ctx.player.pos) < 260),
                      until: (ctx) => (ctx.mission.flags['ib:phase'] === 3 && ctx.mission.checkpoint === 'cp_harvest') || ctx.combat.query({ tag: 'head_port' }).some(t => t.alive),
                      maxSec: 180, range: 90, min: 30 });
    g.log('the crawl', r);
    if (await ev(() => window.__game.ctx.mission.checkpoint === 'cp_harvest')) break;
    note(`Z5: the saws came back (a death and a retry from cp_cutline), attempt ${attempt + 2}`);
  }
  r = await until((ctx) => ctx.mission.flags['ib:phase'] === 3 && ctx.mission.checkpoint === 'cp_harvest', null, 10);
  g.assert(r.ok, `phase 3 at the edge, cp_harvest reached (${r.t.toFixed(0)} s)`);
  await step(2);
  await shot('52-z5-harvest');
  // the bow auger's collar only takes hits from below: down onto the Raft
  r = await until((ctx) => ctx.l01.icebreaker?.boomLow >= 1, null, 10);
  for (let attempt = 0; attempt < 4 && !(await fired('t_finale')); attempt++) {
    // down onto the Raft below the collar (again after a retry, which respawns on the shelf)
    await ev(() => {
      const ctx = window.__game.ctx, F = ctx.l01.floes, h = ctx.combat.query({ tag: 'head_bow' })[0];
      if (!h) return;
      const i = F.nearestFloe(h.pos.x + 30, h.pos.z, true), f = F.field.floes[i];
      ctx.player.teleport(new ctx.player.pos.constructor(f.x, f.top + 0.3, f.z));
    });
    await step(0.5, 5);
    r = await fight({ targets: (ctx) => ctx.combat.query({ tag: 'head_bow' }).filter(t => t.alive), until: (ctx) => window.__ip.fired.has('t_finale') || ctx.player.pos.y > -10,
                      maxSec: 150, range: 120, min: 20, stand: true, eye: 5, teleportBeyond: 1e9 });
    g.log('bow fight', r);
    if (attempt > 0) note(`Z5: back onto the Raft after a retry (attempt ${attempt + 1})`);
  }
  if (!(await fired('t_finale'))) { note('Z5: the bow auger survived four attempts from the Raft; killed it'); await ev(() => { const ctx = window.__game.ctx, h = ctx.combat.query({ tag: 'head_bow' })[0]; if (h?.alive) ctx.combat.kill(h, { team: 'player' }); }); }
  r = await until(() => window.__ip.fired.has('t_finale'), null, 6);
  g.assert(r.ok, 't_finale: the Icebreaker beaten');
  // the sunrise, the split, the drowning (hands off: it plays itself)
  r = await until((ctx, L) => !!L.wall, null, 10, 5);
  await step(3);
  await shot('53-z5-sunrise');
  r = await until((ctx, L) => L.drown?.phase === 'B', null, 30, 5);
  g.assert(r.ok, 'the floe splits, the frame goes in');
  await until((ctx, L) => (L.drown?.t ?? 0) > 9, null, 12, 5);
  await shot('54-z5-underwater');
  r = await until((ctx) => ctx.comms.current?.text === 'Hold on to me.', null, 40, 3);
  g.assert(r.ok, '"Hold on to me." over black');
  await step(0.8, 4);
  await shot('55-z5-black', { settle: false });
  r = await until((ctx) => ctx.mission.objective('o_surface')?.state === 'active' && !ctx.player.frozen, null, 20);
  g.assert(r.ok, 'control returns underwater: o_surface "Rise to the light above you"');
  await g.input({ clear: true, hold: { jump: true } });
  r = await until((ctx) => ctx.mission.flags.surfaced, null, 25, 5);
  await g.input({ clear: true });
  g.assert(r.ok, `surfaced by holding JUMP (${r.t.toFixed(1)} s)`);
  r = await until((ctx) => ctx.mission.checkpoint === 'cp_floes', null, 8);
  g.assert(r.ok, 'cp_floes reached by playing');
  await zone('Z6 start');
  await noErrors('Z5');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ Z6 · the floes
  if (FROM <= 5) {
  await step(1.5);
  await shot('60-z6-floes');
  // sled 3 (Kit calls it out): hop there
  const sl = await ev(() => { const v = window.__game.ctx.l01.floes.sledPos(new window.__game.ctx.player.pos.constructor()); return v && [v.x, v.y, v.z]; });
  // hop along the validator's path (blue/shaded where it can), like a player reading the ice
  const hop = await ev(async () => {
    const G = window.__game, ctx = G.ctx, L = ctx.l01, F = L.floes, p = ctx.player, IP = window.__ip;
    const m = await import('/levels/level01/floes.js');
    const log = { hops: 0, falls: 0, teleports: 0, path: 0 };
    for (let round = 0; round < 6; round++) {
      const res = m.validateField(F.field, L.DATA, L.sunElev ?? 7);
      if (!res.ok) { log.invalid = (log.invalid || 0) + 1; break; }
      const here = F.floeAt(p.pos.x, p.pos.z);
      let path = res.path; const k = path.indexOf(here); if (k >= 0) path = path.slice(k + 1);
      path = path.filter(i => F.state[i] < 2);   // skip ice that has already sunk
      log.path = path.length;
      let fellOff = false;
      for (const i of path) {
        const f = F.field.floes[i], cr = m.colR(f);
        if (!f || F.state[i] >= 2) { fellOff = true; break; }
        let ok = false, boosts = 0;
        for (let s = 0; s < 8 * 60; s += 5) {
          if (ctx.flow.state !== 'playing') { await IP.tick(5); s += 2; continue; }
          const cur = F.floeAt(p.pos.x, p.pos.z), d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
          if (cur === i && Math.abs(p.pos.y - f.top) < 0.6 && p.onGround) { ok = true; break; }
          if (p.pos.y < (L.DATA.sea ?? -24) - 1) {   // in the water
            log.fails = log.fails || []; if (log.fails.length < 8) log.fails.push({ i, from: F.floeAt(p.pos.x, p.pos.z), gap: Math.round(d - cr), en: Math.round(p.en), stag: +(p.stagT || 0).toFixed(1), tow: !!p.tow,
              lat: L.latchCount?.() ?? 0, ist: F.state[i], t: +ctx.clock.time.toFixed(1), x: Math.round(p.pos.x), z: Math.round(p.pos.z) });
            break;
          }
          p.yaw = Math.atan2(-(f.x - p.pos.x), -(f.z - p.pos.z)); p.pitch = -0.1;
          G.input.clear();
          // read the ice: on blue (shaded) ice that holds, let EN recover before the next jump
          if (p.onGround && cur >= 0 && cur !== i && F.shaded[cur] && F.state[cur] === 0 && p.en < 850) { await IP.tick(5); continue; }
          if ((L.latchCount?.() ?? 0) > 0 && p.en > 200 && (s % 30) === 0) G.input.press('boost');   // shake latched Gleaners off
          G.input.move(0, 1);
          const gap = d - cr, cf = cur >= 0 ? F.field.floes[cur] : null;
          const edge = cf ? Math.hypot(cf.x - p.pos.x, cf.z - p.pos.z) > m.colR(cf) - 1.5 : false;   // off the floe field (the Raft): run up first
          // a running jump from the very edge clears about 22 m; quick boost at takeoff only for longer gaps; hover only
          // when about to land short (hover costs double on iced vents)
          if (p.onGround && cur !== i && (gap < 8 || edge)) G.input.press('jump');
          else if (!p.onGround && gap > 1) {
            if (p.en > 260 && gap > 20 && boosts < 1 && p.vel.y > 0) { G.input.press('boost'); boosts++; }
            else if (p.vel.y < 0 && p.pos.y < f.top + 3 && p.en > 40) G.input.hold('jump', true);
          }
          if (p.tow && p.en >= 60) G.input.press('boost');   // snap a harpoon cable
          await IP.tick(5);
        }
        if (!ok) { fellOff = true; break; }
        log.hops++;
        if (p.pos.x > 1290) break;
      }
      if (p.pos.x > 1290 || ctx.mission.flags['p:shore']) break;
      if (fellOff) log.falls++;
      if (ctx.flow.state === 'playing' && p.pos.y < (L.DATA.sea ?? -24) + 1) {   // in the water: back onto the nearest floe
        const i = F.nearestFloe(p.pos.x, p.pos.z, true), f = F.field.floes[i];
        p.teleport(new p.pos.constructor(f.x, f.top + 0.5, f.z)); log.teleports++;
      }
    }
    G.input.clear();
    return { ...log, x: p.pos.x, y: p.pos.y, s: ctx.world.route.closest(p.pos.x, p.pos.z).s };
  });
  g.log('floe hops', hop, { sled3: sl });
  if (hop.teleports) note(`Z6: fell in the water ${hop.teleports}× while hopping the floes (teleported back onto a floe)`);
  await zone('Z6 after the hop');
  const crossed = await ev(() => { const p = window.__game.ctx.player; return [p.pos.x, p.pos.y, p.pos.z]; });
  if (sl && !(await ev(() => window.__game.ctx.mission.flags.sled3))) {
    note('Z6: sled 3 is off the hop path; teleported to it and back');
    await g.teleport([sl[0] - 5, sl[1] + 0.4, sl[2] + 2]);
    await until(() => window.__ip.fired.has('t_sled3'), null, 4);   // Kit calls it out and the sledge opens
    await g.input({ clear: true, hold: { interact: true } });
    r = await until((ctx) => ctx.mission.flags.sled3, null, 4, 5);
    await g.input({ clear: true });
    g.log('sled 3', r);
    await g.teleport([crossed[0], crossed[1] + 0.4, crossed[2]]);
  }
  await shot('61-z6-sprint');
  const shore = await ev(() => window.__game.ctx.mission.flags['p:shore']);
  if (!shore) {
    // from the last floe onto the fast ice and up to the shore (hop the last gap if there is one)
    r = await ev(async () => { const IP = window.__ip, G = window.__game, ctx = G.ctx, p = ctx.player, goal = ctx.world.resolve({ s: 3140, l: 10 });
      for (let k = 0; k < 60 * 6 && !ctx.mission.flags['p:shore']; k++) {
        if (ctx.flow.state === 'playing' && !p.frozen) {
          p.yaw = Math.atan2(-(goal.x - p.pos.x), -(goal.z - p.pos.z)); G.input.clear(); G.input.move(0, 1);
          if (p.onGround && (k % 12) === 0) G.input.press('jump'); else if (!p.onGround && p.vel.y < 0 && p.en > 150) G.input.hold('jump', true);
        }
        await IP.tick(10);
      }
      G.input.clear();
      return { ok: !!ctx.mission.flags['p:shore'], s: ctx.world.route.closest(p.pos.x, p.pos.z).s, y: p.pos.y };
    });
    g.log('onto the fast ice', r);
    if (!r.ok) { note(`Z6: could not reach the shore from the last floe (${JSON.stringify(r)}); teleported`); const fi = await routePos(3140, 10); await g.teleport([fi[0], fi[2]]); }
  }
  r = await until((ctx) => ctx.mission.flags['p:shore'], null, 10);
  g.assert(r.ok, 'the shore');
  await zone('Z7 start');
  await noErrors('Z6');

  // ════════════════════════════════════════════════════════════════════════════════════════ Z7 · the shore, the naming
  r = await until((ctx) => ctx.player.animOverride?.crouch === 1, null, 40);
  g.assert(r.ok, 'the shore kneel');
  await step(3);
  await shot('70-z7-kneel', { hud: false });
  r = await until((ctx) => ctx.mission.objective('o_bench')?.state === 'active' && !ctx.player.frozen, null, 60);
  g.assert(r.ok, 'o_bench: "Walk to the Bench, under the work lamp"');
  await step(1.5);
  await shot('71-z7-shore');
  r = await ev(async () => { const IP = window.__ip, ctx = window.__game.ctx, p = ctx.player, goal = ctx.world.resolve({ s: 3282, l: 20 });
    for (let k = 0; k < 90 * 6 && !IP.fired.has('t_bench'); k++) {
      if (ctx.flow.state === 'playing' && !p.frozen) { p.yaw = Math.atan2(-(goal.x - p.pos.x), -(goal.z - p.pos.z)); window.__game.input.clear(); window.__game.input.move(0, 1); }
      await IP.tick(10);
    }
    window.__game.input.clear();
    return { ok: IP.fired.has('t_bench') };
  });
  g.assert(r.ok, 'walked up the beach to the Bench: the naming starts (t_bench)');
  r = await until((ctx) => window.__ip.lines.some(l => /I'm calling it Moth/.test(l.text)), null, 60, 5);
  g.assert(r.ok, 'the naming');
  await step(1.2, 4);
  await shot('72-z7-naming', { hud: false, settle: false });
  const named = await ev(() => document.getElementById('frameName')?.textContent);
  g.log('frame tag after the naming', named);
  r = await until((ctx) => ctx.flow.state === 'debrief', null, 90);
  g.assert(r.ok, 'the level completes: debrief');
  await noErrors('Z7');

  }
  // ════════════════════════════════════════════════════════════════════════════════════════ debrief, Bench, Count
  const db = await ev(() => document.getElementById('screen').innerText);
  g.log('debrief', db.replace(/\s+/g, ' ').slice(0, 500));
  const flags = await ev(() => window.__game.ctx.mission.flags);
  const nSled = ['sled1', 'sled2', 'sled3'].filter(k => flags[k]).length;
  g.assert(new RegExp(`${nSled}\\s*/\\s*3`).test(db), `debrief: sledges ${nSled} / 3`);
  await shot('80-debrief', { settle: false });
  await click('#screen #bA0');
  g.assert(await waitFlow('bench', 30000), 'TO THE BENCH → the Bench');
  await new Promise(r => setTimeout(r, 1500));
  await shot('81-bench', { settle: false });
  const b0 = await ev(() => window.__game.ctx.garage.bench.state());
  g.log('bench', { parts: b0.parts, fitted: b0.fitted, water: b0.water });
  // Fit: click a haul part's card
  const fitSel = await ev(() => { const el = [...document.querySelectorAll('[data-fit]')].find(b => !b.classList.contains('on') && b.getAttribute('aria-disabled') !== 'true' && !/STOCK/.test(b.textContent)); return el ? el.dataset.fit : null; });
  if (fitSel) { await g.page.click(`[data-fit="${fitSel}"]`); await new Promise(r => setTimeout(r, 400)); }
  const b1 = await ev(() => window.__game.ctx.garage.bench.state());
  if (fitSel) g.assert(Object.values(b1.fitted).includes(fitSel.split(':')[1]), `Fit by click: ${fitSel}`);
  // Give: the HAUL tab, give one, undo, give again
  await g.page.click('[data-btab="HAUL"]'); await new Promise(r => setTimeout(r, 300));
  const w0 = (await ev(() => window.__game.ctx.garage.bench.state())).water;
  let gave = 0;
  if (await ev(() => !!document.querySelector('[data-give]'))) {
    await g.page.click('[data-give] >> nth=0'); await new Promise(r => setTimeout(r, 300));
    const w1 = (await ev(() => window.__game.ctx.garage.bench.state())).water;
    await g.page.click('#bUndo'); await new Promise(r => setTimeout(r, 300));
    const w2 = (await ev(() => window.__game.ctx.garage.bench.state())).water;
    await g.page.click('[data-give] >> nth=0'); await new Promise(r => setTimeout(r, 300));
    const w3 = (await ev(() => window.__game.ctx.garage.bench.state())).water;
    g.assert(w1 === w0 + 1 && w2 === w0 && w3 === w0 + 1, `Give, Undo, Give by click (${w0} → ${w1} → ${w2} → ${w3})`);
    gave = 1;
  } else note('Bench: nothing to give');
  await shot('82-bench-haul', { settle: false });
  await g.page.click('[data-btab="WAKE"]'); await new Promise(r => setTimeout(r, 300));
  await shot('83-bench-wake', { settle: false });
  await g.page.click('[data-btab="LATTICE"]'); await new Promise(r => setTimeout(r, 300));
  await g.page.click('#bWalk'); await new Promise(r => setTimeout(r, 300));
  await g.page.click('#bYes');
  g.assert(await waitFlow('count', 60000), 'Walk on → the Morning Count');
  await new Promise(r => setTimeout(r, 1500));
  const cnt = await ev(() => document.getElementById('screen').innerText);
  const camp = await ev(() => window.__game.ctx.save.getFlag('campaign'));
  g.log('count', { text: cnt.replace(/\s+/g, ' ').slice(0, 300), water: camp.water, day: camp.day });
  g.assert(camp.water === 4 + nSled + gave - 3 && camp.day === 1, `the Count's water: 4 + ${nSled} + ${gave} − 3 = ${camp.water}`);
  await shot('84-morning-count', { settle: false });
  await click('#screen #bWalk');
  g.assert(await waitFlow('title', 60000), 'after the Count: the title');
  await new Promise(r => setTimeout(r, 1000));
  await shot('85-title-after', { settle: false });
  await noErrors('the end');

  // ════════════════════════════════════════════════════════════════════════════════════════ clarity and spoilers
  const clar = await ev(() => {
    const IP = window.__ip, first = {};
    for (const l of IP.lines) if (!(l.who in first)) first[l.who] = l;
    return { spoil: IP.spoil, deaths: IP.deaths, obj: IP.obj, cards: IP.cards.map(c => c.id), first, fired: IP.fired.size };
  });
  g.log('objective texts', clar.obj.map(o => `${o.id}: ${o.text}`));
  g.log('explainer cards in order', clar.cards);
  g.log('first line per speaker', Object.values(clar.first).map(l => `${l.who} [${l.tag ?? '-'}] ${l.text}`));
  g.assert(clar.spoil.length === 0, `no visible "Moth" before the naming (${JSON.stringify(clar.spoil.slice(0, 3))})`);
  const untagged = Object.values(clar.first).filter(l => !l.tag && l.name);
  g.log('speakers without a tag on their first line', untagged.map(l => l.who));
  g.log('deaths in the run', clar.deaths);

  // ════════════════════════════════════════════════════════════════════════════════════════ leak check
  if (LEAK) {
    const mem = () => ev(() => { const r = window.__game.ctx.renderer.info; return { geo: r.memory.geometries, tex: r.memory.textures, prog: r.programs?.length ?? 0 }; });
    const m0 = await mem();
    const cycle = async (i) => {
      await click('#bSelect');
      await g.page.waitForSelector('#screen [data-id="l01"], #screen button', { timeout: 20000 });
      const ok = await ev(() => { const b = document.querySelector('#screen [data-id="l01"]') || [...document.querySelectorAll('#screen button')].find(b => /THAW/i.test(b.textContent)); if (b) { b.click(); return true; } return false; });
      g.assert(ok, `level select lists THAW (cycle ${i})`);
      g.assert(await waitFlow('briefing', 20000), `level select → briefing (cycle ${i})`);
      await click('#bStart');
      g.assert(await waitFlow('playing', 240000), `l01 loads again (cycle ${i})`);
      await ev(() => window.__game.step(120));
      await g.page.keyboard.press('Escape'); await ev(() => window.__game.step(1));
      await click('#screen #bQuit');
      g.assert(await waitFlow('title', 30000), `Esc → Quit to title (cycle ${i})`);
      await new Promise(r => setTimeout(r, 1500));
      return mem();
    };
    const m1 = await cycle(1), m2 = await cycle(2);
    g.log('leak check (title after the run, after reload 1, after reload 2)', { m0, m1, m2 });
    const within = (a, b) => Math.abs(a - b) <= Math.max(2, 0.1 * Math.max(a, b));
    g.assert(within(m1.geo, m2.geo) && within(m1.tex, m2.tex) && within(m1.prog, m2.prog),
             `l01 → title → l01 → title: geometries ${m1.geo}/${m2.geo}, textures ${m1.tex}/${m2.tex}, programs ${m1.prog}/${m2.prog} within 10 %`);
    await noErrors('leak cycles');
  }
  g.log('shortcuts taken', notes);
  g.log(`total ${since()}`);
}
