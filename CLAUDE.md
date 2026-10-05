# Long Patience

A first-person walking sim in the browser (Three.js). The player wakes early on a colony ark and can talk to the ship's AI at any time; the AI is played live by Claude.

## The user is the player — no spoilers

The person working on this repo intends to play the game blind.

- Story content (the ship's hidden instructions, item texts, names) lives sealed in `game/sealed.js`. Edit it with `python3 tools/seal.py unseal` → edit `story/.unsealed.json` (gitignored) → `python3 tools/seal.py seal`.
- Never quote, summarise or hint at sealed content in chat, commit messages, PR text, code comments or file names. Don't print it in command output either. Talk about systems, feel, art and tech only.
- If a question can't be answered without spoilers, say so and ask before answering.

## Layout

- `game/index.html` – page, HUD, styles. `game/main.js` – world, input, subtitles, the ship's brain. `game/sealed.js` – sealed story.
- `mockups/` – the original look tests (style 1, "fog & grain", was chosen).
- The ship's brain: inside a claude.ai artifact it uses the page's `sample` capability; anywhere else it asks for an API key and calls the Messages API from the browser.

## Running

`python3 -m http.server` from the repo root, then open `http://localhost:8000/game/`. Module scripts don't load from `file://`. Add `?debug` to expose `window.__lp` for scripted tests.

## Publishing as an artifact

Strip the document wrapper (`<!doctype>`, `<html>`, `<head>`, `<body>`, the two metas) from `game/index.html` into a scratch copy, and publish it with `files: {"main.js": "game/main.js", "sealed.js": "game/sealed.js"}` and `capabilities: {sample: {}}`.
