// art/mechs.js (P3): mech frames. DESIGNS ports the prototype's AC_DESIGNS line for line (vanguard, striker, bastion),
// plus 'moth' (addendum A5.3). PART_VISUALS builds every loadout visual id (arch C.4 + A3.2). buildMech is the port of
// buildAC with part mounts, design materials and baked rigid skinning (~60 plates → one SkinnedMesh per material);
// animateMech is the port of animateAC plus the kneel (crouch 1) and the optional TEAR pose; buildMechWreck makes a
// posed, scorched, broken static merge.
//
// One change to the ported designs: the right forearm's gun and the left forearm's blade emitter are built into child
// groups (S.arms.R.gun, S.arms.L.emitter) at the forearm's origin, and the shoulder pod into S.pod (a child of the pod
// bone), so a fitted part can replace them. The plates themselves are unchanged.
import * as THREE from 'three';
import * as KIT from './kit.js';
import { clamp, lerp, damp, mulberry32, smooth } from '../core/util.js';
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
      const R = S.arms.R.gun ?? S.arms.R.el, Lf = S.arms.L.emitter ?? S.arms.L.el;
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
      const R = S.arms.R.gun ?? S.arms.R.el, Lf = S.arms.L.emitter ?? S.arms.L.el;
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
      const R = S.arms.R.gun ?? S.arms.R.el, Lf = S.arms.L.emitter ?? S.arms.L.el;
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
  moth: {
    name: 'Moth', desc: 'Cantor frame. The Vanguard silhouette in Founders ceramic and gold.',
    build(S, M, kit = KIT) {
      DESIGNS.vanguard.build(S, M, kit);
      mothDressing(S, M);
    },
  },
};
const DESIGN_BEVEL = { vanguard: 0.07, striker: 0.05, bastion: 0.14, moth: 0.07 };
/** Which visual id each design's built-in weapon stands for (the design's own rendition of that visual). */
const BUILTIN = { R: 'rifle', L: 'blade', S: 'pod4' };

// ------------------------------------------------------------------ helpers
const _v = new THREE.Vector3();
function mk(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, name) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  if (name) m.name = name;
  parent.add(m);
  return m;
}
const ALONG_Z = -Math.PI / 2;   // rotate a +y lathe so it points along −z (forward)
function marker(parent, name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; }
/** A strap of riveted studs between two points (studs ≥ 0.12 m). */
function rivets(parent, mat, a, b, n, r = 0.07) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    mk(parent, KIT.cylinder(r, r * 1.1, 0.06, 6), mat, lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), 0, 0, Math.PI / 2);
  }
}

/** The Founders lattice-ring emblem: a ring of 7 bevelled nodes linked by a hexagonal lattice, in the y–z plane, facing −x. */
function latticeEmblem(parent, mat, darkMat, cx, cy, cz, R = 0.38) {
  const g = new THREE.Group(); g.position.set(cx, cy, cz); parent.add(g);
  const hex = (r) => { const p = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
  mk(g, KIT.plateGeo(KIT.round(hex(R * 1.22), R * 0.25, 2), 0.05, 'side', 0.015), darkMat, 0.02, 0, 0);       // backing plate
  const nodes = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + Math.PI / 2, z = Math.cos(a) * R, y = Math.sin(a) * R;
    nodes.push([0, y, z]);
    mk(g, KIT.plateGeo(hex(R * 0.17), 0.09, 'side', 0.025), mat, -0.03, y, z);
  }
  const inner = hex(R * 0.42).map(([z, y]) => [0, y, z]);
  const bar = (a, b, w) => { const geo = KIT.barBetween(a, b, w, w); geo.translate(-0.02, 0, 0); mk(g, geo, mat); };
  for (let i = 0; i < 7; i++) bar(nodes[i], nodes[(i + 1) % 7], R * 0.06);
  for (let i = 0; i < 6; i++) bar(inner[i], inner[(i + 1) % 6], R * 0.055);
  for (let i = 0; i < 7; i++) {   // spokes: each node to its nearest inner-hex vertex
    let best = 0, bd = Infinity;
    for (let k = 0; k < 6; k++) { const d = Math.hypot(inner[k][1] - nodes[i][1], inner[k][2] - nodes[i][2]); if (d < bd) { bd = d; best = k; } }
    bar(nodes[i], inner[best], R * 0.045);
  }
  return g;
}
/** Moth: the Vanguard build plus the lattice-ring emblem on the left shoulder and gold seam trims. */
function mothDressing(S, M) {
  const A = S.arms.L;
  latticeEmblem(A.sh, M.acc, M.dark, -1.1, 0.12, -0.05, 0.36);
  // gold seam trims down the chest and a collar band (Founders: one strip per face, the curves do the rest)
  for (const s of [-1, 1]) mk(S.torso, KIT.plateGeo([[-1.56, 1.6], [-1.51, 2.32], [-1.44, 2.32], [-1.49, 1.6]], 0.07, 'side', 0.015), M.acc, s * 0.98, 0, 0);
  mk(S.head, KIT.plateGeo([[-0.8, 0.6], [-0.72, 0.7], [0.55, 0.72], [0.56, 0.62]], 1.04, 'side', 0.015), M.acc, 0, 0, 0);
}

