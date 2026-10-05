// Long Patience — build 0.1: Bay C.
// The ship's brain is Claude. Inside a Claude artifact viewer it uses the page's `sample`
// capability (the viewer's own Claude account); anywhere else it asks for an API key
// and calls the Messages API from the browser. Story content is sealed in sealed.js.
import * as THREE from 'three';
import { SEALED } from './sealed.js';

const STORY = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(SEALED), c => c.charCodeAt(0))));

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
let flickerLamp = null, trackingEye = null, door = null;

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
        glass.position.set(px - sx * .3, 1.15, pz + .6); glass.rotation.y = sx * 1.1;
        const L = new THREE.PointLight(S.accent, 2.5, 3, 2); L.position.set(px - sx * .1, 1.4, pz); scene.add(L);
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
let locked = false, started = false, dragging = false, reading = null;
const $ = id => document.getElementById(id);
const talk = $('talk'), talkIn = $('talkIn'), promptEl = $('prompt'), useBtn = $('useBtn');

function lock() { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function unlock() { if (document.exitPointerLock) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => locked = document.pointerLockElement === renderer.domElement);
renderer.domElement.addEventListener('click', () => { if (started && !locked && talk.hidden && !reading) lock(); });
addEventListener('mousedown', e => { if (e.target === renderer.domElement) dragging = true; });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  if (!started || reading || (!locked && !dragging)) return;
  player.yaw -= e.movementX * .0022; player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - e.movementY * .0022));
});

addEventListener('keydown', e => {
  if (!started) return;
  if (document.activeElement === talkIn) {
    if (e.key === 'Escape') closeTalk();
    if (e.key === 'Enter') { const q = talkIn.value.trim(); closeTalk(); if (q) playerSays(q); }
    return;
  }
  if (reading) { if (e.code === 'KeyE' || e.key === 'Escape') closeRead(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyT') { e.preventDefault(); openTalk(); }
  if (e.code === 'KeyE' && looking) inspect(looking);
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

$('talkBtn').addEventListener('click', e => { e.stopPropagation(); if (started && !reading) openTalk(); });
useBtn.addEventListener('click', e => { e.stopPropagation(); if (looking) inspect(looking); });
$('read').addEventListener('click', closeRead);

// touch: drag to look, hold to walk, tap to inspect
let touch = null, holdTimer = 0;
renderer.domElement.addEventListener('touchstart', e => {
  const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 };
  clearTimeout(holdTimer); holdTimer = setTimeout(() => keys.KeyW = true, 300);
}, { passive: true });
renderer.domElement.addEventListener('touchmove', e => {
  const t = e.touches[0]; if (!touch || reading) return;
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch.moved += Math.abs(dx) + Math.abs(dy);
  player.yaw -= dx * .005; player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - dy * .005));
  touch.x = t.clientX; touch.y = t.clientY;
}, { passive: true });
renderer.domElement.addEventListener('touchend', () => {
  if (touch && touch.moved < 10 && performance.now() - touch.t < 280 && looking && !reading) inspect(looking);
  touch = null; clearTimeout(holdTimer); keys.KeyW = false;
});

function openTalk() { talk.hidden = false; talkIn.value = ''; unlock(); setTimeout(() => talkIn.focus(), 0); }
function closeTalk() { talk.hidden = true; talkIn.blur(); lock(); }

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
  blip('·');
  const first = !read.seen.has(id); read.seen.add(id);
  if (first && STORY.items[id]) {
    stage = Math.max(stage, doc.stage || 0);
    shipEvent(`[EVENT] ${doc.brief}`);
  }
}
function closeRead() { $('read').hidden = true; reading = null; lock(); }

// ---------- sound ----------
let ac = null, hum = null;
function audio() {
  if (ac) return;
  ac = new AudioContext();
  hum = ac.createGain(); hum.gain.value = .9; hum.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.connect(hum);
  for (const f of [46, 46.7, 92.3]) {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = .035; o.connect(g); g.connect(lp); o.start();
  }
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < d.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
  const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
  const nl = ac.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 500;
  const ng = ac.createGain(); ng.gain.value = .25; n.connect(nl); nl.connect(ng); ng.connect(hum); n.start();
}
function blip(ch, freq = 540) {
  if (!ac || ch === ' ') return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'sine'; o.frequency.value = freq * (1 + (ch.charCodeAt(0) % 7) * .025);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + .06);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .07);
}
function clunk() {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + .5);
  g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .7);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .8);
}

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
        if (who === STORY.shipName) blip(text[i]);
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
    `Bulkhead: ${door.userData.open ? 'open' : 'sealed'}. Lights: ${lightsMode}. Rowan has read: ${seen.length ? seen.join('; ') : 'nothing yet'}.`;
}

function pushTurn(role, content) {
  turns.push({ role, content });
  while (turns.length > 30) turns.splice(0, 2);   // drop oldest exchange, keep user-first
}

