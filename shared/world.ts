// A compiled map: terrain, rails and course markers. Pure data + analytic functions,
// shared by the client renderer, the sim and (later) the server.

import { DEG } from './math/dmath';
import type { MapData } from './maps/types';
import { Rail } from './terrain/rails';
import { Terrain } from './terrain/terrain';

export interface World {
  map: MapData;
  terrain: Terrain;
  rails: Rail[];
  spawn: { x: number; z: number; heading: number };
  gateZ: number;
  finishZ: number;
}

export function buildWorld(map: MapData): World {
  const terrain = new Terrain(map.course, map.features);
  const rails = map.rails.map((r) => new Rail(r, terrain.base));
  return {
    map,
    terrain,
    rails,
    spawn: { x: map.spawn.x, z: map.spawn.z, heading: map.spawn.heading * DEG },
    gateZ: map.startGate.z,
    finishZ: map.finish.z,
  };
}
