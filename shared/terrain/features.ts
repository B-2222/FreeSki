// Analytic park features. Each feature lives in its own axis frame (u along the axis,
// v to the right) and adds a non-negative height offset on top of the base slope.
// Offsets come with exact gradients so the sim gets exact ground normals, even right
// at a kicker lip.

import { DEG, cos, sin, tan } from '../math/dmath';
import { smaxW, smooth01, smooth01d } from '../math/smooth';
import type { FeatureDef, JumpDef, KickerDef, OnrampDef } from '../maps/types';
import type { BaseTerrain } from './baseTerrain';

/** Offset profile along the axis: height H above the base and top half width hw, with d/du. */
interface Profile {
  H: number;
  dH: number;
  hw: number;
  dhw: number;
}

export interface FeatureHit {
  /** Height offset above the base slope. */
  c: number;
  /** Gradient of the offset in world x / z. */
  gx: number;
  gz: number;
  /** Distance to the lip along the axis if on a kicker transition, else Infinity. */
  lipDist: number;
  /** Axis coordinate (for debugging / editor). */
  u: number;
}

const SIDE_MIN = 0.35; // minimum side falloff width (m)

/**
 * Trapezoid-like cross section with smooth rounded edges: full height H inside |v| <= hw,
 * then a smooth fall to zero over a width proportional to H (so the side angle stays constant).
 */
function crossSection(
  v: number, H: number, hw: number, sideTanEff: number,
): { c: number; dcdH: number; dcdhw: number; dcdv: number } {
  if (H <= 0) return { c: 0, dcdH: 0, dcdhw: 0, dcdv: 0 };
  const av = v < 0 ? -v : v;
  const sv = v < 0 ? -1 : 1;
  const sw = H / sideTanEff + SIDE_MIN;
  const t = (av - hw) / sw;
  if (t <= 0) return { c: H, dcdH: 1, dcdhw: 0, dcdv: 0 };
  if (t >= 1) return { c: 0, dcdH: 0, dcdhw: 0, dcdv: 0 };
  const S = 1 - smooth01(t);
  const dS = -smooth01d(t);
  const dtdH = -t / sw / sideTanEff;
  return {
    c: H * S,
    dcdH: S + H * dS * dtdH,
    dcdhw: (H * dS * -1) / sw,
    dcdv: (H * dS * sv) / sw,
  };
}

/** smoothstep of max slope 1.5, so this gives the requested max side angle. */
const sideTanFor = (deg: number) => tan(deg * DEG) / 1.5;

interface SubShape {
  profile(u: number, b: number, db: number): Profile;
  sideTan: number;
  /** If set, this sub-shape is a kicker transition ending at uL. */
  uL?: number;
}

export class Feature {
  readonly id: string;
  readonly type: FeatureDef['type'];
  readonly def: FeatureDef;
  readonly ox: number;
  readonly oz: number;
  readonly heading: number;
  /** Axis direction (horizontal unit vector along u). */
  readonly dx: number;
  readonly dz: number;
  /** Right direction (horizontal unit vector along v). */
  readonly lx: number;
  readonly lz: number;
  uMin = 0;
  uMax = 0;
  vMax = 0;
  /** Key u positions (lip, knuckle...) used by the renderer to place extra mesh rows. */
  readonly breaks: number[] = [];
  /** Lip u position if the feature has a kicker. */
  uLip = Infinity;
  lipAngle = 0;
  /** Lip u range for the blue dye line. */
  readonly dyeRange: [number, number] | null = null;
  /** Landing landmarks along u for jumps: knuckle start/end and where the landing meets the slope. */
  knuckle0 = Infinity;
  knuckle1 = Infinity;
  landingEnd = Infinity;
  private readonly shapes: SubShape[] = [];

  constructor(def: FeatureDef, private readonly base: BaseTerrain) {
    this.id = def.id;
    this.type = def.type;
    this.def = def;
    this.ox = def.x;
    this.oz = def.z;
    this.heading = (def.heading ?? 0) * DEG;
    this.dx = -sin(this.heading);
    this.dz = -cos(this.heading);
    this.lx = cos(this.heading);
    this.lz = -sin(this.heading);
    switch (def.type) {
      case 'jump': this.buildJump(def); break;
      case 'kicker': this.buildKicker(def); break;
      case 'onramp': this.buildOnramp(def); break;
    }
    if (Number.isFinite(this.uLip)) this.dyeRange = [this.uLip - 0.35, this.uLip];
  }

  /** Base height and its slope along the axis at axis coordinate u (centre line). */
  private baseAlong(u: number): { b: number; db: number } {
    const s = this.base.sample(this.ox + this.dx * u, this.oz + this.dz * u);
    return { b: s.h, db: s.dx * this.dx + s.dz * this.dz };
  }