async function ask(userContent, { quiet = false } = {}) {
  pushTurn('user', userContent);
  if (!brain) { if (!quiet) say('(The ship does not answer. It is not connected.)', { who: '', cls: 'note' }); turns.pop(); return; }
  busy = true; showThinking(true);
  let reply;
  try { reply = await brain(turns); }
  catch (e) { reply = null; console.warn('ship error', e); handleBrainError(e, quiet); }
  showThinking(false); busy = false;
  if (!reply) { turns.pop(); sub.className = ''; return; }
  const out = { say: String(reply.say ?? '').trim(), lights: String(reply.lights ?? 'none'), door: String(reply.door ?? 'none') };
  pushTurn('assistant', JSON.stringify(out));
  applyActions(out);
  if (out.say) await say(out.say); else sub.className = '';
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

function applyActions({ lights, door: d }) {
  if (['normal', 'dim', 'dark', 'guide'].includes(lights)) setLights(lights);
  if (d === 'open' && !door.userData.open) { door.userData.open = 1; clunk(); }
  if (d === 'close' && door.userData.open) { door.userData.open = 0; clunk(); }
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
    type: 'object', additionalProperties: false, required: ['say', 'lights', 'door'],
    properties: {
      say: { type: 'string' },
      lights: { type: 'string', enum: ['none', 'normal', 'dim', 'dark', 'guide'] },
      door: { type: 'string', enum: ['none', 'open', 'close'] },
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
    if (res.stop_reason === 'refusal') return { say: '', lights: 'none', door: 'none' };
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return JSON.parse(text);
  };
}

const status = $('status'), keybox = $('keybox'), keyIn = $('apiKey');
let mode = 'pending';
(async () => {
  let sample = null;
  if (window.claude && typeof window.claude.use === 'function') sample = await window.claude.use('sample').catch(() => null);
  if (sample) { mode = 'sample'; brain = await sampleBrain(sample); status.textContent = 'The ship thinks with your Claude account. It will ask permission the first time.'; return; }
  mode = 'key';
  keybox.hidden = false;
  try { keyIn.value = localStorage.getItem('lp-key') || ''; } catch (e) {}
  status.textContent = 'Without a key you can still walk around, but the ship stays silent.';
})();

// ---------- frame ----------
const ray = new THREE.Raycaster();
let looking = null, last = performance.now(), fade = 1, ended = false;
const doorTop = 2.3 + 1.15;

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;

  if (started && !reading) {
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
  camera.position.set(player.pos.x, 1.62 + (player.bob || 0), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  // lights
  const target = { off: 0, normal: 1, dim: .3, dark: 0, guide: .45 }[lightsMode];
  for (const l of lamps) {
    const want = now > l.onAt ? target : 0;
    l.level += (want - l.level) * Math.min(1, dt * (want > l.level ? 9 : 3));
    let lv = l.level;
    if (l === flickerLamp && lv > .1) {
      const n = Math.sin(t * 13) + Math.sin(t * 29.7) + Math.sin(t * 3.1);
      if ((n > 2.1 || thinking) && Math.sin(t * 60) > -.2) lv *= .08;
    }
    if (thinking && lv > .1) lv *= .75 + .25 * Math.sin(t * 9 + l.z);
    l.L.intensity = S.lampPower * lv; l.lm.emissiveIntensity = 1.6 * lv;
  }
  strips.forEach((s, i) => {
    let v = 0;
    if (lightsMode === 'normal') v = 1.4;
    if (lightsMode === 'guide') v = 2.2 * Math.max(0, Math.sin(t * 4 + i * .55));
    s.material.emissiveIntensity += (v - s.material.emissiveIntensity) * Math.min(1, dt * 6);
  });

  // door
  const dOpen = door.userData.open;
  door.position.y += ((dOpen ? doorTop + .2 : 1.15) - door.position.y) * Math.min(1, dt * 1.6);
  door.userData.lamp.material.emissive.setHex(dOpen ? 0x40d070 : 0xd04020);

  for (const e of trackingEye) e.lookAt(camera.position);

  // what are we looking at
  ray.setFromCamera({ x: 0, y: 0 }, camera); ray.far = 2.1;
  const hit = started && !reading ? ray.intersectObjects(pickables, false)[0] : null;
  const next = hit ? hit.object.userData.item : null;
  if (next !== looking) {
    looking = next;
    promptEl.hidden = useBtn.hidden = !looking;
    if (looking) promptEl.textContent = `[E] ${looking === 'eye' ? 'CAMERA' : looking === 'badge' ? 'CARD' : looking === 'bulkhead' ? 'BULKHEAD' : 'POD ' + looking}`;
  }

  if (!ended && player.pos.z < BZ - 3) { ended = true; $('end').hidden = false; unlock(); }

  fade += ((started ? 0 : 1) - fade) * Math.min(1, dt * .8);
  post.uniforms.dark.value = fade; post.uniforms.time.value = t;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}

// ---------- start ----------
build(); resize();
player.pos.set(playerPodPos.x - 1.15, 0, playerPodPos.z + .2);
player.yaw = .45; player.pitch = -.05;   // facing down the corridor toward the bulkhead
requestAnimationFrame(frame);

$('wake').addEventListener('click', async () => {
  if (mode === 'key') {
    const k = keyIn.value.trim();
    if (k) {
      try { localStorage.setItem('lp-key', k); } catch (e) {}
      try { brain = await apiBrain(k); } catch (e) { status.textContent = 'Could not load the Claude SDK. Check your connection.'; return; }
    }
  }
  $('start').hidden = true; started = true; wokeAt = performance.now();
  audio(); lock();
  pushTurn('user', STORY.wakeEvent);
  pushTurn('assistant', JSON.stringify({ say: STORY.intro.join(' '), lights: 'normal', door: 'none' }));
  await new Promise(r => setTimeout(r, 2200));
  await say(STORY.intro[0], { hold: 1200 });
  await say(STORY.intro[1], { hold: 1600 });
  setLights('normal', true);
  await say(STORY.intro[2]);
});

if (new URLSearchParams(location.search).has('debug')) window.__lp = { player, inspect, turns, get stage() { return stage; } };
