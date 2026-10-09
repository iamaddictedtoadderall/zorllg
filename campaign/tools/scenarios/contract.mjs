// tools/scenarios/contract.mjs (P0): checks every module export, class method, ctx service method/field, __game member,
// shared registry, system registration and returned-handle shape against tools/contract.json (§9.5), a few core
// behaviour checks, and the §3.5 event catalogue at runtime (a scripted run of the test level must emit every event
// except contract.eventsDeferred; emitters are binding).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contract = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'contract.json'), 'utf8'));

export default async function (g) {
  const res = await g.eval(async (C) => {
    const fail = {}, count = {};
    const bad = (cat, msg) => { (fail[cat] || (fail[cat] = [])).push(msg); };
    const ok = (cat) => { count[cat] = (count[cat] || 0) + 1; };
    const ctx = window.__game.ctx;
    const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const mods = {};
    for (const path of Object.keys(C.modules)) {
      try { mods[path] = await import(new URL(path, location.href).href); }
      catch (e) { bad('modules', `${path}: import failed: ${e.message}`); }
    }
    // exports
    for (const [path, spec] of Object.entries(C.modules)) {
      const m = mods[path]; if (!m) continue;
      for (const [name, type] of Object.entries(spec.exports)) {
        if (!(name in m)) bad('exports', `${path}: missing export ${name}`);
        else if (typeof m[name] !== type) bad('exports', `${path}: ${name} is ${typeof m[name]}, expected ${type}`);
        else ok('exports');
      }
    }
    // classes
    for (const [key, methods] of Object.entries(C.classes)) {
      const [path, cls] = key.split('#'); const K = mods[path]?.[cls];
      if (typeof K !== 'function') { bad('classes', `${key}: not a class`); continue; }
      for (const m of methods) { if (typeof K.prototype[m] === 'function') ok('classes'); else bad('classes', `${key}.${m} missing`); }
    }
    for (const [key, names] of Object.entries(C.getters)) {
      const [path, cls] = key.split('#'); const K = mods[path]?.[cls];
      for (const n of names) { if (K && n in K.prototype) ok('getters'); else bad('getters', `${key}.${n} missing`); }
    }
    // services
    for (const [svc, methods] of Object.entries(C.services)) {
      const s = ctx[svc];
      if (!s) { bad('services', `ctx.${svc} missing`); continue; }
      for (const m of methods) { if (typeof get(s, m) === 'function') ok('services'); else bad('services', `ctx.${svc}.${m} is not a function`); }
    }
    const hasPath = (o, path) => {   // dotted names reach into sub-objects
      const ks = path.split('.'), last = ks.pop(), parent = ks.length ? get(o, ks.join('.')) : o;
      return parent != null && last in Object(parent);
    };
    for (const [svc, fields] of Object.entries(C.fields)) {
      const s = svc === 'ctx' ? ctx : ctx[svc];
      if (!s) { bad('fields', `ctx.${svc} missing`); continue; }
      for (const f of fields) { if (hasPath(s, f)) ok('fields'); else bad('fields', `${svc === 'ctx' ? 'ctx' : 'ctx.' + svc}.${f} missing`); }
    }
    // __game
    for (const m of C.gameApi) { if (get(window.__game, m) !== undefined) ok('gameApi'); else bad('gameApi', `__game.${m} missing`); }
    if (!(window.__game.ready instanceof Promise)) bad('gameApi', '__game.ready is not a Promise');
    // registries
    const R = C.registries;
    const has = (cat, list, want, label) => { for (const w of want) { if (list.includes(w)) ok(cat); else bad(cat, `${label}: missing ${w}`); } };
    has('registries', mods['src/audio/audio.js']?.SFX || [], R.sfx, 'SFX');
    has('registries', mods['src/art/units.js']?.UNIT_MODELS || [], R.unitModels, 'UNIT_MODELS');
    has('registries', ctx.enemies.kinds(), R.enemyKinds, 'enemies.kinds()');
    has('registries', mods['src/art/structures.js']?.STRUCTURE_TYPES || [], R.structureTypes, 'STRUCTURE_TYPES');
    for (const t of R.structureTypes) { if (ctx.structures.has(t)) ok('registries'); else bad('registries', `structures.has(${t}) false`); }
    has('registries', mods['src/world/scatter.js']?.propNames() || [], R.manmadeProps, 'propNames()');
    has('registries', Object.keys(mods['src/art/mechs.js']?.DESIGNS || {}), R.designs, 'DESIGNS');
    has('registries', Object.keys(mods['src/combat/loadout.js']?.FRAMES || {}), R.frames, 'FRAMES');
    has('registries', mods['src/combat/loadout.js']?.startingUnlocks() || [], R.startingParts, 'startingUnlocks()');
    has('registries', Object.keys(mods['src/combat/loadout.js']?.PARTS || {}), R.startingParts, 'PARTS');
    has('registries', Object.keys(ctx.materials.textures), R.texNames, 'materials.textures');
    for (const n of R.libNames) { const m = ctx.materials.get(n); if (m && m.isMaterial) ok('registries'); else bad('registries', `materials.get(${n})`); }
    for (const n of R.texNames) { const t = ctx.materials.textures[n]; if (t && t.isTexture) ok('registries'); else bad('registries', `texture ${n}`); }
    has('registries', Object.keys(mods['src/audio/music.js']?.THEMES || {}), R.themes, 'THEMES');
    for (const tn of ['low', 'medium', 'high']) {
      const T = mods['src/core/settings.js']?.TIERS?.[tn];
      if (!T) { bad('registries', `TIERS.${tn} missing`); continue; }
      has('registries', Object.keys(T), R.tierKeys, `TIERS.${tn}`);
      if (T.name !== tn) bad('registries', `TIERS.${tn}.name`);
    }
    has('registries', Object.values(mods['src/core/input.js']?.ACT || {}), R.actions, 'ACT');
    has('registries', Object.keys(mods['src/core/input.js']?.DEFAULT_BINDINGS || {}), R.actions, 'DEFAULT_BINDINGS');
    has('registries', (mods['levels/index.js']?.LEVELS || []).map(l => l.id), R.levels, 'LEVELS');
    // systems
    for (const [name, [phase, when]] of Object.entries(C.systems)) {
      const s = (ctx.systems[phase] || []).find(x => x.name === name);
      if (!s) bad('systems', `system ${name} not registered in phase ${phase}`);
      else if (s.when !== when) bad('systems', `system ${name} is '${s.when}', expected '${when}'`);
      else ok('systems');
    }
    // DOM ids (§2.2)
    for (const id of ['game', 'view', 'hud', 'vignette', 'scan', 'glitch', 'markers', 'objpanel', 'mname', 'objs', 'timer', 'compass',
      'compassStrip', 'radar', 'reticle', 'hitmark', 'lockbox', 'killfeed', 'warn', 'hint', 'comms', 'wave', 'progress', 'choice', 'status',
      'apNum', 'apFill', 'enFill', 'enLbl', 'enTxt', 'stFill', 'weapons', 'wR', 'wL', 'wS', 'wK', 'frameTag', 'frameName', 'callsign',
      'frameSub', 'bossbar', 'prompt', 'zonecard', 'checkpointToast', 'touch', 'stickHome', 'stick', 'rotate', 'letterbox', 'screen',
      'fade', 'dbg']) {
      if (document.getElementById(id)) ok('dom'); else bad('dom', `#${id} missing`);
    }
    for (const a of ['fire', 'blade', 'boost', 'jump', 'msl', 'lock', 'kit', 'pause', 'interact', 'skip']) {
      if (document.querySelector(`#touch button.tb[data-act="${a}"]`)) ok('dom'); else bad('dom', `touch button ${a} missing`);
    }
    if (document.getElementById('radar')?.width !== 336) bad('dom', 'radar canvas must be 336×336');

    // ---------------------------------------------------------------- object shapes (§4.3 / §4.4 tables)
    const shape = (cat, obj, keys, label) => { for (const k of keys) { if (obj && k in obj) ok(cat); else bad(cat, `${label}.${k} missing`); } };
    const units = mods['src/art/units.js'], mechs = mods['src/art/mechs.js'];
    for (const [kind, [parts, nm]] of Object.entries(C.unitParts)) {
      try {
        const rig = units.buildUnit(ctx, kind, 'hostile');
        shape('shapes', rig, C.unitRig, `buildUnit(${kind})`);
        shape('shapes', rig.parts, parts, `buildUnit(${kind}).parts`);
        if (rig.muzzles.length !== nm) bad('shapes', `buildUnit(${kind}): ${rig.muzzles.length} muzzles, expected ${nm}`); else ok('shapes');
        if (kind === 'walker') for (let i = 0; i < 4; i++) { const l = rig.parts['leg' + i]; if (l?.userData?.knee && l?.userData?.foot) ok('shapes'); else bad('shapes', `walker leg${i} needs userData.knee/foot`); }
        if (!rig.hit || !Array.isArray(rig.hit.center) || !(rig.hit.r > 0)) bad('shapes', `buildUnit(${kind}).hit`);
        rig.dispose();
      } catch (e) { bad('shapes', `buildUnit(${kind}) threw: ${e.message}`); }
    }
    for (const d of Object.keys(mechs.DESIGNS)) {
      try {
        const rig = mechs.buildMech(ctx, { design: d, base: '#888888', mid: '#666666', accent: '#cc8833', visor: '#77eeff' });
        shape('shapes', rig, C.mechRig, `buildMech(${d})`);
        shape('shapes', rig.mounts, ['R', 'L', 'S', 'U'], `buildMech(${d}).mounts`);
        shape('shapes', rig.mats, C.mechMaterials, `buildMech(${d}).mats`);
        if (rig.legs.length !== 2 || !rig.arms.L?.sh || !rig.arms.R?.el) bad('shapes', `buildMech(${d}) skeleton`);
        mechs.animateMech(rig, { fwd: 20, lat: 0, onGround: true, pitch: 0, thrust: 0.5, hover: 0, landT: 0 }, 1 / 60);
        rig.dispose();
      } catch (e) { bad('shapes', `buildMech(${d}) threw: ${e.message}`); }
    }
    shape('shapes', ctx.materials.factionSet('nobody'), C.factionMaterials, 'materials.factionSet()');
    { const L = mods['src/combat/loadout.js'];
      shape('shapes', L.computeStats(L.DEFAULT_LOADOUT), C.loadoutStats, 'computeStats()');
      const v = L.validate(L.DEFAULT_LOADOUT, new Set(L.startingUnlocks()));
      if (v.ok && Array.isArray(v.errors)) ok('shapes'); else bad('shapes', 'validate(DEFAULT_LOADOUT) must be ok');
      const w = mods['src/combat/weapons.js'].createWeapon(ctx, L.PARTS.rifle_r30, ctx.player);
      shape('shapes', w, C.weapon, 'createWeapon()');
      const r = w.readout(); if (typeof r.label === 'string' && 'cooling' in r && 'empty' in r) ok('shapes'); else bad('shapes', 'weapon.readout()'); }
    shape('shapes', ctx.player, C.target, 'player (Target)');
    const V3 = mods['src/core/util.js'].V3;
    { const u = ctx.enemies.spawn('drone', V3(0, 0, 0), { tag: 'contract' });
      shape('shapes', u, [...C.target, ...C.unit], 'Unit');
      if (u.tags instanceof Set && u.tags.has('contract') && typeof u.id === 'number') ok('shapes'); else bad('shapes', 'spawned unit tags/id');
      ctx.enemies.clear(); }
    { const S2 = ctx.structures;
      shape('shapes', S2.footprint('gate', {}), C.footprint, 'structures.footprint()');
      const inst = S2.place({ id: 'contract_gate', type: 'gate', at: [0, 0] }, V3(0, 0, 0), 0);
      shape('shapes', inst, C.structureInstance, 'StructureInstance');
      const p = V3(0, 4, 0), solid = ctx.collision.pointInSolid(p);
      inst.setState('open'); const open = ctx.collision.pointInSolid(p);
      if (solid && !open && S2.states().contract_gate === 'open') ok('shapes'); else bad('shapes', `gate open toggles its door collider (${solid}, ${open})`);
      S2.reset({ contract_gate: 'closed' }); if (ctx.collision.pointInSolid(p)) ok('shapes'); else bad('shapes', 'structures.reset restores colliders');
      S2.clear(); ctx.collision.clear(); }

    // ---------------------------------------------------------------- returned handles (§4): members are functions
    // unless a type test is given. Each call uses throwaway arguments and is cleaned up.
    const members = (obj, keys, label, typeOf = {}) => {
      if (!obj || typeof obj !== 'object') { bad('handles', `${label} returned ${obj}`); return; }
      for (const k of keys) {
        const t = typeOf[k];
        if (!(k in obj)) bad('handles', `${label}.${k} missing`);
        else if (t ? !t(obj[k]) : typeof obj[k] !== 'function') bad('handles', `${label}.${k} has the wrong type (${typeof obj[k]})`);
        else ok('handles');
      }
    };
    const isV3 = (v) => !!(v && v.isVector3);
    try { members(mods['src/art/kit.js'].acKit(0.08), C.handles.acKit, 'acKit()'); } catch (e) { bad('handles', `acKit() threw: ${e.message}`); }
    try { const h = ctx.audio.loop('wind', { vol: 0 }); members(h, C.handles.loop, 'audio.loop()'); h?.stop?.(0); }
    catch (e) { bad('handles', `audio.loop() threw: ${e.message}`); }
    try {
      const h = ctx.fx.emitter('smoke', V3(0, -500, 0), { rate: 0 });
      members(h, C.handles.emitter, 'fx.emitter()', { pos: isV3, alive: (v) => typeof v === 'boolean' });
      h?.stop?.(); ctx.fx.clearEmitters();
    } catch (e) { bad('handles', `fx.emitter() threw: ${e.message}`); }
    try { const h = ctx.screens.showLoading({ title: 'Contract' }); members(h, C.handles.loading, 'screens.showLoading()'); h?.set?.(0.5, 'contract'); h?.close?.(); }
    catch (e) { bad('handles', `screens.showLoading() threw: ${e.message}`); }

    // ---------------------------------------------------------------- core behaviour
    const U = mods['src/core/util.js'];
    const core = (cond, msg) => { if (cond) ok('core'); else bad('core', msg); };
    core(Math.abs(U.yawTo(0, -1)) < 1e-9 && Math.abs(U.yawTo(-1, 0) - Math.PI / 2) < 1e-9, 'yawTo convention (§1.3)');
    const v = U.aimDir(Math.PI / 2, 0, U.V3()); core(Math.abs(v.x + 1) < 1e-9 && Math.abs(v.z) < 1e-9, 'aimDir: yaw +90° faces −X (left turn)');
    const r1 = U.mulberry32(5), r2 = U.mulberry32(5); core(r1() === r2() && r1() === r2(), 'mulberry32 deterministic');
    core(U.hashString('abc') === 440920331, 'hashString is FNV-1a');
    core(U.formatTime(125) === '02:05', 'formatTime');
    core(Math.abs(U.angWrap(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(U.angWrap(3 * Math.PI) + Math.PI) < 1e-9, 'angWrap');
    { let t = 0; const q = new U.TimerQueue(() => t), log = []; q.after(1, () => log.push('a')); q.after(0.5, () => log.push('b'));
      const id = q.after(0.7, () => log.push('x')); q.cancel(id); let n = 0; q.every(0.25, () => { n++; return n < 3 ? undefined : false; });
      for (let i = 0; i < 20; i++) { t += 0.1; q.update(); }
      core(log.join('') === 'ba' && n === 3, `TimerQueue order/cancel/every (${log.join('')}, ${n})`); }
    { const b = new U.EventBus(); let a = 0; b.once('x', () => a++); b.emit('x'); b.emit('x'); const off = b.on('y', () => a += 10); off(); b.emit('y');
      core(a === 1, 'EventBus once/off'); }
    { const P = new U.Pool(() => ({}), o => { o.r = 1; }); const o = P.get(); P.release(o); core(P.free === 1 && P.get() === o && o.r === 1, 'Pool'); }
    const N = mods['src/core/noise.js'];
    { const n1 = N.createNoise2D(3), n2 = N.createNoise2D(3); let mx = 0; for (let i = 0; i < 500; i++) { const a = n1(i * 0.37, i * 0.11); mx = Math.max(mx, Math.abs(a)); if (a !== n2(i * 0.37, i * 0.11)) mx = 99; }
      core(mx > 0.3 && mx <= 1.05, `simplex noise range/determinism (${mx.toFixed(3)})`);
      const vn = N.createValueNoise2D(1); let lo = 1, hi = 0; for (let i = 0; i < 500; i++) { const a = vn(i * 0.31, i * 0.17); lo = Math.min(lo, a); hi = Math.max(hi, a); }
      core(lo >= 0 && hi <= 1 && hi - lo > 0.3, 'value noise in [0,1]');
      const t = N.tileable2(2, 8); core(Math.abs(t(0.3, 0.6) - t(8.3, 16.6)) < 1e-9, 'tileable2 periodic');
      const f = N.fbm2(n1, 1.3, 2.7); const rg = N.ridged2(n1, 1.3, 2.7); core(Math.abs(f) <= 1.05 && rg >= 0 && rg <= 1, 'fbm2/ridged2 ranges');
      const o = { x: 0, y: 0 }; core(N.warp2(n1, 10, 20, 5, 50, o) === o && (o.x !== 10 || o.y !== 20), 'warp2 writes out'); }
    const S = mods['src/core/settings.js'];
    core(S.resolveTier({ ...S.DEFAULT_SETTINGS, quality: 'low' }).name === 'low' && S.resolveTier({ ...S.DEFAULT_SETTINGS, quality: 'auto', touch: 'on' }).name === 'low'
         && S.resolveTier({ ...S.DEFAULT_SETTINGS, quality: 'auto', touch: 'off' }).name === 'high', 'resolveTier');
    const SV = mods['src/core/save.js'];
    { const key = 'campaign.save.contracttest';
      localStorage.setItem(key, '{not json'); const s = new SV.SaveStore(key); s.load();
      core(localStorage.getItem(key + '.bak') === '{not json' && s.data.version === SV.SAVE_VERSION && s.data.progress.levels.l01.unlocked, 'corrupt save backed up and reset');
      localStorage.setItem(key, JSON.stringify({ version: 99 })); s.load(); core(s.data.version === 1, 'future save version treated as corrupt');
      s.completeLevel('l01', { time: 100, rank: 'B', kills: 3, collectibles: ['c1'] }, { levels: ['l02'], parts: ['mg_r12'] });
      s.completeLevel('l01', { time: 120, rank: 'A', kills: 1, collectibles: [] });
      const e = s.data.progress.levels.l01;
      core(e.bestTime === 100 && e.bestRank === 'A' && e.completions === 2 && s.data.progress.levels.l02?.unlocked && s.unlockedParts().has('mg_r12'), 'completeLevel keeps bests and unlocks');
      const s2 = new SV.SaveStore(key); s2.load(); core(s2.data.progress.levels.l01.completions === 2, 'save persisted');
      core(s2.importJSON(s2.exportJSON()) && !s2.importJSON('{"version":7}'), 'export/import');
      localStorage.removeItem(key); localStorage.removeItem(key + '.bak'); }
    { const I = ctx.input, en = I.enabled; I.enabled = true;
      I.tap('jump'); I.beginFrame(); const p1 = I.pressed('jump'), d1 = I.down('jump'); I.endFrame(); I.beginFrame(); const p2 = I.pressed('jump'), r2 = I.released('jump'); I.endFrame();
      I.injectMove(0, 1); I.beginFrame(); const mv = I.move.y; I.endFrame(); I.clearInjected(); I.beginFrame(); const mv2 = I.move.y; I.endFrame();
      I.enabled = false; I.injectMove(1, 0); I.beginFrame(); const mv3 = I.move.x; I.endFrame(); I.clearInjected(); I.enabled = en;
      core(p1 && d1 && !p2 && r2, 'input press: down this frame, released next');
      core(mv === 1 && mv2 === 0 && mv3 === 0, 'input injectMove persists until cleared; disabled input reads idle'); }
    { const R = mods['src/world/route.js'].Route; const r = new R([[0, 0], [0, -100], [100, -100]], { halfWidth: [50, 60, 70] });
      const c = r.closest(10, -50); core(Math.abs(r.length - 200) < 1e-9 && Math.abs(c.s - 50) < 1e-9 && Math.abs(c.l - 10) < 1e-9, 'route closest: +l is right of travel');
      const w = r.toWorld(150, -5); core(Math.abs(w.x - 50) < 1e-9 && Math.abs(w.z + 105) < 1e-9 && Math.abs(r.halfWidthAt(100) - 60) < 1e-9, 'route toWorld/halfWidthAt'); }
    return { fail, count };
  }, contract);

  // ---------------------------------------------------------------- level handles and the §3.5 event catalogue
  // Records every catalogue event while the core, a load of the test level and a short script (generic: it uses the
  // loaded def's own trigger, encounter, zone and checkpoint ids) run through all binding emitters, then quits to the
  // title. Events in contract.eventsDeferred need package-specific setup and are covered by the P4/P5 scenarios.
  await g.eval((types) => {
    const c = window.__game.ctx;
    window.__contractEv = new Set();
    window.__contractOff = types.map(t => c.events.on(t, () => window.__contractEv.add(t)));
    c.resize();                                                        // resize
    c.setTier(c.tier.name);                                            // tier:changed
    const v = c.settings.get('cameraShake');                           // settings:changed
    c.settings.set('cameraShake', v === 1 ? 0.9 : 1); c.settings.set('cameraShake', v);
  }, contract.events);
  await g.startLevel('test');                                          // state:changed, level:loading/start/ready, player:spawned, target:registered
  const lv = await g.eval(async (H) => {
    const G = window.__game, c = G.ctx, def = c.mission.def, fail = [], count = { n: 0 };
    const V3 = (x, y, z) => new c.THREE.Vector3(x, y, z);
    const ok = () => count.n++;
    const bad = (m) => fail.push(m);
    // flyby() and fx.ambient() handles (they resolve level positions, so they run here)
    try {
      const f = c.cinematics.flyby({ model: 'dropship', path: [{ s: 100, h: 80 }, { s: 400, h: 80 }], speed: 60 });
      for (const k of H.flyby) {
        if (!f || !(k in f)) bad(`cinematics.flyby().${k} missing`);
        else if (k === 'done' ? typeof f.done?.then !== 'function' : typeof f[k] !== 'function') bad(`cinematics.flyby().${k} has the wrong type`);
        else ok();
      }
      f?.stop?.();
    } catch (e) { bad(`cinematics.flyby() threw: ${e.message}`); }
    try {
      const h = c.fx.ambient({ kind: 'battle', at: { s: 900 }, radius: 200 });
      for (const k of H.emitter) { if (h && k in h) ok(); else bad(`fx.ambient().${k} missing`); }
      h?.stop?.();
    } catch (e) { bad(`fx.ambient() threw: ${e.message}`); }
    // drive the binding emitters: sim-dependent ones first, then those that may end the level (objectives, triggers)
    const sFrom = (r) => Math.min(c.world.route.length - 5, r);
    const where = [];
    const mark = (k) => where.push(`${k}:${c.flow.state}`);
    G.step(12);                                                        // zone:entered (start zone), comms:line (start lines)
    c.comms.say(Object.keys(def.speakers || {})[0] || 'OPS', 'Contract check.');
    G.step(6);                                                         // comms:line
    G.teleport({ s: 80 }, { h: 40 }); G.step(150);                     // player:landed
    mark('landed');
    const z0 = (def.zones || [])[0];
    if (z0) { G.teleport({ s: sFrom((z0.range[0] + z0.range[1]) / 2) }); G.step(12); G.teleport({ s: sFrom(z0.range[1] + 120) }); G.step(12); }   // zone:entered/exited
    mark('zones');
    const u = c.enemies.spawn('drone', c.world.resolve({ s: 200, l: 30, h: 20 }, V3()), { tag: 'contract' });
    c.combat.damage(u, 1e7, 0, { team: 'player' });                    // target:damaged, target:killed
    const inst = c.structures.place({ id: 'contract_ev_gate', type: 'gate', at: { s: 600, l: 200 } }, c.world.resolve({ s: 600, l: 200 }, V3()), 0);
    inst.setState('open');                                             // structure:state
    c.fx.explosion(c.world.resolve({ s: 300, l: 60 }, V3()), 1, { quiet: true });   // fx:explosion
    c.combat.damage(c.player, 10, 0, { team: 'enemy' });              // player:damaged
    c.cinematics.play({ keys: [{ t: 0, pos: { s: 40, h: 20 }, look: { s: 120 } }, { t: 0.2, pos: { s: 50, h: 20 }, look: { s: 120 } }] });
    G.step(120);                                                       // cinematic:start / cinematic:end
    mark('cinematic');
    G.checkpoint((def.checkpoints || [])[0]?.id);                      // checkpoint:reached
    await G.restart(); G.step(2);
    if (def.encounters?.length) c.mission.run([{ spawn: def.encounters[0].id }]);   // encounter:started, unit:spawned
    G.step(2); G.killAll(); G.step(12);                                // encounter:cleared
    mark('encounter');
    if (def.triggers?.length) G.trigger(def.triggers[0].id);           // trigger:fired
    G.completeObjective((def.objectives || [])[0]?.id);                // objective:changed
    G.step(1);
    window.dispatchEvent(new Event('blur'));                           // input:focuslost (flow pauses when playing)
    G.step(1); c.flow.resume(); G.step(1);
    await G.restart(); G.step(2);
    c.mission.fail('contract');                                        // level:failed
    G.step(1);
    await G.restart(); G.step(2);
    c.combat.damage(c.player, 1e9, 0, { team: 'enemy' }); G.step(2);  // player:died
    await G.restart(); G.step(2);
    c.mission.complete(); G.step(2);                                   // level:complete
    await c.flow.toTitle();                                            // level:cleared
    G.step(2);
    const fired = [...window.__contractEv];
    for (const off of window.__contractOff) off();
    return { fail, count: count.n, fired, state: c.flow.state, where };
  }, contract.handles);
  const want = contract.events.filter(e => !contract.eventsDeferred.includes(e));
  const missing = want.filter(e => !lv.fired.includes(e));
  g.assert(lv.fail.length === 0, `contract handles (level): ${lv.count} ok${lv.fail.length ? `, failed: ${lv.fail.join('; ')}` : ''}`);
  if (missing.length) g.log('events script flow states:', lv.where.join(' '));
  g.assert(missing.length === 0, `contract events: ${want.length - missing.length}/${want.length} catalogue events emitted${missing.length ? `; never emitted: ${missing.join(', ')}` : ''} (deferred to P4/P5 scenarios: ${contract.eventsDeferred.join(', ')})`);
  g.assert(lv.state === 'title', `events script returned to the title (${lv.state})`);

  const cats = new Set([...Object.keys(res.count), ...Object.keys(res.fail)]);
  for (const c of cats) {
    const f = res.fail[c] || [];
    g.assert(f.length === 0, `contract ${c}: ${res.count[c] || 0} ok${f.length ? `, ${f.length} failed: ${f.slice(0, 12).join('; ')}` : ''}`);
  }
  const want2 = ['exports', 'classes', 'getters', 'services', 'fields', 'gameApi', 'registries', 'systems', 'dom', 'shapes', 'handles', 'core'];
  g.assert(want2.every(c => cats.has(c)), `contract categories checked (${[...cats].join(', ')})`);
}
