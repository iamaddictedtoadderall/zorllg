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
    // mirror the live atmosphere (P1) so galleries are lit like the game: sun, hemi, rim and the sky PMREM
    const A = ctx.atmosphere;
    if (A?.sun) { sun.color.copy(A.sun.color); sun.intensity = A.sun.intensity || sun.intensity; }
    if (A?.hemi) { hemi.color.copy(A.hemi.color); hemi.groundColor.copy(A.hemi.groundColor); hemi.intensity = A.hemi.intensity || hemi.intensity; }
    if (A?.rim) { rim.color.copy(A.rim.color); rim.intensity = A.rim.intensity || rim.intensity; }
    if (ctx.scene.environment) { scene.environment = ctx.scene.environment; scene.environmentIntensity = 1; }
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


// ------------------------------------------------------------------ structures: every catalogue type, LOD0 and LOD1, isolated budgets
const SET_PIECES = new Set(['crashed_ship']);
async function structureGallery(g) {
  const r = await g.eval(async () => {
    const ctx = window.__game.ctx, S = window.__p3, ST = ctx.structures;
    const mod = await import(new URL('src/art/structures.js', location.href).href);
    S.clear();
    const out = [];
    let x = 0, z = 0, rowD = 0;
    S.structs = {};
    for (const type of mod.STRUCTURE_TYPES) {
      let pv;
      try { pv = ST.preview(type); } catch (e) { out.push({ type, err: String(e && e.stack || e).slice(0, 400) }); continue; }
      const fp = pv.footprint, w = fp.shape === 'circle' ? fp.r * 2 : fp.w, d = fp.shape === 'circle' ? fp.r * 2 : fp.d;
      if (x > 0 && x + w > 430) { x = 0; z += rowD + 24; rowD = 0; }
      const cx = x + w / 2, cz = z + d / 2;
      pv.lod0.position.set(cx, 0, cz); S.add(pv.lod0);
      const m0 = S.measure(pv.lod0);
      let m1 = { calls: 0, triangles: 0 };
      if (pv.lod1) { pv.lod1.position.set(cx, 0, cz); S.add(pv.lod1); m1 = S.measure(pv.lod1); pv.lod1.visible = false; }
      S.structs[type] = { c: [cx, 0, cz], w, d, h: pv.height, lod0: pv.lod0, lod1: pv.lod1 };
      out.push({ type, calls0: m0.calls, tris0: m0.triangles, calls1: m1.calls, tris1: m1.triangles, w: Math.round(w), d: Math.round(d), h: Math.round(pv.height),
                 lamps: pv.lamps.length });
      x += w + 22; rowD = Math.max(rowD, d);
    }
    S.extent = [x, z + rowD];
    S.light([215, 0, (z + rowD) / 2], 300);
    S.view([215 - 40, 260, -170], [215, 0, (z + rowD) / 2 - 10], 46);
    return out;
  });
  await g.shot('structures-lod0', { hud: false, settle: false });
  await g.eval(() => { for (const s of Object.values(window.__p3.structs)) { s.lod0.visible = false; if (s.lod1) s.lod1.visible = true; } });
  await g.shot('structures-lod1', { hud: false, settle: false });
  await g.eval(() => { for (const s of Object.values(window.__p3.structs)) { s.lod0.visible = true; if (s.lod1) s.lod1.visible = false; } });
  for (const s of r) {
    if (s.err) { g.assert(false, `structure ${s.type} builds (${s.err})`); continue; }
    const big = SET_PIECES.has(s.type), t0 = big ? 200000 : 60000, t1 = big ? 15000 : 6000;
    g.log(`budget structure ${s.type}: LOD0 ${s.calls0} calls ${s.tris0} tris · LOD1 ${s.calls1} call ${s.tris1} tris · ${s.w}×${s.d}×${s.h} m · ${s.lamps} lamps`);
    g.assert(s.calls0 >= 1 && s.calls0 <= 6 && s.tris0 <= t0 && s.calls1 === 1 && s.tris1 <= t1,
      `structure ${s.type} within budget (LOD0 ≤ 6 calls, ≤ ${t0 / 1000}k; LOD1 1 call, ≤ ${t1 / 1000}k): ${s.calls0}/${s.tris0}, ${s.calls1}/${s.tris1}`);
  }
  // close-ups: every type at LOD0; a few at LOD1 next to it
  for (const s of r) {
    if (s.err) continue;
    await g.eval((type) => {
      const S = window.__p3, T = S.structs[type];
      for (const [k, o] of Object.entries(S.structs)) o.lod0.visible = k === type;
      const R = Math.max(T.w, T.d, T.h * 1.15) * 1.3, c = T.c, dir = [-0.55, 0.42, -0.8], n = Math.hypot(...dir);
      S.light(c, R);
      S.view([c[0] + dir[0] / n * R, T.h * 0.42 + dir[1] / n * R, c[2] + dir[2] / n * R], [c[0], T.h * 0.42, c[2]], 42);
    }, s.type);
    await g.shot(`structure-${s.type}`, { hud: false, settle: false });
  }
  for (const type of ['bunker', 'refinery', 'hangar', 'crashed_ship', 'relay_pylon', 'gate']) {
    if (!r.find(s => s.type === type && !s.err)) continue;
    await g.eval((type) => {
      const S = window.__p3, T = S.structs[type];
      for (const [k, o] of Object.entries(S.structs)) o.lod0.visible = k === type;
      if (T.lod1) { T.lod1.visible = true; T.lod1.position.x = T.c[0] + T.w * 1.15; }
      const size = Math.max(T.w * 2.2, T.d, T.h * 1.4), c = [T.c[0] + T.w * 0.57, 0, T.c[2]];
      S.light(c, size * 0.8);
      S.view([c[0] - size * 0.2, Math.max(T.h * 0.6, 3) + size * 0.35, c[2] - size * 0.85], [c[0], T.h * 0.32, c[2]], 42);
    }, type);
    await g.shot(`structure-${type}-lod0-lod1`, { hud: false, settle: false });
    await g.eval((type) => { const T = window.__p3.structs[type]; if (T.lod1) { T.lod1.visible = false; T.lod1.position.x = T.c[0]; } }, type);
  }
  await g.eval(() => { const S = window.__p3; for (const o of Object.values(S.structs)) o.lod0.visible = true; });
}

