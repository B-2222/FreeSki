// Ballistic flight prediction against the terrain (same gravity and drag as the sim).
// Used for the airborne landing prep, the trick camera and the map editor's arc preview.

import { type V3, v3, vClone } from '../math/vec3';
import type { Terrain } from '../terrain/terrain';
import { PHYS } from './constants';

export interface FlightPrediction {
  time: number;
  point: V3;
  normal: V3;
  /** Feature index at the landing point (-1 = slope). */
  feature: number;
  /** Peak height reached relative to the start (m). */
  peak: number;
}

export const dragK = (cda: number) => (0.5 * PHYS.airDensity * cda) / PHYS.mass;

export function predictFlight(terrain: Terrain, p0: V3, v0: V3, maxTime = 6, dt = 1 / 60, path?: V3[]): FlightPrediction {
  const p = vClone(p0);
  const v = vClone(v0);
  const k = dragK(PHYS.cdaStand);
  let t = 0;
  let peak = 0;
  while (t < maxTime) {
    const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    v.y -= PHYS.g * dt;
    const f = 1 - k * sp * dt;
    v.x *= f; v.y *= f; v.z *= f;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    t += dt;
    if (p.y - p0.y > peak) peak = p.y - p0.y;
    if (path) path.push(vClone(p));
    const g = terrain.sample(p.x, p.z);
    if (p.y <= g.h) {
      return { time: t, point: v3(p.x, g.h, p.z), normal: g.n, feature: g.feature, peak };
    }
  }
  return { time: maxTime, point: p, normal: v3(0, 1, 0), feature: -1, peak };
}
