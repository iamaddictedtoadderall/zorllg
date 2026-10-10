// levels/level01/terms.js (P6) — the clarity pass (docs/todo.md, "Clarity pass: terms and radio messages").
//
// Every made-up word or mechanic Level 1 asks the player to understand gets a first-time explainer card: one or two
// plain sentences and, where one applies, the key to press. Cards go through P5's ctx.hud.explain({ id, term, text, key })
// (feature-detected: until it lands nothing shows, and the level's own hints still teach the controls). P5 records each
// id in the pause menu's Field notes and no-ops ids it has already shown, so the ids here are campaign-wide, not
// prefixed by level.
//
// Pacing: the level asks for cards with { call: 'term', args: { ids: [...] } } at the moment a word first appears (the
// same trigger as the line or objective that uses it). The Explainer queues them and hands them to the HUD one at a time:
// only while the game is 'playing', never during a cinematic or the drowning, and only once the HUD's own card queue is
// idle (hud.explainState is null), so a card is never stuck behind a long backlog and still on screen near its moment.
// Without explainState it falls back to one card every GAP seconds. The queue lives in the mission flag 'l01:termQ', so
// a card asked for before a checkpoint but not yet handed over comes back after a restart.
//
// Writing rules for the cards
//  · A card uses only words the player has already met, or explains them in place (no "rig" before the rigs card, no
//    "Dredge" before the Dredge card). The weapon cards are titled with the HUD's plain name (P5: Rifle, Blade, Missiles,
//    Repair kits) and give the frame's own name in the sentence, because that name is what the comms say ("Chorus…").
//    Titles stay short (one or two words) so they fit the card on one line beside the key.
//  · Story rules (bible §5.5, A2 #4/#6): no card says "Moth" (no word containing those letters either: the spoiler grep
//    in level01.mjs matches /moth/i), nothing explains the lattice, the kernel, the boot text, what a Cantor is, what is
//    in the drums or what a ghost is, and the vitals card gives only the innocent reading. Never "dead", "ghost",
//    "carried", "passenger" or "body" about the pilot.
//  · Wake idioms in dialogue stay unexplained in the dialogue itself (bible §10 rule 7: "Morning", "Keep up", "dry it"
//    are never glossed); the cards explain only words the player needs to act on or to follow the story.

/** seconds between two cards when the HUD can't report its queue (fallback pacing) */
export const GAP = 7;
/** seconds after the HUD's queue goes idle before the next card is handed over */
export const IDLE_GAP = 1.5;
/** cards about something the player can (or must) do right now jump ahead of background terms in the queue, so in a
 *  busy fight the TEAR card arrives while the TEAR prompt is up, not after a backlog of vocabulary */
export const URGENT = new Set(['stagger', 'tear', 'qb', 'sledge', 'skiffs', 'carrier', 'floodlight', 'collar', 'icing', 'rot', 'latch']);

const K = (desktop, touch) => ({ desktop, touch });

/**
 * id → { term, text, key? }. `text` and `key` are a string, or { desktop, touch } resolved when the card is shown.
 * Order here is the order the level introduces them (for reading; delivery order is the queue's).
 */
