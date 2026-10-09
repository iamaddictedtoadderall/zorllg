// levels/campaign.js (P6) — CampaignData (addendum A3.3): the campaign's content data, read by the Bench (P3) and by
// flow's debrief and Morning Count (P5). Pure data, no imports. Consumers load it lazily with
// `import('../../levels/campaign.js')` inside try/catch and fall back to empty data when it is missing.
//
// SPOILER RULES (arch §8.6, bible §5.5, addendum A2 #4 and #6): everything here is shown only after Level 1 ends
// (debrief, Bench 1, Morning Count). Fragments carry their pre-reveal glosses ONLY: no true titles, no card text.

const SPEAKERS = {
  // the Bench's comms panel (A3.6). Same typography as the level speakers (L1 §17, A2 #21 and #24); after the naming
  // the frame's label is MOTH.
  OMA:  { name: 'OMA · BENCH', color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' }, style: 'radio',
          channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
  MOTH: { name: 'MOTH', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal',
          channel: 'LOCAL', font: 'monoCaps', speed: 1 },
  JUNO: { name: 'JUNO', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
          channel: 'LOCAL', font: 'sans', speed: 1 },
  KIT:  { name: 'KIT · TICK', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 }, style: 'radio',
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
];

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

/** CampaignData (addendum A3.3) */
export default {
  version: 1,
  startWater: 4,
  lockerSize: 4,
  speakers: SPEAKERS,
  fixed: FIXED,
  fragments: FRAGMENTS,
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
  },
};
