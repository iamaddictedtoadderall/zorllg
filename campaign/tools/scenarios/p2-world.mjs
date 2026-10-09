// tools/scenarios/p2-world.mjs (P2): World acceptance (arch §10.5) and the addendum P2 items (A6).
//
//   node tools/playtest.mjs --scenario p2-world --port 8420 --out /tmp/campaign-playtest/P2-p2-world
//   options (--param k=v): p2=look  only the look shots (load, 10 route points, snow preset)
//                          p2=fast  everything except the screenshots
//
// It builds an inline LevelDef: a 4.5 km route, 1.2 km wide corridor (halfWidth 600), with macro features, stamps on
// and off the route, a few structures and a full natural scatter, then checks:
//   1. world.load completes; the cold build time is logged (target ≤ 8 s in the headless sandbox)
//   2. 10 evenly spaced route points: settle, no holes, no pending, rendered edges match their neighbours (no cracks),
//      gameplay + free-camera screenshots; a forward flight checks the rendered surface never jumps (no LOD popping)
//   3. |groundHeight − heightAt| ≤ 0.6 m on 2,000 random corridor points; groundHeight matches a THREE.Raycaster hit
//      on the settled 2 m mesh within 0.02 m on 200 points
//   4. at |l| = 1.1 × halfWidth the ground is ≥ 100 m above the route bed for ≥ 90 % of samples; bed grade ≤ 10 %
//   5. a free camera flown s 0 → end → 0 at 80 m/s with step(): terrain pending ≤ 64; geometries back within 10 %
//   6. collision unit tests (box, obox, circle resolve; supportHeight; ceilings; segment vs boxes and ground; LOS)
//   7. scatter: visible instances > 0; two loads give an identical prop-collider hash
//   8. High budget at the 10 points: terrain triangles ≤ 0.7 M; terrain + scatter draw calls ≤ 120 (main pass)
// Addendum: ice_shard / snow_drift registered and placed; ColliderOpts.surface passes any string; the snowy-ice art
// preset (AD §3.5 material with surface.snow, palette.snow, palette.strata) on High and Low (TERRAIN_LITE).

const ROUTE = { points: [[0, 0], [90, -900], [-70, -1800], [80, -2700], [-60, -3600], [0, -4500]], halfWidth: 600 };

export const DESERT_ART = {
  palette: { ground: '#7a5a44', rock: '#4f3a2e', sediment: '#9a6a48', high: '#a88e76', dust: '#b8a084', wet: '#3a2a22',
             concrete: '#6d6560', rust: '#6e3a24', accent: '#e0913c',
             strata: ['#5b4232', '#7a5a44', '#8d6a50', '#4a362c', '#a07a5a', '#6a4c3a'] },
  sky: { top: '#24314d', mid: '#8a6658', horizon: '#c99a7a', sun: { azimuth: 115, elevation: 24, color: '#ffc890' },
         clouds: { cover: 0.25 }, ridges: { height: 2 } },
  fog: { density: 0.0008, heightFalloff: 0.006, inscatter: 0.6 },
  light: { sun: 6.5, hemi: 1.6, rim: 2.2, exposure: 1.0 },
  weather: { type: 'dust', intensity: 0.15, wind: [2, 0.5] },
  surface: { style: 'grit', strataHeight: 9, strataStrength: 0.75, wetness: 0.45 },
  scatter: [
    { prop: 'rock_medium', density: 5, scale: [0.7, 2.6], slope: [0, 0.8], collide: true, collideMinScale: 1.8 },
    { prop: 'rock_large', density: 1.4, scale: [1, 2.6], slope: [0.12, 0.9], collide: true, collideMinScale: 1.4, castShadow: true },
    { prop: 'boulder', density: 0.45, scale: [3.5, 8], avoidRoute: true, collide: true, castShadow: true },
    { prop: 'slab', density: 0.8, scale: [1, 2.4], slope: [0, 0.5], collide: true, collideMinScale: 1.6 },
    { prop: 'pebbles', density: 70, maxDist: 110, slope: [0, 0.5] },
    { prop: 'scrub', density: 18, maxDist: 140, slope: [0, 0.3], avoidRoute: true },
    { prop: 'dead_tree', density: 0.25, scale: [0.8, 1.25], slope: [0, 0.25], avoidRoute: true, collide: true, collideMinScale: 0 },
  ],
};
export const SNOW_ART = {
  palette: { ground: '#b8c6d6', rock: '#5d7899', sediment: '#2b3a4f', high: '#d6dee8', dust: '#c9d4e2', wet: '#1b2633',
             concrete: '#8a8f96', rust: '#6e3a24', accent: '#e0a030', snow: '#e8eef5',
             strata: ['#4c6481', '#6f8aa8', '#3d5068', '#8aa2bc', '#566f8e'] },
  sky: { top: '#0b1430', mid: '#3a4a72', horizon: '#9fb2cc', sun: { azimuth: 95, elevation: 12, color: '#ffd0a0' },
         clouds: { cover: 0.2 }, ridges: { height: 1.5 } },
  fog: { color: '#a9bad0', density: 0.0009, heightFalloff: 0.01, inscatter: 0.8, sunColor: '#ffc89a' },
  light: { sun: 5.5, sunColor: '#ffd8b0', hemiSky: '#9fb6d8', hemiGround: '#3a4658', hemi: 1.8, rim: 2.0, exposure: 1.0 },
  weather: { type: 'snow', intensity: 0.2, wind: [3, -1] },
  surface: { style: 'snow', snow: 0.85, snowSlope: [0.72, 0.9], rockSlope: [0.3, 0.55], strataHeight: 14, strataStrength: 0.6,
             wetness: 0.2, gloss: 0.15, sparkle: 1 },
  scatter: [
    { prop: 'snow_drift', density: 6, scale: [0.8, 1.6], slope: [0, 0.25] },
    { prop: 'ice_shard', density: 50, maxDist: 110, slope: [0, 0.4] },
    { prop: 'rock_medium', density: 3, scale: [0.8, 2.4], slope: [0.1, 0.8], collide: true, collideMinScale: 1.8 },
    { prop: 'boulder', density: 0.4, scale: [3, 7], avoidRoute: true, collide: true, castShadow: true },
    { prop: 'spire', density: 0.06, scale: [1.5, 3], slope: [0, 0.35], avoidRoute: true, collide: true, castShadow: true },
  ],
};

