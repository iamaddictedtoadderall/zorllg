// Spectator mode: a second Claude plays as Rowan. It only sees what Rowan sees (what is nearby,
// what it has read, what PATIENCE says) and chooses one action at a time; this module walks it
// there along a waypoint graph and carries the action out through the same functions a player uses.

const RULES = `You are playing "Long Patience", a slow first-person exploration game, as Rowan Ide, a sleeper who has woken early on a colony ark. Play like a curious, thoughtful human player who wants to understand what is going on. PATIENCE, the ship's mind, talks to you through its speakers; you can talk to it, question it, argue with it, and hold things from your journal up to its cameras. Explore, read what you find, notice contradictions, and follow the mystery. Pace yourself like a person would: look around, read, talk, think. Going back to sleep ends the playthrough, so only do it if you have truly decided to.

Each turn choose ONE action and reply with only a JSON object:
{"thought": "<one short sentence for the spectator: what you are thinking or why>", "action": "go|inspect|say|act|sleep|wait", "target": "<place id for go, thing id for inspect>", "text": "<what you say aloud to PATIENCE, for say>", "show": "<journal id to hold up while you speak, or empty>", "notes": "<your updated private notes, at most 500 characters: what you have learned, open questions, plans>"}

- go: walk somewhere from PLACES, to explore.
- inspect: walk to a thing and look at it or read it. Use an id from THINGS.
- say: speak to PATIENCE; it hears you anywhere. Ask it to open doors, turn up lights and so on. Add "show" to hold up a journal entry, if a camera is nearby.
- act: use the thing you just inspected, if it offers something (eat, take). Leave target empty.
- sleep: lie down in your own pod (C-14) and go back to sleep. This ends the game.
- wait: stand still for a moment and listen.
Say things the way Rowan would say them out loud: short, natural, in the first person.
Doors between areas are controlled by PATIENCE: if a way onward is closed, ask it to open that door (name the door you mean). If something you try does not work, try something different rather than repeating it.`;

