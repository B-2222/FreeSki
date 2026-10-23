// Trees, start gate and finish line.

import * as THREE from 'three';
import type { World } from '@shared/world';

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TreeField {
  group: THREE.Group;
  /** Tree positions (for camera see-through later). */
  positions: THREE.Vector3[];
}

export function buildTrees(world: World): TreeField {
  const base = world.terrain.base;
  const count = world.map.scenery?.treeCount ?? 600;
  const rnd = mulberry(world.map.scenery?.seed ?? 1);
  const hw = base.halfWidth;

  // One pine = stacked cones (merged), plus a trunk.
  const cones: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const r = 1.9 - k * 0.42;
    const h = 2.6 - k * 0.3;
    const c = new THREE.ConeGeometry(r, h, 9, 1);
    c.translate(0, 1.6 + k * 1.25 + h / 2, 0);
    cones.push(c);
  }
  const foliageGeo = mergeGeometries(cones);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.0, 6);
  trunkGeo.translate(0, 1.0, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 1 });
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, count);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  foliage.castShadow = true;
  trunks.castShadow = true;

  const positions: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 6; tries++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (hw + 5 + Math.pow(rnd(), 0.8) * 60);
    const z = 30 - rnd() * (base.length + 80);
    // Keep feature footprints clear.
    let blocked = false;
    for (const f of world.terrain.features) {
      const l = f.toLocal(x, z);
      if (l.u > f.uMin - 3 && l.u < f.uMax + 3 && Math.abs(l.v) < f.vMax + 3) { blocked = true; break; }
    }
    if (blocked) continue;
    const y = world.terrain.height(x, z);
    const sc = 0.7 + rnd() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    s.set(sc, sc * (0.85 + rnd() * 0.4), sc);
    m.compose(new THREE.Vector3(x, y - 0.2, z), q, s);
    foliage.setMatrixAt(placed, m);
    trunks.setMatrixAt(placed, m);
    color.setHSL(0.36 + rnd() * 0.06, 0.35 + rnd() * 0.2, 0.18 + rnd() * 0.1);
    foliage.setColorAt(placed, color);
    positions.push(new THREE.Vector3(x, y, z));
    placed++;
  }
  foliage.count = placed;
  trunks.count = placed;
  const group = new THREE.Group();
  group.add(foliage, trunks);
  return { group, positions };
}

/** Banner texture whose aspect matches the banner, with the text repeated along it. */
function textTexture(text: string, bg: string, fg: string, aspect: number): THREE.Texture {
  const h = 128;
  const w = Math.min(4096, Math.round(h * aspect));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `italic 900 ${Math.round(h * 0.66)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tw = g.measureText(text).width + h * 1.5;
  const n = Math.max(1, Math.floor(w / tw));
  for (let i = 0; i < n; i++) g.fillText(text, (w / n) * (i + 0.5), h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A gate: two posts and a banner across. */
function gate(world: World, z: number, halfWidth: number, text: string, color: string, height: number): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  for (const side of [-1, 1]) {
    const x = side * halfWidth;
    const y = world.terrain.height(x, z);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.35), postMat);
    p.position.set(x, y + height / 2, z);
    p.castShadow = true;
    g.add(p);
    // Tall marker flag.
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    flag.position.set(x + side * 0.6, y + height - 1.3, z);
    g.add(flag);
  }
  const yTop = world.terrain.height(0, z) + height - 0.6;
  // Two single-sided planes back to back so the text reads correctly from both sides.
  const bannerMat = new THREE.MeshStandardMaterial({ map: textTexture(text, color, '#ffffff', (halfWidth * 2) / 1.2), roughness: 0.6 });
  for (const rot of [0, Math.PI]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, 1.2), bannerMat);
    banner.position.set(0, yTop, z);
    banner.rotation.y = rot;
    banner.castShadow = rot === 0;
    g.add(banner);
  }
  return g;
}

/** Blue line painted across the snow, draped on the terrain. */
function snowLine(world: World, z: number, halfWidth: number, color: string, depth = 0.6): THREE.Mesh {
  const segs = Math.ceil(halfWidth * 2);
  const geo = new THREE.PlaneGeometry(halfWidth * 2, depth, segs, 1);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), zz = p.getZ(i) + z;
    p.setXYZ(i, x, world.terrain.height(x, zz) + 0.03, zz);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.receiveShadow = true;
  return m;
}

export function buildCourseMarkers(world: World): THREE.Group {
  const g = new THREE.Group();
  const sg = world.map.startGate;
  g.add(gate(world, sg.z, sg.halfWidth, 'FROSTLINE', '#e2452b', 3.6));
  const fin = world.map.finish;
  g.add(gate(world, fin.z, fin.halfWidth + 1, 'FINISH', '#1f5bff', 7));
  g.add(snowLine(world, fin.z, fin.halfWidth + 1, '#1f5bff', 0.9));
  g.add(snowLine(world, sg.z, sg.halfWidth, '#e2452b', 0.3));
  return g;
}

/** Minimal geometry merge (positions, normals, uvs) to avoid pulling in addons. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => g.toNonIndexed());
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
