// The ark seen from outside: used behind the title screen and in the opening shots.
// Built from primitives along the x axis: engine at -x, bow at +x, cryo modules amidships.
import * as THREE from 'three';

export function buildExterior() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020406);
  const camera = new THREE.PerspectiveCamera(38, 1, .5, 2000);

  scene.add(new THREE.HemisphereLight(0x6a8aa0, 0x0a0c0e, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.6); sun.position.set(60, 40, 35); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 1.6); rim.position.set(-40, -10, -60); scene.add(rim);

  const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .08, flatShading: true, ...o });
  const glow = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i });
  const hull = flat(0xb4bec4), dark = flat(0x4a5458), plate = flat(0x8a9498);
  const ark = new THREE.Group(); scene.add(ark);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); ark.add(m); return m;
  };
  const along = geo => geo.rotateZ(Math.PI / 2);   // cylinders lie along x

  // spine and trusses
  add(along(new THREE.CylinderGeometry(.9, .9, 64, 10)), hull);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    add(along(new THREE.CylinderGeometry(.12, .12, 60, 4)), dark, 0, Math.cos(a) * 1.5, Math.sin(a) * 1.5);
  }
  for (let x = -28; x <= 28; x += 4) add(new THREE.TorusGeometry(1.5, .1, 4, 12), dark, x, 0, 0, 0, Math.PI / 2);

  // cryo modules: six long boxes around the spine, with lit window strips
  const windows = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, r = 2.6, y = Math.cos(a) * r, z = Math.sin(a) * r;
    const mod = add(new THREE.BoxGeometry(14, 1.5, 1.5), plate, 2, y, z, a, 0, 0);
    for (let k = 0; k < 6; k++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, .12, .02), glow(0x7fe0e4, 1.6));
      w.position.set(-5.5 + k * 2.2, .2, .76); mod.add(w); windows.push(w);
      const w2 = w.clone(); w2.position.z = -.76; mod.add(w2);
    }
  }
  add(along(new THREE.CylinderGeometry(3.6, 3.6, .5, 6)), dark, -5.3);
  add(along(new THREE.CylinderGeometry(3.6, 3.6, .5, 6)), dark, 9.3);

  // habitat ring
  const ring = new THREE.Group(); ring.position.x = 19; ark.add(ring);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(7.5, .7, 6, 36), hull); torus.rotation.y = Math.PI / 2; ring.add(torus);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 15, 5), dark); s.rotation.x = i * Math.PI / 4; ring.add(s);
  }
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, w = new THREE.Mesh(new THREE.BoxGeometry(.05, .2, .5), glow(0xf0c890, i % 5 ? .0 : 1.2));
    w.position.set(.72, Math.cos(a) * 7.5, Math.sin(a) * 7.5); w.rotation.x = -a; ring.add(w);
  }

  // bow: command section and dish
  add(along(new THREE.CylinderGeometry(1.2, 2.2, 7, 8)), hull, 31);
  add(along(new THREE.CylinderGeometry(.5, 1.2, 3, 8)), plate, 36);
  const dish = add(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3.2), dark, 27, 3.4, 0, 0, 0, -Math.PI / 2.4);
  dish.scale.set(1, .5, 1);

  // radiators and engine
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(8, .08, 12), dark, -19, 0, s * 7.5);
    for (let k = 0; k < 7; k++) add(new THREE.BoxGeometry(.06, .1, 11.6), glow(0x8a2a10, .5), -22.5 + k * 1.15, .05, s * 7.5);
  }
  add(along(new THREE.CylinderGeometry(3, 3, 7, 10)), plate, -30);
  add(along(new THREE.CylinderGeometry(3.3, 3.3, .6, 10)), dark, -26.6);
  const bell = add(along(new THREE.CylinderGeometry(1.6, 3.4, 4, 14, 1, true)), dark, -35.3);
  bell.material = flat(0x3a4246, { side: THREE.DoubleSide });
  add(along(new THREE.CircleGeometry(1.55, 14)).rotateY(Math.PI / 2), glow(0xff8a3a, .35), -33.4);

  // running lights
  const beacons = [[38, 0, 0, 0xff3030], [-36, 3.4, 0, 0x30ff70], [19, 8.3, 0, 0xffffff], [2, 3.6, 0, 0xff3030]].map(([x, y, z, c]) =>
    add(new THREE.SphereGeometry(.16, 6, 4), glow(c, 0), x, y, z));

  // stars
  const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 900, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
    const b = Math.pow(Math.random(), 3) * .9 + .1, warm = Math.random();
    col.set([b * (.85 + warm * .15), b * .92, b * (1.05 - warm * .2)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));
  const far = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2d8 }));
  far.position.set(-700, 160, -420); scene.add(far);

  ark.rotation.set(.08, -.15, .04);
  const tmp = new THREE.Vector3();

  return {
    scene, camera,
    update(t) {
      ring.rotation.x = t * .06;
      beacons.forEach((b, i) => b.material.emissiveIntensity = (t * .7 + i * .37) % 1 < .08 ? 3 : 0);
      windows.forEach((w, i) => { if ((i * 7919) % 97 === 0) w.material.emissiveIntensity = 1.2 + Math.sin(t * 2 + i) * .4; });
    },
    // Place the camera along a path, in ark-local coordinates so shots follow the ark's tilt.
    shot(from, to, lookFrom, lookTo, k) {
      const e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(from, to, e).applyEuler(ark.rotation);
      camera.lookAt(tmp.lerpVectors(lookFrom, lookTo, e).applyEuler(ark.rotation));
    },
    orbit(t) {
      const a = t * .025 + .9;
      camera.position.set(Math.cos(a) * 96 - 9, 14 + Math.sin(t * .04) * 5, Math.sin(a) * 96);
      camera.lookAt(-9, 0, 0);
    },
  };
}
