# Addendum 02: engine additions for Level 2

Version 1. Binding for the Level 2 build. Written by the lead level designer from `docs/level-02.md`, against the engine as it stands after the Level 1 integration (`architecture.md` plus `addendum-01.md`, all landed). **Build team only:** it names story beats.

**How to read it.** Read `architecture.md` and `addendum-01.md` first, then this, then `level-02.md`. Where this addendum adds an interface, that interface is as binding as architecture §4. It only adds: nothing in architecture §3.5, §4, Appendix C or addendum 01 is renamed, removed or changes meaning. Sections are B0 to B8. "L2 §x" means `level-02.md`, "A1 x" means `addendum-01.md`, "bible §x" the story bible.

**The principle: as small as possible.** Level 2 needs exactly the engine pieces that (a) every later level reuses (Sync, the new hardpoints and parts, the Bench's hunger and overwrite, campaign results), or (b) only the engine can reach (input actions, the HUD, the damage pipeline). Everything that is one level's set piece is level code in `levels/level02/` (§B7).

---

## B0. Working rules

Addendum 01 A0's rules carry over unchanged, in particular:

1. **No named imports of new exports across packages.** LEVEL reaches every new engine feature through `ctx` (`ctx.sync`, `ctx.hud.tracker`) or namespace imports (`import * as LO from '../src/combat/loadout.js'`, then `LO.PARTS.sail_rig`), and feature-detects it (§B6.3).
2. **No new entries in `main.js`.** `ctx.sync` is created inside `combat/combat.js` `install()`, as `ctx.haul` is.
3. **Unknown names never throw.** Unknown SFX, `SpeakerDef` fields, panel keys, part ids and visual ids fall back silently (warn once).
4. **Surface first, behaviour second.** ENGINE lands every export, field and method in this addendum as a working no-op in its first pass (about a fifth of its time), so LEVEL's feature detection finds them, then fills in behaviour.
5. **No new `LevelDef` keys.** Everything Level 2 adds to the campaign travels through `levels/campaign.js` (`CampaignData`, §B4) and mission flags, so `validateLevel` accepts `levels/level02.js` today, with or without ENGINE. (The level draft in L2 §17 validates against the current `validateLevel`.)
6. **Whoever changes `ctx.timeScale` restores it only if it still holds their value.** Haul's swap choice (0.3), Second Sight (0.7) and the level's own slow-motion (0.4) can overlap; each keeps the value it found and puts it back only if nobody changed it since.
7. **Determinism.** Everything that affects gameplay uses sim time and `ctx.random`. Cosmetic jitter (comms wobble, glows) may use a seeded hash of its own; never `Math.random` where a test reads the result.

---

## B1. Scope

### B1.1 Engine additions (this addendum)

| # | Item | Files | Priority |
| --- | --- | --- | --- |
| E1 | Sync and the partner moves (`ctx.sync`): meter state, Second Sight, Moth Drives, Hold, filling, checkpoint flags | `src/combat/sync.js` (new), `src/combat/combat.js` | 1 |
| E2 | Input actions `sight` and `drive` | `src/core/input.js` | 1 |
| E3 | Player: Moth Drives steering, perfect-dodge detection, part mods (Sail-Rig, Skate-Jets), `invulnT` | `src/actors/player.js` | 1 |
| E4 | Targets: `windup`, `slowT`; Hold in the damage pipeline; damage credit for Sync | `src/actors/enemy.js`, `src/actors/enemytypes.js`, `src/actors/mechai.js`, `src/combat/combat.js` | 1 |
| E5 | HUD: the Sync meter and its touch buttons, the `SAIL` chip, `hud.tracker`, explain cards during the Bench and the Count | `src/ui/hud.js` | 1 |
| E6 | Comms typography: `wobble`, `speedVar` | `src/ui/comms.js` | 3 |
| E7 | Hardpoints B, G, C; `PartDef.mods`; four parts; weapon types `rivet` and `claw` | `src/combat/loadout.js`, `src/combat/weapons.js` | 1 |
| E8 | Hungry haul glints | `src/combat/haul.js`, `src/ui/hud.js` (rack dot) | 2 |
| E9 | Part visuals `sailrig`, `skates`, `rivet`, `claw`; ghost beacons on bound hungry parts | `src/art/mechs.js` | 2 |
| E10 | Campaign results: rigs lost in a level, story flags, Made fragments, Sync persistence, log variants, debrief rows, state v2 | `src/ui/flow.js`, `src/ui/screens.js`, `src/mission/mission.js` | 1 |
| E11 | Bench V2: B and G hardpoints, hungry fits and the overwrite picker, the forced fit, gifts, bound parts, fragment states, `NEW` cards, the Sync readout, explain cards, new line keys; Calls funding | `src/ui/garage.js` | 1 (Calls: 2) |
| E12 | SFX names | `src/audio/audio.js` | 3 |
| E13 | Engine scenario | `tools/scenarios/eng-l02.mjs` (new) | 1 |

### B1.2 Not in the engine (level-local, §B7)

The moving convoy, its band, harpooned rigs and the camp; the `land_yacht`, `harpooner` and `skimmer` kinds; the *Tally*; the Watcher and Rusk's Skimmer; reeds (registered through the existing `registerProp` export); the Sundial, its skyline and its shadow stripe; the salt crust; the far painting; all L2 structure types; the explain-card queue; the rocket volleys.

### B1.3 Deferred to Level 3's addendum

The in-level Call wheel and the Calls themselves; the Skate-Jets' water hover and wall-ride (data lands now, behaviour with L3's flood); the comms echo hook for overwritten fragments (F01's echo at the Gerrow Bridge always plays, so L3 can script it); `throwable` structures for the Crane-Claw; `mods.holdCost` (the Cantor Mantle, L7).

---

## B2. Rulings

| # | Topic | Ruling |
| --- | --- | --- |
| 1 | Partner-move inputs (bible §7.6 suggests E and F, but E is lock and F is interact) | New actions `sight` and `drive`: desktop **C** and **V**, gamepad **D-pad up (12)** and **D-pad down (13)**, touch buttons **SIGHT** and **DRIVE** (injected by the HUD). |
| 2 | Quick-boost charges (A1 A2 #13) | Cantor Wings stay limited by EN only. `mods.qbCooldown` gives parts a minimum time between quick boosts; the Sail-Rig uses 1.0 s ("1 charge"). |
| 3 | Hold's comms line | **The engine never speaks for Hold.** It flashes the HUD and plays `syncHold`. *"Hold on to me."* is scripted by levels (L2 §1.3 A4: L1, L2 and L6 only). |
| 4 | Dodges during Moth Drives | The free dodges Moth Drives makes don't add Sync (no farming). The player's own perfect dodges do. |
| 5 | Campaign extensions | Carried by `CampaignData.legs[id]` (static config, LEVEL writes) and mission flags (runtime values, LEVEL sets), read by flow at `level:complete`. `LevelResult` gains `flags` so flow can read them. No new `LevelDef` keys (B0 rule 5). |
| 6 | Stock booster, legs and core | Not `PARTS` entries. `fitted.B/G/C = null` means stock (Cantor Wings, Cantor Stride, Hymnal Core); the Bench shows them from `CampaignData.fixed`. Stock never uses Locker space (A1 A2 #11). |
| 7 | Overwrite and undo | An overwrite is final when confirmed (bible §7.8 rule 6). Undoing the fit afterwards leaves the part bound; refitting it is free. |
| 8 | Sync capacity | `floor(Σ fragment value)` over the twelve old fragments plus every Made fragment present in campaign state: intact 1, retold 0.5, overwritten 0. A missing old fragment counts as intact (A1 A3.4). With no campaign state (the test level), 12. |
| 9 | Second Sight time scale | 0.7 for 6 s of **sim** time (8.6 s real). Its path lines and flashes update on real frames so they stay smooth. |
| 10 | Hungry glints | Pale green-white `#d8ffe6` with `pulse: 'sparkle'`, plus a faint ghost-green halo (`#a8ff9e`, `pulse: 'beat'`). Never pure ghost green alone: that colour is reserved for ghost beacons (AD §1.6). |

---

## B3. Interfaces

### E1. Sync (`ctx.sync`, new file `src/combat/sync.js`)

Installed from `combat/combat.js` `install()` (like `ctx.haul`). Bible §7.6 is the rule; this is the contract.

```ts
type MoveId = 'sight' | 'drive' | 'hold';
interface Sync {
  enabled: boolean;                       // false. While false: nothing fills, no move or Hold fires, the panel stays hidden
  readonly capacity: number;              // segments (B2 #8); 12 without campaign state
  readonly fill: number;                  // 0..capacity, float (the HUD shows whole segments plus a partial underline)
  readonly unlocked: ReadonlySet<MoveId>;
  readonly costs: Readonly<{ sight: 3, drive: 4, hold: 6 }>;
  readonly durations: Readonly<{ sight: 6, drive: 8 }>;   // sim seconds
  readonly active: null | { move: 'sight' | 'drive', t: number /*s left*/, dur: number, free: boolean };
  readonly holdReady: boolean;            // enabled && unlocked.has('hold') && capacity >= costs.hold && fill >= costs.hold
  enable(on?: boolean): void;             // default true
  unlock(...moves: MoveId[]): void;       // also enables
  lock(...moves: MoveId[]): void;
  add(n: number, reason?: 'damage' | 'dodge' | 'tear' | 'script'): void;   // clamped to capacity
  setFill(n: number): void;               // clamped, no event (scripts and restores)
  atLeast(n: number): void;               // setFill(max(fill, min(n, capacity)))
  use(move: 'sight' | 'drive'): boolean;  // false if disabled, locked, unaffordable, another move active, or the player frozen or dead
  free(move: 'sight' | 'drive'): boolean; // as use(), without spending (tutorials)
  cancel(): void;                         // ends the active move, no refund
  refreshCapacity(): void;                // re-reads campaign fragments (the Bench calls it after an overwrite)
}
```

**Inputs.** Every sim frame while `enabled` and the flow state is `playing`: `input.pressed('sight')` → `use('sight')`; `input.pressed('drive')` → `use('drive')`, or `cancel()` if Moth Drives is active.

**Filling** (bible §7.6):
- **Damage:** every `target:damaged` whose source team is `'player'` adds `amount / 1500` (so +1 segment per 1,500 damage).
- **Perfect dodge:** `player:perfectDodge` (E3) adds 1.
- **TEAR:** `haul:tear` adds 2.
- The meter never drains. `sync:filled { fill, segments, reason }` is emitted each time a whole segment is crossed.

**Second Sight** (`sight`, 3 Sync, 6 s):
- `ctx.timeScale = 0.7` (B0 rule 6).
- **Path lines:** one `LineSegments` (capacity 64 paths × 12 segments, additive, `depthWrite: false`, colour `#ff6a3a`, alpha fading along the path). Each frame, for every live hostile projectile within 250 m of the player: its predicted path over the next 1.5 s (ballistic with its gravity if it has any; homing projectiles as a curve that bends toward their target at their turn rate).
- **Wind-up flashes:** every live hostile target with `windup > 0` (E4) gets a red glow on its root (`particles.glows.add(root, { color: '#ff3b1f', size: max(2, hitR × 0.8), pulse: 'flicker', intensity: 3 })`), removed when `windup` returns to 0 or the move ends.
- HUD: `#hud` gets the class `sight` (E5). Audio: `syncSight` at start and end.
- Emits `sync:move { move: 'sight', free }` and, at the end, `sync:end { move: 'sight' }`.

**Moth Drives** (`drive`, 4 Sync, 8 s): sets `ctx.player.drive = { until: clock.time + 8 }` (E3) and plays `syncDrive`. Ends at `until`, on `cancel()`, on death or when the player is frozen. Events as above.

**Hold** (6 Sync, automatic): the hook is in `combat.damage` (E4). When it fires, `ctx.sync` spends the cost, sets `ctx.player.invulnT = 2`, plays `syncHold`, flashes the HUD and emits `sync:hold { source }`. **No comms** (B2 #3).

**Checkpoints.** Mission flags `sync:on` (bool), `sync:unlocked` (array) and `sync:fill` (number, written at most twice a second and on every move). On `level:start`: a fresh start reads campaign state (`st.sync.unlocked`, §B5): if it is non-empty, enable and unlock those moves with fill 0; otherwise disabled. A restart reads the flags. On `level:cleared` and `level:start`: end any active move, restore the time scale, clear paths and glows, `ctx.player.drive = null`.

**Until it lands:** `ctx.sync` is undefined. LEVEL calls `ctx.sync?.…` and shows no meter.

### E2. Input actions (`src/core/input.js`)

```ts
ACT.SIGHT = 'sight'; ACT.DRIVE = 'drive';            // added to the frozen ACT object's source (new keys only)
DEFAULT_BINDINGS.sight = ['KeyC']; DEFAULT_BINDINGS.drive = ['KeyV'];
PAD_BINDINGS.sight = [12];         PAD_BINDINGS.drive = [13];   // D-pad up, D-pad down
TOUCH_ACT.sight = 'sight';         TOUCH_ACT.drive = 'drive';
```

- `pressed`, `down`, `released` and injection work for the new actions like the others. They aren't in `ALWAYS`.
- The touch buttons themselves are created by the HUD (E5) inside `#touch` with `class="tb"` and `data-act="sight"` / `"drive"`; input's existing delegated handler (`closest('.tb')`) routes them.

### E3. Player additions (`src/actors/player.js`)

```ts
drive: null | { until: number };      // Moth Drives (set by ctx.sync). While set, movement intent comes from the steering below
invulnT: number;                      // 0. Seconds of invulnerability (Hold). Honoured like `invuln` (A1 A5.1)
readonly sail: boolean;               // the Sail-Rig's SAIL state (mods.sail), for the HUD and the rig
readonly mods: PartMods;              // = stats.mods (E7), merged from fitted B, G and C parts
```

**Moth Drives steering** (while `drive` is set; look, aim, fire, missiles, blade and TEAR stay the player's):
- **Target:** the lock target if alive, else the nearest hostile within 400 m, else none (the frame holds position).
- **Range:** keep the distance to the target within 15 m of `pref`: the R-arm part's `stats.pref` (rifle 140, shotgun 30, rivet 100; default 120). While the player's support is a structure collider (a deck), clamp `pref` to 40 m.
- **Orbit:** move tangentially at 70% of ground speed; flip direction every 3 s, or when the next 8 m along the orbit is blocked (`collision.segment`) or is a drop.
- **Edge safety:** sample the support height 6 m ahead along the intended move; if it is more than 3 m below the current support, drop that component and flip the orbit. The frame never walks off a deck by itself.
- **Auto-dodge:** each frame, scan hostile projectiles within 60 m. If one's closest approach to the player's centre is under `hitR + 1.5` m within the next 0.35 s, quick-boost perpendicular to its velocity, away from the approach point, **at no EN cost**, at most once every 0.5 s. These dodges don't add Sync (B2 #4).
- Ends when `clock.time ≥ until`, or on death, `frozen`, or `drive = null`.

**Perfect dodge.** When the player starts a quick boost from input (not from Moth Drives), scan hostile projectiles within 60 m: if any would have hit (closest approach under `hitR + 0.5` m) within 0.25 s, emit `player:perfectDodge { projectile }` (at most once per quick boost).

**Part mods** (read every frame from `stats.mods`, E7):
- `speedMul`: already applied as `S.speedMul`; mods multiply it.
- `accelMul`: scales the ground acceleration damping (k 7 → 7 × accelMul).
- `lateralGrip`: on the ground, the velocity component across the body's facing decays at this rate (default 7 per second, the same as acceleration today; Skate-Jets 2.5, so turns slide).
- `qbCooldown`: minimum seconds between quick boosts (default 0).
- `sail: { after, minSpeedFrac, maxTurn, breakTurn, speedMul, qbFree }`: after `after` seconds on the ground at ≥ `minSpeedFrac` of top speed with the heading changing slower than `maxTurn` °/s, `sail` becomes true: ground speed × `speedMul`, quick boosts cost 0 EN if `qbFree`. A turn faster than `breakTurn` °/s, stopping, a stagger or 1 s airborne ends it. `rig.setSail?.(0..1)` animates the vanes (E9).
- `waterHover`, `wallRide`: stored, no behaviour until Level 3 (B1.3).

**Until it lands:** the fields are absent; Moth Drives does nothing; parts change nothing.

### E4. Targets, damage and Hold

**`src/actors/enemy.js`** (Target and Unit additions):

```ts
interface Target {
  windup?: number;   // seconds until a telegraphed attack lands; > 0 only while winding up. Read by Second Sight.
  slowT?: number;    // seconds of slow left (the Rivet Driver). While > 0 the unit moves at 80% speed.
}
// Unit: baseUpdate counts slowT down and exposes
readonly speedScale: number;   // slowT > 0 ? 0.8 : 1. Every kind multiplies its movement speed by it.
```

- Every engine kind multiplies its speeds by `speedScale` and sets `windup` during its existing telegraphs: tank barrel glow, artillery ground warning, gunship rocket lock, walker cannon, mech blade wind-up and shock charge (`src/actors/enemytypes.js`, `src/actors/mechai.js`).
- **LEVEL contract:** level kinds do the same (L2 §10).

**`src/combat/combat.js`** (inside `damage()`, for the player only, after the existing `invuln` check):

```ts
// Hold: a hit that would take AP to 0 or below
if (target === ctx.player && !blocked && amount >= target.ap && ctx.sync?.holdReady) {
  amount = target.ap - 1; imp = 0;          // AP stays at 1; no stagger from this hit
  ctx.sync._fireHold(source);               // spends 6, invulnT = 2, HUD flash, 'syncHold', emits sync:hold
  info.held = true;                         // DamageInfo addition
}
```

- `invulnT > 0` blocks damage exactly like `invuln` (A1 A5.1: returns `blocked: true`).
- `DamageInfo.held?: boolean` and `target:damaged`/`player:damaged` payloads carry it.

### E5. HUD (`src/ui/hud.js`)

**Panels.** `setPanels` accepts two new keys, both default false: `sync` and `tracker`. Unknown keys stay ignored.

**The Sync meter** (visible when the `sync` panel is on **and** `ctx.sync?.enabled`):
- Under the AP bar: `capacity` segments in one row (they shrink to fit up to 17). Filled segments cyan `#7fe9ff`; the partial segment as a thin underline.
- Tick labels under the row at their cost positions: `SIGHT 3`, `DRIVE 4`, `HOLD 6`, each lit when unlocked and affordable, dim when unlocked but not affordable, hidden when locked. On desktop the labels carry the key (`C`, `V`). **HOLD greys out with a dash when `capacity < 6`** (bible §7.6). `HOLD` reads `HOLD READY` when `holdReady`.
- While a move is active, the meter's header reads `SECOND SIGHT · 4.2` or `MOTH DRIVES · 6.0`.
- On `sync:hold`: the meter flashes white, a centred `HOLD` text shows for 1.5 s, and a 0.3 s white screen flare plays.
- **Touch:** two buttons, `SIGHT` and `DRIVE`, created inside `#touch` (`class="tb"`, `data-act` `sight` and `drive`), placed above BOOST. Shown only when the move is unlocked and Sync is enabled; dimmed through `input.setTouchLabel(act, label, true)` when unaffordable.
- **Second Sight overlay:** `#hud.sight` adds a cyan inner vignette and a 2 px chromatic edge (CSS only).

**The `SAIL` chip:** a small `SAIL` tag beside the EN bar while `ctx.player.sail` is true.

**The tracker:**

```ts
tracker(def: null | {
  id: string;                         // replaces any tracker with another id
  title: string;                      // 'THE WAKE'
  value?: string;                     // '38 RIGS · 284 SOULS'
  band?: null | { state: 'in' | 'warn' | 'out', text: string };   // 'WITH THE WAKE' / 'TOO FAR · 640 m' / 'OUT OF RANGE · 22 s'
  alerts?: Array<{ id: string, label: string, t: number /*0..1 left*/, text?: string /*'15 s'*/, kind?: 'danger' | 'info' }>;   // ≤ 3 shown
}): void;
readonly trackerState: object | null;    // tests
```

- Under the objectives panel; on touch, stacked under the objectives with the same width rules as the explain card (P5's touch stacking). Cheap DOM diff: callers may call it every 0.25 s.
- `band.state` colours the line: `in` dim, `warn` amber, `out` red and blinking. Alerts are a draining bar with the label and text, `danger` red.
- `tracker(null)` hides it. Shown only when the `tracker` panel is on.

**Explain cards at the Bench and the Count.** `hud.explain` keeps working while flow is in `bench` or `count`: `#explain` is shown above the Bench and Count overlays (z-index), and its queue advances in real time there (the sim is paused). Recording into `save.flags.glossary` (Field notes) is unchanged.

**The rack's hungry dot.** A racked part with `haul.hunger > 0` shows a pale green-white dot instead of amber.

**Until it lands:** `hud.tracker` is undefined (LEVEL calls `ctx.hud.tracker?.(…)`); unknown panel keys are ignored.

### E6. Comms typography (`src/ui/comms.js`)

```ts
interface SpeakerDef {        // additions
  wobble?: number;            // 0..1. Each typed letter starts displaced up to wobble × 3 px and settles over 0.25 s;
                              // at ≥ 0.5 the line keeps a 0.5 px jitter while it is on screen
  speedVar?: number;          // 0..1. Per-letter typing delay × (1 + speedVar × 0.8 × r), r in [−1, 1], plus a 5% chance
                              // of a 4× pause. r comes from a hash of the line text (deterministic)
}
```

The log and `comms:line` keep plain text. **Until it lands:** both fields are ignored (A1 A0 rule 4).

### E7. Hardpoints, parts and weapons (`src/combat/loadout.js`, `src/combat/weapons.js`)

```ts
type Hardpoint = 'B' | 'G' | 'C';                       // booster, legs, core: mods-only parts, no weapon
export const HARDPOINTS: Hardpoint[] = ['B', 'G', 'C'];
interface Loadout { B?: string | null; G?: string | null; C?: string | null; }   // additions; null/absent = stock
interface PartDef {                                     // additions
  slot: /* existing */ | 'B' | 'G' | 'C';
  mods?: PartMods;
  visual?: string;                                      // existing; plus PARTS[id].ghostLight below
  ghostLight?: boolean;                                 // a bound copy shows a ghost beacon on the frame (E9)
  stats: { /* existing */ pref?: number };              // preferred range for Moth Drives (R-arm parts)
}
interface PartMods { speedMul?: number; accelMul?: number; lateralGrip?: number; qbCooldown?: number;
  sail?: { after: number, minSpeedFrac: number, maxTurn: number, breakTurn: number, speedMul: number, qbFree: boolean };
  waterHover?: boolean; wallRide?: number;              // stored; behaviour with Level 3
  apMul?: number; enMul?: number; enRegenMul?: number; hoverMul?: number; }
export const CAMPAIGN_STOCK: { R: 'rifle_r30', L: 'blade_pb2', S: 'msl_vm4', U: 'kit_rk3', B: null, G: null, C: null };
export function campaignLoadout(fitted?: Partial<Record<'R'|'L'|'S'|'B'|'G'|'C', string | null>>): Loadout;
     // as A1 A3.2, plus B, G and C (copied when PARTS[id] exists and its slot matches)
```

- `computeStats(loadout)` merges the mods of the B, G and C parts into `stats.mods` (multiplying the `*Mul` fields, taking the max of `qbCooldown`, the last `sail`), and applies `speedMul`, `apMul`, `enMul`, `enRegenMul` and `hoverMul` to the existing stats. `stats.mods` is `{}` when nothing is fitted.
- `validate` keeps working; B, G and C parts weigh 0 and draw 0 power (load and power never bind in the campaign).

**New parts:**

| id | name | slot | weapon | stats | mods | haul | visual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sail_rig` | Sail-Rig | B | — | — | `{ qbCooldown: 1.0, sail: { after: 2, minSpeedFrac: 0.9, maxTurn: 12, breakTurn: 25, speedMul: 1.2, qbFree: true } }` | `{ give: 2, hunger: 0, source: 'L2:land_yacht' }` | `sailrig` |
| `skate_jets` | Skate-Jets | G | — | — | `{ speedMul: 1.35, accelMul: 0.55, lateralGrip: 2.5, waterHover: true, wallRide: 1.5 }` | `{ give: 2, hunger: 1, source: 'L2:skimmer' }` | `skates`, `ghostLight: true` |
| `rivet_driver` | Rivet Driver | R | `rivet` | `{ dmg: 650, imp: 420, rate: 0.66, speed: 420, ammo: 120, spread: 0.004, range: 400, slow: 0.2, slowT: 2, pref: 100 }` | — | `{ give: 2, hunger: 0, source: 'L2:harpooner' }` | `rivet` |
| `crane_claw` | Crane-Claw | L | `claw` | `{ grabR: 25, cone: 20, hold: 6, throwSpeed: 90, dmg: 1600, imp: 1800, splashR: 8, splashDmg: 600, splashImp: 600, swipeR: 12, swipeDmg: 900, swipeImp: 900, cd: 1.2, lightImpMax: 1000 }` | — | `{ give: 2, hunger: 0, source: 'L2:tally_crane' }` | `claw` |

All four: `unlock: { by: 'salvage', hint: 'Recovered in the field' }` (locked in the free garage, A1 A3.6). `desc` strings (shown on Bench cards): Sail-Rig `Long straight runs go faster, and their quick boosts are free. No chained quick boosts.`; Skate-Jets `Much faster on the ground. Slides on turns. Skims water.`; Rivet Driver `Slow, heavy bolts. Staggers and slows what it hits.`; Crane-Claw `Grab a staggered enemy, then throw it.`

**Weapon `rivet`** (R slot): a projectile weapon like `rifle` with a heavy bolt mesh (a short dark rod with an amber hot tip) and `rate` as the cooldown. On hit it sets the target's `slowT = max(slowT, stats.slowT)`. Readout: ammo.

**Weapon `claw`** (L slot), a state machine:
1. **Press** with a grabbable target (a live hostile with `impMax ≤ lightImpMax` that is staggered, within `grabR` and `cone`° of the aim; the lock target preferred): a 0.3 s reach, then **holding**. The held unit stays staggered (`stagT` refreshed every frame) and is moved to the claw's muzzle each frame after AI (the A1 A5.6 rule: a staggered unit must not overwrite a `pos` moved from outside).
2. **Press again** (or at `hold` seconds): **throw** along the aim at `throwSpeed`. On impact: `dmg`/`imp` to the hit target, `splashDmg`/`splashImp` within `splashR`; the thrown unit is killed (`kind: 'claw'`).
3. **Press with nothing grabbable:** a swipe within `swipeR` in front, `swipeDmg`/`swipeImp`.
4. Cooldown `cd` after a throw or swipe. TEAR keeps working with the claw fitted (TEAR takes the blade input whenever a candidate exists, as now).

Readout: `READY`, `HOLDING 4 s`, or the cooldown. `DamageSource.kind` is `'rivet'` or `'claw'`.

### E8. Hungry glints (`src/combat/haul.js`)

When `PARTS[part]?.haul?.hunger > 0`, the glint is `{ color: '#d8ffe6', size: 1.0, pulse: 'sparkle', minPx: 3 }` plus a second glow `{ color: '#a8ff9e', size: 1.6, pulse: 'beat', intensity: 0.6 }` on the same point (B2 #10). Everything else in TEAR and the rack is unchanged. **Until it lands:** amber glints.

### E9. Part visuals and ghost beacons (`src/art/mechs.js`)

- `PART_VISUALS.sailrig`: two folding vane-sails (battened oxide plates on black iron spars) on the back booster housing, folded flat; `rig.setSail(k: 0..1)` unfolds them (the player calls it from `sail`).
- `PART_VISUALS.skates`: four hover-skid pods on the shins and feet (black iron, oxide chevrons) with a blue-white jet glow underneath when moving.
- `PART_VISUALS.rivet`: a box-magazine rivet gun replacing the right forearm rifle.
- `PART_VISUALS.claw`: a three-finger hydraulic claw on the left forearm, replacing the blade emitter.
- All Dredge style: black iron and oxide red bolted onto the white ceramic with visible adapter brackets (as A1 A5.3's Sleet Gun).
- `buildMech(ctx, opts, { parts: { R, L, S, U, B, G, C }, bound?: string[] })`: B, G and C parts are drawn. For every drawn part whose `PARTS[id].ghostLight` is true **and** whose id is in `bound`, add a `lightGhost` lens and `particles.glows?.add(lens, { color: '#a8ff9e', size: 0.5, pulse: 'beat', minPx: 4 })` at the part's mount (bible §5.4: "every hungry Dredge part fitted to Moth adds a pale green cab light"). `rig.setParts` accepts the same shape.
- The player builds its rig with `bound` from campaign state; the Bench does too.
- **Until it lands:** unknown visual ids draw nothing (A1 A0 rule 4).

### E10. Campaign results, the debrief and the Count (`src/ui/flow.js`, `src/ui/screens.js`, `src/mission/mission.js`)

**`LevelResult.flags`** (mission): a structured clone of the mission flags at completion. Nothing else in `LevelResult` changes.

**At `level:complete` of a campaign level** (after A1 A3.4's writes), with `leg = CampaignData.legs[levelId]`:
1. **Rigs lost on the road:** `ids = result.flags[leg.result?.rigsLostFlag]` (an array of Roll ids, or nothing). Each id not already in `st.lost` is appended. `st.ledger.lostOnRoad = ids` (kept for the Count).
2. **Story flags:** `story = result.flags[leg.result?.storyFlag]` (an object). `st.story = { ...st.story, ...story }`.
3. **Made fragments:** for each id in `leg.made ?? []`, `st.fragments[id] ??= 'intact'`, and `st.ledger.made = leg.made` (the Bench marks them `NEW`).
4. **Sync:** `st.sync.unlocked = union(st.sync.unlocked, [...ctx.sync?.unlocked ?? []])`.

**At a campaign level's start:** `player.setLoadout(campaignLoadout(st.fitted))` with `bound: st.bound` for the rig (E9); `ctx.sync` reads `st.sync` and the fragment states (E1, B2 #8).

**The debrief** (A1 A3.7 step 3): when `leg.debrief?.waterLabel` is set, the water row uses it (`Water recovered` instead of `Sledges flagged`). When `leg.debrief?.rigsLost` is true, a row `Rigs lost` lists the names of `ledger.lostOnRoad` (or `—`).

**The Count** (A1 A3.5 rule 6 and A3.7 step 5):
- `MorningCount.lost` lists `lostOnRoad` names first, then thirst losses. New optional field `lostOnRoad?: string[]` lets the screen label them (`LOST ON THE ROAD` small caps above them); thirst losses keep the existing look.
- `leg.log` may be a string or `{ by: string, variants: Record<string, string>, default?: string }`: the line is `variants[st.story[by]] ?? default ?? ''`.
- `ledger` is cleared as now.

**State v2:** readers accept v1 and fill the new fields with defaults (§B5); the first writer after a v1 read writes `v: 2`.

### E11. Bench V2 (`src/ui/garage.js`)

**FIT tab.** Five choosable hardpoints: R-ARM, L-ARM, SHOULDER, **BOOSTER (`B`)**, **LEGS (`G`)**. Each offers the stock part (from `CAMPAIGN_STOCK`, or the `CampaignData.fixed` card for B and G) plus every Locker part whose slot matches. CORE and utility stay fixed cards (`No other parts yet.`). Fitting a B or G part fires `fit:<id>` lines like the others.

**Hungry fits and the overwrite picker.**
- Fitting a part with `haul.hunger > 0` that isn't in `st.bound` opens the **picker** on the LATTICE tab instead of fitting: header `MAKE ROOM: <n> FRAGMENT(S) · <PART NAME>`.
- **Selectable cards:** intact fragments only; if `leg.forced?.part === id`, only `leg.forced.fragments`. Others show a lock; clicking one plays the `locked` line (once per visit).
- **Moth's recommendation** is highlighted: the first selectable intact id in `CampaignData.mothRank`.
- **Confirm** (pre-reveal: a single tap on the card's `OVERWRITE` button, bible §7.8 rule 6): `st.fragments[id] = 'overwritten'`, `st.overwrites.push({ id, part, day })`, a short glitch on the card, `ctx.sync?.refreshCapacity()`, the `overwrite` line. Repeat until the hunger is paid, then `st.bound.push(part)` and the fit completes.
- **Cancel** (Back) before the first confirm cancels the fit. Overwrites are never undone; undoing the fit later leaves the part bound (B2 #7).
- Overwritten cards (pre-reveal): the gloss struck through, the tag `OVERWRITTEN · <PART NAME>`, no redaction bars.

**The forced fit** (`leg.forced`): while the forced part is owned and not fitted in its slot, WALK ON is disabled with `leg.forced.reason` and pressing it plays `mustFit`. With `noGive`, GIVE is disabled on that part (spares excepted) with `leg.forced.noGiveReason`.

**Gifts** (`leg.gifts`): on open, before applying `pending`, for each `{ part, unlessOwned, line }`: if `unlessOwned` and the part is owned or already in `pending.haul`, skip it; otherwise append it to `pending.haul` and play `line` (default `gift`) after `arrive`.

**LATTICE tab.** Cards for F01 to F12 plus every Made fragment present in `st.fragments`, glosses from `CampaignData.fragments`. Header `MOTH — RECOVERED FRAGMENTS (<intact count>)` and a chip `SYNC <capacity>`. Fragments in `ledger.made` carry a `NEW` tag. Still no true titles or card texts (A1 A3.6).

**Calls (priority 2).** When `leg.calls` is true, the WAKE tab shows a FUND row per `CampaignData.calls` entry: name, who, cost, uses, `desc`, and a `FUND`/`UNFUND` toggle (one level of funding per visit). Funding moves water live, shows the projected Count, and warns `This leaves the Wake short at the Count.` in red when it would. Undoable. Committed at WALK ON as `st.calls = { kite, mortar, trike }` (uses for the next level). If this slips, `leg.calls` is ignored and Bench 2 shows no FUND rows.

**Explain cards.** On the first occurrence per visit of each trigger, call `ctx.hud.explain?.(leg.terms[trigger])` if defined: `hardpoints` (FIT opened while a B or G part is owned), `overwrite` (the picker opens), `made` (LATTICE opened with a `NEW` card), `calls` (WAKE opened with FUND rows).

**Line keys** added to A1 A3.6's list: `gift`, `hungry` (the picker first opens), `locked`, `overwrite`, `made`, `calls`, `mustFit`. Each fires at most once per visit.

**`garage.bench` API additions:**

```ts
fit(slot: 'R'|'L'|'S'|'B'|'G', partId: string): boolean | 'picker';   // 'picker' when a hunger payment opened
readonly picker: null | { part: string, remaining: number, allowed: string[], recommended: string | null };
overwrite(fragmentId: string): boolean;        // confirm one card in the open picker
cancelPicker(): boolean;
fund(call: 'kite'|'mortar'|'trike', on: boolean): boolean;
// state() returns the v2 working copy (§B5)
```

### E12. SFX (`src/audio/audio.js`)

New names (synth recipes are P1's choice; unknown names already no-op): `syncSight` (a breathy whoosh in, reversed out), `syncDrive` (a rising servo chord), `syncHold` (a deep single thump and a white-noise flare), and three that Level 2 plays: `sailSnap` (canvas crack), `rigHorn` (a low two-tone horn), `cableSnap` (a twang and whip).

### E13. Engine scenario (`tools/scenarios/eng-l02.mjs`, new)

On the test level and inline `LevelDef`s only (never `levels/level02.js`). Asserts:
1. `ctx.sync` exists; disabled by default; `unlock('sight')` enables; `use('sight')` fails below 3 and succeeds at 3; `ctx.timeScale` is 0.7 for 6 sim seconds then restored; path lines exist while a hostile projectile is in flight; a target with `windup > 0` gets a glow.
2. Filling: 1,500 player damage → +1; a TEAR → +2; a scripted perfect dodge → +1; never above capacity.
3. Hold: unlocked with fill 6, a lethal hit leaves AP 1, `invulnT` 2, fill 0, `sync:hold` emitted, **no comms line**; with fill 5 the player dies.
4. Moth Drives: 8 s; the player keeps within 15 m of `pref` around a drone; auto-dodges happen and add no Sync; on a raised platform the player never leaves it.
5. Inputs: `inject('sight')` and `inject('drive')` work; the touch buttons appear only when unlocked (touch run).
6. Parts: `campaignLoadout({ B: 'sail_rig', G: 'skate_jets' })` validates; ground speed × 1.35 with Skate-Jets; SAIL engages after 2 s straight and quick boosts then cost 0 EN; `qbCooldown` 1.0 enforced; the Rivet Driver slows a drone (`slowT`); the Crane-Claw grabs a staggered drone and the throw kills it.
7. Hungry glint colour for a unit with `haul: 'skate_jets'`.
8. HUD: the meter's DOM (segments = capacity, HOLD greyed at capacity 5); `tracker()` renders title, band and alerts and `tracker(null)` hides it; an explain card shows during the `bench` state.
9. Flow: an inline campaign LevelDef plus a stub `CampaignData` leg (`result.rigsLostFlag`, `storyFlag`, `made`, `log` variants, `debrief`): after completion, `st.lost`, `st.story`, `st.fragments.M1`, `st.sync.unlocked` and the Count's `lost`/`lostOnRoad`/log are right; a v1 save migrates to v2.
10. Bench: a pending haul with a hungry part and a stub `forced`/`gifts` leg: the gift arrives; the picker allows only the forced fragment; `overwrite()` binds the part and drops capacity by 1; WALK ON is blocked until fitted; GIVE is blocked on the forced part; `fund()` changes water and is undoable.
11. Regression: `smoke`, `contract` and `level01` still pass.

---

## B4. `CampaignData` v2 (`levels/campaign.js`; LEVEL writes, ENGINE reads)

Additions to A1 A3.3. Everything stays pure data; consumers keep the A1 fallback when the file is missing and ignore fields they don't know.

```ts
interface CampaignData {
  version: 2;
  fragments: Array<{ id: string, gloss: string, made?: string /*level id that logs it*/ }>;   // + M1, glosses only
  mothRank: string[];                                    // bible §7.7 order
  calls: Record<'kite' | 'mortar' | 'trike', { name: string, who: string, cost: number, uses: number, desc: string }>;
  legs: Record<string, LegV1 & {
    log: string | { by: string, variants: Record<string, string>, default?: string };
    result?: { rigsLostFlag?: string, storyFlag?: string };
    made?: string[];
    debrief?: { waterLabel?: string, rigsLost?: boolean };
    gifts?: Array<{ part: string, unlessOwned?: boolean, line?: string }>;
    forced?: { part: string, fragments: string[], mustFit?: boolean, noGive?: boolean, reason?: string, noGiveReason?: string };
    terms?: Partial<Record<'hardpoints' | 'overwrite' | 'made' | 'calls', { id: string, term: string, text: string }>>;
    calls?: boolean;                                     // FUND rows at this leg's Bench
  }>;
}
```

**Level 2's entries** (exact; the Bench lines are L2 §13.6):

```js
fragments: [ /* F01..F12 as now */ { id: 'M1', gloss: "CHILD'S KITE / GNOMON / WARMTH, CHEST", made: 'l02' } ],
mothRank: ['F01', 'F08', 'F06', 'F11', 'F09', 'F04', 'F03', 'F05', 'M2', 'M1', 'M4', 'M3', 'F10', 'F02', 'F12', 'F07'],
calls: {
  kite:   { name: 'Spotter Kite',   who: 'Kit',                    cost: 1, uses: 3, desc: 'Marks every enemy and haul part within 300 m for 20 s.' },
  mortar: { name: 'Mortar Rig',     who: 'Twice Shy (the Pruitts)', cost: 2, uses: 3, desc: 'A six-shell barrage on your lock target after 3 s.' },
  trike:  { name: 'Resupply Trike', who: 'Thimble',                 cost: 2, uses: 2, desc: 'Restores 40% armour, all missiles and one repair kit.' },
},
legs: {
  l01: { /* unchanged */ },
  l02: {
    day: 4, draw: 3, edgeLat: 42, debriefTitle: 'WALK DAY 4 · THE MORNING STEPPE',
    log: { by: 'bigMercy', variants: {
      saved: "Big Mercy's still with us. Moth asked why people laugh when they're scared. Didn't have an answer.",
      lost: 'Big Mercy went dry. Four names off the Roll. I wrote them myself.' } },
    result: { rigsLostFlag: 'cv:lost', storyFlag: 'campaign:story' },
    made: ['M1'],
    debrief: { waterLabel: 'Water recovered', rigsLost: true },
    gifts: [{ part: 'skate_jets', unlessOwned: true, line: 'gift' }],
    forced: { part: 'skate_jets', fragments: ['F01'], mustFit: true, noGive: true,
              reason: 'Fit the Skate-Jets first. The canyon floods.', noGiveReason: "Not these. You'll need them." },
    terms: { hardpoints: { id: 'hardpoints', term: 'Booster and legs', text: '…' },     // texts: L2 §13.5, verbatim
             overwrite: { id: 'overwrite', term: 'Overwriting', text: '…' },
             made: { id: 'made', term: 'New fragments', text: '…' },
             calls: { id: 'calls', term: 'Calls', text: '…' } },
    calls: true,
    bench: { /* arrive, gift, haul, give, fit:sail_rig, fit:rivet_driver, fit:crane_claw, hungry, locked, overwrite,
               made, calls, mustFit, gaveAll, keptAll, walkOn: L2 §13.6, verbatim */ },
  },
},
```

Spoiler rule (A1 A3.3, arch §8.6): glosses only, never true titles or card texts. The Bench 2 lines are in memory from Bench 1 on and are displayed only at Bench 2.

---

## B5. `CampaignState` v2 (`save.flags.campaign`)

```ts
interface CampaignStateV2 extends Omit<CampaignState /*A1 A3.4*/, 'v' | 'fitted' | 'fragments'> {
  v: 2;
  fitted: { R: string, L: string, S: string, B: string | null, G: string | null, C: string | null };
  fragments: Record<string, 'intact' | 'overwritten'>;     // 'retold:<who>' arrives with V4; missing old ids = intact
  bound: string[];                                         // hungry parts whose hunger is paid
  overwrites: Array<{ id: string, part: string, day: number }>;   // for the Lattice Log later
  calls: { kite: number, mortar: number, trike: number };  // uses funded for the next level
  story: Record<string, any>;                              // e.g. { bigMercy: 'saved' }
  sync: { unlocked: Array<'sight' | 'drive' | 'hold'> };
  ledger: null | (Ledger & { lostOnRoad?: number[], made?: string[] });
}
// Defaults for every new field (a v1 read fills these): fitted.B/G/C null, bound [], overwrites [],
// calls { kite: 0, mortar: 0, trike: 0 }, story {}, sync { unlocked: [] }.
```

| When | Writer | Writes (in addition to A1 A3.4) |
| --- | --- | --- |
| `level:complete` | flow (E10) | `lost` (+ on-the-road ids), `story`, `fragments` (+ Made, intact), `sync.unlocked`, `ledger.lostOnRoad`, `ledger.made` |
| An overwrite at the Bench | Bench (E11), on WALK ON with the rest of the working copy | `fragments[id] = 'overwritten'`, `overwrites`, `bound` |
| WALK ON | Bench | `fitted` (incl. B, G), `calls` |
| The Count | flow | as A1 (ledger cleared) |

Overwrites live in the Bench's working copy like everything else and are committed at WALK ON; "can't be undone" means the Bench's Undo skips them (B2 #7). If the page is closed mid-Bench, `pending` stays (A1 A1.2) and the overwrite is lost with the working copy, so the player chooses again.

---

## B6. Work packages

Exactly two packages, run in parallel, with **no file overlap**.

### B6.1 ENGINE

**Owns:** everything under `src/`, plus `tools/scenarios/eng-l02.mjs` (new) and any edits the engine changes force on existing engine scenarios (`p4-combat`, `p5-mission`, `p3-art`). Specifically: `src/combat/sync.js` (new), `src/combat/combat.js`, `src/combat/loadout.js`, `src/combat/weapons.js`, `src/combat/haul.js`, `src/actors/player.js`, `src/actors/enemy.js`, `src/actors/enemytypes.js`, `src/actors/mechai.js`, `src/core/input.js`, `src/ui/hud.js`, `src/ui/comms.js`, `src/ui/flow.js`, `src/ui/screens.js`, `src/ui/garage.js`, `src/mission/mission.js`, `src/art/mechs.js`, `src/audio/audio.js`.

**Must not touch:** anything under `levels/`, `tools/scenarios/level01.mjs`, `tools/scenarios/level02.mjs`, `tools/contract.json`, `index.html`, `styles.css`, `src/main.js`.

**Order:**
1. **Surface pass** (first ~20%): `ctx.sync` with every method as a working no-op (`enabled` false); `ACT.SIGHT`/`ACT.DRIVE` and bindings; `player.drive`, `invulnT`, `sail`, `mods`; `Target.windup`, `slowT`, `Unit.speedScale`; `hud.tracker` (no-op), the `sync` and `tracker` panel keys; the four `PARTS` entries, `HARDPOINTS`, `CAMPAIGN_STOCK.B/G/C`, `campaignLoadout` B/G/C; `LevelResult.flags`; v2 state defaults; `garage.bench.fit` returning booleans for B and G; the six SFX names.
2. E1 to E5 behaviour (Sync, inputs, player, damage, HUD).
3. E7 (parts and weapons), E10 (campaign results), E11 without Calls.
4. E8, E9, E11 Calls, E6, E12 polish.
5. E13 green; `smoke`, `contract`, `level01` green.

**Ports:** 8700 and 8701 only.

### B6.2 LEVEL

**Owns:** `levels/level02.js`, `levels/level02/*.js` (all new), the `l02` entry in `levels/index.js`, the v2 additions in `levels/campaign.js` (§B4), and `tools/scenarios/level02.mjs` (new).

**Must not touch:** anything under `src/`, `levels/level01.js`, `levels/level01/*` (import from them freely, change nothing), `levels/test.js`, other scenarios.

**Order:**
1. `levels/campaign.js` v2 data and the `levels/index.js` entry first (the ENGINE's Bench and flow read them).
2. Map, terrain, art, reeds and structures; the convoy (formation, speeds, band, harpoons, camp); the vista and the roll-out with comms and cards.
3. Units (`land_yacht`, `harpooner`, `skimmer`) and E1, E3, E6.
4. The *Tally* and E5; the Watcher; Sync calls; the Sundial and the ending.
5. `level02.mjs` green (L2 §19), with engine-dependent asserts feature-detected; `smoke`, `contract`, `level01` green.

**Ports:** 8702, 8703 and 8704 only.

### B6.3 What LEVEL may assume from ENGINE

Only the engine as it is now (architecture plus addendum 01, landed and integrated). **Everything in this addendum is feature-detected**, and the level must run, be completable and pass its own scenario without any of it. LEVEL never re-implements an engine item (A1 A0 rule 7); the stand-ins below are trivial.

| Feature | Detect with | Level behaviour without it |
| --- | --- | --- |
| Sync (E1) | `typeof ctx.sync?.unlock === 'function'` | No meter. Sync lines and cards still play. The scripted Hold shot deals 2,500 damage instead of lethal, and *"Hold on to me."* still plays. Volleys and the deck still work. |
| Sync inputs (E2) | `ctx.input.bindings?.sight` | (part of the above) Hints say C and V only when present. |
| Moth Drives steering (E3) | `'drive' in ctx.player` | `c_drive` still plays; the card says what it would do. |
| `windup` (E4) | always set it on level units; harmless if unread | — |
| `slowT` / `speedScale` (E4) | `typeof unit.speedScale === 'number'` | Level units treat it as 1. |
| `hud.tracker` (E5) | `typeof ctx.hud.tracker === 'function'` | Hooked rigs shown by objective text and markers only; the band uses `hud.warn`. |
| `sync` panel key (E5) | — | `setPanels({ sync: true })` is ignored today. |
| `wobble`, `speedVar` (E6) | — | Plain pale green text. |
| Parts (E7) | `LO.PARTS?.sail_rig` etc. through `import * as LO` | Haul ids still go into the rack; the Bench shows them give-only (A1 A3.6). |
| Hungry glint (E8) | — | Amber glints; Moth's line and the card still say "hungry". |
| Campaign results (E10) | `result.flags` presence is the engine's concern | LEVEL still sets `cv:lost` and `campaign:story`; without E10 they're simply not applied. Water still works through `waterFlags` (unchanged). |
| Bench V2 (E11) | — | Bench 1 behaviour with L2's lines that exist in A1's key set. |
| SFX (E12) | — | Unknown names no-op. |

**Interfaces LEVEL calls** (and nothing else new): `ctx.sync.enable/unlock/setFill/atLeast/free/holdReady`, `ctx.sync.active`; events `sync:hold`, `sync:move`, `player:perfectDodge` (tests only); `ctx.hud.tracker`; `ctx.hud.setPanels({ sync, tracker })`; `ctx.player.drive` (read-only, tests); `Target.windup`, `Unit.speedScale`; `PARTS` ids `sail_rig`, `skate_jets`, `rivet_driver`, `crane_claw` as haul ids; SFX `sailSnap`, `rigHorn`, `cableSnap`.

### B6.4 Freeze and hand-off

- §B3 and §B4 are frozen for the build. A package that needs a change writes it into its hand-off and the integrator rules on it; neither package edits the other's files.
- **Hand-off** (each package, as arch §10.10): what landed (by E-number or L2 section), what didn't, scenario results with screenshot paths, budgets, and any open requests.
- **Integration** (after both): run `level02` with the engine landed (no SKIPs expected except Calls if they slipped), `eng-l02`, `smoke`, `contract`, `level01`; play Level 2 from the title once; then Bench 2 and the Count.

---

## B7. Level-local by design (and why)

| Item | Where | Why it's not engine |
| --- | --- | --- |
| The convoy, the band, harpooned rigs, the circle and the camp | `levels/level02/convoy.js`, `rigs.js` | One level's twist. L7's laager and L8's following Wake are different enough to build their own (they can copy this). |
| `land_yacht`, `harpooner`, `skimmer` | `levels/level02/units.js` | Registered through `ctx.enemies.register` with the exported `Unit`, as L1 did. L3 reuses Skimmers by importing them (or they can move to `enemytypes.js` then). |
| The *Tally* | `levels/level02/tally.js` | A one-off boss with child targets, like the Icebreaker. |
| The Watcher, Rusk's Skimmer, Tick, the kite | `levels/level02/actors.js` (Tick and the kite imported from L1) | Scripted actors, no AI budget. |
| Reeds | `levels/level02/reeds.js` | Registered at import through the existing `registerProp` export; only L2 has reeds. |
| The Sundial, its skyline, the shadow stripe and the shade art | `levels/level02/sundial.js` | A hero landmark; AD's terrain-data caster stays deferred (A1 A1.2). |
| The salt crust, the far painting, every L2 structure type | `levels/level02/structures.js`, `skyline.js` | Level dressing (A1 A2 #16 precedent). |
| The explain-card queue | `levels/level02/terms.js` | L1's proven pattern on P5's `hud.explain`. |
| The rocket volleys, the scripted Hold shot, slow-motion | `levels/level02/tally.js`, `index.js` | Scripted beats. |

---

## B8. Acceptance

- `node tools/playtest.mjs --scenario eng-l02 --port 8700 --out /tmp/campaign-playtest/L2-eng` passes (ENGINE).
- `node tools/playtest.mjs --scenario level02 --port 8702 --out /tmp/campaign-playtest/L2-level02` passes (LEVEL), and after integration passes with no engine SKIPs.
- `smoke`, `contract` and `level01` pass on both packages' trees and after integration.
- Budgets (arch §7.5) hold during the *Tally*'s drag on High and Low.
- No background jobs left running; no git commands.
