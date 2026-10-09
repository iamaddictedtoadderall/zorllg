# Level 1: THAW (The Rime Shelf)

> **SPOILERS. BUILD TEAM ONLY.** This document contains the Level 1 story beats, the first twist and its clues. Nothing in it may appear outside the game. Player-facing text (briefing, cards, objectives, hints, comms) is quoted here exactly as it ships and may appear in the game only at the moment this document places it.

Version 1.0. Written by the lead level designer for P6 (Level 1), with requests to P1, P3, P4 and P5.

**Sources, in canon order:** `docs/SPOILERS-story-bible.md` (story, cast, beats, Bench, style guide), then this file, then `docs/architecture.md` (engine contract and level format). Where this file adds to the bible, the additions are listed in §1.3 so the story team can veto them. Where this file needs something the engine doesn't have yet, it is listed in §16 with a fallback.

---

## Contents

1. Summary, role and mood
2. Map
3. Beat sheet (the level in order)
4. Tutorialization
5. Encounters
6. The Icebreaker (boss)
7. The signature set piece: sunrise, drowning, floe sprint
8. The two gameplay twists, as rules
9. Checkpoints
10. Script: briefing, cards, comms, objectives, hints, HUD text
11. New enemies and actors
12. New mechanics introduced in this level
13. The Bench, version 1 (after Level 1)
14. Pacing
15. Art, light, audio and music by zone
16. Engine requests (additive) and fallbacks
17. Level definition draft (`levels/level01.js`)
18. Spoiler and clue checklist
19. Test notes for `tools/scenarios/level01.mjs`

---

## 1. Summary, role and mood

### 1.1 Role in the campaign

Level 1 is the hinge of the whole story. In about 22 minutes it has to:

1. **Introduce Juno, Kit and the Wake through work, not exposition.** We meet Juno cutting ice in a small, weak machine, and Kit flying a kite. We learn what water costs from the fact that she risks her life for three blocks of it.
2. **Give the player Moth.** The frame wakes empty and dark and comes online one system at a time. Each "remembered" system is a control the player learns. By the end the player owns a complete war machine and loves it.
3. **Kill Juno without the player knowing.** The drowning must play as a narrow escape. Every clue placed here (the empty lattice on boot, the flatline, 60 bpm forever, "Releasing ballast", the Foreman's first words) needs an innocent reading on first play and an unbearable one on replay.
4. **Seed the promise.** The player must see a ghost before Juno begs not to become one. The Sexton (§11.4) is that ghost.
5. **Set up the economy.** TEAR, the Haul rack, sledges for water, and the Bench afterwards.

### 1.2 Mood and what the player should feel

The level runs from cold, dark and small to gold, vast and warm, with one drop into black in between. The light is the emotional score: starlight and aurora for most of it, a blue pre-dawn hour for the boss, and then the sunrise wall.

| Stage | Zone | Light | The player should feel |
| --- | --- | --- | --- |
| The cut | Z1 | Starlight, aurora, warm work lamps | Small, cold, competent. A routine chore with a kid brother joking overhead. Then sudden helplessness: you can't fight back. |
| Under the ice | Z2 | Blue ice-glow, darkness, one warm open hatch | Fear, then awe. Something enormous wakes around you. Tension in the walk-only crawl. |
| The Teeth | Z3 | Starlight, Kit's red flare, green Gleaner lights | Power arriving piece by piece. The first time the machine fights back is a thrill. Then a chill at the Gleaners and what they're for. |
| The Abeyance | Z4 | Sodium work lamps, a green blinking ghost light, moonlit hull interior | Dread (the ghost frame, the drums), then a quiet, eerie climb and a mystery: the frame knows this place. |
| The cut-line | Z5 | Blue pre-dawn, sodium floodlights, steam | Scale and defiance. A machine the size of a building is eating the ice you came for. You are finally strong enough to stop it. |
| The drowning | Z5 | Black-green water, then nothing | Panic, then a horrible calm. Then relief so big the player doesn't question it. |
| The floes | Z6 | Low red-gold sun, long blue shadows | Exhilaration and urgency. The world is beautiful and falling apart under your feet. |
| The shore | Z7 | Gold sun, warm tungsten, Kit's flares | Safety, warmth, home, and one strange moment that doesn't fit. A gentle laugh at the name. |

### 1.3 Additions to canon made by this document (story team: veto here)

| # | Addition | Why |
| --- | --- | --- |
| A1 | **The Sexton**, a Dredge ghost war-frame (Bastion pattern, green cab light) that keeps the Gleaner roost in the Abeyance's hold. A short mini-boss. | The architecture's P6 acceptance needs one named mech fight. More importantly, the player sees a ghost and hears Juno say *"Ghost. Don't look at the light."* ten minutes before *"Don't let me end up one of his ghosts."* |
| A2 | The Gleaners' roost is the Abeyance's hold, full of sealed body-drums, directly beneath the Founders' stencil *CARRY THEM HOME. SET THEM DOWN.* | Puts the Dredge's harvest and the Cantor creed in one vertical shot. |
| A3 | **Juno's drowning line opens with "Hey— hey. Listen." instead of "Moth— Moth, listen."** | The bible's beat 11 has Juno use the name Moth before Kit gives it in beat 15. Please update the bible. |
| A4 | Juno has Kit burn the skiff wrecks (with their dead crews) so the Gleaners can't take them. | Shows the Wake's Turnback ethic, unexplained, and extends it to enemies. |
| A5 | After the drowning, every Gleaner in range hunts Moth and tries to latch on. Kit: *"Why are the Gleaners all coming at YOU?"* Juno: *"I'm the biggest thing out here."* At the shore, Gleaners hover at a distance and watch Moth kneel at the hole, then leave just before the Foreman speaks. | A mechanical clue with an innocent reading: Dredge gear hears lattice handshakes (bible §3.4), and Gleaners collect the dead. |
| A6 | Moth's first "I" after the drowning is *"I am here."* (answering Juno's *"You with me?"* during the floe sprint). Before the drowning Moth never says "I", "me" or "my". | Makes the bible's pronoun rule audible. |
| A7 | The Icebreaker is ghost-run and its PA loops a work chant: *"Cut and haul. Cut and haul. Shift's not over."*, glitching once to *"Cut and— cut and haul."* | Plants the idea that ghosts loop, long before the Foreman's loops matter. Optional; cut it if it competes with V1. |
| A8 | Moth's designation on boot is CANTOR 7, and Moth says *"Cantor 7. Nothing else is stored."* Juno: *"That's a number, not a name."* | Sets up Kit naming it, and pays off at Carrow (L5, *"That is my number."*). |
| A9 | Three named sledges: Juno's own, *Hardtack*'s (rig 16) and *Lark's Rest*'s (rig 15). | Gives the bible's "sledges 0 to 3" a place in the level. |
| A10 | Juno's line *"Water first. Then we argue about what you are."* is placed after the first fight, answering Moth's *"Query: what is this frame for?"* | The bible needs this line in L1 for the L7 callback but gives it no beat. |

Two small conflicts inside the bible, resolved here:
- **"I think" (bible §4) first appears in L3, but lie #2 at Bench 1 contains "I think".** Keep lie #2 verbatim. Moth's first "I think" is a lie, and its first "me" is *"Hold on to me."* That is a feature. Treat lie #2 as the single exception.
- **Stock parts and the Locker (bible §7.8).** The bible sends a replaced part to the Locker. Here, replaced *stock* parts hang on the Bench wall and never use Locker space, so a full Locker can't trap a stock part. Hauled parts follow the bible.
- **Cantor Wings "2 quick-boost charges" (bible §7.4).** The engine ports the prototype, where quick boost is limited by EN only. Level 1 keeps prototype behaviour. Charges are a decision for P4 and the story team before L2 (the Sail-Rig references them).

### 1.4 At a glance

| | |
| --- | --- |
| Public title / subtitle | **THAW** / *The Rime Shelf* |
| Route length | 3,334 m along the spline; 2.9 km straight-line west to east |
| Corridor | Half-width 300 to 450 m (0.6 to 0.9 km wide) |
| Zones | 7: The Cut, Under the Ice, The Teeth, The Abeyance, The Cut-line, The Floes, The Shore |
| Checkpoints | 7 (start plus 6) |
| First-time play | 21 to 25 minutes (target 23:40). Skilled replay: about 15 minutes. |
| Unit kinds | `skiff`, `gleaner`, `gleaner_carrier`, `mech` (the Sexton), `icebreaker`, `turret` |
| New mechanics | Cutter (proxy vehicle), "remembered" ability gating, TEAR and the Haul rack, sledge flagging, pilot vitals, water and swimming, rotting floes, the sunrise wall |
| Haul available | Gaff Harpoon (skiff Gaffers), Sleet Gun (skiff Sleets), Flare Pod (Gleaner carriers), plus 2 caches |
| Water available | 3 sledges (1 tank each), typically 2 recovered |

---

## 2. Map

### 2.1 Frame of reference

- Engine axes (architecture §1.3): +X east, −Z north, +Y up. Route coordinates `s` (metres along the route) and `l` (metres right of travel; on this west-to-east route, **negative `l` is north**).
- **Sea level is y = −24.** The shelf ice surface sits around y = 0 (±5). The sea plane is a level-owned mesh at y = −24 (§12.6).
- **Floe tops are y = −21.6** (2.4 m freeboard). Raft floes have 3 m freeboard (top y = −21). The seabed under the open water is y = −70.
- The cavern floor (Z2) is y = −18, 6 m above sea level.
- Bounds use the architecture default (route bounding box plus 450 + 1,500 m), roughly x −3,370 to +3,430 and z −2,100 to +2,360. The Thornback ridge sits inside the bounds at x ≈ 2,800.

### 2.2 Overall shape

A long west-to-east strip of frozen sea. The west end touches the Dark (a wall of ice fog), and the east end is the shore where the Wake is camped under the Thornback ridge. The route snakes through the shelf: a bay, a buried cavern, a maze of pressure ridges, an apron around a frozen freighter, an open field ending at a sawn ice cliff, then open water full of drifting floes, then shore ice and a gravel beach.

```
 NORTH (−z) ↑                                                      dawn rim on the eastern horizon →   THORNBACK (x≈2800, crest +130)
                                                                                                         ▲▲▲▲▲▲▲▲  (sun rises here)
  z=-200 ·······················································································································
                          shaft                       ┌──ABEYANCE (140 m tall)
  z=-100 ·  ░░░(dark)    ●──────╮       pass   apron  █   field          ║ shelf │ raft    floes        hole ◎  ═ fast ice ═ beach ▒▒ WAKE
          bay          cavern   ╰─╮   ╭───╮  ●──●───█───●────────────── ║ edge  │≈≈≈≈≈≈  ≈◇≈≈◇≈≈≈≈◇≈≈≈╭─●─────●═════(Bench)  ▒▒ rigs
  z=0   ··●──●──╮   (under ice)   ╰╮ ╭╯   ╰──╯  Sexton    Icebreaker path ║ cliff │≈≈≈≈≈≈  ≈≈◇≈≈≈◇≈≈≈◇≈╯        ▒▒
          start  ╰─●bridge         ╰─╯ Kit pinned    Gleaner wrecks    ↕ along the edge   ≈≈◇≈≈◇≈≈≈◇≈ (sled 3)
  z=+100 ·        cut site            ●(s 900)  ●(s 1140)                                 ≈≈≈◇≈≈◇≈≈╯
  z=+200 ·······················································································································
          x=-1420     x=-1100      x=-820     x=-600    x=-380    x=-50   x=+90        x=+640  x=+890        x=+1310 x=+1480
          |──Z1 0–320──|──Z2 320–640──|──────Z3 640–1350──────|──Z4 1350–1700──|──Z5 1700–2500──|───Z6 2500–3130───|─Z7─|
  ● route control point · ◇ berg (shade caster) · ≈ open water with floes · █ hull · ═ fast ice · ▒ beach and rigs
```

### 2.3 Route control points

The route is a centripetal Catmull-Rom spline (architecture §4.2). The `s` values below were computed from these exact points.

| # | x, z | s | Half-width | Notes |
| --- | --- | --- | --- | --- |
| P0 | −1420, 20 | 0 | 300 | Start, west edge of the cut |
| P1 | −1280, 60 | 146 | 300 | Cut-site bay |
| P2 | −1130, 40 | 298 | 300 | East gully, snow bridge at s 322 |
| P3 | −985, −25 | 457 | 300 | Cavern |
| P4 | −850, −70 | 600 | 320 | Shaft at s 625 |
| P5 | −720, −40 | 735 | 360 | The Teeth, west |
| P6 | −610, 60 | 884 | 400 | Kit pinned (Tick at s 900, l +70) |
| P7 | −480, 130 | 1034 | 420 | The Teeth, middle |
| P8 | −340, 90 | 1182 | 420 | Gleaner wrecks (s 1130 to 1160) |
| P9 | −230, −20 | 1338 | 380 | The pass that frames the Abeyance |
| P10 | −120, −90 | 1470 | 380 | Apron (Sexton duel) |
| P11 | −10, −40 | 1592 | 380 | East of the hull |
| P12 | 90, 0 | 1700 | 420 | Field start |
| P13 | 200, 0 | 1811 | 450 | Cut-line field |
| P14 | 330, 10 | 1941 | 450 | |
| P15 | 560, −10 | 2172 | 450 | Shelf edge at x ≈ 640 (s ≈ 2250) |
| P16 | 790, 0 | 2402 | 450 | The Raft |
| P17 | 920, 20 | 2535 | 420 | Floes start |
| P18 | 1010, 140 | 2687 | 400 | |
| P19 | 1120, 190 | 2810 | 400 | |
| P20 | 1230, 90 | 2962 | 380 | |
| P21 | 1300, −50 | 3119 | 360 | Fast ice from s 3130 |
| P22 | 1380, −100 | 3216 | 320 | Hole in the shore ice at s 3185, l −20 |
| P23 | 1440, −60 | 3289 | 300 | The Bench's cradle |
| P24 | 1480, −40 | 3334 | 300 | End |

Useful resolved points (world x, z): s 322 → (−1107, 32); s 625 → (−825, −70); s 900 → (−597, 69); s 1140 → (−377, 109); s 1440 → (−149, −82); s 1545 → (−51, −63), route heading 122°; s 1700 → (90, 0); s 2250 → (638, −10); s 2500 → (887, 8); s 3130 → (1307, −58); s 3185, l −20 → (1341, −109); s 3300, l +30 → (1436, −28).

### 2.4 Terrain model

The heightfield (architecture §5.3) builds the shelf. Gameplay walls are always **structures with colliders**, never terrain slopes, because the player walks up any terrain slope.

- **Base:** almost flat sea ice. `scale 600, amp 5, octaves 4, ridged 0.3, warp 60, terrace { step 2.5, strength 0.4 }`. The terraces read as rafted shelf plates.
- **Detail:** `scale 14, amp 0.5`, so the ice is smooth at boot scale.
- **Corridor walls:** `height 40, start 0.82, noise 0.6`. These read as pack-ice belts at the edge of the play area, not canyon walls.
- **Carve:** shallow (`depth 0.5, bedWidth 90, shoulder 60, smooth 200, maxGrade 0.06, strength 0.6`). On ice the route bed should barely show.
- **Erosion:** light (`droplets 30,000, thermal 1`). Flow channels colour as wind-polished black-ice lanes.
- **Features:** pressure-ridge bases in the Teeth and around the bay (`ridge`, h 8 to 22); the Thornback (`ridge` from (2650, −1500) to (2900, 1400), r 450, h 130).
- **Stamps** (full list in §17): flatten the cut-site bay (h 0); a chain of flatten stamps at h −18 along s 330 to 640 for the cavern trench; a raised rim (+16) around the shaft mouth; flatten the apron (h 0) and the field (h 0); flatten the open water to the seabed (h −70) from x 660 to x 1290 for |l| < 0.8 × half-width; flatten the fast ice at h −21 (x 1290 to 1370); a stepped ramp up the beach (h −15, −9, −3, +3).

### 2.5 Landmarks that pull the player forward

| Landmark | Where | First visible from | What it does |
| --- | --- | --- | --- |
| **The *Abeyance*** (hero) | s 1545, 140 m tall | The opening vista and the whole cut site | A black needle against the red dawn rim. Green dots circle its top (Gleaners). It's the "where are we going" of the first half. |
| **The dawn rim** | Eastern horizon, azimuth 60° to 130° | Everywhere | A thin red line that slowly widens. The level's clock. |
| **The Wake's lights** | The shore, x 1,350 to 2,100 | Vista, the cut site, the *Abeyance* crown | A string of warm tungsten points at the far east: home. |
| **The Thornback** | x ≈ 2,800, crest +130 | Everywhere east-facing | A serrated black ridge. The sun rises behind it. |
| **Kit's kite** | 60 to 120 m above Tick or Moth | Z1, Z3, Z5 | A pale diamond with a red light and a 12 m ribbon tail. Kit's presence in the sky. |
| **Kit's red flare** | s 900, l +70, bursts at 180 m | Exiting the shaft | Says "I'm here, hurry". |
| **The Icebreaker's glow and plume** | Shelf edge, x ≈ 600 | The Teeth onward | A sodium-orange glow on the eastern horizon and a lit steam column 300 m tall. A deep thrum every 4 s. |
| **Gleaner lights** | Over the wrecks (s 1140) and the *Abeyance* | The Teeth | Pale green points that blink once a second. They read as "something is wrong over there". |
| **The shaft of starlight** | Shaft at s 625 | Inside the cavern from s 500 | A cold blue light cone falling into the dark: the way out. |
| **Kit's beach flares** | Fast ice, s 3,130 to 3,200 | Surfacing | Red-pink pools on the shore ice. A road of light home. |
| **The Bench's work lamp** | s 3,290, l +20 | The fast ice | One warm white lamp under a crane arm. |

### 2.6 Zones

Each zone lists its range, terrain, structures (all buildable from `art/kit.js` pieces) and dressing. New structure types are defined in §11.8. Every man-made piece follows Appendix D of the architecture: at least three depth layers, real panel lines, no raw boxes.

#### Z1 · THE CUT (s 0 to 320)

**Card:** `THE CUT` / `West edge, Rime Shelf`

**Terrain.** A flat bay of wind-packed snow over black ice, about 300 × 220 m, flattened to h 0. Pressure-ridge walls (`pressure_ridge`, 10 to 16 m tall) enclose it on the west, north and south. There are two openings: a 100 m gap in the north wall at s 180 to 280 (the skiffs come through here) and the **east gully** at s 290 to 335, 60 m wide between two ridge walls. West of the bay is the Dark: an ice-fog bank and nothing else.

**Structures and dressing.**
- **Three cut marks** (`ice_block`): blocks of clear blue ice 6 × 3 × 6 m, outlined with orange dye lines, each with two Wake survey flags (canvas pennants on bevelled poles) and a tungsten lamp. At s 115 / l −55, s 165 / l +45, s 215 / l −35.
- **Juno's sled** (`ice_sled`, id `sled1`): a 12 m sledge with bevelled runners, a plate deck, stake posts, a tarp and a lamp pole. At s 160, l −5. Its blocks pile up on the deck as they're cut.
- **Wake work site:** 6 `wake_lamp` poles with warm tungsten heads and kite ribbons, a canvas windbreak (`windbreak`), a tool-crate cluster, a kite reel post, a `tank_cairn` (empty water tanks stacked into a cairn, a Wake way-marker), and a painted board `SECOND PATIENCE · CUT 4`.
- **Old cut lines:** long dark refrozen saw cuts in a grid across the bay floor (decals).
- **Tick** parked at s 90, l +70, with the kite reel deployed.
- **The snow bridge** (`snow_bridge`, id `snowBridge`) spans the cavern mouth at s 322: a 70 m snow-and-rime crust, visually just the gully floor with a faint sag and blue cracks. States: `intact`, `collapsed`.

**Pull.** The *Abeyance* on the horizon past the gully. Kit's kite overhead.

#### Z2 · UNDER THE ICE (s 320 to 640)

**Card:** none. The player arrives here during the black and the boot text, and a card would land on top of the story beat.

**Terrain.** A trench flattened to y −18 along the route, 50 to 70 m wide. It widens to 100 m at the waking hall (s 360 to 410) and ends at the shaft (s 625).

**Structures and dressing.**
- **Ice walls** (`ice_wall`, obox colliders from −30 to +4) line both sides at |l| = 28 to 50. These stop the player from walking up the stamp slopes.
- **Roof** (`ice_vault` segments every 30 m from s 330 to 615): arched slabs of bevelled ice 6 m thick, bottom at y −2, top at y +2 to +4 with snow on the upper face so they read as shelf from above. Colliders are boxes with a bottom (ceilings). The roof is thin in places (`ice_window`: faint blue emissive patches) and lets a little starlight through.
- **The waking hall:** the **cutter wreck** (`cutter_wreck`) at s 345, l +10, on its side with its amber cab light flickering. **Moth's alcove** (`moth_alcove`) at s 375, l −28: a niche of rime-crusted plates in the shape of a kneeling frame. When Moth stands, the front plates fall away (state `broken`).
- **Frozen debris of the *Abeyance*'s crash:** half-buried Founders' cargo pods (`founders_pod`, white ceramic with soft chamfers and dead gold seam lines) set into the walls at s 430 and 540.
- **Ice pillars** (`ice_pillar`, circle colliders) forming a squeeze at s 510 to 530. Frozen bubble curtains in the walls (emissive streak decals). Icicle clusters on the roof (bevelled triangular extrusions, instanced).
- **The shaft** (`shaft_ring`) at s 625: a vertical moulin 24 m across, a ring of 10 oriented ice-wall segments from y −18 up to the raised rim at +16, open to the sky. A cone of cold starlight falls through it (additive mesh), with spindrift particles.

**Pull.** The light cone at the shaft, visible from s 500.

#### Z3 · THE TEETH (s 640 to 1350)

**Card:** `THE TEETH` / `Pressure ridges`

**Terrain.** A maze of pressure ridges: lines of rafted ice slabs 8 to 25 m tall (`pressure_ridge` structures over `ridge` terrain features). Between them run **leads**: flat lanes of wind-polished black ice 40 to 80 m wide, where skiffs sail. The main lead runs with the route. Side leads run north–south at s 800, 1010 and 1240.

**Structures and dressing.**
- About 22 `pressure_ridge` entries (lengths 60 to 180 m) shaping the maze. The player can jump and hover over them; skiffs can't.
- **Kit's dead end** at s 900, l +70: a short side lead closed by a ridge, with Tick wedged against it.
- **Old skiff wrecks** (`skiff_wreck`, ids `wreckA`, `wreckB`) at s 1130 / l −40 and s 1160 / l +35. These are the Gleaner harvest site.
- **Cache A** (§13.3): an older skiff wreck frozen into a side lead at s 1010, l −175, with an intact Gaff Harpoon.
- **The pass** at s 1300: two tall ridges (25 m) form a gate that frames the *Abeyance* exactly as the player comes through.
- Dressing: lone wind-carved ice spires (scatter `spire`, retinted), a toppled Dredge marker buoy, a Wake `tank_cairn` at s 760.

**Pull.** Kit's flare, then the green lights over the wrecks, then the *Abeyance* in the pass.

#### Z4 · THE ABEYANCE (s 1350 to 1700)

**Card:** `THE ABEYANCE` / `Frozen freighter`

**Terrain.** A flat apron (h 0) about 260 m across on the hull's west side, then the hull, then a strip of shelf to the east.

**The hull** (`abeyance`, id `abeyance`, at s 1545, l 0, yaw along the route at 122°). See §11.8 for the full build spec. In short:
- A Founders' colony freighter frozen upright, stern down, 140 m tall, 40 m along the route by 30 m across. White ceramic hull plates gone grey, rust streaks, rime, icicles. Faded gold seams. The name `ABEYANCE` in Founders' type runs vertically down the north face.
- **The hold tunnel** cuts through it at ice level along the route: 22 m wide, 18 m tall, open at both ends. This is the Gleaner roost: **body-drum racks** (`drum_rack`, 6 racks of 8 sealed drums) under sodium work lamps and green status lamps on the Dredge gear. Kit drives Tick through it.
- **Inside, five bulkhead floors** at y +22, +44, +66, +88 and +108, and the **crown** (the open top) at +122. Each floor is a slab with one torn opening 12 × 10 m in a different corner, so the climb zigzags. The west face is torn open from +30 to +110 (the "dollhouse tear"), which lets in moonlight and lets the camera breathe.
- **The stencil** on floor 3 (+66), north inner wall: the lattice-ring emblem 6 m tall above the words **CARRY THEM HOME. SET THEM DOWN.**, framed by a cyan Founders' seam-light strip that flickers on as Moth approaches.
- **Outside, on the east face,** Dredge scaffold landings every 25 m, so a player who falls off can hover back up.
- **The winch lock** (`winch_lock`, id `winchLock`, destructible, 1,500 AP) on the hold's north wall at y +8, chaining *Hardtack*'s sledge (`sled2`) to a Dredge winch.
- **Cache B** on the crown: a Dredge spares shelf at the roost with a Flare Pod.

**The apron** (Sexton duel, centred on s 1440):
- The **Gleaner landing pad** (`gleaner_pad`) at s 1470, l −60: a 30 m Dredge plate deck on stubby legs, with lamp posts, cable reels and hazard chevrons. A short `drum_rack` waits for pickup.
- **Cover:** six spilled Founders' cargo pods (`founders_pod`), a half-buried Founders' lifeboat (`founders_lifeboat`, a 20 m ceramic hull) at s 1420, l +70, and ice hummocks.

**Pull.** The crown, lit by sodium lamps from inside. The climb path is lit by Dredge work lamps hung down the shaft.

#### Z5 · THE CUT-LINE (s 1700 to 2500)

**Card:** `THE CUT-LINE` / `Dredge harvest ground`

**Terrain.** An open field of flat shelf (h 0), 560 m deep and 900 m wide, ending at the **shelf edge**: a sawn ice cliff about 21 m above the water, running north–south through (628, −470), (645, −300), (636, −120), (650, 40), (638, 210), (655, 470). East of the edge is **the Raft** (x 650 to 900): 22 large locked floes 40 to 90 m across, freshly cut, with glowing seams between them.

**Structures and dressing.**
- **Ice cliff** (`ice_cliff`, 6 segments along the edge polyline): bevelled ice-wall plates from y +1 down to −80, obox colliders so the cliff is vertical and can't be walked up from the water.
- **Block stacks** (`block_stack`): cut blocks stacked into stepped pyramids, strapped, with Dredge tally boards. At s 1850 / l −120, s 1900 / l +90, s 2050 / l +200 and s 2100 / l −260. Good cover, 12 to 18 m tall.
- **A cable-sledge train** (`cable_sled_train`) at s 1960, l −130: six Dredge ore-sleds linked by cables, with a small crane.
- **Marker buoys** (`marker_buoy`): lit poles with chevrons along old cut lines.
- **Old cut lines:** refrozen seams across the field (decals); **fresh cut lines** behind the Icebreaker (glowing slush channels, decals plus emissive strips; visual only).
- The Icebreaker (§6) starts at the north end of the edge.

**Pull.** The Icebreaker's floodlights. Then the dawn: the eastern sky over the Raft keeps brightening.

#### Z6 · THE FLOES (s 2500 to 3130)

**Card:** `THE FLOES` (no subtitle)

**Terrain.** Open water (sea plane at −24, seabed −70) full of loose floes 14 to 45 m across (§12.5), crossed by open-water **leads** 25 to 40 m wide where skiffs skim. Pack-ice belts (corridor walls) close the sides.

**Structures and dressing.**
- About 140 floes and 9 **bergs** (tabular icebergs on large floes, 14 to 28 m tall) that cast the shade lanes. Berg table in §12.5.
- The **Icebreaker hulk**, listing at the shelf edge behind the player, slides into the sea 8 s after surfacing.
- **Steam fog** rising off the water in the new sun (low alpha emitters).
- **Sled 3** (`sled3`, *Lark's Rest*'s sledge) on a floe at (1010, 262), shaded at first.
- **Skiff wrecks** from the boss fight floating in the leads.

**Pull.** Kit's flares on the shore. The Wake's lights. The sun.

#### Z7 · THE SHORE (s 3130 to 3334)

**Card:** `THE SHORE` / `The Wake`

**Terrain.** Shore-fast ice (flat, h −21) 80 m deep, then a gravel beach climbing to +6, then low snow dunes at the edge of the play area. The Thornback fills the eastern sky.

