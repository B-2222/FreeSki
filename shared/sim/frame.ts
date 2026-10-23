// Orientation helpers: building the rider's body frame from a surface normal and a yaw.

import { atan2, cos, sin } from '../math/dmath';
import { AXIS_FWD, AXIS_X, type Q, qAxisAngle, qFromBasis, qMul, qRotate } from '../math/quat';
import { type V3, vCross, vNeg, vNorm } from '../math/vec3';

/**
 * Body frame with up = `up` and ski yaw = `heading` (0 = -Z, + = left).
 * Forward is the tangent direction whose horizontal yaw is exactly `heading`.
 */
export function frameQuat(upIn: V3, heading: number): Q {
  const up = upIn.y < 0.15 ? vNorm({ x: upIn.x, y: 0.15, z: upIn.z }) : upIn;
  const sh = sin(heading), ch = cos(heading);
  const y = (sh * up.x + ch * up.z) / up.y;
  const f = vNorm({ x: -sh, y, z: -ch });
  const right = vNorm(vCross(f, up));
  return qFromBasis(right, up, vNeg(f));
}

/** Horizontal yaw of a direction (0 = -Z, + = left). */
export function yawOf(v: V3): number {
  return atan2(-v.x, -v.z);
}

/** Rotation about body right (+ = backflip direction). */
export const qFlip = (a: number): Q => qAxisAngle(AXIS_X, a);
/** Rotation about body forward (+ = roll to the right). */
export const qRoll = (a: number): Q => qAxisAngle(AXIS_FWD, a);

export const bodyForward = (q: Q): V3 => qRotate(q, AXIS_FWD);
export const bodyUp = (q: Q): V3 => qRotate(q, { x: 0, y: 1, z: 0 });
export const bodyRight = (q: Q): V3 => qRotate(q, AXIS_X);

/** Airborne pose: base frame, then flip about body right, then roll about body forward. */
export function poseQuat(up: V3, heading: number, flip: number, roll: number): Q {
  let q = frameQuat(up, heading);
  if (flip !== 0) q = qMul(q, qFlip(flip));
  if (roll !== 0) q = qMul(q, qRoll(roll));
  return q;
}
