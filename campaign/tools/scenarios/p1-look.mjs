// tools/scenarios/p1-look.mjs (P1): acceptance for Look and Sound (architecture §10.4 and addendum A6/P1).
//   node tools/playtest.mjs --scenario p1-look --port 8320 --out /tmp/campaign-playtest/P1-p1-look
// One load of levels/test.js, then inline art overrides and runtime tier switches (High → Medium → Low → High):
//  1. per tier: gameplay camera at the start, an 80 m vista along the route, a sun-facing shot; the far fade reaches the
//     fog colour before the far plane, and land beyond the far-fade end renders exactly as the sky behind it (the vista
//     is rendered with and without the level, and every sampled pixel whose terrain hit lies past the fade is compared)
//  2. galleries: every library material, every FX recipe, every weather type
//  3. High post overhead ≤ 30 calls; High → Low → High → Low → High raises no errors and the program count is stable
//  4. every SFX plays (mute=1, after unlock) and renders non-silent offline; music themes, intensity and stingers
//  5. the ported mech under DEFAULT_ART is neither crushed nor blown out on High and Low (luminance stats + review)
//  A6: L1-style night sky (aurora + dawn rim) on each tier, a night → dawn blend with shortest-arc azimuths, a ghost
//      glow at 1 km holding ≥ 4 px on High and Low, unknown-name fallbacks, unknown art fields kept, shadowMinElevation.

const L1_NIGHT = {
  toneMapping: 'aces',
  palette: { ground: '#2a3a4a', rock: '#1d2b38', sediment: '#3a4a5a', high: '#5a6d80', dust: '#8fa3b5', snow: '#c9d6e3',
             wet: '#0e1822', concrete: '#4a4e52', rust: '#5d3424', accent: '#5fe3ff' },
  sky: { top: '#02050c', mid: '#08122a', horizon: '#16203a', stars: 1,
         sun: { azimuth: 350, elevation: 58, color: '#7fd6c0', size: 0, glow: 0 },
         aurora: { strength: 0.8, colorA: '#2fe0c8', colorB: '#7b4dff', azimuth: 350, height: 55, speed: 1 },
         dawnRim: { strength: 0.9, color: '#ff5a2a', color2: '#7a2a40', azimuth: 92, width: 35, height: 3 },
         clouds: { cover: 0.12, color: '#1a2440', speed: 0.3 }, ridges: { height: 1.2, color: '#0b1222', layers: 2 },
         moon: { size: 0 } },
  fog: { color: '#141d33', density: 0.0011, heightFalloff: 0.02, heightBase: -10, inscatter: 0.3, sunColor: '#4a7f8a' },
  light: { sun: 0.9, sunColor: '#8fd8c8', hemiSky: '#3a5a8c', hemiGround: '#0a1020', hemi: 1.3, rim: 1.4, rimColor: '#6a7fb0',
           exposure: 1.3, env: 0.6 },
  grade: { contrast: 1.08, saturation: 0.92, lift: [0, 0.01, 0.03], gain: [0.95, 1.0, 1.08], shadowsTint: [0.85, 0.95, 1.15],
           vignette: 0.34, grain: 0.035 },
  bloom: { strength: 1.0, radius: 0.65, threshold: 0.8 },
  weather: { type: 'snow', intensity: 0.15, wind: [3, -1] },
  surface: { style: 'snow', frost: 0.4 },
};
const L1_DAWN = {
  sky: { top: '#0e1a36', mid: '#3a3a5a', horizon: '#ff9a5c', stars: 0.1,
         sun: { azimuth: 95, elevation: 5.5, color: '#ffb070', size: 1.4, glow: 1.0 },
         aurora: { strength: 0 }, dawnRim: { strength: 0.25 } },
  fog: { color: '#c88a6a', density: 0.0009, heightFalloff: 0.02, inscatter: 1.0, sunColor: '#ffb27a' },
  light: { sun: 6.0, sunColor: '#ffad6b', hemiSky: '#8fa6d0', hemiGround: '#3a2a26', hemi: 1.6, rim: 2.2, rimColor: '#7fa0e0',
           exposure: 1.0, env: 0.7, shadowMinElevation: 8 },
  grade: { contrast: 1.06, saturation: 1.1, gain: [1.08, 1.0, 0.92], shadowsTint: [0.8, 0.9, 1.2], highlightsTint: [1.1, 1.0, 0.88] },
  bloom: { strength: 0.9, threshold: 0.9 },
  weather: { type: 'snow', intensity: 0.05, wind: [2, 0] },
};
const LIB = ['concrete', 'concreteDark', 'steel', 'steelDark', 'rust', 'stripe', 'dark', 'rock', 'debris', 'glass', 'lightRed', 'lightAmber',
  'lightCyan', 'lightWhite', 'cable', 'canvas', 'scorch', 'rubber',
  'ironBlack', 'oxide', 'paintWake', 'paintWakeRed', 'ceramic', 'ceramicAged', 'gold', 'darkGlass', 'mirror', 'ice', 'snow',
  'lightGold', 'lightSodium', 'lightGhost'];
const NEW_SFX = ['chime', 'heartbeat', 'flatline', 'tear', 'splash', 'bubbles', 'iceGroan', 'iceCrack', 'saw', 'harpoon', 'winch', 'rotorWhine'];