export const TERMS = {
  // ── Z1 · the cut
  cutter:     { term: 'The cutter', key: K('Right click: saw', 'BLADE: saw'),
                text: 'Your small ice-cutting walker. It has a saw and no weapons, so it cannot fight anything.' },
  kite:       { term: "Kit's kite",
                text: 'Your brother Kit flies a kite-drone from his buggy, Tick. It scouts ahead and marks things for you.' },
  wake:       { term: 'The Wake',
                text: 'Your convoy: three hundred people living in forty vehicles, following the thaw. Everything you bring back is for them.' },
  water:      { term: 'Water',
                text: 'Out here ice is water, and water is life. The Wake counts it in tanks.' },
  skiffs:     { term: 'Raider skiffs', key: K('W A S D', 'Left thumb'),
                text: 'Fast ice yachts crewed by raiders, armed with harpoons and guns. The cutter cannot fight back: run.' },
  vitals:     { term: 'Vitals',
                text: 'The heart trace beside your armour bar: your pulse, read by the cockpit sensors. It climbs under fire.' },
  // ── Z2 · under the ice
  frame:      { term: 'The frame', key: K('W A S D', 'Left thumb'),
                text: 'The old war machine you climbed into, about eleven metres tall. Its systems are cold and come back one at a time; for now it can only walk.' },
  remembered: { term: 'Remembered systems',
                text: "When the frame says '… remembered', one of its systems is back and a new control works. Anything still cold shows OFFLINE on your HUD." },
  en:         { term: 'EN (energy)', key: K('Space', 'JUMP'),
                text: "The frame's energy bar. Jumping, hovering and boosting burn it, and it refills when you ease off." },
  // ── Z3 · the Teeth
  ap:         { term: 'AP (armour)',
                text: "The frame's armour. Hits wear it down, and if it reaches zero you go back to the last checkpoint." },
  carbine:    { term: 'Rifle', key: K('Left click', 'FIRE'),
                text: "The frame's rifle, the Lantern Carbine, on the right arm. Aim near a target to lock on, then fire; E holds the lock." },
  qb:         { term: 'Quick boost', key: K('Shift + direction', 'BOOST'),
                text: "The frame's lateral thrust: a sideways dash that dodges shots and snaps harpoon cables. It costs a chunk of EN." },
  stagger:    { term: 'Stagger',
                text: 'Hit a target hard enough and it reels for a few seconds. Staggered targets take extra damage, and loose parts can be torn off them.' },
  tear:       { term: 'TEAR', key: K('Hold right click', 'Hold BLADE'),
                text: 'When a staggered enemy shows an amber glint and you are close, the TEAR prompt appears: hold the blade button to rip that part off. Smaller enemies break apart, and the part is yours.' },
  rack:       { term: 'The haul rack',
                text: 'Torn-off parts, your haul, ride in a three-slot rack beside your weapons. When it is full, taking a new part means dropping one.' },
  bench:      { term: 'The Bench',
                text: "Oma Desh's workshop, a tracked vehicle in the Wake; Oma is the convoy's elder and mechanic. After the level your haul goes there, to bolt onto the frame or to give away for water." },
  sledge:     { term: 'Sledges', key: K('F', 'INTERACT'),
                text: 'Water sledges lost in the raid. Stand next to one and press the key to plant a recovery flag; the Wake fetches it later, one tank of water each.' },
  harpoon_gaff: { term: 'Gaff Harpoon',
                text: "A skiff's grappling harpoon, now in your rack. Fitted at the Bench it replaces the blade: it reels small enemies in and pulls you to big ones." },
  shotgun_s8: { term: 'Sleet Gun',
                text: "A skiff's short-range shotgun, now in your rack. Fitted at the Bench it replaces the rifle and staggers enemies fast up close." },
  flare_pod:  { term: 'Flare Pod',
                text: "A carrier's flare launcher, now in your rack. Fitted at the Bench it replaces the missiles: flares pull missiles away and blind what they hit." },
  cache:      { term: 'Salvage caches',
                text: 'Spare parts left in old wrecks and roosts. Pass close to one and the part goes straight into your rack.' },
  gleaners:   { term: 'Gleaners',
                text: 'Enemy scavenger drones with pale green lights. They collect the dead, and they attack anyone who comes close.' },
  psalter:    { term: 'Blade', key: K('Right click', 'BLADE'),
                text: "The frame's pulse blade, the Psalter Blade, on the left arm. It lunges at your locked target, fast enough to catch flyers." },
  carrier:    { term: 'Gleaner carrier', key: K('Hold right click', 'Hold BLADE'),
                text: 'A heavy drone that drops more Gleaners. Its flare pod glints: stagger the carrier, then TEAR the pod off.' },
  decoys:     { term: 'Enemy flares',
                text: 'Carriers throw flares that pull your missiles off course. Tear the flare pod off a staggered carrier to stop them.' },
  // ── Z4 · the Abeyance
  ghost:      { term: 'Ghosts',
                text: "Enemy machines with a pale green light that blinks once a second, like the Sexton ahead. The Wake calls them ghosts, and won't look at the light." },
  chorus:     { term: 'Missiles', key: K('Q', 'MSL'),
                text: "The Chorus Rack: the frame's shoulder missiles, the 'Chorus' it just remembered. Each volley fires at every target inside the reticle." },
  repair:     { term: 'Repair kits', key: K('R', 'KIT'),
                text: "Three kits that patch the frame's armour (AP) over a second. Checkpoints refill them." },
  turnback:   { term: 'Turnback',
                text: "The Wake's funeral fire. They burn their dead so the Gleaners can't take them." },
  rigs:       { term: 'Rigs',
                text: "The Wake's vehicles: crawlers, walkers and tankers that people live in. Each one has a name, like Hardtack, painted on everything it owns." },
  // ── Z5 · the cut-line
  dredge:     { term: 'The Dredge',
                text: 'The enemy: the raiders, drones and big machines that strip the ice and water before the Wake can reach it.' },
  icebreaker: { term: 'The Icebreaker',
                text: 'A Dredge drill-crawler the size of a building, sawing the shelf into floes. Its hull shrugs off fire: break its three drill heads.' },
  floodlight: { term: 'Floodlight',
                text: "While the Icebreaker's floodlight is on you, its guns aim better and your HUD warns SPOTTED. Stay out of the beam." },
  collar:     { term: 'The collar',
                text: 'The glowing ring at the base of the bow drill. It only takes damage from below, so get down on the floes and fire up at it.' },
  // ── Z6 · the floes
  icing:      { term: 'Iced vents', key: K('Space', 'JUMP'),
                text: "Water froze in the frame's vents. Hovering now burns EN twice as fast, so hop from floe to floe." },
  rot:        { term: 'Rotting ice',
                text: "In direct sun, gold-lit floes crack and sink about three seconds after you land. Blue floes in an iceberg's shade hold." },
  latch:      { term: 'Latched Gleaners', key: K('Shift', 'BOOST'),
                text: 'A Gleaner on your back drains armour and slows you. A quick boost or the blade shakes it off.' },
};

