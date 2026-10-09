# Addendum 01: first-build amendments to `architecture.md`

Version 1. Binding for the first build: the engine, the Level 1 vertical slice and Bench v1. Written by the technical lead after reconciling `architecture.md`, `level-01.md`, `art-direction.md` and `SPOILERS-story-bible.md`. **Build team only:** it names story beats.

**How to read it.** Read `architecture.md` first, then this, then your area's design doc. Where this addendum adds an interface, that interface is as binding as architecture §4. It only adds: nothing in architecture §3.5, §4 or Appendix C is renamed, removed or changes meaning. Sections here are A0 to A6. "Arch §x" means `architecture.md`, "L1 §x" `level-01.md`, "AD §x" `art-direction.md`, "bible §x" the story bible.

**Precedence.** For interfaces and scope: this addendum, then arch, then L1, then AD, then the bible. For the look (colours, shapes, light values): AD, then L1, then the bible, except where A2 rules otherwise. For story text and beats: L1 as amended by A2, then the bible.

---

## A0. Working rules for addendum items

P0's stubs implement arch §4 only. Nothing in this addendum exists until its owner writes it, and `tools/contract.json` doesn't check any of it.

1. **No named imports of addendum exports from another package's file.** `import { campaignLoadout } from '../combat/loadout.js'` fails to link while `loadout.js` is a stub, and one link failure stops the whole game booting. Use `import * as LO from '../combat/loadout.js'` and feature-detect: `LO.campaignLoadout?.(f) ?? fallback`. Named imports of arch §4 names are still fine.
2. **No static imports of new files owned by another package.** Of the two new files, `src/combat/haul.js` is reached only as `ctx.haul`, and `levels/campaign.js` only through a dynamic `import()` with a `.catch()` fallback.
3. **No new entries in `main.js`.** It is frozen. New services are created inside an existing owner's `install()` (for example, `ctx.haul` from `combat/combat.js`). Reach them lazily with `?.`.
4. **Unknown names never throw.** `audio.play`, `materials.get`, `fx.impact` surfaces, `fx.emitter` kinds, weather types, and unknown `LevelArt`, `SpeakerDef` and `MechAnimState` fields all fall back as listed in A5 and warn once per name. `buildMech` builds `'vanguard'` for an unknown design and no visual for an unknown part visual id; P0's stubs already do both, and the real versions MUST keep doing so (P4 lands `FRAMES.moth` before P3 lands `DESIGNS.moth`). `atmosphere.apply` and `set` keep unknown art fields in `atmosphere.art`, so other packages can read them.
5. **Surface first, behaviour second.** In your first pass (roughly the first fifth of your time), add every addendum export, field and method you own, using the "until it lands" behaviour given here, so that other packages' feature detection finds them. Items marked **early** in A6 land in that pass with real behaviour.
6. **The tier keys proposed in AD §7.1 (★) aren't in `TIERS`.** Derive them, for example `ctx.tier.terrainDetail ?? (ctx.tier.name === 'low' ? 'lite' : 'full')`.
7. **No fallbacks for committed items.** L1 §16 gives a level-side fallback for each request. Where this addendum commits an owner to a request, P6 doesn't build the fallback, because two implementations would fight. The level runs without that behaviour until it lands. Fallbacks are built only for the items deferred in A1.2. A trivial stand-in while you wait (for example P6's `kitOr`, A5.3) is fine; re-implementing the feature is not.
8. **Test your additions in your own scenario**, because `contract.mjs` won't. Read state with `g.eval(() => ctx...)`. `__game` and `GameStateSnapshot` are P0's and stay as they are.

---

## A1. First-build scope

### A1.1 In scope (must work tonight)

**Level 1, from the briefing to the naming,** with every beat in L1 §3 and every line in L1 §10, on High and on Low. That means: the cutter and the raid, the collapse and the "hatch was open" card, the boot over black, the walk-only cavern and the shaft, systems remembered one at a time, Kit pinned with the TEAR lesson, the Gleaners, the Sexton, the climb and the stencil, the Icebreaker's three phases, the sunrise wall, the drowning (vitals race, flat line, 4 s of black with comms, reboot at 60), the floe sprint on rotting floes, the shore kneel, the Foreman's chime and the naming.

**Systems.** Ability gating; pilot vitals; comms typography over black; TEAR and the 3-slot rack with swap; sledges as water; caches into the rack; the harpoon and flare weapons; the `moth` frame and design; Bench v1 (Fit, Locker, Give, Undo, the Wake tab, the read-only Lattice tab, Bench lines and the 3D cradle view); the debrief with haul and sledges; the Morning Count for Day 1; campaign state in the save.

**Principle.** Fewer, solid systems. Anything that only adds polish, or only matters from Level 2 on, is deferred below with a working fallback.

### A1.2 Deferred (and what the slice uses instead)

| Deferred | Asked for by | First build uses |
| --- | --- | --- |
| `hud.waterline` (R4) | L1 §7.2 | the `drown` action raises the underwater fog density from 0.035 to 0.09 over the same 24 s |
| Dropped-part pickups after a rack swap | bible §7.5, L1 §12.3 | the dropped or declined part is lost; hint `Dropped.`; no `haul:dropped` flag |
| Sexton part visuals `gaffpike`, `drumrack`, `ghostlight` (R12) | L1 §11.4 | a plain Bastion in the `ghost` faction; P6 adds the ghost light to `rig.head` on `unit:spawned` |
| Sync meter, partner moves, hungry parts, overwrites, Calls, Retelling, kernel cells | bible §7.6 to §7.9 (V2 and later) | nothing; `campaign.tearCount` records TEARs for later Sync credit |
| Quick-boost charges (Cantor Wings) | bible §7.4 | prototype quick boost, limited by EN only |
| Comms audio static | R5 | visual static only |
| Underwater low-pass filter | L1 §7.2 | `audio.duck` |
| Sun gate, `TerrainData`, `world.terrainData`, `addShadowCaster`, `sunVisible`, `uSunFront`, the shadow-top bake, and AD §3.3's bake change | AD §3.3, §3.4 | L1's own light wall (`levels/level01/sunrise.js`) and floe tint for shade; terrain keeps arch §5.4's baked sun visibility |
| `light.keyDir` | AD §5.1 | L1 uses the sun itself as the starlight key (L1 §15.1) and blends it to dawn along the shortest arc (A5.4) |
| `fog.ground`, fog cards, `art.shafts` shaft cards, the sun-shafts pass, heat haze, lens dirt, exposure kick, `GradeState.glitch`/`grit`/`frost` | AD §5.3, §5.4, §6.10, §6.11 | additive cone meshes owned by the level for the shaft light (P6); DOM `hud.glitch` |
| Weather `crystals`; `WeatherParams.color`, `size`, `sparkle`, `layers` | AD §5.5 | `snow` |
| Materials `wearStyle`, `bare`, `cracks`; `FACTIONS`, `MECH_SCHEMES`; `sign()` styles; `uFrost`, `uDust`, `uPing`; per-plate vertex-colour tint | AD §4 | the existing wear patch; factions from `LevelDef.factions`; `MOTH_PAINT` (A3.2) |
| The 8-cell particle atlas, lit billows, new decal kinds; new `fx` impact surfaces and emitter kinds; `ribbon()`; beam kinds; `ping` | AD §6 | current recipes (P1 may improve internals, with no new interface); owners draw cables as stretched meshes |
| Kit builders beyond Kit v1 (A5.3), and `greebles(..., { style })` | AD §2 | Kit v1 |
| Generic story structure types, `params.style`, and the props `tank_cairn`, `body_drum`, `plate_shard` | AD §2.15, §2.16 | P6 registers L1's types (A2 #16) |
| Scatter props other than `ice_shard` and `snow_drift`; `routeRibbon` | AD §3.9, §3.10 | existing natural props, tinted by the palette |
| The ★ tier keys | AD §7.1 | derived from `tier.name` (A0 rule 6) |
| Resuming a half-finished Bench after a page reload | — | `campaign.pending` stays in the save and is applied at the next Bench |
| The Bench's route map for the next level; a music-box Bench theme | bible §9.4, L1 §13.7 | none; flow plays theme `'garage'` |
| Hiding gated touch buttons | L1 §8.1 | gated buttons show `OFF`, dimmed, through `input.setTouchLabel(act, 'OFF', true)` |

### A1.3 Level 1 content trims (P6)

Keep every beat and every line. Trim the dressing and the extras:

