// art/mechs.js (P3) — P0 STUB: VERBATIM port of the prototype's AC_DESIGNS (as DESIGNS), buildAC (as buildMech) and
// animateAC (as animateMech). Changes are limited to r170/module plumbing: materials come from ctx.materials.mechSet,
// geometry comes from the cached kit, and the rig exposes the §4.3 MechRig fields (muzzleL, mounts, setParts, dispose).
// DESIGNS[k].build(S, M, kit) receives the art/kit.js module as `kit` and builds its own acKit(bevel), as the prototype did.
import * as THREE from 'three';
import * as KIT from './kit.js';
import { clamp, lerp, damp, mulberry32 } from '../core/util.js';
import { PARTS } from '../combat/loadout.js';

export const DESIGNS = {
  vanguard: {
    name: 'Vanguard', desc: 'Balanced frame. Angular plating, V-fin sensor head.',
    build(S, M, kit = KIT) {
      const K = kit.acKit(0.07);
      K.front(S.pelvis, [[-1.1, -0.45], [1.1, -0.45], [1.25, 0.15], [0.8, 0.5], [-0.8, 0.5], [-1.25, 0.15]], 1.7, M.dark);
      K.side(S.pelvis, [[-0.55, 0.35], [-1.05, 0.15], [-0.95, -0.55], [-0.5, -0.85], [-0.1, -0.6], [-0.1, 0.35]], 1.1, M.base);
      K.side(S.pelvis, [[0.3, 0.4], [0.95, 0.2], [0.85, -0.5], [0.3, -0.6]], 1.6, M.mid);
      for (const s of [-1, 1]) K.side(S.pelvis, [[-0.7, 0.35], [0.6, 0.35], [0.5, -0.9], [-0.55, -0.65]], 0.2, M.mid, s * 2.0, 0, 0);
      for (const L of S.legs) {
        const s = L.side;
        K.ball(L.hip, 0.55, M.dark);
        K.side(L.hip, [[-0.6, -0.1], [0.55, -0.1], [0.5, -1.8], [0.3, -2.5], [-0.35, -2.5], [-0.65, -1.7], [-0.75, -0.7]], 1.25, M.base);
        K.side(L.hip, [[-0.75, -0.35], [0.45, -0.2], [0.4, -1.4], [-0.2, -1.95], [-0.8, -1.3]], 0.22, M.mid, s * 0.68);
        K.joint(L.knee, 0.42, 1.1, M.dark);
        K.side(L.knee, [[-0.55, 0.3], [0.45, 0.2], [0.8, -0.5], [0.62, -1.7], [0.4, -2.3], [-0.4, -2.3], [-0.62, -1.2], [-0.7, -0.2]], 1.3, M.mid);
        K.side(L.knee, [[-0.35, 0.6], [-0.9, 0.15], [-0.85, -0.75], [-0.5, -0.95], [-0.3, 0.05]], 1.0, M.acc);
        K.side(L.knee, [[0.6, -0.55], [0.95, -0.7], [0.85, -1.5], [0.6, -1.6]], 0.8, M.dark);
        K.ball(L.ankle, 0.4, M.dark);
        K.side(L.ankle, [[-1.75, -0.32], [-1.6, 0.0], [-0.75, 0.32], [0.35, 0.38], [0.95, 0.05], [1.0, -0.32]], 1.5, M.base);
        K.side(L.ankle, [[-1.82, -0.32], [-1.66, 0.02], [-1.15, 0.12], [-1.05, -0.32]], 1.2, M.dark);
      }
      const T = S.torso;
      K.joint(T, 0.8, 1.1, M.dark, 0, 0.35, 0, 'y');
      K.side(T, [[-0.95, 0.6], [-1.5, 1.35], [-1.45, 2.35], [-0.95, 2.95], [1.05, 2.95], [1.3, 1.1], [0.8, 0.55]], 2.7, M.base);
      for (const s of [-1, 1]) K.side(T, [[-0.8, 0.9], [-1.2, 1.6], [-1.05, 2.7], [0.9, 2.8], [1.0, 1.2]], 0.55, M.mid, s * 1.55);
      K.side(T, [[-0.98, 0.62], [-1.56, 1.4], [-1.5, 1.56], [-0.9, 0.8]], 1.6, M.acc);
      K.side(T, [[-0.6, 2.9], [-0.4, 3.35], [0.4, 3.35], [0.6, 2.9]], 1.1, M.dark);
      K.side(T, [[0.9, 0.85], [2.2, 1.15], [2.35, 2.55], [1.0, 2.95]], 2.3, M.dark);
      K.side(T, [[1.0, 2.95], [2.35, 2.55], [2.3, 2.78], [1.05, 3.12]], 2.0, M.acc, 0, 0, 0, 0.04);
      const H = S.head;
      K.side(H, [[-0.85, 0.1], [-0.9, 0.5], [-0.55, 0.82], [0.55, 0.82], [0.6, 0.05], [-0.2, -0.05]], 1.0, M.mid);
      for (const s of [-1, 1]) {
        K.side(H, [[-0.95, 0.05], [-0.95, 0.32], [0.1, 0.45], [0.3, 0.0]], 0.15, M.base, s * 0.55);
        K.side(H, [[-0.35, 0.78], [-0.05, 0.78], [0.85, 1.3], [0.7, 1.36]], 0.07, M.acc, s * 0.3, 0, 0, 0.02).rotation.z = -s * 0.25;
      }
      K.front(H, [[-0.42, 0.22], [0.42, 0.22], [0.36, 0.42], [-0.36, 0.42]], 0.12, M.visor, 0, 0, -0.9, 0.02);
      for (const s of [-1, 1]) {
        const A = S.arms[s < 0 ? 'L' : 'R'];
        K.side(A.sh, [[-1.25, 0.15], [-0.95, 0.95], [0.85, 1.0], [1.25, 0.3], [0.95, -0.45], [-0.85, -0.5]], 1.5, M.base, s * 0.3);
        K.side(A.sh, [[-1.2, 0.2], [-0.93, 0.9], [0.83, 0.95], [1.2, 0.32], [1.02, 0.22], [0.73, 0.74], [-0.83, 0.7], [-1.02, 0.12]], 0.1, M.acc, s * 1.06, 0, 0, 0.02);
        K.ball(A.sh, 0.55, M.dark);
        K.side(A.sh, [[-0.4, -0.3], [0.4, -0.3], [0.35, -1.75], [-0.35, -1.75]], 0.85, M.mid, 0, 0, 0, 0.12);
        K.joint(A.el, 0.38, 0.95, M.dark);
        K.side(A.el, [[0.4, 0.45], [-0.55, 0.55], [-1.95, 0.38], [-2.15, 0.0], [-1.95, -0.45], [0.35, -0.45]], 1.05, M.base);
      }
      const R = S.arms.R.el, Lf = S.arms.L.el;
      K.side(R, [[-1.3, -0.35], [-1.45, -0.95], [-3.55, -0.9], [-3.8, -0.62], [-3.8, -0.35]], 0.5, M.dark);
      K.side(R, [[-2.0, -0.9], [-2.6, -0.9], [-2.5, -1.5], [-2.1, -1.5]], 0.35, M.mid);
      K.side(R, [[-2.3, -0.3], [-3.1, -0.3], [-3.05, -0.12], [-2.4, -0.12]], 0.25, M.acc, 0, 0, 0, 0.03);
      K.joint(R, 0.13, 2.0, M.dark, 0, -0.5, -4.8, 'z');
      K.joint(R, 0.2, 0.45, M.dark, 0, -0.5, -5.6, 'z');
      K.side(Lf, [[-1.2, -0.3], [-1.35, -0.85], [-2.4, -0.85], [-2.65, -0.55], [-2.4, -0.3]], 0.7, M.dark);
      K.joint(Lf, 0.3, 0.3, M.acc, 0, -0.55, -2.6, 'z');
      K.side(S.pod, [[-1.0, -0.5], [-1.05, 0.35], [-0.7, 0.55], [1.0, 0.55], [1.0, -0.5]], 1.3, M.mid);
      K.cells(S.pod, 2, 2, M.dark, -1.06, 0.8, 0.6, -0.05);
    },
  },
  striker: {
    name: 'Striker', desc: 'Light frame. Knife-edged armour, swept back wings.',
    build(S, M, kit = KIT) {
      const K = kit.acKit(0.05);
      K.front(S.pelvis, [[-0.85, -0.4], [0.85, -0.4], [1.0, 0.2], [0.6, 0.5], [-0.6, 0.5], [-1.0, 0.2]], 1.4, M.dark);
      K.side(S.pelvis, [[-0.5, 0.3], [-1.1, 0.0], [-0.6, -0.9], [-0.1, -0.5], [-0.1, 0.3]], 0.8, M.base);
      K.side(S.pelvis, [[0.3, 0.35], [1.2, 0.1], [0.4, -0.4]], 0.9, M.mid);
      for (const L of S.legs) {
        const s = L.side;
        K.ball(L.hip, 0.45, M.dark);
        K.side(L.hip, [[-0.5, -0.1], [0.45, -0.1], [0.35, -2.0], [0.15, -2.55], [-0.3, -2.55], [-0.55, -1.4]], 0.95, M.base);
        K.side(L.hip, [[-0.65, -0.2], [0.3, 0.1], [0.25, -1.2], [-0.35, -1.9], [-0.7, -1.0]], 0.12, M.acc, s * 0.52, 0, 0, 0.03);
        K.joint(L.knee, 0.33, 0.85, M.dark);
        K.side(L.knee, [[-0.45, 0.3], [0.35, 0.25], [1.1, -0.4], [0.55, -1.2], [0.3, -2.3], [-0.3, -2.3], [-0.5, -1.0]], 1.0, M.mid);
        K.side(L.knee, [[-0.3, 0.55], [-1.05, 0.3], [-0.5, -0.3], [-0.25, 0.0]], 0.6, M.acc);
        K.ball(L.ankle, 0.32, M.dark);
        K.side(L.ankle, [[-1.95, -0.32], [-1.5, 0.05], [-0.5, 0.28], [0.4, 0.3], [0.8, 0.0], [1.15, -0.32]], 1.1, M.base);
        K.side(L.ankle, [[0.55, -0.05], [1.45, -0.32], [0.6, -0.32]], 0.4, M.dark);
      }
      const T = S.torso;
      K.joint(T, 0.6, 1.1, M.dark, 0, 0.35, 0, 'y');
      K.side(T, [[-0.8, 0.6], [-1.6, 1.6], [-1.2, 2.6], [-0.7, 2.9], [0.9, 2.85], [1.15, 1.2], [0.7, 0.55]], 2.2, M.base);
      for (const s of [-1, 1]) {
        K.side(T, [[-0.6, 1.0], [-1.0, 1.8], [-0.6, 2.75], [0.9, 2.7], [0.9, 1.3]], 0.45, M.mid, s * 1.25);
        K.joint(T, 0.36, 1.3, M.dark, s * 1.85, 2.3, 0);
        K.side(T, [[-0.5, 1.9], [0.45, 1.9], [0.4, 2.75], [-0.4, 2.75]], 0.7, M.mid, s * 1.75, 0, 0, 0.06);
      }
      K.side(T, [[-1.18, 1.15], [-1.64, 1.62], [-1.56, 1.78], [-1.1, 1.32]], 1.5, M.acc, 0, 0, 0, 0.03);
      K.side(T, [[-0.5, 2.85], [-0.35, 3.3], [0.35, 3.3], [0.5, 2.85]], 0.9, M.dark);
      K.side(T, [[0.8, 0.9], [1.9, 1.1], [2.1, 2.3], [0.9, 2.8]], 1.6, M.dark);
      for (const s of [-1, 1]) {
        const wing = [[0.4, 2.2], [0.9, 2.0], [2.9, 3.6], [3.3, 4.6], [2.6, 4.2], [0.5, 2.9]].map(([x, y]) => [x * s, y]);
        K.front(T, wing, 0.14, M.mid, 0, 0, 2.05, 0.03).rotation.x = 0.35;
        K.front(T, [[2.1, 3.05], [2.9, 3.6], [3.3, 4.6], [3.0, 4.45], [2.65, 3.75], [2.0, 3.25]].map(([x, y]) => [x * s, y]), 0.18, M.acc, 0, 0, 2.05, 0.02).rotation.x = 0.35;
      }
      const H = S.head;
      K.side(H, [[-0.95, 0.2], [-0.7, 0.6], [0.4, 0.7], [0.75, 0.35], [0.5, 0.0], [-0.5, -0.05]], 0.75, M.mid);
      K.side(H, [[-0.4, 0.65], [-0.1, 0.65], [1.3, 1.2], [1.2, 1.3]], 0.08, M.acc, 0, 0, 0, 0.02);
      for (const s of [-1, 1]) K.side(H, [[-0.8, 0.05], [-0.6, 0.3], [0.5, 0.4], [0.6, 0.05]], 0.12, M.base, s * 0.42, 0, 0, 0.03);
      K.front(H, [[-0.3, 0.27], [0.3, 0.27], [0.25, 0.37], [-0.25, 0.37]], 0.1, M.visor, 0, 0, -0.86, 0.02);
      for (const s of [-1, 1]) {
        const A = S.arms[s < 0 ? 'L' : 'R'];
        const pa = [[-1.0, 0.0], [-0.6, 0.75], [1.1, 0.95], [0.9, 0.2], [0.5, -0.4], [-0.7, -0.35]];
        K.side(A.sh, pa, 1.1, M.base, s * 0.25);
        K.side(A.sh, [[-0.95, 0.05], [-0.58, 0.7], [1.0, 0.88], [0.95, 0.68], [-0.45, 0.52], [-0.78, -0.02]], 0.1, M.acc, s * 0.82, 0, 0, 0.02);
        K.ball(A.sh, 0.52, M.dark);
        K.side(A.sh, [[-0.32, -0.3], [0.32, -0.3], [0.28, -1.75], [-0.28, -1.75]], 0.7, M.mid, 0, 0, 0, 0.1);
        K.joint(A.el, 0.3, 0.8, M.dark);
        K.side(A.el, [[0.35, 0.38], [-0.45, 0.45], [-2.2, 0.25], [-2.35, -0.05], [-2.0, -0.38], [0.3, -0.38]], 0.85, M.base);
      }
      const R = S.arms.R.el, Lf = S.arms.L.el;
      K.side(R, [[-1.3, -0.33], [-1.4, -0.8], [-3.9, -0.75], [-4.1, -0.55], [-4.1, -0.33]], 0.42, M.dark);
      K.side(R, [[-2.1, -0.78], [-2.5, -0.78], [-2.7, -1.35], [-2.35, -1.35]], 0.28, M.mid);
      K.joint(R, 0.1, 1.8, M.dark, 0, -0.5, -4.95, 'z');
      K.joint(R, 0.16, 0.35, M.acc, 0, -0.5, -5.65, 'z');
      K.side(Lf, [[-1.2, -0.3], [-1.3, -0.75], [-2.5, -0.75], [-2.7, -0.5], [-2.5, -0.3]], 0.55, M.dark);
      K.joint(Lf, 0.24, 0.3, M.acc, 0, -0.55, -2.65, 'z');
      K.side(S.pod, [[-1.1, -0.4], [-1.1, 0.3], [-0.6, 0.45], [0.9, 0.45], [0.9, -0.4]], 1.0, M.mid);
      K.cells(S.pod, 2, 2, M.dark, -1.15, 0.6, 0.5, -0.05);
    },
  },
  bastion: {
    name: 'Bastion', desc: 'Heavy frame. Rounded armour, wide shoulders, shield arm.',
    build(S, M, kit = KIT) {
      const K = kit.acKit(0.14);
      K.front(S.pelvis, [[-1.3, -0.5], [1.3, -0.5], [1.45, 0.2], [0.9, 0.55], [-0.9, 0.55], [-1.45, 0.2]], 1.9, M.dark);
      K.side(S.pelvis, [[-0.6, 0.35], [-1.15, 0.2], [-1.05, -0.6], [-0.55, -0.95], [-0.1, -0.7], [-0.1, 0.35]], 1.3, M.base);
      K.side(S.pelvis, [[0.3, 0.45], [1.05, 0.25], [0.95, -0.55], [0.3, -0.7]], 1.8, M.mid);
      for (const s of [-1, 1]) K.side(S.pelvis, [[-0.95, 0.45], [0.85, 0.45], [0.75, -1.2], [-0.85, -1.0]], 0.25, M.mid, s * 2.15, 0, 0, 0.08);
      for (const L of S.legs) {
        const s = L.side;
        K.ball(L.hip, 0.65, M.dark);
        K.side(L.hip, [[-0.75, -0.1], [0.7, -0.1], [0.65, -2.0], [0.4, -2.55], [-0.45, -2.55], [-0.85, -1.6], [-0.9, -0.6]], 1.6, M.base);
        K.joint(L.knee, 0.5, 1.3, M.dark);
        K.side(L.knee, [[-0.7, 0.3], [0.6, 0.15], [1.0, -0.7], [0.85, -2.0], [0.55, -2.4], [-0.5, -2.4], [-0.75, -1.2], [-0.85, -0.2]], 1.65, M.mid);
        K.side(L.knee, [[-0.45, 0.75], [-1.05, 0.35], [-1.05, -0.7], [-0.6, -1.05], [-0.35, 0.0]], 1.3, M.acc);
        K.side(L.knee, [[-0.6, -0.3], [0.7, -0.5], [0.6, -1.8], [-0.55, -1.9]], 0.22, M.base, s * 0.88, 0, 0, 0.06);
        K.ball(L.ankle, 0.5, M.dark);
        K.side(L.ankle, [[-1.8, -0.32], [-1.7, 0.1], [-0.8, 0.42], [0.5, 0.45], [1.1, 0.1], [1.2, -0.32]], 1.85, M.base);
        K.side(L.ankle, [[-1.86, -0.32], [-1.74, 0.08], [-1.2, 0.2], [-1.1, -0.32]], 1.55, M.dark, 0, 0, 0, 0.08);
      }
      const T = S.torso;
      K.joint(T, 0.95, 1.1, M.dark, 0, 0.35, 0, 'y');
      K.side(T, [[-1.1, 0.55], [-1.55, 1.2], [-1.55, 2.5], [-1.1, 3.05], [1.2, 3.05], [1.4, 1.0], [0.9, 0.5]], 3.2, M.base, 0, 0, 0, 0.18);
      for (const s of [-1, 1]) K.side(T, [[-0.9, 0.85], [-1.3, 1.5], [-1.2, 2.8], [1.0, 2.9], [1.1, 1.1]], 0.6, M.mid, s * 1.85);
      K.side(T, [[-1.6, 1.55], [-1.6, 1.9], [1.05, 1.9], [1.05, 1.55]], 3.3, M.acc, 0, 0, 0, 0.05);
      K.side(T, [[-0.65, 3.0], [-0.45, 3.4], [0.45, 3.4], [0.65, 3.0]], 1.3, M.dark, 0, 0, 0, 0.08);
      K.side(T, [[1.0, 0.8], [2.4, 1.0], [2.5, 2.55], [1.1, 2.85]], 2.8, M.dark);
      for (const s of [-1, 1]) K.joint(T, 0.45, 1.6, M.mid, s * 1.45, 1.9, 2.55, 'y');
      const H = S.head;
      K.side(H, [[-0.75, 0.0], [-0.85, 0.35], [-0.5, 0.62], [0.5, 0.62], [0.7, 0.3], [0.6, 0.0]], 1.25, M.mid, 0, 0, 0, 0.15);
      K.front(H, [[-0.55, 0.2], [0.55, 0.2], [0.55, 0.36], [-0.55, 0.36]], 0.1, M.visor, 0, 0, -0.85, 0.02);
      K.joint(H, 0.05, 1.1, M.dark, 0.5, 1.0, 0.3, 'y');
      for (const s of [-1, 1]) {
        const A = S.arms[s < 0 ? 'L' : 'R'];
        const pa = [[-1.35, 0.2], [-1.1, 1.05], [0.0, 1.25], [1.1, 1.05], [1.35, 0.2], [1.0, -0.6], [-1.0, -0.6]];
        K.side(A.sh, pa, 1.8, M.base, s * 0.35, 0, 0, 0.2);
        K.side(A.sh, [[-1.3, 0.25], [-1.07, 1.0], [0, 1.2], [1.07, 1.0], [1.3, 0.25], [1.12, 0.25], [0.92, 0.85], [0, 1.02], [-0.92, 0.85], [-1.12, 0.25]], 0.1, M.acc, s * 1.26, 0, 0, 0.02);
        K.ball(A.sh, 0.65, M.dark);
        K.side(A.sh, [[-0.48, -0.3], [0.48, -0.3], [0.42, -1.75], [-0.42, -1.75]], 1.0, M.mid);
        K.joint(A.el, 0.45, 1.1, M.dark);
        K.side(A.el, [[0.45, 0.5], [-0.6, 0.6], [-2.0, 0.45], [-2.2, 0.0], [-2.0, -0.55], [0.4, -0.55]], 1.25, M.base);
      }
      const R = S.arms.R.el, Lf = S.arms.L.el;
      K.side(R, [[-1.2, -0.4], [-1.3, -1.1], [-3.5, -1.05], [-3.7, -0.7], [-3.7, -0.4]], 0.65, M.dark, 0, 0, 0, 0.08);
      K.joint(R, 0.45, 0.4, M.mid, 0, -1.3, -2.3, 'x');
      K.joint(R, 0.17, 2.0, M.dark, 0, -0.5, -4.7, 'z');
      K.joint(R, 0.26, 0.5, M.acc, 0, -0.5, -5.55, 'z');
      K.side(Lf, [[-1.2, -0.3], [-1.35, -0.9], [-2.4, -0.9], [-2.65, -0.55], [-2.4, -0.3]], 0.75, M.dark, 0, 0, 0, 0.08);
      K.joint(Lf, 0.32, 0.3, M.acc, 0, -0.55, -2.6, 'z');
      K.side(Lf, [[0.2, 0.95], [-2.2, 0.95], [-2.45, -0.4], [-1.9, -1.2], [0.0, -1.1]], 0.16, M.mid, -0.72, 0, 0, 0.05);
      K.side(S.pod, [[-1.1, -0.6], [-1.15, 0.45], [-0.8, 0.65], [1.1, 0.65], [1.1, -0.6]], 1.5, M.mid);
      K.cells(S.pod, 3, 2, M.dark, -1.2, 1.1, 0.7, -0.05);
    },
  },
};

