# Campaign: Technical Architecture and Build Plan

Version 1, for the first build: the engine, a level 1 vertical slice, and garage v1.
Written by the technical director for the build team. Each engineer is an AI agent that owns specific files.

This document contains no story. The story is in `docs/SPOILERS-story-bible.md`, and the level 1 layout is in `docs/level-01.md`. Both are for the build team only. Nothing in the shipped game may reveal story before the player reaches it (see §8.6).

**How to use this document**

- §4 lists every module's public interface. These signatures are **binding contracts**. You can add exports, optional parameters and optional fields. You can't rename, remove or change the meaning of anything listed in §4.
- "MUST" is a hard rule. "SHOULD" is the default, and you need a stated reason to depart from it.
- If you need something from another package that isn't in §4, don't edit their file. Add a local fallback in your own file and list the gap in your hand-off message (§10.10).
- Line counts are targets that help with planning. They aren't limits.

---

## 1. Principles and conventions

### 1.1 Goals

1. **Visual bar.** Everything is built to the standard of the prototype's bevelled mechs. Man-made objects use bevelled, layered, extruded plates, inset panel lines and greebles, with no raw `BoxGeometry` in final art (debris chunks are the only exception). Terrain is eroded and shaped, never plain noise. Depth comes from height fog, sun inscatter, skyline layers and per-biome grading.
2. **Big maps.** Each level is a long region, 3 to 5 km along a route and 0.6 to 1.5 km wide. The player crosses it from start to end. Terrain, props and structures stream around the camera.
3. **Proven feel.** Movement, combat, lock-on, stagger, AI patterns, comms, HUD and procedural audio are ported from the prototype (`iron-ledger/index.html`) with their behaviour unchanged unless this document says otherwise. Appendix A maps each prototype section to its new module.
4. **Runs everywhere.** The game targets 60 fps on a mid-range desktop GPU on the High tier, and has a Low tier that runs on phones.
5. **Testable.** The simulation can be stepped deterministically from `window.__game` and driven headless by Playwright.

### 1.2 Hard constraints (restated)

- The game is a static multi-file page (`index.html`, ES modules, CSS) with no build step. It has no external art or audio assets: every model, texture, sound and note of music is generated in code. Google Fonts are allowed.
- The only external script is Three.js **0.170.0** from `cdn.jsdelivr.net/npm/three@0.170.0/`, loaded through the import map (§2.2). Addons are imported as `three/addons/...`.
- There is no voice acting and there are no pre-rendered cutscenes. Story is delivered through comms text, in-engine shots, world events, briefings, interstitials and environmental details.
- Engineers MUST NOT run git and MUST write only the files they own (§10).

### 1.3 Units, axes and angles

| Quantity | Convention |
| --- | --- |
| Length | metres. A mech stands about 11 m tall (pelvis at 5.4 m), as in the prototype. |
| Time | seconds |
| Up | +Y |
| North | −Z. East is +X. The compass shows heading = −yaw in degrees. |
| Model forward | −Z |
| `yaw` | radians. 0 faces −Z, and positive values turn left (counter-clockwise seen from above). forward = (−sin yaw, 0, −cos yaw), right = (cos yaw, 0, −sin yaw), `yawTo(dx, dz) = atan2(−dx, −dz)` |
| `pitch` | radians, positive is up |
| Azimuth (level art) | degrees clockwise from north. direction = (sin θ, 0, −cos θ), yaw = −θ |
| Route coordinates | `s` is metres along the route from its start. `l` is the lateral offset in metres, positive to the **right** of the direction of travel. |
| Teams | `'player'`, `'ally'`, `'enemy'`, `'neutral'`. Player and ally are hostile to enemy. Neutral is hostile to nobody. |

The prototype tunings carry over: walking boost 30 m/s, quick boost impulse 82 m/s, gravity 45 m/s², jump velocity 17 m/s, terminal fall speed −75 m/s.

### 1.4 Time, determinism and randomness

- There are two clocks. **Sim time** advances only while the simulation runs and is scaled by `ctx.timeScale`. **Real time** always advances. Systems declare which clock they use (§3.3).
- Gameplay code MUST NOT use `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now()` or `performance.now()` for game logic. Delayed gameplay goes through `ctx.timers.after(sec, fn)`, which runs on sim time. The prototype's `setTimeout` bursts (tank salvos, missile ripples) become timers. UI animations, such as the typewriter on menu screens and CSS transitions, may use real time.
- Gameplay randomness (AI decisions, spawn jitter, weapon spread, procedural placement) MUST use `ctx.random()` or a seeded `mulberry32` from `core/util.js`. `Math.random()` is allowed only for cosmetic effects: particles, flicker, audio jitter.
- `mission.start` and `mission.restart` reseed `ctx.random` with `hashString(levelId + ':' + checkpoint) ^ Number(ctx.params.get('seed') ?? def.seed)`. World generation uses its own seeded generators, derived from `def.seed` and a per-layer seed.
- With the same seed, the same level and checkpoint, and the same injected inputs, `__game.step(n, dt)` MUST produce the same `getState()`. Streaming timing may differ between runs, which is fine because collision never depends on it (§5.6).

### 1.5 Colour management and lighting (r155+)

- `renderer.outputColorSpace = SRGBColorSpace`, and `THREE.ColorManagement.enabled` stays true. Hex colours in code are sRGB and are converted automatically.
- Canvas textures used as colour maps MUST set `texture.colorSpace = SRGBColorSpace`. Bump, roughness, normal and noise maps keep `NoColorSpace`.
- Vertex colours are **linear**. Write `new Color(hex)` components (which are already linear) into attributes. Don't write raw sRGB bytes.
- Tone mapping is `ACESFilmicToneMapping` by default, and a level can choose `'agx'` or `'neutral'` (§6.4). Exposure comes from the level art.
- Every custom `ShaderMaterial` fragment shader MUST end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`. These are no-ops when rendering into a composer target and correct when rendering straight to the screen on the Low tier.
- Light units are physically based (legacy lights were removed in r165). Starting conversions from the prototype:

| Prototype (r149, legacy) | r170 starting value |
| --- | --- |
| Directional sun 2.1 | 6.5 (multiply by π) |
| Hemisphere 0.55 | 1.7 |
| Rim directional 0.9 | 2.8 |
| Emissive intensity 2.6 to 3 | unchanged. Emissive isn't a light, and bloom thresholds are retuned instead. |
| PointLight intensity I with legacy cutoff falloff | about I × π × (0.25 × distance)² candela with `decay = 2`. A muzzle flash is roughly 300 to 800, an explosion 2,000 to 20,000. Keep `distance` as the cutoff. |

These values are starting points that P1 tunes against screenshots.

### 1.6 Code rules

- Use plain ES modules with no bundler. Import only `three`, `three/addons/...`, and the relative files listed in §2. Imports between packages may only bring in **pure exports** listed in §4 (classes, builders and data). Runtime services are reached through `ctx` (§3), never imported as singletons.
- `install(ctx)` MUST NOT require services installed after it. Reach for other services lazily inside methods and updates, and guard against them being missing (`ctx.enemies?.combatIntensity?.() ?? 0`).
- Hot paths (anything per frame or per projectile step) MUST NOT allocate. Reuse module-level temporary vectors.
- Static objects set `matrixAutoUpdate = false` and call `updateMatrix()` once.
- Nothing may change the number of lights at runtime, because three recompiles every program when that number changes. Pooled lights stay in the scene, and "off" means `intensity = 0`. Only a quality tier change may change the light count.
- Everything that belongs to a level goes under `ctx.levelRoot`. `ctx.clearLevel()` disposes all of it except shared cached geometry and materials.
- DOM is touched only by `core/input.js` (touch layer), `ui/*`, `debug/debug.js` and the boot fallback in `index.html`. Modules create their extra DOM inside their own root elements. CSS beyond `styles.css` is injected by the owning module with `injectCSS(id, text)` from `core/util.js`.
- Story names from the prototype (the consortium, the factions, the pilots and the handler) MUST NOT be reused. The new story replaces them.
- Errors: the engine catches exceptions per system (§3.3), so one broken system doesn't freeze the game. That isn't a reason to swallow errors inside your own code: let them reach the engine so they are recorded and tests fail.

---

## 2. File layout

### 2.1 Tree, owners and size targets

Ownership is by **file**. P0 creates every file first, as working stubs. When P0 is done, each file passes to the owner shown, who is then its only editor.

```
campaign/
├── index.html                 P0      import map, font + CSS links, HUD/touch/screen DOM, boot fallback      ~220
├── styles.css                 P0      design tokens, type, buttons, panels, HUD, touch, screens base         ~650
├── docs/                              team docs (not loaded by the game)
│   ├── architecture.md                this file
│   ├── SPOILERS-story-bible.md        story (build team only)
│   └── level-01.md                    level 1 design
├── src/
│   ├── main.js                P0      boot: createEngine, install modules in order, flow.boot()             ~120
│   ├── core/engine.js         P0      ctx, loop, phases, systems, step, errors, resize, tiers               ~380
│   ├── core/util.js           P0      math, RNG, EventBus, TimerQueue, Pool, injectCSS, temps               ~260
│   ├── core/noise.js          P0      seeded simplex/value noise, fbm, ridged, warp, tileable               ~220
│   ├── core/settings.js       P0      settings store, TIERS, tier resolution, touch detection               ~240
│   ├── core/save.js           P0      versioned save store + migrations                                     ~240
│   ├── core/input.js          P0      keyboard/mouse/pointer lock/touch/gamepad → actions                   ~560
│   ├── core/camera.js         P0      camera rig: follow, orbit, cinematic, free fly, shake, aim ray        ~360
│   ├── debug/debug.js         P0      window.__game, overlay, URL params                                    ~420
│   ├── render/pipeline.js     P1      tone mapping, composer, passes, FinalPass grade, tiers, stats         ~420
│   ├── render/atmosphere.js   P1      sky dome, sun/hemi/rim, shadow follow, height fog patch, PMREM, skyline ~650
│   ├── render/materials.js    P1      canvas textures, material library, wear patch, palettes, signage      ~560
│   ├── render/particles.js    P1      particle systems, light pool, debris, decals                          ~480
│   ├── render/fx.js           P1      effect recipes, persistent emitters, ambient battle                   ~420
│   ├── render/weather.js      P1      ash/dust/rain/snow/embers/sandstorm, lightning                        ~320
│   ├── audio/audio.js         P1      WebAudio graph, synth SFX, loops, stereo pan, comms voice             ~480
│   ├── audio/music.js         P1      procedural music sequencer, themes, intensity, stingers               ~380
│   ├── world/route.js         P2      route spline, arc length, closest point, route coords                 ~260
│   ├── world/heightfield.js   P2      macro grid, noise, walls, carving, erosion, stamps, bakes, tiles      ~800
│   ├── world/terrain.js       P2      quadtree LOD meshes, streaming, terrain material                      ~620
│   ├── world/scatter.js       P2      prop registry, natural props, instancing, prop colliders              ~560
│   ├── world/collision.js     P2      2.5D colliders, spatial hash, support/resolve/segment                 ~420
│   ├── world/world.js         P2      level world build/teardown, resolve(), play area, streaming system    ~360
│   ├── art/kit.js             P3      bevelled geometry kit (plateGeo/acKit port), GeoBuilder, bakeRigid    ~560
│   ├── art/mechs.js           P3      mech skeleton, frame designs, part visuals, animation, wrecks         ~850
│   ├── art/units.js           P3      unit models: drones, tanks, turret, gunship, walker, …                ~700
│   ├── art/structures.js      P3      structure registry + catalog, man-made props, states, destruction     ~880
│   ├── ui/garage.js           P3      hangar scene, title showcase, loadout editor                          ~650
│   ├── combat/combat.js       P4      targets, teams, damage/stagger/kill, stats                            ~300
│   ├── combat/projectiles.js  P4      pooled instanced projectiles, swept hits, homing, arcs                ~400
│   ├── combat/loadout.js      P4      frames, parts catalogue, stats, validation, paint presets             ~320
│   ├── combat/weapons.js      P4      weapon behaviours per weapon type                                     ~480
│   ├── actors/player.js       P4      player mech controller                                                ~560
│   ├── actors/enemy.js        P4      Unit base, registry, spawn, activation, steering helpers              ~420
│   ├── actors/enemytypes.js   P4      drone, tanks, turret, gunship, walker, artillery, apc, beacon, dropship ~650
│   ├── actors/mechai.js       P4      enemy/ally mech AI (port of makeAC), bosses                           ~450
│   ├── mission/mission.js     P5      level script runtime: objectives, triggers, encounters, checkpoints, actions ~900
│   ├── mission/cinematics.js  P5      camera shots, letterbox, flybys, barrages                             ~380
│   ├── ui/hud.js              P5      HUD                                                                   ~720
│   ├── ui/comms.js            P5      comms typewriter, speakers, log                                       ~240
│   ├── ui/screens.js          P5      title, select, briefing, loading, pause, settings, death, debrief, interstitial, credits ~820
│   └── ui/flow.js             P5      game state machine                                                    ~380
├── levels/
│   ├── index.js               P6      level registry + loader                                               ~60
│   ├── test.js                P5      "proving ground": a test level that uses every format feature         ~350
│   ├── level01.js             P6      level 1 definition                                                    ~900
│   └── level01/               P6      optional level-1-only code (custom structures/actions/skyline)
└── tools/
    ├── playtest.mjs           P0      Playwright harness (§9.3)
    ├── contract.json          P0      interface manifest derived from §4 (§9.5)
    └── scenarios/
        ├── smoke.mjs          P0      boot → title → test level → move → screenshots
        ├── contract.mjs       P0      checks exports and ctx services against contract.json
        ├── p1-look.mjs        P1
        ├── p2-world.mjs       P2
        ├── p3-art.mjs         P3
        ├── p4-combat.mjs      P4
        ├── p5-mission.mjs     P5
        └── level01.mjs        P6
```

### 2.2 `index.html` (P0)

- `<meta viewport content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>` (a placeholder until the story team names the game), Google Fonts **Barlow Condensed** (400/500/600/700) and **IBM Plex Mono** (400/500/600), and `<link rel="stylesheet" href="styles.css">`.
- The import map, exactly:

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
<script type="module" src="src/main.js"></script>
```

- A boot fallback: a small classic inline script that, if `window.__booted` isn't true after 12 s, writes "No signal. The 3D engine failed to load. Check your connection and reload." into `#screen`. `main.js` sets `window.__booted = true` as its first statement after imports resolve.
- DOM. These IDs are the contract for `hud.js`, `screens.js`, `input.js` and `debug.js`. They are ported from the prototype, plus new ones marked ★.

```
#game
  canvas#view
  #hud[hidden]
    #vignette  #scan  #glitch  #markers
    #objpanel > #mname, ul#objs, #timer
    #compass > #compassStrip
    canvas#radar (336×336)
    #reticle > .br.tl .br.tr .br.bl .br.brr .dot #hitmark
    #lockbox > .frame, .info > .nm, .bar.apb>i, .bar.stb>i, .stag, .dist
    #killfeed  #warn  #hint
    #comms[hidden] > .who > canvas#wave(128×32), span ; .line
    #progress[hidden] > .pl, .bar>i
    #choice[hidden] > .t, .bar>i, .opts
    #status > .row(.lbl, #apNum), .bar.apb>i#apFill, .bar.enb>i#enFill, #enLbl(span, #enTxt), .bar.stb>i#stFill
    #weapons > .wpn#wR, .wpn#wL, .wpn#wS, .wpn#wK   (each: .slot, .wn(.key), .wv)
    #frameTag > #frameName, b#callsign, .sub#frameSub
    ★ #bossbar[hidden] > .nm, .bar>i, .stag
    ★ #prompt[hidden] > kbd, span
    ★ #zonecard > .t, .s
    ★ #checkpointToast
  #touch[hidden]
    #stickHome  #stick[hidden]>.knob
    button.tb[data-act] for: fire, blade, boost, jump, msl, lock, kit, pause, ★interact (hidden unless a prompt is up), ★skip (hidden unless a skippable shot is playing)
    #rotate[hidden]
  ★ #letterbox > .top, .bot
  #screen          (menus; screens.js owns its innerHTML)
  #fade            (black fade layer)
  ★ #dbg[hidden]   (debug overlay; debug.js)
```

### 2.3 `styles.css` (P0)

`styles.css` holds the prototype's CSS ported with its tokens generalised (`--hmc` becomes `--accent`, and `--hollow` and the faction classes are dropped), plus `--ally:#7fc6ff`, letterbox, boss bar, prompt, zone card, checkpoint toast and the shared screen components (`.btn`, `.btn.ghost`, `.doc`, `.center-card`, `.panel`, `.tabs`, `.list`, `.stat-bar`, `.kbd`). The comms speaker colour comes from a CSS variable set inline (`#comms{--spk:...}`), so a new speaker never needs a CSS edit. After P0 the file is frozen, and module-specific CSS goes through `injectCSS`.

---

## 3. Core runtime: the engine context

### 3.1 Boot sequence (`src/main.js`, P0)

```js
import { createEngine } from './core/engine.js';
import * as materials from './render/materials.js';   // …one import per installable module
const ctx = createEngine({ canvas: document.getElementById('view') });
const ORDER = [
  materials, atmosphere, pipeline, particles, fx, weather, audio, music,   // P1
  world,                                                                   // P2 (creates ctx.world and ctx.collision)
  structures,                                                              // P3 (registers man-made props too)
  combat, projectiles, player, camera, enemies, enemytypes, mechai,        // P4 (+ P0 camera)
  comms, hud, mission, cinematics, screens, garage, flow,                  // P5 (+ P3 garage)
  debug,                                                                   // P0
];
for (const m of ORDER) m.install(ctx);
ctx.start();               // starts the rAF loop
await ctx.flow.boot();     // title screen, or a direct start from ?level=
```

`camera` is `core/camera.js`. `enemytypes` and `mechai` have no service of their own: their `install` registers unit kinds into `ctx.enemies`.

### 3.2 The context object `ctx`

`createEngine` (in `core/engine.js`) creates the core fields. Each module's `install(ctx)` assigns its own service field.

```ts
export function createEngine(opts: { canvas: HTMLCanvasElement, params?: URLSearchParams }): Ctx;

interface Ctx {
  // ── core, created by createEngine (P0) ──────────────────────────────────────────
  THREE: typeof import('three');
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;  // { antialias: true, stencil: false, powerPreference: 'high-performance',
                                  //   preserveDrawingBuffer: ctx.debug }, outputColorSpace SRGB, ACES tone mapping,
                                  //   shadowMap.enabled = true, info.autoReset = false (the pipeline resets it per frame)
  scene: THREE.Scene;             // persistent root: sky, lights, particle systems, player rig
  levelRoot: THREE.Group;         // child of scene; holds everything level-scoped; emptied by clearLevel()
  camera: THREE.PerspectiveCamera;// fov = settings.fov (66), near 0.5, far = tier.viewDistance × 1.3
  params: URLSearchParams;        // URL query (§9.1)
  debug: boolean;                 // params.has('debug')
  clock: { time: number;          // sim seconds since the level started (reset by mission.start)
           dt: number;            // last sim dt
           realTime: number; realDt: number; frame: number };
  events: EventBus;
  timers: TimerQueue;             // sim time; cleared by clearLevel() and mission.stop()
  settings: SettingsStore;
  tier: TierConfig;               // resolved current tier; replaced (not mutated) on change
  save: SaveStore;
  input: Input;
  random(): number;               // seeded sim RNG in [0,1)
  reseed(seed: number): void;
  errors: Array<{ system: string, message: string, stack?: string, t: number }>;   // ring buffer, 50 entries

  simRunning: boolean;            // flow sets this true in 'playing' only
  debugPaused: boolean;           // __game.pause() sets it; rAF then renders but doesn't tick
  timeScale: number;              // 1. Multiplies sim dt (blade-hit slow motion, cinematics)

  addSystem(def: SystemDef): () => void;        // returns a remover
  removeSystem(name: string): void;
  start(): void;
  tick(realDt: number): void;                   // one frame of logic, no render (§3.3)
  step(n: number, dt?: number): void;           // n × tick(dt). dt defaults to 1/60. No render.
  renderFrame(): void;                          // ctx.pipeline.render()
  clearLevel(): void;                           // dispose levelRoot children, clear timers, emit 'level:cleared'
  setTier(name: 'low'|'medium'|'high'): void;   // sets ctx.tier, camera.far, emits 'tier:changed'
  resize(): void;                               // renderer.setSize(…, false), camera.aspect, emits 'resize'

  // ── services, assigned by install(ctx) (§4) ─────────────────────────────────────
  materials; atmosphere; pipeline; particles; fx; weather; audio; music;   // P1
  world; collision;                                                        // P2
  structures; garage;                                                      // P3
  combat; projectiles; player; enemies;                                    // P4
  cameraRig;                                                               // P0
  mission; cinematics; comms; hud; screens; flow;                          // P5
  debugApi;                                                                // P0
}

interface SystemDef {
  name: string;                   // unique, e.g. 'player', 'terrain-stream'
  phase: Phase;
  update(dt: number, ctx: Ctx): void;
  when?: 'sim' | 'always';        // default 'sim'
  order?: number;                 // within the phase, ascending; default 0, ties broken by registration order
}
type Phase = 'input'|'early'|'player'|'ai'|'physics'|'mission'|'world'|'camera'|'fx'|'ui'|'audio'|'late';
```

### 3.3 The frame

```
rAF frame(now):
  realDt = clamp((now − last)/1000, 0, 0.1)
  if (!ctx.debugPaused) ctx.tick(realDt)
  ctx.renderFrame()

ctx.tick(realDt):
  clock.realDt = realDt; clock.realTime += realDt; clock.frame++
  sim   = ctx.simRunning
  simDt = sim ? min(realDt, 1/30) × ctx.timeScale : 0
  for phase in PHASES:
    for sys in systems[phase] (sorted):
      if (sys.when === 'sim' && !sim) continue
      try { sys.update(sys.when === 'sim' ? simDt : realDt, ctx) }
      catch (e) { record in ctx.errors; console.error once per system per second; continue }
  if (sim) { clock.time += simDt; clock.dt = simDt }

ctx.step(n, dt = 1/60):  for i < n: ctx.tick(dt)        // deterministic; the rAF loop is normally debug-paused
```

Phases and the systems registered in each (owners in brackets):

| Phase | Systems |
| --- | --- |
| `input` | `input` (P0, always): `beginFrame()`, which polls the gamepad and latches edges |
| `early` | `timers` (P0, sim): `ctx.timers.update()`; `flow` (P5, always); `debug-keys` (P0, always) |
| `player` | `player` (P4, sim) |
| `ai` | `enemies` (P4, sim) |
| `physics` | `projectiles` (P4, sim) |
| `mission` | `mission` (P5, sim, order 0); `cinematics` (P5, sim, order 10) |
| `world` | `world` (P2, always): terrain and scatter streaming; `structures` (P3, always): lazy realize, LOD, animations |
| `camera` | `cameraRig` (P0, always) |
| `fx` | `atmosphere` (P1, always); `weather` (P1, always); `particles` (P1, sim); `fx` (P1, sim) |
| `ui` | `comms` (P5, sim); `hud` (P5, always); `garage` (P3, always) |
| `audio` | `audio` (P1, always); `music` (P1, always) |
| `late` | `input-end` (P0, always): `endFrame()` clears per-frame edges |

The player updates before the camera, as in the prototype: the player aims along last frame's camera ray. Every sim system MUST be a no-op when its level data isn't loaded (for example, `ctx.player.active === false`).

### 3.4 Install protocol

Every installable module exports `install(ctx)`. It creates its service, assigns `ctx.<name>`, registers its systems and event listeners, and returns the service. It MUST NOT touch services installed after it. Reach them lazily.

### 3.5 Event catalogue (`ctx.events`)

Payloads are plain objects. **Emitters are binding**: the listed module MUST emit the event. Any module may listen.

| Event | Payload | Emitter |
| --- | --- | --- |
| `resize` | `{ w, h, pr }` | engine |
| `input:focuslost` | `{ reason: 'blur'\|'pointerlock' }` | input |
| `tier:changed` | `{ tier }` | engine |
| `settings:changed` | `{ key, value }` | settings |
| `state:changed` | `{ from, to }` | flow |
| `level:loading` | `{ levelId, progress, label }` | world (progress) |
| `level:ready` | `{ levelId }` | flow |
| `level:start` | `{ levelId, checkpoint, fresh }` | mission |
| `level:complete` | `{ levelId, result: LevelResult }` | mission |
| `level:failed` | `{ levelId, reason }` | mission |
| `level:cleared` | `{}` | engine |
| `checkpoint:reached` | `{ id, label }` | mission |
| `objective:changed` | `{ id, state, text, progress? }` | mission |
| `zone:entered` / `zone:exited` | `{ id, name }` | mission |
| `trigger:fired` | `{ id }` | mission |
| `encounter:started` / `encounter:cleared` | `{ id }` | mission |
| `comms:line` | `{ who, text }` | comms |
| `player:spawned` | `{}` | player |
| `player:damaged` | `{ amount, source, ap }` | player (via combat) |
| `player:staggered` / `player:died` / `player:landed` | `{}` / `{}` / `{ speed }` | player |
| `target:registered` / `target:killed` | `{ target }` / `{ target, source }` | combat |
| `target:damaged` | `{ target, amount, staggered }` | combat |
| `unit:spawned` | `{ unit }` | enemies |
| `structure:state` | `{ id, state }` | structures |
| `pickup` | `{ id, kind, unlocks }` | mission |
| `cinematic:start` / `cinematic:end` | `{ name }` | cinematics |
| `fx:explosion` | `{ pos, scale }` | fx |

### 3.6 Core module interfaces (P0)

#### `core/util.js`

```ts
export const TAU: number;
export function clamp(v, a, b): number;
export function lerp(a, b, t): number;
export function invLerp(a, b, v): number;
export function smooth(e0, e1, x): number;            // smoothstep (the prototype's `smooth`)
export function damp(a, b, k, dt): number;            // lerp(a, b, 1 − exp(−k·dt))
export function dampAng(a, b, k, dt): number;
export function angWrap(a): number;
export function yawTo(dx, dz): number;                // atan2(−dx, −dz)
export function aimDir(yaw, pitch, out: Vector3): Vector3;
export function rand(a, b): number;                   // cosmetic (Math.random)
export function mulberry32(seed: number): () => number;
export function hashString(s: string): number;        // uint32 FNV-1a
export function pick<T>(rng: () => number, arr: T[]): T;
export function formatTime(sec: number): string;      // "MM:SS"
export function injectCSS(id: string, css: string): void;   // idempotent <style id=…>
export const V3: (x?, y?, z?) => Vector3;
export class EventBus { on(type, fn): () => void; once(type, fn): () => void; off(type, fn): void; emit(type, payload?): void; clear(): void; }
export class TimerQueue {
  constructor(getTime: () => number);
  after(sec: number, fn: () => void): number;         // returns an id
  every(sec: number, fn: () => void | false): number; // return false from fn to stop
  cancel(id: number): void; update(): void; clear(): void;
}
export class Pool<T> { constructor(create: () => T, reset?: (o: T) => void); get(): T; release(o: T): void; readonly free: number; }
```

#### `core/noise.js`

These functions are pure and deterministic, and fast enough to call millions of times during terrain build.

```ts
export function createNoise2D(seed: number): (x: number, y: number) => number;   // simplex, range ≈ [−1, 1]
export function createValueNoise2D(seed: number): (x, y) => number;              // [0, 1]
export function fbm2(noise, x, y, octaves = 5, lacunarity = 2.03, gain = 0.5): number;   // normalised to ≈ noise range
export function ridged2(noise, x, y, octaves = 5, lacunarity = 2.0, gain = 0.5): number; // [0, 1]
export function warp2(noise, x, y, amount, scale, out: { x, y }): { x, y };              // domain warp
export function tileable2(seed: number, period: number): (x, y) => number;              // periodic value noise (textures)
```

#### `core/settings.js`

```ts
export const TIERS: Record<'low'|'medium'|'high', TierConfig>;   // values: §7.4
export const DEFAULT_SETTINGS: Settings;
export function detectTouch(): boolean;
export function resolveTier(s: Settings): TierConfig;           // quality 'auto' → touch ? 'low' : 'high'
export class SettingsStore {
  constructor(key = 'campaign.settings');
  readonly data: Settings;
  get<K extends keyof Settings>(k: K): Settings[K];
  set<K extends keyof Settings>(k: K, v: Settings[K]): void;     // persists, then emits 'settings:changed'
  onChange(fn: (key, value) => void): () => void;
}
interface Settings {
  version: 1;
  sens: number /*1*/; invertY: boolean; fov: number /*66*/; cameraShake: number /*1*/;
  volMaster: number /*0.8*/; volMusic: number /*0.7*/; volSfx: number /*1*/;
  quality: 'auto'|'low'|'medium'|'high'; ao: boolean /*true; High only*/;
  touch: 'auto'|'on'|'off'; commsSpeed: number /*1 = 42 chars/s*/; showFps: boolean; reducedMotion: boolean;
}
```

#### `core/save.js` (format: §8.4)

```ts
export const SAVE_VERSION = 1;
export class SaveStore {
  constructor(key = 'campaign.save');
  data: SaveData;
  load(): SaveData;                  // migrate older versions; if corrupt, copy the raw value to key+'.bak' and start fresh
  write(): void;                     // immediate localStorage write, wrapped in try/catch
  reset(): void;
  hasProgress(): boolean;
  unlockLevel(id: string): void;
  completeLevel(id: string, r: LevelResult): void;     // keeps best time and best rank, unlocks def.unlocks
  setCheckpoint(levelId: string, cp: CheckpointState | null): void;
  getCheckpoint(levelId: string): CheckpointState | null;
  setFlag(k: string, v: any): void; getFlag(k: string): any;
  addCodex(id: string): void;
  setLoadout(lo: Loadout): void; getLoadout(): Loadout;
  unlockPart(id: string): void; unlockedParts(): Set<string>;
  addPlayTime(sec: number): void;
  exportJSON(): string; importJSON(s: string): boolean;
}
```

#### `core/input.js`

```ts
export const ACT = { FIRE:'fire', BLADE:'blade', BOOST:'boost', JUMP:'jump', MISSILE:'missile', LOCK:'lock',
                     KIT:'kit', INTERACT:'interact', ALT:'alt', PAUSE:'pause', SKIP:'skip', MAP:'map' } as const;
