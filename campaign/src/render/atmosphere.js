// render/atmosphere.js (P1) — P0 STUB: complete DEFAULT_ART; apply() sets a flat horizon background, FogExp2,
// hemi + sun (follows the focus, no snapping) + rim lights, sunDir from azimuth/elevation, tone mapping, and a
// cheap gradient PMREM environment. set() applies instantly. patchMaterial() returns its input.
import * as THREE from 'three';
import { deepMerge, DEG } from '../core/util.js';

/** Default level art (every LevelArt field). Prototype "cinder basin" look, converted to r170 light units. */
export const DEFAULT_ART = {
  palette: { ground: '#5b4d45', rock: '#2a2321', sediment: '#6b3b28', high: '#786b62', dust: '#8a7a6a',
             wet: '#3a2e2a', concrete: '#4d4642', rust: '#5d3424', accent: '#e0913c' },
  toneMapping: 'aces',
  sky: {
    top: '#17141d', mid: '#4f3330', horizon: '#8a5c47',
    sun: { azimuth: 40, elevation: 21, color: '#ffb27c', size: 1, glow: 1 },
    clouds: { cover: 0.5, color: '#4f3330', speed: 1 },
    stars: 0.35,
    moon: { azimuth: 214, elevation: 34, size: 6, color: '#8e7f78' },
    ridges: { height: 2.5, color: null, layers: 2 },
  },
  fog: { color: null, density: 0.0015, heightFalloff: 0.012, heightBase: 0, inscatter: 0.6, sunColor: '#ffb27c' },
  light: { sun: 6.5, sunColor: '#ffb27c', hemiSky: '#c4ad9e', hemiGround: '#2b1c16', hemi: 1.7, rim: 2.8, rimColor: '#8fb0c8',
           exposure: 1.1, env: 1 },
  grade: {},
  bloom: { strength: 0.85, radius: 0.6, threshold: 0.85 },
  weather: { type: 'ash', intensity: 0.6, wind: [2.2, 0.6], lightning: 0, fogBoost: 1 },
  skyline: [],
  ambience: [],
  scatter: [],
};

const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };

export function install(ctx) {
  const scene = ctx.scene;
  const hemi = new THREE.HemisphereLight(0xc4ad9e, 0x2b1c16, 1.7);
  const sun = new THREE.DirectionalLight(0xffb27c, 6.5);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  const rim = new THREE.DirectionalLight(0x8fb0c8, 2.8);
  hemi.name = 'hemi'; sun.name = 'sun'; rim.name = 'rim';
  scene.add(hemi, sun, sun.target, rim, rim.target);

  const sunDir = new THREE.Vector3(0.6, 0.36, -0.72).normalize();
  const fogColor = new THREE.Color();
  const fogUniforms = {
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0015 }, uFogHeightFalloff: { value: 0.012 },
    uFogHeightBase: { value: 0 }, uFogSunColor: { value: new THREE.Color() }, uFogSunDir: { value: sunDir },
    uFogInscatter: { value: 0.6 }, uFogFarStart: { value: ctx.tier.fogFarStart }, uFogFarEnd: { value: ctx.tier.fogFarEnd },
  };
  let pmrem = null, envRT = null, envKey = '';

  function shadowCam() {
    const e = ctx.tier.shadowExtent;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 10, far: 900 });
    sun.shadow.camera.updateProjectionMatrix();
    const s = ctx.tier.shadowMapSize;
    if (sun.shadow.mapSize.x !== s) {
      sun.shadow.mapSize.set(s, s);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  const api = {
    sun, hemi, rim, sunDir,
    art: deepMerge(DEFAULT_ART, {}),
    envMap: null,
    fogUniforms,
    apply(art = {}) {
      api.art = deepMerge(DEFAULT_ART, art || {});
      applyArt(api.art);
      ctx.weather?.set?.(api.art.weather || {});
    },
    set(p = {}, blendSeconds = 0) {
      api.art = deepMerge(api.art, p || {});
      applyArt(api.art);
      if (p.weather) ctx.weather?.set?.(p.weather, blendSeconds);
    },
    patchMaterial(m) { return m; },
    fogAmount(p) {
      const d = p.distanceTo(ctx.camera.position) * (scene.fog?.density ?? 0);
      return 1 - Math.exp(-d * d);
    },
    lightning() { /* stub */ },
    rebuildEnvironment() { buildEnv(api.art, true); },
    clear() { /* no skyline objects in the stub */ },
    update() {
      const f = ctx.cameraRig?.focus;
      if (f) {
        sun.target.position.copy(f);
        sun.position.copy(f).addScaledVector(sunDir, 400);
        rim.target.position.copy(f);
        rim.position.set(f.x - sunDir.x * 100, f.y + 50, f.z - sunDir.z * 100);
      }
    },
  };

  function applyArt(a) {
    const az = (a.sky.sun.azimuth ?? 40) * DEG, el = (a.sky.sun.elevation ?? 21) * DEG;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    fogColor.set(a.fog.color || a.sky.horizon);
    scene.background = fogColor.clone();
    if (!scene.fog) scene.fog = new THREE.FogExp2(fogColor, a.fog.density);
    scene.fog.color.copy(fogColor);
    scene.fog.density = a.fog.density * (a.weather?.fogBoost ?? 1);
    hemi.color.set(a.light.hemiSky); hemi.groundColor.set(a.light.hemiGround); hemi.intensity = a.light.hemi;
    sun.color.set(a.light.sunColor || a.sky.sun.color); sun.intensity = a.light.sun;
    rim.color.set(a.light.rimColor); rim.intensity = a.light.rim ?? 2.8;
    ctx.renderer.toneMapping = TONE[a.toneMapping] ?? THREE.ACESFilmicToneMapping;
    ctx.renderer.toneMappingExposure = a.light.exposure ?? 1;
    fogUniforms.uFogColor.value.copy(fogColor); fogUniforms.uFogDensity.value = a.fog.density;
    fogUniforms.uFogHeightFalloff.value = a.fog.heightFalloff ?? 0.012; fogUniforms.uFogHeightBase.value = a.fog.heightBase ?? 0;
    fogUniforms.uFogSunColor.value.set(a.fog.sunColor || a.sky.sun.color); fogUniforms.uFogInscatter.value = a.fog.inscatter ?? 0.6;
    ctx.materials?.setEnvScale?.(a.light.env ?? 1);
    ctx.pipeline?.setGrade?.(a.grade || {});
    ctx.pipeline?.setBloom?.(a.bloom || {});
    shadowCam();
    buildEnv(a, false);
    api.update();
  }

  // cheap sky-gradient PMREM so metals have something to reflect (P1 replaces with the sky dome)
  function buildEnv(a, force) {
    const key = [a.sky.top, a.sky.mid, a.sky.horizon, a.palette.ground].join();
    if (!force && key === envKey && api.envMap) return;
    envKey = key;
    try {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(ctx.renderer);
      const s = new THREE.Scene();
      const g = new THREE.SphereGeometry(100, 24, 12);
      const top = new THREE.Color(a.sky.top), mid = new THREE.Color(a.sky.mid), hor = new THREE.Color(a.sky.horizon), gr = new THREE.Color(a.palette.ground);
      const col = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color();
      for (let i = 0; i < g.attributes.position.count; i++) {
        const y = g.attributes.position.getY(i) / 100;
        if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
        else if (y > 0) c.copy(hor).lerp(mid, y / 0.25);
        else c.copy(hor).lerp(gr, Math.min(1, -y * 4)).multiplyScalar(0.6);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
      s.add(new THREE.Mesh(g, m));
      const rt = pmrem.fromScene(s, 0.04);
      g.dispose(); m.dispose();
      if (envRT) envRT.dispose();
      envRT = rt;
      api.envMap = rt.texture;
      scene.environment = api.envMap;
    } catch (e) {
      console.warn('[atmosphere] environment build failed', e);
      api.envMap = null; scene.environment = null;
    }
  }

  ctx.events.on('tier:changed', ({ tier }) => {
    shadowCam();
    fogUniforms.uFogFarStart.value = tier.fogFarStart; fogUniforms.uFogFarEnd.value = tier.fogFarEnd;
  });
  ctx.addSystem({ name: 'atmosphere', phase: 'fx', when: 'always', update: () => api.update() });
  ctx.atmosphere = api;
  api.apply({});
  return api;
}