/** Visual builders for loadout PARTS[].visual (Appendix C.4). P0: empty; P3 adds 'rifle', 'mg', … 'kit'.
 *  Signature: (K: acKit instance with the frame's bevel, M: MechMaterials, mount: Object3D) => void */
export const PART_VISUALS = {};
const DESIGN_BEVEL = { vanguard: 0.07, striker: 0.05, bastion: 0.14 };

// shared geometry (prototype built these per mech)
let flameGeo = null, coreGeo = null, bladeGeo = null, bladeCoreGeo = null;
function sharedGeos() {
  if (flameGeo) return;
  flameGeo = new THREE.ConeGeometry(0.42, 3, 10, 1, true); flameGeo.translate(0, 1.5, 0); flameGeo.rotateX(Math.PI / 2);
  coreGeo = new THREE.ConeGeometry(0.22, 1.6, 8, 1, true); coreGeo.translate(0, 0.8, 0); coreGeo.rotateX(Math.PI / 2);
  bladeGeo = new THREE.BoxGeometry(0.16, 0.55, 7.5);
  bladeCoreGeo = new THREE.BoxGeometry(0.06, 0.2, 7.4);
  for (const g of [flameGeo, coreGeo, bladeGeo, bladeCoreGeo]) g.userData.shared = true;
}
function fallbackMechSet(s) {
  const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: 0.55 });
  const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  return { base: std(s.base, 0.42, 0.5), mid: std(s.mid, 0.5, 0.45), acc: std(s.accent, 0.45, 0.3), dark: std(s.dark ?? 0x1b1c20, 0.65, 0.5),
           visor: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: s.visor, emissiveIntensity: 2.6 }),
           flame: glow(s.flame ?? 0xff9a3c, 0.85), blade: glow(s.blade ?? 0x8fe9ff, 0.9) };
}