export const DEFAULT_BINDINGS: Record<Action, string[]>;
//  fire: Mouse0; blade: Mouse2; boost: ShiftLeft, ShiftRight; jump: Space; missile: KeyQ; lock: KeyE, Tab, Mouse1;
//  kit: KeyR; interact: KeyF; alt: KeyG; pause: Escape, KeyP; skip: Space, Enter (held 0.6 s); map: KeyM.
//  Gamepad (standard mapping): RT fire, LT blade, B boost, A jump, RB missile, R3 lock, X kit, Y interact,
//  Start pause, A or Start skip. Left stick moves. Right stick looks (radial deadzone 0.15).
export function install(ctx): Input;    // called by createEngine; ctx.input
interface Input {
  isTouch: boolean;                     // touch mode on (settings.touch, auto-detect, or first touchstart)
  pointerLocked: boolean;
  freeMouse: boolean;                   // pointer-lock fallback: edge-push turning (prototype behaviour)
  move: { x: number, y: number };       // x right +, y forward +; |move| ≤ 1; digital keys normalised; touch analog
  look: { dx: number, dy: number };     // this frame, in mouse-pixel units (touch, keys and gamepad converted); not sensitivity-scaled
  enabled: boolean;                     // false → gameplay actions read as idle (menus, frozen player)
  down(a: Action): boolean;
  pressed(a: Action): boolean;          // went down this frame
  released(a: Action): boolean;
  heldFor(a: Action): number;           // seconds held (SKIP uses it)
  key(code: string): boolean;           // raw key state (debug, free cam)
  beginFrame(): void; endFrame(): void; // the engine's input/late systems call these
  requestPointerLock(): void; exitPointerLock(): void;
  setTouchMode(on: boolean): void;
  showTouchButton(act: 'interact'|'skip', on: boolean): void;
  setTouchLabel(act: string, text: string, cooling?: boolean): void;   // the HUD writes ammo and cooldown labels
  inject(a: Action, down: boolean): void;            // tests, touch buttons
  injectMove(x: number, y: number): void;            // persists until changed
  injectLook(dx: number, dy: number): void;          // added to next frame
  clearInjected(): void;
}
```

The touch layer (stick on the left 42% of the screen, look-drag on the right, buttons, the rotate hint in portrait) is ported from the prototype. The input module listens for `blur` and `pointerlockchange` and emits `input:focuslost`, which flow turns into a pause.

#### `core/camera.js`

```ts
export function install(ctx): CameraRig;   // ctx.cameraRig
interface CameraRig {
  mode: 'follow'|'orbit'|'cinematic'|'free';
  focus: Vector3;          // world point that streaming, shadows and LOD centre on: the player in follow mode,
                           // the look target in cinematic/orbit, the camera position in free mode
  lookTarget: Vector3;
  shake: number;           // decays at 3/s
  addShake(amount: number): void;          // 0..2.2, scaled by settings.cameraShake (0 when reducedMotion)
  follow(target: { pos: Vector3, vel: Vector3, yaw: number, pitch: number }): void;
      // prototype rig: pivot = pos + 7.2 up; distance 15 + speed term; +1.6 m height;
      // clearance against ground and colliders via ctx.collision.segment (pull in, never clip)
  orbit(center: Vector3, radius: number, height: number, speed: number, lookOffset?: Vector3): void;
  setPose(pos: Vector3, look: Vector3, fov?: number): void;                 // → 'cinematic'
  blendTo(pos: Vector3, look: Vector3, seconds: number, fov?: number, ease?: 'linear'|'inOut'): Promise<void>;
  release(seconds = 0.8): void;                                              // blend back to follow
  setFree(on: boolean, pose?: { pos: Vector3, look: Vector3 }): void;       // debug fly: WASD, Q/E up/down,
                                                                             // mouse look, Shift ×4; real dt
  setFov(fov: number, seconds = 0): void;
  aimRay(outOrigin: Vector3, outDir: Vector3): void;                         // centre-screen ray
  worldToScreen(p: Vector3, out: { x: number, y: number, behind: boolean }): typeof out;   // CSS pixels
  update(dt: number): void;                                                  // system 'cameraRig', always
}
```

---

## 4. Module interfaces

Notation: TypeScript-style declarations describe JavaScript. `ColorLike = number | string | THREE.Color`. `Vec3 = [number, number, number]`. `Team = 'player'|'ally'|'enemy'|'neutral'`. `TierConfig` is an object with `name` plus every key in the §7.4 table. `Palette = LevelArt['palette']`. `Pos`, `YawSpec`, `LevelDef`, `LevelArt`, `Action`, `Condition` and the other level types are defined in §6. `CheckpointState` is described in §6.9, `LevelResult` in §8.3 and `Target` in §4.4.

### 4.1 P1: Look and Sound

#### `render/pipeline.js`

```ts
export function install(ctx): Pipeline;   // ctx.pipeline
interface Pipeline {
  composer: EffectComposer | null;        // null on Low (direct render)
  grade: GradeState;                      // live values; the hud writes grade.hurt
  setTier(t: TierConfig): void;           // also runs automatically on 'tier:changed'
  setGrade(p: Partial<GradeState>, blendSeconds = 0): void;
  setBloom(p: { strength?: number, radius?: number, threshold?: number }, blendSeconds = 0): void;
  setView(scene: THREE.Scene, camera: THREE.Camera): void;   // render another scene (garage/title)
  clearView(): void;                                          // back to ctx.scene / ctx.camera
  render(): void;                                             // the engine calls this once per frame
  warmup(): Promise<void>;                // renderer.compileAsync(view) plus one offscreen render; flow calls it while loading
  stats(): RenderStats;                   // whole frame: main + shadow + post
}
interface GradeState {
  exposure: number /*1*/; contrast: number /*1*/; saturation: number /*1*/;
  lift: Vec3 /*[0,0,0]*/; gamma: Vec3 /*[1,1,1]*/; gain: Vec3 /*[1,1,1]*/;
  shadowsTint: Vec3 /*[1,1,1]*/; highlightsTint: Vec3 /*[1,1,1]*/; desaturate: number /*0*/;
  vignette: number /*0.28*/; grain: number /*0.028*/; chroma: number /*0.012*/; hurt: number /*0..1*/;
}
interface RenderStats { calls: number, triangles: number, points: number, lines: number,
                        geometries: number, textures: number, programs: number, frameMs: number }
```

#### `render/atmosphere.js`

```ts
export const DEFAULT_ART: LevelArt;
export function install(ctx): Atmosphere;   // ctx.atmosphere
interface Atmosphere {
  sun: THREE.DirectionalLight;   // castShadow; the shadow camera follows ctx.cameraRig.focus, texel-snapped
  hemi: THREE.HemisphereLight;
  rim: THREE.DirectionalLight;
  sunDir: Vector3;               // unit vector pointing TOWARD the sun
  art: LevelArt;                 // current resolved art (after blends)
  envMap: THREE.Texture | null;  // PMREM of the sky; assigned to scene.environment
  fogUniforms: {                 // shared uniform objects injected by patchMaterial
    uFogColor, uFogDensity, uFogHeightFalloff, uFogHeightBase,
    uFogSunColor, uFogSunDir, uFogInscatter, uFogFarStart, uFogFarEnd };
  apply(art: Partial<LevelArt>): void;          // full reset: DEFAULT_ART deep-merged with art; sky, lights, fog, env,
                                                //   skyline, grade (→ pipeline), weather (→ ctx.weather), tone mapping
  set(p: Partial<LevelArt>, blendSeconds = 0): void;   // tween fog/sky/light/grade/bloom; weather forwarded;
                                                       //   env rebuilt at the end of the blend
  patchMaterial<T extends THREE.Material>(m: T): T;    // height fog + far fade (§5.8); idempotent; chains any existing
                                                       //   onBeforeCompile; sets customProgramCacheKey
  fogAmount(p: Vector3): number;                 // CPU mirror of the shader fog, 0..1 (marker fading, LOD hints)
  lightning(strength = 1): void;                 // brief sky + hemi flash
  rebuildEnvironment(): void;
  clear(): void;                                 // remove skyline objects (level unload)
  update(dt): void;                              // system 'atmosphere' (fx, always)
}
```

#### `render/materials.js`

```ts
export function install(ctx): Materials;   // ctx.materials
type TexName = 'panel'|'grain'|'rock'|'concrete'|'metal'|'grime'|'noise'|'smokeSprite'|'sparkSprite';
type LibName = 'concrete'|'concreteDark'|'steel'|'steelDark'|'rust'|'stripe'|'dark'|'rock'|'debris'|'glass'
             |'lightRed'|'lightAmber'|'lightCyan'|'lightWhite'|'cable'|'canvas'|'scorch'|'rubber';
interface Materials {
  textures: Record<TexName, THREE.Texture>;   // canvas-generated at install; size = tier.textureSize;
                                              // colour maps SRGBColorSpace, data maps NoColorSpace, RepeatWrapping
  get(name: LibName): THREE.Material;         // shared, palette-tinted, atmosphere-patched
  standard(o: StdOpts): THREE.MeshStandardMaterial;   // cached by key; atmosphere-patched
  glow(color: ColorLike, opacity = 1): THREE.MeshBasicMaterial;   // additive, depthWrite false, fog off
  emissive(color: ColorLike, intensity = 3): THREE.MeshStandardMaterial;   // black base + emissive (eyes, lamps, strips)
  mechSet(scheme: MechScheme): MechMaterials;
  setFactions(f: Record<string, FactionPalette>): void;   // from LevelDef.factions
  factionSet(id: string): FactionMaterials;               // unknown id → neutral grey set
  applyPalette(p: Partial<Palette>): void;                // retint library materials (level load, zone blends)
  sign(text: string, o?: { font?: string, color?: string, bg?: string, w?: number, h?: number,
                           weathered?: number, stencil?: boolean }): THREE.Texture;   // canvas signage/markings
  dispose(): void;
}
interface StdOpts {
  color: ColorLike; roughness?: number /*0.7*/; metalness?: number /*0.3*/;
  map?: TexName; mapRepeat?: number; bump?: number /*0 = none; uses the map texture as bump*/;
  emissive?: ColorLike; emissiveIntensity?: number; envMapIntensity?: number /*0.6*/;
  flatShading?: boolean; vertexColors?: boolean;
  wear?: number;          // 0..1: object-space triplanar grime/scratch modulation of albedo + roughness (needs no UVs)
  side?: 'front'|'double'; transparent?: boolean; opacity?: number;
}
interface MechScheme { design: string; base: ColorLike; mid: ColorLike; accent: ColorLike; visor: ColorLike;
                       flame?: ColorLike; blade?: ColorLike; dark?: ColorLike; wear?: number; }
interface MechMaterials { base, mid, acc, dark, visor, flame /*glow*/, blade /*glow*/ }
interface FactionPalette { shell: ColorLike; mid?: ColorLike; accent: ColorLike; dark?: ColorLike; eye: ColorLike; wear?: number; }
interface FactionMaterials { shell, mid, accent, dark, eye /*emissive*/, glow /*additive*/ }
```

#### `render/particles.js`

```ts
export class ParticleSystem {
  constructor(ctx, o: { max: number, blending: 'additive'|'alpha' });
  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha = 1, drag = 0, gravity = 0, sprite = 0): void;
      // same argument order as the prototype's Particles.spawn, plus `sprite` (atlas cell: 0 soft dot, 1 streak/billow, 2 flare)
  update(dt): void; clear(): void; readonly alive: number;
}
export function install(ctx): Particles;   // ctx.particles
interface Particles {
  add: ParticleSystem;      // additive: sparks, fire, glows (max = tier.particlesAdd)
  smoke: ParticleSystem;    // alpha: smoke, dust (max = tier.particlesAlpha)
  lights: { flash(pos: Vector3, color: ColorLike, intensity: number, distance: number, duration: number): void,
            readonly count: number };   // pool size = tier.pointLights (0 on Low → flash() becomes an additive sprite burst)
  debris: { spawn(pos: Vector3, n: number, scale = 1, material?: THREE.Material, velScale = 1): void, clear(): void };
            // instanced bevelled chunks; ground via ctx.world.groundHeight; capacity tier.debrisMax
  decals: { spawn(pos: Vector3, normal: Vector3, size: number, kind: 'scorch'|'crater'|'hole'): void, clear(): void };
            // pooled terrain-aligned quads (polygonOffset); capacity tier.maxDecals
  clear(): void;            // the level stop clears everything
  update(dt): void;         // system 'particles' (fx, sim)
}
```

#### `render/fx.js`

```ts
export function install(ctx): Fx;   // ctx.fx
interface Fx {
  sparks(pos: Vector3, n = 10, color: Vec3 = [1, .7, .3], speed = 25): void;
  dust(pos: Vector3, n = 12, spread = 6, color?: Vec3): void;   // default colour = palette dust
  explosion(pos: Vector3, scale = 1, o?: { quiet?: boolean, debris?: number, debrisMaterial?: THREE.Material,
                                           decal?: boolean /*true*/, shake?: boolean /*true*/ }): void;
      // particles + light flash + smoke + shockwave + decal + ctx.cameraRig.addShake + ctx.audio.play('explode'|'boom')
      // + emits 'fx:explosion'
  muzzle(pos: Vector3, dir: Vector3, kind: 'rifle'|'mg'|'shotgun'|'cannon'|'plasma'|'turret'|'rail'): void;
  impact(pos: Vector3, normal: Vector3 | null, kind: 'bullet'|'plasma'|'shell'|'blade'|'rail',
         surface?: 'ground'|'metal'|'concrete'|'rock'): void;
  missileTrail(pos: Vector3, vel: Vector3): void;       // call once per frame per missile
  boost(pos: Vector3, dir: Vector3, color?: ColorLike): void;
  landing(pos: Vector3, scale = 1): void;
  shockwave(pos: Vector3, radius: number, color: ColorLike, duration = 0.5): void;   // pooled ring mesh
  beam(from: Vector3, to: Vector3, color: ColorLike, width = 0.6, duration = 0.15): void;
  emitter(kind: 'smoke'|'fire'|'sparks'|'steam'|'dustDevil', pos: Vector3,
          o?: { rate?: number, scale?: number, color?: Vec3 }): EmitterHandle;   // persistent (burning wrecks, vents)
  ambient(def: AmbientDef): EmitterHandle;   // distant battle flashes/tracers/flak/searchlights + distant audio
  clearEmitters(): void;
  update(dt): void;   // system 'fx' (fx, sim)
}
interface EmitterHandle { pos: Vector3; alive: boolean; set(o: object): void; stop(): void; }
interface AmbientDef { kind: 'battle'|'flak'|'lightning'|'searchlights'|'fires'; at: Pos; radius: number;
                       intensity?: number; color?: ColorLike; }
```

#### `render/weather.js`

```ts
export function install(ctx): Weather;   // ctx.weather
interface Weather {
  current: WeatherParams;
  set(p: Partial<WeatherParams>, blendSeconds = 0): void;
  update(dt): void;   // system 'weather' (fx, always). The volume follows the camera; motion only while sim runs.
}
interface WeatherParams { type: 'clear'|'ash'|'dust'|'rain'|'snow'|'embers'|'sandstorm';
                          intensity: number /*0..1*/; wind: [number, number] /*m/s, x z*/;
                          lightning: number /*0..1 strikes frequency*/; fogBoost: number /*multiplies fog density*/; }
