// main.js (P0): boot. Create the engine, install every module in dependency order (§3.1), start the loop, boot the flow.
import { createEngine } from './core/engine.js';
import * as materials from './render/materials.js';
import * as atmosphere from './render/atmosphere.js';
import * as pipeline from './render/pipeline.js';
import * as particles from './render/particles.js';
import * as fx from './render/fx.js';
import * as weather from './render/weather.js';
import * as audio from './audio/audio.js';
import * as music from './audio/music.js';
import * as world from './world/world.js';
import * as structures from './art/structures.js';
import * as combat from './combat/combat.js';
import * as projectiles from './combat/projectiles.js';
import * as player from './actors/player.js';
import * as camera from './core/camera.js';
import * as enemies from './actors/enemy.js';
import * as enemytypes from './actors/enemytypes.js';
import * as mechai from './actors/mechai.js';
import * as comms from './ui/comms.js';
import * as hud from './ui/hud.js';
import * as mission from './mission/mission.js';
import * as cinematics from './mission/cinematics.js';
import * as screens from './ui/screens.js';
import * as garage from './ui/garage.js';
import * as flow from './ui/flow.js';
import * as debug from './debug/debug.js';

window.__booted = true;

const ORDER = [
  materials, atmosphere, pipeline, particles, fx, weather, audio, music,   // P1
  world,                                                                   // P2 (creates ctx.world and ctx.collision)
  structures,                                                              // P3 (registers man-made props too)
  combat, projectiles, player, camera, enemies, enemytypes, mechai,        // P4 (+ P0 camera)
  comms, hud, mission, cinematics, screens, garage, flow,                  // P5 (+ P3 garage)
  debug,                                                                   // P0
];

const ctx = createEngine({ canvas: document.getElementById('view') });
for (const m of ORDER) {
  try { m.install(ctx); }
  catch (e) { ctx.recordError('install', e); }
}
ctx.start();
try {
  await ctx.flow.boot();
} catch (e) {
  ctx.recordError('boot', e);
} finally {
  window.__game?._markReady?.();
}
