// Mode transitions: ground/rail -> air, air -> ground, anything -> crash, -> rail.

import { PI, RAD, wrapAngle } from '../math/dmath';
import { rngRange } from '../math/rng';
import { type V3, vClone, vDot, vLen, vNeg, vNorm, vReject, vScale } from '../math/vec3';
import { PHYS } from './constants';
import type { Ctx } from './common';
import { bodyForward, frameQuat, yawOf } from './frame';
import { BTN } from './input';
import { type LandingJudgment, impactLoss } from './landing';
import { predictFlight } from './predict';
import { FAR, type RiderState, SKID, makeAirState } from './state';
import type { GroundSample } from '../terrain/terrain';

export interface AirStart {
  fromKicker?: boolean;
  fromRail?: boolean;
  /** Vertical pop to add at takeoff (m/s). */
  pop?: number;
  /** Up vector of the surface we leave (defaults to the ground normal). */
  up?: V3;
}

export function repredict(s: RiderState, c: Ctx): void {
  const p = predictFlight(c.w.terrain, s.pos, s.vel);
  const a = s.air;
  a.predTotal = a.t + p.time;
  a.predPoint = p.point;
  a.predNormal = p.normal;
}

export function initAir(s: RiderState, c: Ctx, o: AirStart = {}): void {
  const a = makeAirState();
  a.heading0 = s.heading;
  a.spinRate = s.turnRate;
  a.roll = -s.lean;
  a.frameUp = vClone(o.up ?? s.groundN);
  a.fromKicker = !!o.fromKicker;
  a.fromRail = !!o.fromRail;
  if (o.pop && o.pop > 0) {
    s.vel.y += o.pop;
    a.popped = true;
    c.ev.push({ type: 'pop', amount: o.pop });
  } else if ((c.held & BTN.POP) !== 0) {
    // Still holding Space as we leave: allow a slightly late pop.
    a.coyote = PHYS.popCoyote;
  }
  a.takeoffPos = vClone(s.pos);
  a.peakY = s.pos.y;
  s.mode = 'air';
  s.air = a;
  s.skidMode = SKID.NONE;
  s.pendingPop = 0;
  s.pendingPopTtl = 0;
  s.lipDist = FAR;
  repredict(s, c);
  c.ev.push({
    type: 'takeoff',
    speed: vLen(s.vel),
    fromKicker: a.fromKicker,
    fromRail: a.fromRail,
    predTime: a.predTotal,
  });
}

/** Ski yaw from the body forward vector, falling back to the air heading when skis point up/down. */
function landingHeading(s: RiderState): number {
  const f = bodyForward(s.q);
  if (f.x * f.x + f.z * f.z > 0.09) return yawOf(f);
  return s.air.heading0 + s.air.spin;
}

/** Touchdown that keeps the rider on their feet (clean, sketchy or a soft touch). */
export function landOnGround(s: RiderState, gs: GroundSample, j: LandingJudgment | null): void {
  const loss = j ? impactLoss(j.impact) : 0;
  s.vel = vScale(vReject(s.vel, gs.n), 1 - loss);
  s.pos.y = gs.h;
  s.heading = wrapAngle(landingHeading(s));
  s.switchStance = j ? j.switchLanding : vDot(bodyForward(s.q), s.vel) < 0;
  s.skidMode = j && j.quality === 'sketchy' ? SKID.SKETCHY : SKID.RELAX_CLEAN;
  s.wobble = j && j.quality === 'sketchy' ? 0.7 : 0;
  s.lean = 0;
  s.turnRate = 0;
  s.groundN = gs.n;
  s.mode = 'ground';
}

export function enterCrash(s: RiderState, c: Ctx, reason: string, impact: number, airborne: boolean, n?: V3): void {
  const f = bodyForward(s.q);
  const cr = s.crash;
  cr.t = 0;
  cr.reason = reason;
  cr.hard = impact > 12 || reason === 'head first' || reason === 'hit the rail' || reason === 'hit a wall';
  cr.back = vDot(f, s.vel) < 0;
  cr.airborne = airborne;
  cr.tumble = 0;
  cr.tumbleRate = rngRange(s, -1, 1) * (cr.hard ? 9 : 4);
  if (!airborne && n) {
    s.vel = vScale(vReject(s.vel, n), 1 - impactLoss(impact));
  }
  s.mode = 'crash';
  s.skidMode = SKID.NONE;
  s.tuck = 0;
  s.lean = 0;
  c.ev.push({ type: 'crash', reason, hard: cr.hard, impact });
}

export function enterRail(s: RiderState, c: Ctx, index: number, along: number, speed: number, switchStance: boolean): void {
  const r = c.w.rails[index];
  const at = r.at(along);
  const dir = r.segs[at.seg].dir;
  s.mode = 'rail';
  s.rail = { index, s: along, speed, switchStance, t: 0 };
  s.pos = at.p;
  s.vel = vScale(dir, speed);
  s.skidMode = SKID.NONE;
  s.lean = 0;
  s.turnRate = 0;
  s.air.grab = 0;
  const travel = speed >= 0 ? dir : vNeg(dir);
  s.heading = wrapAngle(yawOf(travel) + (switchStance ? PI : 0));
  s.q = frameQuat(railUp(dir), s.heading);
  c.ev.push({ type: 'railOn', index, speed: speed < 0 ? -speed : speed });
}

/** Up direction for a rider standing on a rail: perpendicular to the bar in the vertical plane. */
export function railUp(dir: V3): V3 {
  return vNorm({ x: -dir.y * dir.x, y: 1 - dir.y * dir.y, z: -dir.y * dir.z });
}

export const toDeg = (r: number) => r * RAD;
