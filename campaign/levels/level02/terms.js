// levels/level02/terms.js — the clarity pass for Level 2 (docs/todo.md, L2 §5.2): a plain-English card the first time
// each term or mechanic matters, paced one at a time through P5's ctx.hud.explain({ id, term, text, key }).
//
// Ids are campaign-wide (the HUD records each in save.flags.glossary and no-ops one it has shown), so this level also
// re-requests Level 1's basics at their first moment here (tear, rack, stagger, qb, dredge, ghost, rigs, bench, water,
// wake): a player who met them in Level 1 sees nothing, one who starts here gets them. Their texts are written for the
// steppe (no Level 1 places), with the same meaning.
//
// Writing rules (as Level 1's terms.js, L2 §5.2): plain words; only words the player has already met or explained in
// place; titles one or two words; never explain the lattice, the kernel, what the fragments really are, what a Cantor is,
// why the Watcher's voice is on the local channel, or what a handshake really is; never "dead", "ghost", "carried",
// "passenger" or "body" about the pilot.
//
// Pacing (Level 1's proven Explainer): the level asks with { call: 'term', args: { ids } } at the moment a word first
// appears; the queue hands cards over only while the game is 'playing', never during a shot or an interstitial, and only
// when the HUD's own card queue is idle. Urgent cards (something to do right now) jump the queue. The queue lives in the
// mission flag 'l02:termQ', so a card asked for before a checkpoint but not yet shown comes back after a restart.

export const GAP = 7;
export const IDLE_GAP = 1.5;
export const URGENT = new Set(['harpooned', 'second_sight', 'moth_drives', 'hold', 'boarding', 'tally', 'big_mercy', 'water_cache',
                               'tear', 'qb', 'stagger']);

const K = (desktop, touch) => ({ desktop, touch });

/** id → { term, text, key? } (`text` and `key` a string or { desktop, touch }) */
export const TERMS = {
  // ── Level 1's basics, re-requested at their first moment here ──
  wake:       { term: 'The Wake',
                text: 'Your convoy: three hundred people living in forty vehicles, following the thaw. Everything you bring back is for them.' },
  rigs:       { term: 'Rigs',
                text: "The Wake's vehicles: crawlers, walkers and tankers that people live in. Each one has a name, like Big Mercy, painted on everything it owns." },
  bench:      { term: 'The Bench',
                text: "Oma Desh's workshop, a tracked rig in the Wake; Oma is the convoy's elder and mechanic. After the level your haul goes there, to bolt onto the frame or to give away for water." },
  water:      { term: 'Water',
                text: 'Water is life out here. The Wake counts it in tanks, and every tank brought back keeps people walking.' },
  stagger:    { term: 'Stagger',
                text: 'Hit a target hard enough and it reels for a few seconds. Staggered targets take extra damage, and loose parts can be torn off them.' },
  tear:       { term: 'TEAR', key: K('Hold right click', 'Hold BLADE'),
                text: 'When a staggered enemy shows a glint and you are close, the TEAR prompt appears: hold the blade button to rip that part off. Smaller enemies break apart, and the part is yours.' },
  rack:       { term: 'The haul rack',
                text: 'Torn-off parts, your haul, ride in a three-slot rack beside your weapons. When it is full, taking a new part means dropping one.' },
  qb:         { term: 'Quick boost', key: K('Shift + direction', 'BOOST'),
                text: "The frame's sideways dash: it dodges shots and snaps cables that hook you. It costs a chunk of energy (EN)." },
  dredge:     { term: 'The Dredge',
                text: 'The enemy: the raiders, drones and big machines that strip the land of water before the Wake can reach it.' },
  ghost:      { term: 'Ghosts',
                text: "Enemy machines with a pale green light that blinks once a second. The Wake calls them ghosts, and won't look at the light." },

  // ── Level 2 (L2 §5.2, verbatim) ──
  convoy:     { term: 'Escorting the Wake',
                text: "The Wake drives north at its own pace and won't wait for you. Stay within about 700 m of it (the HUD warns you when you stray) and keep raiders off its rigs." },
  sundial:    { term: 'The Sundial',
                text: 'A tower about a kilometre tall, built by Gaunt\'s first settlers and leaning toward the north. The Wake steers by it, and tonight it camps in its shadow.' },
  still:      { term: 'The Still',
                text: 'The far north, where the sun never rises or sets. The Wake is walking there, because people say nobody there has to walk any more.' },
  land_yacht: { term: 'Land-yachts',
                text: 'Raider sail-boats on wheels: fast, and lightly armoured. They hide low in the reeds, so watch for reeds parting before you see a sail.' },
  harpooned:  { term: 'Harpooned rigs', key: K('Right click', 'BLADE'),
                text: 'A raider has hooked a rig with a cable and is dragging it away. You have 25 seconds: shoot or blade the cable, or destroy whatever is pulling it.' },
  rig_lost:   { term: 'Lost rigs',
                text: 'A rig dragged away is gone, with everyone aboard. It comes off the Wake Roll, the convoy\'s list of rigs and people, at the end of the day.' },
  sail_rig:   { term: 'Sail-Rig',
                text: "A land-yacht's sail booster, now in your rack. Fitted at the Bench, it makes long straight runs faster and their quick boosts free, but you can't chain quick boosts." },
  water_cache: { term: 'Water caches', key: K('F', 'INTERACT'),
                text: 'Tanks of water left out here by an earlier convoy. Stand next to them and press the key to flag them; the Wake picks them up, one tank each.' },
  harpooner:  { term: 'Harpooners', key: K('Shift', 'BOOST'),
                text: 'Slow raider walkers with cable guns. They winch rigs in toward them. A quick boost snaps a cable that hooks you.' },
  rivet_driver: { term: 'Rivet Driver',
                text: "A harpooner's rivet gun, now in your rack. Fitted at the Bench it replaces the rifle: slow, heavy bolts that stagger and slow what they hit." },
  sync:       { term: 'Sync',
                text: 'The segmented bar under your armour. It fills as you fight well (damage dealt, close dodges, TEARs) and never drains on its own. Spend it on partner moves, where the frame works with you.' },
  second_sight: { term: 'Second Sight', key: K('C', 'SIGHT'),
                text: 'Costs 3 Sync. For 6 seconds time slows, every shot coming at you shows its path, and enemies about to strike flash red.' },
  tally:      { term: 'The Tally',
                text: 'The raiders\' flagship: an 80 m land-yacht with three masts, commanded by Rusk, the Tallyman. Its three winch turrets each hold a cable on Big Mercy.' },
  big_mercy:  { term: 'Big Mercy',
                text: "The Wake's water tanker: four tanks of water and four people. If the Tally drags it to the far edge of the salt flats, it's gone." },
  boarding:   { term: 'Boarding', key: K('Space', 'JUMP'),
                text: 'The Tally has anchored to fight. Jump onto its deck and break the mainmast at its base; shots from far away barely scratch it.' },
  moth_drives: { term: 'Moth Drives', key: K('V', 'DRIVE'),
                text: 'Costs 4 Sync. For 8 seconds the frame moves and dodges by itself, keeping a good range, while you aim and fire.' },
  hold:       { term: 'Hold',
                text: 'Automatic, 6 Sync. When a hit would wreck the frame, Hold spends the Sync, leaves you 1 armour point and makes you untouchable for 2 seconds.' },
  crane_claw: { term: 'Crane-Claw',
                text: "A boarding crane's claw, now in your rack. Fitted at the Bench it replaces the blade: grab a staggered enemy, then throw it." },
  skimmers:   { term: 'Skimmers',
                text: 'Fast enemy hover-sleds with missile pods. They carry the pale green light.' },
  hungry:     { term: 'Hungry parts',
                text: "Some parts glint pale green instead of amber. They're stronger, but the frame can only run one by clearing some of its stored memory to make room. You choose at the Bench." },
  skate_jets: { term: 'Skate-Jets',
                text: "A Skimmer's hover-legs, now in your rack, and a hungry part. Fitted at the Bench they make the frame much faster on the ground and let it skim across water." },
  founders:   { term: 'The Founders',
                text: "Gaunt's first settlers, more than a hundred years ago. They built the Sundial and the old road, and wrote the same words on everything they made." },
};