// ------------------------------------------------------------------ part visuals
const DREDGE_LIB = { iron: ['ironBlack', '#1c1b1d', 0.62, 0.55, 0.7], oxide: ['oxide', '#7d2a1c', 0.6, 0.3, 0.6], steel: ['steel', '#5b5e62', 0.38, 0.9, 1.0] };
/** Extra materials part visuals use (Dredge iron/oxide, bare steel, a warning lens), from the library when it has them. */
const PART_MATS = new WeakMap();
function partMaterials(ctx, M) {
  if (PART_MATS.has(M)) return PART_MATS.get(M);
  const lib = (key) => {
    const [name, color, r, m, env] = DREDGE_LIB[key];
    const got = ctx?.materials?.get?.(name);
    if (got && got.name === name) return got;
    if (ctx?.materials?.standard) return ctx.materials.standard({ color, roughness: r, metalness: m, envMapIntensity: env, wear: 0.6 });
    return new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });
  };
  const PM = { ...M, iron: lib('iron'), oxide: lib('oxide'), steel: lib('steel') };
  PM.warn = ctx?.materials?.emissive ? ctx.materials.emissive('#ff2a1a', 3) : M.visor;
  PART_MATS.set(M, PM);
  return PM;
}
/** Visual builders for loadout PARTS[].visual (arch C.4, A3.2). Signature (K: acKit with the frame's bevel,
 *  M: MechMaterials (+ iron, oxide, steel, warn), mount: Object3D). Mount frames: R and L at the front of the forearm on
 *  the weapon axis (forward −z); S on the shoulder-pod bone; U on the upper back. A child Object3D named 'muzzle'
 *  (R/S) or 'muzzleL' (L) moves the rig's muzzle there. */
