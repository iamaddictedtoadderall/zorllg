# Level 2: THE WAKE (The Morning Steppe)

> **SPOILERS. BUILD TEAM ONLY.** This document contains the Level 2 story beats and the clues placed in it. Nothing in it may appear outside the game. Player-facing text (briefing, cards, objectives, hints, comms, Bench lines) is quoted here exactly as it ships and may appear in the game only at the moment this document places it.

Version 1.0. Written by the lead level designer for the Level 2 build, with engine requests collected in `docs/addendum-02.md`.

**Sources, in canon order:** `docs/SPOILERS-story-bible.md` (story, cast, beats, Bench, style guide), then this file, then `docs/architecture.md` as amended by `docs/addendum-01.md` and `docs/addendum-02.md` (engine contract and level format), then `docs/art-direction.md` (the look). Additions to the bible are listed in §1.3 so the story team can veto them. Where this level needs something the engine doesn't have, it is listed in §16 and specified in `addendum-02.md`.

**Player feedback that binds this level (`docs/todo.md`, clarity pass).** The player found Level 1's made-up terms and radio traffic confusing because they appeared before the game explained them. For Level 2 the bible's rule "use Wake idioms, never explain them" (bible §3.6, §10 rule 7) is **overridden for anything the player must understand**:

1. Every new term or mechanic gets a plain-English `ctx.hud.explain` card the first time it matters (§5.2).
2. Every new speaker gets a spoiler-free tag on their first line (§5.3).
3. Objectives always say plainly what to do and where (§9.4).
4. No comms line leans on a term before it has been introduced (audit in §5.4).

Flavour idioms the player doesn't need ("Morning.", "Keep up.", "went dry") stay, as long as the meaning is clear from context. §5.4 lists every one and says why it is clear.

---

## Contents

1. Summary, role and mood
2. Map
3. Beat sheet (the level in order)
4. The gameplay twist: the convoy is the level
5. Tutorialization and clarity (controls, explain cards, speaker tags, the comms audit)
6. Encounters
7. The signature set piece: Big Mercy and the *Tally* (boss)
8. Checkpoints
9. Script: briefing, comms, objectives, HUD text, debrief
10. New enemies and actors
11. New mechanics in this level
12. Structures (kit pieces)
13. The Bench, version 2 (after Level 2), and the Morning Count
14. Pacing
15. Art, light, audio and music by zone
16. Engine requests (summary of addendum 02) and level-side fallbacks
17. Level definition draft (`levels/level02.js`)
18. Spoiler and clue checklist
19. Test notes for `tools/scenarios/level02.mjs`

---

## 1. Summary, role and mood

### 1.1 Role in the campaign

Level 2 is the first level where the player fights *for* people. Level 1 was survival; this is responsibility. In about 20 minutes it has to:

1. **Show the Wake.** Forty named rigs and three hundred people roll beside the player for the whole level. Every rig the raiders drag away comes off the Wake Roll by name (bible pillar 2, "scarcity with a face").
2. **Make Moth a partner.** Sync and the three partner moves arrive here. Moth says *"I have context now. I can anticipate you."* and from then on the frame works *with* the player. The first Hold repeats *"Hold on to me."*, the words from the drowning, and lets them land.
3. **Plant the L2 clues** (bible §5.4) with innocent readings: Oma's *"You haven't climbed down since the ice."* / *"She is resting."*; *"Ration, Moth."* / *"Dispensed."*; Rusk's *"Your frame's handshake is loud."*; the Watcher's *"Hello hello."* on the local channel; and Made fragment M1, logged with `WARMTH, CHEST`.
4. **Give the enemy faces.** Tallyman Rusk is a living, swaggering bookkeeper. The Foreman gives his first full broadcast. A ghost frame watches from a ridge and doesn't fire.
5. **Set up Bench 2:** hungry parts, the first (forced) overwrite of F01 for the Skate-Jets that Level 3 needs, Calls, and the first Made fragment.
6. **Give the player daylight and scale** after Level 1's night: an open gold steppe, a kilometre-tall needle on the horizon that is always the destination, and a convoy that is the size of a town.

### 1.2 Mood and what the player should feel

| Stage | Zone | Light | The player should feel |
| --- | --- | --- | --- |
| The roll-out | Z1 The Lip | Low gold sun behind the right shoulder, long shadows pointing at the Sundial | Morning. Belonging. A family business of three hundred people, and Juno is its armour. |
| The first raid | Z2 The Reed Sea | Gold, dust, reeds rippling | The predator's view: you can see where they are by what the reeds do. Then panic when a rig gets hooked. |
| The Watcher | Z3 The Watcher's Ridge | Same light, quiet | A chill in the sunshine. Something knows you. |
| The ruins | Z4 The Turbine Ruins | Gold through broken blades, striped shadows | Close-quarters scrambling among giants, protecting rigs that can't stop. |
| The partner | Z4, north end | A clear sky, rockets arcing | Wonder. The machine is helping, and time bends. |
| The *Tally* | Z5 The Salt Flats | Harsh white bounce off the salt | Desperation, then defiance, then the warmth of *"Hold on to me."* |
| The Skimmers | Z6 The Colony Road | Gold again, dust trails | Exhilaration, and a small unease: these sleds have green lights. |
| The broadcast | Z6, north end | Calm | The enemy speaks like a patient father. Ansel hums over him. |
| Sundial noon | Z7 The Sundial | Cool blue shade under a gold sky, the blade overhead | Arrival. Rest. A kid's kite going straight up a kilometre of shadow. |

### 1.3 Additions to canon made by this document (story team: veto here)

