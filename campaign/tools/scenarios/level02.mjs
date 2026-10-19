// tools/scenarios/level02.mjs (LEVEL, addendum 02 §B6.2) — Level 2 acceptance (L2 §19).
//
//   node tools/playtest.mjs --scenario level02 --port 8710 --out /tmp/campaign-playtest/L2-level02 --timeout 7200
//        [--param only=static,lip,raid,watcher,ruins,volley,mercy,lost,deck,road,camp,determinism] [--param shots=0]
//
// Plays the level from every checkpoint with step() (no rAF), moving the convoy along the road where a real run would
// wait for it, driving fights with damage through ctx.combat and injected inputs; asserts every trigger fires across the
// run, the convoy rules (band, hooks, lost rigs on the Roll), the set piece both ways (Big Mercy saved and lost), the
// Hold shot, the camp in the shadow stripe and the level result (cv:lost, campaign:story, M1); checks the clarity rules
// (cards, tags, objectives, spoilers); and screenshots every zone plus the set pieces (AD §8.5). Every addendum 02 engine
// feature is feature-detected: a missing one is logged as SKIP, never failed.
const ALL = ['static', 'lip', 'raid', 'watcher', 'ruins', 'volley', 'mercy', 'lost', 'deck', 'road', 'camp', 'determinism'];