  /** Kicker transition (parabola from the base tangent to the lip angle). */
  private kickerCurve(lipHeight: number, lipAngle: number) {
    const { b: b0, db: g0 } = this.baseAlong(0);
    const tA = tan(lipAngle * DEG);
    const uL = (2 * lipHeight) / (tA - g0);
    const a = lipHeight / (uL * uL);
    const YL = b0 + g0 * uL + lipHeight;
    return {
      uL, YL, tA,
      J: (u: number) => b0 + g0 * u + a * u * u,
      dJ: (u: number) => g0 + 2 * a * u,
    };
  }

  private buildJump(d: JumpDef) {
    const k = this.kickerCurve(d.lipHeight, d.lipAngle);
    const { uL, YL } = k;
    const tFace = tan(60 * DEG);
    const tFront = tan(42 * DEG);
    const dd = d.deckDrop ?? 0.4;
    const tDeck = tan((d.deckAngle ?? 0) * DEG);
    const Kn = d.knuckle ?? 3;
    const tLand = tan(d.landingAngle * DEG);
    const kL = d.landingBlend ?? 1.6;
    const hwK = d.kickerWidth / 2;
    const hwD = d.deckWidth / 2;
    const hwL = d.landingWidth / 2;
    const sideTan = sideTanFor(d.sideAngle ?? 40);
    const uD = uL + dd / tFace; // bottom of the back face
    const uK0 = uL + Math.max(d.gap, dd / tFace + 0.5);
    const uK1 = uK0 + Kn;
    const YD = YL - dd;
    const YK0 = YD - tDeck * (uK0 - uD);
    const YK1 = YK0 - tDeck * Kn - 0.5 * (tLand - tDeck) * Kn;
    this.uLip = uL;
    this.lipAngle = d.lipAngle;

    // Kicker: transition up to the lip, then a steep back face.
    this.shapes.push({
      sideTan,
      uL,
      profile: (u, b, db) => {
        let J: number, dJ: number;
        if (u <= uL) { J = k.J(u); dJ = k.dJ(u); }
        else { J = YL - (u - uL) * tFace; dJ = -tFace; }
        const H = J - b;
        if (u < 0 || H <= 0) return { H: 0, dH: 0, hw: hwK, dhw: 0 };
        return { H, dH: dJ - db, hw: hwK, dhw: 0 };
      },
    });

    // Table: front face, deck, knuckle, landing (blended into the slope).
    const tableJ = (u: number): { J: number; dJ: number } => {
      if (u < uD) return { J: YD - (uD - u) * tFront, dJ: tFront };
      if (u < uK0) return { J: YD - tDeck * (u - uD), dJ: -tDeck };
      if (u < uK1) {
        const t = u - uK0;
        const c = (tLand - tDeck) / Kn;
        return { J: YK0 - tDeck * t - 0.5 * c * t * t, dJ: -tDeck - c * t };
      }
      return { J: YK1 - tLand * (u - uK1), dJ: -tLand };
    };
    const widthAt = (u: number): { hw: number; dhw: number } => {
      const a0 = uK0 - 1, a1 = uK1 + 4;
      const t = (u - a0) / (a1 - a0);
      return { hw: hwD + (hwL - hwD) * smooth01(t), dhw: ((hwL - hwD) * smooth01d(t)) / (a1 - a0) };
    };
    this.shapes.push({
      sideTan,
      profile: (u, b, db) => {
        const { J, dJ } = tableJ(u);
        const kk = u < uK0 ? 0.3 : kL;
        const m = smaxW(J, b, kk);
        const H = m.v - b;
        const w = widthAt(u);
        if (H <= 0) return { H: 0, dH: 0, hw: w.hw, dhw: w.dhw };
        return { H, dH: m.wa * dJ + (1 - m.wa) * db - db, hw: w.hw, dhw: w.dhw };
      },
    });

    // Extents: march backward for the front face foot, forward for the landing end.
    let uStart = 0;
    for (let u = uD; u > -40; u -= 0.25) {
      const { b } = this.baseAlong(u);
      if (tableJ(u).J < b - 0.3) { uStart = Math.min(0, u); break; }
    }
    let uEnd = uK1;
    for (let u = uK1; u < uK1 + 200; u += 0.25) {
      const { b } = this.baseAlong(u);
      uEnd = u;
      if (tableJ(u).J < b - kL) break;
    }
    this.knuckle0 = uK0;
    this.knuckle1 = uK1;
    this.landingEnd = uEnd;
    this.finishExtents(uStart - 0.5, uEnd + 0.5, Math.max(hwL, hwD, hwK));
    this.breaks.push(0, uL, uL + 0.02, uD, uK0, uK1);
  }

