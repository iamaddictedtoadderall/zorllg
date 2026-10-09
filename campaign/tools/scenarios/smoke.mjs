// tools/scenarios/smoke.mjs (P0): boot → title → test level → move → screenshots → determinism (§9.4).
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

  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).join('; ')})`);
}