export default async function (g) {
  const P = Object.fromEntries((g.args.params || []).map(p => { const [k, ...v] = p.split('='); return [k, v.join('=')]; }));
  const only = P.only ? new Set(P.only.split(',')) : new Set(ALL);
  const SHOTS = P.shots !== '0';
  const ev = (fn, arg) => g.eval(fn, arg);
  const T0 = Date.now();
  const since = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
  const skips = [];
  const skip = (msg) => { skips.push(msg); g.log('SKIP ' + msg); };

  // ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** steps the sim in chunks until pred(ctx, L, arg) holds (evaluated in the page), or maxSec of sim time */
  async function until(pred, arg, maxSec = 30, chunk = 10) {
    return ev(async ([src, arg, maxSteps, chunk]) => {
      const G = window.__game, ctx = G.ctx;
      // eslint-disable-next-line no-eval
      const f = (0, eval)('(' + src + ')');
      const test = () => { try { return !!f(ctx, ctx.l02, arg); } catch (e) { return false; } };
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
  const fired = () => ev(() => [...(window.__l02fired || [])]);
  const hasFired = async (id) => (await fired()).includes(id);
  const flag = (k) => ev((k) => window.__game.ctx.mission.flags[k], k);
  const obj = (id) => ev((id) => window.__game.ctx.mission.objective(id)?.state ?? null, id);
  const skipCine = () => ev(() => { if (window.__game.ctx.cinematics?.active) window.__game.skipCinematic(); });
  const errors = () => ev(() => window.__game.errors());
  async function noErrors(label) {
    const e = await errors();
    g.assert(e.length === 0, `${label}: no game errors${e.length ? ' (' + e.slice(0, 3).map(x => x.system + ': ' + x.message).join(' | ') + ')' : ''}`);
  }
  const routePos = (s, l = 0, h) => ev(([s, l, h]) => { const v = window.__game.ctx.world.resolve({ s, l, h }); return [v.x, v.y, v.z]; }, [s, l, h ?? 0]);
  async function start(cp, o = {}) {
    const t = Date.now();
    if (o.resetSave !== false) await ev(() => { const s = window.__game.ctx.save; s.setCheckpoint?.('l02', null); });
    await ev(() => {
      const ctx = window.__game.ctx;
      if (window.__l02fired) return;
      window.__l02fired = new Set();
      window.__l02lines = [];
      const C = window.__l02clar = { req: [], dlv: [], cards: [], obj: [], cp: [], hooks: [], lost: [], freed: [], holds: 0, complete: [] };
      const f = () => ctx.clock.frame;
      ctx.events.on('trigger:fired', (e) => window.__l02fired.add(e.id));
      ctx.events.on('comms:line', (e) => {
        const s = ctx.comms?.speaker?.(e.who);
        window.__l02lines.push({ who: e.who, text: e.text, name: e.name ?? s?.name ?? null, tag: e.tag ?? null, t: ctx.clock.time, f: f() });
      });
      ctx.events.on('l02:term', (e) => C.req.push({ id: e.id, f: f(), cp: ctx.mission?.checkpoint ?? null }));
      ctx.events.on('l02:termDelivered', (e) => C.dlv.push({ id: e.id, shown: e.shown, f: f() }));
      ctx.events.on('hud:explain', (e) => C.cards.push({ id: e.id, term: e.term, f: f() }));
      ctx.events.on('objective:changed', (e) => { if (e.state === 'active' && e.text) C.obj.push({ id: e.id, text: e.text, f: f() }); });
      ctx.events.on('level:start', (e) => C.cp.push({ cp: e.checkpoint, f: f() }));
      ctx.events.on('l02:hooked', (e) => C.hooks.push(e));
      ctx.events.on('l02:lost', (e) => C.lost.push(e));
      ctx.events.on('l02:freed', (e) => C.freed.push(e));
      ctx.events.on('sync:hold', () => { C.holds++; });
      ctx.events.on('level:complete', (e) => C.complete.push({ flags: JSON.parse(JSON.stringify(e.result?.flags ?? e.flags ?? ctx.mission.flags)), f: f() }));
    });
    const s = await g.startLevel('l02', cp);
    await ev(() => window.__game.ctx.l02 && (window.__game.ctx.l02.terms.seen.clear?.(), 0));
    g.log(`[${since()}] start ${cp}`, { ms: Date.now() - t, state: s.state, cp: s.checkpoint, pos: s.player?.pos?.map(v => +v.toFixed(1)) });
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
  async function vista(name, pos, look, fov = 55) {
    if (!SHOTS) return;
    await g.camera(pos, look, fov);
    await shot(name, { hud: false });
    await g.freeCam(false);
  }
  /** a free camera `h` m up over the road at s, looking along it (or at `look`) */
  async function roadVista(name, s, o = {}) {
    if (!SHOTS) return;
    const a = await routePos(s, o.l ?? 0, o.h ?? 80);
    const b = o.look ? o.look : await routePos(s + (o.ahead ?? 600), o.ll ?? 0, o.lh ?? 20);
    await vista(name, a, b, o.fov ?? 55);
  }
  /** the §6.1 budgets (High) for the frame just rendered */
  async function budget(label) {
    const p = await g.perf();
    const extra = await ev(() => {
      const ctx = window.__game.ctx;
      return { units: ctx.enemies?.all?.().filter(u => u.alive).length ?? 0, proj: ctx.projectiles?.count ?? 0,
               parts: (ctx.particles?.add?.alive ?? 0) + (ctx.particles?.smoke?.alive ?? 0), tier: ctx.tier.name };
    });
    const r = { label, calls: p.calls, main: p.main, shadow: p.shadow, tris: p.triangles, mainTris: p.mainTriangles, ...extra };
    g.log('budget', r);
    if (extra.tier === 'high' && p.calls != null) {
      g.assert(p.calls <= 1400, `${label}: draw calls ${p.calls} ≤ 1400`);
      g.assert((p.mainTriangles ?? p.triangles) <= 3.0e6, `${label}: main triangles ${p.mainTriangles ?? p.triangles} ≤ 3 M`);
    }
    return r;
  }
  /** the convoy jumps to road s (the rigs snap to their slots) and the frame stands beside it */
  async function convoyTo(s, o = {}) {
    await ev(([s]) => { const L = window.__game.ctx.l02; L.convoy.s = s; L.convoy.snapAll(); L.convoy.saveFlags(); }, [s]);
    if (o.player !== false) { const a = await routePos(s + (o.ds ?? 0), o.l ?? -80); await g.teleport([a[0], a[2]]); }
  }
  async function kill(f) { return ev((f) => { const ctx = window.__game.ctx; let n = 0; for (const u of ctx.enemies.alive(f)) { ctx.combat.kill(u); n++; } return n; }, f); }
  async function holdInteract(sec = 2) { await g.input({ clear: true, hold: { interact: true } }); const r = await step(sec, 6); await g.input({ clear: true }); return r; }

  // ══════════════════════════════════════════════════════════════════════════════════════ static checks
  if (only.has('static')) {
    await start('cp_lip');
    await skipCine();
    const r = await ev(async () => {
      const ctx = window.__game.ctx, def = ctx.mission.def;
      const { validateLevel } = await import('/src/mission/mission.js');
      const kinds = new Set();
      for (const e of def.encounters) { e.units.forEach(u => kinds.add(u.kind)); (e.waves || []).forEach(w => w.units.forEach(u => kinds.add(u.kind))); }
      return {
        validate: validateLevel(def, ctx), length: ctx.world.route.length, zones: def.zones.map(z => z.id), withArt: def.zones.filter(z => z.card).length,
        checkpoints: def.checkpoints.map(c => c.id), encounters: def.encounters.map(e => e.id), kinds: [...kinds],
        cinematics: Object.keys(def.cinematics), campaign: def.campaign, unlocks: def.unlocks,
        structs: [...new Set(ctx.structures.all().map(i => i.type))], sundial: !!ctx.structures.get('sundial'),
        speakers: Object.keys(def.speakers),
      };
    });
    g.log('static', { ...r, validate: r.validate.slice(0, 6) });
    g.assert(r.validate.length === 0, `validateLevel(level02) returns [] (${r.validate.slice(0, 4).join('; ')})`);
    g.assert(r.length > 8000 && r.length < 9500, `route length ${r.length.toFixed(0)} m (L2 §2: about 8.8 km)`);
    g.assert(r.zones.length === 7 && r.withArt === 7, `7 zones with cards (${r.zones.join(', ')})`);
    g.assert(r.checkpoints.join() === 'cp_lip,cp_reeds,cp_ruins,cp_flats,cp_deck,cp_road', `6 checkpoints (${r.checkpoints.join(', ')})`);
    g.assert(['land_yacht', 'harpooner', 'skimmer', 'tally'].every(k => r.kinds.includes(k)), `unit kinds ${r.kinds.join(', ')}`);
    g.assert(r.campaign?.bench === true && r.campaign.waterFlags?.length === 6, 'campaign block: bench, six water flags');
    const need = ['turbine_ruin', 'substation_ruin', 'water_cache', 'rock_shelf', 'road_culvert', 'skimmer_ramp', 'salt_pole', 'waystation_ruin', 'dial_stone', 'sundial', 'road_marker', 'rig_wreck', 'yacht_wreck', 'tank_cairn', 'wake_lamp'];
    const missing = need.filter(t => !r.structs.includes(t));
    g.assert(missing.length === 0, `every Level 2 structure type is placed (${missing.join(', ') || need.length + ' types'})`);
    // the structure budget: ≤ 6 draw calls at LOD0 and a single-mesh LOD1 (the Sundial's plinth is the set piece)
    const lodr = await ev(() => {
      const S = window.__game.ctx.structures, out = {};
      for (const i of S.all()) if (!i.root) { try { S.settle(i.pos.clone()); } catch (e) { /* later */ } }
      const count = (o) => { let n = 0; o?.traverse(c => { if ((c.isMesh || c.isInstancedMesh) && !c.isSprite) n++; }); return n; };
      for (const i of S.all()) {
        if (!i.root) continue;
        const lod0 = i.root.isLOD ? i.root.levels[0]?.object : i.root, lod1 = i.root.isLOD ? i.root.levels[1]?.object : null;
        const e = (out[i.type] ||= { n: 0, calls0: 0, lod1: 0, calls1: 0 });
        e.n++; e.calls0 = Math.max(e.calls0, count(lod0));
        if (lod1 && lod1.type !== 'Object3D') { e.lod1++; e.calls1 = Math.max(e.calls1, count(lod1)); }
      }
      return out;
    });
    g.log('structure calls', lodr);
    const L2T = await ev(async () => (await import('/levels/level02/structures.js')).L2_STRUCTURE_TYPES);
    const over = Object.entries(lodr).filter(([t, e]) => L2T.includes(t) && t !== 'sundial' && e.calls0 > 6).map(([t, e]) => `${t} ${e.calls0}`);
    g.assert(over.length === 0, `every Level 2 structure type ≤ 6 draw calls at LOD0 (${over.join(', ') || 'ok'})`);
    // CampaignData v2 (addendum 02 §B4)
    const c = await ev(async () => {
      const C = (await import('/levels/campaign.js')).default;
      const l = C.legs.l02;
      return { v: C.version, frags: C.fragments.map(f => f.id), m1: C.fragments.find(f => f.id === 'M1'), leg: l && {
        day: l.day, draw: l.draw, title: l.debriefTitle, result: l.result, made: l.made, gifts: l.gifts, forced: l.forced && { part: l.forced.part },
        log: l.log && typeof l.log === 'object' ? { by: l.log.by, keys: Object.keys(l.log.variants || {}), def: !!l.log.default } : l.log,
        bench: l.bench && Object.keys(l.bench) }, roll: C.roll.length };
    });
    g.log('campaign v2', c);
    g.assert(c.v === 2 && c.frags.length === 13 && c.m1?.made === 'l02' && /WARMTH, CHEST/.test(c.m1?.gloss || ''), 'CampaignData v2: twelve old fragments plus M1 (WARMTH, CHEST)');
    g.assert(c.leg?.day === 4 && c.leg.result?.rigsLostFlag === 'cv:lost' && c.leg.result?.storyFlag === 'campaign:story' && c.leg.made?.join() === 'M1',
             'leg l02: day 4, result flags cv:lost and campaign:story, made M1');
    g.assert(c.leg?.log?.by === 'bigMercy' && c.leg.log.keys.includes('saved') && c.leg.log.keys.includes('lost'), "the Count's log line has saved and lost variants");
    // ── the clarity pass, static: tags, cards, objectives, spoilers ──
    const cl = await ev(async () => {
      const ctx = window.__game.ctx, def = ctx.mission.def;
      const T = await import('/levels/level02/terms.js');
      const json = JSON.stringify([def.triggers, def.events, def.start, def.onCheckpoint]);
      const requested = new Set();
      for (const m of json.matchAll(/"call":"term","args":\{"ids":\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"([a-z_0-9]+)"/g)) requested.add(q[1]);
      for (const id of ['harpooned', 'rig_lost']) requested.add(id);       // the convoy's own requests (convoy.js)
      const hints = (json.match(/"hint":(\{[^}]*\}|"[^"]*")/g) || []).map(h => h.replace(/^"hint":/, ''));
      const comms = def.comms;
      return {
        speakers: Object.entries(def.speakers).map(([id, s]) => ({ id, name: s.name, tag: s.tag ?? null })),
        cards: Object.entries(T.TERMS).map(([id, t]) => ({ id, term: t.term, text: JSON.stringify(t.text), key: t.key ?? null })),
        requested: [...requested], ids: Object.keys(T.TERMS),
        objectives: def.objectives.map(o => ({ id: o.id, text: o.text, marker: !!o.marker })),
        hints, briefing: def.briefing, foreman: comms.c_foreman.filter(l => l.text).map(l => l.text),
        whoUsed: [...new Set(Object.values(comms).flat().map(l => l.who).filter(Boolean))],
      };
    });
    const untagged = cl.speakers.filter(s => !s.tag || s.tag.length > 50);
    g.assert(untagged.length === 0, `every speaker has a short spoiler-free tag (${untagged.map(s => s.id).join(', ') || cl.speakers.length + ' speakers'})`);
    const unknownWho = cl.whoUsed.filter(w => !cl.speakers.find(s => s.id === w));
    g.assert(unknownWho.length === 0, `every comms speaker is defined (${unknownWho.join(', ') || cl.whoUsed.length})`);
    const anon = ['TALLOW', 'FOREMAN'].map(id => cl.speakers.find(s => s.id === id));
    g.assert(anon.every(s => s && s.name === '' && s.tag === 'unknown voice'), 'the Watcher and the broadcast voice stay unnamed ("unknown voice")');
    const LORE = /\b(lattice|kernel|cantors?|passengers?|carried|pressed|stillwater|tallow|corran|pell|gnomon|warmth)\b/i;
    const shownEarly = [...cl.speakers.map(s => ['tag ' + s.id, s.tag]), ...cl.cards.map(c => ['card ' + c.id, c.term + ' ' + c.text]),
                        ...cl.objectives.map(o => ['objective ' + o.id, o.text]), ...cl.hints.map((h, i) => ['hint ' + i, h]),
                        ['briefing', JSON.stringify(cl.briefing)]];
    const leaks = shownEarly.filter(([, t]) => LORE.test(t || '') || /\bmoth\b/i.test(t || '') && /tag|briefing/.test(''));
    g.assert(leaks.length === 0, `no story spoilers in tags, cards, objectives, hints or the briefing (${shownEarly.length} strings${leaks.length ? '; ' + leaks.slice(0, 3).map(l => l[0] + ': ' + l[1]).join(' | ') : ''})`);
    const PILOT = /\b(juno|pilot|she|her|girl)\b[^.]*\b(dead|ghost|carried|passenger|body)\b/i;
    const pilot = shownEarly.filter(([, t]) => PILOT.test(t || ''));
    g.assert(pilot.length === 0, `never "dead", "ghost", "carried", "passenger" or "body" about the pilot (${pilot.map(p => p[0]).join(', ') || 'ok'})`);
    const badCards = cl.cards.filter(c => {
      const t = JSON.parse(c.text), text = typeof t === 'object' ? t.desktop : t;
      const n = (text.match(/[.!?](\s|$)/g) || []).length;
      return !c.term || !text || n < 1 || n > 3 || text.length > 240;
    });
    g.assert(badCards.length === 0, `every card is a term plus at most three plain sentences (L2 §5.2) (${cl.cards.length} cards${badCards.length ? '; ' + badCards.map(c => c.id).join(', ') : ''})`);
    const unasked = cl.ids.filter(id => !cl.requested.includes(id)), unknownAsk = cl.requested.filter(id => !cl.ids.includes(id));
    g.assert(unasked.length === 0 && unknownAsk.length === 0, `every card is asked for by the level and every request has a card (${cl.ids.length}${unasked.length ? '; never asked ' + unasked : ''}${unknownAsk.length ? '; unknown ' + unknownAsk : ''})`);
    const PLACE = /\b(at|to|on|in|into|off|through|under|by|beside|the road|the Tally|the cable|the frame)\b/i;
    const vague = cl.objectives.filter(o => !/^[A-Z][a-z]+\b/.test(o.text) || o.text.length > 60 || !(o.marker || PLACE.test(o.text)));
    g.assert(vague.length === 0, `objectives say what to do and where (${cl.objectives.length}${vague.length ? '; ' + vague.map(o => o.id + ': ' + o.text).join(' | ') : ''})`);
    const V = ['Do you know what a day costs on Gaunt, little rig? Ten years of walking. Nobody gets to sit down.', 'Work is the only prayer that gets answered.', 'The Still is ice and bones. Turn around and work.'];
    g.assert(V.every((v, i) => cl.foreman[i] === v), 'the broadcast is bible §12.1 V2, V3, V5 character for character');
    await noErrors('static');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z1 · the lip
  if (only.has('lip')) {
    await start('cp_lip');
    await g.setGod(true);
    let r = await until((ctx) => ctx.cinematics?.active, null, 1, 2);
    g.assert(r.ok, 'the vista opens the level (the Sundial on the horizon)');
    if (SHOTS) { await step(4); await shot('z1_vista', { hud: false }); }
    await skipCine();
    r = await until((ctx) => ctx.mission.objective('o_escort')?.state === 'active', null, 40);
    g.assert(r.ok, `o_escort: Escort the Wake to the Sundial (${r.t.toFixed(1)} s)`);
    const lines = await ev(() => window.__l02lines.map(l => l.who + ': ' + l.text));
    g.assert(lines.includes("OMA: Morning, girl. You haven't climbed down since the ice.") && lines.includes('MOTH: She is resting.'), 'c_morning (the L2 clue, innocent reading)');
    const s0 = await ev(() => window.__game.ctx.l02.convoy.s);
    await step(10);
    const cv = await ev(() => { const C = window.__game.ctx.l02.convoy; return { s: C.s, v: C.v, mode: C.mode, n: C.rollCount() }; });
    g.assert(cv.s > s0 + 40 && cv.mode === 'roll', `the convoy rolls north (s ${s0.toFixed(0)} → ${cv.s.toFixed(0)}, ${cv.v.toFixed(1)} m/s)`);
    g.assert(cv.n.rigs === 40 && cv.n.souls === 300, `40 rigs, 300 souls on the road (${cv.n.rigs}, ${cv.n.souls})`);
    const trk = await ev(() => { const h = window.__game.ctx.hud; return typeof h?.tracker === 'function' ? h.trackerState : 'none'; });
    if (trk === 'none') skip('hud.tracker (E5) not present');
    else g.assert(trk?.title === 'THE WAKE' && /40 RIGS · 300 SOULS/.test(trk.value || ''), `the tracker: ${JSON.stringify(trk)?.slice(0, 120)}`);
    if (SHOTS) {
      await shot('z1_gameplay');
      // facing the sun (azimuth 150) from the convoy
      const a = await routePos(cv.s, -120, 6);
      const sx = a[0] + Math.sin(150 * Math.PI / 180) * 400, sz = a[2] - Math.cos(150 * Math.PI / 180) * 400;
      await vista('z1_facing_sun', a, [sx, a[1] + 40, sz], 60);
      await roadVista('z1_road_80m', cv.s - 200);
      await budget('Z1 the lip');
    }
    // the band: 600 m soft, 700 m hard, 30 s grace
    const c = await ev(() => { const C = window.__game.ctx.l02.convoy; const p = C.centre(); return [p.x, p.z, C.s]; });
    let a = await routePos(c[2], -660); await g.teleport([a[0], a[2]]);
    r = await until(() => window.__l02fired.has('t_band'), null, 3, 6);
    g.assert(r.ok, 't_band: Oma, "Girl. Where are you going?" beyond 600 m');
    a = await routePos(c[2], -760); await g.teleport([a[0], a[2]]);
    await step(1, 6);
    const out1 = await ev(() => ({ out: window.__game.ctx.l02.convoy.outside, st: window.__game.ctx.l02.convoy.bandState }));
    g.assert(out1.out && out1.st?.state === 'out', `beyond 700 m: out of the band, a clock (${JSON.stringify(out1.st)})`);
    r = await until((ctx, L) => L.convoy.bandBroken, null, 33, 30);
    g.assert(r.ok, `30 s outside: the band breaks (raids land without her) (${r.t.toFixed(0)} s)`);
    a = await routePos(c[2] + 20, -80); await g.teleport([a[0], a[2]]);
    await step(1, 6);
    const back = await ev(() => { const C = window.__game.ctx.l02.convoy; return { out: C.outside, broken: C.bandBroken, next: C.nextInstant }; });
    g.assert(!back.out && !back.broken && !back.next, 'back with the Wake: the band is whole again');
    await noErrors('lip');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z2 · raid 1
  if (only.has('raid')) {
    await start('cp_lip');
    await g.setGod(true);
    await skipCine();
    await step(2);
    await skipCine();
    await convoyTo(1340, { l: -160 });
    let r = await until((ctx) => ctx.enemies.count({ tag: 'raid1' }) >= 3, null, 6, 6);
    g.assert(r.ok && await hasFired('t_raid1'), 't_raid1: three land-yachts stalk the left flank');
    const stalk = await ev(() => window.__game.ctx.enemies.alive({ tag: 'raid1' }).map(u => ({ m: u.mode, tg: u.targetable, mast: +(u.parts?.mast?.rotation?.x ?? 0).toFixed(2) })));
    g.log('stalking', stalk);
    g.assert(stalk.every(u => u.tg === false), 'stalking yachts: masts down, not targetable (a reed wake only)');
    if (SHOTS) {
      await step(4);
      // the reed wake: a camera low over the reeds behind the nearest stalker
      const v = await ev(() => { const u = window.__game.ctx.enemies.alive({ tag: 'raid1' })[0]; const f = [-Math.sin(u.yaw), -Math.cos(u.yaw)]; return { at: [u.pos.x - f[0] * 30 + 12, u.pos.y + 7, u.pos.z - f[1] * 30 + 8], look: [u.pos.x + f[0] * 20, u.pos.y + 1, u.pos.z + f[1] * 20] }; });
      await vista('z2_reed_wake', v.at, v.look, 50);
    }
    r = await until((ctx, L) => L.counters.brokeCover > 0, null, 60, 30);
    g.assert(r.ok && (await until(() => window.__l02fired.has('t_raid1_seen'), null, 1, 6)).ok, `the first yacht breaks cover: t_raid1_seen, o_raid1 (${r.t.toFixed(0)} s)`);
    // a hooked rig: the hooker's natural harpoon, or a forced one if it hasn't fired yet
    r = await until(() => window.__l02clar.hooks.length > 0, null, 30, 30);
    if (!r.ok) {
      await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, u = ctx.enemies.alive({ tag: 'hooker' })[0] || ctx.enemies.alive({ tag: 'raid1' })[0]; L.convoy.hook(u, L.convoy.byId.get(18), { kind: 'yacht' }); });
      g.log('hook forced');
    }
    const hk = await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, h = L.convoy.hooks[0]; return h && { id: h.rig.id, name: h.rig.name, n: h.n, obj: ctx.mission.objective('o_free' + h.n), cable: ctx.combat.query({ tag: 'free' + h.n }).length, state: h.rig.state }; });
    g.log('hook', hk);
    g.assert(hk && hk.state === 'hooked' && hk.cable === 1 && hk.obj?.state === 'active' && hk.obj.text.includes(hk.name), `a rig is harpooned: o_free${hk?.n} "${hk?.obj?.text}", a CABLE target`);
    const hl = await ev(() => window.__l02lines.filter(l => /hooked!/.test(l.text)).map(l => l.text));
    g.assert(hl.some(t => t.includes(hk.name)), `c_hooked names the rig (${hl[0]})`);
    if (SHOTS) {
      await ev(() => { const L = window.__game.ctx.l02, h = L.convoy.hooks[0], p = window.__game.ctx.player; if (h) { const r = h.rig.pos; p.teleport(new p.pos.constructor(r.x + 45, NaN, r.z + 25), Math.atan2(-(r.x - (r.x + 45)), -(r.z - (r.z + 25)))); } });
      await step(0.5, 6);
      await shot('z2_hooked_rig');
    }
    // cut it free with the blade (one hit)
    await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, h = L.convoy.hooks[0]; ctx.combat.damage(h.cable, 50, 0, { team: 'player', kind: 'blade', owner: ctx.player }); });
    r = await until(() => window.__l02clar.freed.length > 0, null, 2, 6);
    g.assert(r.ok, 'the blade cuts the cable in one hit: the rig is freed');
    r = await until(() => window.__l02lines.some(l => /LOOSE|back in her column/.test(l.text)), null, 4, 6);
    g.assert(r.ok, 'c_freed_kit / c_freed_hesper');
    // a lost rig: hook one and let the clock run out
    const lostId = await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, u = ctx.enemies.alive({ tag: 'raid1' })[0]; const rig = L.convoy.byId.get(8); u.cd = 99; L.convoy.hook(u, rig, { kind: 'yacht' }); return rig.id; });
    r = await until((ctx, L, id) => L.convoy.lost.has(id), lostId, 30, 30);
    g.assert(r.ok, `25 s on the cable: the rig is hauled away (${r.t.toFixed(0)} s)`);
    const lostF = await flag('cv:lost');
    g.assert(Array.isArray(lostF) && lostF.includes(lostId), `cv:lost carries Roll id ${lostId} (${JSON.stringify(lostF)})`);
    r = await until(() => window.__l02lines.some(l => /We've lost/.test(l.text)), null, 4, 6);
    g.assert(r.ok, 'c_lost');
    const nn = await ev(() => window.__game.ctx.l02.convoy.rollCount());
    g.assert(nn.rigs === 39, `the Roll shows 39 rigs (${nn.rigs}, ${nn.souls} souls)`);
    // TEAR: stagger a yacht beside the frame, hold BLADE
    const tear = await ev(() => {
      const ctx = window.__game.ctx, p = ctx.player, u = ctx.enemies.alive({ tag: 'raid1' }).find(x => x.targetable !== false) || ctx.enemies.alive({ tag: 'raid1' })[0];
      if (!u) return { ok: false };
      u.mode = 'rake'; u.targetable = true;
      p.teleport(u.pos.clone().add(new p.pos.constructor(14, 0, 0)).setY(NaN), Math.PI / 2);
      u.speed = 0; u.vel?.set?.(0, 0, 0);
      ctx.combat.damage(u, 50, 5000, { team: 'player', kind: 'rifle', owner: p });
      return { ok: true, stag: u.stagT, haul: u.haul?.part };
    });
    g.log('tear setup', tear);
    r = await until((ctx) => !!ctx.haul?.candidate, null, 2, 2);
    if (r.ok) {
      await g.input({ clear: true, hold: { blade: true } });
      r = await until((ctx) => (ctx.haul?.rack?.length ?? 0) >= 1, null, 4, 2);
      await g.input({ clear: true });
      g.assert(r.ok, `TEAR: the Sail-Rig in the rack (${await ev(() => JSON.stringify(window.__game.ctx.haul?.rack))})`);
      r = await until(() => window.__l02fired.has('t_first_tear') && window.__l02fired.has('t_sail'), null, 4, 6);
      g.assert(r.ok, 't_first_tear ("Oma\'ll want that.") and the sail_rig card');
    } else g.assert(false, `TEAR candidate on a staggered yacht (${JSON.stringify(tear)})`);
    // clear the raid (wave 2 comes from behind)
    await kill({ tag: 'enc:e_raid1' });
    r = await until(() => window.__l02fired.has('t_wave2'), null, 6, 6);
    g.assert(r.ok, 't_wave2: two more sails behind, right side');
    await step(1);
    await kill({ tag: 'enc:e_raid1' });
    r = await until((ctx) => ctx.mission.flags['p:raid1Clear'] && ctx.mission.checkpoint === 'cp_reeds', null, 8, 6);
    g.assert(r.ok, 't_raid1_clear: p:raid1Clear, checkpoint cp_reeds');
    await kill({ tag: 'raid1x' });
    if (SHOTS) { await roadVista('z2_reeds_80m', 2300); await shot('z2_gameplay'); }
    await noErrors('raid');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z3 · cache A, the Watcher
  if (only.has('watcher')) {
    await start('cp_reeds');
    await g.setGod(true);
    await step(1);
    let r = await until((ctx) => ctx.mission.flags['p:raid1Clear'], null, 1, 6);
    g.assert(r.ok, 'cp_reeds cold start: p:raid1Clear');
    await convoyTo(2700, { l: -150 });
    r = await until(() => window.__l02fired.has('t_cacheA_spot'), null, 3, 6);
    g.assert(r.ok, 't_cacheA_spot: o_cacheA, the tanks flagged with an interaction');
    const ca = await ev(() => { const L = window.__game.ctx.l02, v = L.cachePos('cacheA'); return [v.x, v.y, v.z]; });
    await g.teleport([ca[0] + 6, ca[2] + 4]);
    r = await until(() => window.__l02fired.has('t_cacheA_near'), null, 2, 6);
    await holdInteract(2.2);
    r = await until((ctx) => ctx.mission.flags.cacheA && ctx.mission.objective('o_cacheA')?.state === 'done', null, 3, 6);
    g.assert(r.ok, 'cache A flagged (hold INTERACT): o_cacheA done, Lantern Line');
    if (SHOTS) { await vista('z3_cacheA', [ca[0] + 14, ca[1] + 5, ca[2] + 10], [ca[0], ca[1] + 1.5, ca[2]], 50); }
    await convoyTo(2850, { l: -100 });
    r = await until((ctx, L) => L.watcher.state === 'stand', null, 3, 6);
    g.assert(r.ok, 't_watcher: the Watcher stands on the ridge');
    const w = await ev(() => { const W = window.__game.ctx.l02.watcher; return { pos: [W.pos.x, W.pos.y, W.pos.z], glow: !!W.glow, y: W.pos.y }; });
    g.log('watcher', w);
    r = await until(() => window.__l02lines.some(l => l.who === 'TALLOW' && l.text === 'Hello hello.'), null, 20, 10);
    g.assert(r.ok, '"Hello hello." on the local channel; "Interference."');
    const tl = await ev(() => window.__l02lines.find(l => l.who === 'TALLOW'));
    g.assert(tl && !tl.name, `the voice has no name (${JSON.stringify(tl)})`);
    if (SHOTS) {
      const a = await routePos(2950, 200, 12);
      await vista('z3_watcher', a, [w.pos[0], w.pos[1] + 7, w.pos[2]], 30);
      await roadVista('z3_ridge_80m', 2800, { l: 100 });
    }
    r = await until((ctx, L) => L.watcher.gone, null, 70, 30);
    g.assert(r.ok, `the Watcher leaves east over the crest without firing (${r.t.toFixed(0)} s)`);
    r = await until(() => window.__l02fired.has('t_watcher_gone'), null, 3, 6);
    g.assert(r.ok, 't_watcher_gone: "It didn\'t even shoot."');
    await noErrors('watcher');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z4 · the ruins
  if (only.has('ruins')) {
    await start('cp_ruins');
    await g.setGod(true);
    let r = await until((ctx) => ctx.enemies.count({ tag: 'enc:e_ruins' }) >= 5, null, 3, 6);
    g.assert(r.ok && await obj('o_ruins') === 'active', 'cp_ruins cold start: e_ruins (3 harpooners, 2 yachts), o_ruins');
    r = await until(() => window.__l02lines.some(l => l.who === 'RUSK'), null, 10, 10);
    const rl = await ev(() => window.__l02lines.find(l => l.who === 'RUSK'));
    g.assert(r.ok && /TALLYMAN/.test(rl?.name || ''), `c_rusk1: the Tallyman (${rl?.name})`);
    r = await until((ctx, L) => L.counters.unitOut > 0, null, 40, 30);
    g.assert(r.ok, `a harpooner steps out of cover (${r.t.toFixed(0)} s)`);
    r = await until(() => window.__l02fired.has('t_harpooner'), null, 3, 6);
    g.assert(r.ok, 't_harpooner');
    // the ruins fight with a hooked rig (a harpooner's winch)
    await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, u = ctx.enemies.alive({ tag: 'harpooner' })[0]; if (u && L.convoy.canHook()) L.convoy.hook(u, L.convoy.byId.get(35), { kind: 'winch' }); });
    if (SHOTS) {
      const v = await ev(() => { const L = window.__game.ctx.l02, h = L.convoy.hooks[0]; if (!h) return null; const r = h.rig.pos, u = h.puller.pos; return { at: [r.x + (r.x - u.x) * 0.6 + 20, r.y + 14, r.z + (r.z - u.z) * 0.6 + 10], look: [(r.x + u.x) / 2, r.y + 4, (r.z + u.z) / 2] }; });
      await step(2);
      if (v) await vista('z4_ruins_hooked', v.at, v.look, 55);
      await shot('z4_gameplay');
      await roadVista('z4_ruins_80m', 3900);
      await budget('Z4 the ruins');
      // 2 m from a turbine ruin (bevel check)
      const t = await ev(() => { const i = window.__game.ctx.structures.all().find(s => s.type === 'turbine_ruin' && !s.params?.fallen); return i && [i.pos.x, i.pos.y, i.pos.z]; });
      if (t) await vista('z4_turbine_close', [t[0] + 5.5, t[1] + 3, t[2] + 3], [t[0], t[1] + 6, t[2]], 60);
    }
    await kill({ tag: 'enc:e_ruins' });
    r = await until(() => window.__l02fired.has('t_rusk2'), null, 6, 6);
    g.assert(r.ok, 't_rusk2: the wave from the far ruins ("Your frame\'s handshake is loud.")');
    await step(1);
    await kill({ tag: 'enc:e_ruins' });
    r = await until((ctx) => ctx.mission.flags['p:ruinsClear'], null, 6, 6);
    g.assert(r.ok, 't_ruins_clear: p:ruinsClear');
    r = await until(() => window.__l02lines.some(l => l.text === "What's a handshake?"), null, 40, 10);
    g.assert(r.ok, 'c_handshake (the L2 clue, innocent reading)');
    await noErrors('ruins');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z4 north · Sync, volleys
  if (only.has('volley')) {
    await start('cp_ruins');
    await g.setGod(true);
    await step(1);
    await kill({ tag: 'enc:e_ruins' }); await step(1); await kill({ tag: 'enc:e_ruins' });
    let r = await until((ctx) => ctx.mission.flags['p:ruinsClear'], null, 6, 6);
    await convoyTo(4550, { l: -100 });
    r = await until(() => window.__l02fired.has('t_sync'), null, 3, 6);
    g.assert(r.ok, 't_sync');
    const hasSync = await ev(() => typeof window.__game.ctx.sync?.unlock === 'function');
    r = await until(() => window.__l02lines.some(l => l.text === 'Juno. I have context now. I can anticipate you.'), null, 30, 10);
    g.assert(r.ok, 'c_sync (Moth)');
    if (hasSync) {
      const sy = await ev(() => { const S = window.__game.ctx.sync; return { en: S.enabled, un: [...S.unlocked], fill: S.fill }; });
      g.assert(sy.en && sy.un.includes('sight') && sy.fill >= 3, `Sync on, Second Sight unlocked, filled to 3 (${JSON.stringify(sy)})`);
    } else skip('ctx.sync (E1) not present: the volleys play without Second Sight');
    r = await until((ctx, L) => L.skyline?.visible, null, 40, 30);
    g.assert(r.ok, 'the Tally appears on the far flats (c_kite, c_tally_seen)');
    if (SHOTS) {
      const sk = await ev(() => { const S = window.__game.ctx.l02.skyline; return [S.at.x, S.at.y, S.at.z]; });
      const a = await routePos(4560, -150, 10);
      await vista('z4_tally_horizon', a, [sk[0], sk[1] + 30, sk[2]], 35);
    }
    r = await until((ctx, L) => L.volleys.sets.has(1), null, 30, 30);
    g.assert(r.ok, 'volley 1 launches');
    if (hasSync) {
      const act = await ev(() => window.__game.ctx.sync.active);
      g.assert(act?.move === 'sight' && act.free, `Second Sight fires for free at volley 1 (${JSON.stringify(act)})`);
    }
    if (SHOTS) { await step(3.5, 6); await shot('z4_second_sight'); }
    r = await until((ctx, L) => L.volleys.landed(1), null, 16, 10);
    g.assert(r.ok, 'volley 1 lands');
    r = await until((ctx, L) => L.volleys.landed(2), null, 40, 30);
    g.assert(r.ok, 'volley 2 lands');
    r = await until((ctx) => ctx.mission.flags.volleyDone && ctx.mission.objective('o_volley')?.state === 'done', null, 4, 6);
    g.assert(r.ok, 'volleyDone: o_volley done');
    r = await until((ctx) => ctx.mission.flags['p:mercyReady'], null, 16, 10);
    g.assert(r.ok, 'p:mercyReady 12 s after the volleys');
    await noErrors('volley');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z5 · Big Mercy saved
  if (only.has('mercy')) {
    await start('cp_ruins');
    await g.setGod(true);
    await step(1);
    await kill({ tag: 'enc:e_ruins' }); await step(1); await kill({ tag: 'enc:e_ruins' });
    await until((ctx) => ctx.mission.flags['p:ruinsClear'], null, 6, 6);
    // straight to the set piece: the volleys are done (their own section plays them)
    await ev(() => { const ctx = window.__game.ctx; for (const id of ['t_sync']) ctx.mission.disable?.(id); ctx.mission.setFlag('p:sync', true); ctx.mission.setFlag('volleyDone', true); ctx.mission.setFlag('p:mercyReady', true); });
    await ev(() => { const m = window.__game.ctx.mission; m.run([{ disable: 't_sync' }]); });
    await convoyTo(4895, { l: -120 });
    let r = await until(() => window.__l02fired.has('t_mercy'), null, 3, 6);
    g.assert(r.ok, 't_mercy: Big Mercy is harpooned');
    r = await until((ctx) => ctx.cinematics?.active, null, 3, 2);
    g.assert(r.ok, 'the harpoon shot plays (framed on Big Mercy)');
    if (SHOTS && r.ok) { await step(5, 6); await shot('z5_harpoon', { hud: false }); }
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_flats' && ctx.mission.objective('o_cables')?.state === 'active', null, 20, 10);
    g.assert(r.ok, 'cp_flats; o_cables: cut the three cables');
    const dr = await ev(() => { const ctx = window.__game.ctx, L = ctx.l02, T = L.tally; return T && { phase: T.phase, cables: ctx.combat.query({ tag: 'mercyCable' }).length, bm: L.convoy.byId.get(3).state, circle: L.convoy.mode, band: L.convoy.bandMode }; });
    g.log('drag', dr);
    g.assert(dr?.cables === 3 && dr.bm === 'mercy' && dr.circle === 'circle' && dr.band === 'bigMercy', `the drag: three cables, Big Mercy on the lane, the Wake circles, the band follows her (${JSON.stringify(dr)})`);
    await step(6);
    if (SHOTS) {
      const v = await ev(() => { const L = window.__game.ctx.l02, T = L.tally, b = L.convoy.byId.get(3).pos; return { at: [b.x + 70, b.y + 30, b.z + 60], look: [(T.pos.x + b.x) / 2, b.y + 6, (T.pos.z + b.z) / 2] }; });
      await vista('z5_drag', v.at, v.look, 55);
      await shot('z5_gameplay');
      await budget('Z5 the drag');
    }
    // cut the cables one by one
    for (let i = 0; i < 3; i++) {
      await ev(() => { const ctx = window.__game.ctx, c = ctx.combat.query({ tag: 'mercyCable' }).find(t => t.alive); if (c) ctx.combat.damage(c, 99999, 0, { team: 'player', kind: 'blade', owner: ctx.player }); });
      await step(1.5, 6);
    }
    r = await until((ctx) => ctx.mission.flags.bigMercySaved, null, 6, 6);
    g.assert(r.ok && await hasFired('t_cable1') && await hasFired('t_cable2'), 't_cable1, t_cable2, mercyFree: bigMercySaved');
    const story = await flag('campaign:story');
    g.assert(story?.bigMercy === 'saved', `campaign:story ${JSON.stringify(story)}`);
    r = await until((ctx) => ctx.mission.flags['tally:anchored'] && ctx.mission.checkpoint === 'cp_deck', null, 60, 30);
    if (!r.ok) g.log('anchor diag', await ev(() => { const ctx = window.__game.ctx, T = ctx.l02.tally; return { phase: T?.phase, anc: T?.anc && { ...T.anc }, alive: T?.alive, f: ctx.mission.flags['tally:phase'], cp: ctx.mission.checkpoint, lines: window.__l02lines.slice(-4).map(l => l.text) }; }));
    g.assert(r.ok, `the Tally anchors broadside: cp_deck (${r.t.toFixed(0)} s)`);
    g.assert(await obj('o_mast') === 'active', 'o_mast: board the Tally and break its mainmast');
    await noErrors('mercy');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z5 · Big Mercy lost
  if (only.has('lost')) {
    await start('cp_flats');
    await g.setGod(true);
    let r = await until((ctx, L) => L.tally?.phase === 1 && ctx.combat.query({ tag: 'mercyCable' }).length === 3, null, 4, 6);
    g.assert(r.ok, 'cp_flats cold start: the Tally drags Big Mercy on three cables');
    r = await until(() => window.__l02fired.has('t_mercy_half'), null, 200, 60);
    g.assert(r.ok, `c_mercy_half (${r.t.toFixed(0)} s)`);
    r = await until((ctx) => ctx.mission.flags.bigMercyLost, null, 220, 60);
    g.assert(r.ok, `nobody cuts the cables: Big Mercy goes over the edge (${r.t.toFixed(0)} s more)`);
    const lf = await ev(() => ({ lost: window.__game.ctx.mission.flags['cv:lost'], story: window.__game.ctx.mission.flags['campaign:story'], bm: window.__game.ctx.l02.convoy.byId.get(3).state }));
    g.assert(lf.lost?.includes(3) && lf.story?.bigMercy === 'lost' && lf.bm === 'gone', `cv:lost has Big Mercy (3); campaign:story lost (${JSON.stringify(lf)})`);
    r = await until(() => window.__l02lines.some(l => l.text === "Big Mercy's over the edge. She's gone."), null, 6, 10);
    g.assert(r.ok, 'c_mercy_lost');
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_deck', null, 30, 30);
    g.assert(r.ok, 'the Tally anchors: cp_deck');
    await noErrors('lost');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z5 · the deck, Hold, capsize
  if (only.has('deck')) {
    await start('cp_deck');
    let r = await until((ctx, L) => L.tally?.phase === 2, null, 3, 6);
    const dk = await ev(() => { const ctx = window.__game.ctx, T = ctx.l02.tally, p = ctx.player; return T && { boss: T.boss, name: T.name, d: Math.hypot(p.pos.x - T.pos.x, p.pos.z - T.pos.z), mast: ctx.combat.query({ tag: 'mainmast' }).length }; });
    g.assert(r.ok && dk?.boss && dk.mast === 1 && dk.d > 50 && dk.d < 95, `cp_deck cold start: the Tally anchored, boss THE TALLY, the frame 70 m off its port side (${JSON.stringify(dk)})`);
    // board: onto the deck
    await ev(() => { const ctx = window.__game.ctx, T = ctx.l02.tally, p = ctx.player; p.teleport(new p.pos.constructor(T.pos.x + Math.cos(T.yaw) * 1, T.pos.y + 14, T.pos.z - Math.sin(T.yaw) * 1), T.yaw); });
    await step(1.5, 6);
    const on = await ev(() => { const ctx = window.__game.ctx; return { on: ctx.l02.tally.onDeck(ctx.player), y: ctx.player.pos.y - ctx.l02.tally.pos.y, g: ctx.player.onGround }; });
    g.log('on deck', on);
    if (SHOTS) { await shot('z5_deck'); }
    r = await until(() => window.__l02fired.has('t_drive'), null, 14, 10);
    g.assert(r.ok, 't_drive: Moth drives');
    const hasSync = await ev(() => typeof window.__game.ctx.sync?.unlock === 'function');
    if (hasSync) g.assert(await ev(() => window.__game.ctx.sync.unlocked.has('drive')), 'Moth Drives unlocked');
    // the Hold: the mast below 60 %, the frame close → the sweeper's scripted shot
    await g.setGod(false);
    await ev(() => { const ctx = window.__game.ctx, m = ctx.combat.query({ tag: 'mainmast' })[0]; m.ap = m.apMax * 0.55; ctx.player.ap = ctx.player.apMax; });
    r = await until(() => window.__l02fired.has('t_hold'), null, 4, 6);
    g.assert(r.ok, 't_hold: the sweeper turns on the frame (c_sweeper)');
    r = await until((ctx) => ctx.mission.flags['p:holdShot'], null, 12, 6);
    const hold = await ev(() => ({ ap: window.__game.ctx.player.ap, alive: window.__game.ctx.player.alive, holds: window.__l02clar.holds, flow: window.__game.ctx.flow.state }));
    g.assert(r.ok && hold.alive && hold.ap > 0 && hold.flow === 'playing', `the Hold shot: the frame lives (${JSON.stringify(hold)})`);
    if (hasSync) g.assert(hold.holds >= 1, 'the engine Hold fired on the killing hit (sync:hold)');
    else skip('Hold (E1): the scripted shot is non-lethal without ctx.sync');
    r = await until(() => window.__l02lines.some(l => l.text === 'Hold on to me.'), null, 8, 10);
    g.assert(r.ok, 'c_hold: "Hold on to me."');
    await g.setGod(true);
    await step(4);
    // break the mainmast
    await ev(() => { const ctx = window.__game.ctx, m = ctx.combat.query({ tag: 'mainmast' })[0]; ctx.combat.damage(m, m.ap * 0.8, 0, { team: 'player', kind: 'rifle', owner: ctx.player }); });
    r = await until(() => window.__l02fired.has('t_mast_low'), null, 3, 6);
    g.assert(r.ok, 't_mast_low');
    await ev(() => { const ctx = window.__game.ctx, m = ctx.combat.query({ tag: 'mainmast' })[0]; if (m) ctx.combat.kill(m); });
    r = await until(() => window.__l02fired.has('t_capsize'), null, 4, 6);
    g.assert(r.ok, 't_capsize: the mast falls');
    if (SHOTS) { await step(3, 6); await shot('z5_capsize', { hud: false }); }
    r = await until((ctx) => ctx.mission.checkpoint === 'cp_road', null, 20, 10);
    g.assert(r.ok, 'the capsize ends: cp_road');
    const rk = await ev(() => ({ rusk: window.__game.ctx.mission.flags['l02:ruskFled'], wreck: !!window.__game.ctx.mission.flags['tally:wreck'] }));
    g.assert(rk.rusk && rk.wreck, `Rusk flees on his Skimmer; the Tally is a wreck (${JSON.stringify(rk)})`);
    await noErrors('deck');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z6 · Skimmers, the broadcast
  if (only.has('road')) {
    await start('cp_road');
    await g.setGod(true);
    let r = await until((ctx) => ctx.enemies.count({ kind: 'skimmer' }) >= 4, null, 4, 6);
    g.assert(r.ok && await obj('o_skimmers') === 'active', 'cp_road cold start: four Skimmers, o_skimmers');
    const rf = await ev(() => { const L = window.__game.ctx.l02, bm = L.convoy.byId.get(3); return { bm: bm.state, lost: window.__game.ctx.mission.flags.bigMercyLost, mode: L.convoy.mode }; });
    g.assert(rf.mode === 'roll' && rf.bm !== 'gone', `the Wake re-forms its columns, Big Mercy back in hers (${JSON.stringify(rf)})`);
    await step(6);
    if (SHOTS) {
      const v = await ev(() => { const u = window.__game.ctx.enemies.alive({ kind: 'skimmer' })[0]; return u && { at: [u.pos.x + 30, u.pos.y + 10, u.pos.z + 30], look: [u.pos.x, u.pos.y + 1, u.pos.z] }; });
      if (v) await vista('z6_skimmer', v.at, v.look, 45);
      await shot('z6_gameplay');
      await budget('Z6 the Skimmers');
    }
    r = await until(() => window.__l02fired.has('t_hungry'), null, 30, 30);
    g.assert(r.ok, 't_hungry: "That one is hungry. It will need room."');
    await kill({ kind: 'skimmer' });
    r = await until((ctx) => ctx.enemies.count({ kind: 'skimmer' }) >= 2, null, 6, 6);
    g.assert(r.ok, 'wave 1: two more Skimmers from the east');
    await step(1);
    await kill({ kind: 'skimmer' });
    r = await until((ctx) => ctx.mission.flags['p:skimClear'], null, 6, 6);
    g.assert(r.ok, 't_skimmers_clear: p:skimClear');
    await convoyTo(7000, { l: -80 });
    r = await until(() => window.__l02fired.has('t_foreman'), null, 3, 6);
    g.assert(r.ok, 't_foreman: the broadcast');
    r = await until(() => window.__l02lines.some(l => l.who === 'FOREMAN' && l.text === 'The Still is ice and bones. Turn around and work.'), null, 40, 30);
    const fl = await ev(() => window.__l02lines.find(l => l.who === 'FOREMAN'));
    g.assert(r.ok && !fl?.name, 'the Foreman (unnamed) on every channel, V2/V3/V5');
    r = await until(() => window.__l02lines.some(l => /humming over him|Drive louder/.test(l.text)), null, 20, 10);
    g.assert(r.ok, 'the saved variant after the broadcast ("Everybody HUM.")');
    if (SHOTS) await roadVista('z6_road_80m', 6800);
    await noErrors('road');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ Z7 · the Sundial, camp, end
  if (only.has('camp')) {
    await start('cp_road');
    await g.setGod(true);
    await step(1);
    await kill({ kind: 'skimmer' }); await step(1); await kill({ kind: 'skimmer' });
    let r = await until((ctx) => ctx.mission.flags['p:skimClear'], null, 6, 6);
    await ev(() => window.__game.ctx.mission.run([{ disable: 't_foreman' }]));
    await convoyTo(7650, { l: 60 });
    r = await until(() => window.__l02fired.has('t_dial'), null, 3, 6);
    g.assert(r.ok, 't_dial: the dial ring');
    if (SHOTS) {
      await roadVista('z7_dial_80m', 7600, { look: await routePos(8250, 130, 600) });
      const st = await ev(() => { const s = window.__game.ctx.structures.all().find(i => i.type === 'dial_stone'); return s && [s.pos.x, s.pos.y, s.pos.z]; });
      if (st) await vista('z7_dial_stone_close', [st[0] + 4, st[1] + 4, st[2] + 4], [st[0], st[1] + 10, st[2]], 60);
    }
    await convoyTo(7700, { l: 60 });
    r = await until(() => window.__l02fired.has('t_cacheB_spot'), null, 3, 6);
    g.assert(r.ok, 't_cacheB_spot');
    const cb = await ev(() => { const v = window.__game.ctx.l02.cachePos('cacheB'); return [v.x, v.y, v.z]; });
    await g.teleport([cb[0] + 6, cb[2] + 4]);
    await step(0.5, 6);
    await holdInteract(2.2);
    r = await until((ctx) => ctx.mission.flags.cacheB, null, 3, 6);
    g.assert(r.ok, 'cache B flagged');
    await convoyTo(8556, { l: 60 });
    r = await until(() => window.__l02fired.has('t_camp'), null, 4, 6);
    g.assert(r.ok, 't_camp: the Wake parks in the shadow stripe');
    r = await until((ctx, L) => L.convoy.modeT > 32, null, 40, 30);
    const camp = await ev(() => {
      const L = window.__game.ctx.l02, S = L.stripe;
      const live = L.convoy.rigs.filter(r => r.state === 'camp');
      return { n: live.length, outside: live.filter(r => !S.inShade(r.pos.x, r.pos.z, 0)).map(r => r.name), bench: (() => { const b = L.convoy.byId.get(1); return b && [b.pos.x, b.pos.z]; })() };
    });
    g.assert(camp.n >= 30 && camp.outside.length === 0, `every parked rig is inside the shadow stripe (${camp.n} rigs; outside: ${camp.outside.join(', ') || 'none'})`);
    // into the shade: the blend
    const bp = await routePos(8580, 125);
    await g.teleport([bp[0] + 12, bp[2] + 8]);
    r = await until(() => window.__l02fired.has('t_shade_in'), null, 3, 6);
    g.assert(r.ok, 'inShade: ART_SHADE blends in');
    if (SHOTS) {
      await step(2.5);
      await shot('z7_camp_gameplay');
      const ped = await ev(() => window.__game.ctx.l02.DATA.sundial.pedestal);
      await vista('z7_camp_shadow', [bp[0] + 60, bp[1] + 25, bp[2] + 80], [ped.x, bp[1] + 300, ped.z], 70);
      await vista('z7_sundial_far', await routePos(7200, 0, 30), [ped.x, bp[1] + 400, ped.z], 45);
      await budget('Z7 the camp');
    }
    // the plaque
    const pq = await ev(() => { const P = window.__game.ctx.l02.DATA.plaque, L = window.__game.ctx.l02; return [P.x, L.groundAt(P.x, P.z), P.z]; });
    await g.teleport([pq[0] - 8, pq[2]]);
    await step(0.5, 6);
    await holdInteract(1.8);
    r = await until(() => window.__l02fired.has('t_plaque'), null, 4, 6);
    g.assert(r.ok, 'the plaque read (interstitial)');
    r = await until(() => window.__l02lines.some(l => l.text === 'That phrase again. The same as the ship in the ice.'), null, 20, 10);
    g.assert(r.ok, 'c_plaque');
    // the Bench: the ending
    const bench = await routePos(8580, 125);
    await g.teleport([bench[0] + 4, bench[2] + 3]);
    r = await until(() => window.__l02fired.has('t_bench'), null, 4, 6);
    g.assert(r.ok, 't_bench: the frame at the Bench');
    r = await until((ctx) => ctx.cinematics?.active, null, 3, 2);
    if (SHOTS && r.ok) { await step(7, 6); await shot('z7_kite_world', { hud: false }); }
    r = await until(() => window.__l02clar.complete.length > 0, null, 40, 30);
    g.assert(r.ok, 'the level completes');
    const res = await ev(() => window.__l02clar.complete[0]?.flags ?? null);
    g.log('result flags', res && { lost: res['cv:lost'], story: res['campaign:story'] });
    const flagsNow = await ev(() => ({ lost: window.__game.ctx.mission.flags['cv:lost'], story: window.__game.ctx.mission.flags['campaign:story'] }));
    g.assert(Array.isArray(flagsNow.lost) && flagsNow.story?.bigMercy === 'saved', `result: cv:lost ${JSON.stringify(flagsNow.lost)}, campaign:story ${JSON.stringify(flagsNow.story)}`);
    await step(3);
    const after = await ev(() => {
      const ctx = window.__game.ctx, st = ctx.save?.getFlag?.('campaign');
      return { flow: ctx.flow.state, story: st?.story, m1: st?.fragments?.M1, unlocked: st?.sync?.unlocked, lost: st?.lost };
    });
    g.log('after the level', after);
    if (after.story === undefined && after.m1 === undefined) skip('campaign state (E10) not written in this run (flow ' + after.flow + ')');
    else g.assert(after.story?.bigMercy === 'saved' && after.m1 === 'intact', `E10: campaign story and M1 written (${JSON.stringify(after)})`);
    await noErrors('camp');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ determinism
  if (only.has('determinism')) {
    const run = async () => {
      await start('cp_flats');
      await ev(() => window.__game.seed?.(4242));
      await g.step(900);
      return ev(() => { const L = window.__game.ctx.l02, T = L.tally, b = L.convoy.byId.get(3).pos; return { d: +T.d.toFixed(3), s: +L.convoy.s.toFixed(3), bm: [+b.x.toFixed(2), +b.z.toFixed(2)], cv: window.__game.ctx.mission.flags['cv:s'] }; });
    };
    const a = await run(), b = await run();
    g.log('determinism', { a, b });
    g.assert(JSON.stringify(a) === JSON.stringify(b), 'cp_flats twice: the drag is deterministic (Tally lane distance, Big Mercy, the convoy)');
    await noErrors('determinism');
  }

  // ══════════════════════════════════════════════════════════════════════════════════════ the clarity pass, live
  const C = await ev(() => window.__l02clar || null);
  if (C) {
    const reqIds = [...new Set(C.req.map(r => r.id))], dlv = [...new Set(C.dlv.map(d => d.id))];
    g.log('cards asked', reqIds.length, 'delivered', dlv.length, 'shown', C.cards.length);
    const hasExplain = await ev(() => typeof window.__game.ctx.hud?.explain === 'function');
    // a card whose id the campaign glossary already holds (shown in Level 1) is a no-op by design (L2 §5.2)
    if (hasExplain && dlv.length) g.assert(C.cards.length > 0, `cards reach hud.explain (${C.cards.length} shown of ${dlv.length} delivered; the rest were already in the glossary)`);
    // every speaker's first line carries its tag
    const lines = await ev(() => window.__l02lines);
    const firsts = new Map();
    for (const l of lines) if (!firsts.has(l.who)) firsts.set(l.who, l);
    const tagged = [...firsts.values()].filter(l => l.tag != null).length;
    g.log('first lines', [...firsts.values()].map(l => `${l.who}: ${l.tag}`));
    if ([...firsts.values()].some(l => l.tag !== null)) g.assert(tagged >= firsts.size - 1, `each speaker's first line is tagged (${tagged}/${firsts.size})`);
  }
  const fr = await fired();
  g.log('triggers fired', fr.length, fr.join(','));
  if (only.size === ALL.length) {
    const def = await ev(() => window.__game.ctx.mission.def.triggers.map(t => t.id));
    const never = def.filter(id => !fr.includes(id) && !['t_tear_failsafe', 't_mercy_lost', 't_crane', 't_claw', 't_deck_warn', 't_rivet', 't_skates', 't_shade_out', 't_cacheB_near', 't_hum1', 't_hum2', 't_ration', 't_still', 't_hesper1'].includes(id));
    g.assert(never.length === 0, `every trigger fires across the run (${never.join(', ') || def.length})`);
  }
  if (skips.length) g.log('SKIPPED (engine features not present)', skips);
}
