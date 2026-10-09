#!/usr/bin/env node
// tools/playtest.mjs (P0): Playwright harness (§9.3). Serves the campaign folder (or uses --url), routes three.js to a
// local copy, stubs Google Fonts, opens the game with ?debug=1&mute=1, waits for __game.ready, debug-pauses, and runs a
// scenario module from tools/scenarios/. Writes <out>/report.json and screenshots.
//
//   node tools/playtest.mjs --scenario smoke [--port 8765] [--tier high|medium|low] [--size 1280x720] [--touch]
//        [--out /tmp/campaign-playtest/<scenario>] [--no-serve] [--url http://host/path/index.html] [--headed]
//        [--three <dir>] [--param k=v ...] [--timeout <s>]
//
// Exit codes: 0 every assert passed and there were no page errors, console errors or __game.errors(); 1 otherwise;
// 2 harness failure (server, browser, missing scenario).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_THREE = '/tmp/claude-0/-home-user/227769ff-8cb3-5692-9edf-935efd37f8b0/scratchpad/three170/package';
const PW = '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROME = '/opt/pw-browsers/chromium';

// ------------------------------------------------------------------ args
function parseArgs(argv) {
  const a = { scenario: 'smoke', port: 8765, tier: 'high', size: '1280x720', touch: false, out: null, serve: true, url: null,
              headed: false, three: process.env.THREE_LOCAL || DEFAULT_THREE, params: [], timeout: 600 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    switch (k) {
      case '--scenario': a.scenario = v(); break;
      case '--port': a.port = Number(v()); break;
      case '--tier': a.tier = v(); break;
      case '--size': a.size = v(); break;
      case '--touch': a.touch = true; break;
      case '--out': a.out = v(); break;
      case '--no-serve': a.serve = false; break;
      case '--url': a.url = v(); a.serve = false; break;
      case '--headed': a.headed = true; break;
      case '--three': a.three = v(); break;
      case '--param': a.params.push(v()); break;
      case '--timeout': a.timeout = Number(v()); break;
      case '-h': case '--help': console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0);
      default: console.error('unknown argument', k); process.exit(2);
    }
  }
  const scName = a.scenario.replace(/\.m?js$/, '').split('/').pop();
  a.scenarioName = scName;
  a.out = a.out || `/tmp/campaign-playtest/${scName}`;
  const m = /^(\d+)x(\d+)$/.exec(a.size);
  if (!m) { console.error('bad --size', a.size); process.exit(2); }
  a.w = +m[1]; a.h = +m[2];
  return a;
}

// ------------------------------------------------------------------ server
function startServer(port) {
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT],
                     { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
  return { proc, get stderr() { return stderr; } };
}
function get(url) {
  return new Promise((res) => {
    const req = http.get(url, r => { r.resume(); res(r.statusCode); });
    req.on('error', () => res(0));
    req.setTimeout(2000, () => { req.destroy(); res(0); });
  });
}
async function waitForServer(base, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await get(base + '/index.html') === 200) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

// ------------------------------------------------------------------ main
const args = parseArgs(process.argv.slice(2));
const t0 = Date.now();
mkdirSync(args.out, { recursive: true });
const report = { scenario: args.scenarioName, ok: false, durationMs: 0, errors: [], consoleErrors: [], consoleWarnings: [],
                 asserts: [], shots: [], perf: [], logs: [], aborted: [], failedRequests: [], args: { tier: args.tier, size: args.size, touch: args.touch } };
let server = null, browser = null, exiting = false;

