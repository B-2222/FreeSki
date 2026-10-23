// Landing judgment: compare ski direction with travel direction and ski angle with the
// ground normal at touchdown.

import { RAD, acos, asin } from '../math/dmath';
import type { Q } from '../math/quat';
import { type V3, vDot, vLen, vReject, vScale } from '../math/vec3';
import { PHYS } from './constants';
import type { LandQuality } from './events';
import { bodyForward, bodyRight, bodyUp } from './frame';

export interface LandingJudgment {
  quality: LandQuality;
  /** Ski direction vs travel direction (deg, 0..90, switch folded in). */
  yawErr: number;
  /** Ski pitch relative to the ground (deg, + = tips up). */
  pitchErr: number;
  /** Ski roll relative to the ground (deg). */
  rollErr: number;
  /** Normal impact speed (m/s, >= 0). */
  impact: number;
  switchLanding: boolean;
  reason: string;
}

export function judgeLanding(q: Q, vel: V3, n: V3, grabbing: boolean): LandingJudgment {
  const f = bodyForward(q);
  const u = bodyUp(q);
  const r = bodyRight(q);
  const impact = Math.max(0, -vDot(vel, n));
  const pitchErr = asin(vDot(f, n)) * RAD;
  const rollErr = asin(vDot(r, n)) * RAD;

  const vt = vReject(vel, n);
  const vtl = vLen(vt);
  const fp = vReject(f, n);
  const fpl = vLen(fp);
  let yawErr = 0;
  let switchLanding = false;
  if (vtl > 0.5 && fpl > 1e-3) {
    const c = vDot(vScale(fp, 1 / fpl), vScale(vt, 1 / vtl));
    switchLanding = c < 0;
    yawErr = acos(c < 0 ? -c : c) * RAD;
  }

  const ap = pitchErr < 0 ? -pitchErr : pitchErr;
  const ar = rollErr < 0 ? -rollErr : rollErr;
  let quality: LandQuality = 'clean';
  let reason = '';
  if (vDot(u, n) < 0.25) { quality = 'crash'; reason = 'upside down'; }
  else if (yawErr > PHYS.sketchyYaw) { quality = 'crash'; reason = 'sideways'; }
  else if (ap > PHYS.sketchyPitch) { quality = 'crash'; reason = pitchErr > 0 ? 'on the tails' : 'on the tips'; }
  else if (ar > PHYS.sketchyRoll) { quality = 'crash'; reason = 'on the edge'; }
  else if (impact > PHYS.crashImpact) { quality = 'crash'; reason = 'impact'; }
  else if (yawErr > PHYS.cleanYaw || ap > PHYS.cleanPitch || ar > PHYS.cleanRoll) { quality = 'sketchy'; reason = 'off axis'; }
  else if (impact > PHYS.hardImpact) { quality = 'sketchy'; reason = 'hard landing'; }

  if (grabbing && quality !== 'crash') {
    // Still holding a grab at touchdown: you didn't open up for the landing.
    quality = quality === 'clean' ? 'sketchy' : 'crash';
    reason = 'still grabbing';
  }
  return { quality, yawErr, pitchErr, rollErr, impact, switchLanding, reason };
}

/** Fraction of tangential speed lost to the landing impact. */
export function impactLoss(impact: number): number {
  const l = (impact - 5) * PHYS.impactLossPerMs;
  return l < 0 ? 0 : l > PHYS.impactLossMax ? PHYS.impactLossMax : l;
}