export default async function (g) {
  const t0 = Date.now();
  // dev: P1_ONLY=fx,weather runs a subset (default: everything; acceptance runs need everything)
  const only = (process.env.P1_ONLY || '').split(',').filter(Boolean);
  const on = (k) => !only.length || only.includes(k);
  const lap = (msg) => g.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${msg}`);

  // ------------------------------------------------------------------ in-page helpers
  await g.eval(() => {
    const G = window.__game, c = G.ctx;
    // clean review shots: hide the comms panel too (scenario-only style; the game's own CSS is untouched)
    const st = document.createElement('style'); st.textContent = '#game.shot-clean #comms{display:none!important}'; document.head.appendChild(st);
    window.__p1 = {
      /** luminance stats of a canvas region (CSS px); call right after a render (preserveDrawingBuffer in debug) */
      stats(x, y, w, h) {
        const cv = c.canvas, sx = cv.width / cv.clientWidth, sy = cv.height / cv.clientHeight;
        const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w * sx)); t.height = Math.max(1, Math.round(h * sy));
        const g2 = t.getContext('2d'); g2.drawImage(cv, x * sx, y * sy, w * sx, h * sy, 0, 0, t.width, t.height);
        const d = g2.getImageData(0, 0, t.width, t.height).data;
        let sum = 0, lo = 0, hi = 0, n = 0, r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          sum += l; n++; if (l < 0.02) lo++; if (l > 0.98) hi++; r += d[i]; gg += d[i + 1]; b += d[i + 2];
        }
        return { mean: sum / n, crushed: lo / n, blown: hi / n, rgb: [r / n / 255, gg / n / 255, b / n / 255] };
      },
      /** a column of pixel rows (CSS px) as RGB 0..1 */
      column(x, y0, y1) {
        const cv = c.canvas, sx = cv.width / cv.clientWidth, sy = cv.height / cv.clientHeight;
        const t = document.createElement('canvas'); t.width = 1; t.height = Math.max(1, Math.round((y1 - y0) * sy));
        const g2 = t.getContext('2d'); g2.drawImage(cv, x * sx, y0 * sy, 1, t.height, 0, 0, 1, t.height);
        const d = g2.getImageData(0, 0, 1, t.height).data, out = [];
        for (let i = 0; i < d.length; i += 4) out.push([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
        return out;
      },
      project(p) {
        const v = new c.THREE.Vector3(p[0], p[1], p[2]).project(c.camera);
        return [(v.x * 0.5 + 0.5) * c.canvas.clientWidth, (-v.y * 0.5 + 0.5) * c.canvas.clientHeight, v.z];
      },
      route(s, l = 0, h = 0) {
        const v = c.world.resolve({ s, l, h }, new c.THREE.Vector3());
        return [v.x, v.y, v.z];
      },
      dir(az, el) {   // azimuth clockwise from north (−Z), elevation in degrees
        const a = az * Math.PI / 180, e = el * Math.PI / 180;
        return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
      },
    };
  });
  const cam = async (pos, look, fov) => g.camera(pos, look, fov);
  // g.shot with a longer screenshot timeout: software rendering on a loaded machine can exceed Playwright's 30 s default
  const shots = [];
  const shot = async (name, o = {}) => {
    if (o.settle !== false) await g.eval(() => window.__game.settle());
    await g.eval((hud) => { window.__game.hud(hud); window.__game.render(); }, o.hud !== false);
    const file = `${g.out}/${name}.png`;
    await g.page.screenshot({ path: file, timeout: 240000 });
    if (o.hud === false) await g.eval(() => window.__game.hud(true));
    shots.push(file);
    console.log('[playtest] shot', file);
    return file;
  };
  const lookDir = async (pos, az, el, dist = 400, fov) => {
    const d = await g.eval(([a, e]) => window.__p1.dir(a, e), [az, el]);
    return cam(pos, [pos[0] + d[0] * dist, pos[1] + d[1] * dist, pos[2] + d[2] * dist], fov);
  };
  const render = () => g.eval(() => window.__game.render());

  if (on('audio')) {
  // ------------------------------------------------------------------ 4. audio (no level needed)
  const au = await g.eval(async (names) => {
    const c = window.__game.ctx, A = c.audio, M = c.music, out = { fails: [], offline: {} };
    const mod = await import(new URL('src/audio/audio.js', location.href).href);
    const musicMod = await import(new URL('src/audio/music.js', location.href).href);
    A.unlock();
    out.ready = A.ready; out.bus = !!A.bus; out.state = A.context?.state ?? null;
    out.master = A.bus ? A.bus.master.gain.value : null;
    const V = new c.THREE.Vector3();
    for (const n of mod.SFX) {
      try { A.play(n); A.play(n, V.set(30, 0, -40), { vol: 0.5, rate: 1.1, range: 400 }); } catch (e) { out.fails.push(n + ': ' + e.message); }
    }
    try { A.play('noSuchSound'); A.play('noSuchSound'); } catch (e) { out.fails.push('unknown: ' + e.message); }
    for (const n of names) {
      try { const r = await A.renderOffline(n, 2.4); out.offline[n] = +r.peak.toFixed(4); } catch (e) { out.fails.push('offline ' + n + ': ' + e.message); }
    }
    for (const n of ['rifle', 'explode', 'thunder']) out.offline[n] = +(await A.renderOffline(n, 2.4)).peak.toFixed(4);
    for (const l of ['boost', 'hover', 'wind', 'rain', 'fire', 'alarm', 'engine', 'rumble']) {
      try { const h = A.loop(l, { vol: 0.3 }); h.set({ vol: 0.5, rate: 1.2, cutoff: 800 }); h.stop(0.1); } catch (e) { out.fails.push('loop ' + l + ': ' + e.message); }
    }
    try { A.blip({ base: 520, wave: 'square', jitter: 0.2 }); A.blip(); A.duck(0.6, 0.5); A.setVolumes({ master: 0.8, music: 0.7, sfx: 1 }); } catch (e) { out.fails.push('misc: ' + e.message); }
    out.musicThemes = Object.keys(musicMod.THEMES);
    try {
      for (const t of out.musicThemes) { M.setTheme(t, 0.3); c.step(20, 1 / 30); }
      M.setTheme({ bpm: 126, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 6, 4],
                   layers: { pad: { wave: 'sawtooth', vol: 0.1, cutoff: 1600, octave: 2 }, bass: { wave: 'triangle', vol: 0.2, pattern: 'x..x..x.', octave: 1 },
                             drums: { kit: 'tribal', vol: 0.4, pattern: 'x.x.xx.x' }, lead: { wave: 'triangle', vol: 0.07, octave: 4 },
                             arp: { wave: 'triangle', vol: 0.05, pattern: 'x.x...x.', octave: 4 } }, intensity: { drums: [0.2, 0.7] } }, 0.5);
      M.setIntensity(0.8); c.step(30, 1 / 30); M.setIntensity(null); c.step(10, 1 / 30);
      for (const s of ['objective', 'checkpoint', 'discovery', 'dread', 'victory', 'death', 'boss']) { M.stinger(s); c.step(3, 1 / 30); }
      M.stinger('nope'); M.setTheme('noSuchTheme'); c.step(5, 1 / 30);
      M.stop(0.5); c.step(5, 1 / 30); M.setTheme('menu', 0.5); c.step(5, 1 / 30);
    } catch (e) { out.fails.push('music: ' + e.message); }
    out.voices = A.voices;
    return out;
  }, NEW_SFX);
  g.log('audio', JSON.stringify({ ready: au.ready, state: au.state, master: au.master, voices: au.voices, themes: au.musicThemes }));
  g.log('offline peaks', JSON.stringify(au.offline));
  g.assert(au.ready && au.bus, `audio unlocked with a bus graph (state ${au.state})`);
  g.assert(au.master === 0, `mute=1 holds the master gain at 0 (${au.master})`);
  g.assert(au.fails.length === 0, `every SFX, loop, blip, duck and music call ran without throwing${au.fails.length ? ': ' + au.fails.join('; ') : ''}`);
  const silent = NEW_SFX.filter(n => !(au.offline[n] > 0.002));
  g.assert(silent.length === 0, `the 12 addendum SFX render non-silent offline${silent.length ? ' (silent: ' + silent.join(', ') + ')' : ''}`);
  g.assert(['menu', 'garage', 'debrief', 'ambient', 'combat'].every(t => au.musicThemes.includes(t)), 'THEMES has menu, garage, debrief, ambient, combat');
  lap('audio done');

  }
  if (on('surface')) {
  // ------------------------------------------------------------------ addendum surface checks (no level needed)
  const surf = await g.eval((lib) => {
    const c = window.__game.ctx, M = c.materials, out = { fails: [] };
    out.uBeat = !!M.uniforms?.uBeat;
    c.step(2); out.beatAdvanced = M.uniforms.uBeat.value === c.clock.time;
    for (const n of lib) { const m = M.get(n); if (!m || !m.isMaterial) out.fails.push(n); }
    const u = M.get('notALibraryName');
    out.unknownGrey = !!u && u.isMaterial && Math.abs(u.color.r - u.color.g) < 1e-3 && Math.abs(u.color.g - u.color.b) < 1e-3;
    try { const h = c.particles.glows.add(new c.THREE.Vector3(0, 10, 0), { color: '#a8ff9e', size: 0.6, minPx: 4, pulse: 'beat' });
          h.set({ visible: false, intensity: 3 }); h.remove(); out.glows = typeof h.set === 'function'; } catch (e) { out.fails.push('glows: ' + e.message); }
    try { c.fx.impact(new c.THREE.Vector3(0, 0, 0), null, 'bullet', 'plasticine'); out.impactOk = true; } catch (e) { out.fails.push('impact: ' + e.message); }
    try { const h = c.fx.emitter('volcano', new c.THREE.Vector3(0, -500, 0)); out.emitterKind = h.kind; h.stop(); } catch (e) { out.fails.push('emitter: ' + e.message); }
    const prevW = { ...c.weather.current };
    c.weather.set({ type: 'meteor', intensity: 0.5 }); out.weatherType = c.weather.current.type; c.weather.set(prevW);
    const t = M.textures; out.tex = Object.keys(t).filter(k => !k.startsWith('_')).map(k => [k, t[k].image.width, t[k].colorSpace]);
    out.info = M.info();
    return out;
  }, LIB);
  g.assert(surf.uBeat && surf.beatAdvanced, 'materials.uniforms.uBeat follows ctx.clock.time');
  g.assert(surf.fails.length === 0, `all ${LIB.length} library names (arch + A5.4) return materials${surf.fails.length ? '; failed: ' + surf.fails.join(', ') : ''}`);
  g.assert(surf.unknownGrey, 'an unknown library name returns a neutral grey material');
  g.assert(surf.glows, 'particles.glows.add returns a handle with set/remove');
  g.assert(surf.impactOk && surf.emitterKind === 'smoke' && surf.weatherType === 'clear', `unknown impact surface / emitter kind / weather type fall back (emitter ${surf.emitterKind}, weather ${surf.weatherType})`);
  g.log('textures', JSON.stringify(surf.tex), 'gen', JSON.stringify(surf.info));

  }
  // ------------------------------------------------------------------ level
  const s0 = await g.startLevel('test', 'cp_start');
  g.assert(s0.player && s0.player.alive, 'test level started');
  const beat = await g.eval(() => { const c = window.__game.ctx, b0 = c.materials.uniforms.uBeat.value; c.step(30); window.__game.render(); return [b0, c.materials.uniforms.uBeat.value, c.clock.time]; });
  g.assert(beat[1] > beat[0] && beat[1] === beat[2], `uBeat advances with sim time (${beat.map(v => v.toFixed(3)).join(' → ')})`);
  lap('level loaded');
  const base = await g.eval(() => JSON.parse(JSON.stringify(window.__game.ctx.mission.def.art)));
  const P0 = s0.player.pos;
  const sunAz = base.sky?.sun?.azimuth ?? 145;

  // ------------------------------------------------------------------ per-tier standard shots
  async function tierShots(tier) {
    await g.eval((t) => window.__game.setTier(t), tier);
    await g.eval((art) => { window.__game.ctx.atmosphere.apply(art); window.__game.freeCam(false); }, base);
    await g.step(30);
    await shot(`${tier}-gameplay`);
    // 80 m vista along the route
    const a = await g.eval(() => window.__p1.route(260, 0, 80));
    const b = await g.eval(() => window.__p1.route(1500, 0, 20));
    await cam(a, b, 66);
    await shot(`${tier}-vista`, { hud: false });
    // horizon seam: wherever the land lies beyond the far-fade end, the frame must equal the sky alone (render the
    // same view with and without the level, grain and weather off, and compare those pixels). A ray march against
    // world.groundHeight finds each sampled pixel's terrain distance.
    const seam = await g.eval(() => {
      const c = window.__game.ctx, T = c.THREE, P = window.__p1, G = window.__game, cam = c.camera;
      // grain, bloom and AO off for the comparison: bloom from the bright foreground and AO are smooth, frame-wide
      // effects (not edges), and they legitimately differ between the two renders
      const gr = c.pipeline.grade, keep = { grain: gr.grain, chroma: gr.chroma }, bl = c.pipeline.bloom.strength;
      c.pipeline.setGrade({ grain: 0, chroma: 0 }); c.pipeline.setBloom({ strength: 0 });
      const ao = (c.pipeline.composer?.passes || []).filter(p => p.constructor.name.includes('GTAO'));
      ao.forEach(p => { p.enabled = false; });
      const hide = ['weather', 'particles-add', 'particles-smoke', 'glows'].map(n => c.scene.getObjectByName(n)).filter(Boolean);
      const vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
      const W = c.canvas.clientWidth, H = c.canvas.clientHeight, sy = c.canvas.height / H;
      const fwd = new T.Vector3(); cam.getWorldDirection(fwd);
      const farPt = cam.position.clone().addScaledVector(new T.Vector3(fwd.x, 0, fwd.z).normalize(), 5000);
      const hz = P.project([farPt.x, cam.position.y, farPt.z])[1];
      const y0 = Math.max(0, Math.round(hz - 70)), y1 = Math.min(H - 1, Math.round(hz + 70));
      const xs = []; for (let x = 40; x < W; x += 60) xs.push(x);
      G.render();
      const A = xs.map(x => P.column(x, y0, y1));
      const lv = c.levelRoot.visible; c.levelRoot.visible = false;
      G.render();
      const B = xs.map(x => P.column(x, y0, y1));
      c.levelRoot.visible = lv;
      hide.forEach((o, i) => { o.visible = vis[i]; });
      c.pipeline.setGrade(keep); c.pipeline.setBloom({ strength: bl });
      ao.forEach(p => { p.enabled = true; });
      const farEnd = c.atmosphere.fogUniforms.uFogFarEnd.value, maxD = cam.far;
      const gh = (x, z) => c.world.groundHeight(x, z);
      const o = cam.position, dir = new T.Vector3(), p = new T.Vector3();
      function hit(px, py) {
        dir.set(px / W * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(cam).sub(o).normalize();
        let prev = 0;
        for (let t = 4; t < maxD; t += Math.max(4, t * 0.02)) {
          p.copy(o).addScaledVector(dir, t);
          if (p.y < gh(p.x, p.z)) return (prev + t) / 2;
          prev = t;
        }
        return Infinity;
      }
      let worst = 0, n = 0, at = null;
      const diffs = [];
      xs.forEach((x, i) => {
        for (let r = 0; r < A[i].length; r++) {
          const y = y0 + r / sy, d = hit(x, y);
          if (!(d > farEnd + 25) || d === Infinity) continue;
          const a = A[i][r], b = B[i][r], diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
          n++; diffs.push(diff);
          if (diff > worst) { worst = diff; at = [x, +y.toFixed(1), Math.round(d)]; }
        }
      });
      diffs.sort((p, q) => p - q);
      const pct = (q) => (diffs.length ? diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * q))] : 0);
      const mean = diffs.reduce((p, q) => p + q, 0) / Math.max(1, diffs.length);
      return { hz, n, worst, p90: pct(0.9), p98: pct(0.98), mean, at, farEnd };
    });
    g.log(`${tier} horizon seam`, JSON.stringify(seam));
    // a star behind a sampled pixel, or an anti-aliased pixel where a nearer ridge meets the faded land, may differ
    // alone; an edge or a band would lift the mean and the 90th percentile
    g.assert(seam.n > 0 && seam.mean < 0.01 && seam.p90 < 0.03,
             `${tier}: no terrain edge at the horizon (land beyond ${seam.farEnd} m equals the sky behind it: ${seam.n} px, mean diff ${seam.mean.toFixed(4)}, p90 ${seam.p90.toFixed(3)}, max ${seam.worst.toFixed(3)})`);
    // the far fade reaches the fog colour before the far plane
    const fade = await g.eval(() => {
      const c = window.__game.ctx, A = c.atmosphere, p = c.camera.position.clone();
      const far = c.camera.far, out = [];
      for (const az of [0, 90, 180, 270]) {
        const a = az * Math.PI / 180;
        const q = p.clone().add(new c.THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(far * 0.98));
        q.y = p.y - 50; out.push(A.fogAmount(q));
        q.y = p.y + 300; out.push(A.fogAmount(q));
      }
      return { min: Math.min(...out), farEnd: A.fogUniforms.uFogFarEnd.value, far };
    });
    g.assert(fade.min >= 0.999 && fade.farEnd < fade.far, `${tier}: fog reaches the sky colour before the far plane (min ${fade.min.toFixed(4)}, fade end ${fade.farEnd} < far ${fade.far.toFixed(0)})`);
    // sun-facing, from near the player
    await lookDir([P0[0], P0[1] + 18, P0[2]], sunAz, Math.max(4, (base.sky?.sun?.elevation ?? 24) - 6), 400, 66);
    await shot(`${tier}-sun`, { hud: false, settle: false });
    await g.freeCam(false);
  }

  if (on('high')) {
  await tierShots('high');
  const perfHigh = await g.eval(() => { window.__game.render(); return window.__game.perf(); });
  g.log('high perf (vista area)', JSON.stringify(perfHigh));
  const progs = await g.eval(() => {
    const m = {};
    for (const p of window.__game.ctx.renderer.info.programs || []) { const k = (p.name || '?').replace(/\d+$/, ''); m[k] = (m[k] || 0) + 1; }
    return m;
  });
  g.log('programs by material type (session total)', JSON.stringify(progs));
  g.assert(perfHigh.post <= 30, `High post overhead ≤ 30 calls (${perfHigh.post}; main ${perfHigh.main}, shadow ${perfHigh.shadow}, ao ${perfHigh.ao})`);
  lap('high shots');

  }
  // ------------------------------------------------------------------ 5. the ported mech under DEFAULT_ART
  async function mechShot(tier) {
    await g.eval(() => { window.__game.ctx.atmosphere.apply({}); });
    await g.step(5);
    const pp = (await g.state()).player.pos;
    const sd = await g.eval(() => window.__game.ctx.atmosphere.sunDir.toArray());
    // three-quarter view from the sun side, so the lit and shaded plates both show
    const ang = Math.atan2(sd[0], sd[2]) + 0.7;
    const from = [pp[0] + Math.sin(ang) * 15, pp[1] + 7, pp[2] + Math.cos(ang) * 15];
    await cam(from, [pp[0], pp[1] + 5.4, pp[2]], 50);
    await shot(`mech-${tier}`, { hud: false, settle: false });
    const st = await g.eval(([p]) => {
      const P = window.__p1, a = P.project([p[0], p[1] + 10, p[2]]), b = P.project([p[0], p[1] + 0.5, p[2]]);
      const h = Math.abs(b[1] - a[1]), w = h * 0.45, cx = (a[0] + b[0]) / 2;
      window.__game.render();
      return P.stats(cx - w / 2, Math.min(a[1], b[1]), w, h);
    }, [pp]);
    g.log(`mech ${tier} luminance`, JSON.stringify(st));
    g.assert(st.mean > 0.1 && st.mean < 0.75 && st.crushed < 0.25 && st.blown < 0.03,
             `${tier}: the ported mech under DEFAULT_ART is neither crushed nor blown out (mean ${st.mean.toFixed(3)}, crushed ${(st.crushed * 100).toFixed(1)}%, blown ${(st.blown * 100).toFixed(1)}%)`);
    await g.freeCam(false);
  }
  if (on('mech')) {
  await mechShot('high');

  }
  // a gallery frame in front of the player, lit from behind the camera (camera between the sun and the samples)
  const frame = await g.eval(() => {
    const c = window.__game.ctx, T = c.THREE, pp = c.player.pos;
    const sd = c.atmosphere.lightDir, f = new T.Vector3(-sd.x, 0, -sd.z).normalize(), r = new T.Vector3(-f.z, 0, f.x);
    const centre = pp.clone().addScaledVector(f, 30); centre.y = c.world.groundHeight(centre.x, centre.z) + 8;
    window.__gal = { f: f.toArray(), r: r.toArray(), c: centre.toArray() };
    const camPos = centre.clone().addScaledVector(f, -14); camPos.y += 0.8;
    return { cam: camPos.toArray(), look: centre.toArray() };
  });
  if (on('gallery')) {
  // ------------------------------------------------------------------ 2. galleries (High): materials, FX, weather
  await g.eval((art) => window.__game.ctx.atmosphere.apply(art), base);
  const LIT = LIB.filter(n => !n.startsWith('light')), LENS = LIB.filter(n => n.startsWith('light'));
  const buildGallery = (names, emissive) => g.eval(([list, em]) => {
    const c = window.__game.ctx, T = c.THREE, M = c.materials, G = window.__gal;
    const f = new T.Vector3(...G.f), r = new T.Vector3(...G.r), centre = new T.Vector3(...G.c);
    const old = c.levelRoot.getObjectByName('p1-gallery'); old?.parent?.remove(old);
    const grp = new T.Group(); grp.name = 'p1-gallery';
    const geoA = new T.SphereGeometry(0.9, 40, 24), geoB = new T.CylinderGeometry(0.75, 0.75, 1.6, 8);
    const cols = em ? list.length : 8, gap = em ? 2.6 : 2.4;
    list.forEach((n, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const m = new T.Mesh(em ? new T.SphereGeometry(0.35, 24, 12) : (i % 2 ? geoB : geoA), M.get(n));
      m.position.copy(centre).addScaledVector(r, (col - (cols - 1) / 2) * gap).add(new T.Vector3(0, em ? 0 : 3.6 - row * 2.4, 0));
      m.rotation.y = 0.5; m.castShadow = true;
      grp.add(m);
      if (em) {   // the lamp assembly: a dark housing behind the lens and a glow sprite
        const hs = new T.Mesh(new T.CylinderGeometry(0.55, 0.65, 0.5, 12), M.get('steelDark'));
        hs.position.copy(m.position).addScaledVector(f, 0.35); hs.rotation.x = Math.PI / 2; hs.lookAt(m.position.clone().addScaledVector(f, -1)); hs.rotateX(Math.PI / 2);
        grp.add(hs);
        c.particles.glows.add(m, { color: '#' + m.material.emissive.getHexString(), size: 1.6, intensity: 2.2, pulse: n === 'lightGhost' ? 'beat' : 'flicker', phase: i * 0.13 });
      }
    });
    c.levelRoot.add(grp);
  }, [names, emissive]);
  await buildGallery(LIT, false);
  await cam(frame.cam, frame.look, 64);
  await shot('gallery-materials', { hud: false, settle: false });
  await buildGallery(LENS, true);
  await g.eval((art) => { const a = window.__game.ctx.atmosphere; a.set({ light: { sun: 0.6, hemi: 0.3, exposure: 1.2 }, sky: { top: '#05060a', mid: '#0c0d14', horizon: '#1a1a22' }, fog: { color: '#1a1a22' } }, 0); }, base);
  await shot('gallery-lenses', { hud: false, settle: false });
  await g.eval((art) => { const c = window.__game.ctx, o = c.levelRoot.getObjectByName('p1-gallery'); o?.parent?.remove(o); c.particles.glows.clear(); c.atmosphere.apply(art); }, base);
  lap('material gallery');

  }
  if (on('fx')) {
  // FX gallery: each recipe framed on its own, captured at a telling moment
  await g.eval(() => {   // FX stage: the open route bed ahead of the drop point (s = 120 m), positions as (forward, lateral, height)
    const c = window.__game.ctx, T = c.THREE;
    window.__fxAt = (fw, side, h) => c.world.resolve({ s: 120 + fw, l: side, h }, new T.Vector3()).toArray();
  });
  const fxShot = async (name, camArgs, lookArgs, script, steps) => {
    const v = await g.eval(([a, b]) => [window.__fxAt(...a), window.__fxAt(...b)], [camArgs, lookArgs]);
    await cam(v[0], v[1], 60);
    const st = await g.eval(([src, n]) => {
      const c = window.__game.ctx, T = c.THREE, X = c.fx;
      const at = (...a) => new T.Vector3(...window.__fxAt(...a)), up = new T.Vector3(0, 1, 0);
      c.particles.clear(); X.clearEmitters();
      // eslint-disable-next-line no-new-func
      new Function('c', 'T', 'X', 'at', 'up', 'step', src)(c, T, X, at, up, (k) => c.step(k));
      c.step(n);
      return c.particles.stats();
    }, [script, steps]);
    g.log(`fx ${name}`, JSON.stringify(st));
    await shot(`fx-${name}`, { hud: false, settle: false });
  };
  await fxShot('explosion-flash', [0, -8, 9], [45, 0, 6], `X.explosion(at(45, -10, 2), 1); X.explosion(at(60, 14, 2), 2, { quiet: true });`, 6);
  await fxShot('explosion-fireball', [0, -8, 9], [45, 0, 6], `X.explosion(at(45, -10, 2), 1); X.explosion(at(60, 14, 2), 2, { quiet: true });`, 27);
  await fxShot('explosion-smoke', [0, -8, 9], [45, 0, 8], `X.explosion(at(45, -10, 2), 1); X.explosion(at(60, 14, 2), 2, { quiet: true });`, 120);
  await fxShot('muzzles', [8, -14, 4], [16, 0, 4],
    `['rifle','mg','shotgun','cannon','plasma','turret','rail'].forEach((k, i) => X.muzzle(at(14 + i * 0.6, -7 + i * 2.3, 4), new T.Vector3(...window.__fxAt(30, -7 + i * 2.3, 4)).sub(at(14, -7 + i * 2.3, 4)).normalize(), k));`, 1);
  await fxShot('impacts', [0, 0, 9], [30, 0, 0],
    `const S = ['ground', 'metal', 'concrete', 'rock'], K = ['bullet', 'plasma', 'shell', 'blade', 'rail'];
     K.forEach((k, i) => S.forEach((s, j) => X.impact(at(18 + j * 6, -16 + i * 8, 0.2), up, k, s)));`, 5);
  await fxShot('sparks-dust-landing', [4, 0, 6], [24, 0, 1],
    `X.sparks(at(20, -6, 2), 40, [1, 0.7, 0.3], 22); X.dust(at(22, 4, 0), 18, 5); X.landing(at(18, 0, 0), 1.4); step(10); X.sparks(at(20, -6, 2), 30, [0.6, 0.85, 1], 18);`, 8);
  await fxShot('trails-beam-ring', [0, -6, 8], [40, 0, 6],
    `const m = at(10, -18, 10), v = new T.Vector3(...window.__fxAt(60, 10, 22)).sub(m).normalize().multiplyScalar(110);
     for (let i = 0; i < 70; i++) { m.addScaledVector(v, 1 / 60); X.missileTrail(m, v); X.boost(at(22, 10, 4), new T.Vector3(0, -1, 0.4).normalize(), '#ff9a3c'); step(1); }
     X.beam(at(20, -14, 6), at(55, 8, 1), '#bff4ff', 0.6, 0.5); X.shockwave(at(36, 0, 0.4), 12, '#ffb070', 0.8);`, 6);
  await fxShot('emitters', [0, 0, 7], [36, 0, 5],
    `window.__em = ['smoke', 'fire', 'sparks', 'steam', 'dustDevil'].map((k, i) => X.emitter(k, at(34, -18 + i * 9, 0.4), { rate: 1.4, scale: 1.2 }));`, 200);
  await g.eval(() => { window.__em.forEach(h => h.stop()); window.__game.ctx.particles.clear(); });
  const ambCam = await g.eval(() => [window.__p1.route(600, -40, 70), window.__p1.route(1150, 0, 30)]);
  await cam(ambCam[0], ambCam[1], 60);
  const amb = await g.eval(() => {
    const c = window.__game.ctx, X = c.fx;
    window.__amb = ['battle', 'flak', 'searchlights', 'fires', 'lightning'].map((k, i) => X.ambient({ kind: k, at: { s: 1000 + i * 120, l: -160 + i * 80 }, radius: 140, intensity: 2 }));
    c.step(240);
    return c.particles.stats();
  });
  g.log('fx ambient', JSON.stringify(amb));
  await shot('fx-ambient', { hud: false, settle: false });
  const leak = await g.eval(() => { window.__amb.forEach(h => h.stop()); const c = window.__game.ctx; c.particles.clear(); c.step(2);
                                    let n = 0; c.levelRoot.traverse(o => { if (o.geometry?.type === 'ConeGeometry') n++; }); return n; });
  g.assert(leak === 0, `stopping ambients frees their meshes (${leak} cones left)`);
  const fxErr = await g.eval(() => window.__game.errors());
  g.assert(fxErr.length === 0, `every FX recipe ran without errors${fxErr.length ? ': ' + JSON.stringify(fxErr.slice(0, 3)) : ''}`);
  lap('fx gallery');

  }
  if (on('weather')) {
  // weather: every type
  const wCam = await g.eval(() => [window.__p1.route(120, 30, 12), window.__p1.route(400, -20, 14)]);
  await cam(wCam[0], wCam[1], 66);
  for (const type of ['clear', 'ash', 'dust', 'rain', 'snow', 'embers', 'sandstorm']) {
    await g.eval((t) => {
      const c = window.__game.ctx;
      c.weather.set({ type: t, intensity: 1, wind: t === 'sandstorm' ? [16, 5] : [3, 1], fogBoost: t === 'sandstorm' ? 3 : 1, lightning: t === 'rain' ? 1 : 0 }, 0);
      c.step(40);
    }, type);
    await shot(`weather-${type}`, { hud: false, settle: false });
  }
  await g.eval((w) => window.__game.ctx.weather.set({ lightning: 0, fogBoost: 1, ...w }, 0), base.weather || {});
  lap('weather');

  }
  // ------------------------------------------------------------------ A6: L1 night sky (High), blend to dawn
  async function nightShots(tier) {
    await g.eval((a) => { window.__game.ctx.atmosphere.apply(a); }, L1_NIGHT);
    await g.step(10);
    const p = [P0[0], P0[1] + 40, P0[2]];
    await lookDir(p, 350, 32, 400, 70);
    await shot(`night-aurora-${tier}`, { hud: false, settle: false });
    await lookDir([P0[0], P0[1] + 320, P0[2]], 92, 2, 400, 70);
    await shot(`night-rim-${tier}`, { hud: false, settle: false });
  }
  // ghost glow at 1 km: ≥ 4 px
  async function ghostGlow(tier) {
    const r = await g.eval(() => {
      const c = window.__game.ctx, T = c.THREE, G = window.__game, P = window.__p1;
      const camP = new T.Vector3(c.player.pos.x, c.player.pos.y + 40, c.player.pos.z);
      const dir = new T.Vector3(...P.dir(350, 3));
      G.setCamera(camP.toArray(), camP.clone().addScaledVector(dir, 100).toArray(), 66);
      const at = camP.clone().addScaledVector(dir, 1000);
      // the beat pulse at its peak: phase cancels the shared clock
      const phase = -(c.materials.uniforms.uBeat.value % 1);
      const h = c.particles.glows.add(at, { color: '#a8ff9e', size: 0.6, intensity: 8, minPx: 4, pulse: 'beat', phase });
      G.render();
      const q = P.project(at.toArray());
      const win = 12;
      // horizontal and vertical extent of pixels clearly greener than the surround
      const cv = c.canvas, tmp = document.createElement('canvas'); tmp.width = win * 2 + 1; tmp.height = win * 2 + 1;
      const g2 = tmp.getContext('2d'); g2.drawImage(cv, q[0] - win, q[1] - win, tmp.width, tmp.height, 0, 0, tmp.width, tmp.height);
      const d = g2.getImageData(0, 0, tmp.width, tmp.height).data;
      const bg = [d[0], d[1], d[2]];
      let x0 = 99, x1 = -99, y0 = 99, y1 = -99, n = 0;
      for (let y = 0; y < tmp.height; y++) for (let x = 0; x < tmp.width; x++) {
        const i = (y * tmp.width + x) * 4;
        if (d[i + 1] - bg[1] > 40 && d[i + 1] >= d[i] && d[i + 1] >= d[i + 2]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      window.__ghost = h;
      return { px: q, w: x1 - x0 + 1, h: y1 - y0 + 1, n, dist: camP.distanceTo(at) };
    });
    await shot(`ghost-1km-${tier}`, { hud: false, settle: false });
    await g.eval(() => window.__ghost.remove());
    g.log(`ghost glow ${tier}`, JSON.stringify(r));
    g.assert(r.w >= 4 && r.h >= 4, `${tier}: a ghost glow at ${r.dist.toFixed(0)} m holds ≥ 4 px (${r.w} × ${r.h} px, ${r.n} px lit)`);
  }
  if (on('night')) {
  await nightShots('high');
  await ghostGlow('high');

  // night → dawn blend: shortest-arc azimuth (350° → 95° through north)
  const blendLog = [];
  await g.eval((d) => { window.__game.ctx.atmosphere.set(d, 8); }, L1_DAWN);
  const bp = [P0[0], P0[1] + 30, P0[2]];
  await lookDir(bp, 40, 12, 400, 80);
  for (let i = 0; i < 5; i++) {
    const st = await g.eval(() => {
      const A = window.__game.ctx.atmosphere, s = A.sunDir;
      const az = (Math.atan2(s.x, -s.z) * 180 / Math.PI + 360) % 360, el = Math.asin(s.y) * 180 / Math.PI;
      return { az, el, aur: A.skyUniforms.uAur.value, exp: window.__game.ctx.renderer.toneMappingExposure, blending: A.blending, info: A.blendInfo?.() };
    });
    blendLog.push(st);
    await shot(`blend-${i}`, { hud: false, settle: false });
    if (i < 4) await g.step(i === 3 ? 125 : 120);   // 2 s per stage (a little past the end on the last)
  }
  g.log('night → dawn', JSON.stringify(blendLog.map(b => [b.az.toFixed(1), b.el.toFixed(1), b.aur.toFixed(2), b.exp.toFixed(2), b.blending, b.info])));
  const mids = blendLog.slice(1, 4).map(b => b.az);
  const viaNorth = mids.every(a => a > 340 || a < 100) && mids.some(a => a < 90 && a > 5);
  g.assert(viaNorth, `set() blends the sun azimuth along the shortest arc (350° → 95° through north: ${mids.map(a => a.toFixed(0)).join(', ')})`);
  g.assert(Math.abs(blendLog[4].az - 95) < 0.5 && !blendLog[4].blending && blendLog[4].aur < 0.01, 'the blend ends exactly on the dawn art, aurora faded');

  // unknown art fields kept; shadowMinElevation clamps the key light only
  const kept = await g.eval(() => {
    const A = window.__game.ctx.atmosphere;
    A.set({ myLevelThing: { a: 1 }, sky: { sun: { elevation: 2 } }, light: { shadowMinElevation: 12 } }, 0);
    const el = (v) => Math.asin(v.y) * 180 / Math.PI;
    return { kept: A.art.myLevelThing?.a === 1, sunEl: el(A.sunDir), lightEl: el(A.lightDir) };
  });
  g.assert(kept.kept, 'atmosphere.art keeps unknown fields');
  g.assert(Math.abs(kept.sunEl - 2) < 0.1 && Math.abs(kept.lightEl - 12) < 0.1, `light.shadowMinElevation: key light ${kept.lightEl.toFixed(1)}° while the sky sun stays at ${kept.sunEl.toFixed(1)}°`);
  lap('night/dawn');

  }
  // ------------------------------------------------------------------ Medium and Low tiers
  if (on('medium')) {
  await tierShots('medium');
  await nightShots('medium');
  lap('medium');
  }
  if (on('low')) {
  await tierShots('low');
  await nightShots('low');
  await ghostGlow('low');
  await mechShot('low');
  lap('low');

  }
  if (on('switch')) {
  // ------------------------------------------------------------------ 3. tier switching: no errors, stable programs
  const progs = [];
  for (const t of ['high', 'low', 'high', 'low', 'high']) {
    await g.eval((tn) => window.__game.setTier(tn), t);
    await g.eval((art) => window.__game.ctx.atmosphere.apply(art), base);
    await g.step(4);
    await g.eval(() => { window.__game.freeCam(false); window.__game.render(); });
    progs.push(await g.eval(() => window.__game.perf().programs));
  }
  g.log('programs after H, L, H, L, H', JSON.stringify(progs));
  g.assert(progs[4] === progs[2], `program count stable after the second switch (${progs.join(' → ')})`);
  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `tier switches raised no errors${errs.length ? ': ' + JSON.stringify(errs.slice(0, 3)) : ''}`);
  const perfEnd = await g.perf();
  g.log('high perf (start)', JSON.stringify(perfEnd));
  g.assert(perfEnd.post <= 30, `High post overhead ≤ 30 calls after switching back (${perfEnd.post})`);
  }
  g.log(`shots (${shots.length}): ${g.out}`);
  lap('done');
}