async function cleanup() {
  try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
  browser = null;
  if (server) { try { server.proc.kill('SIGTERM'); } catch (e) { /* ignore */ } server = null; }
}
function finish(code, msg) {
  if (exiting) return;
  exiting = true;
  report.durationMs = Date.now() - t0;
  try { writeFileSync(join(args.out, 'report.json'), JSON.stringify(report, null, 2)); } catch (e) { console.error('cannot write report', e); }
  const failed = report.asserts.filter(a => !a.ok);
  console.log(`\n[playtest] scenario=${args.scenarioName} ok=${report.ok} code=${code} time=${(report.durationMs / 1000).toFixed(1)}s`);
  console.log(`[playtest] asserts ${report.asserts.length - failed.length}/${report.asserts.length} passed; page errors ${report.errors.length}; console errors ${report.consoleErrors.length}; shots ${report.shots.length}`);
  for (const f of failed) console.log('  FAIL', f.msg);
  for (const e of report.errors.slice(0, 10)) console.log('  ERROR', e.message || e);
  for (const e of report.consoleErrors.slice(0, 10)) console.log('  CONSOLE', e.text);
  if (msg) console.log('[playtest]', msg);
  console.log(`[playtest] report: ${join(args.out, 'report.json')}`);
  cleanup().finally(() => process.exit(code));
}
process.on('SIGINT', () => finish(2, 'interrupted'));
process.on('SIGTERM', () => finish(2, 'terminated'));
const watchdog = setTimeout(() => { report.errors.push({ message: `harness timeout after ${args.timeout}s` }); finish(1, 'timeout'); }, args.timeout * 1000);