/** Port of buildAC. scheme: { design, base, mid, accent, visor, flame?, blade?, dark?, wear? } */
export function buildMech(ctx, scheme, o = {}) {
  sharedGeos();
  const design = DESIGNS[scheme.design] ? scheme.design : 'vanguard';
  const D = DESIGNS[design];
  const M = ctx?.materials?.mechSet ? ctx.materials.mechSet(scheme) : fallbackMechSet(scheme);
  const coreMat = ctx?.materials?.glow ? ctx.materials.glow(0xfff0d0, 0.9) : M.flame;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  root.name = 'mech:' + design;
  const pelvis = new THREE.Group(); pelvis.position.y = 5.4; body.add(pelvis);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 1.2, -0.1, 0); pelvis.add(hip);
    const knee = new THREE.Group(); knee.position.set(0, -2.7, 0); hip.add(knee);
    const ankle = new THREE.Group(); ankle.position.set(0, -2.4, 0.1); knee.add(ankle);
    legs.push({ hip, knee, ankle, side });
  }
  const torso = new THREE.Group(); torso.position.y = 6.0; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 3.3, -0.25); torso.add(head);
  const flames = [];
  const nozzleGeo = KIT.cylinder(0.42, 0.5, 0.7, 12);
  for (const side of [-1, 1]) {
    const nz = new THREE.Mesh(nozzleGeo, M.dark); nz.position.set(side * 0.72, 1.3, 2.5); nz.castShadow = nz.receiveShadow = true;
    nz.rotation.x = Math.PI / 2; torso.add(nz);
    const f = new THREE.Mesh(flameGeo, M.flame); f.position.set(side * 0.72, 1.3, 2.85); f.visible = false; torso.add(f);   // hidden until animateMech
    const c = new THREE.Mesh(coreGeo, coreMat); f.add(c);
    flames.push(f);
  }
  // hover vents (downward)
  const vents = [];
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(flameGeo, M.flame); f.rotation.x = Math.PI / 2; f.position.set(side * 1.2, 0.3, 1.0); f.scale.set(0.7, 0.7, 0.01); torso.add(f); vents.push(f);
  }
  const arms = {};
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.rotation.order = 'YXZ'; sh.position.set(side * 2.5, 2.3, 0); torso.add(sh);
    const el = new THREE.Group(); el.position.set(0, -2.0, 0); sh.add(el);
    arms[side < 0 ? 'L' : 'R'] = { sh, el };
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.5, -5.8); arms.R.el.add(muzzle);
  const muzzleL = new THREE.Object3D(); muzzleL.position.set(0, -0.55, -2.8); arms.L.el.add(muzzleL);
  const blade = new THREE.Mesh(bladeGeo, M.blade); blade.position.set(0, -0.55, -6.2); blade.visible = false; arms.L.el.add(blade);
  const bladeCore = new THREE.Mesh(bladeCoreGeo, coreMat); blade.add(bladeCore);
  const pod = new THREE.Group(); pod.position.set(1.6, 3.4, 0.7); torso.add(pod);
  D.build({ pelvis, legs, torso, head, arms, pod }, M, KIT);

  // part mounts (P3 attaches PART_VISUALS here)
  const mounts = { R: new THREE.Group(), L: new THREE.Group(), S: new THREE.Group(), U: new THREE.Group() };
  mounts.R.position.set(0, -0.5, -3.0); arms.R.el.add(mounts.R);
  mounts.L.position.set(0, -0.55, -1.8); arms.L.el.add(mounts.L);
  pod.add(mounts.S);
  mounts.U.position.set(0, 1.6, 1.5); torso.add(mounts.U);
  for (const k in mounts) mounts[k].name = 'mount' + k;

  if (o.shadows === false) root.traverse(m => { if (m.isMesh) { m.castShadow = false; } });

  const rig = {
    root, body, pelvis, torso, head, legs, arms, pod, muzzle, muzzleL, blade, flames, vents, mounts,
    mats: M, scheme, design,
    parts: {},
    setParts(parts = {}) {
      const K = KIT.acKit(DESIGN_BEVEL[design] ?? 0.07);
      for (const slot of ['R', 'L', 'S', 'U']) {
        if (!(slot in parts)) continue;
        rig.parts[slot] = parts[slot];
        const mount = mounts[slot];
        for (const c of mount.children.slice()) mount.remove(c);
        const vis = PARTS[parts[slot]]?.visual;
        const fn = vis && PART_VISUALS[vis];
        if (fn) fn(K, M, mount);
      }
    },
    dispose() { root.parent?.remove(root); },
  };
  if (o.parts) rig.setParts(o.parts);
  return rig;
}

