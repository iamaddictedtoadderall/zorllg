# DAWNWAKE: Art Direction

> **BUILD TEAM ONLY.** This document names levels, landmarks and set pieces from `docs/SPOILERS-story-bible.md`. Never quote it in player-facing text. It does not explain the twists. Where a visual rule exists because of one (the green cab light, for example), it points at the bible section and stops there.

Version 1.0. Written by the art director for P1 (Look and Sound), P2 (World), P3 (Forge), P6 (Levels) and anyone who reviews screenshots.

**How this document relates to `architecture.md`**

- `architecture.md` owns interfaces, budgets, tiers and file ownership. Its §4 signatures are binding. Nothing here renames or removes anything in it. Where the look needs more, this document proposes **optional** exports, parameters and fields, which the architecture allows. They are all collected in Appendix A, each with its owner.
- This document owns the look: shapes, construction rules, materials, colour, light, effects and the review bar. Where `architecture.md` gives a starting value (sun 6.5, bloom 0.85 and so on), the per-level values in §5.7 replace it. Appendix D of the architecture (the art bar checklist) is superseded by §8 here, which includes all of it.
- The bible and the architecture disagree on two technical points: whether Low has shadows, and whether Low has point lights. This document follows the architecture and explains how to keep the bible's intent (§7.2).

**Conventions.** Metres; +Y up; north is −Z; azimuth is in degrees clockwise from north (architecture §1.3). Colours are sRGB hex. Light intensities are r170 physical units. "px" means pixels at 1920×1080 with the default fov of 66°, unless stated otherwise. Code is a sketch: it shows the method and the numbers, and engineers own the final form.

---

## 0. The look on one page

**Look statement.** *Chunky, bevelled machines and worn monuments, standing in enormous, weathered light.* Every made thing is heavy, chamfered, layered and legible from far away. Every landscape is eroded and deep with air. Light does most of the work: one sun per level, height fog that glows toward the sun, and a few saturated emissive colours that each mean one thing.

**The ten laws**

1. **No plain boxes.** Every manufactured edge is bevelled or chamfered. No visible face spans more than about 4 × 4 m at mech scale, or a sixth of the object's size on big structures, without a seam, a plate step, a rib or a greeble.
2. **Three layers minimum.** Core shell, then plates, then trim and greebles. Structures over 20 m add a fourth layer: frame (ribs, columns, trusses).
3. **Silhouette first.** Design the side and top outline before any detail. It must read at the distance the object is meant to be seen from (§1.5).
4. **Light is the art budget.** One key light per level, height fog with sun inscatter, and at least three depth planes in every vista.
5. **Colour means something.** Saturated emissives are a language: amber is the Wake, cyan and gold are the Founders, sodium orange is the Dredge, pale green is a ghost. Nothing else uses those hues at those intensities (§1.6).
6. **Wear tells you who made it.** The Wake patches, the Dredge stains, the Founders weather. There is no generic grunge.
7. **Detail density is constant in world space.** Near the player there is a feature every 1 to 3 m. Never scale a model up more than 2× without adding a new layer of detail.
8. **Big things carry small things.** There are no people on screen, ever, so every large structure carries scale cues: railings, ladders, doors, windows, lamps.
9. **Rocks are cut, not blobbed.** Flat faceted planes, strata, ledges and talus. No smooth noise potatoes.
10. **Effects have mass.** Flash, body, smoke, debris, a mark on the ground and a shake. Pooled and cheap, but never a single sprite.

**What "cheap and squarey" meant in the prototype, and the fix**

| In the prototype | Why it looks cheap | The fix |
| --- | --- | --- |
| `box()` monoliths, crates, walls; `cyl()` floodlight masts | razor-sharp edges, flat faces, one layer | the bevelled kit (§2): slabs, panel walls, lathed masts, trusses |
| Dodecahedron rocks with jittered vertices | soft lumps that read as potatoes | faceted rocks cut by planes, strata, cliff skins (§2.12) |
| One grain texture on 18 m UVs over the whole terrain | tiling visible at 50 to 200 m; slopes look like flat ground | triplanar rock, two-scale world-space detail, strata, slope blending (§3) |
| `FogExp2` in one flat colour | no depth, no glow toward the sun | height fog with inscatter, ground-fog layers, three depth planes (§5.3) |
| Box megastructures on the horizon | read as boxes, even at 3 km | designed skyline silhouettes per level (§2.17) |
| Box debris | cubes bouncing on the ground | a bevelled chunk set (§2.11) |
| Emissive spheres as lamps | no housing, no glow, no light | the lamp assembly and the glow-sprite rule (§4.5) |

**Keep from the prototype:** the bevelled mechs (`plateGeo`, `acKit`, `AC_DESIGNS`), the structure of the sky shader, the cool rim light, PMREM sky reflections on metal, the soft-knee bloom, grain, and vignette. These set the bar, and everything else rises to meet them.

---

## 1. Visual pillars and references

### 1.1 Pillars

1. **Hard-surface weight.** Chunky plates with generous bevels that catch a highlight. Plates overlap with visible thickness. Hinges, pistons and hydraulics are on show. A frame should look like it weighs 60 tonnes. The bevel is where the light lives.
2. **Readable at any range.** Every faction has a silhouette family and a light colour. At 1 km you can tell the Wake from the Dredge from the Founders by shape and lights alone.
3. **Air you can see.** Height fog, inscatter, dust and long shadows. Scale comes from atmospheric perspective. Skies take up half the frame.
4. **Quiet dread in the details.** Practical lights in the dark, dead screens, and things that belonged to people: painted names, chalked drums, lit cab windows. Dread comes from restraint: empty space, one light, silence.
5. **Things have a history.** Patched, reused, frozen, sand-blasted. Each faction's wear is different (§1.3).

### 1.2 References: what to take and what to avoid

| Reference | Take | Avoid |
| --- | --- | --- |
| *Titanfall 2* | Titan plate language: big chamfers, layered armour, exposed hydraulics, clean value groups that read at speed | military grey on everything |
| *Armored Core VI* (the source of our mech look) | stacked bevelled plates, accents used sparingly, sparks and heat shimmer, huge arenas | greebles on every plate |
| *Mad Max: Fury Road* | orange-teal grade, sun-bleached salvage, the convoy as a moving town, dust as a character, painted names | grime that hides shape |
| *SOMA* | practical lights in darkness, cold flat ambients, environmental text, restraint | darkness that hides the play space |
| *Supreme Commander 2* | giant units as horizon silhouettes, faction colour coding, battlefield scale with tracers and arcs | toy proportions |
| *StarCraft 2* | team colour on dark-to-mid bodies, glowing tells, chunky readable proportions | cartoon saturation |
| Simon Stålenhag | giant machines in empty landscapes, low sun, mist | photographic noise |
| *Dune* (2021) | brutalist monoliths, haze that eats distance, one dominant hue per place | |
| Moebius | white skies and bleached desert colour (L4), clean graphic shapes | |

### 1.3 Faction languages

| | **The Wake** (our convoy) | **The Dredge** (the walking city) | **The Founders** (historical) |
| --- | --- | --- | --- |
| Shape | Asymmetric and patched. Rounded canvas over angular salvage. Nothing matches. Tall kite masts with ribbons. Parts bolted on at 5° to 15° skew. | Monumental, symmetric, repetitive. Heavy 45° chamfers, battered (tapered) walls, buttresses, riveted bands, stepped massing. | Smooth, rounded and calm. Large soft chamfers, arches, rings and domes. Triangulated lattice motifs. Choir-like rounded heads. |
| Bevel | Medium, mixed: 0.06 to 0.15 m on rigs, with different sizes on one rig because the parts came from different machines | Large: 0.3 to 2 m chamfers on structures, 0.08 to 0.2 m on units | Soft: `round()` profiles with radius 4 to 10% of the part, `bevelSegments` 3 |
| Materials | rust iron, faded teal paint, canvas, rubber, reed matting (Gaunt has no trees, so there is no wood) | black iron, oxide-red paint, cast concrete, hazard paint, soot | white ceramic composite, gold trim, dark glass, lattice metal |
| Palette | rust `#7a4128`, deep rust `#4a2618`, faded teal `#4f8a86`, teal shade `#2c5452`, canvas `#d9cba8`, bleached red `#a5452f`, ochre `#c48a3a`, kite yellow `#e8c547`, kite blue `#6aa8d8` | black iron `#1c1b1d`, iron `#2e2b2b`, oxide red `#7d2a1c`, oxide light `#9a3a24`, hazard `#d9a521` on `#141414`, concrete `#6e665c`, stained concrete `#4d463e`, Foreman brass `#b8913a` | ceramic `#e9e6dc`, ceramic shade `#c9c3b4`, aged ceramic `#b8b0a0`, gold `#c99a3e`, seam gap `#1a1e24` |
| Lights | warm tungsten `#ffb36b`: many small lamps, string lights, lit cab windows | sodium `#ff9a2e` lamps in rows; floodlight white `#fff1d6` | seam-light inset in grooves: cyan `#5fe3ff` and gold `#ffcc66`, dim when dead and bright when woken |
| Wear | sun-bleached tops, rust bleeding from bolts, dust skirts, hand-painted repairs, weld beads | soot running down from vents, oil and rust streaks, scorching, chalked tallies | a century of ice: frost on top faces, hairline crazing, ice scars; rust only at iron fittings |
| Signature details | painted rig names, canvas awnings, strapped water drums, patch plates, tally marks, kites | hazard chevrons on moving edges, stencilled numbers, pipe racks, chains, steam vents, cranes, conveyor slats | the lattice-ring emblem, the stencil **CARRY THEM HOME. SET THEM DOWN.**, plaques, seam-light strips |

**Ghosts.** Any machine run by a pressed mind carries one pale green cab light blinking 60 times a minute (bible §3.3, §5.4). That light is its whole tell. Build it with the ghost beacon (§4.5) so it reads at 1 km.

**Moth.** The Vanguard silhouette in Founders materials: weathered white ceramic, worn gold trim, a cyan visor, rust streaks running from its iron fittings, paler scratched ice scars, and the lattice-ring emblem on the left shoulder. Fitted Dredge parts are black iron bolted on through visible adapter plates; Founders parts are white and gold (bible §7.12). Every bound hungry part adds a ghost beacon (bible §5.4).

### 1.4 Shape language

**Bevel size.** Two rules, and the larger result wins:

- Proportion: `bevel = k × min(w, h, d)`, with k = 0.05 (Wake), 0.08 to 0.12 (Dredge chamfers), or 0.1 as a rounded radius (Founders).
- Visibility: a bevel must be at least 2 px wide at the distance the object is usually seen from: `bevel ≥ 0.0024 × d`.