export const PART_VISUALS = {
  rifle(K, M, mount) {   // generic rifle (the three prototype frames use their own built-in rifle instead)
    K.side(mount, [[0.9, 0.15], [0.9, -0.3], [-1.6, -0.28], [-1.8, -0.05], [-1.8, 0.15]], 0.5, M.dark);
    K.side(mount, [[-0.2, -0.3], [-0.6, -0.3], [-0.5, -0.9], [-0.15, -0.9]], 0.32, M.mid);
    K.side(mount, [[-0.4, 0.22], [-1.2, 0.22], [-1.15, 0.36], [-0.5, 0.36]], 0.22, M.acc, 0, 0, 0, 0.03);
    K.joint(mount, 0.12, 1.8, M.dark, 0, 0, -2.6, 'z');
    K.joint(mount, 0.19, 0.42, M.dark, 0, 0, -3.4, 'z');
    marker(mount, 'muzzle', 0, 0, -3.65);
  },
  mg(K, M, mount) {   // rotary machine gun: six barrels, clamp rings, drum housing, side box magazine with feed chute
    mk(mount, KIT.cylinder(0.42, 0.46, 1.1, 14), M.dark, 0, 0, -0.35, ALONG_Z);
    mk(mount, KIT.ring(0.36, 0.12, 0.14), M.acc, 0, 0, -0.95, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      K.joint(mount, 0.065, 2.2, M.dark, Math.cos(a) * 0.22, Math.sin(a) * 0.22, -2.0, 'z');
    }
    for (const z of [-1.6, -2.75]) mk(mount, KIT.ring(0.25, 0.12, 0.16), M.dark, 0, 0, z, Math.PI / 2);
    mk(mount, KIT.cylinder(0.12, 0.12, 2.3, 8), M.dark, 0, 0, -2.0, ALONG_Z);
    K.side(mount, [[0.7, 0.2], [0.7, -0.75], [-0.1, -0.85], [-0.25, -0.4], [-0.1, 0.2]], 0.55, M.mid, 0.62, -0.1, 0);
    mk(mount, KIT.ribbedPlate(0.9, 0.85, 0.06, { pitch: 0.22, axis: 'y' }), M.mid, 0.92, -0.35, 0.25, 0, Math.PI / 2, 0);
    mk(mount, KIT.pipeRun([[0.6, -0.2, -0.2], [0.35, -0.2, -0.2], [0.3, -0.05, -0.55]], 0.09, { flangeEnds: false }), M.dark);
    marker(mount, 'muzzle', 0, 0, -3.2);
  },
  shotgun(K, M, mount) {   // the Dredge Sleet Gun: black iron and oxide red on visible adapter brackets (A2 #15)
    // adapter bracket clamping the forearm: two iron straps with riveted lugs
    for (const z of [0.55, -0.1]) {
      mk(mount, KIT.plateGeo(KIT.chamferRect(1.36, 1.25, 0.12), 0.26, 'front', 0.04, { holes: [KIT.chamferRect(1.06, 0.98, 0.06, 0, 0.12)] }), M.dark, 0, 0.62, z);
      rivets(mount, M.iron, [0.69, 0.25, z - 0.06], [0.69, 0.95, z - 0.06], 3, 0.06);
      rivets(mount, M.iron, [-0.69, 0.25, z - 0.06], [-0.69, 0.95, z - 0.06], 3, 0.06);
    }
    // receiver: a stubby iron block with an oxide cover plate
    K.side(mount, [[0.9, 0.1], [0.9, -0.55], [-1.0, -0.6], [-1.25, -0.3], [-1.25, 0.1]], 0.78, M.iron);
    mk(mount, KIT.armourPlate(KIT.chamferRect(1.6, 0.42, 0.1), 0.08), M.oxide, 0, 0.2, -0.15, -Math.PI / 2, 0, 0);
    // ventilated shroud around the short wide barrel
    const shroud = KIT.plateGeo(KIT.chamferRect(0.86, 0.72, 0.18), 1.5, 'front', 0.05, { holes: [KIT.chamferRect(0.56, 0.44, 0.1)] });
    mk(mount, shroud, M.iron, 0, -0.18, -2.0);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) mk(mount, KIT.plateBox(0.05, 0.16, 0.24, 0.015), M.oxide, s * 0.44, -0.1, -1.45 - i * 0.36);
    mk(mount, KIT.cylinder(0.27, 0.27, 1.6, 12), M.dark, 0, -0.18, -1.95, ALONG_Z);
    mk(mount, KIT.ring(0.3, 0.12, 0.2), M.iron, 0, -0.18, -2.8, Math.PI / 2);
    // drum magazine below, iron with an oxide band
    mk(mount, KIT.drum(0.46, 0.5, 1, 16), M.iron, -0.25, -0.95, -0.5, 0, 0, Math.PI / 2);
    mk(mount, KIT.ring(0.47, 0.05, 0.12), M.oxide, 0.0, -0.95, -0.5, 0, 0, Math.PI / 2);
    mk(mount, KIT.plateBox(0.3, 0.3, 0.4, 0.04), M.dark, 0, -0.55, -0.5);
    marker(mount, 'muzzle', 0, -0.18, -2.95);
  },
  cannon(K, M, mount) {   // heavy cannon: long tapered barrel, slotted muzzle brake, recoil cylinders, breech block
    K.side(mount, [[0.9, 0.3], [0.9, -0.5], [-0.8, -0.55], [-1.1, -0.2], [-1.1, 0.3]], 0.95, M.dark);
    K.side(mount, [[0.6, 0.3], [0.7, 0.7], [-0.6, 0.72], [-0.75, 0.3]], 0.7, M.mid);
    mk(mount, KIT.cylinder(0.2, 0.3, 3.8, 14), M.dark, 0, -0.05, -2.9, ALONG_Z);
    for (const z of [-1.4, -2.6]) mk(mount, KIT.ring(0.31, 0.1, 0.18), M.mid, 0, -0.05, z, Math.PI / 2);
    for (const s of [-1, 1]) K.joint(mount, 0.1, 1.6, M.mid, s * 0.32, 0.38, -1.45, 'z');
    const brake = KIT.plateGeo(KIT.chamferRect(0.78, 0.6, 0.14), 0.7, 'front', 0.04, { holes: [KIT.chamferRect(0.28, 0.22, 0.04, -0.22, 0), KIT.chamferRect(0.28, 0.22, 0.04, 0.22, 0)] });
    mk(mount, brake, M.dark, 0, -0.05, -5.05);
    mk(mount, KIT.cylinder(0.22, 0.22, 0.75, 12), M.dark, 0, -0.05, -5.05, ALONG_Z);
    mk(mount, KIT.plateBox(0.5, 0.36, 0.6, 0.05), M.acc, 0, -0.68, 0.1);
    marker(mount, 'muzzle', 0, -0.05, -5.45);
  },
  blade(K, M, mount) {   // generic emitter
    K.side(mount, [[0.8, 0.25], [0.65, -0.3], [-0.4, -0.3], [-0.65, 0.0], [-0.4, 0.25]], 0.7, M.dark);
    K.joint(mount, 0.3, 0.3, M.acc, 0, 0, -0.6, 'z');
    marker(mount, 'muzzleL', 0, 0, -0.8);
  },
  blade_heavy(K, M, mount) {   // heavy emitter: wider housing, heat-sink fins, twin prongs
    K.side(mount, [[0.9, 0.38], [0.8, -0.42], [-0.5, -0.45], [-0.85, -0.05], [-0.55, 0.38]], 0.95, M.dark);
    for (let i = 0; i < 5; i++) mk(mount, KIT.plateBox(1.05, 0.06, 0.16, 0.015), M.mid, 0, 0.42 + i * 0.002, 0.65 - i * 0.24);
    for (const s of [-1, 1]) K.side(mount, [[-0.6, 0.12], [-1.15, 0.05], [-1.2, -0.12], [-0.6, -0.15]], 0.12, M.acc, s * 0.3, 0, 0, 0.02);
    K.joint(mount, 0.36, 0.34, M.acc, 0, 0, -0.95, 'z');
    mk(mount, KIT.ring(0.42, 0.08, 0.12), M.dark, 0, 0, -0.75, Math.PI / 2);
    marker(mount, 'muzzleL', 0, 0, -1.15);
  },
  harpoon(K, M, mount) {   // Gaff Harpoon: Dredge launcher and cable reel replacing the blade emitter (A5.3)
    for (const z of [0.5, -0.15]) {   // adapter straps
      mk(mount, KIT.plateGeo(KIT.chamferRect(1.36, 1.25, 0.12), 0.24, 'front', 0.04, { holes: [KIT.chamferRect(1.06, 0.98, 0.06, 0, 0.12)] }), M.dark, 0, 0.6, z);
      rivets(mount, M.iron, [-0.69, 0.3, z - 0.06], [-0.69, 0.95, z - 0.06], 3, 0.06);
    }
    mk(mount, KIT.cylinder(0.26, 0.3, 2.0, 12), M.iron, 0, -0.12, -0.75, ALONG_Z);              // launcher tube
    mk(mount, KIT.ring(0.31, 0.12, 0.22), M.oxide, 0, -0.12, -1.7, Math.PI / 2);
    mk(mount, KIT.ring(0.31, 0.1, 0.16), M.oxide, 0, -0.12, 0.1, Math.PI / 2);
    // barbed head poking out of the muzzle
    const head = [[0, 0.0], [-0.55, 0.0], [-0.9, 0.14], [-0.55, 0.2], [-0.45, 0.12], [-0.2, 0.36], [-0.32, 0.12], [0, 0.12]];
    mk(mount, KIT.plateGeo(head, 0.12, 'side', 0.02), M.iron, 0, -0.18, -1.85);
    mk(mount, KIT.plateGeo(head.map(([a, b]) => [a, -b + 0.12]), 0.12, 'side', 0.02), M.iron, 0, -0.18, -1.85);
    // cable reel on the outer (−x) side, with wraps of cable
    mk(mount, KIT.drum(0.42, 0.36, 0, 16), M.iron, -0.62, -0.1, 0.05, 0, 0, Math.PI / 2);
    for (const r of [0.34, 0.3]) mk(mount, KIT.ring(r, 0.07, 0.24), M.dark, -0.8, -0.1, 0.05, 0, 0, Math.PI / 2);
    mk(mount, KIT.plateGeo([[0.45, 0.4], [-0.35, 0.4], [-0.5, -0.1], [-0.2, -0.55], [0.45, -0.55]], 0.08, 'side', 0.02), M.oxide, -1.02, -0.1, 0.05);
    mk(mount, KIT.cylinder(0.08, 0.08, 0.5, 8), M.iron, -0.5, -0.1, -0.5, ALONG_Z);            // guide roller
    marker(mount, 'muzzleL', 0, -0.12, -1.9);
  },
  pod4(K, M, mount) {   // generic four-cell missile box
    K.side(mount, [[-1.0, -0.5], [-1.05, 0.35], [-0.7, 0.55], [1.0, 0.55], [1.0, -0.5]], 1.3, M.mid);
    K.cells(mount, 2, 2, M.dark, -1.06, 0.8, 0.6, -0.05);
    marker(mount, 'muzzle', 0, 0, -1.2);
  },
  pod8(K, M, mount) {   // micro-missile box: wider, 4 × 2 cells, armoured lid, side rails
    K.side(mount, [[-1.1, -0.55], [-1.15, 0.38], [-0.75, 0.62], [1.05, 0.62], [1.05, -0.55]], 1.7, M.mid);
    K.cells(mount, 4, 2, M.dark, -1.16, 1.3, 0.6, -0.05);
    mk(mount, KIT.armourPlate(KIT.chamferRect(1.5, 1.6, 0.25), 0.1), M.acc, 0, 0.68, -0.1, -Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) K.side(mount, [[-0.9, -0.15], [0.9, -0.15], [0.9, -0.35], [-0.9, -0.35]], 0.12, M.dark, s * 0.92, 0, 0, 0.03);
    marker(mount, 'muzzle', 0, 0, -1.3);
  },
  mortar(K, M, mount) {   // three short mortar tubes on a turntable, angled up and forward, with an ammo box
    mk(mount, KIT.cylinder(0.75, 0.85, 0.35, 16), M.dark, 0, -0.35, 0.1);
    K.side(mount, [[0.9, -0.2], [0.9, 0.3], [-0.2, 0.3], [-0.5, -0.2]], 1.3, M.mid);
    const tubes = new THREE.Group(); tubes.position.set(0, 0.2, -0.2); tubes.rotation.x = 0.85; mount.add(tubes);
    for (const x of [-0.42, 0, 0.42]) {
      mk(tubes, KIT.cylinder(0.17, 0.2, 1.7, 12), M.dark, x, 0.75, 0);
      mk(tubes, KIT.ring(0.21, 0.08, 0.14), M.acc, x, 1.55, 0);
      mk(tubes, KIT.ring(0.22, 0.08, 0.1), M.mid, x, 0.35, 0);
    }
    mk(mount, KIT.ribbedPlate(0.9, 0.5, 0.5, { pitch: 0.2 }), M.acc, 0, -0.1, 0.75);
    marker(tubes, 'muzzle', 0, 1.65, 0);
  },
  flarepod(K, M, mount) {   // Flare Pod: a six-tube Dredge pod on the shoulder mount (A5.3)
    mk(mount, KIT.plateGeo(KIT.chamferRect(1.5, 0.3, 0.06), 1.6, 'front', 0.04), M.dark, 0, -0.55, 0.15);   // adapter plate
    rivets(mount, M.iron, [-0.7, -0.4, -0.6], [0.7, -0.4, -0.6], 4, 0.06);
    const box = new THREE.Group(); box.position.set(0, 0.05, 0.1); box.rotation.x = 0.45; mount.add(box);
    mk(box, KIT.panelBox(1.3, 0.95, 1.5, { cols: 2, rows: 1, inset: 0.05 }), M.iron, 0, 0, 0);
    for (const s of [-1, 1]) mk(box, KIT.armourPlate(KIT.chamferRect(1.3, 0.8, 0.18), 0.07), M.oxide, s * 0.68, 0, 0.05, 0, s * Math.PI / 2, 0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = (i - 1) * 0.4, y = (j - 0.5) * 0.42;
      mk(box, KIT.cylinder(0.14, 0.14, 0.5, 10), M.dark, x, y, -0.8, ALONG_Z);
      mk(box, KIT.ring(0.16, 0.06, 0.1), M.iron, x, y, -1.05, Math.PI / 2);
    }
    mk(box, KIT.plateBox(1.38, 0.08, 0.2, 0.02), M.oxide, 0, 0.5, 0.55);
    marker(box, 'muzzle', 0, 0, -1.15);
  },
  kit(K, M, mount) {   // repair kits: three canisters strapped in a back rack
    K.side(mount, [[0.75, -0.35], [0.75, 0.05], [-0.75, 0.05], [-0.85, -0.35]], 1.05, M.dark);
    for (const x of [-0.32, 0, 0.32]) {
      mk(mount, KIT.drum(0.15, 1.1, 1, 10), M.mid, x, 0.22, 0.5, ALONG_Z);
      mk(mount, KIT.ring(0.155, 0.04, 0.08), M.acc, x, 0.22, -0.1, Math.PI / 2);
    }
    for (const z of [-0.3, 0.25]) mk(mount, KIT.plateBox(1.02, 0.05, 0.1, 0.012), M.dark, 0, 0.39, z);
  },
};
const MOUNTS = { R: [0, -0.5, -2.2], L: [0, -0.55, -2.0], U: [-1.25, 2.95, 1.0] };

