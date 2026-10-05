// Long Patience — build 0.4: title, opening, Bay C, the Spine, crew quarters; journal, evidence, thaw.
// The ship's brain is Claude. Inside a Claude artifact viewer it uses the page's `sample`
// capability (the viewer's own Claude account); anywhere else it asks for an API key
// and calls the Messages API from the browser. Story content is sealed in sealed.js.
import * as THREE from 'three';
import { SEALED } from './sealed.js';
import * as sfx from './audio.js';
import { buildExterior } from './exterior.js';

const STORY = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(SEALED), c => c.charCodeAt(0))));

// ---------- settings (kept in this browser) ----------
const settings = { volume: .8, sens: 1, invert: false, subs: 'm', fx: 'full', key: '', mind: 'quick' };
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
const lamps = [], strips = [], backs = [], eyes = [], doorList = [];
let heater = null;
let flickerLamp = null, door = null, qdoor = null, podGlass = null, podLight = null, podReady = false;

// Walkable floor as rectangles; doorways are only walkable while their door is open.
const walk = [], blocks = [];
const rect = (x0, x1, z0, z1, gate) => ({ x0, x1, z0, z1, gate });
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const canStand = (x, z) => walk.some(r => (!r.gate || r.gate()) && inside(r, x, z)) && !blocks.some(r => inside(r, x, z));
const isOpen = d => d.position.y > d.userData.closedY + 1.6;

function addLamp(x, y, z, { w = 1.4, d = .32, dist = 9, power = 1, shadow = false } = {}) {
  const lm = glowM(S.lamp, 0);
  box(w, .05, d, lm, x, y + .15, z);
  const L = new THREE.PointLight(S.lamp, 0, dist, 1.6);
  L.position.set(x, y, z);
  if (shadow) { L.castShadow = true; L.shadow.mapSize.set(512, 512); }
  scene.add(L);
  const lamp = { L, lm, x, z, power, onAt: Infinity, level: 0 };
  lamps.push(lamp);
  return lamp;
}
function makeDoor(w, h, x, z, item, rotY = 0) {
  const d = box(w, h, .14, std(S.metal, { metalness: .7 }), x, h / 2, z, item);
  d.rotation.y = rotY;
  d.userData = { item, open: 0, closedY: h / 2, moveAt: 0, lamp: box(w * .8, .04, .04, glowM(0xd04020, .9), x, h + .08, z) };
  d.userData.lamp.rotation.y = rotY;
  doorList.push(d);
  return d;
}
// Stencilled wall sign; text drawn to a canvas.
function sign(text, x, y, z, rotY, { w = 2.4, h = .32, color = '#c9d8d6', size = 54 } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = color; g.font = `600 ${size}px "IBM Plex Mono", monospace`; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .35, roughness: 1 }));
  m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  return m;
}

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

  const midZ = (1.5 + BZ) / 2, len = 1.5 - BZ;
  box(HALF * 2, .1, len, floorM, 0, -.05, midZ);
  box(HALF * 2, .1, len, wallM, 0, H + .05, midZ);
  box(.1, H, len, wallM, -HALF - .05, H / 2, midZ);
  box(.1, H, len, wallM, HALF + .05, H / 2, midZ);
  box(HALF * 2, H, .1, wallM, 0, H / 2, 1.5);

  for (const sx of [-1, 1]) for (const dy of [0, .22]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, LEN, 8), metalM);
    p.rotation.x = Math.PI / 2; p.position.set(sx * (HALF - .25 - dy * .6), H - .2 - dy, -LEN / 2 + 1); scene.add(p);
  }

  for (let k = 0; k * 2.5 < LEN - 1; k++) {
    const z = -k * 2.5;
    box(.3, H, .35, metalM, -HALF + .15, H / 2, z); box(.3, H, .35, metalM, HALF - .15, H / 2, z);
    box(HALF * 2, .28, .35, metalM, 0, H - .14, z);

    if (k % 2 === 0 && k < 12) {
      const lamp = addLamp(0, H - .45, z - 1.25, { shadow: k === 6 });
      if (k === 2) flickerLamp = lamp;
    }
    for (let j = 0; j < 3; j++) strips.push(box(.08, .02, .4, glowM(S.accent, 0), 0, .015, z - .4 - j * .85));

    if (z - 1.25 < -LEN + 2.5 || z - 1.25 < BZ) continue;
    for (const sx of [-1, 1]) {
      const pz = z - 1.25, px = sx * (HALF - .55), id = podId(k, sx);
      const open = id === PLAYER_POD;
      const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(.5, 1.25, 4, 10), metalM), id);
      body.position.set(px + sx * .44, 1.15, pz); body.scale.set(.42, 1, 1.05); body.castShadow = true;
      const back = add(new THREE.Mesh(new THREE.CapsuleGeometry(.36, 1.05, 4, 10), glowM(open ? 0x000000 : S.glow, 1.2 + rand() * .5)), id);
      back.scale.set(.2, 1, .85); back.position.set(px + sx * .26, 1.15, pz);
      if (!open) { back.userData.base = back.material.emissiveIntensity; back.userData.phase = rand() * 6.28; backs.push(back); }
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
  door = makeDoor(1.6, 2.3, 0, BZ + .05, 'bulkhead');
  door.userData.lamp.position.z = BZ + .2;
  box(.3, .4, .06, glowM(S.glow, .5), 1.1, 1.3, BZ + .18, 'bulkhead');

  eye(0, 2.75, BZ + .35);
  eye(-HALF + .45, H - .45, -12.4);
  // emergency cabinet on the wall near the bulkhead
  box(.22, .7, .55, std(0x7a3a30, { metalness: .4 }), -HALF + .12, 1.25, BZ + 2.4, 'c_cabinet');
  box(.03, .1, .4, glowM(0xf0f0e0, .6), -HALF + .24, 1.52, BZ + 2.4, 'c_cabinet');

  buildSpine();
  buildQuarters();
  buildDust();

  walk.push(rect(-1.6, 1.6, BZ + .55, 1.1));                                  // Bay C
  walk.push(rect(-.55, .55, BZ - .7, BZ + .6, () => isOpen(door)));            // bulkhead doorway
  walk.push(rect(-.95, .95, SZ + 2.1, BZ - .3));                               // connector
  walk.push(rect(-13.4, 45.4, SZ - 2.1, SZ + 2.1));                            // Spine
  walk.push(rect(QX - .45, QX + .45, SZ - 3.2, SZ - 1.8, () => isOpen(qdoor))); // quarters doorway
  walk.push(rect(QX - 3.6, QX + 3.6, SZ - 9.1, SZ - 2.9));                     // quarters
}