// ------------------------------------------------------------------ man-made props (Appendix C.2)
async function propGallery(g) {
  const r = await g.eval(async () => {
    const ctx = window.__game.ctx, THREE = ctx.THREE, S = window.__p3;
    const mod = await import(new URL('src/art/structures.js', location.href).href);
    S.clear();
    const mat = ctx.materials?.standard ? ctx.materials.standard({ color: '#ffffff', vertexColors: true, roughness: 0.78, metalness: 0.3, wear: 0.55 })
      : new THREE.MeshStandardMaterial({ vertexColors: true });
    const out = [];
    let i = 0;
    for (const [name, prop] of Object.entries(mod.PROPS)) {
      const geo = prop.geometry(ctx);
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
      m.position.set((i % 6) * 13 - 32, 0, Math.floor(i / 6) * 13);
      S.add(m);
      const a = geo.attributes;
      out.push({ name, tris: (geo.index ? geo.index.count : a.position.count) / 3, color: !!a.color, radius: prop.radius, height: prop.height, collider: prop.collider });
      i++;
    }
    S.light([0, 0, 6], 45);
    S.view([-6, 26, -36], [0, 0, 6], 40);
    return out;
  });
  await g.shot('props-gallery', { hud: false, settle: false });
  for (const p of r) {
    g.log(`budget prop ${p.name}: ${p.tris} tris, r ${p.radius}, h ${p.height}, ${p.collider}`);
    g.assert(p.tris <= 2000 && p.color && p.radius > 0 && p.height > 0, `prop ${p.name} within budget (1 vertex-coloured geometry, ≤ 2k tris): ${p.tris}`);
  }
  await g.eval(() => { const S = window.__p3; S.view([-14, 9, -14], [-20, 1, 2], 40); });
  await g.shot('props-close', { hud: false, settle: false });
}