// shared FX geometry (flame = outer cone + nested hot core, one additive mesh; blade = tapered edge + core)
let flameGeo = null, bladeGeo = null, ventGeo = null;
function sharedGeos() {
  if (flameGeo) return;
  const outer = new THREE.ConeGeometry(0.42, 3, 10, 1, true); outer.translate(0, 1.5, 0);
  const core = new THREE.ConeGeometry(0.22, 1.6, 8, 1, true); core.translate(0, 0.8, 0);
  flameGeo = KIT.kitMerge([outer, core]); flameGeo.rotateX(Math.PI / 2);
  ventGeo = KIT.kitMerge([[flameGeo, { pos: [-1.2 / 0.7, 0, 0] }], [flameGeo, { pos: [1.2 / 0.7, 0, 0] }]]);
  ventGeo.userData.shared = true;
  const edge = KIT.plateGeo([[3.75, -0.27], [-3.4, -0.27], [-3.75, 0.0], [-3.4, 0.27], [3.75, 0.27]], 0.16, 'side', 0.03);
  const coreB = KIT.plateGeo([[3.7, -0.1], [-3.5, -0.1], [-3.65, 0], [-3.5, 0.1], [3.7, 0.1]], 0.07, 'side', 0.0);
  bladeGeo = KIT.kitMerge([edge, coreB]);
  flameGeo.userData.shared = bladeGeo.userData.shared = true;
}
function fallbackMechSet(s) {
  const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: 0.55 });
  const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  return { base: std(s.base, 0.42, 0.5), mid: std(s.mid, 0.5, 0.45), acc: std(s.accent, 0.45, 0.3), dark: std(s.dark ?? 0x1b1c20, 0.65, 0.5),
           visor: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: s.visor, emissiveIntensity: 2.6 }),
           flame: glow(s.flame ?? 0xff9a3c, 0.85), blade: glow(s.blade ?? 0x8fe9ff, 0.9) };
}
/** MechMaterials for a scheme. Moth gets Founders ceramic and gold (low metalness, clear-coat-like sheen). */
function designMaterials(ctx, scheme, design) {
  const set = ctx?.materials?.mechSet ? ctx.materials.mechSet(scheme) : fallbackMechSet(scheme);
  if (design !== 'moth' || !ctx?.materials?.standard) return set;
  const w = scheme.wear ?? 0.55, std = ctx.materials.standard;
  return { ...set,
    base: std({ color: scheme.base, roughness: 0.36, metalness: 0.05, envMapIntensity: 0.75, wear: w }),
    mid: std({ color: scheme.mid, roughness: 0.48, metalness: 0.05, envMapIntensity: 0.6, wear: Math.min(1, w + 0.15) }),
    acc: std({ color: scheme.accent, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.1, wear: 0.4 }) };
}

