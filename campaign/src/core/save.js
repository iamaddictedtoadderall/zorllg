// core/save.js (P0): versioned save store with migrations (§8.4).
import { clone } from './util.js';
import { DEFAULT_LOADOUT, startingUnlocks } from '../combat/loadout.js';

export const SAVE_VERSION = 1;
/** MIGRATIONS[v](data) upgrades a version-v save to version v+1 and returns it. */
export const MIGRATIONS = {};

const RANKS = ['S', 'A', 'B', 'C'];
const rankBetter = (a, b) => b == null || (a != null && RANKS.indexOf(a) >= 0 && RANKS.indexOf(a) < RANKS.indexOf(b));

function nowISO() { try { return new Date().toISOString(); } catch (e) { return ''; } }
function levelEntry(unlocked = false) {
  return { unlocked, completed: false, bestTime: null, bestRank: null, collectibles: [], completions: 0 };
}
export function freshSave() {
  const t = nowISO();
  return {
    version: SAVE_VERSION,
    createdAt: t, updatedAt: t,
    progress: { current: null, levels: { l01: levelEntry(true) } },
    garage: { loadout: clone(DEFAULT_LOADOUT), unlockedParts: startingUnlocks() },
    flags: {}, codex: [],
    stats: { playTime: 0, kills: 0, deaths: 0 },
  };
}

/** Fill missing fields so older or hand-edited saves never crash consumers. */
function normalize(d) {
  const f = freshSave();
  if (!d || typeof d !== 'object') return f;
  const out = { ...f, ...d };
  out.progress = { ...f.progress, ...(d.progress || {}) };
  out.progress.levels = { ...(d.progress?.levels || {}) };
  for (const [id, e] of Object.entries(out.progress.levels)) out.progress.levels[id] = { ...levelEntry(), ...e };
  if (!out.progress.levels.l01) out.progress.levels.l01 = levelEntry(true);
  if (out.progress.current && typeof out.progress.current !== 'object') out.progress.current = null;
  out.garage = { ...f.garage, ...(d.garage || {}) };
  out.garage.loadout = { ...clone(DEFAULT_LOADOUT), ...(d.garage?.loadout || {}) };
  out.garage.loadout.paint = { ...clone(DEFAULT_LOADOUT.paint), ...(d.garage?.loadout?.paint || {}) };
  if (!Array.isArray(out.garage.unlockedParts)) out.garage.unlockedParts = startingUnlocks();
  for (const p of startingUnlocks()) if (!out.garage.unlockedParts.includes(p)) out.garage.unlockedParts.push(p);
  out.flags = (d.flags && typeof d.flags === 'object') ? d.flags : {};
  out.codex = Array.isArray(d.codex) ? d.codex : [];
  out.stats = { ...f.stats, ...(d.stats || {}) };
  out.version = SAVE_VERSION;
  return out;
}

export class SaveStore {
  constructor(key = 'campaign.save') {
    this.key = key;
    this.data = freshSave();
  }
  /** Migrate older versions; if corrupt (or from an unknown future version), back up the raw value to key+'.bak' and start fresh. */
  load() {
    let raw = null;
    try { raw = localStorage.getItem(this.key); } catch (e) { raw = null; }
    if (!raw) { this.data = freshSave(); return this.data; }
    try {
      let d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Number.isInteger(d.version) || d.version < 1 || d.version > SAVE_VERSION) throw new Error('bad version');
      while (d.version < SAVE_VERSION) {
        const m = MIGRATIONS[d.version];
        if (!m) throw new Error('no migration from v' + d.version);
        d = m(d); d.version = (d.version | 0) + 1;
      }
      this.data = normalize(d);
    } catch (e) {
      console.warn('[save] corrupt save, backed up to', this.key + '.bak', e.message);
      try { localStorage.setItem(this.key + '.bak', raw); } catch (e2) { /* ignore */ }
      this.data = freshSave();
      this.write();
    }
    return this.data;
  }
  write() {
    this.data.updatedAt = nowISO();
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
  }
  reset() { this.data = freshSave(); this.write(); }
  hasProgress() {
    const p = this.data.progress;
    return !!p.current || Object.values(p.levels).some(l => l.completed);
  }
  _level(id) { return this.data.progress.levels[id] || (this.data.progress.levels[id] = levelEntry(false)); }
  unlockLevel(id) { this._level(id).unlocked = true; this.write(); }
  /** Keeps best time and best rank, counts completions, merges collectibles, applies unlocks.
   *  `unlocks` (optional, the level's def.unlocks) may also come as r.unlocks. */
  completeLevel(id, r, unlocks) {
    const e = this._level(id);
    e.unlocked = true; e.completed = true; e.completions = (e.completions | 0) + 1;
    if (r && Number.isFinite(r.time) && (e.bestTime == null || r.time < e.bestTime)) e.bestTime = r.time;
    if (r && rankBetter(r.rank, e.bestRank)) e.bestRank = r.rank;
    for (const c of r?.collectibles || []) if (!e.collectibles.includes(c)) e.collectibles.push(c);
    if (r && Number.isFinite(r.kills)) this.data.stats.kills += r.kills;
    const u = unlocks || r?.unlocks;
    for (const l of u?.levels || []) this._level(l).unlocked = true;
    for (const p of u?.parts || []) if (!this.data.garage.unlockedParts.includes(p)) this.data.garage.unlockedParts.push(p);
    if (this.data.progress.current?.levelId === id) this.data.progress.current = null;
    this.write();
  }
  setCheckpoint(levelId, cp) {
    this.data.progress.current = { levelId, checkpoint: cp ? clone(cp) : null };
    this.write();
  }
  getCheckpoint(levelId) {
    const c = this.data.progress.current;
    return c && c.levelId === levelId ? (c.checkpoint ? clone(c.checkpoint) : null) : null;
  }
  setFlag(k, v) { this.data.flags[k] = v; this.write(); }
  getFlag(k) { return this.data.flags[k]; }
  addCodex(id) { if (!this.data.codex.includes(id)) { this.data.codex.push(id); this.write(); } }
  setLoadout(lo) { this.data.garage.loadout = clone(lo); this.write(); }
  getLoadout() { return clone(this.data.garage.loadout); }
  unlockPart(id) { if (!this.data.garage.unlockedParts.includes(id)) { this.data.garage.unlockedParts.push(id); this.write(); } }
  unlockedParts() { return new Set(this.data.garage.unlockedParts); }
  addPlayTime(sec) { if (Number.isFinite(sec) && sec > 0) this.data.stats.playTime += sec; }
  exportJSON() { return JSON.stringify(this.data); }
  importJSON(s) {
    try {
      let d = JSON.parse(s);
      if (!d || !Number.isInteger(d.version) || d.version < 1 || d.version > SAVE_VERSION) return false;
      while (d.version < SAVE_VERSION) { const m = MIGRATIONS[d.version]; if (!m) return false; d = m(d); d.version++; }
      this.data = normalize(d);
      this.write();
      return true;
    } catch (e) { return false; }
  }
}
