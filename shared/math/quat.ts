// Quaternion helpers for the simulation. Rider body axes: +X right, +Y up (head), -Z forward (ski tips).

import { cos, sin, acos } from './dmath';
import { type V3, vCross, vDot, vNorm } from './vec3';

export interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const qIdentity = (): Q => ({ x: 0, y: 0, z: 0, w: 1 });
export const qClone = (a: Q): Q => ({ x: a.x, y: a.y, z: a.z, w: a.w });
export const qCopy = (out: Q, a: Q): Q => {
  out.x = a.x; out.y = a.y; out.z = a.z; out.w = a.w;
  return out;
};

export function qMul(a: Q, b: Q): Q {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export const qConj = (a: Q): Q => ({ x: -a.x, y: -a.y, z: -a.z, w: a.w });

export function qNormalize(a: Q): Q {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w);
  if (l < 1e-12) return qIdentity();
  return { x: a.x / l, y: a.y / l, z: a.z / l, w: a.w / l };
}

/** Rotation of `angle` radians around unit `axis`. */
export function qAxisAngle(axis: V3, angle: number): Q {
  const h = angle * 0.5;
  const s = sin(h);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: cos(h) };
}

export function qRotate(q: Q, v: V3): V3 {
  // v' = v + 2w(u x v) + 2 u x (u x v)
  const ux = q.x, uy = q.y, uz = q.z, w = q.w;
  const tx = 2 * (uy * v.z - uz * v.y);
  const ty = 2 * (uz * v.x - ux * v.z);
  const tz = 2 * (ux * v.y - uy * v.x);
  return {
    x: v.x + w * tx + (uy * tz - uz * ty),
    y: v.y + w * ty + (uz * tx - ux * tz),
    z: v.z + w * tz + (ux * ty - uy * tx),
  };
}

/** Quaternion from an orthonormal basis (body axes expressed in world space). */
export function qFromBasis(right: V3, up: V3, back: V3): Q {
  const m00 = right.x, m10 = right.y, m20 = right.z;
  const m01 = up.x, m11 = up.y, m21 = up.z;
  const m02 = back.x, m12 = back.y, m22 = back.z;
  const tr = m00 + m11 + m22;
  let q: Q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return qNormalize(q);
}

/** Shortest rotation taking unit vector a onto unit vector b. */
export function qFromUnitVectors(a: V3, b: V3): Q {
  const d = vDot(a, b);
  if (d < -0.999999) {
    // Opposite: rotate 180 degrees around any perpendicular axis.
    let axis = vCross({ x: 1, y: 0, z: 0 }, a);
    if (axis.x * axis.x + axis.y * axis.y + axis.z * axis.z < 1e-6) axis = vCross({ x: 0, y: 0, z: 1 }, a);
    axis = vNorm(axis);
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }
  const c = vCross(a, b);
  return qNormalize({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}

export const qDot = (a: Q, b: Q): number => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

/** Normalized lerp along the shortest arc. */
export function qNlerp(a: Q, b: Q, t: number): Q {
  const s = qDot(a, b) < 0 ? -1 : 1;
  return qNormalize({
    x: a.x + (b.x * s - a.x) * t,
    y: a.y + (b.y * s - a.y) * t,
    z: a.z + (b.z * s - a.z) * t,
    w: a.w + (b.w * s - a.w) * t,
  });
}

/** Angle (radians) of the rotation between two orientations. */
export function qAngle(a: Q, b: Q): number {
  const d = Math.abs(qDot(a, b));
  return 2 * acos(d > 1 ? 1 : d);
}

export const AXIS_X: Readonly<V3> = Object.freeze({ x: 1, y: 0, z: 0 });
export const AXIS_Y: Readonly<V3> = Object.freeze({ x: 0, y: 1, z: 0 });
export const AXIS_Z: Readonly<V3> = Object.freeze({ x: 0, y: 0, z: 1 });
/** Body forward axis (ski tips). */
export const AXIS_FWD: Readonly<V3> = Object.freeze({ x: 0, y: 0, z: -1 });