**Structures and dressing.**
- **The hole** (`fast_ice_hole`, id `hole`) at s 3185, l −20: a round water hole 9 m across, cut by the Wake for drawing water, with a canvas windbreak half fallen over and a tank on a tripod.
- **Kit's flares** (fx emitters: red-pink fire, 25 m pools of light) along the fast ice, s 3130 to 3200.
- **The Wake rigs** (`wake_rig`, §11.8): hero rigs within 250 m: **the Bench** (`bench_crawler`, s 3290, l +20) with crane arms, a welding lamp and a kneeling cradle; ***Second Patience*** (s 3265, l +80); ***Big Mercy*** (s 3320, l −70, a long tanker train); ***Compass Rose*** (s 3310, l +150, a tall-masted navigator rig). About 20 instanced generic rigs (3 variants) line the beach to the north and south out to 1.2 km, every one with warm lights and a painted name.
- Tick parked at s 3170, l +40, kite folded.

**Pull.** The Bench's lamp.

---

## 3. Beat sheet (the level in order)

Times are first-time targets (cumulative from pressing Deploy). The detailed numbers for each encounter are in §5 and §6; every line of comms is in §10.

| # | Beat | Zone | Time | Control |
| --- | --- | --- | --- | --- |
| 0 | Briefing screen (Oma's cut order) | — | not timed | menu |
| 1 | Prologue card | — | 0:00–0:25 | none |
| 2 | Opening vista: the *Abeyance* against the dawn rim | Z1 | 0:25–0:33 | none (skippable) |
| 3 | The cutter: look at the kite, walk, saw three blocks | Z1 | 0:33–2:15 | cutter |
| 4 | The raid: skiffs harpoon the sled and rake the cutter. Run for the gully. | Z1 | 2:15–2:55 | cutter |
| 5 | The snow bridge collapses. The cutter falls. Card: *"Its hatch was open…"* | Z1→Z2 | 2:55–3:15 | none |
| 6 | Boot over black. Moth wakes; camera pulls out. | Z2 | 3:15–3:50 | none |
| 7 | Walk-only cavern crawl | Z2 | 3:50–4:50 | walk |
| 8 | The shaft: *"Boost system… remembered."* Hover up into starlight. | Z2 | 4:50–5:15 | + jump, hover |
| 9 | Kit on the radio. Flare. | Z3 | 5:15–5:45 | |
| 10 | Kit pinned: *"Targeting… remembered."*, *"Lateral thrust… remembered."*, TEAR, sled 1 | Z3 | 5:45–8:30 | + lock, rifle, quick boost, TEAR, interact |
| 11 | "Water first. Then we argue about what you are." | Z3 | 8:30–8:50 | |
| 12 | Gleaners over the wrecks: *"Blade… remembered."* Carrier. Burn the wrecks. | Z3 | 8:50–10:20 | + blade |
| 13 | The pass. The *Abeyance*. | Z3→Z4 | 10:20–10:40 | |
| 14 | The Sexton: *"Ghost. Don't look at the light."* *"Chorus… remembered."* *"Repair cycle… remembered."* | Z4 | 10:40–12:30 | + missiles, repair |
| 15 | The drums. Kit drives through the hold. Sled 2 (optional). | Z4 | 12:30–13:00 | |
| 16 | The climb and the stencil: *"This frame knows this mark."* | Z4 | 13:00–14:45 | |
| 17 | The crown: the cut-line reveal. Kit leaves by the north fast-ice. Descend. | Z4→Z5 | 14:45–15:20 | |
| 18 | The Icebreaker, phases 1 to 3 | Z5 | 15:20–19:00 | full |
| 19 | Sunrise wall. The floe splits. The drowning. | Z5 | 19:00–19:45 | partial, then none |
| 20 | Surface. The floe sprint (gold ice rots, Gleaners hunt). Sled 3 (optional). | Z6 | 19:45–22:15 | full, hover icing |
| 21 | The shore: the hole, "Releasing ballast", "There you are." | Z7 | 22:15–23:00 | none |
| 22 | "Bring the frame in." The name. Fade. | Z7 | 23:00–23:40 | walk, then none |
| — | Debrief → Bench 1 → Morning Count (Day 1) | — | | menu |

---

## 4. Tutorialization

Every control is taught by the story. Moth "remembers" its systems one at a time, so the HUD comes online piece by piece and each new input arrives exactly when it's needed. Hints use the architecture's `hint({ desktop, touch })` and stay up for 7 s. Each hint fires once per save (flag `hint:<id>`), except on a restart from a checkpoint before the hint.

| # | Control | Beat and trigger | How it's taught | Moth's line | Hint (desktop / touch) |
| --- | --- | --- | --- | --- | --- |
| T1 | Look | Z1 start | "Look at Kit's kite" (objective completes when the kite is within 8° of screen centre for 0.5 s) | — | `Mouse to look` / `Drag the right side to look` |
| T2 | Move | Z1, after T1 | Walk to the first cut mark | — | `W A S D to walk` / `Left thumb to walk` |
| T3 | Blade input (saw) | Z1, within 14 m of a cut mark | Three strikes per block | — | `Right click to saw` / `Tap BLADE to saw` |
| T4 | Walk (Moth) | Z2, after the boot | Walk-only cavern, 10 m/s | *"Drive systems are cold. Walking only."* | `W A S D to walk` / `Left thumb to walk` |
| T5 | Jump and hover | Z2, entering the shaft | 34 m vertical climb | *"Boost system… remembered."* | `Space to jump. Hold it in the air to hover. Hover burns EN.` / `JUMP. Hold it in the air to hover.` |
| T6 | Lock-on, rifle, hard lock | Z3, skiffs within 300 m | Two skiffs circling Kit | *"Targeting… remembered."* | `Aim near a target to lock on. Left click fires. E holds the lock.` / `Aim near a target to lock on. FIRE shoots. LOCK holds it.` |
| T7 | Quick boost | Z3, the first harpoon telegraph | Dodge the harpoon; quick boost also snaps a harpoon cable | *"Lateral thrust… remembered."* | `Shift + direction to quick boost. Snaps harpoon cables.` / `BOOST + direction to dash. Snaps harpoon cables.` |
| T8 | TEAR | Z3, the first glinting enemy staggered within 40 m | The Gaffer's harpoon launcher; reinforcements guarantee one | *"That part is loose. This frame can take it."* | `Hold right click to TEAR` / `Hold BLADE to TEAR` |
| T9 | Interact | Z3, sled 1 freed | Flag the sledge | — | `F to flag the sledge` / `INTERACT to flag the sledge` |
| T10 | Blade | Z3, a Gleaner within 30 m | Lunge onto fast flyers | *"Blade… remembered."* | `Right click to lunge with the blade. It finds your locked target.` / `BLADE lunges at your locked target.` |
| T11 | Missiles | Z4, the Sexton duel starts | Four-lock volley at the Sexton and its escort | *"Chorus… remembered."* | `Q fires missiles at everything inside the reticle.` / `MSL fires missiles at everything in the reticle.` |
| T12 | Repair | Z4, AP below 55% (or when the Sexton dies, if never) | Three kits | *"Repair cycle… remembered."* | `R uses a repair kit. You have 3.` / `KIT uses a repair kit. You have 3.` |

Not taught in Level 1: Sync and partner moves (L2), Calls (L3), heat (L4).

**Stagger** (an existing prototype rule) gets one hint the first time any enemy is staggered: `Staggered targets take extra damage, and loose parts can be torn off.`

**Swim and surface** (§12.6): `Hold Space to rise` / `Hold JUMP to rise` (shown after the reboot underwater).

**Gold ice** (§8.2): `Gold ice breaks soon after you land on it. Blue ice holds.`

---

## 5. Encounters

Positions are route-relative (`s`, `l`, `h` above ground) unless given as world `x, z, y`. Unit stats are in §11. "Prototype" means the values in architecture Appendix C.5.

### E1 · `e_raid`: the raid (Z1, scripted)

- **Units:** 3 skiffs: `raid_g1` (Gaffer) at s 150 / l −330, `raid_g2` (Gaffer) at s 240 / l −340, `raid_s1` (Sleet) at s 300 / l −300. `behavior: 'scripted'`, `targetable: false` (the cutter is unarmed; nothing to lock).
- **Script:**
  1. t 0: all three sail in through the north gap at 40 m/s.
  2. t 4: `raid_g1` harpoons `sled1` (a visible cable), turns north-east and drags it out of the bay at 25 m/s. The sled bounces and sheds blocks. Comms `c_raid_sled`.
  3. t 5 to 20: `raid_g2` and `raid_s1` make rake runs past the cutter (40 to 60 m passes). Their hits are real projectiles but the player is invulnerable in the cutter (`player.invuln`); the HUD shows hurt flashes and sparks, and the vitals spike to 128.
  4. t 8: comms `c_raid_gully`; objective `o_gully`.
  5. When the player passes s 318: the collapse (beat 5). All raid skiffs despawn during the fade.
- **Fail-safe:** if the player hasn't moved 60 m toward the gully 25 s after the raid starts, `raid_s1` drives a harpoon into the cutter and tows it to s 310 (scripted), so the collapse happens anyway.

### E2 · `e_pin`: Kit pinned (Z3)

- **Trigger:** `pass 820`.
- **Wave 0:** `pin_g` (Gaffer, tags `pin`, `sled1tow`) at s 960 / l +40, towing `sled1` on a cable 30 m behind. `pin_s` (Sleet, tag `pin`) at s 990 / l +110. Both circle Tick (at s 900 / l +70) with rake runs and shoot at it (visual hits on the ridge around Tick only). They switch to Moth when it fires or comes within 250 m.
- **Wave 1** (`when: { remaining: 1 }`, or 50 s after the wave starts): `pin_g2` (Gaffer, spawns at **1,400 AP of 2,200**, so it staggers quickly and guarantees the TEAR lesson) at s 1080 / l −60, and `pin_s2` (Sleet) at s 1100 / l +20. They arrive down the east lead together.
- **Escalation:** in wave 1 the two coordinate. The Gaffer harpoons and tows Moth toward the Sleet's pass line. Snapping the cable (quick boost) is the answer.
- **TEAR guarantee:** if both waves die without a TEAR, one more Gaffer (`pin_g3`, 1,000 AP) sails in at s 1120 / l 0 and is scripted to stagger on its first hit.
- **Cleared:** all `enc:e_pin` dead.

### E3 · `e_gleaners`: the wrecks (Z3)

- **Trigger:** `pass 1060`.
- **Wave 0:** 6 Gleaners already harvesting: 3 at s 1130 / l −40 / h 6 and 3 at s 1160 / l +35 / h 6, in `harvest` mode on `wreckA` and `wreckB`. Each one that finishes a 6 s harvest lifts a drum and flies toward the *Abeyance*. If it gets there, it despawns (no penalty, but Juno notices: comms `c_lost_drum`, once).
- **Wave 1** (`{ delay: 25 }`): `carrier1` (Gleaner carrier with the Flare Pod glint) arrives from s 1500 / l −100 / h 70, holds at s 1180 / l −20 / h 38, and deploys 2 Gleaners every 12 s (4 at most from this carrier, never more than 6 Gleaners alive).
- **Behaviour:** Gleaners defend their harvest. Any Gleaner within 60 m of the player attacks (§11.2). The carrier holds 120 to 200 m from Moth.
- **Escalation:** the carrier's arrival doubles the Gleaners and puts a heavy in the air out of blade range. It sags to 12 m when staggered, which is the TEAR window.
- **Exit:** if the carrier is still alive 90 s after arriving, it lifts away east toward the *Abeyance* and despawns. The encounter then counts as cleared.

### E4 · `e_apron`: the Sexton (Z4, named mech fight)

- **Trigger:** `pass 1370` (also the checkpoint `cp_abeyance`).
- **Units:**
  - **The Sexton** (`mech`, tag `sexton`, `boss: true`, name `SEXTON`) at s 1470 / l −40. `behavior: 'guard'`, home the pad, leash 140 m.
  - **`carrier2`** (Gleaner carrier, Flare Pod glint) hovering over the pad at h 35.
  - 3 Gleaners at s 1480 / l −95 / h 10.
- **Behaviour:** the Sexton is a brawler (§11.4). The carrier keeps Gleaners topped up to 3 alive and **pops flares at the player's first missile volley**. That is the moment missiles are taught, so the player learns both what missiles do and what flares are for, and sees the part they can tear off for themselves.
- **Escalation:** at 50% AP the Sexton enters phase 2: aggression 1.0 and the shock attack (a 1.4 s charge, then 2,400 damage within 36 m: *"Energy surge. Move away from it."*).
- **Cleared:** when the Sexton dies. The carrier and Gleaners lift away east if still alive (they don't block progress).

### E5 · `e_shaft`: Gleaner nest (Z4 climb)

- 2 Gleaners on floor 2 (y +50), spawned when the player rises above y +40. When they're dead, 2 more spawn on floor 4 (y +94) and drop toward the player. Both groups are in `defend` mode with `indoor: true` (they stay inside the hull). Light pressure only: the climb is the breather.

### E6 · `e_hold`: Hardtack's sledge (Z4, optional)

- Starts when Tick enters the hold. `winchLock` (structure, 1,500 AP, amber glint, `objective: true` but the objective is optional) plus 2 Gleaners guarding the drum racks inside the hold.
- When `winchLock` is destroyed, the interact objective `o_sled2` appears at the sledge (s 1545, l −10).

### E7 · `e_field` and `e_icebreaker`: the cut-line (Z5)

- **`e_field`** (trigger: landing on the field, `pass 1720`): 2 skiffs patrolling: a Sleet at s 1900 / l +90 and a Gaffer at s 2000 / l −150.
- **`e_icebreaker`:** the Icebreaker at world (590, −340), heading south (azimuth 180°), plus 2 deck turrets that it spawns itself, plus skiff launches on its own schedule. Full spec in §6.

### E8 · `e_floes`: the sprint (Z6)

- **Skiffs** (trigger: surfacing): 3 skiffs that keep to the leads (open water, 30 m/s): a Sleet at s 2650 / l −80, a Gaffer at s 2800 / l +60, a Sleet at s 2950 / l −40. They make rake runs along the leads only. A Gaffer harpoon hit that tows Moth into a lead drops it into the water: snap the cable with quick boost.
- **Gleaner hunt** (§11.2, hunt mode): groups of 2 every 20 s, spawned 350 m away to the north-east (s 3000, l −300, h 60, plus jitter), up to 6 alive. Each one tries to latch onto Moth.
- **Ends** when the player reaches the fast ice (s 3130): Kit's flares drive the Gleaners off (§3 beat 21), and the skiffs turn away into the leads and despawn at 400 m.

### E9 · The watchers (Z7, no combat)

- On the kneel, 5 Gleaners spawn in `watch` mode at 160 to 220 m from the hole, h 25 to 40, in a loose arc to the north-east. They hover facing Moth, lights blinking, and don't attack. On the chime they turn and fly east (despawn at 600 m). They're `targetable: false` (the player is frozen anyway).

### 5.1 Encounter budget

| Encounter | Max alive | Kinds |
| --- | --- | --- |
| E1 raid | 3 | skiff |
| E2 pin | 2 (3 with the fail-safe) | skiff |
| E3 wrecks | 6 Gleaners + 1 carrier | gleaner, gleaner_carrier |
| E4 apron | Sexton + carrier + 3 Gleaners | mech, gleaner_carrier, gleaner |
| E7 cut-line | Icebreaker + 2 turrets + 3 skiffs + 2 field skiffs | icebreaker, turret, skiff |
| E8 floes | 3 skiffs + 6 Gleaners | skiff, gleaner |

The busiest moment for the performance budget is Icebreaker phase 1 with all skiffs out: 8 active units plus heavy particle use (slurry jets, steam, sparks). It is well inside the 40-unit High budget.

---

## 6. The Icebreaker (boss)

A 60 m Dredge drill-crawler, ghost-run, sawing the shelf into floes for the Dredge. Its three drill heads are the weak points. Its hull is armoured and takes no damage.

### 6.1 Build (bevelled procedural parts)

- **Hull:** 60 × 22 × 18 m. A long armoured box-beam from layered bevelled slabs: black iron (`#2f2b29`) under oxide-red plates (`#6a2a1c`), hazard chevrons along the sponsons (amber `#e0a030` on black), riveted seams (greebles), a sloped glacis at the bow, and a stern ramp.
  Side-profile plate for the hull's main slab (z forward is negative, as in the prototype): `[[-30, 4], [-26, 12], [-14, 14], [22, 14], [30, 9], [30, 2], [-24, 1]]`, extruded 20 m wide, bevel 0.6. Two narrower plates over it as armour layers, plus sponson boxes from `panelBox`.
- **Locomotion:** four tracked bogies (14 m track units, bevelled side skirts with cut-outs showing road wheels, ice cleats) on pivots. Treads scroll (UV-free, so scroll a grime decal strip, or step the cleat meshes).
- **Cutting gantry** at the bow: a 30 m truss (`truss`) carrying the three heads.
  - **Port and starboard saws** (heads 1 and 2): each on a 16 m two-segment arm with hydraulic joints (`joint`), ending in a 7 m toothed disc inside a bevelled guard housing. Teeth glow orange when cutting (emissive `#ff7a2a`) and spray slurry.
  - **Bow auger** (head 3): a 12 m conical auger built from twisted flight plates, on a central boom, behind two clamshell blast guards. Its weak point is the **collar**: a glowing ring at the auger's base (emissive cyan-white `#bff6ff`) venting coolant steam.
- **Intake:** a conveyor ramp amidships, starboard side, with animated slats, swallowing blocks.
- **Deck:** two turret mounts (prototype turret, Dredge colours), a mast with four sodium floodlights (`#ffb04a`) on a sweeping head, hazard strobes, and a skiff launch rail on the stern.
- **Bridge tower** aft, 34 m tall: a cab with a **pale green cab light** (`#9dffb0`) blinking once a second, and a stack venting steam (`fx.emitter('steam')`) and sparks.
- **Budget:** ≤ 24 draw calls, ≤ 120k triangles (it's a set piece; architecture §7.5 allows ≤ 200k for set pieces). LOD1 beyond 550 m is a single merged mesh.

### 6.2 Numbers

| Part | AP | impMax | Stagger | Damageable when |
| --- | --- | --- | --- | --- |
| Hull | — | ∞ | never | never. Hits spark; the first hull hit shows the hint `ARMOURED. Hit the drill heads.` |
| Port saw (`head_port`) | 8,000 | 2,600 | 3.0 s | lowered (cutting, or during and after a sweep) |
| Starboard saw (`head_stbd`) | 8,000 | 2,600 | 3.0 s | lowered |
| Bow auger (`head_bow`) | 14,000 | 3,600 | 4.0 s | phase 3 only, and only while the player's centre is below the collar's y + 2 (fire from the Raft) |
| Deck turrets ×2 | 2,000 | 800 | prototype | always (destroying them reduces fire) |

Damage to a staggered head uses the prototype bonus (×1.6). Each head is its own combat target with `tags: ['drillhead', 'icebreaker']` and `objective: true`, so lock-on and missiles work naturally. The Icebreaker unit itself is `targetable: false` and `boss: true`; its `ap` and `apMax` mirror the sum of its heads, so the standard boss bar shows **ICEBREAKER** with the heads' total.

Movement: cruise 4.5 m/s, hunt 7 m/s, turn rate 0.12 rad/s. Its hull colliders (3 oboxes) move with it and are re-hashed every 0.25 s. Being run over: 1,200 damage, 1,600 impact, pushed out sideways.

### 6.3 Phase 1: CUTTING (both saws intact; target 80 s)

- Crawls along the shelf edge, 30 m inland (x ≈ 610), from z −340 south to z +380, then back north. Both saws are lowered into the ice and cutting, which leaves a glowing cut line behind.
- **Slurry jets:** every 6 s, each saw sprays a cone of ice slurry sideways (60 m long, 30°) for 1.5 s. Inside the cone: 220 damage per second, 700 impact per second, pushed away from the saw at 25 m/s. Telegraph: 0.8 s of rising hiss and vapour at the saw housing.
- **Deck turrets:** prototype bursts (6 × 85 damage at 420 m/s).
- **Floodlight sweep:** an 8° cone, 500 m long, sweeping the field in a 9 s cycle. While the player is in it, turret spread halves, the soft warning `SPOTTED` shows, and Kit says *"Out of the light, Jun! They're aiming with it!"* (once).
- **Skiff launches:** every 40 s, 2 skiffs slide down the stern rail (3 alive at most). Launched skiffs alternate Gaffer and Sleet and carry their haul, so the boss fight is also a TEAR opportunity.
- **Damage windows:** both saws are lowered most of the time. They sit low beside the hull, so the player has to come within about 150 m with line of sight. Kit's kite marks both saws (HUD markers `PORT SAW`, `STARBOARD SAW`).
- **Transition:** when either saw dies, its arm goes limp and drags sparks, the Icebreaker stops cutting and turns to face the player: phase 2.

### 6.4 Phase 2: HUNTING (one saw left; target 70 s)

- Raises the remaining saw and drives west across the field toward the player at 6 to 7 m/s, trying to keep the player in front.
- **Saw sweep:** when the player is within 70 m in front. Telegraph 1.5 s (the saw revs, teeth glow white, a spark fountain, the `charge` SFX). It sweeps a 140° arc at ground level, radius 50 m from the shoulder. Everything below 8 m above the ice takes 1,800 damage and 1,400 impact. Counter: jump or hover over it, or quick boost out of range. **After the sweep the saw stays lowered for 2 s and takes ×1.5 damage.**
- **Cut-line strike:** every 12 s at 80 to 300 m. It drops the saw into the ice and drives a crack line straight at the player at 30 m/s, up to 300 m. The ice glows 0.8 s ahead of the eruption. Within 5 m of the line: 900 damage, 1,200 impact, and a launch upward. Counter: quick boost sideways. The crack leaves a fresh cut line (decal only).
- Turrets and floodlight continue. Skiff launches every 50 s.
- **Transition:** when the second saw dies, it turns back east and crawls to the edge at z ≈ 0 (about 10 s; skiffs and turrets keep the player busy): phase 3, and the checkpoint `cp_harvest`.

### 6.5 Phase 3: HARVEST (bow auger; target 60 s)

- The Icebreaker stops with its bow over the edge at (650, −8). The blast guards open and the bow auger lowers on its boom over the Raft. The collar hangs at y −8.
- **Auger plunge:** every 9 s. Telegraph 2 s (the auger spins up, coolant steam, a deep rising whine). It plunges into the Raft floe nearest the player and sends a shockwave ring across the Raft (expanding from 0 to 60 m at 40 m/s, 3 m tall): 1,400 damage, 1,200 impact. Counter: jump over the ring. The struck floe cracks into 2 to 3 pieces (still standing).
- **Plunge recovery:** 3 s with the auger stuck. The collar is exposed from every side, but the player must still be below collar + 2 m for hits to count.
- **Intake suction:** within 60 m of the bow for more than 1 s, the player is pulled toward the intake at 10 m/s. Visible as streams of snow and slush.
- **Floodlight** points down at the Raft, so the player is always spotlit (turret accuracy up).
- **The collar rule:** a hit on `head_bow` counts only if `ctx.player.center().y < collar.y + 2` at the moment of the hit. If the player damages it from above, the hint `Get below the collar. Fire from the Raft.` shows once. Moth's line *"The bow drill is armoured above. Exposed from below."* opens the phase.
- **Death:** see §7 (the finale).

### 6.6 Kit's help

Kit's kite flies 90 m above Moth for the whole fight (Kit is driving the north fast-ice). It marks the heads (`threat` markers) and the skiffs about to launch. Kit only talks at the moments listed in §10.

---

## 7. The signature set piece: sunrise, drowning, floe sprint

This runs from the bow auger's death to the player's first steps on the surface. Timings are in sim seconds from the death of `head_bow` (T). The whole sequence is one custom action, `drown` (levels/level01/drown.js), so it can be tested and tuned in one place.

### 7.1 The sunrise and the collapse (T 0 to T 9)

| T | What happens |
| --- | --- |
| 0.0 | `head_bow` dies. The auger tears off its boom with a shriek of metal and falls onto the Raft 20 m from the player (or onto the player's floe if the player is within 40 m of the bow). Explosion at the collar, sparks, a steam burst. Music cuts to a single low drone. |
| 0.5 | **The Icebreaker's boiler shock:** a radial shockwave from the bow, radius 400 m, 600 damage, 3,000 impact. It staggers the player (prototype player stagger: no control for 1 s), so a hovering player falls. If the player is west of x 650 (on the shelf), it also adds an impulse of +40 m/s east and +10 m/s up, which throws them over the edge. Nobody watches this from the shelf. |
| 1.5 | **The sun clears the Thornback.** Letterbox bars slide in (the HUD stays). The level's art starts its blend to dawn (§15.2), timed so its midpoint falls when the light wall reaches the player. Comms `c_sunrise`: Kit, *"Jun. Jun, the sun. Look east."* |
| 1.5 to 9 | **The light wall** (custom, `sunrise.js`): a vertical curtain of gold haze, 2 km wide and 120 m tall, set perpendicular to the sun, sweeps west from x 2,600 at 260 m/s. Behind it, a flat additive gold sheet just above the ice and water tints everything it has passed. Ahead of it, the world is still blue. As it passes each floe, that floe groans (positional `iceGroan`) and shows gold-white cracks. The camera turns gently toward it (if the player isn't steering). |
| 6.0 | Comms `c_ice_changing`: Moth, *"The ice is changing."* |
| ~8.5 | **The wall reaches the player.** The floe under Moth splits along a crack through its centre. Its two halves hinge apart and tilt (30° over 1.2 s), Moth slides into the gap and falls into the sea. Juno: *"Hold—"* (cut off). If the player is already in the water, skip the split. |

**Guarantees:** the player always ends up in the water. A player standing on a floe goes in through the split; a player in the air was knocked down at T 0.5; a player on the shelf was thrown over the edge at T 0.5. If, at T 9.5, the player is somehow still out of the water (for example, standing on the Icebreaker's deck), the `drown` action teleports Moth to the nearest Raft floe, which splits immediately.

### 7.2 The drowning (about 40 s; no control for the last 12)

Underwater rendering is an art blend (§15.3) plus particles: bubbles stream up from Moth's vents, silt drifts, light shafts fall from the split above, and floe undersides are dark slabs against a bright green-white surface. Sound goes muffled (low-pass at 400 Hz, `audio.duck`), and the heartbeat SFX comes up in the mix.

| t (from entering the water) | Control | Event |
| --- | --- | --- |
| 0 | partial | Moth sinks at 4 m/s. Movement at 25%. JUMP and BOOST only make bubbles (thrusters flooded). HUD: `CABIN BREACH` (red warning, holds). The **water line** starts rising up the HUD glass from 0 to 100% over 24 s. Vitals jump to 150 and race (150 to 168, ragged). |
| 1.5 | partial | Juno: *"Up. Get us up."* |
| 3.5 | partial | Moth: *"Thrusters are flooded. This frame is sinking."* |
| 6.0 | partial | Juno: *"Okay."* (quiet) |
| 6 to 10 | partial | Silence. Bubbles. The split above drifts out of line and the light narrows. Moth settles at y −48 (it stops sinking there). |
| 10.0 | partial | Juno: *"Hey. Hey, listen. If this goes bad."* |
| 13.5 | partial | Juno: *"Don't let me end up one of his ghosts. Promise me."* |
| 17.5 | partial | Moth: *"Promised."* |
| 20.0 | partial | The water line is at its top. Inputs grow sluggish (movement 10%). Vitals spike to 172, then slow over 4 s: 140, 96, 50, 30… |
| 24.0 | none | Control is removed (`player.frozen`): the last 12 s. **Flat line.** The vitals widget shows a flat trace and `SENSOR FAULT`. The heartbeat SFX stops. The `flatline` tone sounds for 1.5 s. |
| 26.0 | none | **Cut to black** (`hud.fade(1, 0.2)`), all sound to silence. 4 seconds of black. |
| 27.0 | none | Over black (comms must render above the fade, §16 R5): Moth: *"Hold on to me."* |
| 30.0 | none | **HUD reboot.** Fade up over 1.5 s. The HUD frame glitches in panel by panel (`hud.glitch`). The water line is gone. The vitals widget reboots and shows **60**, with a perfectly regular trace. It stays exactly 60 for the rest of the game. |
| 31.5 | none | Juno: *"…I'm okay? I'm okay!"* (her only exclamation mark in the game) |
| 34.0 | none | Moth: *"You are okay."* |
| 36.0 | full | Control returns. Underwater movement rules (§12.6) apply. Objective `o_surface` ("Surface"); hint `Hold Space to rise` / `Hold JUMP to rise`. A god-ray cone marks the hole above. Music: a single rising pad note. |
| ~42 | full | The player rises through the hole (or any gap) and breaks the surface. A breach launches Moth up (vy 22 m/s) onto the nearest floe. Splash, spray, steam. **Checkpoint `cp_floes`.** The floe sprint begins (§7.3). |

Notes:
- The black lasts exactly 4 s (bible). Nothing else is on screen: no HUD, no letterbox, only the comms line.
- The water line is a new HUD element (§16 R4). If it isn't built in time, raise the underwater fog density over the same 24 s instead.
- AP isn't drained during the drowning, so the player can't die in it. If anything kills the player before t 24, restart at `cp_harvest`.

### 7.3 The floe sprint (about 2.5 minutes)

Rules in §8.2 and §12.5. Beats:

| Sprint time | Event |
| --- | --- |
| 0 | Surfaced on a Raft fragment in berg B1's shade. Sun at 5.5°, azimuth 95°. Music `l01_dawn` comes in. Comms `c_surfaced`. Objective `o_shore` ("Follow Kit's flares to the shore") with a marker on the fast ice. |
| 3 | Comms `c_icing` (*"Vents are icing. Hover is limited."* / *"Then we hop."*). From here hover costs ×2 EN (§12.5). |
| first gold-floe landing, or 12 | Comms `c_rot` (*"Sunlit ice is failing. Shadowed ice holds."* / *"Blue holds, gold breaks. Got it."*) and the gold-ice hint. |
| 8 | The Icebreaker hulk slides off the shelf edge into the sea behind the player: a great slow tilt, its green cab light going under last, a wave that rocks nearby floes (visual bob only). Kit: *"It's going under. The whole thing's going UNDER."* |
| 12 | First skiffs in the leads. Kit: *"Skiffs in the leads! They don't care about the sun, they FLOAT—"* |
| first hunt group within 120 m | Kit: *"Why are the Gleaners all coming at YOU?"* Juno: *"I'm the biggest thing out here."* |
| within 220 m of sled 3, or 25 | Kit spots sled 3 (optional objective `o_sled3`). It becomes sunlit at about sprint time 62 s (§12.5), and if it rots before it's flagged, the sledge is lost (Kit: *"Lost it. Doesn't matter. Keep going."*). |
| about 75 (first moment with no enemy within 150 m), forced at 110 | Juno: *"You with me?"* Moth: *"I am here."* |
| pass s 3060 | Kit: *"Last bit! Fast-ice holds, it's shore ice, it's GOOD ice!"* |
| pass s 3130 | The shore sequence (§3 beat 21). |

**Death in the sprint:** AP 0, or sinking (§12.6) → restart at `cp_floes`. The floes reset; the sun clock restarts at 5.5°.

---

## 8. The two gameplay twists, as rules

### 8.1 Systems remembered

Moth wakes with almost everything offline. Each system comes back the first time the situation needs it, with one Moth line and one hint (§4). Rules:

- Gated abilities read as idle input: the action does nothing and the HUD slot shows `OFFLINE` (dim, struck through) until remembered. On touch, gated buttons are hidden.
- A remembered system plays `hud.glitch(0.3)`, the `confirm` SFX and a brief cyan flash on its HUD slot, then shows its normal readout.
- Remembered state is saved in mission flags (`ab:jump`, `ab:lock`, …) and restored on checkpoint restart.
- Order (fixed): walk → jump + hover → lock + rifle → quick boost → TEAR → interact → blade → missiles → repair.
- Walk-only speed: 10 m/s (a third of normal). Everything else uses prototype values.

### 8.2 Sunlit ice rots

After the sunrise, the open-water floes fail in the sun.

- **Every floe is either shaded or sunlit.** A floe is shaded if a ray from its top centre (+1 m) toward the sun is blocked by a berg (a cylinder of radius r and height h, §12.5). The test runs every 0.5 s against the 9 bergs (cheap, analytic, deterministic: the sun's elevation is a function of sprint time only).
- **Sunlit floes rot when touched.** The first frame the player's support is a sunlit floe, its rot timer starts:
  - 0 to 1.5 s: white cracks spread from the contact point, groaning.
  - 1.5 to 3.0 s: the floe sags 0.6 m, chunks break off its edges, white spray.
  - 3.0 s: collapse. The collider disables, and the floe breaks into 3 to 5 chunks that sink over 2 s.
  - Rot can't be stopped once started. Leaving the floe doesn't save it.
- **Shaded floes never rot,** however long you stand on them. A shaded floe that becomes sunlit while you stand on it starts rotting at that moment (the shade lanes shrink as the sun climbs).
- **Readability:** shaded floes are deep blue (`#5f7fa8`), sunlit floes are warm white with a gold rim (`#f2dcc0`, rim `#ffc070`). Rotting floes go bright white with crack lines. This tint is what the player reads at every distance and on every tier; real shadows (within the shadow box) agree with it but aren't needed.
- **The sun climbs** from 5.5° to 9° over 180 s of sprint time (azimuth fixed at 95°), so shade lanes shrink toward their bergs: dawdle and the shade walks away from you. A 26 m berg's lane is 270 m long at 5.5° and 165 m long at 9°.
- **Hover is limited** after the drowning (hover costs ×2 EN, "vents icing"), so the player can't simply fly over the field: at full EN that's about 3.3 s of hover, roughly 100 m.

---

## 9. Checkpoints

| id | Position | Label (toast) | Restores (via `onCheckpoint`) |
| --- | --- | --- | --- |
| `cp_cut` | s 40, l −20, facing the route | The cut | Fresh start only (it's checkpoint 0). Cutter on, kite up. |
| `cp_cavern` | s 384, l −18, azimuth 63° | Under the ice | Moth (cutter off), walk-only, vitals live at 96 bpm, art `under`, `moth_alcove` broken, `snowBridge` collapsed, music night. |
| `cp_ridges` | s 690, l 0 | The Teeth | + jump and hover; Tick at its pinned spot; kite following Tick; Kit's flare burning; music night. |
| `cp_abeyance` | s 1375, l 0 | The Abeyance | + lock, rifle, quick boost, TEAR, interact, blade; Tick at s 1360 / l +50; music dredge; the apron encounter respawns in full. Rack contents restored from flags. |
| `cp_cutline` | s 1735, l 0 | The cut-line | + missiles, repair; Tick gone (north detour), kite over Moth; art `cutline`; Icebreaker phase 1 respawn. |
| `cp_harvest` | s 2200, l 0 | The shelf edge | Icebreaker respawns directly in phase 3 at the edge (both saws destroyed, `ib:phase = 3`); turrets as they were (flags); music boss. |
| `cp_floes` | world (856, 23) on a guaranteed Raft fragment, facing east | The floes | Dawn art, vitals locked at 60, hover icing, Gleaner hunt on, floes reset, sun clock restarts at 5.5°, Icebreaker hulk already sunk, music dawn. |

All checkpoints refill AP, ammo and kits (`refill: true`). The haul rack and the sledge flags live in mission flags, so they're included in every snapshot.

---

## 10. Script

Style rules from the bible §10 apply: British spelling, combat lines ≤ 80 characters and at most two speakers per exchange in combat, only the Foreman's chime may interrupt, no exposition, idioms unexplained. **Pronoun rule:** before *"Hold on to me."* Moth never says "I", "me" or "my".

Speaker ids: `JUNO`, `MOTH`, `KIT`, `OMA`, `FOREMAN`, `BOOT` (system boot text) and `DREDGE_PA` (the Icebreaker's PA). Definitions in §16 R5 and §17.

**The `MOTH` speaker's on-screen label is `CANTOR 7` until Kit names it.** The label changes to `MOTH` between Kit's naming line and Moth's reply (`c_naming_kit`, then the custom action `renameSpeaker`, then `c_naming_moth`), so the first line ever shown under the name MOTH is *"Designation accepted. Logged."* The id stays `MOTH` throughout.

### 10.1 Briefing (pre-level screen)

```
header:     THE WAKE · CUT ORDER
title:      THAW
subtitle:   The Rime Shelf
body:
  Edge is coming. Wake rolls at first light.
  Three blocks from the west cut before we go. Take the cutter and the boy. The boy flies, you cut.
  Don't go past the ridges. Don't wait for the sun.
  — O. Desh, the Bench
objectives: Cut three blocks · Back before the sun
fine:       Keep up.
showMap:    false
```

### 10.2 Text cards (the only two in this level)

**Prologue** (intro interstitial, `style: 'black'`, typewriter, hold 9 s):
> GAUNT. One day lasts ten years. The dawn walks west, eleven kilometres a day. Behind it, the ground burns. Ahead of it, the sea is ice. Between them, for a few hundred kilometres, there is water. We follow it.

**The hatch** (mid-level interstitial after the collapse, `style: 'black'`, hold 5 s):
> Its hatch was open. It was the only warm thing in the dark.

The boot text is not a card: it types in the comms box over black as the `BOOT` speaker (§10.3, Z2).

### 10.3 Comms, in order

Format: **id** · trigger. Lines are `SPEAKER: text`. *(stage directions in italics)*. `{wait n}` is a pause in the script.

#### Z1 · The Cut

**`c_morning`** · `start`, 1.5 s after the vista
- KIT: Morning, Jun! Kite's up. Look up. No, UP. That's me, being amazing.

**`c_watchNorth`** · objective `o_look` done
- JUNO: Morning. Keep the kite on the north for me.
- KIT: Kite's on the north. North is very… dark. Good job, north.

**`c_block1_near`** · within 30 m of block 1 (once)
- KIT: Orange flags. I put those there. You're welcome.

**`c_block1`** · block 1 cut
- JUNO: One.
- KIT: Crooked.
- JUNO: Drinks the same.

**`c_block2`** · block 2 cut
- KIT: Two! That's more than halfway. That's two-thirds-way.

**`c_block3`** · block 3 cut
- JUNO: Three. Sled's full. Bring Tick round.
- KIT: Bringing Tick round. Tick is coming round. Tick is— hang on.

**`c_lights`** · 2 s after `c_block3` · *(music: dread stinger; skiff lights appear on the north ice)*
- KIT: Lights on the ice. Lots of lights. Jun, those aren't ours.
- JUNO: Kite down. Get to the ridges.

**`c_raid_sled`** · `raid_g1` harpoons the sled
- KIT: They've got the sled— they've HARPOONED the sled—
- JUNO: Let it go. Move, Kit.

**`c_raid_hit`** · first rake hit on the cutter
- JUNO: Dry it.

**`c_raid_gully`** · 8 s into the raid
- KIT: East gully, Jun! The gully! GO!

**`c_collapse`** · during the collapse cinematic, as the bridge gives
- KIT: Jun? JUN—
- *(the signal cuts to static mid-word)*

#### Z2 · Under the ice

*Card: "Its hatch was open. It was the only warm thing in the dark."*

**`c_boot`** · after the card, over black · *(each line types fast; the BOOT speaker has no label)*
- BOOT: CANTOR 7 // KERNEL 4/4
- BOOT: LATTICE: EMPTY // PASSENGER: NONE
- BOOT: PILOT: DETECTED
- *(the vitals widget appears: a heart trace at 112 bpm)*
- MOTH: Query: are you authorised?
- JUNO: I'm the only one here, so yes.
- MOTH: This frame accepts.
- *(cinematic `mothWakes`: the visor lights cyan; the camera pulls out; ice falls away)*

**`c_walk`** · control returns
- JUNO: Can you climb?
- MOTH: Drive systems are cold. Walking only.

**`c_name`** · `pass 460`
- MOTH: Query: what are you called?
- JUNO: Juno. You?
- MOTH: Cantor 7. Nothing else is stored.
- JUNO: That's a number, not a name.
- MOTH: Noted.

**`c_signal`** · `pass 560`
- JUNO: Kit. Kit, it's me.
- {wait 2.5}
- JUNO: Signal's dead down here.
- MOTH: Correction: the ice is thick. The signal is not dead.
- JUNO: Thanks.

**`c_shaft`** · entering the shaft (within 26 m of s 625)
- MOTH: Boost system… remembered.

**`c_kit_reconnect`** · Moth rises above y +8 at the shaft
- KIT: —un? Jun? JUN. Answer me. Answer me answer me answer—
- JUNO: Kit. It's me. I'm in something.
- KIT: There's a GIANT thing coming out of the ice, Jun, run—
- JUNO: That's me.
- KIT: …Oh. Okay. Okay okay okay.
- {wait 1.5}
- KIT: Two skiffs. Tick's stuck. Hurry.
- JUNO: Coming. Put up a flare.
- *(Kit's red flare bursts over s 900)*
- KIT: Flare's up. Follow the red.

Kit's "Two skiffs. Tick's stuck. Hurry." is his truly frightened register (short and flat, the only time he sounds like Juno). Don't add jokes to it.

#### Z3 · The Teeth

**`c_idle_north`** · the first time Moth's body turns north while idle in Z3 (§12.8), once
- JUNO: Stop turning. East is that way.
- MOTH: Noted.

**`c_pin`** · `pass 820`, with skiffs within 300 m
- MOTH: Targeting… remembered.

**`c_qb`** · the first harpoon telegraph aimed at Moth
- MOTH: Lateral thrust… remembered.

**`c_stagger`** · first stagger of any enemy · *(hint only, no comms)*

**`c_tear`** · the first glinting enemy staggered within 40 m
- MOTH: That part is loose. This frame can take it.

**`c_first_tear`** · rack count reaches 1 · *(hint: `HAUL 1/3. Parts go to the Bench at the end of the walk.`)*
- JUNO: Huh. Oma'll want that.

**`c_sled1`** · `sled1tow` destroyed (the sled stops where its skiff died)
- KIT: That's our SLED. He was towing our sled.
- JUNO: Flag it. Big Mercy can fetch it later.

**`c_sled1_done`** · `o_sled1` done
- KIT: Flagged! That's a tank. A whole tank. I'm counting it.

**`c_pin_wave`** · wave 1 of `e_pin` spawns
- KIT: More sails, east lead! Two!

**`c_pin_clear`** · `e_pin` cleared
- KIT: Okay so that was AMAZING, and also I nearly died, so.
- JUNO: Drink something.

**`c_whatfor`** · 4 s after `c_pin_clear`, Tick pulls up alongside
- MOTH: Query: what is this frame for?
- JUNO: Water first. Then we argue about what you are.

**`c_gleaners`** · `pass 1060` · *(dread stinger)*
- KIT: Green lights. Jun, those are Gleaners.
- JUNO: They're here for the skiff crews.
- KIT: They're already dead, Jun.
- JUNO: That's when they come.

**`c_blade`** · a Gleaner within 30 m (or 8 s after `c_gleaners`)
- MOTH: Blade… remembered.

**`c_blade_kill`** · first blade kill
- KIT: YES! Do that again! Do that MORE!

**`c_carrier`** · `carrier1` arrives
- KIT: Big one! Big green one, north!

**`c_lost_drum`** · the first Gleaner escapes with a drum (once)
- JUNO: One got away.
- *(no reply)*

**`c_burn`** · `e_gleaners` cleared
- JUNO: Kit. Burn the wrecks.
- KIT: With what?
- JUNO: Flare. Into the fuel.
- KIT: …Okay.
- *(Kit's flares arc into `wreckA`, `wreckB` and any skiff wrecks in Z3; small fires burn behind the player for the rest of the zone)*

**`c_abeyance`** · `pass 1290` (the pass frames the hull)
- KIT: There's the Abeyance. Biggest thing on the shelf. Bigger than you, big guy.
- MOTH: Query: is "big guy" a designation?
- KIT: It is NOW.

#### Z4 · The Abeyance

**`c_ghost`** · `pass 1370` · *(music: dread stinger, then the Dredge theme; the Sexton turns its head, green light blinking)*
- KIT: Jun. That one's got a light.
- JUNO: Ghost. Don't look at the light.

**`c_missiles`** · straight after `c_ghost`
- MOTH: Chorus… remembered.

**`c_enemy_flares`** · `carrier2` pops flares for the first time
- KIT: It's throwing sparkles! That's CHEATING.

**`c_surge`** · the Sexton below 50% AP
- MOTH: Energy surge. Move away from it.

**`c_repair`** · player AP below 55% after `c_ghost` (or on the Sexton's death if not yet taught)
- MOTH: Repair cycle… remembered.

**`c_sexton_down`** · the Sexton dies · *(its green light goes out mid-blink; 3 s of silence)*

**`c_drums`** · 3 s after the Sexton dies
- KIT: Jun. There's drums in there. In the hold. Lots of drums.
- JUNO: Mark them. Oma will want a Turnback.
- KIT: …Marking.

**`c_climb`** · after `c_drums`
- KIT: I can't see past the ridges from down here. Get up top. Eyes on.
- JUNO: Climbing. Drive through. Don't stop.
- KIT: Not stopping. Not looking. Not looking at ANY of it.

**`c_hardtack`** · Tick enters the hold
- KIT: Jun, there's a sled in here. Hardtack's paint. It's chained to their winch.
- JUNO: I'll get the winch.

**`c_hardtack_done`** · `o_sled2` done
- KIT: Two tanks! TWO!

**`c_shaft_gleaners`** · `e_shaft` floor-2 group spawns
- MOTH: Movement above.

**`c_stencil`** · floor 3, within 25 m of the stencil · *(cinematic `stencil`: Moth stops by itself for 2 s and turns to the mark; the seam-light flickers on)*
- MOTH: This frame knows this mark.
- JUNO: From where?
- MOTH: Unknown. Logged.

**`c_cutline`** · reaching the crown · *(cinematic `cutlineReveal`: the field, the Icebreaker cutting the edge, the Raft, the floes, the dawn rim, the Wake's lights)*
- KIT: That's the ice we came for. They're taking all of it.
- KIT: And it's cutting right between us and the beach.
- JUNO: Then it stops cutting.

**`c_detour`** · after the cinematic
- KIT: Tick can't swim. I'm going round by the north fast-ice. Meet you on the beach.
- JUNO: Keep the kite on me.
- KIT: Kite's on you. No strings attached. Okay, one string.

#### Z5 · The Cut-line

**`c_pa1`** · the player lands on the field · *(DREDGE channel, heavy static)*
- DREDGE_PA: Cut and haul. Cut and haul. Shift's not over.

**`c_heads_hint`** · 15 s into the fight
- KIT: Kite says the saw heads go soft when they're cutting. Hit them low.

**`c_spotlight`** · the floodlight first catches the player
- KIT: Out of the light, Jun! They're aiming with it!

**`c_head1`** · the first saw dies
- KIT: Head's off! ONE!
- JUNO: It's turning. Here it comes.

**`c_crack`** · the first cut-line strike
- MOTH: The ice is splitting toward this frame. Move off the line.

**`c_pa2`** · 20 s into phase 2
- DREDGE_PA: Cut and— cut and haul. Cut and haul.

**`c_head2`** · the second saw dies
- KIT: TWO! It's got one head left and it looks ANGRY.

**`c_auger`** · phase 3 starts (the guards open)
- MOTH: The bow drill is armoured above. Exposed from below.
- JUNO: Down on the raft, then.

**`c_sunrise`** · finale, T 1.5
- KIT: Jun. Jun, the sun. Look east.

**`c_ice_changing`** · finale, T 6
- MOTH: The ice is changing.

**`c_fall`** · the floe splits under Moth
- JUNO: Hold—

**`c_drown`** · in the water (timings in §7.2)
- JUNO: Up. Get us up.
- MOTH: Thrusters are flooded. This frame is sinking.
- JUNO: Okay.
- {silence 4 s}
- JUNO: Hey. Hey, listen. If this goes bad.
- JUNO: Don't let me end up one of his ghosts. Promise me.
- MOTH: Promised.
- *(vitals race, then flat; SENSOR FAULT; black for 4 s)*
- MOTH: Hold on to me.
- *(HUD reboots; vitals 60)*
- JUNO: …I'm okay? I'm okay!
- MOTH: You are okay.

#### Z6 · The Floes

**`c_surfaced`** · breach
- KIT: JUN! I saw you go under, I saw you go UNDER—
- JUNO: Fine. Where are you?
- KIT: Beach! Follow the flares!

**`c_icing`** · sprint 3 s
- MOTH: Vents are icing. Hover is limited.
- JUNO: Then we hop.

**`c_rot`** · first touch of a gold floe (or sprint 8 s)
- MOTH: Sunlit ice is failing. Shadowed ice holds.
- JUNO: Blue holds, gold breaks. Got it.

**`c_sink`** · sprint 8 s, the hulk slides under
- KIT: It's going under. The whole thing's going UNDER.

**`c_leads`** · the first skiff run in the leads
- KIT: Skiffs in the leads! They don't care about the sun, they FLOAT—

**`c_hunt`** · the first hunting Gleaner within 120 m
- KIT: Why are the Gleaners all coming at YOU?
- JUNO: I'm the biggest thing out here.

**`c_sled3`** · within 220 m of sled 3, or sprint 25 s
- KIT: Sled on a floe, south! Lark's Rest paint. It's in the shade. For now.

**`c_sled3_done`** · `o_sled3` done
- KIT: THREE tanks! Oma's going to— she's going to nod, probably!

**`c_sled3_lost`** · sled 3's floe rots before it's flagged
- KIT: Lost it. Doesn't matter. Keep going.

**`c_withme`** · first quiet moment after sprint 75 s (no enemy within 150 m), forced at 110 s
- JUNO: You with me?
- MOTH: I am here.

**`c_lastbit`** · `pass 3060`
- KIT: Last bit! Fast-ice holds, it's shore ice, it's GOOD ice!

#### Z7 · The Shore

**`c_backoff`** · `pass 3130` · *(Kit fires flares at the hunting Gleaners; they scatter)*
- KIT: Get OFF her! Flares, flares, FLARES—

**`c_ballast`** · Moth has walked itself to the hole and knelt (§3 beat 21) · *(letterbox; camera wide and side-on, so the hatch is never in view; bubbles rise once in the hole, then stillness; the watching Gleaners hang in the gold air)*
- {wait 3}
- JUNO: Why'd we stop?
- MOTH: Releasing ballast.
- JUNO: Since when do you carry ballast?
- MOTH: Not anymore.
- {wait 2}
- *(Moth rises; the Gleaners turn and fly east)*

**`c_foreman`** · straight after · *(three-note descending chime; OPEN channel overrides everything; pale gold italics, slowest typing)*
- FOREMAN: There you are.
- {wait 2}
- KIT: Who was THAT?
- OMA: Nobody you answer, boy. Bring the frame in.

**`c_naming_kit`** · Moth reaches the Bench's cradle and idles; it turns slowly to face north (scripted, 4 s)
- KIT: It keeps turning north. Like a moth at a lamp. I'm calling it Moth.

*(the speaker label changes from `CANTOR 7` to `MOTH`)*

**`c_naming_moth`** · straight after
- MOTH: Designation accepted. Logged.
- *(fade to black over 3 s; the music-box motif plays its first four notes)*

### 10.4 Objectives (HUD text)

| id | Text | Kind | Notes |
| --- | --- | --- | --- |
| `o_look` | Find Kit's kite | manual | completed by custom condition `lookingAt` |
| `o_cut` | Cut three blocks | destroy, tag `block`, count 3 | `showCount` |
| `o_gully` | Run for the east gully | reach s 320, r 60 | |
| `o_up` | Find a way up | reach s 625, r 26 | marker appears at s 500 |
| `o_climb` | Climb out | flag `outOfShaft` | |
| `o_kit` | Reach Kit | reach s 860, r 80 | marker on the flare |
| `o_skiffs` | Drive the skiffs off Tick | kill, tag `pin` | `showCount`, waves update the count |
| `o_sled1` | Flag the sledge | flag `sled1` | optional. The custom action `flagSled` puts an interact prompt (r 14, 1.5 s, `FLAG SLEDGE`) on the sledge wherever it stopped, and sets the flag when it fills. |
| `o_wrecks` | Keep the Gleaners off the wrecks | kill, encounter `e_gleaners` | |
| `o_abeyance` | Make for the Abeyance | reach s 1370, r 80 | |
| `o_sexton` | Destroy the Sexton | kill, tag `sexton` | boss bar |
| `o_climb2` | Climb the Abeyance | flag `crown` | marker on the crown |
| `o_sled2` | Free Hardtack's sledge | flag `sled2` | optional. Destroy `winchLock`, then the same `flagSled` prompt. |
| `o_heads` | Break the Icebreaker's drill heads | destroy, tag `drillhead`, count 3 | `showCount`, markers on targets |
| `o_surface` | Surface | flag `surfaced` | |
| `o_shore` | Follow Kit's flares to the shore | reach s 3130, r 60 | |
| `o_sled3` | Flag the drifting sledge | flag `sled3` | optional, same prompt; fails if its floe rots first |
| `o_bench` | Bring the frame in | reach s 3290, l +20, r 18 | |

### 10.5 Hints and HUD text

Hints are listed in §4. Other HUD text:

| Text | Where | Style |
| --- | --- | --- |
| `HAUL 1/3. Parts go to the Bench at the end of the walk.` | first TEAR | hint, 7 s |
| `RACK FULL. Drop which part?` | TEAR into a full rack | choice title |
| `ARMOURED. Hit the drill heads.` | first hit on the Icebreaker hull | hint |
| `Get below the collar. Fire from the Raft.` | hitting the auger from above | hint |
| `SPOTTED` | in the floodlight | soft warning |
| `CABIN BREACH` | drowning | warning (holds) |
| `SENSOR FAULT` | vitals widget, flatline | widget text |
| `OFFLINE` | gated weapon slots | slot state |
| `FLAG SLEDGE` | interact prompts | prompt label |
| `TEAR` | the melee prompt on a staggered glinting target | prompt (hold) |

Death screen line (spoiler-safe, generic): `Signal lost.` In the water: `Lost under the ice.`

### 10.6 Debrief (spoiler-safe)

Title `WALK DAY 1 · THE RIME SHELF`. Rows: time, kills, damage taken, **haul** (list of racked parts), **sledges flagged** (n / 3), rank. No story text.

---

## 11. New enemies and actors

All models are built from `art/kit.js` (bevelled plate profiles, `panelBox`, `truss`, `pipe`, `joint`, `greebles`), merged per material with `GeoBuilder`, with an LOD1 single mesh. Stats are given against the prototype (architecture Appendix C.5). For the first build these kinds are registered by level code (`levels/level01/units.js`, through `ctx.enemies.register`, using the exported `Unit` class) and can move to `actors/enemytypes.js` later, since L2, L5 and L6 reuse Gleaners and skiffs.

**Faction colours:** Dredge shell `#2f2b29` (black iron), mid `#6a2a1c` (oxide red), accent `#e0a030` (hazard amber), dark `#141211`, eye `#ffb04a` (sodium). **Living crews** have steady warm-amber cab lights. **Ghost-run machines** have a pale green cab light (`#9dffb0`, emissive 4) that is on for 0.25 s of every second (60 a minute), readable at 1 km: a 0.6 m emissive diamond plus an additive glow sprite that doesn't scale below 3 px on screen.

### 11.1 Raider skiff (`skiff`)

**What it is.** A Dredge ice yacht crewed by living raiders. Fast, fragile, and the source of the Gaff Harpoon and the Sleet Gun.

**Visual (16 m long, 14 m mast).**
- Hull: a narrow knife-bowed hull. Side profile `[[-8, 0.4], [-6.5, 1.8], [5.5, 2.0], [8, 1.2], [7.2, 0.2], [-6, 0]]`, extruded 2.6 m wide, bevel 0.12. A bevelled deck plate and two crew hoods (dark canopies with warm amber interior light, no figures).
- Runners: a 9 m cross-beam with two outrigger runners (bevelled blades) and a steering runner at the bow. The hull floats: on water the runners lift and the hull sits in the water.
- Rig: a mast of bevelled segments with a sodium running light. One stiff lateen sail made of thin bevelled plates with stitched-seam panel lines, oxide red with a black Dredge chevron. It flaps (vertex sway) when slack.
- Stern: a ducted turbine (a bevelled ring plus fan blades, spinning).
- Bow gun ring with one of two weapons:
  - **Gaffer:** a 4 m harpoon launcher with a cable drum and a barbed head. The Gaff Harpoon glint sits on the drum.
  - **Sleet:** a stubby drum-fed spread gun with a ventilated shroud. The Sleet Gun glint sits on the drum.
- Wreck (`skiff_wreck`): the hull on its side, mast snapped, sail torn, burning for 20 s (`fx.emitter('fire')` plus smoke). It stays on the map (`keepMesh`) and is tagged `harvest`.

**Stats.**

| | Value | vs prototype |
| --- | --- | --- |
| AP | 2,200 | tank 3,000 |
| impMax | 900 | tank 1,000 |
| Stagger | 2.6 s: the sail goes slack and it coasts to a halt over 2 s | — |
| Hit volume | sphere r 4.5 m at h 3 | |
| Body | rad 5, hgt 6 | |
| Speed | cruise 32 m/s, attack runs 45 m/s, 30 m/s on water; turn rate 1.2 rad/s at speed; accel 18 m/s² | drone 34 |
| Terrain | flat surfaces only (slope ≤ 0.12) and open water; leads in Z3 are authored as polylines it follows | |

**Behaviour (`skiff` AI).** A rake-run loop. Pick a run line that passes 40 to 70 m from the player, sail it at 45 m/s, fire during the pass, arc away to 250 to 350 m, turn and repeat. It never stops unless staggered. In Z3 and Z6 it follows authored lead polylines (`custom` data: lists of world points); in the open (Z1, Z5) it plans freely and avoids colliders with three whisker rays.
- **Gaffer attack:** during a pass, at 60 to 120 m: a 0.9 s telegraph (the launcher glows red-orange, the `charge` SFX plays, a thin cable glint), then a harpoon at 170 m/s: 350 damage, 450 impact. On a hit, a cable attaches and tows the player toward the skiff at up to 18 m/s for up to 3 s. The cable breaks when the player quick-boosts in any direction, blades the skiff, or the skiff is staggered or destroyed. Cooldown 7 to 9 s.
- **Sleet attack:** during a pass, under 90 m: 3 bursts 0.35 s apart, each 8 pellets × 70 damage and 35 impact in a 5° cone at 520 m/s. Cooldown 4 to 5 s.
- **Scripted modes** for the raid and the pin: harpoon a scripted target (the sled, the cutter), tow along a path, circle a point.

**Haul.** Gaffer: Gaff Harpoon (plain, amber glint). Sleet: Sleet Gun (plain, amber glint). A TEAR destroys the skiff (it's medium).

### 11.2 Gleaner (`gleaner`)

**What it is.** A Dredge scavenger drone that collects the dead for pressing. Ghost-run.

**Visual (4 m).** A bevelled teardrop body in black iron with an oxide-red chevron. Body side profile `[[-2, 0], [-1.6, 0.9], [0.4, 1.2], [2, 0.5], [1.8, -0.4], [-1.2, -0.6]]`, extruded 2.4 m. A horizontal ducted fan on top (bevelled ring, spinning blades). Two hooked cradle claws folded underneath like a beetle's legs (two-segment plates on `joint`s). A winch spool on the back with a trailing hook cable. **The green cab light on its face.** When carrying, a small sealed drum hangs on its cable.

**Stats.** AP 650 (drone 820), impMax 300 (drone 500), stagger 2.0 s (it drops 6 m), hit sphere r 2.4. Speed 36 m/s, altitude 6 to 20 m. No haul.

**Behaviour.** Three modes:
- **Harvest** (default): goes to the nearest unclaimed target tagged `harvest` (dead skiff wrecks, the Sexton's wreck, the drum racks). It descends to 4 m over it, holds there for 6 s with a green tractor glow on the claws, then lifts a drum and flies to the *Abeyance* hold (despawning there). Before the drowning it **never treats the player as a harvest target**.
- **Defend:** when the player is within 60 m of its target or damages it. Dives at the player for a **hook strike** (6 m reach, 180 damage, 120 impact, cooldown 2.5 s) and fires a **rivet spit** (90 damage, 40 impact, 140 m/s, range 120 m, cooldown 2 to 3 s). Orbits at 20 to 50 m.
- **Hunt** (after the drowning, flag `l01:hunt`): treats Moth as the harvest target and comes from up to 900 m away. Tries to **latch on**: a dive that, if it reaches 4 m, attaches the Gleaner to Moth's back for 2.5 s (140 AP per second drained, ground speed −30%, hover cost +50%, a green glow on Moth's silhouette). Up to 3 can latch at once. Shaken off by quick boost or the blade, or killed in place (the player can shoot a latched Gleaner; the lock reticle snaps to it).
- **Watch** (scripted, Z7): hover at a fixed point facing a target, no attacks.

### 11.3 Gleaner carrier (`gleaner_carrier`)

**What it is.** A heavy ghost-run drone that carries Gleaners and drums. Source of the Flare Pod.

**Visual (18 m).** A bevelled flying-barge hull. Two big tilting ducted rotors, port and starboard. A central cradle bay with a folded net-crane boom (unused in L1; it is L5's Kit-snatcher). A rack of 4 sealed drums underneath. A dorsal six-tube **flare pod** (amber glint) on a shoulder mount. Sodium belly lamps and the green cab light on its bridge.

**Stats.** AP 5,200 (heavy tank 7,200), impMax 1,800 (heavy tank 2,200), stagger 3.0 s, hit sphere r 7. Hovers at 30 to 45 m, speed 14 m/s.

**Behaviour.**
- Holds 120 to 200 m from the player at 30 to 45 m altitude, drifting to keep line of sight.
- **Deploy:** 2 Gleaners every 12 s, up to the encounter's cap.
- **Flares:** when one or more player missiles within 140 m are homing on it, it fires 4 flares in a burst; missiles retarget to the nearest flare. Cooldown 10 s, 3 uses. Losing the Flare Pod to a TEAR removes this ability.
- **Stagger:** when staggered it sags to 12 m above the ground for 3 s, which brings it within TEAR range (30 m).
- **TEAR:** it's a heavy, so a TEAR rips off the Flare Pod but doesn't destroy it.
- **Death:** it falls and crashes, its drums spilling and rolling on the ice. Its wreck is a `harvest` target.

### 11.4 The Sexton (named mech, `mech` with config)

**What it is.** The ghost war-frame that keeps the Gleaner roost. The first ghost the player sees up close, and a short brawler duel.

**Visual.** The prototype **Bastion** design at normal scale in Dredge colours (shell black iron, mid oxide red, accent hazard amber, worn: `wear 0.7`). Additions, added as part visuals:
- A **rack of three sealed drums** on its back (bevelled cylinders with dark iron bands), strapped to a frame.
- A **gaff-pike** on its left arm: a 7 m hooked pole-blade (two bevelled plates and a hook profile) in place of the blade emitter.
- A riveted **rivet gun** on its right arm (prototype rifle mount, reskinned).
- **The green cab light on its head**, blinking once a second. The visor is dark.

**Config (`MechConfig`).**
```js
{ design: 'bastion', faction: 'ghost', ap: 11000, impMax: 2400, aggression: 0.8, dodge: 0.5, preferRange: 40,
  weapons: ['mg', 'blade'], rifleDmg: 120, bladeDmg: 1800,
  phases: [{ at: 0.5, aggression: 1.0, add: ['shock'] }] }
```
- **No missiles.** Missiles are the player's advantage in this fight.
- Rivet gun: 5-round bursts of 120 damage / 40 impact at 600 m/s.
- Gaff-pike lunge: the prototype blade lunge (0.5 s wind-up, `charge` SFX) for 1,800 damage / 750 impact. Counter: quick boost sideways during the wind-up.
- Phase 2 (below 50%): the prototype shock (1.4 s charge, sphere grows, warning) for 2,400 damage within 36 m. Counter: boost away.
- Leash: home on the pad, radius 140 m (§16 R14).
- Name `SEXTON` in the lock box and on the boss bar.
- Death: the green light goes out mid-blink and it kneels forward onto its pike before the wreck explosion (1.0 s delay).

Compared with the prototype's bosses (14k to 22k AP) it's deliberately soft: the player has had missiles for seconds.

### 11.5 The Icebreaker (`icebreaker`)

See §6. Implemented in `levels/level01/icebreaker.js` as a custom unit (`ctx.enemies.register('icebreaker', …)`) that owns three child combat targets (heads), spawns its two `turret` units and moves them with its anchors every frame, and launches skiffs.

### 11.6 Tick, Kit's buggy (`tick`, ally actor, team `neutral`)

- **Visual (6 m long, 2.6 m tall).** A four-wheel ice buggy: a roll cage of bevelled tubes (`pipe`), big studded balloon tyres, a canvas seat cover in cream, a kite reel and launch rail on the back, a whip antenna with ribbons, two warm headlights, and the name **TICK** painted on the side. Kit is never visible: the cab is under a canvas hood with warm light inside.
- **Behaviour.** Scripted only. It drives authored paths at a given speed (8 to 18 m/s), waits at points, parks, and can be "pinned" (rocking, sparks around it). It is never targetable or damageable; it's neutral so nothing auto-targets it.
- Actions: `{ call: 'tick', args: { path, speed } }`, `{ park }`, `{ teleport }`, `{ hide }`.

### 11.7 Kit's kite (`kite`, cosmetic)

- **Visual.** A diamond kite-drone with a 4 m span: cream and faded-teal canvas plates on dark spars, a small ducted fan, a red navigation light, and a 12 m ribbon tail (a strip of quads animated with a travelling sine).
- **Behaviour.** Follows Tick or Moth at a set height (60 to 120 m), banking lazily. It can mark targets: it flies toward a target's position and the HUD adds `threat` markers on the given tag.
- In the vista and the cut site it's the look-at target.

### 11.8 New structure types (registered by `levels/level01/structures.js`)

All are built with the kit, ≤ 6 draw calls at LOD0 and 1 at LOD1, except `abeyance` (set piece, ≤ 200k triangles, merged to one mesh on Low).

| Type | Params | States | Colliders | Build notes |
| --- | --- | --- | --- | --- |
| `ice_block` | w 6, h 3, d 6 | intact, cut | box (until cut) | Clear-blue bevelled block (transmissive look: high env, faint blue emissive), dye outline decal, 2 Wake flags, 1 lamp. Destructible (900 AP, `tag: 'block'`); on destroy → state `cut` and it slides onto `sled1`. |
| `ice_sled` | length 12 | loaded0..3, towed | obox | Runners, plate deck, stakes, tarp, lamp pole. Blocks appear on the deck per state. |
| `wake_lamp` | h 7 | | circle r 0.6 | Bevelled pole, a tungsten head (emissive `#ffc27a`), canvas ribbon. |
| `windbreak` | length 14 | | obox | Canvas panels on poles, sagging. |
| `tank_cairn` | n 9 | | circle | Empty Wake water tanks (bevelled cylinders with handles and painted rig names) stacked in a cone. |
| `pressure_ridge` | length 40 to 180, h 8 to 25, seed | | 1 to 4 oboxes along the length | A line of rafted ice slabs: top-view polygons extruded 1.5 to 4 m and tilted 20° to 70° at random, stacked 2 to 3 deep, plus rubble. Blue glacial-ice material. Shares geometry by seed. |
| `snow_bridge` | span 70, width 50 | intact, collapsed | box (top 0) while intact | A snow crust with blue cracks. Collapse: breaks into 8 slabs that fall (debris) plus a dust plume. |
| `ice_wall` | length, h | | obox | Cavern walls: vertical bevelled ice plates with frozen-bubble decals. |
| `ice_vault` | span 60 to 100, thickness 6 | | box with bottom −2, top +3 | Arched roof slabs, snow on top, icicles under. |
| `ice_pillar` | h 22, r 4 | | circle | Twisted column of stacked bevelled ice drums. |
| `cutter_wreck` | | | obox | The cutter on its side (the cutter model, §12.1), with a flickering amber cab light. |
| `moth_alcove` | | sealed, broken | box | A niche of rime-crusted plates around a kneeling frame shape. `broken`: front plates fallen as debris. |
| `shaft_ring` | r 12, h 34 | | 10 oboxes | A ring of ice walls plus a raised rim of rafted slabs; light cone mesh. |
| `skiff_wreck` | seed | | obox | §11.1. Tag `harvest`. |
| `founders_pod` | size 1 | | obox | White ceramic cargo pod, soft chamfers (bevel 0.4), dead gold seam strips, lattice-motif panel. |
| `founders_lifeboat` | | | 2 oboxes | 20 m ceramic hull, half buried, tilted. |
| `gleaner_pad` | | | box (top +3) | A 30 m Dredge plate deck on stubby legs, chevrons, lamp posts, cable reels, green status lamps. |
| `drum_rack` | n 8 | | obox | Sealed body-drums (bevelled cylinders, dark iron bands, oxide lids) in a frame. No lights, no markings in L1. Tag `harvest`. |
| `abeyance` | see below | | many (below) | Set piece. |
| `winch_lock` | | intact, destroyed | circle | A Dredge winch and chain clamp. Destructible, amber glint. |
| `block_stack` | rows 4 | | obox | Stepped pyramid of cut blocks with cargo straps and a tally board. |
| `cable_sled_train` | n 6 | | oboxes | Linked ore-sleds plus a small crane. |
| `marker_buoy` | | | circle | Lit pole with chevrons on a weighted base. |
| `ice_cliff` | length, h 80 | | obox (top +1, bottom −80) | The sawn shelf edge: vertical plate face with saw-tooth texture lines and dripping icicles. |
| `fast_ice_hole` | r 4.5 | | none | A round water hole: a ring of broken ice plates, a small water disc (the sea material), a fallen windbreak and a tank on a tripod. |
| `wake_rig` | kind crawler / walker / train, name, seed | | oboxes | Patched, asymmetric salvage over bevelled hulls, canvas awnings, kite ribbons, painted names, warm tungsten windows. 3 variants plus instancing. |
| `bench_crawler` | | | oboxes | The Bench: a tracked workshop crawler with two crane arms, a welding lamp (emissive white), canvas awnings and the kneeling cradle (a frame-shaped steel cradle). Reused for the Bench scene (§13). |

**`abeyance` build.** Origin at the hull's base centre, local z along the hull's length (the route direction), local x across.
- Hull: 40 m (z) × 30 m (x) × 140 m (y), tilted 7° toward local +x. Built from vertical bands of bevelled ceramic hull plates (each 8 × 12 m, bevel 0.3) with gold seam strips (dead, `#8a7440`), frame ribs inside, and rust streak decals. The top is broken: the stern section is torn away above +122, leaving jagged frames up to +140.
- **Hold tunnel:** openings 22 × 18 m in both end faces at ground level. The tunnel's ceiling is bulkhead floor 1 (+22).
- **Floors** at +22, +44, +66, +88, +108 (box colliders 1.5 m thick with `bottom`), each with one 12 × 10 m torn opening (no collider): floor 1 SE corner, floor 2 NW, floor 3 NE, floor 4 SW, floor 5 centre-east.
- **The west tear** from +30 to +110: no hull plates or wall colliders on that face section.
- **Walls:** 4 oboxes per floor band (minus the tear).
- **Crown:** a platform at +122 (40 × 30 m) with the Dredge roost: a crane gantry, a spares shelf (cache B), work lamps.
- **Stencil** decal and emissive seam strip on floor 3's north inner wall (`materials.sign('CARRY THEM HOME. SET THEM DOWN.', { stencil: true })` plus a lattice-ring emblem built from kit plates: a ring of 7 bevelled nodes linked by a hexagonal lattice).
- **External scaffold** landings on the east face at +25, +50, +75, +100 (box colliders 8 × 4 m).
- Lights: 3 sodium work lamps down the shaft (emissive, one pooled point light near the player's floor), moonlight through the tear.
- Low tier: one merged mesh, no interior props beyond floors and walls.

---

## 12. New mechanics introduced in this level

### 12.1 The cutter (a proxy vehicle)

Juno's ice-cutter is used only for beats 3 to 5.
- **Model** (`levels/level01/cutter.js`): a small four-legged utility walker, 5 m tall. A boxy-but-bevelled cab pod (canvas-cream and faded-teal plates, patched, with a warm amber interior light and the painted name *SECOND PATIENCE · CUTTER*), four short articulated legs with broad snow feet, and a **saw arm** on the right: a 3 m circular saw on a hydraulic boom. The legs walk in a diagonal gait driven by speed.
- **Control:** the player entity is Moth's, hidden. While the flag `inCutter` is set, level code (1) hides `ctx.player.rig.root`, (2) puts the cutter model at the player's position and body yaw each frame and animates it, (3) gates every ability except move, look and the saw (§16 R1), (4) caps ground speed at 12 m/s, and (5) sets `player.invuln = true`.
- **The saw:** pressing BLADE plays a 0.5 s saw strike (sparks and ice spray). If an `ice_block` is within 14 m in front, it takes 300 damage (3 strikes per block). Cooldown 0.6 s.
- **HUD:** AP shows (it can't drop), EN is hidden, the weapon panel shows only `SAW` in the L slot (§16 R2). The vitals widget is visible from the start (Juno's heart, 78 to 86 at rest).
- **The fall:** in the collapse cinematic the cutter tumbles into the cavern and becomes `cutter_wreck`. Then the flag clears and Moth's rig is shown at the alcove.

### 12.2 Ability gating ("remembered")

See §8.1. Implementation: `player.abilities` (§16 R1), set through the custom action `abilities` with presets. From `jump` on, each preset includes everything in the presets above it (`blade` = jump + lock + qb + blade); `{ add: [...] }` adds single abilities.

| Preset | move (speed scale) | jump | hover | boost | fire | lock | blade | missile | kit | interact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cutter` | 0.4 | – | – | – | – | – | saw | – | – | – |
| `walk` | 0.33 | – | – | – | – | – | – | – | – | – |
| `jump` | 1 | ✓ | ✓ | – | – | – | – | – | – | – |
| `lock` | 1 | ✓ | ✓ | – | ✓ | ✓ | TEAR only | – | – | ✓ |
| `qb` | + boost | | | ✓ | | | | | | |
| `blade` | + blade | | | | | | ✓ | | | |
| `missiles` | + missile | | | | | | | ✓ | | |
| `full` | everything | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

TEAR is always available whenever the TEAR prompt is up, whatever the blade's state.

### 12.3 TEAR and the Haul rack

Bible §7.5 is the rule. Level 1 specifics:

- **Glint:** any unit carrying haul shows a glint on the part: an amber diamond sprite with a slow sparkle, visible within 300 m (hungry parts would be pale green-white; there are none in L1).
- **Prompt:** when a glinting target is **staggered and within 30 m** of Moth's centre, the melee input shows `TEAR` (hold). Desktop: hold right click 0.4 s. Touch: the BLADE button relabels to TEAR; hold it.
- **Animation (1.2 s, invulnerable):** the camera punches in (FOV −8°, offset to the shoulder); Moth lunges to the part (up to 30 m at 60 m/s), grabs with the left hand, braces, and rips: a sparks shower, a hydraulic spray, the `tear` SFX, a short camera shake. Small and medium targets explode. Heavies lose the part and its function.
- **Rack:** 3 slots, bottom right near the weapons panel. Each slot shows the part's silhouette and an amber dot. A part flies from the target into its slot as a small icon.
- **Full rack:** a TEAR into a full rack opens a choice (time slows to 30%, no pause): `RACK FULL. Drop which part?` with the three racked parts and `Leave it`. The dropped part falls to the ice as a pickup (glinting, collected within 12 m when there's room) until the level ends.
- **Caches** (§13.3) add straight to the rack, or open the same choice.
- **Results:** each TEAR gives +2 Sync segments (Sync isn't active until L2; still record the count). At level end the rack goes to the Bench (§13).
- **State** lives in mission flags `haul:rack` (array of part ids) and `haul:dropped` (positions), so checkpoints capture it.

### 12.4 Sledges (water)

- Three sledges, 1 tank each (bible §7.9: L1 income is "sledges 0 to 3").
- **Flagging:** an interact objective at the sledge (r 14, 1.5 s, label `FLAG SLEDGE`). Moth plants a Wake recovery flag with a lamp; the Wake fetches it after the raid. Flagged state is a mission flag (`sled1`, `sled2`, `sled3`), saved at level end to `campaign.sledges`.
- **Sled 1** (Juno's): freed by killing `pin_g`. Near-guaranteed: it stops on the critical path and Kit points it out. Like the other two, its objective is optional, and the level never waits for it.
- **Sled 2** (*Hardtack*'s): in the *Abeyance* hold, chained to `winchLock`. Optional.
- **Sled 3** (*Lark's Rest*'s): on a floe at (1010, 262), 100 m off the sprint line. It becomes sunlit at about sprint time 62 s and rots 3 s after the player touches its floe, so the player has to arrive, flag it (1.5 s) and leave. If the sun reaches it first and the player isn't on it, it holds (floes only rot when touched); if the player lands after it's sunlit, it's a race. Optional.
- Typical result: 2.

### 12.5 The floe field

Implemented as one custom system (`levels/level01/floes.js`), not as structures, so that ~160 floes cost a handful of draw calls.

- **Rendering:** 8 floe shape variants (convex top-view polygons with 6 to 9 sides, extruded 3 m with a 0.4 m bevel; the top face gets a snow cap) in `InstancedMesh`es, scaled 14 to 45 m. Per-instance colour carries the shade state, so the tint is right on every tier. Raft floes use the same variants scaled 40 to 90 m. Rot chunks use the debris pool.
- **Collision:** each floe registers a circle collider (r = 0.85 × the inscribed radius, top at the floe top, bottom −27). Colliders are enabled or disabled with state, never added or removed at runtime.
- **States:** `solid` → `rotting` → `sunk`. Stored in a typed array; mission flag `floes:seed` plus the sunk list for snapshots. `cp_floes` resets all floes.
- **Placement** (seeded, deterministic): Poisson-disc floes in the open-water region (x 660 to 1290, |l| < 0.8 × half-width), denser inside shade lanes. Leads (25 to 40 m wide) are left open along 3 authored polylines. **Validation at load:** from the surfacing point to the fast ice there must be a path where every gap is ≤ 22 m (a jump plus a quick boost covers 25 m without hover) and where you never need more than 2 gold-floe hops between shaded floes, at every sun elevation from 5.5° to 9°. If the seed fails, the generator nudges floes into the gaps.
- **The Raft** (Z5, pre-sunrise): 22 large floes, all `solid`, no rot (the sun isn't up). At the finale they split: each Raft floe swaps for 2 to 4 fragment instances that follow the normal rot rules. The fragment around (856, 23) is fixed and guaranteed (the `cp_floes` spawn).
- **Bergs** (shade casters; tabular icebergs standing on large floes; never rot):

| id | x, z | r | h | Lane length at 5.5° / 9° |
| --- | --- | --- | --- | --- |
| B1 | 995, 30 | 22 | 24 | 249 / 152 m |
| B2 | 1075, 120 | 25 | 28 | 291 / 177 m |
| B3 | 1150, 185 | 22 | 22 | 228 / 139 m |
| B4 | 1240, 130 | 24 | 26 | 270 / 164 m |
| B5 | 1300, 15 | 22 | 20 | 208 / 126 m |
| B6 | 1340, −60 | 18 | 18 | 187 / 114 m |
| B7 | 920, −60 | 16 | 16 | 166 / 101 m |
| B8 | 1180, 260 | 18 | 20 | 208 / 126 m |
| B9 | 1210, −40 | 15 | 16 | 166 / 101 m |

- **Sun clock:** `elevation(t) = 5.5 + 3.5 × min(t, 180) / 180` degrees, azimuth 95°. The visual sun in `art.sky.sun` follows the same clock (an `art` blend each 10 s of sprint time is enough; the gameplay test uses the formula directly).
- **Hover icing:** from sprint time 3 s to the end of the level, hover EN cost ×2 (`player.hoverCostScale = 2`, §16 R1).

### 12.6 Water, sinking and surfacing

- **The sea plane** (`levels/level01/sea.js`): one large plane at y −24 covering x 600 to 2,400. A custom shader (dark green-black, sun glint, foam where it meets floe colliders using a distance-to-floe texture baked at load). Double-sided: from below it's a bright green-white surface with dark floe silhouettes. It must end with the tone-mapping and colour-space includes (architecture §1.5) and be atmosphere-patched.
- **In water:** when the player's support is the seabed and `pos.y < −25`, the level's water system (a `physics`-phase system that runs after the player) applies: vertical speed clamped to [−4, +6] m/s, gravity ×0.25, horizontal speed ×0.4, EN regen 0. Holding JUMP rises at 6 m/s and costs 150 EN/s (×2 with icing). Quick boost is disabled (bubbles only).
- **Surfacing:** rising within 2 m of y −24 at a gap between floes triggers a **breach**: vy 22 m/s, splash and spray, then normal physics; the player lands on the nearest floe.
- **Sinking:** below y −30 for more than 8 s, or EN empty below y −35 → `Lost under the ice.` (death). Except during the scripted drowning, where the `drown` action owns the player.
- **Camera underwater:** when the camera is below y −24, the level stores the current art and blends to the `underwater` art (§15.3) over 0.4 s. On surfacing it blends back to the stored art. (Zone and action art blends are partial, so anything a blend changes has to be put back explicitly.)

### 12.7 Pilot vitals

A new HUD widget (§16 R3): a small heart trace and a bpm number near the AP bar. It's the most important clue in the level.
- **Before the drowning (Juno alive):** `bpm = 74 + 42 × combatIntensity + 24 × (1 − AP/APmax)`, plus scripted spikes (raid 128, fall 146, boot 112 decaying to 84 over 60 s, drowning 150 to 172), clamped to 62 to 175, smoothed (damp k 0.6). The trace has natural variation (±4% beat-to-beat).
- **The flatline:** a flat trace and `SENSOR FAULT` for exactly 4 s before the cut to black.
- **After the reboot:** exactly **60**, with a perfectly regular trace, in combat or not, on every checkpoint after `cp_floes`, for the rest of the campaign. Save `vitals: 'locked'` in campaign state.

### 12.8 Moth turns north when idle

From the waking onward: when there's been no move or look input for 5 s, the player is on the ground and `combatIntensity < 0.2`, Moth's body (not the camera) turns slowly to face north (0.35 rad/s), then holds. Any input turns it back. Implementation: `player.idleFacing = 0` (§16 R6). This sets up Kit's line at the end, and Juno's *"Stop turning. East is that way."* the first time it happens in Z3.

### 12.9 The sunrise wall

`levels/level01/sunrise.js`. A curtain mesh (2,000 × 120 m, vertical, gradient alpha, additive gold `#ffb070` fading up and out, plus horizontal streak noise) moving west at 260 m/s, and a trailing flat additive sheet (low opacity gold) between the curtain and the eastern horizon. Plays positional `iceGroan` at 6 points along the front every 0.6 s. When the front passes the player: triggers the floe split (§7.1) and finishes the global art blend. After 12 s both meshes fade out and are removed. Low tier: the same meshes (they're cheap); no bloom, so raise their opacity 30%.

### 12.10 Kit's flares

`{ call: 'kitFlare', args: { at: Pos, burst?: number } }`: a flare projectile arcs from Tick (or from off-screen, if Tick is far) to a point, bursts at height (`burst`) or lands, and burns as a red-pink pool of light (`fx.emitter('fire', { color: [1, 0.35, 0.45] })` plus a pooled point light when available) for 40 s. Used at s 900 (the "follow the red" flare), on the Z3 wrecks (burning), and on the fast ice (the road of flares). Gleaners within 25 m of a burning flare are blinded (they drift and don't attack) for 4 s.

---

## 13. The Bench, version 1 (after Level 1)

The bible §7 is the rule. This section says exactly what exists after Level 1 and how it maps onto the architecture's garage and loadout.

### 13.1 Reconciling with the architecture

The architecture's garage v1 (§6.13, §8.5) is a frame picker plus a weight-and-power fitting puzzle across three frames. The story replaces it in the campaign: there is one frame (Moth), and the economy is water, giving, and (from L2) memory. So:

- **Frame:** a new frame id `moth` (vanguard stats from §8.5: AP 9000, EN 1000, speed 30, quick boost 82, load 60, power 40) with a new design `moth` (the vanguard dressing in Founders' colours, §15.6, plus the lattice-ring emblem on the left shoulder). The FRAME tab is not shown in the campaign Bench.
- **Slots:** R-ARM = `R`, L-ARM = `L`, SHOULDER = `S`, utility = `U` (repair kits, fixed). BOOSTER, LEGS and CORE are new hardpoints with no alternatives until L2, so the Bench shows them as fixed stock cards.
- **Weight and power** stay in the data but never constrain in V1: the heaviest V1 loadout weighs 42 against a load of 60 and draws 26 against a power of 40. The Bench hides the load and power bars.
- **Parts:** the L1 parts map to architecture ids as follows. Display names are the story's.

| Story part | Slot | Architecture id | Weapon type | Notes |
| --- | --- | --- | --- | --- |
| Lantern Carbine (stock) | R | `rifle_r30` | rifle | renamed, prototype values |
| Psalter Blade (stock) | L | `blade_pb2` | blade | renamed, prototype values |
| Chorus Rack (stock) | S | `msl_vm4` | missiles | renamed, prototype values |
| Repair kits (fixed) | U | `kit_rk3` | kit | 3 kits |
| Sleet Gun | R | `shotgun_s8` | shotgun | renamed and retuned (below) |
| Gaff Harpoon | L | `harpoon_gaff` (new) | `harpoon` (new) | |
| Flare Pod | S | `flare_pod` (new) | `flares` (new) | |

`mg_r12` and `msl_sw8` are listed in the architecture as unlocked by l01. In the campaign they are **not** awarded by Level 1; they stay in the catalogue for the test level and the free garage only.

### 13.2 What the player can choose (exactly)

The Bench screen after Level 1 has four tabs: **FIT**, **HAUL**, **WAKE** and **LATTICE**, and one button, **WALK ON**.

1. **FIT.** For each of R-ARM, L-ARM and SHOULDER, choose the stock part or the matching L1 part, if hauled:
   - R-ARM: Lantern Carbine or Sleet Gun
   - L-ARM: Psalter Blade or Gaff Harpoon
   - SHOULDER: Chorus Rack or Flare Pod

   BOOSTER (Cantor Wings), LEGS (Cantor Stride) and CORE (Hymnal Core) are shown with their stats and the note `No other parts yet.` Utility (repair kits ×3) is shown and fixed. Fitted parts appear on the Moth model in the Bench scene immediately.
2. **HAUL** (the Locker). Every hauled part that isn't fitted: up to **4**. Duplicates of an owned part become **spares** (marked `SPARE`, give-only). Stock parts that get replaced don't use Locker space; they hang on the Bench wall and can always be refitted.
3. **GIVE.** Any hauled part (fitted, in the Locker, or a spare) can be given to the Wake. **Water += give value** and **Arms += give value**. Every L1 part has a give value of 1. Giving a fitted part refits the stock part.
4. **Undo.** Every Fit and Give can be undone until WALK ON.
5. **WAKE** tab (read-only): water now, the draw at the Morning Count (3), the result, and the Wake Roll (40 rigs, 300 souls, with names).
6. **LATTICE** tab (read-only): the header `MOTH — RECOVERED FRAGMENTS (12)` and 12 cards, each showing only its gloss and three redaction bars (§13.6). No actions.
7. **WALK ON:** confirm, then the Morning Count.

Nothing else is choosable in V1: no hungry parts, no overwrites, no Calls, no Sync.

### 13.3 Where the parts come from in Level 1

| Part | Sources in L1 | How often a first-time player gets it |
| --- | --- | --- |
| Gaff Harpoon | Any Gaffer skiff (about 7 in the level; the TEAR lesson guarantees one); cache A (the old wreck at s 1010, l −175) | Always |
| Sleet Gun | Any Sleet skiff (about 6) | Usually |
| Flare Pod | `carrier1` (Z3), `carrier2` (Z4), cache B (the crown roost shelf) | Usually |

The rack holds 3, so a player who wants all three types has to manage swaps. Caches are architecture `collectibles` of kind `salvage` whose `unlocks` is a haul part id; the haul system listens for the `pickup` event and racks the part instead of unlocking it (§16 R8).

### 13.4 How each choice changes Moth

| Part | Plays like | Exact values |
| --- | --- | --- |
| **Lantern Carbine** (stock R) | Balanced auto-rifle with lock-on lead | 245 dmg, 70 imp, every 0.135 s, 680 m/s, 600 rounds, spread 0.008 (prototype) |
| **Sleet Gun** (R) | A short-range stagger machine; the fastest way to set up TEARs | 8 pellets × (140 dmg, 110 imp) per shot, every 0.85 s, 520 m/s, 96 shells, 4.5° cone. Full damage to 40 m, falling linearly to 25% at 80 m, nothing past 90 m. At close range one shot staggers a skiff (impMax 900). |
| **Psalter Blade** (stock L) | Pulse-blade lunge to the locked target | 2,300 dmg, 700 imp, cooldown 2.6 s, lunge 75 m at 110 m/s (prototype) |
| **Gaff Harpoon** (L) | Grapple and pull; replaces blade melee | Cable 80 m, cooldown 3.0 s, head 220 m/s. On a small or medium target (impMax ≤ 1,000): reels it to 12 m in front of Moth over 0.6 s, 300 dmg and 2,000 impact (a guaranteed stagger, so a TEAR). On a heavy, a boss part, terrain or a structure: pulls Moth to the hit point at 70 m/s, stopping 6 m short and keeping momentum. TEAR still works with the harpoon fitted. |
| **Chorus Rack** (stock S) | Four-lock missile volley | 4 × (620 dmg, 260 imp), cooldown 7 s, 80 missiles, turn 2.6, accel 110, max 175 (prototype) |
| **Flare Pod** (S) | Defence and light; replaces missiles | 6 flares (no refill until checkpoint or resupply), cooldown 2 s. Fires one flare toward the aim point (arc, up to 60 m), or straight up with nothing aimed. Any hostile missile within 30 m of Moth when it fires retargets to the flare. A flare lights a 40 m radius for 30 s. A flare that hits an enemy sticks and blinds it for 4 s (no firing, AI drifts). |
| Cantor Wings, Cantor Stride, Hymnal Core | Fixed | Prototype: quick boost 82 m/s for 170 EN; hover 150 EN/s; jump 17 m/s; speed 30 m/s; AP 9,000; EN 1,000; impMax 1,400 |

**On the model:** Dredge parts are dark iron and oxide red, bolted onto the white ceramic with visible brackets and riveted straps (part visuals `sleet`, `harpoon`, `flarepod`). The Sleet Gun replaces the right forearm's rifle; the Gaff Harpoon replaces the left forearm's blade emitter with a launcher and cable reel; the Flare Pod replaces the shoulder pod. Plain parts get no green light.

### 13.5 Water and the Morning Count (Day 1)

- **Water at the Bench** = 4 (start) + sledges flagged (0 to 3) + gives.
- **The Morning Count draw after L1 is 3.** Water after the Count = that − 3. The minimum is 1 (no sledges, no gives), so nobody can lose rigs on Day 1. Typical: 4 + 2 − 3 = **3**.
- **Arms** = total given (0 to 3 after L1).

**Morning Count card (Day 1):**
```
DAY 1
WATER    3 TANKS      (4 + 2 sledges − 3 drawn)      ← real numbers
WAKE ROLL   40 RIGS · 300 SOULS
— no names lost —
"Found a war machine in the ice. Kit named it. Of course Kit named it."
```
The map strip shows the edge as a glowing line and the Wake as a dot at 38°N on it (bible §9.5).

### 13.6 Lattice tab content (V1, read-only)

Header `MOTH — RECOVERED FRAGMENTS (12)`. Cards in this order, each showing the gloss in Moth's mono small caps and three redaction bars of random length (seeded by id):

F01 `BRIDGE / RAIN / VEHICLE AT REST` · F02 `VOCAL / CHILD / FEVER / LONG NIGHT` · F03 `HANDS / STEERING BAR / MALE ADULT` · F04 `VEHICLE DESIGNATION: PATIENCE` · F05 `KITE / STRING / SMALL HAND` · F06 `ICE / CUTTING / FIRST / APPLAUSE` · F07 `FEMALE VOICE / UNRESOLVED` · F08 `TASTE / COLD / FIRST LIGHT` · F09 `FIRE / CROWD / RHYTHM` · F10 `DESIGNATION / ADULT MALE / CALLING` · F11 `STARS / ROOF / COUNTING` · F12 `LIGHTS / NIGHT / LOSS / MALE ADULT`

No true titles and no card text are in the shipped V1 data for the UI to read (the true titles and texts can live in `fragments.json` but the V1 UI must not render them).

### 13.7 Bench 1 script

The frame kneels in the Bench crawler's cradle under the work lamp; the camera orbits slowly; the music-box motif plays (bible §12.6).

**`b1_arrive`** · scene opens
- OMA: Morning, girl. Put the frame in the cradle. Easy.

**`b1_hatch`** · 3 s later
- OMA: Open her up. I want a look at the pilot.
- MOTH: The hatch seal is damaged.
- OMA: Is it.
- {wait 2}
- OMA: Then show me what you brought.

**`b1_haul`** · HAUL tab first opened (or 6 s after `b1_hatch`)
- OMA: Everything on this rig was something else first. That's not salvage, girl. That's family history.

**`b1_give`** · Give first hovered or pressed
- OMA: What you don't bolt on, I strip for the Wake. Seals, plate, condensers. Water's water.

**`b1_fit_sleet`** · Sleet Gun first fitted
- OMA: Skiff gun. Loud and short. Like the boy.

**`b1_fit_gaff`** · Gaff Harpoon first fitted
- OMA: Harpoon. Never hook anything you can't carry.

**`b1_fit_flare`** · Flare Pod first fitted
- OMA: Flares. Light's cheap. Being seen isn't.

**`b1_lattice`** · LATTICE tab first opened · *(lie #2, verbatim)*
- MOTH: Recovered during the thaw. They are mine, I think. They are mostly about water.
- JUNO: Same as everyone.

**`b1_gave_all`** · WALK ON with every hauled part given
- OMA: Generous. Hope you don't need any of it.

**`b1_kept_all`** · WALK ON with nothing given
- OMA: Keeping the lot. Your da was the same.

**`b1_walkon`** · WALK ON
- OMA: Wake rolls at first light. Keep up.

Lie #3 ("The hatch seal is damaged.") is the bible's; Oma's "Is it." is canon. Oma opens the hatch offscreen that night; nothing in this scene shows it.

### 13.8 Data (V1)

```json
// parts.json (V1 subset)
[
  { "id": "lantern_carbine", "engineId": "rifle_r30",   "name": "Lantern Carbine", "slot": "R-ARM",    "stock": true,  "hunger": 0, "give": 0 },
  { "id": "psalter_blade",   "engineId": "blade_pb2",   "name": "Psalter Blade",   "slot": "L-ARM",    "stock": true,  "hunger": 0, "give": 0 },
  { "id": "chorus_rack",     "engineId": "msl_vm4",     "name": "Chorus Rack",     "slot": "SHOULDER", "stock": true,  "hunger": 0, "give": 0 },
  { "id": "cantor_wings",    "engineId": null,          "name": "Cantor Wings",    "slot": "BOOSTER",  "stock": true,  "hunger": 0, "give": 0 },
  { "id": "cantor_stride",   "engineId": null,          "name": "Cantor Stride",   "slot": "LEGS",     "stock": true,  "hunger": 0, "give": 0 },
  { "id": "hymnal_core",     "engineId": null,          "name": "Hymnal Core",     "slot": "CORE",     "stock": true,  "hunger": 0, "give": 0 },
  { "id": "sleet_gun",    "engineId": "shotgun_s8",   "name": "Sleet Gun",    "slot": "R-ARM",    "stock": false, "hunger": 0, "give": 1,
    "source": "L1:skiff_sleet", "visual": { "kit": "dredge", "ghostLight": false, "id": "sleet" } },
  { "id": "gaff_harpoon", "engineId": "harpoon_gaff", "name": "Gaff Harpoon", "slot": "L-ARM",    "stock": false, "hunger": 0, "give": 1,
    "source": "L1:skiff_gaffer", "visual": { "kit": "dredge", "ghostLight": false, "id": "harpoon" } },
  { "id": "flare_pod",    "engineId": "flare_pod",    "name": "Flare Pod",    "slot": "SHOULDER", "stock": false, "hunger": 0, "give": 1,
    "source": "L1:gleaner_carrier", "visual": { "kit": "dredge", "ghostLight": false, "id": "flarepod" } }
]
```

```json
// campaign state after L1 (typical), in save.flags.campaign
{ "day": 1, "water": 3, "arms": 0, "sledges": 2, "vitals": "locked",
  "roll": "<40 rigs from bible §12.5, all walking>",
  "parts": { "sleet_gun": "locker", "gaff_harpoon": "fitted", "flare_pod": "locker" },
  "spares": [], "fitted": { "R-ARM": "lantern_carbine", "L-ARM": "gaff_harpoon", "SHOULDER": "chorus_rack",
                             "BOOSTER": "cantor_wings", "LEGS": "cantor_stride", "CORE": "hymnal_core" },
  "fragments": { "F01": "intact", "F02": "intact", "F03": "intact", "F04": "intact", "F05": "intact", "F06": "intact",
                 "F07": "intact", "F08": "intact", "F09": "intact", "F10": "intact", "F11": "intact", "F12": "intact" },
  "kernel": 4, "revealSeen": false, "benchVisits": 1, "tearCount": 4 }
```

**Flow after Level 1:** debrief → Bench 1 → Morning Count → L2 briefing. This needs a `bench` context for `garage.open` and a Morning Count screen (§16 R13). Fallback for the first build: the debrief, then `garage.open()` restricted to the three L1 slots, then an outro interstitial page with the Morning Count text above.

---

## 14. Pacing

| Segment | First-time target | Skilled | Intensity | Notes |
| --- | --- | --- | --- | --- |
| Prologue and vista | 0:33 | 0:08 (skip) | none | |
| The cutter | 1:42 | 1:05 | low | Jokes, routine. |
| Raid and fall | 1:00 | 0:45 | spike, helpless | |
| Boot and waking | 0:35 | 0:30 | quiet | Non-skippable (story). |
| Cavern crawl and shaft | 1:25 | 0:50 | quiet, tense | |
| Kit reconnect | 0:30 | 0:20 | | |
| Kit pinned | 2:45 | 1:30 | medium | Most tutorial density. |
| After-fight and Gleaners | 1:50 | 1:00 | medium, dread | |
| The pass | 0:20 | 0:10 | quiet | Reveal. |
| The Sexton | 1:50 | 1:00 | high | |
| Drums and the climb | 2:15 | 1:15 | quiet, eerie | The breather. |
| Crown reveal and descent | 0:35 | 0:25 | awe | |
| The Icebreaker | 3:40 | 2:15 | high | |
| Sunrise and drowning | 0:45 | 0:45 | climax, then black | Non-skippable. |
| Floe sprint | 2:30 | 1:40 | high, exhilarating | |
| The shore and the name | 1:25 | 1:25 | quiet | Non-skippable. |
| **Total** | **≈ 23:40** | **≈ 15:00** | | Within the 15 to 25 minute target. |

The sunrise lands at about 19:00 for a first-time player and about 12:00 on a skilled run. The bible's "minute 15" sits between the two.

The intensity curve alternates: low → spike → quiet → medium → dread → high → quiet → awe → high → climax → black → high → quiet. No two high segments touch without a quiet beat between them, except the boss into the sprint, which is the point.

**If it runs long** (playtest median over 25 min), cut in this order: the `c_lost_drum` branch, `e_shaft` floor 4, Icebreaker phase 2's cut-line strike (keep the sweep), one Teeth wave (`pin_g2`/`pin_s2`, keep the TEAR fail-safe).

---

## 15. Art, light, audio and music by zone

### 15.1 Base art (night)

```js
palette: { ground: '#b8c6d6', rock: '#5d7899', sediment: '#2b3a4f', high: '#d6dee8', dust: '#c9d4e2',
           wet: '#1b2633', concrete: '#8a8f96', rust: '#6e3a24', accent: '#e0a030' },
toneMapping: 'aces',
sky: { top: '#02050c', mid: '#08122a', horizon: '#16203a',
       sun: { azimuth: 350, elevation: 58, color: '#7fd6c0', size: 0, glow: 0 },   // aurora key light; no visible disc
       stars: 1.0, clouds: { cover: 0.12, color: '#1a2440', speed: 0.3 },
       ridges: { height: 1.2, color: '#0b1222', layers: 2 } },
fog: { color: '#141d33', density: 0.0011, heightFalloff: 0.02, heightBase: -10, inscatter: 0.3, sunColor: '#4a7f8a' },
light: { sun: 0.9, sunColor: '#8fd8c8', hemiSky: '#3a5a8c', hemiGround: '#0a1020', hemi: 1.3,
         rim: 1.4, rimColor: '#6a7fb0', exposure: 1.15, env: 0.5 },
grade: { contrast: 1.08, saturation: 0.92, lift: [0, 0.01, 0.03], gain: [0.95, 1.0, 1.08],
         shadowsTint: [0.85, 0.95, 1.15], vignette: 0.34, grain: 0.035 },
bloom: { strength: 1.0, radius: 0.65, threshold: 0.8 },
weather: { type: 'snow', intensity: 0.15, wind: [3, -1] },
```

Extras: the aurora (§16 R11) as green-to-violet curtains centred at azimuth 350°, 40° to 75° elevation; the **dawn rim** as a custom skyline arc (azimuth 60° to 130°, 0° to 3°, additive `#ff5a2a` fading to `#7a2a40`), brightening per zone; the Wake's lights as a skyline row of warm points.

### 15.2 Per-zone and per-event art

| Zone or event | Changes from the base | Notes |
| --- | --- | --- |
| Z1 The Cut | base | Wake lamps give warm pools (2 pooled point lights near the sled). |
| Z2 Under the Ice | fog `#0b2a3c` density 0.006, heightFalloff 0; light sun 0.2, hemi 0.7, hemiSky `#2a6f9a`; exposure 1.3; bloom strength 1.2; weather clear | Blue ice-glow. The cutter's amber light and Moth's cyan visor are the only warm and cold points. |
| Z3 The Teeth | fog density 0.0014; weather snow 0.2; dawn rim 1.2× | Icebreaker glow skyline at azimuth 95°. |
| Z4 The Abeyance | fog density 0.0013 | Sodium work lamps inside (emissive `#ffb04a`, one pooled point light). |
| Z5 The Cut-line (pre-dawn) | sky mid `#132040`, horizon `#2a2d4a`; fog `#1d2440` density 0.0012, inscatter 0.5; hemi 1.5; exposure 1.2; dawn rim 2× | Blue hour. |
| **Sunrise** (event, 9 s blend) | sky top `#0e1a36`, mid `#3a3a5a`, horizon `#ff9a5c`; sun azimuth 95, elevation 5.5, color `#ffb070`, size 1.4, glow 1.0; fog `#c88a6a` density 0.0009, inscatter 1.0, sunColor `#ffb27a`; light sun 6.0, sunColor `#ffad6b`, hemiSky `#8fa6d0`, hemiGround `#3a2a26`, hemi 1.6, rim 2.2, rimColor `#7fa0e0`, exposure 1.0, env 0.7; grade contrast 1.06, saturation 1.1, gain [1.08, 1.0, 0.92], shadowsTint [0.8, 0.9, 1.2], highlightsTint [1.1, 1.0, 0.88]; bloom 0.9 / threshold 0.9; weather snow 0.05 | Long blue shadows. The aurora fades out over the blend. |
| Z6 The Floes | sunrise art; fog density 0.0007 | Sun elevation follows the sun clock (§12.5). Steam-fog emitters over open water. |
| Z7 The Shore | sunrise art; sun elevation 9°; grade gain [1.1, 1.02, 0.9] | Warmest light of the level. |

### 15.3 Underwater art (drowning and swimming)

`fog: { color: '#0a2420', density: 0.035, heightFalloff: 0 }`, `light: { sun: 1.2, hemi: 0.6, hemiSky: '#2f6f5a' }`, `grade: { saturation: 0.7, gain: [0.8, 1.05, 0.95], vignette: 0.55 }`, `bloom: { strength: 0.6 }`. Additive bubble particles from Moth's vents, alpha silt particles, god-ray cones under gaps. Blend in 0.4 s.

### 15.4 Low tier

From the bible plus specifics: stars and aurora baked into the sky; floes as instanced bevelled slabs with tint-only shading (no shadow map); underwater by fog and tint only; the *Abeyance* as one merged mesh; no point lights (lamps are emissive only, Kit's flares become additive sprites); the light wall's opacity raised 30% (no bloom); Gleaner cab lights keep a minimum on-screen size of 3 px; at most 2 Wake rigs at LOD0.

### 15.5 Audio

| Moment | Sound |
| --- | --- |
| Night ambience | Wind over ice (`wind` loop), distant ice cracks every 6 to 14 s (`iceCrack`, panned), a faint shimmer under the aurora |
| Cutter | Small servo whines, a diesel putter, the saw (`saw`: a rising metal whine plus grit) |
| Skiffs | A turbine whine (Doppler), sail snap, runner hiss on ice, a slap on water |
| Gleaners | A thin rotor whine (`rotorWhine`), a soft click on every green blink (only within 40 m) |
| Cavern | Dripping, deep ice groans, Moth's footfalls echoing (reverb send) |
| Icebreaker | A 4 s deep thrum (audible from Z3), track clatter, saw screams, the PA through heavy static |
| Drowning | Everything low-passed at 400 Hz; heartbeat (`heartbeat`) rising; `flatline` tone; then total silence for the black |
| Reboot | A single rising pad note, then the HUD boot chirps |
| Sunrise | A swelling chord; `iceGroan` travelling with the front |
| Shore | Wind, a far-off Wake generator hum, the fire crackle of Kit's flares |
| The Foreman | The **chime**: three descending notes (sine plus a soft bell partial, E5 → C5 → A4, 0.35 s apart), then unnaturally clean silence under the line |

New SFX names (additive to architecture Appendix C.1): `chime`, `heartbeat`, `flatline`, `iceGroan`, `iceCrack`, `saw`, `harpoon`, `winch`, `rotorWhine`, `tear`, `bubbles`, `splash`.

### 15.6 Music

Three level themes as inline `ThemeDef`s (full values in §17):
- **`l01_night`**: 60 bpm, root A1 (55 Hz), natural minor; a sawtooth pad (low cutoff), a sparse sine bass, icy triangle plinks; no drums.
- **`l01_dredge`** (combat): 112 bpm, root G1 (49 Hz), Phrygian; a sawtooth bass ostinato, a square pulse, the `industrial` kit. Used for the pin, the wrecks, the Sexton and the Icebreaker.
- **`l01_dawn`**: 126 bpm, root A1, Dorian; pad, bass, the `tribal` kit, a high triangle lead. The floe sprint.

Stingers: `dread` (the skiff lights, the Gleaners, the Sexton's reveal), `discovery` (Moth's visor lights), `boss` (the Icebreaker's reveal at the crown), `checkpoint`. The drowning has no music. The naming ends on the first four notes of the bridge-song motif on a music box, which carries into the Bench.

**Moth's colours** (design `moth`): base `#d9d4c7` (weathered white ceramic), mid `#a9a497`, accent `#c9a24a` (Founders' gold), dark `#3a3d40`, visor `#6ff3ff`, flame `#bff6ff`, blade `#8fe9ff`, wear 0.6 (rust streaks and ice scars).

---

## 16. Engine requests (additive) and fallbacks

Everything here is additive under the architecture's rules (§4: new exports, optional parameters and optional fields are allowed). "Required" means the level's story doesn't work without it.

| # | Request | Owner | Needed for | Fallback in `levels/level01/` |
| --- | --- | --- | --- | --- |
| R1 | `player.abilities` (`{ move: number (speed scale), jump, hover, boost, fire, blade, missile, lock, kit, interact }`, default all on) and `player.hoverCostScale` (default 1). Gated actions read as idle. | P4 | §8.1, §12.1, §12.5 | **Required for clean behaviour.** Fallback: wrap `ctx.input.down/pressed` to swallow gated actions while the level is loaded (restored on `level:cleared`), and clamp horizontal velocity in a `physics` system. |
| R2 | `hud.setSlots({ R, L, S, K: { state: 'ready' \| 'offline' \| 'hidden', label? } })` and `hud.setPanels({ en, radar, compass, objectives, vitals, rack })` | P5 | The HUD coming online; the cutter's `SAW` | Full HUD always on (acceptable). |
| R3 | Pilot vitals widget: `hud.vitals({ mode: 'live' \| 'flat' \| 'locked' \| 'hidden', bpm?, fault?: string })` with a canvas heart trace | P5 | The level's main clue | **Required.** |
| R4 | `hud.waterline(frac)`: a water line rising up the HUD glass with refraction wobble | P5 | Drowning | Raise underwater fog density instead. |
| R5 | Comms renders above `#fade` and the letterbox. `SpeakerDef` gains `label`, `speed` (multiplier), `font` (`'sans' \| 'monoCaps' \| 'serif'`), `weight`, `italic`, `static` (0 to 1), `channel` (`LOCAL` / `WAKE` / `OPEN` / `DREDGE`) and `chime` (play `chime` before the line, override the queue). Also a `system` style for `BOOT` with no label. | P5 (+P1 for the SFX) | Boot text and "Hold on to me." over black; character typography; the Foreman | **Required:** comms over the fade. Typography fallback: colour only. |
| R6 | `player.idleFacing: number \| null` (§12.8) | P4 | The name | Level system nudges `bodyYaw` and the rig root after the player update. |
| R7 | `player.animOverride: Partial<MechAnimState> \| null` (the level sets `{ crouch: 1 }` to kneel) | P4 (+P3 if `animateMech` needs a full kneel pose) | The shore kneel; the alcove | **Required.** |
| R8 | TEAR and the Haul rack as a game system (§12.3): glint data on units (`SpawnOpts.config.haul = { part, glintAt }`), the prompt, the rip animation, the rack HUD, pickups, and `pickup` events of kind `salvage` routed to the rack | P4 (system), P5 (rack HUD, prompt), P3 (rip pose) | The core L1 mechanic and the Bench | Temporary level implementation in `levels/level01/haul.js` (a system that watches staggered glinting units, swallows the blade input while TEAR is up, plays a simplified rip, and draws nothing: the rack shows in hints only). |
| R9 | `hud.choice` with up to 4 options (keys 1 to 4 on desktop) and a `timeScale` while open | P5 | Rack swap | 2 options: `Drop the oldest` / `Leave it`. |
| R10 | New SFX (§15.5) | P1 | | Nearest existing SFX. |
| R11 | `art.sky.aurora: { intensity, colorA, colorB, azimuth, height }` in the sky shader | P1 | Night look | Level skyline object with ribbon meshes. |
| R12 | New weapon types `harpoon` and `flares`; new parts `harpoon_gaff`, `flare_pod`; `shotgun_s8` renamed and retuned as the Sleet Gun; new frame `moth`; new design `moth` with part visuals `sleet`, `harpoon`, `flarepod`; Sexton part visuals `gaffpike`, `drumrack`, `ghostlight` | P4, P3 | Bench V1, the Sexton | **Required** for the Bench. The Sexton can use plain Bastion in Dredge colours. |
| R13 | Bench mode of the garage (`garage.open({ context: 'bench', levelId })`), a Morning Count screen (`screens.showMorningCount(m)`), and campaign state in `save.flags.campaign`; flow: debrief → Bench → Count → next briefing | P3, P5 | §13 | Restricted garage plus an outro text page (§13.8). |
| R14 | `mech` AI respects `home` and `leash` | P4 | The Sexton stays near the pad | Level code clamps its position to the leash after the AI update. |
| R15 | `hud.prompt(text, { key?: string, hold?: boolean })` | P5 | `TEAR` (hold) | Put the key in the text. |
| R16 | `player.invuln` honoured by `combat.damage` for the player (it's already a Target field) | P4 | The cutter | `combat.god` toggled by level code. |

Everything else in this level uses the §6 format as written, plus custom actions and conditions registered in `custom.install` (listed in §17).

---

## 17. Level definition draft (`levels/level01.js`)

This draft targets architecture §6 exactly. Custom actions (`call`) and conditions (`custom`) are registered by `levels/level01/index.js`. World coordinates are used where an object isn't route-relative (the hull's interior, the edge, the Raft, the floes). Values are starting points; tune against screenshots.

```js
// levels/level01.js — Level 1: THAW. Draft from docs/level-01.md (build team only).
import { installLevel01 } from './level01/index.js';

const SEA = -24;                 // sea plane
const FLOE_TOP = SEA + 2.4;      // -21.6
const ABEY = { s: 1545, l: 0 };  // Abeyance base centre (world -51.2, -63.3)
const AX = -51.2, AZ = -63.3;    // Abeyance base, world

// ── music (inline ThemeDefs: flow applies def.music before custom.install) ─────────────
const NIGHT = { bpm: 60, root: 55, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 4],
  layers: { pad: { wave: 'sawtooth', vol: 0.16, cutoff: 900, octave: 2 },
            bass: { wave: 'sine', vol: 0.2, pattern: 'x.......', octave: 0 },
            arp: { wave: 'triangle', vol: 0.05, pattern: 'x.x...x.', octave: 4 } },
  intensity: { arp: [0.1, 0.5] } };
const DREDGE = { bpm: 112, root: 49, scale: [0, 1, 3, 5, 7, 8, 10], progression: [0, 0, 1, 0],
  layers: { bass: { wave: 'sawtooth', vol: 0.28, cutoff: 700, pattern: 'x.xx.x.x', octave: 1 },
            pulse: { wave: 'square', vol: 0.1, cutoff: 1400, pattern: 'x.x.x.x.', octave: 2 },
            drums: { kit: 'industrial', vol: 0.5, pattern: 'x...x.x.' },
            pad: { wave: 'sawtooth', vol: 0.1, cutoff: 600, octave: 2 } },
  intensity: { drums: [0.3, 0.8], pulse: [0.5, 1.0] } };
const DAWN = { bpm: 126, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 6, 4],
  layers: { pad: { wave: 'sawtooth', vol: 0.18, cutoff: 1600, octave: 2 },
            bass: { wave: 'triangle', vol: 0.24, pattern: 'x..x..x.', octave: 1 },
            drums: { kit: 'tribal', vol: 0.45, pattern: 'x.x.xx.x' },
            lead: { wave: 'triangle', vol: 0.07, octave: 4 } },
  intensity: { drums: [0.2, 0.7], lead: [0.4, 0.9] } };

// ── art presets reused by zones, actions and checkpoints ────────────────────────────────
// Zone and action blends are partial (atmosphere.set), so every preset that leaves a zone
// must restore what the previous one changed. ART_NIGHT holds the full night values.
const ART_NIGHT = {
  sky: { top: '#02050c', mid: '#08122a', horizon: '#16203a',
         sun: { azimuth: 350, elevation: 58, color: '#7fd6c0', size: 0, glow: 0 },   // aurora key light, no disc
         stars: 1.0, clouds: { cover: 0.12, color: '#1a2440', speed: 0.3 },
         ridges: { height: 1.2, color: '#0b1222', layers: 2 },
         aurora: { intensity: 0.8, colorA: '#4dffb0', colorB: '#9a6aff', azimuth: 350, height: 55 } },   // R11
  fog: { color: '#141d33', density: 0.0011, heightFalloff: 0.02, heightBase: -10, inscatter: 0.3, sunColor: '#4a7f8a' },
  light: { sun: 0.9, sunColor: '#8fd8c8', hemiSky: '#3a5a8c', hemiGround: '#0a1020', hemi: 1.3,
           rim: 1.4, rimColor: '#6a7fb0', exposure: 1.15, env: 0.5 },
  grade: { contrast: 1.08, saturation: 0.92, lift: [0, 0.01, 0.03], gain: [0.95, 1.0, 1.08],
           shadowsTint: [0.85, 0.95, 1.15], vignette: 0.34, grain: 0.035 },
  bloom: { strength: 1.0, radius: 0.65, threshold: 0.8 },
  weather: { type: 'snow', intensity: 0.15, wind: [3, -1], lightning: 0, fogBoost: 1 },
};
const ART_TEETH = { fog: { ...ART_NIGHT.fog, density: 0.0014 }, light: ART_NIGHT.light, bloom: ART_NIGHT.bloom,
                    weather: { ...ART_NIGHT.weather, intensity: 0.2, wind: [4, -1] } };
const ART_UNDER = { fog: { color: '#0b2a3c', density: 0.006, heightFalloff: 0 },
  light: { sun: 0.2, hemi: 0.7, hemiSky: '#2a6f9a', exposure: 1.3 }, bloom: { strength: 1.2 },
  weather: { type: 'clear', intensity: 0 } };
const ART_PREDAWN = { sky: { mid: '#132040', horizon: '#2a2d4a' },
  fog: { color: '#1d2440', density: 0.0012, inscatter: 0.5 }, light: { hemi: 1.5, exposure: 1.2 } };
const ART_DAWN = {
  sky: { top: '#0e1a36', mid: '#3a3a5a', horizon: '#ff9a5c',
         sun: { azimuth: 95, elevation: 5.5, color: '#ffb070', size: 1.4, glow: 1.0 }, stars: 0.1 },
  fog: { color: '#c88a6a', density: 0.0009, heightFalloff: 0.02, inscatter: 1.0, sunColor: '#ffb27a' },
  light: { sun: 6.0, sunColor: '#ffad6b', hemiSky: '#8fa6d0', hemiGround: '#3a2a26', hemi: 1.6,
           rim: 2.2, rimColor: '#7fa0e0', exposure: 1.0, env: 0.7 },
  grade: { contrast: 1.06, saturation: 1.1, gain: [1.08, 1.0, 0.92], shadowsTint: [0.8, 0.9, 1.2],
           highlightsTint: [1.1, 1.0, 0.88] },
  bloom: { strength: 0.9, threshold: 0.9 }, weather: { type: 'snow', intensity: 0.05, wind: [2, 0] } };
const ART_WATER = { fog: { color: '#0a2420', density: 0.035, heightFalloff: 0 },
  light: { sun: 1.2, hemi: 0.6, hemiSky: '#2f6f5a' }, grade: { saturation: 0.7, gain: [0.8, 1.05, 0.95], vignette: 0.55 },
  bloom: { strength: 0.6 } };

// ── level-only data consumed by custom code (floes.js, icebreaker.js, units.js) ─────────
const DATA = {
  sea: SEA,
  shelfEdge: [[628, -470], [645, -300], [636, -120], [650, 40], [638, 210], [655, 470]],
  raft: { x0: 655, x1: 900, count: 22, size: [40, 90], freeboard: 3, seed: 7101 },
  floes: { x0: 900, x1: 1290, size: [14, 45], freeboard: 2.4, seed: 7102, maxGap: 22, maxGoldHops: 2,
           leads: [ [[900, -120], [1000, -80], [1150, -110], [1290, -90]],
                    [[930, 100], [1040, 60], [1180, 75], [1280, 110]],
                    [[960, 230], [1100, 300], [1250, 270]] ],
           guaranteed: [{ x: 856, z: 23, r: 26 }] },
  bergs: [ { id: 'B1', x: 995, z: 30, r: 22, h: 24 }, { id: 'B2', x: 1075, z: 120, r: 25, h: 28 },
           { id: 'B3', x: 1150, z: 185, r: 22, h: 22 }, { id: 'B4', x: 1240, z: 130, r: 24, h: 26 },
           { id: 'B5', x: 1300, z: 15, r: 22, h: 20 },  { id: 'B6', x: 1340, z: -60, r: 18, h: 18 },
           { id: 'B7', x: 920, z: -60, r: 16, h: 16 },  { id: 'B8', x: 1180, z: 260, r: 18, h: 20 },
           { id: 'B9', x: 1210, z: -40, r: 15, h: 16 } ],
  sunClock: { from: 5.5, to: 9, seconds: 180, azimuth: 95 },
  sled3: { x: 1010, z: 262 },
  icebreaker: { start: { x: 590, z: -340, azimuth: 180 }, laneX: 610, laneZ: [-340, 380],
                harvest: { x: 600, z: -8, azimuth: 90 }, collarY: -8 },
  skiffLeadsZ3: [ [[-700, -20], [-600, 60], [-480, 130], [-340, 100], [-240, 0]],
                  [[-640, 180], [-560, 120], [-500, 40]] ],
  abeyance: { x: AX, z: AZ, yawAzimuth: 122, floors: [22, 44, 66, 88, 108], crown: 122 },
};

export default {
  id: 'l01', title: 'THAW', subtitle: 'The Rime Shelf', order: 1, seed: 116001,
  par: { time: 1080, damage: 18000 },

  briefing: {
    header: 'THE WAKE · CUT ORDER', title: 'THAW', subtitle: 'The Rime Shelf',
    body: 'Edge is coming. Wake rolls at first light.\n' +
          'Three blocks from the west cut before we go. Take the cutter and the boy. The boy flies, you cut.\n' +
          "Don't go past the ridges. Don't wait for the sun.\n" +
          '— O. Desh, the Bench',
    objectives: ['Cut three blocks', 'Back before the sun'], fine: 'Keep up.', showMap: false,
  },
  intro: [{ style: 'black', hold: 9, text:
    'GAUNT. One day lasts ten years. The dawn walks west, eleven kilometres a day. Behind it, the ground burns. ' +
    'Ahead of it, the sea is ice. Between them, for a few hundred kilometres, there is water. We follow it.' }],
  outro: [],                      // Bench 1 + Morning Count via flow (R13); fallback page in §13.8
  unlocks: { levels: ['l02'] },

  speakers: {   // R5 fields (label, speed, font, static, channel, chime) are additive; unknown fields are ignored today
    JUNO:      { name: 'JUNO', color: '#ffb547', voice: { base: 220, wave: 'triangle' }, style: 'internal',
                 channel: 'LOCAL', font: 'sans', speed: 1.0, static: 0 },
    MOTH:      { name: 'CANTOR 7', color: '#7fe9ff',   // renamed to 'MOTH' by renameSpeaker at the naming (§18.1) voice: { base: 330, wave: 'sine' }, style: 'internal',
                 channel: 'LOCAL', font: 'monoCaps', speed: 1.0, static: 0 },
    KIT:       { name: 'KIT · TICK', color: '#c6e86a', voice: { base: 520, wave: 'square', jitter: 0.15 }, style: 'radio',
                 channel: 'WAKE', speed: 1.4, static: 0.25 },
    OMA:       { name: 'OMA · BENCH', color: '#f2e6d0', voice: { base: 180, wave: 'sawtooth' }, style: 'radio',
                 channel: 'WAKE', speed: 0.8, static: 0.25, weight: 600 },
    FOREMAN:   { name: '', color: '#e9d79a', voice: { base: 140, wave: 'sine' }, style: 'intercept',
                 channel: 'OPEN', speed: 0.7, italic: true, static: 0, chime: true },
    BOOT:      { name: '', color: '#9fb8c4', voice: { base: 900, wave: 'square' }, style: 'system',
                 font: 'monoCaps', speed: 1.8 },
    DREDGE_PA: { name: 'DREDGE · ICEBREAKER', color: '#d0583a', voice: { base: 160, wave: 'sawtooth', jitter: 0.3 },
                 style: 'intercept', channel: 'DREDGE', speed: 1.0, static: 0.7 },
  },

  factions: {
    dredge:   { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#ffb04a', wear: 0.55 },
    ghost:    { shell: '#2f2b29', mid: '#6a2a1c', accent: '#e0a030', dark: '#141211', eye: '#9dffb0', wear: 0.7 },
    wake:     { shell: '#b9a98a', mid: '#4f7d7a', accent: '#c8682e', dark: '#2a2420', eye: '#ffd08a', wear: 0.6 },
    founders: { shell: '#e6e2d8', mid: '#c9c3b5', accent: '#d8b25a', dark: '#3a3d40', eye: '#6ff3ff', wear: 0.4 },
  },

  music: { theme: NIGHT, combat: DREDGE },

  route: {
    points: [[-1420, 20], [-1280, 60], [-1130, 40], [-985, -25], [-850, -70], [-720, -40], [-610, 60],
             [-480, 130], [-340, 90], [-230, -20], [-120, -90], [-10, -40], [90, 0], [200, 0], [330, 10],
             [560, -10], [790, 0], [920, 20], [1010, 140], [1120, 190], [1230, 90], [1300, -50],
             [1380, -100], [1440, -60], [1480, -40]],
    halfWidth: [300, 300, 300, 300, 320, 360, 400, 420, 420, 380, 380, 380, 420, 450, 450,
                450, 450, 420, 400, 400, 380, 360, 320, 300, 300],
  },

  terrain: {
    macroCell: 8,
    base: { scale: 600, amp: 5, octaves: 4, ridged: 0.3, warp: 60, terrace: { step: 2.5, strength: 0.4 } },
    features: [
      // the bay walls and the Teeth (visual bases; colliders come from pressure_ridge structures)
      { kind: 'ridge', at: { s: 60, l: -150 }, to: { s: 300, l: -150 }, r: 40, h: 12, sharpness: 0.7 },
      { kind: 'ridge', at: { s: 60, l: 140 },  to: { s: 300, l: 120 },  r: 40, h: 10, sharpness: 0.7 },
      { kind: 'ridge', at: { s: 700, l: -120 }, to: { s: 1000, l: -90 }, r: 50, h: 18, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 760, l: 130 },  to: { s: 1040, l: 150 }, r: 50, h: 16, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 1080, l: -150 }, to: { s: 1290, l: -70 }, r: 45, h: 22, sharpness: 0.8 },
      { kind: 'ridge', at: { s: 1100, l: 120 },  to: { s: 1300, l: 70 },  r: 45, h: 22, sharpness: 0.8 },
      // the Thornback, east of the shore (crest about +130)
      { kind: 'ridge', at: [2650, -1500], to: [2900, 1400], r: 450, h: 130, sharpness: 0.5 },
    ],
    detail: { scale: 14, amp: 0.5 },
    walls: { height: 40, start: 0.82, noise: 0.6 },
    carve: { depth: 0.5, bedWidth: 90, shoulder: 60, smooth: 200, maxGrade: 0.06, strength: 0.6 },
    erosion: { droplets: 30000, thermal: 1 },
    stamps: [
      // Z1 bay
      { at: { s: 170, l: 0 }, r: 160, falloff: 30, mode: 'flatten', h: 0 },
      // Z2 cavern trench (y -18), s 330..640 every 25 m; wider at the waking hall
      ...Array.from({ length: 13 }, (_, i) => ({ at: { s: 330 + i * 25 }, r: i < 4 ? 50 : 34, falloff: 6, mode: 'flatten', h: -18, noScatter: true })),
      { at: { s: 625 }, r: 14, falloff: 4, mode: 'flatten', h: -18, noScatter: true },
      { at: { s: 625 }, r: 30, falloff: 10, mode: 'raise', h: 16 },        // shaft rim (the ring structure sits inside)
      // Z4 apron, Z5 field
      { at: { s: 1440 }, r: 150, falloff: 40, mode: 'flatten', h: 0 },
      { at: { s: 1545 }, r: 60, falloff: 20, mode: 'flatten', h: 0 },
      ...[1760, 1880, 2000, 2120].flatMap(s => [-260, 0, 260].map(l => ({ at: { s, l }, r: 170, falloff: 50, mode: 'flatten', h: 0 }))),
      // open water: seabed at -70, x 660..1290, inside 0.8 × half-width
      ...[700, 810, 920, 1030, 1140, 1250].flatMap(x => [-300, -150, 0, 150, 300].map(z => ({ at: [x, z], r: 110, falloff: 20, mode: 'flatten', h: -70, noScatter: true }))),
      // (no base-terrain island may survive above the sea inside x 660..1360: P6 asserts this at load)
      // fast ice and the beach ramp
      { at: { s: 3165, l: -20 }, r: 70, falloff: 15, mode: 'flatten', h: -21, noScatter: true },
      { at: { s: 3215, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -15 },
      { at: { s: 3250, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -9 },
      { at: { s: 3285, l: 0 }, r: 60, falloff: 20, mode: 'flatten', h: -3 },
      { at: { s: 3320, l: 0 }, r: 70, falloff: 25, mode: 'flatten', h: 3 },
    ],
  },

  art: {
    ...ART_NIGHT,
    palette: { ground: '#b8c6d6', rock: '#5d7899', sediment: '#2b3a4f', high: '#d6dee8', dust: '#c9d4e2',
               wet: '#1b2633', concrete: '#8a8f96', rust: '#6e3a24', accent: '#e0a030' },
    toneMapping: 'aces',
    skyline: [
      { kind: 'custom', custom: 'dawnRim', at: { azimuth: 95, dist: 4000 }, size: 1 },
      { kind: 'custom', custom: 'wakeLights', at: [1700, -40], size: 1 },
      { kind: 'smoke', at: [600, -200], size: 1.2, color: '#ffb04a' },   // Icebreaker's lit steam plume
    ],
    scatter: [
      { prop: 'slab', density: 1.6, scale: [2, 6], slope: [0, 0.6], align: 0.4, collide: true, collideMinScale: 4, castShadow: true },
      { prop: 'spire', density: 0.15, scale: [3, 8], avoidRoute: true, collide: true, collideMinScale: 4, castShadow: true },
      { prop: 'rock_small', density: 10, scale: [0.6, 1.6], maxDist: 220 },             // ice rubble (palette-tinted)
      { prop: 'pebbles', density: 80, maxDist: 120 },                                     // snow grit (ground cover)
    ],
  },

  zones: [
    { id: 'z_cut', range: [0, 320], name: 'The Cut', card: { title: 'THE CUT', sub: 'West edge, Rime Shelf' },
      structures: [
        { id: 'block1', type: 'ice_block', at: { s: 115, l: -55 }, yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block' } },
        { id: 'block2', type: 'ice_block', at: { s: 165, l: 45 },  yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block' } },
        { id: 'block3', type: 'ice_block', at: { s: 215, l: -35 }, yaw: 'route', destructible: { ap: 900, name: 'CUT MARK', tag: 'block' } },
        { id: 'sled1', type: 'ice_sled', at: { s: 160, l: -5 }, yaw: 'route', state: 'loaded0' },
        ...[[60, -40], [100, 60], [140, -90], [190, 80], [230, -70], [270, 30]].map(([s, l]) => ({ type: 'wake_lamp', at: { s, l } })),
        { type: 'windbreak', at: { s: 80, l: 95 }, yaw: { azimuth: 20 }, params: { length: 14 } },
        { type: 'tank_cairn', at: { s: 40, l: 70 }, params: { n: 9 } },
        { type: 'pressure_ridge', at: { s: 30, l: -10 }, yaw: { azimuth: 10 }, params: { length: 180, h: 14, seed: 1 } },   // west wall
        { type: 'pressure_ridge', at: { s: 120, l: -150 }, yaw: 'route', params: { length: 120, h: 12, seed: 2 } },         // north wall (gap s 180..280)
        { type: 'pressure_ridge', at: { s: 300, l: -130 }, yaw: 'route', params: { length: 60, h: 14, seed: 3 } },
        { type: 'pressure_ridge', at: { s: 170, l: 140 }, yaw: 'route', params: { length: 260, h: 12, seed: 4 } },          // south wall
        { type: 'pressure_ridge', at: { s: 310, l: -40 }, yaw: 'route', params: { length: 60, h: 16, seed: 5 } },           // gully north
        { type: 'pressure_ridge', at: { s: 310, l: 40 },  yaw: 'route', params: { length: 60, h: 16, seed: 6 } },           // gully south
        { id: 'snowBridge', type: 'snow_bridge', at: { s: 322 }, yaw: 'route', params: { span: 70, width: 50 }, state: 'intact' },
      ] },

    { id: 'z_under', range: [320, 640], name: 'Under the Ice',          // no card: the player arrives during the boot
      art: ART_UNDER, artBlend: 1.5,
      structures: [
        ...Array.from({ length: 10 }, (_, i) => ({ type: 'ice_vault', at: { s: 345 + i * 30, h: 0 }, yaw: 'route', params: { span: i < 3 ? 100 : 72, thickness: 6 } })),
        ...Array.from({ length: 10 }, (_, i) => [-1, 1].map(sd => ({ type: 'ice_wall', at: { s: 345 + i * 30, l: sd * (i < 3 ? 48 : 33) }, yaw: 'route', params: { length: 32, h: 34 } }))).flat(),
        { id: 'cutterWreck', type: 'cutter_wreck', at: { s: 345, l: 10 }, yaw: { azimuth: 150 } },
        { id: 'alcove', type: 'moth_alcove', at: { s: 375, l: -28 }, yaw: { azimuth: 63 }, state: 'sealed' },
        { type: 'founders_pod', at: { s: 430, l: 30 }, yaw: { azimuth: 200 } },
        { type: 'founders_pod', at: { s: 540, l: -30 }, yaw: { azimuth: 40 } },
        ...[[505, -14], [515, 12], [528, -4], [540, 18]].map(([s, l]) => ({ type: 'ice_pillar', at: { s, l }, params: { h: 22, r: 4 } })),
        { id: 'shaft', type: 'shaft_ring', at: { s: 625 }, params: { r: 12, h: 34 } },
      ] },

    { id: 'z_teeth', range: [640, 1350], name: 'The Teeth', card: { title: 'THE TEETH', sub: 'Pressure ridges' },
      art: ART_TEETH, artBlend: 3,                                   // also undoes ART_UNDER
      structures: [
        // representative maze walls; P6 completes the set (~22) along the ridge features
        { type: 'pressure_ridge', at: { s: 780, l: -110 }, yaw: 'route', params: { length: 160, h: 18, seed: 11 } },
        { type: 'pressure_ridge', at: { s: 840, l: 150 },  yaw: 'route', params: { length: 140, h: 16, seed: 12 } },
        { type: 'pressure_ridge', at: { s: 930, l: 115 },  yaw: { azimuth: 30 }, params: { length: 60, h: 14, seed: 13 } },   // Kit's dead end
        { type: 'pressure_ridge', at: { s: 1000, l: -100 }, yaw: 'route', params: { length: 120, h: 20, seed: 14 } },
        { type: 'pressure_ridge', at: { s: 1060, l: 160 },  yaw: 'route', params: { length: 160, h: 18, seed: 15 } },
        { type: 'pressure_ridge', at: { s: 1200, l: -110 }, yaw: 'route', params: { length: 180, h: 22, seed: 16 } },
        { type: 'pressure_ridge', at: { s: 1220, l: 110 },  yaw: 'route', params: { length: 160, h: 22, seed: 17 } },
        { type: 'pressure_ridge', at: { s: 1300, l: -55 },  yaw: 'route', params: { length: 60, h: 25, seed: 18 } },          // the pass
        { type: 'pressure_ridge', at: { s: 1300, l: 55 },   yaw: 'route', params: { length: 60, h: 25, seed: 19 } },
        { id: 'wreckA', type: 'skiff_wreck', at: { s: 1130, l: -40 }, yaw: { azimuth: 70 }, tag: 'harvest', params: { seed: 1 } },
        { id: 'wreckB', type: 'skiff_wreck', at: { s: 1160, l: 35 },  yaw: { azimuth: 250 }, tag: 'harvest', params: { seed: 2 } },
        { id: 'wreckOld', type: 'skiff_wreck', at: { s: 1010, l: -175 }, yaw: { azimuth: 10 }, params: { seed: 3, frozen: true } },
        { type: 'tank_cairn', at: { s: 760, l: 40 }, params: { n: 6 } },
        { type: 'marker_buoy', at: { s: 1090, l: 60 }, params: { toppled: true } },
      ] },

    { id: 'z_abeyance', range: [1350, 1700], name: 'The Abeyance', card: { title: 'THE ABEYANCE', sub: 'Frozen freighter' },
      art: { fog: { density: 0.0013 } },
      structures: [
        { id: 'abeyance', type: 'abeyance', at: ABEY, yaw: 'route', params: { tilt: 7, height: 140 } },
        { id: 'pad', type: 'gleaner_pad', at: { s: 1470, l: -60 }, yaw: 'route' },
        { type: 'drum_rack', at: { s: 1480, l: -95 }, yaw: 'route', tag: 'harvest', params: { n: 4 } },
        ...[[1545, -8], [1540, 8], [1552, -6], [1550, 7], [1558, -8], [1560, 8]].map(([s, l], i) => ({ id: 'rack' + i, type: 'drum_rack', at: { s, l }, yaw: 'route', tag: 'harvest', params: { n: 8 } })),
        { id: 'winchLock', type: 'winch_lock', at: { s: 1545, l: -13, h: 8 }, yaw: 'route',
          destructible: { ap: 1500, name: 'WINCH LOCK', tag: 'winch', objective: true } },
        { id: 'sled2', type: 'ice_sled', at: { s: 1545, l: -10 }, yaw: 'route', state: 'loaded3', params: { paint: 'HARDTACK' } },
        { type: 'founders_lifeboat', at: { s: 1420, l: 70 }, yaw: { azimuth: 30 } },
        ...[[1400, -40], [1415, 20], [1450, 55], [1460, -110], [1490, 30], [1500, -20]].map(([s, l], i) =>
           ({ type: 'founders_pod', at: { s, l }, yaw: { azimuth: i * 47 } })),
      ] },

    { id: 'z_cutline', range: [1700, 2500], name: 'The Cut-line', card: { title: 'THE CUT-LINE', sub: 'Dredge harvest ground' },
      art: ART_PREDAWN, music: DREDGE,
      structures: [
        ...[[1850, -120], [1900, 90], [2050, 200], [2100, -260]].map(([s, l]) => ({ type: 'block_stack', at: { s, l }, yaw: 'route', params: { rows: 4 } })),
        { type: 'cable_sled_train', at: { s: 1960, l: -130 }, yaw: { azimuth: 10 }, params: { n: 6 } },
        ...[[1780, 150], [1950, 260], [2150, 120], [2180, -150]].map(([s, l]) => ({ type: 'marker_buoy', at: { s, l } })),
        // the sawn shelf edge (vertical collider face); segments follow DATA.shelfEdge
        { type: 'ice_cliff', at: [636, -385], yaw: { azimuth: 185 }, params: { length: 175, h: 80 } },
        { type: 'ice_cliff', at: [640, -210], yaw: { azimuth: 177 }, params: { length: 182, h: 80 } },
        { type: 'ice_cliff', at: [643, -40],  yaw: { azimuth: 185 }, params: { length: 162, h: 80 } },
        { type: 'ice_cliff', at: [644, 125],  yaw: { azimuth: 176 }, params: { length: 171, h: 80 } },
        { type: 'ice_cliff', at: [646, 340],  yaw: { azimuth: 184 }, params: { length: 262, h: 80 } },
      ] },

    { id: 'z_floes', range: [2500, 3130], name: 'The Floes', card: { title: 'THE FLOES' },
      art: { fog: { density: 0.0007 } }, music: DAWN },

    { id: 'z_shore', range: [3130, 3334], name: 'The Shore', card: { title: 'THE SHORE', sub: 'The Wake' },
      art: { sky: { sun: { azimuth: 95, elevation: 9 } }, grade: { gain: [1.1, 1.02, 0.9] } },
      structures: [
        { id: 'hole', type: 'fast_ice_hole', at: { s: 3185, l: -20 }, params: { r: 4.5 } },
        { id: 'bench', type: 'bench_crawler', at: { s: 3290, l: 20 }, yaw: { azimuth: 270 } },
        { type: 'wake_rig', at: { s: 3265, l: 80 },  yaw: { azimuth: 250 }, params: { kind: 'walker', name: 'SECOND PATIENCE', seed: 2 } },
        { type: 'wake_rig', at: { s: 3320, l: -70 }, yaw: { azimuth: 200 }, params: { kind: 'train', name: 'BIG MERCY', seed: 3 } },
        { type: 'wake_rig', at: { s: 3310, l: 150 }, yaw: { azimuth: 260 }, params: { kind: 'crawler', name: 'COMPASS ROSE', seed: 4 } },
        // ~20 instanced generic rigs along the beach out to 1.2 km are placed by custom code (wakeCamp)
      ] },
  ],

  checkpoints: [
    { id: 'cp_cut',      at: { s: 40, l: -20 },  yaw: 'route', label: 'The cut' },
    { id: 'cp_cavern',   at: { s: 384, l: -18 }, yaw: { azimuth: 63 }, label: 'Under the ice' },
    { id: 'cp_ridges',   at: { s: 690, l: 0 },   yaw: 'route', label: 'The Teeth' },
    { id: 'cp_abeyance', at: { s: 1375, l: 0 },  yaw: 'route', label: 'The Abeyance' },
    { id: 'cp_cutline',  at: { s: 1735, l: 0 },  yaw: 'route', label: 'The cut-line' },
    { id: 'cp_harvest',  at: { s: 2200, l: 0 },  yaw: { azimuth: 90 }, label: 'The shelf edge' },
    { id: 'cp_floes',    at: { x: 856, z: 23, y: FLOE_TOP }, yaw: { azimuth: 100 }, label: 'The floes' },
  ],

  objectives: [
    { id: 'o_look', text: "Find Kit's kite", kind: 'manual' },
    { id: 'o_cut', text: 'Cut three blocks', kind: 'destroy', target: { tag: 'block', count: 3 }, showCount: true, marker: 'targets' },
    { id: 'o_gully', text: 'Run for the east gully', kind: 'reach', at: { s: 320 }, r: 60, marker: true },
    { id: 'o_up', text: 'Find a way up', kind: 'reach', at: { s: 625 }, r: 26 },
    { id: 'o_climb', text: 'Climb out', kind: 'flag', flag: 'outOfShaft' },
    { id: 'o_kit', text: 'Reach Kit', kind: 'reach', at: { s: 860, l: 40 }, r: 80, marker: { s: 900, l: 70 } },
    { id: 'o_skiffs', text: 'Drive the skiffs off Tick', kind: 'kill', target: { tag: 'pin' }, showCount: true, marker: 'targets' },
    { id: 'o_sled1', text: 'Flag the sledge', kind: 'flag', flag: 'sled1', optional: true },   // prompt placed by custom 'flagSled'
    { id: 'o_wrecks', text: 'Keep the Gleaners off the wrecks', kind: 'kill', target: { encounter: 'e_gleaners' } },
    { id: 'o_abeyance', text: 'Make for the Abeyance', kind: 'reach', at: { s: 1370 }, r: 80, marker: true },
    { id: 'o_sexton', text: 'Destroy the Sexton', kind: 'kill', target: { tag: 'sexton' }, marker: 'targets' },
    { id: 'o_climb2', text: 'Climb the Abeyance', kind: 'flag', flag: 'crown', marker: { x: AX, z: AZ, y: 124 } },
    { id: 'o_sled2', text: "Free Hardtack's sledge", kind: 'flag', flag: 'sled2', optional: true },
    { id: 'o_heads', text: "Break the Icebreaker's drill heads", kind: 'destroy', target: { tag: 'drillhead', count: 3 },
      showCount: true, marker: 'targets' },
    { id: 'o_surface', text: 'Surface', kind: 'flag', flag: 'surfaced' },
    { id: 'o_shore', text: "Follow Kit's flares to the shore", kind: 'reach', at: { s: 3130 }, r: 60, marker: true },
    { id: 'o_sled3', text: 'Flag the drifting sledge', kind: 'flag', flag: 'sled3', optional: true,
      failIf: { flag: 'sled3Lost' }, marker: { x: 1010, z: 262 } },
    { id: 'o_bench', text: 'Bring the frame in', kind: 'reach', at: { s: 3290, l: 20 }, r: 18, marker: true },
  ],

  encounters: [
    { id: 'e_raid', units: [
        { kind: 'skiff', at: { s: 150, l: -330 }, opts: { name: 'RAIDER SKIFF', tags: ['raid', 'raid_g1'], behavior: 'scripted', targetable: false, config: { variant: 'gaffer', script: 'raidSled' } } },
        { kind: 'skiff', at: { s: 240, l: -340 }, opts: { name: 'RAIDER SKIFF', tags: ['raid'], behavior: 'scripted', targetable: false, config: { variant: 'gaffer', script: 'rakeCutter' } } },
        { kind: 'skiff', at: { s: 300, l: -300 }, opts: { name: 'RAIDER SKIFF', tags: ['raid'], behavior: 'scripted', targetable: false, config: { variant: 'sleet', script: 'rakeCutter' } } } ],
      persist: false },

    { id: 'e_pin', units: [
        { kind: 'skiff', at: { s: 960, l: 40 },  opts: { name: 'RAIDER SKIFF', tags: ['pin', 'sled1tow'], config: { variant: 'gaffer', haul: 'gaff_harpoon', circle: { s: 900, l: 70 }, towing: 'sled1' } } },
        { kind: 'skiff', at: { s: 990, l: 110 }, opts: { name: 'RAIDER SKIFF', tags: ['pin'], config: { variant: 'sleet', haul: 'sleet_gun', circle: { s: 900, l: 70 } } } } ],
      waves: [ { when: { remaining: 1 }, units: [
        { kind: 'skiff', at: { s: 1080, l: -60 }, opts: { name: 'RAIDER SKIFF', tags: ['pin'], ap: 1400, config: { variant: 'gaffer', haul: 'gaff_harpoon' } } },
        { kind: 'skiff', at: { s: 1100, l: 20 },  opts: { name: 'RAIDER SKIFF', tags: ['pin'], config: { variant: 'sleet', haul: 'sleet_gun' } } } ] } ] },

    { id: 'e_gleaners', units: [
        { kind: 'gleaner', count: 3, at: { s: 1130, l: -40, h: 6 }, spread: 12, opts: { name: 'GLEANER', config: { mode: 'harvest', target: 'wreckA' } } },
        { kind: 'gleaner', count: 3, at: { s: 1160, l: 35, h: 6 },  spread: 12, opts: { name: 'GLEANER', config: { mode: 'harvest', target: 'wreckB' } } } ],
      waves: [ { when: { delay: 25 }, units: [
        { kind: 'gleaner_carrier', at: { s: 1500, l: -100, h: 70 }, opts: { name: 'GLEANER CARRIER', tags: ['carrier'],
          config: { hold: { s: 1180, l: -20, h: 38 }, deploy: { every: 12, per: 2, max: 4, cap: 6 }, flares: 3, haul: 'flare_pod', leaveAfter: 90 } } } ] } ] },

    { id: 'e_apron', units: [
        { kind: 'mech', at: { s: 1470, l: -40 }, opts: { name: 'SEXTON', tags: ['sexton'], boss: true, behavior: 'guard', leash: 140,
          config: { design: 'bastion', faction: 'ghost', ap: 11000, impMax: 2400, aggression: 0.8, dodge: 0.5, preferRange: 40,
                    weapons: ['mg', 'blade'], rifleDmg: 120, bladeDmg: 1800, phases: [{ at: 0.5, aggression: 1.0, add: ['shock'] }],
                    parts: { visuals: ['gaffpike', 'drumrack', 'ghostlight'] } } } },
        { kind: 'gleaner_carrier', at: { s: 1470, l: -60, h: 35 }, opts: { name: 'GLEANER CARRIER', tags: ['carrier'],
          config: { hold: { s: 1470, l: -60, h: 35 }, deploy: { every: 12, per: 2, max: 6, cap: 3 }, flares: 3, haul: 'flare_pod' } } },
        { kind: 'gleaner', count: 3, at: { s: 1480, l: -95, h: 10 }, spread: 15, opts: { name: 'GLEANER', config: { mode: 'defend' } } } ] },

    { id: 'e_shaft', units: [
        { kind: 'gleaner', count: 2, at: { x: AX, z: AZ, y: 50 }, spread: 8, opts: { name: 'GLEANER', config: { mode: 'defend', indoor: true } } } ],
      waves: [ { when: 'cleared', units: [
        { kind: 'gleaner', count: 2, at: { x: AX, z: AZ, y: 94 }, spread: 8, opts: { name: 'GLEANER', config: { mode: 'defend', indoor: true } } } ] } ] },

    { id: 'e_hold', units: [
        { kind: 'gleaner', count: 2, at: { s: 1550, l: 0, h: 10 }, spread: 6, opts: { name: 'GLEANER', config: { mode: 'defend', indoor: true } } } ] },

    { id: 'e_field', units: [
        { kind: 'skiff', at: { s: 1900, l: 90 },   opts: { name: 'RAIDER SKIFF', config: { variant: 'sleet', haul: 'sleet_gun' } } },
        { kind: 'skiff', at: { s: 2000, l: -150 }, opts: { name: 'RAIDER SKIFF', config: { variant: 'gaffer', haul: 'gaff_harpoon' } } } ] },

    { id: 'e_icebreaker', units: [
        { kind: 'icebreaker', at: [590, -340], opts: { name: 'ICEBREAKER', tags: ['icebreaker'], boss: true, yaw: Math.PI,
          config: { data: 'icebreaker', heads: { port: 8000, stbd: 8000, bow: 14000 }, turrets: 2,
                    skiffLaunch: { every: [40, 50], max: 3 } } } } ] },

    { id: 'e_floes', units: [
        { kind: 'skiff', at: { s: 2650, l: -80 }, opts: { name: 'RAIDER SKIFF', config: { variant: 'sleet', water: true, lead: 0, haul: 'sleet_gun' } } },
        { kind: 'skiff', at: { s: 2800, l: 60 },  opts: { name: 'RAIDER SKIFF', config: { variant: 'gaffer', water: true, lead: 1, haul: 'gaff_harpoon' } } },
        { kind: 'skiff', at: { s: 2950, l: -40 }, opts: { name: 'RAIDER SKIFF', config: { variant: 'sleet', water: true, lead: 2, haul: 'sleet_gun' } } } ],
      persist: false },
  ],

  triggers: [
    // ── Z1 ────────────────────────────────────────────────────────────────────────────
    { id: 't_look', when: { objective: 'o_look' }, do: [
        { comms: 'c_watchNorth' }, { objective: { add: 'o_cut' } },
        { hint: { desktop: 'W A S D to walk', touch: 'Left thumb to walk' } } ] },
    { id: 't_block1_near', when: { enter: { at: { s: 115, l: -55 }, r: 30 } }, after: 't_look', do: [
        { comms: 'c_block1_near' }, { hint: { desktop: 'Right click to saw', touch: 'Tap BLADE to saw' } } ] },
    { id: 't_block1', when: { structure: 'block1', state: 'cut' }, do: [{ comms: 'c_block1' }, { call: 'sledLoad', args: { n: 1 } }] },
    { id: 't_block2', when: { structure: 'block2', state: 'cut' }, do: [{ comms: 'c_block2' }, { call: 'sledLoad', args: { n: 2 } }] },
    { id: 't_block3', when: { structure: 'block3', state: 'cut' }, do: [{ comms: 'c_block3' }, { call: 'sledLoad', args: { n: 3 } }] },
    { id: 't_raid', when: { objective: 'o_cut' }, do: [
        { wait: 2 }, { music: { stinger: 'dread' } }, { comms: 'c_lights', wait: true },
        { call: 'kite', args: { land: true } }, { call: 'tick', args: { path: [{ s: 200, l: 120 }, { s: 300, l: 60 }, { s: 330, l: 300 }], speed: 16, hideAtEnd: true } },
        { spawn: 'e_raid' }, { music: { theme: DREDGE } }, { call: 'vitals', args: { spike: 128 } },
        { wait: 4 }, { comms: 'c_raid_sled' },
        { wait: 4 }, { comms: 'c_raid_gully' }, { objective: { add: 'o_gully' } } ] },
    { id: 't_raid_hit', when: { custom: 'playerHit' }, after: 't_raid', do: [{ comms: 'c_raid_hit' }] },
    { id: 't_raid_failsafe', when: { all: [{ timer: 25, since: 't_raid' }, { not: { pass: 260 } }] }, do: [{ call: 'raidTowCutter', args: { to: { s: 310 } } }] },
    { id: 't_collapse', when: { pass: 318 }, after: 't_raid', do: [{ event: 'collapse' }] },

    // ── Z2 ────────────────────────────────────────────────────────────────────────────
    { id: 't_name', when: { pass: 460 }, after: 't_collapse', do: [{ comms: 'c_name' }] },
    { id: 't_signal', when: { pass: 560 }, after: 't_collapse', do: [{ comms: 'c_signal' }] },
    { id: 't_shaft', when: { enter: { at: { s: 625 }, r: 26 } }, after: 't_collapse', do: [
        { call: 'abilities', args: { preset: 'jump' } }, { comms: 'c_shaft' },
        { hint: { desktop: 'Space to jump. Hold it in the air to hover. Hover burns EN.', touch: 'JUMP. Hold it in the air to hover.' } },
        { objective: { complete: 'o_up' } }, { objective: { add: 'o_climb' } } ] },
    { id: 't_out', when: { custom: 'aboveY', args: { y: 8, near: { s: 625 }, r: 40 } }, after: 't_shaft', do: [
        { flag: ['outOfShaft', true] }, { checkpoint: 'cp_ridges' }, { music: { theme: NIGHT } },
        { call: 'tick', args: { park: { s: 900, l: 70 }, pinned: true } }, { call: 'kite', args: { follow: 'tick', h: 80 } },
        { comms: 'c_kit_reconnect', wait: true }, { objective: { add: 'o_kit' } } ] },
    { id: 't_kitflare', when: { custom: 'commsLine', args: { text: 'Coming. Put up a flare.' } }, do: [
        { call: 'kitFlare', args: { from: { s: 900, l: 70 }, at: { s: 900, l: 70, h: 180 }, burst: true } } ] },

    // ── Z3 ────────────────────────────────────────────────────────────────────────────
    { id: 't_idle_north', when: { all: [{ enterZone: 'z_teeth' }, { custom: 'idleNorthReached' }] }, do: [{ comms: 'c_idle_north' }] },
    { id: 't_pin', when: { pass: 820 }, after: 't_out', do: [
        { spawn: 'e_pin' }, { music: { theme: DREDGE } }, { waitFor: { custom: 'enemyWithin', args: { r: 300 } }, timeout: 10 },
        { call: 'abilities', args: { preset: 'lock' } }, { comms: 'c_pin' },
        { hint: { desktop: 'Aim near a target to lock on. Left click fires. E holds the lock.', touch: 'Aim near a target to lock on. FIRE shoots. LOCK holds it.' } },
        { objective: { complete: 'o_kit' } }, { objective: { add: 'o_skiffs' } } ] },
    { id: 't_qb', when: { custom: 'harpoonTelegraph' }, after: 't_pin', do: [
        { call: 'abilities', args: { add: ['boost'] } }, { comms: 'c_qb' },
        { hint: { desktop: 'Shift + direction to quick boost. Snaps harpoon cables.', touch: 'BOOST + direction to dash. Snaps harpoon cables.' } } ] },
    { id: 't_stagger_hint', when: { custom: 'anyStaggered' }, after: 't_pin', do: [
        { hint: 'Staggered targets take extra damage, and loose parts can be torn off.' } ] },
    { id: 't_tear', when: { custom: 'tearAvailable', args: { r: 40 } }, after: 't_pin', do: [
        { comms: 'c_tear' }, { hint: { desktop: 'Hold right click to TEAR', touch: 'Hold BLADE to TEAR' } } ] },
    { id: 't_first_tear', when: { custom: 'rackCount', args: { gte: 1 } }, do: [
        { hint: 'HAUL 1/3. Parts go to the Bench at the end of the walk.' }, { comms: 'c_first_tear' } ] },
    { id: 't_tear_failsafe', when: { all: [{ cleared: 'e_pin' }, { not: { custom: 'rackCount', args: { gte: 1 } } }] }, do: [
        { spawn: { kind: 'skiff', at: { s: 1120, l: 0 }, opts: { name: 'RAIDER SKIFF', tags: ['pin'], ap: 1000, config: { variant: 'gaffer', haul: 'gaff_harpoon', staggerOnFirstHit: true } } } } ] },
    { id: 't_sled1', when: { killed: { tag: 'sled1tow' } }, do: [
        { comms: 'c_sled1' }, { objective: { add: 'o_sled1' } }, { call: 'flagSled', args: { id: 'sled1' } },
        { hint: { desktop: 'F to flag the sledge', touch: 'INTERACT to flag the sledge' } } ] },
    { id: 't_sled1_done', when: { flag: 'sled1' }, do: [{ comms: 'c_sled1_done' }] },
    { id: 't_pin_wave', when: { custom: 'waveStarted', args: { encounter: 'e_pin', wave: 1 } }, do: [{ comms: 'c_pin_wave' }] },
    { id: 't_pin_clear', when: { cleared: 'e_pin' }, do: [
        { music: { theme: NIGHT } }, { comms: 'c_pin_clear', wait: true },
        { call: 'tick', args: { path: [{ s: 960, l: 30 }, { s: 1000, l: 10 }], speed: 10 } },
        { wait: 4 }, { comms: 'c_whatfor' } ] },
    { id: 't_gleaners', when: { pass: 1060 }, after: 't_pin_clear', do: [
        { spawn: 'e_gleaners' }, { music: { stinger: 'dread' } }, { comms: 'c_gleaners' }, { objective: { add: 'o_wrecks' } } ] },
    { id: 't_blade', when: { any: [{ custom: 'enemyWithin', args: { r: 30, kind: 'gleaner' } }, { timer: 8, since: 't_gleaners' }] }, after: 't_gleaners', do: [
        { call: 'abilities', args: { add: ['blade'] } }, { comms: 'c_blade' },
        { hint: { desktop: 'Right click to lunge with the blade. It finds your locked target.', touch: 'BLADE lunges at your locked target.' } } ] },
    { id: 't_blade_kill', when: { custom: 'bladeKill' }, after: 't_blade', do: [{ comms: 'c_blade_kill' }] },
    { id: 't_carrier', when: { custom: 'waveStarted', args: { encounter: 'e_gleaners', wave: 1 } }, do: [{ music: { theme: DREDGE } }, { comms: 'c_carrier' }] },
    { id: 't_lost_drum', when: { custom: 'drumEscaped' }, after: 't_gleaners', do: [{ comms: 'c_lost_drum' }] },
    { id: 't_burn', when: { cleared: 'e_gleaners' }, do: [
        { music: { theme: NIGHT } }, { comms: 'c_burn', wait: true }, { call: 'burnWrecks', args: { zone: 'z_teeth' } },
        { objective: { add: 'o_abeyance' } }, { call: 'tick', args: { follow: 'player', distance: 90 } } ] },
    { id: 't_abeyance_view', when: { pass: 1290 }, after: 't_burn', do: [{ comms: 'c_abeyance' }] },

    // ── Z4 ────────────────────────────────────────────────────────────────────────────
    { id: 't_apron', when: { pass: 1370 }, after: 't_burn', do: [
        { checkpoint: 'cp_abeyance' }, { call: 'tick', args: { park: { s: 1360, l: 50 } } },
        { spawn: 'e_apron' }, { music: { stinger: 'dread' } }, { comms: 'c_ghost', wait: true },
        { music: { theme: DREDGE } }, { call: 'abilities', args: { add: ['missile'] } }, { comms: 'c_missiles' },
        { hint: { desktop: 'Q fires missiles at everything inside the reticle.', touch: 'MSL fires missiles at everything in the reticle.' } },
        { objective: { complete: 'o_abeyance' } }, { objective: { add: 'o_sexton' } } ] },
    { id: 't_enemy_flares', when: { custom: 'carrierFlared' }, after: 't_apron', do: [{ comms: 'c_enemy_flares' }] },
    { id: 't_surge', when: { health: { tag: 'sexton', below: 0.5 } }, do: [{ comms: 'c_surge' }] },
    { id: 't_repair', when: { any: [{ health: { below: 0.55 } }, { killed: { tag: 'sexton' } }] }, after: 't_apron', do: [
        { call: 'abilities', args: { add: ['kit'] } }, { comms: 'c_repair' },
        { hint: { desktop: 'R uses a repair kit. You have 3.', touch: 'KIT uses a repair kit. You have 3.' } } ] },
    { id: 't_sexton_dead', when: { killed: { tag: 'sexton' } }, do: [
        { music: { theme: NIGHT } }, { wait: 3 }, { comms: 'c_drums', wait: true },
        { objective: { add: 'o_climb2' } }, { comms: 'c_climb' },
        { call: 'tick', args: { path: [{ s: 1500, l: 0 }, { s: 1545, l: 4 }, { s: 1620, l: 30 }], speed: 6, parkAtEnd: true } } ] },
    { id: 't_hold_sled', when: { custom: 'tickAt', args: { s: 1545, r: 12 } }, do: [
        { comms: 'c_hardtack' }, { spawn: 'e_hold' }, { objective: { add: 'o_sled2' } },
        { marker: { id: 'm_winch', at: { s: 1545, l: -13, h: 8 }, label: 'WINCH', kind: 'poi' } } ] },
    { id: 't_winch', when: { structure: 'winchLock', state: 'destroyed' }, do: [
        { marker: { remove: 'm_winch' } }, { call: 'flagSled', args: { id: 'sled2' } } ] },
    { id: 't_sled2_done', when: { flag: 'sled2' }, do: [{ comms: 'c_hardtack_done' }] },
    { id: 't_floor2', when: { custom: 'aboveY', args: { y: 40, near: ABEY, r: 40 } }, after: 't_sexton_dead', do: [{ spawn: 'e_shaft' }, { comms: 'c_shaft_gleaners' }] },
    { id: 't_stencil', when: { all: [{ custom: 'aboveY', args: { y: 64, near: ABEY, r: 40 } }, { custom: 'nearAnchor', args: { id: 'abeyance', anchor: 'stencil', r: 25 } }] }, do: [
        { cinematic: 'stencil' }, { comms: 'c_stencil' } ] },
    { id: 't_crown', when: { custom: 'aboveY', args: { y: 120, near: ABEY, r: 40 } }, after: 't_sexton_dead', do: [
        { flag: ['crown', true] }, { music: { stinger: 'boss' } }, { cinematic: 'cutlineReveal' },
        { comms: 'c_detour' }, { call: 'kite', args: { follow: 'player', h: 90 } },
        { call: 'tick', args: { path: [{ s: 1660, l: -120 }, { s: 1700, l: -330 }], speed: 12, hideAtEnd: true } },
        { objective: { add: 'o_heads' } } ] },

    // ── Z5 ────────────────────────────────────────────────────────────────────────────
    { id: 't_field', when: { all: [{ pass: 1720 }, { flag: 'crown' }, { custom: 'onGround' }] }, do: [
        { checkpoint: 'cp_cutline' }, { spawn: 'e_field' }, { spawn: 'e_icebreaker' }, { music: { theme: DREDGE, intensity: 1 } },
        { comms: 'c_pa1' }, { wait: 15 }, { comms: 'c_heads_hint' } ] },
    { id: 't_hull_hint', when: { custom: 'hullHit' }, do: [{ hint: 'ARMOURED. Hit the drill heads.' }] },
    { id: 't_spotlight', when: { custom: 'inFloodlight' }, do: [{ comms: 'c_spotlight' }] },
    { id: 't_head1', when: { killed: { tag: 'drillhead', count: 1 } }, do: [{ comms: 'c_head1' }] },
    { id: 't_crack', when: { custom: 'crackStrike' }, do: [{ comms: 'c_crack' }] },
    { id: 't_pa2', when: { timer: 20, since: 't_head1' }, do: [{ comms: 'c_pa2' }] },
    { id: 't_head2', when: { killed: { tag: 'drillhead', count: 2 } }, do: [{ comms: 'c_head2' }] },
    { id: 't_harvest', when: { flag: 'ib:phase', eq: 3 }, do: [
        { checkpoint: 'cp_harvest' }, { comms: 'c_auger' } ] },
    { id: 't_collar', when: { custom: 'collarHitFromAbove' }, do: [{ hint: 'Get below the collar. Fire from the Raft.' }] },
    { id: 't_finale', when: { killed: { tag: 'drillhead', count: 3 } }, do: [{ event: 'finale' }] },

    // ── Z6 ────────────────────────────────────────────────────────────────────────────
    { id: 't_rot', when: { any: [{ custom: 'touchedGold' }, { custom: 'sprintTime', args: { gte: 12 } }] }, do: [
        { comms: 'c_rot' }, { hint: 'Gold ice breaks soon after you land on it. Blue ice holds.' } ] },
    { id: 't_sink', when: { custom: 'sprintTime', args: { gte: 8 } }, do: [{ call: 'icebreakerSink' }, { wait: 2 }, { comms: 'c_sink' }] },
    { id: 't_leads', when: { custom: 'skiffRun' }, after: 't_sink', do: [{ comms: 'c_leads' }] },
    { id: 't_hunt', when: { custom: 'enemyWithin', args: { r: 120, kind: 'gleaner' } }, after: 't_sink', do: [{ comms: 'c_hunt' }] },
    { id: 't_sled3', when: { any: [{ enter: { at: [1010, 262], r: 220 } }, { custom: 'sprintTime', args: { gte: 25 } }] }, after: 't_sink', do: [
        { comms: 'c_sled3' }, { objective: { add: 'o_sled3' } }, { call: 'flagSled', args: { id: 'sled3' } } ] },
    { id: 't_sled3_done', when: { flag: 'sled3' }, do: [{ comms: 'c_sled3_done' }] },
    { id: 't_sled3_lost', when: { flag: 'sled3Lost' }, do: [{ comms: 'c_sled3_lost' }] },
    { id: 't_withme', when: { any: [{ all: [{ custom: 'sprintTime', args: { gte: 75 } }, { not: { custom: 'enemyWithin', args: { r: 150 } } }] },
                                    { custom: 'sprintTime', args: { gte: 110 } }] }, do: [{ comms: 'c_withme' }] },
    { id: 't_lastbit', when: { pass: 3060 }, after: 't_finale', do: [{ comms: 'c_lastbit' }] },

    // ── Z7 ────────────────────────────────────────────────────────────────────────────
    { id: 't_shore', when: { pass: 3130 }, after: 't_finale', do: [{ event: 'shore' }] },
    { id: 't_bench', when: { objective: 'o_bench' }, do: [{ event: 'naming' }] },
  ],

  events: {
    collapse: [
      { objective: { complete: 'o_gully' } },
      { cinematic: 'bridgeCollapse' },
      { despawn: { tag: 'raid' } },
      { fade: 1, seconds: 0.6 },
      { interstitial: [{ style: 'black', hold: 5, text: 'Its hatch was open. It was the only warm thing in the dark.' }] },
      { call: 'cutter', args: { on: false } }, { call: 'callsign', args: { name: 'JUNO', frame: 'CANTOR 7' } },
      { player: { teleport: { s: 378, l: -24 }, yaw: { azimuth: 63 } } },
      { structure: { id: 'alcove', state: 'sealed' } },
      { call: 'hudPanels', args: { all: false } },
      { comms: 'c_boot', wait: true },                                // over black (R5)
      { call: 'vitals', args: { mode: 'live', bpm: 112 } },
      { cinematic: 'mothWakes' },                                     // during: visor on, alcove 'broken', fade up
      { checkpoint: 'cp_cavern' },
      { call: 'abilities', args: { preset: 'walk' } }, { call: 'idleFacing', args: { yaw: 0 } },
      { call: 'hudPanels', args: { en: false, radar: false, compass: true, objectives: true, vitals: true } },
      { music: { theme: NIGHT } }, { comms: 'c_walk' },
      { objective: { add: 'o_up' } }, { hint: { desktop: 'W A S D to walk', touch: 'Left thumb to walk' } },
    ],

    finale: [
      { objective: { complete: 'o_heads' } },
      { call: 'drown', args: { comms: ['c_sunrise', 'c_ice_changing', 'c_fall', 'c_drown'], art: { dawn: ART_DAWN, water: ART_WATER } } },
                             // §7: auger falls, boiler shock, sunrise (art ART_DAWN), light wall, split, c_sunrise,
                             // c_ice_changing, c_fall, underwater (ART_WATER), c_drown, flatline, black, reboot,
                             // vitals locked 60; returns when control comes back underwater
      { objective: { add: 'o_surface' } }, { hint: { desktop: 'Hold Space to rise', touch: 'Hold JUMP to rise' } },
      { waitFor: { flag: 'surfaced' } },          // set by the water system's breach (§12.6); 'drown' already stopped the music
      { checkpoint: 'cp_floes' },
      { music: { theme: DAWN } },
      { call: 'floes', args: { start: true } }, { call: 'sunClock', args: { start: true } },
      { call: 'gleanerHunt', args: { on: true } }, { spawn: 'e_floes' },
      { comms: 'c_surfaced' },
      { objective: { add: 'o_shore' } },
      { wait: 3 }, { comms: 'c_icing' }, { call: 'hoverIcing', args: { scale: 2 } },
    ],

    shore: [
      { objective: { complete: 'o_shore' } },
      { call: 'kitFlare', args: { road: [{ s: 3135, l: 30 }, { s: 3150, l: -10 }, { s: 3165, l: 25 }, { s: 3180, l: -40 }, { s: 3195, l: 10 }] } },
      { comms: 'c_backoff' }, { call: 'gleanerHunt', args: { on: false, scatter: true } }, { call: 'skiffsLeave' },
      { player: { freeze: true } }, { letterbox: true },
      { call: 'mothWalk', args: { to: { s: 3180, l: -14 }, face: { s: 3185, l: -20 }, speed: 5 } },
      { call: 'kneel', args: { on: true } },
      { call: 'watchers', args: { count: 5, around: { s: 3185, l: -20 }, dist: [160, 220], h: [25, 40] } },
      { cinematic: 'shoreKneel' },   // during: comms c_ballast, bubbles once in the hole
      { call: 'kneel', args: { on: false } }, { call: 'watchers', args: { leave: true } },
      { comms: 'c_foreman', wait: true },
      { letterbox: false }, { player: { freeze: false } },
      { call: 'abilities', args: { preset: 'walk' } },   // weapons stowed: a slow walk into camp
      { objective: { add: 'o_bench' } },
    ],

    naming: [
      { player: { freeze: true } },
      { cinematic: 'naming' },        // during: turnNorth, c_naming_kit, renameSpeaker, c_naming_moth, music box, fade
      { complete: true },
    ],
  },

  cinematics: {
    vista: { skippable: true, keys: [
      { t: 0, pos: { s: 15, l: 25, h: 5 },  look: { x: AX, z: AZ, y: 75 }, fov: 36 },
      { t: 8, pos: { s: 55, l: 8, h: 12 },  look: { x: AX, z: AZ, y: 70 }, fov: 32, ease: 'inOut' } ] },
    bridgeCollapse: { skippable: false, keys: [
      { t: 0,   pos: { s: 300, l: 40, h: 14 },  look: { s: 322, h: 2 },  fov: 50 },
      { t: 2.5, pos: { s: 340, l: 20, h: -12 }, look: { s: 322, h: -4 }, fov: 55 },
      { t: 5,   pos: { s: 360, l: 10, h: -14 }, look: { s: 378, l: -28, h: -10 }, fov: 45, ease: 'inOut' } ],
      during: [ { structure: { id: 'snowBridge', state: 'collapsed' } }, { call: 'cutterFall' }, { comms: 'c_collapse' },
                { call: 'vitals', args: { spike: 146 } }, { shake: 1.2 }, { wait: 4.2 }, { call: 'alcoveGlow', args: { on: true } } ] },
    mothWakes: { skippable: false, keys: [
      { t: 0, pos: { s: 381, l: -25, h: 9.5 }, look: { s: 378, l: -24, h: 9.5 }, fov: 30 },
      { t: 3, pos: { s: 368, l: -12, h: 8 },   look: { s: 378, l: -24, h: 7 },   fov: 42, ease: 'inOut' },
      { t: 6, pos: { s: 355, l: 2, h: 10 },    look: { s: 378, l: -24, h: 6 },   fov: 50, ease: 'inOut' } ],
      during: [ { fade: 0, seconds: 1.5 }, { call: 'visor', args: { on: true } }, { music: { stinger: 'discovery' } },
                { wait: 2.5 }, { structure: { id: 'alcove', state: 'broken' } }, { shake: 0.4 } ] },
    stencil: { letterbox: false, hideHud: false, skippable: false, keys: [
      { t: 0,   pos: { x: AX + 6, z: AZ - 2, y: 75 }, look: { x: AX - 4, z: AZ - 13, y: 70 }, fov: 48 },
      { t: 2.5, pos: { x: AX + 4, z: AZ - 4, y: 74 }, look: { x: AX - 4, z: AZ - 13, y: 71 }, fov: 42 } ],
      during: [ { call: 'stencilLight', args: { on: true } } ] },
    cutlineReveal: { skippable: true, keys: [
      { t: 0, pos: { x: AX + 20, z: AZ + 4, y: 136 }, look: { x: 600, z: -200, y: 10 }, fov: 45 },
      { t: 7, pos: { x: AX + 26, z: AZ + 8, y: 134 }, look: { x: 900, z: 0, y: -10 },  fov: 38, ease: 'inOut' } ],
      during: [ { comms: 'c_cutline' } ] },
    shoreKneel: { skippable: false, keys: [
      { t: 0,  pos: { s: 3165, l: 25, h: 7 }, look: { s: 3184, l: -18, h: 4 }, fov: 40 },
      { t: 18, pos: { s: 3170, l: 35, h: 9 }, look: { s: 3184, l: -18, h: 4 }, fov: 36, ease: 'linear' } ],
      during: [ { comms: 'c_ballast', wait: true } ] },          // keys outlast the comms (about 17 s)
    naming: { skippable: false, keys: [
      { t: 0, pos: { s: 3270, l: 60, h: 8 }, look: { s: 3290, l: 20, h: 7 }, fov: 42 },
      { t: 15, pos: { s: 3262, l: 40, h: 6 }, look: { s: 3290, l: 20, h: 8 }, fov: 38, ease: 'inOut' } ],
      during: [ { call: 'turnNorth', args: { seconds: 4 } }, { wait: 3 }, { comms: 'c_naming_kit', wait: true },
                { call: 'renameSpeaker', args: { id: 'MOTH', name: 'MOTH' } }, { comms: 'c_naming_moth', wait: true },
                { call: 'musicBox' }, { fade: 1, seconds: 3 } ] },
  },

  comms: {
    c_morning: [{ who: 'KIT', text: "Morning, Jun! Kite's up. Look up. No, UP. That's me, being amazing." }],
    c_watchNorth: [{ who: 'JUNO', text: 'Morning. Keep the kite on the north for me.' },
                   { who: 'KIT', text: "Kite's on the north. North is very… dark. Good job, north." }],
    c_block1_near: [{ who: 'KIT', text: "Orange flags. I put those there. You're welcome." }],
    c_block1: [{ who: 'JUNO', text: 'One.' }, { who: 'KIT', text: 'Crooked.' }, { who: 'JUNO', text: 'Drinks the same.' }],
    c_block2: [{ who: 'KIT', text: "Two! That's more than halfway. That's two-thirds-way." }],
    c_block3: [{ who: 'JUNO', text: "Three. Sled's full. Bring Tick round." },
               { who: 'KIT', text: 'Bringing Tick round. Tick is coming round. Tick is— hang on.' }],
    c_lights: [{ who: 'KIT', text: "Lights on the ice. Lots of lights. Jun, those aren't ours." },
               { who: 'JUNO', text: 'Kite down. Get to the ridges.' }],
    c_raid_sled: [{ who: 'KIT', text: "They've got the sled— they've HARPOONED the sled—" }, { who: 'JUNO', text: 'Let it go. Move, Kit.' }],
    c_raid_hit: [{ who: 'JUNO', text: 'Dry it.' }],
    c_raid_gully: [{ who: 'KIT', text: 'East gully, Jun! The gully! GO!' }],
    c_collapse: [{ who: 'KIT', text: 'Jun? JUN—' }],
    c_boot: [{ who: 'BOOT', text: 'CANTOR 7 // KERNEL 4/4', hold: 0.6 }, { who: 'BOOT', text: 'LATTICE: EMPTY // PASSENGER: NONE', hold: 0.6 },
             { who: 'BOOT', text: 'PILOT: DETECTED', hold: 1.2 },
             { who: 'MOTH', text: 'Query: are you authorised?' }, { who: 'JUNO', text: "I'm the only one here, so yes." },
             { who: 'MOTH', text: 'This frame accepts.' }],
    c_walk: [{ who: 'JUNO', text: 'Can you climb?' }, { who: 'MOTH', text: 'Drive systems are cold. Walking only.' }],
    c_name: [{ who: 'MOTH', text: 'Query: what are you called?' }, { who: 'JUNO', text: 'Juno. You?' },
             { who: 'MOTH', text: 'Cantor 7. Nothing else is stored.' }, { who: 'JUNO', text: "That's a number, not a name." },
             { who: 'MOTH', text: 'Noted.' }],
    c_signal: [{ who: 'JUNO', text: "Kit. Kit, it's me." }, { wait: 2.5 }, { who: 'JUNO', text: "Signal's dead down here." },
               { who: 'MOTH', text: 'Correction: the ice is thick. The signal is not dead.' }, { who: 'JUNO', text: 'Thanks.' }],
    c_shaft: [{ who: 'MOTH', text: 'Boost system… remembered.' }],
    c_kit_reconnect: [{ who: 'KIT', text: '—un? Jun? JUN. Answer me. Answer me answer me answer—' },
                      { who: 'JUNO', text: "Kit. It's me. I'm in something." },
                      { who: 'KIT', text: "There's a GIANT thing coming out of the ice, Jun, run—" },
                      { who: 'JUNO', text: "That's me." }, { who: 'KIT', text: '…Oh. Okay. Okay okay okay.' }, { wait: 1.5 },
                      { who: 'KIT', text: "Two skiffs. Tick's stuck. Hurry." }, { who: 'JUNO', text: 'Coming. Put up a flare.' },
                      { wait: 2 }, { who: 'KIT', text: "Flare's up. Follow the red." }],
    c_idle_north: [{ who: 'JUNO', text: 'Stop turning. East is that way.' }, { who: 'MOTH', text: 'Noted.' }],
    c_pin: [{ who: 'MOTH', text: 'Targeting… remembered.' }],
    c_qb: [{ who: 'MOTH', text: 'Lateral thrust… remembered.' }],
    c_tear: [{ who: 'MOTH', text: 'That part is loose. This frame can take it.' }],
    c_first_tear: [{ who: 'JUNO', text: "Huh. Oma'll want that." }],
    c_sled1: [{ who: 'KIT', text: "That's our SLED. He was towing our sled." }, { who: 'JUNO', text: 'Flag it. Big Mercy can fetch it later.' }],
    c_sled1_done: [{ who: 'KIT', text: "Flagged! That's a tank. A whole tank. I'm counting it." }],
    c_pin_wave: [{ who: 'KIT', text: 'More sails, east lead! Two!' }],
    c_pin_clear: [{ who: 'KIT', text: 'Okay so that was AMAZING, and also I nearly died, so.' }, { who: 'JUNO', text: 'Drink something.' }],
    c_whatfor: [{ who: 'MOTH', text: 'Query: what is this frame for?' }, { who: 'JUNO', text: 'Water first. Then we argue about what you are.' }],
    c_gleaners: [{ who: 'KIT', text: 'Green lights. Jun, those are Gleaners.' }, { who: 'JUNO', text: "They're here for the skiff crews." },
                 { who: 'KIT', text: "They're already dead, Jun." }, { who: 'JUNO', text: "That's when they come." }],
    c_blade: [{ who: 'MOTH', text: 'Blade… remembered.' }],
    c_blade_kill: [{ who: 'KIT', text: 'YES! Do that again! Do that MORE!' }],
    c_carrier: [{ who: 'KIT', text: 'Big one! Big green one, north!' }],
    c_lost_drum: [{ who: 'JUNO', text: 'One got away.' }],
    c_burn: [{ who: 'JUNO', text: 'Kit. Burn the wrecks.' }, { who: 'KIT', text: 'With what?' },
             { who: 'JUNO', text: 'Flare. Into the fuel.' }, { who: 'KIT', text: '…Okay.' }],
    c_abeyance: [{ who: 'KIT', text: "There's the Abeyance. Biggest thing on the shelf. Bigger than you, big guy." },
                 { who: 'MOTH', text: 'Query: is "big guy" a designation?' }, { who: 'KIT', text: 'It is NOW.' }],
    c_ghost: [{ who: 'KIT', text: "Jun. That one's got a light." }, { who: 'JUNO', text: "Ghost. Don't look at the light." }],
    c_missiles: [{ who: 'MOTH', text: 'Chorus… remembered.' }],
    c_enemy_flares: [{ who: 'KIT', text: "It's throwing sparkles! That's CHEATING." }],
    c_surge: [{ who: 'MOTH', text: 'Energy surge. Move away from it.' }],
    c_repair: [{ who: 'MOTH', text: 'Repair cycle… remembered.' }],
    c_drums: [{ who: 'KIT', text: "Jun. There's drums in there. In the hold. Lots of drums." },
              { who: 'JUNO', text: 'Mark them. Oma will want a Turnback.' }, { who: 'KIT', text: '…Marking.' }],
    c_climb: [{ who: 'KIT', text: "I can't see past the ridges from down here. Get up top. Eyes on." },
              { who: 'JUNO', text: "Climbing. Drive through. Don't stop." },
              { who: 'KIT', text: 'Not stopping. Not looking. Not looking at ANY of it.' }],
    c_hardtack: [{ who: 'KIT', text: "Jun, there's a sled in here. Hardtack's paint. It's chained to their winch." },
                 { who: 'JUNO', text: "I'll get the winch." }],
    c_hardtack_done: [{ who: 'KIT', text: 'Two tanks! TWO!' }],
    c_shaft_gleaners: [{ who: 'MOTH', text: 'Movement above.' }],
    c_stencil: [{ who: 'MOTH', text: 'This frame knows this mark.' }, { who: 'JUNO', text: 'From where?' },
                { who: 'MOTH', text: 'Unknown. Logged.' }],
    c_cutline: [{ who: 'KIT', text: "That's the ice we came for. They're taking all of it." },
                { who: 'KIT', text: "And it's cutting right between us and the beach." }, { who: 'JUNO', text: 'Then it stops cutting.' }],
    c_detour: [{ who: 'KIT', text: "Tick can't swim. I'm going round by the north fast-ice. Meet you on the beach." },
               { who: 'JUNO', text: 'Keep the kite on me.' }, { who: 'KIT', text: "Kite's on you. No strings attached. Okay, one string." }],
    c_pa1: [{ who: 'DREDGE_PA', text: "Cut and haul. Cut and haul. Shift's not over." }],
    c_heads_hint: [{ who: 'KIT', text: "Kite says the saw heads go soft when they're cutting. Hit them low." }],
    c_spotlight: [{ who: 'KIT', text: "Out of the light, Jun! They're aiming with it!" }],
    c_head1: [{ who: 'KIT', text: "Head's off! ONE!" }, { who: 'JUNO', text: "It's turning. Here it comes." }],
    c_crack: [{ who: 'MOTH', text: 'The ice is splitting toward this frame. Move off the line.' }],
    c_pa2: [{ who: 'DREDGE_PA', text: 'Cut and— cut and haul. Cut and haul.' }],
    c_head2: [{ who: 'KIT', text: "TWO! It's got one head left and it looks ANGRY." }],
    c_auger: [{ who: 'MOTH', text: 'The bow drill is armoured above. Exposed from below.' }, { who: 'JUNO', text: 'Down on the raft, then.' }],
    c_sunrise: [{ who: 'KIT', text: 'Jun. Jun, the sun. Look east.' }],
    c_ice_changing: [{ who: 'MOTH', text: 'The ice is changing.' }],
    c_fall: [{ who: 'JUNO', text: 'Hold—', hold: 0.4 }],
    // c_drown is played line by line by the 'drown' action on the §7.2 timeline
    c_drown: [{ who: 'JUNO', text: 'Up. Get us up.' }, { who: 'MOTH', text: 'Thrusters are flooded. This frame is sinking.' },
              { who: 'JUNO', text: 'Okay.' }, { wait: 4 },
              { who: 'JUNO', text: 'Hey. Hey, listen. If this goes bad.' },
              { who: 'JUNO', text: "Don't let me end up one of his ghosts. Promise me." },
              { who: 'MOTH', text: 'Promised.' },
              { who: 'MOTH', text: 'Hold on to me.' },
              { who: 'JUNO', text: "…I'm okay? I'm okay!" }, { who: 'MOTH', text: 'You are okay.' }],
    c_surfaced: [{ who: 'KIT', text: 'JUN! I saw you go under, I saw you go UNDER—' }, { who: 'JUNO', text: 'Fine. Where are you?' },
                 { who: 'KIT', text: 'Beach! Follow the flares!' }],
    c_icing: [{ who: 'MOTH', text: 'Vents are icing. Hover is limited.' }, { who: 'JUNO', text: 'Then we hop.' }],
    c_rot: [{ who: 'MOTH', text: 'Sunlit ice is failing. Shadowed ice holds.' }, { who: 'JUNO', text: 'Blue holds, gold breaks. Got it.' }],
    c_sink: [{ who: 'KIT', text: "It's going under. The whole thing's going UNDER." }],
    c_leads: [{ who: 'KIT', text: "Skiffs in the leads! They don't care about the sun, they FLOAT—" }],
    c_hunt: [{ who: 'KIT', text: 'Why are the Gleaners all coming at YOU?' }, { who: 'JUNO', text: "I'm the biggest thing out here." }],
    c_sled3: [{ who: 'KIT', text: "Sled on a floe, south! Lark's Rest paint. It's in the shade. For now." }],
    c_sled3_done: [{ who: 'KIT', text: "THREE tanks! Oma's going to— she's going to nod, probably!" }],
    c_sled3_lost: [{ who: 'KIT', text: "Lost it. Doesn't matter. Keep going." }],
    c_withme: [{ who: 'JUNO', text: 'You with me?' }, { who: 'MOTH', text: 'I am here.' }],
    c_lastbit: [{ who: 'KIT', text: "Last bit! Fast-ice holds, it's shore ice, it's GOOD ice!" }],
    c_backoff: [{ who: 'KIT', text: 'Get OFF her! Flares, flares, FLARES—' }],
    c_ballast: [{ wait: 3 }, { who: 'JUNO', text: "Why'd we stop?" }, { who: 'MOTH', text: 'Releasing ballast.' },
                { who: 'JUNO', text: 'Since when do you carry ballast?' }, { who: 'MOTH', text: 'Not anymore.' }, { wait: 2 }],
    c_foreman: [{ who: 'FOREMAN', text: 'There you are.' }, { wait: 2 }, { who: 'KIT', text: 'Who was THAT?' },
                { who: 'OMA', text: 'Nobody you answer, boy. Bring the frame in.' }],
    c_naming_kit: [{ who: 'KIT', text: "It keeps turning north. Like a moth at a lamp. I'm calling it Moth." }],
    c_naming_moth: [{ who: 'MOTH', text: 'Designation accepted. Logged.' }],
  },

  collectibles: [   // caches feed the Haul rack (R8): 'unlocks' is a haul part id
    { id: 'cacheA', kind: 'salvage', at: { s: 1010, l: -175 }, unlocks: 'gaff_harpoon', label: 'Old skiff wreck' },
    { id: 'cacheB', kind: 'salvage', at: { x: AX + 8, z: AZ - 6, y: 123 }, unlocks: 'flare_pod', label: 'Roost spares' },
  ],

  start: [
    { call: 'cutter', args: { on: true } }, { call: 'abilities', args: { preset: 'cutter' } },
    { call: 'callsign', args: { name: 'JUNO', frame: 'CUTTER' } },
    { call: 'hudPanels', args: { en: false, radar: false, compass: true, objectives: true, vitals: true, rack: false } },
    { call: 'hudSlots', args: { R: 'hidden', L: { state: 'ready', label: 'SAW' }, S: 'hidden', K: 'hidden' } },
    { call: 'vitals', args: { mode: 'live', bpm: 80 } },
    { call: 'tick', args: { park: { s: 90, l: 70 } } }, { call: 'kite', args: { follow: 'tick', h: 85 } },
    { cinematic: 'vista' },
    { wait: 1.5 }, { comms: 'c_morning' },
    { objective: { add: 'o_look' } }, { hint: { desktop: 'Mouse to look', touch: 'Drag the right side to look' } },
    { waitFor: { custom: 'lookingAt', args: { target: 'kite', deg: 8, hold: 0.5 } } },
    { objective: { complete: 'o_look' } },
  ],

  onCheckpoint: {
    cp_cavern:   [ { call: 'cutter', args: { on: false } }, { structure: { id: 'snowBridge', state: 'collapsed' } },
                   { structure: { id: 'alcove', state: 'broken' } }, { call: 'visor', args: { on: true } },
                   { call: 'abilities', args: { preset: 'walk' } }, { call: 'idleFacing', args: { yaw: 0 } },
                   { call: 'hudPanels', args: { en: false, radar: false, vitals: true } }, { call: 'vitals', args: { mode: 'live', bpm: 96 } },
                   { art: ART_UNDER, blend: 0 }, { music: { theme: NIGHT } } ],
    cp_ridges:   [ { call: 'restoreCommon', args: { cp: 'cp_ridges' } }, { call: 'abilities', args: { preset: 'jump' } },
                   { art: ART_TEETH, blend: 0 },
                   { call: 'tick', args: { park: { s: 900, l: 70 }, pinned: true } }, { call: 'kite', args: { follow: 'tick', h: 80 } },
                   { call: 'kitFlare', args: { at: { s: 900, l: 70, h: 160 }, burst: true } }, { music: { theme: NIGHT } } ],
    cp_abeyance: [ { call: 'restoreCommon', args: { cp: 'cp_abeyance' } }, { call: 'abilities', args: { preset: 'blade' } },
                   { art: { ...ART_TEETH, fog: { ...ART_TEETH.fog, density: 0.0013 } }, blend: 0 },
                   { call: 'tick', args: { park: { s: 1360, l: 50 } } }, { music: { theme: DREDGE } } ],
    cp_cutline:  [ { call: 'restoreCommon', args: { cp: 'cp_cutline' } }, { call: 'abilities', args: { preset: 'full' } },
                   { call: 'tick', args: { hide: true } }, { call: 'kite', args: { follow: 'player', h: 90 } },
                   { art: ART_PREDAWN, blend: 0 }, { music: { theme: DREDGE, intensity: 1 } } ],
    cp_harvest:  [ { call: 'restoreCommon', args: { cp: 'cp_harvest' } }, { call: 'abilities', args: { preset: 'full' } },
                   { call: 'icebreaker', args: { phase: 3 } }, { art: ART_PREDAWN, blend: 0 }, { music: { theme: DREDGE, intensity: 1.2 } } ],
    cp_floes:    [ { call: 'restoreCommon', args: { cp: 'cp_floes' } }, { call: 'abilities', args: { preset: 'full' } },
                   { call: 'vitals', args: { mode: 'locked', bpm: 60 } }, { art: ART_DAWN, blend: 0 },
                   { call: 'icebreakerSink', args: { instant: true } }, { call: 'floes', args: { reset: true, start: true } },
                   { call: 'sunClock', args: { start: true } }, { call: 'hoverIcing', args: { scale: 2 } },
                   { call: 'gleanerHunt', args: { on: true } }, { music: { theme: DAWN } } ],
  },

  // no `complete` block: the 'naming' event ends the level with { complete: true }.
  // (The P0 mission stub auto-completes at the route end when `complete` is missing; the real runtime doesn't.)
  custom: { install: (ctx, mission) => installLevel01(ctx, mission, DATA) },
};
```

**Custom actions** registered by `levels/level01/index.js`: `cutter`, `cutterFall`, `sledLoad`, `abilities`, `hudPanels`, `hudSlots`, `vitals`, `idleFacing`, `tick`, `kite`, `kitFlare`, `burnWrecks`, `raidTowCutter`, `flagSled` (spawns the interact prompt and sets the flag on completion), `alcoveGlow`, `visor`, `stencilLight`, `icebreaker`, `icebreakerSink`, `drown`, `floes`, `sunClock`, `hoverIcing`, `gleanerHunt`, `mothWalk`, `kneel`, `watchers`, `turnNorth`, `musicBox`, `renameSpeaker`, `callsign`, `skiffsLeave`, `restoreCommon` (re-applies rack, sled flags, HUD panels, callsign and vitals from flags).

**Custom conditions:** `lookingAt`, `playerHit`, `aboveY`, `nearAnchor`, `commsLine`, `idleNorthReached`, `enemyWithin`, `harpoonTelegraph`, `anyStaggered`, `tearAvailable`, `rackCount`, `waveStarted`, `bladeKill`, `drumEscaped`, `tickAt`, `carrierFlared`, `onGround`, `hullHit`, `inFloodlight`, `crackStrike`, `collarHitFromAbove`, `touchedGold`, `sprintTime`, `skiffRun`.

**Custom files** under `levels/level01/`: `index.js` (install, actions, conditions), `units.js` (skiff, gleaner, gleaner_carrier, tick, kite), `icebreaker.js`, `structures.js` (§11.8 types), `abeyance.js`, `cutter.js`, `floes.js`, `sea.js`, `sunrise.js`, `drown.js`, `haul.js` (fallback for R8), `skyline.js` (dawn rim, Wake lights, aurora fallback), `wakeCamp.js` (instanced beach rigs).

---

## 18. Spoiler and clue checklist

### 18.1 Player-facing text that exists before it's reached

| Text | Where | Safe? |
| --- | --- | --- |
| `THAW` / `The Rime Shelf` | Level select, briefing | Yes (public level name). |
| The briefing body | Briefing | Yes: work orders only. "Don't wait for the sun" reads as advice. |
| Zone cards and checkpoint labels | On arrival | Yes: place names only. |
| Objective texts | Added when reached | Yes. |
| Loading tips | Loading | Controls only. No character or story names. |
| Debrief | After the level | Stats only. |

Nothing names Moth before Kit does. Moth speaks from the boot onward, so **its comms label is `CANTOR 7` until the naming** (§10, the custom action `renameSpeaker`, which calls `comms.defineSpeakers` mid-level). The HUD frame tag follows the same rule: `hud.setCallsign('JUNO', '', 'CUTTER')` in the cutter and `('JUNO', '', 'CANTOR 7')` in the frame (custom action `callsign`). No hint, objective, card or debrief text uses the name before Kit says it.

### 18.2 Clues placed in this level

| Clue | Beat | Innocent reading | Truth |
| --- | --- | --- | --- |
| `LATTICE: EMPTY // PASSENGER: NONE // PILOT: DETECTED` | Boot | Machine jargon | Moth was empty; soon it won't be |
| The Sexton, a ghost; Juno: *"Ghost. Don't look at the light."* | Z4 | Dredge horror | What she begs not to become |
| Drums under the stencil *CARRY THEM HOME. SET THEM DOWN.* | Z4 | Founders' graffiti | What Cantors are for |
| *"This frame knows this mark."* | Z4 | An old machine's memory | Moth is a Cantor |
| The PA loop *"Cut and— cut and haul."* | Z5 | Bad radio | Ghosts loop |
| Vitals race, flatline, `SENSOR FAULT`, then 60 forever | Drowning | A sensor glitch after the flood | Her heart stopped |
| *"Hold on to me."*, Moth's first "me" | Drowning | Moth reassuring her | Moth carrying her |
| *"You are okay."* | Drowning | Relief | Lie #1 |
| Hover icing (ability changes after the drowning) | Z6 | Cold water in the vents | — (pure mechanics; no truth needed) |
| Gleaners hunt Moth | Z6 | It's big | They hear a carried mind |
| *"I am here."*, Moth's first "I" | Z6 | A machine checking in | It's become someone, and so has she |
| Kneeling at the hole, *"Releasing ballast." / "Not anymore."* | Z7 | A machine dumping water or weight | Her body |
| Gleaners watching the kneel, leaving before the chime | Z7 | Scavengers hoping for scraps | The Foreman's ears |
| *"There you are."* (first ever words) | Z7 | A creepy broadcast | He heard her handshake |
| Juno never climbs out at the Bench; *"The hatch seal is damaged." / "Is it."* | Bench 1 | Damage | Lie #3 (bible) |

Rules checked: Juno is never called ghost, dead, pressed, carried, passenger or body (bible §5.5). Moth tells only lie #1 in the level and lies #2 and #3 at the Bench. Only Moth, Juno and (in later levels) Tallow speak on LOCAL. Kit and Juno never meet face to face. No human model appears anywhere: bodies stay inside drums, crews stay behind dark canopies, and the release at the hole shows only bubbles.

---

## 19. Test notes for `tools/scenarios/level01.mjs`

The architecture §10.9 asks P6 to play the level from each checkpoint. Suggested shape:

1. `validateLevel(level01)` returns `[]`.
2. **From `cp_cut`:** complete `o_look` (`g.trigger` or a `lookingAt` override), kill `block1..3` with `killAll({ tag: 'block' })`, assert `t_raid` fires, teleport to s 318, assert `t_collapse` and that the player ends at s 378 / l −24 with abilities `walk`.
3. **From `cp_cavern`:** walk to s 625; assert `t_shaft` and the `jump` preset; inject hold JUMP and assert y > 8 within 4 s (the shaft climb is possible with 1,000 EN).
4. **From `cp_ridges`:** pass s 820; assert `e_pin` spawns; force a stagger on `pin_g` (`g.eval` damage with impact 900) and assert the TEAR prompt; inject a 0.5 s BLADE hold and assert rack count 1; kill all `pin`; assert the wave and `t_pin_clear`.
5. **From `cp_abeyance`:** kill the Sexton; assert `c_drums`, `o_climb2`; teleport to the crown (y 123) and assert `t_crown` and the `cutlineReveal` cinematic (skip it).
6. **From `cp_cutline`:** assert the Icebreaker spawns with three heads; kill heads one at a time with `g.eval` and assert phases 2 and 3 and `cp_harvest`; kill the bow head **from below** (player on a Raft floe) and assert the finale starts; step through `drown` and assert: the vitals widget mode goes `live → flat → locked`, bpm 60 after the reboot, `o_surface` appears.
7. **From `cp_floes`:** teleport onto a sunlit floe and assert it sinks 3.0 ± 0.1 s later; teleport onto a shaded floe and step 20 s and assert it holds; run the floe-path validator for sun elevations 5.5 to 9 and assert a valid path exists; pass s 3130 and assert the shore event, the kneel, the chime line and `o_bench`; reach the Bench and assert the level completes and the debrief shows haul and sledges.
8. **Determinism:** replay 600 steps from `cp_floes` twice; floe states and player positions identical.
9. **Screenshots:** gameplay plus one vista per zone: Z1 (the cut with the kite), Z2 (the waking hall, the shaft light), Z3 (Kit's flare over the ridges), Z4 (the *Abeyance* from the apron; the stencil; the crown), Z5 (the Icebreaker at the edge), the sunrise wall mid-sweep, underwater, Z6 (gold and blue floes with shade lanes), Z7 (the kneel, the Bench). Check budgets at Icebreaker phase 1 on High.
10. **Spoiler check:** before the naming, no UI string contains "Moth" (search `#comms`, `#objs`, `#lockbox` text over a scripted run).
