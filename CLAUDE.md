# Long Patience

A first-person walking sim in the browser (Three.js). The player wakes early on a colony ark and can talk to the ship's AI at any time; the AI is played live by Claude.

## The user is the player — no spoilers

The person working on this repo intends to play the game blind.

- Story content (the ship's hidden instructions, item texts, names) lives sealed in `game/sealed.js`. Edit it with `python3 tools/seal.py unseal` → edit `story/.unsealed.json` (gitignored) → `python3 tools/seal.py seal`.
- Never quote, summarise or hint at sealed content in chat, commit messages, PR text, code comments or file names. Don't print it in command output either. Talk about systems, feel, art and tech only.
- If a question can't be answered without spoilers, say so and ask before answering.
- The full story outline (remaining places, beats, endings, what's built vs. to build) is sealed under the `outline` key. Unseal and follow it when building new areas; keep its `status` fields up to date.

## Layout

- `game/index.html` – page, HUD, menus, styles. `game/main.js` – game states (title → cutscene → play ⇄ paused → sleeping/ended), the world (Bay C, connector, Spine, crew quarters; walkable rectangles + door gates for collision), input, settings, opening and sleep sequences, subtitles, things the ship notices (`worldEvents`: area entry, staring at cameras, long silences), the ship's brain. `game/exterior.js` – the ark seen from outside (title backdrop, opening shots). `game/audio.js` – all synthesised sound. `game/sealed.js` – sealed story (includes cutscene text). `game/log.js` – playtest log.
- `DESIGN.md` – spoiler-free systems design (talking, evidence, blind spots, ship systems, drones, environments, thaw) and build order. Where each system meets the story is in the sealed outline under `outline.mechanics`.
- `mockups/` – the original look tests (style 1, "fog & grain", was chosen).
- The ship's brain: inside a claude.ai artifact it uses the page's `sample` capability; anywhere else it asks for an API key and calls the Messages API from the browser.

## Conventions

- Inspectable things use neutral ids in code (`q_term1`, `spine_east`, …); their labels and text live in the sealed file.
- Sealed item fields: `label`, `title`, `text`, `stage` (raised when read in view of a camera), optional `presentStage` (raised only when shown to the ship), `brief` (what the ship learns when shown), `seenBrief` (what it learns from just watching), `journal`, `action` (`eat`/`take`) with `actionLabel` and `actBrief`.
- The ship's JSON reply fields are `say`, `lights`, `door` (Bay C bulkhead), `quarters`, `pod`. Adding a control means updating the sealed rules, `applyActions`, and the API schema in `apiBrain`.

## Running

`python3 -m http.server` from the repo root, then open `http://localhost:8000/game/`. Module scripts don't load from `file://`. Add `?debug` to expose `window.__lp` for scripted tests (state, `skipCutscene()`, settable `cineT`). When screenshotting, inject CSS hiding `#card, #podhud, #read pre, #endingTitle, #jview pre, #jlist button, #showingText, #pick button` so sealed text isn't captured.

## Publishing as an artifact

Strip the document wrapper (`<!doctype>`, `<html>`, `<head>`, `<body>`, the two metas) from `game/index.html` into a scratch copy, and publish it with `files: {"main.js": "game/main.js", "sealed.js": "game/sealed.js", "audio.js": "game/audio.js", "exterior.js": "game/exterior.js", "log.js": "game/log.js"}`. Capabilities are `{sample: {}, db: {rules: [{path: "playtests", read: "owner", write: "owner"}]}}` (omit `capabilities` on a redeploy to keep them).

## Playtest logs

Inside the claude.ai artifact (https://claude.ai/artifact/LSLyhXncAq5KvfULngrREd), each play session writes an owner-only log to the artifact's store: `playtests/<session>` (summary: build, settings, state, stage, area, strength, counts, timestamps) and `playtests/<session>/chunks/<nnnn>` (`events`: `t` seconds since start, `k` kind — start, begin, skip_opening, play, you, ship, event, read, act, area, stage, settings, pause, sleep, ending, build_end, error, jserror). Read them with the ArtifactData tool (`list` on `playtests`, then on `playtests/<session>/chunks`). The logs contain sealed story text (item briefs, the ship's lines): use them to diagnose, and when reporting to the user describe behaviour without quoting or summarising story content.