/** Port of animateAC. st: { fwd, lat, onGround, pitch, aimYaw?, thrust, hover, landT, bladeT?, bladeWind?, recoil?, crouch? } */
export function animateMech(ac, st, dt) {
  const air = st.onGround ? 0 : 1;
  ac._air = damp(ac._air || 0, air, 8, dt);
  const a = lerp(0.32 + clamp(Math.abs(st.fwd) / 40, 0, 1) * 0.12, 0.18, ac._air) + st.landT * 1.4 + (st.crouch || 0);
  const drop = 5.0 * (1 - Math.cos(a));
  ac.pelvis.position.y = 5.4 - drop * (1 - ac._air * 0.6);
  ac.torso.position.y = 6.0 - drop * (1 - ac._air * 0.6);
  for (const L of ac.legs) {
    const stride = st.onGround ? clamp(st.fwd / 35, -1, 1) * 0.25 * (L.side > 0 ? 1 : -0.6) : 0;
    const spread = clamp(st.lat / 35, -1, 1) * 0.18;
    L.hip.rotation.x = damp(L.hip.rotation.x, -a - stride + ac._air * 0.25 * (L.side > 0 ? 1 : 0.4), 10, dt);
    L.knee.rotation.x = damp(L.knee.rotation.x, a * 2 + ac._air * 0.3, 10, dt);
    L.ankle.rotation.x = damp(L.ankle.rotation.x, -a + stride * 0.5 - ac._air * 0.3, 10, dt);
    L.hip.rotation.z = damp(L.hip.rotation.z, -spread + L.side * 0.04, 8, dt);
  }
  ac.body.rotation.x = damp(ac.body.rotation.x, -clamp(st.fwd, -60, 90) * 0.0045, 6, dt);
  ac.body.rotation.z = damp(ac.body.rotation.z, -clamp(st.lat, -90, 90) * 0.004, 6, dt);
  ac.head.rotation.x = damp(ac.head.rotation.x, st.pitch * 0.5, 10, dt);
  ac.arms.R.sh.rotation.x = damp(ac.arms.R.sh.rotation.x, st.pitch + (st.recoil || 0) * 0.25, 18, dt);
  ac.arms.R.sh.rotation.y = damp(ac.arms.R.sh.rotation.y, clamp(st.aimYaw || 0, -0.5, 0.5), 14, dt);
  const bl = st.bladeT || 0;
  const swing = bl > 0 ? Math.sin((1 - bl / 0.4) * Math.PI) : 0;
  ac.arms.L.sh.rotation.x = damp(ac.arms.L.sh.rotation.x, st.pitch * 0.6 + (st.bladeWind ? 0.9 : 0) + swing * 0.3, 16, dt);
  ac.arms.L.sh.rotation.y = damp(ac.arms.L.sh.rotation.y, (st.bladeWind ? 0.9 : 0) - swing * 1.6, 16, dt);
  ac.blade.visible = bl > 0 || !!st.bladeWind;
  ac.blade.scale.z = st.bladeWind ? 0.6 + Math.random() * 0.1 : 1;
  const th = st.thrust;
  for (const f of ac.flames) { const l = th * (0.85 + Math.random() * 0.3); f.scale.set(0.6 + th * 0.6, 0.6 + th * 0.6, Math.max(0.01, l)); f.visible = l > 0.03; }
  for (const f of ac.vents) { const l = st.hover * (0.8 + Math.random() * 0.4); f.scale.set(0.7, 0.7, Math.max(0.01, l)); f.visible = l > 0.03; }
}