- **Wake camp:** only the three hero rigs and `bench_crawler`. The ~20 instanced beach rigs (`wakeCamp.js`) become the `wakeLights` skyline row.
- **Dressing types** `cable_sled_train`, `marker_buoy`, `founders_lifeboat` and `windbreak` are cut. Use `block_stack` and extra `founders_pod`s for cover.
- **Icebreaker:** cut phase 2's cut-line strike (already first on L1 §14's cut list) and phase 3's intake suction. Keep the slurry jets, turrets, floodlight sweep (`SPOTTED` and the turret spread change), skiff launches, saw sweep, plunge shockwave and the collar rule.
- **Gleaners:** cut drum lifting and escape (`c_lost_drum`, `drumEscaped`) and `e_shaft`'s floor-4 group (L1 §14's cut list, items 1 and 2).
- **The *Abeyance*:** 5 floors as in L1 §11.8, LOD0 ≤ 200k triangles, one merged mesh on Low.
- **`haul.js`** (the R8 fallback) is not written: P4 owns TEAR (A5.1).

---

## A2. Rulings on conflicts

| # | Topic | Conflict | Ruling |
| --- | --- | --- | --- |
| 1 | Low-tier shadows | The bible says Low has none; arch §7.4 gives Low an 80 m box at 1024 (AD §7.2 follows arch) | **Arch.** Low keeps its shadow map. If a phone can't hold the frame rate, the integrator cuts the shadow map first. |
| 2 | Low-tier point lights | The bible allows some; arch has 0 | **Arch: 0.** Kit's flares on Low are an emissive mesh plus a glow sprite. |
| 3 | The Sexton | L1 A1 adds a named ghost mech that isn't in the bible | **Kept.** It is arch §10.9's named mech fight and the ghost the story needs. It uses the existing `mech` kind with the config in L1 §11.4; visuals as in A1.2. |
| 4 | Moth's pronouns | Bible: "this frame" until "Hold on to me.", and "I think" first appears in L3. Bench 1's lie #2 contains "I think". | Before *"Hold on to me."* Moth never says I, me or my, and never uses a contraction. *"I am here."* is its first "I". Lie #2 (*"They are mine, I think."*) stays verbatim as the single sanctioned exception. |
| 5 | Juno's drowning line | Bible: "Moth— Moth, listen."; L1 A3 | **L1:** *"Hey. Hey, listen. If this goes bad."* The name doesn't exist yet. |
| 6 | The name before the naming | — | No UI string contains "Moth" before `c_naming_kit`. The comms label is `CANTOR 7`, and the frame tag is set through `hud.setCallsign`. `FRAMES.moth.campaignOnly` hides the frame from the free garage, and campaign briefings hide "Fit frame". The frame's display name `Moth` appears only at the Bench. |
| 7 | L1 base look | L1 §15 and AD §5.7 differ (palette, sun, weather, aurora shape) | L1 §15 and §17 values are the starting point, because P6 owns the level file. AD's reserved colours override them: aurora teal `#2fe0c8` and violet `#7b4dff` (never green, so L1's `#4dffb0` goes), ghost green `#a8ff9e`, tungsten `#ffb36b`, sodium `#ff9a2e`. Field shapes as in A5.4. The integrator tunes the rest against screenshots. |
| 8 | Sunrise timing | L1's sun clock runs 5.5° to 9°; AD runs −4° to 3.5° | **L1**, because the shade lanes are gameplay. The visual sun follows the same clock. |
| 9 | The sunrise wall | L1 §12.9 uses meshes; AD §5.8 uses a sun front | **L1's meshes** (`sunrise.js`). The sun front is deferred. |
| 10 | Terrain vertex bake | AD §3.3 removes the sun term; arch §5.4 keeps it | **Arch §5.4** until the sun gate exists. |
| 11 | Replaced stock parts | Bible §7.8 sends them to the Locker; L1 §1.3 doesn't | **L1:** stock parts hang on the Bench wall, never use Locker space, and can always be refitted. |
| 12 | `mg_r12`, `msl_sw8` | Arch C.4 unlocks them with l01; L1 §13.1 doesn't award them | Not awarded by L1. P4 sets their `unlock` to `{ by: 'salvage', hint: 'Recovered in the field' }`. They stay in the free garage. |
| 13 | Quick boost | The bible gives Cantor Wings 2 charges | Prototype behaviour (EN only) for L1. Decide before L2. |
| 14 | Haul part ids | L1 §13.8 uses story ids (`sleet_gun`, `gaff_harpoon`) mapped to engine ids | **One id per part: the engine id.** `shotgun_s8` (Sleet Gun), `harpoon_gaff` (Gaff Harpoon), `flare_pod` (Flare Pod), and the stock `rifle_r30`, `blade_pb2`, `msl_vm4`, `kit_rk3`. P6 replaces the story ids in `config.haul` and `collectibles[].unlocks`. |
| 15 | Part visual ids | L1 R12 asks for `sleet` | `shotgun_s8` keeps visual `shotgun`, which P3 builds in the Dredge style. The new visuals are `harpoon` and `flarepod`. |
| 16 | Who registers L1 structure types | AD §2.16 makes `pressure_ridge` and `ice_floe` generic P3 types; L1 §11.8 gives them to P6 | **P6** registers every L1 type in `levels/level01/structures.js`, built with P3's Kit v1 (`pressureRidge`, `floe` and so on). They can become generic types later. |
| 17 | The name `ice_block` | AD Appendix A proposes a P2 scatter prop; L1 has a structure type of that name | The structure keeps `ice_block`. The prop, if it's ever built, is `ice_chunk` (deferred). |
| 18 | *Abeyance* geometry | AD §2.17: 12 decks, 10° lean. L1 §11.8: 5 floors, 7°. | **L1**, because the climb is designed on it. |
| 19 | Where the vitals lock is stored | L1 §13.8 puts `vitals` in the campaign object | A persistent save flag `vitals = 'locked'`, set with `{ flag: ['vitals', 'locked'], persist: true }` at the reboot. The campaign object doesn't carry it. |
| 20 | Moth's colours | L1 §15.6 and AD §4.3 `MECH_SCHEMES.moth` are near-identical | **AD §4.3**, in `MOTH_PAINT` (A3.2). |
| 21 | Speaker label | L1 R5 asks for a `label` field | `SpeakerDef.name` is the label, and `''` hides it. No `label` field. |
| 22 | Ghost-light timing | L1: on for 0.25 s every second. AD: a pulse that decays exponentially. | **AD §4.5:** instant on, 0.3 s decay, 60 a minute on the shared beat. |
| 23 | L1 weather | AD `crystals`; L1 `snow` | `snow` (crystals are deferred). |
| 24 | A bug in the L1 draft | In L1 §17, `speakers.MOTH`'s `voice` and `style` sit inside the trailing comment | P6 fixes it: `MOTH: { name: 'CANTOR 7', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal', channel: 'LOCAL', font: 'monoCaps', speed: 1 }`. |

---

## A3. Bench v1: the garage, reconciled

### A3.1 Shape

The Bench is a mode of `ui/garage.js`, built on the loadout system. Hauled parts are ordinary `PARTS` entries with a `haul` block. The fitted parts become a `Loadout` through `campaignLoadout()`. `computeStats` and `validate` still run, but load and power never bind in V1, so the Bench hides those bars. Campaign state is one save flag.

```
in the level   ctx.haul.rack (P4) ─ mirrored to mission flags haul:rack / haul:tears ─ restored by checkpoints
level end      flow (P5): LevelResult.haul / tears / water → campaign.pending + ledger, water += sledges
debrief        screens.showDebrief (P5): haul names, sledges n / 3, one button: TO THE BENCH
Bench          garage.open({ context: 'bench', levelId }) (P3): applies pending; Fit / Give / Undo; WALK ON commits
Count          flow (P5): draw, shortfall, day → screens.showMorningCount
next level     flow (P5): player.setLoadout(campaignLoadout(campaign.fitted))
```

### A3.2 Part data (P4, `combat/loadout.js`)

```ts
interface PartDef {                 // additions
  stock?: boolean;                  // Moth's stock parts: rifle_r30, blade_pb2, msl_vm4, kit_rk3
  haul?: { give: number; hunger: number /*0 in V1*/; source?: string /*e.g. 'L1:skiff_gaffer'*/ };   // present → a hauled part
}
interface FrameStats { campaignOnly?: boolean; }   // hidden from the free garage
type WeaponType = /* arch §4.4 */ | 'harpoon' | 'flares';
export const MOTH_PAINT: Paint;     // AD §4.3: base #d8d2c4, mid #aaa494, accent #c99a3e, visor #5fe3ff, flame #a8ecff, blade #8fe9ff
export const CAMPAIGN_STOCK: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3' };
export function campaignLoadout(fitted?: Partial<Record<'R'|'L'|'S', string>>): Loadout;
     // { frame: 'moth', ...CAMPAIGN_STOCK, ...fitted, paint: MOTH_PAINT }. Ignores ids that aren't in PARTS or don't fit the slot.
