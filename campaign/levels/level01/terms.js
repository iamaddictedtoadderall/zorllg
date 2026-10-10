// levels/level01/terms.js (P6) — the clarity pass (docs/todo.md, "Clarity pass: terms and radio messages").
//
// Every made-up word or mechanic Level 1 asks the player to understand gets a first-time explainer card: one or two
// plain sentences and the key to press. Cards go through P5's ctx.hud.explain({ id, term, text, key }) (feature-detected:
// until it lands nothing shows, and the level's own hints still teach the controls). P5 records each id in the pause
// menu's Field notes and no-ops ids it has already shown, so the ids here are campaign-wide, not prefixed by level.
//
// Pacing: the level asks for cards with { call: 'term', args: { id } } (or { ids: [...] }) at the moment a word first
// appears; the Explainer queues them and hands them to the HUD one at a time, at least GAP sim seconds apart, never
// during a cinematic, the drowning, or outside the 'playing' state. The queue lives in the mission flag 'l01:termQ', so a
// card asked for before a checkpoint but not yet shown comes back after a restart.
//
// Story rules (bible §5.5, A2 #4/#6): no card says "Moth" (no word containing those letters either: the spoiler grep in
// level01.mjs matches /moth/i), nothing explains the lattice, the kernel, the boot text, the drums or what a ghost is, and
// the vitals card gives only the innocent reading. Wake idioms ("Keep up", "Morning", "dry it") stay unexplained (bible
// §10 rule 7); words the player needs to act on are explained.

