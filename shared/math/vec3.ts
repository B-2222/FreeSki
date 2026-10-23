// Minimal 3D vector helpers for the simulation (no Three.js in /shared).
// World axes: +Y up, the fall line runs toward -Z, +X is to the right when looking downhill.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const vClone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const vCopy = (out: V3, a: V3): V3 => {
  out.x = a.x; out.y = a.y; out.z = a.z;
  return out;
};
export const vSet = (out: V3, x: number, y: number, z: number): V3 => {
  out.x = x; out.y = y; out.z = z;
  return out;
};
export const vAdd = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vSub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vScale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
/** a + b * s */
export const vAddScaled = (a: V3, b: V3, s: number): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const vDot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vCross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vLen = (a: V3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vLenSq = (a: V3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const vLenXZ = (a: V3): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const vNorm = (a: V3, fallback: V3 = { x: 0, y: 1, z: 0 }): V3 => {
  const l = vLen(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l, z: a.z / l } : vClone(fallback);
};
export const vLerp = (a: V3, b: V3, t: number): V3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const vNeg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z });
/** Remove the component of a along unit vector n. */
export const vReject = (a: V3, n: V3): V3 => vAddScaled(a, n, -vDot(a, n));
export const vDist = (a: V3, b: V3): number => vLen(vSub(a, b));

export const UP: Readonly<V3> = Object.freeze({ x: 0, y: 1, z: 0 });