```

| id | Change |
| --- | --- |
| `rifle_r30`, `blade_pb2`, `msl_vm4`, `kit_rk3` | `name`: Lantern Carbine, Psalter Blade, Chorus Rack, Repair kits. `stock: true`. |
| `shotgun_s8` | `name` Sleet Gun. Stats from L1 §13.4: 8 pellets × (140 dmg, 110 imp), rate 0.85 s, 520 m/s, 96 shells, 4.5° cone, full damage to 40 m, 25% at 80 m, nothing past 90 m. `haul: { give: 1, hunger: 0, source: 'L1:skiff_sleet' }`. |
| `harpoon_gaff` (new) | Slot L, weapon `harpoon`, weight 10, power 10, visual `harpoon`. Stats `{ range: 80, cd: 3.0, speed: 220, dmg: 300, imp: 2000, reelTo: 12, reelTime: 0.6, pullSpeed: 70, pullStop: 6, lightImpMax: 1000 }`. `haul: { give: 1, hunger: 0, source: 'L1:skiff_gaffer' }`. `unlock: { by: 'salvage', hint: 'Recovered in the field' }`. |
| `flare_pod` (new) | Slot S, weapon `flares`, weight 12, power 8, visual `flarepod`. Stats `{ count: 6, cd: 2, range: 60, decoyR: 30, lightR: 40, lightT: 30, blind: 4 }`. `haul: { give: 1, hunger: 0, source: 'L1:gleaner_carrier' }`. Unlock as above. |
| `mg_r12`, `msl_sw8` | `unlock: { by: 'salvage', hint: 'Recovered in the field' }` (A2 #12) |
| `FRAMES.moth` (new) | Vanguard's stats with `impMax` 1400, `design: 'moth'`, `name: 'Moth'`, `campaignOnly: true` |

`DEFAULT_LOADOUT` and `startingUnlocks()` are unchanged. The heaviest V1 loadout weighs 42 against Moth's load of 60, and the hungriest draws 30 against its power of 40, so `validate` never fails in the campaign. The Bench still calls it, and shows the errors if it ever does.

### A3.3 Content data (P6, new file `levels/campaign.js`: write it first)

```ts
export default /** CampaignData */ { ... };
interface CampaignData {
  version: 1;
  startWater: number;                        // 4
  lockerSize: number;                        // 4
  speakers: Record<string, SpeakerDef>;      // OMA, MOTH (name 'MOTH'), JUNO, KIT, for Bench lines
  fixed: Array<{ hardpoint: 'BOOSTER'|'LEGS'|'CORE'|'UTILITY', name: string, stats: string }>;
         // Cantor Wings, Cantor Stride, Hymnal Core, Repair kits ×3 (L1 §13.4)
  fragments: Array<{ id: string, gloss: string }>;   // F01..F12, glosses only (L1 §13.6). No titles or texts in V1 (arch §8.6).
  roll: Array<{ id: number, name: string, souls: number, protected?: boolean }>;   // bible §12.5, 40 rigs
  legs: Record<string /*level id*/, {
    day: number; draw: number;               // l01: 1, 3
    log: string;                             // Juno's Count line (bible §12.4)
    debriefTitle: string;                    // 'WALK DAY 1 · THE RIME SHELF'
    edgeLat?: number;                        // the map strip's Wake dot, 38
    bench: Record<string, CommsLine[]>;      // keys: arrive, hatch, haul, give, fit:<engine part id> (e.g. fit:harpoon_gaff),
                                             //   lattice, gaveAll, keptAll, walkOn
  }>;
}
```

Consumers load it with `import('../../levels/campaign.js')` (the path from `src/ui/`) inside try/catch. If it's missing, they use `{ startWater: 4, lockerSize: 4, fixed: [], fragments: [], roll: [], legs: {} }` and show no lines.

### A3.4 Campaign state (`save.flags.campaign`)

Write it with `ctx.save.setFlag('campaign', structuredClone(state))`, which writes the save immediately. Never mutate the stored object in place.

```ts
interface CampaignState {
  v: 1;
  day: number;                 // 0 until the first Count
  water: number;               // tanks now
  arms: number;                // total give value ever
  parts: Record<string, 'fitted'|'locker'|'given'>;   // hauled parts only, never stock
  spares: string[];            // duplicates; give-only
  fitted: { R: string, L: string, S: string };        // stock ids when nothing hauled is fitted
  lost: number[];              // Wake Roll ids lost to thirst
  fragments: Record<string, 'intact'>;                 // a missing id means intact (V2 adds states)
  kernel: number;              // 4
  benchVisits: number; tearCount: number;
  pending: null | { levelId: string, haul: string[], tears: number, sledges: number };
  ledger: null | { levelId: string, before: number, sledges: number, gives: number };
}
// Default (anyone who reads a missing flag uses exactly this):
// { v: 1, day: 0, water: startWater ?? 4, arms: 0, parts: {}, spares: [], fitted: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4' },
//   lost: [], fragments: {}, kernel: 4, benchVisits: 0, tearCount: 0, pending: null, ledger: null }
```

| When | Writer | Writes |
| --- | --- | --- |
| A campaign level starts | P5 flow | creates the default if the flag is missing |
| `level:complete` of a campaign level, before the debrief | P5 flow | `pending = { levelId, haul: result.haul ?? [], tears: result.tears ?? 0, sledges: result.water ?? 0 }`; `ledger = { levelId, before: water, sledges, gives: 0 }`; `water += sledges`; `tearCount += tears` |
| WALK ON | P3 Bench | `parts`, `spares`, `fitted`, `water`, `arms`, `ledger.gives`, `pending = null`, `benchVisits += 1` |
| After the Bench | P5 flow (Count) | `water` (draw and shortfall), `lost`, `day`, `ledger = null` |

Nobody else writes it. Anyone may read it.

### A3.5 Rules (exact, V1)

1. **Arrival.** When the Bench opens it applies `pending.haul` in order. A part already owned (`fitted` or `locker`) becomes a spare. Anything else goes to the Locker. Locker size isn't checked on arrival, because the rack holds at most 3.
2. **Fit** (R, L and S only; the utility, BOOSTER, LEGS and CORE are fixed cards). Each slot offers the stock part plus every Locker part whose `PARTS[id].slot` matches. Spares can't be fitted. Fitting a part sends the previously fitted hauled part to the Locker. If that would leave more than `lockerSize` parts in the Locker, the fit is disabled with `Locker full. Give a part first.` Stock parts never occupy the Locker.
3. **Give.** Any hauled part, whether fitted, in the Locker or a spare: `water += give`, `arms += give`, `ledger.gives += give`. The part becomes `given` (a spare is removed from `spares`), and a fitted part is replaced by stock. Stock parts can't be given.
4. **Undo.** Every Fit and Give can be undone, last first, until WALK ON. The Bench edits a working copy and saves nothing before WALK ON.
5. **WALK ON.** Confirm (`Walk on?` with `Walk on` and `Back`), play the closing lines, then commit as in A3.4.
6. **Count.** `after = water − draw`. If `after < 0`, lose `2 × (−after)` rigs from the bottom of the Roll, skipping protected rigs and rigs already lost, then set `after = 0`. Then `water = after` and `day = legs[levelId].day`. Souls is the sum over walking rigs. After L1 the draw is 3 and water is at least 1 (4 + 0 − 3), so nobody is lost on Day 1.
7. The WAKE and LATTICE tabs are read-only.

### A3.6 The Bench screen (P3, `ui/garage.js`)

```ts
interface Garage {                       // additions
  open(o?: { context?: 'title'|'briefing'|'bench', levelId?: string }): Promise<void>;   // 'bench' added
  readonly contexts: string[];           // includes 'bench' once bench mode works (flow checks this)
  readonly bench: null | {               // non-null while the Bench is open (flow and tests)
    state(): CampaignState;              // the working copy
    fit(slot: 'R'|'L'|'S', partId: string): boolean;
    give(partId: string): boolean;
    undo(): boolean;
    tab(name: 'FIT'|'HAUL'|'WAKE'|'LATTICE'): void;
    walkOn(): Promise<void>;             // skips the confirm and the closing lines, commits, resolves open()
  };
}
```

- **Scene.** The garage scene, dressed as the Bench interior and built with the kit by P3 (L1's `bench_crawler` structure isn't used here): a kneeling cradle; a crane arm with a tungsten work lamp (a SpotLight of about 2,500 cd, `#ffb36b`, shadowed, plus a glow sprite when `particles.glows` exists); a canvas back wall; a parts rack; and the open rear lit in the level's horizon colour (`ctx.atmosphere.art.sky.horizon`) by a rim light at 1.5 (AD §5.7, The Bench). Moth is built from `campaignLoadout(working.fitted)` and posed with `crouch: 1` (the kneel, A5.3). Parts swap live through `rig.setParts`. Slow orbit; drag to orbit.
- **UI** (`injectCSS('bench', ...)` with the design tokens; desktop and touch layouts). Header `THE BENCH`; tabs FIT, HAUL, WAKE and LATTICE; buttons WALK ON and Undo.
  - FIT: cards for R-ARM, L-ARM and SHOULDER with their choices (name, `desc` and three key stats from `PARTS[id].stats`), plus the fixed cards from `CampaignData.fixed` marked `No other parts yet.` There's no FRAME tab and there are no load or power bars.
  - HAUL: the Locker's parts (n / 4) and spares (marked `SPARE`), each with GIVE (`+1 WATER`).
  - WAKE: water now, the Count's draw, the result (with any shortfall) and the Roll (rig names and souls, lost rigs struck through).
  - LATTICE: the header `MOTH — RECOVERED FRAGMENTS (12)` and 12 cards, each with its gloss in mono small caps and three redaction bars whose lengths come from `mulberry32(hashString(id))`. Never render a title or card text, even if the data contains one.