  private buildKicker(d: KickerDef) {
    const k = this.kickerCurve(d.lipHeight, d.lipAngle);
    const { uL, YL } = k;
    const tBack = tan((d.backAngle ?? 50) * DEG);
    const hw = d.width / 2;
    this.uLip = uL;
    this.lipAngle = d.lipAngle;
    this.shapes.push({
      sideTan: sideTanFor(d.sideAngle ?? 40),
      uL,
      profile: (u, b, db) => {
        if (u < 0) return { H: 0, dH: 0, hw, dhw: 0 };
        if (u <= uL) {
          const H = k.J(u) - b;
          return H > 0 ? { H, dH: k.dJ(u) - db, hw, dhw: 0 } : { H: 0, dH: 0, hw, dhw: 0 };
        }
        const J = YL - (u - uL) * tBack;
        const m = smaxW(J, b, 0.15);
        const H = m.v - b;
        return H > 0 ? { H, dH: m.wa * -tBack + (1 - m.wa) * db - db, hw, dhw: 0 } : { H: 0, dH: 0, hw, dhw: 0 };
      },
    });
    let uEnd = uL;
    for (let u = uL; u < uL + 30; u += 0.1) {
      uEnd = u;
      if (YL - (u - uL) * tBack < this.baseAlong(u).b - 0.15) break;
    }
    this.finishExtents(-0.5, uEnd + 0.5, hw);
    this.breaks.push(0, uL, uL + 0.02);
  }

  private buildOnramp(d: OnrampDef) {
    const { height: Hm, length: L, topLength: T } = d;
    const tBack = tan((d.backAngle ?? 65) * DEG);
    const hw = d.width / 2;
    const uTop = L + T;
    this.shapes.push({
      sideTan: sideTanFor(d.sideAngle ?? 40),
      profile: (u) => {
        if (u <= 0) return { H: 0, dH: 0, hw, dhw: 0 };
        if (u < L) return { H: Hm * smooth01(u / L), dH: (Hm * smooth01d(u / L)) / L, hw, dhw: 0 };
        if (u <= uTop) return { H: Hm, dH: 0, hw, dhw: 0 };
        const H = Hm - (u - uTop) * tBack;
        return H > 0 ? { H, dH: -tBack, hw, dhw: 0 } : { H: 0, dH: 0, hw, dhw: 0 };
      },
    });
    this.finishExtents(-0.5, uTop + Hm / tBack + 0.5, hw);
    this.breaks.push(0, L, uTop, uTop + 0.02);
  }

  private finishExtents(uMin: number, uMax: number, hwMax: number) {
    this.uMin = uMin;
    this.uMax = uMax;
    // Find the tallest offset along the axis to bound the side falloff.
    let Hmax = 0;
    for (let u = uMin; u <= uMax; u += 0.5) {
      const { b, db } = this.baseAlong(u);
      for (const s of this.shapes) Hmax = Math.max(Hmax, s.profile(u, b, db).H);
    }
    let maxSide = 0;
    for (const s of this.shapes) maxSide = Math.max(maxSide, Hmax / s.sideTan + SIDE_MIN);
    this.vMax = hwMax + maxSide + 0.5;
  }

  /** Local axis coordinates of a world point. */
  toLocal(x: number, z: number): { u: number; v: number } {
    const rx = x - this.ox, rz = z - this.oz;
    return { u: rx * this.dx + rz * this.dz, v: rx * this.lx + rz * this.lz };
  }

  toWorld(u: number, v: number): { x: number; z: number } {
    return { x: this.ox + this.dx * u + this.lx * v, z: this.oz + this.dz * u + this.lz * v };
  }

  /** Offset contribution at a world point, or null if outside the feature. */
  eval(x: number, z: number): FeatureHit | null {
    const rx = x - this.ox, rz = z - this.oz;
    const u = rx * this.dx + rz * this.dz;
    if (u < this.uMin || u > this.uMax) return null;
    const v = rx * this.lx + rz * this.lz;
    if (v > this.vMax || v < -this.vMax) return null;
    const { b, db } = this.baseAlong(u);
    let best: FeatureHit | null = null;
    for (const s of this.shapes) {
      const p = s.profile(u, b, db);
      if (p.H <= 0) continue;
      const cs = crossSection(v, p.H, p.hw, s.sideTan);
      if (cs.c <= 0 || (best && cs.c <= best.c)) continue;
      const dcdu = cs.dcdH * p.dH + cs.dcdhw * p.dhw;
      const dcdv = cs.dcdv;
      const onKicker = s.uL !== undefined && u >= 0 && u <= s.uL && cs.c > 0.05;
      best = {
        c: cs.c,
        gx: dcdu * this.dx + dcdv * this.lx,
        gz: dcdu * this.dz + dcdv * this.lz,
        lipDist: onKicker ? (s.uL as number) - u : Infinity,
        u,
      };
    }
    return best;
  }
}