// Ceiling camera: housing turns to follow the player; the lens glows when the ship speaks.
function eye(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const housing = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), metalM);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), glowM(S.accent));
  lens.position.z = .13; housing.add(lens); g.add(housing); scene.add(g);
  housing.userData.item = 'eye'; lens.userData.item = 'eye'; pickables.push(housing, lens);
  box(.06, .25, .06, metalM, x, y + .2, z);
  const e = { housing, lens, pos: new THREE.Vector3(x, y, z), stare: 0, cool: 0, area: areaOf(x, z) };
  eyes.push(e);
  return e;
}

// ---------- the Spine: the ship's main corridor, running along x ----------
const SZ = -37.5, SH = 4.4, SX0 = -14, SX1 = 46, QX = 18;   // Spine centre z, height, ends; quarters door x
function buildSpine() {
  const len = SX1 - SX0, mid = (SX0 + SX1) / 2;
  const sFloor = std(S.floor, { map: grateTex.clone(), metalness: .4 }); sFloor.map.repeat.set(len / 1.6, 3); sFloor.map.needsUpdate = true;
  const sWall = std(S.wall, { map: panelTex.clone() }); sWall.map.repeat.set(len / 2.2, 1.4); sWall.map.needsUpdate = true;
  box(len, .1, 5, sFloor, mid, -.05, SZ);
  box(len, .1, 5, sWall, mid, SH + .05, SZ);
  // connector from Bay C's bulkhead into the Spine
  const cz0 = BZ - .15, cz1 = SZ + 2.5, clen = cz0 - cz1, cmid = (cz0 + cz1) / 2;
  box(2.7, .1, clen, floorM, 0, -.05, cmid); box(2.7, .1, clen, wallM, 0, 2.85, cmid);
  box(.1, 2.9, clen, wallM, -1.35, 1.45, cmid); box(.1, 2.9, clen, wallM, 1.35, 1.45, cmid);
  // near wall (z = SZ + 2.5) with the connector opening, far wall with the quarters opening
  const nz = SZ + 2.55, fz = SZ - 2.55;
  box(-1.35 - SX0, SH, .1, sWall, (SX0 - 1.35) / 2, SH / 2, nz); box(SX1 - 1.35, SH, .1, sWall, (SX1 + 1.35) / 2, SH / 2, nz);
  box(2.7, SH - 2.9, .1, sWall, 0, 2.9 + (SH - 2.9) / 2, nz);
  box(QX - .8 - SX0, SH, .1, sWall, (SX0 + QX - .8) / 2, SH / 2, fz); box(SX1 - QX - .8, SH, .1, sWall, (SX1 + QX + .8) / 2, SH / 2, fz);
  box(1.6, SH - 2.3, .1, sWall, QX, 2.3 + (SH - 2.3) / 2, fz);
  // ribs and conduits
  for (let x = SX0 + 2; x < SX1; x += 4) {
    box(.4, SH, .35, metalM, x, SH / 2, nz - .2); box(.4, SH, .35, metalM, x, SH / 2, fz + .2);
    box(.4, .35, 5, metalM, x, SH - .17, SZ);
    box(.4, .5, .5, metalM, x, SH - .5, nz - .45).rotation.x = .78; box(.4, .5, .5, metalM, x, SH - .5, fz + .45).rotation.x = -.78;
  }
  for (const [y, z, r] of [[SH - .35, SZ + 1.4, .16], [SH - .35, SZ + 1.05, .1], [SH - .35, SZ - 1.3, .2], [.25, SZ - 2.2, .12]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), metalM);
    p.rotation.z = Math.PI / 2; p.position.set(mid, y, z); scene.add(p);
  }
  for (let x = SX0 + 6; x < SX1 - 2; x += 10) addLamp(x, SH - .55, SZ, { w: 2.2, d: .4, dist: 16, power: 1.35 });
  // running lights along the foot of both walls
  for (let x = SX0 + 1; x < SX1 - 1; x += 1.5) {
    if (Math.abs(x) > 1.6) box(.7, .05, .04, glowM(S.glow, .55), x, .12, nz - .07);
    if (Math.abs(x - QX) > 1) box(.7, .05, .04, glowM(S.glow, .55), x, .12, fz + .07);
  }
  // ends: Bay B pressure door (west), Archive core vault door (east)
  box(.1, SH, 5, metalM, SX0, SH / 2, SZ, 'spine_west');
  const bb = box(.14, 2.6, 2.2, std(S.metal, { metalness: .7 }), SX0 + .1, 1.3, SZ, 'spine_west');
  box(.05, .06, 2.2, glowM(0xd04020), SX0 + .2, 2.7, SZ);
  box(.1, SH, 5, metalM, SX1, SH / 2, SZ, 'spine_east');
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, .3, 24), std(0x5a6468, { metalness: .6 }));
  vault.rotation.z = Math.PI / 2; vault.position.set(SX1 - .2, 2, SZ); add(vault, 'spine_east');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.72, .05, 6, 40), glowM(S.accent, 1.2));
  ring.rotation.y = Math.PI / 2; ring.position.set(SX1 - .36, 2, SZ); scene.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    box(.12, .3, .3, metalM, SX1 - .4, 2 + Math.sin(a) * 1.3, SZ + Math.cos(a) * 1.3, 'spine_east');
  }
  // signage
  sign('BAY C', 0, 3.25, nz - .07, Math.PI, { w: 1.4, h: .32 });
  sign('◀ BAY B', -6, 3.0, fz + .07, 0, { w: 2.2 });
  sign('QUARTERS · ARCHIVE ▶', 6, 3.0, fz + .07, 0, { w: 3.8 });
  sign('CREW QUARTERS', QX, 2.75, fz + .07, 0, { w: 2.6 });
  sign('ARCHIVE CORE', SX1 - .08, 4.05, SZ + 1.3, -Math.PI / 2, { w: 2.6, color: '#e8b45a' });
  sign('BAY B', SX0 + .08, 3.1, SZ + .6, Math.PI / 2, { w: 1.4 });
  sign('SPINE · FRAME 112', 10, 1.2, nz - .07, Math.PI, { w: 2.8, h: .3, size: 46 });
  eye(1.8, SH - .5, SZ + 1.8);
  eye(30, SH - .5, SZ - 1.8);
}