/** Port of buildAC. scheme: { design, base, mid, accent, visor, flame?, blade?, dark?, wear? }.
 *  o: { parts: { R, L, S, U } (part ids), shadows (true), bake (true: rigid-skinned, ≤ 12 draw calls) } */
export function buildMech(ctx, scheme, o = {}) {
  sharedGeos();
  const design = DESIGNS[scheme.design] ? scheme.design : 'vanguard';
  const D = DESIGNS[design];
  const M = designMaterials(ctx, scheme, design);
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
    const f = new THREE.Mesh(flameGeo, M.flame); f.position.set(side * 0.72, 1.3, 2.85); f.visible = false; f.name = 'flame'; torso.add(f);
    flames.push(f);
  }
  // hover vents (downward): both cones in one mesh (one draw call); offsets pre-divided by the fixed 0.7 x scale
  const vent = new THREE.Mesh(ventGeo, M.flame); vent.rotation.x = Math.PI / 2; vent.position.set(0, 0.3, 1.0); vent.scale.set(0.7, 0.7, 0.01);
  vent.visible = false; vent.name = 'vents'; torso.add(vent);
  const vents = [vent];
  const arms = {};
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.rotation.order = 'YXZ'; sh.position.set(side * 2.5, 2.3, 0); torso.add(sh);
    const el = new THREE.Group(); el.position.set(0, -2.0, 0); sh.add(el);
    arms[side < 0 ? 'L' : 'R'] = { sh, el };
  }
  // built-in weapon groups (the design's own rifle / emitter / pod) at the forearm and pod origins
  const gun = new THREE.Group(); gun.name = 'builtinR'; arms.R.el.add(gun);
  const emitter = new THREE.Group(); emitter.name = 'builtinL'; arms.L.el.add(emitter);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.5, -5.8); arms.R.el.add(muzzle);
  const muzzleL = new THREE.Object3D(); muzzleL.position.set(0, -0.55, -2.8); arms.L.el.add(muzzleL);
  const blade = new THREE.Mesh(bladeGeo, M.blade); blade.position.set(0, -0.55, -6.2); blade.visible = false; blade.name = 'blade'; arms.L.el.add(blade);
  const pod = new THREE.Group(); pod.position.set(1.6, 3.4, 0.7); torso.add(pod);
  const podShell = new THREE.Group(); podShell.name = 'builtinS'; pod.add(podShell);
  const S = { pelvis, legs, torso, head, arms: { L: { ...arms.L, emitter }, R: { ...arms.R, gun } }, pod: podShell };
  D.build(S, M, KIT);
  const builtin = { R: gun, L: emitter, S: podShell };
  const defaultMuzzle = { R: muzzle.position.clone(), L: muzzleL.position.clone(), S: null };

  const mounts = { R: new THREE.Group(), L: new THREE.Group(), S: new THREE.Group(), U: new THREE.Group() };
  mounts.R.position.set(...MOUNTS.R); arms.R.el.add(mounts.R);
  mounts.L.position.set(...MOUNTS.L); arms.L.el.add(mounts.L);
  pod.add(mounts.S);
  mounts.U.position.set(...MOUNTS.U); torso.add(mounts.U);
  for (const k in mounts) mounts[k].name = 'mount' + k;
  const shadows = o.shadows !== false;
  const bake = o.bake !== false;
  const sphere = { center: [0, 5.2, -0.8], r: 9 };

  const rig = {
    root, body, pelvis, torso, head, legs, arms, pod, muzzle, muzzleL, blade, flames, vents, mounts,
    mats: M, scheme, design,
    parts: {},
    /** extra: the muzzle of the shoulder part (S), when the fitted visual has one */
    muzzleS: null,
    get baked() { return !!root.userData.rigidBake; },
    get drawCalls() { return root.userData.rigidBake?.drawCalls ?? null; },
    setParts(parts = {}) {
      const wasBaked = !!root.userData.rigidBake;
      if (wasBaked) KIT.unbakeRigid(root);
      const K = KIT.acKit(DESIGN_BEVEL[design] ?? 0.07);
      const PM = partMaterials(ctx, M);
      for (const slot of ['R', 'L', 'S', 'U']) {
        if (!(slot in parts)) continue;
        const id = parts[slot];
        rig.parts[slot] = id;
        const mount = mounts[slot];
        for (const c of mount.children.slice()) mount.remove(c);
        const vis = PARTS[id]?.visual ?? ID_VISUAL[id] ?? null;
        const useBuiltin = !!builtin[slot] && (vis == null || vis === BUILTIN[slot]);
        if (builtin[slot]) builtin[slot].visible = useBuiltin;
        if (!useBuiltin && vis) {
          const fn = PART_VISUALS[vis];
          if (fn) fn(K, PM, mount); else warnOnce('part visual ' + vis);
        }
        // muzzles follow the fitted part
        const mz = useBuiltin ? null : mount.getObjectByName(slot === 'L' ? 'muzzleL' : 'muzzle');
        if (slot === 'R') { if (mz) localTo(mz, arms.R.el, muzzle.position); else muzzle.position.copy(defaultMuzzle.R); }
        if (slot === 'L') { if (mz) localTo(mz, arms.L.el, muzzleL.position); else muzzleL.position.copy(defaultMuzzle.L); }
        if (slot === 'S') rig.muzzleS = mz || null;
        if (!shadows) mount.traverse(m => { if (m.isMesh) m.castShadow = false; });
      }
      if (wasBaked || (bake && rig._built)) KIT.bakeRigid(root, { sphere, castShadow: shadows });
    },
    dispose() {
      root.parent?.remove(root);
      const b = root.userData.rigidBake;
      if (b) { for (const sm of b.meshes) sm.geometry.dispose(); b.skeleton.dispose(); }
    },
  };
  if (o.parts) rig.setParts(o.parts);
  if (!shadows) root.traverse(m => { if (m.isMesh) m.castShadow = false; });
  rig._built = true;
  if (bake) KIT.bakeRigid(root, { sphere, castShadow: shadows });
  return rig;
}
const warned = new Set();
/** Visual ids for part ids (arch C.4, A3.2), used while loadout.js does not know a part yet. */
const ID_VISUAL = { rifle_r30: 'rifle', mg_r12: 'mg', shotgun_s8: 'shotgun', cannon_hc90: 'cannon', blade_pb2: 'blade', blade_hx: 'blade_heavy',
                    msl_vm4: 'pod4', msl_sw8: 'pod8', mortar_m3: 'mortar', kit_rk3: 'kit', kit_rk2f: 'kit', harpoon_gaff: 'harpoon', flare_pod: 'flarepod' };
