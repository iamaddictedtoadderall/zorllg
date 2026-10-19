// levels/campaign.js (P6) — CampaignData (addendum A3.3): the campaign's content data, read by the Bench (P3) and by
// flow's debrief and Morning Count (P5). Pure data, no imports. Consumers load it lazily with
// `import('../../levels/campaign.js')` inside try/catch and fall back to empty data when it is missing.
//
// SPOILER RULES (arch §8.6, bible §5.5, addendum A2 #4 and #6): everything here is shown only after Level 1 ends
// (debrief, Bench 1, Morning Count). Fragments carry their pre-reveal glosses ONLY: no true titles, no card text.
// Version 2 (addendum 02 §B4, LEVEL): Made fragments (M1), Moth's ranking, Calls and the l02 leg. Each leg's lines and
// cards are displayed only at that leg's Bench (Bench 2 for l02), and Made cards only once logged in campaign state.

const SPEAKERS = {
  // the Bench's comms panel (A3.6). Same typography as the level speakers (L1 §17, A2 #21 and #24); after the naming
  // the frame's label is MOTH. `tag` (the clarity pass) is who the voice is to the player, as in levels/level01.js.
  OMA:  { name: 'OMA · BENCH', tag: "the convoy's elder and mechanic", color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' }, style: 'radio',
          channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
  MOTH: { name: 'MOTH', tag: 'your frame', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal',
          channel: 'LOCAL', font: 'monoCaps', speed: 1 },
  JUNO: { name: 'JUNO', tag: 'you', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
          channel: 'LOCAL', font: 'sans', speed: 1 },
  KIT:  { name: 'KIT · TICK', tag: 'your brother, the scout', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 }, style: 'radio',
          channel: 'WAKE', speed: 1.4, static: 0.25 },
};

// The fixed hardpoints (L1 §13.2 and §13.4; bible §7.4). Prototype values; no alternatives exist until Level 2.
const FIXED = [
  { hardpoint: 'BOOSTER', name: 'Cantor Wings', stats: 'Quick boost 82 m/s for 170 EN · Hover 150 EN/s' },
  { hardpoint: 'LEGS', name: 'Cantor Stride', stats: 'Biped · Jump 17 m/s · Speed 30 m/s' },
  { hardpoint: 'CORE', name: 'Hymnal Core', stats: 'AP 9,000 · EN 1,000 · Stability 1,400' },
  { hardpoint: 'UTILITY', name: 'Repair kits ×3', stats: '3 kits · 3,600 AP/s for 1.2 s' },
];

// Lattice tab (L1 §13.6): glosses only, in this order. The V1 UI must never render a title or card text.
const FRAGMENTS = [
  { id: 'F01', gloss: 'BRIDGE / RAIN / VEHICLE AT REST' },
  { id: 'F02', gloss: 'VOCAL / CHILD / FEVER / LONG NIGHT' },
  { id: 'F03', gloss: 'HANDS / STEERING BAR / MALE ADULT' },
  { id: 'F04', gloss: 'VEHICLE DESIGNATION: PATIENCE' },
  { id: 'F05', gloss: 'KITE / STRING / SMALL HAND' },
  { id: 'F06', gloss: 'ICE / CUTTING / FIRST / APPLAUSE' },
  { id: 'F07', gloss: 'FEMALE VOICE / UNRESOLVED' },
  { id: 'F08', gloss: 'TASTE / COLD / FIRST LIGHT' },
  { id: 'F09', gloss: 'FIRE / CROWD / RHYTHM' },
  { id: 'F10', gloss: 'DESIGNATION / ADULT MALE / CALLING' },
  { id: 'F11', gloss: 'STARS / ROOF / COUNTING' },
  { id: 'F12', gloss: 'LIGHTS / NIGHT / LOSS / MALE ADULT' },
  // Made fragments (addendum 02 §B4): logged in a level (`made` is the level id). The Bench shows a Made card only once
  // it is present in campaign state (E11), so M1 appears first at Bench 2. Gloss only, like the others.
  { id: 'M1', gloss: "CHILD'S KITE / GNOMON / WARMTH, CHEST", made: 'l02' },
];

// Moth's own overwrite ranking (bible §7.7): the picker highlights the first intact, selectable id in this order.
const MOTH_RANK = ['F01', 'F08', 'F06', 'F11', 'F09', 'F04', 'F03', 'F05', 'M2', 'M1', 'M4', 'M3', 'F10', 'F02', 'F12', 'F07'];

// Calls (bible §7.9, L2 §13.4): funded at the Bench in water, used in the next level (the in-level wheel is Level 3's).
const CALLS = {
  kite:   { name: 'Spotter Kite',   who: 'Kit',                     cost: 1, uses: 3, desc: 'Marks every enemy and haul part within 300 m for 20 s.' },
  mortar: { name: 'Mortar Rig',     who: 'Twice Shy (the Pruitts)', cost: 2, uses: 3, desc: 'A six-shell barrage on your lock target after 3 s.' },
  trike:  { name: 'Resupply Trike', who: 'Thimble',                 cost: 2, uses: 2, desc: 'Restores 40% armour, all missiles and one repair kit.' },
};

