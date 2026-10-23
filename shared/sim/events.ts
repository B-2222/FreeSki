// Events emitted by the sim each tick. The client uses them for HUD, FX and sound;
// scoring (milestone 2) will consume them too.

export type LandQuality = 'clean' | 'sketchy' | 'crash';

export interface LandEvent {
  type: 'land';
  quality: LandQuality;
  /** Signed spin (deg, + = left / counter-clockwise from above). */
  spinDeg: number;
  /** Signed flip (deg, + = backflip) and roll (deg, + = right). */
  flipDeg: number;
  rollDeg: number;
  inversions: number;
  airTime: number;
  /** Peak height above takeoff (m). */
  height: number;
  /** Normal impact speed (m/s). */
  impact: number;
  smack: boolean;
  switchLanding: boolean;
  /** Longest hold per grab id. */
  grabTimes: number[];
  grabbingAtLanding: boolean;
  yawErr: number;
  pitchErr: number;
  rollErr: number;
  reason: string;
  fromKicker: boolean;
  fromRail: boolean;
}

export type SimEvent =
  | { type: 'takeoff'; speed: number; fromKicker: boolean; fromRail: boolean; predTime: number }
  | { type: 'pop'; amount: number }
  | { type: 'pole' }
  | LandEvent
  | { type: 'touch' }
  | { type: 'crash'; reason: string; hard: boolean; impact: number }
  | { type: 'recover' }
  | { type: 'railOn'; index: number; speed: number }
  | { type: 'railOff'; index: number; time: number }
  | { type: 'restart' }
  | { type: 'start' }
  | { type: 'finish'; time: number };
