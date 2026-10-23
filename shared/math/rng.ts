// Seeded RNG (mulberry32). Integer math only, so it is deterministic everywhere.
// The sim stores the 32-bit state in RiderState so replays and the server reproduce it.

export function rngNext(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [lo, hi). */
export function rngRange(state: { rng: number }, lo: number, hi: number): number {
  return lo + (hi - lo) * rngNext(state);
}
