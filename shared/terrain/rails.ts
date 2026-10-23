// Rails and boxes as polylines of riding-surface points.

import { type V3, vLen, vScale, vSub } from '../math/vec3';
import type { RailDef } from '../maps/types';
import type { BaseTerrain } from './baseTerrain';

export interface RailSegment {
  a: V3;
  b: V3;
  /** Unit direction a -> b. */
  dir: V3;
  len: number;
  /** Distance along the rail at a. */
  s0: number;
  /** Horizontal direction and length (for snapping tests). */
  hx: number;
  hz: number;
  hlen: number;
}

export class Rail {
  readonly id: string;
  readonly kind: 'rail' | 'box';
  readonly width: number;
  readonly points: V3[];
  readonly segs: RailSegment[];
  readonly length: number;
  /** Horizontal snap radius (m). */
  readonly snapRadius: number;

  constructor(def: RailDef, base: BaseTerrain) {
    this.id = def.id;
    this.kind = def.kind;
    this.width = def.kind === 'box' ? def.width ?? 0.5 : 0.08;
    this.snapRadius = def.kind === 'box' ? this.width / 2 + 0.2 : 0.35;
    this.points = def.nodes.map((n) => ({ x: n.x, y: base.sample(n.x, n.z).h + n.h, z: n.z }));
    this.segs = [];
    let s = 0;
    for (let i = 0; i + 1 < this.points.length; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const d = vSub(b, a);
      const len = vLen(d);
      const hlen = Math.sqrt(d.x * d.x + d.z * d.z);
      this.segs.push({ a, b, dir: vScale(d, 1 / len), len, s0: s, hx: d.x / hlen, hz: d.z / hlen, hlen });
      s += len;
    }
    this.length = s;
  }

  /** Point and segment at distance s along the rail (clamped). */
  at(s: number): { p: V3; seg: number } {
    const segs = this.segs;
    let i = 0;
    while (i < segs.length - 1 && s > segs[i].s0 + segs[i].len) i++;
    const g = segs[i];
    const t = Math.max(0, Math.min(g.len, s - g.s0));
    return { p: { x: g.a.x + g.dir.x * t, y: g.a.y + g.dir.y * t, z: g.a.z + g.dir.z * t }, seg: i };
  }

  /**
   * Closest point on the rail in the horizontal plane.
   * Returns horizontal distance, the rail height there, the distance s along the rail and the segment.
   */
  closestXZ(x: number, z: number): { dist: number; y: number; s: number; seg: number; t: number } {
    let best = { dist: Infinity, y: 0, s: 0, seg: 0, t: 0 };
    for (let i = 0; i < this.segs.length; i++) {
      const g = this.segs[i];
      const rx = x - g.a.x, rz = z - g.a.z;
      let th = (rx * g.hx + rz * g.hz) / g.hlen;
      th = th < 0 ? 0 : th > 1 ? 1 : th;
      const px = g.a.x + (g.b.x - g.a.x) * th;
      const pz = g.a.z + (g.b.z - g.a.z) * th;
      const dist = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
      if (dist < best.dist) {
        best = { dist, y: g.a.y + (g.b.y - g.a.y) * th, s: g.s0 + g.len * th, seg: i, t: th };
      }
    }
    return best;
  }
}