/** the card as handed to hud.explain: text and key stay { desktop, touch } pairs (the HUD resolves them per device) */
export function termEntry(id) {
  const t = TERMS[id];
  if (!t) return null;
  const card = { id, term: t.term, text: t.text };
  if (t.key) { card.key = t.key; if (typeof t.key === 'object') card.keys = { ...t.key }; }
  return card;
}

/** the paced queue (one per level runtime) */
export class Explainer {
  constructor(L) {
    this.L = L;
    this.seen = new Set();     // handed to the HUD this load; survives checkpoint restarts
    this.q = [];
    this.gap = 0;
    this.log = [];             // { id, t, shown, cp } for tests
  }
  /** queue one id or a list (unknown and already seen ids are ignored) */
  request(ids) {
    let changed = false;
    for (const id of [].concat(ids || [])) {
      if (!TERMS[id] || this.seen.has(id) || this.q.includes(id)) continue;
      const at = URGENT.has(id) ? this.q.findIndex(x => !URGENT.has(x)) : -1;
      if (at < 0) this.q.push(id); else this.q.splice(at, 0, id);
      changed = true;
      this.L.ctx.events?.emit?.('l02:term', { id });   // tests: when each card was first asked for
    }
    if (changed) this.save();
  }
  save() { this.L.setFlag('l02:termQ', [...this.q]); }
  /** level:start: the snapshot's pending cards come back; a fresh start starts empty */
  reset() {
    const f = this.L.flag('l02:termQ');
    this.q = Array.isArray(f) ? f.filter(id => TERMS[id] && !this.seen.has(id)) : [];
    this.gap = Math.min(this.gap, 2);
  }
  ready() {
    const ctx = this.L.ctx;
    const st = ctx.flow?.state;
    if (st && st !== 'playing') return false;
    if (ctx.cinematics?.active) return false;
    if (ctx.hud?.choosing) return false;
    if (this.L.flag('p:ending')) return false;
    return true;
  }
  hudBusy() {
    const hud = this.L.ctx.hud;
    if (!hud || !('explainState' in hud)) return null;
    try { return hud.explainState != null; } catch (e) { return null; }
  }
  update(dt) {
    if (!this.q.length) { this.gap = Math.max(0, this.gap - dt); return; }
    if (!this.ready()) return;
    const busy = this.hudBusy();
    if (busy) { this.gap = Math.max(this.gap, IDLE_GAP); return; }
    this.gap -= dt;
    if (this.gap > 0) return;
    const id = this.q.shift();
    this.save();
    this.deliver(id);
    this.gap = busy === null ? GAP : IDLE_GAP;
  }
  deliver(id) {
    const ctx = this.L.ctx;
    this.seen.add(id);
    const card = termEntry(id);
    const fn = ctx.hud?.explain;
    let shown = false;
    if (typeof fn === 'function') {
      try { shown = fn.call(ctx.hud, card) !== false; } catch (e) { ctx.recordError?.('level02', e); }
    }
    this.log.push({ id, t: +(ctx.clock?.time ?? 0).toFixed(2), shown, cp: this.L.mission?.checkpoint ?? null });
    ctx.events?.emit?.('l02:termDelivered', { id, shown });
  }
}
