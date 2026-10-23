// Meshes built by sampling the shared terrain, so visuals match the physics exactly.
// The base slope is one large grid; each feature gets its own dense grid aligned to its
// axis (with extra rows at lips and knuckles) drawn just on top of the base mesh.

import * as THREE from 'three';
import type { World } from '@shared/world';
import type { Feature } from '@shared/terrain/features';

const PISTE = new THREE.Color('#f7f9fd');
const OFFPISTE = new THREE.Color('#e3ebf6');
const PARK = new THREE.Color('#fbfcff');
const DYE = new THREE.Color('#1f5bff');

let snowTex: THREE.Texture | null = null;

/** Small procedural grain texture so snow doesn't look like plastic. */
function snowTexture(): THREE.Texture {
  if (snowTex) return snowTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < size * size; i++) {
    const v = 235 + rnd() * 20;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = Math.min(255, v + 4); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  snowTex = new THREE.CanvasTexture(c);
  snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
  snowTex.colorSpace = THREE.SRGBColorSpace;
  snowTex.anisotropy = 4;
  return snowTex;
}

function snowMaterial(extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    map: snowTexture(),
    ...extra,
  });
}

function gridIndices(cols: number, rows: number, keep?: (a: number, b: number, c: number) => boolean): number[] {
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      // Rows run downhill (-z) and columns to the right (+x), so (a, b, d) is
      // counter-clockwise seen from above (face normal up).
      if (!keep || keep(a, b, d) || keep(b, e, d)) {
        idx.push(a, b, d, b, e, d);
      }
    }
  }
  return idx;
}

/** Non-uniform coordinate list: fine spacing inside [a, b], coarse outside, within [lo, hi]. */
function axisSamples(lo: number, hi: number, a: number, b: number, fine: number, coarse: number): number[] {
  const out: number[] = [];
  for (let x = lo; x < a; x += coarse) out.push(x);
  for (let x = a; x < b; x += fine) out.push(x);
  for (let x = b; x <= hi; x += coarse) out.push(x);
  if (out[out.length - 1] < hi) out.push(hi);
  return out;
}

export function buildBaseTerrain(world: World): THREE.Mesh {
  const base = world.terrain.base;
  const hw = base.halfWidth;
  const X = hw + 70;
  const xs = axisSamples(-X, X, -hw - 6, hw + 6, 1, 2.5);
  const zs: number[] = [];
  for (let z = 50; z >= -(base.length + 60); z -= 1) zs.push(z);
  const cols = xs.length, rows = zs.length;
  const pos = new Float32Array(cols * rows * 3);
  const nrm = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const tmp = new THREE.Color();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const z = zs[r];
    for (let c = 0; c < cols; c++, i++) {
      const x = xs[c];
      const s = base.sample(x, z);
      pos[i * 3] = x; pos[i * 3 + 1] = s.h; pos[i * 3 + 2] = z;
      const l = 1 / Math.sqrt(s.dx * s.dx + 1 + s.dz * s.dz);
      nrm[i * 3] = -s.dx * l; nrm[i * 3 + 1] = l; nrm[i * 3 + 2] = -s.dz * l;
      const off = Math.min(1, Math.max(0, (Math.abs(x) - hw) / 4));
      tmp.copy(PISTE).lerp(OFFPISTE, off);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      uv[i * 2] = x / 6; uv[i * 2 + 1] = z / 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(gridIndices(cols, rows));
  const m = new THREE.Mesh(g, snowMaterial());
  m.receiveShadow = true;
  return m;
}

export function buildFeatureMesh(world: World, f: Feature): THREE.Mesh {
  const terrain = world.terrain;
  const us = new Set<number>();
  for (let u = f.uMin; u <= f.uMax; u += 0.2) us.add(Math.round(u * 1000) / 1000);
  for (const b of f.breaks) for (const d of [-0.01, 0, 0.01]) us.add(Math.round((b + d) * 1000) / 1000);
  const uList = [...us].filter((u) => u >= f.uMin && u <= f.uMax).sort((a, b) => a - b);
  const vList: number[] = [];
  for (let v = -f.vMax; v <= f.vMax + 1e-9; v += 0.25) vList.push(v);
  const cols = vList.length, rows = uList.length;
  const n = cols * rows;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const offs = new Float32Array(n);
  const dye = f.dyeRange;
  const hwK = f.def.type === 'jump' ? f.def.kickerWidth / 2 : f.def.type === 'kicker' ? f.def.width / 2 : 0;
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const u = uList[r];
    for (let c = 0; c < cols; c++, i++) {
      const v = vList[c];
      const w = f.toWorld(u, v);
      const s = terrain.sample(w.x, w.z);
      const b = terrain.base.sample(w.x, w.z).h;
      offs[i] = s.h - b;
      pos[i * 3] = w.x; pos[i * 3 + 1] = s.h; pos[i * 3 + 2] = w.z;
      nrm[i * 3] = s.n.x; nrm[i * 3 + 1] = s.n.y; nrm[i * 3 + 2] = s.n.z;
      const isDye = dye && u >= dye[0] && u <= dye[1] + 0.005 && Math.abs(v) <= hwK + 0.3 && s.feature >= 0 && offs[i] > 0.05;
      const cc = isDye ? DYE : PARK;
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      uv[i * 2] = w.x / 6; uv[i * 2 + 1] = w.z / 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(gridIndices(cols, rows, (a, b, c) => offs[a] > 0.004 || offs[b] > 0.004 || offs[c] > 0.004));
  const m = new THREE.Mesh(g, snowMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

export function buildRails(world: World): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#b9c2cc', metalness: 0.85, roughness: 0.3 });
  const post = new THREE.MeshStandardMaterial({ color: '#3b4452', metalness: 0.6, roughness: 0.5 });
  const boxTop = new THREE.MeshStandardMaterial({ color: '#ffb31a', roughness: 0.45 });
  const boxSide = new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.7 });
  const up = new THREE.Vector3(0, 1, 0);
  for (const r of world.rails) {
    for (const s of r.segs) {
      const a = new THREE.Vector3(s.a.x, s.a.y, s.a.z);
      const b = new THREE.Vector3(s.b.x, s.b.y, s.b.z);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a).normalize();
      if (r.kind === 'rail') {
        const rad = 0.045;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, s.len, 14), metal);
        tube.position.copy(mid).addScaledVector(up, -rad);
        tube.quaternion.setFromUnitVectors(up, dir);
        tube.castShadow = true;
        group.add(tube);
      } else {
        const h = 0.14;
        const box = new THREE.Mesh(new THREE.BoxGeometry(r.width, h, s.len), [boxSide, boxSide, boxTop, boxSide, boxSide, boxSide]);
        box.position.copy(mid).addScaledVector(up, -h / 2);
        const m = new THREE.Matrix4().lookAt(a, b, up);
        box.quaternion.setFromRotationMatrix(m);
        box.castShadow = true;
        group.add(box);
      }
    }
    // Posts down into the snow.
    const n = Math.max(2, Math.ceil(r.length / 2.6) + 1);
    for (let k = 0; k < n; k++) {
      const { p } = r.at((k / (n - 1)) * r.length * 0.96 + r.length * 0.02);
      const ground = world.terrain.height(p.x, p.z);
      const top = p.y - (r.kind === 'box' ? 0.14 : 0.08);
      const len = top - ground + 0.3;
      if (len <= 0.05) continue;
      const w = r.kind === 'box' ? 0.09 : 0.05;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), post);
      m.position.set(p.x, top - len / 2, p.z);
      m.castShadow = true;
      group.add(m);
    }
  }
  return group;
}
