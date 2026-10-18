// tools/scenarios/clickthrough.mjs (P0): the full menu flow driven by real clicks and keys (§10.3 acceptance 4):
// title → New game → briefing → Deploy → playing → Esc → paused → Resume → Esc/P pause and resume by keyboard →
// walk the whole route → debrief → Title.
// Walking uses injected stick input and injected mouse-look steering toward a point 80 m ahead on the route.

const state = (g) => g.eval(() => window.__game.state());
async function waitState(g, want, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state(g);
    if (s === want) return true;
    // an intro card waits for Next (a player reads it and clicks on)
    if (s === 'interstitial' && want !== 'interstitial') await g.eval(() => document.querySelector('#screen #bNext')?.click());
    // the level-end beat ('complete') runs on sim time, which the harness has debug-paused
    if (s === 'complete' && want !== 'complete') await g.eval(() => window.__game.step(10));
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}
async function click(g, sel) {
  await g.page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
  await g.page.click(sel);
}

export default async function (g) {
  g.assert(await state(g) === 'title', 'starts at the title');

  await click(g, '#bNew');
  g.assert(await waitState(g, 'briefing'), 'New game → briefing');
  const brief = await g.eval(() => document.querySelector('#screen .doc h2')?.textContent);
  g.assert(!!brief, `briefing shows a level (${brief})`);
  await g.shot('briefing', { settle: false });

  await click(g, '#bStart');
  g.assert(await waitState(g, 'playing', 60000), 'Deploy → loading → playing');
  const s0 = await g.eval(() => window.__game.getState());
  g.assert(s0.levelId === 'l01' && s0.player?.alive, `playing ${s0.levelId}`);

  await g.page.keyboard.press('Escape');
  const sp = await g.step(1);   // this tick still runs as a sim tick (tick samples simRunning at its start)
  g.assert(await state(g) === 'paused', 'Esc → paused');
  const pauseDom = await g.eval(() => ({ title: document.querySelector('#screen h2')?.textContent, sim: window.__game.ctx.simRunning }));
  g.assert(pauseDom.title === 'Paused' && !pauseDom.sim, 'pause menu shown, sim stopped');
  await g.shot('paused', { settle: false });
  const frozen = await g.step(60);
  g.assert(frozen.time === sp.time && JSON.stringify(frozen.player.pos) === JSON.stringify(sp.player.pos), 'mission time and player frozen while paused');

  await click(g, '#bRes');
  g.assert(await state(g) === 'playing', 'Resume → playing');

  // the keyboard loop: Esc/P pause, and Esc/P on the pause menu resume and stay resumed (the key that closes the menu
  // must not re-pause on the next tick)
  for (const [k1, k2] of [['Escape', 'Escape'], ['KeyP', 'KeyP'], ['Escape', 'KeyP']]) {
    await g.page.keyboard.press(k1);
    const a = await g.step(1);
    await g.page.keyboard.press(k2);
    const b = await g.step(30);
    g.assert(a.state === 'paused' && b.state === 'playing', `${k1} pauses, ${k2} resumes and stays resumed (${a.state} → ${b.state})`);
  }

  // integration: Level 1 (THAW) is a story level that is not completed by walking its route (int-play.mjs plays it
  // through), so the walk → debrief → title half runs on the Proving Ground: Esc → Quit to title → Level select
  // (debug lists the hidden test level) → briefing → Deploy.
  await g.page.keyboard.press('Escape');
  await g.step(1);
  await click(g, '#screen #bQuit');
  g.assert(await waitState(g, 'title'), 'pause → Quit to title');
  await click(g, '#bSelect');
  g.assert(await waitState(g, 'levelSelect'), 'Level select');
  const picked = await g.eval(() => { const b = [...document.querySelectorAll('#screen .list-item')].find(b => /Proving Ground/i.test(b.textContent)); if (b) b.click(); return !!b; });
  g.assert(picked, 'the Proving Ground is listed (debug)');
  g.assert(await waitState(g, 'briefing'), 'Level select → briefing');
  await click(g, '#bStart');
  g.assert(await waitState(g, 'playing', 60000), 'Deploy → playing (Proving Ground)');
  const s1 = await g.eval(() => window.__game.getState());
  g.assert(s1.levelId === 'test' && s1.player?.alive, `playing ${s1.levelId}`);

  // walk the route: steer with injected look toward a point ahead, push the stick forward
  const total = await g.eval(() => window.__game.ctx.world.route.length);
  let s = s1.player.s, iters = 0, reachedEnd = false;
  await g.input({ clear: true, move: [0, 1] });
  while (iters++ < 400) {
    await g.eval(() => {
      const c = window.__game.ctx, p = c.player, r = c.world.route;
      const pa = c.world.playArea(p.pos.x, p.pos.z), t = r.pointAt(Math.min(r.length, pa.s + 80));
      let d = Math.atan2(-(t.x - p.pos.x), -(t.z - p.pos.z)) - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      window.__game.input.look(-d / (0.0022 * c.settings.get('sens')), 0);
    });
    const st = await g.step(60);
    s = st.player?.s ?? s;
    if (st.state !== 'playing') { reachedEnd = true; break; }
  }
  await g.input({ clear: true });
  g.log(`walked to s=${s.toFixed(0)} of ${total.toFixed(0)} in ${iters} × 60 steps`);
  g.assert(reachedEnd, 'walking to the route end completes the level');
  g.assert(await waitState(g, 'debrief'), 'complete → debrief');
  const deb = await g.eval(() => ({ h2: document.querySelector('#screen h2')?.textContent, sub: document.querySelector('#screen .sub')?.textContent,
                                    save: window.__game.save.get().progress.levels.test }));
  g.assert(deb.save?.completed && deb.save.completions === 1, `debrief shown and the Proving Ground saved as completed (${deb.sub})`);
  await g.shot('debrief', { settle: false });

  // the debrief's actions are #bA0.. (A3.7): Continue, Garage, Title
  const quitOk = await g.eval(() => { const b = [...document.querySelectorAll('#screen .actions button')].find(b => /^\s*Title\s*$/i.test(b.textContent)); if (b) b.click(); return !!b; });
  g.assert(quitOk, 'the debrief offers Title');
  g.assert(await waitState(g, 'title'), 'debrief → title');
  const back = await g.eval(() => ({ h1: document.querySelector('#screen h1')?.textContent, world: !!window.__game.ctx.world.def,
                                     active: window.__game.ctx.player.active }));
  g.assert(!!back.h1 && !back.world && !back.active, 'back at the title with the level unloaded');
  await g.shot('title-again');

  const errs = await g.eval(() => window.__game.errors());
  g.assert(errs.length === 0, `no game errors (${errs.map(e => e.system + ': ' + e.message).join('; ')})`);
}