export function levelDef(id, art, seed = 5150) {
  return {
    id, title: 'P2 World', subtitle: 'World acceptance', order: 99, seed, par: { time: 600, damage: 9000 },
    briefing: { title: 'P2 World', body: 'World acceptance level.', objectives: ['None'] },
    speakers: { OPS: { name: 'OPERATIONS', color: '#e9e3d3' } },
    factions: { hostile: { shell: '#bdb6a8', accent: '#8f2a22', eye: '#ff3b1f' } },
    route: ROUTE,
    terrain: {
      base: { scale: 900, amp: 120, ridged: 0.4, warp: 80, octaves: 6 }, detail: { scale: 22, amp: 1.6 },
      walls: { height: 260, start: 0.85, noise: 0.35 }, carve: { depth: 4, bedWidth: 70, shoulder: 80 },
      erosion: { droplets: 120000, thermal: 2 },
      features: [
        { kind: 'mesa', at: { s: 900, l: 330 }, r: 150, h: 55 },
        { kind: 'ridge', at: { s: 1900, l: -400 }, to: { s: 2500, l: -330 }, r: 110, h: 70 },
        { kind: 'crater', at: { s: 3050, l: 260 }, r: 80, h: 16 },
        { kind: 'spire_field', at: { s: 3700, l: -320 }, r: 200, h: 40 },
      ],
      stamps: [
        { at: { s: 2450 }, r: 90, mode: 'flatten' },                     // on the route: the bed ramps into it
        { at: { s: 1500, l: 260 }, r: 60, mode: 'flatten', noScatter: true },
        { at: { s: 4100, l: -200 }, r: 40, mode: 'crater', h: 7 },
      ],
    },
    art,
    zones: [
      { id: 'z_a', range: [0, 2300], name: 'Canyon A',
        structures: [{ id: 'p2_bunker', type: 'bunker', at: { s: 1500, l: 260 }, yaw: 'route' },
                     { id: 'p2_tower', type: 'watchtower', at: { s: 700, l: -150 }, yaw: 'route' }] },
      { id: 'z_b', range: [2300, 4600], name: 'Canyon B',
        structures: [{ id: 'p2_wall', type: 'wall', at: { s: 3300, l: 120 }, yaw: 'route', params: { length: 60 } }] },
    ],
    checkpoints: [{ id: 'cp0', at: { s: 30 }, yaw: 'route', label: 'Start' }, { id: 'cp1', at: { s: 2300 }, yaw: 'route', label: 'Mid' }],
    objectives: [], encounters: [], triggers: [],
    start: [],
    complete: { when: { flag: 'p2.never' } },
  };
}