// ---------- crew quarters: a room off the Spine's far wall ----------
const QZ0 = SZ - 2.6, QZ1 = SZ - 9.6, QH = 2.6;
function buildQuarters() {
  const qlen = QZ0 - QZ1, qmid = (QZ0 + QZ1) / 2;
  const qFloor = std(0x2e3434, { roughness: .9 });
  box(8, .1, qlen, qFloor, QX, -.05, qmid); box(8, .1, qlen, wallM, QX, QH + .05, qmid);
  box(.1, QH, qlen, wallM, QX - 4, QH / 2, qmid); box(.1, QH, qlen, wallM, QX + 4, QH / 2, qmid);
  box(8, QH, .1, wallM, QX, QH / 2, QZ1);
  qdoor = makeDoor(1.6, 2.3, QX, SZ - 2.45, 'q_door');
  qdoor.userData.lamp.position.z = SZ - 2.36;
  // bunks: frame, mattress, a small wall terminal above each
  const bunk = (x, z, n) => {
    const side = x < QX ? -1 : 1;
    box(1.0, .42, 2.0, metalM, x, .21, z, 'q_bunk' + n);
    box(.92, .14, 1.9, std(0x8c9290, { roughness: 1 }), x, .49, z, 'q_bunk' + n);
    box(.5, .1, .35, std(0x9ca2a0, { roughness: 1 }), x, .6, z + .7, 'q_bunk' + n);
    box(.05, .32, .46, glowM(S.glow, .7), x + side * .48, 1.35, z - .2, 'q_term' + n);
    blocks.push(rect(x - .85, x + .85, z - 1.35, z + 1.35));
  };
  bunk(QX - 3.45, QZ0 - 1.9, 1); bunk(QX - 3.45, QZ0 - 5.1, 2);
  bunk(QX + 3.45, QZ0 - 1.9, 3); bunk(QX + 3.45, QZ0 - 5.1, 4);
  // lockers, table, the floor plate
  const lockerIds = ['q_cupboard', 'q_cloth', null, 'q_locker'];
  for (let i = 0; i < 4; i++) box(.7, 2, .5, std(0x4c5658, { metalness: .5 }), QX - 1.4 + i * .8 - 1, 1, QZ1 + .3, lockerIds[i]);
  heater = box(.9, .35, .06, glowM(0xff6a20, .9), QX + 2.4, .32, QZ1 + .08, 'q_heater');
  box(.4, .3, .05, glowM(S.glow, .7), QX, 1.4, QZ1 + .57, 'q_locker');
  const tz = qmid - .4;
  box(1.4, .06, .9, metalM, QX, .78, tz); box(.08, .75, .08, metalM, QX, .38, tz);
  for (const dx of [-.35, .3]) add(new THREE.Mesh(new THREE.CylinderGeometry(.045, .04, .1, 8), std(0xa8a49a))).position.set(QX + dx, .86, tz + .1);
  blocks.push(rect(QX - 1.05, QX + 1.05, tz - .8, tz + .8));
  box(1.1, .012, 1.1, std(0x8a9496, { metalness: .8, roughness: .25 }), QX + .4, .007, QZ0 - 2.2, 'q_plate');
  addLamp(QX, QH - .2, qmid, { w: 1, d: .5, dist: 8, power: .7 });
  eye(QX + 3.5, QH - .3, QZ1 + .4);
}