```

#### `audio/audio.js`

```ts
export const SFX: string[];   // every name accepted by play(): see Appendix C.1
export function install(ctx): Audio;   // ctx.audio
interface Audio {
  ready: boolean;
  unlock(): void;               // create/resume the AudioContext; screens and flow call it on every user gesture; idempotent
  setVolumes(v: { master?: number, music?: number, sfx?: number }): void;   // also follows 'settings:changed'
  play(name: string, at?: Vector3 | null, o?: { vol?: number, rate?: number, range?: number /*520*/ }): void;
      // at = null → 2D UI sound; otherwise distance attenuation (prototype curve) + StereoPanner from the camera
  loop(name: 'boost'|'hover'|'wind'|'rain'|'fire'|'alarm'|'engine'|'rumble', o?: { vol?: number }): LoopHandle;
  blip(voice?: VoiceDef): void; // comms typewriter tick
  duck(amount: number, seconds: number): void;
  bus: { master: GainNode, music: GainNode, sfx: GainNode, ambience: GainNode } | null;
  noise: AudioBuffer | null;
  update(dt): void;             // system 'audio' (always). The listener is ctx.camera. Unmuted only when !params.mute.
}
interface LoopHandle { set(p: { vol?: number, rate?: number, cutoff?: number }): void; stop(fadeSeconds = 0.3): void; }
interface VoiceDef { base: number /*Hz*/; wave: OscillatorType; jitter?: number; }
```

#### `audio/music.js`

```ts
export const THEMES: Record<string, ThemeDef>;   // 'menu', 'garage', 'debrief', 'ambient', 'combat' + level-registered
export function install(ctx): Music;   // ctx.music
interface Music {
  setTheme(t: string | ThemeDef, fadeSeconds = 2): void;
  setIntensity(x: number | null): void;   // null → automatic from ctx.enemies.combatIntensity() (prototype behaviour)
  stinger(name: 'objective'|'checkpoint'|'discovery'|'dread'|'victory'|'death'|'boss'): void;
  stop(fadeSeconds = 2): void;
  update(dt): void;                       // system 'music' (audio, always); schedules ahead on AudioContext time
}
interface ThemeDef {
  bpm: number; root: number /*Hz*/; scale: number[] /*semitone offsets*/; progression: number[] /*degree per bar*/;
  layers: { pad?: LayerDef; bass?: LayerDef; pulse?: LayerDef; drums?: LayerDef & { kit: 'industrial'|'tribal'|'sparse' };
            arp?: LayerDef; lead?: LayerDef; };
  intensity?: Record<string, [number, number]>;   // layer → [fade-in intensity, full intensity]
}
interface LayerDef { wave?: OscillatorType; vol: number; cutoff?: number; pattern?: string /*e.g. 'x.x.x..x'*/; octave?: number; }
```

### 4.2 P2: World

#### `world/route.js`

```ts
export class Route {
  constructor(points: Array<[number, number]>, o?: { halfWidth?: number | number[] /*per control point*/,
                                                       tension?: number /*0.5 = centripetal Catmull-Rom*/ });
  readonly length: number;                          // metres
  readonly points: Array<[number, number]>;
  pointAt(s: number, out?: Vector3): Vector3;       // y = 0
  tangentAt(s: number, out?: Vector3): Vector3;     // unit, horizontal, direction of travel
  yawAt(s: number): number;
  halfWidthAt(s: number): number;                   // playable half-width
  toWorld(s: number, l: number, out?: Vector3): Vector3;   // y = 0; l > 0 = right of travel
  closest(x: number, z: number): { s: number, l: number, halfWidth: number, dist: number };   // O(1) via grid
  sample(step: number): Array<{ s: number, x: number, z: number }>;
}
```

#### `world/heightfield.js`

```ts
export class Heightfield {
  constructor(def: TerrainDef, route: Route, stamps: Stamp[], o: { seed: number, tier: TierConfig, sunDir: Vector3 });
  build(onProgress?: (p: number, label: string) => void): Promise<void>;   // yields at least every 50 ms
  readonly bounds: { x0: number, z0: number, x1: number, z1: number };
  heightAt(x, z): number;           // analytic: bicubic macro + detail. Use it for meshes and placement.
  groundHeight(x, z): number;       // collision surface: 2 m tile triangles; exactly matches the 2 m LOD mesh
  normalAt(x, z, out: Vector3): Vector3;
  slopeAt(x, z): number;            // 1 − normal.y
  surfaceAt(x, z): { rock: number, sediment: number, flow: number, height01: number };   // 0..1 weights
  lightAt(x, z): { sun: number, sky: number };   // baked sun visibility and sky AO, 0..1
  raycast(origin: Vector3, dir: Vector3, maxDist: number): number;   // distance to the ground or Infinity
  renderMap(canvas: HTMLCanvasElement, o?: { route?: Route }): void; // shaded relief (tactical map)
  dispose(): void;
}
interface Stamp { x: number; z: number; r: number; falloff: number;
                  mode: 'flatten'|'raise'|'lower'|'crater'; h?: number; noScatter?: boolean; }
                  // flatten: h = absolute target height (default: mean of the base height over the disc)
                  // raise/lower: h = delta in metres; crater: h = depth, with a raised rim
```

#### `world/terrain.js`

```ts
export class TerrainRenderer {
  constructor(ctx, hf: Heightfield, art: LevelArt);
  readonly root: THREE.Group;           // added to ctx.levelRoot
  readonly material: THREE.Material;    // MeshStandardMaterial patched (detail textures, triplanar rock), atmosphere-patched
  update(focus: Vector3, cameraPos: Vector3, budgetMs: number): void;
  prewarm(focus: Vector3, onProgress?: (p: number) => void): Promise<void>;
  settle(): void;                       // build every pending node synchronously (tests)
  setTier(t: TierConfig): void;
  stats(): { nodes: number, pending: number, triangles: number };
  dispose(): void;
}
```

#### `world/collision.js`

```ts
export class Collision {
  constructor(ctx);
  ground: { groundHeight(x: number, z: number): number } | null;   // set by World.load
  add(c: ColliderDef): Collider;
  remove(c: Collider): void;
  box(cx, cz, w, d, top, bottom?, o?: ColliderOpts): Collider;          // axis-aligned
  obox(cx, cz, w, d, yaw, top, bottom?, o?: ColliderOpts): Collider;    // oriented
  circle(x, z, r, top, bottom?, o?: ColliderOpts): Collider;
  groundHeight(x, z): number;                    // 0 with no level
  supportHeight(x, z, y): number;                // highest ground/top under a body at height y (1.6 m step-up)
  resolve(body: { pos: Vector3, vel: Vector3, rad: number, hgt: number }): boolean;   // push out, ceilings; true if touched
  pointInSolid(p: Vector3): boolean;
  segment(a: Vector3, b: Vector3, out?: SegmentHit,
          o?: { ground?: boolean /*true*/, colliders?: boolean /*true*/, radius?: number /*0*/ }): SegmentHit | null;
  lineOfSight(a: Vector3, b: Vector3): boolean;
  near(x, z): Collider[];                        // the hash bucket (32 m cells)
  clear(): void;
  readonly count: number;
}
type ColliderDef = ({ type: 'box', minx: number, maxx: number, minz: number, maxz: number }
                  | { type: 'obox', x: number, z: number, hw: number, hd: number, yaw: number }
                  | { type: 'circle', x: number, z: number, r: number }) & ColliderOpts & { top: number, bottom?: number };
interface ColliderOpts { enabled?: boolean; surface?: 'metal'|'concrete'|'rock'; owner?: any; tag?: string; }
type Collider = ColliderDef & { id: number, enabled: boolean };
interface SegmentHit { t: number /*0..1*/; point: Vector3; normal: Vector3; collider: Collider | null;
                       ground: boolean; surface: string; }
```

#### `world/scatter.js`

```ts
export function registerProp(name: string, factory: (ctx) => PropType): void;   // global registry; P3 registers man-made props
export function propNames(): string[];
export class Scatter {
  constructor(ctx, hf: Heightfield, route: Route, layers: ScatterLayer[], exclusions: Exclusion[],
              o: { seed: number, tier: TierConfig });
  generate(onProgress?): Promise<void>;   // deterministic; positions for the whole level; registers colliders
  update(focus: Vector3): void;           // refill InstancedMeshes from the cells in range
  settle(): void;
  setTier(t: TierConfig): void;
  stats(): { types: number, instances: number, visible: number, colliders: number };
  dispose(): void;
}
interface PropType { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[];
                     castShadow?: boolean; receiveShadow?: boolean;
                     radius: number;   // footprint radius at scale 1
                     height: number; collider?: 'circle'|'box'|null; maxInstances?: number; }
interface Exclusion { x: number; z: number; r: number; }   // keep-out disc (structure footprints, stamps)
```

#### `world/world.js`

```ts
export function install(ctx): World;   // ctx.world; also creates ctx.collision = new Collision(ctx)
interface World {
  def: LevelDef | null;
  route: Route | null; heightfield: Heightfield | null; terrain: TerrainRenderer | null; scatter: Scatter | null;
  focus: Vector3;                       // copied from ctx.cameraRig.focus each frame
  load(def: LevelDef, o?: { onProgress?: (p: number, label: string) => void, spawnAt?: Pos }): Promise<void>;   // §5.1
  unload(): void;                       // dispose everything (also ctx.structures.clear(), ctx.collision.clear())
  groundHeight(x, z): number;           // 0 with no level
  normalAt(x, z, out: Vector3): Vector3;
  surfaceAt(x, z): 'ground'|'rock'|'sediment';
  resolve(p: Pos, out?: Vector3): Vector3;          // §6.2
  resolveYaw(y: YawSpec | undefined, at: Vector3): number;
  playArea(x, z): { inside: boolean, edge: number /*0 well inside → 1 at the hard limit*/, s: number, l: number, halfWidth: number };
  raycast(origin: Vector3, dir: Vector3, maxDist: number): { dist: number, point: Vector3, normal: Vector3,
                                                             ground: boolean, collider: Collider | null } | null;
  settle(): Promise<void>;              // finish all terrain/scatter/structure streaming (tests, after teleport)
  stats(): { terrain: object, scatter: object, colliders: number, structures: number };
  update(dt): void;                     // system 'world' (always)
}
```

### 4.3 P3: Forge (art kit, mechs, units, structures, garage)

#### `art/kit.js`

```ts
export function plateGeo(pts: Array<[number, number]>, depth: number, view: 'side'|'front'|'top', bevel: number): THREE.BufferGeometry;
       // identical semantics to the prototype; cached by key
export function acKit(bevel: number): {   // prototype API: (parent, pts, depth, mat, x, y, z, bevel)
  side(p, pts, d, mat, x?, y?, z?, b?): THREE.Mesh; front(p, pts, d, mat, x?, y?, z?, b?): THREE.Mesh;
  top(p, pts, d, mat, x?, y?, z?, b?): THREE.Mesh;
  ball(p, r, mat, x?, y?, z?): THREE.Mesh; joint(p, r, len, mat, x?, y?, z?, axis?: 'x'|'y'|'z'): THREE.Mesh;
  cells(p, cols, rows, mat, z, w, h, y0?): void;
};
export function bevelBox(w, h, d, bevel = 0.08): THREE.BufferGeometry;      // cached
export function panelBox(w, h, d, o?: { bevel?: number, inset?: number, cols?: number, rows?: number }): THREE.BufferGeometry;
       // bevelled box with real inset panel grooves
export function cylinder(rTop, rBot, h, seg = 12, bevel = 0): THREE.BufferGeometry;
export function pipe(points: Vector3[], radius: number, radial = 8): THREE.BufferGeometry;
export function truss(length, width, height, bays, bar = 0.25): THREE.BufferGeometry;
export function greebles(rng: () => number, w: number, h: number, density: number): THREE.BufferGeometry;   // on local XY, +Z out
export class GeoBuilder {
  add(g: THREE.BufferGeometry, m: THREE.Material, t?: THREE.Matrix4 | { pos?: Vec3, rot?: Vec3, scale?: number | Vec3 }): this;
  addObject(o: THREE.Object3D): this;   // adds every descendant mesh, using its transform relative to `o`
  build(o?: { castShadow?: boolean, receiveShadow?: boolean, name?: string }): THREE.Group;   // one merged Mesh per material
  buildSingle(colorOf: (m: THREE.Material) => THREE.Color): THREE.Mesh;   // one mesh, vertex colours (far LOD)
}
export function bakeRigid(root: THREE.Object3D): THREE.Object3D;
       // Converts a hierarchy of Bone groups with attached plate meshes into one SkinnedMesh per material
       // (rigid weights: skinIndex = owning bone, weight 1). The bone objects keep their names and references,
       // so animation code that rotates bones still works. Sets a generous manual boundingSphere.
```

#### `art/mechs.js`

```ts
export const DESIGNS: Record<string, { name: string, desc: string, build(S: MechSkeleton, M: MechMaterials, K): void }>;
       // 'vanguard', 'striker', 'bastion' ported line for line from AC_DESIGNS; more may be added
export const PART_VISUALS: Record<string, (K, M: MechMaterials, mount: THREE.Object3D) => void>;
       // visual ids used by loadout PARTS[].visual (Appendix C.4)
export function buildMech(ctx, scheme: MechScheme, o?: { parts?: Partial<Record<'R'|'L'|'S'|'U', string>>,
                                                          shadows?: boolean /*true*/, bake?: boolean /*true*/ }): MechRig;
export function animateMech(rig: MechRig, st: MechAnimState, dt: number): void;   // port of animateAC
export function buildMechWreck(ctx, scheme: MechScheme, seed = 1): THREE.Object3D;   // posed, scorched, broken
interface MechSkeleton { pelvis, legs: Array<{ hip, knee, ankle, side: -1|1 }>, torso, head,
                         arms: { L: { sh, el }, R: { sh, el } }, pod }   // Object3D (Bone) refs
interface MechRig extends MechSkeleton {
  root: THREE.Object3D; body: THREE.Object3D;
  muzzle: THREE.Object3D;       // R-arm weapon muzzle
  muzzleL: THREE.Object3D;      // L-arm tip (blade origin / off-hand)
  blade: THREE.Mesh; flames: THREE.Mesh[]; vents: THREE.Mesh[];
  mounts: Record<'R'|'L'|'S'|'U', THREE.Object3D>;
  mats: MechMaterials; scheme: MechScheme; design: string;
  setParts(parts: Partial<Record<'R'|'L'|'S'|'U', string>>): void;
  dispose(): void;
}
interface MechAnimState { fwd: number; lat: number; onGround: boolean; pitch: number; aimYaw?: number;
                          thrust: number; hover: number; landT: number; bladeT?: number; bladeWind?: boolean;
                          recoil?: number; crouch?: number; }
```

#### `art/units.js`

```ts
export const UNIT_MODELS: string[];   // 'drone','tank','tank_heavy','turret','gunship','walker','artillery','apc','dropship','beacon'
export function buildUnit(ctx, kind: string, faction: string | FactionMaterials,
                          o?: { scale?: number, variant?: number }): UnitRig;
export function animateUnit(rig: UnitRig, dt: number, st?: { speed?: number, firing?: boolean, alert?: boolean }): void;
       // rotors, rings, walker gait, tread scroll, eye pulse
interface UnitRig {
  kind: string; root: THREE.Object3D;
  parts: Record<string, THREE.Object3D>;   // the names REQUIRED per kind are in the table below
  muzzles: THREE.Object3D[];               // fire origins (children of turret/head)
  eyes: THREE.Mesh[];
  hit: { center: Vec3, r: number, yScale?: number };   // hit volume in root space
  rad: number; hgt: number;                // body radius and height for collision
  dispose(): void;
}
```

| Model | Required `parts` | `muzzles` |
| --- | --- | --- |
| drone | `body`, `ring` | 1 |
| tank | `chassis`, `turret`, `barrelPivot` | 1 |
| tank_heavy | `chassis`, `turret`, `barrelPivot` | 2 |
| turret | `base`, `head` | 2 |
| gunship | `body`, `rotorL`, `rotorR`, `turret`, `podL`, `podR` | 2 (turret) |
| walker | `body`, `turret`, `leg0`…`leg3` (each with `userData.knee`, `userData.foot`) | 2 |
| artillery | `chassis`, `turret`, `barrelPivot` | 1 |
| apc | `chassis`, `hatch` | 0 |
| dropship | `body`, `bay`, `thrust0`…`thrust3` | 0 |
| beacon | `body`, `spire`, `beam` | 0 |

The draw-call budget per unit is ≤ 8 (§7.5).

#### `art/structures.js`

```ts
export const STRUCTURE_TYPES: string[];   // Appendix C.3
export function install(ctx): Structures;   // ctx.structures; also calls registerProp() for man-made props (Appendix C.2)
interface Structures {
  register(type: string, def: StructureTypeDef): void;   // levels may register custom types
  has(type: string): boolean;
  footprint(type: string, params?: object): Footprint;   // pure
  place(entry: StructureEntry, pos: Vector3, yaw: number): StructureInstance;
      // creates colliders and the combat target now; meshes are realised lazily (§5.7)
  get(id: string): StructureInstance | undefined;
  all(): StructureInstance[];
  settle(focus: Vector3): void;                    // realise everything within the realise distance synchronously
  states(): Record<string, string>;                // id → state, for checkpoint snapshots
  reset(states: Record<string, string>): void;     // restore instantly (checkpoint restart)
  clear(): void;                                   // level unload
  update(dt): void;                                // system 'structures' (world, always): realise/LOD/animate
}
interface StructureEntry {                         // how levels place structures (inside ZoneDef.structures, §6.5)
  id?: string; type: string; at: Pos; yaw?: YawSpec; params?: object;
  state?: string;                                  // initial state (default: the type's first state)
  tag?: string;
  destructible?: { ap: number, name: string, tag?: string, team?: Team /*'enemy'*/, objective?: boolean, impMax?: number };
}
interface Footprint { shape: 'circle'|'rect'; r?: number; w?: number; d?: number;
                      flatten: boolean; pad: number /*flatten falloff, m*/; exclude: number /*extra scatter keep-out, m*/;
                      h?: 'auto'|number; }
interface StructureTypeDef {
  footprint(params): Footprint;
  colliders(params): ColliderDef[];                // local space (x, z about the origin, top/bottom relative to base y)
  anchors?(params): Record<string, Vec3>;          // local; e.g. turret mounts, spawn pads, door centre
  build(ctx, params, rng: () => number, kit: typeof import('./kit.js')): { root: THREE.Object3D, lod?: THREE.Object3D };
  states?: Record<string, (inst: StructureInstance, instant: boolean) => void>;   // 'open', 'closed', 'destroyed', …
  animate?(inst: StructureInstance, dt: number): void;
  hit?(params): { center: Vec3, r: number };       // required when destructible
}
interface StructureInstance {
  id: string; type: string; params: object; pos: Vector3; yaw: number;
  root: THREE.Object3D | null;                     // null until realised
  colliders: Collider[]; anchors: Record<string, Vector3>;   // world space
  state: string; target: Target | null;            // set when entry.destructible
  setState(state: string, o?: { instant?: boolean }): void;   // emits 'structure:state'
  destroy(o?: { instant?: boolean }): void;        // generic collapse (sink + tilt + fx + rubble collider) unless the type overrides 'destroyed'
}
```

#### `ui/garage.js`

```ts
export function install(ctx): Garage;   // ctx.garage
interface Garage {
  readonly isOpen: boolean;
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;   // the hangar bay, also used behind the title screen
  open(o?: { context?: 'title'|'briefing', levelId?: string }): Promise<void>;
      // Renders the editor UI inside #screen; resolves on close. On confirm it calls ctx.save.setLoadout and
      // ctx.player.setLoadout. Refuses to close with an invalid loadout (it shows the errors).
  close(): void;
  showcase(on: boolean): void;            // title background: the mech on the platform, slow orbit, lights
  update(dt): void;                       // system 'garage' (ui, always); no-op unless open or showcasing
}
```

### 4.4 P4: Combat and AI

#### `combat/combat.js`

```ts
export const TEAMS: Team[];
export function isHostile(a: Team, b: Team): boolean;
export function install(ctx): Combat;   // ctx.combat
interface Target {
  id: number; name: string; kind: string; team: Team; tags: Set<string>;
  alive: boolean; targetable: boolean; objective?: boolean; boss?: boolean;
  pos: Vector3; vel: Vector3;
  ap: number; apMax: number; imp: number; impMax: number /*Infinity = never staggers*/;
  stagT: number; stagDur: number; lastHit: number /*sim time*/; invuln: boolean;
  hitR: number;
  center(out: Vector3): Vector3;
  hitTest(p: Vector3): boolean;
  onDamage?(info: DamageInfo): void;
  onDeath?(info: DamageInfo): void;
}
interface DamageInfo { amount: number; imp: number; source?: DamageSource; staggered: boolean; killed: boolean; }
interface DamageSource { team: Team; owner?: Target; kind?: string; pos?: Vector3; }
interface Combat {
  register(t: Target): void;  unregister(t: Target): void;
  all(): Iterable<Target>;
  query(f: { team?: Team, hostileTo?: Team, tag?: string, kind?: string, alive?: boolean /*true*/,
             objective?: boolean, near?: { pos: Vector3, r: number } }): Target[];
  nearestHostile(pos: Vector3, team: Team, maxDist: number, filter?: (t: Target) => boolean): Target | null;
  damage(t: Target, amount: number, imp: number, source?: DamageSource): DamageInfo;
      // prototype rules: bonus while staggered (×1.6 units, ×1.25 player), the stagger gauge, god mode for the player,
      // impact decay handled by actors; emits 'target:damaged'; calls kill() at 0 AP
  radial(pos: Vector3, radius: number, amount: number, imp: number, source?: DamageSource,
         o?: { falloff?: boolean /*true*/, los?: boolean /*false*/ }): number;
  kill(t: Target, source?: DamageSource): void;   // alive=false, onDeath, emits 'target:killed', stats
  god: boolean;
  stats: { kills: number, damageTaken: number, damageDealt: number, shots: number, missiles: number,
           blades: number, kits: number, staggers: number };
  resetStats(): void;
  clear(): void;   // unregister everything except the player
}
```

#### `combat/projectiles.js`

```ts
export function install(ctx): Projectiles;   // ctx.projectiles
type ProjKind = 'bullet'|'ebullet'|'plasma'|'shell'|'missile'|'micro'|'rail'|'mortar'|'flak';
interface ProjectileSpec {
  pos: Vector3; vel: Vector3; team: Team; owner?: Target; kind: ProjKind; dmg: number; imp: number;
  life?: number /*3*/; target?: Target | null; turn?: number; accel?: number; maxSpeed?: number;
  gravity?: number /*0; mortar uses 45*/; splash?: number /*radius m*/; splashDmg?: number;
  onHit?(p: Projectile, hit: { target: Target | null, point: Vector3, normal: Vector3, surface: string }): void;
}
interface Projectile extends ProjectileSpec { alive: boolean; age: number; }
interface Projectiles {
  fire(spec: ProjectileSpec): Projectile;        // copies pos/vel; rendering is an InstancedMesh per kind
  update(dt): void;                              // system 'projectiles' (physics, sim): swept steps ≤ 1.5 m against
                                                 //   hostile targets (ctx.combat) and ctx.collision.segment; fx.impact/explosion
  incoming(target: Target, range = 220): boolean;   // homing hostile missile closing on target (missile alert)
  forEach(cb: (p: Projectile) => void): void;    // AI dodge logic
  clear(): void;
  readonly count: number;
}
```

#### `combat/loadout.js`

```ts
export const SLOTS: Array<'R'|'L'|'S'|'U'>;
export const FRAMES: Record<string, FrameStats>;         // 'vanguard', 'striker', 'bastion' (§8.5)
export const PARTS: Record<string, PartDef>;             // Appendix C.4
export const PAINT_PRESETS: Paint[];
export const DEFAULT_LOADOUT: Loadout;
export function startingUnlocks(): string[];             // part ids unlocked on a new save
export function computeStats(lo: Loadout): LoadoutStats;
export function validate(lo: Loadout, unlocked: Set<string>): { ok: boolean, errors: string[] };
interface Loadout { frame: string; R: string; L: string; S: string; U: string; paint: Paint; }
interface Paint { base: string; mid: string; accent: string; visor: string; flame?: string; blade?: string; }
interface FrameStats { id: string; name: string; desc: string; design: string;
  ap: number; en: number; enRegen: number; enRegenAir: number; speed: number; qbImpulse: number; qbCost: number;
  hoverAccel: number; hoverCost: number; jump: number; impMax: number; load: number; power: number;
  rad: number; hgt: number; hitR: number; }
