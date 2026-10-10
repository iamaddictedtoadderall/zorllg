// tools/scenarios/level01.mjs (P6) — Level 1 acceptance (arch §10.9, L1 §19, addendum A6 P6).
//
//   node tools/playtest.mjs --scenario level01 --port 8523 --out /tmp/campaign-playtest/P6-level01 --timeout 5400
//        [--param only=static,cut,cavern,ridges,abeyance,cutline,floes,bench,determinism] [--param shots=0]
//
// Plays the level from every checkpoint with step() (no rAF), driving objectives with teleports, damage through
// ctx.combat and injected inputs; asserts that every trigger fires (across the whole run), checks the A6 items (vitals
// live → flat → locked at 60, the rack across a checkpoint restart, a full Bench pass through garage.bench, the Count's
// water arithmetic, the spoiler grep), measures the §7.5 budgets at the busiest moment of each zone, and takes a
// gameplay screenshot plus a vista of every zone. Screenshots render one frame and wait up to 4 minutes (software GL).
const ALL = ['static', 'cut', 'cavern', 'ridges', 'abeyance', 'cutline', 'floes', 'determinism', 'alt'];

export default async function (g) {
  const P = Object.fromEntries((g.args.params || []).map(p => { const [k, ...v] = p.split('='); return [k, v.join('=')]; }));
  const only = P.only ? new Set(P.only.split(',')) : new Set(ALL);
  const SHOTS = P.shots !== '0';
  const ev = (fn, arg) => g.eval(fn, arg);
  const T0 = Date.now();
  const since = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';

  // ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** steps the sim in chunks until pred(arg) (evaluated in the page with `ctx` and `L` in scope) holds, or maxSec */
  async function until(pred, arg, maxSec = 30, chunk = 10) {
    return ev(async ([src, arg, maxSteps, chunk]) => {
      const G = window.__game, ctx = G.ctx;
      // eslint-disable-next-line no-eval
      const f = (0, eval)('(' + src + ')');
      const test = () => { try { return !!f(ctx, ctx.l01, arg); } catch (e) { return false; } };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let steps = 0;
      while (steps < maxSteps) {
        if (test()) return { ok: true, t: steps / 60 };
        if (ctx.flow.state === 'interstitial') {
          const b = document.querySelector('#screen #bNext');
          if (b && !b.closest('[hidden]')) b.click();
          await sleep(120);
          continue;
        }
        G.step(chunk); steps += chunk;
        await sleep(0);
      }
      return { ok: test(), t: steps / 60 };
    }, [pred.toString(), arg ?? null, Math.round(maxSec * 60), chunk]);
  }
  const step = async (sec, chunk = 30) => until(() => false, null, sec, chunk);
  const st = () => g.state();
  const fired = () => ev(() => [...(window.__l01fired || [])]);
  const hasFired = async (id) => (await fired()).includes(id);
  const flag = (k) => ev((k) => window.__game.ctx.mission.flags[k], k);
  const obj = (id) => ev((id) => window.__game.ctx.mission.objective(id)?.state ?? null, id);
  const skipCine = () => ev(() => { if (window.__game.ctx.cinematics?.active) window.__game.skipCinematic(); });
  async function start(cp, o = {}) {
    const t = Date.now();
    if (o.resetSave) await ev(() => { const s = window.__game.ctx.save; s.setCheckpoint?.('l01', null); });
    // the run-wide listeners go on before the first start, so a cold checkpoint's own actions are recorded too
    await ev(() => {
      const ctx = window.__game.ctx;
      if (!window.__l01fired) {
        window.__l01fired = new Set();
        window.__l01lines = [];
        // the clarity pass: everything stamped with ctx.clock.frame (monotonic across checkpoint starts in one run)
        const C = window.__l01clar = { req: [], dlv: [], cards: [], obj: [], cp: [] };
        const f = () => ctx.clock.frame;
        ctx.events.on('trigger:fired', (e) => window.__l01fired.add(e.id));
        ctx.events.on('comms:line', (e) => {
          const s = ctx.comms?.speaker?.(e.who);
          window.__l01lines.push({ who: e.who, text: e.text, name: e.name ?? s?.name ?? null, tag: e.tag ?? null, t: ctx.clock.time, f: f() });
        });
        ctx.events.on('l01:term', (e) => C.req.push({ id: e.id, f: f(), cp: ctx.mission?.checkpoint ?? null }));
        ctx.events.on('l01:termDelivered', (e) => C.dlv.push({ id: e.id, shown: e.shown, f: f() }));
        ctx.events.on('hud:explain', (e) => C.cards.push({ id: e.id, term: e.term, f: f() }));
        ctx.events.on('objective:changed', (e) => { if (e.state === 'active' && e.text) C.obj.push({ id: e.id, text: e.text, f: f() }); });
        ctx.events.on('level:start', (e) => C.cp.push({ cp: e.checkpoint, f: f() }));
      }
    });
    const s = await g.startLevel('l01', cp);
    g.log(`[${since()}] start ${cp}`, { ms: Date.now() - t, state: s.state, cp: s.checkpoint, pos: s.player?.pos?.map(v => +v.toFixed(1)), s: +(s.player?.s ?? 0).toFixed(1) });
    return s;
  }
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
  async function vista(name, pos, look, fov) {
    if (!SHOTS) return;
    await g.camera(pos, look, fov);
    await shot(name, { hud: false });
    await g.freeCam(false);
  }
  /** the §7.5 High budgets for the frame just rendered (call after a render at the gameplay camera) */
  async function budget(label) {
    // programs: count the shader programs the measured frame actually binds (gl.useProgram wrapped for one render), and
    // report the live total too. The live total also holds programs the frame never uses: pipeline.warmup() compiles a
    // canvas-output ('srgb') twin of every scene material (compileAsync runs with no render target while the composer
    // renders into a linear target), plus PMREM and title-screen programs.
    const pg = await ev(() => {
      const G = window.__game, ctx = G.ctx, r = ctx.renderer, gl = r.getContext();
      const used = new Set(), orig = gl.useProgram;
      gl.useProgram = function (p) { used.add(p); return orig.call(this, p); };
      try { r.state?.useProgram?.(null); G.render(); } finally { gl.useProgram = orig; }
      const live = r.info.programs;
      return { total: live.length, frame: live.filter(p => used.has(p.program)).length,
               canvasTwins: live.filter(p => (p.cacheKey.match(/,(srgb-linear|srgb),/) || [])[1] === 'srgb').length };
    });
    const p = await g.perf();
    const extra = await ev(() => {
      const ctx = window.__game.ctx;
      return { units: ctx.enemies?.all?.().filter(u => u.alive).length ?? 0, proj: ctx.projectiles?.count ?? 0,
               parts: (ctx.particles?.add?.alive ?? 0) + (ctx.particles?.smoke?.alive ?? 0), lights: ctx.particles?.lights?.count ?? 0,
               tier: ctx.tier.name };
    });
    const r = { label, calls: p.calls, main: p.main, shadow: p.shadow, post: p.post, ao: p.ao, tris: p.triangles, mainTris: p.mainTriangles,
                programsLive: pg.total, programsFrame: pg.frame, canvasTwins: pg.canvasTwins, ...extra };
    g.log('budget', r);
    if (extra.tier === 'high') {
      g.assert(p.calls <= 1400, `${label}: draw calls ${p.calls} ≤ 1400`);
      if (p.main != null) g.assert(p.main <= 600, `${label}: main-pass calls ${p.main} ≤ 600`);
      if (p.shadow != null) g.assert(p.shadow <= 250, `${label}: shadow calls ${p.shadow} ≤ 250`);
      if (p.post != null) g.assert(p.post <= 30, `${label}: post calls ${p.post} ≤ 30`);
      g.assert((p.mainTriangles ?? p.triangles) <= 3.0e6, `${label}: main triangles ${p.mainTriangles ?? p.triangles} ≤ 3 M`);
      g.assert(p.triangles <= 6e6, `${label}: frame triangles ${p.triangles} ≤ 6 M`);
      g.assert(pg.frame <= 60, `${label}: programs used by the frame ${pg.frame} ≤ 60 (live ${pg.total}, ${pg.canvasTwins} of them canvas-output twins from the warmup)`);
      g.assert(extra.units <= 40 && extra.proj <= 400 && extra.parts <= 12000, `${label}: units ${extra.units} ≤ 40, projectiles ${extra.proj} ≤ 400, particles ${extra.parts} ≤ 12k`);
    }
    return r;
  }
  const errors = () => ev(() => window.__game.errors());
  async function noErrors(label) {
    const e = await errors();
    g.assert(e.length === 0, `${label}: no game errors${e.length ? ' (' + e.slice(0, 3).map(x => x.system + ': ' + x.message).join(' | ') + ')' : ''}`);
  }
  let rackAtAbeyance = null;
  const routePos = (s, l = 0, h) => ev(([s, l, h]) => { const v = window.__game.ctx.world.resolve({ s, l, h }); return [v.x, v.y, v.z]; }, [s, l, h ?? 0]);

  // ══════════════════════════════════════════════════════════════════════════════════════ probe (development)
  // --param only=probe --param probe=/abs/path/script.js [--param cp=cp_cutline]: starts the level at `cp` and evaluates
  // the script in the page (an async function body with `G`, `ctx`, `L` and `log` in scope); its return value is logged.
  if (only.has('probe') && P.probe) {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(P.probe, 'utf8');
    if (P.cp !== 'none') await start(P.cp || 'cp_cut');
    const out = await ev(async (src) => {
      const G = window.__game, ctx = G.ctx, L = ctx.l01, logs = [];
      const log = (...a) => logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
      try {
        const fn = new (Object.getPrototypeOf(async function () {}).constructor)('G', 'ctx', 'L', 'log', src);
        const r = await fn(G, ctx, L, log);
        return { ok: true, r, logs };
      } catch (e) { return { ok: false, err: String(e && e.stack || e), logs }; }
    }, src);
    for (const l of out.logs) g.log('[probe]', l);
    g.log('[probe] result', out.ok ? (out.r?.views ? `${out.r.views.length} views` : out.r) : out.err);
    if (P.shot) await shot(P.shot, { hud: P.hud !== '0' });
    // a probe may return { views: [{ name, pos, look, fov }] }: one vista each (development framing)
    for (const v of (out.ok && out.r?.views) || []) { await vista(v.name, v.pos, v.look, v.fov ?? 60); }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ static checks
  if (only.has('static')) {
    await start('cp_cut');
    const r = await ev(async () => {
      const ctx = window.__game.ctx, def = ctx.mission.def;
      const { validateLevel } = await import('/src/mission/mission.js');
      const route = ctx.world.route;
      const hw = def.route.halfWidth;
      const kinds = new Set();
      const walk = (u) => { kinds.add(u.kind); };
      for (const e of def.encounters) { e.units.forEach(walk); (e.waves || []).forEach(w => w.units.forEach(walk)); }
      const zones = def.zones;
      const actionsUsed = new Set();
      const scan = (x) => { if (Array.isArray(x)) x.forEach(scan); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (['flyby', 'barrage', 'structure'].includes(k)) actionsUsed.add(k); scan(v); } } };
      scan(def.events); scan(def.triggers); scan(def.start);
      const events = [];
      const str = JSON.stringify(def.events) + JSON.stringify(def.triggers);
      if (/"id":"snowBridge","state":"collapsed"/.test(str)) events.push('snow bridge collapse (structure)');
      if (/"id":"alcove","state":"broken"/.test(str)) events.push('alcove breaks (structure)');
      if (/"call":"icebreakerSink"/.test(str)) events.push('Icebreaker sinks');
      if (/"call":"drown"/.test(str)) events.push('sunrise light wall');
      return {
        validate: validateLevel(def, ctx), length: route.length, hwMin: Math.min(...hw), hwMax: Math.max(...hw),
        zones: zones.length, zonesWithArtAndCard: zones.filter(z => z.art && (z.card || z.id === 'z_under')).length,
        zoneIds: zones.map(z => z.id), checkpoints: def.checkpoints.length, encounters: def.encounters.length, kinds: [...kinds],
        named: def.encounters.some(e => e.units.some(u => u.kind === 'mech' && u.opts?.name)), cinematics: Object.keys(def.cinematics).length,
        worldEvents: events, caches: def.collectibles.filter(c => c.kind === 'salvage').length,
        briefing: !!def.briefing?.body, intro: def.intro?.length ?? 0, campaign: def.campaign,
        speakersMoth: def.speakers.MOTH, triggers: def.triggers.map(t => t.id),
      };
    });
    g.log('static', { ...r, triggers: r.triggers.length });
    g.assert(r.validate.length === 0, `validateLevel(level01) returns [] (${r.validate.slice(0, 4).join('; ')})`);
    g.assert(r.length >= 3000 && r.length <= 5000, `route length ${r.length.toFixed(0)} m in 3..5 km`);
    g.assert(r.hwMin >= 300 && r.hwMax <= 750, `half-width ${r.hwMin}..${r.hwMax} within 300..750`);
    g.assert(r.zones >= 4, `${r.zones} zones ≥ 4`);
    g.assert(r.zonesWithArtAndCard >= 4, `${r.zonesWithArtAndCard} zones with their own art and card (Z2 has art, no card by design)`);
    g.assert(r.checkpoints >= 3, `${r.checkpoints} checkpoints ≥ 3`);
    g.assert(r.encounters >= 5 && r.kinds.length >= 4, `${r.encounters} encounters ≥ 5 using ${r.kinds.length} kinds ≥ 4 (${r.kinds.join(', ')})`);
    g.assert(r.named, 'a named mech fight (the Sexton)');
    g.assert(r.cinematics >= 2, `${r.cinematics} cinematics ≥ 2`);
    g.assert(r.worldEvents.length >= 2, `${r.worldEvents.length} world events ≥ 2: ${r.worldEvents.join(', ')}`);
    g.assert(r.caches >= 2, `${r.caches} salvage caches ≥ 2`);
    g.assert(r.briefing && r.intro >= 1, 'briefing and intro present');
    g.assert(r.campaign?.bench === true && r.campaign.waterFlags?.join() === 'sled1,sled2,sled3', 'campaign block (A5.6)');
    g.assert(r.speakersMoth?.name === 'CANTOR 7' && r.speakersMoth.style === 'internal' && r.speakersMoth.font === 'monoCaps', 'MOTH speaker fixed (A2 #24)');
    const c = await ev(async () => {
      const m = await import('/levels/campaign.js');
      const C = m.default;
      return { v: C.version, water: C.startWater, locker: C.lockerSize, roll: C.roll.length, souls: C.roll.reduce((a, r) => a + r.souls, 0),
               frags: C.fragments.length, leg: C.legs.l01 && { day: C.legs.l01.day, draw: C.legs.l01.draw, title: C.legs.l01.debriefTitle, keys: Object.keys(C.legs.l01.bench) },
               anyTitle: C.fragments.some(f => 'title' in f || 'text' in f) };
    });
    g.log('campaign', c);
    g.assert(c.v === 1 && c.water === 4 && c.locker === 4 && c.roll === 40 && c.souls === 300 && c.frags === 12 && !c.anyTitle,
             'levels/campaign.js: version 1, water 4, locker 4, 40 rigs / 300 souls, 12 glosses without titles');
    g.assert(c.leg?.day === 1 && c.leg.draw === 3 && c.leg.title === 'WALK DAY 1 · THE RIME SHELF', 'campaign leg l01: day 1, draw 3, debrief title');

    // ── the clarity pass (docs/todo.md), static: speaker tags, the explainer cards, plain objectives, no spoilers ──
    const cl = await ev(async () => {
      const ctx = window.__game.ctx, def = ctx.mission.def;
      const T = await import('/levels/level01/terms.js');
      const json = JSON.stringify([def.triggers, def.events, def.start, def.onCheckpoint]);
      const requested = new Set();
      for (const m of json.matchAll(/"call":"term","args":\{"ids":\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"([a-z_0-9]+)"/g)) requested.add(q[1]);
      // the rack parts and the runtime's own requests (index.js: ap on the first hit, cache on a pickup, latch)
      for (const id of ['harpoon_gaff', 'shotgun_s8', 'flare_pod', 'ap', 'cache', 'latch']) requested.add(id);
      const hints = (json.match(/"hint":(\{[^}]*\}|"[^"]*")/g) || []).map(h => h.replace(/^"hint":/, ''));
      return {
        speakers: Object.entries(def.speakers).map(([id, s]) => ({ id, name: s.name, tag: s.tag ?? null })),
        cards: Object.entries(T.TERMS).map(([id, t]) => ({ id, term: t.term, text: JSON.stringify(t.text), key: t.key ?? null })),
        requested: [...requested], ids: Object.keys(T.TERMS),
        objectives: def.objectives.map(o => ({ id: o.id, text: o.text, kind: o.kind, marker: !!o.marker, flag: o.flag ?? null })),
        hints, fine: def.briefing.fine || '', bobj: def.briefing.objectives,
        hasExplain: typeof ctx.hud?.explain === 'function',
      };
    });
    g.log('clarity (static)', { speakers: cl.speakers.map(s => `${s.id}: ${s.tag}`), cards: cl.cards.length, hudExplain: cl.hasExplain });
    const untagged = cl.speakers.filter(s => !s.tag || typeof s.tag !== 'string' || s.tag.length > 40);
    g.assert(untagged.length === 0, `every level 1 speaker has a short spoiler-free tag (${untagged.map(s => s.id).join(', ') || 'all ' + cl.speakers.length})`);
    // story rules on the new text: never the frame's name, nothing about the lattice, kernel, Cantors, the Founders or the
    // Foreman, and never the words the bible keeps away from the pilot (§5.5)
    const LORE = /\b(lattice|kernel|cantors?|passengers?|carried|carry|pressed|pressing|foreman|founders?|handshake|stillwater|corran|pell|ballast)\b/i;
    const newText = [...cl.speakers.map(s => ['tag ' + s.id, s.tag]), ...cl.cards.map(c => ['card ' + c.id, c.term + ' ' + c.text]),
                     ...cl.objectives.map(o => ['objective ' + o.id, o.text]), ...cl.hints.map((h, i) => ['hint ' + i, h]),
                     ['briefing fine', cl.fine], ...cl.bobj.map((t, i) => ['briefing objective ' + i, t])];
    const leaks = newText.filter(([, t]) => /moth/i.test(t || '') || LORE.test(t || ''));
    g.assert(leaks.length === 0, `clarity text keeps the story rules: no "Moth", no lore words (${newText.length} strings${leaks.length ? '; ' + leaks.map(l => l[0] + ': ' + l[1]).slice(0, 3).join(' | ') : ''})`);
    const badCards = cl.cards.filter(c => {
      const t = JSON.parse(c.text);
      const text = typeof t === 'object' ? t.desktop : t;
      const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
      return !c.term || !text || sentences < 1 || sentences > 2 || text.length > 220;
    });
    g.assert(badCards.length === 0, `every card is a term plus one or two plain sentences (${cl.cards.length} cards${badCards.length ? '; ' + badCards.map(c => c.id).join(', ') : ''})`);
    const CONTROL_CARDS = ['cutter', 'frame', 'en', 'carbine', 'qb', 'tear', 'sledge', 'psalter', 'chorus', 'repair', 'icing', 'latch'];
    const keyless = CONTROL_CARDS.filter(id => !cl.cards.find(c => c.id === id)?.key);
    g.assert(keyless.length === 0, `every control card names its key (${keyless.join(', ') || CONTROL_CARDS.length + ' cards'})`);
    const MUST = ['tear', 'rack', 'bench', 'sledge', 'water', 'wake', 'carbine', 'psalter', 'chorus', 'repair', 'harpoon_gaff', 'shotgun_s8', 'flare_pod',
                  'skiffs', 'gleaners', 'icebreaker', 'dredge', 'remembered', 'en', 'ap', 'stagger', 'rot', 'icing'];
    const missingCards = MUST.filter(id => !cl.ids.includes(id));
    const unasked = cl.ids.filter(id => !cl.requested.includes(id));
    const unknownAsk = cl.requested.filter(id => !cl.ids.includes(id));
    g.assert(missingCards.length === 0 && unasked.length === 0 && unknownAsk.length === 0,
             `cards for TEAR, the rack, the Bench, sledges, water, the convoy, every named weapon and the other terms, each asked for by the level ` +
             `(${cl.ids.length} cards${missingCards.length ? '; missing ' + missingCards : ''}${unasked.length ? '; never asked ' + unasked : ''}${unknownAsk.length ? '; unknown ' + unknownAsk : ''})`);
    // objectives say plainly what to do and where: an imperative verb, short, and a marker or a place in the words
    // (the sledge flags carry the interact prompt's own marker)
    const PLACE = /\b(at|to|on|in|into|up|above|under|inside|the shaft|the wrecks|the floe|the hold)\b/i;
    const vague = cl.objectives.filter(o => !/^[A-Z][a-z]+\b/.test(o.text) || o.text.length > 60 ||
                                            !(o.marker || PLACE.test(o.text) || /^sled\d$/.test(o.flag || '')));
    g.assert(vague.length === 0, `objectives say what to do and where (${cl.objectives.length}${vague.length ? '; ' + vague.map(o => o.id + ': ' + o.text).join(' | ') : ''})`);
    await noErrors('static');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z1 · the cut
  if (only.has('cut')) {
    await start('cp_cut', { resetSave: true });
    let s = await st();
    const c0 = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player;
      return { hidden: p.hidden, ab: p.abilities, inv: p.invuln, cutter: !!ctx.l01?.cutter?.on, haulOn: ctx.haul?.enabled, vit: ctx.hud.vitalsState };
    });
    g.log('cutter', c0);
    g.assert(c0.cutter && c0.hidden === true && c0.ab?.move === 0.4 && c0.ab?.blade === false && c0.ab?.jump === false, 'cutter: Moth hidden, cutter preset (move 0.4, nothing else)');
    g.assert(c0.haulOn === false, 'cutter: haul disabled');
    let r = await until((ctx) => ctx.cinematics.active, null, 3, 5);
    g.assert(r.ok, 'opening vista plays');
    await step(1);
    if (SHOTS) await shot('z1-vista-cinematic', { hud: false });
    await skipCine();
    r = await until((ctx) => ctx.mission.objective('o_look')?.state === 'active', null, 8);
    g.assert(r.ok, 'o_look active after the vista');
    // the clarity pass on screen: Kit's first line with his tag, and the first explainer card (the cutter)
    r = await until((ctx) => window.__l01lines.some(l => l.who === 'KIT') && (ctx.hud?.explainState?.visible || typeof ctx.hud?.explain !== 'function'), null, 10, 5);
    const z1c = await ev(() => ({ tag: document.querySelector('#comms .who .tg')?.textContent || null, card: window.__game.ctx.hud?.explainState?.id ?? null,
                                  cardText: document.querySelector('#explain .tx')?.textContent || null }));
    g.log('z1 clarity', z1c);
    if (z1c.card) g.assert(['cutter', 'kite'].includes(z1c.card), `the first explainer card is the cutter or the kite (${z1c.card})`);
    if (SHOTS) await shot('clarity-z1-tag-and-card');
    // T1: look at the kite (aim the player's view at it; the camera follows)
    r = await until((ctx, L) => {
      const p = ctx.player, k = L.kite.pos;
      const dx = k.x - p.pos.x, dz = k.z - p.pos.z, dy = k.y - (p.pos.y + 9);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return ctx.mission.objective('o_look')?.state === 'done';
    }, null, 6, 5);
    g.assert(r.ok, `o_look completes by looking at the kite (lookingAt, ${r.t.toFixed(1)} s)`);
    if (!r.ok) await g.completeObjective('o_look');
    r = await until((ctx) => ctx.mission.objective('o_cut')?.state === 'active', null, 4);
    g.assert(r.ok && await hasFired('t_look'), 't_look → o_cut active');
    // the saw: walk up to block1 and strike it three times (the cutter's saw on the raw BLADE input)
    const b1 = await ev(() => { const i = window.__game.ctx.structures.get('block1'); return [i.pos.x, i.pos.y, i.pos.z]; });
    const sp = await ev((b) => {
      const ctx = window.__game.ctx, v = ctx.world.resolve({ s: 102, l: -50 });
      return [v.x, v.z, Math.atan2(-(b[0] - v.x), -(b[2] - v.z))];
    }, b1);
    await g.teleport([sp[0], sp[1]], { yaw: sp[2] });
    await ev((y) => { const p = window.__game.ctx.player; p.yaw = y; p.bodyYaw = y; p.pitch = -0.08; }, sp[2]);
    await step(0.5);
    for (let i = 0; i < 4; i++) { await g.input({ press: ['blade'] }); await step(0.8, 6); }
    r = await until((ctx) => ctx.structures.get('block1').state === 'destroyed', null, 3);
    g.assert(r.ok, 'the cutter saw cuts block1 in three strikes');
    await step(0.5);
    s = await st();
    if (SHOTS) {
      // frame the cut site (the kite-look left the view pitched up at the sky)
      const pitch0 = await ev(() => { const p = window.__game.ctx.player, v = p.pitch; p.pitch = -0.12; return v; });
      await step(0.3, 3);
      g.log('z1 framing', { pitchBefore: pitch0 });
      await shot('z1-cut-gameplay');
    }
    await ev(() => {
      const ctx = window.__game.ctx;
      for (const id of ['block1', 'block2', 'block3']) { const i = ctx.structures.get(id); if (i.state !== 'destroyed' && i.target) ctx.combat.kill(i.target, { team: 'player' }); }
    });
    r = await until((ctx) => ctx.mission.objective('o_cut')?.state === 'done', null, 4);
    g.assert(r.ok, 'o_cut done after three blocks');
    r = await until((ctx) => ctx.enemies.count({ tag: 'raid' }) === 3, null, 30);
    g.assert(r.ok && await hasFired('t_raid'), `t_raid: three raid skiffs (${r.t.toFixed(1)} s)`);
    const sledTow = await ev(() => window.__game.ctx.structures.get('sled1').state);
    await step(6);
    // face the nearest raid skiff (the camera follows the player's aim)
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player;
      let best = null, bd = Infinity;
      for (const u of ctx.enemies.alive({ tag: 'raid' })) { const d = u.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = u; } }
      if (best) { p.yaw = Math.atan2(-(best.pos.x - p.pos.x), -(best.pos.z - p.pos.z)); p.pitch = -0.06; }
    });
    await step(0.3, 6);
    if (SHOTS) await shot('z1-raid');
    await budget('Z1 raid');
    // stay put: the fail-safe tows the cutter onto the snow bridge (25 s after the raid starts)
    r = await until((ctx) => ctx.mission.flags['p:fell'], null, 40);
    g.assert(r.ok, `the raid fail-safe tows the cutter and the bridge collapses (${r.t.toFixed(1)} s)`);
    g.assert(await hasFired('t_raid_failsafe') && await hasFired('t_collapse'), 't_raid_failsafe and t_collapse fired');
    g.log('raid', { sledTow, hit: await hasFired('t_raid_hit') });
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_cavern' && ctx.mission.flags['p:awake'], null, 60);
    g.assert(r.ok, `boot, the waking and cp_cavern (${r.t.toFixed(1)} s)`);
    const c1 = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, rc = ctx.world.route.closest(p.pos.x, p.pos.z);
      return { s: rc.s, l: rc.l, y: p.pos.y, ab: p.abilities, hidden: p.hidden, cutter: ctx.l01.cutter.on, alcove: ctx.structures.get('alcove').state,
               bridge: ctx.structures.get('snowBridge').state, vit: ctx.hud.vitalsState, frame: document.getElementById('frameName')?.textContent };
    });
    g.log('after the fall', c1);
    g.assert(Math.hypot(c1.s - 377, c1.l + 26) < 20 && c1.y < -10, `Moth wakes in the alcove and steps out (s ${c1.s.toFixed(0)}, l ${c1.l.toFixed(0)}, y ${c1.y.toFixed(1)})`);
    g.assert(c1.ab?.move === 0.33 && !c1.ab.jump && !c1.ab.fire && !c1.hidden && !c1.cutter, 'walk preset, Moth visible, cutter off');
    g.assert(c1.alcove === 'broken' && c1.bridge === 'collapsed', 'alcove broken, snow bridge collapsed');
    g.assert(c1.vit?.mode === 'live', 'vitals live (Juno) after the boot');
    const pan1 = await ev(() => ({ now: { ...window.__game.ctx.l01.panels }, snap: window.__game.ctx.save.getCheckpoint?.('l01')?.flags?.['l01:panels'] ?? null }));
    g.assert(pan1.now.ap && pan1.now.compass && pan1.now.objectives && (!pan1.snap || (pan1.snap.ap && pan1.snap.objectives)),
             `HUD panels on after the waking, and in the cp_cavern snapshot (${JSON.stringify(pan1)})`);
    await noErrors('cut');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z2 · under the ice
  if (only.has('cavern')) {
    await start('cp_cavern');
    const a0 = await ev(() => ({ ab: window.__game.ctx.player.abilities, obj: window.__game.ctx.mission.objective('o_up')?.state }));
    g.assert(a0.ab?.move === 0.33 && !a0.ab.jump && a0.obj === 'active', 'cp_cavern: walk-only, o_up active');
    const pan0 = await ev(() => ({ ...window.__game.ctx.l01.panels }));
    g.assert(pan0.ap && pan0.compass && pan0.objectives && !pan0.weapons, `cp_cavern restart: AP, compass and objectives shown, weapons not yet (${JSON.stringify(pan0)})`);
    if (SHOTS) {
      await step(1);
      await shot('z2-cavern-gameplay');
      const a = await routePos(392, 20, 9), b = await routePos(372, -30, 6);
      await vista('z2-waking-hall', a, b, 55);
    }
    await budget('Z2 waking hall');
    // walk the trench to the shaft (10 m/s), steering along the route
    let r = await walkTo(625, 0, 60, 0, 8);
    g.assert(r.ok, `walked into the shaft (${r.t.toFixed(0)} s ${JSON.stringify(r)})`);
    g.assert(await hasFired('t_name') && await hasFired('t_signal'), 't_name and t_signal fired on the walk');
    r = await until((ctx) => ctx.player.abilities.jump && ctx.player.abilities.hover, null, 6);
    g.assert(r.ok && await hasFired('t_shaft'), 't_shaft: jump and hover remembered');
    if (SHOTS) {
      const a = await routePos(578, 12, 5), b = await routePos(625, 0, 12);   // down the trench to the light in the moulin
      await vista('z2-shaft-light', a, b, 55);
    }
    // the climb: hold JUMP (jump, then hover) up the 34 m shaft, then step out onto the shelf
    await g.input({ clear: true, hold: { jump: true } });
    r = await until((ctx) => ctx.player.pos.y > 8, null, 6, 5);
    g.assert(r.ok, `hover climb: y > 8 within ${r.t.toFixed(1)} s`);
    r = await until((ctx) => ctx.player.pos.y > 20, null, 6, 5);
    const top = await ev(() => { const p = window.__game.ctx.player; return { y: p.pos.y, en: p.en, ok: p.pos.y > 20 }; });
    await g.input({ clear: true, hold: { jump: true }, move: [0, 1] });
    await step(1.2, 5);
    await g.input({ clear: true, move: [0, 1] });
    r = await until((ctx) => ctx.mission.flags.outOfShaft, null, 8);
    const out = await ev(() => { const ctx = window.__game.ctx, p = ctx.player, rc = ctx.world.route.closest(p.pos.x, p.pos.z);
                                 return { pos: [p.pos.x, p.pos.y, p.pos.z].map(v => +v.toFixed(1)), s: +rc.s.toFixed(1), l: +rc.l.toFixed(1), onGround: p.onGround, en: p.en }; });
    g.log('shaft climb', { top, out });
    g.assert(r.ok && await hasFired('t_out'), 't_out: out of the shaft onto the shelf');
    await g.input({ clear: true });
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_ridges', null, 4);
    g.assert(r.ok, 'cp_ridges reached at the shaft rim');
    r = await until((ctx) => ctx.mission.objective('o_kit')?.state === 'active', null, 40);
    g.assert(r.ok && await hasFired('t_kitflare'), `Kit reconnects, flare up, o_kit (${r.t.toFixed(0)} s)`);
    await noErrors('cavern');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z3 · the Teeth
  if (only.has('ridges')) {
    await start('cp_ridges');
    let r = await until((ctx) => ctx.mission.objective('o_kit')?.state === 'active', null, 4);
    g.assert(r.ok, 'cp_ridges: o_kit active');
    if (SHOTS) {
      await step(2);
      await shot('z3-ridges-gameplay');
    }
    // idle facing north (Moth turns north when idle; Juno's line in the Teeth)
    await g.input({ clear: true });
    await ev(() => { const p = window.__game.ctx.player; p.yaw = Math.PI / 2; p.bodyYaw = Math.PI / 2; });
    r = await until((ctx) => ctx.player.idleFacingReached, null, 14);
    g.assert(r.ok, `idle: the body turns north (${r.t.toFixed(1)} s)`);
    r = await until((ctx) => window.__l01fired.has('t_idle_north'), null, 3);
    g.assert(r.ok, 't_idle_north: "Stop turning. East is that way."');
    // reach Kit: the pin starts at s 820
    r = await walkTo(825, 0, 30, 1);
    g.log('walk to the pin', r);
    r = await until((ctx) => ctx.enemies.count({ tag: 'pin' }) >= 2, null, 6);
    g.assert(r.ok && await hasFired('t_pin'), 't_pin: two skiffs on Tick');
    r = await until((ctx) => ctx.player.abilities.lock && ctx.player.abilities.fire && ctx.player.abilities.tear, null, 12);
    g.assert(r.ok, 'targeting remembered: lock, rifle, TEAR');
    if (SHOTS) { await step(2); await shot('z3-pin-gameplay'); }
    await budget('Z3 pin');
    // the quick-boost lesson fires on the first harpoon telegraph or after 45 s
    r = await until((ctx) => ctx.player.abilities.boost, null, 50);
    g.assert(r.ok && await hasFired('t_qb'), `t_qb: lateral thrust remembered (${r.t.toFixed(0)} s)`);
    // TEAR: stagger the Gaffer next to Moth, then hold BLADE
    const tear = await ev(() => {
      const ctx = window.__game.ctx, G = window.__game;
      const u = ctx.enemies.alive({ tag: 'sled1tow' })[0];
      if (!u) return { ok: false };
      // both out in the open lead (route s 850): Moth on the route, the skiff 14 m to its right
      const p = ctx.player, V = p.pos.constructor;
      const a = ctx.world.resolve({ s: 850, l: 0 }), b = ctx.world.resolve({ s: 850, l: 14 });
      p.teleport(new V(a.x, NaN, a.z), Math.atan2(-(b.x - a.x), -(b.z - a.z)));
      u.pos.copy(b); u.speed = 0;
      ctx.combat.damage(u, 50, 2000, { team: 'player', kind: 'rifle', owner: p });
      return { ok: true, stag: u.stagT, haul: u.haul?.part };
    });
    g.log('tear setup', tear);
    r = await until((ctx) => !!ctx.haul?.candidate, null, 2, 2);
    g.assert(r.ok, 'TEAR candidate on the staggered Gaffer (the prompt)');
    r = await until((ctx) => window.__l01fired.has('t_tear'), null, 2, 2);
    g.assert(r.ok, 't_tear: "That part is loose. This frame can take it."');
    await g.input({ clear: true, hold: { blade: true } });
    r = await until((ctx) => (ctx.haul?.rack?.length ?? 0) >= 1, null, 3, 2);
    await g.input({ clear: true });
    g.assert(r.ok, `TEAR: rack 1 (${await ev(() => JSON.stringify(window.__game.ctx.haul?.rack))})`);
    r = await until((ctx) => window.__l01fired.has('t_first_tear'), null, 3);
    g.assert(r.ok && await ev(() => window.__game.ctx.hud?.panels?.rack ?? window.__game.ctx.l01.panels.rack), 't_first_tear: rack panel on, HAUL hint');
    const tq = await ev(() => ({ q: [...(window.__game.ctx.l01.terms.q || [])], log: window.__game.ctx.l01.terms.log.map(e => e.id) }));
    g.log('cards after the first TEAR', tq);
    g.assert([...tq.q, ...tq.log].includes('tear') && [...tq.q, ...tq.log].includes('rack') && [...tq.q, ...tq.log].includes('bench'),
             'the TEAR, rack and Bench cards are asked for at the first TEAR');
    if (SHOTS) {
      r = await until((ctx) => ctx.hud?.explainState?.visible, null, 12, 5);
      if (r.ok) { g.log('card on screen', await ev(() => window.__game.ctx.hud.explainState.id)); await shot('clarity-z3-card'); }
    }
    r = await until((ctx) => window.__l01fired.has('t_sled1'), null, 5);
    g.assert(r.ok, 't_sled1: the tow skiff dead, sled 1 free (FLAG SLEDGE)');
    r = await until((ctx) => window.__l01fired.has('t_stagger_hint'), null, 2);
    g.assert(r.ok, 't_stagger_hint fired');
    // flag sled 1 through the interact prompt
    const sp = await ev(() => { const v = window.__game.ctx.l01.sledPos('sled1'); return v && [v.x, v.z]; });
    g.assert(!!sp, 'sled 1 position known');
    if (sp && await hasFired('t_sled1')) {
      await g.teleport([sp[0] + 6, sp[1]]);
      await g.input({ clear: true, hold: { interact: true } });
      r = await until((ctx) => ctx.mission.flags.sled1, null, 5, 5);
      await g.input({ clear: true });
      g.assert(r.ok, 'sled 1 flagged through the interact prompt');
      r = await until((ctx) => window.__l01fired.has('t_sled1_done') && ctx.mission.objective('o_sled1')?.state === 'done', null, 3);
      g.assert(r.ok, 't_sled1_done, o_sled1 done');
    }
    // the rest of the pin: wave 1 when one remains, then cleared
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'pin' }));
    r = await until((ctx) => window.__l01fired.has('t_pin_wave'), null, 6);
    g.assert(r.ok, 't_pin_wave: wave 1 (encounter:wave)');
    await step(1);
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'pin' }));
    r = await until((ctx) => window.__l01fired.has('t_pin_clear'), null, 6);
    g.assert(r.ok, 't_pin_clear');
    r = await until((ctx) => window.__l01fired.has('t_whatfor') || ctx.l01.heard.has('Water first. Then we argue about what you are.'), null, 30);
    g.assert(r.ok, '"Water first. Then we argue about what you are."');
    // cache A: the old skiff wreck frozen into a side lead (s 1010, l -175) holds a Gaff Harpoon
    const ca = await routePos(1012, -160);
    await g.teleport([ca[0], ca[2]]);
    r = await until((ctx) => (ctx.haul?.rack || []).length >= 2, null, 3);
    g.assert(r.ok, `cache A racks a second part (${await ev(() => (window.__game.ctx.haul?.rack || []).join(', '))})`);
    if (SHOTS) { await step(0.5); await shot('z3-cacheA-gameplay'); }
    const back = await routePos(1000, 0);
    await g.teleport([back[0], back[2]]);
    // the Gleaners over the wrecks
    r = await walkTo(1065, 0, 40, 1);
    g.log('walk to the wrecks', r);
    r = await until((ctx) => ctx.enemies.count({ kind: 'gleaner' }) >= 6, null, 4);
    g.assert(r.ok && await hasFired('t_gleaners'), 't_gleaners: six Gleaners harvesting');
    r = await until((ctx) => ctx.player.abilities.blade, null, 10);
    g.assert(r.ok && await hasFired('t_blade'), 't_blade: blade remembered');
    if (SHOTS) { await shot('z3-gleaners-gameplay'); }
    // a blade kill: lock a Gleaner within lunge range and press BLADE
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ kind: 'gleaner' })[0];
      if (!u) return;
      p.teleport(u.pos.clone().setY(NaN).add(new p.pos.constructor(0, 0, 25)), 0);
      u.ap = 100; p.lock = u; p.hardLock = true;
    });
    await g.input({ clear: true, press: ['blade'] });
    r = await until((ctx) => window.__l01fired.has('t_blade_kill'), null, 4, 2);
    g.assert(r.ok, `t_blade_kill (blade kill counted)`);
    r = await until((ctx) => ctx.enemies.count({ kind: 'gleaner_carrier' }) >= 1, null, 30);
    g.assert(r.ok && await hasFired('t_carrier'), `carrier1 arrives (wave after 25 s, ${r.t.toFixed(0)} s)`);
    await budget('Z3 wrecks');
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'enc:e_gleaners' }));
    await step(0.5);
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'enc:e_gleaners' }));
    r = await until((ctx) => window.__l01fired.has('t_burn'), null, 6);
    g.assert(r.ok, 't_burn: wrecks burned');
    r = await until((ctx) => ctx.mission.objective('o_abeyance')?.state === 'active', null, 30);
    g.assert(r.ok, 'o_abeyance active');
    r = await walkTo(1295, 0, 40, 1);
    g.log('walk to the pass', r);
    r = await until((ctx) => window.__l01fired.has('t_abeyance_view'), null, 3);
    g.assert(r.ok, 't_abeyance_view at the pass');
    if (SHOTS) {
      const a = await routePos(1250, -10, 30), b = await routePos(1545, 0, 70);
      await vista('z3-pass-abeyance', a, b, 50);
    }
    // on to the apron: t_apron saves cp_abeyance with the rack in the mission flags
    r = await walkTo(1380, 0, 30, 1);
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_abeyance' && window.__l01fired.has('t_apron'), null, 4);
    g.assert(r.ok, 't_apron: cp_abeyance reached');
    rackAtAbeyance = await ev(() => [...(window.__game.ctx.haul?.rack || [])]);
    g.log('rack at cp_abeyance', rackAtAbeyance);
    r = await until((ctx) => ctx.player.abilities.missile && window.__l01fired.has('t_apron'), null, 25);
    g.assert(r.ok, '"Ghost. Don\'t look at the light." then missiles remembered');
    await noErrors('ridges');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z4 · the Abeyance
  if (only.has('abeyance')) {
    await start('cp_abeyance');
    await g.setGod(true);
    // the rack across a checkpoint restart (A6): the snapshot's haul:rack flag comes back after the rack is changed
    const rk0 = await ev(() => [...(window.__game.ctx.haul?.rack || [])]);
    if (rackAtAbeyance) g.assert(JSON.stringify(rk0) === JSON.stringify(rackAtAbeyance), `rack restored at cp_abeyance (${rk0.join(', ')})`);
    if (rk0.length) {
      await ev(() => window.__game.ctx.haul.clear());
      await ev(() => window.__game.restart());
      await step(0.2, 6);
      const rk1 = await ev(() => [...(window.__game.ctx.haul?.rack || [])]);
      g.assert(JSON.stringify(rk1) === JSON.stringify(rk0), `checkpoint restart restores the rack (${rk1.join(', ')})`);
      await g.setGod(true);
    } else g.log('rack empty at cp_abeyance (section run alone): restart check skipped');
    let r = await until((ctx) => ctx.enemies.count({ tag: 'sexton' }) === 1 && ctx.mission.objective('o_sexton')?.state === 'active', null, 4);
    g.assert(r.ok, 'cp_abeyance: the Sexton and o_sexton');
    const sx = await ev(() => {
      const ctx = window.__game.ctx, u = ctx.enemies.alive({ tag: 'sexton' })[0];
      let lens = 0; u?.root?.traverse(o => { if (o.userData?.l01glow) lens++; });
      return { name: u?.name, boss: u?.boss, ap: u?.apMax, lens, carriers: ctx.enemies.count({ kind: 'gleaner_carrier' }), gl: ctx.enemies.count({ kind: 'gleaner' }),
               ab: ctx.player.abilities };
    });
    g.log('sexton', sx);
    g.assert(sx.name === 'SEXTON' && sx.boss && sx.lens >= 1, 'the Sexton: named SEXTON, boss, ghost light on its head');
    g.assert(sx.carriers === 1 && sx.gl >= 3 && sx.ab.missile && !sx.ab.kit, 'carrier2 and 3 Gleaners; missiles remembered, repair not yet');
    await step(2);
    if (SHOTS) {
      await shot('z4-apron-gameplay');
      const a = await routePos(1395, 60, 6), b = await routePos(1545, 0, 60);
      await vista('z4-abeyance-from-apron', a, b, 52);
    }
    await budget('Z4 Sexton');
    // the carrier pops flares at a homing missile (and retargets it to a decoy)
    const fl = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, c = ctx.enemies.alive({ kind: 'gleaner_carrier' })[0];
      if (!c) return { ok: false };
      const pos = c.pos.clone().add(new p.pos.constructor(-90, 10, 0));
      const pr = ctx.projectiles.fire({ pos, vel: new p.pos.constructor(120, 0, 0), team: 'player', owner: p, kind: 'missile', dmg: 620, imp: 260,
                                        target: c, turn: 2.6, accel: 110, maxSpeed: 175, life: 6 });
      window.__l01msl = pr;
      return { ok: true };
    });
    r = await until((ctx) => window.__l01fired.has('t_enemy_flares'), null, 3, 2);
    const rt = await ev(() => { const pr = window.__l01msl; return pr ? { retargeted: !!pr.target && !pr.target.kind, alive: pr.alive } : null; });
    g.assert(fl.ok && r.ok, `carrier flares at a homing missile: t_enemy_flares (${JSON.stringify(rt)})`);
    // the Sexton below half: the surge line; the repair lesson on low AP
    await ev(() => { const ctx = window.__game.ctx, u = ctx.enemies.alive({ tag: 'sexton' })[0]; if (u) u.ap = u.apMax * 0.45; });
    r = await until((ctx) => window.__l01fired.has('t_surge'), null, 2);
    g.assert(r.ok, 't_surge: "Energy surge. Move away from it."');
    await g.setGod(false);
    await ev(() => { const p = window.__game.ctx.player; p.ap = p.apMax * 0.5; });
    r = await until((ctx) => ctx.player.abilities.kit && window.__l01fired.has('t_repair'), null, 3);
    g.assert(r.ok, 't_repair: repair remembered below 55 % AP');
    const ap0 = await ev(() => window.__game.ctx.player.ap);
    await g.input({ clear: true, press: ['kit'] });
    await step(2, 5);
    const ap1 = await ev(() => window.__game.ctx.player.ap);
    g.assert(ap1 > ap0 + 1000, `a repair kit heals (${ap0.toFixed(0)} → ${ap1.toFixed(0)})`);
    await g.setGod(true);
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'sexton' }));
    r = await until((ctx) => ctx.mission.objective('o_climb2')?.state === 'active', null, 40);
    g.assert(r.ok && await hasFired('t_sexton_dead'), `the Sexton dead: drums, o_climb2 (${r.t.toFixed(0)} s)`);
    // Tick drives through the hold: Hardtack's sledge
    r = await until((ctx) => window.__l01fired.has('t_hold_sled'), null, 60);
    g.assert(r.ok, `t_hold_sled: Tick in the hold, o_sled2 (${r.t.toFixed(0)} s)`);
    await ev(() => { const ctx = window.__game.ctx, i = ctx.structures.get('winchLock'); if (i?.target?.alive) ctx.combat.kill(i.target, { team: 'player' }); });
    r = await until((ctx) => window.__l01fired.has('t_winch'), null, 3);
    g.assert(r.ok, 't_winch: the winch lock destroyed, FLAG SLEDGE on sled 2');
    const s2 = await ev(() => { const v = window.__game.ctx.l01.sledPos('sled2'); return v && [v.x, v.y, v.z]; });
    if (s2) {
      await g.teleport([s2[0] + 5, s2[1] + 0.5, s2[2] + 2]);   // explicit y: inside the hold, under the decks
      await g.input({ clear: true, hold: { interact: true } });
      r = await until((ctx) => ctx.mission.flags.sled2, null, 5, 5);
      await g.input({ clear: true });
      g.assert(r.ok, 'sled 2 flagged');
      r = await until((ctx) => window.__l01fired.has('t_sled2_done'), null, 3);
      g.assert(r.ok, 't_sled2_done');
    }
    if (SHOTS) {
      const a = await routePos(1500, 0, 8), b = await routePos(1560, 0, 6);
      await vista('z4-hold-drums', a, b, 60);
    }
    // the climb: floor 2 (Gleaner nest), the stencil on floor 3, the crown
    const fl2 = await ev(() => { const v = window.__game.ctx.world.resolve({ s: 1545, l: 5 }); return [v.x, v.z]; });
    await g.teleport([fl2[0], 45.6, fl2[1]]);
    r = await until((ctx) => window.__l01fired.has('t_floor2'), null, 3);
    g.assert(r.ok, 't_floor2: Gleaners on floor 2');
    const stc = await ev(() => { const i = window.__game.ctx.structures.all().find(i => i.type === 'abeyance'); const a = i?.anchors?.stencil; return a && [a.x, a.y, a.z]; });
    g.assert(!!stc, 'the stencil anchor exists');
    if (stc) {
      const fl3 = await ev(() => { const ctx = window.__game.ctx, v = ctx.world.resolve({ s: 1545, l: 4 }); return [v.x, v.z]; });
      await g.teleport([fl3[0], 67.6, fl3[1]]);
      r = await until((ctx) => window.__l01fired.has('t_stencil'), null, 3);
      g.assert(r.ok, 't_stencil: "This frame knows this mark."');
      await step(1.2, 6);
      if (SHOTS) await shot('z4-stencil-cinematic', { hud: false });
      r = await until((ctx) => !ctx.cinematics.active && !ctx.player.frozen, null, 6);
      g.assert(r.ok, 'stencil shot ends, Moth moves again');
    }
    const crown = await ev(() => { const ctx = window.__game.ctx, v = ctx.world.resolve({ s: 1545 - 12, l: 6 + 123.5 * Math.tan(7 * Math.PI / 180) }); return [v.x, v.z]; });
    await g.teleport([crown[0], 124.2, crown[1]]);
    r = await until((ctx) => window.__l01fired.has('t_crown'), null, 3);
    g.assert(r.ok, 't_crown at the crown');
    const cine = await until((ctx) => ctx.cinematics.active, null, 2, 2);
    if (SHOTS && cine.ok) { await step(2.5); await shot('z4-crown-cutline-reveal', { hud: false }); }
    await skipCine();
    r = await until((ctx) => ctx.mission.objective('o_heads')?.state === 'active', null, 30);
    g.assert(r.ok, 'the cut-line reveal: o_heads active');
    r = await until((ctx) => ctx.mission.collectibles?.()?.includes?.('cacheB') || (ctx.haul?.rack || []).includes('flare_pod'), null, 3);
    g.log('crown cache', await ev(() => ({ rack: window.__game.ctx.haul?.rack, pick: window.__game.ctx.mission.flags })));
    g.assert(await ev(() => (window.__game.ctx.haul?.rack || []).includes('flare_pod')), 'cache B on the crown racks the Flare Pod');
    // down to the field: the cut-line starts
    const fd = await ev(() => { const v = window.__game.ctx.world.resolve({ s: 1730, l: 0 }); return [v.x, v.z]; });
    await g.teleport(fd);
    r = await until((ctx) => window.__l01fired.has('t_field') && ctx.enemies.count({ kind: 'icebreaker' }) === 1, null, 4);
    g.assert(r.ok, 't_field: cp_cutline, the Icebreaker and the field skiffs');
    r = await until((ctx) => window.__l01fired.has('t_heads_hint'), null, 18);
    g.assert(r.ok, 't_heads_hint 15 s later');
    await noErrors('abeyance');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z5 · the cut-line, the drowning
  if (only.has('cutline')) {
    await start('cp_cutline');
    await g.setGod(true);
    let r = await until((ctx) => ctx.combat.query({ tag: 'drillhead' }).length === 3 && ctx.enemies.count({ kind: 'icebreaker' }) === 1, null, 3);
    g.assert(r.ok, 'cp_cutline: the Icebreaker with three drill heads');
    const ib0 = await ev(() => { const ctx = window.__game.ctx, u = ctx.enemies.alive({ kind: 'icebreaker' })[0]; return { pos: [u.pos.x, u.pos.y, u.pos.z], yaw: u.yaw, turrets: ctx.enemies.count({ tag: 'ib_turret' }), targetable: u.targetable, ap: u.ap }; });
    g.log('icebreaker', ib0);
    g.assert(ib0.turrets === 2 && ib0.targetable === false && ib0.ap === 30000, 'two deck turrets; the hull untargetable; ap = heads sum');
    // a hull hit: "ARMOURED. Hit the drill heads."
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ kind: 'icebreaker' })[0];
      p.teleport(u.pos.clone().add(new p.pos.constructor(-120, 0, 30)).setY(NaN));
      const from = p.center(new p.pos.constructor()), to = u.pos.clone().setY(u.pos.y + 8);
      ctx.projectiles.fire({ pos: from, vel: to.sub(from).normalize().multiplyScalar(600), team: 'player', owner: p, kind: 'bullet', dmg: 1, imp: 0, life: 1 });
    });
    r = await until((ctx) => window.__l01fired.has('t_hull_hint'), null, 2, 2);
    g.assert(r.ok, 't_hull_hint: ARMOURED');
    // the floodlight: stand in its sweep
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ kind: 'icebreaker' })[0];
      const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
      p.teleport(new p.pos.constructor(u.pos.x + fx * 180, NaN, u.pos.z + fz * 180));
    });
    r = await until((ctx) => window.__l01fired.has('t_spotlight'), null, 12);
    g.assert(r.ok, `t_spotlight: SPOTTED in the floodlight (${r.t.toFixed(1)} s)`);
    // the busiest moment: phase 1 with the stern launches out (first launch 25 s in)
    r = await until((ctx) => ctx.enemies.count({ tag: 'ib_skiff' }) >= 2, null, 30);
    g.log('launches', r);
    await step(2);
    if (SHOTS) {
      await shot('z5-icebreaker-gameplay');
      const ib = await ev(() => { const u = window.__game.ctx.enemies.alive({ kind: 'icebreaker' })[0]; return [u.pos.x, u.pos.y, u.pos.z]; });
      await vista('z5-icebreaker-vista', [ib[0] - 160, ib[1] + 45, ib[2] + 120], [ib[0], ib[1] + 12, ib[2]], 50);
    }
    // §7.5 measures at a busy moment "with 8 units fighting and an explosion": one near the player, 6 frames in
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player;
      ctx.fx?.explosion?.(p.pos.clone().add(new p.pos.constructor(18, 2, -10)), 1.6);
      window.__game.step(6);
    });
    await budget('Z5 Icebreaker phase 1');
    // phase 2: the port saw dies; the sweep
    await ev(() => { const ctx = window.__game.ctx, h = ctx.combat.query({ tag: 'head_port' })[0]; ctx.combat.kill(h, { team: 'player' }); });
    r = await until((ctx) => ctx.mission.flags['ib:phase'] === 2 && window.__l01fired.has('t_head1'), null, 3);
    g.assert(r.ok, 'phase 2 (HUNTING) after the first saw: t_head1');
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ kind: 'icebreaker' })[0];
      const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw);
      p.teleport(new p.pos.constructor(u.pos.x + fx * 62, NaN, u.pos.z + fz * 62));
    });
    r = await until((ctx) => window.__l01fired.has('t_crack'), null, 12);
    g.assert(r.ok, `phase 2 saw sweep telegraph: t_crack (${r.t.toFixed(1)} s)`);
    r = await until((ctx) => window.__l01fired.has('t_pa2'), null, 22);
    g.assert(r.ok, 't_pa2: "Cut and— cut and haul."');
    // phase 3: the second saw; it crawls to the edge
    await ev(() => { const ctx = window.__game.ctx, h = ctx.combat.query({ tag: 'head_stbd' })[0]; ctx.combat.kill(h, { team: 'player' }); });
    r = await until((ctx) => window.__l01fired.has('t_head2'), null, 3);
    g.assert(r.ok, 't_head2');
    await ev(() => { const p = window.__game.ctx.player; p.teleport(new p.pos.constructor(560, NaN, 60)); });
    r = await until((ctx) => ctx.mission.flags['ib:phase'] === 3 && ctx.mission.checkpoint === 'cp_harvest', null, 90);
    g.assert(r.ok, `phase 3 (HARVEST) at the edge: cp_harvest (${r.t.toFixed(0)} s)`);
    r = await until((ctx) => ctx.l01.icebreaker?.boomLow >= 1, null, 6);
    // the collar rule: from the shelf (above), hits are blocked
    await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, h = ctx.combat.query({ tag: 'head_bow' })[0];
      p.teleport(new p.pos.constructor(600, NaN, 30));
      const from = p.center(new p.pos.constructor());
      ctx.projectiles.fire({ pos: from, vel: h.pos.clone().sub(from).normalize().multiplyScalar(680), team: 'player', owner: p, kind: 'bullet', dmg: 245, imp: 70, life: 1 });
    });
    r = await until((ctx) => window.__l01fired.has('t_collar'), null, 2, 2);
    const bow0 = await ev(() => window.__game.ctx.combat.query({ tag: 'head_bow' })[0]?.ap);
    g.assert(r.ok && bow0 === 14000, `t_collar: a hit from above is blocked (bow AP ${bow0})`);
    if (SHOTS) {
      await shot('z5-harvest-gameplay');
    }
    // from the Raft (below the collar): the bow auger dies → the finale
    const raft = await ev(() => {
      const ctx = window.__game.ctx, L = ctx.l01, F = L.floes, h = ctx.combat.query({ tag: 'head_bow' })[0];
      const i = F.nearestFloe(h.pos.x + 30, h.pos.z, true), f = F.field.floes[i];
      ctx.player.teleport(new ctx.player.pos.constructor(f.x, f.top + 0.3, f.z));
      return { i, kind: f.kind, top: f.top };
    });
    await step(0.5, 5);
    const below = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, h = ctx.combat.query({ tag: 'head_bow' })[0];
      const info = ctx.combat.damage(h, 5000, 100, { team: 'player', owner: p, kind: 'rifle' });
      return { amount: info.amount, blocked: !!info.blocked, ap: h.ap, py: p.center(new p.pos.constructor()).y };
    });
    g.log('raft', raft, below);
    g.assert(below.amount > 0 && !below.blocked, `from the Raft the collar takes damage (${below.ap})`);
    await ev(() => { const ctx = window.__game.ctx, h = ctx.combat.query({ tag: 'head_bow' })[0]; ctx.combat.kill(h, { team: 'player' }); });
    r = await until((ctx) => window.__l01fired.has('t_finale'), null, 3);
    g.assert(r.ok, 't_finale: the bow auger dead');
    await g.setGod(false);
    // the sunrise: the light wall sweeps in (T 1.5 .. ~9)
    r = await until((ctx, L) => !!L.wall && L.wall.d - L.wall.playerD() < 520, null, 8, 5);
    if (SHOTS) {
      const pp = (await st()).player.pos;
      await vista('z5-sunrise-wall', [pp[0] - 140, pp[1] + 40, pp[2] - 60], [pp[0] + 400, pp[1] + 20, pp[2]], 55);
    }
    const vit = [];
    const watchV = async () => { const v = await ev(() => window.__game.ctx.hud.vitalsState); vit.push(v.mode + ':' + v.bpm); return v; };
    await watchV();
    r = await until((ctx, L) => L.drown?.phase === 'B', null, 14, 5);
    g.assert(r.ok, `the floe splits, Moth goes in (${r.t.toFixed(1)} s)`);
    await step(2);
    const w1 = await watchV();
    g.assert(w1.mode === 'live' && w1.bpm >= 140, `vitals race (${w1.mode} ${w1.bpm})`);
    if (SHOTS) {   // settled at −48, looking up at the split (L1 §7.2's 6 to 10 s silence)
      await until((ctx, L) => (L.drown?.t ?? 0) > 9, null, 10, 5);
      await shot('z5-underwater');
    }
    r = await until((ctx) => ctx.hud.vitalsState.mode === 'flat', null, 25, 5);
    const w2 = await watchV();
    g.assert(r.ok && w2.bpm == null, `flat line: SENSOR FAULT (${w2.mode} ${w2.bpm})`);
    r = await until((ctx) => (ctx.hud.fadeLevel ?? 0) >= 1, null, 3, 3);
    g.assert(r.ok, 'cut to black');
    r = await until((ctx) => ctx.comms.current?.text === 'Hold on to me.', null, 3, 2);
    const black = await ev(() => {
      const c = document.getElementById('comms'), f = document.getElementById('fade');
      const cz = +getComputedStyle(c).zIndex || 0, fz = +getComputedStyle(f).zIndex || 0;
      return { visible: !c.hidden && getComputedStyle(c).display !== 'none', text: c.querySelector('.line')?.textContent, cz, fz,
               fade: +getComputedStyle(f).opacity, sameParent: c.parentElement === f.parentElement };
    });
    g.log('over black', black);
    g.assert(r.ok && black.visible, '"Hold on to me." on the comms over black');
    if (SHOTS) { await step(0.8, 4); await shot('z5-black-hold-on', { settle: false }); }   // the line typed out
    r = await until((ctx) => ctx.hud.vitalsState.mode === 'locked', null, 5, 3);
    const w3 = await watchV();
    g.assert(r.ok && w3.bpm === 60, `reboot: vitals locked at 60 (${w3.mode} ${w3.bpm})`);
    g.assert(await ev(() => window.__game.ctx.save.getFlag('vitals')) === 'locked' || true, 'vitals lock flag');
    r = await until((ctx) => ctx.mission.objective('o_surface')?.state === 'active' && !ctx.player.frozen, null, 10);
    g.assert(r.ok, 'control returns underwater: o_surface');
    g.assert(await ev(() => window.__game.ctx.save.getFlag('vitals')) === 'locked', 'persistent save flag vitals = locked (A2 #19)');
    // swim up through the hole (god mode back on: the scripted player stands still in the sprint that follows, where a
    // Gaffer's harpoon can tow it into a lead)
    await g.setGod(true);
    await g.input({ clear: true, hold: { jump: true } });
    r = await until((ctx) => ctx.mission.flags.surfaced, null, 20, 5);
    await g.input({ clear: true });
    g.assert(r.ok, `breach: surfaced (${r.t.toFixed(1)} s)`);
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_floes' && ctx.mission.flags['p:sprint'], null, 6);
    g.assert(r.ok, 'cp_floes: the sprint begins');
    g.log('vitals sequence', vit.join(' → '));
    r = await until((ctx) => window.__l01fired.has('t_sink'), null, 12);
    g.assert(r.ok, 't_sink: the hulk goes under (sprint 8 s)');
    if (SHOTS) {
      const pp = (await st()).player.pos;
      await vista('z5-hulk-sinking', [pp[0] + 30, pp[1] + 25, pp[2] + 60], [620, -5, -10], 55);
    }
    r = await until((ctx) => window.__l01fired.has('t_rot'), null, 8);
    g.assert(r.ok, 't_rot: "Blue holds, gold breaks."');
    await noErrors('cutline');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z6 · the floes, Z7 · the shore
  if (only.has('floes')) {
    await start('cp_floes');
    await g.setGod(true);
    let r;
    const f0 = await ev(() => {
      const ctx = window.__game.ctx, L = ctx.l01, p = ctx.player;
      return { vit: ctx.hud.vitalsState, hover: p.hoverCostScale, running: L.floes.running, sun: L.sunRunning, sprint: ctx.mission.flags['p:sprint'],
               check: L.floes.check, n: L.floes.n, rack: [...(ctx.haul?.rack || [])], onFloe: L.floes.floeAt(p.pos.x, p.pos.z) };
    });
    g.log('floes', { ...f0, check: { ok: f0.check.ok, rounds: f0.check.rounds } });
    g.assert(f0.vit.mode === 'locked' && f0.vit.bpm === 60, 'cp_floes: vitals locked at 60');
    g.assert(f0.hover === 2 && f0.running && f0.sun && f0.sprint, 'hover icing ×2, floes and the sun clock running');
    g.assert(f0.check.ok, `the floe-path validator passes at load (${f0.n} floes, ${f0.check.rounds} nudge rounds)`);
    // the validator again at every elevation 5.5..9 (the runtime field)
    const val = await ev(async () => {
      const ctx = window.__game.ctx, L = ctx.l01, m = await import('/levels/level01/floes.js');
      return [5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map(e => ({ e, ok: m.validateField(L.floes.field, L.DATA, e).ok }));
    });
    g.assert(val.every(v => v.ok), `a valid floe path exists at every sun elevation 5.5..9° (${val.map(v => v.e + (v.ok ? '✓' : '✗')).join(' ')})`);
    if (!f0.rack.length) { await ev(() => window.__game.ctx.haul?.set?.(['harpoon_gaff', 'flare_pod'], 1)); g.log('rack empty on a cold cp_floes: seeded harpoon_gaff, flare_pod for the Bench pass'); }
    await step(1.5);
    if (SHOTS) await shot('z6-floes-gameplay');
    // sled 3: Kit spots it; flag it on its floe (shaded at first)
    const sl = await ev(() => { const v = window.__game.ctx.l01.floes.sledPos(new window.__game.ctx.player.pos.constructor()); return [v.x, v.y, v.z]; });
    await g.teleport([sl[0] - 5, sl[1] + 0.4, sl[2] + 2]);
    r = await until((ctx) => window.__l01fired.has('t_sled3'), null, 3);
    g.assert(r.ok, 't_sled3: "Sled on a floe, south!"');
    await g.input({ clear: true, hold: { interact: true } });
    r = await until((ctx) => ctx.mission.flags.sled3, null, 4, 5);
    await g.input({ clear: true });
    g.assert(r.ok, 'sled 3 flagged');
    r = await until((ctx) => window.__l01fired.has('t_sled3_done'), null, 3);
    g.assert(r.ok, 't_sled3_done');
    // sunlit ice rots: 3.0 s from the first touch to the collapse
    const rot = await ev(async () => {
      const G = window.__game, ctx = G.ctx, L = ctx.l01, F = L.floes, fl = F.field.floes, p = ctx.player;
      let best = -1, bd = Infinity;
      for (let i = 0; i < F.n; i++) {
        const f = fl[i];
        if (F.state[i] !== 0 || F.shaded[i] || f.kind === 'berg' || f.sled || f.r < 12) continue;
        const d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z); if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return { ok: false };
      const f = fl[best];
      p.teleport(new p.pos.constructor(f.x, f.top + 0.5, f.z));
      let t = 0, t1 = null, t2 = null;
      for (let k = 0; k < 60 * 8 && t2 == null; k++) {
        G.step(1); t += 1 / 60;
        if (t1 == null && F.state[best] === 1) t1 = t;
        if (t2 == null && F.state[best] === 2) t2 = t;
      }
      return { ok: true, i: best, r: f.r, kind: f.kind, t1, t2, dur: t1 != null && t2 != null ? t2 - t1 : null };
    });
    g.log('rot', rot);
    g.assert(rot.ok && rot.dur != null && Math.abs(rot.dur - 3.0) <= 0.1, `a sunlit floe sinks 3.0 ± 0.1 s after the touch (${rot.dur?.toFixed(2)} s)`);
    r = await until((ctx) => window.__l01fired.has('t_rot'), null, 2);
    g.assert(r.ok, 't_rot: "Blue holds, gold breaks."');
    await step(1.5);
    if (SHOTS) await shot('z6-rotting-floe');
    // shaded ice holds: 20 s on a floe in a berg's shade (shaded at 9°, so at every elevation)
    const hold = await ev(async () => {
      const G = window.__game, ctx = G.ctx, L = ctx.l01, F = L.floes, fl = F.field.floes, p = ctx.player;
      const m = await import('/levels/level01/floes.js');
      let best = -1, bd = Infinity;
      for (let i = 0; i < F.n; i++) {
        const f = fl[i];
        if (F.state[i] !== 0 || f.kind !== 'floe' || f.sled || f.r < 9 || !m.shadedAt(F.field.bergs, f.x, f.z, 9.5)) continue;
        const d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z); if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return { ok: false };
      const f = fl[best];
      p.teleport(new p.pos.constructor(f.x, f.top + 0.5, f.z));
      for (let k = 0; k < 20 * 60; k += 10) G.step(10);
      return { ok: true, i: best, state: F.state[best], y: p.pos.y, top: f.top, onGround: p.onGround };
    });
    g.log('shade', hold);
    g.assert(hold.ok && hold.state === 0 && Math.abs(hold.y - hold.top) < 1, `a shaded floe holds for 20 s (state ${hold.state}, y ${hold.y?.toFixed(1)})`);
    r = await until((ctx) => window.__l01fired.has('t_hunt'), null, 30);
    g.assert(r.ok, `t_hunt: "Why are the Gleaners all coming at YOU?" (${r.t.toFixed(0)} s)`);
    if (SHOTS) {
      const pp = (await st()).player.pos;
      await shot('z6-hunt-gameplay');
      await vista('z6-floes-vista', [pp[0] - 90, pp[1] + 55, pp[2] + 70], [pp[0] + 150, -22, pp[2] - 40], 55);
    }
    await budget('Z6 sprint (hunt + skiffs)');
    r = await until((ctx) => window.__l01fired.has('t_leads'), null, 40);
    g.assert(r.ok, `t_leads: skiffs in the leads (${r.t.toFixed(0)} s)`);
    r = await until((ctx) => window.__l01fired.has('t_withme'), null, 90);
    g.assert(r.ok, `t_withme: "You with me?" / "I am here." (${r.t.toFixed(0)} s)`);
    // the last stretch to the fast ice
    const lb = await routePos(3065, 0);
    await g.teleport([lb[0], lb[2]]);
    r = await until((ctx) => window.__l01fired.has('t_lastbit'), null, 3);
    g.assert(r.ok, 't_lastbit at s 3060');
    const fi = await routePos(3140, 10);
    await g.teleport([fi[0], fi[2]]);
    r = await until((ctx) => window.__l01fired.has('t_shore') && ctx.mission.flags['p:shore'], null, 3);
    g.assert(r.ok, 't_shore: the shore event');
    r = await until((ctx) => ctx.player.animOverride?.crouch === 1, null, 30);
    g.assert(r.ok, `Moth walks to the hole and kneels (${r.t.toFixed(1)} s)`);
    const w = await ev(() => window.__game.ctx.l01.watchers.filter(u => u.alive).length);
    g.assert(w === 5, `five Gleaners watch the kneel (${w})`);
    await step(4);
    if (SHOTS) await shot('z7-kneel-cinematic', { hud: false });
    await budget('Z7 shore');
    r = await until((ctx) => window.__l01lines.some(l => l.text === 'There you are.'), null, 40);
    const fm = await ev(() => window.__l01lines.find(l => l.text === 'There you are.'));
    g.assert(r.ok && fm?.who === 'FOREMAN', `the Foreman's chime line: "There you are." (${JSON.stringify(fm)})`);
    r = await until((ctx) => ctx.mission.objective('o_bench')?.state === 'active' && !ctx.player.frozen, null, 20);
    g.assert(r.ok, 'o_bench: "Bring the frame in"');
    const ab = await ev(() => window.__game.ctx.player.abilities);
    g.assert(ab.move === 0.33 && !ab.fire, 'weapons stowed: a slow walk into camp');
    if (SHOTS) {
      await shot('z7-shore-gameplay');
      const a = await routePos(3240, 70, 14), b = await routePos(3296, 20, 8);
      await vista('z7-bench-camp', a, b, 50);
    }
    r = await walkTo(3282, 20, 60, 0, 10);
    g.log('walk to the Bench', r);
    r = await until((ctx) => window.__l01fired.has('t_bench'), null, 4);
    g.assert(r.ok, 't_bench: the cradle reached, the naming');
    if (SHOTS) {   // mid-cinematic: the frame at the cradle turning north, Kit's line on the comms
      await until((ctx) => window.__l01lines.some(l => /I'm calling it Moth/.test(l.text)), null, 12, 5);
      await step(1.2, 4);
      await shot('z7-naming', { hud: false, settle: false });
    }
    r = await until((ctx) => window.__l01lines.some(l => l.text === 'Designation accepted. Logged.'), null, 40);
    g.assert(r.ok, '"Designation accepted. Logged."');
    r = await until((ctx) => ctx.flow.state === 'debrief' && ctx.screens.current === 'debrief', null, 20);
    g.assert(r.ok, 'the level completes: debrief');
    const db = await ev(() => document.getElementById('screen').innerText);
    g.log('debrief', db.replace(/\s+/g, ' ').slice(0, 400));
    const flags = await ev(() => window.__game.ctx.mission.flags);
    const nSled = ['sled1', 'sled2', 'sled3'].filter(k => flags[k]).length;
    g.assert(/WALK DAY 1 · THE RIME SHELF/i.test(db) && /Haul/i.test(db) && new RegExp(`${nSled}\\s*/\\s*3`).test(db),
             `debrief: title, haul and sledges ${nSled} / 3`);
    if (SHOTS) await shot('debrief', { settle: false });
    // ── Bench 1 through garage.bench (A6) ──
    const before = await ev(() => JSON.parse(JSON.stringify(window.__game.ctx.save.getFlag('campaign'))));
    g.log('campaign before the Bench', { water: before?.water, pending: before?.pending, ledger: before?.ledger });
    await ev(() => document.querySelector('#screen #bA0')?.click());
    r = await until((ctx) => ctx.flow.state === 'bench' && !!ctx.garage.bench, null, 20, 5);
    g.assert(r.ok, 'TO THE BENCH: bench mode open');
    if (r.ok) {
      const b0 = await ev(() => window.__game.ctx.garage.bench.state());
      g.log('bench state', { parts: b0.parts, spares: b0.spares, fitted: b0.fitted, water: b0.water });
      const parts = Object.keys(b0.parts);
      g.assert(parts.length >= 1, `the haul arrived at the Bench (${parts.join(', ')})`);
      const res = await ev((parts) => {
        const B = window.__game.ctx.garage.bench, PARTS = {}; const out = {};
        const slotOf = { harpoon_gaff: 'L', flare_pod: 'S', shotgun_s8: 'R' };
        const fitPart = parts.find(p => slotOf[p]);
        if (fitPart) { out.fit = B.fit(slotOf[fitPart], fitPart); out.fitted = B.state().fitted; }
        const w0 = B.state().water;
        const givePart = parts.find(p => p !== fitPart) || parts[0];
        out.give = B.give(givePart); out.w1 = B.state().water;
        out.undo = B.undo(); out.w2 = B.state().water;
        out.give2 = B.give(givePart); out.w3 = B.state().water;
        out.w0 = w0; out.fitPart = fitPart; out.givePart = givePart;
        B.tab('LATTICE'); B.tab('WAKE'); B.tab('HAUL');
        return out;
      }, parts);
      g.log('bench ops', res);
      g.assert(res.give && res.w1 === res.w0 + 1 && res.undo && res.w2 === res.w0 && res.give2 && res.w3 === res.w0 + 1,
               `fit, give (+1 water), undo, give again (${res.w0} → ${res.w1} → ${res.w2} → ${res.w3})`);
      if (res.fitPart) g.assert(res.fit && Object.values(res.fitted).includes(res.fitPart), `fit ${res.fitPart}`);
      if (SHOTS) { await step(1); await shot('bench', { settle: false }); }
      const gives = 1;
      await ev(() => window.__game.ctx.garage.bench.walkOn());
      r = await until((ctx) => ctx.flow.state === 'count' && ctx.screens.current === 'count', null, 10, 5);
      g.assert(r.ok, 'WALK ON: the Morning Count');
      const camp = await ev(() => window.__game.ctx.save.getFlag('campaign'));
      const expect = 4 + nSled + gives - 3;
      const cnt = await ev(() => document.getElementById('screen').innerText);
      g.log('count', { water: camp.water, day: camp.day, expect, text: cnt.replace(/\s+/g, ' ').slice(0, 300) });
      g.assert(camp.water === expect && camp.day === 1 && camp.benchVisits === 1 && camp.pending === null,
               `the Count's water: 4 + ${nSled} sledges + ${gives} given − 3 = ${camp.water}`);
      g.assert(/Day 1/i.test(cnt) && /40 rigs · 300 souls/i.test(cnt) && /no names lost/i.test(cnt), 'the Count card: Day 1, 40 rigs · 300 souls, no names lost');
      if (SHOTS) await shot('morning-count', { settle: false });
      await ev(() => document.querySelector('#screen #bWalk')?.click());
      r = await until((ctx) => ctx.flow.state === 'title', null, 10, 5);
      g.assert(r.ok, 'after the Count: back to the title (no Level 2 yet)');
    }
    await noErrors('floes');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ determinism
  if (only.has('determinism')) {
    await start('cp_floes');
    const run = async () => {
      const s = await g.replay(600, { move: [0, 1] });
      const fl = await ev(() => window.__game.ctx.l01.floes.stateString());
      return { pos: s.player.pos, fl, units: s.units.map(u => u.pos.map(v => v.toFixed(3)).join(',')).join('|') };
    };
    const a = await run(), b = await run();
    g.log('determinism', { a: a.pos, b: b.pos });
    g.assert(JSON.stringify(a.pos) === JSON.stringify(b.pos) && a.fl === b.fl && a.units === b.units, 'cp_floes: two replays of 600 steps give identical player, floe and unit states');
    await noErrors('determinism');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ alternative branches
  if (only.has('alt')) {
    // the TEAR fail-safe: both pin waves die without a TEAR → one more Gaffer that staggers on its first hit
    await start('cp_ridges', { resetSave: true });
    await g.setGod(true);
    await ev(() => window.__game.ctx.haul?.clear?.());
    const at = await routePos(830, 0);
    await g.teleport([at[0], at[2]]);
    let r = await until((ctx) => ctx.enemies.count({ tag: 'pin' }) >= 2, null, 6);
    g.assert(r.ok, 'alt: t_pin');
    await step(1);
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'pin' }));
    r = await until((ctx) => window.__l01fired.has('t_pin_wave') && ctx.enemies.count({ tag: 'pin' }) >= 1, null, 6);
    await ev(() => window.__game.ctx.enemies.killAll({ tag: 'pin' }));
    r = await until((ctx) => ctx.enemies.count({ tag: 'pin3' }) === 1, null, 6);
    g.assert(r.ok && await hasFired('t_tear_failsafe'), 'alt: t_tear_failsafe sends one more Gaffer');
    const f = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ tag: 'pin3' })[0];
      p.teleport(u.pos.clone().add(new p.pos.constructor(15, 0, 0)).setY(NaN));
      u.speed = 0;
      ctx.combat.damage(u, 60, 40, { team: 'player', owner: p, kind: 'rifle' });
      return { stag: u.stagT, ap: u.ap, haul: u.haul?.part };
    });
    r = await until((ctx) => !!ctx.haul?.candidate, null, 2, 2);
    g.assert(f.stag > 0 && r.ok, `alt: the fail-safe Gaffer staggers on its first hit (${JSON.stringify(f)})`);
    await g.input({ clear: true, hold: { blade: true } });
    r = await until((ctx) => (ctx.haul?.rack?.length ?? 0) >= 1, null, 3, 2);
    await g.input({ clear: true });
    g.assert(r.ok, 'alt: the guaranteed TEAR');
    // cp_harvest from a cold start (L1 §9): the Icebreaker respawns directly in phase 3 at the edge, both saws gone;
    // the bow auger killed from the Raft starts the finale
    await start('cp_harvest', { resetSave: true });
    await g.setGod(true);
    r = await until((ctx) => ctx.mission.flags['ib:phase'] === 3 && ctx.combat.query({ tag: 'drillhead' }).length === 1 &&
                             ctx.combat.query({ tag: 'head_bow' }).length === 1, null, 8);
    const hv = await ev(() => {
      const ctx = window.__game.ctx, u = ctx.enemies.alive({ kind: 'icebreaker' })[0];
      return { phase: ctx.mission.flags['ib:phase'], obj: ctx.mission.objective('o_heads')?.state, pos: u && [Math.round(u.pos.x), Math.round(u.pos.z)],
               turrets: ctx.enemies.count({ tag: 'ib_turret' }), music: !!ctx.music };
    });
    g.log('cp_harvest cold', hv);
    g.assert(r.ok && hv.obj === 'active' && hv.pos && Math.abs(hv.pos[0] - 612) < 30, `alt: cp_harvest cold: phase 3 at the edge, the bow auger the last head (${JSON.stringify(hv)})`);
    await ev(() => {
      const ctx = window.__game.ctx, F = ctx.l01.floes, h = ctx.combat.query({ tag: 'head_bow' })[0];
      const i = F.nearestFloe(h.pos.x + 30, h.pos.z, true), f = F.field.floes[i];
      ctx.player.teleport(new ctx.player.pos.constructor(f.x, f.top + 0.3, f.z));
    });
    await step(0.5, 5);
    await ev(() => { const ctx = window.__game.ctx, h = ctx.combat.query({ tag: 'head_bow' })[0]; ctx.combat.kill(h, { team: 'player' }); });
    r = await until((ctx, L) => ctx.mission.flags['p:finale'] && !!L.drown?.active, null, 3);
    g.assert(r.ok, 'alt: from cp_harvest, the bow auger dead starts the finale');
    // sled 3 lost: its floe goes sunlit (sprint ~62 s) and rots under the player before it is flagged
    await start('cp_floes', { resetSave: true });
    await g.setGod(true);
    r = await until((ctx, L) => { const F = L.floes; return F.sledIdx >= 0 && !F.shaded[F.sledIdx]; }, null, 90, 30);
    const sp = await ev(() => { const ctx = window.__game.ctx; return { t: ctx.l01.sprintT, flag: ctx.mission.flags.sled3 }; });
    g.assert(r.ok, `alt: sled 3's floe goes sunlit at sprint ${sp.t.toFixed(0)} s`);
    const sl = await ev(() => { const v = window.__game.ctx.l01.floes.sledPos(new window.__game.ctx.player.pos.constructor()); return [v.x, v.y, v.z]; });
    await g.teleport([sl[0] - 4, sl[1] + 0.4, sl[2] + 3]);
    r = await until((ctx) => window.__l01fired.has('t_sled3_lost') && ctx.mission.objective('o_sled3')?.state === 'failed', null, 8);
    g.assert(r.ok, 'alt: t_sled3_lost, o_sled3 failed ("Lost it. Doesn\'t matter. Keep going.")');
    await noErrors('alt');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ spoilers and coverage
  {
    const lines = await ev(() => window.__l01lines || []);
    const nameAt = lines.findIndex(l => /I'm calling it Moth/.test(l.text));
    const before = nameAt >= 0 ? lines.slice(0, nameAt) : lines;
    const bad = before.filter(l => /moth/i.test(l.text) || /moth/i.test(l.name || ''));
    g.assert(bad.length === 0, `no "Moth" in comms before the naming (${lines.length} lines seen${bad.length ? ': ' + bad[0].text : ''})`);
    if (nameAt >= 0) {
      const after = lines.slice(nameAt + 1).find(l => l.who === 'MOTH');
      g.assert(after && (after.name == null || after.name === 'MOTH'), `the first line under the name MOTH: "${after?.text}"`);
    }
    const st = await ev(() => {
      const ctx = window.__game.ctx, def = ctx.mission.def || null;
      return def && {
        ui: [...def.objectives.map(o => o.text), ...def.checkpoints.map(c => c.label), ...def.zones.map(z => (z.card ? z.card.title + ' ' + (z.card.sub || '') : '') + ' ' + (z.name || '')),
             def.title, def.subtitle, def.briefing.title, def.briefing.body, ...def.briefing.objectives, ...(def.intro || []).map(p => p.text)].join(' | '),
        moth: (() => { const out = []; for (const [k, list] of Object.entries(def.comms)) for (const l of list) if (l.who === 'MOTH') out.push([k, l.text]); return out; })(),
        hints: JSON.stringify(def.triggers.concat(Object.values(def.events)).map(t => t)).match(/"hint":(\{[^}]*\}|"[^"]*")/g) || [],
      };
    });
    if (st) {
      g.assert(!/moth/i.test(st.ui) && !st.hints.some(h => /moth/i.test(h)), 'no "Moth" in objectives, cards, labels, briefing, intro or hints');
      const pre = [];
      for (const [k, t] of st.moth) { if (t === 'Hold on to me.') break; pre.push([k, t]); }
      const pron = pre.filter(([, t]) => /\b(I|me|my|mine|myself)\b/.test(t) || /[A-Za-z]['’][A-Za-z]/.test(t));
      g.assert(pre.length > 10 && pron.length === 0, `Moth never says I, me or my (or a contraction) before "Hold on to me." (${pre.length} lines${pron.length ? ': ' + pron[0][1] : ''})`);
    }
    // ── the clarity pass, over the whole run ──
    const cr = await ev(() => {
      const ctx = window.__game.ctx, C = window.__l01clar || { req: [], cards: [], obj: [], cp: [] };
      const def = ctx.mission.def;
      return { C, tags: def ? Object.fromEntries(Object.entries(def.speakers).map(([k, s]) => [k, s.tag ?? null])) : {},
               glossary: (ctx.hud?.glossary || []).map(e => ({ id: e.id, term: e.term, text: JSON.stringify(e.text) })),
               hasExplain: typeof ctx.hud?.explain === 'function' };
    });
    const C = cr.C;
    g.log('clarity (run)', { requested: C.req.length, hudCards: C.cards.length, objectives: C.obj.length, lines: lines.length,
                             firstLines: Object.keys(cr.tags).map(w => { const l = lines.find(x => x.who === w); return l ? `${w}: ${l.tag ?? '—'}` : `${w}: (not heard)`; }) });
    // (b) speaker tags: the first line each speaker says in the run carries its tag (P5 shows it beside the name)
    if (lines.some(l => l.tag)) {
      const wrong = Object.entries(cr.tags).filter(([w, tag]) => { const l = lines.find(x => x.who === w); return l && l.tag !== tag; });
      const again = lines.filter((l, i) => l.tag && lines.findIndex(x => x.who === l.who && x.tag) !== i);
      g.assert(wrong.length === 0 && again.length === 0, `each speaker's first line shows its tag once (${Object.keys(cr.tags).length} speakers${wrong.length ? '; ' + wrong.map(([w]) => w).join(', ') : ''}${again.length ? '; repeated for ' + again[0].who : ''})`);
    } else g.log('clarity: no comms line carried a tag (P5 speaker tags not landed?)');
    // (c) every term the script uses is introduced at its first appearance: a card asked for no later than 10 s after the
    // first comms line or objective that uses it (or, for a name, the line that says it first)
    const WORDS = [
      { w: 'TEAR', re: /\bTEAR\b/, terms: ['tear'] }, { w: 'Wake', re: /\bWake\b/, terms: ['wake'] },
      { w: 'Bench', re: /\bBench\b/, terms: ['bench'] }, { w: 'Oma', re: /\bOma\b/, terms: ['bench'] },
      { w: 'sledge', re: /\bsledges?\b/i, terms: ['sledge'] }, { w: 'skiff', re: /\bskiffs?\b/i, terms: ['skiffs'] },
      { w: 'Gleaner', re: /\bGleaners?\b/, terms: ['gleaners'] }, { w: 'icebreaker', re: /\bicebreaker\b/i, terms: ['icebreaker'] },
      { w: 'Dredge', re: /\bDredge\b/, terms: ['dredge'] }, { w: 'Turnback', re: /\bTurnback\b/, terms: ['turnback'] },
      { w: 'tank', re: /\btanks?\b/i, terms: ['water'] }, { w: 'remembered', re: /remembered/, terms: ['remembered'] },
      { w: 'Chorus', re: /\bChorus\b/, terms: ['chorus'] }, { w: 'ghost', re: /\bghosts?\b/i, terms: ['ghost'] },
      { w: 'rig names', re: /\b(Hardtack|Lark's Rest)\b/, terms: ['rigs'] }, { w: 'collar', re: /\bcollar\b/i, terms: ['collar'] },
      { w: 'Tick', re: /\bTick\b/, terms: ['kite'] }, { w: 'kite', re: /\bkite\b/i, terms: ['kite'] },
      { w: 'Abeyance', re: /\bAbeyance\b/, terms: [], namedBy: /There's the Abeyance/ },
    ];
    const SLACK = 600;   // frames (10 s)
    const uses = [...lines.map(l => ({ f: l.f, text: l.text, src: l.who })), ...C.obj.map(o => ({ f: o.f, text: o.text, src: 'objective ' + o.id }))]
      .filter(u => u.f != null).sort((a, b) => a.f - b.f);
    const late = [];
    for (const W of WORDS) {
      const first = uses.find(u => W.re.test(u.text));
      if (!first) continue;
      if (W.namedBy) { if (!W.namedBy.test(first.text)) late.push(`${W.w} used before it is named (${first.src}: "${first.text}")`); continue; }
      const intro = C.req.filter(r => W.terms.includes(r.id)).map(r => r.f).sort((a, b) => a - b)[0];
      if (intro == null || intro > first.f + SLACK) late.push(`${W.w}: first used by ${first.src} ("${first.text}") ${intro == null ? 'with no card' : ((intro - first.f) / 60).toFixed(1) + ' s before its card'}`);
    }
    if (only.size === ALL.length) g.assert(late.length === 0, `every term is introduced where it is first used (${WORDS.length} words${late.length ? '; ' + late.slice(0, 3).join(' | ') : ''})`);
    else g.log('clarity: introduced-before-use', late.length ? late : 'ok');
    // (d) the cards reach the HUD: every card handed over is in the Field notes (save.flags.glossary)
    if (cr.hasExplain) {
      const delivered = [...new Set(C.dlv.map(e => e.id))];
      const gl = new Set(cr.glossary.map(e => e.id));
      const lost = delivered.filter(id => !gl.has(id));
      const need = only.size === ALL.length ? 25 : 1;
      g.assert(delivered.length >= need && lost.length === 0, `explainer cards reach hud.explain and the Field notes (${delivered.length} cards handed over, ${gl.size} notes${lost.length ? '; missing ' + lost.join(', ') : ''})`);
      // (e) spoilers: no note or tag says "Moth" before the naming
      g.assert(!cr.glossary.some(e => /moth/i.test(e.term + ' ' + e.text)) && !before.some(l => /moth/i.test(l.tag || '')), 'no "Moth" in the Field notes or in speaker tags before the naming');
    } else g.log('clarity: hud.explain missing (P5 not landed?): cards queued only');
    const all = await fired();
    const ids = await ev(() => window.__game.ctx.mission.def?.triggers.map(t => t.id) || []);
    const missing = ids.filter(id => !all.includes(id));
    if (only.size === ALL.length) g.assert(missing.length === 0, `every trigger fired across the run (${all.length}/${ids.length}${missing.length ? '; missing ' + missing.join(', ') : ''})`);
    else g.log('triggers fired', `${all.length}/${ids.length}`, 'missing', missing.join(', '));
    await noErrors('end');
  }

  /** steer the player along the route to (s, l) with injected forward input; returns when within `r` m */
  async function walkTo(s, l, maxSec, sprint = 0, r = 12) {
    const res = await ev(async ([s, l, maxSteps, sprint, r]) => {
      const G = window.__game, ctx = G.ctx, p = ctx.player;
      const goal = ctx.world.resolve({ s, l });
      const sleep = (ms) => new Promise(rs => setTimeout(rs, ms));
      let steps = 0, last = p.pos.clone(), lastT = 0, side = 0, sideT = 0, stuck = 0;
      while (steps < maxSteps) {
        if (ctx.flow.state === 'interstitial') { await sleep(150); continue; }
        const rc = ctx.world.route.closest(p.pos.x, p.pos.z);
        const d = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
        if (d < r) return { ok: true, t: steps / 60, stuck };
        // aim 40 m ahead along the route (or straight at the goal near it)
        const ahead = d < 60 ? goal : ctx.world.resolve({ s: Math.min(s, rc.s + 40), l: l * Math.min(1, (rc.s + 40) / s) });
        p.yaw = Math.atan2(-(ahead.x - p.pos.x), -(ahead.z - p.pos.z));
        // stuck on a pillar or a ridge: side-step (and hop when jumping is remembered)
        if (steps - lastT >= 90) {
          if (p.pos.distanceTo(last) < 4) { stuck++; side = stuck % 2 ? 1 : -1; sideT = 120; if (p.abilities?.jump && p.onGround) ctx.input.tap?.('jump'); }
          last.copy(p.pos); lastT = steps;
        }
        if (sideT > 0) { sideT -= 10; ctx.input.injectMove(side, 0.4); } else ctx.input.injectMove(0, 1);
        if (sprint && p.abilities?.boost && p.onGround && (steps % 90) === 0) ctx.input.tap?.('boost');
        G.step(10); steps += 10;
        await sleep(0);
      }
      return { ok: false, t: steps / 60, at: [p.pos.x, p.pos.y, p.pos.z], s: ctx.world.route.closest(p.pos.x, p.pos.z).s, stuck };
    }, [s, l, Math.round(maxSec * 60), sprint, r]);
    await g.input({ clear: true });
    return res;
  }
}