// ---------- dust drifting through the light ----------
let dust = null;
function buildDust() {
  const N = 1400, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const inSpine = i % 2;
    pos.set(inSpine ? [SX0 + Math.random() * (SX1 - SX0), Math.random() * SH, SZ + (Math.random() - .5) * 4.8]
                    : [(Math.random() - .5) * 5.6, Math.random() * H, 1 - Math.random() * (1 - BZ)], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe4e6, size: .022, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.userData.seed = seed;
  scene.add(dust);
}
function updateDust(t, dt) {
  const p = dust.geometry.attributes.position, a = p.array, seed = dust.userData.seed;
  for (let i = 0; i < seed.length; i++) {
    const k = seed[i];
    a[i * 3] += Math.sin(t * .13 + k) * dt * .03;
    a[i * 3 + 1] -= dt * (.012 + (k % 1) * .01);
    a[i * 3 + 2] += Math.cos(t * .11 + k * 1.3) * dt * .03;
    if (a[i * 3 + 1] < 0) a[i * 3 + 1] = i % 2 ? SH : H;
  }
  p.needsUpdate = true;
}

// ---------- player & input ----------
const player = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
const keys = {};
let state = 'title';          // title | cutscene | play | paused | ended
let locked = false, dragging = false, reading = null, quietUnlock = false;
const playing = () => state === 'play';
const $ = id => document.getElementById(id);
const talk = $('talkWrap'), talkIn = $('talkIn'), promptEl = $('prompt'), useBtn = $('useBtn');

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
    if (e.key === 'Tab') { e.preventDefault(); cycleShowing(e.shiftKey ? -1 : 1); }
    if (e.key === 'Enter') {
      const q = talkIn.value.trim(), shown = showingId; closeTalk();
      if (q || shown) playerSays(q, shown);
    }
    return;
  }
  if (!$('journal').hidden) { if (e.code === 'KeyJ' || e.key === 'Escape') closeJournal(); return; }
  if (reading) { if (e.code === 'KeyE' || e.key === 'Escape') closeRead(); return; }
  if (e.code === 'Escape') { pause(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyT') { e.preventDefault(); openTalk(); }
  if (e.code === 'KeyJ') { e.preventDefault(); openJournal(); }
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

function openTalk() { talk.hidden = false; talkIn.value = ''; setShowing(null); $('pick').hidden = true; unlock(); setTimeout(() => talkIn.focus(), 0); }
function closeTalk() { talk.hidden = true; $('pick').hidden = true; talkIn.blur(); if (playing()) lock(); }

// ---------- journal & presenting evidence ----------
const journal = [], presented = new Set(), carried = new Set(), used = new Set();
let showingId = null, journalSel = null;
function toast(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600);
}
function setShowing(id) {
  showingId = id;
  $('showing').hidden = !id;
  if (id) $('showingText').textContent = 'SHOWING · ' + STORY.items[id].title;
}
function cycleShowing(dir) {
  if (!journal.length) { toast('NOTHING IN YOUR JOURNAL YET'); return; }
  const i = showingId ? journal.indexOf(showingId) : -1;
  const n = i + dir;
  setShowing(n < 0 || n >= journal.length ? null : journal[n]);
}
$('unshow').addEventListener('click', () => { setShowing(null); talkIn.focus(); });
$('showBtn').addEventListener('click', () => {
  const pick = $('pick');
  if (!pick.hidden) { pick.hidden = true; talkIn.focus(); return; }
  pick.innerHTML = '';
  if (!journal.length) { toast('NOTHING IN YOUR JOURNAL YET'); return; }
  for (const id of journal) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = STORY.items[id].title;
    b.onclick = () => { setShowing(id); pick.hidden = true; talkIn.focus(); };
    pick.append(b);
  }
  pick.hidden = false;
});
function openJournal() {
  if (!playing() || reading) return;
  unlock(); renderJournal(); $('journal').hidden = false;
}
function closeJournal() { $('journal').hidden = true; if (playing()) lock(); }
$('journal').addEventListener('click', e => { if (e.target === $('journal')) closeJournal(); });
$('journalBtn').addEventListener('click', e => { e.stopPropagation(); if (playing()) openJournal(); });
function renderJournal() {
  const list = $('jlist'); list.innerHTML = '';
  const section = (label, ids) => {
    if (!ids.length) return;
    const h = document.createElement('li'); h.className = 'sect'; h.textContent = label; list.append(h);
    for (const id of ids) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = STORY.items[id].title; if (presented.has(id)) b.className = 'shown';
      b.setAttribute('aria-current', String(id === journalSel));
      b.onclick = () => { journalSel = id; renderJournal(); };
      li.append(b); list.append(li);
    }
  };
  section('READ', journal);
  section('CARRIED', [...carried]);
  const v = $('jview');
  if (journalSel) v.innerHTML = `<h3>${esc(STORY.items[journalSel].title)}</h3><pre>${esc(itemDoc(journalSel).text)}</pre>`;
}
// Cameras that could see Rowan right now (refined into view cones later).
const canSeeRowan = () => eyes.some(e => e.area === areaOf(player.pos.x, player.pos.z) && e.pos.distanceTo(camera.position) < 22);