let harnessStage = 'start';
try {
  // scenario module
  harnessStage = 'scenario';
  const scPath = isAbsolute(args.scenario) || args.scenario.includes('/') ? resolve(args.scenario)
    : join(HERE, 'scenarios', args.scenario.endsWith('.mjs') ? args.scenario : args.scenario + '.mjs');
  if (!existsSync(scPath)) throw new Error('scenario not found: ' + scPath);
  const scenario = (await import(pathToFileURL(scPath).href)).default;
  if (typeof scenario !== 'function') throw new Error('scenario has no default export function');

  // server
  harnessStage = 'server';
  let base = args.url ? args.url.replace(/\/index\.html(\?.*)?$/, '').replace(/\/$/, '') : `http://127.0.0.1:${args.port}`;
  if (args.serve) {
    server = startServer(args.port);
    if (!await waitForServer(base)) throw new Error(`server did not start on port ${args.port}: ${server.stderr.slice(-400)}`);
  }

  // browser
  harnessStage = 'browser';
  const { chromium } = await import(PW);
  browser = await chromium.launch({
    executablePath: CHROME, headless: !args.headed,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: { width: args.w, height: args.h }, deviceScaleFactor: 1,
    hasTouch: args.touch, isMobile: args.touch,
  });
  const page = await context.newPage();

  // routing
  const threeRoot = resolve(args.three);
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('https://cdn.jsdelivr.net/npm/three@0.170.0/')) {
      const rel = decodeURIComponent(new URL(url).pathname.replace(/^\/npm\/three@0\.170\.0\//, ''));
      const file = join(threeRoot, rel);
      if (!file.startsWith(threeRoot) || !existsSync(file) || !statSync(file).isFile()) {
        report.failedRequests.push({ url, reason: 'missing local three file' });
        return route.fulfill({ status: 404, body: 'not found' });
      }
      return route.fulfill({ status: 200, contentType: extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith('https://fonts.gstatic.com/')) { report.aborted.push(url); return route.abort(); }
    if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    report.aborted.push(url);
    console.log('[playtest] aborted external request', url);
    return route.abort();
  });

  // console and errors
  page.on('console', (msg) => {
    const type = msg.type(), text = msg.text();
    const loc = msg.location?.() || {};
    if (type === 'error') {
      if (/^Failed to load resource/.test(text) && report.aborted.includes(loc.url)) return;   // requests the harness aborted on purpose
      report.consoleErrors.push({ text, url: loc.url, line: loc.lineNumber });
    } else if (type === 'warning') report.consoleWarnings.push({ text, url: loc.url });
    if (process.env.PLAYTEST_VERBOSE) console.log(`[page:${type}]`, text);
  });
  page.on('pageerror', (err) => report.errors.push({ message: String(err.message || err), stack: String(err.stack || '') }));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!report.aborted.includes(url)) report.failedRequests.push({ url, reason: req.failure()?.errorText });
  });

  // open the game
  harnessStage = 'boot';
  const q = new URLSearchParams({ debug: '1', mute: '1', tier: args.tier });
  if (args.touch) q.set('touch', '1');
  for (const p of args.params) { const [k, ...v] = p.split('='); q.set(k, v.join('=')); }
  const url = `${base}/index.html?${q}`;
  console.log('[playtest] open', url);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 90000 });
  await page.evaluate(() => Promise.race([window.__game.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('__game.ready timeout')), 90000))]));
  await page.evaluate(() => { window.__game.pause(); window.__game.ctx.pausedRender = false; });

  // helper
  harnessStage = 'run';
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const g = {
    page, args, out: args.out,
    async startLevel(id, cp, opts) { return ev(([id, cp, opts]) => window.__game.startLevel(id, cp, opts), [id, cp, opts || {}]); },
    async step(n = 1, dt = 1 / 60) { return ev(([n, dt]) => window.__game.step(n, dt), [n, dt]); },
    async state() { return ev(() => window.__game.getState()); },
    async input(o = {}) {
      return ev((o) => {
        const I = window.__game.input;
        if (o.clear) I.clear();
        if (o.move) I.move(o.move[0], o.move[1]);
        if (o.look) I.look(o.look[0], o.look[1]);
        if (o.hold) for (const [a, d] of Object.entries(o.hold)) I.hold(a, d);
        if (o.press) for (const a of o.press) I.press(a);
      }, o);
    },
    async teleport(pos, o) { return ev(([p, o]) => window.__game.teleport(p, o), [pos, o || {}]); },
    async setGod(b) { return ev((b) => window.__game.setGod(b), b); },
    async killAll(f) { return ev((f) => window.__game.killAll(f), f || {}); },
    async trigger(id) { return ev((id) => window.__game.trigger(id), id); },
    async completeObjective(id) { return ev((id) => window.__game.completeObjective(id), id); },
    async camera(pos, look, fov) { return ev(([p, l, f]) => window.__game.setCamera(p, l, f), [pos, look, fov]); },
    async freeCam(on) { return ev((on) => window.__game.freeCam(on), on); },
    async shot(name, o = {}) {
      const hud = o.hud !== false, settle = o.settle !== false;
      if (settle) await ev(() => window.__game.settle());
      await ev(([hud]) => { window.__game.hud(hud); window.__game.render(); }, [hud]);
      const file = join(args.out, `${name}.png`);
      await page.screenshot({ path: file });
      if (!hud) await ev(() => window.__game.hud(true));
      report.shots.push(file);
      console.log('[playtest] shot', file);
      return file;
    },
    async perf() { const p = await ev(() => window.__game.perf()); report.perf.push(p); return p; },
    async eval(fn, arg) { return page.evaluate(fn, arg); },
    assert(cond, msg) {
      report.asserts.push({ ok: !!cond, msg });
      console.log(`[playtest] ${cond ? 'PASS' : 'FAIL'} ${msg}`);
      return !!cond;
    },
    log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); report.logs.push(s); console.log('[scenario]', s); },
    async replay(n, inputs = { move: [0, 1] }) {
      await ev(() => window.__game.freeCam(false));
      await ev(() => window.__game.restart());
      await ev(() => window.__game.input.clear());
      await g.input(inputs);
      const s = await g.step(n);
      await ev(() => window.__game.input.clear());
      return s;
    },
  };

  await scenario(g);

  harnessStage = 'collect';
  const gameErrors = await page.evaluate(() => window.__game.errors()).catch(() => []);
  for (const e of gameErrors) report.errors.push({ message: `[${e.system}] ${e.message}` });
  report.ok = report.asserts.every(a => a.ok) && report.errors.length === 0 && report.consoleErrors.length === 0;
  clearTimeout(watchdog);
  finish(report.ok ? 0 : 1);
} catch (e) {
  clearTimeout(watchdog);
  const gameStage = harnessStage === 'boot' || harnessStage === 'run';
  report.errors.push({ message: `${harnessStage}: ${e.message}`, stack: String(e.stack || '') });
  finish(gameStage ? 1 : 2, gameStage ? 'scenario or boot failed' : 'harness failure');
}
