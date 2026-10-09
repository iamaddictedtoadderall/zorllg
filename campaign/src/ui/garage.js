// ui/garage.js (P3) — P0 STUB: a hangar scene with lights, a platform and the player's mech; showcase() slowly orbits
// it (title background); open() shows a frame picker (3 buttons) with Confirm and Back inside #screen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMech, animateMech, DESIGNS } from '../art/mechs.js';
import { FRAMES, validate, computeStats, DEFAULT_LOADOUT } from '../combat/loadout.js';
import { cylinder } from '../art/kit.js';
import { esc, clone } from '../core/util.js';

export function install(ctx) {
  const scene = new THREE.Scene();
  scene.name = 'garage';
  scene.background = new THREE.Color(0x14131a);
  scene.fog = new THREE.Fog(0x14131a, 40, 140);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 400);
  const hemi = new THREE.HemisphereLight(0xd8cfc0, 0x1a1612, 1.1);
  const key = new THREE.DirectionalLight(0xffd2a0, 5.5);
  key.position.set(14, 26, 12); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 18, bottom: -4, near: 1, far: 80 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.05;
  const rim = new THREE.DirectionalLight(0x7fa8d0, 3.2);
  rim.position.set(-16, 12, -14);
  scene.add(hemi, key, key.target, rim);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.8, metalness: 0.3 });
  const plat = new THREE.Mesh(cylinder(8.5, 9.5, 0.6, 48), floorMat);
  plat.position.y = -0.3; plat.receiveShadow = true; scene.add(plat);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb36b, emissiveIntensity: 2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.06, 6, 96), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1b1a1f, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; ground.receiveShadow = true; scene.add(ground);
  try {
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();
  } catch (e) { console.warn('[garage] environment', e); }

  let rig = null, t = 0, showcasing = false, resolveOpen = null;
  let working = null;   // loadout being edited

  function schemeOf(lo) {
    const f = FRAMES[lo.frame] || FRAMES.vanguard, pt = lo.paint || DEFAULT_LOADOUT.paint;
    return { design: f.design, base: pt.base, mid: pt.mid, accent: pt.accent, visor: pt.visor, flame: pt.flame, blade: pt.blade };
  }
  function setMech(lo) {
    if (rig) rig.dispose();
    rig = buildMech(ctx, schemeOf(lo), { parts: { R: lo.R, L: lo.L, S: lo.S, U: lo.U } });
    rig.root.rotation.y = Math.PI * 0.85;
    scene.add(rig.root);
  }
  setMech(ctx.save.getLoadout());

  function resize() {
    const w = ctx.canvas.clientWidth || innerWidth, h = ctx.canvas.clientHeight || innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  ctx.events.on('resize', resize);

  function render() {
    const lo = working;
    const st = computeStats(lo);
    ctx.screens?.hide();
    const root = document.getElementById('screen');
    root.className = 'garage'; root.hidden = false;
    root.innerHTML = `<div class="doc garage-doc">
      <div class="hdr"><span>GARAGE</span><span>Load ${st.weight} / ${st.load} · Power ${st.powerDraw} / ${st.power}</span></div>
      <h2>Frame</h2>
      <div class="frames"><span class="lbl">Frame</span>${Object.keys(FRAMES).map(k => `<button type="button" data-frame="${k}" class="${k === lo.frame ? 'on' : ''}">${esc(FRAMES[k].name)}</button>`).join('')}
        <div class="desc">${esc(FRAMES[lo.frame]?.desc || DESIGNS[lo.frame]?.desc || '')}</div></div>
      <div class="fine" id="gErr"></div>
      <div class="actions"><button type="button" class="btn" id="gOk">Confirm</button><button type="button" class="btn ghost" id="gBack">Back</button></div></div>`;
    root.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => {
      ctx.audio?.unlock?.(); ctx.audio?.play?.('uiSelect', null);
      working.frame = b.dataset.frame; setMech(working); render();
    }));
    root.querySelector('#gOk').addEventListener('click', () => {
      const v = validate(working, ctx.save.unlockedParts());
      if (!v.ok) { root.querySelector('#gErr').textContent = v.errors.join(' · '); return; }
      ctx.save.setLoadout(working);
      if (ctx.player?.active) ctx.player.setLoadout(working);
      api.close();
    });
    root.querySelector('#gBack').addEventListener('click', () => { setMech(ctx.save.getLoadout()); api.close(); });
    root.querySelector('#gOk').focus({ preventScroll: true });
  }

  const api = {
    get isOpen() { return !!resolveOpen; },
    scene, camera,
    open(o = {}) {
      if (resolveOpen) api.close();
      working = clone(ctx.save.getLoadout());
      setMech(working);
      ctx.pipeline?.setView(scene, camera);
      return new Promise(res => { resolveOpen = res; render(); });
    },
    close() {
      const r = resolveOpen; resolveOpen = null;
      const root = document.getElementById('screen');
      if (root && root.className === 'garage') { root.innerHTML = ''; root.className = ''; root.hidden = true; }
      if (r) r();
    },
    showcase(on) {
      showcasing = !!on;
      if (on) { const lo = ctx.save.getLoadout(); if (!rig || rig.design !== (FRAMES[lo.frame]?.design)) setMech(lo); }
    },
    update(dt) {
      if (!showcasing && !resolveOpen) return;
      t += dt;
      const r = 26, a = 0.6 + t * 0.12;
      const wide = camera.aspect > 1.2;
      camera.position.set(Math.sin(a) * r, 7.5 + Math.sin(t * 0.3) * 0.8, Math.cos(a) * r);
      // keep the mech right of centre on wide screens (the menu sits on the left)
      const shift = wide ? r * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 0.32 : 0;
      camera.lookAt(-Math.cos(a) * shift, 5.6, Math.sin(a) * shift);
      if (rig) animateMech(rig, { fwd: 0, lat: 0, onGround: true, pitch: -0.15, thrust: 0, hover: 0, landT: 0 }, dt);
    },
  };
  ctx.addSystem({ name: 'garage', phase: 'ui', when: 'always', update: (dt) => api.update(dt) });
  ctx.garage = api;
  return api;
}