function localTo(obj, bone, out) {
  bone.updateWorldMatrix(true, false);
  obj.updateWorldMatrix(true, false);
  return bone.worldToLocal(obj.getWorldPosition(out));
}
function warnOnce(k) { if (!warned.has(k)) { warned.add(k); console.warn('[mechs] unknown ' + k); } }

// ------------------------------------------------------------------ animation
// Kneel (crouch 1): pelvis 2.55 m (drops 2.6 from standing), thighs back and down, shins folded forward along the ground (knees bent
// ~120°), feet flat, torso pitched forward 12°. Between crouch 0.3 (the prototype's stagger squat) and 1 it blends in.
const KNEEL = { pelvis: 2.55, hip: [-1.0, -0.95], knee: [2.32, 2.26], torsoPitch: -0.21 };
/** Port of animateAC. st: { fwd, lat, onGround, pitch, aimYaw?, thrust, hover, landT, bladeT?, bladeWind?, recoil?,
 *  crouch? (0.3 stagger squat … 1 kneel), tear? (0..1 reach, grab, rip) } */
export function animateMech(ac, st, dt) {
  const air = st.onGround ? 0 : 1;
  ac._air = damp(ac._air || 0, air, 8, dt);
  const crouch = st.crouch || 0;
  const kw = smooth(0.3, 1, crouch);
  ac._kneel = damp(ac._kneel || 0, kw, 3, dt);
  const kn = ac._kneel < 1e-4 && kw === 0 ? 0 : ac._kneel;
  const a = lerp(0.32 + clamp(Math.abs(st.fwd) / 40, 0, 1) * 0.12, 0.18, ac._air) + st.landT * 1.4 + crouch;
  const drop = 5.0 * (1 - Math.cos(a));
  const py = 5.4 - drop * (1 - ac._air * 0.6);
  ac.pelvis.position.y = kn ? lerp(py, KNEEL.pelvis, kn) : py;
  ac.torso.position.y = ac.pelvis.position.y + 0.6;
  for (const L of ac.legs) {
    const stride = st.onGround ? clamp(st.fwd / 35, -1, 1) * 0.25 * (L.side > 0 ? 1 : -0.6) : 0;
    const spread = clamp(st.lat / 35, -1, 1) * 0.18;
    let hx = -a - stride + ac._air * 0.25 * (L.side > 0 ? 1 : 0.4), kx = a * 2 + ac._air * 0.3, ax = -a + stride * 0.5 - ac._air * 0.3;
    if (kn) {
      const i = L.side > 0 ? 1 : 0, kh = KNEEL.hip[i], kk = KNEEL.knee[i];
      hx = lerp(hx, kh, kn); kx = lerp(kx, kk, kn); ax = lerp(ax, -(kh + kk), kn);
    }
    L.hip.rotation.x = damp(L.hip.rotation.x, hx, 10, dt);
    L.knee.rotation.x = damp(L.knee.rotation.x, kx, 10, dt);
    L.ankle.rotation.x = damp(L.ankle.rotation.x, ax, 10, dt);
    L.hip.rotation.z = damp(L.hip.rotation.z, -spread + L.side * 0.04 * (1 + kn), 8, dt);
  }
  ac.body.rotation.x = damp(ac.body.rotation.x, -clamp(st.fwd, -60, 90) * 0.0045, 6, dt);
  ac.body.rotation.z = damp(ac.body.rotation.z, -clamp(st.lat, -90, 90) * 0.004, 6, dt);
  // TEAR (additive): reach 0–0.35, grab 0.35–0.6, rip 0.6–1
  const tr = st.tear || 0;
  const reach = tr > 0 ? smooth(0, 0.3, tr) * (1 - smooth(0.62, 0.85, tr)) : 0, rip = tr > 0 ? smooth(0.6, 0.8, tr) * (1 - smooth(0.9, 1, tr)) : 0;
  ac.torso.rotation.x = damp(ac.torso.rotation.x, KNEEL.torsoPitch * kn - 0.22 * reach + 0.12 * rip, 8, dt);
  ac.torso.rotation.y = damp(ac.torso.rotation.y, 0.45 * rip - 0.15 * reach, 10, dt);
  ac.head.rotation.x = damp(ac.head.rotation.x, st.pitch * 0.5 - KNEEL.torsoPitch * kn * 0.5, 10, dt);
  ac.arms.R.sh.rotation.x = damp(ac.arms.R.sh.rotation.x, st.pitch + (st.recoil || 0) * 0.25 + 0.7 * reach - 0.3 * rip, 18, dt);
  ac.arms.R.sh.rotation.y = damp(ac.arms.R.sh.rotation.y, clamp(st.aimYaw || 0, -0.5, 0.5), 14, dt);
  const bl = st.bladeT || 0;
  const swing = bl > 0 ? Math.sin((1 - bl / 0.4) * Math.PI) : 0;
  ac.arms.L.sh.rotation.x = damp(ac.arms.L.sh.rotation.x, st.pitch * 0.6 + (st.bladeWind ? 0.9 : 0) + swing * 0.3 + 1.15 * reach - 0.5 * rip, 16, dt);
  ac.arms.L.sh.rotation.y = damp(ac.arms.L.sh.rotation.y, (st.bladeWind ? 0.9 : 0) - swing * 1.6 + 0.25 * reach - 1.1 * rip, 16, dt);
  if (tr > 0 || ac.arms.L.el.rotation.x !== 0) {
    ac.arms.L.el.rotation.x = damp(ac.arms.L.el.rotation.x, -0.75 * reach + 0.6 * rip, 16, dt);
    ac.arms.R.el.rotation.x = damp(ac.arms.R.el.rotation.x, -0.4 * reach, 16, dt);
    if (Math.abs(ac.arms.L.el.rotation.x) < 1e-4 && tr === 0) { ac.arms.L.el.rotation.x = 0; ac.arms.R.el.rotation.x = 0; }
  }
  ac.blade.visible = bl > 0 || !!st.bladeWind;
  ac.blade.scale.z = st.bladeWind ? 0.6 + Math.random() * 0.1 : 1;
  const th = st.thrust;
  for (const f of ac.flames) { const l = th * (0.85 + Math.random() * 0.3); f.scale.set(0.6 + th * 0.6, 0.6 + th * 0.6, Math.max(0.01, l)); f.visible = l > 0.03; }
  for (const f of ac.vents) { const l = st.hover * (0.8 + Math.random() * 0.4); f.scale.set(0.7, 0.7, Math.max(0.01, l)); f.visible = l > 0.03; }
}

