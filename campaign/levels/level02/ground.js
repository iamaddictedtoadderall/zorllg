// levels/level02/ground.js — the salt crust over the pan (L2 §2.6 Z5, AD §3.11): a ground-conforming runtime mesh over
// DATA.flats.polygon (route s, l corners), so it lies exactly on the terrain the heightfield made. White crust in
// polygonal plates with darker crack lines and a few wet brine patches; the edge fades into the steppe over 40 m.
// One mesh, one material (fog-patched), receives shadows; Low uses a coarser grid.
import * as THREE from 'three';

let TEX = null;
function crustTexture() {
  if (TEX) return TEX;
  const N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#ece6da'; g.fillRect(0, 0, N, N);
  let seed = 4421;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // plates: a jittered grid of Voronoi-ish cells drawn as tinted polygons (tileable by wrapping the seeds)
  const cells = [], G = 5;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) cells.push([(i + 0.15 + rnd() * 0.7) / G * N, (j + 0.15 + rnd() * 0.7) / G * N]);
  const seeds = [];
  for (const [x, y] of cells) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) seeds.push([x + ox, y + oy]);
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let b1 = 1e9, b2 = 1e9, bi = 0;
    for (let k = 0; k < seeds.length; k++) {
      const dx = x - seeds[k][0], dy = y - seeds[k][1];
      if (Math.abs(dx) > 110 || Math.abs(dy) > 110) continue;
      const q = dx * dx + dy * dy;
      if (q < b1) { b2 = b1; b1 = q; bi = k; } else if (q < b2) b2 = q;
    }
    const edge = Math.sqrt(b2) - Math.sqrt(b1);           // distance to the cell border
    const tint = ((bi * 2654435761) >>> 0) % 1000 / 1000;  // per-plate tint
    let v = 0.93 + tint * 0.06;
    if (edge < 1.4) v *= 0.62 + edge * 0.2;                // the crack line
    else if (edge < 3.5) v *= 1.02;                            // the raised rim along it
    const i4 = (y * N + x) * 4;
    d[i4] = Math.min(255, 236 * v); d[i4 + 1] = Math.min(255, 230 * v); d[i4 + 2] = Math.min(255, 218 * v); d[i4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // a few faint brine stains
  for (let i = 0; i < 6; i++) {
    const x = rnd() * N, y = rnd() * N, r = 20 + rnd() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(150,140,128,0.35)'); gr.addColorStop(1, 'rgba(150,140,128,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  TEX.wrapS = TEX.wrapT = THREE.RepeatWrapping;
  TEX.anisotropy = 8;
  TEX.userData.shared = true;
  return TEX;
}

export class SaltFlats {
  constructor(L) {
    this.L = L;
    const ctx = L.ctx, R = ctx.world.route, poly = L.DATA.flats.polygon;
    const low = ctx.tier?.name === 'low' || ctx.settings?.quality === 'low';
    const ds = low ? 24 : 12, soft = 40, pad = 30;
    const s0 = Math.min(...poly.map(p => p[0])) - pad, s1 = Math.max(...poly.map(p => p[0])) + pad;
    // the polygon's l-range at an s (linear between its corners: [s0,lA..lB] at the two ends)
    const lRange = (s) => {
      const k = Math.max(0, Math.min(1, (s - poly[0][0]) / ((poly[2][0] - poly[0][0]) || 1)));
      const near = poly[0][1] + (poly[3][1] - poly[0][1]) * k, far = poly[1][1] + (poly[2][1] - poly[1][1]) * k;
      return [Math.min(near, far), Math.max(near, far)];
    };
    const [la, lb] = [Math.min(...poly.map(p => p[1])) - pad, Math.max(...poly.map(p => p[1])) + pad];
    const ns = Math.ceil((s1 - s0) / ds), nl = Math.ceil((lb - la) / ds);
    const pos = [], col = [], uv = [], idx = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= nl; j++) for (let i = 0; i <= ns; i++) {
      const s = s0 + i * ds, l = la + j * ds;
      R.toWorld(s, l, p);
      const y = L.groundAt(p.x, p.z) + 0.12;
      pos.push(p.x, y, p.z);
      uv.push(p.x / 60, p.z / 60);
      // alpha: 1 inside the polygon, fading to 0 over `soft` metres outside (in s, l)
      const [l0, l1] = lRange(s);
      const ps = poly[0][0], pe = poly[2][0];
      const ds_ = s < ps ? ps - s : s > pe ? s - pe : 0;
      const dl = l < l0 ? l0 - l : l > l1 ? l - l1 : 0;
      const out = Math.hypot(ds_, dl);
      const a = Math.max(0, 1 - out / soft);
      // a jagged edge: noise on the fade
      const n = 0.5 + 0.5 * Math.sin(p.x * 0.07 + Math.sin(p.z * 0.05) * 2) * Math.cos(p.z * 0.06);
      const aa = Math.max(0, Math.min(1, a * 1.25 - (1 - a) * n * 0.6));
      col.push(1, 1, 1, aa * aa * (3 - 2 * aa));
    }
    for (let j = 0; j < nl; j++) for (let i = 0; i < ns; i++) {
      const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, d = c + 1;
      if (col[a * 4 + 3] + col[b * 4 + 3] + col[c * 4 + 3] + col[d * 4 + 3] <= 0) continue;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    // orient the winding up (route frames may flip it)
    const nrm = geo.attributes.normal;
    let up = 0; for (let k = 0; k < nrm.count; k += 7) up += nrm.getY(k);
    if (up < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
    let mat = new THREE.MeshStandardMaterial({ map: crustTexture(), vertexColors: true, transparent: true, depthWrite: false, roughness: 0.82, metalness: 0,
                                              envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = 'l02-salt';
    if (ctx.atmosphere?.patchMaterial) mat = ctx.atmosphere.patchMaterial(mat) || mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'l02:saltFlats'; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.renderOrder = 1;
    ctx.levelRoot.add(this.mesh);
    this.tris = idx.length / 3;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