/** A posed, darkened, broken mech (replaces the prototype's per-instance material clone with shared darkened materials). */
export function buildMechWreck(ctx, scheme, seed = 1) {
  const rng = mulberry32(seed);
  const dk = (c) => '#' + new THREE.Color(c ?? 0x3a2a24).multiplyScalar(0.55).getHexString();
  const s = { design: scheme.design, base: dk(scheme.base), mid: dk(scheme.mid), accent: dk(scheme.accent), visor: '#111111',
              flame: scheme.flame, blade: scheme.blade, dark: '#121214' };
  const rig = buildMech(ctx, s, { shadows: true });
  rig.flames.forEach(f => (f.visible = false)); rig.vents.forEach(f => (f.visible = false));
  animateMech(rig, { fwd: 0, lat: 0, onGround: true, pitch: -0.5, thrust: 0, hover: 0, landT: 0.2 }, 1);
  rig.flames.forEach(f => (f.visible = false)); rig.vents.forEach(f => (f.visible = false));
  rig.root.rotation.set(0.15 + rng() * 0.1, rng() * Math.PI * 2, 1.2 + rng() * 0.3);
  rig.root.position.y = 1.2;
  const wrap = new THREE.Group();
  wrap.name = 'mechWreck';
  wrap.add(rig.root);
  wrap.userData.rig = rig;
  return wrap;
}