- **Lines.** A small comms panel inside the Bench UI. (The HUD's comms box is hidden here, and comms only advance in sim time.) Lines come from `legs[levelId].bench`, typed in real time at 42 chars/s × `speaker.speed`, in the colours from `CampaignData.speakers`. Each key fires at most once per visit:
  - `arrive` on open;
  - `hatch` 3 s after `arrive` ends;
  - `haul` when HAUL is first opened, or 6 s after `hatch` ends;
  - `give` when a GIVE is first hovered or pressed;
  - `fit:<id>` when that part is first fitted;
  - `lattice` when LATTICE is first opened;
  - at WALK ON: `gaveAll` if every hauled part was given this visit, otherwise `keptAll` if none was, then `walkOn`.
- **Free garage.** Hide frames with `campaignOnly`. Parts with a `haul` block are never unlocked, so they show as locked with their `unlock.hint`.
- **Missing data.** A part id that isn't in `PARTS` yet (P4 not landed) shows its id as its name and can only be given (give value 1).
- **Until it lands:** `contexts` is missing, so flow skips the Bench (A3.7 step 4).

### A3.7 Debrief, Morning Count and flow (P5)

```ts
type FlowState = /* arch §4.5 */ | 'bench' | 'count';
interface LevelDef { campaign?: { bench?: boolean /*true*/, waterFlags?: string[] } }
       // L1: { bench: true, waterFlags: ['sled1', 'sled2', 'sled3'] }; each truthy mission flag is 1 tank
interface LevelResult { haul?: string[]; tears?: number; water?: number; waterMax?: number; }   // mission fills them (A5.2)
Screens.showDebrief(m: { level, result, unlocks, title?: string, rows?: Array<{ label: string, value: string }>,
                         actions?: Array<{ key: 'next'|'garage'|'quit', label: string }> }): Promise<'next'|'garage'|'quit'>;
Screens.showBriefing(m: { level, canFit?: boolean /*true*/ }): Promise<'start'|'garage'|'back'>;
Screens.showMorningCount(m: MorningCount): Promise<void>;      // resolves on WALK ON (click, Enter or tap)
interface MorningCount { day: number;
  water: { before: number, sledges: number, gives: number, draw: number, after: number, short: number };
  rigs: number; souls: number; lost: string[]; log: string; edgeLat?: number; }
```

Flow for a level with `def.campaign` (steps 3 to 5 only when `campaign.bench !== false`):

1. **Loading.** `player.setLoadout(campaignLoadout(campaign.fitted))`. If `LO.campaignLoadout` is missing, use `{ ...save.getLoadout(), frame: LO.FRAMES.moth ? 'moth' : save.getLoadout().frame }`. The briefing is shown with `canFit: false`.
2. **`level:complete`.** Write `pending` and `ledger` (A3.4) before showing the debrief.
3. **Debrief.** Title `legs[id].debriefTitle`. Rows: Time, Kills, Damage taken, Haul (part names, or `—`), Sledges flagged (`water / waterMax`), Rank. One action: `TO THE BENCH` (`next`).
4. **State `bench`.** If `ctx.garage.contexts?.includes('bench')`, then `await ctx.garage.open({ context: 'bench', levelId })` with music `'garage'`. Otherwise apply A3.5 rule 1 to `pending` yourself, clear it, and save.
5. **State `count`.** Apply A3.5 rule 6, save, then `showMorningCount`. The card follows L1 §13.5: `DAY 1`; `WATER 3 TANKS (4 + 2 sledges − 3 drawn)`, with `+ n given` when gives > 0; `WAKE ROLL 40 RIGS · 300 SOULS`; lost names in grey, or `— no names lost —`; the log line in quotes; and a canvas map strip with the edge as a glowing vertical line and the Wake as a dot at `edgeLat`.
6. **Then** `def.outro` if there is one, then the next level's briefing if it exists and is unlocked, otherwise the title.

Levels without `campaign` (the test level) keep arch §8.1 unchanged.

---

## A4. Rulings on each request

### A4.1 L1 §16 engine requests

| # | Request | Ruling | Owner | Spec |
| --- | --- | --- | --- | --- |
| R1 | `player.abilities`, `hoverCostScale` | **Keep**, plus `tear`, `enRegenScale`, `gravityScale` and `hidden` | P4 | A5.1 |
| R2 | `hud.setSlots`, `hud.setPanels` | **Keep.** Slots follow `abilities` automatically. | P5 | A5.2 |
| R3 | The pilot-vitals widget | **Keep** | P5 | A5.2 |
| R4 | `hud.waterline` | **Deferred** (fog fallback) | — | A1.2 |
| R5 | Comms over the fade, `SpeakerDef` typography, chime | **Keep.** `name` is the label; audio static is deferred. | P5 (+P1 `chime`) | A5.2 |
| R6 | `player.idleFacing` | **Keep** | P4 | A5.1 |
| R7 | `player.animOverride`, the kneel | **Keep.** The kneel is `crouch: 1`. | P4, P3 | A5.1, A5.3 |
| R8 | TEAR and the Haul rack | **Keep.** Logic P4 (`ctx.haul`); prompt and rack HUD P5; rip pose P3 (optional) | P4, P5, P3 | A5.1, A5.2 |
| R9 | `hud.choice` with up to 4 options, slowed time | **Keep.** The haul system sets `ctx.timeScale`. | P5 | A5.2 |
| R10 | 12 new SFX | **Keep** | P1 | A5.4 |
| R11 | `art.sky.aurora` | **Keep**, plus `sky.dawnRim`, with AD's shape | P1 | A5.4 |
| R12 | Weapons, parts, frame, design, part visuals | **Keep**, except the Sexton's visuals (deferred) | P4, P3 | A3.2, A5.1, A5.3 |
| R13 | Bench mode, Morning Count, campaign state, flow | **Keep** | P3, P5, P6 | A3 |
| R14 | `mech` AI respects `home` and `leash` | **Keep** | P4 | A5.1 |
| R15 | `hud.prompt(text, { key, hold })` | **Keep**, plus `progress` | P5 | A5.2 |
| R16 | `player.invuln` honoured by `combat.damage` | **Keep**, for every target | P4 | A5.1 |
| — | Runtime interact prompts (`flagSled`) | **New:** `mission.addInteract` | P5 | A5.2 |
| — | `waveStarted` condition | **New:** event `encounter:wave` | P5 | A5.6 |
| — | `bladeKill` condition | **New:** `DamageSource.kind` on player damage | P4 | A5.1 |
| — | `mothWalk`, `turnNorth` | **New:** `player.autopilot` | P4 | A5.1 |
| — | Haul glints, ghost lights, lamp glows | **New:** `particles.glows` | P1 | A5.4 |
| — | Flare blinding and decoys | **New:** `Target.blindT`, `projectiles.retarget` | P4 | A5.1 |

### A4.2 AD Appendix A

| Owner | Proposed | Ruling |
| --- | --- | --- |
| P3 | `kitFinalize`; profiles | **Keep** `kitFinalize`, `rect`, `chamfer`, `chamferRect`, `round`, `taper`, `offset`, `split`. Defer `jag`, `notch`, `SECTIONS`. |
| P3 | `plateGeo` holes; `slab`, `armourPlate`, `ribbedPlate`; `panelBox` with real seams | **Keep** all |
| P3 | `latheHard` and presets | **Keep** `latheHard` and the presets `dome`, `ring`, `flange`, `drum`, `lampHousing`, `nozzle`. Defer the rest. |
| P3 | `pipeRun`, `pipeRack`, `cylinderBetween`; `beam`, `latticeTower`, `gantry`; `truss` options | **Keep** `cylinderBetween`, `pipeRun`. Defer the rest; `truss` keeps the arch signature. |
| P3 | `panelWall`, `loft`, `tank`, `mast`, `dish`, `whips`, `panelArray`, `choirArray`, `catenary`, `cable`, `awning` | **Keep** `loft`. Defer the rest. |
| P3 | Debris kinds, `wreckify`, `ruin`, `rockGeo`, `cliffSkin`, `hoodoo`, `floe`, `pressureRidge`, `icicles`, the greeble library and styles | **Keep** `floe`, `pressureRidge`, `icicles`, `rockGeo`. Defer the rest. |
| P3 | `GeoBuilder.add(..., o?: { tint })`; kit geometry carries `color` and `edge` | **Keep the attributes** on all kit geometry, and `GeoBuilder` normalises its inputs. `tint` is accepted and written, but stays invisible until vertex-colour materials arrive (deferred). |
| P3 | `params.style`; the §2.16 types; `tank_cairn`, `body_drum`, `plate_shard` | **Defer** (A2 #16) |
| P2 | Natural scatter props | **Keep** `ice_shard`, `snow_drift`. Defer the rest. `ice_block` becomes `ice_chunk` (A2 #17). |
| P2 | Shadow-top bake; `surf` attribute; sun out of the vertex colour | `surf` is internal to P2 and allowed. **Defer** the shadow-top bake and the bake change (A2 #10). |
| P2 | `terrainData`, `addShadowCaster`, `sunVisible`, `routeRibbon` | **Defer** |
| P2 | The §3.5 terrain material with `TERRAIN_LITE` | **Keep**, internal to `TerrainRenderer` (A5.5) |
| P1 | Sun gate and sun front; ground fog; shaft cards; aurora and dawn rim | **Keep** aurora and dawn rim. Defer the rest. |
| P1 | `LevelArt` fields | **Keep** `palette.snow`, `palette.strata`, `sky.aurora`, `sky.dawnRim`, `light.shadowMinElevation`, `surface`. Defer `light.keyDir`, `fog.ground`, `light.shafts`, `shafts[]`, `sunFront`, `heatHaze`. |
| P1 | Weather `crystals` and the new params | **Defer** |
| P1 | Materials: library names, `wearStyle`, `bare`, `cracks`, packed-data rules, `FACTIONS`, `MECH_SCHEMES`, `sign()` styles, shared uniforms | **Keep** the library names in A5.4 and `uniforms.uBeat`. Packed-data rules are internal and allowed. Defer the rest. |
| P1 | Particles: `glows`, `beacons`, the atlas, lit billows, decal kinds | **Keep one API, `glows`.** A beacon is a glow with `pulse: 'beat'`. Defer the rest. |
| P1 | `fx` surfaces, emitters, `ribbon()`, beams, `ping`, glints | **Defer.** Haul glints go through `glows`. |
| P1 | Pipeline: sun shafts, haze, grade fields, lens dirt, exposure kick | **Defer** |
| P0 | Tier keys | **Not added**, because P0 is frozen. Derive them (A0 rule 6). |
| P5 | The vitals trace reads `uBeat` | **Keep** |

---

## A5. Interface additions by package

### A5.1 P4: Combat and AI

```ts
// actors/player.js — Player additions. Defaults in comments. Read every frame.
interface Abilities { move: number /*1: ground-speed scale (walk-only 0.33, cutter 0.4)*/;
  jump: boolean; hover: boolean; boost: boolean /*quick boost*/; fire: boolean /*R*/; lock: boolean;
  blade: boolean /*L*/; missile: boolean /*S*/; kit: boolean /*U*/; interact: boolean; tear: boolean; }
abilities: Abilities;            // all true, move 1. Assign a whole object or set fields.
hoverCostScale: number;          // 1 (L1 icing: 2)
enRegenScale: number;            // 1 (L1 underwater: 0)
gravityScale: number;            // 1 (L1 underwater: 0.25)
hidden: boolean;                 // false. The rig is invisible (the cutter); survives setLoadout and spawn.
idleFacing: number | null;       // null. The yaw the body turns to when idle (L1 §12.8).
readonly idleFacingReached: boolean;
animOverride: Partial<MechAnimState> | null;   // null. Merged over the computed state before animateMech.
autopilot: { to?: Vector3, face?: number /*yaw*/, speed?: number /*5 m/s*/, turnRate?: number /*0.35 rad/s*/ } | null;
```

- **Gating.** A gated action reads as idle: the player ignores that input, and `lock: false` also clears `lock`. Raw input still works (`ctx.input.pressed('blade')`), so level code can use a gated button, like the cutter's saw.
- **`idleFacing`.** After 5 s with no move or look input, on the ground, with `ctx.enemies.combatIntensity() < 0.2`, the body (`bodyYaw`, not the camera) turns toward `idleFacing` at 0.35 rad/s and holds. Any input releases it. `idleFacingReached` is true while it holds.
- **`autopilot`** drives movement even while `frozen`. It walks toward `to` at `speed` with the walking animation, stops within 1.5 m, turns the body to `face`, then sets `autopilot = null` and emits `player:autopilotDone`. Collision applies.
- **Invulnerability (R16).** `combat.damage` on any target with `invuln` deals no AP damage and adds no impact. It returns `{ amount: 0, imp: 0, staggered: false, killed: false, blocked: true }`, and still emits `target:damaged` (and `player:damaged` for the player) with `amount: 0, blocked: true`, so the HUD can flash. `DamageInfo.blocked?: boolean` is the addition.
- **Damage kind.** Damage the player deals carries `DamageSource.kind`: the weapon type (`'rifle'`, `'blade'`, `'missiles'`, `'shotgun'`, `'harpoon'`, `'flares'` and so on), or `'tear'`.
- **Until it lands:** these fields are absent or ignored, and the level runs ungated.

```ts
// actors/enemy.js — Target and Unit additions
interface Target {
  haul?: { part: string; glint?: Vec3 /*root-local; default [0, hitR, 0]*/; heavy?: boolean; taken?: boolean; onTaken?(): void };
  blindT?: number;               // seconds of blindness left: while > 0 the unit doesn't fire, and drifts
}
```

- `new Unit(ctx, o)` copies `o.config.haul` (a part id, or the object above) into `this.haul`. `heavy` defaults to `impMax > 1000`. `baseUpdate` counts `blindT` down. Every kind P4 writes honours `blindT`, and P6's kinds must too.
- **`mech` leash (R14).** A `mech` farther than `leash` from `home` disengages and walks back. The default leash is Infinity.
- **Player design.** The player builds its rig with `DESIGNS[frame.design] ? frame.design : 'vanguard'` (`DESIGNS` is an arch §4 export).
- **Until it lands:** units carry no `haul` and ignore `blindT`, so nothing glints; the Sexton may chase past its pad.

```ts
// ctx.haul — implemented in the new file src/combat/haul.js, installed from combat/combat.js install()
interface Haul {
  capacity: number;                     // 3
  enabled: boolean;                     // true. false = no candidate and no TEAR (the level sets it in the cutter)
  readonly rack: string[];              // part ids, oldest first
  readonly tears: number;               // this level
  readonly candidate: Target | null;    // alive, haul not taken, staggered (stagT > 0), ≤ 30 m from the player's centre, in line of sight
  readonly holdProgress: number;        // 0..1 over the 0.4 s hold
  readonly busy: boolean;               // the rip is playing
  isHaulPart(id: string): boolean;      // !!PARTS[id]?.haul
  add(part: string, o?: { source?: 'tear'|'cache'|'script' }): Promise<boolean>;   // full rack → the swap choice
  set(rack: string[], tears?: number): void;   // restore, without events
  clear(): void;
}
```

- **Glints.** Every live target with an untaken `haul` gets an amber glint at its glint point: `ctx.particles.glows?.add(rig root, { color: '#ffbf4a', size: 0.9, pulse: 'sparkle', offset: glint })`, shown within 300 m and removed when the part is taken or the target dies.
- **TEAR.** While `candidate` is set, `enabled` and `abilities.tear` are true and the player isn't `frozen`, the BLADE input doesn't lunge. Holding it for 0.4 s starts the rip:
  - 1.2 s long, with the player invulnerable;
  - a lunge of up to 30 m at 60 m/s;
  - `cameraRig.setFov(fov − 8, 0.15)`, then back;
  - the `tear` pose in P4's own anim state (falling back to the blade pose; `animOverride` stays the level's), sparks, `audio.play('tear')`, shake 0.6.

  Then a light target (`!heavy`) is killed with `kind: 'tear'`. A heavy target lives on with `haul.taken = true`, and `onTaken()` is called (the level removes the part's function, for example the carrier's flares). Emit `haul:tear`, then call `add(part, { source: 'tear' })`.
- **Full rack.** Set `ctx.timeScale = 0.3` (restore the previous value afterwards) and call `ctx.hud.choice({ title: 'RACK FULL. Drop which part?', options: [three 'Drop <name>' options, 'Leave it'], seconds: 8 })`. A timeout or `Leave it` keeps the rack. The dropped or declined part is lost (A1.2). Emit `haul:racked` or `haul:left`.
- **Caches.** On `pickup` with `haul: true` (A5.2), call `add(unlocks, { source: 'cache' })`.
- **Checkpoints.** Every change writes the mission flags `haul:rack` (a copy) and `haul:tears`. On `level:start`: if `fresh`, call `clear()`; otherwise `set(flags['haul:rack'] ?? [], flags['haul:tears'] ?? 0)`. On `level:cleared`, call `clear()`.
- **Until it lands:** `ctx.haul` is undefined. Consumers use `ctx.haul?.rack ?? []` and show nothing.

```ts
// combat/weapons.js — the new weapon types (stats in PARTS, A3.2)
'harpoon':   // L slot. A head at 220 m/s along the aim (lock preferred), cable 80 m, cooldown 3 s.
             // Hits a target with impMax ≤ 1000: 300 dmg and 2000 imp (a stagger), then reels it to 12 m in front of
             //   the player over 0.6 s.
             // Hits anything else (heavy, boss part, structure, ground): pulls the player to the point at 70 m/s,
             //   stopping 6 m short and keeping momentum.
             // TEAR still works with it fitted. The cable is a thin stretched mesh ('cable' material) from muzzleL.
'flares':    // S slot. 6 flares, no refill until refill(); cooldown 2 s. Arcs toward the aim point (≤ 60 m), or straight
             //   up with nothing aimed. On firing, hostile homing missiles within 30 m retarget to it. Lights 40 m for 30 s
             //   (particles.lights.flash). Sticks to an enemy it hits: blindT = 4.
// combat/projectiles.js
ProjectileSpec.target?: Target | { pos: Vector3, alive: boolean } | null;   // homing steers to pos while alive; hits resolve as before
Projectiles.retarget(f: { near: Vector3, r: number, hostileTo?: Team, team?: Team, from?: Target },
                     decoy: { pos: Vector3, alive: boolean }): number;
     // homing projectiles within r of `near` (fired by `team`, or hostile to `hostileTo`; if `from` is given, only those
     // homing on it) switch to `decoy`. Returns how many switched.
```

- **Readouts.** `harpoon` shows `READY` or the cooldown; `flares` shows the flares left.
- **Until it lands:** the stub `createWeapon` returns a weapon whose `trigger` does nothing, so the Bench can still fit these parts. P6 calls `ctx.projectiles.retarget?.(...)`, so the carrier's flares do nothing until then.

### A5.2 P5: Mission and Interface

```ts
// ui/hud.js — additions
vitals(o: { mode?: 'live'|'flat'|'locked'|'hidden', bpm?: number | null, spike?: number, decay?: number, fault?: string | null }): void;
readonly vitalsState: { mode: string, bpm: number | null };          // the displayed values (tests)
setPanels(p: Partial<Record<'ap'|'en'|'weapons'|'radar'|'compass'|'objectives'|'lock'|'rack', boolean>>): void;
setSlots(s: Partial<Record<'R'|'L'|'S'|'K', { state?: 'auto'|'ready'|'offline'|'hidden', label?: string | null }>>): void;
prompt(text: string | null, o?: { key?: string, hold?: boolean, progress?: number }): void;   // o added
choice(def: { title, options: Array<{ key, label }> /*1 to 4*/, seconds?, default?: string } | null): Promise<string | null>;
```

- **Vitals (R3).** A small canvas heart trace and a bpm number by the AP bar. The default mode is `hidden`, so other levels never show it.
  - `live`: `bpm = 74 + 42 × combatIntensity + 24 × (1 − ap / apMax)`, clamped to 62..175, damped (k 0.6), with ±4% beat-to-beat variation. `bpm: n` overrides the formula until `bpm: null`. `spike: n` jumps to n and decays back over `decay` seconds (default 8).
  - `flat`: a flat trace, the number `--` and the `fault` text (default `SENSOR FAULT`).
  - `locked`: exactly `bpm` (default 60) with a perfectly regular trace, beating on `ctx.materials.uniforms.uBeat` (or `ctx.clock.time` if that's missing).
  - The widget makes no sound. The heartbeat audio is the level's.
- **Panels (R2).** `setPanels` merges. Everything is visible by default except `rack`, which starts hidden. Hiding a panel gates nothing; gating is `abilities`.
- **Slots (R2).** In `auto` mode (the default), a slot shows `OFFLINE` (dim, struck through) while `ctx.player.abilities` gates its action (R fire, L blade, S missile, K kit), and its weapon readout otherwise. When a slot goes from gated to ungated (except within 1 s of `level:start`, so a checkpoint restore stays quiet), play `hud.glitch(0.3)`, `audio.play('confirm')` and a cyan flash on that slot. `label` replaces the weapon name (the cutter's `SAW`). On touch, gated buttons get `setTouchLabel(act, 'OFF', true)`.
- **TEAR prompt (R8, R15).** The HUD polls `ctx.haul`. While `candidate && enabled && abilities.tear !== false`, it shows `TEAR` (key `RMB`, hold, progress = `holdProgress`) over any other prompt, and on touch it relabels BLADE as `TEAR`.
- **Rack (R8).** 3 slots by the weapons panel. Each shows the part's `PARTS[id].name` (shortened if needed) with an amber dot, and empty slots are dim. It reads `ctx.haul.rack` every frame and is visible after `setPanels({ rack: true })`.
- **Choice (R9).** Up to 4 options, shown numbered. Desktop: Digit1 to Digit4 pick the first to fourth option, and F and G still pick the first and second. Gamepad: Y and X for the first and second. Touch: tap. It works while the sim runs at any `timeScale`.
- **Blocked hits.** A `player:damaged` with `blocked` gives a short, weak hurt flash.
- Interact objectives and `addInteract` prompts stay hidden while `ctx.player.abilities?.interact === false`.
- **Until it lands:** the stub HUD lacks these methods, so callers use `?.` (`ctx.hud.vitals?.(...)`) and the HUD stays fully on.

```ts
// ui/comms.js — SpeakerDef additions (R5)
interface SpeakerDef { font?: 'sans'|'monoCaps'|'serif'; italic?: boolean; weight?: number; speed?: number /*typing ×*/;
                       static?: number /*0..1, visual only*/; channel?: 'LOCAL'|'WAKE'|'OPEN'|'DREDGE'; chime?: boolean; }
```

- The comms box renders above `#fade` and `#letterbox`, and during `hideHud` cinematics. It is hidden only outside the `playing`, `paused`, `complete` and `dead` states. P5 may re-parent `#comms`; the id stays the same.
- `name: ''` hides the label. `channel` shows as a small tag before the name, with no tag for `LOCAL`. With `chime: true`, the line interrupts the queue, plays `chime`, waits 1.05 s, then types.
- Calling `defineSpeakers` mid-level (the rename) applies to later lines. The log keeps the name each line was shown with.
- **Until it lands:** unknown speaker fields are ignored (colour only), and comms sit under the fade.

```ts
// mission/mission.js — additions
addInteract(o: { id: string, at: Pos | Vector3 | (() => Vector3 | null), r?: number /*14*/, seconds?: number /*1.5*/,
                 label: string, flag?: string, onDone?: Action[] }): void;   // the interact-objective mechanic, without an objective
removeInteract(id: string): void;
```

- **`addInteract`.** On completion: `setFlag(flag, true)`, run `onDone`, then remove the interact. It isn't saved in snapshots; levels re-add it from `onCheckpoint`. Until it lands, P6 calls `ctx.mission.addInteract?.(...)`, and the optional sledges simply can't be flagged.
- **Waves.** Emit `encounter:wave` `{ id, wave }` (1-based) when a wave spawns. Until it lands, the triggers that wait on it never fire.
- **`level:start` ordering.** It fires after flags, objectives and structures are restored and the player has spawned.
- **Haul caches.** On a level with `def.campaign`, a collectible whose `unlocks` is a haul part (`ctx.haul?.isHaulPart(id)`, or `PARTS[id]?.haul`) doesn't call `save.unlockPart`. Its `pickup` payload gains `haul: true`, and the toast names the part. On other levels, collectibles unlock as arch §6.12 says.
- **`LevelResult`.** Fill `haul` from `ctx.haul?.rack ?? []` and `tears` from `ctx.haul?.tears ?? 0`. `water` counts the truthy mission flags in `def.campaign.waterFlags`, and `waterMax` is their number.
- **Flow.** Implement A3.7 in full. Leaving `playing` or `complete` resets `#fade` to 0 and removes the letterbox, because L1 ends on a fade to black.

### A5.3 P3: Forge

**Kit v1** (`art/kit.js`, **early**). Signatures are exactly as in AD §2.0 to §2.12. Every builder returns kit geometry: non-indexed, no `uv`, and exactly the attributes `position`, `normal`, `color` (vec3, linear, default 1) and `edge` (float, 1 on bevel faces). Results are cached by key, so clone before mutating.

```ts
export function kitFinalize(g, o?: { flat?: boolean, edgeAxis?: 'x'|'y'|'z', edgeAll?: 0|1 }): BufferGeometry;   // AD §2.0
export { rect, chamfer, chamferRect, round, taper, offset, split };                      // AD §2.1, §2.2
export function plateGeo(pts, depth, view, bevel, o?: { holes?: Array<Array<[number, number]>> });   // optional 5th param
export { slab, armourPlate, ribbedPlate };                                              // AD §2.2
export { latheHard, dome, ring, flange, drum, lampHousing, nozzle };                    // AD §2.3
export { cylinderBetween, pipeRun };                                                    // AD §2.4
export { loft };                                                                        // AD §2.6
export { rockGeo, floe, pressureRidge, icicles };                                       // AD §2.12
```

- `plateGeo`, `acKit`, `bevelBox`, `panelBox`, `cylinder`, `pipe`, `truss` and `greebles` keep their arch signatures and now return kit geometry (`acKit.ball` and `acKit.joint` included).
- `GeoBuilder.add` runs `kitFinalize` on any input that has no `edge` attribute, so mixing kit and non-kit geometry still merges. Its optional `o.tint` writes `color` (A4.2).
- **Until it lands:** P6 uses a local `kitOr(name, fallback)` in `levels/level01/kit.js` (for example `slab` falls back to `bevelBox`) and switches once Kit v1 exists.

**Mechs** (`art/mechs.js`):

- `DESIGNS.moth`: the Vanguard build in Founders materials (`MOTH_PAINT`: ceramic, gold trim, cyan visor), with the lattice-ring emblem on the left shoulder (a ring of 7 bevelled nodes linked by a hexagonal lattice, L1 §11.8).
- `PART_VISUALS.harpoon` (a launcher and cable reel replacing the left forearm's blade emitter) and `PART_VISUALS.flarepod` (a six-tube pod on the shoulder mount). The existing `shotgun` visual is built as the Dredge Sleet Gun: black iron and oxide red on visible adapter brackets (A2 #15).
- `animateMech`: `crouch: 1` is the kneel. The pelvis drops at least 2.5 m, the knees bend at least 70°, and the torso pitches forward 10° to 15°. It is used at the shore, at the alcove and in the Bench cradle. Optional additive `MechAnimState.tear?: number` (0..1: reach, grab, rip); P4 falls back to the blade pose without it.
- The Bench: A3.6. The free garage: A3.6.

### A5.4 P1: Look and Sound

```ts
// LevelArt additions (all optional; atmosphere.apply and set keep unknown fields in atmosphere.art)
sky.aurora?:  { strength: number /*0..1*/, colorA?: string /*#2fe0c8*/, colorB?: string /*#7b4dff*/,
                azimuth?: number /*350*/, height?: number /*deg, band centre, 55*/, speed?: number /*1*/ };
sky.dawnRim?: { strength: number, color?: string /*#ff5a2a*/, color2?: string /*#7a2a40, the top of the band*/,
                azimuth?: number /*default sky.sun.azimuth*/, width?: number /*deg half-width, 35*/, height?: number /*deg, 3*/ };
light.shadowMinElevation?: number;   // deg, default 0 (off). The shadow camera uses max(sun elevation, this).
palette.snow?: string; palette.strata?: string[]; surface?: SurfaceArt;   // passed through for P2 (A5.5)
// render/materials.js
uniforms: { uBeat: { value: number } };   // = ctx.clock.time, updated every frame
// render/particles.js
glows: { add(at: THREE.Object3D | Vector3, o: GlowOpts): GlowHandle; clear(): void };
interface GlowOpts { color: ColorLike; size: number /*m*/; intensity?: number /*2*/; minPx?: number /*0; ghost lights 4*/;
                     pulse?: 'none'|'beat'|'sparkle'|'flicker'; phase?: number; offset?: Vec3; }
interface GlowHandle { set(o: Partial<GlowOpts> & { visible?: boolean }): void; remove(): void; }
```

- **Sky.** The aurora and dawn rim go in the sky shader (AD §5.2, items 3 and 6). The dawn rim is visible whatever the sun's elevation, and hides the stars behind it. While `aurora.strength > 0`, the hemisphere's sky colour lerps 20% toward the aurora's mean colour.
- **Blends.** `atmosphere.set` blends every azimuth along the shortest arc (L1's night sun at 350° reaches the dawn sun at 95° through north), and blends the numeric fields of `aurora` and `dawnRim`.
- **Glows.** One InstancedMesh (capacity 512) of camera-facing quads, additive, `depthWrite: false`. Fog attenuates them by at most half. `minPx` sets a minimum on-screen size, and Low multiplies sizes by 1.3. `pulse: 'beat'` is AD §4.5's ghost beacon on `uBeat`; `'sparkle'` twinkles at 0.7 Hz (haul glints); `'flicker'` is for lamps. Glows are cleared on `level:cleared`. **Until it lands,** `glows` is undefined, so callers use `?.` and always keep the emissive lens mesh, which carries the read on its own.
- **Materials.** New `LibName`s, with the AD §4.2 values: `ironBlack`, `oxide`, `paintWake`, `paintWakeRed`, `ceramic`, `ceramicAged`, `gold`, `darkGlass`, `mirror`, `ice`, `snow`, `lightGold`, `lightSodium`, `lightGhost`. An unknown name returns a neutral grey standard material. Library materials keep `vertexColors: false` in the first build. The wear patch reads the `edge` attribute when it is present; a missing attribute reads as 0.
- **SFX** (added to arch C.1): `chime` (three descending notes, E5 → C5 → A4, 0.35 s apart, sine plus a soft bell partial), `heartbeat`, `flatline`, `tear`, `splash`, `bubbles`, `iceGroan`, `iceCrack`, `saw`, `harpoon`, `winch`, `rotorWhine`. The first five come first. `play()` with an unknown name is a no-op that warns once.
- **Unknown names.** An unknown `fx.impact` surface renders as `'ground'`, an unknown `fx.emitter` kind as `'smoke'`, and an unknown weather type as `'clear'`.

### A5.5 P2: World

- **Terrain material.** `TerrainRenderer.material` is AD §3.5's material, with `TERRAIN_LITE` defined on Low (derived as in A0 rule 6). It reads `art.surface` and `palette.snow` and `palette.strata` through `ctx.atmosphere.art`, with AD's defaults. The `surf` vertex attribute is internal. The vertex colour keeps arch §5.4's baked sun visibility (A2 #10). Sparkle is optional.

```ts
interface SurfaceArt { snow?: number; snowSlope?: [number, number]; gloss?: number; rockSlope?: [number, number];
  strataHeight?: number; strataWarp?: number; strataStrength?: number; wetness?: number; bump?: number; sparkle?: number; }
```

- **Props** (added to arch C.2): `ice_shard` (ground cover, at most 120 m away, no collider) and `snow_drift` (low, flat, no collider). Each has 3 seeded variants, like the other natural props.
- **Collision.** `ColliderOpts.surface` accepts any string, such as `'ice'` or `'snow'`, and passes it through unchanged to `SegmentHit.surface`.

### A5.6 P6: Level 1, and the format additions

**P6 deliverables.**

- **`levels/campaign.js` (early):** A3.3.
- **`levels/level01.js`:**
  - add `campaign: { bench: true, waterFlags: ['sled1', 'sled2', 'sled3'] }`;
  - use the engine haul ids (A2 #14) and the AD colours and field shapes for aurora and dawn rim (A2 #7, A5.4);
  - fix the `MOTH` speaker (A2 #24);
  - set the `vitals` lock flag at the reboot (A2 #19);
  - turn the rack panel on in `t_first_tear` (`hud.setPanels({ rack: true })`);
  - apply the content trims in A1.3.
- **Map L1's custom actions onto the committed APIs**, with no fallbacks (A0 rule 7):

  | Custom action | Maps to |
  | --- | --- |
  | `abilities` | `ctx.player.abilities` (L1 §12.2's presets, with `tear` on from `lock` up), plus `ctx.haul.enabled` |
  | `hudPanels`, `hudSlots` | `ctx.hud.setPanels`, `ctx.hud.setSlots` (the draft's `all: false` sets every panel key; its `vitals` key goes to `hud.vitals` modes instead) |
  | `vitals` | `ctx.hud.vitals` |
  | `kneel` | `ctx.player.animOverride = { crouch: 1 }`, then `null` |
  | `mothWalk`, `turnNorth` | `ctx.player.autopilot` |
  | `idleFacing` | `ctx.player.idleFacing` |
  | `hoverIcing` | `ctx.player.hoverCostScale` |
  | `flagSled` | `ctx.mission.addInteract({ id, at: () => sled position, label: 'FLAG SLEDGE', flag })` |
  | `renameSpeaker` | `ctx.comms.defineSpeakers` |
  | `callsign` | `ctx.hud.setCallsign` |
  | `cutter` | `ctx.player.hidden`, the `cutter` abilities preset, `ctx.haul.enabled = false` |
  | the water system | `gravityScale`, `enRegenScale`, and `abilities.boost = false` underwater |
- **Custom units** (`levels/level01/units.js`, built on `Unit`):
  - Set `haul` through `config.haul` and honour `blindT`.
  - A staggered unit must not overwrite a `pos` moved from outside (the harpoon reel).
  - Ghost lights are a `lightGhost` lens plus `glows` with `pulse: 'beat'`, `minPx: 4`.
  - The carrier's flares call `ctx.projectiles.retarget({ near: carrier.pos, r: 140, team: 'player', from: carrier }, decoy)`, and its `haul.onTaken` removes them.
- **The Sexton** gets its ghost light on `unit:spawned` (tag `sexton`).

**Format and registry additions** (owners as listed):

| Addition | Shape | Owner |
| --- | --- | --- |
| `LevelDef.campaign` | `{ bench?: boolean, waterFlags?: string[] }` | P5 reads, P6 writes |
| `LevelArt` fields | A5.4, A5.5 | P1, P2 |
| `SpeakerDef` fields | A5.2 | P5 |
| `SpawnOpts.config.haul` | a part id or `{ part, glint?, heavy? }` | P4 parses |
| Event `haul:tear` | `{ target, part, destroyed: boolean }` | haul (P4) |
| Event `haul:racked` | `{ part, rack: string[], dropped: string \| null }` | haul (P4) |
| Event `haul:left` | `{ part }` | haul (P4) |
| Event `encounter:wave` | `{ id, wave }` | mission (P5) |
| Event `player:autopilotDone` | `{}` | player (P4) |
| Payload `target:damaged`, `player:damaged` | `+ blocked?: boolean` | combat (P4) |
| Payload `pickup` | `+ haul?: boolean` | mission (P5) |
| Arch C.1 SFX | the 12 names in A5.4 | P1 |
| Arch C.2 props | `ice_shard`, `snow_drift` | P2 |
| Arch C.4 parts, visuals, frames | `harpoon_gaff`, `flare_pod`; visuals `harpoon`, `flarepod`; `FRAMES.moth`; `DESIGNS.moth` | P4, P3 |
| New files | `src/combat/haul.js` (P4), `levels/campaign.js` (P6) | |

---

## A6. Your additions, per package

**Early** items land in your first pass (A0 rule 5). Every package also adds asserts for its additions to its own scenario and lists them in its hand-off (arch §10.10).

### P0: Scaffold

- Nothing. Your files stay frozen. Addendum items are deliberately outside `contract.json`.

### P1: Look and Sound

- **Early:** the 12 SFX names (a simple synth is fine at first); the 14 library names and the unknown-name fallbacks; `materials.uniforms.uBeat`; `particles.glows` (a basic instanced version).
- `sky.aurora` and `sky.dawnRim` in the sky shader, including the hemisphere tint (A5.4).
- Shortest-arc azimuth blends; `atmosphere.art` keeps unknown fields; `light.shadowMinElevation`.
- Unknown-name rules for `audio`, `fx` and `weather` (A5.4).
- Scenario: L1-style night sky shots (aurora and dawn rim) on each tier, a night-to-dawn blend sequence, a ghost glow at 1 km holding at least 4 px, and every new SFX playing without throwing.

### P2: World

- AD §3.5's terrain material inside `TerrainRenderer`, with `TERRAIN_LITE` on Low, reading `surface`, `palette.snow` and `palette.strata`. The vertex bake stays as arch §5.4.
- The props `ice_shard` and `snow_drift`.
- `ColliderOpts.surface` passes any string through.
- Scenario: shots of an inline snowy-ice art preset on High and Low, with no tiling at 50 to 300 m.

### P3: Forge

- **Early:** Kit v1 and the attribute rules, including `GeoBuilder` normalising its inputs (A5.3).
- `DESIGNS.moth`; `PART_VISUALS.harpoon` and `flarepod`; `shotgun` in the Dredge style.
- `crouch: 1` as the kneel; optional `tear` pose.
- `garage.open({ context: 'bench' })`, `contexts` and `bench`: the scene, the four tabs, the A3.5 rules, undo, Bench lines and the WALK ON commit (A3.6).
- The free garage hides `campaignOnly` frames.
- Scenario: the Bench with a pending haul of 3 at 1280×720 and 844×390; fit, give and undo through `garage.bench`; the save flag after `walkOn()`; a kneeling Moth shot; Kit v1 gallery shots, including `floe`, `pressureRidge` and `icicles`.

### P4: Combat and AI

- **Early:**
  - the `loadout.js` data in A3.2 (`FRAMES.moth`, the names, `haul` and `stock` blocks, the two new parts, the retune, `MOTH_PAINT`, `CAMPAIGN_STOCK`, `campaignLoadout`);
  - the player fields and gating (A5.1);
  - `Unit` parsing of `haul`, and `blindT`.
- `ctx.haul`: glints, TEAR, the swap choice, checkpoint flags, caches.
- The `harpoon` and `flares` weapons; decoy targets and `projectiles.retarget`.
- `invuln` and `blocked`; `DamageSource.kind`; `idleFacing`, `autopilot`, `animOverride`, `hidden` and the three scales; the `mech` leash.
- Scenario: each ability gated and ungated; TEAR on a staggered haul unit in the test level gives a rack of 1; a full rack opens the choice; a checkpoint restart restores the rack; the harpoon reels a drone and pulls the player to a wall; a flare retargets a missile; an invulnerable player takes 0; autopilot arrives and emits its event.

### P5: Mission and Interface

- **Early:** `hud.vitals`, `setPanels`, `setSlots` and `mission.addInteract`, at least as accepting no-ops, then real.
- The vitals widget; automatic slots; the TEAR prompt and rack HUD; `choice` with up to 4 options; `prompt` options; the blocked-hit flash.
- Comms typography, comms over the fade, the chime and the mid-level rename.
- `addInteract`; `encounter:wave`; `level:start` ordering; routing haul caches; the `LevelResult` additions.
- `showDebrief` and `showBriefing` options; `showMorningCount`; flow states `bench` and `count`; campaign state writes; the campaign loadout; resetting the fade (A3.7).
- Scenario: each vitals mode in the DOM; a comms line over `fade(1)`; the Morning Count screenshot; the flow loop with an inline LevelDef that has `campaign: { bench: true }`, covering debrief, Bench (or the fallback), Count and title.

### P6: Level 1

- **Early:** `levels/campaign.js` (A3.3).
- `levels/level01.js` and `levels/level01/*` as in A5.6, with the trims in A1.3 and the rulings in A2 (#3 to #8, #14, #16 to #19, #22 to #24).
- The only fallback P6 builds is the waterline fog (A1.2). The light wall, the shaft-light cones and the Sexton's ghost light are ordinary level content, not fallbacks.
- `level01.mjs` (L1 §19), plus:
  - the vitals going `live` → `flat` → `locked` at 60;
  - rack contents across a checkpoint restart;
  - a full Bench pass through `garage.bench`;
  - the Count's water arithmetic (4 + sledges + gives − 3);
  - the spoiler grep: no "Moth" in UI text before the naming, and no "I", "me" or "my" in Moth's lines before "Hold on to me." (A2 #4).