export default async function (g) {
  // a full-quality frame in SwiftShader can take 10–20 s right after the view changes; render once (and flush) inside an
  // evaluate first so the harness screenshot (30 s timeout) only waits for the second, warm frame
  const shot0 = g.shot.bind(g);
  g.shot = async (name, o = {}) => {
    await g.eval(async () => {
      await window.__game.settle();
      window.__game.render();
      const gl = window.__game.ctx.renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    });
    try { return await shot0(name, { ...o, settle: false }); }
    catch (e) {
      // a heavily loaded sandbox can still miss the 30 s screenshot deadline: render warm again and retry once
      g.log(`shot ${name} retry: ${String(e.message || e).split('\n')[0]}`);
      await g.eval(() => { window.__game.render(); const gl = window.__game.ctx.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); });
      return shot0(name, { ...o, settle: false });
    }
  };
  const mode = (g.args.params || []).map(p => p.split('=')).find(([k]) => k === 'p2')?.[1] || 'all';
  const shots = mode !== 'fast', checks = mode !== 'look';
  const DEF = levelDef('p2world', DESERT_ART);

  // ------------------------------------------------------------------ 1. load
  await g.eval(async () => {
    const H = await import(new URL('src/world/heightfield.js', location.href).href);
    H.clearHeightfieldCache?.();
  });
  const s0 = await g.startLevel(DEF, 'cp0');
  const load = await g.eval(() => ({ t: window.__game.ctx.world.timings, hf: window.__game.ctx.world.heightfield.stats,
                                      cells: [window.__game.ctx.world.heightfield.nx, window.__game.ctx.world.heightfield.nz] }));
  g.log('world.load timings (ms):', load.t, 'heightfield:', load.hf, 'grid', load.cells);
  g.assert(s0.state === 'playing' && s0.world, `world.load completed (state ${s0.state})`);
  g.assert(load.t.total <= 8000, `world.load ≤ 8 s in the sandbox (cold: ${load.t.total} ms, heightfield ${load.t.heightfield} ms)`);
  const length = await g.eval(() => window.__game.ctx.world.route.length);

  // ------------------------------------------------------------------ 2 + 8. ten route points
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push(40 + i * (length - 80) / 9);
  let maxTris = 0, maxCalls = 0, maxGap = 0, anyHoles = 0, anyPending = 0;
  const budget = [];
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i];
    await g.eval(() => window.__game.freeCam(false));
    await g.teleport({ s, l: 0 }, { yaw: undefined });
    await g.eval((s) => { const c = window.__game.ctx; c.player.yaw = c.world.route.yawAt(s); c.player.bodyYaw = c.player.yaw; }, s);
    await g.step(3);
    await g.eval(() => window.__game.settle());
    const m = await g.eval(() => {
      const c = window.__game.ctx, w = c.world, r = c.renderer;
      c.camera.updateMatrixWorld();
      const t = w.terrain.measure(c.camera), st = w.terrain.stats(), sc = w.scatter.stats(), gap = w.terrain.edgeGap();
      // main-pass cross-check: draw only terrain + scatter (no shadow pass, no post)
      const hidden = [];
      for (const o of c.scene.children) if (o !== c.levelRoot && o.visible && !o.isLight && !o.isCamera) { o.visible = false; hidden.push(o); }
      for (const o of c.levelRoot.children) if (o !== w.terrain.root && o !== w.scatter.root && o.visible) { o.visible = false; hidden.push(o); }
      const bg = c.scene.background; c.scene.background = null;
      const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
      r.info.reset(); r.setRenderTarget(null); r.render(c.scene, c.camera);
      const real = { calls: r.info.render.calls, triangles: r.info.render.triangles };
      r.shadowMap.autoUpdate = au; c.scene.background = bg;
      for (const o of hidden) o.visible = true;
      return { t, st, sc, gap, real };
    });
    budget.push({ s: Math.round(s), terrainCalls: m.t.calls, terrainTris: m.t.triangles, scatterCalls: m.sc.calls, mainPass: m.real,
                  nodes: m.st.nodes, holes: m.st.holes, pending: m.st.pending, gap: +m.gap.max.toFixed(3) });
    maxTris = Math.max(maxTris, m.real.triangles - 0, m.t.triangles);
    maxCalls = Math.max(maxCalls, m.real.calls);
    maxGap = Math.max(maxGap, m.gap.max); anyHoles += m.st.holes; anyPending += m.st.pending;
    if (shots) {
      await g.shot(`route-${i}-gameplay`);
      const cam = await g.eval((s) => {
        const w = window.__game.ctx.world, r = w.route, p = r.toWorld(s, 0), t = r.tangentAt(s);
        const side = (s / 400) % 2 < 1 ? 1 : -1;
        const pos = r.toWorld(Math.max(0, s - 140), side * 160); pos.y = w.groundHeight(pos.x, pos.z) + 70;
        const look = r.toWorld(Math.min(r.length, s + 260), -side * 60); look.y = w.groundHeight(look.x, look.z) + 10;
        return { pos: [pos.x, pos.y, pos.z], look: [look.x, look.y, look.z] };
      }, s);
      await g.camera(cam.pos, cam.look, 60);
      await g.shot(`route-${i}-vista`, { hud: false });
      const gap2 = await g.eval(() => window.__game.ctx.world.terrain.edgeGap().max);
      maxGap = Math.max(maxGap, gap2);
    }
  }
  g.log('budgets at the 10 points (High main pass, terrain + scatter only):', budget);
  g.assert(anyHoles === 0 && anyPending === 0, `10 points settled: no holes, nothing pending (holes ${anyHoles}, pending ${anyPending})`);
  g.assert(maxGap < 0.1, `no cracks: rendered node edges meet their neighbours (max gap ${maxGap.toFixed(3)} m)`);
  if (g.args.tier === 'high') {
    const terrMax = Math.max(...budget.map(b => b.terrainTris));
    g.assert(terrMax <= 700000, `High: terrain triangles ≤ 0.7 M at the 10 points (max ${terrMax})`);
    const callMax = Math.max(...budget.map(b => b.mainPass.calls));
    g.assert(callMax <= 120, `High: terrain + scatter draw calls ≤ 120 at the 10 points (max ${callMax}, main pass)`);
  }

  // ------------------------------------------------------------------ 2b. no LOD popping (rendered surface continuity)
  if (checks) {
    const pop = await g.eval(() => {
      const c = window.__game.ctx, w = c.world, r = w.route, T = c.THREE;
      const probes = [];
      for (let i = 0; i < 400; i++) { const s = 500 + i * 6, l = ((i * 53) % 900) - 450; probes.push(r.toWorld(s, l)); }
      let prev = null, max = 0, steps = 0, maxPend = 0;
      const cam = new T.Vector3();
      w.terrain.settle(r.toWorld(300, 0).setY(80));
      for (let s = 300; s < 2700; s += 80 / 60) {
        r.toWorld(s, 0, cam); cam.y = w.groundHeight(cam.x, cam.z) + 30;
        w.terrain.update(cam, cam, c.tier.terrainBuildMs);
        maxPend = Math.max(maxPend, w.terrain.stats().pending);
        const cur = probes.map(p => w.terrain.renderedHeightAt(p.x, p.z));
        if (prev) for (let i = 0; i < cur.length; i++) if (cur[i] !== null && prev[i] !== null) max = Math.max(max, Math.abs(cur[i] - prev[i]));
        prev = cur; steps++;
      }
      return { max, steps, maxPend };
    });
    g.log('LOD continuity:', pop);
    g.assert(pop.max < 0.5, `no LOD popping: the rendered surface at 400 probes changes ≤ ${pop.max.toFixed(3)} m per frame at 80 m/s (limit 0.5 m)`);
  }

  if (checks) {
    // ------------------------------------------------------------------ 3. ground accuracy
    const acc = await g.eval(async () => {
      const c = window.__game.ctx, w = c.world, hf = w.heightfield, r = w.route, T = c.THREE;
      let a = 1;
      const rng = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      let maxD = 0;
      for (let i = 0; i < 2000; i++) {
        const s = rng() * r.length, l = (rng() * 2 - 1) * r.halfWidthAt(s), p = r.toWorld(s, l);
        maxD = Math.max(maxD, Math.abs(w.groundHeight(p.x, p.z) - hf.heightAt(p.x, p.z)));
      }
      // raycast the settled 2 m mesh around the camera
      const P = c.player.pos;
      const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
      let maxR = 0, n = 0, tries = 0;
      while (n < 200 && tries < 4000) {
        tries++;
        const x = P.x + (rng() - 0.5) * 220, z = P.z + (rng() - 0.5) * 220;
        const node = w.terrain.nodeAt(x, z);
        if (!node || node.size !== 128) continue;
        node.mesh.updateMatrixWorld(true);
        ray.set(new T.Vector3(x, 3000, z), down);
        const hits = ray.intersectObject(node.mesh, false);
        if (!hits.length) continue;
        const top = hits.reduce((p, q) => (p.point.y > q.point.y ? p : q));
        maxR = Math.max(maxR, Math.abs(top.point.y - w.groundHeight(x, z)));
        n++;
      }
      return { maxD, maxR, n };
    });
    g.assert(acc.maxD <= 0.6, `|groundHeight − heightAt| ≤ 0.6 m on 2,000 corridor points (max ${acc.maxD.toFixed(3)} m)`);
    g.assert(acc.n === 200 && acc.maxR <= 0.02, `groundHeight matches a Raycaster hit on the settled 2 m mesh (${acc.n} points, max ${acc.maxR.toExponential(2)} m)`);

    // ------------------------------------------------------------------ 4. corridor shape
    const cor = await g.eval(() => {
      const w = window.__game.ctx.world, r = w.route, hf = w.heightfield;
      let ok = 0, n = 0, maxGrade = 0, prev = null, worst = 0;
      for (let s = 0; s <= r.length; s += 8) {
        const c = r.pointAt(s), bed = hf.heightAt(c.x, c.z);
        for (const side of [-1, 1]) {
          const p = r.toWorld(s, side * 1.1 * r.halfWidthAt(s));
          n++; if (hf.heightAt(p.x, p.z) - bed >= 100) ok++;
        }
        if (prev !== null) { const gr = Math.abs(bed - prev) / 8; if (gr > maxGrade) { maxGrade = gr; worst = s; } }
        prev = bed;
      }
      return { frac: ok / n, n, maxGrade, worst };
    });
    g.assert(cor.frac >= 0.9, `corridor walls: ≥ 100 m above the bed at 1.1 × halfWidth for ${(cor.frac * 100).toFixed(1)} % of ${cor.n} samples (≥ 90 %)`);
    g.assert(cor.maxGrade <= 0.1, `route bed grade ≤ 10 % everywhere (max ${(cor.maxGrade * 100).toFixed(1)} % at s ${cor.worst})`);

    // ------------------------------------------------------------------ 5. streaming round trip at 80 m/s
    const fly = await g.eval(() => {
      const G = window.__game, c = G.ctx, w = c.world, r = w.route, T = c.THREE;
      const pos = new T.Vector3(), look = new T.Vector3();
      const at = (s) => { r.toWorld(s, 0, pos); pos.y = w.groundHeight(pos.x, pos.z) + 80; r.toWorld(Math.min(r.length, s + 200), 0, look); look.y = pos.y - 40; };
      at(0); c.cameraRig.setFree(true, { pos, look });
      G.step(1); w.terrain.settle(c.camera.position); G.render();
      const geo0 = c.renderer.info.memory.geometries, built0 = w.terrain.stats().built;
      let maxPend = 0, frames = 0;
      const leg = (from, to) => {
        const dir = Math.sign(to - from);
        for (let s = from; dir > 0 ? s <= to : s >= to; s += dir * 80 / 60) {
          at(s); c.cameraRig.setFree(true, { pos, look });
          G.step(1); frames++;
          maxPend = Math.max(maxPend, w.terrain.stats().pending);
          if (frames % 90 === 0) G.render();
        }
      };
      leg(0, r.length); leg(r.length, 0);
      at(0); c.cameraRig.setFree(true, { pos, look }); G.step(2); w.terrain.settle(c.camera.position); G.render();
      const geo1 = c.renderer.info.memory.geometries;
      return { maxPend, frames, geo0, geo1, built0, built1: w.terrain.stats().built, st: w.terrain.stats() };
    });
    g.log('streaming round trip:', fly);
    g.assert(fly.maxPend <= 64, `80 m/s flight s 0 → ${Math.round(length)} → 0: terrain pending ≤ 64 (max ${fly.maxPend} over ${fly.frames} frames)`);
    g.assert(Math.abs(fly.geo1 - fly.geo0) <= Math.max(1, fly.geo0 * 0.1), `geometries after the round trip within 10 % (${fly.geo0} → ${fly.geo1})`);
    await g.eval(() => window.__game.freeCam(false));

    // ------------------------------------------------------------------ 6. collision unit tests
    const col = await g.eval(async () => {
      const C = await import(new URL('src/world/collision.js', location.href).href);
      const T = window.__game.ctx.THREE, V = (x, y, z) => new T.Vector3(x, y, z);
      const fails = [], oks = [];
      const ok = (c, m) => (c ? oks : fails).push(m);
      const col = new C.Collision({ world: { surfaceAt: () => 'ground', normalAt: (x, z, o) => o.set(0, 1, 0) } });
      col.ground = { groundHeight: () => 0 };
      const b = col.box(0, 0, 10, 10, 8, undefined, { surface: 'ice' });
      const ob = col.obox(50, 0, 20, 4, Math.PI / 4, 6);
      const ci = col.circle(-50, 0, 5, 12);
      const deck = col.box(0, 100, 20, 40, 22, 18, { surface: 'metal' });
      let body = { pos: V(4, 0, 0), vel: V(), rad: 2, hgt: 10 };
      ok(col.resolve(body) && Math.abs(body.pos.x - 7) < 1e-9, 'box resolve pushes out by the shortest axis');
      const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
      body = { pos: V(50 + 1 * s, 0, 1 * c), vel: V(), rad: 1, hgt: 5 };
      ok(col.resolve(body), 'obox resolve touches');
      { const dx = body.pos.x - 50, dz = body.pos.z, lx = dx * c - dz * s, lz = dx * s + dz * c; ok(Math.abs(lz - 3) < 1e-9 && Math.abs(lx) < 1e-9, 'obox resolve pushes along its local axis'); }
      body = { pos: V(-47, 0, 0), vel: V(), rad: 1, hgt: 5 };
      ok(col.resolve(body) && Math.abs(body.pos.x + 44) < 1e-9, 'circle resolve pushes radially');
      body = { pos: V(0, 8, 0), vel: V(), rad: 2, hgt: 10 };
      ok(!col.resolve(body), 'a body standing on a top is not pushed');
      ok(col.supportHeight(0, 0, 8) === 8 && col.supportHeight(0, 0, 6.5) === 8 && col.supportHeight(0, 0, 6) === 0, 'supportHeight: tops with a 1.6 m step-up');
      ok(col.supportHeight(50 + 8 * c, -8 * s, 7) === 6 && col.supportHeight(50 + 12 * c, -12 * s, 7) === 0, 'supportHeight on an oriented box');
      ok(col.supportHeight(0, 100, 0) === 0 && col.supportHeight(0, 100, 21) === 22, 'a deck: pass under it or stand on it');
      body = { pos: V(0, 9, 100), vel: V(0, 5, 0), rad: 2, hgt: 10 };
      ok(col.resolve(body) && body.pos.y === 8 && body.vel.y === 0, 'ceiling: the head is held under the deck');
      ok(col.pointInSolid(V(0, 4, 0)) && !col.pointInSolid(V(0, 9, 0)) && !col.pointInSolid(V(0, 10, 100)) && col.pointInSolid(V(0, 20, 100)), 'pointInSolid');
      let h = col.segment(V(-20, 4, 0), V(20, 4, 0));
      ok(h && h.collider === b && Math.abs(h.point.x + 5) < 1e-9 && h.normal.x === -1 && h.surface === 'ice', 'segment hits a box face; surface "ice" passes through');
      h = col.segment(V(0, 0, 100), V(0, 30, 100));
      ok(h && h.collider === deck && Math.abs(h.point.y - 18) < 1e-9 && h.normal.y === -1, 'segment hits a deck underside');
      h = col.segment(V(50 - 30 * c, 3, 30 * s), V(50 + 30 * c, 3, -30 * s));
      ok(h && h.collider === ob && Math.abs(h.t * 60 - 20) < 1e-6, 'segment enters an oriented box at the right distance');
      h = col.segment(V(-70, 5, 0), V(-30, 5, 0));
      ok(h && h.collider === ci && Math.abs(h.point.x + 55) < 1e-9, 'segment hits a circle');
      h = col.segment(V(-20, 4, 0), V(20, 4, 0), undefined, { radius: 1 });
      ok(h && Math.abs(h.point.x + 6) < 1e-9, 'segment radius inflates colliders');
      h = col.segment(V(100, 10, 0), V(140, -10, 0));
      ok(h && h.ground && Math.abs(h.point.x - 120) < 1e-3, 'segment hits the ground');
      ok(col.lineOfSight(V(-20, 20, 0), V(20, 20, 0)) && !col.lineOfSight(V(-20, 4, 0), V(20, 4, 0)), 'lineOfSight');
      // the live world: ground segment against the real heightfield, LOS across a canyon wall
      const w = window.__game.ctx.world, r = w.route, cc = window.__game.ctx.collision;
      const p = r.toWorld(1000, 0), gy = w.groundHeight(p.x, p.z);
      const hit = cc.segment(V(p.x, gy + 50, p.z), V(p.x + 1, gy - 50, p.z + 1), undefined, { colliders: false });
      ok(hit && hit.ground && Math.abs(hit.point.y - w.groundHeight(hit.point.x, hit.point.z)) < 0.01, 'segment hits the live ground surface');
      const a2 = r.toWorld(1000, 0), b2 = r.toWorld(1000, 1500);
      a2.y = w.groundHeight(a2.x, a2.z) + 5; b2.y = w.groundHeight(b2.x, b2.z) + 5;
      ok(!cc.lineOfSight(a2, b2), 'no line of sight through the canyon wall');
      const rc = w.raycast(V(p.x, gy + 30, p.z), V(0, -1, 0), 100);
      ok(rc && rc.ground && Math.abs(rc.dist - 30) < 0.05, 'world.raycast finds the ground');
      return { fails, n: oks.length };
    });
    g.assert(col.fails.length === 0, `collision unit tests: ${col.n} passed${col.fails.length ? '; failed: ' + col.fails.join('; ') : ''}`);

    // ------------------------------------------------------------------ 7. scatter determinism
    const sc1 = await g.eval(() => ({ hash: window.__game.ctx.world.scatter.colliderHash(), st: window.__game.ctx.world.scatter.stats(),
                                      names: (window.__game.ctx.world.scatter.meshes ? [...window.__game.ctx.world.scatter.meshes.keys()] : []) }));
    await g.startLevel(DEF, 'cp0');
    const sc2 = await g.eval(() => ({ hash: window.__game.ctx.world.scatter.colliderHash(), st: window.__game.ctx.world.scatter.stats(),
                                      t: window.__game.ctx.world.timings }));
    g.log('scatter:', sc1.st, 'meshes', sc1.names.length, 'reload timings', sc2.t);
    g.assert(sc1.st.visible > 0 && sc1.st.instances > 0, `scatter: ${sc1.st.visible} visible of ${sc1.st.instances} instances, ${sc1.st.types} types`);
    g.assert(sc1.hash === sc2.hash && sc1.st.colliders > 0, `two loads give an identical prop-collider hash (${sc1.hash} vs ${sc2.hash})`);
    // registry (addendum A5.5)
    const reg = await g.eval(async () => {
      const S = await import(new URL('src/world/scatter.js', location.href).href);
      const names = S.propNames();
      const want = ['rock_small', 'rock_medium', 'rock_large', 'boulder', 'spire', 'slab', 'pebbles', 'scrub', 'grass_tuft', 'dead_tree', 'stump', 'ice_shard', 'snow_drift'];
      return { missing: want.filter(n => !names.includes(n) || !names.includes(n + '#2')) };
    });
    g.assert(reg.missing.length === 0, `natural props registered with 3 variants each, including ice_shard and snow_drift (missing: ${reg.missing.join(', ') || 'none'})`);
    // determinism of play on this level: a checkpoint replay twice
    const a = await g.replay(300), b = await g.replay(300);
    g.assert(JSON.stringify(a.player.pos) === JSON.stringify(b.player.pos), `replays deterministic on the P2 level (${a.player.pos.map(v => v.toFixed(2))})`);
  }

  // ------------------------------------------------------------------ map
  if (shots) {
    await g.eval(() => {
      const c = document.createElement('canvas'); c.width = 520; c.height = 520; c.id = 'p2map';
      Object.assign(c.style, { position: 'fixed', left: '20px', top: '20px', zIndex: 99, border: '1px solid #444' });
      window.__game.ctx.world.heightfield.renderMap(c, { route: window.__game.ctx.world.route, player: window.__game.ctx.player.pos });
      document.body.appendChild(c);
    });
    await g.shot('tactical-map', { hud: false });
    await g.eval(() => document.getElementById('p2map')?.remove());
    // close-up ground detail 50–300 m (tiling check) and a low sun-facing canyon view
    for (const [name, s, l, h, ls, ll, lh] of [['ground-detail', 1200, 0, 6, 1450, 30, -20], ['canyon-wall', 2000, -250, 25, 2150, -700, 60],
                                                ['sun-facing', 3300, 0, 40, 3700, 100, 30]]) {
      const cam = await g.eval(([s, l, h, ls, ll, lh]) => {
        const w = window.__game.ctx.world, r = w.route, p = r.toWorld(s, l), q = r.toWorld(ls, ll);
        return { pos: [p.x, w.groundHeight(p.x, p.z) + h, p.z], look: [q.x, w.groundHeight(q.x, q.z) + lh, q.z] };
      }, [s, l, h, ls, ll, lh]);
      await g.camera(cam.pos, cam.look, 62);
      await g.shot(`desert-${name}`, { hud: false });
    }
  }

  // ------------------------------------------------------------------ natural prop gallery (Appendix D review)
  if (shots) {
    const cam = await g.eval(async () => {
      const c = window.__game.ctx, T = c.THREE, w = c.world, r = w.route;
      const S = await import(new URL('src/world/scatter.js', location.href).href);
      const grp = new T.Group(); grp.name = 'p2-gallery';
      const s0 = 2450, t = r.tangentAt(s0), right = new T.Vector3(-t.z, 0, t.x);
      const names = S.NATURAL_PROPS;
      names.forEach((n, i) => {
        for (let v = 0; v < 3; v++) {
          const type = S.propFactory(`${n}#${v}`)(c);
          const m = new T.Mesh(type.geometry, type.material);
          const big = type.radius > 1.2 || type.height > 3;
          const sc = n === 'boulder' ? 2.5 : (type.height < 0.5 && !big) ? 2.2 : 1.6;
          const p = r.toWorld(s0 + 6 + v * 9, (i - (names.length - 1) / 2) * 6.5);
          m.position.set(p.x, w.groundHeight(p.x, p.z) - 0.1, p.z);
          m.scale.setScalar(sc); m.rotation.y = i * 0.7 + v;
          m.castShadow = true; m.receiveShadow = true;
          grp.add(m);
        }
      });
      c.levelRoot.add(grp);
      const pos = r.toWorld(s0 - 34, 0), look = r.toWorld(s0 + 14, 0);
      return { pos: [pos.x, w.groundHeight(pos.x, pos.z) + 9, pos.z], look: [look.x, w.groundHeight(look.x, look.z) + 1, look.z] };
    });
    await g.camera(cam.pos, cam.look, 60);
    await g.shot('prop-gallery', { hud: false });
    await g.eval(() => { const c = window.__game.ctx, o = c.levelRoot.getObjectByName('p2-gallery'); if (o) c.levelRoot.remove(o); });
  }

  // ------------------------------------------------------------------ addendum: snowy-ice preset on High and Low
  if (shots || checks) {
    const SNOW = levelDef('p2snow', SNOW_ART, 6262);
    await g.startLevel(SNOW, 'cp0');
    const sn = await g.eval(() => {
      const w = window.__game.ctx.world, m = w.terrain.material;
      const names = [...w.scatter.meshes.keys()];
      return { names, snow: w.terrain.uniforms.uSnow.value.toArray(), lite: m.defines.TERRAIN_LITE !== undefined,
               st: w.scatter.stats(), shards: names.filter(n => n.startsWith('ice_shard')).length, drifts: names.filter(n => n.startsWith('snow_drift')).length };
    });
    g.assert(sn.snow[0] > 0.5 && sn.shards > 0 && sn.drifts > 0, `snow preset: surface.snow ${sn.snow[0]}, ice_shard ×${sn.shards} and snow_drift ×${sn.drifts} meshes placed`);
    const views = [['near', 900, 0, 5, 1150, 0, -6], ['mid', 1700, 120, 18, 2050, -100, -10], ['vista', 2600, -300, 90, 3300, 100, 0]];
    const snowShots = async (tag) => {
      for (const [name, s, l, h, ls, ll, lh] of views) {
        const cam = await g.eval(([s, l, h, ls, ll, lh]) => {
          const w = window.__game.ctx.world, r = w.route, p = r.toWorld(s, l), q = r.toWorld(ls, ll);
          return { pos: [p.x, w.groundHeight(p.x, p.z) + h, p.z], look: [q.x, w.groundHeight(q.x, q.z) + lh, q.z] };
        }, [s, l, h, ls, ll, lh]);
        await g.camera(cam.pos, cam.look, 62);
        if (shots) await g.shot(`snow-${tag}-${name}`, { hud: false });
      }
    };
    await snowShots(g.args.tier);
    if (g.args.tier !== 'low') {
      await g.eval(() => window.__game.setTier('low'));
      await g.step(2);
      await g.eval(async () => { const w = window.__game.ctx.world; await w.regenerateScatter(); });
      const lo = await g.eval(() => ({ lite: window.__game.ctx.world.terrain.material.defines.TERRAIN_LITE !== undefined,
                                       segs: window.__game.ctx.world.terrain.segs, st: window.__game.ctx.world.terrain.stats() }));
      g.assert(lo.lite && lo.segs === 32, `Low tier: TERRAIN_LITE material and 32-segment nodes (${lo.lite}, ${lo.segs})`);
      await snowShots('low');
      await g.eval(() => window.__game.setTier('high'));
      await g.step(2);
      await g.eval(async () => { await window.__game.ctx.world.regenerateScatter(); });
      const hi = await g.eval(() => ({ lite: window.__game.ctx.world.terrain.material.defines.TERRAIN_LITE !== undefined, segs: window.__game.ctx.world.terrain.segs }));
      g.assert(!hi.lite && hi.segs === 64, `back on High: full material and 64-segment nodes (${!hi.lite}, ${hi.segs})`);
    }
    await g.eval(() => window.__game.freeCam(false));
  }

  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).slice(0, 5).join('; ')})`);
}