// ---------- inspecting ----------
const read = { seen: new Set() };
let stage = 0;
function itemDoc(id) {
  const it = STORY.items[id];
  if (it) return { ...it, text: it.text.replace('{door}', door.userData.open ? 'OPEN' : 'SEALED').replace('{qdoor}', qdoor.userData.open ? 'OPEN' : 'SEALED') };
  const name = STORY.podNames[id] || 'UNREGISTERED';
  return { title: `POD ${id} · STATUS PANEL`, text: STORY.podGeneric.replace('{name}', name), stage: 0, brief: `Rowan is reading the panel of pod ${id} (${name}).` };
}
function inspect(id) {
  const doc = itemDoc(id);
  reading = id; unlock();
  $('readTitle').textContent = doc.title; $('readText').textContent = doc.text; $('read').hidden = false;
  $('sleepRow').hidden = id !== PLAYER_POD;
  const it = STORY.items[id];
  $('actRow').hidden = !(it && it.action && !used.has(id));
  if (!$('actRow').hidden) $('actBtn').textContent = it.actionLabel;
  sfx.blip('·');
  if (it && it.journal && !journal.includes(id)) { journal.push(id); journalSel = id; toast('ADDED TO JOURNAL · [J]'); }
  const first = !read.seen.has(id); read.seen.add(id);
  if (first && it) {
    if (canSeeRowan()) stage = Math.max(stage, doc.stage || 0);
    shipEvent(`[EVENT] ${it.seenBrief || doc.brief}`);
  }
}
$('actBtn').addEventListener('click', () => {
  const id = reading, it = STORY.items[id];
  if (!it || used.has(id)) return;
  used.add(id); closeRead();
  if (it.action === 'eat') { thaw.ate++; thaw.weak = Math.max(0, thaw.weak - .45); sfx.eat(); toast('YOU EAT. WARMTH SPREADS SLOWLY'); }
  if (it.action === 'take') { carried.add(id); sfx.tick(true); toast('TAKEN · IN YOUR JOURNAL UNDER CARRIED'); }
  if (it.actBrief) shipEvent(`[EVENT] ${it.actBrief}`);
});
function closeRead() { $('read').hidden = true; reading = null; if (playing()) lock(); }