interface PartDef { id: string; slot: 'R'|'L'|'S'|'U'; name: string; desc: string; weapon: WeaponType;
  weight: number; power: number; visual: string; stats: Record<string, number>;
  unlock: { by: 'start'|'level'|'salvage'|'boss', ref?: string, hint?: string /*spoiler-safe*/ }; }
interface LoadoutStats extends FrameStats { weight: number; powerDraw: number; overweight: boolean; overpower: boolean;
                                            speedMul: number; warnings: string[]; }
type WeaponType = 'rifle'|'mg'|'shotgun'|'cannon'|'blade'|'missiles'|'micromissiles'|'mortar'|'kit';
```

#### `combat/weapons.js`

```ts
export function createWeapon(ctx, part: PartDef, owner: Target & { rig: MechRig }): Weapon;
interface Weapon {
  part: PartDef; slot: 'R'|'L'|'S'|'U';
  ammo: number; ammoMax: number; cd: number;     // seconds of cooldown remaining
  update(dt: number): void;
  trigger(inp: { down: boolean, pressed: boolean }, aim: AimContext): void;   // the player calls this every frame
  readout(): { label: string /*'600' | 'READY' | 'READY · 80' | '3.2'*/, cooling: boolean, empty: boolean };
  refill(): void;
}
interface AimContext { origin: Vector3; point: Vector3; dir: Vector3; lock: Target | null; }
```

#### `actors/player.js`

```ts
export function install(ctx): Player;   // ctx.player (one instance reused across levels; registered with combat while active)
interface Player extends Target {
  active: boolean;                 // false outside levels: update is a no-op and the rig is hidden
  rig: MechRig | null;
  loadout: Loadout; stats: LoadoutStats;
  weapons: Record<'R'|'L'|'S'|'U', Weapon>;
  yaw: number; pitch: number; bodyYaw: number;
  en: number; enMax: number; overheat: number;
  onGround: boolean; thrust: number; hover: number; rad: number; hgt: number;
  lock: Target | null; hardLock: boolean;
  aimPoint: Vector3;
  frozen: boolean;                 // controls disabled (cinematics, choice prompts); physics continue
  setLoadout(lo: Loadout): void;   // rebuild rig + weapons; keeps position
  spawn(pos: Vector3, yaw: number, snap?: PlayerSnapshot): void;   // registers with combat, emits 'player:spawned'
  despawn(): void;
  teleport(pos: Vector3, yaw?: number): void;   // y = supportHeight when pos.y is NaN
  snapshot(): PlayerSnapshot;
  heal(amount: number): void; refill(): void;
  update(dt): void;                // system 'player' (player, sim)
}
interface PlayerSnapshot { ap: number; ammo: Record<'R'|'L'|'S'|'U', number>; }
```

The player reads `ctx.world.playArea()`. When it reports `edge > 0.6` the player gets the warning "LEAVING OPERATIONAL AREA" through `ctx.hud.warn`, and at `edge ≥ 1` the player is pushed back toward the route. The player also enforces a ceiling of 160 m above the ground.

#### `actors/enemy.js`

```ts
export class Unit /* implements Target */ {
  constructor(ctx, o: Partial<Unit>);
  // Target fields, plus:
  rig: UnitRig | MechRig | null; root: THREE.Object3D; faction: string; behavior: Behavior;
  home: Vector3; leash: number; aggroRange: number; asleep: boolean; ai: Record<string, any>; cd: number;
  rad: number; hgt: number; onGround: boolean;
  baseUpdate(dt: number): void;   // stagger timer + sparks, impact decay (prototype), sleep/wake
  update(dt: number): void;       // kind-specific (override)
  despawn(): void;
}
export function install(ctx): Enemies;   // ctx.enemies
interface Enemies {
  register(kind: string, factory: (ctx, pos: Vector3, o: SpawnOpts) => Unit): void;
  kinds(): string[];
  spawn(kind: string, pos: Vector3, o?: SpawnOpts): Unit;   // unknown kind → console.error + placeholder unit
  all(): Unit[];
  alive(f?: { tag?: string, team?: Team, kind?: string }): Unit[];
  count(f?: { tag?: string, team?: Team, kind?: string }): number;
  killAll(f?: { tag?: string, team?: Team, kind?: string }): number;   // default team 'enemy'
  despawn(u: Unit): void;
  clear(): void;
  prewarm(kinds: string[]): void; // build one hidden instance of each kind's model (shader warmup); removed after 'level:ready'
  combatIntensity(): number;      // 0..1.3: hostile mech within 300 m → 1.3, any hostile → 1 (prototype)
  activeRadius: number;           // 700 m: beyond this units sleep (no AI) but stay visible
  update(dt): void;               // system 'enemies' (ai, sim)
}
interface SpawnOpts {
  team?: Team /*'enemy'*/; faction?: string; yaw?: number; name?: string; tag?: string; tags?: string[];
  ap?: number; behavior?: Behavior; patrol?: Vector3[]; leash?: number; aggroRange?: number;
  drop?: boolean;           // arrives from 140 m up (prototype)
  objective?: boolean; boss?: boolean; targetable?: boolean;
  config?: Record<string, any>;   // kind-specific (e.g. mech: MechConfig)
  onDeath?(u: Unit): void;
}
type Behavior = 'assault'|'hold'|'guard'|'patrol'|'flank'|'sniper'|'escort'|'scripted';
```

#### `actors/enemytypes.js` and `actors/mechai.js`

```ts
// enemytypes.js
export function install(ctx): void;   // registers the kinds 'drone','tank','tank_heavy','turret','gunship','walker',
                                       // 'artillery','apc','beacon','dropship' with ctx.enemies (models from art/units.js)
// mechai.js
export function install(ctx): void;   // registers the kind 'mech'
interface MechConfig {
  scheme?: MechScheme; faction?: string; design?: string;   // the scheme wins, then the faction colours on the design
  weapons?: Array<'rifle'|'mg'|'shotgun'|'missiles'|'blade'|'shock'|'cannon'>;   // default: rifle, missiles, blade
  ap?: number; impMax?: number; aggression?: number /*1*/;
  rifleDmg?: number; bladeDmg?: number;
  phases?: Array<{ at: number /*AP fraction*/, aggression?: number, add?: string[] /*abilities*/ }>;
  dodge?: number /*0..1, qb dodge chance multiplier*/; preferRange?: number /*72*/;
  follow?: 'player' | null;   // ally escort mode
}
```

Required kinds and their prototype origin: drone (makeDrone), tank and tank_heavy (makeTank), turret (makeTurret), beacon (makeBeacon), mech (makeAC). New kinds: gunship (hovering, strafes, rocket pods), walker (slow quadruped, heavy cannon, stomps), artillery (long-range mortar arcs with ground warning decals), apc (drives in, deploys drones), dropship (scripted transport: flies a path, hovers, deploys a group, leaves; usually `targetable: false`). Allies (`team: 'ally'`) use the same kinds and target the nearest hostile. Every kind MUST use `ctx.timers` instead of `setTimeout`.

### 4.5 P5: Mission and Interface

#### `mission/mission.js`

```ts
export function install(ctx): Mission;   // ctx.mission
export function validateLevel(def: LevelDef, ctx): string[];   // static checks: ids, references, action/condition names
interface Mission {
  def: LevelDef | null;
  checkpoint: string | null;
  readonly elapsed: number;              // mission seconds (sim)
  flags: Record<string, any>;
  start(def: LevelDef, checkpointId?: string, snap?: CheckpointState): void;   // §6.9; the world is already loaded
  restart(): void;                       // current checkpoint, world kept (fast path)
  stop(): void;                          // clear units, projectiles, fx, timers, triggers, markers, comms
  run(actions: Action[]): Promise<void>;
  registerAction(name: string, fn: (args: any, m: Mission, ctx) => void | Promise<void>): void;
  registerCondition(name: string, fn: (args: any, m: Mission, ctx) => boolean): void;
  check(c: Condition): boolean;
  objective(id: string): ObjectiveState | undefined;
  objectives(): ObjectiveState[];
  fire(triggerId: string): void;
  setFlag(k: string, v: any, persist?: boolean): void;   // persist → ctx.save.setFlag
  reachCheckpoint(id: string): void;
  snapshot(): CheckpointState;
  complete(): void;
  fail(reason: string): void;
  update(dt): void;                      // system 'mission' (mission, sim)
}
interface ObjectiveState { id: string; text: string; state: 'hidden'|'active'|'done'|'failed';
                           progress?: { cur: number, max: number }; optional?: boolean; timer?: number; }
```

#### `mission/cinematics.js`

```ts
export function install(ctx): Cinematics;   // ctx.cinematics
interface Cinematics {
  active: boolean;
  play(shot: CinematicDef | string): Promise<void>;   // a string is a key in def.cinematics
  skip(): void;                                         // SKIP held 0.6 s (or the touch skip button) during skippable shots
  flyby(def: FlybyDef): { stop(): void, done: Promise<void> };
  barrage(def: { at: Pos, radius: number, count: number, duration: number, scale?: number, damage?: number,
                 warn?: boolean /*ground warning decals first*/ }): Promise<void>;
  update(dt): void;                                     // system 'cinematics' (mission, sim, order 10)
}
```

#### `ui/hud.js`

```ts
export function install(ctx): Hud;   // ctx.hud
interface Hud {
  show(on: boolean): void;
  setMission(title: string, sub?: string): void;
  setObjectives(list: ObjectiveState[]): void;        // full replace; renders active + done, hides 'hidden'
  hint(text: string | { desktop: string, touch: string }, seconds = 7): void;
  warn(text: string, seconds = 2, soft = false): void;
  killfeed(text: string): void;
  hitmark(): void;
  hurt(amount: number): void;                          // red vignette + pipeline.grade.hurt
  zoneCard(title: string, sub?: string): void;
  checkpointToast(label: string): void;
  setMarkers(list: MarkerDef[]): void;                 // full replace
  progress(label: string | null, frac?: number): void;
  prompt(text: string | null): void;                   // the interaction prompt ([F] / touch INTERACT)
  choice(def: { title: string, options: Array<{ key: string, label: string }>, seconds?: number } | null): Promise<string | null>;
       // option 0 = INTERACT (F), option 1 = ALT (G), plus tap; resolves with the option key, or null on timeout
  bossBar(t: Target | null, title?: string): void;
  setCallsign(name: string, sub?: string, frame?: string): void;
  glitch(level: number): void;
  letterbox(on: boolean, seconds = 0.6): void;         // DOM bars (every tier)
  fade(to: number, seconds = 1): Promise<void>;        // #fade
  update(dt): void;   // system 'hud' (ui, always): AP/EN/stagger, weapons readouts and touch labels, lock box, markers,
                      // compass, radar, missile alert, low-AP warning, vignette (reads ctx.player/enemies/combat/cameraRig)
}
interface MarkerDef { id: string; pos: Vector3 | (() => Vector3 | null); label: string;
                      kind?: 'objective'|'waypoint'|'poi'|'ally'|'threat'; }
```

#### `ui/comms.js`

```ts
export function install(ctx): Comms;   // ctx.comms
interface Comms {
  defineSpeakers(map: Record<string, SpeakerDef>): void;   // merged; level load calls it
  say(who: string, text: string, o?: { hold?: number, priority?: 'normal'|'high' }): Promise<void>;
       // queued; 'high' interrupts the current line. Resolves after typing + hold (prototype: 42 chars/s × commsSpeed,
       // hold = 1.4 + 0.032 × length). Emits 'comms:line'. Plays ctx.audio.blip(voice) while typing.
  play(lines: CommsLine[]): Promise<void>;                  // resolves when the last line finishes
  clear(): void;
  readonly busy: boolean;
  readonly current: { who: string, text: string } | null;
  log: Array<{ who: string, name: string, text: string, t: number }>;   // pause-menu comms log
  update(dt): void;                                         // system 'comms' (ui, sim)
}
interface SpeakerDef { name: string; color: string /*CSS*/; voice?: VoiceDef; style?: 'radio'|'system'|'intercept'|'internal'; }
type CommsLine = { who: string, text: string, hold?: number } | { wait: number };
```

#### `ui/screens.js`

Screens are a view layer. Each `show*` renders into `#screen` and resolves with the player's choice. Flow decides what happens next.

```ts
export function install(ctx): Screens;   // ctx.screens
interface Screens {
  readonly current: string | null;
  hide(): void;
  showTitle(m: { canContinue: boolean, continueLabel?: string }): Promise<'continue'|'new'|'select'|'garage'|'settings'|'credits'>;
  showLevelSelect(m: { levels: Array<{ id, title, subtitle?, unlocked, completed, bestTime?, bestRank? }> }): Promise<string | 'back'>;
  showBriefing(m: { level: LevelDef }): Promise<'start'|'garage'|'back'>;        // types def.briefing (prototype .doc style)
  showLoading(m: { title: string, tip?: string }): { set(p: number, label?: string): void, close(): void };
  showPause(m: { title: string, objectives: ObjectiveState[], commsLog: Comms['log'], drawMap?: (c: HTMLCanvasElement) => void })
    : Promise<'resume'|'restart'|'settings'|'quit'>;
  showSettings(): Promise<void>;                                                   // writes ctx.settings live
  showDeath(m: { line: string, hasCheckpoint: boolean }): Promise<'retry'|'quit'>;
  showDebrief(m: { level: LevelDef, result: LevelResult, unlocks: string[] }): Promise<'next'|'garage'|'quit'>;
  showInterstitial(pages: InterstitialPage[], o?: { skippable?: boolean }): Promise<void>;
  showCredits(m: { lines: string[] }): Promise<void>;
}
interface InterstitialPage { title?: string; text: string; style?: 'black'|'paper'|'terminal'; hold?: number; }
```

#### `ui/flow.js` (state machine: §8)

```ts
export function install(ctx): Flow;   // ctx.flow
type FlowState = 'boot'|'title'|'levelSelect'|'briefing'|'garage'|'settings'|'loading'|'interstitial'
               |'playing'|'paused'|'dead'|'complete'|'debrief'|'credits';
interface Flow {
  readonly state: FlowState;
  readonly levelId: string | null;
  boot(): Promise<void>;                                     // title, or a direct start (?level=…&cp=…)
  toTitle(): Promise<void>;
  startLevel(level: string | LevelDef, checkpointId?: string,
             o?: { skipIntro?: boolean }): Promise<void>;   // loading → playing (§8.2); the briefing comes before this call
  restartCheckpoint(): Promise<void>;
  pause(): void; resume(): void;
  interstitial(pages: InterstitialPage[]): Promise<void>;   // mid-level text screen: sim stops, then returns to 'playing'
  quitToTitle(): Promise<void>;
}
```

### 4.6 P6: Level registry (`levels/index.js`)

```ts
export const LEVELS: Array<{ id: string, title: string /*spoiler-safe public title*/, file: string /*relative to levels/*/,
                             order: number, hidden?: boolean /*dev-only, e.g. 'test'*/ }>;
export function loadLevel(id: string): Promise<LevelDef>;   // dynamic import(`./${file}`) → default export
export function nextLevel(id: string): string | null;
```

P0 seeds `LEVELS` with `{ id: 'test', file: 'test.js', hidden: true }` and `{ id: 'l01', file: 'level01.js' }`. P6 owns the file afterwards and MUST keep the `test` entry.

---

## 5. Big maps

### 5.1 World load sequence (`World.load`, P2)

Flow calls `ctx.atmosphere.apply(def.art)` and `ctx.materials.applyPalette(def.art.palette)` first. World.load then runs these steps in order, reporting progress to the loading screen and through `level:loading`:

1. **Route.** `new Route(def.route.points, { halfWidth: def.route.halfWidth })`.
2. **Stamps.** Combine `def.terrain.stamps` with one stamp per structure entry whose `ctx.structures.footprint(type, params).flatten` is true. The stamp is a flatten disc of radius `r`, or `max(w, d)/2 × 1.1` for rectangles, with falloff `pad`.
3. **Heightfield.** Build it with `new Heightfield(def.terrain, route, stamps, { seed, tier, sunDir: ctx.atmosphere.sunDir }).build()`, then set `ctx.collision.ground = heightfield`.
4. **Structures.** For each zone and each structure entry: `ctx.structures.place(entry, resolve(entry.at), resolveYaw(entry.yaw))`. Colliders and destructible targets exist from this point.
5. **Scatter.** `new Scatter(...).generate()`, with exclusions taken from structure footprints (plus `exclude`) and `noScatter` stamps. Layers with `avoidRoute` also exclude the route bed.
6. **Terrain prewarm.** Build the terrain around the spawn point, given by `spawnAt` or else the first checkpoint.
7. **Settle.** `ctx.structures.settle(spawn)` and `scatter.update(spawn)`.

Load-time targets: ≤ 6 s on a desktop and ≤ 15 s on a phone (Low), for a 5 km level. The heightfield build uses at most 60% of that.

### 5.2 Extents

- **Route.** A Catmull-Rom spline through `def.route.points`, 3 to 5 km long.
- **Play corridor.** Points with |l| ≤ `halfWidthAt(s)` (300 to 750 m) are playable. The player is warned at 85% of the half-width and pushed back at 100%. The terrain makes the limit physical too: canyon walls rise from 85% outward (§5.3, step 4).
- **Generated bounds.** `def.terrain.bounds`. The default is the route's bounding box grown by `maxHalfWidth + 1500 m`. Beyond the bounds nothing is generated. The sky's ridge layer and fog hide the edge (§5.8).
- Coordinates stay within ±6 km of the origin, so no origin rebasing is needed (float32 precision there is under 1 mm).

### 5.3 Heightfield generation (`world/heightfield.js`)

The heightfield is a **macro grid** of `macroCell` metres (default 8 m) over the bounds. That is about 560k cells for 8 × 4.5 km, or 2.2 MB as Float32. It is built in these steps:

1. **Base relief.** Domain-warped fBm: `amp · fbm(warp(p)/scale)`, mixed with `ridged · ridgedFbm` for sharp crests. Optional `terrace` stepping. All parameters come from `TerrainDef.base`.
2. **Macro features.** Optional `features[]` from the level, each a large analytic shape: `mesa`, `ridge` (a line segment), `basin`, `crater`, or `spire_field`.
3. **Route bed profile.** Sample the base height along the route every 8 m. Smooth it with a moving average of `carve.smooth` metres, then clamp the grade to `carve.maxGrade` (default 8%) with a forward and a backward pass, and subtract `carve.depth`.
4. **Corridor shaping.** For each cell, `(s, l) = route.closest(x, z)` and `d = |l| / halfWidth(s)`.
   - Walls: `H += walls.height · smooth(walls.start, 1.2, d) · (0.75 + 0.5·noise)`.
   - Bed: `H = lerp(H, bed(s), carve.strength · (1 − smooth(carve.bedWidth/2, carve.bedWidth/2 + carve.shoulder, |l|)))`.
   - The route is therefore always traversable, while the rest of the corridor keeps hills, ridges and gullies.
5. **Hydraulic erosion.** Droplet erosion in the style of Lague, seeded. Droplets start only inside the corridor plus a 600 m margin, where terrain is seen up close. There are `erosion.droplets × tier.erosionScale` droplets (aim for about 0.6 per macro cell in that region), with inertia 0.05, capacity 4, erosion 0.3, deposition 0.3, evaporation 0.01, gravity 4, at most 48 steps and a brush radius of 2 cells. Droplet visits accumulate a **flow map**. Then `erosion.thermal` passes of talus relaxation run at a 35° angle of repose.
6. **Re-carve and stamps.** Re-apply the bed at 50% strength so the route stays clean. Then apply stamps in order: flatten to the target height with smoothstep falloff, raise, lower, crater.
7. **Bakes**, per macro cell:
   - slope;
   - flow, normalised with a log scale (sediment and wetness);
   - sky AO: horizon scan in 8 directions, 6 steps at 16 to 96 m;
   - sun visibility: march toward `sunDir` up to 600 m, with a soft minimum clearance angle.
8. **Detail.** `heightAt(x, z) = bicubic(macro) + detail.amp · fbm3(x/detail.scale) · mask`, where `mask` fades the detail out on stamps and the route bed and boosts it on slopes.

Erosion and the bakes iterate over typed arrays, so they could later move to a Worker. The first build runs everything on the main thread inside `build()` and yields every 50 ms.

### 5.4 Terrain rendering and streaming (`world/terrain.js`)

The terrain is a **quadtree of fixed-resolution nodes**.

- Root nodes are 1024 m squares tiling the bounds. Every node has `tier.terrainSegments` (64 on High/Medium, 32 on Low) segments per side, so node sizes are 1024, 512, 256 and 128 m. On High/Medium the vertex spacing is 16, 8, 4 and 2 m.
- **Selection** runs each frame from `cameraPos`. A node splits while `distance(cameraPos, nodeAABB) < tier.terrainSplit × nodeSize` and `nodeSize > 128`. Cracks between levels are hidden with **skirts**: an edge strip hanging down `max(4 m, 1.5 × spacing)`.
- **Streaming.** Nodes that need geometry go into a priority queue, nearest first. `update()` builds nodes until `budgetMs` (`tier.terrainBuildMs`) is spent. A parent stays visible until all four of its children are built, and children stay until their parent is ready, so there are never holes. Nodes beyond the view distance are released into a **pool of reusable BufferGeometries**. All nodes share a vertex count, so they share one index buffer and their attribute arrays are reused.
- **Vertex data.** Position, normal (central differences of `heightAt`, so seams are consistent across nodes) and colour (`Uint8` normalised RGB). The colour is the palette blend: ground, rock by slope, sediment by flow, a high-altitude colour, wet darkening, macro noise variation, all multiplied by baked lighting (`sky AO × (0.55 + 0.45 × sun)`). No UV attribute is needed.
- **Material.** A `MeshStandardMaterial` with vertex colours and `roughness 0.95`, patched in `onBeforeCompile`. The patch samples world-space `grain` at two scales (1/9 m and 1/180 m) to break tiling, adds **triplanar** `rock` on steep slopes, and perturbs the normal from those samples. It goes through `ctx.atmosphere.patchMaterial`.
- **Shadows.** Terrain receives shadows. It casts them only on High, and only nodes inside the shadow box. Distant terrain relies on the baked sun visibility.
- Terrain draw calls are typically 40 to 80 nodes.

