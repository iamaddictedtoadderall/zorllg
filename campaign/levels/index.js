// levels/index.js (P6) — level registry and loader (arch §4.6). The 'test' entry (P5's proving ground) MUST stay.
// Titles here are public and spoiler-safe (§8.6, bible §0): only the eight public level names may appear.
// Level files are imported lazily, so later levels' text is not in memory until they are played.

export const LEVELS = [
  { id: 'test', title: 'Proving Ground', file: 'test.js', order: 0, hidden: true },
  { id: 'l01', title: 'THAW', file: 'level01.js', order: 1 },
];

const cache = new Map();
/** dynamic import(`./${file}`) → default export (cached per session; a failed import is retried next time) */
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
