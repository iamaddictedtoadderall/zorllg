// tools/scenarios/p3-art.mjs (P3): Forge acceptance (architecture §10.6 + addendum A6 P3).
//   node tools/playtest.mjs --scenario p3-art --port 8500 --out /tmp/campaign-playtest/P3-p3-art [--param only=kit,mechs]
// Galleries (kit, structures LOD0/LOD1, units, mechs × parts), isolated per-asset budgets (pipeline.setView + stats),
// mech pose parity (baked vs unbaked), structure states, lazy realise, the garage and the Bench.

// ------------------------------------------------------------------ page-side studio (installed once)
async function installStudio(g) {
  await g.eval(async () => {
    const G = window.__game, ctx = G.ctx, THREE = ctx.THREE;
    const { RoomEnvironment } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8d99a6);
    const cam = new THREE.PerspectiveCamera(40, ctx.camera.aspect, 0.3, 4000);
    const hemi = new THREE.HemisphereLight(0xcfd8e6, 0x4a4038, 1.7);
    const sun = new THREE.DirectionalLight(0xfff0dc, 6.5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    const rim = new THREE.DirectionalLight(0x9fc0e8, 2.8);
    scene.add(hemi, sun, sun.target, rim);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5b5650, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    try {
      const pm = new THREE.PMREMGenerator(ctx.renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
    } catch (e) { /* ignore */ }
    const root = new THREE.Group(); scene.add(root);
    const scr = document.getElementById('screen'), scrHidden = scr.hidden;
    scr.hidden = true;
    const S = window.__p3 = {
      scene, cam, root, sun, rim, hemi, ground,
      clear() { for (const c of root.children.slice()) root.remove(c); },
      add(o) { root.add(o); return o; },
      light(center, span) {
        const c = new THREE.Vector3(...center);
        sun.position.copy(c).add(new THREE.Vector3(span * 0.6, span * 1.1, span * 0.8)); sun.target.position.copy(c);
        const sc = sun.shadow.camera; sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.near = 1; sc.far = span * 4; sc.updateProjectionMatrix();
        rim.position.copy(c).add(new THREE.Vector3(-span, span * 0.5, -span));
      },
      view(pos, look, fov = 40) {
        cam.fov = fov; cam.aspect = ctx.camera.aspect; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        ctx.pipeline.setView(scene, cam);
      },
      /** isolated stats for an object: render only it (ground hidden), return draw calls and triangles */
      measure(o) {
        const vis = root.children.map(c => c.visible);
        root.children.forEach(c => { c.visible = c === o; });
        ground.visible = false;
        const sh = ctx.renderer.shadowMap.enabled; ctx.renderer.shadowMap.enabled = false;
        // frame the object with a temporary camera so frustum culling keeps all of it
        o.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length() || 1;
        const mc = new THREE.PerspectiveCamera(50, cam.aspect, 0.1, size * 20);
        mc.position.copy(c).add(new THREE.Vector3(-0.6, 0.45, -0.8).normalize().multiplyScalar(size * 1.4)); mc.lookAt(c); mc.updateMatrixWorld();
        // main pass only: a direct render (the pipeline's post passes and GTAO re-render would add to it)
        const R = ctx.renderer;
        R.info.reset(); R.render(scene, mc);
        const st = { calls: R.info.render.calls, triangles: R.info.render.triangles };
        ctx.pipeline.setView(scene, mc); ctx.renderFrame();
        const ps = ctx.pipeline.stats();
        st.pipelineCalls = ps.calls; st.pipelineTriangles = ps.triangles;
        ctx.renderer.shadowMap.enabled = sh;
        root.children.forEach((c2, i) => { c2.visible = vis[i]; });
        ground.visible = true;
        ctx.pipeline.setView(scene, cam);
        return { calls: st.calls, triangles: st.triangles };
      },
      done() { ctx.pipeline.clearView(); scr.hidden = scrHidden; },
    };
    return true;
  });
}

const want = (g, k) => { const only = (g.args.params.find(p => p.startsWith('only=')) || '').slice(5); return !only || only.split(',').includes(k); };

// ------------------------------------------------------------------ Kit v1 gallery
async function kitGallery(g) {
  const r = await g.eval(async () => {
    const ctx = window.__game.ctx, THREE = ctx.THREE, S = window.__p3;
    const K = await import(new URL('src/art/kit.js', location.href).href);
    S.clear();
    const M = ctx.materials;
    const mats = { steel: M.get('steel'), dark: M.get('dark'), rust: M.get('rust'), conc: M.get('concrete'), ice: M.get('ice'), stripe: M.get('stripe'), snow: M.get('snow') };
    const items = [
      ['slab', K.slab(3, 2, 1.5)], ['bevelBox', K.bevelBox(2, 2, 2, 0.15)], ['panelBox', K.panelBox(4, 3, 3)],
      ['armourPlate', K.armourPlate(K.chamferRect(3, 2.4, 0.5), 0.4)], ['ribbedPlate', K.ribbedPlate(3.4, 2.4, 0.3, { pitch: 0.5 })],
      ['plate+holes', K.plateGeo(K.chamferRect(3, 2.4, 0.4), 0.3, 'front', 0.06, { holes: [K.chamferRect(0.8, 1.2, 0.15, -0.7, 0), K.chamferRect(0.8, 1.2, 0.15, 0.7, 0)] })],
      ['cylinder', K.cylinder(1, 1.2, 2.4, 20)], ['dome', K.dome(1.4, 1.2)], ['ring', K.ring(1.2, 0.3, 0.3)], ['flange', K.flange(0.6, 0.25, 0.3)],
      ['drum', K.drum(0.9, 2.2, 2)], ['lampHousing', K.lampHousing(0.8)], ['nozzle', K.nozzle(1, 2)],
      ['pipeRun', K.pipeRun([[-1.6, 0.4, 0], [0.4, 0.4, 0], [0.4, 2.2, 0], [1.6, 2.2, 0.6]], 0.25, { flangeEvery: 1 })],
      ['truss', K.truss(4, 1, 1.4, 4, 0.12)], ['loft', K.loft([{ z: -1.5, pts: K.chamferRect(1.2, 1, 0.3) }, { z: 0, pts: K.chamferRect(2, 1.6, 0.5) }, { z: 1.5, pts: K.chamferRect(1, 0.8, 0.25) }])],
      ['greebles', K.greebles(() => Math.random(), 3, 2.4, 0.8)], ['rockGeo', K.rockGeo(7)], ['floe', K.floe(3, 2.2, 0.8)],
      ['pressureRidge', K.pressureRidge([[-3, 0], [3, 0.5]], 3, { seed: 2 })], ['icicles', K.icicles([[-1.5, 2.4, 0], [1.5, 2.4, 0]], 9, { len: 1.8 })],
    ];
    const lift = { cylinder: 1.2, ring: 0.3, flange: 0.15, nozzle: 0.25, slab: 1, bevelBox: 1, panelBox: 1.5, armourPlate: 1.3, ribbedPlate: 1.3, 'plate+holes': 1.3,
                   loft: 0.9, greebles: 1.3, rockGeo: 0.6, icicles: 0 };
    const matOf = { cylinder: mats.steel, dome: mats.conc, ring: mats.dark, drum: mats.rust, nozzle: mats.dark, pipeRun: mats.rust, truss: mats.rust,
                    rockGeo: M.get('rock'), floe: mats.ice, pressureRidge: mats.ice, icicles: mats.ice, greebles: mats.steel, panelBox: mats.conc, ribbedPlate: mats.rust };
    const out = [];
    items.forEach(([name, geo], i) => {
      const col = i % 7, row = Math.floor(i / 7);
      const m = new THREE.Mesh(geo, matOf[name] || mats.steel);
      m.position.set((col - 3) * 6, lift[name] ?? 0, (row - 1) * 7);
      if (name === 'greebles' || name === 'plate+holes' || name === 'armourPlate' || name === 'ribbedPlate') m.rotation.x = -0.35;
      m.castShadow = m.receiveShadow = true;
      S.add(m);
      if (name === 'floe' && geo.userData.snow) { const s = new THREE.Mesh(geo.userData.snow, mats.snow); s.position.copy(m.position); S.add(s); }
      if (name === 'lampHousing') { const l = new THREE.Mesh(K.lampLens(0.8), M.get('lightAmber')); l.position.copy(m.position); l.position.y += 0.8 * 1.24; S.add(l); }
      const a = geo.attributes;
      out.push({ name, tris: a.position.count / 3, kit: !geo.index && !!a.color && !!a.edge && !a.uv && Object.keys(a).length === 4 });
    });
    S.light([0, 0, 0], 26);
    S.view([2, 24, 34], [0, 0, 1], 42);
    return out;
  });
  await g.shot('kit-gallery', { hud: false, settle: false });
  const bad = r.filter(x => !x.kit);
  g.assert(bad.length === 0, `Kit v1: every builder returns kit geometry (position, normal, color, edge; non-indexed, no uv) (${bad.map(b => b.name).join(', ') || 'all ' + r.length})`);
  g.log('kit triangles:', r.map(x => `${x.name} ${x.tris}`).join(' · '));
  await g.eval(() => { const S = window.__p3; S.view([0, 9, 15], [0, 1.2, -4], 38); });
  await g.shot('kit-gallery-close', { hud: false, settle: false });
}


// ------------------------------------------------------------------ mechs: frames × loadouts (every part visual)
const LOADOUTS = [
  { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' },
  { R: 'mg_r12', L: 'blade_hx', S: 'msl_sw8', U: 'kit_rk3' },
  { R: 'shotgun_s8', L: 'harpoon_gaff', S: 'mortar_m3', U: 'kit_rk3' },
  { R: 'cannon_hc90', L: 'harpoon_gaff', S: 'flare_pod', U: 'kit_rk2f' },
];
async function mechGallery(g) {
  const r = await g.eval(async (LOADOUTS) => {
    const ctx = window.__game.ctx, THREE = ctx.THREE, S = window.__p3;
    const MX = await import(new URL('src/art/mechs.js', location.href).href);
    const LO = await import(new URL('src/combat/loadout.js', location.href).href);
    S.clear();
    const moth = LO.MOTH_PAINT ?? { base: '#d8d2c4', mid: '#aaa494', accent: '#c99a3e', visor: '#5fe3ff', flame: '#a8ecff', blade: '#8fe9ff' };
    const paint = LO.PAINT_PRESETS?.[0] ?? { base: '#5a5f67', mid: '#3b3f45', accent: '#d0842f', visor: '#7fe9ff' };
    const designs = ['vanguard', 'striker', 'bastion', 'moth'];
    const rigs = [];
    const out = { visuals: Object.keys(MX.PART_VISUALS), designs: Object.keys(MX.DESIGNS), budget: [] };
    designs.forEach((d, i) => LOADOUTS.forEach((lo, j) => {
      const sc = d === 'moth' ? { design: d, ...moth, dark: '#24262b', wear: 0.55 } : { design: d, ...paint };
      const rig = MX.buildMech(ctx, sc, { parts: lo });
      rig.root.position.set((j - 1.5) * 15, 0, (i - 1.5) * 15);
      rig.root.rotation.y = 0.55;
      MX.animateMech(rig, { fwd: 0, lat: 0, onGround: true, pitch: -0.1, thrust: 0, hover: 0, landT: 0 }, 1);
      S.add(rig.root);
      rigs.push(rig);
    }));
    window.__p3.rigs = rigs;
    S.light([0, 5, 0], 40);
    // isolated budget per design (loadout 0 and the heaviest set), whole mech incl. thrust and blade FX
    for (const k of [0, 3, 8, 11, 12, 15]) {
      const rig = rigs[k];
      const idle = S.measure(rig.root);
      rig.flames.forEach(f => f.visible = true); rig.vents.forEach(f => f.visible = true); rig.blade.visible = true;
      const fx = S.measure(rig.root);
      rig.flames.forEach(f => f.visible = false); rig.vents.forEach(f => f.visible = false); rig.blade.visible = false;
      out.budget.push({ mech: `${rig.design}#${k % 4}`, idle, fx, baked: rig.baked });
    }
    S.view([-62, 50, -74], [0, 2, 0], 36);
    return out;
  }, LOADOUTS);
  await g.shot('mechs-grid', { hud: false, settle: false });
  const need = ['rifle', 'mg', 'shotgun', 'cannon', 'blade', 'blade_heavy', 'pod4', 'pod8', 'mortar', 'kit', 'harpoon', 'flarepod'];
  g.assert(need.every(v => r.visuals.includes(v)), `PART_VISUALS covers every visual id (${need.filter(v => !r.visuals.includes(v)).join(', ') || 'all 12'})`);
  g.assert(['vanguard', 'striker', 'bastion', 'moth'].every(d => r.designs.includes(d)), `DESIGNS has vanguard, striker, bastion, moth (${r.designs.join(', ')})`);
  for (const b of r.budget) {
    g.log(`budget mech ${b.mech}: idle ${b.idle.calls} calls / ${b.idle.triangles} tris; with thrust+hover+blade ${b.fx.calls} calls / ${b.fx.triangles} tris`);
    g.assert(b.baked && b.fx.calls <= 12 && b.fx.triangles <= 40000, `mech ${b.mech} within budget (≤ 12 calls, ≤ 40k tris): ${b.fx.calls} calls, ${b.fx.triangles} tris`);
  }
  // close-ups per frame (3/4 front-right and back-left)
  const views = [['vanguard', 0], ['striker', 1], ['bastion', 2], ['moth', 3]];
  for (const [d, i] of views) {
    await g.eval(([i]) => {
      const S = window.__p3, rigs = S.rigs;
      rigs.forEach((r, k) => { r.root.visible = Math.floor(k / 4) === i; });
      S.view([-34, 13, (i - 1.5) * 15 - 30], [-2, 5, (i - 1.5) * 15], 46);
    }, [i]);
    await g.shot(`mech-${d}`, { hud: false, settle: false });
    await g.eval(([i]) => { const S = window.__p3; S.view([-30, 9, (i - 1.5) * 15 - 15], [-22.5, 5.2, (i - 1.5) * 15], 34); }, [i]);
    await g.shot(`mech-${d}-close`, { hud: false, settle: false });
  }
  await g.eval(() => {
    const S = window.__p3; S.rigs.forEach(r => { r.root.visible = true; });
    S.view([30, 16, 40], [0, 5, 0], 45);
  });
  await g.shot('mechs-back', { hud: false, settle: false });
}


// ------------------------------------------------------------------ mech pose parity (baked vs unbaked) and the kneel
async function mechPoses(g) {
  const poses = {
    idle: { fwd: 0, lat: 0, onGround: true, pitch: -0.1, thrust: 0, hover: 0, landT: 0 },
    run: { fwd: 30, lat: 4, onGround: true, pitch: 0, thrust: 0, hover: 0, landT: 0 },
    air: { fwd: 10, lat: 0, onGround: false, pitch: 0.2, thrust: 0.4, hover: 0.8, landT: 0 },
    boost: { fwd: 82, lat: 0, onGround: true, pitch: 0, thrust: 1.3, hover: 0, landT: 0 },
    blade: { fwd: 40, lat: 0, onGround: true, pitch: 0, thrust: 0.6, hover: 0, landT: 0, bladeT: 0.2, bladeWind: false },
    stagger: { fwd: 0, lat: 0, onGround: true, pitch: -0.2, thrust: 0, hover: 0, landT: 0, crouch: 0.3 },
  };
  await g.eval(() => {
    const S = window.__p3; S.clear();
    window.__seedRandom = (seed) => { let a = seed >>> 0; const prev = Math.random; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => { Math.random = prev; }; };
    window.__canvasPixels = () => { const src = document.getElementById('view'); const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const x = c.getContext('2d'); x.drawImage(src, 0, 0, 320, 180); return Array.from(x.getImageData(0, 0, 320, 180).data); };
  });
  const diffs = {};
  for (const [name, st] of Object.entries(poses)) {
    const pix = [];
    for (const bake of [true, false]) {
      pix.push(await g.eval(async ([st, bake]) => {
        const ctx = window.__game.ctx, S = window.__p3;
        const MX = await import(new URL('src/art/mechs.js', location.href).href);
        S.clear();
        const restore = window.__seedRandom(42);
        const rig = MX.buildMech(ctx, { design: 'vanguard', base: '#8a8f96', mid: '#5b6068', accent: '#d0842f', visor: '#7fe9ff' }, { bake, parts: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' } });
        rig.root.rotation.y = 0.6;
        S.add(rig.root);
        for (let i = 0; i < 90; i++) MX.animateMech(rig, st, 1 / 60);
        restore();
        S.light([0, 5, 0], 14);
        S.view([-15, 9, -17], [0, 5, 0], 40);
        ctx.renderFrame();
        window.__p3.lastRig = rig;
        return window.__canvasPixels();
      }, [st, bake]));
      if (bake) await g.shot(`pose-${name}`, { hud: false, settle: false });
    }
    let d = 0; for (let i = 0; i < pix[0].length; i += 4) d += Math.abs(pix[0][i] - pix[1][i]) + Math.abs(pix[0][i + 1] - pix[1][i + 1]) + Math.abs(pix[0][i + 2] - pix[1][i + 2]);
    diffs[name] = d / (pix[0].length / 4) / 3;
  }
  g.log('baked vs unbaked mean abs pixel difference (0-255):', JSON.stringify(diffs));
  g.assert(Object.values(diffs).every(v => v < 1.5), `baked mech animates identically to the unbaked one in every pose (max diff ${Math.max(...Object.values(diffs)).toFixed(3)} / 255)`);
  // the kneel (A5.3): pelvis drops ≥ 2.5 m, knees bend ≥ 70°, torso pitches forward 10–15°
  const kn = await g.eval(async () => {
    const ctx = window.__game.ctx, S = window.__p3;
    const MX = await import(new URL('src/art/mechs.js', location.href).href);
    const LO = await import(new URL('src/combat/loadout.js', location.href).href);
    const moth = LO.MOTH_PAINT ?? { base: '#d8d2c4', mid: '#aaa494', accent: '#c99a3e', visor: '#5fe3ff', flame: '#a8ecff', blade: '#8fe9ff' };
    S.clear();
    const rig = MX.buildMech(ctx, { design: 'moth', ...moth, dark: '#24262b', wear: 0.55 }, { parts: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' } });
    S.add(rig.root); rig.root.rotation.y = 0.5;
    const st = { fwd: 0, lat: 0, onGround: true, pitch: -0.15, thrust: 0, hover: 0, landT: 0 };
    for (let i = 0; i < 120; i++) MX.animateMech(rig, st, 1 / 60);
    const p0 = rig.pelvis.position.y;
    for (let i = 0; i < 240; i++) MX.animateMech(rig, { ...st, crouch: 1 }, 1 / 60);
    const knees = rig.legs.map(L => L.knee.rotation.x * 180 / Math.PI);
    const out = { drop: p0 - rig.pelvis.position.y, knees, torso: -rig.torso.rotation.x * 180 / Math.PI };
    // feet stay on the ground: lowest foot plate point
    rig.root.updateMatrixWorld(true);
    let low = Infinity; rig.root.traverse(o => { if (o.isSkinnedMesh) { o.computeBoundingBox(); low = Math.min(low, o.boundingBox.min.y); } });
    out.lowest = low;
    S.light([0, 3, 0], 12);
    S.view([-11, 5.5, -12], [0, 3.2, 0], 40);
    return out;
  });
  await g.shot('moth-kneel', { hud: false, settle: false });
  await g.eval(() => { window.__p3.view([17, 5, -12], [0, 3, 0], 40); });
  await g.shot('moth-kneel-side', { hud: false, settle: false });
  g.log('kneel:', JSON.stringify(kn));
  g.assert(kn.drop >= 2.5 && kn.knees.every(k => k >= 70) && kn.torso >= 10 && kn.torso <= 15,
    `crouch 1 kneel: pelvis drop ${kn.drop.toFixed(2)} m (≥ 2.5), knees ${kn.knees.map(k => k.toFixed(0)).join('/')}° (≥ 70), torso ${kn.torso.toFixed(1)}° (10–15)`);
  // TEAR pose (optional additive): reach, grab, rip
  for (const [i, t] of [[0, 0.25], [1, 0.5], [2, 0.75]]) {
    await g.eval(async ([t]) => {
      const S = window.__p3, ctx = window.__game.ctx;
      const MX = await import(new URL('src/art/mechs.js', location.href).href);
      S.clear();
      const rig = MX.buildMech(ctx, { design: 'vanguard', base: '#8a8f96', mid: '#5b6068', accent: '#d0842f', visor: '#7fe9ff' });
      S.add(rig.root); rig.root.rotation.y = 0.6;
      for (let k = 0; k < 120; k++) MX.animateMech(rig, { fwd: 0, lat: 0, onGround: true, pitch: 0, thrust: 0, hover: 0, landT: 0, tear: t }, 1 / 60);
      S.view([-15, 9, -17], [0, 5, 0], 40);
    }, [t]);
    await g.shot(`pose-tear-${i}`, { hud: false, settle: false });
  }
}


// ------------------------------------------------------------------ units gallery and budgets
async function unitGallery(g) {
  const r = await g.eval(async () => {
    const ctx = window.__game.ctx, THREE = ctx.THREE, S = window.__p3;
    const U = await import(new URL('src/art/units.js', location.href).href);
    S.clear();
    ctx.materials.setFactions?.({ ...(ctx.mission?.def?.factions || {}), p3gallery: { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#ffb04a', wear: 0.7 } });
    const out = [];
    const place = { drone: [-34, 9, 0], tank: [-22, 0, 0], tank_heavy: [-6, 0, 0], turret: [8, 0, 0], gunship: [22, 12, 0],
                    walker: [-30, 0, 26], artillery: [-12, 0, 26], apc: [3, 0, 26], dropship: [26, 14, 30], beacon: [44, 0, 18] };
    window.__p3.units = {};
    for (const kind of U.UNIT_MODELS) {
      const rig = U.buildUnit(ctx, kind, 'p3gallery');
      rig.root.position.set(...place[kind]); rig.root.rotation.y = -0.5;
      S.add(rig.root);
      U.animateUnit(rig, 0.3, { speed: 4, alert: true });
      const parts = Object.keys(rig.parts);
      const st = S.measure(rig.root);
      out.push({ kind, ...st, parts, muzzles: rig.muzzles.length, eyes: rig.eyes.length, baked: !!rig.root.userData.rigidBake });
      window.__p3.units[kind] = rig;
    }
    S.light([5, 5, 14], 50);
    S.view([-10, 34, -62], [4, 3, 14], 44);
    return out;
  });
  await g.shot('units-gallery', { hud: false, settle: false });
  for (const u of r) {
    g.log(`budget unit ${u.kind}: ${u.calls} calls, ${u.triangles} tris, parts ${u.parts.join('/')}, muzzles ${u.muzzles}, eyes ${u.eyes}`);
    g.assert(u.baked && u.calls <= 8 && u.triangles <= 15000, `unit ${u.kind} within budget (≤ 8 calls, ≤ 15k tris): ${u.calls} calls, ${u.triangles} tris`);
  }
  const close = [['drone', [-34, 9, 0], 9], ['tank', [-22, 1.8, 0], 11], ['tank_heavy', [-6, 2.5, 0], 15], ['turret', [8, 2, 0], 8], ['gunship', [22, 12, 0], 15],
                 ['walker', [-30, 6, 26], 20], ['artillery', [-12, 3, 26], 17], ['apc', [3, 2, 26], 13], ['dropship', [26, 14, 30], 34], ['beacon', [44, 8, 18], 26]];
  for (const [kind, at, d] of close) {
    await g.eval(([kind, at, d]) => {
      const S = window.__p3;
      for (const [k, rig] of Object.entries(S.units)) rig.root.visible = k === kind;
      S.view([at[0] - d * 0.55, at[1] + d * 0.35, at[2] - d * 0.85], at, 42);
    }, [kind, at, d]);
    await g.shot(`unit-${kind}`, { hud: false, settle: false });
  }
  await g.eval(() => { for (const rig of Object.values(window.__p3.units)) rig.root.visible = true; });
}

export default async function (g) {
  await installStudio(g);
  if (want(g, 'kit')) await kitGallery(g);
  if (want(g, 'mechs')) await mechGallery(g);
  if (want(g, 'poses')) await mechPoses(g);
  if (want(g, 'units')) await unitGallery(g);
  await g.eval(() => window.__p3.done());
  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).join('; ')})`);
}