// ------------------------------------------------------------------ structure states and lazy realise (in the test level)
async function structureWorld(g) {
  await g.startLevel('test', 'cp_start');
  await g.setGod(true);
  await g.step(10);
  const base = await g.eval(() => {
    const ctx = window.__game.ctx, ST = ctx.structures, V = ctx.THREE.Vector3;
    const p = ctx.player.pos, gh = (x, z) => ctx.world?.groundHeight?.(x, z) ?? 0;
    const at = (dx, dz) => new V(p.x + dx, gh(p.x + dx, p.z + dz), p.z + dz);
    const gate = ST.place({ id: 'p3_gate', type: 'gate' }, at(70, 40), 0.3);
    const pylon = ST.place({ id: 'p3_pylon', type: 'relay_pylon', destructible: { ap: 500, name: 'RELAY' } }, at(-60, 60), 0);
    const bunker = ST.place({ id: 'p3_bunker', type: 'bunker', destructible: { ap: 800, name: 'BUNKER' } }, at(10, 110), 0.6);
    ST.settle(p);
    const door = gate.anchors.door.clone(); door.y += 4;
    const pyl = pylon.pos.clone(); pyl.y += 10;
    const bun = bunker.pos.clone(); bun.y += 4;
    const C = ctx.collision;
    window.__p3w = { door, pyl, bun };
    return { gateState: gate.state, doorSolid: C.pointInSolid(door), pylonSolid: C.pointInSolid(pyl), bunkerSolid: C.pointInSolid(bun),
             realised: [gate, pylon, bunker].every(s => !!s.root), gatePos: gate.pos.toArray(), pylonPos: pylon.pos.toArray(), bunkerPos: bunker.pos.toArray() };
  });
  g.assert(base.realised, 'placed structures realise on settle()');
  g.assert(base.gateState === 'closed' && base.doorSolid, `gate starts closed and its door is solid (pointInSolid ${base.doorSolid})`);
  // gate: open → door passable; close → solid again
  const gp = base.gatePos;
  await g.camera([gp[0] - 30, gp[1] + 16, gp[2] - 34], [gp[0], gp[1] + 7, gp[2]]);
  await g.shot('state-gate-closed', { hud: false, settle: false });
  const op = await g.eval(() => { const ctx = window.__game.ctx; ctx.structures.get('p3_gate').setState('open'); return ctx.collision.pointInSolid(window.__p3w.door); });
  await g.step(150);
  await g.shot('state-gate-open', { hud: false, settle: false });
  const cl = await g.eval(() => { const ctx = window.__game.ctx; ctx.structures.get('p3_gate').setState('closed'); return ctx.collision.pointInSolid(window.__p3w.door); });
  g.assert(!op && cl, `gate open/close changes pointInSolid at the door (open ${op}, closed ${cl})`);
  await g.step(150);
  // relay pylon: destroy → topples, colliders swap (tower off, rubble on)
  const pp = base.pylonPos;
  await g.camera([pp[0] - 50, pp[1] + 26, pp[2] - 46], [pp[0], pp[1] + 14, pp[2]]);
  await g.shot('state-pylon-intact', { hud: false, settle: false });
  const pd = await g.eval(() => {
    const ctx = window.__game.ctx, inst = ctx.structures.get('p3_pylon');
    const fx = []; const ex = ctx.fx?.explosion; if (ctx.fx) ctx.fx.explosion = (...a) => { fx.push('explosion'); return ex?.apply(ctx.fx, a); };
    inst.destroy(); window.__p3w.fx = fx; window.__p3w.fxRestore = () => { if (ctx.fx) ctx.fx.explosion = ex; };
    return { state: inst.state, tower: inst.colliders.filter(c => c.tag !== 'rubble').every(c => !c.enabled), rubble: inst.colliders.some(c => c.tag === 'rubble' && c.enabled),
             solidNow: ctx.collision.pointInSolid(window.__p3w.pyl), alive: inst.target?.alive };
  });
  await g.step(45);
  await g.shot('state-pylon-falling', { hud: false, settle: false });
  await g.step(200);
  await g.shot('state-pylon-down', { hud: false, settle: false });
  g.assert(pd.state === 'destroyed' && pd.tower && pd.rubble && !pd.solidNow, `relay_pylon destroy swaps the colliders (tower off ${pd.tower}, rubble on ${pd.rubble}, upper tower no longer solid ${!pd.solidNow}); target killed ${pd.alive === false}`);
  // bunker: destroy → generic collapse (sink + tilt + fx + rubble)
  const bp = base.bunkerPos;
  await g.camera([bp[0] - 36, bp[1] + 20, bp[2] - 30], [bp[0], bp[1] + 3, bp[2]]);
  await g.shot('state-bunker-intact', { hud: false, settle: false });
  const b0 = await g.eval(() => {
    const ctx = window.__game.ctx, inst = ctx.structures.get('p3_bunker');
    const y0 = inst.root.position.y; inst.destroy();
    return { y0, state: inst.state, solid: ctx.collision.pointInSolid(window.__p3w.bun), rubble: inst.colliders.some(c => c.tag === 'rubble' && c.enabled), fx: window.__p3w.fx.length };
  });
  await g.step(50);
  await g.shot('state-bunker-collapsing', { hud: false, settle: false });
  const b1 = await g.eval(() => { const i = window.__game.ctx.structures.get('p3_bunker'); return { y: i.root.position.y, rx: i.root.rotation.x, rz: i.root.rotation.z }; });
  await g.step(200);
  await g.shot('state-bunker-rubble', { hud: false, settle: false });
  const b2 = await g.eval(() => { const i = window.__game.ctx.structures.get('p3_bunker'); return { y: i.root.position.y, rubbleMesh: !!i.rubble, t: i.collapse?.t }; });
  g.assert(b0.state === 'destroyed' && b0.fx >= 2 && b1.y < b0.y0 - 0.3 && b2.y < b1.y && b2.rubbleMesh,
    `bunker destroy plays the collapse (fx ${b0.fx}, y ${b0.y0.toFixed(1)} → ${b1.y.toFixed(1)} → ${b2.y.toFixed(1)}, rubble mesh ${b2.rubbleMesh})`);
  g.assert(!b0.solid && b0.rubble, `bunker colliders swap to rubble (body solid ${b0.solid}, rubble ${b0.rubble})`);
  // reset(states) restores instantly
  const rs = await g.eval(() => {
    const ctx = window.__game.ctx, ST = ctx.structures, C = ctx.collision, w = window.__p3w;
    window.__p3w.fxRestore();
    ST.get('p3_gate').setState('open');
    const snap = { p3_gate: 'closed', p3_pylon: 'intact', p3_bunker: 'intact' };
    ST.reset(snap);
    const b = ST.get('p3_bunker'), pl = ST.get('p3_pylon');
    return { states: [ST.get('p3_gate').state, pl.state, b.state], door: C.pointInSolid(w.door), pyl: C.pointInSolid(w.pyl), bun: C.pointInSolid(w.bun),
             bunkerY: b.root.position.y - b.pos.y, rubble: !!b.rubble, rubbleCol: [...b.colliders, ...pl.colliders].some(c => c.tag === 'rubble' && c.enabled),
             pylonRot: pl.root ? Math.abs(pl.root.rotation.x) + Math.abs(pl.root.rotation.z) : 0, alive: [b.target?.alive, pl.target?.alive],
             doorY: ST.get('p3_gate').root.getObjectByName('door')?.position.y ?? null, all: ST.states() };
  });
  g.assert(rs.states.join() === 'closed,intact,intact' && rs.door && rs.pyl && rs.bun && Math.abs(rs.bunkerY) < 1e-6 && !rs.rubble && !rs.rubbleCol && rs.pylonRot < 1e-6 && rs.doorY === 0,
    `reset(states) restores instantly (${rs.states.join(', ')}; solid ${rs.door}/${rs.pyl}/${rs.bun}; bunker dy ${rs.bunkerY}; rubble ${rs.rubble || rs.rubbleCol}; pylon tilt ${rs.pylonRot}; door y ${rs.doorY})`);
  g.assert(rs.alive.every(a => a === true), `reset revives the destructible targets (${rs.alive.join(', ')})`);
  await g.camera([bp[0] - 36, bp[1] + 20, bp[2] - 30], [bp[0], bp[1] + 3, bp[2]]);
  await g.shot('state-bunker-reset', { hud: false, settle: false });

  // lazy realise: 200 structures far away build nothing until near, then at most one realise per frame
  await g.freeCam(false);
  const lz = await g.eval(() => {
    const ctx = window.__game.ctx, ST = ctx.structures, V = ctx.THREE.Vector3;
    const types = ['container_stack', 'barricade', 'wall', 'bunker', 'watchtower', 'ruin_block', 'salvage_cache', 'checkpoint_beacon'];
    const far = ctx.tier.viewDistance + 200, p = ctx.player.pos;
    const cx = p.x + far * 2.2, cz = p.z;
    const list = [];
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * Math.PI * 2 * 7, rr = 40 + (i % 50) * 9;
      const t = types[i % types.length];
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      list.push(ST.place({ id: 'lazy' + i, type: t, params: t === 'wall' ? { length: 30 + (i % 3) * 10 } : undefined }, new V(x, ctx.world?.groundHeight?.(x, z) ?? 0, z), a));
    }
    window.__p3w.lazy = list; window.__p3w.lazyAt = [cx, cz];
    return { placed: list.length, rooted: list.filter(s => s.root).length, far, dist: Math.round(far * 2.2) };
  });
  await g.step(30);
  const lz1 = await g.eval(() => ({ rooted: window.__p3w.lazy.filter(s => s.root).length, realised: window.__game.ctx.structures.realised }));
  g.assert(lz.placed === 200 && lz.rooted === 0 && lz1.rooted === 0, `placing 200 structures ${lz.dist} m away builds no meshes (${lz.rooted} → ${lz1.rooted} realised after 30 frames)`);
  // move the focus among them: frame by frame, realise() runs at most once
  const lz2 = await g.eval(() => {
    const ctx = window.__game.ctx, ST = ctx.structures, [cx, cz] = window.__p3w.lazyAt;
    // player.teleport directly (the debug teleport settles structures synchronously, which is what this must not do)
    ctx.player.teleport(new ctx.THREE.Vector3(cx, (ctx.world?.groundHeight?.(cx, cz) ?? 0) + 2, cz));
    const per = []; let prev = ST.realised;
    for (let f = 0; f < 90; f++) { window.__game.step(1); const n = ST.realised; per.push(n - prev); prev = n; }
    return { per, max: Math.max(...per), rooted: window.__p3w.lazy.filter(s => s.root).length };
  });
  g.assert(lz2.max <= 1 && lz2.rooted > 0, `near them, realise runs ≤ 1 per frame (max ${lz2.max}; ${lz2.rooted} realised over ${lz2.per.length} frames)`);
  g.log('lazy realise per frame:', lz2.per.join(''));
  await g.step(150);
  const [lx, lzz] = await g.eval(() => window.__p3w.lazyAt);
  await g.camera([lx - 260, 160, lzz - 260], [lx, 0, lzz]);
  await g.shot('lazy-realise-field', { hud: false, settle: false });
}

