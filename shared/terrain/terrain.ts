// Ground = base slope + the tallest feature offset at each point.
// sample() returns exact height, normal and feature info for the sim.

import type { V3 } from '../math/vec3';
import type { CourseDef, FeatureDef } from '../maps/types';
import { BaseTerrain } from './baseTerrain';
import { Feature } from './features';

export interface GroundSample {
  h: number;
  /** Unit surface normal. */
  n: V3;
  /** Height gradient. */
  dx: number;
  dz: number;
  powder: boolean;
  /** Index of the feature providing the surface, or -1 for plain slope. */
  feature: number;
  /** Distance to the kicker lip along its axis when riding a kicker transition, else Infinity. */
  lipDist: number;
}

export class Terrain {
  readonly base: BaseTerrain;
  readonly features: Feature[];

  constructor(course: CourseDef, features: FeatureDef[]) {
    this.base = new BaseTerrain(course);
    this.features = features.map((f) => new Feature(f, this.base));
  }

  sample(x: number, z: number): GroundSample {
    const b = this.base.sample(x, z);
    let h = b.h, dx = b.dx, dz = b.dz;
    let feature = -1;
    let lipDist = Infinity;
    let best = 0;
    for (let i = 0; i < this.features.length; i++) {
      const hit = this.features[i].eval(x, z);
      if (!hit || hit.c <= best) continue;
      best = hit.c;
      feature = i;
      lipDist = hit.lipDist;
      h = b.h + hit.c;
      dx = b.dx + hit.gx;
      dz = b.dz + hit.gz;
    }
    const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    return {
      h, dx, dz,
      n: { x: -dx * il, y: il, z: -dz * il },
      powder: feature < 0 && this.base.isPowder(x),
      feature,
      lipDist,
    };
  }

  height(x: number, z: number): number {
    return this.sample(x, z).h;
  }
}
