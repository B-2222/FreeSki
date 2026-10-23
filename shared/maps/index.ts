import type { MapData } from './types';
import testSlope from './test-slope.json';

export const MAPS: Record<string, MapData> = {
  'test-slope': testSlope as MapData,
};

export type { MapData } from './types';