| Object class | Usual distance | Bevel |
| --- | --- | --- |
| Mech plates, hand-sized props | 15 to 40 m | 0.04 to 0.14 m (the prototype's values) |
| Rigs, units, small structures | 30 to 120 m | 0.10 to 0.30 m |
| Buildings, walls, bridges | 80 to 300 m | 0.25 to 0.8 m |
| Megastructures and landmarks | 300 m and more | 0.8 to 3 m |

A bevel on all twelve edges of a slab needs two things. `ExtrudeGeometry` bevels only the edges around the two caps, so the profile's corners must also be chamfered by the same amount (`chamfer(rect(w, h), b)`). `bevelBox` does this (§2.2).

**Profile vocabulary.** Clipped rectangles, trapezoids, notched plates, stepped profiles and wedges, combined in a 60/30/10 split of large, medium and small forms. Avoid equal spacing: use rhythms such as A-A-B or 3-5-8. Break symmetry for the Wake; keep it for the Dredge and the Founders.

**Plate stacking.** Each plate sits 0.04 to 0.15 m proud (mechs) or 0.15 to 0.6 m proud (structures) of the one beneath it, and is inset 5 to 15% from that plate's edge, so every plate shows a lip with its own bevel highlight.

**Light-facing edges.** The strongest bevels go on top edges and leading corners, because those catch the sun and the sky reflection.

**Negative space.** Vents, gaps, cut-outs and lattices break up mass. Every structure over 30 m has at least one see-through element (a truss, a grating, an open bay) so that the sky shows through it.

**Angles.** The Dredge uses 45° and 90°. The Founders use curves and 30° or 60° lattices. The Wake uses whatever was to hand.

### 1.5 Scale and readability

**Pixel maths.** At 1080p and fov 66°, one pixel covers about `0.0012 × d` metres at distance d. On a phone on Low (390 CSS px tall, pixel ratio 1) one pixel covers about `0.0033 × d`, which is 2.8 times coarser. That is why Low's LOD distances are shorter.

| Distance | 1 px (High) | What reads | Model as geometry |
| --- | --- | --- | --- |
| 10 m | 1.2 cm | bolts, weld beads, stencils | anything ≥ 5 cm; finer detail goes in textures |
| 30 m | 3.6 cm | seams, small greebles | ≥ 10 cm |
| 100 m | 12 cm | panels, plates, railings | ≥ 25 cm |
| 300 m | 36 cm | massing, large plates, window bands | LOD1 from 250 to 550 m (tier) |
| 1 km | 1.2 m | silhouette and lights | silhouette and beacons only |
| 3 km and beyond | 3.6 m | skyline | skyline objects and impostors |

**Scale ladder** (height): human cues 1 to 2 m (railing 1.1, door 2.2, ladder rungs every 0.3) → mech 11 m → Wake rigs 6 to 14 m tall and 12 to 40 m long → the Icebreaker 60 m long → the *Abeyance* 140 m tall → the Sundial about 1 km → the Fall 1 km tall → the Dredge 3 km long.

**Scale-cue rule.** Every structure taller than 20 m carries at least two human-scale cues (railings, ladders, doors, stair runs, lit windows) and one mech-scale cue (a 12 to 16 m bay door, a walkway the mech could stand on).

**Readability targets.** A unit's silhouette reads at 300 m. A ghost light reads at 1 km. Wake rig lights read at 2 km at night. A level's hero landmark reads from every point on its route.

### 1.6 Colour script and reserved colours

**Value structure.** Sky and fog are the brightest areas, then sunlit ground, then structures, then shadows (which are cool), with emissives above everything. Structures sit 10 to 25% darker in value than the ground they stand on, so they read against it. The one exception is Founders ceramic, which is meant to read brighter than the ground: it is the only "light" material in the game.

**Reserved emissive colours.** Each colour means one thing. Nothing else in the world may come close to one of these at emissive intensity (within about 15° of hue **and** 20% of saturation). Wake tungsten and Dredge sodium share a hue and are kept apart by saturation: tungsten is a pale warm white (saturation at most 60%), sodium a deep, fully saturated orange (at least 80%).

| Meaning | Hex | Emissive intensity | Used on |
| --- | --- | --- | --- |
| The Wake, warmth, home | tungsten `#ffb36b` | 2 to 4 | rig lamps, string lights, cab windows, the Bench work lamp |
| Founders, Moth | cyan `#5fe3ff`, gold `#ffcc66` | 2.5 to 5 | seam-light, Moth's visor, Cantor eyes, the Lay |
| The Dredge | sodium `#ff9a2e`; floodlight `#fff1d6` | 3 to 6 | lamps, floodlights, flare-stack glow |
| A ghost | pale green `#a8ff9e` | 6 (beacon sprite 8) | cab lights only (§4.5) |
| Danger, weapon tells | red `#ff2a1a` | 3 to 5, pulsing | enemy weapon charge, warning strobes, targeting |
| Kit's flares | flare `#ff7048` with a white-pink core | 5, flickering | flares and flare pools |

Rules that protect this palette:

- The aurora (L1, L5) is teal `#2fe0c8` and violet `#7b4dff`. It is never green.
- Thaw-grass, lichen and reeds are ochre, olive-brown, rust or red-gold. They are never pale green.
- Hungry-part glints are "pale green-white lattice shimmer" (bible §7.5). That is deliberate: they are ghost tech.
- Kit's flares are redder than sodium and flicker; danger red pulses rhythmically. Flicker versus pulse keeps them apart.

---
## 2. The environment construction kit (`art/kit.js`, P3)

The prototype's mechs look good because of four things: profiles designed in 2D, a bevel on every edge, plates stacked in layers, and dark joints between them. The environment kit applies exactly that method to everything else. Every function below is a pure, deterministic builder that returns a `BufferGeometry`, built from the same ideas as `plateGeo`.

### 2.0 Kit contract

- **Pure and cached.** Builders take plain numbers, arrays and an `rng` (or a seed). When the inputs are plain values, the result is cached by key, as `plateGeo` already does. Never mutate a cached geometry; clone it first.
- **Local space.** Metres, origin at the centre of the base unless stated, model forward is −Z.
- **One attribute set, so anything can merge.** Every kit geometry has exactly these attributes: `position`, `normal`, `color` (vec3, linear, default 1,1,1: a per-part tint) and `edge` (float, 0 or 1: marks bevel faces for the wear patch, §4.4). It has no `uv`, no groups, and it is **non-indexed**. `kitFinalize()` enforces this. (`BufferGeometryUtils.mergeGeometries` needs matching attributes and matching indexing: architecture Appendix B.6.)
- **UVs only where needed.** Signage, decals, conveyor slats, cloth and reed cards need UVs. They are separate meshes with their own materials, never merged into the kit mesh.
- **Flat or smooth.** Plates, beams and rocks are flat-shaded (non-indexed geometry with face normals). Lathed and tube shapes are smooth around their axis and hard at profile creases (§2.3).
- **Everything drawn with a kit material goes through `kitFinalize`**, including the `acKit` primitives `ball` and `joint` (which use `SphereGeometry` and `CylinderGeometry` with `flat: false`). Under `vertexColors: true`, a geometry without a `color` attribute renders black.
- **Tint.** `GeoBuilder.add` gets an optional `o.tint` that writes a value jitter (default ±5%) into `color`, so that a merged mesh of one material still shows panel-to-panel variation. All kit materials set `vertexColors: true` (§4.1).

```js
// art/kit.js — makes any geometry kit-compatible.
export function kitFinalize(g, o = {}) {
  // o.flat (default true): recompute face normals after de-indexing
  // o.edgeAxis: 'x'|'y'|'z' for extrusions: faces whose normal is neither along nor across this axis are bevel faces
  // o.edgeAll: 0|1 to mark the whole part (thin trims, rings)
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv'); g.clearGroups();
  if (o.flat !== false) g.computeVertexNormals();          // non-indexed → face normals
  const n = g.attributes.position.count;
  if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const e = new Float32Array(n);
  if (o.edgeAll) e.fill(o.edgeAll);
  else if (o.edgeAxis) {
    const k = { x: 0, y: 1, z: 2 }[o.edgeAxis], N = g.attributes.normal.array;
    for (let i = 0; i < n; i++) { const d = Math.abs(N[i * 3 + k]); e[i] = d > 0.2 && d < 0.93 ? 1 : 0; }
  }
  g.setAttribute('edge', new THREE.BufferAttribute(e, 1));
  return g;
}
```

`plateGeo` calls `kitFinalize(g, { edgeAxis })` with the axis it extruded along (x for `'side'`, z for `'front'`, y for `'top'`). On a cap the normal lies along the axis (|d| ≈ 1). On a side wall it lies across it (d ≈ 0). Only bevel faces fall in between. This is the cheapest correct way to find the bevels, and it is what makes edge wear (§4.4) work.

**Triangle costs to plan with.** An extruded profile of N points with one bevel segment costs about `2(N − 2) + 2N + 4N` triangles: about 28 for a rectangle, 60 for a chamfered rectangle (8 points), and about 100 with `bevelSegments` 2. A structure LOD0 has a budget of 60k triangles (architecture §7.5), which is therefore about 600 to 1,000 plates including greebles.

### 2.1 Profiles (2D)

All profiles are arrays of `[x, y]` in metres, counter-clockwise, without a repeated last point.

```js
export function rect(w, h, cx = 0, cy = 0) {
  const x = w / 2, y = h / 2;
  return [[cx - x, cy - y], [cx + x, cy - y], [cx + x, cy + y], [cx - x, cy + y]];
}
// Cut corners by distance c (number, or an array with one value per corner; 0 leaves a corner sharp).
export function chamfer(pts, c) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ci = Array.isArray(c) ? c[i] : c;
    if (!ci) { out.push(p); continue; }
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const k = Math.min(ci, la * 0.45, lb * 0.45);
    out.push([p[0] + (a[0] - p[0]) / la * k, p[1] + (a[1] - p[1]) / la * k],
             [p[0] + (b[0] - p[0]) / lb * k, p[1] + (b[1] - p[1]) / lb * k]);
  }
  return out;
}
// Round corners with radius r in `seg` steps (Founders). Same corner walk as chamfer, but emits a
// quadratic arc p1 → p (control) → p2 instead of the straight cut.
export function round(pts, r, seg = 3) { /* … */ }
export const chamferRect = (w, h, c, cx = 0, cy = 0) => chamfer(rect(w, h, cx, cy), c);
// Scale x toward the top: x *= lerp(1, k, (y − yMin) / (yMax − yMin)). Battered walls, tapered towers.
export function taper(pts, k) { /* … */ }
// Inset a convex (or mildly concave) polygon by d: move each edge inward, intersect neighbours.
export function offset(pts, d) { /* … */ }
// Replace edge i → i+1 with a torn zig-zag: steps of `step` m, perpendicular jitter ±amp. Ruins and wrecks.
export function jag(pts, i, rng, amp = 0.3, step = 0.6) { /* … */ }
// Rectangle with a rectangular notch cut from one side (doors, slots, bays).
export function notch(w, h, nw, nd, side = 'top') { /* … */ }

// Structural sections, centred on the origin.
export const SECTIONS = {
  I: (h, w, tw, tf) => [[-w/2,-h/2],[w/2,-h/2],[w/2,-h/2+tf],[tw/2,-h/2+tf],[tw/2,h/2-tf],[w/2,h/2-tf],
                         [w/2,h/2],[-w/2,h/2],[-w/2,h/2-tf],[-tw/2,h/2-tf],[-tw/2,-h/2+tf],[-w/2,-h/2+tf]],
  C: (h, w, t) => [[-w/2,-h/2],[w/2,-h/2],[w/2,-h/2+t],[-w/2+t,-h/2+t],[-w/2+t,h/2-t],[w/2,h/2-t],[w/2,h/2],[-w/2,h/2]],
  L: (a, b, t) => [[0,0],[a,0],[a,t],[t,t],[t,b],[0,b]],
  box: (w, h, c) => chamferRect(w, h, c),       // closed box tube; plateGeo with a hole gives a real tube
  T: (h, w, t) => [[-t/2,-h/2],[t/2,-h/2],[t/2,h/2-t],[w/2,h/2-t],[w/2,h/2],[-w/2,h/2],[-w/2,h/2-t],[-t/2,h/2-t]],
};
```

**`plateGeo` gains holes.** Proposed optional fifth parameter: `plateGeo(pts, depth, view, bevel, o?: { holes?: Array<Array<[x, y]>> })`. `ExtrudeGeometry` bevels holes inward too, which gives windows, vent slots, lightening holes and lattice cut-outs real bevelled rims for free.

### 2.2 Plates and slabs: the replacement for `BoxGeometry`

| Function | Builds | Notes |
| --- | --- | --- |
| `slab(w, h, d, o?)` | `plateGeo(chamfer(rect(w, h), o.chamfer ?? b), d, o.view ?? 'front', b)`, with `b = o.bevel ?? auto` | The default building block. `o.taper` battered sides; `o.chamfer` per-corner array for wedges and clipped corners. |
| `bevelBox(w, h, d, bevel)` | `slab` with chamfer = bevel | All twelve edges bevelled (architecture signature unchanged). |
| `panelBox(w, h, d, o)` | a core slab inset by `o.inset` (0.06) plus one proud plate per panel cell on each face | **Real seams**: the groove is the gap between plates, and the dark core shows through it. Gap: 0.06 to 0.12 m on props, 0.1 to 0.3 m on buildings. |
| `armourPlate(pts, t, o)` | a base plate plus a second plate `offset(pts, lip)` at 0.6 t, sitting proud | The two-layer plate. Use it for any large flat face. |
| `ribbedPlate(w, h, t, o)` | a plate with raised ribs every `o.pitch` along one axis | Dredge decks, hull sides, container walls. |

**Irregular panel grids.** Never divide a face into equal cells. Use `split(len, rng, min, max)`, which cuts a length into a sequence of widths between `min` and `max` and then rescales them to fit exactly. Use weighted patterns such as `[2, 1, 3, 1]` for Dredge rhythm, and random patterns for the Wake.

### 2.3 Lathed shapes

`THREE.LatheGeometry` smooths normals along the profile, so a chamfered profile comes out looking melted. Use `latheHard`, which keeps hard creases and smooths only gentle turns:

```js
// prof: [[r, y], ...] from bottom to top, r ≥ 0. Normals are smooth around the axis and hard at any profile
// corner sharper than `crease` degrees. Segments shorter than `edgeLen` are tagged edge = 1 (chamfers).
export function latheHard(prof, seg = 24, o = {}) {
  const { crease = 35, edgeLen = 0.25, phi0 = 0, phiLen = TAU } = o;
  const sn = [];                                             // outward 2D normal (nr, ny) per profile segment
  for (let i = 0; i < prof.length - 1; i++) {
    const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy) || 1;
    sn.push([dy / l, -dr / l]);
  }
  const cosC = Math.cos(crease * Math.PI / 180);
  const nAt = (i, j) => {                                    // normal at the end of segment i shared with segment j
    const a = sn[i], b = sn[j];
    if (!b || a[0] * b[0] + a[1] * b[1] < cosC) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y); return [x / l, y / l];
  };
  const P = [], N = [], E = [];
  for (let i = 0; i < sn.length; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], n0 = nAt(i, i - 1), n1 = nAt(i, i + 1);
    const isEdge = Math.hypot(r1 - r0, y1 - y0) < edgeLen ? 1 : 0;
    for (let k = 0; k < seg; k++) {
      const a0 = phi0 + k / seg * phiLen, a1 = phi0 + (k + 1) / seg * phiLen;
      // quad (r0,a0) (r1,a0) (r1,a1) (r0,a1): two triangles wound counter-clockwise seen from outside;
      // position = (r sin a, y, r cos a), normal = (nr sin a, ny, nr cos a). Push to P, N; push isEdge to E.
    }
  }
  /* build BufferGeometry from P, N, E; add color = 1 */
}
```

**Segment counts.** Use `seg = clamp(round(r × 10), 8, 48)` at LOD0 and half that at LOD1. A 0.3 m nozzle gets 8 segments; a 6 m tank gets 48.

**Presets** (each a profile function plus `latheHard`): `dome(r, h)` (an elliptical arc of 6 to 8 segments with a hatch ring at the top), `nozzle(r, len)`, `insulator(r, h, discs)`, `lampHousing(r)`, `bollard(r, h)`, `flange(r, t, w)`, `ring(r, w, t)` (a lathed chamfered rectangle offset from the axis: a hard-edged ring, which replaces the smooth `TorusGeometry`), `drum(r, h, ribs)` (water drums, barrels), `stackTop(r)` (rain cap or flare tip).

### 2.4 Pipes and tubes

Industrial pipes are **straight runs with tight bends**, never noodles. Never pass a Catmull-Rom spline through pipe points; that is what makes pipes look like spaghetti.

```js
// pts: Vector3 polyline (Manhattan or 45° turns). Straights are open cylinders; corners are short bends.
export function pipeRun(pts, r, o = {}) {
  const { bend = 2.5 * r, radial = clamp(Math.round(r * 24), 6, 24), flangeEvery = 0,
          support = null /* { every: 8, groundY: 0 } */ } = o;
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dir = _d.subVectors(b, a).normalize().clone();
    const t0 = i > 0 ? bend : 0, t1 = i < pts.length - 2 ? bend : 0;
    const s0 = a.clone().addScaledVector(dir, t0), s1 = b.clone().addScaledVector(dir, -t1);
    parts.push(cylinderBetween(s0, s1, r, radial));
    if (flangeEvery) for (let s = flangeEvery; s < s0.distanceTo(s1); s += flangeEvery)
      parts.push(flangeAt(s0.clone().addScaledVector(dir, s), dir, r));
    if (i < pts.length - 2) {                                  // the bend at corner b
      const nxt = pts[i + 2].clone().sub(b).normalize();
      const c = new THREE.QuadraticBezierCurve3(s1, b, b.clone().addScaledVector(nxt, bend));
      parts.push(new THREE.TubeGeometry(c, 6, r, radial, false), flangeAt(s1, dir, r), flangeAt(c.v2, nxt, r));
    }
    if (support) /* a pipe shoe plus a stand (slab or I-beam) down to support.groundY every support.every m */;
  }
  return kitMerge(parts);   // kitFinalize each part (flat: false for tubes), then mergeGeometries
}
```

- `pipeRack(path, pipes, o)`: several parallel pipes (radii from 0.15 to 1.5 m, each with its own lateral offset) carried on portal frames (`gantry`) every 6 m. Vary the diameters. Never use five identical pipes.
- `cylinderBetween(a, b, r, radial)`: an open cylinder from point a to point b.
- Colours by function: the Dredge paints its pipes oxide red, black or hazard yellow by duty; the Wake's are bare rusty steel with patch clamps; the Founders' are ceramic-sleeved with a gold band at each joint.
- **Cables are not pipes.** Cables sag (§2.9).

### 2.5 Beams, trusses and lattices

| Function | Builds |
| --- | --- |
| `beam(section, length, o)` | `plateGeo(section, length, …)` along x, y or z, with optional end cuts (`o.cut0`, `o.cut1` in degrees, made by shearing the end vertices) and chamfered ends |
| `truss(length, width, height, bays, o)` (architecture signature) | Chords are chamfered box sections (`bar` × `bar`, chamfer 0.15 × bar). Verticals are L sections. Diagonals follow `o.pattern`: `'warren'`, `'pratt'` or `'k'`. Every node gets gusset plates on both faces (chamfered plates of 2.5 × bar). If `width > 0`, the two truss faces are joined by X-bracing on top and bottom. About 360 triangles per bay. |
| `latticeTower(h, baseW, topW, o)` | Tapered 3- or 4-legged towers. `o.bracing`: `'x'`, `'k'` or `'tri'`. Founders towers get lathed ball nodes and ring collars every 4 to 6 bays. Wake kite masts are thin, with ribbons. Carrow's pylons are rimed in ice (§2.12). |
| `gantry(span, h, o)` | A portal frame: two box-section legs, a cross beam and knee braces. Used for pipe racks, crane rails and conveyor supports. |

Rules: no member thinner than 2 px at the distance its LOD0 is seen from. At LOD1, drop members thinner than 0.3 m and fatten the rest by 1.5×, so the truss still reads instead of shimmering.

### 2.6 Panelled walls and hulls

`panelWall(length, h, t, o)` composes a wall in this order:

1. **Plinth.** A wider base course, battered 6° to 10°, sunk 1.5 m below the ground.
2. **Body.** Proud plates on an irregular grid (`split`), with real gaps for seams.
3. **Pilasters or buttresses.** Every 6 to 12 m, protruding 0.6 to 1.5 m, chamfered, tapered.
4. **Coping.** A cap overhanging by 0.2 to 0.5 m, with a chamfered drip edge.
5. **Services.** A conduit run along the top third, a lamp on every second buttress, and a stencil plate on every third panel.
6. **Damage** (`o.damage`, 0 to 1). Missing plates expose a darker core with ribs or rebar. The top edge of the coping becomes `jag`ged. A rubble cluster gathers at the base.

Faction styles (`o.style`):

- **Dredge:** battered faces, riveted bands (a row of small bevelled studs every 0.6 m, studs at least 0.12 m), hazard chevrons on the edges at gates.
- **Founders:** large smooth panels with rounded seams. A seam-light strip (an emissive inset) sits in some of the grooves.
- **Wake:** not a wall at all but a barricade: salvaged plates at skewed angles, rig doors, drum stacks and canvas.

**Hulls** (ships, vehicles, the Dredge's bow). Use `loft(sections, o)`: a list of cross-section polygons with the same point count, placed along an axis or a path, skinned with quads. Sections may carry per-point flags for hard edges. Plating goes on as `armourPlate` strips that follow the section outline, with seams at every frame (each 3 to 5 m).

### 2.7 Ribbed tanks and vessels

`tank(r, h, o)` builds a lathe profile, then adds parts:

- **Skirt:** a base ring at 1.02 r and 0.4 m tall.
- **Body:** hoop ribs every `o.ribSpacing` (2 to 3 m). Each rib is a raised band `ribDepth` deep and `2 × ribDepth` tall, with chamfered profile corners.
- **Top:** `'dome'`, `'cone'` or `'flat'`, with a hatch ring and a vent stack.
- **Access:** a ladder (two rails and rungs every 0.35 m; rungs are dropped at LOD1) and a top catwalk (a grating annulus with posts every 2 m and a top rail ring).
- **Nozzles:** flanged stubs that pipe runs connect to.
- **Variants:** a horizontal tank on saddles (rotate it and add two saddle plates); a spherical Horton tank on equator legs with cross-bracing; the Wake's strapped water drums (`drum` plus two bevelled strap rings and a painted number).

A tank with r = 6, h = 14, six ribs and 32 segments costs about 4 to 6k triangles.

### 2.8 Antennas, masts and dishes

- `mast(h, o)`: a lattice or tube mast. With `o.guys` (3 or 4), it gets guy cables (catenaries with a small sag) down to bevelled ground anchor blocks.
- `dish(d, o)`: a lathed paraboloid shell with a thickened rim ring, radial back ribs, a feed horn on 3 or 4 struts, and a yoke and pedestal. Dishes slew slowly (`comm_array` animates them).
- `whips(n, area, h)`: a cluster of thin whip antennas with ball tips, at uneven heights.
- `panelArray(n, spacing)`: phased-array panels. The Founders version has a cyan seam on each panel.
- `choirArray(r, tines)`: the Founders' motif. Arcs of vertical tines and lattice rings, echoing the Cantors' heads. It appears on Carrow's pylons, the Lay and the Gate.

### 2.9 Cables, chains and cloth

```js
// Parabolic approximation of a catenary; sag in metres at mid-span.
export function catenary(a, b, sag, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); out.push(p); }
  return out;
}
export const cable = (pts, r = 0.08, radial = 5) =>
  kitFinalize(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, radial, false), { flat: false });
```

- **Bundles** are 2 to 5 cables with sags varied by ±15%, slightly different radii, and a clamp block wherever they attach.
- **Sag** is 2 to 4% of the span for power cables and 6 to 12% for slack cables and the Wake's string lights. String lights carry a lamp every 1.5 m: one instanced glow sprite per lamp (§4.5).
- **Chains** are alternating flat `ring`s, used near the player only. Beyond 60 m, use a cable instead.
- **Cloth** (awnings, tarps, canvas covers, kite ribbons): `awning(w, d, sag, o)` is a subdivided plane (8 × 4) with sag and wrinkle noise, using the double-sided `canvas` material. Wind moves vertices in the vertex shader; the motion is weighted by distance from the fixed edge, which is stored in `color.r`. Ribbons are strips of 2 × 8 triangles that flutter. Cloth is the only kit geometry with UVs.

### 2.10 Doors, windows and openings

- **Doors:** a frame (four slabs with chamfered joints), a recessed panel door with a hazard band (Dredge), a seam-lit iris or arch (Founders), or a canvas flap (Wake).
- **Windows:** holes in the plate (`plateGeo` holes) backed by a dark-glass plate 0.2 m behind. Lit windows use an emissive material. Window bands on big structures are one strip with a canvas texture of lit and unlit panes (instanced, with UVs).
- **Bays:** recesses 12 to 16 m tall, with a darker inner volume and a lip, so that they read as deep at 300 m.

### 2.11 Debris and wreck generators

**Debris chunks** are used by `particles.debris` and the `wreck_debris` and `concrete_chunk` props. There are six kinds, each under 150 triangles, each with three seeded variants:

| Kind | Construction |
| --- | --- |
| `plateShard` | A chamfered rectangle with one or two `jag`ged edges, 0.15 to 0.4 m thick, bent 10° to 30° about a random line (vertices on one side of the line are rotated) |
| `beamStub` | An I-section 1 to 3 m long with one square cut and one torn cut (jagged sheared end) |
| `concreteChunk` | `rockGeo` with 9 cuts and low noise, plus 2 rebar stubs (thin cylinders bent at the ends) |
| `pipeStub` | A short `cylinderBetween` with a flange at one end and a jagged ring at the other |
| `panelPiece` | A fragment of `panelBox` with two seams |
| `shard` | Ice (L1, L7) or glass (L4): a thin extruded triangle or quad with a 0.02 m bevel, crisp facets |

**Wrecks.** `wreckify(builder, rng, o)` works on a `GeoBuilder`'s entries before they merge:

- `o.drop` (0.1 to 0.3): remove random non-structural entries.
- `o.peel`: rotate random plates by 10° to 40° about one of their edges, so they hang off.
- `o.sag`: pull vertices down along a parabola between supports.
- `o.holes`: an array of damage centres. Remove plates within the radius and ring the hole with `plateShard`s, so the rim is torn rather than clean.
- `o.char`: swap entries near the damage centres to the scorched material variant.
- It returns scatter positions for debris props around the wreck.

`vehicle_wreck` is a unit model passed through `wreckify`, then tilted, half sunk into the ground, burning for 20 s and smoking after that. `mech_wreck` follows the architecture's `buildMechWreck`.

**Ruins.** `ruin(builder, rng, o.decay)` cuts a building recipe down. Each column of panels gets a top height of `h × (1 − decay × noise)`. Broken top edges are `jag`ged. Floor slabs stick out with rebar. A rubble mound (a flattened `rockGeo` in concrete) sits at the base, with chunks scattered around it.

### 2.12 Rocks, strata, cliffs and ice

**Faceted rocks.** Displace an icosahedron, then cut it with random planes. Projecting vertices onto each plane is what produces large flat facets with crisp edges, and that is what separates a cut rock from a potato.

```js
export function rockGeo(seed, o = {}) {
  const { detail = 2, cuts = 7, cutDepth = [0.55, 0.85], noise = 0.16, squash = 0.8,
          flatBottom = 0.35, strata = 0, strataBands = 5 } = o;
  const rng = mulberry32(seed), n2 = createNoise2D(seed);
  const n3 = (x, y, z) => (n2(x, y) + n2(y + 31.7, z) + n2(z - 17.3, x)) / 3;    // cheap 3D from 2D (noise.js is 2D)
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = BufferGeometryUtils.mergeVertices(g);                // shared vertices: displacement stays watertight
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const u = (rng() * 2 - 1) * 0.6, a = rng() * TAU, s = Math.sqrt(1 - u * u);   // unit normal, kept off the poles
    planes.push([s * Math.cos(a), u, s * Math.sin(a), lerp(cutDepth[0], cutDepth[1], rng())]);
  }
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + noise * n3(v.x * 1.7, v.y * 1.7, v.z * 1.7));
    v.y *= squash;
    for (const [nx, ny, nz, d] of planes) {                 // flatten everything beyond each plane onto it
      const t = v.x * nx + v.y * ny + v.z * nz - d;
      if (t > 0) { v.x -= nx * t; v.y -= ny * t; v.z -= nz * t; }
    }
    if (v.y < -flatBottom) v.y = -flatBottom + (v.y + flatBottom) * 0.15;
    if (strata) {                                           // stepped ledges: alternate bands bulge and recess
      const b = Math.floor((v.y + 1) * strataBands * 0.5) % 2;
      v.x *= 1 + strata * (b ? 0.06 : -0.04); v.z *= 1 + strata * (b ? 0.06 : -0.04);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return kitFinalize(g, { flat: true });                   // de-index → face normals → crisp facets
}
```

| Variant | Settings |
| --- | --- |
| `boulder` | cuts 6, noise 0.12 |
| `slab` | squash 0.35, cuts 4, one big flat top |
| `spire` | stretch y ×3 after building, cuts 8, strata 1 |
| `talus` | small, noise 0.2, cuts 5 |
| `ice_block` | cuts 10, noise 0.04: almost pure planes |
| `glass_lump` (L4) | cuts 8, noise 0.08, shiny material |

Rocks share the terrain's triplanar detail (§3.5) so that big facets are never featureless. Use the `rock` material with the level's strata colours.

**Cliff skins.** The heightfield's 8 m cells cannot make vertical walls, ledges or overhangs. Wherever the slope exceeds 0.65, the scatter system places **cliff skins**: meshes that sit over the terrain face, partly embedded in it.

```js
// A strata cliff segment: `layers` stacked slabs, each a noisy top-view outline extruded upward.
// Hard layers stick out and soft layers recess, giving ledges. w × h metres; the face points toward −Z.
export function cliffSkin(seed, w = 48, h = 36, o = {}) {
  const { layers = 7, depth = 10, ledge = 1.6, pts = 28 } = o;
  const rng = mulberry32(seed), n2 = createNoise2D(seed), parts = [];
  let y = 0;
  for (let k = 0; k < layers; k++) {
    const lh = h / layers * lerp(0.6, 1.4, rng()), hard = k % 2 === 0;
    const out = [];
    for (let i = 0; i <= pts; i++) {                       // the front edge, noisy
      const x = -w / 2 + w * i / pts;
      out.push([x, -(hard ? ledge : 0) - 1.2 * n2(x * 0.08, k * 3.1) - (hard ? 0 : rng() * 0.6)]);
    }
    out.push([w / 2, depth], [-w / 2, depth]);              // back edge, buried in the slope
    parts.push(withY(plateGeo(out, lh, 'top', hard ? 0.35 : 0.2), y + lh / 2));
    y += lh;
  }
  return kitMerge(parts);   // about 300 triangles per layer
}
```

Cliff skins are props (`cliff_skin#0..5`) with `align = 1` to the slope's aspect, placed in clusters, with talus (`rock_small`, `talus`) scattered at their feet. They are the main reason L3 will look like a real canyon.

**Hoodoos and spires** (L3). Stacked lathe drums of noisy radius (4 to 7 drums, each 3 to 8 m tall) with a wider caprock slab on top. The caprock is a harder colour, one stratum lighter.

**Ice** (L1, L7, L8):

- `floe(seed, r, thick)`: a noisy top-view polygon extruded 1.5 to 3 m with a 0.3 to 0.6 m bevel (rounded by melting), plus a snow layer inset 0.3 m on top.
- `pressureRidge(path, h)`: piles of tilted `ice_block` rocks and thin slabs (4 to 12 m × 2 to 6 m × 0.6 to 1.5 m) along a path, tilted 20° to 70°.
- `icicles(edge, n)`: rows of thin lathed spikes under overhangs. Instanced.
- **Ice cavern** (L1): an inside-out faceted shell (a large `rockGeo` with 14 cuts, scaled and with its normals flipped), with pillars and a blue fake-subsurface glow (§3.11).
- **Rime**: thin bevelled plates on the windward faces of structures, plus an `icicles` row under each beam. Rime goes on as a separate merged entry using the `ice` material, so it costs no new structure geometry.

### 2.13 Greebling rules

**The library.** Each greeble is a small kit function of 20 to 200 triangles: `vent` (louvred: a chamfered frame with 3 to 6 slats), `hatch` (round or square, with hinge blocks and a handle), `junctionBox` (a slab with a door seam and a conduit stub), `conduit` (a thin `pipeRun` along an edge), `cableTray`, `studRow` (studs at least 0.12 m), `lamp` (§4.5), `ladder`, `handrail` (posts every 1.5 to 2 m and two rails), `grating`, `stepPlates`, `piston` (two lathed cylinders), `hinge`, `exhaust` (lathe with a rain cap), `finBank` (heat-sink fins), `whip`, `sensorDome`, `strap`, `stencilPlate` (an anchor for a decal), `beacon`.

**Placement rules**

1. **Cluster, don't sprinkle.** Greebles come in groups of 3 to 7 with one dominant piece, placed where function puts them: around doors, at corners, under eaves, along seams, at the base and at the top.
2. **Follow the grid.** Align to the panel grid and the seams. Never straddle a seam at random.
3. **Plausible function.** Vents go near engines and on roofs. Ladders lead to platforms. Conduits connect boxes. Pipes enter walls through flanges.
4. **Busy top, calm face.** The busiest clusters go on top edges (roof clutter makes skylines read). The large faces that face the play space stay calmer, with at most one cluster per panel.
5. **Density.** One cluster per 25 to 60 m² of face at mech scale. None on faces that are never seen from closer than 150 m; those get plates instead.
6. **Budget.** Greebles are at most 25% of a structure's LOD0 triangles. LOD1 drops them all, except the pieces that make the roof silhouette.
7. **Three sizes.** Greebles come in three sizes relative to their panel (1/2, 1/4 and 1/8 of it), never all one size.
8. **By faction.** Wake greebles are mismatched: rotated ±8°, mixed bevels, extra straps and patches. Dredge greebles repeat in rhythm (every third bay). Founders greebles are minimal: one seam-light strip and one plaque per face, and the curves do the rest.

**The generator.** `greebles(rng, w, h, density, o?)` (architecture signature, plus an optional `o.style`) splits the face recursively, k-d style, with random ratios from 0.3 to 0.7 to a depth of 3 or 4. Each cell is left empty with 40% probability; otherwise it picks a recipe from the style's weighted table and sizes it to 60 to 90% of the cell. The output is merged geometry on local XY with +Z out.

### 2.14 Composition grammar

Every structure type's `build()` follows these steps, in this order, using one `GeoBuilder`:

1. **Ground contact.** A plinth or foundation that goes 1 to 3 m below the ground. Nothing floats, and nothing meets the terrain on a hard line: add a skirt, a dirt or snow drift (a terrain stamp plus a decal), and rubble.
2. **Mass.** One to three primary volumes. This is the silhouette.
3. **Frame.** Columns, ribs, buttresses or trusses that show how it stands up, with rhythm.
4. **Skin.** Panels and plates over the frame, with seams, offsets and insets.
5. **Trim.** Copings, edge strips, bands, hazard edges.
6. **Function.** Doors, bays, windows, ladders, railings, pipes, vents. These are the scale cues.
7. **Greebles.** In clusters, per §2.13.
8. **Lights.** Lamps, seam strips, beacons (§4.5).
9. **Marks.** Stencils, numbers, painted names, chevrons (decal quads, §4.7).
10. **History.** Wear amount, frost or sand drifts, `wreckify` damage, debris scattered around.

At most five materials per structure plus one emissive, which is six draw calls and matches the architecture's LOD0 limit. Every entry gets a tint jitter of ±4 to 8% in value, so that no merged mesh reads as one flat colour block.

### 2.15 Structure recipes

The architecture's generic types (Appendix C.3) keep their ids and parameters. Each gets an optional `params.style: 'wake' | 'dredge' | 'founders'` (default `'dredge'`), which switches materials, bevel sizes, greeble tables and wear.

**Towers**

- `watchtower` (Dredge): a battered concrete shaft (tapered slab, 1 m chamfers), a ladder cage up one face, a cantilevered cab (slab with a dark-glass window band and a sodium lamp), roof clutter (whips, a searchlight on a yoke) and hazard bands at the cab line.
- `relay_pylon` / `terraform_pylon` (Founders, Carrow): a `latticeTower` with ring collars and lathed ball nodes, rime on the windward side, icicles under each collar, and faint cyan node lights (mostly dead, a few flickering).
- `kite_mast` (Wake): a thin lattice mast on a rig, with guy cables, a spool and ribbons.

**Bridges** (`bridge`; the Gerrow Bridge is `style: 'founders'`, rusted):

```js
build(ctx, p, rng, K) {
  const { length: L = 120, h = 20, width: W = 24 } = p, B = new K.GeoBuilder(), M = ctx.materials;
  for (const x of piersFor(L)) {                                   // tapered piers with cutwater noses and caps
    B.add(K.slab(6, h, 9, { taper: 0.8, chamfer: 1.2 }), M.get('concrete'), { pos: [x, h / 2 - 3, 0], tint: 0.06 });
    B.add(K.slab(7.5, 1.6, 10.5, { chamfer: 0.5 }), M.get('concreteDark'), { pos: [x, h - 0.8, 0] });
  }
  B.add(K.ribbedPlate(L, 1.4, W, { pitch: 4 }), M.get('steelDark'), { pos: [0, h + 0.7, 0] });      // deck
  for (const s of [-1, 1]) {
    B.add(K.truss(L, 0, 9, Math.round(L / 6), { pattern: 'pratt', bar: 0.55 }), M.get('rust'),
          { pos: [0, h + 1.4, s * (W / 2 - 0.5)], tint: 0.08 });
    B.add(K.handrailRun(L, 1.1), M.get('steelDark'), { pos: [0, h + 1.4, s * (W / 2 - 1.6)] });
  }
  for (const x of [-L / 2, L / 2]) B.add(K.gantry(W, 10.5, { bar: 0.7 }), M.get('rust'), { pos: [x, h + 1.4, 0], rot: [0, Math.PI / 2, 0] });
  // lamps every 20 m (dead Founders lamps), lateral bracing over the deck, a stencil plate on each portal,
  // then K.wreckify(B, rng, { drop: 0.08, peel: 0.05 }) for the missing deck plates and hanging rails.
  return { root: B.build({ castShadow: true, receiveShadow: true }), lod: B.buildSingle(colorOf) };
}
```

**Walls and barricades.** `wall` is a `panelWall` in the chosen style. `barricade` (Wake) is salvaged plates at 5° to 15° skews, drums, a rig door and canvas, with painted marks.

**Bunkers** (`bunker`, Dredge): a low battered concrete mass with 1 to 2 m chamfers on the top edges; a firing slit (a recess with a dark interior and a lip); a blast door with a hazard band; roof vents, a whip and a lamp; and an earth berm made with a terrain `raise` stamp around it.

**Refineries** (`refinery`, the L4 motor sites, L6 industry): a seeded layout on a 6 m grid. Two to four tank clusters, one or two process columns (tall lathe columns with platforms every 6 m, ladders and pipe risers), pipe racks linking nozzles along Manhattan paths (mixed diameters, colours by duty), one flare stack (lathe stack on a lattice with a flame emitter), lamps along the walkways, and steam vents.

**Ruined cities** (L2 colony turbine ruins, L8 Stillwater):

- Founders domes: `dome` lathes with rounded ribs, a ring of dark-glass windows and snow caps. Habitat cylinders join them with ribbed tubes. Collapsed domes leave out wedges of the lathe (using `phi0` and `phiLen`) with `jag`ged rims and drifts piled against them.
- Wind-turbine ruins (L2): a tapered lathe tower with flanged sections, a rounded nacelle, and blades made by lofting a chamfered airfoil profile with twist. Broken turbines lie half buried in the reeds, with a blade snapped at its root.

**Crashed ships** (`crashed_ship`; the *Abeyance* in L1 and the Parasol in L4 are custom set pieces built on this recipe). Build the hull by lofting cross-sections along the keel. Show frames every 3 to 5 m wherever plating is missing. Lay plating as strips with seams at every frame. Add deck levels and superstructure blocks. Cut breaches with `wreckify` holes. Embed the lower hull: the ground (or ice) hides it, drifts and slabs pile up against it, and icicles or sand streaks hang from overhangs. Add stencils and an interior made of decks, gratings, bulkheads with hatches, ladders and cargo racks.

### 2.16 Story catalogue: structure types by level

New type ids, added to architecture Appendix C.3 (adding names is allowed). "Custom" means a level-only type registered from `levels/levelNN/`.

| Level | Type id | What it is | Size | Built from | Far view |
| --- | --- | --- | --- | --- | --- |
| L1 | `abeyance` (custom) | the colony freighter frozen upright in the ice, climbable inside | 140 m tall | `loft` hull, frames, plating, 12 decks, breaches, ice collar | skyline silhouette against the dawn rim |
| L1 | `ice_floe`, `pressure_ridge` | sea ice and its ridges | floes 15 to 60 m | §2.12 ice | instanced |
| L1 | `ice_cavern` (custom) | the underground cavern and shaft | 300 m | inside-out faceted shell | (interior) |
| L1 | `wake_camp` | rigs, flares and lamps on the shore | 200 m | rig props, lamps, canvas | warm lights at 2 km |
| L2 | `sundial` (custom) | the Founders' gnomon the Wake steers by | about 1 km | §2.17 | dominant skyline needle all level |
| L2 | `turbine_ruin` | colony wind turbines, standing and fallen | 60 to 90 m | lathe tower, lofted blades | silhouettes on ridges |
| L2 | `tank_cairn` | roadside cairn of empty tanks | 6 m | drums, straps, painted names | |
| L3 | `gerrow_bridge` (= `bridge`, founders) | the rusted truss road bridge | 160 m | §2.15 | |
| L3 | `gerrow_dam` (custom) | Dredge concrete dam with sluices and lamps | 450 m tall, 300 m wide | §2.17 | lamps glowing at the canyon's end |
| L3 | `hoodoo`, `cliff_skin` | canyon rock | 10 to 60 m | §2.12 | |
| L4 | `parasol_petal` | a fallen mirror petal, some re-motored | up to 1 km | §2.17 | glints and white glare |
| L4 | `parasol_spine`, `parasol_hub` (custom) | the 2 km backbone and its rebuilt control spine | 2 km | giant trusses, Dredge additions | the Burn's thread rising from the hub |
| L4 | `motor_site` | Dredge crew camp at a petal motor | 120 m | `refinery` style dredge, small | |
| L5 | `terraform_pylon` | humming lattice towers rimed in ice | 60 to 90 m | `latticeTower`, rime | a forest of silhouettes against the aurora |
| L5 | `carrow_hall` (custom) | Founders halls refitted as a pressing station | 1 km complex | barrel vaults, Dredge iron | |
| L5 | `rack_bank` | hundreds of racked Dredge frames | 100 m per bank | instanced frame silhouettes in cradles, ghost beacons | |
| L5 | `floodlight_mast` | yard floodlights | 30 m | lattice and lamp banks | |
| L6 | `dredge_*` (12 modules) | the walking city | 3 km | §2.17 | a 3 km wall of lights |
| L7 | `giant_wreck` | dead war-walkers from the Founders' War | 60 m | mech kit at ×5 with a new detail layer | silhouettes in the ice fog |
| L7 | `cantor_dead` | white Cantors, kneeling and half buried | 11 m (Moth's frame) | the Moth build in `cantor` colours, posed | |
| L7 | `the_fall`, `founders_gate` (custom) | the frozen waterfall and the sealed lift-road gate | 1 km tall | §2.17 | dominant backdrop |
| L8 | `stillwater_dome`, `the_lay` | snowed-in domes; the ring of lattice stones | domes 20 to 60 m; ring 120 m | lathe domes; `choirArray` stones | white domes on the far shore |
| L8 | `dredge_*` (listing) | the Dredge again, moving and listing | 3 km | L6 kit, damaged state | |

### 2.17 Hero landmark sheets

Each level opens on its hero landmark and ends at it (bible §6.0). These are the most important assets in the game. Each one is a level-only set piece with its own LOD chain and a skyline version.

**The *Abeyance* (L1).** A colony freighter frozen upright in the sea ice, 140 m tall, leaning about 10°.
- *Silhouette:* a tall hull with a broken superstructure crown and a bent mast, black against the red dawn rim. Breaches on the dawn side let light through.
- *Construction:* the hull is a loft of a rounded-rectangle section, 24 × 18 m, with about 30 frames. Plating strips have seams at every frame. Inside are 12 decks (grating, bulkheads, hatches, ladders, cargo racks) for the vertical climb. An ice collar of heaped `ice_block`s and icicle curtains surrounds the base, with rime on the windward side.
- *Materials:* aged Founders ceramic plating over grey steel frames, heavily iced. The Founders' stencil and the lattice-ring emblem are on an interior bulkhead (a decal).
- *Lights:* none of its own. It is dead. Kit's flares and the dawn are its light, through shaft cards at the breaches (§5.4).
- *Budget:* LOD0 including the interior ≤ 200k triangles (architecture's set-piece limit). LOD1 is the exterior only, ≤ 15k. The skyline version is a single silhouette mesh.

**The Sundial (L2).** The Founders' navigation gnomon, about 1 km tall.
- *Silhouette:* a tapering blade of triangular section with rounded edges, inclined toward the pole and carried on a buttressed pedestal. Around its foot is a 1.2 km dial ring of marker monoliths. (Exact geometry follows the level 2 design doc; this sheet is the art target.)
- *Construction:* the blade is a `loft` of rounded triangles, with seams every 20 m and gold edge seams. The pedestal is a stepped Founders plinth. The markers are `slab`s with plaques.
- *Lights:* gold seam-light, dim. It catches the sunrise first.
- *Far view:* it must read from every point on the 9 km route. Use a skyline object kept at a constant angular size, at `min(dist, camera.far × 0.9)` (architecture §5.8). Its long shadow is real gameplay (the Wake camps in it), so register it as a shadow caster in the terrain data texture (§3.4).

**The Gerrow Dam (L3).** Dredge concrete and iron, about 450 m tall and 300 m wide, plugging the top of the canyon.
- *Silhouette:* a battered face with vertical buttress ribs every 20 m and three iron sluice gates; a crest with crane rails and the Gatekeeper; a lake behind.
- *Construction:* pour lines as geometry steps every 15 m (and in the concrete texture every 3 m), iron walkways cantilevered off the face, rows of sodium lamps, and thin seepage falls (alpha strips with mist at their feet, §6.9). The blow is scripted: the central section is pre-fractured into 30 to 60 chunks (Voronoi-style slabs) kept as separate meshes.
- *Lights:* sodium lamps glowing in the daylight shadow. They are the first thing seen in the vista.

**The Parasol (L4).** A fallen orbital mirror. Kilometre-wide petals lie shattered across the glass dunes, joined by a 2 km spine.
- *Silhouette:* fan-shaped petals made of radiating truss ribs that carry hexagonal mirror facets, many missing or cracked, half buried and tilted. Three petals are re-motored by the Dredge on black iron mounts and track the sun.
- *Construction:* facets are thin bevelled hexagonal plates in frames, instanced per petal. The spine is a giant truss tube, half buried. The hub is a Dredge-rebuilt control spine (black iron, oxide, lamps).
- *Materials:* mirror (§4.2) with cracks in its roughness, and glints (§6.12).
- *Effects:* the Burn is a white beam rising from the hub (§6.8). Burn-lines are 20 m beams sweeping the ground.

**Carrow Station (L5).** A forest of Founders terraforming pylons, then the station.
- *Pylons:* `terraform_pylon`s 60 to 90 m tall, rimed on the windward side, humming, with a few cyan node lights.
- *Station:* long Founders barrel-vault halls in white ceramic, refitted with crude bolted Dredge iron (black plates over white, ugly welds).
- *Racks:* rows of Dredge frames hung in cradles. These are instanced simplified mech silhouettes (one InstancedMesh per rack bank, about 1.5k triangles each), each with a ghost beacon that wakes in sequence (bible §6 L5 beat 5).
- *The yard:* floodlight masts and a loading yard. At the station's far side, the Dredge's bow is a cliff of lights in the dark.

**The Dredge (L6, L8).** A walking mining city, 3 km long, about 300 m wide and 350 m tall, on forty tracked legs.
- *Silhouette:* a long stepped hull with bucket wheels at the bow, a forest of flare stacks amidships, conveyor canyons, and cranes. At night it is a wall of sodium lights with pale green beacons scattered through it.
- *Construction:* a kit of twelve modules, instanced and arranged along a spine (bible §6 L6 low-tier note):

| # | Module | Notes |
| --- | --- | --- |
| 1 | `dredge_hull` | a 60 × 60 m deck block, battered sides, riveted bands; three height variants |
| 2 | `dredge_leg` | a tracked leg cluster: bogie, four tracked feet, hydraulic pistons |
| 3 | `dredge_wheel` | a bucket wheel (rotates, climbable) |
| 4 | `dredge_conveyor` | a belt span on gantries (the belt is a moving platform with scrolling slats) |
| 5 | `dredge_stack` | a flare stack: lathe, lattice support, flame emitter |
| 6 | `dredge_pen` | water-pen tiers with lit windows (tungsten, because the Hands are alive) |
| 7 | `dredge_crane` | a lattice jib crane |
| 8 | `dredge_bridge` | an extending deck bridge (30 s cycle) |
| 9 | `dredge_pipes` | a pipe bundle segment |
| 10 | `dredge_chute` | the tailings chute with falling slag |
| 11 | `dredge_dock` | Gleaner docks with chalked body-drums |
| 12 | `dredge_bow` | the prow plates |

  The Press (the heart) and the Press hall are level-only set pieces.
- *Lights:* thousands of lamps as one InstancedMesh of glow sprites (§4.5), never individual lights. The pooled point lights go to the lamps nearest the player.
- *Far view:* distant sections are impostor cards (bible) or LOD1 merges. The whole city on the horizon (L5's end, L7's climb, L8's chase) is a skyline object with a lamp sprite layer.

**Founders' Field and the Fall (L7).**
- *Dead giants:* twelve 60 m war-walkers built from the mech kit at ×5, **with a new detail layer** (law 7): panel seams and greebles on every large plate, plus exposed internal frame where armour is missing. They are posed broken, kneeling or fallen, half buried in snow and permafrost.
- *Cantors:* thirty white Cantors (Moth's frame, 11 m, in the `cantor` scheme) kneeling or slumped, each posed differently, with snow drifted against them and rime on their tops. Their seam-light wakes in gold and cyan when sung to.
- *The Fall:* a kilometre-high frozen waterfall at the foot of the polar Rampart. Build it from vertical ice flutes: extruded or lathed columns of varying radius, layered in three depth planes, with dark crevices between them and a fake-subsurface ice material (§3.11). Ice fog pools at its foot.
- *The Gate:* a Founders lift-road gate, a rounded arch with `choirArray` motifs, sealed by a slab of ice that the crews cut away (progress is shown by geometry swaps and sparks).

**Stillwater and the Lay (L8).** Snowed-in white ceramic domes on the far shore, under a gold sun that never moves. The Lay is a 120 m ring of lattice stones (`choirArray` monoliths). Pack ice and steaming leads lie between the player and the shore. All Founders seams here are dim cyan until the endings.

### 2.18 Kit budgets and LOD

- Structure LOD0 ≤ 6 draw calls and ≤ 60k triangles; LOD1 is 1 draw call (`buildSingle`, vertex colours) and ≤ 6k triangles; set pieces ≤ 200k / 15k (architecture §7.5).
- **LOD1 recipe:** drop greebles (except the roof silhouette pieces), drop members thinner than 0.3 m, halve lathe segments, merge plates into their parent slabs, and bake the material's average colour, multiplied by an edge lightening of +8%, into vertex colours.
- **Impostors** (landmarks beyond the view distance and the Dredge's far sections): the skyline layer (architecture §5.8) uses LOD1 geometry with an unlit fog-tinted material and a separate lamp sprite layer. Static billboards are allowed only beyond 3 km.
- **Sharing.** Geometry is cached by `type + JSON(params)`. Repeated elements (floes, rack frames, Dredge modules, petal facets, pylons) are InstancedMeshes, one per geometry and material.
- **Mesh time.** Structures are realised one per frame (architecture §5.7), so realising one must cost under 4 ms. Building a large merge from hundreds of extrusions can take 20 to 40 ms, so build each unique `type + params` merge **during loading** (after `World.load` step 4, reported as loading progress) and keep it in the geometry cache. Realising then only creates meshes from cached geometry. Cache profile geometries too, and merge with `mergeGeometries`.

---
## 3. Terrain

### 3.1 Targets

- No visible tiling at any distance from 5 m to the horizon.
- Slope and height read at a glance: flats are soil, sediment, snow or reeds; slopes over about 30° are rock with strata; ridges are paler and wind-scoured; gullies are darker and wetter.
- The route bed reads as a worn road: compacted, paler, rutted.
- Big terrain casts big shadows on every tier, including canyon walls hundreds of metres long (L3 depends on this).
- Every biome has its own ground signature (§3.11).

### 3.2 Layers of terrain detail

| Scale | Source | Owner |
| --- | --- | --- |
| > 200 m | heightfield relief, macro features, corridor walls | P2 (architecture §5.3) |
| 20 to 200 m | erosion channels, sediment fans, talus, strata bands; **cliff skins** on steep faces (§3.8) | P2 bake + scatter |
| 2 to 20 m | baked vertex colour, slope blend, macro noise (1/420 m), rocks and props | P2 |
| 0.1 to 2 m | two-scale world-space detail texture, triplanar rock, derivative bump | the terrain shader (§3.5) |
| < 0.1 m | ground cover (pebbles, tufts, reeds), sparkle | scatter, shader |

### 3.3 The vertex bake

Architecture §5.4 bakes a palette colour per vertex and multiplies it by baked lighting. Change one thing: **multiply by sky AO only, not by sun visibility.** The sun gate (§3.4) now handles terrain shadows physically, so shadowed ground still gets sky light and only loses the sun, and units standing in that shadow are shadowed too. Baking the sun into albedo would darken shadows twice.

Per vertex:

```
c = palette.ground
c = lerp(c, palette.sediment, smooth(0.15, 0.6, flow) × 0.8)       // sediment fans and channels
c = lerp(c, palette.high,     smooth(h20, h80, height) × 0.5)        // paler, wind-scoured heights (h20/h80: height percentiles)
c = lerp(c, palette.rock,     smooth(0.45, 0.75, slope))             // coarse rock; the shader refines it per pixel
c = lerp(c, palette.dust,     routeBed × 0.6)                        // worn road: paler and dustier
c × = 0.88 + 0.24 × valueNoise(x/37, z/37)                           // patchiness
```

Plus one new attribute, `surf` (Uint8 × 4, normalised): **r** = flow or wetness, **g** = sediment, **b** = sky AO, **a** = route-bed mask. The shader uses all four.

### 3.4 The terrain data texture and the sun gate

The shadow map covers 80 to 160 m around the player. Canyons, mountains, the Sundial, the Dam and the Dredge cast shadows over kilometres. The fix is one shared texture that every patched material reads.

**`TerrainData`** (P2 bakes it; P1 consumes it). An RGBA `HalfFloat` `DataTexture` with one texel per macro cell (8 m on High and Medium, 16 m on Low), covering `heightfield.bounds`:

- **R:** ground height (m).
- **G:** **shadow top** for the current sun (m): the height below which a point in this cell is in shadow from terrain and registered casters.
- **B:** flow (0 to 1).
- **A:** the local water level (m), or −10000 where there is no water.

The bake extends architecture §5.3 step 7. It needs about 0.3 s for the corridor plus a 600 m margin, with a coarse 32 m pass outside that.

```js
// After erosion. casterTop(x, z) is the top of any registered shadow caster there (−Infinity if none).
function bakeShadowTop(hf, sunDir, casterTop, out) {
  const l = Math.hypot(sunDir.x, sunDir.z);
  if (l < 0.02) { out.fill(-1e4); return; }                   // sun overhead: no terrain shadows
  const dx = sunDir.x / l, dz = sunDir.z / l, tanE = sunDir.y / l;
  const steps = []; for (let t = 4; t < 2500; t *= 1.12) steps.push(t);   // about 56 steps, 4 m to 2.5 km
  for (let j = 0; j < hf.nz; j++) for (let i = 0; i < hf.nx; i++) {
    const x = hf.x0 + i * hf.cell, z = hf.z0 + j * hf.cell;
    let top = -1e4;
    for (const t of steps) {
      const px = x + dx * t, pz = z + dz * t;
      const h = Math.max(hf.macroBilinear(px, pz), casterTop(px, pz));
      top = Math.max(top, h - t * tanE);
    }
    out[j * hf.nx + i] = top;
  }
}
```

**Shadow casters** (proposed `ctx.world.addShadowCaster(footprint, top)`, called before the bake). Large static structures register their footprint polygon and top height: the Sundial blade, the Dam, the *Abeyance*, Parasol petals and spine, the Dredge. Treating a caster as a solid column is wrong underneath an overhang, but the result there is "in shade", which is what gameplay wants anyway.

**The sun gate** (P1, in `atmosphere.patchMaterial`). It multiplies only the sun's direct light. Sky light, rim, point lights and emissives are untouched. It hooks the directional light loop in `lights_fragment_begin`. In r170 that loop is unrolled by string replacement, so `UNROLLED_LOOP_INDEX` is a literal number. The shadow-casting sun is always directional light 0, because three sorts shadow-casting lights first.

```js
const GATE_PARS = /* glsl */`
uniform sampler2D uTerrainData; uniform vec4 uTerrainRect;     // x0, z0, 1/width, 1/depth (m)
uniform vec4 uSunFront;                    // dir.xz (unit, points toward the lit side), offset, softness; offset = -1e9 → off
uniform float uGateOn;                                           // 0 in menus, the garage, lattice-space
float sunGate(vec3 wp) {
  vec2 tuv = (wp.xz - uTerrainRect.xy) * uTerrainRect.zw;
  float top = texture2D(uTerrainData, tuv).g;
  float g = smoothstep(-1.5, 2.5, wp.y - top);
  g *= smoothstep(-uSunFront.w, uSunFront.w, dot(wp.xz, uSunFront.xy) - uSunFront.z);
  return mix(1.0, g, uGateOn);
}`;
function patchSunGate(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GATE_PARS)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\t#if UNROLLED_LOOP_INDEX == 0\n\t\tdirectLight.color *= sunGate( vFogWorld );\n\t\t#endif'));
}
```

`vFogWorld` is the world-position varying that the fog patch already adds (architecture Appendix B.3). There is one texture fetch per pixel, on every tier.

**Uses of the sun gate:**

- Canyon and mountain shadows at any distance (L3, L6's bow under the Hasp).
- Landmark shadows (the Sundial's shadow, which points north at noon in L2; the Dam's shadow over the canyon floor).
- L4's shade, which is gameplay. The heat system queries the same data on the CPU (a proposed `ctx.world.sunVisible(x, y, z)`), so what you see is exactly what cools you.
- **The sun front** (`uSunFront`): a moving terminator. It drives the L1 sunrise wall that runs across the shelf, and splits L6 between its lit tail and its dark bow (§5.8).

**Rebakes.** A level's sun is fixed, so the bake runs once at load. When the sun moves (L1's sunrise, from below the horizon to 4°), the front handles the sweep and the bake runs once more at the final angle, behind the front. Moving casters (L4's tracking petals) are re-rasterised into the caster grid for the 1 km around the player every 2 s, spread over frames (about 15 ms of total work).

### 3.5 The terrain material

A `MeshStandardMaterial` (`vertexColors: true`, roughness 0.92, metalness 0) patched in `onBeforeCompile`, then passed through `atmosphere.patchMaterial` (fog and sun gate). Chunk names are r170's.

```js
// world/terrain.js (P2). S = art.surface (Appendix A), T = ctx.materials.textures.
const U = {
  tSoil: { value: T.grain }, tRock: { value: T.rock }, tNoise: { value: T.noise }, tStrata: { value: strataRamp(art) },
  uRockSlope: { value: new THREE.Vector2(...(S.rockSlope ?? [0.28, 0.5])) },
  uStrata: { value: new THREE.Vector3(S.strataHeight ?? 9, S.strataWarp ?? 1.5, S.strataStrength ?? 0.8) },
  uSnow: { value: new THREE.Vector3(S.snow ?? 0, S.snowSlope?.[0] ?? 0.75, S.snowSlope?.[1] ?? 0.92) },
  uSnowColor: { value: new THREE.Color(art.palette.snow ?? '#e8eef5') },
  uWet: { value: S.wetness ?? 0.5 }, uGloss: { value: S.gloss ?? 0 }, uBump: { value: S.bump ?? 1 },
  uPath: { value: new THREE.Color(art.palette.dust) },
};
mat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 surf;\nvarying vec4 vSurf;\nvarying vec3 vTW, vTN;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vSurf = surf;
      vTW = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
      vTN = inverseTransformDirection(transformedNormal, viewMatrix);`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TERRAIN_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + TERRAIN_ALBEDO)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + TERRAIN_ROUGH)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + TERRAIN_NORMAL);
};
mat.customProgramCacheKey = () => 'terrain:' + (ctx.tier.terrainDetail ?? 'full');
```

```glsl
// TERRAIN_PARS
uniform sampler2D tSoil, tRock, tNoise, tStrata;
uniform vec2 uRockSlope; uniform vec3 uStrata, uSnow, uSnowColor, uPath;
uniform float uWet, uGloss, uBump;
varying vec4 vSurf; varying vec3 vTW, vTN;
float tH, tR;                                                 // height and roughness, shared between chunks
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 perturbH(vec3 p, vec3 n, float h, float k) {           // derivative bump, the same maths as three's bumpmap
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}

// TERRAIN_ALBEDO (diffuseColor.rgb already holds the vertex colour)
vec3 wn = normalize(vTN);
vec4 soil = texture2D(tSoil, vTW.xz * 0.111);                                 // 9 m period
#ifndef TERRAIN_LITE
  soil = mix(soil, texture2D(tSoil, rot2(0.83) * vTW.xz * 0.027), 0.35);      // 37 m period, rotated
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= dot(bw, vec3(1.0));
  vec4 rk = texture2D(tRock, vTW.zy * 0.06) * bw.x + texture2D(tRock, vTW.xz * 0.06) * bw.y
          + texture2D(tRock, vTW.xy * 0.06) * bw.z;                           // triplanar, 17 m period
#else
  vec4 rk = texture2D(tRock, vec2(vTW.x + vTW.z, vTW.y) * 0.06);              // one cheap vertical projection
#endif
float macro = texture2D(tNoise, vTW.xz * 0.0024).r;                           // 420 m period
float rockW = smoothstep(uRockSlope.x, uRockSlope.y, 1.0 - wn.y + (soil.g - 0.5) * 0.12);
float band = vTW.y / uStrata.x + (texture2D(tNoise, vTW.xz * 0.0015).g - 0.5) * uStrata.y + rk.g * 0.15;
vec3 strataCol = texture2D(tStrata, vec2(fract(band), 0.5)).rgb;
vec3 rockCol = mix(diffuseColor.rgb, strataCol, uStrata.z) * (0.7 + 0.6 * rk.r);
vec3 soilCol = mix(diffuseColor.rgb * (0.82 + 0.36 * soil.r), uPath * (0.9 + 0.2 * soil.r), vSurf.a * 0.5);
vec3 col = mix(soilCol, rockCol, rockW) * (0.86 + 0.28 * macro);
col *= mix(1.0, mix(soil.b, rk.b, rockW), 0.55) * mix(0.5, 1.0, vSurf.b);    // cavity × sky AO
float wet = vSurf.r * uWet * (1.0 - rockW * 0.5);
col *= 1.0 - wet * 0.35;
float snowW = uSnow.x * smoothstep(uSnow.y, uSnow.z, wn.y + (soil.g - 0.5) * 0.15);
diffuseColor.rgb = mix(col, uSnowColor * (0.92 + 0.08 * soil.r), snowW);
tH = mix(soil.g, rk.g, rockW) * (1.0 - 0.7 * snowW);
tR = mix(mix(soil.a, rk.a, rockW), 0.78, snowW) - wet * 0.45 - vSurf.a * 0.1;

// TERRAIN_ROUGH
roughnessFactor = clamp(mix(roughnessFactor * (0.6 + 0.5 * tR), 0.2, uGloss), 0.04, 1.0);

// TERRAIN_NORMAL (normal and vViewPosition are view space)
normal = perturbH(-vViewPosition, normal, tH, uBump * (1.0 - smoothstep(80.0, 260.0, length(vViewPosition))));
```

That is eight texture fetches on High and five on Low (set `mat.defines.TERRAIN_LITE = ''` on Low; the define changes the program, which is fine because only a tier change switches it). L1, L4, L7 and L8 add sparkle (§3.11), which is cheap because it uses no textures.

### 3.6 Detail textures

**Packed data maps, not canvases.** A 2D canvas premultiplies alpha, which destroys RGB wherever alpha is low. Any texture that uses its alpha channel for data must be a `THREE.DataTexture` filled from a `Uint8Array`, with `RGBAFormat`, `RepeatWrapping`, `generateMipmaps = true`, `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter` (DataTexture defaults to Nearest), `colorSpace = NoColorSpace`, `anisotropy = tier.anisotropy`, `needsUpdate = true`. Colour maps with an opaque alpha (the strata ramp, signage) may stay canvases with `SRGBColorSpace`.

**Channel packing** for `grain` (soil) and `rock`: **R** = albedo variation (0.5 is neutral), **G** = height, **B** = cavity (1 is open, 0 is a crevice), **A** = roughness. One fetch gives all four.

**Generator.** Everything must tile, so use `noise.js tileable2(seed, period)` plus a tileable Worley function:

```js
// Periodic Worley noise on a cells × cells grid over [0,1)²: returns f1, f2 and the nearest cell's id.
function worley(seed, cells) {
  const pts = new Float32Array(cells * cells * 2), r = mulberry32(seed);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return (u, v, out) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = (xi + i + cells) % cells, cy = (yi + j + cells) % cells, k = cy * cells + cx;
      const d = Math.hypot(xi + i + pts[k * 2] - x, yi + j + pts[k * 2 + 1] - y);
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    out.f1 = f1; out.f2 = f2; out.id = id; return out;
  };
}
// Soil, style 'grit': pebbles in 45% of cells, dried-mud cracks along cell borders, two octaves of value noise.
function soilTexel(u, v, o, N) {                    // N = { a: tileable2(s, 8), b: tileable2(s+1, 32), w: worley(s+2, 24) }
  const base = 0.6 * N.a(u * 8, v * 8) + 0.4 * N.b(u * 32, v * 32);
  const w = N.w(u, v, tmpW), cellR = hash(w.id), pebble = smoothstep(0.34, 0.18, w.f1) * (cellR > 0.55 ? 1 : 0);
  const crack = smoothstep(0.04, 0.0, w.f2 - w.f1) * 0.7;
  o[0] = clamp(0.5 + (base - 0.5) * 0.6 + pebble * (hash(w.id + 7) - 0.5) * 0.5 - crack * 0.3, 0, 1);
  o[1] = clamp(base * 0.55 + pebble * 0.45 - crack * 0.5, 0, 1);
  o[2] = 1 - crack * 0.8;
  o[3] = clamp(0.82 - pebble * 0.25 + (base - 0.5) * 0.2, 0, 1);
}
```

**Styles** (chosen by `art.surface.style`; generated at level load and cached by style; 1024² takes about 150 ms):

| Style | Soil (`grain`) | Rock (`rock`) | Levels |
| --- | --- | --- | --- |
| `grit` | pebbles, mud cracks | strata lines + vertical fractures | L2, L3 |
| `snow` | wind sastrugi (noise stretched 6:1 along the wind), sparse ice pebbles | rime-filled fractures, frost | L1, L5, L7, L8 |
| `glass` | ripples (sine along one axis, warped), fused crack network, slag blobs | conchoidal fractures (Worley edges with curved falloff) | L4 |
| `ash` | fine ash with clumps (the prototype's grain) | basalt columns (hexagonal Worley) | spare, custom zones |

**Rock texture.** Strata: `band = fract(v × 7 + 0.15 × noise)`, giving thin dark lines at band edges and alternating hard and soft values. Fractures: Worley f2 − f1 edges with the cells stretched 1:3 vertically, so cracks run down the face. Height comes from the bands (hard bands proud) minus the cracks. Cavity is the cracks. Roughness is 0.85 to 0.95.

**The strata ramp** (`tStrata`): a 256 × 1 sRGB canvas built from `art.palette.strata` (four to six colours). Bands have random widths between 3% and 25%. Add a thin dark line (−35% value) at a quarter of the band boundaries and a pale line (+20%) at another quarter.

### 3.7 Strata and erosion banding

- **Strata follow world height**, warped by large-scale noise (`uStrata.y`) so the bands dip and roll instead of running ruler-straight. The band period (`strataHeight`) is 6 to 14 m: L3 uses 9, L7's ice cliffs use 14.
- **Hard bands protrude.** Cliff skins (§3.8) use the same band period as the texture, so geometry ledges and colour bands line up. Pass `strataHeight` to `cliffSkin` as its layer height.
- **Erosion shows as colour.** Flow darkens and wets channels (`surf.r`); sediment lightens fans (`surf.g`, baked into the vertex colour); talus is scattered at slope breaks.
- **Desert varnish** (L3): dark vertical streaks on cliff faces, falling from ledges. In the rock texture these come from noise stretched 1:8 vertically and multiplied into albedo at 0.7 on 30% of the area, strongest just under each hard band.
- **Wind scour** (L2, L4, L7): heights and windward faces are paler (the `high` palette blend), and snow or sand piles up on lee sides (the snow mask uses `wn.y` plus a lee term: `max(0, −dot(wn.xz, windDir)) × 0.3`).

### 3.8 Cliff skins and rock dressing

- **Where:** cells with slope over 0.65 inside the corridor and its 600 m margin, from the scatter layer `cliff_skin` (density 1 to 2 per hectare of steep area, clustered 3 to 6 at a time, `align: 1` to the slope aspect, sunk 30% into the slope).
- **Talus** at their feet: `talus` and `rock_small` at 30 to 60 per hectare where slope falls from over 0.5 to under 0.35 (the slope break), scale 0.4 to 2.5 with a power-law distribution (`min + (max − min) × r³`), so there are many small rocks and few big ones.
- **Rules for natural scatter:** rocks gather at slope breaks, in gullies (high flow, with the long axis along the flow), at cliff bases and on ridgelines. They avoid the middle of flats. No rock floats: sink every rock by at least 15% of its size. Align to the ground normal at 0.6 to 0.8. Rotate randomly about the normal.

### 3.9 Scatter recipes by level

Densities are per hectare at High (tier scaling applies). Natural types are P2's, man-made types P3's (architecture Appendix C.2), and new names are listed in Appendix A.

| Level | Layers |
| --- | --- |
| L1 | `ice_block` 3 (ridge lines, scale 1 to 4), `snow_drift` 8, `ice_shard` 60 (ground cover, ≤ 120 m), `wreck_debris` 2 (*Abeyance* zone), floes instanced per floe field |
| L2 | `reed_clump` 350 (cards, ≤ 250 m; beyond that the terrain carries the reeds, §3.11), `rock_medium` 2, `boulder` 0.3 (`avoidRoute`), `scrub` 30, `tank_cairn` along the road every 400 to 700 m, turbine debris in ruin zones |
| L3 | `cliff_skin` (§3.8), `talus` 40, `boulder` 1 (river bed), `spire`/`hoodoo` 0.2 (benches), `pebbles` 150 (bed, ≤ 120 m) |
| L4 | `glass_shard` 20, `glass_lump` 3, petal facet debris 6 (near petals), `slag` decals, sand drifts on lee sides |
| L5 | `snow_drift` 6, `rock_small` 3, frozen reed tufts 20 (`frost_tuft`), pylon debris near fallen pylons |
| L6 | (the ground is the Dredge) `barrel_cluster`, `cable_spool`, slag lumps, chalked body-drums in the docks, chains, crates |
| L7 | `snow_drift` 10, rime-covered outcrops (`boulder`, rimed) 1, Founders armour fragments (`plateShard` white, large) 4, frozen craters (stamps) |
| L8 | floes instanced, `pressure_ridge` structures, `snow_drift` on floes 12, steam emitters over leads |

### 3.10 Ground decals and the route ribbon

**The route ribbon** (P2, proposed `routeRibbon(route, s0, s1, width, kind)`). A strip sampled every 2 m along the route, with vertices at the ground height plus 0.04 m and UVs of (across 0 to 1, along metres / 8). One mesh per 512 m chunk. Its material is alpha-blended with `depthWrite: false`, `polygonOffset` (factor −2, units −4), receives fog and the sun gate, and uses a canvas texture per `kind`:

- `'ruts'` (the Wake's road, L2 and L7): two pairs of tyre and track ruts, footprint dents from walker rigs, and dust.
- `'dredge'` (L1's shore, L6's approach, L8's chase): 6 m-wide tread marks of the Dredge's legs, in a repeating pattern, with tailings along the edges.
- `'snowtrail'`: compacted snow with crisp edges.

**Pooled decals** (`particles.decals`, architecture §4.1, with these kinds added): `scorch`, `crater` (dark ring and ejecta spokes), `hole`, `frost` (a pale crystalline patch), `puddle` (meltwater; dark with roughness 0.05, reflecting the sky), `oil`, `burnscar` (L4: a glowing orange-white line fading to a dark glass scar over 20 s), `slag` (glowing, then black), `footprint` (mech feet: one decal per step in snow and sand, capped at 64 and recycled).

**Placed decals** come from level data: flare pools in L5 (§5.7), meltwater patches on the L1 shelf, oil fields at L6's docks.

### 3.11 Special surfaces

**Sea ice** (L1, L8). Terrain with `surface.style: 'snow'`, a palette of blue-black ice `#1d2b38` and a snow mask, roughness 0.12 to 0.35. Under the surface there is a fake depth effect: two parallax layers of cracks, pale and bluish.

```glsl
vec3 V = normalize(cameraPosition - vTW);
vec2 par = V.xz / max(V.y, 0.25);
float c1 = texture2D(tCracks, vTW.xz / 14.0 - par * (0.6 / 14.0)).r;          // cracks 0.6 m down
float c2 = texture2D(tCracks, vTW.xz / 23.0 + 0.37 - par * (2.2 / 23.0)).r;   // cracks 2.2 m down
col = mix(col, uIceDeep, 0.35 * (1.0 - snowW)) + uIceCrack * (c1 * 0.5 + c2 * 0.22) * (1.0 - snowW);
```

**Rotting ice** (the L1 floe sprint) is gameplay, so it must be readable in a third of a second. Sunlit floes are warm white with a fine crazing overlay. Shadowed floes stay deep blue at no more than 40% of the sunlit luminance. A floe that is about to collapse gets white crack lines spreading from where Moth landed (a per-instance `rot` attribute from 0 to 1 driving a Worley-crack mask), an emissive flicker in the last 0.5 s, and a puff of ice powder.

**Snow** (L5, L7, L8). Albedo `#e8eef5` (L7, cool) or `#f2e4d2` (L8, warm), roughness 0.75. Sparkle:

```glsl
// Glints: hashed micro-facets in world space. No textures. Added to emissive (after emissivemap_fragment).
float glint(vec3 wp, vec3 n, vec3 v, vec3 l, float density) {
  vec3 cell = floor(wp * density);
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 rn = normalize(n + (vec3(fract(h * 7.13), fract(h * 3.71), fract(h * 5.37)) - 0.5) * 0.7);
  return step(0.985, h) * pow(max(dot(rn, normalize(l + v)), 0.0), 600.0);
}
// uSunColor: the sun's colour × intensity / π, a uniform the atmosphere updates; uFogSunDir is the fog's sun direction.
vec3 Vg = normalize(cameraPosition - vTW);
totalEmissiveRadiance += uSunColor * glint(vTW, wn, Vg, uFogSunDir, 9.0) * 6.0 * snowW
                         * (1.0 - smoothstep(25.0, 70.0, length(vViewPosition)));
```

The same function runs on glass (L4, density 6, strength 10) and rime (L7). It needs bloom to sing; on Low it still shows as single bright pixels.

**Water** (the L3 lake and flood, L8's leads, L1's surface from below). A proposed `makeWater(o)` (P1): `MeshStandardMaterial` with roughness 0.04 to 0.12, metalness 0 and a dark body colour (`#0b1d22` for L8, `#3a2a1a` brown for the L3 flood), plus:

- A normal from two scrolling height samples of `noise` at different scales and directions, through `perturbH`. In the L3 flood, the scroll follows the route tangent (stored per vertex) at the flood's speed.
- Reflections from the sky PMREM. Fresnel comes from the PBR model for free.
- Foam where `TerrainData.a − ground < 1.5 m` (shore), along the flood front (distance to a moving plane) and on crests (height threshold). Foam is white with roughness 0.6.
- Opaque, with no refraction. Depth tint: shallower water lerps toward the ground colour.
- Steam fog over L8's leads comes from particles and fog cards (§5.3), not from the shader.

**The glass desert** (L4). `surface.style: 'glass'`, pale amber-grey `#b9b29a` with dark fused slag `#3a3530` streaks, `gloss: 0.55` (roughness 0.2 on flats, rougher on ripples), sparkle, burn-scar decals and dunes of fused glass. The heat haze is a screen pass (§6.10).

**Reeds** (L2). The level's dominant visual and a gameplay read: land-yachts show as wakes in the grass before you see them.

- **Cards:** two crossed quads, 1.6 m wide and 2.6 m tall, with an alpha-tested canvas texture (about 20 stalks with seed heads, root `#5a3a1e` to tip `#e0a85a`), placed as instanced `reed_clump`s with a per-instance tint (`instanceColor`, ±10%). `alphaTest` 0.5, double-sided, no shadow casting.
- **Wind:** a travelling gust wave plus up to eight "pushers" (moving yachts, the player, rigs), which bend reeds away from them.

```glsl
// Reed material. Pars (inserted after #include <common>):
uniform float uTime; uniform vec2 uWind; uniform vec4 uPush[8];          // pushers: x, z, radius, strength
// After #include <begin_vertex> (r170 always declares the `uv` attribute; uv.y is 0 at the root):
vec3 rootW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec2 wd = normalize(uWind + 1e-4);
float gust = 0.5 + 0.5 * sin(dot(rootW.xz, wd) * 0.045 - uTime * 1.7);
gust *= gust * (0.6 + 0.4 * sin(rootW.x * 0.13 + rootW.z * 0.07));
vec2 bend = wd * (0.25 + 0.9 * gust) * length(uWind) * 0.08;
for (int k = 0; k < 8; k++) {
  vec2 d = rootW.xz - uPush[k].xy;
  bend += normalize(d + 1e-3) * uPush[k].w * smoothstep(uPush[k].z, 0.0, length(d)) * 1.2;
}
float h = uv.y * uv.y;                                               // bend grows toward the tip
vec3 bendL = vec3(bend.x, 0.0, bend.y) * mat3(instanceMatrix);       // world → instance-local (yaw + uniform scale)
bendL /= dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
transformed.xz += bendL.xz * h * 2.6;
transformed.y  -= dot(bendL.xz, bendL.xz) * h * 0.9;                 // keep the stalk length roughly constant
```

- **Beyond the cards** (250 m to the horizon), the terrain carries the reeds: its L2 palette ground colour is reed gold, and the terrain shader adds the same gust wave as a brightness ripple (`col *= 1.0 + 0.12 * gust(vTW.xz)`), so the waves roll all the way to the horizon.

**Dredge decks** (L6). The walkable ground is structure: `ribbedPlate` decks in black iron with hazard edges, gratings over glowing slag channels, oil and slag decals, and conveyor belts with scrolling slat textures (the one place belts need UVs).

---
## 4. Materials (`render/materials.js`, P1)

### 4.1 Rules

- **A small shared library.** About 30 named materials cover the whole game (§4.2). There are no per-instance clones. Per-object variety comes from vertex tint (`color`), the wear patch and decals.
- **One program for the kit.** Every kit material is a `MeshStandardMaterial` with `vertexColors: true`, the wear patch (§4.4), and the atmosphere patch (fog and sun gate). They all share one `onBeforeCompile` source and return the same `customProgramCacheKey`, so they compile to **one shader program** with per-material uniforms. Founders ceramic on High is the one `MeshPhysicalMaterial` (clearcoat), which is a second program.
- **PBR ranges.** Paint is a satin finish: metalness 0.25 to 0.4 keeps the prototype's sheen and PMREM highlights on the bevels. Bare steel has metalness 0.85 to 1.0. Everything mineral (concrete, rock, ceramic, canvas, rubber) has metalness 0 to 0.05.
- **Environment reflections.** `envMapIntensity`: metal 0.9 to 1.1, paint 0.55 to 0.7, concrete and canvas 0.25 to 0.35, terrain 0.25. Each is multiplied by the level's `light.env`.
- **Colour maps are sRGB**; data maps are `NoColorSpace` (architecture §1.5). Vertex colours are linear.

### 4.2 Library presets

`roughness` / `metalness` / `envMapIntensity`. "wear" is the wear patch amount and style (§4.4). Textures are optional; most kit materials need none beyond the wear patch's `grime`.

| Name | Base colour | R / M / Env | Wear | Use |
| --- | --- | --- | --- | --- |
| `concrete` | `#6e665c` | 0.92 / 0.02 / 0.3 | 0.6 dredge | Dredge concrete, the Dam, bunkers; `concrete` texture as bump 0.6 |
| `concreteDark` | `#4d463e` | 0.94 / 0.02 / 0.3 | 0.7 dredge | caps, plinths, stains |
| `steel` | `#5b5e62` | 0.38 / 0.9 / 1.0 | 0.4 dredge | bare steel: pistons, rails, chrome-free machined parts |
| `steelDark` | `#2f3236` | 0.5 / 0.85 / 0.9 | 0.5 dredge | structural steel, decks, trusses |
| `ironBlack` | `#1c1b1d` | 0.62 / 0.55 / 0.7 | 0.6 dredge | Dredge black iron |
| `oxide` | `#7d2a1c` | 0.6 / 0.3 / 0.6 | 0.7 dredge | Dredge oxide-red paint |
| `stripe` | `#d9a521` | 0.55 / 0.25 / 0.6 | 0.8 dredge | hazard yellow (chevrons come from decals) |
| `rust` | `#7a4128` | 0.88 / 0.35 / 0.4 | 0.3 wake | rust, the Gerrow Bridge |
| `paintWake` | `#4f8a86` | 0.62 / 0.28 / 0.6 | 0.8 wake | faded teal rig paint |
| `paintWakeRed` | `#a5452f` | 0.64 / 0.28 / 0.6 | 0.8 wake | bleached red rig paint |
| `canvas` | `#d9cba8` | 0.95 / 0 / 0.25 | 0.5 wake | awnings, tarps; double-sided; cloth wind |
| `rubber` | `#1a1918` | 0.9 / 0 / 0.3 | 0.3 | tyres, tracks, seals, hoses |
| `cable` | `#151517` | 0.6 / 0.2 / 0.5 | 0 | cables |
| `ceramic` | `#e9e6dc` | 0.35 / 0.05 / 0.7 | 0.4 founders | Founders white; Physical on High: clearcoat 0.6, clearcoatRoughness 0.25 |
| `ceramicAged` | `#b8b0a0` | 0.5 / 0.05 / 0.6 | 0.7 founders | weathered Founders; Moth's mid plates |
| `gold` | `#c99a3e` | 0.32 / 1.0 / 1.1 | 0.4 founders | Founders trim, the Foreman's frame |
| `darkGlass` | `#0b1014` | 0.06 / 0 / 1.2 | 0 | windows, visors when unlit, the Press's lattice-glass |
| `glass` | `#3c4a52` | 0.1 / 0 / 1.0 | 0 | generic glass (opaque) |
| `mirror` | `#d8dde2` | 0.06 / 1.0 / 1.2 | 0 | Parasol facets; crack lines from `rock` G as roughness 0.5 |
| `ice` | `#9cc4dc` | 0.18 / 0 / 1.0 | 0 | rime, icicles, ice blocks; fake subsurface (below) |
| `snow` | `#e8eef5` | 0.78 / 0 / 0.4 | 0 | drifts and caps on structures; sparkle |
| `rock` | palette rock | 0.92 / 0 / 0.25 | 0 | rocks and cliff skins; triplanar `rock` + strata ramp (the §3.5 code without the soil branch) |
| `debris` | `#2a2524` | 0.8 / 0.4 / 0.5 | 0.6 dredge | debris chunks; tinted per level |
| `scorch` | `#141212` | 0.95 / 0.1 / 0.2 | 0 | burnt variants of anything |
| `dark` | `#141416` | 0.8 / 0.4 / 0.5 | 0.2 | joints, gaps, cores (the mechs' `dark`) |
| `lightAmber` | emissive `#ffb36b` × 3 | — | — | Wake lamps, cab windows (the architecture name is kept; the colour is tungsten) |
| `lightCyan` | emissive `#5fe3ff` × 3.5 | — | — | Founders seams, Moth's visor |
| `lightGold` | emissive `#ffcc66` × 3 | — | — | Founders gold seams |
| `lightSodium` | emissive `#ff9a2e` × 4 | — | — | Dredge lamps |
| `lightWhite` | emissive `#fff1d6` × 5 | — | — | floodlights |
| `lightRed` | emissive `#ff2a1a` × 3 | — | — | warnings, weapon tells |
| `lightGhost` | emissive `#a8ff9e` × 6 | — | — | ghost cab lights (always paired with a beacon sprite, §4.5) |

**Ice's fake subsurface.** Add a faint emissive equal to `iceColour × 0.15 × (1 − N·V)^2 × sunVisible`, so thin edges glow blue-white when the sun is behind them. In the L1 cavern, add a constant emissive `#0a3a5a × 0.4` for the "lit from within" look.

### 4.3 Faction sets and mech schemes

`materials.setFactions` (architecture §4.1) takes `FactionPalette`s. The defaults:

```js
export const FACTIONS = {
  wake:     { shell: '#4f8a86', mid: '#7a4128', accent: '#d9cba8', dark: '#1a1918', eye: '#ffb36b', wear: 0.8 },
  dredge:   { shell: '#2e2b2b', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', eye: '#ff9a2e', wear: 0.65 },
  ghost:    { shell: '#3a3434', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', eye: '#a8ff9e', wear: 0.75 },
  founders: { shell: '#e9e6dc', mid: '#b8b0a0', accent: '#c99a3e', dark: '#1a1e24', eye: '#5fe3ff', wear: 0.5 },
  hands:    { shell: '#5a4a40', mid: '#7d2a1c', accent: '#c48a3a', dark: '#1a1918', eye: '#ffb36b', wear: 0.8 },  // living Dredge crews: tungsten, never green
};
export const MECH_SCHEMES = {   // MechScheme (architecture §4.3)
  moth:     { design: 'vanguard', base: '#d8d2c4', mid: '#aaa494', accent: '#c99a3e', dark: '#24262b', visor: '#5fe3ff',
              flame: '#a8ecff', blade: '#8fe9ff', wear: 0.55 },
  tallow:   { design: 'striker',  base: '#3a3434', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', visor: '#ff9a2e',
              flame: '#ff9a3c', blade: '#ffb070', wear: 0.8 },          // plus a ghost beacon on the head
  foreman:  { design: 'bastion',  base: '#1c1b1d', mid: '#2e2b2b', accent: '#b8913a', dark: '#0e0d0d', visor: '#ffd27a',
              flame: '#ffb050', blade: '#ffd27a', wear: 0.3 },          // built at ×2 scale with an added detail layer
  cantor:   { design: 'vanguard', base: '#e9e6dc', mid: '#c9c3b4', accent: '#c99a3e', dark: '#1a1e24', visor: '#5fe3ff',
              flame: '#a8ecff', blade: '#ffcc66', wear: 0.6 },
  dredgeGhost: { design: 'striker', base: '#4a4440', mid: '#7d2a1c', accent: '#d9a521', dark: '#141414', visor: '#ff9a2e', wear: 0.7 },
};
```

**Moth's specifics.** The lattice-ring emblem is a decal on the left shoulder plate (a canvas texture of a ring of triangles in gold). Rust streaks come from the wear patch's streak term (warm rust for every style except Dredge, which gets soot). Ice scars are a mech-only term: thin pale scratches from `grime` G at 0.5 intensity on the front faces. Fitted Dredge parts use `ironBlack` and `oxide` with visible adapter plates (`dark`, 0.1 m proud). Every bound hungry part adds one ghost beacon (§4.5) at its cab point.

### 4.4 The wear patch

`StdOpts.wear` (architecture §4.1) gets a defined meaning and two optional companions: `wearStyle: 'wake' | 'dredge' | 'founders' | 'none'` and `bare: ColorLike` (the colour of chipped edges: `#8a8d90` steel for paint over metal, `#5d3424` primer, `#9a9384` for chipped ceramic). It uses object-space position and normal (pre-skinning, so wear never swims on animated mechs), the `edge` attribute, and the `grime` texture. It adds no texture beyond `grime`, which is shared.

**`grime`** is a packed DataTexture: **R** grime blotches (thresholded fbm), **G** fine scratches (short random lines rasterised into the buffer), **B** streak noise (value noise stretched 1:8 along v), **A** chip noise (high-frequency fbm).

```glsl
// vertex: pars
attribute float edge; varying float vEdge; varying vec3 vObjP, vObjN;
// vertex: after #include <begin_vertex>
vEdge = edge; vObjP = position; vObjN = normal;
#ifdef USE_INSTANCING
  vObjP += instanceMatrix[3].xyz * 0.173;            // instances don't share one wear pattern
#endif

// fragment: pars
uniform sampler2D tGrime; uniform float uWear; uniform vec3 uWearStyle;   // x wake, y dredge, z founders
uniform vec3 uBare; uniform float uBareMetal;
uniform float uFrost, uDust; uniform vec3 uFrostColor, uDustColor;        // level-wide, shared uniform objects
varying float vEdge; varying vec3 vObjP, vObjN;
float wChip, wRough, wFrost;

// fragment: after #include <color_fragment>
vec3 on = normalize(vObjN);
vec3 tw = pow(abs(on), vec3(3.0)); tw /= dot(tw, vec3(1.0));
vec4 gr = texture2D(tGrime, vObjP.zy * 0.21) * tw.x + texture2D(tGrime, vObjP.xz * 0.21) * tw.y
        + texture2D(tGrime, vObjP.xy * 0.21) * tw.z;
float sB = texture2D(tGrime, vec2((vObjP.x + vObjP.z) * 0.35, vObjP.y * 0.04)).b;
wChip = vEdge * smoothstep(0.66 - 0.35 * uWear, 0.72 - 0.35 * uWear, gr.a);
float grime = uWear * gr.r * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 4.0, vObjP.y)));        // dirtier low down
float streak = uWear * smoothstep(0.55, 0.85, sB) * (1.0 - abs(on.y));                     // vertical faces only
float bleach = uWearStyle.x * uWear * smoothstep(0.4, 0.95, on.y);                         // Wake: sun-bleached tops
vec3 c = diffuseColor.rgb;
c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11)) * 1.25), bleach * 0.45);
c *= 1.0 - grime * 0.45;
c = mix(c, c * mix(vec3(0.55, 0.32, 0.2), vec3(0.16), uWearStyle.y), streak * 0.6);       // rust bleed or soot
c *= 1.0 - uWearStyle.z * uWear * gr.g * 0.3;                                              // Founders: crazing
c = mix(c, uBare, wChip);
wFrost = uFrost * smoothstep(0.3, 0.9, on.y + gr.r * 0.3);
c = mix(c, uFrostColor, wFrost);
c = mix(c, uDustColor, uDust * smoothstep(0.55, 0.95, on.y) * (0.6 + 0.4 * gr.r));
diffuseColor.rgb = c;
wRough = grime * 0.25 + wFrost * 0.25 + uDust * 0.2 - wChip * 0.25;

// fragment: after #include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + wRough, 0.05, 1.0);
// fragment: after #include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uBareMetal, wChip) * (1.0 - 0.8 * wFrost);
```

Notes:

- Object-space "up" is world up for structures, which only yaw. On mech limbs it follows the bind pose, which is fine for wear.
- `uFrost`, `uFrostColor`, `uDust` and `uDustColor` are level-wide (`art.surface.frost` and `art.surface.dust`, Appendix A). They are shared uniform objects, so one `atmosphere.set()` blend frosts or dusts every kit material at once: L1, L5, L7 and L8 frost; L2 and L4 dust.
- On High only, add a screen-space crease term that catches edges the `edge` attribute misses: `wChip = max(wChip, clamp(length(fwidth(vObjN)) * 6.0 - 0.5, 0.0, 1.0) * uWear * 0.6 * nearFade)`, with `nearFade` fading out between 20 and 40 m to avoid shimmer.

### 4.5 Lamps, seams and beacons

**The lamp assembly.** Every light in the world is three parts, and Low keeps all three:

1. A **housing**: a `lampHousing` lathe or a `slab` with a hood, in a dark material.
2. A **lens**: a flat emissive plate recessed 2 to 5 cm, using one of the `light*` materials.
3. A **glow sprite**: one instance in a shared InstancedMesh of camera-facing quads (additive, `depthWrite: false`, fog-aware). Its size is 3 to 6 times the lens, its colour is HDR (the lens colour × 2 to 4), and it flickers per instance (sodium hums at 0.5% amplitude; failing lamps cut out irregularly).

Pooled point lights (architecture §7.3) go only to the few lamps that matter for gameplay and are near the player. The rest are sprites. This is how the Dredge has thousands of lamps.

**Seam-light** (Founders). A strip of `lightCyan` or `lightGold` geometry, 0.04 to 0.12 m wide, sunk into a seam groove so that only its face shows. Dead seams use the colour at × 0.15; woken seams (L7 Cantors, the Lay in the endings) ramp up to × 4 over 1.5 s, with a white flash at the peak.

**The ghost beacon.** The game's most important small visual: it must read at 1 km on every tier. It is a shared InstancedMesh of quads with a minimum on-screen size, pulsing on one shared clock.

```glsl
// Vertex shader. Geometry: a unit quad (−0.5..0.5) with uv. Per instance: instanceMatrix (position only) and
// attribute vec3 aBeacon: x = world size (m), y = phase offset (0 = the shared beat), z = wake 0..1 (L5 racks).
uniform float uBeat;   // sim seconds since level start; the HUD's pilot-vitals trace reads the same clock
uniform vec2 uPx;      // (2 / drawingBufferWidth, 2 / drawingBufferHeight)
uniform float uMinPx;  // 4 on High and Medium, 5 on Low (the visible dot is about 70% of the quad)
attribute vec3 aBeacon; varying float vI; varying vec2 vUv;
void main() {
  vec4 c = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xyz += normalize(-c.xyz) * 0.3;                                   // never hidden by its own housing
  vec4 clip = projectionMatrix * c;
  vec2 ndc = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * aBeacon.x / max(-c.z, 0.1);
  ndc = max(ndc, uMinPx * uPx);
  clip.xy += position.xy * ndc * clip.w;
  float pulse = exp(-fract(uBeat + aBeacon.y) * 7.0);                  // instant on, 0.3 s decay, 60 per minute
  vI = aBeacon.z * (0.15 + 0.85 * pulse);
  vUv = uv; gl_Position = clip;
}
// Fragment: additive, depthTest on, depthWrite off.
// float a = smoothstep(0.5, 0.0, length(vUv - 0.5)); gl_FragColor = vec4(uColor * vI * (a * a * 4.0 + a), 1.0);
// Fog: attenuate by at most half the fog amount, so the beacon outlives its machine's silhouette.
```

- Colour `#a8ff9e`, intensity 8 in the sprite. The world size is 0.6 m, so `uMinPx` takes over beyond about 125 m on High; from there out to 1 km and beyond the beacon stays a constant 4 px. The geometric cab light (`lightGhost`) sits behind it.
- All ghost beacons share phase 0 by default, so they blink together. The L5 racks wake one by one (`aBeacon.z` ramps per instance as Juno passes) and pulse in time with the HUD's heart trace (bible §6 L5). The HUD and the beacons read the same `uBeat`; propose `ctx.materials.uniforms.uBeat` as the single source (Appendix A).

### 4.6 Canvas and data texture generation

Generated once per tier size (architecture §7.4 `textureSize`) at install, except the per-level terrain styles (§3.6), which are generated at level load. Each generator writes into a typed array in one pass with no per-pixel allocation. Budget: under 150 ms per 1024² texture, and under 900 ms for everything at High.

| Texture | Kind | Content |
| --- | --- | --- |
| `panel` | data | the prototype's per-face panel (edge darkening plus an inset seam); kept for small props and units |
| `grain`, `rock` | data, packed RGBA | §3.6 |
| `concrete` | data, packed | aggregate speckle, form-tie holes on a 1.2 m grid, horizontal pour lines every 3 m (as height), water stains |
| `metal` | data, packed | brushed streaks (1D noise stretched 1:40), scratches, roughness variation |
| `grime` | data, packed | §4.4 |
| `noise` | data, RG | two independent tileable fbm fields (macro variation, warps, water ripples) |
| `cracks` | data, R | Worley-edge crack network (ice parallax, rotting floes, the Dam's fracture lines) |
| `smokeSprite`, `sparkSprite` | canvas, sRGB | the particle atlas (§6.2) |
| strata ramp | canvas, sRGB | §3.6, per level |
| reed card, signage | canvas, sRGB | §3.11, §4.7 |

Pattern for a packed generator:

```js
function makePacked(size, texel) {          // texel(u, v, out[4]) writes values in 0..1
  const data = new Uint8Array(size * size * 4), o = [0, 0, 0, 0];
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    texel(x / size, y / size, o);
    data[i] = o[0] * 255; data[i + 1] = o[1] * 255; data[i + 2] = o[2] * 255; data[i + 3] = o[3] * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = tier.anisotropy; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
```

### 4.7 Signage, marks and decals

`materials.sign(text, o)` (architecture §4.1) gets these styles through `o.style`:

| Style | Font | Treatment | Used for |
| --- | --- | --- | --- |
| `stencil` | Barlow Condensed 700, letter-spaced 6% | Stencil bridges: erase a bar 6% of the cell wide across the counters of A B D O P Q R 0 4 6 8 9. Erode with a noise mask (alpha × smoothstep on fbm) and add overspray: a 2 px blurred copy at 25% under the text. | Founders' stencils (**CARRY THEM HOME. SET THEM DOWN.**), Dredge numbers (`D-4471`) |
| `painted` | Barlow Condensed 600 italic | Per-glyph jitter (rotation ±4°, baseline ±3%, scale ±5%), brush-edge erosion, two or three drips (short vertical strokes under random glyphs), sun-faded at 70% | Wake rig names (*Big Mercy*, *Compass Rose*, *Second Patience*…), tally marks |
| `chalk` | Barlow Condensed 400 | Jitter, alpha dithered by high-frequency noise, double-stroked at a 1 px offset | chalked names on body-drums (L6), Dredge tallies |
| `plaque` | IBM Plex Mono 500 | Engraved: dark text plus a 1 px light offset below it, on a ceramic-coloured ground | Sundial plaques, Carrow terminals, Founders markers |
| `hazard` | (none) | Diagonal stripes at 45°, yellow `#d9a521` on `#141414`, worn edges | Dredge chevrons on moving edges and gates |

**Placement.** Marks are quads 0.02 m off the surface with `polygonOffset` (factor −1, units −2), `MeshStandardMaterial` with `transparent: true`, `depthWrite: false`, and roughness matching the surface. All marks on one structure share a **signage atlas** (a 1024 × 512 canvas per structure type) and merge into one mesh: one draw call per structure for all its marks. Load the fonts with `document.fonts.load()` before drawing to any canvas.

### 4.8 Material and program budget

| Program | Count |
| --- | --- |
| Kit standard (all kit materials, shared) | 1 (+1 instanced variant, +1 skinned variant for mechs) |
| Founders ceramic, Physical (High only) | 1 to 2 |
| Terrain | 1 |
| Emissive lenses | shares the kit program (base black, emissive set) |
| Glow sprites, beacons | 2 |
| Particles (additive, alpha), weather | 3 |
| Decals, route ribbon, signage | 2 |
| Water, reeds, cloth, ice parallax | 4 (only when the level uses them) |
| Sky, skyline | 2 |
| Post passes | 5 to 7 |

That is about 25 to 30 programs per level, well inside the architecture's ceiling of 60 (High) and 40 (Low).

---
## 5. Atmosphere and lighting (`render/atmosphere.js`, `render/weather.js`, `render/pipeline.js`, P1)

### 5.1 The lighting model

Every level uses the same small set of lights. Its mood comes from their values.

| Component | Role | Notes |
| --- | --- | --- |
| **Sun** (DirectionalLight, shadowed) | the key light | Colour and intensity per level. Gated by `TerrainData` and the sun front (§3.4). |
| **Hemisphere** | sky fill and ground bounce | Its sky colour sets the shadow colour (the cool shadows of L2, L7 and L8). Its ground colour is the bounce (red in L3, bright in L4 and L7). |
| **Rim** (DirectionalLight, no shadow) | separation | By default a cool back light opposite the sun, as in the prototype. In L3 it becomes a warm bounce from the lit canyon wall. |
| **PMREM environment** | reflections on bevels | Rebuilt from the sky dome plus a ground disc on `apply()` and at the end of blends (architecture §7.3). |
| **Fog** | depth | Height fog with sun inscatter and a far fade (architecture §5.8), plus an optional ground-fog layer (§5.3). |
| **Point-light pool** | flashes, key lamps | 6 on High, 3 on Medium, 0 on Low (architecture). |
| **Glow sprites, beacons** | every other light | §4.5 |
| **Spot light** (L5 only) | Moth's headlamp | Added at level load, before warmup, and constant for the level (architecture §1.6). Shadowed on High only. |

**Shadow elevation clamp.** The shadow map is a 160 m box, and at very low sun angles shadows stretch past it and lose resolution. Proposed `art.light.shadowMinElevation` (default 8°): the shadow camera uses `max(sunElevation, shadowMinElevation)`, while the sky's sun disc, the inscatter and the terrain shadow bake use the true angle. Long-shadow levels (L1 dawn, L6's tail, L7, L8) still get very long shadows from the terrain bake, and units get crisp ones from the map.

**Key direction on night levels.** When the sun is below the horizon (L1 before sunrise, L5, L6's bow), the directional light stands in for starlight or the aurora and must come from above. Proposed `art.light.keyDir: { azimuth, elevation } | null`: when set, the directional light, the shadow camera and the terrain shadow bake use it, while the sky's sun disc and dawn rim keep `sky.sun`. `null` means "follow the sun".

**Exposure and tone mapping.** ACES is the default. AgX goes to the two white-dominated levels, L4 (bleached glass under a white sun) and L7 (white giants, rime and snow), because it keeps whites from shifting toward yellow and rolls off highlights softly. Exposure is set per level so that a sunlit mid-grey surface lands at about 0.45 after tone mapping.

### 5.2 The sky

**Use the custom sky shader, not the r170 `Sky` addon.** The addon's Preetham model looks realistic, but it cannot do night, aurora, a dawn rim with the sun below the horizon, or the gold twilight of L8, and its horizon cannot be forced to equal our fog colour. Our rule is that the sky's horizon colour **is** the fog colour, because that is what hides the terrain's far edge (architecture §5.8). The addon is still useful as a reference: in debug, render it to pick plausible gradient colours for the daylight levels.

The sky is the prototype's shader, extended (architecture §10.4 lists ridges, clouds, sun, moon and stars). These are the additions:

```glsl
// d = normalize(view direction); s = dot(d, sunDir). Uniforms come from art.sky (Appendix A adds aurora and dawnRim).
// 1. Gradient: horizon → mid → top, exactly as the prototype; below the horizon, fade to the fog colour.
// 2. Sun disc and halo. size and glow come from art.sky.sun.
c += uSunColor * (pow(max(s, 0.0), 6.0) * 0.32 * uGlow + pow(max(s, 0.0), 60.0) * 0.5 * uGlow)
   + uSunColor * smoothstep(1.0 - 0.0007 * uSize, 1.0 - 0.0003 * uSize, s) * 1.5 * (1.0 - cloud * 0.8);
// 3. Dawn rim: a band hugging the horizon toward the sun's azimuth, visible even when the sun is below it (L1, L5's edge).
float az = max(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0);
c += uRimColor * uRim * exp(-max(d.y + 0.01, 0.0) * 22.0) * pow(az, 3.0);
// 4. Clouds: two fbm layers projected on a high plane (d.xz / (d.y + 0.12)), lit toward the sun side,
//    with silver lining where s is high. Cover, colour and speed from art.sky.clouds.
// 5. Stars: hashed cells, twinkling with a slow sine per star; hidden by cloud and by the dawn rim.
// 6. Aurora (L1 start, L5): folded curtains with vertical rays.
float aurora(vec3 d, float t) {
  vec2 p = d.xz / (d.y + 0.25); float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i), x = p.x * (0.6 + 0.25 * fi) + sin(p.y * 1.3 + t * 0.05 + fi) * 0.8;   // folds
    float y = p.y * 0.9 + sin(x * 0.7 + t * 0.03 + fi * 2.0) * 0.5 - 0.6 - 0.35 * fi;
    float band = exp(-y * y * 18.0);
    float rays = 0.6 + 0.4 * sin(x * 22.0 + fbm2(vec2(x * 3.0, t * 0.1)) * 6.0);              // vertical rays
    acc += band * rays * (1.0 - 0.25 * fi);
  }
  return acc * smoothstep(0.02, 0.2, d.y);
}
c += mix(uAuroraA, uAuroraB, smoothstep(0.15, 0.6, d.y)) * aurora(d, uTime) * uAurora;
// 7. Ridges: the architecture's silhouette bands above the horizon, coloured between fog and the palette rock.
// End with the tonemapping_fragment and colorspace_fragment includes (architecture §1.5).
```

The aurora also adds a little light to the world. While `art.sky.aurora.strength` is above 0, the atmosphere lerps the hemisphere's sky colour 20% toward the aurora's mean colour, and the PMREM picks it up, so ice and wet metal show faint teal reflections.

### 5.3 Fog

- **Height fog** (architecture §5.8): `density`, `heightFalloff`, `heightBase`, `inscatter`, `sunColor`. The inscatter is what makes the air glow toward the sun. Every daylight level uses 0.6 to 1.4.
- **Ground fog layer** (proposed `art.fog.ground: { density, heightFalloff, heightBase, color }`). A second exponential term, much denser and much shallower: L1's ice fog, L7's basin fog, L8's steam over the leads, L6's steam in the conveyor canyons. In the fog patch it is the same analytic integral with its own uniforms, added to the optical depth (about six more instructions).
- **Fog cards** for local mist (the canyon floor in L3, the foot of the Fall, the leads, the Dam's seepage, steam vents): large soft alpha quads lying flat or tilted, using the noise texture scrolling slowly, coloured with the fog colour and lit by `0.6 × hemi + sun × inscatter`. They fade out when the camera is within 25 m and when viewed edge-on (`abs(dot(normal, view))`), which hides their planes.
- **Depth planes.** Every vista needs at least three: near props and units, mid relief or structures, and skyline (ridges, skyline objects, a landmark). Fog values are tuned so that the mid plane is visibly lighter and less saturated than the near plane, and the skyline is close to the horizon colour but still reads as a silhouette.

### 5.4 Light shafts

Light shafts are a strong look and can be cheap. Use two methods.

**Shaft cards (every tier).** Authored volumes placed by level data (proposed `art.shafts: Array<{ at, size: [w, h, len], dir?: 'sun' | Vec3, color?, strength }>`). Each card is a tapered open box (four quads) aligned to the sun direction, additive, `depthWrite: false`, fog-aware. Its brightness is modulated by:

- the view angle: `0.25 + pow(max(dot(viewDir, sunDir), 0), 2)` (much stronger when looking toward the light);
- the distance: fade out within 15 m, so the camera never sits visibly inside a slab;
- edge softness: a uv gradient multiplied by scrolling noise, which makes visible dust in the beam;
- `sunGate` at the card's origin, so a shaft dies when its source is shadowed (the L1 sunrise front lights the *Abeyance*'s shafts in turn).

Where they go: through the *Abeyance*'s breaches at dawn (L1); down the cavern shaft in starlight (L1); across canyon slots (L3); under the Parasol petals and through the spine (L4); the Press's skylights and the Dredge's steam (L6); between the dead giants in the basin fog (L7).

**Sun shafts pass (High only).** A screen-space radial blur toward the sun. It sits between bloom and FinalPass and runs only when the sun is on screen or within 30% of the screen's edge:

1. Downsample to quarter resolution with a mask: `max(luma − threshold, 0)`, multiplied by a disc of radius 0.6 around the sun's screen position. Sky near the sun is the brightest thing there, and darker foreground objects occlude it naturally.
2. Three radial-blur passes toward the sun's screen position (16, 8 and 4 taps, decay 0.95).
3. FinalPass adds it, tinted with the sun colour and multiplied by `art.light.shafts ?? 0.35` and the on-screen fade.

That is five extra draw calls, within the post budget of 30.

### 5.5 Weather

`render/weather.js` (architecture §4.1). Particles live in a volume that follows the camera. `weatherParticles` sets the count per tier.

| Type | Look | Size | Motion | Render |
| --- | --- | --- | --- | --- |
| `snow` | soft flakes | 0.04 to 0.12 m | 1 to 2 m/s down, sway ±0.6 m/s; straight down in L8 | alpha dots; forward-scatter brightening toward the sun |
| `crystals` (new) | diamond dust: tiny glittering points | 0.02 m (minimum 1 px) | drifting, 0.3 m/s | additive; flash only when `dot(view, sun)` and a per-particle phase align |
| `rain` | streaks | 0.02 × 0.6 m | 12 m/s along the wind | stretched quads from the atlas streak cell (unused in canon; kept for debug and custom zones) |
| `dust` | motes in sunlight | 0.03 to 0.08 m | slow drift with the wind | additive, only bright when sunlit and backlit |
| `ash` | the prototype's ash | 0.22 m | fall plus drift | alpha |
| `embers` | sparks drifting up | 0.05 m | rising 1 to 3 m/s, flicker | additive, near flare stacks and fires (L6) |
| `sandstorm` | glass grit (L4's storm) | 0.02 to 0.06 m | 12 to 20 m/s along the wind | alpha streaks plus additive sparkle, `fogBoost` 3 to 5, and the screen grit overlay (§6.11) |

**Particle lighting** (all types, per vertex): `colour × (hemiSky × 0.6 + sunColour × sunVisible × (0.35 + 1.2 × pow(max(dot(viewDir, sunDir), 0), 6)))`. Snow in L8 turns gold when you look toward the sun, and dust motes sparkle in L2's shafts. In L5, add the headlamp: `+ spotColour × inCone(worldPos) × 2`, so snowflakes light up inside the beam. That alone makes the beam look volumetric.

Proposed `WeatherParams` additions: `color?`, `size?`, `sparkle?`, and `layers?: Partial<WeatherParams>[]`, so one level can run snow and crystals together.

### 5.6 How grades are built

FinalPass runs exposure, tone mapping, sRGB, then grading in display space: lift, gamma and gain; contrast about 0.5; saturation; shadow and highlight tints split by luma; desaturate; vignette; grain (architecture §7.2). Recipe rules:

1. **Split complementary.** Tint highlights toward the key light's hue and shadows toward its complement, by 4 to 12%. Warm sun means cool shadows (L2, L3, L6's tail, L8). Cold key means slightly warm-neutral highlights (L5, L7).
2. **Lift the blacks only for haze.** Milky blacks (lift 0.015 to 0.03) belong to L4's glare and L7's ice fog. Night levels keep blacks deep (lift under 0.01) and get their mood from tint.
3. **Saturation follows the story's temperature.** It peaks in L2 and L8 (1.1 to 1.15), dips in L4, L5 and L7 (0.75 to 0.85), and is crushed at the L6 reveal.
4. **Never grade emissives off their meaning.** After grading, check that cyan still reads cyan, sodium reads orange and ghost green reads green (§8).
5. **Grain and vignette** carry tension: higher in L5 and L6 (grain 0.04 to 0.05, vignette 0.4), lowest in L8.

### 5.7 Per-level recipes

These are `LevelArt` values (architecture §6.4, plus the Appendix A fields), ready to paste into the level files and tune against screenshots. Zones blend over them.

#### L1 THAW: the Rime Shelf

*Mood:* blue-black ice under stars and aurora, a thin red dawn rim in the east. At minute 15 a wall of red-gold light sweeps the shelf. Then dawn: long blue shadows, warm ice, glitter.

```js
// L1 night (start). The sun is below the horizon; the directional light is starlight.
art: {
  toneMapping: 'aces',
  palette: { ground: '#2a3a4a', rock: '#1d2b38', sediment: '#3a4a5a', high: '#5a6d80', dust: '#8fa3b5', snow: '#c9d6e3',
             wet: '#0e1822', concrete: '#4a4e52', rust: '#5d3424', accent: '#5fe3ff',
             strata: ['#1d2b38', '#2b3d4e', '#163042', '#3a5064'] },
  sky: { top: '#03050c', mid: '#0a1424', horizon: '#18263a', stars: 1,
         sun: { azimuth: 92, elevation: -4, color: '#ff5a2a', size: 1.6, glow: 0.4 },
         dawnRim: { color: '#ff5a2a', strength: 0.9 },
         aurora: { strength: 0.55, colorA: '#2fe0c8', colorB: '#7b4dff', speed: 1 },
         clouds: { cover: 0.15, color: '#1a2436' }, ridges: { height: 1.2, color: '#0a1220' } },
  fog: { color: '#18263a', density: 0.0016, heightFalloff: 0.012, inscatter: 0.5, sunColor: '#ff6a3a',
         ground: { density: 0.012, heightFalloff: 0.18, heightBase: 0, color: '#22344a' } },        // ice fog
  light: { sun: 0.8, sunColor: '#8fa8d8', hemi: 0.9, hemiSky: '#2a4466', hemiGround: '#05080e',
           rim: 0.7, rimColor: '#5fe3c8', exposure: 1.35, env: 0.8, keyDir: { azimuth: 200, elevation: 55 } },  // starlight
  grade: { contrast: 1.08, saturation: 0.85, lift: [0.0, 0.006, 0.018], shadowsTint: [0.9, 0.97, 1.1],
           highlightsTint: [1.0, 1.0, 1.02], vignette: 0.36, grain: 0.035 },
  bloom: { strength: 0.95, threshold: 0.75 },
  weather: { type: 'crystals', intensity: 0.4, wind: [3, 0] },
  surface: { style: 'snow', snow: 0.55, gloss: 0.3, frost: 0.5, rockSlope: [0.3, 0.55], strataHeight: 4 },
},
// L1 dawn (the scripted blend, §5.8): only the changes.
dawn: {
  sky: { top: '#1a2140', mid: '#6a3f4a', horizon: '#c9806a', stars: 0.15,
         sun: { azimuth: 92, elevation: 3.5, color: '#ff7a3c', size: 1.4, glow: 1.2 }, aurora: { strength: 0.08 } },
  fog: { color: '#6d6378', sunColor: '#ff8a4a', inscatter: 1.3, ground: { density: 0.006 } },
  light: { sun: 7.0, sunColor: '#ff8a4a', hemi: 1.4, hemiSky: '#4a6a9a', hemiGround: '#1a1a24', rim: 1.6,
           rimColor: '#7fa0d8', exposure: 1.0, keyDir: null, shadowMinElevation: 8 },   // the key light is the sun again
  grade: { saturation: 1.0, highlightsTint: [1.08, 0.97, 0.88], shadowsTint: [0.88, 0.95, 1.1], vignette: 0.28 },
  weather: { type: 'crystals', intensity: 0.7, sparkle: 1 },
},
```

- *Accents:* Gleaners' ghost beacons; raider skiffs' sodium lamps; Kit's flares (red-orange, smoking); the Wake's tungsten lights on the shore in the far east (a skyline lamp layer); Moth's cyan visor. The *Abeyance* is dark.
- *Cavern:* no sky. Hemi `#0e2a40`/`#020406` at 0.5, ice emissive (§4.2), a shaft card of starlight down the shaft, exposure 1.6.
- *Underwater* (the drowning): see §5.8.
- *Low:* the stars and aurora stay in the sky shader; floes are instanced bevelled slabs; the *Abeyance* is one merged mesh (bible).

#### L2 THE WAKE: the Morning Steppe

*Mood:* red-gold reeds under a low gold sun, long shadows, dust motes. Wind waves roll across the reeds. The Sundial is a needle on the horizon and the Dredge's plume rises far to the north.

```js
art: {
  toneMapping: 'aces',
  palette: { ground: '#9a6a3a', rock: '#5a4232', sediment: '#7a5434', high: '#b88a56', dust: '#d4ab80',
             wet: '#3a2a1a', concrete: '#7a7066', rust: '#7a4128', accent: '#ffb36b',
             strata: ['#6a4a34', '#8a6040', '#5a3e2c', '#a07850'] },
  sky: { top: '#2e4f7c', mid: '#9fb3c0', horizon: '#e9c49a',
         sun: { azimuth: 100, elevation: 9, color: '#ffc27a', size: 1.2, glow: 1.0 },
         clouds: { cover: 0.3, color: '#f2d8b8', speed: 1 }, ridges: { height: 1.0, color: '#8a6a58', layers: 2 } },
  fog: { color: '#d4ab80', density: 0.0009, heightFalloff: 0.008, inscatter: 1.0, sunColor: '#ffc98a' },
  light: { sun: 6.8, sunColor: '#ffbf73', hemi: 1.7, hemiSky: '#9ab4d0', hemiGround: '#6b4a2c',
           rim: 2.2, rimColor: '#a9c4e0', exposure: 1.0, env: 1.0, shafts: 0.45 },
  grade: { contrast: 1.06, saturation: 1.12, lift: [0.01, 0.005, 0.0], highlightsTint: [1.06, 1.0, 0.9],
           shadowsTint: [0.92, 0.97, 1.06], vignette: 0.25, grain: 0.03 },
  bloom: { strength: 0.6, threshold: 0.95 },
  weather: { type: 'dust', intensity: 0.5, wind: [5, 1.5] },
  surface: { style: 'grit', dust: 0.25, rockSlope: [0.3, 0.55], strataHeight: 8 },
  skyline: [{ kind: 'custom', custom: 'sundial', at: { azimuth: 340, dist: 9000 }, size: 1 },
            { kind: 'smoke', at: { azimuth: 10, dist: 14000 }, size: 3, color: '#4a3a30' }],    // the Dredge's plume
},
```

- *Accents:* the convoy's lamps are dim in daylight; kite ribbons give colour; the *Tally*'s sodium lamps and its oxide hull mark the enemy flagship.
- *Sundial noon* (the level's end): blend toward a higher, whiter sun (`elevation 30`, `#ffe8c8`) and a cooler sky. The Wake camps in the Sundial's shadow, which comes from the terrain-data caster (§3.4).
- *Low:* reeds beyond 120 m are carried by the terrain; rigs beyond 300 m are a lower LOD (bible).

#### L3 THE THROAT: Gerrow Canyon

*Mood:* red slot canyons, hard morning sun, black shadows, white slots of sky, sodium lamps glowing on the Dam in its own shadow. Then the flood: brown water, spray, speed.

```js
art: {
  toneMapping: 'aces',
  palette: { ground: '#8a4a2c', rock: '#7a3a22', sediment: '#a0603a', high: '#c08a5e', dust: '#d8a07a',
             wet: '#3a1e12', concrete: '#6e665c', rust: '#7a4128', accent: '#ff9a2e',
             strata: ['#7a3a22', '#a8583a', '#c9845a', '#5e2a1a', '#e0b48a', '#8a4428'] },
  sky: { top: '#4f86c6', mid: '#b9d3e8', horizon: '#f2efe9',
         sun: { azimuth: 105, elevation: 32, color: '#fff0d8', size: 1, glow: 0.7 },
         clouds: { cover: 0.12, color: '#ffffff' }, ridges: { height: 0.6, color: '#b07a5a' } },
  fog: { color: '#e9d9c8', density: 0.0012, heightFalloff: 0.004, inscatter: 0.6, sunColor: '#fff4e0' },
  light: { sun: 8.5, sunColor: '#fff0d8', hemi: 1.1, hemiSky: '#8fb3d9', hemiGround: '#5a2a1a',
           rim: 1.8, rimColor: '#c86a40', exposure: 0.95, env: 0.8, shafts: 0.5 },      // the rim is the red wall bounce
  grade: { contrast: 1.14, saturation: 1.08, lift: [0.0, 0.0, 0.01], shadowsTint: [0.9, 0.95, 1.1],
           highlightsTint: [1.04, 1.0, 0.94], vignette: 0.3, grain: 0.03 },
  bloom: { strength: 0.7, threshold: 0.9 },
  weather: { type: 'dust', intensity: 0.25, wind: [1, -2] },
  surface: { style: 'grit', rockSlope: [0.25, 0.45], strataHeight: 9, strataWarp: 1.5, strataStrength: 0.9, wetness: 0.7 },
},
```

- *Rim as bounce:* in the canyon, the rim light comes from the direction of the sunlit wall (opposite the sun's azimuth, elevation 15°) in red-orange. Shadowed walls glow warm, which is the look of real slot canyons.
- *Canyon shadows* come from the terrain bake; the floor is mostly in shadow, with bright slots where the canyon turns east.
- *Dam:* sodium lamps at intensity 5 with glow sprites; seepage falls with mist cards.
- *The flood* (zone art): add spray (`weather: { type: 'crystals', color: '#e8dccc', intensity: 0.6 }` reused as mist droplets), `fog.ground` mist at the water surface, and `grade.contrast 1.08`.
- *Low:* canyon walls are low-poly with baked shadows (the terrain bake does this on every tier); the flood is a scrolling water plane with a foam front (bible).

#### L4 AFTERNOON: the Glasslands

*Mood:* a white sun overhead, bleached colour, heat haze, mirror glints and glare. Shade is the only refuge, and it must look like one.

```js
art: {
  toneMapping: 'agx',
  palette: { ground: '#b9b29a', rock: '#8a7f6a', sediment: '#a89a7e', high: '#d8cfb8', dust: '#efe6da',
             wet: '#3a3530', concrete: '#7a7066', rust: '#7d2a1c', accent: '#fff1d6',
             strata: ['#b9b29a', '#9a9078', '#d0c6aa', '#3a3530'] },
  sky: { top: '#8fa9c4', mid: '#d9e2e6', horizon: '#f4efe6',
         sun: { azimuth: 150, elevation: 72, color: '#fffaf0', size: 1.3, glow: 1.4 }, clouds: { cover: 0.0 },
         ridges: { height: 0.5, color: '#c9bca2' } },
  fog: { color: '#efe6da', density: 0.0011, heightFalloff: 0.006, inscatter: 0.5, sunColor: '#fffaf0' },
  light: { sun: 9.5, sunColor: '#fffaf0', hemi: 2.4, hemiSky: '#dfe8f0', hemiGround: '#c9b49a',
           rim: 0.8, rimColor: '#c0d0e0', exposure: 0.82, env: 1.2 },
  grade: { contrast: 1.05, saturation: 0.78, lift: [0.02, 0.02, 0.02], gain: [1.02, 1.0, 0.97],
           shadowsTint: [0.85, 0.92, 1.08], highlightsTint: [1.03, 1.0, 0.96], desaturate: 0.1,
           vignette: 0.2, grain: 0.035, chroma: 0.015 },
  bloom: { strength: 0.9, threshold: 0.8 },
  weather: { type: 'dust', intensity: 0.3, wind: [4, 2], color: '#fff6e0', sparkle: 0.6 },
  surface: { style: 'glass', gloss: 0.55, dust: 0.35, rockSlope: [0.35, 0.6], strataHeight: 6 },
  heatHaze: 1,
},
```

- *Shade must read.* Shade is gameplay. Shadowed areas get a cool, darker look from the low-angle hemi and the shadow tint; inside the shade, a fog card darkens the air slightly (the "cool pocket"). The terrain-data gate gives petal shade on every tier (§3.4).
- *Glare:* mirror glints (§6.12) and the Burn's beam are the brightest things in the game; the bloom threshold is set for them.
- *Glass storm* (midpoint zone, blend 8 s): `weather: { type: 'sandstorm', intensity: 1, wind: [18, 6], fogBoost: 4, color: '#d8c7a8', sparkle: 1 }`, `light.sun 3.0`, `fog.color '#d8c7a8'`, screen grit (§6.11).
- *The Burn going out* (§5.8).
- *Low:* burn-lines are additive beams with no real-time light; petals are merged instanced shards; the storm is fog plus screen grit (bible).

#### L5 THE LONG NIGHT: Carrow Station

*Mood:* total night. Black, teal and green. The aurora above the pylons, the headlamp, Kit's flares and green cab lights. The darkest and quietest level.

```js
art: {
  toneMapping: 'aces',
  palette: { ground: '#1a2228', rock: '#141a20', sediment: '#202a30', high: '#2a343c', dust: '#5a6a72', snow: '#9aaab8',
             wet: '#05080a', concrete: '#3a3e42', rust: '#3a2418', accent: '#a8ff9e',
             strata: ['#141a20', '#1c242a', '#10161a'] },
  sky: { top: '#010205', mid: '#03080d', horizon: '#08141a', stars: 1,
         sun: { azimuth: 90, elevation: -18, color: '#40201a', size: 0, glow: 0 },
         dawnRim: { color: '#40201a', strength: 0.35 },                          // the edge, far behind them
         aurora: { strength: 1, colorA: '#2fe0c8', colorB: '#7b4dff', speed: 0.6 },
         clouds: { cover: 0.05 }, ridges: { height: 1.0, color: '#020406' } },
  fog: { color: '#050b10', density: 0.0035, heightFalloff: 0.02, inscatter: 0 },
  light: { sun: 0.25, sunColor: '#3fb8b0', hemi: 0.35, hemiSky: '#10302f', hemiGround: '#020304',
           rim: 0.3, rimColor: '#2fe0c8', exposure: 1.6, env: 0.5, keyDir: { azimuth: 330, elevation: 35 } },   // aurora key
  grade: { contrast: 1.12, saturation: 0.75, lift: [0.0, 0.006, 0.012], shadowsTint: [0.85, 1.0, 1.08],
           highlightsTint: [1.02, 1.0, 0.98], vignette: 0.42, grain: 0.045 },
  bloom: { strength: 1.1, threshold: 0.6 },
  weather: { type: 'snow', intensity: 0.35, wind: [1, 0.5] },
  surface: { style: 'snow', snow: 0.8, frost: 0.7, rockSlope: [0.35, 0.6] },
},
```

- *The headlamp:* a SpotLight from Moth's head, 60 m range, cone 24°, penumbra 0.5, colour `#e8f4ff`, intensity 4000 cd (tune), shadowed on High. Draw a visible beam: an additive cone mesh with noise scrolling along it and brightness falling off with distance (fog-aware), plus the snow lit inside the cone (§5.5). The beam is what Listeners see, so it must be obvious to the player too.
- *Flares:* a sprite, an emitter (smoke and sparks), a ground pool decal (an additive radial gradient decal, 25 m, `#ff7048`) and a pooled point light on High and Medium. On Low the pool decal is the light (§7.2). Flares flicker at 8 to 14 Hz with ±15% amplitude.
- *Pylons:* faint cyan node lights, about 10% lit, some flickering.
- *Racks waking:* the beacons' `wake` attribute ramps per rack as Juno passes, pulsing on the shared beat (§4.5).
- *Floodlight yard* (§5.8).
- *Sonar ping* (§6.12).
- *Low:* one headlamp spot light, flares as decal pools (no point lights on Low, §7.2), and the aurora in the sky shader (bible).

#### L6 THE DREDGE: the Walking City

*Mood:* gold morning at the tail, sodium orange and steam in the middle, starlight and green cab lights at the bow. Climbing it is walking from day into night. Three zones blend along the city (zone `art`, blend 10 to 15 s).

```js
art: {   // tail (start)
  toneMapping: 'aces',
  palette: { ground: '#4a3a30', rock: '#3a2e28', sediment: '#5a463a', high: '#6a5a4a', dust: '#a88a6a',
             wet: '#1a1410', concrete: '#6e665c', rust: '#7d2a1c', accent: '#ff9a2e',
             strata: ['#3a2e28', '#4a3a30', '#2a221e'] },
  sky: { top: '#2a3550', mid: '#8a6a5a', horizon: '#c98a5a',
         sun: { azimuth: 95, elevation: 6, color: '#ffb060', size: 1.3, glow: 1.2 },
         clouds: { cover: 0.45, color: '#6a4a3a' }, ridges: { height: 3.5, color: '#2a2024', layers: 3 } },  // the Hasp
  fog: { color: '#8a6048', density: 0.0016, heightFalloff: 0.006, inscatter: 1.1, sunColor: '#ffa860',
         ground: { density: 0.004, heightFalloff: 0.05, heightBase: 0, color: '#9a7a66' } },                 // steam
  light: { sun: 6.2, sunColor: '#ffb060', hemi: 1.5, hemiSky: '#6a7a9a', hemiGround: '#3a2a20',
           rim: 2.0, rimColor: '#8aa0c8', exposure: 1.0, env: 0.9, shafts: 0.5 },
  grade: { contrast: 1.1, saturation: 1.05, highlightsTint: [1.08, 0.99, 0.86], shadowsTint: [0.86, 0.95, 1.1],
           vignette: 0.32, grain: 0.04 },
  bloom: { strength: 0.85, threshold: 0.8 },
  weather: { type: 'embers', intensity: 0.3, wind: [2, -1], layers: [{ type: 'ash', intensity: 0.3 }] },
  sunFront: { dir: [0, 1], offset: -900, softness: 60 },   // lit where z > −900: the tail (south, +Z) is lit, the bow (north) is in the Hasp's shadow (tune)
},
// mid zone: art: { light: { sun: 2.5, hemi: 1.0, exposure: 1.15 }, fog: { color: '#5a3a2a', density: 0.0022 },
//   grade: { saturation: 1.1, contrast: 1.12, highlightsTint: [1.12, 0.98, 0.82], shadowsTint: [0.82, 0.94, 1.12] } }
// bow zone: art: { sky: { top: '#02040a', mid: '#060c18', horizon: '#0e1624', stars: 1 },
//   light: { sun: 0.0, hemi: 0.6, hemiSky: '#1a2840', exposure: 1.5 }, fog: { color: '#0a1018', density: 0.0018 },
//   grade: { saturation: 0.7, vignette: 0.4 } }
```

- *Light is the city.* Sodium lamps by the thousand (instanced glow sprites), pooled point lights on the lamps nearest the player, floodlight rows on cranes, flare-stack fire (an emitter, a pooled light and heat haze), glowing slag channels under gratings (an emissive scrolling texture), and lit water-pen windows in tungsten (the Hands are alive).
- *Steam* is lit by its zone: big alpha billows tinted by the zone's key light (gold at the tail, sodium in the middle, cold at the bow).
- *The Press* (§5.8).
- *Low:* about 12 modular bevelled blocks, instanced; distant sections as impostor cards; steam as sprites (bible).

#### L7 THE BONEYARD: Founders' Field

*Mood:* pale blue morning sun low in the south, rime glitter, ice fog pooling in the basin. White giants half buried in the snow under a kilometre of frozen waterfall.

```js
art: {
  toneMapping: 'agx',
  palette: { ground: '#c8d4de', rock: '#5a6672', sediment: '#a8b6c2', high: '#e0e8ee', dust: '#dfe8ef', snow: '#e8eef5',
             wet: '#3a4a58', concrete: '#7a7e82', rust: '#5d3424', accent: '#ffcc66',
             strata: ['#5a6672', '#7a8894', '#9aa8b4', '#46525e'] },
  sky: { top: '#5f7fa8', mid: '#b8cadc', horizon: '#e6eef5',
         sun: { azimuth: 175, elevation: 7, color: '#dfe9ff', size: 1.2, glow: 0.9 },
         clouds: { cover: 0.25, color: '#eef3f8' }, ridges: { height: 4.5, color: '#9aaabb', layers: 3 } },   // the Rampart
  fog: { color: '#cfdbe6', density: 0.0014, heightFalloff: 0.01, inscatter: 0.8, sunColor: '#fff1df',
         ground: { density: 0.01, heightFalloff: 0.06, heightBase: 0, color: '#dbe5ee' } },                  // basin ice fog
  light: { sun: 6.0, sunColor: '#dfe9ff', hemi: 2.0, hemiSky: '#a8c4e8', hemiGround: '#d8e2ea',
           rim: 1.6, rimColor: '#ffffff', exposure: 0.95, env: 1.0, shafts: 0.35 },
  grade: { contrast: 1.06, saturation: 0.82, lift: [0.01, 0.015, 0.03], shadowsTint: [0.86, 0.94, 1.12],
           highlightsTint: [1.02, 1.01, 1.0], vignette: 0.26, grain: 0.03 },
  bloom: { strength: 0.8, threshold: 0.85 },
  weather: { type: 'crystals', intensity: 0.6, wind: [1, 0], layers: [{ type: 'snow', intensity: 0.15 }] },
  surface: { style: 'snow', snow: 0.85, frost: 0.6, rockSlope: [0.4, 0.65], strataHeight: 14 },
  ambience: [{ kind: 'battle', at: { s: 1800 }, radius: 900, intensity: 0.6 }],     // the far "battle painting"
},
```

- *Accents:* woken Cantors' gold and cyan seams are the brightest things in the basin; the Dredge fleet's sodium lamps come in from the south and east; mortar arcs and tracers make the far battle painting.
- *The Fall:* fake-subsurface ice with fresnel, three depth layers of flutes, mist cards at its foot. When the Dredge climbs it (§5.8), its lamps crawl up the ice.
- *Low:* dead giants as merged meshes; the far battle as painted silhouettes on splines; at most two Cantors awake (bible).

#### L8 THE STILL: the Pole

*Mood:* the most beautiful level. Fixed gold twilight with the sun resting on the horizon, long blue shadows, snow falling straight down, warm steam fog over open water, white domes on the far shore.

```js
art: {
  toneMapping: 'aces',
  palette: { ground: '#e8d8c8', rock: '#4a4a5a', sediment: '#c8b8b0', high: '#f2e4d2', dust: '#f0d8b8', snow: '#f2e4d2',
             wet: '#0b1d22', concrete: '#8a8a8a', rust: '#7d2a1c', accent: '#ffcc66',
             strata: ['#4a4a5a', '#5a5a6e', '#3a3a4a'] },
  sky: { top: '#2b3a63', mid: '#8a7aa0', horizon: '#c9a58f',
         sun: { azimuth: 200, elevation: 1.5, color: '#ffb45a', size: 1.6, glow: 1.6 },
         clouds: { cover: 0.35, color: '#e8b890', speed: 0.3 }, ridges: { height: 0.8, color: '#6a5a78' } },
  fog: { color: '#b89a9a', density: 0.0012, heightFalloff: 0.01, inscatter: 1.4, sunColor: '#ffb866',
         ground: { density: 0.008, heightFalloff: 0.12, heightBase: 0, color: '#e8c8b0' } },        // steam over the leads
  light: { sun: 5.5, sunColor: '#ffb45a', hemi: 1.8, hemiSky: '#6a7fb8', hemiGround: '#e8d8c8',
           rim: 1.4, rimColor: '#9fb2ff', exposure: 1.1, env: 1.0, shafts: 0.6, shadowMinElevation: 7 },
  grade: { contrast: 1.05, saturation: 1.1, lift: [0.005, 0.01, 0.03], highlightsTint: [1.1, 1.0, 0.86],
           shadowsTint: [0.84, 0.92, 1.14], vignette: 0.3, grain: 0.025 },
  bloom: { strength: 0.9, threshold: 0.85 },
  weather: { type: 'snow', intensity: 0.5, wind: [0, 0], size: 1.4 },
  surface: { style: 'snow', snow: 0.9, frost: 0.4, gloss: 0.15 },
},
```

- *Accents:* Stillwater's dim cyan seams; the Dredge's sodium and green lights between the player and the shore; the gold sun in every reflection (snow sparkle, water, ice).
- *Lattice-space* (Phase D) uses its own art preset (§5.8).
- *Low:* pack ice as instanced bevelled slabs; snow as one particle system; lattice-space is cheap (bible).

#### The Bench (garage scene)

The Bench is Oma's workshop crawler at camp. The frame kneels under a work lamp. It is the warmest, safest image in the game, and it gets the same look at every visit, so the player feels the return.

- *Key:* a tungsten work lamp on a crane arm (SpotLight 2,500 cd, `#ffb36b`, shadowed on all tiers; this scene has no other shadow casters), plus a glow sprite and a lamp-housing model.
- *Fill:* hemi `#3a2e24` / `#0e0a08` at 0.6.
- *Rim:* the open rear of the crawler shows the current level's sky. Use the level's PMREM and a rim light in the level's sky colour at 1.5, so the next place is always visible behind the frame.
- *Interior:* canvas walls (lit from outside, a faint warm emissive), crane arms, parts racks, painted names, and the kneeling cradle.
- *Effects:* welding sparks (blue-white arc flicker `#cfe6ff` with a pooled point light at 30 Hz random flicker, and spark showers), dust motes in the lamp cone (a shaft card) and a slow camera orbit.
- *Grade:* saturation 1.0, warm highlights, vignette 0.35, grain 0.03, bloom 0.7.

### 5.8 Scripted light moments

| Moment | Recipe |
| --- | --- |
| **L1 sunrise wall** | Over 12 s: the sun front (`uSunFront`, `dir` = (1, 0) because the lit side is east) sweeps from the shelf's eastern edge toward the player at about 180 m/s (its offset falls from the east edge's x toward the west), softness 40 m. `atmosphere.set(dawn, 10)` blends the sky, fog and grade. The sun goes from elevation −4° to 3.5° and intensity 0.8 to 7. Exposure goes from 1.35 to 1.0 over 6 s, with the camera's auto-exposure overshoot faked by an extra +0.2 that decays over 2 s after the front passes. Crystals flare as the light hits them. Shaft cards in the *Abeyance* ignite in sequence as the front passes them. The terrain bake reruns once at the new angle behind the front. |
| **L1 drowning** | Underwater art preset: no sky; fog `#0b2a24` at density 0.06 with no height falloff; hemi `#0e3a30`/`#020806` at 0.4; sun 0; a shaft card down from the hole in the ice above; silt (alpha particles, slow) and bubbles (additive, rising); grade saturation 0.6, green tint, vignette 0.6, chroma 0.03. The HUD water line and the black screen are DOM (bible). On Low: fog and tint only. |
| **L3 dam blow** | The fractured chunks are released; dust and spray emitters run at full scale; the sun shafts pass catches the spray; camera shake 1.5. As the wall of water leans, the ground fog density rises in the canyon over 3 s. |
| **L4 the Burn goes out** | The beam flickers over 3 s (on/off pulses at 4 Hz with a decaying duty cycle) and then dies; its pooled light fades; burn-lines fade to glowing scars (decals). On the northern horizon, the Dredge's skyline lamp layer dims by 70% over 5 s. |
| **L5 floodlights** | Each breaker adds a bank: four lamp assemblies, two pooled point lights (High/Medium), additive light cones, and white pool decals. With all three banks on, exposure goes from 1.6 to 1.0 over 2 s, the grade's saturation rises to 0.9, and the Shepherd's sonar head is exposed. |
| **L6 tail to bow** | Zone blends (above); the sun front marks where the Hasp's shadow falls across the city. |
| **L6 the Press and the reveal** | A vaulted hall of lattice-glass (`darkGlass` with gold seam lines) and black iron. The chair's core is a white-gold emissive with a slow 60 bpm pulse (the shared beat). For the reveal: `grade.desaturate 0.6`, vignette 0.5, chroma 0.03, the HUD lattice screen, then the recall's input drift (§6.11). |
| **L6 the bow** | From the last lamp, a 200 m drop into darkness: fog density × 2, sun 0, hemi 0.3. The Dredge's lamp layer recedes above. |
| **L7 a Cantor wakes** | Seams ramp ×0.15 to ×4 over 1.5 s, a white flash at the peak, a pooled point light in gold, a ring of crystals blown outward, and a choral chord (audio). It kneels again with a slow fade. |
| **L7 the Dredge climbs the Fall** | Letterbox. Anchor harpoons strike the ice (impact effects with ice shards at ×4 scale). The city's lamp layer crawls up the ice face. Ice breaks off in slabs (debris shards and powder), and an ice-dust cloud (big alpha billows) rolls back down the Fall. |
| **L8 the bow tilts into the sea** | Steam and spray emitters along the waterline, the deck lamps tilting with it, and gold light catching the spray. |
| **L8 lattice-space** | A separate art preset: a black void `#020308` with no fog, sky or sun gate (`uGateOn = 0`); additive line geometry (LineSegments, with bloom carrying their width); fragment cards as canvas-textured planes in white and amber; the Loop as pale gold line geometry that repeats; bloom 1.4, threshold 0.4; contrast 1.2. It costs very little on any tier. |
| **L8 endings** | Ending 1: flare stacks go out one by one; lamp sprites lerp from sodium to warm white `#ffe6c0` over 20 s. Ending 3: every ghost beacon turns white and is replaced by a rising mote particle (the beacon instance's position seeds an additive particle drifting up at 1.5 m/s for 12 s). The released Carrow banks' motes are already waiting at the Lay. The visor going out is a 3 s fade of Moth's `lightCyan` to 0. |

---
## 6. Effects (`render/particles.js`, `render/fx.js`, P1)

### 6.1 Principles

- **Layered, not single.** Every effect has at least three of: flash (light and core sprite), body (fireball, sparks, splash), residue (smoke, dust, embers), mark (decal), and motion (shake, shockwave, debris).
- **Pooled.** Particle ring buffers, an instanced flash pool, an instanced ribbon pool, an instanced shockwave-ring pool, instanced debris, decals and the point-light pool (architecture §7.6). Nothing allocates per shot.
- **Readable.** The player's rounds are warm white and amber. Enemy fire is red-orange. Founders weapons are cyan-white. A projectile's colour tells you whose it is.
- **Lit.** Smoke and dust use the lit-billow trick (§6.2), so they have a sunny side and a shadow side. Unlit grey smoke is the cheapest-looking thing in games.

### 6.2 The sprite atlas and lit billows

Extend the prototype's single soft dot to a 4 × 2 atlas (`smokeSprite`/`sparkSprite`, 512 × 256 on High, generated on a canvas):

| Cell | Content |
| --- | --- |
| 0 | soft dot (the prototype's) |
| 1 | streak (sparks, tracers, rain) |
| 2 | flare (a four-point star with a hot core) |
| 3, 4 | billows A and B: R = density (noisy puff), G and B = a sprite-space normal (x, y) packed 0 to 1 |
| 5 | fireball: a noisy puff with a hot core gradient |
| 6 | ring (shockwaves, ripples) |
| 7 | shard glint |

**Lit billows.** In the alpha particle shader, project the sun direction into view space and take its screen-space xy as `sunScr`. Each billow is rotated by a per-particle angle (a hash of its index), so rotate `sunScr` the same way, then shade:

```glsl
vec4 t = texture2D(uAtlas, cellUv);                           // r: density, gb: normal xy
vec2 n = t.gb * 2.0 - 1.0;
float lit = 0.45 + 0.55 * clamp(dot(n, sunScrRot) + 0.25, 0.0, 1.0);
vec3 c = vC * (uHemi * 0.55 + uSunCol * lit * uSunVis);     // uSunVis: sunGate at the emitter (per spawn)
gl_FragColor = vec4(mix(uFogColor, c, vF), t.r * vA);
```

### 6.3 Muzzle flashes

One global InstancedMesh of flash geometry (capacity 48): three crossed quads forming a star along the barrel, plus a disc facing forward. Additive, HDR. Each flash lives 2 frames (0.035 s), randomly rolled and scaled ±15% per shot.

| Kind | Flash length | Colour | Extras |
| --- | --- | --- | --- |
| `rifle` (player) | 1.8 m | `#ffd9a0` × 4 | 3 sparks; pooled light 400 cd, 12 m, 0.05 s |
| `mg` | 1.2 m | `#ffe2a8` × 3 | light on every third shot |
| `shotgun` (Sleet Gun) | 2.4 m, wide | `#ffd0a0` × 4 | 8 sparks; a smoke puff |
| `cannon` (Rivet Driver, tanks) | 4 m | `#ffb070` × 5 | a smoke ring (4 billows), light 1,500 cd, a dust ring if near the ground |
| `rail` (Founders' Lance) | 3 m | `#bff4ff` × 6 | a cyan ring sprite; the beam (§6.8) |
| `plasma` (drones) | 1 m | `#ff6a3a` × 4 | — |
| `turret` | 1.4 m | `#ff7a40` × 4 | — |

### 6.4 Tracers and projectiles

`combat/projectiles.js` renders projectiles as instanced, camera-facing quads stretched along their velocity (`length = min(speed × 0.025, 40 m)`, width 0.25 to 0.5 m) with a hot core: white at the centre fading to the tint at the edges, HDR × 3 to 6 so they bloom.

- Player rounds `#ffd9a0`; enemy rounds `#ff6a3a`; plasma `#ff4a2a` with a soft halo; Rivet Driver bolts `#ffa050`, larger and slower, with ember sparks; missiles (below).
- Every round is drawn; every third player round on the mg is a brighter tracer.
- **Harpoons and cables** (the *Tally*, the Gaff Harpoon): a live cable as a camera-facing ribbon of 16 segments in a preallocated buffer, sagging along a catenary when slack and straight when taut. Rebuilding a `TubeGeometry` every frame is not allowed.

### 6.5 Impacts by surface

`fx.impact(pos, normal, kind, surface)` (architecture §4.1). Proposed surface additions: `'ice' | 'snow' | 'glass' | 'water' | 'ceramic'`.

| Surface | Bullet impact | Heavy impact (shell, missile, blade) |
| --- | --- | --- |
| `metal` | 10 to 14 orange-white streak sparks bouncing off the normal; a 0.6 m flare; a tiny smoke wisp | ×3 sparks, a molten drip trail (2 slow sparks with gravity), a scorch decal |
| `concrete` | a grey dust puff (5 billows), 4 chip sparks (dark, gravity) | a dust cloud, 3 `concreteChunk` debris, a crater decal |
| `rock` | brown-grey dust in the palette rock colour, chips | dust, rock debris |
| `ground` | a dirt spray cone up the normal (8 dark particles), dust | a soil fountain plus a crater |
| `ice` | white shards (glint cell) sparkling, ice powder | shards ×3, a frost decal, cracks on floes (L1) |
| `snow` | a big soft white puff, no sparks | a powder burst rising 6 m, a snow crater |
| `glass` | glittering shards and a white sparkle flash | shards ×3; a burn scar on L4's ground |
| `water` | a splash column (12 white particles up the normal) and a ring sprite on the water | a tall column (5 to 8 m), spray mist, a foam ring |
| `ceramic` (Founders) | white chips and a faint cyan spark | white chips, cyan sparks |

### 6.6 Explosions

`fx.explosion(pos, scale)`. Scale 1 is a tank kill. The timeline:

| Time | Element | Numbers (s = scale) |
| --- | --- | --- |
| 0 | **flash** | pooled light 2,000 × s cd, distance 45√s + 15 m, 0.45 s, falling off as t²; a white-yellow core sprite growing 14 s → 28 s over 0.25 s; within 40 m, FinalPass adds an exposure kick of +0.3 that decays in 0.15 s |
| 0 to 0.6 s | **fireball** | 8 to 14 fireball billows inside a sphere of radius 2 s, expanding 3 s → 9 s; colour over life: `(1, 0.9, 0.6) × 4` → `(1, 0.5, 0.15) × 2` → `(0.5, 0.12, 0.04)`. At 60% of their life they hand over to smoke, which spawns at the same positions |
| 0 to 0.35 s | **shockwave** | a ground ring from radius 0 to 14 s (an additive ring mesh, alpha fading); an airburst uses a sphere shell instead. Plus a **dust ring**: 16 alpha billows in the palette dust colour moving outward at 25 s m/s with drag 3, low to the ground |
| 0 to 0.8 s | **sparks** | 30 s streaks, speed 40√s, gravity 30, life 0.3 to 0.8 s |
| 0.05 to 4 s | **smoke** | 12 s lit billows, dark `(0.12, 0.11, 0.1)`, rising 3 to 8 m/s, growing 4 s → 16 s, life 2 to 4 s. For s ≥ 2, a second puff at 1 s, higher up |
| 0 to 6 s | **debris** | 6 to 12 s bevelled chunks (§2.11) in the scene's material set; 40% trail smoke, 20% burn with ember trails |
| 0.5 to 3 s | **embers** | 20 s additive embers rising slowly and flickering |
| at impact | **mark** | a scorch decal of radius 4 s; a crater as well when s ≥ 1.5 |
| at impact | **shake** | architecture rules (`scale × 2.2 − d / 60`) |

Wrecks keep a fire emitter for 10 to 20 s, then smoke for 30 s.

### 6.7 Boost, hover, quick boost, landing and blade

- **Boost:** the rig's flame cones (the prototype's). From 40 m/s, a thin additive **boost trail** ribbon follows each nozzle (the last 12 positions, width 0.6 m → 0, the flame colour). Heat shimmer behind the nozzles on High (§6.10).
- **Ground effect:** when below 8 m altitude and boosting or hovering, kick up the surface underneath: a dust ring (palette dust, moving radially out), snow powder (L1, L5, L7, L8), spray and a wake ring on water, glittering grit on glass. This is the cheapest way to make the mech feel heavy and fast.
- **Quick boost:** a 0.12 s flare at ×2 flame scale, a ring sprite at the nozzles, a small shockwave (4 m), dust kicked out opposite the dash, and a camera fov kick (+4° for 0.2 s, skipped with reduced motion).
- **Landing:** the architecture's `fx.landing`: a dust ring, a small shockwave, footprint decals, and shake scaled by speed.
- **Blade:** a **trail ribbon** recording the blade's base and tip over the last 8 frames (0.13 s): a quad strip with uv along time, additive, Moth's blade colour `#8fe9ff` fading to transparent. On a hit: 40 sparks, a white flare and the prototype's hit-stop.

### 6.8 Missiles and beams

- **Missiles:** a bright head (flare cell) plus a smoke trail (small lit billows spawned every 0.02 s, growing 0.6 → 3 m over 1.2 to 2 s) and a short additive flame core. On Low the trail spawns every 0.04 s.
- **The Burn** (L4): a vertical column of light from the hub, visible from 10 km. Three nested open cylinders, additive: the core is white, radius 3 m, × 8; the middle is `#ffe9b0`, radius 9 m, × 2, with noise scrolling upward; the outer haze is radius 30 m at low alpha. Alpha fades with height into the sky. At the base: a ground glow decal, heat haze, sparks, and a pooled light on High and Medium. The skyline version is a tall additive line, so it stays visible beyond the view distance.
- **Burn-lines** (L4): a 20 m beam from a petal's focus to the ground, plus a big glow sprite at the contact point, a glowing scar decal trail, steam and smoke, sparks and heat haze.
- **Founders' Lance:** an instant beam (`fx.beam`) with a cyan-white core, a helix ribbon around it, and a lingering smoke trail.
- **Glass Lance:** a charge glow at the muzzle growing over 1.2 s, then a white-gold beam.

### 6.9 Environmental effects

| Emitter | Look | Where |
| --- | --- | --- |
| `steam` | white lit billows, rising fast and fading fast, tinted by the zone's key light | L6 vents, L8 leads, L3 flood spray |
| `fire` | fireball billows, embers and smoke; a pooled light if near the player | wrecks, L6 flare stacks |
| `sparks` | streak sparks falling in showers with one bounce | welding at the Bench, cutting the Gate in L7, damaged machines |
| `seepage` (new) | a scrolling alpha strip mesh (uv flow) with mist billows at its foot | the Gerrow Dam's face, L7's ice melt |
| `slagfall` (new) | an emissive scrolling strip in orange-white, embers, smoke | L6 tailings chute, L6 slag channels |
| `flare` (new) | a flickering sprite, smoke, sparks and a pool decal (§5.7 L5) | L1 shore, L5 |
| `dustDevil` | a rotating column of alpha billows | L2, L4 |
| `iceDust` | big pale billows rolling downhill | L7's Fall, collapsing floes |

### 6.10 Heat haze (High; Medium optional)

A screen-space distortion added to FinalPass:

- **Local haze:** distortion sprites (behind boost nozzles, over flare stacks, above burn-lines, around the Burn's base) are rendered additively into a half-resolution distortion target. They sit on camera layer 2 and get one extra render of only that layer, which costs a few draw calls. FinalPass offsets its scene UV by `(noise(uv × 40 + t) − 0.5) × distortion × 0.006`.
- **Ground haze** (L4, `art.heatHaze`): a global distortion confined to a screen band around the horizon line (computed from the camera's pitch), strongest near the ground and at distance, which gives the shimmering horizon.
- Cost: one half-res target and one or two passes. Off on Low.

### 6.11 Screen effects (FinalPass and DOM)

| Effect | Recipe |
| --- | --- |
| Hurt | the architecture's vignette and chroma with `grade.hurt` |
| Hit flash | a white flash of 0.06 s on big hits within 20 m (exposure kick) |
| Low AP | desaturate by 0.3 below 25% AP, with a slow 60 bpm pulse of the vignette (the shared beat) |
| Screen grit | L4's storm: two layers of `noise` scrolling sideways at different speeds, multiplied over the image at 0.15; plus streaks |
| Frost | L5 and L7: a frost-crystal border (Worley edges on a radial mask) creeping in when standing still in the cold |
| Underwater | L1's drowning (§5.8) |
| Glitch (the L6 recall) | proposed `grade.glitch` 0 to 1: horizontal bands offset by random amounts that change at 12 Hz, RGB split, occasional 8 × 8 px block noise. The HUD's drift is DOM. |
| Lens dirt (High) | a subtle procedural dirt texture multiplied by the bloom buffer at 0.15, so bright lights flare across smudges |
| Letterbox | DOM (architecture) |

### 6.12 Ping, glints and shimmers

- **Sonar ping** (L5): proposed `fx.ping(center)` sets a global uniform used by every patched material: `emissive += teal × (shell + 0.25 × crease) × fade`, where `shell = smoothstep(6, 0, abs(dist − radius))` for the expanding sphere (radius 0 to 250 m over 1.2 s), `crease = clamp(length(fwidth(normal)) × 8, 0, 1)` (screen-space creases and silhouettes, which draws the geometry as faint lines), and `fade` holds for 3 s then fades. Enemies use the same patch, so they appear too.
- **Mirror glints** (L4): every 4 frames, for Parasol facets within 1.5 km, compute on the CPU whether `reflect(−sunDir, facetNormal)` points at the camera to within 0.6°. Matching facets get a big flare sprite from the glow pool (size 4 to 12 m, × 10, gone in 0.1 s when the alignment breaks).
- **Haul glints** (bible §7.5): an amber flare twinkling at 0.7 Hz for plain parts. For hungry parts, a pale green-white `#d8ffe8` lattice-pattern sprite that rotates slowly and twinkles **out of phase** with the ghost beat, so it never reads as a ghost beacon.

### 6.13 Effect LOD and budgets

- Beyond 300 m: halve particle counts and drop debris. Beyond 800 m: a flash sprite and one smoke billow only. Off screen: spawn lights and audio only.
- If a particle system is over 80% full, scale new spawns down in proportion. The budgets are the architecture's (`particlesAdd`, `particlesAlpha`, `debrisMax`, `maxDecals`).
- Glow-sprite pool: 4,096 on High and Medium, 2,048 on Low. Beacon pool: 1,024. Ribbon pool: 32 ribbons × 16 segments. Shockwave rings: 16. Flash pool: 48.

---

## 7. Quality tiers

### 7.1 What changes between tiers

This extends the architecture's table (§7.4); every architecture key keeps its value. Proposed new keys are marked ★.

| Feature | High | Medium | Low |
| --- | --- | --- | --- |
| Post chain | RenderPass, GTAO, bloom, ★sun shafts, FinalPass (grade, ★glitch, ★grit, ★lens dirt, ★heat haze) | RenderPass, bloom, FinalPass (no lens dirt or haze), SMAA | none (direct render; tone mapping by the renderer) |
| ★`terrainDetail` | `'full'`: two-scale soil, triplanar rock, bump | `'full'` | `'lite'`: one soil scale, one rock projection, bump to 40 m |
| ★Terrain data texel | 8 m | 8 m | 16 m |
| Sun gate (terrain shadows, sun front) | on | on | **on** (one texture fetch; this is Low's big-shadow solution) |
| Sparkle (snow, ice, glass) | on | on | on, density × 0.5 |
| Ice parallax | 2 layers | 2 layers | 1 layer |
| Water normal | 2 samples + foam | 2 samples + foam | 1 sample + foam |
| ★Wear patch | full + screen-space crease | full | full without crease (vertex edges only) |
| Founders ceramic | Physical (clearcoat) | Standard | Standard |
| Cloth wind, reed wind | on | on | cloth static; reeds on |
| Reed cards out to | 250 m | 180 m | 120 m |
| Glow sprites | on | on | on, size × 1.3 (no bloom) |
| Ghost beacons (`uMinPx`) | 4 px | 4 px | 5 px |
| Shaft cards | on | on | on, strength × 0.7 |
| Fog: ground layer and cards | on | on | ground layer on; fog cards halved |
| Sky | 5 cloud octaves, 3 aurora bands | 4 octaves, 3 bands | 3 octaves, 1 band |
| Explosion particle scale | 1.0 | 0.7 | 0.4 (no dust ring) |
| Point lights | 6 | 3 | 0 (flashes become sprite bursts; key lamps become decal pools) |
| L5 headlamp shadow | on | off | off |
| Heat haze | on | optional | off |
| Texture size (`textureSize`) | 1024 | 512 | 256 |

### 7.2 Low-tier rules

1. **No bloom, so emissives must carry themselves.** Every light gets a glow sprite (§4.5). Emissive colours are chosen so that, with intensity above 1, they clip toward a saturated bright hue rather than white.
2. **No grade, so mood comes from light and fog.** The level's sun colour, hemisphere colours and fog colour do the grading on Low. Check every level on Low with grading off (§8.4).
3. **Shadows.** The bible says Low has no shadows; the architecture gives Low an 80 m shadow box at 1024. Follow the architecture, and rely on the sun gate (§3.4), which gives Low its large-scale shadows for one texture fetch. If a phone can't hold 60 fps, the first thing to cut is the shadow map, not the sun gate.
4. **Point lights.** The bible's L5 note allows four unshadowed flare lights on Low; the architecture has none. Follow the architecture and make flare pools from additive pool decals plus glow sprites. The pool is a gameplay read (Listeners avoid it), and the decal shows it clearly.
5. **Silhouettes win.** At 0.0033 m/px, LOD1 shows from 250 m. LOD1 merges must keep the silhouette: roof clutter, masts and the outline stay; surface detail goes.

### 7.3 Within-tier safety valve (optional)

If the median frame time stays above 20 ms for 3 s, scale effect spawn counts to 0.6 and turn off sun shafts and heat haze, then restore them once it has stayed under 15 ms for 10 s. Never change the tier itself silently (architecture §7.4).

---

## 8. Screenshot self-review checklist

Review every asset gallery and every level at the standard shots (§8.5), on High and on Low, against these lists. Anything that fails goes back. This replaces the architecture's Appendix D and includes all of it.

### 8.1 Every asset

- [ ] **No visible plain boxes or cylinders.** Every edge is bevelled or chamfered, and the bevels catch a highlight at the asset's usual distance (§1.4). Debris chunks count too.
- [ ] **Every structure has bevels and seams.** No face larger than about 4 × 4 m (or a sixth of the object) without a seam, step, rib or greeble.
- [ ] **Three layers or more**: shell, plates, trim and greebles (four with frame on structures over 20 m).
- [ ] **Panel lines are geometry**, not texture, at distances under 100 m.
- [ ] **Silhouette reads at its target distance**: units at 300 m, structures at 500 m, landmarks from every point on the route. Check with the asset filled black against the sky.
- [ ] **It belongs to a faction at a glance** (§1.3): shape family, palette, light colour, wear.
- [ ] **Greebles are clustered** where function puts them, not sprinkled. Busy top edges, calm faces. Three sizes.
- [ ] **Scale cues present** on anything over 20 m: railings, ladders, doors, windows.
- [ ] **Ground contact**: no floating, no hard line at the terrain. A plinth, skirt, drift or rubble.
- [ ] **Wear matches the maker**: bleached and patched (Wake), sooted and streaked (Dredge), frosted and crazed (Founders). Chipped edges where the bevels are.
- [ ] **No flat-colour blocks**: tint jitter visible between panels.
- [ ] **Lights are full assemblies**: housing, lens, glow sprite.
- [ ] **Within budget** (architecture §7.5): draw calls and triangles for LOD0 and LOD1, measured in isolation.
- [ ] **LOD1 keeps the silhouette**, with no popping that changes the outline.
- [ ] **Rocks are faceted**, with flat planes and crisp edges, sunk at least 15%, and there are no smooth lumps.

### 8.2 Every vista

- [ ] **At least three depth planes** (near, mid, skyline), each lighter and less saturated than the one in front of it.
- [ ] **No terrain edge or seam at the horizon.** Fog reaches the sky colour before the far plane. The sky's horizon equals the fog colour.
- [ ] **Distant silhouettes are readable**: ridges, landmarks and skyline objects read as shapes, not as fog-coloured smudges.
- [ ] **The hero landmark is visible** (or deliberately hidden for a reveal).
- [ ] **No visible tiling** on terrain from 5 m to the horizon. Check by looking straight down at 60 m and at 300 m.
- [ ] **Slopes read as rock and flats as ground.** Strata bands roll with the land, cliffs have ledges, talus gathers at their feet.
- [ ] **Big shadows exist**: canyon walls, landmarks and the Dredge cast shadows beyond the shadow-map box (the sun gate is on).
- [ ] **The route bed reads as a worn road**, not as a stripe.
- [ ] **Air glows toward the sun** (inscatter), and shafts appear where light breaks through.
- [ ] **The key light, shadow colour and grade match the level's recipe** (§5.7). Zones are distinct from each other.
- [ ] **Scatter looks natural**: clusters at slope breaks, gullies and cliff bases; power-law sizes; nothing evenly spread.
- [ ] **Weather is visible but doesn't hide the play space.**

### 8.3 Colour and light

- [ ] **Reserved colours hold after grading** (§1.6): cyan is Founders, sodium is Dredge, tungsten is Wake, red is danger. **Pale green appears nowhere except ghost lights.** Check the aurora, lichen and reeds specifically.
- [ ] **Ghost beacons read at 1 km** on High and on Low (at least 3 px, blinking).
- [ ] **Emissives bloom on High and stay readable on Low** (glow sprites).
- [ ] **Nothing is crushed or blown out.** Sunlit mid-grey lands near 0.45; the darkest shadow still has detail; only lights, the sun and glints clip.
- [ ] **No shadow acne or peter-panning on bevels**, no shadow shimmer when the camera moves (texel snapping).
- [ ] **Exposure transitions are smooth** in scripted moments and zone blends.

### 8.4 Effects and tiers

- [ ] **Explosions** have flash, fireball, shockwave and dust ring, sparks, lit smoke, debris, a decal and shake.
- [ ] **Muzzle, tracer and impact effects match the weapon and the surface.** Player fire is warm, enemy fire red-orange.
- [ ] **Smoke has a sunny side** (lit billows); no flat grey sprites.
- [ ] **Decals don't z-fight** at any distance (polygon offset) and conform to the ground.
- [ ] **Low tier, grading off:** each level's mood still reads from its lights and fog alone.
- [ ] **Low tier:** flare pools, lamps and beacons read without bloom; LOD1 silhouettes hold at 250 m.
- [ ] **Tier switch** High → Low → High leaves no visual leftovers (architecture §10.4).
- [ ] **No person is ever visible** (bible §0). People are lit windows, cab lights, painted names and voices.

### 8.5 Standard review shots per level

For every level, capture each of these on High and on Low:

1. The opening vista (the letterboxed landmark shot).
2. The gameplay camera at the start.
3. The gameplay camera facing the sun.
4. The gameplay camera with the sun behind.
5. A free camera at 80 m altitude along the route, looking ahead.
6. A free camera at 2 m from a structure (bevel and seam check).
7. Each zone's entry.
8. The level's signature set piece at its peak.
9. A busy combat moment: 8 units, an explosion, missiles.
10. Straight down at 60 m (terrain tiling check).

---

## Appendix A: Proposed interface additions

All of these are **optional** additions (new exports, optional parameters, optional fields, new registry names), which the architecture allows. Nothing existing is renamed or changes meaning. Owners as in architecture §2.1.

| Owner | File | Addition | Section |
| --- | --- | --- | --- |
| P3 | `art/kit.js` | `kitFinalize`; profiles `rect`, `chamfer`, `round`, `chamferRect`, `taper`, `offset`, `jag`, `notch`, `SECTIONS`, `split` | §2.0, §2.1 |
| P3 | `art/kit.js` | `plateGeo(…, o?: { holes })`; `slab`, `armourPlate`, `ribbedPlate`; `panelBox` defined with real seams | §2.1, §2.2 |
| P3 | `art/kit.js` | `latheHard` and presets (`dome`, `nozzle`, `insulator`, `lampHousing`, `bollard`, `flange`, `ring`, `drum`, `stackTop`) | §2.3 |
| P3 | `art/kit.js` | `pipeRun`, `pipeRack`, `cylinderBetween`; `beam`, `latticeTower`, `gantry`; `truss(…, o?: { pattern, bar })` | §2.4, §2.5 |
| P3 | `art/kit.js` | `panelWall`, `loft`, `tank`, `mast`, `dish`, `whips`, `panelArray`, `choirArray`, `catenary`, `cable`, `awning` | §2.6 to §2.9 |
| P3 | `art/kit.js` | debris kinds, `wreckify`, `ruin`, `rockGeo`, `cliffSkin`, `hoodoo`, `floe`, `pressureRidge`, `icicles`, the greeble library, `greebles(…, o?: { style })` | §2.11 to §2.13 |
| P3 | `art/kit.js` | `GeoBuilder.add(g, m, t, o?: { tint })`; kit geometry carries `color` and `edge` attributes | §2.0 |
| P3 | `art/structures.js` | `params.style` on every generic type; the new types in §2.16 | §2.15, §2.16 |
| P3 | `art/structures.js` | natural-looking man-made props: `tank_cairn`, `body_drum`, `plate_shard` | §2.16, §3.9 |
| P2 | `world/scatter.js` | natural props `talus`, `cliff_skin`, `hoodoo`, `ice_block`, `ice_shard`, `snow_drift`, `glass_shard`, `glass_lump`, `reed_clump`, `frost_tuft` | §3.8, §3.9 |
| P2 | `world/heightfield.js` | the shadow-top bake; a `surf` vertex attribute (flow, sediment, sky AO, route mask); sun no longer multiplied into vertex colour | §3.3, §3.4 |
| P2 | `world/world.js` | `terrainData: { texture, rect }` (RGBA HalfFloat, ClampToEdge, linear filtering), `addShadowCaster(footprint, top)`, `sunVisible(x, y, z)`, `routeRibbon(route, s0, s1, width, kind)` | §3.4, §3.10 |
| P2 | `world/terrain.js` | the terrain material in §3.5 (`TERRAIN_LITE` define on Low) | §3.5 |
| P1 | `render/atmosphere.js` | the sun gate and sun front in `patchMaterial`; ground-fog layer; shaft cards; aurora and dawn rim in the sky | §3.4, §5.2 to §5.4 |
| P1 | `LevelArt` (§6.4 of the architecture) | `palette.snow`, `palette.strata[]`; `sky.dawnRim`, `sky.aurora`; `fog.ground`; `light.keyDir`, `light.shadowMinElevation`, `light.shafts`; `shafts[]`; `sunFront`; `heatHaze`; `surface: { style, rockSlope, strataHeight, strataWarp, strataStrength, snow, snowSlope, wetness, gloss, bump, frost, dust }` | §5.7 |
| P1 | `render/weather.js` | type `'crystals'`; `WeatherParams.color`, `size`, `sparkle`, `layers` | §5.5 |
| P1 | `render/materials.js` | the library names in §4.2; `StdOpts.wearStyle`, `StdOpts.bare`; texture `cracks`; packed-data rules; `FACTIONS`, `MECH_SCHEMES`; `sign()` styles; shared `uniforms` (`uBeat`, `uFrost`, `uDust`, `uPing`) | §4 |
| P1 | `render/particles.js` | `glows.add(target, o) → handle` (instanced glow sprites); `beacons.add(target, o) → handle` (ghost beacons); the 8-cell atlas; lit billows; decal kinds | §4.5, §6.2, §3.10 |
| P1 | `render/fx.js` | impact surfaces `'ice' \| 'snow' \| 'glass' \| 'water' \| 'ceramic'`; emitters `'seepage' \| 'slagfall' \| 'flare' \| 'iceDust'`; `ribbon()` pool (blade, boost, cables); beams `'burn' \| 'burnline' \| 'lance'`; `ping(center)`; mirror and haul glints | §6 |
| P1 | `render/pipeline.js` | sun shafts pass; heat haze; `GradeState.glitch`, `grit`, `frost`; lens dirt; exposure kick | §5.4, §6.10, §6.11 |
| P0 | `core/settings.js` | tier keys `terrainDetail`, plus the ★ rows of §7.1 | §7.1 |
| P5 | `ui/hud.js` | the pilot-vitals trace reads `ctx.materials.uniforms.uBeat` | §4.5 |

---

*End of art direction v1.0. When a level design doc changes a landmark or a light, update §2.17 and §5.7 here first, then build.*
