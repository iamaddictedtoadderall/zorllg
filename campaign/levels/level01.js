// levels/level01.js (P6) — P0 PLACEHOLDER: a 4 km route, one zone, start and end checkpoints, title "Level 1".
// It has no `complete` block, so the stub mission completes it at the route end. P6 replaces all of it.

export default {
  id: 'l01', title: 'Level 1', subtitle: 'Placeholder', order: 1, seed: 101,
  par: { time: 420, damage: 9000 },
  briefing: {
    title: 'Level 1', subtitle: 'Placeholder briefing',
    body: 'Placeholder. Cross the region from the drop point to the far end of the route.',
    objectives: ['Reach the end of the route'],
  },
  speakers: { OPS: { name: 'OPERATIONS', color: '#e9e3d3' } },
  factions: { hostile: { shell: '#9a958a', accent: '#8f2a22', eye: '#ff3b1f' } },
  unlocks: { levels: [], parts: [] },
  route: { points: [[0, 0], [200, -1000], [-150, -2100], [100, -3000], [0, -4000]], halfWidth: 450 },
  terrain: { base: { scale: 900, amp: 120, ridged: 0.3, warp: 80 }, detail: { scale: 22, amp: 1.5 }, walls: { height: 260 } },
  art: {},
  zones: [{ id: 'z_all', range: [0, 4200], name: 'Level 1', card: { title: 'LEVEL 1' } }],
  checkpoints: [
    { id: 'cp_start', at: { s: 30 }, yaw: 'route', label: 'Start' },
    { id: 'cp_end', at: { s: 3900 }, yaw: 'route', label: 'End' },
  ],
  objectives: [],
  encounters: [],
  triggers: [{ id: 't_end', when: { pass: 3880 }, do: [{ checkpoint: 'cp_end' }] }],
  start: [{ hint: 'Placeholder level · follow the route to the end' }],
};
