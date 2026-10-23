// Rider state. Plain data only (no classes, no Infinity/NaN) so it can be cloned,
// hashed and serialised for replays and server verification.

import { type Q, qIdentity } from '../math/quat';
import { type V3, v3 } from '../math/vec3';
import type { World } from '../world';
import { frameQuat } from './frame';

export type RiderMode = 'ground' | 'air' | 'rail' | 'crash';

export const SKID = { NONE: 0, BRAKE: 1, RELAX_BRAKE: 2, RELAX_CLEAN: 3, SKETCHY: 4 } as const;

/** "No lip nearby" marker for lipDist. */
export const FAR = 1e9;

export interface AirState {
  t: number;
  /** Ski yaw at takeoff (rad). */
  heading0: number;
  spin: number;
  spinRate: number;
  flip: number;
  flipRate: number;
  roll: number;
  rollRate: number;
  /** Latched settle targets (valid when the matching flag is set). */
  spinTarget: number;
  flipTarget: number;
  rollTarget: number;
  spinSettling: boolean;
  flipSettling: boolean;
  rollSettling: boolean;
  /** Base frame "up" for the airborne pose (trajectory normal blended to landing normal). */
  frameUp: V3;
  takeoffPos: V3;
  peakY: number;
  /** Predicted total air time from takeoff and landing point / normal. */
  predTotal: number;
  predPoint: V3;
  predNormal: V3;
  fromKicker: boolean;
  fromRail: boolean;
  popped: boolean;
  /** Late-pop window left (s). */
  coyote: number;
  inverted: boolean;
  inversions: number;
  /** Active grab id (GRAB) and how long it has been held. */
  grab: number;
  grabHeld: number;
  /** Longest continuous hold per grab id this air (index = grab id). */
  grabTimes: number[];
}

export interface RailState {
  index: number;
  s: number;
  speed: number;
  switchStance: boolean;
  t: number;
}

export interface CrashState {
  t: number;
  hard: boolean;
  /** True = sliding on the back (after a switch/backward crash). */
  back: boolean;
  airborne: boolean;
  tumble: number;
  tumbleRate: number;
  reason: string;
}

export interface RiderState {
  tick: number;
  mode: RiderMode;
  /** Ski base position (feet on the snow). */
  pos: V3;
  vel: V3;
  /** Body orientation (body -> world). */
  q: Q;
  /** Ski yaw (rad), 0 = straight down the fall line (-Z), positive = left. */
  heading: number;
  switchStance: boolean;
  /** Smoothed steer input, -1 left .. 1 right. */
  steer: number;
  /** Actual yaw rate of travel (rad/s, + = left). */
  turnRate: number;
  /** Carve lean (rad, + = leaning left). */
  lean: number;
  tuck: number;
  crouch: number;
  spaceHold: number;
  skidMode: number;
  brakeSide: number;
  lastTurnSign: number;
  /** Sketchy-landing wobble timer (s). */
  wobble: number;
  poleTimer: number;
  /** Pole plant animation phase (counts down from 1). */
  poleAnim: number;
  pendingPop: number;
  pendingPopTtl: number;
  groundN: V3;
  onPowder: boolean;
  lipDist: number;
  air: AirState;
  rail: RailState;
  crash: CrashState;
  railCooldownIndex: number;
  railCooldown: number;
  restartHold: number;
  restartLatch: boolean;
  prevButtons: number;
  started: boolean;
  finished: boolean;
  runTime: number;
  rng: number;
}

export function makeAirState(): AirState {
  return {
    t: 0, heading0: 0,
    spin: 0, spinRate: 0, flip: 0, flipRate: 0, roll: 0, rollRate: 0,
    spinTarget: 0, flipTarget: 0, rollTarget: 0,
    spinSettling: false, flipSettling: false, rollSettling: false,
    frameUp: v3(0, 1, 0), takeoffPos: v3(), peakY: 0,
    predTotal: 0, predPoint: v3(), predNormal: v3(0, 1, 0),
    fromKicker: false, fromRail: false, popped: false, coyote: 0,
    inverted: false, inversions: 0,
    grab: 0, grabHeld: 0, grabTimes: [0, 0, 0, 0, 0, 0],
  };
}

export function createRider(world: World, seed = 1): RiderState {
  const s: RiderState = {
    tick: 0,
    mode: 'ground',
    pos: v3(), vel: v3(), q: qIdentity(),
    heading: 0, switchStance: false,
    steer: 0, turnRate: 0, lean: 0, tuck: 0, crouch: 0, spaceHold: 0,
    skidMode: SKID.NONE, brakeSide: 1, lastTurnSign: 1, wobble: 0,
    poleTimer: 0, poleAnim: 0,
    pendingPop: 0, pendingPopTtl: 0,
    groundN: v3(0, 1, 0), onPowder: false, lipDist: FAR,
    air: makeAirState(),
    rail: { index: -1, s: 0, speed: 0, switchStance: false, t: 0 },
    crash: { t: 0, hard: false, back: false, airborne: false, tumble: 0, tumbleRate: 0, reason: '' },
    railCooldownIndex: -1, railCooldown: 0,
    restartHold: 0, restartLatch: false,
    prevButtons: 0,
    started: false, finished: false, runTime: 0,
    rng: seed | 0,
  };
  resetToSpawn(s, world);
  return s;
}

/** Put the rider back at the start gate (keeps tick, rng and input edge state). */
export function resetToSpawn(s: RiderState, world: World): void {
  const sp = world.spawn;
  const g = world.terrain.sample(sp.x, sp.z);
  s.mode = 'ground';
  s.pos = v3(sp.x, g.h, sp.z);
  s.vel = v3();
  s.heading = sp.heading;
  s.switchStance = false;
  s.steer = 0; s.turnRate = 0; s.lean = 0; s.tuck = 0; s.crouch = 0; s.spaceHold = 0;
  s.skidMode = SKID.NONE; s.wobble = 0; s.poleTimer = 0; s.poleAnim = 0;
  s.pendingPop = 0; s.pendingPopTtl = 0;
  s.groundN = g.n; s.onPowder = g.powder; s.lipDist = FAR;
  s.air = makeAirState();
  s.rail = { index: -1, s: 0, speed: 0, switchStance: false, t: 0 };
  s.crash = { t: 0, hard: false, back: false, airborne: false, tumble: 0, tumbleRate: 0, reason: '' };
  s.railCooldownIndex = -1; s.railCooldown = 0;
  s.restartHold = 0;
  s.started = false; s.finished = false; s.runTime = 0;
  s.q = frameQuat(g.n, s.heading);
}
