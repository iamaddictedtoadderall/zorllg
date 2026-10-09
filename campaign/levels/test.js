// levels/test.js (P5) — "Proving Ground": a 2.5 km dev level (hidden from level select unless ?debug) that exercises
// every action, condition and objective kind of the level format (§6), plus the addendum's addInteract and
// encounter:wave. Placeholder text, no story.
//
// Invariants other scenarios rely on (keep them):
//  · smoke: o_reach (s 2450, r 80) is added by `start` and `complete.when` is { objective: 'o_reach' } with a short
//    complete.do; walking the route centre line from cp_start, or from a teleport to s 2330, never freezes, teleports,
//    blocks or hurts the player (everything heavy is gated behind flags set by p5-mission.mjs, or off the route).
//  · contract: triggers[0] (t_drones) and encounters[0] (e_drones, no waves) are simple; objectives[0] is o_reach.
// p5-mission.mjs drives the gated triggers by setting flags ('p5.*') and teleporting to the trigger spots.

const ART_RIDGE = { fog: { density: 0.0019 }, grade: { saturation: 0.95, contrast: 1.06 }, light: { exposure: 1.0 } };

export default {
  id: 'test', title: 'Proving Ground', subtitle: 'Systems shakedown', order: 0, seed: 4242,
  par: { time: 300, damage: 9000 },
  briefing: {
    header: 'DEV · PROVING', title: 'Proving Ground', subtitle: 'Systems shakedown',
    body: 'Walk the proving ground from the drop point to the far marker.\nDrones will test your reflexes on the way. A relay on the ridge needs taking down.',
    objectives: ['Reach the far marker', 'Destroy the relay (optional)'], fine: 'Development level. Not part of the campaign.', showMap: true,
  },
  intro: [{ style: 'terminal', text: 'PROVING GROUND // SYSTEMS SHAKEDOWN\nAll channels open. Range is live.' }],
  outro: [{ style: 'black', text: 'Proving run logged.' }],
  unlocks: { levels: [], parts: [] },
  speakers: {
    OPS: { name: 'OPERATIONS', color: '#e9e3d3', voice: { base: 520, wave: 'square' }, channel: 'OPEN' },
    SYS: { name: 'SYSTEM', color: '#8fd2c6', style: 'system', font: 'monoCaps', speed: 1.6 },
    RANGE: { name: 'RANGE', color: '#e0913c', voice: { base: 300, wave: 'triangle' }, style: 'radio', channel: 'WAKE', static: 0.3 },
    PA: { name: '', color: '#e9d79a', style: 'intercept', italic: true, speed: 0.8, chime: true },
  },
  factions: { hostile: { shell: '#bdb6a8', accent: '#8f2a22', eye: '#ff3b1f' }, friendly: { shell: '#8a9aa6', accent: '#3f7f9a', eye: '#7fc6ff' } },
  music: { theme: 'ambient', combat: 'combat' },
  route: { points: [[0, 0], [120, -800], [-80, -1600], [40, -2500]], halfWidth: [400, 450, 380, 420] },
  terrain: {
    base: { scale: 900, amp: 110, ridged: 0.35, warp: 70 }, detail: { scale: 22, amp: 1.4 },
    walls: { height: 240 }, carve: { bedWidth: 70 }, erosion: { droplets: 60000 },
    stamps: [{ at: { s: 2450 }, r: 90, mode: 'flatten' }],
  },
  art: {
    palette: { ground: '#5b4d45', rock: '#2a2321', sediment: '#6b3b28', high: '#786b62', dust: '#8a7a6a' },
    sky: { top: '#17141d', mid: '#4f3330', horizon: '#8a5c47', sun: { azimuth: 145, elevation: 24, color: '#ffb27c' },
           clouds: { cover: 0.5 }, ridges: { height: 2.5 } },
    fog: { density: 0.0016, heightFalloff: 0.01, inscatter: 0.7 },
    light: { sun: 6.5, hemi: 1.7, rim: 2.8, exposure: 1.05 },
    grade: { contrast: 1.04, saturation: 1.06, vignette: 0.3 },
    weather: { type: 'ash', intensity: 0.5, wind: [2, 0.6] },
    scatter: [
      { prop: 'rock_medium', density: 6, scale: [1, 3.2], slope: [0, 0.7], collide: true, collideMinScale: 2.4 },
      { prop: 'boulder', density: 0.6, scale: [5, 11], avoidRoute: true, collide: true, castShadow: true },
    ],
  },
  zones: [
    { id: 'z_flats', range: [0, 1250], name: 'Flats', card: { title: 'THE FLATS', sub: 'Proving ground · sector 1' }, repeat: true,
      onEnter: [{ flag: ['p5.flatsEntered', true] }],
      scatter: [{ prop: 'barrel_cluster', density: 0.4, scale: [1, 1.4], routeBand: [60, 250] }],
      structures: [
        { id: 'stack_a', type: 'container_stack', at: { s: 420, l: -90 }, yaw: 'route' },
        { id: 'tower_a', type: 'watchtower', at: { s: 900, l: 110 }, yaw: 'route' },
        { id: 'gate_a', type: 'gate', at: { s: 1120, l: 180 }, yaw: 'route' },
        { id: 'barricade_a', type: 'barricade', at: { s: 760, l: 70 }, yaw: { azimuth: 30 }, destructible: { ap: 900, name: 'BARRICADE', tag: 'barricade' } },
      ] },
    { id: 'z_ridge', range: [1250, 2542], name: 'Ridge', card: { title: 'THE RIDGE', sub: 'Proving ground · sector 2' },
      art: ART_RIDGE, artBlend: 4, music: 'combat',
      onEnter: [{ objective: { add: 'o_relay' } }, { say: ['RANGE', 'Relay on the ridge. Bring it down if you have the time.'] }],
      structures: [
        { id: 'bunker_a', type: 'bunker', at: { s: 1800, l: -130 }, yaw: 'route' },
        { type: 'wall', at: { s: 2050, l: -85 }, yaw: 'route', params: { length: 80 } },
        { type: 'wall', at: { s: 2050, l: 85 }, yaw: 'route', params: { length: 80 } },
        { id: 'relay', type: 'relay_pylon', at: { s: 2300, l: 100 },
          destructible: { ap: 3600, name: 'RELAY', tag: 'relay', objective: true } },
      ] },
  ],
  checkpoints: [
    { id: 'cp_start', at: { s: 30 }, yaw: 'route', label: 'Drop point' },
    { id: 'cp_mid', at: { s: 1300 }, yaw: 'route', label: 'Ridge approach' },
    { id: 'cp_yard', at: { s: 1900, l: 0 }, yaw: { face: { s: 2300, l: 100 } }, label: 'Range yard', refill: false },
  ],
  objectives: [
    { id: 'o_reach', text: 'Reach the far marker', kind: 'reach', at: { s: 2450 }, r: 80, marker: true, label: 'Far marker' },
    { id: 'o_drones', text: 'Clear the drones', kind: 'kill', target: { encounter: 'e_drones' }, showCount: true, marker: 'targets' },
    { id: 'o_relay', text: 'Destroy the relay', kind: 'destroy', target: { tag: 'relay', count: 1 }, showCount: true, marker: 'targets', optional: true },
    { id: 'o_uplink', text: 'Upload the range log', kind: 'interact', at: { s: 2300, l: 60 }, r: 16, seconds: 2.5, label: 'Upload log', marker: true,
      onDone: [{ say: ['SYS', 'Range log uploaded.'] }] },
    { id: 'o_hold', text: 'Hold the yard', kind: 'timer', seconds: 8, showTimer: true },
    { id: 'o_escort', text: 'Escort the convoy', kind: 'escort', target: { tag: 'convoy', count: 1 }, at: { s: 1000, l: -30 }, r: 40,
      marker: 'targets', onFail: [{ flag: ['p5.escortFailed', true] }] },
    { id: 'o_salvage', text: 'Recover the caches', kind: 'collect', target: { count: 2 }, showCount: true, optional: true, initial: 'active' },
    { id: 'o_beacons', text: 'Light the beacons', kind: 'flag', flag: 'beacons', marker: { s: 1500, l: -60 } },
    { id: 'o_manual', text: 'Report to operations', kind: 'manual' },
    { id: 'o_doomed', text: 'Keep the decoy standing', kind: 'manual', failIf: { flag: 'p5.failObj' }, onFail: [{ flag: ['p5.doomedFailed', true] }] },
    { id: 'o_waves', text: 'Survive the waves', kind: 'kill', target: { encounter: 'e_waves' }, showCount: true },
    { id: 'o_timed', text: 'Reach the bunker in time', kind: 'reach', at: { s: 1800, l: -100 }, r: 30, seconds: 30, showTimer: true },
    { id: 'o_scrub', text: 'Calibrate the range lights', kind: 'manual' },
    { id: 'o_temp', text: 'Wait for range control', kind: 'manual', marker: { s: 960, l: -40 } },
  ],
  encounters: [
    { id: 'e_drones', tag: 'drones', units: [{ kind: 'drone', count: 3, at: { s: 700, l: -40 }, spread: 40 }] },
    { id: 'e_waves', tag: 'wave', units: [{ kind: 'drone', count: 2, at: { s: 1500, l: 140, h: 10 }, spread: 20 }],
      waves: [
        { when: { remaining: 1 }, units: [{ kind: 'drone', count: 2, at: { s: 1550, l: 150, h: 10 }, spread: 20 }] },
        { when: { delay: 3 }, units: [{ kind: 'tank', at: { s: 1600, l: 160 } }] },
        { when: 'cleared', units: [{ kind: 'turret', at: { s: 1620, l: 120 } }] },
      ],
      onCleared: [{ flag: ['p5.wavesCleared', true] }, { say: ['RANGE', 'Waves cleared.'] }] },
    { id: 'e_drop', units: [{ kind: 'drone', count: 2, at: { s: 1650, l: -80 }, spread: 12,
                               via: { dropship: { from: { s: 1300, l: -500 }, h: 70 } } }], persist: false },
    { id: 'e_convoy', units: [{ kind: 'tank', at: { s: 900, l: -30 }, opts: { team: 'ally', faction: 'friendly', behavior: 'escort', name: 'CONVOY', tags: ['convoy'] } }] },
    { id: 'e_boss', units: [{ kind: 'mech', at: { s: 2200, l: -60 }, opts: { name: 'WARDEN', boss: true, tags: ['warden'], behavior: 'guard', leash: 200,
                                                                              config: { design: 'bastion', faction: 'hostile', ap: 14000 } } }] },
  ],
  triggers: [
    // natural progression (these fire by walking the route)
    { id: 't_drones', when: { pass: 500 }, do: [{ spawn: 'e_drones' }, { say: ['OPS', 'Contacts ahead. Light drones.'] }, { objective: { add: 'o_drones' } }] },
    { id: 't_mid', when: { pass: 1300 }, do: [{ checkpoint: 'cp_mid' }] },
    { id: 't_yard', when: { pass: 1900 }, do: [{ checkpoint: 'cp_yard' }] },
    { id: 't_flyby', when: { pass: 600 }, do: [{ flyby: { model: 'gunship', faction: 'hostile', path: [{ s: 380, l: -420, h: 110 }, { s: 820, l: -60, h: 90 }, { s: 1300, l: 380, h: 120 }], speed: 70, sound: 'rotor' } }] },
    { id: 't_barrage', when: { pass: 1500 }, do: [{ barrage: { at: { s: 1600, l: -260 }, radius: 40, count: 5, duration: 3, damage: 600 } }] },
    { id: 't_zone', when: { enterZone: 'z_ridge' }, do: [{ flag: ['p5.zone', true] }] },
    { id: 't_timer', when: { timer: 4, since: 't_drones' }, do: [{ hint: 'Drones orbit. Keep moving and let the lock do the work.' }] },
    { id: 't_after', when: { pass: 700 }, after: 't_timer', do: [{ flag: ['p5.after', true] }] },
    { id: 't_level_timer', when: { timer: 30 }, do: [{ hint: 'Thirty seconds on the range.', seconds: 3 }] },
    // conditions on combat and the world
    { id: 't_drones_two', when: { killed: { tag: 'drones', count: 2 } }, do: [{ hint: 'Two down.' }] },
    { id: 't_drones_alive', when: { alive: { tag: 'drones', lte: 1 } }, after: 't_drones', do: [{ flag: ['p5.alive', true] }] },
    { id: 't_drones_dead', when: { killed: { tag: 'drones' } }, do: [{ flag: ['p5.dronesDead', true] }] },
    { id: 't_drones_clear', when: { cleared: 'e_drones' }, do: [{ say: ['OPS', 'Drones down.'] }] },
    { id: 't_relay_half', when: { health: { tag: 'relay', below: 0.5 } }, do: [{ warn: 'RELAY CRITICAL', soft: true }] },
    { id: 't_relay_down', when: { structure: 'relay', state: 'destroyed' }, do: [
      { say: ['RANGE', 'Relay is down. Upload the range log at the cradle.'] }, { objective: { add: 'o_uplink' } }] },
    { id: 't_uplink', when: { objective: 'o_uplink' }, do: [{ event: 'ev_uplinked' }] },
    { id: 't_player_low', when: { health: { below: 0.4 } }, do: [{ hint: 'AP low. R uses a repair kit.' }] },
    { id: 't_custom', when: { custom: 'p5.flagged', args: { flag: 'p5.custom' } }, do: [{ flag: ['p5.customFired', true] }] },
    { id: 't_once', when: { flag: 'p5.toggle' }, once: false, do: [{ call: 'p5.count', args: { flag: 'p5.edges' } }] },
    { id: 't_disabled', when: { flag: 'p5.armed' }, enabled: false, do: [{ flag: ['p5.armedFired', true] }] },
    { id: 't_any', when: { any: [{ flag: 'p5.a' }, { flag: 'p5.b' }] }, do: [{ flag: ['p5.any', true] }] },
    { id: 't_all_not', when: { all: [{ flag: 'p5.a' }, { not: { flag: 'p5.b' } }] }, do: [{ flag: ['p5.allNot', true] }] },
    { id: 't_eq', when: { flag: 'p5.mode', eq: 2 }, do: [{ flag: ['p5.eq', true] }] },
    { id: 't_obj_failed', when: { objective: 'o_doomed', state: 'failed' }, do: [{ flag: ['p5.objFailed', true] }] },
    { id: 't_wave', when: { custom: 'p5.wave', args: { encounter: 'e_waves', wave: 1 } }, do: [{ flag: ['p5.wave1', true] }] },
    { id: 't_overlook', when: { enter: { at: { s: 1700, l: 150 }, r: 30 } }, do: [{ cinematic: 'overlook' }, { flag: ['p5.overlookDone', true] }] },
    // gated exercises (p5-mission.mjs sets the flags)
    { id: 't_actions', when: { flag: 'p5.actions' }, do: [{ event: 'ev_actions' }] },
    { id: 't_blocking', when: { flag: 'p5.block' }, do: [{ event: 'ev_blocking' }] },
    { id: 't_hold', when: { flag: 'p5.hold' }, do: [{ objective: { add: 'o_hold' } }, { objective: { add: 'o_waves' } }, { spawn: 'e_waves' }] },
    { id: 't_escort', when: { flag: 'p5.escort' }, do: [{ spawn: 'e_convoy' }, { objective: { add: 'o_escort' } }] },
    { id: 't_drop', when: { flag: 'p5.drop' }, do: [{ spawn: 'e_drop' }] },
    { id: 't_boss', when: { flag: 'p5.boss' }, do: [{ spawn: 'e_boss' }, { music: { stinger: 'boss' } }, { cinematic: 'bossCam' }] },
    { id: 't_choice', when: { flag: 'p5.choice' }, do: [{ choice: { title: 'Range control asks: which lane?', seconds: 6, default: 'left',
      options: [{ key: 'left', label: 'Left lane', do: [{ flag: ['p5.lane', 'left'] }] },
                { key: 'right', label: 'Right lane', do: [{ flag: ['p5.lane', 'right'] }] },
                { key: 'up', label: 'High lane', do: [{ flag: ['p5.lane', 'up'] }] }] } }, { flag: ['p5.choiceDone', true] }] },
    { id: 't_inter', when: { flag: 'p5.inter' }, do: [{ interstitial: [{ style: 'paper', text: 'Range card: the proving ground closes at dusk.', hold: 8 }] },
                                                       { flag: ['p5.interDone', true] }] },
    { id: 't_interact', when: { flag: 'p5.interact' }, do: [{ call: 'p5.addInteract' }] },
    { id: 't_fail', when: { flag: 'p5.fail' }, do: [{ fail: 'Proving run aborted.' }] },
    { id: 't_cine', when: { flag: 'p5.cine' }, do: [{ cinematic: 'sweep' }, { flag: ['p5.sweepDone', true] }] },
    { id: 't_finish', when: { flag: 'p5.finish' }, do: [{ say: ['OPS', 'Range closed early.'] }, { complete: true }] },
  ],
  events: {
    ev_uplinked: [{ objective: { complete: 'o_manual' } }, { flag: ['p5.uplinked', true] }],
    // every non-blocking action
    ev_actions: [
      { say: { who: 'OPS', text: 'Running the action checklist.', priority: 'high' } },
      { comms: 'c_check' },
      { objective: { add: 'o_manual' } }, { objective: { text: ['o_manual', 'Report to range control'] } },
      { objective: { add: 'o_beacons' } }, { objective: { add: 'o_doomed' } },
      { objective: { add: 'o_scrub' } }, { objective: { fail: 'o_scrub' } },
      { objective: { add: 'o_temp' } }, { objective: { remove: 'o_temp' } },
      { marker: { id: 'm_tower', at: { s: 900, l: 110, h: 24 }, label: 'Tower', kind: 'poi' } },
      { marker: { id: 'm_tmp', at: { s: 950, l: -50 }, label: 'Temp', kind: 'waypoint' } }, { marker: { remove: 'm_tmp' } },
      { flag: ['p5.persisted', 7], persist: true },
      { hint: { desktop: 'Checklist running · desktop', touch: 'Checklist running · touch' }, seconds: 5 },
      { warn: 'CHECKLIST', seconds: 1.5 }, { card: { title: 'CHECKLIST', sub: 'Every action, once' } },
      { shake: 0.4 },
      { music: { theme: 'ambient', intensity: 0.6, stinger: 'discovery' } }, { music: { intensity: null } },
      { art: { fog: { density: 0.0021 }, grade: { saturation: 0.9 } }, blend: 2 }, { weather: { intensity: 0.8 }, blend: 2 },
      { fx: { explosion: { at: { s: 820, l: 200 }, scale: 1.2 } } },
      { fx: { emitter: { kind: 'smoke', at: { s: 800, l: 160 }, id: 'smk' } } }, { fx: { emitter: { kind: 'fire', at: { s: 800, l: 170 }, id: 'fire' } } },
      { fx: { stop: 'fire' } },
      { fx: { ambient: { kind: 'battle', at: { s: 2000, l: 700 }, radius: 300, intensity: 0.5, id: 'amb' } } }, { fx: { stop: 'amb' } },
      { structure: { id: 'gate_a', state: 'open' } }, { structure: { id: 'barricade_a', state: 'destroyed' } },
      { codex: 'test_codex' }, { unlock: 'mg_r12' },
      { player: { heal: 500, refill: true, freeze: false } }, { player: { yaw: 'route' } },
      { player: { teleport: { s: 60, l: 0 }, yaw: 'route' } },
      { spawn: { kind: 'drone', count: 2, at: { s: 980, l: 120, h: 12 }, spread: 10, opts: { tags: ['inline'] } } },
      { despawn: { tag: 'inline' } },
      { spawn: { kind: 'drone', at: { s: 990, l: 130, h: 12 }, opts: { tags: ['scripted'] } } }, { kill: { tag: 'scripted' } },
      { trigger: 't_zone' }, { enable: 't_disabled' }, { disable: 't_level_timer' },
      { letterbox: true, seconds: 0.2 }, { letterbox: false, seconds: 0.2 },
      { if: { flag: 'p5.persisted', eq: 7 }, then: [{ flag: ['p5.ifThen', true] }], else: [{ flag: ['p5.ifElse', true] }] },
      { if: { flag: 'p5.nope' }, then: [{ flag: ['p5.wrong', true] }], else: [{ flag: ['p5.ifElse', true] }] },
      { call: 'p5.count', args: { flag: 'p5.called' } },
      { flag: ['p5.actionsDone', true] },
    ],
    // every blocking action
    ev_blocking: [
      { wait: 0.5 }, { flag: ['p5.b1', true] },
      { waitFor: { flag: 'p5.go' }, timeout: 1 }, { flag: ['p5.b2', true] },
      { comms: 'c_check', wait: true }, { flag: ['p5.b3', true] },
      { say: ['RANGE', 'One more.'] }, { waitComms: true }, { flag: ['p5.b4', true] },
      { fade: 1, seconds: 0.4 }, { flag: ['p5.b5', true] }, { fade: 0, seconds: 0.3 },
      { parallel: [[{ wait: 0.3 }, { flag: ['p5.par1', true] }],
                   [{ flyby: { model: 'dropship', faction: 'hostile', path: [{ s: 1000, l: -300, h: 60 }, { s: 1100, l: 0, h: 40 }], speed: 120 }, wait: true }, { flag: ['p5.par2', true] }]] },
      { barrage: { at: { s: 1100, l: 300 }, radius: 20, count: 2, duration: 0.5, warn: false, damage: 0 } },
      { flag: ['p5.blockDone', true] },
    ],
  },
  cinematics: {
    overlook: { keys: [{ t: 0, pos: { s: 1680, l: 170, h: 52 }, look: { s: 1860, l: -80, h: 6 }, fov: 52 },
                       { t: 3, pos: { s: 1760, l: 180, h: 66 }, look: { s: 2300, l: 100, h: 22 }, fov: 40, ease: 'inOut' }] },
    sweep: { letterbox: true, hideHud: true, skippable: false, blendOut: 0.5, keys: [
      { t: 0, pos: { s: 1200, l: -120, h: 30 }, look: { s: 1300 }, fov: 55 },
      { t: 1.5, pos: { s: 1260, l: -40, h: 22 }, look: { s: 1400, l: 40 }, fov: 50 },
      { t: 3, pos: { s: 1320, l: 60, h: 26 }, look: { s: 1500, l: 80, h: 8 }, fov: 46, ease: 'inOut' }],
      during: [{ say: ['SYS', 'Sweep in progress.'] }, { wait: 1 }, { flag: ['p5.during', true] }] },
    bossCam: { follow: { tag: 'warden' }, timeScale: 0.6, keys: [
      { t: 0, pos: { s: 2150, l: -10, h: 12 }, look: [0, 0], fov: 45 },
      { t: 2.5, pos: { s: 2170, l: -20, h: 9 }, look: { x: 0, z: 0, h: 6 }, fov: 38 }] },
  },
  comms: {
    c_check: [{ who: 'SYS', text: 'Checklist line one.', hold: 0.4 }, { wait: 0.3 }, { who: 'RANGE', text: 'Checklist line two.', hold: 0.4 }],
    c_pa: [{ who: 'PA', text: 'Attention on the range.' }],
  },
  collectibles: [
    { id: 'cache_a', kind: 'salvage', at: { s: 420, l: -60 }, unlocks: 'mg_r12', label: 'Range cache' },
    { id: 'log_a', kind: 'log', at: { s: 1820, l: 70 }, codex: 'test_log', label: 'Range log' },
  ],
  start: [
    { objective: { add: 'o_reach' } },
    { say: ['OPS', 'Systems check complete. Move out.'] },
    { hint: { desktop: 'WASD move · Mouse aim · Shift quick boost', touch: 'Left thumb moves · BOOST dashes' } },
  ],
  onCheckpoint: {
    cp_mid: [{ say: ['SYS', 'Checkpoint restored.'] }],
    cp_yard: [{ say: ['SYS', 'Yard checkpoint restored.'] }, { flag: ['p5.yardRestored', true] }],
  },
  complete: { when: { objective: 'o_reach' }, do: [{ say: ['OPS', 'Proving run complete.'] }, { wait: 1 }] },
  custom: {
    install(ctx, mission) {
      const waves = new Set();
      const off = [ctx.events.on('encounter:wave', ({ id, wave }) => waves.add(`${id}:${wave}`))];
      off.push(ctx.events.on('level:cleared', () => { for (const f of off) f(); }));
      off.push(ctx.events.on('level:start', ({ fresh }) => { if (fresh) waves.clear(); }));
      mission.registerCondition('p5.flagged', (args, m) => !!m.flags[args?.flag]);
      mission.registerCondition('p5.wave', (args) => waves.has(`${args?.encounter}:${args?.wave}`));
      mission.registerAction('p5.count', (args, m) => { m.setFlag(args.flag, (m.flags[args.flag] || 0) + 1); });
      mission.registerAction('p5.addInteract', (args, m) => {
        m.addInteract({ id: 'i_beacon', at: { s: 1500, l: -60 }, r: 14, seconds: 1.5, label: 'Light beacon', flag: 'beacons', marker: true,
                        onDone: [{ say: ['RANGE', 'Beacon lit.'] }] });
      });
    },
  },
};