// ---------- subtitles ----------
let thinking = false, busy = false, lastActivity = 0, speakingUntil = 0;
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
      lastActivity = performance.now();
      if (i < text.length) {
        if (who === STORY.shipName) { sfx.blip(text[i]); speakingUntil = performance.now() + 140; }
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

function areaOf(x, z) {
  if (z > BZ) return 'bay';
  if (z > SZ + 2.3) return 'connector';
  if (z > SZ - 2.6) return 'spine';
  return 'quarters';
}
function where() {
  const x = player.pos.x, z = player.pos.z, a = areaOf(x, z);
  if (a === 'quarters') return 'inside the Shift 9 crew quarters';
  if (a === 'spine') {
    if (x < SX0 + 5) return 'in the Spine, at the sealed pressure door to Bay B';
    if (x > SX1 - 6) return 'in the Spine, at the Archive core door';
    if (Math.abs(x - QX) < 3) return 'in the Spine, outside the crew quarters door';
    return `in the Spine, ${x < QX ? 'between the Bay C junction and the crew quarters' : 'between the crew quarters and the Archive core'}`;
  }
  if (a === 'connector') return 'in the short passage between the Bay C bulkhead and the Spine';
  if (z < BZ + 4) return 'at the bulkhead to the Spine';
  const k = Math.max(0, Math.min(10, Math.round((-z - 1.25) / 2.5)));
  return `in the Bay C corridor beside pods ${podId(k, -1)} and ${podId(k, 1)}`;
}
function context() {
  const seen = [...read.seen].filter(id => STORY.items[id]).map(id => STORY.items[id].title);
  return `[STAGE ${stage}] Rowan has been awake ${minutesAwake()} min, is ${where()}, looking at ${looking ? itemDoc(looking).title : 'the corridor'}. ` +
    `Bulkhead: ${door.userData.open ? 'open' : 'sealed'}. Quarters door: ${qdoor.userData.open ? 'open' : 'sealed'}. Lights: ${lightsMode}. Pod C-14: ${podReady ? 'ready for sleep' : 'open, idle'}. Rowan has read: ${seen.length ? seen.join('; ') : 'nothing yet'}. ` +
    `Rowan has shown you: ${presented.size ? [...presented].map(i => STORY.items[i].title).join('; ') : 'nothing yet'}.` +
    (thaw.weak > .05 ? ` Rowan is still weak from the thaw (strength about ${Math.round((1 - thaw.weak) * 100)}%).` : '');
}

function pushTurn(role, content) {
  turns.push({ role, content });
  while (turns.length > 30) turns.splice(0, 2);   // drop oldest exchange, keep user-first
}

async function ask(userContent, { quiet = false } = {}) {
  pushTurn('user', userContent);
  if (!brain) { if (!quiet) say('(The ship does not answer. It is not connected.)', { who: '', cls: 'note' }); turns.pop(); return false; }
  busy = true; if (!quiet) showThinking(true);   // the ship only visibly 'thinks' when spoken to
  let reply;
  try { reply = await brain(turns); }
  catch (e) { reply = null; console.warn('ship error', e); handleBrainError(e, quiet); }
  showThinking(false); busy = false;
  if (!reply) { turns.pop(); if (!quiet) sub.className = ''; return false; }
  const out = { say: String(reply.say ?? '').trim(), lights: String(reply.lights ?? 'none'), door: String(reply.door ?? 'none'), quarters: String(reply.quarters ?? 'none'), pod: String(reply.pod ?? 'none') };
  pushTurn('assistant', JSON.stringify(out));
  applyActions(out);
  if (!out.say && !quiet) out.say = '…';            // spoken to but silent: make the silence deliberate
  if (out.say) await say(out.say); else if (!thinking) sub.className = '';
  return !!out.say && out.say !== '…';
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
function playerSays(text, showId) {
  let shown = '';
  if (showId) {
    const it = STORY.items[showId];
    if (!canSeeRowan()) { say("(There's no camera here to show it to.)", { who: '', cls: 'note', hold: 1800 }); if (!text) return; }
    else {
      presented.add(showId);
      stage = Math.max(stage, it.presentStage ?? it.stage ?? 0);
      shown = `[ROWAN SHOWS YOU] ${it.title}. ${it.brief}\n`;
    }
  }
  say((shown ? `[shows ${STORY.items[showId].title}] ` : '') + (text || ''), { who: 'YOU', cls: 'you', hold: 900 });
  queue.push({ content: `${context()}\n${shown}[ROWAN SAYS] ${text ? `"${text}"` : '(nothing; Rowan just holds it up to your camera and waits)'}` }); pump();
}
function shipEvent(text) {
  if (!brain) return;
  queue.push({ content: `${context()}\n${text}\nYou may react briefly, or stay silent with an empty "say".`, quiet: true }); pump();
}

function moveDoor(dr, want) {
  const open = want === 'open' ? 1 : want === 'close' ? 0 : dr.userData.open;
  if (open === dr.userData.open) return;
  dr.userData.open = open; dr.userData.moveAt = performance.now() + 450;
  sfx.clunk(); setTimeout(() => sfx.servo(1.8, !!open), 350);
}
function applyActions({ lights, door: d, quarters, pod }) {
  if (pod === 'ready' && !podReady) { podReady = true; sfx.tick(true); looking = null; }
  if (['normal', 'dim', 'dark', 'guide'].includes(lights)) setLights(lights);
  moveDoor(door, d); moveDoor(qdoor, quarters);
}
function setLights(mode, stagger = false) {
  lightsMode = mode;
  const now = performance.now();
  const order = [...lamps].sort((a, b) => Math.abs(a.z - player.pos.z) - Math.abs(b.z - player.pos.z));
  order.forEach((l, i) => l.onAt = stagger ? now + 600 + i * 450 : Math.min(l.onAt, now));
}

// sample capability (inside a Claude viewer)
async function sampleBrain(sample) {
  return turns => sample.json([{ role: 'user', content: STORY.rules }, ...turns], { modelTier: settings.mind === 'deep' ? 'default' : 'quick', cache: false });
}
// Messages API with the player's own key (anywhere else)
async function apiBrain(key) {
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const schema = {
    type: 'object', additionalProperties: false, required: ['say', 'lights', 'door', 'quarters', 'pod'],
    properties: {
      say: { type: 'string' },
      lights: { type: 'string', enum: ['none', 'normal', 'dim', 'dark', 'guide'] },
      door: { type: 'string', enum: ['none', 'open', 'close'] },
      quarters: { type: 'string', enum: ['none', 'open', 'close'] },
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
      output_config: { effort: settings.mind === 'deep' ? 'medium' : 'low', format: { type: 'json_schema', schema } },
      messages: turns,
    });
    if (res.stop_reason === 'refusal') return { say: '', lights: 'none', door: 'none', quarters: 'none', pod: 'none' };
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
  $('setSubs').value = settings.subs; $('setFx').value = settings.fx; $('setMind').value = settings.mind;
  show('settings'); $('setVolume').focus();
}
$('settingsForm').addEventListener('input', () => {
  settings.volume = $('setVolume').value / 100; settings.sens = $('setSens').value / 100;
  settings.invert = $('setInvert').checked; settings.subs = $('setSubs').value; settings.fx = $('setFx').value; settings.mind = $('setMind').value;
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
$('resume').onclick = $('keepExploring').onclick = () => resume();
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
  pushTurn('assistant', JSON.stringify({ say: STORY.intro.join(' '), lights: 'normal', door: 'none', quarters: 'none', pod: 'none' }));
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
  const cards = E.epilogue[String(Math.min(3, e.stage))], card = $('card');
  const ci = s < 12 ? -1 : Math.floor((s - 12) / 6);
  if (ci !== e.card) {
    e.card = ci;
    if (ci >= 0 && ci < cards.length) { card.textContent = cards[ci]; card.className = 'on'; }
    else card.className = '';
    if (ci >= cards.length) {
      $('cine').hidden = true; $('endingTitle').textContent = E.title[String(Math.min(3, e.stage))];
      show('ending'); $('hud').hidden = true; state = 'ended'; $('endingQuit').focus();
    }
  }
  if (ci >= 0 && ci < cards.length && (s - 12) % 6 > 4.6) card.className = '';
  return s < 9.5 ? .2 * g : clamp01(.2 + (s - 9.5) / 2);
}

// ---------- weakness after the thaw ----------
const thaw = { weak: 1, ate: 0, nextStumble: 0, stumbleT: -1, nextBreath: 0, stumbled: false, warmNoted: false };
const breathTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(230,240,240,.9)'); r.addColorStop(1, 'rgba(230,240,240,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];
function breathe(now) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: breathTex, transparent: true, opacity: .22, depthWrite: false }));
  camera.getWorldDirection(fwdV);
  sp.position.copy(camera.position).addScaledVector(fwdV, .32); sp.position.y -= .12;
  sp.scale.setScalar(.08); sp.userData = { born: now, v: fwdV.clone().multiplyScalar(.12) };
  scene.add(sp); puffs.push(sp); sfx.breath(thaw.weak);
}
function updateThaw(now, dt, moving) {
  const nearHeat = area === 'quarters' && heater.position.distanceTo(camera.position) < 2.2;
  const rate = nearHeat ? 1 / 45 : thaw.ate ? 1 / 300 : 1 / 600;
  thaw.weak = Math.max(0, thaw.weak - dt * rate);
  if (nearHeat && !thaw.warmNoted) { thaw.warmNoted = true; toast('WARMTH'); }
  // stumbles while walking
  if (!thaw.nextStumble) thaw.nextStumble = now + 20000;
  if (moving && thaw.weak > .35 && now > thaw.nextStumble && thaw.stumbleT < 0) {
    thaw.stumbleT = 0; thaw.nextStumble = now + (16000 + Math.random() * 20000) / thaw.weak;
    sfx.step(true); sfx.breath(1);
    if (!thaw.stumbled) { thaw.stumbled = true; shipEvent('[EVENT] Rowan\'s legs just gave way for a moment; they caught themselves. They are still weak from the thaw.'); }
  }
  // breath clouds while cold
  if (thaw.weak > .12 && now > thaw.nextBreath) { thaw.nextBreath = now + 3200 + Math.random() * 1800; breathe(now); }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i], age = (now - p.userData.born) / 1000;
    p.position.addScaledVector(p.userData.v, dt); p.position.y += dt * .05;
    p.scale.setScalar(.08 + age * .35); p.material.opacity = Math.max(0, .22 * (1 - age / 1.8));
    if (age > 1.8) { scene.remove(p); p.material.dispose(); puffs.splice(i, 1); }
  }
  $('chill').style.opacity = (thaw.weak * .9).toFixed(3);
  post.uniforms.tint.value.set(S.tint[0] * (1 - .07 * thaw.weak), S.tint[1] * (1 - .02 * thaw.weak), S.tint[2] * (1 + .08 * thaw.weak));
}

