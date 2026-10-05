# Long Patience

You wake early on a colony ark. The ship's mind is awake too, and it will talk with you.

A slow first-person walking sim. The ship is played live by Claude, so you can say anything to it.

## Play

```
python3 -m http.server
```

Open `http://localhost:8000/game/`. Outside Claude the ship needs a Claude API key, which stays in your browser.

- WASD to walk, mouse to look
- E to inspect
- T to talk to the ship; while talking, Tab (or SHOW) holds something from your journal up to its camera
- J to open your journal
- Esc to pause
- Touch: drag to look, hold to walk, tap to inspect

Build 0.5: adds Watch Claude Play, where a second Claude plays as Rowan and you spectate (Esc to take over). Watching shows you the story.
