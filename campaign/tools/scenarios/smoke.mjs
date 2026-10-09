// tools/scenarios/smoke.mjs (P0): boot → title → test level → move → screenshots → determinism (§9.4): checkpoint
// replays, fresh loads (unit ids included) and step() chunking with blocking mission actions.
// Every package runs this before hand-off; it MUST keep passing.

async function canvasStats(g) {
  // average luminance and spread of the WebGL canvas (needs preserveDrawingBuffer, i.e. ?debug=1)
  return g.eval(() => {
    const src = document.getElementById('view');
    const c = document.createElement('canvas'); c.width = 64; c.height = 36;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    let s = 0, s2 = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255; s += l; s2 += l * l; }
    const mean = s / n; return { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
  });
}

export default async function (g) {
  // title
  const boot = await g.eval(() => ({ state: window.__game.state(), h1: document.querySelector('#screen h1')?.textContent || '',
                                     buttons: [...document.querySelectorAll('#screen button')].map(b => b.textContent) }));
  g.assert(boot.state === 'title', `booted to the title (state ${boot.state})`);
  g.assert(boot.h1.length > 0 && boot.buttons.length >= 3, `title screen has a heading and menu (${boot.buttons.join(', ')})`);
  await g.shot('title');
  const ct = await canvasStats(g);
  g.assert(ct.mean > 0.02 && ct.sd > 0.01, `title background renders (mean ${ct.mean.toFixed(3)}, sd ${ct.sd.toFixed(3)})`);

  // gameplay
  const s0 = await g.startLevel('test', 'cp_start');
  g.assert(s0.state === 'playing', `test level playing (state ${s0.state})`);
  g.assert(s0.player && s0.player.alive, 'player spawned');
  g.assert(s0.objectives.some(o => o.id === 'o_reach' && o.state === 'active'), 'start actions ran (objective active)');
  await g.input({ move: [0, 1] });
  const s1 = await g.step(180);
  g.assert(s1.player.s > s0.player.s + 40, `moved along route (s ${s0.player.s.toFixed(1)} → ${s1.player.s.toFixed(1)})`);
  g.assert(s1.player.onGround && Math.abs(s1.player.vel[1]) < 1, 'player on the ground');
  await g.input({ clear: true, press: ['boost'] });
  const s2 = await g.step(30);
  await g.shot('gameplay');
  const cg = await canvasStats(g);
  g.assert(cg.mean > 0.03 && cg.sd > 0.02, `gameplay frame renders (mean ${cg.mean.toFixed(3)}, sd ${cg.sd.toFixed(3)})`);
  const perf = await g.perf();
  g.assert(perf.calls > 5 && perf.triangles > 1000, `draw calls ${perf.calls}, triangles ${perf.triangles}`);
  const dom = await g.eval(() => ({
    hud: !document.getElementById('hud').hidden, ap: document.getElementById('apNum').textContent,
    touch: !document.getElementById('touch').hidden, touchClass: document.getElementById('game').classList.contains('touch'),
    rotate: !document.getElementById('rotate').hidden, w: innerWidth, h: innerHeight,
    fire: (() => { const r = document.getElementById('tFire').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
  }));
  g.assert(dom.hud && Number(dom.ap) > 0, `HUD shown with AP ${dom.ap}`);
  if (g.args.touch) {
    g.assert(dom.touch && dom.touchClass, 'touch layer shown in touch mode');
    g.assert(dom.w > dom.h && !dom.rotate, `landscape ${dom.w}×${dom.h}, no rotate hint`);
    g.assert(dom.fire[0] + dom.fire[2] <= dom.w && dom.fire[1] + dom.fire[3] <= dom.h && dom.fire[2] > 40, 'FIRE button on screen');
  } else g.assert(!dom.touch, 'no touch layer on desktop');

  // free-camera vista
  const p = s2.player.pos;
  await g.camera([p[0] + 60, p[1] + 40, p[2] + 60], p);
  await g.shot('vista', { hud: false });
  const cv = await canvasStats(g);
  g.assert(cv.mean > 0.03 && cv.sd > 0.01, `vista renders (mean ${cv.mean.toFixed(3)}, sd ${cv.sd.toFixed(3)})`);

  // determinism: restart the checkpoint and replay the same inputs twice (long enough to pass the drone trigger at s 500)
  const a = await g.replay(1200), b = await g.replay(1200);
  g.assert(a.player.s > 500, `replay moved (s ${a.player.s.toFixed(1)})`);
  g.assert(a.units.length > 0, `replay spawned the encounter (${a.units.length} units)`);
  g.assert(JSON.stringify(a.player.pos) === JSON.stringify(b.player.pos), `deterministic (${a.player.pos.map(v => v.toFixed(3))} vs ${b.player.pos.map(v => v.toFixed(3))})`);
  g.assert(JSON.stringify(a.units) === JSON.stringify(b.units) && a.time === b.time, 'deterministic units and mission time');

  // determinism across world loads (§1.4): two fresh loads of the same checkpoint with the same inputs give the same
  // getState() as each other and as the checkpoint restart above, unit and target ids included. Streaming stats
  // (world) may differ (§5.6), frame and perf always do.
  const strip = (s) => { const o = JSON.parse(JSON.stringify(s)); delete o.frame; delete o.perf; delete o.world; return o; };
  const diff = (x, y) => Object.keys({ ...x, ...y }).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
  const fresh = async () => {
    await g.startLevel('test', 'cp_start');
    await g.input({ clear: true, move: [0, 1] });
    const s = await g.step(1200);
    await g.input({ clear: true });
    return strip(s);
  };
  const f1 = await fresh(), f2 = await fresh(), rp = strip(a);
  g.assert(diff(f1, f2).length === 0, `two fresh loads give the same state (differs: ${diff(f1, f2).join(', ') || 'nothing'}; unit ids ${f1.units.map(u => u.id)} / ${f2.units.map(u => u.id)})`);
  g.assert(diff(f1, rp).length === 0, `a fresh load gives the same state as a checkpoint restart (differs: ${diff(f1, rp).join(', ') || 'nothing'})`);

  // determinism across step() chunking (§1.4): no microtask checkpoint runs inside step(n), so blocking mission actions
  // (wait, comms, fade, parallel, the level's complete.do) must resume inside the tick. One step(n), several step()
  // calls and n rAF-like single ticks must agree. Walking on from s 2330 reaches o_reach (s 2450, r 80) after ~1.3 s and
  // completes the test level about 1 s later (complete.do waits 1 s); the inline list finishes at ~1.1 s.
  const chunked = async (mode) => {
    await g.startLevel('test', 'cp_start');
    await g.teleport({ s: 2330 });
    await g.step(7);   // the 0.1 s trigger check fires t_drones and t_mid (passed by the teleport)
    await g.eval(() => {
      const m = window.__game.ctx.mission;
      window.__game.ctx.comms.clear();   // drop the queued lines so the scripted one plays first
      m.def.comms = { ...(m.def.comms || {}), smokeWait: [{ who: 'SYS', text: 'Hold.', hold: 0.1 }, { wait: 0.2 }] };
      m.run([{ wait: 0.3 }, { flag: ['w1', 1] }, { comms: 'smokeWait', wait: true }, { flag: ['w2', 1] },
             { parallel: [[{ wait: 0.2 }, { flag: ['p1', 1] }], [{ fade: 0.5, seconds: 0.2 }, { fade: 0, seconds: 0.1 }]] },
             { flag: ['w3', 1] }]);
    });
    await g.input({ clear: true, move: [0, 1] });
    let s;
    if (mode === 'single') s = await g.step(240);
    else if (mode === 'chunks') for (let i = 0; i < 8; i++) s = await g.step(30);
    else s = await g.stepFrames(240);
    await g.input({ clear: true });
    return strip(s);
  };
  const c1 = await chunked('single'), c2 = await chunked('chunks'), c3 = await chunked('frames');
  await g.eval(() => { delete window.__game.ctx.mission.def?.comms?.smokeWait; });   // the def is the cached module object
  g.log('chunking:', ['single', 'chunks', 'frames'].map((k, i) => { const c = [c1, c2, c3][i]; return `${k} ${c.state} t=${c.time.toFixed(3)} flags=${JSON.stringify(c.flags)}`; }).join(' | '));
  g.assert(['w1', 'w2', 'p1', 'w3'].every(k => c1.flags[k] === 1) && c1.state === 'debrief', `blocking actions and level completion resolve inside one step(240) (${c1.state}, ${JSON.stringify(c1.flags)})`);
  g.assert(diff(c1, c2).length === 0 && diff(c1, c3).length === 0,
    `state independent of step() chunking (1×240 vs 8×30: ${diff(c1, c2).join(', ') || 'same'}; vs 240 frames: ${diff(c1, c3).join(', ') || 'same'})`);

  // frozen-core promises (§1.4): cameraRig.blendTo settles inside the tick that ends the blend (a simDeferred()), so a
  // list blocked on it gives the same state for one step(n) and for n rAF-like single ticks.
  const blendRun = async (mode) => {
    await g.startLevel('test', 'cp_start');
    await g.eval(() => {
      const c = window.__game.ctx, V = c.THREE.Vector3;
      c.mission.registerAction('smokeShot', () => c.cameraRig.blendTo(new V(0, 60, 0), new V(0, 0, -100), 0.2));
      c.mission.run([{ call: 'smokeShot' }, { flag: ['shotDone', 1] }, { wait: 0.5 }, { flag: ['later', 1] }]);
    });
    const s = mode === 'single' ? await g.step(60) : await g.stepFrames(60);
    await g.eval(() => window.__game.ctx.cameraRig.release(0));
    return { flags: s.flags, time: s.time };
  };
  const b1 = await blendRun('single'), b2 = await blendRun('frames');
  g.assert(b1.flags.shotDone === 1 && b1.flags.later === 1 && JSON.stringify(b1) === JSON.stringify(b2),
    `a list blocked on cameraRig.blendTo resumes inside the tick (step(60) ${JSON.stringify(b1)} vs 60 frames ${JSON.stringify(b2)})`);

  // pause safety (§1.4): what an action list waits on (fade, a camera blend) counts sim time, so nothing runs on while
  // the game is paused, and a { complete } reached after the pause still ends the level. A checkpoint restart in the
  // middle of a shot hands the camera back to the player.
  await g.startLevel('test', 'cp_start');
  const pz = await g.eval(async () => {
    const G = window.__game, c = G.ctx, V = c.THREE.Vector3;
    const U = await import(new URL('src/core/util.js', location.href).href);
    const out = {};
    // blendTo is a simDeferred(): observable as settled inside the step() call that finishes it
    let done = 0;
    const p0 = c.cameraRig.blendTo(new V(0, 50, 0), new V(0, 0, -100), 0.1);
    U.whenSettled(p0, () => { done = 1; });
    G.step(12);
    out.blendInStep = done;
    // a blend and a fade freeze while paused
    const p1 = c.cameraRig.blendTo(new V(0, 70, 0), new V(0, 0, -100), 0.3);
    G.step(2); c.flow.pause(); G.step(60);
    out.blendFrozen = !U.isSettled(p1) && c.cameraRig.mode === 'cinematic';
    c.flow.resume(); G.step(30);
    out.blendDone = U.isSettled(p1);
    c.cameraRig.release(0); G.step(1);
    c.mission.registerAction('smokeShot2', () => c.cameraRig.blendTo(new V(0, 60, 0), new V(0, 0, -100), 0.3));
    c.mission.run([{ fade: 1, seconds: 0.5 }, { flag: ['pzFade', 1] }, { call: 'smokeShot2' }, { flag: ['pzShot', 1] },
                   { fade: 0, seconds: 0 }, { complete: true }]);
    G.step(2); c.flow.pause(); G.step(60);
    out.duringFade = { state: c.flow.state, flag: c.mission.flags.pzFade ?? 0 };
    c.flow.resume(); G.step(35);          // the fade ends at 0.5 s of sim time; the shot starts
    c.flow.pause(); G.step(60);
    out.duringShot = { state: c.flow.state, fade: c.mission.flags.pzFade ?? 0, shot: c.mission.flags.pzShot ?? 0 };
    c.flow.resume(); G.step(60);
    out.end = { state: c.flow.state, shot: c.mission.flags.pzShot ?? 0 };
    return out;
  });
  g.log('pause safety:', pz);
  g.assert(pz.blendInStep === 1, 'cameraRig.blendTo settles synchronously inside step() (simDeferred)');
  g.assert(pz.blendFrozen && pz.blendDone, `a gameplay camera blend freezes while paused and finishes after resume (${pz.blendFrozen}, ${pz.blendDone})`);
  g.assert(pz.duringFade.state === 'paused' && pz.duringFade.flag === 0 && pz.duringShot.fade === 1 && pz.duringShot.shot === 0,
    `an action list does not advance while paused (fade ${JSON.stringify(pz.duringFade)}, shot ${JSON.stringify(pz.duringShot)})`);
  g.assert(pz.end.shot === 1 && (pz.end.state === 'complete' || pz.end.state === 'debrief'),
    `{ complete } reached after a pause ends the level (${pz.end.state})`);
  await g.startLevel('test', 'cp_start');
  const rs = await g.eval(async () => {
    const G = window.__game, c = G.ctx, V = c.THREE.Vector3;
    c.cameraRig.blendTo(new V(0, 80, 0), new V(0, 0, -100), 5, 40);
    G.step(10);
    await G.restart();
    G.step(2);
    return { mode: c.cameraRig.mode, fov: c.camera.fov, base: c.settings.get('fov') };
  });
  g.assert(rs.mode === 'follow' && rs.fov === rs.base, `checkpoint restart mid-shot returns the camera to the player (${rs.mode}, fov ${rs.fov})`);

  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).join('; ')})`);
}
