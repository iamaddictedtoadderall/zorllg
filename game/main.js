// Long Patience — build 0.2: title, opening, Bay C.
// The ship's brain is Claude. Inside a Claude artifact viewer it uses the page's `sample`
// capability (the viewer's own Claude account); anywhere else it asks for an API key
// and calls the Messages API from the browser. Story content is sealed in sealed.js.
import * as THREE from 'three';
import { SEALED } from './sealed.js';
import * as sfx from './audio.js';
import { buildExterior } from './exterior.js';

const STORY = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(SEALED), c => c.charCodeAt(0))));

// ---------- settings (kept in this browser) ----------
const settings = { volume: .8, sens: 1, invert: false, subs: 'm', fx: 'full', key: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('lp-settings') || '{}')); } catch (e) {}
try { settings.key = settings.key || localStorage.getItem('lp-key') || ''; } catch (e) {}
function saveSettings() { try { localStorage.setItem('lp-settings', JSON.stringify(settings)); } catch (e) {} }

// ---------- look (style 1: fog & grain) ----------
const S = {
  bg: 0x0a1214, fog: 0.07, ambient: [0x7fa6a8, 0x18160f, 1.1],
  lamp: 0xbfe4e6, lampPower: 16, glow: 0x7fe0e4, accent: 0xf0a640,
  wall: 0x56686a, metal: 0x3a4648, floor: 0x343c3c,
  scale: 0.8, grain: 0.09, scan: 0.06, vig: 0.55, aberr: 0.0016, tint: [0.96, 1.02, 1.03], lift: 0.012,
};

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
const scene = new THREE.Scene();
const rt = new THREE.WebGLRenderTarget(4, 4);

const post = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: rt.texture }, time: { value: 0 }, res: { value: new THREE.Vector2() },
    grain: { value: S.grain }, scan: { value: S.scan }, vig: { value: S.vig }, aberr: { value: S.aberr },
    tint: { value: new THREE.Vector3(...S.tint) }, lift: { value: S.lift }, dark: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, grain, scan, vig, aberr, lift, dark; uniform vec3 tint;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.13) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * aberr * 4.).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * aberr * 4.).b);
      col = col * tint + lift;
      col *= 1. - scan * (.5 + .5 * sin(vUv.y * res.y * 3.14159));
      col += (h(floor(vUv * res)) - .5) * grain;
      col *= 1. - vig * dot(c, c) * 1.6;
      col *= 1. - dark;
      gl_FragColor = vec4(col, 1.);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  rt.setSize(Math.round(w * S.scale), Math.round(h * S.scale));
  post.uniforms.res.value.set(rt.width, rt.height);
}
addEventListener('resize', resize);

// ---------- world ----------
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grateTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5c5c5c'; for (let i = 0; i < w; i += 8) g.fillRect(i, 0, 3, h);
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, 3);
}, [6, 38]);
const panelTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#a8a8a8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(0, 84, w, 2);
  g.fillStyle = '#bcbcbc'; g.fillRect(10, 96, 34, 6); g.fillRect(10, 106, 20, 4);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#909090'; g.fillRect(70 + i * 8, 12, 4, 60); }
}, [14, 1]);

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .15, flatShading: true, ...o });
const glowM = (c, i = 1.6) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i, flatShading: true });
const wallM = std(S.wall, { map: panelTex }), metalM = std(S.metal, { metalness: .5, roughness: .6 });
const floorM = std(S.floor, { map: grateTex, metalness: .4 });

const LEN = 31, HALF = 3, H = 3.2, BZ = -LEN + 2;   // BZ: bulkhead plane
const pickables = [];                                 // meshes the player can inspect
const lamps = [], strips = [];
let flickerLamp = null, trackingEye = null, door = null, podGlass = null, podLight = null, podReady = false;

function box(w, h, d, mat, x, y, z, item) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  if (item) { m.userData.item = item; pickables.push(m); }
  return m;
}
function add(mesh, item) { scene.add(mesh); if (item) { mesh.userData.item = item; pickables.push(mesh); } return mesh; }

let rnd = 7; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const podId = (k, sx) => 'C-' + String(k * 2 + (sx < 0 ? 1 : 2)).padStart(2, '0');
const PLAYER_POD = 'C-14';
let playerPodPos = null;