### 5.5 Collision ground

`groundHeight(x, z)` triangulates a **2 m tile grid**: 128 m tiles of 65×65 samples of `heightAt`, using the same diagonal as the 2 m mesh nodes. Tiles are generated **synchronously on first request** (about 2 ms) and kept in an LRU of 512 tiles. Collision is therefore identical on every tier and never depends on streaming. On Low, where the closest visual mesh has 4 m spacing, a small visual mismatch is accepted. The detail noise is kept under ±0.4 m at wavelengths below 8 m to keep that mismatch small.

### 5.6 Determinism

Everything that affects gameplay is generated deterministically **at load time** or synchronously on demand: heightfield, collision tiles, structure colliders, scatter positions and prop colliders. Streaming only decides which meshes are drawn, so `step()` produces the same results however fast the machine is.

### 5.7 Structures on a big map (`art/structures.js`)

- `place()` creates colliders, anchors and the destructible target right away. It builds **no meshes**.
- **Realise.** The `structures` system builds meshes for instances within `tier.viewDistance + 200 m` of the focus, at most one per frame (the nearest first), and frees them beyond 1.5× that distance. Geometry is cached by `type + JSON(params)`, so repeated walls and containers share buffers. A type may group identical instances into an `InstancedMesh`.
- **LOD.** Each realised structure is a `THREE.LOD`. Level 0 is the full bevelled merge, one mesh per material, ≤ 6 draw calls. Level 1, beyond `tier.structureLodDist`, is a single vertex-coloured mesh from `GeoBuilder.buildSingle`, 1 draw call. Past the view distance the structure is hidden.
- **State.** The state (`'open'`, `'destroyed'`, …) lives on the instance whether or not it is realised. Realising applies the current state instantly.

### 5.8 View distance, fog and the far edge

| Tier | `viewDistance` | `camera.far` | Fog fade starts and ends |
| --- | --- | --- | --- |
| High | 2600 m | 3380 m | 1820 to 2550 m |
| Medium | 1800 m | 2340 m | 1260 to 1760 m |
| Low | 1100 m | 1430 m | 770 to 1080 m |

`atmosphere.patchMaterial` replaces three's fog fragment with three parts:

- **exponential height fog**: density `uFogDensity × exp(−falloff × (y − base))`, integrated analytically along the view ray;
- **sun inscatter**: the fog colour blends toward `uFogSunColor` by `pow(max(dot(viewDir, sunDir), 0), 8) × inscatter`;
- **far fade**: `fog = max(fog, smoothstep(uFogFarStart, uFogFarEnd, dist))`. This guarantees that every surface reaches pure fog colour before the camera's far plane.

It needs a world-position varying. The vertex patch computes it from `mvPosition` as `(mvPosition.xyz − viewMatrix[3].xyz) * mat3(viewMatrix)`, so no extra uniforms are needed and instancing works. The fragment side uses the built-in `cameraPosition` uniform. Particles and custom shaders use the same uniforms through `fogUniforms`.

The **sky dome** horizon colour equals the fog colour. Its shader draws two procedural **ridge silhouette bands** just above the horizon (`art.sky.ridges`), so wherever the terrain's far edge fades out, a mountain line seems to continue beyond it. **Skyline objects** (`art.skyline`: towers, tethers, megastructures, smoke columns, a storm wall) are placed at `min(dist, camera.far × 0.9)` with their scale reduced to keep the angular size, drawn with a far-fog tint, `fog: false` and cheap materials.

### 5.9 Prop scatter (`world/scatter.js`)

- Each **layer** (§6.4) names a prop type, a density per hectare, scale range, slope range, height range, surface mask, route-distance band, normal alignment, sink, clustering, collision and shadows.
- **Generation** happens at load for the whole level. A jittered grid sized from the density uses the layer seed, rejects positions by the rules and exclusions, and stores the instances in 64 m cells: position, yaw, scale and tilt packed into a Float32Array. Instances with `scale ≥ layer.collideMinScale` register a circle collider (`radius × scale × 0.85`, top = ground + height × scale × 0.7).
- **Rendering.** There is one `InstancedMesh` per prop type. Its capacity is `maxInstances`, or a size derived from density × the visible area. `update(focus)` runs every 0.25 s or after 8 m of movement. It collects the cells within `layer.maxDist × tier.scatterDistance` and copies their matrices in. The bounding sphere is reset whenever the instance set changes. Small props never cast shadows. Large rocks cast on High/Medium within the shadow box.
- **Ground cover** (pebbles, grass tufts, scrub) is a layer with `maxDist ≤ 150 m` and no collider, and it only exists when `tier.groundCover` is true.
- **Natural prop types (P2)**: `rock_small`, `rock_medium`, `rock_large`, `boulder`, `spire`, `slab`, `pebbles`, `scrub`, `grass_tuft`, `dead_tree`, `stump`. Rocks are displaced icosahedra (detail 2, seeded noise, partly faceted normals). Each type has 3 seeded variants (`rock_small` is `rock_small#0..2`, chosen per instance). **Man-made prop types (P3)** are in Appendix C.2.

### 5.10 Collision (`world/collision.js`)

Colliders are **2.5D prisms**: a footprint (axis-aligned box, oriented box or circle) between `bottom` and `top`. This is the prototype's model extended with oriented boxes. A collider with a bottom supports overpasses, roofs and bridges, which bodies can walk on or pass under.

- Spatial hash: 32 m cells, colliders inserted into every cell their footprint plus 5 m overlaps.
- `supportHeight`, `resolve` and `pointInSolid` keep the prototype semantics: step-up of 1.6 m, ceilings, push-out by the shortest axis.
- `segment(a, b)` sweeps against colliders using slab tests per hash cell along the segment (a 2D DDA), and against the ground by marching ≤ 4 m steps and bisecting. It returns the nearest hit. It is used by projectiles, the camera, line of sight and the aim ray.
- Body vs body (unit vs unit, unit vs player) separation is not in collision. Actors handle it (§4.4).

### 5.11 Zones along the route

A zone is a range `[s0, s1]` along the route with a name, art overrides, structures, scatter extras and `onEnter` actions (§6.5). The mission tracks the player's `s` from `world.playArea()`. It enters a zone when `s` crosses `s0 + 10` and leaves when it crosses back by 10 m (hysteresis). On entering, it:

1. shows a zone card if `zone.card` is set;
2. blends `zone.art` over `zone.artBlend` seconds (default 6);
3. sets the music theme if `zone.music` is set;
4. runs `onEnter` (once per zone unless `repeat: true`).

Zones don't gate streaming: streaming is distance-based. Zones organise authoring, art and checkpoints.

### 5.12 Memory targets

| Tier | JS heap | GPU |
| --- | --- | --- |
| High | ≤ 450 MB | ≤ 1.2 GB |
| Low | ≤ 220 MB | ≤ 400 MB |

The heightfield arrays take about 10 MB, collision tiles about 9 MB, the geometry pools ≤ 120 MB (High), and structure geometry caches ≤ 150 MB (High).

---

## 6. Level definition format

A level is a JS module whose **default export** is a plain object (`LevelDef`). It is declarative. Functions are allowed only in `custom` (§6.14) and in actions registered from it. Everything the runtime needs is data that `validateLevel()` can check.

### 6.1 Top-level shape

```ts
interface LevelDef {
  id: string;                     // 'l01'
  title: string; subtitle?: string;   // public titles (spoiler-safe; shown on level select and briefing)
  order: number;
  seed: number;
  par?: { time: number /*s*/, damage: number /*AP*/ };   // for ranks
  briefing: { header?: string, title: string, subtitle?: string, body: string,
              objectives: string[], fine?: string, showMap?: boolean };
  intro?: InterstitialPage[];     // shown after loading, fresh starts only
  outro?: InterstitialPage[];     // shown after the debrief
  unlocks?: { levels?: string[], parts?: string[] };
  speakers: Record<string, SpeakerDef>;
  factions: Record<string, FactionPalette>;
  music?: { theme: string | ThemeDef, combat?: string | ThemeDef };
  route: RouteDef;
  terrain: TerrainDef;
  art: LevelArt;
  zones: ZoneDef[];
  checkpoints: CheckpointDef[];   // the first one is the level start
  objectives: ObjectiveDef[];
  encounters: EncounterDef[];
  triggers: TriggerDef[];
  events?: Record<string, Action[]>;           // named reusable action lists
  cinematics?: Record<string, CinematicDef>;
  comms?: Record<string, CommsLine[]>;         // named comms scripts
  collectibles?: CollectibleDef[];
  start: Action[];                             // run on a fresh start (checkpoint 0)
  onCheckpoint?: Record<string, Action[]>;     // run when restarting from that checkpoint
  complete?: { when: Condition, do?: Action[] };   // or call { complete: true } from any action list
  custom?: { install?(ctx, mission): void };  // level-only code hook (§6.14)
}
```

### 6.2 Positions and yaw

```ts
type Pos = [number, number]                      // [x, z] on the ground
         | { x: number, z: number, h?: number }  // h = metres above ground (default 0)
         | { x: number, z: number, y: number }   // absolute y
         | { s: number, l?: number, h?: number } // route-relative: s along, l lateral (+ right), h above ground
type YawSpec = number /*radians*/ | 'route' /*face along travel*/ | 'reverse' | { face: Pos } | { azimuth: number /*deg*/ };
```

`ctx.world.resolve(pos)` returns a `Vector3` with `y = groundHeight + h`, or the absolute `y`. All positions in a `LevelDef` accept `Pos`, so authors can place almost everything relative to the route (`{ s: 1200, l: -40 }`) and it survives any later re-shaping of the route.

### 6.3 Route and terrain

```ts
interface RouteDef { points: Array<[number, number]>; halfWidth: number | number[]; }   // per control point if an array
interface TerrainDef {
  bounds?: [number, number, number, number];        // x0, z0, x1, z1; default from the route (§5.2)
  macroCell?: number;                               // 8
  base: { scale: number /*m, ≈ 900*/, amp: number /*≈ 120*/, octaves?: number /*6*/, ridged?: number /*0..1*/,
          warp?: number /*m*/, terrace?: { step: number, strength: number } };
  features?: Array<{ kind: 'mesa'|'ridge'|'basin'|'crater'|'spire_field', at: Pos, to?: Pos /*ridge end*/,
                     r: number, h: number, sharpness?: number }>;
  detail?: { scale: number /*≈ 22*/, amp: number /*≈ 1.6*/ };
  walls?: { height: number /*≈ 260*/, start?: number /*0.85*/, noise?: number /*0.3*/ };
  carve?: { depth?: number /*4*/, bedWidth?: number /*60*/, shoulder?: number /*80*/, smooth?: number /*160*/,
            maxGrade?: number /*0.08*/, strength?: number /*1*/ };
  erosion?: { droplets?: number /*120000*/, thermal?: number /*2*/ };
  stamps?: Array<{ at: Pos, r: number, falloff?: number /*30*/, mode: Stamp['mode'], h?: number, noScatter?: boolean }>;
}
```

### 6.4 Art (`LevelArt`)

Every field is optional and merged over `DEFAULT_ART`. Zones and the `art` action use the same shape for partial overrides.

```ts
interface LevelArt {
  palette: { ground, rock, sediment, high, dust, wet, concrete, rust, accent: string /*CSS hex*/ };
  toneMapping?: 'aces'|'agx'|'neutral';
  sky: { top, mid, horizon: string;               // horizon is also the fog colour unless fog.color is set
         sun: { azimuth: number, elevation: number /*deg*/, color: string, size?: number, glow?: number };
         clouds?: { cover: number /*0..1*/, color?: string, speed?: number };
         stars?: number; moon?: { azimuth: number, elevation: number, size: number, color: string };
         ridges?: { height: number /*deg above horizon*/, color?: string, layers?: number }; };
  fog: { color?: string; density: number /*≈ 0.0015*/; heightFalloff?: number /*0.012*/; heightBase?: number /*0*/;
         inscatter?: number /*0.6*/; sunColor?: string; };
  light: { sun: number /*≈ 6.5*/; sunColor?: string; hemiSky?: string; hemiGround?: string; hemi: number /*≈ 1.7*/;
           rim?: number /*≈ 2.8*/; rimColor?: string; exposure?: number /*1*/; env?: number /*envMapIntensity scale*/; };
  grade?: Partial<GradeState>;
  bloom?: { strength?: number /*0.85*/, radius?: number /*0.6*/, threshold?: number /*0.85*/ };
  weather?: Partial<WeatherParams>;
  skyline?: Array<{ kind: 'tower'|'tether'|'spire'|'megastructure'|'smoke'|'storm_wall'|'wreck'|'custom',
                    at: Pos | { azimuth: number, dist: number }, size: number, color?: string, custom?: string }>;
  ambience?: AmbientDef[];
  scatter?: ScatterLayer[];
}
interface ScatterLayer {
  prop: string;                 // prop type name (§5.9, Appendix C.2)
  density: number;              // instances per hectare
  scale?: [number, number]; slope?: [number, number] /*0..1*/; height?: [number, number] /*m*/;
  surface?: 'any'|'rock'|'sediment'|'flat';
  routeBand?: [number, number]; // allowed |l| range, m
  avoidRoute?: boolean; align?: number /*0..1 normal alignment*/; sink?: number /*fraction of scale*/;
  cluster?: { size: number /*m*/, count: number };
  maxDist?: number /*m, × tier.scatterDistance*/;
  collide?: boolean; collideMinScale?: number; castShadow?: boolean;
  range?: [number, number];     // limit to this s range (zones use it)
  seed?: number;
}
```

### 6.5 Zones

```ts
interface ZoneDef {
  id: string; range: [number, number] /*s0, s1*/;
  name?: string; card?: { title: string, sub?: string };    // the zone card on entering
  art?: Partial<LevelArt>; artBlend?: number;
  music?: string | ThemeDef;
  structures?: StructureEntry[];   // §4.3. `at` is a Pos; `yaw` a YawSpec; `id` is required if anything refers to it
  scatter?: ScatterLayer[];        // extra layers, automatically limited to `range`
  onEnter?: Action[]; repeat?: boolean;
}
```

### 6.6 Encounters

```ts
interface EncounterDef {
  id: string;
  tag?: string;                    // every unit also gets the tag `enc:<id>`
  units: UnitGroup[];
  waves?: Array<{ units: UnitGroup[], when: 'cleared' | { delay: number } | { remaining: number } }>;
  onCleared?: Action[];
  persist?: boolean;               // cleared state survives checkpoints (default true)
}
interface UnitGroup {
  kind: string;                    // enemy kind (§4.4)
  count?: number /*1*/;
  at: Pos; spread?: number /*m radius*/;
  opts?: Omit<SpawnOpts, 'tag'|'tags'> & { tags?: string[] };   // e.g. { team: 'ally', behavior: 'hold', drop: true }
  via?: { dropship: { from: Pos, h?: number } };   // arrive by dropship flyby instead of spawning in place
}
```

An encounter starts through the action `{ spawn: 'e_id' }`, usually fired by a trigger. It is **cleared** when every unit with `enc:<id>` is dead after its last wave.

### 6.7 Triggers and conditions

```ts
interface TriggerDef { id: string; when: Condition; do: Action[]; once?: boolean /*true*/; enabled?: boolean /*true*/;
                       after?: string /*only armed after this trigger fired*/; }
type Condition =
  | { enter: { at: Pos, r: number } }               // the player within r (2D)
  | { enterZone: string }
  | { pass: number }                                // player s ≥ value
  | { cleared: string }                             // encounter cleared
  | { killed: { tag: string, count?: number } }     // tagged targets dead (all, or at least count)
  | { alive: { tag: string, lte: number } }
  | { health: { tag?: string /*default the player*/, below: number /*AP fraction*/ } }
  | { objective: string, state?: 'done'|'failed' }  // default 'done'
  | { flag: string, eq?: any }                      // default truthy
  | { timer: number, since?: string }               // seconds since level start or since the named trigger fired
  | { structure: string, state: string }
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { custom: string, args?: any };                 // registered via mission.registerCondition
```

The mission evaluates enabled, unfired triggers every 0.1 s of sim time, in definition order.

### 6.8 Objectives

```ts
interface ObjectiveDef {
  id: string; text: string;
  kind: 'reach'|'kill'|'destroy'|'interact'|'timer'|'escort'|'collect'|'flag'|'manual';
  at?: Pos; r?: number;                     // reach, interact
  target?: { tag?: string, encounter?: string, count?: number };   // kill/destroy/escort (counts via ctx.combat.query)
  seconds?: number; label?: string;         // interact: hold time and progress label; timer: duration
  flag?: string;                            // flag kind
  showCount?: boolean;                      // "text · 2 / 4"
  showTimer?: boolean;
  marker?: boolean | Pos | 'targets';       // HUD marker: at, explicit, or on each live target
  optional?: boolean;
  failIf?: Condition;                       // e.g. escort target dead
  onDone?: Action[]; onFail?: Action[];
  initial?: 'hidden'|'active';              // default 'hidden'; shown by { objective: { add } }
}
```