// The Wake Roll, Day 1 (bible §12.5): 40 rigs, 300 souls. Rigs are lost to thirst from the bottom up; protected rigs never.
const ROLL = [
  [1, 'The Bench', 3, true], [2, 'Second Patience', 2, true], [3, 'Big Mercy', 4, true], [4, 'Compass Rose', 6, true],
  [5, 'Twice Shy', 3, true], [6, 'Thimble', 2, true], [7, 'Long Odds', 9], [8, 'Kettle', 7], [9, 'Salt Hymn', 8],
  [10, 'Grandmother', 14], [11, 'Slow Thunder', 9], [12, 'Barefoot', 6], [13, 'Old Faithless', 8], [14, 'Daybreak Debt', 7],
  [15, "Lark's Rest", 12], [16, 'Hardtack', 8], [17, 'Sweetwater', 9], [18, 'Brass Mule', 7], [19, 'Morning Glory', 14],
  [20, "Widow's Mite", 5], [21, 'Low Lantern', 8], [22, 'Borrowed Time', 9], [23, 'Cinder', 6], [24, 'Fourpenny', 7],
  [25, 'Halfway', 10], [26, 'Drowsy Jane', 8], [27, 'Cartwheel', 9], [28, 'Stubborn', 7], [29, 'Bucket of Stars', 13],
  [30, 'Mulish', 6], [31, 'Wren', 5], [32, 'Dry Season', 9], [33, 'Hammer and Tongs', 8], [34, 'Saint Never', 7],
  [35, 'Tin Psalm', 6], [36, 'Leeward', 9], [37, 'Tuesday', 7], [38, 'Gully', 6], [39, "Crow's Mercy", 8], [40, 'Last Light', 9],
].map(([id, name, souls, prot]) => (prot ? { id, name, souls, protected: true } : { id, name, souls }));

// Bench 1 script (L1 §13.7). Keys per A3.3: arrive, hatch, haul, give, fit:<engine part id>, lattice, gaveAll, keptAll,
// walkOn. Engine part ids per A2 #14: shotgun_s8 (Sleet Gun), harpoon_gaff (Gaff Harpoon), flare_pod (Flare Pod).
// Lie #2 is verbatim (A2 #4). Lie #3 ("The hatch seal is damaged.") and Oma's "Is it." are canon.
const BENCH_L01 = {
  arrive: [{ who: 'OMA', text: 'Morning, girl. Put the frame in the cradle. Easy.' }],
  hatch: [
    { who: 'OMA', text: 'Open her up. I want a look at the pilot.' },
    { who: 'MOTH', text: 'The hatch seal is damaged.' },
    { who: 'OMA', text: 'Is it.' },
    { wait: 2 },
    { who: 'OMA', text: 'Then show me what you brought.' },
  ],
  haul: [{ who: 'OMA', text: "Everything on this rig was something else first. That's not salvage, girl. That's family history." }],
  give: [{ who: 'OMA', text: "What you don't bolt on, I strip for the Wake. Seals, plate, condensers. Water's water." }],
  'fit:shotgun_s8': [{ who: 'OMA', text: 'Skiff gun. Loud and short. Like the boy.' }],
  'fit:harpoon_gaff': [{ who: 'OMA', text: "Harpoon. Never hook anything you can't carry." }],
  'fit:flare_pod': [{ who: 'OMA', text: "Flares. Light's cheap. Being seen isn't." }],
  lattice: [
    { who: 'MOTH', text: 'Recovered during the thaw. They are mine, I think. They are mostly about water.' },
    { who: 'JUNO', text: 'Same as everyone.' },
  ],
  gaveAll: [{ who: 'OMA', text: "Generous. Hope you don't need any of it." }],
  keptAll: [{ who: 'OMA', text: 'Keeping the lot. Your da was the same.' }],
  walkOn: [{ who: 'OMA', text: 'Wake rolls at first light. Keep up.' }],
};

// Juno's Day 4 Count line (bible §12.4, addendum 02 E10): picked by the story flag campaign:story.bigMercy. A flow that
// predates E10 treats `log` as a string: the non-enumerable toString gives it the default line (plain data otherwise).
const LOG_L02 = {
  by: 'bigMercy',
  variants: {
    saved: "Big Mercy's still with us. Moth asked why people laugh when they're scared. Didn't have an answer.",
    lost: 'Big Mercy went dry. Four names off the Roll. I wrote them myself.',
  },
  default: "Big Mercy's still with us. Moth asked why people laugh when they're scared. Didn't have an answer.",
};
Object.defineProperty(LOG_L02, 'toString', { value() { return this.default; }, enumerable: false });

