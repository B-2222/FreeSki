// Physics and feel constants. Values that differ from the spec are explained in TUNING.md.

import { DEG } from '../math/dmath';

/** Fixed simulation timestep (120 Hz). */
export const HZ = 120;
export const DT = 1 / HZ;

export const PHYS = {
  g: 9.81,
  mass: 80,
  airDensity: 1.2,
  cdaStand: 0.55,
  cdaTuck: 0.32,
  muGroomed: 0.04,
  muPowder: 0.09,
  /** Below this tangential gravity / normal ratio a stopped rider stays put. */
  muStatic: 0.05,

  // Steering / carving
  steerRise: 0.09,
  steerFall: 0.07,
  carveRadiusMax: 32,
  carveRadiusMin: 7.5,
  carveRadiusMinTuck: 10,
  carveMaxLatG: 1.9,
  carveMaxLatGTuck: 1.4,
  pivotRate: 1.8,
  pivotFadeSpeed: 9,
  /** Edge grip: lateral velocity relative to the skis decays with this time constant. */
  gripTau: 0.03,
  /** Max carve lean (rad). */
  maxLean: 55 * DEG,
  kickerSteerScale: 0.2,
  /** Steering is damped on a kicker transition within this distance of the lip (m). */
  kickerSteerZone: 6,

  // Tuck / poling
  tuckMinSpeed: 6,
  poleMaxSpeed: 6,
  poleImpulse: 0.9,
  polePeriod: 0.55,
  poleMaxUphill: 2 * DEG,

  // Braking / skids
  brakeMu: 0.55,
  brakeAngle: 75 * DEG,
  brakeSteerRate: 0.8,
  skidMu: 0.45,

  // Pop
  popMax: 2.2,
  popMinFactor: 0.3,
  popFullHold: 0.35,
  popLipBest: 0.5,
  popLipWindow: 3.0,
  popLipMinFactor: 0.4,
  popCoyote: 0.06,
  popCoyoteFactor: 0.7,

  // Ground following
  snapBase: 0.012,
  snapSlope: 0.07,
  wallAngle: 30 * DEG,
  wallCrashSpeed: 9,

  // Air rotation (rad/s)
  spinRate: 540 * DEG,
  flipRate: 400 * DEG,
  rollRate: 400 * DEG,
  grabBoost: 1.15,
  rotResponseTau: 0.035,
  settleTau: 0.07,
  settleResponseTau: 0.03,
  settleLookahead: 0.09,
  settleMaxSpin: 6,
  settleMaxFlip: 5,
  /** Airs shorter than this with no pop / kicker / rail are treated as soft touches. */
  minorAirTime: 0.3,

  // Grabs
  grabCountTime: 0.25,
  grabFullTime: 1.0,

  // Landing (degrees / m/s)
  cleanYaw: 20,
  sketchyYaw: 70,
  cleanPitch: 45,
  sketchyPitch: 60,
  cleanRoll: 25,
  sketchyRoll: 50,
  /** Rotation keeps going this long after touchdown, so landing mid-rotation over-rotates (s). */
  landingCarry: 0.06,
  smackImpact: 6,
  hardImpact: 10,
  crashImpact: 14,
  impactLossPerMs: 0.03,
  impactLossMax: 0.35,

  // Crash
  crashMu: 0.35,
  crashTime: 1.5,
  crashMaxSpeedAfter: 4,

  // Rails
  railMu: 0.02,
  railMaxRise: 0.8,
  railAlign: 60 * DEG,
  railHitRadius: 0.25,
  railCooldown: 0.12,

  restartHoldTime: 2.0,
};