// ------------------------------------------------------------------ garage (free) and the Bench
async function garageTests(g) {
  await g.eval(() => window.__p3.done());
  // title showcase as booted
  await g.eval(() => { const c = window.__game.ctx; c.garage.showcase(true); c.pipeline.setView(c.garage.scene, c.garage.camera); });
  await g.step(30);
  await g.shot('garage-title', { settle: false });
  // free garage: open, change frame, parts and paint through the DOM
  await g.eval(() => {
    const c = window.__game.ctx, L = c.save;
    for (const id of ['mg_r12', 'cannon_hc90', 'blade_hx', 'msl_sw8', 'mortar_m3', 'kit_rk2f']) L.unlockPart(id);
    window.__garageOpen = c.garage.open({ context: 'title' }); window.__garageClosed = false; window.__garageOpen.then(() => { window.__garageClosed = true; });
  });
  await g.step(20);
  await g.shot('garage-open', { settle: false });
  const click = async (sel) => { await g.page.click(sel); await g.step(2); };
  await click('#screen [data-frame="striker"]');
  await click('#screen [data-tab="R-ARM"]');
  const hasMg = await g.eval(() => !!document.querySelector('#screen [data-part="mg_r12"]'));
  if (hasMg) await click('#screen [data-part="mg_r12"]');
  await click('#screen [data-tab="SHOULDER"]');
  const hasSw = await g.eval(() => !!document.querySelector('#screen [data-part="msl_sw8"]'));
  if (hasSw) await click('#screen [data-part="msl_sw8"]');
  await g.shot('garage-parts', { settle: false });
  await click('#screen [data-tab="PAINT"]');
  await click('#screen [data-paint="1"]');
  await g.step(10);
  await g.shot('garage-paint', { settle: false });
  const w1 = await g.eval(() => window.__game.ctx.garage.working);
  g.assert(w1.frame === 'striker' && w1.paint && (!hasMg || w1.R === 'mg_r12'), `garage: frame, parts and paint change through the UI (${w1.frame}, ${w1.R}, ${w1.S}, paint ${w1.paint?.id ?? w1.paint?.name})`);
  const locked = await g.eval(() => { const c = window.__game.ctx; c.garage.edit({ tab: 'R-ARM' }); return [...document.querySelectorAll('#screen .gx-card.locked')].map(e => e.textContent.replace(/\s+/g, ' ').trim()); });
  g.log('locked R-ARM parts shown:', locked.join(' | '));
  g.assert(locked.length === 0 || locked.every(t => /LOCKED/.test(t)), `locked parts are shown with their unlock hint (${locked.length})`);
  // over-power is blocked with a visible error (needs the full catalogue: striker 38 power)
  const op = await g.eval(() => {
    const c = window.__game.ctx, G = c.garage;
    const P = { frame: 'striker', R: 'cannon_hc90', L: 'blade_hx', S: 'msl_sw8', U: 'kit_rk3' };
    G.edit(P);
    const ok = G.confirm();
    return { ok, open: G.isOpen, err: document.getElementById('gErr')?.textContent || '', errors: G.errors, have: !!(window.__game && P) };
  });
  g.log('over-power confirm:', JSON.stringify(op));
  await g.shot('garage-overpower', { settle: false });
  g.assert(!op.ok && op.open && /power/i.test(op.err), `an over-power loadout is blocked with a visible error ("${op.err}")`);
  // a valid loadout confirms, writes the save and closes
  const ok = await g.eval(async () => {
    const c = window.__game.ctx, G = c.garage;
    G.edit({ frame: 'bastion', R: 'cannon_hc90', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' });
    const res = G.confirm();
    await new Promise(r => setTimeout(r, 0));
    return { res, closed: window.__garageClosed, saved: c.save.getLoadout(), raw: JSON.parse(localStorage.getItem('campaign.save') || '{}')?.garage?.loadout };
  });
  g.assert(ok.res && ok.closed && ok.saved.frame === 'bastion' && ok.raw?.R === 'cannon_hc90', `confirm writes the save (${JSON.stringify(ok.raw)}) and resolves open()`);

  // the Bench with a pending haul of 3 (A6 P3)
  const benchOpen = async () => g.eval(() => {
    const c = window.__game.ctx;
    c.save.setFlag('campaign', { v: 1, day: 0, water: 6, arms: 0, parts: {}, spares: [], fitted: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4' },
      lost: [], fragments: {}, kernel: 4, benchVisits: 0, tearCount: 3, pending: { levelId: 'l01', haul: ['harpoon_gaff', 'shotgun_s8', 'flare_pod'], tears: 3, sledges: 2 },
      ledger: { levelId: 'l01', before: 4, sledges: 2, gives: 0 } });
    window.__benchClosed = false;
    c.garage.open({ context: 'bench', levelId: 'l01' }).then(() => { window.__benchClosed = true; });
    return c.garage.contexts;
  });
  const waitBench = () => g.page.waitForFunction(() => !!window.__game.ctx.garage.bench, null, { timeout: 30000 });
  const contexts = await benchOpen();
  await waitBench();
  g.assert(Array.isArray(contexts) && contexts.includes('bench'), `garage.contexts includes 'bench' (${contexts})`);
  await g.step(60);
  const b0 = await g.eval(() => { const B = window.__game.ctx.garage.bench; return B && { st: B.state(), line: B.line, fired: B.fired }; });
  g.assert(b0 && Object.keys(b0.st.parts).length === 3 && b0.st.parts.harpoon_gaff === 'locker', `Bench: the pending haul of 3 arrives in the Locker (${JSON.stringify(b0?.st.parts)})`);
  g.assert(b0.fired.includes('arrive'), `Bench line 'arrive' plays on open (${b0.line?.who}: ${b0.line?.text})`);
  await g.step(30);
  await g.shot('bench-fit', { settle: false });
  await g.eval(() => { document.getElementById('screen').style.visibility = 'hidden'; });
  await g.shot('bench-scene', { hud: false, settle: false });
  await g.eval(() => { const c = window.__game.ctx.garage.camera; c.clearViewOffset(); c.position.set(-14, 9, -16); c.lookAt(0, 4, 0); c.updateProjectionMatrix(); });
  await g.shot('bench-scene-wide', { hud: false, settle: false });
  await g.eval(() => { document.getElementById('screen').style.visibility = ''; window.__game.ctx.resize(); });
  const api = await g.eval(() => {
    const c = window.__game.ctx, B = c.garage.bench, out = {};
    out.fit = B.fit('L', 'harpoon_gaff');
    const s1 = B.state(); out.fitted = s1.fitted.L; out.partState = s1.parts.harpoon_gaff;
    out.rigL = c.garage.rig.parts.L;
    const w0 = s1.water;
    out.give = B.give('shotgun_s8');
    const s2 = B.state(); out.water = [w0, s2.water]; out.arms = s2.arms; out.given = s2.parts.shotgun_s8; out.gives = s2.ledger.gives;
    out.undo = B.undo();
    const s3 = B.state(); out.afterUndo = [s3.water, s3.parts.shotgun_s8];
    out.giveFitted = B.give('harpoon_gaff');
    out.fittedAfterGive = B.state().fitted.L;
    out.undo2 = B.undo();
    out.stockFit = B.fit('L', 'blade_pb2');
    out.backToLocker = B.state().parts.harpoon_gaff;
    out.refit = B.fit('L', 'harpoon_gaff');
    out.spareFit = B.fit('R', 'nonexistent_part');
    out.fired = B.fired;
    return out;
  });
  g.log('bench api:', JSON.stringify(api));
  g.assert(api.fit && api.fitted === 'harpoon_gaff' && api.partState === 'fitted' && api.rigL === 'harpoon_gaff', 'Bench fit: the Gaff Harpoon is fitted and swapped onto the frame live');
  g.assert(api.give && api.water[1] === api.water[0] + 1 && api.arms === 1 && api.given === 'given' && api.gives === 1, `Bench give: +1 water and arms, part given (${api.water})`);
  g.assert(api.undo && api.afterUndo[0] === api.water[0] && api.afterUndo[1] === 'locker', `Bench undo restores the give (${api.afterUndo})`);
  g.assert(api.giveFitted && api.fittedAfterGive === 'blade_pb2' && api.undo2, 'Bench give of a fitted part refits the stock part');
  g.assert(api.stockFit && api.backToLocker === 'locker' && api.refit && !api.spareFit, 'Bench fit sends the replaced hauled part to the Locker; unknown parts cannot be fitted');
  g.assert(api.fired.includes('fit:harpoon_gaff') && api.fired.includes('give'), `Bench lines fire on fit and give (${api.fired.join(', ')})`);
  for (const tab of ['HAUL', 'WAKE', 'LATTICE']) {
    await g.eval((tab) => window.__game.ctx.garage.bench.tab(tab), tab);
    await g.step(40);
    await g.shot(`bench-${tab.toLowerCase()}`, { settle: false });
  }
  const lat = await g.eval(() => ({ hdr: [...document.querySelectorAll('#screen .gx-sub')].map(e => e.textContent).join('|'), cards: document.querySelectorAll('#screen .gx-frag').length,
                                    fired: window.__game.ctx.garage.bench.fired }));
  g.assert(/MOTH — RECOVERED FRAGMENTS \(12\)/.test(lat.hdr) && lat.cards === 12 && lat.fired.includes('lattice'), `LATTICE tab: header and 12 gloss cards, line fired (${lat.cards})`);
  // touch layout of the Bench
  await g.page.setViewportSize({ width: 844, height: 390 });
  await g.eval(() => { window.__game.ctx.resize(); window.__game.ctx.garage.bench.tab('FIT'); });
  await g.step(20);
  await g.shot('bench-touch', { settle: false });
  await g.eval(() => window.__game.ctx.garage.bench.tab('HAUL'));
  await g.step(5);
  await g.shot('bench-touch-haul', { settle: false });
  // WALK ON commits
  const wk = await g.eval(async () => {
    const c = window.__game.ctx, B = c.garage.bench;
    const before = B.state();
    await B.walkOn();
    await new Promise(r => setTimeout(r, 0));
    return { before, after: c.save.getFlag('campaign'), closed: window.__benchClosed, open: c.garage.isOpen };
  });
  g.log('walk on:', JSON.stringify(wk.after));
  g.assert(wk.closed && !wk.open && wk.after.pending === null && wk.after.benchVisits === 1 && wk.after.fitted.L === wk.before.fitted.L
           && wk.after.parts.harpoon_gaff === wk.before.parts.harpoon_gaff, 'WALK ON commits the working copy to save.flags.campaign (pending cleared, benchVisits 1) and resolves open()');
  // touch layout of the free garage
  await g.eval(() => { const c = window.__game.ctx; c.garage.open({ context: 'title' }); });
  await g.step(20);
  await g.shot('garage-touch', { settle: false });
  await g.eval(() => window.__game.ctx.garage.edit({ tab: 'R-ARM' }));
  await g.step(4);
  await g.shot('garage-touch-rarm', { settle: false });
  await g.eval(() => window.__game.ctx.garage.cancel());
  await g.page.setViewportSize({ width: 1280, height: 720 });
  await g.eval(() => window.__game.ctx.resize());
  // the Bench at 1280×720 with the closing confirm (UI path)
  await benchOpen();
  await waitBench();
  await g.step(30);
  await g.page.click('#screen #bWalk');
  await g.step(2);
  await g.shot('bench-confirm', { settle: false });
  await g.page.click('#screen #bYes');
  await g.step(60 * 8);
  const ui = await g.eval(() => ({ closed: window.__benchClosed, flag: window.__game.ctx.save.getFlag('campaign') }));
  g.assert(ui.closed && ui.flag.pending === null, 'WALK ON through the UI plays the closing lines, commits and closes');
  // reload: the free-garage loadout is restored from the save
  await g.page.reload({ waitUntil: 'load' });
  await g.page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 90000 });
  await g.eval(() => window.__game.ready);
  await g.eval(() => { window.__game.pause(); window.__game.ctx.pausedRender = false; });
  const rl = await g.eval(() => ({ lo: window.__game.ctx.save.getLoadout(), camp: window.__game.ctx.save.getFlag('campaign') }));
  g.assert(rl.lo.frame === 'bastion' && rl.lo.R === 'cannon_hc90' && rl.camp?.benchVisits === 1, `after a reload the loadout is restored (${rl.lo.frame}, ${rl.lo.R}) and the campaign state kept`);
}

export default async function (g) {
  await installStudio(g);
  if (want(g, 'kit')) await kitGallery(g);
  if (want(g, 'mechs')) await mechGallery(g);
  if (want(g, 'poses')) await mechPoses(g);
  if (want(g, 'units')) await unitGallery(g);
  if (want(g, 'structures')) await structureGallery(g);
  if (want(g, 'props')) await propGallery(g);
  if (want(g, 'garage')) await garageTests(g);
  await g.eval(() => window.__p3?.done?.());
  if (want(g, 'world')) await structureWorld(g);
  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).join('; ')})`);
}
