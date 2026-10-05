// Playtest log: one record per play session, kept in the artifact's private store (owner-only)
// so a playthrough can be reviewed afterwards. Does nothing when no store is available.
let db = null, sid = '', t0 = 0, meta = {}, getStatus = () => ({});
let chunk = [], chunkNo = 0, writing = false, dirty = false, dead = false, timer = 0;
const CHUNK = 60;          // events per stored document

export function init(store, info, status) {
  if (!store || db) return;
  db = store; getStatus = status || getStatus;
  sid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  t0 = performance.now();
  meta = { ...info, started: new Date().toISOString() };
  log('start', info);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
export const active = () => !!db && !dead;

export function log(k, data = {}) {
  if (!db || dead) return;
  // round-trip through JSON so undefined fields never reach the store (it rejects them)
  chunk.push(JSON.parse(JSON.stringify({ t: Math.round((performance.now() - t0) / 100) / 10, k, ...data })));
  dirty = true;
  if (chunk.length >= CHUNK) flush();
  else if (!timer) timer = setTimeout(() => { timer = 0; flush(); }, 6000);
}

export async function flush() {
  if (!db || dead || writing || !dirty) return;
  writing = true; dirty = false;
  const n = chunkNo, events = chunk.slice();
  if (events.length >= CHUNK) { chunk = []; chunkNo++; }   // later events go to the next document
  try {
    await db.doc(`playtests/${sid}/chunks/${String(n).padStart(4, '0')}`).set({ n, events });
    await db.doc(`playtests/${sid}`).set({ ...meta, ...getStatus(), updated: new Date().toISOString(), chunks: chunkNo + (chunk.length ? 1 : 0) });
  } catch (e) {
    if (['quota_exceeded', 'invalid_argument', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e && e.code)) dead = true;
    else dirty = true;
  }
  writing = false;
  if (dirty && !dead && !timer) timer = setTimeout(() => { timer = 0; flush(); }, 6000);
}
