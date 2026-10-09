// world/terrain.js (P2) — P0 STUB: one 256×256-segment grid mesh over the heightfield bounds, displaced by heightAt,
// vertex-coloured from the palette (ground / rock by slope / high by altitude). No streaming, no LOD.
import * as THREE from 'three';
import { smooth } from '../core/util.js';
import { createValueNoise2D, fbm2 } from '../core/noise.js';

const SEG = 256;

export class TerrainRenderer {
  constructor(ctx, hf, art = {}) {
    this.ctx = ctx;
    this.hf = hf;
    this.root = new THREE.Group();
    this.root.name = 'terrain';
    const b = hf.bounds, N = SEG + 1;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
    const pal = art.palette || {};
    const cG = new THREE.Color(pal.ground || '#5b4d45'), cR = new THREE.Color(pal.rock || '#2a2321'),
          cH = new THREE.Color(pal.high || '#786b62'), cS = new THREE.Color(pal.sediment || '#6b3b28'), c = new THREE.Color();
    const n = new THREE.Vector3();
    const vn = createValueNoise2D(hf.seed ?? 1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = b.x0 + (b.x1 - b.x0) * i / SEG, z = b.z0 + (b.z1 - b.z0) * j / SEG, h = hf.heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      hf.normalAt(x, z, n);
      nrm[k * 3] = n.x; nrm[k * 3 + 1] = n.y; nrm[k * 3 + 2] = n.z;
      // palette blend by height and slope, plus low-frequency patches so distance and motion read in screenshots
      const patch = fbm2(vn, x / 420, z / 420, 4), fine = vn(x / 90, z / 90);
      c.copy(cG).lerp(cS, 0.25 + 0.5 * smooth(0.45, 0.75, patch) * 0.8 + 0.2 * smooth(0, -8, h))
        .lerp(cH, 0.55 * smooth(2, 8, h) + 0.25 * smooth(0.6, 0.3, patch)).lerp(cR, smooth(0.985, 0.95, n.y) + 0.35 * smooth(0.62, 0.8, fine));
      const v = 0.82 + 0.18 * fine;
      col[k * 3] = c.r * v; col[k * 3 + 1] = c.g * v; col[k * 3 + 2] = c.b * v;
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let p = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * N + i, bb = (j + 1) * N + i, cc = (j + 1) * N + i + 1, d = j * N + i + 1;
      idx[p++] = a; idx[p++] = bb; idx[p++] = d; idx[p++] = bb; idx[p++] = cc; idx[p++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.material = ctx.atmosphere?.patchMaterial ? ctx.atmosphere.patchMaterial(mat) : mat;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.root.add(this.mesh);
    this._tris = SEG * SEG * 2;
  }
  update(focus, cameraPos, budgetMs) { /* stub: single static mesh */ }
  async prewarm(focus, onProgress) { onProgress?.(1); }
  settle() { /* stub */ }
  setTier(t) { /* stub */ }
  stats() { return { nodes: 1, pending: 0, triangles: this._tris }; }
  dispose() {
    this.root.parent?.remove(this.root);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