Interact objectives work like this. Within `r`, the HUD shows the prompt `[F] <label>` (or the touch INTERACT button). Pressing it starts a hold-free progress bar that takes `seconds` to fill (the prototype's download mechanic). The bar pauses while the player is outside `r`.

### 6.9 Checkpoints and restarts

```ts
interface CheckpointDef { id: string; at: Pos; yaw?: YawSpec; label: string; refill?: boolean /*true*/; }
```

- `{ checkpoint: 'cp_id' }`, or `reachCheckpoint()`, stores `mission.snapshot()` in memory and in `ctx.save.setCheckpoint(levelId, snap)`. The HUD shows a checkpoint toast.
- `CheckpointState` contains: `levelId`, `checkpoint`, `flags`, objective states and progress, fired trigger ids, encounter states (`pending`/`active`/`cleared`), `structures.states()`, collected collectibles, `player.snapshot()` (refilled when `refill`), `elapsed`, and `zonesEntered`.
- **Restart** keeps the world. It calls `mission.stop()`, then restores flags, objectives and triggers and `structures.reset(states)`, spawns the player at the checkpoint, and **re-spawns encounters that were `active`** in full. Cleared encounters stay cleared, and pending ones stay pending. Finally it runs `def.onCheckpoint[cp]` to restore anything in progress, such as the music, a boss intro or markers. `def.start` runs only on a fresh start.

### 6.10 Actions

An action is an object with **one primary key**. An action list runs in sequence. Actions that block are marked ⏸.

| Action | Effect |
| --- | --- |
| `{ say: ['WHO', 'text'] }` or `{ say: { who, text, hold?, priority? } }` | queue a comms line (non-blocking) |
| `{ comms: 'name', wait?: true }` | queue a named script (⏸ when `wait`) |
| `{ wait: 2.5 }` ⏸ | sim seconds |
| `{ waitFor: Condition, timeout?: number }` ⏸ | until the condition holds |
| `{ waitComms: true }` ⏸ | until the comms queue is empty |
| `{ objective: { add \| complete \| fail \| remove: 'id' } }` / `{ objective: { text: ['id', 'new text'] } }` | objective state |
| `{ spawn: 'encounterId' }` / `{ spawn: UnitGroup }` | start an encounter or spawn inline units |
| `{ despawn: { tag } }` / `{ kill: { tag } }` | remove (no fx) or kill (fx) tagged units |
| `{ checkpoint: 'cpId' }` | snapshot and save |
| `{ trigger: 'id' }` / `{ enable: 'id' }` / `{ disable: 'id' }` | fire, arm or disarm triggers |
| `{ event: 'name' }` ⏸ | run `def.events[name]` |
| `{ cinematic: 'name' }` ⏸ | `ctx.cinematics.play` |
| `{ flyby: FlybyDef, wait?: true }` | aircraft or dropship along a path (⏸ when `wait`) |
| `{ barrage: { at, radius, count, duration, damage? } }` | artillery or orbital strike |
| `{ structure: { id, state } }` | `'open'`, `'closed'`, `'destroyed'`, … |
| `{ fx: { explosion: { at, scale } } }` / `{ fx: { emitter: { kind, at, id } } }` / `{ fx: { stop: 'id' } }` | effects |
| `{ shake: 0.8 }` | camera shake |
| `{ music: { theme?, intensity?, stinger? } }` | music |
| `{ art: Partial<LevelArt>, blend?: number }` / `{ weather: Partial<WeatherParams>, blend?: number }` | lighting, grade and weather changes |
| `{ hint: 'text' \| { desktop, touch } }` / `{ warn: 'TEXT' }` / `{ card: { title, sub } }` | HUD |
| `{ marker: { id, at, label, kind? } }` / `{ marker: { remove: 'id' } }` | HUD markers |
| `{ flag: ['name', value], persist?: true }` | set a flag |
| `{ player: { heal?, refill?, freeze?: boolean, teleport?: Pos, yaw?: YawSpec } }` | player control |
| `{ choice: { title, options: [{ key, label, do: Action[] }], seconds?, default? } }` ⏸ | timed choice (prototype recall prompt) |
| `{ interstitial: InterstitialPage[] }` ⏸ | text screen mid-level (pauses the sim) |
| `{ fade: 1, seconds?: 1 }` ⏸ / `{ letterbox: true }` | screen fades and bars |
| `{ codex: 'entryId' }` / `{ unlock: 'partId' }` | persistent unlocks |
| `{ complete: true }` / `{ fail: 'reason' }` | end the level |
| `{ parallel: Action[][] }` ⏸ | run lists concurrently and wait for all |
| `{ if: Condition, then: Action[], else?: Action[] }` | branch |
| `{ call: 'name', args?: any }` | custom action (§6.14) |

`validateLevel()` rejects unknown keys and dangling ids.

### 6.11 Cinematics, flybys and comms scripts

```ts
interface CinematicDef {
  keys: Array<{ t: number /*s*/, pos: Pos, look: Pos, fov?: number, ease?: 'linear'|'inOut' }>;   // Catmull-Rom through keys
  letterbox?: boolean /*true*/; skippable?: boolean /*true*/; freezePlayer?: boolean /*true*/; hideHud?: boolean /*true*/;
  timeScale?: number /*1*/; during?: Action[] /*runs in parallel from t = 0*/; blendOut?: number /*0.8*/;
  follow?: { tag: string } /*look positions become relative to the first live target with that tag*/;
}
interface FlybyDef { model: string /*unit model name*/; faction?: string; path: Pos[] /*use h for altitude*/; speed: number;
                     sound?: string; deploy?: { at: number /*path index*/, encounter?: string, units?: UnitGroup[] };
                     loop?: boolean; }
```

Comms scripts are `CommsLine[]` (§4.5). Speaker ids are keys of `def.speakers`.

### 6.12 Collectibles

```ts
interface CollectibleDef { id: string; kind: 'salvage'|'log'; at: Pos; unlocks?: string /*part id*/; codex?: string; label?: string; }
```

These are visible caches (a structure-style prop drawn by the mission using `ctx.structures`' `salvage_cache` type), collected by passing within 12 m. Collecting one shows a toast and an audio stinger, saves the unlock (or codex entry) immediately, and records it in the checkpoint state.

### 6.13 Unlocks and the garage economy

There is no currency. Parts unlock from three sources:

- level completion (`unlocks.parts`);
- salvage caches hidden along the big maps (rewarding exploration);
- defeating named enemy mechs (`{ unlock: 'partId' }` in their death trigger).

The garage is a **fitting puzzle**, not a shop. Every frame has a load budget and a power budget, and every part costs weight and power (§8.5).

### 6.14 Custom code

`custom.install(ctx, mission)` runs once after the world loads. It may:

- `mission.registerAction(name, fn)` and `registerCondition`;
- `ctx.structures.register(type, def)` for level-unique set pieces (built with `art/kit.js`);
- add skyline objects to `ctx.levelRoot`;
- subscribe to events, disposing the subscriptions on `level:cleared`.

Level-specific code lives in `levels/<level>/*.js`, imported by the level file.

### 6.15 Example: a small but complete level

```js
// levels/example.js  (illustrative; content is placeholder, not story)
export default {
  id: 'example', title: 'Proving Ground', order: 99, seed: 4242,
  par: { time: 600, damage: 12000 },
  briefing: { title: 'Proving Ground', subtitle: 'Systems shakedown', body: 'Cross the valley. Clear the outpost.',
              objectives: ['Reach the outpost', 'Destroy the relay'] },
  speakers: { OPS: { name: 'OPERATIONS', color: '#e9e3d3', voice: { base: 520, wave: 'square' } },
              SYS: { name: 'SYSTEM', color: '#8fd2c6', style: 'system' } },
  factions: { hostile: { shell: '#bdb6a8', accent: '#8f2a22', eye: '#ff3b1f' } },
  route: { points: [[0, 0], [150, -900], [-120, -1900], [60, -3000]], halfWidth: [420, 500, 380, 450] },
  terrain: { base: { scale: 900, amp: 110, ridged: 0.35, warp: 70 }, detail: { scale: 22, amp: 1.4 },
             walls: { height: 240 }, carve: { bedWidth: 70 }, erosion: { droplets: 100000 },
             stamps: [{ at: { s: 2900 }, r: 120, mode: 'flatten' }] },
  art: {
    palette: { ground: '#5b4d45', rock: '#2a2321', sediment: '#6b3b28', high: '#786b62', dust: '#8a7a6a' },
    sky: { top: '#17141d', mid: '#4f3330', horizon: '#8a5c47',
           sun: { azimuth: 145, elevation: 21, color: '#ffb27c' }, clouds: { cover: 0.5 }, ridges: { height: 2.5 } },
    fog: { density: 0.0016, heightFalloff: 0.01, inscatter: 0.7 },
    light: { sun: 6.5, hemi: 1.7, rim: 2.8, exposure: 1.0 },
    grade: { contrast: 1.04, saturation: 1.06, vignette: 0.3 },
    weather: { type: 'ash', intensity: 0.6, wind: [2, 0.6] },
    skyline: [{ kind: 'tether', at: { azimuth: 300, dist: 4000 }, size: 1 }],
    scatter: [
      { prop: 'rock_medium', density: 6, scale: [1, 3.2], slope: [0, 0.7], collide: true, collideMinScale: 2.4 },
      { prop: 'boulder', density: 0.6, scale: [5, 11], avoidRoute: true, collide: true, castShadow: true },
      { prop: 'pebbles', density: 120, maxDist: 120 },
    ],
  },
  zones: [
    { id: 'z_valley', range: [0, 2400], name: 'Valley', card: { title: 'THE VALLEY' } },
    { id: 'z_outpost', range: [2400, 3100], name: 'Outpost', card: { title: 'OUTPOST' },
      art: { fog: { density: 0.0022 }, grade: { saturation: 0.9 } }, music: 'combat',
      structures: [
        { id: 'gate', type: 'gate', at: { s: 2650 }, yaw: 'route' },
        { type: 'wall', at: { s: 2650, l: -60 }, yaw: 'route', params: { length: 90 } },
        { type: 'wall', at: { s: 2650, l: 60 }, yaw: 'route', params: { length: 90 } },
        { id: 'relay', type: 'relay_pylon', at: { s: 2900, l: 20 },
          destructible: { ap: 3600, name: 'RELAY', tag: 'relay', objective: true } },
      ] },
  ],
  checkpoints: [
    { id: 'cp_start', at: { s: 30 }, yaw: 'route', label: 'Drop point' },
    { id: 'cp_outpost', at: { s: 2450 }, yaw: 'route', label: 'Outpost approach' },
  ],
  objectives: [
    { id: 'o_reach', text: 'Reach the outpost', kind: 'reach', at: { s: 2450 }, r: 80, marker: true },
    { id: 'o_relay', text: 'Destroy the relay', kind: 'destroy', target: { tag: 'relay' }, marker: 'targets' },
  ],
  encounters: [
    { id: 'e_scouts', units: [{ kind: 'drone', count: 4, at: { s: 900, l: -40 }, spread: 50 }] },
    { id: 'e_gate', units: [{ kind: 'turret', count: 2, at: { s: 2640, l: 0, h: 16 }, spread: 25 },
                            { kind: 'tank', count: 2, at: { s: 2780 }, spread: 40 }],
      waves: [{ when: 'cleared', units: [{ kind: 'mech', at: { s: 2900 }, opts: { drop: true, boss: true, tags: ['warden'],
                config: { design: 'striker', faction: 'hostile', ap: 16000 } } }] }] },
  ],
  triggers: [
    { id: 't_scouts', when: { pass: 700 }, do: [{ spawn: 'e_scouts' }, { say: ['OPS', 'Contacts ahead. Light drones.'] }] },
    { id: 't_outpost', when: { objective: 'o_reach' }, do: [
        { checkpoint: 'cp_outpost' }, { cinematic: 'gateReveal' }, { spawn: 'e_gate' },
        { objective: { add: 'o_relay' } } ] },
    { id: 't_warden_half', when: { health: { tag: 'warden', below: 0.5 } }, do: [{ say: ['SYS', 'Hostile frame damaged.'] }] },
  ],
  cinematics: {
    gateReveal: { keys: [ { t: 0, pos: { s: 2470, l: -40, h: 18 }, look: { s: 2650, h: 10 }, fov: 50 },
                          { t: 4, pos: { s: 2520, l: 30, h: 26 }, look: { s: 2700, h: 8 }, fov: 45 } ] },
  },
  start: [ { objective: { add: 'o_reach' } }, { say: ['OPS', 'Systems check complete. Move out.'] },
           { hint: { desktop: 'WASD move · Mouse aim · Shift quick boost', touch: 'Left thumb moves · BOOST dashes' } } ],
  onCheckpoint: { cp_outpost: [ { music: { theme: 'combat' } } ] },
  complete: { when: { all: [{ objective: 'o_relay' }, { killed: { tag: 'warden' } }] },
              do: [ { say: ['OPS', 'Area secure.'] }, { waitComms: true } ] },
};
```

---

## 7. Rendering pipeline and quality tiers

### 7.1 Renderer setup

The engine (P0) creates the renderer. The pipeline (P1) owns its configuration from then on.

- `WebGLRenderer({ antialias: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: debug })`. Keeping the default framebuffer antialiased costs little and gives Low its antialiasing.
- `outputColorSpace = SRGBColorSpace`; `toneMapping = ACESFilmicToneMapping` (per level: AgX/Neutral); `toneMappingExposure = art.light.exposure`.
- `shadowMap.enabled = true`. The type is `PCFSoftShadowMap` on High/Medium and `PCFShadowMap` on Low.
- `setPixelRatio(min(devicePixelRatio, tier.pixelRatioMax))`.
- `info.autoReset = false`. The pipeline calls `info.reset()` at the start of `render()`, so `stats()` reports whole-frame totals.

### 7.2 Pass chain

**High and Medium** use `EffectComposer` with a custom HalfFloat render target (`samples: tier.msaa`):

```
RenderPass(scene, camera)
→ GTAOPass            (High and settings.ao only: half resolution, blendIntensity 0.7, radius ≈ 2.5 m)
→ UnrealBloomPass     (strength/radius/threshold from art.bloom; threshold applies in linear HDR, so emissives > 1 bloom)
→ FinalPass           (custom ShaderPass: replaces OutputPass)
→ SMAAPass            (Medium only; High uses MSAA ×4 on the composer target instead)
```

**FinalPass** is a single fragment shader in `pipeline.js`. Its chunks follow the structure of `OutputShader`:

1. chromatic aberration sampling (`chroma + hurt × 0.02`, radial);
2. exposure and tone mapping (`#include <tonemapping_pars_fragment>`, using the same defines as OutputPass, from `renderer.toneMapping`);
3. linear to sRGB (`#include <colorspace_pars_fragment>`, `sRGBTransferOETF`);
4. grading in display space: lift/gamma/gain, contrast around 0.5, saturation, shadow and highlight tints split by luma, desaturate;
5. vignette;
6. grain (hash on `uv × resolution + time`).

**Low** renders `renderer.render(scene, camera)` directly. Tone mapping and sRGB are applied by the renderer, and there is no grading, bloom or AO. Biome mood on Low comes from lighting and fog only.

These DOM overlays work on every tier: the hurt vignette (`#vignette`), fades (`#fade`) and the letterbox (`#letterbox`).

### 7.3 Shadows, environment and lighting

- **One shadowed `DirectionalLight` (the sun) follows the camera focus.** The shadow camera is orthographic, with a half-extent of `tier.shadowExtent` (in metres) and depth range 10 to 900. Its centre is snapped to whole shadow texels in light space, so shadows don't shimmer. Normal bias is 0.6 and bias −0.0006, retuned per tier.
- **Casters.** Mechs, units, structures (LOD0), large rocks (High/Medium) and terrain nodes (High only). Ground cover, debris and particles never cast.
- **Environment.** `PMREMGenerator.fromScene(skyScene)` renders the sky dome plus a ground disc in the palette ground colour. It is assigned to `scene.environment` and rebuilt on `apply()` and at the end of art blends. `envMapIntensity` comes from art (`light.env`) and is applied by materials.js through its standard options.
- **Fill lights.** A hemisphere light (sky and ground colours) and a rim light opposite the sun (the prototype's look). Neither casts shadows.
- **Point lights.** A fixed pool of `tier.pointLights` (6 High, 3 Medium, 0 Low). They never change visibility at runtime (§1.6). On Low, `flash()` becomes an additive sprite burst.
- **Shader warmup.** `pipeline.warmup()` runs `renderer.compileAsync(scene, camera)` behind the loading screen, after the world is built, the player has spawned, and `mission.start` has called `ctx.enemies.prewarm(kinds)` with every unit kind used by the level's encounters. This avoids first-use hitches.

### 7.4 Quality tiers (`core/settings.js` `TIERS`)

| Key | low | medium | high |
| --- | --- | --- | --- |
| `pixelRatioMax` | 1.0 | 1.25 | 1.6 |
| `post` | false | true | true |
| `msaa` (composer samples) | 0 | 0 | 4 |
| `smaa` | false | true | false |
| `bloom` | false | true | true |
| `ao` (GTAO, also needs settings.ao) | false | false | true |
| `shadowMapSize` | 1024 | 2048 | 4096 |
| `shadowExtent` (m) | 80 | 130 | 160 |
| `terrainCastsShadow` | false | false | true |
| `viewDistance` (m) | 1100 | 1800 | 2600 |
| `terrainSegments` | 32 | 64 | 64 |
| `terrainSplit` | 1.6 | 2.0 | 2.4 |
| `terrainBuildMs` | 3 | 4 | 5 |
| `erosionScale` | 0.4 | 0.8 | 1.0 |
| `scatterDensity` | 0.35 | 0.7 | 1.0 |
| `scatterDistance` | 0.5 | 0.8 | 1.0 |
| `groundCover` | false | true | true |
| `structureLodDist` (m) | 250 | 400 | 550 |
| `particlesAdd` / `particlesAlpha` | 2500 / 1200 | 5000 / 2500 | 8000 / 4000 |
| `weatherParticles` | 800 | 2000 | 4000 |
| `pointLights` | 0 | 3 | 6 |
| `debrisMax` / `maxDecals` | 40 / 32 | 120 / 96 | 200 / 192 |
| `textureSize` | 256 | 512 | 1024 |
| `anisotropy` | 2 | 4 | 8 |

`quality: 'auto'` resolves to Low on touch devices and High elsewhere. If the median frame time over the first 10 s of play exceeds 22 ms, flow suggests dropping a tier through a hint. It never changes the tier silently.

### 7.5 Performance budgets

Each budget is measured with `pipeline.stats()` (whole frame) at a **busy moment**: inside the densest zone, with 8 units fighting and an explosion. The numbers are hard ceilings for acceptance.

| Budget | Low (phone) | Medium | High (mid-range desktop, 1080p) |
| --- | --- | --- | --- |
| Draw calls, whole frame | ≤ 300 | ≤ 800 | ≤ 1400 (main ≤ 600, shadow ≤ 250, GTAO ≈ main, post ≤ 30) |
| Triangles, main pass | ≤ 0.5 M | ≤ 1.5 M | ≤ 3.0 M (terrain ≤ 0.7 M, scatter ≤ 0.9 M, structures ≤ 0.8 M, actors ≤ 0.4 M) |
| Triangles, whole frame | ≤ 0.7 M | ≤ 2.5 M | ≤ 6 M |
| Shadow casters in box | ≤ 60 | ≤ 150 | ≤ 250 |
| Live particles | ≤ 3.7 k | ≤ 7.5 k | ≤ 12 k (+ weather) |
| Point lights | 0 | 3 | 6 |
| Active AI units | ≤ 20 | ≤ 30 | ≤ 40 |
| Live projectiles | ≤ 200 | ≤ 300 | ≤ 400 |
| CPU per frame | ≤ 10 ms | ≤ 8 ms | ≤ 8 ms (sim ≤ 4, streaming ≤ terrainBuildMs + 1) |
| Programs (shader variants) | ≤ 40 | ≤ 50 | ≤ 60 |

Per-asset ceilings, checked in P3's art scenario:

| Asset | Draw calls | Triangles |
| --- | --- | --- |
| Mech | ≤ 12 (baked rigid skinning: ~5 materials + flames/vents/blade) | ≤ 40 k |
| Unit | ≤ 8 | ≤ 15 k |
| Structure LOD0 / LOD1 | ≤ 6 / 1 | ≤ 60 k / 6 k (set pieces such as `crashed_ship` ≤ 200 k / 15 k) |
| Prop type | 1 per material group | ≤ 2 k per instance |

### 7.6 How the budgets are kept

- **Instancing.** One InstancedMesh per prop type, per projectile kind and for debris and decals.
- **Merged static geometry.** One mesh per material per structure (GeoBuilder), and terrain nodes are one mesh each.
- **Rigid skinning for mechs** (`bakeRigid`) turns about 60 plates into about 5 skinned meshes.
- **LOD.** The terrain quadtree, 2-level structure LOD, and units beyond 900 m dropping to a single-material merged silhouette (`UnitRig` provides `root.userData.lod`, optional).
- **Culling.** Frustum culling stays on everywhere. Instanced meshes recompute their bounding spheres when their sets change. Mechs carry a manual bounding sphere (radius 9 m), and anything beyond `viewDistance` is hidden.
- **Pools.** Projectiles, particles (ring buffers), lights, debris, decals, shockwave rings, beams, terrain geometries and audio voices are pooled, so there is no per-frame allocation.
- **Material discipline.** A cached material library (no per-instance clones; the prototype's wreck clone is replaced by `buildMechWreck` using shared darkened materials), and a fixed light count.
- **Texture discipline.** Canvas textures are generated once at the tier size, with mipmaps and anisotropy from the tier.

---

## 8. Game flow, state machine and save data

### 8.1 States and transitions (`ui/flow.js`)

```
boot ──► title ──► levelSelect ──► briefing ──► loading ──► [interstitial: def.intro] ──► playing
           │  ▲          │ ▲           │  ▲                                                  │  ▲
           │  │          │ │           ▼  │                                                  ▼  │
           │  │          │ └──────── garage                                            paused ─┘ (resume)
           │  │          │                                                                │ restart → loading(fast)
           │  └──────────┴── back                                                         │ quit → title
           ├──► garage ──► title                                                          │
           ├──► settings ─► title                                     playing ──► dead ──► loading(fast) ► playing
           └──► credits ──► title                                     playing ──► complete ──► debrief
                                                                      debrief ──► [interstitial: def.outro] ──► briefing(next) | credits | garage | title
```

| State | `simRunning` | HUD | Input enabled | Notes |
| --- | --- | --- | --- | --- |
| `title` | false | hidden | menu | `pipeline.setView(garage.scene)`, `garage.showcase(true)`, music `'menu'` |
| `levelSelect` / `settings` / `credits` | false | hidden | menu | over the title view |
| `briefing` | false | hidden | menu | typewriter body (prototype), "Deploy" / "Fit frame" / "Back" |
| `garage` | false | hidden | menu | `garage.open()`, music `'garage'` |
| `loading` | false | hidden | none | §8.2 |
| `interstitial` | false | hidden | menu | `screens.showInterstitial` |
| `playing` | **true** | shown | gameplay | pointer lock requested; touch UI shown |
| `paused` | false | shown (dimmed) | menu | Esc/P/blur/pointer-lock loss; the menu has a tactical map and comms log |
| `dead` | true for 2.6 s, then false | shown | none | the player's explosion plays, then `showDeath` |
| `complete` | true until `complete.do` finishes, then false | shown | none | |
| `debrief` | false | hidden | menu | result + unlocks; `save.completeLevel` |

`flow.interstitial(pages)` serves the mission's `interstitial` action. It switches to `interstitial` (sim stopped), shows the pages, and returns to `playing`.

### 8.2 Loading a level (`flow.startLevel`)

1. `screens.showLoading`, `audio.unlock()`, `hud.show(false)`.
2. `def = typeof level === 'string' ? await loadLevel(level) : level`. If it's the same level as the one loaded and the request is a checkpoint restart, go to step 8.
3. If another level is loaded: `mission.stop()`, `world.unload()`, `atmosphere.clear()`, `ctx.clearLevel()`.
4. `materials.setFactions(def.factions)`, `materials.applyPalette(def.art.palette)`, `atmosphere.apply(def.art)`, `comms.defineSpeakers(def.speakers)`, `music.setTheme(def.music?.theme ?? 'ambient')`.
5. `await world.load(def, { onProgress, spawnAt })`.
6. `def.custom?.install?.(ctx, mission)` (once per load).
7. `player.setLoadout(save.getLoadout())`.
8. `mission.start(def, checkpointId, save.getCheckpoint(def.id))`. This spawns the player, restores state, and runs `start` or `onCheckpoint`.
9. `await pipeline.warmup()`, `await world.settle()`, then close the loading screen.
10. On a fresh start, show `def.intro` if it exists. Then `hud.show(true)`, `ctx.simRunning = true`, state `playing`, `input.requestPointerLock()`, emit `level:ready`. On touch devices, request fullscreen and landscape lock (prototype behaviour).

A checkpoint restart reuses the world. Target: < 1 s.

### 8.3 Results and ranks

`LevelResult = { time, kills, damageTaken, shots, collectibles: string[], rank: 'S'|'A'|'B'|'C' }`.

The rank comes from `score = 0.5 · clamp(par.time / time) + 0.5 · clamp(par.damage / max(damageTaken, 1))`. S is ≥ 0.9, A ≥ 0.75, B ≥ 0.55, and anything lower is C. The mission builds the result and emits `level:complete`. Flow saves it and shows the debrief.

### 8.4 Save data (`localStorage['campaign.save']`, versioned)

```ts
interface SaveData {
  version: 1;
  createdAt: string; updatedAt: string;          // ISO
  progress: {
    current: { levelId: string, checkpoint: CheckpointState | null } | null;   // drives "Continue"
    levels: Record<string, { unlocked: boolean, completed: boolean, bestTime: number | null,
                             bestRank: 'S'|'A'|'B'|'C' | null, collectibles: string[], completions: number }>;
  };
  garage: { loadout: Loadout, unlockedParts: string[] };
  flags: Record<string, any>;                    // persistent story flags (choices) across levels
  codex: string[];                               // environmental story entries found
  stats: { playTime: number, kills: number, deaths: number };
}
```

- A new save has `levels.l01.unlocked = true`, `garage.loadout = DEFAULT_LOADOUT` and `unlockedParts = startingUnlocks()`.
- `SaveStore.load()` applies `MIGRATIONS[v]` in sequence up to `SAVE_VERSION`. Unknown future versions are treated as corrupt: the raw value is backed up to `campaign.save.bak` and a fresh save is started.
- Writes happen on: checkpoint, collectible, level complete, garage confirm, and quitting to the title (play time).
- Settings live separately in `campaign.settings` (`Settings.version`).

### 8.5 Frames, parts and the fitting puzzle (`combat/loadout.js`)

All three prototype frames are available from the start, and they now differ in stats as well as looks:

| Frame | AP | EN | Speed | QB impulse | Load | Power | Character |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vanguard | 9000 | 1000 | 30 | 82 | 60 | 40 | balanced (prototype values) |
| Striker | 7000 | 1150 | 34 | 92 | 45 | 38 | light, fast, fragile |
| Bastion | 12000 | 900 | 26 | 74 | 80 | 44 | heavy, slow, staggers less (impMax 1900) |

Every part has a weight and a power draw. If total weight > load, speed drops by 1% per point over (and quick-boost cost rises by the same factor). If total power > the frame's power, deployment is blocked (the garage shows why). The starting loadout weighs 38 and draws 30, so it fits every frame. The first-build catalogue is in Appendix C.4.

### 8.6 Spoiler safety

- The level select shows only unlocked levels' public titles. Locked entries show `CLASSIFIED`.
- Codex entries, part names and hints come only from data the player has unlocked. Locked parts show a generic `unlock.hint` (for example "Recovered in the field"), never a level or character name from later story.
- The title, loading tips and credits are spoiler-free. Level files are loaded lazily (dynamic import), so later levels' text isn't in memory until they are played. Their files are still public and that's accepted, but nothing displays them.

---

## 9. Debug and test API

### 9.1 URL parameters (parsed by the engine; acted on by flow and debug)

| Param | Effect |
| --- | --- |
| `debug=1` | enables `__game` extras, the `#dbg` overlay (toggle with the backquote key), `preserveDrawingBuffer` |
| `tier=low\|medium\|high` | forces the tier (overrides settings) |
| `level=<id>&cp=<checkpoint>` | skips menus: flow.boot starts that level directly (briefing and intro skipped) |
| `seed=<n>` | overrides the level seed for `ctx.random` |
| `mute=1` | the audio bus master is 0 (tests) |
| `god=1` | `combat.god = true` |
| `touch=1` | forces the touch UI |
| `nopost=1` | forces direct rendering (debugging the pipeline) |

### 9.2 `window.__game` (`debug/debug.js`, P0)

Every method is safe to call from Playwright's `page.evaluate`. Async ones return promises, and everything returns JSON-serialisable data.

```ts
window.__game = {
  ctx: Ctx;                                   // full access (tests may poke anything)
  ready: Promise<void>;                       // resolves once flow.boot has reached the title (or the direct-start level)
  version: string;
  state(): FlowState;
  pause(): void;                              // ctx.debugPaused = true: no automatic ticks; rendering continues
  resume(): void;
  step(n = 1, dt = 1/60): GameStateSnapshot;  // ctx.step(n, dt), then getState()
  render(): void;                             // render one frame now (after step, before a screenshot)
  settle(): Promise<void>;                    // world.settle() + structures.settle() + pipeline.warmup()
  startLevel(id: string | LevelDef, cp?: string, o?: { paused?: boolean /*true*/, tier?: string }): Promise<GameStateSnapshot>;
      // flow.startLevel with skipIntro; waits for 'playing'; then debug-pauses (default) and settles
  teleport(p: Pos | [number, number], o?: { yaw?: number, h?: number }): void;   // player.teleport + world.settle (sync parts)
  setGod(on: boolean): void;
  killAll(f?: { tag?: string, team?: string, kind?: string }): number;
  spawn(kind: string, p: Pos, o?: SpawnOpts): number /*unit id*/;
  trigger(id: string): void;  setFlag(k: string, v: any): void;
  completeObjective(id: string): void;  checkpoint(id: string): void;  restart(): Promise<void>;
  skipCinematic(): void;
  input: { move(x: number, y: number): void, look(dx: number, dy: number): void,
           hold(a: Action, down: boolean): void, press(a: Action): void /*down this tick, up next*/, clear(): void };
  freeCam(on: boolean, pose?: { pos: Vec3, look: Vec3, fov?: number }): void;   // screenshot camera; doesn't move the player
  setCamera(pos: Vec3, look: Vec3, fov?: number): void;                         // freeCam(true) at that exact pose
  hud(on: boolean): void;                     // hide HUD/overlay for clean shots
  setTier(name: 'low'|'medium'|'high'): void;
  setTimeScale(x: number): void;
  seed(n: number): void;
  perf(): RenderStats & { fps: number, simMs: number, frameMs: number };
  getState(): GameStateSnapshot;
  errors(): Array<{ system: string, message: string }>;   // ctx.errors + window errors + unhandled rejections
  levels(): Array<{ id, title, unlocked }>;
  save: { reset(): void, get(): SaveData, set(d: SaveData): void };
};
interface GameStateSnapshot {
  state: FlowState; levelId: string | null; checkpoint: string | null; time: number /*mission elapsed*/; frame: number;
  player: { active: boolean, alive: boolean, pos: Vec3, vel: Vec3, yaw: number, pitch: number, ap: number, apMax: number,
            en: number, onGround: boolean, s: number /*route progress*/, lock: string | null,
            weapons: Record<'R'|'L'|'S'|'U', { id: string, ammo: number, cd: number }> } | null;
  units: Array<{ id: number, kind: string, name: string, team: string, tags: string[], pos: Vec3, ap: number, alive: boolean }>;
  objectives: Array<{ id: string, text: string, state: string, progress?: { cur: number, max: number } }>;
  flags: Record<string, any>;
  comms: { current: { who: string, text: string } | null, queued: number };
  cinematic: boolean;
  world: { nodes: number, pending: number, colliders: number, structures: number, scatterVisible: number } | null;
  perf: RenderStats;
  errors: number;
}
```

Free camera: `freeCam(true)` switches `cameraRig.setFree(true)`. With the sim paused, `setCamera` and `render()` give exact, repeatable vistas. Interactively, WASD/QE and the mouse fly the camera in real time.

### 9.3 Local test harness (`tools/playtest.mjs`, P0)

```
python3 -m http.server 8765 --bind 127.0.0.1 --directory /home/user/zorllg/campaign     # the harness does this itself
node /home/user/zorllg/campaign/tools/playtest.mjs --scenario smoke [--port 8765] [--tier high|medium|low]
     [--size 1280x720] [--touch] [--out /tmp/campaign-playtest/<scenario>] [--no-serve] [--headed]
```

Behaviour:

1. Unless `--no-serve`, it spawns `python3 -m http.server <port> --bind 127.0.0.1 --directory <campaign root>`, waits until `GET /index.html` returns 200, and kills the server on exit, including on SIGINT.
2. It imports `chromium` from `/opt/node-tools/node_modules/playwright/index.mjs` and launches it with `{ executablePath: '/opt/pw-browsers/chromium', headless: !headed, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }`.
3. Routing:
   - `https://cdn.jsdelivr.net/npm/three@0.170.0/**` is fulfilled from `/tmp/claude-0/-home-user/227769ff-8cb3-5692-9edf-935efd37f8b0/scratchpad/three170/package/<rest of path>` with `contentType: 'text/javascript'`. The path is configurable with `--three <dir>` or the env var `THREE_LOCAL`.
   - `https://fonts.googleapis.com/**` is fulfilled with an empty `text/css`.
   - `https://fonts.gstatic.com/**` is aborted.
   - Any other external request is aborted and logged.
4. It records `console` errors and warnings, `pageerror` and failed requests.
5. It opens `http://127.0.0.1:<port>/index.html?debug=1&mute=1&tier=<tier>[&touch=1]`, awaits `__game.ready` (90 s timeout, because software rendering is slow), calls `__game.pause()`, then runs the scenario.
6. It writes `<out>/report.json` (`{ scenario, ok, durationMs, errors[], consoleErrors[], asserts[], shots[], perf[] }`) and prints a summary.
7. Exit codes: 0 when every assert passes and there are no page errors and no `__game.errors()`; 1 otherwise; 2 on a harness failure.

Software rendering is slow, so scenarios **MUST advance time with `step()`** and render only right before screenshots.

### 9.4 Scenario API

A scenario is an ES module in `tools/scenarios/` whose default export is an async function that receives a helper `g`:

```js
// tools/scenarios/smoke.mjs
export default async function (g) {
  await g.shot('title');                                   // the title screen as booted
  const s0 = await g.startLevel('test', 'cp_start');       // returns the snapshot
  g.assert(s0.player && s0.player.alive, 'player spawned');
  await g.input({ move: [0, 1] });                         // push forward
  const s1 = await g.step(180);                            // 3 s of sim time
  g.assert(s1.player.s > s0.player.s + 40, 'moved along route');
  await g.input({ clear: true, press: ['boost'] }); await g.step(30);
  await g.shot('gameplay');                                // calls __game.render() first
  await g.camera([s1.player.pos[0] + 60, s1.player.pos[1] + 40, s1.player.pos[2] + 60], s1.player.pos);
  await g.shot('vista', { hud: false });
  const a = await g.replay(600), b = await g.replay(600);  // determinism: restart cp + same inputs twice
  g.assert(JSON.stringify(a.player.pos) === JSON.stringify(b.player.pos), 'deterministic');
}
```

The helper `g` provides:

- `startLevel(id | def, cp?, opts?)`
- `step(n, dt?)`, which returns a snapshot
- `state()`
- `input({ move?, look?, hold?: {action: bool}, press?: [actions], clear? })`
- `teleport(pos)`, `setGod(b)`, `killAll(f?)`, `trigger(id)`, `completeObjective(id)`
- `camera(pos, look, fov?)`, `freeCam(on)`
- `shot(name, { hud?: true, settle?: true })`, which saves `<out>/<name>.png`
- `perf()`, `eval(fn, ...args)` (raw `page.evaluate`), `assert(cond, msg)`, `log(...)`
- `replay(n, inputs = { move: [0, 1] })`: `__game.restart()` (same checkpoint, same seed), clear inputs, apply `inputs`, step n, and return the snapshot
- `page`: the Playwright page, for anything else

Engineers MUST look at their screenshots (by reading the PNGs) before declaring visual work done.

### 9.5 Contract check (`tools/contract.json` + `scenarios/contract.mjs`, P0)

`contract.json` is derived mechanically from §4 and §3.6. It lists:

```json
{ "modules": { "src/world/route.js": { "exports": { "Route": "function" } }, "...": {} },
  "services": { "world": ["load", "unload", "groundHeight", "normalAt", "resolve", "..."], "...": [] },
  "events": ["level:start", "..."] }
```

The scenario `import()`s each module in the page and checks the export names and `typeof`. It checks that each `ctx.<service>` has every listed method as a function, and that `install` exists where §4 lists one. Every package runs `contract` and `smoke` before handing off. Both MUST still pass.

---

## 10. Build plan (first build: engine + level 1 vertical slice + garage v1)

### 10.1 Phases

| Phase | Who | What |
| --- | --- | --- |
| 1 | **P0** (one engineer, alone) | scaffold, core and stubs. The whole game runs end to end on stubs. `contract` + `smoke` pass. |
| 2 | **P1 to P6** in parallel | each package replaces its stubs with the real implementation against §4, and runs its own scenario plus `contract` and `smoke` |
| 3 | integrator (the orchestrator, or a dedicated engineer) | merges seams, runs every scenario, tunes look and feel, runs a full level 1 pass on High and Low, and does the performance pass |

### 10.2 Rules for parallel work

1. **Strict file ownership.** Edit only the files your package owns (§2.1, §10.3 to §10.9). Read anything. You may create new files only inside your own folders or the listed new paths (your scenario, `levels/level01/` for P6).
2. **Contracts are frozen.** Implement §4 exactly. You may add exports and optional parameters. You may not rename, remove or change signatures. `contract.mjs` MUST pass.
3. **Code against stubs.** Other packages are stubs while you work, so your code MUST behave sensibly with the stub behaviour listed in §10.3, and MUST keep working once the real implementations land. Feature-detect optional behaviour (`ctx.fx?.explosion?.(…)`).
4. **No shared edits.** `index.html`, `styles.css`, `core/*`, `debug/*`, `tools/playtest.mjs` and `tools/contract.json` are frozen after P0. If you need a change there, use a workaround in your own file (for example, inject CSS) and list the request in your hand-off.
5. **No git commands.** No story spoilers in UI strings (§8.6).
6. **Test with screenshots.** Run the harness, open your PNGs, and judge them against the art bar (Appendix D).

### 10.3 P0: Scaffold and Core (runs first, alone)

**Files.** `index.html`, `styles.css`, `src/main.js`, `src/core/{engine,util,noise,settings,save,input,camera}.js`, `src/debug/debug.js`, `tools/playtest.mjs`, `tools/contract.json`, `tools/scenarios/{smoke,contract}.mjs`, plus **the initial version of every other file in §2.1** as a stub.

**Responsibilities.**

- Implement every core module completely (§3, §3.6): the engine loop, phases, error capture, tiers, settings, save with migrations, input (a full port of the prototype keyboard/mouse/pointer-lock/free-mouse/touch layer, plus gamepad), the camera rig (port of `updateCamera`, plus orbit, cinematic and free modes) and the debug API (§9.2).
- Port the prototype's HTML DOM and CSS (§2.2, §2.3).
- Write the harness and the contract check (§9.3 to §9.5). `contract.json` MUST list every export and service method in §4.
- Write the stubs. Every stub exports the full §4 surface. The required minimum behaviour is:

| Stub | Minimum behaviour |
| --- | --- |
| `render/pipeline.js` | direct `renderer.render`; `setTier` (pixel ratio, shadow size); `grade` object; `setView`/`clearView` work; `stats()` from `renderer.info` |
| `render/atmosphere.js` | complete `DEFAULT_ART`; `apply`: background = horizon colour, `FogExp2(density)`, hemi + sun (follows focus, no snapping) + rim, `sunDir` from azimuth/elevation; `set` = instant apply; `patchMaterial` returns its input |
| `render/materials.js` | 4×4 `DataTexture`s for every `TexName`; cached `MeshStandardMaterial`s for `get`/`standard`; real `glow`, `emissive`, `mechSet`, `factionSet` |
| `render/particles.js`, `fx.js`, `weather.js` | no-ops (handles with `stop()`); `fx.explosion` calls `cameraRig.addShake` |
| `audio/audio.js`, `music.js` | no-ops; `SFX` and `THEMES` exported |
| `world/route.js` | working **polyline** route (linear segments, arc length, brute-force `closest`) |
| `world/heightfield.js` | analytic `heightAt = 8·sin(x/180)·cos(z/150)`; `groundHeight` = `heightAt`; `build` resolves |
| `world/terrain.js` | one 256×256-segment grid mesh over the bounds, displaced by `heightAt` |
| `world/scatter.js` | working `registerProp` registry; `Scatter` no-ops |
| `world/collision.js` | **port of the prototype collider code** (box, circle; obox treated as its AABB); `segment` by marching |
| `world/world.js` | working `load` (route, stub heightfield, terrain mesh, structure placement), `resolve`, `resolveYaw`, `playArea`, `groundHeight`; `settle` resolves |
| `art/kit.js` | **verbatim port** of `plateGeo`/`acKit`; `bevelBox` = BoxGeometry; `GeoBuilder` that groups without merging; `bakeRigid` returns its input |
| `art/mechs.js` | **verbatim port** of `AC_DESIGNS`, `buildAC` (as `buildMech`) and `animateAC` (as `animateMech`), with r170 light/material tweaks only; `PART_VISUALS` = {} |
| `art/units.js` | boxy rigs that expose every required part name and muzzle (§4.3) |
| `art/structures.js` | registry; every name in Appendix C.3 maps to a generic box with a box collider; `setState`/`destroy` toggle `state` |
| `ui/garage.js` | `open()` shows a frame picker (3 buttons) and Back; `scene` with lights and a mech; `showcase` rotates it |
| `combat/combat.js` | working register/query/damage/kill (port of the prototype `damage`/`killEnemy`) |
| `combat/projectiles.js` | `fire()` moves projectiles in straight lines until `life` runs out, with no hits |
| `combat/loadout.js` | `FRAMES` (§8.5), the 4 starting `PARTS`, `computeStats`, `validate` |
| `combat/weapons.js` | `createWeapon` returns a weapon with `readout()`; `trigger` does nothing |
| `actors/player.js` | minimal mover: WASD/stick relative to yaw, mouse look, gravity to `supportHeight`, `cameraRig.follow`, `buildMech` + `animateMech` |
| `actors/enemy.js` | `Unit` base, registry, `spawn` → placeholder unit registered with combat; `killAll`; `combatIntensity` 0 |
| `actors/enemytypes.js`, `mechai.js` | register every kind with a placeholder factory |
| `mission/mission.js` | `start` spawns the player at the checkpoint; actions `say`, `objective`, `hint`, `wait`, `checkpoint`, `complete`; `reach` objectives; triggers `pass`/`enter`; completes at the route end if `complete` is missing; `validateLevel` returns [] |
| `mission/cinematics.js` | `play`/`flyby`/`barrage` resolve immediately |
| `ui/hud.js` | show/hide; AP/EN numbers and bars; objectives list; hint/warn text; `fade` and `letterbox` work; the rest are no-ops |
| `ui/comms.js` | working minimal typewriter (port) |
| `ui/screens.js` | plain versions of every screen (prototype `.doc` and `.center-card`), promise-based |
| `ui/flow.js` | working state machine for title → briefing → loading → playing ⇄ paused → complete → debrief → title, and dead → retry |
| `levels/index.js` | `LEVELS` (test, l01) + `loadLevel` |
| `levels/test.js` | a 2.5 km proving ground with 2 zones, 2 checkpoints, a reach objective, one drone encounter and one trigger |
| `levels/level01.js` | a placeholder: 4 km route, one zone, start/end checkpoints, title "Level 1" |

**Acceptance.**

1. `node tools/playtest.mjs --scenario smoke` exits 0. The screenshots `title.png`, `gameplay.png` and `vista.png` show the title, a mech on terrain, and a free-camera view.
2. `node tools/playtest.mjs --scenario contract` exits 0.
3. `smoke` checks determinism with `replay()` twice and identical positions.
4. Clicking through by hand (headed, or scripted clicks) goes title → briefing → playing → Esc pause → resume → walk to the route end → debrief → title, with zero console errors.
5. `--touch --size 844x390` shows the touch layer in landscape.
6. `__game` exposes every §9.2 member.

**May assume.** Nothing. It only needs `three@0.170.0` (from the local copy in tests).

### 10.4 P1: Look and Sound

**Files.** `src/render/{pipeline,atmosphere,materials,particles,fx,weather}.js`, `src/audio/{audio,music}.js`, `tools/scenarios/p1-look.mjs`.

**Responsibilities.**

- The renderer configuration and the pass chain (§7.1, §7.2) with `FinalPass` grading, and runtime tier switching.
- Atmosphere (§5.8):
  - an upgraded port of the prototype sky shader, with ridge bands, clouds, sun, moon and stars;
  - the sun with texel-snapped shadow follow;
  - hemi and rim lights;
  - height fog with inscatter and far fade via `patchMaterial` (Appendix B.3 has the GLSL sketch);
  - PMREM environment;
  - skyline objects, built from `art/kit.js` geometry where it makes sense (import is allowed: it's a pure export);
  - `set()` blends.
- Materials: canvas textures (port `makeGrainTexture`/`makePanelTexture`, plus rock, concrete, metal, grime, noise and sprite atlases), the library, the wear patch, palettes, factions and signage.
- Particles: port `Particles` with an atlas sprite and fog-aware shader, the light pool, instanced debris, decals.
- FX recipes (port `sparks`, `dust`, `explosion` and the inline muzzle/boost effects from the prototype, plus new ones), and ambient battle.
- Weather: port ash fall, plus dust, rain streaks, snow, embers and sandstorm, with lightning.
- Audio: port `AU` into the bus graph, stereo pan, loops and voices, plus the new SFX in Appendix C.1.
- Music: the prototype's pad and combat pulse as theme `'ambient'`/`'combat'`, a sequencer that supports `ThemeDef`, and stingers.

**Acceptance (`p1-look.mjs`, on `levels/test.js` plus inline art overrides).**

1. Screenshots at each tier: the gameplay camera at the start, a free-camera vista at 80 m altitude along the route, and a sun-facing shot. There must be no visible terrain edge or seam at the horizon, and fog must reach the sky colour before the far plane.
2. Every material in the library and every FX recipe is rendered in a gallery shot. Each weather type gets a screenshot.
3. `pipeline.stats()` on High: post overhead ≤ 30 calls. Switching tiers High → Low → High at runtime raises no errors, and the program count is stable after the second switch.
4. With `mute=1` and after `audio.unlock()`, every name in `SFX` plays without throwing. `music.setTheme`, `setIntensity` and `stinger` raise no errors.
5. The ported mech under `DEFAULT_ART` is neither crushed nor blown out on High or on Low (visual review against the prototype screenshot).

**May assume.** `ctx.cameraRig.focus`, `ctx.world.groundHeight` (stub: sine hills), `ctx.enemies.combatIntensity` (stub 0) and the art kit exports (stub/port).

### 10.5 P2: World

**Files.** `src/world/{route,heightfield,terrain,scatter,collision,world}.js`, `tools/scenarios/p2-world.mjs`.

**Responsibilities.** Everything in §5.1 to §5.6, §5.9 and §5.10: the spline route, the heightfield pipeline with erosion and bakes, quadtree LOD streaming with pooled geometry and the terrain material, prop scatter with natural prop models and colliders, 2.5D collision with oriented boxes and swept segments, the World orchestration, `resolve` and `playArea`, and `renderMap`.

**Acceptance (`p2-world.mjs`, using an inline LevelDef 4.5 km long and 1.2 km wide built in the scenario).**

1. `world.load` completes. Log the build time; the target is ≤ 8 s in the headless sandbox.
2. Teleport to 10 evenly spaced points along the route and `settle`. Gameplay and free-camera screenshots show no holes, cracks or LOD popping seams.
3. Ground accuracy:
   - |`groundHeight` − `heightAt`| ≤ 0.6 m on 2,000 random corridor points;
   - `groundHeight` matches a `THREE.Raycaster` hit on the settled 2 m mesh within 0.02 m on 200 points.
4. Corridor shape: at |l| = 1.1 × halfWidth the ground is ≥ 100 m above the route bed for ≥ 90% of samples, and the route bed grade is ≤ 10% everywhere.
5. Streaming: flying the camera from s = 0 to the end at 80 m/s with `step()` keeps `terrain.stats().pending` ≤ 64. After a full round trip, `renderer.info.memory.geometries` is within 10% of its starting value.
6. Collision unit tests: box, obox and circle `resolve`; `supportHeight` on tops; ceilings; `segment` against known boxes and the ground; `lineOfSight`.
7. Scatter: visible instances > 0, and two loads produce an identical hash of collider positions.
8. High-tier budget at the 10 test points: terrain triangles ≤ 0.7 M, and terrain + scatter draw calls ≤ 120.

**May assume.** `ctx.atmosphere.sunDir`, `ctx.materials.textures`, `ctx.structures.footprint`/`place` (stub: generic boxes), `ctx.cameraRig.focus`, `ctx.tier`.

### 10.6 P3: Forge (art kit, mechs, units, structures, garage)

**Files.** `src/art/{kit,mechs,units,structures}.js`, `src/ui/garage.js`, `tools/scenarios/p3-art.mjs`.

**Responsibilities.**

- The geometry kit: the port plus `panelBox`, pipes, trusses, greebles, `GeoBuilder` merging and `bakeRigid`.
- Mechs: the port of the three frames, part visuals for every `PARTS[].visual`, `animateMech` parity, wrecks, and baked rigid skinning to meet the budget.
- All unit models (§4.3 table), built in the bevelled style. None of the prototype's boxy drones and tanks survive.
- The structure registry and the Appendix C.3 catalogue: footprints, colliders, anchors, states, collapse, lazy realise, LOD and shared geometry caches. Man-made prop registration (Appendix C.2) and the `salvage_cache` visual.
- **Garage v1**:
  - the hangar bay scene (built with the kit; RoomEnvironment-style PMREM, or the atmosphere env with the pipeline in `setView`);
  - turntable and drag orbit;
  - tabs for FRAME / R-ARM / L-ARM / SHOULDER / UTILITY / PAINT;
  - a stats panel with load and power bars and warnings (`computeStats`, `validate`);
  - locked parts shown with `unlock.hint`;
  - the title showcase;
  - desktop and touch layouts. Inject CSS via `injectCSS('garage', …)` using the design tokens.

**Acceptance (`p3-art.mjs`).**

1. Galleries: every structure type in a row (realised and LOD1), every unit model, and every mech frame with every part visual, all as free-camera screenshots. The art bar (Appendix D) is met by visual review.
2. Isolated-asset measurement (`pipeline.setView(tempScene, cam)`, then `stats()`) for every asset, reported in a table within the §7.5 per-asset ceilings.
3. Mech parity: screenshots of idle, run, air, boost and blade poses match the prototype poses. A baked mech has ≤ 12 draw calls and animates identically to the unbaked one (compare screenshots).
4. States: gate open/close changes `pointInSolid` at the door, `destroy` on `relay_pylon` and `bunker` plays the collapse and swaps the colliders, and `reset(states)` restores instantly.
5. Lazy realise: placing 200 structures builds no meshes until they're near, and realising happens at most once per frame.
6. Garage: open, change frame, parts and paint; an over-power loadout is blocked with a visible error; confirm writes to the save; after a reload the loadout is restored. Screenshots at 1280×720 and 844×390 (touch).

**May assume.** `ctx.materials` (stub basics), `registerProp`, `ctx.collision` API, `ctx.combat.register`, `ctx.fx` (no-op), `combat/loadout.js` exports (stub: 4 parts; P4 fills the catalogue, so the garage must render whatever `PARTS` contains).

### 10.7 P4: Combat and AI

**Files.** `src/combat/{combat,projectiles,loadout,weapons}.js`, `src/actors/{player,enemy,enemytypes,mechai}.js`, `tools/scenarios/p4-combat.mjs`.

**Responsibilities.**

- **Port the prototype's feel exactly**: player movement and EN, quick boost, hover, lock and hard lock, the aim march, rifle/blade lunge/missiles/kits, stagger, damage rules, projectiles with swept collision, and every prototype enemy AI. Convert `setTimeout` to `ctx.timers` and globals to `ctx` services.
- The loadout catalogue (Appendix C.4) with frame stats, and data-driven weapons.
- New unit kinds (§4.4). Teams and allies.
- Body separation between units and the player.
- The play-area pushback.
- Missile alert data (`projectiles.incoming`).
- `combatIntensity`.

**Acceptance (`p4-combat.mjs`, on `levels/test.js`).**

1. Movement parity:
   - Vanguard ground speed settles at 30 ± 1 m/s;
   - a quick boost adds ≥ 70 m/s and costs 170 EN;
   - hover drains 150 EN/s;
   - jump velocity is 17 m/s;
   - EN depletion causes a 2.4 s overheat;
   - Striker and Bastion follow `FRAMES`.
2. Weapons:
   - the rifle with auto-lock kills a drone at 80 m within 6 s;
   - the blade lunges to a tank within 75 m;
   - stagger triggers and the bonus applies;
   - missiles home;
   - kits heal;
   - every weapon in `PARTS` fires and shows the correct `readout()`.
3. Every enemy kind spawns, acquires the player, attacks and dies cleanly. The gunship stays airborne, the walker walks, artillery shows ground warnings, the dropship deploys its group, and the beacon spawns drones.
4. A 60 s god-mode duel with a `mech` raises no errors, and the AI uses at least 4 behaviours: rifle, missiles, blade and dodge.
5. Allies: ally tanks kill enemy drones without the player firing.
6. Determinism: two replays produce identical snapshots.
7. Load test: 40 units and 400 projectiles keep `perf().simMs` ≤ 8 in the sandbox.

**May assume.** `buildMech`/`animateMech` (stub = verbatim port), `buildUnit` (stub boxes with the required parts), `ctx.collision` (stub = prototype port), `ctx.world.groundHeight`/`playArea`, `ctx.fx`/`ctx.audio` (no-ops), `ctx.hud.warn`/`hint`/`hitmark`/`killfeed`/`hurt` (stub/no-op), `ctx.cameraRig`.

### 10.8 P5: Mission and Interface

**Files.** `src/mission/{mission,cinematics}.js`, `src/ui/{hud,comms,screens,flow}.js`, `levels/test.js`, `tools/scenarios/p5-mission.mjs`.

**Responsibilities.**

- The full level-format runtime (§6): triggers, conditions, objectives, encounters and waves, checkpoints and restarts, actions, collectibles, zones with art blends, `validateLevel`.
- Cinematics, flybys and barrages.
- The complete HUD (port of the prototype plus boss bar, prompt, zone card, checkpoint toast, letterbox, and touch labels via `input.setTouchLabel`).
- Comms (port plus speakers and log).
- Every screen (§4.5), including settings (all of `Settings`), the pause tactical map (`heightfield.renderMap`) and the comms log.
- The flow state machine (§8), save integration and ranks.
- `levels/test.js` MUST exercise **every** action, condition and objective kind in §6.

**Acceptance (`p5-mission.mjs`).**

1. `validateLevel(test)` returns `[]`. A deliberately broken copy returns the expected errors.
2. A scripted run of `test` fires every trigger. Objectives move through hidden → active → done/failed, and the HUD's DOM text matches.
3. Checkpoints:
   - after reaching cp2, mutating state and killing the player, retry restores the snapshot, with the encounter re-spawn rules from §6.9;
   - after reloading the page, Continue resumes at cp2.
4. A cinematic plays with the letterbox, and skip works. Flyby and barrage produce their effects. A choice resolves through injected `interact`/`alt` and through its timeout.
5. Comms timing is within 10% of the prototype formula, and the log is kept.
6. Screenshots of every screen and every HUD element (lock box, edge markers, radar, compass, boss bar, prompt, zone card, warning, hint), at 1280×720 and 844×390 touch. Keyboard navigation works: Enter, Esc, arrows.
7. The full flow loop: title → select → briefing → garage → briefing → loading → playing → pause → settings → resume → complete → debrief → next.

**May assume.** Every other service through stubs: enemies spawn placeholder units with tags, `combat.query` works, `world.resolve` works, and the garage stub opens and closes.

### 10.9 P6: Level 1

**Files.** `levels/index.js`, `levels/level01.js`, `levels/level01/*.js` (optional), `tools/scenarios/level01.mjs`.

**Responsibilities.**

- Turn `docs/level-01.md` and `docs/SPOILERS-story-bible.md` into `levels/level01.js` using only the §6 format: route, terrain, art per zone, structures, scatter, encounters, triggers, objectives, checkpoints, cinematics, world events, comms scripts, briefing, intro and outro, collectibles and unlocks.
- Level-unique set pieces go in `levels/level01/` through `custom.install`, using `art/kit.js` and `ctx.structures.register`.
- Write speaker definitions, faction palettes and the music theme for the level.

**Acceptance.**

1. `validateLevel(level01)` returns `[]`. `contract`, `smoke` and `p5-mission` still pass.
2. Content minimums:
   - route 3 to 5 km long, half-width 300 to 750 m;
   - ≥ 4 zones, each with its own art and card;
   - ≥ 3 checkpoints;
   - ≥ 5 encounters using ≥ 4 unit kinds, including one named mech fight;
   - ≥ 2 cinematics;
   - ≥ 2 world events (flyby, barrage or structure collapse);
   - ≥ 2 salvage caches;
   - comms, briefing, intro and outro per the story documents.
3. `level01.mjs` plays the level from each checkpoint, driving objectives with teleports, `killAll` and inputs, and asserts that every trigger fires and the level reaches the debrief. It takes screenshots of every zone (the gameplay camera plus one vista each), and confirms §7.5 budgets on High at the busiest moment of each zone. There must be no errors.
4. Spoiler review: nothing shown before it is reached (§8.6).

**May assume.** The whole §6 format as implemented by P5, and §4 services (stubs until they land). The content MUST NOT depend on behaviour beyond §4/§6. If it needs more, it uses `custom` code in `levels/level01/`.

### 10.10 Hand-off message (every package)

Return, in your final message:

1. the files written;
2. any contract deviations (there should be none);
3. requests for frozen files;
4. known issues;
5. the scenario command and the screenshot folder;
6. measured budgets.

Don't write report files.

### 10.11 Integration (phase 3) checklist

1. Run all scenarios with `--tier high` and `--tier low`, and fix seam bugs in owners' files.
2. Retune the lighting and grade for each level 1 zone, against screenshots.
3. AI difficulty and pacing pass, with a full scripted run plus one manual headed run.
4. Performance: measure `perf()` at the busiest points against §7.5. If draw calls are over budget, batch structures (`InstancedMesh` for repeats, or `BatchedMesh`).
5. Leak check: load l01 → title → l01 → title. Geometries, textures and programs must return within 10%.
6. Phone pass (`--touch --size 844x390 --tier low`): HUD layout, the touch interact and skip buttons, load time.
7. Spoiler pass.

### 10.12 Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Terrain generation is slow on phones | `erosionScale`; on Low, `macroCell` ×1.25; progress UI; the arrays are worker-ready for a later move |
| Shader compile hitches | `pipeline.warmup()` with pre-instantiated kinds, and a fixed light count |
| Software rendering makes tests slow | `step()`-driven scenarios, rendering only for shots, `--size 960x540` allowed |
| Contract drift between parallel packages | `contract.json` check before hand-off; frozen §4 |
| The visual bar is subjective | Appendix D checklist and mandatory screenshot review against the prototype mech |
| The mission DSL is too broad to integrate late | `levels/test.js` exercises everything in phase 2 |
| Too many draw calls from structures | lazy realise, LOD1 single mesh, `BatchedMesh` fallback in phase 3 |

---

## Appendix A: Prototype port map (`iron-ledger/index.html`)

| Prototype (line ranges are approximate) | New home | Notes |
| --- | --- | --- |
| CSS, HUD DOM (10–294) | `styles.css`, `index.html` | tokens generalised; faction classes dropped |
| helpers `clamp…mulberry32` (300–312) | `core/util.js` | |
| settings, `TOUCH_DEVICE` (319–323) | `core/settings.js` | key `campaign.settings` |
| renderer/scene/camera (325–338) | `core/engine.js`, `render/pipeline.js` | r170 colour management |
| sky shader, PMREM, hemi/sun/rim (341–401) | `render/atmosphere.js` | + ridges, fog patch, shadow snapping |
| flash lights (403–427) | `render/particles.js` `lights` | fixed pool, intensity retune |
| terrain noise/heights (429–475, 528–562) | `world/heightfield.js`, `world/terrain.js` | replaced by streamed big terrain |
| grain and panel textures (476–527) | `render/materials.js` | tier-sized; sRGB rules |
| colliders (564–620) | `world/collision.js` | + obox, segment, 32 m hash |
| `std`/`glow`/`box`/`cyl`/`MAT` (622–652) | `render/materials.js`, `art/kit.js` | |
| rocks/monoliths/silhouettes/tether/moon (654–719) | `world/scatter.js`, `art/structures.js` (`monolith`), `render/atmosphere.js` (skyline, moon) | |
| Site Cairn compound (721–793) | not ported (story); techniques → `art/structures.js` | |
| `Particles`, ash, sparks, dust, explosion, debris (795–918) | `render/particles.js`, `render/weather.js`, `render/fx.js` | |
| `AU` audio (920–1009) | `audio/audio.js`, `audio/music.js` | |
| `plateGeo`, `acKit`, `AC_DESIGNS`, `buildAC`, `animateAC` (1011–1295) | `art/kit.js`, `art/mechs.js` | + baked rigid skinning, part visuals |
| player state, `resetPlayer`, `aimDir` (1297–1328) | `actors/player.js`, `core/util.js` | |
| `damage`, `killEnemy`, `killPlayer` (1330–1372) | `combat/combat.js`, `actors/player.js` | |
| projectiles (1374–1456) | `combat/projectiles.js` | instanced rendering |
| `Enemy`, drone, tank, turret, pylon, beacon (1458–1667) | `actors/enemy.js`, `actors/enemytypes.js`, models → `art/units.js`, pylon → `art/structures.js` `relay_pylon` | |
| `makeAC` (1669–1806) | `actors/mechai.js` | config-driven phases |
| HUD helpers, comms (1808–1867), HUD update and radar (2270–2368) | `ui/hud.js`, `ui/comms.js` | |
| timers (1869–1871) | `core/util.js` `TimerQueue` | |
| input, pointer lock, touch (1873–1999) | `core/input.js` | + gamepad, interact/skip |
| `applyGfx`, settings HTML (2000–2018) | `render/pipeline.js`, `ui/screens.js` | |
| `updatePlayer`, `doSlash`, `missileTargets`, `updateLock` (2020–2241) | `actors/player.js`, `combat/weapons.js` | |
| `updateCamera` (2243–2268) | `core/camera.js` | |
| `MISSIONS` (2370–2668) | not ported (story). Mechanics become the DSL: waves → encounters, download → interact objective, recall prompt → `choice`, markers → `marker` | |
| screens and flow (2670–2850) | `ui/screens.js`, `ui/flow.js` | |
| custom bloom/composite (2852–2928) | `render/pipeline.js` | EffectComposer + FinalPass (grade math ported) |
| main loop, `tick`, `__ironLedger` (2930–3000) | `core/engine.js`, `debug/debug.js` | |

## Appendix B: r149 to r170 notes

1. **Modules.** Use `import * as THREE from 'three'` and import addons from `three/addons/...`. There is no global `THREE`.
2. **Colour.** `outputEncoding`/`texture.encoding` became `outputColorSpace`/`texture.colorSpace` (§1.5). `Color.setHex` converts sRGB to linear. ShaderMaterial outputs need the tone mapping and colour space includes.
3. **Fog patch sketch** (for `atmosphere.patchMaterial`):
   ```glsl
   // vertex, after project_vertex
   vFogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
   // fragment, replacing fog_fragment
   vec3 rd = vFogWorld - cameraPosition; float len = length(rd);
   float h0 = cameraPosition.y - uFogHeightBase, dy = rd.y, k = uFogHeightFalloff;
   float od = uFogDensity * exp(-k*h0) * (abs(k*dy) > 1e-3 ? (1.0 - exp(-k*dy)) / (k*dy) : 1.0) * len;
   float f = max(1.0 - exp(-od), smoothstep(uFogFarStart, uFogFarEnd, len));
   vec3 fc = mix(uFogColor, uFogSunColor, pow(max(dot(rd/len, uFogSunDir), 0.0), 8.0) * uFogInscatter);
   gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, f);
   ```
4. **Lights.** Legacy lights are gone. Use the conversion table in §1.5. Point lights use physical inverse-square falloff.
5. **WebGL1 is gone** (r163). WebGL2 features (MSAA render targets, float colour buffers) can be assumed.
6. **Geometry utilities.** `BufferGeometryUtils.mergeGeometries` (renamed from `mergeBufferGeometries`) and `mergeVertices` are available. Merged inputs need matching attribute sets: strip `uv` from ExtrudeGeometry, or add it everywhere.
7. **Culling.** `InstancedMesh` and `SkinnedMesh` carry `boundingSphere` for frustum culling (null means recompute). Set it to null after changing instances. Give skinned mechs a manual sphere.
8. **New APIs.** `renderer.compileAsync` and `BatchedMesh` are available. `EffectComposer` defaults to a HalfFloat target; pass a custom target for MSAA.
9. **Points.** `gl_PointSize` scales with the drawing buffer. Compute the particle `uScale` from `renderer.getDrawingBufferSize().y`. This replaces the prototype's ash size hack.

## Appendix C: Shared name registries

These string ids are shared between packages. Adding names is allowed. Renaming them is not.

### C.1 SFX names (`audio/audio.js`)

**Prototype:** `rifle`, `erifle`, `plasma`, `cannon`, `turret`, `explode`, `boom`, `qb`, `blade`, `bladeHit`, `missile`, `lock`, `blip`, `hit`, `hurt`, `alarm`, `land`, `stagger`, `repair`, `empty`, `charge`, `door`, `confirm`, `glitch`.

**New:** `mg`, `shotgun`, `mortar`, `rail`, `step`, `stepHeavy`, `servo`, `rotor`, `dropship`, `flyby`, `thunder`, `collapse`, `metalGroan`, `klaxon`, `static`, `pickup`, `objective`, `checkpoint`, `uiMove`, `uiSelect`, `uiBack`, `interact`, `shockwave`, `warn`.

### C.2 Prop types (`registerProp`)

- **Natural (P2):** `rock_small`, `rock_medium`, `rock_large`, `boulder`, `spire`, `slab`, `pebbles`, `scrub`, `grass_tuft`, `dead_tree`, `stump`.
- **Man-made (P3):** `container`, `barrel_cluster`, `barricade_small`, `tank_trap`, `girder`, `concrete_chunk`, `pipe_piece`, `wreck_debris`, `cable_spool`, `sign_post`, `sandbags`.

### C.3 Structure types (`art/structures.js`)

| Type | Params (defaults) | States | Notes |
| --- | --- | --- | --- |
| `bunker` | w 24, d 16, h 8 | intact, destroyed | anchors `door`, `roof` |
| `watchtower` | h 24 | intact, destroyed | anchor `top` (turret mount) |
| `wall` | length 40, h 10, thickness 3, damaged 0 | intact, destroyed | |
| `gate` | width 30, h 16 | closed, open, destroyed | door collider disabled when open |
| `bridge` | length 120, h 20, width 24 | intact, destroyed | deck collider has a bottom (pass under) |
| `relay_pylon` | h 44 | intact, destroyed | destructible; topples (prototype) |
| `comm_array` | dishes 3 | intact, destroyed | dishes animate |
| `tank_farm` | tanks 4 | intact, destroyed | fires on destroy |
| `refinery` | size 60 | intact, burning, destroyed | emitters |
| `hangar` | w 60, d 40, h 22 | closed, open | walkable interior |
| `landing_pad` | r 30 | idle, lit | |
| `container_stack` | n 3, layers 2 | | |
| `barricade` | length 20 | intact, destroyed | |
| `outpost` | size 80 | | composite of walls, bunker, towers, containers |
| `ruin_block` | w 30, d 30, h 40, decay 0.5 | | |
| `monolith` | w 8, h 30 | | prototype slabs, upgraded |
| `pipeline` | length 200, h 6 | intact, burst | |
| `crashed_ship` | length 300 | | set piece |
| `megastructure_leg` | h 600 | | background giant |
| `mech_wreck` | design 'vanguard', scheme? | | `buildMechWreck` + smoke |
| `vehicle_wreck` | kind 'tank' | | |
| `salvage_cache` | | sealed, opened | collectible visual |
| `checkpoint_beacon` | | idle, active | optional checkpoint visual |

### C.4 Parts catalogue (`combat/loadout.js`, first build)

| id | Slot | Weapon | Weight | Power | Key stats | Unlock |
| --- | --- | --- | --- | --- | --- | --- |
| `rifle_r30` | R | rifle | 12 | 8 | dmg 245, imp 70, rate 0.135 s, speed 680, ammo 600, spread 0.008 (prototype) | start |
| `mg_r12` | R | mg | 10 | 10 | dmg 120, imp 32, rate 0.07, speed 640, ammo 1200, spread 0.02 | level l01 |
| `shotgun_s8` | R | shotgun | 14 | 8 | 8 × (dmg 150, imp 55), rate 0.9, speed 520, ammo 120, falloff 60–120 m | salvage |
| `cannon_hc90` | R | cannon | 28 | 14 | dmg 1400, imp 900, splash 8 m / 600, rate 1.6, speed 300, ammo 40 | salvage |
| `blade_pb2` | L | blade | 8 | 12 | dmg 2300, imp 700, cd 2.6, lunge 75 m @110 (prototype) | start |
| `blade_hx` | L | blade | 14 | 16 | dmg 3400, imp 1200, cd 4.0, lunge 55 m @95 | salvage |
| `msl_vm4` | S | missiles | 14 | 10 | 4 × (dmg 620, imp 260), cd 7, ammo 80, turn 2.6, accel 110, max 175 (prototype) | start |
| `msl_sw8` | S | micromissiles | 16 | 12 | 8 × (dmg 260, imp 120), cd 9, ammo 160, turn 3.2 | level l01 |
| `mortar_m3` | S | mortar | 18 | 8 | 3 × (dmg 900, imp 500, splash 10 m), cd 6, ammo 36, gravity 45 | salvage |
| `kit_rk3` | U | kit | 4 | 0 | 3 kits, heal 3600/s for 1.2 s (prototype) | start |
| `kit_rk2f` | U | kit | 3 | 0 | 2 kits, heal 7200/s for 0.6 s | salvage |

Display names are placeholders that the story team may rename. The ids are frozen. Visual ids are `rifle`, `mg`, `shotgun`, `cannon`, `blade`, `blade_heavy`, `pod4`, `pod8`, `mortar`, `kit`, and `PART_VISUALS` MUST cover all of them.

Frame load and power budgets are in §8.5 (Vanguard 60/40, Striker 45/38, Bastion 80/44). `DEFAULT_LOADOUT` is `{ frame: 'vanguard', R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3', paint: PAINT_PRESETS[0] }`, and `startingUnlocks()` returns exactly those four parts.

### C.5 Unit base stats (`actors/enemytypes.js`; prototype values where they exist)

| Kind | AP | impMax | Attack |
| --- | --- | --- | --- |
| drone | 820 | 500 | plasma 150 dmg / 45 imp @130 m/s, cd 1.5–2.6, range 240; orbits 60–110 m |
| tank | 3000 | 1000 | shell 680 / 340 @240, cd 3.2–4.4, range 270; barrel glow tell |
| tank_heavy | 7200 | 2200 | 3-shell burst 600 / 340, cd 3.6–4.6 |
| turret | 2000 | 800 | 6-round burst 85 / 22 @420, cd 2.6–3.4, range 260 |
| gunship | 2600 | 700 | chin gun 60 / 15 @500 bursts; 4 rockets 300 + splash 6 m; hovers 25–45 m, strafes |
| walker | 9000 | 2600 | cannon 900 / 600 @260; stomp 1200 within 14 m; slow, 6 m/s |
| artillery | 2400 | 900 | mortar 3 × 700, splash 12 m, range 120–900 m, 2 s ground warning |
| apc | 2800 | 1000 | none; deploys 3 drones once within 200 m |
| beacon | 3200 | ∞ | spawns a drone every 11–15 s, up to 6 alive (prototype) |
| dropship | 6000 | ∞ | scripted transport; `targetable` false by default |
| mech | config (bosses 14k–22k) | 2400–2700 | rifle burst 3 × 220 @600; 4 missiles × 420; blade 2000 / 750; shock 2600 within 36 m; qb dodge (prototype) |

## Appendix D: Art bar checklist (P1, P2 and P3 review their screenshots against this)

- Silhouettes read at 300 m. Bevels catch the sun, with highlights from PMREM reflections. Panel lines are geometry, not texture.
- No raw boxes or cylinders in final art (debris excepted). Every man-made object has at least 3 depth layers: core shell, plates, greebles or trim.
- Emissive accents (eyes, lamps, strips) bloom on High and stay readable on Low.
- Terrain shows erosion channels, sediment fans and rock faces on slopes. The route bed reads as a worn path. There is no visible tiling at 50 to 300 m.
- Distance reads through fog layering: there are at least 3 visible depth planes in every vista (near props, mid relief, skyline/ridges).
- Each zone has a distinct palette, light and grade. Story beats get lighting changes.
- Effects carry their weight: explosions have flash, fireball, smoke, debris, a decal and shake. Muzzle and impact effects match the weapon.