// ---------- things the ship notices ----------
const fwdV = new THREE.Vector3(), toEye = new THREE.Vector3();
function worldEvents(now, dt) {
  const a = areaOf(player.pos.x, player.pos.z);
  if (a !== area) {
    area = a; sfx.setRoom(a === 'connector' ? 'spine' : a);
    if (!visited.has(a)) { visited.add(a); if (a !== 'connector') shipEvent(`[EVENT] Rowan has just entered ${a === 'spine' ? 'the Spine' : 'the Shift 9 crew quarters'} for the first time.`); }
  }
  const once = (key, cond, text) => { if (!notes.has(key) && cond) { notes.add(key); shipEvent(text); } };
  once('bulkhead', area === 'bay' && player.pos.z < BZ + 3 && !door.userData.open, '[EVENT] Rowan is standing at the sealed bulkhead, looking at it.');
  once('qdoor', area === 'spine' && Math.abs(player.pos.x - QX) < 2.2 && !qdoor.userData.open, '[EVENT] Rowan has stopped outside the sealed crew quarters door.');
  once('west', area === 'spine' && player.pos.x < SX0 + 4, '[EVENT] Rowan has walked to the sealed Bay B pressure door.');

  // the end of what's built so far
  if (!notes.has('buildEnd') && area === 'spine' && player.pos.x > SX1 - 4) {
    notes.add('buildEnd');
    shipEvent('[EVENT] Rowan has reached the Archive core door.');
    setTimeout(() => { if (state === 'play') { state = 'paused'; $('hud').hidden = true; show('end'); unlock(); $('keepExploring').focus(); } }, 4500);
  }

  // long silences
  if (brain && !busy && !queue.length && lastActivity && now - lastActivity > idleAfter && idleCount < 5) {
    idleCount++; idleAfter *= 1.6; lastActivity = now;
    shipEvent(`[EVENT] Rowan has not spoken for about ${Math.round(idleAfter / 1.6 / 60000)} minutes and is ${where()}.`);
  }

  // staring into a camera
  camera.getWorldDirection(fwdV);
  for (const e of eyes) {
    toEye.copy(e.pos).sub(camera.position);
    const d = toEye.length();
    const on = d < 14 && fwdV.dot(toEye.normalize()) > .996;
    e.stare = on ? e.stare + dt : Math.max(0, e.stare - dt * 2);
    if (e.stare > 2.4 && now > e.cool) {
      e.cool = now + 150000; e.stare = 0;
      shipEvent('[EVENT] Rowan is standing still, staring straight into one of your cameras.');
    }
  }

  // the hull settling
  if (!nextCreak) nextCreak = now + 15000;
  if (now > nextCreak) { nextCreak = now + 14000 + Math.random() * 30000; Math.random() < .7 ? sfx.creak() : sfx.clank(); }
}