export function createAgent(api) {
  const { THREE } = api;
  const me = { active: false, thought: '', notes: '', recent: [], path: null, goal: null, mode: 'idle', until: 0, stuck: 0, lastPos: null, busyThinking: false, fwd: 0, failures: 0 };
  const V = (x, z) => new THREE.Vector2(x, z);
  const recent = s => { me.recent.push(s); if (me.recent.length > 16) me.recent.shift(); };

  // ---------- navigation ----------
  function clear(a, b, openAll) {
    const d = a.distanceTo(b), n = Math.max(1, Math.ceil(d / .2));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!api.canStand(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, openAll)) return false;
    }
    return true;
  }
  function findPath(from, to, openAll = false) {
    if (clear(from, to, openAll)) return [to];
    const pts = [from, ...api.nodes.map(n => V(n.x, n.z)), to], N = pts.length;
    const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === N - 1) break;
      done[u] = true;
      for (let v = 0; v < N; v++) {
        if (done[v] || v === u) continue;
        const d = pts[u].distanceTo(pts[v]);
        if (d > 9 || dist[u] + d >= dist[v] || !clear(pts[u], pts[v], openAll)) continue;
        dist[v] = dist[u] + d; prev[v] = u;
      }
    }
    if (dist[N - 1] === Infinity) return null;
    const out = [];
    for (let v = N - 1; v > 0; v = prev[v]) out.unshift(pts[v]);
    return out;
  }
  // Somewhere to stand within reach of a thing, preferring spots close to the player.
  function standPoint(center) {
    const p = V(api.player.pos.x, api.player.pos.z);
    let best = null, bestD = Infinity;
    for (const r of [.85, 1.15, 1.5, 1.9]) {
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, c = V(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r);
        if (!api.canStand(c.x, c.y, true)) continue;
        const d = c.distanceTo(p) + r * 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------- what Rowan can see and knows ----------
  function observation() {
    const p = api.player.pos, things = api.things();
    const lines = things.map(t => `${t.id} · ${t.label} · ${t.area}${t.read ? ' · read' : ''} · ${t.center.distanceTo(new THREE.Vector3(p.x, 1.4, p.z)).toFixed(0)}m`);
    return `${RULES}

NOW
Where you are: ${api.where()}.
Your body: strength about ${api.strength()}%.
Doors: ${api.doors()}.
PLACES you can head for (id · where):
${api.places().map(pl => `${pl.id} · ${pl.label}`).join('\n')}
THINGS you know about (id · what · where · distance):
${lines.join('\n')}
Journal: ${api.journal().map(id => `${id} (${api.title(id)})`).join('; ') || 'empty'}.
Carried: ${api.carried().join(', ') || 'nothing'}.
${api.reading() ? `You are looking at ${api.reading()} right now${api.canAct() ? `; it offers: ${api.actLabel()}` : ''}.` : ''}
RECENTLY (oldest first):
${me.recent.join('\n') || '(you have just woken up)'}
YOUR NOTES: ${me.notes || '(none yet)'}`;
  }

  // ---------- acting ----------
  async function decide() {
    me.busyThinking = true; api.onThought(me.thought ? me.thought + ' …' : 'Thinking…');
    let d = null;
    try { d = await api.think(observation()); }
    catch (e) { recent('(you lost your train of thought)'); api.log('agent_error', { code: e && e.code, message: String(e && e.message || e).slice(0, 200) }); }
    me.busyThinking = false;
    if (!me.active) return;
    if (!d || typeof d !== 'object') { me.mode = 'wait'; me.until = performance.now() + 4000; return; }
    me.thought = String(d.thought || '').slice(0, 160); api.onThought(me.thought);
    if (typeof d.notes === 'string') me.notes = d.notes.slice(0, 600);
    const action = String(d.action || 'wait'), target = String(d.target || ''), text = String(d.text || '').slice(0, 240), show = String(d.show || '');
    api.log('agent', { thought: me.thought, action, target, text, show });
    const key = action + ':' + target;
    me.repeats = key === me.lastKey && action !== 'wait' && action !== 'say' ? (me.repeats || 0) + 1 : 0; me.lastKey = key;
    if (me.repeats >= 2) recent(`(You have chosen "${action}${target ? ' ' + target : ''}" ${me.repeats + 1} times in a row and nothing new happened. Do something different.)`);
    if (action !== 'act' && api.reading()) api.closeRead();
    if (action === 'inspect') return goInspect(target);
    if (action === 'go') return goPlace(target);
    if (action === 'say') {
      if (api.reading()) api.closeRead();
      const ok = show && api.journal().includes(show) ? show : null;
      if (!text && !ok) { me.mode = 'wait'; me.until = performance.now() + 2000; return; }
      recent(`You said: "${text}"${ok ? ` (holding up ${api.title(ok)})` : ''}`);
      api.say(text, ok);
      me.mode = 'listen'; me.until = performance.now() + 1200; return;
    }
    if (action === 'act') {
      // allow naming the thing, if it is within reach
      if (!api.reading() && target) {
        const t = api.things().find(x => x.id === target);
        if (t && Math.hypot(t.center.x - api.player.pos.x, t.center.z - api.player.pos.z) < 2.8) api.inspect(target);
      }
      if (api.canAct()) { recent(`You ${api.actLabel().toLowerCase()}.`); api.act(); }
      else recent(api.reading() ? '(this thing offers nothing to use, or you already used it)' : '(you are not looking at anything you can use; inspect it first)');
      if (api.reading()) api.closeRead();
      me.mode = 'wait'; me.until = performance.now() + 1500; return;
    }
    if (action === 'sleep') {
      const pod = api.things().find(t => t.id === api.playerPod);
      if (pod && api.player.pos.distanceTo(new THREE.Vector3(pod.center.x, 0, pod.center.z)) > 2.2) return goInspect(api.playerPod, true);
      api.sleep(); stop(); return;
    }
    me.mode = 'wait'; me.until = performance.now() + 5000;
  }
  function goInspect(id, thenSleep = false) {
    if (api.reading()) api.closeRead();
    const t = api.things().find(x => x.id === id);
    if (!t) { recent(`(you don't know of anything called "${id}")`); me.mode = 'wait'; me.until = performance.now() + 1000; return; }
    const spot = standPoint(t.center);
    const from = V(api.player.pos.x, api.player.pos.z);
    const path = spot && findPath(from, spot);
    if (!path) {
      const viaDoor = spot && findPath(from, spot, true);
      recent(viaDoor ? `You couldn't get to ${t.label}: a closed door is in the way.` : `You couldn't find a way to ${t.label}.`);
      me.mode = 'wait'; me.until = performance.now() + 1000; return;
    }
    me.path = path; me.goal = { id, center: t.center, label: t.label, thenSleep }; me.mode = 'walk'; me.stuck = 0; me.lastPos = from;
  }
  function goPlace(id) {
    if (api.reading()) api.closeRead();
    const pl = api.places().find(x => x.id === id);
    if (!pl) { recent(`(there is no place called "${id}" you can head for; use an id from PLACES)`); me.mode = 'wait'; me.until = performance.now() + 1000; return; }
    if (Math.hypot(pl.x - api.player.pos.x, pl.z - api.player.pos.z) < 1.6) { recent(`(You are already at ${pl.label}.)`); me.mode = 'wait'; me.until = performance.now() + 800; return; }
    const from = V(api.player.pos.x, api.player.pos.z), to = V(pl.x, pl.z);
    const path = findPath(from, to);
    if (!path) { recent(`You couldn't get to ${pl.label}: ${findPath(from, to, true) ? 'a closed door is in the way' : 'there is no way through'}.`); me.mode = 'wait'; me.until = performance.now() + 1000; return; }
    me.path = path; me.goal = { place: true, label: pl.label }; me.mode = 'walk'; me.stuck = 0; me.lastPos = from;
  }
  function arrive() {
    if (me.goal && me.goal.place) { recent(`You walked to ${me.goal.label}. You are now ${api.where()}.`); me.path = null; me.goal = null; me.fwd = 0; me.mode = 'idle'; me.until = performance.now() + 800; return; }
    const g = me.goal; me.path = null; me.goal = null; me.fwd = 0;
    face(g.center, 1);
    if (g.thenSleep) { api.sleep(); stop(); return; }
    api.inspect(g.id);
    const doc = api.doc(g.id);
    recent(`You looked at ${g.label}: ${doc.title}\n${doc.text}`.slice(0, 900));
    me.mode = 'read'; me.until = performance.now() + Math.min(9000, Math.max(3500, doc.text.length * 35));
  }
  function face(c, k) {
    const p = api.player.pos, dx = c.x - p.x, dz = c.z - p.z;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2((c.y ?? 1.4) - 1.62, Math.hypot(dx, dz) || .01);
    let d = yaw - api.player.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    api.player.yaw += d * k; api.player.pitch += (Math.max(-1.2, Math.min(1.2, pitch)) - api.player.pitch) * k;
    return Math.abs(d);
  }

  function update(dt, now) {
    if (!me.active || api.state() !== 'play') { me.fwd = 0; return; }
    if (me.mode === 'walk' && me.path) {
      const next = me.path[0], p = api.player.pos;
      const off = face(new THREE.Vector3(next.x, 1.55, next.y), Math.min(1, dt * 4));
      api.player.pitch *= .9;
      me.fwd = off < .7 ? 1 : 0;
      if (Math.hypot(next.x - p.x, next.y - p.z) < .3) { me.path.shift(); if (!me.path.length) return arrive(); }
      me.stuck += dt;
      if (me.stuck > 1.5) {
        const moved = Math.hypot(p.x - me.lastPos.x, p.z - me.lastPos.y);
        me.stuck = 0; me.lastPos = V(p.x, p.z);
        if (moved < .08) { me.path.shift(); if (!me.path.length) return arrive(); }
      }
      return;
    }
    me.fwd = 0;
    if (me.busyThinking || now < me.until) return;
    if (me.mode === 'read') me.mode = 'idle';   // the panel stays open into the next decision
    if (!api.shipIdle()) return;
    decide();
  }

  function start() { me.active = true; me.mode = 'idle'; me.until = performance.now() + 2500; api.onThought('Waking up…'); }
  function stop() { me.active = false; me.fwd = 0; me.path = null; me.mode = 'idle'; api.onThought(''); }
  // Things PATIENCE or the world says, so the player-Claude can follow the conversation.
  function heard(line) { if (me.active) recent(line); }
  return { start, stop, update, heard, get active() { return me.active; }, get fwd() { return me.fwd; } };
}