// Bench 2 script (L2 §13.6; keys: addendum A3.6 plus addendum 02 E11). Displayed only at Bench 2. Every Moth line is
// true or an evasion (bible §4): the room is in its lattice, F01 is first in its own ranking, M1 is from the Sundial.
const BENCH_L02 = {
  arrive: [{ who: 'OMA', text: "Morning, girl. Frame in the cradle. Let's see what the reeds cost us." }],
  gift: [{ who: 'OMA', text: "Found these on a dead Skimmer. You'll want them." }],
  haul: [{ who: 'OMA', text: "Sails, rivets, a crane hand. You've been shopping." }],
  give: [{ who: 'OMA', text: 'Strip it and the Wake drinks. Your call.' }],
  'fit:sail_rig': [{ who: 'OMA', text: 'Yacht sail. Goes like stink in a straight line. Turns like a cow.' }],
  'fit:rivet_driver': [{ who: 'OMA', text: 'Rivet gun. Slow. Hits like a debt collector.' }],
  'fit:crane_claw': [{ who: 'OMA', text: 'Boarding claw off the Tally. Grab, throw. Mind your fingers.' }],
  hungry: [
    { who: 'OMA', text: "Canyon floods. You'll want skates." },
    { who: 'MOTH', text: 'They need room in me. One fragment.' },
    { who: 'MOTH', text: 'Bridge, rain, vehicle at rest. It is the least important.' },
    { who: 'JUNO', text: 'Your call.' },
  ],
  locked: [{ who: 'MOTH', text: 'Not those. This one.' }],
  overwrite: [{ who: 'MOTH', text: 'Overwritten. The skates are bound. They will not need feeding again.' }],
  made: [
    { who: 'MOTH', text: 'A new one. From the Sundial.' },
    { who: 'JUNO', text: "Kit's kite?" },
    { who: 'MOTH', text: 'Yes.' },
  ],
  calls: [{ who: 'OMA', text: "Next leg, the Wake can lend you hands. Kit's kite, the twins' mortar, Thimble's trike. Costs water." }],
  mustFit: [{ who: 'OMA', text: 'Skates on, girl. Not a request.' }],
  gaveAll: [{ who: 'OMA', text: "Generous. The canyon won't be." }],
  keptAll: [{ who: 'OMA', text: "Keeping the lot. Hope the Wake's not thirsty." }],
  walkOn: [{ who: 'OMA', text: 'Canyon tomorrow. Keep up.' }],
};

// Bench 2 explain cards (L2 §13.5, verbatim), shown through ctx.hud.explain above the Bench UI (addendum 02 E5, E11).
const TERMS_L02 = {
  hardpoints: { id: 'hardpoints', term: 'Booster and legs',
    text: 'Two more hardpoints now take hauled parts: the booster (how the frame boosts and dodges) and the legs (how it runs). Stock parts hang on the wall and can always go back on.' },
  overwrite: { id: 'overwrite', term: 'Overwriting',
    text: 'The first time a hungry part is fitted, the frame clears one stored fragment (a card on the LATTICE tab) to make room. The fragment is gone for good and your Sync bar loses a segment. After that the part is bound and refits free.' },
  made: { id: 'made', term: 'New fragments',
    text: 'The frame stored something new from today. Each new fragment adds a segment to your Sync bar.' },
  calls: { id: 'calls', term: 'Calls',
    text: "Help from the Wake during the next level, paid for in water now: Kit's spotter kite (1 tank), the Pruitt twins' mortar rig (2 tanks) or Thimble's resupply trike (2 tanks)." },
};

/** CampaignData (addendum A3.3, v2: addendum 02 §B4) */
export default {
  version: 2,
  startWater: 4,
  lockerSize: 4,
  speakers: SPEAKERS,
  fixed: FIXED,
  fragments: FRAGMENTS,
  mothRank: MOTH_RANK,
  calls: CALLS,
  roll: ROLL,
  legs: {
    l01: {
      day: 1,
      draw: 3,
      log: 'Found a war machine in the ice. Kit named it. Of course Kit named it.',
      debriefTitle: 'WALK DAY 1 · THE RIME SHELF',
      edgeLat: 38,
      bench: BENCH_L01,
    },
    l02: {
      day: 4,
      draw: 3,
      edgeLat: 42,
      debriefTitle: 'WALK DAY 4 · THE MORNING STEPPE',
      // Juno's Count line depends on Big Mercy's fate (bible §12.4; story flag campaign:story.bigMercy)
      log: LOG_L02,
      result: { rigsLostFlag: 'cv:lost', storyFlag: 'campaign:story' },
      made: ['M1'],
      debrief: { waterLabel: 'Water recovered', rigsLost: true },
      gifts: [{ part: 'skate_jets', unlessOwned: true, line: 'gift' }],
      forced: { part: 'skate_jets', fragments: ['F01'], mustFit: true, noGive: true,
                reason: 'Fit the Skate-Jets first. The canyon floods.', noGiveReason: "Not these. You'll need them." },
      terms: TERMS_L02,
      calls: true,
      bench: BENCH_L02,
    },
  },
};