// ---------- frame ----------
const ray = new THREE.Raycaster();
let looking = null, last = performance.now(), dark = 1;
let stepDist = 0, stepAlt = false, area = 'bay', nextCreak = 0, idleAfter = 150000, idleCount = 0;
const visited = new Set(['bay']), notes = new Set();

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  let view = 'bay', wantDark = 0;

  if (state === 'title' || (state === 'settings')) { view = 'ext'; ext.orbit(t); wantDark = 0; }
  else if (state === 'cutscene') { const c = runCutscene(dt); view = c.scene; wantDark = c.dark; dark = wantDark; }
  else if (state === 'sleeping') { wantDark = runEnding(dt, t); dark = wantDark; }
  else if (state === 'play' && !reading && $('journal').hidden) {
    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (fwd || side) {
      const sp = (thaw.stumbleT >= 0 ? .15 : 1.35 * (1 - .45 * thaw.weak)) * dt, s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      const px = player.pos.x, pz = player.pos.z;
      const nx = px + (-s * fwd + c * side) * sp, nz = pz + (-c * fwd - s * side) * sp;
      if (canStand(nx, nz)) player.pos.set(nx, 0, nz);
      else if (canStand(nx, pz)) player.pos.x = nx;
      else if (canStand(px, nz)) player.pos.z = nz;
      stepDist += Math.hypot(player.pos.x - px, player.pos.z - pz);
      if (stepDist > .72) { stepDist = 0; stepAlt = !stepAlt; sfx.step(stepAlt, area === 'quarters'); }
    }
    player.bob = (fwd || side) ? Math.sin(t * (7 - 2 * thaw.weak)) * (.025 + .02 * thaw.weak) : Math.sin(t * 1.3) * (.006 + .01 * thaw.weak);
    updateThaw(now, dt, !!(fwd || side));
  }
  if (state === 'play' || state === 'paused' || (state === 'ended' && !$('end').hidden)) {
    let dip = 0, tilt = 0;
    if (thaw.stumbleT >= 0) {
      thaw.stumbleT += dt; const k = Math.min(1, thaw.stumbleT / .7);
      dip = Math.sin(k * Math.PI) * .22; tilt = Math.sin(k * Math.PI) * .09;
      if (thaw.stumbleT > .7) thaw.stumbleT = -1;
    }
    camera.position.set(player.pos.x, 1.62 + (player.bob || 0) - dip, player.pos.z);
    camera.rotation.set(player.pitch - dip * .6, player.yaw, tilt, 'YXZ');
    if (dip) wantDark = Math.max(wantDark, dip * 1.1);
  }
  if (state === 'title') view = 'ext';
  if (state === 'ended' && !$('ending').hidden) wantDark = 1;

  if (view === 'bay') updateBay(now, t, dt);
  else ext.update(t);

  $('lookhint').hidden = !(playing() && !locked && matchMedia('(hover: hover)').matches && talk.hidden && !reading);
  if (state === 'play') worldEvents(now, dt);

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
    l.L.intensity = S.lampPower * l.power * lv; l.lm.emissiveIntensity = 1.6 * lv;
  }
  strips.forEach((s, i) => {
    let v = 0;
    if (lightsMode === 'normal') v = 1.4;
    if (lightsMode === 'guide') v = 2.2 * Math.max(0, Math.sin(t * 4 + i * .55));
    s.material.emissiveIntensity += (v - s.material.emissiveIntensity) * Math.min(1, dt * 6);
  });

  if (podReady && state === 'play') { podLight.color.setHex(0x9fe8f0); podLight.intensity = 2.2 + Math.sin(t * 1.6) * 1.2; }
  for (const d of doorList) {
    const u = d.userData, target = u.open ? u.closedY * 3 + .2 : u.closedY;
    if (now > u.moveAt) d.position.y += (target - d.position.y) * Math.min(1, dt * 1.6);
    const moving = Math.abs(target - d.position.y) > .03 || now <= u.moveAt;
    u.lamp.material.emissive.setHex(moving ? ((t * 4) % 1 < .5 ? 0xf0a640 : 0x000000) : u.open ? 0x40d070 : 0xd04020);
  }
  const talking = now < speakingUntil;
  for (const e of eyes) {
    e.housing.lookAt(camera.position);
    e.lens.material.emissiveIntensity = talking ? 2.6 + Math.random() * 1.4 : thinking ? 1.2 + Math.sin(t * 8) * .6 : 1.6;
  }
  for (const b of backs) b.material.emissiveIntensity = b.userData.base * (.8 + .2 * Math.sin(t * .45 + b.userData.phase));
  updateDust(t, dt);

  ray.setFromCamera({ x: 0, y: 0 }, camera); ray.far = 2.1;
  const hit = playing() && !reading ? ray.intersectObjects(pickables, false)[0] : null;
  const next = hit ? hit.object.userData.item : null;
  if (next !== looking) {
    looking = next;
    promptEl.hidden = useBtn.hidden = !looking;
    if (looking) promptEl.textContent = `[E] ${STORY.items[looking]?.label || (looking === 'eye' ? 'CAMERA' : 'POD ' + looking)}${looking === PLAYER_POD ? ' · YOUR POD' : ''}`;
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
  window.__lp = { player, inspect, turns, get stage() { return stage; }, get state() { return state; }, skipCutscene, get cineT() { return cine.t; }, set cineT(v) { cine.t = v; }, ending, get area() { return area; }, notes, eyes, thaw, journal, presented, get showing() { return showingId; } };
}