| # | Addition | Why |
| --- | --- | --- |
| A1 | **The sun stands at azimuth 150°, elevation 10°, all level. "Sundial noon" is redefined:** it is the day (Walk Day 4) when the Sundial's shadow lies along the north road (bearing 335°), and the Wake camps inside that shadow stripe. The bible's "just as its shadow points due north" is dropped. | On Gaunt the sun doesn't visibly move in twenty minutes (one day is ten years, bible §3.1), so the shadow can't swing to north while the Wake drives. The shadow lying along the road the Wake follows is physically right, reads better, and keeps "the Wake steers by the Sundial's shadow". |
| A2 | **Convoy speeds: 9 m/s while a raid is on, 12 m/s on an open road, 4 m/s when the Wake has caught up with a fight that isn't over, and a full stop in a defensive circle while Big Mercy is taken.** (Bible: 7 m/s, about 21 minutes.) | A fixed 7 m/s makes a fixed-length level and gives skilled players nothing. These speeds keep a first run at about 21 minutes and a skilled run at about 17 (§14), and the circle-up gives the set piece room. |
| A3 | **The *Tally* drops spike anchors to fight** once Big Mercy is cut free, so its deck is stationary for the boarding phase. | The engine has no moving platforms. Rusk turning his ship to fight is in character. |
| A4 | **Hold plays no comms line when it fires on its own.** *"Hold on to me."* is spoken only at scripted beats: the drowning (L1), the *Tally* (here) and the recall (L6). Automatic Holds show a HUD flash and a sound. | Bible §6 L6 calls the recall's *"Hold on to me."* "its third time". If every automatic Hold said it, the count would break. |
| A5 | **Water cache A carries *Lantern Line* paint.** Kit: *"Old paint. Lantern Line. Never heard of them."* Juno: *"They went dry. Years back."* | A quiet plant for Tallow's real name and convoy (bible §3.5, LY 108; L4, L8). Innocent on first play. |
| A6 | **The Second Sight lesson is a long-range rocket volley fired by the *Tally* before it attacks.** | The bible says Second Sight is taught "on the first missile volley" but gives L2 no missile-firing enemy before the set piece. This also introduces the *Tally* as a threat on the horizon. |
| A7 | **Moth's query** *"Why do people laugh when they are scared?"* is placed after the first raid, and Juno doesn't answer it. | The bible's L2 log line ("Moth asked why people laugh when they're scared. Didn't have an answer.") needs the moment to exist. |
| A8 | After the scripted Hold, Juno: *"You said that under the ice."* Moth: *"I did."* | Lets the repetition land without anyone explaining it. Innocent: she thinks she nearly drowned. |
| A9 | **Partner-move keys are C (Second Sight) and V (Moth Drives)** on desktop, D-pad up and down on a gamepad, and two touch buttons, SIGHT and DRIVE. | The bible suggests E and F, but E is lock and F is interact (L1). |
| A10 | Raiders harpoon **specific named rigs** (§4.5), and a rig lost to a raid comes off the Roll at once, by name, not from the bottom up. | Bible pillar 2. Thirst still takes rigs from the bottom (bible §7.9). |
| A11 | **Skimmers are ghost-run** (pale green cab light). Rusk's command Skimmer has a living pilot. | Bible §3.3: ghosts run the Dredge's skimmers; Skate-Jets are hungry ghost-tech. |
| A12 | The guaranteed Skate-Jets are handed over **at the Bench** (which is at camp), not in the level. | Same moment as the bible's ("at camp"), and no rack juggling. |
| A13 | **The Still** is introduced in comms in Z1 (Kit), and **the Founders** at the Sundial's plaque (an optional read), each with an explain card. | Clarity rule: V5 (*"The Still is ice and bones."*) can't be the first time the player hears the word. |
| A14 | **Bench 2 lines** (§13.6) beyond the bible's three, including Moth's *"It needs room in me."* | Every line keeps the three-lie rule: each is true or an evasion. |
| A15 | **Quick-boost charges (addendum 01 A2 #13, "decide before L2"):** Cantor Wings stay limited by EN only. The Sail-Rig's "only 1 quick-boost charge" becomes a 1.0 s quick-boost cooldown. | Keeps Level 1's feel, and gives the Sail-Rig its trade-off. |
| A16 | **The Sail-Rig's "after 2 s of straight boosting"** becomes "after 2 s of straight running at full speed on the ground". | The engine has no held boost: ground speed is already the prototype's 30 m/s skate (L1 §13.4). |

Conflicts with other documents, resolved here:

- **Art direction §5.7 L2** puts the sun at azimuth 100° and blends to a higher, whiter sun at "Sundial noon". This level uses azimuth 150° (A1), and the ending's light change is the shade of the Sundial, not a moving sun (§15.2). AD's palette, fog, grade and weather values are kept.
- **Bible §6 L2 "7 m/s, about 21 minutes"**: see A2.
- **Bible §7.6 inputs (E and F)**: see A9.

### 1.4 At a glance

| | |
| --- | --- |
| Public title / subtitle | **THE WAKE** / *The Morning Steppe* |
| Route length | 8,791 m along the spline; 7.6 km south to north |
| Corridor | Half-width 650 to 900 m (widest at the salt flats) |
| Zones | 7: The Lip, The Reed Sea, The Watcher's Ridge, The Turbine Ruins, The Salt Flats, The Colony Road, The Sundial |
| Checkpoints | 6 (start plus 5) |
| First-time play | 19 to 23 minutes (target 20:40). Skilled replay: about 17 minutes. |
| Unit kinds | `land_yacht`, `harpooner`, `skimmer`, `tally` (with child targets), plus level actors (rigs, Tick, kite, the Watcher, Rusk's Skimmer) |
| New mechanics | The moving convoy and its band, harpooned rigs, Sync and the three partner moves, hungry glints, water caches |
| Haul available | Sail-Rig (land-yachts), Rivet Driver (harpooners), Crane-Claw (the *Tally*'s boarding cranes), Skate-Jets (Skimmers; hungry), plus 1 salvage cache |
| Water available | Big Mercy saved (+4), 2 water caches (+1 each). Typical: +5. |
| Rigs at risk | 7 named rigs can be harpooned, plus Big Mercy. Typical first run: 0 to 2 lost. |

---

## 2. Map

### 2.1 Frame of reference

- Engine axes (architecture §1.3): +X east, −Z north, +Y up. Route coordinates `s` (metres along the route) and `l` (metres right of travel). The route runs south to north, so **positive `l` is east (right) and negative `l` is west (left)** for most of it.
- Azimuths are compass degrees: 0° north, 90° east.
- **The steppe is gentle.** Ground height along the route stays between 0 and +40 m. The Watcher's Ridge rises 50 m above the plain, the southern lip 70 m, and the Sundial's pedestal is a 50 m stepped plinth.
- **Bounds** are set explicitly (the default would be 79 km²): x −2,400 to +2,600, z −5,400 to +5,000 (52 km²), with `macroCell: 10` (about 525k cells, the same as Level 1). The Sundial's blade tip stands over z −4,690, inside the bounds.

### 2.2 Overall shape

A long south-to-north drive on the old colony road. The road climbs off the southern lip, bows east through the open reed sea, swings north-west along the Watcher's Ridge and through a ruined wind farm, runs north past the salt flats (which open to the west), and bends back north-north-east along the straight colony road to the Sundial. The Sundial's blade is visible from the first frame to the last: a needle at bearing 354° from the start, 7.6 km away.

```
  NORTH (−z) ↑          Dredge plume on the horizon (az 10°, 14 km)            blade tip ground point (−61, −4,690) ✕
                                                                                        ╲  (blade leans north, 953 m tall)
  z −4,120 ·         END ●  camp ▓▓▓ shadow stripe (az 335°, 150 m wide) ▓▓▓
  z −3,684 ·              ╲   ◆ SUNDIAL pedestal (−61, −3,684)        ○   dial ring r 600 (24 stones)
  z −3,150 ·        ○      ● Z7 7,650                         ○ cache B (163, −3,148)
  z −2,420 ·                ●  Z6 THE COLONY ROAD (Skimmers, the broadcast)
  z −1,900 ·             ●
  z −1,220 ·  ramp ▣ ░░░░ ●  Z5 THE SALT FLATS (Big Mercy dragged west ░, the Tally)
  z  −850  ·   ░░░░░░░░░  ●  (laager)
  z  −320  ·                ●    Z4 THE TURBINE RUINS (7 standing ⊥, 6 fallen ─)
  z   160  ·    ⊥  ─  ⊥  ●  ⊥ ─
  z   580  ·              ●  ─ ⊥    ▲▲▲▲ Z3 THE WATCHER'S RIDGE (Tallow on the crest, 901, 676)
  z   950  ·                    ●  ▲▲▲
  z 1,376  ·    cache A ◎        ●            Z2 THE REED SEA (raid 1: sails from the west reeds)
  z 1,850  ·                       ●
  z 2,400  ·                      ●
  z 2,950  ·                    ●  Z1 THE LIP
  z 3,450  ·                   ●
  z 3,900  ·                   ● START (650, 3,900)    ▲▲▲▲ southern lip (70 m escarpment, behind the start)
            x −1,400    x −700     x 0      x 500     x 950
  ● route control point · ○ dial stone · ◆ pedestal · ◎ water cache · ░ salt crust · ▣ Dredge skimmer ramp · ⊥ standing turbine · ─ fallen turbine
```

### 2.3 Route control points

A centripetal Catmull-Rom spline (architecture §4.2). The `s` values below were computed with `src/world/route.js` from these exact points.

| # | x, z | s | Half-width | Heading (az) | Notes |
| --- | --- | --- | --- | --- | --- |
| P0 | 650, 3900 | 0 | 650 | 353 | Start, top of the southern lip |
| P1 | 600, 3450 | 454 | 650 | 2 | Convoy centre at start (s 450) |
| P2 | 700, 2950 | 965 | 700 | 15 | |
| P3 | 900, 2400 | 1551 | 750 | 11 | The reed sea |
| P4 | 930, 1850 | 2104 | 750 | 352 | |
| P5 | 760, 1350 | 2635 | 700 | 331 | |
| P6 | 450, 950 | 3142 | 700 | 319 | Under the Watcher's Ridge |
| P7 | 100, 580 | 3651 | 650 | 317 | Ruins approach |
| P8 | −280, 160 | 4218 | 650 | 322 | The turbine ruins |
| P9 | −600, −320 | 4797 | 700 | 336 | |
| P10 | −720, −850 | 5343 | 900 | 356 | Salt flats (west) |
| P11 | −660, −1380 | 5878 | 900 | 13 | |
| P12 | −460, −1900 | 6436 | 750 | 22 | Colony road |
| P13 | −230, −2420 | 7005 | 700 | 18 | |
| P14 | −110, −2950 | 7549 | 700 | 6 | |
| P15 | −110, −3350 | 7950 | 750 | 351 | Inside the dial ring |
| P16 | −230, −3760 | 8379 | 750 | 337 | Beside the pedestal |
| P17 | −430, −4120 | 8791 | 700 | 330 | End, in the shadow stripe |

Useful resolved points (world x, z): s 450 → (600, 3,453); s 2,900 l −380 → (316, 1,376) cache A; s 3,050 l +520 → (901, 676) the Watcher; s 4,250 l −380 → (−599, 369) salvage cache; s 5,380 l −36 → (−757, −886) Big Mercy at the harpoon; s 5,620 l −720 → (−1,422, −1,219) the skimmer ramp; s 7,700 → (−98, −3,100) the dial ring; s 7,750 l +260 → (163, −3,148) cache B; s 8,250 l +130 → (−61, −3,683) the pedestal; s 8,580 l +125 → (−215, −4,002) the Bench at camp.

Sundial bearings from the road (Hesper's calls): 355° at s 0, 354° at s 700, 353° at s 3,000, 11° at s 5,000, 8° at s 7,000.

### 2.4 Terrain model

Gameplay walls are structures with colliders, never terrain slopes (as in L1). The steppe is open, so the corridor walls are low rolling hills that read as more steppe, not as canyon walls.

- **Base:** `scale 1,400, amp 22, octaves 5, ridged 0.15, warp 120`. Long, low swells: the swales where yachts hide.
- **Detail:** `scale 18, amp 0.7`.
- **Walls:** `height 45, start 0.85, noise 0.5`. Low hills, reed-covered to the crest.
- **Carve:** `depth 1.2, bedWidth 110, shoulder 90, smooth 260, maxGrade 0.05, strength 0.8`. The colony road is a sunken, rutted lane; the convoy's four columns fit in the bed.
- **Erosion:** `droplets 60,000, thermal 1`. Light: wind country, not water country.
- **Features:**
  - the southern lip: `ridge` from (−300, 4,250) to (1,600, 4,250), r 260, h 70, south of the start (the Wake climbed it at dawn; it fills the vista's foreground);
  - the Watcher's Ridge: `ridge` from {s 2,800, l +560} to {s 3,320, l +470}, r 130, h 50, sharpness 0.7;
  - the ruins rise: `basin` inverted is not available, so use a broad `mesa` at {s 4,150, l 0}, r 520, h 12, sharpness 0.2 (a low plateau the wind farm stood on);
  - the salt pan: `basin` at {s 5,520, l −470}, r 520, h 6 (a dish 6 m below the road);
  - the flats' edge: `ridge` from {s 5,250, l −740} to {s 5,950, l −700}, r 60, h 12, sharpness 0.8 (the salt-crust lip the *Tally* is dragging Big Mercy toward).
- **Stamps:** flatten the salt pan (h −5, five discs along the drag lane, `noScatter`); flatten the laager area at {s 5,450, l 0} (r 160); flatten the dial ring floor at the pedestal (r 640, falloff 120, h of the local bed); flatten the camp in the shadow stripe ({s 8,560, l +120}, r 220, `noScatter`); a raise for the pedestal's berm (r 110, h +4) under the plinth; and a shallow `lower` for the dry creek crossing at {s 3,200} (r 60, h −4), which the convoy dips through.

### 2.5 Landmarks that pull the player forward

| Landmark | Where | First visible from | What it does |
| --- | --- | --- | --- |
| **The Sundial** (hero) | Pedestal (−61, −3,684); blade leans north to a tip 953 m up | The vista and every frame after (a constant-angular-size skyline object until it is inside the view distance) | The destination. A white needle with gold seams that catches the light first. |
| **The convoy** | Always within 700 m | Always | Forty rigs, kite ribbons, dust. Home, moving. |
| **Kit's kite** | 60 to 140 m above Tick | Always | Kit's presence in the sky; it climbs higher at the volley (beat 8) and goes "straight up the shadow" at the end. |
| **The Dredge's plume** | Azimuth 10°, 14 km | From Z2 on | A brown smoke column far to the north. Kit's "bad news". |
| **The Watcher's Ridge** | East of the road, s 2,800 to 3,320 | Z2 | A dark rock line on the right. Where the green light will be. |
| **Turbine silhouettes** | Z4, 70 to 90 m tall | Z3 | Seven broken towers on the horizon, blades stopped at odd angles. |
| **The *Tally*'s sails** | Far north-west over the flats | Beat 8 (the kite) | Three oxide-red sails on the horizon. Then it comes. |
| **Salt glare** | West of the road in Z5 | Z4's north end | A white band on the horizon: "something's out there on the flats". |
| **Dial stones** | Ring of 24, radius 600 m round the pedestal | Z6 | Tall white slabs: you are arriving. |
| **The shadow stripe** | From the pedestal along az 335°, 5.4 km long | Z7 | A dark road across the gold plain: where the Wake will sleep. |

### 2.6 Zones

Every structure is a kit piece (art direction §2, architecture Appendix D: at least three depth layers, real panel lines, no raw boxes). New types are defined in §12. Types reused from Level 1 (`tank_cairn`, `wake_lamp`, `founders_pod`) are registered from `levels/level01/structures.js` (§12.2).

#### Z1 · THE LIP (s 0 to 1,150)

**Card:** `THE LIP` / `South edge of the Morning Steppe`

**Terrain.** The road tops the southern lip at s 0 to 120 and runs north across gently falling ground. Reeds start at s 200 (thin) and are dense from s 600. The lip's escarpment fills the view south; the steppe opens north.

**Structures and dressing.**
- **Founders' road markers** (`road_marker`) every 500 m along the road's east verge from s 250 to s 8,250 (17 in all): white ceramic posts 3 m tall with a gold band and a distance number in Founders' type counting down to the Sundial (`15`, `14`, … `0`, in hundreds of metres ÷ 5, so they read as "how far").
- `tank_cairn` (L1 type) at s 300 / l +60 and s 900 / l −70: Wake way-markers.
- A lone fallen turbine (`turbine_ruin`, `fallen: true`) at s 700 / l +420, for silhouette.
- Kit's buggy **Tick** starts at s 520 / l −110 with the kite up.

**Pull.** The Sundial's needle, dead ahead. The convoy rolling past you.

#### Z2 · THE REED SEA (s 1,150 to 2,650)

**Card:** `THE REED SEA`

**Terrain.** Open rolling reed plain. Two broad swales run parallel to the road on the west (l −450 to −700) and the east (l +450 to +650). Reeds stand 2.6 m tall: tall enough to hide a land-yacht's hull with its mast lowered, never tall enough to hide Moth.

**Structures and dressing.**
- `tank_cairn` at s 1,700 / l +55.
- **A dead rig** (`rig_wreck`, painted name `BELLWETHER`, a convoy rig that went dry long ago) at s 2,200 / l −120: a stripped crawler hull, canvas rotted, reeds through its wheels. Cover in the raid.
- A fallen turbine at s 2,400 / l +380.
- Dust devils (`fx.emitter('dustDevil')`) wander the far reeds (2 alive, 300 to 800 m from the player).

**Pull.** The ridge rising on the right. The Sundial.

#### Z3 · THE WATCHER'S RIDGE (s 2,650 to 3,450)

**Card:** `THE WATCHER'S RIDGE`

**Terrain.** The road swings north-west (az 320°) under a long rock ridge to the east: 50 m high, with a broken crest of boulders (`rock_large` and `boulder` scatter, `range` limited to this zone). A dry creek crosses the road at s 3,200: the convoy dips 4 m and climbs out.

**Structures and dressing.**
- **Water cache A** (`water_cache`, id `cacheA`, paint `LANTERN LINE`) at s 2,900 / l −380, beside a small `tank_cairn`, in a reed hollow.
- The Watcher's stand: a flat rock shelf on the crest at s 3,050 / l +520 (terrain; a `rock_shelf` structure gives it a clean silhouette and a collider).
- A Founders' culvert at the creek (`road_culvert`): a low white ceramic arch under the road, half silted.

**Pull.** Turbine silhouettes ahead on the left.

#### Z4 · THE TURBINE RUINS (s 3,450 to 5,050)

**Card:** `THE TURBINE RUINS` / `Colony wind farm`

**Terrain.** The low plateau of the old wind farm (a 12 m rise). The road runs straight through it. Turbine bases are flattened discs; the fallen towers lie in shallow trenches.

**Structures and dressing.**
- **Seven standing turbines** (`turbine_ruin`): towers 70 to 90 m, rusted, nacelles intact or split, 1 to 3 blades left, stopped at odd angles. At s 3,820 / l −320, s 3,950 / l +300, s 4,120 / l −480, s 4,260 / l +420, s 4,420 / l −250, s 4,600 / l +350, s 4,780 / l −420.
- **Six fallen turbines** (`turbine_ruin`, `fallen: true`): towers lying in the reeds with nacelles half buried, 4 to 7 m tall when lying down. These are the harpooners' cover. At s 3,990 / l −215 (yaw 40°), s 4,070 / l +245 (yaw 300°), s 4,150 / l −270 (yaw 75°), s 4,340 / l +160 (yaw 20°), s 4,430 / l −150 (yaw 110°), s 4,700 / l +480 (yaw 200°).
- **A Founders' substation** (`substation_ruin`) at s 4,100 / l +260: low ceramic walls 40 × 25 m, roof gone, transformer pods (`founders_pod`) inside.
- **Salvage cache** (`salvage` collectible, Sail-Rig) in a wrecked land-yacht (`yacht_wreck`) at s 4,250 / l −380.
- Blades on the ground: lofted airfoil plates half buried (part of `turbine_ruin` dressing).

**Pull.** At the north end of the ruins the ground falls away and the salt flats show as a white band to the west.

#### Z5 · THE SALT FLATS (s 5,050 to 6,300)

**Card:** `THE SALT FLATS`

**Terrain.** The road runs north along the eastern rim of a salt pan. West of the road, from l −150 to l −700, the pan is flat, white and 5 m lower, with a crusted lip (the flats' edge) at l −700 to −760. Reeds fringe the pan; nothing grows on the salt.

**Structures and dressing.**
- **The salt crust** (`salt_flats`, a level custom mesh, §12.1): a ground-hugging polygon over the pan, white crust with hexagonal crack lines and pink brine streaks.
- **The Dredge skimmer ramp** (`skimmer_ramp`) at s 5,620 / l −720, on the flats' edge: a black iron ramp and a dock with two parked Skimmers (dressing until Rusk flees on one). The end of the *Tally*'s drag lane.
- Marker poles (`salt_pole`): Dredge survey poles with hazard chevrons every 80 m along the drag lane, so the player can read how far Big Mercy has been dragged.
- The laager stamp at s 5,450 on the road.

**Pull.** The *Tally*.

#### Z6 · THE COLONY ROAD (s 6,300 to 7,650)

**Card:** `THE COLONY ROAD`

**Terrain.** The road straightens north-north-east between low reed swells. Wide open: Skimmer country.

**Structures and dressing.**
- A Founders' **waystation ruin** (`waystation_ruin`) at s 6,900 / l −150: a 20 m ceramic dome stub with a split roof, a cistern ring and two `founders_pod`s.
- `tank_cairn` at s 6,600 / l +60.
- The road markers count down.

**Pull.** The first dial stones, then the blade filling the sky.

#### Z7 · THE SUNDIAL (s 7,650 to 8,791)

**Card:** `THE SUNDIAL`

**Terrain.** The flattened dial floor (r 640 around the pedestal). The road enters the ring at s 7,650 and passes the pedestal on its west side (the pedestal sits at l +130). The camp is in the shadow stripe north-north-west of the pedestal.

**Structures and dressing.**
- **The Sundial** (`sundial`, set piece, §12.3): a stepped plinth 140 × 140 m, 50 m tall, and the blade leaning north at 42° from the plinth's top, 1,350 m long, tip at 953 m.
- **24 dial stones** (`dial_stone`) on a 600 m radius ring round the pedestal, every 15°, 28 m tall, with plaques. The stone at azimuth 335° is the **road stone** (36 m, gold-banded): the shadow lies on it today. Stones on the road are skipped (the road passes through gaps).
- **Water cache B** (`water_cache`, id `cacheB`, paint none) at s 7,750 / l +260, in a reed patch at the foot of a dial stone.
- **The plaque** on the pedestal's north-west face at s 8,330 / l +95 (an interact point, optional).
- **The camp** (positions generated inside the shadow stripe): the Wake parks in five short columns at s 8,380 to 8,760, l +45 to +165, with six `wake_lamp`s. **The Bench** (the convoy's hero rig, §4.1) parks at s 8,580 / l +125, its work lamp on.

**Pull.** The Bench's work lamp in the shade.

---

## 3. Beat sheet (the level in order)

Times are first-time targets from pressing Deploy. Convoy `s` is the convoy's centre. Lines are in §9; encounter numbers in §6.

| # | Beat | Zone | Time | Convoy s | Control |
| --- | --- | --- | --- | --- | --- |
| 0 | Briefing (Oma's road order) | — | not timed | — | menu |
| 1 | Vista: the Wake rolling at dawn, the Sundial a needle on the horizon | Z1 | 0:00–0:08 | 450 (still) | none (skippable) |
| 2 | Oma: *"You haven't climbed down since the ice."* *"She is resting."* | Z1 | 0:08–0:20 | 450→590 | full |
| 3 | Roll-out. Escort card. Hesper's bearings; the Sundial card. *"Ration, Moth."* *"Dispensed."* Kit and the Still. | Z1 | 0:20–1:23 | →1,350 | full |
| 4 | **Raid 1.** Wakes in the reeds, sails burst out. Brass Mule harpooned: the cable lesson. Wave 2 from behind. Sail-Rig TEAR. | Z2 | 1:23–3:28 | →2,475 | full |
| 5 | Kit laughs; Moth's query. *"Road's clear. Open her up."* | Z2 | 3:28–3:50 | →2,740 | full |
| 6 | Cache A (optional). **The Watcher:** a green light on the ridge, *"Hello hello."*, *"Interference."* It leaves. | Z3 | 3:50–5:06 | →3,650 | full |
| 7 | **The turbine ruins:** harpooners winch rigs into the ruins. Rusk: *"Every drop on Gaunt is tallied…"* Wave 2: *"Your frame's handshake is loud."* *"What's a handshake?"* | Z4 | 5:06–7:21 | →4,690 | full |
| 8 | **Sync:** *"I have context now. I can anticipate you."* Kit's kite: *"Good news… bad news…"* Three sails on the flats. **Rocket volleys:** Second Sight, free the first time. | Z4 | 7:21–8:06 | →5,095 | full |
| 9 | **The *Tally* harpoons Big Mercy** (letterbox 8 s). The Wake stops and circles. | Z5 | 8:06–8:16 | 5,100 (halt) | none |
| 10 | **The drag:** chase alongside, cut three cables, each covered by a winch turret. Ansel hums. *"Big Mercy, keep your wheels straight…"* | Z5 | 8:16–10:56 | halt | full |
| 11 | **The deck:** Rusk drops anchors and turns to fight. Board. *"Let me drive. You shoot."* Moth Drives. Boarding cranes (Crane-Claw). | Z5 | 10:56–12:26 | halt | full |
| 12 | **Hold:** the scripted lethal shot. *"Hold on to me."* *"You said that under the ice."* *"I did."* | Z5 | ~12:05 | halt | full (2 s invulnerable) |
| 13 | **The mainmast falls;** the *Tally* slews and capsizes (letterbox 7 s). Rusk flees on a Skimmer: *"This goes on your tally, hauler!"* | Z5 | 12:26–13:11 | halt | none, then full |
| 14 | **Skimmer squadron.** Green lights. *"That one is hungry. It will need room."* Skate-Jets TEAR. | Z6 | 13:11–15:51 | 5,100→6,360 | full |
| 15 | **The Foreman's broadcast** (chime): V2, V3, V5. *"Turn that off."* *"Can't. It's on every channel."* Ansel hums over him. | Z6 | 16:44–17:39 | 6,360→7,660 | full |
| 16 | The dial ring. Cache B (optional). *"It is too far to read."* | Z7 | 17:39–18:54 | →8,560 | full |
| 17 | **Sundial noon:** the Wake parks in the shadow stripe. *"Shadow's laid along the north road. Sundial noon, Day Four."* Plaque (optional). | Z7 | 18:54–19:30 | 8,560 (camp) | full |
| 18 | Bring the frame to the Bench. Kit's kite straight up the shadow: *"I can see the whole WORLD!"* Moth: *"Logged."* Fade. | Z7 | 19:30–20:40 | camp | walk, then none |
| — | Debrief → Bench 2 → Morning Count (Day 4) | — | | | menu |

---

## 4. The gameplay twist: the convoy is the level

The Wake is a moving town, and the playable space moves with it. Everything in this section is level-local code (`levels/level02/convoy.js`), not engine.

### 4.1 Formation

- **40 rigs in 4 columns × 10 ranks.** Columns at l −36, −12, +12 and +36 (the outer columns are the flanks). Ranks every 42 m: rank 0 (front) at Δs +189 from the convoy centre, rank 9 (rear) at Δs −189. The convoy is 378 m long and 72 m wide.
- Each rig follows its slot along the route with a small seeded wobble (±1.5 m lateral at 0.05 Hz) and sits on the ground, pitched to the slope (sampled at its front and rear axle).
- **Hero rigs** (full models, painted names, animated parts):

| Rig | Roll # | Slot | Model | Notes |
| --- | --- | --- | --- | --- |
| *Compass Rose* | 4 | rank 0, col −12 | crawler with a 22 m navigator's mast, kite pennants | Leads. Hesper. |
| *Twice Shy* | 5 | rank 2, col +36 | walker, twin gun tubs (empty in L2) | The Pruitt twins (silent this level) |
| *Big Mercy* | 3 | rank 4, col −36 | tanker train: tractor plus two 14 m tank cars, 40 m long | Ansel. The set piece. |
| *The Bench* | 1 | rank 5, col +12 | `bench_crawler` look: crane arms, canvas, work lamp | Oma |
| *Second Patience* | 2 | rank 6, col −12 | small walker rig | Juno and Kit's rig, hitched behind the Bench |
| *Thimble* | 6 | rank 7, col +12 | resupply trike | |

- **Named target rigs** (instanced until harpooned, then swapped for a full model with their painted name): *Kettle* (#8, rank 3, col −36), *Low Lantern* (#21, rank 1, col +36), *Tin Psalm* (#35, rank 5, col +36), *Brass Mule* (#18, rank 6, col −36), *Cartwheel* (#27, rank 7, col −12), *Saint Never* (#34, rank 8, col −36), *Halfway* (#25, rank 9, col +36).
- The other 27 rigs fill the remaining slots in Roll order and are instanced (3 variants: crawler, walker, train; per-instance tint).
- **Tick** (Kit's buggy) is not in the formation. It drives the side of the convoy nearest the player, 60 to 120 m out, and its kite flies 60 to 140 m above it.
- Rigs are not colliders (the player would ride them). The convoy pushes the player out of rig footprints (oriented boxes) after the player update, and units avoid them with the same test.

### 4.2 Speed

The convoy's speed is a function of state, eased at 1.5 m/s²:

| State | Speed | When |
| --- | --- | --- |
| `roll` | 9 m/s | An encounter is active (any unit of the current encounter alive), or the player is outside the band |
| `open` | 12 m/s | No encounter active and the player inside the band. Hesper says *"Road's clear. Open her up."* the first time after each fight. |
| `hold` | 4 m/s | The convoy has reached the next encounter's trigger point while the current encounter is still active. The convoy never outruns a fight. |
| `circle` | 0 | Big Mercy harpooned: the rigs leave their slots and form a ring (radius 110 m) round the convoy centre over 20 s, then stop. |
| `camp` | 0 | Sundial: rigs drive into camp slots in the shadow stripe over 30 s, then stop. |

For speed purposes the rocket volleys (E4) count as an active encounter from `c_volley1` until `volleyDone`, so the Wake rolls at 9 m/s under fire.

Trigger points (convoy centre): raid 1 at 1,350; the Watcher at 2,850; the ruins at 3,650; the volley at 4,550 (and the ruins cleared); Big Mercy at 4,900 or later (after volley 2); the broadcast at 7,000; the dial ring at 7,650; camp at 8,560.

### 4.3 The band

The playable space is a disc of **radius 700 m round the convoy centre** (bible: "about ±700 m"), clipped by the corridor.

- Beyond 600 m: the tracker shows `TOO FAR · 640 m` in amber and the soft warning `STAY WITH THE WAKE` blinks (`hud.warn(text, 2, true)` every 3 s).
- Beyond 700 m: the warning goes hard (red), the convoy drops to `roll` speed, and a 30 s clock starts on the tracker.
- **At 30 s outside: raids land without her.** Every rig currently harpooned is lost at once, and until the player is back inside, any new harpoon in this encounter takes its rig instantly (no 25 s window). If no raid is active, nothing is lost, but the next raid's first harpoon is instant.
- **During the set piece** the band centre moves to Big Mercy (radius 700 m), and the circled convoy is safe.
- Comms on the first warning (once): Oma: *"Girl. Where are you going?"*

### 4.4 Harpooned rigs

A raider (a hooker yacht or a harpooner) fires a cable into a named rig.

1. **Telegraph (1.2 s):** the launcher glows, the `harpoon` SFX plays, and the rig's driver hits the horn (`rigHorn`).
2. **Hooked:** a cable target (`CABLE`, 600 AP, impMax ∞, hit sphere r 3 at the cable's midpoint, which moves with it, `tags: ['cable', 'cable:<rig id>']`) is spawned between launcher and rig. The rig leaves its slot and is dragged toward the puller at 6 m/s (yachts) or 5 m/s (harpooners winch it in), skidding sideways, throwing dust.
3. **The clock:** 25 s. The tracker shows `<RIG NAME>  18 s` with a draining bar, the objective pool shows `Cut <Rig> free: shoot or blade the cable` with a marker on the cable, and the rig's name hangs over it.
4. **Freed** when the cable target dies (any weapon: the blade cuts it in one hit, the rifle in three rounds, a missile in one) or the puller is destroyed or staggered. The rig turns back and rejoins its slot at 10 m/s. Comms `c_freed_kit` or `c_freed_hesper` (alternating, once per rig).
5. **Lost** at 0 s: the cable shortens, the rig is hauled away over the swell at 12 m/s and despawns 600 m out in a dust cloud. Its Roll id goes into the mission flag `cv:lost`. Comms `c_lost` (Hesper names it). First loss: the `rig_lost` card.
6. One puller holds one rig. A hooker yacht re-hooks after 20 s if it lives; a harpooner after 25 s. At most 2 rigs are hooked at once (a third puller waits).

### 4.5 Rigs at risk

| Encounter | Rig (Roll #) | Puller |
| --- | --- | --- |
| E1 raid 1 | *Brass Mule* (18), *Halfway* (25) | hooker yachts |
| E3 the ruins | *Kettle* (8), *Tin Psalm* (35), *Cartwheel* (27), then *Low Lantern* (21), *Saint Never* (34) | harpooners |
| E5 the *Tally* | *Big Mercy* (3) | the *Tally* (its own rules, §7) |

A re-hook picks the nearest unhooked named rig on the puller's side, falling back to the nearest generic rig (which is then swapped for a full model with its Roll name).

### 4.6 The tracker

`ctx.hud.tracker` (addendum 02, E5) shows, under the objectives:

```
THE WAKE  38 RIGS · 284 SOULS                    ← from the Roll minus cv:lost
WITH THE WAKE                                     ← or TOO FAR · 640 m / OUT OF RANGE 22 s
▮▮▮▮▮▮▯▯▯  BRASS MULE  15 s                      ← up to 3 hooked rigs, draining
```

The level refreshes it every 0.25 s. Until the widget exists, hooked rigs are still shown by their objective text and markers.

### 4.7 Level of detail and budget

- Hero rigs: full models (≤ 6 draw calls each) within 300 m; LOD1 single meshes beyond.
- Generic rigs: one `InstancedMesh` per variant and material (≤ 12 draw calls for all 27 to 34); beyond 300 m a single merged LOD per variant (bible low tier).
- The convoy system updates 40 slots and at most 3 dragged rigs per frame: about 0.2 ms.

---

## 5. Tutorialization and clarity

### 5.1 Controls taught in this level

Everything from Level 1 is assumed. Hints use `hint({ desktop, touch })`, shown for 7 s, once per save (flag `hint:<id>`).

| # | Control | Trigger | How it's taught | Moth's line | Hint (desktop / touch) |
| --- | --- | --- | --- | --- | --- |
| T1 | Staying with the convoy | Start, after `c_roll` | The escort objective, the tracker and the `convoy` card | — | `Stay within 700 m of the Wake. The tracker shows how far you are.` (both) |
| T2 | Cutting a cable | First harpooned rig | The rig drags away; the cable is a lockable target | — | `Lock onto the CABLE and shoot it, or blade it.` / same |
| T3 | Sync meter | `c_sync` | The meter appears, pre-filled to 3 | *"I have context now. I can anticipate you."* | `The Sync bar fills as you fight. Partner moves spend it.` (both) |
| T4 | Second Sight | Volley 1 (free and automatic), volley 2 (the player's turn) | Rockets arc in from the *Tally*; their paths draw | *"Second Sight. Watch the lines."* then *"Again. Your turn."* | `C: Second Sight (3 Sync). Time slows and shots show their paths.` / `SIGHT: time slows and shots show their paths.` |
| T5 | Moth Drives | Landing on the *Tally*'s deck (or 12 s into phase 2) | Deck turrets, two cranes and the mast; the frame dodges by itself | *"Let me drive. You shoot."* | `V: Moth Drives (4 Sync). The frame moves and dodges; you aim and fire.` / `DRIVE: the frame moves and dodges; you aim and fire.` |
| T6 | Hold | The scripted shot | Automatic | *"Hold on to me."* | `HOLD fired: 6 Sync spent. It saves you from one killing hit.` (both) |
| T7 | Flagging a water cache | Within 30 m of a cache | Same as L1's sledges | — | `F to flag the tanks` / `INTERACT to flag the tanks` |

Also repeated if not yet seen this save (the hint and card systems no-op otherwise): TEAR (`Hold right click to TEAR` / `Hold BLADE to TEAR`) on the first staggered glinting enemy.

### 5.2 Explain cards

Cards go through `ctx.hud.explain({ id, term, text, key })` (already landed: P5's clarity pass), paced by a level-local `Explainer` in `levels/level02/terms.js` (a copy of L1's pattern: one card at a time, never during a cinematic, urgent cards first). Ids are campaign-wide: an id already shown in Level 1 no-ops, so Level 2 also re-requests the Level 1 basics a player starting here would need (`tear`, `rack`, `stagger`, `qb`, `dredge`, `ghost`, `rigs`, `bench`, `water`, `wake`) at their first moment.

Writing rules (as L1's `terms.js`): plain words; only words the player has already met, or explained in place; titles one or two words; never explain the lattice, the kernel, what the fragments really are, what a Cantor is, why the Watcher's voice is on the local channel, or what a handshake really is; never "dead", "ghost", "carried", "passenger" or "body" about the pilot.

| id | Term | When it is asked for | Text | Key (desktop / touch) |
| --- | --- | --- | --- | --- |
| `convoy` | Escorting the Wake | `c_roll` (start) | The Wake drives north at its own pace and won't wait for you. Stay within about 700 m of it (the HUD warns you when you stray) and keep raiders off its rigs. | — |
| `sundial` | The Sundial | `c_hesper1` | A tower about a kilometre tall, built by Gaunt's first settlers and leaning toward the north. The Wake steers by it, and tonight it camps in its shadow. | — |
| `still` | The Still | `c_still` | The far north, where the sun never rises or sets. The Wake is walking there, because people say nobody there has to walk any more. | — |
| `land_yacht` | Land-yachts | The first yacht breaks cover | Raider sail-boats on wheels: fast, and lightly armoured. They hide low in the reeds, so watch for reeds parting before you see a sail. | — |
| `harpooned` | Harpooned rigs | The first rig is hooked | A raider has hooked a rig with a cable and is dragging it away. You have 25 seconds: shoot or blade the cable, or destroy whatever is pulling it. | Right click / BLADE |
| `rig_lost` | Lost rigs | The first rig is lost | A rig dragged away is gone, with everyone aboard. It comes off the Wake Roll, the convoy's list of rigs and people, at the end of the day. | — |
| `sail_rig` | Sail-Rig | A Sail-Rig enters the rack | A land-yacht's sail booster, now in your rack. Fitted at the Bench, it makes long straight runs faster and their quick boosts free, but you can't chain quick boosts. | — |
| `water_cache` | Water caches | `c_cacheA_spot` | Tanks of water left out here by an earlier convoy. Stand next to them and press the key to flag them; the Wake picks them up, one tank each. | F / INTERACT |
| `harpooner` | Harpooners | The first harpooner is visible | Slow raider walkers with cable guns. They winch rigs in toward them. A quick boost snaps a cable that hooks you. | Shift / BOOST |
| `rivet_driver` | Rivet Driver | A Rivet Driver enters the rack | A harpooner's rivet gun, now in your rack. Fitted at the Bench it replaces the rifle: slow, heavy bolts that stagger and slow what they hit. | — |
| `sync` | Sync | `c_sync` | The segmented bar under your armour. It fills as you fight well (damage dealt, close dodges, TEARs) and never drains on its own. Spend it on partner moves, where the frame works with you. | — |
| `second_sight` | Second Sight | Volley 1 | Costs 3 Sync. For 6 seconds time slows, every shot coming at you shows its path, and enemies about to strike flash red. | C / SIGHT |
| `tally` | The Tally | `c_mercy` | The raiders' flagship: an 80 m land-yacht with three masts, commanded by Rusk, the Tallyman. Its three winch turrets each hold a cable on Big Mercy. | — |
| `big_mercy` | Big Mercy | `c_mercy` | The Wake's water tanker: four tanks of water and four people. If the Tally drags it to the far edge of the salt flats, it's gone. | — |
| `boarding` | Boarding | `c_anchor` | The Tally has anchored to fight. Jump onto its deck and break the mainmast at its base; shots from far away barely scratch it. | Space / JUMP |
| `moth_drives` | Moth Drives | `c_drive` | Costs 4 Sync. For 8 seconds the frame moves and dodges by itself, keeping a good range, while you aim and fire. | V / DRIVE |
| `hold` | Hold | Straight after `c_hold` | Automatic, 6 Sync. When a hit would wreck the frame, Hold spends the Sync, leaves you 1 armour point and makes you untouchable for 2 seconds. | — |
| `crane_claw` | Crane-Claw | A Crane-Claw enters the rack | A boarding crane's claw, now in your rack. Fitted at the Bench it replaces the blade: grab a staggered enemy, then throw it. | — |
| `skimmers` | Skimmers | `c_skimmers` | Fast enemy hover-sleds with missile pods. They carry the pale green light. | — |
| `hungry` | Hungry parts | `c_hungry` | Some parts glint pale green instead of amber. They're stronger, but the frame can only run one by clearing some of its stored memory to make room. You choose at the Bench. | — |
| `skate_jets` | Skate-Jets | Skate-Jets enter the rack | A Skimmer's hover-legs, now in your rack, and a hungry part. Fitted at the Bench they make the frame much faster on the ground and let it skim across water. | — |
| `founders` | The Founders | The plaque is read | Gaunt's first settlers, more than a hundred years ago. They built the Sundial and the old road, and wrote the same words on everything they made. | — |

Urgent cards (jump the queue): `harpooned`, `second_sight`, `moth_drives`, `hold`, `boarding`, `tally`, `big_mercy`, `water_cache`.

The Bench's cards are in §13.5.

### 5.3 Speaker tags

`SpeakerDef.tag` shows beside the name on the speaker's first line in a playthrough (P5's clarity pass; `save.flags.commsMet`). A level that gives a known speaker a different tag shows the new one once.

| Speaker id | Label (`name`) | Tag | Notes |
| --- | --- | --- | --- |
| `JUNO` | JUNO | you | as L1 |
| `MOTH` | MOTH | your frame | new tag (L1's was "the machine you climbed into"), shown once |
| `KIT` | KIT · TICK | your brother, the scout | as L1 |
| `OMA` | OMA · BENCH | the convoy's elder and mechanic | as L1 |
| `FOREMAN` | (none) | unknown voice | as L1. Never more. |
| `HESPER` | HESPER · COMPASS ROSE | the Wake's navigator | **new** |
| `ANSEL` | ANSEL · BIG MERCY | driver of Big Mercy, the water tanker | **new** |
| `RUSK` | TALLYMAN | Dredge water-officer, commanding the raiders | **new**. Spoiler-free: everything here is said in the level. |
| `TALLOW` | (none) | unknown voice | **new**. Says nothing about channels or what she is. |

### 5.4 Comms audit: every term, and where it is introduced

| Term or idiom in comms | First used | Introduced by | Why it is clear |
| --- | --- | --- | --- |
| the Wake, rigs, the Bench, Dredge, ghost, TEAR, tanks | throughout | L1 cards (re-requested here) | |
| the Sundial | briefing ("the big needle on the horizon") | briefing, then the `sundial` card at `c_hesper1` | |
| Big Mercy | briefing ("our water tanker") | briefing, then the `big_mercy` card | |
| "bears three-five-four" | `c_hesper1` | context | A navigator calling a compass bearing on the Sundial. |
| the Still | `c_still` | `still` card on the same line | V5 comes 15 minutes later. |
| flanks | `c_roll` | context | Plain English. |
| land-yachts, sails | `c_raid1` | `land_yacht` card | |
| hooked / harpooned | `c_hooked` | `harpooned` card, hint T2 | |
| the Wake Roll | `c_lost` (first loss) | `rig_lost` card | |
| Lantern Line, "went dry" | `c_cacheA_flag` | context: Kit doesn't know them; Juno: *"They went dry. Years back."* | A convoy that's gone. Flavour; nothing to act on. |
| Tallyman | `c_rusk_who` | Rusk's tag and Oma's line *"Tallyman. Dredge water-officer."* | |
| handshake | `c_rusk2` | `c_handshake`: Juno asks; Moth: *"A signal."* | Answered in the next line (bible beat 6). No card: a card would over-explain. |
| context, anticipate | `c_sync` | `sync` card | |
| the Tally | `c_tally_seen` (Hesper names it) | `tally` card at `c_mercy` | Hesper: *"That's the Tally. The Tallyman's flagship."* |
| spikes, "bring her about" | `c_mercy_free` | `boarding` card | Rusk's orders; the result (the ship stops and turns) is visible. |
| hungry, "room" | `c_hungry` | `hungry` card on the same line | |
| little rig; "sit down" | `c_foreman` (V2) | context | The Foreman addressing Juno; "nobody gets to sit down" reads as "nobody gets to rest". |
| "Sundial noon" | `c_noon` | context | The shadow on the road, the Wake stopping. |
| Founders | `c_plaque` (optional) | `founders` card | |
| Morning. / Keep up. / Dry it. | flavour | — | Greeting and goodbye from context; never needed to act. |
| Ration / Dispensed | `c_ration` | — | Plain English. (A clue: §18.) |

---

## 6. Encounters

Positions are route-relative (`s`, `l`, `h`) unless given as world `x, z`. Because each encounter starts at a known convoy position (§4.2), absolute positions put the raiders where they should be relative to the Wake. Stats are in §10.

### E1 · `e_raid1`: the reed raid (Z2)

- **Trigger:** convoy s ≥ 1,350.
- **Approach (stalking):** wave 0's three yachts start at s 1,900 / l −600, s 1,950 / l −520 and s 2,000 / l −650 with **masts lowered**, hidden in the west swale. They close on the convoy's left flank at 20 m/s, visible only as **reed wakes** (the reeds part in a travelling V, §11.4) and a low dust haze. They are `targetable: false` while stalking. Kit sees the wakes 6 s before they break cover (`c_reeds`).
- **Break cover:** at 220 m from the convoy (or 150 m from the player, or when shot at with a missile lock), each yacht snaps its mast up (`sailSnap`) and accelerates to 50 m/s. From then on: normal yacht AI (§10.1).
- **Wave 0:** 2 rakers (`tags: ['raid1']`) and 1 hooker (`tags: ['raid1', 'hooker']`, target *Brass Mule*, #18). All carry the Sail-Rig.
- **Wave 1** (`when: { remaining: 1 }`): 1 raker at s 1,000 / l +550 and 1 hooker at s 950 / l +620 (target *Halfway*, #25), coming up behind on the right. Kit: `c_wave2`. They don't stalk (the reeds there are thin).
- **TEAR guarantee:** if both waves die without any TEAR this level, one more raker (`ap: 1,200`) sails in from s +600 ahead and staggers on its first hit (as L1's guarantee, so the TEAR reminder and the `sail_rig` card can land).
- **Cleared:** all `enc:e_raid1` dead (yachts flee at 15% AP and count as dead when they despawn 900 m out).
- **Budget:** 3 alive, then 2.

### E2 · `e_watcher`: the Watcher (Z3, no combat)

- **Trigger:** convoy s ≥ 2,850.
- The Watcher (a level actor, §10.5) stands on the crest shelf at s 3,050 / l +520 (on the ridge, 45 m above the road), facing the convoy, its green cab light blinking. It turns its head to follow Moth.
- **Leaves** 22 s after `c_watcher` ends, or at once if Moth comes within 250 m or shoots within 30 m of it: it turns and walks east off the crest and despawns behind it.
- It is not a combat target (`targetable: false`, invulnerable). Shots spark off it.

### E3 · `e_ruins`: the turbine ruins (Z4)

- **Trigger:** convoy s ≥ 3,650 (checkpoint `cp_ruins`).
- **Wave 0:**
  - 3 harpooners hidden behind fallen towers: `h1` at s 3,990 / l −215 (target *Kettle*, #8), `h2` at s 4,070 / l +245 (target *Tin Psalm*, #35), `h3` at s 4,150 / l −270 (target *Cartwheel*, #27). Each carries a Rivet Driver.
  - 2 rakers circling from s 4,300 / l +500 (Sail-Rig).
- **Behaviour:** harpooners hold behind their cover until the convoy's front rank passes s (their s − 60). Then each steps out, braces (1.2 s windup, visible: legs splay, the cable gun tilts up), and fires a cable into its target rig if within 220 m, or at Moth if closer than 120 m and no rig is in reach. While a cable is attached, a harpooner is braced: it can't move, its rivet gun still fires, and a stagger breaks the cable.
- **Wave 1** (`when: { remaining: 2 }`): `h4` at s 4,420 / l +150 (target *Low Lantern*, #21) and `h5` at s 4,480 / l −140 (target *Saint Never*, #34), stepping out from the bases of standing turbines. Rusk: `c_rusk2`, then `c_handshake`.
- **Cleared:** all `enc:e_ruins` dead. Then `c_ruins_clear`, open road, and E4.
- **Budget:** 5 alive at most (3 harpooners and 2 yachts).

### E4 · `e_volley`: Sync and the rocket volleys (Z4, north end)

- **Trigger:** E3 cleared and convoy s ≥ 4,550 (if the convoy gets there first it holds at 4 m/s).
- **Sequence:**
  1. `c_sync` (Moth) and the Sync meter appears, filled to 3.
  2. 6 s later, `c_kite`: Kit's kite climbs to 220 m. The *Tally* appears on the far flats as a skyline model at (−1,900, −1,500), sails up, 1.7 km away. Hesper names it (`c_tally_seen`).
  3. **Volley 1** (12 s after `c_kite`): 8 rockets rise from the *Tally*'s foredeck battery, arc 1.6 km and fall on Moth's position over 6 s (4 targeted, 4 bracketing at 15 to 30 m). At launch, Moth fires Second Sight **for free** (`ctx.sync.free('sight')`, no Sync spent), and says *"Second Sight. Watch the lines."* The paths draw. The `second_sight` card and hint T4.
  4. **Volley 2** (18 s after volley 1 lands): the same, and the Sync meter is topped up to at least 3 if the player has less. Moth: *"Again. Your turn."* The game waits for nothing: if the player doesn't use Second Sight, the rockets just come in at normal speed.
  5. Flag `volleyDone`; `o_volley` completes.
- **Rockets:** 420 dmg, 300 imp, splash 8 m (half damage), 75 m/s on a ballistic arc with a final homing correction of 20°/s. They can't be shot down. They never hit rigs.
- If the player is far behind the convoy, the rockets fall on Moth anyway (the *Tally* is aiming at the frame: Rusk is testing the handshake).

### E5 · `e_tally`: Big Mercy and the *Tally* (Z5): see §7

### E6 · `e_skimmers`: the Skimmer squadron (Z6)

- **Trigger:** the capsize event ends. The convoy re-forms its columns over 20 s and rolls at 9 m/s; Big Mercy (if saved) drives back to its slot at 10 m/s.
- **Wave 0:** 4 Skimmers in two pairs from the north-west: s 5,750 / l −450 and s 5,800 / l −520, 2 each. All carry the Skate-Jets (hungry glint).
- **Behaviour:** strafing runs at Moth (gun bursts) and missile passes over the convoy (missiles explode in the air 20 to 40 m over the rigs as near misses; rigs are never damaged). Pairs split and cross.
- **Wave 1** (`when: { remaining: 1 }`): 2 Skimmers from the east, s 6,200 / l +500.
- **Exit:** if any Skimmers are still alive 150 s after wave 1 spawns, they break off north at 60 m/s and despawn at 900 m; the encounter counts as cleared.
- **Budget:** 4 alive at most.

### E7 · The broadcast (Z6, no combat)

- **Trigger:** E6 cleared (or exited) and convoy s ≥ 7,000. `c_foreman` on the OPEN channel (chime). The convoy keeps rolling.

### E8 · The Sundial (Z7, no combat)

- Convoy s ≥ 7,650: `c_dial`. Convoy s ≥ 8,560: the convoy enters `camp`; `c_noon`; objectives `o_camp`, then `o_bench`.

### 6.1 Encounter budget

| Encounter | Max alive | Kinds |
| --- | --- | --- |
| E1 raid 1 | 3 | land_yacht |
| E3 ruins | 5 | harpooner, land_yacht |
| E5 the *Tally* | the *Tally* (1 unit, 11 child targets) + 2 yachts | tally, land_yacht |
| E6 Skimmers | 4 | skimmer |

The busiest moment is the *Tally*'s drag phase: 1 boss unit with 9 live child targets (3 winch turrets, 3 cables, 2 deck turrets, the bridge), 2 yachts, Big Mercy, and the circled convoy (instanced). Well inside the 40-unit High budget, and inside Low's 20.

---

## 7. The signature set piece: Big Mercy and the *Tally* (boss)

Implemented as one custom unit kind, `tally` (`levels/level02/tally.js`), which owns its child targets, its motion and its phases, plus the event lists `mercy`, `mercyFree`, `mercyLost` and `capsize` in the level file.

### 7.1 Build (bevelled procedural parts)

The *Tally* is Rusk's 80 m three-masted flagship land-yacht. Dredge colours: black iron hull `#2f2b29`, oxide-red topsides and sails `#6a2a1c`, hazard amber `#e0a030` chevrons, sodium lamps `#ff9a2e`. It has a living crew: its cab and bridge lights are **steady tungsten-amber**, never green.

- **Hull:** 80 × 16 m, deck at +11 m. A long knife-bowed hull from layered bevelled plates. Side profile (local z forward is negative) `[[-40, 3], [-34, 9], [-20, 11], [30, 11], [40, 8], [40, 2], [-32, 1.5]]`, extruded 16 m, bevel 0.5, with two armour belts and riveted seams. The name `TALLY` in white Dredge stencil on both bows, with a tally-mark emblem (five strokes, the fifth crossed).
- **Running gear:** six turbine-wheel bogies (2 per side forward and aft, 1 at the bow, 1 at the stern): 5 m spoked wheels in bevelled fenders, ducted drive turbines at the stern pair (spinning, heat shimmer).
- **Masts:** foremast 42 m, **mainmast 55 m** (amidships), mizzen 38 m. Bevelled segmented masts with yards. Stiff battened sails made of thin bevelled plates with stitched panel lines, oxide red with black chevrons. Sails flap (vertex sway) when slack.
- **The mast step** (the mainmast's weak point): a glowing amber collar at deck level (emissive `#ffb04a`) where the mast enters a riveted housing, venting heat.
- **Winch turrets ×3** on the stern deck (port, centre, starboard): squat rotating housings with a cable drum and a twin gun. Each pays out one cable aft.
- **Boarding cranes ×2** amidships (port and starboard): 18 m lattice jibs with a hydraulic claw on a cable (the Crane-Claw glint is on the claw).
- **Deck turrets ×2** forward (prototype turret, Dredge colours).
- **Rocket battery** on the foredeck: a 12-tube box launcher on a turntable.
- **Bridge** aft: a two-storey armoured deckhouse with slit windows lit amber, Rusk's flag, and on its roof the **deck sweeper**: a broadside harpoon gun with a bell mouth.
- **Spike anchors ×4:** black iron spikes on hydraulic arms at the four hull corners, folded up until phase 2.
- **Budget:** ≤ 24 draw calls, ≤ 150k triangles (set piece). LOD1 beyond 550 m: one merged mesh. The skyline version for beat 8 is the LOD1 mesh.

### 7.2 Numbers

| Part | AP | impMax | Stagger | Notes |
| --- | --- | --- | --- | --- |
| Hull | — | ∞ | never | Sparks; the first hull hit shows `ARMOURED. Cut the cables, or hit the winch turrets.` (phase 1) |
| Cable ×3 (`mercyCable`) | 1,200 | ∞ | — | Cut by any damage; the blade cuts one in one hit |
| Winch turret ×3 (`winch`) | 3,000 | 900 | 2.0 s | Destroying one releases its cable. Twin gun: 6 × 85 @ 420 m/s, cd 2.8 s, range 260 |
| Deck turret ×2 | 2,000 | 800 | prototype | Prototype turret |
| Boarding crane ×2 (`crane`) | 2,800 | 900 | 2.5 s | Heavy haul: Crane-Claw. TEAR removes the crane and its grab. |
| Bridge (`bridge`) | 6,000 | 1,800 | 2.5 s | Destroying it silences the rocket battery and the deck sweeper |
| Mainmast (`mainmast`) | 16,000 | 3,000 | 3.0 s | Phase 2 only. Hits from more than 60 m away do ×0.25. Boss bar `THE TALLY`. |

Movement (phase 1): drag speed 4.5 m/s with 3 cables attached, 3.4 m/s with 2, 2.3 m/s with 1. Its hull colliders (3 oboxes) move with it and are re-hashed every 0.25 s (as L1's Icebreaker). Being run over: 1,000 damage and 1,400 impact, pushed out sideways.

### 7.3 Beat 9: the harpoon (cinematic `harpoonMercy`, 8 s, letterbox)

- **Trigger:** flag `volleyDone`, convoy s ≥ 4,900 and 12 s after volley 2 lands. The *Tally* model swaps from skyline to the full unit at (−1,250, −700) (on the flats, west of the road) and runs at 22 m/s to a point 60 m west of Big Mercy.
- The camera, low beside Big Mercy, sees the *Tally* swing broadside. Three harpoons punch into Big Mercy's tank cars (sparks, a spray of water from one), cables go taut, and Big Mercy is yanked off the road. Rusk's line plays (`c_harpoon`), then Ansel's first hum.
- **Checkpoint `cp_flats`** when the cinematic ends. The convoy goes to `circle` (Hesper, `c_mercy`).

### 7.4 Phase 1: THE DRAG (target 140 s)

- **The drag lane:** from Big Mercy's position at the harpoon (BM₀, on the road at l −36) to a point 712 m away on the flats' edge, along route-relative offsets: (Δs 0, l −36) → (Δs +120, l −250) → (Δs +220, l −470) → (Δs +300, l −680). The *Tally* sails ahead of Big Mercy along this lane with its stern 100 m in front of her; Big Mercy skids behind on three taut cables. Dredge survey poles (`salt_pole`) every 80 m make the progress readable. The objective marker on Big Mercy shows the distance left to the edge.
- **Time to lose with nothing cut:** 712 m at 4.5 m/s = 158 s. Each cable cut slows the drag (above), so a first-timer who cuts one cable a minute has about 190 s.
- **Cables:** each runs from its winch turret down to Big Mercy, 100 m long, sagging slightly (a stretched mesh, `cable` material). The cable target sits at the cable's midpoint and moves with it. Cutting a cable makes it whip back to the winch (sparks, `cableSnap`); its winch turret keeps firing.
- **Winch turrets** cover the cables. Killing a turret also releases its cable.
- **Rocket battery:** a 6-rocket volley at Moth every 20 s (volley rules as E4), while the bridge lives.
- **Escort:** 2 rakers circle the drag; when one dies another sails in after 15 s (2 alive at most, 4 in total). They are TEAR fodder (Sail-Rig).
- **The deck is not for standing on yet.** If Moth lands on the moving deck, the deck sweeper fires after 1.0 s: a broadside blast that knocks Moth off the side (400 damage, 30 m/s impulse outward, 1,500 impact). Kit, once: *"Get off the deck, Jun! The CABLES!"* (`c_deck_warn`). With the bridge destroyed, the deck crew's rivet guns do it instead (same effect, 2 s delay).
- **Ansel:** hums on an open mic, louder as Big Mercy nears the edge (`c_hum1` at 25%, `c_hum2` at 60%).
- **Hesper:** `c_mercy_half` at 50% of the lane.

### 7.5 Phase 1 ends: Big Mercy free (event `mercyFree`)

- The third cable goes (cut or released). Big Mercy grinds to a stop on the salt. Ansel: *"…She's stopped."* and the rest of `c_mercy_free`.
- Flag `bigMercySaved` (and `mercy1`..`mercy4`, §13.7). Big Mercy is safe for the rest of the level (scripted: nothing targets her).
- **The *Tally* anchors:** it runs on 120 m, drops its four spike anchors (sparks, salt spray, a grinding stop), and turns broadside to Moth over 6 s (the hull yaws on its anchors). Rusk: `c_anchor`. The boarding cranes swing out.
- **Checkpoint `cp_deck`.** Objective `o_mast`. Card `boarding`.

### 7.6 Phase 1 lost: Big Mercy taken (event `mercyLost`)

- If Big Mercy reaches the end of the lane with any cable attached: the *Tally* winches her up the skimmer ramp's crust lip and over it (the lip is outside the band; a dust cloud hides the despawn). Ansel's hum breaks off mid-line (`c_mercy_lost`).
- Flag `bigMercyLost`; Roll id 3 goes into `cv:lost`.
- The *Tally* then anchors exactly as in §7.5 (Rusk: *"One tanker, paid in full. Now the frame."*). Phase 2 is the same. The level does not fail.

### 7.7 Phase 2: THE DECK (target 120 s)

- **The arena:** the anchored *Tally*, broadside to the player, deck 80 × 16 m at +11, with three masts, the bridge aft, the two cranes amidships and the two deck turrets forward. Moth boards by jumping and hovering (17 m/s jump plus hover reaches the deck from anywhere within 25 m).
- **Moth Drives** is taught here (`c_drive`, on landing on the deck or 12 s into the phase). The Sync meter is topped up to at least 4 before `c_drive`, so the first use is affordable. Moth Drives keeps to the deck: its steering never walks off a support more than 3 m higher than the ground ahead (addendum 02, E3).
- **Boarding cranes:** each swings its claw at Moth when within 30 m. Telegraph: a 1.2 s windup (`windup` set, so Second Sight flashes it; the claw opens and its lamp blinks). **Grab:** if the claw reaches Moth, it holds for 2.5 s, deals 300 damage per second and lifts Moth 6 m. A quick boost breaks the grab, as does staggering the crane. When a crane is staggered, its claw glints: TEAR it off (Crane-Claw) and the crane is out.
- **Deck turrets** and the **deck sweeper** (if the bridge lives: a broadside blast every 9 s along the deck, 600 damage, 1,200 impact, knockback; telegraph 1.5 s with a red bell-mouth glow) keep the deck busy.
- **The mainmast:** 16,000 AP, ×0.25 damage from beyond 60 m. The mast step glows. Staggering it (impMax 3,000) shakes the whole rig: sails flog, the yards swing, and loose gear falls.
- **Boss bar:** `THE TALLY`, the mainmast's AP.

### 7.8 Beat 12: Hold (the scripted shot)

- **Trigger:** the mainmast below 60% AP and Moth within 200 m of the *Tally*, or 75 s into phase 2 if that never happens.
- **Script:** Rusk: *"Hold still, hauler. Let me balance the books."* The deck sweeper's harpoon gun swings onto Moth (even if the bridge is destroyed: Rusk fires it by hand from the wreck) with a 1.5 s telegraph that can't be dodged (the shot is scripted to hit, `aimAssist: lock`). Just before it fires, the level calls `ctx.sync.unlock('hold')` and `ctx.sync.setFill(max(fill, 6))`.
- **The hit** deals exactly Moth's AP + 1. **Hold fires** (engine): AP stays at 1, Moth is invulnerable for 2 s, 6 Sync is spent, the HUD flashes `HOLD` and the screen flares white for 0.3 s. Time drops to 0.4 for 1.2 s (the level's own slow-motion, so the line types over it).
- MOTH: *"Hold on to me."* (`c_hold`). Then, 2 s later: JUNO: *"You said that under the ice."* MOTH: *"I did."* (`c_hold_after`). Card `hold`.
- Without the engine's Sync (`ctx.sync` missing), the shot deals 2,500 damage and the lines still play.

### 7.9 Beat 13: the mast falls (event `capsize`)

- The mainmast dies: the mast step blows (fireball, sparks), the mast cracks and falls across the deck to port, taking the foremast's yard with it.
- **Cinematic `capsize` (7 s, letterbox):** the toppling mast's weight tears the port anchors out; the *Tally* slews round on its starboard anchors, heels, and rolls onto its side into the reeds at the flats' rim with a long scraping crash and a salt-and-dust cloud. Its sodium lamps go out one by one. Moth is teleported to a safe spot 60 m clear if it was on the deck (the camera hides the move).
- Rusk's command Skimmer launches from the stern as it goes over and streaks north-west for the skimmer ramp: *"This goes on your tally, hauler!"* (`c_rusk_flee`). Kit: *"He's running! On a sled thing! A hover sled!"*
- The wreck stays (`keepMesh`), smoking, for the rest of the level.
- **Checkpoint `cp_road`** as the cinematic ends. The convoy re-forms and E6 starts.

### 7.10 Kit's help

Kit's kite flies over Big Mercy for the whole set piece and marks the three cables (`threat` markers labelled `CABLE`) and the winch turrets. Kit only talks at the moments in §9.

---

## 8. Checkpoints

The convoy's state lives in mission flags (`cv:s`, `cv:mode`, `cv:lost`, `cv:hooked`), so every snapshot captures it. On restart, the custom action `restoreConvoy` puts the convoy back at `cv:s` in its formation (hooked rigs back in their slots, lost rigs gone) and places the player on the convoy's left flank (60 m out, beside rank 4) unless the checkpoint gives a set-piece position. All checkpoints refill AP, ammo and kits; Sync fill and unlocked moves are restored from the engine's flags (`sync:fill`, `sync:unlocked`, addendum 02 E1).

| id | Taken | Nominal position | Label | Restores (via `onCheckpoint`) |
| --- | --- | --- | --- | --- |
| `cp_lip` | Fresh start | s 520, l −80, facing the route | The lip | (checkpoint 0) convoy at 450, `roll`; Tick and kite; vitals locked at 60 |
| `cp_reeds` | E1 cleared | s 2,450, l −80 | The reed sea | convoy at `cv:s`; open road; music `road` |
| `cp_ruins` | E3 trigger (convoy 3,650) | s 3,700, l −90 | The turbine ruins | convoy at 3,650; E3 respawns in full (architecture §6.9) |
| `cp_flats` | After the `harpoonMercy` cinematic | s 5,300, l −150, facing west | The salt flats | convoy circled at `cv:s`; the *Tally* respawns hooked to Big Mercy at the start of the lane (BM₀ from flags); the Sync meter on; music `tally` |
| `cp_deck` | Big Mercy freed or lost | 70 m from the anchored *Tally*'s port side, facing it | The Tally's deck | the *Tally* anchored at `tally:anchor` (flags), broadside; winch turrets and cables gone; bridge, cranes and deck turrets as they were (flags); Big Mercy saved or lost (flags) |
| `cp_road` | `capsize` ends | s 5,500, l −80 | The colony road | the *Tally* wreck in place; convoy re-forming at `cv:s`; E6 respawns |

Death in the drag phase restarts at `cp_flats`, which re-runs the drag from the start (Big Mercy back at BM₀, 3 cables). Rigs lost before a checkpoint stay lost; rigs lost after it come back.

---

## 9. Script

Style rules from the bible §10 apply (British spelling; combat lines ≤ 80 characters; at most two speakers per exchange in combat; only the Foreman's chime interrupts; jokes from character), **amended by the clarity rules at the top of this document.** Moth uses "I" (since the drowning), never contractions, and **never "I think"** (first in L3). Juno: short, no exclamation marks. Only Moth, Juno and the Watcher speak on LOCAL.

### 9.1 Briefing (pre-level screen)

```
header:     THE WAKE · ROAD ORDER
title:      THE WAKE
subtitle:   The Morning Steppe
body:
  Wake rolls north on the old colony road. Sundial by noon: the big needle on the horizon. We camp in its shade.
  Raiders work these reeds. You ride the flanks, girl. Nobody gets dragged off.
  Big Mercy's our water tanker. Everything we've got is in her. Watch her.
  — O. Desh, the Bench
objectives: Escort the Wake to the Sundial · Keep every rig on the road · Keep Big Mercy safe
fine:       Keep up.
showMap:    false
```

### 9.2 Text cards

None. (Bible §9.7: only three cards in the game, none in L2.)

### 9.3 Comms, in order

Format: **id** · trigger. Lines are `SPEAKER: text`. *(Stage directions in italics.)* `{wait n}` is a pause. **[card: id]** marks an explain-card request on that line.

#### Z1 · The Lip

**`c_morning`** · `start`, 1.0 s after the vista
- OMA: Morning, girl. You haven't climbed down since the ice.
- MOTH: She is resting.
- JUNO: I'm right here, Oma.
- OMA: So you are.

**`c_roll`** · 2 s after `c_morning`
- OMA: Wake's rolling. Ride the flanks. Anything that wants a rig goes through you. **[card: convoy]**
- JUNO: Copy.

**`c_hesper1`** · convoy s ≥ 700
- HESPER: Compass Rose to all rigs. Sundial bears three-five-four. Hold your columns. **[card: sundial]**
- KIT: Hesper says three-five-four like it's a song.
- HESPER: It is a song, Kit. Learn it.

**`c_ration`** · convoy s ≥ 950 (no enemy within 400 m)
- JUNO: Ration, Moth.
- MOTH: Dispensed.
- JUNO: Tastes like the last one.
- MOTH: Noted. Query: is that good?
- JUNO: It's consistent.

**`c_still`** · convoy s ≥ 1,150
- KIT: Hesper says if we keep this pace we'll see the Still before I'm sixteen. **[card: still]**
- JUNO: Hesper says a lot of things.
- KIT: She said you'd say that.

**`c_band`** · the player first goes beyond 600 m from the convoy (once)
- OMA: Girl. Where are you going?

#### Z2 · The Reed Sea

**`c_reeds`** · E1 spawns (the reed wakes start)
- KIT: Reeds are moving. Left side, way out. That's not wind.
- JUNO: Kite up. Everyone tighten up.

**`c_raid1`** · the first yacht breaks cover **[card: land_yacht]**
- KIT: SAILS! Three— no. Three. Three sails!
- JUNO: I see them. Stay behind Big Mercy, Kit.

**`c_hooked`** · a rig is harpooned (template; `{rig}` is its painted name) **[card: harpooned, the first time]**
- HESPER: {rig}'s hooked! They're dragging her off the road!
- JUNO: On it.

**`c_freed_kit`** / **`c_freed_hesper`** · a hooked rig's cable is cut or its puller dies (templates; Kit and Hesper alternate)
- KIT: {rig}'s LOOSE! She's coming back!
- *(alternate)* HESPER: {rig}'s back in her column. Good.

**`c_lost`** · a hooked rig is lost (template) **[card: rig_lost, the first time]**
- HESPER: We've lost {rig}. Close up the column.
- JUNO: …Close up.

**`c_first_tear`** · the first part enters the rack this level
- JUNO: Oma'll want that.

**`c_wave2`** · E1 wave 1 spawns
- KIT: Two more sails behind us! Right side!

**`c_raid1_clear`** · E1 cleared
- KIT: Ha— hahaha. Okay. Okay so that was a LOT of sails.
- {wait 2}
- MOTH: Query: Kit laughed while they were shooting at him. Why do people laugh when they are scared?
- JUNO: Ask me at camp.
- MOTH: Logged.

**`c_open1`** / **`c_open2`** / **`c_open3`** · played by the convoy code when it goes to `open` speed after a fight (first time after each encounter, in turn)
- HESPER: Road's clear. All rigs, open her up.
- HESPER: Clear. Open her up.
- HESPER: Open road. Make up the time.

#### Z3 · The Watcher's Ridge

**`c_cacheA_spot`** · convoy s ≥ 2,700 **[card: water_cache]**
- KIT: Kite sees tank lids in the reeds. Left of the road, by a cairn. Full ones!
- JUNO: I'll flag them if there's time.

**`c_cacheA_flag`** · cache A flagged
- KIT: Old paint on them. Lantern Line. Never heard of them.
- JUNO: They went dry. Years back.
- KIT: …Oh.

**`c_watcher`** · E2: the Watcher appears on the crest *(no music; wind only)*
- KIT: Jun. Ridge, right side. There's a frame up there.
- KIT: It's got a light. A green one.
- {wait 2}
- TALLOW: Hello hello.
- JUNO: Moth, who—
- MOTH: Interference.

**`c_watcher_gone`** · the Watcher has gone over the crest
- KIT: It's going. It didn't even shoot. Why didn't it shoot?
- JUNO: Don't know. Eyes front.

#### Z4 · The Turbine Ruins

**`c_ruins`** · convoy s ≥ 3,500
- HESPER: Turbine ruins ahead. Road runs right through. Keep it tight.
- KIT: I hate the ruins. Things hide in the ruins.

**`c_rusk1`** · E3 spawns *(DREDGE channel, heavy static)*
- RUSK: Every drop on Gaunt is tallied, hauler. Yours are overdue.

**`c_rusk_who`** · 3 s after `c_rusk1`
- KIT: Who's THAT?
- OMA: Tallyman. Dredge water-officer. Keeps the books on everything they steal.

**`c_harpooner`** · the first harpooner steps out of cover **[card: harpooner]**
- JUNO: Walkers in the ruins. Cable guns. Keep the rigs moving.

**`c_rusk2`** · E3 wave 1 spawns
- RUSK: Your frame's handshake is loud. We can hear you from the Dredge.

**`c_handshake`** · 2 s after `c_rusk2`
- JUNO: What's a handshake?
- MOTH: A signal. I will try to be quieter.

**`c_rivet`** · a Rivet Driver enters the rack (once) **[card: rivet_driver]**
- JUNO: Rivet gun. Heavy.

**`c_ruins_clear`** · E3 cleared
- KIT: That's the last walker! I think. Is it? It is. YES.

**`c_sync`** · E4 starts *(the Sync meter appears)* **[card: sync]**
- MOTH: Juno. I have context now. I can anticipate you.
- JUNO: Meaning?
- MOTH: Meaning when you need me, I will already be moving.

**`c_kite`** · 6 s after `c_sync`
- KIT: Kite's up! Good news: I can see the Dredge. Bad news: I can see the Dredge.
- KIT: Wait. Something closer. Three masts, out on the flats.

**`c_tally_seen`** · straight after `c_kite`
- HESPER: That's the Tally. The Tallyman's flagship.
- JUNO: Stay with Big Mercy, Kit.

**`c_volley1`** · volley 1 launches **[card: second_sight]**
- KIT: Flashes on the masts— ROCKETS! Coming at YOU, Jun!
- MOTH: Second Sight. Watch the lines.

**`c_volley2`** · volley 2 launches
- MOTH: Again. Your turn.

**`c_volley_done`** · flag `volleyDone`
- KIT: It's turning. It's coming. It's coming FAST.

#### Z5 · The Salt Flats

**`c_harpoon`** · during `harpoonMercy`
- RUSK: Big Mercy. Four tanks, four souls, all overdue.
- ANSEL: Hm. Hm-hm-hmm.

**`c_mercy`** · the cinematic ends **[cards: tally, big_mercy]**
- HESPER: Big Mercy's hooked! Three cables! All rigs, stop and circle!
- JUNO: Big Mercy, keep your wheels straight. Don't watch the harpoons. Watch me.
- ANSEL: Hm-hm. Watching you.

**`c_cable1`** · the first cable goes
- KIT: ONE! Two to go!

**`c_cable2`** · the second cable goes
- KIT: TWO! She's dragging slower!

**`c_deck_warn`** · Moth lands on the moving deck (once)
- KIT: Get off the deck, Jun! The CABLES!

**`c_hum1`** · Big Mercy 25% along the lane
- ANSEL: Hm-hm-hmm. Hm. Hm-hm.

**`c_mercy_half`** · Big Mercy 50% along the lane
- HESPER: Big Mercy's halfway to the edge of the flats. Juno.

**`c_hum2`** · Big Mercy 60% along the lane
- ANSEL: HM-hm-hmm. Hm-HM.

**`c_mercy_free`** · `mercyFree`
- ANSEL: …She's stopped. She's stopped. Thank you, frame. Thank you, Juno.
- RUSK: Spikes down! Bring her about! I'll collect from the frame instead.

**`c_mercy_lost`** · `mercyLost`
- ANSEL: Hm-hm. Hm—
- *(the signal cuts)*
- HESPER: Big Mercy's over the edge. She's gone.
- {wait 2}
- RUSK: One tanker, paid in full. Now the frame.

**`c_anchor`** · the *Tally* anchors **[card: boarding]**
- KIT: It stopped! It's— it's TURNING. At you!
- JUNO: Good. Now it holds still.

**`c_drive`** · Moth lands on the deck, or 12 s into phase 2 **[card: moth_drives]**
- MOTH: Let me drive. You shoot.
- JUNO: Since when do you drive?
- MOTH: Since now.

**`c_crane`** · the first crane grab attempt
- KIT: The crane! It's grabbing for you!

**`c_claw`** · a Crane-Claw enters the rack (once) **[card: crane_claw]**
- JUNO: Their claw. Oma can use that.

**`c_sweeper`** · Rusk's scripted shot, before the hit
- RUSK: Hold still, hauler. Let me balance the books.

**`c_hold`** · the hit; Hold fires *(time 0.4 for 1.2 s; white flare; HUD `HOLD`)*
- MOTH: Hold on to me.

**`c_hold_after`** · 2 s after `c_hold` **[card: hold]**
- JUNO: You said that under the ice.
- MOTH: I did.

**`c_mast_low`** · the mainmast below 25%
- KIT: The mast's going, the whole mast is GOING—

**`c_rusk_flee`** · during `capsize`
- RUSK: This goes on your tally, hauler!
- KIT: He's running! On a sled thing! A hover sled!

#### Z6 · The Colony Road

**`c_reform`** · the cinematic ends (Big Mercy saved)
- HESPER: All rigs, back in columns. Big Mercy, take your place.
- ANSEL: Hm. Taking it.

**`c_reform_lost`** · the cinematic ends (Big Mercy lost)
- HESPER: All rigs, back in columns. Close the gap where Big Mercy was.

**`c_skimmers`** · E6 spawns **[card: skimmers]**
- KIT: Sleds! Four— no, FOUR. Fast ones. Green lights.
- JUNO: Don't look at the lights.

**`c_hungry`** · a Skimmer's hungry glint first within 150 m of Moth (or its first stagger) **[card: hungry]**
- MOTH: That one is hungry. It will need room.
- JUNO: Room?
- MOTH: In me. I will show you at the Bench.

**`c_skates`** · Skate-Jets enter the rack (once) **[card: skate_jets]**
- KIT: You took its LEGS. Jun took its legs!

**`c_skimmers_clear`** · E6 cleared or exited
- HESPER: Road's clear to the Sundial. Open her up.
- KIT: We made it. We basically made it.

**`c_foreman`** · E7: convoy s ≥ 7,000 after E6 *(three-note chime; OPEN channel overrides everything; pale gold italics, slowest typing)*
- FOREMAN: Do you know what a day costs on Gaunt, little rig? Ten years of walking. Nobody gets to sit down.
- {wait 2}
- FOREMAN: Work is the only prayer that gets answered.
- {wait 2}
- FOREMAN: The Still is ice and bones. Turn around and work.
- {wait 1.5}
- OMA: Turn that off.
- KIT: Can't. It's on every channel.

**`c_foreman_after`** · straight after (Big Mercy saved)
- ANSEL: Hm-hm-hmm. Hm-hm. HM-hm-hmm.
- KIT: Ansel's humming over him. Everybody HUM.

**`c_foreman_after_lost`** · straight after (Big Mercy lost)
- {wait 3}
- JUNO: Drive louder, then.

#### Z7 · The Sundial

**`c_dial`** · convoy s ≥ 7,650
- HESPER: Dial ring. All rigs, ease down. We camp in the shadow.
- KIT: It's SO big. You can't see the top. Can you see the top?
- MOTH: Yes. There is a plaque at the top. It is too far to read.

**`c_cacheB_spot`** · convoy s ≥ 7,700 (if cache B isn't flagged)
- KIT: More tanks! Under the stone, right side!

**`c_cacheB_flag`** · cache B flagged
- KIT: That's TWO caches. Oma's going to say "hm."

**`c_noon`** · the convoy reaches camp (convoy s ≥ 8,560)
- HESPER: Shadow's laid along the north road. Sundial noon, Day Four.
- OMA: Rigs in, wheels chocked. Bring the frame to the Bench, girl.

**`c_plaque`** · the plaque is read (optional) **[card: founders]**
- MOTH: That phrase again. The same as the ship in the ice.
- JUNO: Founders wrote it on everything.

**`c_kite_world`** · during the cinematic `kiteWorld`
- KIT: Watch this. Straight up the shadow. Up, up, up—
- KIT: I can see the whole WORLD!
- MOTH: Logged.
- {wait 1.5}
- JUNO: …Good kite.
- *(fade to black over 3 s; the bridge-song music box plays its first four notes)*

### 9.4 Objectives (HUD text)

Objectives say what to do and where. Markers are on every objective with a place.

| id | Text | Kind | Notes |
| --- | --- | --- | --- |
| `o_escort` | Escort the Wake to the Sundial | manual | Marker on the Sundial's pedestal (a far marker). Shown all level; completed at camp. |
| `o_raid1` | Drive off the raiders in the reeds | kill, encounter `e_raid1` | `showCount`, markers on targets once they break cover |
| `o_free1` / `o_free2` / `o_free3` | Cut {Rig} free: shoot or blade the cable | manual | A pool. The level sets the text (`{ objective: { text } }`) and a marker on the cable when a rig is hooked; completes when freed, fails (and is removed) when lost. |
| `o_cacheA` | Flag the water tanks in the reeds, left of the road | flag `cacheA` | optional; marker at s 2,900 / l −380 |
| `o_ruins` | Stop the harpooners in the turbine ruins | kill, encounter `e_ruins` | `showCount`, markers |
| `o_volley` | Get through the rocket volleys: watch their paths | flag `volleyDone` | |
| `o_cables` | Cut the three cables dragging Big Mercy | destroy, tag `mercyCable`, count 3 | `showCount`, markers; the distance-to-edge readout is on Big Mercy's marker label (`BIG MERCY · 420 m TO THE EDGE`) |
| `o_mast` | Board the Tally and break its mainmast | destroy, tag `mainmast` | Marker on the mast step |
| `o_skimmers` | Drive off the Skimmers | kill, encounter `e_skimmers` | `showCount`, markers |
| `o_cacheB` | Flag the water tanks by the dial stone, right of the road | flag `cacheB` | optional |
| `o_camp` | Follow the Wake into the Sundial's shadow | reach s 8,560 / l +120, r 120 | |
| `o_plaque` | Read the plaque on the Sundial's base | flag `plaque` | optional; interact prompt `READ PLAQUE` (1 s) |
| `o_bench` | Bring the frame to the Bench | reach s 8,580 / l +125, r 18 | |

### 9.5 Hints and HUD text

Hints are in §5.1. Other HUD text:

| Text | Where | Style |
| --- | --- | --- |
| `STAY WITH THE WAKE` | beyond 600 m (soft), beyond 700 m (hard) | warn |
| `TOO FAR · 640 m` / `OUT OF RANGE · 22 s` | tracker | tracker band line |
| `CABLE` | cable targets | lock-box name, markers |
| `ARMOURED. Cut the cables, or hit the winch turrets.` | the first hull hit in phase 1 | hint |
| `Get closer. The mast's base only cracks up close.` | the first long-range mast hit in phase 2 | hint |
| `FLAG TANKS` | cache interacts | prompt |
| `READ PLAQUE` | the plaque | prompt |
| `HOLD` | Hold fires | engine HUD flash |
| `BIG MERCY · {n} m TO THE EDGE` | Big Mercy's marker in phase 1 | marker label |

Death screen line: `Signal lost.` (generic).

The plaque (interstitial, `style: 'plaque'` falling back to `'black'`, hold 6 s, readable three lines):
> SUNDIAL GNOMON · RAISED IN THE FOURTH YEAR
> WHEN THE SHADOW LIES ON THE ROAD STONE, WALK THE SHADOW NORTH.
> CARRY THEM HOME. SET THEM DOWN.

### 9.6 Debrief (spoiler-safe)

Title `WALK DAY 4 · THE MORNING STEPPE`. Rows: Time, Kills, Damage taken, **Haul** (part names), **Water recovered** (`n / 6` tanks: Big Mercy counts 4), **Rigs lost** (names, or `—`), Rank. No story text.

---

## 10. New enemies and actors

All models are built from `art/kit.js` (bevelled plate profiles, `panelBox`, `truss`, `pipe`, `joint`, `loft`, `latheHard`), merged per material, with an LOD1 single mesh. Faction colours as L1 §11 (Dredge shell `#2f2b29`, mid `#6a2a1c`, accent `#e0a030`, dark `#141211`). **Living crews** have steady tungsten-amber cab lights (`#ffb36b`). **Ghost-run machines** have the pale green beacon (`#a8ff9e`, `lightGhost` lens plus `glows` with `pulse: 'beat'`, `minPx: 4`; addendum 01 A2 #22). The kinds are registered by level code (`levels/level02/units.js`, `ctx.enemies.register`, built on the exported `Unit` class); every kind honours `blindT`, `slowT` and sets `windup` while telegraphing (addendum 02, E4).

### 10.1 Land-yacht (`land_yacht`)

**What it is.** A raider sail-boat on wheels: the steppe's version of L1's ice skiff. Crewed by living raiders. Fast and fragile. Source of the Sail-Rig.

**Visual (18 m long, 16 m mast).**
- Hull: a narrow, flat-bottomed knife hull. Side profile `[[-9, 0.6], [-7, 2.0], [6, 2.2], [9, 1.3], [8.2, 0.4], [-7, 0.2]]`, extruded 2.8 m, bevel 0.12. Two crew hoods with warm amber light inside (no figures).
- Running gear: a tricycle layout. Two 3 m spoked wheels on an outrigger beam 8 m wide, and a steered bow wheel. A ducted drive turbine at the stern (spinning). Dust plume from the wheels.
- Rig: a **hinged mast** (lowered flat along the hull while stalking, raised in 0.6 s with a `sailSnap`), one stiff lateen sail of battened bevelled plates, oxide red with a black chevron. The Sail-Rig glint sits on the sail's boom.
- Bow mount, one of two:
  - **raker:** a twin drum-fed autogun under a ventilated shroud;
  - **hooker:** a 4 m harpoon launcher with a cable drum (built like L1's Gaffer).
- Wreck (`yacht_wreck`): hull on its side, mast snapped, sail torn, burning 20 s; it stays on the map.

**Stats.**

| | Value | vs L1 skiff |
| --- | --- | --- |
| AP | 1,800 | 2,200 |
| impMax | 800 | 860 |
| Stagger | 2.4 s: the sail luffs and it coasts to a stop over 2 s | 2.6 s |
| Hit volume | sphere r 4.8 at h 3 | |
| Body | rad 5, hgt 6 | |
| Speed | stalking 20 m/s (mast down), cruise 38, attack runs 50; turn 1.0 rad/s at speed; accel 16 m/s² | 32 / 45 |
| Terrain | ground only; slope ≤ 0.25; avoids rigs and colliders with three whisker rays | |

**Behaviour (`land_yacht` AI).**
- **Stalk** (if `config.stalk`): mast down, `targetable: false`, closes at 20 m/s along the swale it spawned in toward the convoy's nearest flank. It is a reed pusher (§11.4). Breaks cover as in §6 E1.
- **Raker:** rake runs as L1's skiff: pick a line passing 40 to 70 m from its target (Moth, or 40% of runs a rig), sail it at 50 m/s, fire during the pass (3 bursts 0.3 s apart, each 6 rounds × 70 damage / 30 impact at 480 m/s, 3° cone, range 140), arc away to 250 to 350 m and turn. Rounds that hit rigs only spark.
- **Hooker:** sails to its target rig, matches its speed 40 to 70 m out, telegraphs (1.2 s, `windup` set) and harpoons it (§4.4). While towing it holds a course straight away from the road at 6 m/s. If it has no rig to hook (or within 100 m of Moth with no rig in reach), it harpoons Moth as L1's Gaffer (350 damage, 450 impact, tows Moth at up to 18 m/s for 3 s through `player.tow`; quick boost breaks it).
- **Flee:** below 15% AP it turns away at 50 m/s and despawns 900 m out (counted as dead).

**Haul.** Both variants: the Sail-Rig (plain, amber glint). A TEAR destroys the yacht (it's medium).

### 10.2 Harpooner (`harpooner`)

**What it is.** A slow Dredge gun-walker with a cable gun, crewed by living raiders. It winches rigs into cover. Source of the Rivet Driver.

**Visual (8.5 m).** The prototype `walker` model (`buildUnit(ctx, 'walker', 'dredge')`) at scale 0.75, reskinned: an oxide-red cab with an amber-lit slit, reverse-jointed legs, a **cable gun** on a raised back mount (a 5 m barrel with a cable drum and a barbed head), and a **rivet gun** on the right arm (a fat box magazine; the Rivet Driver glint is on it). When braced its legs splay wide and dig in (dust).

**Stats.** AP 4,200, impMax 1,400 (heavy), stagger 3.0 s (its legs buckle; any attached cable snaps), hit sphere r 4.5 at h 5. Speed 9 m/s, turn 1.6 rad/s.

**Behaviour.**
- **Cover:** waits behind its authored cover point (the fallen towers) until the convoy's front rank passes its s − 60.
- **Hook:** steps out (2 s), braces (1.2 s `windup`), fires the cable (160 m/s, range 220). On a rig: winches it toward itself at 5 m/s (§4.4). On Moth (if Moth is within 120 m and no rig is in reach): a 3 s tow at 14 m/s through `player.tow`, 300 damage, 400 impact.
- **Rivet gun:** 3 rivets × 160 damage / 120 impact at 450 m/s, cooldown 2.5 s, range 260, at Moth only.
- While braced it can't move. A stagger or the loss of its cable gun ends the brace.

**Haul.** Rivet Driver (plain, amber glint on the rivet gun). It's heavy: a TEAR rips off the rivet gun (it stops firing it) but the walker lives and keeps its cable gun.

### 10.3 Skimmer (`skimmer`)

**What it is.** A Dredge hover-sled: a narrow armoured sled on four hover-skids, ghost-run. Fast, missile-armed. Its hover-skids are the Skate-Jets, a **hungry** part (pale green-white glint, addendum 02 E8).

**Visual (9 m long).** A wedge hull of layered bevelled plates (black iron, oxide red chevrons), four ducted hover-skids on short struts (blue-white jet glow under each, dust ring on the ground), a twin gun in the nose, a two-tube missile pod on the back, and **the green beacon** on its low cab. It rides 2.5 m above the ground and banks hard into turns.

**Stats.** AP 2,600, impMax 900, stagger 2.2 s (it drops onto its skids and slides 30 m), hit sphere r 3.5 at h 2.5. Speed 45 m/s cruise, 60 on runs; turn 1.6 rad/s; accel 24 m/s².

**Behaviour.**
- Strafing runs at Moth: twin gun bursts (4 × 90 damage / 40 impact at 520 m/s) during a pass 30 to 60 m out.
- Missile passes over the convoy: 2 missiles every 8 s at a rig; they detonate as air bursts 20 to 40 m above the rigs (near misses; rigs are never damaged). At Moth: 2 missiles × 380 damage / 260 impact, homing (turn 2.2 rad/s), every 10 s.
- Pairs split and cross; a lone Skimmer joins another pair.

**Haul.** Skate-Jets (hungry 1). A TEAR destroys the Skimmer (medium).

### 10.4 The *Tally* (`tally`)

See §7. `levels/level02/tally.js` registers the kind. The unit itself is `targetable: false` and `boss: true`; its `ap` and `apMax` mirror the mainmast in phase 2, so the standard boss bar shows `THE TALLY`. In phase 1 the boss bar is hidden and the objective count carries the fight.

### 10.5 The Watcher (a level actor, not a unit)

- **Visual.** The prototype **Striker** design (`buildMech(ctx, { design: 'striker' })`) in Dredge colours, scarred (`wear 0.8`), with **the green beacon on its head**. No weapons drawn: its arms hang. Built once, posed by the level.
- **Behaviour.** Scripted only: stand facing the convoy, track Moth with its head (yaw limit 70°), and on `leave` turn and walk east at 6 m/s over the crest (the walk animation), then despawn when out of sight. No AI budget, no collider beyond a circle (r 3) so the player can't walk through it.
- It is the bible's Tallow (L2–L3 "a watcher on the ridges who never fires"). Nothing names it.

### 10.6 Rusk's command Skimmer (a level actor)

A two-seat Skimmer (a longer hull, a tungsten-lit cab: Rusk is alive) that launches from the *Tally*'s stern during `capsize` and runs a scripted path north-west to the skimmer ramp at 70 m/s, then out of the band. Not targetable. Its exhaust leaves a dust trail the camera follows.

### 10.7 The rigs (convoy actors)

Built in `levels/level02/rigs.js` (§4.1). Three generic variants (crawler: a tracked hull with a canvas house; walker: a four-legged rig, legs animated only on hero rigs; train: a tractor and one or two trailers), plus the hero rigs. All Wake style (AD §1.3): patched, asymmetric salvage over bevelled hulls, canvas awnings, kite ribbons, painted names, tungsten windows (dim in daylight). No people are ever visible: cabs have canvas screens or dark glass.

### 10.8 Tick and the kite

The L1 actors (`levels/level01/actors.js` exports `Tick` and `Kite`). Level 2 reuses them if their constructors accept a Level 2 runtime object with the same fields they read (`L.ctx`, `L.root`, `L.ground()`); otherwise `levels/level02/actors.js` copies them. Tick follows the convoy flank nearest the player (§4.1); the kite follows Tick at 60 to 140 m, climbs to 220 m for `c_kite`, marks targets (`threat` markers) in the set piece, and goes straight up the shadow stripe in `kiteWorld`.

---

## 11. New mechanics in this level

### 11.1 Sync and the partner moves

The rules are the bible's §7.6, built by the engine (`ctx.sync`, addendum 02 E1 to E5). What this level does with them:

| Moment | Level action | Result |
| --- | --- | --- |
| Before `c_sync` | nothing | `ctx.sync.enabled` is false; the meter is hidden; nothing fills |
| `c_sync` | `{ call: 'sync', args: { enable: true, unlock: ['sight'], fill: 3 } }` | The meter appears with 12 segments (fragment value, all intact) and 3 filled |
| Volley 1 | `{ call: 'sync', args: { free: 'sight' } }` | Second Sight runs without spending |
| Volley 2 | `{ call: 'sync', args: { atLeast: 3 } }` | The player can afford it |
| `c_drive` | `{ call: 'sync', args: { unlock: ['drive'], atLeast: 4 } }` | Moth Drives available |
| The scripted shot | `{ call: 'sync', args: { unlock: ['hold'], atLeast: 6 } }` | Hold fires on the hit |
| Level end | (engine) | The unlocked moves persist in campaign state, so Level 3 starts with all three |

Filling (engine): +1 per 1,500 damage dealt, +1 per perfect dodge, +2 per TEAR. The meter doesn't drain.

### 11.2 Hungry glints

Skimmers carry the Skate-Jets, a hungry part. The engine draws hungry glints pale green-white (`#d8ffe6`, `pulse: 'sparkle'`) instead of amber (addendum 02 E8). Moth's line `c_hungry` and the `hungry` card explain it the first time one is within 150 m. The overwrite itself happens at the Bench (§13).

### 11.3 Water caches

As L1's sledges: an interact prompt (`ctx.mission.addInteract`, r 14, 1.5 s, label `FLAG TANKS`) sets the flag (`cacheA`, `cacheB`), and a Wake recovery flag with a lamp is planted. One tank each. Both optional; neither is on the critical path (A is 380 m west of the road in Z3, B is 260 m east in Z7).

### 11.4 Reeds as a read

The reed field is the level's dominant visual and a gameplay tell: **you see a stalking yacht by the wake it leaves in the reeds.**

- `reed_clump` is a scatter prop registered by level code at import time (`levels/level02/reeds.js` calls `registerProp`, exported by `src/world/scatter.js`): two crossed alpha-tested quads, 1.6 × 2.6 m, a canvas texture of about 20 stalks with seed heads (root `#5a3a1e` to tip `#e0a85a`), 3 variants with baked tint variation. Material: AD §3.11's reed shader (gust wave plus up to 8 pushers), patched through `ctx.atmosphere.patchMaterial`.
- **Pushers** (the level updates the uniform each frame): the player (r 9), every stalking or moving yacht (r 14, strength 1.2), Skimmers (r 10), Tick (r 6), and the nearest 3 rigs (r 12). A stalking yacht's pusher draws a travelling V through the field: the read.
- Density 350/ha within 250 m on High (180 m Medium, 120 m Low); beyond that the terrain's reed-gold palette carries the field, and a cheap brightness ripple can come later (deferred).
- Reeds don't grow on the salt pan, the road bed, the dial floor or the camp (`noScatter` stamps and `avoidRoute`).

### 11.5 The far battle painting (scale tiers)

L2 is one of the bible's three battle levels (§6.0). Tiers:

- **Near:** units with full AI (≤ 6 at a time, §6.1).
- **Mid:** the convoy: 40 rigs on slot splines, instanced, with simple motion (§4).
- **Far** (`levels/level02/skyline.js`): 6 distant yacht sails (`skyline` silhouettes) shadowing the Wake 1.5 to 3 km out on slow splines, with dust trails; the *Tally*'s sails on the horizon before beat 8; the Dredge's plume (AD skyline `smoke` at azimuth 10°, 14 km). Low thins the sails to 2.

### 11.6 The Sundial's shade

`levels/level02/sundial.js` computes the shadow stripe at load: the blade's and plinth's silhouettes projected along the sun direction (azimuth 150°, elevation 10°) onto the ground, clipped to 2 km. It is drawn as a ground-conforming mesh (a grid sampling `groundHeight` every 8 m, +0.25 m, `MultiplyBlending`, colour `#5c6a86`, soft edges). A point-in-polygon test drives the **shade art** (§15.2) while the player is inside, and the camp slots are generated inside it. (The engine's shadow map can't reach a kilometre-tall caster; addendum 01 deferred AD's terrain-data caster.)

---

## 12. Structures (kit pieces)

### 12.1 New types (registered by `levels/level02/structures.js`)

All built with the kit, ≤ 6 draw calls at LOD0 and 1 at LOD1, except the `sundial` set piece. Types are registered before `World.load` reads `zones`, using Level 1's proven pattern (a `zones` getter that registers types through `liveCtx()`, with a fallback that places them from `custom.install`).

| Type | Params | States | Colliders | Build notes |
| --- | --- | --- | --- | --- |
| `turbine_ruin` | h 70 to 90, blades 0 to 3, fallen, seed | | standing: circle r 3.2 on the tower; fallen: 2 oboxes (tower, nacelle) | Tapered lathe tower in flanged sections (`latheHard`), rust streaks, an access door; a rounded nacelle (split open on some seeds); blades lofted from a chamfered airfoil with twist (`loft`), some snapped at the root, one lying in the reeds. Fallen: the tower on its side in a shallow trench, nacelle half buried, 4 to 7 m tall: cover. |
| `substation_ruin` | | | 6 oboxes (walls) | Founders ceramic walls 3 to 5 m tall, broken tops, soft chamfers, dead gold seam strips, two transformer pods (`founders_pod`) inside, cable ducts. |
| `yacht_wreck` | seed | | obox | §10.1 wreck, old (no fire), half sunk in reeds. Holds the salvage cache. |
| `rig_wreck` | name, seed | | 2 oboxes | A stripped Wake crawler hull, canvas rotted to ribs, wheels gone, reeds through it, painted name. |
| `road_marker` | n (number shown) | | circle r 0.5 | Founders milestone: a 3 m white ceramic post, soft chamfers, a gold band, the number in Founders' type. |
| `road_culvert` | span 18 | | box (top at road level) | A low white ceramic arch under the road, half silted, reeds in the mouth. |
| `rock_shelf` | w 24, d 14 | | box | The Watcher's stand: layered sandstone slabs (`rockGeo`) with a flat top. |
| `water_cache` | paint | | obox | Three Wake tanks (bevelled cylinders, handles, painted name) under a reed-mat tarp, staked. Paint `LANTERN LINE` on A. |
| `salt_flats` | polygon | | none | Custom mesh: ground-conforming grid over the pan polygon (8 m cells, +0.15 m), white crust with hexagonal crack lines and pink brine streaks (canvas texture, triplanar-free: the pan is flat), soft alpha edge. 1 draw call. |
| `salt_pole` | | | circle r 0.3 | Dredge survey pole: black iron with hazard chevrons and a sodium lamp. |
| `skimmer_ramp` | | | 3 oboxes | Black iron ramp up the crust lip, a dock deck on legs, chevrons, sodium lamps, two parked Skimmers (dressing). |
| `waystation_ruin` | | | 4 oboxes | Founders dome stub (20 m, `dome` lathe with a wedge missing), a cistern ring, a doorway arch. |
| `dial_stone` | h 28, road: bool | | obox | A Founders monolith: a tall `slab` with soft chamfers, a gold band, an engraved plaque (`plaque` sign style, AD §4.7), wind-scoured base. The road stone: 36 m, two gold bands. |
| `sundial` | blade 1,350, lean 42, plinth 140 × 50 | | plinth: 4 stepped boxes; blade: none above 60 m (unreachable) | Set piece, §12.3. |

### 12.2 Types reused from Level 1

`tank_cairn`, `wake_lamp` (camp) and `founders_pod`, registered by calling `ensureL1Structures(ctx)` from `levels/level01/structures.js` (it registers all L1 types; registration is cheap and types only build when placed). The convoy's moving rigs are not structures (§10.7).

### 12.3 The Sundial (set piece)

- **Plinth:** a stepped Founders pedestal, 140 × 140 m at the base, four steps up to a 70 × 70 m top at +50 m. White ceramic (`ceramicAged`), soft 1.5 m chamfers on every step, gold seam lines (`gold`, dim emissive), the plaque on the north-west face at deck height (+4 m).
- **Blade:** springs from the plinth's top and leans north (azimuth 0°) at 42° from horizontal: 1,350 m long, tip at +953 m, the tip's ground point at (−61, −4,690). A **rounded triangular section** (`loft` of a rounded triangle, AD §2.17): 150 m wide at the root tapering to 18 m at the tip, one face toward the sun. Panel seams every 20 m, gold edge seams (`lightGold`, dim, catching the low sun first), a lattice-ring emblem 40 m across at the root.
- **Collision:** only the plinth (4 box steps, climbable) and the blade's first 60 m (an obox). The rest is unreachable and needs none.
- **Budget:** LOD0 ≤ 120k triangles (the blade is a few hundred plates; the seams are line geometry), LOD1 ≤ 8k. Beyond the view distance a **skyline version** (the LOD1 mesh, unlit and fog-tinted, held at constant angular size at `min(dist, camera.far × 0.9)`, AD §2.17) is visible from every point on the route.
- **The shadow stripe:** §11.6.

### 12.4 Placement summary

| Zone | Structures |
| --- | --- |
| Z1 | 3 `road_marker`, 2 `tank_cairn`, 1 fallen `turbine_ruin` |
| Z2 | 3 `road_marker`, 1 `tank_cairn`, `rig_wreck` (BELLWETHER), 1 fallen `turbine_ruin` |
| Z3 | 2 `road_marker`, `water_cache` A + small `tank_cairn`, `rock_shelf`, `road_culvert` |
| Z4 | 3 `road_marker`, 7 standing + 6 fallen `turbine_ruin`, `substation_ruin` (+2 `founders_pod`), `yacht_wreck` (salvage) |
| Z5 | 2 `road_marker`, `salt_flats`, `skimmer_ramp`, 9 `salt_pole` |
| Z6 | 3 `road_marker`, `waystation_ruin` (+2 `founders_pod`), 1 `tank_cairn` |
| Z7 | 1 `road_marker` (`0`), `sundial`, 24 `dial_stone` (minus 2 on the road), `water_cache` B, 6 `wake_lamp` (camp) |

---

## 13. The Bench, version 2 (after Level 2), and the Morning Count

The bible §7 is the rule; bible §7.14 calls this phase "V2". This section says exactly what exists after Level 2. Engine work is addendum 02 E10 and E11; the content (lines, cards, gifts, the forced fit) is data in `levels/campaign.js` (addendum 02 §B4).

### 13.1 What's new at Bench 2

1. **Two more hardpoints take hauled parts:** BOOSTER (Sail-Rig) and LEGS (Skate-Jets). CORE stays a fixed card (`No other parts yet.`).
2. **Hungry parts and overwriting.** The first time a hungry part is fitted, the player overwrites fragments to pay its hunger (bible §7.8 rule 3). The part becomes **bound**: refitting it is free forever.
3. **The forced fit (bible §7.11):** the Skate-Jets must be fitted before WALK ON (Level 3 floods), and **only F01 can be selected** to pay for them. Every other card is locked; clicking one plays Moth's *"Not those. This one."*
4. **The gift:** if the player didn't haul Skate-Jets, Oma hands over a pair on arrival (*"Found these on a dead Skimmer. You'll want them."*).
5. **The first Made fragment:** M1 (`CHILD'S KITE / GNOMON / WARMTH, CHEST`) appears on the LATTICE tab, marked `NEW`.
6. **Calls** (funded now, used in Level 3): the WAKE tab gains three FUND rows. *(Priority 2 for the engine: if it slips, Calls are introduced at Bench 3 instead, and Bench 2 shows no FUND rows.)*
7. **Sync readout:** the LATTICE header shows the Sync size (`SYNC 13`, then `SYNC 12` after the overwrite).

### 13.2 What the player can choose (exactly)

Tabs **FIT**, **HAUL**, **WAKE**, **LATTICE**; buttons **WALK ON** and Undo.

1. **FIT.**
   - R-ARM: Lantern Carbine, or the Sleet Gun or Rivet Driver if owned.
   - L-ARM: Psalter Blade, or the Gaff Harpoon or Crane-Claw if owned.
   - SHOULDER: Chorus Rack, or the Flare Pod if owned.
   - BOOSTER: Cantor Wings (stock), or the Sail-Rig if owned.
   - LEGS: Cantor Stride (stock), or the Skate-Jets (owned: hauled or gifted).
   - CORE: Hymnal Core (fixed). Utility: repair kits ×3 (fixed).
2. **Fitting the Skate-Jets the first time** opens the overwrite picker (§13.3). Until they are bound and fitted, WALK ON is disabled with the reason `Fit the Skate-Jets first. The canyon floods.`
3. **HAUL** (Locker, 4 parts) and **GIVE** as Bench 1. Give values: Sail-Rig 2, Rivet Driver 2, Crane-Claw 2, Skate-Jets 2 (L1 parts 1). **The Skate-Jets can't be given at Bench 2** (`Not these. You'll need them.`); spares of them can.
4. **WAKE:** water, the Count's draw (3), the result; the Roll with rigs lost this leg struck through and marked `LOST ON THE ROAD`; **FUND CALLS** (§13.4).
5. **LATTICE:** 13 cards (F01 to F12 plus M1), the overwrite picker when open.
6. **Undo** reverts every Fit, Give and Fund, last first, until WALK ON, **except the overwrite**, which confirms when made (single tap, gloss shown, pre-reveal rule bible §7.8 rule 6).

### 13.3 The overwrite picker (pre-reveal)

- Opens on the LATTICE tab with the header `MAKE ROOM: 1 FRAGMENT · SKATE-JETS` above the cards.
- Moth highlights its recommendation: the first intact card in its order (bible §7.7: F01, F08, F06, F11, F09, F04, F03, F05, M2, M1, M4, M3, F10, F02, F12, F07). At Bench 2 that is F01, and F01 is also the only selectable card (forced).
- Selected card: gloss in Moth's mono caps, the redaction bars, and a `OVERWRITE` button. Pressing it plays a short glitch on the card (bars dissolve), and the card becomes `OVERWRITTEN · SKATE-JETS` with its gloss struck through. Sync drops by one segment (13 → 12) with a visible tick on the header chip.
- Locked cards are dimmed with a small lock. Clicking one plays `bench.locked` (once per visit).
- Card `overwrite` (§13.5) shows the first time the picker opens.

### 13.4 Calls (funding only)

| Call | Who | Cost | Uses in L3 | Effect (bible §7.9) |
| --- | --- | --- | --- | --- |
| Spotter Kite | Kit | 1 tank | 3 | Marks all enemies and haul parts within 300 m for 20 s |
| Mortar Rig | *Twice Shy* (the Pruitts) | 2 tanks | 3 | A 6-shell barrage on your lock target after 3 s |
| Resupply Trike | *Thimble* | 2 tanks | 2 | Restores 40% AP, all missiles and +1 repair kit |

Each row: name, who, cost, `FUND` / `UNFUND` (one level of funding per Call per visit). Water updates live; funding can't take water below 0 before the Count's draw (the Bench shows the projected Count result and warns `This leaves the Wake short at the Count.` in red if it would). The in-level Call wheel is Level 3's engine work.

### 13.5 Bench explain cards

Defined in `CampaignData.legs.l02.terms` (addendum 02 §B4), shown through `ctx.hud.explain` above the Bench UI (addendum 02 E5):

| id | Term | When | Text |
| --- | --- | --- | --- |
| `hardpoints` | Booster and legs | The FIT tab first opened with a BOOSTER or LEGS part owned | Two more hardpoints now take hauled parts: the booster (how the frame boosts and dodges) and the legs (how it runs). Stock parts hang on the wall and can always go back on. |
| `overwrite` | Overwriting | The overwrite picker first opens | The first time a hungry part is fitted, the frame clears one stored fragment (a card on the LATTICE tab) to make room. The fragment is gone for good and your Sync bar loses a segment. After that the part is bound and refits free. |
| `made` | New fragments | The LATTICE tab first opened with a `NEW` card | The frame stored something new from today. Each new fragment adds a segment to your Sync bar. |
| `calls` | Calls | The WAKE tab first opened with FUND rows | Help from the Wake during the next level, paid for in water now: Kit's spotter kite (1 tank), the Pruitt twins' mortar rig (2 tanks) or Thimble's resupply trike (2 tanks). |

### 13.6 Bench 2 script

The frame kneels in the Bench's cradle under the work lamp; the camera orbits slowly; the music-box motif plays. Keys as addendum 01 A3.6 plus the new keys in addendum 02 E11.

**`arrive`** · scene opens
- OMA: Morning, girl. Frame in the cradle. Let's see what the reeds cost us.

**`gift`** · the Skate-Jets were gifted (arrival)
- OMA: Found these on a dead Skimmer. You'll want them.

**`haul`** · HAUL first opened, or 6 s after `arrive`
- OMA: Sails, rivets, a crane hand. You've been shopping.

**`give`** · Give first hovered or pressed
- OMA: Strip it and the Wake drinks. Your call.

**`fit:sail_rig`** · Sail-Rig first fitted
- OMA: Yacht sail. Goes like stink in a straight line. Turns like a cow.

**`fit:rivet_driver`** · Rivet Driver first fitted
- OMA: Rivet gun. Slow. Hits like a debt collector.

**`fit:crane_claw`** · Crane-Claw first fitted
- OMA: Boarding claw off the Tally. Grab, throw. Mind your fingers.

**`hungry`** · the overwrite picker first opens
- OMA: Canyon floods. You'll want skates.
- MOTH: They need room in me. One fragment.
- MOTH: Bridge, rain, vehicle at rest. It is the least important.
- JUNO: Your call.

**`locked`** · a locked card is clicked
- MOTH: Not those. This one.

**`overwrite`** · the overwrite confirmed
- MOTH: Overwritten. The skates are bound. They will not need feeding again.

**`made`** · LATTICE first opened with M1 `NEW`
- MOTH: A new one. From the Sundial.
- JUNO: Kit's kite?
- MOTH: Yes.

**`calls`** · WAKE first opened with FUND rows
- OMA: Next leg, the Wake can lend you hands. Kit's kite, the twins' mortar, Thimble's trike. Costs water.

**`mustFit`** · WALK ON pressed while the Skate-Jets aren't fitted
- OMA: Skates on, girl. Not a request.

**`gaveAll`** · WALK ON with every hauled part given (except the forced one)
- OMA: Generous. The canyon won't be.

**`keptAll`** · WALK ON with nothing given
- OMA: Keeping the lot. Hope the Wake's not thirsty.

**`walkOn`** · WALK ON
- OMA: Canyon tomorrow. Keep up.

Every Moth line is literally true or an evasion (bible §4 honesty rule): the room is in its lattice; F01 is first in its own ranking; M1 is from the Sundial.

### 13.7 Water, rigs and the Morning Count (Day 4)

- **Water income** goes through `def.campaign.waterFlags`, each truthy flag one tank: `['mercy1', 'mercy2', 'mercy3', 'mercy4', 'cacheA', 'cacheB']`. The level sets all four `mercy` flags when Big Mercy is saved (+4) and none when it's lost. `waterMax` is 6. This works with the existing engine (addendum 01 A5.2) with no change.
- **Rigs lost on the road:** the mission flag `cv:lost` (Roll ids). The engine applies them at level end (addendum 02 E10): they come off the Roll, and the Count lists them.
- **Story flag:** `bigMercy: 'saved' | 'lost'` in campaign state (Ansel's voice is gone for the rest of the game if lost; bible §6 L2).
- **Draw:** 3 (bible §7.9). Typical: water 3 after L1, + 4 (Big Mercy) + 1 (one cache) − 3 = **5**. If Big Mercy is lost: 3 + 0 + 1 − 3 = 1.

**Morning Count card (Day 4):**
```
DAY 4
WATER    5 TANKS      (3 + 5 recovered − 3 drawn)
WAKE ROLL   39 RIGS · 293 SOULS
Brass Mule                                      ← names lost this leg, grey
"Big Mercy's still with us. Moth asked why people laugh when they're scared. Didn't have an answer."
```
Lost Big Mercy: the log is *"Big Mercy went dry. Four names off the Roll. I wrote them myself."* (bible §12.4). The map strip shows the Wake's dot at 42°N.

### 13.8 Data (V2 subset)

Part data (engine, addendum 02 E7):

| id | Name | Slot | Hunger | Give | Source | Plays like |
| --- | --- | --- | --- | --- | --- | --- |
| `sail_rig` | Sail-Rig | BOOSTER (`B`) | 0 | 2 | L2:land_yacht | After 2 s of straight running at ≥ 90% of top speed on the ground: SAIL (ground speed ×1.2, quick boosts cost 0 EN). A turn faster than 25°/s, stopping, a stagger or 1 s airborne ends it. Quick-boost cooldown 1.0 s, always. |
| `skate_jets` | Skate-Jets | LEGS (`G`) | 1 | 2 | L2:skimmer | Ground speed ×1.35; acceleration ×0.55 with momentum slides (lateral grip 2.5/s instead of 7/s); hovers on water and slush; wall-ride 1.5 s. (Water and wall-ride behaviour lands with Level 3's engine work.) |
| `rivet_driver` | Rivet Driver | R | 0 | 2 | L2:harpooner | 650 dmg / 420 imp per bolt, 1 per 0.66 s, 420 m/s, 120 bolts, range 400; slows the target 20% for 2 s |
| `crane_claw` | Crane-Claw | L | 0 | 2 | L2:tally_crane | Grab a staggered light enemy (impMax ≤ 1,000) or a `throwable` within 25 m, hold up to 6 s, throw at 90 m/s: 1,600 dmg / 1,800 imp on impact plus 600 / 600 splash in 8 m. With nothing to grab: a 12 m swipe, 900 / 900. Cooldown 1.2 s. TEAR still works. |

Campaign state after L2 (typical; addendum 02 §B5):
```json
{ "v": 2, "day": 4, "water": 5, "arms": 0,
  "parts": { "shotgun_s8": "locker", "harpoon_gaff": "fitted", "flare_pod": "locker",
             "sail_rig": "locker", "rivet_driver": "locker", "crane_claw": "locker", "skate_jets": "fitted" },
  "spares": [], "bound": ["skate_jets"],
  "fitted": { "R": "rifle_r30", "L": "harpoon_gaff", "S": "msl_vm4", "B": null, "G": "skate_jets", "C": null },
  "lost": [18], "fragments": { "F01": "overwritten", "M1": "intact" },
  "overwrites": [{ "id": "F01", "part": "skate_jets", "day": 4 }],
  "kernel": 4, "calls": { "kite": 1, "mortar": 0, "trike": 0 },
  "story": { "bigMercy": "saved" }, "sync": { "unlocked": ["sight", "drive", "hold"] },
  "benchVisits": 2, "tearCount": 9, "pending": null, "ledger": null }
```

**Flow after Level 2:** debrief → Bench 2 → Morning Count (Day 4) → Level 3 briefing (if it exists; otherwise the title).

---

## 14. Pacing

| Segment | First-time target | Skilled | Intensity | Notes |
| --- | --- | --- | --- | --- |
| Vista and roll-out | 1:23 | 1:23 | low | Character beats while the Wake rolls (open road, 12 m/s). |
| Raid 1 | 2:05 | 1:15 | medium, rising | The reed read, the cable lesson, a TEAR. |
| Laugh, open road | 0:22 | 0:22 | quiet | |
| Cache A, the Watcher | 1:16 | 1:53 | quiet, eerie | No combat. A skilled player reaches it sooner and rides longer. |
| The turbine ruins | 2:15 | 1:45 | high | Most rig pressure in the level. |
| Sync and the volleys | 0:45 | 0:45 | wonder, then spike | Second Sight lands. |
| Harpoon cinematic | 0:10 | 0:10 | shock | |
| The drag | 2:40 | 1:30 | high, desperate | |
| The deck and Hold | 1:30 | 1:00 | high, then the line | Moth Drives, Hold. |
| Capsize | 0:45 | 0:45 | release | |
| Skimmers | 2:40 | 1:40 | high, fast | Includes the 20 s re-form. |
| Open road and the broadcast | 1:48 | 2:03 | quiet, unsettling | |
| The dial ring and camp | 1:51 | 1:51 | quiet, awe | 900 m at 12 m/s, then 30 s to park |
| Bench and the kite | 1:10 | 1:00 | warm | Non-skippable. |
| **Total** | **≈ 20:40** | **≈ 17:20** | | Within the 15 to 25 minute target. |

The convoy is the clock: open-road time (12 m/s) is where a skilled player saves minutes, and the fights are where a first-time player spends them. The intensity curve alternates low → medium → quiet → eerie → high → wonder → shock → high → line → release → high → unsettling → awe → warm. The set piece's three high stretches are broken by the anchor turn and the Hold line.

**If it runs long** (playtest median over 23 min), cut in this order: E1 wave 1 (keep *Brass Mule*'s hook), E3's second harpooner wave (keep Rusk's handshake line on a timer), volley 2 (Second Sight keeps its free lesson), E6 wave 1, and the open road's time (raise open speed to 14 m/s).

---

## 15. Art, light, audio and music by zone

### 15.1 Base art (Morning Steppe)

AD §5.7's L2 recipe, with the sun moved (§1.3 A1) and AD-deferred fields (`light.shafts`, `surface.dust`) kept for when they land (`atmosphere` keeps unknown fields):

```js
palette: { ground: '#9a6a3a', rock: '#5a4232', sediment: '#7a5434', high: '#b88a56', dust: '#d4ab80',
           wet: '#3a2a1a', concrete: '#7a7066', rust: '#7a4128', accent: '#ffb36b',
           strata: ['#6a4a34', '#8a6040', '#5a3e2c', '#a07850'] },
toneMapping: 'aces',
sky: { top: '#2e4f7c', mid: '#9fb3c0', horizon: '#e9c49a',
       sun: { azimuth: 150, elevation: 10, color: '#ffc27a', size: 1.2, glow: 1.0 },
       clouds: { cover: 0.3, color: '#f2d8b8', speed: 1 }, ridges: { height: 1.0, color: '#8a6a58', layers: 2 } },
fog: { color: '#d4ab80', density: 0.0009, heightFalloff: 0.008, inscatter: 1.0, sunColor: '#ffc98a' },
light: { sun: 6.8, sunColor: '#ffbf73', hemi: 1.7, hemiSky: '#9ab4d0', hemiGround: '#6b4a2c',
         rim: 2.2, rimColor: '#a9c4e0', exposure: 1.0, env: 1.0, shafts: 0.45, shadowMinElevation: 12 },
grade: { contrast: 1.06, saturation: 1.12, lift: [0.01, 0.005, 0.0], highlightsTint: [1.06, 1.0, 0.9],
         shadowsTint: [0.92, 0.97, 1.06], vignette: 0.25, grain: 0.03 },
bloom: { strength: 0.6, threshold: 0.95 },
weather: { type: 'dust', intensity: 0.5, wind: [5, 1.5] },
surface: { style: 'grit', dust: 0.25, rockSlope: [0.3, 0.55], strataHeight: 8 },
```

`shadowMinElevation: 12` keeps the shadow camera's depth sane at a 10° sun (addendum 01 A5.4). Skyline: the Sundial (`custom: 'sundial'`, the LOD1 silhouette, §12.3), the Dredge's plume (`smoke` at azimuth 10°, 14 km, `#4a3a30`, size 3), and the far battle painting (§11.5).

### 15.2 Per-zone and per-event art

| Zone or event | Changes from the base | Notes |
| --- | --- | --- |
| Z1 The Lip | base | Morning. Long shadows point at the Sundial. |
| Z2 The Reed Sea | weather dust 0.6; fog density 0.0010 | Dust devils. |
| Z3 The Watcher's Ridge | base; weather dust 0.4 | The ridge in side light. |
| Z4 The Turbine Ruins | fog density 0.0011; grade contrast 1.08 | Striped shadows through blades. |
| Z5 The Salt Flats | light hemiGround `#c8b89c`, exposure 0.95; grade saturation 1.04, highlightsTint [1.04, 1.0, 0.94]; weather dust 0.3 | White salt bounce lights everything from below. |
| `harpoonMercy` / `capsize` | none | Letterbox only. |
| Z6 The Colony Road | weather dust 0.35 | |
| Z7 The Sundial | base | |
| **Shade** (in the stripe, blend 2 s) | light sun 1.1, hemi 2.0, hemiSky `#8aa6c8`, rim 2.6, rimColor `#ffd9a0`; grade saturation 0.98, shadowsTint [0.9, 0.96, 1.1], highlightsTint [1.0, 1.0, 1.02]; fog inscatter 0.6 | Cool blue shade with gold sunlight beyond the stripe's edge and a warm rim on everything. Replaces AD's "higher, whiter sun" (§1.3). |
| Leaving the shade | blend back to Z7's values over 2 s | |

### 15.3 Low tier

Reeds out to 120 m (terrain beyond); rigs beyond 300 m merged per variant; hero rigs ≤ 2 at LOD0; the Sundial blade LOD1 inside 3 km; the shadow stripe mesh at 16 m cells; the far painting thinned to 2 sails; no point lights (sodium and tungsten lamps are emissive plus glows); ghost beacons keep `minPx: 4`.

### 15.4 Audio

| Moment | Sound |
| --- | --- |
| Steppe ambience | Wind through reeds (`wind` loop with a high hiss layer), distant convoy engines (a low multi-engine drone that pans with the convoy), kite ribbon flutter near Tick |
| Land-yachts | Sail snap (`sailSnap`), wheel rumble, turbine whine (Doppler), reeds whipping |
| Harpooned rig | `harpoon`, then the rig's horn (`rigHorn`), cable creak, skidding |
| Cable cut | `cableSnap` (a twang and a whip) |
| Harpooners | Heavy footfalls, hydraulic brace hiss, `winch` |
| Skimmers | A thin jet whine (`rotorWhine` pitched up), a soft click on every green blink within 40 m |
| The *Tally* | Creaking rigging, sail flog, turbines, the rocket battery's ripple, the spike anchors' grinding stop, the long scrape of the capsize |
| Sync | `syncSight` (time-slow whoosh in and out), `syncDrive` (a servo chord), `syncHold` (a deep single thump and a white-noise flare) — engine SFX, addendum 02 E12 |
| The Foreman | The chime (E5 → C5 → A4), then clean silence under the line |
| Camp | Wind dropping in the shade, rigs powering down one by one, Kit's kite reel |

New level-played SFX names (the engine no-ops unknown names): `sailSnap`, `rigHorn`, `cableSnap`.

### 15.5 Music

Four inline `ThemeDef`s (full values in §17):
- **`l02_road`**: 84 bpm, root D2 (73.4 Hz), Dorian; a warm sawtooth pad, a plucked triangle arp, soft `tribal` drums at low intensity. The roll-out and open roads.
- **`l02_raid`** (combat): 118 bpm, root D2, Mixolydian; a bass ostinato, the `tribal` kit, a square pulse. Raids and Skimmers.
- **`l02_tally`**: 132 bpm, root G1 (49 Hz), Phrygian; the `industrial` kit, a sawtooth bass, a high triangle lead. The set piece.
- **`l02_noon`**: 66 bpm, root D2, Ionian; pad and a slow triangle line. The camp. It ends on the bridge-song music box (first four notes), carried into the Bench.

Stingers: `dread` (the Watcher's light, the *Tally* on the horizon), `discovery` (Sync), `boss` (the harpoon cinematic), `checkpoint`. The Watcher has no music: wind only.

---

## 16. Engine requests (summary of addendum 02) and level-side fallbacks

`docs/addendum-02.md` specifies each item exactly. Level code feature-detects every one (addendum 02 §B6). No level-side re-implementations: where an item is missing, the level runs without that behaviour, with the trivial stand-ins below.

| # | Item | Needed for | Without it |
| --- | --- | --- | --- |
| E1 | `ctx.sync`: Sync meter state, partner moves, Hold, filling, checkpoint flags, campaign persistence | §11.1, the Hold beat | The meter never appears; Sync lines and cards still play; the scripted shot deals 2,500 damage and *"Hold on to me."* still plays |
| E2 | Input actions `sight` (C, D-pad up) and `drive` (V, D-pad down) | Partner moves | — (part of E1) |
| E3 | Player: Moth Drives steering, part mods (Sail-Rig, Skate-Jets), perfect-dodge detection | Moth Drives; Bench 2 parts | Moth Drives does nothing; parts fit but change nothing |
| E4 | `Target.windup`, `Target.slowT`; Hold hook in `combat.damage` | Second Sight flashes; the Rivet Driver's slow | No flashes; no slow |
| E5 | HUD: Sync meter, SIGHT/DRIVE touch buttons, `hud.tracker`, explain cards visible during the Bench | Clarity; the convoy | No tracker (objective texts and markers still name hooked rigs) |
| E6 | `SpeakerDef.wobble`, `speedVar` | The Watcher's jittering letters | Plain pale green text |
| E7 | Hardpoints B, G, C; `PartDef.mods`; parts `sail_rig`, `skate_jets`, `rivet_driver`, `crane_claw`; weapon types `rivet`, `claw` | Bench 2 | Hauled parts arrive at the Bench as give-only names (addendum 01 A3.6) |
| E8 | Hungry glint colour | §11.2 | Amber glints; Moth's line and the card still say "hungry" |
| E9 | Part visuals `sailrig`, `skates`, `rivet`, `claw`; the ghost beacon on bound hungry parts | Bench 2, Level 3 | Parts invisible on Moth |
| E10 | Campaign result: in-level rig losses, story flags, Made fragments, log variants, debrief rows, Sync persistence | §13.7 | Rigs lost on the road aren't removed; Big Mercy's fate isn't stored; no M1 |
| E11 | Bench V2: hardpoints, hungry fits and the overwrite picker, forced fit, gifts, bound parts, fragment states, Sync readout, `NEW` cards, Calls funding, new line keys | §13 | Bench 1 behaviour |
| E12 | SFX `syncSight`, `syncDrive`, `syncHold` | Sync | Silent |

Everything else is level-local (addendum 02 §B7): the convoy, rigs and band; the land-yacht, harpooner and Skimmer kinds; the *Tally*; the Watcher; Rusk's Skimmer; reeds; the Sundial, its shade and its skyline; the salt crust; the far painting; the explain-card queue; and every structure type.

---

## 17. Level definition draft (`levels/level02.js`)

This draft targets architecture §6 as amended by addendum 01 (`campaign`) and uses **no new `LevelDef` keys**: everything Level 2 adds to the campaign travels through `levels/campaign.js` (addendum 02 §B4) and mission flags, so `validateLevel` accepts it today. Custom actions (`call`) and conditions (`custom`) are registered by `levels/level02/index.js`. Values are starting points; tune against screenshots.

```js
// levels/level02.js — Level 2: THE WAKE (The Morning Steppe). Draft from docs/level-02.md (build team only).
// Structure types are registered before World.load reads `zones` (Level 1's pattern: a getter + liveCtx()).
import { installLevel02, ensureL2Structures, liveCtx } from './level02/index.js';
import './level02/reeds.js';     // registers the 'reed_clump' scatter prop at import (scatter.js registerProp)

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────────────────
const PED = { x: -61, z: -3684 };                 // the Sundial's pedestal centre (s 8250, l +130)
const SUN = { azimuth: 150, elevation: 10 };
const CAMP = { s: 8560, l: 120 };
const BENCH = { s: 8580, l: 125 };
const term = (...ids) => ({ call: 'term', args: { ids } });
const add = (...ids) => ids.map(id => ({ objective: { add: id } }));
const done = (...ids) => ids.map(id => ({ objective: { complete: id } }));
const HINT = {
  band:  'Stay within 700 m of the Wake. The tracker shows how far you are.',
  cable: 'Lock onto the CABLE and shoot it, or blade it.',
  sync:  'The Sync bar fills as you fight. Partner moves spend it.',
  sight: { desktop: 'C: Second Sight (3 Sync). Time slows and shots show their paths.', touch: 'SIGHT: time slows and shots show their paths.' },
  drive: { desktop: 'V: Moth Drives (4 Sync). The frame moves and dodges; you aim and fire.', touch: 'DRIVE: the frame moves and dodges; you aim and fire.' },
  hold:  'HOLD fired: 6 Sync spent. It saves you from one killing hit.',
  tanks: { desktop: 'F to flag the tanks', touch: 'INTERACT to flag the tanks' },
  tear:  { desktop: 'Hold right click to TEAR', touch: 'Hold BLADE to TEAR' },
};
const hint = (id, text = HINT[id]) => ({ if: { not: { flag: 'hint:' + id } }, then: [{ hint: text }, { flag: ['hint:' + id, true] }] });

// ── music (inline ThemeDefs, §15.5) ─────────────────────────────────────────────────────────────────────────────
const ROAD = { bpm: 84, root: 73.42, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 4, 0],
  layers: { pad: { wave: 'sawtooth', vol: 0.15, cutoff: 1400, octave: 2 },
            arp: { wave: 'triangle', vol: 0.06, pattern: 'x.x.x..x', octave: 4 },
            drums: { kit: 'tribal', vol: 0.25, pattern: 'x...x...' } },
  intensity: { drums: [0.1, 0.4], arp: [0.3, 0.7] } };
const RAID = { bpm: 118, root: 73.42, scale: [0, 2, 4, 5, 7, 9, 10], progression: [0, 6, 3, 4],
  layers: { bass: { wave: 'sawtooth', vol: 0.26, cutoff: 800, pattern: 'x.x.xx.x', octave: 1 },
            drums: { kit: 'tribal', vol: 0.5, pattern: 'x.xxx.x.' },
            pulse: { wave: 'square', vol: 0.08, cutoff: 1600, pattern: 'x.x.x.x.', octave: 3 } },
  intensity: { drums: [0.3, 0.9], pulse: [0.4, 1.0] } };
const TALLY = { bpm: 132, root: 49, scale: [0, 1, 4, 5, 7, 8, 10], progression: [0, 1, 0, 6],
  layers: { bass: { wave: 'sawtooth', vol: 0.3, cutoff: 700, pattern: 'xx.x.xx.', octave: 1 },
            drums: { kit: 'industrial', vol: 0.55, pattern: 'x.x.x.xx' },
            lead: { wave: 'triangle', vol: 0.07, octave: 4 },
            pad: { wave: 'sawtooth', vol: 0.08, cutoff: 600, octave: 2 } },
  intensity: { drums: [0.4, 1.0], lead: [0.5, 1.0] } };
const NOON = { bpm: 66, root: 73.42, scale: [0, 2, 4, 5, 7, 9, 11], progression: [0, 4, 5, 3],
  layers: { pad: { wave: 'sawtooth', vol: 0.14, cutoff: 1100, octave: 2 },
            lead: { wave: 'triangle', vol: 0.05, pattern: 'x...x...', octave: 3 } } };

// ── art presets (§15) ───────────────────────────────────────────────────────────────────────────────────────────
const ART_BASE = {
  sky: { top: '#2e4f7c', mid: '#9fb3c0', horizon: '#e9c49a', sun: { ...SUN, color: '#ffc27a', size: 1.2, glow: 1.0 },
         clouds: { cover: 0.3, color: '#f2d8b8', speed: 1 }, ridges: { height: 1.0, color: '#8a6a58', layers: 2 } },
  fog: { color: '#d4ab80', density: 0.0009, heightFalloff: 0.008, inscatter: 1.0, sunColor: '#ffc98a' },
  light: { sun: 6.8, sunColor: '#ffbf73', hemi: 1.7, hemiSky: '#9ab4d0', hemiGround: '#6b4a2c', rim: 2.2, rimColor: '#a9c4e0',
           exposure: 1.0, env: 1.0, shafts: 0.45, shadowMinElevation: 12 },
  grade: { contrast: 1.06, saturation: 1.12, lift: [0.01, 0.005, 0.0], highlightsTint: [1.06, 1.0, 0.9],
           shadowsTint: [0.92, 0.97, 1.06], vignette: 0.25, grain: 0.03 },
  bloom: { strength: 0.6, threshold: 0.95 },
  weather: { type: 'dust', intensity: 0.5, wind: [5, 1.5] },
};
const ART_FLATS = { light: { ...ART_BASE.light, hemiGround: '#c8b89c', exposure: 0.95 },
  grade: { ...ART_BASE.grade, saturation: 1.04, highlightsTint: [1.04, 1.0, 0.94] }, weather: { ...ART_BASE.weather, intensity: 0.3 } };
const ART_SHADE = { light: { ...ART_BASE.light, sun: 1.1, hemi: 2.0, hemiSky: '#8aa6c8', rim: 2.6, rimColor: '#ffd9a0' },
  grade: { ...ART_BASE.grade, saturation: 0.98, shadowsTint: [0.9, 0.96, 1.1], highlightsTint: [1.0, 1.0, 1.02] },
  fog: { ...ART_BASE.fog, inscatter: 0.6 } };

// ── level-only data consumed by levels/level02/*.js ─────────────────────────────────────────────────────────────
const DATA = {
  sun: SUN,
  convoy: {
    startS: 450, campS: 8560, columns: [-36, -12, 12, 36], ranks: 10, rankGap: 42,
    speeds: { roll: 9, open: 12, hold: 4, accel: 1.5 }, circleR: 110,
    band: { radius: 700, warn: 600, grace: 30 },
    triggers: { raid1: 1350, watcher: 2850, ruins: 3650, volley: 4550, mercy: 4900, broadcast: 7000, dial: 7650, camp: 8560 },
    heroes: [ { id: 4, rank: 0, col: 1, model: 'crawler_mast' }, { id: 5, rank: 2, col: 3, model: 'walker_tubs' },
              { id: 3, rank: 4, col: 0, model: 'tanker' },        { id: 1, rank: 5, col: 2, model: 'bench' },
              { id: 2, rank: 6, col: 1, model: 'walker_small' },  { id: 6, rank: 7, col: 2, model: 'trike' } ],
    targets: [ { id: 8, rank: 3, col: 0 }, { id: 21, rank: 1, col: 3 }, { id: 35, rank: 5, col: 3 }, { id: 18, rank: 6, col: 0 },
               { id: 27, rank: 7, col: 1 }, { id: 34, rank: 8, col: 0 }, { id: 25, rank: 9, col: 3 } ],
    harpoon: { telegraph: 1.2, clock: 25, dragYacht: 6, dragWinch: 5, haulAway: 12, despawnAt: 600, maxHooked: 2,
               rehook: { yacht: 20, harpooner: 25 }, cable: { rig: 600, mercy: 1200, hitR: 3 } },
    camp: { stripeCols: [45, 75, 105, 135, 165], s: [8380, 8760] },
  },
  sundial: { pedestal: PED, plinth: { w: 140, h: 50, steps: 4 }, blade: { length: 1350, lean: 42, azimuth: 0, rootW: 150, tipW: 18 },
             ring: { r: 600, stones: 24, roadStoneAz: 335 }, stripeAz: 335 },
  flats: { lane: [[0, -36], [120, -250], [220, -470], [300, -680]],          // (Δs from BM₀, l)
           polygon: [[5050, -150], [5050, -700], [6000, -720], [6000, -160]] },
  tally: { spawn: [-1250, -700], skyline: [-1900, -1500], drag: [4.5, 3.4, 2.3], sternGap: 100, anchorRun: 120,
           volley: { every: 20, count: 6 }, sweeper: { every: 9, dmg: 600 }, mastFar: 60, mastFarScale: 0.25,
           holdAt: { mastBelow: 0.6, within: 200, fallback: 75 } },
  volley: { count: 8, gap: 18, dmg: 420, imp: 300, splash: 8, speed: 75 },
  ruinsCover: { h1: { s: 3990, l: -215 }, h2: { s: 4070, l: 245 }, h3: { s: 4150, l: -270 }, h4: { s: 4420, l: 150 }, h5: { s: 4480, l: -140 } },
  far: { sails: 6, lowSails: 2, ring: [1500, 3000] },
  caches: { cacheA: { s: 2900, l: -380 }, cacheB: { s: 7750, l: 260 } },
};

// ── zones (structures need the L2 types registered first: see the header) ───────────────────────────────────────
const ROAD_MARKERS = Array.from({ length: 17 }, (_, i) => ({ type: 'road_marker', at: { s: 250 + i * 500, l: 48 }, yaw: 'route', params: { n: 16 - i } }));
const markersIn = (s0, s1) => ROAD_MARKERS.filter(m => m.at.s >= s0 && m.at.s < s1);
const RUIN_STANDING = [[3820, -320, 84, 2], [3950, 300, 76, 3], [4120, -480, 90, 1], [4260, 420, 72, 0], [4420, -250, 88, 2], [4600, 350, 80, 1], [4780, -420, 70, 3]];
const RUIN_FALLEN = [[3990, -215, 40], [4070, 245, 300], [4150, -270, 75], [4340, 160, 20], [4430, -150, 110], [4700, 480, 200]];
const DIAL = Array.from({ length: 24 }, (_, i) => i * 15)
  .filter(az => az !== 165 && az !== 180)                      // the two stones the road passes through
  .map(az => ({ type: 'dial_stone', at: [PED.x + 600 * Math.sin(az * Math.PI / 180), PED.z - 600 * Math.cos(az * Math.PI / 180)],
                yaw: { face: [PED.x, PED.z] }, params: { h: az === 335 ? 36 : 28, road: az === 335 } }));

const ZONES = [
  { id: 'z_lip', range: [0, 1150], name: 'The Lip', card: { title: 'THE LIP', sub: 'South edge of the Morning Steppe' },
    structures: [ ...markersIn(0, 1150),
      { type: 'tank_cairn', at: { s: 300, l: 60 }, params: { n: 9 } }, { type: 'tank_cairn', at: { s: 900, l: -70 }, params: { n: 7 } },
      { type: 'turbine_ruin', at: { s: 700, l: 420 }, yaw: { azimuth: 60 }, params: { h: 80, fallen: true, seed: 1 } } ] },

  { id: 'z_reeds', range: [1150, 2650], name: 'The Reed Sea', card: { title: 'THE REED SEA' },
    art: { weather: { ...ART_BASE.weather, intensity: 0.6 }, fog: { ...ART_BASE.fog, density: 0.0010 } },
    structures: [ ...markersIn(1150, 2650),
      { type: 'tank_cairn', at: { s: 1700, l: 55 }, params: { n: 8 } },
      { id: 'bellwether', type: 'rig_wreck', at: { s: 2200, l: -120 }, yaw: { azimuth: 30 }, params: { name: 'BELLWETHER', seed: 3 } },
      { type: 'turbine_ruin', at: { s: 2400, l: 380 }, yaw: { azimuth: 200 }, params: { h: 74, fallen: true, seed: 2 } } ] },

  { id: 'z_ridge', range: [2650, 3450], name: "The Watcher's Ridge", card: { title: "THE WATCHER'S RIDGE" },
    art: { weather: { ...ART_BASE.weather, intensity: 0.4 }, fog: ART_BASE.fog },
    structures: [ ...markersIn(2650, 3450),
      { id: 'cacheA', type: 'water_cache', at: DATA.caches.cacheA, yaw: { azimuth: 80 }, params: { paint: 'LANTERN LINE' } },
      { type: 'tank_cairn', at: { s: 2910, l: -395 }, params: { n: 5 } },
      { id: 'shelf', type: 'rock_shelf', at: { s: 3050, l: 520, h: 0 }, yaw: { azimuth: 230 }, params: { w: 24, d: 14 } },
      { type: 'road_culvert', at: { s: 3200 }, yaw: 'route', params: { span: 18 } } ] },

  { id: 'z_ruins', range: [3450, 5050], name: 'The Turbine Ruins', card: { title: 'THE TURBINE RUINS', sub: 'Colony wind farm' },
    art: { fog: { ...ART_BASE.fog, density: 0.0011 }, grade: { ...ART_BASE.grade, contrast: 1.08 } },
    structures: [ ...markersIn(3450, 5050),
      ...RUIN_STANDING.map(([s, l, h, b], i) => ({ type: 'turbine_ruin', at: { s, l }, yaw: { azimuth: 150 + i * 23 }, params: { h, blades: b, seed: 10 + i } })),
      ...RUIN_FALLEN.map(([s, l, az], i) => ({ id: 'fallen' + i, type: 'turbine_ruin', at: { s, l }, yaw: { azimuth: az }, params: { h: 78, fallen: true, seed: 20 + i } })),
      { type: 'substation_ruin', at: { s: 4100, l: 260 }, yaw: 'route' },
      { type: 'founders_pod', at: { s: 4095, l: 252 }, yaw: { azimuth: 12 } }, { type: 'founders_pod', at: { s: 4108, l: 270 }, yaw: { azimuth: 190 } },
      { id: 'oldYacht', type: 'yacht_wreck', at: { s: 4250, l: -380 }, yaw: { azimuth: 300 }, params: { seed: 7 } } ] },

  { id: 'z_flats', range: [5050, 6300], name: 'The Salt Flats', card: { title: 'THE SALT FLATS' },
    art: ART_FLATS, artBlend: 4,
    structures: [ ...markersIn(5050, 6300),
      { id: 'salt', type: 'salt_flats', at: { s: 5520, l: -430 }, params: { polygon: DATA.flats.polygon } },
      { id: 'ramp', type: 'skimmer_ramp', at: { s: 5620, l: -720 }, yaw: { azimuth: 90 } },
      ...Array.from({ length: 9 }, (_, i) => ({ type: 'salt_pole', at: { s: 5150 + i * 90, l: -200 - i * 55 } })) ] },

  { id: 'z_road', range: [6300, 7650], name: 'The Colony Road', card: { title: 'THE COLONY ROAD' },
    art: { ...ART_BASE, weather: { ...ART_BASE.weather, intensity: 0.35 } }, artBlend: 4,      // also undoes ART_FLATS
    structures: [ ...markersIn(6300, 7650),
      { type: 'waystation_ruin', at: { s: 6900, l: -150 }, yaw: { azimuth: 40 } },
      { type: 'founders_pod', at: { s: 6880, l: -128 }, yaw: { azimuth: 75 } }, { type: 'founders_pod', at: { s: 6920, l: -175 }, yaw: { azimuth: 260 } },
      { type: 'tank_cairn', at: { s: 6600, l: 60 }, params: { n: 9 } } ] },

  { id: 'z_sundial', range: [7650, 8791], name: 'The Sundial', card: { title: 'THE SUNDIAL' },
    music: NOON,
    structures: [ ...markersIn(7650, 8791),
      { id: 'sundial', type: 'sundial', at: [PED.x, PED.z], yaw: 0, params: { ...DATA.sundial.blade, plinth: DATA.sundial.plinth } },
      ...DIAL,
      { id: 'cacheB', type: 'water_cache', at: DATA.caches.cacheB, yaw: { azimuth: 200 }, params: { paint: '' } },
      ...[[8420, 70], [8470, 150], [8540, 60], [8620, 160], [8680, 80], [8740, 140]].map(([s, l]) => ({ type: 'wake_lamp', at: { s, l } })) ] },
];
const ZONES_BARE = ZONES.map(z => ({ ...z, structures: [] }));    // custom.install places them when early registration failed

export default {
  id: 'l02', title: 'THE WAKE', subtitle: 'The Morning Steppe', order: 2, seed: 116002,
  par: { time: 1080, damage: 22000 },
  campaign: { bench: true, waterFlags: ['mercy1', 'mercy2', 'mercy3', 'mercy4', 'cacheA', 'cacheB'] },

  briefing: {
    header: 'THE WAKE · ROAD ORDER', title: 'THE WAKE', subtitle: 'The Morning Steppe',
    body: 'Wake rolls north on the old colony road. Sundial by noon: the big needle on the horizon. We camp in its shade.\n' +
          'Raiders work these reeds. You ride the flanks, girl. Nobody gets dragged off.\n' +
          "Big Mercy's our water tanker. Everything we've got is in her. Watch her.\n" +
          '— O. Desh, the Bench',
    objectives: ['Escort the Wake to the Sundial', 'Keep every rig on the road', 'Keep Big Mercy safe'], fine: 'Keep up.', showMap: false,
  },
  intro: [], outro: [],
  unlocks: { levels: ['l03'] },

  speakers: {
    JUNO:    { name: 'JUNO', tag: 'you', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
               channel: 'LOCAL', font: 'sans', speed: 1.0, static: 0 },
    MOTH:    { name: 'MOTH', tag: 'your frame', color: '#7fe9ff', voice: { base: 330, wave: 'sine' }, style: 'internal',
               channel: 'LOCAL', font: 'monoCaps', speed: 1 },
    KIT:     { name: 'KIT · TICK', tag: 'your brother, the scout', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 },
               style: 'radio', channel: 'WAKE', speed: 1.4, static: 0.25 },
    OMA:     { name: 'OMA · BENCH', tag: "the convoy's elder and mechanic", color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' },
               style: 'radio', channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
    HESPER:  { name: 'HESPER · COMPASS ROSE', tag: "the Wake's navigator", color: '#b8b4ac', voice: { base: 260, wave: 'triangle' },
               style: 'radio', channel: 'WAKE', speed: 1.0, static: 0.25 },
    ANSEL:   { name: 'ANSEL · BIG MERCY', tag: 'driver of Big Mercy, the water tanker', color: '#b8b4ac', voice: { base: 120, wave: 'sine' },
               style: 'radio', channel: 'WAKE', speed: 0.8, static: 0.3 },
    RUSK:    { name: 'TALLYMAN', tag: 'Dredge water-officer, commanding the raiders', color: '#c4532e', voice: { base: 190, wave: 'sawtooth', jitter: 0.2 },
               style: 'intercept', channel: 'DREDGE', speed: 1.2, static: 0.7 },
    TALLOW:  { name: '', tag: 'unknown voice', color: '#b8f5c0', voice: { base: 400, wave: 'sine', jitter: 0.35 }, style: 'internal',
               channel: 'LOCAL', font: 'sans', speed: 0.9, static: 0, wobble: 0.6, speedVar: 0.5 },     // E6 fields; ignored until they land
    FOREMAN: { name: '', tag: 'unknown voice', color: '#e9d79a', voice: { base: 140, wave: 'sine' }, style: 'intercept',
               channel: 'OPEN', speed: 0.7, italic: true, static: 0, chime: true },
  },

  factions: {
    dredge: { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#ffb36b', wear: 0.55 },
    ghost:  { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#a8ff9e', wear: 0.7 },
    wake:   { shell: '#b9a98a', mid: '#4f7d7a', accent: '#c8682e', dark: '#2a2420', eye: '#ffb36b', wear: 0.6 },
    founders: { shell: '#e6e2d8', mid: '#c9c3b5', accent: '#d8b25a', dark: '#3a3d40', eye: '#5fe3ff', wear: 0.4 },
  },

  music: { theme: ROAD, combat: RAID },

  route: {
    points: [[650, 3900], [600, 3450], [700, 2950], [900, 2400], [930, 1850], [760, 1350], [450, 950], [100, 580], [-280, 160],
             [-600, -320], [-720, -850], [-660, -1380], [-460, -1900], [-230, -2420], [-110, -2950], [-110, -3350], [-230, -3760], [-430, -4120]],
    halfWidth: [650, 650, 700, 750, 750, 700, 700, 650, 650, 700, 900, 900, 750, 700, 700, 750, 750, 700],
  },

  terrain: {
    bounds: [-2400, -5400, 2600, 5000], macroCell: 10,
    base: { scale: 1400, amp: 22, octaves: 5, ridged: 0.15, warp: 120 },
    features: [
      { kind: 'ridge', at: [-300, 4250], to: [1600, 4250], r: 260, h: 70, sharpness: 0.5 },                    // the southern lip
      { kind: 'ridge', at: { s: 2800, l: 560 }, to: { s: 3320, l: 470 }, r: 130, h: 50, sharpness: 0.7 },        // the Watcher's Ridge
      { kind: 'mesa', at: { s: 4150 }, r: 520, h: 12, sharpness: 0.2 },                                         // the wind-farm plateau
      { kind: 'basin', at: { s: 5520, l: -470 }, r: 520, h: 6 },                                                 // the salt pan
      { kind: 'ridge', at: { s: 5250, l: -740 }, to: { s: 5950, l: -700 }, r: 60, h: 12, sharpness: 0.8 },       // the flats' edge
    ],
    detail: { scale: 18, amp: 0.7 },
    walls: { height: 45, start: 0.85, noise: 0.5 },
    carve: { depth: 1.2, bedWidth: 110, shoulder: 90, smooth: 260, maxGrade: 0.05, strength: 0.8 },
    erosion: { droplets: 60000, thermal: 1 },
    stamps: [
      ...[[5150, -260], [5300, -380], [5450, -470], [5600, -560], [5750, -520]].map(([s, l]) =>
         ({ at: { s, l }, r: 170, falloff: 40, mode: 'flatten', h: -5, noScatter: true })),                       // the pan floor
      { at: { s: 5450 }, r: 160, falloff: 40, mode: 'flatten', h: 0 },                                           // the laager (relative bed)
      { at: [PED.x, PED.z], r: 640, falloff: 120, mode: 'flatten', h: 8 },                                       // the dial floor
      { at: [PED.x, PED.z], r: 110, falloff: 20, mode: 'raise', h: 4 },                                          // the plinth berm
      { at: CAMP, r: 220, falloff: 40, mode: 'flatten', h: 8, noScatter: true },                                 // the camp in the stripe
      { at: { s: 3200 }, r: 60, falloff: 20, mode: 'lower', h: 4 },                                              // the dry creek
    ],
  },

  art: {
    ...ART_BASE,
    palette: { ground: '#9a6a3a', rock: '#5a4232', sediment: '#7a5434', high: '#b88a56', dust: '#d4ab80',
               wet: '#3a2a1a', concrete: '#7a7066', rust: '#7a4128', accent: '#ffb36b',
               strata: ['#6a4a34', '#8a6040', '#5a3e2c', '#a07850'] },
    toneMapping: 'aces',
    surface: { style: 'grit', dust: 0.25, rockSlope: [0.3, 0.55], strataHeight: 8 },
    skyline: [
      { kind: 'custom', custom: 'sundial', at: [PED.x, PED.z], size: 1 },
      { kind: 'smoke', at: { azimuth: 10, dist: 14000 }, size: 3, color: '#4a3a30' },
      { kind: 'custom', custom: 'farSails', at: { azimuth: 300, dist: 2500 }, size: 1 },
    ],
    scatter: [
      { prop: 'reed_clump', density: 350, scale: [0.85, 1.25], slope: [0, 0.45], avoidRoute: true, maxDist: 250, seed: 21 },
      { prop: 'scrub', density: 30, scale: [0.6, 1.4], slope: [0, 0.5], maxDist: 180 },
      { prop: 'rock_medium', density: 2, scale: [1, 3], slope: [0.1, 0.8], collide: true, collideMinScale: 2.4 },
      { prop: 'boulder', density: 0.3, scale: [4, 9], avoidRoute: true, collide: true, castShadow: true },
      { prop: 'rock_large', density: 6, scale: [3, 7], slope: [0.25, 1], range: [2700, 3400], collide: true, castShadow: true },   // the ridge crest
      { prop: 'pebbles', density: 60, maxDist: 120 },
    ],
  },

  get zones() {
    const ctx = liveCtx();
    return ctx?.structures && ensureL2Structures(ctx) ? ZONES : ZONES_BARE;
  },

  checkpoints: [
    { id: 'cp_lip',   at: { s: 520, l: -80 },  yaw: 'route', label: 'The lip' },
    { id: 'cp_reeds', at: { s: 2450, l: -80 }, yaw: 'route', label: 'The reed sea' },
    { id: 'cp_ruins', at: { s: 3700, l: -90 }, yaw: 'route', label: 'The turbine ruins' },
    { id: 'cp_flats', at: { s: 5300, l: -150 }, yaw: { azimuth: 270 }, label: 'The salt flats' },
    { id: 'cp_deck',  at: { s: 5600, l: -380 }, yaw: { azimuth: 270 }, label: "The Tally's deck" },   // moved beside the anchor by onCheckpoint
    { id: 'cp_road',  at: { s: 5500, l: -80 }, yaw: 'route', label: 'The colony road' },
  ],

  objectives: [
    { id: 'o_escort', text: 'Escort the Wake to the Sundial', kind: 'manual', marker: { x: PED.x, z: PED.z, y: 520 } },
    { id: 'o_raid1', text: 'Drive off the raiders in the reeds', kind: 'kill', target: { encounter: 'e_raid1' }, showCount: true, marker: 'targets' },
    { id: 'o_free1', text: 'Cut the rig free: shoot or blade the cable', kind: 'manual' },     // text and marker set by the convoy code
    { id: 'o_free2', text: 'Cut the rig free: shoot or blade the cable', kind: 'manual' },
    { id: 'o_free3', text: 'Cut the rig free: shoot or blade the cable', kind: 'manual' },
    { id: 'o_cacheA', text: 'Flag the water tanks in the reeds, left of the road', kind: 'flag', flag: 'cacheA', optional: true, marker: DATA.caches.cacheA },
    { id: 'o_ruins', text: 'Stop the harpooners in the turbine ruins', kind: 'kill', target: { encounter: 'e_ruins' }, showCount: true, marker: 'targets' },
    { id: 'o_volley', text: 'Get through the rocket volleys: watch their paths', kind: 'flag', flag: 'volleyDone' },
    { id: 'o_cables', text: 'Cut the three cables dragging Big Mercy', kind: 'destroy', target: { tag: 'mercyCable', count: 3 }, showCount: true, marker: 'targets' },
    { id: 'o_mast', text: 'Board the Tally and break its mainmast', kind: 'destroy', target: { tag: 'mainmast' }, marker: 'targets' },
    { id: 'o_skimmers', text: 'Drive off the Skimmers', kind: 'kill', target: { encounter: 'e_skimmers' }, showCount: true, marker: 'targets' },
    { id: 'o_cacheB', text: 'Flag the water tanks by the dial stone, right of the road', kind: 'flag', flag: 'cacheB', optional: true, marker: DATA.caches.cacheB },
    { id: 'o_camp', text: "Follow the Wake into the Sundial's shadow", kind: 'reach', at: CAMP, r: 120, marker: true },
    { id: 'o_plaque', text: "Read the plaque on the Sundial's base", kind: 'flag', flag: 'plaque', optional: true, marker: { s: 8330, l: 95, h: 4 } },
    { id: 'o_bench', text: 'Bring the frame to the Bench', kind: 'reach', at: BENCH, r: 18, marker: true },
  ],

  encounters: [
    { id: 'e_raid1', units: [
        { kind: 'land_yacht', at: { s: 1900, l: -600 }, opts: { name: 'LAND-YACHT', tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig', stalk: true } } },
        { kind: 'land_yacht', at: { s: 1950, l: -520 }, opts: { name: 'LAND-YACHT', tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig', stalk: true } } },
        { kind: 'land_yacht', at: { s: 2000, l: -650 }, opts: { name: 'LAND-YACHT', tags: ['raid1', 'hooker'], config: { variant: 'hooker', rig: 18, haul: 'sail_rig', stalk: true } } } ],
      waves: [ { when: { remaining: 1 }, units: [
        { kind: 'land_yacht', at: { s: 1000, l: 550 }, opts: { name: 'LAND-YACHT', tags: ['raid1'], config: { variant: 'raker', haul: 'sail_rig' } } },
        { kind: 'land_yacht', at: { s: 950, l: 620 },  opts: { name: 'LAND-YACHT', tags: ['raid1', 'hooker'], config: { variant: 'hooker', rig: 25, haul: 'sail_rig' } } } ] } ] },

    { id: 'e_ruins', units: [
        { kind: 'harpooner', at: DATA.ruinsCover.h1, opts: { name: 'HARPOONER', tags: ['harpooner'], config: { cover: 'fallen0', rig: 8, haul: 'rivet_driver' } } },
        { kind: 'harpooner', at: DATA.ruinsCover.h2, opts: { name: 'HARPOONER', tags: ['harpooner'], config: { cover: 'fallen1', rig: 35, haul: 'rivet_driver' } } },
        { kind: 'harpooner', at: DATA.ruinsCover.h3, opts: { name: 'HARPOONER', tags: ['harpooner'], config: { cover: 'fallen2', rig: 27, haul: 'rivet_driver' } } },
        { kind: 'land_yacht', count: 2, at: { s: 4300, l: 500 }, spread: 60, opts: { name: 'LAND-YACHT', config: { variant: 'raker', haul: 'sail_rig' } } } ],
      waves: [ { when: { remaining: 2 }, units: [
        { kind: 'harpooner', at: DATA.ruinsCover.h4, opts: { name: 'HARPOONER', tags: ['harpooner'], config: { cover: 'fallen3', rig: 21, haul: 'rivet_driver' } } },
        { kind: 'harpooner', at: DATA.ruinsCover.h5, opts: { name: 'HARPOONER', tags: ['harpooner'], config: { cover: 'fallen4', rig: 34, haul: 'rivet_driver' } } } ] } ] },

    { id: 'e_tally', units: [
        { kind: 'tally', at: DATA.tally.spawn, opts: { name: 'THE TALLY', tags: ['tally'], boss: true, targetable: false,
          config: { data: 'tally', winches: 3000, cables: 1200, cranes: { ap: 2800, haul: 'crane_claw' }, bridge: 6000, mast: 16000,
                    deckTurrets: 2, escort: { kind: 'land_yacht', max: 2, total: 4, every: 15 } } } } ],
      persist: true },

    { id: 'e_skimmers', units: [
        { kind: 'skimmer', count: 2, at: { s: 5750, l: -450 }, spread: 20, opts: { name: 'SKIMMER', config: { pair: 'a', haul: 'skate_jets' } } },
        { kind: 'skimmer', count: 2, at: { s: 5800, l: -520 }, spread: 20, opts: { name: 'SKIMMER', config: { pair: 'b', haul: 'skate_jets' } } } ],
      waves: [ { when: { remaining: 1 }, units: [
        { kind: 'skimmer', count: 2, at: { s: 6200, l: 500 }, spread: 20, opts: { name: 'SKIMMER', config: { pair: 'c', haul: 'skate_jets', leaveAfter: 150 } } } ] } ] },
  ],

  triggers: [
    // ── Z1 · the lip ─────────────────────────────────────────────────────────────────────────────────────────────
    { id: 't_hesper1', when: { custom: 'convoy', args: { gte: 700 } }, do: [{ comms: 'c_hesper1' }, term('sundial')] },
    { id: 't_ration', when: { all: [{ custom: 'convoy', args: { gte: 950 } }, { not: { custom: 'enemyWithin', args: { r: 400 } } }] }, do: [{ comms: 'c_ration' }] },
    { id: 't_still', when: { custom: 'convoy', args: { gte: 1150 } }, do: [{ comms: 'c_still' }, term('still')] },
    { id: 't_band', when: { custom: 'bandDist', args: { gte: 600 } }, do: [{ comms: 'c_band' }, hint('band')] },

    // ── Z2 · raid 1 ─────────────────────────────────────────────────────────────────────────────────────────────
    { id: 't_raid1', when: { custom: 'convoy', args: { gte: 1350 } }, do: [
        { spawn: 'e_raid1' }, { comms: 'c_reeds' }, { call: 'kite', args: { follow: 'tick', h: 110 } } ] },
    { id: 't_raid1_seen', when: { custom: 'brokeCover', args: { encounter: 'e_raid1' } }, do: [
        { music: { theme: RAID } }, { comms: 'c_raid1' }, term('land_yacht', 'stagger', 'tear', 'rack', 'dredge'), ...add('o_raid1') ] },
    { id: 't_wave2', when: { custom: 'waveStarted', args: { encounter: 'e_raid1', wave: 1 } }, do: [{ comms: 'c_wave2' }] },
    { id: 't_tear_hint', when: { custom: 'tearAvailable', args: { r: 40 } }, do: [hint('tear', HINT.tear), term('tear')] },
    { id: 't_first_tear', when: { custom: 'rackCount', args: { gte: 1 } }, do: [{ comms: 'c_first_tear' }, { call: 'hudPanels', args: { rack: true } }] },
    { id: 't_tear_failsafe', when: { all: [{ cleared: 'e_raid1' }, { not: { custom: 'tearsThisLevel', args: { gte: 1 } } }] }, do: [
        { spawn: { kind: 'land_yacht', at: { s: 2900, l: -200 }, opts: { name: 'LAND-YACHT', tags: ['raid1x'], ap: 1200,
          config: { variant: 'raker', haul: 'sail_rig', staggerOnFirstHit: true } } } } ] },
    { id: 't_raid1_clear', when: { cleared: 'e_raid1' }, do: [
        { music: { theme: ROAD } }, ...done('o_raid1'), { checkpoint: 'cp_reeds' }, { comms: 'c_raid1_clear', wait: true } ] },

    // ── Z3 · cache A, the Watcher ──────────────────────────────────────────────────────────────────────────────
    { id: 't_cacheA_spot', when: { custom: 'convoy', args: { gte: 2700 } }, do: [
        { comms: 'c_cacheA_spot' }, ...add('o_cacheA'), term('water_cache'), { call: 'flagCache', args: { id: 'cacheA' } } ] },
    { id: 't_cacheA_near', when: { enter: { at: DATA.caches.cacheA, r: 30 } }, do: [hint('tanks')] },
    { id: 't_cacheA_flag', when: { flag: 'cacheA' }, do: [{ comms: 'c_cacheA_flag' }] },
    { id: 't_watcher', when: { custom: 'convoy', args: { gte: 2850 } }, after: 't_raid1_clear', do: [
        { call: 'watcher', args: { appear: true, at: { s: 3050, l: 520 } } }, { music: { stinger: 'dread' } },
        { comms: 'c_watcher', wait: true }, { call: 'watcher', args: { leaveAfter: 22 } } ] },
    { id: 't_watcher_gone', when: { custom: 'watcherGone' }, do: [{ comms: 'c_watcher_gone' }] },

    // ── Z4 · the ruins ─────────────────────────────────────────────────────────────────────────────────────────
    { id: 't_ruins_warn', when: { custom: 'convoy', args: { gte: 3500 } }, do: [{ comms: 'c_ruins' }] },
    { id: 't_ruins', when: { custom: 'convoy', args: { gte: 3650 } }, after: 't_raid1_clear', do: [
        { checkpoint: 'cp_ruins' }, { spawn: 'e_ruins' }, ...add('o_ruins'), { music: { theme: RAID } },
        { comms: 'c_rusk1', wait: true }, { wait: 3 }, { comms: 'c_rusk_who' } ] },
    { id: 't_harpooner', when: { custom: 'unitOut', args: { tag: 'harpooner' } }, do: [{ comms: 'c_harpooner' }, term('harpooner', 'qb')] },
    { id: 't_rusk2', when: { custom: 'waveStarted', args: { encounter: 'e_ruins', wave: 1 } }, do: [
        { comms: 'c_rusk2', wait: true }, { wait: 2 }, { comms: 'c_handshake' } ] },
    { id: 't_ruins_clear', when: { cleared: 'e_ruins' }, do: [{ music: { theme: ROAD } }, ...done('o_ruins'), { comms: 'c_ruins_clear' }] },

    // ── Z4 north · Sync and the volleys ────────────────────────────────────────────────────────────────────────
    { id: 't_sync', when: { all: [{ cleared: 'e_ruins' }, { custom: 'convoy', args: { gte: 4550 } }] }, do: [
        { wait: 3 }, { music: { stinger: 'discovery' } },
        { call: 'sync', args: { enable: true, unlock: ['sight'], fill: 3 } }, { call: 'hudPanels', args: { sync: true } },
        { comms: 'c_sync', wait: true }, term('sync'), hint('sync'),
        { wait: 6 }, { call: 'kite', args: { follow: 'tick', h: 220 } }, { comms: 'c_kite', wait: true },
        { call: 'tallySkyline', args: { show: true } }, { music: { stinger: 'dread' } }, { comms: 'c_tally_seen', wait: true },
        ...add('o_volley'), { wait: 6 },
        { call: 'volley', args: { n: 1, freeSight: true } }, { comms: 'c_volley1' }, term('second_sight'), hint('sight'),
        { waitFor: { custom: 'volleyLanded', args: { n: 1 } } }, { wait: 18 },
        { call: 'sync', args: { atLeast: 3 } }, { call: 'volley', args: { n: 2 } }, { comms: 'c_volley2' },
        { waitFor: { custom: 'volleyLanded', args: { n: 2 } } }, { flag: ['volleyDone', true] }, ...done('o_volley'),
        { comms: 'c_volley_done' } ] },

    // ── Z5 · Big Mercy and the Tally ───────────────────────────────────────────────────────────────────────────
    { id: 't_mercy', when: { all: [{ flag: 'volleyDone' }, { custom: 'convoy', args: { gte: 4900 } }, { timer: 12, since: 't_sync' }] }, do: [
        { event: 'mercy' }] },
    { id: 't_cable1', when: { killed: { tag: 'mercyCable', count: 1 } }, do: [{ comms: 'c_cable1' }] },
    { id: 't_cable2', when: { killed: { tag: 'mercyCable', count: 2 } }, do: [{ comms: 'c_cable2' }] },
    { id: 't_deck_warn', when: { all: [{ custom: 'onTally' }, { custom: 'tallyPhase', args: { eq: 1 } }] }, do: [{ comms: 'c_deck_warn' }] },
    { id: 't_hum1', when: { custom: 'mercyProgress', args: { gte: 0.25 } }, do: [{ comms: 'c_hum1' }] },
    { id: 't_mercy_half', when: { custom: 'mercyProgress', args: { gte: 0.5 } }, do: [{ comms: 'c_mercy_half' }] },
    { id: 't_hum2', when: { custom: 'mercyProgress', args: { gte: 0.6 } }, do: [{ comms: 'c_hum2' }] },
    { id: 't_mercy_free', when: { killed: { tag: 'mercyCable', count: 3 } }, do: [{ event: 'mercyFree' }] },
    { id: 't_mercy_lost', when: { custom: 'mercyProgress', args: { gte: 1 } }, do: [{ event: 'mercyLost' }] },
    { id: 't_drive', when: { any: [{ custom: 'onTally' }, { timer: 12, since: 't_anchor' }] }, after: 't_anchor', do: [
        { call: 'sync', args: { unlock: ['drive'], atLeast: 4 } }, { comms: 'c_drive' }, term('moth_drives'), hint('drive') ] },
    { id: 't_anchor', when: { flag: 'tally:anchored' }, do: [{ comms: 'c_anchor' }, term('boarding')] },
    { id: 't_crane', when: { custom: 'craneGrab' }, do: [{ comms: 'c_crane' }] },
    { id: 't_claw', when: { custom: 'rackHas', args: { part: 'crane_claw' } }, do: [{ comms: 'c_claw' }, term('crane_claw')] },
    { id: 't_hold', when: { any: [{ all: [{ health: { tag: 'mainmast', below: 0.6 } }, { custom: 'nearTally', args: { r: 200 } }] },
                                  { timer: 75, since: 't_anchor' }] }, after: 't_anchor', do: [{ event: 'holdShot' }] },
    { id: 't_mast_low', when: { health: { tag: 'mainmast', below: 0.25 } }, do: [{ comms: 'c_mast_low' }] },
    { id: 't_capsize', when: { killed: { tag: 'mainmast' } }, do: [{ event: 'capsize' }] },

    // ── Z6 · Skimmers, the broadcast ───────────────────────────────────────────────────────────────────────────
    { id: 't_hungry', when: { custom: 'hungryNear', args: { r: 150 } }, do: [{ comms: 'c_hungry' }, term('hungry')] },
    { id: 't_skates', when: { custom: 'rackHas', args: { part: 'skate_jets' } }, do: [{ comms: 'c_skates' }, term('skate_jets')] },
    { id: 't_sail', when: { custom: 'rackHas', args: { part: 'sail_rig' } }, do: [term('sail_rig')] },
    { id: 't_rivet', when: { custom: 'rackHas', args: { part: 'rivet_driver' } }, do: [{ comms: 'c_rivet' }, term('rivet_driver')] },
    { id: 't_skimmers_clear', when: { any: [{ cleared: 'e_skimmers' }, { custom: 'skimmersLeft' }] }, after: 't_capsize', do: [
        { music: { theme: ROAD } }, ...done('o_skimmers'), { comms: 'c_skimmers_clear' } ] },
    { id: 't_foreman', when: { custom: 'convoy', args: { gte: 7000 } }, after: 't_skimmers_clear', do: [
        { comms: 'c_foreman', wait: true },
        { if: { flag: 'bigMercySaved' }, then: [{ comms: 'c_foreman_after' }], else: [{ comms: 'c_foreman_after_lost' }] } ] },

    // ── Z7 · the Sundial ───────────────────────────────────────────────────────────────────────────────────────
    { id: 't_dial', when: { custom: 'convoy', args: { gte: 7650 } }, do: [{ comms: 'c_dial' }] },
    { id: 't_cacheB_spot', when: { all: [{ custom: 'convoy', args: { gte: 7700 } }, { not: { flag: 'cacheB' } }] }, do: [
        { comms: 'c_cacheB_spot' }, ...add('o_cacheB'), { call: 'flagCache', args: { id: 'cacheB' } } ] },
    { id: 't_cacheB_flag', when: { flag: 'cacheB' }, do: [{ comms: 'c_cacheB_flag' }] },
    { id: 't_camp', when: { custom: 'convoy', args: { gte: 8560 } }, do: [{ event: 'camp' }] },
    // the shade toggles: each arms the other, so a blend runs once per crossing of the stripe's edge
    { id: 't_shade_in', when: { custom: 'inShade' }, once: false, do: [{ art: ART_SHADE, blend: 2 }, { disable: 't_shade_in' }, { enable: 't_shade_out' }] },
    { id: 't_shade_out', when: { not: { custom: 'inShade' } }, enabled: false, once: false,
      do: [{ art: ART_BASE, blend: 2 }, { disable: 't_shade_out' }, { enable: 't_shade_in' }] },
    { id: 't_plaque', when: { flag: 'plaque' }, do: [
        { interstitial: [{ style: 'plaque', hold: 6, text: 'SUNDIAL GNOMON · RAISED IN THE FOURTH YEAR\n' +
          'WHEN THE SHADOW LIES ON THE ROAD STONE, WALK THE SHADOW NORTH.\nCARRY THEM HOME. SET THEM DOWN.' }] },
        { comms: 'c_plaque' }, term('founders') ] },
    { id: 't_bench', when: { objective: 'o_bench' }, do: [{ event: 'ending' }] },
  ],

  events: {
    mercy: [
      { call: 'convoy', args: { mode: 'circle' } }, { music: { stinger: 'boss' } },
      { call: 'tallySkyline', args: { show: false } }, { spawn: 'e_tally' },
      { cinematic: 'harpoonMercy' },                                    // during: the harpoons, c_harpoon
      { checkpoint: 'cp_flats' }, { music: { theme: TALLY } },
      { call: 'band', args: { centre: 'bigMercy' } }, { call: 'kite', args: { follow: 'bigMercy', h: 90, mark: 'mercyCable' } },
      { comms: 'c_mercy' }, term('tally', 'big_mercy'), ...add('o_cables'),
    ],
    mercyFree: [
      ...done('o_cables'), { flag: ['bigMercySaved', true] }, ...[1, 2, 3, 4].map(i => ({ flag: ['mercy' + i, true] })),
      { call: 'story', args: { bigMercy: 'saved' } },
      { comms: 'c_mercy_free', wait: true }, { call: 'tally', args: { anchor: true } },
      { waitFor: { flag: 'tally:anchored' } }, { checkpoint: 'cp_deck' }, ...add('o_mast'),
    ],
    mercyLost: [
      { objective: { fail: 'o_cables' } }, { flag: ['bigMercyLost', true] }, { call: 'convoy', args: { lose: 3 } },
      { call: 'story', args: { bigMercy: 'lost' } },
      { comms: 'c_mercy_lost', wait: true }, { call: 'tally', args: { anchor: true } },
      { waitFor: { flag: 'tally:anchored' } }, { checkpoint: 'cp_deck' }, ...add('o_mast'),
    ],
    holdShot: [
      { comms: 'c_sweeper', wait: true },
      { call: 'sync', args: { unlock: ['hold'], atLeast: 6 } },
      { call: 'tally', args: { sweeperShot: { lethal: true, telegraph: 1.5 } } },     // engine Hold fires on the hit (E1)
      { call: 'slowmo', args: { scale: 0.4, seconds: 1.2 } }, { comms: 'c_hold', wait: true },
      { wait: 2 }, { comms: 'c_hold_after' }, term('hold'), hint('hold'),
    ],
    capsize: [
      ...done('o_mast'), { music: { stinger: 'boss' } },
      { cinematic: 'capsize' },                                         // during: c_rusk_flee, Rusk's Skimmer, Moth moved clear
      { call: 'convoy', args: { mode: 'roll', reform: true } }, { call: 'band', args: { centre: 'convoy' } },
      { checkpoint: 'cp_road' }, { music: { theme: RAID } },
      { if: { flag: 'bigMercySaved' }, then: [{ comms: 'c_reform' }], else: [{ comms: 'c_reform_lost' }] },
      { spawn: 'e_skimmers' }, ...add('o_skimmers'), { comms: 'c_skimmers' }, term('skimmers', 'ghost'),
    ],
    camp: [
      { call: 'convoy', args: { mode: 'camp' } }, { music: { theme: NOON } },
      { comms: 'c_noon', wait: true }, ...done('o_escort'), ...add('o_camp', 'o_bench', 'o_plaque'),
      { call: 'plaqueInteract' },
    ],
    ending: [
      { player: { freeze: true } }, { cinematic: 'kiteWorld' },         // during: c_kite_world, the music box, fade
      { complete: true },
    ],
  },

  cinematics: {
    vista: { skippable: true, keys: [
      { t: 0, pos: { s: 380, l: 90, h: 22 }, look: { x: PED.x, z: PED.z, y: 420 }, fov: 34 },
      { t: 8, pos: { s: 470, l: 60, h: 14 }, look: { x: PED.x, z: PED.z, y: 380 }, fov: 30, ease: 'inOut' } ] },
    harpoonMercy: { skippable: false, follow: { tag: 'bigMercy' }, keys: [
      { t: 0, pos: { x: -40, z: 30, y: 6 }, look: { x: -120, z: 0, y: 8 }, fov: 48 },          // relative to Big Mercy (follow)
      { t: 8, pos: { x: 20, z: 60, y: 14 }, look: { x: -180, z: -40, y: 10 }, fov: 42, ease: 'inOut' } ],
      during: [ { call: 'tally', args: { harpoon: true } }, { comms: 'c_harpoon' }, { shake: 0.6 } ] },
    capsize: { skippable: false, follow: { tag: 'tally' }, keys: [
      { t: 0, pos: { x: 90, z: 140, y: 30 }, look: { x: 0, z: 0, y: 20 }, fov: 50 },
      { t: 7, pos: { x: 120, z: 170, y: 22 }, look: { x: -20, z: 0, y: 6 }, fov: 46, ease: 'inOut' } ],
      during: [ { call: 'tally', args: { capsize: true } }, { call: 'playerClear', args: { from: 'tally', dist: 60 } },
                { call: 'rusk', args: { flee: true } }, { wait: 2.5 }, { comms: 'c_rusk_flee' }, { shake: 1.2 } ] },
    kiteWorld: { skippable: false, keys: [
      { t: 0,  pos: { s: 8540, l: 60, h: 8 },  look: { s: 8580, l: 125, h: 8 }, fov: 44 },
      { t: 6,  pos: { s: 8550, l: 70, h: 10 }, look: { s: 8700, l: 160, h: 140 }, fov: 50, ease: 'inOut' },
      { t: 14, pos: { s: 8555, l: 72, h: 12 }, look: { s: 9200, l: 400, h: 600 }, fov: 56, ease: 'inOut' } ],
      during: [ { call: 'kite', args: { up: 'stripe', h: 600, seconds: 12 } }, { comms: 'c_kite_world', wait: true },
                { call: 'musicBox' }, { fade: 1, seconds: 3 } ] },
  },

  comms: {
    c_morning: [{ who: 'OMA', text: "Morning, girl. You haven't climbed down since the ice." }, { who: 'MOTH', text: 'She is resting.' },
                { who: 'JUNO', text: "I'm right here, Oma." }, { who: 'OMA', text: 'So you are.' }],
    c_roll: [{ who: 'OMA', text: "Wake's rolling. Ride the flanks. Anything that wants a rig goes through you." }, { who: 'JUNO', text: 'Copy.' }],
    c_hesper1: [{ who: 'HESPER', text: 'Compass Rose to all rigs. Sundial bears three-five-four. Hold your columns.' },
                { who: 'KIT', text: "Hesper says three-five-four like it's a song." }, { who: 'HESPER', text: 'It is a song, Kit. Learn it.' }],
    c_ration: [{ who: 'JUNO', text: 'Ration, Moth.' }, { who: 'MOTH', text: 'Dispensed.' }, { who: 'JUNO', text: 'Tastes like the last one.' },
               { who: 'MOTH', text: 'Noted. Query: is that good?' }, { who: 'JUNO', text: "It's consistent." }],
    c_still: [{ who: 'KIT', text: "Hesper says if we keep this pace we'll see the Still before I'm sixteen." },
              { who: 'JUNO', text: 'Hesper says a lot of things.' }, { who: 'KIT', text: "She said you'd say that." }],
    c_band: [{ who: 'OMA', text: 'Girl. Where are you going?' }],
    c_reeds: [{ who: 'KIT', text: "Reeds are moving. Left side, way out. That's not wind." }, { who: 'JUNO', text: 'Kite up. Everyone tighten up.' }],
    c_raid1: [{ who: 'KIT', text: 'SAILS! Three— no. Three. Three sails!' }, { who: 'JUNO', text: 'I see them. Stay behind Big Mercy, Kit.' }],
    // templates: the convoy code substitutes {rig} and plays them with ctx.comms.play
    c_hooked: [{ who: 'HESPER', text: "{rig}'s hooked! They're dragging her off the road!" }, { who: 'JUNO', text: 'On it.' }],
    c_freed_kit: [{ who: 'KIT', text: "{rig}'s LOOSE! She's coming back!" }],
    c_freed_hesper: [{ who: 'HESPER', text: "{rig}'s back in her column. Good." }],
    c_lost: [{ who: 'HESPER', text: "We've lost {rig}. Close up the column." }, { who: 'JUNO', text: '…Close up.' }],
    c_first_tear: [{ who: 'JUNO', text: "Oma'll want that." }],
    c_wave2: [{ who: 'KIT', text: 'Two more sails behind us! Right side!' }],
    c_raid1_clear: [{ who: 'KIT', text: 'Ha— hahaha. Okay. Okay so that was a LOT of sails.' }, { wait: 2 },
                    { who: 'MOTH', text: 'Query: Kit laughed while they were shooting at him. Why do people laugh when they are scared?' },
                    { who: 'JUNO', text: 'Ask me at camp.' }, { who: 'MOTH', text: 'Logged.' }],
    c_open1: [{ who: 'HESPER', text: 'Road\'s clear. All rigs, open her up.' }],
    c_open2: [{ who: 'HESPER', text: 'Clear. Open her up.' }],
    c_open3: [{ who: 'HESPER', text: 'Open road. Make up the time.' }],
    c_cacheA_spot: [{ who: 'KIT', text: 'Kite sees tank lids in the reeds. Left of the road, by a cairn. Full ones!' },
                    { who: 'JUNO', text: "I'll flag them if there's time." }],
    c_cacheA_flag: [{ who: 'KIT', text: 'Old paint on them. Lantern Line. Never heard of them.' }, { who: 'JUNO', text: 'They went dry. Years back.' },
                    { who: 'KIT', text: '…Oh.' }],
    c_watcher: [{ who: 'KIT', text: "Jun. Ridge, right side. There's a frame up there." }, { who: 'KIT', text: "It's got a light. A green one." },
                { wait: 2 }, { who: 'TALLOW', text: 'Hello hello.' }, { who: 'JUNO', text: 'Moth, who—' }, { who: 'MOTH', text: 'Interference.' }],
    c_watcher_gone: [{ who: 'KIT', text: "It's going. It didn't even shoot. Why didn't it shoot?" }, { who: 'JUNO', text: "Don't know. Eyes front." }],
    c_ruins: [{ who: 'HESPER', text: 'Turbine ruins ahead. Road runs right through. Keep it tight.' },
              { who: 'KIT', text: 'I hate the ruins. Things hide in the ruins.' }],
    c_rusk1: [{ who: 'RUSK', text: 'Every drop on Gaunt is tallied, hauler. Yours are overdue.' }],
    c_rusk_who: [{ who: 'KIT', text: "Who's THAT?" }, { who: 'OMA', text: 'Tallyman. Dredge water-officer. Keeps the books on everything they steal.' }],
    c_harpooner: [{ who: 'JUNO', text: 'Walkers in the ruins. Cable guns. Keep the rigs moving.' }],
    c_rusk2: [{ who: 'RUSK', text: "Your frame's handshake is loud. We can hear you from the Dredge." }],
    c_handshake: [{ who: 'JUNO', text: "What's a handshake?" }, { who: 'MOTH', text: 'A signal. I will try to be quieter.' }],
    c_rivet: [{ who: 'JUNO', text: 'Rivet gun. Heavy.' }],
    c_ruins_clear: [{ who: 'KIT', text: "That's the last walker! I think. Is it? It is. YES." }],
    c_sync: [{ who: 'MOTH', text: 'Juno. I have context now. I can anticipate you.' }, { who: 'JUNO', text: 'Meaning?' },
             { who: 'MOTH', text: 'Meaning when you need me, I will already be moving.' }],
    c_kite: [{ who: 'KIT', text: "Kite's up! Good news: I can see the Dredge. Bad news: I can see the Dredge." },
             { who: 'KIT', text: 'Wait. Something closer. Three masts, out on the flats.' }],
    c_tally_seen: [{ who: 'HESPER', text: "That's the Tally. The Tallyman's flagship." }, { who: 'JUNO', text: 'Stay with Big Mercy, Kit.' }],
    c_volley1: [{ who: 'KIT', text: 'Flashes on the masts— ROCKETS! Coming at YOU, Jun!' }, { who: 'MOTH', text: 'Second Sight. Watch the lines.' }],
    c_volley2: [{ who: 'MOTH', text: 'Again. Your turn.' }],
    c_volley_done: [{ who: 'KIT', text: "It's turning. It's coming. It's coming FAST." }],
    c_harpoon: [{ who: 'RUSK', text: 'Big Mercy. Four tanks, four souls, all overdue.' }, { who: 'ANSEL', text: 'Hm. Hm-hm-hmm.' }],
    c_mercy: [{ who: 'HESPER', text: "Big Mercy's hooked! Three cables! All rigs, stop and circle!" },
              { who: 'JUNO', text: "Big Mercy, keep your wheels straight. Don't watch the harpoons. Watch me." },
              { who: 'ANSEL', text: 'Hm-hm. Watching you.' }],
    c_cable1: [{ who: 'KIT', text: 'ONE! Two to go!' }],
    c_cable2: [{ who: 'KIT', text: "TWO! She's dragging slower!" }],
    c_deck_warn: [{ who: 'KIT', text: 'Get off the deck, Jun! The CABLES!' }],
    c_hum1: [{ who: 'ANSEL', text: 'Hm-hm-hmm. Hm. Hm-hm.' }],
    c_mercy_half: [{ who: 'HESPER', text: "Big Mercy's halfway to the edge of the flats. Juno." }],
    c_hum2: [{ who: 'ANSEL', text: 'HM-hm-hmm. Hm-HM.' }],
    c_mercy_free: [{ who: 'ANSEL', text: "…She's stopped. She's stopped. Thank you, frame. Thank you, Juno." },
                   { who: 'RUSK', text: "Spikes down! Bring her about! I'll collect from the frame instead." }],
    c_mercy_lost: [{ who: 'ANSEL', text: 'Hm-hm. Hm—', hold: 0.3 }, { wait: 1 }, { who: 'HESPER', text: "Big Mercy's over the edge. She's gone." },
                   { wait: 2 }, { who: 'RUSK', text: 'One tanker, paid in full. Now the frame.' }],
    c_anchor: [{ who: 'KIT', text: "It stopped! It's— it's TURNING. At you!" }, { who: 'JUNO', text: 'Good. Now it holds still.' }],
    c_drive: [{ who: 'MOTH', text: 'Let me drive. You shoot.' }, { who: 'JUNO', text: 'Since when do you drive?' }, { who: 'MOTH', text: 'Since now.' }],
    c_crane: [{ who: 'KIT', text: "The crane! It's grabbing for you!" }],
    c_claw: [{ who: 'JUNO', text: 'Their claw. Oma can use that.' }],
    c_sweeper: [{ who: 'RUSK', text: 'Hold still, hauler. Let me balance the books.' }],
    c_hold: [{ who: 'MOTH', text: 'Hold on to me.' }],
    c_hold_after: [{ who: 'JUNO', text: 'You said that under the ice.' }, { who: 'MOTH', text: 'I did.' }],
    c_mast_low: [{ who: 'KIT', text: "The mast's going, the whole mast is GOING—" }],
    c_rusk_flee: [{ who: 'RUSK', text: 'This goes on your tally, hauler!' }, { who: 'KIT', text: "He's running! On a sled thing! A hover sled!" }],
    c_reform: [{ who: 'HESPER', text: 'All rigs, back in columns. Big Mercy, take your place.' }, { who: 'ANSEL', text: 'Hm. Taking it.' }],
    c_reform_lost: [{ who: 'HESPER', text: 'All rigs, back in columns. Close the gap where Big Mercy was.' }],
    c_skimmers: [{ who: 'KIT', text: 'Sleds! Four— no, FOUR. Fast ones. Green lights.' }, { who: 'JUNO', text: "Don't look at the lights." }],
    c_hungry: [{ who: 'MOTH', text: 'That one is hungry. It will need room.' }, { who: 'JUNO', text: 'Room?' },
               { who: 'MOTH', text: 'In me. I will show you at the Bench.' }],
    c_skates: [{ who: 'KIT', text: 'You took its LEGS. Jun took its legs!' }],
    c_skimmers_clear: [{ who: 'HESPER', text: "Road's clear to the Sundial. Open her up." }, { who: 'KIT', text: 'We made it. We basically made it.' }],
    c_foreman: [{ who: 'FOREMAN', text: 'Do you know what a day costs on Gaunt, little rig? Ten years of walking. Nobody gets to sit down.' },
                { wait: 2 }, { who: 'FOREMAN', text: 'Work is the only prayer that gets answered.' },
                { wait: 2 }, { who: 'FOREMAN', text: 'The Still is ice and bones. Turn around and work.' },
                { wait: 1.5 }, { who: 'OMA', text: 'Turn that off.' }, { who: 'KIT', text: "Can't. It's on every channel." }],
    c_foreman_after: [{ who: 'ANSEL', text: 'Hm-hm-hmm. Hm-hm. HM-hm-hmm.' }, { who: 'KIT', text: "Ansel's humming over him. Everybody HUM." }],
    c_foreman_after_lost: [{ wait: 3 }, { who: 'JUNO', text: 'Drive louder, then.' }],
    c_dial: [{ who: 'HESPER', text: 'Dial ring. All rigs, ease down. We camp in the shadow.' },
             { who: 'KIT', text: "It's SO big. You can't see the top. Can you see the top?" },
             { who: 'MOTH', text: 'Yes. There is a plaque at the top. It is too far to read.' }],
    c_cacheB_spot: [{ who: 'KIT', text: 'More tanks! Under the stone, right side!' }],
    c_cacheB_flag: [{ who: 'KIT', text: 'That\'s TWO caches. Oma\'s going to say "hm."' }],
    c_noon: [{ who: 'HESPER', text: "Shadow's laid along the north road. Sundial noon, Day Four." },
             { who: 'OMA', text: 'Rigs in, wheels chocked. Bring the frame to the Bench, girl.' }],
    c_plaque: [{ who: 'MOTH', text: 'That phrase again. The same as the ship in the ice.' }, { who: 'JUNO', text: 'Founders wrote it on everything.' }],
    c_kite_world: [{ who: 'KIT', text: 'Watch this. Straight up the shadow. Up, up, up—' }, { who: 'KIT', text: 'I can see the whole WORLD!' },
                   { who: 'MOTH', text: 'Logged.' }, { wait: 1.5 }, { who: 'JUNO', text: '…Good kite.' }],
  },

  collectibles: [
    { id: 'cacheS1', kind: 'salvage', at: { s: 4250, l: -380 }, unlocks: 'sail_rig', label: 'Wrecked yacht' },
  ],

  start: [
    { call: 'vitals', args: { mode: 'locked', bpm: 60 } },
    { call: 'convoy', args: { start: true, s: 450, mode: 'roll' } },
    { call: 'tick', args: { flank: 'player' } }, { call: 'kite', args: { follow: 'tick', h: 85 } },
    { call: 'hudPanels', args: { rack: true, sync: false } }, { call: 'tracker', args: { on: true } },
    { cinematic: 'vista' },
    { wait: 1.0 }, { comms: 'c_morning', wait: true },
    { wait: 2 }, { comms: 'c_roll' }, ...add('o_escort'), term('convoy', 'wake', 'rigs', 'bench', 'water'), hint('band'),
  ],

  onCheckpoint: {
    cp_reeds: [ { call: 'restoreCommon', args: { cp: 'cp_reeds' } }, { music: { theme: ROAD } } ],
    cp_ruins: [ { call: 'restoreCommon', args: { cp: 'cp_ruins' } }, { music: { theme: RAID } }, ...add('o_ruins') ],
    cp_flats: [ { call: 'restoreCommon', args: { cp: 'cp_flats' } }, { call: 'tally', args: { restore: 'drag' } },
                { call: 'band', args: { centre: 'bigMercy' } }, { music: { theme: TALLY } }, ...add('o_cables') ],
    cp_deck:  [ { call: 'restoreCommon', args: { cp: 'cp_deck' } }, { call: 'tally', args: { restore: 'anchored' } },
                { call: 'playerTo', args: { tally: 'port', dist: 70 } }, { music: { theme: TALLY } }, ...add('o_mast') ],
    cp_road:  [ { call: 'restoreCommon', args: { cp: 'cp_road' } }, { call: 'tally', args: { restore: 'wreck' } },
                { music: { theme: RAID } }, ...add('o_skimmers') ],
  },

  custom: { install: (ctx, mission) => installLevel02(ctx, mission, DATA, { zones: ZONES }) },
};
```

**Custom actions** registered by `levels/level02/index.js`: `convoy` (start, mode `roll`/`circle`/`camp`, `reform`, `lose`, restore), `band` (centre, radius), `tracker`, `term`, `sync` (enable, unlock, fill, atLeast, free; all through `ctx.sync?.`), `hudPanels`, `vitals`, `tick`, `kite`, `watcher`, `tallySkyline`, `volley`, `tally` (harpoon, anchor, sweeperShot, capsize, restore), `rusk`, `slowmo`, `playerClear`, `playerTo`, `flagCache`, `plaqueInteract`, `story` (writes the mission flag `campaign:story`), `musicBox`, `restoreCommon` (re-applies the convoy from flags, Tick, kite, HUD panels, vitals, the Sync panel and the explain queue).

**Custom conditions:** `convoy` (centre s), `bandDist`, `brokeCover`, `waveStarted`, `tearAvailable`, `rackCount`, `rackHas`, `tearsThisLevel`, `enemyWithin`, `unitOut`, `watcherGone`, `volleyLanded`, `onTally`, `tallyPhase`, `nearTally`, `mercyProgress`, `craneGrab`, `hungryNear`, `skimmersLeft`, `inShade`.

**Custom files** under `levels/level02/`: `index.js` (install, actions, conditions, systems), `convoy.js` (formation, speeds, band, harpoons, circle, camp), `rigs.js` (rig models), `units.js` (`land_yacht`, `harpooner`, `skimmer`), `tally.js`, `actors.js` (the Watcher, Rusk's Skimmer, and Tick and the kite if L1's can't be reused), `reeds.js`, `sundial.js` (structure, skyline, shadow stripe), `structures.js` (§12), `skyline.js` (far sails, the *Tally* on the horizon), `terms.js` (cards and the queue).

**Campaign data** in `levels/campaign.js` (`legs.l02`, the M1 fragment, Calls, speakers) is specified in addendum 02 §B4. The mission flags the engine reads at level end: `cv:lost` (rigs lost on the road) and `campaign:story` (`{ bigMercy }`).

---

## 18. Spoiler and clue checklist

### 18.1 Player-facing text that exists before it's reached

| Text | Where | Safe? |
| --- | --- | --- |
| `THE WAKE` / `The Morning Steppe` | Level select, briefing | Yes (a public level name). |
| The briefing body | Briefing | Yes: a road order. Names the Sundial and Big Mercy, nothing else. |
| Zone cards and checkpoint labels | On arrival | Place names only. `THE TALLY'S DECK` appears only after the *Tally* is named in play. |
| Objective texts | Added when reached | Yes. |
| Explain cards | When requested | Checked against §5.2's rules. No card mentions the lattice, kernel, Cantors, what fragments are, or why the Watcher's voice has no static. |
| Bench 2 lines and cards (`levels/campaign.js`) | In memory from Bench 1 on (the file is loaded whole), displayed only at Bench 2 | Not shown before Bench 2. No true titles or card texts in the file (glosses only, including M1's). |
| Debrief | After the level | Stats only. |

### 18.2 Clues placed in this level

| Clue | Beat | Innocent reading | Truth |
| --- | --- | --- | --- |
| *"You haven't climbed down since the ice."* / *"She is resting."* / *"So you are."* | 2 | Oma fussing; Moth being literal | Nobody in the seat to climb down; Oma knows |
| *"Ration, Moth."* / *"Dispensed."* / *"Tastes like the last one."* | 3 | Cockpit rations | There is no dispenser (Bench 6) |
| The Watcher on the ridge, never firing; *"Hello hello."* on LOCAL with no static; *"Interference."* | 6 | A creepy ghost frame, bad radio | Tallow, mind to mind (§5.4 bible) |
| *Lantern Line* paint on cache A; *"They went dry. Years back."* | 6 | A dead convoy's leftovers | Tallow's convoy (L4, L8) |
| *"Your frame's handshake is loud. We can hear you from the Dredge."* / *"A signal. I will try to be quieter."* | 7 | Machine jargon | Only minds have handshakes |
| *"I have context now. I can anticipate you."* | 8 | Machine learning | Moth knows her from the inside |
| The second *"Hold on to me."*; *"You said that under the ice."* / *"I did."* | 12 | Reassurance; a callback | The words it said as it carried her |
| *"That one is hungry. It will need room."* / *"In me."* | 14 | Machine capacity | The room is her memory |
| The Foreman: V2, V3, V5 (verbatim) | 15 | A tyrant's broadcast | He is looping (L7) |
| Moth reads the plaque's creed: *"That phrase again."* | 17 (optional) | An old machine recognising a mark | What Cantors are for |
| M1 logged with `WARMTH, CHEST` (Bench 2 gloss) | Bench 2 | A sensor tag | A feeling only a person has |
| Moth's *"Why do people laugh when they are scared?"* | 5 | Curiosity | Becoming a person by watching her |

### 18.3 Rules checked

- Juno is never called ghost, dead, pressed, carried, passenger or body (bible §5.5). She never eats, sleeps or climbs out except through *"Dispensed."* and *"She is resting."*
- Moth tells no lie in this level or at Bench 2. Every Moth line about Juno or the fragments is true or an evasion (*"She is resting."*, *"Interference."*, *"It is the least important."* by its own ranking, *"In me."*).
- Moth never says "I think" (first in L3) and never uses a contraction.
- Only Moth, Juno and the Watcher speak on LOCAL. Rusk is on DREDGE, the Foreman on OPEN, everyone else on WAKE.
- Kit and Juno never meet face to face: Kit is in Tick or on the radio, and at camp the kite scene is shot from the frame's side with Tick's canvas hood up.
- No human models: rig cabs have canvas screens or dark glass; the *Tally*'s crew stays behind slit windows; Rusk's Skimmer cab is tinted; Big Mercy's four people are a humming voice.
- The Foreman's lines are copied from bible §12.1, verbatim. He says "little rig" and nothing about Juno's state.
- No UI string names Tallow, Tam, Pell or the Press.

---

## 19. Test notes for `tools/scenarios/level02.mjs`

Run from `/home/user/zorllg/campaign`: `node tools/playtest.mjs --scenario level02 --port <8702 to 8704> --out /tmp/campaign-playtest/L2-level02`. Drive with `step()`, render only for screenshots, and open every screenshot. Every engine-dependent assert is feature-detected: it is skipped with a `SKIP (engine: E<n>)` note when the item is missing, never failed.

1. `validateLevel(level02)` returns `[]`; `levels/index.js` lists `l02` after `l01`; `level01.js` unlocks `l02`.
2. **From `cp_lip`:** the convoy has 40 rigs in formation at s 450; step 10 s: the convoy centre has advanced 90 ± 9 m (roll) or 120 ± 12 m (open); `c_morning` and `c_roll` played; cards `convoy`, `sundial` requested by the time convoy s ≥ 700; vitals `locked` at 60.
3. **The band:** teleport the player 650 m from the convoy: the tracker (if E5) shows `TOO FAR` and `c_band` plays once; teleport 750 m out during a forced hook and step 31 s: the hooked rig is lost and `cv:lost` contains its id.
4. **Raid 1:** set convoy s to 1,350: `e_raid1` spawns with masts down and `targetable: false`; reed pushers are registered; a yacht breaks cover within 220 m of the convoy; the hooker hooks *Brass Mule* within 30 s; kill its cable target: the rig rejoins its slot within 20 s and `c_freed_*` plays; kill all: `cp_reeds` saved; the TEAR fail-safe spawns only when no TEAR happened.
5. **Lost rig path:** force a hook and step 25.5 s: the rig is lost, `c_lost` names it, the `rig_lost` card is requested, the rig despawns by 600 m.
6. **The Watcher:** convoy s 2,850: the actor appears on the shelf with a ghost beacon; `c_watcher` plays with the TALLOW speaker on LOCAL (no static, empty label); move the player within 250 m: it leaves at once and `c_watcher_gone` plays. It never fires and can't be locked.
7. **From `cp_ruins`:** 3 harpooners and 2 yachts; harpooners stay in cover until the convoy's front passes; each hooks its rig; wave 1 at 2 left plays `c_rusk2` then `c_handshake`; kill all: `c_ruins_clear`.
8. **Sync** (E1): after the ruins, `ctx.sync.enabled` is true with capacity 12 and fill 3; volley 1 starts Second Sight free (fill still 3, `ctx.timeScale` 0.7 during it); volley 2 tops fill to ≥ 3; `volleyDone` set after both land; rockets never damage rigs.
9. **From `cp_flats`:** the *Tally* is hooked to Big Mercy with 3 cable targets; step 10 s: Big Mercy has moved 45 ± 5 m along the lane; kill one cable: the drag slows to 3.4 m/s; land the player on the deck: within 1.5 s the player is knocked off and `c_deck_warn` plays; kill all cables: `mercyFree`, flags `mercy1..4` true, the *Tally* anchors within 15 s, `cp_deck` saved. **Loss path:** from `cp_flats`, step 160 s with no cuts: `mercyLost`, `cv:lost` contains 3, phase 2 still starts.
10. **From `cp_deck`:** `c_drive` fires on landing on the deck; Moth Drives (E3) runs 8 s without walking the player off the deck (assert the player's support is the *Tally* throughout); a crane grab holds 2.5 s and a quick boost breaks it; drop the mast below 60% within 200 m: `holdShot` runs, the player survives with AP 1 (E1; without it AP > 0 after a 2,500 hit), `c_hold` then `c_hold_after` play, the `hold` card is requested.
11. **Capsize and `cp_road`:** kill the mast: `capsize` runs, the wreck stays, Rusk's Skimmer leaves, the convoy re-forms, `e_skimmers` spawns; Skimmer glints are hungry-coloured (E8); `c_hungry` within 150 m; kill or wait out: `c_skimmers_clear`.
12. **The broadcast and the Sundial:** convoy s 7,000: `c_foreman` (chime) with V2, V3 and V5 character-for-character equal to bible §12.1; then the saved or lost variant. Convoy s 8,560: rigs park inside the shadow-stripe polygon (assert every parked rig's position is inside it); `inShade` blends `ART_SHADE`; reach the Bench: `kiteWorld` plays and the level completes.
13. **Level result:** water `= 4 (if saved) + caches flagged`, `waterMax` 6; with E10, campaign state gains `lost` (in-level), `story.bigMercy`, `fragments.M1 = 'intact'` and `sync.unlocked`.
14. **Bench 2** (E11): with a pending haul of Sail-Rig, Rivet Driver, Crane-Claw and no Skate-Jets: the gift adds them and plays `gift`; WALK ON is disabled until they're fitted; fitting them opens the picker with only F01 selectable; clicking F05 plays `locked`; confirming sets `F01: 'overwritten'`, `bound: ['skate_jets']`, Sync capacity 12 (13 − 1); `walkOn()` commits; the Count shows Day 4 with the right water and the lost names.
15. **Clarity asserts:** every card id requested exists in `terms.js`; every new speaker's first line carries its tag; no comms line before `c_still` contains "the Still"; no line before `c_hesper1` contains "Sundial" except the briefing; every objective text names a place or a target (has a marker).
16. **Spoiler grep** over every string in `levels/level02.js`, `levels/level02/*.js` and `legs.l02` in `levels/campaign.js`: none of `dead`, `ghost`, `pressed`, `carried`, `passenger`, `body` appears in a line spoken about or to Juno; no "I think" in any MOTH line; no contraction in any MOTH line; no `Tallow`, `Tam`, `Pell`, `Press` in any string shown to the player.
17. **Determinism:** replay 600 steps from `cp_flats` twice: the *Tally*'s and Big Mercy's positions match.
18. **Screenshots** (AD §8.5 per level, High and Low): the vista; the gameplay camera at the start (sun behind right); facing the sun; a free camera 80 m up along the route; 2 m from a turbine ruin and a dial stone (bevel check); each zone's entry; a stalking yacht's reed wake; the Watcher on the ridge; the ruins fight with a hooked rig; Second Sight's path lines; the *Tally* dragging Big Mercy; the deck fight; the capsize; the Skimmers; the camp in the shadow stripe with the blade overhead; the kite going up the stripe. Check budgets during the drag (§6.1) on High and Low.
19. **Regression:** `smoke`, `contract` and `level01` still pass.
