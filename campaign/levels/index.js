// levels/index.js (P6) — level registry and loader. P0 seeds 'test' (dev-only) and 'l01'. P6 MUST keep the test entry.
// Titles here are public and spoiler-safe (§8.6).

export const LEVELS = [
  { id: 'test', title: 'Proving Ground', file: 'test.js', order: 0, hidden: true },
  { id: 'l01', title: 'Level 1', file: 'level01.js', order: 1 },
];

const cache = new Map();
/** dynamic import(`./${file}`) → default export (cached per session) */
export function loadLevel(id) {
  const e = LEVELS.find(l => l.id === id);
  if (!e) return Promise.reject(new Error(`Unknown level "${id}"`));
  if (!cache.has(id)) cache.set(id, import(`./${e.file}`).then(m => m.default).catch(err => { cache.delete(id); throw err; }));
  return cache.get(id);
}

/** the next non-hidden level by order, or null after the last one */
export function nextLevel(id) {
  const list = LEVELS.filter(l => !l.hidden).sort((a, b) => a.order - b.order);
  const i = list.findIndex(l => l.id === id);
  return i >= 0 && i + 1 < list.length ? list[i + 1].id : null;
}
