// levels/test.js (P5) — "Proving Ground": a 2.5 km dev level (hidden from level select unless ?debug).
// P0 seed: 2 zones, 2 checkpoints, a reach objective, one drone encounter and its trigger, a few generic structures.
// P5 grows this until it exercises every action, condition and objective kind in §6. Placeholder text, no story.

export default {
  id: 'test', title: 'Proving Ground', subtitle: 'Systems shakedown', order: 0, seed: 4242,
  par: { time: 300, damage: 9000 },
  briefing: {
    header: 'DEV', title: 'Proving Ground', subtitle: 'Systems shakedown',
    body: 'Walk the proving ground from the drop point to the far marker.\nDrones will test your reflexes on the way.',
    objectives: ['Reach the far marker'], fine: 'Development level. Not part of the campaign.',
  },
  speakers: {
    OPS: { name: 'OPERATIONS', color: '#e9e3d3', voice: { base: 520, wave: 'square' } },
    SYS: { name: 'SYSTEM', color: '#8fd2c6', style: 'system' },
  },
  factions: { hostile: { shell: '#bdb6a8', accent: '#8f2a22', eye: '#ff3b1f' } },
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
    { id: 'z_flats', range: [0, 1250], name: 'Flats', card: { title: 'THE FLATS', sub: 'Proving ground · sector 1' },
      structures: [
        { id: 'stack_a', type: 'container_stack', at: { s: 420, l: -90 }, yaw: 'route' },
        { id: 'tower_a', type: 'watchtower', at: { s: 900, l: 110 }, yaw: 'route' },
      ] },
    { id: 'z_ridge', range: [1250, 2542], name: 'Ridge', card: { title: 'THE RIDGE', sub: 'Proving ground · sector 2' },
      art: { fog: { density: 0.0019 }, grade: { saturation: 0.95 } },
      structures: [
        { id: 'bunker_a', type: 'bunker', at: { s: 1800, l: -130 }, yaw: 'route' },
        { type: 'wall', at: { s: 2050, l: -85 }, yaw: 'route', params: { length: 80 } },
        { type: 'wall', at: { s: 2050, l: 85 }, yaw: 'route', params: { length: 80 } },
        { id: 'relay', type: 'relay_pylon', at: { s: 2300, l: 100 },
          destructible: { ap: 3600, name: 'RELAY', tag: 'relay' } },
      ] },
  ],
  checkpoints: [
    { id: 'cp_start', at: { s: 30 }, yaw: 'route', label: 'Drop point' },
    { id: 'cp_mid', at: { s: 1300 }, yaw: 'route', label: 'Ridge approach' },
  ],
  objectives: [
    { id: 'o_reach', text: 'Reach the far marker', kind: 'reach', at: { s: 2450 }, r: 80, marker: true },
  ],
  encounters: [
    { id: 'e_drones', tag: 'drones', units: [{ kind: 'drone', count: 3, at: { s: 700, l: -40 }, spread: 40 }] },
  ],
  triggers: [
    { id: 't_drones', when: { pass: 500 }, do: [{ spawn: 'e_drones' }, { say: ['OPS', 'Contacts ahead. Light drones.'] }] },
    { id: 't_mid', when: { pass: 1300 }, do: [{ checkpoint: 'cp_mid' }] },
  ],
  start: [
    { objective: { add: 'o_reach' } },
    { say: ['OPS', 'Systems check complete. Move out.'] },
    { hint: { desktop: 'WASD move · Mouse aim · Shift quick boost', touch: 'Left thumb moves · BOOST dashes' } },
  ],
  onCheckpoint: { cp_mid: [{ say: ['SYS', 'Checkpoint restored.'] }] },
  complete: { when: { objective: 'o_reach' }, do: [{ say: ['OPS', 'Proving run complete.'] }, { wait: 1 }] },
};