/** the card as handed to hud.explain: text and key stay { desktop, touch } pairs, which P5 resolves per device when the
 *  card is shown (and keeps both in the Field notes) */
export function termEntry(id) {
  const t = TERMS[id];
  if (!t) return null;
  const card = { id, term: t.term, text: t.text };
  if (t.key) card.key = t.key;
  return card;
}

/** the card for one id, resolved for desktop or touch */
export function termCard(id, touch = false) {
  const t = TERMS[id];
  if (!t) return null;
  const pick = (v) => (v && typeof v === 'object' ? (touch ? v.touch : v.desktop) : v) ?? null;
  const card = { id, term: t.term, text: pick(t.text) };
  const key = pick(t.key);
  if (key) card.key = key;
  // both variants too, for a HUD that switches with the input mode (extra field; P5 may ignore it)
  if (t.key && typeof t.key === 'object') card.keys = { ...t.key };
  return card;
}

/** the paced queue (one per level runtime) */
export class Explainer {
  constructor(L) {
    this.L = L;
    this.seen = new Set();     // handed to the HUD this load; survives checkpoint restarts
    this.q = [];
    this.gap = 0;
    this.log = [];             // { id, t, shown, cp } for tests and the debug overlay
  }
  /** queue one id or a list (unknown and already seen ids are ignored) */
  request(ids) {
    let changed = false;
    for (const id of [].concat(ids || [])) {
      if (!TERMS[id] || this.seen.has(id) || this.q.includes(id)) continue;
      const at = URGENT.has(id) ? this.q.findIndex(x => !URGENT.has(x)) : -1;
      if (at < 0) this.q.push(id); else this.q.splice(at, 0, id);
      changed = true;
      this.L.ctx.events?.emit?.('l01:term', { id });   // tests: when each card was first asked for
    }
    if (changed) this.save();
  }
  save() { this.L.setFlag('l01:termQ', [...this.q]); }
  /** level:start: the snapshot's pending cards come back; a fresh start starts empty */
  reset() {
    const f = this.L.flag('l01:termQ');
    this.q = Array.isArray(f) ? f.filter(id => TERMS[id] && !this.seen.has(id)) : [];
    this.gap = Math.min(this.gap, 2);
  }
  /** the game is in a state where a card can be read */
  ready() {
    const ctx = this.L.ctx;
    const st = ctx.flow?.state;
    if (st && st !== 'playing') return false;
    if (ctx.cinematics?.active) return false;
    if (this.L.drown?.active) return false;
    if (ctx.hud?.choosing) return false;
    // the story's own beats stay clear: the fall and the boot over black, and the shore from the kneel to the naming
    if (this.L.flag('p:fell') && !this.L.flag('p:awake')) return false;
    if (this.L.flag('p:shore')) return false;
    return true;
  }
  /** P5's card queue: true while it has a card up or waiting; null when the HUD can't say */
  hudBusy() {
    const hud = this.L.ctx.hud;
    if (!hud || !('explainState' in hud)) return null;
    try { return hud.explainState != null; } catch (e) { return null; }
  }
  update(dt) {
    if (!this.q.length) { this.gap = Math.max(0, this.gap - dt); return; }
    if (!this.ready()) return;
    const busy = this.hudBusy();
    if (busy) { this.gap = Math.max(this.gap, IDLE_GAP); return; }   // wait for the card on screen to finish
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
      try { shown = fn.call(ctx.hud, card) !== false; } catch (e) { ctx.recordError?.('level01', e); }
    }
    this.log.push({ id, t: +(ctx.clock?.time ?? 0).toFixed(2), shown, cp: this.L.mission?.checkpoint ?? null });
    ctx.events?.emit?.('l01:termDelivered', { id, shown });   // tests
  }
}
