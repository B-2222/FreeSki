// Scalar helpers used by terrain shapes and the sim. All return values plus derivatives
// where terrain needs exact gradients.

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Cubic smoothstep on [0,1]. */
export function smooth01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** Derivative of smooth01 with respect to t. */
export function smooth01d(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return 6 * t * (1 - t);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  return smooth01((x - e0) / (e1 - e0));
}

/** Linear move of `cur` toward `target` by at most `maxStep`. */
export function moveToward(cur: number, target: number, maxStep: number): number {
  const d = target - cur;
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return target;
}

/**
 * Polynomial smooth max with compact support: equals max(a, b) once |a - b| >= k.
 * Returns the value and the weight of `a` in the gradient (weight of b is 1 - wa).
 */
export function smaxW(a: number, b: number, k: number): { v: number; wa: number } {
  if (k <= 1e-9) return a >= b ? { v: a, wa: 1 } : { v: b, wa: 0 };
  const d = a - b;
  if (d >= k) return { v: a, wa: 1 };
  if (d <= -k) return { v: b, wa: 0 };
  const h = k - (d < 0 ? -d : d);
  return { v: (a > b ? a : b) + (h * h) / (4 * k), wa: 0.5 + d / (2 * k) };
}
