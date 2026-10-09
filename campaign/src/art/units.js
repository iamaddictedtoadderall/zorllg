// art/units.js (P3) — P0 STUB: boxy rigs that expose every required part name and muzzle count (§4.3 table).
// P3 replaces every model with bevelled kit art; part names, muzzles, hit volumes and rad/hgt must keep working.
import * as THREE from 'three';
import { bevelBox, cylinder } from './kit.js';

export const UNIT_MODELS = ['drone', 'tank', 'tank_heavy', 'turret', 'gunship', 'walker', 'artillery', 'apc', 'dropship', 'beacon'];

function mats(ctx, faction) {
  if (faction && typeof faction === 'object' && faction.shell) return faction;
  if (ctx?.materials?.factionSet) return ctx.materials.factionSet(faction || 'hostile');
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3 });
  return { shell: m(0x9a958a), mid: m(0x6c6a64), accent: m(0x8f2a22), dark: m(0x141416),
           eye: new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3b1f, emissiveIntensity: 3 }),
           glow: new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }) };
}
function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(bevelBox(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(cylinder(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function group(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g;
}
function muzzle(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = 'muzzle'; parent.add(o); return o; }

export function buildUnit(ctx, kind, faction, o = {}) {
  const M = mats(ctx, faction);
  const S = o.scale ?? 1;
  const root = new THREE.Group();
  root.name = 'unit:' + kind;
  const inner = group(root, 'scaled'); inner.scale.setScalar(S);
  const parts = {}, muzzles = [], eyes = [];
  let hit = { center: [0, 2, 0], r: 3 }, rad = 2, hgt = 3;
  const eye = (p, w, h, x, y, z) => { const e = box(p, w, h, 0.2, M.eye, x, y, z); e.castShadow = false; eyes.push(e); return e; };

  switch (kind) {
    case 'drone': {
      const body = parts.body = group(inner, 'body');
      box(body, 3.4, 1.2, 4, M.shell);
      for (const s of [-1, 1]) box(body, 0.8, 0.6, 2.0, M.accent, s * 2.0, 0, 0.2).rotation.z = s * 0.2;
      const ring = parts.ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 6, 24), M.dark);
      ring.rotation.x = Math.PI / 2; body.add(ring);
      eye(body, 0.6, 0.3, 0, 0, -2.05);
      muzzles.push(muzzle(body, 0, 0, -2.4));
      hit = { center: [0, 0, 0], r: 2.7 }; rad = 2; hgt = 2;
      break;
    }
    case 'tank': case 'tank_heavy': case 'artillery': {
      const heavy = kind === 'tank_heavy', k = heavy ? 1.45 : 1;
      const chassis = parts.chassis = group(inner, 'chassis');
      box(chassis, 4.6 * k, 1.6 * k, 7 * k, M.shell, 0, 1.7 * k, 0);
      for (const s of [-1, 1]) box(chassis, 1.3 * k, 1.6 * k, 7.6 * k, M.dark, s * 2.8 * k, 0.9 * k, 0);
      const turret = parts.turret = group(inner, 'turret', 0, 2.9 * k, 0);
      box(turret, 3.2 * k, 1.4 * k, 3.6 * k, M.shell, 0, 0.5 * k, 0.3 * k);
      eye(turret, 1.0 * k, 0.3 * k, 1.0 * k, 0.9 * k, -1.5 * k);
      const bp = parts.barrelPivot = group(turret, 'barrelPivot', 0, 0.5 * k, -1.2 * k);
      const barrels = heavy ? [-0.5, 0.5] : [0];
      const len = kind === 'artillery' ? 8 : 5.5;
      for (const bx of barrels) {
        const b = cyl(bp, 0.28 * k, 0.34 * k, len * k, M.dark, bx * k, 0, -len / 2 * k, 8); b.rotation.x = Math.PI / 2;
        muzzles.push(muzzle(bp, bx * k, 0, -len * k));
      }
      if (kind === 'artillery') bp.rotation.x = 0.6;
      hit = { center: [0, 2.2 * k, 0], r: 4.2 * k, yScale: 1.6 }; rad = 4 * k; hgt = 4 * k;
      break;
    }
    case 'turret': {
      const base = parts.base = group(inner, 'base');
      cyl(base, 1.6, 2.0, 1.6, M.dark, 0, 0.8, 0);
      const head = parts.head = group(inner, 'head', 0, 2.4, 0);
      box(head, 2.4, 1.6, 2.6, M.shell);
      eye(head, 0.8, 0.25, 0, 0.4, -1.35);
      for (const s of [-1, 1]) {
        const b = cyl(head, 0.16, 0.18, 2.6, M.dark, s * 0.6, -0.2, -2.2, 6); b.rotation.x = Math.PI / 2;
        muzzles.push(muzzle(head, s * 0.6, -0.2, -3.6));
      }
      hit = { center: [0, 2.2, 0], r: 2.8 }; rad = 2; hgt = 4;
      break;
    }
    case 'gunship': {
      const body = parts.body = group(inner, 'body');
      box(body, 3.2, 2.4, 9, M.shell);
      box(body, 1.2, 1.0, 5, M.mid, 0, 0.4, 6);
      for (const s of [-1, 1]) {
        const rotor = parts[s < 0 ? 'rotorL' : 'rotorR'] = group(body, s < 0 ? 'rotorL' : 'rotorR', s * 4.2, 1.2, -0.5);
        box(rotor, 7, 0.12, 0.5, M.dark);
        const pod = parts[s < 0 ? 'podL' : 'podR'] = group(body, s < 0 ? 'podL' : 'podR', s * 2.4, -0.8, -1);
        box(pod, 0.9, 0.9, 2.4, M.accent);
      }
      const turret = parts.turret = group(body, 'turret', 0, -1.5, -3.6);
      box(turret, 1.2, 0.8, 1.2, M.dark);
      for (const s of [-1, 1]) muzzles.push(muzzle(turret, s * 0.3, -0.1, -1.2));
      eye(body, 0.9, 0.3, 0, 0.4, -4.55);
      hit = { center: [0, 0, 0], r: 4.5 }; rad = 4; hgt = 3;
      break;
    }
    case 'walker': {
      const body = parts.body = group(inner, 'body', 0, 7, 0);
      box(body, 6, 3, 8, M.shell);
      const turret = parts.turret = group(body, 'turret', 0, 2.2, 0);
      box(turret, 3.4, 1.6, 4, M.mid);
      eye(turret, 1.2, 0.3, 0, 0.3, -2.05);
      for (const s of [-1, 1]) {
        const b = cyl(turret, 0.3, 0.36, 5, M.dark, s * 0.8, 0, -4, 8); b.rotation.x = Math.PI / 2;
        muzzles.push(muzzle(turret, s * 0.8, 0, -6.5));
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
        const leg = parts['leg' + i] = group(body, 'leg' + i, sx * 3.4, -0.5, sz * 3.2);
        box(leg, 0.9, 4, 0.9, M.dark, 0, -2, 0);
        const knee = group(leg, 'knee', 0, -4, 0);
        box(knee, 0.8, 3, 0.8, M.mid, 0, -1.5, 0);
        const foot = group(knee, 'foot', 0, -3, 0);
        box(foot, 1.6, 0.4, 1.6, M.dark, 0, -0.2, 0);
        leg.userData.knee = knee; leg.userData.foot = foot;
      });
      hit = { center: [0, 7, 0], r: 5.5 }; rad = 5; hgt = 10;
      break;
    }
    case 'apc': {
      const chassis = parts.chassis = group(inner, 'chassis');
      box(chassis, 4.4, 2.6, 9, M.shell, 0, 2.1, 0);
      for (const s of [-1, 1]) box(chassis, 1.0, 1.4, 8.6, M.dark, s * 2.5, 0.8, 0);
      const hatch = parts.hatch = group(chassis, 'hatch', 0, 2.1, 4.55);
      box(hatch, 3, 2, 0.3, M.mid);
      eye(chassis, 1.6, 0.3, 0, 2.8, -4.55);
      hit = { center: [0, 2, 0], r: 4.6, yScale: 1.6 }; rad = 4; hgt = 3.5;
      break;
    }
    case 'dropship': {
      const body = parts.body = group(inner, 'body');
      box(body, 8, 4, 22, M.shell);
      box(body, 14, 0.6, 5, M.mid, 0, 1.2, 2);
      const bay = parts.bay = group(body, 'bay', 0, -2.4, 2);
      box(bay, 5, 0.4, 8, M.dark);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
        const t = parts['thrust' + i] = group(body, 'thrust' + i, sx * 6, -0.5, sz * 6);
        cyl(t, 1.1, 1.3, 1.6, M.dark);
      });
      eye(body, 2, 0.4, 0, 0.8, -11.05);
      hit = { center: [0, 0, 0], r: 11 }; rad = 9; hgt = 5;
      break;
    }
    case 'beacon': {
      const body = parts.body = group(inner, 'body');
      cyl(body, 2.4, 3.2, 2, M.dark, 0, 1, 0, 8);
      const spire = parts.spire = group(body, 'spire');
      cyl(spire, 0.6, 1.2, 14, M.shell, 0, 9, 0, 6);
      box(spire, 1.4, 1.4, 1.4, M.accent, 0, 16.5, 0);
      const beam = parts.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 900, 8, 1, true), M.glow);
      beam.position.y = 460; beam.name = 'beam'; body.add(beam);
      hit = { center: [0, 8, 0], r: 3.5 }; rad = 3; hgt = 18;
      break;
    }
    default: {
      console.warn('[units] unknown unit model', kind);
      parts.body = group(inner, 'body');
      box(parts.body, 3, 3, 3, M.shell, 0, 1.5, 0);
      hit = { center: [0, 1.5, 0], r: 2.5 };
    }
  }
  const rig = {
    kind, root, parts, muzzles, eyes,
    hit: { ...hit, center: hit.center.map(v => v * S), r: hit.r * S }, rad: rad * S, hgt: hgt * S,
    dispose() {
      root.parent?.remove(root);
      root.traverse(m => { if (m.geometry && !m.geometry.userData?.shared) m.geometry.dispose(); });
    },
  };
  return rig;
}

export function animateUnit(rig, dt, st = {}) {
  const p = rig.parts;
  if (p.ring) p.ring.rotation.z += dt * 6;
  if (p.rotorL) p.rotorL.rotation.y += dt * 30;
  if (p.rotorR) p.rotorR.rotation.y -= dt * 30;
}