// ------------------------------------------------------------------ wrecks
/** A posed, scorched, broken mech as a static merge (one mesh per material). Shared darkened materials (cached by colour);
 *  a forearm torn off and lying beside it, plates missing, slumped or fallen by seed. */
export function buildMechWreck(ctx, scheme, seed = 1) {
  const rng = mulberry32((seed >>> 0) * 2654435761 + 7);
  const dk = (c, k = 0.42) => '#' + new THREE.Color(c ?? 0x3a2a24).multiplyScalar(k).getHexString();
  const s = { design: scheme.design || 'vanguard', base: dk(scheme.base), mid: dk(scheme.mid), accent: dk(scheme.accent, 0.5), visor: '#0a0a0a',
              flame: scheme.flame, blade: scheme.blade, dark: '#100f10' };
  const rig = buildMech(ctx, s, { bake: false, parts: scheme.parts });
  const charred = ctx?.materials?.standard
    ? (c, r = 0.85) => ctx.materials.standard({ color: c, roughness: r, metalness: 0.35, envMapIntensity: 0.35, wear: 0.95 })
    : (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.3 });
  const swap = new Map([[rig.mats.base, charred(s.base)], [rig.mats.mid, charred(s.mid)], [rig.mats.acc, charred(s.accent)], [rig.mats.dark, charred('#121212', 0.9)],
                        [rig.mats.visor, charred('#060606', 0.4)]]);
  const fallen = rng() < 0.45;
  for (let i = 0; i < 4; i++) animateMech(rig, { fwd: 0, lat: 0, onGround: true, pitch: -0.6, thrust: 0, hover: 0, landT: 0, crouch: fallen ? 0.3 : 1 }, 1);
  rig.flames.forEach(f => (f.visible = false)); rig.vents.forEach(f => (f.visible = false)); rig.blade.visible = false;
  rig.torso.rotation.x = -0.45 - rng() * 0.2; rig.torso.rotation.z = (rng() - 0.5) * 0.4;
  rig.head.rotation.set(0.5, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.6);
  const lostArm = rng() < 0.5 ? 'L' : 'R';
  rig.arms[lostArm === 'L' ? 'R' : 'L'].sh.rotation.x = -0.2 - rng() * 0.4;
  const B = new KIT.GeoBuilder(seed);
  // the torn-off forearm, lying on the ground beside the frame
  const el = rig.arms[lostArm].el;
  el.updateMatrixWorld(true);
  const elInv = new THREE.Matrix4().copy(el.matrixWorld).invert();
  const lying = new THREE.Matrix4().compose(new THREE.Vector3((lostArm === 'L' ? -1 : 1) * (6 + rng() * 2), 0.5, -2 - rng() * 3),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.2, rng() * Math.PI * 2, 0.3)), new THREE.Vector3(1, 1, 1));
  rig.root.updateMatrixWorld(true);
  el.traverse(c => {
    if (!c.isMesh || !c.visible || c.material.transparent) return;
    let vis = true; for (let p = c; p && p !== el; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
    const m = new THREE.Matrix4().multiplyMatrices(lying, new THREE.Matrix4().multiplyMatrices(elInv, c.matrixWorld));
    B.add(c.geometry, swap.get(c.material) || c.material, m);
  });
  el.visible = false;
  // drop ~12% of the plates, then merge everything that is left
  const keep = [];
  rig.root.traverse(c => { if (c.isMesh && c.visible && !c.material.transparent) keep.push(c); });
  for (const c of keep) if (rng() < 0.12 && c.geometry.attributes.position.count > 60) c.visible = false;
  const W = new THREE.Group(); W.name = 'mechWreck';
  const pose = new THREE.Group();
  if (fallen) { pose.rotation.set(0.1 + rng() * 0.1, 0, (rng() < 0.5 ? -1 : 1) * (1.25 + rng() * 0.2)); pose.position.y = 1.5; }
  else { pose.rotation.set(0.12, 0, (rng() - 0.5) * 0.25); pose.position.y = -0.4; }
  pose.updateMatrix();
  rig.root.updateMatrixWorld(true);
  rig.root.traverse(c => {
    if (!c.isMesh || c.material.transparent) return;
    for (let p = c; p; p = p.parent) if (!p.visible) return;
    B.add(c.geometry, swap.get(c.material) || c.material, new THREE.Matrix4().multiplyMatrices(pose.matrix, c.matrixWorld));
  });
  const merged = B.build({ name: 'mechWreckMerged' });
  W.add(merged);
  W.userData.rig = null;
  W.userData.lod = B.buildSingle(null, { material: ctx?.materials?.standard?.({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0.2 }) });
  W.userData.triangles = merged.userData.triangles;
  return W;
}