/** seconds between two cards */
export const GAP = 7;

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
                text: 'Your convoy: forty rigs and three hundred people, following the thaw. Everything you bring back is for them.' },
  water:      { term: 'Water',
                text: 'Out here ice is water, and water is life. The Wake counts it in tanks.' },
  skiffs:     { term: 'Raider skiffs',
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
  carbine:    { term: 'Lantern Carbine', key: K('Left click', 'FIRE'),
                text: "The frame's rifle, on the right arm. Aim near a target to lock on, then fire." },
  qb:         { term: 'Lateral thrust (quick boost)', key: K('Shift + direction', 'BOOST'),
                text: 'A sideways dash that dodges shots and snaps harpoon cables. It costs a chunk of EN.' },
  stagger:    { term: 'Stagger',
                text: 'Hit a target hard enough and it reels for a few seconds. Staggered targets take extra damage, and loose parts can be torn off them.' },
  tear:       { term: 'TEAR', key: K('Hold right click', 'Hold BLADE'),
                text: 'Rip a glinting part off a staggered enemy. When the TEAR prompt shows, hold the blade button: small enemies are destroyed and you keep the part.' },
  rack:       { term: 'The rack (haul)',
                text: 'Parts you tear off ride in a three-slot rack next to your weapons. When it is full, taking a new part means dropping one.' },
  bench:      { term: 'The Bench',
                text: "Oma Desh's workshop rig in the Wake; Oma is the convoy's elder and mechanic. Your haul goes there after the level, to bolt onto the frame or give away for water." },
  sledge:     { term: 'Sledges', key: K('Hold F', 'Hold INTERACT'),
                text: 'Water sledges lost in the raid. Stand beside one to plant a recovery flag; the Wake fetches it later, one tank of water each.' },
  harpoon_gaff: { term: 'Gaff Harpoon',
                text: "A skiff's grappling harpoon, now in your rack. Fitted at the Bench it replaces the blade: it reels small enemies in and pulls you to big ones." },
  shotgun_s8: { term: 'Sleet Gun',
                text: "A skiff's short-range scatter gun, now in your rack. Fitted at the Bench it replaces the rifle and staggers enemies fast up close." },
  flare_pod:  { term: 'Flare Pod',
                text: "A carrier's flare launcher, now in your rack. Fitted at the Bench it replaces the missiles: flares pull missiles away and blind what they hit." },
  cache:      { term: 'Salvage caches',
                text: 'Spare parts left in old wrecks and roosts. Pass close to one and the part goes straight into your rack.' },
  gleaners:   { term: 'Gleaners',
                text: 'Enemy scavenger drones with pale green lights. They collect the dead; shoot them down before they get away.' },
  psalter:    { term: 'Psalter Blade', key: K('Right click', 'BLADE'),
                text: "The frame's pulse blade, on the left arm. It lunges at your locked target, fast enough to catch flyers." },
  carrier:    { term: 'Gleaner carrier',
                text: 'A heavy drone that drops more Gleaners. Its flare pod glints: stagger the carrier and TEAR the pod off.' },
  // ── Z4 · the Abeyance
  ghost:      { term: 'Ghosts',
                text: "Enemy machines whose pale green light blinks once a second, like the Sexton by the landing pad. The Wake calls them ghosts and won't look at the light." },
  chorus:     { term: 'Chorus Rack', key: K('Q', 'MSL'),
                text: "The frame's shoulder missiles. Each volley fires at every target inside the reticle." },
  repair:     { term: 'Repair kits', key: K('R', 'KIT'),
                text: "Three kits that patch the frame's armour (AP) over a second. Checkpoints refill them." },
  turnback:   { term: 'Turnback',
                text: "The Wake's funeral fire. They burn their dead so the Gleaners can't take them." },
  rigs:       { term: 'Rigs',
                text: "The Wake's vehicles, crawlers, walkers and tankers that people live in. Each has a name, like Hardtack or Lark's Rest, painted on everything it owns." },
  // ── Z5 · the cut-line
  dredge:     { term: 'The Dredge',
                text: 'The enemy: the raiders, drones and machines that strip the ice and water before the Wake can reach it.' },
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

/** the card for one id, resolved for desktop or touch */
export function termCard(id, touch = false) {
  const t = TERMS[id];
  if (!t) return null;
  const pick = (v) => (v && typeof v === 'object' ? (touch ? v.touch : v.desktop) : v) ?? null;
  const card = { id, term: t.term, text: pick(t.text) };
  const key = pick(t.key);
  if (key) card.key = key;
  // both variants too, for a HUD that switches with the input mode (extra fields; P5 may ignore them)
  if (t.key && typeof t.key === 'object') card.keys = { ...t.key };
  return card;
}

/** the paced queue (one per level runtime) */
export class Explainer {
  constructor(L) {
    this.L = L;
    this.seen = new Set();     // shown (or offered to the HUD) this load; survives checkpoint restarts
    this.q = [];
    this.gap = 0;
    this.log = [];             // { id, t, shown } for tests and the debug overlay
  }
  /** queue one id or a list (unknown and already seen ids are ignored) */
  request(ids) {
    let changed = false;
    for (const id of [].concat(ids || [])) {
      if (!TERMS[id] || this.seen.has(id) || this.q.includes(id)) continue;
      this.q.push(id); changed = true;
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
  ready() {
    const ctx = this.L.ctx;
    const st = ctx.flow?.state;
    if (st && st !== 'playing') return false;
    if (ctx.cinematics?.active) return false;
    if (this.L.drown?.active) return false;
    return true;
  }
  update(dt) {
    this.gap -= dt;
    if (!this.q.length || this.gap > 0 || !this.ready()) return;
    const id = this.q.shift();
    this.save();
    this.deliver(id);
    this.gap = GAP;
  }
  deliver(id) {
    const ctx = this.L.ctx;
    this.seen.add(id);
    const card = termCard(id, !!ctx.input?.isTouch);
    const fn = ctx.hud?.explain;
    let shown = false;
    if (typeof fn === 'function') {
      try { fn.call(ctx.hud, card); shown = true; } catch (e) { ctx.recordError?.('level01', e); }
    }
    this.log.push({ id, t: +(ctx.clock?.time ?? 0).toFixed(2), shown });
  }
}