function build() {
  scene.background = new THREE.Color(S.bg);
  scene.fog = new THREE.FogExp2(S.bg, S.fog);
  scene.add(new THREE.HemisphereLight(S.ambient[0], S.ambient[1], S.ambient[2]));

  const midZ = (1.5 + BZ - 8) / 2, len = 1.5 - (BZ - 8);
  box(HALF * 2, .1, len, floorM, 0, -.05, midZ);
  box(HALF * 2, .1, len, wallM, 0, H + .05, midZ);
  box(.1, H, len, wallM, -HALF - .05, H / 2, midZ);
  box(.1, H, len, wallM, HALF + .05, H / 2, midZ);
  box(HALF * 2, H, .1, wallM, 0, H / 2, 1.5);
  box(HALF * 2, H, .1, metalM, 0, H / 2, BZ - 8);

  for (const sx of [-1, 1]) for (const dy of [0, .22]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, LEN, 8), metalM);
    p.rotation.x = Math.PI / 2; p.position.set(sx * (HALF - .25 - dy * .6), H - .2 - dy, -LEN / 2 + 1); scene.add(p);
  }

  for (let k = 0; k * 2.5 < LEN - 1; k++) {
    const z = -k * 2.5;
    box(.3, H, .35, metalM, -HALF + .15, H / 2, z); box(.3, H, .35, metalM, HALF - .15, H / 2, z);
    box(HALF * 2, .28, .35, metalM, 0, H - .14, z);

    if (k % 2 === 0 && k < 12) {
      const lm = glowM(S.lamp, 0);
      box(1.4, .05, .32, lm, 0, H - .3, z - 1.25);
      const L = new THREE.PointLight(S.lamp, 0, 9, 1.6);
      L.position.set(0, H - .45, z - 1.25);
      if (k === 6) { L.castShadow = true; L.shadow.mapSize.set(512, 512); }
      scene.add(L);
      const lamp = { L, lm, z: z - 1.25, onAt: Infinity, level: 0 };
      lamps.push(lamp);
      if (k === 2) flickerLamp = lamp;
    }
    for (let j = 0; j < 3; j++) strips.push(box(.08, .02, .4, glowM(S.accent, 0), 0, .015, z - .4 - j * .85));

    if (z - 1.25 < -LEN + 2.5) continue;
    for (const sx of [-1, 1]) {
      const pz = z - 1.25, px = sx * (HALF - .55), id = podId(k, sx);
      const open = id === PLAYER_POD;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(.5, 1.25, 4, 10), metalM), id);
      body.position.set(px + sx * .44, 1.15, pz); body.scale.set(.42, 1, 1.05); body.castShadow = true;
      const back = add(new THREE.Mesh(new THREE.CapsuleGeometry(.36, 1.05, 4, 10), glowM(open ? 0x000000 : S.glow, 1.2 + rand() * .5)), id);
      back.scale.set(.2, 1, .85); back.position.set(px + sx * .26, 1.15, pz);
      const glass = add(new THREE.Mesh(new THREE.CapsuleGeometry(.42, 1.1, 4, 10), new THREE.MeshStandardMaterial({
        color: S.glow, emissive: S.glow, emissiveIntensity: .08, transparent: true, opacity: .1,
        roughness: .15, metalness: .3, flatShading: true, depthWrite: false,
      })), id);
      glass.scale.set(.5, 1, .9);
      if (open) {
        podGlass = { mesh: glass, closed: new THREE.Vector3(px - sx * .2, 1.15, pz), open: new THREE.Vector3(px - sx * .3, 1.15, pz + .6), openRot: sx * 1.1 };
        glass.position.copy(podGlass.open); glass.rotation.y = podGlass.openRot;
        podLight = new THREE.PointLight(S.accent, 2.5, 3, 2); podLight.position.set(px - sx * .1, 1.4, pz); scene.add(podLight);
        playerPodPos = new THREE.Vector3(px, 0, pz);
      } else {
        glass.position.set(px - sx * .2, 1.15, pz);
        const fig = add(new THREE.Mesh(new THREE.CapsuleGeometry(.17, .95, 3, 8), std(0x040506)), id);
        fig.position.set(px - sx * .02, 1.1, pz);
        add(new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), fig.material), id).position.set(px - sx * .02, 1.85, pz);
      }
      const r = rand();
      box(.06, .06, .14, glowM(open ? S.accent : r < .85 ? S.glow : S.accent), px - sx * .32, .32, pz, id);
      box(.9, .12, 1.1, metalM, px, .06, pz, id);
    }
  }

  // a card on the floor by C-07
  const card = box(.1, .012, .15, std(0xd9cfa8, { emissive: 0x3a2c10, emissiveIntensity: .6 }), -1.75, .012, -8.4, 'badge');
  card.rotation.y = .7;

  // bulkhead with doorway, door slides up into the ceiling
  box(HALF - .8, H, .3, metalM, -(HALF + .8) / 2, H / 2, BZ, 'bulkhead');
  box(HALF - .8, H, .3, metalM, (HALF + .8) / 2, H / 2, BZ, 'bulkhead');
  box(1.6, H - 2.3, .3, metalM, 0, 2.3 + (H - 2.3) / 2, BZ, 'bulkhead');
  door = box(1.6, 2.3, .14, std(S.metal, { metalness: .7 }), 0, 1.15, BZ + .05, 'bulkhead');
  door.userData.open = 0;
  door.userData.lamp = box(1.6, .06, .05, glowM(0xd04020), 0, 2.38, BZ + .2);
  box(.3, .4, .06, glowM(S.glow, .5), 1.1, 1.3, BZ + .18, 'bulkhead');

  const eye = (x, y, z) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const housing = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), metalM);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), glowM(S.accent));
    lens.position.z = .13; housing.add(lens); g.add(housing); scene.add(g);
    housing.userData.item = 'eye'; lens.userData.item = 'eye'; pickables.push(housing, lens);
    box(.06, .25, .06, metalM, x, y + .2, z);
    return housing;
  };
  const e1 = eye(0, 2.75, BZ + .35);
  trackingEye = [e1, eye(-HALF + .45, H - .45, -12.4)];
}

