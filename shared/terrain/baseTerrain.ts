// The base slope: a fall-line profile (piecewise quadratic height, continuous slope)
// with a groomed piste that rises into banks at the sides, plus gentle analytic
// undulation off-piste. Everything returns exact gradients.

import { DEG, cos, sin, tan } from '../math/dmath';
import { smooth01, smooth01d } from '../math/smooth';
import type { CourseDef } from '../maps/types';

export interface HeightSample {
  h: number;
  /** dh/dx */
  dx: number;
  /** dh/dz */
  dz: number;
}

export class BaseTerrain {
  readonly halfWidth: number;
  readonly length: number;
  private readonly s: number[];
  private readonly g: number[]; // descent gradient tan(slope) at knots
  private readonly G: number[]; // cumulative descent at knots
  private readonly top: number;
  private readonly bermR: number;
  private readonly bermTan: number;
  private readonly bermD: number;
  private readonly bermRise: number;
  private readonly undulation: number;

  constructor(def: CourseDef) {
    this.top = def.topHeight;
    this.halfWidth = def.halfWidth;
    this.length = def.length;
    this.s = def.profile.map((k) => k[0]);
    this.g = def.profile.map((k) => tan(k[1] * DEG));
    this.G = [0];
    for (let i = 1; i < this.s.length; i++) {
      const L = this.s[i] - this.s[i - 1];
      this.G.push(this.G[i - 1] + L * 0.5 * (this.g[i - 1] + this.g[i]));
    }
    this.bermR = def.bermRadius ?? 16;
    this.bermTan = tan((def.bermAngle ?? 34) * DEG);
    this.bermD = this.bermR * this.bermTan;
    this.bermRise = (this.bermD * this.bermD) / (2 * this.bermR);
    this.undulation = def.undulation ?? 1.2;
  }

  /** Descent G(s) and gradient g(s) along the fall line. */
  private profile(s: number): { G: number; g: number } {
    const S = this.s;
    const n = S.length;
    if (s <= S[0]) return { G: this.g[0] * (s - S[0]), g: this.g[0] };
    if (s >= S[n - 1]) return { G: this.G[n - 1] + this.g[n - 1] * (s - S[n - 1]), g: this.g[n - 1] };
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= s) lo = mid;
      else hi = mid;
    }
    const L = S[hi] - S[lo];
    const t = s - S[lo];
    const k = (this.g[hi] - this.g[lo]) / L;
    return { G: this.G[lo] + this.g[lo] * t + 0.5 * k * t * t, g: this.g[lo] + k * t };
  }

  /** Slope descent angle gradient (tan) along the fall line at distance s. */
  gradientAt(s: number): number {
    return this.profile(s).g;
  }

  sample(x: number, z: number): HeightSample {
    const s = -z;
    const p = this.profile(s);
    let h = this.top - p.G;
    // d/dz of (top - G(-z)) = g(s)
    let dz = p.g;
    let dx = 0;

    const ax = x < 0 ? -x : x;
    const sx = x < 0 ? -1 : 1;
    const d = ax - this.halfWidth;
    if (d > 0) {
      // Banks: circular-ish rise, then a constant angle.
      let rise: number;
      let drise: number;
      if (d < this.bermD) {
        rise = (d * d) / (2 * this.bermR);
        drise = d / this.bermR;
      } else {
        rise = this.bermRise + (d - this.bermD) * this.bermTan;
        drise = this.bermTan;
      }
      h += rise;
      dx += drise * sx;

      // Off-piste undulation, faded in from the piste edge.
      const A = this.undulation;
      if (A > 0) {
        const wt = (d - 1) / 10;
        const w = smooth01(wt);
        const dw = smooth01d(wt) / 10;
        if (w > 0) {
          const a1 = 0.13 * x + 1.3, b1 = 0.071 * z;
          const a2 = 0.29 * x - 0.083 * z + 0.4, b2 = 0.19 * z + 0.11 * x;
          const n1 = sin(a1) * sin(b1);
          const n2 = 0.45 * sin(a2) * cos(b2);
          const nv = n1 + n2;
          const ndx = 0.13 * cos(a1) * sin(b1) + 0.45 * (0.29 * cos(a2) * cos(b2) - 0.11 * sin(a2) * sin(b2));
          const ndz = 0.071 * sin(a1) * cos(b1) + 0.45 * (-0.083 * cos(a2) * cos(b2) - 0.19 * sin(a2) * sin(b2));
          h += A * w * nv;
          dx += A * (dw * sx * nv + w * ndx);
          dz += A * w * ndz;
        }
      }
    }
    return { h, dx, dz };
  }

  /** True if (x, z) is off the groomed piste (deep snow). */
  isPowder(x: number): boolean {
    return (x < 0 ? -x : x) > this.halfWidth + 1.5;
  }
}