// ---------- player & input ----------
const player = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
const keys = {};
let state = 'title';          // title | cutscene | play | paused | ended
let locked = false, dragging = false, reading = null, quietUnlock = false;
const playing = () => state === 'play';
const $ = id => document.getElementById(id);
const talk = $('talk'), talkIn = $('talkIn'), promptEl = $('prompt'), useBtn = $('useBtn');

function lock() { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function unlock() { if (document.pointerLockElement) { quietUnlock = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  // Losing the lock without us asking means the player pressed Esc: pause.
  if (!locked && !quietUnlock && playing() && talk.hidden && !reading) pause();
  if (!locked) quietUnlock = false;
});
renderer.domElement.addEventListener('click', () => { if (playing() && !locked && talk.hidden && !reading) lock(); });
addEventListener('mousedown', e => { if (e.target === renderer.domElement) dragging = true; });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  if (!playing() || reading || (!locked && !dragging)) return;
  look(e.movementX * .0022, e.movementY * .0022);
});

function look(dx, dy) {
  const k = settings.sens;
  player.yaw -= dx * k; player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - dy * k * (settings.invert ? -1 : 1)));
}

addEventListener('keydown', e => {
  if (state === 'cutscene' && ['Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); skipCutscene(); return; }
  if (state === 'paused' && e.code === 'Escape' && $('settings').hidden) { resume(); return; }
  if (!playing()) return;
  if (document.activeElement === talkIn) {
    if (e.key === 'Escape') closeTalk();
    if (e.key === 'Enter') { const q = talkIn.value.trim(); closeTalk(); if (q) playerSays(q); }
    return;
  }
  if (reading) { if (e.code === 'KeyE' || e.key === 'Escape') closeRead(); return; }
  if (e.code === 'Escape') { pause(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyT') { e.preventDefault(); openTalk(); }
  if (e.code === 'KeyE' && looking) inspect(looking);
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

$('talkBtn').addEventListener('click', e => { e.stopPropagation(); if (playing() && !reading) openTalk(); });
useBtn.addEventListener('click', e => { e.stopPropagation(); if (looking) inspect(looking); });
$('read').addEventListener('click', e => { if (e.target === $('read')) closeRead(); });
$('sleepBtn').addEventListener('click', () => startSleep());

// touch: drag to look, hold to walk, tap to inspect
let touch = null, holdTimer = 0;
renderer.domElement.addEventListener('touchstart', e => {
  if (!playing()) return;
  const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 };
  clearTimeout(holdTimer); holdTimer = setTimeout(() => keys.KeyW = true, 300);
}, { passive: true });
renderer.domElement.addEventListener('touchmove', e => {
  const t = e.touches[0]; if (!touch || reading) return;
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch.moved += Math.abs(dx) + Math.abs(dy);
  look(dx * .005, dy * .005);
  touch.x = t.clientX; touch.y = t.clientY;
}, { passive: true });
renderer.domElement.addEventListener('touchend', () => {
  if (touch && touch.moved < 10 && performance.now() - touch.t < 280 && looking && !reading) inspect(looking);
  touch = null; clearTimeout(holdTimer); keys.KeyW = false;
});

function openTalk() { talk.hidden = false; talkIn.value = ''; unlock(); setTimeout(() => talkIn.focus(), 0); }
function closeTalk() { talk.hidden = true; talkIn.blur(); if (playing()) lock(); }

// ---------- inspecting ----------
const read = { seen: new Set() };
let stage = 0;
function itemDoc(id) {
  const it = STORY.items[id];
  if (it) return { ...it, text: it.text.replace('{door}', door.userData.open ? 'OPEN' : 'SEALED') };
  const name = STORY.podNames[id] || 'UNREGISTERED';
  return { title: `POD ${id} · STATUS PANEL`, text: STORY.podGeneric.replace('{name}', name), stage: 0, brief: `Rowan is reading the panel of pod ${id} (${name}).` };
}
function inspect(id) {
  const doc = itemDoc(id);
  reading = id; unlock();
  $('readTitle').textContent = doc.title; $('readText').textContent = doc.text; $('read').hidden = false;
  $('sleepRow').hidden = id !== PLAYER_POD;
  sfx.blip('·');
  const first = !read.seen.has(id); read.seen.add(id);
  if (first && STORY.items[id]) {
    stage = Math.max(stage, doc.stage || 0);
    shipEvent(`[EVENT] ${doc.brief}`);
  }
}
function closeRead() { $('read').hidden = true; reading = null; if (playing()) lock(); }

// ---------- subtitles ----------
let thinking = false, busy = false;
const sub = $('sub');
let speech = Promise.resolve(), typingId = 0;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function say(text, { who = STORY.shipName, cls = '', hold } = {}) {
  speech = speech.then(() => new Promise(res => {
    const id = ++typingId;
    sub.className = 'on ' + cls;
    let i = 0;
    const label = who ? `<b>${esc(who)}</b>` : '';
    const step = () => {
      if (id !== typingId) return res();
      sub.innerHTML = label + esc(text.slice(0, i));
      if (i < text.length) {
        if (who === STORY.shipName) sfx.blip(text[i]);
        i++; setTimeout(step, ',.—?'.includes(text[i - 1]) ? 200 : 32);
      } else setTimeout(() => {
        if (id === typingId) { sub.className = cls; if (thinking) showThinking(true); }
        res();
      }, hold ?? Math.max(2200, text.length * 55));
    };
    step();
  }));
  return speech;
}
function showThinking(on) {
  thinking = on;
  if (on && !sub.classList.contains('on')) { sub.className = 'on'; sub.innerHTML = `<b>${esc(STORY.shipName)}</b>· · ·`; }
}

// ---------- the ship's brain ----------
let brain = null;          // async (turns) => {say, lights, door}
const turns = [];          // alternating user/assistant, starts with user
const queue = [];
const minutesAwake = () => Math.round((performance.now() - wokeAt) / 60000);
let wokeAt = 0, lightsMode = 'off';

function where() {
  const z = player.pos.z;
  if (z < BZ) return 'in the open bulkhead, stepping toward the Spine';
  if (z < BZ + 4) return 'at the bulkhead to the Spine';
  const k = Math.max(0, Math.min(10, Math.round((-z - 1.25) / 2.5)));
  return `in the Bay C corridor beside pods ${podId(k, -1)} and ${podId(k, 1)}`;
}
function context() {
  const seen = [...read.seen].filter(id => STORY.items[id]).map(id => STORY.items[id].title);
  return `[STAGE ${stage}] Rowan has been awake ${minutesAwake()} min, is ${where()}, looking at ${looking ? itemDoc(looking).title : 'the corridor'}. ` +
    `Bulkhead: ${door.userData.open ? 'open' : 'sealed'}. Lights: ${lightsMode}. Pod C-14: ${podReady ? 'ready for sleep' : 'open, idle'}. Rowan has read: ${seen.length ? seen.join('; ') : 'nothing yet'}.`;
}

function pushTurn(role, content) {
  turns.push({ role, content });
  while (turns.length > 30) turns.splice(0, 2);   // drop oldest exchange, keep user-first
}

async function ask(userContent, { quiet = false } = {}) {
  pushTurn('user', userContent);
  if (!brain) { if (!quiet) say('(The ship does not answer. It is not connected.)', { who: '', cls: 'note' }); turns.pop(); return false; }
  busy = true; showThinking(true);
  let reply;
  try { reply = await brain(turns); }
  catch (e) { reply = null; console.warn('ship error', e); handleBrainError(e, quiet); }
  showThinking(false); busy = false;
  if (!reply) { turns.pop(); sub.className = ''; return false; }
  const out = { say: String(reply.say ?? '').trim(), lights: String(reply.lights ?? 'none'), door: String(reply.door ?? 'none'), pod: String(reply.pod ?? 'none') };
  pushTurn('assistant', JSON.stringify(out));
  applyActions(out);
  if (out.say) await say(out.say); else sub.className = '';
  return !!out.say;
}
function handleBrainError(e, quiet) {
  const code = e && e.code;
  if (code === 'not_granted' || code === 'sampling_disabled') { brain = null; say('(You declined to let the ship think. It will stay silent.)', { who: '', cls: 'note' }); }
  else if (code === 'rate_limited') say('(The ship is quiet for now. Try again in a little while.)', { who: '', cls: 'note' });
  else if (!quiet) say('(Static on the speakers. Try again.)', { who: '', cls: 'note' });
}
async function pump() {
  if (busy || !queue.length) return;
  const job = queue.shift();
  await ask(job.content, job);
  pump();
}
function playerSays(text) {
  say(text, { who: 'YOU', cls: 'you', hold: 900 });
  queue.push({ content: `${context()}\n[ROWAN SAYS] "${text}"` }); pump();
}
function shipEvent(text) {
  if (!brain) return;
  queue.push({ content: `${context()}\n${text}\nYou may react briefly, or stay silent with an empty "say".`, quiet: true }); pump();
}

function applyActions({ lights, door: d, pod }) {
  if (pod === 'ready' && !podReady) { podReady = true; sfx.tick(true); looking = null; }
  if (['normal', 'dim', 'dark', 'guide'].includes(lights)) setLights(lights);
  if (d === 'open' && !door.userData.open) { door.userData.open = 1; sfx.clunk(); }
  if (d === 'close' && door.userData.open) { door.userData.open = 0; sfx.clunk(); }
}
function setLights(mode, stagger = false) {
  lightsMode = mode;
  const now = performance.now();
  const order = [...lamps].sort((a, b) => Math.abs(a.z - player.pos.z) - Math.abs(b.z - player.pos.z));
  order.forEach((l, i) => l.onAt = stagger ? now + 600 + i * 450 : Math.min(l.onAt, now));
}

// sample capability (inside a Claude viewer)
async function sampleBrain(sample) {
  return turns => sample.json([{ role: 'user', content: STORY.rules }, ...turns], { modelTier: 'quick', cache: false });
}
// Messages API with the player's own key (anywhere else)
async function apiBrain(key) {
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const schema = {
    type: 'object', additionalProperties: false, required: ['say', 'lights', 'door', 'pod'],
    properties: {
      say: { type: 'string' },
      lights: { type: 'string', enum: ['none', 'normal', 'dim', 'dark', 'guide'] },
      door: { type: 'string', enum: ['none', 'open', 'close'] },
      pod: { type: 'string', enum: ['none', 'ready'] },
    },
  };
  return async turns => {
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: STORY.rules, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: turns,
    });
    if (res.stop_reason === 'refusal') return { say: '', lights: 'none', door: 'none', pod: 'none' };
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return JSON.parse(text);
  };
}

const status = $('status'), keyIn = $('apiKey');
let mode = 'pending';
(async () => {
  let sample = null;
  if (window.claude && typeof window.claude.use === 'function') sample = await window.claude.use('sample').catch(() => null);
  if (sample) { mode = 'sample'; brain = await sampleBrain(sample); status.textContent = 'THE SHIP THINKS WITH YOUR CLAUDE ACCOUNT'; return; }
  mode = 'key';
  document.querySelectorAll('.keyrow').forEach(el => el.hidden = false);
  keyIn.value = settings.key || '';
  status.textContent = settings.key ? 'THE SHIP USES YOUR API KEY' : 'NO API KEY · THE SHIP WILL STAY SILENT (ADD ONE IN SETTINGS)';
})();
async function connectKey() {
  if (mode !== 'key' || !settings.key) return;
  try { brain = await apiBrain(settings.key); } catch (e) { brain = null; status.textContent = 'COULD NOT LOAD THE CLAUDE SDK'; }
}


// ---------- menus ----------
const screens = ['title', 'settings', 'pause', 'end', 'ending'];
let settingsReturn = 'title';
function show(id) { for (const sId of screens) $(sId).hidden = sId !== id; }
function applySettings() {
  sfx.setVolume(settings.volume);
  document.body.classList.remove('subs-s', 'subs-l');
  if (settings.subs !== 'm') document.body.classList.add('subs-' + settings.subs);
  const reduced = settings.fx === 'reduced';
  post.uniforms.grain.value = reduced ? .03 : S.grain;
  post.uniforms.scan.value = reduced ? 0 : S.scan;
  post.uniforms.aberr.value = reduced ? 0 : S.aberr;
}
function openSettings(from) {
  settingsReturn = from;
  $('setVolume').value = Math.round(settings.volume * 100);
  $('setSens').value = Math.round(settings.sens * 100);
  $('setInvert').checked = settings.invert;
  $('setSubs').value = settings.subs; $('setFx').value = settings.fx;
  show('settings'); $('setVolume').focus();
}
$('settingsForm').addEventListener('input', () => {
  settings.volume = $('setVolume').value / 100; settings.sens = $('setSens').value / 100;
  settings.invert = $('setInvert').checked; settings.subs = $('setSubs').value; settings.fx = $('setFx').value;
  applySettings(); saveSettings();
});
keyIn.addEventListener('change', async () => {
  settings.key = keyIn.value.trim(); saveSettings();
  status.textContent = settings.key ? 'THE SHIP USES YOUR API KEY' : 'NO API KEY · THE SHIP WILL STAY SILENT (ADD ONE IN SETTINGS)';
  await connectKey();
});
$('openSettings').onclick = () => openSettings('title');
$('pauseSettings').onclick = () => openSettings('pause');
$('closeSettings').onclick = () => { show(settingsReturn); $(settingsReturn === 'pause' ? 'resume' : 'begin').focus(); };
$('resume').onclick = () => resume();
$('quit').onclick = $('endQuit').onclick = $('endingQuit').onclick = () => location.reload();
document.querySelectorAll('.menu button').forEach(b => {
  b.addEventListener('mouseenter', () => sfx.tick());
  b.addEventListener('click', () => sfx.tick(true));
});
// Browsers only allow sound after the first interaction.
const firstTouch = () => {
  sfx.init(); sfx.setVolume(settings.volume);
  if (state === 'title') sfx.startTitle();
  removeEventListener('pointerdown', firstTouch, true); removeEventListener('keydown', firstTouch, true);
};
addEventListener('pointerdown', firstTouch, true); addEventListener('keydown', firstTouch, true);

function pause() {
  if (state !== 'play') return;
  state = 'paused'; for (const k in keys) keys[k] = false;
  if (!talk.hidden) { talk.hidden = true; talkIn.blur(); }
  $('hud').hidden = true; show('pause'); unlock(); $('resume').focus();
}
function resume() {
  if (state !== 'paused') return;
  state = 'play'; show(null); $('hud').hidden = false; lock();
}

// ---------- opening ----------
const ext = buildExterior();
const cine = { t: 0, card: -1, hud: 0, done: false, heart: false, alarm: false, hissed: false, skipHeld: 0 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOTS = [
  { from: V(78, 24, 88), to: V(46, 12, 66), lookFrom: V(-8, 0, 0), lookTo: V(4, 0, 0), t0: 2.5, t1: 14.2 },
  { from: V(16, 4.2, 7.5), to: V(1, 3, 5), lookFrom: V(-6, 0, 0), lookTo: V(-1.5, .6, 0), t0: 14.2, t1: 25 },
];
const POD_START = 25.6, SEAL = 36, OUT = 37.6, END = 40.8;

function beginGame() {
  state = 'cutscene'; show(null); $('hud').hidden = true;
  $('cine').hidden = false; $('skip').hidden = false;
  $('skip').textContent = matchMedia('(hover: none)').matches ? 'TAP TO SKIP ›' : '[SPACE] SKIP ›';
  sfx.init(); sfx.setVolume(settings.volume); sfx.fadeOut('title', 4); sfx.startVoid();
  podGlass.mesh.position.copy(podGlass.closed); podGlass.mesh.rotation.y = 0;
  lightsMode = 'off';
  Object.assign(cine, { t: 0, card: -1, hud: 0, done: false });
  connectKey();
}
$('begin').onclick = beginGame;
$('skip').onclick = () => skipCutscene();

function skipCutscene() { if (state === 'cutscene') cine.t = Math.max(cine.t, END); }

const ease = k => k * k * (3 - 2 * k);
const clamp01 = k => Math.max(0, Math.min(1, k));
function runCutscene(dt) {
  const t = (cine.t += dt), C = STORY.cutscene;
  const card = $('card');
  const ci = C.cards.findIndex(c => t >= c.at && t < c.until);
  if (ci !== cine.card) {
    cine.card = ci;
    card.className = ci >= 0 ? 'on' + (C.cards[ci].small ? ' small' : '') : (card.className.includes('small') ? 'small' : '');
    if (ci >= 0) card.textContent = C.cards[ci].text;
  }
  // exterior
  if (t < POD_START) {
    const sh = SHOTS.find(s => t < s.t1) || SHOTS.at(-1);
    ext.shot(sh.from, sh.to, sh.lookFrom, sh.lookTo, clamp01((t - sh.t0) / (sh.t1 - sh.t0)));
    let dark = t < 2.5 ? 1 : 1 - clamp01((t - 2.5) / 2.5);
    dark = Math.max(dark, 1 - clamp01(Math.abs(t - 14.2) / .6));             // dip between shots
    dark = Math.max(dark, clamp01((t - 23.6) / 1.6));                          // fade out
    return { scene: 'ext', dark };
  }
  // inside the pod
  if (!cine.heart) { cine.heart = true; sfx.fadeOut('void', 3); sfx.startHeart(); }
  const hud = $('podhud');
  while (cine.hud < C.podHud.length && t >= C.podHud[cine.hud].at) {
    const line = document.createElement('div'); line.textContent = C.podHud[cine.hud++].text; hud.append(line); sfx.blip('x', 980);
  }
  if (t > 31.2 && !cine.alarm) { cine.alarm = true; sfx.startAlarm(); }
  if (t > SEAL && !cine.hissed) { cine.hissed = true; sfx.hiss(); sfx.fadeOut('alarm', .4); sfx.startBay(); hud.style.transition = 'opacity 1s'; hud.style.opacity = 0; }
  podLight.intensity = t < SEAL ? 1.2 + Math.max(0, Math.sin(t * 6)) * 3 : 2.5;

  const g = clamp01((t - SEAL) / 1.6);
  podGlass.mesh.position.lerpVectors(podGlass.closed, podGlass.open, ease(g));
  podGlass.mesh.rotation.y = podGlass.openRot * ease(g);
  $('frost').style.opacity = t < SEAL ? 1 : 1 - g;

  const inside = V(playerPodPos.x - .02, 1.52, playerPodPos.z);
  const standing = V(playerPodPos.x - 1.15, 1.62, playerPodPos.z + .2);
  const m = clamp01((t - OUT) / (END - OUT));
  const me = ease(m);
  camera.position.lerpVectors(inside, standing, me);
  camera.position.y += -Math.sin(m * Math.PI) * .45 + Math.sin(t * 1.4) * .01;   // knees give, then you stand
  const yaw = Math.PI / 2 + (.45 - Math.PI / 2) * me, roll = Math.sin(m * Math.PI * 2.2) * .07 * (1 - m);
  camera.rotation.set(-.04 - Math.sin(m * Math.PI) * .25, yaw, roll, 'YXZ');
  const dark = t < 26.4 ? 1 : t < SEAL ? .55 - clamp01((t - 26.4) / 3) * .25 + Math.sin(t * 2.1) * .03 : .3 * (1 - g);
  if (t >= END) finishCutscene();
  return { scene: 'bay', dark };
}
function finishCutscene() {
  state = 'play';
  $('cine').hidden = true; $('skip').hidden = true; $('hud').hidden = false; $('card').className = '';
  sfx.fadeOut('void', 1); sfx.fadeOut('heart', 2); sfx.fadeOut('alarm', .3); sfx.startBay();
  podGlass.mesh.position.copy(podGlass.open); podGlass.mesh.rotation.y = podGlass.openRot; podLight.intensity = 2.5;
  player.pos.set(playerPodPos.x - 1.15, 0, playerPodPos.z + .2); player.yaw = .45; player.pitch = -.05;
  wokeAt = performance.now();
  lock();
  wake();
}
async function wake() {
  pushTurn('user', STORY.wakeEvent);
  pushTurn('assistant', JSON.stringify({ say: STORY.intro.join(' '), lights: 'normal', door: 'none', pod: 'none' }));
  await new Promise(r => setTimeout(r, 1400));
  await say(STORY.intro[0], { hold: 1200 });
  await say(STORY.intro[1], { hold: 1600 });
  setLights('normal', true);
  await say(STORY.intro[2]);
}

// ---------- going back to sleep ----------
const ending = { t: 0, from: null, fromRot: null, sealAt: null, hud: 0, card: -1, stage: 0, spoken: false };
function startSleep() {
  if (state !== 'play') return;
  closeRead(); unlock();
  state = 'sleeping'; document.body.classList.add('cinematic'); for (const k in keys) keys[k] = false;
  Object.assign(ending, { t: 0, from: camera.position.clone(), fromYaw: player.yaw, fromPitch: player.pitch, sealAt: null, hud: 0, card: -1, stage, spoken: false, sealed: false, faded: false });
  $('podhud').innerHTML = ''; $('podhud').style.opacity = 1; $('podhud').style.transition = '';
  lastWords().then(() => ending.spoken = true);
}
async function lastWords() {
  while (busy) await new Promise(r => setTimeout(r, 200));
  queue.length = 0;
  const E = STORY.ending;
  if (!brain) { await say(E.fallbackLastWords); return; }
  const timeout = new Promise(r => setTimeout(() => r('timeout'), 30000));
  const spoke = await Promise.race([ask(`${context()}\n${E.lastWordsEvent}`, { quiet: true }), timeout]);
  if (spoke !== true) await say(E.fallbackLastWords);
}
function runEnding(dt, t) {
  const e = ending, E = STORY.ending, T = (e.t += dt);
  const inside = V(playerPodPos.x - .02, 1.5, playerPodPos.z);
  const m = ease(clamp01(T / 2.6));
  camera.position.lerpVectors(e.from, inside, m);
  camera.position.y -= Math.sin(m * Math.PI) * .25;
  let yaw = e.fromYaw, target = Math.PI / 2;
  while (target - yaw > Math.PI) yaw += Math.PI * 2;
  while (yaw - target > Math.PI) yaw -= Math.PI * 2;
  camera.rotation.set(e.fromPitch * (1 - m) - .04 * m, yaw + (target - yaw) * m, 0, 'YXZ');
  if (e.sealAt === null) {
    if (e.spoken && T > 2.6) { e.sealAt = T + .8; }
    return 0;
  }
  const s = T - e.sealAt;
  if (s < 0) return 0;
  if (!e.sealed) { e.sealed = true; sfx.hiss(); sfx.fadeOut('bay', 3); sfx.startHeart(48); $('cine').hidden = false; }
  const g = clamp01(s / 1.6);
  podGlass.mesh.position.lerpVectors(podGlass.open, podGlass.closed, ease(g));
  podGlass.mesh.rotation.y = podGlass.openRot * (1 - ease(g));
  $('frost').style.opacity = g;
  const hud = $('podhud');
  while (e.hud < E.podHud.length && s >= E.podHud[e.hud].at) {
    const line = document.createElement('div'); line.textContent = E.podHud[e.hud++].text; hud.append(line); sfx.blip('x', 980);
  }
  if (s > 9.5 && !e.faded) { e.faded = true; hud.style.transition = 'opacity 2s'; hud.style.opacity = 0; sfx.fadeOut('heart', 6); }
  const cards = E.epilogue[String(Math.min(2, e.stage))], card = $('card');
  const ci = s < 12 ? -1 : Math.floor((s - 12) / 6);
  if (ci !== e.card) {
    e.card = ci;
    if (ci >= 0 && ci < cards.length) { card.textContent = cards[ci]; card.className = 'on'; }
    else card.className = '';
    if (ci >= cards.length) {
      $('cine').hidden = true; $('endingTitle').textContent = E.title[String(Math.min(2, e.stage))];
      show('ending'); $('hud').hidden = true; state = 'ended'; $('endingQuit').focus();
    }
  }
  if (ci >= 0 && ci < cards.length && (s - 12) % 6 > 4.6) card.className = '';
  return s < 9.5 ? .2 * g : clamp01(.2 + (s - 9.5) / 2);
}

// ---------- frame ----------
const ray = new THREE.Raycaster();
let looking = null, last = performance.now(), dark = 1;
const doorTop = 2.3 + 1.15;

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  let view = 'bay', wantDark = 0;

  if (state === 'title' || (state === 'settings')) { view = 'ext'; ext.orbit(t); wantDark = 0; }
  else if (state === 'cutscene') { const c = runCutscene(dt); view = c.scene; wantDark = c.dark; dark = wantDark; }
  else if (state === 'sleeping') { wantDark = runEnding(dt, t); dark = wantDark; }
  else if (state === 'play' && !reading) {
    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (fwd || side) {
      const sp = 1.35 * dt, s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      const nx = player.pos.x + (-s * fwd + c * side) * sp, nz = player.pos.z + (-c * fwd - s * side) * sp;
      const passable = door.position.y > 2.8 && Math.abs(nx) <= .55;
      player.pos.z = Math.max(passable ? BZ - 7 : BZ + .55, Math.min(1.1, nz));
      const xr = player.pos.z < BZ + .5 ? .55 : 1.6;
      player.pos.x = Math.max(-xr, Math.min(xr, nx));
    }
    player.bob = (fwd || side) ? Math.sin(t * 7) * .025 : Math.sin(t * 1.3) * .006;
  }
  if (state === 'play' || state === 'paused' || (state === 'ended' && !$('end').hidden)) {
    camera.position.set(player.pos.x, 1.62 + (player.bob || 0), player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }
  if (state === 'title') view = 'ext';
  if (state === 'ended' && !$('ending').hidden) wantDark = 1;

  if (view === 'bay') updateBay(now, t, dt);
  else ext.update(t);

  $('lookhint').hidden = !(playing() && !locked && matchMedia('(hover: hover)').matches && talk.hidden && !reading);
  if (state === 'play' && player.pos.z < BZ - 3) { state = 'ended'; $('hud').hidden = true; show('end'); unlock(); }

  if (state !== 'cutscene') dark += (wantDark - dark) * Math.min(1, dt * 1.5);
  post.uniforms.dark.value = dark; post.uniforms.time.value = t;
  renderer.setRenderTarget(rt);
  if (view === 'ext') renderer.render(ext.scene, ext.camera); else renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}

function updateBay(now, t, dt) {
  const reduced = settings.fx === 'reduced';
  const target = { off: 0, normal: 1, dim: .3, dark: 0, guide: .45 }[lightsMode];
  for (const l of lamps) {
    const want = now > l.onAt ? target : 0;
    l.level += (want - l.level) * Math.min(1, dt * (want > l.level ? 9 : 3));
    let lv = l.level;
    if (!reduced && l === flickerLamp && lv > .1) {
      const n = Math.sin(t * 13) + Math.sin(t * 29.7) + Math.sin(t * 3.1);
      if ((n > 2.1 || thinking) && Math.sin(t * 60) > -.2) lv *= .08;
    }
    if (thinking && lv > .1) lv *= reduced ? .85 : .75 + .25 * Math.sin(t * 9 + l.z);
    l.L.intensity = S.lampPower * lv; l.lm.emissiveIntensity = 1.6 * lv;
  }
  strips.forEach((s, i) => {
    let v = 0;
    if (lightsMode === 'normal') v = 1.4;
    if (lightsMode === 'guide') v = 2.2 * Math.max(0, Math.sin(t * 4 + i * .55));
    s.material.emissiveIntensity += (v - s.material.emissiveIntensity) * Math.min(1, dt * 6);
  });

  if (podReady && state === 'play') { podLight.color.setHex(0x9fe8f0); podLight.intensity = 2.2 + Math.sin(t * 1.6) * 1.2; }
  const dOpen = door.userData.open;
  door.position.y += ((dOpen ? doorTop + .2 : 1.15) - door.position.y) * Math.min(1, dt * 1.6);
  door.userData.lamp.material.emissive.setHex(dOpen ? 0x40d070 : 0xd04020);
  for (const e of trackingEye) e.lookAt(camera.position);

  ray.setFromCamera({ x: 0, y: 0 }, camera); ray.far = 2.1;
  const hit = playing() && !reading ? ray.intersectObjects(pickables, false)[0] : null;
  const next = hit ? hit.object.userData.item : null;
  if (next !== looking) {
    looking = next;
    promptEl.hidden = useBtn.hidden = !looking;
    if (looking) promptEl.textContent = `[E] ${looking === 'eye' ? 'CAMERA' : looking === 'badge' ? 'CARD' : looking === 'bulkhead' ? 'BULKHEAD' : 'POD ' + looking}${looking === PLAYER_POD ? ' · YOUR POD' : ''}`;
  }
}

// ---------- start ----------
function resizeAll() { resize(); ext.camera.aspect = innerWidth / innerHeight; ext.camera.updateProjectionMatrix(); }
addEventListener('resize', resizeAll);
build(); resizeAll(); applySettings();
player.pos.set(playerPodPos.x - 1.15, 0, playerPodPos.z + .2);
$('hud').hidden = true; show('title'); $('begin').focus();
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  window.__lp = { player, inspect, turns, get stage() { return stage; }, get state() { return state; }, skipCutscene, get cineT() { return cine.t; }, set cineT(v) { cine.t = v; }, ending };
}
